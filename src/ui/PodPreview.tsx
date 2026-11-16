import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PODS, THEMES } from '../game/data';
import { buildPodModel, type PodVisual } from '../game/podModel';
import { makeSky } from '../game/sky';

interface Props { podId: string; colors: [string, string, string]; className?: string; autoRotate?: boolean; }

export default function PodPreview({ podId, colors, className, autoRotate = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; pod: PodVisual | null; raf: number; drag: boolean; rot: number; lastX: number } | null>(null);

  useEffect(() => {
    const el = ref.current!; 
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(r.domElement); r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); const es = new THREE.Scene(); es.add(makeSky(THEMES.desert).mesh);
    scene.environment = pm.fromScene(es, 0.02).texture; pm.dispose();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    const key = new THREE.DirectionalLight('#fff1dd', 3.5); key.position.set(10, 14, 8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#6ab8ff', 2.5); rim.position.set(-10, 5, -12); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: '#1a1410', metalness: 0.6, roughness: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.5, 9.8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb040').multiplyScalar(2), toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.58; scene.add(ring);
    const st = { r, scene, cam, pod: null as PodVisual | null, raf: 0, drag: false, rot: 0.8, lastX: 0 };
    stateRef.current = st;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const t0 = performance.now();
    const loop = () => {
      st.raf = requestAnimationFrame(loop);
      const t = (performance.now() - t0) / 1000;
      if (!st.drag && autoRotate) st.rot += 0.004;
      if (st.pod) { st.pod.group.rotation.y = st.rot; st.pod.group.position.y = Math.sin(t * 2) * 0.15; st.pod.update(t, 0.4, 0, 0, 1, 1, 0); }
      const def = PODS.find(p => p.id === podId)!; const dist = (def.cable + def.engineLen) * 0.95 + 6;
      cam.position.set(dist * 0.75, dist * 0.32, dist * 0.75); cam.lookAt(0, 0.3, 0);
      r.render(scene, cam);
    };
    loop();
    const down = (e: PointerEvent) => { st.drag = true; st.lastX = e.clientX; };
    const move = (e: PointerEvent) => { if (st.drag) { st.rot += (e.clientX - st.lastX) * 0.01; st.lastX = e.clientX; } };
    const up = () => { st.drag = false; };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => {
      cancelAnimationFrame(st.raf); ro.disconnect(); st.pod?.dispose(); r.dispose(); r.domElement.remove();
      el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const st = stateRef.current; if (!st) return;
    if (st.pod) { st.scene.remove(st.pod.group); st.pod.dispose(); }
    const def = PODS.find(p => p.id === podId)!;
    const pod = buildPodModel(def, colors, 3);
    st.scene.add(pod.group); st.pod = pod;
  }, [podId, colors]);

  return <div ref={ref} className={className} style={{ cursor: 'grab', touchAction: 'none' }} />;
}
