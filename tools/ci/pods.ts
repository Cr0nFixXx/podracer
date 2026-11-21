// Headless pod audit (no browser, no GPU): part of `npm run check`.
// Builds every pod exactly the way the game does (src/game/podAssembly.ts, material-free) and checks:
//   1. mesh + triangle counts against the golden numbers in pods-baseline.json (measured on the real models in the browser)
//   2. every geometry: required attributes, no NaN, index range – a bucket with mismatching attributes would vanish in the merge
//   3. the visible pod against the physics shapes (podCollision / podEnvelope): how far it sticks out sideways or hangs below the ground clamp
//   4. the physics shapes themselves against pods-shapes.json: the handling of an existing pod must not move by accident
// Env: POD=<id> only that pod · UPDATE=1 prints fresh baseline rows instead of comparing.
import * as THREE from 'three';
import fs from 'node:fs';
import { PILOTS, PODS, STAT_KEYS, type PodDef } from '../../src/game/data';
import { tuneTiers, NO_KIT, type KitSpec } from '../../src/game/podKitParts';
import { podCollision, podEnvelope } from '../../src/game/podDesigns';
import { assembleHero, assembleRival, segFor } from '../../src/game/podAssembly';
import BASE from './pods-baseline.json';
import SHAPES from './pods-shapes.json';

/** How far the visible model may exceed the physics shapes (metres). Calibrated on the Session 19 pods: worst case + 5 cm
 *  (wide: Tyr Vespa's blade wings 0.50 · engines: Splitter-X 0.02 · no cockpit hangs below its ground clamp). */
const TOL = { wide: 0.55, lowEngine: 0.07, lowCockpit: 0, /** how much wider than the factory pod kit parts may make it when that is already past `wide` */ kit: 0.12 };
/** Triangle / draw budgets. Old pods are measured against their Session 19 numbers (`budgetRef` in pods-baseline.json):
 *  the player pod may grow 20 % below Ultra, a near Gegner must not grow at all. New pods and Ultra have absolute caps. */
const BUDGET = { playerGrow: 1.2, newPlayerHigh: 70000, newRivalNear: 26000, ultraPlayer: 250000, ultraPlayerDraws: 110, ultraRival: 100000, rivalDraws: 60, far: 1100 };
const ONLY = process.env.POD, UPDATE = !!process.env.UPDATE;
let failed = 0;
const fail = (msg: string) => { failed++; console.log('  FAIL ' + msg); };
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

function checkGeo(g: THREE.BufferGeometry, where: string, need: string[]) {
  for (const a of need) if (!g.attributes[a]) fail(`${where}: attribute "${a}" missing`);
  const p = g.attributes.position;
  if (!p || p.count === 0) { fail(`${where}: empty geometry`); return; }
  for (const name of ['position', 'normal']) {
    const at = g.attributes[name]; if (!at) continue; const a = at.array as Float32Array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { fail(`${where}: NaN in ${name}`); break; }
  }
  if (g.index) {
    const ia = g.index.array; let mx = 0; for (let i = 0; i < ia.length; i++) if (ia[i] > mx) mx = ia[i];
    if (mx >= p.count) fail(`${where}: index ${mx} out of range (${p.count} vertices)`);
    if (ia.length % 3) fail(`${where}: index count ${ia.length} is not a multiple of 3`);
  }
}

class Tally {
  meshes = 0; tris = 0; box = new THREE.Box3();
  private tmp = new THREE.Box3();
  /** `off` = where the mesh sits (body space); `solid` parts count for the bounds, flames / energy binders do not. */
  add(g: THREE.BufferGeometry, where: string, need: string[], off?: THREE.Vector3, solid = true) {
    this.meshes++; this.tris += tris(g); checkGeo(g, where, need);
    if (!solid) return;
    if (!g.boundingBox) g.computeBoundingBox();
    this.tmp.copy(g.boundingBox!); if (off) this.tmp.translate(off);
    this.box.union(this.tmp);
  }
}

const BUCKET = ['position', 'normal', 'uv', 'aLiv'];
const V = (a: THREE.Vector3, b?: THREE.Vector3, z = 0) => { const v = a.clone(); if (b) v.add(b); v.z += z; return v; };

function hero(def: PodDef, quality: number, kit: KitSpec = NO_KIT) {
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const a = assembleHero(def, segFor(quality, false), pilot.head, kit);
  const all = new Tally(), bank: Record<string, Tally> = { L: new Tally(), R: new Tally() }, ck = new Tally();
  const w = `${def.id} hero q${quality}`;
  for (const b of a.banks) {
    const t = bank[b.side < 0 ? 'L' : 'R'];
    const both = (g: THREE.BufferGeometry, where: string, need: string[], off: THREE.Vector3, solid = true) => { all.add(g, where, need, off, solid); t.add(g, where, need, off, solid); };
    for (const [k, g] of b.buckets) both(g, `${w} bank ${b.side} ${k}`, BUCKET, b.pivot);
    for (const e of b.engines) {
      const o = V(b.pivot, e.off);
      both(e.geo.fan, `${w} fan`, ['position', 'normal'], V(o, undefined, e.geo.fanZ));
      both(e.geo.petals, `${w} petals`, ['position', 'normal', 'aPet'], o);
      for (const f of e.flaps) both(f.geo, `${w} flap`, BUCKET, b.pivot); // (bank space)
      both(e.geo.flameOuter, `${w} flame`, ['position', 'aLiv'], o, false);
      both(e.geo.flameCore, `${w} flame core`, ['position', 'aLiv'], o, false);
    }
  }
  for (const [k, g] of a.cockpit) { all.add(g, `${w} cockpit ${k}`, BUCKET); ck.add(g, `${w} cockpit ${k}`, BUCKET); }
  if (a.lamps) all.add(a.lamps, `${w} dash lamps`, ['position', 'normal', 'color'], undefined, false);
  for (const [k, start] of a.pilotStart) { const g = a.cockpit.get(k); if (!g || start > (g.index ? g.index.count : g.attributes.position.count)) fail(`${w}: pilot range of bucket "${k}" is outside the geometry`); }
  if (!(a.viewScale >= 1.4 && a.viewScale <= 3.2)) fail(`${w}: cockpit view scale ${a.viewScale} out of range`);
  all.add(a.cables, `${w} cables`, ['position', 'normal', 'uv', 'aLiv'], undefined, false);
  for (const g of a.binders) all.add(g, `${w} binder`, ['position', 'uv'], undefined, false);
  for (const g of a.owned) g.dispose();
  return { meshes: all.meshes, tris: Math.round(all.tris), bodyZ: a.bodyZ, L: bank.L.box, R: bank.R.box, ck: ck.box };
}

function rival(def: PodDef, quality: number, kit: KitSpec = NO_KIT) {
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const a = assembleRival(def, segFor(quality, true), pilot.head, def.colors, 1, kit);
  const near = new Tally(), far = new Tally(); const w = `${def.id} rival q${quality}`;
  for (const b of a.banks) {
    for (const [k, g] of b.buckets) near.add(g, `${w} bank ${b.side} ${k}`, k === 'hull' || k === 'glow' ? [...BUCKET, 'color'] : BUCKET, b.pivot);
    if (b.petals) near.add(b.petals, `${w} petals`, ['position', 'normal', 'aPet'], b.pivot);
    for (const r of b.rotors) near.add(r.geo, `${w} rotor`, BUCKET, V(b.pivot, r.pos));
    if (b.flames) near.add(b.flames, `${w} flames`, ['position', 'aLiv', 'color'], b.pivot, false);
  }
  for (const [k, g] of a.cockpit) near.add(g, `${w} cockpit ${k}`, k === 'hull' || k === 'glow' ? [...BUCKET, 'color'] : BUCKET);
  for (const b of a.binders) near.add(b.geo, `${w} binder`, ['position', 'uv', 'color'], undefined, false);
  far.add(a.far.hull, `${w} far hull`, ['position', 'normal', 'color']); far.add(a.far.dark, `${w} far dark`, ['position', 'normal']); far.add(a.far.glow, `${w} far glow`, ['position', 'color']);
  for (const g of a.owned) g.dispose();
  return { near: { meshes: near.meshes, tris: Math.round(near.tris) }, far: { meshes: far.meshes, tris: Math.round(far.tris) } };
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
/** The numbers physics works with (collision circles: x, z, r, side · envelope sides: x, outerX, frontZ, backZ, minY · cockpit: z, minY). */
function shapeOf(def: PodDef) {
  const c = podCollision(def), e = podEnvelope(def);
  const side = (s: typeof e.engL) => [r6(s.x), r6(s.outerX), r6(s.frontZ), r6(s.backZ), r6(s.minY)];
  return { halfW: r6(c.halfW), circles: c.circles.map(q => [r6(q.x), r6(q.z), r6(q.r), q.side]), engL: side(e.engL), engR: side(e.engR), cockpit: [r6(e.cockpit.z), r6(e.cockpit.minY)] };
}

console.log('pod        hero q1        hero q2        hero q3      rival q2      rival q3     far     wide   lowL   lowR   lowCk  result');
const fresh: (string | number)[][] = [], shapes: string[] = [], kitNote: string[] = [];
for (const def of PODS) {
  if (ONLY && def.id !== ONLY) continue;
  const before = failed;
  const h = [1, 2, 3].map(q => hero(def, q)), n2 = rival(def, 2), n3 = rival(def, 3);
  const row = [def.id, ...h.flatMap(x => [x.meshes, x.tris]), n2.near.meshes, n2.near.tris, n3.near.meshes, n3.near.tris, n2.far.meshes, n2.far.tris];
  fresh.push(row);
  const gold = (BASE.rows as (string | number)[][]).find(r => r[0] === def.id);
  if (!UPDATE) {
    if (!gold) fail(`${def.id}: no baseline row (run with UPDATE=1 and add it on purpose)`);
    else for (let i = 1; i < row.length; i++) if (row[i] !== gold[i]) fail(`${def.id}: ${BASE.columns[i]} = ${row[i]}, baseline ${gold[i]}`);
  }
  // budgets (HANDOFF "Session 20"): below Ultra a pod must not cost more than before the overhaul, Ultra targets a gaming PC
  const ref = (BASE.budgetRef.rows as (string | number)[][]).find(r => r[0] === def.id) as number[] | undefined; // Session 19 numbers
  const over = (what: string, v: number, lim: number) => { if (v > lim) fail(`${def.id}: ${what} = ${v}, budget ${Math.round(lim)}`); };
  if (ref) { over('player triangles on "Niedrig"', h[0].tris, ref[2] * BUDGET.playerGrow); over('player triangles on "Hoch"', h[1].tris, ref[4] * BUDGET.playerGrow); over('Gegner (near) triangles below Ultra', n2.near.tris, ref[8]); }
  else { over('player triangles on "Hoch"', h[1].tris, BUDGET.newPlayerHigh); over('Gegner (near) triangles below Ultra', n2.near.tris, BUDGET.newRivalNear); }
  over('player triangles on Ultra', h[2].tris, BUDGET.ultraPlayer); over('player draws on Ultra', h[2].meshes, BUDGET.ultraPlayerDraws);
  over('Gegner (near) triangles on Ultra', n3.near.tris, BUDGET.ultraRival); over('Gegner (near) draws', Math.max(n2.near.meshes, n3.near.meshes), BUDGET.rivalDraws);
  over('far LOD triangles', n2.far.tris, BUDGET.far); over('far LOD draws', n2.far.meshes, 3);
  // physics shapes vs their golden numbers
  const shape = shapeOf(def); shapes.push(`    ${JSON.stringify(def.id)}: ${JSON.stringify(shape)}`);
  if (!UPDATE && JSON.stringify(shape) !== JSON.stringify((SHAPES as Record<string, unknown>)[def.id]))
    fail(`${def.id}: collision circles / ground-clamp envelope differ from tools/ci/pods-shapes.json (an existing pod must keep its physics size)`);
  // visible model vs physics shapes (hero, quality 3 = the most detailed build)
  const hq = h[2], env = podEnvelope(def), halfW = podCollision(def).halfW;
  const wide = Math.max(-hq.L.min.x, hq.R.max.x, -hq.ck.min.x, hq.ck.max.x) - halfW;              // > 0: wider than the collision shape
  const lowL = env.engL.minY - hq.L.min.y, lowR = env.engR.minY - hq.R.min.y, lowCk = env.cockpit.minY - hq.ck.min.y; // > 0: hangs below the ground clamp
  if (wide > TOL.wide) fail(`${def.id}: ${wide.toFixed(2)} m wider than its collision shape (limit ${TOL.wide})`);
  if (lowL > TOL.lowEngine || lowR > TOL.lowEngine) fail(`${def.id}: engines hang ${Math.max(lowL, lowR).toFixed(2)} m below the ground clamp (limit ${TOL.lowEngine})`);
  if (lowCk > TOL.lowCockpit) fail(`${def.id}: cockpit hangs ${lowCk.toFixed(2)} m below the ground clamp (limit ${TOL.lowCockpit})`);
  // Tuning-Teile + Style-Teile (Phase 4): every Style-Teil choice with all tuning at tier 1 / tier 2 must build, stay inside the same
  // tolerances round the physics shapes and inside the Ultra budget; a Gegner with Style-Teile must not cost more than before the overhaul.
  let kitTris = 0, kitMeshes = 0, kitWide = -9, kitLow = -9, kitRival = 0;
  for (const [ci, tier] of [[1, 1], [2, 2], [3, 2]] as const) {
    const kit: KitSpec = { fins: ci, intake: ci, nozzle: ci, tune: tuneTiers(Object.fromEntries(STAT_KEYS.map(k => [k, tier * 2]))) };
    const k = hero(def, 3, kit), kr = rival(def, 2, { ...kit, tune: NO_KIT.tune });
    kitTris = Math.max(kitTris, k.tris); kitMeshes = Math.max(kitMeshes, k.meshes); kitRival = Math.max(kitRival, kr.near.tris);
    kitWide = Math.max(kitWide, Math.max(-k.L.min.x, k.R.max.x, -k.ck.min.x, k.ck.max.x) - halfW);
    kitLow = Math.max(kitLow, env.engL.minY - k.L.min.y, env.engR.minY - k.R.min.y);
    over(`player triangles on Ultra with kit ${ci}`, k.tris, BUDGET.ultraPlayer); over(`player draws on Ultra with kit ${ci}`, k.meshes, BUDGET.ultraPlayerDraws);
    over(`Gegner (near) triangles below Ultra with Style-Teile ${ci}`, kr.near.tris, ref ? ref[8] : BUDGET.newRivalNear);
  }
  if (kitWide > Math.max(TOL.wide, wide + TOL.kit)) fail(`${def.id}: with kit ${kitWide.toFixed(2)} m wider than its collision shape (factory ${wide.toFixed(2)}, kit may add ${TOL.kit})`);
  if (kitLow > TOL.lowEngine) fail(`${def.id}: kit parts hang ${kitLow.toFixed(2)} m below the ground clamp (limit ${TOL.lowEngine})`);
  kitNote.push(`${def.id.padEnd(9)} kit: player Ultra up to ${String(kitMeshes).padStart(3)} meshes (+${kitMeshes - hq.meshes}) / ${String(kitTris).padStart(6)} (+${kitTris - hq.tris}) · Gegner with Style-Teile up to ${String(kitRival).padStart(5)} · wide ${kitWide.toFixed(2)} · low ${kitLow.toFixed(2)}`);
  const c = (m: number, t: number) => `${String(m).padStart(3)}/${String(t).padStart(6)}`;
  const f = (v: number) => v.toFixed(2).padStart(6);
  console.log(`${def.id.padEnd(9)} ${c(h[0].meshes, h[0].tris)}     ${c(h[1].meshes, h[1].tris)}     ${c(h[2].meshes, h[2].tris)}    ${c(n2.near.meshes, n2.near.tris)}    ${c(n3.near.meshes, n3.near.tris)}  ${c(n2.far.meshes, n2.far.tris).trim().padStart(6)} ${f(wide)} ${f(lowL)} ${f(lowR)} ${f(lowCk)}  ${failed > before ? 'FAIL' : 'ok'}`);
}
if (UPDATE) console.log('\npods-baseline.json rows:\n' + fresh.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n\npods-shapes.json:\n{\n' + shapes.join(',\n') + '\n  }');
console.log(''); for (const l of kitNote) console.log(l);
if (process.env.UPDATE === 'write' && !ONLY) { // take the fresh numbers over (deliberate step: say why in HANDOFF.md)
  const file = 'tools/ci/pods-baseline.json', j = JSON.parse(fs.readFileSync(file, 'utf8'));
  j.rows = fresh; j.measured = process.env.NOTE ?? j.measured;
  const head = JSON.stringify({ ...j, rows: 0, budgetRef: 0 }, null, 2).replace(/\n\}$/, '');
  const list = (rows: unknown[][]) => '[\n' + rows.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n  ]';
  fs.writeFileSync(file, head.replace('"rows": 0', '"rows": ' + list(j.rows)).replace('"budgetRef": 0', '"budgetRef": { "note": ' + JSON.stringify(j.budgetRef.note) + ', "rows": ' + list(j.budgetRef.rows) + ' }') + '\n}\n');
  fs.writeFileSync('tools/ci/pods-shapes.json', '{\n' + shapes.join(',\n') + '\n  }\n');
  console.log(`\nwrote ${file} and tools/ci/pods-shapes.json`);
}
console.log(failed ? `\n${failed} pod audit failure(s).` : '\nAll pods passed the audit (meshes/triangles per build; wide/low = metres outside the physics shape).');
process.exit(failed ? 1 : 0);
