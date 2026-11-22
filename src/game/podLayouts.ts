// Pod layouts: where the engines sit, which cockpit hangs behind them, how they are coupled, and each pod's own extra parts.
// One entry per pod id in LAYOUTS. Pure data + geometry callbacks (no materials, no three/webgpu – bundled into the node CI).
import * as THREE from 'three';
import type { PodDef } from './data';
import type { EngineSpec } from './podParts';
import { CAGE_ARC_STEP } from './podEngines';
import { type PartBuilder, M4, cyl, extrude, lathe, prof, rbox, sphere, torus, tube } from './podKit';

export type CockpitStyle = 'pod' | 'wedge' | 'saucer' | 'long';
export interface EngineMount { spec: EngineSpec; x: number; y: number; z: number; }
/** Energy binder between two engines (indices into `engines`). `zOff` shifts both ends along the engines (m): several arcs on one pair. */
export interface BinderLink { a: number; b: number; zOff?: number }
/** Collision circle in pod-local (group) space, side -1 = left engines (hpL), +1 = right, 0 = cockpit. */
export interface CollCircle { x: number; z: number; r: number; side: number }
/** Extra parts of one pod. `hi` = full detail (player pod, Gegner on Ultra): small parts only then. */
export type Extras = (pb: PartBuilder, L: PodLayout, hi: boolean) => void;
export interface PodLayout {
  engines: EngineMount[];
  cockpit: {
    style: CockpitStyle; hw: number; len: number; y: number; z: number; pilot: number;
    /** ground clamp only: physics treats the cockpit as reaching this far (m) below the visible tub. Set for the raised
     *  Session 19 pods (see `raised`); a new pod leaves it out – its clamp is the tub's real floor. */
    keel?: number;
    /** cockpit design id (podCockpits.ts → DESIGNS); default = the pod's own id */
    design?: string;
    /** highest solid point above the cockpit origin (strobe light); default 1.75 m above the floor of the visible tub */
    topY?: number;
    /** cockpit camera: fixed enlargement of the cockpit about the pilot's eye (default: computed from the nearest part in view) */
    viewScale?: number;
    /** silhouette cue of the far LOD (> 48 m): plain box, flat disc, box with a tall fin, box with a roll cage, box inside a flat ring */
    far?: 'box' | 'disc' | 'fin' | 'cage' | 'ring';
  };
  /** energy binders; the first one is the pod's main coupling */
  binders: BinderLink[];
  livery: number;
  /** extra parts that ride with the engine banks (split by side: keep every part on one side of x = 0) */
  engineExtras?: Extras;
  /** extra parts fixed to the cockpit */
  cockpitExtras?: Extras;
  /** additional collision circles besides engines + cockpit (wide wings …); `z` in layout space like the engine mounts */
  extraCircles?: CollCircle[];
  /** widens the ground-clearance envelope of both engine sides: outermost |x| and lowest y of parts the engine formulas do not know */
  envelope?: { outerX?: number; minY?: number };
  /** Bruchteile (ids of the racer's Schadensmodell, podDamage.ts) that are not a piece of geometry: engines that flame out,
   *  engines whose fan loses a blade (`EngineGeo.fanLost`) – both indices into `engines` – and energy arcs that die (indices into
   *  `binders`). Geometry Bruchteile are tagged where they are built: `pb.brk(id, …)` in the extras below, in the engine builders
   *  and `part(k, id, …)` in the cockpit designs. */
  flameOut?: Record<string, number[]>; fanLoss?: Record<string, number[]>; arcLoss?: Record<string, number[]>;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const spec = (L: number, R: number, style: EngineSpec['style'], bands: number, blades: number, spike = true, fins = 0): EngineSpec => ({ L, R, style, bands, blades, spike, fins });
const pair = (s: EngineSpec, sp: number, y: number, z: number): EngineMount[] => [{ spec: s, x: -sp, y, z }, { spec: s, x: sp, y, z }];
const MAIN: BinderLink[] = [{ a: 0, b: 1 }];
/** Session 20 (user request): a Session 19 pod carries its cockpit `up` metres higher than it was built at height `y` – the tub rides
 *  above the engine line and the pilot looks over the engines. The same amount goes into `keel`: the ground clamp stays where it was,
 *  so the pod drives exactly as before (decision "old pods: look only"; `tools/ci/pods-shapes.json` does not move). */
const raised = (y: number, up: number) => ({ y: y + up, keel: up });
const SEC: [number, number, number] = [0, 0, 3]; // secondary paint
const SIDES = [-1, 1];
/** suffix of a paired Bruchteil id: left engine side (x < 0) / right */
const LR = (sd: number) => (sd < 0 ? 'L' : 'R');
/** thin plate in the YZ plane (points [z, y]), `t` thick */
const plate = (pts: [number, number][], t: number) => { const g = extrude(pts, t, Math.min(0.012, t * 0.3)); g.rotateY(-Math.PI / 2); return g; };

const LAYOUTS: Record<string, (def: PodDef) => PodLayout> = {
  aurora: () => {
    const s = spec(9, 1.15, 'turbine', 6, 18);
    return {
      engines: pair(s, 2.5, 0, 4), cockpit: { style: 'pod', hw: 0.95, len: 3.4, ...raised(0.1, 0.9), z: -6, pilot: 1 }, binders: MAIN, livery: 0,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) for (const s2 of SIDES) {
          const cx = sd * 2.5 + s2 * 1.5, tip = sd * 2.5 + s2 * 1.97;
          pb.brk((s2 === sd ? 'wing' : 'inner') + LR(sd), () => { // Bruchteile: the outer wing plate of an engine goes first, the inner one last
            pb.add('hull', rbox(0.95, 0.08, 8.2, 0.03), M4.trs(cx, -0.32, 4, 0, 0, s2 * -0.12), SEC);
            pb.add('steel', rbox(0.06, 0.12, 8.3, 0.02), M4.trs(tip, -0.38, 4, 0, 0, s2 * -0.12));
            // Session 20: tip pods with nav light, a row of vortex generators and two wing struts
            pb.add('dark', lathe(prof([[0, -0.5], [0.07, -0.3], [0.08, 0.3], [0, 0.56]]), hi ? 10 : 6, 0), M4.t(tip, -0.34, 7.9));
            pb.add('glow', sphere(0.05, 6, 4), M4.t(tip, -0.34, 8.47));
            if (hi) {
              for (let i = 0; i < 5; i++) pb.add('steel', rbox(0.016, 0.07, 0.2, 0.004), M4.trs(cx, -0.25, 1.4 + i * 1.3, 0, s2 * 0.3, s2 * -0.12));
              for (const z of [1.6, 6.4]) pb.add('steel', tube([V(sd * 2.5 + s2 * 0.86, -0.72, z), V(cx, -0.38, z)], 0.035, 2, 5));
            }
          });
        }
      },
      // the wing plates reach further out and lower than the turbines
      extraCircles: SIDES.flatMap(sd => [2.5, -2.5].map(f => ({ x: sd * 4.0, z: 4 + f, r: 0.6, side: sd }))),
      envelope: { outerX: 4.45, minY: -0.62 },
    };
  },
  brute: () => {
    const s = spec(8, 1.5, 'split', 7, 20, false);
    return {
      engines: pair(s, 2.4, 0, 2), cockpit: { style: 'wedge', hw: 1.1, len: 3.0, ...raised(0.25, 1.0), z: -9, pilot: 1.05, far: 'cage' }, binders: MAIN, livery: 2,
      engineExtras: (pb, _L, hi) => {
        // the big shark fin stays on the left engine only (Vrak's trademark)
        const fin = extrude([[0, 0], [2.2, 0], [2.7, 2.7], [1.6, 2.7]], 0.12, 0.03); fin.rotateY(Math.PI / 2);
        pb.brk('fin', () => { pb.add('hull', fin, M4.t(-2.4, 1.45, 1.2), SEC); pb.add('steel', rbox(0.3, 0.4, 1.6, 0.05), M4.t(-2.4, 1.6, 0.2)); }); // Bruchteil
        for (const sd of SIDES) {
          // Session 20: four intake guard spikes and an armoured skid plate per engine, a stub fin on the right one
          for (const [ax, ay] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) pb.add('chrome', lathe(prof([[0.085, 0], [0.05, 0.35], [0, 0.9]]), hi ? 8 : 5, 0), M4.trs(sd * 2.4 + ax * 1.0, ay * 1.0, 5.25, ay * -0.16, ax * 0.16, 0));
          pb.add('dark', rbox(1.5, 0.07, 3.0, 0.025), M4.t(sd * 2.4, -1.6, 1.6));
          if (hi) for (const z of [0.4, 2.8]) pb.add('steel', rbox(1.56, 0.1, 0.12, 0.02), M4.t(sd * 2.4, -1.61, z));
        }
        pb.brk('stub', () => pb.add('hull', plate([[0, 0], [1.3, 0], [0.5, 0.8], [0.1, 0.84]], 0.08), M4.t(2.4, 1.46, 0.2), SEC)); // Bruchteil
      },
    };
  },
  gasvaro: () => {
    const s = spec(6, 0.8, 'quad', 4, 12);
    return {
      engines: [...pair(s, 1.6, 0, 3), ...pair(s, 3.4, 0, 3), ...pair(s, 2.5, 1.55, 4)], cockpit: { style: 'long', hw: 0.75, len: 3.6, ...raised(0, 0.8), z: -7, pilot: 0.95 }, binders: MAIN, livery: 1,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          pb.add('steel', tube([V(sd * 1.6, 0.7, 3.4), V(sd * 2.05, 1.3, 3.7), V(sd * 2.5, 2.1, 4)], 0.07, 12, 8));
          pb.add('steel', tube([V(sd * 3.4, 0.7, 3.4), V(sd * 2.95, 1.3, 3.7), V(sd * 2.5, 2.1, 4)], 0.07, 12, 8));
          // Session 20: a rear truss, a copper fuel manifold feeding all three engines and a spreader bar between the lower pair
          pb.add('steel', tube([V(sd * 1.6, 0.7, 1.2), V(sd * 2.5, 1.0, 1.7), V(sd * 3.4, 0.7, 1.2)], 0.06, hi ? 10 : 5, 6));
          pb.brk('manifold' + LR(sd), () => { // Bruchteil
            pb.add('copper', tube([V(sd * 1.6, 0.86, 0.5), V(sd * 2.5, 1.26, 0.9), V(sd * 2.5, 2.3, 1.5)], 0.05, hi ? 12 : 6, 6));
            pb.add('copper', tube([V(sd * 3.4, 0.86, 0.5), V(sd * 2.9, 1.1, 0.75), V(sd * 2.5, 1.26, 0.9)], 0.05, hi ? 8 : 4, 6));
            pb.add('dark', sphere(0.14, hi ? 10 : 6, hi ? 8 : 4), M4.t(sd * 2.5, 1.26, 0.9));
            if (hi) for (const x of [1.6, 3.4]) pb.add('chrome', torus(0.09, 0.02, 5, 10), M4.trs(sd * x, 0.82, 0.5, Math.PI / 2, 0, 0));
          });
          pb.add('steel', tube([V(sd * 1.6, -0.2, 5.0), V(sd * 3.4, -0.2, 5.0)], 0.05, 2, 6));
        }
      },
      flameOut: { engCL: [4], engCR: [5], engBL: [2], engBR: [3] }, // first the upper engine of a side goes out, then the outer one
    };
  },
  bomquad: () => {
    // Session 17: four slim engines stacked 2 × 2 (upper pair directly above the lower pair), coupled by an X of energy binders
    const s = spec(7.6, 0.66, 'ring', 5, 12);
    return {
      engines: [{ spec: s, x: -2.3, y: -0.35, z: 3 }, { spec: s, x: 2.3, y: -0.35, z: 3 }, { spec: s, x: -2.3, y: 2.05, z: 3 }, { spec: s, x: 2.3, y: 2.05, z: 3 }],
      cockpit: { style: 'saucer', hw: 1.0, len: 2.4, ...raised(0.2, 0.65), z: -6, pilot: 0.95, far: 'disc' }, binders: [{ a: 0, b: 3 }, { a: 2, b: 1 }], arcLoss: { arcL: [0], arcR: [1] }, livery: 3,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          for (const z of [1.0, 4.8]) pb.add('steel', tube([V(sd * 2.3, 0.35, z), V(sd * 2.3, 1.35, z)], 0.08, 4, 6));
          // Session 20: cross bracing between the stacked engines and chrome lightning rods where the X of binders couples
          pb.add('steel', tube([V(sd * 2.3, 0.34, 1.0), V(sd * 2.3, 1.36, 4.8)], 0.035, 2, 5));
          pb.add('steel', tube([V(sd * 2.3, 1.36, 1.0), V(sd * 2.3, 0.34, 4.8)], 0.035, 2, 5));
          for (const y of [-0.35, 2.05]) {
            pb.add('chrome', lathe(prof([[0.06, 0], [0.035, 0.3], [0, 0.62]]), hi ? 8 : 5, 0), M4.trs(sd * (2.3 - 0.6), y + 0.13, 3.91, 0, sd * -Math.PI / 2, 0));
            if (hi) pb.add('copper', torus(0.1, 0.022, 5, 12), M4.trs(sd * (2.3 - 0.7), y + 0.13, 3.91, 0, Math.PI / 2, 0));
          }
        }
      },
    };
  },
  mavik: () => {
    const s = spec(8, 0.62, 'needle', 6, 10);
    return {
      engines: pair(s, 1.7, 0, 3), cockpit: { style: 'pod', hw: 0.72, len: 2.5, ...raised(-0.05, 0.8), z: -5.5, pilot: 0.92, far: 'fin' }, binders: MAIN, livery: 1,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          // Session 20: swept canards behind each intake, a long outboard pitot and a ventral keel
          pb.brk('canard' + LR(sd), () => { for (const a of [1.05, -1.05]) pb.add('hull', plate([[0, 0], [0.9, 0], [0.1, 0.5], [-0.12, 0.5]], 0.035), M4.trs(sd * 1.7 + Math.sin(a) * 0.56, Math.cos(a) * 0.56, 5.3, 0, 0, -a), SEC); }); // Bruchteil
          pb.add('chrome', tube([V(sd * 2.34, 0.06, 4.6), V(sd * 2.36, 0.06, 8.2)], 0.018, 2, 5));
          pb.add('dark', cyl(0.04, 0.04, 0.2, 6), M4.trs(sd * 2.3, 0.06, 4.7, 0, 0, Math.PI / 2));
          pb.add('hull', plate([[0, 0], [1.7, 0], [1.3, -0.16], [0.2, -0.16]], 0.03), M4.t(sd * 1.7, -0.6, 0.6), SEC);
          if (hi) pb.add('glow', sphere(0.03, 6, 4), M4.t(sd * 2.36, 0.06, 8.24));
        }
      },
    };
  },
  rattis: () => {
    const s = spec(6, 0.85, 'blade', 4, 14);
    return {
      engines: pair(s, 1.7, 0, 2.5), cockpit: { style: 'wedge', hw: 0.78, len: 2.6, ...raised(-0.1, 0.85), z: -3.2, pilot: 0.92, viewScale: 1.9 }, binders: MAIN, livery: 2,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          // Session 20: twin feelers on every engine, landing skids underneath and a stripe band like the wasp body
          for (const a of SIDES) {
            pb.brk('feeler' + LR(sd), () => { // Bruchteil
              pb.add('dark', tube([V(sd * 1.7 + a * 0.2, 0.86, 4.6), V(sd * 1.7 + a * 0.42, 1.3, 5.3), V(sd * 1.7 + a * 0.56, 1.42, 6.1)], 0.018, hi ? 8 : 4, 4));
              pb.add('glow', sphere(0.035, 6, 4), M4.t(sd * 1.7 + a * 0.56, 1.42, 6.1));
            });
            pb.add('steel', tube([V(sd * 1.7 + a * 0.42, -0.86, 0.6), V(sd * 1.7 + a * 0.46, -1.0, 1.4), V(sd * 1.7 + a * 0.46, -1.0, 3.6), V(sd * 1.7 + a * 0.42, -0.86, 4.4)], 0.035, hi ? 10 : 5, 5));
          }
          if (hi) for (const z of [0.9, 1.4]) pb.add('hazard', torus(0.86, 0.035, 5, 20), M4.t(sd * 1.7, 0, z));
        }
      },
    };
  },
  aldo: () => {
    const s = spec(9, 1.0, 'long', 7, 16, true, 6);
    return {
      engines: pair(s, 2.3, 0, 3.5), cockpit: { style: 'long', hw: 0.85, len: 3.2, ...raised(0, 0.9), z: -6, pilot: 1 }, binders: MAIN, livery: 0,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          // Session 20: an external cooling loop over each engine, a coolant tank underneath and two radiator vanes at the rear
          const x = sd * 2.3;
          pb.brk('loop' + LR(sd), () => { // Bruchteil
            pb.add('copper', tube([V(x, 1.02, 0.4), V(x + 0.34, 1.4, 1.1), V(x, 1.5, 1.9), V(x - 0.34, 1.4, 2.7), V(x, 1.5, 3.5), V(x + 0.34, 1.4, 4.3), V(x, 1.02, 5.0)], 0.055, hi ? 26 : 10, 6));
            if (hi) for (const z of [1.1, 2.7, 4.3]) pb.add('dark', torus(0.075, 0.02, 5, 10), M4.trs(x + (z === 2.7 ? -0.34 : 0.34), 1.4, z, 0, 0, 0));
          });
          pb.add('steel', cyl(0.17, 0.17, 2.2, hi ? 12 : 6).rotateX(Math.PI / 2), M4.t(x, -1.0, 3.2));
          for (const z of [2.2, 4.2]) pb.add('dark', sphere(0.17, hi ? 10 : 6, hi ? 6 : 3), M4.t(x, -1.0, z));
          pb.brk('vane' + LR(sd), () => { for (const a of SIDES) pb.add('hull', plate([[0, 0], [1.4, 0], [1.2, 0.5], [0.1, 0.42]], 0.035), M4.trs(x + a * 0.72, 0.72, -0.9, 0, 0, a * -0.75), SEC); }); // Bruchteil
          if (hi) pb.add('glow', rbox(0.03, 0.03, 1.8, 0.008), M4.t(x, -1.18, 3.2));
        }
      },
    };
  },
  teemo: () => {
    const s = spec(5, 1.25, 'heavy', 4, 20, true);
    return {
      engines: [{ spec: s, x: -2.3, y: -0.4, z: 0 }, { spec: s, x: 2.3, y: -0.4, z: 0 }, { spec: s, x: -2.3, y: 1.45, z: 6 }, { spec: s, x: 2.3, y: 1.45, z: 6 }],
      cockpit: { style: 'saucer', hw: 0.82, len: 2.2, ...raised(0.35, 0.6), z: -5.5, pilot: 0.95, far: 'disc' }, binders: MAIN, livery: 3,
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          pb.add('dark', rbox(0.3, 0.3, 3.6, 0.06), M4.trs(sd * 2.3, 0.55, 3.0, -0.31, 0, 0));
          pb.add('hazard', rbox(0.32, 0.06, 1.2, 0.02), M4.trs(sd * 2.3, 0.73, 3.0, -0.31, 0, 0));
          // Session 20: armour skirts outboard of the lower engines, a second girder and bumper horns on the upper ones
          pb.brk('skirt' + LR(sd), () => { // Bruchteil
            pb.add('steel', rbox(0.07, 1.5, 3.4, 0.025), M4.trs(sd * 3.6, -0.5, 0, 0, 0, sd * 0.08));
            if (hi) for (let i = 0; i < 5; i++) pb.add('chrome', cyl(0.035, 0.035, 0.03, 6), M4.trs(sd * 3.645, -0.1, -1.4 + i * 0.7, 0, 0, Math.PI / 2));
          });
          pb.add('dark', rbox(0.22, 0.22, 3.2, 0.05), M4.trs(sd * 2.3 + sd * 0.7, 0.2, 2.6, -0.31, 0, 0));
          for (const a of SIDES) pb.add('chrome', lathe(prof([[0.09, 0], [0.05, 0.3], [0, 0.7]]), hi ? 8 : 5, 0), M4.t(sd * 2.3 + a * 0.8, 1.45 + 0.8, 8.3));
        }
      },
      flameOut: { engUL: [2], engUR: [3] }, // the upper engine of a side goes out late
    };
  },
  elana: () => {
    const s = spec(8.5, 0.78, 'needle', 6, 12);
    return {
      engines: pair(s, 2, 0, 3), cockpit: { style: 'long', hw: 0.8, len: 3.3, ...raised(0, 0.8), z: -6, pilot: 0.95, topY: 1.42, far: 'fin' }, binders: MAIN, livery: 1, // (dorsal fin = part of the cockpit design)
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          // Session 20: three tail feathers fanned around each nozzle and a slim winglet like the cockpit's
          for (const a of [0, 2.1, -2.1]) pb.add('hull', plate([[0, 0], [0.95, 0], [0.1, 0.42], [-0.3, 0.4]], 0.03), M4.trs(sd * 2 + Math.sin(a) * 0.62, Math.cos(a) * 0.62, -0.9, 0, 0, -a), SEC);
          const w = extrude([[0, 0], [0.5, 0.42], [0.54, 0.66], [0.34, 0.62], [0, 0.32]], 0.03, 0.01); w.rotateX(-Math.PI / 2);
          const m = M4.trs(sd * 2.7, 0, 4.4, 0, 0, sd * 0.1); if (sd < 0) m.multiply(M4.mirrorX());
          pb.add('hull', w, m, SEC);
          if (hi) pb.add('chrome', torus(0.8, 0.02, 5, 22), M4.t(sd * 2, 0, 4.9));
        }
      },
    };
  },
  odo: () => { // ram
    const s = spec(7, 1.3, 'heavy', 5, 16, false);
    return {
      engines: pair(s, 2.4, 0, 3), cockpit: { style: 'wedge', hw: 1.0, len: 2.8, ...raised(0, 1.05), z: -5.5, pilot: 1, far: 'cage' }, binders: MAIN, livery: 2, // (ram prow = part of the cockpit design)
      engineExtras: (pb, _L, hi) => {
        for (const sd of SIDES) {
          // Session 20: a ram hoop on three struts in front of every intake and a hazard band around the cowling
          const x = sd * 2.4;
          pb.brk('hoop' + LR(sd), () => { // Bruchteil
            pb.add('steel', torus(0.86, 0.07, 6, hi ? 20 : 10), M4.t(x, 0, 7.0));
            for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; pb.add('steel', tube([V(x + Math.sin(a) * 1.22, Math.cos(a) * 1.22, 6.3), V(x + Math.sin(a) * 0.86, Math.cos(a) * 0.86, 7.0)], 0.045, 2, 5)); }
          });
          pb.add('hazard', torus(1.32, 0.05, 5, hi ? 24 : 12), M4.t(x, 0, 5.2));
          pb.brk('skid' + LR(sd), () => pb.add('dark', rbox(1.2, 0.08, 2.6, 0.03), M4.t(x, -1.5, 2.4))); // Bruchteil
        }
      },
    };
  },
};

/** Skid rail through `pts`, made of straight tubes (a spline through the same points would dip below the lowest ones). */
const rail = (pb: PartBuilder, pts: THREE.Vector3[], r: number) => {
  for (let i = 0; i < pts.length - 1; i++) pb.add('steel', tube([pts[i], pts[i + 1]], r, 1, 5));
  for (let i = 1; i < pts.length - 1; i++) pb.add('steel', sphere(r * 1.03, 6, 4), M4.t(pts[i].x, pts[i].y, pts[i].z));
};

// ---- Session 20 / Phase 3: four new pods. Their cockpits sit at their real height (no `keel`): the ground clamp is the tub floor.
LAYOUTS.cyclone = () => { // Tarn Cyclone: two short fat engines, each driving a big open rotor inside a guard hoop
  const s = spec(5.2, 1.25, 'rotor', 3, 5), ex = 2.7, ez = 3.2, R = s.R, Rh = 1.42 * R;
  return {
    engines: pair(s, ex, 0, ez), cockpit: { style: 'wedge', hw: 1.0, len: 3.0, y: 1.02, z: -5.4, pilot: 1.08, far: 'fin' }, binders: MAIN, livery: 3,
    fanLoss: { bladeL: [0], bladeR: [1] },
    engineExtras: (pb, _L, hi) => {
      for (const sd of SIDES) {
        // a swept fin on top of each hoop and two landing skids under each body
        pb.brk('fin' + LR(sd), () => { // Bruchteil
          pb.add('hull', plate([[ez + 2.08, Rh + 0.02], [ez + 1.5, Rh + 0.02], [ez + 1.26, Rh + 0.56], [ez + 1.5, Rh + 0.6]], 0.05), M4.t(sd * ex, 0, 0), SEC);
          if (hi) pb.add('glow', sphere(0.035, 6, 4), M4.t(sd * ex, Rh + 0.6, ez + 1.42)); // marker light on the fin
        });
        for (const o of [-0.5, 0.5]) {
          const x = sd * ex + o;
          rail(pb, [V(x, -R * 0.86, ez + 0.5), V(x, -R - 0.15, ez + 0.1), V(x, -R - 0.15, ez - 1.7), V(x, -R * 0.86, ez - 2.1)], 0.04);
          if (hi) for (const z of [ez - 0.2, ez - 1.4]) pb.add('steel', cyl(0.026, 0.026, 0.22, 5), M4.t(x, -R - 0.02, z));
        }
        if (hi) pb.add('steel', tube([V(sd * ex, R + 0.06, ez + 0.5), V(sd * ex, Rh - 0.02, ez + 1.52)], 0.03, 2, 5)); // brace from the spine to the top of the hoop
      }
    },
  };
};

LAYOUTS.halo = () => { // Lyss Halo-9: two slim cores, each inside a big ring wing; the energy binder jumps from ring to ring
  const s = spec(7.5, 0.5, 'hoop', 4, 10), ex = 2.75, ez = 3, Rw = 3.4 * s.R;
  return {
    engines: pair(s, ex, 0, ez), cockpit: { style: 'pod', hw: 0.8, len: 2.6, y: 0.8, z: -5.2, pilot: 0.95, far: 'ring' }, binders: MAIN, livery: 1,
    engineExtras: (pb, _L, hi) => {
      for (const sd of SIDES) {
        // a slim tail sting behind each core and a keel vane under each ring
        pb.add('chrome', lathe(prof([[0, -1.5], [0.05, -0.5], [0.07, 0]]), hi ? 10 : 6, 0), M4.t(sd * ex, 0.43, ez - 3.1));
        pb.add('hull', plate([[ez + 1.1, -Rw + 0.04], [ez + 0.3, -Rw + 0.04], [ez + 0.16, -Rw - 0.08], [ez + 0.7, -Rw - 0.085]], 0.04), M4.t(sd * ex, 0, 0), SEC);
        if (hi) { // navigation lights on the outer edge of each ring, top and bottom
          for (const a of [0.9, 2.24]) pb.add('glow', sphere(0.032, 6, 4), M4.t(sd * (ex + Math.sin(a) * (Rw + 0.06)), Math.cos(a) * (Rw + 0.06), ez + 0.45));
        }
      }
    },
  };
};

LAYOUTS.manta = () => { // Dorn Manta: two flat engine slabs with slot nozzles, twin fins and drooped winglets
  const s = spec(8.6, 0.5, 'slab', 3, 9), ex = 2.5, ez = 3.4, W = 3 * s.R;
  return {
    engines: pair(s, ex, 0, ez), cockpit: { style: 'wedge', hw: 1.05, len: 3.4, y: 0.92, z: -6.2, pilot: 1, far: 'box' }, binders: MAIN, livery: 4,
    engineExtras: (pb, _L, hi) => {
      for (const sd of SIDES) {
        // a pitot boom on the outer front corner of each slab and a chin splitter under each intake
        pb.add('chrome', lathe(prof([[0.03, 0], [0.018, 0.9], [0, 1.25]]), hi ? 8 : 5, 0), M4.t(sd * (ex + 0.66 * W), 0.02, ez + 4.2));
        pb.add('dark', rbox(1.5 * W, 0.04, 0.5, 0.012), M4.t(sd * ex, -0.285, ez + 4.3));
        if (hi) { // heat shields over the slot nozzles (secondary paint)
          pb.add('hull', rbox(1.5 * W, 0.03, 0.5, 0.008), M4.trs(sd * ex, 0.4, ez - 4.44, -0.12, 0, 0), SEC);
          pb.add('glow', rbox(1.4 * W, 0.016, 0.02, 0.004), M4.t(sd * ex, 0.37, ez - 4.68));
        }
      }
    },
  };
};
LAYOUTS.volt = () => { // Quill Voltspire: two open truss cages round plasma coils, coupled by three arcs
  const s = spec(7, 0.95, 'cage', 5, 6), ex = 2.35, ez = 3, R = s.R;
  return {
    engines: pair(s, ex, 0, ez), cockpit: { style: 'saucer', hw: 0.9, len: 2.2, y: 0.9, z: -5.4, pilot: 0.92, topY: 0.95, far: 'cage' },
    binders: [{ a: 0, b: 1, zOff: -CAGE_ARC_STEP }, { a: 0, b: 1 }, { a: 0, b: 1, zOff: CAGE_ARC_STEP }], livery: 5,
    arcLoss: { arcA: [0], arcB: [2] }, // the rear arc dies first, then the front one – the middle one holds
    engineExtras: (pb, _L, hi) => {
      for (const sd of SIDES) {
        // a discharge mast on the front frame of each cage and two skid rails underneath
        pb.add('chrome', cyl(0.012, 0.03, 1.1, 6), M4.t(sd * ex, R + 0.6, ez + 2.8));
        pb.add('glow', sphere(0.04, 6, 4), M4.t(sd * ex, R + 1.17, ez + 2.8));
        if (hi) for (const h of [0.42, 0.74]) pb.add('dark', torus(0.085 - h * 0.04, 0.014, 5, 10), M4.trs(sd * ex, R + h, ez + 2.8, Math.PI / 2, 0, 0));
        for (const o of [-0.42, 0.42]) rail(pb, [V(sd * ex + o, -R * 0.84, ez + 2.4), V(sd * ex + o, -R - 0.14, ez + 1.9), V(sd * ex + o, -R - 0.14, ez - 1.9), V(sd * ex + o, -R * 0.84, ez - 2.4)], 0.035);
      }
    },
  };
};

/** Layout of a pod. Every pod id needs its own entry – an unknown id is a bug (it used to build the Mandrel Ram silently). */
export function podLayout(def: PodDef): PodLayout {
  const make = LAYOUTS[def.id];
  if (!make) throw new Error(`No layout for pod "${def.id}" – add it to LAYOUTS in src/game/podLayouts.ts`);
  const L = make(def);
  L.cockpit.design ??= def.id; // every pod has its own cockpit design unless the layout names another one
  return L;
}
