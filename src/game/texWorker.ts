// Web Worker entry: procedural texture synthesis off the main thread (bundled inline by Vite: `texWorker?worker&inline`).
import { computeTexture } from './texCore';
import type { TexKind } from './data';

interface Job { id: number; kind: TexKind; palette: string[]; size: number; seed: number; emissive?: string }
const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage: (m: unknown, transfer: Transferable[]) => void };
ctx.onmessage = e => {
  const t0 = performance.now(); const j = e.data, b = computeTexture(j.kind, j.palette, j.size, j.seed, j.emissive);
  const tr: Transferable[] = [b.map.buffer, b.nrm.buffer, b.rh.buffer]; if (b.em) tr.push(b.em.buffer);
  ctx.postMessage({ id: j.id, ms: Math.round(performance.now() - t0), ...b }, tr);
};
