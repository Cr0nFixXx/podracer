import { chromium } from 'playwright';
const [,, page, list, out, query = ''] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
// test-only: Chromium 131 headless rejects requestAdapter({ featureLevel }) used by three r187 – strip it
await p.addInitScript(() => { if (navigator.gpu) { const orig = navigator.gpu.requestAdapter.bind(navigator.gpu); navigator.gpu.requestAdapter = (o = {}) => { const { featureLevel, ...rest } = o; void featureLevel; return orig(rest); }; } });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('file://' + page + query); await p.waitForFunction(() => typeof window.show === 'function' || typeof window.track === 'function', null, { timeout: 120000 });
for (const item of list.split(',')) {
  const [i, d] = item.split(':'); const t0 = Date.now();
  const info = await p.evaluate(([i, d]) => i === 'g' ? window.grid() : i.startsWith('s') ? window.sim(+i.slice(1), +(d ?? 40)) : i.startsWith('t') ? window.track(+i.slice(1), d) : window.show(+i, d === undefined ? 1 : +d), [i, d]);
  console.log(info, (Date.now() - t0) + 'ms'); await p.screenshot({ path: `${out}_${i}${d ? '_' + d : ''}.png`, timeout: 240000 });
}
await b.close();
