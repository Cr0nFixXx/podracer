// UI layout check (Puppeteer): opens the built app at several window sizes, visits every menu screen and fails if anything scrolls
// (document or any element with overflow auto/scroll that has more content than space) or sticks out of the window.
// Usage (from a dir with puppeteer): node pui.mjs <abs path to dist/index.html> <abs out prefix>
import puppeteer from 'puppeteer';
const [,, dist, out] = process.argv;
const sizes = [[1280, 720], [1920, 1080], [1024, 600], [800, 1000], [2560, 1440]].filter(s => !process.env.SIZES || process.env.SIZES.split(',').includes(String(s[0])));
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
let bad = 0; const shots = [];
const click = (p, text) => p.evaluate(t => { const el = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); if (!el) throw new Error('button not found: ' + t); el.click(); }, text);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const audit = p => p.evaluate(() => {
  const r = []; const vw = innerWidth, vh = innerHeight;
  if (document.documentElement.scrollHeight > vh + 1 || document.documentElement.scrollWidth > vw + 1) r.push('document scrolls');
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if ((/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) r.push('scrollable: ' + el.tagName + '.' + String(el.className).slice(0, 40));
  }
  // every button / heading must lie inside the window
  for (const el of document.querySelectorAll('button, h1, h2, select, input')) { const q = el.getBoundingClientRect(); if (q.width && (q.right > vw + 2 || q.bottom > vh + 2 || q.left < -2 || q.top < -2)) { r.push('outside: ' + el.tagName + ' "' + el.textContent.trim().slice(0, 20) + '" ' + Math.round(q.right) + 'x' + Math.round(q.bottom)); break; } }
  // the text of every heading must be visible to its last letter (2026-11-23: at 16:9 the title "PODRACER" ran behind the pod preview
  // of the main menu – the heading's box was inside the window, its text was not on top)
  for (const el of document.querySelectorAll('h1, h2')) {
    const rg = document.createRange(); rg.selectNodeContents(el); const rects = [...rg.getClientRects()].filter(q => q.width > 1 && q.height > 1); if (!rects.length) continue;
    // … and inside the heading's own box: a title painted with `bg-clip-text` gets its colour only inside the box – a letter that
    // overflows it is invisible although nothing covers it
    const box = el.getBoundingClientRect(), wide = rects.find(q => q.right > box.right + 2 || q.left < box.left - 2);
    if (wide) { r.push('heading text wider than its box: ' + el.tagName + ' "' + el.textContent.trim().slice(0, 20) + '" text to x ' + Math.round(wide.right) + ', box to ' + Math.round(box.right)); continue; }
    for (const q of rects) for (const x of [q.left + 3, q.right - 3]) {
      const top = document.elementFromPoint(Math.min(vw - 1, Math.max(0, x)), q.top + q.height / 2);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) { r.push('covered: ' + el.tagName + ' "' + el.textContent.trim().slice(0, 20) + '" at x ' + Math.round(x) + ' by ' + top.tagName); break; }
    }
  }
  return r;
});
for (const [w, h] of sizes) {
  const scales = [];
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => { bad++; console.log('[pageerror]', e.message.slice(0, 200)); });
  await p.goto('file://' + dist); await p.waitForFunction(() => document.body.textContent.includes('Rennen starten'), { timeout: 120000 });
  for (const [name, btn] of [['menu', null], ['setup', 'Rennen starten'], ['garage', 'Hangar & Tuning'], ['settings', 'Einstellungen']]) {
    if (btn) { await click(p, btn); await sleep(900); }
    const issues = await audit(p);
    const fitI = await p.evaluate(() => { const e = document.querySelector('[data-fit-scale]'); return e ? [e.dataset.fitScale, e.dataset.fitShrunk, Math.round(e.scrollHeight), Math.round(parseFloat(e.style.minHeight))] : null; });
    if (fitI) { scales.push(fitI[0]); if (fitI[1] === '1') issues.push(`content too tall for the canvas (${fitI[2]} > ${fitI[3]} px) – emergency shrink active`); }
    if (issues.length) bad++;
    console.log(`${w}x${h} ${name.padEnd(8)} scale ${fitI ? fitI[0] : '-'} content ${fitI ? fitI[2] + '/' + fitI[3] : '-'} ${issues.length ? 'FAIL ' + issues.slice(0, 3).join(' | ') : 'ok'}`);
    if ((w === 1280 || w === 800 || w === 1024) && name !== 'menu') shots.push([`${w}x${h} ${name}`, 'data:image/jpeg;base64,' + Buffer.from(await p.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'), w, h]);
    if (name === 'settings') { await click(p, 'Steuerung'); await sleep(500); const i2 = await audit(p); const f2 = await p.evaluate(() => { const e = document.querySelector('[data-fit-scale]'); return [e.dataset.fitScale, e.dataset.fitShrunk]; }); scales.push(f2[0]); if (f2[1] === '1') i2.push('emergency shrink'); if (i2.length) bad++; console.log(`${w}x${h} keys     ${i2.length ? 'FAIL ' + i2.slice(0, 3).join(' | ') : 'ok'}`); }
    if (btn) { await click(p, 'Zurück'); await sleep(500); }
  }
  // The menus have two layouts: landscape (720 units high, every landscape window is a scaled copy of 1280 × 720) and portrait
  // (800 × 1000). The two checks below change the screens' content, so they run once per layout.
  const twoLayouts = w === 1280 || w === 800;
  // planet filter
  // (a track of another planet must leave the list, a track of the chosen planet must stay – the names come from src/game/data.ts → TRACKS)
  if (twoLayouts) { await click(p, 'Rennen starten'); await sleep(600); const listed = () => p.evaluate(() => ['Frostspalt-Ring', 'Boonta-Kessel'].map(n => document.body.textContent.includes(n))); const before = await listed(); await p.select('select[aria-label="Planet"]', 'Tatooine'); await sleep(400); const after = await listed(); const fine = before[0] && before[1] && !after[0] && after[1]; console.log('planet filter "Tatooine": Frostspalt-Ring (Ando Prime) listed before/after:', before[0], after[0], '· Boonta-Kessel (Tatooine) before/after:', before[1], after[1], fine ? 'ok' : 'FAIL'); if (!fine) bad++; }
  // 2026-11-25 (reported by the user: "im Hauptmenü werden beim ausgewählten Podracer nicht die eingebauten Teile angezeigt"): a pod
  // with Tuning-Teile and Style-Teile must look the same in the main menu and in the hangar. Every pod preview writes what it shows
  // into `data-pod-look` (pod | fins, intake, nozzle | part tier per tuning value | canopy | paint of the parts).
  if (twoLayouts) {
    await click(p, 'Zurück'); await sleep(400);
    const look = () => p.evaluate(() => document.querySelector('[data-pod-look]')?.dataset.podLook ?? '(no pod preview)');
    const pod = (await look()).split('|')[0];
    await p.evaluate(id => localStorage.setItem('podracer-profile-v2', JSON.stringify({ podId: id, custom: { [id]: { tuning: { topSpeed: 4, accel: 4, turn: 2, traction: 4, airbrake: 2, cooling: 4, repair: 4 }, kit: { fins: 2, intake: 1, nozzle: 3, canopy: 1, paint: 3 }, partColor: '#27a36d' } } })), pod);
    await p.reload(); await p.waitForFunction(() => document.body.textContent.includes('Rennen starten') && document.querySelector('[data-pod-look]'), { timeout: 120000 }); await sleep(600);
    const menu = await look(); await click(p, 'Hangar & Tuning'); await sleep(900); const hangar = await look();
    const want = `${pod}|213|2212122|1|paint 3 #27a36d`, fine = menu === want && hangar === want;
    console.log(`pod with parts: main menu shows "${menu}", hangar shows "${hangar}", built: "${want}" ${fine ? 'ok' : 'FAIL'}`); if (!fine) bad++;
    // the „Teile" tab of the hangar with the own colour of the parts chosen (its tallest state: picker and swatches show) must fit too
    await p.evaluate(() => document.querySelector('[data-tab="teile"]').click()); await sleep(700);
    { const issues = await audit(p), picker = await p.evaluate(() => !!document.querySelector('[data-part-color] input[type=color]'));
      if (!picker) issues.push('no colour picker for the parts'); if (issues.length) bad++;
      console.log(`${w}x${h} garage · Teile, own part colour: ${issues.length ? 'FAIL ' + issues.slice(0, 3).join(' | ') : 'ok'}`);
      shots.push([`${w}x${h} garage Teile`, 'data:image/jpeg;base64,' + Buffer.from(await p.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'), w, h]); }
    await p.evaluate(() => localStorage.removeItem('podracer-profile-v2'));
  }
  const uni = new Set(scales).size === 1; console.log(`${w}x${h} uniform UI scale across screens: ${uni ? 'ok (' + scales[0] + ')' : 'FAIL ' + [...new Set(scales)].join(', ')}`); if (!uni) bad++;
  await p.close();
}
const g = await b.newPage(); await g.setViewport({ width: 1500, height: 1000 });
await g.setContent('<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start">' + shots.map(([n, s, w, h]) => `<div style="color:#fff;font:11px sans-serif">${n}<br><img src="${s}" style="height:${w < 900 ? 400 : 290}px"></div>`).join('') + '</body>');
await g.screenshot({ path: out + '_ui.jpg', type: 'jpeg', quality: 80 });
await b.close(); console.log(bad ? `${bad} layout problem(s) – FAILED` : 'UI layout check passed (no scrollbars, nothing outside the window).'); process.exit(bad ? 1 : 0);
