// Headless unit checks for pure game logic (part of `npm run check`). No framework: tiny test / expect helpers.
// Env: ONLY=<substring> runs only the tests whose name contains it.
import * as THREE from 'three';
import { DIFFICULTIES, PILOTS, PODS, STAT_KEYS, THEMES, TRACKS, type PodDef, type StatKey } from '../../src/game/data';
import { makeTerrainField, terrainLeafMaker } from '../../src/game/terrain';
import { engineHeat, envLabel, METHANE, resolveEnvironment, weatherOptionsFor, type TimeOfDay, type WeatherKind } from '../../src/game/environment';
import { clipOutside } from '../../src/game/meshClip';
import { SnowField, SNOW_CLEAR_PIECE, SNOW_CLEAR_ROCK, SNOW_FLOOR, SNOW_LEAD, SNOW_MAX, SNOW_MIN, TRENCH_VMAX } from '../../src/game/snowField';
import { borderRocks, ROCK_PROTRUDE, type BorderRock } from '../../src/game/borderRocks';
import { LAVA_TEX, SURF, SURFACES, WORLD_GRIP, lensSpray, splashes, trackSplashes } from '../../src/game/surfaces';
import { podLayout } from '../../src/game/podLayouts';
import { cockpitGeo } from '../../src/game/podCockpits';
import { engineExtent, engineGeo } from '../../src/game/podParts';
import { END_PLATE, RING, RING_CHORD, plateBevel } from '../../src/game/podEngines';
import { podCollision, podEnvelope, COCKPIT_SWAY } from '../../src/game/podDesigns';
import { assembleHero, assembleRival, segFor, skinPoint, visibleIndices, type BreakShow } from '../../src/game/podAssembly';
import { pickRivals, rivalKit } from '../../src/game/roster';
import { engineKit, tuneTiers, NO_KIT } from '../../src/game/podKitParts';
import { ciRoster } from './roster';
import { ZG_AXIS, ZG_EXIT_FROM, ZG_REACH, aiInputs, applyDamage, bodyToWorld, collidePods, hullWorld, kill, manualReset, podParams, respawn, stepPod, tickRespawn, vaultOver, worldToBody, FX_NONE, HOVER, RESET_COOLDOWN, RESET_WAIT, VAULT_CLAMP, type PodState } from '../../src/game/physics';
import { ACTIONS, KEY_PRESETS, defaultPad, normalizeKeys, normalizePad, type KeyMap, type PadMap } from '../../src/game/keymap';
import { DAMAGE_RULES, damageModel, lostMessage, partLamps, partsFx, zoneFactor, type DamageZone } from '../../src/game/podDamage';
import { buildTrack, frameAt, tunnelCeiling, baySameStretch, zgRockAt, DS, TUNNEL_SHOULDER, type Path, type Sample, type TrackData } from '../../src/game/trackBuilder';
import { defaultProfile, effectiveStats, loadProfile, sanitizeCustom, sanitizeGfx, saveProfile, CAMERA_NAMES, ENV_MAP_SIZE, GFX_REV, KIT_SLOTS, MAX_LAPS, PRESETS, type GfxSettings } from '../../src/game/settings';
import { ALARM_FROM, boostAlarmLevel, boostAlarmVoice } from '../../src/game/audio';
import { PadRepeater, nextFocus, readPadNav, stepRange, type NavRect, type PadSnapshot } from '../../src/ui/padNav';
import { FLIGHT_BAND, FLIGHT_LOOK, FLIGHT_SPEED, buildIntroFlight, type FlightPose } from '../../src/game/introFlight';
import { TrackLayer, TRACK_FADE_IN, TRACK_SEG, trackLife } from '../../src/game/groundTracks';
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
// 2026-11-25, user: "Tuning-Teile auch lackierbar machen". Ex works the add-on parts are bare metal (steel, dark) – only the canards,
// the armour plates and the fins carried paint, always the second colour. Now one choice for all of them: Werk · Farbe 1 · Farbe 2 ·
// an own colour. Paint mode of a hull triangle = aLiv.z: 0 first colour, 3 second colour, 4 the own colour.
const kitTris = (k: ReturnType<typeof engineKit>, key?: string) => { let n = 0; for (const [m, g] of k.parts) if (!key || m === key) n += triCount(g); return n; };
function paintedTris(k: ReturnType<typeof engineKit>, mode: number) { const g = k.parts.get('hull'); if (!g) return 0; const liv = g.attributes.aLiv, idx = g.index!; let n = 0; for (let i = 0; i < idx.count; i += 3) if (Math.round(liv.getZ(idx.getX(i))) === mode) n++; return n; }
test('kit paint: with the paint option the shell of every tuning part and Style-Teil takes the chosen colour – same parts, nothing in another colour', () => {
  const ALL = { ...NO_KIT, fins: 3, intake: 3, nozzle: 1, tune: Object.fromEntries(STAT_KEYS.map(k => [k, 2])) as Record<StatKey, number> };
  for (const p of PODS) {
    const s = podLayout(p).engines[0].spec, werk = engineKit(s, 28, ALL);
    for (const [paint, mode] of [[1, 0], [2, 3], [3, 4]] as const) {
      const k = engineKit(s, 28, { ...ALL, paint });
      eq(kitTris(k), kitTris(werk), `${p.id}, paint ${paint}: triangles of the kit (painting must not add or drop a part):`);
      eq(kitTris(k, 'hull') - paintedTris(k, mode), 0, `${p.id}, paint ${paint}: painted triangles in another colour:`);
      ok(paintedTris(k, mode) >= kitTris(werk, 'hull') * 1.5, `${p.id}, paint ${paint}: ${paintedTris(k, mode)} painted triangles, ${kitTris(werk, 'hull')} ex works – the shells should take paint`);
      ok(kitTris(k, 'steel') < kitTris(werk, 'steel'), `${p.id}, paint ${paint}: as much bare steel as ex works`);
    }
    // every tuning value by itself (the air brake has no part of its own: it enlarges the engine's flaps)
    for (const st of STAT_KEYS) if (st !== 'airbrake') ok(paintedTris(engineKit(s, 28, { ...NO_KIT, paint: 3, tune: { ...ZERO, [st]: 2 } }), 4) > 0, `${p.id}: the ${st} part takes no paint`);
    for (const slot of ['fins', 'nozzle'] as const) ok(paintedTris(engineKit(s, 28, { ...NO_KIT, paint: 3, [slot]: 1 }), 4) > 0, `${p.id}: Style-Teil ${slot} takes no paint`);
  }
  eq(kitTris(engineKit(podLayout(PODS[0]).engines[0].spec, 28, { ...NO_KIT, paint: 3 })), 0, 'paint without any part adds something:');
});
test('kit paint: choice and colour survive saving – 0 … 3 and a hex colour; anything else falls back', () => {
  const base = defaultProfile().custom[PODS[0].id];
  const a = sanitizeCustom({ kit: { fins: 1, intake: 0, nozzle: 0, canopy: 0, paint: 3 }, partColor: '#12ab34' }, base);
  eq([a.kit?.paint, a.partColor], [3, '#12ab34'], 'own colour:');
  eq(sanitizeCustom({ kit: { fins: 0, intake: 0, nozzle: 0, canopy: 0, paint: 9 } }, base).kit?.paint, 3, 'paint 9 is clamped:');
  eq(sanitizeCustom({ kit: { fins: 2, intake: 0, nozzle: 0, canopy: 0 } as never }, base).kit?.paint, 0, 'a save without the choice:');
  eq(sanitizeCustom({ partColor: 'red' as never }, base).partColor, undefined, 'a colour that is no hex colour:');
  ok(KIT_SLOTS.some(sl => sl.key === 'paint' && sl.choices.length === 4), 'the hangar lists no paint choice for the parts');
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

// ------------------------------------------------------------------ pod against pod: who pays (2026-11-25)
// Reported by the user: "Gegner nehmen keinen Schaden wenn ich sie ramme, nur ich." Both pods got the same, spread over both engines,
// and nothing showed it on a Gegner. Now: the pod that is rammed pays 1.5 ×, the one that rams 0.5 × (who rams = who moves across
// the road towards the other, or closes in from behind); the engine on the hit side pays; the player's event names the other pod.
/** two pods on a straight piece of Boonta: `a` left of the centre, `b` right of it, touching; both at 120 m/s along the road.
 *  `va` / `vb`: speed across the road towards the other pod · `ahead`: 0 = side by side … 1 = `b` straight ahead of `a` · `dv`: m/s `a` is faster */
function ramPair(td: TrackData, va: number, vb: number, o: { ahead?: number; dv?: number; playerIsB?: boolean } = {}) {
  const S = td.main.samples; let i0 = 0; for (let i = 40, run = 0; i < S.length - 40; i++) { run = Math.abs(S[i].curv) < 2e-4 && !S[i].gap && !S[i].ramp && !S[i].zeroG ? run + 1 : 0; if (run > 40) { i0 = i - 20; break; } }
  const q = S[i0], def = byId('aurora'), R = podCollision(def).halfW * 0.8 * 2, ah = (o.ahead ?? 0) * R * 0.9, gap = Math.sqrt(Math.max(0, (R * 0.9) ** 2 - ah * ah)) / 2;
  const mk = (lat: number, al: number, lv: number, fv: number, isPlayer: boolean) => { const p = racer(def, td, i0, lat, q.y + HOVER); p.isPlayer = isPlayer; p.pos.x += q.tx * al; p.pos.z += q.tz * al; p.vel.set(q.tx * fv + q.rx * lv, 0, q.tz * fv + q.rz * lv); p.invuln = 0; p.dead = 0; p.events.length = 0; return p; };
  const a = mk(-gap, 0, va, 120 + (o.dv ?? 0), !o.playerIsB), b = mk(gap, ah, -vb, 120, !!o.playerIsB);
  collidePods([a, b], 1, td);
  const loss = (p: PodState) => 200 - p.hpL - p.hpR;
  /** hull the engine on the side of the other pod lost / the engine on the far side lost */
  const sides = (p: PodState, other: PodState) => { const right = (other.pos.x - p.pos.x) * Math.cos(p.yaw) - (other.pos.z - p.pos.z) * Math.sin(p.yaw) > 0; return right ? [100 - p.hpR, 100 - p.hpL] : [100 - p.hpL, 100 - p.hpR]; };
  return { a, b, lossA: loss(a), lossB: loss(b), sidesA: sides(a, b), sidesB: sides(b, a) };
}
test('ram: the pod that is rammed pays three times what the rammer pays – from the side and from behind, player or Gegner', () => plain(() => {
  const td = trackOf('boonta');
  for (const playerIsB of [false, true]) {
    const who = playerIsB ? 'a Gegner rams the player' : 'the player rams a Gegner';
    const side = ramPair(td, 18, 0, { playerIsB });
    ok(side.lossB >= 12, `${who} from the side at 18 m/s: the rammed pod lost ${side.lossB.toFixed(1)} – expected a hit that counts (≥ 12)`);
    ok(side.lossA > 0 && Math.abs(side.lossB / side.lossA - 3) < 0.3, `${who} from the side: rammed ${side.lossB.toFixed(1)}, rammer ${side.lossA.toFixed(1)} – expected 3 : 1`);
    const rear = ramPair(td, 0, 0, { ahead: 1, dv: 22, playerIsB });
    ok(rear.lossA > 0 && Math.abs(rear.lossB / rear.lossA - 3) < 0.3, `${who} from behind at 22 m/s: rammed ${rear.lossB.toFixed(1)}, rammer ${rear.lossA.toFixed(1)} – expected 3 : 1`);
  }
  const both = ramPair(td, 9, 9);
  ok(both.lossA > 0 && Math.abs(both.lossA - both.lossB) < 0.01, `both steer into each other: ${both.lossA.toFixed(1)} / ${both.lossB.toFixed(1)} – expected the same for both`);
  const drift = ramPair(td, -3, 14); // `a` moves away, `b` comes after it
  ok(drift.lossA > drift.lossB * 2.5, `a pod that is caught while moving away is the rammed one: ${drift.lossA.toFixed(1)} / ${drift.lossB.toFixed(1)}`);
  const touch = ramPair(td, 4, 0);
  eq([touch.lossA, touch.lossB], [0, 0], 'a touch at 4 m/s costs nothing:');
}));
test('ram: the engine on the side of the hit pays – from behind both do; the player\'s event names the pod it hit and what that pod lost', () => plain(() => {
  const td = trackOf('boonta');
  const side = ramPair(td, 18, 0);
  ok(side.sidesB[0] > 0 && side.sidesB[1] === 0, `rammed from the side: near engine −${side.sidesB[0].toFixed(1)}, far engine −${side.sidesB[1].toFixed(1)} – only the near one should pay`);
  ok(side.sidesA[0] > 0 && side.sidesA[1] === 0, `the rammer: near engine −${side.sidesA[0].toFixed(1)}, far engine −${side.sidesA[1].toFixed(1)}`);
  const rear = ramPair(td, 0, 0, { ahead: 1, dv: 22 });
  ok(Math.abs(rear.sidesB[0] - rear.sidesB[1]) < 0.01 && rear.sidesB[0] > 0, `rammed from behind: engines −${rear.sidesB[0].toFixed(1)} / −${rear.sidesB[1].toFixed(1)} – both should pay the same`);
  const e = side.a.events.find(x => x.type === 'pod'); ok(!!e, 'the player got no event for the contact');
  ok(e!.pod === side.b, 'the event does not name the pod that was hit'); ok(Math.abs((e!.dealt ?? 0) - side.lossB) < 0.01, `the event says the other pod lost ${e!.dealt}, it lost ${side.lossB.toFixed(1)}`);
  eq(side.b.events.length, 0, 'events at the Gegner (one event per contact):');
}));

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

// ---- 3D snow on the powder fields (2026-11-23, user: "viel höherer Schnee, richtig 3D" – decision "dynamische Höhe 1–3 m") ----
// The powder field is a layer of drifts 1 to 3 m deep (snowField.ts). A pod cuts a trench through it in one pass; fresh snow holds a
// pod at 86 % of its top speed, in the trench of a pod ahead it runs at 99 %, and the rivals look for the trenches.
// (2026-11-22, the step before: 0.58 m of snow that packed a little harder with every pass.)
/** A fresh copy of the Frostspalt track with its snow field, and the middle of its powder run: [track, field, sample index]. */
function snowTrack(id = 'frost'): [TrackData, SnowField, number] {
  const td = buildTrack(TRACKS.find(t => t.id === id)!), snow = new SnowField(td); (td as unknown as { snow: SnowField }).snow = snow;
  ok(snow.runs.length > 0, `the snow field found no powder run on ${id}`);
  const r = snow.runs[0], mid = r.a + (r.n >> 1);
  eq(td.paths[r.path].samples[mid].surf, SURF.powder, 'surface in the middle of the run:');
  return [td, snow, mid];
}
/** A pod flying `secs` seconds along the powder run from sample `idx`, full throttle from `v0` m/s, `lat` metres beside the centre
 *  line (position and heading are put back onto that line after every step – the run bends), its speed is the physics' own. Returns it. */
function snowPass(td: TrackData, idx: number, secs: number, v0 = 60, lat = 0, def = 'aurora'): PodState {
  const s = td.main.samples[idx], p = racer(byId(def), td, idx, lat, s.y + HOVER);
  p.grounded = true; p.vel.set(s.tx * v0, 0, s.tz * v0); p.input.throttle = 1;
  for (let f = 0; f < secs * 60; f++) {
    stepPod(p, td, 1 / 60, f / 60, 1, false);
    const q = td.main.samples[p.idx], v = Math.hypot(p.vel.x, p.vel.z), al = (p.pos.x - q.x) * q.tx + (p.pos.z - q.z) * q.tz;
    p.pos.x = q.x + q.tx * al + q.rx * lat; p.pos.z = q.z + q.tz * al + q.rz * lat; p.yaw = Math.atan2(q.tx, q.tz); p.yawRate = 0; p.vel.x = q.tx * v; p.vel.z = q.tz * v;
  }
  return p;
}
test('snow: the drifts of a powder field are 1 to 3 m deep – shallow only at both ends, at a gate and around obstacle rocks', () => {
  for (const id of ['frost', 'howler']) {
    const [td, snow] = snowTrack(id);
    for (const r of snow.runs) {
      const S = r.samples; let lo = 9, hi = 0, sum = 0, cnt = 0, bad = 0, first = '';
      const pieces = r.path === 0 ? td.setPieces.filter(sp => sp.idx >= r.a - 30 && sp.idx < r.a + r.n + 30).map(sp => sp.idx) : [];
      const rocks = td.obstacles.filter(o => o.path === r.path && o.idx >= r.a - 10 && o.idx < r.a + r.n + 10);
      for (let i = r.a + SNOW_LEAD; i < r.a + r.n - SNOW_LEAD; i += 3) {
        if (pieces.some(g => Math.abs(g - i) < SNOW_CLEAR_PIECE)) continue;
        const q = S[i];
        for (let lat = -(q.hw - 2); lat <= q.hw - 2; lat += 2.5) {
          const x = q.x + q.rx * lat, z = q.z + q.rz * lat;
          if (rocks.some(o => Math.hypot(o.x - x, o.z - z) < o.r + SNOW_CLEAR_ROCK)) continue;
          const d = snow.depthAt(r.path, i, x, z); lo = Math.min(lo, d); hi = Math.max(hi, d); sum += d; cnt++;
          if (d < SNOW_MIN - 0.03 || d > SNOW_MAX + 0.03) { bad++; if (!first) first = `sample ${i}, ${lat.toFixed(1)} m beside the centre: ${d.toFixed(2)} m`; }
        }
      }
      eq(bad, 0, `${id}: points on the field outside 1 … 3 m (first: ${first}):`);
      ok(lo < 1.3 && hi > 2.7, `${id}: the drifts span ${lo.toFixed(2)} … ${hi.toFixed(2)} m – expected shallow places (< 1.3 m) and deep ones (> 2.7 m)`);
      ok(sum / cnt > 1.6 && sum / cnt < 2.4, `${id}: mean depth ${(sum / cnt).toFixed(2)} m, expected 1.6 … 2.4`);
      const e0 = S[r.a + 1], e1 = S[r.a + r.n - 2], d0 = snow.depthAt(r.path, r.a + 1, e0.x, e0.z), d1 = snow.depthAt(r.path, r.a + r.n - 2, e1.x, e1.z);
      ok(d0 < 0.5 && d1 < 0.5, `${id}: the field should start and end shallow – ${d0.toFixed(2)} m at its first, ${d1.toFixed(2)} m at its last sample`);
      for (const o of rocks) if (o.idx >= r.a + 4 && o.idx < r.a + r.n - 4) { const d = snow.depthAt(r.path, o.idx, o.x, o.z); ok(d < 0.7, `${id}: the obstacle rock at sample ${o.idx} stands in ${d.toFixed(2)} m of snow – it must stay visible (< 0.7 m)`); }
      for (const g of pieces) if (g >= r.a + 4 && g < r.a + r.n - 4) { const q = S[g], d = snow.depthAt(r.path, g, q.x, q.z); ok(d < 0.7, `${id}: at the set piece of sample ${g} lie ${d.toFixed(2)} m of snow – expected a cleared threshold (< 0.7 m)`); }
    }
  }
});
test('snow: one pod cuts a trench in a single pass – down to the floor under it, the walls beside it stand untouched', () => {
  const [td, snow, mid] = snowTrack(), S = td.main.samples, i = mid - 20, q = S[i];
  const H = (k: number, lat: number) => snow.heightAt(0, k, S[k].x + S[k].rx * lat, S[k].z + S[k].rz * lat), D = (k: number, lat: number) => snow.depthAt(0, k, S[k].x + S[k].rx * lat, S[k].z + S[k].rz * lat);
  ok(H(i, 0) >= SNOW_MIN - 0.03 && Math.abs(H(i, 0) - D(i, 0)) < 0.02, `before the pass ${H(i, 0).toFixed(2)} m of snow stand on the line (drift ${D(i, 0).toFixed(2)} m)`);
  const p = snowPass(td, mid - 40, 1.2), hw = podParams(p).width; // (60 m/s and faster for 1.2 s: from 40 samples before the middle to a few samples behind it)
  for (const lat of [0, -hw * 0.6, hw * 0.6]) ok(H(i, lat) <= SNOW_FLOOR + 0.08, `${H(i, lat).toFixed(2)} m of snow are left ${lat.toFixed(1)} m beside the pod's line after ONE pass – expected the floor of the trench (${SNOW_FLOOR} m)`);
  for (const lat of [-(hw + 6), hw + 6]) ok(H(i, lat) > D(i, lat) - 0.02, `the snow ${lat.toFixed(1)} m beside the line lost height (${H(i, lat).toFixed(2)} of ${D(i, lat).toFixed(2)} m) – the walls of the trench must stand`);
  ok(Math.abs(H(mid + 60, 0) - D(mid + 60, 0)) < 0.02, 'far ahead of the pod the snow should be untouched');
  ok(snow.packAt(0, i, q.x, q.z) > 0.9, `cut on the line: ${snow.packAt(0, i, q.x, q.z).toFixed(2)}, expected > 0.9`);
  void q;
});
test('snow: fresh powder holds a pod at 86 % of its top speed, in the trench of a pod ahead it runs at 99 % – its own trench does not help it', () => {
  eq(SURFACES[SURF.powder].vmax, 0.86, 'top speed factor of fresh powder:'); eq(TRENCH_VMAX, 0.99, 'top speed factor in a trench:');
  const steady = (ahead: boolean) => {
    const [td, , mid] = snowTrack();
    if (ahead) snowPass(td, mid - 215, 4.4, 118); // a pod ahead on the same line: its trench reaches well past the middle
    const p = snowPass(td, mid - 195, 3, 118);
    return [Math.hypot(p.vel.x, p.vel.z), p.snowPack ?? 0, podParams(p).vmax];
  };
  const [fresh, pkF, vmax] = steady(false), [trench, pkT] = steady(true);
  ok(pkF < 0.05, `a pod alone in fresh powder reads its own trench (cut ${pkF.toFixed(2)} under it) – it must plough fresh snow`);
  ok(pkT > 0.9, `behind a pod on the same line the snow should be cut (${pkT.toFixed(2)})`);
  ok(fresh / trench > 0.85 && fresh / trench < 0.9, `steady speed ${fresh.toFixed(1)} m/s in fresh powder, ${trench.toFixed(1)} m/s in the trench: ratio ${(fresh / trench).toFixed(3)}, expected 0.86 / 0.99 = 0.869 (0.85 … 0.90)`);
  ok(trench > vmax * 0.9 && trench < vmax * 0.995, `in the trench the Aurora flies ${trench.toFixed(1)} m/s of ${vmax.toFixed(1)} m/s – expected just below 99 %`);
});
test('snow: a rival steers into a trench that lies beside its line, and stays in it', () => {
  // (3.5 s over the first third of the field – further on the gate of the field decides the line)
  const fly = (trenchAt: number | null) => {
    const [td, snow] = snowTrack(), S = td.main.samples, r = snow.runs[0];
    if (trenchAt !== null) for (let i = r.a; i < r.a + r.n; i++) snow.stamp(0, i, S[i].x + S[i].rx * trenchAt, S[i].z + S[i].rz * trenchAt, 4.5, 1);
    const i0 = r.a + 40, s = S[i0], p = racer(byId('mavik'), td, i0, 0, s.y + HOVER);
    p.isPlayer = false; p.grounded = true; p.vel.set(s.tx * 100, 0, s.tz * 100);
    p.ai = { skill: 0.9, speedF: 1, lineOff: 0, takeShortcut: false, boostUntil: 0, repairMode: false, noiseT: 0, rubber: 1 };
    let sum = 0, cnt = 0, pk = 0;
    for (let f = 0; f < 3.5 * 60; f++) { const t = 20 + f / 60; aiInputs(p, td, [p], t, null); stepPod(p, td, 1 / 60, t, 1, false); if (f >= 2.5 * 60) { sum += p.lat; pk += p.snowPack ?? 0; cnt++; } }
    const gate = td.setPieces.find(sp => sp.idx > r.a && sp.idx < r.a + r.n);
    ok(p.idx > i0 + 100 && (!gate || p.idx < gate.idx - 50), `the rival should be on the open field after 3.5 s (sample ${p.idx}, field from ${r.a}, gate at ${gate?.idx})`);
    return [sum / cnt, pk / cnt];
  };
  const [free] = fly(null), side = free > 0 ? -1 : 1, L = free + side * 13; // a trench 13 m beside the line the rival flies on its own
  const [lat, pk] = fly(L);
  ok(Math.abs(lat - L) < 2.5, `with a trench at ${L.toFixed(1)} m the rival flies at ${lat.toFixed(1)} m (on its own: ${free.toFixed(1)} m) – expected in the trench`);
  ok(pk > 0.8, `the snow in front of the rival is cut ${pk.toFixed(2)} – expected > 0.8 (it flies in the trench)`);
});
test('snow: snowfall fills a trench again – and the snow stands as high as the drift was', () => {
  const [td, snow, mid] = snowTrack(), q = td.main.samples[mid];
  for (const r of snow.runs) r.data.fill(200);
  const before = snow.packAt(0, mid, q.x, q.z); snow.snowIn(0.25); const after = snow.packAt(0, mid, q.x, q.z);
  ok(Math.abs(before - 200 / 255) < 0.01 && Math.abs(after - (200 / 255 - 0.25)) < 0.02, `cut ${before.toFixed(2)} → ${after.toFixed(2)} after snowIn(0.25), expected ${(200 / 255 - 0.25).toFixed(2)}`);
  snow.snowIn(5); eq(snow.packAt(0, mid, q.x, q.z), 0, 'after a lot of snow:');
  ok(Math.abs(snow.heightAt(0, mid, q.x, q.z) - snow.depthAt(0, mid, q.x, q.z)) < 0.02, 'a filled trench should stand as high as the drift');
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

// ---- intro flight over the track (2026-11-23, user: „bevor das Rennen startet eine Intro-Fahrt über die Strecke, bis man ‚Rennen starten' auswählt") ----
const RACE_PACE = 118; // m/s – what the field averages in the simulation (tools/ci/sim.ts, "avg … m/s outside")
test('intro: over open road the camera flies 20–35 m above the centre line; under a roof it stays below the ceiling; in a zero-G tube it flies on the axis (every track)', () => {
  const bad: string[] = []; eq(FLIGHT_BAND.join(), '20,35', 'the band –');
  for (const t of TRACKS) {
    const td = trackOf(t.id), S = td.main.samples, N = S.length, fl = buildIntroFlight(td); let open = 0, lo = 1e9, hi = 0;
    const at = (i: number) => S[td.main.closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i))];
    for (let i = 0; i < N; i++) {
      const s = S[i], h = fl.heightAt(i);
      if (!(h > 0)) { bad.push(`${t.id} ${i}: height ${h}`); continue; }
      if (s.zeroG) { if (Math.abs(h - 7) > 2.5) bad.push(`${t.id} ${i}: ${h.toFixed(1)} m in the zero-G tube (axis at 7 m)`); continue; }
      if (s.roof > 0) { if (h > s.roof - 2 || h < 3) bad.push(`${t.id} ${i}: ${h.toFixed(1)} m under a roof of ${s.roof.toFixed(1)} m`); continue; }
      let free = true; for (let k = -90; k <= 90 && free; k += 5) { const q = at(i + k); if (q.roof > 0 || q.zeroG || q.underpass) free = false; }
      if (!free) continue;
      open++; lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (h < 20 - 0.01 || h > 35 + 0.01) bad.push(`${t.id} ${i}: ${h.toFixed(1)} m over open road`);
    }
    if (open < N * 0.25) bad.push(`${t.id}: only ${open} of ${N} samples count as open road`);
    else if (hi - lo < 8) bad.push(`${t.id}: the height hardly changes over open road (${lo.toFixed(1)} … ${hi.toFixed(1)} m)`);
  }
  eq(bad.length, 0, `${bad.length} · ${bad.slice(0, 5).join(' · ')} –`);
});
test('intro: under a bridge of the track itself the camera passes below the deck (crossings without a tunnel)', () => {
  const bad: string[] = []; let n = 0;
  for (const t of TRACKS) {
    const td = trackOf(t.id), fl = buildIntroFlight(td);
    for (const c of td.crossings) {
      if (c.tunnelUnder) continue; n++;
      for (let i = c.lowerFrom; i <= c.lowerTo; i++) { const h = fl.heightAt(i); if (h > c.clearance - 6) bad.push(`${t.id} ${i}: ${h.toFixed(1)} m, the deck hangs at ${c.clearance.toFixed(1)} m`); }
    }
  }
  ok(n >= 4, `only ${n} open crossings found`); eq(bad.length, 0, `${bad.length} · ${bad.slice(0, 4).join(' · ')} –`);
});
test('intro: what stands across the road – the camera flies over a gate (start portal, sponsor bridge) and under a tall rock arch', () => {
  const td = buildTrack(TRACKS[0]), S = td.main.samples; // (a fresh copy: the checks above share theirs)
  const free = (from: number) => { for (let i = from; i < S.length - 200; i += 10) { let okk = true; for (let k = -60; k <= 60 && okk; k += 4) { const q = S[i + k]; if (q.roof > 0 || q.zeroG || q.underpass || q.bridge || q.gap) okk = false; } if (okk) return i; } return -1; };
  const a = free(200), b = free(a + 400); ok(a > 0 && b > 0, `two open stretches (${a}, ${b})`);
  td.overheads = [{ idx: a, y0: S[a].y + 15.8, y1: S[a].y + 21.3, half: 1.7 }, { idx: b, y0: 0, y1: 0, half: 6, arch: { R: 30, sy: 1.4, inner: 5.5, yOff: -2.5, thick: 12 } }];
  const fl = buildIntroFlight(td);
  for (let k = -2; k <= 2; k++) ok(fl.heightAt(a + k) >= 21.3 + 3, `over the gate: ${fl.heightAt(a + k).toFixed(1)} m (its top is at 21.3 m)`);
  const under = -2.5 + 1.4 * (30 - 5.5); // the arch's underside over the centre line: 31.8 m, its top 43.8 m
  for (let k = -4; k <= 4; k++) ok(fl.heightAt(b + k) <= under - 3 && fl.heightAt(b + k) >= 5, `under the arch: ${fl.heightAt(b + k).toFixed(1)} m (underside at ${under.toFixed(1)} m)`);
  ok(fl.heightAt(b + 150) >= 20, `back in the band 300 m after the arch: ${fl.heightAt(b + 150).toFixed(1)} m`);
});
// (2026-11-25, user: "Intro-Flug ist viel zu schnell. Lieber in Podracer-Geschwindigkeit (ohne Boost)" – it was about three times race pace.)
test('intro: a calm flight – at the speed of a pod without boost, no hard turns, no steps in height, one pass takes 40 seconds to 4 minutes (every track)', () => {
  const bad: string[] = []; const P: FlightPose = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, roll: 0 }, Q = { ...P };
  { // what the pods reach on a straight without boost (factory tuning): the flight is no faster than the fastest and no slower than the slowest of them
    const tops = PODS.map(d => podParams(racer(d, trackOf('boonta'), 60, 0, 0)).vmax0), lo = Math.min(...tops), hi = Math.max(...tops);
    ok(FLIGHT_SPEED >= lo && FLIGHT_SPEED <= hi, `top flight speed ${FLIGHT_SPEED} m/s – the pods reach ${lo.toFixed(0)} … ${hi.toFixed(0)} m/s without boost`);
  }
  for (const t of TRACKS) {
    const td = trackOf(t.id), fl = buildIntroFlight(td), N = td.main.samples.length;
    for (let i = 0; i < N - 1; i++) { const d = Math.abs(fl.heightAt(i + 1) - fl.heightAt(i)); if (d > 0.36 * DS + 1e-6) { bad.push(`${t.id} ${i}: the height steps by ${d.toFixed(2)} m in ${DS} m`); break; } }
    let time = 0, dist = 0, maxTurn = 0, maxV = 0, minV = 1e9, maxClimb = 0; const dt = 1 / 60;
    fl.pose(0, P);
    while (dist < fl.length && time < 400) {
      const v = fl.speedAt(dist); maxV = Math.max(maxV, v); minV = Math.min(minV, v);
      dist += v * dt; time += dt; fl.pose(dist, Q);
      if (dist < fl.length) { // (a sprint cuts back to its start at the end of the pass)
        const a0 = Math.atan2(P.lx - P.x, P.lz - P.z), a1 = Math.atan2(Q.lx - Q.x, Q.lz - Q.z); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        maxTurn = Math.max(maxTurn, Math.abs(da) / dt); maxClimb = Math.max(maxClimb, Math.abs(Q.y - P.y) / dt);
      }
      P.x = Q.x; P.y = Q.y; P.z = Q.z; P.lx = Q.lx; P.ly = Q.ly; P.lz = Q.lz;
    }
    const avg = fl.length / time;
    if (process.env.DEBUG) console.log(`   ${t.id.padEnd(12)} pass ${time.toFixed(1)} s · avg ${avg.toFixed(0)} m/s (${(avg / RACE_PACE).toFixed(2)} ×) · speed ${minV.toFixed(0)}–${maxV.toFixed(0)} · turn ${maxTurn.toFixed(2)} rad/s · climb ${maxClimb.toFixed(0)} m/s`);
    if (time < 40 || time > 240) bad.push(`${t.id}: one pass takes ${time.toFixed(0)} s`);
    if (avg < 0.8 * RACE_PACE || avg > 1.3 * RACE_PACE) bad.push(`${t.id}: average ${avg.toFixed(0)} m/s = ${(avg / RACE_PACE).toFixed(1)} × race pace`);
    if (maxV > FLIGHT_SPEED + 0.01 || minV < 60) bad.push(`${t.id}: speed ${minV.toFixed(0)} … ${maxV.toFixed(0)} m/s`);
    if (maxTurn > 2.4) bad.push(`${t.id}: the view turns at ${maxTurn.toFixed(2)} rad/s`);
    if (maxClimb > 140) bad.push(`${t.id}: climbs or sinks at ${maxClimb.toFixed(0)} m/s`);
  }
  eq(bad.length, 0, `${bad.length} · ${bad.slice(0, 6).join(' · ')} –`);
});
test('intro: the pass starts just before the grid, looks ahead along the road, loops on a circuit and reaches the finish line of a sprint', () => {
  const P: FlightPose = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, roll: 0 }, Q = { ...P };
  for (const id of ['boonta', 'dunepass', 'oovo', 'executioner']) {
    const td = trackOf(id), S = td.main.samples, N = S.length, fl = buildIntroFlight(td);
    eq(fl.closed, td.main.closed, `${id}: closed –`);
    fl.pose(0, P); const i0 = fl.sampleAt(0), s0 = S[i0];
    const before = td.main.closed ? ((td.startIdx - i0) % N + N) % N : td.startIdx - i0;
    ok(before >= 15 && before <= 80, `${id}: the pass starts ${before} samples before the start line`);
    ok(Math.hypot(P.x - s0.x, P.z - s0.z) < 0.5 && Math.abs(P.y - (s0.y + fl.heightAt(i0))) < 0.5, `${id}: the camera is not over the centre line at the start`);
    for (const d of [0, fl.length * 0.21, fl.length * 0.5, fl.length * 0.83]) {
      fl.pose(d, P); const s = S[fl.sampleAt(d)], ahead = (P.lx - P.x) * s.tx + (P.lz - P.z) * s.tz, dist = Math.hypot(P.lx - P.x, P.ly - P.y, P.lz - P.z);
      ok(ahead > FLIGHT_LOOK * 0.3 && dist < FLIGHT_LOOK * 1.3 && dist > FLIGHT_LOOK * 0.5, `${id} at ${d.toFixed(0)} m: looks ${ahead.toFixed(0)} m ahead, target ${dist.toFixed(0)} m away`);
      ok(P.ly < P.y, `${id} at ${d.toFixed(0)} m: the view does not point down to the road`); ok(Math.abs(P.roll) <= 0.36, `${id}: banks ${P.roll.toFixed(2)} rad`);
    }
    if (td.main.closed) {
      ok(Math.abs(fl.length - N * DS) < DS, `${id}: one pass is ${fl.length} m, the lap ${N * DS} m`);
      fl.pose(137, P); fl.pose(fl.length + 137, Q); ok(Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z) < 1e-6, `${id}: the second pass is not the first`);
    } else {
      ok(fl.sampleAt(fl.length - 1) >= td.finishIdx, `${id}: the pass ends at sample ${fl.sampleAt(fl.length - 1)}, the finish line is at ${td.finishIdx}`);
      fl.pose(fl.length + 137, Q); fl.pose(137, P); ok(Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z) < 1e-6, `${id}: after the last metre the pass does not begin again`);
      fl.pose(fl.length - 2, P); ok(Number.isFinite(P.lx + P.ly + P.lz) && Math.hypot(P.lx - P.x, P.lz - P.z) > FLIGHT_LOOK * 0.5, `${id}: no look-at point at the end of the path`);
    }
  }
});

// ---- gamepad in the menus (2026-11-23, user: „Controller-Support auch im Menü") ----
const R = (x: number, y: number, w: number, h: number): NavRect => ({ x, y, w, h });
const NONE: PadSnapshot = { up: false, down: false, left: false, right: false, a: false, b: false, lb: false, rb: false, start: false };
const fakePad = (o: { btn?: number[]; axes?: number[]; mapping?: string }) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!o.btn?.includes(i), value: o.btn?.includes(i) ? 1 : 0 })), axes: o.axes ?? [0, 0, 0, 0], mapping: o.mapping ?? 'standard' });
test('padnav: a column of buttons – down and up step through it, the ends stay put, there is no way sideways', () => {
  const col = [R(100, 100, 200, 40), R(100, 150, 200, 40), R(100, 200, 200, 40)];
  eq(nextFocus(col, 0, 'down'), 1, 'down from the first –'); eq(nextFocus(col, 1, 'down'), 2, 'down from the second –'); eq(nextFocus(col, 2, 'down'), -1, 'down from the last –');
  eq(nextFocus(col, 2, 'up'), 1, 'up from the last –'); eq(nextFocus(col, 0, 'up'), -1, 'up from the first –');
  eq(nextFocus(col, 1, 'left'), -1, 'left –'); eq(nextFocus(col, 1, 'right'), -1, 'right –');
});
test('padnav: a grid – every direction goes to the neighbour, not diagonally', () => {
  const g = [R(0, 0, 90, 30), R(100, 0, 90, 30), R(200, 0, 90, 30), R(0, 40, 90, 30), R(100, 40, 90, 30), R(200, 40, 90, 30)];
  eq(nextFocus(g, 0, 'right'), 1, 'right from 0 –'); eq(nextFocus(g, 1, 'right'), 2, 'right from 1 –'); eq(nextFocus(g, 4, 'left'), 3, 'left from 4 –');
  eq(nextFocus(g, 1, 'down'), 4, 'down from 1 –'); eq(nextFocus(g, 5, 'up'), 2, 'up from 5 –'); eq(nextFocus(g, 2, 'right'), -1, 'right from the last column –');
});
test('padnav: across an empty middle – from a list on the left to the control at the same height on the right, not to the nearest corner', () => {
  // a list of five rows on the left, a tall empty preview in the middle, four controls on the right, a "back" button top right
  const list = [0, 1, 2, 3, 4].map(i => R(20, 100 + i * 60, 220, 50)), right = [R(900, 110, 300, 30), R(900, 230, 300, 30), R(900, 350, 300, 30), R(900, 500, 300, 60)], back = R(1100, 20, 120, 36);
  const all = [...list, ...right, back];
  eq(nextFocus(all, 0, 'right'), 5, 'right from row 1 –'); eq(nextFocus(all, 2, 'right'), 6, 'right from row 3 –'); eq(nextFocus(all, 4, 'right'), 7, 'right from row 5 –');
  eq(nextFocus(all, 8, 'left'), 4, 'left from the big button at the bottom –'); eq(nextFocus(all, 5, 'left'), 0, 'left from the first control –');
  eq(nextFocus(all, 9, 'down'), 5, 'down from "back" –'); eq(nextFocus(all, 5, 'up'), 9, 'up from the first control –');
});
test('padnav: a small button beside a wide one, rows of different widths – the nearest in the direction wins, a covered element is skipped', () => {
  const rows = [R(0, 0, 400, 30), R(0, 40, 120, 30), R(130, 40, 120, 30), R(260, 40, 140, 30), R(0, 80, 400, 30)];
  eq(nextFocus(rows, 0, 'down'), 1, 'down from the wide row lands on the first below –'); eq(nextFocus(rows, 3, 'down'), 4, 'down from the right cell –'); eq(nextFocus(rows, 4, 'up'), 1, 'up from the wide row –');
  eq(nextFocus(rows, 2, 'up'), 0, 'up from the middle cell –');
  const nested = [R(0, 0, 100, 100), R(10, 10, 30, 30), R(200, 0, 100, 100)];
  eq(nextFocus(nested, 0, 'right'), 2, 'an element inside the current one is not "to the right" –');
});
test('padnav: reading the pad – stick beyond 55 % counts, the stronger axis wins, it lets go below 35 %; the D-pad only in the standard layout', () => {
  ok(readPadNav(fakePad({ axes: [0.7, 0.1, 0, 0] })).right, 'stick right'); ok(!readPadNav(fakePad({ axes: [0.5, 0, 0, 0] })).right, 'stick at 50 % counts');
  const diag = readPadNav(fakePad({ axes: [0.7, -0.9, 0, 0] })); ok(diag.up && !diag.right, `diagonal: ${JSON.stringify(diag)}`);
  const held = readPadNav(fakePad({ axes: [0.45, 0, 0, 0] }), { ...NONE, right: true }); ok(held.right, 'held stick let go at 45 %');
  ok(!readPadNav(fakePad({ axes: [0.3, 0, 0, 0] }), { ...NONE, right: true }).right, 'held stick still counts at 30 %');
  const d = readPadNav(fakePad({ btn: [13, 0, 9] })); ok(d.down && d.a && d.start && !d.up && !d.b, `D-pad down + A + Start: ${JSON.stringify(d)}`);
  ok(!readPadNav(fakePad({ btn: [13], mapping: '' })).down, 'button 13 of an unknown layout counts as D-pad');
  const sh = readPadNav(fakePad({ btn: [4, 5, 1] })); ok(sh.lb && sh.rb && sh.b, `LB RB B: ${JSON.stringify(sh)}`);
});
test('padnav: one press = one step; a held direction repeats after a pause; nothing counts until the pad has been let go once', () => {
  const rep = new PadRepeater();
  // the button that opened this menu is still held: it must not act
  eq(rep.step({ ...NONE, start: true }, 0).length, 0, 'Start still held from before –'); eq(rep.step({ ...NONE, start: true }, 100).length, 0, 'Start still held –');
  eq(rep.step(NONE, 200).length, 0, 'released –');
  eq(rep.step({ ...NONE, start: true }, 300).join(), 'start', 'a fresh press of Start –'); eq(rep.step({ ...NONE, start: true }, 400).length, 0, 'Start held does not repeat –');
  rep.step(NONE, 500);
  eq(rep.step({ ...NONE, down: true }, 1000).join(), 'down', 'first step –');
  eq(rep.step({ ...NONE, down: true }, 1200).length, 0, 'no repeat after 200 ms –');
  let n = 0; for (let t = 1216; t <= 2000; t += 16) n += rep.step({ ...NONE, down: true }, t).length;
  ok(n >= 3 && n <= 7, `${n} repeats in the first second of holding`);
  rep.step(NONE, 2100); eq(rep.step({ ...NONE, a: true }, 2200).join(), 'a', 'A –'); eq(rep.step({ ...NONE, a: true, down: true }, 2300).join(), 'down', 'a direction while A is held –');
  rep.reset(); eq(rep.step({ ...NONE, a: true }, 2400).length, 0, 'after reset() a held button does not count –');
});
test('padnav: slider steps – one step per press, clamped to the range, no rounding dust', () => {
  eq(stepRange(3, 1, 9, 1, 1), 4, '3 + 1 –'); eq(stepRange(9, 1, 9, 1, 1), 9, 'at the top –'); eq(stepRange(1, 1, 9, 1, -1), 1, 'at the bottom –');
  eq(stepRange(0.3, 0, 1, 0.1, 1), 0.4, '0.3 + 0.1 –'); eq(stepRange(0.7, 0.5, 1.5, 0.05, -1), 0.65, '0.7 − 0.05 –'); eq(stepRange(100, 0, 100, 5, -1), 95, '100 − 5 –');
});

// ---- reset key (2026-11-23, user: „Reset-Taste (Pod neu auf die Strecke zurücksetzen)") ----
/** A pod that has been racing along the main road up to `idx` (so its last safe place is known), then thrown `off` metres beside the road, facing backwards. */
function strayPod(trackId: string, idx: number, off: number) {
  const td = trackOf(trackId), S = td.main.samples, s = S[idx], p = racer(PODS[0], td, idx, 0, s.y + HOVER);
  p.invuln = 0; p.input.throttle = 1;
  for (let f = 0; f < 40; f++) { p.pos.x = s.x; p.pos.z = s.z; p.vel.set(s.tx * 60, 0, s.tz * 60); p.yaw = Math.atan2(s.tx, s.tz); stepPod(p, td, 1 / 60, f / 60, 1, false); }
  const safe = p.lastSafeIdx;
  p.pos.x += s.rx * off; p.pos.z += s.rz * off; p.yaw += Math.PI; p.vel.set(-s.tx * 12, 0, -s.tz * 12);
  return { td, p, safe };
}
const plainIdx = (trackId: string) => { const S = trackOf(trackId).main.samples; return S.findIndex((q, k) => k > 60 && !q.gap && !q.ramp && !q.roof && !q.zeroG && !S[k + 30]?.gap && !S[k + 30]?.ramp); };
test('reset: the key takes the pod off for a moment and puts it back on the road – centred, along the track, at the last safe place (several tracks)', () => {
  const bad: string[] = [];
  for (const id of ['boonta', 'frost', 'aquilaris', 'oovo', 'methane']) {
    const idx = plainIdx(id); if (idx < 0) { bad.push(`${id}: no plain stretch`); continue; }
    const { td, p, safe } = strayPod(id, idx, 90);
    if (Math.abs(safe - idx) > 6) bad.push(`${id}: last safe place ${safe}, the pod was at ${idx}`);
    if (!manualReset(p)) { bad.push(`${id}: the reset was refused`); continue; }
    if (!(p.dead > 0 && Math.abs(p.dead - RESET_WAIT) < 1e-6)) bad.push(`${id}: the pod is not off the track for ${RESET_WAIT} s (dead ${p.dead})`);
    let t = 0, back = ''; while (t < 3 && !back) { back = tickRespawn(p, td, 1 / 60); t += 1 / 60; }
    if (back !== 'reset') { bad.push(`${id}: came back as '${back}' after ${t.toFixed(2)} s`); continue; }
    if (Math.abs(t - RESET_WAIT) > 0.05) bad.push(`${id}: back after ${t.toFixed(2)} s`);
    const s = td.main.samples[p.idx], lat = (p.pos.x - s.x) * s.rx + (p.pos.z - s.z) * s.rz, along = p.vel.x * s.tx + p.vel.z * s.tz, head = Math.cos(p.yaw - Math.atan2(s.tx, s.tz));
    if (p.path !== 0 || p.idx < safe || p.idx > safe + 40) bad.push(`${id}: put at sample ${p.idx} of path ${p.path} (last safe ${safe})`);
    if (Math.abs(lat) > 0.5) bad.push(`${id}: ${lat.toFixed(1)} m beside the centre line`);
    if (head < 0.99) bad.push(`${id}: not facing along the track (cos ${head.toFixed(2)})`);
    if (along < 20 || along > 50) bad.push(`${id}: rolls on at ${along.toFixed(0)} m/s`);
    if (s.gap || s.ramp) bad.push(`${id}: put on a ramp or over a gap`);
    if (!(p.invuln > 1)) bad.push(`${id}: not protected after the reset (invuln ${p.invuln})`);
  }
  eq(bad.length, 0, `${bad.join(' · ')} –`);
});
test('reset: no free repair – hull, lost parts and engine heat stay as they are (a crash respawn still patches the pod up)', () => {
  const idx = plainIdx('boonta'), a = strayPod('boonta', idx, 90), p = a.p;
  p.hpL = 20; p.hpR = 31; p.heat = 0.8; p.overT = 1.2; p.parts = 5;
  ok(manualReset(p), 'the reset was refused'); while (p.dead > 0) tickRespawn(p, a.td, 1 / 60);
  eq(p.hpL, 20, 'left engine after the reset –'); eq(p.hpR, 31, 'right engine after the reset –'); eq(p.parts, 5, 'lost parts after the reset –');
  ok(Math.abs(p.heat - 0.8) < 1e-9 && Math.abs((p.overT ?? 0) - 1.2) < 1e-9, `heat ${p.heat}, overdrive ${p.overT} after the reset`);
  const b = strayPod('boonta', idx, 90), q = b.p; q.hpL = 20; q.hpR = 31; q.heat = 0.8; q.parts = 5;
  kill(q, 1.6, false); let back = ''; while (!back) back = tickRespawn(q, b.td, 1 / 60);
  eq(back, 'patched', 'a crash respawn reports –'); ok(q.hpL >= 55 && q.hpR >= 55 && q.parts === 0 && q.heat === 0, `after a crash: hull ${q.hpL} / ${q.hpR}, parts ${q.parts}, heat ${q.heat}`);
});
test('reset: refused while the pod is off the track, after the finish and for three seconds after a reset', () => {
  const idx = plainIdx('boonta'), { td, p } = strayPod('boonta', idx, 90);
  ok(manualReset(p), 'first reset refused'); ok(!manualReset(p), 'a second reset while the pod is off the track');
  while (p.dead > 0) tickRespawn(p, td, 1 / 60);
  ok(!manualReset(p), 'a reset right after the reset'); ok(RESET_COOLDOWN >= 2 && RESET_COOLDOWN <= 5, `cooldown ${RESET_COOLDOWN} s`);
  for (let t = 0; t < RESET_COOLDOWN + 0.05; t += 1 / 60) tickRespawn(p, td, 1 / 60);
  ok(manualReset(p), 'refused after the cooldown'); while (p.dead > 0) tickRespawn(p, td, 1 / 60);
  const f = strayPod('boonta', idx, 90).p; f.finished = true; ok(!manualReset(f), 'a reset after the finish');
  const d = strayPod('boonta', idx, 90).p; kill(d, 2.6, true); const dead0 = d.dead; ok(!manualReset(d) && d.dead === dead0, 'a reset shortened the wait after a crash');
});
test('reset: the key is in both keyboard layouts and on the gamepad, free of other actions; old stored layouts get it without a double binding', () => {
  ok(ACTIONS.some(([a]) => a === 'reset'), 'no action "reset" in the list');
  for (const [name, pre] of Object.entries(KEY_PRESETS)) {
    const mine = pre.keys.reset; ok(mine && mine.length > 0, `${name}: no key`);
    for (const [a] of ACTIONS) if (a !== 'reset') for (const c of pre.keys[a]) ok(!mine.includes(c), `${name}: ${c} is also "${a}"`);
  }
  const pad = defaultPad(), mine = pad.reset; ok(mine && mine.length === 1 && 'b' in mine[0] && mine[0].b !== 9, `gamepad: ${JSON.stringify(mine)}`);
  for (const [a] of ACTIONS) if (a !== 'reset') for (const x of pad[a]) ok(!('b' in x && 'b' in mine[0] && x.b === mine[0].b), `gamepad: button ${JSON.stringify(x)} is also "${a}"`);
  const old = JSON.parse(JSON.stringify(KEY_PRESETS.flight.keys)) as Partial<KeyMap>; delete old.reset;
  eq(normalizeKeys(old).reset.join(), KEY_PRESETS.flight.keys.reset.join(), 'an old layout gets –');
  const taken = JSON.parse(JSON.stringify(old)) as Partial<KeyMap>; taken.repair = [KEY_PRESETS.flight.keys.reset[0]];
  const nk = normalizeKeys(taken); eq(nk.repair.join(), KEY_PRESETS.flight.keys.reset[0], 'the stored binding stays –'); eq(nk.reset.length, 0, 'the key the player already uses is not bound twice –');
  const oldPad = JSON.parse(JSON.stringify(defaultPad())) as Partial<PadMap>; delete oldPad.reset;
  eq(JSON.stringify(normalizePad(oldPad).reset), JSON.stringify(defaultPad().reset), 'an old gamepad layout gets –');
  const takenPad = JSON.parse(JSON.stringify(oldPad)) as Partial<PadMap>; takenPad.view = [defaultPad().reset[0]];
  eq(normalizePad(takenPad).reset.length, 0, 'gamepad: the button the player already uses is not bound twice –');
});

// ---- boost alarm (2026-11-23, user: „langsam stärker werdender Alarm-Sound, wenn Boost kurz vor Maximum") ----
test('alarm: silent below the warning zone, when the pod is not boosting and after the engines have cut out', () => {
  eq(boostAlarmLevel(0.3, true, 0, false), 0, 'boosting at 30 % heat –'); eq(boostAlarmLevel(ALARM_FROM, true, 0, false), 0, 'at the start of the zone –');
  eq(boostAlarmLevel(0.95, false, 0, false), 0, 'hot but not boosting –'); eq(boostAlarmLevel(1, false, 2, false), 0, 'overdrive time left over, not boosting –');
  eq(boostAlarmLevel(1, true, 3, true), 0, 'cut out –');
  ok(ALARM_FROM >= 0.6 && ALARM_FROM <= 0.8, `the alarm starts at ${ALARM_FROM * 100} % heat`);
});
test('alarm: grows with the heat up to the limit and keeps growing through the three seconds of overdrive', () => {
  const seq = [boostAlarmLevel(ALARM_FROM + 0.02, true, 0, false), boostAlarmLevel(0.85, true, 0, false), boostAlarmLevel(0.95, true, 0, false), boostAlarmLevel(0.999, true, 0, false),
    boostAlarmLevel(1, true, 0.5, false), boostAlarmLevel(1, true, 1.5, false), boostAlarmLevel(1, true, 2.5, false), boostAlarmLevel(1, true, 3, false)];
  for (let i = 1; i < seq.length; i++) ok(seq[i] > seq[i - 1], `step ${i}: ${seq[i - 1].toFixed(3)} → ${seq[i].toFixed(3)}`);
  ok(seq[0] > 0 && seq[0] < 0.1, `just inside the zone: ${seq[0]}`); eq(seq[seq.length - 1], 1, 'at the end of the overdrive –');
  ok(Math.abs(boostAlarmLevel(0.9999, true, 0, false) - boostAlarmLevel(1, true, 0, false)) < 0.01, 'a jump at the heat limit');
});
test('alarm: the voice gets faster, higher and louder with the level – silent at 0, never shrill or deafening', () => {
  eq(boostAlarmVoice(0).gain, 0, 'gain at level 0 –');
  let prev = boostAlarmVoice(0.02);
  for (let u = 0.1; u <= 1.0001; u += 0.1) { const v = boostAlarmVoice(u); ok(v.rate > prev.rate && v.freq > prev.freq && v.gain > prev.gain, `level ${u.toFixed(1)}: ${JSON.stringify(v)} after ${JSON.stringify(prev)}`); prev = v; }
  const lo = boostAlarmVoice(0.02), hi = boostAlarmVoice(1);
  ok(lo.rate >= 2 && hi.rate <= 14, `pulses per second ${lo.rate.toFixed(1)} … ${hi.rate.toFixed(1)}`); ok(lo.freq >= 500 && hi.freq <= 1400, `pitch ${lo.freq.toFixed(0)} … ${hi.freq.toFixed(0)} Hz`);
  ok(lo.gain < 0.02 && hi.gain <= 0.12 && hi.gain >= 0.08, `gain ${lo.gain.toFixed(3)} … ${hi.gain.toFixed(3)}`);
  ok(hi.rate >= 2.5 * lo.rate, 'the pulse rate hardly changes');
});
test('alarm: a held boost on the plain deck – the alarm starts at least 0.6 s before the heat limit, never falls back, and stops with the cut-out (every pod)', () => {
  const td = trackOf('magma'), S = td.main.samples, idx = S.findIndex((q, k) => k > 40 && q.surf === 0 && !q.roof && !q.gap && !q.ramp), s = S[idx];
  ok(idx > 0, 'magma has a stretch of plain deck'); const bad: string[] = [];
  for (const def of PODS) {
    const p = racer(def, td, idx, 0, s.y + HOVER); p.invuln = 0; p.heat = 0; p.input.throttle = 1; p.input.boost = true;
    let start = -1, limit = -1, cut = -1, last = 0, fell = 0;
    for (let f = 0; f < 60 * 14 && cut < 0; f++) {
      p.pos.set(s.x, s.y + HOVER, s.z); p.vel.set(s.tx * 120, 0, s.tz * 120); p.yaw = Math.atan2(s.tx, s.tz); p.idx = idx; p.lat = 0; p.hpL = p.hpR = 100;
      stepPod(p, td, 1 / 60, f / 60, 1, false);
      const lv = boostAlarmLevel(p.heat, p.boosting, p.overT ?? 0, p.overheat), t = (f + 1) / 60;
      if (start < 0 && lv > 0) start = t; if (limit < 0 && p.heat >= 1) limit = t;
      if (p.overheat) { cut = t; if (lv !== 0) bad.push(`${def.id}: level ${lv} after the cut-out`); } else { if (lv < last - 1e-9) fell++; last = lv; }
    }
    if (start < 0 || limit < 0 || cut < 0) { bad.push(`${def.id}: start ${start}, limit ${limit}, cut ${cut}`); continue; }
    if (limit - start < 0.6) bad.push(`${def.id}: only ${(limit - start).toFixed(2)} s of warning before the limit`);
    if (cut - limit < 2.5) bad.push(`${def.id}: only ${(cut - limit).toFixed(2)} s from the limit to the cut-out`);
    if (fell) bad.push(`${def.id}: the level fell ${fell} times during the boost`);
    if (last < 0.97) bad.push(`${def.id}: level ${last.toFixed(2)} right before the cut-out`);
  }
  eq(bad.length, 0, `${bad.length} · ${bad.slice(0, 4).join(' · ')} –`);
});

// ---- drops on the lens from spray (2026-11-23, user: „Wasserspritzer auf der Linse auch bei Fahrten über Wasser/Pfützen, wenn es nicht regnet") ----
test('lens: every lake but lava (and the frozen lake) throws drops at the lens; solid ground never does', () => {
  const wet = SURFACES.filter(splashes).map(s => s.id).sort();
  eq(wet.join(','), ['methane', 'mirror', 'swamp', 'water'].sort().join(','), 'surfaces that splash –');
});
test('lens: the player\'s own wake over a lake wets the lens at racing speed, not when standing; a dry road never does', () => {
  ok(lensSpray(true, 0, 100, null) >= 0.45, `over a lake at 100 m/s: ${lensSpray(true, 0, 100, null)}`);
  ok(lensSpray(true, 0, 100, null) <= 0.7, `over a lake at 100 m/s: ${lensSpray(true, 0, 100, null)} – more than heavy rain`);
  eq(lensSpray(true, 0, 0, null), 0, 'standing over the lake –');
  ok(lensSpray(true, 0, 30, null) < lensSpray(true, 0, 100, null), 'slow is not less than fast');
  eq(lensSpray(false, 0, 100, null), 0, 'dry road –');
});
test('lens: puddles after rain wet the lens too – less than a lake, more the wetter the road', () => {
  const half = lensSpray(false, 0.5, 100, null), full = lensSpray(false, 1, 100, null), lake = lensSpray(true, 1, 100, null);
  ok(full >= 0.2, `soaked road: ${full}`); ok(half > 0 && half < full, `half-dry road ${half}, soaked ${full}`); ok(full < lake, `soaked road ${full}, lake ${lake}`);
});
test('lens: a pod close ahead throws more at the lens than the own wake; none from behind, from far ahead or from the side', () => {
  const own = lensSpray(true, 0, 100, null);
  ok(lensSpray(true, 0, 100, 6, 0) > own, `6 m ahead: ${lensSpray(true, 0, 100, 6, 0)}, own ${own}`);
  ok(lensSpray(true, 0, 100, 30, 0) < lensSpray(true, 0, 100, 10, 0), 'no fall-off with distance');
  eq(lensSpray(true, 0, 100, -8, 0), 0, 'a pod behind –'); eq(lensSpray(true, 0, 100, 60, 0), 0, 'a pod 60 m ahead –'); eq(lensSpray(true, 0, 100, 10, 14), 0, 'a pod 14 m to the side –');
});
test('lens: the drops are built into the picture on every track with a lake – and only there (dry weather)', () => {
  const want: Record<string, boolean> = { boonta: false, frost: false, magma: false, dunepass: false, jungle: true, aquilaris: true, oovo: false, crystal: true, malastare: true, mosespa: false, howler: false, methane: true, executioner: false };
  const bad: string[] = [];
  for (const def of TRACKS) { if (!(def.id in want)) { bad.push(`${def.id}: not listed in this check`); continue; } const has = trackSplashes(trackOf(def.id).paths); if (has !== want[def.id]) bad.push(`${def.id}: ${has}`); }
  eq(bad.length, 0, `${bad.join(' · ')} –`);
});

/* ---- 2026-11-23, after the test drive: "Lavakruste und Lavasee sehen vertauscht aus" ----
 * The flowing-lava photo sat on the solid crust, and the lake showed dark plates with glowing cracks. The looks are decided in two
 * places: the surface table (solid ground) and `LAVA_TEX` (the liquid) – this pins which picture belongs to which. */
test('lava: the flowing-lava photo belongs to the liquid (lake, lava sea) – the crust is cracked plates with glowing joints', () => {
  const crust = SURFACES[SURF.crust], lake = SURFACES[SURF.lavalake];
  eq(LAVA_TEX.set, 'lava', 'the liquid lava is drawn from the flowing-lava photo set');
  ok(crust.tex && crust.tex.set !== LAVA_TEX.set, `the crust must not use the liquid's photo set (it has '${crust.tex?.set}')`);
  eq(crust.tex!.kind, 'basalt', 'the crust is generated as columnar basalt plates');
  ok(!!crust.tex!.emissive, 'the joints of the crust glow');
  ok(lake.liquid === 'lava' && !lake.tex, 'the lake is a liquid: no ground texture, drawn by lavaSeaMaterial');
  for (const id of ['basalt', 'ash'] as const) ok(SURFACES[SURF[id]].tex!.set !== LAVA_TEX.set, `${id} is solid ground too`);
});

/* ---- 2026-11-23, user: "dezente Fahrspuren auch im Sand / Mondstaub" (look only) ----
 * Decision: two flat stripes per pod; in sand the wind erases them after about 40 s, in moon dust they stay for the whole race;
 * on sand, dunes, beach, ash and moon dust. `TrackLayer` (groundTracks.ts) lays the stripes; it is pure data – the mesh only shows it. */
/** first sample of a stretch of `len` samples of one surface on the main path without ramp, gap, roof or zero-G (-1: none) */
function surfStretch(td: TrackData, surf: number, len = 70): number {
  const S = td.main.samples; let run = 0;
  for (let i = 0; i < S.length; i++) { const q = S[i]; run = q.surf === surf && !q.gap && !q.ramp && !(q.roof > 0) && !q.zeroG ? run + 1 : 0; if (run >= len) return i - len + 1; }
  return -1;
}
/** flies a pod `metres` along the main road from sample `i0` (`lat` m beside the centre line, no physics: the layer only reads where
 *  the pod is) and lets the layer lay its stripes; returns the quads laid */
function layTracks(layer: TrackLayer, td: TrackData, def: string, i0: number, metres: number, t0: number, lat = 0, grounded = true): number {
  const S = td.main.samples, p = racer(byId(def), td, i0, lat, S[i0].y + HOVER); p.grounded = grounded;
  let laid = 0; const v = 100, dt = 1 / 60;
  for (let d = 0, f = 0; d <= metres; d += v * dt, f++) {
    const k = Math.min(S.length - 2, i0 + Math.floor(d / DS)), q = S[k], al = d - (k - i0) * DS;
    p.pos.x = q.x + q.tx * al + q.rx * lat; p.pos.z = q.z + q.tz * al + q.rz * lat; p.idx = k; p.lat = lat; p.vel.set(q.tx * v, 0, q.tz * v); p.yaw = Math.atan2(q.tx, q.tz); p.groundY = q.y; p.pos.y = q.y + HOVER + (grounded ? 0 : 9);
    laid += layer.step([p], td, t0 + f * dt);
  }
  return laid;
}
test('tracks: sand, dunes, beach and ash keep a track for 40 s, moon dust for the whole race – solid, frozen and liquid ground keeps none', () => {
  for (const id of ['sand', 'dunes', 'beach', 'ash'] as const) eq(trackLife(SURF[id]), 40, `${id}:`);
  eq(trackLife(SURF.regolith), Infinity, 'moon dust:');
  for (const sf of SURFACES) if (!['sand', 'dunes', 'beach', 'ash', 'regolith'].includes(sf.id)) eq(trackLife(SURFACES.indexOf(sf)), 0, `${sf.id} (${sf.name}):`);
  eq(trackLife(undefined), 0, 'no surface:');
});
test('tracks: a pod lays two flat stripes behind it on sand, under its engine banks – none on rock, none while it is in the air', () => {
  const td = trackOf('boonta'), S = td.main.samples, i0 = surfStretch(td, SURF.sand); ok(i0 >= 0, 'boonta has no plain stretch of sand');
  const layer = new TrackLayer(4000), n = layTracks(layer, td, 'aurora', i0 + 5, 80, 10);
  // (a cross-section is laid in the first frame in which the pod is TRACK_SEG metres on: at 100 m/s and 60 frames/s every 5 m)
  ok(n >= 2 * Math.floor(80 / (TRACK_SEG + 100 / 60)) - 2 && n <= 2 * Math.ceil(80 / TRACK_SEG) + 2, `${n} quads on 80 m of sand – expected two stripes of one quad per ${TRACK_SEG} … ${(TRACK_SEG + 100 / 60).toFixed(1)} m`);
  eq(layer.alive(10.5), n, 'quads visible right after the pass:');
  // where they lie: every corner of every quad under one of the two engine banks, close above the road
  const env = podEnvelope(byId('aurora')); let off = 0, high = 0, sides = [0, 0];
  for (let k = 0; k < n * 4; k++) {
    const x = layer.pos[k * 3], y = layer.pos[k * 3 + 1], z = layer.pos[k * 3 + 2];
    let bi = i0, bd = 1e9; for (let i = i0; i < i0 + 60; i++) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const q = S[bi], lat = (x - q.x) * q.rx + (z - q.z) * q.rz, e = lat < 0 ? env.engL : env.engR;
    if (Math.abs(lat) < Math.abs(e.x) - 2.2 || Math.abs(lat) > Math.abs(e.outerX) + 0.4) off++;
    const gy = frameAt(td.main, bi, x, z).groundY; if (y < gy || y > gy + 0.3) high++;
    sides[lat < 0 ? 0 : 1]++;
  }
  eq(off, 0, 'corners that do not lie under an engine bank:'); eq(high, 0, 'corners below the road or more than 0.3 m above it:');
  ok(sides[0] > 0 && sides[0] === sides[1], `corners left / right of the pod: ${sides[0]} / ${sides[1]} – expected two equal stripes`);
  const rock = surfStretch(td, SURF.rock); ok(rock >= 0, 'boonta has no plain stretch of rock');
  eq(layTracks(new TrackLayer(4000), td, 'aurora', rock + 5, 80, 10), 0, 'quads on rock:');
  eq(layTracks(new TrackLayer(4000), td, 'aurora', i0 + 5, 80, 10, 0, false), 0, 'quads while the pod is in the air:');
});
test('tracks: a second pod on the same line does not darken the track again, one beside it lays its own – and the wind erases them after 40 s', () => {
  const td = trackOf('boonta'), i0 = surfStretch(td, SURF.sand) + 5, layer = new TrackLayer(4000);
  const first = layTracks(layer, td, 'aurora', i0, 80, 10);
  const again = layTracks(layer, td, 'aurora', i0, 80, 14);
  ok(again <= first * 0.15, `${again} new quads on a line that already has ${first} – a track must not be laid twice (it would get darker with every pod)`);
  const beside = layTracks(layer, td, 'aurora', i0, 80, 16, 14);
  ok(beside >= first * 0.85, `${beside} quads 14 m beside the first line, expected about ${first}`);
  const all = first + again + beside;
  eq(layer.alive(17), all, 'visible at 17 s:');
  ok(layer.alive(10 + 39) > 0, 'after 39 s the first track should still be there');
  eq(layer.alive(16 + 41.5), 0, 'visible 41.5 s after the last pass:');
  const late = layTracks(layer, td, 'aurora', i0, 80, 80);
  ok(late >= first * 0.85, `${late} quads on the first line after the wind has erased it – expected a fresh track (${first})`);
});
test('tracks: in moon dust a track stays for the whole race and is never laid twice', () => {
  const td = trackOf('oovo'), i0 = surfStretch(td, SURF.regolith); ok(i0 >= 0, 'oovo has no plain stretch of moon dust');
  const layer = new TrackLayer(4000), first = layTracks(layer, td, 'mavik', i0 + 5, 80, 10);
  ok(first > 20, `${first} quads on 80 m of moon dust`);
  eq(layer.alive(10 + 1800), first, 'visible half an hour later:');
  eq(layTracks(layer, td, 'mavik', i0 + 5, 80, 1000), 0, 'new quads on the same line 16 minutes later:');
});
// 2026-11-25, reported by the user: "man sieht das Erzeugen seiner eigenen Spuren bei normaler Geschwindigkeit nicht (langsam sieht man
// es etwas) (nur Verfolger-Ansicht)". A stripe grew in steps of TRACK_SEG metres and faded in over 0.4 s: at 120 m/s it was 48 m behind
// the pod – behind the chase camera – before it showed.
test('tracks: a stripe grows right under the engines in every frame, and it is fully there well before the chase camera', () => {
  const td = trackOf('boonta'), S = td.main.samples, i0 = surfStretch(td, SURF.sand) + 5, env = podEnvelope(byId('aurora'));
  for (const v of [30, 120, 190]) {
    const layer = new TrackLayer(4000), p = racer(byId('aurora'), td, i0, 0, S[i0].y + HOVER); p.grounded = true;
    let worst = 0;
    for (let d = 0, f = 0; d <= 80; d += v / 60, f++) {
      const k = i0 + Math.floor(d / DS), q = S[k], al = d - (k - i0) * DS;
      p.pos.x = q.x + q.tx * al; p.pos.z = q.z + q.tz * al; p.idx = k; p.lat = 0; p.vel.set(q.tx * v, 0, q.tz * v); p.yaw = Math.atan2(q.tx, q.tz); p.groundY = q.y; p.pos.y = q.y + HOVER;
      layer.step([p], td, 10 + f / 60);
      if (f < 2) continue; // (the first frame only notes where the pod is)
      for (const e of [env.engL, env.engR]) {
        // the point on the ground under the middle of this engine bank, and the stripe corner nearest to it
        const zc = (e.frontZ + e.backZ) / 2, cx = p.pos.x + e.x * q.tz + zc * q.tx, cz = p.pos.z - e.x * q.tx + zc * q.tz, hw = Math.abs(e.outerX) - Math.abs(e.x);
        let near = 1e9; for (let c = 0; c < layer.count * 4; c++) near = Math.min(near, Math.hypot(layer.pos[c * 3] - cx, layer.pos[c * 3 + 2] - cz));
        worst = Math.max(worst, near - hw);
      }
    }
    ok(worst < 0.5, `at ${v} m/s the stripe ends up to ${worst.toFixed(1)} m behind the engines – it must reach them in every frame`);
  }
  // the chase camera flies 13.5 m and more behind the pod: at top speed with boost the stripe has to be fully there within 9 m
  ok(TRACK_FADE_IN > 0 && TRACK_FADE_IN * 190 <= 9, `a stripe fades in over ${TRACK_FADE_IN} s = ${(TRACK_FADE_IN * 190).toFixed(0)} m at 190 m/s – more than 9 m and it shows only behind the chase camera`);
});
test('tracks: a full layer overwrites its oldest quads – it never grows, never throws', () => {
  const td = trackOf('oovo'), i0 = surfStretch(td, SURF.regolith) + 5, layer = new TrackLayer(24);
  let n = 0; for (let k = 0; k < 6; k++) n += layTracks(layer, td, 'mavik', i0, 60, 10 + k, -15 + k * 6);
  ok(n > 24, `${n} quads laid into a layer of 24`); eq(layer.count, 24, 'quads held:'); ok(layer.alive(20) <= 24, 'more visible than the layer holds');
  eq(layer.pos.length, 24 * 4 * 3, 'the buffer grew:');
});

/* ---- 2026-11-23, user: "Schwerelosigkeitsüberarbeitung: zentrale mittige Anziehung. Wenn gelenkt wird, wird man danach zurückgezogen
 *      so wie im echten Spiel auch (wie ein Gummiband)" ----
 * Decisions: a spring to the tube's centre axis, sideways and in height; steering and climb / sink push the pod up to about 70 % of the
 * tube radius off centre; on release it snaps back in about 0.8 s with a slight overshoot; the nose follows the tube by itself.
 * A few slowly drifting boulders (every 150–200 m); a hit costs speed and hull like an obstacle rock. */
/** a zero-G stretch of the main path as [first, last] sample; `straight`: start of its straightest 220 samples */
function zgStretch(td: TrackData, which = 0): { a: number; b: number; straight: number } {
  const S = td.main.samples; let a = -1, n = 0;
  for (let i = 0; i <= S.length; i++) {
    const on = i < S.length && S[i].zeroG; if (on && a < 0) a = i;
    if (!on && a >= 0) {
      if (n++ === which) { let best = a + 20, bc = 1e9; for (let k = a + 20; k < i - 230; k += 5) { let c = 0; for (let j = k; j < k + 220; j++) c = Math.max(c, Math.abs(S[j].curv)); if (c < bc) { bc = c; best = k; } } return { a, b: i - 1, straight: best }; }
      a = -1;
    }
  }
  throw new Error(`no zero-G stretch ${which} on ${td.def.id}`);
}
/** a pod floating in the tube at sample `idx`: `lat` m beside the axis, `h` m above it, flying along the tube at `v` m/s */
function zgPod(td: TrackData, idx: number, lat = 0, h = 0, v = 140, def = 'aurora'): PodState {
  const s = td.main.samples[idx], p = racer(byId(def), td, idx, lat, frameAt(td.main, idx, s.x, s.z).groundY + ZG_AXIS + h);
  p.zeroG = true; p.grounded = false; p.zgT = 9; p.vel.set(s.tx * v, 0, s.tz * v); p.input.throttle = 1; p.invuln = 0;
  return p;
}
const zgH = (td: TrackData, p: PodState) => p.pos.y - (frameAt(td.main, p.idx, p.pos.x, p.pos.z).groundY + ZG_AXIS);
const zgYawErr = (td: TrackData, p: PodState) => { const q = td.main.samples[p.idx]; let d = p.yaw - Math.atan2(q.tx, q.tz); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
/** `td` without its drifting boulders (the spring is tested alone) */
const noRocks = (td: TrackData): TrackData => ({ ...td, zgRocks: [] });
test('zerog: a pod released off-centre is pulled back to the tube\'s axis in about 0.8 s, swings a little past it and settles', () => {
  const td = noRocks(trackOf('oovo')), z = zgStretch(td), p = zgPod(td, z.straight, 8, 6);
  let cross = -1, over = 0, crossH = -1, overH = 0;
  for (let f = 0; f < 3 * 120; f++) {
    stepPod(p, td, 1 / 120, f / 120, 1, false); const t = (f + 1) / 120, h = zgH(td, p);
    if (cross < 0 && p.lat <= 0) cross = t; if (cross >= 0) over = Math.min(over, p.lat);
    if (crossH < 0 && h <= 0) crossH = t; if (crossH >= 0) overH = Math.min(overH, h);
  }
  ok(cross > 0.5 && cross < 1.1, `sideways: back on the axis after ${cross.toFixed(2)} s – expected about 0.8 s (0.5 … 1.1)`);
  ok(crossH > 0.5 && crossH < 1.1, `in height: back on the axis after ${crossH.toFixed(2)} s – expected about 0.8 s (0.5 … 1.1)`);
  ok(-over > 8 * 0.02 && -over < 8 * 0.25, `sideways it swings ${(-over).toFixed(2)} m past the axis (from 8 m) – expected a slight overshoot, 2 … 25 %`);
  ok(-overH > 6 * 0.02 && -overH < 6 * 0.25, `in height it swings ${(-overH).toFixed(2)} m past the axis (from 6 m) – expected a slight overshoot, 2 … 25 %`);
  ok(Math.abs(p.lat) < 0.6 && Math.abs(zgH(td, p)) < 0.6, `after 3 s the pod should rest on the axis: ${p.lat.toFixed(2)} m beside, ${zgH(td, p).toFixed(2)} m above it`);
  eq(p.events.filter(e => e.type === 'field').length, 0, 'hits on the tube wall:');
});
test('zerog: steering and climb push the pod out to about 70 % of the tube radius, sink down to hover height – never into the wall, and the nose stays on the tube', () => {
  const td = noRocks(trackOf('oovo')), z = zgStretch(td);
  for (const [st, pi] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const p = zgPod(td, z.straight); p.input.steer = st; p.input.pitch = pi; let yawMax = 0;
    for (let f = 0; f < 2.6 * 120; f++) { stepPod(p, td, 1 / 120, f / 120, 1, false); yawMax = Math.max(yawMax, zgYawErr(td, p)); }
    const R = td.main.samples[p.idx].hw + 1.4, reach = Math.min(ZG_REACH * R, R - podParams(p).width - 1.2), lat = p.lat, h = zgH(td, p), name = st ? `steer ${st}` : `climb ${pi}`;
    near(ZG_REACH, 0.7, 'ZG_REACH:');
    if (st) { ok(Math.abs(lat - st * reach) < 0.08 * R, `${name}: ${lat.toFixed(1)} m beside the axis – expected ${(st * reach).toFixed(1)} m (70 % of the radius ${R.toFixed(1)} m)`); ok(Math.abs(h) < 1.5, `${name}: the pod left the axis in height (${h.toFixed(1)} m)`); }
    else if (pi > 0) { ok(Math.abs(h - reach) < 0.08 * R, `${name}: ${h.toFixed(1)} m above the axis – expected ${reach.toFixed(1)} m`); ok(Math.abs(lat) < 1.5, `${name}: the pod left the axis sideways (${lat.toFixed(1)} m)`); }
    else { ok(Math.abs(h + (ZG_AXIS - HOVER)) < 1, `${name}: ${h.toFixed(1)} m below the axis – down, the reach ends at hover height over the deck (${(HOVER - ZG_AXIS).toFixed(1)} m)`); ok(Math.abs(lat) < 1.5, `${name}: the pod left the axis sideways (${lat.toFixed(1)} m)`); }
    eq(p.events.filter(e => e.type === 'field').length, 0, `${name}: hits on the tube wall:`);
    ok(yawMax < 0.2, `${name}: the nose turned ${(yawMax * 57.3).toFixed(0)}° away from the tube – steering must push the pod, not turn it`);
  }
});
test('zerog: the nose follows the tube by itself – without any input a pod flies every tube from end to end on its axis', () => {
  for (const [id, n] of [['oovo', 2], ['executioner', 2]] as const) for (let w = 0; w < n; w++) {
    const td = noRocks(trackOf(id)), z = zgStretch(td, w), p = zgPod(td, z.a + 30, 0, 0, 150);
    let latMax = 0, hMax = 0, yawMax = 0, f = 0;
    // (up to 2.2 s before the end: from there the pod is led down to hover height – the check below this one)
    const stop = z.b - Math.ceil(150 * ZG_EXIT_FROM / DS) - 10;
    for (; f < 40 * 120 && p.idx < stop; f++) { stepPod(p, td, 1 / 120, f / 120, 1, false); latMax = Math.max(latMax, Math.abs(p.lat)); hMax = Math.max(hMax, Math.abs(zgH(td, p))); yawMax = Math.max(yawMax, zgYawErr(td, p)); }
    ok(p.idx >= stop, `${id} tube ${w}: the pod did not reach the end (sample ${p.idx} of ${z.b})`);
    ok(latMax < 3 && hMax < 2, `${id} tube ${w}: the pod wandered ${latMax.toFixed(1)} m sideways and ${hMax.toFixed(1)} m in height from the axis – expected under 3 m / 2 m`);
    ok(yawMax < 0.12, `${id} tube ${w}: the nose was up to ${(yawMax * 57.3).toFixed(0)}° off the tube's direction`);
    eq(p.events.filter(e => e.type === 'field').length, 0, `${id} tube ${w}: hits on the tube wall:`);
  }
});
test('zerog: at the end of a tube the pod is led back to the road – even when it is held against the wall or the ceiling', () => {
  for (const [id, n] of [['oovo', 2], ['executioner', 2]] as const) for (let w = 0; w < n; w++) for (const [st, pi] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]] as const) {
    const td = noRocks(trackOf(id)), z = zgStretch(td, w), S = td.main.samples, p = zgPod(td, z.b - 260, 0, 0, 150), hp0 = p.hpL + p.hpR;
    p.input.steer = st; p.input.pitch = pi; let offRoad = 0;
    // (the stick is held until the tube lets the pod go; the 40 m after that it flies straight – nobody steers this pod)
    for (let f = 0; f < 12 * 120 && p.idx < z.b + 20 && p.dead <= 0; f++) {
      stepPod(p, td, 1 / 120, f / 120, 1, false);
      if (!p.zeroG) { p.input.steer = 0; p.input.pitch = 0; if (Math.abs(p.lat) > S[p.idx].hw + 0.5) offRoad++; }
    }
    const name = `${id} tube ${w}, steer ${st}, climb ${pi}`;
    ok(p.dead <= 0 && p.idx >= z.b + 20, `${name}: the pod did not get out of the tube (sample ${p.idx}, tube ends at ${z.b}, dead ${p.dead})`);
    ok(p.grounded || p.pos.y - p.groundY < HOVER + 4, `${name}: the pod leaves the tube ${(p.pos.y - p.groundY).toFixed(1)} m above the road – expected at hover height`);
    eq(offRoad, 0, `${name}: steps beside the road after the tube:`);
    ok(hp0 - p.hpL - p.hpR < 0.01, `${name}: leaving the tube cost ${(hp0 - p.hpL - p.hpR).toFixed(1)} hull points`);
    eq(p.events.filter(e => e.type === 'fall').length, 0, `${name}: falls:`);
  }
});
// 2026-11-25, reported by the user: "Schwerkrafttunnel: man kann durch den Boden tauchen". The tube is a circle of 30–56 m radius round
// an axis 7 m above the deck – 70 % of the radius DOWN is 14–32 m below the deck. Down, the reach ends at hover height.
test('zerog: the pod cannot dive through the deck of a tube – held down it settles at hover height; thrown down, the deck holds; boulders float above it', () => {
  for (const [id, n] of [['oovo', 2], ['executioner', 2]] as const) for (let w = 0; w < n; w++) {
    const td = noRocks(trackOf(id)), z = zgStretch(td, w);
    const above = (p: PodState) => p.pos.y - frameAt(td.main, p.idx, p.pos.x, p.pos.z).groundY; // metres above the deck
    for (const st of [0, 1, -1]) {
      const p = zgPod(td, z.straight); p.input.steer = st; p.input.pitch = -1; let low = 1e9;
      for (let f = 0; f < 1.8 * 120; f++) { stepPod(p, td, 1 / 120, f / 120, 1, false); low = Math.min(low, above(p)); } // (1.8 s: settled, and still well inside the tube)
      ok(p.zeroG, `${id} tube ${w}: the check left the tube`);
      ok(low >= HOVER - 0.6, `${id} tube ${w}, sink held, steer ${st}: the pod came down to ${low.toFixed(1)} m above the deck – it must not go below hover height (${HOVER} m)`);
      ok(above(p) < HOVER + 1.5, `${id} tube ${w}, sink held, steer ${st}: the pod rests ${above(p).toFixed(1)} m above the deck – expected at hover height`);
    }
    const q = zgPod(td, z.straight, 0, -2); q.vel.y = -45; let low = 1e9, hp0 = q.hpL + q.hpR;
    for (let f = 0; f < 120; f++) { stepPod(q, td, 1 / 120, f / 120, 1, false); low = Math.min(low, above(q)); }
    ok(low >= HOVER - 0.6, `${id} tube ${w}: thrown down at 45 m/s the pod reached ${low.toFixed(1)} m above the deck – the deck must hold`);
    eq(hp0 - q.hpL - q.hpR, 0, `${id} tube ${w}: hull lost on the deck of a zero-G tube:`);
  }
  for (const id of ['oovo', 'executioner']) { const td = trackOf(id); for (const r of td.zgRocks) for (let t = 0; t <= 60; t += 0.5) { const q = zgRockAt(td, r, t), deck = frameAt(td.main, r.idx, q.x, q.z).groundY; ok(q.y - r.r >= deck + 0.5, `${id}: the boulder at sample ${r.idx} hangs ${(q.y - r.r - deck).toFixed(1)} m above the deck at ${t} s – it must float clear of it`); } }
});
test('zerog: every tube has a few boulders, 150–200 m apart, drifting slowly and never through the wall', () => {
  for (const id of ['oovo', 'executioner']) {
    const td = trackOf(id), S = td.main.samples; ok(td.zgRocks.length > 0, `${id}: no boulders`);
    for (let w = 0; w < 2; w++) {
      const z = zgStretch(td, w), rocks = td.zgRocks.filter(r => r.idx >= z.a && r.idx <= z.b).sort((a, b) => a.idx - b.idx), len = (z.b - z.a) * DS;
      ok(rocks.length >= Math.floor((len - 300) / 200) && rocks.length <= Math.ceil(len / 150), `${id} tube ${w} (${len} m): ${rocks.length} boulders`);
      for (let k = 1; k < rocks.length; k++) { const d = (rocks[k].idx - rocks[k - 1].idx) * DS; ok(d >= 150 && d <= 200, `${id} tube ${w}: ${d} m between two boulders – expected 150 … 200`); }
      ok(rocks[0].idx - z.a >= 40 && z.b - rocks[rocks.length - 1].idx >= 40, `${id} tube ${w}: a boulder within 80 m of the tube's end`);
      for (const r of rocks) {
        ok(r.r >= 1.5 && r.r <= 3.2, `${id}: boulder radius ${r.r}`);
        const R = S[r.idx].hw + 1.4; let vmax = 0, prev = zgRockAt(td, r, 0);
        for (let t = 0.25; t <= 60; t += 0.25) {
          const q = zgRockAt(td, r, t); vmax = Math.max(vmax, Math.hypot(q.lat - prev.lat, q.h - prev.h) / 0.25); prev = q;
          ok(Math.hypot(q.lat, q.h) + r.r < R - 0.5, `${id}: the boulder at sample ${r.idx} reaches the tube wall at ${t} s (${Math.hypot(q.lat, q.h).toFixed(1)} m + ${r.r} m of ${R.toFixed(1)} m)`);
          ok(Math.abs(q.y - (frameAt(td.main, r.idx, S[r.idx].x, S[r.idx].z).groundY + ZG_AXIS + q.h)) < 0.5, 'the boulder\'s world height does not match its offset from the axis');
        }
        ok(vmax > 0.2 && vmax < 3, `${id}: the boulder at sample ${r.idx} drifts at up to ${vmax.toFixed(2)} m/s – expected slow, 0.2 … 3`);
      }
    }
  }
  for (const id of ['boonta', 'frost']) eq(trackOf(id).zgRocks.length, 0, `${id} has no zero-G tube, boulders:`);
});
test('zerog: hitting a boulder costs speed and hull like an obstacle rock – flying past it costs nothing', () => {
  const td = trackOf('oovo'), z = zgStretch(td), rock = td.zgRocks.find(r => r.idx > z.a + 120 && r.idx < z.b - 60)!; ok(rock, 'no boulder in the first tube of oovo');
  const fly = (off: number) => {
    // (the boulder is frozen where it is at t = 0: the pod is held on a line `off` metres beside the boulder's centre, at its height)
    const one: TrackData = { ...td, zgRocks: [{ ...rock, ax: 0, ah: 0 }] }, q0 = zgRockAt(one, one.zgRocks[0], 0);
    const p = zgPod(one, rock.idx - 60, q0.lat + off, q0.h, 140), hp0 = p.hpL + p.hpR; let vMin = 1e9;
    for (let f = 0; f < 1.4 * 120; f++) {
      const before = p.events.length; stepPod(p, one, 1 / 120, 0, 1, false);
      if (p.events.length === before && p.idx < rock.idx - 3) { // hold the line until the hit: the spring would pull the pod to the axis
        const s = one.main.samples[p.idx], al = (p.pos.x - s.x) * s.tx + (p.pos.z - s.z) * s.tz, v = Math.hypot(p.vel.x, p.vel.z);
        p.pos.x = s.x + s.tx * al + s.rx * (q0.lat + off); p.pos.z = s.z + s.tz * al + s.rz * (q0.lat + off); p.pos.y = frameAt(one.main, p.idx, p.pos.x, p.pos.z).groundY + ZG_AXIS + q0.h; p.vel.set(s.tx * v, 0, s.tz * v);
      }
      vMin = Math.min(vMin, Math.hypot(p.vel.x, p.vel.z));
    }
    return { lost: hp0 - p.hpL - p.hpR, vMin, hits: p.events.filter(e => e.type === 'obstacle').length };
  };
  const hit = fly(1.2), miss = fly(rock.r + podParams(zgPod(td, rock.idx)).width + 4);
  ok(hit.hits >= 1, 'a pod flying into the boulder reports no hit'); ok(hit.lost > 3, `the hit cost ${hit.lost.toFixed(1)} hull points – expected a clear hit like an obstacle rock`);
  ok(hit.vMin < 140 * 0.9, `the hit slowed the pod to ${hit.vMin.toFixed(0)} m/s only (from 140)`);
  eq(miss.hits, 0, 'hits when flying past:'); eq(miss.lost, 0, 'hull lost when flying past:');
});
test('zerog: a rival flies both tubes of Oovo IV without touching the wall or a boulder', () => {
  const td = trackOf('oovo');
  for (let w = 0; w < 2; w++) {
    const z = zgStretch(td, w), s = td.main.samples[z.a - 30], p = racer(byId('mavik'), td, z.a - 30, 0, s.y + HOVER);
    p.isPlayer = false; p.grounded = true; p.invuln = 0; p.vel.set(s.tx * 120, 0, s.tz * 120);
    p.ai = { skill: 0.9, speedF: 1, lineOff: 0, takeShortcut: false, boostUntil: 0, repairMode: false, noiseT: 0, rubber: 1 };
    let f = 0; for (; f < 40 * 60 && p.idx < z.b + 20 && p.dead <= 0; f++) { const t = 30 + f / 60; aiInputs(p, td, [p], t, null); stepPod(p, td, 1 / 60, t, 1, false); }
    ok(p.idx >= z.b + 20 && p.dead <= 0, `tube ${w}: the rival did not come through (sample ${p.idx}, tube ${z.a} … ${z.b}, dead ${p.dead})`);
    eq(p.events.filter(e => e.type === 'field').length, 0, `tube ${w}: hits on the tube wall:`);
    eq(p.events.filter(e => e.type === 'obstacle').length, 0, `tube ${w}: boulders hit:`);
  }
});

/* ---- 2026-11-23, user: "Fahreigenschaften auf verschiedenen Untergründen generell kaum spürbar – etwas stärker. Besonders mehr
 *      rutschen / sliden über Eis(seen)" ----
 * Decision ("deutlich"): ice and ice lake 45 % grip with long sliding · powder 78 % · snow 86 % · mud 80 % and 88 % top speed · dunes
 * 85 % and 91 % · sand, gravel, ash 90 % · rock and deck 100 %. The world itself takes no grip any more (the ice world had ×0.8, the
 * jungle moon ×0.9 on top of every surface) – what the surface says is what the pod gets. */
test('ground: grip and top speed of every surface as decided – ice 45 %, powder 78 %, snow 86 %, mud 80 % / 88 %, dunes 85 % / 91 %, sand, gravel and ash 90 %, rock and deck 100 %', () => {
  const want: Record<string, [number, number?]> = {
    ice: [0.45, 1], icelake: [0.45, 1], powder: [0.78, 0.86], snow: [0.86], mud: [0.8, 0.88], dunes: [0.85, 0.91], sand: [0.9], gravel: [0.9], ash: [0.9],
    rock: [1, 1], deck: [1, 1], road: [1, 1], plateau: [1, 1], basalt: [1, 1], reef: [1, 1],
  };
  for (const [id, [g, v]] of Object.entries(want)) { const sf = SURFACES[SURF[id]]; ok(sf, `no surface ${id}`); near(sf.grip, g, `${id} (${sf.name}) grip:`); if (v !== undefined) near(sf.vmax, v, `${id} (${sf.name}) top speed:`); }
  for (const sf of SURFACES) ok(sf.grip <= 1 && sf.grip >= 0.4 && sf.vmax <= 1 && sf.vmax >= 0.85, `${sf.id}: grip ${sf.grip}, top speed ${sf.vmax} – outside 0.4 … 1 / 0.85 … 1`);
  near(WORLD_GRIP, 1, 'grip factor of a world:');
});
test('ground: on ice a pod slides on – a small sideways push fades at 45 % of the rate on the built road (snow 86 %), a real slide carries far longer', () => {
  // the same pod on the same stretch of road (a copy of Frostspalt whose ground is swapped – banking and slope stay the same), pushed
  // sideways, no steering: how much of the push is left after half a second
  const left = (surf: string, push: number) => {
    const td = buildTrack(TRACKS.find(t => t.id === 'frost')!), S = td.main.samples, i0 = surfStretch(td, SURF.snow, 80); ok(i0 >= 0, 'frost has no plain stretch of snow');
    for (let k = i0; k < i0 + 80; k++) S[k].surf = SURF[surf];
    const s = S[i0 + 8], p = racer(byId('aurora'), td, i0 + 8, 0, s.y + HOVER); p.grounded = true; p.input.throttle = 1;
    p.vel.set(s.tx * 110 + s.rx * push, 0, s.tz * 110 + s.rz * push);
    for (let f = 0; f < 60; f++) stepPod(p, td, 1 / 120, f / 120, 1, false);
    return (p.vel.x * -Math.cos(p.yaw) + p.vel.z * Math.sin(p.yaw)) / push;
  };
  const rate = (x: number) => -Math.log(Math.max(1e-6, x)); // fade rate × 0.5 s
  const road = rate(left('road', 2)), ice = rate(left('ice', 2)) / road, lake = rate(left('icelake', 2)) / road, snow = rate(left('snow', 2)) / road;
  ok(Math.abs(ice - 0.45) < 0.04 && Math.abs(lake - 0.45) < 0.04, `a small push fades on ice at ${(ice * 100).toFixed(0)} % and on the ice lake at ${(lake * 100).toFixed(0)} % of the rate on the road – expected 45 %`);
  ok(Math.abs(snow - 0.86) < 0.04, `on snow a small push fades at ${(snow * 100).toFixed(0)} % of the rate on the road – expected 86 %`);
  // a real slide (20 m/s sideways): on ice the grip breaks away – "langes Nachrutschen"
  const slideIce = left('ice', 20), slideRoad = left('road', 20), slideSnow = left('snow', 20);
  ok(slideIce > 0.3, `half a second into a slide ${(slideIce * 100).toFixed(0)} % of the sideways speed are left on ice – expected more than 30 % (it should slide on)`);
  ok(slideRoad < 0.05 && slideSnow < 0.1, `on the road ${(slideRoad * 100).toFixed(0)} % and on snow ${(slideSnow * 100).toFixed(0)} % of a slide are left after half a second – only ice lets a pod slide on`);
  ok((SURFACES[SURF.ice].slip ?? 0) > 0 && SURFACES[SURF.ice].slip === SURFACES[SURF.icelake].slip, 'ice and ice lake should share one slip value');
  for (const sf of SURFACES) if (sf.id !== 'ice' && sf.id !== 'icelake') ok(!sf.slip, `${sf.id} has a slip value – only ice slides on`);
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
// 2026-11-25, user: "Schatten- und Reflektions-Auflösung erhöhen". The maps were 1024 / 1536 / 2048 (18–23 cm per texel), the
// screen-space reflections ran at 75 % of the picture on „Hoch", and a saved profile kept that 75 % whatever the presets say.
test('resolution: a shadow texel is at most 12 cm in every shadow quality (maps of 2048 and more)', () => {
  for (const q of [1, 2, 3]) { const b = SH_BOX[q], texel = b.ext * 2 / b.map; ok(b.map >= 2048 && texel <= 0.12, `quality ${q}: map ${b.map}, ${(texel * 100).toFixed(0)} cm per texel`); }
  ok(SH_BOX[3].map >= 4096, `the best quality has a map of ${SH_BOX[3].map}`);
});
test('resolution: reflections run at full resolution on „Hoch" and „Ultra" – and a profile saved before gets the raise once', () => {
  eq([PRESETS.high.reflRes, PRESETS.ultra.reflRes], [1, 1], 'preset reflection resolution [Hoch, Ultra]:');
  const d = defaultProfile().gfx;
  eq(sanitizeGfx({ ...d, reflRes: 0.75, rev: undefined }, d).reflRes, 1, 'a profile saved with the old 75 %:');
  ok(Math.abs(sanitizeGfx({ ...d, reflRes: 0.45, rev: undefined }, d).reflRes! - 0.6) < 1e-9, 'a profile saved with 45 % should get the same raise (60 %)');
  eq(sanitizeGfx({ ...d, reflRes: 0.6, rev: GFX_REV }, d).reflRes, 0.6, 'a value chosen after the raise stays:');
  eq(sanitizeGfx({ ...d, reflRes: 0.75, rev: undefined }, d).rev, GFX_REV, 'the profile is marked as raised:');
  ok(ENV_MAP_SIZE >= 512, `the sky reflected on pods, ice and water has ${ENV_MAP_SIZE} pixels per cube face`);
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

// ---- jumps (2026-11-25, user: "reduziere die generelle Sprungweite. Diese ist gerade bei Boost zu weit.") ----
// Measured before: at full speed 160–310 m (1.2–2.4 s in the air), with boost 250–570 m, with boost and nose up 600 m and more – over
// gaps of 40–50 m. The launch took its upward speed from the ramp's slope times the pod's speed, up to 62 m/s. Now a ramp throws
// every pod up at the same, slow speed (`launchVy`): the distance grows with the pod's speed only, not with its square.
/** every ramp of the main path: first and last ramp sample, last sample of the gap behind it (= `b` when there is none), lip height */
function rampsOf(td: TrackData): { a: number; b: number; gapEnd: number; h: number }[] {
  const S = td.main.samples, N = S.length, out: { a: number; b: number; gapEnd: number; h: number }[] = [];
  for (let i = 1; i < N - 1; i++) if (S[i].ramp > 0 && !(S[i - 1].ramp > 0)) { let b = i; while (b + 1 < N && S[b + 1].ramp > 0) b++; let g = b; while (g + 1 < N && S[g + 1].gap) g++; out.push({ a: i, b, gapEnd: g, h: S[b].ramp }); i = b; }
  return out;
}
/** An Aurora takes the ramp `r`, held on the centre line: `v` m/s at the start of the run-up (50 m before the ramp – further back
 *  stand a rock on Executioner and its rotor, right on the centre line), throttle
 *  open, `boost` held or not, `pitch` held on the ramp and in the air. Returns metres from take-off to touch-down (0 = it never came
 *  down, −1 = it died), seconds in the air, upward speed at take-off, speed at take-off, height of the apex above the lip. */
function jumpOver(td: TrackData, r: { a: number; b: number; gapEnd: number }, v: number, o: { boost?: boolean; pitch?: number; hz?: number } = {}) {
  const S = td.main.samples, start = Math.max(2, r.a - 25), p = racer(byId('aurora'), td, start, 0, S[start].y + HOVER), hz = o.hz ?? 120;
  p.grounded = true; p.invuln = 0; p.vel.set(S[start].tx * v, 0, S[start].tz * v); p.input.throttle = 1;
  let took = -1, t = 0, vy = 0, v0 = 0, x0 = 0, z0 = 0, y0 = 0, apex = 0;
  for (let f = 0; f < hz * 12; f++) {
    { const q = S[p.idx], al = (p.pos.x - q.x) * q.tx + (p.pos.z - q.z) * q.tz, sp = Math.hypot(p.vel.x, p.vel.z); p.pos.x = q.x + q.tx * al; p.pos.z = q.z + q.tz * al; p.yaw = Math.atan2(q.tx, q.tz); p.yawRate = 0; p.vel.x = q.tx * sp; p.vel.z = q.tz * sp; }
    p.input.boost = !!o.boost; if (o.boost) p.heat = 0;
    p.input.pitch = (took >= 0 || S[p.idx].ramp > 0) ? o.pitch ?? 0 : 0;
    const was = p.grounded; stepPod(p, td, 1 / hz, t, 1, false); t += 1 / hz;
    if (p.dead > 0) return { dist: -1, air: 0, vy, v: v0, apex };
    if (took < 0 && was && !p.grounded && p.idx >= r.b - 1 && p.idx <= r.gapEnd + 3) { took = t; vy = p.vel.y; v0 = Math.hypot(p.vel.x, p.vel.z); x0 = p.pos.x; z0 = p.pos.z; y0 = p.pos.y; }
    else if (took >= 0) { apex = Math.max(apex, p.pos.y - y0); if (p.grounded) return { dist: Math.hypot(p.pos.x - x0, p.pos.z - z0), air: t - took, vy, v: v0, apex }; }
    if (p.idx > r.gapEnd + 500) break;
  }
  return { dist: 0, air: 0, vy, v: v0, apex };
}
const JUMP_TRACKS = TRACKS.filter(t => t.ramps.length).map(t => t.id);
test('jump: at full speed a ramp carries a pod 85–145 m (under a second in the air), with boost at most 190 m – every ramp of every track', () => {
  const bad: string[] = []; let n = 0; const top = podParams(racer(byId('aurora'), trackOf('boonta'), 60, 0, 0)).vmax0;
  for (const id of JUMP_TRACKS) { const td = trackOf(id); for (const r of rampsOf(td)) {
    n++;
    const full = jumpOver(td, r, top * 0.98), boost = jumpOver(td, r, top * 1.3, { boost: true });
    if (process.env.DEBUG) console.log(`   ${id.padEnd(11)} ramp ${r.a} h ${r.h.toFixed(0)} gap ${(r.gapEnd - r.b) * DS} m · full: ${full.v.toFixed(0)} m/s up ${full.vy.toFixed(1)} → ${full.dist.toFixed(0)} m, ${full.air.toFixed(2)} s, apex ${full.apex.toFixed(1)} · boost: ${boost.v.toFixed(0)} m/s up ${boost.vy.toFixed(1)} → ${boost.dist.toFixed(0)} m, ${boost.air.toFixed(2)} s`);
    if (!(full.dist >= 85 && full.dist <= 145)) bad.push(`${id} ramp ${r.a}: ${full.dist.toFixed(0)} m at full speed (${full.v.toFixed(0)} m/s, up ${full.vy.toFixed(1)} m/s)`);
    if (!(full.air <= 1.15)) bad.push(`${id} ramp ${r.a}: ${full.air.toFixed(2)} s in the air at full speed`);
    if (!(boost.dist >= full.dist && boost.dist <= 190)) bad.push(`${id} ramp ${r.a}: ${boost.dist.toFixed(0)} m with boost (${boost.v.toFixed(0)} m/s, up ${boost.vy.toFixed(1)} m/s; ${full.dist.toFixed(0)} m without)`);
  } }
  ok(n >= 20, `only ${n} ramps found`);
  eq(bad.length, 0, `${bad.length} of ${n} ramps · ${bad.slice(0, 5).join(' · ')} –`);
});
test('jump: over a gap nose up carries 10–40 % further, nose down brings the pod down sooner – and every gap is cleared flying level, also by a slow pod', () => {
  const bad: string[] = []; const top = podParams(racer(byId('aurora'), trackOf('boonta'), 60, 0, 0)).vmax0;
  for (const id of JUMP_TRACKS) { const td = trackOf(id); for (const r of rampsOf(td)) {
    const gap = (r.gapEnd - r.b) * DS, full = jumpOver(td, r, top * 0.98), up = jumpOver(td, r, top * 0.98, { pitch: 1 }), down = jumpOver(td, r, top * 0.98, { pitch: -1 }), slow = jumpOver(td, r, 60);
    // (a ramp without a gap: with the nose up the pod also hovers 1.6 m higher – the repulsors catch it that much sooner, the two cancel out)
    if (gap > 0 && !(up.dist > full.dist * 1.1 && up.dist < full.dist * 1.4)) bad.push(`${id} ramp ${r.a}: nose up ${up.dist.toFixed(0)} m, level ${full.dist.toFixed(0)} m`);
    // (a dive right off the lip comes down after 44–50 m: over the widest gaps that is the far edge – the pilot's risk)
    if (!((down.dist > 0 || gap > 0) && down.dist < full.dist * 0.85)) bad.push(`${id} ramp ${r.a}: nose down ${down.dist.toFixed(0)} m, level ${full.dist.toFixed(0)} m`);
    if (gap > 0) for (const [name, j, room] of [['level', full, 30], ['slow (60 m/s)', slow, 10]] as const) if (!(j.dist >= gap + room)) bad.push(`${id} ramp ${r.a}: ${name} ${j.dist.toFixed(0)} m over a gap of ${gap} m`);
  } }
  eq(bad.length, 0, `${bad.length} · ${bad.slice(0, 5).join(' · ')} –`);
});
test('jump: the same jump at 60 and at 120 physics steps a second – the distance differs by less than 8 %', () => {
  const bad: string[] = []; const top = podParams(racer(byId('aurora'), trackOf('boonta'), 60, 0, 0)).vmax0;
  for (const id of ['boonta', 'magma', 'crystal']) { const td = trackOf(id); for (const r of rampsOf(td)) for (const boost of [false, true]) {
    const a = jumpOver(td, r, top * (boost ? 1.3 : 0.98), { boost, hz: 60 }), b = jumpOver(td, r, top * (boost ? 1.3 : 0.98), { boost, hz: 120 });
    if (!(a.dist > 0 && b.dist > 0 && Math.abs(a.dist - b.dist) < 0.08 * b.dist)) bad.push(`${id} ramp ${r.a}${boost ? ' boost' : ''}: ${a.dist.toFixed(0)} m at 60 Hz, ${b.dist.toFixed(0)} m at 120 Hz`);
  } }
  eq(bad.length, 0, `${bad.length} · ${bad.slice(0, 5).join(' · ')} –`);
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

/* ---- 2026-11-23, user: "auf Malastare: giftig grüner Methanregen – kein normaler Regen – Setting etwas düsterer" ----
 * Decisions: on both Malastare tracks methane replaces rain and storm entirely (green drops, green-yellow haze, green wetness, green
 * lens drops, greenish lightning); "Klar" and "Methannebel" stay; the world is about 30 % darker; the rain is flammable: grip as in
 * rain, boost heat +12 % (water rain −10 %), the boost draws green flame trails. */
const hexRGB = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const isGreen = (c: [number, number, number]) => c[1] > c[0] * 1.02 && c[1] > c[2] * 1.25;
test('methane: on Malastare rain and storm are methane – named so and flagged so; clear weather and the methane fog stay; other worlds keep water', () => {
  const names = weatherOptionsFor('malastare').map(o => o[1]);
  for (const n of ['Klar', 'Methanregen', 'Methangewitter', 'Methannebel']) ok(names.includes(n), `Malastare lacks the weather „${n}" (it has: ${names.join(', ')})`);
  ok(!names.includes('Regen') && !names.includes('Gewitter'), `Malastare still offers water rain: ${names.join(', ')}`);
  eq(envLabel('malastare', 'auto', 'rain'), 'Methanregen', 'HUD line for rain on Malastare:'); eq(envLabel('malastare', 'auto', 'storm'), 'Methangewitter', 'HUD line for a storm on Malastare:');
  for (const wx of ['rain', 'storm'] as WeatherKind[]) { const r = resolveEnvironment(THEMES.malastare, 'day', wx); ok(r.fx.methane && r.build.methane, `Malastare ${wx}: the rain is not flagged as methane`); ok(r.fx.rain > 0.5, `Malastare ${wx}: it does not rain (${r.fx.rain})`); }
  for (const wx of ['clear', 'fog'] as WeatherKind[]) { const r = resolveEnvironment(THEMES.malastare, 'day', wx); ok(!r.fx.methane && r.fx.rain === 0, `Malastare ${wx}: no rain expected`); }
  ok(resolveEnvironment(THEMES.malastare, 'auto', 'auto').build.methane, 'the standard weather of Malastare should be methane rain');
  for (const wx of ['front', 'clearing', 'changing'] as WeatherKind[]) ok(resolveEnvironment(THEMES.malastare, 'auto', wx).build.methane, `Malastare ${wx}: built without methane`);
  for (const id of ['jungle', 'aquilaris', 'crystal']) { const r = resolveEnvironment(THEMES[id], 'day', 'storm'); ok(!r.fx.methane && !r.build.methane, `${id}: its rain is methane`); ok(weatherOptionsFor(id).some(o => o[1] === 'Regen'), `${id} lost its rain`); }
});
test('methane: the rain is flammable – the boost heats 12 % faster than in clear weather (water rain: 10 % slower); the grip is that of rain', () => {
  for (const d of [0, 0.3, 1]) {
    ok(Math.abs(engineHeat('malastare', 'rain', 1, d) / engineHeat('malastare', 'clear', 1, d) - 1.12) < 0.004, `Malastare, sky darkness ${d}: methane rain changes the heat by × ${(engineHeat('malastare', 'rain', 1, d) / engineHeat('malastare', 'clear', 1, d)).toFixed(3)}, expected × 1.12`);
    ok(engineHeat('malastare', 'storm', 1, d) >= engineHeat('malastare', 'rain', 1, d) - 1e-9, 'a methane storm must not cool more than methane rain');
    ok(Math.abs(engineHeat('jungle', 'rain', 1, d) / engineHeat('jungle', 'clear', 1, d) - 0.9) < 0.004, `jungle, sky darkness ${d}: water rain should cool by 10 %`);
  }
  ok(engineHeat('malastare', 'rain', 1, 0) <= 1.25, 'the heat factor leaves its range');
  for (const wx of ['rain', 'storm'] as WeatherKind[]) near(resolveEnvironment(THEMES.malastare, 'day', wx).fx.grip, resolveEnvironment(THEMES.jungle, 'day', wx).fx.grip, `grip in a methane ${wx}:`);
});
test('methane: haze, drops, wetness, lens and lightning are green – on the jungle moon the same weather stays blue-grey', () => {
  for (const wx of ['rain', 'storm'] as WeatherKind[]) for (const tod of ['day', 'night'] as TimeOfDay[]) {
    const m = resolveEnvironment(THEMES.malastare, tod, wx), j = resolveEnvironment(THEMES.jungle, tod, wx);
    ok(isGreen(hexRGB(m.theme.fogColor)), `Malastare ${tod} ${wx}: the haze ${m.theme.fogColor} is not green-yellow`);
    ok(isGreen(hexRGB(m.fx.gustColor)), `Malastare ${tod} ${wx}: the squalls ${m.fx.gustColor} are not green-yellow`);
    ok(!isGreen(hexRGB(j.theme.fogColor)), `jungle ${tod} ${wx}: the haze ${j.theme.fogColor} turned green`);
  }
  ok(isGreen(hexRGB(METHANE.rain)), `drops ${METHANE.rain}`); ok(isGreen(METHANE.lens), `lens drops ${METHANE.lens}`); ok(isGreen(METHANE.wet), `wet ground ${METHANE.wet}`);
  ok(isGreen(METHANE.bolt) && isGreen(METHANE.flash) && isGreen(hexRGB(METHANE.flame)), 'lightning and boost flames should be green');
  ok(METHANE.wet.every(v => v > 0.3 && v <= 1), `the tint of wet ground must only tint (${METHANE.wet})`);
});
test('methane: Malastare is about 30 % darker than it was', () => {
  // before 2026-11-23: sun 3.4, sky fill #d8e8c0, ground fill #4a4a2a, horizon #e2cf96, zenith #4f6b5a
  const t = THEMES.malastare, linL = (h: string) => { const c = hexRGB(h).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const was = { sun: 3.4, sky: linL('#d8e8c0'), ground: linL('#4a4a2a'), hor: linL('#e2cf96'), top: linL('#4f6b5a') };
  const r = { sun: t.sunIntensity / was.sun, sky: linL(t.hemiSky) / was.sky, ground: linL(t.hemiGround) / was.ground, hor: linL(t.skyHorizon) / was.hor, top: linL(t.skyTop) / was.top };
  for (const [k, v] of Object.entries(r)) ok(v > 0.6 && v < 0.8, `${k}: ${(v * 100).toFixed(0)} % of the light it had – expected about 70 % (60 … 80)`);
  ok(Math.abs(t.exposure - 1) < 1e-9, `the exposure must not make up for it (${t.exposure})`);
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
