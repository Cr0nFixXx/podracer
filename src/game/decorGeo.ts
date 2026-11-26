// ===== Procedural decor geometry (Session 9): fractured boulders, stratified hoodoos, tiered mesas,
// buttressed rainforest trees, layered snow pines, faceted crystal clusters, ribbed saguaros =====
// All builders are deterministic (seeded), allocation-light and return ONE BufferGeometry (instanced by world.ts `place`).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];
const TAU = Math.PI * 2;
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += vn(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
const n3 = (x: number, y: number, z: number) => (fbm(x, y + z * 0.7, 3) + fbm(y + 31.7, z - x * 0.6, 3) + fbm(z + 17.3, x + y * 0.5, 3)) / 3;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function rng(seed: number) { let a = (seed * 2654435761) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Closed-seam lathe-like grid. `pos(a, j, i)` returns the vertex for angle `a` on ring `j`. Outward-facing, smooth normals, seam welded. */
function ringSurface(radial: number, rings: number, pos: (a: number, j: number, i: number) => V3, capTop?: V3, capBottom?: V3): THREE.BufferGeometry {
  const cols = radial + 1, nv = cols * rings + (capTop ? 1 : 0) + (capBottom ? 1 : 0);
  const P = new Float32Array(nv * 3), UV = new Float32Array(nv * 2); const idx: number[] = [];
  for (let j = 0; j < rings; j++) for (let i = 0; i < cols; i++) {
    const [x, y, z] = pos((i % radial) / radial * TAU, j, i % radial); const k = j * cols + i;
    P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z; UV[k * 2] = i / radial; UV[k * 2 + 1] = j / (rings - 1);
  }
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < radial; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  let k = cols * rings;
  if (capTop) { P.set(capTop, k * 3); UV[k * 2] = 0.5; UV[k * 2 + 1] = 1; const r0 = (rings - 1) * cols; for (let i = 0; i < radial; i++) idx.push(r0 + i, k, r0 + i + 1); k++; }
  if (capBottom) { P.set(capBottom, k * 3); UV[k * 2] = 0.5; UV[k * 2 + 1] = 0; for (let i = 0; i < radial; i++) idx.push(i + 1, k, i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const N = g.attributes.normal as THREE.BufferAttribute;
  for (let j = 0; j < rings; j++) { // weld the UV seam normals
    const a = j * cols, b = a + radial; const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1;
    N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** Tapered tube along a polyline (smooth, open ends unless `tip`). */
function tube(pts: V3[], radii: number[], sides: number, tip = false): THREE.BufferGeometry {
  const fr: { t: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }[] = [];
  let u = new THREE.Vector3(1, 0, 0);
  for (let j = 0; j < pts.length; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    if (j === 0 && Math.abs(t.x) > 0.9) u.set(0, 0, 1);
    u = u.clone().addScaledVector(t, -u.dot(t)).normalize();
    fr.push({ t, u, v: new THREE.Vector3().crossVectors(t, u) });
  }
  const last = pts[pts.length - 1];
  return ringSurface(sides, pts.length, (a, j) => {
    const f = fr[j], r = radii[j], c = Math.cos(a) * r, s = Math.sin(a) * r;
    return [pts[j][0] + f.v.x * c + f.u.x * s, pts[j][1] + f.v.y * c + f.u.y * s, pts[j][2] + f.v.z * c + f.u.z * s];
  }, tip ? [last[0] + fr[pts.length - 1].t.x * radii[pts.length - 1] * 0.8, last[1] + fr[pts.length - 1].t.y * radii[pts.length - 1] * 0.8, last[2] + fr[pts.length - 1].t.z * radii[pts.length - 1] * 0.8] : undefined);
}

function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, ny: number) => V3) {
  const p = g.attributes.position, n = g.attributes.normal; const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, gr, b] = fn(p.getX(i), p.getY(i), p.getZ(i), n.getY(i)); c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function flat(g: THREE.BufferGeometry) { const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose(); ng.computeVertexNormals(); return ng; }
function smooth(g: THREE.BufferGeometry) { const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose(); return ng; }
function merge(parts: THREE.BufferGeometry[]) { const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); g.computeBoundingSphere(); return g; }

/** Fractured boulder: domain-warped noise body, sliced by random cleavage planes (crisp flat facets), bedding ledges, settled flat base. */
export function rockGeometry(detail: number, seed: number, stretch = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute; const r = rng(seed * 31 + 7);
  const planes: number[][] = [];
  for (let k = 0; k < 9; k++) {
    const th = r() * TAU, cy = k < 2 ? 0.75 + r() * 0.25 : r() * 1.5 - 0.6, sy = Math.sqrt(Math.max(0, 1 - cy * cy));
    planes.push([Math.cos(th) * sy, cy, Math.sin(th) * sy, 0.56 + r() * 0.3]);
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const wx = x + (n3(x * 1.3 + seed, y * 1.3, z * 1.3) - 0.5) * 0.7, wz = z + (n3(z * 1.3, x * 1.3 + seed, y * 1.3) - 0.5) * 0.7;
    const bed = y * 4.2 + seed + n3(x, y, z) * 1.2, ledge = (sstep(0.0, 0.18, bed - Math.floor(bed)) - 0.5) * 0.085;
    const n = 0.8 + n3(wx * 1.5 + seed, y * 1.6, wz * 1.5) * 0.62 + (n3(x * 4.2, y * 4.2 + seed, z * 4.2) - 0.5) * 0.14 + ledge;
    let px = x * n, py = y * n, pz = z * n;
    for (const pl of planes) { const d = px * pl[0] + py * pl[1] + pz * pl[2] - pl[3]; if (d > 0) { px -= pl[0] * d * 0.94; py -= pl[1] * d * 0.94; pz -= pl[2] * d * 0.94; } }
    if (py < -0.42) py = -0.42 + (py + 0.42) * 0.22; // settled base
    p.setXYZ(i, px, py * stretch, pz);
  }
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/** HQ boulder (Session 20): the fractured body of `rockGeometry` at a finer tessellation with REAL displacement – every vertex moves
 *  along its smoothed normal by the height channel of the rock texture (cracks and bedding of the picture become relief in the
 *  silhouette) plus ridged 3D noise for crags. Texture coordinates are box-projected per face: no pinched pole on top of the rock and
 *  the same texel density everywhere. Welded by position → watertight. Creased normals keep the big cleavage edges crisp while the
 *  weathered faces shade smoothly.
 *  `height(u, v)` → 0..1 at the box-projected texture coordinates (undefined → noise only); `tile` = rock units per uv unit.
 *  The far LOD twin is the same call with a low `detail` (same displacement field, same texture mapping → no pop in the picture). */
export function boulderGeometry(detail: number, seed: number, stretch = 1, height?: (u: number, v: number) => number, tile = 4.8, amp = 0.1): THREE.BufferGeometry {
  const g = rockGeometry(detail, seed, stretch); // non-indexed: three own corners per triangle
  const pos = g.attributes.position as THREE.BufferAttribute, n = pos.count;
  // --- weld the corners by position
  const ids = new Int32Array(n), look = new Map<number, number>(); let m = 0;
  for (let i = 0; i < n; i++) {
    const k = (Math.round((pos.getX(i) + 4) * 1024) * 8192 + Math.round((pos.getY(i) + 4) * 1024)) * 8192 + Math.round((pos.getZ(i) + 4) * 1024);
    let id = look.get(k); if (id === undefined) { id = m++; look.set(k, id); } ids[i] = id;
  }
  const P = new Float32Array(m * 3), N = new Float32Array(m * 3);
  for (let i = 0; i < n; i++) { const o = ids[i] * 3; P[o] = pos.getX(i); P[o + 1] = pos.getY(i); P[o + 2] = pos.getZ(i); }
  const faceN = (t: number): V3 => {
    const a = ids[t] * 3, b = ids[t + 1] * 3, c = ids[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  for (let t = 0; t < n; t += 3) { const f = faceN(t); for (let k = 0; k < 3; k++) { const o = ids[t + k] * 3; N[o] += f[0]; N[o + 1] += f[1]; N[o + 2] += f[2]; } } // area-weighted
  // --- displacement along the smoothed normal
  const baseY = -0.42 * stretch;
  for (let v = 0; v < m; v++) {
    const o = v * 3, x = P[o], y = P[o + 1], z = P[o + 2], l = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1, nx = N[o] / l, ny = N[o + 1] / l, nz = N[o + 2] / l;
    let h = 0.5;
    if (height) { // the three box projections, blended by the normal → one value per welded vertex
      const wx = nx * nx * nx * nx, wy = ny * ny * ny * ny, wz = nz * nz * nz * nz;
      h = (wx * height(z / tile, y / tile) + wy * height(x / tile, z / tile) + wz * height(x / tile, y / tile)) / (wx + wy + wz + 1e-9);
    }
    const ridge = Math.max(0, 1 - Math.abs(2 * n3(x * 2.6 + seed * 1.7, y * 2.6, z * 2.6) - 1) * 2.2); // crests where the noise crosses its mean
    const fine = n3(x * 6.1, y * 6.1 + seed, z * 6.1) - 0.5;
    const d = ((h - 0.5) * 2.2 + (ridge - 0.65) * 0.9 + fine * 1.6) * amp * sstep(baseY, baseY + 0.25, y); // the settled base stays flat
    P[o] += nx * d; P[o + 1] += ny * d; P[o + 2] += nz * d;
  }
  // --- write back: positions, box-projected uv, creased normals (smooth below 52°, crisp above)
  const uv = new Float32Array(n * 2), nr = new Float32Array(n * 3), fn = new Float32Array(n), CREASE = Math.cos(52 * Math.PI / 180);
  const fans: number[][] = Array.from({ length: m }, () => []);
  for (let t = 0; t < n; t += 3) {
    const f = faceN(t), l = Math.hypot(f[0], f[1], f[2]) || 1; fn[t] = f[0] / l; fn[t + 1] = f[1] / l; fn[t + 2] = f[2] / l;
    const ax = Math.abs(f[0]), ay = Math.abs(f[1]), az = Math.abs(f[2]);
    for (let k = 0; k < 3; k++) {
      const o = ids[t + k] * 3, x = P[o], y = P[o + 1], z = P[o + 2]; pos.setXYZ(t + k, x, y, z); fans[ids[t + k]].push(t);
      if (ay >= ax && ay >= az) { uv[(t + k) * 2] = x / tile; uv[(t + k) * 2 + 1] = z / tile; } // top / underside
      else if (ax >= az) { uv[(t + k) * 2] = z / tile; uv[(t + k) * 2 + 1] = y / tile; } // sides: v runs up → bedding stays horizontal
      else { uv[(t + k) * 2] = x / tile; uv[(t + k) * 2 + 1] = y / tile; }
    }
  }
  for (let t = 0; t < n; t += 3) for (let k = 0; k < 3; k++) {
    let sx = 0, sy = 0, sz = 0;
    for (const q of fans[ids[t + k]]) if (fn[q] * fn[t] + fn[q + 1] * fn[t + 1] + fn[q + 2] * fn[t + 2] > CREASE) { sx += fn[q]; sy += fn[q + 1]; sz += fn[q + 2]; }
    const l = Math.hypot(sx, sy, sz) || 1, o = (t + k) * 3; nr[o] = sx / l; nr[o + 1] = sy / l; nr[o + 2] = sz / l;
  }
  pos.needsUpdate = true;
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  g.computeBoundingSphere(); g.name = 'boulder'; // name = handle for the harness close-up view `g_<name>`
  return g;
}

/** Hoodoo / rock needle: alternating hard & soft strata (overhanging ledges), fluted erosion, talus skirt, weathered caprock, slight lean. Height 0..1. */
export function spireGeometry(seed: number, radial = 20, strata = 11): THREE.BufferGeometry {
  const r = rng(seed * 53 + 3); const hard: number[] = []; for (let s = 0; s <= strata; s++) hard.push(r());
  const ph1 = r() * TAU, ph2 = r() * TAU, lean = (r() - 0.5) * 0.5, leanA = r() * TAU, lobes = 2 + Math.floor(r() * 3);
  const rings = strata * 2 + 3;
  const tOf = (j: number) => j === 0 ? 0 : j >= rings - 2 ? (j === rings - 2 ? 0.955 : 0.99) : (Math.floor((j - 1) / 2) + ((j - 1) % 2 ? 0.86 : 0.04)) / strata * 0.93 + 0.012;
  return ringSurface(radial, rings, (a, j) => {
    let t = tOf(j); const s = Math.max(0, Math.min(strata, Math.floor((j - 1) / 2)));
    if (j > 0 && j < rings - 2) t += Math.sin(a * 3 + s * 1.7 + ph1) * 0.006 + (fbm(a * 1.3 + s, s * 3.1, 2) - 0.5) * 0.012;
    const skirt = 1 + 0.7 * Math.exp(-t * 12) + 0.3 * Math.exp(-t * 4.5);
    const taper = lerp(1.0, 0.5, Math.pow(t, 0.85)) - Math.sin(t * Math.PI) * 0.1;
    const layer = j === 0 ? 1.1 : 0.8 + hard[s] * 0.26 + (hard[s] > 0.72 ? 0.08 : 0);
    const cap = t > 0.9 ? 1.22 * Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.93) / 0.075, 2))) : 1;
    const plan = 1 + 0.15 * Math.cos(a * lobes + ph1 + t * 2.2) + 0.08 * Math.cos(a * 5 + ph2 - t * 3) + (fbm(a * 2.4 + seed, t * 7 + seed, 3) - 0.5) * 0.6 + (fbm(a * 1.1 + seed * 3, t * 2.2, 2) - 0.5) * 0.3;
    const flute = 1 - 0.1 * Math.pow(Math.abs(Math.sin(a * 4.5 + fbm(a * 1.5, t * 2 + seed, 2) * 2.4)), 3) * sstep(0.1, 0.3, t) * (1 - hard[s] * 0.6);
    const rad = 0.62 * skirt * taper * layer * cap * plan * flute;
    const off = lean * t * t;
    return [Math.cos(a) * rad + Math.cos(leanA) * off, t, Math.sin(a) * rad + Math.sin(leanA) * off];
  }, [Math.cos(leanA) * lean, 1.0, Math.sin(leanA) * lean]);
}

/** Tiered table mountain: lobed plan, talus aprons below vertical gullied cliff bands, benches, flat weathered summit. Height 0..1, radius ≈ 1.4. */
export function mesaGeometry(seed: number, radial = 44): THREE.BufferGeometry {
  const r = rng(seed * 19 + 11); const ph = [r() * TAU, r() * TAU, r() * TAU];
  // [height t, radius, gully strength]
  const prof: V3[] = [[0, 1.62, 0.15], [0.09, 1.44, 0.2], [0.2, 1.24, 0.35], [0.23, 1.13, 1], [0.5, 1.09, 1], [0.53, 1.0, 0.4], [0.61, 0.94, 0.35], [0.64, 0.87, 1], [0.93, 0.84, 1], [0.97, 0.8, 0.5], [1.0, 0.74, 0.2]];
  const g = ringSurface(radial, prof.length, (a, j) => {
    const [t, pr, gs] = prof[j];
    const plan = 1 + 0.2 * Math.cos(a * 2 + ph[0]) + 0.13 * Math.cos(a * 3 + ph[1]) + 0.07 * Math.cos(a * 7 + ph[2]) + (fbm(a * 1.9 + seed, seed * 0.37, 3) - 0.5) * 0.36;
    const gully = Math.pow(Math.abs(Math.sin(a * 8.5 + fbm(a * 2.2 + seed, 3.3, 2) * 3.2)), 2.4) * 0.09 * gs + (fbm(a * 6.5, t * 5 + seed, 3) - 0.5) * 0.11 * gs;
    const rad = pr * plan * (1 - gully) + (j < 3 ? (fbm(a * 3.1, j * 2.7 + seed, 2) - 0.5) * 0.16 : 0);
    const y = t + (j > 0 && j < prof.length - 1 ? (fbm(a * 2.6 + j * 5.1, seed, 2) - 0.5) * 0.03 : 0);
    return [Math.cos(a) * rad, y, Math.sin(a) * rad];
  }, [0, 1.012, 0]);
  g.name = 'mesa'; // (the harness finds it by name)
  return g;
}

/** Layered conifer with drooping star-shaped branch tiers and snow load (vertex colours). Height ≈ 11. */
export function pineGeometry(tiers = 6, points = 9, snow = true): THREE.BufferGeometry {
  const r = rng(77); const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(smooth(ringSurface(7, 4, (a, j) => { const t = j / 3, rad = lerp(0.42, 0.14, t) * (j === 0 ? 1.45 + 0.3 * Math.cos(a * 3) : 1); return [Math.cos(a) * rad, t * 10.2, Math.sin(a) * rad]; })), (_x, y) => { const m = 0.8 + h2(y * 3.1, 2) * 0.3; return [0.2 * m, 0.13 * m, 0.09 * m]; }));
  for (let k = 0; k < tiers; k++) {
    const f = k / (tiers - 1), y0 = 2.1 + f * 6.6, rad = lerp(2.9, 0.75, Math.pow(f, 0.9)), h = lerp(3.0, 1.9, f), rot = r() * TAU, n = points * 2;
    const ring: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * TAU, tip = i % 2 === 0, jr = 0.82 + r() * 0.36;
      const rr = tip ? rad * jr : rad * 0.5 * jr; ring.push([Math.cos(a) * rr, y0 - (tip ? 0.55 + r() * 0.45 : -0.28 * h), Math.sin(a) * rr]);
    }
    const P: number[] = []; const apex: V3 = [(r() - 0.5) * 0.12, y0 + h, (r() - 0.5) * 0.12], under: V3 = [0, y0 + h * 0.22, 0];
    for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; P.push(...a, ...apex, ...b, ...b, ...under, ...a); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2)); g.computeVertexNormals();
    parts.push(paint(g, (x, y, z, ny) => {
      const d = Math.hypot(x, z) / rad, v = 0.85 + h2(x * 5.3 + k, z * 5.3) * 0.3;
      if (snow && ny > 0.3 && (y > y0 + h * 0.18 || d < 0.7)) { const w = 0.86 + h2(x * 9, z * 9) * 0.1; return [w * 0.96, w * 1.0, w * 1.05]; }
      return ny < -0.1 ? [0.035 * v, 0.085 * v, 0.06 * v] : [(0.07 + d * 0.05 + f * 0.02) * v, (0.19 + d * 0.09 + f * 0.03) * v, (0.13 + d * 0.03) * v];
    }));
  }
  parts.push(paint(flat(new THREE.ConeGeometry(0.2, 1.5, 5).translate(0, 10.6, 0)), () => snow ? [0.88, 0.93, 0.98] : [0.09, 0.24, 0.15]));
  return merge(parts);
}

/** Faceted hexagonal crystal / ice-shard cluster. `h` = tallest crystal height, flat-shaded. */
export function crystalClusterGeometry(seed: number, count: number, h: number, rad: number, spread: number, tilt: number): THREE.BufferGeometry {
  const r = rng(seed * 101 + 5); const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const main = k === 0, hh = main ? h : h * (0.28 + r() * 0.5), rr = rad * (main ? 1 : 0.5 + r() * 0.45), sides = r() < 0.3 ? 5 : 6;
    const body = new THREE.CylinderGeometry(rr * (0.7 + r() * 0.2), rr, hh * 0.76, sides, 1, true).translate(0, hh * 0.38 - hh * 0.06, 0);
    const tip = new THREE.ConeGeometry(body.parameters.radiusTop, hh * 0.24, sides, 1, true);
    const tp = tip.attributes.position as THREE.BufferAttribute; const ox = (r() - 0.5) * rr * 0.9, oz = (r() - 0.5) * rr * 0.9;
    for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0) tp.setXYZ(i, ox, tp.getY(i), oz); // off-centre termination
    tip.translate(0, hh * 0.76 + hh * 0.12 - hh * 0.06, 0);
    const a = r() * TAU, d = main ? 0 : rad * spread * (0.55 + r() * 0.6), tz = main ? (r() - 0.5) * tilt * 0.3 : tilt * (0.35 + r() * 0.65), ry = r() * TAU;
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(d, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(-tz)).multiply(new THREE.Matrix4().makeRotationY(ry));
    for (const gg of [body, tip]) { gg.applyMatrix4(m); parts.push(flat(gg)); }
  }
  for (let k = 0; k < 4; k++) { // broken shards / rubble at the foot
    const a = r() * TAU, d = rad * spread * (0.9 + r() * 0.7), s = rad * (0.35 + r() * 0.3);
    parts.push(flat(new THREE.OctahedronGeometry(s, 0).scale(1, 0.6 + r() * 0.5, 1).rotateX(r() * 2).translate(Math.cos(a) * d, s * 0.2, Math.sin(a) * d)));
  }
  return merge(parts);
}

const LEAF_TILE = (q: number): V3 & { 3?: number } => { const x0 = 512 + (q % 2) * 256 + 3, y0 = 40 + Math.floor(q / 2) * 236 + 3; return [x0 / 1024, 1 - (y0 + 230) / 512, (x0 + 250) / 1024] as V3; };
/** uv helpers for the tree atlas (foliage.ts): bark = left half (mirror-tiled along the height), plain = white strip */
function barkUV(g: THREE.BufferGeometry, tile = 4.2) {
  const p = g.attributes.position, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) { const t = p.getY(i) / tile, f = t - Math.floor(t), v = Math.floor(t) % 2 ? 1 - f : f; uv.setXY(i, 0.004 + uv.getX(i) * 0.49, 0.01 + v * 0.98); }
  return g;
}
function plainUV(g: THREE.BufferGeometry) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.75, 0.962); return g; }

/** Emergent rainforest tree (Session 18, HQ): buttress roots, bent trunk and forked boughs with a real bark texture, a dark canopy core
 *  and a shell of alpha-tested LEAF-SPRIG CARDS around every canopy lobe (16 per lobe at high quality), hanging lianas.
 *  `lod = true` → far model: same silhouette from plain lobes only (no cards), ~1/3 of the triangles. Material: foliage.ts → treeMaterial. */
/** Session 20 – HQ snow pine (Ando Prime): bark-photo trunk, 10 whorls of drooping needle-branch cards (alpha, pine atlas of
 *  foliage.pineMaterial), a hanging side card per branch for depth, and snow sheets lying on the branches. ~700 triangles.
 *  `lod` = far twin for the same material: four plain cone tiers, green below / snow on top. Height 11 (like pineGeometry). */
export function snowPineGeometry(seed: number, quality: number, lod = false): THREE.BufferGeometry {
  const r = rng(seed * 131 + 5), parts: THREE.BufferGeometry[] = [], H = 11;
  parts.push(paint(barkUV(smooth(ringSurface(lod ? 5 : 8, 5, (a, j) => { const t = j / 4, rad = lerp(0.36, 0.06, t) * (j === 0 ? 1.5 : 1); return [Math.cos(a) * rad, t * H, Math.sin(a) * rad]; })), 3), (_x, y) => { const m = 0.72 + h2(y * 3.1, 2) * 0.3; return [0.66 * m, 0.56 * m, 0.5 * m]; }));
  if (lod) {
    for (let k = 0; k < 4; k++) {
      const f = k / 3, y0 = 1.9 + f * 6.3, rad = lerp(2.7, 0.8, f), h = lerp(3.4, 2.5, f);
      parts.push(paint(plainUV(flat(new THREE.ConeGeometry(rad, h, 7, 1, true).translate(0, y0 + h / 2, 0))), (x, _y, z, ny) => { const d = Math.hypot(x, z) / rad; return d < 0.74 && ny > 0.1 ? [0.84, 0.89, 0.95] : [0.06 + d * 0.04, 0.17 + d * 0.07, 0.11 + d * 0.02]; }));
    }
    return merge(parts);
  }
  const P: number[] = [], Nn: number[] = [], U: number[] = [], C: number[] = [];
  /** textured quad a→b (inner edge) … d→c (outer edge); u runs inner → outer over [f0, f1] of the tile, normals biased upwards (soft light) */
  const quad = (a: V3, b: V3, c: V3, d: V3, tile: number, f0: number, f1: number, col: V3) => {
    const [u0, v0, u1] = LEAF_TILE(tile), v1 = v0 + 230 / 512, ua = u0 + (u1 - u0) * f0, ub = u0 + (u1 - u0) * f1;
    const ex = d[0] - a[0], ey = d[1] - a[1], ez = d[2] - a[2], fx = b[0] - a[0], fy = b[1] - a[1], fz = b[2] - a[2];
    let nx = fy * ez - fz * ey, ny = fz * ex - fx * ez, nz = fx * ey - fy * ex; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l0 = Math.hypot(nx, ny, nz) || 1; nx = nx / l0 * 0.55; ny = ny / l0 * 0.55 + 0.7; nz = nz / l0 * 0.55; const l1 = Math.hypot(nx, ny, nz);
    for (const [p, u, v] of [[a, ua, v0], [b, ua, v1], [c, ub, v1], [a, ua, v0], [c, ub, v1], [d, ub, v0]] as [V3, number, number][]) { P.push(p[0], p[1], p[2]); Nn.push(nx / l1, ny / l1, nz / l1); U.push(u, v); C.push(col[0], col[1], col[2]); }
  };
  const whorls = quality >= 2 ? 10 : 7;
  for (let k = 0; k < whorls; k++) {
    const f = k / (whorls - 1), y = lerp(1.7, 9.5, f), L = lerp(3.3, 0.9, Math.pow(f, 0.85)), nb = Math.round(lerp(7, 4, f)), rot = r() * TAU, shade = lerp(0.72, 1.05, f);
    for (let i = 0; i < nb; i++) {
      const a = rot + (i + (r() - 0.5) * 0.5) / nb * TAU, ca = Math.cos(a), sa = Math.sin(a), len = L * (0.82 + r() * 0.36), droop = len * (0.3 + r() * 0.16), w = len * (0.42 + r() * 0.1), tile = Math.floor(r() * 3);
      // branch spine: out of the trunk, slightly up, then drooping; card edges ± half width across
      const sp = (t: number): V3 => [ca * (0.1 + len * t), y + len * 0.1 * Math.sin(t * Math.PI) - droop * t * t, sa * (0.1 + len * t)];
      const edge = (t: number, hw: number, lift: number): [V3, V3] => { const c0 = sp(t); return [[c0[0] - sa * hw, c0[1] + lift - hw * 0.12, c0[2] + ca * hw], [c0[0] + sa * hw, c0[1] + lift - hw * 0.12, c0[2] - ca * hw]]; };
      const col: V3 = [shade * (0.9 + r() * 0.2), shade * (0.92 + r() * 0.16), shade * (0.88 + r() * 0.2)];
      const [a0, b0] = edge(0, w * 0.34, 0), [a1, b1] = edge(0.5, w * 0.5, 0), [a2, b2] = edge(1, w * 0.3, 0);
      quad(a0, b0, b1, a1, tile, 0, 0.5, col); quad(a1, b1, b2, a2, tile, 0.5, 1, col);
      if (quality >= 2) { // hanging side card: needles seen from the side
        const c0 = sp(0.08), c1 = sp(0.95), hh = w * 0.42;
        quad([c0[0], c0[1] + 0.05, c0[2]], [c0[0], c0[1] - hh, c0[2]], [c1[0], c1[1] - hh * 0.5, c1[2]], [c1[0], c1[1] + 0.05, c1[2]], (tile + 1) % 3, 0, 1, [col[0] * 0.78, col[1] * 0.8, col[2] * 0.8]);
      }
      if (r() < 0.86) { // snow lying on the branch (not on every one)
        const [s0, t0] = edge(0.04, w * 0.3, 0.07), [s1, t1] = edge(0.5, w * 0.42, 0.08), [s2, t2] = edge(0.9, w * 0.22, 0.07), sc: V3 = [1.0, 1.02, 1.05];
        quad(s0, t0, t1, s1, 3, 0, 0.5, sc); quad(s1, t1, t2, s2, 3, 0.5, 1, sc);
      }
    }
  }
  for (let i = 0; i < 3; i++) { // top spike: three crossed needle cards + snow cap
    const a = i / 3 * Math.PI, ca = Math.cos(a) * 0.55, sa = Math.sin(a) * 0.55;
    quad([-ca, 9.3, -sa], [ca, 9.3, sa], [ca * 0.2, H + 0.6, sa * 0.2], [-ca * 0.2, H + 0.6, -sa * 0.2], i, 0.1, 0.95, [1, 1, 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  parts.push(g, paint(plainUV(flat(new THREE.ConeGeometry(0.22, 0.9, 5).translate(0, H + 0.7, 0))), () => [0.88, 0.93, 0.98]));
  return merge(parts);
}

export function jungleTreeGeometry(seed: number, quality: number, lod = false): THREE.BufferGeometry {
  const r = rng(seed * 211 + 9); const parts: THREE.BufferGeometry[] = [];
  const bend = (t: number): V3 => [Math.sin(t * 2.4 + 0.4) * 0.55 * t, t * 12.4, Math.cos(t * 1.9) * 0.35 * t - 0.35 * t];
  const bark = (x: number, y: number, z: number): V3 => { // tint on top of the bark photo: slight variation + moss towards the roots
    const m = 0.82 + fbm(Math.atan2(z, x) * 3 + y * 0.3, y * 1.6, 3) * 0.4, moss = sstep(3.6, 0.2, y) * (0.35 + 0.65 * vn(x * 2.1 + 5, z * 2.1));
    return [lerp(1.0 * m, 0.5, moss * 0.8), lerp(0.94 * m, 0.82, moss * 0.8), lerp(0.84 * m, 0.36, moss * 0.8)];
  };
  const nb = 5 + Math.floor(r() * 2), bph = r() * TAU;
  parts.push(paint(barkUV(smooth(ringSurface(lod ? 6 : quality >= 2 ? 12 : 9, 9, (a, j) => {
    const t = [0, 0.03, 0.08, 0.16, 0.3, 0.48, 0.66, 0.84, 1][j], c = bend(t);
    const root = Math.pow(Math.max(0, Math.cos(a * nb + bph)), 2.2);
    const rad = (0.62 - t * 0.24) * (1 + (1.9 * Math.exp(-t * 16) + 0.55 * Math.exp(-t * 5)) * (0.3 + 0.7 * root)) + (fbm(a * 2 + 7, t * 9, 2) - 0.5) * 0.14;
    return [c[0] + Math.cos(a) * rad, c[1] - (j === 0 ? 0.6 : 0), c[2] + Math.sin(a) * rad];
  }))), bark));
  const top = bend(1); const lobes: { c: V3; r: number }[] = [];
  const nBough = 4;
  for (let k = 0; k < nBough; k++) {
    const a = k / nBough * TAU + r() * 0.7, len = 3.4 + r() * 2.2, rise = 1.6 + r() * 2.2, base = bend(0.74 + r() * 0.2);
    const end: V3 = [top[0] + Math.cos(a) * len, base[1] + rise + 1.2, top[2] + Math.sin(a) * len];
    const mid: V3 = [lerp(base[0], end[0], 0.5), lerp(base[1], end[1], 0.5) + 0.7, lerp(base[2], end[2], 0.5)];
    parts.push(paint(barkUV(smooth(tube([base, [lerp(base[0], mid[0], 0.5), lerp(base[1], mid[1], 0.5) + 0.25, lerp(base[2], mid[2], 0.5)], mid, end], [0.34, 0.27, 0.2, 0.09], lod ? 3 : 5)), 2.4), bark));
    lobes.push({ c: [end[0], end[1] + 0.7, end[2]], r: 2.9 + r() * 1.3 });
    if (quality >= 2 || (quality === 1 && k % 2 === 0)) {
      const c2: V3 = [lerp(mid[0], end[0], 0.2) + (r() - 0.5) * 2, mid[1] + 1.5 + r(), lerp(mid[2], end[2], 0.2) + (r() - 0.5) * 2];
      lobes.push({ c: c2, r: 2.1 + r() * 0.9 });
      if (!lod) parts.push(paint(barkUV(smooth(tube([mid, [lerp(mid[0], c2[0], 0.6), lerp(mid[1], c2[1], 0.5), lerp(mid[2], c2[2], 0.6)], c2], [0.15, 0.1, 0.05], 4)), 2.4), bark)); // twig into the side lobe
    }
  }
  lobes.push({ c: [top[0], top[1] + 3.2, top[2]], r: 3.6 }, { c: [top[0] + 1.2, top[1] + 1.4, top[2] - 1.0], r: 3.0 });
  const hue = r();
  const lobe = (cx: number, cy: number, cz: number, rad: number, detail: number, sy: number, tint: number, core: boolean) => {
    const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute; const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.62 + n3(x * 1.7 + cx, y * 1.7 + cy, z * 1.7 + cz) * 0.84, under = y < 0 ? 0.5 : 1;
      const px = x * n * rad * 1.22, py = y * n * rad * sy * under, pz = z * n * rad * 1.22;
      p.setXYZ(i, cx + px, cy + py, cz + pz);
      const l = Math.hypot(px, py * 1.9 + rad * 0.35, pz) || 1; nrm.setXYZ(i, px / l, (py * 1.9 + rad * 0.35) / l, pz / l); // soft, sky-biased foliage normal
      const up = sstep(-0.5, 0.9, y), cl = 0.8 + n3(x * 3.1 + cz, y * 3.1, z * 3.1 + cx) * 0.4, sunny = up * up, k = core ? 0.5 : 1; // core = shaded interior behind the leaf cards
      col[i * 3] = (0.045 + sunny * (0.15 + hue * 0.1) + tint * 0.05) * cl * k; col[i * 3 + 1] = (0.14 + sunny * 0.33 + tint * 0.04) * cl * k; col[i * 3 + 2] = (0.05 + sunny * 0.06) * cl * (1 - tint * 0.3) * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return plainUV(g);
  };
  // leaf-sprig cards: quads on a shell around every lobe, facing roughly outwards, soft sky-biased normals
  const cP: number[] = [], cN: number[] = [], cU: number[] = [], cC: number[] = [];
  const card = (cx: number, cy: number, cz: number, size: number, dx: number, dy: number, dz: number, light: number, tint: number) => {
    let ux = -dz, uy = 0, uz = dx; const ul = Math.hypot(ux, uz); if (ul < 1e-3) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
    let vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const ro = r() * TAU, cs = Math.cos(ro), sn = Math.sin(ro), ax = ux * cs + vx * sn, ay = uy * cs + vy * sn, az = uz * cs + vz * sn; vx = vx * cs - ux * sn; vy = vy * cs - uy * sn; vz = vz * cs - uz * sn;
    const [u0, v0, u1] = LEAF_TILE(Math.floor(r() * 4)), v1 = v0 + 230 / 512;
    const nl = Math.hypot(dx * 0.6, dy * 0.6 + 0.8, dz * 0.6) || 1, nx = dx * 0.6 / nl, ny = (dy * 0.6 + 0.8) / nl, nz = dz * 0.6 / nl;
    const cr = (0.86 + tint * 0.3 + hue * 0.12) * light, cg = 1.0 * light, cb = (0.78 - tint * 0.2) * light;
    for (const [a, b, uu, vv] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, -1, u0, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
      cP.push(cx + (ax * a + vx * b) * size, cy + (ay * a + vy * b) * size, cz + (az * a + vz * b) * size); cN.push(nx, ny, nz); cU.push(uu, vv); cC.push(cr, cg, cb);
    }
  };
  const nCards = lod ? 0 : quality >= 2 ? 16 : quality === 1 ? 11 : 7;
  for (const l of lobes) {
    const sy = 0.66 + r() * 0.2, tint = r();
    parts.push(lod ? lobe(l.c[0], l.c[1], l.c[2], l.r * 1.12, 0, sy, tint, false) : lobe(l.c[0], l.c[1], l.c[2], l.r * 0.8, 0, sy, tint, true));
    for (let k = 0; k < nCards; k++) {
      const th = r() * TAU, dy = -0.35 + r() * 1.35, hr = Math.sqrt(Math.max(0.05, 1 - Math.min(1, dy * dy))), dx = Math.cos(th) * hr, dz = Math.sin(th) * hr, dl = Math.hypot(dx, dy, dz);
      const rr = l.r * (0.72 + r() * 0.4);
      card(l.c[0] + dx / dl * rr * 1.22, l.c[1] + dy / dl * rr * sy, l.c[2] + dz / dl * rr * 1.22, l.r * (0.52 + r() * 0.3), dx / dl, dy / dl, dz / dl, 0.72 + 0.5 * Math.max(0, dy), r());
    }
  }
  if (cP.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cP, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(cN, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(cU, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cC, 3)); parts.push(g); }
  const nVine = lod ? 0 : quality >= 2 ? 6 : quality >= 1 ? 3 : 0;
  for (let k = 0; k < nVine; k++) {
    const l = lobes[Math.floor(r() * lobes.length)], a = r() * TAU, d = l.r * (0.5 + r() * 0.5), len = 2.5 + r() * 4.5, x = l.c[0] + Math.cos(a) * d, z = l.c[2] + Math.sin(a) * d, y = l.c[1] - 0.3;
    parts.push(paint(plainUV(smooth(tube([[x, y, z], [x + (r() - 0.5) * 0.5, y - len * 0.5, z + (r() - 0.5) * 0.5], [x + (r() - 0.5) * 0.8, y - len, z + (r() - 0.5) * 0.8]], [0.07, 0.06, 0.035], 3, true))), (_x, yy) => { const m = 0.7 + h2(yy * 2.3, k) * 0.5; return [0.08 * m, 0.2 * m, 0.07 * m]; }));
  }
  return merge(parts.map(g => g.index ? smooth(g) : g));
}

/** Ribbed saguaro with rounded crown and curved, upturned arms. Height ≈ 4.6. */
export function cactusGeometry(seed: number): THREE.BufferGeometry {
  const r = rng(seed * 7 + 1); const parts: THREE.BufferGeometry[] = [];
  const column = (pts: V3[], rad: number, ribs: number) => {
    const n = pts.length; const radii = pts.map((_p, j) => { const t = j / (n - 1); return rad * (0.86 + 0.14 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5)) * (t > 0.86 ? Math.sqrt(Math.max(0.05, 1 - Math.pow((t - 0.86) / 0.15, 2))) : 1); });
    const core = tube(pts, radii, ribs * 2, true); const p = core.attributes.position as THREE.BufferAttribute, cols = ribs * 2 + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < cols; i++) if (i % 2 === 1) { // pinch every other column inward → ribs
      const k = j * cols + i, c = pts[j]; p.setXYZ(k, lerp(c[0], p.getX(k), 0.8), lerp(c[1], p.getY(k), 0.8), lerp(c[2], p.getZ(k), 0.8));
    }
    core.computeVertexNormals();
    // Session 20 – skin texture coordinates (foliage.ts → cactusMaterial): u = rib phase (integer on a rib crest, .5 in the valley),
    // v = length along the column / 0.42 → the areoles sit on the crests at a fixed spacing whatever the size of the column
    const uv = core.attributes.uv as THREE.BufferAttribute; let len = 0;
    for (let j = 0; j < n; j++) {
      if (j > 0) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1], pts[j][2] - pts[j - 1][2]);
      for (let i = 0; i < cols; i++) uv.setXY(j * cols + i, i / 2, len / 0.42);
    }
    uv.setXY(n * cols, ribs / 2, (len + rad * 0.8) / 0.42); // tip cap
    return smooth(core);
  };
  const H = 4.3 + r() * 0.5; const trunk: V3[] = []; for (let j = 0; j <= 8; j++) trunk.push([Math.sin(j * 0.5) * 0.04, j / 8 * H, 0]);
  parts.push(column(trunk, 0.4, 8));
  const arms = 2 + Math.floor(r() * 2);
  for (let k = 0; k < arms; k++) {
    const a = k * (TAU / arms) + r() * 0.9, y0 = 1.3 + r() * 1.3, out = 0.75 + r() * 0.35, up = 1.2 + r() * 1.3, cx = Math.cos(a), cz = Math.sin(a);
    const pts: V3[] = [[cx * 0.2, y0, cz * 0.2], [cx * out * 0.75, y0 + 0.08, cz * out * 0.75], [cx * out, y0 + 0.38, cz * out], [cx * out, y0 + 0.38 + up * 0.5, cz * out], [cx * out * 0.98, y0 + 0.38 + up, cz * out * 0.98]];
    parts.push(column(pts, 0.24, 6));
  }
  const out = merge(parts); out.name = 'cactus';
  return out;
}

/** Energy pylon: splayed tripod legs with foot pads & cross braces, hex mast, ring platforms, pronged emitter head. Height ≈ 32. */
export function pylonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(flat(new THREE.CylinderGeometry(0.3, 0.55, 30, 6).translate(0, 15, 0)));
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + 0.3, b = (k + 1) / 3 * TAU + 0.3, c = Math.cos(a), s = Math.sin(a);
    parts.push(smooth(tube([[c * 2.7, -0.3, s * 2.7], [c * 1.5, 5, s * 1.5], [c * 0.45, 10, s * 0.45]], [0.3, 0.24, 0.18], 6)));
    parts.push(flat(new THREE.CylinderGeometry(0.62, 0.8, 0.5, 8).translate(c * 2.7, -0.1, s * 2.7)));
    parts.push(smooth(tube([[c * 1.5, 5, s * 1.5], [Math.cos(b) * 1.5, 5, Math.sin(b) * 1.5]], [0.09, 0.09], 4)));
    parts.push(smooth(tube([[c * 1.25, 27.2, s * 1.25], [c * 1.5, 29.6, s * 1.5], [c * 0.85, 32.2, s * 0.85]], [0.14, 0.11, 0.03], 5, true)));
    parts.push(smooth(tube([[c * 0.3, 26.6, s * 0.3], [c * 1.25, 27.2, s * 1.25]], [0.1, 0.1], 4)));
  }
  for (const [y, r, w] of [[10, 1.25, 0.16], [18, 1.0, 0.11], [24, 1.3, 0.14]] as V3[]) {
    parts.push(smooth(new THREE.TorusGeometry(r, w, 6, 18).rotateX(Math.PI / 2).translate(0, y, 0)));
    parts.push(flat(new THREE.CylinderGeometry(r, r * 0.6, 0.18, 12).translate(0, y - 0.3, 0)));
  }
  parts.push(smooth(new THREE.SphereGeometry(0.92, 12, 8).translate(0, 30.5, 0)));
  return merge(parts);
}
