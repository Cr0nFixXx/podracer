import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';
import { macroTexture } from './textures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, cameraPosition, clamp, dot, exp, fog, max, min, mix, normalize, oneMinus, positionView, positionWorld, pow, smoothstep, step, texture, time, uniform, vec2 } = TSL;

/** Valley-haze strength per theme (0 = none, e.g. space) */
const HEIGHT_FOG: Record<string, number> = { desert: 0.32, mesa: 0.32, ice: 0.55, jungle: 0.65, malastare: 0.75, lava: 0.55, crystal: 0.5, aquilaris: 0.45, oovo: 0 };

/**
 * Volumetric aerial perspective as a TSL fog node (scene.fogNode, WebGPU + WebGL2, no extra pass):
 *  - exp² distance haze,
 *  - C¹-smooth analytic HEIGHT fog integrated along the view ray: full valley density below `baseY` and exponential falloff above
 *    (`ρ(u) = 1` for `u ≤ 0`, `exp(-b·u)` for `u > 0`, antiderivative `F(u) = min(u,0) + (1 - exp(-b·max(u,0)))/b`).
 *    Unlike clamping `max(y - baseY, 0)` (which created a visible floating fog ceiling whenever diving downhill below `baseY`),
 *    descending into deep valleys, canyons or underwater approaches stays completely continuous without any mid-air layer!
 *  - drifting FOG BANKS: smoothly 3D-scrolled noise taps along the ray (explicit LOD → uniform-flow safe in WGSL),
 *  - forward (Mie) in-scattering towards the sun.
 */
export function applyAtmosphere(scene: THREE.Scene, theme: ThemeDef, density: number, baseY: number, sunDir: THREE.Vector3, volFog = 0.25, quality = 2) {
  const fogCol = uniform(new THREE.Color(theme.fogColor)), sunCol = uniform(new THREE.Color(theme.sunColor)), vf = uniform(volFog);
  const dens = uniform(density), sd = uniform(sunDir.clone().normalize());
  const hStr = HEIGHT_FOG[theme.id] ?? 0.4;
  const dist = positionView.length();
  const toFrag = positionWorld.sub(cameraPosition), rd = normalize(toFrag);
  const fd = oneMinus(exp(dens.mul(dist).pow(2).negate()));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let factor: any = fd, fh: any = null;
  const hOn = uniform(quality > 0 ? 1 : 0), bankOn = uniform(quality >= 2 ? 1 : 0);
  if (hStr > 0) {
    const a = vf.mul(2.0).add(1.0).mul(0.00145 * hStr), b = 0.022;
    const u0 = cameraPosition.y.sub(baseY), u1 = positionWorld.y.sub(baseY);
    // Exact C¹ antiderivative of piecewise ρ(u) = (u <= 0 ? 1 : exp(-b*u)): continuous value & slope across u = 0 (zero shelf!)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const F = (u: any) => min(u, 0.0).add(oneMinus(exp(max(u, 0.0).mul(-b))).div(b));
    const du = u1.sub(u0), duSafe = mix(min(du, -0.05), max(du, 0.05), step(0.0, du));
    const integralAvg = F(u1).sub(F(u0)).div(duSafe);
    // Exact L'Hôpital limit for near-horizontal rays (avoids 0/0 precision bands at any height, including u < 0)
    const uMid = u0.add(u1).mul(0.5);
    const localRho = exp(max(uMid, 0.0).mul(-b));
    const rhoAvg = clamp(mix(localRho, integralAvg, smoothstep(0.04, 0.35, abs(du))), 0.0, 1.0).mul(a);
    const m = macroTexture(); const drift = vec2(time.mul(0.0052), time.mul(0.0031));
    const pA = cameraPosition.xz.add(toFrag.xz.mul(0.5)), pB = cameraPosition.xz.add(toFrag.xz.mul(0.86));
    const n = texture(m, pA.mul(0.0011).add(drift)).level(0).r.mul(0.62).add(texture(m, pB.mul(0.0027).sub(drift.mul(1.7))).level(0).g.mul(0.38));
    // Soften fog-bank contrast slightly at close range so banks never read as a sharp overhead curtain on steep descents
    const bankFade = smoothstep(25.0, 180.0, dist);
    const bank = mix(1.0, clamp(n.sub(0.5).mul(vf.mul(0.48).add(0.3).mul(2.0)).mul(bankFade).add(1.0), 0.32, 1.95), bankOn);
    fh = oneMinus(exp(rhoAvg.mul(dist).mul(bank).negate())).mul(hOn);
    factor = clamp(fd.add(fh.mul(oneMinus(fd))), 0.0, 1.0);
  }
  const mu = max(dot(rd, sd), 0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sunAmt: any = pow(mu, 8.0).mul(0.3);
  if (fh) sunAmt = sunAmt.add(pow(mu, 40.0).mul(fh).mul(vf.mul(0.25).add(0.2)));
  (scene as unknown as { fogNode: unknown }).fogNode = fog(mix(fogCol, sunCol.mul(1.1), clamp(sunAmt, 0.0, 0.62)), factor);
  return { color: fogCol, sunColor: sunCol, density: dens, volFog: vf, sunDir: sd, hOn, bankOn } as { hOn: { value: number }; bankOn: { value: number }; color: { value: THREE.Color }; sunColor: { value: THREE.Color }; density: { value: number }; volFog: { value: number }; sunDir: { value: THREE.Vector3 } };
}
