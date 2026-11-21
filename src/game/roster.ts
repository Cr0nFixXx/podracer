// Who races: the Gegner of a race are drawn from all pods except the player's own.
import { PODS, type PodDef } from './data';

/** `n` different Gegner pods in random order (Fisher–Yates with `rnd`, default Math.random). Never the player's pod. */
export function pickRivals(playerId: string, n: number, rnd: () => number = Math.random): PodDef[] {
  const pool = PODS.filter(p => p.id !== playerId);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, Math.max(0, Math.min(Math.floor(n), pool.length)));
}
