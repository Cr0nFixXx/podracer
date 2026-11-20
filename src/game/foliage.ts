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
  if (bark) x.drawImage(bark, 0, 0, 512, 512);
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
