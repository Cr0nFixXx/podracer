import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { detailKindForTheme, detailNormalTexture, macroTexture, type TexSet } from './textures';

// TSL typings are stricter than the runtime → loosely typed on purpose (see CLAUDE.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  abs, attribute, clamp, color, cross, float, fract, length, max, mix, normalWorld, normalize, oneMinus, positionView, positionWorld,
  select, sin, smoothstep, texture, time, transformNormalToView, uv, vec2, vec3, vertexColor,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/**
 * Singularity-free, derivative-free world-space normal perturbation: minimum cross length is 0.436
 * on every point of the sphere (flat ground, vertical cliffs, and overhangs — zero NaN/flips).
 */
function xzNormalToView(nW: N, nxy: N, nz: N) {
  const Nn = normalize(nW);
  const ref = select(abs(Nn.x).greaterThan(0.9), vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0));
  const B = normalize(cross(ref, Nn)); // on flat ground N=(0,1,0): (1,0,0)×(0,1,0) = (0,0,1)
  const T = cross(Nn, B);              // on flat ground: (0,1,0)×(0,0,1) = (1,0,0)
  return transformNormalToView(normalize(T.mul(nxy.x).add(B.mul(nxy.y)).add(Nn.mul(nz))));
}

export interface StrataDef { c: [number, number, number][]; band: number; amount: number }
export const STRATA: Record<string, StrataDef> = {
  desert: { band: 8.5, amount: 0.92, c: [[1.15, 1.05, 0.92], [1.02, 0.84, 0.7], [0.86, 0.65, 0.54], [0.72, 0.54, 0.46]] },
  mesa: { band: 6.5, amount: 1.0, c: [[1.18, 1.06, 0.95], [1.04, 0.78, 0.63], [0.84, 0.56, 0.45], [0.68, 0.44, 0.38]] },
  ice: { band: 6, amount: 0.74, c: [[1.08, 1.12, 1.16], [0.9, 0.95, 1.02], [0.74, 0.8, 0.88], [0.64, 0.7, 0.78]] },
  lava: { band: 5, amount: 0.78, c: [[1.04, 0.92, 0.86], [0.82, 0.72, 0.68], [0.66, 0.58, 0.56], [1.16, 0.78, 0.66]] },
  malastare: { band: 7.5, amount: 0.84, c: [[1.1, 1.08, 0.93], [0.94, 0.93, 0.8], [0.8, 0.82, 0.68], [0.68, 0.7, 0.58]] },
  jungle: { band: 9.5, amount: 0.68, c: [[1.04, 1.08, 0.96], [0.88, 0.93, 0.82], [0.76, 0.84, 0.7], [0.64, 0.72, 0.6]] },
  crystal: { band: 5.5, amount: 0.85, c: [[1.14, 1.02, 1.24], [0.92, 0.84, 1.08], [0.76, 0.68, 0.92], [0.64, 0.56, 0.82]] },
  aquilaris: { band: 7.5, amount: 0.68, c: [[1.08, 1.07, 1.02], [0.94, 0.92, 0.86], [0.82, 0.8, 0.75], [0.7, 0.72, 0.7]] },
};

export interface TerrainLayers {
  gravel: string[]; basin: string[]; basinRough: number; basinMetal: number; basinEmissive?: string;
  cliff?: string[]; crestTint?: [number, number, number]; crestRough?: number; ledgeColor?: string; ledgeAmt?: number;
}
const LAYERS: Record<string, TerrainLayers> = {
  oovo: { gravel: ['#3c3e44', '#5a5c64', '#7e8088'], basin: ['#2e3036', '#44464e', '#5c5e66'], basinRough: 0.92, basinMetal: 0, cliff: ['#34363c', '#55575f', '#7c7e86'], crestTint: [1.1, 1.1, 1.12], crestRough: 0.9 },
  desert: { gravel: ['#8a694e', '#ab8768', '#cca884'], basin: ['#cfc0a6', '#e6dcc8', '#f8f2e6'], basinRough: 0.86, basinMetal: 0, crestTint: [1.12, 1.08, 1.0], crestRough: 0.88, ledgeColor: '#dfc096', ledgeAmt: 0.55 },
  mesa: { gravel: ['#84523a', '#a86e56', '#ca9476'], basin: ['#d2ba9e', '#e6d4be', '#f6eadc'], basinRough: 0.86, basinMetal: 0, crestTint: [1.14, 1.06, 0.98], crestRough: 0.86, ledgeColor: '#dba078', ledgeAmt: 0.52 },
  ice: { gravel: ['#525e6a', '#748290', '#9aa8b6'], basin: ['#427496', '#76a6c8', '#bedef4'], basinRough: 0.16, basinMetal: 0.08, cliff: ['#384452', '#586878', '#8292a4'], crestTint: [1.06, 1.09, 1.14], crestRough: 0.58, ledgeColor: '#eef5fc', ledgeAmt: 0.85 },
  jungle: { gravel: ['#463c2c', '#645642', '#86745e'], basin: ['#1f3316', '#314e26', '#4a6c36'], basinRough: 0.34, basinMetal: 0, crestTint: [1.08, 1.12, 0.94], crestRough: 0.76, ledgeColor: '#3b6824', ledgeAmt: 0.72 },
  malastare: { gravel: ['#48483b', '#666654', '#888872'], basin: ['#141e18', '#213022', '#344630'], basinRough: 0.18, basinMetal: 0.04, crestTint: [1.1, 1.08, 0.92], crestRough: 0.78, ledgeColor: '#566430', ledgeAmt: 0.58 },
  lava: { gravel: ['#14100f', '#261c18', '#3c2c24'], basin: ['#0b0806', '#160f0b', '#261812'], basinRough: 0.38, basinMetal: 0.04, basinEmissive: '#ff5210', crestTint: [1.16, 1.02, 0.94], crestRough: 0.9, ledgeColor: '#2a1e1a', ledgeAmt: 0.4 },
  crystal: { gravel: ['#241c32', '#3b3052', '#5a4a74'], basin: ['#3a2c5a', '#5e4c90', '#927ecc'], basinRough: 0.18, basinMetal: 0.1, crestTint: [1.12, 1.04, 1.2], crestRough: 0.44, ledgeColor: '#9878cc', ledgeAmt: 0.5 },
  aquilaris: { gravel: ['#6a6256', '#8e8474', '#b4aa98'], basin: ['#7c6d56', '#988870', '#b4a690'], basinRough: 0.3, basinMetal: 0, crestTint: [1.1, 1.08, 1.02], crestRough: 0.8, ledgeColor: '#527848', ledgeAmt: 0.55 },
};
export const layersFor = (id: string): TerrainLayers => LAYERS[id] ?? { gravel: ['#3a3a3a', '#555555', '#777777'], basin: ['#444444', '#555555', '#666666'], basinRough: 0.5, basinMetal: 0 };

export function strataTint(def: StrataDef | null | undefined): N {
  if (!def) return vec3(1);
  const wp = positionWorld; const m = macroTexture();
  const warp = texture(m, wp.xz.mul(1 / 180)).r.mul(1.65).add(texture(m, wp.xz.mul(1 / 46)).g.mul(0.38));
  const yBand = wp.y.div(def.band).add(warp);
  const b = fract(yBand);
  const cols = def.c.map(c => vec3(c[0], c[1], c[2]));
  let t = mix(cols[0], cols[1], smoothstep(0.2, 0.27, b));
  t = mix(t, cols[2], smoothstep(0.5, 0.57, b));
  if (cols[3]) t = mix(t, cols[3], smoothstep(0.76, 0.83, b));
  const seam1 = oneMinus(smoothstep(0.0, 0.024, abs(b.sub(0.49)))).mul(0.3);
  const seam2 = oneMinus(smoothstep(0.0, 0.018, abs(b.sub(0.79)))).mul(0.2);
  t = t.mul(oneMinus(max(seam1, seam2)));
  return mix(vec3(1), t, def.amount);
}

export function cloudShade(amount: number): N {
  if (amount <= 0) return float(1);
  const wp = positionWorld.xz; const m = macroTexture();
  const n = texture(m, wp.mul(1 / 1500).add(vec2(time.mul(0.0055), time.mul(0.003)))).r.mul(0.65)
    .add(texture(m, wp.mul(1 / 520).add(vec2(time.mul(0.008), 0.3))).g.mul(0.35));
  return oneMinus(smoothstep(0.5, 0.66, n).mul(amount));
}

export interface TerrainMatOpts {
  themeId: string; ground: TexSet; gravel: TexSet; rock: TexSet; basin: TexSet; layers: TerrainLayers;
  strata: StrataDef | null | undefined; cloud: number; bump: boolean; waterY?: number;
  rockScale?: number; emissive?: string; emissiveIntensity?: number;
  /** Session 20: UV multiplier of the ground layer (mesh UVs tile every 30 m; photo sets need ~11 m) */
  groundScale?: number;
}

export function terrainMaterial(o: TerrainMatOpts) {
  // Texture budget (WebGPU <= 16/stage incl. env + shadow): 10–11 bindings, zero derivative TBN artifacts.
  const mat = new THREE.MeshStandardNodeMaterial(); mat.roughness = 1; mat.metalness = 0; mat.envMapIntensity = 0.78;
  const wp = positionWorld, nW = normalize(normalWorld); const dist = length(positionView);
  const sp = attribute('aSplat', 'vec4');
  const uvG = uv().mul(o.groundScale ?? 1); const m = macroTexture();
  const mv = texture(m, uv().mul(0.0931)).r.mul(0.6).add(texture(m, uv().mul(0.0217).add(0.37)).g.mul(0.4));
  const gT = texture(o.ground.map, uvG), gNT = texture(o.ground.normalMap, uvG);
  const uvR = wp.xz.mul(1 / 7.2); const rT = texture(o.gravel.map, uvR), rNT = texture(o.gravel.normalMap, uvR);
  const uvB = wp.xz.mul(1 / 17.5); const bT = texture(o.basin.map, uvB), bNT = texture(o.basin.normalMap, uvB);
  const ts = o.rockScale ?? 1 / 25;
  // Smooth continuous bi-planar rock blend (no hard 45° select() mipmap discontinuity!)
  const wx = nW.x.mul(nW.x), wz = nW.z.mul(nW.z); const invSw = float(1.0).div(wx.add(wz).add(1e-4));
  const bx = wx.mul(invSw), bz = wz.mul(invSw);
  const uvKx = wp.zy.mul(ts), uvKz = wp.xy.mul(ts);
  const kT = texture(o.rock.map, uvKx).mul(bx).add(texture(o.rock.map, uvKz).mul(bz));
  const kNT = texture(o.rock.normalMap, uvKx).mul(bx).add(texture(o.rock.normalMap, uvKz).mul(bz));

  const dTex = detailNormalTexture(detailKindForTheme(o.themeId));
  const detMid = texture(dTex, wp.xz.mul(1 / 9.5));
  const detFine = texture(dTex, wp.xz.mul(1 / 1.75));
  const midF = float(o.bump ? 0.48 : 0).mul(ssInv(210.0, 26.0, dist));
  const microF = float(o.bump ? 0.58 : 0).mul(ssInv(50.0, 6.0, dist));

  const gC = gT.rgb.mul(mix(float(0.72), float(1.24), mv));
  const rC = rT.rgb.mul(mix(float(0.84), float(1.14), mv));
  const bC = bT.rgb.mul(mix(float(0.88), float(1.1), mv));
  let kC: N = kT.rgb.mul(strataTint(o.strata));

  const slope = oneMinus(clamp(nW.y, 0.0, 1.0));
  let ledgeW: N = float(0);
  if (o.layers.ledgeColor && (o.layers.ledgeAmt ?? 0) > 0) {
    ledgeW = ssInv(0.46, 0.2, slope).mul(smoothstep(0.32, 0.68, kT.a.add(mv.mul(0.25)))).mul(o.layers.ledgeAmt!);
    kC = mix(kC, color(o.layers.ledgeColor).mul(mix(float(0.85), float(1.1), mv)), ledgeW);
  }
  const wG = smoothstep(0.34, 0.64, sp.x.add(rT.a.sub(gT.a).mul(0.72)));
  const wB = smoothstep(0.38, 0.6, sp.y.add(bT.a.sub(0.5).mul(0.28)).add(mv.sub(0.5).mul(0.24))).mul(ssInv(0.2, 0.06, slope));
  const wK = smoothstep(0.19, 0.35, slope.add(kT.a.sub(0.5).mul(0.22)).add(mv.sub(0.5).mul(0.1)));

  let col: N = mix(mix(mix(gC, rC, wG), bC, wB), kC, wK);
  if (o.layers.crestTint) {
    const ct = o.layers.crestTint;
    const cw = clamp(sp.z, 0.0, 1.0).mul(oneMinus(wB)).mul(oneMinus(wK.mul(0.7)));
    col = mix(col, col.mul(vec3(ct[0], ct[1], ct[2])), cw);
  }
  let wetShore: N = float(0);
  const wy = o.waterY ?? -1e9;
  if (wy > -1e8 && o.themeId !== 'lava') {
    const dh = wp.y.sub(wy);
    wetShore = ssInv(2.8, 0.0, dh).mul(smoothstep(-1.5, 0.0, dh));
    const waveOff = sin(wp.x.mul(0.22).add(time.mul(1.7))).mul(0.22).add(mv.sub(0.5).mul(0.55));
    const foam = ssInv(0.75, 0.06, abs(dh.sub(0.15).add(waveOff))).mul(ssInv(0.55, 0.15, slope));
    col = col.mul(mix(float(1.0), float(0.66), wetShore));
    const foamCol = o.themeId === 'ice' ? vec3(0.86, 0.93, 1.0) : o.themeId === 'jungle' ? vec3(0.72, 0.82, 0.72) : vec3(0.9, 0.94, 0.97);
    col = mix(col, foamCol, foam.mul(o.themeId === 'aquilaris' ? 0.72 : 0.42));
  }

  col = col
    .mul(mix(float(1), detMid.a.mul(0.34).add(0.83), midF.mul(oneMinus(wK.mul(0.6)))))
    .mul(mix(float(1), detFine.a.mul(0.54).add(0.73), microF))
    .mul(vertexColor())
    .mul(cloudShade(o.cloud));
  mat.colorNode = col;

  if (o.bump) {
    const dec = (t: N) => t.xyz.mul(2).sub(1);
    const nFade = ssInv(750.0, 140.0, dist); // distance normal attenuation eliminates horizon specular shimmer
    let n: N = mix(mix(mix(dec(gNT), dec(rNT), wG), dec(bNT), wB.mul(0.8)), dec(kNT), wK.mul(0.85));
    const midN = detMid.xy.mul(2).sub(1).mul(midF).mul(oneMinus(wB.mul(0.65))).mul(0.8);
    const fineN = detFine.xy.mul(2).sub(1).mul(microF).mul(0.85);
    mat.normalNode = xzNormalToView(nW, n.xy.mul(nFade).add(midN).add(fineN), max(n.z, float(0.35)));
  }

  const bR = float(o.layers.basinRough).mul(bNT.a.mul(1.25).add(0.15));
  let rough: N = mix(mix(mix(gNT.a, rNT.a, wG), bR, wB), mix(kNT.a, float(0.76), ledgeW), wK);
  if (o.layers.crestRough !== undefined) rough = mix(rough, float(o.layers.crestRough), clamp(sp.z, 0.0, 1.0).mul(0.45));
  if (wy > -1e8 && o.themeId !== 'lava') rough = mix(rough, float(0.24), wetShore.mul(0.7));
  // Distance specular anti-aliasing: glossy frozen lakes & swamps smoothly widen roughness with distance
  rough = mix(rough, max(rough, float(0.42)), smoothstep(45.0, 240.0, dist));
  mat.roughnessNode = clamp(rough, 0.14, 1.0);
  if (o.layers.basinMetal > 0) mat.metalnessNode = wB.mul(o.layers.basinMetal);

  let em: N = null;
  if (o.ground.emissiveMap) em = texture(o.ground.emissiveMap, uvG).rgb.mul(color(o.emissive ?? '#ffffff')).mul(o.emissiveIntensity ?? 1.05).mul(oneMinus(wK));
  if (o.layers.basinEmissive) {
    const pulse = sin(time.mul(1.4).add(wp.x.mul(0.04))).mul(0.1).add(0.92);
    const be = color(o.layers.basinEmissive).mul(ssInv(0.32, 0.1, bT.a)).mul(1.85).mul(pulse).mul(wB);
    em = em ? em.add(be) : be;
  }
  if (wy > -1e8 && o.themeId === 'lava') {
    const lavaRim = ssInv(3.2, 0.0, max(wp.y.sub(wy), 0.0)).mul(1.25);
    const le = color('#ff5a14').mul(lavaRim);
    em = em ? em.add(le) : le;
  }
  if (em) mat.emissiveNode = em;
  return mat;
}

/** Flicker-free, derivative-free TSL water surface (ocean, jungle rivers, glacial meltwater). */
/** Session 20: looks of the lakes the track crosses (the pod hovers directly over them): swamp with algae mats, bubbling methane, mirror lake. */
export interface LiquidLook { deep: string; shallow: string; rough: number; calm: number; cap: number; metal?: number; scum?: string; glow?: string }
export const LIQUIDS: Record<string, LiquidLook> = {
  swamp: { deep: '#141f10', shallow: '#3a4a22', rough: 0.2, calm: 0.35, cap: 0, scum: '#6f8a34' },
  methane: { deep: '#3f4a10', shallow: '#a8b62c', rough: 0.16, calm: 0.6, cap: 0.25, scum: '#e6ec8c', glow: '#5a6a10' },
  mirror: { deep: '#1c1238', shallow: '#5a3f8e', rough: 0.05, calm: 0.12, cap: 0, metal: 0.55 },
};
export function waterMaterial(themeId: string, normTex: THREE.Texture, cloud: number, hole?: { tex: THREE.Texture; x0: number; z0: number; sx: number; sz: number }, look?: LiquidLook) {
  const mat = new THREE.MeshStandardNodeMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const wp = positionWorld.xz; const dist = length(positionView); const m = macroTexture();
  const deep = color(look?.deep ?? (themeId === 'ice' ? '#3f6e8e' : themeId === 'jungle' ? '#12362d' : '#0f5072'));
  const shallow = color(look?.shallow ?? (themeId === 'ice' ? '#82b4d4' : themeId === 'jungle' ? '#285e4c' : '#268cb0'));
  const swell = texture(m, wp.mul(1 / 220).add(vec2(time.mul(0.007), time.mul(0.004)))).r;
  const chop = texture(m, wp.mul(1 / 46).sub(vec2(time.mul(0.014), time.mul(-0.011)))).g;
  const whitecap = smoothstep(0.73, 0.88, swell.mul(0.55).add(chop.mul(0.55))).mul(look ? look.cap : themeId === 'aquilaris' ? 0.5 : 0.2).mul(ssInv(700.0, 80.0, dist));
  let col = mix(deep, shallow, smoothstep(0.28, 0.74, swell.mul(0.7).add(chop.mul(0.3))));
  col = mix(col, look?.scum ? color(look.scum) : vec3(0.86, 0.92, 0.96), whitecap);
  let scumM: N = float(0);
  if (look?.scum) { // drifting mats of algae / foam: static world-space patches, slowly breathing
    scumM = smoothstep(0.52, 0.66, texture(m, wp.mul(1 / 64).add(vec2(time.mul(0.0012), 0.0))).g.mul(0.6).add(texture(m, wp.mul(1 / 17)).r.mul(0.4))).mul(0.85);
    col = mix(col, color(look.scum).mul(texture(m, wp.mul(1 / 5)).b.mul(0.5).add(0.7)), scumM);
  }
  col = col.mul(cloudShade(cloud));
  mat.colorNode = col;
  if (look?.glow) mat.emissiveNode = color(look.glow).mul(smoothstep(0.45, 0.8, chop).mul(0.6).add(0.15));
  // Exact analytical world-space wave normal + smooth distance attenuation (zero dFdx underflow, zero sun-glint strobe!)
  const nFade = ssInv(520.0, 30.0, dist);
  const n1 = texture(normTex, wp.mul(1 / 38).add(vec2(time.mul(0.018), time.mul(0.012)))).xy.mul(2).sub(1);
  const n2 = texture(normTex, wp.mul(1 / 15).sub(vec2(time.mul(0.024), time.mul(-0.018)))).xy.mul(2).sub(1);
  const wxy = n1.mul(0.48).add(n2.mul(0.36).mul(ssInv(180.0, 20.0, dist))).mul(nFade).mul(look ? look.calm : 1);
  mat.normalNode = transformNormalToView(normalize(vec3(wxy.x, float(1.0), wxy.y)));
  const baseR = mix(mix(float(look ? look.rough : themeId === 'ice' ? 0.2 : 0.14), float(0.52), whitecap), float(0.62), scumM);
  mat.roughnessNode = mix(baseR, float(look ? Math.max(look.rough, 0.2) : 0.38), smoothstep(45.0, 320.0, dist));
  mat.metalness = look?.metal ?? 0.16; mat.envMapIntensity = 1.05;
  if (hole) { // Session 17: no water where an underwater tunnel breaks through the surface (otherwise the plane would cut through its interior)
    const hv = texture(hole.tex, positionWorld.xz.sub(vec2(hole.x0, hole.z0)).div(vec2(hole.sx, hole.sz))).r;
    mat.opacityNode = oneMinus(smoothstep(0.45, 0.55, hv)); mat.alphaTest = 0.5;
  }
  return mat;
}

/** Flicker-free, derivative-free convecting molten lava sea with cooled basalt plates & magma channels. */
export function lavaSeaMaterial(crust: TexSet) {
  const mat = new THREE.MeshStandardNodeMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const wp = positionWorld.xz; const dist = length(positionView); const m = macroTexture();
  const flow = vec2(time.mul(0.011), time.mul(0.007));
  const warp = texture(m, wp.mul(1 / 140).add(flow.mul(0.4))).rg.sub(0.5).mul(0.32);
  const uv1 = wp.mul(1 / 52).add(flow).add(warp);
  const uv2 = wp.mul(1 / 22).sub(flow.mul(0.6)).add(warp.mul(1.3));
  const c1 = texture(crust.map, uv1), c2 = texture(crust.map, uv2);
  const nxy = texture(crust.normalMap, uv1).xy.mul(2).sub(1).mul(ssInv(480.0, 40.0, dist)).mul(0.75);
  const magma = clamp(ssInv(0.52, 0.2, c1.a.mul(0.65).add(c2.a.mul(0.35))), 0.0, 1.0);
  const hotCore = smoothstep(0.55, 0.92, magma);
  mat.colorNode = mix(c1.rgb.mul(0.85), vec3(0.28, 0.07, 0.02), magma);
  mat.normalNode = transformNormalToView(normalize(vec3(nxy.x, float(1.0), nxy.y)));
  mat.roughnessNode = mix(float(0.84), float(0.34), magma);
  mat.metalness = 0.04; mat.envMapIntensity = 0.65;
  const pulse = sin(time.mul(1.6).add(wp.x.mul(0.03)).add(wp.y.mul(0.02))).mul(0.1).add(0.92);
  mat.emissiveNode = mix(color('#cf3608'), color('#ff9424'), hotCore).mul(magma).mul(pulse).mul(1.75);
  return mat;
}
