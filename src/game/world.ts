import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import { detailKindForTheme, generateTexture, generateTextures, type TexSpec } from './textures';
import { surfaceMaterial } from './materials';
import { mulberry32, type Path, type Sample, type TrackData, type Obstacle } from './trackBuilder';
import { addProps, type Emitter } from './props';
import { addMechProps } from './mechProps';
import { addSciFi, oceanWindowMaterial } from './scifi';
import { treeMaterial } from './foliage';
import { TUNNEL_DECK } from './physics';
import { addTrackDetail } from './trackDetail';
import { StaticBatcher } from './trackMesh';
import { airshipGeometry, pylonGeometry, cactusGeometry, crystalClusterGeometry, jungleTreeGeometry, mesaGeometry, pineGeometry, rockGeometry, spireGeometry } from './decorGeo';
import { addSkyline, buildTerrain, makeTerrainField } from './terrain';
import { buildSetPieces, type SetPieceFx } from './setPieces';
import { addLandmarks } from './landmarks';
import { lavaSeaMaterial, layersFor, STRATA, terrainMaterial, waterMaterial } from './terrainMaterial';
import { buildGroundCover } from './groundCover';
import { buildSmoke, type SmokeSrc } from './smoke';
import { buildLife, type LifeAudio, type PodPos } from './wildlife';
import { addWaterfalls, type CascadeSpot } from './waterfalls';
import type { PodState } from './physics';

// cheap 2D value noise
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f) * a; a *= 0.5; f *= 2.02; } return s; }
export function ridged(x: number, y: number, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); s += n * n * a; a *= 0.5; f *= 2.03; } return s; }
export const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface WorldTimings { texMs: number; trackMs: number; terrainMs: number; coverMs: number; totalMs: number; coverCount: number; lifeCount: number }

export interface World {
  breakObstacle: (o: Obstacle) => void; setLodBias: (v: number) => void;
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  update: (t: number, cam?: THREE.Vector3, pods?: PodPos[]) => void;
  flashField: (x: number, y: number, z: number, strength?: number) => void;
  nearAudio: (pos: THREE.Vector3, out: LifeAudio) => void;
  cascades: CascadeSpot[];
  timings: WorldTimings;
  tvCams: THREE.Vector3[];
  glossy: THREE.Mesh[];
  emitters: Emitter[];
  setPieces: { update: (t: number, raceTime: number, pods: PodState[], dt: number, frozen: boolean) => SetPieceFx[] };
  dispose: () => void;
}

const yield_ = () => new Promise(r => setTimeout(r, 0));

/** The large texture sets a world needs – exported so Game can start synthesising them before the renderer is even initialised. */
export function worldTextureSpecs(theme: ThemeDef, gfx: GfxSettings): TexSpec[] {
  const P = theme.palette, texRes = gfx.texRes, TL = layersFor(theme.id), lres = Math.min(1024, texRes);
  const specs: TexSpec[] = [
    { kind: theme.road, palette: P.road, size: texRes, seed: 11 }, { kind: theme.wall, palette: P.wall, size: texRes, seed: 22 },
    { kind: theme.ground, palette: P.ground, size: texRes, seed: 33, emissive: theme.emissiveGround },
    { kind: 'gravel', palette: TL.gravel, size: lres, seed: 57 }, { kind: 'cracked', palette: TL.basin, size: lres, seed: 68, emissive: TL.basinEmissive },
  ];
  if (TL.cliff) specs.push({ kind: 'rock', palette: TL.cliff, size: texRes, seed: 79 });
  return specs;
}

export async function buildWorld(td: TrackData, theme: ThemeDef, gfx: GfxSettings, progress: (p: number, msg: string) => void): Promise<World> {
  const tStart = performance.now();
  const group = new THREE.Group();
  const rng = mulberry32(1234 + td.N);
  const geoQ = gfx.geometry;
  const aniso = gfx.anisotropy ?? 8;
  const disposables: { dispose: () => void }[] = [];
  const glossy: THREE.Mesh[] = [];

  progress(0.05, 'Generiere UHD-Texturen …'); await yield_();
  const tTex0 = performance.now();
  // Session 13: all large texture sets are synthesised in parallel workers while the main thread already builds the terrain field
  const TL = layersFor(theme.id);
  const specs = worldTextureSpecs(theme, gfx);
  const texJob = generateTextures(specs, aniso);
  const field = makeTerrainField(td, theme); const { heightAt, nearest, roadClear, avgY } = field;
  const [roadTex, wallTex, groundTex, gravelTex, basinTex, cliffT] = await texJob; const cliffTex = cliffT ?? wallTex;
  const texMs = Math.round(performance.now() - tTex0);
  await yield_();

  const T = theme.terrain;
  const waterY = T === 'lava' ? Math.min(avgY - 14, td.bounds.minY - 8) : (T === 'jungle' || theme.id === 'ice') ? Math.min(avgY - 12, td.bounds.minY - 12) : T === 'ocean' ? (td.seaY ?? avgY - 26) : -1e9;

  const plx = gfx.parallax && (gfx.shaderDetail ?? 1) > 0 ? 1 : 0; const layers = (gfx.shaderDetail ?? 1) >= 2 ? 14 : 8;
  const bump = gfx.bumpMapping ?? true; const disp = (gfx.tessellation ?? 0) > 0 ? ((gfx.tessellation ?? 0) >= 2 ? 0.4 : 0.22) : 0;
  const roadDispOff = Math.min(0.08, disp * 0.22); // exact max offset of edge-locked road micro-relief
  const hwAvg = td.main.samples.reduce((acc, q) => acc + q.hw, 0) / td.N;
  const wallLedge = TL.ledgeColor && TL.ledgeAmt ? { color: TL.ledgeColor, amount: TL.ledgeAmt, rough: theme.id === 'ice' ? 0.66 : 0.86 } : undefined;
  const roadMat = surfaceMaterial(roadTex, {
    cloud: theme.clouds * 0.4, parallax: plx * 0.026, layers,
    wet: theme.ambient === 'rain' ? 0.85 : theme.road === 'mud' ? 0.14 : 0,
    puddles: theme.ambient === 'rain' ? 0.38 : 0.24, rain: theme.ambient === 'rain',
    snow: theme.id === 'ice' ? 1 : theme.ambient === 'snow' ? 0.7 : 0, macro: 0.14, detail: 0.42, bump, displace: disp,
    micro: 0.92, microScale: [(2 * hwAvg) / 1.7, Math.max(24, hwAvg * 1.4) / 1.7],
    envMapIntensity: theme.road === 'ice' ? 1.6 : 0.65, emissive: theme.barrierColor, emissiveIntensity: 1.2,
  });
  // Note: displace=0 on wallMat keeps road-to-skirt joints, cliffs, tunnels, arches & pillars 100% seam-free!
  const wallMat = surfaceMaterial(wallTex, {
    strata: STRATA[theme.id], ledge: wallLedge, detailKind: detailKindForTheme(theme.id),
    cloud: theme.clouds * 0.4, parallax: plx * 0.045, layers, normalScale: 1.5,
    macro: 0.3, detail: 0.62, bump, displace: 0, micro: 0.65, microScale: [18 / 1.7, 18 / 1.7],
    emissive: theme.id === 'crystal' ? '#c87aff' : theme.id === 'oovo' ? '#a060ff' : '#ff5a10',
    emissiveIntensity: theme.id === 'crystal' ? 0.8 : theme.id === 'oovo' ? 0.95 : 1.35,
  });
  const groundMat = terrainMaterial({
    themeId: theme.id, ground: groundTex, gravel: gravelTex, basin: basinTex, rock: cliffTex,
    layers: TL, strata: STRATA[theme.id], cloud: theme.clouds * 0.45, bump, waterY,
    emissive: theme.emissiveGround ?? '#ff4a10', emissiveIntensity: 1.1,
  });
  disposables.push(roadMat, wallMat, groundMat);
  if (theme.road === 'ice') roadMat.roughness = 0.6;
  const batcher = new StaticBatcher(gfx.batching ?? true);

  progress(0.35, 'Baue Strecke & Schluchten …'); await yield_();
  const tTrack0 = performance.now();
  const maxStep = geoQ >= 3 ? 2 : geoQ === 2 ? 3 : 5;
  const across = (geoQ >= 3 ? 26 : geoQ === 2 ? 18 : 12) + ((gfx.tessellation ?? 0) >= 2 ? 8 : (gfx.tessellation ?? 0) > 0 ? 4 : 0);

  // Sculpted stratified canyon wall profile: basal scree toe -> undercut face -> stepped bench -> overhang -> upper bench -> rounded rim
  const cliffProf: [number, number][] = [
    [0, 0], [0.22, 0.08], [1.35, 0.22], [0.85, 0.36], [1.9, 0.5],
    [3.1, 0.57], [2.55, 0.68], [4.8, 0.77], [7.4, 0.84], [10.4, 0.92], [15, 1.0],
  ];
  const abutmentMetal = new THREE.MeshStandardMaterial({ color: '#4d525c', metalness: 0.82, roughness: 0.38 });
  disposables.push(abutmentMetal);

  for (const path of td.paths) {
    const S = path.samples, n = S.length;
    const idxs: number[] = [0]; let last = 0;
    for (let i = 1; i < n; i++) {
      const a = S[last], b = S[i], pv = S[i - 1];
      const turn = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
      const flag = pv.gap !== b.gap || pv.canyon !== b.canyon || pv.openL !== b.openL || pv.openR !== b.openR || pv.bridge !== b.bridge || b.ramp > 0 || pv.ramp > 0;
      const dy = Math.abs((b.y + b.ramp) - (a.y + a.ramp)) + Math.abs(b.bank - a.bank) * b.hw;
      if (flag && i - 1 > last) { idxs.push(i - 1); last = i - 1; }
      if (flag || i - last >= maxStep || turn > 0.02 || dy > 0.36) { idxs.push(i); last = i; }
    }
    if (path.closed) idxs.push(0); else if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);

    // ---- road deck (smooth camber + beveled outer curb shoulder) ----
    {
      const pos: number[] = [], uv: number[] = [], ind: number[] = [];
      // Session 15 fix: v used to be `distance / tileLength(width)`. Wherever the road width changes, that divides the WHOLE distance
      // travelled so far by a changing number → the texture smeared/compressed more and more the further along the track (very visible
      // after the shortcut of the jungle sprint). v is now integrated segment by segment.
      let vbase = 0; let vAcc = 0;
      for (let k = 0; k < idxs.length; k++) {
        const s = S[idxs[k]];
        if (k > 0) { const pr = S[idxs[k - 1]]; vAcc += Math.hypot(s.x - pr.x, s.z - pr.z) / Math.max(24, (s.hw + pr.hw) * 0.7); }
        for (let a = 0; a <= across; a++) {
          const f = a / across; const lat = -s.hw + f * 2 * s.hw;
          const e = Math.abs(f * 2 - 1);
          const lipStart = 1 - 2 / across;
          const lip = e > lipStart ? 0.18 * (e - lipStart) / (1 - lipStart) : 0;
          const crown = (1 - e * e) * 0.2 + lip;
          pos.push(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + crown, s.z + s.rz * lat);
          uv.push(f, vAcc);
        }
        if (k > 0 && !S[idxs[k]].gap && !S[idxs[k - 1]].gap) {
          const r0 = vbase - (across + 1), r1 = vbase;
          for (let a = 0; a < across; a++) ind.push(r0 + a, r0 + a + 1, r1 + a, r0 + a + 1, r1 + a + 1, r1 + a);
        }
        vbase += across + 1;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(ind); g.computeVertexNormals();
      batcher.addStrip(g, roadMat, 5400, false);
    }

    // ---- sculpted 3-tier road embankment skirts & stratified canyon walls ----
    for (const side of [-1, 1]) {
      const sp: number[] = [], su: number[] = [], si: number[] = [];
      const wp: number[] = [], wu: number[] = [], wi: number[] = [];
      const K = geoQ >= 3 ? 16 : geoQ === 2 ? 11 : 6;
      const SK = 3; // curb fascia -> upper talus shelf -> deep battered embankment slope
      let sv = 0, wv = 0; let prevS = false, prevW = false; let sAcc = 0;
      for (let k = 0; k < idxs.length; k++) {
        const s = S[idxs[k]]; if (k > 0) { const pr = S[idxs[k - 1]]; sAcc += Math.hypot(s.x - pr.x, s.z - pr.z); }
        const open = side > 0 ? s.openR : s.openL;
        const ex = s.x + s.rx * side * s.hw, ez = s.z + s.rz * side * s.hw, ey = s.y + s.ramp - side * s.hw * s.bank + 0.16;
        // 3-point sculpted embankment skirt (omitted on open shortcut/cave forks so zero skirt slices across a merge, and on bridges which carry a box girder)
        const okS = !s.gap && !open && !s.bridge;
        const bx = ex + s.rx * side * 3.8, bz = ez + s.rz * side * 3.8;
        const depth = okS ? Math.max(6.2, ey - heightAt(bx, bz) + 4.2) : 16;
        const mx = ex + s.rx * side * 0.75, mz = ez + s.rz * side * 0.75;
        sp.push(ex, ey, ez, mx, ey - 0.85, mz, bx, ey - depth, bz);
        su.push(sAcc / 18, 0, sAcc / 18, 0.06, sAcc / 18, depth / 18);
        if (okS && prevS) {
          for (let q = 0; q < SK - 1; q++) {
            const a = sv - SK + q, b = sv + q;
            if (side < 0) si.push(a, b, a + 1, a + 1, b, b + 1); else si.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
        sv += SK; prevS = okS;

        // Multi-ledge canyon cliff with vertical rock-buttress ribs & fracture fissures
        const H = side > 0 ? s.hR : s.hL;
        const okW = H > 0 && !open && !s.gap;
        const buttress = Math.pow(ridged(sAcc * 0.022 + side * 3.7, 1.3, 3), 2.0) * 2.2;
        for (let j = 0; j < K; j++) {
          const f = j / (K - 1); const pf = f * (cliffProf.length - 1);
          const pi = Math.min(cliffProf.length - 2, Math.floor(pf)); const pt = pf - pi;
          const off = cliffProf[pi][0] + (cliffProf[pi + 1][0] - cliffProf[pi][0]) * pt;
          const hh = cliffProf[pi][1] + (cliffProf[pi + 1][1] - cliffProf[pi][1]) * pt;
          const crag = (fbm(sAcc * 0.052, f * 4.5 + side * 7, 4) - 0.5) * 5.2 * Math.min(1, f * 3.2);
          const ribPush = -buttress * Math.sin(f * Math.PI) * Math.min(1, f * 4); // protrudes slightly above driver height (keeps wall collision intact!)
          const lat = Math.max(0.55, 0.6 + off * (H / 25) + crag + ribPush);
          wp.push(ex + s.rx * side * lat, ey - 1.15 + hh * H, ez + s.rz * side * lat);
          wu.push(sAcc / 18, hh * H / 18);
        }
        if (okW && prevW) for (let j = 0; j < K - 1; j++) {
          const a = wv - K + j, b = wv + j;
          if (side > 0) wi.push(a, a + 1, b, b, a + 1, b + 1); else wi.push(a, b, a + 1, a + 1, b, b + 1);
        }
        wv += K; prevW = okW;
      }
      const mk = (p: number[], u: number[], i: number[], mat: THREE.Material, shadow: boolean) => {
        if (!i.length) return;
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
        g.setIndex(i); g.computeVertexNormals();
        batcher.addStrip(g, mat, 5400, shadow);
      };
      mk(sp, su, si, wallMat, false);
      mk(wp, wu, wi, wallMat, true);
    }

    // ---- sculpted chasm cliff faces + structural steel deck abutments at every jump gap ----
    for (let i = 0; i < n - 1; i++) {
      const a = S[i], b = S[i + 1];
      if (a.gap === b.gap) continue;
      const s = a.gap ? b : a; const depth = 44; const yaw = Math.atan2(s.tx, s.tz) + (a.gap ? Math.PI : 0);
      const g = new THREE.PlaneGeometry(s.hw * 2 + 8, depth + s.ramp, 12, 12);
      const posA = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < posA.count; v++) {
        const px = posA.getX(v), py = posA.getY(v);
        posA.setZ(v, (fbm(px * 0.16, py * 0.16, 3) - 0.5) * 3.4 + Math.sin(py * 0.45) * 0.5);
      }
      g.computeVertexNormals();
      const uvA = g.attributes.uv as THREE.BufferAttribute; for (let v = 0; v < uvA.count; v++) uvA.setXY(v, uvA.getX(v) * 2.5, uvA.getY(v) * 2.5);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(s.x, s.y + s.ramp - (depth + s.ramp) / 2, s.z);
      m.rotation.y = yaw; m.receiveShadow = true; group.add(m); disposables.push(g);
      // Heavy cantilevered steel bridge abutment fascia right under launch/landing lip
      const abParts: THREE.BufferGeometry[] = [
        new THREE.BoxGeometry(s.hw * 2 + 1.2, 1.35, 2.2).translate(0, -0.65, 0.4),
        ...[-0.85, -0.42, 0, 0.42, 0.85].map(f => new THREE.BoxGeometry(0.9, 3.2, 1.6).rotateX(-0.35).translate(f * s.hw, -2.0, 0.2)),
      ];
      const abG = mergeGeometries(abParts.map(x => x.toNonIndexed()))!; abParts.forEach(x => x.dispose());
      const abM = new THREE.Mesh(abG, abutmentMetal); abM.position.set(s.x, s.y + s.ramp, s.z); abM.rotation.y = yaw; abM.castShadow = true; group.add(abM); disposables.push(abG);
    }

    // ---- high-clearance tunnels, underwater tubes, underpasses & widened/branching caverns ----
    buildTunnel(path, group, wallMat, roadMat, abutmentMetal, disposables, theme, waterY, heightAt);
    if (td.def.theme === 'oovo') buildZeroGTubes(path, group, wallMat, abutmentMetal, disposables, theme);
  }
  // ---- sculpted rock bifurcation wedges with glowing direction chevrons at every branching cave split & reunion ----
  buildCaveForkPylons(td, group, wallMat, abutmentMetal, theme, disposables);
  // ---- elevated overpass viaduct bridges where the track crosses over itself ----
  buildBridges(td, group, abutmentMetal, wallMat, theme, disposables, heightAt, roadClear, waterY);

  // ---- flush ramp-conforming warning chevrons (sit directly on curved ramp slope + bank, never float!) ----
  {
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.25), side: THREE.DoubleSide });
    const S = td.main.samples; const pos: number[] = [], ind: number[] = [];
    const rSurf = (q: Sample, l: number) => { const e = Math.min(1, Math.abs(l) / q.hw); return q.y + q.ramp - l * q.bank + (1 - e * e) * 0.2 + 0.055 + roadDispOff; };
    for (let i = 1; i < S.length; i++) {
      if (!(S[i].ramp > 0 && S[i - 1].ramp === 0)) continue;
      for (let c = 0; c < 4; c++) {
        const idx0 = (i + c * 4) % S.length, s0 = S[idx0], s1 = S[(idx0 + 1) % S.length], s2 = S[(idx0 + 2) % S.length];
        for (const side of [-1, 1]) {
          // Pointed V-chevron arm conforming vertex-by-vertex to the rising ramp deck
          const lIn = side * s0.hw * 0.14, lOut = side * s0.hw * 0.56;
          const v = pos.length / 3;
          pos.push(
            s0.x + s0.rx * lOut, rSurf(s0, lOut), s0.z + s0.rz * lOut,
            s1.x + s1.rx * lOut, rSurf(s1, lOut), s1.z + s1.rz * lOut,
            s1.x + s1.rx * lIn, rSurf(s1, lIn), s1.z + s1.rz * lIn,
            s2.x + s2.rx * lIn, rSurf(s2, lIn), s2.z + s2.rz * lIn,
          );
          ind.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
    }
    if (ind.length) {
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(ind);
      const cm = new THREE.Mesh(cg, chevMat); group.add(cm); disposables.push(cg, chevMat);
    } else disposables.push(chevMat);
  }

  // ---- upgraded start / finish arena (grounded foundations + road-conforming finish line) ----
  addStartArea(td, group, theme, disposables, rng, roadDispOff, heightAt);
  const trackMs = Math.round(performance.now() - tTrack0);

  progress(0.55, 'Generiere Terrain (LOD) …'); await yield_();
  const tTer0 = performance.now();
  const b = td.bounds; const margin = 2600 * gfx.drawDistance;
  const W = b.maxX - b.minX + margin * 2, D = b.maxZ - b.minZ + margin * 2;
  const cxm = (b.minX + b.maxX) / 2, czm = (b.minZ + b.maxZ) / 2;
  await buildTerrain(field, theme, gfx, groundMat, batcher, { cx: cxm, cz: czm, W, D }, (p, m) => progress(0.55 + 0.25 * p, m));
  addSkyline(theme, group, disposables, avgY, { cx: cxm, cz: czm, W, D });
  const terrainMs = Math.round(performance.now() - tTer0);

  // ---- TSL animated water / molten lava planes + architectural viaduct piers ----
  if (T === 'lava') {
    const lt = generateTexture('basalt', ['#0b0605', '#1c0e08', '#2e160b'], 512, 99, 8, '#ff7a20');
    const lm = lavaSeaMaterial(lt);
    const pg = new THREE.PlaneGeometry(W, D);
    const lp = new THREE.Mesh(pg, lm); lp.rotation.x = -Math.PI / 2; lp.position.set(cxm, waterY, czm); group.add(lp);
    disposables.push(lm, pg);
  } else if (T === 'jungle' || theme.id === 'ice' || T === 'ocean') {
    const wt = generateTexture('snow', ['#8899aa', '#99aabb', '#aabbcc'], 512, T === 'ocean' ? 44 : 55, 8);
    const wm = waterMaterial(theme.id, wt.normalMap, theme.clouds * 0.35, T === 'ocean' ? tunnelWaterMask(td, waterY, disposables) : undefined);
    const pg = new THREE.PlaneGeometry(W, D);
    const wp = new THREE.Mesh(pg, wm); wp.rotation.x = -Math.PI / 2; wp.position.set(cxm, waterY, czm); wp.receiveShadow = true; group.add(wp); glossy.push(wp);
    disposables.push(wm, pg);
    if (T === 'ocean') addViaductPiers(td, group, abutmentMetal, disposables, 44, s => s.bridge || s.tun === 2 ? null : ({ bot: waterY - 8, top: s.y - 1.2, w: s.hw * 1.65, r: 1.9 }), roadClear);
  } else if (T === 'prison') {
    addAsteroidBelt(td, group, wallMat, disposables, rng);
    addViaductPiers(td, group, abutmentMetal, disposables, 56, s => s.zeroG || s.bridge ? null : ({ bot: s.y - 380, top: s.y - 1.5, w: s.hw * 1.7, r: 2.5 }), roadClear);
  }

  progress(0.82, 'Platziere Landschaftsdetails …'); await yield_();
  const distToTrack = (x: number, z: number) => nearest(x, z);
  const decorCells = scatterDecor(theme, group, td, heightAt, distToTrack, gfx, disposables, rng, wallTex, roadClear, waterY);
  addArches(td, group, wallMat, disposables, rng, roadClear, heightAt, waterY, T === 'prison');
  const obstFx = addObstacles(td, group, theme, wallMat, disposables);
  progress(0.9, 'Platziere Streckendetails …'); await yield_();
  // Session 15: objects are seated on the LOWEST ground point under their footprint (sampling only the centre left them floating on slopes)
  const groundMin = (x: number, z: number, r: number) => Math.min(heightAt(x, z), heightAt(x + r, z), heightAt(x - r, z), heightAt(x, z + r), heightAt(x, z - r));
  const props = addProps(td, theme, group, gfx, (x, z) => groundMin(x, z, 1.4), disposables, rng, roadClear, roadDispOff);
  addSciFi(td, theme, group as never, disposables, (x, z) => groundMin(x, z, 1.6), roadDispOff);
  const mech = addMechProps(td, theme, group, disposables, (x, z) => groundMin(x, z, 2.8), roadClear, waterY, gfx.detail);
  const setPieces = buildSetPieces(td, theme, group, disposables, wallMat, (x, z) => groundMin(x, z, 2.5));
  const landRock = surfaceMaterial(wallTex, {
    strata: STRATA[theme.id], ledge: wallLedge, cloud: theme.clouds * 0.4,
    macro: 0.35, detail: 0.3, normalScale: 1.35, bump,
    emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff',
    emissiveIntensity: theme.id === 'lava' ? 0.8 : theme.id === 'crystal' ? 0.5 : 0,
  });
  disposables.push(landRock);
  const smokes: SmokeSrc[] = [];
  const cascades = addWaterfalls(td, theme, group, disposables, rng, smokes, landRock);
  const landmarks = addLandmarks(td, theme, group, disposables, field, rng, landRock, props.emitters, smokes);
  progress(0.92, 'Belebe Landschaft …'); await yield_();
  const smoke = buildSmoke(smokes, theme, td, field, group, disposables, rng, waterY);
  const cover = buildGroundCover(td, theme, gfx, field, waterY, rng, group, disposables);
  const life = buildLife(td, theme, field, waterY, rng, group, disposables, gfx.detail, landmarks);

  // tv cams
  const tvCams: THREE.Vector3[] = [];
  const S = td.main.samples;
  for (let i = 0; i < S.length; i += 110) { const s = S[i]; const side = (i / 110) % 2 ? 1 : -1; tvCams.push(new THREE.Vector3(s.x + s.rx * side * (s.hw + 6), s.y + 7 + (s.canyon ? 6 : 0), s.z + s.rz * side * (s.hw + 6))); }

  const detail = addTrackDetail(td, theme, group, disposables, rng, wallMat, { across, disp: roadDispOff, detail: gfx.detail, tvCams, batcher, groundTex, heightAt: (x, z) => groundMin(x, z, 1.8) });
  batcher.build(group, disposables);

  const timings: WorldTimings = {
    texMs, trackMs, terrainMs, coverMs: cover.ms,
    totalMs: Math.round(performance.now() - tStart),
    coverCount: cover.count, lifeCount: life.count,
  };

  progress(0.95, 'Kompiliere Shader …'); await yield_();
  let lodB2 = (gfx.lodBias ?? 1) ** 2; // graphics setting "LOD-Distanz" (live)
  const setLodBias = (v: number) => { lodB2 = v * v; };
  const update = (t: number, cam?: THREE.Vector3, pods?: PodPos[]) => {
    smoke.update(t); life.update(t, pods);
    if (cam) {
      cover.update(cam);
      for (let i = 0; i < decorCells.length; i++) {
        const dc = decorCells[i]; const dx = dc.x - cam.x, dz = dc.z - cam.z, d2 = dx * dx + dz * dz;
        const vis = d2 < dc.view2;
        if (dc.lod) { const near = d2 < dc.lod2! * lodB2; dc.mesh.visible = vis && near; dc.lod.visible = vis && !near; } else dc.mesh.visible = vis;
        if (dc.sh2 > 0) dc.mesh.castShadow = vis && d2 < dc.sh2;
      }
    }
    props.update(t); detail.update(t); mech.update(t);
  };
  return {
    breakObstacle: obstFx.breakObstacle, setLodBias,
    group, heightAt, update, flashField: detail.flashField, nearAudio: life.nearAudio, cascades, timings,
    tvCams, glossy, emitters: props.emitters, setPieces,
    dispose: () => disposables.forEach(d => d.dispose()),
  };
}

/** Tapered twin-leg architectural viaduct piers + hammerhead box-girder deck capitals */
function addViaductPiers(
  td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[],
  step: number, spec: (s: Sample) => { bot: number; top: number; w: number; r: number } | null,
  roadClear?: (x: number, z: number, r: number, margin?: number) => boolean,
) {
  const S = td.main.samples, N = S.length; const cols: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Check that a pier does not drop through a lower crossing road deck
  const clearBelow = (i: number, x: number, z: number, yTop: number, rad: number) => {
    for (const c of td.crossings) {
      const d = Math.abs(i - c.upperIdx), di = td.main.closed ? Math.min(d, N - d) : d;
      if (di > 90) continue;
      for (let k = c.lowerFrom - 12; k <= c.lowerTo + 12; k += 2) {
        if (!td.main.closed && (k < 0 || k >= N)) continue;
        const q = S[((k % N) + N) % N];
        if (q.y < yTop && Math.hypot(q.x - x, q.z - z) < q.hw + rad + 5.5) return false;
      }
    }
    return true;
  };
  void roadClear;
  for (let i = 0; i < S.length; i += step) {
    const s = S[i]; if (s.gap) continue;
    const sp = spec(s); if (!sp || sp.top - sp.bot < 6) continue;
    const legs = [-0.36, 0.36].map(sd => [s.x + s.rx * sd * sp.w, s.z + s.rz * sd * sp.w] as const);
    if (!legs.every(([lx, lz]) => clearBelow(i, lx, lz, s.y, sp.r))) continue;
    const yaw = Math.atan2(s.tx, s.tz); const q = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    const h = sp.top - sp.bot;
    caps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, sp.top - 0.9, s.z), q, new THREE.Vector3(sp.w, 2.2, sp.r * 2.2)));
    for (const [lx, lz] of legs) {
      cols.push(new THREE.Matrix4().compose(new THREE.Vector3(lx, sp.bot + h / 2, lz), q, new THREE.Vector3(sp.r, h, sp.r)));
    }
  }
  if (cols.length) {
    const cg = new THREE.CylinderGeometry(0.78, 1.15, 1, 10); const im = new THREE.InstancedMesh(cg, mat, cols.length);
    cols.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; group.add(im); disp.push(cg);
  }
  if (caps.length) {
    const kg = mergeGeometries([new THREE.BoxGeometry(1, 0.65, 1).translate(0, 0.18, 0), new THREE.BoxGeometry(0.82, 0.45, 0.85).translate(0, -0.28, 0)].map(x => x.toNonIndexed()))!;
    const im = new THREE.InstancedMesh(kg, mat, caps.length);
    caps.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; group.add(im); disp.push(kg);
  }
}

/** Top-down mask (1 = no water) over the footprints of underwater tunnels where the tube rises above sea level. */
function tunnelWaterMask(td: TrackData, seaY: number, disp: { dispose: () => void }[]) {
  const S = td.main.samples; if (!S.some(s => s.tun === 2)) return undefined;
  const R = 1024, b = td.bounds, x0 = b.minX - 80, z0 = b.minZ - 80, sx = b.maxX - b.minX + 160, sz = b.maxZ - b.minZ + 160;
  const data = new Uint8Array(R * R * 4);
  for (const s of S) {
    if (s.tun !== 2 || s.y + s.roof + TUNNEL_DECK < seaY - 0.6) continue;
    const rad = s.hw + 1.5 + 5, cx = (s.x - x0) / sx * R, cz = (s.z - z0) / sz * R, rx = rad / sx * R, rz = rad / sz * R;
    for (let j = Math.max(0, Math.floor(cz - rz)); j <= Math.min(R - 1, Math.ceil(cz + rz)); j++) for (let i = Math.max(0, Math.floor(cx - rx)); i <= Math.min(R - 1, Math.ceil(cx + rx)); i++) {
      const dx = (i + 0.5 - cx) / rx, dz = (j + 0.5 - cz) / rz; if (dx * dx + dz * dz <= 1) data[(j * R + i) * 4] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, R, R, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; disp.push(tex);
  return { tex, x0, z0, sx, sz };
}

/** Builds futuristic beveled box-girder overpass viaducts, abutments & terrain-grounded twin piers for every `s.bridge` crossing! */
function buildBridges(
  td: TrackData, group: THREE.Group, steelMat: THREE.Material, wallMat: THREE.Material, theme: ThemeDef,
  disp: { dispose: () => void }[], heightAt: (x: number, z: number) => number,
  _roadClear: (x: number, z: number, r: number, margin?: number) => boolean, waterY: number,
) {
  const S = td.main.samples, n = S.length;
  const runs: [number, number][] = []; let a0 = -1;
  for (let i = 0; i < n; i++) {
    const on = !!S[i].bridge && !S[i].gap;
    if (on && a0 < 0) a0 = i;
    if ((!on || i === n - 1) && a0 >= 0) { const b0 = on ? i : i - 1; if (b0 - a0 >= 6) runs.push([a0, b0]); a0 = -1; }
  }
  if (!runs.length) return;
  const gPos: number[] = [], gUv: number[] = [], gInd: number[] = [];
  const lPos: number[] = [], lUv: number[] = [], lInd: number[] = [];
  const ribs: THREE.BufferGeometry[] = [], abuts: THREE.BufferGeometry[] = [];
  const pierCols: THREE.Matrix4[] = [], pierCaps: THREE.Matrix4[] = [];
  const upV = new THREE.Vector3(0, 1, 0), isPrison = theme.terrain === 'prison';
  // Cross-section profile of the armored viaduct box-girder: left road curb → beveled fascia → deep box soffit → beveled fascia → right curb
  const PROF = 6;
  const clearLower = (x: number, z: number, yTop: number, rad: number) => {
    for (const path of td.paths) for (let k = 0; k < path.samples.length; k += 2) {
      const q = path.samples[k];
      if (q.bridge || q.y > yTop - 6) continue;
      if (Math.hypot(q.x - x, q.z - z) < q.hw + rad + 6.5) return false;
    }
    return true;
  };
  for (const [ra, rb] of runs) {
    let pRow = -1, pGlow = -1, sAcc = 0;
    for (let i = ra; i <= rb; i = i === rb ? rb + 1 : Math.min(rb, i + 2)) {
      const s = S[i]; if (i > ra) sAcc += 4;
      const hw = s.hw, eL = s.y + s.ramp + hw * s.bank + 0.16, eR = s.y + s.ramp - hw * s.bank + 0.16;
      const sofL = eL - 2.65, sofR = eR - 2.65;
      const row = gPos.length / 3;
      const pts: [number, number][] = [
        [-hw, eL], [-(hw + 0.9), eL - 0.85], [-(hw * 0.76), sofL],
        [hw * 0.76, sofR], [hw + 0.9, eR - 0.85], [hw, eR],
      ];
      pts.forEach(([lat, py], k) => { gPos.push(s.x + s.rx * lat, py, s.z + s.rz * lat); gUv.push(k / (PROF - 1), sAcc / 14); });
      if (pRow >= 0) for (let k = 0; k < PROF - 1; k++) {
        const a = pRow + k, b = row + k;
        gInd.push(a, b, a + 1, a + 1, b, b + 1);
      }
      pRow = row;
      // Glowing futuristic navigation strips along both outer bridge fascias (highly readable from the underpass below!)
      const gr = lPos.length / 3;
      for (const [lat, py] of [[-(hw + 0.94), eL - 0.72], [-(hw + 0.94), eL - 1.02], [hw + 0.94, eR - 0.72], [hw + 0.94, eR - 1.02]]) {
        lPos.push(s.x + s.rx * lat, py, s.z + s.rz * lat); lUv.push(0, 0);
      }
      if (pGlow >= 0) for (const k of [0, 2]) lInd.push(pGlow + k, gr + k, pGlow + k + 1, pGlow + k + 1, gr + k, gr + k + 1);
      pGlow = gr;
      // Transverse structural cross-girders every 14 m + twin ground-seated viaduct piers every 28 m (safely flanking the lower road!)
      const yaw = Math.atan2(s.tx, s.tz), q = new THREE.Quaternion().setFromAxisAngle(upV, yaw);
      if ((i - ra) % 7 === 0) {
        const bg = new THREE.BoxGeometry(hw * 1.62, 0.75, 1.1);
        const bp = bg.attributes.position as THREE.BufferAttribute;
        for (let vi = 0; vi < bp.count; vi++) bp.setY(vi, bp.getY(vi) + bp.getX(vi) * s.bank);
        bg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.ramp - 2.75, s.z), q, new THREE.Vector3(1, 1, 1)));
        ribs.push(bg.toNonIndexed()); bg.dispose();
      }
      if (i > ra + 6 && i < rb - 6 && (i - ra) % 14 === 0) {
        const wSpan = hw * 1.52, rP = 2.15;
        const lPt: [number, number] = [s.x - s.rx * wSpan * 0.42, s.z - s.rz * wSpan * 0.42];
        const rPt: [number, number] = [s.x + s.rx * wSpan * 0.42, s.z + s.rz * wSpan * 0.42];
        if (clearLower(lPt[0], lPt[1], s.y, rP) && clearLower(rPt[0], rPt[1], s.y, rP)) {
          const top = Math.min(sofL, sofR) + 0.35;
          const gL = isPrison ? s.y - 340 : Math.min(heightAt(lPt[0], lPt[1]), waterY > -1e8 ? waterY - 6 : 1e9) - 5;
          const gR = isPrison ? s.y - 340 : Math.min(heightAt(rPt[0], rPt[1]), waterY > -1e8 ? waterY - 6 : 1e9) - 5;
          if (top - Math.max(gL, gR) > 4.5) {
            pierCaps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, top - 0.8, s.z), q, new THREE.Vector3(wSpan, 2.1, rP * 2.1)));
            for (const [[lx, lz], bot] of [[lPt, gL], [rPt, gR]] as const) {
              const hP = top - bot;
              pierCols.push(new THREE.Matrix4().compose(new THREE.Vector3(lx, bot + hP * 0.5, lz), q, new THREE.Vector3(rP, hP, rP)));
            }
          }
        }
      }
    }
    // Solid masonry/rock bridge end-abutments anchoring both bridge approaches firmly into terrain (never floating!)
    if (!isPrison) for (const e of [ra, rb]) {
      const s = S[e], yaw = Math.atan2(s.tx, s.tz), q = new THREE.Quaternion().setFromAxisAngle(upV, yaw);
      const gy = Math.min(heightAt(s.x - s.rx * s.hw, s.z - s.rz * s.hw), heightAt(s.x + s.rx * s.hw, s.z + s.rz * s.hw), heightAt(s.x, s.z)) - 6;
      const top = s.y + s.ramp - Math.abs(s.bank) * s.hw - 0.1, hA = Math.max(6, top - gy);
      if (clearLower(s.x, s.z, s.y, s.hw * 0.5)) {
        const ag = new THREE.BoxGeometry(s.hw * 2.04, hA, 6.4);
        ag.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, gy + hA * 0.5, s.z), q, new THREE.Vector3(1, 1, 1)));
        abuts.push(ag.toNonIndexed()); ag.dispose();
      }
    }
  }
  if (gInd.length) {
    const sm = (steelMat as THREE.MeshStandardMaterial).clone(); sm.side = THREE.DoubleSide; disp.push(sm);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(gUv, 2)); g.setIndex(gInd); g.computeVertexNormals();
    const m = new THREE.Mesh(g, sm); m.castShadow = true; m.receiveShadow = true; group.add(m); disp.push(g);
  }
  if (lInd.length) {
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.45), side: THREE.DoubleSide });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(lUv, 2)); g.setIndex(lInd);
    group.add(new THREE.Mesh(g, lm)); disp.push(g, lm);
  }
  if (ribs.length) { const rg = mergeGeometries(ribs)!; ribs.forEach(x => x.dispose()); const rm = new THREE.Mesh(rg, steelMat); rm.castShadow = true; rm.receiveShadow = true; group.add(rm); disp.push(rg); }
  if (abuts.length) { const ag = mergeGeometries(abuts)!; abuts.forEach(x => x.dispose()); const am = new THREE.Mesh(ag, wallMat); am.castShadow = true; am.receiveShadow = true; group.add(am); disp.push(ag); }
  if (pierCols.length) {
    const cg = new THREE.CylinderGeometry(0.82, 1.18, 1, 12); const im = new THREE.InstancedMesh(cg, steelMat, pierCols.length);
    pierCols.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; group.add(im); disp.push(cg);
  }
  if (pierCaps.length) {
    const kg = mergeGeometries([new THREE.BoxGeometry(1, 0.65, 1).translate(0, 0.18, 0), new THREE.BoxGeometry(0.82, 0.45, 0.85).translate(0, -0.28, 0)].map(x => x.toNonIndexed()))!;
    const im = new THREE.InstancedMesh(kg, steelMat, pierCaps.length);
    pierCaps.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; group.add(im); disp.push(kg);
  }
}

/** Sculpted floor-to-ceiling cavern septum column + glowing split-arrow beacons marking every branching cave Y-junction. */
function buildCaveForkPylons(td: TrackData, group: THREE.Group, rockMat: THREE.Material, metalMat: THREE.Material, theme: ThemeDef, disp: { dispose: () => void }[]) {
  const caveBranches = td.paths.filter(p => p.isCave);
  if (!caveBranches.length) return;
  const S = td.main.samples, N = S.length, upV = new THREE.Vector3(0, 1, 0);
  const rocks: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [], glows: THREE.BufferGeometry[] = [];
  for (const br of caveBranches) {
    const bs = br.samples, nB = bs.length;
    // Place the split septum right where the branch edge first clears the main road edge (safely outside both collision envelopes!)
    for (const isStart of [true, false]) {
      const bi = isStart ? Math.min(nB - 1, 20) : Math.max(0, nB - 21);
      const bq = bs[bi];
      const mi = td.main.closed ? (((isStart ? br.mainFrom + 28 : br.mainTo - 28) % N) + N) % N : Math.max(0, Math.min(N - 1, isStart ? br.mainFrom + 28 : br.mainTo - 28));
      const mq = S[mi];
      const eMainX = mq.x + mq.rx * br.side * (mq.hw + 2.2), eMainZ = mq.z + mq.rz * br.side * (mq.hw + 2.2);
      const eBrX = bq.x - bq.rx * br.side * (bq.hw + 2.2), eBrZ = bq.z - bq.rz * br.side * (bq.hw + 2.2);
      const px = (eMainX + eBrX) * 0.5, pz = (eMainZ + eBrZ) * 0.5;
      // Ensure safe clearance from both roadways
      if (Math.hypot(px - mq.x, pz - mq.z) < mq.hw + 1.8 || Math.hypot(px - bq.x, pz - bq.z) < bq.hw + 1.8) continue;
      const py = Math.min(mq.y - br.side * mq.hw * mq.bank, bq.y), h = Math.max(20, (mq.roof || 22) + 2);
      const yaw = Math.atan2(mq.tx, mq.tz) + (isStart ? 0 : Math.PI);
      const q = new THREE.Quaternion().setFromAxisAngle(upV, yaw);
      const col = new THREE.CylinderGeometry(2.4, 3.3, h + 4, 9, 5);
      const cp = col.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < cp.count; k++) { const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k); const f = 0.85 + 0.35 * vnoise(x * 0.4 + y * 0.2, z * 0.4); cp.setXYZ(k, x * f, y, z * f * 1.45); }
      col.computeVertexNormals();
      col.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, py + h * 0.5 - 1.5, pz), q, new THREE.Vector3(1, 1, 1)));
      rocks.push(col.toNonIndexed()); col.dispose();
      if (isStart) {
        // Futuristic illuminated split-chevron guide sign pointing into BOTH left & right cave tubes!
        const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py + 4.4, pz), q, new THREE.Vector3(1, 1, 1));
        frames.push(new THREE.BoxGeometry(3.8, 2.2, 0.5).translate(0, 0, -3.4).applyMatrix4(m));
        for (const sd of [-1, 1]) {
          glows.push(new THREE.BoxGeometry(1.15, 0.28, 0.16).rotateZ(sd * 0.55).translate(sd * 0.95, 0.32, -3.7).applyMatrix4(m));
          glows.push(new THREE.BoxGeometry(1.15, 0.28, 0.16).rotateZ(-sd * 0.55).translate(sd * 0.95, -0.32, -3.7).applyMatrix4(m));
        }
      }
    }
  }
  const addM = (list: THREE.BufferGeometry[], m: THREE.Material, cast: boolean) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x))!; list.forEach(x => x.dispose());
    const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; group.add(o); disp.push(g);
  };
  addM(rocks, rockMat, true); addM(frames, metalMat, false);
  if (glows.length) { const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.65) }); disp.push(gm); addM(glows, gm, false); }
}

function buildTunnel(
  path: Path, group: THREE.Group, mat: THREE.Material, roadMat: THREE.Material, ribMat: THREE.Material,
  disp: { dispose: () => void }[], theme: ThemeDef, seaY: number, heightAt: (x: number, z: number) => number,
) {
  // Four tunnel kinds (Sample.tun), all with tall generous headroom (19.5–38 m) & wide shoulders (Wd = hw + 3.4 + caveW):
  //  1 standard  – vaulted shell + terrain-seated earth berm + DRIVABLE DECK on top (PodState.upper) with glowing edge lines,
  //  2 sea tube  – tall 19.5 m Aquilaris caisson with panoramic underwater ocean windows (caustics, light shafts, fish schools),
  //  3 cave      – widened multi-chamber & branching caverns (up to 38 m dome) + sculpted CAVE-FLOOR MESH, stalactites, stalagmites & glowing veins,
  //  4 underpass – cut-and-cover underpass tunnel beneath an elevated crossing viaduct bridge (portal frames, ribs, lamps, grounded side berms).
  const S = path.samples; const n = S.length, floatWorld = theme.terrain === 'prison' || theme.terrain === 'ocean';
  const runs: [number, number][] = []; let a0 = -1;
  for (let i = 0; i < n; i++) { const on = S[i].roof > 0; if (on && a0 < 0) a0 = i; if ((!on || i === n - 1) && a0 >= 0) { const b0 = on ? i : i - 1; if (b0 - a0 >= 5) runs.push([a0, b0]); a0 = -1; } }
  if (!runs.length) return;
  type Buf = { pos: number[]; uv: number[]; ind: number[] };
  const mk = (): Buf => ({ pos: [], uv: [], ind: [] });
  const shell = mk(), deck = mk(), berm = mk(), steel = mk(), glowB = mk(), caveFloor = mk(), veinB = mk(); const winInd: number[] = [];
  const segA = 20, DECK = TUNNEL_DECK; const lamps: THREE.Matrix4[] = [], ribs: THREE.BufferGeometry[] = [], tites: THREE.Matrix4[] = [];
  const upV = new THREE.Vector3(0, 1, 0), flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const put = (b: Buf, s: Sample, lat: number, up: number, u: number, v: number) => { b.pos.push(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + up, s.z + s.rz * lat); b.uv.push(u, v); };
  const strip = (b: Buf, r0: number, r1: number, cols: number) => { for (let a = 0; a < cols; a++) b.ind.push(r0 + a, r0 + a + 1, r1 + a, r0 + a + 1, r1 + a + 1, r1 + a); };
  const arch = (s: Sample, R: number, tube: number, H: number) => {
    const rg = new THREE.TorusGeometry(R, tube, 8, 32, Math.PI); rg.scale(1, H / R, 1);
    const p = rg.attributes.position as THREE.BufferAttribute; for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + p.getX(k) * s.bank);
    rg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.ramp + 1.5, s.z), new THREE.Quaternion().setFromAxisAngle(upV, Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1)));
    const out = rg.toNonIndexed(); rg.dispose(); return out;
  };
  const bermFootUp = (s: Sample, lat: number) => {
    if (floatWorld) return -6;
    const wx = s.x + s.rx * lat, wz = s.z + s.rz * lat, roadAtLat = s.y + s.ramp - lat * s.bank;
    return Math.max(-28, Math.min(-5, heightAt(wx, wz) - roadAtLat - 4.5));
  };

  for (const [ra, rb] of runs) {
    const kind = S[ra].tun ?? 1, sea = kind === 2, cave = kind === 3, underP = kind === 4;
    const hasDeck = !sea && !underP && !path.isCave;
    const amp = cave ? 3.2 : (sea || underP) ? 0 : 1.3;
    let pRing = -1, pDeck = -1, pBerm = -1, pSteel = -1, pGlow = -1, pUnder = false, pOpenL = false, pOpenR = false;
    let pFloorL = -1, pFloorR = -1, pVein = -1, vAcc = 0, last = ra;
    for (let i = ra; i <= rb; i = i === rb ? rb + 1 : Math.min(rb, i + 2)) {
      const s = S[i], cw = cave ? (s.caveW ?? 0) : 0;
      const H = s.roof - 1.5, Wd = s.hw + 3.4 + cw, D = s.roof + DECK;
      // Underwater windows open wherever the window crown lies safely beneath the ocean surface!
      const under = sea && s.y + s.roof * 0.88 < seaY - 0.4;
      vAcc += (i - last) * 2 / Math.max(24, s.hw * 1.4); last = i;
      // Positive-biased noise near the crown so rock roughness adds grandeur upward and never lowers headroom!
      const noise = (a: number) => {
        if (!amp) return 0;
        const raw = (vnoise(i * 0.2, a * 0.7) - 0.5) * amp;
        const top = Math.sin(Math.PI * a / segA);
        return top > 0.5 ? Math.max(-0.35, raw + 0.35 * amp * top) : raw;
      };
      // Inner vaulted shell (leave open wall aperture where a branching cave tube forks off or reunites!)
      const ring = shell.pos.length / 3;
      for (let a = 0; a <= segA; a++) {
        const ang = Math.PI * a / segA, nz = noise(a);
        const yBase = a === 0 || a === segA ? -2.2 : 1.5; // tuck shell base 2.2 m below road edge so walls never gap on hills!
        put(shell, s, Math.cos(ang) * (Wd + nz), Math.sin(ang) * (H + nz) + yBase, s.s / 15, a / segA * 2.4);
      }
      if (pRing >= 0) {
        const cutR = cave && (s.openR || pOpenR), cutL = cave && (s.openL || pOpenL);
        for (let a = 0; a < segA; a++) {
          if ((cutR && a <= 4) || (cutL && a >= segA - 5)) continue; // open archway into branching cave tunnel!
          const p0 = pRing + a, p1 = ring + a;
          const isWin = pUnder && under && ((a >= 1 && a <= 7) || (a >= 12 && a <= 18));
          (isWin ? winInd : shell.ind).push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
        }
      }
      pRing = ring; pUnder = under; pOpenL = s.openL; pOpenR = s.openR;

      // Sculpted lateral CAVE-FLOOR MESH + glowing mineral/lava fissures inside widened cave chambers!
      if (cave) {
        const addSideFloor = (sd: number, open: boolean, prev: number) => {
          if (open || cw < 0.2) return -1;
          const r0 = caveFloor.pos.length / 3, COLS = 4;
          const lIn = sd * (s.hw - 0.15), lOut = sd * (Wd + 1.8);
          for (let c = 0; c < COLS; c++) {
            const f = c / (COLS - 1), lat = lIn + (lOut - lIn) * f;
            const shelf = f === 0 ? 0.1 : f === COLS - 1 ? 1.4 : 0.35 * f + (vnoise(i * 0.22 + sd * 5, c * 1.3) - 0.42) * 1.35 * Math.sin(f * Math.PI);
            put(caveFloor, s, lat, shelf, f * 1.4, s.s / 14);
          }
          if (prev >= 0) for (let c = 0; c < COLS - 1; c++) {
            const a = prev + c, b = r0 + c;
            if (sd > 0) caveFloor.ind.push(a, a + 1, b, a + 1, b + 1, b); else caveFloor.ind.push(a, b, a + 1, a + 1, b, b + 1);
          }
          // Stalagmite clusters rooted into the widened cave-floor terrace (well outside the collision barrier!)
          if (cw > 2.2 && i > ra + 4 && i < rb - 4 && h2(i, sd > 0 ? 31 : 37) > 0.32) {
            const fSt = 0.32 + h2(i, sd > 0 ? 41 : 43) * 0.52, lat = lIn + (lOut - lIn) * fSt;
            const len = 1.8 + h2(i, 27) * (2.6 + cw * 0.28), rr = 0.55 + h2(i, 29) * 0.85;
            tites.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + len * 0.45 - 0.3, s.z + s.rz * lat), new THREE.Quaternion(), new THREE.Vector3(rr, len, rr)));
          }
          return r0;
        };
        pFloorL = addSideFloor(-1, s.openL, pFloorL);
        pFloorR = addSideFloor(1, s.openR, pFloorR);
        // Glowing magma / ice / bioluminescent crystal veins running along widened cave chamber shoulders
        if (cw > 1.8 && !s.openL && !s.openR) {
          const rv = veinB.pos.length / 3;
          for (const sd of [-1, 1]) {
            const vl = sd * (s.hw + cw * 0.55 + 1.4 + Math.sin(i * 0.17 + sd) * 0.8);
            put(veinB, s, vl - 0.22, 0.52, 0, 0); put(veinB, s, vl + 0.22, 0.52, 1, 0);
          }
          if (pVein >= 0) for (const a of [0, 2]) veinB.ind.push(pVein + a, pVein + a + 1, rv + a, pVein + a + 1, rv + a + 1, rv + a);
          pVein = rv;
        } else pVein = -1;
      }

      if (sea) { // heavy marine steel caisson around underwater tunnel
        const dw = Wd + 11, r = steel.pos.length / 3;
        put(steel, s, -dw, -9, 0, s.s / 12); put(steel, s, -dw, D, 0.3, s.s / 12); put(steel, s, dw, D, 0.7, s.s / 12); put(steel, s, dw, -9, 1, s.s / 12);
        if (pSteel >= 0) strip(steel, pSteel, r, 3); pSteel = r;
      } else if (hasDeck) { // drivable top deck + deep terrain-grounded earth berm + glowing deck guidelines
        const dw = Math.max(s.hw + 1.5, Wd - 1.5), fw = dw + 20, r = deck.pos.length / 3;
        put(deck, s, -dw, D, 0, vAcc); put(deck, s, dw, D, 1, vAcc);
        if (pDeck >= 0) strip(deck, pDeck, r, 1); pDeck = r;
        const rb2 = berm.pos.length / 3;
        const yFL = bermFootUp(s, -fw), yFR = bermFootUp(s, fw);
        put(berm, s, -fw, yFL, s.s / 18, 0); put(berm, s, -dw, D, s.s / 18, 1.4); put(berm, s, dw, D, s.s / 18, 1.4); put(berm, s, fw, yFR, s.s / 18, 0);
        if (pBerm >= 0) {
          if (!s.openL) berm.ind.push(pBerm, pBerm + 1, rb2, pBerm + 1, rb2 + 1, rb2);
          if (!s.openR) berm.ind.push(pBerm + 2, pBerm + 3, rb2 + 2, pBerm + 3, rb2 + 3, rb2 + 2);
        }
        pBerm = rb2;
        const rg2 = glowB.pos.length / 3;
        for (const sd of [-1, 1]) { put(glowB, s, sd * (s.hw - 0.9), D + 0.08, 0, 0); put(glowB, s, sd * (s.hw - 0.5), D + 0.08, 1, 0); }
        if (pGlow >= 0) for (const a of [0, 2]) glowB.ind.push(pGlow + a, pGlow + a + 1, rg2 + a, pGlow + a + 1, rg2 + a + 1, rg2 + a); pGlow = rg2;
      } else if (underP) { // sleek protective rock/concrete hood over bridge-underpass tunnel (stays well below bridge soffit!)
        const dw = Wd + 1.2, fw = dw + 18, r = berm.pos.length / 3;
        const yFL = bermFootUp(s, -fw), yFR = bermFootUp(s, fw);
        put(berm, s, -fw, yFL, s.s / 18, 0); put(berm, s, -dw, D, s.s / 18, 1.2); put(berm, s, dw, D, s.s / 18, 2.4); put(berm, s, fw, yFR, s.s / 18, 3.6);
        if (pBerm >= 0) strip(berm, pBerm, r, 3); pBerm = r;
      }

      const every = sea ? 6 : 12;
      if ((i - ra) % every === 0) {
        if ((i - ra) % 12 === 0) lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.ramp + s.roof - (cave ? 0.9 : 0.45), s.z), new THREE.Quaternion().setFromAxisAngle(upV, Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1)));
        if (!cave) ribs.push(arch(s, Wd - 0.15, sea ? 0.32 : 0.38, H - 0.15));
      }
      if (cave && !s.openL && !s.openR && cw <= 0.25 && i > ra + 2 && i < rb - 2 && h2(i, 21) > 0.38) {
        const sd = h2(i, 23) > 0.5 ? 1 : -1, len = 1.3 + h2(i, 27) * 2.5, rr = 0.45 + h2(i, 29) * 0.6, lat = sd * (s.hw + 1.4);
        tites.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + len / 2 - 0.25, s.z + s.rz * lat), new THREE.Quaternion(), new THREE.Vector3(rr, len, rr)));
      }
      if (cave && s.roof > 21.5 && i > ra + 2 && i < rb - 2) { // ceiling stalactites strictly in high vaults (tips always >= 17.5 m!)
        const ang = (0.26 + h2(i, 5) * 0.48) * Math.PI, len = 1.1 + h2(i, 9) * 2.2, rr = 0.38 + h2(i, 3) * 0.58, nz = noise(Math.round(ang / Math.PI * segA));
        const lat = Math.cos(ang) * (Wd + nz), up = Math.sin(ang) * (H + nz) + 1.6;
        if (up - len > 17.5) tites.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + up - len / 2, s.z + s.rz * lat), flipQ, new THREE.Vector3(rr, len, rr)));
      }
    }
    // Portal arch frames + grounded headwalls (skipped on underground cave-branch junctions which open directly into the main cave!)
    if (!path.isCave) for (const e of [ra, rb]) {
      const s = S[e], cw = cave ? (s.caveW ?? 0) : 0, H = s.roof - 1.5, Wd = s.hw + 3.4 + cw, D = s.roof + DECK;
      const dw = sea ? Wd + 11 : Math.max(s.hw + 1.5, Wd - 1.2), fw = sea ? dw : dw + 20;
      ribs.push(arch(s, Wd + 0.9, 1.25, H + 1.1));
      const b = sea ? steel : berm, r0 = b.pos.length / 3;
      for (let a = 0; a <= segA; a++) {
        const ang = Math.PI * a / segA, c = Math.cos(ang), sn = Math.sin(ang);
        const raw = amp ? (vnoise(e * 0.2, a * 0.7) - 0.5) * amp : 0, nz = sn > 0.5 ? Math.max(-0.35, raw + 0.35 * amp * sn) : raw;
        put(b, s, c * (Wd + nz), sn * (H + nz) + (a === 0 || a === segA ? -2.2 : 1.5), c * 0.4 + 0.5, sn * 0.5);
        const t = Math.min(1, sn / 0.62), ox = sn < 0.62 ? Math.sign(c) * (fw + (dw - fw) * t) : dw * c / 0.785;
        const fy = sea ? -9 : bermFootUp(s, ox), oy = fy + (D - fy) * t;
        put(b, s, ox, oy, ox / 40 + 0.5, oy / 30 + 0.3);
      }
      for (let a = 0; a < segA; a++) { const k = r0 + a * 2; b.ind.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const geo = (b: Buf, ind = b.ind) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setIndex(ind); g.computeVertexNormals(); disp.push(g); return g; };
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = false) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; group.add(o); return o; };
  const m2 = (mat as THREE.MeshStandardMaterial).clone(); m2.side = THREE.DoubleSide; disp.push(m2);
  const sg = geo(shell); add(sg, m2, true);
  if (caveFloor.ind.length) add(geo(caveFloor), m2, false);
  if (winInd.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', sg.attributes.position); wg.setAttribute('uv', sg.attributes.uv); wg.setIndex(winInd); const wm = oceanWindowMaterial(seaY); add(wg, wm as unknown as THREE.Material); disp.push(wg, wm as unknown as { dispose: () => void }); }
  if (deck.ind.length) add(geo(deck), roadMat);
  if (berm.ind.length) add(geo(berm), m2, true);
  if (steel.ind.length) { const sm = (ribMat as THREE.MeshStandardMaterial).clone(); sm.side = THREE.DoubleSide; disp.push(sm); add(geo(steel), sm, true); }
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.5), side: THREE.DoubleSide }); disp.push(lm);
  if (glowB.ind.length) add(geo(glowB), lm);
  if (veinB.ind.length) add(geo(veinB), lm);
  if (ribs.length) { const rg = mergeGeometries(ribs)!; ribs.forEach(x => x.dispose()); const rm = new THREE.Mesh(rg, ribMat); rm.receiveShadow = true; group.add(rm); disp.push(rg); }
  const lg = new THREE.BoxGeometry(1.3, 0.28, 3.4); disp.push(lg);
  if (lamps.length) { const im = new THREE.InstancedMesh(lg, lm, lamps.length); lamps.forEach((mm, i) => im.setMatrixAt(i, mm)); group.add(im); }
  if (tites.length) { const tg = new THREE.ConeGeometry(1, 1, 6); disp.push(tg); const im = new THREE.InstancedMesh(tg, mat, tites.length); tites.forEach((mm, i) => im.setMatrixAt(i, mm)); im.receiveShadow = true; group.add(im); }
}

function addStartArea(td: TrackData, group: THREE.Group, theme: ThemeDef, disp: { dispose: () => void }[], rng: () => number, dOff = 0, heightAt: (x: number, z: number) => number = () => -20) {
  const S = td.main.samples;
  const mkGate = (idx: number, label: 'start' | 'finish') => {
    const s = S[idx]; const yaw = Math.atan2(s.tx, s.tz);
    (td.overheads ??= []).push({ idx, y0: s.y + 15.8, y1: s.y + 21.3, half: 1.7 }); // truss + start lights are solid
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = yaw; group.add(g);
    const metal = new THREE.MeshStandardMaterial({ color: '#868c96', metalness: 0.86, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.76, roughness: 0.46 });
    const accent = new THREE.MeshStandardMaterial({ color: theme.barrierColor, roughness: 0.48, metalness: 0.22 });
    const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6ee4ff').multiplyScalar(1.1) });
    const lightOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(label === 'start' ? '#ff3428' : '#30ff60').multiplyScalar(1.4) });
    disp.push(metal, dark, accent, glass, lightOn);

    // Collect every static start-arena element into 5 merged material buckets (~75 draws → 5 draws at the start line!)
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (mat: THREE.Material, raw: THREE.BufferGeometry, m?: THREE.Matrix4) => {
      const ng = raw.index ? raw.toNonIndexed() : raw; if (ng !== raw) raw.dispose();
      if (m) ng.applyMatrix4(m);
      let l = buckets.get(mat); if (!l) { l = []; buckets.set(mat, l); } l.push(ng);
    };
    // Session 9: fluted towers on stepped plinths with collar rings, braced buttress ladders & stay cables,
    // Warren box-truss gantry, framed timing screen, visored start-light housings (all merged into the same material buckets)
    const pSpan = s.hw + 3.4; const UPV = new THREE.Vector3(0, 1, 0), qS = new THREE.Quaternion(), dS = new THREE.Vector3();
    const strut = (mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, round = false) => {
      dS.set(bx - ax, by - ay, bz - az); const len = dS.length(); dS.normalize();
      const gg: THREE.BufferGeometry = round ? new THREE.CylinderGeometry(w * 0.5, w * 0.5, len, 8) : new THREE.BoxGeometry(w, len, w);
      gg.applyQuaternion(qS.setFromUnitVectors(UPV, dS)); gg.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); put(mat, gg);
    };
    for (const side of [-1, 1]) {
      const px = side * pSpan, wSide = -side;
      const fx = s.x + s.rx * wSide * (pSpan + 3), fz = s.z + s.rz * wSide * (pSpan + 3);
      const subH = theme.terrain === 'prison' ? 6 : Math.max(8, Math.min(28, s.y - heightAt(fx, fz) + 6));
      put(dark, new THREE.BoxGeometry(10.8, subH, 8.2).translate(px + side * 1.6, 0.35 - subH * 0.5, 0)); // deep foundation pier into slope (never floats!)
      put(dark, new THREE.BoxGeometry(6.6, 1.3, 7.6).translate(px, -0.25, 0));
      put(metal, new THREE.BoxGeometry(5.3, 1.7, 6.3).translate(px, 1.15, 0));
      put(accent, new THREE.BoxGeometry(5.5, 0.22, 6.5).translate(px, 2.05, 0));
      const tower = new THREE.CylinderGeometry(1.3, 2.15, 22.4, 28, 6); const tp = tower.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i); const k = 1 - 0.07 * Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 14), 2); tp.setX(i, x * k); tp.setZ(i, z * k); }
      tower.computeVertexNormals(); put(metal, tower.translate(px, 12.9, 0));
      for (const [cy, cr] of [[2.6, 2.4], [9.2, 2.02], [15.6, 1.76], [22.2, 1.52]]) put(dark, new THREE.TorusGeometry(cr, 0.24, 8, 28).rotateX(Math.PI / 2).translate(px, cy, 0));
      strut(dark, px + side * 4.7, 0.1, 0, px + side * 1.55, 17.6, 0, 0.72);
      for (let k = 0; k < 6; k++) { const y = 3.2 + k * 2.35, f = (y - 0.4) / 17.2; strut(dark, px + side * (4.7 - f * 3.15), y, 0, px + side * (2.1 - (y - 1.7) / 22.4 * 0.85), y, 0, 0.2, true); }
      put(metal, new THREE.SphereGeometry(2.3, 22, 14).scale(1, 0.84, 1).translate(px, 25.2, 0));
      put(dark, new THREE.TorusGeometry(2.33, 0.17, 8, 28).rotateX(Math.PI / 2).translate(px, 25.2, 0));
      put(accent, new THREE.TorusGeometry(1.5, 0.12, 6, 24).rotateX(Math.PI / 2).translate(px, 26.55, 0));
      put(metal, new THREE.CylinderGeometry(0.12, 0.35, 7.5, 8).translate(px, 30.6, 0));
      put(lightOn, new THREE.SphereGeometry(0.42, 8, 6).translate(px, 34.5, 0));
      strut(dark, px - side * 0.4, 26.8, 0, side * pSpan * 0.42, 21.0, 0, 0.14, true);
    }
    const y0 = 18.1, y1 = 20.7, zh = 1.15, xe = pSpan - 1.0;
    for (const z of [-zh, zh]) for (const y of [y0, y1]) strut(dark, -xe, y, z, xe, y, z, 0.44);
    const bays = Math.max(8, Math.round(xe * 2 / 3.3)), bw = xe * 2 / bays;
    for (let i = 0; i <= bays; i++) {
      const x = -xe + i * bw;
      for (const z of [-zh, zh]) { strut(metal, x, y0, z, x, y1, z, 0.2); if (i < bays) strut(metal, x, i % 2 ? y1 : y0, z, x + bw, i % 2 ? y0 : y1, z, 0.17); }
      strut(metal, x, y1, -zh, x, y1, zh, 0.2); strut(metal, x, y0, -zh, x, y0, zh, 0.2);
    }
    put(accent, new THREE.BoxGeometry(xe * 2 + 0.6, 0.3, 2.8).translate(0, y1 + 0.42, 0));
    put(metal, new THREE.BoxGeometry(12, 3.9, 3.0).translate(0, 23.15, 0));
    for (const y of [21.1, 25.2]) put(dark, new THREE.BoxGeometry(12.7, 0.36, 3.5).translate(0, y, 0));
    for (const x of [-6.2, 6.2]) put(dark, new THREE.BoxGeometry(0.4, 4.3, 3.5).translate(x, 23.15, 0));
    put(glass, new THREE.BoxGeometry(10.6, 2.5, 3.12).translate(0, 23.2, 0));
    for (let i = 0; i < 10; i++) {
      const lx = -s.hw * 0.9 + i * (s.hw * 1.8 / 9);
      strut(metal, lx, y0, -0.85, lx, 17.55, -0.85, 0.16);
      put(dark, new THREE.BoxGeometry(1.2, 1.6, 1.0).translate(lx, 16.8, -0.85));
      put(dark, new THREE.BoxGeometry(1.34, 0.12, 0.95).translate(lx, 17.62, -1.5));
      put(lightOn, new THREE.SphereGeometry(0.46, 10, 6).translate(lx, 16.75, -1.38));
    }

    // Tiered grandstands merged into the same metal/dark/accent buckets + 1 ultra-lean instanced crowd draw (10k tris)
    const crowdG = new THREE.BoxGeometry(0.52, 1.05, 0.42);
    const crowdM = new THREE.MeshStandardMaterial({ roughness: 0.82 }); disp.push(crowdG, crowdM);
    const count = 420; const crowd = new THREE.InstancedMesh(crowdG, crowdM, count * 2);
    let ci = 0; const col = new THREE.Color();
    for (const side of [-1, 1]) {
      const standM = new THREE.Matrix4().compose(new THREE.Vector3(side * (s.hw + 26), 0, -40), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * Math.PI / 2), new THREE.Vector3(1, 1, 1));
      for (let r = 0; r < 8; r++) put(r % 2 ? metal : dark, new THREE.BoxGeometry(72, 1.25, 2.25).translate(0, r * 1.2 + 0.6, r * 2.2), standM);
      put(dark, new THREE.BoxGeometry(73, 18, 19).translate(0, -9.05, 8.4), standM); // foundation block down into the ground: the stand never floats on a slope
      for (const px of [-32, -16, 0, 16, 32]) {
        put(dark, new THREE.CylinderGeometry(0.45, 0.55, 17.5, 8).translate(px, 8.75, 16.8), standM);
        put(metal, new THREE.BoxGeometry(0.5, 0.65, 21).rotateX(-0.06).translate(px, 16.9, 7.2), standM);
      }
      put(accent, new THREE.BoxGeometry(76, 0.45, 21.5).rotateX(-0.06).translate(0, 17.3, 7.2), standM);
      put(accent, new THREE.BoxGeometry(72, 1.1, 0.3).translate(0, 1.2, -1.2), standM);
      const local = new THREE.Matrix4(), full = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const r = Math.floor(rng() * 8); const x = (rng() - 0.5) * 68;
        local.makeTranslation(x, r * 1.2 + 1.65, r * 2.2 + (rng() - 0.5) * 1.2);
        crowd.setMatrixAt(ci, full.multiplyMatrices(standM, local));
        col.setHSL(rng(), 0.58, 0.34 + rng() * 0.32); crowd.setColorAt(ci, col); ci++;
      }
    }
    crowd.computeBoundingSphere(); g.add(crowd);

    // Paddock flags (1 instanced draw + poles merged into `metal`)
    const flagGeo = new THREE.PlaneGeometry(2.8, 8.5);
    const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }); disp.push(flagGeo, flagMat);
    const flagIm = new THREE.InstancedMesh(flagGeo, flagMat, 8);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      flagIm.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(side * (s.hw + 2.2), 6.2, 16 + i * 12), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)));
      flagIm.setColorAt(i, col.setHSL((i * 0.14) % 1, 0.68, 0.48));
      put(metal, new THREE.CylinderGeometry(0.1, 0.14, 11.5, 6).translate(side * (s.hw + 2.2), 5.75, 14.6 + i * 12));
    }
    flagIm.computeBoundingSphere(); g.add(flagIm);

    for (const [mat, list] of buckets) {
      const mg = mergeGeometries(list)!; list.forEach(x => x.dispose()); mg.computeVertexNormals(); mg.computeBoundingSphere();
      const cast = mat === metal || mat === dark || mat === accent;
      const m = new THREE.Mesh(mg, mat); m.castShadow = cast; m.receiveShadow = cast; g.add(m); disp.push(mg);
    }

    // Checkered start/finish line raised cleanly above road crown + displacement (zero Z-fighting!)
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const ctx = c.getContext('2d')!;
    for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { ctx.fillStyle = (x + y) % 2 ? '#121214' : '#f2efe8'; ctx.fillRect(x * 16, y * 16, 16, 16); }
    ctx.fillStyle = theme.barrierColor; ctx.fillRect(0, 0, 512, 4); ctx.fillRect(0, 60, 512, 4);
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 8;
    const lineMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.58, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // Road-crown & bank conforming checkered start/finish banner (flush from edge to edge, zero floating corners!)
    const lineGeo = new THREE.PlaneGeometry(s.hw * 1.92, 3.6, 14, 2); lineGeo.rotateX(-Math.PI / 2);
    const sPrev = S[Math.max(0, idx - 1)], sNext = S[Math.min(S.length - 1, idx + 1)];
    const slopeZ = (sNext.y - sPrev.y) / Math.max(2, Math.hypot(sNext.x - sPrev.x, sNext.z - sPrev.z));
    const lp = lineGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) {
      const lx = lp.getX(i), lz = lp.getZ(i), lat = -lx, e = Math.min(1, Math.abs(lat) / s.hw);
      lp.setY(i, -lat * s.bank + (1 - e * e) * 0.2 + lz * slopeZ + 0.045 + dOff);
    }
    lineGeo.computeVertexNormals();
    disp.push(ct, lineMat, lineGeo);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.receiveShadow = true; g.add(line);
  };
  mkGate(td.startIdx, 'start');
  if (!td.main.closed) mkGate(td.finishIdx, 'finish');
}

function rockGeo(detail: number, seed: number, stretch = 1) { return rockGeometry(detail, seed, stretch); }

function scatterDecor(
  theme: ThemeDef, group: THREE.Group, td: TrackData, heightAt: (x: number, z: number) => number,
  near: (x: number, z: number) => { d: number; s: Sample }, gfx: GfxSettings, disp: { dispose: () => void }[], rng: () => number,
  wallTex: ReturnType<typeof generateTexture>, roadClear: (x: number, z: number, r: number, margin?: number) => boolean, waterY: number,
) {
  const det = gfx.detail; const gq = gfx.geometry; const dens = Math.min(2.6, Math.max(1, td.N / 3000) * 1.2);
  const rockMat = surfaceMaterial(wallTex, {
    strata: STRATA[theme.id], repeat: [2, 2], normalScale: 1.55,
    emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff',
    emissiveIntensity: theme.id === 'lava' ? 1.35 : theme.id === 'crystal' ? 0.6 : 0,
  });
  disp.push(rockMat);
  const decorCells: { mesh: THREE.InstancedMesh; x: number; z: number; view2: number; sh2: number; lod?: THREE.InstancedMesh; lod2?: number }[] = [];
  // Sector-chunked + distance/shadow-culled InstancedMesh placement: skips distant sectors & shadows beyond the shadow box!
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, dMin: number, dMax: number, sMin: number, sMax: number, opts: { foot?: number; yOff?: number; tilt?: number; air?: number; shadow?: boolean; scaleY?: [number, number]; colors?: string[]; keepDry?: boolean; view?: number; lod?: { geo: THREE.BufferGeometry; dist: number } } = {}) => {
    count = Math.floor(count * det * dens); // Session 18: density follows the (longer) track + 20 % more decoration if (count <= 0) { geo.dispose(); return; }
    const SEC = dMax > 900 ? 900 : 340;
    const sectors = new Map<string, { m: THREE.Matrix4[]; c: THREE.Color[]; cx: number; cz: number }>();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 20) {
      tries++;
      const s = td.main.samples[Math.floor(rng() * td.N)];
      const ang = rng() * Math.PI * 2; const dist = dMin + Math.pow(rng(), 1.5) * (dMax - dMin);
      const x = s.x + Math.cos(ang) * (dist + s.hw), z = s.z + Math.sin(ang) * (dist + s.hw);
      const nn = near(x, z); const size = sMin + rng() * (sMax - sMin);
      if (nn.d < nn.s.hw + dMin * 0.5) continue;
      if (!opts.air && !roadClear(x, z, size * (opts.foot ?? 1.4), 2)) continue;
      let gy = opts.air ? nn.s.y + opts.air * (0.5 + rng()) : heightAt(x, z);
      if (!opts.air) { const fr = Math.min(16, size * (opts.foot ?? 1.4) * 0.55); gy = Math.min(gy, heightAt(x + fr, z), heightAt(x - fr, z), heightAt(x, z + fr), heightAt(x, z - fr)); } // seat on the lowest point of the footprint
      if (opts.keepDry && !opts.air && gy < waterY + 0.3) continue;
      const y = gy + (opts.yOff ?? 0) * size;
      const sy = opts.scaleY ? opts.scaleY[0] + rng() * (opts.scaleY[1] - opts.scaleY[0]) : 1;
      e.set((rng() - 0.5) * (opts.tilt ?? 0), rng() * Math.PI * 2, (rng() - 0.5) * (opts.tilt ?? 0)); q.setFromEuler(e);
      const chunk = (count > 80 || !!opts.lod) && !opts.air;
      const sxI = Math.floor(x / SEC), szI = Math.floor(z / SEC);
      const key = chunk ? `${sxI},${szI}` : 'all';
      let sec = sectors.get(key); if (!sec) { sec = { m: [], c: [], cx: (sxI + 0.5) * SEC, cz: (szI + 0.5) * SEC }; sectors.set(key, sec); }
      sec.m.push(new THREE.Matrix4().compose(v.set(x, y, z), q, sc.set(size, size * sy, size)));
      if (opts.colors) sec.c.push(new THREE.Color(opts.colors[Math.floor(rng() * opts.colors.length)]));
      placed++;
    }
    const cast = opts.shadow ?? (dMin < 40 && sMax >= 2.2);
    const viewD = opts.view ?? (dMax > 900 ? 3400 : Math.min(1350, dMax * 2.1 + 380));
    const pad = SEC * 0.72;
    for (const [k, sec] of sectors) {
      const im = new THREE.InstancedMesh(geo, mat, sec.m.length);
      for (let i = 0; i < sec.m.length; i++) { im.setMatrixAt(i, sec.m[i]); if (sec.c.length) im.setColorAt(i, sec.c[i]); }
      im.castShadow = cast && k === 'all'; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im);
      if (k !== 'all') {
        const cell: (typeof decorCells)[number] = { mesh: im, x: sec.cx, z: sec.cz, view2: (viewD + pad) ** 2, sh2: cast ? (150 + pad) ** 2 : 0 };
        if (opts.lod) { // far-sector LOD twin: identical transforms/colours, ~1/4 of the triangles, never casts shadows
          const lm = new THREE.InstancedMesh(opts.lod.geo, mat, sec.m.length);
          for (let i = 0; i < sec.m.length; i++) { lm.setMatrixAt(i, sec.m[i]); if (sec.c.length) lm.setColorAt(i, sec.c[i]); }
          lm.receiveShadow = true; lm.visible = false; lm.computeBoundingSphere(); group.add(lm);
          cell.lod = lm; cell.lod2 = (opts.lod.dist + pad) ** 2;
        }
        decorCells.push(cell);
      }
    }
    disp.push(geo); if (opts.lod) disp.push(opts.lod.geo);
  };
  const d1 = gq >= 2 ? 2 : 1; // detail=2 = 320 crisp faceted tris/rock (4× leaner than detail=3, identical with normal map)
  for (const kind of theme.decor) {
    switch (kind) {
      case 'rocks': for (let v = 0; v < 3; v++) place(rockGeo(d1, 1 + v * 5, 0.66 + v * 0.1), rockMat, 160, 8, 320, 1.5, 7.2, { foot: 1.5, yOff: -0.06, tilt: 0.38 }); break;
      case 'lavaRocks': for (let v = 0; v < 3; v++) place(rockGeo(d1, 4 + v * 3, 0.74 + v * 0.1), rockMat, 160, 8, 420, 2, 12.5, { foot: 1.5, yOff: -0.08, tilt: 0.38 }); break;
      case 'spires': {
        // Stratified hoodoos (hard/soft ledges, flutes, talus skirt, caprock) – 3 seeded variants
        const per = [64, 52, 44];
        for (let v = 0; v < 3; v++) place(spireGeometry(11 + v * 7, gq >= 2 ? 22 : 14, gq >= 2 ? 11 : 8), rockMat, per[v], 40, 920, 8, 22, { foot: 1.6, scaleY: [2.3, 5.0], yOff: -0.02, lod: { geo: spireGeometry(11 + v * 7, gq >= 2 ? 11 : 9, gq >= 2 ? 11 : 8), dist: 430 } });
        break;
      }
      case 'mesas': {
        for (let v = 0; v < 2; v++) place(mesaGeometry(3 + v * 5, gq >= 2 ? 48 : 30), rockMat, 21, 300, 2200, 52, 165, { foot: 1.65, scaleY: [0.5, 1.15], yOff: -0.03, shadow: false });
        break;
      }
      case 'cacti': {
        const cm = new THREE.MeshStandardMaterial({ color: '#4d7034', roughness: 0.8 }); disp.push(cm);
        for (let v = 0; v < 2; v++) place(cactusGeometry(2 + v * 3), cm, 140, 10, 300, 0.8, 1.65, { foot: 1.5, keepDry: true, colors: ['#ffffff', '#dfe8c8', '#c8dcb0'] });
        break;
      }
      case 'iceSpikes': {
        // Faceted glacial shard clusters. Flicker-free standard material (avoids dual-BRDF clearcoat fireflies)
        const im = new THREE.MeshStandardMaterial({ color: '#a8dcff', roughness: 0.16, metalness: 0.12, emissive: '#2a6a9a', emissiveIntensity: 0.3, flatShading: true }); disp.push(im);
        for (let v = 0; v < 2; v++) place(crystalClusterGeometry(3 + v * 4, gq >= 2 ? 7 : 5, 1.0, 0.3, 2.3, 0.55), im, 190, 8, 500, 2, 8, { foot: 1.3, scaleY: [2, 6], tilt: 0.35, colors: ['#ffffff', '#d8f0ff', '#c0e4ff'] });
        break;
      }
      case 'pines': {
        const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }); disp.push(pm);
        place(pineGeometry(gq >= 2 ? 6 : 4, gq >= 2 ? 9 : 7, true), pm, 860, 15, 720, 1.4, 3.1, { foot: 2.6, keepDry: true, scaleY: [0.85, 1.25] }); break;
      }
      case 'trees': {
        // Emergent rainforest trees (buttress roots, forked boughs, layered canopy lobes, lianas) – 2 seeded variants, sector-culled
        const tm = treeMaterial(disp); // atlas: real bark photo + leaf sprigs with alpha (foliage.ts)
        for (let v = 0; v < 2; v++) place(jungleTreeGeometry(5 + v * 8, gq), tm, 470, 10, 620, 1, 2.45, { foot: 6.5, keepDry: true, scaleY: [0.85, 1.2], colors: ['#dce8cf', '#ffffff', '#e8f0c8', '#c8dec0'], lod: { geo: jungleTreeGeometry(5 + v * 8, gq, true), dist: 240 } });
        break;
      }

      case 'crystals': {
        const cm = new THREE.MeshStandardMaterial({ color: '#c8a0ff', roughness: 0.16, metalness: 0.14, emissive: '#8a3aff', emissiveIntensity: 0.72, flatShading: true }); disp.push(cm);
        for (let v = 0; v < 2; v++) place(crystalClusterGeometry(9 + v * 6, gq >= 2 ? 8 : 5, 5.4, 0.44, 2.6, 0.6), cm, 300, 6, 500, 1.5, 6, { foot: 1.4, tilt: 0.25, colors: ['#d0a0ff', '#90c0ff', '#ff90e0'] });
        break;
      }
      case 'wrecks': {
        // Crashed podracer turbine nacelle with cowling ring, intake cone & crumpled stabilizer fin
        // Session 9: torn open-ended cowling with exposed frame ribs, bent intake spike, crumpled fin, snapped strut & loose hull plates
        const g = mergeGeometries([
          new THREE.CylinderGeometry(0.95, 1.25, 6.2, 16, 1, true).rotateZ(Math.PI / 2),
          new THREE.CylinderGeometry(0.8, 1.05, 5.6, 12, 1, true).rotateZ(Math.PI / 2),
          new THREE.TorusGeometry(1.22, 0.18, 8, 16).rotateY(Math.PI / 2).translate(-2.9, 0, 0),
          new THREE.ConeGeometry(0.65, 1.9, 12).rotateZ(Math.PI / 2 + 0.22).translate(-2.5, 0.1, 0),
          new THREE.BoxGeometry(2.6, 0.2, 3.8).rotateX(0.28).rotateZ(0.12).translate(0.5, 0.95, 0.6),
          new THREE.TorusGeometry(1.02, 0.15, 6, 16).rotateY(Math.PI / 2).translate(2.8, 0, 0),
          ...[3.5, 4.3, 5.1].map((x, k) => new THREE.TorusGeometry(0.98 - k * 0.07, 0.07, 5, 12, Math.PI * (1.25 - k * 0.2)).rotateY(Math.PI / 2).rotateX(0.6 + k * 0.5).translate(x, 0, 0)),
          new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6).rotateZ(1.1).rotateY(0.5).translate(3.6, 0.3, -1.2),
          new THREE.BoxGeometry(1.5, 0.08, 1.1).rotateZ(0.5).rotateY(0.7).translate(1.8, -0.55, -2.2),
          new THREE.BoxGeometry(1.1, 0.08, 0.8).rotateZ(-0.35).rotateY(-0.4).translate(-1.2, -0.6, 2.1),
          new THREE.CylinderGeometry(0.42, 0.5, 1.1, 10).rotateX(1.2).translate(4.4, -0.45, 1.5),
        ].map(x => x.toNonIndexed()))!;
        const wm = new THREE.MeshStandardMaterial({ color: '#615044', metalness: 0.72, roughness: 0.56, side: THREE.DoubleSide }); disp.push(wm);
        place(g, wm, 64, 10, 210, 0.85, 1.55, { foot: 3.5, tilt: 0.55, yOff: -0.05, keepDry: true }); break;
      }
      case 'balloons': {
        const bm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.48, metalness: 0.22 }); disp.push(bm);
        place(airshipGeometry(), bm, 40, 60, 1200, 6, 14, { air: 120, shadow: false, colors: ['#d84a3a', '#e8c24a', '#4a8ad8', '#e8e0d0'] }); break;
      }
      case 'pylons': {
        const pm = new THREE.MeshStandardMaterial({ color: '#606878', metalness: 0.9, roughness: 0.28, emissive: theme.barrierColor, emissiveIntensity: 0.38 }); disp.push(pm);
        place(pylonGeometry(), pm, 90, 30, 900, 1, 2, { foot: 3.2 }); break;
      }
    }
  }
  return decorCells;
}

function addArches(
  td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], rng: () => number,
  roadClear: (x: number, z: number, r: number, margin?: number) => boolean,
  heightAt: (x: number, z: number) => number, waterY: number, isPrison: boolean,
) {
  const S = td.main.samples; const list: THREE.BufferGeometry[] = [];
  const upV = new THREE.Vector3(0, 1, 0);
  for (const idx of td.arches) {
    const s = S[idx]; const span = s.hw + 12;
    if (s.roof > 0 || s.zeroG || s.bridge || s.underpass || s.openL || s.openR) continue;
    const feetOk = [-1, 1].every(sd => roadClear(s.x + s.rx * sd * span, s.z + s.rz * sd * span, 5.5, 0.5));
    if (!feetOk) continue;
    const tube = 4.2 + rng() * 3.2;
    const g = new THREE.TorusGeometry(span, tube, 20, 56, Math.PI);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.8 + fbm(x * 0.15, y * 0.15 + z * 0.2, 4) * 0.62;
      const ledge = Math.sin(y * 0.55) * 0.45;
      p.setXYZ(i, x + (x * 0.06) * (n - 1) * 5, y * 0.76 + (n - 1) * 3, z * n * 1.65 + ledge);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 2.2);
    const syR = 1.3 + rng() * 0.72, qY = new THREE.Quaternion().setFromAxisAngle(upV, Math.atan2(s.tx, s.tz));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y - 2.5, s.z), qY, new THREE.Vector3(1, syR, 1)));
    (td.overheads ??= []).push({ idx, y0: 0, y1: 0, half: tube * 1.35, arch: { R: span, sy: 0.76 * syR, inner: tube * 1.3, yOff: -2.5, thick: tube * 2 * 0.76 * syR } });
    list.push(g.index ? g.toNonIndexed() : g); if (g.index) g.dispose();
    // Sculpted stratified rock pillar foundations extending from BOTH arch feet deep into the terrain/seabed below (0 floating arches!)
    for (const sd of [-1, 1]) {
      const fx = s.x + s.rx * sd * span, fz = s.z + s.rz * sd * span;
      const top = s.y + 0.5;
      const gMin = isPrison ? s.y - 14 : Math.min(
        heightAt(fx, fz), heightAt(fx + 5, fz), heightAt(fx - 5, fz), heightAt(fx, fz + 5), heightAt(fx, fz - 5),
        waterY > -1e8 ? Math.max(waterY - 10, heightAt(fx, fz) - 6) : 1e9,
      ) - 9;
      const bot = Math.max(s.y - 52, Math.min(s.y - 11, gMin)), pH = Math.max(8, top - bot);
      const leg = new THREE.CylinderGeometry(tube * 1.05, tube * 1.62, pH, 14, 6);
      const lp = leg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < lp.count; i++) {
        const lx = lp.getX(i), ly = lp.getY(i), lz = lp.getZ(i);
        const k = 0.86 + fbm(lx * 0.16 + sd * 3, ly * 0.14 + lz * 0.18, 3) * 0.42;
        lp.setXYZ(i, lx * k, ly, lz * k * 1.55);
      }
      leg.computeVertexNormals();
      const luv = leg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 2.4, pH / 16 * luv.getY(i));
      leg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(fx, bot + pH * 0.5, fz), qY, new THREE.Vector3(1, 1, 1)));
      list.push(leg.toNonIndexed()); leg.dispose();
    }
  }
  if (!list.length) return;
  const merged = mergeGeometries(list); list.forEach(g => g.dispose()); if (!merged) return;
  const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); disp.push(merged);
}

function addObstacles(td: TrackData, group: THREE.Group, theme: ThemeDef, rockMat: THREE.Material, disp: { dispose: () => void }[]) {
  // High-contrast yellow/black hazard texture + luminous amber/red beacons so EVERY obstacle pops at 750 km/h!
  const hzCv = document.createElement('canvas'); hzCv.width = hzCv.height = 128; const hc = hzCv.getContext('2d')!;
  hc.fillStyle = '#f0b418'; hc.fillRect(0, 0, 128, 128); hc.fillStyle = '#141518';
  for (let i = -128; i < 256; i += 32) { hc.beginPath(); hc.moveTo(i, 0); hc.lineTo(i + 16, 0); hc.lineTo(i + 16 - 128, 128); hc.lineTo(i - 128, 128); hc.fill(); }
  const hzTex = new THREE.CanvasTexture(hzCv); hzTex.colorSpace = THREE.SRGBColorSpace; hzTex.wrapS = hzTex.wrapT = THREE.RepeatWrapping;
  const hazMat = new THREE.MeshStandardMaterial({ map: hzTex, roughness: 0.44, metalness: 0.25, emissive: '#ff9a10', emissiveIntensity: 0.22 });
  const warn = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5418').multiplyScalar(1.45) });
  const ringGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.4) });
  const mastMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.8, roughness: 0.4 });
  disp.push(hzTex, hazMat, warn, ringGlow, mastMat);

  const rocks: THREE.Matrix4[] = [], cols: THREE.Matrix4[] = [], rings: THREE.Matrix4[] = [];
  const boxes: THREE.Matrix4[] = [], beacons: THREE.Matrix4[] = [], masts: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), I = new THREE.Quaternion();
  const C = (x: number, y: number, z: number, qq: THREE.Quaternion, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), qq, new THREE.Vector3(sx, sy, sz));

  // every instance remembers its obstacle so a smashed one can be removed from all instanced meshes
  let cur: Obstacle | null = null; const refs = new Map<Obstacle, [THREE.Matrix4[], number][]>();
  const add = (list: THREE.Matrix4[], m: THREE.Matrix4) => { let l = refs.get(cur!); if (!l) { l = []; refs.set(cur!, l); } l.push([list, list.length]); list.push(m); };
  // Align ground warning rings & crates flush to the local 3D road slope + bank, and embed obstacle bases into the road slab!
  const surfQ = (o: Obstacle) => {
    const P = td.paths[o.path].samples, n = P.length, s = P[o.idx];
    const sA = P[Math.max(0, o.idx - 2)], sB = P[Math.min(n - 1, o.idx + 2)];
    const ds = Math.max(1, Math.hypot(sB.x - sA.x, sB.z - sA.z));
    const sl = ((sB.y - o.lat * sB.bank) - (sA.y - o.lat * sA.bank)) / ds;
    const fwd = new THREE.Vector3(s.tx, sl, s.tz).normalize();
    const locX = new THREE.Vector3(-s.rx, s.bank, -s.rz).normalize();
    const up = new THREE.Vector3().crossVectors(fwd, locX).normalize();
    locX.crossVectors(up, fwd).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(locX, up, fwd));
  };
  for (const o of td.obstacles) {
    if (o.kind >= 3) continue;
    cur = o;
    const sq = surfQ(o);
    add(rings, C(o.x, o.y + 0.1, o.z, sq, o.r * 1.18, 1.3, o.r * 1.18));
    if (o.kind === 0) {
      e.set((o.idx * 0.13) % 0.24 - 0.12, o.idx * 1.3, 0); q.setFromEuler(e);
      const hRock = o.r * 1.55;
      add(rocks, C(o.x, o.y + hRock * 0.28, o.z, q.clone(), o.r * 1.08, hRock, o.r * 1.08)); // deeply embedded base (never floats on slopes!)
      add(masts, C(o.x, o.y + hRock * 0.9 + 1.0, o.z, I, 1, 2.4, 1));
      add(beacons, C(o.x, o.y + hRock * 0.9 + 2.35, o.z, I, 1.15, 1.15, 1.15));
    } else if (o.kind === 1) {
      add(cols, C(o.x, o.y, o.z, I, o.r, 1, o.r));
      for (const h of [2.0, 4.6, 7.2]) add(rings, C(o.x, o.y + h, o.z, I, o.r * 0.96, 1.1, o.r * 0.96));
      add(beacons, C(o.x, o.y + 9.8, o.z, I, 1.25, 1.25, 1.25));
    } else {
      const rq = sq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.idx));
      const bh = o.r * 1.48;
      add(boxes, C(o.x, o.y + bh * 0.42 - 0.12, o.z, rq, o.r * 1.42, bh, o.r * 1.42)); // tilted with road + embedded bottom
      add(masts, C(o.x, o.y + bh * 0.92 + 0.8, o.z, I, 1, 1.8, 1));
      add(beacons, C(o.x, o.y + bh * 0.92 + 1.85, o.z, I, 1.15, 1.15, 1.15));
    }
  }
  const meshOf = new Map<THREE.Matrix4[], THREE.InstancedMesh>();
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    if (!list.length) { geo.dispose(); return; }
    const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); disp.push(geo); meshOf.set(list, im);
  };
  inst(rockGeo(2, 9, 1.05), rockMat, rocks);
  const colGeo = mergeGeometries([
    new THREE.CylinderGeometry(1.18, 1.32, 2.2, 12).translate(0, -1.05, 0), // buried plinth prevents slope under-gap
    new THREE.CylinderGeometry(1.02, 1.18, 1.4, 12).translate(0, 0.7, 0),
    new THREE.CylinderGeometry(0.84, 0.98, 7.6, 12).translate(0, 4.8, 0),
    new THREE.CylinderGeometry(1.05, 0.86, 1.0, 12).translate(0, 9.0, 0),
  ].map(x => x.toNonIndexed()))!;
  inst(colGeo, rockMat, cols);
  inst(new THREE.TorusGeometry(0.98, 0.13, 6, 24).rotateX(Math.PI / 2), ringGlow, rings);
  inst(new THREE.BoxGeometry(1, 1, 1), hazMat, boxes);
  inst(new THREE.CylinderGeometry(0.1, 0.14, 1, 6), mastMat, masts);
  inst(new THREE.OctahedronGeometry(0.48, 1), warn, beacons);
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  return { breakObstacle: (o: Obstacle) => { for (const [list, i] of refs.get(o) ?? []) { const im = meshOf.get(list); if (im) { im.setMatrixAt(i, ZERO_M); im.instanceMatrix.needsUpdate = true; } } } };
}

function buildZeroGTubes(path: Path, group: THREE.Group, mat: THREE.Material, ribMat: THREE.Material, disp: { dispose: () => void }[], theme: ThemeDef) {
  const S = path.samples; const n = S.length; const upV = new THREE.Vector3(0, 1, 0);
  let i = 0;
  while (i < n) {
    if (!S[i].zeroG) { i++; continue; }
    let j = i; while (j < n && S[j].zeroG) j++;
    const from = i + 2, to = j - 3;
    const segA = 24; const pos: number[] = [], uv: number[] = [], ind: number[] = [];
    let v = 0; const lamps: THREE.Matrix4[] = [], rings: THREE.BufferGeometry[] = [];
    for (let k = from; k <= to; k += 2) {
      const s = S[k]; const R = s.hw + 3;
      for (let a = 0; a <= segA; a++) {
        const ang = Math.PI * 2 * a / segA; const lat = Math.cos(ang) * R; const up = Math.sin(ang) * R + 7;
        const nz = (vnoise(k * 0.15, a * 0.5) - 0.5) * 1.0;
        pos.push(s.x + s.rx * (lat + nz * Math.cos(ang)), s.y + up + nz * Math.sin(ang), s.z + s.rz * (lat + nz * Math.cos(ang)));
        uv.push(s.s / 14, a / segA * 4);
      }
      if (k > from) for (let a = 0; a < segA; a++) { const p0 = v - (segA + 1) + a, p1 = v + a; ind.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
      v += segA + 1;
      const yaw = Math.atan2(s.tx, s.tz);
      if (k % 12 === 0) {
        lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + R + 6.4, s.z), new THREE.Quaternion().setFromAxisAngle(upV, yaw), new THREE.Vector3(1, 1, 1)));
        // Armored containment bulkhead ring encircling the Zero-G tube
        const rg = new THREE.TorusGeometry(R + 0.35, 0.55, 8, 28);
        rg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + 7, s.z), new THREE.Quaternion().setFromAxisAngle(upV, yaw), new THREE.Vector3(1, 1, 1)));
        rings.push(rg.toNonIndexed()); rg.dispose();
      }
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
      const m2 = (mat as THREE.MeshStandardMaterial).clone(); m2.side = THREE.DoubleSide; m2.transparent = true; m2.opacity = 0.72;
      const m = new THREE.Mesh(g, m2); m.receiveShadow = true; group.add(m); disp.push(g, m2);
    }
    if (rings.length) { const rg = mergeGeometries(rings)!; rings.forEach(x => x.dispose()); const rm = new THREE.Mesh(rg, ribMat); group.add(rm); disp.push(rg); }
    const lg = new THREE.BoxGeometry(1.3, 0.3, 4.2);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.5) });
    if (lamps.length) { const im = new THREE.InstancedMesh(lg, lm, lamps.length); lamps.forEach((mm, k) => im.setMatrixAt(k, mm)); group.add(im); disp.push(lg, lm); }
    i = j;
  }
}

function addAsteroidBelt(td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], rng: () => number) {
  const b = td.bounds; const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.9 + 1800;
  const geo = rockGeo(2, 17, 0.76); disp.push(geo);
  const count = 280; const im = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2; const r = R * (0.85 + Math.pow(rng(), 1.5) * 2.2); const h = (rng() - 0.5) * 1400;
    const size = 8 + Math.pow(rng(), 2) * 92;
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    m.compose(v.set(cx + Math.cos(a) * r, h, cz + Math.sin(a) * r), q, sc.set(size, size * (0.6 + rng() * 0.8), size));
    im.setMatrixAt(i, m);
  }
  im.castShadow = true; group.add(im);
}
