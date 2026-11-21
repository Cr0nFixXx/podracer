import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { PODS, THEMES } from '../game/data';
import { buildPodModel, type PodLook, type PodVisual } from '../game/podModel';
import { podEnvelope } from '../game/podDesigns';
import { makeSky } from '../game/sky';

interface Props { podId: string; colors: [string, string, string]; pattern?: number; finish?: number; /** Style-Teile */ kit?: PodLook['kit']; /** tuning steps (their parts show on the pod) */ tune?: PodLook['tune']; className?: string; autoRotate?: boolean; }
interface St { scene: THREE.Scene; cam: THREE.PerspectiveCamera; pod: PodVisual | null; podId: string; drag: boolean; rot: number; lastX: number; zoom: number; }

/** Rotating hangar preview – WebGPURenderer (WebGPU, automatic WebGL2 fallback). */
export default function PodPreview({ podId, colors, pattern, finish, kit, tune, className, autoRotate = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stateRef = useRef<St | null>(null);

  useEffect(() => {
    const el = ref.current!;
    let disposed = false;
    const r = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(r.domElement); r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    const key = new THREE.DirectionalLight('#fff1dd', 3.5); key.position.set(10, 14, 8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#6ab8ff', 2.5); rim.position.set(-10, 5, -12); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: '#1a1410', metalness: 0.6, roughness: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.5, 9.8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb040').multiplyScalar(2) }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.58; scene.add(ring);
    const st: St = { scene, cam, pod: null, podId, drag: false, rot: 0.8, lastX: 0, zoom: 1 };
    stateRef.current = st;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      if (!st.drag && autoRotate) st.rot += 0.004;
      if (st.pod) {
        const sw = Math.sin(t * 1.4) * 0.24;
        st.pod.group.rotation.y = st.rot; st.pod.group.position.y = 0.45 + Math.sin(t * 2) * 0.12;
        st.pod.setEngineMotion(sw, -sw, 0, 0, 0);
        st.pod.update(t, 0.4, 0, 0, 1, 1, 0);
      }
      const def = PODS.find(p => p.id === st.podId) ?? PODS[0]; const dist = (podEnvelope(def).length * 1.12 + 6) * st.zoom; // frame by the pod's real length
      cam.position.set(dist * 0.75, dist * 0.32, dist * 0.75); cam.lookAt(0, 0.3, 0);
      r.render(scene, cam);
    };
    r.init().then(() => {
      if (disposed) return;
      const pm = new THREE.PMREMGenerator(r); const es = new THREE.Scene(); es.add(makeSky(THEMES.desert, true).mesh);
      scene.environment = pm.fromScene(es, 0.02, 1, 20000).texture; pm.dispose();
      if (!disposed) r.setAnimationLoop(loop);
    }).catch(e => console.error('PodPreview renderer init failed', e));
    const down = (e: PointerEvent) => { st.drag = true; st.lastX = e.clientX; };
    const move = (e: PointerEvent) => { if (st.drag) { st.rot += (e.clientX - st.lastX) * 0.01; st.lastX = e.clientX; } };
    const up = () => { st.drag = false; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); st.zoom = Math.min(1.6, Math.max(0.4, st.zoom * (e.deltaY > 0 ? 1.1 : 0.9))); };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => {
      disposed = true; r.setAnimationLoop(null); ro.disconnect(); st.pod?.dispose(); r.dispose(); r.domElement.remove();
      el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const st = stateRef.current; if (!st) return;
    if (st.pod) { st.scene.remove(st.pod.group); st.pod.dispose(); }
    const def = PODS.find(p => p.id === podId)!;
    const pod = buildPodModel(def, colors, 3, 1024, false, { pattern, finish, kit, tune });
    st.scene.add(pod.group); st.pod = pod; st.podId = podId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podId, colors, pattern, finish, JSON.stringify(kit), JSON.stringify(tune)]);

  return <div ref={ref} className={className} style={{ cursor: 'grab', touchAction: 'none' }} />;
}
