// ===== Intro flight over the track (2026-11-23, user request) =====
// Before the countdown the camera flies along the main road in an endless loop until the player presses „Rennen starten":
// 20–35 m above the centre line, about three times race pace, looking ahead. This file works out the flight from the track data
// alone (no scene, no DOM – unit checks `intro:`); `Game` moves the camera along it.
//
// The height above the road is a slow wave inside the band, bent by what is above the road:
//   tunnel, cave, underwater tube   → half the ceiling height (inside the tunnel, not through the mountain)
//   zero-G tube                     → on the tube's axis
//   a bridge of the track itself    → below the deck (crossings without a tunnel)
//   gates, sponsor bridges, portal  → over them
//   tall rock arches                → under them
// All of it eased: the camera sinks towards a portal ahead of time and never steps.
import { DS, type Sample, type TrackData } from './trackBuilder';

/** Height above the road over open ground (m). */
export const FLIGHT_BAND: [number, number] = [20, 35];
/** Speed on a straight (m/s) – the field races at about 118 m/s on average, pods top out near 146 m/s. */
export const FLIGHT_SPEED = 420;
/** The camera looks at the road this far ahead (m). */
export const FLIGHT_LOOK = 110;

/** Climb / sink per metre of road, at most. */ const SLOPE = 0.2;
/** Half window of the final smoothing (samples). With `SLOPE` it rounds every corner of the height curve and moves it by at most
 *  1.55 m – every limit below keeps more than that in reserve. */ const SMOOTH = 15;
/** The view turns at most this fast (rad/s); the flight slows down for bends. */ const TURN_MAX = 1.9;
/** The camera climbs or sinks at most this fast (m/s); the flight slows down for steep road. */ const CLIMB_MAX = 110;
/** Never slower than this (m/s). */ const SPEED_MIN = 60;
/** Speeding up and slowing down (m/s²). */ const ACCEL = 160;
/** A structure across the road is flown over when the camera then stays below this height (m) – otherwise under. */ const OVER_MAX = 40;
/** The pass starts this many samples before the start line. */ const LEAD_IN = 40;

export interface FlightPose { x: number; y: number; z: number; /** look-at point */ lx: number; ly: number; lz: number; /** bank into the bend (rad, + = to the left as `Camera.rotateZ` turns) */ roll: number }
export interface IntroFlight {
  /** metres of one pass: a lap of a circuit; start to finish of a sprint (then it begins again) */ length: number;
  closed: boolean;
  /** camera position, look-at point and bank at `dist` metres into the flight (any value ≥ 0: passes repeat) */
  pose(dist: number, out: FlightPose): FlightPose;
  /** flight speed there (m/s) */ speedAt(dist: number): number;
  /** index of the main-path sample below the camera */ sampleAt(dist: number): number;
  /** height of the camera above the road at main-path sample `i` (m) */ heightAt(i: number): number;
}

export function buildIntroFlight(td: TrackData): IntroFlight {
  const S = td.main.samples, N = S.length, closed = td.main.closed;
  const wrap = (i: number) => closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i));

  // ---- 1. what the camera would like, and what limits it ----
  const want = new Float32Array(N), lo = new Float32Array(N), hi = new Float32Array(N).fill(1e9);
  const mid = (FLIGHT_BAND[0] + FLIGHT_BAND[1]) / 2, amp = (FLIGHT_BAND[1] - FLIGHT_BAND[0]) / 2;
  const waves = Math.max(1, Math.round(N * DS / 900)); // (a whole number of waves: a circuit closes without a step)
  for (let i = 0; i < N; i++) {
    want[i] = mid + amp * Math.sin(i / N * waves * Math.PI * 2 + 1.1);
    const s = S[i];
    if (s.zeroG) { lo[i] = 7; hi[i] = 7; } // the tube's axis (trackMesh: radius hw + 3 round a centre 7 m above the road)
    else if (s.roof > 0) hi[i] = Math.max(4, Math.min(s.roof * 0.5, s.roof - 3));
  }
  for (const c of td.crossings) if (!c.tunnelUnder) for (let i = c.lowerFrom; i <= c.lowerTo; i++) { const k = wrap(i); hi[k] = Math.min(hi[k], Math.max(6, c.clearance - 8)); } // (the box girder is 2.8 m deep)
  for (const oh of td.overheads ?? []) {
    const s0 = S[oh.idx]; if (!s0) continue;
    let bottom = oh.y0 - s0.y, top = oh.y1 - s0.y;
    if (oh.arch) { const A = oh.arch; bottom = (A.yOff ?? 0) + A.sy * (A.R - (A.inner ?? 1.7)); top = bottom + (A.thick ?? 3.6); } // (over the centre line, as in stepPod)
    const span = Math.ceil((oh.half + 6) / DS), over = top + 5 <= OVER_MAX;
    for (let k = -span; k <= span; k++) { const i = wrap(oh.idx + k); if (hi[i] < 1e8 && over) continue; if (over) lo[i] = Math.max(lo[i], top + 5); else hi[i] = Math.min(hi[i], Math.max(5, bottom - 5)); }
  }

  // ---- 2. limits with ramps: the camera has to be on its way before it reaches a portal or a gate ----
  const step = SLOPE * DS, rounds = closed ? 2 : 1;
  const hiR = Float32Array.from(hi), loR = Float32Array.from(lo);
  for (let r = 0; r < rounds; r++) {
    for (let i = 1; i < N + (closed ? 1 : 0); i++) { const a = wrap(i), b = wrap(i - 1); hiR[a] = Math.min(hiR[a], hiR[b] + step); loR[a] = Math.max(loR[a], loR[b] - step); }
    for (let i = N - 2 + (closed ? 1 : 0); i >= (closed ? -1 : 0); i--) { const a = wrap(i), b = wrap(i + 1); hiR[a] = Math.min(hiR[a], hiR[b] + step); loR[a] = Math.max(loR[a], loR[b] - step); }
  }
  const h0 = new Float32Array(N), h = new Float32Array(N);
  for (let i = 0; i < N; i++) h0[i] = Math.min(Math.max(want[i], loR[i]), hiR[i]); // (a ceiling beats a floor)
  const smooth = (src: Float32Array, dst: Float32Array, w: number) => {
    let acc = 0; for (let k = -w; k <= w; k++) acc += src[wrap(k)];
    for (let i = 0; i < N; i++) { dst[i] = acc / (2 * w + 1); acc += src[wrap(i + w + 1)] - src[wrap(i - w)]; }
  };
  smooth(h0, h, SMOOTH);

  // ---- 3. the camera's path and where it looks ----
  const lookN = Math.round(FLIGHT_LOOK / DS);
  /** point on the centre line at (fractional) sample `f`, raised by `up(i)`; beyond the end of an open path: straight on */
  const point = (f: number, up: (i: number) => number, out: { x: number; y: number; z: number }) => {
    if (!closed && f >= N - 1) { const s = S[N - 1], d = (f - (N - 1)) * DS; out.x = s.x + s.tx * d; out.y = s.y + up(N - 1); out.z = s.z + s.tz * d; return out; }
    const i0 = Math.floor(f), t = f - i0, a = S[wrap(i0)], b = S[wrap(i0 + 1)];
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; out.y = a.y + (b.y - a.y) * t + up(wrap(i0)) * (1 - t) + up(wrap(i0 + 1)) * t;
    return out;
  };
  const camUp = (i: number) => h[i], lookUp = (i: number) => Math.max(2.5, h[i] * 0.3);

  // ---- 4. speed: full on straights, slower where the view would swing round ----
  const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 };
  const yaw = new Float32Array(N); for (let i = 0; i < N; i++) { point(i, camUp, A); point(i + lookN, lookUp, B); yaw[i] = Math.atan2(B.x - A.x, B.z - A.z); }
  const turn = new Float32Array(N), turnS = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!closed && i === N - 1) { turn[i] = turn[i - 1]; break; } let d = yaw[wrap(i + 1)] - yaw[i]; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; turn[i] = Math.abs(d) / DS; }
  smooth(turn, turnS, 4);
  const rise = new Float32Array(N), riseS = new Float32Array(N); // metres of height per metre of road, road and wave together
  for (let i = 0; i < N; i++) { const j = !closed && i === N - 1 ? i - 1 : i; rise[i] = Math.abs(S[wrap(j + 1)].y + h[wrap(j + 1)] - S[j].y - h[j]) / DS; }
  smooth(rise, riseS, 4);
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = Math.max(SPEED_MIN, Math.min(FLIGHT_SPEED, TURN_MAX / Math.max(1e-6, Math.max(turn[i], turnS[i])), CLIMB_MAX / Math.max(1e-6, Math.max(rise[i], riseS[i]))));
  for (let r = 0; r < rounds; r++) {
    for (let i = 1; i < N + (closed ? 1 : 0); i++) { const a = wrap(i), b = wrap(i - 1); v[a] = Math.min(v[a], Math.sqrt(v[b] * v[b] + 2 * ACCEL * DS)); }
    for (let i = N - 2 + (closed ? 1 : 0); i >= (closed ? -1 : 0); i--) { const a = wrap(i), b = wrap(i + 1); v[a] = Math.min(v[a], Math.sqrt(v[b] * v[b] + 2 * ACCEL * DS)); }
  }
  // bank into the bends (the road's own curvature, + = right)
  const curv = new Float32Array(N), curvS = new Float32Array(N); for (let i = 0; i < N; i++) curv[i] = (S[i] as Sample).curv; smooth(curv, curvS, 15);

  // ---- 5. the pass ----
  const start = closed ? wrap(td.startIdx - LEAD_IN) : Math.max(0, td.startIdx - LEAD_IN);
  const length = closed ? N * DS : (Math.min(N - 1, td.finishIdx + 25) - start) * DS;
  const at = (dist: number) => start + (((dist % length) + length) % length) / DS;
  return {
    length, closed,
    pose(dist, out) {
      const f = at(dist), i = wrap(Math.floor(f));
      point(f, camUp, A); point(f + lookN, lookUp, B);
      out.x = A.x; out.y = A.y; out.z = A.z; out.lx = B.x; out.ly = B.y; out.lz = B.z;
      out.roll = -Math.max(-0.26, Math.min(0.26, curvS[i] * v[i] * 0.11));
      return out;
    },
    speedAt(dist) { const f = at(dist), i0 = Math.floor(f), t = f - i0; return v[wrap(i0)] * (1 - t) + v[wrap(i0 + 1)] * t; },
    sampleAt(dist) { return wrap(Math.floor(at(dist))); },
    heightAt(i) { return h[wrap(i)]; },
  };
}
