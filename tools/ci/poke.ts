// Dev helper: where does the terrain MESH stand above the road? The field is sampled on a grid of CELL metres (as the terrain mesh along
// the track does: 4.5 m "Ultra", 7 m "Mittel" / "Hoch", 13.75 m "Niedrig"), each quad split like `buildTerrain` splits it.
//   npx esbuild tools/ci/poke.ts --bundle --platform=node --format=esm --outfile=tools/ci/out/poke.mjs --log-level=error && node tools/ci/out/poke.mjs [trackId|all] [cell] [q]
// (`q` = totals only.) The unit checks `forks: …` run the same test at the fork mouths of four tracks.
import { TRACKS, THEMES } from '../../src/game/data';
import { buildTrack } from '../../src/game/trackBuilder';
import * as T from '../../src/game/terrain';
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '', CELL = +(process.argv[3] ?? 7), verbose = process.argv[4] !== 'q';
let grand = 0; const t0 = Date.now();
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  const td = buildTrack(def), theme = THEMES[def.theme];
  const tf = T.makeTerrainField(td, theme, CELL);
  const memo = new Map<number, number>(), H = (i: number, j: number) => { const k = i * 200003 + j; let v = memo.get(k); if (v === undefined) { v = tf.heightAt(i * CELL, j * CELL); memo.set(k, v); } return v; };
  const mesh = (x: number, z: number) => { const fi = x / CELL, fj = z / CELL, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, a = H(i, j), b = H(i, j + 1), c = H(i + 1, j + 1), d = H(i + 1, j);
    return u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c); };
  const lines: string[] = []; let total = 0, worst = 0;
  for (const p of td.paths) {
    const S = p.samples; let run: { a: number; b: number; mx: number; lat: number; n: number } | null = null;
    const flush = () => { if (run) { lines.push(`  path ${p.id}${p.isCave ? ' CAVE' : ''} ${run.a}-${run.b} max +${run.mx.toFixed(1)} m @lat ${run.lat.toFixed(0)} (${run.n} pts)`); run = null; } };
    for (let i = 0; i < S.length; i += 2) {
      // (2026-11-23: bridges are tested too – the terrain passes BELOW a bridge, but on the Methan-Derby the massif of the canyon
      //  before the bridge stood across half of its deck; until then this line skipped `s.bridge`)
      const s = S[i]; if (s.gap || s.zeroG || s.lake) { flush(); continue; }
      let mx = 0, ml = 0, n = 0;
      for (let lat = -s.hw + 0.5; lat <= s.hw - 0.5; lat += 1.5) {
        const x = s.x + s.rx * lat, z = s.z + s.rz * lat, road = s.y + s.ramp - lat * s.bank, h = mesh(x, z);
        if (h > road + 0.3) { n++; if (h - road > mx) { mx = h - road; ml = lat; } }
      }
      if (n) { total += n; worst = Math.max(worst, mx); if (run && i - run.b <= 8) { run.b = i; run.n += n; if (mx > run.mx) { run.mx = mx; run.lat = ml; } } else { flush(); run = { a: i, b: i, mx, lat: ml, n }; } }
    }
    flush();
  }
  grand += total;
  console.log(`${def.id.padEnd(11)} terrain mesh (${CELL} m) above the road: ${String(total).padStart(5)} points, worst +${worst.toFixed(1)} m, ${lines.length} places` + (verbose && lines.length ? '\n' + lines.slice(0, 14).join('\n') + (lines.length > 14 ? `\n  … ${lines.length - 14} more` : '') : ''));
}
console.log(`TOTAL ${grand} points  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
