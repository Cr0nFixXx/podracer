// Gamepad in the menus, end to end (docs/regeln/tests.md → "Gamepad in the menus"). Puppeteer cannot press a real gamepad: the test
// puts a fake one in place of `navigator.getGamepads()` (standard layout) and presses its buttons. Everything after that is the real
// app: the polling hook (ui/usePadNav.tsx), the focus, the clicks, the race, the pause.
//
//   cd /var/tmp/t   (a folder with puppeteer installed – "Test-Setup" in docs/regeln/tests.md)
//   node ppad.mjs <abs path to dist/index.html> [<abs out prefix for pictures>]      env MENUS_ONLY=1: stop before the race (≈ 30 s)
//
// What it checks:
//   1. every control of every screen can be reached from the screen's default control (menu, race setup, hangar, settings with
//      both tabs, pause menu, graphics in the pause, result)
//   2. the first press only shows the focus; D-pad and stick move it; A presses; B goes back; Start runs the main action
//   3. sliders and selection lists change with left / right; LB / RB move on from them
//   4. Start pauses the race; the press that paused does not resume it; "Weiter" by A resumes and holding the button does not pause
//      again; B and Start resume too
//   5. while a gamepad button is being bound, the navigation keeps still
import puppeteer from 'puppeteer';
const [,, dist, out = ''] = process.argv;
if (!dist) { console.log('usage: node ppad.mjs <dist/index.html> [<out prefix>]'); process.exit(2); }
const PROFILE_KEY = 'podracer-profile-v2';
const prof = { gfx: { backend: 'webgl', renderScale: 0.4, shadows: 0, texRes: 256, particles: 0.3, detail: 0.5, geometry: 0, bloom: false, ao: false, godRays: false, ssr: false, csm: false, volumetrics: 0 }, race: { opponents: 3, trackId: 'boonta', laps: 2 } };
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
let errs = 0; const fails = [];
p.on('pageerror', e => { errs++; console.log('[pageerror]', e.message.slice(0, 300)); });
await p.evaluateOnNewDocument((key, pr) => {
  try { localStorage.setItem(key, JSON.stringify(pr)); } catch { /* */ }
  const pad = { id: 'Fake pad (ppad.mjs)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad; navigator.getGamepads = () => [pad, null, null, null];
}, PROFILE_KEY, prof);
await p.goto('file://' + dist);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const has = (text, timeout = 30000) => p.waitForFunction(t => document.body.textContent.includes(t), { timeout, polling: 250 }, text);
// One press = the app's polling loop sees the button down once and up once. Waiting in frames, not in milliseconds: with software
// rendering a frame of the menu (3D pod preview) can take longer than any fixed pause, and a long hold would count as a repeat.
const frames = n => p.evaluate(n => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const BTN = { a: 0, b: 1, lb: 4, rb: 5, start: 9, up: 12, down: 13, left: 14, right: 15 };
const set = (i, on) => p.evaluate((i, on) => { const x = window.__pad.buttons[i]; x.pressed = on; x.touched = on; x.value = on ? 1 : 0; window.__pad.timestamp++; }, i, on);
const press = async name => { await set(BTN[name], true); await frames(1); await set(BTN[name], false); await frames(1); };
const stick = async (x, y) => { await p.evaluate((x, y) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; }, x, y); await frames(1); await p.evaluate(() => { window.__pad.axes[0] = 0; window.__pad.axes[1] = 0; }); await frames(1); };
const focus = () => p.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? window.__padNav.label(a).slice(0, 60) : ''; });
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL ' + msg); } };
const reach = async name => { const u = await p.evaluate(() => ({ n: window.__padNav.targets().length, un: window.__padNav.unreachable() })); console.log(`${name}: ${u.n} controls, ${u.un.length ? 'UNREACHABLE: ' + u.un.join(' | ') : 'all reachable'}`); check(u.n > 0 && u.un.length === 0, `${name}: ${u.n} controls, cannot reach ${u.un.join(' | ')}`); };
/** Walks the focus to the control whose label contains `match`, pressing what the player would press. */
const walk = async match => {
  const path = await p.evaluate(m => window.__padNav.path(m), match);
  if (!path) { check(false, `no way to "${match}" from "${await focus()}"`); return false; }
  for (const ev of path) await press(ev);
  const f = await focus(); check(f.toLowerCase().includes(match.toLowerCase()), `walked ${path.join(' ')} to "${match}", the focus is on "${f}"`);
  return true;
};
const shot = async name => { if (out) await p.screenshot({ path: `${out}_${name}.jpg`, type: 'jpeg', quality: 80 }); };

// ---- main menu ----
await has('Rennen starten', 120000); await sleep(400); await frames(2);
check(await focus() === '', 'something has the focus before the pad was touched');
await press('down');
check(await p.evaluate(() => document.body.classList.contains('pad-nav')), 'the first press does not switch the pad mode on');
check((await focus()).includes('Rennen starten'), `first press: focus on "${await focus()}", expected the default "Rennen starten"`);
await press('down'); check((await focus()).includes('Hangar'), `down: focus on "${await focus()}"`);
await stick(0, 0.9); check((await focus()).includes('Einstellungen'), `stick down: focus on "${await focus()}"`);
await stick(0, -0.9); await press('up'); check((await focus()).includes('Rennen starten'), `stick up + up: focus on "${await focus()}"`);
await reach('main menu'); await shot('menu');
check(await p.evaluate(() => getComputedStyle(document.querySelector('.pad-legend')).display !== 'none'), 'the legend is not shown while the pad is in use');
// the mouse takes over: ring and legend go
await p.mouse.move(300, 300); await p.mouse.move(340, 320); await sleep(150);
check(!(await p.evaluate(() => document.body.classList.contains('pad-nav'))), 'moving the mouse does not end the pad mode');
await press('down'); // back to the pad (a move: the focus is still on "Rennen starten")
check(await p.evaluate(() => document.body.classList.contains('pad-nav')), 'the pad does not take over again after the mouse');

// ---- hangar ----
await walk('Hangar'); await press('a'); await has('HANGAR'); await sleep(500);
check((await focus()) !== '', 'hangar: nothing has the focus after the screen appeared');
await reach('hangar'); await shot('hangar');
for (const tab of await p.evaluate(() => [...document.querySelectorAll('[data-tab]')].map(e => e.dataset.tab))) {
  await p.evaluate(t => document.querySelector(`[data-tab="${t}"]`).click(), tab); await sleep(350); await reach(`hangar, tab ${tab}`);
}
await press('b'); await has('HYPERSPEED'); await sleep(400);
check((await focus()).includes('Rennen starten'), `back in the menu: focus on "${await focus()}"`);

// ---- settings ----
await walk('Einstellungen'); await press('a'); await has('EINSTELLUNGEN'); await sleep(500);
await reach('settings, graphics'); await shot('settings');
// a slider: left / right change the value, LB / RB move on
if (await walk('Render-Skalierung')) {
  const val = () => p.evaluate(() => +document.activeElement.value), atMin = await p.evaluate(() => +document.activeElement.value <= +document.activeElement.min);
  const [d1, d2] = atMin ? ['right', 'left'] : ['left', 'right']; // (a slider at its lower end can only go up)
  const v0 = await val(); await press(d1); const v1 = await val(); await press(d2); const v2 = await val();
  check(v1 !== v0 && (v1 > v0) === (d1 === 'right') && v2 === v0, `slider: ${v0} → ${d1} ${v1} → ${d2} ${v2}`);
  if (atMin) { await press('left'); check(await val() === v0, `slider at its lower end: left changed ${v0} to ${await val()}`); }
  const f0 = await focus(); await press('rb'); const f1 = await focus(); check(f1 !== f0 && f1 !== '', `RB from the slider "${f0}" stays on "${f1}"`);
  console.log(`slider ${f0.slice(0, 30)}: ${v0} → ${v1} → ${v2}; RB → ${f1.slice(0, 30)}`);
}
// a switch: A toggles it
if (await walk('FPS')) { const t0 = await p.evaluate(() => document.activeElement.innerHTML); await press('a'); const t1 = await p.evaluate(() => document.activeElement.innerHTML); check(t0 !== t1, 'A does not flip the switch'); await press('a'); }
await walk('Steuerung'); await press('a'); await has('Gamepad'); await sleep(400);
await reach('settings, controls');
// binding a gamepad button: the navigation keeps still while the dialog listens
if (await walk('RTSchub')) { // the "Schub" cell of the gamepad block (label = button + action: "RT" + "Schub")
  const f0 = await focus(); await press('a'); await sleep(200);
  check(await p.evaluate(() => document.body.dataset.padCapture === '1'), 'the binding dialog does not silence the navigation');
  await press('down'); // this press is captured as the new binding (D-pad ↓) and must not move the focus
  await sleep(200); const f1 = await focus();
  check(f1.includes('D-Pad ↓'), `binding: the cell shows "${f1}", expected D-Pad ↓`); check(f1.includes('Schub'), `binding: the focus left the cell "${f0}" for "${f1}"`);
  check(!(await p.evaluate(() => 'padCapture' in document.body.dataset)), 'the navigation stays silent after the binding');
  await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Standard').pop()?.click()); await sleep(200); // the gamepad block's "Standard": back to the default layout
  check((await p.evaluate(() => document.body.textContent)).includes('RTSchub'), 'the default gamepad layout did not come back');
}
await press('b'); await has('HYPERSPEED'); await sleep(400);

// ---- race setup ----
await press('start'); await has('RENNEN'); await sleep(500);
check((await focus()).includes('Start'), `race setup: focus on "${await focus()}", expected "▶ Start"`);
await reach('race setup'); await shot('setup');
if (await walk('Frostspalt')) { await press('a'); await sleep(300); check(await p.evaluate(k => JSON.parse(localStorage.getItem(k)).race.trackId, PROFILE_KEY) === 'frost', 'A on a track of the list does not choose it'); }
if (await walk('Boonta')) { await press('a'); await sleep(300); check(await p.evaluate(k => JSON.parse(localStorage.getItem(k)).race.trackId, PROFILE_KEY) === 'boonta', 'A on Boonta does not choose it'); }
{ // a selection list: left / right step through it
  const sel = await p.evaluate(() => { const s = [...document.querySelectorAll('select')].find(x => x.options.length > 2 && !x.getAttribute('aria-label')); if (!s) return null; s.focus(); return { i: s.selectedIndex, n: s.options.length }; });
  if (sel) { const [d1, d2] = sel.i < sel.n - 1 ? ['right', 'left'] : ['left', 'right'];
    await press(d1); const i1 = await p.evaluate(() => document.activeElement.selectedIndex); await press(d2); const i2 = await p.evaluate(() => document.activeElement.selectedIndex);
    check(i1 !== sel.i && i2 === sel.i, `selection list: ${sel.i} → ${d1} ${i1} → ${d2} ${i2}`); console.log(`selection list: ${sel.i} → ${i1} → ${i2} of ${sel.n}`);
    const f0 = await focus(); await press('down'); check((await focus()) !== f0, 'down from a selection list does not move'); }
  else check(false, 'race setup: no selection list found');
}
await press('b'); await has('HYPERSPEED'); await sleep(300); await press('start'); await has('RENNEN'); await sleep(400);

if (!process.env.MENUS_ONLY) {
  // ---- the race: Start pauses, the menu resumes ----
  // (software rendering draws about one frame of the race per second: a small window, no countdown, and all waits counted in frames)
  await p.setViewport({ width: 640, height: 360 }); await sleep(300);
  await press('start'); // = "▶ Start"
  await has('FLUGLAGE', 600000); console.log('race is up');
  await p.evaluate(() => { window.__podracer.countdown = 0.04; });
  await p.waitForFunction(() => window.__podracer && window.__podracer.state === 'race', { timeout: 240000, polling: 250 });
  const paused = () => p.evaluate(() => window.__podracer.paused);
  /** Waits up to `max` frames until `fn` holds; a failure names `what`. */
  const until = async (fn, what, max = 40) => { for (let k = 0; k < max; k++) { if (await fn()) return true; await frames(1); } check(false, what); return false; };
  const pauseMenu = async () => { await until(paused, 'Start does not pause the race'); await until(async () => (await focus()).includes('Weiter'), `pause: the focus is on "${await focus()}", expected "Weiter"`, 120); };
  check(!(await paused()), 'the race starts paused');
  // Start held: pauses once – and the press that paused must not resume
  await set(BTN.start, true); await until(paused, 'Start does not pause the race'); await frames(6); check(await paused(), 'holding Start resumed the race'); await set(BTN.start, false); await frames(4);
  check(await paused(), 'the press that paused the race resumed it again when it was let go');
  await pauseMenu(); await reach('pause menu'); await shot('pause');
  // A on "Weiter", held: resumes; holding does not pause again
  await set(BTN.a, true); await until(async () => !(await paused()), 'A on "Weiter" does not resume'); await frames(3); check(!(await paused()), 'holding A paused the race again'); await set(BTN.a, false); await frames(2);
  // Start pauses again; Start in the menu resumes and stays resumed while held and when let go
  await set(BTN.start, true); await until(paused, 'Start does not pause the second time'); await set(BTN.start, false); await pauseMenu();
  await set(BTN.start, true); await until(async () => !(await paused()), 'Start in the pause menu does not resume'); await frames(3); check(!(await paused()), 'holding Start after resuming paused the race again'); await set(BTN.start, false); await frames(3);
  check(!(await paused()), 'letting Start go paused the race');
  // B resumes as well
  await set(BTN.start, true); await until(paused, 'Start does not pause the third time'); await set(BTN.start, false); await pauseMenu();
  await press('b'); await until(async () => !(await paused()), 'B does not resume');
  // graphics in the pause
  await set(BTN.start, true); await until(paused, 'Start does not pause the fourth time'); await set(BTN.start, false); await pauseMenu();
  await walk('Grafik-Einstellungen'); await press('a'); await has('GRAFIK'); await sleep(500);
  await reach('pause, graphics'); await shot('pause_gfx');
  await press('b'); await sleep(400); check(await p.evaluate(() => document.body.textContent.includes('PAUSE')), 'B in the graphics panel does not go back to the pause menu');
  check(await paused(), 'B in the graphics panel resumed the race');
  // the reset button of the pad (Back, button 8) while the race runs
  await pauseMenu(); await press('b'); await until(async () => !(await paused()), 'B does not resume (before the reset)');
  await p.evaluate(() => { const G = window.__podracer, pl = G.player, s = G.td.main.samples[pl.idx]; pl.pos.x += s.rx * 70; pl.pos.z += s.rz * 70; pl.vel.set(0, 0, 0); });
  await set(8, true); await until(() => p.evaluate(() => window.__podracer.player.dead > 0 || window.__podracer.message.includes('ZURÜCK')), 'the Back button does not reset the pod'); await set(8, false);
  // the result screen: jump to the end of the race
  await p.evaluate(() => { const G = window.__podracer; for (const q of G.pods) { q.finished = true; q.finishTime = G.raceTime + q.id; } G.state = 'post'; G.postTimer = 5.9; });
  await has('ERGEBNIS', 240000); await until(async () => (await focus()).includes('Nochmal'), `result: the focus is on "${await focus()}", expected "Nochmal"`, 120);
  await reach('result'); await shot('result');
  await walk('Hauptmenü'); await press('a'); await has('RENNEN'); await until(async () => (await focus()).includes('Start'), `after the race: the focus is on "${await focus()}"`, 120);
}
await b.close();
if (errs || fails.length) { console.log(`\nGAMEPAD MENU CHECK FAILED: ${fails.length} problem(s), ${errs} page error(s)`); process.exit(1); }
console.log('\nGamepad menu check passed.');
