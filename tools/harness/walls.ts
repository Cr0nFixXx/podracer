import { TRACKS, THEMES } from '../../src/game/data';
import { buildTrack } from '../../src/game/trackBuilder';
for (let t = 0; t < TRACKS.length; t++) { const td = buildTrack(TRACKS[t]); const S = td.main.samples; let n = 0, mx = 0; for (const s of S) { const h = Math.max(s.hL, s.hR); if (h >= 18) n++; mx = Math.max(mx, h); }
  console.log(t, TRACKS[t].id, (THEMES as Record<string, { terrain: string }>)[TRACKS[t].theme]?.terrain, 'samples>=18m:', n, 'max', mx.toFixed(1)); }
