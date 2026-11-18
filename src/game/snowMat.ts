// Snow-dusted foliage material (session 11): world-space up-facing surfaces blend to snow in the shader,
// independent of vertex colours / instance tint (robust for instanced, tilted conifers on ice worlds).
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { texture, uv, normalWorld, positionWorld, smoothstep, mix, vec3, mx_noise_float, float } = TSL;
export function snowLeafMaterial(map: THREE.Texture, amount = 0.8) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, side: THREE.DoubleSide });
  const leaf = texture(map, uv()).rgb.mul(vec3(0.62, 0.78, 0.66)); // darker conifer needles
  const n = mx_noise_float(positionWorld.mul(0.9)).mul(0.5).add(0.5);
  const up = smoothstep(0.25, 0.75, normalWorld.y.add(n.sub(0.5).mul(0.35)));
  const snow = vec3(0.86, 0.9, 0.96).mul(n.mul(0.12).add(0.94));
  m.colorNode = mix(leaf, snow, up.mul(float(amount)));
  m.roughnessNode = mix(float(0.82), float(0.55), up);
  return m;
}
