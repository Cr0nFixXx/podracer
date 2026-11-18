import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PILOTS, type PodDef } from './data';
import { M4, PartBuilder, cyl, lathe, prof, rbox, tube } from './podKit';
import { engineGeo } from './podParts';
import { cockpitGeo, podLayout, type PodLayout } from './podDesigns';
import {
  binderMaterial, cableFlexMaterial, flameMaterial, hullMaterial, podSharedTime,
  sharedOpponentBinderMaterial, sharedOpponentFlameMaterial, sharedOpponentHullMaterial,
  sharedPodMaterials, suitMaterial, type FxU, type HullU,
} from './podMaterials';

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
  dispose: () => void;
}

const SHADOW_KEYS = new Set<string>(['hull', 'steel', 'dark', 'chrome', 'carbon']);
const OPP_SHADOW_KEYS = new Set<string>(['hull', 'steel', 'dark']);
const BINDER_PTS = 18;

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
    const a = eg.pylon.clone().add(new THREE.Vector3(em.x, em.y, em.z)); // engine pylon (w=1)
    const b = anchors[isR].clone().add(cp);                               // cockpit anchor (w=0)
    const dist = a.distanceTo(b); const sag = 0.34 + dist * 0.032;
    for (const [r, off, s, rad] of [[0.055, 0, 1, 6], [0.024, 0.12, 1.18, 4]] as [number, number, number, number][]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8; const p = b.clone().lerp(a, t);
        p.y -= sag * s * 4 * t * (1 - t);
        p.x += off * (isR ? -1 : 1) * Math.sin(t * Math.PI);
        pts.push(p);
      }
      tagFlex(tube(pts, r, Math.max(12, Math.round(seg * 0.6)), rad), isR, a, b);
    }
    for (const [p, q] of [[a, b], [b, a]] as [THREE.Vector3, THREE.Vector3][]) {
      const dir = q.clone().sub(p).normalize();
      const fg = cyl(0.085, 0.07, 0.24, 7);
      fg.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(dir, 0.12), new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1)));
      tagFlex(fg, isR, a, b);
    }
  }
  const mg = mergeGeometries(list, false)!; list.forEach(x => x.dispose());
  mg.computeBoundingSphere(); mg.boundingSphere!.radius += 1.2;
  return mg;
}

/** Evaluate livery paint colour on CPU for opponent hull vertices so ALL 10 rivals share 1 GPU shader pipeline! */
function bakeHullVertexColors(g: THREE.BufferGeometry, c1Hex: string, c2Hex: string, livery: number) {
  const c1 = new THREE.Color(c1Hex), c2 = new THREE.Color(c2Hex);
  const liv = g.attributes.aLiv as THREE.BufferAttribute | undefined;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const band = (x: number, cc: number, w: number) => Math.abs(x - cc) < w ? 1 : 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    if (liv) {
      const c = liv.getX(i), a = liv.getY(i), z = liv.getZ(i);
      const cd = Math.min(c, 1 - c);
      if (z > 2.5) m = 1;
      else if (z >= 0.5 && z < 1.5) {
        if (livery === 0) m = Math.max(band(cd, 0, 0.06), band(a, 0.8, 0.035));
        else if (livery === 1) m = Math.max(band(cd, 0.05, 0.018), band(cd, 0, 0.012), a >= 0.86 ? 1 : 0);
        else if (livery === 2) m = (a >= 0.14 && cd < 0.12 + Math.abs(((a * 5) % 1) - 0.5) * 0.16) ? 1 : 0;
        else m = Math.max(band(a, 0.25, 0.04), band(a, 0.7, 0.04), (a >= 0.3 && a <= 0.65) ? band(Math.abs(cd - 0.25), 0, 0.03) : 0);
      } else if (z >= 1.5) {
        const ck0 = Math.max(band(Math.abs(cd - 0.25 + (a - 0.5) * 0.12), 0, a * 0.02 + 0.035), a >= 0.9 ? 1 : 0);
        m = livery >= 2 ? Math.max(ck0, band(cd, 0, 0.05)) : ck0;
      }
    }
    col[i * 3] = c1.r + (c2.r - c1.r) * m;
    col[i * 3 + 1] = c1.g + (c2.g - c1.g) * m;
    col[i * 3 + 2] = c1.b + (c2.b - c1.b) * m;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function bakeSolidColor(g: THREE.BufferGeometry, col: THREE.Color) {
  const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function makeBinderGeo(a: THREE.Vector3, b: THREE.Vector3, vertCol?: THREE.Color) {
  const pos = new Float32Array(BINDER_PTS * 4 * 3), uv = new Float32Array(BINDER_PTS * 4 * 2);
  const idx: number[] = []; const w = 0.18; const tmp = new THREE.Vector3();
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
  if (L.binder) {
    const A = L.engines[L.binder[0]], B = L.engines[L.binder[1]];
    pb.add('glow', rbox(Math.abs(B.x - A.x), 0.18, 0.18, 0.02), M4.t((A.x + B.x) * 0.5, (A.y + B.y) * 0.5 + 0.2, (A.z + B.z) * 0.5));
  }
  const built = pb.build();
  const out = { hull: built.get('hull')!, dark: built.get('dark')!, glow: built.get('glow')! };
  oppFarCache.set(def.id, out);
  return out;
}

// Single shared vertex-coloured glow & far-hull materials for ALL opponents (zero per-pod material clones!)
let sharedOppGlow: THREE.MeshBasicMaterial | null = null;
let sharedOppFarHull: THREE.MeshStandardMaterial | null = null;
function getOppGlow() { return sharedOppGlow ?? (sharedOppGlow = new THREE.MeshBasicMaterial({ vertexColors: true })); }
function getOppFarHull() { return sharedOppFarHull ?? (sharedOppFarHull = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.48, roughness: 0.34 })); }

export function buildPodModel(def: PodDef, colors: [string, string, string], quality = 2, texRes = 1024, isOpponent = false): PodVisual {
  const seg = isOpponent ? (quality >= 3 ? 18 : 14) : (quality >= 3 ? 40 : quality === 2 ? 28 : 20);
  const texSize = texRes >= 2048 && !isOpponent ? 2048 : 1024;
  const L = podLayout(def);
  const shared = sharedPodMaterials(texSize) as Record<string, THREE.Material>;
  const glowCol = new THREE.Color(colors[2]);
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const suit = suitMaterial(pilot.color);

  const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);
  body.position.z = -L.cockpit.z * 0.25;

  const exhaustLocal: THREE.Vector3[] = [];
  let frontZ = -Infinity, topY = 0, sumY = 0;
  for (const em of L.engines) {
    const eg = engineGeo(em.spec, seg);
    exhaustLocal.push(new THREE.Vector3(em.x, em.y, em.z + eg.exhaustZ));
    frontZ = Math.max(frontZ, em.z + eg.frontZ); topY = Math.max(topY, em.y + eg.R); sumY += em.y;
  }
  const ckBuilt = cockpitGeo(L, seg);
  const eye = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z).add(ckBuilt.info.head).add(new THREE.Vector3(0, 0.24, 0.32));
  const hood = new THREE.Vector3(0, sumY / Math.max(1, L.engines.length) + topY * 0.35 + 0.35, frontZ - 1.2);

  // Split pod extras cleanly into left engine, right engine, or central cockpit bucket so Aurora's wings move with its engines!
  const extraPB = new PartBuilder(); L.extras?.(extraPB, L); const extraParts = extraPB.build();

  // ==================== SHARED-PIPELINE, ARTICULATED 2-LOD OPPONENT POD ====================
  if (isOpponent) {
    const oppHull = sharedOpponentHullMaterial(1024);
    const oppFlame = sharedOpponentFlameMaterial();
    const oppBinder = sharedOpponentBinderMaterial();
    const oppGlow = getOppGlow();
    const glowBoost = glowCol.clone().multiplyScalar(1.2);
    const ownedGeos: THREE.BufferGeometry[] = [];
    const shadowMeshes: THREE.Mesh[] = [];
    const engines: THREE.Object3D[] = [];

    const nearGrp = new THREE.Group(); body.add(nearGrp);
    const addBucket = (buckets: Map<string, THREE.BufferGeometry[]>, parent: THREE.Object3D) => {
      for (const [k, list] of buckets) {
        const mg = mergeGeometries(list, false); list.forEach(x => x.dispose()); if (!mg) continue;
        if (k === 'hull') bakeHullVertexColors(mg, colors[0], colors[1], L.livery);
        else if (k === 'glow') bakeSolidColor(mg, glowBoost);
        mg.computeBoundingSphere(); ownedGeos.push(mg);
        const mat = k === 'hull' ? oppHull : k === 'glow' ? oppGlow : k === 'suit' ? suit : shared[k];
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
    const pushB = (b: Map<string, THREE.BufferGeometry[]>, k: string, g: THREE.BufferGeometry, m?: THREE.Matrix4) => {
      const c = g.clone(); if (m) c.applyMatrix4(m);
      let l = b.get(k); if (!l) { l = []; b.set(k, l); } l.push(c);
    };

    // Articulated Left & Right engine groups pivoted at each bank's true 3D centroid!
    let spanX = 4.6;
    const oppPivots: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      const sideMs = L.engines.filter(e => (e.x < 0 ? -1 : 1) === side);
      const piv = new THREE.Vector3();
      for (const em of sideMs) { piv.x += em.x; piv.y += em.y; piv.z += em.z; }
      if (sideMs.length) piv.divideScalar(sideMs.length);
      oppPivots.push(piv);
      const grp = new THREE.Group(); grp.position.copy(piv); nearGrp.add(grp); engines.push(grp);
      const b = new Map<string, THREE.BufferGeometry[]>(); const fls: THREE.BufferGeometry[] = [];
      for (const em of sideMs) {
        const ox = em.x - piv.x, oy = em.y - piv.y, oz = em.z - piv.z;
        const eg = engineGeo(em.spec, seg); const emM = M4.t(ox, oy, oz);
        for (const [k, g] of eg.parts) pushB(b, k, g, emM);
        pushB(b, 'dark', eg.fan, M4.t(ox, oy, oz + eg.fanZ));
        for (const f of eg.flaps) pushB(b, 'hull', f.geo, M4.t(ox + f.pivot.x, oy + f.pivot.y, oz + f.pivot.z));
        const fo = eg.flameOuter.clone(); fo.applyMatrix4(M4.t(ox, oy, oz + eg.flameZ)); fls.push(fo);
      }
      addBucket(b, grp);
      if (fls.length) {
        const fg = mergeGeometries(fls, false)!; fls.forEach(x => x.dispose());
        bakeSolidColor(fg, glowCol); fg.computeBoundingSphere(); ownedGeos.push(fg);
        const fm = new THREE.Mesh(fg, oppFlame); fm.renderOrder = 2; grp.add(fm);
      }
    }
    // Cockpit + cables + extras
    {
      const b = new Map<string, THREE.BufferGeometry[]>();
      const ckM = M4.t(0, L.cockpit.y, L.cockpit.z);
      for (const [k, g] of ckBuilt.parts) pushB(b, k, g, ckM);
      for (const [k, g] of extraParts) { pushB(b, k, g); g.dispose(); }
      const cp = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z);
      const cabPB = new PartBuilder();
      for (const em of L.engines) {
        const eg = engineGeo(em.spec, seg);
        const a = eg.pylon.clone().add(new THREE.Vector3(em.x, em.y, em.z));
        const anc = ckBuilt.info.anchors[em.x < 0 ? 0 : 1].clone().add(cp);
        const mid = a.clone().lerp(anc, 0.5); mid.y -= 0.55;
        cabPB.add('dark', tube([anc, mid, a], 0.055, 8, 5));
      }
      for (const [k, g] of cabPB.build()) { pushB(b, k, g); g.dispose(); }
      addBucket(b, nearGrp);
    }
    let binderMesh: THREE.Mesh | null = null, binderBaseY = 0;
    if (L.binder) {
      const A = L.engines[L.binder[0]], B = L.engines[L.binder[1]];
      const ea = engineGeo(A.spec, seg), eb = engineGeo(B.spec, seg);
      const pa = new THREE.Vector3(A.x + Math.sign(B.x - A.x) * ea.R * 0.97, 0, A.z + ea.L * 0.12);
      const pb = new THREE.Vector3(B.x + Math.sign(A.x - B.x) * eb.R * 0.97, 0, B.z + eb.L * 0.12);
      spanX = Math.max(1.5, Math.abs(pb.x - pa.x));
      binderBaseY = (A.y + ea.R * 0.2 + B.y + eb.R * 0.2) * 0.5;
      const bg = makeBinderGeo(pa, pb, glowCol); ownedGeos.push(bg);
      binderMesh = new THREE.Mesh(bg, oppBinder); binderMesh.position.y = binderBaseY; binderMesh.renderOrder = 3; nearGrp.add(binderMesh);
    }

    // Far LOD (> 48 m): 3 shared-material draws, ~380 tris!
    const farGrp = new THREE.Group(); farGrp.visible = false; body.add(farGrp);
    const far = buildOpponentFarGeo(def, L);
    const fhGeo = bakeHullVertexColors(far.hull.clone(), colors[0], colors[1], L.livery); ownedGeos.push(fhGeo);
    const fgGeo = bakeSolidColor(far.glow.clone(), glowBoost); ownedGeos.push(fgGeo);
    const fhM = new THREE.Mesh(fhGeo, getOppFarHull()); fhM.receiveShadow = true; farGrp.add(fhM);
    farGrp.add(new THREE.Mesh(far.dark, shared.dark));
    farGrp.add(new THREE.Mesh(fgGeo, oppGlow));

    const setDistance = (d: number, forceAll = false) => {
      if (forceAll) { nearGrp.visible = true; farGrp.visible = true; return; }
      const useNear = d < 48;
      nearGrp.visible = useNear;
      farGrp.visible = !useNear && d < 520;
      const wantSh = d < 78;
      if (useNear) for (let i = 0; i < shadowMeshes.length; i++) shadowMeshes[i].castShadow = wantSh;
      else fhM.castShadow = wantSh;
    };
    const setEngineMotion = (yL: number, yR: number, pitchL: number, pitchR: number, rollBank: number) => {
      if (!nearGrp.visible) return;
      if (engines[0]) { engines[0].position.y = oppPivots[0].y + yL; engines[0].rotation.set(pitchL, 0, rollBank * 0.22); }
      if (engines[1]) { engines[1].position.y = oppPivots[1].y + yR; engines[1].rotation.set(pitchR, 0, rollBank * 0.22); }
      if (binderMesh) { binderMesh.position.y = binderBaseY + (yL + yR) * 0.5; binderMesh.rotation.z = Math.atan2(yR - yL, spanX); }
    };
    const update = (t: number) => { podSharedTime.value = t; };
    const dispose = () => { ownedGeos.forEach(g => g.dispose()); };
    return { group, body, engines, exhaustLocal, eye, hood, update, setEngineMotion, setDistance, dispose };
  }

  // ==================== FULL HERO PLAYER / HANGAR POD ====================
  const hullL = hullMaterial(colors[0], colors[1], colors[2], L.livery, texSize);
  const hullR = hullMaterial(colors[0], colors[1], colors[2], L.livery, texSize);
  const glow = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.2) });
  const flameL = flameMaterial(glowCol, false), coreL = flameMaterial(glowCol, true);
  const flameR = flameMaterial(glowCol, false), coreR = flameMaterial(glowCol, true);
  const cabMat = cableFlexMaterial();
  const cabLift = cabMat.userData.uLift as { value: THREE.Vector2 };
  const own: THREE.Material[] = [hullL, hullR, glow, flameL, coreL, flameR, coreR, cabMat];
  const matFor = (k: string, hull: THREE.Material) => (k === 'hull' ? hull : k === 'glow' ? glow : k === 'suit' ? suit : shared[k]);

  const addMeshes = (parts: Map<string, THREE.BufferGeometry>, parent: THREE.Object3D, hull: THREE.Material) => {
    for (const [k, g] of parts) {
      const mat = matFor(k, hull); if (!mat) continue;
      const m = new THREE.Mesh(g, mat); const fx = k === 'glow' || k === 'glass';
      m.castShadow = !fx && SHADOW_KEYS.has(k); m.receiveShadow = !fx;
      if (k === 'glass') m.renderOrder = 1; parent.add(m);
    }
  };

  // Split Aurora/Brute/Gasvaro/Teemo engine-mounted extras onto their matching L/R articulated engine group!
  const attachExtraToEngines = def.id === 'aurora' || def.id === 'brute' || def.id === 'gasvaro' || def.id === 'bomquad' || def.id === 'teemo';
  const engines: THREE.Object3D[] = [];
  const fans: THREE.Mesh[] = [];
  const flaps: { m: THREE.Mesh; sign: number }[] = [];
  const flames: { m: THREE.Mesh; side: number }[] = [];
  const sideGeos: THREE.BufferGeometry[] = [];
  const hc = new THREE.Color(), hot = new THREE.Color('#ff5a1a');

  const heroPivots: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const sideMounts = L.engines.filter(e => (e.x < 0 ? -1 : 1) === side);
    if (!sideMounts.length) continue;
    // Pivot each engine bank around its true 3D center of mass so pitch & roll stay crisp and balanced!
    const piv = new THREE.Vector3();
    for (const em of sideMounts) { piv.x += em.x; piv.y += em.y; piv.z += em.z; }
    piv.divideScalar(sideMounts.length);
    heroPivots.push(piv);
    const engGrp = new THREE.Group(); engGrp.position.copy(piv); body.add(engGrp); engines.push(engGrp);
    const hull = side < 0 ? hullL : hullR;
    const buckets = new Map<string, THREE.BufferGeometry[]>();
    for (const em of sideMounts) {
      const ox = em.x - piv.x, oy = em.y - piv.y, oz = em.z - piv.z;
      const eg = engineGeo(em.spec, seg); const emM = M4.t(ox, oy, oz);
      for (const [k, g] of eg.parts) {
        const gc = g.clone(); gc.applyMatrix4(emM);
        let l = buckets.get(k); if (!l) { l = []; buckets.set(k, l); } l.push(gc);
      }
      const fan = new THREE.Mesh(eg.fan, shared.dark); fan.position.set(ox, oy, oz + eg.fanZ); fan.castShadow = false; engGrp.add(fan); fans.push(fan);
      for (const f of eg.flaps) { const m = new THREE.Mesh(f.geo, hull); m.position.set(ox + f.pivot.x, oy + f.pivot.y, oz + f.pivot.z); m.castShadow = false; m.receiveShadow = true; engGrp.add(m); flaps.push({ m, sign: f.sign }); }
      for (const core of [false, true]) {
        const m = new THREE.Mesh(core ? eg.flameCore : eg.flameOuter, side < 0 ? (core ? coreL : flameL) : (core ? coreR : flameR));
        m.position.set(ox, oy, oz + eg.flameZ); m.renderOrder = 2; engGrp.add(m); flames.push({ m, side });
      }
    }
    if (attachExtraToEngines) {
      const shift = M4.t(-piv.x, -piv.y, -piv.z);
      for (const [k, eg] of extraParts) {
        const idx = eg.index!.array; const pos = eg.attributes.position;
        const keep: number[] = [];
        for (let t = 0; t < idx.length; t += 3) {
          const cx = (pos.getX(idx[t]) + pos.getX(idx[t + 1]) + pos.getX(idx[t + 2])) / 3;
          if ((cx < 0 ? -1 : 1) === side) keep.push(idx[t], idx[t + 1], idx[t + 2]);
        }
        if (keep.length) {
          const sub = eg.clone(); sub.setIndex(keep); sub.applyMatrix4(shift);
          let l = buckets.get(k); if (!l) { l = []; buckets.set(k, l); } l.push(sub);
        }
      }
    }
    const mergedSide = new Map<string, THREE.BufferGeometry>();
    for (const [k, list] of buckets) {
      const mg = mergeGeometries(list, false); list.forEach(x => x.dispose());
      if (mg) { mg.computeBoundingSphere(); mergedSide.set(k, mg); sideGeos.push(mg); }
    }
    addMeshes(mergedSide, engGrp, hull);
  }

  // Cockpit + cockpit-mounted extras + GPU-flexing control cables
  {
    const ckM = M4.t(0, L.cockpit.y, L.cockpit.z);
    const buckets = new Map<string, THREE.BufferGeometry[]>();
    for (const [k, g] of ckBuilt.parts) { const gc = g.clone(); gc.applyMatrix4(ckM); let l = buckets.get(k); if (!l) { l = []; buckets.set(k, l); } l.push(gc); }
    for (const [k, g] of extraParts) {
      if (!attachExtraToEngines) { let l = buckets.get(k); if (!l) { l = []; buckets.set(k, l); } l.push(g); }
      else g.dispose();
    }
    const mergedBody = new Map<string, THREE.BufferGeometry>();
    for (const [k, list] of buckets) {
      const mg = mergeGeometries(list, false); list.forEach(x => x.dispose());
      if (mg) { mg.computeBoundingSphere(); mergedBody.set(k, mg); sideGeos.push(mg); }
    }
    addMeshes(mergedBody, body, hullL);

    const cabGeo = buildFlexCables(L, seg, ckBuilt.info.anchors); sideGeos.push(cabGeo);
    const cabMesh = new THREE.Mesh(cabGeo, cabMat); cabMesh.castShadow = false; cabMesh.receiveShadow = true; body.add(cabMesh);
  }

  let binderGeo: THREE.BufferGeometry | null = null, binderU: FxU | null = null, binderSwap = false;
  if (L.binder) {
    const A = L.engines[L.binder[0]], B = L.engines[L.binder[1]];
    binderSwap = A.x > B.x;
    const ea = engineGeo(A.spec, seg), eb = engineGeo(B.spec, seg);
    binderGeo = makeBinderGeo(
      new THREE.Vector3(A.x + Math.sign(B.x - A.x) * ea.R * 0.97, A.y + ea.R * 0.2, A.z + ea.L * 0.12),
      new THREE.Vector3(B.x + Math.sign(A.x - B.x) * eb.R * 0.97, B.y + eb.R * 0.2, B.z + eb.L * 0.12),
    );
    const bMat = binderMaterial(glowCol); own.push(bMat); binderU = bMat.userData.u as FxU;
    const bm = new THREE.Mesh(binderGeo, bMat); bm.renderOrder = 3; body.add(bm);
  }

  const setEngineMotion = (yL: number, yR: number, pitchL: number, pitchR: number, rollBank: number) => {
    if (engines[0]) { engines[0].position.y = heroPivots[0].y + yL; engines[0].rotation.set(pitchL, 0, rollBank * 0.22); }
    if (engines[1]) { engines[1].position.y = heroPivots[1].y + yR; engines[1].rotation.set(pitchR, 0, rollBank * 0.22); }
    cabLift.value.set(yL, yR);
    if (binderU?.uLift) binderU.uLift.value.set(binderSwap ? yR : yL, binderSwap ? yL : yR);
  };

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
    for (let i = 0; i < flaps.length; i++) flaps[i].m.rotation.y = flaps[i].sign * airbrake * 1.05;
    const uL = hullL.userData.u as HullU, uR = hullR.userData.u as HullU;
    uL.uScorch.value = Math.min(1, (1 - dmgL) * 1.1 + Math.max(0, heat - 0.75) * 0.8); uL.uHeat.value = heat; uL.uWear.value = 0.28 + (1 - dmgL) * 0.35;
    uR.uScorch.value = Math.min(1, (1 - dmgR) * 1.1 + Math.max(0, heat - 0.75) * 0.8); uR.uHeat.value = heat; uR.uWear.value = 0.28 + (1 - dmgR) * 0.35;
    if (binderU) {
      binderU.uTime.value = t; binderU.uColor.value.copy(hc);
      binderU.uPower.value = (0.55 + throttle * 0.35 + boost * 0.6) * Math.min(1, Math.min(dmgL, dmgR) * 3);
    }
  };
  const dispose = () => { own.forEach(m => m.dispose()); sideGeos.forEach(g => g.dispose()); binderGeo?.dispose(); };
  return { group, body, engines, exhaustLocal, eye, hood, update, setEngineMotion, setDistance: () => {}, dispose };
}
