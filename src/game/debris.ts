// ===== Session 15: solid debris chunks (instanced, opaque) – replaces the translucent sprite "chunks" =====
// Session 20: a second shape, 'plate' = painted sheet metal (Bruchteile that tear off a pod, pieces of an exploding pod).
import * as THREE from 'three';

const N = 72, G = 32;
export class DebrisPool {
  mesh: THREE.InstancedMesh;
  private p = new Float32Array(N * 3); private v = new Float32Array(N * 3); private ax = new Float32Array(N * 3);
  private life = new Float32Array(N); private size = new Float32Array(N); private gy = new Float32Array(N); private ang = new Float32Array(N);
  private head = 0; private active = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private a = new THREE.Vector3(); private s = new THREE.Vector3(); private pos = new THREE.Vector3(); private c = new THREE.Color();
  constructor(shape: 'chunk' | 'plate' = 'chunk') {
    const geo = shape === 'plate' ? new THREE.BoxGeometry(1.5, 0.09, 1) : new THREE.IcosahedronGeometry(1, 0); if (shape === 'chunk') geo.scale(1, 0.7, 0.85);
    const mat = shape === 'plate' ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0.6 }) : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, metalness: 0.05, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, N); this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.m.makeScale(0, 0, 0); for (let i = 0; i < N; i++) { this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, this.c.set('#888888')); }
    this.mesh.visible = false;
  }
  /** `groundY` = height the chunks bounce on; `size` = obstacle radius. */
  spawn(x: number, y: number, z: number, groundY: number, vel: THREE.Vector3, col: THREE.Color, size: number, count: number) {
    for (let k = 0; k < count; k++) {
      const i = this.head; this.head = (this.head + 1) % N; const j = i * 3;
      this.p[j] = x + (Math.random() - 0.5) * size; this.p[j + 1] = y + 0.3 + Math.random() * size; this.p[j + 2] = z + (Math.random() - 0.5) * size;
      this.v[j] = vel.x * 0.45 + (Math.random() - 0.5) * 22; this.v[j + 1] = 4 + Math.random() * 12; this.v[j + 2] = vel.z * 0.45 + (Math.random() - 0.5) * 22;
      this.a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); this.ax[j] = this.a.x; this.ax[j + 1] = this.a.y; this.ax[j + 2] = this.a.z;
      this.life[i] = 1.6 + Math.random() * 1.6; this.size[i] = (0.18 + Math.random() * 0.34) * Math.min(1.6, 0.6 + size * 0.25); this.gy[i] = groundY; this.ang[i] = Math.random() * 6;
      this.c.copy(col).multiplyScalar(0.75 + Math.random() * 0.5); this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true; this.active = N;
  }
  /** Shows the (empty) pool for one frame so that its pipeline is compiled during the warm-up, not at the first crash. */
  warm(on: boolean) { if (!this.active) this.mesh.visible = on; }
  update(dt: number) {
    if (!this.active || dt <= 0) return;
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3; this.life[i] -= dt;
      this.v[j + 1] -= G * dt; this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt; this.ang[i] += dt * 7;
      const floor = this.gy[i] + this.size[i] * 0.5;
      if (this.p[j + 1] < floor) { this.p[j + 1] = floor; this.v[j + 1] = Math.abs(this.v[j + 1]) * 0.32; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      const sc = this.life[i] <= 0 ? 0 : this.size[i] * Math.min(1, this.life[i] / 0.45); // shrink away at the end – never translucent
      this.m.compose(this.pos.set(this.p[j], this.p[j + 1], this.p[j + 2]), this.q.setFromAxisAngle(this.a.set(this.ax[j], this.ax[j + 1], this.ax[j + 2]), this.ang[i]), this.s.setScalar(sc));
      this.mesh.setMatrixAt(i, this.m); if (sc > 0) alive++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) { this.active = 0; this.mesh.visible = false; }
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
