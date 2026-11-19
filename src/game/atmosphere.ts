import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';
import { macroTexture } from './textures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { cameraPosition, clamp, dot, exp, fog, max, min, mix, normalize, oneMinus, positionView, positionWorld, pow, step, texture, time, uniform, vec2 } = TSL;

/** Valley-haze strength per theme (0 = none, e.g. space) */
const HEIGHT_FOG: Record<string, number> = { desert: 0.32, mesa: 0.32, ice: 0.55, jungle: 0.65, malastare: 0.75, lava: 0.55, crystal: 0.5, aquilaris: 0.45, city: 0.4, oovo: 0 };

/**
 * Volumetric aerial perspective as a TSL fog node (scene.fogNode, WebGPU + WebGL2, no extra pass):
 *  - exp² distance haze,
 *  - analytic exponential HEIGHT fog integrated along the view ray (exact closed form between camera height and fragment height:
 *    thick in valleys, thin on ridges, correct when looking down into or up out of the layer),
 *  - drifting FOG BANKS: the optical depth is modulated by two wind-scrolled noise taps along the ray (mid-ray + near the surface),
 *    sampled with an explicit LOD so the node is valid in any control flow,
 *  - forward (Mie) in-scattering towards the sun: wide warm lobe + tight glare lobe that grows with the fog amount.
 * `volFog` (0..1) scales layer density and bank contrast (weather "Nebel / Smog", dust storms, snow gusts).
 */
export function applyAtmosphere(scene: THREE.Scene, theme: ThemeDef, density: number, baseY: number, sunDir: THREE.Vector3, volFog = 0.25, quality = 2) {
  // quality (graphics setting "Volumetrie"): 0 = plain distance haze, 1 = + analytic height fog, 2 = + drifting fog banks (2 noise taps)
  // fog colour / sun colour / density / layer strength are uniforms so a weather front can blend them at runtime
  const fogCol = uniform(new THREE.Color(theme.fogColor)), sunCol = uniform(new THREE.Color(theme.sunColor)), vf = uniform(volFog);
  const dens = uniform(density), sd = uniform(sunDir.clone().normalize());
  const hStr = HEIGHT_FOG[theme.id] ?? 0.4;
  const dist = positionView.length();
  const toFrag = positionWorld.sub(cameraPosition), rd = normalize(toFrag);
  const fd = oneMinus(exp(dens.mul(dist).pow(2).negate()));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let factor: any = fd, fh: any = null;
  if (hStr > 0 && volFog > 0 && quality > 0) {
    const a = vf.mul(2.2).add(1.0).mul(0.0017 * hStr), b = 0.032;
    const h0 = max(cameraPosition.y.sub(baseY), 0.0), h1 = max(positionWorld.y.sub(baseY), 0.0);
    const dh = h1.sub(h0), dhS = mix(min(dh, -0.002), max(dh, 0.002), step(0.0, dh)); // never 0, keeps the sign
    const rhoAvg = exp(h0.mul(-b)).sub(exp(h1.mul(-b))).div(dhS.mul(b)).mul(a);        // mean density along the ray
    const m = macroTexture(); const drift = vec2(time.mul(0.0052), time.mul(0.0031));
    const pA = cameraPosition.xz.add(toFrag.xz.mul(0.5)), pB = cameraPosition.xz.add(toFrag.xz.mul(0.86));
    const n = texture(m, pA.mul(0.0011).add(drift)).level(0).r.mul(0.62).add(texture(m, pB.mul(0.0027).sub(drift.mul(1.7))).level(0).g.mul(0.38));
    const bank = quality >= 2 ? clamp(n.sub(0.5).mul(vf.mul(0.55).add(0.35).mul(2.2)).add(1.0), 0.25, 2.2) : 1.0;
    fh = oneMinus(exp(rhoAvg.mul(dist).mul(bank as never).negate()));
    factor = clamp(fd.add(fh.mul(oneMinus(fd))), 0.0, 1.0);
  }
  const mu = max(dot(rd, sd), 0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sunAmt: any = pow(mu, 8.0).mul(0.3);
  if (fh) sunAmt = sunAmt.add(pow(mu, 40.0).mul(fh).mul(vf.mul(0.25).add(0.2)));
  (scene as unknown as { fogNode: unknown }).fogNode = fog(mix(fogCol, sunCol.mul(1.1), clamp(sunAmt, 0.0, 0.62)), factor);
  return { color: fogCol, sunColor: sunCol, density: dens, volFog: vf, sunDir: sd } as { color: { value: THREE.Color }; sunColor: { value: THREE.Color }; density: { value: number }; volFog: { value: number }; sunDir: { value: THREE.Vector3 } };
}
