"use strict";
(() => {
  // ../../src/game/texCore.ts
  var TileNoise = class {
    perm = new Uint8Array(512);
    vals = new Float32Array(256);
    constructor(seed) {
      let s = seed >>> 0;
      const r = () => {
        s = s * 1664525 + 1013904223 >>> 0;
        return s / 4294967296;
      };
      const p = Array.from({ length: 256 }, (_, i) => i);
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
      for (let i = 0; i < 256; i++) this.vals[i] = r();
    }
    h(ix, iy) {
      return this.vals[this.perm[this.perm[ix & 255] + (iy & 255) & 511]];
    }
    noise(x, y, period) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const pow2 = (period & period - 1) === 0, m = period - 1;
      const x0 = pow2 ? ix & m : (ix % period + period) % period;
      const y0 = pow2 ? iy & m : (iy % period + period) % period;
      const x1 = pow2 ? x0 + 1 & m : (x0 + 1) % period;
      const y1 = pow2 ? y0 + 1 & m : (y0 + 1) % period;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const perm = this.perm, vals = this.vals;
      const px0 = perm[x0 & 255], px1 = perm[x1 & 255], my0 = y0 & 255, my1 = y1 & 255;
      const a = vals[perm[px0 + my0]], b = vals[perm[px1 + my0]], c = vals[perm[px0 + my1]], d = vals[perm[px1 + my1]];
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
    // anisotropic tileable noise: px, py periods (integers)
    noise2(u, v, px, py) {
      const x = u * px, y = v * py;
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const x0 = (px & px - 1) === 0 ? ix & px - 1 : (ix % px + px) % px;
      const y0 = (py & py - 1) === 0 ? iy & py - 1 : (iy % py + py) % py;
      const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const perm = this.perm, vals = this.vals;
      const px0 = perm[x0 & 255], px1 = perm[x1 & 255], my0 = y0 & 255, my1 = y1 & 255;
      const a = vals[perm[px0 + my0]], b = vals[perm[px1 + my0]], c = vals[perm[px0 + my1]], d = vals[perm[px1 + my1]];
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
    fbm(u, v, base, oct, gain = 0.5) {
      let sum = 0, amp = 1, norm = 0, p = base;
      for (let o = 0; o < oct; o++) {
        sum += this.noise(u * p, v * p, p) * amp;
        norm += amp;
        amp *= gain;
        p <<= 1;
      }
      return sum / norm;
    }
    ridged(u, v, base, oct) {
      let sum = 0, amp = 1, norm = 0, p = base;
      for (let o = 0; o < oct; o++) {
        const n = 1 - Math.abs(this.noise(u * p, v * p, p) * 2 - 1);
        sum += n * n * amp;
        norm += amp;
        amp *= 0.5;
        p <<= 1;
      }
      return sum / norm;
    }
    // fast tileable worley using squared distances (1 sqrt instead of 9 Math.hypot!): out = [F1, F2, cellRand, cellRand2]
    worley(u, v, cells, out) {
      const x = u * cells, y = v * cells;
      const ix = Math.floor(x), iy = Math.floor(y);
      const perm = this.perm, vals = this.vals;
      let d1 = 9, d2 = 9, bx = 0, by = 0;
      for (let j = -1; j <= 1; j++) {
        const cy = iy + j;
        const wy = cy < 0 ? cy + cells : cy >= cells ? cy - cells : cy;
        const my = wy & 255, my2 = wy + 31 & 255;
        for (let i = -1; i <= 1; i++) {
          const cx = ix + i;
          const wx = cx < 0 ? cx + cells : cx >= cells ? cx - cells : cx;
          const dx = cx + vals[perm[perm[wx & 255] + my]] - x;
          const dy = cy + vals[perm[perm[wx + 97 & 255] + my2]] - y;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            bx = wx;
            by = wy;
          } else if (d < d2) d2 = d;
        }
      }
      out[0] = Math.sqrt(d1);
      out[1] = Math.sqrt(d2);
      out[2] = vals[perm[perm[bx + 13 & 255] + (by + 71 & 255)]];
      out[3] = vals[perm[perm[bx + 191 & 255] + (by + 7 & 255)]];
    }
  };
  var s2l = (v) => v < 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4);
  var hexToRgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [s2l((n >> 16 & 255) / 255), s2l((n >> 8 & 255) / 255), s2l((n & 255) / 255)];
  };
  function ramp(cols, t, out) {
    t = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1);
    const i = Math.floor(t), f = t - i;
    const a = cols[i], b = cols[i + 1];
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
  }
  var sstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  var clamp01 = (x) => Math.max(0, Math.min(1, x));
  function aeolianWave(phase) {
    const f = phase - Math.floor(phase);
    return f < 0.76 ? sstep(0, 0.76, f) : 1 - sstep(0.76, 1, f);
  }
  function blur(src, size, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < size; y++) {
      let acc = 0;
      const row = y * size;
      for (let k = -r; k <= r; k++) acc += src[row + (k + size) % size];
      for (let x = 0; x < size; x++) {
        tmp[row + x] = acc * inv;
        acc += src[row + (x + r + 1) % size] - src[row + (x - r + size) % size];
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(k + size) % size * size + x];
      for (let y = 0; y < size; y++) {
        out[y * size + x] = acc * inv;
        acc += tmp[(y + r + 1) % size * size + x] - tmp[(y - r + size) % size * size + x];
      }
    }
    return out;
  }
  var KERB_RED = [0.64, 0.1, 0.07];
  var KERB_WHITE = [0.87, 0.86, 0.82];
  var KERB_BLUE = [0.11, 0.38, 0.74];
  var KERB_AMBER = [0.82, 0.48, 0.08];
  function computeTexture(kind, palette, size, seed, emissiveColor) {
    const N = new TileNoise(seed);
    const cols = palette.map(hexToRgb);
    const H = new Float32Array(size * size);
    const R = new Float32Array(size * size);
    const C = new Float32Array(size * size * 3);
    const hasE = !!emissiveColor || kind === "basalt" || kind === "lavaRoad" || kind === "cityRoad" || kind === "crystal" || kind === "oovoRoad" || kind === "oovoWall";
    const E = hasE ? new Float32Array(size * size) : null;
    const w = [0, 0, 0, 0], w2 = [0, 0, 0, 0], w3 = [0, 0, 0, 0];
    const col = [0, 0, 0];
    const isRoad = kind === "road" || kind === "mud" || kind === "lavaRoad" || kind === "ice" || kind === "cityRoad" || kind === "oovoRoad";
    const gPer = Math.max(32, size >> 1), fPer = Math.max(16, size >> 2);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const i = y * size + x;
        let h = 0, r = 0.8, t = 0, e = 0;
        let direct = null;
        const grain = N.noise(u * gPer, v * gPer, gPer);
        const fine = N.noise(u * fPer, v * fPer, fPer);
        switch (kind) {
          case "sand": {
            const f = N.fbm(u, v, 4, 6);
            const warp = N.fbm(u, v, 3, 4) * 3.8;
            const ripBig = aeolianWave(u * 24 + v * 5 + warp);
            const ripFine = aeolianWave(u * 76 + v * 14 + warp * 2.1 + N.fbm(u, v, 12, 2) * 1.8);
            const cross = aeolianWave(v * 38 - u * 8 + warp * 1.2) * (1 - ripBig) * 0.45;
            N.worley(u, v, 56, w);
            const peb = (1 - sstep(0.06, 0.24, w[0])) * (w[2] > 0.8 ? 1 : 0);
            const damp = sstep(0.56, 0.72, N.fbm(u + 0.2, v, 2, 4));
            h = f * 0.42 + ripBig * 0.3 + ripFine * 0.1 + cross * 0.08 + peb * 0.34 + grain * 0.05;
            t = f * 0.62 + ripBig * 0.26 + ripFine * 0.08 + grain * 0.1 - damp * 0.24 - peb * 0.24;
            r = 0.93 - ripBig * 0.05 - grain * 0.08 - damp * 0.14;
            break;
          }
          case "rock":
          case "basalt": {
            if (kind === "basalt") {
              const bwx = (N.fbm(u + 0.31, v + 0.17, 4, 3) - 0.5) * 0.15, bwy = (N.fbm(u + 0.63, v + 0.49, 5, 3) - 0.5) * 0.12;
              N.worley(u + bwx, v + bwy, 8, w);
              const edge = w[1] - w[0];
              const colTop = sstep(0.025, 0.11, edge);
              const bevel = sstep(0.015, 0.055, edge) * (1 - sstep(0.055, 0.12, edge));
              const ropy = Math.sin((u * 18 + v * 12 + N.fbm(u, v, 6, 3) * 4.5) * Math.PI * 2) * 0.5 + 0.5;
              N.worley(u, v, 68, w2);
              const pore = (1 - sstep(0.04, 0.16, w2[0])) * (w2[2] > 0.74 ? 1 : 0);
              const magmaMask = sstep(0.46, 0.7, N.fbm(u, v, 4, 3)) * (0.55 + 0.45 * sstep(0.3, 0.7, N.fbm(u + 0.5, v + 0.2, 9, 2)));
              const glow = (1 - sstep(0, 0.04, edge)) * magmaMask;
              const emberRim = (1 - sstep(0.02, 0.075, edge)) * magmaMask * 0.35;
              h = colTop * (0.52 + w[2] * 0.34) + ropy * 0.07 * (1 - w[3] * 0.5) + N.fbm(u, v, 16, 4) * 0.1 - pore * 0.14 - glow * 0.3 + grain * 0.04;
              t = 0.22 + w[2] * 0.34 + N.fbm(u, v, 8, 4) * 0.28 + bevel * 0.14 + ropy * 0.08 - (1 - colTop) * 0.32 - pore * 0.15;
              r = 0.76 + grain * 0.14 + pore * 0.12 - bevel * 0.14 - ropy * 0.08;
              e = glow * (0.65 + 0.35 * N.fbm(u, v, 12, 3)) + emberRim;
              break;
            }
            const warpS = N.fbm(u, v, 3, 4) * 2.8 + N.ridged(u, v, 6, 3) * 0.55;
            const bandPos = v * 20 + warpS;
            const band = Math.floor(bandPos);
            const bf = bandPos - band;
            const bandId = N.h(band & 255, 17);
            const subLedge = Math.sin(bf * Math.PI * 6) * 0.04;
            const ledge = sstep(0, 0.11, bf) * (1 - sstep(0.84, 1, bf)) + subLedge;
            const rd = N.ridged(u, v, 4, 6);
            const varnish = sstep(0.42, 0.78, N.noise2(u, v, 56, 2) * 0.7 + N.noise2(u, v, 128, 4) * 0.3) * N.fbm(u, v, 4, 3);
            const jw = (N.fbm(u + 0.37, v + 0.11, 5, 3) - 0.5) * 0.16, jw2 = (N.fbm(u + 0.71, v + 0.53, 7, 3) - 0.5) * 0.12;
            const weak = sstep(0.4, 0.7, N.fbm(u + 0.9, v + 0.4, 3, 3));
            N.worley(u + jw, v + jw2, 6, w);
            const crack = (1 - sstep(0, 0.03, w[1] - w[0])) * (0.3 + 0.7 * weak);
            N.worley(u + jw2 * 0.6, v + jw * 0.6, 17, w2);
            const joint = (1 - sstep(0, 0.022, w2[1] - w2[0])) * 0.4 * weak;
            const lam = Math.sin((bandPos * 7 + N.fbm(u, v, 9, 2) * 2.2) * Math.PI * 2) * 0.5 + 0.5;
            N.worley(u, v, 44, w3);
            const pit = (1 - sstep(0.05, 0.2, w3[0])) * (w3[2] > 0.66 ? 1 : 0) * (1 - weak * 0.5);
            const blockTilt = (w[2] - 0.5) * 0.1 + (w2[2] - 0.5) * 0.04;
            h = rd * 0.34 + ledge * 0.3 + bandId * 0.13 + blockTilt + lam * 0.05 - crack * 0.26 - joint * 0.1 - pit * 0.16 - varnish * 0.07 + fine * 0.08 + grain * 0.035;
            t = bandId * 0.5 + rd * 0.28 + (w[3] - 0.5) * 0.07 + fine * 0.1 + lam * 0.07 - varnish * 0.3 - crack * 0.2 - joint * 0.08 - pit * 0.12;
            r = 0.84 + grain * 0.1 + crack * 0.08 + pit * 0.06 - varnish * 0.14;
            break;
          }
          case "oovoRoad":
          case "oovoWall": {
            if (kind === "oovoRoad") {
              const cells = 8;
              const gx = u * cells % 1, gy = v * cells % 1;
              const seam2 = Math.min(gx, 1 - gx, gy, 1 - gy);
              const pid = N.h(Math.floor(u * cells), Math.floor(v * cells));
              const f2 = N.fbm(u, v, 8, 4);
              const scratch = N.noise2(u, v, 384, 4) > 0.83 ? 1 : 0;
              const inGrate = Math.abs(u - 0.5) < 0.08 && Math.abs(u - 0.5) > 0.012;
              const grateSlot = inGrate && v * 96 % 1 < 0.42 && u * 64 % 1 < 0.65 ? 1 : 0;
              const rivet = Math.hypot(gx - 0.08, gy - 0.08) < 0.02 || Math.hypot(gx - 0.92, gy - 0.08) < 0.02 || Math.hypot(gx - 0.08, gy - 0.92) < 0.02 || Math.hypot(gx - 0.92, gy - 0.92) < 0.02 ? 1 : 0;
              h = 0.52 + sstep(0, 0.014, seam2) * 0.32 - (seam2 < 5e-3 ? 0.28 : 0) + rivet * 0.14 - grateSlot * 0.36 + f2 * 0.06 + pid * 0.09 - scratch * 0.05;
              t = 0.38 + pid * 0.26 + f2 * 0.16 + scratch * 0.18 - grateSlot * 0.35;
              r = 0.34 + f2 * 0.24 + (seam2 < 0.01 ? 0.32 : 0) + grateSlot * 0.4 - scratch * 0.12;
              if (grateSlot && v * 16 % 1 < 0.25) e = 0.18;
              const edge2 = Math.min(u, 1 - u);
              const lane = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75));
              if (lane < 65e-4 && Math.floor(v * 20) % 2 === 0) {
                direct = [0.88, 0.44, 0.06];
                e = 0.38;
                r = 0.28;
                h = 0.62;
              }
              if (edge2 > 0.032 && edge2 < 0.052) {
                const haz = ((v * 24 + (u < 0.5 ? edge2 : -edge2) * 12) % 1 + 1) % 1 < 0.5;
                direct = haz ? [0.78, 0.54, 0.06] : [0.06, 0.07, 0.1];
                h = 0.42;
                r = 0.5;
              }
              if (edge2 <= 0.032) {
                direct = [0.06, 0.3, 0.42];
                e = 0.42;
                h = 0.82;
                r = 0.22;
              }
              break;
            }
            N.worley(u, v, 6, w);
            const edge = w[1] - w[0];
            const seam = 1 - sstep(0, 0.048, edge);
            const rib = 1 - sstep(0, 0.035, Math.abs(v * 8 % 1 - 0.5));
            const f = N.fbm(u, v, 8, 4);
            const core = sstep(0.32, 0, w[0]) * (w[2] > 0.52 ? 1 : 0.25) * (1 - rib * 0.8);
            h = 0.52 + sstep(0.02, 0.1, edge) * 0.28 + rib * 0.16 - seam * 0.4 + f * 0.06 + w[2] * 0.08;
            t = 0.28 + w[2] * 0.3 + f * 0.2 + rib * 0.12 - seam * 0.24;
            r = 0.36 + f * 0.2 + seam * 0.32 - rib * 0.1;
            e = core * 0.85 * (0.6 + 0.4 * N.fbm(u, v, 12, 3));
            break;
          }
          case "road":
          case "mud":
          case "lavaRoad":
          case "cityRoad":
          case "ice": {
            const edge = Math.min(u, 1 - u);
            const f = N.fbm(u, v, 3, 6);
            const streak = N.noise2(u, v, 160, 4) * 0.55 + N.noise2(u, v, 320, 8) * 0.45;
            const lineShift = (N.noise2(u, v, 1, 2) - 0.5) * 0.2;
            const centerLine = u - 0.5 - lineShift;
            const racing = Math.exp(-Math.pow(centerLine / 0.18, 2)) * 0.65 + (Math.exp(-Math.pow((centerLine - 0.085) / 0.045, 2)) + Math.exp(-Math.pow((centerLine + 0.085) / 0.045, 2))) * 0.5;
            const scorch = sstep(0.6, 0.75, N.fbm(u, v, 5, 4));
            N.worley(u, v, 72, w);
            const peb = (1 - sstep(0.06, 0.28, w[0])) * (w[2] > 0.66 ? 1 : 0);
            N.worley(u, v, 11, w2);
            const crack = (1 - sstep(0, 0.02, w2[1] - w2[0])) * sstep(0.42, 0.58, N.fbm(u, v, 4, 3));
            N.worley(u, v, 28, w3);
            const microCrack = (1 - sstep(0, 0.018, w3[1] - w3[0])) * sstep(0.52, 0.68, f) * 0.45;
            h = 0.5 + f * 0.22 + streak * 0.11 + peb * 0.24 - crack * 0.36 - microCrack * 0.18 + grain * 0.045;
            t = 0.36 + f * 0.44 + streak * 0.18 - racing * 0.22 - scorch * 0.26 - crack * 0.24 - microCrack * 0.12 + (w[3] - 0.5) * peb * 0.18;
            r = 0.84 - racing * 0.16 - streak * 0.07 + crack * 0.1;
            if (kind === "mud") {
              const rut = Math.exp(-Math.pow((u - 0.32 - lineShift * 0.6) / 0.065, 2)) + Math.exp(-Math.pow((u - 0.68 - lineShift * 0.6) / 0.065, 2));
              N.worley(u, v, 26, w3);
              const cobble = (1 - sstep(0.08, 0.32, w3[0])) * (w3[2] > 0.78 ? 1 : 0) * (1 - rut * 0.5);
              const pud = sstep(0.56, 0.63, N.fbm(u, v, 4, 4) + rut * 0.12 - edge * 0.1);
              const wetRim = sstep(0.48, 0.56, N.fbm(u, v, 4, 4) + rut * 0.12) * (1 - pud);
              const edgeMoss = sstep(0.18, 0.04, edge) * sstep(0.4, 0.62, N.fbm(u, v, 8, 3));
              h = h - rut * 0.14 + cobble * 0.32;
              h = h * (1 - pud) + 0.2 * pud;
              t = t - rut * 0.12 - wetRim * 0.18 - pud * 0.32 + cobble * 0.15;
              r = clamp01((r - wetRim * 0.22) * (1 - pud) + 0.07 * pud);
              if (edgeMoss > 0.35 && edge > 0.04) {
                ramp(cols, t, col);
                direct = [col[0] * (1 - edgeMoss * 0.4) + 0.11 * edgeMoss, col[1] * (1 - edgeMoss * 0.25) + 0.22 * edgeMoss, col[2] * (1 - edgeMoss * 0.45) + 0.06 * edgeMoss];
              }
            }
            if (kind === "ice") {
              N.worley(u, v, 7, w);
              const ic = 1 - sstep(0, 0.022, w[1] - w[0]);
              N.worley(u, v, 20, w3);
              const ic2 = (1 - sstep(0, 0.018, w3[1] - w3[0])) * 0.55;
              const skate = sstep(0.76, 0.9, N.noise2(u, v, 240, 3)) * 0.5;
              const bub = (1 - sstep(0, 0.075, w2[0])) * (w2[2] > 0.82 ? 1 : 0);
              const frost = sstep(0.18, 0.035, edge) * (0.65 + 0.35 * f) + sstep(0.62, 0.76, N.fbm(u, v, 6, 3)) * 0.55;
              h = 0.6 + f * 0.14 - ic * 0.32 - ic2 * 0.12 - skate * 0.08 + bub * 0.08 + frost * 0.18;
              t = 0.32 + (w[2] - 0.5) * 0.14 + f * 0.32 + ic * 0.4 + ic2 * 0.22 + skate * 0.18 + bub * 0.25 + frost * 0.42 - racing * 0.16;
              r = 0.055 + f * 0.1 + ic * 0.32 + skate * 0.14 + frost * 0.52;
            }
            if (kind === "cityRoad") {
              const gx = u * 8 % 1, gy = v * 8 % 1;
              const seam = Math.min(gx, 1 - gx, gy, 1 - gy);
              const pid = N.h(Math.floor(u * 8), Math.floor(v * 8));
              const drain = edge > 0.052 && edge < 0.072 && v * 64 % 1 < 0.45 ? 1 : 0;
              h = 0.52 + f * 0.08 + sstep(0, 0.012, seam) * 0.18 - (seam < 4e-3 ? 0.22 : 0) - drain * 0.3 + grain * 0.04;
              t = 0.28 + f * 0.28 + pid * 0.16 - racing * 0.16 + streak * 0.1 - drain * 0.3;
              r = 0.4 + f * 0.22 - racing * 0.15 + drain * 0.35;
              const lane = Math.min(Math.abs(u - 0.333), Math.abs(u - 0.666));
              if (lane < 55e-4 && Math.floor(v * 24) % 2 === 0) {
                direct = [0.88, 0.88, 0.84];
                r = 0.3;
                e = 0.22;
                h = 0.62;
              }
              if (Math.abs(u - 0.5) < 4e-3) {
                direct = [0.92, 0.66, 0.14];
                r = 0.34;
                e = 0.14;
                h = 0.6;
              }
              if (edge > 0.036 && edge < 0.046) {
                direct = [0.92, 0.76, 0.12];
                e = 0.18;
                h = 0.6;
              }
            }
            if (kind === "road") {
              N.worley(u, v, 5, w2);
              const patch = w2[2] > 0.74 && edge > 0.09;
              if (patch) {
                t -= 0.12;
                r -= 0.08;
                h -= 0.025;
                if (w2[1] - w2[0] < 0.016) {
                  t -= 0.24;
                  h -= 0.13;
                  r -= 0.18;
                }
              }
              const jv = v * 6 % 1;
              const joint = 1 - sstep(0, 4e-3, Math.min(jv, 1 - jv));
              t -= joint * 0.32;
              h -= joint * 0.3;
              r += joint * 0.12;
              const oil = sstep(0.67, 0.8, N.fbm(u + 0.31, v, 6, 3)) * Math.min(1, racing);
              t -= oil * 0.22;
              r -= oil * 0.28;
              const driftSand = sstep(0.22, 0.055, edge) * sstep(0.38, 0.64, N.fbm(u, v, 5, 4));
              const sRip = aeolianWave(v * 44 + u * 8 + f * 2) * driftSand;
              t += driftSand * 0.22 + sRip * 0.06;
              h += driftSand * 0.08 + sRip * 0.05;
              r += driftSand * 0.1;
              const paintWear = sstep(0.32, 0.62, N.fbm(u, v, 18, 3));
              if (Math.abs(u - 0.5) < 5e-3 && v * 10 % 1 < 0.52 && paintWear > 0.25) {
                const pw = 0.68 + 0.24 * paintWear;
                direct = [0.88 * pw, 0.82 * pw, 0.7 * pw];
                r = 0.52;
                h = 0.57;
              }
            }
            if (kind === "lavaRoad") {
              N.worley(u, v, 7, w);
              const ed = w[1] - w[0];
              const mask = sstep(0.36, 0.54, N.fbm(u, v, 3, 3)) * (edge > 0.065 ? 1 : 0);
              const lavaVein = (1 - sstep(0, 0.028, ed)) * mask;
              const crustRim = sstep(0.015, 0.045, ed) * (1 - sstep(0.045, 0.09, ed)) * mask;
              e = lavaVein * (0.72 + 0.28 * f);
              h = h + crustRim * 0.14 - lavaVein * 0.32 + (w[2] - 0.5) * 0.08;
              t = t - lavaVein * 0.3 + crustRim * 0.12;
              r = r - crustRim * 0.22;
            }
            const dirt = sstep(0.13, 0.04, edge);
            t -= dirt * 0.14;
            r += dirt * 0.07;
            if (kind !== "cityRoad" && kind !== "mud" && edge > 0.044 && edge < 0.052) {
              const wearL = 0.62 + 0.34 * N.fbm(u, v, 24, 3);
              if (wearL > 0.7) {
                direct = [0.84 * wearL, 0.81 * wearL, 0.74 * wearL];
                r = 0.52;
                h = 0.58;
              }
            }
            if (edge < 0.036) {
              const stripe = Math.floor(v * 16) % 2;
              const kerbA = kind === "ice" ? KERB_BLUE : kind === "cityRoad" ? [0.72, 0.1, 0.52] : kind === "lavaRoad" ? KERB_AMBER : KERB_RED;
              const kerbB = kind === "lavaRoad" ? [0.18, 0.15, 0.13] : KERB_WHITE;
              const base = stripe ? kerbA : kerbB;
              const blockSeam = 1 - sstep(0, 0.04, Math.min(v * 16 % 1, 1 - v * 16 % 1));
              const wear = (0.72 + N.fbm(u, v, 32, 3) * 0.34) * (1 - blockSeam * 0.45);
              const ridge = Math.sin(v * 64 % 1 * Math.PI) * 0.16;
              const bevelK = 1 - sstep(0.026, 0.036, edge);
              direct = [base[0] * wear, base[1] * wear, base[2] * wear];
              h = 0.52 + (0.24 + ridge - blockSeam * 0.18) * bevelK;
              r = 0.44 + grain * 0.18 + blockSeam * 0.25;
              if (kind === "cityRoad" && edge < 0.012) {
                e = 0.95;
                direct = [0.9, 0.3, 0.8];
              }
            }
            break;
          }
          case "snow": {
            const f = N.fbm(u, v, 3, 6);
            const warp = N.fbm(u, v, 4, 3) * 2.2;
            const sast1 = aeolianWave(v * 14 + u * 3 + warp);
            const sast2 = N.noise2(u, v, 18, 56) * 0.55 + N.noise2(u, v, 36, 112) * 0.45;
            const crust = sstep(0.55, 0.78, sast1 * 0.6 + f * 0.4);
            h = f * 0.46 + sast1 * 0.3 + sast2 * 0.18 + grain * 0.06;
            t = 0.48 + f * 0.28 + sast1 * 0.22 + crust * 0.12;
            r = 0.76 - crust * 0.14 - sast2 * 0.06;
            break;
          }
          case "jungle": {
            const f = N.fbm(u, v, 4, 6);
            const roots = Math.pow(N.ridged(u, v, 7, 4), 2.4);
            N.worley(u, v, 38, w);
            const leaf = (1 - sstep(0, 0.44, w[0])) * (w[2] > 0.42 ? 1 : 0);
            const blades = N.noise2(u, v, 256, 32) * 0.5 + N.noise2(u, v, 512, 64) * 0.5;
            const moss = sstep(0.42, 0.66, N.fbm(u + 0.4, v, 6, 4));
            N.worley(u, v, 18, w2);
            const stone = (1 - sstep(0.08, 0.32, w2[0])) * (w2[2] > 0.88 ? 1 : 0);
            h = f * 0.32 + blades * 0.2 + moss * 0.14 + leaf * 0.2 + roots * 0.26 + stone * 0.42 + grain * 0.04;
            t = f * 0.42 + blades * 0.22 + moss * 0.32 + leaf * (w[3] - 0.5) * 0.36 - (1 - moss) * 0.08;
            r = 0.78 - moss * 0.12 - leaf * 0.14 + roots * 0.06;
            if (roots > 0.62 && stone < 0.2) {
              direct = [0.24 + fine * 0.08, 0.17 + fine * 0.06, 0.09];
              r = 0.72;
            }
            if (leaf > 0.52 && w[3] > 0.72) direct = [0.3 + w[3] * 0.16, 0.21 + w[2] * 0.06, 0.07];
            if (stone > 0.32) {
              const sv = 0.32 + w2[3] * 0.14;
              direct = [sv, sv * 1.02, sv * 0.92];
              r = 0.62;
            }
            break;
          }
          case "gravel": {
            N.worley(u, v, 24, w);
            const p0 = (1 - sstep(0.04, 0.38, w[0])) * (w[2] > 0.45 ? 1 : 0);
            N.worley(u, v, 52, w2);
            const p1 = 1 - sstep(0.02, 0.44, w2[0]);
            N.worley(u, v, 112, w3);
            const p2 = 1 - sstep(0, 0.46, w3[0]);
            const f = N.fbm(u, v, 8, 4);
            const cob = p0 * (0.68 + w[2] * 0.32), med = p1 * (0.55 + w2[2] * 0.45) * 0.78, sml = p2 * (0.5 + w3[2] * 0.5) * 0.48;
            const top = Math.max(cob, med, sml);
            h = top + f * 0.1 + grain * 0.04;
            const clastT = top === cob ? w[3] : top === med ? w2[3] * 0.85 + 0.08 : w3[3] * 0.7 + 0.15;
            t = clastT * 0.78 + f * 0.22 - (1 - Math.max(p0, p1)) * 0.18;
            r = 0.88 - cob * 0.2 - med * 0.1 + grain * 0.06;
            break;
          }
          case "cracked": {
            N.worley(u, v, 9, w);
            const edge = w[1] - w[0];
            const crack = 1 - sstep(0, 0.032, edge);
            const curlRim = sstep(0.022, 0.065, edge) * (1 - sstep(0.065, 0.16, edge));
            N.worley(u, v, 25, w2);
            const e2 = w2[1] - w2[0];
            const fineC = 1 - sstep(0, 0.024, e2);
            const f = N.fbm(u, v, 6, 5);
            const crystalCrust = sstep(0.55, 0.8, N.fbm(u, v, 20, 3));
            h = 0.54 + sstep(0, 0.22, edge) * 0.16 + curlRim * 0.15 - crack * 0.48 - fineC * 0.16 + f * 0.08 + crystalCrust * 0.04 + grain * 0.03;
            t = 0.5 + w[2] * 0.24 + curlRim * 0.18 + crystalCrust * 0.12 + f * 0.22 - crack * 0.48 - fineC * 0.18;
            r = 0.68 + f * 0.14 + crack * 0.22 - crystalCrust * 0.08;
            e = crack * (0.68 + 0.32 * f) + fineC * 0.28 * sstep(0.45, 0.7, f);
            break;
          }
          case "metal": {
            const cells = 8;
            const gx = u * cells % 1, gy = v * cells % 1;
            const seam = Math.min(gx, 1 - gx, gy, 1 - gy);
            const ix = Math.floor(u * cells), iy = Math.floor(v * cells);
            const pid = N.h(ix, iy), pid2 = N.h(ix + 37, iy + 19);
            const f = N.fbm(u, v, 8, 4);
            const brush = N.noise2(u, v, 512, 4);
            const scratch = brush > 0.84 ? 1 : 0;
            const grime = sstep(0.055, 0, seam) * 0.62 + sstep(0.54, 0.76, f) * 0.38;
            const louver = pid2 > 0.76 && gx > 0.18 && gx < 0.82 && gy > 0.22 && gy < 0.78 ? Math.sin(gy * Math.PI * 22) * 0.5 + 0.5 : 0;
            const rivet = Math.hypot(gx - 0.065, gy - 0.065) < 0.018 || Math.hypot(gx - 0.935, gy - 0.935) < 0.018 || Math.hypot(gx - 0.935, gy - 0.065) < 0.018 || Math.hypot(gx - 0.065, gy - 0.935) < 0.018 || Math.hypot(gx - 0.5, gy - 0.065) < 0.015 || Math.hypot(gx - 0.5, gy - 0.935) < 0.015 ? 1 : 0;
            h = sstep(0, 0.018, seam) * 0.62 - (seam < 5e-3 ? 0.2 : 0) + rivet * 0.24 - louver * 0.22 + f * 0.07 + pid * 0.14 - scratch * 0.05;
            t = 0.34 + pid * 0.3 + f * 0.18 + (brush - 0.5) * 0.08 - grime * 0.32 - louver * 0.2 + scratch * 0.22;
            r = 0.28 + f * 0.28 + grime * 0.32 + louver * 0.15 - scratch * 0.14;
            if (pid > 0.91 && (gx + gy) * 6 % 1 < 0.5) {
              const chip = sstep(0.35, 0.65, f);
              direct = [0.78 * (0.6 + 0.4 * chip), 0.6 * (0.6 + 0.4 * chip), 0.08];
              r = 0.48;
            }
            break;
          }
          case "crystal": {
            N.worley(u, v, 8, w);
            N.worley(u, v, 19, w2);
            const facet = w[2];
            const f = N.fbm(u, v, 4, 4);
            const edgeC = 1 - sstep(0, 0.038, w[1] - w[0]);
            const subEdge = (1 - sstep(0, 0.025, w2[1] - w2[0])) * 0.45;
            const ang = w[3] * Math.PI;
            const stria = Math.sin((u * Math.cos(ang) + v * Math.sin(ang)) * 90) * 0.035;
            const inner = sstep(0.34, 0, w[0]) * facet;
            h = 0.42 + facet * 0.38 + w2[2] * 0.1 + stria - edgeC * 0.42 - subEdge * 0.15 + f * 0.08;
            t = facet * 0.62 + w2[2] * 0.15 + f * 0.2 + inner * 0.24 + edgeC * 0.12;
            r = 0.08 + f * 0.2 + edgeC * 0.32 + subEdge * 0.15;
            e = facet > 0.68 ? (facet - 0.68) * 2.5 * (0.5 + inner) : edgeC * 0.12;
            break;
          }
        }
        if (direct) {
          col[0] = direct[0];
          col[1] = direct[1];
          col[2] = direct[2];
        } else ramp(cols, t, col);
        C[i * 3] = col[0];
        C[i * 3 + 1] = col[1];
        C[i * 3 + 2] = col[2];
        H[i] = clamp01(h);
        R[i] = Math.max(0.12, Math.min(1, r));
        if (E) E[i] = clamp01(e);
      }
    }
    const rad = Math.max(2, Math.round(size / 112));
    const Hb = blur(blur(H, size, rad), size, rad);
    const Hb2 = blur(H, size, Math.max(1, rad >> 2));
    const map = new Uint8Array(size * size * 4), nrm = new Uint8Array(size * size * 4), rh = new Uint8Array(size * size * 4);
    const strength = kind === "metal" || kind === "cityRoad" || kind === "oovoRoad" ? 6.4 : kind === "rock" || kind === "basalt" || kind === "cracked" ? 6 : isRoad ? 4.6 : 5.5;
    const sc = strength * size / 512;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xm = (x - 1 + size) % size, xp = (x + 1) % size, ym = (y - 1 + size) % size * size, yp = (y + 1) % size * size, yr = y * size;
      const tl = Hb2[ym + xm], tc = Hb2[ym + x], tr = Hb2[ym + xp], ml = Hb2[yr + xm], mr = Hb2[yr + xp], bl = Hb2[yp + xm], bc = Hb2[yp + x], br = Hb2[yp + xp];
      const gxS = tr + 2 * mr + br - (tl + 2 * ml + bl), gyS = bl + 2 * bc + br - (tl + 2 * tc + tr);
      const gxF = (H[yr + xp] - H[yr + xm]) * 2.2, gyF = (H[yp + x] - H[ym + x]) * 2.2;
      const gx = gxS * 0.72 + gxF * 0.28, gy = gyS * 0.72 + gyF * 0.28;
      let nx = -gx * sc * 0.25, ny = -gy * sc * 0.25, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const cav = clamp01(0.5 + (H[i] - Hb[i]) * 3.8 + (H[i] - Hb2[i]) * 1.4);
      const ao = 0.56 + 0.44 * Math.min(1, cav * 1.28);
      const coolCav = kind === "snow" || kind === "ice" ? (1 - ao) * 0.22 : 0;
      const tint = 0.91 + 0.18 * N.noise(x / size * 6, y / size * 6, 6);
      map[i * 4] = Math.min(255, C[i * 3] * (ao - coolCav * 0.5) * tint * 255);
      map[i * 4 + 1] = Math.min(255, C[i * 3 + 1] * ao * (0.45 + tint * 0.55) * 255);
      map[i * 4 + 2] = Math.min(255, C[i * 3 + 2] * Math.min(1.06, ao + coolCav) * 255);
      map[i * 4 + 3] = H[i] * 255;
      const roughOut = clamp01(R[i] + (0.5 - cav) * 0.22);
      nrm[i * 4] = (nx * 0.5 + 0.5) * 255;
      nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[i * 4 + 3] = roughOut * 255;
      rh[i * 4] = H[i] * 255;
      rh[i * 4 + 1] = roughOut * 255;
      rh[i * 4 + 2] = cav * 255;
      rh[i * 4 + 3] = 255;
    }
    const out = { map, nrm, rh };
    if (E) {
      const ec = hexToRgb(emissiveColor || (kind === "cityRoad" ? "#ff3ad0" : kind === "crystal" ? "#c87aff" : kind === "oovoRoad" ? "#3ad8ff" : kind === "oovoWall" ? "#a060ff" : "#ff5a10"));
      const em = new Uint8Array(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        const ev = E[i], hot = Math.max(0, ev - 0.65) * 0.9;
        em[i * 4] = Math.min(255, (ev * ec[0] + hot * 0.35) * 255);
        em[i * 4 + 1] = Math.min(255, (ev * ec[1] + hot * 0.25) * 255);
        em[i * 4 + 2] = Math.min(255, (ev * ec[2] + hot * 0.08) * 255);
        em[i * 4 + 3] = 255;
      }
      out.em = em;
    }
    return out;
  }

  // ../../src/game/texWorker.ts
  var ctx = self;
  ctx.onmessage = (e) => {
    const t0 = performance.now();
    const j = e.data, b = computeTexture(j.kind, j.palette, j.size, j.seed, j.emissive);
    const tr = [b.map.buffer, b.nrm.buffer, b.rh.buffer];
    if (b.em) tr.push(b.em.buffer);
    ctx.postMessage({ id: j.id, ms: Math.round(performance.now() - t0), ...b }, tr);
  };
})();
