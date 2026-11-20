// Boots dist/index.html (WebGPU, featureLevel stripped for old headless Chromium), opens the hangar, counts console errors.
import { chromium } from 'playwright';
const [,, dist, outDir] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(() => { if (navigator.gpu) { const o = navigator.gpu.requestAdapter.bind(navigator.gpu); navigator.gpu.requestAdapter = (opt = {}) => { const { featureLevel, ...rest } = opt; void featureLevel; return o(rest); }; } });
let errs = 0; p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('fonts.g')) { errs++; console.log('[err]', t.slice(0, 220)); } else if (t.includes('WebGPU') || t.includes('WebGL2')) console.log('[info]', t.slice(0, 160)); });
p.on('pageerror', e => { errs++; console.log('[pageerror]', e.message); });
await p.goto('file://' + dist); await p.waitForTimeout(12000);
await p.screenshot({ path: outDir + '/app_menu.png', timeout: 120000 });
await p.getByText('Hangar & Tuning').click(); await p.waitForTimeout(12000);
await p.screenshot({ path: outDir + '/app_garage.png', timeout: 120000 });
console.log('console errors:', errs); await b.close();
