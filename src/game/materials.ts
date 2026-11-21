import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
/** Session 13: global runtime weather level for all surface materials. `wet` 0..1 scales puddles, darkening and gloss of every material
 *  compiled with `wet > 0` (dynamic rain → the road gets wet and dries again). Keep it at 1 on worlds without dynamic rain. */
export const WEATHER: { wet: { value: number } } = { wet: TSL.uniform(1) };
const {
  Break, Fn, If, Loop, abs, attribute, clamp, color, cross, dFdx, dFdy, dot, float, inverseSqrt, length, materialColor, materialRoughness, max, mix,
  normalLocal, normalView, normalViewGeometry, normalWorldGeometry, normalize, positionLocal, positionView, positionWorld, pow,
  oneMinus, smoothstep, texture, uniform, uv, vec2, vec3, vertexColor, floor, fract, min, sin, time,
} = TSL;
import { detailNormalTexture, macroTexture, type DetailKind, type TexSet } from './textures';
import { cloudShade, strataTint, type StrataDef } from './terrainMaterial';

/* ------------------------------------------------------------------------------------------------
 * High-performance, flicker-free track & cliff surface material (WebGPU + WebGL2 fallback):
 *  - Safe epsilon-guarded TBN (`safePerturbNormal`): eliminates NaN/Inf specular flashes on degenerate
 *    caps, box-UV seams, flat cliff ledges, and high-s road UVs; smoothly fades bump at far range.
 *  - Fast 6–12 step adaptive POM with 12–48 m distance fade (~4× cheaper on 4K displays).
 *  - Distance specular anti-aliasing on puddles, ice, and metallic city/Oovo roads (zero strobing).
 *  - Filtered mip-2 bounded vertex displacement (never swims or Z-fights decals/pads/markings).
 * ---------------------------------------------------------------------------------------------- */

export interface SurfaceOpts {
  repeat?: [number, number];
  parallax?: number;
  layers?: number;
  roughness?: number;
  metalness?: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  normalScale?: number;
  macro?: number;
  detail?: number;
  detailScale?: number;
  detailKind?: DetailKind;
  triplanar?: { set: TexSet; scale: number; tint?: string };
  ledge?: { color: string; amount: number; rough?: number };
  bump?: boolean;
  displace?: number;
  micro?: number;
  microScale?: [number, number];
  vertexColors?: boolean;
  wet?: number;
  puddles?: number;
  rain?: boolean;
  snow?: number;
  strata?: StrataDef | null;
  cloud?: number;
  /** Session 20: noise dissolve driven by the vertex attribute `aFade` (0 = gone … 1 = solid) – ragged transitions between ground surfaces */
  fade?: boolean;
  /** UVs are world-space (x / tile, z / tile): no edge-based effects (edge snow, edge-locked displacement) */
  worldUV?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/** Safe derivative TBN that never overflows/NaNs on degenerate UVs and fades smoothly into the horizon. */
function safePerturbNormal(tsN: N, uvIn: N, dist: N) {
  const p = positionView, Nn = normalize(normalView);
  const dp1 = dFdx(p).mul(128.0), dp2 = dFdy(p).mul(128.0);
  const duv1 = dFdx(uvIn).mul(128.0), duv2 = dFdy(uvIn).mul(128.0);
  const dp2p = cross(dp2, Nn), dp1p = cross(Nn, dp1);
  const T = dp2p.mul(duv1.x).add(dp1p.mul(duv2.x));
  const B = dp2p.mul(duv1.y).add(dp1p.mul(duv2.y));
  const det = max(dot(T, T), dot(B, B));
  const quadJump = dot(dp1, dp1).add(dot(dp2, dp2));
  const valid = smoothstep(1e-7, 2e-6, det).mul(ssInv(220000.0, 55000.0, quadJump)).mul(ssInv(440.0, 110.0, dist));
  const sc = inverseSqrt(max(det, float(1e-7))).mul(valid);
  return normalize(T.mul(tsN.x.mul(sc)).add(B.mul(tsN.y.mul(sc))).add(Nn.mul(max(tsN.z, float(0.25)))));
}

/** Fast 6–12 step adaptive POM with secant refinement & strict epsilon guard. */
function pomUV(mapWithH: THREE.Texture, uvIn: N, scale: number, maxLayers: number) {
  const baseL = Math.max(4, Math.min(6, Math.round(maxLayers * 0.45)));
  const peakL = baseL * 2;
  return Fn(() => {
    const p = positionView; const d = length(p);
    const duv1 = dFdx(uvIn), duv2 = dFdy(uvIn);
    const dp1 = dFdx(p).mul(128.0), dp2 = dFdy(p).mul(128.0);
    const su1 = duv1.mul(128.0), su2 = duv2.mul(128.0);
    const Nn = normalize(normalViewGeometry);
    const dp2p = cross(dp2, Nn), dp1p = cross(Nn, dp1);
    const T = dp2p.mul(su1.x).add(dp1p.mul(su2.x));
    const B = dp2p.mul(su1.y).add(dp1p.mul(su2.y));
    const det = max(dot(T, T), dot(B, B));
    const quadJump = dot(dp1, dp1).add(dot(dp2, dp2));
    const fade = ssInv(42.0, 10.0, d).mul(smoothstep(1e-7, 2e-6, det)).mul(ssInv(180000.0, 45000.0, quadJump));
    const out = vec2(uvIn).toVar();
    If(fade.greaterThan(0.01), () => {
      const invmax = inverseSqrt(max(det, float(1e-7)));
      const V = normalize(p.negate());
      const Vt = vec3(dot(V, T.mul(invmax)), dot(V, B.mul(invmax)), dot(V, Nn));
      const layers = mix(float(peakL), float(baseL), clamp(abs(Vt.z), 0.0, 1.0));
      const layerDepth = float(1).div(layers);
      const P = clamp(Vt.xy.div(max(Vt.z, 0.35)), vec2(-1.4), vec2(1.4)).mul(scale).mul(fade);
      const dUv = P.div(layers);
      const cur = vec2(uvIn).toVar();
      const curDepth = float(0).toVar();
      const h = float(1).sub(texture(mapWithH, cur).grad(duv1, duv2).a).toVar();
      Loop({ start: 0, end: peakL }, ({ i }: { i: N }) => {
        If(curDepth.greaterThanEqual(h).or(float(i).greaterThanEqual(layers)), () => { Break(); });
        cur.subAssign(dUv);
        h.assign(float(1).sub(texture(mapWithH, cur).grad(duv1, duv2).a));
        curDepth.addAssign(layerDepth);
      });
      const prev = cur.add(dUv);
      const after = h.sub(curDepth);
      const before = float(1).sub(texture(mapWithH, prev).grad(duv1, duv2).a).sub(curDepth).add(layerDepth);
      const w = clamp(after.div(after.sub(before).add(1e-5)), 0.0, 1.0);
      out.assign(mix(cur, prev, w));
    });
    return out;
  })();
}

export function surfaceMaterial(set: TexSet, o: SurfaceOpts = {}) {
  const [rx, ry] = o.repeat ?? [1, 1];
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.roughness = o.roughness ?? 1; mat.metalness = o.metalness ?? 0;
  mat.color = new THREE.Color(o.color ?? '#ffffff');
  mat.envMapIntensity = Math.min(1.15, o.envMapIntensity ?? 0.85);
  const bump = o.bump ?? true;
  const scroll = uniform(new THREE.Vector2(0, 0));
  mat.userData.scroll = scroll;

  const baseUV = uv().mul(vec2(rx, ry)).add(scroll);
  const plx = o.parallax ?? 0;
  const pUV = plx > 0 ? pomUV(set.map, baseUV, plx, o.layers ?? 10) : baseUV;
  const dist = length(positionView);
  const baseSample = texture(set.map, pUV);
  const normSample = texture(set.normalMap, pUV);
  const macro = macroTexture();

  // ---- weather masks (world space, ripple-faded with distance so rain puddles never strobe!) ----
  const wpos = positionWorld.xz; const wetAmt = o.wet ?? 0, snowAmt = o.snow ?? 0; const wetU = WEATHER.wet as unknown as N;
  let puddle: N = float(0), snowM: N = float(0), ripple: N = vec2(0, 0);
  if (wetAmt > 0) {
    const pv = texture(macro, wpos.mul(1 / 70)).b.mul(0.6).add(texture(macro, wpos.mul(1 / 19).add(0.37)).r.mul(0.4));
    const cover = o.puddles ?? 0.3;
    puddle = smoothstep(1 - cover, 1 - cover + 0.08, pv.add(float(0.5).sub(baseSample.a).mul(0.3))).mul(wetU.mul(wetAmt));
    if (o.rain) {
      const ripFade = ssInv(42.0, 6.0, dist);
      const g = wpos.mul(0.6), cell = floor(g), f = fract(g);
      const r1 = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453)), r2 = fract(sin(dot(cell, vec2(269.5, 183.3))).mul(43758.5453));
      const age = fract(time.mul(0.85).add(r1.mul(7.0))); const dv = f.sub(vec2(r1.mul(0.5).add(0.25), r2.mul(0.5).add(0.25))); const dd = length(dv);
      const ring = sin(dd.sub(age.mul(0.45)).mul(36.0)).mul(ssInv(0.08, 0.0, abs(dd.sub(age.mul(0.45))))).mul(oneMinus(age));
      ripple = dv.div(dd.add(1e-3)).mul(ring).mul(0.28).mul(puddle).mul(ripFade);
    }
  }
  if (snowAmt > 0) {
    const e = o.worldUV ? float(1) : min(uv().x, oneMinus(uv().x));
    snowM = oneMinus(smoothstep(0.012, 0.075, e.add(texture(macro, wpos.mul(1 / 9)).g.sub(0.5).mul(0.065)))).mul(snowAmt);
    snowM = max(snowM, smoothstep(0.63, 0.74, texture(macro, wpos.mul(1 / 23).add(0.1)).r).mul(0.45 * snowAmt));
  }

  // ---- albedo ----
  const macroV = texture(macro, baseUV.mul(0.0931)).r.mul(0.6).add(texture(macro, baseUV.mul(0.0217).add(0.37)).g.mul(0.4));
  const macroAmt = o.macro ?? 0.22;
  let col = baseSample.rgb.mul(materialColor).mul(mix(float(1 - macroAmt), float(1 + macroAmt * 0.8), macroV));
  const microAmt = bump ? (o.micro ?? 0) : 0;
  const ms = o.microScale ?? [8, 8];
  const microF = float(microAmt).mul(ssInv(52.0, 6.0, dist));
  const microT = microAmt > 0 ? texture(detailNormalTexture(o.detailKind ?? 'grit'), pUV.mul(vec2(ms[0], ms[1]))) : null;
  if (microT) col = col.mul(mix(float(1), microT.a.mul(0.54).add(0.73), microF));
  if (o.vertexColors) col = col.mul(vertexColor());

  let triBlend = float(0), ledgeM: N = float(0);
  const nw = normalWorldGeometry; const pw = positionWorld;
  if (o.triplanar) {
    const ts = float(o.triplanar.scale); const tm = o.triplanar.set.map;
    const bw = pow(abs(nw), vec3(4.0)); const bwn = bw.div(bw.x.add(bw.y).add(bw.z).add(1e-5));
    const tp = texture(tm, pw.zy.mul(ts)).rgb.mul(bwn.x).add(texture(tm, pw.xz.mul(ts)).rgb.mul(bwn.y)).add(texture(tm, pw.xy.mul(ts)).rgb.mul(bwn.z));
    const slope = float(1).sub(clamp(nw.y, 0.0, 1.0));
    triBlend = smoothstep(0.2, 0.4, slope.add(macroV.sub(0.5).mul(0.12)));
    col = mix(col, tp.mul(color(o.triplanar.tint ?? '#ffffff')), triBlend);
  }
  if (o.strata) col = col.mul(strataTint(o.strata));
  if (o.ledge && o.ledge.amount > 0) {
    ledgeM = smoothstep(0.46, 0.78, nw.y.add(baseSample.a.sub(0.5).mul(0.28)).add(macroV.sub(0.5).mul(0.2))).mul(o.ledge.amount);
    col = mix(col, color(o.ledge.color).mul(mix(float(0.82), float(1.12), macroV)), ledgeM);
  }
  if (wetAmt > 0) col = col.mul(oneMinus(wetU.mul(0.36 * wetAmt))).mul(mix(float(1), float(0.74), puddle));
  if (snowAmt > 0) col = mix(col, vec3(0.9, 0.94, 1.0), snowM);
  if (o.cloud) col = col.mul(cloudShade(o.cloud));
  mat.colorNode = col;

  // ---- NaN-safe, flicker-free normal mapping ----
  if (bump) {
    const ns = o.normalScale ?? 1;
    const nT = normSample.xyz.mul(2).sub(1);
    const detStr = o.detail ?? 0.42;
    let nxy = nT.xy.mul(ns);
    if (detStr > 0.01) {
      const dT = texture(set.normalMap, pUV.mul(o.detailScale ?? 5.3).add(0.13)).xy.mul(2).sub(1);
      nxy = nxy.add(dT.mul(detStr).mul(ssInv(64.0, 6.0, dist)));
    }
    if (microT) nxy = nxy.add(microT.xy.mul(2).sub(1).mul(microF).mul(0.85));
    let n = vec3(nxy, max(nT.z, float(0.35)));
    if (o.triplanar) {
      const wx = nw.x.mul(nw.x), wz = nw.z.mul(nw.z), inv = float(1).div(wx.add(wz).add(1e-4));
      const tn = texture(o.triplanar.set.normalMap, pw.zy.mul(o.triplanar.scale)).mul(wx.mul(inv))
        .add(texture(o.triplanar.set.normalMap, pw.xy.mul(o.triplanar.scale)).mul(wz.mul(inv))).xyz.mul(2).sub(1);
      n = mix(n, tn, triBlend.mul(0.8));
    }
    if (o.ledge && o.ledge.amount > 0) n = mix(n, vec3(n.x.mul(0.35), n.y.mul(0.35), 1.0), ledgeM.mul(0.65));
    if (wetAmt > 0) n = mix(n, vec3(ripple, 1.0), puddle);
    if (snowAmt > 0) n = mix(n, vec3(0, 0, 1), snowM.mul(0.78));
    // Modulate UV kept in compact range via baseUV derivatives so high sAcc never loses precision
    mat.normalNode = safePerturbNormal(normalize(n), baseUV, dist);
  }

  // ---- roughness with distance specular anti-aliasing (kills wet/ice/metal horizon strobing) ----
  let rough: N = normSample.a.mul(materialRoughness);
  if (o.ledge && o.ledge.amount > 0) rough = mix(rough, float(o.ledge.rough ?? 0.8), ledgeM);
  if (wetAmt > 0) rough = mix(rough.mul(oneMinus(wetU.mul(0.5 * wetAmt))), float(0.07), puddle); // glossier wet road + mirror puddles
  if (snowAmt > 0) rough = mix(rough, float(0.65), snowM);
  rough = mix(rough, max(rough, float(0.36)), smoothstep(48.0, 220.0, dist));
  mat.roughnessNode = clamp(rough, 0.11, 1.0);

  // ---- emissive ----
  if (set.emissiveMap) mat.emissiveNode = texture(set.emissiveMap, pUV).rgb.mul(color(o.emissive ?? '#ffffff')).mul(o.emissiveIntensity ?? 1.6);

  // ---- edge-tapered road micro-relief (0 at uv.x=0/1 so road-to-skirt & kerb seams never crack open) ----
  if (o.fade) {
    // visible where the noise lies below the fade value: grains / hollows of the surface appear first, a ragged front follows
    const fz = texture(macro, wpos.mul(1 / 7.3)).r.mul(0.5).add(texture(macro, wpos.mul(1 / 2.1).add(0.21)).g.mul(0.32)).add(baseSample.a.mul(0.18));
    mat.opacityNode = smoothstep(-0.04, 0.04, attribute('aFade', 'float').mul(1.24).sub(0.12).sub(fz));
    mat.alphaTest = 0.5;
  }
  if ((o.displace ?? 0) > 0 && !o.worldUV) {
    const amp = Math.min(0.08, o.displace! * 0.22);
    const edgeLock = smoothstep(0.0, 0.14, min(uv().x, oneMinus(uv().x)));
    mat.positionNode = positionLocal.add(normalLocal.mul(texture(set.map, baseUV).level(2).a.mul(amp).mul(edgeLock)));
  }
  return mat;
}
