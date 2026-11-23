// The intro flight in the real app (docs/regeln/tests.md → "Intro flight"): menu → „▶ Start" → the camera flies over the track, the
// pods wait, the track's card and „Rennen starten" show → Enter (or the gamepad) → countdown → race. A restart skips the flight.
//
//   cd /var/tmp/t   (a folder with puppeteer installed – "Test-Setup" in docs/regeln/tests.md)
//   node pintro.mjs <abs path to dist/index.html> [<abs out prefix for pictures>]
//   BACKEND=webgpu node pintro.mjs <dist/index.html>   – the same on the real WebGPU backend (SwiftShader, as `npm run check:gpu`):
//       flight → pause → Enter → countdown → race only (restart and gamepad do not depend on the backend), and ANY console error or
//       warning fails the run. Pictures are white on headless WebGPU – none are taken. (2026-11-23: the user reported "Introfahrt geht
//       noch nicht"; until then the flight had only ever run on WebGL in the tests.)
import puppeteer from 'puppeteer';
const [,, dist, out = ''] = process.argv;
if (!dist) { console.log('usage: node pintro.mjs <dist/index.html> [<out prefix>]'); process.exit(2); }
const PROFILE_KEY = 'podracer-profile-v2';
const GPU = process.env.BACKEND === 'webgpu';
const prof = { gfx: { backend: GPU ? 'auto' : 'webgl', renderScale: 0.4, shadows: 0, texRes: 256, particles: 0.3, detail: 0.5, geometry: 0, bloom: false, ao: false, godRays: false, ssr: false, csm: false, volumetrics: 0 }, race: { opponents: 3, trackId: 'boonta', laps: 2 } };
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', ...(GPU ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] : [])] });
let errs = 0; const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL ' + msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async (w = 1280, h = 720) => {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => { errs++; console.log('[pageerror]', e.message.slice(0, 300)); });
  if (GPU) p.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') { errs++; console.log('[console]', m.text().slice(0, 300)); } });
  await p.evaluateOnNewDocument((key, pr) => {
    try { localStorage.setItem(key, JSON.stringify(pr)); } catch { /* */ }
    const pad = { id: 'Fake pad (pintro.mjs)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad; navigator.getGamepads = () => [pad, null, null, null];
  }, PROFILE_KEY, prof);
  await p.goto('file://' + dist);
  return p;
};
const has = (p, text, timeout = 300000) => p.waitForFunction(t => document.body.textContent.includes(t), { timeout, polling: 250 }, text);
const click = (p, text) => p.evaluate(t => { const el = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); if (!el) throw new Error('button not found: ' + t); el.click(); }, text);
const frames = (p, n) => p.evaluate(n => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const game = (p, fn) => p.evaluate(fn);
const toIntro = async p => { await has(p, 'Rennen starten', 120000); await click(p, 'Rennen starten'); await has(p, 'Wetter'); await click(p, '▶ Start'); await p.waitForSelector('[data-intro]', { timeout: 600000 }); };

// ---- 1. the flight ----
let p = await open();
await toIntro(p); console.log('intro is up');
if (GPU) { const gpu = await game(p, () => !!window.__podracer.renderer?.backend?.isWebGPUBackend); console.log(`backend: ${gpu ? 'WebGPU' : 'WebGL'}`); check(gpu, 'BACKEND=webgpu, but the app runs on WebGL'); }
const a = await game(p, () => { const G = window.__podracer, pl = G.player; return { state: G.state, dist: G.flightDist, len: G.flight.length, raceTime: G.raceTime, speed: Math.hypot(pl.vel.x, pl.vel.z), camY: G.camera.position.y, podY: pl.pos.y, text: document.querySelector('[data-intro]').textContent, hud: document.body.textContent.includes('FLUGLAGE'), focus: document.activeElement?.textContent ?? '' }; });
await frames(p, 6);
const c = await game(p, () => { const G = window.__podracer, pl = G.player; return { dist: G.flightDist, raceTime: G.raceTime, speed: Math.hypot(pl.vel.x, pl.vel.z), camToPod: G.camera.position.distanceTo(pl.pos), fov: G.camera.fov }; });
console.log(`state ${a.state} · flown ${a.dist.toFixed(0)} → ${c.dist.toFixed(0)} m of ${a.len} m · race time ${c.raceTime} · pod speed ${c.speed.toFixed(1)} · camera ${c.camToPod.toFixed(0)} m from the pod`);
console.log(`card: ${a.text}`);
check(a.state === 'intro', `state is '${a.state}' after loading`);
check(c.dist > a.dist + 20, `the camera does not fly (${a.dist.toFixed(1)} → ${c.dist.toFixed(1)} m in six frames)`);
check(c.raceTime === 0 && c.speed < 1, `the race runs during the intro (time ${c.raceTime}, pod speed ${c.speed})`);
check(/Boonta/.test(a.text) && /km/.test(a.text) && /Runden\s*2/.test(a.text) && /Wetter/.test(a.text) && /Rennen starten/.test(a.text), `the card lacks track name, length, laps, weather or the button: "${a.text}"`);
check(!a.hud, 'the race HUD shows during the intro'); check(a.focus.includes('Rennen starten'), `the focus is on "${a.focus}", not on „Rennen starten"`);
if (out && !GPU) await p.screenshot({ path: out + '_intro.jpg', type: 'jpeg', quality: 85 });
// the pause works in the intro and stops the flight
await p.keyboard.press('Escape'); await has(p, 'PAUSE', 20000); const d0 = await game(p, () => window.__podracer.flightDist); await sleep(400); const d1 = await game(p, () => window.__podracer.flightDist);
check(d0 === d1, 'the flight goes on while paused'); check(await game(p, () => !document.querySelector('[data-intro]')), 'the intro card shows above the pause menu');
await p.keyboard.press('Enter'); await sleep(200); check(await game(p, () => window.__podracer.state) === 'intro', 'Enter in the pause menu started the race');
await click(p, 'Weiter'); await p.waitForSelector('[data-intro]', { timeout: 20000 });
// Enter starts the race: cut to the grid, countdown
await p.evaluate(() => document.activeElement?.blur()); // (also without the focus on the button)
await p.keyboard.press('Enter'); await frames(p, 2);
const e = await game(p, () => { const G = window.__podracer, pl = G.player; return { state: G.state, countdown: G.countdown, camToPod: G.camera.position.distanceTo(pl.pos), intro: !!document.querySelector('[data-intro]') }; });
console.log(`after Enter: state ${e.state}, countdown ${e.countdown.toFixed(1)}, camera ${e.camToPod.toFixed(0)} m from the pod`);
check(e.state === 'countdown' && e.countdown > 2.5, `after Enter: state '${e.state}', countdown ${e.countdown}`); check(e.camToPod < 40, `the camera did not cut to the grid (${e.camToPod.toFixed(0)} m from the pod)`);
await has(p, 'FLUGLAGE', 60000); check(await game(p, () => !document.querySelector('[data-intro]')), 'the intro card stays after the start');
if (out && !GPU) await p.screenshot({ path: out + '_grid.jpg', type: 'jpeg', quality: 85 });
await game(p, () => { window.__podracer.countdown = 0.05; }); await p.waitForFunction(() => window.__podracer.state === 'race', { timeout: 120000, polling: 250 });
if (GPU) { await p.close(); await b.close(); if (errs || fails.length) { console.log(`\nINTRO CHECK (WebGPU) FAILED: ${fails.length} problem(s), ${errs} error(s) / warning(s)`); process.exit(1); } console.log('\nIntro check on WebGPU passed.'); process.exit(0); }
// ---- 2. a restart goes straight to the grid ----
await p.keyboard.press('Escape'); await has(p, 'PAUSE', 20000); await click(p, 'Neustart');
await p.waitForFunction(() => window.__podracer && window.__podracer.running && window.__podracer.state !== 'loading' && document.body.textContent.includes('FLUGLAGE'), { timeout: 600000, polling: 250 });
const r = await game(p, () => ({ state: window.__podracer.state, intro: !!document.querySelector('[data-intro]') }));
console.log(`after „Neustart": state ${r.state}`); check(r.state === 'countdown' || r.state === 'race', `a restart shows the intro again (state '${r.state}')`); check(!r.intro, 'a restart shows the intro card');
await p.close();
// ---- 3. the gamepad: A on the focused button; Start; neither pauses the race it has just started ----
for (const btn of [0, 9]) {
  p = await open(640, 360); await toIntro(p); await frames(p, 3);
  const set = (i, on) => p.evaluate((i, on) => { const x = window.__pad.buttons[i]; x.pressed = on; x.touched = on; x.value = on ? 1 : 0; }, i, on);
  await set(btn, true);
  let st = ''; for (let k = 0; k < 40 && st !== 'countdown'; k++) { await frames(p, 1); st = await game(p, () => window.__podracer.state); }
  await frames(p, 4); const held = await game(p, () => ({ state: window.__podracer.state, paused: window.__podracer.paused })); await set(btn, false); await frames(p, 3);
  const after = await game(p, () => ({ state: window.__podracer.state, paused: window.__podracer.paused }));
  console.log(`gamepad button ${btn === 0 ? 'A' : 'Start'}: state ${held.state}, paused ${held.paused} while held → ${after.state}, paused ${after.paused}`);
  check(held.state === 'countdown', `gamepad ${btn === 0 ? 'A' : 'Start'} does not start the race (state '${held.state}')`); check(!held.paused && !after.paused, `gamepad ${btn === 0 ? 'A' : 'Start'}: the race is paused right after the start`);
  await p.close();
}
// ---- 4. a real mouse click on „Rennen starten" (2026-11-23): the steps above press keys or call click() on the element – neither
//         notices a layer lying over the button. Here the pointer goes to the button's centre: it must be the top element there. ----
{
  p = await open(640, 360); await toIntro(p); await frames(p, 3);
  const at = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[data-intro] button')].find(x => x.textContent.includes('Rennen starten')); if (!el) return null;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
    return { x, y, w: r.width, h: r.height, onTop: !!top && (top === el || el.contains(top)), top: top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}` : 'nothing' };
  });
  check(!!at, 'no „Rennen starten" button in the intro card');
  if (at) {
    check(at.onTop, `the button is covered at its centre by <${at.top}>`); check(at.w >= 120 && at.h >= 28, `the button is tiny (${at.w.toFixed(0)} × ${at.h.toFixed(0)} px)`);
    await p.mouse.click(at.x, at.y);
    let st = ''; for (let k = 0; k < 40 && st !== 'countdown'; k++) { await frames(p, 1); st = await game(p, () => window.__podracer.state); }
    console.log(`mouse click at ${at.x.toFixed(0)}, ${at.y.toFixed(0)} (button ${at.w.toFixed(0)} × ${at.h.toFixed(0)} px, on top: ${at.onTop}): state ${st}`);
    check(st === 'countdown', `a mouse click on „Rennen starten" does not start the race (state '${st}')`);
  }
  await p.close();
}
await b.close();
if (errs || fails.length) { console.log(`\nINTRO CHECK FAILED: ${fails.length} problem(s), ${errs} page error(s)`); process.exit(1); }
console.log('\nIntro check passed.');
