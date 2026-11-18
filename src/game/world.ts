import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import { generateTexture } from './textures';
import { surfaceMaterial } from './materials';
import { mulberry32, type Path, type Sample, type TrackData } from './trackBuilder';
import { addProps, type Emitter } from './props';
import { addTrackDetail } from './trackDetail';
import { StaticBatcher } from './trackMesh';
import { addSkyline, buildTerrain, makeTerrainField } from './terrain';
import { buildSetPieces, type SetPieceFx } from './setPieces';
import { addLandmarks } from './landmarks';
import { layersFor, STRATA, TERRAIN_DETAIL, terrainMaterial } from './terrainMaterial';
import { buildGroundCover } from './groundCover';
import { buildSmoke, type SmokeSrc } from './smoke';
import { buildLife, type LifeZone } from './wildlife';
import { CellInstancer } from './instCells';
import { snowLeafMaterial } from './snowMat';
import { buildImpostors, type ImpostorKind } from './impostors';
import { buildFalls, buildWallFalls, type FallInfo, type FallKind } from './falls';
import { barkTexture, boulderGeo, cactusGeo, crystalGeo, fernGeo, gateGeo, iceShardGeo, jungleTreeGeo, leafTexture, mesaGeo, pineGeo, spireGeo } from './decorGeo';
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

export interface World {
  group: THREE.Group;
  /** waterfalls / lavafalls / icefalls (foot positions) – used for sound + spray */
  falls: FallInfo[];
  heightAt: (x: number, z: number) => number;
  update: (t: number, cam?: THREE.Vector3, player?: THREE.Vector3) => void;
  tvCams: THREE.Vector3[];
  glossy: THREE.Mesh[];
  emitters: Emitter[];
  setPieces: { update: (t: number, raceTime: number, pods: PodState[], dt: number, frozen: boolean) => SetPieceFx[] };
  dispose: () => void;
}

const yield_ = () => new Promise(r => setTimeout(r, 0));

export async function buildWorld(td: TrackData, theme: ThemeDef, gfx: GfxSettings, progress: (p: number, msg: string) => void): Promise<World> {
  const group = new THREE.Group();
  const rng = mulberry32(1234 + td.N);
  const geoQ = gfx.geometry;
  const texRes = gfx.texRes;
  const aniso = gfx.anisotropy ?? 8;
  const disposables: { dispose: () => void }[] = [];
  const glossy: THREE.Mesh[] = [];
  const P = theme.palette;

  progress(0.05, 'Generiere UHD-Texturen …'); await yield_();
  const roadTex = generateTexture(theme.road, P.road, texRes, 11, aniso);
  await yield_();
  const wallTex = generateTexture(theme.wall, P.wall, texRes, 22, aniso);
  await yield_();
  const groundTex = generateTexture(theme.ground, P.ground, texRes, 33, aniso, theme.emissiveGround);
  await yield_();
  const TL = layersFor(theme.id); const lres = Math.min(1024, texRes);
  const gravelTex = generateTexture('gravel', TL.gravel, lres, 57, aniso);
  const basinTex = generateTexture('cracked', TL.basin, lres, 68, aniso, TL.basinEmissive);
  const cliffTex = TL.cliff ? generateTexture('rock', TL.cliff, texRes, 79, aniso) : wallTex;
  await yield_();
  const plx = gfx.parallax && (gfx.shaderDetail ?? 1) > 0 ? 1 : 0; const layers = (gfx.shaderDetail ?? 1) >= 2 ? 24 : 12;
  const bump = gfx.bumpMapping ?? true; const disp = (gfx.tessellation ?? 0) > 0 ? ((gfx.tessellation ?? 0) >= 2 ? 0.5 : 0.25) : 0;
  const hwAvg = td.main.samples.reduce((acc, q) => acc + q.hw, 0) / td.N;
  // session 15: wall cascades first – their feet become wet zones of the road material (own rng → other placement unchanged)
  const smokes: SmokeSrc[] = []; const fallRng = mulberry32(977 + td.N); const falls: FallInfo[] = [];
  if (theme.terrain === 'jungle') falls.push(...buildWallFalls(td, group, disposables, smokes, fallRng, geoQ >= 2 ? 6 : 3)); // cascades down canyon walls along the track
  const wetZones = falls.map(f => ({ x: f.x, z: f.z, r: f.r * 1.6 + 6 }));
  const roadMat = surfaceMaterial(roadTex, { wetZones, cloud: theme.clouds * 0.4, parallax: plx * 0.025, layers, wet: theme.ambient === 'rain' ? 0.85 : theme.road === 'mud' ? 0.12 : 0, puddles: theme.ambient === 'rain' ? 0.38 : 0.22, rain: theme.ambient === 'rain', snow: theme.id === 'ice' ? 1 : 0, macro: 0.12, detail: 0.35, bump, displace: disp, micro: 0.9, microScale: [(2 * hwAvg) / 1.7, Math.max(24, hwAvg * 1.4) / 1.7], envMapIntensity: theme.road === 'ice' ? 1.6 : 0.6, emissive: theme.barrierColor, emissiveIntensity: 1.2 });
  const wallMat = surfaceMaterial(wallTex, { strata: STRATA[theme.id], cloud: theme.clouds * 0.4, parallax: plx * 0.06, layers, normalScale: 1.4, macro: 0.28, detail: 0.6, bump, displace: disp * 1.5, micro: 0.6, microScale: [18 / 1.7, 18 / 1.7], emissive: theme.id === 'crystal' ? '#c87aff' : '#ff5a10', emissiveIntensity: theme.id === 'crystal' ? 0.8 : 1.4 });
  const groundMat = terrainMaterial({ detail: TERRAIN_DETAIL[theme.id], ground: groundTex, gravel: gravelTex, basin: basinTex, rock: cliffTex, layers: TL, strata: STRATA[theme.id], cloud: theme.clouds * 0.45, bump, emissive: theme.emissiveGround ?? '#ff4a10', emissiveIntensity: 1.1 });
  disposables.push(roadMat, wallMat, groundMat);
  if (theme.road === 'ice') { roadMat.roughness = 0.6; glossy.push(); }
  const field = makeTerrainField(td, theme); const { heightAt, nearest, roadClear, avgY } = field;
  const batcher = new StaticBatcher(gfx.batching ?? true);

  progress(0.35, 'Baue Strecke …'); await yield_();
  const maxStep = geoQ >= 3 ? 2 : geoQ === 2 ? 3 : 5; // adaptive sampling: dense in curves/transitions, sparse on straights
  const across = (geoQ >= 3 ? 32 : geoQ === 2 ? 18 : 10) + ((gfx.tessellation ?? 0) >= 2 ? 16 : (gfx.tessellation ?? 0) > 0 ? 8 : 0);

  for (const path of td.paths) {
    const S = path.samples, n = S.length;
    const idxs: number[] = [0]; let last = 0;
    for (let i = 1; i < n; i++) {
      const a = S[last], b = S[i], pv = S[i - 1];
      const turn = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
      const flag = pv.gap !== b.gap || pv.canyon !== b.canyon || pv.openL !== b.openL || pv.openR !== b.openR || b.ramp > 0 || pv.ramp > 0;
      const dy = Math.abs((b.y + b.ramp) - (a.y + a.ramp)) + Math.abs(b.bank - a.bank) * b.hw;
      if (flag && i - 1 > last) { idxs.push(i - 1); last = i - 1; }
      if (flag || i - last >= maxStep || turn > 0.025 || dy > 0.6) { idxs.push(i); last = i; }
    }
    if (path.closed) idxs.push(0); else if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    // ---- road ----
    {
      const pos: number[] = [], uv: number[] = [], ind: number[] = [];
      let vbase = 0; let sAcc = 0;
      for (let k = 0; k < idxs.length; k++) {
        const s = S[idxs[k]];
        if (k > 0) { const pr = S[idxs[k - 1]]; sAcc += Math.hypot(s.x - pr.x, s.z - pr.z); }
        for (let a = 0; a <= across; a++) {
          const f = a / across; const lat = -s.hw + f * 2 * s.hw;
          const e = Math.abs(f * 2 - 1);
          const crown = (1 - e * e) * 0.2 + (e > 1 - 2 / across ? 0.18 : 0);
          pos.push(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + crown, s.z + s.rz * lat);
          uv.push(f, sAcc / Math.max(24, s.hw * 1.4));
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
      // chunked → frustum culling per ~120 m (also in the shadow pass)
      batcher.addStrip(g, roadMat, 2600, false);
    }
    // ---- skirts / walls / barriers ----
    for (const side of [-1, 1]) {
      // skirt
      const sp: number[] = [], su: number[] = [], si: number[] = [];
      const wp: number[] = [], wu: number[] = [], wi: number[] = [];
      const K = geoQ >= 3 ? 12 : geoQ === 2 ? 8 : 5;
      const prof: [number, number][] = [[0, 0], [0.3, 0.1], [1.5, 0.25], [1.0, 0.45], [2.5, 0.6], [5, 0.75], [9, 0.88], [15, 1.0]];
      let sv = 0, wv = 0; let prevS = false, prevW = false; let sAcc = 0;
      for (let k = 0; k < idxs.length; k++) {
        const s = S[idxs[k]]; if (k > 0) { const pr = S[idxs[k - 1]]; sAcc += Math.hypot(s.x - pr.x, s.z - pr.z); }
        const open = side > 0 ? s.openR : s.openL;
        const ex = s.x + s.rx * side * s.hw, ez = s.z + s.rz * side * s.hw, ey = s.y + s.ramp - side * s.hw * s.bank;
        // skirt
        const okS = !s.gap;
        const bx = ex + s.rx * side * 3, bz = ez + s.rz * side * 3; const depth = okS ? Math.max(6, ey - heightAt(bx, bz) + 3) : 16; // reaches the terrain everywhere
        sp.push(ex, ey, ez, bx, ey - depth, bz); su.push(sAcc / 20, 0, sAcc / 20, depth / 20);
        if (okS && prevS) { if (side < 0) si.push(sv - 2, sv, sv - 1, sv - 1, sv, sv + 1); else si.push(sv - 2, sv - 1, sv, sv - 1, sv + 1, sv); }
        sv += 2; prevS = okS;
        // canyon wall
        const H = side > 0 ? s.hR : s.hL; // per-side cliff (half-canyons leave one side open)
        const okW = H > 0 && !open && !s.gap;
        for (let j = 0; j < K; j++) {
          const f = j / (K - 1); const pf = f * (prof.length - 1); const pi = Math.min(prof.length - 2, Math.floor(pf)); const pt = pf - pi;
          const off = prof[pi][0] + (prof[pi + 1][0] - prof[pi][0]) * pt;
          const hh = prof[pi][1] + (prof[pi + 1][1] - prof[pi][1]) * pt;
          const nz = (fbm(sAcc * 0.05, f * 4 + side * 7, 4) - 0.5) * 5 * Math.min(1, f * 3);
          const lat = 0.6 + off * (H / 25) + nz;
          wp.push(ex + s.rx * side * lat, ey - 1 + hh * H, ez + s.rz * side * lat);
          wu.push(sAcc / 18, hh * H / 18);
        }
        if (okW && prevW) for (let j = 0; j < K - 1; j++) {
          const a = wv - K + j, b = wv + j;
          if (side > 0) wi.push(a, a + 1, b, b, a + 1, b + 1); else wi.push(a, b, a + 1, a + 1, b, b + 1);
        }
        wv += K; prevW = okW;
      }
      const mk = (p: number[], u: number[] | null, i: number[], mat: THREE.Material, shadow: boolean) => {
        if (!i.length) return;
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        if (u) g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
        g.setIndex(i); g.computeVertexNormals();
        batcher.addStrip(g, mat, 2400, shadow);
      };
      mk(sp, su, si, wallMat, false);
      mk(wp, wu, wi, wallMat, true);
      // track-edge barriers: 3D guard rails in trackDetail.ts
    }
    // ---- cliff faces at gaps ----
    for (let i = 0; i < n - 1; i++) {
      const a = S[i], b = S[i + 1];
      if (a.gap === b.gap) continue;
      const s = a.gap ? b : a; const depth = 40;
      const g = new THREE.PlaneGeometry(s.hw * 2 + 6, depth + s.ramp, 8, 8);
      const posA = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < posA.count; v++) posA.setZ(v, (vnoise(posA.getX(v) * 0.3, posA.getY(v) * 0.3) - 0.5) * 2);
      g.computeVertexNormals();
      const uvA = g.attributes.uv as THREE.BufferAttribute; for (let v = 0; v < uvA.count; v++) uvA.setXY(v, uvA.getX(v) * 2, uvA.getY(v) * 2);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(s.x, s.y + s.ramp - (depth + s.ramp) / 2, s.z);
      m.rotation.y = Math.atan2(s.tx, s.tz) + (a.gap ? Math.PI : 0);
      m.receiveShadow = true; group.add(m); disposables.push(g);
    }
    // ---- tunnel roof for shortcuts ----
    if (path.id > 0) buildTunnel(path, group, wallMat, disposables, theme);
    if (td.def.theme === 'oovo') buildZeroGTubes(path, group, wallMat, disposables, theme);
  }

  // ---- ramps warning chevrons (instanced) ----
  {
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.3), side: THREE.DoubleSide });
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

  // ---- start / finish line ----
  addStartArea(td, group, theme, disposables, rng);

  progress(0.55, 'Generiere Terrain (LOD) …'); await yield_();
  const T = theme.terrain;
  const b = td.bounds; const margin = 2600 * gfx.drawDistance;
  const W = b.maxX - b.minX + margin * 2, D = b.maxZ - b.minZ + margin * 2;
  const cxm = (b.minX + b.maxX) / 2, czm = (b.minZ + b.maxZ) / 2;
  await buildTerrain(field, theme, gfx, groundMat, batcher, { cx: cxm, cz: czm, W, D }, (p, m) => progress(0.55 + 0.25 * p, m));
  addSkyline(theme, group, disposables, avgY, { cx: cxm, cz: czm, W, D });

  // water / lava plane
  const waterY = T === 'lava' ? Math.min(avgY - 14, td.bounds.minY - 13) : (T === 'jungle' || theme.id === 'ice') ? Math.min(avgY - 12, td.bounds.minY - 13) : T === 'ocean' ? Math.min(avgY - 26, td.bounds.minY - 14) : -1e9; // below the lowest (banked) road edge
  let animTex: THREE.Texture[] = []; const scrolls: { value: THREE.Vector2 }[] = [];
  if (T === 'lava') {
    const lt = generateTexture('basalt', ['#0a0605', '#1a0d08', '#2a140a'], 512, 99, 8, '#ff7a20');
    const lm = surfaceMaterial(lt, { repeat: [W / 120, D / 120], emissive: '#ff7020', emissiveIntensity: 2.6 });
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lm); lp.rotation.x = -Math.PI / 2; lp.position.set(cxm, Math.min(avgY - 14, td.bounds.minY - 8), czm); group.add(lp);
    scrolls.push(lm.userData.scroll as { value: THREE.Vector2 });
    disposables.push(lm);
  } else if (T === 'jungle' || theme.id === 'ice') {
    const nt = generateTexture('snow', ['#888', '#999', '#aaa'], 512, 55, 8);
    const wm = new THREE.MeshStandardMaterial({ color: theme.id === 'ice' ? '#7aa8c8' : '#1a4a40', roughness: theme.id === 'ice' ? 0.18 : 0.12, metalness: 0.3, normalMap: nt.normalMap.clone(), envMapIntensity: 1.5 });
    wm.normalMap!.repeat.set(W / 60, D / 60); wm.normalMap!.needsUpdate = true;
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(W, D), wm); wp.rotation.x = -Math.PI / 2; wp.position.set(cxm, waterY, czm); wp.receiveShadow = true; group.add(wp); glossy.push(wp);
    animTex = [wm.normalMap!]; disposables.push(wm);
  } else if (T === 'ocean') {
    const wt = generateTexture('snow', ['#8ab', '#9bc', '#acd'], 512, 44, 8);
    const wm = new THREE.MeshStandardMaterial({ color: '#1a6a8a', roughness: 0.08, metalness: 0.35, normalMap: wt.normalMap.clone(), envMapIntensity: 1.6, transparent: true, opacity: 0.92 });
    wm.normalMap!.repeat.set(W / 80, D / 80); wm.normalMap!.needsUpdate = true;
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(W, D), wm); wp.rotation.x = -Math.PI / 2; wp.position.set(cxm, avgY - 26, czm); wp.receiveShadow = true; group.add(wp); glossy.push(wp);
    animTex = [wm.normalMap!]; disposables.push(wm);
    const S = td.main.samples; const sup: THREE.Matrix4[] = [];
    for (let i = 0; i < S.length; i += 50) { if (S[i].gap) continue; const s = S[i]; const hgt = s.y - (avgY - 26); sup.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, avgY - 26 + hgt / 2, s.z), new THREE.Quaternion(), new THREE.Vector3(1, hgt, 1))); }
    const sg = new THREE.CylinderGeometry(1.6, 2.2, 1, 12); const im = new THREE.InstancedMesh(sg, wallMat, sup.length); sup.forEach((m, i) => im.setMatrixAt(i, m)); group.add(im); disposables.push(sg);
  } else if (T === 'prison') {
    addAsteroidBelt(td, group, wallMat, disposables, rng);
    const S = td.main.samples; const sup: THREE.Matrix4[] = [];
    for (let i = 0; i < S.length; i += 60) { if (S[i].gap || S[i].zeroG) continue; const s = S[i]; sup.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y - 200, s.z), new THREE.Quaternion(), new THREE.Vector3(1, 400, 1))); }
    const sg = new THREE.CylinderGeometry(2, 3, 1, 12); const im = new THREE.InstancedMesh(sg, wallMat, sup.length); sup.forEach((m, i) => im.setMatrixAt(i, m)); group.add(im); disposables.push(sg);
  } else if (T === 'city') {
    // supports
    const S = td.main.samples; const sup: THREE.Matrix4[] = [];
    for (let i = 0; i < S.length; i += 40) { if (S[i].gap) continue; const s = S[i]; const hgt = s.y + 160; sup.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y - 16 - (hgt - 16) / 2, s.z), new THREE.Quaternion(), new THREE.Vector3(1, (hgt - 16), 1))); }
    const sg = new THREE.CylinderGeometry(3, 4, 1, 16);
    const im = new THREE.InstancedMesh(sg, wallMat, sup.length); sup.forEach((m, i) => im.setMatrixAt(i, m)); group.add(im); disposables.push(sg);
  }

  progress(0.82, 'Platziere Details …'); await yield_();
  const distToTrack = (x: number, z: number) => nearest(x, z);
  // falls first (own rng → all other placement stays deterministic): waterfalls (jungle worlds), lavafalls (volcano), icefalls (Ando Prime)
  const fallKind: FallKind | null = T === 'jungle' ? 'water' : T === 'lava' ? 'lava' : theme.id === 'ice' ? 'ice' : null;
  if (fallKind) falls.push(...buildFalls(fallKind, td, field, (x, z) => { const q = nearest(x, z); return q.d - q.s.hw; }, fallRng, group, disposables, smokes, geoQ >= 2 ? 7 : 4));
  // decor must not stand inside a fall: distance to the lip → foot segment
  const segD = (x: number, z: number, f: FallInfo) => { const vx = f.x - f.lx, vz = f.z - f.lz; const l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - f.lx) * vx + (z - f.lz) * vz) / l2)); return Math.hypot(x - (f.lx + vx * t), z - (f.lz + vz * t)); };
  const decorClear = (x: number, z: number, r: number, margin?: number) => roadClear(x, z, r, margin) && !falls.some(f => !f.wall && segD(x, z, f) < f.r + r + 5);
  const decor = scatterDecor(theme, group, td, heightAt, distToTrack, gfx, disposables, rng, wallTex, decorClear);
  addArches(td, group, wallMat, disposables, rng, roadClear);
  addObstacles(td, group, theme, wallMat, disposables);
  progress(0.9, 'Platziere Streckendetails …'); await yield_();
  const props = addProps(td, theme, group, gfx, heightAt, disposables, rng, roadClear);
  const setPieces = buildSetPieces(td, theme, group, disposables, wallMat);
  const landRock = surfaceMaterial(wallTex, { strata: STRATA[theme.id], cloud: theme.clouds * 0.4, macro: 0.35, detail: 0.25, normalScale: 1.3, bump, emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff', emissiveIntensity: theme.id === 'lava' ? 0.8 : theme.id === 'crystal' ? 0.5 : 0 });
  disposables.push(landRock);
  const landZones = addLandmarks(td, theme, group, disposables, { ...field, roadClear: decorClear }, rng, landRock, props.emitters, smokes); // landmarks stay out of fall corridors
  progress(0.92, 'Belebe Landschaft …'); await yield_();
  const smoke = buildSmoke(smokes, theme, td, field, group, disposables, rng, waterY);
  const inFall = (x: number, z: number) => falls.some(f => !f.wall && segD(x, z, f) < f.r + 2);
  const cover = buildGroundCover(td, theme, gfx, { ...field, distToTrack: (x: number, z: number) => (inFall(x, z) ? -1 : field.distToTrack(x, z)) }, waterY, rng, group, disposables); // no plants inside a fall
  const lifeZones: LifeZone[] = [...landZones, ...decor.zones, ...falls.filter(f => !f.wall).flatMap(f => [{ x: f.x, z: f.z, r: f.r + 6 }, { x: f.lx, z: f.lz, r: f.r + 6 }])];
  const life = buildLife(td, theme, field, waterY, rng, group, disposables, gfx.detail, lifeZones, decor.perches);

  // tv cams
  const tvCams: THREE.Vector3[] = [];
  const S = td.main.samples;
  for (let i = 0; i < S.length; i += 110) { const s = S[i]; const side = (i / 110) % 2 ? 1 : -1; tvCams.push(new THREE.Vector3(s.x + s.rx * side * (s.hw + 6), s.y + 7 + (s.canyon ? 6 : 0), s.z + s.rz * side * (s.hw + 6))); }

  const detail = addTrackDetail(td, theme, group, disposables, rng, wallMat, { across, disp, detail: gfx.detail, tvCams, batcher });
  batcher.build(group, disposables);

  progress(0.95, 'Kompiliere Shader …'); await yield_();
  const update = (t: number, cam?: THREE.Vector3, player?: THREE.Vector3) => { smoke.update(t); life.update(t, player ?? cam); if (cam) { cover.update(cam); decor.update(cam); } for (const tx of animTex) { tx.offset.x = t * 0.004; tx.offset.y = t * 0.006; } for (const sc of scrolls) sc.value.set(t * 0.004, t * 0.006); props.update(t); detail.update(t); };
  return { group, falls, heightAt, update, tvCams, glossy, emitters: props.emitters, setPieces, dispose: () => disposables.forEach(d => d.dispose()) };
}

function buildTunnel(path: Path, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], theme: ThemeDef) {
  const S = path.samples; const n = S.length;
  const from = Math.floor(n * 0.25), to = Math.floor(n * 0.75);
  const segA = 16; const pos: number[] = [], uv: number[] = [], ind: number[] = [];
  let v = 0; const lamps: THREE.Matrix4[] = [];
  for (let i = from; i <= to; i += 2) {
    const s = S[i];
    for (let a = 0; a <= segA; a++) {
      const ang = Math.PI * a / segA; const lat = Math.cos(ang) * (s.hw + 1.5); const up = Math.sin(ang) * 11 + 1;
      const nz = (vnoise(i * 0.2, a * 0.7) - 0.5) * 1.6;
      pos.push(s.x + s.rx * (lat + nz * Math.cos(ang)), s.y + up + nz * Math.sin(ang), s.z + s.rz * (lat + nz * Math.cos(ang)));
      uv.push(s.s / 15, a / segA * 2);
    }
    if (i > from) for (let a = 0; a < segA; a++) { const p0 = v - (segA + 1) + a, p1 = v + a; ind.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
    v += segA + 1;
    if (i % 14 === 0) lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + 11.5, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1)));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
  const m2 = (mat as THREE.MeshStandardMaterial).clone(); m2.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, m2); m.castShadow = true; m.receiveShadow = true; group.add(m); disp.push(g, m2);
  const lg = new THREE.BoxGeometry(1.2, 0.3, 3);
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.8), toneMapped: false });
  const im = new THREE.InstancedMesh(lg, lm, lamps.length); lamps.forEach((mm, i) => im.setMatrixAt(i, mm)); group.add(im); disp.push(lg, lm);
}

function addStartArea(td: TrackData, group: THREE.Group, theme: ThemeDef, disp: { dispose: () => void }[], rng: () => number) {
  const S = td.main.samples;
  const mkGate = (idx: number, label: 'start' | 'finish') => {
    const s = S[idx]; const yaw = Math.atan2(s.tx, s.tz);
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = yaw; group.add(g);
    const metal = new THREE.MeshStandardMaterial({ color: '#8a8f99', metalness: 0.9, roughness: 0.25 });
    const lightOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(label === 'start' ? '#ff3030' : '#30ff60').multiplyScalar(2), toneMapped: false });
    disp.push(metal, lightOn);
    const darkSteel = new THREE.MeshStandardMaterial({ color: '#3a3d44', metalness: 0.85, roughness: 0.45, vertexColors: true });
    metal.vertexColors = true; metal.color.set(label === 'start' ? '#b8a890' : '#a0a8b8'); metal.metalness = 0.6; metal.roughness = 0.42;
    const [gp, gd] = gateGeo(s.hw); disp.push(darkSteel, gp, gd);
    for (const [geo, mat] of [[gp, metal], [gd, darkSteel]] as const) { const mm = new THREE.Mesh(geo, mat); mm.castShadow = true; mm.receiveShadow = true; g.add(mm); }
    for (let i = 0; i < 10; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), lightOn); l.position.set(-s.hw + i * (s.hw * 2 / 9), 17.6, 0.62); g.add(l); }
    // checker line
    const c = document.createElement('canvas'); c.width = 256; c.height = 32; const ctx = c.getContext('2d')!;
    for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#eee'; ctx.fillRect(x * 8, y * 8, 8, 8); }
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(s.hw * 2, 3), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.18; line.receiveShadow = true; g.add(line);
    // grandstands
    const crowdG = new THREE.BoxGeometry(0.5, 0.9, 0.5);
    const crowdM = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const count = 900; const crowd = new THREE.InstancedMesh(crowdG, crowdM, count * 2);
    let ci = 0; const col = new THREE.Color();
    for (const side of [-1, 1]) {
      const stand = new THREE.Group(); stand.position.set(side * (s.hw + 26), 0, -40); stand.rotation.y = side * Math.PI / 2; g.add(stand);
      for (let r = 0; r < 8; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 2.2), metal); step.position.set(0, r * 1.2 + 0.6, r * 2.2); step.castShadow = true; step.receiveShadow = true; stand.add(step);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(74, 0.4, 20), new THREE.MeshStandardMaterial({ color: theme.barrierColor, roughness: 0.5 })); roof.position.set(0, 16, 7); roof.castShadow = true; stand.add(roof);
      stand.updateMatrixWorld(true);
      for (let i = 0; i < count; i++) {
        const r = Math.floor(rng() * 8); const x = (rng() - 0.5) * 66;
        const m = new THREE.Matrix4().makeTranslation(x, r * 1.2 + 1.65, r * 2.2 + (rng() - 0.5) * 1.2);
        crowd.setMatrixAt(ci, new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().multiplyMatrices(g.matrix.clone().identity(), stand.matrix), m));
        col.setHSL(rng(), 0.6, 0.35 + rng() * 0.3); crowd.setColorAt(ci, col); ci++;
      }
    }
    g.add(crowd);
    // banners
    for (let i = 0; i < 6; i++) {
      const bc = new THREE.Mesh(new THREE.PlaneGeometry(3, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 6, 0.7, 0.5), side: THREE.DoubleSide }));
      const side = i % 2 ? 1 : -1; bc.position.set(side * (s.hw + 1.5), 6, 20 + i * 14); bc.rotation.y = Math.PI / 2; g.add(bc);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 11, 6), metal); pole.position.set(side * (s.hw + 1.5), 5.5, 18.5 + i * 14); g.add(pole);
    }
  };
  mkGate(td.startIdx, 'start');
  if (!td.main.closed) mkGate(td.finishIdx, 'finish');
}

function rockGeo(detail: number, seed: number, stretch = 1) {
  return boulderGeo(detail, seed, stretch);
}

function scatterDecor(theme: ThemeDef, group: THREE.Group, td: TrackData, heightAt: (x: number, z: number) => number,
  near: (x: number, z: number) => { d: number; s: Sample }, gfx: GfxSettings, disp: { dispose: () => void }[], rng: () => number,
  wallTex: ReturnType<typeof generateTexture>, roadClear: (x: number, z: number, r: number, margin?: number) => boolean) {
  const det = gfx.detail; const gq = gfx.geometry;
  const rockMat = surfaceMaterial(wallTex, { repeat: [2, 2], normalScale: 1.5, emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff', emissiveIntensity: theme.id === 'lava' ? 1.4 : theme.id === 'crystal' ? 0.6 : 0 });
  disp.push(rockMat);
  const dd = gfx.drawDistance ?? 1;
  const cells = new CellInstancer(1400 * dd, 240), cellsFar = new CellInstancer(6000 * dd, 360);
  type Part = [THREE.BufferGeometry, THREE.Material];
  const zones: LifeZone[] = [], perches: LifeZone[] = []; // big decor footprints (wildlife avoids) / boulder tops (birds perch)
  type PlaceOpts = { perch?: boolean; impostor?: { kind: ImpostorKind; w: number; h: number; tint: THREE.Color }; low?: Part[][]; foot?: number; yOff?: number; tilt?: number; air?: number; shadow?: boolean; scaleY?: [number, number]; colors?: string[] };
  // places `count` instances, split evenly over geometry variants; every variant may consist of several [geometry, material] parts sharing transforms
  const placeV = (variants: [THREE.BufferGeometry, THREE.Material][][], count: number, dMin: number, dMax: number, sMin: number, sMax: number, opts: PlaceOpts = {}) => {
    count = Math.floor(count * det); if (count <= 0) return;
    const per = Math.ceil(count / variants.length); const allMats: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    variants.forEach((parts, vi) => {
      const mats: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
      let tries = 0;
      while (mats.length < per && tries < per * 20) {
        tries++;
        const s = td.main.samples[Math.floor(rng() * td.N)];
        const ang = rng() * Math.PI * 2; const dist = dMin + Math.pow(rng(), 1.5) * (dMax - dMin);
        const x = s.x + Math.cos(ang) * (dist + s.hw), z = s.z + Math.sin(ang) * (dist + s.hw);
        const nn = near(x, z); const size = sMin + rng() * (sMax - sMin);
        if (nn.d < nn.s.hw + dMin * 0.5) continue;
        if (!opts.air && !roadClear(x, z, size * (opts.foot ?? 1.4), 2)) continue;
        const y = (opts.air ? nn.s.y + opts.air * (0.5 + rng()) : heightAt(x, z)) + (opts.yOff ?? 0) * size;
        const sy = opts.scaleY ? opts.scaleY[0] + rng() * (opts.scaleY[1] - opts.scaleY[0]) : 1;
        e.set((rng() - 0.5) * (opts.tilt ?? 0), rng() * Math.PI * 2, (rng() - 0.5) * (opts.tilt ?? 0)); q.setFromEuler(e);
        mats.push(m.compose(v.set(x, y, z), q, sc.set(size, size * sy, size)).clone());
        if (!opts.air && sMax > 7.5) zones.push({ x, z, r: size * (opts.foot ?? 1.4) });
        if (opts.perch && size > 2.2) perches.push({ x, z, r: size * 0.8, top: y + size * 0.6 });
        if (opts.colors) cols.push(new THREE.Color(opts.colors[Math.floor(rng() * opts.colors.length)]));
      }
      if (!mats.length) return;
      allMats.push(...mats);
      const low = opts.low?.[vi];
      // air objects (balloons) and huge mesas: big cells; everything else 500 m cells (frustum + distance culling, near-only shadows)
      const big = opts.air || sMax > 40;
      (big ? cellsFar : cells).add(group, parts, mats, cols, big ? 1200 : 500, opts.shadow ?? true, low);
      for (const [geo] of [...parts, ...(low ?? [])]) disp.push(geo);
    });
    if (opts.impostor) { const im = buildImpostors(group, allMats, opts.impostor.kind, opts.impostor.w, opts.impostor.h, 1400 * dd - 150, opts.impostor.tint); if (im) disp.push(im); }
  };
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, dMin: number, dMax: number, sMin: number, sMax: number, opts: PlaceOpts = {}) => placeV([[[geo, mat]]], count, dMin, dMax, sMin, sMax, opts);
  const nVar = gq >= 3 ? 4 : gq === 2 ? 3 : 2; const vq = gq >= 3 ? 3 : gq === 2 ? 2 : 1;
  const seeds = (base: number) => Array.from({ length: nVar }, (_, k) => base + k * 7.3);
  // detail maps for vegetation (vertex colours carry AO/tint, maps add leaf/bark structure)
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: leafTexture(), vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  const barkMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: barkTexture(), vertexColors: true, roughness: 0.92 });
  const boulderMat = surfaceMaterial(wallTex, { repeat: [1, 1], normalScale: 1.6, emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff', emissiveIntensity: theme.id === 'lava' ? 1.4 : theme.id === 'crystal' ? 0.6 : 0 });
  boulderMat.vertexColors = true; rockMat.vertexColors = true;
  disp.push(leafMat, barkMat, boulderMat);
  const d1 = gq >= 3 ? 3 : gq === 2 ? 2 : 1;
  for (const kind of theme.decor) {
    switch (kind) {
      case 'rocks': placeV(seeds(1).map(sd => [[boulderGeo(d1, sd, 0.7), boulderMat]]), 500, 8, 300, 1.5, 7, { perch: true, foot: 1.5, yOff: 0.12, tilt: 0.35, low: seeds(1).map(sd => [[boulderGeo(0, sd, 0.7), boulderMat]]) }); break;
      case 'lavaRocks': placeV(seeds(4).map(sd => [[boulderGeo(d1, sd, 0.8), boulderMat]]), 500, 8, 400, 2, 12, { perch: true, foot: 1.5, yOff: 0.08, tilt: 0.4, low: seeds(4).map(sd => [[boulderGeo(0, sd, 0.8), boulderMat]]) }); break;
      case 'spires': placeV(seeds(11).map(sd => [[spireGeo(sd), rockMat]]), 160, 40, 900, 8, 22, { foot: 1.2, scaleY: [3, 7] }); break;
      case 'mesas': placeV(seeds(21).map(sd => [[mesaGeo(sd), rockMat]]), 40, 300, 2200, 50, 160, { foot: 1.4, scaleY: [0.5, 1.1], yOff: -0.05 }); break;
      case 'cacti': placeV(seeds(31).map(sd => [[cactusGeo(sd), new THREE.MeshStandardMaterial({ color: '#5a7a3a', vertexColors: true, roughness: 0.7 })]]), 300, 10, 300, 0.8, 1.6, { foot: 1.5 }); break;
      case 'iceSpikes': placeV(seeds(81).map(sd => [[iceShardGeo(sd), new THREE.MeshPhysicalMaterial({ vertexColors: true, color: '#b8e4ff', roughness: 0.12, metalness: 0.05, clearcoat: 1, emissive: '#1a4a7a', emissiveIntensity: 0.35 })]]), 400, 8, 500, 2.5, 9, { foot: 1.3, scaleY: [1.6, 4], tilt: 0.25 }); break;
      case 'pines': { const pineLeaf = theme.id === 'ice' ? snowLeafMaterial(leafTexture(), 0.85) : leafMat; disp.push(pineLeaf); placeV(seeds(41).map(sd => { const [w, l] = pineGeo(sd, vq); return [[w, barkMat], [l, pineLeaf]]; }), 900, 15, 700, 0.55, 1.2, { foot: 2.6, impostor: { kind: 'conifer', w: 8, h: 15, tint: theme.id === 'ice' ? new THREE.Color(1.5, 1.5, 1.55) : new THREE.Color(1, 1, 1) }, colors: theme.id === 'ice' ? ['#ffffff'] : ['#5a7a62', '#4a6a58', '#6a8a6a', '#55705a'], low: seeds(41).map(sd => { const [w, l] = pineGeo(sd, 0); return [[w, barkMat], [l, pineLeaf]] as Part[]; }) }); break; }
      case 'trees': placeV(seeds(51).map(sd => { const [w, l] = jungleTreeGeo(sd, vq); return [[w, barkMat], [l, leafMat]]; }), 1200, 10, 600, 0.9, 2.1, { foot: 6.5, impostor: { kind: 'broadleaf', w: 12, h: 20, tint: new THREE.Color(0.95, 1.0, 0.9) }, colors: ['#9ac088', '#b0cc8a', '#88b070', '#a8c898'], low: seeds(51).map(sd => { const [w, l] = jungleTreeGeo(sd, 0); return [[w, barkMat], [l, leafMat]] as Part[]; }) }); break;
      case 'ferns': placeV(seeds(61).map(sd => [[fernGeo(sd), leafMat]]), 900, 4, 200, 1, 2.4, { foot: 1.6, shadow: false, colors: ['#a0c890', '#b8d898', '#90b878'] }); break;
      case 'buildings': case 'towers': {
        const wc = document.createElement('canvas'); wc.width = 256; wc.height = 512; const ctx = wc.getContext('2d')!;
        ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, 256, 512);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) { if (Math.random() < 0.35) { ctx.fillStyle = ['#ffd890', '#90d8ff', '#ffb0d8', '#fff0c0'][Math.floor(Math.random() * 4)]; ctx.globalAlpha = 0.5 + Math.random() * 0.5; ctx.fillRect(x * 32 + 5, y * 16 + 4, 22, 9); } }
        ctx.globalAlpha = 1; ctx.fillStyle = '#1a1e28'; for (let x = 0; x < 8; x++) ctx.fillRect(x * 32, 0, 3, 512);
        const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(1, 2); wt.anisotropy = 8;
        const bm = new THREE.MeshStandardMaterial({ color: '#3a4050', metalness: 0.85, roughness: 0.25, map: wt, emissiveMap: wt, emissive: '#ffffff', emissiveIntensity: 0.9 });
        disp.push(bm, wt);
        if (kind === 'buildings') place(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bm, 700, 30, 2200, 25, 70, { foot: 0.75, scaleY: [3, 9] });
        else {
          const g = mergeGeometries([new THREE.CylinderGeometry(0.6, 1, 1, 8).translate(0, 0.5, 0), new THREE.CylinderGeometry(1.4, 1.4, 0.04, 8).translate(0, 0.85, 0), new THREE.ConeGeometry(0.3, 0.3, 8).translate(0, 1.15, 0)]);
          place(g, bm, 160, 60, 1800, 30, 60, { foot: 1.45, scaleY: [6, 11] });
        }
        break;
      }
      case 'crystals': placeV(seeds(71).map(sd => [[crystalGeo(sd), new THREE.MeshPhysicalMaterial({ vertexColors: true, color: '#c8a0ff', roughness: 0.05, metalness: 0.1, clearcoat: 1, emissive: '#8a3aff', emissiveIntensity: 0.8 })]]), 600, 6, 500, 0.8, 3, { foot: 1.4, tilt: 0.3, colors: ['#d0a0ff', '#90c0ff', '#ff90e0'] }); break;
      case 'wrecks': {
        const g = mergeGeometries([new THREE.CylinderGeometry(1, 1.2, 6, 14).rotateZ(Math.PI / 2).toNonIndexed(), new THREE.BoxGeometry(2.5, 0.3, 4).translate(0, 1, 0).toNonIndexed(), new THREE.TorusGeometry(1.1, 0.15, 6, 14).rotateY(Math.PI / 2).translate(2.5, 0, 0).toNonIndexed()]);
        place(g, new THREE.MeshStandardMaterial({ color: '#5a4a40', metalness: 0.7, roughness: 0.6 }), 60, 10, 200, 0.8, 1.5, { foot: 3.5, tilt: 1.2, yOff: 0.3 }); break;
      }
      case 'balloons': {
        const g = mergeGeometries([new THREE.SphereGeometry(1, 20, 14).scale(1, 0.8, 2.2).toNonIndexed(), new THREE.BoxGeometry(0.6, 0.4, 1.2).translate(0, -1, 0).toNonIndexed()]);
        place(g, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.2 }), 40, 60, 1200, 6, 14, { air: 120, shadow: false, colors: ['#d84a3a', '#e8c24a', '#4a8ad8', '#e8e0d0'] }); break;
      }
      case 'pylons': {
        const g = mergeGeometries([new THREE.CylinderGeometry(0.4, 1, 30, 6).translate(0, 15, 0).toNonIndexed(), new THREE.SphereGeometry(0.9, 10, 8).translate(0, 30.5, 0).toNonIndexed()]);
        place(g, new THREE.MeshStandardMaterial({ color: '#606878', metalness: 0.9, roughness: 0.3, emissive: theme.barrierColor, emissiveIntensity: 0.4 }), 90, 30, 900, 1, 2, { foot: 1.2 }); break;
      }
    }
  }
  return { update: (cam: THREE.Vector3) => { cells.update(cam); cellsFar.update(cam); }, zones, perches };
}

function addArches(td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], rng: () => number, roadClear: (x: number, z: number, r: number, margin?: number) => boolean) {
  const S = td.main.samples; const list: THREE.BufferGeometry[] = [];
  for (const idx of td.arches) {
    const s = S[idx]; const span = s.hw + 12;
    const feetOk = [-1, 1].every(sd => roadClear(s.x + s.rx * sd * span, s.z + s.rz * sd * span, 5, 0));
    if (!feetOk) continue;
    const g = new THREE.TorusGeometry(span, 4 + rng() * 3, 16, 48, Math.PI);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 0.8 + fbm(x * 0.15, y * 0.15 + z * 0.2, 4) * 0.6; p.setXYZ(i, x + (x * 0.06) * (n - 1) * 5, y * 0.75 + (n - 1) * 3, z * n * 1.6); }
    g.computeVertexNormals();
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 2);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y - 3, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1.2 + rng() * 0.8, 1)));
    list.push(g);
  }
  if (!list.length) return;
  const merged = mergeGeometries(list); list.forEach(g => g.dispose()); if (!merged) return;
  const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); disp.push(merged);
}

function addObstacles(td: TrackData, group: THREE.Group, theme: ThemeDef, rockMat: THREE.Material, disp: { dispose: () => void }[]) {
  const metal = new THREE.MeshStandardMaterial({ color: '#7a7f88', metalness: 0.85, roughness: 0.35 });
  const warn = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.5) });
  disp.push(metal, warn);
  const beacons: THREE.Matrix4[] = [];
  const rocks: THREE.Matrix4[] = [], cols: THREE.Matrix4[] = [], rings: THREE.Matrix4[] = [], boxes: THREE.Matrix4[] = [], lights: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), I = new THREE.Quaternion();
  const C = (x: number, y: number, z: number, qq: THREE.Quaternion, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), qq, new THREE.Vector3(sx, sy, sz));
  for (const o of td.obstacles) {
    if (o.kind >= 3) continue; // hazard vents / set-piece solids have their own visuals
    if (o.kind === 0) { e.set(0, o.idx * 1.3, 0); q.setFromEuler(e); rocks.push(C(o.x, o.y + o.r * 0.35, o.z, q.clone(), o.r * 1.1, o.r * 1.1, o.r * 1.1)); rings.push(C(o.x, o.y + 0.25, o.z, I, o.r * 1.35, o.r * 1.35, o.r * 1.35)); beacons.push(C(o.x, o.y + o.r * 1.35, o.z, I, 1, 1, 1)); }
    else if (o.kind === 1) { cols.push(C(o.x, o.y + 4.5, o.z, I, o.r, 9, o.r)); rings.push(C(o.x, o.y + 2, o.z, I, o.r, o.r, o.r)); }
    else { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.idx); boxes.push(C(o.x, o.y + o.r * 0.6, o.z, q.clone(), o.r * 1.5, o.r * 1.2, o.r * 1.5)); lights.push(C(o.x, o.y + o.r * 1.25, o.z, I, 1, 1, 1)); }
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = true) => {
    if (!list.length) { geo.dispose(); return; }
    const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); disp.push(geo);
  };
  inst(rockGeo(2, 9, 0.8), rockMat, rocks);
  inst(new THREE.CylinderGeometry(0.8, 1, 1, 16), rockMat, cols);
  inst(new THREE.TorusGeometry(0.95, 0.07, 6, 24).rotateX(Math.PI / 2), warn, rings, false);
  inst(new THREE.BoxGeometry(1, 1, 1), metal, boxes);
  inst(new THREE.SphereGeometry(0.3, 8, 6), warn, lights, false);
  // obstacle rocks: own darker, warmer material (no longer camouflaged by the canyon wall texture) + warning beacon
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb040').multiplyScalar(2.2), toneMapped: false }); disp.push(beaconMat);
  inst(mergeGeometries([new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6).translate(0, 0.7, 0), new THREE.SphereGeometry(0.28, 10, 8).translate(0, 1.45, 0)].map(g => g.toNonIndexed()))!, beaconMat, beacons, false);
}

function buildZeroGTubes(path: Path, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], theme: ThemeDef) {
  const S = path.samples; const n = S.length;
  let i = 0;
  while (i < n) {
    if (!S[i].zeroG) { i++; continue; }
    let j = i; while (j < n && S[j].zeroG) j++;
    const from = i + 2, to = j - 3;
    const segA = 20; const pos: number[] = [], uv: number[] = [], ind: number[] = [];
    let v = 0; const lamps: THREE.Matrix4[] = [];
    for (let k = from; k <= to; k += 2) {
      const s = S[k];
      for (let a = 0; a <= segA; a++) {
        const ang = Math.PI * 2 * a / segA; const lat = Math.cos(ang) * (s.hw + 3); const up = Math.sin(ang) * (s.hw + 3) + 7;
        const nz = (vnoise(k * 0.15, a * 0.5) - 0.5) * 1.2;
        pos.push(s.x + s.rx * (lat + nz * Math.cos(ang)), s.y + up + nz * Math.sin(ang), s.z + s.rz * (lat + nz * Math.cos(ang)));
        uv.push(s.s / 14, a / segA * 4);
      }
      if (k > from) for (let a = 0; a < segA; a++) { const p0 = v - (segA + 1) + a, p1 = v + a; ind.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
      v += segA + 1;
      if (k % 12 === 0) lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.hw + 9, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1)));
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
      const m2 = (mat as THREE.MeshStandardMaterial).clone(); m2.side = THREE.DoubleSide; m2.transparent = true; m2.opacity = 0.72;
      const m = new THREE.Mesh(g, m2); m.receiveShadow = true; group.add(m); disp.push(g, m2);
    }
    const lg = new THREE.BoxGeometry(1.2, 0.3, 4);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.8), toneMapped: false });
    if (lamps.length) { const im = new THREE.InstancedMesh(lg, lm, lamps.length); lamps.forEach((mm, k) => im.setMatrixAt(k, mm)); group.add(im); disp.push(lg, lm); }
    i = j;
  }
}

function addAsteroidBelt(td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], rng: () => number) {
  const b = td.bounds; const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.9 + 1800;
  const geo = rockGeo(1, 17, 0.75); disp.push(geo);
  const count = 260; const im = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2; const r = R * (0.85 + Math.pow(rng(), 1.5) * 2.2); const h = (rng() - 0.5) * 1400;
    const size = 8 + Math.pow(rng(), 2) * 90;
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    m.compose(v.set(cx + Math.cos(a) * r, h, cz + Math.sin(a) * r), q, sc.set(size, size * (0.6 + rng() * 0.8), size));
    im.setMatrixAt(i, m);
  }
  im.castShadow = true; group.add(im);
}
