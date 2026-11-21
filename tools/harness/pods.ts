// Pod harness. Dev: `npm run dev` → http://localhost:5173/tools/harness/pods.dev.html   (bundle: see tools/harness/run.sh)
//   await show(idx, health = 1, quality = 3, { rival?, save? })   4 views of one pod (¾, front, engine close-up, behind the pilot);
//                                                                 `health` (0..1) = left engine side, `{ both: true }` = both sides.
//                                                                 Bruchteile below their step are gone (or `{ parts: mask }`)
//   await grid({ rival?, boost?, quality?, save? })               all pods on one sheet (auto layout for any roster size)
//   await sheet(view, { rival?, quality?, health?, save? })       one cell per pod: 'pod' | 'front' | 'rear' | 'side' | 'inside' | 'chase' | 'profile'
//   stats(idx, quality = 2, rival = false) / statsAll()           mesh + triangle counts of the real model (golden numbers for tools/ci/pods.ts)
// `save: 'name'` posts the frame as JPEG to tools/harness/shot-server.mjs → tools/harness/out/name.jpg. Query: ?webgl forces WebGL2.
import * as THREE from 'three/webgpu';
import { PODS, STAT_KEYS, THEMES } from '../../src/game/data';
import { buildPodModel, type PodLook, type PodVisual } from '../../src/game/podModel';
import { podLayout } from '../../src/game/podLayouts';
import { damageModel, partsDue } from '../../src/game/podDamage';
import { makeSky } from '../../src/game/sky';
const W = 1280, H = 720;
const FORCE_WEBGL = location.search.includes('webgl');
const r = new THREE.WebGPURenderer({ antialias: true, forceWebGL: FORCE_WEBGL });
await r.init();
const BACKEND = (r.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2'; r.setSize(W, H); r.setPixelRatio(1); document.body.style.margin = '0'; document.body.style.background = '#111'; document.body.appendChild(r.domElement);
r.domElement.style.width = '100%'; r.domElement.style.height = 'auto'; // fit narrow preview panes; the frame itself stays 1280 × 720
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const sky = makeSky(THEMES.desert); scene.add(sky.mesh);
const pm = new THREE.PMREMGenerator(r); const es = new THREE.Scene(); es.add(makeSky(THEMES.desert).mesh); scene.environment = pm.fromScene(es, 0.02, 1, 20000).texture;
const sun = new THREE.DirectionalLight('#fff1dd', 3.4); sun.position.set(14, 18, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.far = 80; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; scene.add(sun);
scene.add(new THREE.HemisphereLight('#bcd5ff', '#8a6a48', 0.55));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#b89470', roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.9; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(40, (W / 2) / (H / 2), 0.1, 3000);
const win = window as unknown as Record<string, unknown>;
let pod: PodVisual | null = null;

interface ShowOpts { rival?: boolean; save?: string; boost?: boolean; quality?: number; /** rival only: show the far LOD (> 48 m) */ far?: boolean; /** Style-Teile { fins, intake, nozzle, canopy } and tuning steps (number = all values) */ kit?: PodLook['kit']; tune?: number | PodLook['tune'];
  /** damage on both engine sides (default: `show` damages the left side only) · explicit mask of lost Bruchteile */ both?: boolean; parts?: number;
  /** engine heat 0..1 (hull glow); default 0.2 */ heat?: number;
  /** player pod: Treffermarken at these points of the pod (body space: x right, y up, z forward) with an impact speed */ marks?: [number, number, number, number][] }
/** Must run in the same task as the last render call: the canvas keeps its picture only until the frame is presented. */
async function saveFrame(name?: string) {
  if (!name) return '';
  const blob = await new Promise<Blob | null>(res => r.domElement.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) return ' | save FAILED (no blob)';
  try { const rs = await fetch('http://127.0.0.1:5174/save?name=' + encodeURIComponent(name), { method: 'POST', body: blob }); return ' | saved ' + (await rs.text()); }
  catch (e) { return ' | save FAILED (' + (e as Error).message + ' – start tools/harness/shot-server.mjs)'; }
}
function build(idx: number, quality: number, rival: boolean, far = false, o: ShowOpts = {}) {
  const def = PODS[idx];
  const tune = typeof o.tune === 'number' ? Object.fromEntries(STAT_KEYS.map(k => [k, o.tune as number])) : o.tune;
  const p = buildPodModel(def, def.colors, quality, 1024, rival, { ...(rival ? { pattern: (idx + 1) % 6 } : {}), kit: o.kit, tune });
  if (rival) p.setDistance(far ? 100 : 10);
  return p;
}

win.show = async (idx: number, dmg = 1, quality = 3, o: ShowOpts = {}) => {
  if (pod) { scene.remove(pod.group); pod.dispose(); }
  const def = PODS[idx]; pod = build(idx, quality, !!o.rival, false, o); scene.add(pod.group);
  const hpR = o.both ? dmg : 1;
  pod.setParts(o.parts ?? partsDue(damageModel(def.id), dmg * 100, hpR * 100)); // Bruchteile below their step are gone
  pod.update(1.3, 1, o.boost ? 1 : 0, 0.6, dmg, hpR, o.heat ?? 0.2);
  pod.group.updateMatrixWorld(true);
  for (const [x, y, z, k] of o.marks ?? []) { const w = pod.body.localToWorld(new THREE.Vector3(x, y, z)); pod.hitMark?.(w.x, w.y, w.z, k); }
  pod.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pod.group); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const D = Math.max(size.x, size.z) * 0.95 + 4;
  const ex = pod.engines[0].getWorldPosition(new THREE.Vector3());
  const eBox = new THREE.Box3().setFromObject(pod.engines[0]), eLen = eBox.max.z - eBox.min.z; // engine bank bounds (no legacy PodDef sizes)
  const views: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(c.x + D * 0.62, c.y + D * 0.28, c.z + D * 0.62), c],
    [new THREE.Vector3(c.x, c.y + 4.2, box.min.z - 11), new THREE.Vector3(c.x, c.y + 1, c.z + 6)],
    [new THREE.Vector3(ex.x - 3.2, ex.y + 1.2, eBox.max.z + 3.4), new THREE.Vector3(ex.x, ex.y, eBox.max.z - eLen * 0.15)],
    [pod.body.localToWorld(pod.eye.clone().add(new THREE.Vector3(2.0, 1.1, -2.6))), pod.body.localToWorld(pod.eye.clone().add(new THREE.Vector3(0, -0.5, 0.3)))],
  ];
  cam.aspect = (W / 2) / (H / 2); cam.updateProjectionMatrix(); r.setScissorTest(true);
  for (let i = 0; i < views.length; i++) { const [p, t] = views[i]; const x = (i % 2) * W / 2, y = Math.floor(i / 2) * H / 2; r.setViewport(x, y, W / 2, H / 2); r.setScissor(x, y, W / 2, H / 2); cam.position.copy(p); cam.lookAt(t); sky.mesh.position.copy(p); await r.renderAsync(scene, cam); }
  const saved = await saveFrame(o.save);
  return `${BACKEND} ${def.id}${o.rival ? ' (rival)' : ''} tris=${r.info.render.triangles} calls=${r.info.render.drawCalls ?? r.info.render.calls}${saved}`;
};

/** One cell per pod. `view`: 'pod' whole pod ¾ · 'front' / 'rear' / 'side' cockpit close-ups · 'inside' from the pilot's eye ·
 *  'chase' the game's default camera behind the pod · 'profile' whole pod exactly from the side (cockpit height against the engines). */
type SheetView = 'pod' | 'front' | 'rear' | 'side' | 'inside' | 'chase' | 'profile';
async function sheet(view: SheetView, o: ShowOpts & { health?: number } = {}) {
  const n = PODS.length, cols = view === 'profile' ? 2 : n <= 10 ? 5 : Math.ceil(n / 3), rows = Math.ceil(n / cols); const w = W / cols, h = H / rows; cam.aspect = w / h; // profile: long flat cells
  cam.fov = view === 'inside' ? 79 : view === 'chase' ? 75 : 40; cam.near = view === 'inside' ? 0.8 : 0.1; cam.updateProjectionMatrix(); r.setScissorTest(true);
  const boost = o.boost ?? location.search.includes('boost'), hp = o.health ?? 1;
  const half = Math.min(THREE.MathUtils.degToRad(cam.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect)); // tighter of the vertical / horizontal half angle
  let tris = 0;
  for (let i = 0; i < n; i++) {
    if (pod) { scene.remove(pod.group); pod.dispose(); }
    pod = build(i, o.quality ?? 2, !!o.rival, !!o.far, o); scene.add(pod.group);
    pod.setParts(o.parts ?? partsDue(damageModel(PODS[i].id), hp * 100, hp * 100)); // Bruchteile below their step are gone
    pod.update(2, 1, boost ? 1 : 0, 0, hp, hp, o.heat ?? 0.2); pod.group.updateMatrixWorld(true);
    const Lc = podLayout(PODS[i]).cockpit; const ck = pod.body.localToWorld(new THREE.Vector3(0, Lc.y + 0.12, Lc.z)); // cockpit centre
    if (view === 'pod') {
      const sph = new THREE.Box3().setFromObject(pod.group).getBoundingSphere(new THREE.Sphere()); const d = sph.radius / Math.sin(half) * 0.92;
      cam.position.copy(sph.center).add(new THREE.Vector3(0.66, 0.42, 0.5).normalize().multiplyScalar(d)); cam.lookAt(sph.center);
    } else if (view === 'inside') { // exactly the game's cockpit camera: pilot's eye, 79° field of view, 0.8 m near plane
      pod.setCockpitView?.(true); pod.group.updateMatrixWorld(true);
      const e = pod.eyeWorld ? pod.eyeWorld(new THREE.Vector3()) : pod.body.localToWorld(pod.eye.clone());
      cam.position.copy(e); cam.lookAt(e.x, e.y - 3.2, e.z + 60);
    } else if (view === 'chase') { // Game.updateCamera, mode 0 at rest: 13.5 m behind and 4.5 m above the pod origin
      cam.position.set(0, 4.5, -13.5); cam.lookAt(0, 1.6, 16);
    } else if (view === 'profile') {
      const box = new THREE.Box3().setFromObject(pod.group), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const vHalf = THREE.MathUtils.degToRad(cam.fov / 2), hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
      const d = Math.max(sz.z * 0.5 / Math.tan(hHalf), (sz.y * 0.5 + 0.5) / Math.tan(vHalf)) * 1.06 + sz.x * 0.5; // fit length and height
      cam.position.set(c.x + d, c.y, c.z); cam.lookAt(c);
    } else {
      const dir = view === 'front' ? new THREE.Vector3(0.55, 0.42, 0.72) : view === 'rear' ? new THREE.Vector3(-0.6, 0.45, -0.66) : new THREE.Vector3(1, 0.16, 0.05);
      cam.position.copy(ck).add(dir.normalize().multiplyScalar(2.6 / Math.sin(half) * 0.8)); cam.lookAt(ck);
    }
    sky.mesh.position.copy(cam.position);
    const x = (i % cols) * w, y = Math.floor(i / cols) * h; r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); await r.renderAsync(scene, cam); tris += r.info.render.triangles;
  }
  const saved = await saveFrame(o.save);
  cam.fov = 40; cam.near = 0.1; cam.updateProjectionMatrix();
  return `${view} sheet, ${n} pods${o.rival ? ' (rival)' : ''} tris(sum incl shadow)=${tris}${saved}`;
}
win.grid = (o: ShowOpts = {}) => sheet('pod', o);
win.sheet = sheet;

// ---- golden numbers: meshes + triangles of the real model (no rendering) ----
function count(root: THREE.Object3D) {
  let meshes = 0, tris = 0; const mats = new Set<string>();
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; mats.add((m.material as THREE.Material).uuid); });
  return { meshes, tris: Math.round(tris), mats: mats.size };
}
win.stats = (idx: number, quality = 2, rival = false) => {
  const def = PODS[idx]; const p = buildPodModel(def, def.colors, quality, 1024, rival, rival ? { pattern: 1 } : undefined);
  const out = rival ? { id: def.id, near: count(p.body.children[0]), far: count(p.body.children[1]) } : { id: def.id, hero: count(p.group) };
  p.dispose(); return out;
};
/** One row per pod: [id, heroQ1 meshes, tris, heroQ2 meshes, tris, heroQ3 meshes, tris, rivalQ2 near meshes, tris, rivalQ3 near meshes, tris, far meshes, tris] */
win.statsAll = () => PODS.map((d, i) => {
  const s = win.stats as (i: number, q: number, rv: boolean) => { hero?: { meshes: number; tris: number }; near?: { meshes: number; tris: number }; far?: { meshes: number; tris: number } };
  const h = [1, 2, 3].map(q => s(i, q, false).hero!), n2 = s(i, 2, true), n3 = s(i, 3, true);
  return [d.id, ...h.flatMap(x => [x.meshes, x.tris]), n2.near!.meshes, n2.near!.tris, n3.near!.meshes, n3.near!.tris, n2.far!.meshes, n2.far!.tris];
});
