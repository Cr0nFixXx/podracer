// Track relief statistics (node): height range, grades, banking, self-crossings.
// Usage: npx esbuild tools/harness/relief.ts --bundle --platform=node --outfile=/tmp/relief.cjs && node /tmp/relief.cjs
import { TRACKS } from '../../src/game/data';
import { buildTrack } from '../../src/game/trackBuilder';
for (let t = 0; t < TRACKS.length; t++) {
  const td = buildTrack(TRACKS[t]); const S = td.main.samples, N = S.length; const closed = td.main.closed;
  let minY = 1e9, maxY = -1e9, maxG = 0, sumG = 0, maxB = 0, banked = 0, maxEdge = 0, steep = 0;
  for (let i = 0; i < N; i++) {
    const a = S[i], b = S[closed ? (i + 5) % N : Math.min(N - 1, i + 5)]; const ds = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const g = Math.abs(b.y - a.y) / ds; maxG = Math.max(maxG, g); sumG += g; if (g > 0.05) steep++;
    minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y); maxB = Math.max(maxB, Math.abs(a.bank)); maxEdge = Math.max(maxEdge, Math.abs(a.bank) * a.hw); if (Math.abs(a.bank) > 0.12) banked++;
  }
  // self-crossings: far apart along the track, close in plan
  let cross = 0, minSep = 1e9;
  for (let i = 0; i < N; i += 4) for (let j = i + 120; j < N; j += 4) { if (closed && N - j + i < 120) continue; const a = S[i], b = S[j]; if (Math.hypot(a.x - b.x, a.z - b.z) < a.hw + b.hw) { cross++; minSep = Math.min(minSep, Math.abs(a.y - b.y)); } }
  let vAvg = 0; for (const s of S) vAvg += s.vmax; vAvg /= N;
  console.log(`${String(t).padStart(2)} ${TRACKS[t].id.padEnd(11)} N=${N} y=${minY.toFixed(0)}..${maxY.toFixed(0)} grade max=${(maxG * 100).toFixed(1)}% avg=${(sumG / N * 100).toFixed(1)}% >5%:${(steep / N * 100).toFixed(0)}% | bank max=${maxB.toFixed(2)} edge=${maxEdge.toFixed(1)}m >0.12:${(banked / N * 100).toFixed(0)}% | cross=${cross} minSep=${cross ? minSep.toFixed(1) : '-'} | vmaxAvg=${vAvg.toFixed(0)}`);
}
