// Headless unit checks for pure game logic (part of `npm run check`). No framework: tiny test / expect helpers.
// Env: ONLY=<substring> runs only the tests whose name contains it.
import * as THREE from 'three';
import { DIFFICULTIES, PILOTS, PODS, STAT_KEYS, THEMES, TRACKS, type PodDef, type StatKey } from '../../src/game/data';
import { makeTerrainField, terrainLeafMaker } from '../../src/game/terrain';
import { resolveEnvironment, type TimeOfDay, type WeatherKind } from '../../src/game/environment';
import { clipOutside } from '../../src/game/meshClip';
import { SnowField } from '../../src/game/snowField';
import { borderRocks, ROCK_PROTRUDE, type BorderRock } from '../../src/game/borderRocks';
import { SURF, SURFACES } from '../../src/game/surfaces';
import { podLayout } from '../../src/game/podLayouts';
import { cockpitGeo } from '../../src/game/podCockpits';
import { engineExtent, engineGeo } from '../../src/game/podParts';
import { END_PLATE, RING, RING_CHORD, plateBevel } from '../../src/game/podEngines';
import { podCollision, podEnvelope, COCKPIT_SWAY } from '../../src/game/podDesigns';
import { assembleHero, assembleRival, segFor, skinPoint, visibleIndices, type BreakShow } from '../../src/game/podAssembly';
import { pickRivals, rivalKit } from '../../src/game/roster';
import { engineKit, tuneTiers, NO_KIT } from '../../src/game/podKitParts';
import { ciRoster } from './roster';
import { applyDamage, bodyToWorld, collidePods, hullWorld, podParams, respawn, stepPod, vaultOver, worldToBody, FX_NONE, HOVER, VAULT_CLAMP, type PodState } from '../../src/game/physics';
import { DAMAGE_RULES, damageModel, lostMessage, partLamps, partsFx, zoneFactor, type DamageZone } from '../../src/game/podDamage';
import { buildTrack, frameAt, tunnelCeiling, baySameStretch, DS, TUNNEL_SHOULDER, type Path, type Sample, type TrackData } from '../../src/game/trackBuilder';
import { defaultProfile, effectiveStats, loadProfile, saveProfile, CAMERA_NAMES, MAX_LAPS, PRESETS, type GfxSettings } from '../../src/game/settings';
import * as GPU3 from 'three/webgpu';
import { setupSunShadow, CSM_FAR, CSM_SPLIT, SH_BACK, SH_BOX } from '../../src/game/sunShadow';

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
const triCount = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
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
test('Lyss Halo-9: the end plate of a ring segment stays inside the skin of the ring (a plain bar stood up to 4 cm proud at both edges)', () => {
  const p = podById('halo'), sp = podLayout(p).engines[0].spec, hull = engineGeo(sp, 28).parts.get('hull')!, P = hull.attributes.position;
  const Rw = RING * sp.R, c = RING_CHORD * sp.L, zTE = -sp.L / 2 + 0.56 * sp.L - c / 2;
  // the section of the ring, read off the built skin: its half thickness at every rib of the lathe (place along the chord 0..1)
  const half = new Map<number, number>();
  for (let i = 0; i < P.count; i++) {
    const r = Math.hypot(P.getX(i), P.getY(i)), t = (P.getZ(i) - zTE) / c; if (Math.abs(r - Rw) > 0.08 || t < -0.005 || t > 1.005) continue;
    const k = Math.round(t * 100) / 100; half.set(k, Math.max(half.get(k) ?? 0, Math.abs(r - Rw)));
  }
  const sec = [...half].sort((a, b) => a[0] - b[0]); ok(sec.length >= 5 && sec[0][0] === 0 && sec[sec.length - 1][0] === 1 && sec[0][1] < 1e-6 && sec[sec.length - 1][1] < 1e-6, `the ring section should run from edge to edge: ${JSON.stringify(sec)}`);
  const skin = (t: number) => { for (let i = 1; i < sec.length; i++) if (t <= sec[i][0]) { const [t0, h0] = sec[i - 1], [t1, h1] = sec[i]; return h0 + (h1 - h0) * (t - t0) / (t1 - t0); } return 0; };
  const bevel = plateBevel(0.012); let least = 1;
  for (let i = 0; i < END_PLATE.length; i++) for (let q = 0; q <= 10; q++) { // along every edge of the plate
    const [t0, y0] = END_PLATE[i], [t1, y1] = END_PLATE[(i + 1) % END_PLATE.length], t = t0 + (t1 - t0) * q / 10, y = Math.abs(y0 + (y1 - y0) * q / 10);
    const room = Math.min(skin(t) - y - bevel, (t - bevel / c) > 0 && (t + bevel / c) < 1 ? 1 : -1); if (room < least) least = room;
    ok(room >= 0.001, `at ${(t * 100).toFixed(0)} % of the chord the plate (${(y * 100).toFixed(1)} cm + ${(bevel * 100).toFixed(2)} cm bevel) meets a skin of ${(skin(t) * 100).toFixed(1)} cm`);
  }
  ok(least < 0.03, `the plate should fill most of the cut: least room ${(least * 100).toFixed(1)} cm`);
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
});test("Bruchteile: the HUD says what the player sees – a part that drops off the model is 'abgerissen', 'geplatzt' or the like, never 'ausgefallen' (that is an engine or an arc that stays and goes out)", () => {
  const bad: string[] = [];
  for (const p of PODS) {
    const A = assembleHero(p, 28, headOf(p));
    for (const b of damageModel(p.id).parts) {
      const sh = A.breaks.get(b.id)!, stays = sh.engines.length > 0 || sh.arcs.length > 0 || sh.fans.length > 0, word = b.lost ?? 'abgerissen';
      if (!stays && ['ausgefallen', 'erloschen', 'verklemmt', 'leck'].includes(word)) bad.push(`${p.id}/${b.id}: drops off, message "${lostMessage(b)}"`);
      if (stays && sh.engines.length > 0 && word !== 'ausgefallen') bad.push(`${p.id}/${b.id}: the engine stays and flames out, message "${lostMessage(b)}"`);
    }
  }
  ok(!bad.length, bad.join(' · '));
});

// ------------------------------------------------------------------ Treffermarken: on the skin the hit meets first, whatever the engine's shape
/** [metres from the engine axis, metres along the engine from its middle] of the mark for a hit from direction (dx, dy) on the first engine of bank `b` */
function markAt(A: ReturnType<typeof assembleHero>, b: number, dx: number, dy: number, v = new THREE.Vector3()): [number, number] {
  const bank = A.banks[b], e = bank.engines[0];
  ok(skinPoint(bank.buckets.get('hull')!, e.off.x, e.off.y, dx, dy, e.off.z, e.geo.L * 0.5 + 0.3, v), 'no skin found');
  return [Math.hypot(v.x - e.off.x, v.y - e.off.y), v.z - e.off.z];
}
test('Treffermarke: a hit on the flank lands on the flank – on the wing of the slab (Dorn Manta), on the ring (Lyss Halo-9), on the rotor hoop (Tarn Cyclone), not on the core barrel', () => {
  for (const id of ['manta', 'halo', 'cyclone']) {
    const p = byId(id), A = assembleHero(p, 28, headOf(p)), sp = podLayout(p).engines[A.banks[0].engines[0].index].spec, x = engineExtent(sp);
    for (let b = 0; b < A.banks.length; b++) {
      const [r] = markAt(A, b, A.banks[b].side, 0);
      ok(r > x.side - 0.15 && r <= x.side + 0.02, `${id}, bank ${b}: mark ${r.toFixed(2)} m from the axis – the flank is at ${x.side.toFixed(2)} m, the barrel at ${sp.R.toFixed(2)} m`);
    }
  }
});
test('Treffermarke: on every racer a mark sits on the skin – no deeper than the barrel, no further out than the pod is wide, within the engine', () => {
  for (const p of PODS) {
    const A = assembleHero(p, 28, headOf(p)), env = podEnvelope(p);
    for (let b = 0; b < A.banks.length; b++) for (const [dx, dy] of [[A.banks[b].side, 0], [-A.banks[b].side, 0], [0, 1], [0, -1]]) {
      const e = A.banks[b].engines[0], [r, dz] = markAt(A, b, dx, dy);
      ok(r > e.geo.R * 0.85, `${p.id}, bank ${b}, from (${dx}, ${dy}): ${r.toFixed(2)} m from the axis, barrel ${e.geo.R.toFixed(2)} m`);
      ok(Math.abs(dz) <= e.geo.L * 0.5 + 0.3 + 1e-9, `${p.id}: ${dz.toFixed(2)} m along an engine of ${e.geo.L} m`);
      if (dy === 0 && dx === A.banks[b].side) ok(Math.abs(A.banks[b].pivot.x + e.off.x) + r <= Math.max(Math.abs(env.engL.outerX), Math.abs(env.engR.outerX)) + 0.6, `${p.id}: mark outside the pod`);
    }
  }
});
test('Treffermarke: a ring segment that has broken off gets no mark (Lyss Halo-9: the hit goes on what is still there)', () => {
  const p = byId('halo'), A = assembleHero(p, 28, headOf(p)), b = 0, bank = A.banks[b], geo = bank.buckets.get('hull')!, sd = bank.side;
  const up = [sd * Math.sin(0.55), Math.cos(0.55)] as const; // 32° from the top towards the outer flank: the middle of the upper outer arc (10°–55°)
  const [r0] = markAt(A, b, up[0], up[1]); ok(r0 > 1.6, `intact: the mark should sit on the ring, ${r0.toFixed(2)} m`);
  const v = new THREE.Vector3(), e = bank.engines[0]; skinPoint(geo, e.off.x, e.off.y, up[0], up[1], e.off.z, e.geo.L * 0.5 + 0.3, v);
  const ang0 = Math.atan2(Math.abs(v.x - e.off.x), v.y - e.off.y); ok(ang0 > 0.17 && ang0 < 0.96, `intact: mark at ${(ang0 * 57.3).toFixed(0)}° from the top (arc 10°–55°)`);
  // lose every Bruchteil of this bank's skin, as podModel's Hider does
  const ranges = [...A.breaks].flatMap(([id, sh]) => sh.ranges.filter(q => q.where === b && q.key === 'hull').map(q => ({ id, start: q.start, count: q.count })));
  ok(ranges.length >= 2, `Bruchteile in the skin of bank ${b}: ${ranges.length}`);
  const idx = geo.index!, full = (idx.array as Uint16Array | Uint32Array).slice(), n = visibleIndices(full, ranges, new Set(ranges.map(q => q.id)), idx.array as Uint16Array | Uint32Array);
  geo.setDrawRange(0, n); skinPoint(geo, e.off.x, e.off.y, up[0], up[1], e.off.z, e.geo.L * 0.5 + 0.3, v);
  const ang = Math.atan2(Math.abs(v.x - e.off.x), v.y - e.off.y), r = Math.hypot(v.x - e.off.x, v.y - e.off.y);
  ok(!(r > 1.6 && ang > 0.19 && ang < 0.94), `arc gone: the mark is still on it (${r.toFixed(2)} m, ${(ang * 57.3).toFixed(0)}° from the top)`);
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
test('profile: a save edited by hand cannot crash a race – difficulty, laps and camera are forced into their lists (difficulty 9 used to crash Game.createPods)', () => {
  saved(V2, { race: { difficulty: 9, laps: 0, camera: -4 } }); let r = loadProfile().race;
  eq([r.difficulty, r.laps, r.camera], [DIFFICULTIES.length - 1, 1, 0]);
  saved(V2, { race: { difficulty: 'hard', laps: null, camera: 2.4, timeOfDay: 'noon', weather: 'acid' } }); r = loadProfile().race;
  eq([r.difficulty, r.laps, r.camera, r.timeOfDay, r.weather], [1, 3, 2, 'auto', 'auto'], 'wrong kinds become the defaults:');
  saved(V2, { race: { laps: 99, camera: 99, timeOfDay: 'night', weather: 'storm' } }); r = loadProfile().race;
  eq([r.laps, r.camera, r.timeOfDay, r.weather], [MAX_LAPS, CAMERA_NAMES.length - 1, 'night', 'storm']);
});
test('profile: graphics values are forced into the ranges of the settings screen, wrong kinds become the default, unknown fields go', () => {
  saved(V2, { gfx: { geometry: 99, shadows: -1, texRes: 300, aa: 'msaa', renderScale: 9, fov: 'wide', bloom: 'yes', anisotropy: 5, preset: 'insane', backend: 'vulkan', particles: 0, bogus: 1 }, volume: -3, best: { boonta: 91.5, frost: 'fast', magma: -1 } });
  const p = loadProfile(), g = p.gfx, d = defaultProfile().gfx;
  eq([g.geometry, g.shadows, g.texRes, g.aa, g.renderScale, g.fov, g.bloom, g.anisotropy, g.preset, g.backend, g.particles], [3, 0, d.texRes, d.aa, 1.5, d.fov, d.bloom, d.anisotropy, d.preset, 'auto', 0.2]);
  ok(!('bogus' in g), 'unknown field kept'); eq(p.volume, 0); eq(p.best, { boonta: 91.5 });
});
test('profile: every setting the screens can produce survives saving and loading (all four presets, custom values)', () => {
  for (const preset of ['low', 'medium', 'high', 'ultra'] as const) {
    const p0 = defaultProfile(); Object.assign(p0.gfx, PRESETS[preset], { preset, fov: 88, bloomStrength: 1.2, showFps: false, backend: 'webgl' });
    p0.volume = 0.25; p0.best = { boonta: 123.4 }; p0.race = { trackId: 'frost', laps: 5, opponents: 9, difficulty: 3, camera: 4, timeOfDay: 'cycle', weather: 'changing' };
    store.clear(); saveProfile(p0); const p = loadProfile();
    for (const k of Object.keys(p0.gfx) as (keyof GfxSettings)[]) eq(p.gfx[k], p0.gfx[k], `${preset}: gfx.${k}`);
    eq(Object.keys(p.gfx).sort(), Object.keys(p0.gfx).sort(), `${preset}: gfx fields`);
    eq(p.race, p0.race); eq(p.volume, 0.25); eq(p.best, p0.best);
  }
});

// ------------------------------------------------------------------ tunnel vaults & overheads (the hull round a pod)
const TRACK_MEMO = new Map<string, TrackData>();
/** A track, built once for the checks below (they leave it as they found it). */
function trackOf(id: string) { let td = TRACK_MEMO.get(id); if (!td) { td = buildTrack(TRACKS.find(t => t.id === id)!); TRACK_MEMO.set(id, td); } return td; }
/** The corners of a pod's hull in the world, worked out the way its MODEL is drawn (podModel: group → body → engine banks / cockpit
 *  group, three.js matrices) – on purpose not with physics' own `hullWorld`. Returns x, y, z triples (overwritten by the next call). */
const RIG = (() => { const group = new THREE.Group(), body = new THREE.Group(), bankL = new THREE.Group(), bankR = new THREE.Group(), ck = new THREE.Group(); group.add(body); body.add(bankL, bankR, ck); return { group, body, bankL, bankR, ck, v: new THREE.Vector3(), out: new Float32Array(3 * 512) }; })();
function hullAsDrawn(p: PodState): Float32Array {
  const env = podEnvelope(p.def), { group, body, bankL, bankR, ck, v, out } = RIG;
  group.position.copy(p.pos); group.rotation.set(0, p.yaw, 0); body.position.z = env.bodyZ; body.rotation.set(p.pitch, 0, p.roll);
  bankL.position.y = p.engYL ?? 0; bankR.position.y = p.engYR ?? 0; // setEngineMotion: an engine side lifts as a whole
  ck.position.set(p.ckX ?? 0, p.ckY ?? 0, p.ckZ ?? 0); ck.rotation.z = -(p.ckX ?? 0) * COCKPIT_SWAY.roll; ck.rotation.x = (p.ckZ ?? 0) * COCKPIT_SWAY.pitch; // setCockpitSway
  group.updateMatrixWorld(true);
  let n = 0;
  for (const [g, a] of [[bankL, env.hull.L], [bankR, env.hull.R], [ck, env.hull.ck]] as const) for (let i = 0; i < a.length; i += 3) { g.localToWorld(v.set(a[i], a[i + 1], a[i + 2])); out[n++] = v.x; out[n++] = v.y; out[n++] = v.z; }
  return out.subarray(0, n);
}
/** Height (world y) of the tunnel shell above a world point, as the mesh is built: one ring per sample – the superellipse over the road,
 *  sheared with the bank – and straight between rings; where a cave branches (the ring's side is open to the linked path) the two tubes
 *  are one cavern and the higher shell counts. NaN under the open sky. (A vault is cut off at `VAULT_CLAMP` of its half width, as in
 *  physics: next to the wall foot the shell comes down to the road.) `near` = a sample of `path` close to the point. */
function shellAt(td: TrackData, path: Path, near: number, x: number, z: number, y = 0, linked = true): number {
  const S = path.samples, n = S.length, at = (k: number) => S[path.closed ? ((k % n) + n) % n : Math.max(0, Math.min(n - 1, k))];
  let j = near, bd = 1e12; for (let k = near - 11; k <= near + 11; k++) { const q = at(k), d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; j = k; } }
  const lat = (q: Sample) => (x - q.x) * q.rx + (z - q.z) * q.rz;
  const ring = (q: Sample) => q.y + q.ramp - lat(q) * q.bank + tunnelCeiling(q, Math.min(Math.abs(lat(q)), VAULT_CLAMP * (q.hw + TUNNEL_SHOULDER + (q.caveW ?? 0))));
  const ahead = (q: Sample) => (x - q.x) * q.tx + (z - q.z) * q.tz; // how far the point is ahead of the ring of `q`
  const s = at(j), a = ahead(s), t = at(a >= 0 ? j + 1 : j - 1), b = ahead(t), f = a * b < 0 ? a / (a - b) : Math.min(1, Math.abs(a) / DS); // between the rings of s and t
  let sh = s.roof > 0 ? (t.roof > 0 ? ring(s) * (1 - f) + ring(t) * f : f < 0.5 ? ring(s) : NaN) : t.roof > 0 && f >= 0.5 ? ring(t) : NaN;
  const q = s.roof > 0 ? s : t;
  if (linked && sh === sh && q.link >= 0 && q.link !== path.id && (lat(q) < 0 ? q.openL : q.openR)) { // the other tube of the junction: its sample nearest to the point (same level)
    const O = td.paths[q.link], T = O.samples, cx = Math.round(x / 8) * 8, cz = Math.round(z / 8) * 8, key = `${td.def.id} ${O.id} ${cx} ${cz} ${Math.round(y / 8)}`;
    let m = LINKED.get(key); // (searched once per 8 m cell: the search below covers 22 m either way)
    if (m === undefined) { let md = 1e12; m = 0; for (let k = 0; k < T.length; k++) { const d = (T[k].x - cx) ** 2 + (T[k].z - cz) ** 2 + (T[k].y - y) ** 2 * 4; if (d < md) { md = d; m = k; } } LINKED.set(key, m); }
    const o = shellAt(td, O, m, x, z, y, false); if (o > sh) sh = o;
  }
  return sh;
}
const LINKED = new Map<string, number>();
/** A complete pod hanging in the air over sample `idx` of `path` (`stepPod` reads every field). */
function racer(def: PodDef, td: TrackData, idx: number, lat: number, y: number, path = 0): PodState {
  const s = td.paths[path].samples[idx], pilot = PILOTS.find(q => q.id === def.pilotId) ?? PILOTS[0];
  return {
    id: 0, isPlayer: true, def, pilot, stats: effectiveStats(def.id, undefined), name: pilot.name, color: pilot.color,
    pos: new THREE.Vector3(s.x + s.rx * lat, y, s.z + s.rz * lat), vel: new THREE.Vector3(), yaw: Math.atan2(s.tx, s.tz), yawRate: 0, steer: 0,
    path, idx, lat, grounded: false, zeroG: false, air: 0, groundY: s.y, prevGroundY: s.y, engYL: 0, engYR: 0, engVL: 0, engVR: 0, engPL: 0, engPR: 0,
    input: { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false, repair: false },
    hpL: 100, hpR: 100, heat: 0, boosting: false, overheat: false, repairing: false, airbraking: false,
    lap: 0, passedMid: true, rel: 0, prog: 0, finished: false, finishTime: 0, lapStart: 0, lapTimes: [],
    dead: 0, invuln: 99, lastSafePath: 0, lastSafeIdx: idx, wrongWay: 0, roll: 0, pitch: 0, shake: 0, events: [], visual: null, place: 1,
    inRoof: true, upper: false, // (in a tunnel: already inside, below its shell)
  } as unknown as PodState;
}
/** How a test pod is held while it is pushed upwards: [name, where across the road (-1..1 of what the walls allow), forward speed (m/s:
 *  0 = nose up, fast = level), lift key, roll (-1..1 = up to 90°), left engine held up (m), cockpit swung out (0/1)] */
type Hold = [string, number, number, boolean, number, number, number];
const HOLDS: Hold[] = [
  ['level, crown', 0, 100, false, 0, 0, 0], ['nose up, crown', 0, 0, false, 0, 0, 0], ['nose up with the lift key, crown', 0, 0, true, 0, 0, 0],
  ['level, at the wall', 1, 100, false, 0, 0, 0], ['nose up, at the other wall', -1, 0, false, 0, 0, 0],
  ['left engine lifted 1.5 m', 0.5, 100, false, 0, 1.5, 0], ['cockpit swung out and up, nose up', -0.5, 0, false, 0, 0, 1],
  ['half roll, left side up', 0.5, 100, false, 0.5, 0, 0], ['half roll, right side up, nose up', -0.5, 0, false, -0.5, 0, 0],
  ['knife-edge, crown', 0, 100, false, 1, 0, 0], ['knife-edge half way to the wall, nose up', 0.5, 0, false, -1, 0, 0],
];
/** Pushes `p` upwards (a pod flying into something above it) until it has been held there for half a second – 2.5 s at most.
 *  `past` = how far the pod's highest point is past whatever is above it (m). The pod starts 12 m short of it. Returns [the most it
 *  was past it in any frame, the least and the most in the last quarter of a second]. */
function pushUp(p: PodState, td: TrackData, h: Hold, past: () => number): [number, number, number] {
  const [, , speed, liftKey, roll, lift, sway] = h, x0 = p.pos.x, z0 = p.pos.z, s = td.paths[p.path].samples[p.idx];
  p.pos.y -= past() + 12;
  let o = -12, most = -99, end = 99, endMost = -99, held = 0;
  for (let f = 0; f < 150 && held < 30; f++) {
    p.pos.x = x0; p.pos.z = z0; p.vel.set(s.tx * speed, o < -6 ? 30 : 9, s.tz * speed); p.rollCtl = roll; p.input.roll = roll; p.input.pitch = liftKey ? 1 : 0; // held in place, pushed up all the time (fast while far away)
    if (lift) { p.engYL = lift; p.engVL = 0; }
    if (sway) { p.ckX = 1.6; p.ckY = 0.7; p.ckZ = 0.9; p.ckVX = 0; p.ckVY = 0; p.ckVZ = 0; }
    stepPod(p, td, 1 / 60, f / 60, 1, false);
    if (o < -6 ? f % 3 : o < -2 && f % 2) continue; // (still away: a look every third / second frame is enough – the pod gains less than 1.5 m, then less than 1 m per frame)
    o = past(); if (o > most) most = o;
    if (o > -0.3 || held) { held++; if (held > 15) { if (o < end) end = o; if (o > endMost) endMost = o; } }
    if (p.grounded && o > -1) throw new Error(`${p.def.id}, ${h[0]}: the test pod reaches what is above it while it still rides on its repulsors – nothing to test here`);
  }
  return [most, held >= 30 ? end : o, held >= 30 ? endMost : o];
}
/** As far out as a pod's centre gets on side `sd` of sample `s`: its collision circles against the wall (a rolled pod is narrow). */
function farOut(def: PodDef, s: Sample, sd: number, roll: number) {
  const rollW = Math.max(0.22, Math.abs(Math.cos(roll * Math.PI / 2))); let r = 0; for (const c of podCollision(def).circles) r = Math.max(r, Math.abs(c.x) * rollW + c.r);
  return sd * Math.max(0, Math.min((sd < 0 ? s.wallL : s.wallR) - r, s.hw + 1.5)); // (past the road edge + 1.5 m nothing carries a pod)
}
test('tunnel ceiling: pushed up against the vault, no pod reaches into it and none stops short of it – every corner of the hull round the pod, placed as the model is drawn, ends at the shell above THAT corner: level and nose up, at the crown and at the walls, engine lifted, cockpit swung out, rolled; in a straight tunnel, in a cave chamber on a bend and where a cave branches', () => {
  const bad: string[] = []; let worstIn = -9, worstShort = 0, n = 0;
  // the spots: [track, path (-1: its first cave branch), kind of tunnel, what to look for]
  for (const [trackId, pathSel, kind, spot] of [['boonta', 0, 1, 'straight'], ['frost', 0, 3, 'chamber'], ['crystal', -1, 3, 'junction']] as const) {
    const td = trackOf(trackId), path = pathSel < 0 ? td.paths.find(q => q.isCave)! : td.paths[pathSel];
    ok(path, `${trackId} has no cave branch`);
    const S = path.samples, pad = spot === 'junction' ? 8 : 30;
    // well inside a roofed run of that kind – straight: the least bend · chamber: where the roof height changes fastest, on a banked bend
    // · junction: where the branch is still open to the main cavern, as far along as possible (the two roads have parted)
    let idx = -1, best = -1e9;
    for (let i = pad; i < S.length - pad; i++) {
      let inside = true; for (let k = -pad; k <= pad && inside; k++) inside = S[i + k].roof > 0 && S[i + k].tun === kind && !S[i + k].gap;
      if (!inside || (spot === 'junction') !== (S[i].openL || S[i].openR)) continue;
      const score = spot === 'chamber' ? Math.abs(S[i + 4].roof - S[i - 4].roof) + Math.abs(S[i].bank) * 10 : spot === 'junction' ? i : -Math.abs(S[i].curv);
      if (score > best) { best = score; idx = i; }
    }
    ok(idx > 0, `${trackId} has no ${spot} to test in`);
    // (every hold with four pods: the tallest, the widest, the one with the longest nose and the one whose cockpit is its highest
    // point; in the straight tunnel every pod with the first four holds)
    for (const def of PODS) for (const h of HOLDS) {
      if (!['brute', 'cyclone', 'aurora', 'volt'].includes(def.id) && (spot !== 'straight' || HOLDS.indexOf(h) > 3)) continue;
      const s0 = S[idx], lat = h[1] ? farOut(def, s0, Math.sign(h[1]), h[4]) * Math.abs(h[1]) : 0;
      const p = racer(def, td, idx, lat, s0.y, path.id);
      // how far the highest corner is past the shell above it (m)
      const [into, last] = pushUp(p, td, h, () => { let o = -99; const c = hullAsDrawn(p); for (let i = 0; i < c.length; i += 3) { const sh = shellAt(td, td.paths[p.path], p.idx, c[i], c[i + 2], c[i + 1]); if (sh === sh) o = Math.max(o, c[i + 1] - sh); } return o; });
      n++; worstIn = Math.max(worstIn, into); worstShort = Math.min(worstShort, last);
      const where = `${trackId} (${spot}) ${def.id}, ${h[0]}`;
      if (p.dead > 0 || p.upper) bad.push(`${where}: the test pod did not stay inside the tunnel`);
      else if (into > 0.05) bad.push(`${where}: ${into.toFixed(2)} m inside the vault`);
      else if (last < -0.05) bad.push(`${where}: stopped ${(-last).toFixed(2)} m below the vault`);
      if (process.env.CEIL_TABLE) console.log(`   ${where.padEnd(68)} deepest ${into >= 0 ? '+' : ''}${into.toFixed(3)} m · at the end ${last >= 0 ? '+' : ''}${last.toFixed(3)} m (pitch ${p.pitch.toFixed(2)}, roll ${p.roll.toFixed(2)}, path ${p.path})`);
    }
  }
  if (process.env.CEIL_TABLE) console.log(`   ${n} cases: at most ${worstIn.toFixed(3)} m inside the vault, at most ${(-worstShort).toFixed(3)} m short of it`);
  ok(!bad.length, `${bad.length} of ${n} cases:\n         ${bad.slice(0, 12).join('\n         ')}`);
});
test('tunnel ceiling: every pod fits under every tunnel – wherever a pod rides upright (lift key held, nose up, both engines fully lifted, cockpit swung up, leaning; at either wall), half a metre above its ride height the vault is still clear of every corner of its hull', () => {
  const pts = new Float32Array(3 * 512), bad: string[] = []; let worst = 1e9, where = '', n = 0;
  for (const tdef of TRACKS) {
    const td = trackOf(tdef.id);
    for (const path of td.paths) { const S = path.samples;
      for (let i = 3; i < S.length - 3; i += 6) {
        const s = S[i]; if (!(s.roof > 0) || s.gap) continue;
        const slope = Math.atan2(S[i + 3].y + S[i + 3].ramp - S[i - 3].y - S[i - 3].ramp, 6 * DS); // the road's gradient: a riding pod follows it (0.92 of it)
        for (const def of PODS) { const env = podEnvelope(def);
          for (const sd of [-1, 1]) for (const lean of [0.19, -0.19]) { // (stepPod: a steering pod leans up to 0.19 on top of the road's bank)
            const lat = farOut(def, s, sd, 0), fr = frameAt(path, i, s.x + s.rx * lat, s.z + s.rz * lat);
            const p = racer(def, td, i, lat, fr.groundY + HOVER + 0.1 + 1.6 + 0.5, path.id); // stepPod's `targetY` with the lift key held, and half a metre
            p.pitch = -slope * 0.92 - 0.245; p.roll = Math.atan(s.bank) * 0.92 + lean; // (nose up: lift key 0.2 + boost 0.045)
            p.engYL = 1.95; p.engYR = 1.95; p.ckY = 0.8; p.ckX = sd * 1.9; p.ckZ = 1;
            const cn = hullWorld(p, env, pts); n++;
            const tag = () => `${tdef.id}: ${def.id}, ${Math.abs(lat).toFixed(0)} m off the centre line (road half width ${s.hw.toFixed(0)} m, roof ${s.roof.toFixed(0)} m, path ${path.id} sample ${i})`;
            if (vaultOver(td, path, i, pts, cn) > 0) bad.push(tag());
            if (process.env.CEIL_TABLE) { const room = 0.5 - vaultOver(td, path, i, pts, cn, true); if (room < worst) { worst = room; where = tag(); } }
          }
        }
      }
    }
  }
  if (process.env.CEIL_TABLE) console.log(`   ${n} riding poses, tightest spot: ${worst.toFixed(2)} m of room – ${where}`);
  ok(!bad.length, `the vault is in the way of an upright riding pod in ${bad.length} of ${n} poses:\n         ${bad.slice(0, 8).join('\n         ')}`);
});
test('tunnel ceiling: a pod that rides on its repulsors is never pressed down by the vault – even in a tunnel made lower than the pod is tall it rides exactly as high as under the open sky (the vault is for pods in the air; pressing a riding pod down would fight the ground clamp)', () => {
  const td = trackOf(TRACKS[0].id), S = td.main.samples, pts = new Float32Array(3 * 512);
  let idx = -1; for (let i = 80; i < S.length - 80 && idx < 0; i++) { let inside = true; for (let k = -30; k <= 30 && inside; k++) inside = S[i + k].roof > 0 && S[i + k].tun === 1 && !S[i + k].gap && S[i + k].ramp === 0; if (inside) idx = i; }
  ok(idx > 0, 'the first track has no standard tunnel to test in');
  const s0 = S[idx], roofs = S.map(q => q.roof);
  const ride = (def: PodDef, roof: number) => { // 1.5 s along the centre line at 60 m/s with the lift key held, under a roof of that height (0: none)
    for (let k = -70; k <= 70; k++) S[idx + k].roof = roof;
    const p = racer(def, td, idx, 0, frameAt(td.main, idx, s0.x, s0.z).groundY + HOVER); p.grounded = true; p.inRoof = roof > 0;
    for (let f = 0; f < 90; f++) { p.pos.x = s0.x; p.pos.z = s0.z; p.vel.x = s0.tx * 60; p.vel.z = s0.tz * 60; p.input.pitch = 1; p.input.throttle = 1; stepPod(p, td, 1 / 60, f / 60, 1, false); }
    return p;
  };
  try {
    for (const def of PODS) {
      const p = ride(def, 5.5), into = vaultOver(td, td.main, p.idx, pts, hullWorld(p, podEnvelope(def), pts), true), q = ride(def, 0);
      ok(p.grounded && p.dead <= 0 && !p.upper, `${def.id}: the test pod does not ride inside the tunnel (grounded ${p.grounded}, dead ${p.dead}, on the deck ${p.upper})`);
      ok(into > 0.3, `${def.id}: its hull does not stand in the low vault (${into.toFixed(2)} m) – this check tests nothing`);
      ok(Math.abs(p.pos.y - q.pos.y) < 1e-6, `${def.id}: rides ${(p.pos.y - p.groundY).toFixed(2)} m above the road in the low tunnel, ${(q.pos.y - q.groundY).toFixed(2)} m under the open sky (its hull stands ${into.toFixed(2)} m in the vault)`);
      if (process.env.CEIL_TABLE) console.log(`   ${def.id.padEnd(8)} rides ${(p.pos.y - p.groundY).toFixed(2)} m above the road with and without the 5.5 m roof; its hull stands ${into.toFixed(2)} m in that vault`);
    }
  } finally { S.forEach((smp, k) => { smp.roof = roofs[k]; }); }
});
test('overheads: a pod that flies into a gantry or an arch is knocked down by its own height – as it passes underneath, no corner of its hull is in the structure (before: 1.5 m above the pod centre for every pod, the rest went through)', () => {
  const td = trackOf(TRACKS[0].id), S = td.main.samples;
  let idx = -1; for (let i = 100; i < S.length - 100 && idx < 0; i++) { let free = true; for (let k = -40; k <= 40 && free; k++) { const q = S[i + k]; free = !(q.roof > 0) && !q.gap && q.ramp === 0 && !q.zeroG && Math.abs(q.curv) < 1e-3; } if (free) idx = i; }
  ok(idx > 0, 'the first track has no open straight to test on');
  const s0 = S[idx], bad: string[] = [], half = 1.5, Ri = s0.hw + 5 - 1.7;
  const flat = { idx, y0: s0.y + 15, y1: s0.y + 18, half }, arch = { idx, y0: 0, y1: 0, half, arch: { R: s0.hw + 5, sy: 0.82 } };
  for (const [kind, oh] of [['gantry', flat], ['arch', arch]] as const) for (const def of PODS) for (const [name, latF, climb] of [['level', 0, 0], ['climbing, nose up', 0.5, 7], ['at the wall', 1, 0]] as const) {
    td.overheads = [oh];
    const lat = farOut(def, s0, 1, 0) * latF, under = kind === 'gantry' ? flat.y0 : s0.y + 0.82 * Math.sqrt(Ri * Ri - lat * lat); // (an arch is read at the pod centre's lateral position)
    // 50 m before the structure, flying at 60 m/s, so high that the pod's top would pass 1.5 m above the underside
    const start = S[idx - 25], p = racer(def, td, idx - 25, lat, 0); p.inRoof = false;
    p.pos.set(start.x + start.rx * lat, 0, start.z + start.rz * lat); p.vel.set(start.tx * 60, 0, start.tz * 60);
    let top = -1e9; { const c = hullAsDrawn(p); for (let i = 1; i < c.length; i += 3) top = Math.max(top, c[i]); } p.pos.y = under + 1.5 - top - climb * 0.8;
    let into = -99, knocked = false;
    for (let f = 0; f < 100; f++) {
      const y = p.pos.y; p.vel.set(S[p.idx].tx * 60, climb, S[p.idx].tz * 60); // (held on its course: no gravity, no drag)
      stepPod(p, td, 1 / 60, f / 60, 1, false);
      if (p.pos.y < y + climb / 60 - 0.3) knocked = true; else if (!knocked) p.pos.y = y + climb / 60;
      const c = hullAsDrawn(p); for (let i = 0; i < c.length; i += 3) if (Math.abs((c[i] - s0.x) * s0.tx + (c[i + 2] - s0.z) * s0.tz) <= half) into = Math.max(into, c[i + 1] - under);
    }
    const where = `${kind} ${def.id}, ${name}`;
    // (an overhead is tested in the middle of a step, before the pod's pose moves on: its nose swings on by up to 0.2 m in the step of the knock)
    if (p.dead > 0) bad.push(`${where}: the test pod died`);
    else if (!knocked) bad.push(`${where}: the pod was not knocked down`);
    else if (into > 0.3) bad.push(`${where}: ${into.toFixed(2)} m into the structure as it passes underneath`);
    if (process.env.CEIL_TABLE) console.log(`   ${where.padEnd(40)} deepest ${into >= 0 ? '+' : ''}${into.toFixed(3)} m`);
  }
  td.overheads = [];
  ok(!bad.length, `\n         ${bad.slice(0, 12).join('\n         ')}`);
});

// ------------------------------------------------------------------ pod against pod: who is told
test('pod contact: one event per contact – the player gets it whichever of the two comes first in the field (Treffermarke, full sound)', () => {
  const two = (playerFirst: boolean) => {
    const mk = (x: number, vx: number, isPlayer: boolean) => pod({ isPlayer, invuln: 0, dead: 0, shake: 0, pos: new THREE.Vector3(x, 0, 0), vel: new THREE.Vector3(vx, 0, 0) });
    const a = mk(-1, 12, playerFirst), b = mk(1, -12, !playerFirst); collidePods([a, b], 1);
    return { a, b, player: playerFirst ? a : b, other: playerFirst ? b : a };
  };
  for (const first of [true, false]) {
    const { a, b, player, other } = two(first), e = player.events;
    eq([e.length, other.events.length], [1, 0], `player ${first ? 'first' : 'second'} – events at [player, Gegner]:`); eq(e[0].type, 'pod');
    ok(a.hpL < 100 && b.hpL < 100, 'both pods pay');
    ok((e[0].x - player.pos.x) * (other.pos.x - player.pos.x) > 0 && Math.abs(e[0].x - player.pos.x) < Math.abs(other.pos.x - player.pos.x), `the mark sits on the player's flank towards the other pod: x ${e[0].x}, player at ${player.pos.x}, Gegner at ${other.pos.x}`);
    ok(e[0].nx * (player.pos.x - other.pos.x) > 0, 'the normal points from the other pod to the player');
  }
  const mk = (x: number, vx: number) => pod({ isPlayer: false, invuln: 0, dead: 0, shake: 0, pos: new THREE.Vector3(x, 0, 0), vel: new THREE.Vector3(vx, 0, 0) });
  const a = mk(-1, 12), b = mk(1, -12); collidePods([a, b], 1); eq([a.events.length, b.events.length], [1, 0], 'two Gegner – the first one reports:');
});

// ------------------------------------------------------------------ walls: which part of the pod pays (user decision 2026-11-22)
/** Puts `def` against the right-hand rock wall of a straight piece of canyon on Boonta, moving `into` m/s towards the wall, nose turned
 *  `nose` rad towards it (0 = along the wall), and steps once. Rock, because a guard rail only hurts a pod that flies low – above it the
 *  energy field catches the pod. Returns [health lost on both engine sides together, the damage of the hit before any Panzerzone]
 *  (which collision circle touches decides who pays: one side, or half and half). */
function wallHit(def: PodDef, into: number, nose: number): [number, number] {
  const td = trackOf('boonta'), S = td.main.samples;
  let idx = -1;
  for (let k = 40; k < S.length - 40 && idx < 0; k++) {
    let fine = true;
    for (let j = k - 8; j <= k + 8 && fine; j++) { const q = S[j]; fine = !q.gap && !q.zeroG && !q.lake && !q.roof && !q.ramp && q.hR > 0 && Math.abs(q.curv) < 0.004 && Math.abs(q.bank) < 0.07; }
    if (fine) idx = k;
  }
  ok(idx > 0, 'no straight piece of canyon found on boonta');
  const s = S[idx], p = racer(def, td, idx, s.wallR - 1, s.y + HOVER);
  p.invuln = 0; p.yaw = Math.atan2(s.tx * Math.cos(nose) + s.rx * Math.sin(nose), s.tz * Math.cos(nose) + s.rz * Math.sin(nose)); p.vel.set(s.rx * into, 0, s.rz * into);
  stepPod(p, td, 1 / 60, 0, 1, false);
  const hits = p.events.filter(e => e.type === 'wall'); eq(hits.length, 1, 'wall events in the step:');
  return [200 - p.hpL - p.hpR, Math.min(28, Math.max(0, hits[0].strength - 9) * 0.7 * podParams(p).sturdy)];
}
test("walls: a head-on hit counts as zone 'front', a brush along the wall as 'side' (Mandrel Ram: its bar takes the wall as it takes a rock)", () => {
  const def = byId('odo'), m = damageModel('odo'), front = zoneFactor(m, 0, 1, 'front'), side = zoneFactor(m, 0, 1, 'side');
  eq(zoneFactor(m, 0, -1, 'front'), front); eq(zoneFactor(m, 0, -1, 'side'), side); // (an intact Ram is armoured alike on both sides)
  const [h, hraw] = wallHit(def, 30, 1.2), [b, braw] = wallHit(def, 30, 0.2); // nose 69° / 11° off the wall, both 30 m/s into it
  ok(hraw > 5 && braw > 5, `damage before armour: head-on ${hraw}, brush ${braw}`);
  near(h / hraw, front, 'head-on, share of the hit that gets through:'); near(b / braw, side, 'brush, share of the hit that gets through:');
  ok(front < side * 0.7, `the bar should take clearly more off a front hit (${front}) than off a side hit (${side})`);
});
test("walls: the limit is 30° to the wall, as for obstacles (nose 25° off the wall = 'side', 35° = 'front')", () => {
  const def = byId('odo'), m = damageModel('odo'), [a, araw] = wallHit(def, 30, 25 * Math.PI / 180), [b, braw] = wallHit(def, 30, 35 * Math.PI / 180);
  near(a / araw, zoneFactor(m, 0, 1, 'side'), '25°:'); near(b / braw, zoneFactor(m, 0, 1, 'front'), '35°:');
});
test('walls: with Panzerzonen switched off the angle makes no difference (CI: ARMOR=0)', () => plain(() => {
  const def = byId('odo'), [h, hraw] = wallHit(def, 30, 1.2), [b, braw] = wallHit(def, 30, 0.2);
  near(h / hraw, 1, 'head-on:'); near(b / braw, 1, 'brush:');
}));

// ---- steering while reversing (2026-11-22: user report "rückwärts ist die Lenkung nicht invertiert") ----
/** How far the nose has turned to the RIGHT (radians) after one second of holding the stick fully right, on a straight level piece
 *  of the Boonta road. `v0` = speed along the nose at the start (m/s, negative = backwards); `reverse` holds the brake / reverse key. */
function noseRightAfter(v0: number, reverse: boolean): number {
  const td = trackOf('boonta'), S = td.main.samples;
  let idx = -1;
  for (let k = 80; k < S.length - 80 && idx < 0; k++) {
    let fine = true;
    for (let j = k - 40; j <= k + 40 && fine; j++) { const q = S[j]; fine = !q.gap && !q.zeroG && !q.lake && !q.roof && !q.ramp && Math.abs(q.curv) < 0.002 && Math.abs(q.bank) < 0.03; }
    if (fine) idx = k;
  }
  ok(idx > 0, 'no straight level piece of road found on boonta');
  const s = S[idx], p = racer(byId('aurora'), td, idx, 0, s.y + HOVER), yaw0 = p.yaw;
  p.vel.set(s.tx * v0, 0, s.tz * v0); p.input.steer = 1; p.input.brake = reverse ? 1 : 0; p.input.throttle = reverse ? 0 : 1;
  for (let f = 0; f < 60; f++) stepPod(p, td, 1 / 60, f / 60, 1, false);
  // forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw): the nose's new direction, measured along the old right-hand side
  return Math.asin(Math.max(-1, Math.min(1, Math.sin(p.yaw) * -Math.cos(yaw0) + Math.cos(p.yaw) * Math.sin(yaw0))));
}
test('steering: flying forwards, stick right turns the nose to the right', () => {
  const a = noseRightAfter(30, false);
  ok(a > 0.2, `nose turned ${a.toFixed(3)} rad to the right, expected clearly more than 0.2`);
});
test('steering: reversing, stick right swings the TAIL to the right – the nose turns left, as a car does in reverse', () => {
  const a = noseRightAfter(-12, true);
  ok(a < -0.1, `nose turned ${a.toFixed(3)} rad to the right, expected clearly to the left (below -0.1)`);
});

// ---- forks: the mouth and the reunion of a shortcut or a cave branch (2026-11-22: user report "Höhlen/Abkürzungen haben am Anfang
// Geometriefehler und sind teilweise versperrt") ----
/** The terrain of a track as the mesh draws it: the field sampled every `cell` metres, each quad split as `buildTerrain` splits it.
 *  One per track and cell size (building the field is the expensive part). */
const terrainMeshes = new Map<string, (x: number, z: number) => number>();
function terrainMeshOf(id: string, cell: number): (x: number, z: number) => number {
  const key = id + '/' + cell; let mesh = terrainMeshes.get(key);
  if (!mesh) {
    const td = trackOf(id), tf = makeTerrainField(td, THEMES[TRACKS.find(t => t.id === id)!.theme], cell), memo = new Map<number, number>();
    const H = (i: number, j: number) => { const k = i * 200003 + j; let v = memo.get(k); if (v === undefined) { v = tf.heightAt(i * cell, j * cell); memo.set(k, v); } return v; };
    mesh = (x, z) => {
      const fi = x / cell, fj = z / cell, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, a = H(i, j), b = H(i, j + 1), c = H(i + 1, j + 1), d = H(i + 1, j);
      return u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c);
    };
    terrainMeshes.set(key, mesh);
  }
  return mesh;
}
/** How far that terrain mesh stands above the road at the fork mouths and reunions of a track. Returns [highest excess in metres, where]. */
function terrainOverRoadAtForks(id: string, cell: number): [number, string] {
  const td = trackOf(id), mesh = terrainMeshOf(id, cell);
  let worst = 0, where = '';
  const scan = (p: Path, i: number) => {
    const s = p.samples[i]; if (!s || s.gap || s.bridge || s.zeroG || s.lake) return;
    for (let lat = -s.hw + 0.5; lat <= s.hw - 0.5; lat += 1.5) {
      const over = mesh(s.x + s.rx * lat, s.z + s.rz * lat) - (s.y + s.ramp - lat * s.bank);
      if (over > worst) { worst = over; where = `${id} path ${p.id} sample ${i} lat ${lat.toFixed(0)}`; }
    }
  };
  const N = td.main.samples.length;
  for (const br of td.paths.slice(1)) {
    for (const m of [br.mainFrom, br.mainTo]) for (let k = -50; k <= 50; k += 2) scan(td.main, ((m + k) % N + N) % N);
    for (let k = 0; k < Math.min(60, br.samples.length); k += 2) { scan(br, k); scan(br, br.samples.length - 1 - k); }
  }
  return [worst, where];
}
for (const id of ['boonta', 'frost', 'magma', 'oovo']) test(`forks: the terrain stays below the road at every mouth and reunion of ${id} (terrain mesh of 7 m and of 13.75 m)`, () => {
  for (const cell of [7, 13.75]) { const [over, where] = terrainOverRoadAtForks(id, cell); ok(over < 0.5, `${cell} m cells: terrain ${over.toFixed(2)} m above the road at ${where}`); }
});
test('forks: the canyon wall of the main road comes down to a kerb beside a fork mouth and rises with the distance', () => {
  let walls = 0;
  for (const id of ['boonta', 'dunepass', 'mosespa', 'frost']) {
    const td = trackOf(id), S = td.main.samples, N = S.length, W = (i: number) => S[((i % N) + N) % N];
    for (let i = 0; i < N; i++) for (const right of [false, true]) for (const dir of [-1, 1]) {
      const open = (q: Sample) => right ? q.openR : q.openL, h = (q: Sample) => right ? q.hR : q.hL;
      if (!open(S[i]) || open(W(i + dir)) || S[i].roof > 0) continue; // i = the last open sample of a mouth in direction `dir` (a cave fork has no canyon walls): look at the wall beyond it
      if (!(h(W(i + dir)) > 0 && h(W(i + dir * 19)) > 2.5)) continue; // (no wall reaches this end of the mouth)
      walls++;
      ok(h(W(i + dir)) <= 1.21, `${id} ${i}: the wall beside the mouth is ${h(W(i + dir)).toFixed(1)} m high, expected a kerb of 1.2 m`);
      for (let k = 1; k < 18; k++) { const a = h(W(i + dir * k)), b = h(W(i + dir * (k + 1))); if (!(b > 0)) break; ok(b >= a - 2.5, `${id} ${i}: the wall drops from ${a.toFixed(1)} to ${b.toFixed(1)} m going away from the mouth (${k} → ${k + 1} samples)`); }
      ok(h(W(i + dir * 12)) > h(W(i + dir)) + 0.6, `${id} ${i}: twelve samples from the mouth the wall is only ${h(W(i + dir * 12)).toFixed(1)} m high (beside the mouth: ${h(W(i + dir)).toFixed(1)} m)`);
    }
  }
  ok(walls >= 3, `only ${walls} canyon walls found that reach a fork mouth – the check would prove nothing`);
});
test('clipOutside: a square cut by a plane keeps exactly the half outside, without a vertex beyond the cut', () => {
  const b = { pos: [0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0], uv: [0, 0, 1, 0, 1, 1, 0, 1], ind: [0, 1, 2, 0, 2, 3] };
  clipOutside(b, x => x > 0.5); // everything right of x = 0.5 is "inside" and must go
  let area = 0;
  for (let t = 0; t < b.ind.length; t += 3) {
    const [i, j, k] = [b.ind[t], b.ind[t + 1], b.ind[t + 2]], ax = b.pos[i * 3], ay = b.pos[i * 3 + 1], cr = (b.pos[j * 3] - ax) * (b.pos[k * 3 + 1] - ay) - (b.pos[j * 3 + 1] - ay) * (b.pos[k * 3] - ax);
    ok(cr > 0, 'a kept triangle changed its winding'); area += cr / 2;
    for (const v of [i, j, k]) ok(b.pos[v * 3] <= 0.5 + 1e-9, `vertex at x = ${b.pos[v * 3]} lies beyond the cut`);
  }
  ok(Math.abs(area - 1) < 0.01, `kept area ${area.toFixed(4)}, expected 1 (the strip 0.5 × 2)`);
  for (let v = 4; v < b.pos.length / 3; v++) ok(Math.abs(b.uv[v * 2] - b.pos[v * 3] / 2) < 0.01, 'a cut vertex has the wrong texture coordinate');
});

// ---- climate and weather change the boost (2026-11-22, user decision: only the engine heat, ±10–25 %, Gegner too) ----
/** The engine-heat factor of a world at a time of day and a weather (1 = neutral, below 1 = the engines stay cooler). */
const envHeat = (theme: string, tod: TimeOfDay, wx: WeatherKind) => resolveEnvironment(THEMES[theme], tod, wx).fx.heat;
test('boost climate: rain, storm, snow and the night cool the engines; a dust or ash storm heats them', () => {
  const dayClear = envHeat('jungle', 'day', 'clear');
  ok(envHeat('jungle', 'day', 'rain') < dayClear - 0.05, `jungle rain ${envHeat('jungle', 'day', 'rain')} against clear ${dayClear}`);
  ok(envHeat('jungle', 'day', 'storm') < envHeat('jungle', 'day', 'rain'), 'a storm should cool more than rain');
  ok(envHeat('ice', 'day', 'snow') < envHeat('ice', 'day', 'clear') - 0.05, 'snow squalls should cool');
  ok(envHeat('desert', 'night', 'clear') < envHeat('desert', 'day', 'clear') - 0.05, 'the desert night should be cooler than its day');
  ok(envHeat('desert', 'day', 'dust') > envHeat('desert', 'day', 'clear') + 0.05, 'a dust storm should heat');
  ok(envHeat('lava', 'day', 'dust') > envHeat('lava', 'day', 'clear') + 0.05, 'an ash storm should heat');
});
test('boost climate: the ice world is cooler than the desert, and every factor stays within 0.75 … 1.25', () => {
  ok(envHeat('ice', 'day', 'clear') < 1 && envHeat('desert', 'day', 'clear') > 1, `ice ${envHeat('ice', 'day', 'clear')}, desert ${envHeat('desert', 'day', 'clear')}`);
  for (const theme of Object.keys(THEMES)) for (const tod of ['day', 'night', 'dawn', 'dusk'] as TimeOfDay[]) for (const wx of ['clear', 'rain', 'storm', 'snow', 'dust', 'fog'] as WeatherKind[]) {
    const h = envHeat(theme, tod, wx); // (weather a world does not have falls back to its own – the factor must still be sane)
    ok(h >= 0.75 && h <= 1.25, `${theme} ${tod} ${wx}: factor ${h}`);
  }
});
/** Engine heat of an Aurora after `secs` of boosting on a straight piece of Boonta with the environment's heat factor `env`, then after `cool` seconds without boost. */
function heatAfterBoost(env: number, secs: number, cool = 0): [number, number] {
  const td = trackOf('boonta'), S = td.main.samples;
  let idx = -1;
  for (let k = 80; k < S.length - 200 && idx < 0; k++) { let fine = true; for (let j = k - 10; j <= k + 190 && fine; j++) { const q = S[j]; fine = !q.gap && !q.zeroG && !q.lake && !q.roof && !q.ramp && Math.abs(q.curv) < 0.004 && q.surf === S[k].surf; } if (fine) idx = k; }
  ok(idx > 0, 'no long straight piece of road found on boonta');
  const s = S[idx], p = racer(byId('aurora'), td, idx, 0, s.y + HOVER);
  p.vel.set(s.tx * 80, 0, s.tz * 80); p.input.throttle = 1; p.input.boost = true;
  for (let f = 0; f < secs * 60; f++) stepPod(p, td, 1 / 60, f / 60, 1, false, env);
  const hot = p.heat; p.input.boost = false;
  for (let f = 0; f < cool * 60; f++) stepPod(p, td, 1 / 60, f / 60, 1, false, env);
  return [hot, p.heat];
}
test('boost climate: in the cold the same boost heats the engines less and they cool down faster; in the heat the opposite', () => {
  const [n, nc] = heatAfterBoost(1, 1.5, 0.4), [c, cc] = heatAfterBoost(0.8, 1.5, 0.4), [h, hc] = heatAfterBoost(1.2, 1.5, 0.4); // (0.4 s of cooling: no gauge reaches 0)
  ok(n > 0.2 && n < 0.95, `neutral: heat ${n.toFixed(3)} after 1.5 s of boost – the test needs a value in the middle of the scale`);
  ok(Math.abs(c / n - 0.8) < 0.02, `cold (0.8): heat ${c.toFixed(3)} against ${n.toFixed(3)} neutral – expected 80 %`);
  ok(Math.abs(h / n - 1.2) < 0.02, `hot (1.2): heat ${h.toFixed(3)} against ${n.toFixed(3)} neutral – expected 120 %`);
  ok(Math.abs((c - cc) / (n - nc) - 1.25) < 0.03, `cold: cooled by ${(c - cc).toFixed(3)} in 0.4 s against ${(n - nc).toFixed(3)} neutral – expected 125 %`);
  ok(Math.abs((h - hc) / (n - nc) - 1 / 1.2) < 0.03, `hot: cooled by ${(h - hc).toFixed(3)} in 0.4 s against ${(n - nc).toFixed(3)} neutral – expected 83 %`);
});

// ---- powder snow keeps the trails of the pods (2026-11-22, user decision: the trails change the driving too) ----
/** A fresh copy of the Frostspalt track with its snow field, and the middle of its powder run: [track, field, sample index]. */
function snowTrack(): [TrackData, SnowField, number] {
  const td = buildTrack(TRACKS.find(t => t.id === 'frost')!), snow = new SnowField(td); (td as unknown as { snow: SnowField }).snow = snow;
  ok(snow.runs.length > 0, 'the snow field found no powder run on frost');
  const r = snow.runs[0], mid = r.a + (r.n >> 1);
  eq(td.paths[r.path].samples[mid].surf, SURF.powder, 'surface in the middle of the run:');
  return [td, snow, mid];
}
/** An Aurora flying `secs` seconds along the powder run from sample `idx`, full throttle from `v0` m/s. It is kept on the centre line
 *  of the road (position and heading are put back after every step – the run bends), its speed is the physics' own. Returns it. */
function snowPass(td: TrackData, idx: number, secs: number, v0 = 60): PodState {
  const s = td.main.samples[idx], p = racer(byId('aurora'), td, idx, 0, s.y + HOVER);
  p.grounded = true; p.vel.set(s.tx * v0, 0, s.tz * v0); p.input.throttle = 1;
  for (let f = 0; f < secs * 60; f++) {
    stepPod(p, td, 1 / 60, f / 60, 1, false);
    const q = td.main.samples[p.idx], v = Math.hypot(p.vel.x, p.vel.z), al = (p.pos.x - q.x) * q.tx + (p.pos.z - q.z) * q.tz;
    p.pos.x = q.x + q.tx * al; p.pos.z = q.z + q.tz * al; p.yaw = Math.atan2(q.tx, q.tz); p.yawRate = 0; p.vel.x = q.tx * v; p.vel.z = q.tz * v;
  }
  return p;
}
test('snow: a pod presses a trail into the powder – packed under its engines, fresh a few metres beside it', () => {
  const [td, snow, mid] = snowTrack(), S = td.main.samples;
  snowPass(td, mid - 40, 1.2); // (60 m/s and faster for 1.2 s: from 40 samples before the middle to about 5 samples behind it)
  const at = (i: number, lat: number) => { const q = S[i]; return snow.packAt(0, i, q.x + q.rx * lat, q.z + q.rz * lat); };
  let best = 0; for (let lat = -6; lat <= 6; lat += 0.5) best = Math.max(best, at(mid - 20, lat));
  ok(best > 0.3 && best < 0.75, `packing in the trail after ONE pass: ${best.toFixed(2)}, expected 0.3 … 0.75`);
  ok(at(mid - 20, 14) === 0 && at(mid - 20, -14) === 0, `14 m beside the trail the snow should be fresh: ${at(mid - 20, 14)} / ${at(mid - 20, -14)}`);
  ok(at(mid + 60, 0) === 0, 'far ahead of the pod the snow should be fresh');
});
test('snow: every further pass packs the trail harder', () => {
  const [td, snow, mid] = snowTrack(), S = td.main.samples;
  const best = () => { let b = 0; const q = S[mid - 20]; for (let lat = -6; lat <= 6; lat += 0.5) b = Math.max(b, snow.packAt(0, mid - 20, q.x + q.rx * lat, q.z + q.rz * lat)); return b; };
  snowPass(td, mid - 40, 1.2); const one = best();
  snowPass(td, mid - 40, 1.2); const two = best();
  snowPass(td, mid - 40, 1.2); snowPass(td, mid - 40, 1.2); const four = best();
  ok(two > one + 0.1 && four > two + 0.05 && four <= 1, `packing after 1 / 2 / 4 passes: ${one.toFixed(2)} / ${two.toFixed(2)} / ${four.toFixed(2)}`);
});
test('snow: on a packed trail a pod is faster than in fresh powder', () => {
  const run = (packed: boolean) => {
    const [td, snow, mid] = snowTrack();
    if (packed) for (const r of snow.runs) { r.data.fill(255); }
    return Math.hypot(...snowPass(td, mid - 150, 2, 125).vel.toArray().filter((_, k) => k !== 1)); // (starts just below the top speed of fresh powder)
  };
  const fresh = run(false), firm = run(true);
  ok(firm > fresh * 1.02, `speed after 2 s: ${firm.toFixed(1)} m/s on a firm trail, ${fresh.toFixed(1)} m/s in fresh powder – expected at least 2 % more`);
});
test('snow: snowfall loosens a trail again', () => {
  const [td, snow, mid] = snowTrack(), q = td.main.samples[mid];
  for (const r of snow.runs) r.data.fill(200);
  const before = snow.packAt(0, mid, q.x, q.z); snow.snowIn(0.25); const after = snow.packAt(0, mid, q.x, q.z);
  ok(Math.abs(before - 200 / 255) < 0.01 && Math.abs(after - (200 / 255 - 0.25)) < 0.02, `packing ${before.toFixed(2)} → ${after.toFixed(2)} after snowIn(0.25), expected ${(200 / 255 - 0.25).toFixed(2)}`);
  snow.snowIn(5); eq(snow.packAt(0, mid, q.x, q.z), 0, 'after a lot of snow:');
});

// ---- open sections: rock borders instead of guard rails on natural ground (2026-11-22, user decision) ----
/** Sides of main-road samples of a track by what bounds them: [natural ground with a rock border, natural ground with a rail, built deck with a rock border]. */
function borderCount(td: TrackData): [number, number, number] {
  let rock = 0, rail = 0, deckRock = 0;
  for (const s of td.main.samples) {
    if (s.lake || s.roof > 0 || s.bridge || s.underpass || s.zeroG || s.gap || s.ramp !== 0) continue;
    for (const right of [false, true]) {
      if (right ? s.openR : s.openL) continue;
      const h = right ? s.hR : s.hL, flagged = !!(right ? s.rockR : s.rockL);
      if (s.surf > 0 && SURFACES[s.surf].id !== 'deck') { if (h > 0) rock++; else rail++; } else if (flagged) deckRock++;
    }
  }
  return [rock, rail, deckRock];
}
test('open sections: natural ground is bounded by rock, not by guard rails – the built deck keeps its rails', () => {
  for (const id of ['boonta', 'frost', 'jungle', 'oovo']) {
    const [rock, rail, deckRock] = borderCount(trackOf(id));
    ok(rock > 1000, `${id}: only ${rock} sample sides of natural ground found – the check would prove nothing`);
    eq(rail, 0, `${id}: sample sides of natural ground that still have a guard rail:`); eq(deckRock, 0, `${id}: sample sides of the built deck with a rock border:`);
  }
});
test('open sections: with the switch NO_ROCK_BORDERS the rails of before come back (the check above can fail)', () => {
  const G = globalThis as { NO_ROCK_BORDERS?: boolean }; G.NO_ROCK_BORDERS = true;
  try { const [, rail] = borderCount(buildTrack(TRACKS.find(t => t.id === 'boonta')!)); ok(rail > 1000, `only ${rail} railed sample sides without rock borders`); } finally { delete G.NO_ROCK_BORDERS; }
});
/** Flies an Aurora sideways into the border of a straight natural stretch of Boonta at 20 m/s, `up` metres above the hover height. Returns [wall events, field events]. */
function intoBorder(up: number): [number, number] {
  const td = trackOf('boonta'), S = td.main.samples;
  let idx = -1;
  for (let k = 60; k < S.length - 60 && idx < 0; k++) { let fine = true; for (let j = k - 10; j <= k + 10 && fine; j++) { const q = S[j]; fine = !!q.rockR && q.hR > 2.5 && q.hR < 6 && Math.abs(q.curv) < 0.004 && Math.abs(q.bank) < 0.07 && !q.gap && !q.lake && !q.roof && !q.ramp; } if (fine) idx = k; }
  ok(idx > 0, 'no straight stretch with a low rock border found on boonta');
  const s = S[idx], p = racer(byId('aurora'), td, idx, s.wallR - 1, s.y + HOVER + up);
  p.invuln = 0; p.vel.set(s.rx * 20, 0, s.rz * 20);
  for (let f = 0; f < 6; f++) { p.pos.y = s.y + HOVER + up; stepPod(p, td, 1 / 60, f / 60, 1, false); }
  return [p.events.filter(e => e.type === 'wall').length, p.events.filter(e => e.type === 'field').length];
}
test('open sections: a rock border is solid – a pod that flies above its top is only pushed back', () => {
  const [wallLow, fieldLow] = intoBorder(0), [wallHigh, fieldHigh] = intoBorder(9);
  ok(wallLow >= 1 && fieldLow === 0, `at hover height: ${wallLow} wall hits, ${fieldLow} field contacts – expected a wall hit`);
  ok(wallHigh === 0 && fieldHigh >= 1, `9 m higher, above the rock: ${wallHigh} wall hits, ${fieldHigh} field contacts – expected a soft contact`);
});

// ---- rock rows along natural roads (2026-11-23): what the player sees where the physics has its solid line ----
/** Front rocks of the rows of a track (the closed line; the smaller rocks behind it are left out). */
const rowRocks = (id: string) => borderRocks(trackOf(id)).filter(r => !r.back);
/** How deep the disc of rock `r` stands inside the collision line of its own path, metres (≤ 0: not at all). Checked in the frame
 *  of every sample the disc reaches – a row laid out along the border line can still cut the corner of a tight bend. */
function rockIntrusion(td: TrackData, r: BorderRock): number {
  const S = td.paths[r.path].samples, n = S.length, closed = td.paths[r.path].closed, i0 = Math.round(r.at), W = Math.ceil(r.r / DS) + 3; let worst = -1e9;
  for (let k = -W; k <= W; k++) {
    const j = closed ? ((i0 + k) % n + n) % n : i0 + k; if (j < 0 || j >= n) continue;
    const q = S[j], along = (r.x - q.x) * q.tx + (r.z - q.z) * q.tz; if (Math.abs(along) >= r.r || (r.side > 0 ? q.openR : q.openL)) continue; // (a fork mouth has no line)
    const lat = r.side * ((r.x - q.x) * q.rx + (r.z - q.z) * q.rz), wall = r.side > 0 ? q.wallR : q.wallL;
    worst = Math.max(worst, wall - (lat - Math.sqrt(r.r * r.r - along * along)));
  }
  return worst;
}
test('rock rows: no rock stands in the road – not even on the inside of a tight bend', () => {
  for (const id of ['boonta', 'frost', 'jungle', 'mosespa', 'aquilaris', 'oovo']) {
    const td = trackOf(id), rocks = borderRocks(td); let bad = 0, worst = 0, where = '';
    ok(rocks.length > 300, `${id}: only ${rocks.length} rocks – the check would prove nothing`);
    for (const r of rocks) { const d = rockIntrusion(td, r); if (d > ROCK_PROTRUDE + 0.05) { bad++; if (d > worst) { worst = d; where = `sample ${Math.round(r.at)}, side ${r.side}`; } } }
    eq(bad, 0, `${id}: rocks that reach into the road (worst ${worst.toFixed(1)} m at ${where}):`);
  }
});
test('rock rows: the row is closed – every stretch of a rock border has a rock in front of it', () => {
  for (const id of ['boonta', 'frost', 'jungle', 'oovo']) {
    const td = trackOf(id), S = td.main.samples, rocks = rowRocks(id).filter(r => r.path === 0); let all = 0, open = 0, first = -1;
    const byIdx = new Map<number, BorderRock[]>(); for (const r of rocks) { const k = Math.floor(r.at / 8); let a = byIdx.get(k); if (!a) { a = []; byIdx.set(k, a); } a.push(r); }
    for (let i = 0; i < S.length; i++) for (const side of [-1, 1] as const) {
      const q = S[i]; if (!(side > 0 ? q.rockR : q.rockL)) continue; all++;
      const w = side > 0 ? q.wallR : q.wallL, bx = q.x + q.rx * side * w, bz = q.z + q.rz * side * w; let hit = false;
      for (let k = Math.floor(i / 8) - 2; k <= Math.floor(i / 8) + 2 && !hit; k++) for (const r of byIdx.get(k) ?? []) {
        if (r.side !== side) continue;
        const dx = bx - r.x, dz = bz - r.z; if (Math.abs(dx * -r.oz + dz * r.ox) <= r.r * 0.8 && Math.hypot(dx, dz) <= r.r * 1.7) { hit = true; break; }
      }
      if (!hit) { open++; if (first < 0) first = i; }
    }
    ok(all > 1000, `${id}: only ${all} border samples`);
    ok(open <= all * 0.01, `${id}: ${open} of ${all} border samples have no rock in front of them (first: sample ${first})`);
  }
});
test('rock rows: a rock is about as tall as the border the physics knows, and neighbours overlap', () => {
  const td = trackOf('boonta'), S = td.main.samples, rocks = rowRocks('boonta').filter(r => r.path === 0); let gaps = 0, pairs = 0;
  for (let k = 0; k < rocks.length; k++) {
    const r = rocks[k], q = S[Math.min(S.length - 1, Math.round(r.at))], h = r.side > 0 ? q.hR : q.hL;
    ok(r.top >= Math.max(1, h * 0.7) - 0.6 && r.top <= h * 1.25 + 0.6, `rock at sample ${Math.round(r.at)}: top ${r.top.toFixed(1)} m beside a border of ${h.toFixed(1)} m`);
    const nx = rocks[k + 1]; if (!nx || nx.run !== r.run) continue; pairs++;
    if (Math.hypot(nx.x - r.x, nx.z - r.z) > (r.r + nx.r) * 0.98) gaps++;
  }
  ok(pairs > 500, `only ${pairs} neighbour pairs`);
  ok(gaps <= pairs * 0.01, `${gaps} of ${pairs} neighbours in a row do not touch`);
});

// ---- no fold (2026-11-23): a road wider than its bend allows lies over itself on the inside of the bend ----
test('layout: the road never folds over itself – on every track the half width stays below 0.9 × the curve radius', () => {
  const bad: string[] = [];
  for (const def of TRACKS) {
    const S = trackOf(def.id).main.samples; let worst = 0, at = 0;
    for (let i = 0; i < S.length; i++) { const k = Math.abs(S[i].curv) * S[i].hw; if (k > worst) { worst = k; at = i; } }
    if (worst > 0.9) bad.push(`${def.id} ${worst.toFixed(2)} at sample ${at} (half width ${S[at].hw.toFixed(0)} m, radius ${(1 / Math.abs(S[at].curv)).toFixed(0)} m)`);
  }
  eq(bad.length, 0, `tracks with half width / radius above 0.9: ${bad.join(' · ')} –`);
});

// ---- terrain: where the drawn ground is rock (2026-11-23) ----
// The terrain material blends rock in where the ground is steep. It read the vertex normal alone – a central difference, flat at the
// foot and at the rim of a low cliff – so steep faces ran out into sand at such corners: a row of rock teeth along every low cliff
// (seen on Boonta). Now every vertex carries the slope of the steepest face that meets in it (attribute aSplat, w).
test('terrain: every face of the terrain mesh is at least as rocky in all three corners as it is steep (no sand teeth on cliffs)', () => {
  const td = trackOf('boonta'), theme = THEMES[td.def.theme], leaf = terrainLeafMaker(makeTerrainField(td, theme, 7), theme);
  const S = td.main.samples; let faces = 0, steep = 0; const bad: string[] = [];
  for (let k = 0; k < S.length; k += 240) {
    const s = S[k], x0 = Math.floor((s.x + s.rx * 90) / 112) * 112, z0 = Math.floor((s.z + s.rz * 90) / 112) * 112; // a leaf of the finest kind at "Hoch", beside the road
    const g = leaf(x0, z0, 112), P = g.attributes.position, W = g.attributes.aSplat, I = g.index!;
    for (let t = 0; t < 16 * 16 * 6; t += 3) { // (the skirt triangles follow after the 16 × 16 cells)
      const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
      const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a), vx = P.getX(c) - P.getX(a), vy = P.getY(c) - P.getY(a), vz = P.getZ(c) - P.getZ(a);
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, slope = 1 - Math.abs(ny) / Math.hypot(nx, ny, nz);
      const w = Math.min(W.getW(a), W.getW(b), W.getW(c));
      faces++; if (slope > 0.35) steep++;
      if (w < slope - 1e-3 && bad.length < 4) bad.push(`face at ${P.getX(a).toFixed(0)}, ${P.getZ(a).toFixed(0)}: slope ${slope.toFixed(2)}, rock weight of one corner ${w.toFixed(2)}`);
    }
  }
  ok(steep > 40, `only ${steep} steep faces among ${faces} – the check saw no cliff`);
  eq(bad.length, 0, `faces steeper than their rock weight: ${bad.join(' · ')} –`);
});

// ---- open sections: the width breathes (2026-11-23) ----
// A rock border that follows the road at a constant distance is still a fence. Where both sides are rock borders the road opens into
// bays (`Sample.bay` = extra half width) and closes again.
test('open sections: the road opens into bays – a good part of the length between two rock borders is wider than designed', () => {
  let both = 0, wide = 0, tracksWithBay = 0; const lines: string[] = [];
  for (const def of TRACKS) {
    const S = trackOf(def.id).main.samples; let b = 0, w = 0, mx = 0;
    for (const q of S) { if (q.rockL && q.rockR) b++; if ((q.bay ?? 0) > 2) w++; mx = Math.max(mx, q.bay ?? 0); }
    both += b; wide += w; if (mx >= 5) tracksWithBay++;
    lines.push(`${def.id} ${w}/${b} max ${mx.toFixed(1)}`);
  }
  // (measured on 2026-11-23: 47 % of that length, a bay of 9 to 18 m on all 13 tracks)
  ok(wide >= 0.3 * both, `only ${wide} of ${both} samples between two rock borders are more than 2 m wider per side (${lines.join(' · ')})`);
  ok(tracksWithBay >= 11, `only ${tracksWithBay} of ${TRACKS.length} tracks have a bay of 5 m or more (${lines.join(' · ')})`);
});
test('open sections: a bay keeps its distance – from decks, basins, tunnels, forks and walls, from tight and banked bends and from every other piece of road', () => {
  const bad: string[] = [], note = (m: string) => { if (bad.length < 5) bad.push(m); };
  for (const def of TRACKS) {
    const td = trackOf(def.id), S = td.main.samples, n = S.length, closed = def.type === 'circuit';
    const at = (i: number) => closed ? S[((i % n) + n) % n] : i < 0 || i >= n ? undefined : S[i];
    for (let i = 0; i < n; i++) {
      const q = S[i], b = q.bay ?? 0; if (b <= 0) continue;
      // nothing but rock borders on both sides within 8 samples (the rock row eases down to a kerb over these)
      for (let k = -8; k <= 8; k++) { const o = at(i + k); if (!o || !(o.rockL && o.rockR)) { note(`${def.id} ${i}: bay of ${b.toFixed(1)} m ${Math.abs(k)} samples from the end of the rock borders`); break; } }
      // the border turns gently: at most 0.3 m per sample (15 %)
      const nx = at(i + 1); if (nx && Math.abs((nx.bay ?? 0) - b) > 0.31) note(`${def.id} ${i}: bay changes by ${Math.abs((nx.bay ?? 0) - b).toFixed(2)} m per sample`);
      // no bay in a tight bend
      if (b > 0.5 && Math.abs(q.curv) * q.hw > 0.62) note(`${def.id} ${i}: half width ${q.hw.toFixed(0)} m is ${(Math.abs(q.curv) * q.hw).toFixed(2)} × the bend radius`);
      // a banked bend is a tilted plane: the bay may carry the border at most 1.5 m further up or down
      if (b * Math.abs(q.bank) > 1.52) note(`${def.id} ${i}: a bay of ${b.toFixed(1)} m on a bank of ${q.bank.toFixed(3)} moves the border by ${(b * Math.abs(q.bank)).toFixed(1)} m in height`);
    }
    // 20 m between the border of a bay and any other piece of road: a branch, or the main road where it runs in another direction
    // or lies more than 5 half widths + 90 m further along (`baySameStretch`)
    for (let i = 0; i < n; i += 4) {
      const q = S[i]; if ((q.bay ?? 0) <= 0.5) continue;
      const same = baySameStretch(q.hw - q.bay!);
      for (const pa of td.paths) for (let j = 0; j < pa.samples.length; j += 2) {
        const o = pa.samples[j];
        if (pa === td.main) { const d = Math.abs(i - j); if ((closed ? Math.min(d, n - d) : d) < same && q.tx * o.tx + q.tz * o.tz > 0.5) continue; }
        const gap = Math.hypot(q.x - o.x, q.z - o.z) - q.hw - o.hw;
        if (gap < 20) { note(`${def.id} ${i}: ${gap.toFixed(0)} m to path ${pa.id} sample ${j}`); break; }
      }
    }
  }
  eq(bad.length, 0, `${bad.join(' · ')} –`);
});

// A banked bend is a tilted plane: a bay carries its border further up or down, and where the bank sets in the edge twists. Without
// the limit `BAY_TILT` the 13.75 m mesh stood 0.5 m above the road edge in a bay of Boonta (samples 4384 – 4386).
for (const id of ['boonta', 'frost', 'magma', 'oovo']) test(`open sections: the terrain stays below the road in every bay of ${id} (terrain mesh of 7 m and of 13.75 m)`, () => {
  const td = trackOf(id), S = td.main.samples;
  for (const cell of [7, 13.75]) {
    const mesh = terrainMeshOf(id, cell); let worst = 0, where = '', n = 0;
    for (let i = 0; i < S.length; i += 2) {
      const s = S[i], b = s.bay ?? 0; if (b <= 0.5) continue; n++;
      for (const side of [-1, 1]) for (let d = 0.5; d <= b + 2; d += 1.5) {
        const lat = side * (s.hw - d), over = mesh(s.x + s.rx * lat, s.z + s.rz * lat) - (s.y + s.ramp - lat * s.bank);
        if (over > worst) { worst = over; where = `sample ${i} lat ${lat.toFixed(0)}`; }
      }
    }
    ok(n > 100, `${id}: only ${n} samples with a bay`);
    ok(worst < 0.3, `${cell} m cells: terrain ${worst.toFixed(2)} m above the road at ${where}`);
  }
});

// ---- sun shadows (2026-11-23, user: „größere Schatten-Sichtweite – auf Ultra schiebt sich eine Schattenwand vor dem Pod her") ----
// The far cascade's depth range ended in mid-air above the ground: it shaded nothing, every shadow stopped at the split 104 m ahead.
// These checks project points of the ground through the shadow cameras the game sets up: what the player sees must lie inside.
const SUNS: [string, number][] = [['dusk', 4.5], ['dawn', 7], ['moon', 34], ['day', 50], ['noon', 78]];
const sunVec = (elev: number, az: number) => { const e = elev * Math.PI / 180; return new GPU3.Vector3(Math.cos(e) * Math.sin(az), Math.sin(e), Math.cos(e) * Math.cos(az)); };
/** Is the point inside the box of this shadow (light with `.shadow` and `.target`)? Returns '' or what is wrong. */
function inShadowBox(light: { shadow: GPU3.LightShadow; matrixWorld: GPU3.Matrix4 }, pt: GPU3.Vector3): string {
  const sh = light.shadow, c = sh.camera as GPU3.OrthographicCamera;
  sh.updateMatrices(light as unknown as GPU3.Light);
  const v = pt.clone().applyMatrix4(c.matrixWorldInverse), half = (c.right - c.left) / 2, depth = -v.z;
  if (Math.abs(v.x) > half || Math.abs(v.y) > half) return `beside the map (${v.x.toFixed(0)}, ${v.y.toFixed(0)} of ±${half.toFixed(0)})`;
  if (depth < c.near || depth > c.far) return `depth ${depth.toFixed(0)} outside ${c.near} … ${c.far.toFixed(0)}`;
  return '';
}
test('shadow: cascades – every piece of ground the player sees up to 690 m lies inside its cascade, under any sun, at any field of view', () => {
  const bad: string[] = []; let n = 0;
  for (const fov of [70, 94]) {
    const scene = new GPU3.Scene(), sun = new GPU3.DirectionalLight(0xffffff, 1); scene.add(sun, sun.target);
    const cam = new GPU3.PerspectiveCamera(fov, 16 / 9, 0.5, 6000); cam.position.set(40, 12, -30); cam.lookAt(40, 9.5, 70); cam.updateMatrixWorld(true);
    const rig = setupSunShadow(sun, 3, true), csm = rig.csm as unknown as { _init(o: unknown): void; updateBefore(): void; lights: { shadow: GPU3.LightShadow; matrixWorld: GPU3.Matrix4; position: GPU3.Vector3 }[] };
    ok(!!rig.csm, 'no cascades were set up');
    csm._init({ camera: cam, renderer: { coordinateSystem: GPU3.WebGPUCoordinateSystem, reversedDepthBuffer: false } }); // (what the first material does in the browser)
    const fr = new GPU3.Frustum().setFromProjectionMatrix(new GPU3.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const fwd = cam.getWorldDirection(new GPU3.Vector3()), flat = new GPU3.Vector3(fwd.x, 0, fwd.z).normalize(), side = new GPU3.Vector3(flat.z, 0, -flat.x);
    for (const [name, elev] of SUNS) for (let k = 0; k < 8; k++) {
      const d = sunVec(elev, k * Math.PI / 4 + 0.2), right = new GPU3.Vector3().crossVectors(new GPU3.Vector3(0, 1, 0), d).normalize(), up = new GPU3.Vector3().crossVectors(d, right).normalize();
      sun.target.position.copy(cam.position); sun.position.copy(cam.position).addScaledVector(d, SH_BACK); sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true);
      rig.update(sun.target.position, right, up); csm.updateBefore();
      for (const dist of [30, 100, 125, 200, 350, 520, 690]) for (const b of [-0.85, -0.4, 0, 0.4, 0.85]) for (const drop of [6, 40]) {
        const ang = b * Math.atan(Math.tan(fov * Math.PI / 360) * 16 / 9), g = cam.position.clone().addScaledVector(flat, dist * Math.cos(ang)).addScaledVector(side, dist * Math.sin(ang)); g.y = cam.position.y - drop;
        if (!fr.containsPoint(g)) continue;
        const depth = g.clone().sub(cam.position).dot(fwd), cascade = depth / CSM_FAR < CSM_SPLIT ? 0 : 1; if (depth > CSM_FAR) continue;
        n++; const why = inShadowBox(csm.lights[cascade], g);
        if (why) bad.push(`${name} az ${k * 45}° fov ${fov}: ground ${dist} m ahead (cascade ${cascade}) – ${why}`);
      }
    }
    rig.dispose();
  }
  ok(n > 1500, `only ${n} points were tested`);
  eq(bad.length, 0, `${bad.length} of ${n} · ${bad.slice(0, 3).join(' · ')} –`);
});
test('shadow: one map – the ground inside the map lies inside its depth range under any sun, in every shadow quality', () => {
  const bad: string[] = []; let n = 0;
  for (const q of [1, 2, 3]) {
    const scene = new GPU3.Scene(), sun = new GPU3.DirectionalLight(0xffffff, 1); scene.add(sun, sun.target);
    const rig = setupSunShadow(sun, q, false), ext = SH_BOX[q].ext; ok(!rig.csm && rig.texel > 0, `quality ${q}: no single map`);
    for (const [name, elev] of SUNS) for (let k = 0; k < 4; k++) {
      const d = sunVec(elev, k * Math.PI / 2 + 0.3), right = new GPU3.Vector3().crossVectors(new GPU3.Vector3(0, 1, 0), d).normalize(), up = new GPU3.Vector3().crossVectors(d, right).normalize();
      sun.target.position.set(500, 20, -300); sun.position.copy(sun.target.position).addScaledVector(d, SH_BACK); sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true);
      for (const u of [-0.75, 0, 0.75]) for (const v of [-0.75, -0.3, 0.3, 0.75]) for (const dy of [0, -25]) {
        // the point of the ground (dy below the target) that the map's texel (u, v) looks at
        const w = (dy - v * ext * up.y) / d.y, g = sun.target.position.clone().addScaledVector(right, u * ext).addScaledVector(up, v * ext).addScaledVector(d, w);
        n++; const why = inShadowBox(sun as unknown as { shadow: GPU3.LightShadow; matrixWorld: GPU3.Matrix4 }, g);
        if (why) bad.push(`quality ${q} ${name}: map (${u}, ${v}), ${dy} m – ${why}`);
      }
    }
    rig.dispose();
  }
  eq(bad.length, 0, `${bad.length} of ${n} · ${bad.slice(0, 3).join(' · ')} –`);
});
test('shadow: reach – one map shades at least 190 m ahead of the pod, the cascades 600 m; scenery throws shadows that far', () => {
  for (const q of [1, 2, 3]) { const b = SH_BOX[q]; ok(b.ext + b.ahead >= 190, `quality ${q}: the map ends ${b.ext + b.ahead} m ahead`); ok(b.ext - b.ahead >= 40, `quality ${q}: only ${b.ext - b.ahead} m behind the pod`); ok(b.ext * 2 / b.map <= 0.25, `quality ${q}: ${(b.ext * 2 / b.map).toFixed(2)} m per texel`); }
  ok(CSM_FAR >= 600 && CSM_FAR * CSM_SPLIT >= 100, `cascades: far ${CSM_FAR} m, near cascade ${(CSM_FAR * CSM_SPLIT).toFixed(0)} m`);
  const sun = new GPU3.DirectionalLight(0xffffff, 1), one = setupSunShadow(sun, 2, false), two = setupSunShadow(new GPU3.DirectionalLight(0xffffff, 1), 3, true);
  ok(one.reach >= SH_BOX[2].ext + SH_BOX[2].ahead, `scenery reach ${one.reach} m with one map`); ok(two.reach >= 400, `scenery reach ${two.reach} m with cascades`);
  one.dispose(); two.dispose();
});

// ---- lava (2026-11-23, user: "bei Fahrten über Lava extrem kurze Boost-Möglichkeit") ----
test('lava: over the lava lake a cold engine reaches its heat limit within about a second of boost – every pod', () => {
  const lake = SURFACES[SURF.lavalake].heat, bad: string[] = [];
  for (const def of PODS) {
    const P = podParams(pod({ def, stats: effectiveStats(def.id, undefined) })), deck = 1 / P.heatRate, over = 1 / (P.heatRate * lake);
    if (!(over >= 0.45 && over <= 1.1)) bad.push(`${def.id}: ${over.toFixed(2)} s over the lake (deck ${deck.toFixed(1)} s)`);
    if (!(over < deck / 4)) bad.push(`${def.id}: the lake should cut the boost to under a quarter (${over.toFixed(2)} s against ${deck.toFixed(1)} s)`);
  }
  eq(bad.length, 0, `${bad.slice(0, 4).join(' · ')} –`);
});

/** Boost held from a cold engine on a treadmill at one sample: [seconds to the heat limit, seconds until the engines cut out]. */
function boostWindow(def: PodDef, trackId: string, idx: number): [number, number] {
  const td = trackOf(trackId), s = td.main.samples[idx], p = racer(def, td, idx, 0, s.y + HOVER);
  p.invuln = 0; p.heat = 0; p.input.throttle = 1; p.input.boost = true;
  let clean = -1, cut = -1;
  for (let f = 0; f < 60 * 14 && cut < 0; f++) {
    p.pos.set(s.x, s.y + HOVER, s.z); p.vel.set(s.tx * 120, 0, s.tz * 120); p.yaw = Math.atan2(s.tx, s.tz); p.idx = idx; p.lat = 0; p.hpL = p.hpR = 100;
    stepPod(p, td, 1 / 60, f / 60, 1, false);
    if (clean < 0 && p.heat >= 1) clean = (f + 1) / 60;
    if (p.overheat) cut = (f + 1) / 60;
  }
  return [clean, cut];
}
test('lava: held boost over the lava lake ends after about two seconds (clean second + overdrive), on the deck it lasts three times as long', () => {
  const magma = trackOf('magma').main.samples, lake = magma.findIndex((q, k) => k > 40 && q.surf === SURF.lavalake && magma[k + 40]?.surf === SURF.lavalake);
  const deck = magma.findIndex((q, k) => k > 40 && q.surf === 0 && !q.roof && !q.gap && !q.ramp);
  ok(lake > 0 && deck > 0, `magma has a lava lake and a stretch of plain deck (${lake}, ${deck})`);
  const bad: string[] = [];
  for (const id of ['aurora', 'brute', 'volt', 'manta']) {
    const [c1, t1] = boostWindow(byId(id), 'magma', lake), [c0, t0] = boostWindow(byId(id), 'magma', deck);
    if (!(c1 > 0 && c1 <= 1.15)) bad.push(`${id}: heat limit over the lake after ${c1.toFixed(2)} s`);
    if (!(t1 > 0 && t1 <= 2.3)) bad.push(`${id}: engines cut out over the lake after ${t1.toFixed(2)} s`);
    if (!(t0 >= t1 * 2.5)) bad.push(`${id}: deck ${t0.toFixed(2)} s (limit after ${c0.toFixed(2)} s) against lake ${t1.toFixed(2)} s`);
  }
  eq(bad.length, 0, `${bad.join(' · ')} –`);
});

// ---- landing (2026-11-23, user: "kein Fallschaden bei sanfter/normaler Landung") ----
/** An Aurora comes down on a straight, level stretch of the Boonta deck at `vy` m/s (100 m/s forward): hull points lost, 'land' events. */
function landing(vy: number): [number, number] {
  const td = trackOf('boonta'), S = td.main.samples; let idx = -1;
  for (let k = 80; k < S.length - 80 && idx < 0; k++) { let fine = true; for (let j = k - 6; j <= k + 70 && fine; j++) { const q = S[j]; fine = Math.abs(q.curv) < 0.003 && Math.abs(q.bank) < 0.04 && !q.gap && !q.lake && !q.roof && !q.ramp && q.surf === 0 && Math.abs(q.y - S[k].y) < 1.5; } if (fine) idx = k; }
  ok(idx > 0, 'no straight, level stretch of deck found on boonta');
  const s = S[idx], p = racer(byId('aurora'), td, idx, 0, s.y + HOVER + 9);
  p.invuln = 0; p.vel.set(s.tx * 100, 0, s.tz * 100);
  stepPod(p, td, 1 / 60, 0, 1, false); // (one step in the air: the pod learns the ground below it – crown, camber)
  p.pos.y = p.groundY + HOVER + 1.3; p.vel.y = -vy; p.events.length = 0;
  const hp0 = p.hpL + p.hpR;
  for (let f = 0; f < 40; f++) stepPod(p, td, 1 / 60, f / 60, 1, false);
  ok(p.grounded, `the pod did not come down (vy ${vy})`);
  return [hp0 - p.hpL - p.hpR, p.events.filter(e => e.type === 'land').length];
}
test('landing: a normal landing costs nothing – 30 m/s (a ramp jump) and 36 m/s (a drop of 18 m); a fall at 55 m/s does', () => {
  const [jump, jumpEv] = landing(30), [drop] = landing(36), [fall, fallEv] = landing(55);
  eq(jump, 0, 'hull points lost by landing at 30 m/s –'); eq(drop, 0, 'hull points lost by landing at 36 m/s –');
  ok(fall > 6 && fall < 40, `a fall at 55 m/s cost ${fall.toFixed(1)} hull points – expected a clear but survivable hit`);
  ok(jumpEv === 1 && fallEv === 1, `every landing still reports itself (dust, sound, shake): ${jumpEv} and ${fallEv} events`);
});

// ---- night × bad weather (2026-11-23, reported by the user: "extrem schlechte Sicht bei Nacht + Gewitter") ----
// A night storm was night × overcast: moonlight 0.30 instead of 1.15, a quarter less fill light, black fog. Bad weather at night may
// change the mood, not the amount of light.
test('night: bad weather keeps the light of a clear night – on every world, in every weather it has', () => {
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16 & 255) / 255 + 0.7152 * (n >> 8 & 255) / 255 + 0.0722 * (n & 255) / 255; };
  const bad: string[] = []; let n = 0;
  for (const id of Object.keys(THEMES)) {
    const clear = resolveEnvironment(THEMES[id], 'night', 'clear');
    if (clear.fx.tod !== 'night') continue; // (a world without a climate has no night)
    for (const wx of ['rain', 'storm', 'snow', 'dust', 'fog'] as WeatherKind[]) {
      const r = resolveEnvironment(THEMES[id], 'night', wx), t = r.theme; if (r.fx.weather !== wx) continue; // (this world has no such weather)
      n++;
      if (t.sunIntensity < clear.theme.sunIntensity * 0.75) bad.push(`${id} ${wx}: moonlight ${t.sunIntensity.toFixed(2)}, clear night ${clear.theme.sunIntensity.toFixed(2)}`);
      if (lum(t.hemiSky) < lum(clear.theme.hemiSky) * 0.95) bad.push(`${id} ${wx}: sky fill ${lum(t.hemiSky).toFixed(2)}, clear night ${lum(clear.theme.hemiSky).toFixed(2)}`);
      if (t.exposure < clear.theme.exposure) bad.push(`${id} ${wx}: exposure ${t.exposure.toFixed(2)} below the clear night's ${clear.theme.exposure.toFixed(2)}`);
      if (lum(t.fogColor) < 0.1) bad.push(`${id} ${wx}: fog is black (${lum(t.fogColor).toFixed(3)})`);
      if (t.fogDensity > THEMES[id].fogDensity * 1.8 + 1e-9) bad.push(`${id} ${wx}: fog ${(t.fogDensity / THEMES[id].fogDensity).toFixed(2)} × the world's own`);
      ok(r.fx.dark > 0.45, `${id} ${wx}: the sky must still count as dark (lights on), dark = ${r.fx.dark.toFixed(2)}`);
    }
  }
  ok(n >= 14, `only ${n} combinations of world and weather`);
  eq(bad.length, 0, `${bad.slice(0, 5).join(' · ')}${bad.length > 5 ? ` · … (${bad.length})` : ''} –`);
});

// ---- bridges: the terrain passes below the deck (2026-11-23, reported by the user after the first drive on a real GPU) ----
// On the Methan-Derby a canyon runs straight into a bridge. Bridge samples take no part in shaping the ground, so the ground on the first
// 40 m of the deck was judged from the last canyon sample alone – and "behind its 28 m wall" lay half of the bridge: a rock massif stood
// across the right half of the road, 18 m high, at both ends of both bridges. `tools/ci/poke.ts` skipped bridge samples until that day.
for (const id of TRACKS.filter(t => trackOf(t.id).main.samples.some(q => q.bridge)).map(t => t.id)) test(`bridges: the terrain stays below the deck of every bridge of ${id} (terrain mesh of 4.5, 7 and 13.75 m)`, () => {
  const td = trackOf(id), S = td.main.samples;
  for (const cell of [4.5, 7, 13.75]) {
    const mesh = terrainMeshOf(id, cell); let worst = 0, where = '', n = 0, bad = 0;
    for (let i = 0; i < S.length; i += 2) {
      const s = S[i]; if (!s.bridge || s.gap) continue; n++;
      for (let lat = -s.hw + 0.5; lat <= s.hw - 0.5; lat += 1.5) {
        const over = mesh(s.x + s.rx * lat, s.z + s.rz * lat) - (s.y + s.ramp - lat * s.bank);
        if (over > 0.3) bad++;
        if (over > worst) { worst = over; where = `sample ${i} lat ${lat.toFixed(0)}`; }
      }
    }
    ok(n > 20, `${id}: only ${n} bridge samples`);
    ok(worst < 0.3, `${cell} m cells: terrain ${worst.toFixed(1)} m above the bridge deck at ${where} (${bad} points)`);
  }
});

// A canyon wall must not end at its full height where a bridge begins: it comes down to a rock kerb first, as it does beside a fork mouth.
test('bridges: a canyon wall comes down before a bridge begins and rises again behind it – on every track', () => {
  const bad: string[] = [];
  for (const def of TRACKS) {
    const S = trackOf(def.id).main.samples, n = S.length, closed = def.type === 'circuit';
    for (let i = 0; i < n; i++) {
      if (S[i].bridge) continue;
      const nb = [i - 1, i + 1].some(k => closed ? S[((k % n) + n) % n].bridge : k >= 0 && k < n && S[k].bridge);
      if (nb && Math.max(S[i].hL, S[i].hR) > 2) bad.push(`${def.id} ${i}: wall ${Math.max(S[i].hL, S[i].hR).toFixed(0)} m high right beside a bridge`);
    }
  }
  eq(bad.length, 0, `${bad.slice(0, 6).join(' · ')} –`);
});

console.log(failed ? `\n${failed} unit check(s) FAILED, ${passed} passed.` : `All ${passed} unit checks passed.`);
process.exit(failed ? 1 : 0);
