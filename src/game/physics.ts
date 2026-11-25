import * as THREE from 'three';
import type { PilotDef, PodDef, StatKey } from './data';
import { DS, TUNNEL_SHOULDER, ZG_AXIS, boulderState, tunnelCeiling, bridgeSwing, frameAt, gateDrop, nearestGlobal, nearestOnPath, roadSurfaceAt, rotorAngle, tunnelProfile, zgRockAt, type Obstacle, type Path, type Sample, type SetPiece, type TrackData } from './trackBuilder';
export { ZG_AXIS };
import type { PodVisual } from './podModel';
import { COCKPIT_SWAY, podCollision, podEnvelope, type PodEnvelope } from './podDesigns';
import { STAMP_EVERY, TRENCH_GRIP, TRENCH_VMAX } from './snowField';
import { surfaceOf } from './surfaces';
import { DAMAGE_RULES, FX_NONE, damageModel, partsDue, partsFx, zoneFactor, type DamageZone, type PodFx } from './podDamage';
export { FX_NONE, type DamageZone, type PodFx };

/** `airbrake` = air brake, and a handbrake slide while steering. `pitch`: +1 lift (nose up), -1 dive (nose down). `roll`: -1 left / +1 right knife-edge (90°). */
export interface Inputs { throttle: number; brake: number; steer: number; boost: boolean; airbrake: boolean; repair: boolean; pitch?: number; roll?: number; }

export interface PodState {
  /** powder snow (snowField.ts): how much of the snow in front of the pod's engines is already cut away (0 fresh … 1 a trench), how
   *  high the snow stands there now (metres – what the pod ploughs through), and the metres flown since its last cut */
  snowPack?: number; snowDepth?: number; snowS?: number;
  /** zero-G: seconds the pod has been in the tube (the nose locks onto the tube over the first half second) */
  zgT?: number;
  id: number; isPlayer: boolean; def: PodDef; pilot: PilotDef; stats: Record<StatKey, number>;
  name: string; color: string;
  pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; yawRate: number; steer: number;
  path: number; idx: number; lat: number; grounded: boolean; zeroG: boolean; air: number; groundY: number; prevGroundY: number;
  input: Inputs;
  hpL: number; hpR: number; heat: number; boosting: boolean; overheat: boolean; repairing: boolean; airbraking: boolean;
  lap: number; passedMid: boolean; rel: number; prog: number; finished: boolean; finishTime: number; lapStart: number; lapTimes: number[];
  dead: number; invuln: number; lastSafePath: number; lastSafeIdx: number; wrongWay: number;
  roll: number; pitch: number; shake: number;
  /** Dynamic left/right turbine vertical articulation & pitch (heaves on steering, bumps & curbs; clamped above ground!) */
  engYL?: number; engYR?: number; engVL?: number; engVR?: number; engPL?: number; engPR?: number;
  /** Session 10 manual attitude: smoothed pitch (-1 dive .. +1 lift) & roll (-1 .. +1 = ∓90°) controls, handbrake slide state, banked-road grip */
  pitchCtl?: number; rollCtl?: number; rollBase?: number; sliding?: boolean; slideT?: number; slideK?: number; bankGrip?: number;
  /** Session 17: on the drivable deck above a tunnel / inside a roofed section; boost overdrive seconds used (max 3); cockpit pendulum (visual) */
  upper?: boolean; inRoof?: boolean; overT?: number;
  ckX?: number; ckY?: number; ckZ?: number; ckVX?: number; ckVY?: number; ckVZ?: number; ckPv?: number;
  /** Session 20: lost Bruchteile (bit i = part i of the racer's Schadensmodell is gone) and the handling multipliers that follow
   *  from them (undefined = intact). Both change only in `applyDamage` (a part breaks) and `respawn` (all parts return). */
  parts?: number; fx?: PodFx;
  /** 2026-11-23, reset key: the pod is off the track because the player asked for it (`manualReset`) – `respawn` then repairs nothing;
   *  seconds until the key works again. */
  manualReset?: boolean; resetCd?: number;
  /** `part`: a Bruchteil broke off (`part` = its index in the Schadensmodell) */
  events: { type: 'wall' | 'obstacle' | 'land' | 'explode' | 'pod' | 'fall' | 'field' | 'break' | 'part'; strength: number; x: number; y: number; z: number; nx: number; nz: number; ref?: Obstacle; part?: number }[];
  visual: PodVisual | null;
  ai: AIState | null;
  place: number;
}

export interface AIState { /** grid lane held for the first seconds (start discipline) */ gridLat?: number; /** 3D snow: lateral aim correction while following a trench (metres) */ trI?: number; dive?: boolean; diveT?: number; diveRoll?: number; stuck?: number; lastT?: number; prevLat?: number; skill: number; speedF: number; lineOff: number; takeShortcut: boolean; boostUntil: number; repairMode: boolean; noiseT: number; rubber: number; }

export const GRAVITY = 34;
/** Generous repulsor hover altitude + hard per-engine/cockpit floor gap so no pod part EVER clips into the road! */
export const HOVER = 2.85;
/** Vertical speed against the ground (m/s) that a landing may have without costing hull – a free fall of 21 m (2026-11-23). */
export const LAND_FREE = 38;
/** height of the drivable deck above a tunnel's ceiling */
export const TUNNEL_DECK = 1.2;
const MIN_ROAD_CLEAR = 0.68;

/** The one place where a pod loses engine health.
 *  `side`: < 0 left engine side, > 0 right, 0 = no side (split half and half), 'both' = the full amount on each side.
 *  `zone`: where the hit comes from – the racer's Schadensmodell (podDamage.ts) weighs it: armour of that Panzerzone times the guards
 *  still attached on that side. Afterwards every Bruchteil whose side fell through its step breaks off (event `part`).
 *  Stat factors (`sturdy`), AI factors, cooldowns and invulnerability stay with the caller. */
/** A pod's pose as its model is posed: yaw about the vertical axis at `pos`, then pitch and roll of the body about an origin `bodyZ` ahead. */
type Pose = { pos: THREE.Vector3; yaw: number; pitch: number; roll: number };
/** World point -> the pod's body space (x right, y up, z forward: the frame its model is built in), in place. Takes the pose of THIS
 *  step: while the events of a step are handled, the model's own matrices still hold the pose of the frame before (1.7 m back at 100 m/s). */
export function worldToBody(p: Pose, bodyZ: number, v: THREE.Vector3) {
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = Math.sin(p.pitch), cp = Math.cos(p.pitch), sr = Math.sin(p.roll), cr = Math.cos(p.roll);
  const dx = v.x - p.pos.x, dy = v.y - p.pos.y, dz = v.z - p.pos.z;
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy - bodyZ; // undo the yaw, step back to the body origin
  const y2 = dy * cp + z1 * sp, z2 = -dy * sp + z1 * cp;         // undo the pitch
  return v.set(x1 * cr + y2 * sr, -x1 * sr + y2 * cr, z2);      // undo the roll
}
/** Body space -> world, in place (the inverse of `worldToBody`). */
export function bodyToWorld(p: Pose, bodyZ: number, v: THREE.Vector3) {
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = Math.sin(p.pitch), cp = Math.cos(p.pitch), sr = Math.sin(p.roll), cr = Math.cos(p.roll);
  const x1 = v.x * cr - v.y * sr, y1 = v.x * sr + v.y * cr;       // roll
  const y2 = y1 * cp - v.z * sp, z2 = y1 * sp + v.z * cp + bodyZ; // pitch, out to the body origin
  return v.set(p.pos.x + x1 * cy + z2 * sy, p.pos.y + y2, p.pos.z - x1 * sy + z2 * cy); // yaw
}

const HULL_PTS = new Float32Array(3 * 512); // scratch: the corners of one pod's hull in the world (the largest hull has about 150)
/** The corners of the pod's hull (podDesigns `hull`) in the world, in the pose its model is drawn in: yaw, pitch and roll about the body
 *  origin, each engine side with its vertical travel, the cockpit swaying in its cables. Writes x, y, z triples to `out` and returns
 *  the number of corners. Tunnel vaults and overhead structures are tested against these points – not against one height per pod:
 *  with its nose up a pod reaches up to 8 m higher at the engine intakes than when it is level. */
export function hullWorld(p: PodState, env: PodEnvelope, out: Float32Array = HULL_PTS): number {
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = Math.sin(p.pitch), cp = Math.cos(p.pitch), sr = Math.sin(p.roll), cr = Math.cos(p.roll), bz = env.bodyZ;
  const px = p.pos.x, py = p.pos.y, pz = p.pos.z; let n = 0;
  const put = (x: number, y: number, z: number) => { // body space -> world (as `bodyToWorld`)
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr, z2 = y1 * sp + z * cp + bz;
    out[n++] = px + x1 * cy + z2 * sy; out[n++] = py + y1 * cp - z * sp; out[n++] = pz - x1 * sy + z2 * cy;
  };
  const L = env.hull.L, R = env.hull.R, C = env.hull.ck, yl = p.engYL ?? 0, yr = p.engYR ?? 0;
  for (let i = 0; i < L.length; i += 3) put(L[i], L[i + 1] + yl, L[i + 2]);
  for (let i = 0; i < R.length; i += 3) put(R[i], R[i + 1] + yr, R[i + 2]);
  // the cockpit leans about the body origin with its sway, then shifts (podModel `setCockpitSway`: rotation.z, rotation.x, position)
  const kx = p.ckX ?? 0, ky = p.ckY ?? 0, kz = p.ckZ ?? 0, az = -kx * COCKPIT_SWAY.roll, ax = kz * COCKPIT_SWAY.pitch;
  const sa = Math.sin(az), ca = Math.cos(az), sb = Math.sin(ax), cb = Math.cos(ax);
  for (let i = 0; i < C.length; i += 3) { const x = C[i] * ca - C[i + 1] * sa, y = C[i] * sa + C[i + 1] * ca, z = C[i + 2]; put(x + kx, y * cb - z * sb + ky, y * sb + z * cb + kz); }
  return n / 3;
}
/** The tunnel vault is cut off at this share of its half width (`vaultOver`): next to the wall foot it would come down to the road. */
export const VAULT_CLAMP = 0.96;
const VAULT_LOW = tunnelProfile(VAULT_CLAMP);
// the cross-section of a tunnel a point lies in (`crossSection`): between the samples XA and XB, the share XF of the way towards XB
let XA: Sample, XB: Sample, XF = 0;
/** Finds the cross-section of `path` that the world point (x, z) lies in, walking along the samples from `idx` until the point is level
 *  with one (a few steps: on a bend the cross-sections fan out, a point on the inside passes more of them per metre). Sets XA, XB, XF.
 *  False where there is no roof (beyond a portal: open sky). */
function crossSection(path: Path, idx: number, x: number, z: number): boolean {
  const S = path.samples, N = S.length, wrap = path.closed;
  let j = idx, sa = S[j], a = (x - sa.x) * sa.tx + (z - sa.z) * sa.tz; // `a` = how far the point is ahead of the plane of sample j
  for (let it = 0; it < 5 && (a > DS * 0.5 || a < -DS * 0.5); it++) {
    let k = j + Math.round(a / DS); if (wrap) k = ((k % N) + N) % N; else k = k < 0 ? 0 : k >= N ? N - 1 : k;
    if (k === j) break;
    const sk = S[k], ak = (x - sk.x) * sk.tx + (z - sk.z) * sk.tz; if (Math.abs(ak) >= Math.abs(a)) break; // (no closer: a fold in the road)
    j = k; sa = sk; a = ak;
  }
  let k = a >= 0 ? j + 1 : j - 1; if (wrap) k = ((k % N) + N) % N; else k = k < 0 ? 0 : k >= N ? N - 1 : k; // the neighbour on the point's side
  let sb = S[k], f = 0;
  if (sb !== sa) { const ab = (x - sb.x) * sb.tx + (z - sb.z) * sb.tz; f = a * ab < 0 ? a / (a - ab) : Math.min(1, Math.abs(a) / DS); }
  if (!(sa.roof > 0)) { if (!(sb.roof > 0) || f < 0.5) return false; sa = sb; f = 0; } else if (!(sb.roof > 0)) { if (f >= 0.5) return false; sb = sa; f = 0; } // a portal between the two
  XA = sa; XB = sb; XF = f;
  return true;
}
/** Height (world y) of the tunnel shell above (x, z) in the cross-section found by `crossSection`: the superellipse of the mesh
 *  (`tunnelProfile`) over the road, sheared with the bank, straight between two samples – as the mesh is built. `low`: only the lowest
 *  the shell can be anywhere across that cross-section (cheap: no roots). */
function shellHeight(x: number, z: number, low: boolean): number {
  const sa = XA, sb = XB, la = (x - sa.x) * sa.rx + (z - sa.z) * sa.rz, ba = sa.y + sa.ramp - la * sa.bank + 1.5, ha = sa.roof - 1.5;
  const va = ba + ha * (low ? VAULT_LOW : tunnelProfile(Math.min(VAULT_CLAMP, Math.abs(la) / (sa.hw + TUNNEL_SHOULDER + (sa.caveW ?? 0)))));
  if (sb === sa) return va;
  const lb = (x - sb.x) * sb.rx + (z - sb.z) * sb.rz, bb = sb.y + sb.ramp - lb * sb.bank + 1.5, hb = sb.roof - 1.5;
  const vb = bb + hb * (low ? VAULT_LOW : tunnelProfile(Math.min(VAULT_CLAMP, Math.abs(lb) / (sb.hw + TUNNEL_SHOULDER + (sb.caveW ?? 0)))));
  return va + (vb - va) * XF;
}
/** The sample of `other` nearest to (x, y, z) – for a pod on `path` at a junction of the two (a branch is searched as a whole, the
 *  main path round the branch's two ends only: tracks cross over themselves). */
function nearestOnLinked(path: Path, other: Path, x: number, y: number, z: number): number {
  if (other.id !== 0) return nearestGlobal(other, x, z, 0, other.samples.length - 1);
  const M = other.samples, nm = M.length; let best = ((path.mainFrom % nm) + nm) % nm, bd = 1e12;
  for (const center of [path.mainFrom, path.mainTo]) for (let k = -65; k <= 65; k++) {
    let j = center + k; if (other.closed) j = ((j % nm) + nm) % nm; else if (j < 0 || j >= nm) continue;
    const q = M[j], d = (q.x - x) ** 2 + (q.z - z) ** 2 + (q.y - y) ** 2 * 4; if (d < bd) { bd = d; best = j; }
  }
  return best;
}
/** How far the pod reaches into the tunnel vault (metres; ≤ 0: clear of it by that much): every one of the `n` hull corners in `pts`
 *  (`hullWorld`) against the shell above THAT corner (`crossSection`, `shellHeight`) – so the vault follows the road down a slope,
 *  round a bend and into a cave chamber, and a corner beyond a portal is under the open sky. Where a cave branches (the side of the
 *  cross-section is open to the linked path), the two tubes are one cavern: the higher of the two shells counts, as in the mesh.
 *  `idx` = the pod's sample on `path`. `exact`: also work out the clearance of corners far below the vault (unit checks); the game
 *  skips them. */
export function vaultOver(td: TrackData, path: Path, idx: number, pts: Float32Array, n: number, exact = false): number {
  let over = -1e9, og = -1; // (og: the pod's sample on the linked path, found when a corner needs it)
  for (let i = 0; i < n * 3; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    if (!crossSection(path, idx, x, z)) continue;
    if (!exact && y <= shellHeight(x, z, true)) continue; // below even the lowest part of the vault
    let shell = shellHeight(x, z, false);
    if ((exact || y > shell) && XA.link >= 0 && XA.link !== path.id && ((x - XA.x) * XA.rx + (z - XA.z) * XA.rz < 0 ? XA.openL : XA.openR)) {
      const other = td.paths[XA.link];
      if (og < 0) og = nearestOnLinked(path, other, pts[0], pts[1], pts[2]);
      if (crossSection(other, og, x, z)) shell = Math.max(shell, shellHeight(x, z, false));
    }
    if (y - shell > over) over = y - shell;
  }
  return over;
}
export function applyDamage(p: PodState, side: number | 'both', amount: number, zone: DamageZone) {
  const m = DAMAGE_RULES.armor || DAMAGE_RULES.parts ? damageModel(p.def.id) : null;
  let aL = side === 'both' || side < 0 ? amount : side > 0 ? 0 : amount * 0.5;
  let aR = side === 'both' || side > 0 ? amount : side < 0 ? 0 : amount * 0.5;
  if (m && DAMAGE_RULES.armor) { const mask = p.parts ?? 0; aL *= zoneFactor(m, mask, -1, zone); aR *= zoneFactor(m, mask, 1, zone); }
  p.hpL -= aL; p.hpR -= aR;
  if (!m || !DAMAGE_RULES.parts || p.hpL <= 0 || p.hpR <= 0) return; // (a pod about to explode loses everything at once: no single parts)
  const due = partsDue(m, p.hpL, p.hpR) & ~(p.parts ?? 0);
  if (!due) return;
  p.parts = (p.parts ?? 0) | due;
  p.fx = partsFx(m, p.parts, !p.isPlayer); // a Gegner feels half of it
  for (let i = 0; i < m.parts.length; i++) if ((due >> i) & 1) p.events.push({ type: 'part', strength: 1, part: i, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 });
}
/** Zone of a hit whose contact normal (nx, nz) points from the obstacle to the pod: head-on = front, anything else = side. */
function hitZone(p: PodState, nx: number, nz: number): DamageZone { return nx * Math.sin(p.yaw) + nz * Math.cos(p.yaw) < -0.5 ? 'front' : 'side'; }

export function podParams(p: PodState) {
  const s = p.stats, f = p.fx ?? FX_NONE;
  return {
    vmax: (108 + 50 * s.topSpeed) * f.vmax,
    /** top speed without lost Bruchteile (sense of speed: camera FOV) */ vmax0: 108 + 50 * s.topSpeed,
    accel: (24 + 30 * s.accel) * f.accel,
    turn: (1.05 + 0.75 * s.turn) * f.turn,
    grip: (2.6 + 5.2 * s.traction) * f.grip,
    abDecel: (22 + 38 * s.airbrake) * f.abDecel,
    abTurn: 1.45 + 0.6 * s.airbrake,
    cool: (0.16 + 0.3 * s.cooling) * f.cool,
    heatRate: (0.38 - 0.16 * s.cooling) * f.heatRate,
    repair: 6 + 16 * s.repair,
    sturdy: 1.25 - 0.5 * s.repair,
    width: podCollision(p.def).halfW,
    /** metres from the pod's reference point to the front of its engines (they lead the pod) */ nose: noseOf(p.def),
  };
}
const noseOf = (def: PodDef) => { const e = podEnvelope(def); return Math.max(e.engL.frontZ, e.engR.frontZ); };

function wrapAngle(a: number) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// ---- zero-G tubes (2026-11-23, user: "zentrale mittige Anziehung … wie ein Gummiband") ----
// A spring holds the pod on the axis of the tube, sideways and in height. Steering and climb / sink do not turn or thrust it: they
// move the point the spring pulls to, up to ZG_REACH of the tube radius off the axis. Released, the pod snaps back: with ZG_OMEGA
// 3.5 rad/s and ZG_ZETA 0.6 it crosses the axis after 0.8 s and swings 10 % past it. The nose follows the tube by itself.
// (Session 16/17 before: free drift with a weak pull in height only, steering turned the pod.)
export const ZG_REACH = 0.7, ZG_OMEGA = 3.5, ZG_ZETA = 0.6;
/** How far a pod in a zero-G tube may be pushed off the axis – `side`ways and `up` / down, metres – and how near the end of the tube
 *  is: `exit` rises from 0 to 1 between ZG_EXIT_FROM and ZG_EXIT_FULL seconds of flight before the end. Looks ZG_EXIT_FROM seconds
 *  ahead: where the tube narrows, or ends on a road that is narrower than the tube, the reach shrinks in time – a pod held at the
 *  wall is led back onto the road, one held at the ceiling comes down to hover height before the tube lets it go. */
export const ZG_EXIT_FROM = 2.2, ZG_EXIT_FULL = 0.9, ZG_EXIT_SIDE = 0.35;
/** Down, the reach ends at the deck: the tube is a circle of 30–56 m radius round an axis only ZG_AXIS = 7 m above the road – 70 % of
 *  the radius down would be far below the deck (2026-11-25, reported by the user: "man kann durch den Boden tauchen"). Held down,
 *  the pod sinks to hover height; `stepPod` also holds it there by force. */
export const ZG_DOWN = ZG_AXIS - HOVER - 0.3;
export function zeroGReach(td: TrackData, p: PodState, halfW: number): { side: number; up: number; down: number; exit: number } {
  const path = td.paths[p.path], S = path.samples, n = S.length, v = Math.max(20, Math.hypot(p.vel.x, p.vel.z)), look = Math.max(12, Math.round(v * ZG_EXIT_FROM / DS));
  let side = 1e9, up = 1e9, exitAt = -1, roadHw = 0;
  for (let k = 0; k <= look; k += 4) {
    const q = S[path.closed ? (p.idx + k) % n : Math.min(n - 1, p.idx + k)];
    if (q.zeroG) { const R = q.hw + 1.4, m = Math.max(1.5, Math.min(ZG_REACH * R, R - halfW - 1.2)); if (m < side) side = m; if (m < up) up = m; }
    else { if (exitAt < 0) { exitAt = k; roadHw = q.hw; } side = Math.min(side, Math.max(1.5, q.hw - halfW - 2.5)); }
  }
  const exit = exitAt < 0 ? 0 : Math.max(0, Math.min(1, (ZG_EXIT_FROM - exitAt * DS / v) / (ZG_EXIT_FROM - ZG_EXIT_FULL)));
  // towards the end the sideways reach shrinks to the middle third of the road behind the tube: the tube hands the pod back with
  // room to both walls (held at full lock it used to come out 8 m beside the rail, with the road already turning)
  if (exit > 0) side += (Math.min(side, Math.max(1.5, roadHw * ZG_EXIT_SIDE)) - side) * exit;
  return { side, up, down: ZG_DOWN, exit };
}

/** `heatMul` = engine-heat factor of climate and weather (`EnvFx.heat`): while boosting the engines heat up × heatMul, they cool down ÷ heatMul. */
export function stepPod(p: PodState, td: TrackData, dt: number, time: number, gripMul: number, frozen: boolean, heatMul = 1) {
  const P = podParams(p);
  const inp = p.input;
  if (p.dead > 0) return;
  // Session 20: the ground under the pod changes the handling – for the player and the rivals alike (surfaces.ts). Airborne and
  // in zero-G only the heat factor applies (the hot air over a lava lake, the cold over ice).
  const SF = surfaceOf(td.paths[p.path]?.samples[p.idx]?.surf), onSurf = p.grounded && !p.zeroG;
  let sfGrip = onSurf ? SF.grip : 1, sfVmax = onSurf ? SF.vmax : 1;
  // 2026-11-23 – 3D snow (snowField.ts): the powder field is a layer of drifts 1 to 3 m deep, and a pod cuts a trench through it.
  // Fresh snow holds it at 86 % of its top speed (SURFACES.powder); where a pod ahead has cut, it runs at TRENCH_VMAX. The snow is
  // read IN FRONT of the engines, beyond everything this pod has cut itself – its own trench never helps it.
  p.snowPack = 0; p.snowDepth = 0;
  if (td.snow && onSurf && SF.id === 'powder' && !frozen) {
    const snow = td.snow, off = P.width * 0.55, rad = P.width * 0.45 + 0.9; // two discs under the engine banks: together one trench a little wider than the pod
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -fz, rz = fx, v = Math.hypot(p.vel.x, p.vel.z), step = v * dt;
    const nx = p.pos.x + fx * P.nose, nz = p.pos.z + fz * P.nose, ah = rad + 1.5 + step;
    const ax = nx + fx * ah, az = nz + fz * ah;
    const pk = (snow.packAt(p.path, p.idx, ax - rx * off, az - rz * off) + snow.packAt(p.path, p.idx, ax + rx * off, az + rz * off)) / 2;
    p.snowPack = pk; p.snowDepth = (snow.heightAt(p.path, p.idx, ax - rx * off, az - rz * off) + snow.heightAt(p.path, p.idx, ax + rx * off, az + rz * off)) / 2;
    sfGrip += (TRENCH_GRIP - sfGrip) * pk; sfVmax += (TRENCH_VMAX - sfVmax) * pk;
    p.snowS = (p.snowS ?? 0) + step;
    if (p.snowS >= STAMP_EVERY) {
      // one cut per STAMP_EVERY metres, laid back along the way flown in this step (at 150 m/s a step is 2.5 m long)
      const cuts = Math.min(6, Math.floor(p.snowS / STAMP_EVERY)); p.snowS = Math.min(STAMP_EVERY, p.snowS - cuts * STAMP_EVERY);
      for (let k = 0; k < cuts; k++) {
        const back = k * step / cuts, cx = nx - fx * back, cz = nz - fz * back;
        snow.stamp(p.path, p.idx, cx - rx * off, cz - rz * off, rad, 1); snow.stamp(p.path, p.idx, cx + rx * off, cz + rz * off, rad, 1);
      }
    }
    // slow or standing (after a reset, a crash): the repulsors blow a pit free under the whole pod within a third of a second –
    // otherwise it would sit buried up to its engines until it has moved a pod's length
    if (v < 25) for (const back of [P.nose * 0.5, 0, -P.nose * 0.55]) {
      const cx = p.pos.x + fx * back, cz = p.pos.z + fz * back, am = Math.min(1, dt * 7);
      snow.stamp(p.path, p.idx, cx - rx * off, cz - rz * off, rad, am); snow.stamp(p.path, p.idx, cx + rx * off, cz + rz * off, rad, am);
    }
  }
  if (p.invuln > 0) p.invuln -= dt;
  { const pc = p as unknown as { obCd?: number; wCd?: number }; if (pc.obCd) pc.obCd = Math.max(0, pc.obCd - dt); if (pc.wCd) pc.wCd = Math.max(0, pc.wCd - dt); }
  // steering smoothing
  // Session 14 – knife-edge control: once rolled, the pod's axes are rotated. Lift/dive keys now turn it (pulling "up" turns towards
  // the pod's top = the side it rolled to), the steering keys move it up/down. Blended with the roll amount, so it eases in.
  const k0 = Math.abs(Math.sin((p.rollCtl ?? 0) * (Math.PI / 2))), g0 = (p.rollCtl ?? 0) >= 0 ? 1 : -1;
  const steerMix = inp.steer * (1 - k0) + (inp.pitch ?? 0) * g0 * k0 * 1.25;
  const pitchMix = (inp.pitch ?? 0) * (1 - k0) - inp.steer * g0 * k0;
  const target = Math.max(-1, Math.min(1, steerMix));
  const rate = (Math.sign(target) !== Math.sign(p.steer) && Math.abs(p.steer) > 0.05 ? 9 : target === 0 ? 7 : 4.5) * (1 + 0.8 * k0);
  p.steer += Math.max(-rate * dt, Math.min(rate * dt, target - p.steer));
  // Manual attitude controls (only act while their key is held; both ease back to neutral on release)
  const pIn = frozen ? 0 : Math.max(-1, Math.min(1, pitchMix)), rIn = frozen ? 0 : Math.max(-1, Math.min(1, inp.roll ?? 0));
  const pc = p.pitchCtl = (p.pitchCtl ?? 0) + (pIn - (p.pitchCtl ?? 0)) * Math.min(1, dt * 6.5);
  p.rollCtl = (p.rollCtl ?? 0) + Math.max(-dt * 4.4, Math.min(dt * 4.4, rIn - (p.rollCtl ?? 0)));
  const rollA = p.rollCtl * (Math.PI / 2), knife = Math.abs(Math.sin(rollA));
  const env0 = podEnvelope(p.def); const halfSpan = Math.max(Math.abs(env0.engL.outerX), Math.abs(env0.engR.outerX));

  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -fz, rz = fx;
  let vf = p.vel.x * fx + p.vel.z * fz;
  let vr = p.vel.x * rx + p.vel.z * rz;
  const hp = (p.hpL + p.hpR) / 200;
  p.airbraking = inp.airbrake && vf > 15;
  // Handbrake slide (Session 14 retune): progressive instead of a hard snap. `slideK` ramps 0→1 in ~0.3 s while air brake + steering
  // are held on the ground: lateral grip fades to 8.5 % (the pod keeps drifting on its momentum), the yaw boost is moderate
  // (×1.2–1.47 instead of ×1.7–2.4), a slip-angle limiter prevents spins, and grip returns smoothly over ~0.45 s after release.
  const wantSlide = p.airbraking && Math.abs(p.steer) > 0.2 && p.grounded && !frozen;
  // Session 15: more drift – grip fades to 3.5 %, returns over ~0.7 s, the pod may hang out to ~50° slip. Rivals slide at 45 % strength.
  const skRaw = p.slideK = Math.max(0, Math.min(1, (p.slideK ?? 0) + (wantSlide ? dt * 3.2 : -dt * 1.4)));
  const sk = p.ai && !p.isPlayer ? skRaw * 0.45 : skRaw;
  const sliding = sk > 0.25;
  if (wantSlide) p.slideT = Math.min(2.2, (p.slideT ?? 0) + dt);
  else { if ((p.slideT ?? 0) > 0.45 && inp.throttle > 0.5 && !inp.airbrake && p.grounded) vf += Math.min(7, p.slideT! * 4.2); if (!inp.airbrake || !p.grounded) p.slideT = 0; }
  p.sliding = sliding;
  p.repairing = inp.repair && !frozen;

  // heat / boost
  const wantBoost = inp.boost && inp.throttle > 0.5 && vf > 35 && !p.overheat && !frozen && !p.repairing;
  p.boosting = wantBoost;
  const hf = SF.heat * heatMul; // the ground under the pod × climate and weather
  if (p.boosting) p.heat += P.heatRate * hf * dt; else p.heat -= P.cool / hf * dt * (p.repairing ? 1.5 : 1);
  // Session 17 – overdrive: at the heat limit the boost can be held for up to 3 more seconds at the cost of slow engine damage.
  // After 3 s the engines cut out (lock-out until they have cooled to 55 %). Releasing early cools down normally; the used time recovers below 90 %.
  if (p.heat >= 1) {
    p.heat = 1;
    // 2026-11-23 (user: over lava only an extremely short boost): the overdrive burns faster over a very hot surface – over the lava
    // lake (heat 4.5) three times as fast: one second instead of three, the same engine damage in a third of the time.
    const od = Math.max(1, SF.heat / 1.5);
    if (p.boosting && (p.overT ?? 0) < 3) { p.overT = (p.overT ?? 0) + dt * od; applyDamage(p, 'both', 3.2 * dt * od * P.sturdy, 'heat'); }
    if ((p.overT ?? 0) >= 3) { p.overheat = true; p.boosting = false; }
  } else if (!p.boosting && (p.overT ?? 0) > 0 && p.heat < 0.9) p.overT = Math.max(0, p.overT! - dt * 1.5);
  if (p.overheat && p.heat < 0.55) { p.overheat = false; p.overT = 0; }
  p.heat = Math.max(0, p.heat);
  if (p.repairing) { p.hpL = Math.min(100, p.hpL + P.repair * dt); p.hpR = Math.min(100, p.hpR + P.repair * dt); }

  // turning
  const sp = Math.abs(vf);
  const lowF = Math.min(1, sp / 22);
  const highF = 1 - 0.32 * Math.min(1, sp / P.vmax);
  // 2026-11-22: reversing mirrors the yaw, as in a car – stick right swings the tail to the right. The authority runs through 0 at
  // standstill (`lowF`), so nothing jumps when the direction of travel changes.
  const dirF = vf < 0 ? -1 : 1;
  let omega = p.steer * dirF * P.turn * lowF * highF * (1 + ((P.abTurn - 1) * 0.45 + 0.6) * sk) * (p.grounded ? 1 : 0.55) * (1 + 0.45 * knife); // Session 15: lift/dive steer with MORE authority on knife-edge (was -40 %)
  if (sk > 0 && p.steer * vr < 0) { // steering deeper into the slide: fade the yaw input beyond ~35° slip (no spin-outs)
    const slip = Math.atan2(Math.abs(vr), Math.max(8, vf));
    if (slip > 1.05) omega *= Math.max(0.12, 1 - (slip - 1.05) / 0.4); // Session 16: the rear may swing out to ~60°
  }
  omega += (p.hpR - p.hpL) / 100 * 0.25 * lowF;
  if (frozen) omega = 0;
  const zgOn = p.zeroG && !frozen;
  if (zgOn) {
    // the nose follows the tube: the heading is the tube's direction at the pod (blended in over the first half second in the tube)
    const zs = td.paths[p.path].samples, q = zs[p.idx], q2 = zs[td.paths[p.path].closed ? (p.idx + 1) % zs.length : Math.min(zs.length - 1, p.idx + 1)];
    const al = Math.max(0, Math.min(1, ((p.pos.x - q.x) * q.tx + (p.pos.z - q.z) * q.tz) / DS));
    p.zgT = (p.zgT ?? 0) + dt;
    const turn = wrapAngle(Math.atan2(q.tx + (q2.tx - q.tx) * al, q.tz + (q2.tz - q.tz) * al) - p.yaw) * Math.min(1, dt * (5 + 115 * Math.min(1, p.zgT / 0.5)));
    p.yaw += turn; p.yawRate = -turn / dt;
  } else {
    p.zgT = 0;
    p.yawRate += (omega - p.yawRate) * Math.min(1, dt * (9 - 5.2 * sk)); // in a slide the yaw builds up and carries (soft, pendulum-like) instead of snapping
    p.yaw -= p.yawRate * dt;
  }

  // thrust
  let vmaxE = P.vmax * sfVmax * (0.72 + 0.28 * hp) * (p.boosting ? 1.32 : 1) * (p.repairing ? 0.55 : 1) * (p.zeroG ? 1.28 : 1); // Session 16: zero-G = no drag → faster
  if (p.isPlayer === false && p.ai) vmaxE *= p.ai.speedF * p.ai.rubber;
  if (!frozen) {
    if (inp.throttle > 0) {
      const ratio = Math.max(0, vf) / vmaxE;
      const a = P.accel * (p.boosting ? 1.7 : 1) * Math.max(0, 1 - ratio * ratio) * inp.throttle * (p.grounded ? 1 : p.zeroG ? 1.35 : 0.5);
      vf += a * dt;
      if (ratio > 1) vf -= (vf - vmaxE) * 1.2 * dt;
    }
    if (inp.brake > 0) { if (vf > 0) vf = Math.max(0, vf - 55 * inp.brake * dt); else vf = Math.max(-18, vf - 14 * inp.brake * dt); }
    if (p.airbraking) vf = Math.max(10, vf - P.abDecel * (1 - 0.8 * sk) * dt);
  } else vf *= Math.exp(-3 * dt);
  vf *= Math.exp(-(p.zeroG ? (inp.throttle > 0 ? 0 : 0.05) : inp.throttle > 0 ? 0.04 : 0.28) * dt);
  const attGrip = (p.bankGrip ?? 1) * (pc < 0 ? 1 - 0.14 * pc : 1 - 0.2 * pc);
  const zgR = zgOn ? zeroGReach(td, p, P.width) : null;
  if (zgR) vr += (ZG_OMEGA * ZG_OMEGA * (p.steer * zgR.side - p.lat) - 2 * ZG_ZETA * ZG_OMEGA * vr) * dt; // the spring to the axis, sideways (the nose points along the tube: `vr` is the speed across it)
  else {
    // ice (2026-11-23): once the pod really slides the grip breaks away further (SurfaceDef.slip) – the slide carries on
    const sl = onSurf && SF.slip ? 1 - SF.slip * Math.max(0, Math.min(1, (Math.abs(vr) - 3) / 9)) : 1;
    vr *= Math.exp(-P.grip * gripMul * sfGrip * sl * attGrip * dt * ((p.airbraking ? 0.5 : 1) * (1 - sk) + 0.035 * sk) * (p.grounded ? 1 : 0.15));
  }
  const fx2 = Math.sin(p.yaw), fz2 = Math.cos(p.yaw), rx2 = -fz2, rz2 = fx2;
  p.vel.x = fx2 * vf + rx2 * vr; p.vel.z = fz2 * vf + rz2 * vr;

  // integrate horizontal
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;

  // track frame & path switching
  let path = td.paths[p.path];
  p.idx = nearestOnPath(path, p.pos.x, p.pos.z, p.idx);
  let fr = frameAt(path, p.idx, p.pos.x, p.pos.z);
  // Helper: find closest main-path sample scoped to a branch's merge window (so tracks crossing over/under themselves never snap wrong!)
  const nearestMainScoped = (br: typeof path, x: number, z: number) => {
    const main = td.paths[0], M = main.samples, nm = M.length;
    let best = ((br.mainTo % nm) + nm) % nm, bd = 1e12;
    for (const center of [br.mainFrom, br.mainTo]) for (let k = -65; k <= 65; k++) {
      let j = center + k; if (main.closed) j = ((j % nm) + nm) % nm; else if (j < 0 || j >= nm) continue;
      const q = M[j], d = (q.x - x) ** 2 + (q.z - z) ** 2 + (q.y - p.pos.y) ** 2 * 4;
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };
  if (p.path > 0 && (p.idx >= path.samples.length - 3 || p.idx <= 1)) {
    const main = td.paths[0], mi = nearestMainScoped(path, p.pos.x, p.pos.z);
    p.path = 0; path = main; p.idx = mi; fr = frameAt(path, mi, p.pos.x, p.pos.z);
  }
  const s = fr.s;
  const sideOpen = fr.lat > 0 ? s.openR : s.openL;
  if (Math.abs(fr.lat) > fr.hw - 1 && sideOpen && s.link >= 0) {
    const other = td.paths[s.link];
    const oi = other.id === 0 ? nearestMainScoped(path, p.pos.x, p.pos.z) : nearestGlobal(other, p.pos.x, p.pos.z, 0, other.samples.length - 1);
    const of = frameAt(other, oi, p.pos.x, p.pos.z);
    if (Math.abs(of.lat) < of.hw - 0.5 && Math.abs(of.groundY - fr.groundY) < 9 && (other.id === 0 || (oi > 1 && oi < other.samples.length - 3))) {
      p.path = other.id; path = other; p.idx = oi; fr = of;
    }
  }
  p.lat = fr.lat;
  const S = fr.s;
  // Session 17 – standard & cave tunnels carry a drivable top deck; underwater tubes (2) & bridge-underpass tunnels (4) do not.
  if (S.roof > 0 && !fr.gap) {
    if (!p.inRoof) {
      // Session 20: a pod arriving ABOVE the portal opening at its lateral position (the vault is lower near the walls) is carried onto
      // the deck instead of being pressed down through the headwall
      p.inRoof = true; p.upper = S.tun !== 2 && p.pos.y + 1.2 > fr.groundY + tunnelCeiling(S, fr.lat);
      if (p.upper && p.pos.y < fr.groundY + S.roof + 2.4 && p.invuln <= 0) { // clipped the portal lip on the way up
        const dmg = 5 * P.sturdy; applyDamage(p, 'both', dmg, 'belly'); p.shake = Math.min(1, p.shake + 0.4);
        p.events.push({ type: 'wall', strength: 16, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 });
      }
    }
  } else { p.inRoof = false; p.upper = false; }
  const upOff = p.upper ? S.roof + TUNNEL_DECK : 0;
  if (upOff) fr.groundY += upOff;
  if (!path.closed && p.idx >= path.samples.length - 2 && fr.along > 0 && path.id === 0) {
    p.pos.x -= S.tx * fr.along; p.pos.z -= S.tz * fr.along;
    const vt = p.vel.x * S.tx + p.vel.z * S.tz; if (vt > 0) { p.vel.x -= S.tx * vt; p.vel.z -= S.tz * vt; }
  }

  // vertical repulsor hover
  const offRoad = Math.abs(fr.lat) > fr.hw + 1.5;
  const gap = fr.gap || offRoad;
  p.prevGroundY = p.groundY;
  p.groundY = fr.groundY;
  const bob = Math.sin(time * 2.8 + p.id) * 0.1;
  // Lift key raises the repulsor height (+1.6 m), dive key presses the pod down (-0.45 m); a knife-edge roll needs half the engine span as clearance
  const targetY = fr.groundY + HOVER + bob + (pc > 0 ? pc * 1.6 : pc * 0.45) + knife * halfSpan * 0.92;
  const wasGrounded = p.grounded, vyIn = p.vel.y; // (the sink rate the pod arrives with – the hover spring below takes a third of it off within this very step)
  let landImpulse = 0;
  p.zeroG = fr.zeroG && !fr.gap;
  if (p.zeroG) {
    // 2026-11-23 – the spring to the axis, in height: climb / sink move the point it pulls to. It damps the speed RELATIVE to the
    // axis (the tube climbs and falls with the track – damping the absolute speed left the pod metres behind on a slope). Over the
    // last second before the tube ends the point sinks to hover height: the pod leaves the tube where the road begins.
    const R0 = zgR ?? zeroGReach(td, p, P.width), e = R0.exit * R0.exit * (3 - 2 * R0.exit);
    const hT = pc * (pc > 0 ? R0.up : R0.down) * (1 - e) + (HOVER + 0.8 - ZG_AXIS) * e, axisVy = Math.max(-40, Math.min(40, (p.groundY - p.prevGroundY) / dt));
    p.vel.y += (ZG_OMEGA * ZG_OMEGA * (fr.groundY + ZG_AXIS + hT - p.pos.y) - 2 * ZG_ZETA * ZG_OMEGA * (p.vel.y - axisVy)) * dt;
    p.grounded = false;
  } else if (!gap && p.pos.y <= targetY + 1.05) {
    const k = 155, c = 22;
    p.vel.y += ((targetY - p.pos.y) * k - p.vel.y * c) * dt;
    if (S.ramp > 0) p.vel.y = Math.max(p.vel.y, Math.min(28 + Math.max(0, pc) * 6, (p.groundY - p.prevGroundY) / dt * (0.85 + Math.max(0, pc) * 0.2)));
    p.grounded = true;
  } else {
    // Airborne attitude: nose up = glide (longer jump, costs a little speed), nose down = dive (fast descent)
    const hsA = Math.hypot(p.vel.x, p.vel.z);
    p.vel.y -= GRAVITY * (pc > 0 ? 1 - 0.5 * pc * Math.min(1, hsA / 70) : 1 - 1.15 * pc) * dt;
    if (pc > 0) { if (p.vel.y < 0) p.vel.y *= Math.exp(-0.7 * pc * dt); const dr = Math.exp(-0.1 * pc * dt); p.vel.x *= dr; p.vel.z *= dr; }
    p.grounded = false;
  }
  p.pos.y += p.vel.y * dt;
  // zero-G: the deck of the tube is solid – the pod stops at hover height (no landing, no damage: it floats)
  if (p.zeroG && p.pos.y < fr.groundY + HOVER - 0.4) { p.pos.y = fr.groundY + HOVER - 0.4; p.vel.y = Math.max(p.vel.y, Math.max(-40, Math.min(40, (p.groundY - p.prevGroundY) / dt))); }
  // Hard chassis floor above road surface (prevents sinking on steep climbs, ramps & heavy landings)
  if (!gap && !p.zeroG && p.pos.y < fr.groundY + HOVER - 0.52) {
    const gv = (p.groundY - p.prevGroundY) / dt;
    if (!wasGrounded && p.vel.y < -14) landImpulse = -p.vel.y;
    p.pos.y = fr.groundY + HOVER - 0.52;
    p.vel.y = Math.max(p.vel.y, Math.min(62, gv));
    p.grounded = true;
  }
  if (p.grounded) p.air = 0; else p.air += dt;
  if (!wasGrounded && p.grounded && (p.vel.y < -14 || landImpulse > 14)) {
    const imp = Math.max(-p.vel.y, landImpulse);
    // 2026-11-23 (user: "kein Fallschaden bei sanfter/normaler Landung"): until then every landing faster than 14 m/s cost hull –
    // a plain ramp jump comes down at about 30 m/s and lost 6 points each time. Now the repulsors take what a jump or a drop brings
    // (`LAND_FREE`: 38 m/s, a free fall of 21 m); only what is above that hits the belly. Measured against the ground: a road that
    // falls away softens the landing, one that climbs towards the pod hardens it.
    const hard = Math.max(imp, -vyIn) + Math.max(-25, Math.min(12, (p.groundY - p.prevGroundY) / dt)) - LAND_FREE; // (+12 at most: a step in `groundY` – crown, a change of path – must not count as a fall)
    if (hard > 0) applyDamage(p, 0, hard * 0.9 * P.sturdy, 'belly');
    p.shake = Math.min(1, p.shake + (hard > 0 ? 0.4 : 0.12 + 0.2 * Math.min(1, imp / LAND_FREE)));
    landImpulse = imp;
    p.events.push({ type: 'land', strength: imp, x: p.pos.x, y: fr.groundY, z: p.pos.z, nx: 0, nz: 0 });
  }
  // zero-G tubes (tunnel vaults: at the end of the step, once the pod's pose is final)
  if (p.zeroG) {
    const dy = p.pos.y - (fr.groundY + ZG_AXIS), dl = fr.lat, dist = Math.hypot(dl, dy), R = fr.hw + 1.4;
    if (dist > R) {
      const rl = dl / dist, ry = dy / dist, k = dist - R;
      p.pos.x -= S.rx * rl * k; p.pos.z -= S.rz * rl * k; p.pos.y -= ry * k;
      const vr2 = (p.vel.x * S.rx + p.vel.z * S.rz) * rl + p.vel.y * ry;
      if (vr2 > 0) {
        p.vel.x -= S.rx * rl * vr2 * 1.3; p.vel.z -= S.rz * rl * vr2 * 1.3; p.vel.y -= ry * vr2 * 1.3;
        if (vr2 > 2) p.events.push({ type: 'field', strength: vr2, x: p.pos.x + S.rx * rl * 2, y: p.pos.y + ry * 2, z: p.pos.z + S.rz * rl * 2, nx: -S.rx * rl, nz: -S.rz * rl });
      }
    }
  }
  if (gap && p.pos.y < S.y - 14) { p.events.push({ type: 'fall', strength: 1, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 }); kill(p, 1.6, false); return; }

  // walls: guard rails (finite height, energy field above) / cliff rock / zero-G tube
  if (!fr.gap) {
    const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw); const rollW = Math.max(0.22, Math.abs(Math.cos(rollA))); // knife-edge = narrow
    let best = 0, nx = 0, nz = 0, hx = 0, hz = 0, side = 0, soft = false;
    for (const c of C) {
      const cxr = c.x * rollW; const wx = p.pos.x + cxr * cy + c.z * sy, wz = p.pos.z - cxr * sy + c.z * cy;
      const cs = path.samples[nearestOnPath(path, wx, wz, p.idx, 8, 8)];
      if (cs.gap) continue;
      const lat = (wx - cs.x) * cs.rx + (wz - cs.z) * cs.rz; const sg = lat >= 0 ? 1 : -1;
      const pen = Math.abs(lat) + c.r - (sg > 0 ? cs.wallR : cs.wallL);
      if (pen > best) {
        best = pen; nx = -cs.rx * sg; nz = -cs.rz * sg; hx = wx - nx * c.r; hz = wz - nz * c.r; side = c.side;
        const hW = sg > 0 ? cs.hR : cs.hL, rock = hW > 0 && !!(sg > 0 ? cs.rockR : cs.rockL), cliff = hW > 0 && !rock;
        const railTop = cs.y + cs.ramp - sg * cs.hw * cs.bank + (rock ? hW : 1.55); // (2026-11-22: a rock border is solid up to its top, like a rail)
        soft = !cliff && (cs.zeroG || !!cs.lake || p.pos.y - 0.9 > railTop); // lakes have no rails – beacons carry an energy field
      }
    }
    if (best > 0) {
      p.pos.x += nx * best; p.pos.z += nz * best;
      const vt = -(p.vel.x * nx + p.vel.z * nz);
      if (vt > 0 && soft) {
        p.vel.x += nx * vt * 1.15; p.vel.z += nz * vt * 1.15;
        if (vt > 2) p.events.push({ type: 'field', strength: vt, x: hx, y: p.pos.y, z: hz, nx, nz });
      } else if (vt > 0) {
        p.vel.x += nx * vt * 1.35; p.vel.z += nz * vt * 1.35;
        const scrub = 1 - Math.min(0.35, vt * 0.012 + 0.01); p.vel.x *= scrub; p.vel.z *= scrub;
        const d = wrapAngle(Math.atan2(S.tx, S.tz) - p.yaw);
        const zone = hitZone(p, nx, nz); // which part of the pod met the wall – read before the nose is turned along it: head-on (steeper than 30° to the wall) = 'front', as for obstacles
        if (Math.abs(d) < 1.4) p.yaw += d * Math.min(1, 0.15 + vt * 0.01);
        const wc = p as unknown as { wCd?: number };
        if (vt > 4 && p.invuln <= 0 && !(wc.wCd! > 0)) {
          wc.wCd = 0.2;
          const dmg = Math.min(28, Math.max(0, vt - 9) * 0.7 * P.sturdy);
          applyDamage(p, side, dmg, zone);
          p.shake = Math.min(1, p.shake + vt * 0.02);
          p.events.push({ type: 'wall', strength: vt, x: hx, y: p.pos.y, z: hz, nx, nz });
        }
      }
    }
  }

  // overhead structures (sponsor gantries, start portal, gates, arches): solid – a pod flying into one is knocked back down (or up, if
  // it came from above). The pod is as tall and as deep as its hull in its present pose (`hullWorld`): the highest and the lowest of
  // its corners that are under the structure. (Before: 1.5 m above and below the pod centre for every pod – the upper 2.7 m of a
  // tall one went through.) An arch is still read at the pod CENTRE's lateral position: its collision shape is padded for that.
  if (td.overheads && td.overheads.length && p.path === 0) {
    const Nm = td.N; let hn = -1; // (hull corners: worked out when the pod comes near an overhead)
    for (const oh of td.overheads) {
      let di = p.idx - oh.idx; if (td.main.closed) { if (di > Nm / 2) di -= Nm; else if (di < -Nm / 2) di += Nm; }
      if (Math.abs(di) > 10 + oh.half / DS) continue; // (the pod reaches up to 14 m ahead of its centre)
      const s0 = td.main.samples[oh.idx];
      if (hn < 0) hn = hullWorld(p, env0);
      let top = -1e9, bot = 1e9;
      for (let i = 0; i < hn * 3; i += 3) {
        if (Math.abs((HULL_PTS[i] - s0.x) * s0.tx + (HULL_PTS[i + 2] - s0.z) * s0.tz) > oh.half + 1) continue; // this corner is not under it
        const y = HULL_PTS[i + 1]; if (y > top) top = y; if (y < bot) bot = y;
      }
      if (top < bot) continue;
      let y0 = oh.y0, y1 = oh.y1;
      if (oh.arch) { // arch (checkpoint gate, rock arch, set-piece arch): the ceiling follows the half ellipse – low near the road edges, high over the centre
        const A = oh.arch, lat = (p.pos.x - s0.x) * s0.rx + (p.pos.z - s0.z) * s0.rz, Ri = A.R - (A.inner ?? 1.7);
        if (A.sp !== undefined && td.setPieces[A.sp] && td.setPieces[A.sp].state >= 1 && Math.abs(lat) < A.R * 0.5) continue; // collapsed: the middle is gone
        y0 = s0.y + (A.yOff ?? 0) + A.sy * Math.sqrt(Math.max(0, Ri * Ri - lat * lat)); y1 = y0 + (A.thick ?? 3.6);
      }
      if (top <= y0 || bot >= y1) continue;
      const below = p.pos.y < (y0 + y1) * 0.5, hitY = below ? y0 : y1;
      if (below) { p.pos.y -= top - y0; if (p.vel.y > -5) p.vel.y = -5; } else { p.pos.y += y1 - bot; if (p.vel.y < 4) p.vel.y = 4; }
      hn = -1; // (the pod has moved)
      const wc = p as unknown as { wCd?: number };
      if (p.invuln <= 0 && !(wc.wCd! > 0)) {
        wc.wCd = 0.5; const spd = Math.hypot(p.vel.x, p.vel.z), dmg = Math.min(18, 5 + spd * 0.07) * P.sturdy;
        applyDamage(p, 0, dmg, 'top'); p.vel.x *= 0.9; p.vel.z *= 0.9; p.shake = Math.min(1, p.shake + 0.5);
        p.events.push({ type: 'wall', strength: 18 + spd * 0.1, x: p.pos.x, y: hitY, z: p.pos.z, nx: 0, nz: 0 });
      }
    }
  }

  // obstacles
  const buckets = td.obstaclesByPath[p.path]; const b0 = Math.floor(p.idx / 10);
  for (let bb = b0 - 1; bb <= b0 + 1; bb++) {
    const list = buckets.get(bb); if (!list) continue;
    for (const o of list) if (o.kind !== 3 && !o.broken) collideObstacle(p, o, P.sturdy);
  }
  if (td.setPieces.length) collideSetPieces(p, td, time, P.sturdy);
  // boulders drifting in a zero-G tube: a hit is a hit on an obstacle rock
  if (p.zeroG && p.path === 0) for (const k of td.zgRocks) {
    if (Math.abs(k.idx - p.idx) > 14) continue;
    const q = zgRockAt(td, k, time);
    collideObstacle(p, { path: 0, idx: k.idx, lat: q.lat, r: k.r, kind: 0, x: q.x, y: q.y, z: q.z }, P.sturdy, true);
  }

  // progress
  const N = td.N;
  let mainIdx = p.idx;
  if (p.path > 0) { const pa = td.paths[p.path]; mainIdx = Math.round(pa.mainFrom + (p.idx / (pa.samples.length - 1)) * (pa.mainTo - pa.mainFrom)); mainIdx = ((mainIdx % N) + N) % N; }
  if (td.main.closed) {
    const rel = ((mainIdx - td.startIdx) % N + N) % N;
    const d = rel - p.rel;
    if (d < -N / 2) { if (p.passedMid) { p.lap++; p.passedMid = false; if (p.lap > 0) p.lapTimes.push(time - p.lapStart); p.lapStart = time; } }
    else if (d > N / 2) { p.lap--; p.passedMid = true; }
    if (rel > N * 0.45 && rel < N * 0.9) p.passedMid = true;
    p.rel = rel;
    p.prog = p.lap * N + rel;
  } else {
    p.rel = mainIdx - td.startIdx; p.prog = p.rel;
  }
  const fwd = Math.sin(p.yaw) * S.tx + Math.cos(p.yaw) * S.tz;
  if (fwd < -0.3 && !frozen) p.wrongWay += dt; else p.wrongWay = Math.max(0, p.wrongWay - dt * 2);
  if (p.grounded && !S.gap && !S.zeroG && Math.abs(fr.lat) < fr.hw - 3 && S.ramp === 0) { p.lastSafePath = p.path; p.lastSafeIdx = p.idx; }

  if (p.hpL <= 0 || p.hpR <= 0) { p.events.push({ type: 'explode', strength: 1, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 }); kill(p, 2.6, true); }

  // ---- Dynamic steering turbine articulation + 5-point ground collision protection ----
  const env = podEnvelope(p.def);
  const cyA = Math.cos(p.yaw), syA = Math.sin(p.yaw);
  const samplePt = (lx: number, lz: number) => { const r = roadSurfaceAt(path, p.idx, p.pos.x + lx * cyA + lz * syA, p.pos.z - lx * syA + lz * cyA); if (upOff) r.y += upOff; return r; };

  let roadSlope = 0, floorL = -1e9, floorR = -1e9, floorCk = -1e9, fLF = -1e9, fLB = -1e9, fRF = -1e9, fRB = -1e9;
  if (!gap && !p.zeroG) {
    const sLF = samplePt(env.engL.outerX, env.engL.frontZ), sLB = samplePt(env.engL.outerX, env.engL.backZ);
    const sRF = samplePt(env.engR.outerX, env.engR.frontZ), sRB = samplePt(env.engR.outerX, env.engR.backZ);
    const sCk = samplePt(0, env.cockpit.z);
    if (!sLF.gap) { floorL = Math.max(floorL, sLF.y); fLF = sLF.y; }
    if (!sLB.gap) { floorL = Math.max(floorL, sLB.y); fLB = sLB.y; }
    if (!sRF.gap) { floorR = Math.max(floorR, sRF.y); fRF = sRF.y; }
    if (!sRB.gap) { floorR = Math.max(floorR, sRB.y); fRB = sRB.y; }
    if (!sCk.gap) floorCk = sCk.y;
    if (!sLF.gap && !sRF.gap && !sCk.gap) {
      const dz = Math.max(4, (env.engL.frontZ + env.engR.frontZ) * 0.5 - env.cockpit.z);
      roadSlope = Math.atan2((sLF.y + sRF.y) * 0.5 - sCk.y, dz);
    }
  }

  // Note: looking forward along +Z with +Y up, +X is screen-LEFT and -X is screen-RIGHT!
  // On a right turn (steer > 0), roll > 0 dips -X (right/inner) and lifts +X (left/outer).
  // Wait: in podLayout, em.x < 0 is screen-RIGHT when looking along +Z (since +X points left when camera is at -Z looking +Z)!
  // Verify: in stepPod line 60, forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw); world = pos + (x*cos + z*sin, -x*sin + z*cos).
  // At yaw = 0: forward = (0, +1), right = (-1, 0), and local x = -2.5 maps to world (-2.5, 0) = RIGHT side of the pod!
  // And Three.js rotation.z = +roll maps (x, 0, 0) -> (x*cos, x*sin, 0): so roll > 0 dips x < 0 (RIGHT/inner) and lifts x > 0 (LEFT/outer)!
  // Steering no longer tilts the pod (engines heave instead): only a hint of lean, the road bank and the manual 90° roll remain
  const zg = p.zeroG ? 1 : 0; // weightless: the pod banks freely into turns and slowly tumbles
  const rawRoll = p.steer * (0.07 + 0.34 * zg) + zg * Math.sin(time * 0.6 + p.id * 1.3) * 0.06 + vr * 0.004 + p.steer * 0.12 * sk + (p.grounded ? Math.atan(S.bank) * 0.92 : 0);
  const targetRoll = Math.max(-0.5, Math.min(0.5, rawRoll));
  p.rollBase = (p.rollBase ?? 0) + (targetRoll - (p.rollBase ?? 0)) * Math.min(1, dt * 7);
  p.roll = p.rollBase * (1 - knife) + rollA;
  p.bankGrip = p.grounded ? 1 + Math.min(0.9, Math.abs(S.bank) * 2.4) : 1;

  const hs = Math.max(12, Math.hypot(p.vel.x, p.vel.z));
  const flightPitch = -Math.atan2(p.vel.y, hs) * 0.72;
  const targetPitch = Math.max(-0.42, Math.min(0.42, (p.grounded ? -roadSlope * 0.92 : flightPitch) + (p.boosting ? -0.045 : 0) + (p.airbraking ? 0.065 : 0))) - pc * (p.grounded ? 0.2 : 0.34) + zg * Math.sin(time * 0.47 + p.id * 2.1) * 0.03;
  p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 8);

  // Dynamic independent vertical heave & pitch of the two turbine assemblies when steering!
  // `engL` = x < 0 (starboard/right turbine in chase view), `engR` = x > 0 (port/left turbine in chase view):
  // Steering right (steer > 0): port/outer turbine (`engR`, x>0) rises high (+0.92 m) while starboard/inner (`engL`, x<0) dips (-0.52 m);
  // Steering left  (steer < 0): starboard/outer turbine (`engL`, x<0) rises high (+0.92 m) while port/inner (`engR`, x>0) dips (-0.52 m)!
  const spdK = 0.42 + 0.58 * Math.min(1, sp / 90);
  const turn = Math.max(-1.35, Math.min(1.35, p.steer * 0.9 + (p.yawRate / Math.max(1, P.turn)) * 0.42)) * (p.airbraking ? 1.28 : 1) * spdK;
  const oscA = Math.sin(time * 4.5 + p.id * 1.7) * 0.1 + Math.sin(time * 1.8 + p.id) * 0.05;
  const oscB = Math.sin(time * 4.2 + p.id * 2.3 + 2.2) * 0.1 + Math.cos(time * 2.0 + p.id) * 0.05;
  const boostLift = p.boosting ? 0.14 : 0;
  const sagA = p.hpL < 35 ? -(1 - p.hpL / 35) * 0.22 : 0;
  const sagB = p.hpR < 35 ? -(1 - p.hpR / 35) * 0.22 : 0;
  // Asymmetric travel: outer turbine climbs prominently (+0.92 m), inner turbine tucks crisply (-0.50 m) into the apex
  const driveA = -turn, driveB = turn;
  // Pure vertical travel: the outer turbine lifts as a whole (+1.1 m), the inner one settles slightly (-0.22 m) – no engine pitch/roll
  const flA = zg * Math.sin(time * 1.1 + p.id) * 0.22, flB = zg * Math.sin(time * 0.9 + p.id + 2.4) * 0.22; // engines bob independently in zero-G
  // Session 17: more travel – outer engine +1.5 m, inner one -0.5 m, livelier idle bob
  const tgtA = (driveA >= 0 ? driveA * 1.5 : driveA * 0.5) + oscA * 1.5 + boostLift + sagA + flA;
  const tgtB = (driveB >= 0 ? driveB * 1.5 : driveB * 0.5) + oscB * 1.5 + boostLift + sagB + flB;

  let yA = p.engYL ?? 0, yB = p.engYR ?? 0, vA = p.engVL ?? 0, vB = p.engVR ?? 0;
  if (landImpulse > 0) { const j = -Math.min(5.2, landImpulse * 0.18); vA += j; vB += j; }
  const w0 = 11.5, damp = 2 * 0.66 * w0;
  vA += ((tgtA - yA) * (w0 * w0) - vA * damp) * dt; yA += vA * dt;
  vB += ((tgtB - yB) * (w0 * w0) - vB * damp) * dt; yB += vB * dt;

  // Rising outer engine pitches subtly nose-up, dipping inner engine pitches slightly nose-down + velocity follow-through
  const tgtPA = 0, tgtPB = 0;
  p.engPL = (p.engPL ?? 0) + (tgtPA - (p.engPL ?? 0)) * Math.min(1, dt * 10);
  p.engPR = (p.engPR ?? 0) + (tgtPB - (p.engPR ?? 0)) * Math.min(1, dt * 10);

  // Strict 5-point repulsor ground collision clamp: engines, wings & cockpit NEVER touch or sink into the road!
  if (!gap && !p.zeroG && p.pos.y < fr.groundY + HOVER + 3.2 + knife * halfSpan + Math.max(0, pc) * 1.6) {
    const sinP = Math.sin(p.pitch), sinR = Math.sin(p.roll), cosRa = Math.abs(Math.cos(p.roll));
    const slopeVy = Math.max(0, Math.min(60, (p.groundY - p.prevGroundY) / dt));
    if (floorCk > -1e8) {
      const ckBot = p.pos.y + env.cockpit.minY - env.cockpit.z * sinP;
      const pen = floorCk + MIN_ROAD_CLEAR - ckBot;
      if (pen > 0) { p.pos.y += pen; p.vel.y = Math.max(p.vel.y, slopeVy); p.grounded = true; p.air = 0; }
    }
    if (floorL > -1e8) {
      // Exact per-point test (front tip vs road under the front, tail vs road under the tail) – no false lift on gradients/banked corners.
      // Under roll the lowest point is the engine barrel or, once rolled far, the outboard wing tip at axis height.
      const base = p.pos.y + yA + Math.min(env.engL.x * sinR + env.engL.minY, env.engL.outerX * sinR + env.engL.minY * cosRa) - Math.abs(sinR) * 0.15;
      const pen = Math.max(fLF + MIN_ROAD_CLEAR - (base - env.engL.frontZ * sinP), fLB + MIN_ROAD_CLEAR - (base - env.engL.backZ * sinP));
      if (pen > 0) {
        const lift = Math.min(pen, Math.max(0, 1.95 - yA));
        yA += lift; if (vA < 0) vA *= 0.15;
        if (pen > lift) { p.pos.y += pen - lift; p.vel.y = Math.max(p.vel.y, slopeVy); p.grounded = true; p.air = 0; }
      }
    }
    if (floorR > -1e8) {
      // Exact per-point test (front tip vs road under the front, tail vs road under the tail) – no false lift on gradients/banked corners.
      // Under roll the lowest point is the engine barrel or, once rolled far, the outboard wing tip at axis height.
      const base = p.pos.y + yB + Math.min(env.engR.x * sinR + env.engR.minY, env.engR.outerX * sinR + env.engR.minY * cosRa) - Math.abs(sinR) * 0.15;
      const pen = Math.max(fRF + MIN_ROAD_CLEAR - (base - env.engR.frontZ * sinP), fRB + MIN_ROAD_CLEAR - (base - env.engR.backZ * sinP));
      if (pen > 0) {
        const lift = Math.min(pen, Math.max(0, 1.95 - yB));
        yB += lift; if (vB < 0) vB *= 0.15;
        if (pen > lift) { p.pos.y += pen - lift; p.vel.y = Math.max(p.vel.y, slopeVy); p.grounded = true; p.air = 0; }
      }
    }
  }
  p.engYL = Math.max(-1.1, Math.min(1.95, yA));
  p.engYR = Math.max(-1.1, Math.min(1.95, yB));
  p.engVL = vA; p.engVR = vB;
  // Session 17 – cockpit pendulum (visual only): the cockpit hangs on its cables. It swings outward in turns and slides, lags back
  // under thrust and surges forward when braking, bounces on landings and rough ground. Under-damped springs, clamped travel.
  {
    const acc = (vf - (p.ckPv ?? vf)) / dt; p.ckPv = vf;
    const tx = Math.max(-1.7, Math.min(1.7, p.yawRate * Math.max(0, vf) * 0.011 + vr * 0.035));   // local +x = outside of a right turn
    const tz = Math.max(-1.2, Math.min(0.9, -acc * 0.03));
    const w = p.zeroG ? 2.6 : 5.2, zx = 0.3, wz = p.zeroG ? 3 : 6.2;
    let x = p.ckX ?? 0, y = p.ckY ?? 0, z = p.ckZ ?? 0, vx = p.ckVX ?? 0, vy = p.ckVY ?? 0, vz = p.ckVZ ?? 0;
    vx += ((tx - x) * w * w - vx * 2 * zx * w) * dt; x += vx * dt;
    vz += ((tz - z) * wz * wz - vz * 2 * 0.45 * wz) * dt; z += vz * dt;
    if (landImpulse > 0) vy -= Math.min(6, landImpulse * 0.2);
    vy += ((p.grounded ? Math.sin(time * 9 + p.id) * 0.03 * Math.min(1, sp / 60) : 0) - y) * 64 * dt - vy * 2 * 0.38 * 8 * dt; y += vy * dt;
    p.ckX = Math.max(-1.9, Math.min(1.9, x)); p.ckY = Math.max(-0.35, Math.min(0.8, y)); p.ckZ = Math.max(-1.3, Math.min(1.0, z));
    p.ckVX = vx; p.ckVY = vy; p.ckVZ = vz;
  }
  // Tunnel vaults (matches the wide-shouldered tunnel & chamber vault geometry Wd = hw + 3.4 + caveW) – last in the step: the pose the
  // model will be drawn in is final (pitch, roll, engine travel, cockpit sway). Session 20: no part of the pod may reach into the
  // shell. Tested: every corner of the pod's hull against the vault above THAT corner (`vaultOver`) – the nose of a pod that flies
  // up into the roof is metres above its centre, the outer engine on the flank is under a lower part of the vault than the cockpit,
  // and each pod has its own height (one height for all of them left the tall ones up to 3.5 m inside the vault).
  // Only a pod in the AIR: one that rides on its repulsors is never touched by the vault – upright it is metres below it everywhere
  // (unit check), and on knife-edge right beside a wall, where its upper wing tip stands in the vault's flank, pressing it down
  // would fight the ground clamp.
  if (S.roof > 0 && !fr.gap && !p.upper && !p.grounded) {
    const over = vaultOver(td, path, p.idx, HULL_PTS, hullWorld(p, env0));
    if (over > 0) {
      const imp = Math.max(0, p.vel.y); p.pos.y -= Math.min(over, 45 * dt); if (p.vel.y > 0) p.vel.y *= -0.3; // pressed down quickly, never teleported
      if (imp > 6 && p.invuln <= 0) { const dmg = Math.min(20, (imp - 6) * 0.8 * P.sturdy); applyDamage(p, 0, dmg, 'top'); p.shake = Math.min(1, p.shake + 0.3); p.events.push({ type: 'wall', strength: imp, x: p.pos.x, y: p.pos.y + 1, z: p.pos.z, nx: 0, nz: 0 }); }
    }
  }
  p.shake *= Math.exp(-dt * 3);
}

/** `floating`: a boulder in a zero-G tube – `o.y` is its centre, the pod hits it only at its own height */
function collideObstacle(p: PodState, o: Obstacle, sturdy: number, floating = false) {
  const height = o.kind === 1 || o.kind === 4 ? 9 : o.r * 1.6;
  if (floating ? Math.abs(p.pos.y - o.y) > o.r + 1.8 : p.pos.y > o.y + height + 1.5) return;
  const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw); const rollW = Math.max(0.22, Math.abs(Math.cos((p.rollCtl ?? 0) * Math.PI / 2)));
  for (const c of C) {
    const cxr = c.x * rollW; const wx = p.pos.x + cxr * cy + c.z * sy, wz = p.pos.z - cxr * sy + c.z * cy;
    const dx = wx - o.x, dz = wz - o.z; const d = Math.hypot(dx, dz); const R = o.r + c.r;
    if (d >= R || d < 1e-3) continue;
    const nx = dx / d, nz = dz / d;
    const vn = p.vel.x * nx + p.vel.z * nz;
    // Session 14: small rocks and cargo crates shatter when hit at speed – the pod ploughs through and pays with a little hull damage
    if (o.breakable && vn < -5 && Math.hypot(p.vel.x, p.vel.z) > 38) {
      if (p.invuln <= 0) { const dmg = (4 + o.r * 2.6) * sturdy * (p.isPlayer ? 1 : 0.6); applyDamage(p, c.side, dmg, hitZone(p, nx, nz)); }
      p.vel.x *= 0.93; p.vel.z *= 0.93; p.shake = Math.min(1, p.shake + 0.35);
      p.events.push({ type: 'break', strength: o.r, x: o.x, y: o.y, z: o.z, nx, nz, ref: o });
      o.broken = true; o.x = 1e9; o.z = 1e9; o.lat = 1e6; // moved out of the world: every other system (AI lanes, collisions) ignores it from now on
      return;
    }
    p.pos.x += nx * (R - d); p.pos.z += nz * (R - d);
    if (vn < 0) {
      p.vel.x -= nx * vn * 1.5; p.vel.z -= nz * vn * 1.5;
      if (vn < -4) { const sc = Math.max(0.6, 1 + vn * 0.004); p.vel.x *= sc; p.vel.z *= sc; }
      const pc = p as unknown as { obCd?: number };
      if (p.invuln <= 0 && !(pc.obCd! > 0)) {
        pc.obCd = 0.35;
        const dmg = Math.min(38, Math.max(0, -vn - 6) * 0.9 * sturdy) * (p.isPlayer ? 1 : 0.45);
        applyDamage(p, c.side, dmg, hitZone(p, nx, nz));
        p.shake = Math.min(1, p.shake + 0.5);
        p.events.push({ type: 'obstacle', strength: -vn, x: o.x + nx * o.r, y: p.pos.y, z: o.z + nz * o.r, nx, nz });
      }
    }
    return;
  }
}

function collideSetPieces(p: PodState, td: TrackData, time: number, sturdy: number) {
  const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const hurt = (dmg: number, side: number, x: number, z: number, nx: number, nz: number, strength: number, zone?: DamageZone) => {
    if (p.invuln > 0) return;
    const hp = p as unknown as { spHit?: number }; if (time - (hp.spHit ?? -9) < 0.7) return; hp.spHit = time;
    if (!p.isPlayer) dmg *= 0.45;
    applyDamage(p, side, dmg, zone ?? hitZone(p, nx, nz));
    p.shake = Math.min(1, p.shake + 0.45); p.events.push({ type: 'obstacle', strength, x, y: p.pos.y, z, nx, nz });
  };
  for (const sp of td.setPieces) {
    const dxc = p.pos.x - sp.x, dzc = p.pos.z - sp.z; const reach = sp.type === 'rotor' ? sp.armLen + 14 : sp.hw + 40;
    if (dxc * dxc + dzc * dzc > reach * reach) continue;
    if (sp.type === 'rotor') {
      if (p.pos.y > sp.y + 5) continue;
      const a0 = rotorAngle(sp, time);
      for (const c of C) {
        const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy;
        for (let k = 0; k < sp.arms; k++) {
          const a = a0 + (k / sp.arms) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
          const t = Math.max(1.8, Math.min(sp.armLen, (wx - sp.x) * ux + (wz - sp.z) * uz));
          const qx = sp.x + ux * t, qz = sp.z + uz * t; let nx = wx - qx, nz = wz - qz; const d = Math.hypot(nx, nz), R = c.r + 0.8;
          if (d >= R) continue;
          if (d < 1e-3) { nx = -uz; nz = ux; } else { nx /= d; nz /= d; }
          p.pos.x += nx * (R - d); p.pos.z += nz * (R - d);
          const vax = -uz * sp.speed * t, vaz = ux * sp.speed * t;
          const vn = (p.vel.x - vax) * nx + (p.vel.z - vaz) * nz;
          if (vn < 0) { p.vel.x -= nx * vn * 1.7; p.vel.z -= nz * vn * 1.7; if (vn < -5) hurt(Math.min(16, (-vn - 5) * 0.6 * sturdy), c.side, qx, qz, nx, nz, -vn); }
        }
      }
    } else if (sp.type === 'gate') {
      const s = td.main.samples[sp.idx]; const w3 = (2 * sp.hw) / 3;
      const sgn = ((p.pos.x - sp.x) * s.tx + (p.pos.z - sp.z) * s.tz) >= 0 ? 1 : -1;
      for (const c of C) {
        const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy;
        const along = (wx - sp.x) * s.tx + (wz - sp.z) * s.tz; const pen = c.r + 0.55 - along * sgn;
        if (pen <= 0 || pen > c.r * 2 + 3) continue;
        const lat = (wx - sp.x) * s.rx + (wz - sp.z) * s.rz; const gy = sp.y - Math.max(-sp.hw, Math.min(sp.hw, lat)) * s.bank; let blocked = false;
        for (let k = 0; k < 3; k++) { const l0 = -sp.hw + k * w3; if (lat + c.r < l0 || lat - c.r > l0 + w3) continue; if (gy + 0.2 + (1 - gateDrop(sp, k, time)) * 12.6 < p.pos.y + 1.1) blocked = true; }
        if (!blocked) continue;
        const nx = s.tx * sgn, nz = s.tz * sgn; p.pos.x += nx * pen; p.pos.z += nz * pen;
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn < 0) { p.vel.x -= nx * vn * 1.5; p.vel.z -= nz * vn * 1.5; if (vn < -5) hurt(Math.min(24, (-vn - 5) * 0.8 * sturdy), c.side, wx, wz, nx, nz, -vn); }
        break;
      }
    } else if (sp.type === 'boulder') {
      const bs = boulderState(sp, time); if (!bs.active) continue;
      const s = td.main.samples[sp.idx]; const br = sp.armLen;
      const gy = s.y - Math.max(-sp.hw, Math.min(sp.hw, bs.lat)) * s.bank;
      const by = gy + br * 0.85 + bs.hop;
      if (Math.abs(p.pos.y - by) > br + 1.4) continue; // pod can slip under a high bounce or leap over!
      const bx = s.x + s.rx * bs.lat, bz = s.z + s.rz * bs.lat;
      for (const c of C) {
        const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy;
        const dx = wx - bx, dz = wz - bz, d = Math.hypot(dx, dz), R = br + c.r;
        if (d >= R || d < 1e-3) continue;
        const nx = dx / d, nz = dz / d;
        p.pos.x += nx * (R - d); p.pos.z += nz * (R - d);
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn < 0) { p.vel.x -= nx * vn * 1.5; p.vel.z -= nz * vn * 1.5; }
        hurt(Math.min(22, (Math.max(0, -vn) + 8) * 0.7 * sturdy), c.side, bx, bz, nx, nz, Math.max(12, -vn));
        break;
      }
    } else if (sp.type === 'bridge') {
      if (p.pos.y > sp.y + 4.8) continue;
      const sw = bridgeSwing(sp, time); if (sw < 0.08) continue;
      const s = td.main.samples[sp.idx]; const phi = (1 - sw) * (Math.PI * 0.48);
      const cp = Math.cos(phi), spSin = Math.sin(phi);
      for (const sd of [-1, 1]) {
        const px = s.x + s.rx * sd * (sp.hw + 1.4), pz = s.z + s.rz * sd * (sp.hw + 1.4);
        const ux = -sd * s.rx * cp + s.tx * spSin, uz = -sd * s.rz * cp + s.tz * spSin;
        for (const c of C) {
          const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy;
          const t = Math.max(1.2, Math.min(sp.armLen + 1.2, (wx - px) * ux + (wz - pz) * uz));
          const qx = px + ux * t, qz = pz + uz * t; let nx = wx - qx, nz = wz - qz; const d = Math.hypot(nx, nz), R = c.r + 0.75;
          if (d >= R) continue;
          if (d < 1e-3) { nx = s.tx; nz = s.tz; } else { nx /= d; nz /= d; }
          p.pos.x += nx * (R - d); p.pos.z += nz * (R - d);
          const vn = p.vel.x * nx + p.vel.z * nz;
          if (vn < 0) { p.vel.x -= nx * vn * 1.55; p.vel.z -= nz * vn * 1.55; if (vn < -5) hurt(Math.min(18, (-vn - 5) * 0.65 * sturdy), c.side, qx, qz, nx, nz, -vn); }
        }
      }
    } else if (sp.state === 1) {
      for (const r of sp.rocks) {
        if (r.landed || (r.hits & (1 << p.id)) || Math.abs(p.pos.y - r.y) > r.r + 1.5) continue;
        for (const c of C) {
          const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy; const dx = wx - r.x, dz = wz - r.z, d = Math.hypot(dx, dz);
          if (d > r.r + c.r) continue;
          r.hits |= 1 << p.id; const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
          p.vel.x += nx * 8; p.vel.z += nz * 8; p.vel.y -= 6; hurt(22 * sturdy, c.side, r.x, r.z, nx, nz, 30, 'top'); break; // falling rock: comes from above
        }
      }
    }
  }
}

export function kill(p: PodState, t: number, explode: boolean) {
  p.dead = t; p.vel.set(0, 0, 0); p.boosting = false;
  if (explode) { p.hpL = 0; p.hpR = 0; }
}

// ---- Reset key (2026-11-23, user request: a key that puts the pod back on the track) ----
/** A manual reset takes the pod off the track for this long; the key then rests for the cooldown (seconds). */
export const RESET_WAIT = 0.8, RESET_COOLDOWN = 3;
/** The player asks to be put back on the track. The pod is taken off for `RESET_WAIT` seconds, then `respawn` puts it at its last
 *  safe place – centred, along the track, rolling at 35 m/s, protected for 2.2 s. Unlike a crash respawn it repairs nothing: hull,
 *  lost parts and engine heat stay as they are, and the wait costs more than flying on – a reset is never a shortcut. Returns false
 *  when it is not possible right now (the pod is already off the track, has finished, or the key is resting). */
export function manualReset(p: PodState): boolean {
  if (p.dead > 0 || p.finished || (p.resetCd ?? 0) > 0) return false;
  kill(p, RESET_WAIT, false); p.manualReset = true; p.resetCd = RESET_WAIT + RESET_COOLDOWN;
  return true;
}
/** Every frame, for every pod: counts down the time a pod is off the track (crash, fall, manual reset) and the rest of the reset key,
 *  and puts the pod back when the time is up. Returns 'patched' in the frame a crashed pod comes back (repaired), 'reset' after a
 *  manual reset, otherwise ''. */
export function tickRespawn(p: PodState, td: TrackData, dt: number): '' | 'patched' | 'reset' {
  if ((p.resetCd ?? 0) > 0) p.resetCd = Math.max(0, p.resetCd! - dt);
  if (p.dead <= 0) return '';
  p.dead -= dt; if (p.dead > 0) return '';
  const manual = !!p.manualReset; respawn(p, td);
  return manual ? 'reset' : 'patched';
}

export function respawn(p: PodState, td: TrackData) {
  const keep = !!p.manualReset; p.manualReset = false; // (a manual reset moves the pod and nothing else)
  const path = td.paths[p.lastSafePath] ?? td.main;
  let idx = p.lastSafeIdx;
  const n = path.samples.length;
  for (let k = 0; k < 200; k++) {
    const j = path.closed ? (idx + k) % n : Math.min(n - 1, idx + k);
    const s = path.samples[j];
    if (!s.gap && s.ramp === 0 && k > 3) { idx = j; break; }
  }
  const s = path.samples[idx];
  p.path = path.id; p.idx = idx;
  p.pos.set(s.x, s.y + HOVER + 1.2, s.z); p.yaw = Math.atan2(s.tx, s.tz); p.yawRate = 0; p.steer = 0;
  p.engYL = 0; p.engYR = 0; p.engVL = 0; p.engVR = 0; p.engPL = 0; p.engPR = 0;
  p.upper = false; p.inRoof = false; p.ckX = 0; p.ckY = 0; p.ckZ = 0; p.ckVX = 0; p.ckVY = 0; p.ckVZ = 0;
  p.vel.set(s.tx * 35, 0, s.tz * 35);
  if (!keep) {
    p.hpL = Math.max(p.hpL, 55); p.hpR = Math.max(p.hpR, 55); p.heat = 0; p.overheat = false; p.overT = 0;
    p.parts = 0; p.fx = undefined; // every Bruchteil is back (ADR 0001: parts return only here)
  }
  p.dead = 0; p.invuln = 2.2; p.grounded = false; p.groundY = s.y; p.prevGroundY = s.y;
}

// ===================== MULTI-OBSTACLE CORRIDOR AI + ROTOR/SET-PIECE TIMING =====================
interface Hazard2D { ahead: number; lat: number; r: number; weight: number }

/** Exact minimum distance between a pod passing sample `s` at `lat` (at time `eta`) and a spinning rotor's arms */
function rotorArmClearance(sp: SetPiece, s: { tx: number; tz: number; rx: number; rz: number }, lat: number, eta: number, spd: number): number {
  let minD = 1e9;
  const relLat = lat - sp.lat;
  for (let ti = -2; ti <= 2; ti++) {
    const dt = ti * 0.16, along = dt * spd;
    const dx = s.tx * along + s.rx * relLat, dz = s.tz * along + s.rz * relLat;
    const a0 = rotorAngle(sp, eta + dt);
    for (let k = 0; k < sp.arms; k++) {
      const a = a0 + (k / sp.arms) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
      const t = Math.max(1.8, Math.min(sp.armLen, dx * ux + dz * uz));
      const d = Math.hypot(dx - ux * t, dz - uz * t);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

export function aiInputs(p: PodState, td: TrackData, pods: PodState[], time: number, player: PodState | null) {
  const ai = p.ai!; const P = podParams(p);
  const adt = Math.min(0.1, Math.max(0, time - (ai.lastT ?? time))); ai.lastT = time;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed < 8 && time > 3 && !p.finished && p.dead <= 0) ai.stuck = (ai.stuck ?? 0) + adt; else ai.stuck = 0;
  if ((ai.stuck ?? 0) > 2.5) {
    ai.stuck = 0; const n0 = td.paths[p.path].samples.length;
    p.lastSafeIdx = td.paths[p.path].closed ? (p.idx + 25) % n0 : Math.min(n0 - 3, p.idx + 25);
    p.lastSafePath = p.path; respawn(p, td); return;
  }

  const path = td.paths[p.path]; const S = path.samples; const n = S.length;
  const at = (k: number) => S[path.closed ? ((p.idx + k) % n + n) % n : Math.max(0, Math.min(n - 1, p.idx + k))];
  const aheadOf = (idx: number) => {
    let d = idx - p.idx;
    if (path.closed) { if (d < -n / 2) d += n; if (d > n / 2) d -= n; }
    return d;
  };
  const estSpd = Math.max(32, speed);
  const look = Math.round((14 + speed * 0.38) / 2);
  const t = at(look);

  // 1. Ideal racing line (apex anticipation + individual pilot offset)
  let cAvg = 0; for (let k = 10; k < 60; k += 5) cAvg += at(k).curv; cAvg /= 10;
  // (The line follows the DESIGNED road: a bay (`Sample.bay`, 2026-11-23) is room to the side, not a reason to swing out – measured
  //  with the full `hw` the rivals wove into every bay, up to 10 m sideways within 120 m. Evading and overtaking use the bay: `safeLim`.)
  const lineHw = t.hw - (t.bay ?? 0);
  let idealLat = -Math.sign(cAvg) * Math.min(0.58, Math.abs(cAvg) * 34) * lineHw * ai.skill + ai.lineOff * lineHw * 0.32;
  idealLat += Math.sin(time * 0.4 + ai.noiseT) * (1 - ai.skill) * lineHw * 0.3;

  // 2026-11-23 – 3D snow: fresh powder costs 14 % of the top speed, a trench nothing. A rival takes a trench that lies in reach of
  // where it is – one near its racing line rather than one far from it (snowField.trenchNear). No trench: it ploughs its own line.
  if (td.snow) {
    const li = path.closed ? ((p.idx + look) % n + n) % n : Math.max(0, Math.min(n - 1, p.idx + look));
    const tr = td.snow.trenchNear(p.path, li, p.lat, P.width, Math.max(2, t.hw - P.width - 1.5), idealLat); // (a trench may lie in a bay)
    // The aiming point lies `look` samples ahead: in a bend the pod settles a few metres inside the line it aims at – half out of
    // the trench. `trI` shifts the aim by the lateral error that stays (slowly: it must not fight the steering itself).
    // (Only once the pod is nearly there: on the way over from another line the error is large and would wind the shift up.)
    if (tr) { const err = tr.lat - p.lat; if (Math.abs(err) < 3) ai.trI = Math.max(-6, Math.min(6, (ai.trI ?? 0) + err * adt * 0.9)); idealLat = tr.lat + (ai.trI ?? 0); }
    else if (ai.trI) ai.trI *= Math.exp(-adt * 2);
  }

  // Shortcut & branching-cave entry commitment (only at branch ENTRANCE, never at its exit merge!)
  let enteringShortcut = false, entrySide = 0, entryNear = false;
  if (p.path === 0 && ai.takeShortcut) {
    for (let k = 0; k < 68; k += 2) {
      const idx2 = path.closed ? ((p.idx + k) % n + n) % n : Math.min(n - 1, p.idx + k);
      const s2 = S[idx2];
      if ((s2.openL || s2.openR) && s2.link > 0) {
        const br = td.paths[s2.link];
        const dEnt = Math.abs(idx2 - br.mainFrom), dEntC = path.closed ? Math.min(dEnt, n - dEnt) : dEnt;
        if (br && dEntC < 52) {
          entrySide = s2.openR ? 1 : -1; entryNear = k < 18;
          idealLat = entrySide * (entryNear ? s2.hw + 6 : t.hw - 2.0);
          enteringShortcut = true;
          break;
        }
      }
    }
  }

  // 2. Gather ALL obstacles, erupting geysers, dynamic set pieces & rival pods in sight window [-2 .. +66]
  const obs: Hazard2D[] = [];
  const nearRotors: { sp: SetPiece; ahead: number; eta: number; s: typeof t }[] = [];
  const nearGates: { sp: SetPiece; ahead: number; closed: [boolean, boolean, boolean] }[] = [];
  const nearBridges: { sp: SetPiece; ahead: number; innerBlock: number }[] = [];

  const buckets = td.obstaclesByPath[p.path];
  const bStart = Math.floor(p.idx / 10), nBuckets = Math.ceil(n / 10);
  for (let bb = bStart - 1; bb <= bStart + 7; bb++) {
    const key = path.closed ? ((bb % nBuckets) + nBuckets) % nBuckets : bb;
    const list = buckets.get(key); if (!list) continue;
    for (const o of list) {
      const ah = aheadOf(o.idx);
      if (ah < -2 || ah > 66) continue;
      if (o.hz !== undefined) {
        const h = td.hazards[o.hz]; const eta = time + (ah * 2) / estSpd;
        const ph = (((eta + h.phase) % h.period) + h.period) % h.period;
        if (ph > h.period * h.duty + 0.65 && ph < h.period - 2.1) continue;
        obs.push({ ahead: Math.max(1, ah), lat: o.lat, r: o.r + P.width + 1.6, weight: 0.85 });
      } else if (o.kind !== 3) {
        obs.push({ ahead: Math.max(1, ah), lat: o.lat, r: o.r + P.width + 2.2, weight: 1.0 });
      }
    }
  }

  // 2026-11-23 – boulders drifting in a zero-G tube: where each will be when the pod gets there. One that will be well above or below
  // the pod's height (rivals fly on the axis) is no obstacle.
  if (p.path === 0 && td.zgRocks.length && (p.zeroG || t.zeroG)) {
    const hPod = p.zeroG ? p.pos.y - (p.groundY + ZG_AXIS) : 0;
    for (const k of td.zgRocks) {
      const ah = aheadOf(k.idx); if (ah < -2 || ah > 80) continue;
      const q = zgRockAt(td, k, time + (Math.max(0, ah) * 2) / estSpd);
      if (Math.abs(q.h - hPod * Math.max(0, 1 - ah / 40)) > k.r + 3.4) continue; // (far ahead the pod will be back on the axis)
      obs.push({ ahead: Math.max(1, ah), lat: q.lat, r: k.r + P.width + 2.6, weight: 1.1 });
    }
  }
  if (p.path === 0) {
    for (const sp of td.setPieces) {
      const ah = aheadOf(sp.idx);
      if (ah < -2 || ah > 82) continue;
      const eta = time + (Math.max(0, ah) * 2) / estSpd;
      if (sp.type === 'rotor') {
        nearRotors.push({ sp, ahead: Math.max(1, ah), eta, s: S[sp.idx] });
      } else if (sp.type === 'gate') {
        const closed: [boolean, boolean, boolean] = [false, false, false];
        for (let k = 0; k < 3; k++) closed[k] = Math.max(gateDrop(sp, k, eta - 0.5), gateDrop(sp, k, eta), gateDrop(sp, k, eta + 0.5)) > 0.14;
        nearGates.push({ sp, ahead: Math.max(1, ah), closed });
      } else if (sp.type === 'boulder') {
        // Sample boulder across arrival uncertainty window so AI passes cleanly behind or ahead of it!
        for (const dt of [-0.32, 0, 0.32]) {
          const bs = boulderState(sp, eta + dt);
          if (bs.active && bs.hop < 4.5 && Math.abs(bs.lat) < sp.hw + 3) {
            obs.push({ ahead: Math.max(1, ah), lat: bs.lat, r: sp.armLen + P.width + 2.6, weight: 1.1 });
          }
        }
      } else if (sp.type === 'bridge') {
        const sw = Math.max(bridgeSwing(sp, eta - 0.35), bridgeSwing(sp, eta), bridgeSwing(sp, eta + 0.35));
        if (sw > 0.18) nearBridges.push({ sp, ahead: Math.max(1, ah), innerBlock: sp.hw + 0.2 - sp.armLen * sw });
      } else if (sp.state === 1) {
        for (const r of sp.rocks) {
          if (r.landed) continue;
          const sSp = S[sp.idx]; const rLat = (r.x - sSp.x) * sSp.rx + (r.z - sSp.z) * sSp.rz;
          obs.push({ ahead: Math.max(1, ah), lat: rLat, r: r.r + P.width + 2.4, weight: 0.9 });
        }
      }
    }
  }

  // Session 16 – start discipline: for the first seconds every rival holds its own grid lane and only then merges onto the racing line
  // (they used to dive for the ideal line at once and drove into each other). A pod right behind another one lifts instead of ramming it.
  if (ai.gridLat !== undefined && time < 7.5) { const h = Math.max(0, Math.min(1, (7 - time) / 3)); idealLat = idealLat * (1 - h) + ai.gridLat * h; }
  let startBlock = false;
  // Rival pods: gentle overtaking repulsion (and optional aggressive ramming on open road)
  let ramTarget: number | null = null;
  for (const q of pods) {
    if (q === p || q.dead > 0 || q.path !== p.path) continue;
    const ah = aheadOf(q.idx);
    if (ah > 0 && ah < 16 && !(time < 4.5 && ai.gridLat !== undefined)) obs.push({ ahead: Math.max(2, ah), lat: q.lat, r: P.width * 1.85 + 1.2, weight: 0.32 }); // (on the grid nobody swerves – they hold their lanes)
    if (time < 7.5 && ai.gridLat !== undefined && ah > 0 && ah < 9 && Math.abs(q.lat - p.lat) < P.width * 1.9 && Math.hypot(p.vel.x, p.vel.z) > Math.hypot(q.vel.x, q.vel.z) - 1) startBlock = true;
    if (q === player && Math.abs(ah) < 4 && !obs.length && p.pilot.aggression > 0.75 && Math.sin(time * 0.7 + ai.noiseT) > 0.6) ramTarget = q.lat;
  }
  if (ramTarget !== null && !enteringShortcut) idealLat = ramTarget;

  // 3. Evaluate lateral corridor cost field simultaneously over all obstacles + timed set pieces!
  const s0 = S[p.idx];
  // Compute tightest wall limit over the lookahead corridor so AI never clips narrowing gorge walls
  let wallMin = Math.min(t.wallL, t.wallR);
  for (let k = 4; k <= Math.min(look + 8, 44); k += 6) {
    const sk = at(k); if (!sk.openL && !sk.openR) wallMin = Math.min(wallMin, sk.wallL, sk.wallR);
  }
  const safeLim = Math.max(2, wallMin - P.width - 1.35);
  const limL = enteringShortcut && entryNear && entrySide < 0 ? s0.hw + 7 : safeLim;
  const limR = enteringShortcut && entryNear && entrySide > 0 ? s0.hw + 7 : safeLim;
  let lat = Math.max(-limL, Math.min(limR, idealLat));
  let denseField = false;

  const hasHazards = obs.length > 0 || nearRotors.length > 0 || nearGates.length > 0 || nearBridges.length > 0;
  if (!enteringShortcut && hasHazards) {
    const prevLat = ai.prevLat ?? p.lat;
    const horizon = Math.max(14, look * 1.15);
    const evalCost = (cLat: number) => {
      // Base cost: gentle pull toward racing line + smooth frame-to-frame hysteresis (eliminates ping-pong!) + wall buffer
      let cost = Math.abs(cLat - idealLat) * 0.42 + Math.abs(cLat - prevLat) * 0.55 + Math.abs(cLat - p.lat) * 0.22;
      const wallMargin = safeLim - Math.abs(cLat);
      if (wallMargin < 2.2) cost += (2.2 - wallMargin) ** 2 * 4.5;

      // Trajectory sweep from (0, p.lat) -> (horizon, cLat) against EVERY obstacle simultaneously
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        const f = Math.min(1, o.ahead / horizon);
        const eLat = p.lat + (cLat - p.lat) * f;
        // Check both interpolated chord position AND destination lane for near-mid obstacles
        const dChord = Math.abs(eLat - o.lat);
        const dLane = o.ahead < horizon * 1.4 ? Math.abs(cLat - o.lat) : 1e9;
        const d = Math.min(dChord, dLane * 0.92 + dChord * 0.08);
        const urgency = (1 + 28 / (o.ahead + 4)) * o.weight;
        if (d < o.r) cost += (220 + (o.r - d) * 140) * urgency;
        else if (d < o.r + 3.4) { const m = (o.r + 3.4 - d) / 3.4; cost += m * m * 24 * urgency; }
      }

      // Exact rotor-blade timing (TODO §3.2): reads live angular velocity & threads open gap or bypass lane!
      for (const nr of nearRotors) {
        const f = Math.min(1, nr.ahead / Math.max(horizon, 24));
        const eLat = nr.ahead < 28 ? p.lat + (cLat - p.lat) * f : cLat;
        const armD = rotorArmClearance(nr.sp, nr.s, eLat, nr.eta, estSpd);
        const need = P.width + 1.9;
        const urg = 1 + 24 / (nr.ahead + 5);
        if (armD < need) cost += (190 + (need - armD) * 110) * urg;
        else if (armD < need + 2.5) cost += ((need + 2.5 - armD) ** 2) * 8 * urg;
      }

      // Portcullis gate section timing
      for (const ng of nearGates) {
        const w3 = (2 * ng.sp.hw) / 3;
        const sec = Math.max(0, Math.min(2, Math.floor((cLat + ng.sp.hw) / w3)));
        const secCenter = -ng.sp.hw + (sec + 0.5) * w3;
        if (ng.closed[sec]) cost += 650 * (1 + 20 / (ng.ahead + 6));
        else {
          // Avoid guide pillars between sections when adjacent section is dropping
          const pillarClear = w3 * 0.5 - Math.abs(cLat - secCenter);
          if (pillarClear < P.width + 1.0) cost += (P.width + 1.0 - pillarClear) * 55;
        }
      }

      // Swinging twin boom-bridge timing: funnel crisply through central open channel when closing!
      for (const nb of nearBridges) {
        const maxSafe = Math.max(1.5, nb.innerBlock - P.width - 1.3);
        if (Math.abs(cLat) > maxSafe) cost += (260 + (Math.abs(cLat) - maxSafe) * 95) * (1 + 22 / (nb.ahead + 6));
      }
      return cost;
    };

    const STEPS = 26;
    let bestLat = lat, bestCost = evalCost(lat);
    // Also test staying steady on previous target & current lane
    for (const extra of [Math.max(-safeLim, Math.min(safeLim, prevLat)), Math.max(-safeLim, Math.min(safeLim, p.lat))]) {
      const c = evalCost(extra); if (c < bestCost) { bestCost = c; bestLat = extra; }
    }
    for (let i = 0; i <= STEPS; i++) {
      const cand = -safeLim + (2 * safeLim * i) / STEPS;
      const c = evalCost(cand);
      if (c < bestCost) { bestCost = c; bestLat = cand; }
    }
    // Local golden-ish refinement around winning lane (±1 step) for silky precision
    const stepW = (2 * safeLim) / STEPS;
    for (const off of [-0.6, -0.3, 0.3, 0.6]) {
      const cand = Math.max(-safeLim, Math.min(safeLim, bestLat + off * stepW));
      const c = evalCost(cand); if (c < bestCost) { bestCost = c; bestLat = cand; }
    }
    lat = bestLat;
    denseField = bestCost > 38 || Math.abs(lat - p.lat) > 5.5;
  }

  ai.prevLat = lat;
  const lim = enteringShortcut && (s0.openL || s0.openR) ? t.hw + 10 : Math.min(t.wallL, t.wallR) - P.width - 0.7;
  lat = Math.max(-lim, Math.min(lim, lat));

  // Shorter, snappier aiming point when dodging a close obstacle in a dense field
  const aimLook = denseField ? Math.max(8, Math.round(look * 0.72)) : look;
  const aimS = at(aimLook);
  const aimLim = enteringShortcut ? aimS.hw + 10 : Math.min(aimS.wallL, aimS.wallR) - P.width - 0.7;
  const aimLat = Math.max(-aimLim, Math.min(aimLim, lat));
  const tx = aimS.x + aimS.rx * aimLat, tz = aimS.z + aimS.rz * aimLat;
  const desired = Math.atan2(tx - p.pos.x, tz - p.pos.z);
  const diff = wrapAngle(desired - p.yaw);
  let steer = Math.max(-1, Math.min(1, -diff * (denseField ? 4.0 : 3.4) + p.yawRate * 0.16));
  if (Math.abs(steer) < 0.02) steer = 0;
  // zero-G (2026-11-23): steering does not turn the pod there, it pushes it off the axis – full lock = `zeroGReach().side` metres.
  // So the stick position IS the lateral position the rival wants.
  if (p.zeroG) steer = Math.max(-1, Math.min(1, lat / zeroGReach(td, p, P.width).side));

  // 4. Speed, boost & repair control (eases throttle slightly through tight boulder/rock slaloms)
  let vlim = 999, rampAhead = false;
  for (let k = 0; k < 90; k += 3) { const s2 = at(k); vlim = Math.min(vlim, s2.vmax); if (s2.ramp > 0 || s2.gap) rampAhead = true; }
  if (denseField && !rampAhead) vlim = Math.min(vlim, 118 + ai.skill * 18);
  const turnF = (P.turn / 1.6) * (0.85 + 0.3 * ai.skill);
  const vTarget = rampAhead ? 999 : vlim * turnF * (1 + (P.abTurn - 1.5) * 0.3);
  let throttle = 1, brake = 0, airbrake = false;
  if (speed > vTarget + 4) throttle = 0;
  if (speed > vTarget + 14) airbrake = true;
  if (speed > vTarget + 40) brake = 0.6;
  if (startBlock) throttle = Math.min(throttle, 0.3);

  let boost = false;
  if (!denseField && time < ai.boostUntil && p.heat < 0.6 + ai.skill * 0.3) boost = true;
  else if (!denseField && (vlim > 160 || rampAhead) && speed > 50 && p.heat < 0.35 && Math.random() < dtChance(ai.skill)) ai.boostUntil = time + 1.5 + ai.skill * 2.5;

  const hp = Math.min(p.hpL, p.hpR);
  if (hp < 38) ai.repairMode = true; if (hp > 78) ai.repairMode = false;

  if (player) {
    const gap = (player.prog - p.prog) * 2;
    ai.rubber = 1 + Math.max(-0.05, Math.min(0.06, gap / 6000));
  }
  // Session 10 – AI uses the new controls: glide across gaps, dive back to the road, knife-edge past close obstacles, brake-assisted slides
  let pitchIn = 0, rollIn = 0;
  if (!p.grounded && !p.zeroG) {
    let gapNear = at(0).gap; for (let k = 3; k < 30 && !gapNear; k += 3) if (at(k).gap) gapNear = true;
    if (gapNear) pitchIn = p.vel.y < 8 ? 0.6 + 0.4 * ai.skill : 0;
    else {
      // Session 13 fix: the AI used to hold "dive" on every crest and for the whole second half of every jump. Now it is a rare,
      // deliberate manoeuvre: only good pilots, only on ~30 % of the big jumps (> 9 m above the road, descending, airborne ≥ 0.9 s),
      // released 4 m above the road, at most once every 6 s, and never at full deflection.
      const h = p.pos.y - (p.groundY + HOVER);
      if (ai.dive) { if (h < 4) { ai.dive = false; ai.diveT = time + 6; } }
      else if (p.air < 0.1) ai.diveRoll = Math.random();               // decided once per take-off: most jumps are simply flown out
      else if (ai.skill > 0.62 && (ai.diveRoll ?? 1) < 0.22 && p.air > 0.9 && h > 9 && p.vel.y < -2 && time > (ai.diveT ?? 0)) ai.dive = true;
      if (ai.dive) pitchIn = -Math.min(0.6, 0.25 + 0.3 * ai.skill);
    }
  } else if ((ai.dive ? ((ai.dive = false), (ai.diveT = time + 6), false) : false) || (ai.skill > 0.55 && speed > 45 && !p.zeroG)) {
    const bk = td.obstaclesByPath[p.path], b0 = Math.floor(p.idx / 10);
    for (let bb = b0; bb <= b0 + 4 && !rollIn; bb++) {
      const l = bk.get(bb); if (!l) continue;
      for (const o of l) {
        if (o.kind === 3) continue; const ahead = (o.idx - p.idx) * DS; if (ahead < 1 || ahead > speed * 0.42) continue;
        const dl = Math.abs(o.lat - p.lat); if (dl < P.width + o.r + 0.5 && dl > o.r + 1.2) { rollIn = o.lat > p.lat ? -1 : 1; break; }
      }
    }
  }
  if (airbrake && Math.abs(steer) > 0.25 && speed > vTarget + 22) brake = Math.max(brake, 0.45);
  if (p.finished) { throttle = 0; brake = speed > 25 ? 1 : 0; boost = false; airbrake = speed > 30; pitchIn = 0; rollIn = 0; }
  { // the AI thinks in "turn" and "pitch"; while rolled these go through the rotated controls (inverse of the knife-edge mix in stepPod)
    const k = Math.abs(Math.sin((p.rollCtl ?? 0) * (Math.PI / 2)));
    if (k > 0.02) {
      const g = (p.rollCtl ?? 0) >= 0 ? 1 : -1, det = (1 - k) * (1 - k) + k * k, S = steer, Pd = pitchIn;
      steer = Math.max(-1, Math.min(1, (S * (1 - k) - Pd * g * k) / det)); pitchIn = Math.max(-1, Math.min(1, (Pd * (1 - k) + S * g * k) / det));
    }
  }
  p.input.pitch = pitchIn; p.input.roll = rollIn;
  p.input.steer = steer; p.input.throttle = throttle; p.input.brake = brake; p.input.airbrake = airbrake;
  p.input.boost = boost && !ai.repairMode; p.input.repair = ai.repairMode && !rampAhead;
}
function dtChance(skill: number) { return 0.004 + skill * 0.01; }

/** Pod-vs-pod contact (shared by the game and the node CI sim). Roll-aware: a knife-edge pod is narrow but tall, so it slips through
 *  side-by-side gaps; pods at clearly different heights pass over/under each other. */
export function collidePods(ps: PodState[], time: number) {
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]; if (a.dead > 0 || b.dead > 0 || a.invuln > 0 || b.invuln > 0) continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
    const ka = Math.abs(Math.sin((a.rollCtl ?? 0) * Math.PI / 2)), kb = Math.abs(Math.sin((b.rollCtl ?? 0) * Math.PI / 2));
    if (Math.abs(dy) > 3 + (ka + kb) * 1.8) continue;
    const ra = podCollision(a.def).halfW * 0.8 * Math.max(0.3, 1 - ka * 0.7), rb = podCollision(b.def).halfW * 0.8 * Math.max(0.3, 1 - kb * 0.7); const R = ra + rb; // (cached shape – no per-pair podParams)
    const d2 = dx * dx + dz * dz; if (d2 > R * R || d2 < 1e-6) continue;
    const d = Math.sqrt(d2); const nx = dx / d, nz = dz / d; const pen = R - d;
    a.pos.x -= nx * pen / 2; a.pos.z -= nz * pen / 2; b.pos.x += nx * pen / 2; b.pos.z += nz * pen / 2;
    const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
    if (rv < 0) {
      const jv = -rv * 0.65;
      a.vel.x -= nx * jv; a.vel.z -= nz * jv; b.vel.x += nx * jv; b.vel.z += nz * jv;
      const ac = a as unknown as { pCd?: number }, bc = b as unknown as { pCd?: number };
      const dmg = Math.min(22, Math.max(0, -rv - 5) * 0.85);
      if (dmg > 0 && time - (ac.pCd ?? -1) > 0.2 && time - (bc.pCd ?? -1) > 0.2) {
        ac.pCd = time; bc.pCd = time;
        applyDamage(a, 0, dmg, 'side'); applyDamage(b, 0, dmg, 'side'); // pod contact knows only the centre normal: half and half, no sturdy
        a.shake = Math.min(1, a.shake + 0.3); b.shake = Math.min(1, b.shake + 0.3);
        // one event per contact (sparks, sound, Treffermarke) – it goes to the player when the player is one of the two
        if (b.isPlayer) b.events.push({ type: 'pod', strength: -rv, x: b.pos.x - nx * rb, y: b.pos.y, z: b.pos.z - nz * rb, nx, nz });
        else a.events.push({ type: 'pod', strength: -rv, x: a.pos.x + nx * ra, y: a.pos.y, z: a.pos.z + nz * ra, nx: -nx, nz: -nz });
      }
    }
  }
}
