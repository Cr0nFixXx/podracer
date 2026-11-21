// Pod layouts: where the engines sit, which cockpit hangs behind them, how they are coupled, and each pod's own extra parts.
// One entry per pod id in LAYOUTS. Pure data + geometry callbacks (no materials, no three/webgpu – bundled into the node CI).
import * as THREE from 'three';
import type { PodDef } from './data';
import type { EngineSpec } from './podParts';
import { PartBuilder, M4, extrude, rbox, tube } from './podKit';

export type CockpitStyle = 'pod' | 'wedge' | 'saucer' | 'long';
export interface EngineMount { spec: EngineSpec; x: number; y: number; z: number; }
/** Energy binder between two engines (indices into `engines`). `zOff` shifts both ends along the engines (m): several arcs on one pair. */
export interface BinderLink { a: number; b: number; zOff?: number }
/** Collision circle in pod-local (group) space, side -1 = left engines (hpL), +1 = right, 0 = cockpit. */
export interface CollCircle { x: number; z: number; r: number; side: number }
export interface PodLayout {
  engines: EngineMount[];
  cockpit: {
    style: CockpitStyle; hw: number; len: number; y: number; z: number; pilot: number;
    /** cockpit design id (podCockpits.ts); default = the generic cockpit of `style` */
    design?: string;
    /** highest solid point above the cockpit origin (strobe light); default 1.75 m above the ground-clamp floor */
    topY?: number;
  };
  /** energy binders; the first one is the pod's main coupling */
  binders: BinderLink[];
  livery: number;
  /** extra parts that ride with the engine banks (the player model splits them by side) */
  engineExtras?: (pb: PartBuilder, L: PodLayout) => void;
  /** extra parts fixed to the cockpit */
  cockpitExtras?: (pb: PartBuilder, L: PodLayout) => void;
  /** additional collision circles besides engines + cockpit (wide wings …); `z` in layout space like the engine mounts */
  extraCircles?: CollCircle[];
  /** widens the ground-clearance envelope of both engine sides: outermost |x| and lowest y of parts the engine formulas do not know */
  envelope?: { outerX?: number; minY?: number };
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const spec = (L: number, R: number, style: EngineSpec['style'], bands: number, blades: number, spike = true, fins = 0): EngineSpec => ({ L, R, style, bands, blades, spike, fins });
const pair = (s: EngineSpec, sp: number, y: number, z: number): EngineMount[] => [{ spec: s, x: -sp, y, z }, { spec: s, x: sp, y, z }];
const MAIN: BinderLink[] = [{ a: 0, b: 1 }];

const LAYOUTS: Record<string, (def: PodDef) => PodLayout> = {
  aurora: () => {
    const s = spec(9, 1.15, 'turbine', 6, 18);
    return {
      engines: pair(s, 2.5, 0, 4), cockpit: { style: 'pod', hw: 0.95, len: 3.4, y: 0.1, z: -6, pilot: 1 }, binders: MAIN, livery: 0,
      engineExtras: (pb) => { for (const sd of [-1, 1]) for (const s2 of [-1, 1]) { pb.add('hull', rbox(0.95, 0.08, 8.2, 0.03), M4.trs(sd * 2.5 + s2 * 1.5, -0.32, 4, 0, 0, s2 * -0.12), [0, 0, 3]); pb.add('steel', rbox(0.06, 0.12, 8.3, 0.02), M4.trs(sd * 2.5 + s2 * 1.97, -0.38, 4, 0, 0, s2 * -0.12)); } },
      // the wing plates reach further out and lower than the turbines
      extraCircles: [-1, 1].flatMap(sd => [2.5, -2.5].map(f => ({ x: sd * 4.0, z: 4 + f, r: 0.6, side: sd }))),
      envelope: { outerX: 4.45, minY: -0.62 },
    };
  },
  brute: () => {
    const s = spec(8, 1.5, 'split', 7, 20, false);
    return {
      engines: pair(s, 2.4, 0, 2), cockpit: { style: 'wedge', hw: 1.1, len: 3.0, y: 0.25, z: -9, pilot: 1.05 }, binders: MAIN, livery: 2,
      engineExtras: (pb) => {
        const fin = extrude([[0, 0], [2.2, 0], [2.7, 2.7], [1.6, 2.7]], 0.12, 0.03); fin.rotateY(Math.PI / 2);
        pb.add('hull', fin, M4.t(-2.4, 1.45, 1.2), [0, 0, 3]);
        pb.add('steel', rbox(0.3, 0.4, 1.6, 0.05), M4.t(-2.4, 1.6, 0.2));
      },
    };
  },
  gasvaro: () => {
    const s = spec(6, 0.8, 'quad', 4, 12);
    return {
      engines: [...pair(s, 1.6, 0, 3), ...pair(s, 3.4, 0, 3), ...pair(s, 2.5, 1.55, 4)], cockpit: { style: 'long', hw: 0.75, len: 3.6, y: 0, z: -7, pilot: 0.95 }, binders: MAIN, livery: 1,
      engineExtras: (pb) => { for (const sd of [-1, 1]) { pb.add('steel', tube([V(sd * 1.6, 0.7, 3.4), V(sd * 2.05, 1.3, 3.7), V(sd * 2.5, 2.1, 4)], 0.07, 12, 8)); pb.add('steel', tube([V(sd * 3.4, 0.7, 3.4), V(sd * 2.95, 1.3, 3.7), V(sd * 2.5, 2.1, 4)], 0.07, 12, 8)); } },
    };
  },
  bomquad: () => {
    // Session 17: four slim engines stacked 2 × 2 (upper pair directly above the lower pair), coupled by an X of energy binders
    const s = spec(7.6, 0.66, 'ring', 5, 12);
    return {
      engines: [{ spec: s, x: -2.3, y: -0.35, z: 3 }, { spec: s, x: 2.3, y: -0.35, z: 3 }, { spec: s, x: -2.3, y: 2.05, z: 3 }, { spec: s, x: 2.3, y: 2.05, z: 3 }],
      cockpit: { style: 'saucer', hw: 1.0, len: 2.4, y: 0.2, z: -6, pilot: 0.95 }, binders: [{ a: 0, b: 3 }, { a: 2, b: 1 }], livery: 3,
      engineExtras: (pb) => { for (const sd of [-1, 1]) for (const z of [1.0, 4.8]) pb.add('steel', tube([V(sd * 2.3, 0.35, z), V(sd * 2.3, 1.35, z)], 0.08, 4, 6)); },
    };
  },
  mavik: () => {
    const s = spec(8, 0.62, 'needle', 6, 10);
    return { engines: pair(s, 1.7, 0, 3), cockpit: { style: 'pod', hw: 0.72, len: 2.5, y: -0.05, z: -5.5, pilot: 0.92 }, binders: MAIN, livery: 1 };
  },
  rattis: () => {
    const s = spec(6, 0.85, 'blade', 4, 14);
    return { engines: pair(s, 1.7, 0, 2.5), cockpit: { style: 'wedge', hw: 0.78, len: 2.6, y: -0.1, z: -3.2, pilot: 0.92 }, binders: MAIN, livery: 2 };
  },
  aldo: () => {
    const s = spec(9, 1.0, 'long', 7, 16, true, 6);
    return { engines: pair(s, 2.3, 0, 3.5), cockpit: { style: 'long', hw: 0.85, len: 3.2, y: 0, z: -6, pilot: 1 }, binders: MAIN, livery: 0 };
  },
  teemo: () => {
    const s = spec(5, 1.25, 'heavy', 4, 20, true);
    return {
      engines: [{ spec: s, x: -2.3, y: -0.4, z: 0 }, { spec: s, x: 2.3, y: -0.4, z: 0 }, { spec: s, x: -2.3, y: 1.45, z: 6 }, { spec: s, x: 2.3, y: 1.45, z: 6 }],
      cockpit: { style: 'saucer', hw: 0.82, len: 2.2, y: 0.35, z: -5.5, pilot: 0.95 }, binders: MAIN, livery: 3,
      engineExtras: (pb) => { for (const sd of [-1, 1]) { pb.add('dark', rbox(0.3, 0.3, 3.6, 0.06), M4.trs(sd * 2.3, 0.55, 3.0, -0.31, 0, 0)); pb.add('hazard', rbox(0.32, 0.06, 1.2, 0.02), M4.trs(sd * 2.3, 0.73, 3.0, -0.31, 0, 0)); } },
    };
  },
  elana: () => {
    const s = spec(8.5, 0.78, 'needle', 6, 12);
    return {
      engines: pair(s, 2, 0, 3), cockpit: { style: 'long', hw: 0.8, len: 3.3, y: 0, z: -6, pilot: 0.95 }, binders: MAIN, livery: 1,
      cockpitExtras: (pb, L) => { const fin = extrude([[0, 0], [1.1, 0], [1.4, 1.3], [0.9, 1.3]], 0.07, 0.02); fin.rotateY(Math.PI / 2); pb.add('hull', fin, M4.t(0, L.cockpit.y + 0.3, L.cockpit.z - 0.7), [0, 0, 3]); },
    };
  },
  odo: () => { // ram
    const s = spec(7, 1.3, 'heavy', 5, 16, false);
    return {
      engines: pair(s, 2.4, 0, 3), cockpit: { style: 'wedge', hw: 1.0, len: 2.8, y: 0, z: -5.5, pilot: 1 }, binders: MAIN, livery: 2,
      cockpitExtras: (pb, L) => {
        const z = L.cockpit.z + L.cockpit.len * 0.5 + 0.35;
        pb.add('steel', rbox(3.0, 0.5, 0.35, 0.06), M4.trs(0, L.cockpit.y - 0.25, z, 0.35, 0, 0));
        pb.add('hazard', rbox(3.02, 0.16, 0.37, 0.03), M4.trs(0, L.cockpit.y - 0.08, z + 0.06, 0.35, 0, 0));
        for (const sd of [-1, 1]) pb.add('dark', rbox(0.12, 0.12, 0.9, 0.03), M4.t(sd * 0.9, L.cockpit.y - 0.3, z - 0.45));
      },
    };
  },
};

/** Layout of a pod. Every pod id needs its own entry – an unknown id is a bug (it used to build the Mandrel Ram silently). */
export function podLayout(def: PodDef): PodLayout {
  const make = LAYOUTS[def.id];
  if (!make) throw new Error(`No layout for pod "${def.id}" – add it to LAYOUTS in src/game/podLayouts.ts`);
  return make(def);
}
