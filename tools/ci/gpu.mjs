// GPU shader check: `npm run check:gpu` – loads tracks in headless Chrome on the real WebGPU backend (SwiftShader) and fails on ANY
// console error/warning (WGSL validation, uniformity analysis, pipeline errors). Needs Puppeteer: PUPPETEER_DIR=/tmp/t (see docs/regeln/tests.md, "Test-Setup").
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), H = path.join(root, 'tools/harness');
const require = createRequire(path.join(process.env.PUPPETEER_DIR ?? '/tmp/t', 'x.js'));
let puppeteer; try { puppeteer = require('puppeteer'); } catch { console.error('Puppeteer not found. Run: mkdir -p /tmp/t && cd /tmp/t && npm i puppeteer (or set PUPPETEER_DIR)'); process.exit(2); }
execSync(`node build.mjs game`, { cwd: H, stdio: 'inherit' }); // fresh bundle + page (tools/harness/out is not in git)
const list = (process.env.TRACKS ?? '0,3,5,7').split(',').map(Number), query = process.env.QUERY ?? '';
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] });
const p = await b.newPage(); await p.setViewport({ width: 960, height: 540 }); let errs = 0;
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') { errs++; console.log('  [console]', m.text().slice(0, 400)); } });
p.on('pageerror', e => { errs++; console.log('  [pageerror]', e.message.slice(0, 400)); });
await p.goto('file://' + path.join(H, 'out/game.html') + query); await p.waitForFunction(() => typeof window.track === 'function', { timeout: 120000 });
for (const i of list) { const info = await p.evaluate(i => window.track(i, 'r'), i); console.log(info.trim()); if (!/WebGPU/.test(info) && !query.includes('webgl')) { errs++; console.log('  [backend] expected WebGPU'); } }
await b.close(); console.log(errs ? `\n${errs} GPU console error(s)/warning(s) – FAILED` : '\nGPU check passed (0 console errors/warnings).'); process.exit(errs ? 1 : 0);
