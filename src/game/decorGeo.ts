// Procedural high-detail decor geometry (session 6).
// All builders return NON-indexed geometries with identical attribute sets
// (position, normal, uv, color) so they can be merged / instanced / batched.
// Vertex colours carry baked ambient occlusion + tint variation (multiply with instance colour).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- 3D value noise ----------
function h3(x: number, y: number, z: number) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = l(h3(ix, iy, iz), h3(ix + 1, iy, iz), ux), x10 = l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), ux);
  const x01 = l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), ux), x11 = l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), ux);
  return l(l(x00, x10, uy), l(x01, x11, uy), uz);
}
export function fbm3(x: number, y: number, z: number, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += vnoise3(x * f, y * f, z * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged3(x: number, y: number, z: number, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { const r = 1 - Math.abs(vnoise3(x * f, y * f, z * f) * 2 - 1); s += r * r * a; n += a; a *= 0.5; f *= 2.07; } return s / n; }
const sst = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- helpers ----------
/** Box (tri-planar per face) UV projection – no pole pinching on displaced spheres. */
export function boxUV(g: THREE.BufferGeometry, scale = 1) {
  const p = g.attributes.position as THREE.BufferAttribute; const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    // choose projection per triangle (avoids seams inside a face)
    let ax = 0, ay = 0, az = 0; for (let k = 0; k < 3; k++) { ax += Math.abs(n.getX(t + k)); ay += Math.abs(n.getY(t + k)); az += Math.abs(n.getZ(t + k)); }
    for (let k = 0; k < 3; k++) {
      const i = t + k, x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (ay >= ax && ay >= az) { uv[i * 2] = x * scale; uv[i * 2 + 1] = z * scale; }
      else if (ax >= az) { uv[i * 2] = z * scale; uv[i * 2 + 1] = y * scale; }
      else { uv[i * 2] = x * scale; uv[i * 2 + 1] = y * scale; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function prep(g: THREE.BufferGeometry) { const r = g.index ? g.toNonIndexed() : g; if (r !== g) g.dispose(); return r; }
function setColor(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number]) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute; const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
function finalize(parts: THREE.BufferGeometry[]) {
  const ok = parts.map(prep);
  for (const g of ok) { if (!g.attributes.uv) boxUV(g, 0.5); if (!g.attributes.color) setColor(g, () => [1, 1, 1]); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); }
  const m = mergeGeometries(ok)!; ok.forEach(g => g.dispose()); return m;
}
function displace(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v[0], v[1], v[2]); }
  g.computeVertexNormals();
}

// ---------- rocks ----------
/** Weathered boulder: domain-warped 3D noise, ridged cracks, planar facets, flattened buried base. */
export function boulderGeo(detail: number, seed: number, stretch = 0.75) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, Math.min(4, detail + 1)); // ≤ 5120 tris (was up to 20480 on Ultra – invisible difference, huge cost)
  g = prep(g);
  // random cleavage planes give the angular, fractured silhouette of real rock
  const planes: [number, number, number, number][] = [];
  const rnd = (k: number) => h3(seed, k, 3.7);
  for (let k = 0; k < 7; k++) { const a = rnd(k) * Math.PI * 2, b = Math.acos(rnd(k + 20) * 2 - 1); planes.push([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), 0.72 + rnd(k + 40) * 0.2]); }
  // displace on indexed-equivalent positions: compute per unique position via hashing so faces stay closed
  displace(g, (x, y, z) => {
    const s = seed * 3.1;
    const wx = x + fbm3(x * 1.3 + s, y * 1.3, z * 1.3, 3) * 0.5, wy = y + fbm3(x * 1.3, y * 1.3 + s, z * 1.3, 3) * 0.5, wz = z + fbm3(x * 1.3, y * 1.3, z * 1.3 + s, 3) * 0.5;
    let r = 0.78 + fbm3(wx * 1.1, wy * 1.1, wz * 1.1, 5) * 0.5;
    r -= (1 - ridged3(wx * 2.6, wy * 2.6, wz * 2.6, 3)) * 0.06; // crack grooves
    for (const [px, py, pz, d] of planes) { const dot = (x * px + y * py + z * pz) * r; if (dot > d) r *= d / dot; } // facet cut
    let ny = y * r * stretch; if (ny < -0.35 * stretch) ny = -0.35 * stretch + (ny + 0.35 * stretch) * 0.15; // flat base
    return [x * r, ny, z * r];
  });
  boxUV(g, 0.55);
  setColor(g, (x, y, z, _nx, ny) => {
    const ao = 0.55 + 0.45 * sst(-0.4, 0.3, y) ; const top = sst(0.3, 0.9, ny) * 0.12;
    const v = 0.88 + fbm3(x * 3, y * 3, z * 3, 2) * 0.24;
    return [ao * v + top, ao * v + top * 0.95, ao * v * 0.97 + top * 0.85];
  });
  return finalize([g]);
}

/** Wind-eroded hoodoo / spire with capstone, undercut neck and horizontal ledges. */
export function spireGeo(seed: number) {
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(1, 1, 1, 22, 40, false); g.translate(0, 0.5, 0); g = prep(g);
  displace(g, (x, y, z) => {
    const a = Math.atan2(z, x); const rr = Math.hypot(x, z);
    if (rr < 1e-4) { const cap = y > 0.5 ? 0.42 : 1; return [0, y + (y > 0.5 ? 0.03 : 0), 0].map((v, i) => i === 1 ? v : v * cap) as [number, number, number]; }
    let prof = 1.0 - 0.62 * y;                                  // taper
    prof -= 0.18 * Math.exp(-Math.pow((y - 0.86) / 0.05, 2));    // undercut neck
    prof += 0.22 * sst(0.9, 0.93, y) * (1 - sst(0.97, 1, y));    // capstone overhang
    const ledge = Math.pow(Math.abs(Math.sin(y * 34 + seed)), 6) * 0.05; // harder layers stick out
    const n = fbm3(Math.cos(a) * 1.4 + seed, y * 5, Math.sin(a) * 1.4, 5);
    const r = Math.max(0.12, prof * (0.78 + n * 0.5) + ledge);
    const yy = y > 0.999 ? 1 + fbm3(x * 4, seed, z * 4, 2) * 0.05 : y;
    return [Math.cos(a) * r, yy, Math.sin(a) * r];
  });
  boxUV(g, 0.9);
  setColor(g, (_x, y) => { const ao = 0.62 + 0.38 * sst(0, 0.35, y); return [ao, ao * 0.98, ao * 0.96]; });
  return finalize([g]);
}

/** Terraced mesa / butte: stepped flanks, talus apron, flat eroded top. */
export function mesaGeo(seed: number) {
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(1, 1, 1, 64, 28, false); g.translate(0, 0.5, 0); g = prep(g);
  displace(g, (x, y, z) => {
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    const plan = 0.8 + fbm3(Math.cos(a) * 1.8 + seed, 0, Math.sin(a) * 1.8, 5) * 0.45; // irregular footprint
    if (rr < 0.5) { const top = y > 0.5; return [x * plan * (top ? 0.86 : 1.35), top ? 1 + fbm3(x * 3, seed, z * 3, 3) * 0.04 : 0, z * plan * (top ? 0.86 : 1.35)]; }
    const steps = 4; const s = y * steps; const st = Math.floor(s), fr = s - st;
    const terrace = (st + sst(0.55, 0.9, fr)) / steps;           // cliff bands with shelves
    let prof = 1.35 - 0.5 * terrace;
    prof += 0.25 * Math.pow(1 - Math.min(1, y * 4), 2);          // talus apron at the foot
    const n = fbm3(Math.cos(a) * 3 + seed, y * 6, Math.sin(a) * 3, 4) * 0.12;
    return [Math.cos(a) * (prof * plan * 0.86 + n), y, Math.sin(a) * (prof * plan * 0.86 + n)];
  });
  boxUV(g, 0.06 * 0 + 0.9);
  setColor(g, (_x, y, _z, _nx, ny) => { const ao = 0.6 + 0.4 * sst(0, 0.3, y); const shelf = sst(0.6, 0.95, ny) * 0.15; return [ao + shelf, ao * 0.97 + shelf * 0.9, ao * 0.94 + shelf * 0.7]; });
  return finalize([g]);
}

// ---------- vegetation ----------
/** Curved tapered tube along a polyline with radial noise (trunks, branches, roots). */
function tube(pts: THREE.Vector3[], r0: number, r1: number, radial: number, seed: number, rough = 0.12, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = Math.max(4, pts.length * 3);
  let g: THREE.BufferGeometry = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const frames = curve.computeFrenetFrames(seg, false);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t); let r = r0 + (r1 - r0) * t; r *= 1 + flare * Math.pow(1 - t, 6);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j; const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i], b = frames.binormals[i];
      const bark = 1 + (fbm3(Math.cos(a) * 2 + seed, t * 8, Math.sin(a) * 2, 3) - 0.5) * rough * 2 + Math.pow(Math.abs(Math.sin(a * 9 + t * 3)), 8) * rough * 0.5;
      const rr = r * bark;
      p.setXYZ(k, c.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * rr, c.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * rr, c.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * rr);
    }
  }
  g.computeVertexNormals(); g = prep(g);
  const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * pts.length * 2, uv.getY(i));
  return g;
}
/** Leafy clump: displaced icosphere with lobes; colour = AO (darker inside / below) + hue jitter. */
function clump(cx: number, cy: number, cz: number, r: number, seed: number, flat = 0.8, base: [number, number, number] = [1, 1, 1], det = 2) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, det); g = prep(g);
  displace(g, (x, y, z) => {
    const lob = 0.72 + fbm3(x * 2.2 + seed, y * 2.2, z * 2.2, 4) * 0.55 + (vnoise3(x * 9 + seed, y * 9, z * 9) - 0.5) * 0.12;
    return [cx + x * r * lob, cy + y * r * lob * flat - (y < 0 ? r * 0.15 * -y : 0), cz + z * r * lob];
  });
  boxUV(g, 0.35);
  setColor(g, (x, y, z, _nx, ny) => {
    const h = (y - cy) / r; const ao = 0.42 + 0.58 * sst(-0.9, 0.7, h) * (0.75 + 0.25 * Math.max(0, ny));
    const j = 0.85 + vnoise3(x * 0.7 + seed, y * 0.7, z * 0.7) * 0.3;
    return [base[0] * ao * j, base[1] * ao * (0.92 + 0.16 * j), base[2] * ao * j];
  });
  return g;
}
const TRUNK: [number, number, number] = [0.42, 0.34, 0.27];
function tint(g: THREE.BufferGeometry, c: [number, number, number], aoY0: number, aoY1: number) {
  setColor(g, (_x, y) => { const ao = 0.5 + 0.5 * sst(aoY0, aoY1, y); return [c[0] * ao, c[1] * ao, c[2] * ao]; });
}

/** Jungle broadleaf tree: buttress roots, leaning curved trunk, forked branches, layered canopy clumps. */
export function jungleTreeGeo(seed: number, quality = 2): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const R = (k: number) => h3(seed, k, 9.1);
  const parts: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  const radial = quality >= 3 ? 12 : quality === 2 ? 9 : quality === 1 ? 6 : 5;
  const lean = (R(1) - 0.5) * 1.6, leanZ = (R(2) - 0.5) * 1.6;
  const H = 12 + R(3) * 4;
  const trunkPts = [0, 0.25, 0.5, 0.75, 1].map(t => new THREE.Vector3(lean * t * t + Math.sin(t * 5 + seed) * 0.3, t * H, leanZ * t * t + Math.cos(t * 4 + seed) * 0.3));
  const trunk = tube(trunkPts, 0.75, 0.32, radial, seed, 0.14, 1.2); tint(trunk, TRUNK, -0.5, 3); parts.push(trunk);
  // buttress roots
  const nR = quality >= 2 ? 5 : quality >= 1 ? 3 : 0;
  for (let k = 0; k < nR; k++) {
    const a = (k / nR) * Math.PI * 2 + R(10 + k); const L = 2 + R(20 + k) * 1.4;
    const pts = [new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(Math.cos(a) * L * 0.4, 1.0, Math.sin(a) * L * 0.4), new THREE.Vector3(Math.cos(a) * L, -0.2, Math.sin(a) * L)];
    const r = tube(pts, 0.42, 0.08, Math.max(5, radial - 3), seed + k, 0.1); tint(r, TRUNK, -0.3, 2); parts.push(r);
  }
  const top = trunkPts[4];
  // branches + canopy clumps
  const nB = quality >= 3 ? 6 : quality === 2 ? 5 : 3;
  for (let k = 0; k < nB; k++) {
    const a = (k / nB) * Math.PI * 2 + R(30 + k) * 0.8; const L = 3 + R(40 + k) * 2.5; const y0 = H * (0.62 + R(50 + k) * 0.3);
    const b0 = new THREE.Vector3(lean * 0.5, y0, leanZ * 0.5);
    const end = new THREE.Vector3(b0.x + Math.cos(a) * L, y0 + 1.5 + R(60 + k) * 2, b0.z + Math.sin(a) * L);
    const mid = b0.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.9, 0));
    const br = tube([b0, mid, end], 0.28, 0.1, Math.max(5, radial - 4), seed + 50 + k, 0.1); tint(br, TRUNK, 4, H); parts.push(br);
    const g = 0.75 + R(70 + k) * 0.35;
    leaves.push(clump(end.x, end.y + 0.6, end.z, 2.3 + R(80 + k) * 1.3, seed + k, 0.62, [0.95 * g, 1.0 * g, 0.85 * g], quality >= 3 ? 3 : quality >= 1 ? 2 : 1));
  }
  leaves.push(clump(top.x, top.y + 1.2, top.z, 3.4, seed + 99, 0.6, [0.9, 1, 0.85], quality >= 3 ? 3 : quality >= 1 ? 2 : 1));
  if (quality >= 2) leaves.push(clump(top.x + 1.5, top.y - 0.5, top.z - 1.2, 2.6, seed + 98, 0.6, [1.05, 1.05, 0.9], quality >= 3 ? 3 : quality >= 1 ? 2 : 1));
  // hanging vines (thin tubes)
  if (quality >= 2) for (let k = 0; k < 4; k++) {
    const a = R(90 + k) * Math.PI * 2, rr = 2 + R(95 + k) * 2.5; const x = top.x + Math.cos(a) * rr, z = top.z + Math.sin(a) * rr; const y = top.y - 0.5;
    const v = tube([new THREE.Vector3(x, y, z), new THREE.Vector3(x + 0.2, y - 2.5, z + 0.1), new THREE.Vector3(x - 0.1, y - 5 - R(99 + k) * 3, z)], 0.05, 0.03, 4, seed + 200 + k, 0.05);
    tint(v, [0.3, 0.42, 0.2], y - 8, y); parts.push(v);
  }
  return [finalize(parts), finalize(leaves)];
}

/** Conifer: straight trunk + 6–9 drooping, ragged needle tiers (vertex AO, snow-ready top faces). */
export function pineGeo(seed: number, quality = 2, snow = 0): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const R = (k: number) => h3(seed, k, 4.3);
  const parts: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  const H = 11 + R(1) * 4;
  const trunk = tube([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.1, H * 0.5, 0), new THREE.Vector3(0, H, 0.05)], 0.42, 0.06, quality >= 2 ? 8 : 6, seed, 0.12, 0.6);
  tint(trunk, [0.36, 0.27, 0.2], 0, 4); parts.push(trunk);
  const tiers = quality >= 3 ? 9 : quality === 2 ? 7 : 5;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1); const y = 2.2 + t * (H - 2.6); const rad = (1 - t) * 3.4 + 0.5; const hgt = 1.6 + (1 - t) * 1.2;
    let g: THREE.BufferGeometry = new THREE.ConeGeometry(1, 1, quality >= 2 ? 18 : 10, 3, true); g.translate(0, 0.5, 0); g = prep(g);
    const rot = R(10 + k) * Math.PI;
    displace(g, (x, yy, z) => {
      const a = Math.atan2(z, x) + rot, rr = Math.hypot(x, z);
      const rag = 1 + (vnoise3(Math.cos(a) * 3 + k, Math.sin(a) * 3, seed) - 0.5) * 0.45 + Math.pow(Math.abs(Math.sin(a * 7)), 3) * 0.18; // ragged branch tips
      const droop = rr * rr * 0.55 * hgt; // tips sag
      return [x * rad * rag, y + yy * hgt - droop * (1 - yy) - 0.3, z * rad * rag];
    });
    setColor(g, (x, yy, z, _nx, ny) => {
      const ao = 0.45 + 0.55 * Math.max(0, ny) * 0.6 + 0.25 * t + (vnoise3(x * 2, yy * 2, z * 2) - 0.5) * 0.15;
      // snow load on upward-facing needle surfaces (ice worlds); vertex colour > 1 counters the green instance tint
      const sn = snow * sst(0.35, 0.8, ny) * (0.7 + vnoise3(x * 3 + 5, yy * 3, z * 3) * 0.6);
      if (snow <= 0) return [0.8 * ao, 1.0 * ao, 0.86 * ao];
      // ice worlds: no instance tint → vertex colour carries dark needle green; snow colour compensates the green leaf map (~0.43/0.65/0.33)
      return [0.42 * ao * (1 - sn) + 2.0 * sn, 0.5 * ao * (1 - sn) + 1.32 * sn, 0.46 * ao * (1 - sn) + 2.6 * sn];
    });
    leaves.push(g);
  }
  return [finalize(parts), finalize(leaves)];
}

/** Saguaro-like cactus with ribs (lathe profile) and 0–3 arms. */
export function cactusGeo(seed: number) {
  const R = (k: number) => h3(seed, k, 1.9);
  const parts: THREE.BufferGeometry[] = [];
  const rib = (h: number, r: number) => {
    let g: THREE.BufferGeometry = new THREE.CylinderGeometry(1, 1, 1, 28, 12); g.translate(0, 0.5, 0); g = prep(g);
    displace(g, (x, y, z) => {
      const a = Math.atan2(z, x), rr = Math.hypot(x, z); const ribs = 0.86 + 0.14 * Math.pow(Math.abs(Math.cos(a * 6)), 0.6);
      const dome = y > 0.88 ? Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.88) / 0.12, 2))) : 1;
      return rr < 1e-4 ? [0, y * h + (y > 0.5 ? r * 0.6 : 0), 0] : [Math.cos(a) * r * ribs * dome, y * h, Math.sin(a) * r * ribs * dome];
    });
    setColor(g, (x, y, z) => { const a = Math.atan2(z, x); const groove = 0.72 + 0.28 * Math.pow(Math.abs(Math.cos(a * 6)), 0.5); const ao = 0.6 + 0.4 * sst(0, 0.15 * h, y); return [0.88 * groove * ao, groove * ao, 0.8 * groove * ao]; });
    return g;
  };
  const H = 3.8 + R(1) * 1.5; parts.push(rib(H, 0.42));
  const arms = Math.floor(R(2) * 3.2);
  for (let k = 0; k < arms; k++) {
    const a = R(3 + k) * Math.PI * 2, y = H * (0.35 + R(6 + k) * 0.25), L = 0.7 + R(9 + k) * 0.4, up = 1 + R(12 + k) * 1.2;
    const elbow = tube([new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a) * L * 0.7, y + 0.05, Math.sin(a) * L * 0.7), new THREE.Vector3(Math.cos(a) * L, y + 0.5, Math.sin(a) * L)], 0.24, 0.26, 12, seed + k, 0.04);
    tint(elbow, [0.8, 0.95, 0.72], 0, H); parts.push(elbow);
    const arm = rib(up, 0.26); arm.translate(Math.cos(a) * L, y + 0.45, Math.sin(a) * L); parts.push(arm);
  }
  return finalize(parts);
}

/** Ice shard cluster: tall faceted blades with a snow-dusted foot. */
export function iceShardGeo(seed: number) {
  const R = (k: number) => h3(seed, k, 8.8);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const L = 0.5 + R(k) * 0.6, w = 0.12 + R(k + 10) * 0.1;
    let g: THREE.BufferGeometry = new THREE.ConeGeometry(w, L, 5, 3); g.translate(0, L / 2, 0); g = prep(g);
    displace(g, (x, y, z) => [x * (1 + (vnoise3(x * 9 + k, y * 9, z * 9) - 0.5) * 0.4), y, z * (0.55 + R(k + 5) * 0.3)]);
    g.rotateZ((R(k + 20) - 0.5) * 0.7); g.rotateX((R(k + 30) - 0.5) * 0.7); g.rotateY(R(k + 40) * Math.PI * 2); g.translate((R(k + 50) - 0.5) * 0.3, 0, (R(k + 60) - 0.5) * 0.3);
    g.computeVertexNormals();
    setColor(g, (_x, y) => { const v = 0.6 + 0.4 * sst(0, 0.6, y); return [v, v, v]; });
    parts.push(g);
  }
  return finalize(parts);
}

/** Crystal cluster: hexagonal prisms with pyramidal tips, radiating from a rocky base. */
export function crystalGeo(seed: number) {
  const R = (k: number) => h3(seed, k, 6.6);
  const parts: THREE.BufferGeometry[] = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const L = 1.6 + R(k) * 3.2, r = 0.18 + R(k + 10) * 0.25;
    const shaft = new THREE.CylinderGeometry(r, r * 1.08, L, 6, 1); shaft.translate(0, L / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.2, 6, 1); tip.translate(0, L + r * 1.1, 0);
    let g = mergeGeometries([prep(shaft), prep(tip)])!;
    g.rotateZ((R(k + 20) - 0.5) * 1.1); g.rotateX((R(k + 30) - 0.5) * 1.1); g.rotateY(R(k + 40) * Math.PI * 2);
    g = prep(g); g.computeVertexNormals();
    setColor(g, (_x, y) => { const v = 0.55 + 0.45 * sst(0, 3, y); return [v, v, v]; });
    parts.push(g);
  }
  const base = boulderGeo(1, seed + 3, 0.45); base.scale(0.9, 0.9, 0.9); setColor(base, () => [0.35, 0.33, 0.38]); parts.push(base);
  return finalize(parts);
}

/** Fern / jungle undergrowth: 7–9 arching fronds made of thin quads with leaflets. */
export function fernGeo(seed: number) {
  const R = (k: number) => h3(seed, k, 2.2);
  const pos: number[] = [], col: number[] = [];
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + R(f) * 0.5; const L = 1.1 + R(f + 10) * 0.6; const ca = Math.cos(a), sa = Math.sin(a);
    const segs = 9; let prev: number[] | null = null;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs; const d = t * L; const y = Math.sin(t * Math.PI * 0.85) * 0.55 * L - t * t * 0.25; const w = (1 - t) * 0.22 + 0.02;
      const cx = ca * d, cz = sa * d; const px = -sa * w, pz = ca * w;
      const cur = [cx - px, y, cz - pz, cx + px, y + 0.02, cz + pz];
      if (prev) {
        const g = 0.55 + 0.45 * t;
        const quad = [prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], cur[3], cur[4], cur[5], prev[0], prev[1], prev[2], cur[3], cur[4], cur[5], prev[3], prev[4], prev[5]];
        pos.push(...quad); for (let k = 0; k < 6; k++) col.push(0.75 * g, g, 0.65 * g);
      }
      prev = cur;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); boxUV(g, 2);
  return finalize([g]);
}

// ---------- shared detail textures (canvas, tiny, cached) ----------
let leafTex: THREE.CanvasTexture | null = null, barkTex: THREE.CanvasTexture | null = null;
/** Leaf-mass detail map (individual leaves, light/dark sides) for canopy clumps and conifer tiers. */
export function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
  x.fillStyle = '#5c7c48'; x.fillRect(0, 0, 256, 256);
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 1400; i++) {
    const px = r() * 256, py = r() * 256, a = r() * Math.PI * 2, L = 6 + r() * 10, l = 0.55 + r() * 0.6;
    x.save(); x.translate(px, py); x.rotate(a);
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      x.save(); x.translate(ox, oy);
      x.fillStyle = `rgb(${Math.floor(110 * l)},${Math.floor(165 * l)},${Math.floor(85 * l)})`;
      x.beginPath(); x.ellipse(0, 0, L, L * 0.38, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = `rgba(30,45,20,0.35)`; x.lineWidth = 0.7; x.beginPath(); x.moveTo(-L, 0); x.lineTo(L, 0); x.stroke();
      x.restore();
    }
    x.restore();
  }
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping; leafTex.anisotropy = 8;
  return leafTex;
}
/** Bark detail map: vertical fissures + lichen. */
export function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d')!;
  const img = x.createImageData(128, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 128; i++) {
    const u = i / 128, v = j / 256;
    const fiss = Math.pow(Math.abs(Math.sin((u + vnoise3(u * 4, v * 3, 1) * 0.15) * Math.PI * 9)), 0.35);
    const n = fbm3(u * 8, v * 4, 2, 3);
    const lich = sst(0.62, 0.7, fbm3(u * 5, v * 5, 9, 3));
    let r = 170 * (0.45 + fiss * 0.55) * (0.8 + n * 0.4), g = 150 * (0.45 + fiss * 0.55) * (0.8 + n * 0.4), b = 130 * (0.45 + fiss * 0.55) * (0.8 + n * 0.4);
    r = r * (1 - lich) + 150 * lich; g = g * (1 - lich) + 170 * lich; b = b * (1 - lich) + 120 * lich;
    const k = (j * 128 + i) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  barkTex = new THREE.CanvasTexture(c); barkTex.colorSpace = THREE.SRGBColorSpace; barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping; barkTex.anisotropy = 8;
  return barkTex;
}

/** Start/finish gate: riveted lathe towers with collars + buttress fins, twin-rail truss beam with diagonals,
 *  light-housing pods. Returns [paintedMetal, darkSteel] (both non-indexed, same attributes). `half` = half span (m). */
export function gateGeo(half: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const paint: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  const prof: THREE.Vector2[] = [];
  const pr = (r: number, y: number) => prof.push(new THREE.Vector2(r, y));
  pr(3.0, 0); pr(3.0, 0.8); pr(2.4, 1.2); pr(2.1, 4); pr(2.35, 4.3); pr(2.35, 5); pr(1.95, 5.3); pr(1.7, 14); pr(2.0, 14.3); pr(2.0, 15.2); pr(1.6, 15.5); pr(1.5, 20.5); pr(2.3, 21); pr(2.3, 22.6); pr(1.2, 23.6); pr(0.01, 24.2);
  for (const sd of [-1, 1]) {
    const x = sd * (half + 3);
    const t = new THREE.LatheGeometry(prof, 28); t.translate(x, 0, 0); paint.push(t);
    for (let k = 0; k < 4; k++) { // buttress fins
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const f = new THREE.BoxGeometry(0.35, 6, 2.2); f.translate(0, 3, 2.6); f.rotateY(a); f.translate(x, 0, 0); dark.push(f);
    }
    for (const y of [4.6, 14.7, 21.8]) { const r = new THREE.TorusGeometry(y > 20 ? 2.35 : y > 10 ? 2.05 : 2.4, 0.12, 6, 28); r.rotateX(Math.PI / 2); r.translate(x, y, 0); dark.push(r); }
    const ant = new THREE.CylinderGeometry(0.06, 0.1, 4, 6); ant.translate(x, 26, 0); dark.push(ant);
  }
  // truss beam
  const L = half * 2 + 6; const yB = 18.2, yT = 20.6, dz = 0.9;
  for (const y of [yB, yT]) for (const z of [-dz, dz]) { const rail = new THREE.CylinderGeometry(0.28, 0.28, L, 8); rail.rotateZ(Math.PI / 2); rail.translate(0, y, z); paint.push(rail); }
  const n = Math.max(6, Math.round(L / 3));
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + (i / n) * L;
    for (const z of [-dz, dz]) { const v = new THREE.CylinderGeometry(0.12, 0.12, yT - yB, 6); v.translate(x, (yB + yT) / 2, z); dark.push(v); }
    if (i < n) for (const z of [-dz, dz]) {
      const x2 = x + L / n; const len = Math.hypot(x2 - x, yT - yB); const d = new THREE.CylinderGeometry(0.1, 0.1, len, 6);
      d.rotateZ((i % 2 ? 1 : -1) * Math.atan2(x2 - x, yT - yB)); d.translate((x + x2) / 2, (yB + yT) / 2, z); dark.push(d);
    }
  }
  const panel = new THREE.BoxGeometry(L * 0.55, 1.8, 0.25); panel.translate(0, (yB + yT) / 2, dz + 0.35); paint.push(panel);
  for (let i = 0; i < 10; i++) { const x = -half + i * (half * 2 / 9); const hsg = new THREE.CylinderGeometry(0.75, 0.75, 1.1, 12); hsg.rotateX(Math.PI / 2); hsg.translate(x, 17.6, 0); dark.push(hsg); }
  const shade = (g: THREE.BufferGeometry[]) => { const out = g.map(prep); out.forEach(q => { q.computeVertexNormals(); boxUV(q, 0.25); setColor(q, (_x, y) => { const ao = 0.6 + 0.4 * sst(0, 3, y); return [ao, ao, ao]; }); }); return finalize(out); };
  return [shade(paint), shade(dark)];
}
