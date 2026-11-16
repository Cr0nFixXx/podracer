import * as THREE from 'three';
import type { TexKind } from './data';

// ---------- tileable noise ----------
class TileNoise {
  perm = new Uint8Array(512);
  vals = new Float32Array(256);
  constructor(seed: number) {
    let s = seed >>> 0;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) this.vals[i] = r();
  }
  h(ix: number, iy: number) { return this.vals[this.perm[(this.perm[ix & 255] + (iy & 255)) & 511]]; }
  noise(x: number, y: number, period: number) {
    const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
    const x0 = ((ix % period) + period) % period, y0 = ((iy % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = this.h(x0, y0), b = this.h(x1, y0), c = this.h(x0, y1), d = this.h(x1, y1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  // anisotropic tileable noise: px, py periods (integers)
  noise2(u: number, v: number, px: number, py: number) {
    const x = u * px, y = v * py;
    const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
    const x0 = ((ix % px) + px) % px, y0 = ((iy % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = this.h(x0, y0), b = this.h(x1, y0), c = this.h(x0, y1), d = this.h(x1, y1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  fbm(u: number, v: number, base: number, oct: number, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, p = base;
    for (let o = 0; o < oct; o++) { sum += this.noise(u * p, v * p, p) * amp; norm += amp; amp *= gain; p *= 2; }
    return sum / norm;
  }
  ridged(u: number, v: number, base: number, oct: number) {
    let sum = 0, amp = 1, norm = 0, p = base;
    for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(this.noise(u * p, v * p, p) * 2 - 1); sum += n * n * amp; norm += amp; amp *= 0.5; p *= 2; }
    return sum / norm;
  }
  // tileable worley: out = [F1, F2, cellRand, cellRand2]
  worley(u: number, v: number, cells: number, out: number[]) {
    const x = u * cells, y = v * cells; const ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0, id2 = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j; const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const px = cx + this.h(wx, wy), py = cy + this.h(wx + 97, wy + 31);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = this.h(wx + 13, wy + 71); id2 = this.h(wx + 191, wy + 7); } else if (d < f2) f2 = d;
    }
    out[0] = f1; out[1] = f2; out[2] = id; out[3] = id2;
  }
}

export interface TexSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  rhMap: THREE.Texture; // R = height, G = roughness
  emissiveMap?: THREE.Texture;
}

const hexToRgb = (h: string) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function ramp(cols: number[][], t: number, out: number[]) {
  t = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1);
  const i = Math.floor(t), f = t - i; const a = cols[i], b = cols[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
}
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function toTex(data: Uint8Array, size: number, srgb: boolean, aniso: number) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// separable wrap-around box blur
function blur(src: Float32Array, size: number, r: number) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) {
    let acc = 0; const row = y * size;
    for (let k = -r; k <= r; k++) acc += src[row + ((k + size) % size)];
    for (let x = 0; x < size; x++) { tmp[row + x] = acc * inv; acc += src[row + ((x + r + 1) % size)] - src[row + ((x - r + size) % size)]; }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[((k + size) % size) * size + x];
    for (let y = 0; y < size; y++) { out[y * size + x] = acc * inv; acc += tmp[((y + r + 1) % size) * size + x] - tmp[((y - r + size) % size) * size + x]; }
  }
  return out;
}

const cache = new Map<string, TexSet>();
const KERB_RED = [0.62, 0.08, 0.06], KERB_WHITE = [0.86, 0.86, 0.84], KERB_BLUE = [0.1, 0.35, 0.7];

export function generateTexture(kind: TexKind, palette: string[], size: number, seed: number, aniso = 8, emissiveColor?: string): TexSet {
  const key = `${kind}|${palette.join(',')}|${size}|${seed}|${emissiveColor ?? ''}`;
  const c = cache.get(key); if (c) return c;
  const N = new TileNoise(seed);
  const cols = palette.map(hexToRgb);
  const H = new Float32Array(size * size);
  const R = new Float32Array(size * size);
  const C = new Float32Array(size * size * 3);
  const hasE = !!emissiveColor || kind === 'basalt' || kind === 'lavaRoad' || kind === 'cityRoad' || kind === 'crystal' || kind === 'oovoRoad' || kind === 'oovoWall';
  const E = hasE ? new Float32Array(size * size) : null;
  const w: number[] = [0, 0, 0, 0], w2: number[] = [0, 0, 0, 0]; const col = [0, 0, 0];
  const isRoad = kind === 'road' || kind === 'mud' || kind === 'lavaRoad' || kind === 'ice' || kind === 'cityRoad' || kind === 'oovoRoad';
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size; const i = y * size + x;
      let h = 0, r = 0.8, t = 0, e = 0; let direct: number[] | null = null;
      const grain = N.noise(u * size * 0.5, v * size * 0.5, size * 0.5);
      const fine = N.noise(u * size * 0.25, v * size * 0.25, size * 0.25);
      switch (kind) {
        case 'sand': {
          const f = N.fbm(u, v, 4, 6);
          const warp = N.fbm(u, v, 3, 3) * 5;
          const rip = Math.sin((u * 34 + v * 6 + warp) * Math.PI * 2) * 0.5 + 0.5;
          const rip2 = Math.sin((u * 90 + warp * 2.2 + N.fbm(u, v, 16, 2) * 3) * Math.PI * 2) * 0.5 + 0.5;
          N.worley(u, v, 64, w); const peb = (1 - sstep(0.05, 0.22, w[0])) * (w[2] > 0.82 ? 1 : 0);
          const damp = sstep(0.55, 0.7, N.fbm(u, v, 2, 4));
          h = f * 0.45 + Math.pow(rip, 1.6) * 0.28 + rip2 * 0.08 + peb * 0.35 + grain * 0.06;
          t = f * 0.7 + rip * 0.2 + grain * 0.12 - damp * 0.25 - peb * 0.2; r = 0.95 - grain * 0.12 - damp * 0.15;
          break;
        }
        case 'rock': case 'basalt': {
          if (kind === 'basalt') {
            N.worley(u, v, 9, w);
            const edge = w[1] - w[0];
            const col_ = sstep(0.02, 0.09, edge);
            const glow = (1 - sstep(0.0, 0.035, edge)) * sstep(0.35, 0.6, N.fbm(u, v, 4, 3));
            h = col_ * (0.55 + w[2] * 0.35) + N.fbm(u, v, 16, 4) * 0.12 + grain * 0.04;
            t = 0.25 + w[2] * 0.35 + N.fbm(u, v, 8, 4) * 0.3 - (1 - col_) * 0.3; r = 0.8 + grain * 0.15;
            e = glow * (0.5 + 0.5 * N.fbm(u, v, 12, 3)); h -= glow * 0.25;
            break;
          }
          const warpS = N.fbm(u, v, 3, 4) * 3.2;
          const bandPos = v * 18 + warpS;
          const band = Math.floor(bandPos); const bf = bandPos - band;
          const bandId = N.h(band & 255, 17);
          const ledge = sstep(0.0, 0.12, bf) * (1 - sstep(0.85, 1.0, bf));
          const rd = N.ridged(u, v, 4, 6);
          const erosion = N.noise2(u, v, 48, 3) * N.fbm(u, v, 6, 3);
          N.worley(u, v, 8, w); const crack = 1 - sstep(0.0, 0.05, w[1] - w[0]);
          h = rd * 0.35 + ledge * 0.25 + bandId * 0.12 - crack * 0.3 - erosion * 0.12 + fine * 0.08;
          t = bandId * 0.55 + rd * 0.3 + fine * 0.1 - erosion * 0.25 - crack * 0.2;
          r = 0.82 + grain * 0.12;
          break;
        }
        case 'oovoRoad': case 'oovoWall': {
          if (kind === 'oovoRoad') {
            const cells = 8;
            const gx = (u * cells) % 1, gy = (v * cells) % 1; const seam = Math.min(gx, 1 - gx, gy, 1 - gy);
            const pid = N.h(Math.floor(u * cells), Math.floor(v * cells));
            const f = N.fbm(u, v, 8, 4);
            const scratch = N.noise2(u, v, 512, 4) > 0.84 ? 1 : 0;
            h = 0.5 + sstep(0.0, 0.012, seam) * 0.35 - (seam < 0.004 ? 0.25 : 0) + f * 0.06 + pid * 0.1 - scratch * 0.05;
            t = 0.4 + pid * 0.25 + f * 0.15 + scratch * 0.15; r = 0.38 + f * 0.25 + (seam < 0.008 ? 0.3 : 0);
            const edge = Math.min(u, 1 - u);
            const lane = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75));
            if (lane < 0.006 && Math.floor(v * 20) % 2 === 0) { direct = [0.85, 0.4, 0.05]; e = 0.35; r = 0.3; }
            if (edge < 0.03) { direct = [0.06, 0.28, 0.38]; e = 0.35; h = 0.8; r = 0.25; }
            if (edge > 0.03 && edge < 0.05) { direct = [0.02, 0.04, 0.06]; h = 0.3; r = 0.6; }
            break;
          }
          // oovoWall: hexagonal prison plating with glowing energy core
          N.worley(u, v, 6, w);
          const edge = w[1] - w[0];
          const seam = 1 - sstep(0.0, 0.045, edge);
          const f = N.fbm(u, v, 8, 4);
          const core = sstep(0.35, 0.0, w[0]) * (w[2] > 0.5 ? 1 : 0.3);
          h = 0.55 + sstep(0.02, 0.09, edge) * 0.3 - seam * 0.4 + f * 0.06 + w[2] * 0.08;
          t = 0.3 + w[2] * 0.3 + f * 0.2 - seam * 0.2; r = 0.4 + f * 0.2 + seam * 0.3;
          e = core * 0.9 * (0.6 + 0.4 * N.fbm(u, v, 12, 3));
          break;
        }
        case 'road': case 'mud': case 'lavaRoad': case 'cityRoad': case 'ice': {
          const edge = Math.min(u, 1 - u);
          const f = N.fbm(u, v, 3, 6);
          const streak = N.noise2(u, v, 160, 4) * 0.6 + N.noise2(u, v, 320, 8) * 0.4; // hover streaks along v
          const racing = Math.exp(-Math.pow((u - 0.5 - (N.noise2(u, v, 1, 2) - 0.5) * 0.25) / 0.16, 2));
          const scorch = sstep(0.62, 0.75, N.fbm(u, v, 5, 4));
          N.worley(u, v, 72, w); const peb = (1 - sstep(0.08, 0.3, w[0])) * (w[2] > 0.7 ? 1 : 0);
          N.worley(u, v, 10, w2); const crack = (1 - sstep(0.0, 0.018, w2[1] - w2[0])) * sstep(0.45, 0.6, N.fbm(u, v, 4, 3));
          h = 0.5 + f * 0.25 + streak * 0.12 + peb * 0.25 - crack * 0.35 + grain * 0.04;
          t = 0.35 + f * 0.45 + streak * 0.2 - racing * 0.2 - scorch * 0.3 - crack * 0.2 - peb * 0.1;
          r = 0.82 - racing * 0.15 - streak * 0.08;
          if (kind === 'mud') { const pud = sstep(0.56, 0.62, N.fbm(u, v, 4, 4)); r = r * (1 - pud) + 0.05 * pud; h = h * (1 - pud) + 0.22 * pud; t -= pud * 0.3; }
          if (kind === 'ice') {
            N.worley(u, v, 7, w); const ic = 1 - sstep(0.0, 0.02, w[1] - w[0]);
            const bub = (1 - sstep(0.0, 0.08, w2[0])) * (w2[2] > 0.85 ? 1 : 0);
            const frost = sstep(0.15, 0.0, edge) + sstep(0.6, 0.75, N.fbm(u, v, 6, 3)) * 0.6;
            h = 0.6 + f * 0.15 - ic * 0.35 + bub * 0.1 + frost * 0.15; t = 0.35 + f * 0.35 + ic * 0.35 + streak * 0.12 + frost * 0.4 - racing * 0.15;
            r = 0.06 + f * 0.12 + ic * 0.3 + frost * 0.5 + streak * 0.05;
          }
          if (kind === 'cityRoad') {
            const gx = (u * 6) % 1, gy = (v * 6) % 1; const seam = Math.min(gx, 1 - gx, gy, 1 - gy);
            h = 0.5 + f * 0.1 + sstep(0.0, 0.01, seam) * 0.2 - (seam < 0.004 ? 0.2 : 0) + grain * 0.05;
            t = 0.3 + f * 0.3 + N.h(Math.floor(u * 6), Math.floor(v * 6)) * 0.15 - racing * 0.15 + streak * 0.1;
            r = 0.45 + f * 0.25 - racing * 0.15;
            const lane = Math.min(Math.abs(u - 0.333), Math.abs(u - 0.666));
            if (lane < 0.005 && Math.floor(v * 24) % 2 === 0) { direct = [0.85, 0.85, 0.8]; r = 0.35; e = 0.2; h = 0.6; }
            if (edge > 0.035 && edge < 0.045) { direct = [0.9, 0.75, 0.1]; e = 0.15; }
          }
          if (kind === 'lavaRoad') { N.worley(u, v, 6, w); const g = (1 - sstep(0.0, 0.025, w[1] - w[0])) * sstep(0.4, 0.55, N.fbm(u, v, 3, 3)); e = g * (edge > 0.08 ? 0.8 : 0); h -= g * 0.25; }
          // edge dirt + white line + kerbs
          const dirt = sstep(0.12, 0.04, edge);
          t -= dirt * 0.15; r += dirt * 0.08;
          if (kind !== 'cityRoad' && edge > 0.045 && edge < 0.052) { direct = [0.82, 0.8, 0.75]; r = 0.5; h = 0.58; }
          if (edge < 0.035) {
            const stripe = Math.floor(v * 16) % 2;
            const base = kind === 'ice' ? (stripe ? KERB_BLUE : KERB_WHITE) : kind === 'cityRoad' ? (stripe ? [0.7, 0.1, 0.5] : KERB_WHITE) : (stripe ? KERB_RED : KERB_WHITE);
            const wear = 0.75 + N.fbm(u, v, 32, 3) * 0.35;
            const ridge = Math.sin((v * 64) % 1 * Math.PI) * 0.15;
            direct = [base[0] * wear, base[1] * wear, base[2] * wear];
            h = 0.7 + ridge - sstep(0.025, 0.035, edge) * 0.2; r = 0.45 + grain * 0.2;
            if (kind === 'cityRoad' && edge < 0.012) { e = 1; direct = [0.9, 0.3, 0.8]; }
          }
          break;
        }
        case 'snow': {
          const f = N.fbm(u, v, 3, 6);
          const sast = N.noise2(u, v, 12, 40) * 0.5 + N.noise2(u, v, 24, 90) * 0.3;
          const spark = grain > 0.965 ? 1 : 0;
          h = f * 0.55 + sast * 0.35 + grain * 0.1; t = 0.55 + f * 0.3 + sast * 0.2 + spark * 0.2; r = 0.72 - spark * 0.6 - sast * 0.1;
          break;
        }
        case 'jungle': {
          const f = N.fbm(u, v, 4, 6);
          N.worley(u, v, 36, w);
          const leaf = (1 - sstep(0.0, 0.45, w[0])) * (w[2] > 0.45 ? 1 : 0);
          const blades = N.noise2(u, v, 256, 32) * 0.5 + N.noise2(u, v, 512, 64) * 0.5;
          const moss = sstep(0.45, 0.65, N.fbm(u, v, 6, 4));
          N.worley(u, v, 20, w2); const stone = (1 - sstep(0.1, 0.35, w2[0])) * (w2[2] > 0.9 ? 1 : 0);
          h = f * 0.35 + blades * 0.25 + leaf * 0.25 + stone * 0.4 + grain * 0.05;
          t = f * 0.45 + blades * 0.25 + moss * 0.25 + leaf * (w[3] - 0.5) * 0.4;
          r = 0.75 - moss * 0.15 - leaf * 0.1;
          if (leaf > 0.5 && w[3] > 0.7) direct = [0.32 + w[3] * 0.15, 0.22, 0.08];
          if (stone > 0.3) direct = [0.38, 0.37, 0.33];
          break;
        }
        case 'metal': {
          const cells = 8;
          const gx = (u * cells) % 1, gy = (v * cells) % 1;
          const seam = Math.min(gx, 1 - gx, gy, 1 - gy);
          const pid = N.h(Math.floor(u * cells), Math.floor(v * cells));
          const f = N.fbm(u, v, 8, 4);
          const scratch = N.noise2(u, v, 512, 4) > 0.82 ? 1 : 0;
          const grime = sstep(0.04, 0.0, seam) * 0.6 + sstep(0.55, 0.75, f) * 0.4;
          h = sstep(0.0, 0.015, seam) * 0.65 + f * 0.08 + pid * 0.15 - scratch * 0.05;
          const rivet = (Math.hypot(gx - 0.06, gy - 0.06) < 0.018 || Math.hypot(gx - 0.94, gy - 0.94) < 0.018 || Math.hypot(gx - 0.94, gy - 0.06) < 0.018 || Math.hypot(gx - 0.06, gy - 0.94) < 0.018) ? 1 : 0;
          h += rivet * 0.25;
          t = 0.35 + pid * 0.3 + f * 0.2 - grime * 0.3 + scratch * 0.2; r = 0.32 + f * 0.3 + grime * 0.3 - scratch * 0.15;
          if (pid > 0.92 && ((gx + gy) * 6) % 1 < 0.5) { direct = [0.75, 0.6, 0.08]; r = 0.5; }
          break;
        }
        case 'crystal': {
          N.worley(u, v, 7, w);
          const facet = w[2]; const f = N.fbm(u, v, 4, 4);
          const edgeC = 1 - sstep(0.0, 0.04, w[1] - w[0]);
          const inner = sstep(0.3, 0.0, w[0]) * facet;
          h = 0.4 + facet * 0.4 - edgeC * 0.4 + f * 0.1;
          t = facet * 0.65 + f * 0.25 + inner * 0.2; r = 0.12 + f * 0.25 + edgeC * 0.3;
          e = facet > 0.72 ? (facet - 0.72) * 2.8 * (0.5 + inner) : edgeC * 0.08;
          break;
        }
      }
      if (direct) { col[0] = direct[0]; col[1] = direct[1]; col[2] = direct[2]; }
      else ramp(cols, t, col);
      C[i * 3] = col[0]; C[i * 3 + 1] = col[1]; C[i * 3 + 2] = col[2];
      H[i] = clamp01(h); R[i] = Math.max(0.03, Math.min(1, r));
      if (E) E[i] = e;
    }
  }
  // cavity / ambient occlusion from height
  const rad = Math.max(2, Math.round(size / 128));
  const Hb = blur(blur(H, size, rad), size, rad);
  const Hb2 = blur(H, size, Math.max(1, rad >> 2));
  // macro color variation (hue/brightness) to make surfaces less uniform
  const map = new Uint8Array(size * size * 4), nrm = new Uint8Array(size * size * 4), rh = new Uint8Array(size * size * 4);
  const strength = kind === 'metal' || kind === 'cityRoad' ? 6 : isRoad ? 4 : 5;
  const sc = strength * size / 512;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const xm = (x - 1 + size) % size, xp = (x + 1) % size, ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yr = y * size;
    // Sobel on lightly blurred height for smooth, artifact-free normals
    const tl = Hb2[ym + xm], tc = Hb2[ym + x], tr = Hb2[ym + xp], ml = Hb2[yr + xm], mr = Hb2[yr + xp], bl = Hb2[yp + xm], bc = Hb2[yp + x], br = Hb2[yp + xp];
    const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
    const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
    let nx = -gx * sc * 0.25, ny = -gy * sc * 0.25, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const cav = clamp01(0.5 + (H[i] - Hb[i]) * 3.5);
    const ao = 0.62 + 0.38 * Math.min(1, cav * 1.25);
    const tint = 0.92 + 0.16 * N.noise(x / size * 6, y / size * 6, 6);
    map[i * 4] = Math.min(255, C[i * 3] * ao * tint * 255); map[i * 4 + 1] = Math.min(255, C[i * 3 + 1] * ao * (0.5 + tint * 0.5) * 255); map[i * 4 + 2] = Math.min(255, C[i * 3 + 2] * ao * 255); map[i * 4 + 3] = 255;
    nrm[i * 4] = (nx * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
    rh[i * 4] = H[i] * 255; rh[i * 4 + 1] = clamp01(R[i] + (0.5 - cav) * 0.2) * 255; rh[i * 4 + 2] = cav * 255; rh[i * 4 + 3] = 255;
  }
  const set: TexSet = { map: toTex(map, size, true, aniso), normalMap: toTex(nrm, size, false, aniso), rhMap: toTex(rh, size, false, aniso) };
  if (E) {
    const ec = hexToRgb(emissiveColor || (kind === 'cityRoad' ? '#ff3ad0' : kind === 'crystal' ? '#c87aff' : kind === 'oovoRoad' ? '#3ad8ff' : kind === 'oovoWall' ? '#a060ff' : '#ff5a10'));
    const em = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) { em[i * 4] = Math.min(255, E[i] * ec[0] * 255); em[i * 4 + 1] = Math.min(255, E[i] * ec[1] * 255); em[i * 4 + 2] = Math.min(255, E[i] * ec[2] * 255); em[i * 4 + 3] = 255; }
    set.emissiveMap = toTex(em, size, true, aniso);
  }
  cache.set(key, set);
  return set;
}

// low-frequency tileable noise used for anti-tiling macro variation
let macroTex: THREE.DataTexture | null = null;
export function macroTexture() {
  if (macroTex) return macroTex;
  const s = 256; const N = new TileNoise(4242); const d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s; const i = (y * s + x) * 4;
    d[i] = N.fbm(u, v, 4, 5) * 255; d[i + 1] = N.fbm(u + 0.37, v + 0.71, 2, 4) * 255; d[i + 2] = N.ridged(u, v, 3, 4) * 255; d[i + 3] = 255;
  }
  macroTex = toTex(d, s, false, 4);
  return macroTex;
}

export function cloneSet(s: TexSet, rx: number, ry: number): TexSet {
  const c = (t?: THREE.Texture) => { if (!t) return undefined; const n = t.clone(); n.repeat.set(rx, ry); n.needsUpdate = true; return n; };
  return { map: c(s.map)!, normalMap: c(s.normalMap)!, rhMap: c(s.rhMap)!, emissiveMap: c(s.emissiveMap) };
}

// Soft particle sprite
export function spriteTexture() {
  const s = 64; const d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5) / s * 2 - 1, dy = (y + 0.5) / s * 2 - 1; const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r); const i = (y * s + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.pow(a, 1.6) * 255;
  }
  const t = new THREE.DataTexture(d, s, s); t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; return t;
}
