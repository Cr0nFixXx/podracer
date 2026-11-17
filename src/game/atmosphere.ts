import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { cameraPosition, clamp, color, dot, exp, float, fog, max, mix, normalize, oneMinus, positionView, positionWorld, pow, uniform } = TSL;

/** Valley-haze strength per theme (0 = none, e.g. space) */
const HEIGHT_FOG: Record<string, number> = { desert: 0.32, mesa: 0.32, ice: 0.55, jungle: 0.65, malastare: 0.75, lava: 0.55, crystal: 0.5, aquilaris: 0.45, city: 0.4, oovo: 0 };

/**
 * Aerial perspective as a TSL fog node (scene.fogNode, works on WebGPU + WebGL2):
 * exp² distance haze + ground-hugging valley haze that thins with altitude + warm in-scattering towards the sun.
 * Gives open landscapes depth: distant ranges fade into the sky instead of ending in a hard line.
 */
export function applyAtmosphere(scene: THREE.Scene, theme: ThemeDef, density: number, baseY: number, sunDir: THREE.Vector3) {
  const fogCol = color(new THREE.Color(theme.fogColor)), sunCol = color(new THREE.Color(theme.sunColor));
  const dens = uniform(density), sd = uniform(sunDir.clone().normalize()), hStr = float(HEIGHT_FOG[theme.id] ?? 0.4);
  const dist = positionView.length();
  const fd = oneMinus(exp(dens.mul(dist).pow(2).negate()));
  const fh = oneMinus(exp(dist.mul(0.0011).negate())).mul(exp(max(positionWorld.y.sub(baseY), 0.0).mul(-0.018))).mul(hStr);
  const factor = clamp(fd.add(fh.mul(oneMinus(fd))), 0.0, 1.0);
  const sunAmt = pow(max(dot(normalize(positionWorld.sub(cameraPosition)), sd), 0.0), 8.0).mul(0.3);
  (scene as unknown as { fogNode: unknown }).fogNode = fog(mix(fogCol, sunCol.mul(1.1), sunAmt), factor);
}
