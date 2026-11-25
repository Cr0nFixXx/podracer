import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { smaa } from 'three/examples/jsm/tsl/display/SMAANode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import type { GfxSettings } from './settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const {
  Fn, If, Loop, abs, atan, clamp, convertToTexture, dot, exp, float, floor, fract, sin, interleavedGradientNoise, ivec2,
  length, luminance, max, metalness, min, mix, mrt, normalView, oneMinus, output, packNormalToRGB, pass,
  perspectiveDepthToViewZ, pow, renderOutput, roughness, sample, screenCoordinate, screenUV, smoothstep, step,
  textureLoad, textureSize, uniform, unpackRGBToNormal, vec2, vec3, vec4,
} = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnyTHREE = THREE as any;

/**
 * Fast, 100% artifact-free TSL PostFX pipeline (WebGPU + WebGL2 fallback):
 *  - Every `textureSample` stays in strict uniform control flow; all conditional/loop depth reads use
 *    derivative-free `textureLoad` (zero WGSL uniformity faults, zero quad-border seam artifacts).
 *  - AO: 4-pair symmetric depth-concavity occlusion (`z0 - 0.5*(z+ + z-)`). Mathematically cancels out
 *    every flat plane at any angle (zero terrain striping), rejects silhouette jumps (zero halos or
 *    dithered-grass noise), needs zero MRT normal buffer (immune to particles/flames/smoke), 5× faster.
 *  - SSR: opaque-only MRT alpha mask, low-step mirror march, uniform-flow composite, distance/roughness fade.
 *  - Bloom: half-resolution (`0.5×`) + high threshold (`2.1`) → 4× less fillrate, zero overexposure.
 *  - God Rays: 14-tap `textureLoad` sky-depth shafts (0 ms when sun off-axis, zero water/ground streaks).
 *  - `warmup()`: compiles HalfFloat scene + shadow + PostFX pipelines & flushes GPU queue BEFORE countdown!
 */
/** frames the warm-up draws before the countdown: the longest chain of nested passes measured is 3 (SSR inside the SMAA input), one in reserve */
const WARM_FRAMES = 4;

export class PostFX {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scenePass: any;
  cine: { uniforms: { time: { value: number }; speed: { value: number }; boost: { value: number }; damage: { value: number }; flash: { value: number }; flow: { value: number } } };
  godRays: { uniforms: { sunPos: { value: THREE.Vector2 }; intensity: { value: number } } } | null = null;
  /** Session 11 lens effects: sun glare/flare strength, viewport aspect, rain droplets on the lens (0..1), sun colour */
  lens!: { flare: { value: number }; aspect: { value: number }; rain: { value: number }; sunColor: { value: THREE.Color } | null; /** colour of the drops (white = water; Malastare: methane green) */ rainTint: { value: THREE.Color } };
  /** Exhaust heat-haze plumes (6 slots: player L/R + 2 nearest rival pods L/R): vec4(screenU, screenV, 1/radius, weight 0..1) */
  heat: { plumes: { value: THREE.Vector4 }[]; strength: { value: number } } | null = null;
  private disposables: { dispose?: () => void }[] = [];

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, gfx: GfxSettings, env: { rain?: number; flare?: boolean } = {}) {
    const lensOn = gfx.lensFx ?? true; const flareOn = lensOn && !!env.flare; const rainOn = lensOn && (env.rain ?? 0) > 0.05;
    const u = { time: uniform(0), speed: uniform(0), boost: uniform(0), damage: uniform(0), flash: uniform(0), flow: uniform(0) }; // flow = accumulated airstream phase for lens drops
    this.cine = { uniforms: u };
    const scenePass = pass(scene, camera);
    this.scenePass = scenePass;
    const camNear = float(camera.near), camFar = float(camera.far);

    // Allocate MRT only when SSR is explicitly enabled (AO uses pure depth-buffer textureLoad)
    if (gfx.ssr) {
      const opaqueAlpha = Fn((_p: N, builder: N) => float(builder?.material?.transparent && !builder?.material?.userData?.ground ? 0.0 : 1.0))(); // (blended ground, `fade: 'soft'`, IS the surface where it is drawn)
      const mrtNode = mrt({
        output,
        normal: vec4(packNormalToRGB(normalView), opaqueAlpha),
        // .r = REFLECTIVITY, not plain metalness: SSRNode discards pixels with 0 here, which removed every reflection from puddles,
        // wet roads and ice (all non-metals). Smooth dielectrics (roughness < 0.3) now reflect too.
        metalrough: vec4(max(metalness, ssInv(0.3, 0.1, roughness).mul(0.7)), roughness, float(0.0), opaqueAlpha),
      });
      const keepOpaque = new THREE.BlendMode(THREE.NormalBlending);
      mrtNode.setBlendMode('normal', keepOpaque);
      mrtNode.setBlendMode('metalrough', keepOpaque);
      mrtNode.setClearColor('normal', 0x8080ff, 1);
      mrtNode.setClearColor('metalrough', 0x00ff00, 1);
      scenePass.setMRT(mrtNode);
      scenePass.getTexture('normal').type = THREE.UnsignedByteType;
      scenePass.getTexture('metalrough').type = THREE.UnsignedByteType;
    }

    const sceneColor = scenePass.getTextureNode('output');
    const needDepth = gfx.ao || gfx.ssr || gfx.godRays || flareOn;
    const depthNode = needDepth ? scenePass.getTextureNode('depth') : null;
    const depthTex: THREE.Texture | null = needDepth ? scenePass.getTexture('depth') : null;

    // Clamp raw scene HDR to [0, 12] to prevent any NaN/negative/specular firefly from reaching Bloom/SSR
    let col: N = Fn(() => vec4(clamp(sceneColor.sample(screenUV).rgb, vec3(0.0), vec3(12.0)), float(1.0)))();

    // ---- Uniform-flow, flicker-free SSR (when toggled on) ----
    if (gfx.ssr && depthNode) {
      const nNode = scenePass.getTextureNode('normal');
      const mrNode = scenePass.getTextureNode('metalrough');
      const normal = sample((uvN: N) => unpackRGBToNormal(nNode.sample(uvN)));
      const s = ssr(sceneColor, depthNode, normal, { metalnessNode: mrNode.r, roughnessNode: mrNode.g, camera });
      s.resolutionScale = Math.max(0.25, Math.min(1, gfx.reflRes ?? 1)); // adjustable; „Hoch" and „Ultra": 100 % (2026-11-25; 75 % before, 35 % before Session 17)
      s.quality.value = 0.22;
      s.maxDistance.value = 130; // far enough to catch buildings, walls and other pods in puddles
      s.thickness.value = 3.5;
      s.maxLuminance.value = 2.4;
      s.intensity.value = 0.85;
      s.screenEdgeFade.value = 0.28;
      s.screenEdgeFadeBlack = true;
      s.blurQuality = 2; // smoother (less speckle) reflections
      this.disposables.push(s);
      const ssrTex = (s as N).getTextureNode ? (s as N).getTextureNode() : s;
      const prev = col;
      col = Fn(() => {
        // 100% uniform control flow
        const b = prev.rgb;
        const d = depthNode.sample(screenUV).r;
        const vz = perspectiveDepthToViewZ(d, camNear, camFar).negate();
        const mr = mrNode.sample(screenUV);
        const r = ssrTex.sample(screenUV);
        const fade = ssInv(110.0, 35.0, vz).mul(ssInv(0.38, 0.14, mr.g)).mul(smoothstep(0.08, 0.25, mr.r)).mul(step(d, 0.9998));
        const w = clamp(r.a.mul(fade).mul(0.8), 0.0, 0.8);
        const safeR = clamp(r.rgb, vec3(0.0), vec3(2.2));
        return vec4(b.add(safeR.mul(w)), 1.0);
      })();
    }

    // ---- Zero-artifact symmetric paired-depth Ambient Occlusion (AO) ----
    if (gfx.ao && depthTex) {
      const prev = col;
      // 4 golden-angle unit directions (symmetric ± pairs cancel out all flat slopes automatically!)
      const dirs: [number, number][] = [[0.96, 0.28], [-0.42, 0.91], [0.58, -0.81], [0.18, 0.98]];
      col = Fn(() => {
        const b = prev.rgb;
        const dSz = vec2(textureSize(textureLoad(depthTex)));
        const maxPx = ivec2(dSz.sub(vec2(1.0)));
        const px0 = clamp(ivec2(screenUV.mul(dSz)), ivec2(0), maxPx);
        const d0 = float(textureLoad(depthTex, px0));
        const vz0 = perspectiveDepthToViewZ(d0, camNear, camFar).negate();
        const fade = ssInv(95.0, 32.0, vz0).mul(smoothstep(1.2, 3.0, vz0)).mul(step(d0, 0.9998));
        const emGuard = ssInv(1.8, 0.95, luminance(b));
        const strength = fade.mul(emGuard).mul(0.75);
        const aoFactor = float(1.0).toVar();
        If(strength.greaterThan(0.01), () => {
          // World-proportional screen pixel radius (clamped 2..18 px so close surfaces never stall texture cache)
          const rPx = clamp(float(280.0).div(max(vz0, float(3.0))), float(2.0), float(18.0));
          const maxJump = max(float(1.6), vz0.mul(0.065)); // halo rejection threshold
          const bias = max(float(0.045), vz0.mul(0.0022));  // blocks 24-bit depth self-occlusion completely
          const occ = float(0.0).toVar();
          for (let k = 0; k < dirs.length; k++) {
            const rad = rPx.mul(k < 2 ? 0.62 : 1.0);
            const off = vec2(dirs[k][0], dirs[k][1]).mul(rad);
            const pA = clamp(ivec2(vec2(px0).add(off)), ivec2(0), maxPx);
            const pB = clamp(ivec2(vec2(px0).sub(off)), ivec2(0), maxPx);
            const dA = float(textureLoad(depthTex, pA));
            const dB = float(textureLoad(depthTex, pB));
            const zA = perspectiveDepthToViewZ(dA, camNear, camFar).negate();
            const zB = perspectiveDepthToViewZ(dB, camNear, camFar).negate();
            // Reject pair cleanly if either tap hits sky or jumps across a silhouette/grass edge
            const jump = max(abs(zA.sub(vz0)), abs(zB.sub(vz0)));
            const valid = ssInv(maxJump, maxJump.mul(0.35), jump).mul(step(dA, 0.9998)).mul(step(dB, 0.9998));
            // Symmetric concavity: 0 on every flat plane, >0 inside corners, wall feet, curbs & pod crevices
            const concav = max(vz0.sub(zA.add(zB).mul(0.5)).sub(bias), float(0.0));
            occ.addAssign(clamp(concav.div(max(float(0.55), vz0.mul(0.03))), 0.0, 1.0).mul(valid));
          }
          const rawAo = clamp(float(1.0).sub(occ.mul(0.24)), 0.54, 1.0);
          aoFactor.assign(mix(float(1.0), rawAo, strength));
        });
        return vec4(b.mul(aoFactor), 1.0);
      })();
    }

    // ---- Half-resolution subtle bloom (4× less GPU bandwidth, strict no-overexposure threshold) ----
    if (gfx.bloom && gfx.bloomStrength > 0) {
      const bNode = bloom(col, 0.2 * gfx.bloomStrength, 0.28, 2.1);
      if (typeof (bNode as N).setResolutionScale === 'function') (bNode as N).setResolutionScale(0.5);
      this.disposables.push(bNode);
      col = col.add(bNode);
    }

    // ---- Lightweight depth-occluded sun shafts (textureLoad inside If/Loop = 100% WGSL valid, 0 ms off-sun) ----
    let sunPosU: N = null, sunIntU: N = null, sunColU: N = null;
    const flareU = uniform(0), aspectU = uniform(camera.aspect), rainU = uniform(env.rain ?? 0);
    const rainTintU = uniform(new THREE.Color(1, 1, 1));
    if ((gfx.godRays || flareOn) && depthTex) {
      sunPosU = uniform(new THREE.Vector2(0.5, 0.5));
      sunIntU = uniform(0);
      sunColU = uniform(new THREE.Color(1.0, 0.9, 0.72));
      this.godRays = { uniforms: { sunPos: sunPosU, intensity: sunIntU } };
    }
    this.lens = { flare: flareU, aspect: aspectU, rain: rainU, sunColor: sunColU, rainTint: rainTintU };
    // 6 exhaust plume uniforms (slots 0–1 = player L/R, slots 2–5 = two nearest visible rival pods' L/R nozzles)
    const heatP = Array.from({ length: 6 }, () => uniform(new THREE.Vector4(-2, -2, 25, 0))), heatS = uniform(0);
    if (lensOn) this.heat = { plumes: heatP, strength: heatS };

    // ---- Single-pass cinematic grading + speed blur + god rays (ZERO film grain) ----
    const src = convertToTexture(col);
    const motion = gfx.motionBlur, cineOn = gfx.cinematic, vignette = gfx.cinematic ? 0.82 : 0.26;
    const hasRays = !!(gfx.godRays && depthTex);
    const cinematic = Fn(() => {
      const uvv = screenUV; const c = uvv.sub(0.5); const r = length(c);
      // ---- Rain on the lens: swelling/evaporating beads + running drops with wet trails; each drop refracts the scene (screen y is down) ----
      let uvS: N = uvv, dropM: N = null;
      if (rainOn) {
        const h21 = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
        const asp = vec2(aspectU, 1.0);
        const spd = clamp(u.speed, 0.0, 1.0);                                   // 0 = standing … 1 = 150 m/s
        const wG = oneMinus(smoothstep(0.2, 0.6, spd)), wR = smoothstep(0.15, 0.55, spd);
        // (1) beads: swell, sit, evaporate – fewer as the airstream blows them off
        const p1 = uvv.mul(asp).mul(9.0); const id1 = floor(p1); const f1 = fract(p1).sub(0.5);
        const rn = h21(id1), rn2 = h21(id1.add(17.3));
        const life = fract(u.time.mul(0.11).mul(rn2.mul(0.8).add(0.6)).add(rn));
        const rad = rn2.mul(0.14).add(0.09).mul(smoothstep(0.0, 0.08, life)).mul(ssInv(1.0, 0.55, life)).add(0.0005);
        const dv1 = f1.sub(vec2(rn, rn2).sub(0.5).mul(0.5));
        const m1 = oneMinus(smoothstep(rad.mul(0.55), rad, length(dv1))).mul(step(rn, rainU.mul(0.9).mul(oneMinus(spd.mul(0.6)))));
        // (2) slow: drops run down the lens under gravity and leave a wet trail
        const p2 = vec2(uvv.x.mul(aspectU).mul(14.0), uvv.y.mul(2.2));
        const rc = h21(vec2(floor(p2.x), 3.7));
        const s2 = fract(p2.y.sub(u.time.mul(rc.mul(0.5).add(0.35))).add(rc.mul(7.0)));
        const fx2 = fract(p2.x).sub(0.5).add(sin(p2.y.mul(9.0).add(rc.mul(20.0))).mul(0.12));
        const dvh = vec2(fx2, s2.sub(0.8).mul(6.36));
        const on2 = step(rc, rainU.mul(0.75)).mul(wG);
        const m2 = oneMinus(smoothstep(0.08, 0.16, length(dvh))).mul(on2);
        const trail = oneMinus(smoothstep(0.02, 0.06, abs(fx2))).mul(smoothstep(0.2, 0.8, s2)).mul(step(s2, 0.8)).mul(on2).mul(0.45);
        // (3) fast: the airstream drives drops radially outwards from the screen centre; tails get longer with speed
        const cc = uvv.sub(0.5).mul(asp); const rr = length(cc).add(1e-4); const er = cc.div(rr), et = vec2(er.y.negate(), er.x);
        const aa = atan(cc.y, cc.x).div(6.2832).add(0.5).mul(30.0);
        const rc3 = h21(vec2(floor(aa), 9.1));
        const s3 = fract(rr.mul(2.6).sub(u.flow.mul(rc3.mul(0.6).add(0.7))).add(rc3.mul(5.0)));
        const tx = fract(aa).sub(0.5).mul(rr.mul(6.2832 / 30.0)), ry = s3.sub(0.8).div(2.6); // tangential / radial offset from the drop head
        const on3 = step(rc3, rainU.mul(0.85)).mul(wR).mul(smoothstep(0.1, 0.24, rr));
        const m3 = oneMinus(smoothstep(0.007, 0.014, length(vec2(tx, ry)))).mul(on3);
        const tail3 = oneMinus(smoothstep(0.0015, 0.005, abs(tx))).mul(smoothstep(float(0.65).sub(spd.mul(0.4)), 0.8, s3)).mul(step(s3, 0.8)).mul(on3).mul(0.5);
        const off = dv1.div(asp).div(9.0).mul(m1).mul(2.2)
          .add(vec2(dvh.x.div(aspectU.mul(14.0)), dvh.y.div(14.0)).mul(m2).mul(2.0))
          .add(vec2(fx2.div(aspectU.mul(14.0)), 0.0).mul(trail).mul(1.5))
          .add(et.mul(tx).add(er.mul(ry)).div(asp).mul(m3).mul(2.4))
          .add(et.mul(tx).div(asp).mul(tail3).mul(1.6));
        uvS = clamp(uvv.sub(off), vec2(0.001), vec2(0.999));
        dropM = max(max(max(m1, m2), trail), max(m3, tail3));
      }
      // ---- Heat haze: shimmering exhaust refraction behind player AND nearest rival pods (pure UV offset, 0 extra taps, 0 branches!) ----
      if (lensOn) {
        const asp2 = vec2(aspectU, 1.0);
        const fall = (hp: N) => { const dd = uvv.sub(hp.xy).mul(asp2).mul(hp.z); return exp(dot(dd, dd).negate()).mul(hp.w); };
        const amt = clamp(fall(heatP[0]).add(fall(heatP[1])).add(fall(heatP[2])).add(fall(heatP[3])).add(fall(heatP[4])).add(fall(heatP[5])), 0.0, 1.35).mul(heatS);
        const wob = vec2(sin(uvv.y.mul(240.0).add(u.time.mul(31.0))).add(sin(uvv.y.mul(97.0).sub(u.time.mul(17.0)))), sin(uvv.x.mul(210.0).sub(u.time.mul(26.0))));
        uvS = clamp(uvS.add(wob.mul(amt).mul(0.00068)), vec2(0.001), vec2(0.999)); // crisp subtle distortion, never smears sightline
      }
      const base = vec3(src.sample(uvS).level(0).rgb).toVar();
      if (motion) {
        const bs = u.speed.mul(smoothstep(0.2, 0.65, r)).mul(0.028);
        If(bs.greaterThan(0.0015), () => {
          const acc = vec3(base).toVar();
          Loop(4, ({ i }: { i: N }) => {
            const f = float(i).add(1.0).mul(0.25);
            acc.addAssign(src.sample(clamp(c.mul(oneMinus(bs.mul(f))).add(0.5), vec2(0.001), vec2(0.999))).level(0).rgb);
          });
          base.assign(acc.mul(0.2));
        });
      }
      let g: N = base;
      if (cineOn) {
        const ca = u.speed.mul(0.003).add(u.damage.mul(0.005)).mul(smoothstep(0.22, 0.78, r));
        const caCol = vec3(base).toVar();
        If(ca.greaterThan(0.0005), () => {
          const uvR = clamp(uvv.sub(c.mul(ca).mul(1.6)), vec2(0.001), vec2(0.999));
          const uvB = clamp(uvv.add(c.mul(ca).mul(1.6)), vec2(0.001), vec2(0.999));
          caCol.assign(vec3(mix(base.r, src.sample(uvR).level(0).r, 0.7), base.g, mix(base.b, src.sample(uvB).level(0).b, 0.7)));
        });
        g = caCol;
        const l = luminance(g);
        g = mix(g, g.mul(vec3(0.93, 1.0, 1.07)), ssInv(0.4, 0.0, l).mul(0.3));
        g = mix(g, g.mul(vec3(1.05, 1.0, 0.93)), smoothstep(0.4, 1.2, l).mul(0.26));
        g = g.add(vec3(0.55, 0.82, 1.0).mul(u.boost).mul(smoothstep(0.34, 0.8, r)).mul(0.2));
        g = mix(g, vec3(l).mul(vec3(1.38, 0.4, 0.3)), u.damage.mul(smoothstep(0.25, 0.8, r)).mul(0.48));
      }
      if (hasRays) {
        const toSun = sunPosU.sub(uvv);
        const fall = ssInv(0.68, 0.0, length(toSun)).mul(sunIntU);
        If(fall.greaterThan(0.008), () => {
          const dSz = vec2(textureSize(textureLoad(depthTex!)));
          const maxPx = ivec2(dSz.sub(vec2(1.0)));
          const stepUv = toSun.div(14.0);
          const cur = vec2(uvv.add(stepUv.mul(interleavedGradientNoise(screenCoordinate)))).toVar();
          const occSum = float(0.0).toVar(); const w = float(1.0).toVar();
          Loop(14, () => {
            cur.addAssign(stepUv);
            const inScr = step(0.0, cur.x).mul(step(cur.x, 1.0)).mul(step(0.0, cur.y)).mul(step(cur.y, 1.0));
            const px = clamp(ivec2(cur.mul(dSz)), ivec2(0), maxPx);
            const skyHit = step(0.99995, float(textureLoad(depthTex!, px))).mul(inScr);
            const sunCore = ssInv(0.16, 0.0, length(cur.sub(sunPosU)));
            occSum.addAssign(skyHit.mul(sunCore).mul(w));
            w.mulAssign(0.93);
          });
          g.addAssign(sunColU.mul(occSum.div(14.0)).mul(fall).mul(1.3));
        });
      }
      // ---- Sun glare + lens flare: soft veil, core glow, anamorphic streak and 4 ghosts on the sun→centre axis.
      // Sun visibility = 9 depth taps at the sun's pixel (identical for every fragment → uniform control flow). Peak add < 0.85, no overexposure.
      if (flareOn && depthTex && sunPosU) {
        const dSz = vec2(textureSize(textureLoad(depthTex)));
        const maxPx = ivec2(dSz.sub(vec2(1.0)));
        let vis: N = float(0.0);
        const taps: [number, number][] = [[0, 0], [0.009, 0], [-0.009, 0], [0, 0.016], [0, -0.016], [0.006, 0.011], [-0.006, 0.011], [0.006, -0.011], [-0.006, -0.011]];
        for (const [ox, oy] of taps) {
          const q = sunPosU.add(vec2(ox, oy));
          const inScr = step(0.0, q.x).mul(step(q.x, 1.0)).mul(step(0.0, q.y)).mul(step(q.y, 1.0));
          vis = vis.add(step(0.99995, float(textureLoad(depthTex, clamp(ivec2(q.mul(dSz)), ivec2(0), maxPx)))).mul(inScr));
        }
        const I = flareU.mul(vis.div(taps.length));
        const asp = vec2(aspectU, 1.0);
        const dS = uvv.sub(sunPosU).mul(asp); const dl = length(dS);
        let fl: N = sunColU.mul(exp(dl.mul(-3.4)).mul(0.2).add(exp(dl.mul(-24.0)).mul(0.42)));
        fl = fl.add(vec3(0.55, 0.75, 1.0).mul(exp(abs(dS.y).mul(-110.0)).mul(exp(abs(dS.x).mul(-2.6))).mul(0.2)));
        const axis = vec2(0.5).sub(sunPosU);
        const ghosts: [number, number, number, number, number, number][] = [[0.45, 0.035, 1.0, 0.7, 0.4, 0.07], [0.9, 0.06, 0.5, 0.9, 0.6, 0.05], [1.35, 0.022, 0.6, 0.7, 1.0, 0.08], [1.8, 0.1, 0.9, 0.6, 1.0, 0.035]];
        for (const [k, gr, cr, cg, cb, ga] of ghosts) {
          const gd = length(uvv.sub(sunPosU.add(axis.mul(k))).mul(asp));
          fl = fl.add(vec3(cr, cg, cb).mul(oneMinus(smoothstep(gr * 0.72, gr, gd))).mul(smoothstep(0.0, gr, gd).mul(0.7).add(0.3)).mul(ga));
        }
        g = g.add(fl.mul(I));
      }
      if (dropM) g = g.mul(mix(vec3(1.0, 1.0, 1.0), vec3(rainTintU).mul(1.1), dropM)); // a drop is 10 % brighter – and takes the colour of the rain
      g = g.mul(oneMinus(pow(r.mul(1.2), 2.6).mul(vignette * 0.7)));
      return vec4(max(min(g.add(vec3(1.0, 0.9, 0.8).mul(u.flash)), vec3(12.0)), vec3(0.0)), 1.0);
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

  /** Pre-compile HalfFloat scenePass + shadow + all PostFX passes & flush GPU queue before race countdown.
   *  `WARM_FRAMES` frames, not one: a pass that is a node of its own (SSR, bloom, the textures between two passes) builds its inner
   *  materials again in the frame AFTER the material round it was built. With SSR + SMAA that chain is three frames long – with two
   *  warm-up frames the three SSR pipelines were created once more in the first frame of the countdown (measured on WebGPU). */
  async warmup(renderer: THREE.WebGPURenderer) {
    try { await this.scenePass?.compileAsync?.(renderer); } catch { /* ignore */ }
    await new Promise(res => setTimeout(res, 0));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bk = renderer.backend as any;
      for (let i = 0; i < WARM_FRAMES; i++) {
        this.pipeline.render();
        if (bk?.device?.queue?.onSubmittedWorkDone) await bk.device.queue.onSubmittedWorkDone();
        else if (i === 0 && bk?.gl?.finish) bk.gl.finish();
      }
    } catch { /* ignore */ }
  }

  setSize(w: number, h: number) { void w; void h; }
  render() { this.pipeline.render(); }
  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
    this.pipeline.dispose?.();
  }
}
