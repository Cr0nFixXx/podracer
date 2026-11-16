import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import { generateTexture } from './textures';
import { surfaceMaterial } from './materials';
import { mulberry32, type Path, type Sample, type TrackData } from './trackBuilder';
import { addProps, type Emitter } from './props';

// cheap 2D value noise
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f) * a; a *= 0.5; f *= 2.02; } return s; }
function ridged(x: number, y: number, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); s += n * n * a; a *= 0.5; f *= 2.03; } return s; }
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface World {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  update: (t: number) => void;
  tvCams: THREE.Vector3[];
  glossy: THREE.Mesh[];
  emitters: Emitter[];
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
  const plx = gfx.parallax && (gfx.shaderDetail ?? 1) > 0 ? 1 : 0; const layers = (gfx.shaderDetail ?? 1) >= 2 ? 24 : 12;
  const bump = gfx.bumpMapping ?? true; const disp = (gfx.tessellation ?? 0) > 0 ? ((gfx.tessellation ?? 0) >= 2 ? 0.5 : 0.25) : 0;
  const roadMat = surfaceMaterial(roadTex, { parallax: plx * 0.025, layers, macro: 0.12, detail: 0.35, bump, displace: disp, envMapIntensity: theme.road === 'ice' ? 1.6 : 0.6, emissive: theme.barrierColor, emissiveIntensity: 1.2 });
  const wallMat = surfaceMaterial(wallTex, { parallax: plx * 0.06, layers, normalScale: 1.4, macro: 0.28, detail: 0.6, bump, displace: disp * 1.5, emissive: theme.id === 'crystal' ? '#c87aff' : '#ff5a10', emissiveIntensity: theme.id === 'crystal' ? 0.8 : 1.4 });
  const groundMat = surfaceMaterial(groundTex, { repeat: [1, 1], parallax: plx * 0.04, layers, macro: 0.3, detail: 0.5, bump, triplanar: { set: wallTex, scale: 1 / 26 }, emissive: theme.emissiveGround ?? '#ff4a10', emissiveIntensity: 1.1 });
  groundMat.vertexColors = true;
  disposables.push(roadMat, wallMat, groundMat);
  if (theme.road === 'ice') { roadMat.roughness = 0.6; glossy.push(); }

  progress(0.35, 'Baue Strecke …'); await yield_();
  const maxStep = geoQ >= 3 ? 2 : geoQ === 2 ? 3 : 5; // adaptive sampling: dense in curves/transitions, sparse on straights
  const across = (geoQ >= 3 ? 32 : geoQ === 2 ? 18 : 10) + ((gfx.tessellation ?? 0) >= 2 ? 16 : (gfx.tessellation ?? 0) > 0 ? 8 : 0);
  const barrierMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.5), toneMapped: false });
  disposables.push(barrierMat);
  const pylonPos: THREE.Matrix4[] = [];

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
      const m = new THREE.Mesh(g, roadMat); m.receiveShadow = true; group.add(m); disposables.push(g);
      if (theme.road === 'ice' || theme.road === 'cityRoad' || theme.road === 'mud') glossy.push(m);
    }
    // ---- skirts / walls / barriers ----
    for (const side of [-1, 1]) {
      // skirt
      const sp: number[] = [], su: number[] = [], si: number[] = [];
      const wp: number[] = [], wu: number[] = [], wi: number[] = [];
      const bp: number[] = [], bi: number[] = [];
      const K = geoQ >= 3 ? 12 : geoQ === 2 ? 8 : 5;
      const prof: [number, number][] = [[0, 0], [0.3, 0.1], [1.5, 0.25], [1.0, 0.45], [2.5, 0.6], [5, 0.75], [9, 0.88], [15, 1.0]];
      let sv = 0, wv = 0, bv = 0; let prevS = false, prevW = false, prevB = false; let sAcc = 0;
      for (let k = 0; k < idxs.length; k++) {
        const s = S[idxs[k]]; if (k > 0) { const pr = S[idxs[k - 1]]; sAcc += Math.hypot(s.x - pr.x, s.z - pr.z); }
        const open = side > 0 ? s.openR : s.openL;
        const ex = s.x + s.rx * side * s.hw, ez = s.z + s.rz * side * s.hw, ey = s.y + s.ramp - side * s.hw * s.bank;
        // skirt
        const okS = !s.gap;
        sp.push(ex, ey, ez, ex + s.rx * side * 3, ey - 16, ez + s.rz * side * 3); su.push(sAcc / 20, 0, sAcc / 20, 0.8);
        if (okS && prevS) { if (side < 0) si.push(sv - 2, sv, sv - 1, sv - 1, sv, sv + 1); else si.push(sv - 2, sv - 1, sv, sv - 1, sv + 1, sv); }
        sv += 2; prevS = okS;
        // canyon wall
        const okW = s.canyon && !open && !s.gap;
        const H = 16 + fbm(sAcc * 0.004 + side * 10, 3.3) * 34;
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
        // energy barrier ribbon
        const okB = !s.canyon && !open && !s.gap;
        bp.push(ex, ey + 0.5, ez, ex, ey + 0.85, ez);
        if (okB && prevB) bi.push(bv - 2, bv - 1, bv, bv, bv - 1, bv + 1);
        bv += 2; prevB = okB;
        if (okB && idxs[k] % 10 === 0) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(ex, ey, ez), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.tx, s.tz)), new THREE.Vector3(1, 1, 1));
          pylonPos.push(m);
        }
      }
      const mk = (p: number[], u: number[] | null, i: number[], mat: THREE.Material, shadow: boolean) => {
        if (!i.length) return;
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        if (u) g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
        g.setIndex(i); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); disposables.push(g);
      };
      mk(sp, su, si, wallMat, false);
      mk(wp, wu, wi, wallMat, true);
      const bmat = side > 0 ? barrierMat : barrierMat;
      bmat.side = THREE.DoubleSide;
      mk(bp, null, bi, bmat, false);
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
  // pylons
  if (pylonPos.length) {
    const pg = mergeGeometries([new THREE.CylinderGeometry(0.15, 0.25, 2.2, 8).translate(0, 1.1, 0), new THREE.SphereGeometry(0.3, 10, 8).translate(0, 2.3, 0)]);
    const im = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: '#555a66', metalness: 0.9, roughness: 0.3, emissive: new THREE.Color(theme.barrierColor), emissiveIntensity: 0.35 }), pylonPos.length);
    pylonPos.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; group.add(im); disposables.push(pg);
  }

  // ---- ramps warning chevrons ----
  {
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.3), toneMapped: false, side: THREE.DoubleSide });
    const S = td.main.samples;
    for (let i = 1; i < S.length; i++) {
      if (S[i].ramp > 0 && S[i - 1].ramp === 0) {
        for (let c = 0; c < 4; c++) {
          const s = S[(i + c * 4) % S.length];
          for (const side of [-1, 1]) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), chevMat);
            m.position.set(s.x + s.rx * side * (s.hw * 0.4), s.y + s.ramp - side * s.hw * 0.4 * s.bank + 0.35, s.z + s.rz * side * s.hw * 0.4);
            m.rotation.set(-Math.PI / 2, 0, -Math.atan2(s.tx, s.tz) + Math.PI / 2 + side * 0.5, 'YXZ');
            m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(s.tx, s.tz) + side * 0.6; m.rotation.x = -Math.PI / 2;
            group.add(m);
          }
        }
      }
    }
  }

  // ---- start / finish line ----
  addStartArea(td, group, theme, disposables, rng);

  progress(0.55, 'Generiere Terrain …'); await yield_();
  // ---------- terrain height field ----------
  const coarse: Sample[] = []; for (const p of td.paths) for (let i = 0; i < p.samples.length; i += 4) coarse.push(p.samples[i]);
  const cell = 40; const grid = new Map<number, Sample[]>();
  const key = (cx: number, cz: number) => cx * 100003 + cz;
  for (const s of coarse) { const k = key(Math.floor(s.x / cell), Math.floor(s.z / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(s); }
  const sparse: Sample[] = []; for (let i = 0; i < td.main.samples.length; i += 20) sparse.push(td.main.samples[i]);
  const avgY = td.main.samples.reduce((a, s) => a + s.y, 0) / td.N;
  const nearest = (x: number, z: number) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell); let bd = 1e12, bs: Sample | null = null;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const arr = grid.get(key(cx + i, cz + j)); if (!arr) continue; for (const s of arr) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; bs = s; } } }
    if (!bs) { for (const s of sparse) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; bs = s; } } }
    return { d: Math.sqrt(bd), s: bs! };
  };
  // true if a circle (x,z,r) keeps at least `margin` metres distance to every road surface (all paths)
  const roadClear = (x: number, z: number, r: number, margin = 3) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    const reach = Math.ceil((r + margin + 40) / cell) + 1;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const arr = grid.get(key(cx + i, cz + j)); if (!arr) continue;
      for (const q of arr) { const d = Math.hypot(q.x - x, q.z - z); if (d - q.hw - 1 < r + margin) return false; }
    }
    return true;
  };
  const T = theme.terrain;
  const heightAt = (x: number, z: number) => {
    const { d, s } = nearest(x, z);
    const near = s.y - 3.5 - Math.abs(s.bank) * s.hw;
    let far: number;
    const nx = x * 0.002, nz = z * 0.002;
    switch (T) {
      case 'canyon': far = s.y + 22 + fbm(nx * 3, nz * 3) * 25 + sstep(500, 1600, d) * ridged(nx, nz) * 160; break;
      case 'mountains': far = avgY - 5 + fbm(nx * 2, nz * 2) * 30 + sstep(200, 1400, d) * ridged(nx * 0.8, nz * 0.8) * 320; break;
      case 'dunes': far = avgY - 4 + fbm(nx * 4, nz * 4) * 30; break;
      case 'lava': far = avgY - 18 + sstep(0.45, 0.75, fbm(nx * 2.5, nz * 2.5)) * 40 + sstep(400, 1600, d) * ridged(nx, nz) * 220; break;
      case 'jungle': far = avgY - 6 + fbm(nx * 3, nz * 3) * 35 + sstep(300, 1500, d) * ridged(nx, nz) * 140; break;
      case 'city': far = -160; break;
      case 'prison': far = -400; break;
      case 'ocean': far = avgY - 30 + sstep(0.55, 0.75, fbm(nx * 2, nz * 2)) * 45; break;
      default: far = avgY;
    }
    const blendStart = s.hw + 8;
    let h = near + (far - near) * sstep(blendStart, blendStart + (T === 'canyon' ? 40 : 120), d);
    if (T === 'city') h = Math.min(h, s.y - 30) * (d < s.hw + 10 ? 1 : 1);
    if (T === 'city' || T === 'prison') h = T === 'city' ? -160 : -400;
    if (s.gap && d < s.hw + 40) h = Math.min(h, s.y - 55 + sstep(s.hw, s.hw + 40, d) * 40);
    if (T === 'lava' && d < s.hw + 30) h = Math.min(h, near - sstep(s.hw + 4, s.hw + 30, d) * 14);
    return h;
  };

  const b = td.bounds; const margin = 2600 * gfx.drawDistance;
  const W = b.maxX - b.minX + margin * 2, D = b.maxZ - b.minZ + margin * 2;
  const segs = geoQ >= 3 ? 640 : geoQ === 2 ? 400 : 200;
  const tg = new THREE.PlaneGeometry(W, D, segs, Math.round(segs * D / W));
  tg.rotateX(-Math.PI / 2);
  const cxm = (b.minX + b.maxX) / 2, czm = (b.minZ + b.maxZ) / 2;
  tg.translate(cxm, 0, czm);
  const tp = tg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) { tp.setY(i, heightAt(tp.getX(i), tp.getZ(i))); if (i % 20000 === 0) { progress(0.55 + 0.25 * i / tp.count, 'Generiere Terrain …'); await yield_(); } }
  tg.computeVertexNormals();
  const tn = tg.attributes.normal as THREE.BufferAttribute;
  const cols = new Float32Array(tp.count * 3);
  const rockC = new THREE.Color(P.wall[1]), gC = new THREE.Color('#ffffff');
  for (let i = 0; i < tp.count; i++) {
    const slope = 1 - tn.getY(i); const t = sstep(0.12, 0.35, slope);
    const c = gC.clone().lerp(rockC.clone().multiplyScalar(1.6), t * 0.2);
    const v = 0.85 + vnoise(tp.getX(i) * 0.01, tp.getZ(i) * 0.01) * 0.3;
    cols[i * 3] = c.r * v; cols[i * 3 + 1] = c.g * v; cols[i * 3 + 2] = c.b * v;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const tuv = tg.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getX(i) / 30, tp.getZ(i) / 30);
  const terrain = new THREE.Mesh(tg, groundMat); terrain.receiveShadow = true; group.add(terrain); disposables.push(tg);

  // water / lava plane
  let animTex: THREE.Texture[] = [];
  if (T === 'lava') {
    const lt = generateTexture('basalt', ['#0a0605', '#1a0d08', '#2a140a'], 512, 99, 8, '#ff7a20');
    const lm = surfaceMaterial(lt, { repeat: [W / 120, D / 120], emissive: '#ff7020', emissiveIntensity: 2.6 });
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lm); lp.rotation.x = -Math.PI / 2; lp.position.set(cxm, avgY - 14, czm); group.add(lp);
    animTex = [lm.map!, lm.emissiveMap!, lm.normalMap!];
    disposables.push(lm);
  } else if (T === 'jungle' || theme.id === 'ice') {
    const nt = generateTexture('snow', ['#888', '#999', '#aaa'], 512, 55, 8);
    const wm = new THREE.MeshStandardMaterial({ color: theme.id === 'ice' ? '#7aa8c8' : '#1a4a40', roughness: theme.id === 'ice' ? 0.15 : 0.04, metalness: 0.3, normalMap: nt.normalMap.clone(), envMapIntensity: 1.5 });
    wm.normalMap!.repeat.set(W / 60, D / 60); wm.normalMap!.needsUpdate = true;
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(W, D), wm); wp.rotation.x = -Math.PI / 2; wp.position.set(cxm, avgY - 8, czm); wp.receiveShadow = true; group.add(wp); glossy.push(wp);
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
  scatterDecor(theme, group, td, heightAt, distToTrack, gfx, disposables, rng, wallTex, roadClear);
  addArches(td, group, wallMat, disposables, rng, roadClear);
  addObstacles(td, group, theme, wallMat, disposables);
  progress(0.9, 'Platziere Streckendetails …'); await yield_();
  const props = addProps(td, theme, group, gfx, heightAt, disposables, rng, roadClear);

  // tv cams
  const tvCams: THREE.Vector3[] = [];
  const S = td.main.samples;
  for (let i = 0; i < S.length; i += 110) { const s = S[i]; const side = (i / 110) % 2 ? 1 : -1; tvCams.push(new THREE.Vector3(s.x + s.rx * side * (s.hw + 6), s.y + 7 + (s.canyon ? 6 : 0), s.z + s.rz * side * (s.hw + 6))); }

  progress(0.95, 'Kompiliere Shader …'); await yield_();
  const update = (t: number) => { for (const tx of animTex) { tx.offset.x = t * 0.004; tx.offset.y = t * 0.006; } props.update(t); };
  return { group, heightAt, update, tvCams, glossy, emitters: props.emitters, dispose: () => disposables.forEach(d => d.dispose()) };
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
    for (const side of [-1, 1]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2, 22, 20), metal); tw.position.set(side * (s.hw + 3), 11, 0); tw.castShadow = true; g.add(tw);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 12), metal); cap.position.set(side * (s.hw + 3), 22.5, 0); g.add(cap);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(s.hw * 2 + 8, 2.4, 1.6), metal); beam.position.y = 19; beam.castShadow = true; g.add(beam);
    for (let i = 0; i < 10; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), lightOn); l.position.set(-s.hw + i * (s.hw * 2 / 9), 17.6, 0.6); g.add(l); }
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
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.75 + fbm(x * 1.5 + seed, y * 1.5 + z * 1.3, 4) * 0.6;
    p.setXYZ(i, x * n, y * n * stretch, z * n);
  }
  g.computeVertexNormals();
  return g;
}

function scatterDecor(theme: ThemeDef, group: THREE.Group, td: TrackData, heightAt: (x: number, z: number) => number,
  near: (x: number, z: number) => { d: number; s: Sample }, gfx: GfxSettings, disp: { dispose: () => void }[], rng: () => number,
  wallTex: ReturnType<typeof generateTexture>, roadClear: (x: number, z: number, r: number, margin?: number) => boolean) {
  const det = gfx.detail; const gq = gfx.geometry;
  const rockMat = surfaceMaterial(wallTex, { repeat: [2, 2], normalScale: 1.5, emissive: theme.id === 'lava' ? '#ff5a10' : '#c87aff', emissiveIntensity: theme.id === 'lava' ? 1.4 : theme.id === 'crystal' ? 0.6 : 0 });
  disp.push(rockMat);
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, dMin: number, dMax: number, sMin: number, sMax: number, opts: { foot?: number; yOff?: number; tilt?: number; air?: number; shadow?: boolean; scaleY?: [number, number]; colors?: string[] } = {}) => {
    count = Math.floor(count * det); if (count <= 0) return;
    const im = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 20) {
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
      m.compose(v.set(x, y, z), q, sc.set(size, size * sy, size)); im.setMatrixAt(placed, m);
      if (opts.colors) im.setColorAt(placed, new THREE.Color(opts.colors[Math.floor(rng() * opts.colors.length)]));
      placed++;
    }
    im.count = placed; im.castShadow = opts.shadow ?? true; im.receiveShadow = true; group.add(im); disp.push(geo);
  };
  const d1 = gq >= 3 ? 3 : gq === 2 ? 2 : 1;
  for (const kind of theme.decor) {
    switch (kind) {
      case 'rocks': place(rockGeo(d1, 1, 0.7), rockMat, 500, 8, 300, 1.5, 7, { foot: 1.5, yOff: 0.2, tilt: 0.6 }); break;
      case 'lavaRocks': place(rockGeo(d1, 4, 0.8), rockMat, 500, 8, 400, 2, 12, { foot: 1.5, yOff: 0.1, tilt: 0.5 }); break;
      case 'spires': {
        const g = new THREE.CylinderGeometry(0.35, 1, 1, 12, 16); g.translate(0, 0.5, 0);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i); const n = 0.7 + fbm(y * 6, p.getX(i) * 2 + p.getZ(i), 3) * 0.7; p.setX(i, p.getX(i) * n); p.setZ(i, p.getZ(i) * n); }
        g.computeVertexNormals();
        place(g, rockMat, 160, 40, 900, 8, 22, { foot: 1.2, scaleY: [3, 7] }); break;
      }
      case 'mesas': {
        const g = new THREE.CylinderGeometry(1, 1.25, 1, 28, 10); g.translate(0, 0.5, 0);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); const a = Math.atan2(z, x); const n = 0.8 + fbm(a * 3, y * 3, 4) * 0.45; if (Math.hypot(x, z) > 0.5) { p.setX(i, x * n); p.setZ(i, z * n); } }
        g.computeVertexNormals();
        place(g, rockMat, 40, 300, 2200, 50, 160, { foot: 1.4, scaleY: [0.5, 1.1], yOff: -0.05 }); break;
      }
      case 'cacti': {
        const g = mergeGeometries([new THREE.CylinderGeometry(0.35, 0.4, 4, 10).translate(0, 2, 0), new THREE.CylinderGeometry(0.22, 0.25, 1.6, 8).translate(0.9, 2.6, 0), new THREE.CylinderGeometry(0.22, 0.25, 0.8, 8).rotateZ(Math.PI / 2).translate(0.5, 1.9, 0)]);
        place(g, new THREE.MeshStandardMaterial({ color: '#4a6a30', roughness: 0.8 }), 300, 10, 300, 0.8, 1.6, { foot: 1.5 }); break;
      }
      case 'iceSpikes': {
        const g = new THREE.ConeGeometry(1, 1, 7, 4); g.translate(0, 0.5, 0);
        place(g, new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive: '#2a6a9a', emissiveIntensity: 0.4 }), 400, 8, 500, 2, 8, { foot: 1.3, scaleY: [2, 6], tilt: 0.5 }); break;
      }
      case 'pines': {
        const parts = [new THREE.CylinderGeometry(0.25, 0.35, 3, 8).translate(0, 1.5, 0)];
        for (let k = 0; k < 4; k++) parts.push(new THREE.ConeGeometry(2.4 - k * 0.5, 3, 10).translate(0, 3 + k * 1.8, 0));
        const g = mergeGeometries(parts.map(p => p.toNonIndexed()));
        place(g, new THREE.MeshStandardMaterial({ color: '#2a4a3a', roughness: 0.9 }), 900, 15, 700, 1.4, 3, { foot: 2.6 }); break;
      }
      case 'trees': {
        const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.4, 0.8, 14, 10).translate(0, 7, 0).toNonIndexed()];
        for (let k = 0; k < 5; k++) parts.push(new THREE.IcosahedronGeometry(3 + (k % 2), 2).translate(Math.cos(k * 1.3) * 2.5, 13 + (k % 3) * 1.5, Math.sin(k * 1.3) * 2.5).toNonIndexed());
        const g = mergeGeometries(parts);
        place(g, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, vertexColors: false }), 1200, 10, 600, 1, 2.4, { foot: 6.5, colors: ['#2d5a1e', '#3a6a24', '#4a7a2a', '#2a4a18'] }); break;
      }
      case 'ferns': {
        const g = new THREE.ConeGeometry(1.5, 1.2, 7, 1, true); g.translate(0, 0.4, 0);
        place(g, new THREE.MeshStandardMaterial({ color: '#4a8a30', roughness: 0.8, side: THREE.DoubleSide }), 900, 4, 200, 0.8, 2, { foot: 1.6, shadow: false }); break;
      }
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
      case 'crystals': {
        const parts: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 5; k++) { const c = new THREE.CylinderGeometry(0.0, 0.4, 3 + k * 0.6, 6).translate(0, 1.5, 0); c.rotateZ((k - 2) * 0.3); c.rotateX((k % 2 - 0.5) * 0.4); parts.push(c.toNonIndexed()); }
        const g = mergeGeometries(parts);
        place(g, new THREE.MeshPhysicalMaterial({ color: '#c8a0ff', roughness: 0.05, metalness: 0.1, clearcoat: 1, emissive: '#8a3aff', emissiveIntensity: 0.8 }), 600, 6, 500, 1.5, 6, { foot: 1.4, tilt: 0.3, colors: ['#d0a0ff', '#90c0ff', '#ff90e0'] }); break;
      }
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
}

function addArches(td: TrackData, group: THREE.Group, mat: THREE.Material, disp: { dispose: () => void }[], rng: () => number, roadClear: (x: number, z: number, r: number, margin?: number) => boolean) {
  const S = td.main.samples;
  for (const idx of td.arches) {
    const s = S[idx]; const span = s.hw + 12;
    const feetOk = [-1, 1].every(sd => roadClear(s.x + s.rx * sd * span, s.z + s.rz * sd * span, 5, 0));
    if (!feetOk) continue;
    const g = new THREE.TorusGeometry(span, 4 + rng() * 3, 16, 48, Math.PI);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 0.8 + fbm(x * 0.15, y * 0.15 + z * 0.2, 4) * 0.6; p.setXYZ(i, x + (x * 0.06) * (n - 1) * 5, y * (0.75 + rng() * 0.0) + (n - 1) * 3, z * n * 1.6); }
    g.computeVertexNormals();
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 2);
    const m = new THREE.Mesh(g, mat); m.position.set(s.x, s.y - 3, s.z); m.rotation.y = Math.atan2(s.tx, s.tz);
    m.scale.y = 1.2 + rng() * 0.8;
    m.castShadow = true; m.receiveShadow = true; group.add(m); disp.push(g);
  }
}

function addObstacles(td: TrackData, group: THREE.Group, theme: ThemeDef, rockMat: THREE.Material, disp: { dispose: () => void }[]) {
  const metal = new THREE.MeshStandardMaterial({ color: '#7a7f88', metalness: 0.85, roughness: 0.35 });
  const warn = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.5), toneMapped: false });
  disp.push(metal, warn);
  const rg = rockGeo(2, 9, 0.8); disp.push(rg);
  for (const o of td.obstacles) {
    let m: THREE.Object3D;
    if (o.kind === 0) { m = new THREE.Mesh(rg, rockMat); m.scale.setScalar(o.r * 1.1); m.position.set(o.x, o.y + o.r * 0.4, o.z); }
    else if (o.kind === 1) {
      const gr = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.8, o.r, 9, 16), rockMat); col.position.y = 4.5; gr.add(col);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.95, 0.15, 6, 20), warn); ring.rotation.x = Math.PI / 2; ring.position.y = 2; gr.add(ring);
      gr.position.set(o.x, o.y, o.z); m = gr;
    } else {
      const gr = new THREE.Group();
      const bx = new THREE.Mesh(new THREE.BoxGeometry(o.r * 1.5, o.r * 1.2, o.r * 1.5), metal); bx.position.y = o.r * 0.6; bx.rotation.y = o.idx; gr.add(bx);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), warn); l.position.y = o.r * 1.25; gr.add(l);
      gr.position.set(o.x, o.y, o.z); m = gr;
    }
    m.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
    group.add(m);
  }
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
