// Track structure dump (dev helper): `npx esbuild tools/ci/info.ts --bundle --platform=node --format=esm --outfile=tools/ci/out/info.mjs --log-level=error && node tools/ci/out/info.mjs [trackId]`
import { TRACKS } from '../../src/game/data';
import { buildTrack } from '../../src/game/trackBuilder';
const only = process.argv[2];
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  const td = buildTrack(def), S = td.main.samples, N = S.length;
  const runs = (f: (i: number) => string | number | boolean | undefined) => { const out: string[] = []; let a = -1, v: unknown; for (let i = 0; i <= N; i++) { const c = i < N ? f(i) : undefined; if (c !== v) { if (a >= 0 && v) out.push(`${a}-${i - 1}${v === true ? '' : ':' + v}`); a = i; v = c; } } return out.join(' '); };
  console.log(`\n== ${TRACKS.indexOf(def)} ${def.id} (${def.theme}) N=${N} len=${(td.main.length / 1000).toFixed(2)}km start=${td.startIdx} finish=${td.finishIdx}`);
  console.log('  tunnels:', runs(i => S[i].roof > 0 ? `k${S[i].tun}` : 0));
  console.log('  canyon :', runs(i => S[i].canyon));
  console.log('  walls  :', runs(i => (S[i].hL > 0 ? 'L' : '') + (S[i].hR > 0 ? 'R' : '') || 0));
  console.log('  wide   :', runs(i => S[i].hw > 40));
  console.log('  bridge :', runs(i => S[i].bridge), '| underpass:', runs(i => S[i].underpass));
  console.log('  ramps  :', runs(i => S[i].ramp > 0), '| gaps:', runs(i => S[i].gap), '| zeroG:', runs(i => S[i].zeroG));
  console.log('  open   :', runs(i => (S[i].openL ? 'L' : '') + (S[i].openR ? 'R' : '') || 0));
  const surf = runs(i => (S[i] as unknown as { surf?: number }).surf); if (surf) console.log('  surf   :', surf);
  for (const p of td.paths.slice(1)) console.log(`  path ${p.id}${p.isCave ? ' CAVE' : ' shortcut'} n=${p.samples.length} main ${p.mainFrom}..${p.mainTo} side=${p.side} roof ${p.samples.findIndex(q => q.roof > 0)}..${p.samples.length - 1 - [...p.samples].reverse().findIndex(q => q.roof > 0)}`);
  const cv: [number, number][] = []; for (let i = 0; i < N; i += 2) cv.push([Math.abs(S[i].curv), i]); cv.sort((a, b) => b[0] - a[0]);
  const tops: number[] = []; for (const [, i] of cv) { if (tops.every(t => Math.abs(t - i) > 150)) tops.push(i); if (tops.length >= 5) break; }
  console.log('  tightest:', tops.map(i => `${i}(R=${(1 / Math.abs(S[i].curv)).toFixed(0)}m bank=${S[i].bank.toFixed(2)} hw=${S[i].hw.toFixed(0)}${S[i].roof > 0 ? ' roof' : ''}${S[i].canyon ? ' canyon' : ''})`).join(' '));
  // inner road edge folds over itself where the curve radius is smaller than the half width (hw·|curv| ≥ 1): the ribbon/basin mesh self-intersects there
  { let worst = 0, wi = 0; for (let i = 0; i < N; i++) { const k = Math.abs(S[i].curv) * S[i].hw; if (k > worst) { worst = k; wi = i; } }
    console.log('  fold   :', runs(i => Math.abs(S[i].curv) * S[i].hw >= 0.9) || 'none', `| worst hw/R = ${worst.toFixed(2)} @${wi}`); }
  { // flat basins (lakes / plateaus): the shore lies hw + lakeL/R outside the centre line – report where that is beyond the curve radius
    const L = S as unknown as { lake?: boolean; lakeL?: number; lakeR?: number }[];
    const k = (i: number) => L[i].lake ? Math.abs(S[i].curv) * (S[i].hw + Math.max(L[i].lakeL ?? 0, L[i].lakeR ?? 0) + 9) : 0;
    let worst = 0, wi = 0; for (let i = 0; i < N; i++) if (k(i) > worst) { worst = k(i); wi = i; }
    if (L.some(q => q.lake)) console.log('  basin  :', runs(i => !!L[i].lake), '| shore beyond radius:', runs(i => k(i) >= 1) || 'none', `| worst (hw+shore)/R = ${worst.toFixed(2)} @${wi}`); }
  console.log('  y range:', td.bounds.minY.toFixed(0), td.bounds.maxY.toFixed(0), 'seaY', td.seaY?.toFixed(1), 'obstacles', td.obstacles.length, 'setPieces', td.setPieces.map(q => q.type + '@' + q.idx).join(','));
}
