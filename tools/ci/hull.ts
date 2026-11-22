// Measures the hull round a pod model for the pod audit (tools/ci/pods.ts): per part (left engine side, right engine side, cockpit)
// a row of slabs across the pod – each slab is a prism: the outline of its side view (upper edge from back to front), pushed through
// its width. Physics tests the corners of these prisms against tunnel vaults and overhead structures (src/game/podDesigns.ts).
// Everything is in body space (x right, y up, z forward – the frame the model is built in), in metres.

/** One slab of a part: `x0`..`x1` its width, `y0` its lowest point, `top` the upper outline of its side view as z, y pairs from back to front. */
export interface Slab { x0: number; x1: number; y0: number; top: number[] }

const BIN = 0.01, Z0 = -24, NZ = Math.round(48 / BIN); // side view: 1 cm columns from z = -24 to +24
const up = (v: number) => Math.ceil(v * 100 - 1e-6) / 100, down = (v: number) => Math.floor(v * 100 + 1e-6) / 100;

/** Collects the vertices of one part (any number of outfits) and turns them into slabs of width `w` (boundaries at multiples of `w`;
 *  `w` = 0: one slab for the whole part). */
export class PartCloud {
  private slabs = new Map<number, { top: Float32Array; x0: number; x1: number; y0: number }>();
  constructor(private w: number) {}
  add(a: ArrayLike<number>, ox = 0, oy = 0, oz = 0) {
    const w = this.w, inv = w > 0 ? 1 / w : 0, zo = oz - Z0; let last = NaN, s = this.slabs.get(0)!;
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i] + ox, y = a[i + 1] + oy, k = Math.floor(x * inv);
      if (k !== last) { let t = this.slabs.get(k); if (!t) { t = { top: new Float32Array(NZ).fill(-1e9), x0: 1e9, x1: -1e9, y0: 1e9 }; this.slabs.set(k, t); } s = t; last = k; }
      if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x; if (y < s.y0) s.y0 = y;
      let b = ((a[i + 2] + zo) * 100) | 0; if (b < 0) b = 0; else if (b >= NZ) b = NZ - 1;
      if (y > s.top[b]) s.top[b] = y;
    }
  }
  /** Highest point of every 1 cm column of the side view of slab `k` (for the containment check): [z of the column's back edge, y]. */
  columns(): { x0: number; x1: number; y0: number; cols: [number, number][] }[] {
    return [...this.slabs.entries()].sort((p, q) => p[0] - q[0]).map(([, s]) => {
      const cols: [number, number][] = []; for (let b = 0; b < NZ; b++) if (s.top[b] > -1e8) cols.push([Math.round((Z0 + b * BIN) * 100) / 100, s.top[b]]);
      return { x0: s.x0, x1: s.x1, y0: s.y0, cols };
    });
  }
  /** The slabs: upper convex outline of every side view, thinned (`tol`: a dropped corner lies at most this far above the outline –
   *  the outline is raised by `tol` to make up for it), every number rounded outwards to the centimetre. */
  build(tol = 0.03): Slab[] {
    return this.columns().map(s => {
      // both edges of every column carry its height: the outline then covers the whole column
      const pts: [number, number][] = []; for (const [z, y] of s.cols) { pts.push([z, y], [Math.round((z + BIN) * 100) / 100, y]); }
      let h: [number, number][] = [];
      for (const p of pts) { // upper convex hull, left to right (points are sorted by z)
        if (h.length && h[h.length - 1][0] === p[0]) { if (h[h.length - 1][1] >= p[1]) continue; h.pop(); }
        while (h.length >= 2) { const a = h[h.length - 2], b = h[h.length - 1]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) h.pop(); else break; }
        h.push(p);
      }
      // thin: drop the corner that stands out least above the line through its neighbours, as long as that is below `tol`
      const full = h.slice();
      const above = (q: [number, number][]) => { let m = 0, j = 0; for (const p of full) { while (j < q.length - 2 && q[j + 1][0] < p[0]) j++; const a = q[j], b = q[j + 1]; m = Math.max(m, p[1] - (a[1] + (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0]))); } return m; };
      while (h.length > 2) {
        let bi = -1, bd = 1e9;
        for (let i = 1; i < h.length - 1; i++) { const a = h[i - 1], b = h[i], c = h[i + 1], d = b[1] - (a[1] + (c[1] - a[1]) * (b[0] - a[0]) / (c[0] - a[0])); if (d < bd) { bd = d; bi = i; } }
        if (bd > tol) break;
        const t = h.filter((_, i) => i !== bi); if (above(t) > tol) break; h = t;
      }
      const top: number[] = []; h.forEach((p, i) => { top.push(i === 0 ? down(p[0]) : i === h.length - 1 ? up(p[0]) : Math.round(p[0] * 100) / 100, up(p[1] + tol)); });
      return { x0: down(s.x0), x1: up(s.x1), y0: down(s.y0), top };
    });
  }
}

/** Height of a slab's outline at `z` (-Infinity outside its length). */
export function outlineAt(top: number[], z: number) {
  if (z < top[0] - 1e-6 || z > top[top.length - 2] + 1e-6) return -Infinity;
  if (z <= top[0]) return top[1];
  for (let i = 0; i + 3 < top.length; i += 2) if (z <= top[i + 2]) { const f = top[i + 2] === top[i] ? 1 : (z - top[i]) / (top[i + 2] - top[i]); return top[i + 1] + (top[i + 3] - top[i + 1]) * f; }
  return top[top.length - 1];
}
