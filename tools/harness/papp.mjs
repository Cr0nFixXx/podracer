// Real-app smoke test (Puppeteer): boots dist/index.html, starts a race through the menus, drives with the keyboard, screenshots the HUD,
// then opens the settings and rebinds a key. Fails on page errors. Usage (from a dir with puppeteer, e.g. /tmp/t):
//   node papp.mjs <abs path to dist/index.html> <abs out prefix> ['{"race":{"trackId":"frost","timeOfDay":"night"}}']
import puppeteer from 'puppeteer';
const [,, dist, out, profJson = '{}'] = process.argv;
const extra = JSON.parse(profJson);
const prof = { ...extra, gfx: { backend: 'webgl', renderScale: 0.5, shadows: 1, texRes: 512, particles: 0.6, detail: 0.6, ...(extra.gfx ?? {}) }, race: { opponents: 5, ...(extra.race ?? {}) } };
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
let errs = 0;
const open = async () => {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('pageerror', e => { errs++; console.log('[pageerror]', e.message.slice(0, 300)); });
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|GPU stall|ERR_/.test(m.text())) { errs++; console.log('[console]', m.text().slice(0, 300)); } });
  await p.evaluateOnNewDocument(pr => { try { localStorage.setItem('podracer-profile-v1', JSON.stringify(pr)); } catch { /* */ } }, prof);
  await p.goto('file://' + dist); return p;
};
const click = (p, text) => p.evaluate(t => { const el = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); if (!el) throw new Error('button not found: ' + t); el.click(); }, text);
const has = (p, text, timeout = 240000) => p.waitForFunction(t => document.body.textContent.includes(t), { timeout, polling: 500 }, text);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 1. race + HUD ----
let p = await open();
await has(p, 'Rennen starten'); await click(p, 'Rennen starten');
await has(p, 'Wetter'); await p.screenshot({ path: out + '_setup.png' });
await click(p, '▶ Start');
await has(p, 'FLUGLAGE'); console.log('HUD up');
await has(p, 'LOS!', 600000); console.log('race started'); // software rendering runs the countdown in slow motion
await p.keyboard.down('KeyW'); await sleep(Number(process.env.DRIVE_MS ?? 15000));
await p.keyboard.down('ArrowRight'); await sleep(4000);
const txt = await p.evaluate(() => document.body.textContent);
console.log('HUD label ROLLE:', txt.includes('ROLLE'), '| env label:', (txt.match(/(NACHT|MITTAG|DÄMMERUNG|GEWITTER|REGEN|SCHNEE|STAUB|NEBEL|KLAR)[^\n]*/i) ?? ['-'])[0]);
await p.screenshot({ path: out + '_race.png' });
await p.keyboard.up('ArrowRight'); await p.keyboard.up('KeyW'); await p.close();

// ---- 2. settings: rebind a key, apply the classic preset ----
p = await open();
await has(p, 'Einstellungen'); await click(p, 'Einstellungen');
await has(p, 'Rolle nach links');
await p.evaluate(() => document.querySelector('[data-action="rollLeft"]').click());
await has(p, 'Taste drücken', 5000); await p.keyboard.press('KeyQ'); await sleep(300);
const bound = await p.evaluate(() => document.querySelector('[data-action="rollLeft"] kbd').textContent);
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('podracer-profile-v1')).keys?.rollLeft);
console.log('rebind rollLeft →', bound, '| stored:', JSON.stringify(stored));
await p.evaluate(() => document.querySelector('[data-action="rollLeft"]').scrollIntoView({ block: 'center' })); await sleep(200);
await p.screenshot({ path: out + '_keys.png' });
await click(p, 'Klassisch'); await sleep(300);
console.log('classic preset left →', await p.evaluate(() => document.querySelector('[data-action="left"] kbd').textContent));
if (bound !== 'Q') { errs++; console.log('[fail] rebind did not apply'); }
await b.close(); console.log(errs ? `${errs} error(s) – FAILED` : 'App smoke test passed.'); process.exit(errs ? 1 : 0);
