import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { color, instancedBufferAttribute, length, max, min, oneMinus, pow, uniform, uv, step, exp, vec2, vec3, mix, cos, sin, float, mx_noise_float } = TSL;

/** Soft round disc (replaces the old sprite texture; identical falloff, no square edges). */
const EXH_END = new THREE.Color(0.6, 0.15, 0.05), SMK0 = new THREE.Color(0.5, 0.5, 0.5), SMK1 = new THREE.Color(0.35, 0.35, 0.35);
const MIST = new THREE.Color(0.86, 0.92, 0.95), EMB0 = new THREE.Color(2.4, 0.9, 0.2), EMB1 = new THREE.Color(0.8, 0.1, 0.02);
const softDisc = () => pow(max(oneMinus(length(uv().sub(0.5)).mul(2.0)), 0.0), 1.6);

/**
 * GPU particle pool (session 9): ring buffer of spawn records, ONE instanced sprite draw.
 * The vertex stage evaluates the closed-form motion (exponential drag + gravity), size/colour ramps and fade
 * from (spawn data, global time) – no per-frame CPU loop, no per-frame buffer upload: only newly spawned
 * slots are uploaded (dirty range). Dead / unused slots collapse to size 0 (no fragments).
 * Smoke (alpha pool): rotating noise-shaped puffs, top-lit, soft edges.
 */
class Pool {
  max: number; head = 0; time = 0;
  a0: THREE.InstancedBufferAttribute; a1: THREE.InstancedBufferAttribute; a2: THREE.InstancedBufferAttribute; a3: THREE.InstancedBufferAttribute; a4: THREE.InstancedBufferAttribute;
  dirtyLo = Infinity; dirtyHi = -1; wrapped = false;
  sprite: THREE.Sprite; mat: THREE.PointsNodeMaterial; uTime: { value: number };
  constructor(cap: number, additive: boolean) {
    this.max = cap;
    const mk = (n: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.a0 = mk(4); // p0.xyz, birth
    this.a1 = mk(4); // v0.xyz, life
    this.a2 = mk(4); // drag, grav, s0, s1
    this.a3 = mk(4); // c0.rgb, alpha
    this.a4 = mk(4); // c1.rgb, seed
    const A1 = this.a1.array as Float32Array; for (let i = 0; i < cap; i++) A1[i * 4 + 3] = -1; // never born → dead
    const uT = uniform(0); this.uTime = uT;
    const i0 = instancedBufferAttribute(this.a0), i1 = instancedBufferAttribute(this.a1), i2 = instancedBufferAttribute(this.a2), i3 = instancedBufferAttribute(this.a3), i4 = instancedBufferAttribute(this.a4);
    const t = uT.sub(i0.w).max(0.0); const life = i1.w; const u = t.div(life.max(1e-3));
    const alive = step(0.0, life).mul(step(u, 1.0));
    const k = i2.x.max(1e-3), g = i2.y; const e = oneMinus(exp(k.negate().mul(t))).div(k);
    const pos = vec3(i0.x.add(i1.x.mul(e)), i0.y.add(i1.y.add(g.div(k)).mul(e)).sub(g.mul(t).div(k)), i0.z.add(i1.z.mul(e)));
    const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    mat.positionNode = pos;
    mat.sizeNode = mix(i2.z, i2.w, u).mul(1.8).mul(alive);
    mat.colorNode = mix(i3.xyz, i4.xyz, u);
    const fade = i3.w.mul(min(u.mul(8.0), 1.0)).mul(oneMinus(u)).mul(alive);
    if (additive) mat.opacityNode = fade.mul(softDisc());
    else {
      // smoke puff: rotated uv, low-freq noise breaks the disc into billows, brighter top (sun) / darker base
      const c = uv().sub(0.5); const ang = i4.w.mul(6.283).add(t.mul(i4.w.sub(0.5)));
      const ca = cos(ang), sa = sin(ang); const r = vec2(c.x.mul(ca).sub(c.y.mul(sa)), c.x.mul(sa).add(c.y.mul(ca)));
      const n = mx_noise_float(vec3(r.mul(3.2), i4.w.mul(17.0).add(t.mul(0.35)))).mul(0.5).add(0.5);
      const d = length(r).mul(2.0).add(n.sub(0.5).mul(0.55));
      const puff = pow(max(oneMinus(d), 0.0), 1.35);
      mat.opacityNode = fade.mul(puff);
      mat.colorNode = mix(i3.xyz, i4.xyz, u).mul(mix(float(0.78), float(1.12), uv().y)).mul(n.mul(0.25).add(0.88));
    }
    this.mat = mat;
    this.sprite = new THREE.Sprite(mat); this.sprite.count = cap; this.sprite.frustumCulled = false;
    this.sprite.renderOrder = additive ? 5 : 4;
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, c0: THREE.Color, c1: THREE.Color, a: number, drag: number, grav: number) {
    const i = this.head; this.head = (this.head + 1) % this.max; if (this.head === 0) this.wrapped = true;
    const A0 = this.a0.array as Float32Array, A1 = this.a1.array as Float32Array, A2 = this.a2.array as Float32Array, A3 = this.a3.array as Float32Array, A4 = this.a4.array as Float32Array; const o = i * 4;
    A0[o] = p.x; A0[o + 1] = p.y; A0[o + 2] = p.z; A0[o + 3] = this.time;
    A1[o] = v.x; A1[o + 1] = v.y; A1[o + 2] = v.z; A1[o + 3] = life;
    A2[o] = drag; A2[o + 1] = grav; A2[o + 2] = s0; A2[o + 3] = s1;
    A3[o] = c0.r; A3[o + 1] = c0.g; A3[o + 2] = c0.b; A3[o + 3] = a;
    A4[o] = c1.r; A4[o + 1] = c1.g; A4[o + 2] = c1.b; A4[o + 3] = Math.random();
    if (i < this.dirtyLo) this.dirtyLo = i; if (i > this.dirtyHi) this.dirtyHi = i;
  }
  update(dt: number) {
    this.time += dt; this.uTime.value = this.time;
    if (this.dirtyHi < 0) return;
    const lo = this.wrapped ? 0 : this.dirtyLo, hi = this.wrapped ? this.max - 1 : this.dirtyHi;
    for (const a of [this.a0, this.a1, this.a2, this.a3, this.a4]) { a.clearUpdateRanges(); a.addUpdateRange(lo * 4, (hi - lo + 1) * 4); a.needsUpdate = true; }
    this.dirtyLo = Infinity; this.dirtyHi = -1; this.wrapped = false;
  }
  get count() { return this.max; }
  clear() { const A1 = this.a1.array as Float32Array; for (let i = 0; i < this.max; i++) A1[i * 4 + 3] = -1; this.a1.clearUpdateRanges(); this.a1.needsUpdate = true; this.head = 0; }
  dispose() { this.mat.dispose(); }
}

const _v = new THREE.Vector3(), _p = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

export class Particles {
  add: Pool; alpha: Pool; amount: number;
  ambient: THREE.Sprite | null = null; ambAttr: THREE.InstancedBufferAttribute | null = null; ambVel = new THREE.Vector3(); ambType = '';
  group = new THREE.Group();
  constructor(amount: number) {
    this.amount = amount;
    this.add = new Pool(Math.floor(6000 * amount) + 500, true);
    this.alpha = new Pool(Math.floor(5000 * amount) + 500, false);
    this.group.add(this.alpha.sprite, this.add.sprite);
  }
  /** kept for API compatibility – PointsNodeMaterial scales with the canvas height automatically */
  setScale(h: number) { void h; }
  chance(n: number) { return Math.random() < n * this.amount; }
  exhaust(p: THREE.Vector3, back: THREE.Vector3, baseVel: THREE.Vector3, col: THREE.Color, power: number, boost: number) {
    const n = Math.ceil((1 + boost * 2) * this.amount * 1.5);
    for (let i = 0; i < n; i++) {
      _v.copy(back).multiplyScalar(20 + power * 30 + Math.random() * 10).add(baseVel).addScaledVector(_p.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 4);
      this.add.spawn(p, _v, 0.1 + Math.random() * 0.1 + boost * 0.08, 0.7 + boost * 0.6, 0.15, col, EXH_END, 0.55, 2, 0);
    }
    if (this.chance(0.2)) { _v.copy(baseVel).multiplyScalar(0.6).addScaledVector(back, 10); this.alpha.spawn(p, _v, 0.9, 1.2, 4, SMK0, SMK1, 0.07, 1.5, -1); }
  }
  dust(p: THREE.Vector3, vel: THREE.Vector3, col: THREE.Color, n = 1) {
    for (let i = 0; i < n; i++) {
      if (!this.chance(0.45)) continue;
      _v.copy(vel).multiplyScalar(0.25).add(_p.set((Math.random() - 0.5) * 10, Math.random() * 3, (Math.random() - 0.5) * 10));
      _p.copy(p); _p.x += (Math.random() - 0.5) * 3; _p.z += (Math.random() - 0.5) * 3;
      // session 7: smaller, thinner, shorter-lived puffs (visibility behind other pods + fill-rate)
      this.alpha.spawn(_p, _v, 0.7 + Math.random() * 0.6, 1.5, 4 + Math.random() * 3, col, col, 0.15, 1.6, -0.3);
    }
  }
  /** fall base (session 14): drifting mist for water, rising embers for lava */
  fallMist(p: THREE.Vector3, spread: number, lava: boolean) {
    _p.set(p.x + (Math.random() - 0.5) * spread, p.y + 0.5, p.z + (Math.random() - 0.5) * spread);
    if (lava) { _v.set((Math.random() - 0.5) * 3, 4 + Math.random() * 6, (Math.random() - 0.5) * 3); this.add.spawn(_p, _v, 1 + Math.random(), 0.5, 0.15, EMB0, EMB1, 0.9, 0.6, 3); }
    else { _v.set((Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5); this.alpha.spawn(_p, _v, 1.4 + Math.random(), 2, 7, MIST, MIST, 0.1, 0.8, -0.2); }
  }
  /** spray burst when a pod cuts through a waterfall (droplets thrown up, falling back) */
  splash(p: THREE.Vector3, vel: THREE.Vector3) {
    for (let i = 0; i < 3; i++) {
      _v.copy(vel).multiplyScalar(0.35); _v.x += (Math.random() - 0.5) * 9; _v.y += 3 + Math.random() * 6; _v.z += (Math.random() - 0.5) * 9;
      this.alpha.spawn(p, _v, 0.6 + Math.random() * 0.5, 1, 4.5, MIST, MIST, 0.22, 1.4, 6);
    }
  }
  sparks(p: THREE.Vector3, normal: THREE.Vector3, vel: THREE.Vector3, n = 20) {
    n = Math.ceil(n * this.amount);
    for (let i = 0; i < n; i++) {
      _v.copy(normal).multiplyScalar(8 + Math.random() * 20).addScaledVector(vel, 0.6).add(_p.set((Math.random() - 0.5) * 20, Math.random() * 15, (Math.random() - 0.5) * 20));
      this.add.spawn(p, _v, 0.3 + Math.random() * 0.5, 0.5, 0.1, new THREE.Color(3, 2, 0.8), new THREE.Color(1.5, 0.35, 0.05), 1, 1, 25);
    }
  }
  smoke(p: THREE.Vector3, vel: THREE.Vector3, dark: number) {
    if (!this.chance(0.5)) return;
    _v.copy(vel).multiplyScalar(0.3).add(_p.set((Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2));
    const c = new THREE.Color(0.08, 0.07, 0.07).lerp(new THREE.Color(0.4, 0.4, 0.4), 1 - dark);
    this.alpha.spawn(p, _v, 1.5 + Math.random(), 1.5, 8, c, c, 0.6, 1, -2);
  }
  fire(p: THREE.Vector3, vel: THREE.Vector3) {
    if (!this.chance(0.8)) return;
    _v.copy(vel).multiplyScalar(0.5).add(_p.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3));
    this.add.spawn(p, _v, 0.35 + Math.random() * 0.3, 2.2, 0.5, new THREE.Color(2.5, 1.1, 0.3), new THREE.Color(0.8, 0.15, 0.03), 0.9, 1, -3);
  }
  /** energy-barrier shimmer: short-lived additive sparks spreading along the field plane */
  shimmer(p: THREE.Vector3, n: THREE.Vector3, col: THREE.Color) {
    const k = Math.ceil(12 * this.amount);
    for (let i = 0; i < k; i++) {
      _v.set((Math.random() - 0.5) * 7, (Math.random() - 0.2) * 6, (Math.random() - 0.5) * 7).addScaledVector(n, 2.5);
      _p.set(p.x + (Math.random() - 0.5) * 2.5, p.y + (Math.random() - 0.3) * 2.5, p.z + (Math.random() - 0.5) * 2.5);
      this.add.spawn(_p, _v, 0.3 + Math.random() * 0.3, 0.9, 0.1, col, col, 0.85, 2.5, 0);
    }
  }
  vent(p: THREE.Vector3, type: string) {
    if (!this.chance(type === 'sparkle' ? 0.25 : 0.35)) return;
    const j = _p.set((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3).add(p);
    if (type === 'smoke') { _v.set((Math.random() - 0.5) * 2, 6 + Math.random() * 4, (Math.random() - 0.5) * 2); this.alpha.spawn(j, _v, 5 + Math.random() * 3, 6, 30, new THREE.Color(0.12, 0.1, 0.1), new THREE.Color(0.25, 0.22, 0.22), 0.45, 0.3, -0.5); }
    else if (type === 'steam') { _v.set((Math.random() - 0.5) * 1.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 1.5); this.alpha.spawn(j, _v, 4 + Math.random() * 2, 3, 18, new THREE.Color(0.9, 0.92, 0.95), new THREE.Color(0.8, 0.85, 0.9), 0.25, 0.4, -0.3); }
    else if (type === 'embers') { _v.set((Math.random() - 0.5) * 4, 8 + Math.random() * 10, (Math.random() - 0.5) * 4); this.add.spawn(j, _v, 2 + Math.random() * 2, 0.6, 0.2, new THREE.Color(2.4, 0.9, 0.2), new THREE.Color(0.8, 0.1, 0.02), 1, 0.5, 4); }
    else { _v.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3); this.add.spawn(j.set(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6), _v, 1.5, 0.5, 0.1, new THREE.Color(1.6, 1.1, 2.2), new THREE.Color(0.6, 0.3, 1.2), 1, 1, 0); }
  }
  explosion(p: THREE.Vector3) {
    const n = Math.ceil(180 * this.amount);
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(10 + Math.random() * 30);
      this.add.spawn(p, _v, 0.5 + Math.random() * 0.8, 3 + Math.random() * 3, 1, new THREE.Color(3, 1.6, 0.5), new THREE.Color(1, 0.15, 0.03), 1, 2.5, 3);
    }
    for (let i = 0; i < n / 2; i++) {
      _v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 12);
      this.alpha.spawn(p, _v, 2 + Math.random() * 2, 4, 16, new THREE.Color(0.15, 0.13, 0.12), new THREE.Color(0.3, 0.3, 0.3), 0.7, 1.5, -1);
    }
    this.sparks(p, new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 60);
  }
  initAmbient(type: string) {
    const n = Math.max(1, Math.floor(2500 * this.amount));
    const pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 160;
    const attr = new THREE.InstancedBufferAttribute(pos, 3); attr.setUsage(THREE.DynamicDrawUsage);
    const colors: Record<string, string> = { dust: '#e8c8a0', snow: '#ffffff', embers: '#ff7020', spores: '#d8ff9a', rain: '#a0b0d0', sparkle: '#e0b0ff' };
    const add = type === 'embers' || type === 'sparkle' || type === 'spores';
    const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    mat.positionNode = instancedBufferAttribute(attr);
    mat.sizeNode = uniform(type === 'rain' ? 0.12 : type === 'dust' ? 0.35 : 0.25);
    mat.colorNode = color(new THREE.Color(colors[type]).multiplyScalar(add ? 1.5 : 1));
    mat.opacityNode = softDisc().mul(type === 'dust' ? 0.35 : 0.85);
    const sp = new THREE.Sprite(mat); sp.count = n; sp.frustumCulled = false;
    this.ambient = sp; this.ambAttr = attr; this.ambType = type;
    const vel: Record<string, [number, number, number]> = { dust: [8, 0.5, 3], snow: [2, -4, 1], embers: [1, 3, 0.5], spores: [0.5, 0.4, 0.3], rain: [1, -40, 0.5], sparkle: [0.3, 0.6, 0.2] };
    this.ambVel.set(...vel[type]);
    this.group.add(sp);
  }
  update(dt: number, cam: THREE.Vector3, t: number) {
    this.add.update(dt); this.alpha.update(dt);
    if (this.ambAttr) {
      const arr = this.ambAttr.array as Float32Array; const R = 80;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += (this.ambVel.x + Math.sin(t + i) * 0.5) * dt; arr[i + 1] += this.ambVel.y * dt; arr[i + 2] += (this.ambVel.z + Math.cos(t * 0.7 + i) * 0.5) * dt;
        for (let k = 0; k < 3; k++) { const c = k === 0 ? cam.x : k === 1 ? cam.y : cam.z; let d = arr[i + k] - c; if (d > R) d -= 2 * R; else if (d < -R) d += 2 * R; arr[i + k] = c + d; }
      }
      this.ambAttr.needsUpdate = true;
    }
  }
  clear() { this.add.clear(); this.alpha.clear(); }
  dispose() { this.add.dispose(); this.alpha.dispose(); (this.ambient?.material as THREE.Material | undefined)?.dispose(); }
}
export { WHITE };
