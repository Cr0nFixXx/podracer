import * as THREE from 'three';
import { PILOTS, type PodDef } from './data';
import { assembleHero, assembleRival, segFor } from './podAssembly';
import { LAMP_VERTS } from './podCockpits';
import {
  binderMaterial, cableFlexMaterial, flameMaterial, hullMaterial, podSharedTime,
  sharedOpponentBinderMaterial, sharedOpponentFlameMaterial, sharedOpponentHullMaterial,
  sharedPodMaterials, skinMaterial, suitMaterial, type FxU, type HullU, petalMaterial } from './podMaterials';

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
  dispose: () => void;
}

const SHADOW_KEYS = new Set<string>(['hull', 'steel', 'dark', 'chrome', 'carbon']);
const OPP_SHADOW_KEYS = new Set<string>(['hull', 'steel', 'dark']);
/** Graphics setting "Gegner-Pod-Detail": scales the distance at which rival pods switch from the detailed to the merged far model. */
let podLodScale = 1;
export function setPodLodScale(v: number) { podLodScale = Math.max(0.3, Math.min(4, v)); }

// Single shared vertex-coloured glow & far-hull materials for ALL opponents (zero per-pod material clones!)
let sharedOppGlow: THREE.MeshBasicMaterial | null = null;
let sharedOppFarHull: THREE.MeshStandardMaterial | null = null;
function getOppGlow() { return sharedOppGlow ?? (sharedOppGlow = new THREE.MeshBasicMaterial({ vertexColors: true })); }
function getOppFarHull() { return sharedOppFarHull ?? (sharedOppFarHull = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.48, roughness: 0.34 })); }

/** Geometry comes from podAssembly.ts (material-free, audited in CI); this file adds materials, meshes and animation. */
export function buildPodModel(def: PodDef, colors: [string, string, string], quality = 2, texRes = 1024, isOpponent = false, opts?: { pattern?: number; finish?: number }): PodVisual {
  const seg = segFor(quality, isOpponent);
  const texSize = texRes >= 2048 && !isOpponent ? 2048 : 1024;
  const fin = opts?.finish ?? 0;
  const shared = sharedPodMaterials(texSize) as Record<string, THREE.Material>;
  const glowCol = new THREE.Color(colors[2]);
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const suit = suitMaterial(pilot.color), skin = skinMaterial(pilot.skin);

  const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);

  // ==================== SHARED-PIPELINE, ARTICULATED 2-LOD OPPONENT POD ====================
  if (isOpponent) {
    const A = assembleRival(def, seg, pilot.head, colors, opts?.pattern);
    body.position.z = A.bodyZ;
    const oppHull = sharedOpponentHullMaterial(1024);
    const oppFlame = sharedOpponentFlameMaterial();
    const oppBinder = sharedOpponentBinderMaterial();
    const oppGlow = getOppGlow();
    const shadowMeshes: THREE.Mesh[] = [];
    const engines: THREE.Object3D[] = [];

    const nearGrp = new THREE.Group(); body.add(nearGrp);
    const addBuckets = (buckets: Map<string, THREE.BufferGeometry>, parent: THREE.Object3D) => {
      for (const [k, mg] of buckets) {
        const mat = k === 'hull' ? oppHull : k === 'glow' ? oppGlow : k === 'suit' ? suit : k === 'skin' ? skin : shared[k];
        if (!mat) continue;
        const m = new THREE.Mesh(mg, mat);
        const fx = k === 'glow' || k === 'glass';
        const cast = OPP_SHADOW_KEYS.has(k);
        m.castShadow = cast; m.receiveShadow = !fx;
        if (cast) shadowMeshes.push(m);
        if (k === 'glass') m.renderOrder = 1;
        parent.add(m);
      }
    };

    // Articulated Left & Right engine groups pivoted at each bank's true 3D centroid!
    const oppPetals: THREE.Mesh[] = []; let oppOpen = 0;
    const oppPivots: THREE.Vector3[] = [];
    for (const bank of A.banks) {
      oppPivots.push(bank.pivot);
      const grp = new THREE.Group(); grp.position.copy(bank.pivot); nearGrp.add(grp); engines.push(grp);
      addBuckets(bank.buckets, grp);
      if (bank.petals) { const pm = new THREE.Mesh(bank.petals, petalMaterial()); pm.userData.open = 0; grp.add(pm); oppPetals.push(pm); }
      if (bank.flames) { const fm = new THREE.Mesh(bank.flames, oppFlame); fm.renderOrder = 2; grp.add(fm); }
    }
    // Cockpit + cables + extras
    addBuckets(A.cockpit, nearGrp);
    const spanX = A.spanX;
    const binderMeshes: { m: THREE.Mesh; y: number }[] = [];
    for (const b of A.binders) { const bm = new THREE.Mesh(b.geo, oppBinder); bm.position.y = b.baseY; bm.renderOrder = 3; nearGrp.add(bm); binderMeshes.push({ m: bm, y: b.baseY }); }

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
    const update = (t: number, throttle = 0, boost = 0) => { // rivals: nozzle petals open with boost (shared material, per-mesh userData)
      podSharedTime.value = t; oppOpen += (boost - oppOpen) * 0.14;
      const o = 0.1 * throttle + 0.9 * oppOpen; for (let i = 0; i < oppPetals.length; i++) oppPetals[i].userData.open = o;
    };
    const dispose = () => { A.owned.forEach(g => g.dispose()); };
    return { group, body, engines, exhaustLocal: A.exhaustLocal, eye: A.eye, hood: A.hood, update, setEngineMotion, setDistance, dispose };
  }

  // ==================== FULL HERO PLAYER / HANGAR POD ====================
  const A = assembleHero(def, seg, pilot.head);
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

  const addMeshes = (parts: Map<string, THREE.BufferGeometry>, parent: THREE.Object3D, hull: THREE.Material) => {
    const made: { k: string; m: THREE.Mesh }[] = [];
    for (const [k, g] of parts) {
      const mat = matFor(k, hull); if (!mat) continue;
      const m = new THREE.Mesh(g, mat); const fx = k === 'glow' || k === 'glass';
      m.castShadow = !fx && SHADOW_KEYS.has(k); m.receiveShadow = !fx;
      if (k === 'glass') m.renderOrder = 1; parent.add(m); made.push({ k, m });
    }
    return made;
  };

  const engines: THREE.Object3D[] = [];
  const fans: THREE.Mesh[] = [];
  const flaps: { m: THREE.Mesh; sign: number; side: number }[] = []; const petals: THREE.Mesh[] = [];
  const flames: { m: THREE.Mesh; side: number }[] = [];
  const hc = new THREE.Color(), hot = new THREE.Color('#ff5a1a');

  const heroPivots: THREE.Vector3[] = [];
  for (const bank of A.banks) {
    const side = bank.side;
    heroPivots.push(bank.pivot);
    const engGrp = new THREE.Group(); engGrp.position.copy(bank.pivot); body.add(engGrp); engines.push(engGrp);
    const hull = side < 0 ? hullL : hullR;
    for (const { off, geo: eg } of bank.engines) {
      const fan = new THREE.Mesh(eg.fan, shared.dark); fan.position.set(off.x, off.y, off.z + eg.fanZ); fan.castShadow = false; engGrp.add(fan); fans.push(fan);
      { const pm = new THREE.Mesh(eg.petals, petalMaterial()); pm.position.copy(off); pm.userData.open = 0; pm.castShadow = false; engGrp.add(pm); petals.push(pm); }
      for (const f of eg.flaps) { const m = new THREE.Mesh(f.geo, hull); m.position.set(off.x + f.pivot.x, off.y + f.pivot.y, off.z + f.pivot.z); m.castShadow = false; m.receiveShadow = true; engGrp.add(m); flaps.push({ m, sign: f.sign, side }); }
      for (const core of [false, true]) {
        const m = new THREE.Mesh(core ? eg.flameCore : eg.flameOuter, side < 0 ? (core ? coreL : flameL) : (core ? coreR : flameR));
        m.position.set(off.x, off.y, off.z + eg.flameZ); m.renderOrder = 2; engGrp.add(m); flames.push({ m, side });
      }
    }
    addMeshes(bank.buckets, engGrp, hull);
  }

  // Cockpit + cockpit-mounted extras + GPU-flexing control cables. `ckView` carries the enlargement of the cockpit camera.
  const ckView = new THREE.Group(); ckGrp.add(ckView); body.add(ckGrp);
  const ckMeshes = addMeshes(A.cockpit, ckView, hullC);
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
    for (const g of A.binders) { const bm = new THREE.Mesh(g, bMat); bm.renderOrder = 3; body.add(bm); }
  }
  const setCockpitSway = (x: number, y: number, z: number) => { ckGrp.position.set(x, y, z); ckGrp.rotation.z = -x * 0.14; ckGrp.rotation.x = z * 0.07; cabCk.value.set(x, y, z); };
  let inside = false;
  const setCockpitView = (on: boolean) => {
    if (on === inside) return; inside = on;
    const kS = on ? A.viewScale : 1;
    ckView.scale.setScalar(kS); ckView.position.copy(A.eye).multiplyScalar(1 - kS); // p → eye + k·(p − eye)
    for (const { k, m } of ckMeshes) {
      const start = A.pilotStart.get(k);
      if (start !== undefined) { m.geometry.setDrawRange(0, on ? start : Infinity); m.visible = !on || start > 0; } // the pilot's triangles are the last ones
      if (SHADOW_KEYS.has(k)) m.castShadow = !on; // the enlarged cockpit must not throw an enlarged shadow
    }
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
      f.m.scale.set(w, w, Math.max(0.05, fl * (0.92 + 0.1 * Math.sin(t * 53 + i * 2.1)) * sp));
    }
    hc.copy(glowCol).lerp(hot, Math.min(1, Math.max(0, heat - 0.6) * 2.5));
    const pw = 0.55 + throttle * 0.45 + boost * 0.5;
    for (const [m, sp] of [[flameL, spL], [coreL, spL], [flameR, spR], [coreR, spR]] as [THREE.Material, number][]) {
      const u = m.userData.u as FxU; u.uTime.value = t; u.uColor.value.copy(hc); u.uPower.value = pw * sp;
    }
    glow.color.copy(hc).multiplyScalar(1.1 + boost * 0.3);
    const fanAng = t * (16 + throttle * 42);
    for (let i = 0; i < fans.length; i++) fans[i].rotation.z = fanAng + i * 0.7;
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
      flp.m.rotation.y = flp.sign * (airbrake * 1.05 + (df > 0 ? (0.18 + 0.14 * Math.sin(t * 39 + i * 2.1)) * df : 0));
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
  const dispose = () => { own.forEach(m => m.dispose()); A.owned.forEach(g => g.dispose()); };
  return { group, body, engines, exhaustLocal: A.exhaustLocal, eye: A.eye, hood: A.hood, update, setEngineMotion, setDistance: () => {}, setCockpitSway, setCockpitView, eyeWorld, dispose };
}
