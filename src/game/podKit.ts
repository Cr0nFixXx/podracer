import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Geometry toolkit for the podracers.
 * Every generator returns an indexed BufferGeometry with world-scale UVs (1 texture repeat = TILE metres)
 * and an `aLiv` attribute (x = circumference 0..1 with 0 = top, y = length 0 rear .. 1 front, z = livery mode).
 * Livery modes: 0 = plain paint, 1 = engine livery, 2 = cockpit livery, 3 = solid secondary paint.
 */
export const TILE = 2.4;

export type MatKey = 'hull' | 'chrome' | 'steel' | 'dark' | 'copper' | 'rubber' | 'carbon' | 'glow' | 'glass' | 'interior' | 'leather' | 'suit' | 'skin' | 'visor' | 'hazard';

const V3 = THREE.Vector3;

function ensureAttrs(g: THREE.BufferGeometry, liv: [number, number, number]) {
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aLiv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.aLiv) {
    const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = liv[0]; a[i * 3 + 1] = liv[1]; a[i * 3 + 2] = liv[2]; }
    g.setAttribute('aLiv', new THREE.Float32BufferAttribute(a, 3));
  }
  if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.morphAttributes = {}; g.clearGroups();
  return g;
}

function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.index!; const a = idx.array as Uint32Array | Uint16Array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  idx.needsUpdate = true;
}

/** Collects geometry per material key and merges every bucket into one geometry (one draw call). */
export class PartBuilder {
  buckets = new Map<MatKey, THREE.BufferGeometry[]>();
  add(key: MatKey, g: THREE.BufferGeometry, m?: THREE.Matrix4, liv: [number, number, number] = [0, 0, 0]) {
    const geo = ensureAttrs(g, liv);
    if (m) { geo.applyMatrix4(m); if (m.determinant() < 0) flipWinding(geo); }
    let list = this.buckets.get(key); if (!list) { list = []; this.buckets.set(key, list); }
    list.push(geo);
    return this;
  }
  build() {
    const out = new Map<MatKey, THREE.BufferGeometry>();
    for (const [k, list] of this.buckets) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      out.set(k, merged);
      list.forEach(g => g.dispose());
    }
    this.buckets.clear();
    return out;
  }
}

export const M4 = {
  t: (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z),
  /** translate * rotation(euler XYZ) * scale */
  trs: (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz)),
  mirrorX: () => new THREE.Matrix4().makeScale(-1, 1, 1),
};

/** Box-projected world UVs, good for plates, boxes and brackets. */
export function projUV(g: THREE.BufferGeometry, tile = TILE) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Rounded (bevelled) box – crisp BoxGeometry for sub-8cm micro-fins/louvres (25× fewer tris), bevelled for larger machined parts. */
export function rbox(w: number, h: number, d: number, r = 0.04, seg = 1) {
  const minDim = Math.min(w, h, d);
  if (minDim < 0.085 || r < 0.014) return projUV(new THREE.BoxGeometry(w, h, d));
  const rr = Math.max(0.004, Math.min(r, minDim * 0.45));
  const s = Math.max(w, h, d) > 1.8 ? Math.min(2, seg) : 1;
  const g = new RoundedBoxGeometry(w, h, d, s, rr);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', g.attributes.position); geo.setAttribute('normal', g.attributes.normal); geo.setIndex(g.index);
  return projUV(geo);
}

function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

export function cyl(rTop: number, rBot: number, h: number, seg: number, open = false, hSeg = 1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, hSeg, open);
  return scaleUV(g, Math.PI * (rTop + rBot) / TILE, h / TILE);
}
export function sphere(r: number, ws: number, hs: number, phiS = 0, phiL = Math.PI * 2, thS = 0, thL = Math.PI) {
  return scaleUV(new THREE.SphereGeometry(r, ws, hs, phiS, phiL, thS, thL), Math.PI * 2 * r / TILE, Math.PI * r / TILE);
}
export function torus(R: number, r: number, radSeg: number, tubSeg: number, arc = Math.PI * 2) {
  return scaleUV(new THREE.TorusGeometry(R, r, radSeg, tubSeg, arc), R * arc / TILE, Math.PI * 2 * r / TILE);
}
export function tube(points: THREE.Vector3[], r: number, segs = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  return scaleUV(g, curve.getLength() / TILE, Math.PI * 2 * r / TILE);
}
export function extrude(pts: [number, number][], depth: number, bevel = 0.02) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return projUV(g);
}

export interface ProfilePt { r: number; z: number; hard?: boolean }

/**
 * Surface of revolution around the Z axis. Profile ordered along the surface (any direction);
 * outward normals are derived from the profile tangent, `hard` points become creases.
 * phi = 0 is the top (+Y), increasing towards +X.
 */
export function lathe(profile: ProfilePt[], seg: number, mode = 1, phiStart = 0, phiLen = Math.PI * 2) {
  // rows with normals in (r,z) plane
  const rows: { r: number; z: number; nr: number; nz: number; s: number }[] = [];
  const segN = (a: ProfilePt, b: ProfilePt) => { const dr = b.r - a.r, dz = b.z - a.z; const l = Math.hypot(dr, dz) || 1; return [dz / l, -dr / l]; };
  let s = 0; let zmin = Infinity, zmax = -Infinity;
  for (const p of profile) { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); }
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (i > 0) s += Math.hypot(p.r - profile[i - 1].r, p.z - profile[i - 1].z);
    const nIn = i > 0 ? segN(profile[i - 1], p) : null, nOut = i < profile.length - 1 ? segN(p, profile[i + 1]) : null;
    if (p.hard && nIn && nOut) { rows.push({ r: p.r, z: p.z, nr: nIn[0], nz: nIn[1], s }); rows.push({ r: p.r, z: p.z, nr: nOut[0], nz: nOut[1], s }); }
    else { const a = nIn ?? nOut!, b = nOut ?? nIn!; const nr = a[0] + b[0], nz = a[1] + b[1]; const l = Math.hypot(nr, nz) || 1; rows.push({ r: p.r, z: p.z, nr: nr / l, nz: nz / l, s }); }
  }
  const cols = seg + 1; const R = rows.length;
  const pos = new Float32Array(R * cols * 3), nrm = new Float32Array(R * cols * 3), uv = new Float32Array(R * cols * 2), liv = new Float32Array(R * cols * 3);
  const zr = Math.max(1e-4, zmax - zmin);
  for (let j = 0; j < R; j++) {
    const row = rows[j];
    for (let i = 0; i < cols; i++) {
      const phi = phiStart + (i / seg) * phiLen; const sp = Math.sin(phi), cp = Math.cos(phi);
      const k = j * cols + i;
      pos[k * 3] = row.r * sp; pos[k * 3 + 1] = row.r * cp; pos[k * 3 + 2] = row.z;
      nrm[k * 3] = row.nr * sp; nrm[k * 3 + 1] = row.nr * cp; nrm[k * 3 + 2] = row.nz;
      uv[k * 2] = (phi * Math.max(0.12, row.r)) / TILE; uv[k * 2 + 1] = row.s / TILE;
      liv[k * 3] = ((phi / (Math.PI * 2)) % 1 + 1) % 1; liv[k * 3 + 1] = (row.z - zmin) / zr; liv[k * 3 + 2] = mode;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < R - 1; j++) {
    if (rows[j].r === rows[j + 1].r && rows[j].z === rows[j + 1].z) continue; // crease duplicate
    for (let i = 0; i < seg; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aLiv', new THREE.BufferAttribute(liv, 3));
  g.setIndex(idx);
  return g;
}

/** Helper to write a lathe profile compactly: [r, z, hard?] */
export const prof = (pts: [number, number, (0 | 1)?][]): ProfilePt[] => pts.map(([r, z, h]) => ({ r, z, hard: !!h }));

export interface Section { z: number; w: number; hT: number; hB: number; y?: number; n?: number; rot?: number; open?: number }

function sectionPoint(s: Section, phi: number): [number, number] {
  const n = s.n ?? 2; const e = 2 / n;
  const sp = Math.sin(phi), cp = Math.cos(phi);
  let x = s.w * Math.sign(sp) * Math.pow(Math.abs(sp), e);
  let y = (cp >= 0 ? s.hT : s.hB) * Math.sign(cp) * Math.pow(Math.abs(cp), e);
  if (s.rot) { const c = Math.cos(s.rot), si = Math.sin(s.rot); const nx = x * c - y * si, ny = x * si + y * c; x = nx; y = ny; }
  return [x, y + (s.y ?? 0)];
}

/**
 * Loft through super-elliptic cross sections along Z (sections sorted by z).
 * `open` (0..0.9) removes the top arc of a section – used for open cockpit tubs.
 */
export function loft(sections: Section[], seg: number, mode = 0, caps: [boolean, boolean] = [true, true], inward = false) {
  const R = sections.length, cols = seg + 1;
  const pos = new Float32Array(R * cols * 3), uv = new Float32Array(R * cols * 2), liv = new Float32Array(R * cols * 3);
  const z0 = sections[0].z, z1 = sections[R - 1].z; const zr = Math.max(1e-4, z1 - z0);
  let vAcc = 0;
  for (let j = 0; j < R; j++) {
    const s = sections[j]; const gap = (s.open ?? 0) * Math.PI;
    if (j > 0) { const p = sections[j - 1]; vAcc += Math.hypot(s.z - p.z, (s.y ?? 0) - (p.y ?? 0), (s.hT - p.hT) * 0.5); }
    let uAcc = 0; let px = 0, py = 0;
    for (let i = 0; i < cols; i++) {
      const phi = gap / 2 + (i / seg) * (Math.PI * 2 - gap);
      const [x, y] = sectionPoint(s, phi);
      if (i > 0) uAcc += Math.hypot(x - px, y - py); px = x; py = y;
      const k = j * cols + i;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = s.z;
      uv[k * 2] = uAcc / TILE; uv[k * 2 + 1] = vAcc / TILE;
      liv[k * 3] = phi / (Math.PI * 2); liv[k * 3 + 1] = (s.z - z0) / zr; liv[k * 3 + 2] = mode;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    if (inward) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aLiv', new THREE.BufferAttribute(liv, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // weld seam normals of closed rings
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let j = 0; j < R; j++) {
    if ((sections[j].open ?? 0) > 0) continue;
    const a = j * cols, b = j * cols + seg;
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b); const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  const parts = [g];
  // flat caps
  caps.forEach((on, ci) => {
    if (!on) return; const s = sections[ci === 0 ? 0 : R - 1]; if (s.w < 0.01 && s.hT < 0.01) return;
    const cp: number[] = [], cu: number[] = [], ci2: number[] = [], cn: number[] = [], cl: number[] = [];
    const dir = (ci === 0 ? -1 : 1) * (inward ? -1 : 1);
    cp.push(0, s.y ?? 0, s.z); cu.push(0, 0); cn.push(0, 0, dir); cl.push(0, ci, mode);
    for (let i = 0; i <= seg; i++) { const [x, y] = sectionPoint(s, (i / seg) * Math.PI * 2); cp.push(x, y, s.z); cu.push(x / TILE, y / TILE); cn.push(0, 0, dir); cl.push(i / seg, ci, mode); }
    for (let i = 1; i <= seg; i++) { if (dir > 0) ci2.push(0, i + 1, i); else ci2.push(0, i, i + 1); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2)); cg.setAttribute('aLiv', new THREE.Float32BufferAttribute(cl, 3)); cg.setIndex(ci2);
    parts.push(cg);
  });
  if (parts.length === 1) return g;
  const m = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return m;
}

/** Strip that closes the gap between outer and inner shell of an open loft (the cockpit rim). */
export function loftRim(outer: Section[], inner: Section[], seg: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let v = 0, acc = 0;
  for (const side of [0, 1]) {
    acc = 0;
    for (let j = 0; j < outer.length; j++) {
      const so = outer[j], si = inner[j]; const gapO = (so.open ?? 0) * Math.PI, gapI = (si.open ?? 0) * Math.PI;
      const i = side === 0 ? 0 : seg;
      const phiO = gapO / 2 + (i / seg) * (Math.PI * 2 - gapO), phiI = gapI / 2 + (i / seg) * (Math.PI * 2 - gapI);
      const [xo, yo] = sectionPoint(so, phiO), [xi, yi] = sectionPoint(si, phiI);
      if (j > 0) acc += Math.abs(so.z - outer[j - 1].z);
      pos.push(xo, yo, so.z, xi, yi, si.z); uv.push(acc / TILE, 0, acc / TILE, 0.05);
      if (j > 0) { if (side === 0) idx.push(v - 2, v - 1, v, v - 1, v + 1, v); else idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
      v += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Twisted turbine blade along +Y (root at r0, tip at r1). */
export function blade(r0: number, r1: number, chord: number, thick: number, twist0: number, twist1: number, segs = 3) {
  const sN = Math.min(3, segs);
  const secs: Section[] = [];
  for (let k = 0; k <= sN; k++) {
    const f = k / sN; const c = chord * (1 - 0.25 * f);
    secs.push({ z: r0 + (r1 - r0) * f, w: c / 2, hT: thick / 2, hB: thick / 2, n: 5, rot: twist0 + (twist1 - twist0) * f });
  }
  const g = loft(secs, 6, 0, [false, true]);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** N copies of a geometry rotated around the Z axis. */
export function radial(make: () => THREE.BufferGeometry, n: number, phase = 0) {
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) { const g = ensureAttrs(make(), [0, 0, 0]); g.rotateZ(phase + (i / n) * Math.PI * 2); list.push(g); }
  const m = mergeGeometries(list, false)!; list.forEach(g => g.dispose()); return m;
}

/** Exhaust flame: a tapering body of revolution from the nozzle (z = 0, radius `rn`) backwards over `len`. */
export function flameGeo(rn: number, len: number, seg: number) {
  const pts: [number, number, 0][] = [];
  for (let i = 0; i <= 12; i++) { const t = 1 - i / 12; const r = rn * Math.pow(1 - t, 0.55) * (1 + 0.18 * Math.sin(Math.PI * t)) + 0.01; pts.push([r, -t * len, 0]); }
  return lathe(prof(pts), seg, 0);
}

/** Ring of bolt heads facing +Z (or outward when `radialOut`). */
export function boltRing(R: number, count: number, r: number, z: number, radialOut = false) {
  return radial(() => {
    const g = cyl(r, r, r * 0.7, 6);
    if (radialOut) g.translate(0, R + r * 0.25, z); else { g.rotateX(Math.PI / 2); g.translate(0, R, z + r * 0.3); }
    return g;
  }, count, Math.PI / count);
}
