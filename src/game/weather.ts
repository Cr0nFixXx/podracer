// ===== Session 11: runtime weather – lightning (bolt mesh + flash level + thunder timing) and wind gusts (snow / dust / rain mist sheets) =====
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { EnvFx } from './environment';
import type { Particles } from './particles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { uniform, vec3 } = TSL;

const SEG = 26, BR = 9, QUADS = SEG + BR * 2;

export class WeatherFx {
  /** 0..1 lightning light level – drives sky flash + hemisphere light (never the tone-mapped full-screen flash → no overexposure) */
  flash = 0;
  /** 0..1 current gust strength (wind audio, gust sheets) */
  gust = 0;
  private bolt: THREE.Mesh | null = null; private boltI = uniform(0);
  private strikeAge = 9; private nextStrike: number; private hasBolt = false;
  private thunderAt = -1; private thunderVol = 0;
  private gustAge = 0; private gustDur = 3; private nextGust = 1.5;
  private wind = new THREE.Vector3(); private col = new THREE.Color();
  private fwd = new THREE.Vector3(); private right = new THREE.Vector3(); private p = new THREE.Vector3(); private v = new THREE.Vector3();
  private carry = 0; private glowCol = new THREE.Color(0.75, 0.86, 1.15);

  constructor(private fx: EnvFx, private particles: Particles, scene: THREE.Scene, private windAz: number) {
    this.nextStrike = 3 + Math.random() * 4;
    this.col.set(fx.gustColor);
    if (fx.lightning > 0) {
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(QUADS * 4 * 3), 3); pos.setUsage(THREE.DynamicDrawUsage);
      const idx: number[] = []; for (let q = 0; q < QUADS; q++) { const a = q * 4; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      g.setAttribute('position', pos); g.setIndex(idx);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      m.colorNode = vec3(0.72, 0.84, 1.0).mul(this.boltI);
      this.bolt = new THREE.Mesh(g, m); this.bolt.frustumCulled = false; this.bolt.visible = false; this.bolt.renderOrder = 3;
      scene.add(this.bolt);
    }
  }

  /** Jagged main channel from the cloud base to the ground + 2 side branches, built as camera-facing ribbons. */
  private buildBolt(cam: THREE.Vector3, x: number, z: number, groundY: number) {
    const P = (this.bolt!.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const dx = x - cam.x, dz = z - cam.z, l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l; // screen-horizontal direction
    let q = 0;
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
      const o = q * 12; q++;
      P[o] = ax - sx * w; P[o + 1] = ay; P[o + 2] = az - sz * w; P[o + 3] = ax + sx * w; P[o + 4] = ay; P[o + 5] = az + sz * w;
      P[o + 6] = bx - sx * w; P[o + 7] = by; P[o + 8] = bz - sz * w; P[o + 9] = bx + sx * w; P[o + 10] = by; P[o + 11] = bz + sz * w;
    };
    const top = groundY + 430, jag = l * 0.035; let px = x + (Math.random() - 0.5) * 120, py = top, pz = z + (Math.random() - 0.5) * 120;
    const forks: [number, number, number, number][] = [];
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG; const nx = x + (px - x) * (1 - t) * 0.9 + (Math.random() - 0.5) * jag * 2, ny = top + (groundY - top) * t, nz = z + (pz - z) * (1 - t) * 0.9 + (Math.random() - 0.5) * jag * 2;
      quad(px, py, pz, nx, ny, nz, l * 0.0021);
      if ((i === 8 || i === 15) && forks.length < 2) forks.push([nx, ny, nz, i === 8 ? 1 : -1]);
      px = nx; py = ny; pz = nz;
    }
    for (const [fx0, fy0, fz0, dir] of forks) {
      let bx = fx0, by = fy0, bz = fz0;
      for (let i = 1; i <= BR; i++) {
        const nx = bx + sx * dir * jag * (1.6 + Math.random() * 1.4) + (Math.random() - 0.5) * jag, ny = by - (18 + Math.random() * 16), nz = bz + sz * dir * jag * (1.6 + Math.random() * 1.4) + (Math.random() - 0.5) * jag;
        quad(bx, by, bz, nx, ny, nz, l * 0.0011 * (1 - i / (BR + 2)));
        bx = nx; by = ny; bz = nz;
      }
    }
    while (q < QUADS) quad(0, -9999, 0, 0, -9999, 0, 0);
    // impact glow where the channel meets the ground (one large soft additive sprite, 0.4 s)
    this.particles.add.spawn(this.p.set(x, groundY + 14, z), this.v.set(0, 0, 0), 0.4, 60, 130, this.glowCol, this.glowCol, 0.4, 0.1, 0);
    this.bolt!.geometry.attributes.position.needsUpdate = true;
  }

  update(dt: number, t: number, camera: THREE.Camera, frozen: boolean, onThunder: (vol: number) => void) {
    const fx = this.fx; const cam = camera.position;
    // ---------- lightning ----------
    if (fx.lightning > 0) {
      this.nextStrike -= dt * (frozen ? 0.4 : 1);
      if (this.nextStrike <= 0) {
        this.nextStrike = (5 + Math.random() * 9) / Math.max(0.25, fx.lightning);
        this.strikeAge = 0; this.hasBolt = Math.random() < 0.65;
        const dist = 520 + Math.random() * 900;
        camera.getWorldDirection(this.fwd); const a = Math.atan2(this.fwd.x, this.fwd.z) + (Math.random() - 0.5) * 2.2; // mostly in view
        if (this.hasBolt && this.bolt) this.buildBolt(cam, cam.x + Math.sin(a) * dist, cam.z + Math.cos(a) * dist, cam.y - 25);
        this.thunderAt = t + Math.min(3.2, dist / 340); this.thunderVol = Math.max(0.25, 1 - dist / 1700);
      }
      const s = this.strikeAge; this.strikeAge += dt;
      const e = s < 0.06 ? 1 : s < 0.12 ? 0.25 : s < 0.2 ? 0.85 : s < 1.2 ? 0.85 * Math.exp(-(s - 0.2) * 9) : 0;
      this.flash = e;
      if (this.bolt) { this.bolt.visible = this.hasBolt && e > 0.2; this.boltI.value = e * 7; }
      if (this.thunderAt > 0 && t >= this.thunderAt) { this.thunderAt = -1; onThunder(this.thunderVol); }
    }
    // ---------- gust sheets ----------
    if (fx.gust !== 'none' && dt > 0) {
      this.gustAge += dt;
      if (this.gustAge > this.gustDur + this.nextGust) { this.gustAge = 0; this.gustDur = 2.4 + Math.random() * 2.8; this.nextGust = 1.5 + Math.random() * 4; }
      const env = this.gustAge < this.gustDur ? Math.sin(Math.PI * this.gustAge / this.gustDur) : 0;
      this.gust = env;
      const az = this.windAz + Math.sin(t * 0.05) * 0.5; this.wind.set(Math.sin(az), 0, Math.cos(az));
      camera.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize(); this.right.set(-this.fwd.z, 0, this.fwd.x);
      this.carry += (0.22 + 0.78 * env) * fx.wind * 300 * this.particles.amount * dt;
      const n = Math.min(12, Math.floor(this.carry)); this.carry -= Math.floor(this.carry);
      const snow = fx.gust === 'snow', alpha = snow ? 0.085 : fx.gust === 'dust' ? 0.11 : 0.05;
      for (let i = 0; i < n; i++) {
        const f = 14 + Math.random() * 110, r = (Math.random() - 0.5) * 120;
        this.p.copy(cam).addScaledVector(this.fwd, f).addScaledVector(this.right, r).addScaledVector(this.wind, -22);
        this.p.y = cam.y - 3.5 + Math.random() * (snow ? 16 : 9);
        this.v.copy(this.wind).multiplyScalar(20 + Math.random() * 22 + env * 14); this.v.y = snow ? -1.5 : 0.6;
        this.particles.alpha.spawn(this.p, this.v, 1.3 + Math.random() * 1.1, 4.5, 10 + Math.random() * 4, this.col, this.col, alpha * (0.6 + 0.4 * env), 0.25, 0);
      }
    } else this.gust = 0.2 + 0.2 * Math.sin(t * 0.4);
  }

  dispose() { if (this.bolt) { this.bolt.geometry.dispose(); (this.bolt.material as THREE.Material).dispose(); } }
}
