// Real-app smoke test (Puppeteer): boots dist/index.html, starts a race through the menus, drives with the keyboard, screenshots the HUD,
// then opens the settings and rebinds a key. Fails on page errors. Usage (from a dir with puppeteer, e.g. /tmp/t):
//   node papp.mjs <abs path to dist/index.html> <abs out prefix> ['{"race":{"trackId":"frost","timeOfDay":"night"}}']
import puppeteer from 'puppeteer';
const [,, dist, out, profJson = '{}'] = process.argv;
const PROFILE_KEY = 'podracer-profile-v2'; // the key the game saves under (src/game/settings.ts `KEY`)
const extra = JSON.parse(profJson);
const prof = { ...extra, gfx: { backend: 'webgl', renderScale: 0.5, shadows: 1, texRes: 512, particles: 0.6, detail: 0.6, ...(extra.gfx ?? {}) }, race: { opponents: 5, ...(extra.race ?? {}) } };
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
let errs = 0;
const open = async () => {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('pageerror', e => { errs++; console.log('[pageerror]', e.message.slice(0, 300)); });
  p.on('console', m => { if (m.text().startsWith('[load]')) console.log(m.text()); if (m.type() === 'error' && !/fonts\.g|GPU stall|ERR_/.test(m.text())) { errs++; console.log('[console]', m.text().slice(0, 300)); } });
  await p.evaluateOnNewDocument((key, pr) => { try { localStorage.setItem(key, JSON.stringify(pr)); } catch { /* */ } }, PROFILE_KEY, prof);
  await p.goto((/^https?:/.test(dist) ? dist : 'file://' + dist) + (process.env.QUERY ?? '')); return p; // a path = the single file; an http address = the web build behind a server (npm run preview:web)
};
const click = (p, text) => p.evaluate(t => { const el = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); if (!el) throw new Error('button not found: ' + t); el.click(); }, text);
const has = (p, text, timeout = 240000) => p.waitForFunction(t => document.body.textContent.includes(t), { timeout, polling: 500 }, text);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 1. race + HUD ----
let p = await open();
await has(p, 'Rennen starten'); await click(p, 'Rennen starten');
await has(p, 'Wetter'); await p.screenshot({ path: out + '_setup.png' });
await click(p, '▶ Start');
// (2026-11-23: the intro flight comes first – its card carries the button „Rennen starten"; tools/harness/pintro.mjs tests the flight itself)
const pastIntro = async q => { await q.waitForSelector('[data-intro]', { timeout: 240000 }); await click(q, 'Rennen starten'); };
await pastIntro(p);
await has(p, 'FLUGLAGE'); console.log('HUD up');
// The boost gauge is 230 px wide and its labels are absolutely placed: every label must stay on ONE line, inside the gauge, and clear of
// its neighbours in the row. (2026-11-23: the climate label "KÜHLE LUFT −21 %" stood in the line of the heat label – both broke in two.)
const gaugeFit = async () => {
  const r = await p.evaluate(() => {
    const max = [...document.querySelectorAll('span')].find(el => el.textContent === 'MAX'); if (!max) return null;
    const box = max.parentElement.parentElement, bb = box.getBoundingClientRect(), bad = [], seen = [];
    const rows = new Map();
    for (const el of box.querySelectorAll('span')) {
      const rg = document.createRange(); rg.selectNodeContents(el);
      const rects = [...rg.getClientRects()].filter(q => q.width > 0); if (!rects.length) continue;
      const lines = new Set(rects.map(q => Math.round(q.top))).size, l = Math.min(...rects.map(q => q.left)), rt = Math.max(...rects.map(q => q.right)), t = el.textContent;
      seen.push(t);
      if (lines > 1) bad.push(`"${t}" breaks into ${lines} lines`);
      if (l < bb.left - 1 || rt > bb.right + 1) bad.push(`"${t}" leaves the gauge (${Math.round(l - bb.left)} … ${Math.round(rt - bb.left)} of ${Math.round(bb.width)} px)`);
      const key = Math.round(el.parentElement.getBoundingClientRect().top); if (!rows.has(key)) rows.set(key, []); rows.get(key).push({ t, l, r: rt });
    }
    for (const row of rows.values()) for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) if (row[i].l < row[j].r - 1 && row[j].l < row[i].r - 1) bad.push(`"${row[i].t}" overlaps "${row[j].t}"`);
    return { seen, bad };
  });
  if (!r) { console.log('HUD boost gauge: not found FAIL'); errs++; return; }
  console.log('HUD boost gauge labels:', JSON.stringify(r.seen), r.bad.length ? 'FAIL – ' + r.bad.join('; ') : 'ok (one line each, inside the gauge, no overlap)'); if (r.bad.length) errs++;
};
await sleep(1500); await gaugeFit();
if (process.env.TWICE) { // persistent texture cache: wait for the deferred write, then load the same race again in a fresh page
  await sleep(9000); await p.close(); p = await open();
  await has(p, 'Rennen starten'); await click(p, 'Rennen starten'); await has(p, 'Wetter'); await click(p, '▶ Start'); await pastIntro(p); await has(p, 'FLUGLAGE'); console.log('second load done');
}
if (process.env.LOAD_ONLY) { await b.close(); process.exit(errs ? 1 : 0); } // only the [load] timing line(s) and the checks up to here wanted
await has(p, 'LOS!', 600000); console.log('race started'); // software rendering runs the countdown in slow motion
await p.keyboard.down('KeyW'); await sleep(Number(process.env.DRIVE_MS ?? 15000));
await p.keyboard.down('ArrowRight'); await sleep(4000);
const txt = await p.evaluate(() => document.body.textContent);
console.log('HUD label ROLLE:', txt.includes('ROLLE'), '| env label:', (txt.match(/(NACHT|MITTAG|DÄMMERUNG|GEWITTER|REGEN|SCHNEE|STAUB|NEBEL|KLAR)[^\n]*/i) ?? ['-'])[0]);
await p.screenshot({ path: out + '_race.png' });
await p.keyboard.up('ArrowRight');
// HUD sides: damage the internal "L" engine (= screen-RIGHT in the chase view) and heat up the boost gauge for the screenshot
await p.evaluate(() => { const g = window.__podracer; g.player.hpL = 32; g.player.heat = 0.86; });
await sleep(2500); await p.screenshot({ path: out + '_hud.png' });
const hudSide = await p.evaluate(() => { const g = window.__podracer, h = g.hud(); return { internalL: Math.round(g.player.hpL), internalR: Math.round(g.player.hpR), hudLeftBox: Math.round(h.hpL), hudRightBox: Math.round(h.hpR) }; });
console.log('HUD damage sides:', JSON.stringify(hudSide), hudSide.hudRightBox < hudSide.hudLeftBox ? 'ok (damaged screen-right engine shown right)' : 'FAIL');
if (!(hudSide.hudRightBox < hudSide.hudLeftBox)) errs++;
await p.keyboard.up('KeyW');
// pause: audio must be silent and stay silent when keys are pressed; graphics settings must be reachable and fit
await p.keyboard.press('Escape'); await sleep(900);
const au = () => p.evaluate(() => { const g = window.__podracer; return { paused: g.paused, ctx: g.audio.ctx ? g.audio.ctx.state : 'none', gain: g.audio.master ? g.audio.master.gain.value : -1 }; });
const a1 = await au(); await p.keyboard.press('KeyW'); await p.keyboard.press('KeyD'); await sleep(600); const a2 = await au();
console.log('pause audio:', JSON.stringify(a1), '| after key presses:', JSON.stringify(a2), a1.gain === 0 && a2.gain === 0 && a2.ctx !== 'running' ? 'ok' : 'FAIL');
if (!(a1.gain === 0 && a2.gain === 0 && a2.ctx !== 'running')) errs++;
await click(p, 'Grafik-Einstellungen'); await has(p, 'LOD-Distanz', 8000); await sleep(500);
const sc = await p.evaluate(() => [...document.querySelectorAll('*')].filter(el => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1; }).length);
console.log('pause graphics menu: open, scrollable elements =', sc, sc === 0 ? 'ok' : 'FAIL'); if (sc) errs++;
await p.screenshot({ path: out + '_pause.png' });
await click(p, 'Zurück'); await sleep(300); await click(p, 'Weiter'); await sleep(700);
const a3 = await au(); console.log('after resume:', JSON.stringify(a3), a3.gain > 0 ? 'ok' : 'FAIL'); if (!(a3.gain > 0)) errs++;
await p.close();

// ---- 2. settings: rebind a key, apply the classic preset ----
p = await open();
await has(p, 'Einstellungen'); await click(p, 'Einstellungen');
await has(p, 'Grafik & Ton'); await click(p, 'Steuerung');
await has(p, 'Rolle nach links');
await p.evaluate(() => document.querySelector('[data-action="rollLeft"]').click());
await has(p, 'Taste drücken', 5000); await p.keyboard.press('KeyQ'); await sleep(300);
const bound = await p.evaluate(() => document.querySelector('[data-action="rollLeft"] kbd').textContent);
const stored = await p.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').keys?.rollLeft, PROFILE_KEY);
const saved = Array.isArray(stored) && stored.includes('KeyQ'); // the new binding must be in the saved profile, not only on screen
console.log('rebind rollLeft →', bound, '| stored:', JSON.stringify(stored), saved ? 'ok' : 'FAIL'); if (!saved) errs++;
await p.evaluate(() => document.querySelector('[data-action="rollLeft"]').scrollIntoView({ block: 'center' })); await sleep(200);
await p.screenshot({ path: out + '_keys.png' });
// gamepad mapping: fake pad, bind "Boost" to button 10 (L3)
await p.evaluate(() => { const mk = on => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: on && i === 10, value: on && i === 10 ? 1 : 0 })), axes: [0, 0, 0, 0] }); window.__mk = mk; window.__pad = mk(false); navigator.getGamepads = () => [window.__pad]; });
await sleep(400); await p.evaluate(() => document.querySelector('[data-pad="boost"]').click()); await sleep(400);
await p.evaluate(() => { window.__pad = window.__mk(true); }); await sleep(600);
const padL = await p.evaluate(() => document.querySelector('[data-pad="boost"] kbd').textContent);
console.log('gamepad rebind boost →', padL, padL === 'L3' ? 'ok' : 'FAIL'); if (padL !== 'L3') errs++;
await click(p, 'Klassisch'); await sleep(300);
console.log('classic preset left →', await p.evaluate(() => document.querySelector('[data-action="left"] kbd').textContent));
if (bound !== 'Q') { errs++; console.log('[fail] rebind did not apply'); }
await b.close(); console.log(errs ? `${errs} error(s) – FAILED` : 'App smoke test passed.'); process.exit(errs ? 1 : 0);
