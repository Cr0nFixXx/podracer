// Photo → 512² tileable detail texture: centre crop, flatten large-scale lighting (divide by a heavy blur), make seamless (offset cross-blend), JPEG.
import puppeteer from 'puppeteer'; import fs from 'fs';
const [,, outDir] = process.argv;
const jobs = [['rock', 'rock2', 0.46], ['bark', 'bark2', 0.42], ['sand', 'sand1', 0.6], ['soil', 'soil1', 0.42]];
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }); const p = await b.newPage();
for (const [name, src, mean] of jobs) {
  const data = 'data:image/jpeg;base64,' + fs.readFileSync('/tmp/ph/' + src + '.jpg').toString('base64');
  const out = await p.evaluate(async (data, mean) => {
    const im = new Image(); im.src = data; await im.decode();
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const m = Math.min(im.width, im.height) * 0.86; x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S);
    const id = x.getImageData(0, 0, S, S), d = id.data;
    // heavy blur via down/up-scaling
    const s = document.createElement('canvas'); s.width = s.height = 12; s.getContext('2d').drawImage(c, 0, 0, 12, 12);
    const bl = document.createElement('canvas'); bl.width = bl.height = S; const bx = bl.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(s, 0, 0, S, S);
    const bd = bx.getImageData(0, 0, S, S).data; const f = new Float32Array(S * S * 3); let sum = 0;
    for (let i = 0; i < S * S; i++) { const L = (bd[i * 4] * 0.3 + bd[i * 4 + 1] * 0.59 + bd[i * 4 + 2] * 0.11) / 255 + 0.02; for (let k = 0; k < 3; k++) f[i * 3 + k] = d[i * 4 + k] / 255 / L; sum += f[i * 3] * 0.3 + f[i * 3 + 1] * 0.59 + f[i * 3 + 2] * 0.11; }
    const gain = mean / (sum / (S * S));
    // seamless: blend with the half-offset copy, weight falls to 0 at the tile border
    const o = new Float32Array(S * S * 3), h = S / 2;
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const wx = Math.min(xx, S - 1 - xx) / h, wy = Math.min(y, S - 1 - y) / h, w = Math.min(1, Math.min(wx, wy) * 3.2), ww = w * w * (3 - 2 * w);
      const i = (y * S + xx) * 3, j = (((y + h) % S) * S + ((xx + h) % S)) * 3;
      for (let k = 0; k < 3; k++) o[i + k] = f[i + k] * ww + f[j + k] * (1 - ww);
    }
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, o[i * 3 + k] * gain * 255));
    x.putImageData(id, 0, 0); return c.toDataURL('image/jpeg', 0.82);
  }, data, mean);
  fs.writeFileSync(outDir + '/' + name + '.jpg', Buffer.from(out.split(',')[1], 'base64'));
}
// 2×2 tiled preview of each
await p.setViewport({ width: 1600, height: 420 });
await p.setContent('<body style="margin:0;background:#222;display:flex;gap:6px">' + jobs.map(([n]) => `<div style="width:394px;height:394px;background:url(data:image/jpeg;base64,${fs.readFileSync(outDir + '/' + n + '.jpg').toString('base64')});background-size:197px 197px"></div>`).join('') + '</body>');
await new Promise(r => setTimeout(r, 500)); await p.screenshot({ path: '/tmp/t/ph2.jpg', type: 'jpeg', quality: 80 }); await b.close();
