// Physics shapes of a pod, derived from its layout: collision circles and the ground-clearance envelope (plus the measured hull round it).
// (Layouts live in podLayouts.ts, cockpits in podCockpits.ts, engines in podParts.ts.)
import type { PodDef } from './data';
import { engineExtent } from './podParts';
import { podLayout, type CollCircle } from './podLayouts';
import HULLS from './podHulls.json';

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
  cockpit: { z: number; /** ground-clamp floor (visible tub floor minus the layout's `keel`) */ minY: number; /** where the strobe light sits (not the pod's height – that is the `hull`) */ topY: number };
  /** overall length from the cockpit tail to the foremost engine front (camera framing) */
  length: number;
  /** z of the body origin in the pod's frame (the model's `body.position.z`): pitch and roll turn the pod about this point */
  bodyZ: number;
  /** the hull round the visible pod (tunnel vaults, overhead structures) – see `podHulls.json`: the corner points of the slabs of the
   *  left engine side, the right engine side and the cockpit as x, y, z triples in body space, engines and cockpit at rest (the
   *  engines' travel `engYL` / `engYR` and the cockpit's sway come on top – `hullWorld` in physics.ts) */
  hull: { L: Float32Array; R: Float32Array; ck: Float32Array };
}
/** `axisY` = height of the lowest engine axis of this side (nav lights sit there). */
export interface EnvSide { x: number; outerX: number; frontZ: number; backZ: number; minY: number; axisY: number }
/** The hull round every pod model (`podHulls.json`): per part – left engine side, right engine side, cockpit – a row of slabs across
 *  the pod, `HULL_SLAB` metres wide; a slab is the outline of its side view (upper edge from back to front) pushed through its width.
 *  The model in its largest outfit lies inside – the factory pod with any Style-Teile and Tuning-Teile mounted (the Haifinne on the
 *  engine spine, the Pfeilflügel). A pod always counts as its largest outfit: Teile never change how a pod drives, and none of them
 *  ends up inside a tunnel vault.
 *  Measured on the meshes, not derived: the highest point is a cable pylon, a mast light, a spire or Vrak's shark fin, the foremost one
 *  an intake spike – parts that no extent formula knows. The pod audit (`npm run check:pods`, column `hull`) fails when the model
 *  reaches out of its hull, when the hull is stale or when a pod has none; `HULL=write npm run check:pods` measures all of them again. */
export const HULL_SLAB = 3;
/** How the cockpit hangs in its cables (podModel `setCockpitSway`): besides being shifted it leans by this much per metre of sideways
 *  (roll) and of fore-and-aft (pitch) travel – about the body origin. One place for the model and for the hull (`hullWorld`). */
export const COCKPIT_SWAY = { roll: 0.14, pitch: 0.07 };
/** Corner points of a part's slabs: both sides of every corner of the upper outline, and of the two lower ends. */
function hullCorners(slabs: readonly (readonly number[])[]) {
  const out: number[] = [];
  for (const r of slabs) {
    const x0 = r[0], x1 = r[1], y0 = r[2], n = r.length;
    for (let i = 3; i + 1 < n; i += 2) out.push(x0, r[i + 1], r[i], x1, r[i + 1], r[i]);
    out.push(x0, y0, r[3], x1, y0, r[3], x0, y0, r[n - 2], x1, y0, r[n - 2]);
  }
  return new Float32Array(out);
}
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
  const row = (HULLS.pods as Record<string, { L: number[][]; R: number[][]; ck: number[][] } | undefined>)[def.id];
  // a pod without a hull (a new one being built – the audit refuses it until its hull is measured) gets a rough box per part:
  // 2 m above the body of its highest engine, 3.5 m above the cockpit origin, 0.6 m more than the ground-clearance envelope all round
  const guess = (sign: number, e: EnvSide) => {
    const top = Math.max(0, ...L.engines.filter(q => (q.x < 0 ? -1 : 1) === sign).map(q => q.y + engineExtent(q.spec).top)) + 2;
    return [[Math.min(0, e.outerX - 0.6), Math.max(0, e.outerX + 0.6), e.minY - 0.6, e.backZ - bz - 0.6, top, e.frontZ - bz + 0.6, top]];
  };
  const out: PodEnvelope = {
    engL, engR,
    // the ground clamp may reach deeper than the tub (`keel`: raised cockpits keep their old clamp); the strobe sits on the visible cockpit
    cockpit: { z: ck.z + bz, minY: floorY - (ck.keel ?? 0), topY: ck.topY !== undefined ? ck.y + ck.topY : floorY + 1.75 },
    length: Math.max(engL.frontZ, engR.frontZ) - (ck.z + bz - ck.len * 0.5),
    bodyZ: bz,
    hull: row ? { L: hullCorners(row.L), R: hullCorners(row.R), ck: hullCorners(row.ck) }
      : { L: hullCorners(guess(-1, engL)), R: hullCorners(guess(1, engR)),
        ck: hullCorners([[-ck.hw - 0.6, ck.hw + 0.6, floorY - (ck.keel ?? 0) - 0.6, ck.z - ck.len * 0.5 - 0.6, ck.y + 3.5, ck.z + ck.len * 0.5 + 0.6, ck.y + 3.5]]) },
  };
  envCache.set(def.id, out);
  return out;
}
