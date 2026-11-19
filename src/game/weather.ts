// ===== Runtime weather: lightning (bolt mesh + flash level + thunder timing) and wind gusts (snow / dust / rain-mist sheets) =====
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { EnvFx } from './environment';
import type { Particles } from './particles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { attribute, uniform, vec3 } = TSL;

const SEG = 30, BR = 10, FORKS = 3, RIB = SEG + BR * FORKS, QUADS = RIB * 2; // every ribbon twice: thin white-hot core + wide soft glow

export class WeatherFx {
  /** 0..1 lightning light level – drives sky flash, hemisphere + environment light (never a full-screen white-out) */
  flash = 0;
  /** 0..1 current gust strength (wind audio, gust sheets) */
  gust = 0;
  /** graphics setting "Wetter-Effekte": 0 = no gust sheets, 0.5 = reduced, 1 = full */
  quality = 1;
  private bolt: THREE.Mesh | null = null; private boltI = uniform(0);
  private strikeAge = 9; private nextStrike: number; private hasBolt = false; private pulses: number[] = [];
  private thunderAt = -1; private thunderVol = 0;
  private gustAge = 0; private gustDur = 3; private nextGust = 1.5;
  private wind = new THREE.Vector3(); private col = new THREE.Color(); private glowCol = new THREE.Color(0.75, 0.86, 1.15);
  private fwd = new THREE.Vector3(); private right = new THREE.Vector3(); private p = new THREE.Vector3(); private v = new THREE.Vector3();
  private carry = 0;

  /** `fx` is the live (per-frame updated) effect state; `withBolt` = lightning can occur at some point of the race. */
  constructor(private fx: EnvFx, private particles: Particles, scene: THREE.Scene, private windAz: number, withBolt: boolean) {
    this.nextStrike = 2.5 + Math.random() * 3;
    this.col.set(fx.gustColor);
    if (withBolt) {
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(QUADS * 4 * 3), 3); pos.setUsage(THREE.DynamicDrawUsage);
      const aI = new Float32Array(QUADS * 4); for (let i = 0; i < QUADS * 4; i++) aI[i] = i < RIB * 4 ? 1 : 0.16;
      const idx: number[] = []; for (let q = 0; q < QUADS; q++) { const a = q * 4; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      g.setAttribute('position', pos); g.setAttribute('aI', new THREE.BufferAttribute(aI, 1)); g.setIndex(idx);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      m.colorNode = vec3(0.74, 0.85, 1.0).mul(this.boltI).mul(attribute('aI', 'float'));
      this.bolt = new THREE.Mesh(g, m); this.bolt.frustumCulled = false; this.bolt.visible = false; this.bolt.renderOrder = 3;
      scene.add(this.bolt);
    }
  }

  /** Jagged main channel from the cloud base to the ground + 3 side branches as camera-facing ribbons (core + glow). */
  private buildBolt(cam: THREE.Vector3, x: number, z: number, groundY: number) {
    const P = (this.bolt!.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const dx = x - cam.x, dz = z - cam.z, l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l; // screen-horizontal direction
    let q = 0;
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
      for (const [o, ww] of [[q * 12, w], [(q + RIB) * 12, w * 6]]) {
        P[o] = ax - sx * ww; P[o + 1] = ay; P[o + 2] = az - sz * ww; P[o + 3] = ax + sx * ww; P[o + 4] = ay; P[o + 5] = az + sz * ww;
        P[o + 6] = bx - sx * ww; P[o + 7] = by; P[o + 8] = bz - sz * ww; P[o + 9] = bx + sx * ww; P[o + 10] = by; P[o + 11] = bz + sz * ww;
      }
      q++;
    };
    const top = groundY + 460, jag = l * 0.038; let px = x + (Math.random() - 0.5) * 140, py = top, pz = z + (Math.random() - 0.5) * 140;
    const forks: [number, number, number, number][] = [];
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG; const nx = x + (px - x) * (1 - t) * 0.9 + (Math.random() - 0.5) * jag * 2, ny = top + (groundY - top) * t, nz = z + (pz - z) * (1 - t) * 0.9 + (Math.random() - 0.5) * jag * 2;
      quad(px, py, pz, nx, ny, nz, l * 0.0034);
      if ((i === 7 || i === 13 || i === 20) && forks.length < FORKS) forks.push([nx, ny, nz, forks.length % 2 ? -1 : 1]);
      px = nx; py = ny; pz = nz;
    }
    for (const [fx0, fy0, fz0, dir] of forks) {
      let bx = fx0, by = fy0, bz = fz0;
      for (let i = 1; i <= BR; i++) {
        const nx = bx + sx * dir * jag * (1.6 + Math.random() * 1.4) + (Math.random() - 0.5) * jag, ny = by - (18 + Math.random() * 16), nz = bz + sz * dir * jag * (1.6 + Math.random() * 1.4) + (Math.random() - 0.5) * jag;
        quad(bx, by, bz, nx, ny, nz, l * 0.0014 * (1 - i / (BR + 2)));
        bx = nx; by = ny; bz = nz;
      }
    }
    while (q < RIB) quad(0, -9999, 0, 0, -9999, 0, 0);
    this.bolt!.geometry.attributes.position.needsUpdate = true;
    // impact glow where the channel meets the ground (one large soft additive sprite) + a burst of ground sparks for close strikes
    this.particles.add.spawn(this.p.set(x, groundY + 14, z), this.v.set(0, 0, 0), 0.45, 70, 150, this.glowCol, this.glowCol, 0.45, 0.1, 0);
    if (l < 700) this.particles.sparks(this.p.set(x, groundY + 1, z), this.v.set(0, 1, 0), this.fwd.set(0, 0, 0), 40);
  }

  /** `onThunder(vol)` fires when the sound arrives; `onStrike(near 0..1)` at the flash (camera shake for close hits). */
  update(dt: number, t: number, camera: THREE.Camera, frozen: boolean, onThunder: (vol: number) => void, onStrike?: (near: number) => void) {
    const fx = this.fx; const cam = camera.position;
    // ---------- lightning ----------
    if (fx.lightning > 0.03 || this.strikeAge < 2) {
      if (fx.lightning > 0.03) this.nextStrike -= dt * (frozen ? 0.4 : 1);
      if (this.nextStrike <= 0) {
        this.nextStrike = (1.8 + Math.random() * 4) / Math.max(0.25, fx.lightning); // Session 16: more frequent
        this.strikeAge = 0; this.hasBolt = Math.random() < 0.8;
        const dist = 380 + Math.random() * Math.random() * 1100;
        camera.getWorldDirection(this.fwd); const a = Math.atan2(this.fwd.x, this.fwd.z) + (Math.random() - 0.5) * 2.0; // mostly in view
        if (this.hasBolt && this.bolt) this.buildBolt(cam, cam.x + Math.sin(a) * dist, cam.z + Math.cos(a) * dist, cam.y - 25);
        // 2–4 return strokes: flicker pattern [start, level]
        this.pulses = [0, 1]; let pt = 0; const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) { pt += 0.07 + Math.random() * 0.1; this.pulses.push(pt, 0.55 + Math.random() * 0.45); }
        const near = Math.max(0, 1 - dist / 1500);
        this.thunderAt = t + Math.min(3.0, dist / 343); this.thunderVol = 0.35 + 0.65 * near;
        onStrike?.(near);
      }
      const s = this.strikeAge; this.strikeAge += dt;
      let e = 0; for (let i = 0; i < this.pulses.length; i += 2) { const d = s - this.pulses[i]; if (d >= 0) e = Math.max(e, this.pulses[i + 1] * Math.exp(-d * (i === this.pulses.length - 2 ? 5.5 : 16))); }
      this.flash = e < 0.01 ? 0 : e;
      if (this.bolt) { this.bolt.visible = this.hasBolt && e > 0.12; this.boltI.value = e * 9; }
      if (this.thunderAt > 0 && t >= this.thunderAt) { this.thunderAt = -1; onThunder(this.thunderVol); }
    } else { this.flash = 0; if (this.bolt) this.bolt.visible = false; }
    // ---------- gust sheets ----------
    if (fx.gust !== 'none' && fx.gustAmt > 0.03 && dt > 0) {
      this.gustAge += dt;
      if (this.gustAge > this.gustDur + this.nextGust) { this.gustAge = 0; this.gustDur = 2.4 + Math.random() * 2.8; this.nextGust = 1.5 + Math.random() * 4; }
      const env = this.gustAge < this.gustDur ? Math.sin(Math.PI * this.gustAge / this.gustDur) : 0;
      this.gust = env;
      const az = this.windAz + Math.sin(t * 0.05) * 0.5; this.wind.set(Math.sin(az), 0, Math.cos(az));
      camera.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize(); this.right.set(-this.fwd.z, 0, this.fwd.x);
      this.carry += (0.22 + 0.78 * env) * fx.wind * fx.gustAmt * 480 * this.particles.amount * this.quality * dt;
      const n = Math.min(18, Math.floor(this.carry)); this.carry -= Math.floor(this.carry);
      const snow = fx.gust === 'snow', alpha = snow ? 0.125 : fx.gust === 'dust' ? 0.155 : 0.085;
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
