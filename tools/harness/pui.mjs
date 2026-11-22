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
  // planet filter
  // (a track of another planet must leave the list, a track of the chosen planet must stay – the names come from src/game/data.ts → TRACKS)
  if (w === 1280) { await click(p, 'Rennen starten'); await sleep(600); const listed = () => p.evaluate(() => ['Frostspalt-Ring', 'Boonta-Kessel'].map(n => document.body.textContent.includes(n))); const before = await listed(); await p.select('select[aria-label="Planet"]', 'Tatooine'); await sleep(400); const after = await listed(); const fine = before[0] && before[1] && !after[0] && after[1]; console.log('planet filter "Tatooine": Frostspalt-Ring (Ando Prime) listed before/after:', before[0], after[0], '· Boonta-Kessel (Tatooine) before/after:', before[1], after[1], fine ? 'ok' : 'FAIL'); if (!fine) bad++; }
  const uni = new Set(scales).size === 1; console.log(`${w}x${h} uniform UI scale across screens: ${uni ? 'ok (' + scales[0] + ')' : 'FAIL ' + [...new Set(scales)].join(', ')}`); if (!uni) bad++;
  await p.close();
}
const g = await b.newPage(); await g.setViewport({ width: 1500, height: 1000 });
await g.setContent('<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start">' + shots.map(([n, s, w, h]) => `<div style="color:#fff;font:11px sans-serif">${n}<br><img src="${s}" style="height:${w < 900 ? 400 : 290}px"></div>`).join('') + '</body>');
await g.screenshot({ path: out + '_ui.jpg', type: 'jpeg', quality: 80 });
await b.close(); console.log(bad ? `${bad} layout problem(s) – FAILED` : 'UI layout check passed (no scrollbars, nothing outside the window).'); process.exit(bad ? 1 : 0);
