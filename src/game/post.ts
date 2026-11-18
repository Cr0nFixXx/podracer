import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { smaa } from 'three/examples/jsm/tsl/display/SMAANode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { radialBlur } from 'three/examples/jsm/tsl/display/radialBlur.js';
import type { GfxSettings } from './settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  Fn, Loop, blendColor, floor, fract, sin, dot, max, screenSize, getNormalFromDepth, convertToTexture, float, int, length, luminance, metalness, mix, mrt,
  oneMinus, perspectiveDepthToViewZ, cameraNear, cameraFar, output, pass, pow, renderOutput, roughness, sample, screenUV, smoothstep, step, uniform, vec2, vec3, vec4,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
// three r187 bug (session 7): in WebGPU compatibility mode depth textures are bound as texture_2d<f32>, but
// generateTextureGather() still omits the gather component for depth textures → invalid WGSL in GTAO
// ("no matching call to textureGather") → broken AO pipeline = the reported heavy AO artefacts. Patch: treat such
// depth textures as colour textures for gather code generation.
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WB = (THREE as any).WGSLNodeBuilder?.prototype;
  if (WB && !WB.__gatherPatched) {
    const orig = WB.generateTextureGather;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WB.generateTextureGather = function (this: any, texture: any, ...rest: unknown[]) {
      if (texture?.isDepthTexture && this.renderer?.backend?.compatibilityMode && texture.compareFunction === null) {
        const proxy = Object.create(texture); Object.defineProperty(proxy, 'isDepthTexture', { value: false });
        return orig.call(this, proxy, ...rest);
      }
      return orig.call(this, texture, ...rest);
    };
    WB.__gatherPatched = true;
  }
}
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnyTHREE = THREE as any;

/**
 * Post-processing as a TSL RenderPipeline (WebGPU + WebGL2 fallback backend).
 * scene pass (+MRT normal/metal-rough when SSR or GTAO are on) → SSR → GTAO → bloom (subtle) → god rays →
 * cinematic (speed blur, CA, grading, vignette, damage, boost, flash – NO film grain) → tone mapping → SMAA/FXAA.
 */
export class PostFX {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipeline: any;
  cine: { uniforms: { time: { value: number }; speed: { value: number }; boost: { value: number }; damage: { value: number }; flash: { value: number }; wet: { value: number } } };
  godRays: { uniforms: { sunPos: { value: THREE.Vector2 }; intensity: { value: number } } } | null = null;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, gfx: GfxSettings) {
    const u = { time: uniform(0), speed: uniform(0), boost: uniform(0), damage: uniform(0), flash: uniform(0), wet: uniform(0) };
    this.cine = { uniforms: u };
    const scenePass = pass(scene, camera);
    const needMRT = gfx.ssr; // GTAO reconstructs normals from depth (session 9) → transparent smoke/exhaust can't corrupt AO
    // session 10: no normal target any more – SSR and GTAO reconstruct normals from depth (transparent smoke/exhaust can't corrupt them)
    if (needMRT) scenePass.setMRT(mrt({ output, metalrough: vec2(metalness, roughness) }));
    const sceneColor = scenePass.getTextureNode('output');
    let col: N = sceneColor;

    const depthAll = scenePass.getTextureNode('depth');
    if (needMRT) {
      const depth = depthAll;
      scenePass.getTexture('metalrough').type = THREE.UnsignedByteType;
      const projInv = uniform(camera.projectionMatrixInverse);
      const normal = sample((uvN: N) => getNormalFromDepth(uvN, scenePass.getTexture('depth'), projInv));
      if (gfx.ssr) {
        const mr = scenePass.getTextureNode('metalrough');
        const s = ssr(sceneColor, depth, normal, { metalnessNode: mr.r, roughnessNode: mr.g, camera });
        s.resolutionScale = 0.5;
        col = blendColor(col, s);
      }
    }

    if (gfx.ao) {
      // GTAO tuned for metre-scale worlds (defaults: radius 0.25 → noisy black halos at our scale),
      // depth-aware denoise at full res (half-res AO upsampled without it bleeds over silhouettes),
      // sky masked, faded out with distance (far depth precision is poor with a 12 km far plane), strength 0.8.
      const a = ao(depthAll, null as unknown as N, camera);
      a.resolutionScale = 0.5; a.radius.value = 1.6; a.thickness.value = 2.5; a.distanceExponent.value = 1.5; a.distanceFallOff.value = 1.0; a.scale.value = 1.0; a.samples.value = 12;
      const den: N = denoise(a.getTextureNode(), depthAll, null as unknown as N, camera);
      const dS = depthAll.sample(screenUV).r;
      const vz = perspectiveDepthToViewZ(dS, cameraNear, cameraFar).negate();
      const fade = oneMinus(smoothstep(60.0, 220.0, vz)).mul(step(dS, 0.99999));
      col = col.mul(mix(float(1.0), den.r, fade.mul(0.8)));
    }

    // subtle bloom (high threshold) – spec: no excessive bloom / overexposure
    if (gfx.bloom && gfx.bloomStrength > 0) col = col.add(bloom(col, 0.25 * gfx.bloomStrength, 0.3, 1.6));

    // god rays: radial blur of the HDR bright pass towards the sun
    if (gfx.godRays) {
      const sunPos = uniform(new THREE.Vector2(0.5, 0.5)), intensity = uniform(0);
      this.godRays = { uniforms: { sunPos, intensity } };
      const skyMask = step(0.999999, scenePass.getTextureNode('depth').sample(screenUV).r);
      const bright = (c: N) => vec4(c.rgb.mul(smoothstep(2.0, 6.0, luminance(c.rgb))).mul(skyMask), 1.0);
      const blurred: N = radialBlur(bright(col), { center: sunPos, weight: float(1.0), decay: float(0.965), count: int(48), exposure: float(1.0) });
      const rays = blurred.rgb.sub(bright(col).rgb).mul(2.0).max(0.0);
      const fall = oneMinus(smoothstep(0.0, 0.8, length(screenUV.sub(sunPos))));
      col = vec4(col.rgb.add(rays.mul(vec3(1.0, 0.9, 0.7)).mul(intensity).mul(1.6).mul(fall)), 1.0);
    }

    // cinematic pass
    const src = convertToTexture(col);
    const motion = gfx.motionBlur, cineOn = gfx.cinematic, vignette = gfx.cinematic ? 0.9 : 0.3;
    const cinematic = Fn(() => {
      const uvv = screenUV; const c = uvv.sub(0.5); const r = length(c);
      let base: N;
      if (motion) {
        const bs = u.speed.mul(smoothstep(0.15, 0.6, r)).mul(0.035);
        const acc = vec3(0).toVar();
        Loop(10, ({ i }: { i: N }) => { acc.addAssign(src.sample(c.mul(oneMinus(bs.mul(float(i).div(9.0)))).add(0.5)).rgb); });
        base = acc.div(10.0);
      } else base = src.sample(uvv).rgb;
      let g: N = base;
      if (cineOn) {
        const a = float(0.002).add(u.speed.mul(0.004)).add(u.damage.mul(0.006)).mul(r);
        g = vec3(mix(base.r, src.sample(uvv.sub(c.mul(a).mul(2.0))).r, 0.8), base.g, mix(base.b, src.sample(uvv.add(c.mul(a).mul(2.0))).b, 0.8));
        const l = luminance(g);
        g = mix(g, g.mul(vec3(0.92, 1.0, 1.08)), ssInv(0.4, 0.0, l).mul(0.35));
        g = mix(g, g.mul(vec3(1.06, 1.0, 0.92)), smoothstep(0.4, 1.2, l).mul(0.3));
        g = g.add(vec3(0.6, 0.85, 1.0).mul(u.boost).mul(smoothstep(0.3, 0.75, r)).mul(0.25));
        g = mix(g, vec3(l).mul(vec3(1.4, 0.4, 0.3)), u.damage.mul(smoothstep(0.25, 0.8, r)).mul(0.5));
      }
      if (cineOn) {
        // session 15: lens droplets after driving through a waterfall – two cell layers, every drop refracts the scene;
        // drops vanish one by one while u.wet decays (max ≈ 35 % of the cells carry a drop)
        const asp = screenSize.x.div(screenSize.y);
        const drop = (scale: number, seed: number) => {
          const p = vec2(uvv.x.mul(asp), uvv.y).mul(scale); const id = floor(p), f = fract(p).sub(0.5);
          const r1 = fract(sin(dot(id, vec2(127.1 + seed, 311.7))).mul(43758.5453)), r2 = fract(sin(dot(id, vec2(269.5, 183.3 + seed))).mul(43758.5453));
          const d = f.sub(vec2(r1.sub(0.5), r2.sub(0.5)).mul(0.5)); const rad = r2.mul(0.13).add(0.1);
          const m = oneMinus(smoothstep(rad.mul(0.55), rad, length(d))).mul(step(r1, u.wet.mul(0.35)));
          return { m, d };
        };
        const d1 = drop(8, 0), d2 = drop(15, 7);
        const dm = max(d1.m, d2.m); const dv = d1.d.mul(d1.m).add(d2.d.mul(d2.m));
        g = mix(g, src.sample(uvv.sub(dv.mul(0.2))).rgb.mul(1.05).add(0.015), dm.mul(0.85));
      }
      g = g.mul(oneMinus(pow(r.mul(1.25), 2.6).mul(vignette * 0.75)));
      return vec4(g.add(vec3(1.0, 0.9, 0.8).mul(u.flash)), 1.0);
    })();

    const RP = AnyTHREE.RenderPipeline ?? AnyTHREE.PostProcessing;
    this.pipeline = new RP(renderer);
    if (gfx.aa === 'none') this.pipeline.outputNode = cinematic;
    else {
      this.pipeline.outputColorTransform = false;
      const out = renderOutput(cinematic);
      this.pipeline.outputNode = gfx.aa === 'smaa' ? smaa(out) : fxaa(out);
    }
  }
  /** Transparent materials (particles, glass, flames, smoke) must not touch the normal / metal-rough MRT targets:
   *  in WebGPU compatibility mode MRT blending is not per target, so their blended normals corrupted GTAO/SSR
   *  (flickering halos around particles). Writing alpha 0 leaves the targets unchanged under normal/additive blending. */
  static protectMRT(root: THREE.Object3D) {
    // `output` MUST be part of the material MRT: three uses material.mrtNode alone for render targets without a pass MRT
    // (otherwise → empty WGSL output struct). One node per material (no shared node across builders).
    root.traverse(o => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ms = (o as any).material; if (!ms) return;
      for (const m of Array.isArray(ms) ? ms : [ms]) if (m.transparent && m.isNodeMaterial !== false && !m.mrtNode) m.mrtNode = mrt({ output, normal: vec4(0, 0, 0, 0), metalrough: vec4(0, 0, 0, 0) });
    });
  }
  setSize(w: number, h: number) { void w; void h; /* pass nodes follow the renderer size */ }
  render() { this.pipeline.render(); }
  dispose() { this.pipeline.dispose?.(); }
}
