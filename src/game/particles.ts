import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { color, instancedBufferAttribute, length, max, oneMinus, pow, uniform, uv } = TSL;

/** Soft round disc (replaces the old sprite texture; identical falloff, no square edges). */
const softDisc = () => pow(max(oneMinus(length(uv().sub(0.5)).mul(2.0)), 0.0), 1.6);

/**
 * Particle pool rendered as ONE instanced sprite draw (PointsNodeMaterial) – works on WebGPU and WebGL2.
 * CPU simulation, GPU upload of the live range only.
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
    const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    mat.positionNode = instancedBufferAttribute(this.posAttr);
    mat.sizeNode = instancedBufferAttribute(this.sizeAttr).mul(1.8); // matches the former gl_PointSize = size * 0.9 * viewportHeight / depth
    const c = instancedBufferAttribute(this.colAttr);
    mat.colorNode = c.xyz;
    mat.opacityNode = c.w.mul(softDisc());
    this.mat = mat;
    this.sprite = new THREE.Sprite(mat); this.sprite.count = 0; this.sprite.frustumCulled = false;
    this.sprite.renderOrder = additive ? 5 : 4;
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, c0: THREE.Color, c1: THREE.Color, a: number, drag: number, grav: number) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }
  kill(i: number) {
    const j = --this.count; if (i === j) return;
    const c3 = (arr: Float32Array) => { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; };
    c3(this.pos); c3(this.vel); c3(this.c0); c3(this.c1);
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
  update(dt: number) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this.kill(i); continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    const P = this.posAttr.array as Float32Array, S = this.sizeAttr.array as Float32Array, C = this.colAttr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.maxLife[i];
      P[i * 3] = this.pos[i * 3]; P[i * 3 + 1] = this.pos[i * 3 + 1]; P[i * 3 + 2] = this.pos[i * 3 + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      C[i * 4] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      C[i * 4 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      C[i * 4 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      C[i * 4 + 3] = this.a0[i] * Math.min(1, t * 8) * (1 - t);
    }
    this.sprite.count = this.count;
    if (this.count > 0) for (const [a, k] of [[this.posAttr, 3], [this.sizeAttr, 1], [this.colAttr, 4]] as [THREE.InstancedBufferAttribute, number][]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, this.count * k); a.needsUpdate = true;
    }
  }
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
      this.add.spawn(p, _v, 0.1 + Math.random() * 0.1 + boost * 0.08, 0.7 + boost * 0.6, 0.15, col, new THREE.Color(0.6, 0.15, 0.05), 0.55, 2, 0);
    }
    if (this.chance(0.3)) { _v.copy(baseVel).multiplyScalar(0.6).addScaledVector(back, 10); this.alpha.spawn(p, _v, 1.2, 1.5, 6, new THREE.Color(0.5, 0.5, 0.5), new THREE.Color(0.35, 0.35, 0.35), 0.12, 1.5, -1); }
  }
  dust(p: THREE.Vector3, vel: THREE.Vector3, col: THREE.Color, n = 1) {
    for (let i = 0; i < n; i++) {
      if (!this.chance(0.7)) continue;
      _v.copy(vel).multiplyScalar(0.25).add(_p.set((Math.random() - 0.5) * 12, Math.random() * 5, (Math.random() - 0.5) * 12));
      _p.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
      this.alpha.spawn(_p, _v, 1.2 + Math.random(), 2, 10 + Math.random() * 6, col, col, 0.35, 1.2, -0.5);
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
  clear() { this.add.count = 0; this.alpha.count = 0; }
  dispose() { this.add.dispose(); this.alpha.dispose(); (this.ambient?.material as THREE.Material | undefined)?.dispose(); }
}
export { WHITE };
