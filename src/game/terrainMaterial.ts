import * as THREE from 'three/webgpu';
import { specAA } from './specAA';
import * as TSLmod from 'three/tsl';
import { macroTexture, microTexture, type TexSet } from './textures';

// TSL typings are stricter than the runtime → loosely typed on purpose (see CLAUDE.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  abs, attribute, clamp, color, float, fract, length, mix, normalMap, normalWorldGeometry, normalize, oneMinus, positionView, positionWorld,
  select, smoothstep, texture, time, uv, vec2, vec3, vertexColor,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/* ------------------------------------------------------------------------------------------------
 * Shared landscape shading helpers + the splatted terrain material.
 *  strataTint():  world-height colour bands (Tatooine layering) – used by terrain cliffs, canyon walls, landmarks
 *  cloudShade():  drifting cloud shadows (two scales of the macro noise, wind-scrolled)
 *  terrainMaterial(): sand/ground + gravel + basin (salt flat / frozen lake / swamp / lava crust) + triplanar rock,
 *                 height-aware blending, micro grit, vertex tint, cloud shadows. Weights come from the `aSplat`
 *                 attribute written by terrain.ts (x gravel, y basin) and the per-pixel slope.
 * ---------------------------------------------------------------------------------------------- */

export interface StrataDef { c: [number, number, number][]; band: number; amount: number }
export const STRATA: Record<string, StrataDef> = {
  desert: { band: 9, amount: 0.9, c: [[1.12, 1.04, 0.94], [1.0, 0.84, 0.72], [0.8, 0.62, 0.54]] },
  mesa: { band: 7, amount: 1.0, c: [[1.16, 1.08, 1.0], [1.0, 0.78, 0.66], [0.74, 0.52, 0.46]] },
  ice: { band: 6, amount: 0.7, c: [[1.05, 1.08, 1.12], [0.86, 0.9, 0.96], [0.7, 0.74, 0.8]] },
  lava: { band: 5, amount: 0.7, c: [[1.0, 0.9, 0.85], [0.75, 0.68, 0.66], [1.15, 0.8, 0.7]] },
  malastare: { band: 8, amount: 0.8, c: [[1.08, 1.06, 0.94], [0.9, 0.9, 0.8], [0.74, 0.76, 0.66]] },
  jungle: { band: 10, amount: 0.6, c: [[1.0, 1.05, 0.95], [0.85, 0.9, 0.8], [0.72, 0.8, 0.68]] },
  crystal: { band: 6, amount: 0.8, c: [[1.1, 1.0, 1.2], [0.85, 0.8, 1.0], [0.7, 0.62, 0.85]] },
  aquilaris: { band: 8, amount: 0.6, c: [[1.05, 1.05, 1.0], [0.9, 0.88, 0.84], [0.78, 0.76, 0.72]] },
};

export interface TerrainLayers { gravel: string[]; basin: string[]; basinRough: number; basinMetal: number; basinEmissive?: string; cliff?: string[] }
const LAYERS: Record<string, TerrainLayers> = {
  desert: { gravel: ['#8a6a50', '#a8866a', '#c8a684'], basin: ['#cbbca4', '#e2d8c6', '#f6f0e4'], basinRough: 0.9, basinMetal: 0 },
  mesa: { gravel: ['#86563e', '#a8705a', '#c89478'], basin: ['#d0b8a0', '#e4d2be', '#f4e8dc'], basinRough: 0.9, basinMetal: 0 },
  ice: { gravel: ['#56616c', '#76828e', '#98a4b0'], basin: ['#4a7898', '#7aa6c6', '#bcdcf0'], basinRough: 0.07, basinMetal: 0.1, cliff: ['#3e4a58', '#5e6c7c', '#8492a2'] },
  jungle: { gravel: ['#4a4030', '#665844', '#867460'], basin: ['#24361a', '#34502a', '#4a6a36'], basinRough: 0.3, basinMetal: 0 },
  malastare: { gravel: ['#4a4a3e', '#666656', '#868672'], basin: ['#16201a', '#223024', '#344232'], basinRough: 0.1, basinMetal: 0 },
  lava: { gravel: ['#151110', '#251c18', '#382a24'], basin: ['#0c0907', '#16100c', '#241812'], basinRough: 0.35, basinMetal: 0, basinEmissive: '#ff5010' },
  crystal: { gravel: ['#251e32', '#3a3150', '#57496e'], basin: ['#3c2e5a', '#5c4c8c', '#8c7ac4'], basinRough: 0.1, basinMetal: 0.1 },
  aquilaris: { gravel: ['#6c6458', '#8e8476', '#b0a696'], basin: ['#7e6e56', '#958670', '#ad9e88'], basinRough: 0.25, basinMetal: 0 },
};
export const layersFor = (id: string): TerrainLayers => LAYERS[id] ?? { gravel: ['#3a3a3a', '#555555', '#777777'], basin: ['#444444', '#555555', '#666666'], basinRough: 0.5, basinMetal: 0 };

export function strataTint(def: StrataDef | null | undefined): N {
  if (!def) return vec3(1);
  const wp = positionWorld; const m = macroTexture();
  const warp = texture(m, wp.xz.mul(1 / 180)).r.mul(1.6).add(texture(m, wp.xz.mul(1 / 47)).g.mul(0.35));
  const b = fract(wp.y.div(def.band).add(warp));
  const [c0, c1, c2] = def.c.map(c => vec3(c[0], c[1], c[2]));
  let t = mix(c0, c1, smoothstep(0.28, 0.34, b));
  t = mix(t, c2, smoothstep(0.62, 0.68, b));
  t = t.mul(oneMinus(oneMinus(smoothstep(0.0, 0.025, abs(b.sub(0.47)))).mul(0.3))); // thin dark seam
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
  ground: TexSet; gravel: TexSet; rock: TexSet; basin: TexSet; layers: TerrainLayers; strata: StrataDef | null | undefined;
  cloud: number; bump: boolean; rockScale?: number; emissive?: string; emissiveIntensity?: number;
  /** close-range detail layer: [tile factor x, tile factor z, strength] (see TERRAIN_DETAIL) */
  detail?: [number, number, number];
}

/** Per-world close-range ground detail (session 15). Factors multiply the 30 m ground UV; unequal x/z stretches the pattern
 *  (ice: long wind drifts). Strength scales the detail normal. */
export const TERRAIN_DETAIL: Record<string, [number, number, number]> = {
  desert: [5.5, 5.5, 0.55], mesa: [5.5, 5.5, 0.55], ice: [3.0, 8.0, 0.75], jungle: [6.5, 6.5, 0.5], malastare: [6.5, 6.5, 0.5],
  lava: [4.5, 4.5, 0.6], crystal: [5, 5, 0.5], aquilaris: [5.5, 5.5, 0.5],
};

export function terrainMaterial(o: TerrainMatOpts) {
  // texture budget (WebGPU: 16 sampled textures per stage incl. env + shadow maps): 4 layers × (map+height, normal+roughness)
  // packed by generateTexture + macro + micro (+ lava emissive) = 10–11 bindings
  const mat = new THREE.MeshStandardNodeMaterial(); mat.roughness = 1; mat.metalness = 0;
  const wp = positionWorld, nW = normalWorldGeometry; const dist = length(positionView);
  const sp = attribute('aSplat', 'vec4'); const uvG = uv(); const m = macroTexture();
  const mv = texture(m, uvG.mul(0.0931)).r.mul(0.6).add(texture(m, uvG.mul(0.0217).add(0.37)).g.mul(0.4));
  const gT = texture(o.ground.map, uvG), gNT = texture(o.ground.normalMap, uvG);
  const uvR = wp.xz.mul(1 / 7); const rT = texture(o.gravel.map, uvR), rNT = texture(o.gravel.normalMap, uvR);
  const uvB = wp.xz.mul(1 / 18); const bT = texture(o.basin.map, uvB), bNT = texture(o.basin.normalMap, uvB);
  const ts = o.rockScale ?? 1 / 26;
  const wx = nW.x.mul(nW.x), wz = nW.z.mul(nW.z); const sw = wx.add(wz).add(1e-4);
  const kT = texture(o.rock.map, wp.zy.mul(ts)).mul(wx.div(sw)).add(texture(o.rock.map, wp.xy.mul(ts)).mul(wz.div(sw)));
  const kNT = texture(o.rock.normalMap, select(abs(nW.x).greaterThan(abs(nW.z)), wp.zy, wp.xy).mul(ts));
  const gC = gT.rgb.mul(mix(float(0.72), float(1.22), mv)), rC = rT.rgb, bC = bT.rgb, kC = kT.rgb.mul(strataTint(o.strata));
  // height-aware weights
  const slope = oneMinus(clamp(nW.y, 0.0, 1.0));
  const wG = smoothstep(0.36, 0.64, sp.x.add(rT.a.sub(gT.a).mul(0.7)));
  const wB = smoothstep(0.4, 0.6, sp.y.add(bT.a.sub(0.5).mul(0.25)).add(mv.sub(0.5).mul(0.25))).mul(ssInv(0.2, 0.07, slope));
  const wK = smoothstep(0.2, 0.36, slope.add(kT.a.sub(0.5).mul(0.2)).add(mv.sub(0.5).mul(0.1)));
  const microT = texture(microTexture(), wp.xz.mul(1 / 1.7)); const microF = float(o.bump ? 0.6 : 0).mul(ssInv(50.0, 6.0, dist));
  // per-world detail: ground normal/roughness map again at a finer scale, only on the ground layer and near the camera (same texture → no extra binding)
  const dS = o.detail ?? [5.5, 5.5, 0.5];
  const dNT = texture(o.ground.normalMap, uvG.mul(vec2(dS[0], dS[1])).add(vec2(0.37, 0.11)));
  const dF = float(o.bump ? dS[2] : 0).mul(ssInv(70.0, 8.0, dist)).mul(oneMinus(wG)).mul(oneMinus(wB)).mul(oneMinus(wK));
  let col: N = mix(mix(mix(gC, rC, wG), bC, wB), kC, wK);
  col = col.mul(mix(float(1), microT.a.mul(0.56).add(0.72), microF)).mul(vertexColor()).mul(cloudShade(o.cloud));
  mat.colorNode = col;
  if (o.bump) {
    const dec = (t: N) => t.xyz.mul(2).sub(1);
    let n: N = mix(mix(mix(dec(gNT), dec(rNT), wG), dec(bNT), wB.mul(0.8)), dec(kNT), wK.mul(0.8));
    n = vec3(n.xy.add(microT.xy.mul(2).sub(1).mul(microF).mul(0.8)).add(dNT.xy.mul(2).sub(1).mul(dF)), n.z);
    mat.normalNode = normalMap(normalize(n).mul(0.5).add(0.5));
  }
  const bR = float(o.layers.basinRough).mul(bNT.a.mul(1.4));
  mat.roughnessNode = specAA(clamp(mix(mix(mix(mix(gNT.a, dNT.a, dF.mul(0.5)), rNT.a, wG), bR, wB), kNT.a, wK), 0.03, 1.0), 1, 0.2);
  if (o.layers.basinMetal > 0) mat.metalnessNode = wB.mul(o.layers.basinMetal);
  let em: N = null;
  if (o.ground.emissiveMap) em = texture(o.ground.emissiveMap, uvG).rgb.mul(color(o.emissive ?? '#ffffff')).mul(o.emissiveIntensity ?? 1.1).mul(oneMinus(wK));
  if (o.layers.basinEmissive) { const be = color(o.layers.basinEmissive).mul(oneMinus(smoothstep(0.12, 0.3, bT.a))).mul(2.2).mul(wB); em = em ? em.add(be) : be; } // glowing cracks from packed height
  if (em) mat.emissiveNode = em;
  return mat;
}
