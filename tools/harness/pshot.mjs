// Puppeteer variant of shot.mjs (use when Playwright is unavailable). Also writes a contact sheet `<out>_grid.jpg`.
// Usage (from a dir with puppeteer installed, e.g. /tmp/t):
//   node pshot.mjs <abs path to out/game.html> "t0:a,t5:c" <abs out prefix> [?webgl]
import puppeteer from 'puppeteer';
const [,, page, list, out, query = ''] = process.argv;
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.log('[console]', m.text().slice(0, 300)); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('file://' + page + query);
await p.waitForFunction(() => typeof window.show === 'function' || typeof window.track === 'function', { timeout: 120000 });
const shots = [];
for (const item of list.split(',')) {
  const [i, d] = item.split(':'); const t0 = Date.now();
  const info = await p.evaluate(([i, d]) => i === 'audio' ? window.audioTest() : i === 'tex' ? window.texBench(+(d ?? 1024)) : i === 'g' ? window.grid() : i.startsWith('s') ? window.sim(+i.slice(1), +(d ?? 40)) : i.startsWith('t') ? window.track(+i.slice(1), d) : window.show(+i, d === undefined ? 1 : +d), [i, d]);
  console.log(info, (Date.now() - t0) + 'ms');
  const buf = await p.screenshot({ path: `${out}_${i}${d ? '_' + d : ''}.png` });
  if (!i.startsWith('s') && i !== 'audio' && i !== 'tex') shots.push('data:image/png;base64,' + Buffer.from(buf).toString('base64'));
}
if (shots.length) {
  const g = await b.newPage(); const cols = shots.length > 1 ? 2 : 1, w = cols === 1 ? 1280 : 800, h = w * 9 / 16;
  await g.setViewport({ width: w * cols, height: Math.ceil(shots.length / cols) * h });
  await g.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px)">` + shots.map(s => `<img src="${s}" style="width:${w}px;height:${h}px;display:block">`).join('') + '</body>');
  await g.screenshot({ path: `${out}_grid.jpg`, type: 'jpeg', quality: 82 });
}
await b.close();
