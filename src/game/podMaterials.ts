import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { braidNormal, carbonTexture, hazardTexture, hullTextures, interiorTextures } from './podTextures';
import type { MatKey } from './podKit';

// TSL's TypeScript generics are stricter than the runtime API – shader graphs are typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  abs, attribute, clamp, cos, dot, float, fract, fwidth, materialColor, materialMetalness, materialRoughness, max, min, mix, mx_noise_float,
  normalMap, normalViewGeometry, oneMinus, positionViewDirection, pow, select, sin, smoothstep, step, texture, uniform, uv, vec2, vec3,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
/** smoothstep with falling edge (a > b) – WGSL/GLSL leave reversed edges undefined */
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/* ------------------------------------------------------------------------------------------------
 * Hull paint (TSL node material): procedural livery from the aLiv attribute, chipped paint exposing
 * bare metal, grime, scorch marks + heat glow (engine damage), emissive panel lights, clearcoat.
 * ---------------------------------------------------------------------------------------------- */
export interface HullU { uPaint2: { value: THREE.Color }; uGlowCol: { value: THREE.Color }; uWear: { value: number }; uScorch: { value: number }; uHeat: { value: number }; uGrime: { value: number }; uLivery: { value: number }; }

export function hullMaterial(c1: string, c2: string, glow: string, livery: number, texSize: number) {
  const tex = hullTextures(texSize);
  const mat = new THREE.MeshPhysicalNodeMaterial();
  mat.color = new THREE.Color(c1); mat.metalness = 0.45; mat.roughness = 0.36; mat.clearcoat = 0.85; mat.clearcoatRoughness = 0.1; mat.envMapIntensity = 1;
  const u = {
    uPaint2: uniform(new THREE.Color(c2)), uGlowCol: uniform(new THREE.Color(glow)), uWear: uniform(0.28),
    uScorch: uniform(0), uHeat: uniform(0), uGrime: uniform(0.75), uLivery: uniform(livery),
  };
  mat.userData.u = u;
  const L = attribute('aLiv', 'vec3'); const tuv = uv();
  const hMask = texture(tex.mask, tuv), hDec = texture(tex.decal, tuv);

  // ---- livery mask (branch-free; derivatives taken up-front) ----
  const c = L.x, a = L.y; const cd = min(c, oneMinus(c)); // 0 = top .. 0.5 = bottom
  const aaC = fwidth(cd).mul(1.5).add(1e-4), aaA = fwidth(a).mul(1.5).add(1e-4);
  const side0 = abs(cd.sub(0.25).add(a.sub(0.5).mul(0.12))), side1 = abs(cd.sub(0.25));
  const aaS0 = fwidth(side0).mul(1.5).add(1e-4), aaS1 = fwidth(side1).mul(1.5).add(1e-4);
  const band = (x: N, cc: number, w: N, aa: N) => oneMinus(smoothstep(float(w).sub(aa), float(w).add(aa), abs(x.sub(cc))));
  const e0 = max(band(cd, 0.0, 0.06, aaC), band(a, 0.8, 0.035, aaA));
  const e1 = max(max(band(cd, 0.05, 0.018, aaC), band(cd, 0.0, 0.012, aaC)), step(0.86, a));
  const ez = float(0.12).add(abs(fract(a.mul(5)).sub(0.5)).mul(0.16));
  const e2 = oneMinus(smoothstep(ez.sub(aaC), ez.add(aaC), cd)).mul(step(0.14, a));
  const e3 = max(max(band(a, 0.25, 0.04, aaA), band(a, 0.7, 0.04, aaA)), band(side1, 0.0, 0.03, aaS1).mul(step(0.3, a)).mul(step(a, 0.65)));
  const lv = u.uLivery;
  const eng = select(lv.lessThan(0.5), e0, select(lv.lessThan(1.5), e1, select(lv.lessThan(2.5), e2, e3)));
  const ck0 = max(band(side0, 0.0, a.mul(0.02).add(0.035), aaS0), step(0.9, a));
  const ck = select(lv.greaterThan(1.5), max(ck0, band(cd, 0.0, 0.05, aaC)), ck0);
  const livM = clamp(select(L.z.lessThan(0.5), float(0), select(L.z.greaterThan(2.5), float(1), select(L.z.lessThan(1.5), eng, ck))), 0.0, 1.0);

  // ---- albedo / wear / grime / scorch ----
  const wt = oneMinus(u.uWear);
  const hWear = smoothstep(wt.sub(0.06), wt.add(0.06), hMask.b);
  let col = mix(materialColor, u.uPaint2, livM);
  col = mix(col, vec3(0.025), hDec.r.mul(0.9));
  col = mix(col, vec3(0.78, 0.56, 0.07), hDec.g);
  col = mix(col, vec3(0.52, 0.53, 0.56), hWear);
  const hGrime = clamp(hMask.a.mul(u.uGrime), 0.0, 1.0);
  col = col.mul(mix(vec3(1), vec3(0.42, 0.36, 0.3), hGrime));
  const hScorch = clamp(u.uScorch.mul(ssInv(0.72, 0.0, a)).mul(hMask.a.mul(0.7).add(0.55)), 0.0, 0.95);
  col = mix(col, vec3(0.02, 0.018, 0.016), hScorch);
  mat.colorNode = col.mul(hMask.r);
  mat.roughnessNode = clamp(mix(materialRoughness.mul(hMask.g.mul(0.6).add(0.7)), hMask.g.mul(0.3).add(0.28), hWear).add(hGrime.mul(0.35)).add(hScorch.mul(0.45)), 0.04, 1.0);
  mat.metalnessNode = mix(materialMetalness, float(1), hWear).mul(oneMinus(hScorch.mul(0.7))).mul(oneMinus(hGrime.mul(0.3)));
  mat.clearcoatNode = float(0.85).mul(oneMinus(hWear)).mul(oneMinus(hGrime.mul(0.7))).mul(oneMinus(hScorch));
  mat.normalNode = normalMap(texture(tex.normal, tuv), vec2(0.85, 0.85));
  mat.emissiveNode = u.uGlowCol.mul(hDec.b.mul(1.5)).add(vec3(1.0, 0.32, 0.06).mul(hScorch).mul(u.uHeat).mul(1.4).mul(ssInv(0.35, 0.0, a)));
  return mat;
}

/* ---------------------------------- shared (colour independent) ---------------------------------- */
const sharedCache = new Map<number, Partial<Record<MatKey, THREE.Material>>>();
const suitCache = new Map<string, THREE.MeshStandardMaterial>();

export function sharedPodMaterials(texSize: number) {
  const hit = sharedCache.get(texSize); if (hit) return hit;
  const t = hullTextures(texSize); const it = interiorTextures();
  const braid = braidNormal().clone(); braid.repeat.set(26, 6); braid.needsUpdate = true;
  const carbon = carbonTexture().clone(); carbon.repeat.set(9, 9); carbon.needsUpdate = true;
  const hazard = hazardTexture().clone(); hazard.repeat.set(5, 5); hazard.needsUpdate = true;
  const n = (s: number) => new THREE.Vector2(s, s);
  const m: Partial<Record<MatKey, THREE.Material>> = {
    chrome: new THREE.MeshStandardMaterial({ color: '#e2e6ec', metalness: 1, roughness: 0.13, normalMap: t.normal, normalScale: n(0.22) }),
    steel: new THREE.MeshStandardMaterial({ color: '#8d929b', metalness: 0.92, roughness: 0.42, roughnessMap: t.mask, normalMap: t.normal, normalScale: n(0.7) }),
    dark: new THREE.MeshStandardMaterial({ color: '#202228', metalness: 0.78, roughness: 0.55, roughnessMap: t.mask, normalMap: t.normal, normalScale: n(0.8) }),
    copper: new THREE.MeshStandardMaterial({ color: '#b9713d', metalness: 1, roughness: 0.3, normalMap: t.normal, normalScale: n(0.3) }),
    rubber: new THREE.MeshStandardMaterial({ color: '#151517', metalness: 0.1, roughness: 0.62, normalMap: braid, normalScale: n(0.9) }),
    carbon: new THREE.MeshPhysicalMaterial({ map: carbon, metalness: 0.2, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#9fd4ff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.28, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ map: it.map, emissiveMap: it.emissive, emissive: '#ffffff', emissiveIntensity: 0.9, normalMap: it.normal, normalScale: n(0.9), roughness: 0.72, metalness: 0.1, side: THREE.DoubleSide }),
    leather: new THREE.MeshStandardMaterial({ color: '#4a3226', roughness: 0.72, metalness: 0.0, normalMap: t.normal, normalScale: n(0.15) }),
    skin: new THREE.MeshStandardMaterial({ color: '#b98c68', roughness: 0.62 }),
    visor: new THREE.MeshStandardMaterial({ color: '#0e1a24', metalness: 0.95, roughness: 0.05, envMapIntensity: 2 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.5, metalness: 0.25, normalMap: t.normal, normalScale: n(0.4) }),
  };
  for (const mat of Object.values(m)) mat!.userData.shared = true;
  sharedCache.set(texSize, m);
  return m;
}

export function suitMaterial(color: string) {
  let m = suitCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.05 }); m.userData.shared = true; suitCache.set(color, m); }
  return m;
}

/* ------------------------------------- exhaust & binder FX ------------------------------------- */
export interface FxU { uColor: { value: THREE.Color }; uTime: { value: number }; uPower: { value: number }; }

/** Energy exhaust plume with flicker and shock diamonds. Geometry: lathe with aLiv.y = 0 tip .. 1 nozzle. */
export function flameMaterial(color: THREE.Color, core: boolean) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = { uColor: uniform(color.clone()), uTime: uniform(0), uPower: uniform(1) };
  const seed = Math.random() * 20, coreF = core ? 1 : 0;
  const L = attribute('aLiv', 'vec3'); const t = oneMinus(L.y);
  const ang = L.x.mul(Math.PI * 2); const cx = cos(ang), sx = sin(ang); // seamless around the plume
  const n1 = mx_noise_float(vec3(cx.mul(1.3), sx.mul(1.3), t.mul(5).sub(u.uTime.mul(14)).add(seed))).mul(0.5).add(0.5);
  const n2 = mx_noise_float(vec3(cx.mul(3.1).add(7), sx.mul(3.1), t.mul(11).sub(u.uTime.mul(23)))).mul(0.5).add(0.5);
  const fl = n1.mul(0.6).add(n2.mul(0.4));
  const dia = pow(abs(sin(t.mul(20).sub(u.uTime.mul(2.5)))), 3.0).mul(0.45).add(0.55);
  const fade = pow(clamp(oneMinus(t), 0.0, 1.0), 1.3).mul(smoothstep(0.0, 0.04, t.add(0.01)));
  const edge = pow(abs(dot(normalViewGeometry, positionViewDirection)), 1.4);
  const alpha = fade.mul(edge).mul(fl.mul(0.8).add(0.4)).mul(mix(float(1), dia, 0.25 + 0.4 * coreF)).mul(u.uPower);
  mat.colorNode = mix(u.uColor, vec3(1.0, 0.96, 0.9), oneMinus(t).mul(0.7 * coreF));
  mat.opacityNode = clamp(alpha, 0.0, 1.0);
  mat.userData.u = u;
  return mat;
}

/** Crackling energy binder ribbon between the engines (uv.x along, uv.y across). */
export function binderMaterial(color: THREE.Color) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = { uColor: uniform(color.clone()), uTime: uniform(0), uPower: uniform(1) };
  const vUv = uv(); const ac = oneMinus(abs(vUv.y.mul(2).sub(1)));
  const core = pow(ac, 7.0), halo = pow(ac, 1.6).mul(0.45);
  const fl = mx_noise_float(vec3(vUv.x.mul(28).sub(u.uTime.mul(45)), u.uTime.mul(9), 0.3)).mul(0.5).add(0.5).mul(0.45).add(0.55);
  const ends = smoothstep(0.0, 0.06, vUv.x).mul(ssInv(1.0, 0.94, vUv.x));
  mat.colorNode = mix(u.uColor, vec3(1), core.mul(0.75));
  mat.opacityNode = clamp(core.add(halo).mul(fl).mul(ends).mul(u.uPower), 0.0, 1.0);
  mat.userData.u = u;
  return mat;
}
