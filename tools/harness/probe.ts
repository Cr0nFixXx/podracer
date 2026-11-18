// Track probe (node): prints features around a sample index. Usage: npx esbuild tools/harness/probe.ts --bundle --platform=node --outfile=/tmp/probe.cjs && node /tmp/probe.cjs <trackIdx> <from> <to>
import { TRACKS } from '../../src/game/data';
import { buildTrack } from '../../src/game/trackBuilder';
const [ti, a, b] = process.argv.slice(2).map(Number);
const td = buildTrack(TRACKS[ti]);
const S = td.main.samples;
for (let i = a; i <= b; i += 2) { const s = S[i]; console.log(i, `y=${s.y.toFixed(1)} hw=${s.hw.toFixed(1)} wallL=${s.wallL?.toFixed?.(1)} wallR=${s.wallR?.toFixed?.(1)} ramp=${s.ramp} gap=${!!s.gap} curv=${s.curv.toFixed(4)} bank=${s.bank.toFixed(2)} canyon=${!!s.canyon} roof=${s.roof ?? ''} vmax=${s.vmax?.toFixed?.(0)}`); }
console.log('obstacles', td.obstacles.filter(o => o.path === 0 && o.idx >= a - 20 && o.idx <= b).map(o => `${o.idx}:k${o.kind} lat${o.lat.toFixed(1)} r${o.r.toFixed(1)}`).join(' '));
console.log('setPieces', td.setPieces.map(s => `${s.type}@${s.idx}`).join(' '), 'hazards', td.hazards.map((h: { idx?: number }) => h.idx).join(','));
