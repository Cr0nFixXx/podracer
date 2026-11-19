import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { cameraViewMatrix, dot, normalize, vec2, clamp, color, cos, exp, float, fract, hash, instanceIndex, instancedBufferAttribute, length, max: tslMax, min: tslMin, mix, oneMinus, positionView, pow, sin, smoothstep, step, uniform, uv, varying, vec3, vec4 } = TSL;

/** Soft round disc with early edge falloff (no square corners). */
const softDisc = () => pow(tslMax(oneMinus(length(uv().sub(0.5)).mul(2.0)), 0.0), 1.7);

/**
 * High-speed, clear-sightline particle pools (WebGPU + WebGL2):
 *  - Clamps projected billboard size in `sizeNode` against `-positionView.z` and zeroes vertices behind/near
 *    the camera (`vz < 1.2 m`). Eliminates full-screen 4K overdraw spikes at race start AND eliminates giant
 *    flashing inverted sprites when exhaust/dust/weather particles pass through the chase camera!
 *  - Smooth camera near-fade (`2.5..8 m`) keeps driver visibility crystal-clear when drafting a rival.
 *  - Ambient weather runs 100% on the GPU (zero CPU loop, zero buffer upload).
 */
/**
 * Session 10 – GPU-simulated pool: the CPU only writes spawn records (ring buffer, partial uploads); the vertex shader integrates
 * the closed-form trajectory `p(t) = p0 + v0·(1-e^-kt)/k - g·(t - (1-e^-kt)/k)/k` (same drag/gravity model as the old CPU loop),
 * size/colour/alpha ramps and death. No per-frame CPU loop, no per-frame full-buffer upload. Works on WebGPU and WebGL2.
 */
class Pool {
  max: number; head = 0; live = 0; time = 0;
  private dirty = 0; private dirtyStart = 0;
  aPos: THREE.InstancedBufferAttribute; aVel: THREE.InstancedBufferAttribute; aC0: THREE.InstancedBufferAttribute; aC1: THREE.InstancedBufferAttribute; aMisc: THREE.InstancedBufferAttribute;
  private attrs: THREE.InstancedBufferAttribute[];
  private uTime = uniform(0);
  sprite: THREE.Sprite; mat: THREE.PointsNodeMaterial;
  constructor(max: number, additive: boolean) {
    this.max = max;
    const mk = () => { const at = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); at.setUsage(THREE.DynamicDrawUsage); return at; };
    this.aPos = mk(); this.aVel = mk(); this.aC0 = mk(); this.aC1 = mk(); this.aMisc = mk(); // (p0,t0) (v0,life) (c0,alpha) (c1,drag) (s0,s1,grav,-)
    this.attrs = [this.aPos, this.aVel, this.aC0, this.aC1, this.aMisc];
    const mat = new THREE.PointsNodeMaterial({
      transparent: true, depthWrite: false, alphaTest: 0.012,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    const A = instancedBufferAttribute(this.aPos), B = instancedBufferAttribute(this.aVel), C0 = instancedBufferAttribute(this.aC0), C1 = instancedBufferAttribute(this.aC1), M = instancedBufferAttribute(this.aMisc);
    const age = this.uTime.sub(A.w), life = tslMax(B.w, float(1e-4)), t = clamp(age.div(life), 0.0, 1.0);
    const alive = step(float(0.0), age).mul(step(age, B.w.sub(1e-5)));
    const k = tslMax(C1.w, float(0.02)), f1 = oneMinus(exp(k.negate().mul(age))).div(k);
    mat.positionNode = A.xyz.add(B.xyz.mul(f1)).sub(vec3(0, 1, 0).mul(M.z.mul(age.sub(f1)).div(k)));
    // Strict camera-plane guard: zero size behind/at camera, max ~16% viewport height when close -> 0 overdraw lag!
    const vz = positionView.z.negate();
    const rawSz = mix(M.x, M.y, t).mul(1.45).mul(alive);
    const maxWorldSz = tslMax(vz.sub(1.1), float(0.0)).mul(additive ? 0.16 : 0.14);
    mat.sizeNode = tslMin(rawSz, maxWorldSz).mul(step(float(1.2), vz));
    const nearFade = smoothstep(additive ? 2.0 : 4.5, additive ? 6.0 : 12.0, vz);
    const c = varying(vec4(mix(C0.xyz, C1.xyz, t), C0.w.mul(tslMin(t.mul(8.0), float(1.0))).mul(oneMinus(t)).mul(alive)));
    mat.colorNode = c.xyz;
    mat.opacityNode = c.w.mul(softDisc()).mul(nearFade);
    this.mat = mat;
    this.sprite = new THREE.Sprite(mat); this.sprite.count = 0; this.sprite.frustumCulled = false;
    this.sprite.renderOrder = additive ? 5 : 4;
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, c0: THREE.Color, c1: THREE.Color, a: number, drag: number, grav: number) {
    const i4 = this.head * 4; this.head = (this.head + 1) % this.max;
    if (this.dirty === 0) this.dirtyStart = i4 / 4; if (this.dirty < this.max) this.dirty++;
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array, A0 = this.aC0.array as Float32Array, A1 = this.aC1.array as Float32Array, M = this.aMisc.array as Float32Array;
    P[i4] = p.x; P[i4 + 1] = p.y; P[i4 + 2] = p.z; P[i4 + 3] = this.time;
    V[i4] = v.x; V[i4 + 1] = v.y; V[i4 + 2] = v.z; V[i4 + 3] = life;
    A0[i4] = c0.r; A0[i4 + 1] = c0.g; A0[i4 + 2] = c0.b; A0[i4 + 3] = a;
    A1[i4] = c1.r; A1[i4 + 1] = c1.g; A1[i4 + 2] = c1.b; A1[i4 + 3] = drag;
    M[i4] = s0; M[i4 + 1] = s1; M[i4 + 2] = grav;
  }
  update(dt: number) {
    this.time += dt; this.uTime.value = this.time;
    if (this.dirty > 0) {
      const n = this.dirty, st = this.dirtyStart, wrap = st + n > this.max;
      for (const at of this.attrs) {
        at.clearUpdateRanges();
        if (n >= this.max) at.addUpdateRange(0, this.max * 4);
        else if (wrap) { at.addUpdateRange(st * 4, (this.max - st) * 4); at.addUpdateRange(0, (st + n - this.max) * 4); }
        else at.addUpdateRange(st * 4, n * 4);
        at.needsUpdate = true;
      }
      this.live = Math.min(this.max, wrap ? this.max : Math.max(this.live, st + n));
      this.dirty = 0;
    }
    this.sprite.count = this.live;
  }
  clear() {
    (this.aVel.array as Float32Array).fill(0); this.aVel.clearUpdateRanges(); this.aVel.needsUpdate = true;
    this.head = 0; this.live = 0; this.dirty = 0; this.sprite.count = 0;
  }
  dispose() { this.mat.dispose(); }
}

const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const C_EXH1 = new THREE.Color(0.55, 0.14, 0.05);
const C_SPARK0 = new THREE.Color(2.2, 1.6, 0.7), C_SPARK1 = new THREE.Color(1.3, 0.35, 0.05);
const C_SMK_DK = new THREE.Color(0.12, 0.11, 0.1), C_SMK_LT = new THREE.Color(0.42, 0.42, 0.42);
const C_FIRE0 = new THREE.Color(2.0, 0.95, 0.28), C_FIRE1 = new THREE.Color(0.75, 0.15, 0.03);
const C_VSMK0 = new THREE.Color(0.14, 0.12, 0.12), C_VSMK1 = new THREE.Color(0.26, 0.23, 0.23);
const C_VSTM0 = new THREE.Color(0.88, 0.9, 0.94), C_VSTM1 = new THREE.Color(0.78, 0.84, 0.88);
const C_VEMB0 = new THREE.Color(2.0, 0.82, 0.2), C_VEMB1 = new THREE.Color(0.75, 0.1, 0.02);
const C_VSPK0 = new THREE.Color(1.4, 1.0, 1.9), C_VSPK1 = new THREE.Color(0.6, 0.3, 1.1);
const C_EXP0 = new THREE.Color(2.4, 1.35, 0.45), C_EXP1 = new THREE.Color(0.95, 0.15, 0.03);
const C_EXPS0 = new THREE.Color(0.16, 0.14, 0.13), C_EXPS1 = new THREE.Color(0.32, 0.32, 0.32);
const UP_V = new THREE.Vector3(0, 1, 0), ZERO_V = new THREE.Vector3();
const C_SPRAY = new THREE.Color(0.74, 0.8, 0.86), C_SPLASH = new THREE.Color(0.86, 0.9, 0.95), C_AB0 = new THREE.Color(2.2, 2.3, 2.6);

export class Particles {
  add: Pool; alpha: Pool; amount: number; rateScale = 1;
  ambient: THREE.Sprite | null = null;
  private ambCam = uniform(new THREE.Vector3());
  private ambTime = uniform(0);
  private ambFade = uniform(1); // 0 under roofs (tunnels, covered shortcuts)
  private ambVel = uniform(new THREE.Vector3()); private prevCam = new THREE.Vector3(); private camSet = false; private ambN = 1;
  group = new THREE.Group();
  constructor(amount: number) {
    this.amount = amount;
    this.add = new Pool(Math.min(3200, Math.floor(2400 * amount) + 300), true);
    this.alpha = new Pool(Math.min(2200, Math.floor(1600 * amount) + 300), false);
    this.group.add(this.alpha.sprite, this.add.sprite);
  }
  setScale(h: number) { void h; }
  setFrameDt(dt: number) { this.rateScale = Math.min(1.5, dt * 60); }
  chance(n: number) { return Math.random() < n * this.amount * this.rateScale; }

  /** Prime both dynamic sprite pools with 1 off-screen particle so warmup() compiles their GPU pipelines. */
  seedWarmup(cam: THREE.Vector3) {
    _p.set(cam.x, cam.y - 200, cam.z); _v.set(0, 0, 0);
    this.add.spawn(_p, _v, 0.5, 0.05, 0.05, WHITE, WHITE, 0.01, 0, 0);
    this.alpha.spawn(_p, _v, 0.5, 0.05, 0.05, WHITE, WHITE, 0.01, 0, 0);
    this.add.update(0.001); this.alpha.update(0.001);
  }

  /** 0..1 share of the ambient weather particles that is drawn (rain getting heavier, snow easing off …). */
  setAmbientAmount(f: number) { if (this.ambient) this.ambient.count = Math.max(1, Math.round(this.ambN * Math.max(0, Math.min(1, f)))); }

  setAmbientFade(f: number) { this.ambFade.value = f; }
  /** Shattered obstacle: dust burst + sparks (the solid chunks come from DebrisPool). */
  debris(p: THREE.Vector3, vel: THREE.Vector3, col: THREE.Color) { this.dust(p, vel, col, 10); this.sparks(p, UP_V, vel, 10); }
  /** Session 15 – dust trail dragged behind a pod: low, widening puffs; denser, longer and larger with speed. */
  trail(p: THREE.Vector3, vel: THREE.Vector3, col: THREE.Color, speed: number, alpha: number) {
    const want = Math.min(1.6, 0.25 + speed * 0.009) * this.amount * this.rateScale;
    const n = Math.floor(want) + (Math.random() < (want % 1) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      _v.set((Math.random() - 0.5) * 5, 0.5 + Math.random() * 1.7, (Math.random() - 0.5) * 5).addScaledVector(vel, 0.2);
      _p.set(p.x + (Math.random() - 0.5) * 1.6, p.y, p.z + (Math.random() - 0.5) * 1.6);
      this.alpha.spawn(_p, _v, 1.0 + Math.random() * 0.9, 0.9, 3.6 + speed * 0.03 + Math.random() * 2.2, col, col, alpha, 1.25, -0.5);
    }
  }

  /** Rooster tail of fine spray thrown up from a wet road – taller and denser with speed. */
  spray(p: THREE.Vector3, vel: THREE.Vector3, speed: number, alphaScale = 1) {
    const want = Math.min(3, 0.5 + speed * 0.013) * this.amount * this.rateScale;
    const n = Math.floor(want) + (Math.random() < (want % 1) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      _v.set((Math.random() - 0.5) * 7, 1.6 + Math.random() * 3 + speed * 0.022, (Math.random() - 0.5) * 7).addScaledVector(vel, 0.32);
      _p.set(p.x + (Math.random() - 0.5) * 3.2, p.y, p.z + (Math.random() - 0.5) * 3.2);
      this.alpha.spawn(_p, _v, 0.55 + Math.random() * 0.5, 0.9, 3.6 + speed * 0.028 + Math.random() * 2.5, C_SPRAY, C_SPRAY, 0.115 * alphaScale, 1.5, 5);
    }
  }
  /** Tiny short-lived splash crown where a rain drop hits the road. */
  splash(p: THREE.Vector3) { _v.set(0, 1.3, 0); this.alpha.spawn(p, _v, 0.13 + Math.random() * 0.09, 0.06, 0.46, C_SPLASH, C_SPLASH, 0.36, 0.5, 6); }

  /** Clean plasma exhaust sparks (no blinding grey smoke behind healthy pods!). */
  exhaust(p: THREE.Vector3, back: THREE.Vector3, baseVel: THREE.Vector3, col: THREE.Color, power: number, boost: number, scale = 1) {
    const want = (0.55 + boost * 1.25) * this.amount * this.rateScale * scale;
    const n = Math.floor(want) + (Math.random() < (want % 1) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      _p.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _v.copy(back).multiplyScalar(18 + power * 26 + Math.random() * 8).add(baseVel).addScaledVector(_p, 3.2);
      this.add.spawn(p, _v, 0.08 + Math.random() * 0.07 + boost * 0.05, 0.45 + boost * 0.38, 0.1, col, C_EXH1, 0.36, 2.2, 0);
    }
    // afterburner: a white-hot core jet while boosting
    if (boost > 0 && Math.random() < 0.7 * this.rateScale * scale) {
      _v.copy(back).multiplyScalar(62 + Math.random() * 16).add(baseVel);
      this.add.spawn(p, _v, 0.13 + Math.random() * 0.05, 0.62, 0.14, C_AB0, col, 0.5, 1.2, 0);
    }
  }

  /** Ground-hugging repulsor dust wisp (stays low below eye-line & translucent so leaders never blind followers!). */
  dust(p: THREE.Vector3, vel: THREE.Vector3, col: THREE.Color, n = 1, alphaScale = 1) {
    const isImpact = n >= 6;
    for (let i = 0; i < n; i++) {
      if (!isImpact && !this.chance(0.32 * alphaScale)) continue;
      const spread = isImpact ? 10 : 7;
      const lift = isImpact ? Math.random() * 3.5 : 0.15 + Math.random() * 0.7; // stays hugging the road surface!
      _v.set((Math.random() - 0.5) * spread, lift, (Math.random() - 0.5) * spread).addScaledVector(vel, 0.2);
      _p.set(p.x + (Math.random() - 0.5) * 2.6, p.y, p.z + (Math.random() - 0.5) * 2.6);
      const s1 = isImpact ? 5.5 + Math.random() * 3.5 : 2.1 + Math.random() * 1.1;
      const op = (isImpact ? 0.18 : 0.075) * alphaScale;
      this.alpha.spawn(_p, _v, 0.65 + Math.random() * 0.45, 0.7, s1, col, col, op, 1.6, 0.2);
    }
  }

  sparks(p: THREE.Vector3, normal: THREE.Vector3, vel: THREE.Vector3, n = 16) {
    n = Math.min(48, Math.ceil(n * this.amount));
    for (let i = 0; i < n; i++) {
      _p.set((Math.random() - 0.5) * 18, Math.random() * 14, (Math.random() - 0.5) * 18);
      _v.copy(normal).multiplyScalar(8 + Math.random() * 18).addScaledVector(vel, 0.6).add(_p);
      this.add.spawn(p, _v, 0.25 + Math.random() * 0.35, 0.42, 0.08, C_SPARK0, C_SPARK1, 0.9, 1.1, 25);
    }
  }

  /** Subtle damaged-turbine smoke trail (readable damage feedback without blocking vision behind a rival). */
  smoke(p: THREE.Vector3, vel: THREE.Vector3, dark: number, alphaScale = 1) {
    if (!this.chance(0.24 * alphaScale)) return;
    _v.set((Math.random() - 0.5) * 1.8, 2.2 + Math.random() * 1.6, (Math.random() - 0.5) * 1.8).addScaledVector(vel, 0.28);
    _c.copy(C_SMK_DK).lerp(C_SMK_LT, 1 - dark);
    this.alpha.spawn(p, _v, 0.9 + Math.random() * 0.5, 0.65, 2.8, _c, _c, 0.16 * alphaScale, 1.2, -1.5);
  }

  fire(p: THREE.Vector3, vel: THREE.Vector3, alphaScale = 1) {
    if (!this.chance(0.45 * alphaScale)) return;
    _v.set((Math.random() - 0.5) * 2.5, 1.8 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5).addScaledVector(vel, 0.45);
    this.add.spawn(p, _v, 0.26 + Math.random() * 0.2, 1.3, 0.35, C_FIRE0, C_FIRE1, 0.62 * alphaScale, 1.2, -2.5);
  }

  shimmer(p: THREE.Vector3, n: THREE.Vector3, col: THREE.Color) {
    const k = Math.min(16, Math.ceil(9 * this.amount));
    for (let i = 0; i < k; i++) {
      _v.set((Math.random() - 0.5) * 7, (Math.random() - 0.2) * 6, (Math.random() - 0.5) * 7).addScaledVector(n, 2.5);
      _p.set(p.x + (Math.random() - 0.5) * 2.2, p.y + (Math.random() - 0.3) * 2.2, p.z + (Math.random() - 0.5) * 2.2);
      this.add.spawn(_p, _v, 0.25 + Math.random() * 0.22, 0.7, 0.1, col, col, 0.72, 2.5, 0);
    }
  }

  vent(p: THREE.Vector3, type: string) {
    if (!this.chance(type === 'sparkle' ? 0.15 : 0.16)) return;
    _p.set(p.x + (Math.random() - 0.5) * 3, p.y, p.z + (Math.random() - 0.5) * 3);
    if (type === 'smoke') { _v.set((Math.random() - 0.5) * 2, 6 + Math.random() * 4, (Math.random() - 0.5) * 2); this.alpha.spawn(_p, _v, 4.0 + Math.random() * 2.0, 4.5, 20, C_VSMK0, C_VSMK1, 0.28, 0.3, -0.5); }
    else if (type === 'steam') { _v.set((Math.random() - 0.5) * 1.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 1.5); this.alpha.spawn(_p, _v, 3.2 + Math.random() * 1.6, 2.5, 13, C_VSTM0, C_VSTM1, 0.16, 0.4, -0.3); }
    else if (type === 'embers') { _v.set((Math.random() - 0.5) * 4, 8 + Math.random() * 10, (Math.random() - 0.5) * 4); this.add.spawn(_p, _v, 1.6 + Math.random() * 1.5, 0.48, 0.18, C_VEMB0, C_VEMB1, 0.85, 0.5, 4); }
    else { _v.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3); _p.set(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6); this.add.spawn(_p, _v, 1.3, 0.42, 0.1, C_VSPK0, C_VSPK1, 0.8, 1, 0); }
  }

  explosion(p: THREE.Vector3) {
    const n = Math.min(120, Math.ceil(95 * this.amount));
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(10 + Math.random() * 28);
      this.add.spawn(p, _v, 0.42 + Math.random() * 0.6, 2.2 + Math.random() * 2.2, 0.8, C_EXP0, C_EXP1, 0.9, 2.5, 3);
    }
    for (let i = 0; i < n >> 1; i++) {
      _v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 11);
      this.alpha.spawn(p, _v, 1.3 + Math.random() * 1.1, 2.6, 9, C_EXPS0, C_EXPS1, 0.38, 1.5, -1);
    }
    this.sparks(p, UP_V, ZERO_V, 36);
  }

  /** `wind` (0..1) slants rain/snow/dust and speeds them up, `dense` scales the count (storms, gusts). */
  initAmbient(type: string, wind = 0, dense = 1) {
    const n = Math.max(1, Math.min(2000, Math.floor(900 * this.amount * dense)));
    const colors: Record<string, string> = { dust: '#e8c8a0', snow: '#ffffff', embers: '#ff7020', spores: '#d8ff9a', rain: '#cfdcee', sparkle: '#e0b0ff' };
    const vel: Record<string, [number, number, number]> = { dust: [8 + wind * 26, 0.5, 3 + wind * 10], snow: [2 + wind * 18, -4 - wind * 2, 1 + wind * 8], embers: [1 + wind * 6, 3, 0.5], spores: [0.5 + wind * 3, 0.4, 0.3], rain: [1 + wind * 16, -40, 0.5 + wind * 7], sparkle: [0.3, 0.6, 0.2] };
    const add = type === 'embers' || type === 'sparkle' || type === 'spores';
    const v = vel[type] ?? [2, -2, 1];
    // Rain needs density near the camera (thin streaks vanish beyond ~40 m) → smaller wrap volume; wind-driven snow likewise
    const id = instanceIndex; const span = float(type === 'rain' ? 64.0 : type === 'snow' && wind > 0.3 ? 96.0 : 150.0);
    const seedPos = vec3(hash(id), hash(id.add(1999)), hash(id.add(4099))).mul(span);
    const ph = hash(id.add(7919)).mul(6.2832);
    const t = this.ambTime;
    const drift = vec3(t.mul(v[0]).add(sin(t.add(ph)).mul(0.6)), t.mul(v[1]), t.mul(v[2]).add(cos(t.mul(0.7).add(ph)).mul(0.6)));
    const wrapped = fract(seedPos.add(drift).sub(this.ambCam).div(span).add(0.5)).sub(0.5).mul(span).add(this.ambCam);
    const vz = positionView.z.negate();
    const rain = type === 'rain';
    const baseSz = rain ? 1.2 : type === 'dust' ? 0.24 : type === 'snow' ? 0.2 + wind * 0.08 : 0.2;
    const mat = new THREE.PointsNodeMaterial({
      transparent: true, depthWrite: false, alphaTest: 0.02,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    mat.positionNode = wrapped;
    // Never expand into giant screen-filling quads when ambient particles cross camera.position!
    mat.sizeNode = tslMin(float(baseSz), tslMax(vz.sub(2.0), float(0.0)).mul(rain ? 0.1 : 0.05)).mul(step(float(2.2), vz));
    mat.colorNode = color(new THREE.Color(colors[type]).multiplyScalar(add ? 1.3 : 1));
    if (rain) {
      // Session 13: each drop is motion-blurred along its SCREEN-SPACE velocity relative to the camera (rain velocity − pod velocity):
      // standing → near-vertical wind-slanted lines; fast → long streaks rushing past the edges, short dots straight ahead.
      const vRel = vec3(v[0], v[1], v[2]).sub(this.ambVel);
      const pV = cameraViewMatrix.mul(vec4(wrapped, 1.0)).xyz, vV = cameraViewMatrix.mul(vec4(vRel, 0.0)).xyz;
      const sdir = pV.xy.mul(vV.z).sub(vV.xy.mul(pV.z));                 // d/dt of the projected position (up to a positive factor)
      const rHat = normalize(pV), vPerp = vV.sub(rHat.mul(dot(vV, rHat)));
      const lenW = clamp(length(vPerp).mul(0.021), 0.35, 3.4);            // streak length in metres (≈ 21 ms exposure)
      const dirV = varying(normalize(sdir.add(vec2(1e-4, 0.0)))), lenV = varying(lenW);
      mat.sizeNode = tslMin(lenW.mul(1.1), tslMax(vz.sub(2.0), float(0.0)).mul(0.14)).mul(step(float(2.2), vz));
      const q = uv().sub(0.5), along = dot(q, dirV), across = dot(q, vec2(dirV.y.negate(), dirV.x));
      const wUv = float(0.034).div(lenV.mul(1.1));
      const streak = oneMinus(smoothstep(wUv.mul(0.45), wUv, across.abs())).mul(oneMinus(smoothstep(0.3, 0.46, along.abs())));
      mat.opacityNode = streak.mul(0.6).mul(smoothstep(2.5, 7.0, vz)).mul(this.ambFade);
    } else mat.opacityNode = softDisc().mul(type === 'dust' ? 0.2 : 0.72).mul(smoothstep(2.5, 7.0, vz)).mul(this.ambFade);
    const sp = new THREE.Sprite(mat); sp.count = n; sp.frustumCulled = false;
    this.ambient = sp; this.ambN = n;
    this.group.add(sp);
  }

  update(dt: number, cam: THREE.Vector3, t: number) {
    this.add.update(dt); this.alpha.update(dt);
    if (dt > 1e-4) { // smoothed camera velocity → rain streak direction/length
      if (this.camSet) { _v.copy(cam).sub(this.prevCam).divideScalar(dt); if (_v.lengthSq() < 300 * 300) this.ambVel.value.lerp(_v, Math.min(1, dt * 8)); }
      this.prevCam.copy(cam); this.camSet = true;
    }
    this.ambCam.value.copy(cam);
    this.ambTime.value = t;
  }
  clear() { this.add.clear(); this.alpha.clear(); }
  dispose() { this.add.dispose(); this.alpha.dispose(); (this.ambient?.material as THREE.Material | undefined)?.dispose(); }
}
export { WHITE };
