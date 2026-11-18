import * as THREE from 'three';
import type { PilotDef, PodDef, StatKey } from './data';
import { frameAt, gateDrop, nearestGlobal, nearestOnPath, rotorAngle, type Obstacle, type TrackData } from './trackBuilder';
import type { PodVisual } from './podModel';
import { podCollision } from './podDesigns';

export interface Inputs {
  throttle: number; brake: number; steer: number; boost: boolean; airbrake: boolean; repair: boolean;
  /** session 9: handbrake / slide, one-sided airbrakes, knife-edge roll (-1 left … 1 right), pitch (+1 nose down, -1 raise) */
  handbrake?: boolean; abL?: boolean; abR?: boolean; roll?: number; pitch?: number;
}

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
  events: { type: 'wall' | 'obstacle' | 'land' | 'explode' | 'pod' | 'fall' | 'field'; strength: number; x: number; y: number; z: number; nx: number; nz: number }[];
  visual: PodVisual | null;
  ai: AIState | null;
  place: number;
}

export interface AIState { stuck?: number; lastT?: number; skill: number; speedF: number; lineOff: number; takeShortcut: boolean; boostUntil: number; repairMode: boolean; noiseT: number; rubber: number; dpCost?: Float32Array; dpFrom?: Int16Array; dpX?: Float32Array; dpLat?: number; knifeUntil?: number; knifeDir?: number; }

export const GRAVITY = 34;
/** share of gravity that acts along the road slope (session 16): 9 % grade ≈ ±2.4 m/s² */
export const SLOPE_K = 0.8;
const HOVER = 1.7;

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
    width: podCollision(p.def).halfW * (1 - 0.5 * Math.min(1, Math.abs((p as unknown as { knife?: number }).knife ?? 0) / 1.5708)), // knife-edge roll halves the width
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

  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -fz, rz = fx;
  let vf = p.vel.x * fx + p.vel.z * fz;
  let vr = p.vel.x * rx + p.vel.z * rz;
  const hp = (p.hpL + p.hpR) / 200;
  // session 9: knife-edge roll (±90°), pitch/raise, one-sided airbrakes, handbrake slide
  const ext = p as unknown as { knife?: number; pitchC?: number; sliding?: boolean };
  ext.knife = (ext.knife ?? 0) + ((inp.roll ?? 0) * Math.PI / 2 - (ext.knife ?? 0)) * Math.min(1, dt * 6);
  ext.pitchC = (ext.pitchC ?? 0) + ((inp.pitch ?? 0) - (ext.pitchC ?? 0)) * Math.min(1, dt * 4);
  const abL = !!inp.abL || inp.airbrake, abR = !!inp.abR || inp.airbrake, abBoth = abL && abR;
  p.airbraking = (abL || abR) && vf > 15;
  const slide = !!inp.handbrake && p.grounded && vf > 12 && !frozen; ext.sliding = slide;
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
  let omega = p.steer * P.turn * lowF * highF * (p.airbraking ? (abBoth ? P.abTurn : (1 + P.abTurn) / 2) : 1) * (p.grounded ? 1 : 0.55) * (slide ? 1.35 : 1);
  if (p.airbraking && !abBoth) omega += (abR ? 1 : -1) * P.turn * 0.5 * lowF; // single airbrake drags that side → yaw towards it
  { // session 16: banked curves – steering into the bank turns up to 50 % harder, against it up to 25 % weaker (grounded only)
    const bk = td.paths[p.path]?.samples[p.idx]?.bank ?? 0;
    if (p.grounded && bk !== 0 && p.steer !== 0) omega *= 1 + Math.max(-0.25, Math.min(0.5, bk * Math.sign(p.steer) * 1.6));
  }
  omega += (p.hpR - p.hpL) / 100 * 0.25 * lowF; // damage pull
  if (p.zeroG) omega *= 1.4;
  if (frozen) omega = 0;
  p.yawRate += (omega - p.yawRate) * Math.min(1, dt * 9);
  p.yaw -= p.yawRate * dt;

  // thrust
  const pc = ext.pitchC; let vmaxE = P.vmax * (0.72 + 0.28 * hp) * (p.boosting ? 1.32 : 1) * (p.repairing ? 0.55 : 1) * (1 + 0.04 * Math.max(0, pc) - 0.05 * Math.max(0, -pc));
  if (p.isPlayer === false && p.ai) vmaxE *= p.ai.speedF * p.ai.rubber;
  if (!frozen) {
    if (inp.throttle > 0) {
      const ratio = Math.max(0, vf) / vmaxE;
      const a = P.accel * (p.boosting ? 1.7 : 1) * Math.max(0, 1 - ratio * ratio) * inp.throttle * (p.grounded ? 1 : 0.5);
      vf += a * dt;
      if (ratio > 1) vf -= (vf - vmaxE) * 1.2 * dt;
    }
    if (inp.brake > 0) { if (vf > 0) vf = Math.max(0, vf - 55 * inp.brake * dt); else vf = Math.max(-18, vf - 14 * inp.brake * dt); }
    if (p.airbraking) vf = Math.max(10, vf - P.abDecel * (abBoth ? 1 : 0.55) * dt);
    if (slide) vf = Math.max(0, vf - 9 * dt);
  } else vf *= Math.exp(-3 * dt);
  vf *= Math.exp(-(inp.throttle > 0 ? 0.04 : 0.28) * dt);
  // session 16: gravity along the slope – climbs cost speed, descents give it back (not on jump ramps, in gaps or in zero-G)
  if (p.grounded && !p.zeroG && !frozen) {
    const sm = td.paths[p.path]?.samples[p.idx];
    if (sm && sm.ramp === 0 && !sm.gap) { const grade = Math.max(-0.2, Math.min(0.2, (p.groundY - p.prevGroundY) / Math.max(0.05, Math.abs(vf) * dt))); vf -= GRAVITY * SLOPE_K * grade * dt; }
  }
  vr *= Math.exp(-P.grip * gripMul * dt * (p.airbraking ? 0.45 : 1) * (p.grounded ? 1 : 0.15) * (slide ? 0.12 : 1)); // handbrake: lateral grip almost gone → drift
  // after turning, refresh forward basis to apply velocity
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
    const oi = other.id === 0
      ? nearestGlobal(other, p.pos.x, p.pos.z, 0, other.samples.length - 1)
      : nearestGlobal(other, p.pos.x, p.pos.z, 0, other.samples.length - 1);
    const of = frameAt(other, oi, p.pos.x, p.pos.z);
    if (Math.abs(of.lat) < of.hw - 0.5 && (other.id === 0 || (oi > 1 && oi < other.samples.length - 3))) { p.path = other.id; path = other; p.idx = oi; fr = of; }
  }
  p.lat = fr.lat;
  const S = fr.s;
  // end of sprint track: solid barrier
  if (!path.closed && p.idx >= path.samples.length - 2 && fr.along > 0 && path.id === 0) {
    p.pos.x -= S.tx * fr.along; p.pos.z -= S.tz * fr.along;
    const vt = p.vel.x * S.tx + p.vel.z * S.tz; if (vt > 0) { p.vel.x -= S.tx * vt; p.vel.z -= S.tz * vt; }
  }

  // vertical
  const offRoad = Math.abs(fr.lat) > fr.hw + 1.5;
  const gap = fr.gap || offRoad;
  p.prevGroundY = p.groundY;
  p.groundY = fr.groundY;
  const bob = Math.sin(time * 3 + p.id) * 0.12;
  const pcy = (p as unknown as { pitchC?: number }).pitchC ?? 0;
  const targetY = fr.groundY + HOVER + bob + Math.max(0, -pcy) * 2.2 - Math.max(0, pcy) * 0.35; // ↓ raise / ↑ nose down
  const wasGrounded = p.grounded;
  p.zeroG = fr.zeroG && !fr.gap;
  if (p.zeroG) {
    // weightless flight: full steering in the air, gentle guidance back into the tube
    const tubeY = fr.groundY + 7;
    p.vel.y += ((tubeY - p.pos.y) * 3.2 - p.vel.y * 1.2) * dt;
    p.grounded = false;
  } else if (!gap && p.pos.y <= targetY + 0.8) {
    const k = 140, c = 20;
    // damper works against the ground's own vertical speed (slopes, banks) → the pod keeps its hover height on climbs instead of sagging
    const gvs = wasGrounded ? Math.max(-45, Math.min(45, (fr.groundY - p.prevGroundY) / dt)) : 0;
    p.vel.y += ((targetY - p.pos.y) * k - (p.vel.y - gvs) * c) * dt;
    if (p.pos.y < fr.groundY + 0.6) {
      const gv = (p.groundY - p.prevGroundY) / dt;
      p.pos.y = fr.groundY + 0.6; p.vel.y = Math.max(p.vel.y, Math.min(60, gv));
    }
    p.grounded = true;
  } else {
    p.vel.y -= GRAVITY * dt;
    p.grounded = false;
  }
  // detect ramp launch: ground falling away faster than pod
  p.pos.y += p.vel.y * dt;
  if (p.grounded) p.air = 0; else p.air += dt;
  if (!wasGrounded && p.grounded && p.vel.y < -14) {
    const dmg = (-p.vel.y - 14) * 0.9 * P.sturdy;
    p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; p.shake = Math.min(1, p.shake + 0.4);
    p.events.push({ type: 'land', strength: -p.vel.y, x: p.pos.x, y: fr.groundY, z: p.pos.z, nx: 0, nz: 0 });
  }
  // tunnel ceilings (shortcut tunnels: arch of radius hw+1.5, apex `roof` m) and zero-G energy tubes
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
      const vr = (p.vel.x * S.rx + p.vel.z * S.rz) * rl + p.vel.y * ry;
      if (vr > 0) {
        p.vel.x -= S.rx * rl * vr * 1.3; p.vel.z -= S.rz * rl * vr * 1.3; p.vel.y -= ry * vr * 1.3;
        if (vr > 2) p.events.push({ type: 'field', strength: vr, x: p.pos.x + S.rx * rl * 2, y: p.pos.y + ry * 2, z: p.pos.z + S.rz * rl * 2, nx: -S.rx * rl, nz: -S.rz * rl });
      }
    }
  }
  if (gap && p.pos.y < S.y - 14) { p.events.push({ type: 'fall', strength: 1, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 }); kill(p, 1.6, false); return; }

  // walls: rails (finite height, energy field above) / cliff rock (infinite) / zero-G tube field – per collision circle
  if (!fr.gap) {
    const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    let best = 0, nx = 0, nz = 0, hx = 0, hz = 0, side = 0, soft = false;
    for (const c of C) {
      const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy;
      const cs = path.samples[nearestOnPath(path, wx, wz, p.idx, 8, 8)];
      if (cs.gap) continue;
      const lat = (wx - cs.x) * cs.rx + (wz - cs.z) * cs.rz; const sg = lat >= 0 ? 1 : -1;
      const pen = Math.abs(lat) + c.r - (sg > 0 ? cs.wallR : cs.wallL);
      if (pen > best) {
        best = pen; nx = -cs.rx * sg; nz = -cs.rz * sg; hx = wx - nx * c.r; hz = wz - nz * c.r; side = c.side;
        const cliff = (sg > 0 ? cs.hR : cs.hL) > 0;
        const railTop = cs.y + cs.ramp - sg * cs.hw * cs.bank + 1.55;
        soft = !cliff && (cs.zeroG || p.pos.y - 0.9 > railTop); // flying over the rail → energy field, no crash
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
        if (vt > 4 && p.invuln <= 0 && !(wc.wCd! > 0)) { // pinned pods: one wall hit per 0.2 s, not per substep
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
    if (d < -N / 2) { if (p.passedMid) { p.lap++; p.passedMid = false; if (p.lap > 0) { p.lapTimes.push(time - p.lapStart); } p.lapStart = time; } }
    else if (d > N / 2) { p.lap--; p.passedMid = true; }
    if (rel > N * 0.45 && rel < N * 0.9) p.passedMid = true;
    p.rel = rel;
    p.prog = p.lap * N + rel;
  } else {
    p.rel = mainIdx - td.startIdx; p.prog = p.rel;
  }
  // wrong way
  const fwd = Math.sin(p.yaw) * S.tx + Math.cos(p.yaw) * S.tz;
  if (fwd < -0.3 && !frozen) p.wrongWay += dt; else p.wrongWay = Math.max(0, p.wrongWay - dt * 2);
  if (p.grounded && !S.gap && !S.zeroG && Math.abs(fr.lat) < fr.hw - 3 && S.ramp === 0) { p.lastSafePath = p.path; p.lastSafeIdx = p.idx; }

  if (p.hpL <= 0 || p.hpR <= 0) { p.events.push({ type: 'explode', strength: 1, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 }); kill(p, 2.6, true); }

  // visual attitude
  const latV = vr;
  const kn = (p as unknown as { knife?: number }).knife ?? 0;
  const targetRoll = kn + Math.max(-0.42, Math.min(0.42, p.steer * 0.42 + latV * 0.008 + (p.airbraking ? p.steer * 0.15 : 0))) * (1 - Math.min(1, Math.abs(kn) / 1.5708)) + (p.grounded ? Math.atan(S.bank) : 0); // clamped lean + knife-edge roll + road bank (pod lies parallel to a banked curve)
  p.roll += (targetRoll - p.roll) * Math.min(1, dt * 6);
  const hs = Math.max(10, Math.hypot(p.vel.x, p.vel.z));
  const targetPitch = -Math.atan2(p.vel.y, hs) * 0.8 + (p.boosting ? -0.05 : 0) + (p.airbraking ? 0.08 : 0) + ((p as unknown as { pitchC?: number }).pitchC ?? 0) * 0.2;
  p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 5);
  p.shake *= Math.exp(-dt * 3);
}

function collideObstacle(p: PodState, o: Obstacle, sturdy: number) {
  const height = o.kind === 1 || o.kind === 4 ? 9 : o.r * 1.6;
  if (p.pos.y > o.y + height + 1.5) return;
  const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  for (const c of C) {
    const wx = p.pos.x + c.x * cy + c.z * sy, wz = p.pos.z - c.x * sy + c.z * cy;
    const dx = wx - o.x, dz = wz - o.z; const d = Math.hypot(dx, dz); const R = o.r + c.r;
    if (d >= R || d < 1e-3) continue;
    const nx = dx / d, nz = dz / d;
    p.pos.x += nx * (R - d); p.pos.z += nz * (R - d);
    const vn = p.vel.x * nx + p.vel.z * nz;
    if (vn < 0) {
      p.vel.x -= nx * vn * 1.5; p.vel.z -= nz * vn * 1.5;
      if (vn < -4) { const sc = Math.max(0.6, 1 + vn * 0.004); p.vel.x *= sc; p.vel.z *= sc; }
      const pc = p as unknown as { obCd?: number };
      if (p.invuln <= 0 && !(pc.obCd! > 0)) { // one damage hit per 0.35 s (pods pinned by rotor arms no longer melt)
        pc.obCd = 0.35;
        const dmg = Math.min(38, Math.max(0, -vn - 6) * 0.9 * sturdy) * (p.isPlayer ? 1 : 0.45); // AI cannot read dense obstacle fields as well as players
        if (c.side < 0) p.hpL -= dmg; else if (c.side > 0) p.hpR -= dmg; else { p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; }
        p.shake = Math.min(1, p.shake + 0.5);
        p.events.push({ type: 'obstacle', strength: -vn, x: o.x + nx * o.r, y: p.pos.y, z: o.z + nz * o.r, nx, nz });
      }
    }
    return; // one contact per obstacle and step
  }
}

function collideSetPieces(p: PodState, td: TrackData, time: number, sturdy: number) {
  const C = podCollision(p.def).circles; const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const hurt = (dmg: number, side: number, x: number, z: number, nx: number, nz: number, strength: number) => {
    if (p.invuln > 0) return;
    const hp = p as unknown as { spHit?: number }; if (time - (hp.spHit ?? -9) < 0.7) return; hp.spHit = time; // one hit per arm pass, not per substep
    if (!p.isPlayer) dmg *= 0.45;
    if (side < 0) p.hpL -= dmg; else if (side > 0) p.hpR -= dmg; else { p.hpL -= dmg * 0.5; p.hpR -= dmg * 0.5; }
    p.shake = Math.min(1, p.shake + 0.45); p.events.push({ type: 'obstacle', strength, x, y: p.pos.y, z, nx, nz });
  };
  for (const sp of td.setPieces) {
    const dxc = p.pos.x - sp.x, dzc = p.pos.z - sp.z; const reach = sp.type === 'rotor' ? sp.armLen + 14 : sp.hw + 40;
    if (dxc * dxc + dzc * dzc > reach * reach) continue;
    if (sp.type === 'rotor') {
      if (p.pos.y > sp.y + 5) continue; // above the arms
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
          const vax = -uz * sp.speed * t, vaz = ux * sp.speed * t; // arm velocity ω × r
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
  p.pos.set(s.x, s.y + 3, s.z); p.yaw = Math.atan2(s.tx, s.tz); p.yawRate = 0; p.steer = 0;
  p.vel.set(s.tx * 35, 0, s.tz * 35);
  p.hpL = Math.max(p.hpL, 55); p.hpR = Math.max(p.hpR, 55); p.heat = 0; p.overheat = false;
  p.dead = 0; p.invuln = 2.2; p.grounded = false; p.groundY = s.y; p.prevGroundY = s.y;
}

// ===================== AI =====================
const AI_ROWS = 14, AI_LANES = 15, AI_DENSE = 3; // lane-grid search only for dense obstacle fields
export function aiInputs(p: PodState, td: TrackData, pods: PodState[], time: number, player: PodState | null) {
  const ai = p.ai!; const P = podParams(p);
  const adt = Math.min(0.1, Math.max(0, time - (ai.lastT ?? time))); ai.lastT = time;
  const spd0 = Math.hypot(p.vel.x, p.vel.z);
  if (spd0 < 8 && time > 3 && !p.finished && p.dead <= 0) ai.stuck = (ai.stuck ?? 0) + adt; else ai.stuck = 0;
  if ((ai.stuck ?? 0) > 2.5) { ai.stuck = 0; const n0 = td.paths[p.path].samples.length; p.lastSafeIdx = td.paths[p.path].closed ? (p.idx + 25) % n0 : Math.min(n0 - 3, p.idx + 25); p.lastSafePath = p.path; respawn(p, td); return; }
  const path = td.paths[p.path]; const S = path.samples; const n = S.length;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const at = (k: number) => S[path.closed ? ((p.idx + k) % n + n) % n : Math.max(0, Math.min(n - 1, p.idx + k))];
  const look = Math.round((14 + speed * 0.42) / 2);
  const t = at(look);
  // curvature ahead
  let cAvg = 0; for (let k = 10; k < 60; k += 5) cAvg += at(k).curv; cAvg /= 10;
  let lat = -Math.sign(cAvg) * Math.min(0.6, Math.abs(cAvg) * 35) * t.hw * ai.skill + ai.lineOff * t.hw * 0.35;
  lat += Math.sin(time * 0.4 + ai.noiseT) * (1 - ai.skill) * t.hw * 0.35;
  // shortcuts
  if (p.path === 0 && ai.takeShortcut) {
    for (let k = 0; k < 70; k += 2) {
      const s2 = at(k);
      if ((s2.openL || s2.openR) && s2.link > 0) {
        const sideSign = s2.openR ? 1 : -1;
        lat = sideSign * (k < 12 ? t.hw + 8 : t.hw - 2.5);
        break;
      }
    }
  }
  // obstacles: lane-grid path search over every obstacle in the look-ahead window (session 6)
  // rows every 4 samples (≈ 8 m) up to 56 samples ahead, 15 lanes across the drivable width;
  // DP minimises blocked cells + lateral jerk + deviation from the racing line. Replaces single-obstacle dodging.
  const buckets = td.obstaclesByPath[p.path];
  const bStart = Math.floor(p.idx / 10);
  const obs: { ahead: number; lat: number; clear: number }[] = [];
  let latSparse = lat;
  for (let bb = bStart; bb <= bStart + 6; bb++) {
    const list = buckets.get(path.closed ? bb % Math.ceil(n / 10) : bb); if (!list) continue;
    for (const o of list) {
      if (o.hz !== undefined) { // geysers: only avoid if erupting (or about to) when we get there
        let a2 = o.idx - p.idx; if (path.closed && a2 < -n / 2) a2 += n; const h = td.hazards[o.hz];
        const ph = (((time + (a2 * 2) / Math.max(30, speed) + h.phase) % h.period) + h.period) % h.period;
        if (ph > h.period * h.duty + 0.6 && ph < h.period - 2.2) continue;
      }
      let ahead = o.idx - p.idx; if (path.closed && ahead < -n / 2) ahead += n;
      if (ahead < -5 || ahead > 60) continue;
      obs.push({ ahead, lat: o.lat, clear: o.r + P.width + 1.8 });
      if (ahead <= 50) { // classic single-obstacle dodge (used when the field is sparse)
        const clear = o.r + P.width + 2.5;
        if (Math.abs(latSparse - o.lat) < clear) { let dir = ahead < 18 ? (p.lat >= o.lat ? 1 : -1) : (o.lat > 0 ? -1 : 1); const hwO = S[o.idx].hw - P.width; if (Math.abs(o.lat + dir * clear) > hwO) dir = -dir; latSparse = o.lat + dir * clear * 1.1; }
      }
    }
  }
  let fieldSlow = 1;
  if (obs.length < AI_DENSE) lat = latSparse;
  else {
    const R = AI_ROWS, Ln = AI_LANES, cost = ai.dpCost ?? (ai.dpCost = new Float32Array(R * Ln)), from = ai.dpFrom ?? (ai.dpFrom = new Int16Array(R * Ln)), xs = ai.dpX ?? (ai.dpX = new Float32Array(R * Ln));
    const maxShift = Math.max(3.5, 11 * 45 / Math.max(45, speed)); // reachable lateral offset per row at this speed
    let blockedNear = 0;
    for (let k = 0; k < R; k++) {
      const ah = (k + 1) * 4; const sk = at(ah);
      const hwR = Math.max(2, Math.min(sk.hw, sk.wallL, sk.wallR) - P.width - 0.6);
      for (let j = 0; j < Ln; j++) {
        const x = -hwR + (j / (Ln - 1)) * hwR * 2; const c = k * Ln + j; xs[c] = x;
        let blk = 0;
        for (const o of obs) { const along = Math.abs(o.ahead - ah) * 2; if (along > o.clear + 6) continue; const d = Math.abs(x - o.lat); if (d < o.clear) blk += 1 - d / o.clear * 0.5; }
        if (blk > 0 && k < 6) blockedNear++;
        let best = 0, bi = -1;
        if (k === 0) { const dx = Math.abs(x - p.lat); best = dx > maxShift * 1.4 ? 900 + dx : dx * 0.25; }
        else { best = 1e9; for (let i = 0; i < Ln; i++) { const dx = Math.abs(x - xs[c - Ln - j + i]); const v = cost[(k - 1) * Ln + i] + dx * dx * 0.035 + (dx > maxShift ? 600 : 0); if (v < best) { best = v; bi = i; } } }
        cost[c] = best + blk * 2000 + Math.abs(x - lat) * 0.06 * (1 + k * 0.1); from[c] = bi;
      }
    }
    let bj = 0; for (let j = 1; j < Ln; j++) if (cost[(R - 1) * Ln + j] < cost[(R - 1) * Ln + bj]) bj = j;
    const bestCost = cost[(R - 1) * Ln + bj];
    // backtrack to the target row (≈ 60 % of the steering look-ahead, at least the first row)
    const rT = Math.max(0, Math.min(R - 1, Math.round((look * 0.3) / 4) - 1));
    let j = bj; for (let k = R - 1; k > rT; k--) j = from[k * Ln + j];
    lat = xs[rT * Ln + j];
    ai.dpLat = lat;
    // dense fields: slow down so the path stays reachable; no free path at all → brake harder
    if (bestCost > 1500) { fieldSlow = 0.85; if (ai.skill > 0.45 && time > (ai.knifeUntil ?? 0) - 0.2) { ai.knifeUntil = time + 1.3; ai.knifeDir = ai.knifeDir ?? (p.id % 2 ? 1 : -1); } } void blockedNear; // no free line → knife-edge roll (halves width)
  }
  // portcullis gates: aim for a section that will be open on arrival
  if (p.path === 0) for (const sp of td.setPieces) {
    if (sp.type !== 'gate') continue;
    let ahead = sp.idx - p.idx; if (path.closed && ahead < -n / 2) ahead += n;
    if (ahead < 0 || ahead > 80) continue;
    const eta = time + (ahead * 2) / Math.max(30, speed), w3 = (2 * sp.hw) / 3; let bk = -1, bd = 1e9;
    for (let k = 0; k < 3; k++) {
      if (Math.max(gateDrop(sp, k, eta - 0.5), gateDrop(sp, k, eta), gateDrop(sp, k, eta + 0.5)) > 0.15) continue;
      const c = -sp.hw + (k + 0.5) * w3; if (Math.abs(c - lat) < bd) { bd = Math.abs(c - lat); bk = k; }
    }
    if (bk >= 0) { const c = -sp.hw + (bk + 0.5) * w3; lat = c + Math.max(-w3 * 0.22, Math.min(w3 * 0.22, lat - c)); }
  }
  // other pods
  for (const q of pods) {
    if (q === p || q.dead > 0 || q.path !== p.path) continue;
    let ahead = q.idx - p.idx; if (path.closed && ahead < -n / 2) ahead += n; if (path.closed && ahead > n / 2) ahead -= n;
    if (ahead > 0 && ahead < 14 && Math.abs(q.lat - lat) < 6) lat = q.lat + (q.lat > 0 ? -7 : 7);
    if (q === player && Math.abs(ahead) < 4 && p.pilot.aggression > 0.75 && Math.sin(time * 0.7 + ai.noiseT) > 0.6) lat = q.lat; // ramming
  }
  // session 10: obstacle clearance has the last word – pod-avoidance / ramming used to push pack members back into rocks
  let nearBlock = 999;
  for (const o of obs) {
    if (o.ahead > -2 && o.ahead < 40 && Math.abs(lat - o.lat) < o.clear * 1.15) {
      const dir = Math.sign(lat - o.lat) || (p.lat >= o.lat ? 1 : -1);
      lat = o.lat + dir * o.clear * 1.1;
    }
    // obstacle whose footprint our CURRENT lateral position still overlaps → steer at a point just before it
    if (o.ahead > 0 && o.ahead < 45 && Math.abs(p.lat - o.lat) < o.clear) nearBlock = Math.min(nearBlock, o.ahead);
  }
  const s0 = S[p.idx];
  const lim = s0.openL || s0.openR ? t.hw + 10 : Math.min(t.wallL, t.wallR) - P.width - 0.5;
  lat = Math.max(-lim, Math.min(lim, lat));
  const ts = nearBlock < 999 ? at(Math.max(4, Math.min(look, Math.round(nearBlock * 0.7)))) : t; // short look-ahead while dodging
  const tx = ts.x + ts.rx * lat, tz = ts.z + ts.rz * lat;
  const desired = Math.atan2(tx - p.pos.x, tz - p.pos.z);
  const diff = wrapAngle(desired - p.yaw);
  let steer = Math.max(-1, Math.min(1, -diff * 3.4 + p.yawRate * 0.15));
  if (Math.abs(steer) < 0.02) steer = 0;
  // speed control
  let vlim = 999, rampAhead = false;
  for (let k = 0; k < 90; k += 3) { const s2 = at(k); vlim = Math.min(vlim, s2.vmax); if (s2.ramp > 0 || s2.gap) rampAhead = true; }
  const turnF = (P.turn / 1.6) * (0.85 + 0.3 * ai.skill);
  const vTarget = (rampAhead ? 999 : vlim * turnF * (1 + (P.abTurn - 1.5) * 0.3)) * fieldSlow;
  let throttle = 1, brake = 0, airbrake = false;
  if (speed > vTarget + 4) throttle = 0;
  if (speed > vTarget + 14) airbrake = true;
  if (speed > vTarget + 40) brake = 0.6;
  // boost
  let boost = false;
  if (time < ai.boostUntil && p.heat < 0.6 + ai.skill * 0.3) boost = true;
  else if ((vlim > 160 || rampAhead) && speed > 50 && p.heat < 0.35 && Math.random() < dtChance(ai.skill)) ai.boostUntil = time + 1.5 + ai.skill * 2.5;
  // repair
  const hp = Math.min(p.hpL, p.hpR);
  if (hp < 32) ai.repairMode = true; if (hp > 75) ai.repairMode = false;
  // rubber banding
  if (player) {
    const gap = (player.prog - p.prog) * 2;
    ai.rubber = 1 + Math.max(-0.05, Math.min(0.06, gap / 6000));
  }
  if (p.finished) { throttle = 0; brake = speed > 25 ? 1 : 0; boost = false; airbrake = speed > 30; }
  // session 10: new manoeuvres – power slide in hairpins, inner-side airbrake, knife-edge roll, nose-down on fast straights
  const hairpin = Math.abs(cAvg) * 35 > 0.45;
  let handbrake = false, abL = false, abR = false, pitch = 0;
  if (!p.finished && hairpin && !rampAhead && ai.skill > 0.5 && speed > vTarget + 18 && speed < vTarget + 70) { handbrake = true; airbrake = false; brake = 0; throttle = 1; }
  if (airbrake && Math.abs(steer) > 0.35) { if (steer > 0) abR = true; else abL = true; airbrake = false; }
  if (!rampAhead && vlim > 220 && !hairpin && ai.skill > 0.6 && p.heat < 0.8) pitch = 1;
  const roll = time < (ai.knifeUntil ?? 0) ? (ai.knifeDir ?? 1) : 0;
  p.input.handbrake = handbrake; p.input.abL = abL; p.input.abR = abR; p.input.roll = roll; p.input.pitch = pitch;
  p.input.steer = steer; p.input.throttle = throttle; p.input.brake = brake; p.input.airbrake = airbrake;
  p.input.boost = boost && !ai.repairMode; p.input.repair = ai.repairMode && !rampAhead;
}
function dtChance(skill: number) { return 0.004 + skill * 0.01; }
