import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
// TSL's TypeScript generics are stricter than the runtime API – shader graphs are typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  Break, Fn, If, Loop, abs, clamp, color, cross, dFdx, dFdy, dot, float, inverseSqrt, length, materialColor, materialRoughness, max, mix,
  normalLocal, normalMap, normalViewGeometry, normalWorldGeometry, normalize, positionLocal, positionView, positionWorld, pow, select,
  oneMinus, smoothstep, texture, uniform, uv, vec2, vec3, vertexColor, floor, fract, min, sin, time,
} = TSL;
import { macroTexture, microTexture, type TexSet } from './textures';
import { cloudShade, strataTint, type StrataDef } from './terrainMaterial';

/* ------------------------------------------------------------------------------------------------
 * Track surface material as a TSL node material – runs on WebGPU and on the WebGL2 fallback backend.
 * Features: parallax occlusion mapping, macro anti-tiling, detail + micro normal, close-range micro
 * albedo, slope-based triplanar rock blend, vertex displacement, scrollable UVs (lava/water).
 * ---------------------------------------------------------------------------------------------- */

export interface SurfaceOpts {
  repeat?: [number, number];
  parallax?: number; // scale, 0 = off
  layers?: number;
  roughness?: number;
  metalness?: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  normalScale?: number;
  macro?: number; // 0..0.5
  detail?: number; // detail normal strength
  detailScale?: number;
  triplanar?: { set: TexSet; scale: number; tint?: string };
  bump?: boolean;
  displace?: number; // world-unit displacement amplitude, 0 = off
  micro?: number; // close-range micro detail strength (0 = off)
  microScale?: [number, number]; // uv multiplier so one micro tile ~1.7 m
  vertexColors?: boolean;
  wet?: number; // 0..1 wet road (darker, glossier)
  puddles?: number; // puddle coverage 0..1 (needs wet)
  rain?: boolean; // animated rain ripples in puddles
  snow?: number; // snow drifts at the road edges + wind streaks (road uv.x = across)
  strata?: StrataDef | null; // world-height colour bands (rock)
  cloud?: number; // drifting cloud-shadow strength
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
/** smoothstep with falling edge – WGSL rejects low >= high */
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/** Parallax occlusion mapping with a derivative-based tangent frame (no tangent attribute required). */
function pomUV(hMap: THREE.Texture, uvIn: N, scale: number, layersN: number) {
  return Fn(() => {
    const p = positionView;
    const dp1 = dFdx(p), dp2 = dFdy(p); const duv1 = dFdx(uvIn), duv2 = dFdy(uvIn);
    const Nn = normalize(normalViewGeometry);
    const dp2perp = cross(dp2, Nn), dp1perp = cross(Nn, dp1);
    const T = dp2perp.mul(duv1.x).add(dp1perp.mul(duv2.x));
    const B = dp2perp.mul(duv1.y).add(dp1perp.mul(duv2.y));
    const invmax = inverseSqrt(max(dot(T, T), dot(B, B)).add(1e-20));
    const V = normalize(p.negate());
    const Vt = vec3(dot(V, T.mul(invmax)), dot(V, B.mul(invmax)), dot(V, Nn));
    const fade = ssInv(90.0, 20.0, length(p));
    const layers = mix(float(layersN * 2), float(layersN), abs(Vt.z));
    const layerDepth = float(1).div(layers);
    const P = Vt.xy.div(max(Vt.z, 0.25)).mul(scale).mul(fade);
    const dUv = P.div(layers);
    const cur = vec2(uvIn).toVar();
    const curDepth = float(0).toVar();
    const h = float(1).sub(texture(hMap, cur).grad(duv1, duv2).r).toVar();
    Loop({ start: 0, end: layersN * 2 }, ({ i }: { i: N }) => {
      If(curDepth.greaterThanEqual(h).or(float(i).greaterThanEqual(layers)).or(fade.lessThanEqual(0.0)), () => { Break(); });
      cur.subAssign(dUv);
      h.assign(float(1).sub(texture(hMap, cur).grad(duv1, duv2).r));
      curDepth.addAssign(layerDepth);
    });
    const prev = cur.add(dUv);
    const after = h.sub(curDepth);
    const before = float(1).sub(texture(hMap, prev).grad(duv1, duv2).r).sub(curDepth).add(layerDepth);
    const w = clamp(after.div(after.sub(before).add(1e-5)), 0.0, 1.0);
    return mix(cur, prev, w);
  })();
}

export function surfaceMaterial(set: TexSet, o: SurfaceOpts = {}) {
  const [rx, ry] = o.repeat ?? [1, 1];
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.roughness = o.roughness ?? 1; mat.metalness = o.metalness ?? 0;
  mat.color = new THREE.Color(o.color ?? '#ffffff');
  mat.envMapIntensity = o.envMapIntensity ?? 1;
  const bump = o.bump ?? true;
  const scroll = uniform(new THREE.Vector2(0, 0));
  mat.userData.scroll = scroll;

  const baseUV = uv().mul(vec2(rx, ry)).add(scroll);
  const plx = o.parallax ?? 0;
  const pUV = plx > 0 ? pomUV(set.rhMap, baseUV, plx, o.layers ?? 12) : baseUV;
  const dist = length(positionView);
  // ---- weather masks (world space) ----
  const wpos = positionWorld.xz; const wetAmt = o.wet ?? 0, snowAmt = o.snow ?? 0;
  let puddle: N = float(0), snowM: N = float(0), ripple: N = vec2(0, 0);
  if (wetAmt > 0) {
    const pv = texture(macroTexture(), wpos.mul(1 / 70)).b.mul(0.6).add(texture(macroTexture(), wpos.mul(1 / 19).add(0.37)).r.mul(0.4));
    const cover = o.puddles ?? 0.3;
    puddle = smoothstep(1 - cover, 1 - cover + 0.07, pv.add(float(0.5).sub(texture(set.rhMap, pUV).r).mul(0.3))).mul(wetAmt);
    if (o.rain) {
      const g = wpos.mul(0.65), cell = floor(g), f = fract(g);
      const r1 = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453)), r2 = fract(sin(dot(cell, vec2(269.5, 183.3))).mul(43758.5453));
      const age = fract(time.mul(0.9).add(r1.mul(7.0))); const dv = f.sub(vec2(r1.mul(0.5).add(0.25), r2.mul(0.5).add(0.25))); const dd = length(dv);
      const ring = sin(dd.sub(age.mul(0.45)).mul(48.0)).mul(oneMinus(smoothstep(0.0, 0.07, abs(dd.sub(age.mul(0.45)))))).mul(oneMinus(age));
      ripple = dv.div(dd.add(1e-4)).mul(ring).mul(0.55).mul(puddle);
    }
  }
  if (snowAmt > 0) {
    const e = min(uv().x, oneMinus(uv().x));
    snowM = oneMinus(smoothstep(0.012, 0.07, e.add(texture(macroTexture(), wpos.mul(1 / 9)).g.sub(0.5).mul(0.06)))).mul(snowAmt);
    snowM = max(snowM, smoothstep(0.64, 0.74, texture(macroTexture(), wpos.mul(1 / 23).add(0.1)).r).mul(0.45 * snowAmt));
  }

  // ---- albedo: base map, macro anti-tiling, micro grit, vertex colour, triplanar rock on slopes ----
  const macro = macroTexture();
  const macroV = texture(macro, baseUV.mul(0.0931)).r.mul(0.6).add(texture(macro, baseUV.mul(0.0217).add(0.37)).g.mul(0.4));
  const macroAmt = o.macro ?? 0.22;
  let col = texture(set.map, pUV).rgb.mul(materialColor).mul(mix(float(1 - macroAmt), float(1 + macroAmt * 0.8), macroV));
  const microAmt = bump ? (o.micro ?? 0) : 0;
  const ms = o.microScale ?? [8, 8];
  const microT = texture(microTexture(), pUV.mul(vec2(ms[0], ms[1])));
  const microF = float(microAmt).mul(ssInv(55.0, 6.0, dist));
  if (microAmt > 0) col = col.mul(mix(float(1), microT.a.mul(0.56).add(0.72), microF));
  if (o.vertexColors) col = col.mul(vertexColor());
  let triBlend = float(0);
  const nw = normalWorldGeometry; const pw = positionWorld;
  if (o.triplanar) {
    const ts = float(o.triplanar.scale); const tm = o.triplanar.set.map;
    const bw = pow(abs(nw), vec3(4.0)); const bwn = bw.div(bw.x.add(bw.y).add(bw.z).add(1e-5));
    const tp = texture(tm, pw.zy.mul(ts)).rgb.mul(bwn.x).add(texture(tm, pw.xz.mul(ts)).rgb.mul(bwn.y)).add(texture(tm, pw.xy.mul(ts)).rgb.mul(bwn.z));
    const slope = float(1).sub(clamp(nw.y, 0.0, 1.0));
    triBlend = smoothstep(0.2, 0.4, slope.add(macroV.sub(0.5).mul(0.12)));
    col = mix(col, tp.mul(color(o.triplanar.tint ?? '#ffffff')), triBlend);
  }
  if (wetAmt > 0) col = col.mul(1 - 0.4 * wetAmt).mul(mix(float(1), float(0.72), puddle));
  if (snowAmt > 0) col = mix(col, vec3(0.9, 0.94, 1.0), snowM);
  if (o.strata) col = col.mul(strataTint(o.strata));
  if (o.cloud) col = col.mul(cloudShade(o.cloud));
  mat.colorNode = col;

  // ---- normal: base + detail + micro (+ triplanar), perturbed via derivative TBN ----
  if (bump) {
    const ns = o.normalScale ?? 1;
    const nT = texture(set.normalMap, pUV).xyz.mul(2).sub(1);
    const dT = texture(set.normalMap, pUV.mul(o.detailScale ?? 5.3).add(0.13)).xyz.mul(2).sub(1);
    let nxy = nT.xy.mul(ns).add(dT.xy.mul(o.detail ?? 0.45).mul(ssInv(60.0, 5.0, dist)));
    if (microAmt > 0) nxy = nxy.add(microT.xy.mul(2).sub(1).mul(microF).mul(0.9));
    let n = vec3(nxy, nT.z);
    if (o.triplanar) {
      const triUV = select(abs(nw.x).greaterThan(abs(nw.z)), pw.zy, pw.xy).mul(o.triplanar.scale);
      n = mix(n, texture(o.triplanar.set.normalMap, triUV).xyz.mul(2).sub(1), triBlend.mul(0.8));
    }
    if (wetAmt > 0) n = mix(n, vec3(ripple, 1.0), puddle);
    if (snowAmt > 0) n = mix(n, vec3(0, 0, 1), snowM.mul(0.8));
    mat.normalNode = normalMap(normalize(n).mul(0.5).add(0.5));
  }

  // ---- roughness (G channel of the height/roughness map) ----
  let rough: N = texture(set.rhMap, pUV).g.mul(materialRoughness);
  if (wetAmt > 0) rough = mix(rough.mul(1 - 0.45 * wetAmt), float(0.035), puddle);
  if (snowAmt > 0) rough = mix(rough, float(0.62), snowM);
  mat.roughnessNode = rough;

  // ---- emissive ----
  if (set.emissiveMap) mat.emissiveNode = texture(set.emissiveMap, pUV).rgb.mul(color(o.emissive ?? '#ffffff')).mul(o.emissiveIntensity ?? 2);

  // ---- vertex displacement ----
  if ((o.displace ?? 0) > 0) mat.positionNode = positionLocal.add(normalLocal.mul(texture(set.rhMap, baseUV).level(0).r.mul(o.displace!)));
  return mat;
}
