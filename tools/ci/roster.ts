// The 11 pods of a CI run (tools/ci/sim.ts).
import { PODS, type PodDef } from '../../src/game/data';

/** Grid of track number `track`: a window of 11 pods that moves on by 3 per track, so every pod is driven on most tracks.
 *  `old` = the Session 19 grid (first ten pods + the first one again) for A/B runs against the old table. */
export function ciRoster(track: number, old = false): PodDef[] {
  const out: PodDef[] = [];
  for (let g = 0; g < 11; g++) out.push(old ? PODS[g % 10] : PODS[(g + track * 3) % PODS.length]);
  return out;
}
