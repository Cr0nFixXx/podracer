// ===== Powder snow as a real layer of drifts that the pods cut trenches through =====
// 2026-11-23, user: "3D Schnee: mehr Schnee / viel höherer Schnee, richtig 3D" – decision "dynamische Höhe 1–3 m", only on the powder
// fields. (2026-11-22, the step before: 0.58 m of snow that packed a little harder with every pass.)
// Pure data (no three / DOM imports): physics, rivals, node checks and the snow deck of the world builder share it.
//
// A powder run = a contiguous stretch of samples whose surface is `powder` (the open snow field of an ice-world track).
// Over each run lies a grid of cells of 1 m × 1 m in strip coordinates (along the track, across it). Two bytes per cell:
//   `depth` – how high the fresh snow stands there (the drift, 0 … SNOW_MAX m). Fixed for the race: wind-blown ridges of 1 to 3 m,
//             shallow at both ends of the field, at set pieces (the gate) and around obstacle rocks – nothing is buried.
//   `data`  – how much of it a pod has cut away: 0 = untouched … 255 = a trench down to SNOW_FLOOR.
// Pods cut (`stamp`), snowfall fills the trenches again (`snowIn`), the physics reads the cut (`packAt`): fresh snow holds a pod at
// 86 % of its top speed (`SURFACES.powder`), a trench lets it run at `TRENCH_VMAX` – so the first pod ploughs and the others follow
// (`trenchNear` is how the rivals find a trench).
import { DS, type Sample, type TrackData } from './trackBuilder';
import { SURF } from './surfaces';

/** cells per sample along the track (a sample is `DS` = 2 m long) and cell width across, in metres */
export const SNOW_SUB = 2, SNOW_CELL = 1;
/** depth of the drifts in metres (user: "dynamische Höhe 1–3 m") */
export const SNOW_MIN = 1, SNOW_MAX = 3;
/** what a pod leaves on the road in its trench · depth where the field is kept shallow (ends, set pieces, obstacle rocks), metres */
export const SNOW_FLOOR = 0.22, SNOW_SHALLOW = 0.3;
/** samples over which the drifts rise at both ends of a field · samples before and after a set piece until the drift is back ·
 *  metres beyond the radius of an obstacle rock until the drift is back */
export const SNOW_LEAD = 20, SNOW_CLEAR_PIECE = 16, SNOW_CLEAR_ROCK = 8;
/** top-speed and grip factor in a trench (fresh powder: `SURFACES.powder` = 0.86 / 0.9) */
export const TRENCH_VMAX = 0.99, TRENCH_GRIP = 0.95;
/** a pod cuts once per this many metres of flight (several times per step at racing speed – the trench has no gaps) */
export const STAMP_EVERY = 1;

export interface SnowRun {
  /** path id, the samples of that path, first sample of the run, number of samples */ path: number; samples: Sample[]; a: number; n: number;
  /** half width of the grid in metres; grid size across / along */ W: number; nx: number; nz: number;
  /** nx · nz cells, a row runs across the track: how much is cut away (0 … 255) */ data: Uint8Array;
  /** nx · nz cells: height of the fresh snow, 0 … 255 = 0 … SNOW_MAX m. Never changes after the constructor. */ depth: Uint8Array;
  /** set by `stamp` / `snowIn`, cleared by whoever uploads the texture */ dirty: boolean;
}

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (i: number, j: number, s: number) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
/** smooth value noise, 0 … 1 */
function vnoise(x: number, y: number, s: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
/** Height of the drift at a point of the strip (metres across from the centre line, metres along from the start of the run):
 *  ridges about 16 m wide and 50 m long lying obliquely across the field, one broad swell, and sharp crest lines (wind-cut edges –
 *  a crease shows in flat light, a soft swell does not). SNOW_MIN … SNOW_MAX. */
export function driftHeight(lat: number, along: number, seed: number) {
  const a = lat * 0.9 + along * 0.43, b = along * 0.9 - lat * 0.43; // turned by 25°: the wind blows obliquely across the track
  const n = 0.52 * vnoise(a / 16, b / 50, seed) + 0.3 * vnoise(a / 7 + 19.1, b / 23 + 3.7, seed + 1) + 0.18 * vnoise(a / 40 + 5.3, b / 95 + 11.9, seed + 2);
  const crest = (1 - Math.abs(2 * vnoise(a / 12 + 3.1, b / 38 + 8.7, seed + 3) - 1)) ** 2;
  return SNOW_MIN + (SNOW_MAX - SNOW_MIN) * Math.max(0, Math.min(1, 0.74 * sstep(0.33, 0.67, n) + 0.42 * crest - 0.07));
}

export class SnowField {
  readonly runs: SnowRun[] = [];
  constructor(td: TrackData) {
    for (const p of td.paths) {
      const S = p.samples; let a = -1;
      for (let i = 0; i <= S.length; i++) {
        const on = i < S.length && S[i].surf === SURF.powder && !S[i].gap;
        if (on && a < 0) a = i;
        if (!on && a >= 0) {
          const n = i - a;
          if (n >= 8) {
            let W = 0; for (let k = a; k < i; k++) W = Math.max(W, S[k].hw); W = Math.ceil(W + 4);
            const nx = Math.ceil(2 * W / SNOW_CELL), nz = n * SNOW_SUB;
            const run: SnowRun = { path: p.id, samples: S, a, n, W, nx, nz, data: new Uint8Array(nx * nz), depth: new Uint8Array(nx * nz), dirty: true };
            this.drifts(run, td, this.runs.length * 31 + Math.round(Math.abs(S[a].x) * 0.7 + Math.abs(S[a].z) * 0.3) % 977); this.runs.push(run); // (every field its own drifts)
          }
          a = -1;
        }
      }
    }
  }
  /** Fills `run.depth`: the drifts, kept shallow where something must stay visible. */
  private drifts(run: SnowRun, td: TrackData, seed: number) {
    const { nx, nz, W, samples: S, a, n, depth } = run, cz = DS / SNOW_SUB;
    const pieces = run.path === 0 ? td.setPieces.map(sp => sp.idx).filter(i => i > a - 2 * SNOW_CLEAR_PIECE && i < a + n + 2 * SNOW_CLEAR_PIECE) : [];
    for (let j = 0; j < nz; j++) {
      // (row j lies at sample coordinate (j − 0.5) / SNOW_SUB of the run – the convention of `read`, `stamp` and the snow deck)
      const kc = (j - 0.5) / SNOW_SUB, s = S[a + Math.max(0, Math.min(n - 1, Math.round(kc)))], end = Math.min(kc + 0.25, n - 0.75 - kc);
      // both ends: the snow starts at nothing and the drifts rise over SNOW_LEAD samples; set pieces: a cleared threshold
      let f = sstep(0, SNOW_LEAD, end);
      for (const g of pieces) f *= sstep(SNOW_CLEAR_PIECE * 0.45, SNOW_CLEAR_PIECE, Math.abs(a + kc - g));
      const thin = Math.min(1, end / 3);
      for (let i = 0; i < nx; i++) {
        const lat = -W + (i + 0.5) * SNOW_CELL, over = Math.abs(lat) - s.hw;
        const h = (SNOW_SHALLOW + (driftHeight(lat, kc * DS, seed) - SNOW_SHALLOW) * f) * thin * (over > 0 ? Math.max(0, 1 - over / 3) : 1); // beyond the road edge the snow runs out against the wall
        depth[j * nx + i] = Math.round(Math.min(1, h / SNOW_MAX) * 255);
      }
    }
    // obstacle rocks: the wind scoops the snow away around them (distance in the world, not in the strip – the field bends)
    for (const o of td.obstacles) {
      if (o.path !== run.path || o.idx < a - 8 || o.idx >= a + n + 8) continue;
      const R = o.r + SNOW_CLEAR_ROCK, dj = Math.ceil(R / cz * 1.5) + 2, j0 = Math.max(0, (o.idx - a) * SNOW_SUB - dj), j1 = Math.min(nz - 1, (o.idx - a) * SNOW_SUB + dj);
      const i0 = Math.max(0, Math.floor((o.lat - R * 1.4 + W) / SNOW_CELL)), i1 = Math.min(nx - 1, Math.ceil((o.lat + R * 1.4 + W) / SNOW_CELL));
      for (let j = j0; j <= j1; j++) {
        const kf = (j + 0.5) / SNOW_SUB - 0.5, k0 = Math.max(0, Math.min(n - 1, Math.round(kf))), s = S[a + k0], al = (kf - k0) * DS;
        for (let i = i0; i <= i1; i++) {
          const lat = -W + (i + 0.5) * SNOW_CELL, x = s.x + s.rx * lat + s.tx * al, z = s.z + s.rz * lat + s.tz * al;
          const f = sstep(o.r + 1.5, R, Math.hypot(x - o.x, z - o.z)); if (f >= 1) continue;
          const c = j * nx + i, h = depth[c] / 255 * SNOW_MAX, lo = Math.min(h, SNOW_SHALLOW);
          depth[c] = Math.round((lo + (h - lo) * f) / SNOW_MAX * 255);
        }
      }
    }
  }
  runAt(path: number, idx: number): SnowRun | null { for (const r of this.runs) if (r.path === path && idx >= r.a && idx < r.a + r.n) return r; return null; }
  /** bilinear read of one of the two cell arrays at a world point near sample `idx`, 0 … 1 */
  private read(r: SnowRun, d: Uint8Array, idx: number, x: number, z: number): number {
    const s = r.samples[idx], dx = x - s.x, dz = z - s.z;
    const u = Math.max(0, Math.min(r.nx - 1, (dx * s.rx + dz * s.rz + r.W) / SNOW_CELL - 0.5)), v = Math.max(0, Math.min(r.nz - 1, (idx - r.a + (dx * s.tx + dz * s.tz) / DS) * SNOW_SUB - 0.5 + SNOW_SUB / 2));
    const i = Math.min(r.nx - 2, Math.floor(u)), j = Math.min(r.nz - 2, Math.floor(v)), fu = u - i, fv = v - j, k = j * r.nx + i;
    return ((d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + r.nx] * (1 - fu) + d[k + r.nx + 1] * fu) * fv) / 255;
  }
  /** How much of the snow is cut away at a world point near sample `idx` of `path`: 0 (untouched) … 1 (trench). */
  packAt(path: number, idx: number, x: number, z: number): number { const r = this.runAt(path, idx); return r ? this.read(r, r.data, idx, x, z) : 0; }
  /** Height of the FRESH snow there in metres (the drift) – what stood before any pod came. 0 off the field. */
  depthAt(path: number, idx: number, x: number, z: number): number { const r = this.runAt(path, idx); return r ? this.read(r, r.depth, idx, x, z) * SNOW_MAX : 0; }
  /** Height of the snow standing there NOW in metres: the drift, less what has been cut away (a trench keeps SNOW_FLOOR). The snow
   *  deck draws exactly this (snowDeck.ts computes it from the same two arrays). */
  heightAt(path: number, idx: number, x: number, z: number): number {
    const r = this.runAt(path, idx); if (!r) return 0;
    const h = this.read(r, r.depth, idx, x, z) * SNOW_MAX;
    return h - (h - Math.min(h, SNOW_FLOOR)) * this.read(r, r.data, idx, x, z);
  }
  /** Cuts the snow away in a disc of radius `r` metres around a world point: the inner 60 % lose `amount` (0..1) of what still
   *  stands, the rim less – with `amount` 1 one stamp leaves a trench with steep walls. */
  stamp(path: number, idx: number, x: number, z: number, r: number, amount: number) {
    const run = this.runAt(path, idx); if (!run) return;
    const s = run.samples[idx], dx = x - s.x, dz = z - s.z, cz = DS / SNOW_SUB;
    const u = (dx * s.rx + dz * s.rz + run.W) / SNOW_CELL, v = (idx - run.a + (dx * s.tx + dz * s.tz) / DS) * SNOW_SUB + SNOW_SUB / 2;
    const i0 = Math.max(0, Math.floor(u - r / SNOW_CELL)), i1 = Math.min(run.nx - 1, Math.ceil(u + r / SNOW_CELL)), j0 = Math.max(0, Math.floor(v - r / cz)), j1 = Math.min(run.nz - 1, Math.ceil(v + r / cz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = Math.sqrt(((i + 0.5 - u) * SNOW_CELL) ** 2 + ((j + 0.5 - v) * cz) ** 2); if (q >= r) continue;
      const f = 1 - sstep(0.6 * r, r, q), k = j * run.nx + i;
      run.data[k] = Math.min(255, run.data[k] + (255 - run.data[k]) * amount * f + 0.5);
    }
    run.dirty = true;
  }
  /** Fresh snow: every cell fills up by `amount` (0..1 of the whole scale). */
  snowIn(amount: number) {
    const d8 = Math.round(amount * 255); if (d8 <= 0) return;
    for (const r of this.runs) { const d = r.data; for (let k = 0; k < d.length; k++) d[k] = d[k] > d8 ? d[k] - d8 : 0; r.dirty = true; }
  }
  /** The trench a pod of half width `half` should take through the row of sample `idx`: an offset from the centre line (within
   *  ±`lim`, at most `reach` m from `lat0`, where the pod is) at which the snow under both of its engine banks is cut. A trench close
   *  to the pod beats a better one far away, one near `ideal` (its racing line) beats one far from it. The answer lies in the MIDDLE
   *  of a narrow trench, and 1.5 m inside the nearer wall of a wide cleared lane. Null: nothing in reach is cut – the pod ploughs
   *  its own line. */
  trenchNear(path: number, idx: number, lat0: number, half: number, lim: number, ideal = lat0, reach = 24): { lat: number; cut: number } | null {
    const r = this.runAt(path, idx); if (!r) return null;
    const s = r.samples[idx], off = half * 0.55, at = (lat: number) => this.read(r, r.data, idx, s.x + s.rx * lat, s.z + s.rz * lat);
    const cutAt = (lat: number) => (at(lat - off) + at(lat + off)) / 2, lo = Math.max(-lim, lat0 - reach), hi = Math.min(lim, lat0 + reach);
    let best = -1, bLat = 0, bCut = 0;
    for (let lat = lo; lat <= hi; lat += 1) {
      const cut = cutAt(lat); if (cut < 0.5) continue;
      const score = cut - Math.abs(lat - lat0) * 0.012 - Math.abs(lat - ideal) * 0.004;
      if (score > best) { best = score; bLat = lat; bCut = cut; }
    }
    if (best < 0) return null;
    // the lane around the winner: as far to both sides as the snow stays cut about as much
    let l = bLat, rr = bLat; const need = Math.max(0.5, bCut - 0.1);
    while (l - 1 >= -lim && cutAt(l - 1) >= need) l -= 1;
    while (rr + 1 <= lim && cutAt(rr + 1) >= need) rr += 1;
    const m = Math.min(1.5, (rr - l) / 2);
    return { lat: Math.max(l + m, Math.min(rr - m, lat0)), cut: bCut };
  }
}
