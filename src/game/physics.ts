import * as THREE from 'three';
import type { PilotDef, PodDef, StatKey } from './data';
import { frameAt, nearestGlobal, nearestOnPath, type Obstacle, type TrackData } from './trackBuilder';
import type { PodVisual } from './podModel';

export interface Inputs { throttle: number; brake: number; steer: number; boost: boolean; airbrake: boolean; repair: boolean; }

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
  events: { type: 'wall' | 'obstacle' | 'land' | 'explode' | 'pod' | 'fall'; strength: number; x: number; y: number; z: number; nx: number; nz: number }[];
  visual: PodVisual | null;
  ai: AIState | null;
  place: number;
}

export interface AIState { stuck?: number; lastT?: number; skill: number; speedF: number; lineOff: number; takeShortcut: boolean; boostUntil: number; repairMode: boolean; noiseT: number; rubber: number; }

export const GRAVITY = 34;
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
    width: p.def.spread / 2 + p.def.engineRad * 0.6,
  };
}

function wrapAngle(a: number) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export function stepPod(p: PodState, td: TrackData, dt: number, time: number, gripMul: number, frozen: boolean) {
  const P = podParams(p);
  const inp = p.input;
  if (p.dead > 0) return;
  if (p.invuln > 0) p.invuln -= dt;
  // steering smoothing
  const target = inp.steer;
  const rate = Math.sign(target) !== Math.sign(p.steer) && Math.abs(p.steer) > 0.05 ? 9 : target === 0 ? 7 : 4.5;
  p.steer += Math.max(-rate * dt, Math.min(rate * dt, target - p.steer));

  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -fz, rz = fx;
  let vf = p.vel.x * fx + p.vel.z * fz;
  let vr = p.vel.x * rx + p.vel.z * rz;
  const hp = (p.hpL + p.hpR) / 200;
  p.airbraking = inp.airbrake && vf > 15;
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
  let omega = p.steer * P.turn * lowF * highF * (p.airbraking ? P.abTurn : 1) * (p.grounded ? 1 : 0.55);
  omega += (p.hpR - p.hpL) / 100 * 0.25 * lowF; // damage pull
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
    if (p.airbraking) vf = Math.max(10, vf - P.abDecel * dt);
  } else vf *= Math.exp(-3 * dt);
  vf *= Math.exp(-(inp.throttle > 0 ? 0.04 : 0.28) * dt);
  vr *= Math.exp(-P.grip * gripMul * dt * (p.airbraking ? 0.45 : 1) * (p.grounded ? 1 : 0.15));
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
  const targetY = fr.groundY + HOVER + bob;
  const wasGrounded = p.grounded;
  p.zeroG = fr.zeroG && !fr.gap;
  if (p.zeroG) {
    // weightless flight: full steering in the air, gentle guidance back into the tube
    const tubeY = fr.groundY + 7;
    p.vel.y += ((tubeY - p.pos.y) * 3.2 - p.vel.y * 1.2) * dt;
    p.grounded = false;
  } else if (!gap && p.pos.y <= targetY + 0.8) {
    const k = 140, c = 20;
    p.vel.y += ((targetY - p.pos.y) * k - p.vel.y * c) * dt;
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
  if (gap && p.pos.y < S.y - 14) { p.events.push({ type: 'fall', strength: 1, x: p.pos.x, y: p.pos.y, z: p.pos.z, nx: 0, nz: 0 }); kill(p, 1.6, false); return; }

  // walls
  const open = fr.lat > 0 ? S.openR : S.openL;
  const limit = open ? fr.hw + 24 : fr.hw - P.width * 0.55;
  if (Math.abs(fr.lat) > limit && !fr.gap) {
    const sg = Math.sign(fr.lat); const pen = Math.abs(fr.lat) - limit;
    p.pos.x -= S.rx * sg * pen; p.pos.z -= S.rz * sg * pen;
    const vt = (p.vel.x * S.rx + p.vel.z * S.rz) * sg;
    if (vt > 0) {
      p.vel.x -= S.rx * sg * vt * 1.35; p.vel.z -= S.rz * sg * vt * 1.35;
      const impact = vt;
      const scrub = 1 - Math.min(0.35, impact * 0.012 + 0.01);
      p.vel.x *= scrub; p.vel.z *= scrub;
      const trackYaw = Math.atan2(S.tx, S.tz);
      const d = wrapAngle(trackYaw - p.yaw);
      if (Math.abs(d) < 1.4) p.yaw += d * Math.min(1, 0.15 + impact * 0.01);
      if (impact > 4 && p.invuln <= 0) {
        const dmg = Math.min(28, Math.max(0, impact - 9) * 0.7 * P.sturdy);
        if (sg > 0) p.hpR -= dmg; else p.hpL -= dmg;
        p.shake = Math.min(1, p.shake + impact * 0.02);
        p.events.push({ type: 'wall', strength: impact, x: p.pos.x + S.rx * sg * P.width, y: p.pos.y, z: p.pos.z + S.rz * sg * P.width, nx: -S.rx * sg, nz: -S.rz * sg });
      }
    }
  }

  // obstacles
  const buckets = td.obstaclesByPath[p.path]; const b0 = Math.floor(p.idx / 10);
  for (let bb = b0 - 1; bb <= b0 + 1; bb++) {
    const list = buckets.get(bb); if (!list) continue;
    for (const o of list) collideObstacle(p, o, P.width, P.sturdy);
  }

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
  const targetRoll = p.steer * 0.55 + latV * 0.012 + (p.airbraking ? p.steer * 0.25 : 0);
  p.roll += (targetRoll - p.roll) * Math.min(1, dt * 6);
  const hs = Math.max(10, Math.hypot(p.vel.x, p.vel.z));
  const targetPitch = -Math.atan2(p.vel.y, hs) * 0.8 + (p.boosting ? -0.05 : 0) + (p.airbraking ? 0.08 : 0);
  p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 5);
  p.shake *= Math.exp(-dt * 3);
}

function collideObstacle(p: PodState, o: Obstacle, w: number, sturdy: number) {
  const dx = p.pos.x - o.x, dz = p.pos.z - o.z; const d = Math.hypot(dx, dz);
  const R = o.r + w * 0.6;
  const height = o.kind === 1 ? 9 : o.r * 1.6;
  if (d > R || d < 0.001 || p.pos.y > o.y + height + 1) return;
  const nx = dx / d, nz = dz / d;
  p.pos.x = o.x + nx * R; p.pos.z = o.z + nz * R;
  const vn = p.vel.x * nx + p.vel.z * nz;
  if (vn < 0) {
    p.vel.x -= nx * vn * 1.5; p.vel.z -= nz * vn * 1.5;
    if (vn < -4) { const sc = Math.max(0.6, 1 + vn * 0.004); p.vel.x *= sc; p.vel.z *= sc; }
    if (p.invuln <= 0) {
      const dmg = Math.min(38, Math.max(0, -vn - 6) * 0.9 * sturdy);
      const side = (nx * Math.cos(p.yaw) - nz * Math.sin(p.yaw)) > 0 ? 0 : 1;
      if (side) p.hpR -= dmg; else p.hpL -= dmg;
      p.shake = Math.min(1, p.shake + 0.5);
      p.events.push({ type: 'obstacle', strength: -vn, x: o.x + nx * o.r, y: p.pos.y, z: o.z + nz * o.r, nx, nz });
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
export function aiInputs(p: PodState, td: TrackData, pods: PodState[], time: number, player: PodState | null) {
  const ai = p.ai!; const P = podParams(p);
  const adt = Math.min(0.1, Math.max(0, time - (ai.lastT ?? time))); ai.lastT = time;
  const spd0 = Math.hypot(p.vel.x, p.vel.z);
  if (spd0 < 8 && time > 3 && !p.finished && p.dead <= 0) ai.stuck = (ai.stuck ?? 0) + adt; else ai.stuck = 0;
  if ((ai.stuck ?? 0) > 2.5) { ai.stuck = 0; p.lastSafeIdx = p.idx; p.lastSafePath = p.path; respawn(p, td); return; }
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
  // obstacles
  const buckets = td.obstaclesByPath[p.path];
  const bStart = Math.floor(p.idx / 10);
  for (let bb = bStart; bb <= bStart + 6; bb++) {
    const list = buckets.get(path.closed ? bb % Math.ceil(n / 10) : bb); if (!list) continue;
    for (const o of list) {
      let ahead = o.idx - p.idx; if (path.closed && ahead < -n / 2) ahead += n;
      if (ahead < -5 || ahead > 50) continue;
      const clear = o.r + P.width + 2.5;
      if (Math.abs(lat - o.lat) < clear) {
        let dir = ahead < 18 ? (p.lat >= o.lat ? 1 : -1) : (o.lat > 0 ? -1 : 1);
        const hwO = S[o.idx].hw - P.width;
        if (Math.abs(o.lat + dir * clear) > hwO) dir = -dir;
        lat = o.lat + dir * clear * 1.1;
      }
    }
  }
  // other pods
  for (const q of pods) {
    if (q === p || q.dead > 0 || q.path !== p.path) continue;
    let ahead = q.idx - p.idx; if (path.closed && ahead < -n / 2) ahead += n; if (path.closed && ahead > n / 2) ahead -= n;
    if (ahead > 0 && ahead < 14 && Math.abs(q.lat - lat) < 6) lat = q.lat + (q.lat > 0 ? -7 : 7);
    if (q === player && Math.abs(ahead) < 4 && p.pilot.aggression > 0.75 && Math.sin(time * 0.7 + ai.noiseT) > 0.6) lat = q.lat; // ramming
  }
  const s0 = S[p.idx];
  const lim = s0.openL || s0.openR ? t.hw + 10 : t.hw - P.width - 0.5;
  lat = Math.max(-lim, Math.min(lim, lat));
  const tx = t.x + t.rx * lat, tz = t.z + t.rz * lat;
  const desired = Math.atan2(tx - p.pos.x, tz - p.pos.z);
  const diff = wrapAngle(desired - p.yaw);
  let steer = Math.max(-1, Math.min(1, -diff * 3.4 + p.yawRate * 0.15));
  if (Math.abs(steer) < 0.02) steer = 0;
  // speed control
  let vlim = 999, rampAhead = false;
  for (let k = 0; k < 90; k += 3) { const s2 = at(k); vlim = Math.min(vlim, s2.vmax); if (s2.ramp > 0 || s2.gap) rampAhead = true; }
  const turnF = (P.turn / 1.6) * (0.85 + 0.3 * ai.skill);
  const vTarget = rampAhead ? 999 : vlim * turnF * (1 + (P.abTurn - 1.5) * 0.3);
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
  p.input.steer = steer; p.input.throttle = throttle; p.input.brake = brake; p.input.airbrake = airbrake;
  p.input.boost = boost && !ai.repairMode; p.input.repair = ai.repairMode && !rampAhead;
}
function dtChance(skill: number) { return 0.004 + skill * 0.01; }
