import * as THREE from 'three';

/**
 * Procedural, tileable PBR texture sets for the podracers (generated once, shared by all pods).
 *  normal : tangent-space normal map (panel seams, rivets, hatches, vents, hex grates, scratches)
 *  mask   : R = ambient occlusion, G = roughness, B = wear potential (chipped paint), A = grime
 *  decal  : R = dark stencil (labels / numbers / stripes), G = hazard yellow, B = emissive lights
 */
export interface HullTex { normal: THREE.DataTexture; mask: THREE.DataTexture; decal: THREE.DataTexture; }

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class TNoise {
  v = new Float32Array(256 * 256);
  constructor(seed: number) { const r = mulberry(seed); for (let i = 0; i < this.v.length; i++) this.v[i] = r(); }
  at(ix: number, iy: number, p: number) { ix = ((ix % p) + p) % p; iy = ((iy % p) + p) % p; return this.v[(iy & 255) * 256 + (ix & 255)]; }
  /** tileable value noise, u,v in [0,1), integer frequency p */
  n(u: number, v: number, p: number) {
    const x = u * p, y = v * p; const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.at(ix, iy, p), b = this.at(ix + 1, iy, p), c = this.at(ix, iy + 1, p), d = this.at(ix + 1, iy + 1, p);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /** anisotropic tileable noise with separate integer frequencies */
  n2(u: number, v: number, px: number, py: number) {
    const x = u * px, y = v * py; const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = (i: number, j: number) => this.v[((((j % py) + py) % py) & 255) * 256 + ((((i % px) + px) % px) & 255)];
    const a = w(ix, iy), b = w(ix + 1, iy), c = w(ix, iy + 1), d = w(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  fbm(u: number, v: number, base: number, oct: number) { let s = 0, a = 1, nn = 0, p = base; for (let o = 0; o < oct; o++) { s += this.n(u, v, p) * a; nn += a; a *= 0.5; p *= 2; } return s / nn; }
}

function blur(src: Float32Array, size: number, r: number) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length); const inv = 1 / (2 * r + 1);
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

function dataTex(d: Uint8Array, size: number, srgb = false, aniso = 8) {
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

function normalFromHeight(h: Float32Array, size: number, strength: number, out: Uint8Array) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = (x - 1 + size) % size, xp = (x + 1) % size, ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yr = y * size;
    const gx = (h[ym + xp] + 2 * h[yr + xp] + h[yp + xp]) - (h[ym + xm] + 2 * h[yr + xm] + h[yp + xm]);
    const gy = (h[yp + xm] + 2 * h[yp + x] + h[yp + xp]) - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
    let nx = -gx * strength, ny = -gy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (yr + x) * 4; out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
}

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const gray = (v: number) => { const c = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${c},${c},${c})`; };

const LABELS = ['RADON-ULZER 620C', 'NO STEP', 'COLLOR PONDRAT', 'HIGH VOLTAGE', 'PLUG-F MAMMOTH', '⚠ HOT', 'BOONTA EVE', 'MK-IV', 'SERVICE', 'IGNITION', 'FUEL 3', 'BINDER COIL', 'QUADRALUX', 'DO NOT OPEN', 'TURBINE 2', '▲ LIFT', 'XR-7', 'MOTO-P', 'VOLT', 'REPULSOR'];

const hullCache = new Map<number, HullTex>();

export function hullTextures(size = 1024): HullTex {
  const hit = hullCache.get(size); if (hit) return hit;
  const S = size, k = S / 1024; const rnd = mulberry(9137); const N = new TNoise(4711);
  const canv = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c.getContext('2d', { willReadFrequently: true })!; };
  const H = canv(), Dk = canv(), Hz = canv(), Em = canv(), Wr = canv();
  H.fillStyle = gray(46); H.fillRect(0, 0, S, S);
  for (const c of [Dk, Hz, Em, Wr]) { c.fillStyle = '#000'; c.fillRect(0, 0, S, S); }

  // ---- panel layout: recursive subdivision snapped to a 1/32 grid ----
  const grid = S / 32; const panels: { x: number; y: number; w: number; h: number }[] = [];
  const split = (x: number, y: number, w: number, h: number, d: number) => {
    const stop = d >= 6 || (w <= grid * 3 && h <= grid * 3) || (d > 1 && rnd() < 0.18);
    if (stop) { panels.push({ x, y, w, h }); return; }
    const vert = w > h ? rnd() < 0.8 : rnd() < 0.2;
    const len = vert ? w : h; const cells = Math.round(len / grid); if (cells < 2) { panels.push({ x, y, w, h }); return; }
    const c = Math.max(1, Math.min(cells - 1, Math.round(cells * (0.3 + rnd() * 0.4)))); const t = c * grid;
    if (vert) { split(x, y, t, h, d + 1); split(x + t, y, w - t, h, d + 1); } else { split(x, y, w, t, d + 1); split(x, y + t, w, h - t, d + 1); }
  };
  split(0, 0, S, S, 0);

  const seam = Math.max(2, 2.6 * k);
  const rivet = (x: number, y: number, r: number) => {
    const g = H.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, gray(250)); g.addColorStop(0.7, gray(205)); g.addColorStop(1, gray(150)); H.fillStyle = g; H.beginPath(); H.arc(x, y, r, 0, Math.PI * 2); H.fill();
  };
  const screw = (x: number, y: number, r: number) => {
    H.fillStyle = gray(70); H.beginPath(); H.arc(x, y, r * 1.35, 0, 7); H.fill(); rivet(x, y, r);
    H.strokeStyle = gray(60); H.lineWidth = Math.max(1, r * 0.35); const a = rnd() * Math.PI; H.beginPath(); H.moveTo(x - Math.cos(a) * r * 0.8, y - Math.sin(a) * r * 0.8); H.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); H.stroke();
  };

  for (const p of panels) {
    const base = 150 + (rnd() - 0.5) * 36;
    const x = p.x + seam / 2, y = p.y + seam / 2, w = p.w - seam, h = p.h - seam;
    // pillowed panel: brighter centre, slightly lower rim
    H.fillStyle = gray(base - 14); rrect(H, x, y, w, h, 3 * k); H.fill();
    H.fillStyle = gray(base); rrect(H, x + 3 * k, y + 3 * k, w - 6 * k, h - 6 * k, 3 * k); H.fill();
    const big = w > 90 * k && h > 70 * k; const r = rnd();
    // rivet rows along the panel border
    if (rnd() < 0.5) {
      const ins = 7 * k, step = 13 * k, rr = 2.3 * k;
      for (let t = x + ins; t < x + w - ins; t += step) { rivet(t, y + ins, rr); rivet(t, y + h - ins, rr); }
      for (let t = y + ins + step; t < y + h - ins - step * 0.5; t += step) { rivet(x + ins, t, rr); rivet(x + w - ins, t, rr); }
    }
    if (big && r < 0.22) {
      // access hatch with screws + label
      const hx = x + w * 0.16, hy = y + h * 0.18, hw = w * 0.68, hh = h * 0.64;
      H.strokeStyle = gray(52); H.lineWidth = 2.4 * k; rrect(H, hx, hy, hw, hh, 6 * k); H.stroke();
      H.fillStyle = gray(base + 10); rrect(H, hx + 2 * k, hy + 2 * k, hw - 4 * k, hh - 4 * k, 5 * k); H.fill();
      for (const [sx, sy] of [[hx + 8 * k, hy + 8 * k], [hx + hw - 8 * k, hy + 8 * k], [hx + 8 * k, hy + hh - 8 * k], [hx + hw - 8 * k, hy + hh - 8 * k]]) screw(sx, sy, 2.6 * k);
      if (hw > 80 * k) { Dk.fillStyle = '#fff'; Dk.font = `bold ${Math.round(10 * k)}px monospace`; Dk.textBaseline = 'middle'; Dk.fillText(LABELS[Math.floor(rnd() * LABELS.length)], hx + 14 * k, hy + hh / 2, hw - 28 * k); }
    } else if (big && r < 0.42) {
      // louvre vents
      const vx = x + w * 0.12, vy = y + h * 0.15, vw = w * 0.76, vh = h * 0.7; const horiz = rnd() < 0.6; const n = Math.max(3, Math.floor((horiz ? vh : vw) / (9 * k)));
      H.fillStyle = gray(60); rrect(H, vx - 3 * k, vy - 3 * k, vw + 6 * k, vh + 6 * k, 4 * k); H.fill();
      for (let i = 0; i < n; i++) {
        const t = i / n;
        if (horiz) { const yy = vy + t * vh; const g = H.createLinearGradient(0, yy, 0, yy + vh / n); g.addColorStop(0, gray(30)); g.addColorStop(0.55, gray(120)); g.addColorStop(1, gray(200)); H.fillStyle = g; H.fillRect(vx, yy + 1, vw, vh / n - 2 * k); }
        else { const xx = vx + t * vw; const g = H.createLinearGradient(xx, 0, xx + vw / n, 0); g.addColorStop(0, gray(30)); g.addColorStop(0.55, gray(120)); g.addColorStop(1, gray(200)); H.fillStyle = g; H.fillRect(xx + 1, vy, vw / n - 2 * k, vh); }
      }
    } else if (big && r < 0.56) {
      // hex grate
      const gx0 = x + 8 * k, gy0 = y + 8 * k, gw = w - 16 * k, gh = h - 16 * k; const hr = 6 * k;
      H.save(); rrect(H, gx0, gy0, gw, gh, 4 * k); H.clip(); H.fillStyle = gray(40); H.fillRect(gx0, gy0, gw, gh);
      H.fillStyle = gray(170);
      for (let yy = gy0; yy < gy0 + gh + hr; yy += hr * 1.5) for (let xx = gx0, c = 0; xx < gx0 + gw + hr; xx += hr * 1.732, c++) {
        const oy = (c % 2) * hr * 0.75; H.beginPath(); for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2 + Math.PI / 6; H.lineTo(xx + Math.cos(a) * hr * 0.78, yy + oy + Math.sin(a) * hr * 0.78); } H.closePath(); H.fill();
      }
      H.restore();
    } else if (r < 0.66 && w > 40 * k && h > 40 * k) {
      // circular port / filler cap
      const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.3;
      H.strokeStyle = gray(50); H.lineWidth = 3 * k; H.beginPath(); H.arc(cx, cy, R, 0, 7); H.stroke();
      const g = H.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 0.85); g.addColorStop(0, gray(215)); g.addColorStop(1, gray(165)); H.fillStyle = g; H.beginPath(); H.arc(cx, cy, R * 0.82, 0, 7); H.fill();
      for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2; screw(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, 1.8 * k); }
      if (rnd() < 0.35) { Em.fillStyle = '#fff'; Em.beginPath(); Em.arc(cx, cy, R * 0.18, 0, 7); Em.fill(); }
    } else if (r < 0.76 && w > 50 * k) {
      // raised doubler plate
      const dx = x + w * 0.1, dy = y + h * 0.1, dw = w * 0.8, dh = h * 0.8;
      H.fillStyle = gray(base + 26); rrect(H, dx, dy, dw, dh, 5 * k); H.fill();
      for (let t = dx + 6 * k; t < dx + dw - 4 * k; t += 11 * k) { rivet(t, dy + 5 * k, 1.9 * k); rivet(t, dy + dh - 5 * k, 1.9 * k); }
    }
    // stencilled labels / numbers
    if (rnd() < 0.2 && w > 60 * k && h > 24 * k) {
      Dk.fillStyle = '#fff'; Dk.font = `bold ${Math.round((8 + rnd() * 6) * k)}px monospace`; Dk.textBaseline = 'top';
      Dk.fillText(rnd() < 0.5 ? LABELS[Math.floor(rnd() * LABELS.length)] : `${Math.floor(rnd() * 90 + 10)}-${String.fromCharCode(65 + Math.floor(rnd() * 26))}`, x + 6 * k, y + h - 18 * k, w - 12 * k);
    }
    // hazard stripe strip
    if (rnd() < 0.08 && w > 70 * k) {
      const sh = 11 * k, sy = y + 4 * k;
      Hz.save(); Dk.save(); Hz.beginPath(); Hz.rect(x + 4 * k, sy, w - 8 * k, sh); Hz.clip(); Dk.beginPath(); Dk.rect(x + 4 * k, sy, w - 8 * k, sh); Dk.clip();
      for (let t = x - sh; t < x + w + sh; t += sh * 1.4) { Hz.fillStyle = '#fff'; Hz.beginPath(); Hz.moveTo(t, sy + sh); Hz.lineTo(t + sh * 0.7, sy + sh); Hz.lineTo(t + sh * 1.4, sy); Hz.lineTo(t + sh * 0.7, sy); Hz.fill(); Dk.fillStyle = '#fff'; Dk.beginPath(); Dk.moveTo(t + sh * 0.7, sy + sh); Dk.lineTo(t + sh * 1.4, sy + sh); Dk.lineTo(t + sh * 2.1, sy); Dk.lineTo(t + sh * 1.4, sy); Dk.fill(); }
      Hz.restore(); Dk.restore();
    }
    // status LEDs
    if (rnd() < 0.12 && w > 40 * k) { const n = 2 + Math.floor(rnd() * 4); for (let i = 0; i < n; i++) { const lx = x + w - 10 * k - i * 8 * k, ly = y + 9 * k; H.fillStyle = gray(70); H.beginPath(); H.arc(lx, ly, 3 * k, 0, 7); H.fill(); Em.fillStyle = '#fff'; Em.beginPath(); Em.arc(lx, ly, 2.1 * k, 0, 7); Em.fill(); } }
    // glowing conduit groove
    if (rnd() < 0.06 && w > 80 * k && h > 40 * k) {
      const yy = y + h * (0.3 + rnd() * 0.4); H.strokeStyle = gray(40); H.lineWidth = 5 * k; H.lineJoin = 'round';
      const pts: [number, number][] = [[x + 8 * k, yy], [x + w * 0.4, yy], [x + w * 0.5, yy - 10 * k], [x + w - 8 * k, yy - 10 * k]];
      for (const c of [H, Em]) { c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); }
      H.stroke(); Em.strokeStyle = '#fff'; Em.lineWidth = 2 * k; Em.lineJoin = 'round'; Em.stroke();
    }
  }
  // scratches (wear + slightly lower height), drawn wrap-around
  for (let i = 0; i < 260; i++) {
    const x0 = rnd() * S, y0 = rnd() * S, a = rnd() * Math.PI * 2, l = (10 + rnd() * 50) * k;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x0 + ox < -l || x0 + ox > S + l || y0 + oy < -l || y0 + oy > S + l) continue;
      Wr.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`; Wr.lineWidth = (0.6 + rnd() * 1.1) * k;
      Wr.beginPath(); Wr.moveTo(x0 + ox, y0 + oy); Wr.quadraticCurveTo(x0 + ox + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 6 * k, y0 + oy + Math.sin(a) * l * 0.5, x0 + ox + Math.cos(a) * l, y0 + oy + Math.sin(a) * l); Wr.stroke();
    }
  }

  // ---- pixel passes ----
  const n = S * S;
  const read = (c: CanvasRenderingContext2D) => { const d = c.getImageData(0, 0, S, S).data; const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i * 4] / 255; return o; };
  const hRaw = read(H), dk = read(Dk), hz = read(Hz), em = read(Em), wr = read(Wr);
  for (let i = 0; i < n; i++) hRaw[i] -= wr[i] * 0.05;
  const hS = blur(hRaw, S, 1);
  const hB = blur(blur(hRaw, S, Math.max(2, Math.round(6 * k))), S, Math.max(2, Math.round(6 * k)));
  const nrm = new Uint8Array(n * 4), mask = new Uint8Array(n * 4), dec = new Uint8Array(n * 4);
  normalFromHeight(hS, S, 1.6 * Math.max(1, k * 0.8), nrm);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const u = x / S, v = y / S;
    const cav = Math.max(0, Math.min(1, 0.5 + (hRaw[i] - hB[i]) * 2.6));
    const ao = 0.58 + 0.42 * Math.min(1, cav * 1.8);
    const xm = (x - 1 + S) % S, xp = (x + 1) % S, ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S;
    const grad = Math.hypot(hS[y * S + xp] - hS[y * S + xm], hS[yp + x] - hS[ym + x]);
    const n1 = N.fbm(u, v, 8, 5), n2 = N.fbm(u + 0.37, v + 0.11, 24, 3);
    const edge = Math.min(1, grad * 9) * (cav > 0.5 ? 1 : 0.25);
    let wear = edge * (0.35 + 1.1 * n1) + wr[i] * 0.85 + Math.max(0, n2 - 0.7) * 2.2;
    wear = Math.max(0, Math.min(1, wear));
    const streak = N.n2(u, v, 96, 6) * N.n2(u + 0.5, v, 24, 3);
    const grime = Math.max(0, Math.min(1, (1 - cav) * 1.1 + Math.max(0, streak - 0.35) * 0.9 + (n1 - 0.5) * 0.4));
    const rough = Math.max(0, Math.min(1, 0.45 + (n2 - 0.5) * 0.45 + (1 - cav) * 0.25 - wr[i] * 0.2));
    mask[i * 4] = ao * 255; mask[i * 4 + 1] = rough * 255; mask[i * 4 + 2] = wear * 255; mask[i * 4 + 3] = grime * 255;
    dec[i * 4] = dk[i] * 255; dec[i * 4 + 1] = hz[i] * 255; dec[i * 4 + 2] = em[i] * 255; dec[i * 4 + 3] = 255;
  }
  const out: HullTex = { normal: dataTex(nrm, S), mask: dataTex(mask, S), decal: dataTex(dec, S) };
  hullCache.set(size, out);
  return out;
}

// ---------------- cockpit interior (quilted padding + instrument panels) ----------------
let interiorCache: { map: THREE.Texture; emissive: THREE.Texture; normal: THREE.DataTexture } | null = null;
export function interiorTextures() {
  if (interiorCache) return interiorCache;
  const S = 1024; const rnd = mulberry(331);
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d')!;
  const ev = document.createElement('canvas'); ev.width = ev.height = S; const e = ev.getContext('2d')!;
  const hv = document.createElement('canvas'); hv.width = hv.height = S; const h = hv.getContext('2d', { willReadFrequently: true })!;
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S); h.fillStyle = gray(120); h.fillRect(0, 0, S, S);
  c.fillStyle = '#2a211c'; c.fillRect(0, 0, S, S);
  // quilted leather (top 60 %)
  const q = 64;
  for (let y = 0; y < S * 0.6; y += q) for (let x = 0; x < S; x += q) {
    for (let r = 0; r < 2; r++) {
      const cx = x + (r ? q / 2 : 0), cy = y + (r ? q / 2 : 0);
      const g = h.createRadialGradient(cx, cy, 2, cx, cy, q * 0.55); g.addColorStop(0, gray(200)); g.addColorStop(1, gray(90));
      h.fillStyle = g; h.beginPath(); h.moveTo(cx, cy - q / 2); h.lineTo(cx + q / 2, cy); h.lineTo(cx, cy + q / 2); h.lineTo(cx - q / 2, cy); h.closePath(); h.fill();
      const cg = c.createRadialGradient(cx, cy, 2, cx, cy, q * 0.55); cg.addColorStop(0, '#4a3a30'); cg.addColorStop(1, '#241a15');
      c.fillStyle = cg; c.beginPath(); c.moveTo(cx, cy - q / 2); c.lineTo(cx + q / 2, cy); c.lineTo(cx, cy + q / 2); c.lineTo(cx - q / 2, cy); c.closePath(); c.fill();
      c.fillStyle = '#8a7a60'; c.beginPath(); c.arc(cx, cy - q / 2, 2.5, 0, 7); c.fill();
    }
  }
  // instrument / switch panels (bottom 40 %)
  const y0 = Math.floor(S * 0.6);
  c.fillStyle = '#15171c'; c.fillRect(0, y0, S, S - y0); h.fillStyle = gray(130); h.fillRect(0, y0, S, S - y0);
  for (let px = 0; px < 4; px++) for (let py = 0; py < 2; py++) {
    const x = px * 256 + 12, y = y0 + 12 + py * 200, w = 232, hh = 176;
    c.fillStyle = '#1f232b'; c.fillRect(x, y, w, hh); h.fillStyle = gray(150); h.fillRect(x, y, w, hh);
    c.strokeStyle = '#3a404c'; c.lineWidth = 3; c.strokeRect(x, y, w, hh);
    const kind = (px + py * 2) % 3;
    if (kind === 0) for (let i = 0; i < 3; i++) { // gauges
      const gx = x + 40 + i * 76, gy = y + 70; c.fillStyle = '#0a0c10'; c.beginPath(); c.arc(gx, gy, 30, 0, 7); c.fill(); c.strokeStyle = '#8a929e'; c.lineWidth = 4; c.beginPath(); c.arc(gx, gy, 31, 0, 7); c.stroke();
      e.strokeStyle = i === 1 ? '#ff6040' : '#40d0ff'; e.lineWidth = 3; e.beginPath(); e.arc(gx, gy, 22, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * rnd())); e.stroke();
      e.fillStyle = '#ffffff'; e.fillRect(gx - 1, gy - 20, 2, 20);
    } else if (kind === 1) for (let i = 0; i < 8; i++) { // toggles
      const tx = x + 22 + i * 27, ty = y + 40; c.fillStyle = '#0b0d12'; c.fillRect(tx - 7, ty - 7, 14, 40); c.fillStyle = '#c0c6d0'; c.fillRect(tx - 2, ty, 4, 18);
      e.fillStyle = i % 3 === 0 ? '#ff4040' : '#40ff90'; e.beginPath(); e.arc(tx, ty + 46, 4, 0, 7); e.fill();
    } else { // screen
      c.fillStyle = '#05080a'; c.fillRect(x + 16, y + 16, w - 32, hh - 60);
      e.strokeStyle = '#40ffb0'; e.lineWidth = 2; e.beginPath(); for (let i = 0; i <= 40; i++) { const xx = x + 20 + i * (w - 40) / 40; const yy = y + 60 + Math.sin(i * 0.6) * 18 * rnd(); i ? e.lineTo(xx, yy) : e.moveTo(xx, yy); } e.stroke();
      e.fillStyle = '#40ffb0'; e.font = 'bold 14px monospace'; e.fillText('PWR ' + Math.floor(rnd() * 900 + 100), x + 22, y + hh - 22);
    }
  }
  const hd = h.getImageData(0, 0, S, S).data; const hh2 = new Float32Array(S * S); for (let i = 0; i < S * S; i++) hh2[i] = hd[i * 4] / 255;
  const nrm = new Uint8Array(S * S * 4); normalFromHeight(blur(hh2, S, 1), S, 2.2, nrm);
  const mk = (cnv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  interiorCache = { map: mk(cv), emissive: mk(ev), normal: dataTex(nrm, S) };
  return interiorCache;
}

// ---------------- braided hose normal map ----------------
let braidCache: THREE.DataTexture | null = null;
export function braidNormal() {
  if (braidCache) return braidCache;
  const S = 128; const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; const a = Math.abs(Math.sin((u * 8 + v * 4) * Math.PI * 2)), b = Math.abs(Math.sin((u * 8 - v * 4) * Math.PI * 2));
    h[y * S + x] = Math.max(a * (((Math.floor(u * 16 + v * 8) % 2) ? 1 : 0.6)), b * (((Math.floor(u * 16 - v * 8 + 64) % 2) ? 0.6 : 1)));
  }
  const d = new Uint8Array(S * S * 4); normalFromHeight(h, S, 1.2, d); braidCache = dataTex(d, S); return braidCache;
}

// ---------------- hazard stripes & carbon weave ----------------
let hazardCache: THREE.CanvasTexture | null = null;
export function hazardTexture() {
  if (hazardCache) return hazardCache;
  const S = 256; const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d')!;
  c.fillStyle = '#d9a514'; c.fillRect(0, 0, S, S); c.fillStyle = '#111';
  for (let i = -S; i < S * 2; i += 64) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 32, 0); c.lineTo(i + 32 - S, S); c.lineTo(i - S, S); c.fill(); }
  const rnd = mulberry(5); c.fillStyle = 'rgba(70,60,50,0.35)'; for (let i = 0; i < 400; i++) c.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 5, 1 + rnd() * 2);
  hazardCache = new THREE.CanvasTexture(cv); hazardCache.colorSpace = THREE.SRGBColorSpace; hazardCache.wrapS = hazardCache.wrapT = THREE.RepeatWrapping; hazardCache.anisotropy = 8;
  return hazardCache;
}
let carbonCache: THREE.CanvasTexture | null = null;
export function carbonTexture() {
  if (carbonCache) return carbonCache;
  const S = 256; const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d')!; const cell = 16;
  for (let y = 0; y < S / cell; y++) for (let x = 0; x < S / cell; x++) {
    const hor = ((x + y) >> 1) % 2 === 0; const g = hor ? c.createLinearGradient(x * cell, 0, x * cell + cell, 0) : c.createLinearGradient(0, y * cell, 0, y * cell + cell);
    g.addColorStop(0, '#0d0e10'); g.addColorStop(0.5, '#2a2c31'); g.addColorStop(1, '#0d0e10'); c.fillStyle = g; c.fillRect(x * cell, y * cell, cell, cell);
  }
  carbonCache = new THREE.CanvasTexture(cv); carbonCache.colorSpace = THREE.SRGBColorSpace; carbonCache.wrapS = carbonCache.wrapT = THREE.RepeatWrapping; carbonCache.anisotropy = 8;
  return carbonCache;
}
