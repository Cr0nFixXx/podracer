// Headless unit checks for pure game logic (part of `npm run check`). No framework: tiny test / expect helpers.
// Env: ONLY=<substring> runs only the tests whose name contains it.
import { PODS, STAT_KEYS, type StatKey } from '../../src/game/data';
import { podLayout } from '../../src/game/podLayouts';
import { cockpitGeo } from '../../src/game/podCockpits';
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
