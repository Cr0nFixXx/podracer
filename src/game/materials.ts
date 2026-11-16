import * as THREE from 'three';
import { macroTexture, type TexSet } from './textures';

const PARS = /* glsl */`
uniform sampler2D parallaxMap;
uniform float parallaxScale;
uniform float parallaxLayers;
uniform sampler2D macroMap;
uniform float macroAmount;
uniform float detailStrength;
uniform float detailScale;
#ifdef USE_TRIPLANAR
uniform sampler2D triMap;
uniform sampler2D triNormal;
uniform float triScale;
uniform vec3 triTint;
varying vec3 vWPos;
varying vec3 vWNrm;
#endif
#ifdef USE_PARALLAX
vec2 parallaxUv(vec2 uv, vec3 viewPos, vec3 nrm) {
  vec3 p = -viewPos;
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 N = normalize(nrm);
  vec3 dp2perp = cross(dp2, N); vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-20);
  T *= invmax; B *= invmax;
  vec3 V = normalize(viewPos);
  vec3 Vt = vec3(dot(V, T), dot(V, B), dot(V, N));
  float fade = smoothstep(90.0, 20.0, length(viewPos));
  if (fade <= 0.0) return uv;
  float layers = mix(parallaxLayers * 2.0, parallaxLayers, abs(Vt.z));
  float layerDepth = 1.0 / layers;
  vec2 P = Vt.xy / max(Vt.z, 0.25) * parallaxScale * fade;
  vec2 dUv = P / layers;
  vec2 cur = uv; float curDepth = 0.0;
  float h = 1.0 - textureGrad(parallaxMap, cur, duv1, duv2).r;
  for (int i = 0; i < 48; i++) {
    if (curDepth >= h || float(i) >= layers) break;
    cur -= dUv; h = 1.0 - textureGrad(parallaxMap, cur, duv1, duv2).r; curDepth += layerDepth;
  }
  vec2 prev = cur + dUv;
  float after = h - curDepth;
  float before = (1.0 - textureGrad(parallaxMap, prev, duv1, duv2).r) - curDepth + layerDepth;
  float w = after / (after - before + 1e-5);
  return mix(cur, prev, clamp(w, 0.0, 1.0));
}
#endif
`;

const MAP_FRAG = /* glsl */`
vec2 pUv = vMapUv;
#ifdef USE_PARALLAX
  pUv = parallaxUv(vMapUv, vViewPosition, vNormal);
#endif
${THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, 'pUv')}
// anti-tiling macro variation (two incommensurate scales)
float macroV = texture2D(macroMap, vMapUv * 0.0931).r * 0.6 + texture2D(macroMap, vMapUv * 0.0217 + 0.37).g * 0.4;
diffuseColor.rgb *= mix(1.0 - macroAmount, 1.0 + macroAmount * 0.8, macroV);
float triBlend = 0.0;
#ifdef USE_TRIPLANAR
  vec3 bw = pow(abs(vWNrm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
  vec3 tp = texture2D(triMap, vWPos.zy * triScale).rgb * bw.x + texture2D(triMap, vWPos.xz * triScale).rgb * bw.y + texture2D(triMap, vWPos.xy * triScale * vec2(1.0, 1.0)).rgb * bw.z;
  float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
  triBlend = smoothstep(0.2, 0.4, slope + (macroV - 0.5) * 0.12);
  diffuseColor.rgb = mix(diffuseColor.rgb, tp * triTint, triBlend);
#endif
`;

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
}

export function surfaceMaterial(set: TexSet, o: SurfaceOpts = {}) {
  const [rx, ry] = o.repeat ?? [1, 1];
  const prep = (t?: THREE.Texture) => { if (!t) return undefined; const n = t.clone(); n.repeat.set(rx, ry); n.needsUpdate = true; return n; };
  const map = prep(set.map)!, normalMap = prep(set.normalMap)!, rh = prep(set.rhMap)!, em = prep(set.emissiveMap);
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap: rh, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0,
    color: new THREE.Color(o.color ?? '#ffffff'),
    normalScale: new THREE.Vector2((o.bump ?? true) ? (o.normalScale ?? 1) : 0, (o.bump ?? true) ? (o.normalScale ?? 1) : 0),
    envMapIntensity: o.envMapIntensity ?? 1,
    displacementMap: (o.displace ?? 0) > 0 ? rh : null,
    displacementScale: o.displace ?? 0,
  });
  if (em) { mat.emissiveMap = em; mat.emissive = new THREE.Color(o.emissive ?? '#ffffff'); mat.emissiveIntensity = o.emissiveIntensity ?? 2; }
  const useParallax = (o.parallax ?? 0) > 0;
  const defines: Record<string, string> = {};
  if (useParallax) defines.USE_PARALLAX = '';
  if (o.triplanar) defines.USE_TRIPLANAR = '';
  mat.defines = defines;
  const triMap = o.triplanar ? o.triplanar.set.map : null;
  const triNormal = o.triplanar ? o.triplanar.set.normalMap : null;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.parallaxMap = { value: rh };
    shader.uniforms.parallaxScale = { value: o.parallax ?? 0 };
    shader.uniforms.parallaxLayers = { value: o.layers ?? 12 };
    shader.uniforms.macroMap = { value: macroTexture() };
    shader.uniforms.macroAmount = { value: o.macro ?? 0.22 };
    shader.uniforms.detailStrength = { value: (o.bump ?? true) ? (o.detail ?? 0.45) : 0 };
    shader.uniforms.detailScale = { value: o.detailScale ?? 5.3 };
    if (o.triplanar) {
      shader.uniforms.triMap = { value: triMap };
      shader.uniforms.triNormal = { value: triNormal };
      shader.uniforms.triScale = { value: o.triplanar.scale };
      shader.uniforms.triTint = { value: new THREE.Color(o.triplanar.tint ?? '#ffffff') };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    }
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + PARS);
    fs = fs.replace('#include <map_fragment>', MAP_FRAG);
    fs = fs.replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace(/vRoughnessMapUv/g, 'pUv'));
    fs = fs.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps
      .replace(/vNormalMapUv/g, 'pUv')
      .replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale;
        vec3 dN = texture2D(normalMap, pUv * detailScale + 0.13).xyz * 2.0 - 1.0;
        mapN.xy += dN.xy * detailStrength * smoothstep(60.0, 5.0, length(vViewPosition));
        #ifdef USE_TRIPLANAR
          mapN = mix(mapN, texture2D(triNormal, (abs(vWNrm.x) > abs(vWNrm.z) ? vWPos.zy : vWPos.xy) * triScale).xyz * 2.0 - 1.0, triBlend * 0.8);
        #endif`));
    fs = fs.replace('#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace(/vEmissiveMapUv/g, 'pUv'));
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `surf|${useParallax ? 'p' + (o.layers ?? 12) : ''}|${o.triplanar ? 't' : ''}`;
  return mat;
}
