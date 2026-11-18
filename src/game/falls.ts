// Waterfalls / lavafalls / icefalls (session 12).
// Finds real cliffs in the height field (steepest drops away from the track), lays a curved ribbon from the cliff lip
// down the face to the foot, adds a foam / glow pool and a mist / steam source (smoke system) at the base.
// Animated in TSL (scrolling streaks + foam), one draw per kind.
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { TrackData } from './trackBuilder';
import type { SmokeSrc } from './smoke';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { uv, time, mx_noise_float, vec2, vec3, mix, smoothstep, float, oneMinus, pow } = TSL;

export type FallKind = 'water' | 'lava' | 'ice';
/** foot position (x,y,z), footprint radius r, lip position (lx,lz); wall = canyon-wall cascade at the road edge */
export interface FallInfo { x: number; y: number; z: number; r: number; kind: FallKind; wall: boolean; lx: number; lz: number }
interface Field { heightAt: (x: number, z: number) => number }

export function buildFalls(kind: FallKind, td: TrackData, field: Field, dist: (x: number, z: number) => number, rng: () => number,
  group: THREE.Group, disp: { dispose: () => void }[], smokes: SmokeSrc[], maxCount = 7) {
  const H = field.heightAt; const S = td.main.samples;
  // 1. candidate cliffs: steepest local drop (8 directions, 12 m) at random spots 70–900 m off the track
  const cands: { x: number; z: number; dx: number; dz: number; drop: number; vis: number; h0: number }[] = []; const infos: FallInfo[] = [];
  for (let k = 0; k < 900; k++) {
    const s = S[Math.floor(rng() * S.length)]; const a = rng() * Math.PI * 2, d = 70 + rng() * 830;
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; if (dist(x, z) < 55) continue;
    const h0 = H(x, z); let best = 0, bx = 0, bz = 0;
    for (let j = 0; j < 8; j++) { const ax = Math.cos(j * Math.PI / 4), az = Math.sin(j * Math.PI / 4); const dr = h0 - H(x + ax * 12, z + az * 12); if (dr > best) { best = dr; bx = ax; bz = az; } }
    if (best > 16) cands.push({ x, z, dx: bx, dz: bz, drop: best, vis: 0, h0 });
  }
  // session 14: prefer falls that can be seen from the track – terrain line-of-sight from the nearest track point
  // (4 m above the road) to the fall's upper half, and the fall face must point towards the track
  for (const c of cands) {
    let ns = S[0], bd = 1e18; for (let i = 0; i < S.length; i += 8) { const q = S[i]; const d = (q.x - c.x) ** 2 + (q.z - c.z) ** 2; if (d < bd) { bd = d; ns = q; } }
    const tx = c.x + c.dx * 10, tz = c.z + c.dz * 10, ty = c.h0 - c.drop * 0.4; const ax = ns.x, ay = ns.y + 4, az = ns.z;
    let ok = 1; for (let k = 1; k < 18; k++) { const t = k / 18; if (H(ax + (tx - ax) * t, az + (tz - az) * t) > ay + (ty - ay) * t + 1.5) { ok = 0; break; } }
    const facing = ((ns.x - c.x) * c.dx + (ns.z - c.z) * c.dz) / Math.max(1, Math.sqrt(bd));
    c.vis = ok * (facing > 0.2 ? 2 : 1);
  }
  cands.sort((a, b) => (b.vis - a.vis) || (b.drop - a.drop));
  const picked: typeof cands = [];
  for (const c of cands) { if (picked.length >= maxCount) break; if (picked.every(p => Math.hypot(p.x - c.x, p.z - c.z) > 320)) picked.push(c); }
  if (!picked.length) return infos;

  // 2. ribbons
  const pos: number[] = [], uvs: number[] = [], idx: number[] = []; const pool: number[] = [], poolUv: number[] = [], poolIdx: number[] = [];
  for (const c of picked) {
    // walk to the true lip (uphill) and the foot (downhill until the slope flattens)
    let lx = c.x, lz = c.z; for (let i = 0; i < 10; i++) { const nx = lx - c.dx * 3, nz = lz - c.dz * 3; if (H(nx, nz) - H(lx, lz) < 1.2) break; lx = nx; lz = nz; }
    let fx = c.x, fz = c.z, fy = H(fx, fz);
    for (let i = 0; i < 40; i++) { const nx = fx + c.dx * 3, nz = fz + c.dz * 3, ny = H(nx, nz); if (fy - ny < 0.6) break; fx = nx; fz = nz; fy = ny; }
    const ly = H(lx, lz); if (ly - fy < 15) continue;
    const w = 5 + rng() * 9; const px = -c.dz, pz = c.dx; // across-fall axis
    const seg = 28; const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      // ballistic-ish arc away from the face, then hugging it near the foot; stays 1.5 m off the terrain
      const hx = lx + (fx - lx) * t, hz = lz + (fz - lz) * t;
      const out = 1.5 + Math.sin(t * Math.PI) * Math.min(8, (ly - fy) * 0.18);
      // keep ≥ 3 m above the terrain under the ribbon centre AND both edges (no clipping zig-zags)
      const gx = hx + c.dx * out, gz = hz + c.dz * out; const ground = Math.max(H(gx, gz), H(gx + px * w * 0.5, gz + pz * w * 0.5), H(gx - px * w * 0.5, gz - pz * w * 0.5));
      const y = Math.max(ground + 3, ly + (fy - ly) * Math.pow(t, 1.35));
      const ww = w * (0.85 + t * 0.35);
      for (const sd of [-1, 1]) { pos.push(hx + c.dx * out + px * ww * 0.5 * sd, y, hz + c.dz * out + pz * ww * 0.5 * sd); uvs.push(sd < 0 ? 0 : 1, t * (ly - fy) / 5); }
      if (i < seg) { const q = base + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    // pool / glow disc at the foot
    const pb = pool.length / 3; const pr = w * 1.6;
    pool.push(fx, fy + 0.35, fz); poolUv.push(0.5, 0.5);
    for (let j = 0; j <= 24; j++) { const a = (j / 24) * Math.PI * 2; pool.push(fx + Math.cos(a) * pr, fy + 0.35, fz + Math.sin(a) * pr); poolUv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); if (j < 24) poolIdx.push(pb, pb + j + 2, pb + j + 1); }
    infos.push({ x: fx, y: fy, z: fz, r: w * 1.2, kind, wall: false, lx, lz });
    if (kind !== 'ice') smokes.push({ x: fx, y: fy, z: fz, kind: kind === 'lava' ? 'dark' : 'steam', scale: kind === 'lava' ? 0.35 : 0.3 });
  }
  if (!idx.length) return infos;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pool, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(poolUv, 2)); pg.setIndex(poolIdx); pg.computeVertexNormals();

  // 3. materials
  const { fall, pool: poolM } = fallMaterials(kind);
  const fm = new THREE.Mesh(geo, fall); fm.userData.fall = 'terrain'; fm.userData.fallVerts = 58; fm.castShadow = kind !== 'water'; fm.receiveShadow = true; fm.renderOrder = 3; group.add(fm);
  const pm = new THREE.Mesh(pg, poolM); pm.receiveShadow = true; pm.renderOrder = 3; group.add(pm);
  disp.push(geo, pg, fall, poolM);
  return infos;
}

/** Shared animated materials (session 12/13): ribbon + base pool for a fall kind. UV: x across, y along the fall. */
export function fallMaterials(kind: FallKind) {
  const u = uv(); const edge = smoothstep(0.0, 0.18, u.x).mul(oneMinus(smoothstep(0.82, 1.0, u.x))); // WGSL: never smoothstep(a, b) with a >= b
  const speed = kind === 'lava' ? 0.35 : kind === 'ice' ? 0 : 1.6;
  const streak = mx_noise_float(vec2(u.x.mul(9.0), u.y.mul(1.2).sub(time.mul(speed)))).mul(0.5).add(0.5);
  const fine = mx_noise_float(vec2(u.x.mul(31.0), u.y.mul(4.0).sub(time.mul(speed * 1.7)))).mul(0.5).add(0.5);
  const fall = new THREE.MeshStandardNodeMaterial({ transparent: kind === 'water', side: THREE.DoubleSide, depthWrite: kind !== 'water' });
  const poolM = new THREE.MeshStandardNodeMaterial({ transparent: kind === 'water', depthWrite: kind !== 'water' });
  const rad = TSL.uv().sub(0.5).length().mul(2.0);
  if (kind === 'water') {
    const foam = smoothstep(0.45, 0.85, streak.mul(0.6).add(fine.mul(0.4)));
    fall.colorNode = mix(vec3(0.32, 0.5, 0.52), vec3(0.92, 0.96, 0.97), foam);
    fall.opacityNode = edge.mul(mix(float(0.55), float(0.95), foam));
    fall.roughnessNode = mix(float(0.12), float(0.6), foam);
    poolM.colorNode = mix(vec3(0.9, 0.95, 0.97), vec3(0.35, 0.55, 0.55), smoothstep(0.2, 1.0, rad));
    poolM.opacityNode = oneMinus(smoothstep(0.6, 1.0, rad)).mul(mx_noise_float(vec2(rad.mul(8.0).sub(time.mul(1.5)), TSL.uv().x.mul(6.0))).mul(0.3).add(0.6));
    poolM.roughnessNode = float(0.5);
  } else if (kind === 'lava') {
    const crust = smoothstep(0.48, 0.66, streak.mul(0.7).add(fine.mul(0.3)));
    fall.colorNode = mix(vec3(0.9, 0.3, 0.05), vec3(0.08, 0.05, 0.04), crust);
    fall.emissiveNode = mix(vec3(1.9, 0.5, 0.06), vec3(0.06, 0.012, 0.0), crust).mul(fine.mul(0.6).add(0.6)).mul(edge.mul(0.8).add(0.2));
    fall.roughnessNode = mix(float(0.4), float(0.95), crust);
    poolM.colorNode = vec3(0.12, 0.05, 0.03);
    poolM.emissiveNode = vec3(2.6, 0.7, 0.08).mul(oneMinus(smoothstep(0.3, 1.0, rad))).mul(mx_noise_float(vec2(rad.mul(6.0).sub(time.mul(0.3)), TSL.uv().x.mul(5.0))).mul(0.4).add(0.7));
  } else {
    fall.colorNode = mix(vec3(0.62, 0.78, 0.9), vec3(0.93, 0.97, 1.0), pow(streak, float(1.5)));
    fall.roughnessNode = mix(float(0.08), float(0.4), fine);
    fall.metalnessNode = float(0.05);
    poolM.colorNode = vec3(0.85, 0.92, 0.98); poolM.roughnessNode = float(0.15);
  }
  return { fall, pool: poolM };
}

/** Canyon-wall cascades along the track (session 13): the water follows the stepped, back-leaning wall profile
 *  (same profile as world.ts canyon walls), offset towards the road to clear the wall noise, and ends in a drain
 *  grating at the road edge with a foam patch + mist. Purely visual – collision stays on the wall line. */
const WALL_PROF: [number, number][] = [[0, 0], [0.3, 0.1], [1.5, 0.25], [1.0, 0.45], [2.5, 0.6], [5, 0.75], [9, 0.88], [15, 1.0]];
export function buildWallFalls(td: TrackData, group: THREE.Group, disp: { dispose: () => void }[], smokes: SmokeSrc[], rng: () => number, maxCount = 6) {
  const S = td.main.samples, N = S.length;
  // candidate wall sections: canyon samples with a cliff ≥ 18 m on one side, ≥ 140 samples apart
  const picks: { i: number; side: number; H: number }[] = [];
  const order = Array.from({ length: Math.floor(N / 6) }, (_, k) => k * 6).sort(() => rng() - 0.5);
  for (const i of order) {
    if (picks.length >= maxCount) break;
    const s = S[i]; if (s.gap || s.zeroG || s.ramp !== 0) continue;
    for (const side of rng() < 0.5 ? [-1, 1] : [1, -1]) {
      const H = side > 0 ? s.hR : s.hL; if (H < 18) continue;
      // the wall must exist for the whole fall width (±5 samples) and not be an opening
      let ok = true; for (let k = -5; k <= 5; k++) { const q = S[((i + k) % N + N) % N]; if ((side > 0 ? q.hR : q.hL) < 16 || (side > 0 ? q.openR : q.openL) || q.gap) { ok = false; break; } }
      if (!ok || picks.some(p => { const d = Math.abs(p.i - i); return Math.min(d, N - d) < 140; })) continue;
      picks.push({ i, side, H }); break;
    }
  }
  const infos: FallInfo[] = [];
  if (!picks.length) return infos;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const gp: number[] = [], gu: number[] = [], gi: number[] = []; // grating
  const pp: number[] = [], pu: number[] = [], pi: number[] = []; // foam
  const K = 22;
  for (const { i, side, H } of picks) {
    const s = S[i]; const w = 7 + rng() * 7;
    const ex = s.x + s.rx * side * s.hw, ez = s.z + s.rz * side * s.hw, ey = s.y + s.ramp - side * s.hw * s.bank;
    const base = pos.length / 3;
    for (let j = 0; j <= K; j++) {
      const f = 1 - j / K; // j = 0 at the top
      const pf = f * (WALL_PROF.length - 1); const a = Math.min(WALL_PROF.length - 2, Math.floor(pf)); const t = pf - a;
      const off = WALL_PROF[a][0] + (WALL_PROF[a + 1][0] - WALL_PROF[a][0]) * t; const hh = WALL_PROF[a][1] + (WALL_PROF[a + 1][1] - WALL_PROF[a][1]) * t;
      const lat = 0.6 + off * (H / 25) - (0.9 + 1.9 * Math.min(1, f * 3)); // in front of the face (wall noise ≤ ±2.5 m)
      const y = ey - 1 + hh * H + 0.3;
      const ww = w * (0.75 + (1 - f) * 0.45); // spreads while falling
      for (const sd of [-1, 1]) { pos.push(ex + s.rx * side * lat + s.tx * ww * 0.5 * sd, y, ez + s.rz * side * lat + s.tz * ww * 0.5 * sd); uvs.push(sd < 0 ? 0 : 1, (1 - f) * H / 5); }
      if (j < K) { const q = base + j * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    // drain grating (road edge, under the fall) – 1.4 m deep strip along the wall base
    const g0 = gp.length / 3; const gw = w * 1.3;
    for (const [la, lo] of [[-0.9, 0.4]]) for (const sd of [-1, 1]) for (const l of [la, lo]) {
      gp.push(ex + s.rx * side * l + s.tx * gw * 0.5 * sd, ey + 0.06, ez + s.rz * side * l + s.tz * gw * 0.5 * sd); gu.push(sd < 0 ? 0 : gw / 0.5, l === la ? 0 : 2.6);
    }
    gi.push(g0, g0 + 1, g0 + 2, g0 + 1, g0 + 3, g0 + 2);
    // foam patch on the road edge where the water hits
    const p0 = pp.length / 3; const pr = w * 0.75;
    pp.push(ex - s.rx * side * 0.5, ey + 0.09, ez - s.rz * side * 0.5); pu.push(0.5, 0.5);
    for (let j = 0; j <= 20; j++) { const a2 = (j / 20) * Math.PI * 2; const c = Math.cos(a2), sn = Math.sin(a2); pp.push(ex - s.rx * side * 0.5 + s.tx * c * pr + s.rx * sn * pr * 0.35, ey + 0.09, ez - s.rz * side * 0.5 + s.tz * c * pr + s.rz * sn * pr * 0.35); pu.push(0.5 + c * 0.5, 0.5 + sn * 0.5); if (j < 20) pi.push(p0, p0 + j + 1, p0 + j + 2); }
    smokes.push({ x: ex, y: ey, z: ez, kind: 'steam', scale: 0.22 });
    infos.push({ x: ex, y: ey, z: ez, r: w * 0.75 + 3, kind: 'water', wall: true, lx: ex, lz: ez });
  }
  const mkGeo = (p: number[], u: number[], i: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(i); g.computeVertexNormals(); return g; };
  const geo = mkGeo(pos, uvs, idx), ggeo = mkGeo(gp, gu, gi), pgeo = mkGeo(pp, pu, pi);
  const { fall, pool } = fallMaterials('water');
  // grating: dark steel bars (procedural stripes along u) over a black channel
  const gm = new THREE.MeshStandardNodeMaterial({ metalness: 0.8, roughness: 0.45 });
  const bars = TSL.step(0.55, TSL.fract(uv().x));
  gm.colorNode = mix(vec3(0.02, 0.02, 0.02), vec3(0.28, 0.29, 0.3), bars);
  const fm = new THREE.Mesh(geo, fall); fm.userData.fall = 'wall'; fm.userData.fallVerts = (K + 1) * 2; fm.renderOrder = 3; fm.receiveShadow = true;
  const gmesh = new THREE.Mesh(ggeo, gm); gmesh.receiveShadow = true;
  const pmesh = new THREE.Mesh(pgeo, pool); pmesh.renderOrder = 3;
  group.add(fm, gmesh, pmesh); disp.push(geo, ggeo, pgeo, fall, pool, gm);
  return infos;
}
