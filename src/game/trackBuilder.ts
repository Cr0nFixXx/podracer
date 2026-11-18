import * as THREE from 'three';
import type { TrackDef } from './data';

export const DS = 2; // sample spacing in meters
export const WIDTH_SCALE = 2.0; // global road width multiplier
export const SC_HW = 12; // shortcut half width
export const RAIL_INSET = 0.3; // guard-rail inner face, metres inside the road edge
export const CANYON_OUTSET = 0.5; // canyon rock face, metres outside the road edge

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
  roof: number; // tunnel ceiling height above the road (0 = open sky)
  vmax: number; // ai reference speed
  s: number;
}

export interface Obstacle { path: number; idx: number; lat: number; r: number; kind: number; x: number; y: number; z: number; hz?: number } // kind 3 = AI keep-out only (hazard / rotor disc), kind 4 = set-piece solid (no generic visual)
/** Periodic eruption zone (methane geyser / lava vent). state: 0 idle, 0.5 warning, 1 erupting (set by Game). */
export interface Hazard { idx: number; lat: number; r: number; x: number; y: number; z: number; period: number; phase: number; duty: number; state: number; }

export interface Path {
  id: number;
  samples: Sample[];
  closed: boolean;
  length: number;
  mainFrom: number; // for shortcuts: main idx range
  mainTo: number;
  side: number;
}

export interface TrackData {
  def: TrackDef;
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

function controlPoints(def: TrackDef) {
  return def.pts.map(([x, z, y, w]) => ({ x: x * 100, z: z * 100, y, w: w * WIDTH_SCALE }));
}

function findStraight(S: Sample[], N: number, at: number, closed: boolean, taken: number[], need: number) {
  // horizontal curvature estimate directly from positions
  const ang = (i: number) => { const a = S[((i - 3) % N + N) % N], b = S[(i % N + N) % N], c = S[((i + 3) % N + N) % N]; const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z; return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)); };
  let best = Math.floor(at * N), bs = 1e9;
  for (let k = -Math.floor(N * 0.12); k <= Math.floor(N * 0.12); k += 4) {
    const i0 = Math.floor(at * N) + k; if (!closed && (i0 < 120 || i0 + need > N - 60)) continue;
    if (taken.some(t => Math.abs(t - i0) < need + 60)) continue;
    let sc = 0; for (let j = -20; j < need; j += 3) sc += ang(i0 + j);
    sc += Math.abs(k) * 0.0004;
    if (sc < bs) { bs = sc; best = i0; }
  }
  return ((best % N) + N) % N;
}

function finalizeSamples(S: Sample[], closed: boolean) {
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
    const bl = Math.min(0.2, 2.4 / Math.max(1, S[i].hw)); S[i].bank = Math.max(-bl, Math.min(bl, S[i].curv * 14));
  }
  // AI reference speeds
  for (let i = 0; i < n; i++) {
    let k = 0; for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(get(i + j).curv));
    S[i].vmax = Math.min(200, 1.35 / Math.max(k, 1e-4));
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
  return { x: p.x, y: p.y, z: p.z, tx: 0, tz: 1, rx: -1, rz: 0, hw, bank: 0, curv: 0, ramp: 0, gap: false, zeroG: false, canyon: false, openL: false, openR: false, link: -1, wallL: hw, wallR: hw, hL: 0, hR: 0, roof: 0, vmax: 200, s };
}

export function buildTrack(def: TrackDef): TrackData {
  const rng = mulberry32(hashStr(def.id));
  const pts = controlPoints(def);
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
    samples.push(makeSample(p, w / 2, i * DS));
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
  // zero-gravity zones: the first two canyon ranges on the prison moon
  if (def.theme === 'oovo') for (const [a, b] of def.canyons.slice(0, 2)) for (let i = Math.floor(a * N); i < Math.floor(b * N); i++) samples[(i + N) % N].zeroG = true;
  // canyon flags
  for (const [a, b] of def.canyons) for (let i = Math.floor(a * N); i < Math.floor(b * N); i++) samples[(i + N) % N].canyon = true;
  // cliff mode per canyon range: 0 both walls, 1 left wall only, 2 right wall only (half-canyon with a view), 3 none (zero-G tube)
  const rngC = mulberry32(hashStr(def.id + '|cliff'));
  const canyonModes = def.canyons.map(([a, b], ci) => ({ a: Math.floor(a * N), b: Math.floor(b * N), mode: def.theme === 'oovo' && ci < 2 ? 3 : (() => { const r = rngC(); return r < 0.4 ? 0 : r < 0.7 ? 1 : 2; })() }));
  // ramps & gaps
  const taken: number[] = [];
  for (const r of def.ramps) {
    const i0 = findStraight(samples, N, r.at, closed, taken, Math.round((r.len + r.gap + 80) / DS)); taken.push(i0);
    const nr = Math.round(r.len / DS), ng = Math.round(r.gap / DS);
    for (let k = 0; k < nr; k++) { const t = (k + 1) / nr; samples[(i0 + k) % N].ramp = r.h * Math.pow(t, 1.7); }
    for (let k = 0; k < ng; k++) { const sm = samples[(i0 + nr + k) % N]; sm.gap = true; }
  }
  finalizeSamples(samples, closed);
  const main: Path = { id: 0, samples, closed, length, mainFrom: 0, mainTo: N - 1, side: 0 };
  const paths: Path[] = [main];

  // shortcuts
  const cpFrac = (ci: number) => { const p = pts[ci]; let bi = 0, bd = 1e12; samples.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi / N; };
  for (const ci of def.shortcuts) {
    const found = findShortcut(samples, N, cpFrac(ci), closed);
    if (!found) continue;
    const [ia, ib] = found;
    const A = samples[ia % N], B = samples[ib % N];
    const side = ((B.x - A.x) * A.rx + (B.z - A.z) * A.rz) > 0 ? 1 : -1;
    const scHw = SC_HW;
    const P = (i: number, extra: number) => {
      const s = samples[((i % N) + N) % N]; const off = side * (s.hw - scHw * 0.9 + extra);
      return new THREE.Vector3(s.x + s.rx * off, s.y + 0.3, s.z + s.rz * off);
    };
    const cps: THREE.Vector3[] = [P(ia - 12, 0), P(ia, 0), P(ia + 14, 18)];
    const s0 = P(ia + 14, 18), s1 = P(ib - 14, 18);
    const mids = 4;
    for (let m = 1; m < mids; m++) {
      const t = m / mids; const v = s0.clone().lerp(s1, t);
      const dx = s1.x - s0.x, dz = s1.z - s0.z, l = Math.hypot(dx, dz) || 1;
      const wig = Math.sin(t * Math.PI * 2) * 12;
      v.x += (-dz / l) * wig; v.z += (dx / l) * wig; v.y += Math.sin(t * Math.PI) * 6;
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
    // open zones
    const nearest = (arr: Sample[], x: number, z: number) => { let bd = 1e9; for (const q of arr) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };
    for (let k = -30; k <= (ib - ia) + 30; k++) {
      const s = samples[(((ia + k) % N) + N) % N];
      if (k > 40 && k < (ib - ia) - 40) continue;
      const ex = s.x + s.rx * side * s.hw, ez = s.z + s.rz * side * s.hw;
      if (nearest(ss, ex, ez) < scHw + 4) { if (side > 0) s.openR = true; else s.openL = true; s.link = pid; s.canyon = false; }
    }
    const nearMain: Sample[] = []; for (let k = ia - 60; k <= ib + 60; k++) { if (closed || (k >= 0 && k < N)) nearMain.push(samples[((k % N) + N) % N]); }
    for (const s of ss) {
      const ex = s.x - s.rx * side * s.hw, ez = s.z - s.rz * side * s.hw;
      if (s.s < 120 || s.s > L2 - 120) {
        if (nearest(nearMain, ex, ez) < samples[ia].hw + 4) { if (side > 0) s.openL = true; else s.openR = true; s.link = 0; }
      }
    }
  }

  // cliff heights per side (tapered over 50 m at gorge entrances) – shared by walls, terrain plateaus, rails and collision
  const cliffH = (s: Sample, side: number) => 14 + fbm1(s.s * 0.004 + side * 10) * 36;
  for (const cm of canyonModes) {
    const len = cm.b - cm.a; if (cm.mode === 3) continue;
    for (let k = 0; k < len; k++) {
      const s = samples[((cm.a + k) % N + N) % N]; if (!s.canyon || s.zeroG) continue;
      const tp0 = Math.max(0, Math.min(1, k / 25, (len - 1 - k) / 25)); const tp = tp0 * tp0 * (3 - 2 * tp0);
      if (cm.mode !== 2 && !s.openL) s.hL = 3 + (cliffH(s, -1) - 3) * tp;
      if (cm.mode !== 1 && !s.openR) s.hR = 3 + (cliffH(s, 1) - 3) * tp;
    }
  }
  for (let pi = 1; pi < paths.length; pi++) {
    const ss = paths[pi].samples, n2 = ss.length;
    for (let i = 0; i < n2; i++) { const s = ss[i]; if (!s.openL) s.hL = cliffH(s, -1) * 0.8; if (!s.openR) s.hR = cliffH(s, 1) * 0.8; if (i >= Math.floor(n2 * 0.25) && i <= Math.floor(n2 * 0.75)) s.roof = 12; }
  }
  // collision walls: guard rails RAIL_INSET inside the edge, cliff rock CANYON_OUTSET outside, zero-G tube wall, open joins none
  for (const p of paths) for (const s of p.samples) {
    s.wallL = s.openL ? s.hw + 30 : s.zeroG ? s.hw + 1 : s.hL > 0 ? s.hw + CANYON_OUTSET : s.hw - RAIL_INSET;
    s.wallR = s.openR ? s.hw + 30 : s.zeroG ? s.hw + 1 : s.hR > 0 ? s.hw + CANYON_OUTSET : s.hw - RAIL_INSET;
  }
  // obstacles: ~55% fewer, well-spaced (>= 52 m apart) so high-speed lines stay fair, readable & flowing
  const obstacles: Obstacle[] = [];
  const startIdx = closed ? 30 : 45;
  const finishIdx = closed ? startIdx : N - 40;
  const okSpot = (s: Sample, i: number) => !s.gap && s.ramp === 0 && !s.openL && !s.openR && !samples[(i + 22) % N].gap && samples[(i + 18) % N].ramp === 0;
  const idxDist = (a: number, b: number) => { const d = Math.abs(a - b); return closed ? Math.min(d, N - d) : d; };
  for (const [a, b, cnt] of def.obstacles) {
    const want = Math.max(2, Math.round(cnt * 0.45));
    let placed = 0;
    for (let tries = 0; tries < cnt * 5 && placed < want; tries++) {
      const idx = (Math.floor((a + (b - a) * rng()) * N) + N) % N;
      const s = samples[idx];
      if (!okSpot(s, idx) || idxDist(idx, startIdx) < 85 || (!closed && idxDist(idx, finishIdx) < 60)) continue;
      if (obstacles.some(o => o.path === 0 && idxDist(o.idx, idx) < 26)) continue; // min 52 m spacing!
      const r = 2.0 + rng() * 1.5;
      const lat = (rng() * 2 - 1) * Math.max(2, s.hw - r - 4.5);
      const e = Math.min(1, Math.abs(lat) / s.hw);
      const y = s.y - lat * s.bank + (1 - e * e) * 0.2;
      // Favor crisp tall pillars & hazard pods (2/3) plus beacon-marked boulders (1/3)
      obstacles.push({ path: 0, idx, lat, r, kind: Math.floor(rng() * 3), x: s.x + s.rx * lat, y, z: s.z + s.rz * lat });
      placed++;
    }
  }
  for (let p = 1; p < paths.length; p++) {
    const ss = paths[p].samples;
    const idx = Math.floor(ss.length * 0.52); const s = ss[idx]; const lat = 3.4;
    obstacles.push({ path: p, idx, lat, r: 2.0, kind: 1, x: s.x + s.rx * lat, y: s.y + 0.15, z: s.z + s.rz * lat });
  }
  // hazards (geysers / vents) – also registered as kind-3 pseudo obstacles so the AI steers around them
  const hazards: Hazard[] = [];
  for (const [a, b, cnt] of def.hazards ?? []) {
    for (let c = 0; c < cnt; c++) {
      const idx = (Math.floor((a + (b - a) * rng()) * N) + N) % N; const s = samples[idx];
      if (!okSpot(s, idx) || Math.abs(idx - startIdx) < 80 || hazards.some(h => Math.abs(h.idx - idx) < 25)) continue;
      const lat = (rng() * 2 - 1) * s.hw * 0.55; const x = s.x + s.rx * lat, z = s.z + s.rz * lat, y = s.y - lat * s.bank;
      hazards.push({ idx, lat, r: 4.5, x, y, z, period: 4 + rng() * 3, phase: rng() * 10, duty: 0.3, state: 0 });
      obstacles.push({ path: 0, idx, lat, r: 4.5, kind: 3, x, y, z, hz: hazards.length - 1 });
    }
  }
  // set pieces: rotors / portcullis gates prefer straights, collapsing arches prefer gorges
  const setPieces: SetPiece[] = [];
  const cdist = (a: number, b: number) => { const d = Math.abs(a - b); return closed ? Math.min(d, N - d) : d; };
  const spOk = (i: number, type: string) => {
    const s = samples[i]; if (!okSpot(s, i) || s.zeroG) return false;
    if (closed ? cdist(i, startIdx) < 110 : (i < startIdx + 110 || i > finishIdx - 70)) return false;
    for (let k = -68; k <= 42; k += 3) { const q = samples[((i + k) % N + N) % N]; if (q.gap || q.ramp > 0 || q.openL || q.openR || q.zeroG) return false; }
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
  // arches inside canyon zones
  const arches: number[] = [];
  const canyonIdx = samples.map((s, i) => (s.canyon && !s.gap && s.ramp === 0 ? i : -1)).filter(i => i >= 0);
  for (let a = 0; a < def.arches && canyonIdx.length; a++) {
    const idx = canyonIdx[Math.floor(rng() * canyonIdx.length)];
    if (arches.every(o => Math.abs(o - idx) > 40)) arches.push(idx);
  }
  const bounds = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, minY: 1e9, maxY: -1e9 };
  for (const p of paths) for (const s of p.samples) {
    bounds.minX = Math.min(bounds.minX, s.x); bounds.maxX = Math.max(bounds.maxX, s.x);
    bounds.minZ = Math.min(bounds.minZ, s.z); bounds.maxZ = Math.max(bounds.maxZ, s.z);
    bounds.minY = Math.min(bounds.minY, s.y); bounds.maxY = Math.max(bounds.maxY, s.y);
  }
  return { def, paths, main, N, startIdx, finishIdx, obstacles, obstaclesByPath, hazards, setPieces, arches, bounds };
}

function findShortcut(S: Sample[], N: number, fa: number, closed: boolean): [number, number] | null {
  let best: [number, number] | null = null, bestScore = 60;
  const c = Math.floor(fa * N);
  for (let ia = c - 120; ia <= c + 120; ia += 6) {
    if (!closed && (ia < 80)) continue;
    for (let len = 110; len <= 360; len += 10) {
      const ib = ia + len; if (!closed && ib > N - 80) continue; if (closed && len > N / 3) continue;
      const A = S[(ia + N) % N], B = S[(ib + N) % N];
      const chord = Math.hypot(B.x - A.x, B.z - A.z);
      if (chord < 120) continue;
      const score = len * DS - chord;
      if (score <= bestScore) continue;
      // no ramps/gaps near ends
      let bad = false;
      for (let k = -20; k <= len + 20 && !bad; k += 4) { const s = S[((ia + k) % N + N) % N]; if (s.gap || s.ramp > 0) bad = true; }
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
