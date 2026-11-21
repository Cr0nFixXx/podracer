// ===== Session 18: real photo textures (Pexels photos, made tileable offline – see HANDOFF) =====
// The photos add real-world micro detail to the procedural texture sets: albedo × photo luminance, normal += photo relief,
// height += photo luminance. Palettes, strata bands and the packed channels of the material pipeline stay untouched.
export interface PhotoDetail { size: number; lum: Float32Array } // luminance, normalised to mean 1, tileable
const photos = new Map<string, PhotoDetail>(), images = new Map<string, HTMLImageElement>();
let ready: Promise<void> | null = null;

export function registerPhotos(urls: Record<string, string>) {
  ready = Promise.all(Object.entries(urls).map(([k, url]) => new Promise<void>(res => {
    const im = new Image();
    im.onload = () => {
      try {
        const S = im.naturalWidth, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(im, 0, 0, S, S); const d = x.getImageData(0, 0, S, S).data, lum = new Float32Array(S * S); let sum = 0;
        for (let i = 0; i < S * S; i++) { lum[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; sum += lum[i]; }
        const m = sum / (S * S) || 1; for (let i = 0; i < S * S; i++) lum[i] /= m;
        photos.set(k, { size: S, lum }); images.set(k, im);
      } catch { /* tainted canvas / no 2D context → procedural only */ }
      res();
    };
    im.onerror = () => res(); im.src = url;
  }))).then(() => undefined);
  return ready;
}
export const photosReady = () => ready ?? Promise.resolve();
export const photoImage = (k: string) => images.get(k);

/** texture kind → [photo, strength] */
const KIND: Record<string, [string, number]> = { rock: ['rock', 0.85], basalt: ['rock', 0.55], sand: ['sand', 0.6], jungle: ['soil', 0.75], mud: ['soil', 0.6], gravel: ['soil', 0.85], cracked: ['soil', 0.4] };
export const hasPhotoFor = (kind: string) => !!KIND[kind] && photos.has(KIND[kind][0]);

/** Modulates a texture set in place (map = sRGB albedo + height in A, nrm = tangent normal + roughness in A). The photo repeats twice per
 *  texture tile (1 photo texel = 1 texel at 1024²). */
export function applyPhotoDetail(kind: string, size: number, map: Uint8Array, nrm: Uint8Array) {
  const k = KIND[kind]; const ph = k && photos.get(k[0]); if (!k || !ph) return;
  const str = k[1], P = ph.size, L = ph.lum, f = (size >= 1024 ? 2 : 1) * P / size, msk = P - 1; // P is a power of two (512)
  for (let y = 0; y < size; y++) {
    const py = Math.floor(y * f) & msk, r0 = py * P, rU = ((py - 1) & msk) * P, rD = ((py + 1) & msk) * P;
    for (let x = 0; x < size; x++) {
      const px = Math.floor(x * f) & msk, l = L[r0 + px], i = (y * size + x) * 4;
      const m = 1 + (l - 1) * str;
      map[i] = Math.min(255, map[i] * m); map[i + 1] = Math.min(255, map[i + 1] * m); map[i + 2] = Math.min(255, map[i + 2] * m);
      map[i + 3] = Math.max(0, Math.min(255, map[i + 3] + (l - 1) * 46 * str));
      const gx = (L[r0 + ((px + 1) & msk)] - L[r0 + ((px - 1) & msk)]) * str * 1.1, gy = (L[rD + px] - L[rU + px]) * str * 1.1;
      let nx = nrm[i] / 127.5 - 1 - gx, ny = nrm[i + 1] / 127.5 - 1 - gy, nz = nrm[i + 2] / 127.5 - 1; const il = 1 / (Math.hypot(nx, ny, nz) || 1);
      nx *= il; ny *= il; nz *= il;
      nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255;
    }
  }
}
