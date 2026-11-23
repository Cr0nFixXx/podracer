// ===== Rock rows along the natural stretches of a track (2026-11-23) =====
// Pure data (no three / DOM imports): used by the world builder and by the node CI.
//
// The track builder flags every side of a natural passage that has no canyon wall as a rock border (`Sample.rockL` / `rockR`) and
// gives it a height (`hL` / `hR`, 1.2 … 12 m). Physics, rivals and the checks read only that: a solid line at `wallL` / `wallR`.
// This module turns the line into what the player SEES: a row of single rocks that touch the line with their faces, overlap each
// other so the row has no gap at ground level, and are about as tall as the border the physics knows. Behind the row, here and
// there, a smaller rock – the land beyond stays open (terrain.ts builds no massif behind a rock border).
import { DS, mulberry32, type Sample, type TrackData } from './trackBuilder';

/** number of rock shapes the world builder provides (`variant` 0 … ROCK_VARIANTS − 1) */
export const ROCK_VARIANTS = 2;
/** a rock's face may stand at most this far inside the collision line */
export const ROCK_PROTRUDE = 0.25;
/** centres of two neighbours in a row are at most this fraction of the sum of their radii apart (1 = they only touch) */
export const ROCK_OVERLAP = 0.7;

export interface BorderRock {
  path: number;
  /** running number of the border stretch (a side of a path between two places without rock border) */
  run: number;
  side: 1 | -1;
  /** fractional sample index on the path the rock stands beside */
  at: number;
  /** centre, world space; `lat` = its offset from the centre line (positive, on `side`); `off` = its distance behind the collision
   *  line; (`ox`, `oz`) = the outward direction of the border there */
  x: number; z: number; lat: number; off: number; ox: number; oz: number;
  /** horizontal size: the rock body has a radius of about `r` metres */
  r: number;
  /** wanted height of its top above the road edge, metres */
  top: number;
  yaw: number;
  variant: number;
  /** a rock BEHIND the row (further out) – not part of the closed line */
  back: boolean;
}

/** How far the unit shape `variant` reaches from its centre in the horizontal direction `ang` of its own frame (support function).
 *  The world builder measures its rock geometries; without it every rock counts as a disc of radius 1. */
export type RockReach = (variant: number, ang: number) => number;

const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function borderRocks(td: TrackData, reach: RockReach = () => 1): BorderRock[] {
  const out: BorderRock[] = []; let runNo = 0;
  for (const path of td.paths) {
    const S = path.samples, n = S.length;
    for (const side of [-1, 1] as const) {
      const flag = (q: Sample) => !!(side > 0 ? q.rockR : q.rockL) && (side > 0 ? q.hR : q.hL) > 0;
      if (!S.some(flag)) continue;
      const rnd = mulberry32(hash(td.def.id) ^ (path.id * 7919 + (side > 0 ? 13 : 5)));
      // stretches of consecutive flagged samples; on a closed path the search starts behind a sample without border
      let i0 = 0; if (path.closed) { i0 = S.findIndex(q => !flag(q)); if (i0 < 0) i0 = 0; }
      const runs: number[][] = []; let cur: number[] | null = null;
      for (let k = 0; k < n; k++) {
        const i = (i0 + k) % n;
        if (flag(S[i])) { if (!cur) { cur = []; runs.push(cur); } cur.push(i); } else cur = null;
      }
      for (const run of runs) {
        const m = run.length; if (m < 2) continue;
        // the border line itself (not the centre line: on the outside of a bend it is longer, on the inside shorter)
        const bx = new Float64Array(m), bz = new Float64Array(m), cum = new Float64Array(m);
        for (let k = 0; k < m; k++) {
          const q = S[run[k]], w = side > 0 ? q.wallR : q.wallL;
          bx[k] = q.x + q.rx * side * w; bz[k] = q.z + q.rz * side * w;
          if (k > 0) cum[k] = cum[k - 1] + Math.hypot(bx[k] - bx[k - 1], bz[k] - bz[k - 1]);
        }
        const len = cum[m - 1]; let seg = 0;
        /** the border at `u` metres from the start of the stretch: point, outward direction, border height, fractional sample index */
        const at = (u: number) => {
          const uu = Math.max(0, Math.min(len, u));
          while (seg < m - 2 && cum[seg + 1] < uu) seg++;
          while (seg > 0 && cum[seg] > uu) seg--;
          const d = cum[seg + 1] - cum[seg], f = d > 1e-6 ? (uu - cum[seg]) / d : 0, a = S[run[seg]], b = S[run[seg + 1]];
          let ox = (a.rx + (b.rx - a.rx) * f) * side, oz = (a.rz + (b.rz - a.rz) * f) * side; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
          const hA = side > 0 ? a.hR : a.hL, hB = side > 0 ? b.hR : b.hL, wA = side > 0 ? a.wallR : a.wallL, wB = side > 0 ? b.wallR : b.wallL;
          return { x: bx[seg] + (bx[seg + 1] - bx[seg]) * f, z: bz[seg] + (bz[seg + 1] - bz[seg]) * f, ox, oz, h: hA + (hB - hA) * f, wall: wA + (wB - wA) * f, idx: run[seg] + f };
        };
        /** how deep a disc of radius r at (x, z) stands inside the collision line, seen from every sample it reaches (≤ 0: clear) */
        const intrusion = (x: number, z: number, r: number, idx: number) => {
          const j0 = Math.round(idx), W = Math.ceil(r / DS) + 3; let worst = -1e9;
          for (let k = -W; k <= W; k++) {
            const j = path.closed ? ((j0 + k) % n + n) % n : j0 + k; if (j < 0 || j >= n) continue;
            const q = S[j], along = (x - q.x) * q.tx + (z - q.z) * q.tz; if (Math.abs(along) >= r || (side > 0 ? q.openR : q.openL)) continue; // (a fork mouth has no line)
            const lat = side * ((x - q.x) * q.rx + (z - q.z) * q.rz);
            worst = Math.max(worst, (side > 0 ? q.wallR : q.wallL) - (lat - Math.sqrt(r * r - along * along)));
          }
          return worst;
        };
        // a rock's own two random numbers (height factor, girth) and its size beside a border of height h
        const draw = () => ({ fT: 0.82 + rnd() * 0.3, fR: 0.8 + rnd() * 0.4 });
        const sized = (h: number, f: { fT: number; fR: number }) => { const top = Math.max(1, h * f.fT); return { top, r: Math.min(6, Math.max(1.5, top * f.fR)) }; };
        const put = (u: number, r: number, top: number, out2: number, back: boolean) => {
          const p = at(u), yaw = rnd() * Math.PI * 2, variant = Math.floor(rnd() * ROCK_VARIANTS) % ROCK_VARIANTS;
          // direction towards the road in the rock's own frame (three.js: a rotation by `yaw` about +Y turns local (x, z) into
          // (x cos + z sin, −x sin + z cos) – the inverse is applied to the world direction)
          const wx = -p.ox, wz = -p.oz, lx = wx * Math.cos(yaw) - wz * Math.sin(yaw), lz = wx * Math.sin(yaw) + wz * Math.cos(yaw);
          let off = reach(variant, Math.atan2(lz, lx)) * r - rnd() * ROCK_PROTRUDE + out2;
          // The row is laid out along the border LINE; on the inside of a bend the line curves round the rock and a rock that touches
          // it in one place cuts it in the next. Measured in the frame of every sample the rock reaches: pushed back until it stands
          // clear, left out where that does not help (a road that folds over itself in a kink tighter than its half width).
          for (let pass = 0; ; pass++) {
            const d = intrusion(p.x + p.ox * off, p.z + p.oz * off, r * 1.06, p.idx);
            if (d <= ROCK_PROTRUDE) break;
            if (pass === 3 || d - ROCK_PROTRUDE > r * 0.6 + 0.5) return;
            off += d - ROCK_PROTRUDE + 0.05;
          }
          out.push({ path: path.id, run: runNo, side, at: p.idx, x: p.x + p.ox * off, z: p.z + p.oz * off, lat: p.wall + off, off, ox: p.ox, oz: p.oz, r, top, yaw, variant, back });
        };
        // The row: every rock overlaps the one before it. A rock is as tall as the border AT THE PLACE WHERE IT ENDS UP: its size sets
        // its distance from the rock before it, so the place is estimated first and corrected twice. (Until 2026-11-23 the estimate
        // was final: where the border height changes quickly a rock stood up to 2 m lower than the border the physics knows.)
        const f0 = draw(); let sz = sized(at(0).h, f0); sz = sized(at(sz.r * 0.45).h, f0); let u = sz.r * 0.45;
        for (let guard = 0; guard < 20000; guard++) {
          put(u, sz.r, sz.top, 0, false);
          if (rnd() < 0.3) { const k = 0.42 + rnd() * 0.3; put(u + (rnd() * 1.4 - 0.7) * sz.r, sz.r * k, sz.top * (0.45 + rnd() * 0.4), sz.r * (0.75 + rnd() * 0.5), true); }
          if (u >= len - sz.r * 0.5) break;
          const f = draw(), step = ROCK_OVERLAP - 0.09 + rnd() * 0.08; let nx = sized(at(u + sz.r * 1.3).h, f);
          for (let it = 0; it < 2; it++) nx = sized(at(Math.min(len, u + (sz.r + nx.r) * step)).h, f);
          u = Math.min(len, u + (sz.r + nx.r) * step); sz = nx;
        }
        runNo++;
      }
    }
  }
  return out;
}
