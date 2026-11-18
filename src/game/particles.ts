import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { color, cos, float, fract, hash, instanceIndex, instancedBufferAttribute, length, max: tslMax, min: tslMin, oneMinus, positionView, pow, sin, smoothstep, step, uniform, uv, vec3 } = TSL;

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
class Pool {
  max: number; count = 0;
  pos: Float32Array; vel: Float32Array; life: Float32Array; maxLife: Float32Array;
  s0: Float32Array; s1: Float32Array; c0: Float32Array; c1: Float32Array; a0: Float32Array; drag: Float32Array; grav: Float32Array;
  posAttr: THREE.InstancedBufferAttribute; sizeAttr: THREE.InstancedBufferAttribute; colAttr: THREE.InstancedBufferAttribute;
  sprite: THREE.Sprite; mat: THREE.PointsNodeMaterial;
  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.posAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.colAttr.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.PointsNodeMaterial({
      transparent: true, depthWrite: false, alphaTest: 0.012,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    mat.positionNode = instancedBufferAttribute(this.posAttr);
    // Strict camera-plane guard: zero size behind/at camera, max ~16% viewport height when close -> 0 overdraw lag!
    const vz = positionView.z.negate();
    const rawSz = instancedBufferAttribute(this.sizeAttr).mul(1.45);
    const maxWorldSz = tslMax(vz.sub(1.1), float(0.0)).mul(additive ? 0.16 : 0.14);
    mat.sizeNode = tslMin(rawSz, maxWorldSz).mul(step(float(1.2), vz));
    const nearFade = smoothstep(additive ? 2.0 : 4.5, additive ? 6.0 : 12.0, vz);
    const c = instancedBufferAttribute(this.colAttr);
    mat.colorNode = c.xyz;
    mat.opacityNode = c.w.mul(softDisc()).mul(nearFade);
    this.mat = mat;
    this.sprite = new THREE.Sprite(mat); this.sprite.count = 0; this.sprite.frustumCulled = false;
    this.sprite.renderOrder = additive ? 5 : 4;
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, c0: THREE.Color, c1: THREE.Color, a: number, drag: number, grav: number) {
    if (this.count >= this.max) return;
    const i = this.count++, i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = c0.r; this.c0[i3 + 1] = c0.g; this.c0[i3 + 2] = c0.b;
    this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
    this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }
  kill(i: number) {
    const j = --this.count; if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    this.pos[i3] = this.pos[j3]; this.pos[i3 + 1] = this.pos[j3 + 1]; this.pos[i3 + 2] = this.pos[j3 + 2];
    this.vel[i3] = this.vel[j3]; this.vel[i3 + 1] = this.vel[j3 + 1]; this.vel[i3 + 2] = this.vel[j3 + 2];
    this.c0[i3] = this.c0[j3]; this.c0[i3 + 1] = this.c0[j3 + 1]; this.c0[i3 + 2] = this.c0[j3 + 2];
    this.c1[i3] = this.c1[j3]; this.c1[i3 + 1] = this.c1[j3 + 1]; this.c1[i3 + 2] = this.c1[j3 + 2];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
  update(dt: number) {
    const P = this.posAttr.array as Float32Array, S = this.sizeAttr.array as Float32Array, C = this.colAttr.array as Float32Array;
    for (let i = this.count - 1; i >= 0; i--) {
      const nl = this.life[i] + dt;
      if (nl >= this.maxLife[i]) { this.kill(i); continue; }
      this.life[i] = nl;
      const d = 1 / (1 + this.drag[i] * dt);
      const i3 = i * 3;
      const vx = this.vel[i3] * d, vy = this.vel[i3 + 1] * d - this.grav[i] * dt, vz = this.vel[i3 + 2] * d;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt; this.pos[i3 + 1] += vy * dt; this.pos[i3 + 2] += vz * dt;
    }
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.maxLife[i]; const i3 = i * 3, i4 = i * 4;
      P[i3] = this.pos[i3]; P[i3 + 1] = this.pos[i3 + 1]; P[i3 + 2] = this.pos[i3 + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      C[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      C[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      C[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      C[i4 + 3] = this.a0[i] * Math.min(1, t * 8) * (1 - t);
    }
    this.sprite.count = n;
    if (n > 0) {
      this.posAttr.clearUpdateRanges(); this.posAttr.addUpdateRange(0, n * 3); this.posAttr.needsUpdate = true;
      this.sizeAttr.clearUpdateRanges(); this.sizeAttr.addUpdateRange(0, n); this.sizeAttr.needsUpdate = true;
      this.colAttr.clearUpdateRanges(); this.colAttr.addUpdateRange(0, n * 4); this.colAttr.needsUpdate = true;
    }
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

export class Particles {
  add: Pool; alpha: Pool; amount: number; rateScale = 1;
  ambient: THREE.Sprite | null = null;
  private ambCam = uniform(new THREE.Vector3());
  private ambTime = uniform(0);
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

  /** Clean plasma exhaust sparks (no blinding grey smoke behind healthy pods!). */
  exhaust(p: THREE.Vector3, back: THREE.Vector3, baseVel: THREE.Vector3, col: THREE.Color, power: number, boost: number, scale = 1) {
    const want = (0.55 + boost * 1.25) * this.amount * this.rateScale * scale;
    const n = Math.floor(want) + (Math.random() < (want % 1) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      _p.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _v.copy(back).multiplyScalar(18 + power * 26 + Math.random() * 8).add(baseVel).addScaledVector(_p, 3.2);
      this.add.spawn(p, _v, 0.08 + Math.random() * 0.07 + boost * 0.05, 0.45 + boost * 0.38, 0.1, col, C_EXH1, 0.36, 2.2, 0);
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

  initAmbient(type: string) {
    const n = Math.max(1, Math.min(1100, Math.floor(900 * this.amount)));
    const colors: Record<string, string> = { dust: '#e8c8a0', snow: '#ffffff', embers: '#ff7020', spores: '#d8ff9a', rain: '#a0b0d0', sparkle: '#e0b0ff' };
    const vel: Record<string, [number, number, number]> = { dust: [8, 0.5, 3], snow: [2, -4, 1], embers: [1, 3, 0.5], spores: [0.5, 0.4, 0.3], rain: [1, -40, 0.5], sparkle: [0.3, 0.6, 0.2] };
    const add = type === 'embers' || type === 'sparkle' || type === 'spores';
    const v = vel[type] ?? [2, -2, 1];
    const id = instanceIndex; const span = float(150.0);
    const seedPos = vec3(hash(id), hash(id.add(1999)), hash(id.add(4099))).mul(span);
    const ph = hash(id.add(7919)).mul(6.2832);
    const t = this.ambTime;
    const drift = vec3(t.mul(v[0]).add(sin(t.add(ph)).mul(0.6)), t.mul(v[1]), t.mul(v[2]).add(cos(t.mul(0.7).add(ph)).mul(0.6)));
    const wrapped = fract(seedPos.add(drift).sub(this.ambCam).div(span).add(0.5)).sub(0.5).mul(span).add(this.ambCam);
    const vz = positionView.z.negate();
    const baseSz = type === 'rain' ? 0.11 : type === 'dust' ? 0.24 : 0.2;
    const mat = new THREE.PointsNodeMaterial({
      transparent: true, depthWrite: false, alphaTest: 0.02,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    mat.positionNode = wrapped;
    // Never expand into giant screen-filling quads when ambient particles cross camera.position!
    mat.sizeNode = tslMin(float(baseSz), tslMax(vz.sub(2.0), float(0.0)).mul(0.05)).mul(step(float(2.2), vz));
    mat.colorNode = color(new THREE.Color(colors[type]).multiplyScalar(add ? 1.3 : 1));
    mat.opacityNode = softDisc().mul(type === 'dust' ? 0.2 : 0.72).mul(smoothstep(2.5, 7.0, vz));
    const sp = new THREE.Sprite(mat); sp.count = n; sp.frustumCulled = false;
    this.ambient = sp;
    this.group.add(sp);
  }

  update(dt: number, cam: THREE.Vector3, t: number) {
    this.add.update(dt); this.alpha.update(dt);
    this.ambCam.value.copy(cam);
    this.ambTime.value = t;
  }
  clear() { this.add.count = 0; this.alpha.count = 0; this.add.sprite.count = 0; this.alpha.sprite.count = 0; }
  dispose() { this.add.dispose(); this.alpha.dispose(); (this.ambient?.material as THREE.Material | undefined)?.dispose(); }
}
export { WHITE };
