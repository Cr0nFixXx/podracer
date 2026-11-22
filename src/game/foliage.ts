// ===== Session 18: HQ foliage – tree atlas (real bark photo + drawn leaf sprigs with alpha) and its material =====
import * as THREE from 'three';
import { photoImage } from './photoTex';

/** Atlas layout (1024 × 512), also used by decorGeo.jungleTreeGeometry:
 *   u 0 … 0.5            bark (tileable photo; procedural streaks as fallback)
 *   u 0.5 … 1, v < 0.92  four leaf-sprig tiles (2 × 2) with alpha
 *   u 0.5 … 1, v > 0.92  white opaque strip for untextured parts (canopy core)                      */
export const LEAF_TILE = (q: number): [number, number, number, number] => { // [u0, v0, u1, v1] of sprig tile q (0..3)
  const x0 = 512 + (q % 2) * 256 + 3, y0 = 40 + Math.floor(q / 2) * 236 + 3;
  return [x0 / 1024, 1 - (y0 + 230) / 512, (x0 + 250) / 1024, 1 - y0 / 512];
};
export const PLAIN_UV: [number, number] = [0.75, 0.962];

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function treeMaterial(disp: { dispose: () => void }[]) {
  const W = 1024, H = 512, r = mulberry(4711);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  const a = document.createElement('canvas'); a.width = W; a.height = H; const ax = a.getContext('2d')!;
  const bark = photoImage('bark');
  if (bark) { x.drawImage(bark, 0, 0, 512, 512); x.fillStyle = 'rgba(96,78,58,0.42)'; x.fillRect(0, 0, 512, 512); } // photo, contrast toned down
  else { x.fillStyle = '#6a5a48'; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '30,22,14' : '150,130,104'},${0.1 + r() * 0.25})`; x.fillRect(r() * 512, r() * 512, 2 + r() * 5, 20 + r() * 90); } }
  ax.fillStyle = '#fff'; ax.fillRect(0, 0, 512, 512);
  x.fillStyle = '#2c5a1c'; x.fillRect(512, 0, 512, 512);   // leaf green under the alpha edges → no dark fringes in the mip chain
  ax.fillStyle = '#000'; ax.fillRect(512, 0, 512, 512);
  const leaf = (cx: number, cy: number, len: number, wid: number, ang: number, hue: number, lig: number) => {
    for (const [ctx, col] of [[x, ''], [ax, '#fff']] as [CanvasRenderingContext2D, string][]) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.42, -wid, len, 0); ctx.quadraticCurveTo(len * 0.42, wid, 0, 0);
      if (col) ctx.fillStyle = col; else { const g = ctx.createLinearGradient(0, -wid, 0, wid); g.addColorStop(0, `hsl(${hue},55%,${lig + 9}%)`); g.addColorStop(0.5, `hsl(${hue},58%,${lig}%)`); g.addColorStop(1, `hsl(${hue + 8},50%,${lig - 7}%)`); ctx.fillStyle = g; }
      ctx.fill();
      if (!col) { ctx.strokeStyle = `hsla(${hue - 10},45%,${lig + 20}%,0.7)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.94, 0); ctx.stroke(); }
      ctx.restore();
    }
  };
  for (let q = 0; q < 4; q++) {
    const x0 = 512 + (q % 2) * 256, y0 = 40 + Math.floor(q / 2) * 236;
    for (const ctx of [x, ax]) { ctx.save(); ctx.beginPath(); ctx.rect(x0 + 3, y0 + 3, 250, 230); ctx.clip(); }
    for (let s = 0; s < 13; s++) { // sprigs: a twig with alternating leaves
      const ox = x0 + 40 + r() * 176, oy = y0 + 40 + r() * 156, dir = r() * Math.PI * 2, n = 6 + Math.floor(r() * 5), step = 13 + r() * 6, hue = 82 + r() * 44, lig = 20 + r() * 20;
      x.strokeStyle = '#3a2c18'; x.lineWidth = 2; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + Math.cos(dir) * step * n * 0.5, oy + Math.sin(dir) * step * n * 0.5); x.stroke();
      ax.strokeStyle = '#fff'; ax.lineWidth = 2; ax.beginPath(); ax.moveTo(ox, oy); ax.lineTo(ox + Math.cos(dir) * step * n * 0.5, oy + Math.sin(dir) * step * n * 0.5); ax.stroke();
      for (let k = 0; k < n; k++) {
        const t = k * step * 0.5, px = ox + Math.cos(dir) * t, py = oy + Math.sin(dir) * t;
        leaf(px, py, 26 + r() * 20 - k, 7 + r() * 5, dir + (k % 2 ? 1 : -1) * (0.55 + r() * 0.5), hue + r() * 10, lig + (r() - 0.5) * 8);
      }
      leaf(ox + Math.cos(dir) * step * n * 0.5, oy + Math.sin(dir) * step * n * 0.5, 30, 9, dir, hue, lig + 4);
    }
    x.restore(); ax.restore();
  }
  x.fillStyle = '#fff'; x.fillRect(512, 0, 512, 40); ax.fillStyle = '#fff'; ax.fillRect(512, 0, 512, 40);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const alphaMap = new THREE.CanvasTexture(a); alphaMap.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.86, map, alphaMap, alphaTest: 0.4, side: THREE.DoubleSide });
  disp.push(m, map, alphaMap);
  return m;
}

/** Session 20 – HQ snow pine atlas (same layout as the tree atlas): bark photo (cooler, darker) · tiles 0–2 = fir branches with
 *  needles (twig along the tile's u axis: trunk side left, tip right) · tile 3 = snow patch · plain white strip on top. */
export function pineMaterial(disp: { dispose: () => void }[]) {
  const W = 1024, H = 512, r = mulberry(815);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  const a = document.createElement('canvas'); a.width = W; a.height = H; const ax = a.getContext('2d')!;
  const bark = photoImage('bark');
  if (bark) { x.drawImage(bark, 0, 0, 512, 512); x.fillStyle = 'rgba(58,50,48,0.5)'; x.fillRect(0, 0, 512, 512); }
  else { x.fillStyle = '#4e4640'; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '24,20,18' : '120,108,96'},${0.1 + r() * 0.25})`; x.fillRect(r() * 512, r() * 512, 2 + r() * 4, 24 + r() * 90); } }
  ax.fillStyle = '#fff'; ax.fillRect(0, 0, 512, 512);
  x.fillStyle = '#16301f'; x.fillRect(512, 0, 512, 512); // needle green under the alpha edges (no dark fringes in the mip chain)
  ax.fillStyle = '#000'; ax.fillRect(512, 0, 512, 512);
  const line = (x0: number, y0: number, x1: number, y1: number, w: number, col: string) => {
    x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    ax.strokeStyle = '#fff'; ax.lineWidth = w + 0.9; ax.beginPath(); ax.moveTo(x0, y0); ax.lineTo(x1, y1); ax.stroke();
  };
  const twig = (ox: number, oy: number, dir: number, len: number, wide: number) => { // a twig densely set with needles on both sides
    const dx = Math.cos(dir), dy = Math.sin(dir), n = Math.floor(len / 2.2);
    for (let k = 0; k < n; k++) {
      const t = k / n, px = ox + dx * len * t, py = oy + dy * len * t, nl = wide * (1 - t * 0.55) * (0.75 + r() * 0.5);
      for (const sd of [-1, 1]) { const na = dir + sd * (0.95 + r() * 0.35); line(px, py, px + Math.cos(na) * nl, py + Math.sin(na) * nl, 1.25, `hsl(${128 + r() * 30},${34 + r() * 18}%,${12 + r() * 14}%)`); }
    }
    line(ox, oy, ox + dx * len, oy + dy * len, 1.6, '#3a2c20');
  };
  for (let q = 0; q < 3; q++) {
    const x0 = 512 + (q % 2) * 256, y0 = 40 + Math.floor(q / 2) * 236, yc = y0 + 118;
    for (const ctx of [x, ax]) { ctx.save(); ctx.beginPath(); ctx.rect(x0 + 3, y0 + 3, 250, 230); ctx.clip(); }
    const side = 9 + q; // side twigs: long near the trunk, short at the tip → pennate fir branch
    for (let k = 0; k < side; k++) {
      const t = (k + 0.4) / side, px = x0 + 10 + t * 226, len = (96 - 74 * t) * (0.8 + r() * 0.35);
      for (const sd of [-1, 1]) twig(px, yc, sd * (0.72 + r() * 0.3), len, 10 - 3 * t);
    }
    twig(x0 + 6, yc, 0, 240, 11);
    x.restore(); ax.restore();
  }
  { // tile 3: snow lying on a branch – soft irregular white patches
    const x0 = 512 + 256, y0 = 40 + 236;
    for (const ctx of [x, ax]) { ctx.save(); ctx.beginPath(); ctx.rect(x0 + 3, y0 + 3, 250, 230); ctx.clip(); }
    x.fillStyle = '#eef4fb'; x.fillRect(x0, y0, 256, 236);
    ax.fillStyle = '#fff';
    for (let i = 0; i < 46; i++) { const t = r(), px = x0 + 14 + t * 222, py = y0 + 118 + (r() - 0.5) * (150 - 110 * t), rr = (16 + r() * 22) * (1 - t * 0.5); ax.beginPath(); ax.ellipse(px, py, rr * 1.5, rr * 0.8, r() * 0.6, 0, Math.PI * 2); ax.fill(); }
    x.restore(); ax.restore();
  }
  x.fillStyle = '#fff'; x.fillRect(512, 0, 512, 40); ax.fillStyle = '#fff'; ax.fillRect(512, 0, 512, 40);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const alphaMap = new THREE.CanvasTexture(a); alphaMap.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.84, map, alphaMap, alphaTest: 0.38, side: THREE.DoubleSide });
  disp.push(m, map, alphaMap);
  return m;
}

/** Session 20 – HQ saguaro skin (procedural, one tile = one rib × 0.42 m of column, see `cactusGeometry`): waxy green that darkens
 *  into the valley between two ribs, fine pleats, a few cork scars, and on every rib crest two woolly areoles with a fan of pale spines.
 *  u = 0 / 1 is the crest, u = 0.5 the valley. Opaque – no alpha, no extra pipeline. */
export function cactusMaterial(disp: { dispose: () => void }[]) {
  const W = 128, H = 128, r = mulberry(2207);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#6c9648'); g.addColorStop(0.16, '#557d3a'); g.addColorStop(0.5, '#263f1e'); g.addColorStop(0.84, '#557d3a'); g.addColorStop(1, '#6c9648');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { // pleats: thin vertical streaks, lighter and darker
    const px = r() * W, l = 18 + r() * 60, py = r() * H; x.strokeStyle = r() < 0.5 ? `rgba(150,190,110,${0.05 + r() * 0.08})` : `rgba(18,34,14,${0.06 + r() * 0.1})`; x.lineWidth = 0.8 + r();
    for (const oy of [0, -H]) { x.beginPath(); x.moveTo(px, py + oy); x.lineTo(px + (r() - 0.5) * 2, py + oy + l); x.stroke(); }
  }
  for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(120,96,58,${0.2 + r() * 0.25})`; x.beginPath(); x.ellipse(r() * W, r() * H, 1.5 + r() * 2.5, 2 + r() * 5, 0, 0, Math.PI * 2); x.fill(); } // cork scars
  for (const cy of [H * 0.25, H * 0.75]) for (const cx of [0, W]) { // areoles on the crest (drawn on both tile edges → seamless)
    x.strokeStyle = 'rgba(236,226,190,0.9)'; x.lineWidth = 1;
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + r() * 0.4, l = 11 + r() * 9; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.8); x.stroke(); }
    const w = x.createRadialGradient(cx, cy, 0, cx, cy, 5.5); w.addColorStop(0, 'rgba(232,220,188,1)'); w.addColorStop(0.6, 'rgba(190,172,130,0.9)'); w.addColorStop(1, 'rgba(120,110,70,0)');
    x.fillStyle = w; x.beginPath(); x.arc(cx, cy, 5.5, 0, Math.PI * 2); x.fill();
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map, color: '#f4f8ee', roughness: 0.74 });
  disp.push(map, mat);
  return mat;
}
