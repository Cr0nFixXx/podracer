import * as THREE from 'three/webgpu';
import { PODS, THEMES } from '../../src/game/data';
import { buildPodModel, type PodVisual } from '../../src/game/podModel';
import { makeSky } from '../../src/game/sky';
const W = 1280, H = 720;
const FORCE_WEBGL = location.search.includes('webgl');
const r = new THREE.WebGPURenderer({ antialias: true, forceWebGL: FORCE_WEBGL });
await r.init();
const BACKEND = (r.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2'; r.setSize(W, H); r.setPixelRatio(1); document.body.style.margin = '0'; document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const sky = makeSky(THEMES.desert); scene.add(sky.mesh);
const pm = new THREE.PMREMGenerator(r); const es = new THREE.Scene(); es.add(makeSky(THEMES.desert).mesh); scene.environment = pm.fromScene(es, 0.02, 1, 20000).texture;
const sun = new THREE.DirectionalLight('#fff1dd', 3.4); sun.position.set(14, 18, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.far = 80; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; scene.add(sun);
scene.add(new THREE.HemisphereLight('#bcd5ff', '#8a6a48', 0.55));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#b89470', roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.9; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(40, (W / 2) / (H / 2), 0.1, 3000);
let pod: PodVisual | null = null;
(window as unknown as Record<string, unknown>).show = async (idx: number, dmg = 1, quality = 3) => {
  if (pod) { scene.remove(pod.group); pod.dispose(); }
  const def = PODS[idx]; pod = buildPodModel(def, def.colors, quality, 1024); scene.add(pod.group);
  pod.update(1.3, 1, 0, 0.6, dmg, 1, dmg < 1 ? 0.95 : 0.2);
  pod.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pod.group); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const D = Math.max(size.x, size.z) * 0.95 + 4;
  const ex = pod.engines[0].getWorldPosition(new THREE.Vector3());
  const views: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(c.x + D * 0.62, c.y + D * 0.28, c.z + D * 0.62), c],
    [new THREE.Vector3(c.x, c.y + 4.2, box.min.z - 11), new THREE.Vector3(c.x, c.y + 1, c.z + 6)],
    [new THREE.Vector3(ex.x - 3.2, ex.y + 1.2, ex.z + def.engineLen * 0.5 + 3.4), new THREE.Vector3(ex.x, ex.y, ex.z + def.engineLen * 0.35)],
    [pod.body.localToWorld(pod.eye.clone().add(new THREE.Vector3(2.0, 1.1, -2.6))), pod.body.localToWorld(pod.eye.clone().add(new THREE.Vector3(0, -0.5, 0.3)))],
  ];
  r.setScissorTest(true);
  for (let i = 0; i < views.length; i++) { const [p, t] = views[i]; const x = (i % 2) * W / 2, y = Math.floor(i / 2) * H / 2; r.setViewport(x, y, W / 2, H / 2); r.setScissor(x, y, W / 2, H / 2); cam.position.copy(p); cam.lookAt(t); sky.mesh.position.copy(p); await r.renderAsync(scene, cam); }
  return `${BACKEND} ${def.id} tris=${r.info.render.triangles} calls=${r.info.render.drawCalls ?? r.info.render.calls}`;
};
(window as unknown as Record<string, unknown>).grid = async () => {
  const cols = 5, rows = 2; const w = W / cols, h = H / rows; cam.aspect = w / h; cam.updateProjectionMatrix(); r.setScissorTest(true);
  let tris = 0;
  for (let i = 0; i < PODS.length; i++) { const def = PODS[i];
    if (pod) { scene.remove(pod.group); pod.dispose(); }
    pod = buildPodModel(def, def.colors, 2, 1024); scene.add(pod.group); pod.update(2, 1, location.search.includes('boost') ? 1 : 0, 0, 1, 1, 0.2); pod.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pod.group); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
    const D = Math.max(size.x, size.z) * 0.85 + 3; cam.position.set(c.x + D * 0.66, c.y + D * 0.42, c.z + D * 0.5); cam.lookAt(c); sky.mesh.position.copy(cam.position);
    const x = (i % cols) * w, y = Math.floor(i / cols) * h; r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); await r.renderAsync(scene, cam); tris += r.info.render.triangles;
  }
  return 'grid tris(sum incl shadow)=' + tris;
};
