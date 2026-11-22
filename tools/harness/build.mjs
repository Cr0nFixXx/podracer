// Builds what the browser harness loads – on every system (it replaces the build half of the Linux-only run.sh):
//   out/game.js + out/game.html   track harness (game.ts)
//   out/pods.js + out/pods.html   pod harness (pods.ts)
//   out/texWorker.js              texture worker for the "tex" benchmark of the track harness
// The files are build artefacts and not in git: build them after a clone, after a sandbox reset and after every source change.
// Usage: npm run harness:build                (everything, ≈ 5 s)
//        node tools/harness/build.mjs game    (only that one: game | pods | texWorker)
// Pictures afterwards: pshot.mjs (docs/regeln/tests.md → "Test-Setup").
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, 'out');
const JOBS = {
  game: { entry: path.join(here, 'game.ts'), format: 'esm', page: true },
  pods: { entry: path.join(here, 'pods.ts'), format: 'esm', page: true },
  texWorker: { entry: path.join(here, '../../src/game/texWorker.ts'), format: 'iife', page: false },
};
const want = process.argv.slice(2);
const unknown = want.filter(n => !(n in JOBS));
if (unknown.length) { console.error(`unknown bundle: ${unknown.join(', ')} (known: ${Object.keys(JOBS).join(', ')})`); process.exit(2); }

fs.mkdirSync(out, { recursive: true });
for (const name of want.length ? want : Object.keys(JOBS)) {
  const job = JOBS[name], t0 = Date.now(), file = path.join(out, name + '.js');
  await build({ entryPoints: [job.entry], bundle: true, format: job.format, loader: { '.jpg': 'dataurl' }, outfile: file, logLevel: 'error' });
  if (job.page) fs.writeFileSync(path.join(out, name + '.html'), `<!doctype html><html><body><script type=module src=./${name}.js></script></body></html>\n`);
  console.log(`${path.relative(process.cwd(), file)}  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB  ${Date.now() - t0} ms`);
}
