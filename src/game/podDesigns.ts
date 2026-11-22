// Physics shapes of a pod, derived from its layout: collision circles and the ground-clearance envelope (plus the measured box round it).
// (Layouts live in podLayouts.ts, cockpits in podCockpits.ts, engines in podParts.ts.)
import type { PodDef } from './data';
import { engineExtent } from './podParts';
import { podLayout, type CollCircle } from './podLayouts';

export type { CollCircle } from './podLayouts';

// ------------------------------------------------------------------ collision shape
const collCache = new Map<string, { circles: CollCircle[]; halfW: number }>();
/** Collision circles derived from the visual layout: two per engine + the layout's extra circles (wide wings) + cockpit. */
export function podCollision(def: PodDef) {
  const hit = collCache.get(def.id); if (hit) return hit;
  const L = podLayout(def); const bz = -L.cockpit.z * 0.25;
  const circles: CollCircle[] = [];
  for (const e of L.engines) {
    const side = e.x < 0 ? -1 : 1;
    const R = engineExtent(e.spec).coll;
    for (const f of [0.3, -0.3]) circles.push({ x: e.x, z: e.z + e.spec.L * f + bz, r: R, side });
  }
  for (const c of L.extraCircles ?? []) circles.push({ x: c.x, z: c.z + bz, r: c.r, side: c.side });
  circles.push({ x: 0, z: L.cockpit.z + bz, r: L.cockpit.hw * 1.05, side: 0 });
  let halfW = 0; for (const c of circles) halfW = Math.max(halfW, Math.abs(c.x) + c.r);
  const out = { circles, halfW }; collCache.set(def.id, out); return out;
}

/** Exact 3D ground-clearance envelope in group-local space (accounts for body.position.z, cowling radius, rings & wings). */
export interface PodEnvelope {
  engL: EnvSide;
  engR: EnvSide;
  cockpit: { z: number; /** ground-clamp floor (visible tub floor minus the layout's `keel`) */ minY: number; /** where the strobe light sits (not the pod's height – that is `top`) */ topY: number };
  /** overall length from the cockpit tail to the foremost engine front (camera framing) */
  length: number;
  /** the box round the visible pod (tunnel ceilings), see `POD_BOX`: highest solid point above the pod origin of the left engine side,
   *  the right engine side (both with the engines at rest – their vertical travel `engYL` / `engYR` comes on top) and the cockpit,
   *  and the half width of the model */
  box: { topL: number; topR: number; topCockpit: number; halfW: number };
}
/** `axisY` = height of the lowest engine axis of this side (nav lights sit there). */
export interface EnvSide { x: number; outerX: number; frontZ: number; backZ: number; minY: number; axisY: number }
/** The box round every pod model in metres from its origin: [top of the left engine side, top of the right engine side, top of the
 *  cockpit, half width] – the highest / outermost solid point of the model in its largest outfit, i.e. the factory pod with any
 *  Style-Teile and Tuning-Teile mounted (the Haifinne on the engine spine, the Pfeilflügel). A pod always counts as its largest
 *  outfit: Teile never change how a pod drives, and none of them ends up inside a tunnel vault.
 *  Measured on the meshes, not derived: the highest point is a cable pylon, a mast light, a spire or Vrak's shark fin, the outermost
 *  one a wing tip – parts that no extent formula knows (the half width is up to 0.4 m more than `EnvSide.outerX`). The pod audit
 *  (`npm run check:pods`, column `box`) measures every pod again and fails when a number is more than 2 cm too small or 5 cm too
 *  large, or when a pod has no row; it prints the measured row to copy in here. */
export const POD_BOX: Record<string, readonly [number, number, number, number]> = {
  aurora: [2.46, 2.46, 1.65, 4.55], brute: [4.18, 2.81, 2.53, 4.20], gasvaro: [3.43, 3.43, 1.58, 4.49], bomquad: [3.56, 3.56, 1.71, 3.20],
  mavik: [1.43, 1.43, 1.97, 2.64], rattis: [1.89, 1.89, 1.73, 3.55], aldo: [2.26, 2.26, 1.63, 3.64], teemo: [3.96, 3.96, 2.13, 3.82],
  elana: [1.71, 1.71, 2.24, 3.25], odo: [2.56, 2.56, 2.32, 3.97], cyclone: [2.55, 2.55, 2.42, 4.68], halo: [1.77, 1.77, 2.05, 4.61],
  manta: [1.50, 1.50, 1.77, 4.56], volt: [2.24, 2.24, 3.13, 3.77],
};
const envCache = new Map<string, PodEnvelope>();
export function podEnvelope(def: PodDef): PodEnvelope {
  const hit = envCache.get(def.id); if (hit) return hit;
  const L = podLayout(def); const bz = -L.cockpit.z * 0.25;
  const sideEnv = (sign: number): EnvSide => {
    const ms = L.engines.filter(e => (e.x < 0 ? -1 : 1) === sign);
    let sx = 0, outerX = 0, frontZ = -1e9, backZ = 1e9, minY = 0, axisY = 1e9;
    for (const e of ms) {
      const x = engineExtent(e.spec);
      sx += e.x;
      outerX = Math.max(outerX, Math.abs(e.x) + x.side);
      frontZ = Math.max(frontZ, e.z + bz + x.halfL);
      backZ = Math.min(backZ, e.z + bz - x.halfL);
      minY = Math.min(minY, e.y - x.bottom);
      axisY = Math.min(axisY, e.y);
    }
    if (L.envelope?.outerX !== undefined) outerX = Math.max(outerX, L.envelope.outerX);
    if (L.envelope?.minY !== undefined) minY = Math.min(minY, L.envelope.minY);
    return { x: sx / Math.max(1, ms.length), outerX: sign * outerX, frontZ, backZ, minY, axisY: ms.length ? axisY : 0 };
  };
  const ck = L.cockpit; const floorY = ck.y - ck.hw * 0.68 - 0.14; // lowest point of the visible tub
  const engL = sideEnv(-1), engR = sideEnv(1);
  const row = POD_BOX[def.id];
  const guess = (sign: number) => Math.max(0, ...L.engines.filter(e => (e.x < 0 ? -1 : 1) === sign).map(e => e.y + engineExtent(e.spec).top)) + 2;
  const out: PodEnvelope = {
    engL, engR,
    // the ground clamp may reach deeper than the tub (`keel`: raised cockpits keep their old clamp); the strobe sits on the visible cockpit
    cockpit: { z: ck.z + bz, minY: floorY - (ck.keel ?? 0), topY: ck.topY !== undefined ? ck.y + ck.topY : floorY + 1.75 },
    length: Math.max(engL.frontZ, engR.frontZ) - (ck.z + bz - ck.len * 0.5),
    // a pod without a row (a new one being built – the audit refuses it until its row is measured) gets a rough guess:
    // 2 m above the body of its highest engine, 3.5 m above the cockpit origin, 0.6 m wider than the ground-clearance envelope
    box: row ? { topL: row[0], topR: row[1], topCockpit: row[2], halfW: row[3] }
      : { topL: guess(-1), topR: guess(1), topCockpit: ck.y + 3.5, halfW: Math.max(-engL.outerX, engR.outerX) + 0.6 },
  };
  envCache.set(def.id, out);
  return out;
}

/** How far the pod reaches above its origin in its present attitude (tunnel ceilings): the taller of the cockpit roof and the two
 *  engine sides – each side with its vertical travel `liftL` / `liftR` (`engYL` / `engYR`) – turned by the knife-edge roll `roll`
 *  (radians). Upright that is the measured top, at 90° the half width, in between the upper outer corner of the box round the pod. */
export function podHeight(env: PodEnvelope, liftL: number, liftR: number, roll: number) {
  const b = env.box;
  return Math.max(b.topCockpit, b.topL + liftL, b.topR + liftR) * Math.abs(Math.cos(roll)) + b.halfW * Math.abs(Math.sin(roll));
}
