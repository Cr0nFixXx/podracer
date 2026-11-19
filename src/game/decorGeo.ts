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
  return ringSurface(radial, prof.length, (a, j) => {
    const [t, pr, gs] = prof[j];
    const plan = 1 + 0.2 * Math.cos(a * 2 + ph[0]) + 0.13 * Math.cos(a * 3 + ph[1]) + 0.07 * Math.cos(a * 7 + ph[2]) + (fbm(a * 1.9 + seed, seed * 0.37, 3) - 0.5) * 0.36;
    const gully = Math.pow(Math.abs(Math.sin(a * 8.5 + fbm(a * 2.2 + seed, 3.3, 2) * 3.2)), 2.4) * 0.09 * gs + (fbm(a * 6.5, t * 5 + seed, 3) - 0.5) * 0.11 * gs;
    const rad = pr * plan * (1 - gully) + (j < 3 ? (fbm(a * 3.1, j * 2.7 + seed, 2) - 0.5) * 0.16 : 0);
    const y = t + (j > 0 && j < prof.length - 1 ? (fbm(a * 2.6 + j * 5.1, seed, 2) - 0.5) * 0.03 : 0);
    return [Math.cos(a) * rad, y, Math.sin(a) * rad];
  }, [0, 1.012, 0]);
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

/** Emergent rainforest tree: buttress roots, bent trunk, forked boughs, layered umbrella canopy of noise-broken lobes + tufts, hanging lianas (vertex colours). */
/** `lod = true` → same seeded silhouette at ~1/4 of the triangles (far sectors, see world.ts `place({ lod })`). */
export function jungleTreeGeometry(seed: number, quality: number, lod = false): THREE.BufferGeometry {
  const r = rng(seed * 211 + 9); const parts: THREE.BufferGeometry[] = [];
  const bend = (t: number): V3 => [Math.sin(t * 2.4 + 0.4) * 0.55 * t, t * 12.4, Math.cos(t * 1.9) * 0.35 * t - 0.35 * t];
  const bark = (x: number, y: number, z: number): V3 => {
    const m = 0.72 + fbm(Math.atan2(z, x) * 3 + y * 0.3, y * 1.6, 3) * 0.5, moss = sstep(3.6, 0.2, y) * (0.35 + 0.65 * vn(x * 2.1 + 5, z * 2.1));
    return [lerp(0.25 * m, 0.14, moss * 0.8), lerp(0.19 * m, 0.24, moss * 0.8), lerp(0.14 * m, 0.08, moss * 0.8)];
  };
  const nb = 5 + Math.floor(r() * 2), bph = r() * TAU;
  parts.push(paint(smooth(ringSurface(lod ? 6 : quality >= 2 ? 12 : 9, 9, (a, j) => {
    const t = [0, 0.03, 0.08, 0.16, 0.3, 0.48, 0.66, 0.84, 1][j], c = bend(t);
    const root = Math.pow(Math.max(0, Math.cos(a * nb + bph)), 2.2);
    const rad = (0.62 - t * 0.24) * (1 + (1.9 * Math.exp(-t * 16) + 0.55 * Math.exp(-t * 5)) * (0.3 + 0.7 * root)) + (fbm(a * 2 + 7, t * 9, 2) - 0.5) * 0.14;
    return [c[0] + Math.cos(a) * rad, c[1] - (j === 0 ? 0.6 : 0), c[2] + Math.sin(a) * rad];
  })), bark));
  const top = bend(1); const lobes: { c: V3; r: number }[] = [];
  const nBough = 4;
  for (let k = 0; k < nBough; k++) {
    const a = k / nBough * TAU + r() * 0.7, len = 3.4 + r() * 2.2, rise = 1.6 + r() * 2.2, base = bend(0.74 + r() * 0.2);
    const end: V3 = [top[0] + Math.cos(a) * len, base[1] + rise + 1.2, top[2] + Math.sin(a) * len];
    const mid: V3 = [lerp(base[0], end[0], 0.5), lerp(base[1], end[1], 0.5) + 0.7, lerp(base[2], end[2], 0.5)];
    parts.push(paint(smooth(tube([base, [lerp(base[0], mid[0], 0.5), lerp(base[1], mid[1], 0.5) + 0.25, lerp(base[2], mid[2], 0.5)], mid, end], [0.34, 0.27, 0.2, 0.09], lod ? 3 : 5)), bark));
    lobes.push({ c: [end[0], end[1] + 0.7, end[2]], r: 2.9 + r() * 1.3 });
    if (quality >= 2 || (quality === 1 && k % 2 === 0)) lobes.push({ c: [lerp(mid[0], end[0], 0.2) + (r() - 0.5) * 2, mid[1] + 1.5 + r(), lerp(mid[2], end[2], 0.2) + (r() - 0.5) * 2], r: 2.1 + r() * 0.9 });
  }
  lobes.push({ c: [top[0], top[1] + 3.2, top[2]], r: 3.6 }, { c: [top[0] + 1.2, top[1] + 1.4, top[2] - 1.0], r: 3.0 });
  const hue = r();
  const leaf = (cx: number, cy: number, cz: number, rad: number, detail: number, sy: number, tint: number) => {
    const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute; const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.62 + n3(x * 1.7 + cx, y * 1.7 + cy, z * 1.7 + cz) * 0.84, under = y < 0 ? 0.5 : 1; // flat, shaded underside
      const px = x * n * rad * 1.22, py = y * n * rad * sy * under, pz = z * n * rad * 1.22;
      p.setXYZ(i, cx + px, cy + py, cz + pz);
      const l = Math.hypot(px, py * 1.9 + rad * 0.35, pz) || 1; nrm.setXYZ(i, px / l, (py * 1.9 + rad * 0.35) / l, pz / l); // soft, sky-biased foliage normal
      const up = sstep(-0.5, 0.9, y), cl = 0.8 + n3(x * 3.1 + cz, y * 3.1, z * 3.1 + cx) * 0.4, sunny = up * up;
      col[i * 3] = (0.045 + sunny * (0.15 + hue * 0.1) + tint * 0.05) * cl; col[i * 3 + 1] = (0.14 + sunny * 0.33 + tint * 0.04) * cl; col[i * 3 + 2] = (0.05 + sunny * 0.06) * cl * (1 - tint * 0.3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  };
  for (const l of lobes) parts.push(leaf(l.c[0], l.c[1], l.c[2], lod ? l.r * 1.12 : l.r, lod ? 0 : 1, 0.66 + r() * 0.2, r()));
  const nTuft = lod ? 0 : quality >= 2 ? 8 : quality >= 1 ? 5 : 0;
  for (let k = 0; k < nTuft; k++) {
    const l = lobes[Math.floor(r() * lobes.length)], a = r() * TAU, d = l.r * (0.95 + r() * 0.35);
    parts.push(leaf(l.c[0] + Math.cos(a) * d, l.c[1] - 0.2 + (r() - 0.6) * 1.4, l.c[2] + Math.sin(a) * d, 0.9 + r() * 0.8, 0, 0.62, r()));
  }
  const nVine = lod ? 0 : quality >= 2 ? 5 : quality >= 1 ? 3 : 0;
  for (let k = 0; k < nVine; k++) {
    const l = lobes[Math.floor(r() * lobes.length)], a = r() * TAU, d = l.r * (0.5 + r() * 0.5), len = 2.5 + r() * 4.5, x = l.c[0] + Math.cos(a) * d, z = l.c[2] + Math.sin(a) * d, y = l.c[1] - 0.3;
    parts.push(paint(smooth(tube([[x, y, z], [x + (r() - 0.5) * 0.5, y - len * 0.5, z + (r() - 0.5) * 0.5], [x + (r() - 0.5) * 0.8, y - len, z + (r() - 0.5) * 0.8]], [0.07, 0.06, 0.035], 3, true)), (_x, yy) => { const m = 0.7 + h2(yy * 2.3, k) * 0.5; return [0.08 * m, 0.2 * m, 0.07 * m]; }));
  }
  return merge(parts);
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
    core.computeVertexNormals(); return smooth(core);
  };
  const H = 4.3 + r() * 0.5; const trunk: V3[] = []; for (let j = 0; j <= 8; j++) trunk.push([Math.sin(j * 0.5) * 0.04, j / 8 * H, 0]);
  parts.push(column(trunk, 0.4, 8));
  const arms = 2 + Math.floor(r() * 2);
  for (let k = 0; k < arms; k++) {
    const a = k * (TAU / arms) + r() * 0.9, y0 = 1.3 + r() * 1.3, out = 0.75 + r() * 0.35, up = 1.2 + r() * 1.3, cx = Math.cos(a), cz = Math.sin(a);
    const pts: V3[] = [[cx * 0.2, y0, cz * 0.2], [cx * out * 0.75, y0 + 0.08, cz * out * 0.75], [cx * out, y0 + 0.38, cz * out], [cx * out, y0 + 0.38 + up * 0.5, cz * out], [cx * out * 0.98, y0 + 0.38 + up, cz * out * 0.98]];
    parts.push(column(pts, 0.24, 6));
  }
  return merge(parts);
}

/** Racing-blimp: gored teardrop hull, swept cruciform tail fins, gondola on struts, twin engine nacelles. Length ≈ 4.6 (z), radius ≈ 1. */
export function airshipGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(smooth(ringSurface(18, 14, (a, j) => {
    const t = j / 13, prof = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.72))), 0.62);
    const rad = Math.max(0.03, prof) * (1 - 0.04 * Math.pow(Math.abs(Math.sin(a * 6)), 6));
    return [Math.cos(a) * rad, Math.sin(a) * rad * 0.86, lerp(2.3, -2.3, t)];
  }, [0, 0, -2.34], [0, 0, 2.34])));
  for (let k = 0; k < 4; k++) { // swept tail fins
    const f = new THREE.BoxGeometry(0.07, 0.95, 1.15); const p = f.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setY(i, p.getY(i) * 0.3 - 0.3);
    parts.push(flat(f.translate(0, 0.72, -1.72).rotateZ(k * Math.PI / 2 + Math.PI / 4)));
  }
  parts.push(smooth(ringSurface(8, 6, (a, j) => { const t = j / 5, rad = Math.sin(Math.PI * (0.12 + t * 0.76)) * 0.3; return [Math.cos(a) * rad * 0.8, -1.0 + Math.sin(a) * rad * 0.62, lerp(0.85, -0.75, t)]; }, [0, -1.0, -0.8], [0, -1.0, 0.9])));
  for (const sx of [-1, 1]) {
    for (const z of [0.45, -0.35]) parts.push(smooth(tube([[sx * 0.14, -0.9, z], [sx * 0.3, -0.72, z]], [0.03, 0.03], 4)));
    parts.push(smooth(tube([[sx * 0.82, -0.52, 0.1], [sx * 0.82, -0.52, -0.55]], [0.13, 0.1], 8, true)));
    parts.push(smooth(tube([[sx * 0.82, -0.52, 0.1], [sx * 0.82, -0.52, 0.16]], [0.26, 0.26], 10, true)));
    parts.push(smooth(tube([[sx * 0.5, -0.56, -0.2], [sx * 0.82, -0.52, -0.2]], [0.035, 0.035], 4)));
  }
  return merge(parts);
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
