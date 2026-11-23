import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import type { TerrainField } from './terrain';
import type { TrackData } from './trackBuilder';
import type { TexSet } from './textures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, clamp, color, cos, interleavedGradientNoise, length, normalWorldGeometry, oneMinus, positionGeometry, positionLocal, positionView, positionWorld, pow, screenCoordinate, sin, smoothstep, texture, time, uv, vec3, vertexColor } = TSL;

/**
 * Ground cover: grass, reeds, ferns, flowers, bushes, desert agave, dry scrub, mossy logs, stones, pebbles,
 * ice shards, crystals, glowing fungi, volcanic scoria.
 *  - Fast placement: uses TerrainField.sampleCover() (1 spatial lookup per instance instead of 4 → ~3× faster load).
 *  - Two-tier LOD for bushes/shrubs: crisp 3D geometry in near range (≤ 185 m) + lightweight crossed-card
 *    botanical impostor silhouettes from 155 m out to 540 m with seamless dithered crossover (no sorting, no pop).
 *  - Stored per 150 m cell as InstancedMesh → frustum + distance culling, GPU wind sway.
 */
type Disp = { dispose: () => void }[];
type RGB = [number, number, number];
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

function part(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, colFn: (x: number, y: number, z: number) => RGB, upNormals = false, keepUv = false) {
  const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose();
  if (m) ng.applyMatrix4(m);
  if (ng.attributes.uv && !keepUv) ng.deleteAttribute('uv');
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

/** Clean 8-triangle volumetric dome impostor for distant bushes (zero crossed-plane Z-fighting!) */
function bushImpostor(w: number, h: number, baseCol: RGB, topCol: RGB) {
  const g = new THREE.SphereGeometry(w, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.55);
  g.scale(1, h / Math.max(0.1, w), 1);
  return part(g, null, (_x, y) => {
    const f = Math.min(1, Math.max(0, y / h));
    return [baseCol[0] + (topCol[0] - baseCol[0]) * f, baseCol[1] + (topCol[1] - baseCol[1]) * f, baseCol[2] + (topCol[2] - baseCol[2]) * f];
  }, false);
}

// ------------------------------------------------------------------ geometry library
function blades(n: number, h: number, w: number, lean: number, seed: number, base: RGB, tip: RGB, spread = 0.18) {
  const pos: number[] = [];
  for (let b = 0; b < n; b++) {
    const a = h2(b, seed) * Math.PI * 2, r = Math.sqrt(h2(b + 7, seed)) * spread; const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const hh = h * (0.55 + h2(b + 3, seed) * 0.6); const la = a + (h2(b + 11, seed) - 0.5) * 1.4; const L = lean * hh * (0.5 + h2(b + 5, seed));
    const lx = Math.cos(la) * L, lz = Math.sin(la) * L; const wa = la + Math.PI / 2; const px = Math.cos(wa) * w * 0.5, pz = Math.sin(wa) * w * 0.5;
    const m = [bx + lx * 0.34, hh * 0.56, bz + lz * 0.34], t = [bx + lx, hh, bz + lz];
    const b0 = [bx - px, 0, bz - pz], b1 = [bx + px, 0, bz + pz], m0 = [m[0] - px * 0.58, m[1], m[2] - pz * 0.58], m1 = [m[0] + px * 0.58, m[1], m[2] + pz * 0.58];
    pos.push(...b0, ...b1, ...m1, ...b0, ...m1, ...m0, ...m0, ...m1, ...t);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return part(g, null, (_x, y) => { const f = Math.min(1, y / h); return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] + (tip[2] - base[2]) * f]; }, true);
}
/** Fern (2026-11-23, `TODO.md` section 5 „HQ-Farne"): every frond is ONE arching card of four segments; its outline – the stalk
 *  and some 26 pairs of leaflets – comes from the drawn frond texture (`frondTextures`: u across the frond, v from the stalk to the
 *  tip). An outer ring of eight long fronds that arch outwards and droop, four young ones standing steeper in the middle.
 *  96 triangles (the plain ribbons before had 90). The vertex colour only shades (dark in the heart of the plant). */
function fern(seed: number, base: RGB, tip: RGB) {
  const pos: number[] = [], uvs: number[] = [], SEG = 4;
  const frond = (a: number, L: number, rise: number, droop: number, wid: number) => {
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa * wid * L, pz = ca * wid * L;
    let r = 0.03, y = 0.02, prev: number[][] | null = null;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, cur = [[ca * r - px, y, sa * r - pz], [ca * r + px, y, sa * r + pz]];
      if (prev) {
        const t0 = (i - 1) / SEG;
        pos.push(...prev[0], ...prev[1], ...cur[1], ...prev[0], ...cur[1], ...cur[0]);
        uvs.push(0, t0, 1, t0, 1, t, 0, t0, 1, t, 0, t);
      }
      prev = cur;
      const ang = rise - (rise + droop) * Math.pow((i + 0.5) / SEG, 1.6); // the frond leaves the stalk steeply, bends over and droops at the tip
      r += Math.cos(ang) * L / SEG; y += Math.sin(ang) * L / SEG;
    }
  };
  for (let k = 0; k < 8; k++) frond((k / 8) * Math.PI * 2 + h2(k, seed) * 0.45, 1.0 + h2(k + 3, seed) * 0.6, 0.95 + h2(k + 5, seed) * 0.2, 0.42 + h2(k + 7, seed) * 0.3, 0.17);
  for (let k = 0; k < 4; k++) frond((k / 4) * Math.PI * 2 + 0.4 + h2(k + 11, seed) * 0.6, 0.6 + h2(k + 13, seed) * 0.3, 1.3 + h2(k + 15, seed) * 0.12, 0.1 + h2(k + 17, seed) * 0.2, 0.15);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
  const out = part(g, null, (x, _y, z) => { const f = Math.min(1, Math.hypot(x, z) / 1.05); return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] + (tip[2] - base[2]) * f]; }, true, true);
  out.computeBoundingSphere(); out.name = 'fern'; // (the name lets the harness find it: view `g_fern`)
  return out;
}

/** Drawn fern frond, 128 × 512, the tip at the top: a stalk with 26 pairs of leaflets – short at the foot, longest at a third of the
 *  length, running out to the tip. Colour and alpha are two canvases, as in the tree atlas (`foliage.ts`); the colour canvas is leaf
 *  green all over, so the smaller mip levels get no dark fringe. */
function frondTextures(disp: Disp) {
  const W = 128, H = 512, N = 26, y0 = H - 5, y1 = 14, mid = W / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  const a = document.createElement('canvas'); a.width = W; a.height = H; const ax = a.getContext('2d')!;
  x.fillStyle = '#3d7424'; x.fillRect(0, 0, W, H); ax.fillStyle = '#000'; ax.fillRect(0, 0, W, H);
  const leaflet = (cx: number, cy: number, len: number, wid: number, ang: number, lig: number) => {
    for (const ctx of [x, ax]) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.3, -wid * 1.25, len * 0.72, -wid * 0.55); ctx.lineTo(len, 0); ctx.lineTo(len * 0.72, wid * 0.55); ctx.quadraticCurveTo(len * 0.3, wid * 1.25, 0, 0);
      if (ctx === ax) ctx.fillStyle = '#fff';
      else { const gr = ctx.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, `hsl(104,52%,${lig - 5}%)`); gr.addColorStop(0.6, `hsl(98,54%,${lig + 3}%)`); gr.addColorStop(1, `hsl(88,56%,${lig + 11}%)`); ctx.fillStyle = gr; }
      ctx.fill();
      if (ctx === x) { ctx.strokeStyle = `hsla(84,46%,${lig + 22}%,0.6)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke(); }
      ctx.restore();
    }
  };
  const step = (y0 - y1) / (N - 1);
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1), y = y0 - step * k;
    const p = t < 0.3 ? 0.4 + 0.6 * Math.sin(t / 0.3 * Math.PI / 2) : 0.05 + 0.95 * Math.pow(Math.cos((t - 0.3) / 0.7 * Math.PI / 2), 0.85);
    const len = W * 0.485 * p, wid = Math.min(step * 0.4, 2 + len * 0.16), lean = 0.42 + 0.3 * t; // the leaflets lean towards the tip, more so near it
    const lig = 27 + 9 * t + (k % 2 ? 2.5 : -2.5);
    leaflet(mid + 1, y, len, wid, -lean, lig); leaflet(mid - 1, y - step * 0.5, len, wid, Math.PI + lean, lig + 1.5);
  }
  for (const ctx of [x, ax]) { // the stalk
    ctx.strokeStyle = ctx === ax ? '#fff' : '#7d9440'; ctx.lineCap = 'round';
    for (let k = 0; k < 8; k++) { ctx.lineWidth = 3.4 - k * 0.3; ctx.beginPath(); ctx.moveTo(mid, y0 + 5 - (y0 - y1) * k / 8); ctx.lineTo(mid, y0 + 5 - (y0 - y1 + 6) * (k + 1) / 8); ctx.stroke(); }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const alpha = new THREE.CanvasTexture(a); alpha.anisotropy = 4;
  disp.push(map, alpha);
  return { map, alpha };
}
function agave(seed: number, base: RGB, tip: RGB) {
  // Desert succulent rosette: thick fleshy sword-leaves radiating from center
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const ring = k < 5 ? 0 : 1;
    const a = (k / (ring ? 6 : 5)) * Math.PI * 2 + h2(k, seed) * 0.4;
    const tilt = ring ? 0.92 : 0.42, L = (ring ? 0.85 : 0.68) * (0.85 + h2(k + 2, seed) * 0.3);
    const g = new THREE.ConeGeometry(0.11, L, 4); g.scale(1, 1, 0.38); g.translate(0, L / 2, 0);
    list.push(part(g, M(0, 0.04, 0, 0, a, tilt), (_x, y) => {
      const f = Math.min(1, y / 0.8);
      return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] + (tip[2] - base[2]) * f];
    }));
  }
  return merge(list);
}
function bush(seed: number, leaf: RGB) {
  const list: THREE.BufferGeometry[] = []; const nb = 4 + Math.floor(h2(seed, 1) * 3);
  for (let k = 0; k < nb; k++) {
    const r = 0.44 + h2(k, seed) * 0.42, a = h2(k + 5, seed) * 6.28, d = k ? 0.34 + h2(k + 9, seed) * 0.38 : 0;
    list.push(part(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.36, seed + k), M(Math.cos(a) * d, r * 0.84 + (k ? 0 : 0.16), Math.sin(a) * d, 0, 0, 0, r, r * 0.84, r), (_x, y) => shade(leaf, 0.5 + 0.68 * Math.min(1, Math.max(0, y / 1.35))), false));
  }
  return merge(list);
}
function shrub(seed: number, wood: RGB, leaf: RGB | null) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * 6.28 + h2(k, seed), tilt = 0.35 + h2(k + 2, seed) * 0.6, L = 0.72 + h2(k + 4, seed) * 0.6;
    const m = M(0, 0, 0, 0, a, tilt); const g = new THREE.CylinderGeometry(0.015, 0.038, L, 4); g.translate(0, L / 2, 0);
    list.push(part(g, m, () => wood));
    if (leaf) { const tip = new THREE.Vector3(0, L, 0).applyMatrix4(m); list.push(part(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.42, seed + k), M(tip.x, tip.y, tip.z, 0, 0, 0, 0.24, 0.18, 0.24), () => shade(leaf, 0.82 + h2(k, seed) * 0.34))); }
  }
  return merge(list);
}
function mossyLog(seed: number) {
  const log = lumpy(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 7, 3).rotateZ(Math.PI / 2), 0.16, seed);
  log.translate(0, 0.16, 0);
  return part(log, null, (x, y) => y > 0.22 + Math.sin(x * 3) * 0.04 ? [0.22, 0.44, 0.14] : [0.28, 0.19, 0.12]);
}
function stone(seed: number, c: RGB, flat = 0.6, amp = 0.45, snow = false) {
  return part(lumpy(new THREE.IcosahedronGeometry(1, 1), amp, seed), M(0, 0.25, 0, 0, 0, 0, 1, flat, 1), (x, y, z) => {
    const v = 0.78 + h2(Math.round(x * 4), Math.round(y * 4 + z * 2)) * 0.38;
    if (snow && y > 0.28 + Math.sin(x * 5 + z * 3) * 0.08) return [0.92, 0.96, 1.0];
    return shade(c, v);
  });
}
function pebbles(seed: number, c: RGB) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) { const a = h2(k, seed) * 6.28, d = Math.sqrt(h2(k + 3, seed)) * 0.6, r = 0.07 + h2(k + 6, seed) * 0.12; list.push(part(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.4, seed + k), M(Math.cos(a) * d, r * 0.4, Math.sin(a) * d, 0, a, 0, r, r * 0.6, r), () => shade(c, 0.74 + h2(k, seed + 1) * 0.52))); }
  return merge(list);
}
function shards(seed: number, c: RGB, n = 3, r = 0.22, h = 1.2, sides = 5) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const hh = h * (0.6 + h2(k, seed) * 0.6), rr = r * (0.7 + h2(k + 2, seed) * 0.5); const a = (k / n) * 6.28 + h2(k + 4, seed);
    const body = new THREE.CylinderGeometry(rr, rr * 1.12, hh * 0.72, sides); body.translate(0, hh * 0.36, 0);
    const tip = new THREE.ConeGeometry(rr, hh * 0.28, sides); tip.translate(0, hh * 0.86, 0);
    const m = M(Math.cos(a) * r * 1.2, 0, Math.sin(a) * r * 1.2, Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    list.push(part(body, m, () => shade(c, 0.84)), part(tip, m, () => shade(c, 1.18)));
  }
  return merge(list);
}
function fungus(seed: number) {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = h2(k, seed) * 6.28, d = k ? 0.2 + h2(k + 2, seed) * 0.4 : 0, s = 0.6 + h2(k + 5, seed) * 0.7;
    const st = new THREE.CylinderGeometry(0.05, 0.07, 0.32, 6); st.translate(0, 0.16, 0);
    const cap = new THREE.SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 0.3, 0);
    const m = M(Math.cos(a) * d, 0, Math.sin(a) * d, 0, 0, 0, s);
    list.push(part(st, m, () => [0.82, 0.8, 0.7]), part(cap, m, () => [0.62, 0.88, 0.36]));
  }
  return merge(list);
}

/** `rock` = the stone's own colour: such a piece gets the world's rock photo set on top (see `coverMaterial`). */
interface Built { geo: THREE.BufferGeometry; lod?: THREE.BufferGeometry; h: number; rock?: RGB }
const rockOf = (c: RGB, mk: (c: RGB) => THREE.BufferGeometry, h: number): Built => ({ geo: mk(c), h, rock: c });
const GEO: Record<string, (s: number) => Built> = {
  grassDry: s => ({ geo: blades(11, 0.62, 0.075, 0.5, s, [0.42, 0.34, 0.2], [0.88, 0.76, 0.48], 0.42), h: 0.62 }),
  grass: s => ({ geo: blades(14, 0.72, 0.09, 0.45, s, [0.12, 0.24, 0.06], [0.46, 0.72, 0.25], 0.6), h: 0.72 }),
  grassOlive: s => ({ geo: blades(13, 0.66, 0.085, 0.4, s, [0.24, 0.26, 0.12], [0.66, 0.67, 0.36], 0.5), h: 0.66 }),
  grassViolet: s => ({ geo: blades(11, 0.56, 0.075, 0.35, s, [0.2, 0.14, 0.3], [0.64, 0.48, 0.88], 0.45), h: 0.56 }),
  reeds: s => ({ geo: blades(9, 1.85, 0.068, 0.13, s, [0.28, 0.3, 0.16], [0.74, 0.71, 0.42], 0.32), h: 1.85 }),
  flowers: s => {
    const g = blades(8, 0.42, 0.06, 0.3, s, [0.14, 0.26, 0.08], [0.4, 0.62, 0.24]); const heads: THREE.BufferGeometry[] = [g];
    const pal: RGB[] = [[0.95, 0.34, 0.48], [0.98, 0.84, 0.22], [0.96, 0.95, 0.9], [0.62, 0.46, 0.96]];
    for (let k = 0; k < 6; k++) { const a = h2(k, s) * 6.28, d = 0.09 + h2(k + 1, s) * 0.14; const c = pal[(k + Math.floor(s)) % pal.length]; heads.push(part(new THREE.OctahedronGeometry(0.055, 0), M(Math.cos(a) * d, 0.32 + h2(k + 2, s) * 0.14, Math.sin(a) * d, 0, a, 0, 1.2, 0.7, 1.2), () => c)); }
    return { geo: merge(heads), h: 0.46 };
  },
  fern: s => ({ geo: fern(s, [0.42, 0.5, 0.36], [1.0, 1.0, 0.9]), h: 0.6 }),
  agave: s => ({ geo: agave(s, [0.24, 0.34, 0.2], [0.54, 0.62, 0.4]), h: 0.8 }),
  log: s => ({ geo: mossyLog(s), h: 0.4 }),
  bush: s => ({ geo: bush(s, [0.19, 0.39, 0.11]), lod: bushImpostor(0.95, 1.32, [0.1, 0.22, 0.06], [0.28, 0.5, 0.16]), h: 1.4 }),
  bushOlive: s => ({ geo: bush(s, [0.36, 0.38, 0.2]), lod: bushImpostor(0.95, 1.3, [0.2, 0.22, 0.11], [0.46, 0.48, 0.26]), h: 1.4 }),
  shrubDry: s => ({ geo: shrub(s, [0.36, 0.28, 0.2], [0.46, 0.46, 0.3]), lod: bushImpostor(0.85, 1.12, [0.3, 0.24, 0.16], [0.5, 0.48, 0.32]), h: 1.2 }),
  shrubDead: s => ({ geo: shrub(s, [0.11, 0.09, 0.08], null), h: 1.2 }),
  shrubFrost: s => ({ geo: shrub(s, [0.3, 0.26, 0.24], [0.85, 0.91, 0.96]), lod: bushImpostor(0.82, 1.1, [0.34, 0.34, 0.36], [0.86, 0.92, 0.97]), h: 1.2 }),
  stone: s => rockOf([0.55, 0.42, 0.32], c => stone(s, c), 0.8),
  stoneGrey: s => rockOf([0.42, 0.42, 0.4], c => stone(s, c), 0.8),
  stoneViolet: s => rockOf([0.36, 0.3, 0.44], c => stone(s, c), 0.8),
  snowRock: s => rockOf([0.32, 0.36, 0.42], c => stone(s, c, 0.7, 0.45, true), 0.9),
  scoria: s => rockOf([0.12, 0.1, 0.09], c => stone(s, c, 0.65, 0.7), 0.8),
  ember: s => rockOf([0.1, 0.08, 0.07], c => stone(s, c, 0.75, 0.55), 0.9),
  pebbles: s => rockOf([0.5, 0.4, 0.3], c => pebbles(s, c), 0.2),
  pebblesGrey: s => rockOf([0.45, 0.45, 0.43], c => pebbles(s, c), 0.2),
  iceShard: s => ({ geo: shards(s, [0.62, 0.82, 0.98]), h: 1.3 }),
  crystal: s => ({ geo: shards(s, [0.78, 0.55, 1.0], 5, 0.12, 1.1, 6), h: 1.2 }),
  fungus: s => ({ geo: fungus(s), h: 0.4 }),
};

interface CoverType {
  geo: string; perKm: number; dMin: number; dMax: number; view: number; farView?: number;
  scale: [number, number]; cols?: string[]; slope: number; shadow?: boolean; wind?: number;
  cluster: number; clusterR: number; sink?: number; align?: number; blade?: boolean; rough?: number;
  glow?: 'crystal' | 'fungus' | 'ember' | 'ice'; bias?: number;
}
const W: string[] = ['#ffffff', '#ece6da', '#dcd4c6'];
const SETS: Record<string, CoverType[]> = {
  desert: [
    { geo: 'shrubDry', perKm: 520, bias: 2.0, dMin: 4, dMax: 360, view: 185, farView: 520, scale: [0.7, 1.7], cols: W, slope: 0.5, shadow: true, wind: 0.03, cluster: 3, clusterR: 12 },
    { geo: 'agave', perKm: 190, bias: 2.1, dMin: 4, dMax: 180, view: 200, scale: [0.8, 1.6], cols: W, slope: 0.55, cluster: 2, clusterR: 7, wind: 0.02 },
    { geo: 'stone', perKm: 700, bias: 2.1, dMin: 2, dMax: 420, view: 380, scale: [0.25, 1.15], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
    { geo: 'pebbles', perKm: 520, bias: 2.1, dMin: 0.6, dMax: 45, view: 110, scale: [0.6, 1.4], cols: W, slope: 0.8, cluster: 3, clusterR: 4, align: 1 },
    { geo: 'grassDry', perKm: 1800, bias: 2.1, dMin: 2, dMax: 150, view: 150, scale: [0.7, 1.5], cols: W, slope: 0.55, wind: 0.09, cluster: 6, clusterR: 5, blade: true },
  ],
  ice: [
    { geo: 'snowRock', perKm: 420, bias: 2.1, dMin: 2, dMax: 420, view: 400, scale: [0.4, 1.6], cols: W, slope: 0.9, cluster: 4, clusterR: 8, sink: 0.25, align: 0.8 },
    { geo: 'iceShard', perKm: 240, bias: 2.1, dMin: 3, dMax: 230, view: 270, scale: [0.6, 1.85], cols: W, slope: 0.6, cluster: 3, clusterR: 5, rough: 0.1, glow: 'ice' },
    { geo: 'shrubFrost', perKm: 160, bias: 2.0, dMin: 4, dMax: 300, view: 175, farView: 440, scale: [0.6, 1.35], cols: W, slope: 0.5, wind: 0.03, cluster: 3, clusterR: 8 },
    { geo: 'pebblesGrey', perKm: 320, bias: 2.1, dMin: 0.6, dMax: 40, view: 100, scale: [0.6, 1.3], cols: W, slope: 0.8, cluster: 3, clusterR: 4, align: 1 },
  ],
  jungle: [
    { geo: 'grass', perKm: 5800, bias: 2.1, dMin: 1.5, dMax: 170, view: 150, scale: [1.0, 2.0], cols: W, slope: 0.7, wind: 0.12, cluster: 8, clusterR: 6, blade: true },
    { geo: 'fern', perKm: 680, bias: 2.1, dMin: 2, dMax: 220, view: 215, scale: [0.85, 1.85], cols: W, slope: 0.7, wind: 0.07, cluster: 4, clusterR: 5, blade: true },
    { geo: 'bush', perKm: 460, bias: 1.95, dMin: 4, dMax: 430, view: 185, farView: 540, scale: [0.8, 2.3], cols: W, slope: 0.7, shadow: true, wind: 0.04, cluster: 3, clusterR: 8 },
    { geo: 'flowers', perKm: 540, bias: 2.1, dMin: 1.5, dMax: 110, view: 115, scale: [0.8, 1.45], cols: W, slope: 0.6, wind: 0.1, cluster: 5, clusterR: 4, blade: true },
    { geo: 'log', perKm: 85, bias: 2.0, dMin: 4, dMax: 180, view: 210, scale: [0.9, 1.8], cols: W, slope: 0.45, cluster: 1, clusterR: 3, align: 0.9 },
  ],
  malastare: [
    { geo: 'reeds', perKm: 1300, bias: 2.1, dMin: 2, dMax: 200, view: 195, scale: [0.7, 1.45], cols: W, slope: 0.5, wind: 0.25, cluster: 7, clusterR: 6, blade: true },
    { geo: 'grassOlive', perKm: 1700, bias: 2.1, dMin: 1.5, dMax: 150, view: 150, scale: [0.8, 1.6], cols: W, slope: 0.6, wind: 0.1, cluster: 7, clusterR: 6, blade: true },
    { geo: 'fungus', perKm: 155, bias: 2.1, dMin: 3, dMax: 165, view: 195, scale: [0.8, 2.2], cols: W, slope: 0.5, cluster: 3, clusterR: 4, glow: 'fungus' },
    { geo: 'stoneGrey', perKm: 320, bias: 2.1, dMin: 2, dMax: 420, view: 380, scale: [0.3, 1.2], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
    { geo: 'bushOlive', perKm: 140, bias: 1.95, dMin: 5, dMax: 360, view: 185, farView: 500, scale: [0.8, 1.9], cols: W, slope: 0.6, shadow: true, wind: 0.04, cluster: 3, clusterR: 8 },
  ],
  lava: [
    { geo: 'scoria', perKm: 680, bias: 2.1, dMin: 2, dMax: 450, view: 430, scale: [0.3, 1.55], cols: W, slope: 0.9, cluster: 5, clusterR: 8, sink: 0.25, align: 0.8, rough: 0.94 },
    { geo: 'ember', perKm: 155, bias: 2.1, dMin: 3, dMax: 265, view: 330, scale: [0.4, 1.35], cols: W, slope: 0.8, cluster: 3, clusterR: 6, sink: 0.25, glow: 'ember' },
    { geo: 'shrubDead', perKm: 95, bias: 2.1, dMin: 4, dMax: 220, view: 245, scale: [0.6, 1.45], cols: W, slope: 0.5, cluster: 2, clusterR: 8 },
  ],
  crystal: [
    { geo: 'crystal', perKm: 280, bias: 2.1, dMin: 2, dMax: 310, view: 350, scale: [0.6, 2.45], cols: W, slope: 0.6, cluster: 3, clusterR: 6, rough: 0.09, glow: 'crystal' },
    { geo: 'stoneViolet', perKm: 320, bias: 2.1, dMin: 2, dMax: 420, view: 380, scale: [0.3, 1.2], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
    { geo: 'grassViolet', perKm: 920, bias: 2.1, dMin: 1.5, dMax: 125, view: 145, scale: [0.8, 1.55], cols: W, slope: 0.6, wind: 0.08, cluster: 6, clusterR: 5, blade: true },
  ],
  aquilaris: [
    { geo: 'grass', perKm: 1150, bias: 2.1, dMin: 2, dMax: 165, view: 155, scale: [0.8, 1.55], cols: W, slope: 0.6, wind: 0.12, cluster: 6, clusterR: 5, blade: true },
    { geo: 'fern', perKm: 220, bias: 2.1, dMin: 3, dMax: 160, view: 190, scale: [0.8, 1.5], cols: W, slope: 0.6, wind: 0.07, cluster: 3, clusterR: 5, blade: true },
    { geo: 'bush', perKm: 200, bias: 1.95, dMin: 4, dMax: 360, view: 185, farView: 500, scale: [0.8, 1.85], cols: W, slope: 0.6, shadow: true, wind: 0.05, cluster: 3, clusterR: 8 },
    { geo: 'stoneGrey', perKm: 280, bias: 2.1, dMin: 2, dMax: 400, view: 360, scale: [0.3, 1.25], cols: W, slope: 0.9, cluster: 4, clusterR: 6, sink: 0.2, align: 0.8 },
  ],
};
SETS.mesa = SETS.desert;

/** Metres per repeat of the rock photo set on ground-cover stones (the walls use 15 m – a stone of half a metre would show one blurred patch of it). */
const STONE_TILE = 3.5;

function coverMaterial(t: CoverType, H: number, isImpostor = false, tex?: { map: THREE.Texture; alpha: THREE.Texture }, rock?: { set: TexSet; own: RGB }) {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, side: t.blade || isImpostor ? THREE.DoubleSide : THREE.FrontSide });
  mat.roughness = t.rough ?? 0.86; mat.metalness = 0;
  if (tex) mat.map = tex.map;
  if (rock) {
    // Stones and pebbles carry the rock of the world's walls (2026-11-23). Flat vertex colours made them pale lumps beside the
    // photo-textured rock rows and spires – in the shade under a blue sky a desaturated brown turns light grey-blue. The set is
    // projected in world space from the three axes (the pieces have no UVs). The vertex colour stays as a tint: divided by the
    // stone's own mean colour it is ≈ 1 with the facet-to-facet variation, white snow caps, and HALF the hue of the piece (`corr`
    // takes the other half out: with the full hue the pebbles on orange sandstone turned signal orange).
    const k = 1 / STONE_TILE, pw = positionWorld, bw = pow(abs(normalWorldGeometry), vec3(4.0)), w = bw.div(bw.x.add(bw.y).add(bw.z).add(1e-5));
    const m = rock.set.map, mean = (rock.own[0] + rock.own[1] + rock.own[2]) / 3, corr = rock.own.map(c => Math.sqrt(mean / c) / mean);
    mat.colorNode = texture(m, pw.zy.mul(k)).rgb.mul(w.x).add(texture(m, pw.xz.mul(k)).rgb.mul(w.y)).add(texture(m, pw.xy.mul(k)).rgb.mul(w.z)).mul(vec3(corr[0], corr[1], corr[2]));
  }
  // Outline of a textured card (fern frond). The step is steep: far away the smaller mip levels hold 0.5 … 0.7 over the whole frond –
  // read as is, the dither below would thin the plant out to a haze.
  const cut = tex ? smoothstep(0.25, 0.55, texture(tex.alpha, uv()).r) : null;
  if (t.wind && !isImpostor) {
    const k = clamp(positionGeometry.y.div(H), 0, 1); const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.05));
    mat.positionNode = positionLocal.add(vec3(sin(time.mul(1.9).add(ph)), 0, cos(time.mul(1.4).add(ph.mul(1.3)))).mul(k.mul(k)).mul(t.wind));
  }
  const d = length(positionView);
  if (isImpostor) {
    const far = t.farView ?? 500;
    mat.opacityNode = oneMinus(smoothstep(far * 0.78, far, d));
    mat.alphaTestNode = interleavedGradientNoise(screenCoordinate.xy).mul(0.96).add(0.02);
  } else if (!t.shadow) {
    const fade = oneMinus(smoothstep(t.view * 0.74, t.view, d));
    mat.opacityNode = cut ? cut.mul(fade) : fade;
    mat.alphaTestNode = interleavedGradientNoise(screenCoordinate.xy).mul(0.96).add(0.02);
  }
  if (t.glow === 'crystal') mat.emissiveNode = vertexColor().mul(0.5);
  else if (t.glow === 'ice') mat.emissiveNode = color('#3a8ac8').mul(0.22);
  else if (t.glow === 'fungus') mat.emissiveNode = color('#9aff5a').mul(smoothstep(0.24, 0.3, positionGeometry.y)).mul(0.32);
  else if (t.glow === 'ember') mat.emissiveNode = color('#ff5010').mul(smoothstep(0.86, 0.96, sin(positionGeometry.x.mul(9).add(positionGeometry.z.mul(5))).mul(sin(positionGeometry.y.mul(11).add(positionGeometry.x.mul(3)))).mul(0.5).add(0.5))).mul(2.1);
  return mat;
}

interface CoverCell { mesh: THREE.InstancedMesh; x: number; z: number; min2: number; max2: number; shadow2: number }

export function buildGroundCover(td: TrackData, theme: ThemeDef, gfx: GfxSettings, field: TerrainField, waterY: number, rng: () => number, group: THREE.Group, disp: Disp, rockSet?: TexSet) {
  const t0 = performance.now();
  const set = SETS[theme.id];
  const cells: CoverCell[] = [];
  if (!set) return { update: (cam: THREE.Vector3) => { void cam; }, count: 0, ms: 0 };
  // 260 m cells cut total InstancedMesh count & draw calls by ~3× while keeping tight frustum & distance culling
  const CELL = 260, PAD = CELL * 0.72; const S = td.main.samples, N = S.length; const km = (N * 2) / 1000; const det = Math.min(1.15, gfx.detail);
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const cov = { y: 0, edge: 0, gx: 0, gz: 0 };
  let total = 0;
  set.forEach((t, ti) => {
    const built = GEO[t.geo](17 + ti * 31);
    const mat = coverMaterial(t, built.h, false, t.geo === 'fern' ? frondTextures(disp) : undefined, built.rock && rockSet ? { set: rockSet, own: built.rock } : undefined); disp.push(built.geo, mat);
    if (built.rock) built.geo.name = t.geo; // (harness view `g_<name>`)
    const hasLod = !!(built.lod && t.farView);
    const lodMat = hasLod ? coverMaterial(t, built.h, true) : null;
    if (hasLod) disp.push(built.lod!, lodMat!);

    const byCell = new Map<string, { m: THREE.Matrix4[]; c: THREE.Color[]; x: number; z: number }>();
    const want = Math.round(t.perKm * km * det); let placed = 0, guard = 0;
    const minEdge = t.dMin * 0.7 + 0.4, slope2 = t.slope * t.slope;
    while (placed < want && guard++ < want * 3) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const e = t.dMin + (t.dMax - t.dMin) * Math.pow(rng(), t.bias ?? 1.6);
      const cx = s.x + s.rx * side * (s.hw + e) + s.tx * (rng() - 0.5) * 10, cz = s.z + s.rz * side * (s.hw + e) + s.tz * (rng() - 0.5) * 10;
      const k = 1 + Math.floor(rng() * t.cluster * 2);
      for (let j = 0; j < k && placed < want; j++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * t.clusterR; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        field.sampleCover(x, z, cov);
        if (cov.edge < minEdge || cov.y < waterY + 0.4 || cov.gx * cov.gx + cov.gz * cov.gz > slope2) continue;
        const sc = t.scale[0] + (t.scale[1] - t.scale[0]) * Math.pow(rng(), 1.5) * (1 - 0.35 * r / Math.max(1, t.clusterR));
        nrm.set(-cov.gx, 1, -cov.gz).normalize(); q.setFromUnitVectors(up, nrm); q.slerp(qy.identity(), 1 - (t.align ?? 0.35));
        qy.setFromAxisAngle(up, rng() * Math.PI * 2); q.multiply(qy);
        const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let cell = byCell.get(key);
        if (!cell) { cell = { m: [], c: [], x: (Math.floor(x / CELL) + 0.5) * CELL, z: (Math.floor(z / CELL) + 0.5) * CELL }; byCell.set(key, cell); }
        cell.m.push(new THREE.Matrix4().compose(pos.set(x, cov.y - (t.sink ?? 0.02) * sc, z), q, scl.set(sc, sc * (0.85 + rng() * 0.3), sc)));
        const cc = new THREE.Color(t.cols ? t.cols[Math.floor(rng() * t.cols.length)] : '#ffffff').multiplyScalar(0.85 + rng() * 0.25); cell.c.push(cc);
        placed++;
      }
    }
    const sh2 = t.shadow ? (115 + PAD) ** 2 : 0;
    const switchD = t.view + PAD * 0.45;
    for (const cell of byCell.values()) {
      const im = new THREE.InstancedMesh(built.geo, mat, cell.m.length);
      cell.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cell.c[i]); });
      im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im);
      cells.push({ mesh: im, x: cell.x, z: cell.z, min2: 0, max2: hasLod ? switchD * switchD : (t.view + PAD) ** 2, shadow2: sh2 });
      if (hasLod) {
        // Strict non-overlapping cell handoff: near 3D mesh and far dome impostor are NEVER visible at the same time!
        const lim = new THREE.InstancedMesh(built.lod!, lodMat!, cell.m.length);
        cell.m.forEach((m, i) => { lim.setMatrixAt(i, m); lim.setColorAt(i, cell.c[i]); });
        lim.castShadow = false; lim.receiveShadow = true; lim.computeBoundingSphere(); group.add(lim);
        const maxD = t.farView! + PAD;
        cells.push({ mesh: lim, x: cell.x, z: cell.z, min2: switchD * switchD, max2: maxD * maxD, shadow2: 0 });
      }
    }
    total += placed;
  });
  const update = (cam: THREE.Vector3) => {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]; const dx = c.x - cam.x, dz = c.z - cam.z, d2 = dx * dx + dz * dz;
      const vis = d2 >= c.min2 && d2 < c.max2;
      c.mesh.visible = vis;
      if (c.shadow2 > 0) c.mesh.castShadow = vis && d2 < c.shadow2;
    }
  };
  return { update, count: total, ms: Math.round(performance.now() - t0) };
}
