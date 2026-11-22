// Tuning-Teile and Style-Teile: extra parts that grow on the hard points of an engine (EngineGeo.hard, podParts.ts).
// They are added to the engine's material buckets and never replace base geometry; the physics shapes do not change (look only).
//   Tuning-Teil = follows a tuning value: tier 0 (step 0–1) nothing · tier 1 (step 2–3) the small part · tier 2 (step 4–5) the big one
//   Style-Teil  = free choice per slot: fins / intake / nozzle, 0 (Werk) .. 3. (The fourth slot, the canopy tint, is a glass material.)
// Geometry only – no materials, no three/webgpu, no DOM (this file is bundled into the node CI).
import * as THREE from 'three';
import { STAT_KEYS, type StatKey } from './data';
import { PartBuilder, M4, cyl, extrude, heatAlong, lathe, prof, radial, rbox, sphere, torus, tube, type MatKey } from './podKit';
import { engineGeo, type EngineSpec, type FlapGeo } from './podParts';

export interface KitSpec { fins: number; intake: number; nozzle: number; /** tier 0..2 per tuning value */ tune: Record<StatKey, number> }
export const NO_TUNE = Object.freeze(Object.fromEntries(STAT_KEYS.map(k => [k, 0]))) as Record<StatKey, number>;
export const NO_KIT: KitSpec = { fins: 0, intake: 0, nozzle: 0, tune: NO_TUNE };
/** Tuning steps (0..5) → part tiers (0..2). */
export function tuneTiers(tuning?: Partial<Record<StatKey, number>>): Record<StatKey, number> {
  return Object.fromEntries(STAT_KEYS.map(k => { const s = tuning?.[k] ?? 0; return [k, s >= 4 ? 2 : s >= 2 ? 1 : 0]; })) as Record<StatKey, number>;
}
export const kitKey = (k: KitSpec) => `${k.fins}${k.intake}${k.nozzle}|${STAT_KEYS.map(s => k.tune[s] ?? 0).join('')}`;
export const isWerk = (k: KitSpec) => !k.fins && !k.intake && !k.nozzle && STAT_KEYS.every(s => !k.tune[s]);

/** The kit of one engine: parts per material bucket (engine space) and the engine's air-brake flaps with the kit applied. */
export interface EngineKit { parts: Map<MatKey, THREE.BufferGeometry>; flaps: FlapGeo[] }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const HALF = Math.PI / 2;
const SEC: [number, number, number] = [0, 0, 3]; // solid secondary paint
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** thin plate in the YZ plane (points [z, y]), `t` thick */
const plateYZ = (pts: [number, number][], t: number) => extrude(pts, t, Math.min(0.012, t * 0.3)).rotateY(-HALF);
/** a part built standing on y = 0 and pointing +y → onto the body at angle `a` from the top, radius `r`, station `z` */
const onBody = (a: number, r: number, z: number) => M4.trs(Math.sin(a) * r, Math.cos(a) * r, z, 0, 0, -a);
/** swept plate standing on y = 0: root chord `cr` running towards -z from z = 0, tip chord `ct` at height `span`, leading edge swept back by `sweep` */
const wing = (cr: number, ct: number, span: number, sweep: number, t: number) => extrude([[0, 0], [cr, 0], [sweep + ct, span], [sweep, span]], t, Math.min(0.01, t * 0.3)).rotateY(HALF);

const EMPTY = new Map<MatKey, THREE.BufferGeometry>();
const cache = new Map<string, EngineKit>();

export function engineKit(spec: EngineSpec, seg: number, kit: KitSpec): EngineKit {
  const eg = engineGeo(spec, seg);
  if (isWerk(kit)) return { parts: EMPTY, flaps: eg.flaps };
  const key = `${spec.L}|${spec.R}|${spec.style}|${spec.bands}|${spec.blades}|${spec.spike}|${spec.fins}|${seg}|${kitKey(kit)}`;
  const hit = cache.get(key); if (hit) return hit;
  const hp = eg.hard, { nozzle: nz, mouth: mo, body: bd, spine: sp, tail: tl } = hp, T = kit.tune, hi = seg >= 24;
  const pb = new PartBuilder(), len = bd.zB - bd.zA, zm = (bd.zA + bd.zB) / 2, s = clamp(bd.r, 0.45, 1.3); // `s`: add-on parts follow the engine size
  const flat = bd.slot, W = flat ? flat[0] : 0; // slab engine: half width
  const P = (a: number, r: number, z: number) => V(Math.sin(a) * r, Math.cos(a) * r, z);

  // ================================================================ Tuning-Teile
  // ---- Höchstgeschwindigkeit: nozzle collar → afterburner ring with cooling ribs and a second glow ring
  if (T.topSpeed >= 1) {
    const big = T.topSpeed >= 2;
    if (nz.slot) {
      const [w, h] = nz.slot;
      for (const sy of [-1, 1]) {
        pb.add('steel', rbox(w * 2 + 0.16, big ? 0.1 : 0.06, 0.26, 0.02), M4.t(0, sy * (h + 0.12), nz.z + 0.17));
        pb.add('copper', rbox(w * 2 + 0.1, 0.025, 0.03, 0.008), M4.t(0, sy * (h + 0.11), nz.z + 0.02));
        if (big) {
          for (let i = -5; i <= 5; i++) pb.add('dark', rbox(0.03, 0.1, 0.3, 0.008), M4.t(i * w * 0.18, sy * (h + 0.22), nz.z + 0.2));
          pb.add('glow', rbox(w * 1.9, 0.02, 0.02, 0.006), M4.t(0, sy * (h + 0.065), nz.z - 0.012));
        }
      }
    } else {
      const th = big ? 0.07 : 0.035, r0 = nz.r0 + 0.012, r1 = nz.r1 + 0.012, zA = nz.z + 0.03, zB = nz.z + 0.27;
      pb.add('steel', lathe(prof([[r0, zA, 1], [r0 + th, zA + 0.02], [r1 + th, zB - 0.02], [r1, zB, 1]]), seg, 0)); // follows the tail cone
      pb.add('copper', torus(r0 + th * 0.55, 0.016, 5, seg), M4.t(0, 0, zA - 0.004));
      if (big) {
        pb.add('dark', radial(() => rbox(0.022, 0.1, 0.2, 0.006).translate(0, (r0 + r1) / 2 + th + 0.035, (zA + zB) / 2), 14));
        pb.add('glow', torus(r0 + th + 0.012, 0.018, 5, seg), M4.t(0, 0, zA + 0.03));
      }
    }
  }
  // ---- Beschleunigung: ram scoops on the intake rim → two supercharger scoops with feed pipes
  if (T.accel >= 1) {
    const big = T.accel >= 2;
    const scoop = (m: THREE.Matrix4, k: number) => { pb.add('steel', rbox(0.2 * k, 0.11 * k, 0.4 * k, 0.03), m); pb.add('dark', rbox(0.15 * k, 0.07 * k, 0.02, 0.004), m.clone().multiply(M4.t(0, 0.004, 0.2 * k))); };
    if (mo.slot) {
      const [w, h] = mo.slot;
      for (const fx of [-0.7, -0.25, 0.25, 0.7]) scoop(M4.t(fx * w, h + 0.15, mo.z - 0.24), 1);
      if (big) for (const fx of [-0.5, 0.5]) {
        scoop(M4.t(fx * w, h + 0.3, mo.z - 0.75), 1.6);
        pb.add('copper', tube([V(fx * w, h + 0.3, mo.z - 1.1), V(fx * w * 1.1, bd.r + 0.07, mo.z - 1.7), V(fx * w * 0.9, bd.r, bd.zB - 0.2)], 0.035, 8, 5));
      }
    } else {
      for (const a of [-1.2, -0.6, 0.6, 1.2]) scoop(onBody(a, mo.r + 0.045 * s, mo.z - 0.24 * s), s);
      if (big) for (const a of [-0.9, 0.9]) {
        const k = 1.7 * s, z0 = mo.z - 0.5 * s - 0.22 * k;
        scoop(onBody(a, mo.r + 0.11 * k, z0), k);
        pb.add('copper', tube([P(a, mo.r + 0.08 * k, z0 - 0.2 * k), P(a, Math.max(mo.r, bd.r) + 0.1 * s, (z0 + bd.zB) / 2), P(a, bd.r + 0.03, bd.zB)], 0.03 * s + 0.008, 8, 5));
      }
    }
  }
  // ---- Kühlung: heat-sink fin ring → radiator panels with coolant lines
  if (T.cooling >= 1) {
    const big = T.cooling >= 2;
    if (flat) {
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 9; i++) pb.add('dark', rbox(0.02, 0.1, 0.34, 0.006), M4.t(sd * (0.36 + i * 0.065) * W, bd.r + 0.05, bd.zA + len * 0.86));
        if (big) {
          const m = M4.t(sd * 0.62 * W, bd.r * 0.93 + 0.07, bd.zB + 0.1 * len);
          pb.add('dark', rbox(0.44 * W, 0.09, 0.8, 0.02), m);
          for (let i = 0; i < 6; i++) pb.add('steel', rbox(0.46 * W, 0.03, 0.016, 0.004), m.clone().multiply(M4.t(0, 0.05, (i - 2.5) * 0.12)));
          pb.add('copper', tube([V(sd * 0.62 * W, bd.r + 0.1, bd.zB - 0.3), V(sd * 0.75 * W, bd.r + 0.08, zm), V(sd * 0.78 * W, bd.r + 0.03, bd.zA + 0.3 * len)], 0.024, 8, 5));
        }
      }
    } else {
      const zc = bd.zA + 0.16 * len, fl = Math.min(0.42, len * 0.3);
      pb.add('dark', radial(() => rbox(0.02, 0.13 * s, fl, 0.006).translate(0, bd.r + 0.055 * s, zc), 16, 0.2));
      if (big) for (const sd of [-1, 1]) {
        const a = sd * 0.56, m = onBody(a, bd.r + 0.17 * s, zm), pl = Math.max(0.5, len * 0.5);
        pb.add('dark', rbox(0.44 * s, 0.05, pl, 0.02), m);
        for (let i = 0; i < 6; i++) pb.add('steel', rbox(0.46 * s, 0.03, 0.016, 0.004), m.clone().multiply(M4.t(0, 0.03, (i - 2.5) * pl * 0.16)));
        for (const dz of [-0.36, 0.36]) pb.add('steel', cyl(0.024, 0.024, 0.17 * s, 5), onBody(a, bd.r + 0.085 * s, zm + dz * pl));
        pb.add('copper', tube([P(a, bd.r + 0.15 * s, zm - 0.5 * pl), P(a * 1.5, bd.r + 0.1 * s, zm - 0.5 * pl - 0.15), P(a * 1.9, bd.r + 0.03, zm - 0.5 * pl - 0.28)], 0.02 * s + 0.006, 8, 5));
      }
    }
  }
  // ---- Wendigkeit: two canards behind the intake → four control vanes with actuators round the nozzle
  if (T.turn >= 1) {
    const c = clamp(0.45 * bd.r + 0.15, 0.3, 0.6);
    for (const sd of [-1, 1]) pb.add('hull', wing(0.5, 0.3, c, 0.22, 0.035), mo.slot ? M4.trs(sd * (mo.slot[0] + 0.1), 0, mo.z - 0.5, 0, 0, -sd * 1.25) : onBody(sd * 0.96, mo.r - 0.03, mo.z - 0.4), SEC);
    if (T.turn >= 2) for (const sd of [-1, 1]) for (const up of [1, -1]) {
      const m = flat ? M4.trs(sd * 0.4 * W, up * bd.r * 0.84, nz.z + 0.95, 0, 0, up > 0 ? 0 : Math.PI) : onBody(sd * (up > 0 ? 0.785 : 2.356), nz.r1 - 0.015, nz.z + 0.62);
      pb.add('hull', wing(0.42, 0.26, flat ? 0.18 : 0.32 * s + 0.06, 0.16, 0.03), m, SEC);
      pb.add('chrome', cyl(0.014, 0.014, 0.3, 5).rotateX(HALF), m.clone().multiply(M4.t(0.03, 0.05, 0.12)));
    }
  }
  // ---- Traktion: long belly repulsor with skid rails → twin outrigger repulsor pads
  if (T.traction >= 1) {
    const w = flat ? W * 1.1 : 0.5 * bd.r, yb = -(bd.r * (flat ? 0.9 : 1)) - 0.05 * s - 0.03;
    pb.add('dark', rbox(w, 0.06, len * 0.8, 0.02), M4.t(0, yb, zm));
    pb.add('glow', rbox(w * 0.66, 0.03, len * 0.72, 0.008), M4.t(0, yb - 0.04, zm));
    for (const sd of [-1, 1]) pb.add('steel', tube([V(sd * w * 0.6, yb + 0.012, zm - len * 0.43), V(sd * w * 0.6, yb + 0.012, zm + len * 0.43)], 0.022, 1, 5));
    if (T.traction >= 2) for (const sd of [-1, 1]) for (const fz of [-0.27, 0.27]) {
      const a = sd * (Math.PI - 0.72), m = flat ? M4.trs(sd * W * 0.82, yb + 0.03, zm + fz * len, 0, 0, Math.PI) : onBody(a, bd.r + 0.17 * s, zm + fz * len);
      pb.add('dark', sphere(0.19 * s + 0.04, 10, 5, 0, Math.PI * 2, 0, HALF), m.clone().multiply(M4.trs(0, -0.02, 0, 0, 0, 0, 1, 0.45, 1.5)));
      pb.add('glow', cyl(0.11 * s + 0.02, 0.11 * s + 0.02, 0.02, 10), m.clone().multiply(M4.t(0, 0.075 * s + 0.012, 0)));
      if (!flat) pb.add('steel', cyl(0.03, 0.03, 0.2 * s, 5), onBody(a, bd.r + 0.07 * s, zm + fz * len));
    }
  }
  // ---- Luftbremse: larger flaps → double flaps (a second, outer leaf that opens further) with hinge and ram
  let flaps = eg.flaps;
  if (T.airbrake >= 1) {
    flaps = eg.flaps.map(f => ({ ...f, geo: f.geo.clone().scale(1, 1.25, 1.25) }));
    if (T.airbrake >= 2) for (const f of eg.flaps) {
      f.geo.computeBoundingBox(); const bb = f.geo.boundingBox!, th = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, out = -f.sign;
      flaps.push({ geo: f.geo.clone().scale(1, 0.9, 0.7).translate(out * (th + 0.012), 0, 0), pivot: f.pivot, sign: f.sign, gain: 1.6 });
      pb.add('chrome', cyl(0.02, 0.02, h * 1.1, 6), M4.t(f.pivot.x + out * (th + 0.03), f.pivot.y, f.pivot.z + 0.02));
      pb.add('chrome', cyl(0.016, 0.016, 0.3, 5).rotateX(HALF), M4.t(f.pivot.x + out * (th * 0.5 + 0.02), f.pivot.y + h * 0.62, f.pivot.z - 0.2));
    }
  }
  // ---- Reparatur: armour doubler plates → repair unit on the cable pylon (tool box, folded arm, status light)
  if (T.repair >= 1) {
    for (const sd of [-1, 1]) {
      if (flat) pb.add('hull', rbox(0.5 * W, 0.03, len * 0.42, 0.008), M4.t(sd * 0.56 * W, bd.r + 0.012, zm - 0.05 * len), SEC);
      else {
        const r0 = bd.r + 0.05 * s + 0.012, r1 = r0 + 0.035, zA = zm - 0.24 * len, zB = zm + 0.24 * len;
        pb.add('hull', lathe(prof([[r1, zA, 1], [r1, zB, 1], [r0, zB, 1], [r0, zA, 1], [r1, zA]]), Math.max(4, Math.round(seg * 0.12)), 3, sd * 1.2 - 0.22, 0.44));
      }
      if (hi) for (const fz of [-0.2, 0.2]) pb.add('chrome', cyl(0.016, 0.016, 0.014, 6), flat ? M4.t(sd * 0.56 * W, bd.r + 0.03, zm + fz * len) : onBody(sd * 1.2, bd.r + 0.05 * s + 0.05, zm + fz * len));
    }
    if (T.repair >= 2) {
      const p = eg.pylon;
      pb.add('dark', rbox(0.2, 0.22, 0.3, 0.03), M4.t(-0.19, p.y - 0.26, p.z));
      pb.add('glow', sphere(0.025, 6, 4), M4.t(-0.3, p.y - 0.2, p.z + 0.1));
      pb.add('chrome', tube([V(-0.19, p.y - 0.15, p.z), V(-0.24, p.y + 0.12, p.z - 0.06), V(-0.12, p.y + 0.2, p.z - 0.3), V(-0.1, p.y + 0.08, p.z - 0.42)], 0.02, 10, 5));
      pb.add('steel', torus(0.04, 0.012, 4, 8, Math.PI * 1.4), M4.trs(-0.1, p.y + 0.05, p.z - 0.44, 0, HALF, 0));
    }
  }

  // ================================================================ Style-Teile
  // ---- Finnen: Haifinne (one dorsal fin ahead of the pylon) · Doppel-Leitwerk (twin fins astride the cable) · Pfeilflügel (swept wings)
  if (kit.fins === 1) {
    const h = clamp(0.9 * bd.r + 0.3, 0.5, 1.25), a = sp.zA, b = Math.max(sp.zB, sp.zA + 0.5);
    pb.add('hull', plateYZ([[b, 0], [a, 0], [a + 0.05, h], [a + 0.32 * (b - a), h * 1.04]], 0.06), M4.t(0, sp.y - 0.04, 0), SEC);
    if (hi) pb.add('glow', sphere(0.03, 6, 4), M4.t(0, sp.y + h * 1.02, a + 0.1));
  } else if (kit.fins === 2) {
    const h = clamp(0.8 * bd.r + 0.3, 0.45, 1.1);
    for (const sd of [-1, 1]) pb.add('hull', plateYZ([[0.9, 0], [0, 0], [-0.3, h], [0.18, h * 1.03]], 0.05), flat ? M4.trs(sd * 0.3 * W, tl.y - 0.03, tl.z + 0.5, 0, 0, -sd * 0.3) : onBody(sd * 0.56, tl.y - 0.03, tl.z), SEC);
  } else if (kit.fins === 3) {
    const a0 = 0.87, span = clamp(Math.min(0.6 * bd.r + 0.25, (hp.sideMax + 0.12) / Math.sin(a0) - bd.r), 0.3, 0.95), cr = clamp(len * 0.5, 0.8, 1.8);
    for (const sd of [-1, 1]) {
      const m = flat ? M4.trs(sd * W * 0.92, 0.12, zm + cr * 0.45, 0, 0, -sd * a0) : onBody(sd * a0, bd.r - 0.03, zm + cr * 0.45);
      pb.add('hull', wing(cr, cr * 0.38, span, cr * 0.62, 0.045), m, SEC);
      pb.add('steel', rbox(0.06, 0.05, cr * 0.42, 0.012), m.clone().multiply(M4.t(0, span, -cr * 0.81)));
    }
  }
  // ---- Einlass: Gitter (guard grille) · Langer Dorn (long nose spike) · Irisblende (shutter blades)
  if (kit.intake === 1) {
    if (mo.slot) {
      const [w, h] = mo.slot, z = mo.z + 0.1;
      for (let i = -4; i <= 4; i++) pb.add('steel', rbox(0.025, h * 2 + 0.06, 0.03, 0.006), M4.t(i * w * 0.22, 0, z));
      for (const fy of [-0.5, 0, 0.5]) pb.add('steel', rbox(w * 2 + 0.06, 0.02, 0.03, 0.006), M4.t(0, fy * h * 1.3, z + 0.012));
    } else {
      const z = mo.z + 0.06, r = mo.ri * 1.03, tb = 0.012 * s + 0.007;
      for (const f of [1, 0.66, 0.36]) pb.add('steel', torus(r * f, f === 1 ? tb * 1.8 : tb, 5, seg), M4.t(0, 0, z));
      pb.add('steel', radial(() => cyl(tb, tb, r * 0.66, 5).translate(0, r * 0.67, z), 8));
    }
  } else if (kit.intake === 2) {
    const z = hp.spikeZ, r = 0.05 * s + 0.012;
    pb.add('chrome', lathe(prof([[r, z - 0.3, 1], [r * 0.62, z + 0.25], [0.012, z + 1.0], [0, z + 1.15]]), 8, 0));
    pb.add('dark', torus(r * 0.95, 0.014, 5, 10), M4.t(0, 0, z - 0.05));
    pb.add('glow', sphere(0.022, 6, 4), M4.t(0, 0, z + 1.14));
  } else if (kit.intake === 3) {
    if (mo.slot) {
      const [w, h] = mo.slot, z = mo.z + 0.09;
      for (const sy of [-1, 1]) pb.add('dark', rbox(w * 2 + 0.04, h * 0.62, 0.025, 0.006), M4.trs(0, sy * h * 0.72, z, sy * 0.18, 0, 0));
      pb.add('steel', rbox(w * 2 + 0.1, 0.03, 0.04, 0.008), M4.t(0, 0, z + 0.01));
    } else {
      // eight metal leaves, each twisted about its radial axis so that it laps over the next one like a real shutter
      const z = mo.z + 0.05, ro = mo.ri * 1.03, n = 8, w = ro * Math.sin(Math.PI / n), d = ro * 0.42, sh = w * 0.34, tw = 0.16; // outer corners lie on the ring
      pb.add('steel', torus(ro, 0.022 * s + 0.01, 5, seg), M4.t(0, 0, z));
      pb.add('steel', radial(() => extrude([[-w, 0], [w, 0], [w * 0.4 + sh, -d], [-w * 0.9 + sh, -d]], 0.014, 0).rotateY(tw).translate(0, ro * Math.cos(Math.PI / n), z + w * Math.sin(tw)), n));
      pb.add('dark', radial(() => rbox(w * 1.5, 0.02, 0.012, 0.004).rotateY(tw).translate(sh * 0.5, ro * Math.cos(Math.PI / n) - d, z + w * Math.sin(tw) + 0.012), n)); // dark lip on the inner edge
      if (hi) pb.add('chrome', radial(() => cyl(0.018 * s + 0.008, 0.018 * s + 0.008, 0.035, 6).rotateX(HALF).translate(0, ro, z + 0.024), n, Math.PI / n)); // leaf pivots
    }
  }
  // ---- Düse: Lang (afterburner can round the petals) · Schubvektor-Paddel (paddles on arms) · Zackenkrone (crown of teeth)
  if (kit.nozzle === 1) {
    if (nz.slot) {
      const [w] = nz.slot, ho = nz.open + 0.07, zA = nz.z + 0.1, zE = nz.tipZ - 0.5, dz = zA - zE;
      for (const sy of [-1, 1]) { pb.add('steel', rbox(w * 2 + 0.3, 0.04, dz, 0.012), M4.t(0, sy * ho, (zA + zE) / 2)); pb.add('glow', rbox(w * 2 + 0.2, 0.02, 0.02, 0.006), M4.t(0, sy * (ho - 0.04), zE + 0.03)); }
      for (const sx of [-1, 1]) pb.add('steel', rbox(0.04, ho * 2, dz, 0.012), M4.t(sx * (w + 0.15), 0, (zA + zE) / 2));
    } else {
      const ro = nz.open + 0.08, zA = nz.z + 0.1, zE = nz.tipZ - 0.55;
      pb.add('steel', lathe(prof([[ro - 0.04, zE, 1], [ro - 0.01, zE + 0.5], [ro, zA - 0.06], [ro - 0.03, zA, 1]]), seg, 0));
      pb.add('dark', lathe(prof([[ro - 0.06, zA], [ro - 0.04, zA - 0.06], [ro - 0.05, zE + 0.5], [ro - 0.08, zE, 1], [ro - 0.04, zE]]), seg, 0));
      pb.add('glow', torus(ro - 0.075, 0.018, 5, seg), M4.t(0, 0, zE + 0.03));
      pb.add('steel', radial(() => rbox(0.05, ro - nz.r1 + 0.03, 0.1, 0.012).translate(0, (ro + nz.r1) / 2 - 0.03, zA + 0.05), 4, Math.PI / 4));
    }
  } else if (kit.nozzle === 2) {
    const rp = nz.open + 0.1, zP = nz.tipZ - 0.32, pw = nz.slot ? nz.slot[0] * 1.5 : 0.5 * s + 0.12;
    for (const a of nz.slot ? [0, Math.PI] : [0, 2.094, -2.094]) {
      pb.add('dark', rbox(pw, 0.04, 0.62, 0.015), onBody(a, rp, zP));
      pb.add('steel', rbox(0.07, 0.06, nz.z + 0.22 - zP, 0.015), onBody(a, rp + 0.045, (nz.z + 0.22 + zP) / 2));
      pb.add('steel', rbox(0.07, Math.max(0.05, rp + 0.04 - nz.r1), 0.07, 0.015), onBody(a, (rp + 0.04 + nz.r1) / 2, nz.z + 0.2));
      pb.add('chrome', cyl(0.02, 0.02, pw * 0.8, 6).rotateZ(HALF), onBody(a, rp + 0.03, zP + 0.3));
    }
  } else if (kit.nozzle === 3) {
    const rc = nz.open + 0.07, zA = nz.z + 0.06, tl2 = zA - (nz.tipZ - 0.2);
    if (nz.slot) {
      const [w] = nz.slot, n = 7;
      for (const sy of [-1, 1]) {
        pb.add('steel', rbox(w * 2 + 0.1, 0.03, 0.08, 0.008), M4.t(0, sy * rc, zA));
        for (let i = 0; i < n; i++) pb.add('steel', extrude([[-w / n, 0], [w / n, 0], [0, tl2]], 0.025, 0.006).rotateX(-HALF), M4.t((i - (n - 1) / 2) * 2 * w / n, sy * rc, zA));
      }
    } else {
      const n = 12, tw = rc * Math.tan(Math.PI / n) * 0.96;
      pb.add('steel', torus(rc, 0.03, 5, seg), M4.t(0, 0, zA));
      pb.add('steel', radial(() => extrude([[-tw, 0], [tw, 0], [0, tl2]], 0.025, 0.006).rotateX(-HALF).translate(0, rc, zA), n));
      pb.add('steel', radial(() => rbox(0.05, Math.max(0.05, rc - nz.r1 + 0.02), 0.08, 0.012).translate(0, (rc + nz.r1) / 2 - 0.02, zA + 0.04), 4, Math.PI / 4));
    }
  }

  const out: EngineKit = { parts: pb.build(), flaps };
  { const hull = out.parts.get('hull'); if (hull) heatAlong(hull, -spec.L / 2, spec.L); } // kit plates and fins glow by their place along the engine
  if (flaps !== eg.flaps) for (const f of flaps) heatAlong(f.geo, -spec.L / 2, spec.L, f.pivot.z);
  cache.set(key, out);
  return out;
}
