// Pixel diff of two harness screenshots (no extra deps: decodes in headless Chromium).
// Usage: node tools/harness/diff.mjs a.png b.png [out.png] [threshold=24]
//   → prints "diff=<percent>% maxDelta=<0..255>" and writes a red-highlighted diff image; exit code 1 if > 2 % differ.
import { createRequire } from 'module';
const { chromium } = createRequire('/tmp/pw/')('playwright');
import { readFileSync, writeFileSync } from 'fs';
const [,, a, b, out = 'diff.png', thr = '24'] = process.argv;
if (!a || !b) { console.error('usage: diff.mjs a.png b.png [out.png] [threshold]'); process.exit(2); }
const br = await chromium.launch(); const p = await br.newPage();
const res = await p.evaluate(async ([da, db, t]) => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const [ia, ib] = await Promise.all([load(da), load(db)]); const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.drawImage(ia, 0, 0); const A = g.getImageData(0, 0, w, h); g.drawImage(ib, 0, 0); const B = g.getImageData(0, 0, w, h);
  const D = g.createImageData(w, h); let n = 0, mx = 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    mx = Math.max(mx, d); const hit = d > t; if (hit) n++;
    const l = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 9; D.data[i] = hit ? 255 : l; D.data[i + 1] = hit ? 30 : l; D.data[i + 2] = hit ? 30 : l; D.data[i + 3] = 255;
  }
  g.putImageData(D, 0, 0); return { pct: (100 * n) / (w * h), mx, png: c.toDataURL('image/png') };
}, ['data:image/png;base64,' + readFileSync(a).toString('base64'), 'data:image/png;base64,' + readFileSync(b).toString('base64'), +thr]);
writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
console.log(`diff=${res.pct.toFixed(2)}% maxDelta=${res.mx} → ${out}`);
await br.close(); process.exit(res.pct > 2 ? 1 : 0);
