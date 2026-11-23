import * as THREE from 'three';
import type { TrackDef } from './data';
import { SURF, SURFACES, THEME_SURFACES } from './surfaces';

export const DS = 2; // sample spacing in meters
/** Session 11: global road width scale (+18 % – more room for slides, knife-edge passes and three-wide racing) */
export const TRACK_WIDTH = 1.18;
export const WIDTH_SCALE = 2.0; // global road width multiplier
export const SC_HW = 12; // shortcut half width
export const RAIL_INSET = 0.3; // guard-rail inner face, metres inside the road edge
export const CANYON_OUTSET = 0.5; // canyon rock face, metres outside the road edge
/** Session 20: every tunnel / cave cross-section is a superellipse |x/W|^n + |y/H|^n = 1 instead of a half ellipse. The half ellipse
 *  was only 44 % of its crown height above the road edge – pods (lift, 90° roll) and the chase camera dipped into the vault near the
 *  walls. With n = 3 the walls are nearly vertical and the vault is broad: 65 % at 0.9 W, 87 % at 0.7 W. Used by the mesh (world.ts),
 *  the ceiling collision (physics.ts) and the camera (Game.ts) – keep them in sync through these helpers only. */
export const TUNNEL_N = 3;
/** lateral shoulder between the road edge and the tunnel wall foot (tunnel half width Wd = hw + TUNNEL_SHOULDER + caveW) */
export const TUNNEL_SHOULDER = 3.4;
/** vault height factor 0..1 at the lateral fraction l = |lat| / Wd */
export function tunnelProfile(l: number) { const a = Math.min(1, Math.abs(l)); return TUNNEL_N === 3 ? Math.cbrt(1 - a * a * a) : Math.pow(1 - Math.pow(a, TUNNEL_N), 1 / TUNNEL_N); } // (n = 3 without `pow`: asked for every hull corner near a vault)
/** cross-section point for the parameter angle 0..π (0 = right wall foot, π/2 = crown, π = left wall foot): [x / W, y / H] */
export function tunnelArc(ang: number): [number, number] { const c = Math.cos(ang), sn = Math.sin(ang), e = 2 / TUNNEL_N; return [Math.sign(c) * Math.pow(Math.abs(c), e), Math.pow(Math.max(0, sn), e)]; }
/** Height of the tunnel shell above the road surface point below it (0 outside tunnels) – lat measured from the centreline of `s`. */
export function tunnelCeiling(s: Sample, lat: number) {
  if (!(s.roof > 0)) return 0;
  return 1.5 + (s.roof - 1.5) * tunnelProfile(Math.abs(lat) / (s.hw + TUNNEL_SHOULDER + (s.caveW ?? 0)));
}

export interface Sample {
  x: number; y: number; z: number;
  tx: number; tz: number; // horizontal tangent
  rx: number; rz: number; // right vector
  hw: number; // half width
  bank: number; // slope across (y = y - lat*bank)
  curv: number; // signed curvature (+ right)
  ramp: number; // additional height (ramp)
  gap: boolean;
  zeroG: boolean;
  canyon: boolean;
  openL: boolean; openR: boolean;
  link: number; // linked path id
  wallL: number; wallR: number; // barrier offsets from the centreline (rails / canyon rock) used for collision
  hL: number; hR: number; // cliff wall height per side (0 = no cliff → guard rail)
  /** 2026-11-22: the wall on this side is a natural rock border (a low, uneven row of rock where a guard rail used to stand: every
   *  passage over natural ground) – solid like a canyon wall up to its top, and a pod that flies higher is only pushed back */
  rockL?: boolean; rockR?: boolean;
  roof: number; // tunnel ceiling height above the road (0 = open sky)
  tun?: number; // tunnel kind: 1 = standard (drivable deck), 2 = underwater tube (Aquilaris), 3 = cave, 4 = underpass tunnel beneath bridge
  caveW?: number; // extra lateral cavern width per side inside widened cave chambers (carries cave-floor mesh)
  /** Session 20: ground surface under this sample (index into SURFACES, 0 = built race deck) – look, grip, top speed, engine heat */
  surf: number;
  /** flat open basin (lake, frozen lake, rock plateau): level road at `lakeY`, no camber, no rails/kerbs; the liquid / rock sheet reaches
   *  `lakeL` / `lakeR` metres beyond the left / right road edge. `lvl` 0..1 = how far profile and camber are levelled (eases in/out). */
  lake?: boolean; lakeY?: number; lakeL?: number; lakeR?: number; lvl?: number;
  bridge?: boolean; // elevated overpass viaduct crossing over a lower stretch of the track
  underpass?: boolean; // lower stretch passing beneath an elevated track bridge
  vmax: number; // ai reference speed
  s: number;
}

export interface Crossing {
  upperIdx: number; lowerIdx: number;
  upperFrom: number; upperTo: number;
  lowerFrom: number; lowerTo: number;
  x: number; z: number; clearance: number; tunnelUnder: boolean;
}

export interface Obstacle { path: number; idx: number; lat: number; r: number; kind: number; x: number; y: number; z: number; hz?: number; /** Session 14: small rocks & crates can be smashed at speed */ breakable?: boolean; broken?: boolean }
/** Overhead structure across the main path (sponsor gantry, start portal): solid between y0 and y1 within ±half metres along the track. */
export interface Overhead { idx: number; y0: number; y1: number; half: number; /** half-elliptic arch (checkpoint gate): inner radius R, vertical squash sy – the ceiling height depends on the lateral position */ arch?: { R: number; sy: number; /** tube radius towards the inside (default 1.7) */ inner?: number; /** base height relative to the road (default 0) */ yOff?: number; /** vertical thickness (default 3.6) */ thick?: number; /** set-piece index: after its collapse only the two stumps (|lat| > R/2) remain solid */ sp?: number } } // kind 3 = AI keep-out only (hazard / rotor disc), kind 4 = set-piece solid (no generic visual)
/** Periodic eruption zone (methane geyser / lava vent). state: 0 idle, 0.5 warning, 1 erupting (set by Game). */
export interface Hazard { idx: number; lat: number; r: number; x: number; y: number; z: number; period: number; phase: number; duty: number; state: number; }

export interface Path {
  id: number;
  samples: Sample[];
  closed: boolean;
  length: number;
  mainFrom: number; // for shortcuts / cave branches: main idx range
  mainTo: number;
  side: number;
  isCave?: boolean; // subterranean branching cave tube reuniting inside the cave system
}

export interface TrackData {
  /** 2026-11-22: the trails in the powder snow (snowField.ts) – set by whoever runs a race on the track (Game, a unit check); absent: powder is plain powder */
  snow?: import('./snowField').SnowField;
  def: TrackDef;
  seaY?: number; // fixed sea level of ocean worlds (set before the underwater tunnels dip the road)
  overheads?: Overhead[]; // filled by the world builder (trackDetail / start portal), read by stepPod
  crossings: Crossing[]; // grade-separated bridge/tunnel self-crossings
  paths: Path[];
  main: Path;
  N: number;
  startIdx: number;
  finishIdx: number;
  obstacles: Obstacle[];
  obstaclesByPath: Map<number, Obstacle[]>[];
  hazards: Hazard[];
  setPieces: SetPiece[];
  arches: number[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
}

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Session 18: every layout is expanded procedurally – scaled ×1.3, extra S-curves inserted into long segments (with a clearance
 *  check against the rest of the layout) and two wide open flats (road ×1.9, no canyon walls) on the longest segments.
 *  `map[i]` = index of the original control point i in the enriched list (shortcut hints refer to original indices). */
export const TRACK_SCALE = 1.3;
function controlPoints(def: TrackDef): { pts: { x: number; z: number; y: number; w: number }[]; map: number[] } {
  const raw = !!(globalThis as { NO_EXPAND?: boolean }).NO_EXPAND, sc = raw ? 1 : TRACK_SCALE;
  const base = def.pts.map(([x, z, y, w]) => ({ x: x * 100 * sc, z: z * 100 * sc, y, w: w * WIDTH_SCALE }));
  const n = base.length;
  if (raw) return { pts: base, map: base.map((_p, i) => i) };
  const closed = def.type === 'circuit', segN = closed ? n : n - 1, rnd = mulberry32(hashStr(def.id + '|expand'));
  const P = (i: number) => base[((i % n) + n) % n];
  const segLen = (i: number) => Math.hypot(P(i + 1).x - P(i).x, P(i + 1).z - P(i).z);
  // Detect segments involved in grade-separated self-crossings so crossings stay crisp straight bridges/tunnels (never widened to 108 m flats or kinked)
  const dSeg = (px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const vx = b.x - a.x, vz = b.z - a.z, t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(px - a.x - vx * t, pz - a.z - vz * t);
  };
  const segCross = (a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }, d: { x: number; z: number }) => {
    const ccw = (p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }) => (r.z - p.z) * (q.x - p.x) > (q.z - p.z) * (r.x - p.x);
    if (ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)) return true;
    return Math.min(dSeg(a.x, a.z, c, d), dSeg(b.x, b.z, c, d), dSeg(c.x, c.z, a, b), dSeg(d.x, d.z, a, b)) < 135;
  };
  const crossSeg = new Set<number>();
  for (let i = 0; i < segN; i++) for (let j = i + 2; j < segN; j++) {
    if (closed && Math.min(j - i, segN - (j - i)) <= 1) continue;
    if (segCross(P(i), P(i + 1), P(j), P(j + 1))) { crossSeg.add(i); crossSeg.add(j); }
  }
  const nearCross = (i: number) => crossSeg.has(i) || crossSeg.has(((i - 1) % segN + segN) % segN) || crossSeg.has((i + 1) % segN);
  // (1) open flats: the two longest segments away from the grid, finish, shortcut hints and bridge/tunnel crossings
  const order: number[] = []; for (let i = 2; i < segN - 2; i++) if (!nearCross(i) && !def.shortcuts.some(c => Math.abs(c - i) <= 1 || Math.abs(c - i - 1) <= 1)) order.push(i);
  order.sort((a, b) => segLen(b) - segLen(a));
  const flats: number[] = []; for (const i of order) { if (flats.length >= 2) break; if (flats.every(f => Math.abs(f - i) > 3)) flats.push(i); }
  for (const f of flats) for (const i of [f, f + 1]) { const q = P(i); q.w = Math.max(q.w, Math.min(q.w * 1.9, 46 * WIDTH_SCALE)); } // → up to ~108 m of road width
  // (2) meanders
  const ins: { x: number; z: number }[] = [];
  const clear = (px: number, pz: number, i: number) => {
    for (let s2 = 0; s2 < segN; s2++) { const d = Math.abs(s2 - i), dd = closed ? Math.min(d, segN - d) : d; if (dd <= 1) continue; if (dSeg(px, pz, P(s2), P(s2 + 1)) < 185) return false; }
    return ins.every(q => Math.hypot(q.x - px, q.z - pz) > 170);
  };
  const out: typeof base = [], map: number[] = []; let sign = rnd() < 0.5 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    map.push(out.length); out.push(base[i]);
    if (i >= segN) continue;
    const a = base[i], b = P(i + 1), len = segLen(i);
    if (i === 0 || i === segN - 1 || len < 330 || crossSeg.has(i)) continue; // grid / finish / crossing spans stay crisp & straight
    const k = len > 640 ? 2 : 1, dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    for (let j = 1; j <= k; j++) {
      const t = j / (k + 1), mx = a.x + (b.x - a.x) * t, mz = a.z + (b.z - a.z) * t, amp0 = Math.min(len * (k === 2 ? 0.17 : 0.25), 95);
      let done = false;
      for (const [sg, am] of [[sign, amp0], [-sign, amp0], [sign, amp0 * 0.55], [-sign, amp0 * 0.55]]) {
        const px = mx - dz * sg * am, pz = mz + dx * sg * am;
        if (!clear(px, pz, i)) continue;
        out.push({ x: px, z: pz, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t }); ins.push({ x: px, z: pz }); sign = -sg; done = true; break;
      }
      if (!done) sign = -sign;
    }
  }
  return { pts: out, map };
}

function findStraight(S: Sample[], N: number, at: number, closed: boolean, taken: number[], need: number) {
  // horizontal curvature estimate directly from positions
  const ang = (i: number) => { const a = S[((i - 3) % N + N) % N], b = S[(i % N + N) % N], c = S[((i + 3) % N + N) % N]; const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z; return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)); };
  let best = Math.floor(at * N), bs = 1e9;
  for (let k = -Math.floor(N * 0.16); k <= Math.floor(N * 0.16); k += 4) {
    const i0 = Math.floor(at * N) + k; if (!closed && (i0 < 120 || i0 + need > N - 60)) continue;
    if (taken.some(t => Math.abs(t - i0) < need + 60)) continue;
    let crossBad = false;
    for (let j = -35; j < need + 35; j += 4) { const q = S[((i0 + j) % N + N) % N]; if (q.bridge || q.underpass) { crossBad = true; break; } }
    if (crossBad) continue;
    let sc = 0; for (let j = -20; j < need; j += 3) sc += ang(i0 + j);
    sc += Math.abs(k) * 0.0004;
    if (sc < bs) { bs = sc; best = i0; }
  }
  return ((best % N) + N) % N;
}

function finalizeSamples(S: Sample[], closed: boolean, banked = false) {
  const n = S.length;
  const get = (i: number) => closed ? S[(i + n) % n] : S[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i++) {
    const a = get(i - 1), b = get(i + 1);
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    S[i].tx = tx; S[i].tz = tz; S[i].rx = -tz; S[i].rz = tx;
  }
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = get(i - 2), b = get(i + 2);
    const cr = a.tx * b.tz - a.tz * b.tx, dt = a.tx * b.tx + a.tz * b.tz;
    raw.push(Math.atan2(cr, dt) / (4 * DS));
  }
  const W = 8;
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -W; k <= W; k++) { let j = i + k; if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue; s += raw[j]; c++; }
    S[i].curv = s / c;
    // Session 10: main circuits get real banked corners (up to ~21° / 6.2 m outer-edge rise); shortcuts keep the gentle camber
    const bl = S[i].bridge ? Math.min(0.16, 2.6 / Math.max(1, S[i].hw)) : banked ? Math.min(0.39, 6.2 / Math.max(1, S[i].hw)) : Math.min(0.2, 2.4 / Math.max(1, S[i].hw));
    S[i].bank = S[i].gap || S[i].zeroG ? 0 : Math.max(-bl, Math.min(bl, S[i].curv * (banked ? 46 : 14))) * (1 - (S[i].lvl ?? 0));
  }
  // AI reference speeds
  for (let i = 0; i < n; i++) {
    let k = 0; for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(get(i + j).curv));
    S[i].vmax = Math.min(200, 1.35 / Math.max(k, 1e-4) * (1 + Math.abs(S[i].bank) * 0.45));
    if (S[i].ramp > 0 || S[i].gap) S[i].vmax = 200;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nx = closed ? S[(i + 1) % n] : S[Math.min(n - 1, i + 1)];
      S[i].vmax = Math.min(S[i].vmax, Math.sqrt(nx.vmax * nx.vmax + 2 * 38 * DS));
    }
    if (!closed) break;
  }
}

function makeSample(p: THREE.Vector3, hw: number, s: number): Sample {
  return { x: p.x, y: p.y, z: p.z, tx: 0, tz: 1, rx: -1, rz: 0, hw, bank: 0, curv: 0, ramp: 0, gap: false, zeroG: false, canyon: false, openL: false, openR: false, link: -1, wallL: hw, wallR: hw, hL: 0, hR: 0, roof: 0, surf: 0, vmax: 200, s };
}

export function buildTrack(def: TrackDef): TrackData {
  const rng = mulberry32(hashStr(def.id));
  // Session 20: all ceilings raised once more (+6.5…7.5 m) – see `tunnelProfile` for the new cross-section
  const ICE = def.theme === 'ice', UNDER_ROOF = ICE ? 28 : 26, STD_ROOF = ICE ? 30 : 27, SC_ROOF = ICE ? 27 : 25, CAVE_ROOF = ICE ? 29 : 27, SEA_ROOF = 26;
  const { pts, map: cpMap } = controlPoints(def);
  const closed = def.type === 'circuit';
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, p.z)), closed, 'centripetal');
  let length = curve.getLength();
  const N = Math.round(length / DS);
  const samples: Sample[] = [];
  const nP = pts.length;
  for (let i = 0; i < N; i++) {
    const u = closed ? i / N : i / (N - 1);
    const p = curve.getPointAt(u);
    const fi = u * (closed ? nP : nP - 1);
    const i0 = Math.floor(fi) % nP, i1 = (i0 + 1) % nP, f = fi - Math.floor(fi);
    const w = pts[i0].w + (pts[Math.min(i1, nP - 1)].w - pts[i0].w) * f;
    samples.push(makeSample(p, w / 2 * TRACK_WIDTH, i * DS));
  }
  // geometric centerline smoothing: removes curvature spikes from the spline, widens tight radii slightly
  for (let pass = 0; pass < 4; pass++) {
    const xs = samples.map(q => q.x), zs = samples.map(q => q.z), ws = samples.map(q => q.hw);
    for (let i = 0; i < N; i++) {
      if (!closed && (i < 8 || i > N - 9)) continue;
      let sx = 0, sz = 0, sw = 0, c = 0;
      for (let k = -7; k <= 7; k++) { const j = closed ? (i + k + N) % N : i + k; const w = 8 - Math.abs(k); sx += xs[j] * w; sz += zs[j] * w; sw += ws[j] * w; c += w; }
      samples[i].x = sx / c; samples[i].z = sz / c; samples[i].hw = sw / c;
    }
  }
  // 2026-11-23 – no fold. Where the road is wider than its bend allows (half width > radius), its inner edge runs backwards and the
  // ribbon lies over itself: the wide flats of Boonta (a 121° turn of 20 m radius on a road 108 m wide), Mos Espa and Aquilaris did
  // (seen since Session 18: overlapping road mesh, beacons bunched up, nothing can stand on that inner edge). Such a bend is now
  // rounded: the centre line is smoothed there, and only there, until the half width is at most 0.85 × the radius – the road keeps
  // its width, the corner becomes a sweeping curve. Tracks without such a bend are not touched (bit-identical).
  // (Tried first and dropped: moving the centre line outwards and narrowing the road on the inside. The sideways shift has to run in
  //  and out somewhere, and on a road this wide those S-bends folded the road again a hundred metres further on.)
  {
    const ACT = 0.85, W = (i: number) => closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i)), inside = (j: number) => closed || (j >= 0 && j < N);
    const tx = new Float64Array(N), tz = new Float64Array(N), raw = new Float64Array(N), cv = new Float64Array(N), mask = new Float64Array(N), xs = new Float64Array(N), zs = new Float64Array(N);
    for (let pass = 0; pass < 120; pass++) {
      // curvature the way `finalize` measures it later (tangent over ±1 sample, turn over ±2, mean over ±8)
      for (let i = 0; i < N; i++) { const a = samples[W(i - 1)], b = samples[W(i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; tx[i] = (b.x - a.x) / l; tz[i] = (b.z - a.z) / l; }
      for (let i = 0; i < N; i++) {
        const a = W(i - 2), b = W(i + 2); let len = 0;
        for (let k = -2; k < 2; k++) { const p = samples[W(i + k)], q = samples[W(i + k + 1)]; len += Math.hypot(q.x - p.x, q.z - p.z); }
        raw[i] = Math.atan2(tx[a] * tz[b] - tz[a] * tx[b], tx[a] * tx[b] + tz[a] * tz[b]) / Math.max(1e-6, len);
      }
      for (let i = 0; i < N; i++) { let sum = 0, c = 0; for (let k = -8; k <= 8; k++) if (inside(i + k)) { sum += raw[W(i + k)]; c++; } cv[i] = sum / c; }
      // where to smooth: fully within 20 samples of a bend that is too tight, fading out over the next 30
      mask.fill(0); let any = false;
      for (let i = 0; i < N; i++) {
        if (Math.abs(cv[i]) * samples[i].hw <= ACT) continue; any = true;
        for (let k = -50; k <= 50; k++) if (inside(i + k)) { const j = W(i + k), m = Math.min(1, (50 - Math.abs(k)) / 30); if (m > mask[j]) mask[j] = m; }
      }
      if (!any) break;
      if (!closed) for (let i = 0; i < N; i++) if (i < 8 || i > N - 9) mask[i] = 0; // (the ends of a sprint stay where they are)
      for (let i = 0; i < N; i++) { xs[i] = samples[i].x; zs[i] = samples[i].z; }
      for (let i = 0; i < N; i++) {
        if (mask[i] <= 0) continue;
        let sx = 0, sz = 0, c = 0; for (let k = -12; k <= 12; k++) { const j = W(i + k), w = 13 - Math.abs(k); sx += xs[j] * w; sz += zs[j] * w; c += w; }
        samples[i].x = xs[i] + mask[i] * (sx / c - xs[i]); samples[i].z = zs[i] + mask[i] * (sz / c - zs[i]);
      }
      // Smoothing draws the samples of the bend together; the next step would then smooth over fewer metres and the bend would
      // hardly open any further. So the samples are spread evenly along the line again after every step (x, z, y, half width).
      {
        const M = closed ? N + 1 : N, cum = new Float64Array(M), px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M), pw = new Float64Array(M);
        for (let i = 0; i < M; i++) { const q = samples[i % N]; px[i] = q.x; pz[i] = q.z; py[i] = q.y; pw[i] = q.hw; if (i > 0) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]); }
        const total = cum[M - 1]; let seg = 0;
        for (let i = 0; i < N; i++) {
          const d = closed ? total * i / N : total * i / (N - 1);
          while (seg < M - 2 && cum[seg + 1] < d) seg++;
          const span = cum[seg + 1] - cum[seg], f = span > 1e-9 ? (d - cum[seg]) / span : 0, q = samples[i];
          q.x = px[seg] + (px[seg + 1] - px[seg]) * f; q.z = pz[seg] + (pz[seg + 1] - pz[seg]) * f; q.y = py[seg] + (py[seg + 1] - py[seg]) * f; q.hw = pw[seg] + (pw[seg + 1] - pw[seg]) * f;
        }
      }
    }
  }
  // re-space samples evenly after smoothing
  {
    const pts2: THREE.Vector3[] = []; const wArr: number[] = [];
    for (let i = 0; i < N; i += 3) { pts2.push(new THREE.Vector3(samples[i].x, samples[i].y, samples[i].z)); wArr.push(samples[i].hw); }
    if (!closed && (N - 1) % 3 !== 0) { pts2.push(new THREE.Vector3(samples[N - 1].x, samples[N - 1].y, samples[N - 1].z)); wArr.push(samples[N - 1].hw); }
    const c2 = new THREE.CatmullRomCurve3(pts2, closed, 'centripetal');
    const m = pts2.length; const L2 = c2.getLength(); length = L2;
    for (let i = 0; i < N; i++) {
      const u = closed ? i / N : i / (N - 1);
      const p = c2.getPointAt(u);
      const fi = u * (closed ? m : m - 1); const i0 = Math.min(m - 1, Math.floor(fi)) % m; const i1 = closed ? (i0 + 1) % m : Math.min(m - 1, i0 + 1); const f = fi - Math.floor(fi);
      samples[i].x = p.x; samples[i].y = p.y; samples[i].z = p.z; samples[i].hw = wArr[i0] + (wArr[i1] - wArr[i0]) * f; samples[i].s = i * (L2 / N);
    }
  }
  // smooth heights
  for (let pass = 0; pass < 3; pass++) {
    const ys = samples.map(s => s.y);
    for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let k = -6; k <= 6; k++) { let j = i + k; if (closed) j = (j + N) % N; else if (j < 0 || j >= N) continue; s += ys[j]; c++; }
      samples[i].y = s / c;
    }
  }
  // ---------- Grade-separated self-crossings (elevated viaduct bridge over lower underpass / tunnel) ----------
  const idxDist = (a: number, b: number) => { const d = Math.abs(a - b); return closed ? Math.min(d, N - d) : d; };
  const crossings: Crossing[] = [];
  {
    const cell = 52, grid = new Map<string, number[]>();
    for (let i = 0; i < N; i += 3) { const k = Math.floor(samples[i].x / cell) + ',' + Math.floor(samples[i].z / cell); let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(i); }
    const hits: { a: number; b: number; d: number }[] = [];
    for (let i = 0; i < N; i += 3) {
      const sa = samples[i], cx = Math.floor(sa.x / cell), cz = Math.floor(sa.z / cell);
      for (let gx = cx - 2; gx <= cx + 2; gx++) for (let gz = cz - 2; gz <= cz + 2; gz++) {
        const l = grid.get(gx + ',' + gz); if (!l) continue;
        for (const j of l) {
          if (j <= i || idxDist(i, j) < 160) continue;
          const sb = samples[j], d = Math.hypot(sa.x - sb.x, sa.z - sb.z);
          if (d < sa.hw + sb.hw + 16) hits.push({ a: i, b: j, d });
        }
      }
    }
    hits.sort((p, q) => p.d - q.d);
    const TUNNEL_UNDER_IDS = new Set(['boonta', 'dunepass', 'jungle', 'crystal', 'mosespa']);
    for (const h of hits) {
      if (crossings.some(c => (idxDist(c.upperIdx, h.a) < 150 && idxDist(c.lowerIdx, h.b) < 150) || (idxDist(c.upperIdx, h.b) < 150 && idxDist(c.lowerIdx, h.a) < 150))) continue;
      // Refine exact closest centerline sample pair around (h.a, h.b)
      let ia = h.a, ib = h.b, bd = h.d;
      for (let da = -4; da <= 4; da++) for (let db = -4; db <= 4; db++) {
        const p = closed ? ((h.a + da) % N + N) % N : Math.max(0, Math.min(N - 1, h.a + da));
        const q = closed ? ((h.b + db) % N + N) % N : Math.max(0, Math.min(N - 1, h.b + db));
        const d = Math.hypot(samples[p].x - samples[q].x, samples[p].z - samples[q].z);
        if (d < bd) { bd = d; ia = p; ib = q; }
      }
      const upper = samples[ia].y >= samples[ib].y ? ia : ib, lower = upper === ia ? ib : ia;
      // Measure overlap span along upper and lower paths
      const spanOf = (center: number, other: number, margin: number, extra: number): [number, number] => {
        let lo = 0, hi = 0;
        for (let k = -90; k <= 90; k++) {
          const p = closed ? ((center + k) % N + N) % N : Math.max(0, Math.min(N - 1, center + k));
          const sp = samples[p]; let near = false;
          for (let m = -80; m <= 80; m += 3) {
            const q = closed ? ((other + m) % N + N) % N : Math.max(0, Math.min(N - 1, other + m));
            if (Math.hypot(sp.x - samples[q].x, sp.z - samples[q].z) < sp.hw + samples[q].hw + margin) { near = true; break; }
          }
          if (near) { lo = Math.min(lo, k); hi = Math.max(hi, k); }
        }
        return [center + lo - extra, center + hi + extra];
      };
      const [uFrom, uTo] = spanOf(upper, lower, 20, 22);
      const [lFrom, lTo] = spanOf(lower, upper, 14, 14);
      for (let k = uFrom; k <= uTo; k++) { if (!closed && (k < 0 || k >= N)) continue; samples[((k % N) + N) % N].bridge = true; }
      for (let k = lFrom; k <= lTo; k++) { if (!closed && (k < 0 || k >= N)) continue; samples[((k % N) + N) % N].underpass = true; }
      const tunnelUnder = def.theme !== 'oovo' && def.theme !== 'aquilaris' && (TUNNEL_UNDER_IDS.has(def.id) || crossings.length % 2 === 1);
      crossings.push({
        upperIdx: upper, lowerIdx: lower, upperFrom: uFrom, upperTo: uTo, lowerFrom: lFrom, lowerTo: lTo,
        x: (samples[upper].x + samples[lower].x) * 0.5, z: (samples[upper].z + samples[lower].z) * 0.5,
        clearance: 0, tunnelUnder,
      });
    }
  }

  // zero-gravity zones: the first two canyon ranges on the prison moon (kept clear of crossings)
  if (def.theme === 'oovo') for (const [a, b] of def.canyons.slice(0, 2)) for (let i = Math.floor(a * N); i < Math.floor(b * N); i++) { const q = samples[(i + N) % N]; if (!q.bridge && !q.underpass) q.zeroG = true; }
  // canyon flags (bridges stay open elevated viaducts with panoramic views over the track below)
  const hwMed = samples.map(q => q.hw).sort((a, b) => a - b)[N >> 1], wideLim = Math.min(hwMed * 1.45, 45);
  for (const [a, b] of def.canyons) for (let i = Math.floor(a * N); i < Math.floor(b * N); i++) { const q = samples[(i + N) % N]; if (q.hw < wideLim && !q.bridge) q.canyon = true; }
  // cliff mode per canyon range: 0 both walls, 1 left wall only, 2 right wall only (half-canyon with a view), 3 none (zero-G tube)
  const rngC = mulberry32(hashStr(def.id + '|cliff'));
  const canyonModes = def.canyons.map(([a, b], ci) => ({ a: Math.floor(a * N), b: Math.floor(b * N), mode: def.theme === 'oovo' && ci < 2 ? 3 : (() => { const r = rngC(); return r < 0.4 ? 0 : r < 0.7 ? 1 : 2; })() }));
  // ramps & gaps (automatically steer clear of crossings)
  const taken: number[] = []; const rampSpans: [number, number][] = [];
  for (const r of def.ramps) {
    const i0 = findStraight(samples, N, r.at, closed, taken, Math.round((r.len + r.gap + 80) / DS)); taken.push(i0);
    const nr = Math.round(r.len / DS), ng = Math.round(r.gap / DS);
    for (let k = 0; k < nr; k++) { const t = (k + 1) / nr; samples[(i0 + k) % N].ramp = r.h * Math.pow(t, 1.7); }
    for (let k = 0; k < ng; k++) { const sm = samples[(i0 + nr + k) % N]; sm.gap = true; }
    rampSpans.push([i0, nr + ng]);
  }
  // ---- Session 20: the wide open flats become surface showpieces – dunes, plateaus, lakes (see surfaces.ts) ----
  const TS = THEME_SURFACES[def.theme], START_I = closed ? 30 : 45, FINISH_I = closed ? START_I : N - 40;
  const nearGrid = (i: number, m: number) => idxDist(i, START_I) < m || (!closed && (i > FINISH_I - m || i < START_I + m));
  const openRuns: { a: number; b: number; surf: number }[] = [];
  let seaY0: number | undefined; // Aquilaris sea level
  const LAKE_EASE = def.theme === 'aquilaris' ? 150 : 62; // samples over which the profile eases to the basin level (Aquilaris descends ~24 m to the sea)
  if (TS && !(globalThis as { NO_SURFACES?: boolean }).NO_SURFACES) {
    const W = (i: number) => samples[closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i))];
    // a sample is usable when it is wide and nothing built is within `m` samples
    const clean = (i: number, m: number) => {
      if (samples[i].hw <= wideLim || nearGrid(i, 130)) return false;
      for (let k = -m; k <= m; k += 5) { const q = W(i + k); if (q.ramp > 0 || q.gap || q.bridge || q.underpass || q.zeroG) return false; }
      return true;
    };
    const runsFor = (m: number) => { const out: [number, number][] = []; let a = -1; for (let i = 0; i <= N; i++) { const ok = i < N && clean(i, m); if (ok && a < 0) a = i; if (!ok && a >= 0) { if (i - a >= 150) out.push([a, i - 1]); a = -1; } } return out.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0])); };
    const taken: [number, number][] = [];
    TS.open.forEach((id, oi) => {
      const sf = SURFACES[SURF[id]], cand = runsFor(sf.flat ? 75 : 30).filter(([a, b]) => taken.every(([ta, tb]) => b < ta - 40 || a > tb + 40));
      const r = cand[0]; if (!r) return;
      // (Aquilaris: the long descent to sea level happens inside the wide run)
      const inset = sf.flat ? (def.theme === 'aquilaris' ? LAKE_EASE - 60 : 6) : 0, a = r[0] + inset, b = r[1] - inset; if (b - a < 120) return; taken.push([a, b]);
      openRuns.push({ a, b, surf: SURF[id] });
      for (let i = a; i <= b; i++) samples[i].surf = SURF[id];
      if (sf.flat) {
        const E = LAKE_EASE, seed = hashStr(def.id + '|lake' + oi) % 1000;
        for (let k = a - E; k <= b + E; k++) {
          if (!closed && (k < 0 || k >= N)) continue;
          const q = W(k), t = k < a ? (k - (a - E)) / E : k > b ? ((b + E) - k) / E : 1;
          q.lvl = Math.max(q.lvl ?? 0, t * t * (3 - 2 * t));
        }
        for (let i = a; i <= b; i++) {
          const q = samples[i], e = Math.min(1, Math.min(i - a, b - i) / 48), tp = e * e * (3 - 2 * e); // shoreline closes in towards both ends
          q.lake = true;
          q.lakeL = tp * (46 + 62 * fbm1(q.s * 0.0034 + seed)); q.lakeR = tp * (46 + 62 * fbm1(q.s * 0.0034 + seed + 57.3));
        }
      }
    });
  }
  // Session 10: rolling gradients on every map – faded out at grid, finish, ramps/gaps, zero-G tubes & all bridge/underpass crossings
  {
    const rh = mulberry32(hashStr(def.id + '|hills'));
    const flat = new Float32Array(N).fill(1);
    const damp = (c: number, half: number, fade: number) => {
      for (let k = -half - fade; k <= half + fade; k++) {
        let j = c + k; if (closed) j = ((j % N) + N) % N; else if (j < 0 || j >= N) continue;
        const m = Math.abs(k) <= half ? 0 : (Math.abs(k) - half) / fade; flat[j] = Math.min(flat[j], m * m * (3 - 2 * m));
      }
    };
    damp(closed ? 30 : 45, 60, 110);
    if (!closed) damp(N - 30, 50, 110);
    for (const [i0, len] of rampSpans) damp(i0 + Math.round(len / 2), Math.round(len / 2) + 50, 100);
    for (const c of crossings) {
      damp(Math.round((c.upperFrom + c.upperTo) / 2), Math.round((c.upperTo - c.upperFrom) / 2) + 25, 115);
      damp(Math.round((c.lowerFrom + c.lowerTo) / 2), Math.round((c.lowerTo - c.lowerFrom) / 2) + 25, 115);
    }
    for (let i = 0; i < N; i++) if (samples[i].zeroG && (i === 0 || !samples[i - 1].zeroG || i % 40 === 0)) damp(i, 40, 100);
    const TAU = Math.PI * 2, k1 = 2 + Math.floor(rh() * 2), k2 = 5 + Math.floor(rh() * 3), p1 = rh() * TAU, p2 = rh() * TAU;
    for (let i = 0; i < N; i++) { const u = i / N * TAU; samples[i].y = samples[i].y * 1.2 + (19 * Math.sin(u * (k1 + 1) + p1) + 8 * Math.sin(u * (k2 + 2) + p2)) * flat[i]; }
    // Guarantee generous ≥ 32 m vertical clearance at every self-crossing (fits a full 20–21.5 m underpass tunnel + 2.8 m bridge box girder + ≥ 7 m buffer!)
    const bumpSpan = (a: number, b: number, dy: number, ease: number) => {
      for (let k = a - ease; k <= b + ease; k++) {
        if (!closed && (k < 45 || k >= N - 40)) continue;
        const j = closed ? ((k % N) + N) % N : k;
        const t = k < a ? (k - (a - ease)) / ease : k > b ? ((b + ease) - k) / ease : 1;
        samples[j].y += dy * (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
      }
    };
    for (const c of crossings) {
      let minU = 1e9, maxL = -1e9;
      for (let k = c.upperFrom; k <= c.upperTo; k++) if (closed || (k >= 0 && k < N)) minU = Math.min(minU, samples[((k % N) + N) % N].y);
      for (let k = c.lowerFrom; k <= c.lowerTo; k++) if (closed || (k >= 0 && k < N)) maxL = Math.max(maxL, samples[((k % N) + N) % N].y);
      const wantSep = c.tunnelUnder ? UNDER_ROOF + 11 : 30.0, cur = minU - maxL; // underpass roof + 1.2 m hood + 2.8 m box girder + 7 m buffer
      if (cur < wantSep) {
        const need = wantSep - cur;
        bumpSpan(c.upperFrom, c.upperTo, need * 0.56, 135);
        bumpSpan(c.lowerFrom, c.lowerTo, -need * 0.44, 135);
      }
      c.clearance = samples[((c.upperIdx % N) + N) % N].y - samples[((c.lowerIdx % N) + N) % N].y;
    }
    // Session 20 (part of the hill logic): dune waves on dune / powder passages, level basins for lakes and plateaus
    if (def.theme === 'aquilaris') seaY0 = samples.reduce((a, q) => a + q.y, 0) / N - 24;
    for (const r of openRuns) {
      const sf = SURFACES[r.surf];
      if (sf.dune) for (let i = r.a; i <= r.b; i++) {
        const q = samples[i], env = Math.min(1, Math.min(i - r.a, r.b - i) / 45), p = q.s / 165 + 0.35 * Math.sin(q.s / 410), f = p - Math.floor(p);
        // asymmetric dune: long windward rise, shorter lee side, both cosine-smooth (pods get light over the crests, never launched)
        q.y += sf.dune * env * env * (3 - 2 * env) * (f < 0.66 ? 0.5 - 0.5 * Math.cos(Math.PI * f / 0.66) : 0.5 + 0.5 * Math.cos(Math.PI * (f - 0.66) / 0.34));
      }
      if (sf.flat) {
        let sum = 0; for (let i = r.a; i <= r.b; i++) sum += samples[i].y;
        // Aquilaris: the track comes down to the ocean – the pod skims the open sea (level fixed before the dip so it stays consistent)
        const yL = seaY0 !== undefined ? seaY0 + 0.4 : sum / (r.b - r.a + 1);
        for (let k = r.a - LAKE_EASE - 8; k <= r.b + LAKE_EASE + 8; k++) {
          if (!closed && (k < 0 || k >= N)) continue;
          const q = samples[closed ? ((k % N) + N) % N : k], w = q.lvl ?? 0;
          q.y += (yL - q.y) * w; if (q.lake) q.lakeY = yL;
        }
      }
    }
  }
  finalizeSamples(samples, closed, true);
  // basins: on the inside of a corner the sheet may only reach as far as the cross sections do not fold over each other
  // Exception: where the road band itself is wider than the corner radius (a kink in a wide flat, e.g. the Mos Espa plateau) the
  // sheet folds whatever the shore does. There the sheets before and after the kink must OVERLAP at the apex, otherwise a
  // diamond-shaped notch (a pit in the plateau / a hole in the lake) opens between the two crossing road edges → keep 34 m of shore.
  // (The basin mesh is double-wound and level, so folded and overlapping parts render as one surface – world.ts → buildBasins.)
  for (const r of openRuns) if (SURFACES[r.surf].flat) {
    const lims: number[] = [];
    for (let i = r.a; i <= r.b; i++) {
      let lim = 1e9; for (let k = -14; k <= 14; k += 2) { const q = samples[Math.max(0, Math.min(N - 1, i + k))]; lim = Math.min(lim, 1 / Math.max(1e-5, Math.abs(q.curv)) - q.hw); }
      // (2026-11-23: also where the radius is only a little larger than the half width – since the folds are rounded that is the
      //  tightest bend a wide flat can have, half width = 0.85 × radius. With `lim − 12` the sheet ended AT the inner road edge there
      //  and left a rock-lined pit of 10 m between the beacons and the centre of the bend. A plateau closes every gap of less than
      //  30 m – a pit in the rock beside the road is never wanted; a lake keeps its bank inside the bend from 12 m on.)
      lims.push(lim < (SURFACES[r.surf].id === 'plateau' ? 30 : 12) ? 34 : lim - 12);
    }
    for (let i = r.a; i <= r.b; i++) {
      let sum = 0, n = 0; for (let k = -6; k <= 6; k++) { const v = lims[i - r.a + k]; if (v !== undefined) { sum += v; n++; } }
      const q = samples[i], lim = sum / n; // short box filter: no step in the shoreline where the exception starts
      if (q.curv > 0) q.lakeR = Math.min(q.lakeR ?? 0, lim); else q.lakeL = Math.min(q.lakeL ?? 0, lim);
    }
  }
  const main: Path = { id: 0, samples, closed, length, mainFrom: 0, mainTo: N - 1, side: 0 };
  const paths: Path[] = [main];

  // Helper: smoothly stitch a branch path's ends onto the banked main-road surface and open shared walls with zero cliff/skirt protrusion
  const stitchBranch = (ss: Sample[], L2: number, ia: number, ib: number, side: number, pid: number, isCave = false) => {
    const nearMain: Sample[] = [];
    for (let k = ia - 65; k <= ib + 65; k++) {
      if (!closed && (k < 0 || k >= N)) continue;
      if (k > 52 && k < (ib - ia) - 52) continue;
      nearMain.push(samples[((k % N) + N) % N]);
    }
    const closestMain = (x: number, z: number) => {
      let bq = nearMain[0], bd = 1e12;
      for (const q of nearMain) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; bq = q; } }
      return { q: bq, d: Math.sqrt(bd) };
    };
    // Exact banked elevation match at both entrance and exit (eliminates road-deck / skirt steps at shortcut exits like Dschungelfluss-Sprint!)
    const blendLen = Math.min(84, L2 * 0.24);
    for (const s of ss) {
      const dEnd = Math.min(s.s, L2 - s.s);
      if (dEnd >= blendLen) continue;
      const { q } = closestMain(s.x, s.z);
      const latM = Math.max(-q.hw, Math.min(q.hw, (s.x - q.x) * q.rx + (s.z - q.z) * q.rz));
      const mainY = q.y + q.ramp - latM * q.bank;
      const u = Math.max(0, Math.min(1, 1 - dEnd / blendLen)), w = u * u * (3 - 2 * u);
      s.y = s.y + (mainY - s.y) * w;
      s.bank = s.bank * (1 - w * 0.85) + q.bank * (w * 0.85);
    }
    // Open main road edge where branch meets it
    const nearestSc = (x: number, z: number) => { let bd = 1e9; for (const q of ss) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };
    for (let k = -34; k <= (ib - ia) + 34; k++) {
      if (!closed && (ia + k < 0 || ia + k >= N)) continue;
      if (k > 46 && k < (ib - ia) - 46) continue;
      const s = samples[(((ia + k) % N) + N) % N];
      const ex = s.x + s.rx * side * s.hw, ez = s.z + s.rz * side * s.hw;
      if (nearestSc(ex, ez) < ss[0].hw + 6) { if (side > 0) s.openR = true; else s.openL = true; s.link = pid; if (!isCave) s.canyon = false; }
    }
    // Open branch inner edge (and outer edge where overlapping wide open-flat main road!) using EACH main sample's true half-width q.hw!
    for (const s of ss) {
      if (s.s > 140 && s.s < L2 - 140) continue;
      const inX = s.x - s.rx * side * s.hw, inZ = s.z - s.rz * side * s.hw;
      const cm = closestMain(inX, inZ);
      if (cm.d < cm.q.hw + 7) { if (side > 0) s.openL = true; else s.openR = true; s.link = 0; }
      // Also clear the outer edge right inside the merge mouth so its outer wall/rail never intrudes into the main track!
      const outX = s.x + s.rx * side * s.hw, outZ = s.z + s.rz * side * s.hw;
      const co = closestMain(outX, outZ);
      if (co.d < co.q.hw - 0.5) { if (side > 0) s.openR = true; else s.openL = true; }
    }
  };

  // shortcuts
  const cpFrac = (ci: number) => { const p = pts[cpMap[ci] ?? ci]; let bi = 0, bd = 1e12; samples.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi / N; };
  for (const ci of def.shortcuts) {
    const found = findShortcut(samples, N, cpFrac(ci), closed);
    if (!found) continue;
    const [ia, ib] = found;
    const A = samples[ia % N], B = samples[ib % N];
    const side = ((B.x - A.x) * A.rx + (B.z - A.z) * A.rz) > 0 ? 1 : -1;
    const scHw = SC_HW;
    const P = (i: number, extra: number) => {
      const s = samples[((i % N) + N) % N]; const off = side * (s.hw - scHw * 0.9 + extra);
      const clOff = Math.max(-s.hw, Math.min(s.hw, off));
      return new THREE.Vector3(s.x + s.rx * off, s.y - clOff * s.bank + 0.05, s.z + s.rz * off);
    };
    const cps: THREE.Vector3[] = [P(ia - 12, 0), P(ia, 0), P(ia + 16, 20)];
    const s0 = P(ia + 16, 20), s1 = P(ib - 16, 20);
    const mids = 4;
    for (let m = 1; m < mids; m++) {
      const t = m / mids; const v = s0.clone().lerp(s1, t);
      const dx = s1.x - s0.x, dz = s1.z - s0.z, l = Math.hypot(dx, dz) || 1;
      const wig = Math.sin(t * Math.PI * 2) * 12;
      v.x += (-dz / l) * wig; v.z += (dx / l) * wig; v.y += Math.sin(t * Math.PI) * 5;
      cps.push(v);
    }
    cps.push(s1, P(ib, 0), P(ib + 12, 0));
    const c2 = new THREE.CatmullRomCurve3(cps, false, 'centripetal');
    const L2 = c2.getLength(); const n2 = Math.round(L2 / DS);
    const ss: Sample[] = [];
    for (let i = 0; i < n2; i++) { const p = c2.getPointAt(i / (n2 - 1)); const s = makeSample(p, scHw, i * DS); s.canyon = true; ss.push(s); }
    finalizeSamples(ss, false);
    const pid = paths.length;
    const path: Path = { id: pid, samples: ss, closed: false, length: L2, mainFrom: ia - 12, mainTo: ib + 12, side };
    paths.push(path);
    stitchBranch(ss, L2, ia, ib, side, pid, false);
  }

  // cliff heights per side (tapered over 50 m at gorge entrances and smoothly down to 0 near every shortcut mouth)
  const cliffH = (s: Sample, side: number) => 14 + fbm1(s.s * 0.004 + side * 10) * 36;
  for (const cm of canyonModes) {
    const len = cm.b - cm.a; if (cm.mode === 3) continue;
    for (let k = 0; k < len; k++) {
      const s = samples[((cm.a + k) % N + N) % N]; if (!s.canyon || s.zeroG || s.bridge) continue;
      const tp0 = Math.max(0, Math.min(1, k / 25, (len - 1 - k) / 25)); const tp = tp0 * tp0 * (3 - 2 * tp0);
      if (cm.mode !== 2 && !s.openL) s.hL = 3 + (cliffH(s, -1) - 3) * tp;
      if (cm.mode !== 1 && !s.openR) s.hR = 3 + (cliffH(s, 1) - 3) * tp;
    }
  }
  const applyShortcutWalls = (pa: Path, roofH: number, tunKind: number) => {
    const ss = pa.samples, n2 = ss.length;
    // Distance to nearest open sample per side so cliff walls taper gracefully to 0 instead of ending as a vertical slab in the road!
    const distOpen = (i: number, right: boolean) => {
      for (let d = 0; d <= 18; d++) {
        for (const sg of [-1, 1]) {
          const j = i + sg * d;
          if (j < 0 || j >= n2) return d;
          if (right ? ss[j].openR : ss[j].openL) return d;
        }
      }
      return 19;
    };
    for (let i = 0; i < n2; i++) {
      const s = ss[i];
      const dL = distOpen(i, false), dR = distOpen(i, true);
      if (dL > 2) { const t = Math.min(1, (dL - 2) / 16); s.hL = cliffH(s, -1) * 0.8 * (t * t * (3 - 2 * t)); } else s.hL = 0;
      if (dR > 2) { const t = Math.min(1, (dR - 2) / 16); s.hR = cliffH(s, 1) * 0.8 * (t * t * (3 - 2 * t)); } else s.hR = 0;
      if (pa.isCave) {
        // Cave branch (Session 20): roofed over its FULL length – its tube starts and ends inside the main cavern, the world builder
        // merges both shells (boolean union), so no daylight shows at the fork. Mid-way the ROAD itself widens into a side chamber
        // (the old `caveW` shelf was scenery behind an invisible wall). The cave rock is the barrier: no cliffs, no guard rails.
        const u = i / Math.max(1, n2 - 1), sn = Math.sin(Math.PI * u);
        s.roof = roofH + 9.5 * sn * sn; s.tun = 3; s.hw += 5 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.2) / 0.6))), 2);
        s.hL = dL > 2 ? 2 : 0; s.hR = dR > 2 ? 2 : 0;
      } else if (i >= Math.floor(n2 * 0.26) && i <= Math.floor(n2 * 0.74) && dL > 10 && dR > 10) {
        s.roof = roofH; s.tun = tunKind;
      }
    }
  };
  for (let pi = 1; pi < paths.length; pi++) applyShortcutWalls(paths[pi], SC_ROOF, 1);

  const obstacles: Obstacle[] = [];
  const startIdx = START_I, finishIdx = FINISH_I;
  const okSpot = (s: Sample, i: number) => !s.gap && s.ramp === 0 && !s.openL && !s.openR && !samples[(i + 22) % N].gap && samples[(i + 18) % N].ramp === 0;

  // ---------- Tunnels, Underwater Tubes, Underpass Tunnels & Branching Cave Systems ----------
  // Generous ceiling heights across all worlds (especially Ando Prime 22–38 m & Aquilaris 19.5 m) so lifts, jumps & 90° rolls feel roomy!
  let seaY: number | undefined; const cavePillars: [number, number][] = [];
  if (!(globalThis as { NO_TUNNELS?: boolean }).NO_TUNNELS) {
    const rt = mulberry32(hashStr(def.id + '|tunnels'));
    const W = (i: number) => samples[((i % N) + N) % N];
    const clearRun = (i: number, len: number, pad: number) => {
      if (!closed && (i - pad < 0 || i + len + pad >= N)) return false;
      for (let k = -pad; k <= len + pad; k += 2) { const q = W(i + k); if (q.gap || q.ramp > 0 || q.zeroG || q.bridge || q.underpass || q.openL || q.openR || q.link >= 0 || q.roof > 0 || q.hw > wideLim) return false; }
      return true;
    };
    const awayFromGrid = (i: number, len: number) => idxDist(i + len / 2, startIdx) > 110 + len / 2 && (closed || idxDist(i + len / 2, finishIdx) > 90 + len / 2);
    const rampBefore = (i: number, back: number) => { for (let k = 0; k <= back; k += 3) { const j = i - k; if (!closed && j < 0) break; const q = W(j); if (q.ramp > 0 || q.gap) return true; } return false; };
    const tunTaken: { i: number; len: number }[] = [];
    const clash = (i: number, len: number, gap = 140) => tunTaken.some(t => idxDist(t.i + t.len / 2, i + len / 2) < gap + (t.len + len) / 2);
    const dip = (i: number, len: number, depth: number, ease: number) => { for (let k = 0; k <= len; k++) { const t = Math.min(k, len - k) / ease; W(i + k).y -= depth * (t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * t)); } };
    const roofRun = (i: number, len: number, h: number, kind: number) => { for (let k = 0; k <= len; k++) { const q = W(i + k); q.roof = h; q.tun = kind; } };

    // (0) Underpass tunnels where the track dives directly beneath its own elevated viaduct bridge
    const underRoof = UNDER_ROOF;
    for (const c of crossings) {
      const len = c.lowerTo - c.lowerFrom;
      tunTaken.push({ i: c.lowerFrom, len });
      tunTaken.push({ i: c.upperFrom, len: c.upperTo - c.upperFrom });
      if (c.tunnelUnder) {
        const ta = c.lowerFrom - 6, tb = c.lowerTo + 6;
        for (let k = ta; k <= tb; k++) {
          if (!closed && (k < 0 || k >= N)) continue;
          const q = W(k); if (q.gap || q.ramp > 0 || q.openL || q.openR) continue;
          q.roof = underRoof; q.tun = 4;
        }
      }
    }

    // (1) Aquilaris high-vaulted panoramic underwater ocean tubes (roof = 19.5 m, was 9 m!)
    if (def.theme === 'aquilaris') {
      seaY = seaY0 ?? samples.reduce((a, q) => a + q.y, 0) / N - 24;
      const target = seaY - (SEA_ROOF + 3.2);
      const cands: { i: number; len: number; depth: number; ease: number; flat: number }[] = [];
      for (const FLAT of [155, 105]) for (let f0 = 90; f0 < N - FLAT - 220; f0 += 8) {
        let top = -1e9; for (let k = 0; k <= FLAT; k += 2) top = Math.max(top, W(f0 + k).y);
        const depth = top - target; if (depth < 8 || depth > 54) continue;
        const ease = Math.ceil(7.6 * depth / DS), i0 = f0 - ease, len = FLAT + 2 * ease;
        if (!clearRun(i0, len, 12) || !awayFromGrid(i0, len) || rampBefore(i0, 260)) continue;
        if (W(i0 + 4).y < seaY + 2.0 || W(i0 + len - 4).y < seaY + 2.0) continue;
        cands.push({ i: i0, len, depth, ease, flat: FLAT });
      }
      cands.sort((a, b) => (a.depth - (a.flat > 130 ? 8 : 0)) - (b.depth - (b.flat > 130 ? 8 : 0)));
      let seaPlaced = 0;
      for (const c of cands) {
        if (seaPlaced >= 2) break; if (clash(c.i, c.len, 110)) continue;
        tunTaken.push(c); seaPlaced++;
        dip(c.i, c.len, c.depth, c.ease);
        roofRun(c.i + 3, c.len - 6, SEA_ROOF, 2);
        for (let k = 0; k <= c.len; k++) { const q = W(c.i + k); q.hL = 0; q.hR = 0; q.canyon = false; q.wallL = q.wallR = q.hw - RAIL_INSET; }
      }
    }

    // (2) Multi-chamber BRANCHING cave systems (Vulkan 5 chambers, Ando Prime 3, Kristall 3, Dschungel 3):
    //     High vaulted ceilings (20.5–22 m → 29–37 m), widened chambers with cave-floor shelves (`caveW`), AND a real diverging
    //     secondary cave tube (`Path.isCave`) that splits off in the cave and reunites further downstream!
    const CAVES: Record<string, [number, number, number]> = { lava: [520, 12, 5], ice: [300, 9, 3], crystal: [310, 10, 3], jungle: [290, 9, 3] };
    const cv = CAVES[def.theme];
    const caveBaseRoof = CAVE_ROOF;
    if (cv) {
      for (const shrink of [1, 0.8, 0.62]) {
        const LEN = Math.round(cv[0] * shrink), CH = Math.max(2, Math.round(cv[2] * shrink)), DEPTH = cv[1], EASE = 58;
        let best = -1, bs = -1e9;
        for (const back of [240, 140]) {
          for (let i = 55; i < N - LEN - 55; i += 8) {
            if (!clearRun(i, LEN, 12) || !awayFromGrid(i, LEN) || rampBefore(i, back) || clash(i, LEN, 100)) continue;
            let walls = 0, curv = 0; for (let k = 0; k <= LEN; k += 6) { const q = W(i + k); if (q.hL > 0 || q.hR > 0) walls++; curv += Math.abs(q.curv); }
            const sc = walls * 0.5 - curv * 40 + rt() * 4; if (sc > bs) { bs = sc; best = i; }
          }
          if (best >= 0) break;
        }
        if (best < 0) continue;
        dip(best, LEN, DEPTH, EASE);
        const gap = 18, part = (LEN - 48 - gap * (CH - 1)) / CH;
        const chSpans: [number, number][] = [];
        // Session 20: ONE continuous cave. The chambers used to be separate 150 m tunnels with 36 m of open sky in between (and canyon
        // cliffs standing inside them). Now low necks (base roof) connect the chambers, and the cave rock replaces cliffs and rails.
        for (let k = 24; k <= LEN - 24; k++) { const q = W(best + k); q.roof = caveBaseRoof; q.tun = 3; q.hL = 2; q.hR = 2; }
        for (let c = 0; c < CH; c++) {
          const a = 24 + Math.round(c * (part + gap)), b = a + Math.round(part), hi = 8.5 + rt() * 7.5, wi = 6.5 + rt() * 5.5;
          chSpans.push([best + a, best + b]);
          for (let k = a; k <= b; k++) {
            const q = W(best + k), t = (k - a) / (b - a), sn = Math.sin(Math.PI * t), s2 = sn * sn;
            q.roof = caveBaseRoof + hi * s2; q.tun = 3; q.hw += wi * s2; // the ROAD widens with the chamber (drivable width = visible width)
          }
          cavePillars.push([best + Math.round((a + b) / 2 + (rt() - 0.5) * part * 0.28), (c % 2 ? 1 : -1) * (0.28 + rt() * 0.18)]);
        }
        // Build diverging & reuniting subterranean cave branch tubes between chambers (5-chamber Magma gets 2 splits: 0→2 and 3→4!)
        const tryCaveBranch = (c0: number, c1: number) => {
          if (c0 < 0 || c1 >= chSpans.length || c1 <= c0) return false;
          const brA = chSpans[c0][0] + Math.round((chSpans[c0][1] - chSpans[c0][0]) * 0.42);
          const brB = chSpans[c1][0] + Math.round((chSpans[c1][1] - chSpans[c1][0]) * 0.58);
          if (brB - brA < 82) return false;
          const brHw = 13.5, sA = W(brA), sB = W(brB);
          const prefSide = ((sB.x - sA.x) * sA.rx + (sB.z - sA.z) * sA.rz) >= 0 ? 1 : -1;
          for (const side of [prefSide, -prefSide]) {
            for (const bow of [40, 28, 20]) {
              const mkP = (idx: number, extra: number) => {
                const s = W(idx), off = side * (s.hw - brHw * 0.85 + extra);
                const cl = Math.max(-s.hw, Math.min(s.hw, off));
                return new THREE.Vector3(s.x + s.rx * off, s.y - cl * s.bank, s.z + s.rz * off);
              };
              const m1 = Math.round(brA + (brB - brA) * 0.34), m2 = Math.round(brA + (brB - brA) * 0.66);
              const bcps = [mkP(brA - 10, 0), mkP(brA + 2, 2), mkP(brA + 16, bow * 0.65), mkP(m1, bow), mkP(m2, bow * 0.94), mkP(brB - 16, bow * 0.65), mkP(brB - 2, 2), mkP(brB + 10, 0)];
              const bc = new THREE.CatmullRomCurve3(bcps, false, 'centripetal');
              const BL = bc.getLength(); if (BL < 130) continue;
              let bad = false;
              for (let t = 0.17; t <= 0.83 && !bad; t += 0.06) {
                const pt = bc.getPointAt(t);
                for (let j = 0; j < N; j += 4) {
                  if (idxDist(j, brA) < 32 || idxDist(j, brB) < 32) continue;
                  const q = samples[j], inSpan = j > brA && j < brB;
                  const minSep = inSpan ? q.hw + brHw + 4 : q.hw + brHw + 16;
                  if (Math.hypot(q.x - pt.x, q.z - pt.z) < minSep) { bad = true; break; }
                }
                for (let pi = 1; pi < paths.length && !bad; pi++) for (let j = 0; j < paths[pi].samples.length; j += 4) {
                  const q = paths[pi].samples[j]; if (Math.hypot(q.x - pt.x, q.z - pt.z) < q.hw + brHw + 12) { bad = true; break; }
                }
              }
              if (bad) continue;
              const bn = Math.round(BL / DS), bss: Sample[] = [];
              for (let k = 0; k < bn; k++) { const pt = bc.getPointAt(k / (bn - 1)); const sm = makeSample(pt, brHw, k * DS); sm.canyon = true; bss.push(sm); }
              finalizeSamples(bss, false);
              const pid = paths.length;
              const bPath: Path = { id: pid, samples: bss, closed: false, length: BL, mainFrom: brA - 10, mainTo: brB + 10, side, isCave: true };
              paths.push(bPath);
              stitchBranch(bss, BL, brA, brB, side, pid, true);
              applyShortcutWalls(bPath, caveBaseRoof, 3);
              return true;
            }
          }
          return false;
        };
        if (chSpans.length >= 5) {
          if (!tryCaveBranch(0, 2)) tryCaveBranch(0, 1);
          if (!tryCaveBranch(3, 4)) tryCaveBranch(2, 4);
        } else if (chSpans.length >= 2) {
          if (!tryCaveBranch(0, chSpans.length - 1) && !tryCaveBranch(0, 1)) tryCaveBranch(1, chSpans.length - 1);
        }
        tunTaken.push({ i: best, len: LEN });
        break;
      }
    }

    // (3) High-clearance standard tunnels with drivable top deck (22.5 m on Ando Prime, 19.5 m on all other worlds; was 13 m!)
    const stdRoof = STD_ROOF;
    const want = def.theme === 'aquilaris' ? 0 : ({ oovo: 3, ice: 3, malastare: 4 } as Record<string, number>)[def.theme] ?? 2;
    const cands: { i: number; len: number; score: number }[] = [];
    for (let i = 40; i < N - 440; i += 12) {
      const len = 130 + Math.floor(rt() * 145);
      if (!clearRun(i, len, 14) || !awayFromGrid(i, len)) continue;
      let walls = 0; for (let k = 0; k <= len; k += 2) { const q = W(i + k); if (q.hL > 0 && q.hR > 0) walls++; }
      cands.push({ i, len, score: walls / (len / 2) + rt() * 0.6 });
    }
    cands.sort((a, b) => b.score - a.score);
    let placed = 0;
    for (const c of cands) { if (placed >= want) break; if (clash(c.i, c.len, 130)) continue; tunTaken.push(c); roofRun(c.i, c.len, stdRoof, 1); placed++; }
  }

  // ---- Session 20: surface of every remaining passage (built deck / cave floor / alternating natural ground) ----
  if (TS && !(globalThis as { NO_SURFACES?: boolean }).NO_SURFACES) {
    const gen = TS.general.map(id => SURF[id]), caveSurf = SURF[TS.cave ?? TS.general[0]];
    const built = new Uint8Array(N);
    const mark = (i: number, back: number, fwd: number) => { for (let k = -back; k <= fwd; k++) { const j = closed ? ((i + k) % N + N) % N : i + k; if (j >= 0 && j < N) built[j] = 1; } };
    for (let i = 0; i < N; i++) {
      const q = samples[i];
      if (nearGrid(i, 95)) built[i] = 1;
      if (q.bridge || q.zeroG || (q.roof > 0 && q.tun !== 3)) mark(i, 10, 10);
      if (q.ramp > 0 || q.gap) mark(i, 26, 34);
    }
    let cyc = hashStr(def.id + '|surf') % gen.length, a = -1;
    for (let i = 0; i <= N; i++) {
      const q = i < N ? samples[i] : null, cave = !!q && q.roof > 0 && q.tun === 3;
      if (q && cave && !(q.surf > 0)) q.surf = caveSurf;
      const free = !!q && !built[i] && !cave && !(q.surf > 0);
      if (free && a < 0) a = i;
      if (!free && a >= 0) {
        const L = i - a;
        if (L >= 50) { const n = Math.max(1, Math.round(L / 250)); for (let k = a; k < i; k++) samples[k].surf = gen[(cyc + Math.min(n - 1, Math.floor((k - a) / (L / n)))) % gen.length]; cyc += n; }
        a = -1;
      }
    }
    // branch paths: cave tubes carry the cave floor, shortcuts the solid surface of the road they leave
    for (let pi = 1; pi < paths.length; pi++) {
      const pa = paths[pi], m = samples[((pa.mainFrom % N) + N) % N].surf, sf = pa.isCave ? caveSurf : SURFACES[m].flat ? gen.find(g => g > 0) ?? 0 : m;
      for (const q of pa.samples) q.surf = sf;
    }
    // rivals brake earlier where the grip is low (ice) – the reference speeds assume full grip
    for (const pa of paths) for (const q of pa.samples) { const g = SURFACES[q.surf].grip; if (g < 1) q.vmax *= 0.45 + 0.55 * g; }
  }

  // 2026-11-22 – open sections (user decision): on natural ground (sand, rock, snow, mud … every surface but the built deck) the road is
  // no longer fenced by guard rails. Its border is a low, uneven row of rock: `hL` / `hR` between 2.6 and about 7 m, here and there an
  // outcrop of up to 12 m, flagged `rockL` / `rockR`. Built decks (start / finish, bridges, tunnels, ramps, zero-G) keep their rails,
  // level basins keep their beacons. `NO_ROCK_BORDERS` (global, CI) = the rails of before.
  if (!(globalThis as { NO_ROCK_BORDERS?: boolean }).NO_ROCK_BORDERS) {
    const n = samples.length;
    for (const right of [false, true]) {
      const sd = right ? 1 : -1;
      const can = (q: Sample) => q.surf > 0 && SURFACES[q.surf].id !== 'deck' && !q.lake && !(q.roof > 0) && !q.bridge && !q.underpass && !q.zeroG && !q.gap && q.ramp === 0 && !(right ? q.openR : q.openL) && !((right ? q.hR : q.hL) > 0);
      const on = samples.map(can), wall = samples.map(q => (right ? q.hR : q.hL) > 0); // (`wall`: a canyon wall stands there already – the border joins it without a notch)
      for (let i = 0; i < n; i++) {
        if (!on[i]) continue;
        // how far into the run of border samples (so both ends come down to 1.2 m over 8 samples instead of ending as a block)
        let d = 9; for (let k = 1; k <= 8 && d > 8; k++) { const a = closed || i - k >= 0 ? ((i - k) % n + n) % n : -1, b = closed || i + k < n ? (i + k) % n : -1; if (a < 0 || b < 0 || !(on[a] || wall[a]) || !(on[b] || wall[b])) d = k; }
        const q = samples[i], t = Math.min(1, (d - 1) / 8), ease = t * t * (3 - 2 * t);
        const rows = 2.6 + 2.4 * Math.pow(fbm1(q.s * 0.052 + sd * 31.7), 1.5) + 1.8 * fbm1(q.s * 0.017 + sd * 5.3);
        const outcrop = Math.max(0, fbm1(q.s * 0.0046 + sd * 17.1) - 0.6) * 22;
        const h = 1.2 + (rows + outcrop - 1.2) * ease;
        if (right) { q.hR = h; q.rockR = true; } else { q.hL = h; q.rockL = true; }
      }
    }
  }
  // 2026-11-22: the canyon wall of the main road used to stop at its full height right beside a fork mouth (a rock slab of up to 50 m
  // stood beside the entrance). Now it comes down to a 1.2 m rock kerb over the 16 samples before the opening and rises again behind it –
  // as the walls of the branch roads always did (`applyShortcutWalls`).
  {
    const n = samples.length, W = (i: number) => samples[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
    for (const right of [false, true]) {
      const isOpen = (q: Sample) => right ? q.openR : q.openL, fac = new Float32Array(n).fill(1);
      for (let i = 0; i < n; i++) {
        if (isOpen(samples[i])) continue;
        let d = 19; for (let k = 1; k <= 18 && d > 18; k++) if (isOpen(W(i - k)) || isOpen(W(i + k))) d = k;
        if (d <= 18) { const t = Math.max(0, Math.min(1, (d - 2) / 16)); fac[i] = t * t * (3 - 2 * t); }
      }
      for (let i = 0; i < n; i++) { const q = samples[i], h = right ? q.hR : q.hL; if (h > 1.2 && fac[i] < 1) { const v = 1.2 + (h - 1.2) * fac[i]; if (right) q.hR = v; else q.hL = v; } }
    }
  }
  // Recompute final collision wall offsets after all shortcuts, bridges, underwater tubes & branching caves are placed
  for (const p of paths) for (const s of p.samples) {
    if (s.openL) s.hL = 0;
    if (s.openR) s.hR = 0;
    if (s.bridge) { s.hL = 0; s.hR = 0; s.canyon = false; }
    // (a rock border stands where the guard rail stood: gates, arches and gantries are built for that width)
    s.wallL = s.openL ? s.hw + 30 : s.zeroG ? s.hw + 1 : s.hL > 0 && !s.rockL ? s.hw + CANYON_OUTSET : s.hw - RAIL_INSET;
    s.wallR = s.openR ? s.hw + 30 : s.zeroG ? s.hw + 1 : s.hR > 0 && !s.rockR ? s.hw + CANYON_OUTSET : s.hw - RAIL_INSET;
  }
  for (const [a, b, cnt] of def.obstacles) {
    const want = Math.max(2, Math.round(cnt * 0.62)); // (tracks are ~1.55× longer since Session 18)
    let placed = 0;
    for (let tries = 0; tries < cnt * 5 && placed < want; tries++) {
      const idx = (Math.floor((a + (b - a) * rng()) * N) + N) % N;
      const s = samples[idx];
      if (s.tun === 2 || !okSpot(s, idx) || idxDist(idx, startIdx) < 85 || (!closed && idxDist(idx, finishIdx) < 60)) continue;
      if (obstacles.some(o => o.path === 0 && idxDist(o.idx, idx) < 26)) continue; // min 52 m spacing!
      const r = 2.0 + rng() * 1.5;
      const lat = (rng() * 2 - 1) * Math.max(2, s.hw - r - 4.5);
      const e = Math.min(1, Math.abs(lat) / s.hw);
      const y = s.y - lat * s.bank + (1 - e * e) * 0.2;
      // Favor crisp tall pillars & hazard pods (2/3) plus beacon-marked boulders (1/3)
      const kindR = Math.floor(rng() * 3);
      obstacles.push({ path: 0, idx, lat, r, kind: s.lake ? 1 : kindR, x: s.x + s.rx * lat, y, z: s.z + s.rz * lat }); // lakes: rock pillars only (no crates on a liquid)
      placed++;
    }
  }
  for (const [ci, lf] of cavePillars) { // rock pillars inside the cave chambers
    const idx = ((ci % N) + N) % N, s = samples[idx], lat = lf * s.hw;
    obstacles.push({ path: 0, idx, lat, r: 2.3, kind: 1, x: s.x + s.rx * lat, y: s.y - lat * s.bank + 0.1, z: s.z + s.rz * lat });
  }
  for (let p = 1; p < paths.length; p++) {
    const ss = paths[p].samples;
    const idx = Math.floor(ss.length * 0.52); const s = ss[idx]; const lat = 3.6;
    obstacles.push({ path: p, idx, lat, r: 2.0, kind: 1, x: s.x + s.rx * lat, y: s.y - lat * s.bank + 0.12, z: s.z + s.rz * lat });
  }
  // hazards (geysers / vents) – skipped inside tunnels and on elevated overpass bridges
  const hazards: Hazard[] = [];
  for (const [a, b, cnt] of def.hazards ?? []) {
    for (let c = 0; c < Math.round(cnt * 1.4); c++) {
      const idx = (Math.floor((a + (b - a) * rng()) * N) + N) % N; const s = samples[idx];
      if (s.roof > 0 || s.bridge || s.underpass || !okSpot(s, idx) || Math.abs(idx - startIdx) < 80 || hazards.some(h => Math.abs(h.idx - idx) < 25)) continue;
      const lat = (rng() * 2 - 1) * s.hw * 0.55; const x = s.x + s.rx * lat, z = s.z + s.rz * lat, y = s.y - lat * s.bank;
      hazards.push({ idx, lat, r: 4.5, x, y, z, period: 4 + rng() * 3, phase: rng() * 10, duty: 0.3, state: 0 });
      obstacles.push({ path: 0, idx, lat, r: 4.5, kind: 3, x, y, z, hz: hazards.length - 1 });
    }
  }
  // set pieces: rotors / futuristic airlock gates prefer straights, collapsing arches prefer gorges
  const setPieces: SetPiece[] = [];
  const cdist = (a: number, b: number) => { const d = Math.abs(a - b); return closed ? Math.min(d, N - d) : d; };
  const spOk = (i: number, type: string) => {
    const s = samples[i]; if (!okSpot(s, i) || s.zeroG || s.bridge || s.underpass || s.lake) return false;
    if (closed ? cdist(i, startIdx) < 110 : (i < startIdx + 110 || i > finishIdx - 70)) return false;
    for (let k = -68; k <= 42; k += 3) { const q = samples[((i + k) % N + N) % N]; if (q.gap || q.ramp > 0 || q.openL || q.openR || q.zeroG || q.roof > 0 || q.bridge || q.underpass) return false; }
    if (hazards.some(h => cdist(h.idx, i) < 50) || setPieces.some(o => cdist(o.idx, i) < 120)) return false;
    if (obstacles.some(o => o.path === 0 && o.kind < 3 && cdist(o.idx, i) < 45)) return false; // never stack a set piece onto an obstacle field
    return type === 'arch' || type === 'icefall' || type === 'boulder' || Math.abs(s.curv) < 1 / 350;
  };
  for (const type of ['rotor', 'gate', 'arch', 'boulder', 'bridge', 'icefall'] as const) for (const f of def.setPieces?.[type] ?? []) {
    let best = -1, bs = 1e9; const c0 = Math.floor(f * N); const win = Math.floor(N * 0.08);
    for (let k = -win; k <= win; k += 3) {
      const i = closed ? ((c0 + k) % N + N) % N : c0 + k; if (i < 0 || i >= N || !spOk(i, type)) continue;
      const gorgeBonus = (type === 'arch' || type === 'icefall') && samples[i].hL > 0 && samples[i].hR > 0 ? 30 : type === 'boulder' && (samples[i].hL > 0 || samples[i].hR > 0) ? 24 : 0;
      const sc = Math.abs(k) * 0.02 + Math.abs(samples[i].curv) * 2000 - gorgeBonus;
      if (sc < bs) { bs = sc; best = i; }
    }
    if (best < 0) continue;
    const s = samples[best];
    const sp: SetPiece = { type, idx: best, x: s.x, y: s.y, z: s.z, hw: s.hw, lat: 0, armLen: 0, arms: 0, speed: 0, phase: rng() * 10, period: 6.5 + rng() * 1.5, state: 0, rocks: [] };
    if (type === 'rotor') {
      sp.lat = (rng() < 0.5 ? -1 : 1) * s.hw * 0.3; sp.armLen = Math.max(8, Math.min(17, s.hw * 0.42)); sp.arms = rng() < 0.5 ? 2 : 3;
      sp.speed = (0.75 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1);
      sp.x = s.x + s.rx * sp.lat; sp.z = s.z + s.rz * sp.lat; sp.y = s.y - sp.lat * s.bank;
      obstacles.push({ path: 0, idx: best, lat: sp.lat, r: 1.9, kind: 4, x: sp.x, y: sp.y, z: sp.z });
    } else if (type === 'boulder') {
      // Launch from whichever side has a taller cliff wall (or random side)
      sp.lat = s.hR > s.hL ? 1 : s.hL > s.hR ? -1 : (rng() < 0.5 ? 1 : -1); // +1 = rolls from right to left
      sp.armLen = 3.2; // boulder radius
      sp.period = 5.4 + rng() * 1.4;
    } else if (type === 'bridge') {
      // Twin side-pivoted drawbridge boom barriers leaving a central flight slot when closed
      sp.armLen = s.hw * 0.68; // each boom spans 68% of half-width, leaving 32% central corridor
      sp.period = 7.2 + rng() * 1.6;
    }
    setPieces.push(sp);
  }
  const obstaclesByPath: Map<number, Obstacle[]>[] = paths.map(() => new Map());
  for (const o of obstacles) {
    const m = obstaclesByPath[o.path]; const b = Math.floor(o.idx / 10);
    if (!m.has(b)) m.set(b, []); m.get(b)!.push(o);
  }
  // arches inside canyon zones (stay clear of tunnels, bridges, underpasses & shortcut mouths)
  const arches: number[] = [];
  const canyonIdx = samples.map((s, i) => (s.canyon && !s.gap && s.ramp === 0 && !(s.roof > 0) && !s.bridge && !s.underpass && !s.openL && !s.openR ? i : -1)).filter(i => i >= 0);
  for (let a = 0; a < Math.round(def.arches * 1.5) && canyonIdx.length; a++) {
    const idx = canyonIdx[Math.floor(rng() * canyonIdx.length)];
    if (arches.every(o => Math.abs(o - idx) > 40)) arches.push(idx);
  }
  const bounds = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, minY: 1e9, maxY: -1e9 };
  for (const p of paths) for (const s of p.samples) {
    bounds.minX = Math.min(bounds.minX, s.x); bounds.maxX = Math.max(bounds.maxX, s.x);
    bounds.minZ = Math.min(bounds.minZ, s.z); bounds.maxZ = Math.max(bounds.maxZ, s.z);
    bounds.minY = Math.min(bounds.minY, s.y); bounds.maxY = Math.max(bounds.maxY, s.y);
  }
  for (const o of obstacles) if (o.kind === 2 || (o.kind === 0 && o.r < 2.9)) o.breakable = true; // crates + small rocks
  return { def, paths, main, N, startIdx, finishIdx, obstacles, obstaclesByPath, hazards, setPieces, arches, bounds, overheads: [], seaY, crossings };
}

function findShortcut(S: Sample[], N: number, fa: number, closed: boolean): [number, number] | null {
  let best: [number, number] | null = null, bestScore = 60;
  const c = Math.floor(fa * N);
  for (let ia = c - 190; ia <= c + 190; ia += 6) {
    if (!closed && (ia < 80)) continue;
    for (let len = 110; len <= 470; len += 10) {
      const ib = ia + len; if (!closed && ib > N - 80) continue; if (closed && len > N / 3) continue;
      const A = S[((ia % N) + N) % N], B = S[((ib % N) + N) % N];
      const chord = Math.hypot(B.x - A.x, B.z - A.z);
      if (chord < 120) continue;
      const score = len * DS - chord;
      if (score <= bestScore) continue;
      // no ramps/gaps/zero-G in bypassed span, and neither fork nor merge may sit on a bridge/underpass
      let bad = false;
      for (let k = -24; k <= len + 24 && !bad; k += 4) {
        const s = S[((ia + k) % N + N) % N];
        if (s.gap || s.ramp > 0) bad = true;
        if ((k < 36 || k > len - 36) && (s.bridge || s.underpass || s.zeroG)) bad = true;
      }
      if (bad) continue;
      const side = ((B.x - A.x) * A.rx + (B.z - A.z) * A.rz) > 0 ? 1 : -1;
      const P = (i: number) => { const s = S[((i % N) + N) % N]; const off = side * (s.hw - SC_HW * 0.9 + 18); return [s.x + s.rx * off, s.z + s.rz * off]; };
      const p0 = P(ia + 14), p1 = P(ib - 14);
      for (let t = 0; t <= 1 && !bad; t += 0.08) {
        const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
        const ea = ((ia + 14) % N + N) % N, eb = ((ib - 14) % N + N) % N;
        const cd = (a: number, b: number) => { const d = Math.abs(a - b); return closed ? Math.min(d, N - d) : d; };
        for (let j = 0; j < N; j += 3) { if (cd(j, ea) < 30 || cd(j, eb) < 30) continue; const s = S[j]; if (Math.hypot(s.x - x, s.z - z) < s.hw + SC_HW + 15 + Math.sin(t * Math.PI) * 12) { bad = true; break; } }
      }
      if (bad) continue;
      bestScore = score; best = [(ia + N) % N, (ia + N) % N + len];
    }
  }
  return best;
}

// ---- queries ----
export function nearestOnPath(path: Path, x: number, z: number, guess: number, win = 24, back = 10) {
  const S = path.samples, n = S.length;
  let best = guess, bd = 1e12;
  for (let k = -back; k <= win; k++) {
    let j = guess + k;
    if (path.closed) j = ((j % n) + n) % n; else if (j < 0 || j >= n) continue;
    const s = S[j]; const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}
export function nearestGlobal(path: Path, x: number, z: number, from = 0, to = -1) {
  const S = path.samples; if (to < 0) to = S.length - 1;
  let best = from, bd = 1e12;
  for (let j = Math.max(0, from); j <= Math.min(S.length - 1, to); j++) { const s = S[j]; const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = j; } }
  return best;
}

export interface Frame { idx: number; lat: number; along: number; groundY: number; gap: boolean; zeroG: boolean; hw: number; wallL: number; wallR: number; s: Sample; }
export function frameAt(path: Path, idx: number, x: number, z: number): Frame {
  const S = path.samples, n = S.length; const s = S[idx];
  const dx = x - s.x, dz = z - s.z;
  const lat = dx * s.rx + dz * s.rz; const along = dx * s.tx + dz * s.tz;
  let j = along >= 0 ? idx + 1 : idx - 1;
  if (path.closed) j = (j + n) % n; else j = Math.max(0, Math.min(n - 1, j));
  const s2 = S[j]; const f = Math.min(1, Math.abs(along) / DS);
  const y = s.y + (s2.y - s.y) * f; const ramp = s.ramp + (s2.ramp - s.ramp) * f;
  const bank = s.bank + (s2.bank - s.bank) * f;
  const hw = s.hw + (s2.hw - s.hw) * f;
  const clampedLat = Math.max(-hw, Math.min(hw, lat));
  const e = hw > 0.1 ? Math.abs(clampedLat) / hw : 0;
  // Exact rendered road-surface elevation including camber crown, curb edge lip & displacement allowance
  const crown = (1 - e * e) * 0.2 + (e > 0.88 ? ((e - 0.88) / 0.12) * 0.18 : 0) + 0.08;
  return { idx, lat, along, groundY: y + ramp - clampedLat * bank + crown, gap: s.gap, zeroG: s.zeroG, hw, wallL: s.wallL + (s2.wallL - s.wallL) * f, wallR: s.wallR + (s2.wallR - s.wallR) * f, s };
}

/** Fast exact rendered road-surface elevation under any world point `(x, z)` (used for 5-point pod ground collision). */
export function roadSurfaceAt(path: Path, guessIdx: number, x: number, z: number): { y: number; gap: boolean } {
  const idx = nearestOnPath(path, x, z, guessIdx, 10, 10);
  const fr = frameAt(path, idx, x, z);
  return { y: fr.groundY, gap: fr.gap || Math.abs(fr.lat) > fr.hw + 2.5 };
}

// ---- set pieces ----
export interface SpRock { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; landed: boolean; hits: number; }
export interface SetPiece {
  type: 'rotor' | 'gate' | 'arch' | 'boulder' | 'bridge' | 'icefall';
  idx: number; x: number; y: number; z: number; hw: number;
  lat: number; armLen: number; arms: number; speed: number; phase: number; period: number;
  state: number; rocks: SpRock[]; // arch/icefall: 0 intact, 1 collapsing, 2 collapsed
}
export function rotorAngle(sp: SetPiece, time: number) { return sp.phase + sp.speed * time; }
function cycPhase(time: number, phase: number, period: number, off = 0) { let ph = ((time + phase) / period - off) % 1; if (ph < 0) ph += 1; return ph; }
const ss01 = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 = fully raised … 1 = fully lowered; one section at a time, 0.4 s drop, ~1.3 s closed */
export function gateDrop(sp: SetPiece, k: number, time: number) {
  const ph = cycPhase(time, sp.phase, sp.period, k / 3);
  return ph < 0.06 ? ss01(0, 0.06, ph) : ph < 0.26 ? 1 : ph < 0.32 ? 1 - ss01(0.26, 0.32, ph) : 0;
}
export function gateWarn(sp: SetPiece, k: number, time: number) { return cycPhase(time, sp.phase, sp.period, k / 3) > 0.86; }
/** Rolling boulder across track: active during ph ∈ [0.16, 0.74], warn during [0.0, 0.16] */
export function boulderState(sp: SetPiece, time: number) {
  const ph = cycPhase(time, sp.phase, sp.period);
  if (ph < 0.16) return { active: false, warn: true, lat: sp.lat * (sp.hw + 7), hop: 6, spin: 0, bounce: false };
  if (ph > 0.74) return { active: false, warn: false, lat: -sp.lat * (sp.hw + 9), hop: -4, spin: 0, bounce: false };
  const u = (ph - 0.16) / 0.58; // 0 = launch side, 1 = exit side
  const lat = sp.lat * (sp.hw + 5 - u * (2 * sp.hw + 10));
  const bPh = (u * 3) % 1;
  const hop = (u < 0.1 ? (1 - u / 0.1) * 4.5 : 0) + Math.abs(Math.sin(u * Math.PI * 3)) * 2.4 * (1 - u * 0.35);
  return { active: true, warn: false, lat, hop, spin: u * Math.PI * 7, bounce: bPh < 0.06 && u > 0.08 && u < 0.92 };
}
/** Twin counter-swinging bridge arms: 0 = swung open parallel to walls … 1 = swung across outer lanes */
export function bridgeSwing(sp: SetPiece, time: number) {
  const ph = cycPhase(time, sp.phase, sp.period);
  return ph < 0.16 ? ss01(0, 0.16, ph) : ph < 0.44 ? 1 : ph < 0.6 ? 1 - ss01(0.44, 0.6, ph) : 0;
}
export function bridgeWarn(sp: SetPiece, time: number) { return cycPhase(time, sp.phase, sp.period) > 0.88; }
function h1(i: number) { const s = Math.sin(i * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); }
function vn1(x: number) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) + (h1(i + 1) - h1(i)) * u; }
function fbm1(x: number) { return (vn1(x) * 0.5 + vn1(x * 2.03 + 5.2) * 0.25 + vn1(x * 4.1 + 1.7) * 0.125) / 0.875; }
