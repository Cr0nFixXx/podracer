// Headless unit checks for pure game logic (part of `npm run check`). No framework: tiny test / expect helpers.
// Env: ONLY=<substring> runs only the tests whose name contains it.
import { PILOTS, PODS, STAT_KEYS, type StatKey } from '../../src/game/data';
import { podLayout } from '../../src/game/podLayouts';
import { cockpitGeo } from '../../src/game/podCockpits';
import { engineExtent } from '../../src/game/podParts';
import { podCollision, podEnvelope } from '../../src/game/podDesigns';
import { assembleHero, assembleRival } from '../../src/game/podAssembly';
import { pickRivals } from '../../src/game/roster';
import { ciRoster } from './roster';
import { applyDamage, podParams, FX_NONE, type PodState } from '../../src/game/physics';
import { loadProfile, saveProfile } from '../../src/game/settings';

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
test('Quadra Lumber keeps its X: binders between different engine pairs stay separate meshes', () => {
  const p = podById('bomquad'); eq(assembleHero(p, 28, 'dome').binders.length, 2); eq(assembleRival(p, 14, 'dome', p.colors).binders.length, 2);
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
/** Just enough of a pod for the pure damage / parameter functions. */
function pod(over: Partial<PodState> = {}): PodState {
  const stats = Object.fromEntries(STAT_KEYS.map(k => [k, 0.5])) as Record<StatKey, number>;
  return { def: PODS[0], stats, hpL: 100, hpR: 100, ...over } as unknown as PodState;
}
test('applyDamage: a hit on the left side costs only the left engine', () => { const p = pod(); applyDamage(p, -1, 10, 'side'); eq([p.hpL, p.hpR], [90, 100]); });
test('applyDamage: a hit on the right side costs only the right engine', () => { const p = pod(); applyDamage(p, 1, 10, 'side'); eq([p.hpL, p.hpR], [100, 90]); });
test('applyDamage: a hit without a side (cockpit, landing, ceiling) is split half and half', () => { const p = pod(); applyDamage(p, 0, 10, 'top'); eq([p.hpL, p.hpR], [95, 95]); });
test("applyDamage: 'both' costs each engine the full amount (overdrive, geyser, portal lip)", () => { const p = pod(); applyDamage(p, 'both', 10, 'heat'); eq([p.hpL, p.hpR], [90, 90]); });
test('podParams: without lost parts every handling number is the plain stat formula', () => {
  const a = podParams(pod()), b = podParams(pod({ fx: { ...FX_NONE } }));
  eq([a.vmax, a.accel, a.turn, a.grip, a.abDecel, a.cool, a.heatRate], [133, 39, 1.425, 5.2, 41, 0.31, 0.3]);
  eq(b, a);
});
test('podParams: a handling effect scales exactly its own number', () => {
  const a = podParams(pod()), b = podParams(pod({ fx: { ...FX_NONE, turn: 0.9, vmax: 0.95 } }));
  eq([b.turn, b.vmax], [a.turn * 0.9, a.vmax * 0.95]); eq([b.accel, b.grip, b.cool], [a.accel, a.grip, a.cool]);
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
test('profile: the rival count is clamped to 0..10', () => {
  saved(V2, { race: { opponents: 99 } }); eq(loadProfile().race.opponents, 10);
  saved(V2, { race: { opponents: -2 } }); eq(loadProfile().race.opponents, 0);
});

console.log(failed ? `\n${failed} unit check(s) FAILED, ${passed} passed.` : `All ${passed} unit checks passed.`);
process.exit(failed ? 1 : 0);
