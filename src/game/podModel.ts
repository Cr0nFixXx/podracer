import * as THREE from 'three';
import type { PodDef } from './data';
import { generateTexture } from './textures';
import { designPod } from './podDesigns';
import { kit, type Mats } from './podParts';

export interface PodVisual {
  group: THREE.Group;
  body: THREE.Group;
  engines: THREE.Object3D[];
  exhaustLocal: THREE.Vector3[];
  update: (t: number, throttle: number, boost: number, airbrake: number, dmgL: number, dmgR: number, heat: number) => void;
  dispose: () => void;
}

let panelSet: ReturnType<typeof generateTexture> | null = null;

export function buildPodModel(def: PodDef, colors: [string, string, string], quality = 2): PodVisual {
  if (!panelSet) panelSet = generateTexture('metal', ['#6a6a6a', '#8a8a8a', '#a8a8a8'], 512, 77, 8);
  const seg = quality >= 3 ? 48 : quality === 2 ? 32 : 16;
  const k = kit(seg);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const nm = panelSet.normalMap.clone(); nm.repeat.set(2, 2); nm.needsUpdate = true;
  const ns = new THREE.Vector2(0.45, 0.45);
  const M: Mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: colors[0], metalness: 0.62, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, normalMap: nm, normalScale: ns }),
    paint2: new THREE.MeshPhysicalMaterial({ color: colors[1], metalness: 0.6, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.15, normalMap: nm, normalScale: ns }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d8dce2', metalness: 1, roughness: 0.12 }),
    dark: new THREE.MeshStandardMaterial({ color: '#14151a', metalness: 0.7, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: '#7a7f88', metalness: 0.9, roughness: 0.32, normalMap: nm, normalScale: ns }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[2]).multiplyScalar(1.6), toneMapped: false }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[2]).multiplyScalar(1.4), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  const mats: THREE.Material[] = Object.values(M);
  const built = designPod(def, k, M, body, mats);

  // energy binder between the main engine pair
  const pair = built.engines.slice(0, 2);
  const bPts = 16;
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bPts * 3), 3)); k.geos.push(bGeo);
  const bMat = new THREE.LineBasicMaterial({ color: new THREE.Color(colors[2]).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, toneMapped: false });
  const binder = new THREE.Line(bGeo, bMat); binder.frustumCulled = false; body.add(binder); mats.push(bMat);
  const ends = pair.map(e => new THREE.Vector3(e.group.position.x * 0.8, e.group.position.y + e.radius * 0.3, e.group.position.z));

  body.position.z = -built.cockpitZ * 0.25;

  const flames = built.engines.flatMap(e => e.flames);
  const flaps = built.engines.flatMap(e => e.flaps);
  const update = (t: number, throttle: number, boost: number, airbrake: number, dmgL: number, dmgR: number, heat: number) => {
    const fl = 0.3 + throttle * 0.8 + boost * 0.9;
    flames.forEach((f, i) => {
      const flick = 0.85 + Math.sin(t * 55 + i) * 0.08 + Math.random() * 0.1;
      const dmg = i % 4 < 2 ? dmgL : dmgR;
      f.scale.set(1 + boost * 0.3, 1 + boost * 0.3, fl * flick * (dmg < 0.15 ? 0.3 + Math.random() * 0.7 : 1));
    });
    const hc = new THREE.Color(colors[2]).lerp(new THREE.Color('#ff5a1a'), Math.max(0, heat - 0.6) * 2.5);
    (M.flame as THREE.MeshBasicMaterial).color.copy(hc).multiplyScalar(1.4 + boost * 1.4);
    (M.glow as THREE.MeshBasicMaterial).color.copy(hc).multiplyScalar(1.6 + boost * 1.4);
    built.engines.forEach(e => { if (e.fan) e.fan.rotation.z += 0.3 + throttle * 0.8; });
    flaps.forEach(f => (f.rotation.x = -f.userData.s * airbrake * 1.1));
    if (ends.length === 2) {
      const arr = (binder.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < bPts; i++) {
        const f = i / (bPts - 1); const p = ends[0].clone().lerp(ends[1], f);
        const amp = Math.sin(f * Math.PI) * 0.35;
        p.y += Math.sin(t * 40 + f * 14) * amp + (Math.random() - 0.5) * amp * 0.8;
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      binder.geometry.attributes.position.needsUpdate = true;
    }
  };
  const dispose = () => { k.geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); nm.dispose(); };
  return {
    group, body, engines: built.engines.map(e => e.group),
    exhaustLocal: built.engines.map(e => e.exhaust.clone().add(body.position)),
    update, dispose,
  };
}
