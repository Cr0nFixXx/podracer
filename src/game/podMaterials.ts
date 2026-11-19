import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { braidNormal, carbonTexture, hazardTexture, hullTextures, interiorTextures } from './podTextures';
import type { MatKey } from './podKit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  userData: userDataN, floor: floorN, abs, attribute, clamp, cos, cross, dFdx, dFdy, dot, float, fract, fwidth, inverseSqrt, length,
  materialColor, materialMetalness, materialRoughness, max, min, mix,
  normalView, normalViewGeometry, normalize, oneMinus, positionLocal, positionView, positionViewDirection, pow, select, sin, smoothstep, step, texture, uniform, uv, vec2, vec3, vertexColor,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/** Global shared animation clock for all opponent flames & energy binders (1 uniform update/frame). */
export const podSharedTime = uniform(0);

/** Pre-scaled derivative TBN for pod hulls (128× scale prevents float32 underflow; guards caps & silhouette edges). */
function safeHullNormal(nTex: THREE.Texture, tuv: N, scale: number) {
  const tsN = texture(nTex, tuv).xyz.mul(2).sub(1);
  const p = positionView, Nn = normalize(normalView);
  const dp1 = dFdx(p).mul(128.0), dp2 = dFdy(p).mul(128.0);
  const duv1 = dFdx(tuv).mul(128.0), duv2 = dFdy(tuv).mul(128.0);
  const dp2p = cross(dp2, Nn), dp1p = cross(Nn, dp1);
  const T = dp2p.mul(duv1.x).add(dp1p.mul(duv2.x));
  const B = dp2p.mul(duv1.y).add(dp1p.mul(duv2.y));
  const det = max(dot(T, T), dot(B, B));
  const quadJump = dot(dp1, dp1).add(dot(dp2, dp2));
  const valid = smoothstep(1e-7, 2e-6, det).mul(ssInv(90000.0, 20000.0, quadJump)).mul(ssInv(85.0, 18.0, length(p))).mul(scale);
  const sc = inverseSqrt(max(det, float(1e-7))).mul(valid);
  return normalize(T.mul(tsN.x.mul(sc)).add(B.mul(tsN.y.mul(sc)).add(Nn.mul(max(tsN.z, float(0.4))))));
}

export interface HullU { uPaint2: { value: THREE.Color }; uGlowCol: { value: THREE.Color }; uWear: { value: number }; uScorch: { value: number }; uHeat: { value: number }; uGrime: { value: number }; uLivery: { value: number }; }

/** Full hero hull material (player pod & Hangar showcase): clearcoat, chipped metal, grime, scorch, heat glow & LEDs. */
export function hullMaterial(c1: string, c2: string, glow: string, livery: number, texSize: number) {
  const tex = hullTextures(texSize);
  const mat = new THREE.MeshPhysicalNodeMaterial();
  mat.color = new THREE.Color(c1); mat.metalness = 0.48; mat.roughness = 0.34;
  mat.clearcoat = 0.82; mat.clearcoatRoughness = 0.14; mat.envMapIntensity = 0.95;
  const u = {
    uPaint2: uniform(new THREE.Color(c2)), uGlowCol: uniform(new THREE.Color(glow)), uWear: uniform(0.28),
    uScorch: uniform(0), uHeat: uniform(0), uGrime: uniform(0.75), uLivery: uniform(livery),
  };
  mat.userData.u = u;
  const L = attribute('aLiv', 'vec3'); const tuv = uv();
  const hMask = texture(tex.mask, tuv), hDec = texture(tex.decal, tuv);

  const c = L.x, a = L.y; const cd = min(c, oneMinus(c));
  const aaC = fwidth(cd).mul(1.5).add(1e-4), aaA = fwidth(a).mul(1.5).add(1e-4);
  const side0 = abs(cd.sub(0.25).add(a.sub(0.5).mul(0.12))), side1 = abs(cd.sub(0.25));
  const aaS0 = fwidth(side0).mul(1.5).add(1e-4), aaS1 = fwidth(side1).mul(1.5).add(1e-4);
  const band = (x: N, cc: number, w: N, aa: N) => oneMinus(smoothstep(float(w).sub(aa), float(w).add(aa), abs(x.sub(cc))));
  const eng = livery === 0 ? max(band(cd, 0.0, 0.06, aaC), band(a, 0.8, 0.035, aaA))
    : livery === 1 ? max(max(band(cd, 0.05, 0.018, aaC), band(cd, 0.0, 0.012, aaC)), step(0.86, a))
    : livery === 2 ? (() => { const ez = float(0.12).add(abs(fract(a.mul(5)).sub(0.5)).mul(0.16)); return oneMinus(smoothstep(ez.sub(aaC), ez.add(aaC), cd)).mul(step(0.14, a)); })()
    : max(max(band(a, 0.25, 0.04, aaA), band(a, 0.7, 0.04, aaA)), band(side1, 0.0, 0.03, aaS1).mul(step(0.3, a)).mul(step(a, 0.65)));
  const ck0 = max(band(side0, 0.0, a.mul(0.02).add(0.035), aaS0), step(0.9, a));
  const ck = livery >= 2 ? max(ck0, band(cd, 0.0, 0.05, aaC)) : ck0;
  const livM = clamp(select(L.z.lessThan(0.5), float(0), select(L.z.greaterThan(2.5), float(1), select(L.z.lessThan(1.5), eng, ck))), 0.0, 1.0);

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
  mat.roughnessNode = clamp(mix(materialRoughness.mul(hMask.g.mul(0.55).add(0.72)), hMask.g.mul(0.28).add(0.3), hWear).add(hGrime.mul(0.34)).add(hScorch.mul(0.42)), 0.12, 1.0);
  mat.metalnessNode = mix(materialMetalness, float(0.95), hWear).mul(oneMinus(hScorch.mul(0.7))).mul(oneMinus(hGrime.mul(0.3)));
  mat.clearcoatNode = float(0.82).mul(oneMinus(hWear)).mul(oneMinus(hGrime.mul(0.7))).mul(oneMinus(hScorch));
  mat.normalNode = safeHullNormal(tex.normal, tuv, 0.85);
  // Session 17 – heat glow as the overheating indicator: it starts dull red at the nozzle (a = 0) and creeps forward along the engine as
  // the heat rises; the local temperature fades towards the front, so the colour runs yellow-white → orange → dark red and only reaches the
  // binder mount faintly at the limit.
  const hT = clamp(u.uHeat.mul(1.3).sub(a.mul(1.45)), 0.0, 1.3);
  const hCol = mix(mix(vec3(0.5, 0.03, 0.0), vec3(1.0, 0.3, 0.04), smoothstep(0.1, 0.5, hT)), vec3(1.0, 0.88, 0.4), smoothstep(0.55, 1.05, hT));
  const hGlow = hCol.mul(smoothstep(0.0, 0.35, hT).mul(0.85).add(pow(hT, 3.0).mul(1.5))).mul(hMask.a.mul(0.35).add(0.65));
  mat.emissiveNode = u.uGlowCol.mul(hDec.b.mul(1.3)).add(hGlow);
  return mat;
}

/**
 * SINGLE shared PBR hull pipeline across ALL 10 AI opponent pods!
 * Primary & secondary livery paint are pre-evaluated into vertex `color` so 10 rivals compile & bind
 * ONE single WebGPU pipeline instead of 10 separate NodeMaterials (eliminates start-grid lag!).
 */
const oppHullCache = new Map<number, THREE.MeshStandardNodeMaterial>();
export function sharedOpponentHullMaterial(texSize: number) {
  const hit = oppHullCache.get(texSize); if (hit) return hit;
  const tex = hullTextures(texSize);
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  mat.metalness = 0.48; mat.roughness = 0.28; mat.envMapIntensity = 0.92;
  const tuv = uv();
  const hMask = texture(tex.mask, tuv), hDec = texture(tex.decal, tuv);
  const hWear = smoothstep(0.66, 0.78, hMask.b);
  const hGrime = clamp(hMask.a.mul(0.72), 0.0, 1.0);
  let col: N = vertexColor();
  col = mix(col, vec3(0.025), hDec.r.mul(0.88));
  col = mix(col, vec3(0.78, 0.56, 0.07), hDec.g);
  col = mix(col, vec3(0.52, 0.53, 0.56), hWear);
  col = col.mul(mix(vec3(1), vec3(0.44, 0.38, 0.32), hGrime));
  mat.colorNode = col.mul(hMask.r);
  mat.roughnessNode = clamp(mix(hMask.g.mul(0.18).add(0.22), float(0.34), hWear).add(hGrime.mul(0.32)), 0.14, 1.0);
  mat.metalnessNode = mix(float(0.48), float(0.94), hWear).mul(oneMinus(hGrime.mul(0.28)));
  mat.normalNode = safeHullNormal(tex.normal, tuv, 0.7);
  mat.emissiveNode = vec3(1.0, 0.68, 0.28).mul(hDec.b.mul(0.9));
  mat.userData.shared = true;
  oppHullCache.set(texSize, mat);
  return mat;
}

/** SINGLE shared exhaust-plume pipeline for ALL AI opponent pods (glow colour baked in vertexColor). */
let oppFlameCache: THREE.MeshBasicNodeMaterial | null = null;
export function sharedOpponentFlameMaterial() {
  if (oppFlameCache) return oppFlameCache;
  const mat = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const L = attribute('aLiv', 'vec3'); const t = oneMinus(L.y); const ang = L.x.mul(Math.PI * 2);
  const fl = sin(ang.mul(3.0).add(t.mul(9.0)).sub(podSharedTime.mul(22.0))).mul(0.3).add(0.72);
  const dia = pow(abs(sin(t.mul(18.0).sub(podSharedTime.mul(3.0)))), 3.0).mul(0.45).add(0.55);
  const fade = pow(clamp(oneMinus(t), 0.0, 1.0), 1.3).mul(smoothstep(0.0, 0.05, t.add(0.01)));
  const edge = pow(abs(dot(normalViewGeometry, positionViewDirection)), 1.3);
  mat.colorNode = mix(vertexColor(), vec3(1.0, 0.96, 0.9), pow(clamp(oneMinus(t), 0.0, 1.0), 1.8).mul(0.65));
  mat.opacityNode = clamp(fade.mul(edge).mul(fl).mul(dia).mul(0.92), 0.0, 1.0);
  mat.userData.shared = true;
  oppFlameCache = mat;
  return mat;
}

/** SINGLE shared GPU-animated energy-binder pipeline for ALL AI opponent pods. */
let oppBinderCache: THREE.MeshBasicNodeMaterial | null = null;
/** Session 14 – energy binder look shared by player and rivals: white-hot core, soft halo, two forked arcs that wander across the
 *  ribbon, 24 Hz random strobe and bright pulses racing from engine to engine. Returns [white amount, opacity]. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function boltLook(f: any, y: any, t: any): [any, any] {
  // Session 17: finer and several at once – a hair-thin core plus four thin arcs that wander independently across the ribbon and
  // flicker on and off on their own; bright pulses still race from engine to engine.
  const c = y.mul(2).sub(1), ac = oneMinus(abs(c));
  const core = pow(ac, 26.0).mul(0.85), halo = pow(ac, 2.6).mul(0.13);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let arcs: any = float(0.0);
  const A: [number, number, number, number, number][] = [[21, 33, 47, 58, 0.5], [17, -41, 61, 77, 0.62], [29, 52, 39, -66, 0.72], [13, -27, 71, 93, 0.8]];
  A.forEach(([f1, s1, f2, s2, amp], k) => {
    const wv = sin(f.mul(f1).add(t.mul(s1)).add(k * 1.7)).mul(amp * 0.7).add(sin(f.mul(f2).sub(t.mul(s2))).mul(amp * 0.3));
    const on = step(0.28, fract(sin(floorN(t.mul(17.0 + k * 3)).add(k * 7.1).mul(91.7)).mul(43758.5)));
    arcs = arcs.add(pow(oneMinus(clamp(abs(c.sub(wv)), 0.0, 1.0)), 48.0).mul(on));
  });
  const pulse = pow(sin(f.mul(9.0).sub(t.mul(24.0))).mul(0.5).add(0.5), 6.0).mul(0.8);
  const ends = smoothstep(0.0, 0.05, f).mul(ssInv(1.0, 0.95, f));
  return [clamp(core.add(arcs).mul(0.9), 0.0, 1.0), core.add(halo).add(arcs.mul(0.95)).mul(pulse.add(0.75)).mul(ends)];
}

export function sharedOpponentBinderMaterial() {
  if (oppBinderCache) return oppBinderCache;
  const mat = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const vUv = uv(); const f = vUv.x; const env = sin(f.mul(Math.PI));
  const jigY = sin(podSharedTime.mul(36.0).add(f.mul(14.0))).mul(0.26).add(sin(podSharedTime.mul(71.0).sub(f.mul(31.0))).mul(0.1));
  const jigZ = cos(podSharedTime.mul(27.0).add(f.mul(11.0))).mul(0.16);
  mat.positionNode = positionLocal.add(vec3(0.0, env.mul(float(0.16).add(jigY)), env.mul(jigZ)));
  const [wh, al] = boltLook(f, vUv.y, podSharedTime);
  mat.colorNode = mix(vertexColor(), vec3(1), wh).mul(1.7);
  mat.opacityNode = clamp(al.mul(0.95), 0.0, 1.0);
  mat.userData.shared = true;
  oppBinderCache = mat;
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
  const m: Partial<Record<MatKey, THREE.Material>> = {
    chrome: new THREE.MeshStandardMaterial({ color: '#e2e6ec', metalness: 0.96, roughness: 0.18, envMapIntensity: 1.05 }),
    steel: new THREE.MeshStandardMaterial({ color: '#8d929b', metalness: 0.9, roughness: 0.42, roughnessMap: t.mask, envMapIntensity: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: '#202228', metalness: 0.76, roughness: 0.56, roughnessMap: t.mask, envMapIntensity: 0.85 }),
    copper: new THREE.MeshStandardMaterial({ color: '#b9713d', metalness: 0.95, roughness: 0.32, envMapIntensity: 1.0 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#151517', metalness: 0.08, roughness: 0.65, normalMap: braid, normalScale: new THREE.Vector2(0.7, 0.7) }),
    carbon: new THREE.MeshStandardMaterial({ map: carbon, metalness: 0.32, roughness: 0.28, envMapIntensity: 1.0 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fd4ff', metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.28, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ map: it.map, emissiveMap: it.emissive, emissive: '#ffffff', emissiveIntensity: 0.85, roughness: 0.72, metalness: 0.1, side: THREE.DoubleSide }),
    leather: new THREE.MeshStandardMaterial({ color: '#4a3226', roughness: 0.74, metalness: 0.0 }),
    skin: new THREE.MeshStandardMaterial({ color: '#b98c68', roughness: 0.64 }),
    visor: new THREE.MeshStandardMaterial({ color: '#0e1a24', metalness: 0.92, roughness: 0.14, envMapIntensity: 1.25 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.52, metalness: 0.22 }),
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

/* ------------------------------------- hero player exhaust, binder & flex cables ------------------------------------- */
export interface FxU { uColor: { value: THREE.Color }; uTime: { value: number }; uPower: { value: number }; uLift?: { value: THREE.Vector2 }; }

export function flameMaterial(color: THREE.Color, core: boolean) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = { uColor: uniform(color.clone()), uTime: uniform(0), uPower: uniform(1) };
  const coreF = core ? 1 : 0;
  const L = attribute('aLiv', 'vec3'); const t = oneMinus(L.y);
  const ang = L.x.mul(Math.PI * 2);
  const w1 = sin(ang.mul(3.0).add(t.mul(9.0)).sub(u.uTime.mul(22.0))).mul(0.5).add(0.5);
  const w2 = cos(ang.mul(5.0).sub(t.mul(17.0)).add(u.uTime.mul(31.0))).mul(0.5).add(0.5);
  const fl = w1.mul(0.6).add(w2.mul(0.4));
  const dia = pow(abs(sin(t.mul(19.0).sub(u.uTime.mul(3.0)))), 3.0).mul(0.45).add(0.55);
  const fade = pow(clamp(oneMinus(t), 0.0, 1.0), 1.35).mul(smoothstep(0.0, 0.05, t.add(0.01)));
  const edge = pow(abs(dot(normalViewGeometry, positionViewDirection)), 1.35);
  mat.colorNode = mix(u.uColor, vec3(1.0, 0.96, 0.9), oneMinus(t).mul(0.7 * coreF));
  mat.opacityNode = clamp(fade.mul(edge).mul(fl.mul(0.75).add(0.42)).mul(mix(float(1), dia, 0.25 + 0.4 * coreF)).mul(u.uPower), 0.0, 1.0);
  mat.userData.u = u;
  return mat;
}

/** GPU-animated energy binder that also dynamically tilts diagonally (`uLift.xy`) as L/R engines heave up and down! */
export function binderMaterial(color: THREE.Color) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = { uColor: uniform(color.clone()), uTime: uniform(0), uPower: uniform(1), uLift: uniform(new THREE.Vector2(0, 0)) };
  const vUv = uv(); const f = vUv.x; const env = sin(f.mul(Math.PI));
  const endLift = mix(u.uLift.x, u.uLift.y, f);
  const jigY = sin(u.uTime.mul(38.0).add(f.mul(14.0))).mul(0.27).add(sin(u.uTime.mul(67.0).sub(f.mul(29.0))).mul(0.13));
  const jigZ = cos(u.uTime.mul(29.0).add(f.mul(11.0))).mul(0.17);
  mat.positionNode = positionLocal.add(vec3(0.0, endLift.add(env.mul(float(0.18).add(jigY))), env.mul(jigZ)));
  const [wh, al] = boltLook(f, vUv.y, u.uTime);
  mat.colorNode = mix(u.uColor, vec3(1), wh).mul(1.8);
  mat.opacityNode = clamp(al.mul(u.uPower), 0.0, 1.0);
  mat.userData.u = u;
  return mat;
}

/** Flexible GPU control-cable material: stays pinned to cockpit (`aLiv.y = 0`) and rides smoothly with L/R engine pylon (`aLiv.y = 1`)! */
export function cableFlexMaterial() {
  const braid = braidNormal().clone(); braid.repeat.set(26, 6); braid.needsUpdate = true;
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#17171a', metalness: 0.14, roughness: 0.58 });
  const uLift = uniform(new THREE.Vector2(0, 0)); // x = left engine Y offset, y = right engine Y offset
  const L = attribute('aLiv', 'vec3'); // x = 0 (left) or 1 (right), y = 0 (cockpit anchor) .. 1 (engine pylon)
  const lift = mix(uLift.x, uLift.y, L.x).mul(L.y);
  const uCk = uniform(new THREE.Vector3()); // cockpit sway: the cockpit end of every cable follows it, the engine end stays
  mat.positionNode = positionLocal.add(vec3(0.0, lift, 0.0)).add(uCk.mul(oneMinus(clamp(L.y, 0.0, 1.0))));
  mat.userData.uCk = uCk;
  mat.normalNode = safeHullNormal(braid, uv().mul(vec2(26.0, 6.0)), 0.65);
  mat.userData.uLift = uLift;
  return mat;
}

/** Session 16 – nozzle petals of every pod (player, rivals, hangar) share ONE material; the opening comes per mesh from `mesh.userData.open` (0..1). */
let petalMat: THREE.MeshStandardNodeMaterial | null = null;
export function petalMaterial() {
  if (petalMat) return petalMat;
  const m = new THREE.MeshStandardNodeMaterial({ color: '#30333a', metalness: 0.86, roughness: 0.36, side: THREE.DoubleSide });
  const A = attribute('aPet', 'vec3'), open = userDataN('open', 'float');
  m.positionNode = positionLocal.add(vec3(A.x, A.y, 0.0).mul(A.z).mul(open));
  m.emissiveNode = vec3(1.0, 0.42, 0.1).mul(open).mul(A.z).mul(0.9); // tips glow when the nozzle is wide open
  m.userData.shared = true; petalMat = m;
  return m;
}
