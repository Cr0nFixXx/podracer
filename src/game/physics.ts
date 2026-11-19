import * as THREE from 'three';
import type { PilotDef, PodDef, StatKey } from './data';
import { DS, boulderState, bridgeSwing, frameAt, gateDrop, nearestGlobal, nearestOnPath, roadSurfaceAt, rotorAngle, type Obstacle, type SetPiece, type TrackData } from './trackBuilder';
import type { PodVisual } from './podModel';
import { podCollision, podEnvelope } from './podDesigns';

/** `airbrake` = air brake, and a handbrake slide while steering. `pitch`: +1 lift (nose up), -1 dive (nose down). `roll`: -1 left / +1 right knife-edge (90°). */
export interface Inputs { throttle: number; brake: number; steer: number; boost: boolean; airbrake: boolean; repair: boolean; pitch?: number; roll?: number; }

export interface PodState {
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
  pitchCtl?: number; rollCtl?: number; rollBase?: number; sliding?: boolean; slideT?: number; bankGrip?: number;
  events: { type: 'wall' | 'obstacle' | 'land' | 'explode' | 'pod' | 'fall' | 'field'; strength: number; x: number; y: number; z: number; nx: number; nz: number }[];
  visual: PodVisual | null;
  ai: AIState | null;
  place: number;
}

export interface AIState { dive?: boolean; diveT?: number; diveRoll?: number; stuck?: number; lastT?: number; prevLat?: number; skill: number; speedF: number; lineOff: number; takeShortcut: boolean; boostUntil: number; repairMode: boolean; noiseT: number; rubber: number; }

export const GRAVITY = 34;
/** Generous repulsor hover altitude + hard per-engine/cockpit floor gap so no pod part EVER clips into the road! */
export const HOVER = 2.85;
const MIN_ROAD_CLEAR = 0.68;

export function podParams(p: PodState) {
  const s = p.stats;
  return {
    vmax: 108 + 50 * s.topSpeed,
    accel: 24 + 30 * s.accel,
    turn: 1.05 + 0.75 * s.turn,
    grip: 2.6 + 5.2 * s.traction,
    abDecel: 22 + 38 * s.airbrake,
    abTurn: 1.45 + 0.6 * s.airbrake,
    cool: 0.16 + 0.3 * s.cooling,
    heatRate: 0.38 - 0.16 * s.cooling,
    repair: 6 + 16 * s.repair,
    sturdy: 1.25 - 0.5 * s.repair,
    width: podCollision(p.def).halfW,
  };
}

function wrapAngle(a: number) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export function stepPod(p: PodState, td: TrackData, dt: number, time: number, gripMul: number, frozen: boolean) {
  const P = podParams(p);
  const inp = p.input;
  if (p.dead > 0) return;
  if (p.invuln > 0) p.invuln -= dt;
  { const pc = p as unknown as { obCd?: number; wCd?: number }; if (pc.obCd) pc.obCd = Math.max(0, pc.obCd - dt); if (pc.wCd) pc.wCd = Math.max(0, pc.wCd - dt); }
  // steering smoothing
  const target = inp.steer;
  const rate = Math.sign(target) !== Math.sign(p.steer) && Math.abs(p.steer) > 0.05 ? 9 : target === 0 ? 7 : 4.5;
  p.steer += Math.max(-rate * dt, Math.min(rate * dt, target - p.steer));
  // Manual attitude controls (only act while their key is held; both ease back to neutral on release)
  const pIn = frozen ? 0 : Math.max(-1, Math.min(1, inp.pitch ?? 0)), rIn = frozen ? 0 : Math.max(-1, Math.min(1, inp.roll ?? 0));
  const pc = p.pitchCtl = (p.pitchCtl ?? 0) + (pIn - (p.pitchCtl ?? 0)) * Math.min(1, dt * 6.5);
  p.rollCtl = (p.rollCtl ?? 0) + Math.max(-dt * 4.4, Math.min(dt * 4.4, rIn - (p.rollCtl ?? 0)));
  const rollA = p.rollCtl * (Math.PI / 2), knife = Math.abs(Math.sin(rollA));
  const env0 = podEnvelope(p.def); const halfSpan = Math.max(Math.abs(env0.engL.outerX), Math.abs(env0.engR.outerX));

  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -fz, rz = fx;
  let vf = p.vel.x * fx + p.vel.z * fz;
  let vr = p.vel.x * rx + p.vel.z * rz;
  const hp = (p.hpL + p.hpR) / 200;
  p.airbraking = inp.airbrake && vf > 15;
  // Handbrake slide: air brake + steering on the ground → rear steps out (low lateral grip, sharp yaw, little speed loss) + exit kick
  const sliding = p.airbraking && Math.abs(p.steer) > 0.25 && p.grounded && !frozen;
  if (sliding) p.slideT = Math.min(2.2, (p.slideT ?? 0) + dt);
  else { if ((p.slideT ?? 0) > 0.45 && inp.throttle > 0.5 && !inp.airbrake && p.grounded) vf += Math.min(7, p.slideT! * 4.2); if (!inp.airbrake || !p.grounded) p.slideT = 0; }
  p.sliding = sliding;
  p.repairing = inp.repair && !frozen;

  // heat / boost
  const wantBoost = inp.boost && inp.throttle > 0.5 && vf > 35 && !p.overheat && !frozen && !p.repairing;
  p.boosting = wantBoost;
  if (p.boosting) p.heat += P.heatRate * dt; else p.heat -= P.cool * dt * (p.repairing ? 1.5 : 1);
  if (p.heat >= 1) { p.heat = 1; p.overheat = true; }
  if (p.overheat) { p.hpL -= 7 * dt * P.sturdy; p.hpR -= 7 * dt * P.sturdy; if (p.heat < 0.55) p.overheat = false; }
  p.heat = Math.max(0, p.heat);
  if (p.repairing) { p.hpL = Math.min(100, p.hpL + P.repair * dt); p.hpR = Math.min(100, p.hpR + P.repair * dt); }

  // turning
  const sp = Math.abs(vf);
  const lowF = Math.min(1, sp / 22);
  const highF = 1 - 0.32 * Math.min(1, sp / P.vmax);
  let omega = p.steer * P.turn * lowF * highF * (sliding ? P.abTurn * 1.16 : p.airbraking ? P.abTurn : 1) * (p.grounded ? 1 : 0.55) * (1 - 0.4 * knife);
  omega += (p.hpR - p.hpL) / 100 * 0.25 * lowF;
  if (p.zeroG) omega *= 1.4;
  if (frozen) omega = 0;
  p.yawRate += (omega - p.yawRate) * Math.min(1, dt * 9);
  p.yaw -= p.yawRate * dt;

  // thrust
  let vmaxE = P.vmax * (0.72 + 0.28 * hp) * (p.boosting ? 1.32 : 1) * (p.repairing ? 0.55 : 1);
  if (p.isPlayer === false && p.ai) vmaxE *= p.ai.speedF * p.ai.rubber;
  if (!frozen) {
    if (inp.throttle > 0) {
      const ratio = Math.max(0, vf) / vmaxE;
      const a = P.accel * (p.boosting ? 1.7 : 1) * Math.max(0, 1 - ratio * ratio) * inp.throttle * (p.grounded ? 1 : 0.5);
      vf += a * dt;
      if (ratio > 1) vf -= (vf - vmaxE) * 1.2 * dt;
    }
    if (inp.brake > 0) { if (vf > 0) vf = Math.max(0, vf - 55 * inp.brake * dt); else vf = Math.max(-18, vf - 14 * inp.brake * dt); }
    if (p.airbraking) vf = Math.max(10, vf - P.abDecel * (sliding ? 0.42 : 1) * dt);
  } else vf *= Math.exp(-3 * dt);
  vf *= Math.exp(-(inp.throttle > 0 ? 0.04 : 0.28) * dt);
  const attGrip = (p.bankGrip ?? 1) * (pc < 0 ? 1 - 0.14 * pc : 1 - 0.2 * pc);
  vr *= Math.exp(-P.grip * gripMul * attGrip * dt * (sliding ? 0.24 : p.airbraking ? 0.45 : 1) * (p.grounded ? 1 : 0.15));
  const fx2 = Math.sin(p.yaw), fz2 = Math.cos(p.yaw), rx2 = -fz2, rz2 = fx2;
  p.vel.x = fx2 * vf + rx2 * vr; p.vel.z = fz2 * vf + rz2 * vr;

  // integrate horizontal
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;

  // track frame & path switching
  let path = td.paths[p.path];
  p.idx = nearestOnPath(path, p.pos.x, p.pos.z, p.idx);
  let fr = frameAt(path, p.idx, p.pos.x, p.pos.z);
  if (p.path > 0 && (p.idx >= path.samples.length - 3 || p.idx <= 1)) {
    const main = td.paths[0];
    const mi = nearestGlobal(main, p.pos.x, p.pos.z, 0, main.samples.length - 1);
    p.path = 0; path = main; p.idx = mi; fr = frameAt(path, mi, p.pos.x, p.pos.z);
  }
  const s = fr.s;
  const sideOpen = fr.lat > 0 ? s.openR : s.openL;
  if (Math.abs(fr.lat) > fr.hw - 1 && sideOpen && s.link >= 0) {
    const other = td.paths[s.link];
    const oi = nearestGlobal(other, p.pos.x, p.pos.z, 0, other.samples.length - 1);
    const of = frameAt(other, oi, p.pos.x, p.pos.z);
    if (Math.abs(of.lat) < of.hw - 0.5 && (other.id === 0 || (oi > 1 && oi < other.samples.length - 3))) { p.path = other.id; path = other; p.idx = oi; fr = of; }
  }
  p.lat = fr.lat;
  const S = fr.s;
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
  const wasGrounded = p.grounded;
  let landImpulse = 0;
  p.zeroG = fr.zeroG && !fr.gap;
  if (p.zeroG) {
    const tubeY = fr.groundY + 7;
    p.vel.y += ((tubeY - p.pos.y) * 3.2 - p.vel.y * 1.2) * dt;
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
    const dmg = (imp - 14) * 0.9 * P.sturdy;
    p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; p.shake = Math.min(1, p.shake + 0.4);
    landImpulse = imp;
    p.events.push({ type: 'land', strength: imp, x: p.pos.x, y: fr.groundY, z: p.pos.z, nx: 0, nz: 0 });
  }
  // tunnel ceilings & zero-G tubes
  if (S.roof > 0 && !fr.gap) {
    const l = Math.min(1, Math.abs(fr.lat) / (fr.hw + 1.5));
    const ceil = fr.groundY + 1 + (S.roof - 1) * Math.sqrt(1 - l * l) - 1.1;
    if (p.pos.y > ceil) {
      const imp = Math.max(0, p.vel.y); p.pos.y = ceil; if (p.vel.y > 0) p.vel.y *= -0.3;
      if (imp > 6 && p.invuln <= 0) { const dmg = Math.min(20, (imp - 6) * 0.8 * P.sturdy); p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; p.shake = Math.min(1, p.shake + 0.3); p.events.push({ type: 'wall', strength: imp, x: p.pos.x, y: p.pos.y + 1, z: p.pos.z, nx: 0, nz: 0 }); }
    }
  }
  if (p.zeroG) {
    const dy = p.pos.y - (fr.groundY + 7), dl = fr.lat, dist = Math.hypot(dl, dy), R = fr.hw + 1.4;
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
        const cliff = (sg > 0 ? cs.hR : cs.hL) > 0;
        const railTop = cs.y + cs.ramp - sg * cs.hw * cs.bank + 1.55;
        soft = !cliff && (cs.zeroG || p.pos.y - 0.9 > railTop);
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
        if (Math.abs(d) < 1.4) p.yaw += d * Math.min(1, 0.15 + vt * 0.01);
        const wc = p as unknown as { wCd?: number };
        if (vt > 4 && p.invuln <= 0 && !(wc.wCd! > 0)) {
          wc.wCd = 0.2;
          const dmg = Math.min(28, Math.max(0, vt - 9) * 0.7 * P.sturdy);
          if (side < 0) p.hpL -= dmg; else if (side > 0) p.hpR -= dmg; else { p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; }
          p.shake = Math.min(1, p.shake + vt * 0.02);
          p.events.push({ type: 'wall', strength: vt, x: hx, y: p.pos.y, z: hz, nx, nz });
        }
      }
    }
  }

  // obstacles
  const buckets = td.obstaclesByPath[p.path]; const b0 = Math.floor(p.idx / 10);
  for (let bb = b0 - 1; bb <= b0 + 1; bb++) {
    const list = buckets.get(bb); if (!list) continue;
    for (const o of list) if (o.kind !== 3) collideObstacle(p, o, P.sturdy);
  }
  if (td.setPieces.length) collideSetPieces(p, td, time, P.sturdy);

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
  const samplePt = (lx: number, lz: number) => roadSurfaceAt(path, p.idx, p.pos.x + lx * cyA + lz * syA, p.pos.z - lx * syA + lz * cyA);

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
  const rawRoll = p.steer * 0.07 + vr * 0.004 + (sliding ? p.steer * 0.12 : 0) + (p.grounded ? Math.atan(S.bank) * 0.92 : 0);
  const targetRoll = Math.max(-0.5, Math.min(0.5, rawRoll));
  p.rollBase = (p.rollBase ?? 0) + (targetRoll - (p.rollBase ?? 0)) * Math.min(1, dt * 7);
  p.roll = p.rollBase * (1 - knife) + rollA;
  p.bankGrip = p.grounded ? 1 + Math.min(0.9, Math.abs(S.bank) * 2.4) : 1;

  const hs = Math.max(12, Math.hypot(p.vel.x, p.vel.z));
  const flightPitch = -Math.atan2(p.vel.y, hs) * 0.72;
  const targetPitch = Math.max(-0.42, Math.min(0.42, (p.grounded ? -roadSlope * 0.92 : flightPitch) + (p.boosting ? -0.045 : 0) + (p.airbraking ? 0.065 : 0))) - pc * (p.grounded ? 0.2 : 0.34);
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
  const tgtA = (driveA >= 0 ? driveA * 1.1 : driveA * 0.22) + oscA + boostLift + sagA;
  const tgtB = (driveB >= 0 ? driveB * 1.1 : driveB * 0.22) + oscB + boostLift + sagB;

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
        const lift = Math.min(pen, Math.max(0, 1.45 - yA));
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
        const lift = Math.min(pen, Math.max(0, 1.45 - yB));
        yB += lift; if (vB < 0) vB *= 0.15;
        if (pen > lift) { p.pos.y += pen - lift; p.vel.y = Math.max(p.vel.y, slopeVy); p.grounded = true; p.air = 0; }
      }
    }
  }
  p.engYL = Math.max(-0.9, Math.min(1.45, yA));
  p.engYR = Math.max(-0.9, Math.min(1.45, yB));
  p.engVL = vA; p.engVR = vB;
  p.shake *= Math.exp(-dt * 3);
}

function collideObstacle(p: PodState, o: Obstacle, sturdy: number) {
  const height = o.kind === 1 || o.kind === 4 ? 9 : o.r * 1.6;
  if (p.pos.y > o.y + height + 1.5) return;
  const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw); const rollW = Math.max(0.22, Math.abs(Math.cos((p.rollCtl ?? 0) * Math.PI / 2)));
  for (const c of C) {
    const cxr = c.x * rollW; const wx = p.pos.x + cxr * cy + c.z * sy, wz = p.pos.z - cxr * sy + c.z * cy;
    const dx = wx - o.x, dz = wz - o.z; const d = Math.hypot(dx, dz); const R = o.r + c.r;
    if (d >= R || d < 1e-3) continue;
    const nx = dx / d, nz = dz / d;
    p.pos.x += nx * (R - d); p.pos.z += nz * (R - d);
    const vn = p.vel.x * nx + p.vel.z * nz;
    if (vn < 0) {
      p.vel.x -= nx * vn * 1.5; p.vel.z -= nz * vn * 1.5;
      if (vn < -4) { const sc = Math.max(0.6, 1 + vn * 0.004); p.vel.x *= sc; p.vel.z *= sc; }
      const pc = p as unknown as { obCd?: number };
      if (p.invuln <= 0 && !(pc.obCd! > 0)) {
        pc.obCd = 0.35;
        const dmg = Math.min(38, Math.max(0, -vn - 6) * 0.9 * sturdy) * (p.isPlayer ? 1 : 0.45);
        if (c.side < 0) p.hpL -= dmg; else if (c.side > 0) p.hpR -= dmg; else { p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; }
        p.shake = Math.min(1, p.shake + 0.5);
        p.events.push({ type: 'obstacle', strength: -vn, x: o.x + nx * o.r, y: p.pos.y, z: o.z + nz * o.r, nx, nz });
      }
    }
    return;
  }
}

function collideSetPieces(p: PodState, td: TrackData, time: number, sturdy: number) {
  const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const hurt = (dmg: number, side: number, x: number, z: number, nx: number, nz: number, strength: number) => {
    if (p.invuln > 0) return;
    const hp = p as unknown as { spHit?: number }; if (time - (hp.spHit ?? -9) < 0.7) return; hp.spHit = time;
    if (!p.isPlayer) dmg *= 0.45;
    if (side < 0) p.hpL -= dmg; else if (side > 0) p.hpR -= dmg; else { p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; }
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
        const along = (wx - sp.x) * s.tx + (wz - sp.z) * s.tz; const pen = c.r + 0.35 - along * sgn;
        if (pen <= 0 || pen > c.r * 2 + 3) continue;
        const lat = (wx - sp.x) * s.rx + (wz - sp.z) * s.rz; let blocked = false;
        for (let k = 0; k < 3; k++) { const l0 = -sp.hw + k * w3; if (lat + c.r < l0 || lat - c.r > l0 + w3) continue; if (sp.y + 0.2 + (1 - gateDrop(sp, k, time)) * 9.5 < p.pos.y + 1.0) blocked = true; }
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
          p.vel.x += nx * 8; p.vel.z += nz * 8; p.vel.y -= 6; hurt(22 * sturdy, c.side, r.x, r.z, nx, nz, 30); break;
        }
      }
    }
  }
}

export function kill(p: PodState, t: number, explode: boolean) {
  p.dead = t; p.vel.set(0, 0, 0); p.boosting = false;
  if (explode) { p.hpL = 0; p.hpR = 0; }
}

export function respawn(p: PodState, td: TrackData) {
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
  p.vel.set(s.tx * 35, 0, s.tz * 35);
  p.hpL = Math.max(p.hpL, 55); p.hpR = Math.max(p.hpR, 55); p.heat = 0; p.overheat = false;
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
  let idealLat = -Math.sign(cAvg) * Math.min(0.58, Math.abs(cAvg) * 34) * t.hw * ai.skill + ai.lineOff * t.hw * 0.32;
  idealLat += Math.sin(time * 0.4 + ai.noiseT) * (1 - ai.skill) * t.hw * 0.3;

  // Shortcut entry commitment
  let enteringShortcut = false;
  if (p.path === 0 && ai.takeShortcut) {
    for (let k = 0; k < 68; k += 2) {
      const s2 = at(k);
      if ((s2.openL || s2.openR) && s2.link > 0) {
        const sideSign = s2.openR ? 1 : -1;
        idealLat = sideSign * (k < 12 ? t.hw + 8 : t.hw - 2.5);
        enteringShortcut = true;
        break;
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

  // Rival pods: gentle overtaking repulsion (and optional aggressive ramming on open road)
  let ramTarget: number | null = null;
  for (const q of pods) {
    if (q === p || q.dead > 0 || q.path !== p.path) continue;
    const ah = aheadOf(q.idx);
    if (ah > 0 && ah < 16) obs.push({ ahead: Math.max(2, ah), lat: q.lat, r: P.width * 1.85 + 1.2, weight: 0.32 });
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
  let lat = Math.max(-safeLim, Math.min(safeLim, idealLat));
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
      else if (ai.skill > 0.62 && (ai.diveRoll ?? 1) < 0.3 && p.air > 0.9 && h > 9 && p.vel.y < -2 && time > (ai.diveT ?? 0)) ai.dive = true;
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
    const ra = podParams(a).width * 0.8 * Math.max(0.3, 1 - ka * 0.7), rb = podParams(b).width * 0.8 * Math.max(0.3, 1 - kb * 0.7); const R = ra + rb;
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
        a.hpL -= dmg * 0.5; a.hpR -= dmg * 0.5; b.hpL -= dmg * 0.5; b.hpR -= dmg * 0.5;
        a.shake = Math.min(1, a.shake + 0.3); b.shake = Math.min(1, b.shake + 0.3);
        a.events.push({ type: 'pod', strength: -rv, x: a.pos.x + nx * ra, y: a.pos.y, z: a.pos.z + nz * ra, nx: -nx, nz: -nz });
      }
    }
  }
}
