// Headless pod audit (no browser, no GPU): part of `npm run check`.
// Builds every pod exactly the way the game does (src/game/podAssembly.ts, material-free) and checks:
//   1. mesh + triangle counts against the golden numbers in pods-baseline.json (measured on the real models in the browser)
//   2. every geometry: required attributes, no NaN, index range – a bucket with mismatching attributes would vanish in the merge
//   3. the visible pod against the physics shapes (podCollision / podEnvelope): how far it sticks out sideways or hangs below the ground clamp
// Env: POD=<id> only that pod · UPDATE=1 prints fresh baseline rows instead of comparing.
import * as THREE from 'three';
import { PILOTS, PODS, type PodDef } from '../../src/game/data';
import { podCollision, podEnvelope } from '../../src/game/podDesigns';
import { assembleHero, assembleRival, segFor } from '../../src/game/podAssembly';
import BASE from './pods-baseline.json';

/** How far the visible model may exceed the physics shapes (metres). Calibrated on the Session 19 pods: worst case + 5 cm
 *  (wide: Tyr Vespa's blade wings 0.50 · engines: Splitter-X 0.02 · no cockpit hangs below its ground clamp). */
const TOL = { wide: 0.55, lowEngine: 0.07, lowCockpit: 0 };
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

function hero(def: PodDef, quality: number) {
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const a = assembleHero(def, segFor(quality, false), pilot.species);
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
      for (const f of e.geo.flaps) both(f.geo, `${w} flap`, BUCKET, V(o, f.pivot));
      both(e.geo.flameOuter, `${w} flame`, ['position', 'aLiv'], o, false);
      both(e.geo.flameCore, `${w} flame core`, ['position', 'aLiv'], o, false);
    }
  }
  for (const [k, g] of a.cockpit) { all.add(g, `${w} cockpit ${k}`, BUCKET); ck.add(g, `${w} cockpit ${k}`, BUCKET); }
  all.add(a.cables, `${w} cables`, ['position', 'normal', 'uv', 'aLiv'], undefined, false);
  for (const g of a.binders) all.add(g, `${w} binder`, ['position', 'uv'], undefined, false);
  for (const g of a.owned) g.dispose();
  return { meshes: all.meshes, tris: Math.round(all.tris), bodyZ: a.bodyZ, L: bank.L.box, R: bank.R.box, ck: ck.box };
}

function rival(def: PodDef, quality: number) {
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const a = assembleRival(def, segFor(quality, true), pilot.species, def.colors, 1);
  const near = new Tally(), far = new Tally(); const w = `${def.id} rival q${quality}`;
  for (const b of a.banks) {
    for (const [k, g] of b.buckets) near.add(g, `${w} bank ${b.side} ${k}`, k === 'hull' || k === 'glow' ? [...BUCKET, 'color'] : BUCKET, b.pivot);
    if (b.petals) near.add(b.petals, `${w} petals`, ['position', 'normal', 'aPet'], b.pivot);
    if (b.flames) near.add(b.flames, `${w} flames`, ['position', 'aLiv', 'color'], b.pivot, false);
  }
  for (const [k, g] of a.cockpit) near.add(g, `${w} cockpit ${k}`, k === 'hull' || k === 'glow' ? [...BUCKET, 'color'] : BUCKET);
  for (const b of a.binders) near.add(b.geo, `${w} binder`, ['position', 'uv', 'color'], undefined, false);
  far.add(a.far.hull, `${w} far hull`, ['position', 'normal', 'color']); far.add(a.far.dark, `${w} far dark`, ['position', 'normal']); far.add(a.far.glow, `${w} far glow`, ['position', 'color']);
  for (const g of a.owned) g.dispose();
  return { near: { meshes: near.meshes, tris: Math.round(near.tris) }, far: { meshes: far.meshes, tris: Math.round(far.tris) } };
}

console.log('pod        hero q1        hero q2        hero q3      rival q2      rival q3     far     wide   lowL   lowR   lowCk  result');
const fresh: (string | number)[][] = [];
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
  // visible model vs physics shapes (hero, quality 3 = the most detailed build)
  const hq = h[2], env = podEnvelope(def), halfW = podCollision(def).halfW;
  const wide = Math.max(-hq.L.min.x, hq.R.max.x, -hq.ck.min.x, hq.ck.max.x) - halfW;              // > 0: wider than the collision shape
  const lowL = env.engL.minY - hq.L.min.y, lowR = env.engR.minY - hq.R.min.y, lowCk = env.cockpit.minY - hq.ck.min.y; // > 0: hangs below the ground clamp
  if (wide > TOL.wide) fail(`${def.id}: ${wide.toFixed(2)} m wider than its collision shape (limit ${TOL.wide})`);
  if (lowL > TOL.lowEngine || lowR > TOL.lowEngine) fail(`${def.id}: engines hang ${Math.max(lowL, lowR).toFixed(2)} m below the ground clamp (limit ${TOL.lowEngine})`);
  if (lowCk > TOL.lowCockpit) fail(`${def.id}: cockpit hangs ${lowCk.toFixed(2)} m below the ground clamp (limit ${TOL.lowCockpit})`);
  const c = (m: number, t: number) => `${String(m).padStart(3)}/${String(t).padStart(6)}`;
  const f = (v: number) => v.toFixed(2).padStart(6);
  console.log(`${def.id.padEnd(9)} ${c(h[0].meshes, h[0].tris)}     ${c(h[1].meshes, h[1].tris)}     ${c(h[2].meshes, h[2].tris)}    ${c(n2.near.meshes, n2.near.tris)}    ${c(n3.near.meshes, n3.near.tris)}  ${c(n2.far.meshes, n2.far.tris).trim().padStart(6)} ${f(wide)} ${f(lowL)} ${f(lowR)} ${f(lowCk)}  ${failed > before ? 'FAIL' : 'ok'}`);
}
if (UPDATE) console.log('\nbaseline rows:\n' + fresh.map(r => '    ' + JSON.stringify(r)).join(',\n'));
console.log(failed ? `\n${failed} pod audit failure(s).` : '\nAll pods passed the audit (meshes/triangles per build; wide/low = metres outside the physics shape).');
process.exit(failed ? 1 : 0);
