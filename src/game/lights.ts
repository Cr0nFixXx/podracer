// ===== Session 13: volumetric headlight beams (one instanced draw for all pods) =====
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, dot, normalView, positionViewDirection, pow, uniform, uv, vec3 } = TSL;

/** Soft light cone: narrow at the lamp (z = 0), 30 m long along +Z. Additive, brightest at the lamp, fading along the beam and
 *  towards its silhouette (no hard cone edge). `strength` 0..1 = how dark it is (lights fade in at dusk). */
export function makeBeams(count: number) {
  const geo = new THREE.CylinderGeometry(0.2, 3.3, 30, 18, 1, true); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 15);
  const strength = uniform(0);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const facing = abs(dot(normalView, positionViewDirection));          // 1 = surface faces the camera, 0 = silhouette
  mat.colorNode = vec3(0.78, 0.87, 1.0);
  mat.opacityNode = pow(uv().y, 1.8).mul(pow(facing, 1.7)).mul(strength).mul(0.075);
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, strength: strength as { value: number } };
}
