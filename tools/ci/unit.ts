// Headless unit checks for pure game logic (part of `npm run check`). No framework: tiny test / expect helpers.
// Env: ONLY=<substring> runs only the tests whose name contains it.
import * as THREE from 'three';
import { PILOTS, PODS, STAT_KEYS, TRACKS, type PodDef, type StatKey } from '../../src/game/data';
import { podLayout } from '../../src/game/podLayouts';
import { cockpitGeo } from '../../src/game/podCockpits';
import { engineExtent, engineGeo } from '../../src/game/podParts';
import { podCollision, podEnvelope, podHeight } from '../../src/game/podDesigns';
import { assembleHero, assembleRival, segFor, visibleIndices, type BreakShow } from '../../src/game/podAssembly';
import { pickRivals, rivalKit } from '../../src/game/roster';
import { engineKit, tuneTiers, NO_KIT } from '../../src/game/podKitParts';
import { ciRoster } from './roster';
import { applyDamage, bodyToWorld, podParams, respawn, stepPod, worldToBody, FX_NONE, HOVER, type PodState } from '../../src/game/physics';
import { DAMAGE_RULES, damageModel, partLamps, partsFx, zoneFactor, type DamageZone } from '../../src/game/podDamage';
import { buildTrack, tunnelCeiling, TUNNEL_SHOULDER, type TrackData } from '../../src/game/trackBuilder';
import { effectiveStats, loadProfile, saveProfile } from '../../src/game/settings';

let failed = 0, passed = 0;
const ONLY = process.env.ONLY;
function test(name: string, fn: () => void) {
  if (ONLY && !name.includes(ONLY)) return;
  try { fn(); passed++; } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}
function ok(v: unknown, msg = 'expected a truthy value') { if (!v) throw new Error(msg); }
function throws(fn: () => void, re: RegExp) {
  try { fn(); } catch (e) { if (!re.test((e as Error).message)) throw new Error(`threw "${(e as Error).message}", expected ${re}`); return; }
  throw new Error('did not throw');
}

// ------------------------------------------------------------------ pod layouts
test('podLayout: every pod in PODS has its own layout', () => { for (const p of PODS) ok(podLayout(p).engines.length >= 2, p.id); });
test('podLayout: an unknown pod id throws instead of silently building another pod', () => {
  throws(() => podLayout({ ...PODS[0], id: 'no-such-pod' }), /no layout.*no-such-pod/i);
});

// ------------------------------------------------------------------ cockpits
const triCount = (g: { index: { count: number } | null; attributes: { position: { count: number } } }) => (g.index ? g.index.count : g.attributes.position.count) / 3;
/** Shape fingerprint of a cockpit: triangles per material bucket (pilot excluded – two racers may share a head variant). */
function cockpitPrint(id: string) {
  const def = PODS.find(p => p.id === id)!; const ck = cockpitGeo(podLayout(def), 28, 'goggles', 1);
  return [...ck.parts].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => `${k}:${triCount(g)}`).join(' ');
}
test('cockpits: no two pods share the same cockpit', () => {
  const seen = new Map<string, string>();
  for (const p of PODS) { const f = cockpitPrint(p.id); const twin = seen.get(f); if (twin) throw new Error(`${p.id} has the same cockpit as ${twin}`); seen.set(f, p.id); }
});
test('cockpits: the pilot body is its own part set (the cockpit camera hides it) and the eye sits in the head', () => {
  for (const p of PODS) {
    const ck = cockpitGeo(podLayout(p), 28, 'goggles', 1);
    ok(ck.pilot.size > 0, `${p.id}: no pilot part set`);
    ok(ck.info.eye.distanceTo(ck.info.head) < 0.2 * podLayout(p).cockpit.pilot + 0.05, `${p.id}: eye is not at the head`);
  }
});
test('cockpits: every cockpit has the three live dash lamps (boost, heat, damage)', () => {
  for (const p of PODS) { const ck = cockpitGeo(podLayout(p), 28, 'goggles', 1); eq(ck.lampCount, 3, p.id); ok(ck.lamps && ck.lamps.attributes.color, `${p.id}: lamp geometry without colours`); }
});
test('cockpits: the lite build for Gegner is much lighter than the full one', () => {
  for (const p of PODS) {
    const sum = (ck: ReturnType<typeof cockpitGeo>) => [...ck.parts.values(), ...ck.pilot.values()].reduce((s, g) => s + triCount(g), 0);
    const lite = sum(cockpitGeo(podLayout(p), 14, 'goggles', 0)), full = sum(cockpitGeo(podLayout(p), 28, 'goggles', 1));
    ok(lite < 4600, `${p.id}: lite cockpit has ${lite} triangles (limit 4600)`); ok(lite < full * 0.5, `${p.id}: lite ${lite} is not under half of full ${full}`);
  }
});

// ------------------------------------------------------------------ cockpit height (user request at the Phase 2 stop: "cockpits further up")
test('cockpit height: every cockpit rides above the engine line and its pilot looks over the lower engines', () => {
  for (const p of PODS) {
    const L = podLayout(p), c = L.cockpit; const eyeY = c.y + cockpitGeo(L, 28, 'goggles', 1).info.eye.y;
    const axis = Math.min(...L.engines.map(e => e.y));                                                       // axis of the lower engines
    const top = Math.max(...L.engines.filter(e => e.y === axis).map(e => e.y + engineExtent(e.spec).top));     // … and their top edge
    const floor = c.y - c.hw * 0.68 - 0.14;                                                                    // lowest point of the visible tub
    ok(floor >= axis, `${p.id}: cockpit floor ${floor.toFixed(2)} m hangs below the lower engine axis ${axis.toFixed(2)} m`);
    ok(eyeY >= top + 0.25, `${p.id}: eye ${eyeY.toFixed(2)} m is not 0.25 m above the lower engines' top ${top.toFixed(2)} m`);
  }
});
test('cockpit height: the strobe light stays on the visible cockpit, above the pilot', () => {
  for (const p of PODS) {
    const L = podLayout(p); const eyeY = L.cockpit.y + cockpitGeo(L, 28, 'goggles', 1).info.eye.y, topY = podEnvelope(p).cockpit.topY;
    ok(topY > eyeY + 0.2, `${p.id}: strobe at ${topY.toFixed(2)} m, eye at ${eyeY.toFixed(2)} m`);
  }
});

// ------------------------------------------------------------------ Session 20 / Phase 3: four new racers
const NEW_PODS = ['cyclone', 'halo', 'manta', 'volt'];
const podById = (id: string) => { const p = PODS.find(x => x.id === id); if (!p) throw new Error(`pod "${id}" is not in PODS`); return p; };
test('new racers: Cyclone, Halo, Manta and Voltspire are in the roster, each with a pilot of its own', () => {
  for (const id of NEW_PODS) {
    const p = podById(id);
    ok(PILOTS.some(x => x.id === p.pilotId), `${id}: pilot "${p.pilotId}" is not in PILOTS`);
    eq(PODS.filter(x => x.pilotId === p.pilotId).length, 1, `${id}: pods sharing its pilot`);
  }
  eq(PODS.length, 14, 'pods');
});
test('new racers: nothing hangs lower than 1.9 m under the pod origin or reaches further out than 4.6 m', () => {
  for (const id of NEW_PODS) {
    const p = podById(id), env = podEnvelope(p), low = Math.min(env.engL.minY, env.engR.minY, env.cockpit.minY);
    const wide = Math.max(Math.abs(env.engL.outerX), Math.abs(env.engR.outerX), podCollision(p).halfW);
    ok(low >= -1.9, `${id}: lowest point ${low.toFixed(2)} m`); ok(wide <= 4.6, `${id}: half width ${wide.toFixed(2)} m`);
  }
});
test('new racers: ring wings and rotor hoops stay within 1.85 m of the engine axis', () => {
  for (const id of ['cyclone', 'halo']) for (const e of podLayout(podById(id)).engines) { const x = engineExtent(e.spec), r = Math.max(x.side, x.bottom); ok(r <= 1.85 + 1e-9, `${id}: ${r.toFixed(3)} m`); }
});
test('new racers: the ground clamp is the real cockpit floor (no keel)', () => { for (const id of NEW_PODS) ok(!podLayout(podById(id)).cockpit.keel, id); });
test('Cyclone: the big rotors turn on Gegner pods too (one own mesh per engine, not merged into the static parts)', () => {
  const p = podById('cyclone'), a = assembleRival(p, 14, 'maul', p.colors);
  for (const b of a.banks) eq(b.rotors.length, 1, `rotors of bank ${b.side}`);
  for (const b of assembleRival(PODS[0], 14, 'goggles', PODS[0].colors).banks) eq(b.rotors.length, 0, `${PODS[0].id} (enclosed fan) rotors`);
});
test('Voltspire: its three arcs are one binder mesh and stay 2.5 m behind the engine fronts (free view from the hood camera)', () => {
  const p = podById('volt'), L = podLayout(p); eq(L.binders.length, 3, 'arcs in the layout');
  const h = assembleHero(p, 28, 'optic'); eq(h.binders.length, 1, 'binder meshes of the player pod');
  eq(assembleRival(p, 14, 'optic', p.colors).binders.length, 1, 'binder meshes of a Gegner');
  const front = Math.min(...L.engines.map(e => e.z + engineExtent(e.spec).halfL)); h.binders[0].computeBoundingBox();
  const maxZ = h.binders[0].boundingBox!.max.z - 0.4; // the ribbon is 0.4 m wide around its centre line
  ok(maxZ <= front - 2.5 + 1e-6, `foremost arc at z = ${maxZ.toFixed(2)}, engine front at ${front.toFixed(2)}`);
});
test('Voltspire: its engines are mostly closed – painted outer skin covers at least 65 % of the barrel (user: "zu offen")', () => {
  const s = podLayout(podById('volt')).engines[0].spec, g = engineGeo(s, 28).parts.get('hull')!;
  const p = g.attributes.position, ix = g.index!.array; let skin = 0;
  for (let t = 0; t < ix.length; t += 3) { // area of the triangles that face outwards and lie on the barrel
    const a = [0, 1, 2].map(k => [p.getX(ix[t + k]), p.getY(ix[t + k]), p.getZ(ix[t + k])]);
    const u = [a[1][0] - a[0][0], a[1][1] - a[0][1], a[1][2] - a[0][2]], v = [a[2][0] - a[0][0], a[2][1] - a[0][1], a[2][2] - a[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], area = Math.hypot(n[0], n[1], n[2]) / 2;
    const cx = (a[0][0] + a[1][0] + a[2][0]) / 3, cy = (a[0][1] + a[1][1] + a[2][1]) / 3, rad = Math.hypot(cx, cy);
    if (area > 0 && rad > 0.9 * s.R && (n[0] * cx + n[1] * cy) / (2 * area * rad) > 0.5) skin += area;
  }
  const share = skin / (2 * Math.PI * s.R * s.L);
  ok(share >= 0.65, `outer skin covers ${(share * 100).toFixed(0)} % of the barrel`);
});
test('Quadra Lumber keeps its X: binders between different engine pairs stay separate meshes', () => {
  const p = podById('bomquad'); eq(assembleHero(p, 28, 'dome').binders.length, 2); eq(assembleRival(p, 14, 'dome', p.colors).binders.length, 2);
});

// ------------------------------------------------------------------ Session 20 / Phase 4: tuning look (Tuning-Teile + Style-Teile)
const ZERO = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>;
/** size of a kit: triangles of its parts, plus a big number per extra flap and for enlarged flaps (those are meshes, not parts) */
function kitSize(spec: Parameters<typeof engineKit>[0], kit: Parameters<typeof engineKit>[2]) {
  const k = engineKit(spec, 28, kit), base = engineGeo(spec, 28).flaps; let n = 0;
  for (const g of k.parts.values()) n += triCount(g);
  n += Math.max(0, k.flaps.length - base.length) * 5000;
  k.flaps.forEach((f, i) => { if (base[i]) { f.geo.computeBoundingBox(); base[i].geo.computeBoundingBox(); if (f.geo.boundingBox!.min.z < base[i].geo.boundingBox!.min.z - 0.01) n += 1000; } });
  return n;
}
const kitPrint = (spec: Parameters<typeof engineKit>[0], kit: Parameters<typeof engineKit>[2]) => [...engineKit(spec, 28, kit).parts].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => `${k}:${triCount(g)}`).join(' ');
test('tuning tiers: step 0–1 shows no part, 2–3 the small one, 4–5 the big one', () => {
  eq([0, 1, 2, 3, 4, 5].map(s => tuneTiers({ ...ZERO, topSpeed: s }).topSpeed), [0, 0, 1, 1, 2, 2]); eq(tuneTiers(undefined).accel, 0, 'no tuning');
});
test('kit: Werk (no Style-Teil, no tuning) adds nothing', () => { for (const p of PODS) eq(kitSize(podLayout(p).engines[0].spec, NO_KIT), 0, p.id); });
test('kit: every Style-Teil choice adds parts of its own on every engine style', () => {
  for (const p of PODS) for (const slot of ['fins', 'intake', 'nozzle'] as const) {
    const s = podLayout(p).engines[0].spec, seen = new Set<string>();
    for (let c = 1; c <= 3; c++) { ok(kitSize(s, { ...NO_KIT, [slot]: c }) > 0, `${p.id}: ${slot} ${c} adds nothing`); seen.add(kitPrint(s, { ...NO_KIT, [slot]: c })); }
    eq(seen.size, 3, `${p.id}: different ${slot} choices`);
  }
});
test('kit: every tuning value shows a part at tier 1 and more at tier 2 on every engine style', () => {
  for (const p of PODS) for (const st of STAT_KEYS) {
    const s = podLayout(p).engines[0].spec, a = kitSize(s, { ...NO_KIT, tune: { ...ZERO, [st]: 1 } }), b = kitSize(s, { ...NO_KIT, tune: { ...ZERO, [st]: 2 } });
    ok(a > 0, `${p.id}: ${st} tier 1 shows nothing`); ok(b > a, `${p.id}: ${st} tier 2 (${b}) is not more than tier 1 (${a})`);
  }
});
test('kit: Gegner get their Style-Teile from a seeded draw (same seed = same parts, every value 0..3)', () => {
  eq(rivalKit(42), rivalKit(42)); const seen = new Set<number>();
  for (let s = 0; s < 60; s++) { const k = rivalKit(s); for (const v of [k.fins, k.intake, k.nozzle, k.canopy]) { ok(Number.isInteger(v) && v >= 0 && v <= 3, `seed ${s}: ${v}`); seen.add(v); } }
  eq(seen.size, 4, 'values ever drawn');
});

// ------------------------------------------------------------------ who races: Gegner draw (game) and the CI grid
/** deterministic random source for the draw */
const lcg = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
test('Gegner draw: different pods, never the player\'s own, as many as asked for', () => {
  for (const n of [0, 1, 7, 10]) {
    const r = pickRivals('halo', n, lcg(7)); eq(r.length, n, `${n} Gegner`);
    eq(new Set(r.map(p => p.id)).size, n, 'different pods'); ok(!r.some(p => p.id === 'halo'), 'the player\'s pod was drawn');
  }
  eq(pickRivals('aurora', 99, lcg(1)).length, PODS.length - 1, 'more asked for than there are pods');
});
test('Gegner draw: every other pod gets its turn, the order changes from race to race', () => {
  const seen = new Set<string>(), first = new Set<string>();
  for (let s = 1; s <= 40; s++) { const r = pickRivals('aurora', 10, lcg(s * 977)); r.forEach(p => seen.add(p.id)); first.add(r[0].id); }
  eq(seen.size, PODS.length - 1, 'pods ever drawn'); ok(first.size >= 5, `only ${first.size} different pods ever on the first Gegner slot`);
});
test('CI grid: 11 different pods per track, and every pod is driven on some track', () => {
  const driven = new Set<string>();
  for (let t = 0; t < 13; t++) { const r = ciRoster(t); eq(r.length, 11, `track ${t}`); eq(new Set(r.map(p => p.id)).size, 11, `track ${t}: different pods`); r.forEach(p => driven.add(p.id)); }
  eq(driven.size, PODS.length, 'pods driven');
});
test('CI grid: the old grid (first ten pods + the first again) is still available for A/B runs', () => {
  eq(ciRoster(5, true).map(p => p.id), [...PODS.slice(0, 10), PODS[0]].map(p => p.id));
});

// ------------------------------------------------------------------ damage plumbing
function eq(a: unknown, b: unknown, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b), cut = (s: string) => (s && s.length > 160 ? s.slice(0, 160) + ' …' : s);
  if (A !== B) throw new Error(`${msg} expected ${cut(B)}, got ${cut(A)}`);
}
/** Just enough of a pod for the pure damage / parameter functions (the player's Aurora XR-7 unless told otherwise). */
function pod(over: Partial<PodState> = {}): PodState {
  const stats = Object.fromEntries(STAT_KEYS.map(k => [k, 0.5])) as Record<StatKey, number>;
  return { def: PODS[0], isPlayer: true, stats, hpL: 100, hpR: 100, events: [], pos: new THREE.Vector3(), vel: new THREE.Vector3(), ...over } as unknown as PodState;
}
const near = (a: number, b: number, msg = '') => { if (!(Math.abs(a - b) < 1e-9)) throw new Error(`${msg} expected ${b}, got ${a}`); };
/** the plain rule (no Panzerzonen, no Bruchteile): for the checks of which engine side pays */
function plain(fn: () => void) { const was = { ...DAMAGE_RULES }; DAMAGE_RULES.armor = false; DAMAGE_RULES.parts = false; try { fn(); } finally { Object.assign(DAMAGE_RULES, was); } }
test('applyDamage: a hit on the left side costs only the left engine', () => plain(() => { const p = pod(); applyDamage(p, -1, 10, 'side'); eq([p.hpL, p.hpR], [90, 100]); }));
test('applyDamage: a hit on the right side costs only the right engine', () => plain(() => { const p = pod(); applyDamage(p, 1, 10, 'side'); eq([p.hpL, p.hpR], [100, 90]); }));
test('applyDamage: a hit without a side (cockpit, landing, ceiling) is split half and half', () => plain(() => { const p = pod(); applyDamage(p, 0, 10, 'top'); eq([p.hpL, p.hpR], [95, 95]); }));
test("applyDamage: 'both' costs each engine the full amount (overdrive, geyser, portal lip)", () => plain(() => { const p = pod(); applyDamage(p, 'both', 10, 'heat'); eq([p.hpL, p.hpR], [90, 90]); }));

// ------------------------------------------------------------------ Schadensmodell: Panzerzonen + Bruchteile (Phase 5)
const ZONES: DamageZone[] = ['front', 'side', 'top', 'belly', 'heat'];
const FX_KEYS = Object.keys(FX_NONE) as (keyof typeof FX_NONE)[];
const byId = (id: string) => PODS.find(p => p.id === id)!;
/** ids of the Bruchteile a pod has lost */
const lost = (p: PodState) => damageModel(p.def.id).parts.filter((_, i) => ((p.parts ?? 0) >> i) & 1).map(b => b.id);
const bitOf = (podId: string, partId: string) => { const i = damageModel(podId).parts.findIndex(b => b.id === partId); if (i < 0) throw new Error(`${podId} has no Bruchteil "${partId}"`); return 1 << i; };

test('Schadensmodell: every racer has one of its own (an unknown pod id throws)', () => {
  const seen = new Map<string, string>();
  for (const p of PODS) {
    const m = damageModel(p.id), key = JSON.stringify([m.armor, m.parts.map(b => [b.step, b.side, b.fx, b.guard])]);
    ok(m.parts.length >= 3, `${p.id}: ${m.parts.length} Bruchteile`); ok(!seen.has(key), `${p.id} breaks exactly like ${seen.get(key)}`); seen.set(key, p.id);
    eq(new Set(m.parts.map(b => b.id)).size, m.parts.length, `${p.id}: Bruchteil ids must differ`);
  }
  throws(() => damageModel('no-such-pod'), /no Schadensmodell.*no-such-pod/i);
});
test('Schadensmodell: the Panzerzonen of an intact racer average about 1 (0.9–1.1), each between 0.4 and 1.3', () => {
  for (const p of PODS) {
    const m = damageModel(p.id); let sum = 0;
    for (const z of ZONES) { const f = (zoneFactor(m, 0, -1, z) + zoneFactor(m, 0, 1, z)) / 2; ok(f >= 0.4 && f <= 1.3, `${p.id} ${z} × ${f}`); sum += f; }
    ok(sum / 5 >= 0.9 && sum / 5 <= 1.1, `${p.id}: mean × ${(sum / 5).toFixed(3)}`);
  }
});
test('Schadensmodell: steps are 50 / 35 / 20 % and every HUD box has exactly one Bruchteil per step', () => {
  for (const p of PODS) {
    const m = damageModel(p.id);
    for (const b of m.parts) ok([50, 35, 20].includes(b.step) && [-1, 0, 1].includes(b.side), `${p.id} ${b.id}: step ${b.step}, side ${b.side}`);
    for (const sd of [-1, 1]) for (const step of [50, 35, 20]) eq(m.parts.filter(b => b.step === step && (b.side === sd || b.side === 0)).length, 1, `${p.id}: Bruchteile at ${step} % in box ${sd}:`);
  }
});
test('Schadensmodell: every Bruchteil has a name and a mild effect (5–10 % per number) or guards a Panzerzone', () => {
  for (const p of PODS) for (const b of damageModel(p.id).parts) {
    ok(b.label.length > 2, `${p.id} ${b.id}: label`); ok(b.fx || b.guard, `${p.id} ${b.id}: no effect`);
    for (const [k, v] of Object.entries(b.fx ?? {})) ok(k === 'heatRate' ? v >= 1.05 && v <= 1.1 : v >= 0.9 && v <= 0.95, `${p.id} ${b.id}: ${k} × ${v}`);
    for (const [z, v] of Object.entries(b.guard ?? {})) ok(v >= 0.5 && v <= 0.9, `${p.id} ${b.id}: guard ${z} × ${v}`);
  }
});
test('Bruchteile: lost parts multiply up, but no number loses more than 15 %', () => {
  const m = damageModel('aurora');
  eq(partsFx(m, 0, false), FX_NONE);
  const one = partsFx(m, bitOf('aurora', 'wingL'), false); near(one.grip, 0.93); eq(one.turn, 1);
  near(partsFx(m, (1 << m.parts.length) - 1, false).grip, 0.85, 'Aurora without its four wing plates (would be -24 % grip):');
  for (const p of PODS) {
    const mm = damageModel(p.id), f = partsFx(mm, (1 << mm.parts.length) - 1, false);
    for (const k of FX_KEYS) ok(k === 'heatRate' ? f[k] >= 1 && f[k] <= 1.15 + 1e-9 : f[k] <= 1 && f[k] >= 0.85 - 1e-9, `${p.id} with every part lost: ${k} × ${f[k]}`);
  }
});
test('Bruchteile: a Gegner feels only half of each effect', () => {
  const m = damageModel('aurora');
  near(partsFx(m, bitOf('aurora', 'gyro'), false).turn, 0.92); near(partsFx(m, bitOf('aurora', 'gyro'), true).turn, 0.96);
  const p = pod({ isPlayer: false }); applyDamage(p, -1, 55, 'top'); eq(lost(p), ['wingL']); near(p.fx!.grip, 0.965);
});
test('applyDamage: the Panzerzone scales the hit (Vrak Splitter-X: hard nose, soft top)', () => {
  const a = pod({ def: byId('brute') }); applyDamage(a, -1, 10, 'front'); near(a.hpL, 92.5); eq(a.hpR, 100);
  const b = pod({ def: byId('brute') }); applyDamage(b, 0, 10, 'top'); near(b.hpL, 94.25); near(b.hpR, 94.25);
});
test('applyDamage: a Bruchteil breaks when its side falls through its step – once, with one event, and the handling follows', () => {
  const p = pod(); // Aurora XR-7: the outer wing plates go at 50 % (its top armour is 1)
  applyDamage(p, -1, 40, 'top'); eq(lost(p), []); eq(p.events.length, 0); eq(p.fx, undefined);
  applyDamage(p, -1, 15, 'top'); eq(lost(p), ['wingL']); eq(p.events.map(e => [e.type, e.part]), [['part', damageModel('aurora').parts.findIndex(b => b.id === 'wingL')]]);
  near(p.fx!.grip, 0.93); near(podParams(p).grip, 5.2 * 0.93);
  applyDamage(p, -1, 1, 'top'); eq(p.events.length, 1, 'no second event:'); eq(p.hpR, 100);
});
test('applyDamage: a centre Bruchteil breaks as soon as either side falls through its step', () => {
  const m = damageModel('volt'), p = pod({ def: byId('volt') }); // Quill Voltspire: its arcs die at 50 and 35 %
  applyDamage(p, 1, 60 / m.armor.top, 'top'); eq(lost(p), ['arcA']);          // right side at 40 %
  applyDamage(p, -1, 70 / m.armor.top, 'top'); eq(lost(p), ['arcA', 'arcB']);  // left side at 30 %
});
test('Bruchteile: repairing above the step does not bring a part back – a respawn does', () => {
  const td = buildTrack(TRACKS[0]), p = pod({ lastSafePath: 0, lastSafeIdx: td.startIdx });
  applyDamage(p, -1, 55, 'top'); eq(lost(p), ['wingL']);
  p.hpL = 100; applyDamage(p, 1, 1, 'top'); eq(lost(p), ['wingL'], 'after a full repair:'); near(p.fx!.grip, 0.93);
  respawn(p, td); eq(lost(p), [], 'after the respawn:'); eq(p.fx, undefined);
});
test("applyDamage: the Mandrel Ram's bar eats front hits until it drops", () => {
  const m = damageModel('odo'), p = pod({ def: byId('odo') });
  const before = zoneFactor(m, 0, -1, 'front'); ok(before < 0.6, `front factor with bar and ring: ${before}`);
  applyDamage(p, 'both', 70 / m.armor.top, 'top'); // 30 % left on both sides
  ok(lost(p).includes('ram') && lost(p).includes('hoopL') && lost(p).includes('hoopR'), `lost: ${lost(p)}`);
  near(zoneFactor(m, p.parts!, -1, 'front'), m.armor.front); ok(m.armor.front > before * 2, 'without the bar a front hit costs more than twice as much');
});
test('applyDamage: a guard covers only its own side (Pagali Ironclad: left skirt gone, right skirt still holds)', () => {
  const m = damageModel('teemo'), p = pod({ def: byId('teemo') });
  applyDamage(p, -1, 52 / zoneFactor(m, 0, -1, 'top'), 'top'); eq(lost(p), ['skirtL']); // left side at 48 %
  const l0 = p.hpL, r0 = p.hpR; applyDamage(p, -1, 10, 'side'); applyDamage(p, 1, 10, 'side');
  ok(l0 - p.hpL > r0 - p.hpR + 2, `the same side hit cost the left ${(l0 - p.hpL).toFixed(1)}, the right ${(r0 - p.hpR).toFixed(1)}`);
});
test('applyDamage: a pod that is about to explode does not report single parts', () => {
  const p = pod(); applyDamage(p, 'both', 150, 'top'); ok(p.hpL <= 0 && p.hpR <= 0); eq(p.events.length, 0); eq(p.parts ?? 0, 0);
});
test('applyDamage: with Panzerzonen and Bruchteile switched off it is the plain rule again (CI: ARMOR=0 PARTS=0)', () => plain(() => {
  const p = pod({ def: byId('brute') }); applyDamage(p, -1, 60, 'front'); eq([p.hpL, p.hpR], [40, 100]); eq(p.parts ?? 0, 0); eq(p.fx, undefined); eq(p.events.length, 0);
}));
test('HUD lamps: three rows per box (50 / 35 / 20 %) – 1 attached, 2 lost; a centre part shows in both boxes', () => {
  const m = damageModel('aurora'); eq(partLamps(m, 0, -1), [1, 1, 1]); eq(partLamps(m, 0, 1), [1, 1, 1]);
  eq(partLamps(m, bitOf('aurora', 'wingL'), -1), [2, 1, 1]); eq(partLamps(m, bitOf('aurora', 'wingL'), 1), [1, 1, 1]);
  eq(partLamps(m, bitOf('aurora', 'gyro'), -1), [1, 2, 1]); eq(partLamps(m, bitOf('aurora', 'gyro'), 1), [1, 2, 1]);
  eq(partLamps(m, bitOf('aurora', 'innerR'), 1), [1, 1, 2]);
});
test('podParams: vmax0 is the top speed without lost parts (the camera FOV follows it)', () => {
  const a = podParams(pod()), b = podParams(pod({ fx: { ...FX_NONE, vmax: 0.9 } }));
  eq(a.vmax0, a.vmax); eq(b.vmax0, a.vmax); ok(b.vmax < a.vmax);
});
test('podParams: without lost parts every handling number is the plain stat formula', () => {
  const a = podParams(pod()), b = podParams(pod({ fx: { ...FX_NONE } }));
  eq([a.vmax, a.accel, a.turn, a.grip, a.abDecel, a.cool, a.heatRate], [133, 39, 1.425, 5.2, 41, 0.31, 0.3]);
  eq(b, a);
});
test('podParams: a handling effect scales exactly its own number', () => {
  const a = podParams(pod()), b = podParams(pod({ fx: { ...FX_NONE, turn: 0.9, vmax: 0.95 } }));
  eq([b.turn, b.vmax], [a.turn * 0.9, a.vmax * 0.95]); eq([b.accel, b.grip, b.cool], [a.accel, a.grip, a.cool]);
});

// ------------------------------------------------------------------ Bruchteile on the model (Phase 6 / 7)
const headOf = (p: PodDef) => (PILOTS.find(q => q.id === p.pilotId) ?? PILOTS[0]).head;
/** something visible changes: triangles go, an engine flames out, a rotor loses a blade or an arc dies */
const shows = (s: BreakShow | undefined) => !!s && s.ranges.length + s.engines.length + s.fans.length + s.arcs.length > 0;
test('hiding parts: the visible index list skips exactly the hidden ranges', () => {
  const full = Uint16Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), out = new Uint16Array(12);
  const ranges = [{ id: 'b', start: 9, count: 3 }, { id: 'a', start: 3, count: 3 }]; // (any order)
  eq(visibleIndices(full, ranges, new Set(), out), 12); eq([...out], [...full]);
  eq(visibleIndices(full, ranges, new Set(['a']), out), 9); eq([...out.slice(0, 9)], [0, 1, 2, 6, 7, 8, 9, 10, 11]);
  eq(visibleIndices(full, ranges, new Set(['b']), out), 9); eq([...out.slice(0, 9)], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  eq(visibleIndices(full, ranges, new Set(['a', 'b']), out), 6); eq([...out.slice(0, 6)], [0, 1, 2, 6, 7, 8]);
  eq(visibleIndices(full, ranges, new Set(['not-there']), out), 12);
});
test('Bruchteile: every part of every Schadensmodell has something to show on the player pod (all three detail levels)', () => {
  for (const p of PODS) for (const q of [1, 2, 3]) {
    const A = assembleHero(p, segFor(q, false), headOf(p));
    for (const b of damageModel(p.id).parts) ok(shows(A.breaks.get(b.id)), `${p.id}, quality ${q}: Bruchteil "${b.id}" (${b.label}) shows nothing`);
    A.owned.forEach(g => g.dispose());
  }
});
test('Bruchteile: every part shows on a Gegner pod too (lite and Ultra build)', () => {
  for (const p of PODS) for (const q of [2, 3]) {
    const A = assembleRival(p, segFor(q, true), headOf(p), p.colors);
    for (const b of damageModel(p.id).parts) ok(shows(A.breaks.get(b.id)), `${p.id}, Gegner quality ${q}: Bruchteil "${b.id}" (${b.label}) shows nothing`);
    A.owned.forEach(g => g.dispose());
  }
});
/** What a model hides for its Bruchteile must be whole parts (triangle runs inside their own bucket that share no vertex with the rest),
 *  never overlap and sit on their own side;
 *  flame-outs name real engines of that side, dying arcs and (Gegner) plume runs lie inside their meshes. */
type Built = { banks: { side: number; pivot: THREE.Vector3; buckets: Map<string, THREE.BufferGeometry>; flames?: THREE.BufferGeometry | null }[]; cockpit: Map<string, THREE.BufferGeometry>; breaks: Map<string, BreakShow>; owned: THREE.BufferGeometry[] };
function breakRunsOk(p: PodDef, what: string, A: Built, binder: (i: number) => THREE.BufferGeometry | undefined, pilotStart?: Map<string, number>) {
  const used = new Map<string, [number, number, string][]>(), L = podLayout(p);
  const run = (g: THREE.BufferGeometry | null | undefined, start: number, count: number) => !!g && !!g.index && count > 0 && count % 3 === 0 && start % 3 === 0 && start + count <= g.index.count;
  for (const b of damageModel(p.id).parts) {
    const s = A.breaks.get(b.id); ok(shows(s), `${what}: Bruchteil "${b.id}" (${b.label}) shows nothing`);
    for (const r of s!.ranges) {
      const geo = r.where === 'cockpit' ? A.cockpit.get(r.key) : A.banks[r.where]?.buckets.get(r.key);
      ok(run(geo, r.start, r.count), `${what} ${b.id}: range ${r.start}+${r.count} in ${r.where}/${r.key} (${geo?.index?.count ?? 'no'} indices)`);
      const key = `${r.where}/${r.key}`, list = used.get(key) ?? []; used.set(key, list);
      for (const [at, n, id] of list) ok(r.start >= at + n || r.start + r.count <= at, `${what}: ${b.id} overlaps ${id} in ${key}`);
      list.push([r.start, r.count, b.id]);
      if (b.side !== 0) { // mean x of its vertices (body space) is on its own side
        const idx = geo!.index!, pos = geo!.attributes.position, ox = r.where === 'cockpit' ? 0 : A.banks[r.where].pivot.x; let sx = 0;
        for (let i = r.start; i < r.start + r.count; i++) sx += pos.getX(idx.getX(i)) + ox;
        ok(Math.sign(sx) === b.side, `${what} ${b.id}: mean x ${(sx / r.count).toFixed(2)} is on the wrong side`);
      }
    }
    for (const e of s!.engines) { ok(L.engines[e], `${what} ${b.id}: no engine ${e}`); if (b.side !== 0) eq(Math.sign(L.engines[e].x), b.side, `${what} ${b.id}: engine ${e} side`); }
    for (const e of s!.fans) ok(L.engines[e], `${what} ${b.id}: no engine ${e} for the fan`);
    for (const arc of s!.arcs) ok(run(binder(arc.binder), arc.start, arc.count), `${what} ${b.id}: arc range ${arc.start}+${arc.count} in binder ${arc.binder}`);
    for (const f of s!.flames) {
      ok(run(A.banks[f.bank]?.flames, f.start, f.count), `${what} ${b.id}: plume run ${f.start}+${f.count} in bank ${f.bank}`);
      if (b.side !== 0) eq(A.banks[f.bank].side, b.side, `${what} ${b.id}: plume on the wrong side`);
    }
  }
  for (const [k, start] of pilotStart ?? []) for (const [at, n, id] of used.get(`cockpit/${k}`) ?? []) ok(at + n <= start, `${what}: Bruchteil ${id} lies behind the pilot's triangles in ${k}`);
  // a run is made of whole parts: no triangle outside it uses one of its vertices (a run that slipped along the bucket would cut through parts)
  for (const [key, list] of used) {
    const [where, k] = key.split('/'), geo = (where === 'cockpit' ? A.cockpit.get(k) : A.banks[+where].buckets.get(k))!, idx = geo.index!;
    const inRun = new Int32Array(idx.count).fill(-1), owner = new Int32Array(geo.attributes.position.count).fill(-1);
    list.forEach(([at, n], i) => { for (let j = at; j < at + n; j++) { inRun[j] = i; owner[idx.getX(j)] = i; } });
    for (let j = 0; j < idx.count; j++) { const o = owner[idx.getX(j)]; if (o !== inRun[j]) throw new Error(`${what}: Bruchteil ${list[Math.max(o, inRun[j])][2]} cuts through a part in ${key} (index ${j})`); }
  }
  A.owned.forEach(g => g.dispose());
}
const TUNED = Object.fromEntries(STAT_KEYS.map(k => [k, 2])) as Record<StatKey, number>, HALF_TUNED = Object.fromEntries(STAT_KEYS.map(k => [k, 1])) as Record<StatKey, number>;
const KIT_BUILDS = [{ fins: 1, intake: 1, nozzle: 1, tune: HALF_TUNED }, { fins: 2, intake: 2, nozzle: 2, tune: TUNED }, { fins: 3, intake: 3, nozzle: 3, tune: NO_KIT.tune }];
test('Bruchteile: hidden triangles stay inside their bucket, never overlap and sit on their own side - player pod, every detail level, factory and kit builds', () => {
  for (const p of PODS) {
    for (const q of [1, 2, 3]) { const A = assembleHero(p, segFor(q, false), headOf(p)); breakRunsOk(p, `${p.id} player q${q}`, A, i => A.binders[i], A.pilotStart); }
    KIT_BUILDS.forEach((kit, n) => { const A = assembleHero(p, segFor(2, false), headOf(p), kit); breakRunsOk(p, `${p.id} player kit ${n + 1}`, A, i => A.binders[i], A.pilotStart); });
  }
});
test('Bruchteile: the same holds on Gegner pods (lite and Ultra build, with Style-Teile), and the plume of a dying engine lies inside the flame mesh of its side', () => {
  for (const p of PODS) {
    for (const q of [2, 3]) { const A = assembleRival(p, segFor(q, true), headOf(p), p.colors); breakRunsOk(p, `${p.id} Gegner q${q}`, A, i => A.binders[i]?.geo); }
    KIT_BUILDS.forEach((kit, n) => { const A = assembleRival(p, segFor(2, true), headOf(p), p.colors, undefined, { ...kit, tune: NO_KIT.tune }); breakRunsOk(p, `${p.id} Gegner kit ${n + 1}`, A, i => A.binders[i]?.geo); });
  }
});
test('Bruchteile: an engine that flames out goes dark – its glowing parts (nozzle, light strips) are cut out with it', () => {
  for (const [id, part] of [['gasvaro', 'engCL'], ['gasvaro', 'engBR'], ['teemo', 'engUL']] as const) {
    const p = PODS.find(x => x.id === id)!;
    const A = assembleHero(p, segFor(2, false), headOf(p)), R = assembleRival(p, segFor(2, true), headOf(p), p.colors);
    for (const [who, s] of [['player', A.breaks.get(part)!], ['Gegner', R.breaks.get(part)!]] as const) {
      eq(s.engines.length, 1, `${id} ${part} (${who}): engines`);
      ok(s.ranges.some(r => r.key === 'glow' && r.count > 0), `${id} ${part} (${who}): no glow triangles to hide`);
    }
    ok(R.breaks.get(part)!.flames.length === 1, `${id} ${part}: the Gegner plume of that engine`);
    A.owned.forEach(g => g.dispose()); R.owned.forEach(g => g.dispose());
  }
});
test('Bruchteile: the lights of Tuning-Teile and Style-Teile go dark with their engine too (afterburner ring, long nozzle, repulsor strip)', () => {
  const kit = { fins: 0, intake: 0, nozzle: 1, tune: { ...NO_KIT.tune, topSpeed: 2, traction: 2 } };
  const glowOf = (s: BreakShow) => s.ranges.filter(r => r.key === 'glow').reduce((n, r) => n + r.count, 0);
  for (const [id, part] of [['gasvaro', 'engCL'], ['gasvaro', 'engBR'], ['teemo', 'engUL']] as const) {
    const p = PODS.find(x => x.id === id)!, L = podLayout(p);
    for (const who of ['player', 'Gegner'] as const) {
      const seg = segFor(2, who === 'Gegner');
      const W = who === 'player' ? assembleHero(p, seg, headOf(p)) : assembleRival(p, seg, headOf(p), p.colors);
      const K = who === 'player' ? assembleHero(p, seg, headOf(p), kit) : assembleRival(p, seg, headOf(p), p.colors, undefined, kit);
      const e = W.breaks.get(part)!.engines[0], lights = engineKit(L.engines[e].spec, seg, kit).parts.get('glow')?.index!.count ?? 0;
      ok(lights > 0, `${id}: this kit adds no lights to engine ${e}`);
      eq(glowOf(K.breaks.get(part)!), glowOf(W.breaks.get(part)!) + lights, `${id} ${part} (${who}): glow triangles that go out with the engine`);
      W.owned.forEach(g => g.dispose()); K.owned.forEach(g => g.dispose());
    }
  }
});
test('Bruchteile: a part that falls off is big enough to see (at least 0.4 m across) and the racer keeps most of its body (under 45 % of the triangles)', () => {
  for (const p of PODS) {
    const A = assembleHero(p, segFor(2, false), headOf(p)); let all = 0, gone = 0;
    for (const g of A.cockpit.values()) all += g.index!.count; for (const bk of A.banks) for (const g of bk.buckets.values()) all += g.index!.count;
    for (const b of damageModel(p.id).parts) {
      const s = A.breaks.get(b.id)!; if (!s.ranges.length) continue;
      const box = new THREE.Box3(), v = new THREE.Vector3();
      for (const r of s.ranges) {
        const geo = (r.where === 'cockpit' ? A.cockpit.get(r.key) : A.banks[r.where].buckets.get(r.key))!, idx = geo.index!, pos = geo.attributes.position;
        for (let i = r.start; i < r.start + r.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, idx.getX(i)));
        gone += r.count;
      }
      const size = box.getSize(v).length(); ok(size >= 0.4, `${p.id} ${b.id}: only ${size.toFixed(2)} m across`);
    }
    ok(gone / all < 0.45, `${p.id}: Bruchteile are ${(100 * gone / all).toFixed(1)} % of the pod`);
    A.owned.forEach(g => g.dispose());
  }
});
// ------------------------------------------------------------------ heat and soot along the engine
// The hull shader lets heat glow and soot creep forward from the nozzle along `aLiv.y` (0 rear .. 1 front). Parts in plain or solid secondary
// paint (livery modes 0 and 3) do not need that coordinate for their paint, so it must hold their true place along the engine.
const heatPlaces = (g: THREE.BufferGeometry | undefined, z0: number, len: number, dz: number, what: string) => {
  if (!g) return;
  const liv = g.attributes.aLiv, pos = g.attributes.position;
  for (let i = 0; i < liv.count; i++) {
    const mode = liv.getZ(i); if (mode > 0.5 && mode < 2.5) continue; // engine / cockpit livery: the pattern owns the coordinate
    const want = Math.max(0, Math.min(1, (pos.getZ(i) + dz - z0) / len));
    if (Math.abs(liv.getY(i) - want) > 1e-4) throw new Error(`${what}: a vertex at z ${(pos.getZ(i) + dz).toFixed(2)} has heat place ${liv.getY(i).toFixed(3)}, expected ${want.toFixed(3)}`);
  }
};
test('heat: plates, fins and flaps of every engine glow by their place along it, not like the nozzle (factory parts, Bruchteile, kit parts)', () => {
  const kit = { fins: 2, intake: 1, nozzle: 2, tune: { ...NO_KIT.tune, turn: 2, cooling: 2, airbrake: 2, repair: 2, traction: 2 } };
  for (const p of PODS) for (const em of podLayout(p).engines) {
    const L = em.spec.L, eg = engineGeo(em.spec, 28), ek = engineKit(em.spec, 28, kit);
    heatPlaces(eg.parts.get('hull'), -L / 2, L, 0, `${p.id} engine`);
    for (const bp of eg.breakParts) heatPlaces(bp.parts.get('hull'), -L / 2, L, 0, `${p.id} Bruchteil ${bp.id}`);
    for (const f of eg.flaps) heatPlaces(f.geo, -L / 2, L, f.pivot.z, `${p.id} flap`);
    heatPlaces(ek.parts.get('hull'), -L / 2, L, 0, `${p.id} kit part`);
    for (const f of ek.flaps) heatPlaces(f.geo, -L / 2, L, f.pivot.z, `${p.id} kit flap`);
  }
});
test('heat: wings and plates of the pod layout follow the engine bank they sit on (the long wing plate of the Aurora runs from hot to cold)', () => {
  for (const who of ['player', 'Gegner'] as const) {
    const p = byId('aurora'), A = who === 'player' ? assembleHero(p, segFor(2, false), headOf(p)) : assembleRival(p, segFor(2, true), headOf(p), p.colors);
    const r = A.breaks.get('wingL')!.ranges.find(x => x.key === 'hull')!; ok(r && r.where !== 'cockpit', 'the wing plate is on an engine bank');
    const g = A.banks[r.where as number].buckets.get('hull')!, liv = g.attributes.aLiv, idx = g.index!; let lo = 1, hi = 0;
    for (let i = r.start; i < r.start + r.count; i++) { const v = idx.getX(i); if (liv.getZ(v) > 2.5) { lo = Math.min(lo, liv.getY(v)); hi = Math.max(hi, liv.getY(v)); } }
    ok(hi - lo > 0.5, `${who}: the heat place of the wing plate spans only ${lo.toFixed(2)} .. ${hi.toFixed(2)}`);
    A.owned.forEach(x => x.dispose());
  }
});
// ------------------------------------------------------------------ pod pose (where a hit landed on the model)
test('pod pose: a world point lands in the body space of THIS step (same frame as the model: group yaw, then body pitch + roll about an origin bodyZ ahead)', () => {
  const pose = { pos: new THREE.Vector3(412, 7.5, -233), yaw: 2.1, pitch: -0.17, roll: 0.4 }, bodyZ = 1.3;
  const frame = (p: typeof pose) => { // the scene graph the game gives every pod model
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body); body.position.z = bodyZ;
    group.position.copy(p.pos); group.rotation.set(0, p.yaw, 0); body.rotation.set(p.pitch, 0, p.roll); group.updateMatrixWorld(true); return body;
  };
  const local = new THREE.Vector3(1.9, 0.4, -2.2), world = frame(pose).localToWorld(local.clone());
  const close = (a: number, b: number, msg: string) => ok(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);
  const b = worldToBody(pose, bodyZ, world.clone()); close(b.x, local.x, 'body x'); close(b.y, local.y, 'body y'); close(b.z, local.z, 'body z');
  const w = bodyToWorld(pose, bodyZ, local.clone()); close(w.x, world.x, 'world x'); close(w.y, world.y, 'world y'); close(w.z, world.z, 'world z');
  // the finding: at 100 m/s the pod is 1.67 m further on than the model stood last frame - the mark must not slide forward by that much
  const now = { ...pose, pos: pose.pos.clone().add(new THREE.Vector3(Math.sin(pose.yaw), 0, Math.cos(pose.yaw)).multiplyScalar(100 / 60)) };
  const hit = frame(now).localToWorld(local.clone()), m = worldToBody(now, bodyZ, hit.clone());
  close(m.z, local.z, 'the mark slid along the pod');
});
test('Treffermarken: the flaps of the player pod are built in the space of their engine bank (a mark burns a flap only where the flap really is)', () => {
  const kit = { ...NO_KIT, tune: { ...NO_KIT.tune, airbrake: 2 } }; // with the double flaps of the Luftbremse tuning as well
  for (const p of PODS) for (const k of [NO_KIT, kit]) {
    const A = assembleHero(p, segFor(2, false), headOf(p), k); let n = 0;
    for (const bank of A.banks) for (const e of bank.engines) for (const f of e.flaps) {
      const d = new THREE.Box3().setFromBufferAttribute(f.geo.attributes.position as THREE.BufferAttribute).distanceToPoint(f.hinge); n++;
      ok(d < 0.05, `${p.id}: a flap's geometry lies ${d.toFixed(2)} m away from its hinge (still in hinge space?)`);
    }
    ok(n > 0 || !podLayout(p).engines.some(em => engineGeo(em.spec, segFor(2, false)).flaps.length), `${p.id}: flaps got lost`);
    A.owned.forEach(g => g.dispose());
  }
});
// ------------------------------------------------------------------ saved profile (localStorage)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); },
};
const V1 = 'podracer-profile-v1', V2 = 'podracer-profile-v2';
const saved = (key: string, data: unknown) => { store.clear(); store.set(key, JSON.stringify(data)); };

test('profile: without saved data every pod has a custom entry and the first pod is selected', () => {
  store.clear(); const p = loadProfile();
  eq(p.podId, PODS[0].id); eq(Object.keys(p.custom).sort(), PODS.map(x => x.id).sort());
});
test('profile: a save of the old v1 key is imported (pod choice, colours and tuning survive)', () => {
  saved(V1, { podId: 'mavik', custom: { mavik: { colors: ['#112233', '#445566', '#778899'], tuning: { topSpeed: 3 } } } });
  const p = loadProfile();
  eq(p.podId, 'mavik'); eq(p.custom.mavik.colors, ['#112233', '#445566', '#778899']); eq(p.custom.mavik.tuning.topSpeed, 3);
});
test('profile: the v2 save wins when both keys exist', () => {
  saved(V1, { podId: 'mavik' }); store.set(V2, JSON.stringify({ podId: 'aldo' }));
  eq(loadProfile().podId, 'aldo');
});
test('profile: saving writes the v2 key and leaves an old v1 save untouched (older builds keep working)', () => {
  saved(V1, { podId: 'mavik' }); const before = store.get(V1);
  const p = loadProfile(); saveProfile({ ...p, podId: 'aldo' });
  eq(store.get(V1), before); eq(JSON.parse(store.get(V2)!).podId, 'aldo');
});
test('profile: an unknown pod id falls back to the first pod instead of crashing the menus', () => {
  saved(V2, { podId: 'pod-from-a-newer-build' }); eq(loadProfile().podId, PODS[0].id);
});
test('profile: tuning, pattern and finish are clamped into range; missing stats count as 0', () => {
  saved(V2, { custom: { aurora: { colors: ['#000000', '#111111', '#222222'], tuning: { topSpeed: 99, accel: -4, turn: 2.6 }, pattern: 17, finish: -3 } } });
  const c = loadProfile().custom.aurora;
  eq([c.tuning.topSpeed, c.tuning.accel, c.tuning.turn, c.tuning.cooling], [5, 0, 3, 0]); eq([c.pattern, c.finish], [5, 0]);
});
test('profile: a pod without a saved pattern keeps the factory pattern (undefined)', () => {
  saved(V2, { custom: { aurora: { colors: ['#000000', '#111111', '#222222'], tuning: {} } } });
  eq(loadProfile().custom.aurora.pattern, undefined);
});
test('profile: a broken colour falls back to that pod\'s own colour', () => {
  saved(V2, { custom: { aurora: { colors: ['#12', 42, '#ABCDEF'], tuning: {} } } });
  eq(loadProfile().custom.aurora.colors, [PODS[0].colors[0], PODS[0].colors[1], '#ABCDEF']);
});
test('profile: Style-Teile are clamped into range; a save without them means Werk', () => {
  saved(V2, { podId: 'aurora', custom: { aurora: { colors: PODS[0].colors, tuning: {}, kit: { fins: 9, intake: -2, nozzle: 2.4, canopy: 'x' } } } });
  const p = loadProfile(); eq(p.custom.aurora.kit, { fins: 3, intake: 0, nozzle: 2, canopy: 0 }); eq(p.custom.brute.kit, undefined, 'pod without saved parts');
});
test('profile: the rival count is clamped to 0..10', () => {
  saved(V2, { race: { opponents: 99 } }); eq(loadProfile().race.opponents, 10);
  saved(V2, { race: { opponents: -2 } }); eq(loadProfile().race.opponents, 0);
});

// ------------------------------------------------------------------ tunnel ceiling (how tall a pod is)
const ROLLS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2]; // attitudes the ceiling checks measure the model in: upright, half roll both ways, knife-edge
/** How far the pod model reaches above the pod origin, measured on every vertex: per roll angle of `ROLLS` the highest point of the
 *  left engine side, the right engine side and the cockpit (Three.js: roll φ lifts a body point to x·sin φ + y·cos φ). Most detailed
 *  build, the tallest of the factory pod and the three Finnen (the Style-Teile that stand on the engine spine). */
function modelTops(def: PodDef) {
  const out = ROLLS.map(() => ({ L: -9, R: -9, ck: -9 }));
  const reach = (g: THREE.BufferGeometry, k: 'L' | 'R' | 'ck', ox = 0, oy = 0) => {
    const a = g.attributes.position.array as ArrayLike<number>;
    ROLLS.forEach((phi, i) => { const sn = Math.sin(phi), cs = Math.cos(phi); let m = out[i][k]; for (let j = 0; j < a.length; j += 3) { const h = (a[j] + ox) * sn + (a[j + 1] + oy) * cs; if (h > m) m = h; } out[i][k] = m; });
  };
  for (const fins of [0, 1, 2, 3]) {
    const a = assembleHero(def, segFor(3, false), headOf(def), { ...NO_KIT, fins });
    for (const b of a.banks) {
      const k = b.side < 0 ? 'L' : 'R';
      for (const g of b.buckets.values()) reach(g, k, b.pivot.x, b.pivot.y);
      for (const e of b.engines) { reach(e.geo.fan, k, b.pivot.x + e.off.x, b.pivot.y + e.off.y); reach(e.geo.petals, k, b.pivot.x + e.off.x, b.pivot.y + e.off.y); for (const f of e.flaps) reach(f.geo, k, b.pivot.x, b.pivot.y); }
    }
    for (const g of a.cockpit.values()) reach(g, 'ck');
    for (const g of a.owned) g.dispose();
  }
  return out;
}
/** A complete pod hanging in the air over sample `idx` of the main path (`stepPod` reads every field). */
function racer(def: PodDef, td: TrackData, idx: number, lat: number, y: number): PodState {
  const s = td.main.samples[idx], pilot = PILOTS.find(q => q.id === def.pilotId) ?? PILOTS[0];
  return {
    id: 0, isPlayer: true, def, pilot, stats: effectiveStats(def.id, undefined), name: pilot.name, color: pilot.color,
    pos: new THREE.Vector3(s.x + s.rx * lat, y, s.z + s.rz * lat), vel: new THREE.Vector3(), yaw: Math.atan2(s.tx, s.tz), yawRate: 0, steer: 0,
    path: 0, idx, lat, grounded: false, zeroG: false, air: 0, groundY: s.y, prevGroundY: s.y, engYL: 0, engYR: 0, engVL: 0, engVR: 0, engPL: 0, engPR: 0,
    input: { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false, repair: false },
    hpL: 100, hpR: 100, heat: 0, boosting: false, overheat: false, repairing: false, airbraking: false,
    lap: 0, passedMid: true, rel: 0, prog: 0, finished: false, finishTime: 0, lapStart: 0, lapTimes: [],
    dead: 0, invuln: 99, lastSafePath: 0, lastSafeIdx: idx, wrongWay: 0, roll: 0, pitch: 0, shake: 0, events: [], visual: null, place: 1,
    inRoof: true, upper: false, // already inside the tunnel, below its shell
  } as unknown as PodState;
}
test('tunnel ceiling: pushed up against the vault, no pod reaches into it – the highest point of every pod (tallest Style-Teile mounted) stops at the shell above the pod centre: upright at the crown and on the flank, with the outer engine lifted, in a half roll and on knife-edge', () => {
  const td = buildTrack(TRACKS[0]), S = td.main.samples;
  const a = S.findIndex((s, i) => i > 80 && s.roof > 0 && s.tun === 1); let b = a; while (b + 1 < S.length && S[b + 1].roof > 0) b++;
  ok(a > 0 && b - a > 40, 'the first track has no standard tunnel to test in');
  const idx = (a + b) >> 1, bad: string[] = [];
  // [name, lateral position / half width, left engine held this far up (m), roll attitude (index into ROLLS), how far below the vault the pod may stop (m)]
  // (upright the pod must come right up to the vault – it is as tall as measured; rolled, the limit is the corner of the box round the pod)
  const cases: [string, number, number, number, number][] = [['crown', 0, 0, 0, 0.15], ['flank', 0.7, 0, 0, 0.15], ['crown, left engine lifted 1.5 m', 0, 1.5, 0, 0.15],
    ['half roll (left side up)', 0, 0, 1, 2], ['half roll (right side up)', 0, 0, 2, 2], ['knife-edge', 0, 0, 3, 0.6]];
  for (const def of PODS) {
    const m = modelTops(def);
    for (const [name, latF, lift, ri, slack] of cases) {
      const s0 = S[idx], lat = latF * s0.hw, roll = ROLLS[ri], rc = roll / (Math.PI / 2), mt = m[ri];
      const p = racer(def, td, idx, lat, s0.y + tunnelCeiling(s0, lat) - 12);
      let reach = -9; // how far the highest point of the model got past the shell (m): > 0 = inside the vault
      for (let f = 0; f < 150; f++) {
        p.vel.set(0, 9, 0); p.rollCtl = rc; p.input.roll = rc; if (lift) { p.engYL = lift; p.engVL = 0; } // pushed up all the time (a pod flying into the roof)
        stepPod(p, td, 1 / 60, f / 60, 1, false);
        if (f < 100) continue; // (rising for the first moments)
        if (Math.abs(p.roll - roll) > 0.002) { bad.push(`${def.id} ${name}: the test pod rolled to ${p.roll.toFixed(3)} instead of ${roll.toFixed(3)}`); break; }
        const shell = p.groundY + tunnelCeiling(td.paths[p.path].samples[p.idx], p.lat), cs = Math.cos(roll);
        reach = Math.max(reach, p.pos.y + Math.max(mt.ck, mt.L + (p.engYL ?? 0) * cs, mt.R + (p.engYR ?? 0) * cs) - shell);
      }
      if (p.dead > 0 || p.upper) bad.push(`${def.id} ${name}: the test pod did not stay inside the tunnel`);
      else if (reach > 0.05) bad.push(`${def.id} ${name}: ${reach.toFixed(2)} m inside the vault`); // (5 cm: the engines move on after the ceiling test of the same step)
      else if (reach < -slack) bad.push(`${def.id} ${name}: stopped ${(-reach).toFixed(2)} m below the vault (limit ${slack}) – the pod counts as taller than it is`);
      if (process.env.CEIL_TABLE) console.log(`   ${def.id.padEnd(8)} ${name.padEnd(32)} highest point ${reach >= 0 ? '+' : ''}${reach.toFixed(3)} m past the shell`);
    }
  }
  ok(!bad.length, `\n         ${bad.join('\n         ')}`);
});
test('tunnel ceiling: every pod fits under every tunnel – at no roofed sample of any track does the ceiling limit come below the height a pod rides at (lift key held; upright, outer engine fully lifted, half roll, knife-edge; from the centre line to the walls)', () => {
  // ride height as in stepPod (`targetY`): HOVER + 0.1 bob + 1.6 lift key + knife · half span · 0.92; ceiling limit as in stepPod: shell − podHeight
  const pods = PODS.map(d => { const e = podEnvelope(d); return { id: d.id, e, hs: Math.max(Math.abs(e.engL.outerX), Math.abs(e.engR.outerX)) }; });
  const cases: [string, number, number][] = [['upright', 0, 0], ['outer engine lifted', 0, 1.95], ['half roll', Math.PI / 4, 0], ['knife-edge', Math.PI / 2, 0]];
  let worst = 1e9, where = '';
  for (const def of TRACKS) {
    const td = buildTrack(def);
    for (const path of td.paths) for (const s of path.samples) {
      if (!(s.roof > 0) || s.gap) continue;
      for (const wall of [s.wallL, s.wallR]) for (const f of [0, 0.5, 0.8, 1]) {
        const shell = tunnelCeiling(s, wall * f < 0.96 * (s.hw + TUNNEL_SHOULDER + (s.caveW ?? 0)) ? wall * f : 0.96 * (s.hw + TUNNEL_SHOULDER + (s.caveW ?? 0))); // (stepPod clamps there)
        for (const q of pods) for (const [name, roll, lift] of cases) {
          const room = shell - podHeight(q.e, lift, lift, roll) - (HOVER + 0.1 + 1.6 + Math.abs(Math.sin(roll)) * q.hs * 0.92);
          if (room < worst) { worst = room; where = `${def.id}: ${q.id}, ${name}, ${(wall * f).toFixed(0)} m off the centre line (road half width ${s.hw.toFixed(0)} m, roof ${s.roof.toFixed(0)} m)`; }
        }
      }
    }
  }
  if (process.env.CEIL_TABLE) console.log(`   tightest spot: ${worst.toFixed(2)} m of room – ${where}`);
  ok(worst > 0.3, `the ceiling presses a normally riding pod down: ${worst.toFixed(2)} m of room – ${where}`);
});

console.log(failed ? `\n${failed} unit check(s) FAILED, ${passed} passed.` : `All ${passed} unit checks passed.`);
process.exit(failed ? 1 : 0);
