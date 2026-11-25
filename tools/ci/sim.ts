// Headless CI check (no browser, no GPU): `npm run check`
// 13 tracks × 11 AI pods × SECS seconds of real physics (stepPod + aiInputs + hazards). The grid moves on by three pods per track
// (tools/ci/roster.ts), so all 14 pods get driven; ROSTER_OLD=1 runs the Session 19 grid. Pod 0 additionally stress-tests the
// manual controls (90° roll, lift/dive, handbrake slide). Fails (exit 1) on NaN, wall tunnelling, ground clipping, mass deaths or stuck pods.
import * as THREE from 'three';
import { DIFFICULTIES, PILOTS, TRACKS } from '../../src/game/data';
import { ciRoster } from './roster';
import { buildTrack, roadSurfaceAt } from '../../src/game/trackBuilder';
import { SnowField } from '../../src/game/snowField';
import { SURF } from '../../src/game/surfaces';
import { aiInputs, applyDamage, collidePods, podParams, respawn, stepPod, HOVER, type PodState } from '../../src/game/physics';
import { effectiveStats } from '../../src/game/settings';
import { podEnvelope } from '../../src/game/podDesigns';
import { DAMAGE_RULES, damageModel } from '../../src/game/podDamage';

if (process.env.NO_TUNNELS) (globalThis as { NO_TUNNELS?: boolean }).NO_TUNNELS = true;
if (process.env.NO_EXPAND) (globalThis as { NO_EXPAND?: boolean }).NO_EXPAND = true; // old (un-expanded) layouts for A/B comparison
if (process.env.NO_BAYS) (globalThis as { NO_BAYS?: boolean }).NO_BAYS = true; // one road width between rock borders, as before 2026-11-23 (A/B)
// Schadensmodelle A/B: ARMOR=0 switches the Panzerzonen off, PARTS=0 the Bruchteile – both off must print the table from before Phase 5
if (process.env.ARMOR === '0') DAMAGE_RULES.armor = false;
if (process.env.PARTS === '0') DAMAGE_RULES.parts = false;
const SECS = Number(process.env.SECS ?? 45), ONLY = process.env.TRACK, GRIP = Number(process.env.GRIP ?? 1); // GRIP=0.9 ≈ storm/snow weather
const LIMIT = { deaths: 3, wall: 0.6, clear: 0.2, minSpeed: 18, divePct: 1.5 }; // divePct: share of AI frames holding "dive"
let seed = Number(process.env.SEED ?? 1234567); Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; // deterministic runs
const diff = (Object.values(DIFFICULTIES) as { skill: number; speed: number }[])[1];
let failed = 0;
console.log('track         deaths  NaN  wallPen  minClear  avgSpeed  slowest  airMax  rolls  slides  dive%  smashed  startTouch  tunnels  result');
for (const def of TRACKS) {
  if (ONLY && def.id !== ONLY) continue;
  const td = buildTrack(def); const S = td.main.samples, N = td.N;
  { const sf = new SnowField(td); if (sf.runs.length) td.snow = sf; } // 2026-11-23: as in a race (Game.start) – the rivals cut trenches through the powder field and look for them
  const pods: PodState[] = [];
  const roster = ciRoster(TRACKS.indexOf(def), !!process.env.ROSTER_OLD); // ROSTER_OLD=1: the Session 19 grid (A/B against the old table)
  for (let g = 0; g < 11; g++) {
    const pd = roster[g]; const row = Math.floor(g / 3), col = g % 3;
    let idx = td.startIdx - 6 - row * 13; idx = td.main.closed ? ((idx % N) + N) % N : Math.max(0, idx);
    const s = S[idx], lat = (col - 1) * s.hw * 0.55, eLat = Math.min(1, Math.abs(lat) / s.hw), gY = s.y - lat * s.bank + (1 - eLat * eLat) * 0.2 + 0.08;
    const pilot = PILOTS.find(p => p.id === pd.pilotId) ?? PILOTS[0], skill = diff.skill * (0.7 + 0.3 * pilot.skill);
    const pod: PodState = {
      id: g, isPlayer: false, def: pd, pilot, stats: effectiveStats(pd.id, undefined), name: pilot.name, color: pilot.color,
      pos: new THREE.Vector3(s.x + s.rx * lat, gY + HOVER, s.z + s.rz * lat), vel: new THREE.Vector3(), yaw: Math.atan2(s.tx, s.tz), yawRate: 0, steer: 0,
      path: 0, idx, lat, grounded: true, zeroG: false, air: 0, groundY: gY, prevGroundY: gY, engYL: 0, engYR: 0, engVL: 0, engVR: 0, engPL: 0, engPR: 0,
      input: { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false, repair: false },
      hpL: 100, hpR: 100, heat: 0, boosting: false, overheat: false, repairing: false, airbraking: false,
      lap: 0, passedMid: true, rel: 0, prog: 0, finished: false, finishTime: 0, lapStart: 0, lapTimes: [],
      dead: 0, invuln: 0, lastSafePath: 0, lastSafeIdx: idx, wrongWay: 0, roll: 0, pitch: 0, shake: 0, events: [], visual: null,
      ai: { skill, speedF: diff.speed * (0.93 + 0.09 * pilot.skill), lineOff: Math.random() * 2 - 1, takeShortcut: Math.random() < skill * 0.75, boostUntil: 0, repairMode: false, noiseT: Math.random() * 100, rubber: 1, gridLat: process.env.NOGRID ? undefined : lat }, place: g + 1,
    };
    const rel = ((idx - td.startIdx) % N + N) % N; if (td.main.closed) { pod.rel = rel; pod.lap = rel > N / 2 ? -1 : 0; pod.prog = pod.lap * N + rel; }
    pods.push(pod);
  }
  // overhead self-test (boonta only): a deliberately low gantry 300 m after the start must knock pods down without NaN / tunnelling
  const ohIdx = def.id === 'boonta' ? (td.startIdx + 150) % N : -1;
  if (ohIdx >= 0) { const q = S[ohIdx]; (td.overheads ??= []).push({ idx: ohIdx, y0: q.y + 3.6, y1: q.y + 7, half: 1.2 }); }
  const nBreakable = td.obstacles.filter(o => o.breakable).length; const touch = new Set<number>();
  // tunnel report + deck self-test: pod 1 is lifted 24 m shortly before the first standard tunnel → must land on its deck, never inside
  const runs: string[] = []; let tunA = -1;
  for (let i = 1; i < N; i++) if (S[i].roof > 0 && !(S[i - 1].roof > 0)) { let e = i; while (e < N - 1 && S[e + 1].roof > 0) e++; let lo = 1e9, rMax = 0; for (let k = i; k <= e; k++) { lo = Math.min(lo, S[k].y); rMax = Math.max(rMax, S[k].roof); }
    runs.push(`${['?', 'std', 'sea', 'cave', 'under'][S[i].tun ?? 1]} ${(e - i) * 2}m(h${rMax.toFixed(0)})${td.seaY !== undefined && S[i].tun === 2 ? ` [${(lo - td.seaY).toFixed(1)}m vs sea]` : ''}`); if (tunA < 0 && S[i].tun === 1 && i > 80) tunA = i; }
  let lifted = false, deckFrames = 0, teleports = 0, dbgT = 0; const prevY = pods.map(p => p.pos.y), prevInv = pods.map(p => p.invuln);
  let tunnels = 0, tunLen = 0; for (let i = 1; i < N; i++) { if (S[i].roof > 0) { tunLen += 2; if (!(S[i - 1].roof > 0)) tunnels++; } }
  const prog0 = pods.map(p => p.prog); const wasDead = pods.map(() => false); const partsLost = new Map<string, number>();
  let deaths = 0, nan = 0, wall = 0, clear = 9, airMax = 0, rolls = 0, slides = 0, dives = 0, aiFrames = 0, breaks = 0, ohHits = 0, zgV = 0, zgN = 0, gV = 0, gN = 0, t = 0, worst = '', airDbg = '', air0 = 0, air0Dist = 0;
  const h = 1 / 120, frames = SECS * 60;
  let zgHits = 0, zgWall = 0; // zero-G (2026-11-23): boulders hit, tube wall touched – by all eleven rivals together
  const snN = pods.map(() => 0), snCut = pods.map(() => 0), snV = pods.map(() => 0); // 3D snow: frames on the powder field, how much of the snow ahead was cut, speed
  for (let f = 0; f < frames; f++) {
    t += 1 / 60;
    for (const p of pods) { aiInputs(p, td, pods, t, null); if (p.input.roll) rolls++; aiFrames++; if (p.ai?.dive) dives++; }
    { // pod 0: scripted manual-control stress on top of the AI line
      const p = pods[0], ph = t % 8;
      if (ph > 5 && ph < 6.2) p.input.roll = Math.floor(t / 8) % 2 ? 1 : -1;
      if (ph > 2 && ph < 3) p.input.pitch = 1; else if (ph > 3.4 && ph < 4.2) p.input.pitch = -1;
      if (ph > 6.6 && ph < 7.3 && Math.abs(p.input.steer) > 0.2) p.input.airbrake = true;
      if (process.env.PITCH_AIR !== undefined) { p.input.roll = 0; p.input.pitch = p.grounded ? 0 : Number(process.env.PITCH_AIR); } // jump experiment: fixed airborne pitch for pod 0
      if (p.dead <= 0 && p.air > air0) { air0 = p.air; air0Dist = Math.hypot(p.vel.x, p.vel.z) * p.air; }
    }
    if (t < 8) for (let a = 0; a < pods.length; a++) for (let b2 = a + 1; b2 < pods.length; b2++) { // start phase: which pairs touch?
      const A = pods[a], B = pods[b2], R = (podParams(A).width + podParams(B).width) * 0.8;
      if (Math.abs(A.pos.y - B.pos.y) < 3 && Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z) < R * 1.01) touch.add(a * 16 + b2);
    }
    for (const p of pods) { if (p.dead > 0) continue; const v = Math.hypot(p.vel.x, p.vel.z); if (p.zeroG) { zgV += v; zgN++; } else if (t > 6) { gV += v; gN++; } }
    if (td.snow) for (let k = 0; k < pods.length; k++) { const p = pods[k]; if (p.dead > 0 || !p.grounded || p.path !== 0 || S[p.idx]?.surf !== SURF.powder) continue; snN[k]++; snCut[k] += p.snowPack ?? 0; snV[k] += Math.hypot(p.vel.x, p.vel.z); }
    // (no lift in the last 2 s of the run: it would end before the pod has spent its 20 frames on the deck – a false alarm)
    if (tunA >= 0 && !lifted && t < SECS - 2) { const p = pods[1]; if (p.path === 0 && p.dead <= 0 && p.idx >= tunA - 12 && p.idx < tunA - 5) { p.pos.y += S[tunA].roof + 9; p.vel.y = 0; lifted = true; if (process.env.DEBUG) dbgT = t; } }
    if (process.env.DEBUG && lifted && t - dbgT < 1.2 && f % 6 === 0) { const p = pods[1], q = td.paths[p.path].samples[p.idx]; console.log(`   dbg t=${(t - dbgT).toFixed(2)} path=${p.path} idx=${p.idx} tunA=${tunA} y-ground=${(p.pos.y - q.y).toFixed(1)} roof=${q.roof} upper=${p.upper} inRoof=${p.inRoof} dead=${p.dead.toFixed(1)} lat=${p.lat.toFixed(0)} hw=${q.hw.toFixed(0)}`); }
    for (let k = 0; k < 2; k++) { for (const p of pods) stepPod(p, td, h, t, GRIP, false); collidePods(pods, t, td); }
    pods.forEach((p, i) => { if (p.upper) deckFrames++; const reset = p.invuln > prevInv[i] + 1; prevInv[i] = p.invuln; /* (invulnerability jumped up = respawned in this frame, e.g. the AI's stuck recovery: a reset, not a teleport – exactly that one frame is left out) */ if (p.dead <= 0 && prevY[i] - p.pos.y > 4.5 && i !== 1 && !reset) { teleports++; if (process.env.DEBUG) console.log(`   teleport: pod${i} ${p.def.id} t=${t.toFixed(1)} path=${p.path} idx=${p.idx}/${td.paths[p.path].samples.length} finishIdx=${td.finishIdx} closed=${td.main.closed} dy=${(prevY[i] - p.pos.y).toFixed(1)} invuln=${p.invuln.toFixed(2)} hp=${p.hpL.toFixed(0)}/${p.hpR.toFixed(0)} roof=${td.paths[p.path].samples[p.idx].roof} tun=${td.paths[p.path].samples[p.idx].tun} upper=${p.upper} inRoof=${p.inRoof} grounded=${p.grounded} vy=${p.vel.y.toFixed(1)} y-ground=${(p.pos.y - td.paths[p.path].samples[p.idx].y).toFixed(1)} lat=${p.lat.toFixed(1)} hw=${td.paths[p.path].samples[p.idx].hw.toFixed(1)} bridge=${(td.paths[p.path].samples[p.idx] as { bridge?: unknown }).bridge} underpass=${(td.paths[p.path].samples[p.idx] as { underpass?: unknown }).underpass} gap=${td.paths[p.path].samples[p.idx].gap} ramp=${td.paths[p.path].samples[p.idx].ramp}`); } prevY[i] = p.pos.y; }); // > 4.5 m down within one frame = teleport
    for (const hz of td.hazards) {
      const ph = (((t + hz.phase) % hz.period) + hz.period) % hz.period; hz.state = ph < hz.period * hz.duty ? 1 : ph > hz.period - 1 ? 0.5 : 0;
      if (hz.state < 1) continue;
      for (const p of pods) { if (p.dead > 0) continue; const dx = p.pos.x - hz.x, dz = p.pos.z - hz.z; if (dx * dx + dz * dz > hz.r ** 2 || p.pos.y > hz.y + 18) continue; const P = podParams(p); if (p.invuln <= 0) applyDamage(p, 'both', 12 / 60 * P.sturdy, 'heat'); p.heat = Math.min(1, p.heat + 0.55 / 60); p.vel.y += 28 / 60; }
    }
    pods.forEach((p, i) => {
      for (const ev of p.events) { if (p.zeroG && ev.type === 'obstacle') zgHits++; if (p.zeroG && ev.type === 'field') zgWall++; if (ev.type === 'part') { const b = damageModel(p.def.id).parts[ev.part ?? 0]; partsLost.set(b.label, (partsLost.get(b.label) ?? 0) + 1); } if (ev.type === 'break') breaks++; if (ev.type === 'wall' && ev.nx === 0 && ev.nz === 0 && ev.y > 0 && ohIdx >= 0 && Math.abs(p.idx - ohIdx) < 8) ohHits++; }
      p.events.length = 0;
      if (!isFinite(p.pos.x + p.pos.y + p.pos.z + p.vel.x + p.vel.y + p.vel.z + p.yaw + p.roll + p.pitch)) nan++;
      if (p.dead > 0) { if (!wasDead[i]) deaths++; wasDead[i] = true; p.dead -= 1 / 60; if (p.dead <= 0) respawn(p, td); return; }
      wasDead[i] = false; if (p.sliding) slides++;
      if (p.air > airMax) { airMax = p.air; if (process.env.DEBUG) airDbg = `pod${i} t=${t.toFixed(1)} air=${p.air.toFixed(1)} idx=${p.idx} path=${p.path} h=${(p.pos.y - p.groundY).toFixed(1)} vy=${p.vel.y.toFixed(1)} lat=${p.lat.toFixed(1)} pitchIn=${p.input.pitch} zeroG=${p.zeroG}`; }
      const path = td.paths[p.path], s = path.samples[p.idx]; const lat = (p.pos.x - s.x) * s.rx + (p.pos.z - s.z) * s.rz;
      if (!s.gap) wall = Math.max(wall, Math.abs(lat) - (lat > 0 ? s.wallR : s.wallL));
      if (p.grounded && !p.zeroG && !s.gap) { // 3D ground clearance of cockpit + both engines (same envelope the game clamps)
        const env = podEnvelope(p.def), cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), sinP = Math.sin(p.pitch), sinR = Math.sin(p.roll);
        const at = (lx: number, lz: number) => roadSurfaceAt(path, p.idx, p.pos.x + lx * cy + lz * sy, p.pos.z - lx * sy + lz * cy);
        const ck = at(0, env.cockpit.z); if (!ck.gap) clear = Math.min(clear, p.pos.y + env.cockpit.minY - env.cockpit.z * sinP - ck.y);
        for (const [e, ey] of [[env.engL, p.engYL ?? 0], [env.engR, p.engYR ?? 0]] as const) {
          const a = at(e.outerX, e.frontZ), b = at(e.outerX, e.backZ); if (a.gap || b.gap) continue;
          // lowest point under roll: engine barrel (radius = -minY) or the outboard wing tip (at axis height once rolled)
          const base = p.pos.y + ey + Math.min(e.x * sinR + e.minY, e.outerX * sinR + e.minY * Math.abs(Math.cos(p.roll)));
          const cl = Math.min(base - e.frontZ * sinP - a.y, base - e.backZ * sinP - b.y); if (cl < clear) { clear = cl; if (process.env.DEBUG) worst = `pod${i} t=${t.toFixed(1)} roll=${p.roll.toFixed(2)} pitch=${p.pitch.toFixed(2)} rollCtl=${(p.rollCtl ?? 0).toFixed(2)} h=${(p.pos.y - p.groundY).toFixed(2)} bank=${s.bank.toFixed(2)} lat=${lat.toFixed(1)} hw=${s.hw.toFixed(1)} engY=${ey.toFixed(2)} ex=${e.x.toFixed(1)}/${e.outerX.toFixed(1)} minY=${e.minY.toFixed(2)} fz=${e.frontZ.toFixed(1)} bz=${e.backZ.toFixed(1)} ramp=${s.ramp.toFixed(1)} idx=${p.idx} vy=${p.vel.y.toFixed(1)}`; }
        }
      }
    });
  }
  const speeds = pods.map((p, i) => (p.prog - prog0[i]) * 2 / SECS); const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length, slow = Math.min(...speeds);
  const divePct = dives / Math.max(1, aiFrames) * 100;
  { let turns = 0, sg = 0, wide = 0; const med = S.map(q => q.hw).sort((a, b) => a - b)[N >> 1];
    for (let i = 0; i < N; i++) { const c = S[i].curv, g = Math.abs(c) > 1 / 420 ? Math.sign(c) : 0; if (g !== 0 && g !== sg) turns++; if (g !== 0) sg = g; if (S[i].hw > Math.min(med * 1.45, 45)) wide++; }
    const nSc = td.paths.filter(p => p.id > 0 && !p.isCave).length, nCv = td.paths.filter(p => p.isCave).length;
    const cxStr = td.crossings.length ? ` · ${td.crossings.length} crossing(s) (${td.crossings.map(c => `${c.tunnelUnder ? 'bridge+tunnel' : 'viaduct'} Δy=${c.clearance.toFixed(0)}m`).join(', ')})` : '';
    console.log(`  layout: ${(N * 2 / 1000).toFixed(2)} km · ${turns} corners · ${nSc} shortcut(s) · ${nCv} cave-branch(es)${cxStr} · open flats ${wide * 2} m`); }
  if (runs.length && process.env.DEBUG !== '0') console.log(`  tunnels: ${runs.join(' · ')}`);
  if (lifted) console.log(`  deck self-test: ${deckFrames} frames on a tunnel deck (${deckFrames > 20 ? 'ok' : 'FAIL'}), downward teleports: ${teleports}`);
  if (zgN > 200) console.log(`  zero-G: avg ${(zgV / zgN).toFixed(0)} m/s in the tubes vs ${(gV / Math.max(1, gN)).toFixed(0)} m/s outside · ${td.zgRocks.length} boulders, hit ${zgHits} × · tube wall touched ${zgWall} ×`);
  if (ohIdx >= 0) console.log(`  overhead self-test: ${ohHits} hits registered (${ohHits > 0 ? 'ok' : 'FAIL'})`);
  if (td.snow && snN.some(n => n > 30)) { // who ploughed, who followed (2026-11-23: fresh powder 86 % top speed, a trench 99 %)
    const rows = pods.map((_, k) => ({ k, n: snN[k], cut: snCut[k] / Math.max(1, snN[k]), v: snV[k] / Math.max(1, snN[k]) })).filter(r => r.n > 30).sort((a, b) => a.cut - b.cut);
    const mean = rows.reduce((a, r) => a + r.cut, 0) / rows.length;
    console.log(`  powder: ${rows.length} pods crossed it – snow ahead already cut: ${(rows[0].cut * 100).toFixed(0)} % (the one that ploughed most, ${rows[0].v.toFixed(0)} m/s) … ${(rows[rows.length - 1].cut * 100).toFixed(0)} % (${rows[rows.length - 1].v.toFixed(0)} m/s), mean ${(mean * 100).toFixed(0)} %`);
  }
  if (DAMAGE_RULES.parts) { const n = [...partsLost.values()].reduce((a, b) => a + b, 0); console.log(`  parts lost: ${n}${n ? ' (' + [...partsLost].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, k]) => `${l} ×${k}`).join(', ') + ')' : ''}`); }
  const bad = (lifted && deckFrames <= 20) || teleports > 0 || (ohIdx >= 0 && ohHits === 0) || divePct > LIMIT.divePct || nan > 0 || deaths > LIMIT.deaths || wall > LIMIT.wall || clear < LIMIT.clear || slow < LIMIT.minSpeed;
  if (bad) failed++; if (process.env.PITCH_AIR !== undefined) console.log(`  pod0 airborne pitch ${process.env.PITCH_AIR}: longest flight ${air0.toFixed(2)} s ≈ ${air0Dist.toFixed(0)} m`);
  if (process.env.DEBUG) console.log('  worst:', worst, '\n  air:', airDbg, 'gap@idx', td.paths[0].samples.map((q, k) => q.gap ? k : -1).filter(k => k >= 0 && (k % 8 === 0)).join(','));
  console.log(`${def.id.padEnd(13)} ${String(deaths).padStart(5)} ${String(nan).padStart(5)} ${wall.toFixed(2).padStart(7)}m ${clear.toFixed(2).padStart(7)}m ${avg.toFixed(0).padStart(6)}m/s ${slow.toFixed(0).padStart(5)}m/s ${airMax.toFixed(1).padStart(6)}s ${String(rolls).padStart(6)} ${String(slides).padStart(7)} ${divePct.toFixed(1).padStart(5)}% ${(breaks + '/' + nBreakable).padStart(8)} ${String(touch.size).padStart(10)} ${(tunnels + '×/' + tunLen + 'm').padStart(9)}  ${bad ? 'FAIL' : 'ok'}`);
}
console.log(failed ? `\n${failed} track(s) FAILED (limits: deaths ≤ ${LIMIT.deaths}, wallPen ≤ ${LIMIT.wall} m, minClear ≥ ${LIMIT.clear} m, slowest ≥ ${LIMIT.minSpeed} m/s)` : '\nAll tracks passed.');
process.exit(failed ? 1 : 0);
