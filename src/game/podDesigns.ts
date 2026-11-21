// Physics shapes of a pod, derived from its layout: collision circles and the ground-clearance envelope.
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
  cockpit: { z: number; /** ground-clamp floor (visible tub floor minus the layout's `keel`) */ minY: number; /** highest solid point (strobe light) */ topY: number };
  /** overall length from the cockpit tail to the foremost engine front (camera framing) */
  length: number;
}
/** `axisY` = height of the lowest engine axis of this side (nav lights sit there). */
export interface EnvSide { x: number; outerX: number; frontZ: number; backZ: number; minY: number; axisY: number }
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
  const out: PodEnvelope = {
    engL, engR,
    // the ground clamp may reach deeper than the tub (`keel`: raised cockpits keep their old clamp); the strobe sits on the visible cockpit
    cockpit: { z: ck.z + bz, minY: floorY - (ck.keel ?? 0), topY: ck.topY !== undefined ? ck.y + ck.topY : floorY + 1.75 },
    length: Math.max(engL.frontZ, engR.frontZ) - (ck.z + bz - ck.len * 0.5),
  };
  envCache.set(def.id, out);
  return out;
}
