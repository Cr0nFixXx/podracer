import * as THREE from 'three';
import { PILOTS, type PodDef } from './data';
import { assembleHero, assembleRival, segFor, visibleIndices, type BreakShow, type PartRange } from './podAssembly';
import { damageModel } from './podDamage';
import { tuneTiers, type KitSpec } from './podKitParts';
import type { StatKey } from './data';
import { LAMP_VERTS } from './podCockpits';
import {
  binderMaterial, cableFlexMaterial, flameMaterial, hullMaterial, podSharedTime,
  sharedOpponentBinderMaterial, sharedOpponentFlameMaterial, sharedOpponentHullMaterial,
  sharedPodMaterials, skinMaterial, suitMaterial, canopyGlass, type FxU, type HullU, petalMaterial, HIT_MARKS } from './podMaterials';

export interface PodVisual {
  group: THREE.Group;
  body: THREE.Group;
  /** Left [0] & right [1] articulated engine assemblies (dynamically heave & pitch when steering!) */
  engines: THREE.Object3D[];
  /** exhaust exits in body-local space (with side tag: x < 0 = left, x > 0 = right) */
  exhaustLocal: THREE.Vector3[];
  eye: THREE.Vector3;
  hood: THREE.Vector3;
  update: (t: number, throttle: number, boost: number, airbrake: number, dmgL: number, dmgR: number, heat: number) => void;
  /** Applies dynamic left/right engine vertical heave & pitch (moves engines, binder & control cables seamlessly!) */
  setEngineMotion: (yL: number, yR: number, pitchL: number, pitchR: number, rollBank: number) => void;
  /** Switches automatic distance LOD & shadow casting on opponent pods (use forceAll=true for shader warmup) */
  setDistance: (dist: number, forceAll?: boolean) => void;
  /** hero pod: cockpit pendulum offset in body space (cables follow) */
  setCockpitSway?: (x: number, y: number, z: number) => void;
  /** hero pod: `true` = cockpit camera. The pilot's body is hidden and the cockpit is enlarged about his eye, so the dashboard,
   *  frame and his hands stay in view although they sit inside the camera's 0.8 m near plane (the picture is unchanged). */
  setCockpitView?: (inside: boolean) => void;
  /** hero pod: world position of the pilot's eye (rides with the cockpit pendulum) */
  eyeWorld?: (out: THREE.Vector3) => THREE.Vector3;
  /** Shows the pod without its lost Bruchteile (bit i = part i of the racer's Schadensmodell is gone, `PodState.parts`): their
   *  triangles are cut out of the draw, their engines flame out, their rotor loses a blade, their energy arc dies. 0 = intact. */
  setParts: (mask: number) => void;
  /** engines that have flamed out (same order as `exhaustLocal`) */
  engineOut: boolean[];
  /** world position of the place where Bruchteil `i` sat (debris and sparks start there) */
  partWorld: (i: number, out: THREE.Vector3) => THREE.Vector3;
  /** hero pod: leaves a Treffermarke (burn + bare metal) on the hull nearest to the world point of a hit; `strength` = impact speed */
  hitMark?: (x: number, y: number, z: number, strength: number) => void;
  /** hero pod: wipes all Treffermarken (respawn) */
  clearMarks?: () => void;
  dispose: () => void;
}

const SHADOW_KEYS = new Set<string>(['hull', 'steel', 'dark', 'chrome', 'carbon']);
/** pseudo Bruchteil id of the pilot's body in the cockpit meshes (hidden by the cockpit camera) */
const PILOT = '#pilot';
const OPP_SHADOW_KEYS = new Set<string>(['hull', 'steel', 'dark']);
/** Graphics setting "Gegner-Pod-Detail": scales the distance at which rival pods switch from the detailed to the merged far model. */
let podLodScale = 1;
export function setPodLodScale(v: number) { podLodScale = Math.max(0.3, Math.min(4, v)); }

// Single shared vertex-coloured glow & far-hull materials for ALL opponents (zero per-pod material clones!)
let sharedOppGlow: THREE.MeshBasicMaterial | null = null;
let sharedOppFarHull: THREE.MeshStandardMaterial | null = null;
function getOppGlow() { return sharedOppGlow ?? (sharedOppGlow = new THREE.MeshBasicMaterial({ vertexColors: true })); }
function getOppFarHull() { return sharedOppFarHull ?? (sharedOppFarHull = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.48, roughness: 0.34 })); }

/** Cuts lost Bruchteile (or the pilot) out of one mesh without an extra draw: the index buffer of its geometry is rewritten from a
 *  pristine copy, leaving out the hidden runs. The geometry must be owned by this model (merged buckets are). */
class Hider {
  private full: Uint16Array | Uint32Array; private hidden = new Set<string>(); private ids: Set<string>;
  constructor(private mesh: THREE.Mesh, private ranges: PartRange[]) {
    this.full = (mesh.geometry.index!.array as Uint16Array | Uint32Array).slice(); this.ids = new Set(ranges.map(r => r.id));
  }
  /** true when the mesh has to be rebuilt */
  set(id: string, off: boolean) { if (!this.ids.has(id) || this.hidden.has(id) === off) return false; if (off) this.hidden.add(id); else this.hidden.delete(id); return true; }
  apply() {
    const idx = this.mesh.geometry.index!, n = visibleIndices(this.full, this.ranges, this.hidden, idx.array as Uint16Array | Uint32Array);
    idx.needsUpdate = true; this.mesh.geometry.setDrawRange(0, n); this.mesh.visible = n > 0;
  }
}
/** the runs of all Bruchteile that lie in bucket `key` of `where` */
function rangesIn(breaks: Map<string, BreakShow>, where: 'cockpit' | number, key: string) {
  const out: PartRange[] = [];
  for (const [id, s] of breaks) for (const r of s.ranges) if (r.where === where && r.key === key) out.push({ id, start: r.start, count: r.count });
  return out;
}
/** Shared part of `setParts` for both kinds of model: walks the Bruchteile whose state changed and calls `each(id, lost, show)`. */
function partsSwitch(podId: string, breaks: Map<string, BreakShow>, hiders: Hider[], each: (id: string, lost: boolean, s: BreakShow) => void) {
  const parts = damageModel(podId).parts; let now = 0;
  return (mask: number) => {
    if (mask === now) return;
    const changed = mask ^ now; now = mask; const dirty = new Set<Hider>();
    for (let i = 0; i < parts.length; i++) {
      if (!((changed >> i) & 1)) continue;
      const id = parts[i].id, lost = !!((mask >> i) & 1), s = breaks.get(id); if (!s) continue;
      for (const h of hiders) if (h.set(id, lost)) dirty.add(h);
      each(id, lost, s);
    }
    for (const h of dirty) h.apply();
  };
}

/** Geometry comes from podAssembly.ts (material-free, audited in CI); this file adds materials, meshes and animation. */
/** Look options of a pod model: paint pattern / finish, Style-Teile (`kit`, 0 = Werk per slot) and the tuning steps whose parts show (`tune`). */
export interface PodLook { pattern?: number; finish?: number; kit?: { fins?: number; intake?: number; nozzle?: number; canopy?: number }; tune?: Partial<Record<StatKey, number>> }
export function buildPodModel(def: PodDef, colors: [string, string, string], quality = 2, texRes = 1024, isOpponent = false, opts?: PodLook): PodVisual {
  const seg = segFor(quality, isOpponent);
  const texSize = texRes >= 2048 && !isOpponent ? 2048 : 1024;
  const fin = opts?.finish ?? 0;
  const kit: KitSpec = { fins: opts?.kit?.fins ?? 0, intake: opts?.kit?.intake ?? 0, nozzle: opts?.kit?.nozzle ?? 0, tune: tuneTiers(opts?.tune) };
  // the canopy tint is a Style-Teil too: one of four shared glass materials (same shader, no extra pipeline)
  const shared: Record<string, THREE.Material> = { ...(sharedPodMaterials(texSize) as Record<string, THREE.Material>), glass: canopyGlass(opts?.kit?.canopy ?? 0) };
  const glowCol = new THREE.Color(colors[2]);
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const suit = suitMaterial(pilot.color), skin = skinMaterial(pilot.skin);

  const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);

  // ==================== SHARED-PIPELINE, ARTICULATED 2-LOD OPPONENT POD ====================
  if (isOpponent) {
    const A = assembleRival(def, seg, pilot.head, colors, opts?.pattern, kit);
    body.position.z = A.bodyZ;
    const oppHull = sharedOpponentHullMaterial(1024);
    const oppFlame = sharedOpponentFlameMaterial();
    const oppBinder = sharedOpponentBinderMaterial();
    const oppGlow = getOppGlow();
    const shadowMeshes: THREE.Mesh[] = [];
    const engines: THREE.Object3D[] = [];

    const nearGrp = new THREE.Group(); body.add(nearGrp);
    const hiders: Hider[] = []; // meshes that carry Bruchteile
    const sootMeshes: { m: THREE.Mesh; where: 'cockpit' | number }[] = []; // hull meshes: soot per mesh (userData.scorch)
    const plumes: { m: THREE.Mesh; side: number }[] = [];                  // one merged plume mesh per engine side (userData.power)
    const addBuckets = (buckets: Map<string, THREE.BufferGeometry>, parent: THREE.Object3D, where: 'cockpit' | number) => {
      for (const [k, mg] of buckets) {
        const mat = k === 'hull' ? oppHull : k === 'glow' ? oppGlow : k === 'suit' ? suit : k === 'skin' ? skin : shared[k];
        if (!mat) continue;
        const m = new THREE.Mesh(mg, mat);
        const fx = k === 'glow' || k === 'glass';
        const cast = OPP_SHADOW_KEYS.has(k);
        m.castShadow = cast; m.receiveShadow = !fx;
        if (cast) shadowMeshes.push(m);
        if (k === 'glass') m.renderOrder = 1;
        if (k === 'hull') { m.userData.scorch = 0; sootMeshes.push({ m, where }); } // (the shared hull material reads it – every mesh on it must define it)
        parent.add(m);
        const rg = rangesIn(A.breaks, where, k); if (rg.length) hiders.push(new Hider(m, rg));
      }
    };

    // Articulated Left & Right engine groups pivoted at each bank's true 3D centroid!
    const oppPetals: THREE.Mesh[] = []; let oppOpen = 0;
    const oppRotors: { m: THREE.Mesh; spin: number; engine: number; geo: THREE.BufferGeometry; lost?: THREE.BufferGeometry }[] = []; // open rotors turn on Gegner pods too (shared material, own mesh)
    const oppPivots: THREE.Vector3[] = [];
    A.banks.forEach((bank, bi) => {
      oppPivots.push(bank.pivot);
      const grp = new THREE.Group(); grp.position.copy(bank.pivot); nearGrp.add(grp); engines.push(grp);
      addBuckets(bank.buckets, grp, bi);
      for (const r of bank.rotors) { const rm = new THREE.Mesh(r.geo, shared[r.mat] ?? shared.dark); rm.position.copy(r.pos); rm.castShadow = false; rm.receiveShadow = true; grp.add(rm); oppRotors.push({ m: rm, spin: r.spin, engine: r.engine, geo: r.geo, lost: r.lost }); }
      if (bank.petals) { const pm = new THREE.Mesh(bank.petals, petalMaterial()); pm.userData.open = 0; grp.add(pm); oppPetals.push(pm); }
      if (bank.flames) {
        const fm = new THREE.Mesh(bank.flames, oppFlame); fm.renderOrder = 2; fm.userData.power = 1; grp.add(fm); plumes.push({ m: fm, side: bank.side });
        const rg: PartRange[] = []; for (const [id, sh] of A.breaks) for (const f of sh.flames) if (f.bank === bi) rg.push({ id, start: f.start, count: f.count }); // plumes of engines that can flame out
        if (rg.length) hiders.push(new Hider(fm, rg));
      }
    });
    // Cockpit + cables + extras
    addBuckets(A.cockpit, nearGrp, 'cockpit');
    const spanX = A.spanX;
    const binderMeshes: { m: THREE.Mesh; y: number }[] = [];
    A.binders.forEach((b, bi) => {
      const bm = new THREE.Mesh(b.geo, oppBinder); bm.position.y = b.baseY; bm.renderOrder = 3; nearGrp.add(bm); binderMeshes.push({ m: bm, y: b.baseY });
      const rg: PartRange[] = []; for (const [id, sh] of A.breaks) for (const a of sh.arcs) if (a.binder === bi) rg.push({ id, start: a.start, count: a.count }); // arcs that can die
      if (rg.length) hiders.push(new Hider(bm, rg));
    });

    // Far LOD (> 48 m): 3 shared-material draws
    const farGrp = new THREE.Group(); farGrp.visible = false; body.add(farGrp);
    const fhM = new THREE.Mesh(A.far.hull, getOppFarHull()); fhM.receiveShadow = true; farGrp.add(fhM);
    farGrp.add(new THREE.Mesh(A.far.dark, shared.dark));
    farGrp.add(new THREE.Mesh(A.far.glow, oppGlow));

    const setDistance = (d: number, forceAll = false) => {
      if (forceAll) { nearGrp.visible = true; farGrp.visible = true; return; }
      const useNear = d < 48 * podLodScale;
      nearGrp.visible = useNear;
      farGrp.visible = !useNear && d < 520 * Math.max(1, podLodScale);
      const wantSh = d < 78 * Math.min(2, podLodScale);
      if (useNear) for (let i = 0; i < shadowMeshes.length; i++) shadowMeshes[i].castShadow = wantSh;
      else fhM.castShadow = wantSh;
    };
    const setEngineMotion = (yL: number, yR: number, pitchL: number, pitchR: number, rollBank: number) => {
      if (!nearGrp.visible) return;
      if (engines[0]) { engines[0].position.y = oppPivots[0].y + yL; engines[0].rotation.set(pitchL, 0, rollBank * 0.22); }
      if (engines[1]) { engines[1].position.y = oppPivots[1].y + yR; engines[1].rotation.set(pitchR, 0, rollBank * 0.22); }
      for (const b of binderMeshes) { b.m.position.y = b.y + (yL + yR) * 0.5; b.m.rotation.z = Math.atan2(yR - yL, spanX); }
    };
    // rivals: nozzle petals open with boost (shared material, per-mesh userData). `dmgL` / `dmgR` are HEALTH fractions like on the player pod.
    const update = (t: number, throttle = 0, boost = 0, _airbrake = 0, dmgL = 1, dmgR = 1) => {
      podSharedTime.value = t; oppOpen += (boost - oppOpen) * 0.14;
      if (nearGrp.visible) { // damage look: soot per engine side, weaker and sputtering plumes below 35 % / 15 % health
        const hpMin = Math.min(dmgL, dmgR);
        for (let i = 0; i < sootMeshes.length; i++) { const s = sootMeshes[i]; s.m.userData.scorch = s.where === 'cockpit' ? Math.min(0.6, (1 - hpMin) * 0.6) : Math.min(1, (1 - (A.banks[s.where].side < 0 ? dmgL : dmgR)) * 1.1); }
        for (let i = 0; i < plumes.length; i++) { const hp = plumes[i].side < 0 ? dmgL : dmgR; plumes[i].m.userData.power = (hp < 0.35 ? 0.55 + 0.45 * hp / 0.35 : 1) * (hp < 0.15 ? 0.35 + 0.55 * Math.abs(Math.sin(t * (41 + i * 6))) : 1); }
      }
      const o = 0.1 * throttle + 0.9 * oppOpen; for (let i = 0; i < oppPetals.length; i++) oppPetals[i].userData.open = o;
      if (oppRotors.length && nearGrp.visible) { const ang = t * (16 + throttle * 42); for (let i = 0; i < oppRotors.length; i++) oppRotors[i].m.rotation.z = ang * oppRotors[i].spin + i * 0.7; }
    };
    // Bruchteile: geometry is cut out of the shared-material meshes (no extra draws, no extra pipelines); a rotor swaps to its damaged twin
    const engineOut = A.layout.engines.map(() => false);
    const setParts = partsSwitch(def.id, A.breaks, hiders, (_id, lost, sh) => {
      for (const e of sh.engines) engineOut[e] = lost;
      for (const e of sh.fans) for (const r of oppRotors) if (r.engine === e && r.lost) r.m.geometry = lost ? r.lost : r.geo;
    });
    const partWorld = (i: number, out: THREE.Vector3) => { const sh = A.breaks.get(damageModel(def.id).parts[i]?.id ?? ''); return body.localToWorld(sh ? out.copy(sh.center) : out.set(0, 0, 0)); };
    const dispose = () => { A.owned.forEach(g => g.dispose()); };
    return { group, body, engines, exhaustLocal: A.exhaustLocal, eye: A.eye, hood: A.hood, update, setEngineMotion, setDistance, setParts, engineOut, partWorld, dispose };
  }

  // ==================== FULL HERO PLAYER / HANGAR POD ====================
  const A = assembleHero(def, seg, pilot.head, kit);
  body.position.z = A.bodyZ;
  const liv = opts?.pattern !== undefined && opts.pattern >= 0 ? opts.pattern : A.layout.livery;
  const hullL = hullMaterial(colors[0], colors[1], colors[2], liv, texSize, fin);
  const hullR = hullMaterial(colors[0], colors[1], colors[2], liv, texSize, fin);
  const hullC = hullMaterial(colors[0], colors[1], colors[2], liv, texSize, fin); // cockpit: own instance (no engine heat glow)
  const ckGrp = new THREE.Group(); // cockpit hangs on its cables and sways (setCockpitSway)
  const glow = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.2) });
  const flameL = flameMaterial(glowCol, false), coreL = flameMaterial(glowCol, true);
  const flameR = flameMaterial(glowCol, false), coreR = flameMaterial(glowCol, true);
  const cabMat = cableFlexMaterial();
  const cabLift = cabMat.userData.uLift as { value: THREE.Vector2 }; const cabCk = cabMat.userData.uCk as { value: THREE.Vector3 };
  const own: THREE.Material[] = [hullL, hullR, hullC, glow, flameL, coreL, flameR, coreR, cabMat];
  const matFor = (k: string, hull: THREE.Material) => (k === 'hull' ? hull : k === 'glow' ? glow : k === 'suit' ? suit : k === 'skin' ? skin : shared[k]);

  const hiders: Hider[] = []; // meshes that carry Bruchteile or the pilot
  const addMeshes = (parts: Map<string, THREE.BufferGeometry>, parent: THREE.Object3D, hull: THREE.Material, where: 'cockpit' | number) => {
    const made: { k: string; m: THREE.Mesh }[] = [];
    for (const [k, g] of parts) {
      const mat = matFor(k, hull); if (!mat) continue;
      const m = new THREE.Mesh(g, mat); const fx = k === 'glow' || k === 'glass';
      m.castShadow = !fx && SHADOW_KEYS.has(k); m.receiveShadow = !fx;
      if (k === 'glass') m.renderOrder = 1; parent.add(m); made.push({ k, m });
      const rg = rangesIn(A.breaks, where, k);
      if (where === 'cockpit') { const start = A.pilotStart.get(k); if (start !== undefined && g.index && start < g.index.count) rg.push({ id: PILOT, start, count: g.index.count - start }); } // the pilot's triangles are the last ones
      if (rg.length) hiders.push(new Hider(m, rg));
    }
    return made;
  };

  const engines: THREE.Object3D[] = [];
  const fans: THREE.Mesh[] = []; const fanGeo: { fan: THREE.BufferGeometry; lost?: THREE.BufferGeometry }[] = [];
  const flaps: { m: THREE.Mesh; sign: number; side: number; gain: number }[] = []; const petals: THREE.Mesh[] = [];
  const flames: { m: THREE.Mesh; side: number; engine: number }[] = [];
  /** engines that have flamed out (Bruchteile of the multi-engine racers) */
  const engineOut = A.layout.engines.map(() => false);
  const hc = new THREE.Color(), hot = new THREE.Color('#ff5a1a');

  const heroPivots: THREE.Vector3[] = [];
  A.banks.forEach((bank, bi) => {
    const side = bank.side;
    heroPivots.push(bank.pivot);
    const engGrp = new THREE.Group(); engGrp.position.copy(bank.pivot); body.add(engGrp); engines.push(engGrp);
    const hull = side < 0 ? hullL : hullR;
    for (const { index, off, geo: eg, flaps: egFlaps } of bank.engines) {
      const fan = new THREE.Mesh(eg.fan, shared[eg.fanMat ?? 'dark'] ?? shared.dark); fan.position.set(off.x, off.y, off.z + eg.fanZ);
      fan.castShadow = !!eg.openRotor; fan.receiveShadow = !!eg.openRotor; fan.userData.spin = eg.fanSpin ?? 1; fan.userData.engine = index; engGrp.add(fan); fans.push(fan); fanGeo[index] = { fan: eg.fan, lost: eg.fanLost }; // a big open rotor throws a shadow, an enclosed fan does not
      { const pm = new THREE.Mesh(eg.petals, petalMaterial()); pm.position.copy(off); pm.userData.open = 0; pm.castShadow = false; engGrp.add(pm); petals.push(pm); }
      for (const f of egFlaps) { const m = new THREE.Mesh(f.geo, hull); m.position.set(off.x + f.pivot.x, off.y + f.pivot.y, off.z + f.pivot.z); m.castShadow = false; m.receiveShadow = true; engGrp.add(m); flaps.push({ m, sign: f.sign, side, gain: f.gain ?? 1 }); }
      for (const core of [false, true]) {
        const m = new THREE.Mesh(core ? eg.flameCore : eg.flameOuter, side < 0 ? (core ? coreL : flameL) : (core ? coreR : flameR));
        m.position.set(off.x, off.y, off.z + eg.flameZ); m.renderOrder = 2; engGrp.add(m); flames.push({ m, side, engine: index });
      }
    }
    addMeshes(bank.buckets, engGrp, hull, bi);
  });

  // Cockpit + cockpit-mounted extras + GPU-flexing control cables. `ckView` carries the enlargement of the cockpit camera.
  const ckView = new THREE.Group(); ckGrp.add(ckView); body.add(ckGrp);
  const ckMeshes = addMeshes(A.cockpit, ckView, hullC, 'cockpit');
  // three live dash lamps (boost · heat · damage): one small vertex-coloured mesh
  let lampCol: THREE.BufferAttribute | null = null; const lampNow = new Float32Array(9).fill(-1);
  if (A.lamps) { const lm = new THREE.Mesh(A.lamps, getOppGlow()); ckView.add(lm); lampCol = A.lamps.attributes.color as THREE.BufferAttribute; }
  const setLamp = (i: number, r: number, g: number, b: number) => {
    if (!lampCol || (lampNow[i * 3] === r && lampNow[i * 3 + 1] === g && lampNow[i * 3 + 2] === b)) return;
    lampNow[i * 3] = r; lampNow[i * 3 + 1] = g; lampNow[i * 3 + 2] = b;
    for (let v = i * LAMP_VERTS; v < (i + 1) * LAMP_VERTS; v++) lampCol.setXYZ(v, r, g, b);
    lampCol.needsUpdate = true;
  };
  const cabMesh = new THREE.Mesh(A.cables, cabMat); cabMesh.castShadow = false; cabMesh.receiveShadow = true; body.add(cabMesh);

  let binderU: FxU | null = null; const binderSwap = false;
  if (A.binders.length) { // one material, one mesh per binder (X on the Quadra Lumber)
    const bMat = binderMaterial(glowCol); own.push(bMat); binderU = bMat.userData.u as FxU;
    A.binders.forEach((g, bi) => {
      const bm = new THREE.Mesh(g, bMat); bm.renderOrder = 3; body.add(bm);
      const rg: PartRange[] = []; for (const [id, sh] of A.breaks) for (const a of sh.arcs) if (a.binder === bi) rg.push({ id, start: a.start, count: a.count }); // arcs that can die
      if (rg.length) hiders.push(new Hider(bm, rg));
    });
  }
  const setCockpitSway = (x: number, y: number, z: number) => { ckGrp.position.set(x, y, z); ckGrp.rotation.z = -x * 0.14; ckGrp.rotation.x = z * 0.07; cabCk.value.set(x, y, z); };
  let inside = false;
  const setCockpitView = (on: boolean) => {
    if (on === inside) return; inside = on;
    const kS = on ? A.viewScale : 1;
    ckView.scale.setScalar(kS); ckView.position.copy(A.eye).multiplyScalar(1 - kS); // p → eye + k·(p − eye)
    for (const h of hiders) if (h.set(PILOT, on)) h.apply(); // the pilot is cut out of the cockpit meshes like a lost part
    for (const { k, m } of ckMeshes) if (SHADOW_KEYS.has(k)) m.castShadow = !on; // the enlarged cockpit must not throw an enlarged shadow
  };
  const eyeWorld = (out: THREE.Vector3) => ckGrp.localToWorld(out.copy(A.eye));

  const setEngineMotion = (yL: number, yR: number, pitchL: number, pitchR: number, rollBank: number) => {
    if (engines[0]) { engines[0].position.y = heroPivots[0].y + yL; engines[0].rotation.set(pitchL, 0, rollBank * 0.22); }
    if (engines[1]) { engines[1].position.y = heroPivots[1].y + yR; engines[1].rotation.set(pitchR, 0, rollBank * 0.22); }
    cabLift.value.set(yL, yR);
    if (binderU?.uLift) binderU.uLift.value.set(binderSwap ? yR : yL, binderSwap ? yL : yR);
  };

  let boostK = 0, flapT = 0, glowH = 0;
  const update = (t: number, throttle: number, boost: number, airbrake: number, dmgL: number, dmgR: number, heat: number) => {
    podSharedTime.value = t;
    const fl = 0.35 + throttle * 0.75 + boost * 0.8;
    const spL = dmgL < 0.15 ? 0.35 + 0.55 * Math.abs(Math.sin(t * 41)) : 1;
    const spR = dmgR < 0.15 ? 0.35 + 0.55 * Math.abs(Math.sin(t * 47 + 1)) : 1;
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i]; const sp = f.side < 0 ? spL : spR; const w = 1 + boost * 0.24;
      f.m.visible = !engineOut[f.engine]; // a flamed-out engine has no plume
      f.m.scale.set(w, w, Math.max(0.05, fl * (0.92 + 0.1 * Math.sin(t * 53 + i * 2.1)) * sp));
    }
    hc.copy(glowCol).lerp(hot, Math.min(1, Math.max(0, heat - 0.6) * 2.5));
    const pw = 0.55 + throttle * 0.45 + boost * 0.5;
    for (const [m, sp] of [[flameL, spL], [coreL, spL], [flameR, spR], [coreR, spR]] as [THREE.Material, number][]) {
      const u = m.userData.u as FxU; u.uTime.value = t; u.uColor.value.copy(hc); u.uPower.value = pw * sp;
    }
    glow.color.copy(hc).multiplyScalar(1.1 + boost * 0.3);
    const fanAng = t * (16 + throttle * 42);
    for (let i = 0; i < fans.length; i++) if (!engineOut[fans[i].userData.engine as number]) fans[i].rotation.z = fanAng * (fans[i].userData.spin as number) + i * 0.7; // (a dead engine's fan stands still)
    // Session 13: on a badly damaged pod the air-brake flaps rattle loose in the airstream
    // (dmgL / dmgR are HEALTH fractions: 1 = intact – the first version read them as damage and rattled on every healthy pod)
    // Per-engine battle damage: below 55 % HP on an engine, THAT engine's cowling flaps bend ajar, twist & shudder in the airstream!
    const dmgFL = Math.max(0, 0.55 - dmgL) / 0.55, dmgFR = Math.max(0, 0.55 - dmgR) / 0.55;
    const dtF = Math.max(0, Math.min(0.1, t - flapT)); flapT = t;
    boostK += (boost - boostK) * Math.min(1, dtF * (boost > boostK ? 9 : 4));
    const open = 0.1 * throttle + 0.9 * boostK * (1 + 0.04 * Math.sin(t * 43));
    for (let i = 0; i < petals.length; i++) petals[i].userData.open = open;
    for (let i = 0; i < flaps.length; i++) {
      const flp = flaps[i], df = flp.side < 0 ? dmgFL : dmgFR;
      flp.m.rotation.y = flp.sign * (airbrake * 1.05 * flp.gain + (df > 0 ? (0.18 + 0.14 * Math.sin(t * 39 + i * 2.1)) * df : 0));
      flp.m.rotation.z = df > 0.25 ? flp.sign * (df - 0.25) * 0.34 : 0; // bent hinge droop when badly damaged
    }
    // The hull glow lags the heat value (metal warms up slowly and stays hot for a while) – a readable overheating indicator
    glowH += (heat - glowH) * Math.min(1, dtF * (heat > glowH ? 1.5 : 0.55));
    const uL = hullL.userData.u as HullU, uR = hullR.userData.u as HullU, uC = hullC.userData.u as HullU;
    uL.uScorch.value = Math.min(1, (1 - dmgL) * 1.1 + Math.max(0, heat - 0.75) * 0.8); uL.uHeat.value = glowH; uL.uWear.value = 0.28 + (1 - dmgL) * 0.35;
    uR.uScorch.value = Math.min(1, (1 - dmgR) * 1.1 + Math.max(0, heat - 0.75) * 0.8); uR.uHeat.value = glowH; uR.uWear.value = 0.28 + (1 - dmgR) * 0.35;
    uC.uScorch.value = Math.min(0.6, (1 - Math.min(dmgL, dmgR)) * 0.6); uC.uWear.value = 0.28 + (1 - Math.min(dmgL, dmgR)) * 0.3;
    if (binderU) {
      binderU.uTime.value = t; binderU.uColor.value.copy(hc);
      binderU.uPower.value = (0.55 + throttle * 0.35 + boost * 0.6) * Math.min(1, Math.min(dmgL, dmgR) * 3);
    }
    // dash lamps: boost (cyan while boosting) · heat (green → amber → red, blinks near the limit) · damage (worse engine side)
    const blink = Math.sin(t * 14) > 0 ? 1 : 0.25, hpMin = Math.min(dmgL, dmgR);
    if (boostK > 0.08) setLamp(0, 0.2, 1.9, 2.6); else setLamp(0, 0.02, 0.12, 0.2);
    if (heat > 0.85) setLamp(1, 2.6 * blink, 0.16 * blink, 0.05); else if (heat > 0.55) setLamp(1, 2.2, 1.1, 0.08); else setLamp(1, 0.12, 1.3, 0.25);
    if (hpMin < 0.3) setLamp(2, 2.6 * blink, 0.14 * blink, 0.06); else if (hpMin < 0.6) setLamp(2, 2.2, 1.1, 0.08); else setLamp(2, 0.12, 1.3, 0.25);
  };
  // Bruchteile: geometry is cut out of its meshes (no extra draws), engines flame out, a rotor swaps to its damaged twin, arcs die
  const setParts = partsSwitch(def.id, A.breaks, hiders, (_id, lost, sh) => {
    for (const e of sh.engines) engineOut[e] = lost;
    for (const e of sh.fans) { const fg = fanGeo[e], fm = fans.find(f => f.userData.engine === e); if (fg?.lost && fm) fm.geometry = lost ? fg.lost : fg.fan; }
  });
  const partWorld = (i: number, out: THREE.Vector3) => { const sh = A.breaks.get(damageModel(def.id).parts[i]?.id ?? ''); return body.localToWorld(sh ? out.copy(sh.center) : out.set(0, 0, 0)); };
  // Treffermarken: each of the three hull materials (left bank, right bank, cockpit) remembers its last HIT_MARKS hits
  const hulls = [hullL, hullR, hullC].map(h => (h.userData.u as HullU).uHits), hitNext = [0, 0, 0], hv = new THREE.Vector3();
  const mark = (hull: number, x: number, y: number, z: number, k: number) => { hulls[hull][hitNext[hull]++ % HIT_MARKS].value.set(x, y, z, k); };
  const hitMark = (wx: number, wy: number, wz: number, strength: number) => {
    const k = Math.max(0.4, Math.min(1, strength / 28)), ck = A.layout.cockpit;
    body.worldToLocal(hv.set(wx, wy, wz)); // body space (engines at rest – near enough for a mark)
    const side = Math.abs(hv.x) < 0.4;   // a hit without a side (ceiling, landing, portal lip): the mark goes on top of an engine
    if (!side && hv.z < ck.z + ck.len * 0.5 + 0.5 && Math.abs(hv.x) < ck.hw + 1.4) { // on the cockpit: pulled onto its skin
      mark(2, Math.max(-ck.hw, Math.min(ck.hw, hv.x)), ck.y + Math.max(-0.5, Math.min(0.4, hv.y - ck.y)) * ck.hw, Math.max(ck.z - ck.len * 0.5, Math.min(ck.z + ck.len * 0.5, hv.z)), k);
      return;
    }
    const bi = A.banks.length < 2 ? 0 : (side ? Math.random() < 0.5 : hv.x > 0) ? 1 : 0, bank = A.banks[bi];
    let best = bank.engines[0], bd = Infinity; // the engine of that bank whose axis is nearest to the hit
    for (const e of bank.engines) { const d = Math.hypot(hv.x - bank.pivot.x - e.off.x, hv.y - bank.pivot.y - e.off.y); if (d < bd) { bd = d; best = e; } }
    const R = best.geo.R, hl = best.geo.L * 0.5;
    let dx = hv.x - bank.pivot.x - best.off.x, dy = hv.y - bank.pivot.y - best.off.y; const dl = Math.hypot(dx, dy);
    if (side || dl < 1e-3) { dx = 0; dy = R; } else { dx *= R / dl; dy *= R / dl; } // onto the barrel, on the side the hit came from
    const z = side ? (Math.random() * 1.2 - 0.3) * hl : Math.max(-hl * 0.8, Math.min(hl * 0.95, hv.z - bank.pivot.z - best.off.z));
    mark(bank.side < 0 ? 0 : 1, best.off.x + dx, best.off.y + dy, best.off.z + z, k);
  };
  const clearMarks = () => { for (const h of hulls) for (const u of h) u.value.set(0, 0, 0, 0); };
  const dispose = () => { own.forEach(m => m.dispose()); A.owned.forEach(g => g.dispose()); };
  return { group, body, engines, exhaustLocal: A.exhaustLocal, eye: A.eye, hood: A.hood, update, setEngineMotion, setDistance: () => {}, setCockpitSway, setCockpitView, eyeWorld, setParts, engineOut, partWorld, hitMark, clearMarks, dispose };
}
