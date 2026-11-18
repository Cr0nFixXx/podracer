// Geometric specular anti-aliasing (session 7). Fixes flickering/sparkling highlights on glossy,
// normal-mapped surfaces (puddles, ice, wet roads, frozen lakes, pod chrome): roughness is widened by the
// screen-space variance of the shading normal (Tokuyoshi & Kaplanyan 2019) plus a gentle distance floor
// (mip-averaged normals far away hide micro-variance the BRDF can no longer resolve).
import * as TSLmod from 'three/tsl';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { dFdx, dFdy, dot, min, sqrt, max, smoothstep, normalView, positionView, length, float } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
/** @param rough roughness node; @param strength variance gain (≈ 1); @param far distance-floor roughness */
export function specAA(rough: N, strength = 1, far = 0.16): N {
  const n = normalView; const dx = dFdx(n), dy = dFdy(n);
  const variance = dot(dx, dx).add(dot(dy, dy)).mul(0.5 * strength);
  const kernel = min(variance.mul(2.0), float(0.18));
  const r = sqrt(rough.mul(rough).add(kernel));
  const dist = length(positionView);
  return max(r, smoothstep(25.0, 260.0, dist).mul(far));
}
