// Material-free assembly of a pod: which geometry ends up in which draw – for the player model and for rivals.
// podModel.ts turns the result into meshes + materials; tools/ci/pods.ts audits it headless.
// Keep this file free of three/webgpu, TSL and DOM imports (it is bundled into the node CI).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PilotHead, PodDef } from './data';
import { M4, PartBuilder, cyl, lathe, prof, rbox, tube, torus } from './podKit';
import { engineExtent, engineGeo, type EngineGeo } from './podParts';
import { cockpitGeo } from './podCockpits';
import { podLayout, type PodLayout } from './podLayouts';

const BINDER_PTS = 18;

/** Tessellation of a pod build: rivals 14 / 18 segments, the player pod 20 / 28 / 40 (graphics setting "Geometrie" 1..3). */
export function segFor(quality: number, isOpponent: boolean) { return isOpponent ? (quality >= 3 ? 18 : 14) : (quality >= 3 ? 40 : quality === 2 ? 28 : 20); }

type Lists = Map<string, THREE.BufferGeometry[]>;
function push(lists: Lists, k: string, g: THREE.BufferGeometry) { let l = lists.get(k); if (!l) { l = []; lists.set(k, l); } l.push(g); }
/** Merges every bucket into one geometry (= one draw). A bucket whose parts carry different attributes cannot be merged – that is a bug, not a skip. */
function mergeAll(lists: Lists, owned: THREE.BufferGeometry[], where: string, each?: (k: string, g: THREE.BufferGeometry) => void) {
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [k, list] of lists) {
    const mg = mergeGeometries(list, false); list.forEach(x => x.dispose());
    if (!mg) throw new Error(`pod assembly: bucket "${k}" of ${where} could not be merged (parts with different vertex attributes)`);
    each?.(k, mg);
    mg.computeBoundingSphere(); out.set(k, mg); owned.push(mg);
  }
  return out;
}

/** Build flexible control cables tagged with `aLiv = (isRight, tEngine, 0)` so they follow moving engine pylons on GPU! */
function buildFlexCables(L: PodLayout, seg: number, anchors: [THREE.Vector3, THREE.Vector3]) {
  const cp = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z);
  const up = new THREE.Vector3(0, 1, 0);
  const list: THREE.BufferGeometry[] = [];
  const tagFlex = (g: THREE.BufferGeometry, isR: number, pA: THREE.Vector3, pB: THREE.Vector3) => {
    const p = g.attributes.position; const n = p.count;
    const liv = new Float32Array(n * 3);
    const dz = pA.z - pB.z || 1;
    for (let i = 0; i < n; i++) {
      const w = Math.max(0, Math.min(1, (p.getZ(i) - pB.z) / dz));
      liv[i * 3] = isR; liv[i * 3 + 1] = w; liv[i * 3 + 2] = 0;
    }
    g.setAttribute('aLiv', new THREE.BufferAttribute(liv, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    list.push(g);
  };
  for (const em of L.engines) {
    const eg = engineGeo(em.spec, seg);
    const isR = em.x >= 0 ? 1 : 0;
    const a = eg.pylon.clone().add(new THREE.Vector3(em.x, em.y, em.z)); // engine pylon on top of the nacelle (rigid with the engine)
    const b = anchors[isR].clone().add(cp);                               // cockpit anchor (w=0)
    // Session 14: the old cable ran in a straight sagging line from the cockpit to the pylon at 58 % of the engine length – straight
    // THROUGH the rear half of the nacelle. It is now routed around it: free-hanging span to a saddle just above/behind the rear rim,
    // then clipped along the top of the nacelle to the pylon (that part moves rigidly with the engine).
    const rearZ = eg.exhaustZ + 0.12 * eg.L, topY = Math.max(eg.top, engineExtent(em.spec).top) + 0.14;
    const v1 = new THREE.Vector3(em.x, em.y + topY + 0.1, em.z + rearZ - 0.3);
    const v2 = new THREE.Vector3(em.x, em.y + topY, em.z + rearZ + (eg.pylon.z - rearZ) * 0.5);
    const dist = v1.distanceTo(b); const sag = 0.3 + dist * 0.03;
    for (const [r, off, s, rad] of [[0.055, 0, 1, 6], [0.024, 0.12, 1.18, 4]] as [number, number, number, number][]) {
      const pts: THREE.Vector3[] = []; const ox = off * (isR ? -1 : 1);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8; const p = b.clone().lerp(v1, t);
        p.y -= sag * s * 4 * t * (1 - t) * (1 - 0.35 * t); // sag eases out towards the saddle so the cable clears the rear rim
        p.x += ox * Math.sin(t * Math.PI * 0.5);
        pts.push(p);
      }
      pts.push(v1.clone().lerp(v2, 0.5).add(new THREE.Vector3(ox, 0, 0)), v2.clone().add(new THREE.Vector3(ox, 0, 0)), a.clone().add(new THREE.Vector3(ox * 0.5, 0.03, 0)));
      tagFlex(tube(pts, r, Math.max(16, Math.round(seg * 0.8)), rad), isR, v1, b);
    }
    for (const [p, q] of [[a, v2], [b, v1]] as [THREE.Vector3, THREE.Vector3][]) {
      const dir = q.clone().sub(p).normalize();
      const fg = cyl(0.085, 0.07, 0.24, 7);
      fg.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(dir, 0.12), new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1)));
      tagFlex(fg, isR, v1, b);
    }
    for (const sp of [v1, v2]) { const cl = torus(0.085, 0.022, 5, 8); cl.rotateY(Math.PI / 2); cl.translate(sp.x, sp.y - 0.02, sp.z); tagFlex(cl, isR, v1, b); } // cable clips on the nacelle
  }
  const mg = mergeGeometries(list, false)!; list.forEach(x => x.dispose());
  mg.computeBoundingSphere(); mg.boundingSphere!.radius += 1.2;
  return mg;
}

/** Evaluate livery paint colour on CPU for opponent hull vertices so ALL rivals share 1 GPU shader pipeline! */
export function bakeHullVertexColors(g: THREE.BufferGeometry, c1Hex: string, c2Hex: string, livery: number) {
  const c1 = new THREE.Color(c1Hex), c2 = new THREE.Color(c2Hex);
  const liv = g.attributes.aLiv as THREE.BufferAttribute | undefined;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const band = (x: number, cc: number, w: number) => Math.abs(x - cc) < w ? 1 : 0;
  const fr = (x: number) => x - Math.floor(x);
  const lv = ((livery % 6) + 6) % 6;
  for (let i = 0; i < n; i++) {
    let m = 0;
    if (liv) {
      const c = liv.getX(i), a = liv.getY(i), z = liv.getZ(i);
      const cd = Math.min(c, 1 - c);
      if (z > 2.5) m = 1;
      else if (z >= 0.5 && z < 1.5) {
        if (lv === 0) m = Math.max(band(cd, 0, 0.06), band(a, 0.8, 0.035));
        else if (lv === 1) m = Math.max(band(cd, 0.055, 0.02), band(cd, 0, 0.014), a >= 0.86 ? 1 : 0);
        else if (lv === 2) m = (a >= 0.14 && cd < 0.12 + Math.abs(fr(a * 5) - 0.5) * 0.16) ? 1 : 0;
        else if (lv === 3) m = Math.max(band(a, 0.25, 0.042), band(a, 0.7, 0.042), (a >= 0.3 && a <= 0.65) ? band(Math.abs(cd - 0.25), 0, 0.03) : 0);
        else if (lv === 4) { const ch = fr(a * 3.5 - cd * 1.8); m = ((a >= 0.12 && a <= 0.9 && ch > 0.6 && ch < 0.88) || a >= 0.91) ? 1 : 0; }
        else { const chk = (a >= 0.56 && a <= 0.86 && ((fr(cd * 8) >= 0.5) !== (fr(a * 9) >= 0.5))) ? 1 : 0; m = Math.max(chk, band(cd, 0, 0.045)); }
      } else if (z >= 1.5) {
        const ck0 = Math.max(band(Math.abs(cd - 0.25 + (a - 0.5) * 0.12), 0, a * 0.02 + 0.035), a >= 0.9 ? 1 : 0);
        m = lv === 4 ? Math.max(ck0, band(fr(a * 3 - cd * 1.5), 0.5, 0.16)) : lv === 5 ? Math.max(ck0, band(cd, 0.035, 0.016), band(cd, 0.085, 0.01)) : lv >= 2 ? Math.max(ck0, band(cd, 0, 0.05)) : ck0;
      }
    }
    col[i * 3] = c1.r + (c2.r - c1.r) * m;
    col[i * 3 + 1] = c1.g + (c2.g - c1.g) * m;
    col[i * 3 + 2] = c1.b + (c2.b - c1.b) * m;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function bakeSolidColor(g: THREE.BufferGeometry, col: THREE.Color) {
  const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function makeBinderGeo(a: THREE.Vector3, b: THREE.Vector3, vertCol?: THREE.Color) {
  const pos = new Float32Array(BINDER_PTS * 4 * 3), uv = new Float32Array(BINDER_PTS * 4 * 2);
  const idx: number[] = []; const w = 0.4; const tmp = new THREE.Vector3(); // wide ribbon = room for several fine arcs
  for (let i = 0; i < BINDER_PTS; i++) {
    const f = i / (BINDER_PTS - 1); tmp.copy(a).lerp(b, f);
    for (let k = 0; k < 4; k++) { uv[(i * 4 + k) * 2] = f; uv[(i * 4 + k) * 2 + 1] = k % 2 === 0 ? 1 : 0; }
    const o = i * 12;
    pos[o] = tmp.x; pos[o + 1] = tmp.y + w; pos[o + 2] = tmp.z;
    pos[o + 3] = tmp.x; pos[o + 4] = tmp.y - w; pos[o + 5] = tmp.z;
    pos[o + 6] = tmp.x; pos[o + 7] = tmp.y; pos[o + 8] = tmp.z + w;
    pos[o + 9] = tmp.x; pos[o + 10] = tmp.y; pos[o + 11] = tmp.z - w;
    if (i < BINDER_PTS - 1) for (const off of [0, 2]) { const p = i * 4 + off, q = p + 4; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  if (vertCol) bakeSolidColor(geo, vertCol);
  geo.computeBoundingSphere(); geo.boundingSphere!.radius += 1.4;
  return geo;
}

const oppFarCache = new Map<string, { hull: THREE.BufferGeometry; dark: THREE.BufferGeometry; glow: THREE.BufferGeometry }>();
function buildOpponentFarGeo(def: PodDef, L: PodLayout) {
  const hit = oppFarCache.get(def.id); if (hit) return hit;
  const pb = new PartBuilder();
  const cp = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z);
  for (const em of L.engines) {
    const { L: len, R } = em.spec;
    pb.add('hull', lathe(prof([[R * 0.72, -len * 0.5, 1], [R, -len * 0.35], [R, len * 0.42], [R * 0.88, len * 0.5, 1]]), 9, 1), M4.t(em.x, em.y, em.z));
    pb.add('dark', new THREE.CircleGeometry(R * 0.84, 9), M4.t(em.x, em.y, em.z + len * 0.49));
    pb.add('glow', new THREE.ConeGeometry(R * 0.46, len * 0.55, 7, 1, true).rotateX(-Math.PI / 2), M4.t(em.x, em.y, em.z - len * 0.75));
    const a = new THREE.Vector3(em.x, em.y + R, em.z), b = cp.clone();
    pb.add('dark', tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.4, 0)), b], 0.055, 5, 4));
  }
  const c = L.cockpit;
  pb.add('hull', rbox(c.hw * 1.7, c.hw * 0.82, c.len, 0.14, 1), M4.t(0, c.y, c.z), [0, 0.5, 2]);
  pb.add('dark', rbox(c.hw * 0.9, c.hw * 0.45, c.len * 0.42, 0.05, 1), M4.t(0, c.y + c.hw * 0.42, c.z));
  const b0 = L.binders[0];
  if (b0) {
    const A = L.engines[b0.a], B = L.engines[b0.b];
    pb.add('glow', rbox(Math.abs(B.x - A.x), 0.18, 0.18, 0.02), M4.t((A.x + B.x) * 0.5, (A.y + B.y) * 0.5 + 0.2, (A.z + B.z) * 0.5));
  }
  const built = pb.build();
  const out = { hull: built.get('hull')!, dark: built.get('dark')!, glow: built.get('glow')! };
  oppFarCache.set(def.id, out);
  return out;
}

// ------------------------------------------------------------------ shared base
interface Base {
  layout: PodLayout;
  /** body.position.z of the model: the pod origin sits between cockpit and engines */
  bodyZ: number;
  /** exhaust exits in body-local space (x < 0 = left, x > 0 = right) */
  exhaustLocal: THREE.Vector3[];
  eye: THREE.Vector3; hood: THREE.Vector3;
}
function base(def: PodDef, seg: number, head: PilotHead) {
  const L = podLayout(def);
  const exhaustLocal: THREE.Vector3[] = [];
  let frontZ = -Infinity, topY = 0, sumY = 0;
  for (const em of L.engines) {
    const eg = engineGeo(em.spec, seg);
    exhaustLocal.push(new THREE.Vector3(em.x, em.y, em.z + eg.exhaustZ));
    frontZ = Math.max(frontZ, em.z + eg.frontZ); topY = Math.max(topY, em.y + eg.R); sumY += em.y;
  }
  const ck = cockpitGeo(L, seg, head);
  const eye = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z).add(ck.info.head).add(new THREE.Vector3(0, 0.24, 0.32));
  const hood = new THREE.Vector3(0, sumY / Math.max(1, L.engines.length) + topY * 0.35 + 0.35, frontZ - 1.2);
  // pod extras: built fresh per model (the callers merge or dispose them)
  const build = (fn?: (pb: PartBuilder, L: PodLayout) => void) => { const pb = new PartBuilder(); fn?.(pb, L); return pb.build() as Map<string, THREE.BufferGeometry>; };
  const b: Base = { layout: L, bodyZ: -L.cockpit.z * 0.25, exhaustLocal, eye, hood };
  return { b, ck, engineExtras: build(L.engineExtras), cockpitExtras: build(L.cockpitExtras) };
}
const sideOf = (x: number): -1 | 1 => (x < 0 ? -1 : 1);
/** Both ends of an energy binder in body space, left-hand engine first (the player binder material lifts end A with uLift.x). */
function binderEnds(L: PodLayout, seg: number, link: { a: number; b: number; zOff?: number }) {
  let A = L.engines[link.a], B = L.engines[link.b]; if (A.x > B.x) { const t = A; A = B; B = t; }
  const ea = engineGeo(A.spec, seg), eb = engineGeo(B.spec, seg), z = link.zOff ?? 0;
  return { A, B, ea, eb, ax: A.x + ea.binder.x, ay: A.y + ea.binder.y, az: A.z + ea.binder.z + z, bx: B.x - eb.binder.x, by: B.y + eb.binder.y, bz: B.z + eb.binder.z + z };
}

// ------------------------------------------------------------------ player / hangar pod
export interface EnginePart { /** index into layout.engines */ index: number; /** position relative to the bank pivot */ off: THREE.Vector3; geo: EngineGeo }
export interface HeroBank { side: -1 | 1; /** 3D centroid of this side's engines (body space) */ pivot: THREE.Vector3; engines: EnginePart[]; /** merged static parts of all engines of this side (+ engine-mounted extras), relative to the pivot */ buckets: Map<string, THREE.BufferGeometry> }
export interface HeroAssembly extends Base {
  /** left bank first, then right */
  banks: HeroBank[];
  /** cockpit + cockpit-mounted extras (body space) */
  cockpit: Map<string, THREE.BufferGeometry>;
  /** GPU-flexing control cables (aLiv = isRight, weight, 0) */
  cables: THREE.BufferGeometry;
  /** one ribbon per energy binder */
  binders: THREE.BufferGeometry[];
  /** geometries created for this model (dispose with it); cached engine / cockpit geometry is never listed */
  owned: THREE.BufferGeometry[];
}

export function assembleHero(def: PodDef, seg: number, head: PilotHead): HeroAssembly {
  const { b, ck, engineExtras, cockpitExtras } = base(def, seg, head); const L = b.layout; const owned: THREE.BufferGeometry[] = [];
  const banks: HeroBank[] = [];
  for (const side of [-1, 1] as const) {
    const mounts = L.engines.map((em, index) => ({ em, index })).filter(m => sideOf(m.em.x) === side);
    if (!mounts.length) continue;
    // Pivot each engine bank around its true 3D center of mass so pitch & roll stay crisp and balanced!
    const piv = new THREE.Vector3();
    for (const { em } of mounts) { piv.x += em.x; piv.y += em.y; piv.z += em.z; }
    piv.divideScalar(mounts.length);
    const lists: Lists = new Map(); const engines: EnginePart[] = [];
    for (const { em, index } of mounts) {
      const off = new THREE.Vector3(em.x - piv.x, em.y - piv.y, em.z - piv.z);
      const eg = engineGeo(em.spec, seg); const emM = M4.t(off.x, off.y, off.z);
      for (const [k, g] of eg.parts) { const gc = g.clone(); gc.applyMatrix4(emM); push(lists, k, gc); }
      engines.push({ index, off, geo: eg });
    }
    { // engine-mounted extras (wings, struts …) ride with the engine bank of their side: split by triangle centroid
      const shift = M4.t(-piv.x, -piv.y, -piv.z);
      for (const [k, eg] of engineExtras) {
        const idx = eg.index!.array; const pos = eg.attributes.position;
        const keep: number[] = [];
        for (let t = 0; t < idx.length; t += 3) {
          const cx = (pos.getX(idx[t]) + pos.getX(idx[t + 1]) + pos.getX(idx[t + 2])) / 3;
          if (sideOf(cx) === side) keep.push(idx[t], idx[t + 1], idx[t + 2]);
        }
        if (keep.length) { const sub = eg.clone(); sub.setIndex(keep); sub.applyMatrix4(shift); push(lists, k, sub); }
      }
    }
    banks.push({ side, pivot: piv, engines, buckets: mergeAll(lists, owned, `${def.id} engine bank ${side}`) });
  }
  for (const g of engineExtras.values()) g.dispose();
  // Cockpit + cockpit-mounted extras
  const lists: Lists = new Map(); const ckM = M4.t(0, L.cockpit.y, L.cockpit.z);
  for (const [k, g] of ck.parts) { const gc = g.clone(); gc.applyMatrix4(ckM); push(lists, k, gc); }
  for (const [k, g] of cockpitExtras) push(lists, k, g);
  const cockpit = mergeAll(lists, owned, `${def.id} cockpit`);
  const cables = buildFlexCables(L, seg, ck.info.anchors); owned.push(cables);
  const binders: THREE.BufferGeometry[] = [];
  for (const link of L.binders) { // one mesh per binder (X on the Quadra Lumber)
    const e = binderEnds(L, seg, link);
    const g = makeBinderGeo(new THREE.Vector3(e.ax, e.ay, e.az), new THREE.Vector3(e.bx, e.by, e.bz));
    binders.push(g); owned.push(g);
  }
  return { ...b, banks, cockpit, cables, binders, owned };
}

// ------------------------------------------------------------------ rival pod (shared pipelines: paint + glow are baked into vertex colours)
export interface RivalBank { side: -1 | 1; pivot: THREE.Vector3; /** merged engines of this side incl. fans + flaps (static) */ buckets: Map<string, THREE.BufferGeometry>; petals: THREE.BufferGeometry | null; flames: THREE.BufferGeometry | null }
export interface RivalAssembly extends Base {
  /** always two entries: left, right */
  banks: RivalBank[];
  /** cockpit + all extras + static cables (body space) */
  cockpit: Map<string, THREE.BufferGeometry>;
  binders: { geo: THREE.BufferGeometry; baseY: number }[];
  /** x distance between the binder ends (for the binder tilt when the engines heave) */
  spanX: number;
  /** far LOD (> 48 m): 3 draws */
  far: { hull: THREE.BufferGeometry; dark: THREE.BufferGeometry; glow: THREE.BufferGeometry };
  owned: THREE.BufferGeometry[];
}

/** `pattern`: livery pattern 0..5; undefined / negative = the pod's factory pattern. */
export function assembleRival(def: PodDef, seg: number, head: PilotHead, colors: [string, string, string], pattern?: number): RivalAssembly {
  const { b, ck, engineExtras, cockpitExtras } = base(def, seg, head); const L = b.layout; const owned: THREE.BufferGeometry[] = [];
  const liv = pattern !== undefined && pattern >= 0 ? pattern : L.livery;
  const glowCol = new THREE.Color(colors[2]), glowBoost = glowCol.clone().multiplyScalar(1.2);
  const bake = (k: string, mg: THREE.BufferGeometry) => { if (k === 'hull') bakeHullVertexColors(mg, colors[0], colors[1], liv); else if (k === 'glow') bakeSolidColor(mg, glowBoost); };
  const pushC = (lists: Lists, k: string, g: THREE.BufferGeometry, m?: THREE.Matrix4) => { const c = g.clone(); if (m) c.applyMatrix4(m); push(lists, k, c); };

  // Articulated Left & Right engine groups pivoted at each bank's true 3D centroid!
  const banks: RivalBank[] = [];
  for (const side of [-1, 1] as const) {
    const sideMs = L.engines.filter(e => sideOf(e.x) === side);
    const piv = new THREE.Vector3();
    for (const em of sideMs) { piv.x += em.x; piv.y += em.y; piv.z += em.z; }
    if (sideMs.length) piv.divideScalar(sideMs.length);
    const lists: Lists = new Map(); const fls: THREE.BufferGeometry[] = []; const pts: THREE.BufferGeometry[] = [];
    for (const em of sideMs) {
      const ox = em.x - piv.x, oy = em.y - piv.y, oz = em.z - piv.z;
      const eg = engineGeo(em.spec, seg); const emM = M4.t(ox, oy, oz);
      for (const [k, g] of eg.parts) pushC(lists, k, g, emM);
      pushC(lists, 'dark', eg.fan, M4.t(ox, oy, oz + eg.fanZ));
      for (const f of eg.flaps) pushC(lists, 'hull', f.geo, M4.t(ox + f.pivot.x, oy + f.pivot.y, oz + f.pivot.z));
      const fo = eg.flameOuter.clone(); fo.applyMatrix4(M4.t(ox, oy, oz + eg.flameZ)); fls.push(fo);
      pts.push(eg.petals.clone().translate(ox, oy, oz));
    }
    const buckets = mergeAll(lists, owned, `${def.id} rival bank ${side}`, bake);
    let petals: THREE.BufferGeometry | null = null, flames: THREE.BufferGeometry | null = null;
    if (pts.length) { petals = mergeGeometries(pts, false)!; pts.forEach(x => x.dispose()); owned.push(petals); }
    if (fls.length) { flames = mergeGeometries(fls, false)!; fls.forEach(x => x.dispose()); bakeSolidColor(flames, glowCol); flames.computeBoundingSphere(); owned.push(flames); }
    banks.push({ side, pivot: piv, buckets, petals, flames });
  }
  // Cockpit + cables + extras
  const lists: Lists = new Map();
  const ckM = M4.t(0, L.cockpit.y, L.cockpit.z);
  for (const [k, g] of ck.parts) pushC(lists, k, g, ckM);
  for (const extras of [engineExtras, cockpitExtras]) for (const [k, g] of extras) { pushC(lists, k, g); g.dispose(); } // rivals: all extras are static (merged with the cockpit)
  const cp = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z);
  const cabPB = new PartBuilder();
  for (const em of L.engines) {
    const eg = engineGeo(em.spec, seg);
    const a = eg.pylon.clone().add(new THREE.Vector3(em.x, em.y, em.z));
    const anc = ck.info.anchors[em.x < 0 ? 0 : 1].clone().add(cp);
    const mid = a.clone().lerp(anc, 0.5); mid.y -= 0.55;
    cabPB.add('dark', tube([anc, mid, a], 0.055, 8, 5));
  }
  for (const [k, g] of cabPB.build()) { pushC(lists, k, g); g.dispose(); }
  const cockpit = mergeAll(lists, owned, `${def.id} rival cockpit`, bake);

  const binders: { geo: THREE.BufferGeometry; baseY: number }[] = []; let spanX = 4.6;
  for (const link of L.binders) {
    const e = binderEnds(L, seg, link);
    const dyh = (e.by - e.ay) * 0.5; // diagonal binders: the two ends sit at different heights around the mesh origin
    const pa = new THREE.Vector3(e.ax, -dyh, e.az);
    const pb = new THREE.Vector3(e.bx, dyh, e.bz);
    spanX = Math.max(1.5, Math.abs(pb.x - pa.x));
    const baseY = (e.A.y + e.ea.binder.y + e.B.y + e.eb.binder.y) * 0.5;
    const bg = makeBinderGeo(pa, pb, glowCol); owned.push(bg);
    binders.push({ geo: bg, baseY });
  }

  // Far LOD (> 48 m): 3 shared-material draws
  const far0 = buildOpponentFarGeo(def, L);
  const hull = bakeHullVertexColors(far0.hull.clone(), colors[0], colors[1], liv); owned.push(hull);
  const glow = bakeSolidColor(far0.glow.clone(), glowBoost); owned.push(glow);
  return { ...b, banks, cockpit, binders, spanX, far: { hull, dark: far0.dark, glow }, owned };
}
