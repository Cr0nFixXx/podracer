// ===== Runtime weather: fine fractal lightning (hairline stepped leader + multi-order forks + flash + thunder) & wind gusts =====
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { EnvFx } from './environment';
import type { Particles } from './particles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, attribute, mix, oneMinus, pow, uniform, uv, vec3 } = TSL;

// 64 main stepped-leader segments + 5 × 14 primary forks + 7 × 7 hairline twigs = 183 segments (core + soft corona ribbon each)
const MAIN_DEPTH = 6; // 2^6 = 64 segments
const MAIN_SEG = 1 << MAIN_DEPTH;
const FORKS = 5, BR = 14, TWIGS = 7, TW = 7;
const RIB = MAIN_SEG + FORKS * BR + TWIGS * TW;
const QUADS = RIB * 2;

type Pt3 = [number, number, number];

/** Recursive 3D midpoint displacement producing crisp, realistic stepped-leader lightning kinks at every scale. */
function fractalPath(a: Pt3, b: Pt3, depth: number, spreadX: number, spreadZ: number, sx: number, sz: number): Pt3[] {
  let pts: Pt3[] = [a, b];
  let amp = 1;
  for (let d = 0; d < depth; d++) {
    const next: Pt3[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const lat = (Math.random() - 0.5) * 2 * spreadX * amp;
      const dep = (Math.random() - 0.5) * 2 * spreadZ * amp;
      const yJit = (Math.random() - 0.5) * Math.abs(p1[1] - p0[1]) * 0.16;
      next.push([
        (p0[0] + p1[0]) * 0.5 + sx * lat - sz * dep,
        (p0[1] + p1[1]) * 0.5 + yJit,
        (p0[2] + p1[2]) * 0.5 + sz * lat + sx * dep,
      ], p1);
    }
    pts = next;
    amp *= 0.54;
  }
  return pts;
}

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
  private wind = new THREE.Vector3(); private col = new THREE.Color(); private glowCol = new THREE.Color(0.72, 0.85, 1.15);
  private fwd = new THREE.Vector3(); private right = new THREE.Vector3(); private p = new THREE.Vector3(); private v = new THREE.Vector3();
  private carry = 0;

  /** `fx` is the live (per-frame updated) effect state; `withBolt` = lightning can occur at some point of the race. */
  /** `green`: methane storm (Malastare) – bolt and ground glow are green */
  constructor(private fx: EnvFx, private particles: Particles, scene: THREE.Scene, private windAz: number, withBolt: boolean, green = false) {
    if (green) this.glowCol.setRGB(0.62, 1.15, 0.5);
    this.nextStrike = 2.5 + Math.random() * 3;
    this.col.set(fx.gustColor);
    if (withBolt) {
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(QUADS * 4 * 3), 3); pos.setUsage(THREE.DynamicDrawUsage);
      const aI = new THREE.BufferAttribute(new Float32Array(QUADS * 4), 1); aI.setUsage(THREE.DynamicDrawUsage);
      const uvs = new Float32Array(QUADS * 4 * 2);
      const idx: number[] = [];
      for (let q = 0; q < QUADS; q++) {
        const a = q * 4;
        // Cross-ribbon profile u ∈ [0, 1] so shader tapers every bolt filament smoothly to razor-sharp subpixel core!
        uvs[a * 2] = 0; uvs[a * 2 + 1] = 0;
        uvs[(a + 1) * 2] = 1; uvs[(a + 1) * 2 + 1] = 0;
        uvs[(a + 2) * 2] = 0; uvs[(a + 2) * 2 + 1] = 1;
        uvs[(a + 3) * 2] = 1; uvs[(a + 3) * 2 + 1] = 1;
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
      g.setAttribute('position', pos); g.setAttribute('aI', aI); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      // Razor-fine transverse falloff: bright white-blue needle along centerline, soft electric-violet corona towards edge
      const across = oneMinus(abs(uv().x.mul(2.0).sub(1.0)));
      const profile = pow(across, 2.4);
      const tint = green ? mix(vec3(0.4, 1.0, 0.3), vec3(0.9, 1.0, 0.8), pow(across, 3.0)) : mix(vec3(0.55, 0.74, 1.0), vec3(0.95, 0.98, 1.0), pow(across, 3.0));
      m.colorNode = tint.mul(this.boltI).mul(attribute('aI', 'float')).mul(profile);
      this.bolt = new THREE.Mesh(g, m); this.bolt.frustumCulled = false; this.bolt.visible = false; this.bolt.renderOrder = 3;
      scene.add(this.bolt);
    }
  }

  /** Fine fractal stepped leader from cloud deck to ground + 5 forked primary branches + 7 hairline secondary twigs. */
  private buildBolt(cam: THREE.Vector3, x: number, z: number, groundY: number) {
    const geo = this.bolt!.geometry;
    const P = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const I = (geo.attributes.aI as THREE.BufferAttribute).array as Float32Array;
    const dx = x - cam.x, dz = z - cam.z, l = Math.hypot(dx, dz) || 1;
    const vx = dx / l, vz = dz / l, sx = -vz, sz = vx;
    let q = 0;

    // 3D camera-perpendicular ribbon so angled branches keep exact hairline thickness instead of foreshortening/widening
    const seg = (a: Pt3, b: Pt3, w0: number, w1: number, i0: number, i1: number, glowMul = 4.2, glowI = 0.14) => {
      if (q >= RIB) return;
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
      // side = normalize(edge × viewDir)
      let px = -ey * vz, py = ez * vx - ex * vz, pz = ey * vx;
      const pl = Math.hypot(px, py, pz);
      if (pl > 1e-4) { px /= pl; py /= pl; pz /= pl; } else { px = sx; py = 0; pz = sz; }
      for (const [qi, mW, mI] of [[q, 1, 1], [q + RIB, glowMul, glowI]] as const) {
        const o = qi * 12, r0 = w0 * mW, r1 = w1 * mW;
        P[o] = a[0] - px * r0; P[o + 1] = a[1] - py * r0; P[o + 2] = a[2] - pz * r0;
        P[o + 3] = a[0] + px * r0; P[o + 4] = a[1] + py * r0; P[o + 5] = a[2] + pz * r0;
        P[o + 6] = b[0] - px * r1; P[o + 7] = b[1] - py * r1; P[o + 8] = b[2] - pz * r1;
        P[o + 9] = b[0] + px * r1; P[o + 10] = b[1] + py * r1; P[o + 11] = b[2] + pz * r1;
        const io = qi * 4;
        I[io] = I[io + 1] = i0 * mI;
        I[io + 2] = I[io + 3] = i1 * mI;
      }
      q++;
    };

    const top = groundY + 480;
    const start: Pt3 = [x + (Math.random() - 0.5) * 130, top, z + (Math.random() - 0.5) * 130];
    const end: Pt3 = [x, groundY, z];
    const main = fractalPath(start, end, MAIN_DEPTH, Math.min(72, l * 0.068), Math.min(36, l * 0.03), sx, sz);

    // Fine main leader (~3.4× thinner than the old wide ribbon, crisp white-hot filament)
    const wMain = Math.max(0.22, l * 0.00105);
    for (let i = 0; i < MAIN_SEG; i++) {
      const f0 = i / MAIN_SEG, f1 = (i + 1) / MAIN_SEG;
      const w0 = wMain * (1.08 - 0.22 * f0), w1 = wMain * (1.08 - 0.22 * f1);
      seg(main[i], main[i + 1], w0, w1, 1.0, 1.0, 4.6, 0.15);
    }

    // 5 jagged primary forks branching off upper/middle trunk and tapering to needle tips
    const twigSeeds: { p: Pt3; dir: number; scale: number }[] = [];
    const forkStops = [8, 17, 26, 36, 46];
    for (let f = 0; f < FORKS; f++) {
      const idx = Math.min(MAIN_SEG - 4, forkStops[f] + Math.floor((Math.random() - 0.5) * 5));
      const root = main[idx];
      const dir = (f % 2 === 0 ? 1 : -1) * (Math.random() < 0.2 ? -1 : 1);
      const reach = (65 + Math.random() * 95) * (1 - idx / (MAIN_SEG * 1.35));
      const drop = (95 + Math.random() * 115) * (1 - idx / (MAIN_SEG * 1.4));
      const tip: Pt3 = [
        root[0] + sx * dir * reach + (Math.random() - 0.5) * 28,
        Math.max(groundY + 18, root[1] - drop),
        root[2] + sz * dir * reach + (Math.random() - 0.5) * 28,
      ];
      // 16-point fractal chain trimmed to BR=14 segments
      const chain = fractalPath(root, tip, 4, reach * 0.24, reach * 0.12, sx, sz);
      const wFork = wMain * (0.56 - f * 0.04);
      for (let i = 0; i < BR; i++) {
        const u0 = i / BR, u1 = (i + 1) / BR;
        seg(chain[i], chain[i + 1], wFork * (1 - u0 * 0.84), wFork * (1 - u1 * 0.84), 0.76 * (1 - u0 * 0.65), 0.76 * (1 - u1 * 0.65), 3.4, 0.11);
        if ((i === 4 || i === 8) && twigSeeds.length < TWIGS) {
          twigSeeds.push({ p: chain[i + 1], dir: i === 4 ? dir : -dir, scale: 1 - u1 * 0.45 });
        }
      }
    }

    // 7 ultra-delicate hairline sub-twigs branching off the primary forks
    for (let tw = 0; tw < TWIGS; tw++) {
      const seed = twigSeeds[tw];
      if (!seed) break;
      const span = (22 + Math.random() * 34) * seed.scale;
      const drop = (28 + Math.random() * 42) * seed.scale;
      const tip: Pt3 = [
        seed.p[0] + sx * seed.dir * span,
        Math.max(groundY + 12, seed.p[1] - drop),
        seed.p[2] + sz * seed.dir * span,
      ];
      const chain = fractalPath(seed.p, tip, 3, span * 0.28, span * 0.14, sx, sz);
      const wTwig = wMain * 0.28 * seed.scale;
      for (let i = 0; i < TW; i++) {
        const u0 = i / TW, u1 = (i + 1) / TW;
        seg(chain[i], chain[i + 1], wTwig * (1 - u0 * 0.88), wTwig * (1 - u1 * 0.88), 0.48 * (1 - u0 * 0.8), 0.48 * (1 - u1 * 0.8), 2.6, 0.08);
      }
    }

    while (q < RIB) seg([0, -9999, 0], [0, -9999, 0], 0, 0, 0, 0, 0, 0);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aI as THREE.BufferAttribute).needsUpdate = true;
    // impact glow where the channel meets the ground + close ground sparks
    this.particles.add.spawn(this.p.set(x, groundY + 12, z), this.v.set(0, 0, 0), 0.4, 52, 125, this.glowCol, this.glowCol, 0.42, 0.1, 0);
    if (l < 700) this.particles.sparks(this.p.set(x, groundY + 1, z), this.v.set(0, 1, 0), this.fwd.set(0, 0, 0), 40);
  }

  /** `onThunder(vol)` fires when the sound arrives; `onStrike(near 0..1)` at the flash (camera shake for close hits). */
  update(dt: number, t: number, camera: THREE.Camera, frozen: boolean, onThunder: (vol: number) => void, onStrike?: (near: number) => void) {
    const fx = this.fx; const cam = camera.position;
    // ---------- lightning ----------
    if (fx.lightning > 0.03 || this.strikeAge < 2) {
      if (fx.lightning > 0.03) this.nextStrike -= dt * (frozen ? 0.4 : 1);
      if (this.nextStrike <= 0) {
        this.nextStrike = (1.8 + Math.random() * 4) / Math.max(0.25, fx.lightning);
        this.strikeAge = 0; this.hasBolt = Math.random() < 0.82;
        const dist = 380 + Math.random() * Math.random() * 1100;
        camera.getWorldDirection(this.fwd); const a = Math.atan2(this.fwd.x, this.fwd.z) + (Math.random() - 0.5) * 2.0;
        if (this.hasBolt && this.bolt) this.buildBolt(cam, cam.x + Math.sin(a) * dist, cam.z + Math.cos(a) * dist, cam.y - 25);
        // 2–4 crisp return strokes: flicker pattern [start, level]
        this.pulses = [0, 1]; let pt = 0; const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) { pt += 0.065 + Math.random() * 0.095; this.pulses.push(pt, 0.55 + Math.random() * 0.45); }
        const near = Math.max(0, 1 - dist / 1500);
        this.thunderAt = t + Math.min(3.0, dist / 343); this.thunderVol = 0.35 + 0.65 * near;
        onStrike?.(near);
      }
      const s = this.strikeAge; this.strikeAge += dt;
      let e = 0; for (let i = 0; i < this.pulses.length; i += 2) { const d = s - this.pulses[i]; if (d >= 0) e = Math.max(e, this.pulses[i + 1] * Math.exp(-d * (i === this.pulses.length - 2 ? 6.2 : 18))); }
      this.flash = e < 0.01 ? 0 : e;
      if (this.bolt) { this.bolt.visible = this.hasBolt && e > 0.1; this.boltI.value = e * 8.5; }
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
