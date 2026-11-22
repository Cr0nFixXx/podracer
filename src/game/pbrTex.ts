// ===== Session 20: real PBR photo texture sets (CC0, Poly Haven / ambientCG – see tools/photos/pbr.py and README "Bildnachweis") =====
// Each set is three JPEGs: <name>_c (albedo), <name>_n (tangent normal, OpenGL), <name>_p (R = AO, G = roughness, B = height),
// optionally <name>_e (emission). At load time a set is packed into the game's TexSet layout (map = albedo + height in A,
// normalMap = normal + roughness in A) and its albedo is graded to the palette of the world: the photo keeps all its structure and
// colour variation, but its average colour becomes the palette's mid tone (so Tatooine rock stays warm and Ando Prime ice stays blue).
// Browser only (canvas). Without registered sets (node CI, `?nophoto`) the procedural kind of the request is used instead.
import type { TexBytes } from './texCore';

export interface PbrUrls { c: string; n: string; p: string; e?: string }
const sets = new Map<string, PbrUrls>();
export function registerPbr(all: Record<string, PbrUrls>) { for (const [k, v] of Object.entries(all)) sets.set(k, v); }
export const hasPbr = (name: string | undefined) => !!name && sets.has(name) && typeof document !== 'undefined';

const pix = new Map<string, Promise<Uint8ClampedArray | null>>();
function pixels(url: string, size: number): Promise<Uint8ClampedArray | null> {
  const key = size + '|' + url.length + '|' + url.slice(-48);
  let p = pix.get(key);
  if (!p) {
    p = new Promise<Uint8ClampedArray | null>(res => {
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d', { willReadFrequently: true })!;
          x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, size, size); res(x.getImageData(0, 0, size, size).data);
        } catch { res(null); }
      };
      im.onerror = () => res(null); im.src = url;
    });
    pix.set(key, p);
    void p.then(() => setTimeout(() => pix.delete(key), 4000)); // decoded pixels are only needed while a world is being built
  }
  return p;
}
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Packs a photo set into TexBytes (null when the set is missing or cannot be decoded). `gradeAmt` 0 = original photo colours. */
export async function pbrBytes(name: string, size: number, palette: string[], gradeAmt = 1): Promise<TexBytes | null> {
  const u = sets.get(name); if (!u || typeof document === 'undefined') return null;
  const [c, n, p, e] = await Promise.all([pixels(u.c, size), pixels(u.n, size), pixels(u.p, size), u.e ? pixels(u.e, size) : Promise.resolve(null)]);
  if (!c || !n || !p) return null;
  const N = size * size, map = new Uint8Array(N * 4), nrm = new Uint8Array(N * 4), rh = new Uint8Array([128, 200, 255, 255]); // rh: 1×1 (unused by the materials)
  // --- colour grade: per-channel gain so the photo's mean hits the palette mid tone, shadows lean to the dark, lights to the bright tone
  let mr = 0, mg = 0, mb = 0; for (let i = 0; i < N * 4; i += 16) { mr += c[i]; mg += c[i + 1]; mb += c[i + 2]; }
  const k = 4 / N; mr *= k; mg *= k; mb *= k;
  const [d0, m0, l0] = [palette[0], palette[1], palette[2]].map(hex), lum = (r: number, g: number, b: number) => r * 0.3 + g * 0.59 + b * 0.11;
  const gain = (t: number, m: number) => 1 + (Math.max(0.2, Math.min(6, t / Math.max(4, m))) - 1) * gradeAmt;
  const gr = gain(m0[0], mr), gg = gain(m0[1], mg), gb = gain(m0[2], mb), mL = Math.max(8, lum(mr * gr, mg * gg, mb * gb));
  for (let i = 0, j = 0; j < N; i += 4, j++) {
    let r = c[i] * gr, g = c[i + 1] * gg, b = c[i + 2] * gb;
    const t = Math.max(-1, Math.min(1, (lum(r, g, b) / mL - 1) * 1.3)) * 0.42 * gradeAmt;
    if (t > 0) { r += (l0[0] - r) * t; g += (l0[1] - g) * t; b += (l0[2] - b) * t; } else { r += (d0[0] - r) * -t; g += (d0[1] - g) * -t; b += (d0[2] - b) * -t; }
    const ao = 0.6 + 0.4 * p[i] / 255;
    map[i] = Math.min(255, r * ao); map[i + 1] = Math.min(255, g * ao); map[i + 2] = Math.min(255, b * ao); map[i + 3] = p[i + 2];
    // the image's top row lands on v = 0 → the green (v) component flips to stay consistent with the procedural normal maps
    nrm[i] = n[i]; nrm[i + 1] = 255 - n[i + 1]; nrm[i + 2] = n[i + 2]; nrm[i + 3] = p[i + 1];
  }
  const out: TexBytes = { map, nrm, rh };
  if (e) { const em = new Uint8Array(N * 4); em.set(e); out.em = em; }
  return out;
}
