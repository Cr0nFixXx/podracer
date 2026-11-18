import { buildImpostors } from './impostors';
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import type { TerrainField } from './terrain';
import type { TrackData } from './trackBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { clamp, color, cos, interleavedGradientNoise, length, oneMinus, positionGeometry, positionLocal, positionView, screenCoordinate, sin, smoothstep, time, vec3, vertexColor } = TSL;

/**
 * Ground cover: grass, reeds, ferns, flowers, bushes, dry scrub, stones, pebbles, ice shards, crystals, glowing fungi, scoria.
 * Placed once along the track (clustered, denser near the road), stored per 260 m cell (session 7: fewer draws) as InstancedMesh → frustum culling
 * per cell, per-type view distance (cells hidden on the CPU, small types fade out with a dithered alpha test). Foliage sways
 * in the wind (TSL positionNode after instancing).
 */
type Disp = { dispose: () => void }[];
type RGB = [number, number, number];
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

function part(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, colFn: (x: number, y: number, z: number) => RGB, upNormals = false) {
  const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose();
  if (m) ng.applyMatrix4(m);
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  if (!ng.attributes.normal) ng.computeVertexNormals();
  const p = ng.attributes.position as THREE.BufferAttribute; const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, gg, b] = colFn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (upNormals) { const n = ng.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < n.count; i++) { const x = n.getX(i) * 0.35, y = Math.abs(n.getY(i)) * 0.35 + 0.65, z = n.getZ(i) * 0.35; const l = Math.hypot(x, y, z); n.setXYZ(i, x / l, y / l, z / l); } }
  return ng;
}
const merge = (list: THREE.BufferGeometry[]) => { const g = mergeGeometries(list)!; list.forEach(x => x.dispose()); g.computeBoundingSphere(); return g; };
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function lumpy(g: THREE.BufferGeometry, amp: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + (h2(Math.round(x * 5 + seed), Math.round(y * 5 + z * 3)) - 0.5) * amp + Math.sin(x * 3.1 + seed) * Math.sin(z * 2.7) * amp * 0.5; p.setXYZ(i, x * k, y * k, z * k); }
  g.deleteAttribute('normal'); g.computeVertexNormals(); return g;
}
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
const hex = (s: string): RGB => { const k = new THREE.Color(s); return [k.r, k.g, k.b]; };

// ------------------------------------------------------------------ geometry library
function blades(n: number, h: number, w: number, lean: number, seed: number, base: RGB, tip: RGB, spread = 0.18) {
  const pos: number[] = [];
  for (let b = 0; b < n; b++) {
    const a = h2(b, seed) * Math.PI * 2, r = Math.sqrt(h2(b + 7, seed)) * spread; const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const hh = h * (0.55 + h2(b + 3, seed) * 0.6); const la = a + (h2(b + 11, seed) - 0.5) * 1.4; const L = lean * hh * (0.5 + h2(b + 5, seed));
    const lx = Math.cos(la) * L, lz = Math.sin(la) * L; const wa = la + Math.PI / 2; const px = Math.cos(wa) * w * 0.5, pz = Math.sin(wa) * w * 0.5;
    const m = [bx + lx * 0.3, hh * 0.55, bz + lz * 0.3], t = [bx + lx, hh, bz + lz];
    const b0 = [bx - px, 0, bz - pz], b1 = [bx + px, 0, bz + pz], m0 = [m[0] - px * 0.6, m[1], m[2] - pz * 0.6], m1 = [m[0] + px * 0.6, m[1], m[2] + pz * 0.6];
    pos.push(...b0, ...b1, ...m1, ...b0, ...m1, ...m0, ...m0, ...m1, ...t);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return part(g, null, (_x, y) => { const f = Math.min(1, y / h); return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] + (tip[2] - base[2]) * f]; }, true);
}
function fern(seed: number, base: RGB, tip: RGB) {
  const list: THREE.BufferGeometry[] = []; const fr = 7;
  for (let k = 0; k < fr; k++) {
    const a = (k / fr) * Math.PI * 2 + h2(k, seed) * 0.5, L = 0.8 + h2(k + 3, seed) * 0.5; const pos: number[] = []; let prev: number[][] | null = null;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, r = t * L, y = Math.sin(t * Math.PI * 0.85) * 0.45 * L + 0.05, w = Math.sin(t * Math.PI) * 0.16 * L + 0.01;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, px = -Math.sin(a) * w, pz = Math.cos(a) * w; const cur = [[cx - px, y, cz - pz], [cx + px, y, cz + pz]];
      if (prev) pos.push(...prev[0], ...prev[1], ...cur[1], ...prev[0], ...cur[1], ...cur[0]);
      prev = cur;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); list.push(g);
  }
  return part(merge(list), null, (x, _y, z) => { const f = Math.min(1, Math.hypot(x, z) / 1.1); return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] + (tip[2] - base[2]) * f]; }, true);
}
function bush(seed: number, leaf: RGB) {
  const list: THREE.BufferGeometry[] = []; const nb = 3 + Math.floor(h2(seed, 1) * 3);
  for (let k = 0; k < nb; k++) {
    const r = 0.45 + h2(k, seed) * 0.4, a = h2(k + 5, seed) * 6.28, d = k ? 0.35 + h2(k + 9, seed) * 0.35 : 0;
    list.push(part(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.35, seed + k), M(Math.cos(a) * d, r * 0.85 + (k ? 0 : 0.15), Math.sin(a) * d, 0, 0, 0, r, r * 0.85, r), (_x, y) => shade(leaf, 0.55 + 0.6 * Math.min(1, Math.max(0, y / 1.3))), false));
  }
  return merge(list);
}
function shrub(seed: number, wood: RGB, leaf: RGB | null) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * 6.28 + h2(k, seed), tilt = 0.35 + h2(k + 2, seed) * 0.6, L = 0.7 + h2(k + 4, seed) * 0.6;
    const m = M(0, 0, 0, 0, a, tilt); const g = new THREE.CylinderGeometry(0.014, 0.034, L, 4); g.translate(0, L / 2, 0);
    list.push(part(g, m, () => wood));
    if (leaf) { const tip = new THREE.Vector3(0, L, 0).applyMatrix4(m); list.push(part(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.4, seed + k), M(tip.x, tip.y, tip.z, 0, 0, 0, 0.22, 0.17, 0.22), () => shade(leaf, 0.85 + h2(k, seed) * 0.3))); }
  }
  return merge(list);
}
function stone(seed: number, c: RGB, flat = 0.6, amp = 0.45, snow = false) {
  return part(lumpy(new THREE.IcosahedronGeometry(1, 1), amp, seed), M(0, 0.25, 0, 0, 0, 0, 1, flat, 1), (x, y, z) => {
    const v = 0.8 + h2(Math.round(x * 4), Math.round(y * 4 + z * 2)) * 0.35;
    if (snow && y > 0.3 + Math.sin(x * 5 + z * 3) * 0.08) return [0.92, 0.95, 1.0];
    return shade(c, v);
  });
}
function pebbles(seed: number, c: RGB) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) { const a = h2(k, seed) * 6.28, d = Math.sqrt(h2(k + 3, seed)) * 0.6, r = 0.07 + h2(k + 6, seed) * 0.12; list.push(part(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.4, seed + k), M(Math.cos(a) * d, r * 0.4, Math.sin(a) * d, 0, a, 0, r, r * 0.6, r), () => shade(c, 0.75 + h2(k, seed + 1) * 0.5))); }
  return merge(list);
}
function shards(seed: number, c: RGB, n = 3, r = 0.22, h = 1.2, sides = 5) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const hh = h * (0.6 + h2(k, seed) * 0.6), rr = r * (0.7 + h2(k + 2, seed) * 0.5); const a = (k / n) * 6.28 + h2(k + 4, seed);
    const body = new THREE.CylinderGeometry(rr, rr * 1.1, hh * 0.72, sides); body.translate(0, hh * 0.36, 0);
    const tip = new THREE.ConeGeometry(rr, hh * 0.28, sides); tip.translate(0, hh * 0.86, 0);
    const m = M(Math.cos(a) * r * 1.2, 0, Math.sin(a) * r * 1.2, Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    list.push(part(body, m, () => shade(c, 0.85)), part(tip, m, () => shade(c, 1.15)));
  }
  return merge(list);
}
function fungus(seed: number) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = h2(k, seed) * 6.28, d = k ? 0.2 + h2(k + 2, seed) * 0.4 : 0, s = 0.6 + h2(k + 5, seed) * 0.7;
    const st = new THREE.CylinderGeometry(0.05, 0.07, 0.32, 6); st.translate(0, 0.16, 0);
    const cap = new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 0.3, 0);
    const m = M(Math.cos(a) * d, 0, Math.sin(a) * d, 0, 0, 0, s);
    list.push(part(st, m, () => [0.82, 0.8, 0.7]), part(cap, m, () => [0.62, 0.86, 0.36]));
  }
  return merge(list);
}

interface Built { geo: THREE.BufferGeometry; h: number }
const GEO: Record<string, (s: number) => Built> = {
  grassDry: s => ({ geo: blades(16, 0.6, 0.06, 0.5, s, [0.42, 0.34, 0.2], [0.86, 0.75, 0.48], 0.4), h: 0.6 }),
  grass: s => ({ geo: blades(24, 0.7, 0.07, 0.45, s, [0.13, 0.24, 0.07], [0.46, 0.7, 0.26], 0.6), h: 0.7 }),
  grassOlive: s => ({ geo: blades(20, 0.65, 0.07, 0.4, s, [0.24, 0.26, 0.12], [0.66, 0.66, 0.36], 0.5), h: 0.65 }),
  grassViolet: s => ({ geo: blades(16, 0.55, 0.06, 0.35, s, [0.2, 0.14, 0.3], [0.62, 0.48, 0.86], 0.45), h: 0.55 }),
  reeds: s => ({ geo: blades(12, 1.8, 0.05, 0.12, s, [0.28, 0.3, 0.16], [0.72, 0.7, 0.42], 0.3), h: 1.8 }),
  flowers: s => {
    const g = blades(8, 0.42, 0.06, 0.3, s, [0.14, 0.26, 0.08], [0.4, 0.62, 0.24]); const heads: THREE.BufferGeometry[] = [g];
    const pal: RGB[] = [[0.95, 0.35, 0.5], [0.98, 0.85, 0.25], [0.95, 0.95, 0.92], [0.6, 0.45, 0.95]];
    for (let k = 0; k < 5; k++) { const a = h2(k, s) * 6.28, d = 0.1 + h2(k + 1, s) * 0.12; const c = pal[(k + Math.floor(s)) % pal.length]; heads.push(part(new THREE.OctahedronGeometry(0.05, 0), M(Math.cos(a) * d, 0.32 + h2(k + 2, s) * 0.12, Math.sin(a) * d), () => c)); }
    return { geo: merge(heads), h: 0.45 };
  },
  fern: s => ({ geo: fern(s, [0.08, 0.2, 0.05], [0.32, 0.6, 0.18]), h: 0.55 }),
  bush: s => ({ geo: bush(s, [0.2, 0.38, 0.12]), h: 1.4 }),
  bushOlive: s => ({ geo: bush(s, [0.36, 0.38, 0.2]), h: 1.4 }),
  shrubDry: s => ({ geo: shrub(s, [0.36, 0.28, 0.2], [0.46, 0.46, 0.3]), h: 1.2 }),
  shrubDead: s => ({ geo: shrub(s, [0.1, 0.09, 0.08], null), h: 1.2 }),
  shrubFrost: s => ({ geo: shrub(s, [0.3, 0.26, 0.24], [0.85, 0.9, 0.95]), h: 1.2 }),
  stone: s => ({ geo: stone(s, [0.55, 0.42, 0.32]), h: 0.8 }),
  stoneGrey: s => ({ geo: stone(s, [0.42, 0.42, 0.4]), h: 0.8 }),
  stoneViolet: s => ({ geo: stone(s, [0.36, 0.3, 0.44]), h: 0.8 }),
  snowRock: s => ({ geo: stone(s, [0.32, 0.36, 0.42], 0.7, 0.45, true), h: 0.9 }),
  scoria: s => ({ geo: stone(s, [0.12, 0.1, 0.09], 0.65, 0.7), h: 0.8 }),
  ember: s => ({ geo: stone(s, [0.1, 0.08, 0.07], 0.75, 0.55), h: 0.9 }),
  pebbles: s => ({ geo: pebbles(s, [0.5, 0.4, 0.3]), h: 0.2 }),
  pebblesGrey: s => ({ geo: pebbles(s, [0.45, 0.45, 0.43]), h: 0.2 }),
  iceShard: s => ({ geo: shards(s, [0.62, 0.82, 0.98]), h: 1.3 }),
  crystal: s => ({ geo: shards(s, [0.78, 0.55, 1.0], 5, 0.12, 1.1, 6), h: 1.2 }),
  fungus: s => ({ geo: fungus(s), h: 0.4 }),
};

interface CoverType { geo: string; perKm: number; dMin: number; dMax: number; view: number; scale: [number, number]; cols?: string[]; slope: number; shadow?: boolean; wind?: number; cluster: number; clusterR: number; sink?: number; align?: number; blade?: boolean; rough?: number; glow?: 'crystal' | 'fungus' | 'ember' | 'ice'; bias?: number }
const W: string[] = ['#ffffff', '#ece6da', '#dcd4c6'];
const SETS: Record<string, CoverType[]> = {
  desert: [
    { geo: 'shrubDry', perKm: 520, bias: 2.1, dMin: 4, dMax: 320, view: 430, scale: [0.7, 1.7], cols: W, slope: 0.5, shadow: true, wind: 0.03, cluster: 3, clusterR: 12 },
    { geo: 'stone', perKm: 700, bias: 2.1, dMin: 2, dMax: 420, view: 380, scale: [0.25, 1.1], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
    { geo: 'pebbles', perKm: 520, bias: 2.1, dMin: 0.6, dMax: 45, view: 110, scale: [0.6, 1.4], cols: W, slope: 0.8, cluster: 3, clusterR: 4, align: 1 },
    { geo: 'grassDry', perKm: 1800, bias: 2.1, dMin: 2, dMax: 150, view: 150, scale: [0.7, 1.5], cols: W, slope: 0.55, wind: 0.09, cluster: 6, clusterR: 5, blade: true },
  ],
  ice: [
    { geo: 'snowRock', perKm: 420, bias: 2.1, dMin: 2, dMax: 420, view: 400, scale: [0.4, 1.6], cols: W, slope: 0.9, cluster: 4, clusterR: 8, sink: 0.25, align: 0.8 },
    { geo: 'iceShard', perKm: 220, bias: 2.1, dMin: 3, dMax: 220, view: 260, scale: [0.6, 1.8], cols: W, slope: 0.6, cluster: 3, clusterR: 5, rough: 0.12, glow: 'ice' },
    { geo: 'shrubFrost', perKm: 140, bias: 2.1, dMin: 4, dMax: 240, view: 260, scale: [0.6, 1.3], cols: W, slope: 0.5, wind: 0.03, cluster: 3, clusterR: 8 },
    { geo: 'pebblesGrey', perKm: 320, bias: 2.1, dMin: 0.6, dMax: 40, view: 100, scale: [0.6, 1.3], cols: W, slope: 0.8, cluster: 3, clusterR: 4, align: 1 },
  ],
  jungle: [
    { geo: 'grass', perKm: 6000, bias: 2.1, dMin: 1.5, dMax: 170, view: 150, scale: [1.0, 2.0], cols: W, slope: 0.7, wind: 0.12, cluster: 8, clusterR: 6, blade: true },
    { geo: 'fern', perKm: 650, bias: 2.1, dMin: 2, dMax: 220, view: 210, scale: [0.8, 1.8], cols: W, slope: 0.7, wind: 0.07, cluster: 4, clusterR: 5, blade: true },
    { geo: 'bush', perKm: 420, bias: 2.1, dMin: 4, dMax: 380, view: 430, scale: [0.8, 2.2], cols: W, slope: 0.7, shadow: true, wind: 0.04, cluster: 3, clusterR: 8 },
    { geo: 'flowers', perKm: 520, bias: 2.1, dMin: 1.5, dMax: 110, view: 110, scale: [0.8, 1.4], cols: W, slope: 0.6, wind: 0.1, cluster: 5, clusterR: 4, blade: true },
  ],
  malastare: [
    { geo: 'reeds', perKm: 1300, bias: 2.1, dMin: 2, dMax: 200, view: 190, scale: [0.7, 1.4], cols: W, slope: 0.5, wind: 0.25, cluster: 7, clusterR: 6, blade: true },
    { geo: 'grassOlive', perKm: 1700, bias: 2.1, dMin: 1.5, dMax: 150, view: 150, scale: [0.8, 1.6], cols: W, slope: 0.6, wind: 0.1, cluster: 7, clusterR: 6, blade: true },
    { geo: 'fungus', perKm: 140, bias: 2.1, dMin: 3, dMax: 160, view: 190, scale: [0.8, 2.2], cols: W, slope: 0.5, cluster: 3, clusterR: 4, glow: 'fungus' },
    { geo: 'stoneGrey', perKm: 320, bias: 2.1, dMin: 2, dMax: 420, view: 380, scale: [0.3, 1.2], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
    { geo: 'bushOlive', perKm: 110, bias: 2.1, dMin: 5, dMax: 300, view: 400, scale: [0.8, 1.8], cols: W, slope: 0.6, shadow: true, wind: 0.04, cluster: 3, clusterR: 8 },
  ],
  lava: [
    { geo: 'scoria', perKm: 650, bias: 2.1, dMin: 2, dMax: 450, view: 430, scale: [0.3, 1.5], cols: W, slope: 0.9, cluster: 5, clusterR: 8, sink: 0.25, align: 0.8, rough: 0.95 },
    { geo: 'ember', perKm: 140, bias: 2.1, dMin: 3, dMax: 260, view: 320, scale: [0.4, 1.3], cols: W, slope: 0.8, cluster: 3, clusterR: 6, sink: 0.25, glow: 'ember' },
    { geo: 'shrubDead', perKm: 90, bias: 2.1, dMin: 4, dMax: 220, view: 240, scale: [0.6, 1.4], cols: W, slope: 0.5, cluster: 2, clusterR: 8 },
  ],
  crystal: [
    { geo: 'crystal', perKm: 260, bias: 2.1, dMin: 2, dMax: 300, view: 340, scale: [0.6, 2.4], cols: W, slope: 0.6, cluster: 3, clusterR: 6, rough: 0.1, glow: 'crystal' },
    { geo: 'stoneViolet', perKm: 320, bias: 2.1, dMin: 2, dMax: 420, view: 380, scale: [0.3, 1.2], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
    { geo: 'grassViolet', perKm: 900, bias: 2.1, dMin: 1.5, dMax: 120, view: 140, scale: [0.8, 1.5], cols: W, slope: 0.6, wind: 0.08, cluster: 6, clusterR: 5, blade: true },
  ],
  aquilaris: [
    { geo: 'grass', perKm: 1100, bias: 2.1, dMin: 2, dMax: 160, view: 150, scale: [0.8, 1.5], cols: W, slope: 0.6, wind: 0.12, cluster: 6, clusterR: 5, blade: true },
    { geo: 'bush', perKm: 170, bias: 2.1, dMin: 4, dMax: 300, view: 400, scale: [0.8, 1.8], cols: W, slope: 0.6, shadow: true, wind: 0.05, cluster: 3, clusterR: 8 },
    { geo: 'stoneGrey', perKm: 260, bias: 2.1, dMin: 2, dMax: 400, view: 360, scale: [0.3, 1.2], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
  ],
};
SETS.mesa = SETS.desert;

function coverMaterial(t: CoverType, H: number) {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, side: t.blade ? THREE.DoubleSide : THREE.FrontSide });
  mat.roughness = t.rough ?? 0.86; mat.metalness = 0;
  if (t.wind) {
    const k = clamp(positionGeometry.y.div(H), 0, 1); const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.05));
    mat.positionNode = positionLocal.add(vec3(sin(time.mul(1.9).add(ph)), 0, cos(time.mul(1.4).add(ph.mul(1.3)))).mul(k.mul(k)).mul(t.wind));
  }
  if (!t.shadow) { // dithered distance fade (opaque, no sorting)
    mat.opacityNode = oneMinus(smoothstep(t.view * 0.72, t.view, length(positionView)));
    mat.alphaTestNode = interleavedGradientNoise(screenCoordinate.xy).mul(0.96).add(0.02);
  }
  if (t.glow === 'crystal') mat.emissiveNode = vertexColor().mul(0.5);
  else if (t.glow === 'ice') mat.emissiveNode = color('#3a8ac8').mul(0.22);
  else if (t.glow === 'fungus') mat.emissiveNode = color('#9aff5a').mul(smoothstep(0.24, 0.3, positionGeometry.y)).mul(0.3);
  else if (t.glow === 'ember') mat.emissiveNode = color('#ff5010').mul(smoothstep(0.86, 0.96, sin(positionGeometry.x.mul(9).add(positionGeometry.z.mul(5))).mul(sin(positionGeometry.y.mul(11).add(positionGeometry.x.mul(3)))).mul(0.5).add(0.5))).mul(2.2);
  return mat;
}

export function buildGroundCover(td: TrackData, theme: ThemeDef, gfx: GfxSettings, field: TerrainField, waterY: number, rng: () => number, group: THREE.Group, disp: Disp) {
  const set = SETS[theme.id];
  const cells: { mesh: THREE.InstancedMesh; x: number; z: number; view: number }[] = [];
  if (!set) return { update: (cam: THREE.Vector3) => { void cam; }, count: 0 };
  const CELL = 260; const S = td.main.samples, N = S.length; const km = (N * 2) / 1000; const det = gfx.detail;
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  let total = 0;
  set.forEach((t, ti) => {
    const built = GEO[t.geo](17 + ti * 31); const mat = coverMaterial(t, built.h); disp.push(built.geo, mat);
    const byCell = new Map<string, { m: THREE.Matrix4[]; c: THREE.Color[]; x: number; z: number }>();
    const farM: THREE.Matrix4[] | null = /shrub|bush/i.test(t.geo) && t.view >= 240 ? [] : null; // session 15: far billboards for shrubs / bushes
    const want = Math.round(t.perKm * km * det); let placed = 0, guard = 0;
    while (placed < want && guard++ < want * 3) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const e = t.dMin + (t.dMax - t.dMin) * Math.pow(rng(), t.bias ?? 1.6);
      const cx = s.x + s.rx * side * (s.hw + e) + s.tx * (rng() - 0.5) * 10, cz = s.z + s.rz * side * (s.hw + e) + s.tz * (rng() - 0.5) * 10;
      const k = 1 + Math.floor(rng() * t.cluster * 2);
      for (let j = 0; j < k && placed < want; j++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * t.clusterR; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (field.distToTrack(x, z) < t.dMin * 0.7 + 0.4) continue;
        const y = field.heightAt(x, z); if (y < waterY + 0.4) continue;
        const hx = field.heightAt(x + 1.2, z) - y, hz = field.heightAt(x, z + 1.2) - y; if (Math.hypot(hx, hz) / 1.2 > t.slope) continue;
        const sc = t.scale[0] + (t.scale[1] - t.scale[0]) * Math.pow(rng(), 1.5) * (1 - 0.35 * r / Math.max(1, t.clusterR));
        nrm.set(-hx / 1.2, 1, -hz / 1.2).normalize(); q.setFromUnitVectors(up, nrm); q.slerp(qy.identity(), 1 - (t.align ?? 0.35));
        qy.setFromAxisAngle(up, rng() * Math.PI * 2); q.multiply(qy);
        const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let cell = byCell.get(key);
        if (!cell) { cell = { m: [], c: [], x: (Math.floor(x / CELL) + 0.5) * CELL, z: (Math.floor(z / CELL) + 0.5) * CELL }; byCell.set(key, cell); }
        cell.m.push(new THREE.Matrix4().compose(pos.set(x, y - (t.sink ?? 0.02) * sc, z), q, scl.set(sc, sc * (0.85 + rng() * 0.3), sc))); if (farM) farM.push(cell.m[cell.m.length - 1]);
        const cc = new THREE.Color(t.cols ? t.cols[Math.floor(rng() * t.cols.length)] : '#ffffff').multiplyScalar(0.85 + rng() * 0.25); cell.c.push(cc);
        placed++;
      }
    }
    for (const cell of byCell.values()) {
      const im = new THREE.InstancedMesh(built.geo, mat, cell.m.length);
      cell.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cell.c[i]); });
      im.castShadow = !!t.shadow; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im);
      cells.push({ mesh: im, x: cell.x, z: cell.z, view: t.view + CELL * 0.75 });
    }
    if (farM && farM.length) { // one-draw billboards beyond the cell view distance, tinted with the mean vertex colour of the real mesh
      const ca = built.geo.attributes.color as THREE.BufferAttribute | undefined; const tc = new THREE.Color(0.5, 0.5, 0.5);
      if (ca) { let r = 0, g = 0, b = 0; for (let i = 0; i < ca.count; i++) { r += ca.getX(i); g += ca.getY(i); b += ca.getZ(i); } tc.setRGB(r / ca.count, g / ca.count, b / ca.count); }
      const imp = buildImpostors(group, farM, 'bush', built.h * 1.6, built.h * 1.1, t.view - 50, tc.multiplyScalar(0.85), 90); if (imp) disp.push(imp);
    }
    total += placed;
  });
  const update = (cam: THREE.Vector3) => { for (const c of cells) { const dx = c.x - cam.x, dz = c.z - cam.z; c.mesh.visible = dx * dx + dz * dz < c.view * c.view; } };
  void hex;
  return { update, count: total };
}
