import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import type { GfxSettings } from './settings';

const GodRaysShader = {
  uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2(0.5, 0.5) }, intensity: { value: 0.0 }, sunColor: { value: new THREE.Color(1, 0.9, 0.7) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float intensity; uniform vec3 sunColor; varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (intensity <= 0.001) { gl_FragColor = base; return; }
      vec2 delta = (vUv - sunPos) / 56.0 * 0.9;
      vec2 uv = vUv; float illum = 1.0; vec3 acc = vec3(0.0);
      float dither = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      uv -= delta * dither;
      for (int i = 0; i < 56; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float l = dot(s, vec3(0.299, 0.587, 0.114));
        acc += max(s * smoothstep(2.0, 6.0, l), 0.0) * illum;
        illum *= 0.965;
      }
      acc /= 56.0;
      float fall = 1.0 - smoothstep(0.0, 0.8, length(vUv - sunPos));
      gl_FragColor = vec4(base.rgb + acc * sunColor * intensity * 2.6 * fall, base.a);
    }`,
};

const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, speed: { value: 0 }, ca: { value: 0.002 }, vignette: { value: 0.9 },
    grain: { value: 0.035 }, blur: { value: 1.0 }, damage: { value: 0.0 }, boost: { value: 0.0 }, flash: { value: 0.0 }, enabled: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time, speed, ca, vignette, grain, blur, damage, boost, flash, enabled; varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 13.0) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; float r = length(c);
      vec3 col;
      float bs = blur * speed * smoothstep(0.15, 0.6, r) * 0.035;
      if (bs > 0.0005) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 10; i++) { float f = float(i) / 9.0; acc += texture2D(tDiffuse, 0.5 + c * (1.0 - bs * f)).rgb; }
        col = acc / 10.0;
      } else col = texture2D(tDiffuse, vUv).rgb;
      if (enabled > 0.5) {
        float a = (ca + speed * 0.004 + damage * 0.006) * r;
        col.r = mix(col.r, texture2D(tDiffuse, vUv - c * a * 2.0).r, 0.8);
        col.b = mix(col.b, texture2D(tDiffuse, vUv + c * a * 2.0).b, 0.8);
        // grading: subtle teal shadows / warm highlights
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, col * vec3(0.92, 1.0, 1.08), smoothstep(0.4, 0.0, l) * 0.35);
        col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.4, 1.2, l) * 0.3);
        col += vec3(0.6, 0.85, 1.0) * boost * smoothstep(0.3, 0.75, r) * 0.25;
        col *= 1.0 - vignette * pow(r * 1.25, 2.6) * 0.75;
        col = mix(col, vec3(l) * vec3(1.4, 0.4, 0.3), damage * smoothstep(0.25, 0.8, r) * 0.5);
        col += (rnd(vUv * 731.0) - 0.5) * grain * (0.6 + l);
      }
      col += vec3(1.0, 0.9, 0.8) * flash;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  composer: EffectComposer;
  godRays: ShaderPass | null = null;
  cine: ShaderPass;
  bloom: UnrealBloomPass | null = null;
  ssr: SSRPass | null = null;
  gtao: GTAOPass | null = null;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, gfx: GfxSettings, glossy: THREE.Mesh[], w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, rt);
    if (gfx.ssr && glossy.length) {
      this.ssr = new SSRPass({ renderer, scene, camera, width: w, height: h, selects: glossy, groundReflector: null } as unknown as ConstructorParameters<typeof SSRPass>[0]);
      this.ssr.thickness = 0.4; this.ssr.maxDistance = 120; this.ssr.opacity = 0.6; (this.ssr as unknown as { blur: boolean }).blur = true;
      this.composer.addPass(this.ssr);
    } else this.composer.addPass(new RenderPass(scene, camera));
    if (gfx.ao) {
      this.gtao = new GTAOPass(scene, camera, Math.floor(w * 0.5), Math.floor(h * 0.5));
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.2, thickness: 3, scale: 1, samples: 12 });
      this.composer.addPass(this.gtao);
    }
    if (gfx.bloom && gfx.bloomStrength > 0) { this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.floor(w / 2), Math.floor(h / 2)), 0.25 * gfx.bloomStrength, 0.3, 1.6); this.composer.addPass(this.bloom); }
    if (gfx.godRays) { this.godRays = new ShaderPass(GodRaysShader); this.composer.addPass(this.godRays); }
    this.cine = new ShaderPass(CinematicShader);
    this.cine.uniforms.enabled.value = gfx.cinematic ? 1 : 0;
    this.cine.uniforms.blur.value = gfx.motionBlur ? 1 : 0;
    this.cine.uniforms.grain.value = gfx.cinematic ? 0.03 : 0;
    this.cine.uniforms.vignette.value = gfx.cinematic ? 0.9 : 0.3;
    this.composer.addPass(this.cine);
    this.composer.addPass(new OutputPass());
    if (gfx.aa === 'smaa') this.composer.addPass(new SMAAPass());
    else if (gfx.aa === 'fxaa') this.composer.addPass(new FXAAPass());
  }
  setSize(w: number, h: number) { this.composer.setSize(w, h); }
  render(dt: number) { this.composer.render(dt); }
  dispose() { this.composer.dispose(); }
}
