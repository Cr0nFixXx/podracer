// The boost alarm, measured without speakers (docs/regeln/tests.md): renders the alarm's voice at several levels on an offline audio
// context in the headless browser and prints loudness, pulse rate and pitch. Fails when the alarm is not silent at level 0, or when
// loudness, pulse rate or pitch do not rise with the level, or when the pulse edges click.
//
//   cd /var/tmp/t   (a folder with puppeteer installed – "Test-Setup" in docs/regeln/tests.md)
//   node palarm.mjs <abs path to tools/harness/out/game.html>
import puppeteer from 'puppeteer';
const [,, page] = process.argv;
if (!page) { console.log('usage: node palarm.mjs <game.html>'); process.exit(2); }
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('file://' + page + '?webgl');
await p.waitForFunction(() => typeof window.alarmProbe === 'function', { timeout: 120000 });
const levels = [0, 0.05, 0.2, 0.4, 0.6, 0.8, 1], rows = [];
for (const lv of levels) rows.push(await p.evaluate(l => window.alarmProbe(l), lv));
await b.close();
console.log('level   rms     peak    pulses/s  pitch Hz  sounding  largest step');
for (const r of rows) console.log(`${r.level.toFixed(2).padEnd(7)} ${String(r.rms).padEnd(7)} ${String(r.peak).padEnd(7)} ${String(r.pulsesPerSecond).padEnd(9)} ${String(r.hz).padEnd(9)} ${String(r.sounding).padEnd(9)} ${r.maxStep}`);
const bad = [];
if (rows[0].peak > 1e-4) bad.push(`not silent at level 0 (peak ${rows[0].peak})`);
for (let i = 2; i < rows.length; i++) {
  const a = rows[i - 1], c = rows[i];
  if (!(c.rms > a.rms)) bad.push(`loudness does not rise from level ${a.level} to ${c.level}`);
  if (!(c.pulsesPerSecond > a.pulsesPerSecond)) bad.push(`pulse rate does not rise from level ${a.level} to ${c.level}`);
  if (!(c.hz > a.hz)) bad.push(`pitch does not rise from level ${a.level} to ${c.level}`);
}
for (const r of rows.slice(1)) {
  if (r.sounding < 0.3 || r.sounding > 0.7) bad.push(`level ${r.level}: sounds ${Math.round(r.sounding * 100)} % of the time (pulses should be about half on, half off)`);
  // a clean tone of this pitch steps at most 2π · f / 24000 of its peak between two samples; a click steps far more
  if (r.maxStep > r.peak * (2 * Math.PI * r.hz / 24000) * 2.2) bad.push(`level ${r.level}: a step of ${r.maxStep} between two samples (peak ${r.peak}) – a click`);
}
if (bad.length) { console.log('\nALARM CHECK FAILED:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('\nAlarm check passed.');
