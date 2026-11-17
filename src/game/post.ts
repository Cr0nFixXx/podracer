import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { smaa } from 'three/examples/jsm/tsl/display/SMAANode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { radialBlur } from 'three/examples/jsm/tsl/display/radialBlur.js';
import type { GfxSettings } from './settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  Fn, Loop, blendColor, colorToDirection, convertToTexture, directionToColor, float, int, length, luminance, metalness, mix, mrt,
  normalView, oneMinus, output, pass, pow, renderOutput, roughness, sample, screenUV, smoothstep, step, uniform, vec2, vec3, vec4,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
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
  cine: { uniforms: { time: { value: number }; speed: { value: number }; boost: { value: number }; damage: { value: number }; flash: { value: number } } };
  godRays: { uniforms: { sunPos: { value: THREE.Vector2 }; intensity: { value: number } } } | null = null;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, gfx: GfxSettings) {
    const u = { time: uniform(0), speed: uniform(0), boost: uniform(0), damage: uniform(0), flash: uniform(0) };
    this.cine = { uniforms: u };
    const scenePass = pass(scene, camera);
    const needMRT = gfx.ssr || gfx.ao;
    if (needMRT) scenePass.setMRT(mrt({ output, normal: directionToColor(normalView), metalrough: vec2(metalness, roughness) }));
    const sceneColor = scenePass.getTextureNode('output');
    let col: N = sceneColor;

    if (needMRT) {
      const depth = scenePass.getTextureNode('depth');
      scenePass.getTexture('normal').type = THREE.UnsignedByteType;
      scenePass.getTexture('metalrough').type = THREE.UnsignedByteType;
      const nNode = scenePass.getTextureNode('normal');
      const normal = sample((uvN: N) => colorToDirection(nNode.sample(uvN)));
      if (gfx.ssr) {
        const mr = scenePass.getTextureNode('metalrough');
        const s = ssr(sceneColor, depth, normal, { metalnessNode: mr.r, roughnessNode: mr.g, camera });
        s.resolutionScale = 0.5;
        col = blendColor(col, s);
      }
      if (gfx.ao) {
        const a = ao(depth, normal, camera); a.resolutionScale = 0.5;
        col = col.mul(a.getTextureNode().sample(screenUV).r);
      }
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
  setSize(w: number, h: number) { void w; void h; /* pass nodes follow the renderer size */ }
  render() { this.pipeline.render(); }
  dispose() { this.pipeline.dispose?.(); }
}
