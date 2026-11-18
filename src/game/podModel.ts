import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PILOTS, type PodDef } from './data';
import { PartBuilder, cyl, tube, type MatKey } from './podKit';
import { engineGeo } from './podParts';
import { cockpitGeo, podLayout, type PodLayout } from './podDesigns';
import { binderMaterial, flameMaterial, hullMaterial, sharedPodMaterials, suitMaterial, type FxU, type HullU } from './podMaterials';

export interface PodVisual {
  group: THREE.Group;
  body: THREE.Group;
  /** bobbing engine groups (position.y is animated by the game) */
  engines: THREE.Object3D[];
  /** exhaust exits in body-local space */
  exhaustLocal: THREE.Vector3[];
  /** cockpit camera eye point and hood camera point (body-local) */
  eye: THREE.Vector3;
  hood: THREE.Vector3;
  update: (t: number, throttle: number, boost: number, airbrake: number, dmgL: number, dmgR: number, heat: number) => void;
  /** distance LOD: far pods collapse ~50 meshes into one merged mesh per material; shadows only when near */
  setLod: (dist: number) => void;
  dispose: () => void;
}

const staticCache = new Map<string, Map<MatKey, THREE.BufferGeometry>>();

/** Control cables + pod specific extras, merged in body space. */
function staticGeo(def: PodDef, L: PodLayout, seg: number, anchors: [THREE.Vector3, THREE.Vector3]) {
  const key = `${def.id}|${seg}`; const hit = staticCache.get(key); if (hit) return hit;
  const pb = new PartBuilder(); const cp = new THREE.Vector3(0, L.cockpit.y, L.cockpit.z);
  const up = new THREE.Vector3(0, 1, 0);
  L.engines.forEach((em) => {
    const eg = engineGeo(em.spec, seg);
    const a = eg.pylon.clone().add(new THREE.Vector3(em.x, em.y, em.z));
    const b = anchors[em.x < 0 ? 0 : 1].clone().add(cp);
    const dist = a.distanceTo(b); const sag = 0.35 + dist * 0.035;
    for (const [mat, r, off, s] of [['rubber', 0.055, 0, 1], ['dark', 0.022, 0.12, 1.18]] as [MatKey, number, number, number][]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; const p = a.clone().lerp(b, t); p.y -= sag * s * 4 * t * (1 - t); p.x += off * Math.sign(-em.x || 1) * Math.sin(t * Math.PI); pts.push(p); }
      pb.add(mat, tube(pts, r, Math.max(24, Math.round(seg * 1.2)), mat === 'rubber' ? 8 : 5));
    }
    // ferrules at both ends
    for (const [p, q] of [[a, b], [b, a]] as [THREE.Vector3, THREE.Vector3][]) {
      const dir = q.clone().sub(p).normalize(); const m = new THREE.Matrix4().compose(p.clone().addScaledVector(dir, 0.12), new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1));
      pb.add('chrome', cyl(0.085, 0.07, 0.24, 12), m);
    }
  });
  L.extras?.(pb, L);
  const out = pb.build(); staticCache.set(key, out); return out;
}

const BINDER_PTS = 28;
let farMat: THREE.MeshStandardMaterial | null = null;
/** shared material of all baked far-LOD pods (one pipeline, vertex colours) */
function farMaterial() { return farMat ?? (farMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.45 })); }

export function buildPodModel(def: PodDef, colors: [string, string, string], quality = 2, texRes = 1024): PodVisual {
  const seg = quality >= 3 ? 48 : quality === 2 ? 32 : 20;
  const texSize = texRes >= 2048 ? 2048 : 1024;
  const L = podLayout(def);
  const shared = sharedPodMaterials(texSize) as Record<string, THREE.Material>;
  const hullL = hullMaterial(colors[0], colors[1], colors[2], L.livery, texSize);
  const hullR = hullMaterial(colors[0], colors[1], colors[2], L.livery, texSize);
  const hullC = hullMaterial(colors[0], colors[1], colors[2], L.livery, texSize);
  const glowCol = new THREE.Color(colors[2]);
  const glow = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.2), toneMapped: false });
  const pilot = PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0];
  const suit = suitMaterial(pilot.color);
  const flameL = flameMaterial(glowCol, false), coreL = flameMaterial(glowCol, true), flameR = flameMaterial(glowCol, false), coreR = flameMaterial(glowCol, true);
  const own: THREE.Material[] = [hullL, hullR, hullC, glow, flameL, coreL, flameR, coreR];
  const matFor = (k: string, hull: THREE.Material) => (k === 'hull' ? hull : k === 'glow' ? glow : k === 'suit' ? suit : shared[k]);

  const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);
  body.position.z = -L.cockpit.z * 0.25;
  const addMeshes = (parts: Map<string, THREE.BufferGeometry>, parent: THREE.Object3D, hull: THREE.Material) => {
    for (const [k, g] of parts) {
      const mat = matFor(k, hull); if (!mat) continue;
      const m = new THREE.Mesh(g, mat); const fx = k === 'glow' || k === 'glass';
      m.castShadow = !fx; m.receiveShadow = !fx; if (k === 'glass') m.renderOrder = 1; parent.add(m);
    }
  };

  const engines: THREE.Object3D[] = []; const exhaustLocal: THREE.Vector3[] = [];
  const fans: THREE.Mesh[] = []; const flaps: { m: THREE.Mesh; sign: number }[] = []; const flames: { m: THREE.Mesh; side: number }[] = [];
  let frontZ = -Infinity, topY = 0, sumY = 0;
  for (const em of L.engines) {
    const eg = engineGeo(em.spec, seg);
    const side = em.x < 0 ? -1 : 1; const hull = side < 0 ? hullL : hullR;
    const mount = new THREE.Group(); mount.position.set(em.x, em.y, em.z); body.add(mount);
    const bob = new THREE.Group(); mount.add(bob); engines.push(bob);
    addMeshes(eg.parts, bob, hull);
    const fan = new THREE.Mesh(eg.fan, shared.dark); fan.position.z = eg.fanZ; fan.castShadow = false; bob.add(fan); fans.push(fan);
    for (const f of eg.flaps) { const m = new THREE.Mesh(f.geo, hull); m.position.copy(f.pivot); m.castShadow = true; m.receiveShadow = true; bob.add(m); flaps.push({ m, sign: f.sign }); }
    for (const core of [false, true]) {
      const m = new THREE.Mesh(core ? eg.flameCore : eg.flameOuter, side < 0 ? (core ? coreL : flameL) : (core ? coreR : flameR));
      m.position.z = eg.flameZ; m.renderOrder = 2; bob.add(m); flames.push({ m, side });
    }
    exhaustLocal.push(new THREE.Vector3(em.x, em.y, em.z + eg.exhaustZ));
    frontZ = Math.max(frontZ, em.z + eg.frontZ); topY = Math.max(topY, em.y + eg.R); sumY += em.y;
  }

  // cockpit + pilot
  const ck = cockpitGeo(L, seg);
  const cockpit = new THREE.Group(); cockpit.position.set(0, L.cockpit.y, L.cockpit.z); body.add(cockpit);
  addMeshes(ck.parts, cockpit, hullC);
  addMeshes(staticGeo(def, L, seg, ck.info.anchors), body, hullC);

  // energy binder ribbon
  let binder: { geo: THREE.BufferGeometry; a: THREE.Vector3; b: THREE.Vector3; u: FxU } | null = null;
  if (L.binder) {
    const A = L.engines[L.binder[0]], B = L.engines[L.binder[1]]; const ea = engineGeo(A.spec, seg), eb = engineGeo(B.spec, seg);
    const a = new THREE.Vector3(A.x + Math.sign(B.x - A.x) * ea.R * 0.97, A.y + ea.R * 0.2, A.z + ea.L * 0.12);
    const b = new THREE.Vector3(B.x + Math.sign(A.x - B.x) * eb.R * 0.97, B.y + eb.R * 0.2, B.z + eb.L * 0.12);
    const geo = new THREE.BufferGeometry();
    const uv = new Float32Array(BINDER_PTS * 4 * 2); const idx: number[] = [];
    for (let i = 0; i < BINDER_PTS; i++) {
      const f = i / (BINDER_PTS - 1); for (let k = 0; k < 4; k++) { uv[(i * 4 + k) * 2] = f; uv[(i * 4 + k) * 2 + 1] = k % 2 === 0 ? 1 : 0; }
      if (i < BINDER_PTS - 1) for (const o of [0, 2]) { const p = i * 4 + o, q = p + 4; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BINDER_PTS * 4 * 3), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = binderMaterial(glowCol); own.push(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; body.add(mesh);
    binder = { geo, a, b, u: mat.userData.u as FxU };
  }

  const eye = cockpit.position.clone().add(ck.info.head).add(new THREE.Vector3(0, 0.24, 0.32));
  const hood = new THREE.Vector3(0, sumY / Math.max(1, L.engines.length) + topY * 0.35 + 0.35, frontZ - 1.2);

  const hc = new THREE.Color(), hot = new THREE.Color('#ff5a1a'); const tmp = new THREE.Vector3();
  const update = (t: number, throttle: number, boost: number, airbrake: number, dmgL: number, dmgR: number, heat: number) => {
    const fl = 0.35 + throttle * 0.75 + boost * 0.8;
    const spL = dmgL < 0.15 ? 0.3 + Math.random() * 0.7 : 1, spR = dmgR < 0.15 ? 0.3 + Math.random() * 0.7 : 1;
    for (const f of flames) { const sp = f.side < 0 ? spL : spR; const w = 1 + boost * 0.25; f.m.scale.set(w, w, Math.max(0.05, fl * (0.9 + Math.random() * 0.14) * sp)); }
    hc.copy(glowCol).lerp(hot, Math.min(1, Math.max(0, heat - 0.6) * 2.5));
    const pw = 0.55 + throttle * 0.45 + boost * 0.5;
    for (const [m, sp] of [[flameL, spL], [coreL, spL], [flameR, spR], [coreR, spR]] as [THREE.Material, number][]) { const u = m.userData.u as FxU; u.uTime.value = t; u.uColor.value.copy(hc); u.uPower.value = pw * sp; }
    glow.color.copy(hc).multiplyScalar(1.1 + boost * 0.3);
    for (const f of fans) f.rotation.z += 0.25 + throttle * 0.9;
    for (const f of flaps) f.m.rotation.y = f.sign * airbrake * 1.05;
    const uL = hullL.userData.u as HullU, uR = hullR.userData.u as HullU;
    uL.uScorch.value = Math.min(1, (1 - dmgL) * 1.1 + Math.max(0, heat - 0.75) * 0.8); uL.uHeat.value = heat; uL.uWear.value = 0.28 + (1 - dmgL) * 0.35;
    uR.uScorch.value = Math.min(1, (1 - dmgR) * 1.1 + Math.max(0, heat - 0.75) * 0.8); uR.uHeat.value = heat; uR.uWear.value = 0.28 + (1 - dmgR) * 0.35;
    if (binder) {
      const arr = binder.geo.attributes.position.array as Float32Array; const w = 0.16 + boost * 0.08;
      for (let i = 0; i < BINDER_PTS; i++) {
        const f = i / (BINDER_PTS - 1); tmp.copy(binder.a).lerp(binder.b, f);
        const amp = Math.sin(f * Math.PI) * 0.32;
        tmp.y += Math.sin(f * Math.PI) * 0.18 + Math.sin(t * 38 + f * 13) * amp * 0.6 + (Math.random() - 0.5) * amp * 0.7;
        tmp.z += Math.sin(t * 27 + f * 9) * amp * 0.35;
        const o = i * 12;
        arr[o] = tmp.x; arr[o + 1] = tmp.y + w; arr[o + 2] = tmp.z; arr[o + 3] = tmp.x; arr[o + 4] = tmp.y - w; arr[o + 5] = tmp.z;
        arr[o + 6] = tmp.x; arr[o + 7] = tmp.y; arr[o + 8] = tmp.z + w; arr[o + 9] = tmp.x; arr[o + 10] = tmp.y; arr[o + 11] = tmp.z - w;
      }
      binder.geo.attributes.position.needsUpdate = true;
      binder.u.uTime.value = t; binder.u.uColor.value.copy(hc);
      binder.u.uPower.value = (0.55 + throttle * 0.35 + boost * 0.6) * Math.min(1, Math.min(dmgL, dmgR) * 3);
    }
  };
  // ---- distance LOD (session 7): merged per-material proxy, built lazily on first use
  const flameSet = new Set(flames.map(f => f.m));
  let far: THREE.Group | null = null; const farGeos: THREE.BufferGeometry[] = []; const detail: THREE.Mesh[] = [];
  let lod = -1, shadowOn = true;
  const buildFar = () => {
    // baked far LOD: every part merged into ONE geometry in body space, material colour baked into vertex colours,
    // one shared opaque material + the glow material → 2 draws per pod instead of ~45 (fans/flaps/bob frozen at distance)
    far = new THREE.Group(); body.add(far);
    body.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(body.matrixWorld).invert(); const mm = new THREE.Matrix4();
    const opaque: THREE.BufferGeometry[] = [], glowG: THREE.BufferGeometry[] = []; const c = new THREE.Color();
    const hullCols = [new THREE.Color(colors[0]), new THREE.Color(colors[1])];
    body.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || flameSet.has(m) || m.parent === far || (binder && m.geometry === binder.geo)) return;
      detail.push(m);
      const mat = m.material as THREE.Material & { color?: THREE.Color; metalness?: number }; if (mat.transparent && mat !== glow) return; // glass etc. skipped
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', src.attributes.position); if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal); else g.computeVertexNormals();
      g.applyMatrix4(mm.multiplyMatrices(inv, m.matrixWorld));
      const isHull = mat === hullL || mat === hullR || mat === hullC;
      if (isHull) { const liv = src.attributes.aLiv as THREE.BufferAttribute | undefined; c.copy(hullCols[0]); if (liv) { const avg = Array.from({ length: Math.min(liv.count, 64) }, (_, i) => liv.getX(i)).reduce((x, y) => x + y, 0) / Math.min(liv.count, 64); c.lerp(hullCols[1], Math.min(1, Math.max(0, avg))); } }
      else { if (mat.color) c.copy(mat.color); else c.set(0x808080); c.multiplyScalar((mat.metalness ?? 0) > 0.5 ? 0.75 : 1); }
      const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); src.dispose();
      (mat === glow ? glowG : opaque).push(g);
    });
    for (const [list, mat] of [[opaque, farMaterial()], [glowG, glow]] as [THREE.BufferGeometry[], THREE.Material][]) {
      if (!list.length) continue; const g = mergeGeometries(list); list.forEach(x => x.dispose()); if (!g) continue; farGeos.push(g);
      const fm = new THREE.Mesh(g, mat); fm.castShadow = mat !== glow; fm.receiveShadow = true; far.add(fm); proxies.push(fm);
    }
  };
  const proxies: THREE.Mesh[] = [];
  const setLod = (dist: number) => {
    const want = dist > 18 ? 1 : 0; // AI pods only; baked proxy reads fine beyond ~18 m
    if (want !== lod) {
      if (want === 1 && !far) buildFar();
      lod = want; for (const pm of proxies) pm.visible = want === 1;
      for (const m of detail) m.visible = want === 0;
      
    }
    const sh = dist < 110; // sun shadow frustum is ±130 m around the player
    if (sh !== shadowOn) { shadowOn = sh; body.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !flameSet.has(m)) m.castShadow = sh && m.material !== glow && !(m.material as THREE.Material).transparent; }); }
  };
  const dispose = () => { own.forEach(m => m.dispose()); binder?.geo.dispose(); farGeos.forEach(g => g.dispose()); };
  return { group, body, engines, exhaustLocal, eye, hood, update, setLod, dispose };
}
