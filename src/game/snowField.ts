// ===== 2026-11-22: powder snow that keeps the trails of the pods (user decision: the trails change the driving too) =====
// Pure data (no three / DOM imports): physics, node checks and the snow deck of the world builder share it.
//
// A powder run = a contiguous stretch of samples whose surface is `powder` (the open snow field of an ice-world track).
// Over each run lies a grid of cells of 1 m × 1 m in strip coordinates (along the track, across it). A cell holds how firmly the
// snow is packed: 0 = fresh powder … 255 = a firm trail. Pods press trails into it (`stamp`), snowfall loosens them (`snowIn`),
// and the physics reads it (`packAt`): packed snow carries a pod faster than fresh powder – a racing line forms over the laps.
import { DS, type Sample, type TrackData } from './trackBuilder';
import { SURF } from './surfaces';

/** cells per sample along the track (a sample is `DS` = 2 m long) and cell width across, in metres */
export const SNOW_SUB = 2, SNOW_CELL = 1;
/** top-speed and grip factor on a fully packed trail (fresh powder: `SURFACES.powder` = 0.93 / 0.9) */
export const PACKED_VMAX = 0.985, PACKED_GRIP = 0.95;
/** a pod stamps once per this many metres of flight, each stamp packs the cell under it by this share of what is still loose */
export const STAMP_EVERY = 0.75, STAMP_AMOUNT = 0.32, STAMP_RADIUS = 1.5;

export interface SnowRun {
  /** path id, the samples of that path, first sample of the run, number of samples */ path: number; samples: Sample[]; a: number; n: number;
  /** half width of the grid in metres; grid size across / along */ W: number; nx: number; nz: number;
  /** nx · nz cells, a row runs across the track */ data: Uint8Array;
  /** set by `stamp` / `snowIn`, cleared by whoever uploads the texture */ dirty: boolean;
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
          if (n >= 8) { let W = 0; for (let k = a; k < i; k++) W = Math.max(W, S[k].hw); W = Math.ceil(W + 4); const nx = Math.ceil(2 * W / SNOW_CELL), nz = n * SNOW_SUB; this.runs.push({ path: p.id, samples: S, a, n, W, nx, nz, data: new Uint8Array(nx * nz), dirty: true }); }
          a = -1;
        }
      }
    }
  }
  runAt(path: number, idx: number): SnowRun | null { for (const r of this.runs) if (r.path === path && idx >= r.a && idx < r.a + r.n) return r; return null; }
  /** How firmly the snow is packed at a world point near sample `idx` of `path`: 0 (fresh) … 1 (firm trail). Bilinear between cells. */
  packAt(path: number, idx: number, x: number, z: number): number {
    const r = this.runAt(path, idx); if (!r) return 0;
    const s = r.samples[idx], dx = x - s.x, dz = z - s.z;
    const u = Math.max(0, Math.min(r.nx - 1, (dx * s.rx + dz * s.rz + r.W) / SNOW_CELL - 0.5)), v = Math.max(0, Math.min(r.nz - 1, (idx - r.a + (dx * s.tx + dz * s.tz) / DS) * SNOW_SUB - 0.5 + SNOW_SUB / 2));
    const i = Math.min(r.nx - 2, Math.floor(u)), j = Math.min(r.nz - 2, Math.floor(v)), fu = u - i, fv = v - j, d = r.data, k = j * r.nx + i;
    return ((d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + r.nx] * (1 - fu) + d[k + r.nx + 1] * fu) * fv) / 255;
  }
  /** Presses the snow down in a disc of radius `r` metres around a world point: every cell loses `amount` (0..1, less towards the rim) of what is still loose. */
  stamp(path: number, idx: number, x: number, z: number, r: number, amount: number) {
    const run = this.runAt(path, idx); if (!run) return;
    const s = run.samples[idx], dx = x - s.x, dz = z - s.z, cz = DS / SNOW_SUB;
    const u = (dx * s.rx + dz * s.rz + run.W) / SNOW_CELL, v = (idx - run.a + (dx * s.tx + dz * s.tz) / DS) * SNOW_SUB + SNOW_SUB / 2;
    const i0 = Math.max(0, Math.floor(u - r / SNOW_CELL)), i1 = Math.min(run.nx - 1, Math.ceil(u + r / SNOW_CELL)), j0 = Math.max(0, Math.floor(v - r / cz)), j1 = Math.min(run.nz - 1, Math.ceil(v + r / cz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = ((i + 0.5 - u) * SNOW_CELL) ** 2 + ((j + 0.5 - v) * cz) ** 2; if (q >= r * r) continue;
      const f = (1 - q / (r * r)) ** 2, k = j * run.nx + i;
      run.data[k] = Math.min(255, run.data[k] + (255 - run.data[k]) * amount * f + 0.5);
    }
    run.dirty = true;
  }
  /** Fresh snow: every cell becomes looser by `amount` (0..1 of the whole scale). */
  snowIn(amount: number) {
    const d8 = Math.round(amount * 255); if (d8 <= 0) return;
    for (const r of this.runs) { const d = r.data; for (let k = 0; k < d.length; k++) d[k] = d[k] > d8 ? d[k] - d8 : 0; r.dirty = true; }
  }
}
