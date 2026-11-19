import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import { detailKindForTheme, generateTexture, generateTextures, type TexSpec } from './textures';
import { surfaceMaterial } from './materials';
import { mulberry32, type Path, type Sample, type TrackData, type Obstacle } from './trackBuilder';
import { addProps, type Emitter } from './props';
import { addMechProps } from './mechProps';
import { addSciFi } from './scifi';
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
  const waterY = T === 'lava' ? Math.min(avgY - 14, td.bounds.minY - 8) : (T === 'jungle' || theme.id === 'ice') ? Math.min(avgY - 12, td.bounds.minY - 12) : T === 'ocean' ? avgY - 26 : -1e9;

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
      const flag = pv.gap !== b.gap || pv.canyon !== b.canyon || pv.openL !== b.openL || pv.openR !== b.openR || b.ramp > 0 || pv.ramp > 0;
      const dy = Math.abs((b.y + b.ramp) - (a.y + a.ramp)) + Math.abs(b.bank - a.bank) * b.hw;
      if (flag && i - 1 > last) { idxs.push(i - 1); last = i - 1; }
      if (flag || i - last >= maxStep || turn > 0.022 || dy > 0.55) { idxs.push(i); last = i; }
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
        // 3-point sculpted embankment skirt
        const okS = !s.gap;
        const bx = ex + s.rx * side * 3.8, bz = ez + s.rz * side * 3.8;
        const depth = okS ? Math.max(6.2, ey - heightAt(bx, bz) + 3.2) : 16;
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

    // ---- shortcut tunnels with structural support ribs & Oovo Zero-G containment tubes ----
    buildTunnel(path, group, wallMat, abutmentMetal, disposables, theme);
    if (td.def.theme === 'oovo') buildZeroGTubes(path, group, wallMat, abutmentMetal, disposables, theme);
  }

  // ---- ramp warning chevrons (instanced) ----
  {
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.25), side: THREE.DoubleSide });
    const S = td.main.samples; const mats: THREE.Matrix4[] = [];
    for (let i = 1; i < S.length; i++) {
      if (!(S[i].ramp > 0 && S[i - 1].ramp === 0)) continue;
      for (let c = 0; c < 4; c++) {
        const s = S[(i + c * 4) % S.length]; const yaw = Math.atan2(s.tx, s.tz);
        for (const side of [-1, 1]) {
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, yaw + side * 0.6, -yaw + Math.PI / 2 + side * 0.5, 'YXZ'));
          mats.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x + s.rx * side * (s.hw * 0.4), s.y + s.ramp - side * s.hw * 0.4 * s.bank + 0.35, s.z + s.rz * side * s.hw * 0.4), q, new THREE.Vector3(1, 1, 1)));
        }
      }
    }
    if (mats.length) { const geo = new THREE.PlaneGeometry(4, 0.6); const im = new THREE.InstancedMesh(geo, chevMat, mats.length); mats.forEach((m, k) => im.setMatrixAt(k, m)); im.computeBoundingSphere(); group.add(im); disposables.push(geo, chevMat); }
  }

  // ---- upgraded start / finish arena (merged by material for crisp start-grid FPS) ----
  addStartArea(td, group, theme, disposables, rng, roadDispOff);
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
    const wm = waterMaterial(theme.id, wt.normalMap, theme.clouds * 0.35);
    const pg = new THREE.PlaneGeometry(W, D);
    const wp = new THREE.Mesh(pg, wm); wp.rotation.x = -Math.PI / 2; wp.position.set(cxm, waterY, czm); wp.receiveShadow = true; group.add(wp); glossy.push(wp);
    disposables.push(wm, pg);
    if (T === 'ocean') addViaductPiers(td, group, abutmentMetal, disposables, 44, s => ({ bot: waterY - 8, top: s.y - 1.2, w: s.hw * 1.65, r: 1.9 }));
  } else if (T === 'prison') {
    addAsteroidBelt(td, group, wallMat, disposables, rng);
    addViaductPiers(td, group, abutmentMetal, disposables, 56, s => s.zeroG ? null : ({ bot: s.y - 380, top: s.y - 1.5, w: s.hw * 1.7, r: 2.5 }));
  } else if (T === 'city') {
    addViaductPiers(td, group, abutmentMetal, disposables, 38, s => ({ bot: -165, top: s.y - 1.5, w: s.hw * 1.75, r: 3.2 }));
  }

  progress(0.82, 'Platziere Landschaftsdetails …'); await yield_();
  const distToTrack = (x: number, z: number) => nearest(x, z);
  const decorCells = scatterDecor(theme, group, td, heightAt, distToTrack, gfx, disposables, rng, wallTex, roadClear, waterY);
  addArches(td, group, wallMat, disposables, rng, roadClear);
  const obstFx = addObstacles(td, group, theme, wallMat, disposables);
  progress(0.9, 'Platziere Streckendetails …'); await yield_();
  // Session 15: objects are seated on the LOWEST ground point under their footprint (sampling only the centre left them floating on slopes)
  const groundMin = (x: number, z: number, r: number) => Math.min(heightAt(x, z), heightAt(x + r, z), heightAt(x - r, z), heightAt(x, z + r), heightAt(x, z - r));
  const props = addProps(td, theme, group, gfx, (x, z) => groundMin(x, z, 1.4), disposables, rng, roadClear, roadDispOff);
  addSciFi(td, theme, group as never, disposables);
  const mech = addMechProps(td, theme, group, disposables, (x, z) => groundMin(x, z, 2.8), roadClear, waterY, gfx.detail);
  const setPieces = buildSetPieces(td, theme, group, disposables, wallMat);
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

  const detail = addTrackDetail(td, theme, group, disposables, rng, wallMat, { across, disp: roadDispOff, detail: gfx.detail, tvCams, batcher, groundTex });
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
) {
  const S = td.main.samples; const cols: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < S.length; i += step) {
    const s = S[i]; if (s.gap) continue;
    const sp = spec(s); if (!sp || sp.top - sp.bot < 6) continue;
    const yaw = Math.atan2(s.tx, s.tz); const q = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    const h = sp.top - sp.bot;
    caps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, sp.top - 0.9, s.z), q, new THREE.Vector3(sp.w, 2.2, sp.r * 2.2)));
    for (const sd of [-0.34, 0.34]) {
      const lx = s.x + s.rx * sd * sp.w, lz = s.z + s.rz * sd * sp.w;
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

function buildTunnel(path: Path, group: THREE.Group, mat: THREE.Material, ribMat: THREE.Material, disp: { dispose: () => void }[], theme: ThemeDef) {
  // Session 16: one tunnel per run of roofed samples (shortcuts AND the new main-path tunnels). The cross-section is sheared with the
  // road bank so banked corners stay inside the shell; both mouths get a heavy portal frame.
  const S = path.samples; const n = S.length;
  const runs: [number, number][] = []; let a0 = -1;
  for (let i = 0; i < n; i++) { const on = S[i].roof > 0; if (on && a0 < 0) a0 = i; if ((!on || i === n - 1) && a0 >= 0) { const b0 = on ? i : i - 1; if (b0 - a0 >= 6) runs.push([a0, b0]); a0 = -1; } }
  if (!runs.length) return;
  const segA = 18; const pos: number[] = [], uv: number[] = [], ind: number[] = [];
  let v = 0; const lamps: THREE.Matrix4[] = [], ribs: THREE.BufferGeometry[] = [];
  const upV = new THREE.Vector3(0, 1, 0);
  const arch = (s: Sample, R: number, tube: number, H: number) => { // half torus in the track's cross-section, sheared with the bank (local x = -lat)
    const rg = new THREE.TorusGeometry(R, tube, 8, 28, Math.PI); rg.scale(1, H / R, 1);
    const p = rg.attributes.position as THREE.BufferAttribute; for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + p.getX(k) * s.bank);
    rg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.ramp + 1, s.z), new THREE.Quaternion().setFromAxisAngle(upV, Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1)));
    const out = rg.toNonIndexed(); rg.dispose(); return out;
  };
  for (const [ra, rb] of runs) {
    let first = true;
    for (let i = ra; i <= rb; i = i === rb ? rb + 1 : Math.min(rb, i + 2)) {
      const s = S[i], H = s.roof - 1, W = s.hw + 1.5;
      for (let a = 0; a <= segA; a++) {
        const ang = Math.PI * a / segA; const nz = (vnoise(i * 0.2, a * 0.7) - 0.5) * 1.5;
        const lat = Math.cos(ang) * W + nz * Math.cos(ang), up = Math.sin(ang) * H + 1 + nz * Math.sin(ang);
        pos.push(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + up, s.z + s.rz * lat);
        uv.push(s.s / 15, a / segA * 2.2);
      }
      if (!first) for (let a = 0; a < segA; a++) { const p0 = v - (segA + 1) + a, p1 = v + a; ind.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
      first = false; v += segA + 1;
      if ((i - ra) % 12 === 0) {
        lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.ramp + s.roof - 0.6, s.z), new THREE.Quaternion().setFromAxisAngle(upV, Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1)));
        ribs.push(arch(s, s.hw + 1.3, 0.36, H - 0.2)); // structural steel rib
      }
    }
    for (const e of [ra, rb]) ribs.push(arch(S[e], S[e].hw + 2.3, 1.25, S[e].roof + 0.6)); // portal frames
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
  const m2 = (mat as THREE.MeshStandardMaterial).clone(); m2.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, m2); m.castShadow = true; m.receiveShadow = true; group.add(m); disp.push(g, m2);
  if (ribs.length) { const rg = mergeGeometries(ribs)!; ribs.forEach(x => x.dispose()); const rm = new THREE.Mesh(rg, ribMat); rm.receiveShadow = true; group.add(rm); disp.push(rg); }
  const lg = new THREE.BoxGeometry(1.3, 0.28, 3.4);
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.5) });
  if (lamps.length) { const im = new THREE.InstancedMesh(lg, lm, lamps.length); lamps.forEach((mm, i) => im.setMatrixAt(i, mm)); group.add(im); disp.push(lg, lm); }
}

function addStartArea(td: TrackData, group: THREE.Group, theme: ThemeDef, disp: { dispose: () => void }[], rng: () => number, dOff = 0) {
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
      const px = side * pSpan;
      put(dark, new THREE.BoxGeometry(6.6, 1.3, 7.6).translate(px, -0.25, 0));
      put(metal, new THREE.BoxGeometry(5.3, 1.7, 6.3).translate(px, 1.15, 0));
      put(accent, new THREE.BoxGeometry(5.5, 0.22, 6.5).translate(px, 2.05, 0));
      const tower = new THREE.CylinderGeometry(1.3, 2.15, 22.4, 28, 6); const tp = tower.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i); const k = 1 - 0.07 * Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 14), 2); tp.setX(i, x * k); tp.setZ(i, z * k); }
      tower.computeVertexNormals(); put(metal, tower.translate(px, 12.9, 0));
      for (const [cy, cr] of [[2.6, 2.4], [9.2, 2.02], [15.6, 1.76], [22.2, 1.52]]) put(dark, new THREE.TorusGeometry(cr, 0.24, 8, 28).rotateX(Math.PI / 2).translate(px, cy, 0));
      strut(dark, px + side * 4.7, 0.4, 0, px + side * 1.55, 17.6, 0, 0.72);
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
    const lineGeo = new THREE.PlaneGeometry(s.hw * 1.94, 3.6);
    disp.push(ct, lineMat, lineGeo);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2; line.position.y = 0.25 + dOff; line.receiveShadow = true; g.add(line);
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
  const det = gfx.detail; const gq = gfx.geometry;
  const rockMat = surfaceMaterial(wallTex, {
    strata: STRATA[theme.id], repeat: [2, 2], normalScale: 1.55,
    emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff',
    emissiveIntensity: theme.id === 'lava' ? 1.35 : theme.id === 'crystal' ? 0.6 : 0,
  });
  disp.push(rockMat);
  const decorCells: { mesh: THREE.InstancedMesh; x: number; z: number; view2: number; sh2: number; lod?: THREE.InstancedMesh; lod2?: number }[] = [];
  // Sector-chunked + distance/shadow-culled InstancedMesh placement: skips distant sectors & shadows beyond the shadow box!
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, dMin: number, dMax: number, sMin: number, sMax: number, opts: { foot?: number; yOff?: number; tilt?: number; air?: number; shadow?: boolean; scaleY?: [number, number]; colors?: string[]; keepDry?: boolean; view?: number; lod?: { geo: THREE.BufferGeometry; dist: number } } = {}) => {
    count = Math.floor(count * det); if (count <= 0) { geo.dispose(); return; }
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
      case 'rocks': for (let v = 0; v < 3; v++) place(rockGeo(d1, 1 + v * 5, 0.66 + v * 0.1), rockMat, 160, 8, 320, 1.5, 7.2, { foot: 1.5, yOff: 0.2, tilt: 0.45 }); break;
      case 'lavaRocks': for (let v = 0; v < 3; v++) place(rockGeo(d1, 4 + v * 3, 0.74 + v * 0.1), rockMat, 160, 8, 420, 2, 12.5, { foot: 1.5, yOff: 0.14, tilt: 0.45 }); break;
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
        const tm = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.84 }); disp.push(tm);
        for (let v = 0; v < 2; v++) place(jungleTreeGeometry(5 + v * 8, gq), tm, 470, 10, 620, 1, 2.45, { foot: 6.5, keepDry: true, scaleY: [0.85, 1.2], colors: ['#dce8cf', '#ffffff', '#e8f0c8', '#c8dec0'], lod: { geo: jungleTreeGeometry(5 + v * 8, gq, true), dist: 240 } });
        break;
      }
      case 'buildings': case 'towers': {
        const wc = document.createElement('canvas'); wc.width = 256; wc.height = 512; const ctx = wc.getContext('2d')!;
        ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, 256, 512);
        const wCols = ['#ffd890', '#90d8ff', '#ffb0d8', '#fff0c0'];
        for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
          const rv = h2(x + y * 13, 41);
          if (rv < 0.38) { ctx.fillStyle = wCols[Math.floor(h2(x, y + 7) * 4)]; ctx.globalAlpha = 0.5 + h2(y, x) * 0.5; ctx.fillRect(x * 32 + 5, y * 16 + 4, 22, 8); }
        }
        ctx.globalAlpha = 1; ctx.fillStyle = '#1b202b'; for (let x = 0; x < 8; x++) ctx.fillRect(x * 32, 0, 3, 512);
        for (let y = 0; y < 512; y += 64) { ctx.fillStyle = '#252b38'; ctx.fillRect(0, y, 256, 4); }
        const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(1, 2); wt.anisotropy = 8;
        const bm = new THREE.MeshStandardMaterial({ color: '#3b4252', metalness: 0.78, roughness: 0.34, envMapIntensity: 0.85, map: wt, emissiveMap: wt, emissive: '#ffffff', emissiveIntensity: 0.85 });
        disp.push(bm, wt);
        const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
        if (kind === 'buildings') {
          // Session 9: Art-Deco megablocks with 4 setback tiers, corner buttress fins, sky-dock & roof mast (2 silhouettes)
          const fins = [-1, 1].flatMap(sx => [-1, 1].map(sz => B(0.13, 0.68, 0.13, sx * 0.5, 0.34, sz * 0.5)));
          const gA = mergeGeometries([
            B(1, 0.6, 1, 0, 0.3, 0), B(0.82, 0.2, 0.82, 0, 0.7, 0), B(0.6, 0.14, 0.6, 0, 0.87, 0), B(0.36, 0.08, 0.36, 0, 0.98, 0), ...fins,
            B(0.46, 0.012, 0.3, 0.66, 0.5, 0), B(0.05, 0.012, 0.05, 0.86, 0.494, 0),
            new THREE.CylinderGeometry(0.012, 0.03, 0.24, 5).translate(0.07, 1.14, -0.05),
          ].map(x => x.toNonIndexed()))!;
          const gB = mergeGeometries([
            B(1, 0.42, 0.72, 0, 0.21, 0), B(0.42, 0.56, 0.6, -0.27, 0.7, 0), B(0.36, 0.38, 0.5, 0.29, 0.61, 0), B(0.2, 0.05, 0.44, 0.01, 0.7, 0),
            B(0.3, 0.1, 0.42, -0.27, 1.03, 0), B(0.26, 0.06, 0.36, 0.29, 0.83, 0),
            new THREE.CylinderGeometry(0.01, 0.025, 0.2, 5).translate(-0.27, 1.18, 0), new THREE.CylinderGeometry(0.16, 0.16, 0.012, 10).translate(0.29, 0.87, 0),
          ].map(x => x.toNonIndexed()))!;
          place(gA, bm, 380, 30, 2200, 25, 70, { foot: 0.9, scaleY: [3, 9] });
          place(gB, bm, 320, 30, 2200, 25, 70, { foot: 0.8, scaleY: [3, 8] });
        } else {
          // Session 9: tapered spire tower with 4 buttress fins, two ring decks, crown & needle
          const g = mergeGeometries([
            new THREE.CylinderGeometry(0.62, 1, 0.88, 14).translate(0, 0.44, 0),
            ...[0, 1, 2, 3].map(k => B(0.1, 0.5, 0.62, 0, 0.25, 0.82).rotateY(k * Math.PI / 2)),
            new THREE.CylinderGeometry(1.15, 0.9, 0.03, 14).translate(0, 0.52, 0),
            new THREE.CylinderGeometry(1.38, 1.2, 0.04, 14).translate(0, 0.82, 0),
            new THREE.TorusGeometry(1.36, 0.018, 4, 20).rotateX(Math.PI / 2).translate(0, 0.855, 0),
            new THREE.CylinderGeometry(0.38, 0.58, 0.2, 12).translate(0, 0.96, 0),
            new THREE.CylinderGeometry(0.5, 0.42, 0.03, 12).translate(0, 1.07, 0),
            new THREE.ConeGeometry(0.2, 0.24, 8).translate(0, 1.2, 0),
            new THREE.CylinderGeometry(0.008, 0.02, 0.26, 5).translate(0, 1.42, 0),
          ].map(x => x.toNonIndexed()))!;
          place(g, bm, 165, 60, 1800, 30, 60, { foot: 1.45, scaleY: [6, 11] });
        }
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
        place(g, wm, 64, 10, 210, 0.85, 1.55, { foot: 3.5, tilt: 0.9, yOff: 0.28, keepDry: true }); break;
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

function addArches(td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], rng: () => number, roadClear: (x: number, z: number, r: number, margin?: number) => boolean) {
  const S = td.main.samples; const list: THREE.BufferGeometry[] = [];
  for (const idx of td.arches) {
    const s = S[idx]; const span = s.hw + 12;
    if (s.roof > 0 || s.zeroG) continue;
    const feetOk = [-1, 1].every(sd => roadClear(s.x + s.rx * sd * span, s.z + s.rz * sd * span, 5, 0));
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
    const syR = 1.2 + rng() * 0.8;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y - 3, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, syR, 1)));
    // Session 16: rock arches are solid (the bulk of the "arches without collision")
    (td.overheads ??= []).push({ idx, y0: 0, y1: 0, half: tube * 1.35, arch: { R: span, sy: 0.76 * syR, inner: tube * 1.3, yOff: -3, thick: tube * 2 * 0.76 * syR } });
    list.push(g);
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
  for (const o of td.obstacles) {
    if (o.kind >= 3) continue;
    cur = o;
    // Glowing ground warning halo around EVERY track obstacle (unmistakable against sand, lava, ice & mud!)
    add(rings, C(o.x, o.y + 0.28, o.z, I, o.r * 1.18, 1.3, o.r * 1.18));
    if (o.kind === 0) {
      e.set((o.idx * 0.13) % 0.3 - 0.15, o.idx * 1.3, 0); q.setFromEuler(e);
      const hRock = o.r * 1.45;
      add(rocks, C(o.x, o.y + hRock * 0.45, o.z, q.clone(), o.r * 1.05, hRock, o.r * 1.05));
      // Tall race-marshal hazard beacon mounted atop every boulder
      add(masts, C(o.x, o.y + hRock + 1.1, o.z, I, 1, 2.4, 1));
      add(beacons, C(o.x, o.y + hRock + 2.45, o.z, I, 1.15, 1.15, 1.15));
    } else if (o.kind === 1) {
      add(cols, C(o.x, o.y, o.z, I, o.r, 1, o.r));
      for (const h of [2.0, 4.6, 7.2]) add(rings, C(o.x, o.y + h, o.z, I, o.r * 0.96, 1.1, o.r * 0.96));
      add(beacons, C(o.x, o.y + 9.8, o.z, I, 1.25, 1.25, 1.25));
    } else {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.idx);
      const bh = o.r * 1.38;
      add(boxes, C(o.x, o.y + bh * 0.5, o.z, q.clone(), o.r * 1.42, bh, o.r * 1.42));
      add(masts, C(o.x, o.y + bh + 0.9, o.z, I, 1, 1.8, 1));
      add(beacons, C(o.x, o.y + bh + 1.95, o.z, I, 1.15, 1.15, 1.15));
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
