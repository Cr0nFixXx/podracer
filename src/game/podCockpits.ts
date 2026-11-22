// Cockpits: the gondola the pilot sits in. One design per pod (DESIGNS), built from a small kit of shared parts.
// Geometry only (merged per material key, cached) – no materials, no three/webgpu (bundled into the node CI).
//
// Conventions (cockpit-local space): +z = forward (towards the engines), +y = up, origin = cockpit centre.
//   The physical envelope of a cockpit is fixed by its layout (hw, len): nothing may hang lower than -(0.68·hw + 0.14).
//   `detail`: 0 = lite (Gegner below Ultra: silhouette + simple pilot) · 1 = full · 2 = ultra extras.
//   The pilot's head, torso and upper arms go into `pilot` (the cockpit camera hides them); forearms and hands stay in `parts`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PilotHead } from './data';
import { PartBuilder, M4, boltRing, cyl, extrude, lathe, loft, loftRim, prof, rbox, sphere, torus, tube, type MatKey, type Section } from './podKit';
import type { BreakPart } from './podParts';
import type { PodLayout } from './podLayouts';

export type CockpitDetail = 0 | 1 | 2;
export interface CockpitInfo {
  /** centre of the pilot's head */ head: THREE.Vector3;
  /** where the cockpit camera sits (inside the head) */ eye: THREE.Vector3;
  /** left / right control-cable anchor */ anchors: [THREE.Vector3, THREE.Vector3];
}
export interface CockpitGeo {
  /** everything except the pilot's body */ parts: Map<string, THREE.BufferGeometry>;
  /** head, torso, upper arms */ pilot: Map<string, THREE.BufferGeometry>;
  /** live dash lamps (boost, heat, damage): one geometry of `lampCount` discs with LAMP_VERTS vertices each and a `color` attribute */
  lamps: THREE.BufferGeometry | null; lampCount: number;
  /** Bruchteile of this cockpit (own geometry sets; the assembly decides whether they are separate meshes) */
  breakParts: BreakPart[];
  info: CockpitInfo;
}
/** vertices per lamp disc in `CockpitGeo.lamps` */
export const LAMP_VERTS = 12;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const HALF = Math.PI / 2;

// ------------------------------------------------------------------ kit
/** Tub cross-section row: z (-0.5 rear .. 0.5 front, × len), half width, top height, bottom depth (× hw), super-ellipse exponent, opening 0..0.85 */
type Row = [number, number, number, number, number, number];
interface Kit {
  pb: PartBuilder; pp: PartBuilder; hw: number; len: number; s: number; seg: number; d: CockpitDetail; head: PilotHead;
  /** fine parts only on full / ultra builds */ hi: boolean; ultra: boolean;
  lampAt: THREE.Vector3[]; lampN: THREE.Vector3; breaks: BreakPart[];
}
interface Tub { secs: Section[]; zA: number; zB: number; wMax: number; hBm: number; rimY: number; floorY: number; hip: THREE.Vector3; iB: number }
interface Pilot { head: THREE.Vector3; eye: THREE.Vector3; hands: THREE.Vector3[] }

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
/** Smoothly resample sparse rows into dense sections (scaled to metres). */
function resample(T: Row[], hw: number, len: number, perSpan: number): Section[] {
  const out: Section[] = [];
  for (let i = 0; i < T.length - 1; i++) for (let k = 0; k < perSpan; k++) {
    const t = k / perSpan; const g = (j: number) => T[Math.max(0, Math.min(T.length - 1, j))];
    const f = (c: number) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t);
    const e = t * t * (3 - 2 * t); const open = g(i)[5] + (g(i + 1)[5] - g(i)[5]) * e;
    out.push({ z: f(0) * len, w: Math.max(0.02, f(1)) * hw, hT: Math.max(0.02, f(2)) * hw, hB: Math.max(0.02, f(3)) * hw, n: f(4), open: Math.max(0, Math.min(0.85, open)) });
  }
  const l = T[T.length - 1]; out.push({ z: l[0] * len, w: l[1] * hw, hT: l[2] * hw, hB: l[3] * hw, n: l[4], open: 0 });
  return out;
}

/** Lofted tub: painted outer shell, dark inner shell and chrome rim around the opening. */
function shell(k: Kit, rows: Row[]): Tub {
  const { hw, len } = k;
  const secs = resample(rows, hw, len, k.d === 0 ? 2 : k.seg >= 40 ? 6 : k.seg >= 28 ? 4 : 3);
  const segC = k.d === 0 ? 14 : Math.max(24, k.seg);
  k.pb.add('hull', loft(secs, segC, 2));
  let iA = secs.findIndex(s => (s.open ?? 0) > 0.001) - 1, iB = secs.length - 1;
  for (let j = secs.length - 1; j >= 0; j--) if ((secs[j].open ?? 0) > 0.001) { iB = j + 1; break; }
  const hasOpen = iA >= -1 && secs.some(s => (s.open ?? 0) > 0.001);
  iA = Math.max(0, iA); iB = Math.min(secs.length - 1, iB);
  const th = 0.05 * hw + 0.02;
  const sub = hasOpen ? secs.slice(iA, iB + 1) : secs.slice(Math.floor(secs.length * 0.3), Math.floor(secs.length * 0.7) + 1);
  if (hasOpen) {
    const inner: Section[] = sub.map(s => ({ ...s, w: s.w - th, hT: s.hT - th, hB: s.hB - th }));
    k.pb.add('interior', loft(inner, segC, 0, [true, true], true));
    if (k.hi) k.pb.add('chrome', loftRim(sub, inner, segC));
  }
  const zA = sub[0].z, zB = sub[sub.length - 1].z; let wMax = 0, hBm = 0; for (const s of sub) { wMax = Math.max(wMax, s.w); hBm = Math.max(hBm, s.hB); }
  const mid = sub[Math.floor(sub.length / 2)];
  const rimY = mid.hT * Math.pow(Math.cos(((mid.open ?? 0.5) * Math.PI) / 2), 2 / (mid.n ?? 2.4));
  const floorY = -(mid.hB - th);
  return { secs, zA, zB, wMax, hBm, rimY, floorY, hip: V(0, floorY * 0.5, zA + (zB - zA) * 0.4), iB };
}

/** Padded bucket seat with headrest. */
function seat(k: Kit, hip: THREE.Vector3, lean = 0) {
  const m = (x: number, y: number, z: number, rx: number) => M4.trs(hip.x + x, hip.y + y, hip.z + z, rx - lean, 0, 0);
  k.pb.add('leather', rbox(0.56, 0.12, 0.5, 0.05), m(0, -0.06, 0.08, 0));
  k.pb.add('leather', rbox(0.56, 0.7, 0.12, 0.06), m(0, 0.3 * Math.cos(lean), -0.2 - 0.3 * Math.sin(lean), -0.15));
  if (k.hi) k.pb.add('leather', rbox(0.3, 0.2, 0.12, 0.05), m(0, 0.78 * Math.cos(lean), -0.27 - 0.78 * Math.sin(lean), -0.15));
}

/** Pilot figure. `lean` > 0 = leaning back (rad). `reach` = hand targets in cockpit space (default: on the control levers). */
function pilot(k: Kit, hip: THREE.Vector3, lean = 0, reach?: [THREE.Vector3, THREE.Vector3]): Pilot {
  const s = k.s, lite = k.d === 0, pp = k.pp;
  const base = new THREE.Matrix4().compose(hip, new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean, 0, 0)), V(s, s, s));
  const at = (m: THREE.Matrix4) => base.clone().multiply(m);
  const W = (p: THREE.Vector3) => p.clone().applyMatrix4(base);
  const torso = lathe(prof([[0, 0], [0.16, 0, 1], [0.19, 0.12], [0.21, 0.32], [0.19, 0.44], [0.12, 0.52], [0.06, 0.56], [0, 0.57]]), lite ? 8 : 18, 0);
  torso.rotateX(-HALF); torso.scale(1.15, 1, 0.82);
  pp.add('suit', torso, at(M4.trs(0, 0, 0, 0.22, 0, 0)));
  if (!lite) {
    for (const sd of [-1, 1]) pp.add('leather', rbox(0.05, 0.5, 0.02, 0.01), at(M4.trs(sd * 0.09, 0.27, 0.19, 0.22, 0, sd * 0.12)));
    pp.add('chrome', cyl(0.035, 0.035, 0.02, 10), at(M4.trs(0, 0.25, 0.205, HALF + 0.22, 0, 0)));
    // Session 20: collar ring, shoulder pads and a chest unit
    pp.add('leather', torus(0.075, 0.03, 8, 18), at(M4.trs(0, 0.56, 0.12, HALF - 0.25, 0, 0)));
    for (const sd of [-1, 1]) pp.add('dark', sphere(0.1, 10, 6, 0, Math.PI * 2, 0, HALF), at(M4.trs(sd * 0.225, 0.47, 0.085, 0, 0, sd * -0.5, 1.1, 0.7, 1.2)));
    pp.add('dark', rbox(0.15, 0.1, 0.04, 0.012), at(M4.trs(0, 0.4, 0.2, 0.22, 0, 0)));
    pp.add('glow', rbox(0.05, 0.02, 0.012, 0.004), at(M4.trs(-0.03, 0.42, 0.224, 0.22, 0, 0)));
  }
  const head = V(0, 0.71, 0.17), kind = k.head, hs = lite ? 8 : 16, hr = lite ? 6 : 12;
  if (kind === 'snout') { // elongated predatory snout, swept brow horns, leather cap, big goggles
    pp.add('skin', sphere(0.115, hs, hr), at(M4.trs(head.x, head.y, head.z + 0.03, 0.18, 0, 0, 0.88, 0.92, 1.38)));
    pp.add('leather', sphere(0.124, hs, lite ? 5 : 10, 0, Math.PI * 2, 0, Math.PI * 0.55), at(M4.trs(head.x, head.y + 0.02, head.z - 0.02, -0.3, 0, 0, 0.94, 0.95, 1.15)));
    for (const sd of [-1, 1]) {
      pp.add('leather', cyl(0.012, 0.032, 0.14, lite ? 5 : 7), at(M4.trs(head.x + sd * 0.085, head.y + 0.09, head.z - 0.06, -0.75, 0, sd * -0.35)));
      if (!lite) pp.add('chrome', cyl(0.048, 0.052, 0.05, 12), at(M4.trs(head.x + sd * 0.058, head.y + 0.035, head.z + 0.13, HALF, 0, 0)));
      pp.add('glow', sphere(0.038, lite ? 6 : 10, lite ? 4 : 8), at(M4.trs(head.x + sd * 0.058, head.y + 0.035, head.z + 0.15, 0, 0, 0, 1, 0.8, 0.45)));
    }
  } else if (kind === 'crest') { // tall swept cranial fin, twin trailing head-tails, wrap visor
    pp.add('skin', sphere(0.112, hs, hr), at(M4.trs(head.x, head.y, head.z, -0.25, 0, 0, 0.9, 1.15, 1.25)));
    pp.add('suit', rbox(0.045, 0.14, 0.24, 0.018), at(M4.trs(head.x, head.y + 0.11, head.z - 0.06, -0.35, 0, 0)));
    for (const sd of [-1, 1]) pp.add('skin', tube([V(head.x + sd * 0.08, head.y + 0.02, head.z - 0.06), V(head.x + sd * 0.11, head.y - 0.1, head.z - 0.18), V(head.x + sd * 0.09, head.y - 0.24, head.z - 0.22)], 0.032, lite ? 4 : 8, lite ? 5 : 7), base);
    pp.add('visor', sphere(0.118, hs, lite ? 4 : 8, 0, Math.PI, Math.PI * 0.25, Math.PI * 0.32), at(M4.trs(head.x, head.y + 0.02, head.z + 0.02, 0, 0, 0, 1.02, 0.9, 1.05)));
  } else if (kind === 'aero') { // full-face armoured aero helmet, dorsal fin, glowing visor line
    pp.add('suit', sphere(0.138, hs, hr), at(M4.trs(head.x, head.y + 0.015, head.z, 0, 0, 0, 0.98, 1.06, 1.22)));
    pp.add('dark', rbox(0.04, 0.09, 0.26, 0.012), at(M4.trs(head.x, head.y + 0.13, head.z - 0.05, -0.2, 0, 0)));
    pp.add('visor', sphere(0.141, hs, lite ? 4 : 8, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.34), at(M4.trs(head.x, head.y + 0.015, head.z + 0.015, 0, 0, 0, 1.0, 0.95, 1.2)));
    pp.add('glow', rbox(0.16, 0.016, 0.02, 0.004), at(M4.t(head.x, head.y + 0.02, head.z + 0.165)));
  } else if (kind === 'dome') { // broad pressurised dome helmet, rangefinder bar, twin antennae
    pp.add('chrome', sphere(0.136, hs, hr), at(M4.trs(head.x, head.y + 0.01, head.z, 0, 0, 0, 1.12, 0.96, 1.08)));
    pp.add('dark', rbox(0.24, 0.065, 0.09, 0.016), at(M4.t(head.x, head.y + 0.025, head.z + 0.11)));
    pp.add('glow', rbox(0.2, 0.026, 0.02, 0.005), at(M4.t(head.x, head.y + 0.025, head.z + 0.156)));
    if (!lite) for (const sd of [-1, 1]) pp.add('steel', cyl(0.008, 0.012, 0.16, 6), at(M4.trs(head.x + sd * 0.13, head.y + 0.11, head.z - 0.02, -0.3, 0, sd * -0.2)));
  } else if (kind === 'maul') { // Ursk: broad furry head, round ears, short muzzle, leather cap, small goggles
    pp.add('skin', sphere(0.135, hs, hr), at(M4.trs(head.x, head.y, head.z, 0, 0, 0, 1.1, 1, 1.05)));
    pp.add('skin', sphere(0.07, lite ? 6 : 10, lite ? 4 : 8), at(M4.trs(head.x, head.y - 0.04, head.z + 0.115, 0, 0, 0, 1, 0.8, 1)));
    pp.add('dark', sphere(0.022, 6, 4), at(M4.t(head.x, head.y - 0.025, head.z + 0.185)));
    pp.add('leather', sphere(0.142, hs, lite ? 5 : 10, 0, Math.PI * 2, 0, Math.PI * 0.42), at(M4.trs(head.x, head.y + 0.005, head.z - 0.01, -0.3, 0, 0, 1.1, 1.02, 1.08)));
    for (const sd of [-1, 1]) {
      pp.add('skin', sphere(0.045, lite ? 6 : 8, lite ? 4 : 6), at(M4.trs(head.x + sd * 0.11, head.y + 0.105, head.z - 0.01, 0, 0, 0, 1, 1, 0.5)));
      pp.add('visor', sphere(0.034, lite ? 6 : 10, lite ? 4 : 8, 0, Math.PI * 2, 0, HALF), at(M4.trs(head.x + sd * 0.056, head.y + 0.04, head.z + 0.122, HALF, 0, 0, 1, 0.5, 1)));
      if (!lite) pp.add('chrome', torus(0.036, 0.008, 5, 12), at(M4.t(head.x + sd * 0.056, head.y + 0.04, head.z + 0.128)));
    }
  } else if (kind === 'veil') { // Nerai: tall slender skull, glassy sail crest, dark eye band, two long trailing tendrils, neck ring
    pp.add('skin', sphere(0.108, hs, hr), at(M4.trs(head.x, head.y + 0.02, head.z, -0.15, 0, 0, 0.86, 1.28, 1.05)));
    pp.add('visor', sphere(0.112, hs, lite ? 4 : 8, 0, Math.PI, Math.PI * 0.32, Math.PI * 0.2), at(M4.trs(head.x, head.y + 0.03, head.z + 0.012, 0, 0, 0, 0.9, 1.1, 1.08)));
    pp.add('glass', fin([[-0.02, 0], [0.16, 0], [0.02, 0.24], [-0.2, 0.2]], 0.012), at(M4.t(head.x, head.y + 0.12, head.z - 0.04)));
    for (const sd of [-1, 1]) pp.add('skin', tube([V(head.x + sd * 0.07, head.y + 0.06, head.z - 0.07), V(head.x + sd * 0.1, head.y - 0.08, head.z - 0.2), V(head.x + sd * 0.07, head.y - 0.3, head.z - 0.26)], 0.02, lite ? 4 : 8, lite ? 4 : 6), base);
    if (!lite) pp.add('chrome', torus(0.085, 0.01, 5, 16), at(M4.trs(head.x, head.y - 0.1, head.z, HALF, 0, 0)));
  } else if (kind === 'horn') { // Brakkan: broad skull, bony brow plate, two forward-curving horns, steel jaw guard, small glowing eyes
    pp.add('skin', sphere(0.125, hs, hr), at(M4.trs(head.x, head.y, head.z, 0, 0, 0, 1.16, 0.96, 1.08)));
    pp.add('leather', rbox(0.24, 0.05, 0.14, 0.02), at(M4.trs(head.x, head.y + 0.085, head.z + 0.06, 0.25, 0, 0)));
    pp.add('steel', sphere(0.118, hs, lite ? 4 : 8, 0, Math.PI, Math.PI * 0.56, Math.PI * 0.3), at(M4.trs(head.x, head.y - 0.005, head.z + 0.015, 0, 0, 0, 1.14, 1, 1.12)));
    for (const sd of [-1, 1]) {
      pp.add('leather', tube([V(head.x + sd * 0.11, head.y + 0.06, head.z - 0.01), V(head.x + sd * 0.21, head.y + 0.1, head.z + 0.02), V(head.x + sd * 0.25, head.y + 0.2, head.z + 0.1)], 0.028, lite ? 4 : 8, lite ? 5 : 7), base);
      if (!lite) pp.add('leather', lathe(prof([[0.028, 0], [0, 0.09]]), 7, 0), at(M4.trs(head.x + sd * 0.25, head.y + 0.2, head.z + 0.1, -0.9, sd * 0.3, 0)));
      pp.add('glow', sphere(0.02, 6, 4), at(M4.t(head.x + sd * 0.05, head.y + 0.035, head.z + 0.125)));
    }
  } else if (kind === 'optic') { // Synth droid: drum-shaped sensor head, one big glowing lens, twin antennas, copper neck gimbal
    pp.add('steel', cyl(0.105, 0.115, 0.2, lite ? 8 : 16), at(M4.t(head.x, head.y + 0.005, head.z)));
    pp.add('dark', sphere(0.106, hs, lite ? 4 : 8, 0, Math.PI * 2, 0, HALF), at(M4.trs(head.x, head.y + 0.1, head.z, 0, 0, 0, 1, 0.5, 1)));
    pp.add('dark', cyl(0.062, 0.07, 0.05, lite ? 8 : 14), at(M4.trs(head.x, head.y + 0.02, head.z + 0.105, HALF, 0, 0)));
    pp.add('glow', sphere(0.046, lite ? 6 : 12, lite ? 4 : 8), at(M4.trs(head.x, head.y + 0.02, head.z + 0.125, 0, 0, 0, 1, 1, 0.5)));
    if (!lite) {
      pp.add('chrome', torus(0.064, 0.01, 5, 14), at(M4.t(head.x, head.y + 0.02, head.z + 0.132)));
      for (const sd of [-1, 1]) pp.add('steel', cyl(0.006, 0.01, 0.2, 5), at(M4.trs(head.x + sd * 0.11, head.y + 0.16, head.z - 0.03, -0.25, 0, sd * -0.3)));
      pp.add('copper', torus(0.07, 0.016, 5, 14), at(M4.trs(head.x, head.y - 0.11, head.z, HALF, 0, 0)));
    }
  } else { // 'goggles': classic flight helmet with chrome rim and twin racing goggles
    pp.add('skin', sphere(0.112, hs, hr), at(M4.trs(head.x, head.y - 0.015, head.z + 0.02, 0, 0, 0, 0.95, 1.05, 1)));
    pp.add('leather', sphere(0.13, hs, lite ? 5 : 12, 0, Math.PI * 2, 0, Math.PI * 0.64), at(M4.trs(head.x, head.y + 0.012, head.z - 0.015, -0.25, 0, 0, 1, 1.05, 1.1)));
    if (!lite) {
      pp.add('chrome', rbox(0.032, 0.04, 0.22, 0.008), at(M4.trs(head.x, head.y + 0.135, head.z - 0.02, -0.18, 0, 0)));
      pp.add('rubber', torus(0.122, 0.013, 6, 24), at(M4.trs(head.x, head.y + 0.035, head.z, HALF - 0.2, 0, 0)));
    }
    for (const sd of [-1, 1]) {
      if (!lite) pp.add('chrome', cyl(0.046, 0.05, 0.046, 14), at(M4.trs(head.x + sd * 0.052, head.y + 0.03, head.z + 0.105, HALF, 0, 0)));
      pp.add('visor', sphere(0.041, lite ? 6 : 12, lite ? 4 : 8, 0, Math.PI * 2, 0, HALF), at(M4.trs(head.x + sd * 0.052, head.y + 0.03, head.z + 0.128, HALF, 0, 0, 1, 0.45, 1)));
    }
  }
  // arms: shoulder → elbow belongs to the pilot body, elbow → hand + glove stays visible in the cockpit camera
  const hands: THREE.Vector3[] = [];
  [-1, 1].forEach((sd, i) => {
    const sh = W(V(sd * 0.22, 0.46, 0.09)), hd = reach ? reach[i].clone() : W(V(sd * 0.21, 0.31, 0.5));
    const el = sh.clone().lerp(hd, 0.5).add(V(sd * 0.09 * s, -0.11 * s, -0.02 * s));
    if (!lite) pp.add('suit', sphere(0.085 * s, 12, 10), M4.t(sh.x, sh.y, sh.z));
    pp.add('suit', tube([sh, sh.clone().lerp(el, 0.55), el], 0.055 * s, lite ? 3 : 8, lite ? 5 : 10));
    k.pb.add('suit', tube([el, el.clone().lerp(hd, 0.55), hd], 0.05 * s, lite ? 3 : 8, lite ? 5 : 10));
    k.pb.add('leather', sphere(0.062 * s, lite ? 6 : 12, lite ? 5 : 10), M4.trs(hd.x, hd.y, hd.z + 0.02 * s, 0, 0, 0, 1, 0.9, 1.2));
    hands.push(hd);
  });
  return { head: W(head), eye: W(V(0, head.y + 0.03, head.z + 0.03)), hands };
}

/** Control levers under the hands. */
function levers(k: Kit, hands: THREE.Vector3[], floorY: number) {
  if (!k.hi) return;
  for (const hd of hands) {
    const b = V(hd.x, floorY + 0.05, hd.z + 0.1);
    k.pb.add('steel', tube([b, V(hd.x, (b.y + hd.y) / 2, hd.z + 0.08), V(hd.x, hd.y - 0.07, hd.z)], 0.022, 8, 6));
    k.pb.add('rubber', cyl(0.032, 0.032, 0.12, 10), M4.t(hd.x, hd.y - 0.06, hd.z));
    k.pb.add('glow', sphere(0.018, 8, 6), M4.t(hd.x, hd.y + 0.01, hd.z + 0.03));
  }
}

/** Dashboard panel tilted towards the pilot. `gauges` round dials, `screens` flat glowing displays. Places the three live lamps on its top edge. */
function dash(k: Kit, pos: THREE.Vector3, dw: number, gauges: number, screens = 0, tilt = -0.65) {
  const D = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), V(1, 1, 1));
  k.pb.add('dark', rbox(dw, 0.06, 0.34, 0.03), D); // plain dark panel (the instrument texture would show its lettering mirrored here)
  if (k.hi) {
    // layout across the panel: round dials on the left / right, bar-graph displays in the middle
    const slots = gauges + screens * 2, step = dw / (slots + 0.5); let x = -(slots - 1) / 2 * step;
    const dial = (gx: number, i: number) => {
      const m = D.clone().multiply(M4.trs(gx, 0.032, 0.03 + 0.02 * (i % 2), -HALF, 0, 0)), r = Math.min(0.04, step * 0.4);
      k.pb.add('glow', new THREE.CircleGeometry(r, 16), m); k.pb.add('chrome', torus(r * 1.12, 0.008, 6, 18), m);
      k.pb.add('dark', rbox(0.006, r * 0.9, 0.004, 0.001), m.clone().multiply(M4.trs(0, r * 0.4, 0.004, 0, 0, (i * 1.9) % 2.4 - 1.2))); // needle
    };
    const left = Math.ceil(gauges / 2);
    for (let i = 0; i < left; i++) { dial(x, i); x += step; }
    for (let s = 0; s < screens; s++) { // a display = dark bezel + a row of glowing bars of different heights
      const cx = x + step * 0.5, sw = step * 1.7; x += step * 2;
      k.pb.add('steel', rbox(sw, 0.016, 0.17, 0.004), D.clone().multiply(M4.t(cx, 0.032, 0)));
      const nB = 7; for (let b = 0; b < nB; b++) { const h = 0.03 + 0.1 * Math.abs(Math.sin((b + 1) * (2.1 + s * 1.3))); k.pb.add('glow', rbox(sw / (nB * 1.7), 0.006, h, 0.001), D.clone().multiply(M4.t(cx + (b - (nB - 1) / 2) * (sw * 0.86 / nB), 0.043, 0.07 - h / 2))); }
    }
    for (let i = left; i < gauges; i++) { dial(x, i); x += step; }
    k.pb.add('chrome', rbox(dw + 0.03, 0.02, 0.02, 0.006), D.clone().multiply(M4.t(0, 0.03, -0.165)));
    if (k.ultra) { // Ultra: a row of toggle switches with tell-tales along the top edge and two grab rails
      const nT = Math.max(4, Math.round(dw / 0.07));
      for (let i = 0; i < nT; i++) { const tx = (i - (nT - 1) / 2) * (dw * 0.86 / nT); k.pb.add('chrome', rbox(0.012, 0.03, 0.012, 0.002), D.clone().multiply(M4.trs(tx, 0.044, 0.14, (i % 3 - 1) * 0.35, 0, 0))); if (i % 2 === 0) k.pb.add('glow', rbox(0.014, 0.006, 0.014, 0.001), D.clone().multiply(M4.t(tx, 0.034, 0.115))); }
      for (const sd of [-1, 1]) k.pb.add('chrome', tube([V(sd * dw * 0.52, 0.0, -0.14).applyMatrix4(D), V(sd * dw * 0.56, 0.06, 0).applyMatrix4(D), V(sd * dw * 0.52, 0.0, 0.14).applyMatrix4(D)], 0.012, 8, 5));
    }
  }
  k.lampN.set(0, 1, 0).transformDirection(D);
  k.lampAt = [-1, 0, 1].map(i => V(i * dw * 0.3, 0.036, -0.125).applyMatrix4(D));
}

type Glass = 'dome' | 'wrap' | 'bubble' | 'fly';
/** Windscreen with chrome frame, centred at `pos`, scaled (sx wide, sy high, sz long). */
function windscreen(k: Kit, kind: Glass, pos: THREE.Vector3, sx: number, sy: number, sz: number) {
  const m = M4.trs(pos.x, pos.y, pos.z, 0, 0, 0, sx, sy, sz), ws = k.d === 0 ? 12 : 28, hs = k.d === 0 ? 5 : 10;
  if (kind === 'bubble') { // full canopy over the pilot
    k.pb.add('glass', sphere(1, ws, hs, 0, Math.PI * 2, 0, HALF), m);
    if (k.hi) { k.pb.add('chrome', torus(1, 0.02, 6, 28), m.clone().multiply(new THREE.Matrix4().makeRotationX(HALF))); k.pb.add('chrome', torus(1, 0.014, 5, 20, Math.PI), m); }
  } else if (kind === 'wrap') { // low swept band around the front half
    k.pb.add('glass', sphere(1, ws, hs, 0, Math.PI, Math.PI * 0.18, Math.PI * 0.32), m);
    if (k.hi) { k.pb.add('chrome', torus(1, 0.02, 6, 28, Math.PI), m.clone().multiply(new THREE.Matrix4().makeRotationX(HALF))); k.pb.add('chrome', torus(Math.sin(Math.PI * 0.18), 0.016, 5, 20, Math.PI), m.clone().multiply(M4.trs(0, Math.cos(Math.PI * 0.18), 0, HALF, 0, 0))); }
  } else if (kind === 'fly') { // tiny deflector
    k.pb.add('glass', sphere(1, ws, hs, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.1, Math.PI * 0.4), m);
    if (k.hi) k.pb.add('chrome', torus(1, 0.03, 5, 16, Math.PI * 0.6), m.clone().multiply(M4.trs(0, 0, 0, HALF, 0, Math.PI * 0.2)));
  } else { // 'dome': quarter sphere in front of the pilot
    k.pb.add('glass', sphere(1, ws, hs, 0, Math.PI, 0, HALF), m);
    if (k.hi) k.pb.add('chrome', torus(1, 0.022, 6, 28, Math.PI), m.clone().multiply(new THREE.Matrix4().makeRotationX(HALF)));
  }
}

/** Cable anchor eyes on the front deck (the control cables of each side meet here). */
function anchors(k: Kit, a: [THREE.Vector3, THREE.Vector3]): [THREE.Vector3, THREE.Vector3] {
  for (const p of a) { k.pb.add('chrome', torus(0.06, 0.02, 6, k.hi ? 14 : 8), M4.trs(p.x, p.y, p.z, 0, HALF, 0)); k.pb.add('steel', rbox(0.1, 0.1, 0.16, 0.02), M4.t(p.x, p.y - 0.07, p.z)); }
  return a;
}
/** Default anchor points: on the tub two sections ahead of the opening. */
function tubAnchors(k: Kit, T: Tub) {
  const fr = T.secs[Math.min(T.secs.length - 1, T.iB + 2)];
  return anchors(k, [V(-fr.w * 0.45, fr.hT * 0.75 + 0.06, fr.z), V(fr.w * 0.45, fr.hT * 0.75 + 0.06, fr.z)]);
}
/** Belly repulsor plate with glow strip. */
function belly(k: Kit, w: number, l: number, y: number, z: number) {
  k.pb.add('dark', rbox(w, 0.07, l, 0.03), M4.t(0, y, z));
  k.pb.add('glow', rbox(w * 0.64, 0.025, l * 0.84, 0.01), M4.t(0, y - 0.045, z));
  if (k.ultra) for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) k.pb.add('chrome', cyl(0.022, 0.022, 0.016, 6), M4.t(sx * w * 0.42, y - 0.04, z + (i - 1.5) * l * 0.26)); // Ultra: emitter studs
}
/** Thin swept plate (fin / winglet): polygon in the YZ plane (points [z, y]), `t` thick, painted in the secondary colour. */
function fin(pts: [number, number][], t: number) { const g = extrude(pts, t, Math.min(0.012, t * 0.3)); g.rotateY(-HALF); return g; }
const SEC: [number, number, number] = [0, 0, 3];
/** A Bruchteil: built into its own part set. */
function part(k: Kit, id: string, center: THREE.Vector3, build: (pb: PartBuilder) => void) {
  const pb = new PartBuilder(); build(pb); k.breaks.push({ id, parts: pb.build() as Map<MatKey, THREE.BufferGeometry>, center });
}

// ------------------------------------------------------------------ the designs
type Design = (k: Kit) => CockpitInfo;

/** Aurora XR-7 – clean racing teardrop: wrap aero screen, twin headrest fairings, canards like the engine wings, gyro at the tail. */
const aurora: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.12, 0.1, 0.1, 2.2, 0], [-0.44, 0.5, 0.34, 0.34, 2.3, 0], [-0.34, 0.84, 0.44, 0.5, 2.5, 0], [-0.22, 0.98, 0.4, 0.56, 2.6, 0.5], [-0.06, 1, 0.36, 0.57, 2.6, 0.6], [0.08, 0.95, 0.36, 0.54, 2.6, 0.5], [0.2, 0.82, 0.42, 0.47, 2.4, 0], [0.34, 0.56, 0.36, 0.36, 2.3, 0], [0.45, 0.26, 0.2, 0.2, 2.2, 0], [0.5, 0.05, 0.05, 0.05, 2, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.06, T.zB - 0.2), Math.min(T.wMax * 1.3, 1.4), 5);
  windscreen(k, 'wrap', V(0, T.rimY - 0.2, T.zB - 0.38 * (T.zB - T.zA)), T.wMax * 0.95, 0.72, 0.78);
  // twin streamlined headrest fairings
  for (const sd of [-1, 1]) pb.add('hull', loft([{ z: -0.62, w: 0.02, hT: 0.02, hB: 0.02 }, { z: -0.4, w: 0.13, hT: 0.2, hB: 0.1 }, { z: -0.1, w: 0.17, hT: 0.3, hB: 0.12 }, { z: 0.16, w: 0.13, hT: 0.2, hB: 0.1 }, { z: 0.3, w: 0.03, hT: 0.04, hB: 0.03 }], k.hi ? 12 : 6, 3), M4.t(sd * hw * 0.42, T.rimY + 0.06, T.zA + 0.1));
  // canards: flat plates like the engine wings
  for (const sd of [-1, 1]) {
    pb.add('hull', rbox(hw * 0.75, 0.04, 0.5, 0.015), M4.trs(sd * hw * 0.92, -0.04, len * 0.3, 0, sd * -0.32, sd * -0.1), SEC);
    if (k.hi) pb.add('steel', rbox(hw * 0.78, 0.05, 0.04, 0.01), M4.trs(sd * hw * 0.96, -0.04, len * 0.3 + 0.27, 0, sd * -0.32, sd * -0.1));
  }
  // gyro stabiliser on a short tail boom (Bruchteil: its loss costs turn)
  const gz = -len * 0.5 - 0.42;
  pb.add('steel', tube([V(0, 0.1, -len * 0.5 + 0.2), V(0, 0.16, gz + 0.2)], 0.045, 4, 6));
  part(k, 'gyro', V(0, 0.16, gz), g => {
    g.add('chrome', torus(0.26, 0.022, 6, k.hi ? 22 : 10), M4.t(0, 0.16, gz));
    g.add('chrome', torus(0.2, 0.02, 6, k.hi ? 20 : 10), M4.trs(0, 0.16, gz, 0, HALF, 0));
    g.add('dark', sphere(0.11, k.hi ? 12 : 6, k.hi ? 8 : 4), M4.t(0, 0.16, gz));
    g.add('glow', torus(0.115, 0.012, 5, k.hi ? 16 : 8), M4.trs(0, 0.16, gz, HALF, 0, 0));
  });
  belly(k, T.wMax * 1.05, len * 0.5, -T.hBm - 0.03, 0);
  if (k.hi) for (const sd of [-1, 1]) pb.add('glow', sphere(0.04, 8, 6), M4.t(sd * hw * 0.5, 0, -len * 0.47));
  pb.add('chrome', lathe(prof([[0.05 * hw, 0], [0.035 * hw, 0.14], [0, 0.34]]), k.hi ? 14 : 6, 0), M4.t(0, 0, len * 0.5 - 0.02));
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Hollo Needle – javelin dart: long nose probe, one tall fin, reclined pilot under a narrow canopy. */
const mavik: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.1, 0.1, 0.1, 2.2, 0], [-0.42, 0.52, 0.34, 0.3, 2.4, 0], [-0.3, 0.84, 0.44, 0.46, 2.6, 0], [-0.2, 0.96, 0.42, 0.52, 2.6, 0.42], [-0.04, 1, 0.38, 0.54, 2.6, 0.5], [0.1, 0.92, 0.38, 0.5, 2.6, 0.4], [0.2, 0.76, 0.4, 0.42, 2.4, 0], [0.34, 0.46, 0.3, 0.3, 2.3, 0], [0.45, 0.2, 0.15, 0.15, 2.2, 0], [0.5, 0.06, 0.05, 0.05, 2, 0]]);
  const hip = V(0, T.floorY * 0.42, T.hip.z - 0.06), lean = 0.5;
  seat(k, hip, lean); const P = pilot(k, hip, lean, [V(-0.2 * k.s, hip.y + 0.26, hip.z + 0.62), V(0.2 * k.s, hip.y + 0.26, hip.z + 0.62)]); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.05, T.zB - 0.12), Math.min(T.wMax * 1.2, 1.0), 3, 0, -0.75);
  windscreen(k, 'bubble', V(0, T.rimY - 0.04, (T.zA + T.zB) * 0.5 - 0.02), T.wMax * 0.8, 0.5, (T.zB - T.zA) * 0.56); // narrow canopy over the reclined pilot
  // long nose probe (Bruchteil) with sensor collar
  part(k, 'probe', V(0, 0, len * 0.5 + 0.5), g => {
    g.add('chrome', lathe(prof([[0.05, 0], [0.032, 0.25], [0.02, 0.9], [0, 1.15]]), k.hi ? 12 : 6, 0), M4.t(0, 0, len * 0.5 - 0.04));
    g.add('dark', torus(0.05, 0.016, 5, k.hi ? 12 : 6), M4.t(0, 0, len * 0.5 + 0.2));
    g.add('glow', sphere(0.022, 6, 4), M4.t(0, 0, len * 0.5 + 1.1));
  });
  // one tall swept dorsal fin (Bruchteil)
  part(k, 'fin', V(0, T.rimY + 0.5, -len * 0.3), g => {
    g.add('hull', fin([[0, 0], [0.95, 0], [0.4, 0.95], [0.08, 0.98]], 0.05), M4.t(0, 0.28 * hw, -len * 0.5 + 0.12), SEC);
    if (k.hi) g.add('glow', sphere(0.03, 6, 4), M4.t(0, 0.28 * hw + 0.98, -len * 0.5 + 0.22));
  });
  if (k.hi) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) pb.add('dark', rbox(0.02, 0.12 * hw, 0.16, 0.006), M4.trs(sd * hw * 0.97, -0.02, -len * 0.16 + i * 0.2, 0, sd * 0.5, 0));
  belly(k, T.wMax * 0.9, len * 0.5, -T.hBm - 0.02, 0);
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Tyr Vespa – wasp scooter: slim striped body, open saddle frame with handlebars, tiny fly screen, stinger tail. */
const rattis: Design = (k) => {
  const { hw, len, pb } = k;
  // slim wasp body: thorax + striped abdomen (no tub – the pilot rides on top)
  const body: Section[] = [{ z: -0.5 * len, w: 0.03, hT: 0.03, hB: 0.03 }, { z: -0.4 * len, w: 0.26 * hw, hT: 0.2 * hw, hB: 0.22 * hw }, { z: -0.22 * len, w: 0.5 * hw, hT: 0.3 * hw, hB: 0.4 * hw }, { z: -0.06 * len, w: 0.36 * hw, hT: 0.2 * hw, hB: 0.34 * hw },
    { z: 0.1 * len, w: 0.52 * hw, hT: 0.26 * hw, hB: 0.44 * hw }, { z: 0.3 * len, w: 0.46 * hw, hT: 0.3 * hw, hB: 0.36 * hw }, { z: 0.44 * len, w: 0.24 * hw, hT: 0.2 * hw, hB: 0.2 * hw }, { z: 0.5 * len, w: 0.05, hT: 0.05, hB: 0.05 }];
  const bSeg = k.d === 0 ? 10 : Math.max(20, k.seg);
  pb.add('hull', loft(body.map(s => ({ ...s, n: 2.3 })), bSeg, 2));
  // wasp stripes: thin bands of the secondary colour hugging the abdomen
  const bodyAt = (z: number): Section => { let i = 0; while (i < body.length - 2 && body[i + 1].z < z) i++; const a = body[i], b = body[i + 1], t = (z - a.z) / (b.z - a.z), m = (p: number, q: number) => (p + (q - p) * t) * 1.045; return { z, w: m(a.w, b.w), hT: m(a.hT, b.hT), hB: m(a.hB, b.hB), n: 2.3 }; };
  for (const z of [-0.36, -0.29, -0.22, -0.15]) pb.add('hull', loft([bodyAt(z * len), bodyAt((z + 0.035) * len)], bSeg, 3, [false, false]));
  // open tube frame + saddle
  const hip = V(0, 0.3 * hw + 0.02, -0.02 * len);
  for (const sd of [-1, 1]) {
    pb.add('steel', tube([V(sd * 0.3 * hw, 0.16 * hw, -0.3 * len), V(sd * 0.42 * hw, 0.36 * hw, -0.1 * len), V(sd * 0.36 * hw, 0.3 * hw, 0.2 * len), V(sd * 0.16 * hw, 0.2 * hw, 0.4 * len)], 0.035, k.hi ? 14 : 6, 6));
    if (k.hi) pb.add('steel', tube([V(sd * 0.42 * hw, 0.36 * hw, -0.1 * len), V(sd * 0.3 * hw, -0.1 * hw, 0.02 * len)], 0.028, 4, 6));
  }
  pb.add('leather', rbox(0.34, 0.1, 0.62, 0.045), M4.t(0, hip.y - 0.05, hip.z + 0.02));
  pb.add('leather', rbox(0.3, 0.2, 0.1, 0.04), M4.trs(0, hip.y + 0.07, hip.z - 0.32, -0.3, 0, 0));
  // handlebars on a steering stem; the pilot leans forward and grips them
  const hb = V(0, hip.y + 0.36 * k.s, hip.z + 0.56 * k.s), grip: [THREE.Vector3, THREE.Vector3] = [V(-0.27, hb.y, hb.z - 0.05), V(0.27, hb.y, hb.z - 0.05)];
  pb.add('steel', tube([V(0, 0.22 * hw, hb.z + 0.12), V(0, hb.y - 0.1, hb.z + 0.04), hb], 0.03, 6, 6));
  pb.add('chrome', tube([grip[0], V(-0.12, hb.y + 0.03, hb.z + 0.02), hb, V(0.12, hb.y + 0.03, hb.z + 0.02), grip[1]], 0.022, k.hi ? 14 : 6, 6));
  for (const g of grip) pb.add('rubber', cyl(0.03, 0.03, 0.14, k.hi ? 10 : 6), M4.trs(g.x, g.y, g.z, 0, 0, HALF));
  const P = pilot(k, hip, -0.42, grip);
  dash(k, V(0, hb.y - 0.06, hb.z + 0.16), 0.26, 2, 0, -1.1); // small binnacle between the bars
  windscreen(k, 'fly', V(0, hb.y - 0.12, hb.z + 0.02), 0.34, 0.42, 0.36);
  // stinger tail (Bruchteil) and two small vanes
  part(k, 'stinger', V(0, 0, -0.5 * len - 0.3), g => { g.add('chrome', lathe(prof([[0, -0.72], [0.045, -0.25], [0.07, 0]]), k.hi ? 12 : 6, 0), M4.t(0, 0, -0.5 * len + 0.04)); /* profile runs towards +z: outward faces */ g.add('dark', torus(0.07, 0.02, 5, k.hi ? 12 : 6), M4.t(0, 0, -0.5 * len + 0.02)); });
  for (const sd of [-1, 1]) pb.add('hull', fin([[0, 0], [0.5, 0], [0.16, 0.34]], 0.03), M4.trs(sd * 0.2 * hw, 0.1 * hw, -0.47 * len, 0, 0, sd * -1.0), SEC);
  belly(k, 0.6 * hw, len * 0.5, -0.44 * hw - 0.02, 0.05 * len);
  if (k.hi) { pb.add('glow', sphere(0.05, 8, 6), M4.t(0, 0.04, 0.5 * len + 0.02)); for (const sd of [-1, 1]) pb.add('glow', sphere(0.03, 6, 4), M4.t(sd * 0.2 * hw, 0.05, -0.46 * len)); }
  return { head: P.head, eye: P.eye, anchors: anchors(k, [V(-0.3 * hw, 0.24 * hw, 0.36 * len), V(0.3 * hw, 0.24 * hw, 0.36 * len)]) };
};

/** Mak Starling – bird: beak nose, swept winglets, long dorsal fin, split tail air-brake petals, chrome trim. */
const elana: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.16, 0.12, 0.12, 2.3, 0], [-0.44, 0.56, 0.34, 0.32, 2.4, 0], [-0.32, 0.86, 0.38, 0.44, 2.6, 0.45], [-0.16, 0.94, 0.33, 0.48, 2.6, 0.58], [-0.02, 0.9, 0.32, 0.46, 2.6, 0.5], [0.1, 0.78, 0.36, 0.42, 2.5, 0], [0.26, 0.54, 0.34, 0.32, 2.4, 0], [0.4, 0.3, 0.26, 0.18, 2.2, 0], [0.5, 0.06, 0.08, 0.05, 2, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.06, T.zB - 0.16), Math.min(T.wMax * 1.25, 1.2), 3, 1);
  windscreen(k, 'dome', V(0, T.rimY - 0.02, T.zB - 0.42 * (T.zB - T.zA)), T.wMax * 0.7, 0.36, 0.62);
  pb.add('chrome', lathe(prof([[0.07, 0], [0.05, 0.16], [0.012, 0.42], [0, 0.46]]), k.hi ? 12 : 6, 0), M4.trs(0, -0.03, len * 0.5 - 0.03, 0.2, 0, 0)); // down-turned beak
  // swept winglets (Bruchteile: grip) and the long dorsal fin (Bruchteil: turn)
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'wingL' : 'wingR', V(sd * hw * 1.3, 0, -0.1 * len), g => {
    const w = extrude([[0, 0], [0.78, 0.62], [0.86, 0.92], [0.52, 0.86], [0, 0.46]], 0.035, 0.01); w.rotateX(-HALF); // x = outwards, shape +y = backwards
    const m = M4.trs(sd * hw * 0.9, 0.02, 0.12 * len, 0, 0, sd * 0.14); if (sd < 0) m.multiply(M4.mirrorX());
    g.add('hull', w, m, SEC);
    if (k.hi) g.add('glow', sphere(0.028, 6, 4), M4.t(sd * (hw * 0.9 + 0.84), 0.13, 0.12 * len - 0.9));
  });
  part(k, 'fin', V(0, 0.9, -0.3 * len), g => g.add('hull', fin([[0, 0], [1.25, 0], [0.5, 1.12], [0.1, 1.18]], 0.06), M4.t(0, 0.3 * hw, -0.5 * len + 0.06), SEC));
  // split tail air-brake petals (Bruchteil: braking)
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'petalL' : 'petalR', V(sd * 0.3, 0, -0.5 * len - 0.2), g => g.add('hull', rbox(0.04, 0.42 * hw, 0.5, 0.012), M4.trs(sd * 0.3 * hw, 0, -0.5 * len - 0.14, 0, sd * -0.42, 0), SEC));
  if (k.hi) for (const sd of [-1, 1]) pb.add('chrome', tube([V(sd * hw * 0.5, T.rimY + 0.02, T.zA), V(sd * hw * 0.92, T.rimY - 0.02, (T.zA + T.zB) / 2), V(sd * hw * 0.52, T.rimY + 0.03, T.zB + 0.1), V(sd * 0.08, 0.2 * hw, len * 0.44)], 0.016, 20, 5));
  belly(k, T.wMax, len * 0.46, -T.hBm - 0.03, -0.04 * len);
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Tenroc 6-Fach – long spindle: bubble canopy, six-arm cable hub ("spider"), whisker antennas. */
const gasvaro: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.05, 0.05, 0.05, 2.2, 0], [-0.4, 0.44, 0.3, 0.3, 2.3, 0], [-0.28, 0.82, 0.38, 0.44, 2.5, 0.4], [-0.14, 0.96, 0.34, 0.5, 2.6, 0.56], [0, 0.94, 0.34, 0.5, 2.6, 0.5], [0.12, 0.8, 0.38, 0.44, 2.5, 0], [0.26, 0.56, 0.34, 0.34, 2.3, 0], [0.4, 0.3, 0.2, 0.2, 2.2, 0], [0.5, 0.05, 0.05, 0.05, 2, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.06, T.zB - 0.14), Math.min(T.wMax * 1.2, 1.1), 2, 2);
  windscreen(k, 'bubble', V(0, T.rimY - 0.05, (T.zA + T.zB) * 0.5), T.wMax * 0.86, 0.64, (T.zB - T.zA) * 0.5);
  // spider: a hub ring on the front deck, three cable arms per side
  const hz = 0.3 * len, hy = 0.26 * hw + 0.1;
  pb.add('steel', torus(0.2, 0.035, 6, k.hi ? 18 : 8), M4.trs(0, hy, hz, HALF, 0, 0));
  pb.add('dark', cyl(0.12, 0.15, 0.12, k.hi ? 12 : 6), M4.t(0, hy - 0.02, hz));
  if (k.hi) pb.add('glow', torus(0.1, 0.012, 5, 14), M4.trs(0, hy + 0.05, hz, HALF, 0, 0));
  const A: [THREE.Vector3, THREE.Vector3] = [V(-0.76, hy + 0.24, hz + 0.34), V(0.76, hy + 0.24, hz + 0.34)]; // the outermost arm tips carry the cables
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
    const tip = V(sd * (0.36 + i * 0.2), hy + 0.1 + i * 0.07, hz + 0.34 - (2 - i) * 0.2);
    pb.add('steel', tube([V(sd * 0.16, hy, hz), V(sd * (0.2 + i * 0.1), hy + 0.12, hz + 0.1), tip], 0.026, k.hi ? 8 : 4, 5));
    pb.add('copper', sphere(0.05, k.hi ? 8 : 5, k.hi ? 6 : 4), M4.t(tip.x, tip.y, tip.z));
  }
  // whisker antennas at the nose and tail
  for (const sd of [-1, 1]) for (const up of [0, 1]) {
    pb.add('dark', tube([V(sd * 0.08, 0.02, len * 0.46), V(sd * (0.3 + up * 0.14), 0.16 + up * 0.26, len * 0.5 + 0.34), V(sd * (0.44 + up * 0.2), 0.2 + up * 0.44, len * 0.5 + 0.86)], 0.011, k.hi ? 8 : 4, 4));
    if (k.hi) pb.add('glow', sphere(0.02, 6, 4), M4.t(sd * (0.44 + up * 0.2), 0.2 + up * 0.44, len * 0.5 + 0.86));
  }
  for (const sd of [-1, 1]) pb.add('hull', fin([[0, 0], [0.6, 0], [0.24, 0.5]], 0.035), M4.trs(sd * 0.1, 0.12 * hw, -0.48 * len, 0, 0, sd * -0.6), SEC);
  belly(k, T.wMax, len * 0.44, -T.hBm - 0.03, -0.02 * len);
  return { head: P.head, eye: P.eye, anchors: anchors(k, A) };
};

/** Vrak Splitter-X – armoured war sled: plated wedge nose with tusk spikes, slit screen, open roll cage, twin exhaust stacks. */
const brute: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.62, 0.34, 0.34, 4.5, 0], [-0.44, 0.94, 0.4, 0.42, 4.5, 0], [-0.3, 1, 0.36, 0.44, 4.5, 0.5], [-0.1, 1, 0.32, 0.42, 4.5, 0.58], [0.06, 0.96, 0.3, 0.38, 4.5, 0.5], [0.18, 0.9, 0.3, 0.32, 4, 0], [0.34, 0.7, 0.2, 0.24, 3.6, 0], [0.5, 0.36, 0.06, 0.1, 3.2, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.05, T.zB - 0.12), Math.min(T.wMax * 1.2, 1.5), 3, 1);
  // armoured slit screen: a heavy lower plate and a thin visor bar – the pilot looks through the gap between them
  const sz = T.zB - 0.06, eyeY = P.eye.y, loH = eyeY - 0.2 - T.rimY;
  pb.add('dark', rbox(T.wMax * 1.5, loH, 0.07, 0.02), M4.trs(0, T.rimY + loH / 2 - 0.02, sz, -0.3, 0, 0));
  pb.add('dark', rbox(T.wMax * 1.5, 0.08, 0.09, 0.02), M4.trs(0, eyeY + 0.24, sz - 0.2, -0.3, 0, 0));
  pb.add('glass', rbox(T.wMax * 1.4, 0.42, 0.02, 0.006), M4.trs(0, eyeY + 0.01, sz - 0.11, -0.3, 0, 0));
  for (const sd of [-1, 1]) pb.add('steel', rbox(0.06, 0.5, 0.08, 0.02), M4.trs(sd * T.wMax * 0.74, eyeY + 0.01, sz - 0.11, -0.3, 0, 0));
  // overlapping nose armour + tusk spikes
  for (let i = 0; i < 3; i++) pb.add('steel', rbox(hw * (1.5 - i * 0.34), 0.05, 0.42, 0.015), M4.trs(0, 0.2 * hw - i * 0.045, len * (0.24 + i * 0.09), 0.2, 0, 0));
  if (k.hi) pb.add('chrome', boltRing(0.3, 8, 0.022, 0), M4.trs(0, 0.2 * hw + 0.03, len * 0.24, -HALF + 0.2, 0, 0));
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'tuskL' : 'tuskR', V(sd * hw * 0.8, 0, len * 0.5 + 0.3), g => {
    g.add('chrome', tube([V(sd * hw * 0.62, -0.1, len * 0.36), V(sd * hw * 0.86, -0.06, len * 0.5 + 0.1), V(sd * hw * 0.74, 0.1, len * 0.5 + 0.62)], 0.06, k.hi ? 10 : 5, 6));
    g.add('chrome', lathe(prof([[0.06, 0], [0, 0.26]]), 6, 0), M4.trs(sd * hw * 0.74, 0.1, len * 0.5 + 0.6, -0.32, sd * -0.2, 0));
  });
  // open roll cage
  const cz0 = T.hip.z - 0.42, cz1 = T.zB - 0.2, cy = T.rimY + 0.86 * k.s;
  for (const sd of [-1, 1]) pb.add('steel', tube([V(sd * T.wMax * 0.92, T.rimY, cz0), V(sd * T.wMax * 0.7, cy, cz0 + 0.08), V(sd * T.wMax * 0.62, cy - 0.04, (cz0 + cz1) / 2), V(sd * T.wMax * 0.86, T.rimY + 0.06, cz1)], 0.04, k.hi ? 16 : 6, 6));
  pb.add('steel', tube([V(-T.wMax * 0.7, cy, cz0 + 0.08), V(0, cy + 0.05, cz0 + 0.06), V(T.wMax * 0.7, cy, cz0 + 0.08)], 0.04, k.hi ? 8 : 4, 6));
  // twin exhaust stacks at the stern
  for (const sd of [-1, 1]) { pb.add('dark', cyl(0.09, 0.11, 0.7, k.hi ? 12 : 6), M4.trs(sd * hw * 0.62, 0.36, -len * 0.42, -0.26, 0, 0)); pb.add('copper', torus(0.095, 0.02, 5, k.hi ? 12 : 6), M4.trs(sd * hw * 0.62, 0.69, -len * 0.42 - 0.09, HALF - 0.26, 0, 0)); if (k.hi) pb.add('glow', new THREE.CircleGeometry(0.075, 10), M4.trs(sd * hw * 0.62, 0.66, -len * 0.42 - 0.08, -HALF - 0.26, 0, 0)); }
  belly(k, T.wMax * 1.1, len * 0.5, -T.hBm - 0.03, -0.02 * len);
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Quadra Lumber – flying saucer: disc hull, full glass dome, four outrigger arms like the X of its binders, light ring under the belly. */
const bomquad: Design = (k) => {
  const { hw, pb } = k; const R = hw * 1.02, n = k.d === 0 ? 14 : Math.max(28, k.seg);
  const disc = lathe(prof([[0, -0.5 * hw], [0.5 * R, -0.5 * hw, 1], [0.86 * R, -0.3 * hw], [R, -0.1 * hw, 1], [R, -0.02 * hw, 1], [0.84 * R, 0.14 * hw], [0.62 * R, 0.2 * hw, 1]]), n, 2); disc.rotateX(-HALF);
  pb.add('hull', disc);
  const tub = lathe(prof([[0.62 * R, 0.2 * hw], [0.56 * R, 0.1 * hw], [0.5 * R, -0.36 * hw, 1], [0, -0.36 * hw]]), n, 0); tub.rotateX(-HALF); pb.add('interior', tub);
  if (k.hi) { pb.add('chrome', torus(0.62 * R, 0.022, 6, n), M4.trs(0, 0.2 * hw, 0, HALF, 0, 0)); pb.add('hazard', torus(R, 0.035, 5, n), M4.trs(0, -0.06 * hw, 0, HALF, 0, 0)); pb.add('chrome', boltRing(0.92 * R, 16, 0.02, 0), M4.trs(0, -0.02 * hw, 0, -HALF, 0, 0)); }
  const hip = V(0, -0.3 * hw, -0.12);
  seat(k, hip); const P = pilot(k, hip); levers(k, P.hands, -0.36 * hw);
  dash(k, V(0, -0.02 * hw, 0.5 * R - 0.1), 0.7, 2, 2, -0.95);
  windscreen(k, 'bubble', V(0, 0.2 * hw, 0), 0.6 * R, 0.62 * R, 0.6 * R); // full dome
  // four outrigger arms in an X, tip pods glow (Bruchteile: the ring shroud of the hull they brace)
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => part(k, sx < 0 ? 'armL' : 'armR', V(sx * R, 0.2, sz * R), g => {
    const tip = V(sx * R * 1.16, 0.3 * hw, sz * R * 0.96);
    g.add('steel', tube([V(sx * R * 0.56, 0.02, sz * R * 0.5), V(sx * R * 0.9, 0.24 * hw, sz * R * 0.78), tip], 0.045, k.hi ? 8 : 4, 6));
    g.add('dark', sphere(0.1, k.hi ? 10 : 6, k.hi ? 8 : 4), M4.trs(tip.x, tip.y, tip.z, 0, 0, 0, 1, 0.8, 1.3));
    g.add('glow', sphere(0.05, 6, 4), M4.t(tip.x, tip.y, tip.z + sz * 0.11));
  }));
  // light ring under the belly + three repulsor domes
  pb.add('glow', torus(0.66 * R, 0.03, 5, n), M4.trs(0, -0.42 * hw, 0, HALF, 0, 0));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; pb.add('dark', sphere(0.14, k.hi ? 10 : 6, k.hi ? 5 : 3, 0, Math.PI * 2, HALF, HALF), M4.t(Math.sin(a) * 0.34 * R, -0.5 * hw, Math.cos(a) * 0.34 * R)); }
  if (k.hi) pb.add('dark', cyl(0.012, 0.016, 0.7, 6), M4.t(-0.5 * R, 0.5, -0.5 * R));
  return { head: P.head, eye: P.eye, anchors: anchors(k, [V(-0.5 * R, 0.2 * hw + 0.02, 0.6 * R), V(0.5 * R, 0.2 * hw + 0.02, 0.6 * R)]) };
};

/** Beerak Fireflare – cooler cockpit: finned radiator panels on both flanks, coolant tanks and vent stacks at the back, glowing coolant lines. */
const aldo: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.4, 0.3, 0.3, 3, 0], [-0.44, 0.78, 0.42, 0.42, 3, 0], [-0.32, 0.92, 0.38, 0.48, 3, 0.5], [-0.16, 0.94, 0.33, 0.5, 2.8, 0.58], [-0.02, 0.9, 0.33, 0.48, 2.8, 0.5], [0.1, 0.8, 0.37, 0.43, 2.6, 0], [0.26, 0.6, 0.33, 0.35, 2.5, 0], [0.4, 0.38, 0.23, 0.23, 2.3, 0], [0.5, 0.1, 0.07, 0.08, 2, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.06, T.zB - 0.16), Math.min(T.wMax * 1.25, 1.25), 4, 1);
  windscreen(k, 'dome', V(0, T.rimY - 0.02, T.zB - 0.42 * (T.zB - T.zA)), T.wMax * 0.74, 0.34, 0.58);
  // radiator panels: gill fins on each flank (Bruchteile: a leak costs cooling)
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'radL' : 'radR', V(sd * hw * 1.1, 0, -0.05 * len), g => {
    g.add('dark', rbox(0.1, 0.5 * hw, 0.36 * len, 0.03), M4.trs(sd * (T.wMax + 0.06), -0.04 * hw, -0.06 * len, 0, 0, sd * -0.12));
    const nF = k.hi ? 11 : 4; for (let i = 0; i < nF; i++) g.add('steel', rbox(0.2, 0.46 * hw, 0.014, 0.004), M4.trs(sd * (T.wMax + 0.16), -0.04 * hw, -0.06 * len + (i / (nF - 1) - 0.5) * 0.32 * len, 0, sd * 0.42, sd * -0.12));
    g.add('glow', rbox(0.02, 0.03, 0.34 * len, 0.006), M4.trs(sd * (T.wMax + 0.12), 0.23 * hw, -0.06 * len, 0, 0, sd * -0.12));
  });
  // copper coolant lines along the flanks
  for (const sd of [-1, 1]) pb.add('copper', tube([V(sd * 0.3, 0.3 * hw, -0.44 * len), V(sd * T.wMax * 0.95, 0.24 * hw, -0.26 * len), V(sd * (T.wMax + 0.04), 0.26 * hw, 0.1 * len), V(sd * hw * 0.5, 0.2 * hw, 0.3 * len)], 0.032, k.hi ? 18 : 6, 6));
  // twin coolant tanks + vent stacks behind the seat
  for (const sd of [-1, 1]) {
    pb.add('steel', cyl(0.15, 0.15, 0.56, k.hi ? 14 : 7), M4.trs(sd * 0.22, 0.34 * hw + 0.08, -0.43 * len, HALF, 0, 0));
    if (k.hi) for (const z of [-0.18, 0.18]) pb.add('copper', torus(0.155, 0.016, 5, 14), M4.t(sd * 0.22, 0.34 * hw + 0.08, -0.43 * len + z));
    pb.add('dark', cyl(0.05, 0.07, 0.4, k.hi ? 10 : 5), M4.t(sd * 0.5 * hw, 0.4 * hw + 0.16, -0.36 * len));
    if (k.hi) pb.add('glow', new THREE.CircleGeometry(0.04, 8), M4.trs(sd * 0.5 * hw, 0.4 * hw + 0.365, -0.36 * len, -HALF, 0, 0));
  }
  belly(k, T.wMax, len * 0.48, -T.hBm - 0.03, -0.02 * len);
  pb.add('chrome', lathe(prof([[0.06 * hw, 0], [0.04 * hw, 0.12], [0, 0.3]]), k.hi ? 12 : 6, 0), M4.t(0, 0, len * 0.5 - 0.02));
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Pagali Ironclad – turret tub: armoured drum with riveted plate bands, vision slits, a hatch lid propped open, bumper bars. */
const teemo: Design = (k) => {
  const { hw, len, pb } = k; const R = hw, n = k.d === 0 ? 12 : Math.max(24, k.seg);
  const drum = lathe(prof([[0, -0.54 * hw], [0.7 * R, -0.54 * hw, 1], [0.98 * R, -0.3 * hw, 1], [0.98 * R, 0.2 * hw, 1], [0.8 * R, 0.4 * hw, 1], [0.56 * R, 0.4 * hw, 1]]), n, 2); drum.rotateX(-HALF);
  pb.add('hull', drum, M4.trs(0, 0, 0, 0, 0, 0, 1, 1, len / (2 * hw) * 0.9));
  const sz = len / (2 * hw) * 0.9;
  const well = lathe(prof([[0.56 * R, 0.4 * hw], [0.52 * R, 0.3 * hw], [0.5 * R, -0.4 * hw, 1], [0, -0.4 * hw]]), n, 0); well.rotateX(-HALF); pb.add('interior', well, M4.trs(0, 0, 0, 0, 0, 0, 1, 1, sz));
  // riveted plate bands (Bruchteile: the plates take the first hits) and vision slits
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'plateL' : 'plateR', V(sd * R, 0, 0), g => {
    const a0 = sd > 0 ? 0.25 : Math.PI + 0.25;
    g.add('steel', lathe(prof([[R + 0.05, -0.24 * hw, 1], [R + 0.05, 0.14 * hw, 1], [R, 0.14 * hw, 1], [R, -0.24 * hw, 1], [R + 0.05, -0.24 * hw]]), k.hi ? 10 : 4, 0, a0, Math.PI - 0.5).rotateX(-HALF), M4.trs(0, 0, 0, 0, 0, 0, 1, 1, sz));
    if (k.hi) for (let i = 0; i < 6; i++) { const a = a0 + 0.2 + i * 0.44; g.add('chrome', cyl(0.024, 0.024, 0.02, 6), M4.trs(Math.sin(a) * (R + 0.055), -0.05 * hw, Math.cos(a) * (R + 0.055) * sz, 0, a, HALF)); }
  });
  for (const a of [0, 0.62, -0.62]) { pb.add('dark', rbox(0.34, 0.09, 0.05, 0.012), M4.trs(Math.sin(a) * 0.985 * R, 0.27 * hw, Math.cos(a) * 0.985 * R * sz, 0, a, 0)); pb.add('glass', rbox(0.28, 0.045, 0.02, 0.006), M4.trs(Math.sin(a) * R, 0.27 * hw, Math.cos(a) * R * sz, 0, a, 0)); }
  const hip = V(0, -0.36 * hw, -0.06);
  seat(k, hip); const P = pilot(k, hip); levers(k, P.hands, -0.4 * hw);
  dash(k, V(0, 0.08 * hw, 0.4 * R * sz), 0.52, 2, 1, -1.0);
  // hatch lid propped open behind the pilot, with handle and stay
  pb.add('steel', cyl(0.56 * R, 0.56 * R, 0.05, k.hi ? 20 : 10), M4.trs(0, 0.4 * hw + 0.44, -0.56 * R * sz - 0.12, 1.2, 0, 0, 1, 1, 0.92));
  if (k.hi) { pb.add('chrome', torus(0.09, 0.016, 5, 12, Math.PI), M4.trs(0, 0.4 * hw + 0.5, -0.56 * R * sz - 0.06, 1.2 - HALF, 0, 0)); pb.add('steel', tube([V(0.3, 0.42 * hw, -0.3 * R * sz), V(0.34, 0.4 * hw + 0.36, -0.56 * R * sz - 0.04)], 0.018, 4, 5)); pb.add('chrome', boltRing(0.5 * R, 10, 0.02, 0), M4.trs(0, 0.4 * hw + 0.46, -0.56 * R * sz - 0.1, 1.2 - HALF, 0, 0, 1, 1, 1)); }
  // bumper bars front and rear
  for (const sg of [-1, 1]) pb.add('steel', tube([V(-0.8 * R, -0.2 * hw, sg * 0.66 * R * sz), V(-0.42 * R, -0.22 * hw, sg * (R * sz + 0.12)), V(0.42 * R, -0.22 * hw, sg * (R * sz + 0.12)), V(0.8 * R, -0.2 * hw, sg * 0.66 * R * sz)], 0.05, k.hi ? 12 : 5, 6));
  pb.add('glow', torus(0.52 * R, 0.026, 5, n), M4.trs(0, -0.56 * hw, 0, HALF, 0, 0));
  return { head: P.head, eye: P.eye, anchors: anchors(k, [V(-0.56 * R, 0.4 * hw + 0.04, 0.5 * R * sz), V(0.56 * R, 0.4 * hw + 0.04, 0.5 * R * sz)]) };
};

/** Mandrel Ram – bulldozer: V-shaped ram prow with cow-catcher slats on hydraulic rams, open cage, hazard stripes. */
const odo: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.7, 0.36, 0.36, 4.2, 0], [-0.44, 0.96, 0.42, 0.42, 4.2, 0], [-0.3, 1, 0.36, 0.44, 4.2, 0.5], [-0.1, 1, 0.32, 0.42, 4.2, 0.58], [0.06, 0.98, 0.3, 0.4, 4.2, 0.5], [0.2, 0.94, 0.34, 0.36, 4, 0], [0.38, 0.86, 0.3, 0.32, 3.8, 0], [0.5, 0.72, 0.2, 0.26, 3.6, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.05, T.zB - 0.12), Math.min(T.wMax * 1.2, 1.4), 2, 2);
  windscreen(k, 'wrap', V(0, T.rimY - 0.16, T.zB - 0.36 * (T.zB - T.zA)), T.wMax * 0.9, 0.56, 0.6);
  // ram prow: V blade with hazard stripe + cow-catcher slats (Bruchteil: eats front hits until it drops)
  const z0 = len * 0.5 + 0.34;
  part(k, 'ram', V(0, -0.1, z0), g => {
    for (const sd of [-1, 1]) {
      g.add('steel', rbox(1.5 * hw, 0.46, 0.14, 0.04), M4.trs(sd * 0.7 * hw, -0.16, z0 - 0.16, 0.25, sd * -0.42, 0));
      g.add('hazard', rbox(1.5 * hw, 0.14, 0.15, 0.03), M4.trs(sd * 0.7 * hw, 0, z0 - 0.13, 0.25, sd * -0.42, 0));
      const nS = k.hi ? 5 : 2; for (let i = 0; i < nS; i++) g.add('dark', rbox(0.05, 0.05, 0.5, 0.012), M4.trs(sd * (0.2 + i * 1.2 / nS) * hw, -0.36, z0 + 0.14 - (i / nS) * 0.5, 0.5, 0, 0));
    }
    g.add('steel', rbox(0.16, 0.5, 0.2, 0.04), M4.trs(0, -0.14, z0 + 0.14, 0.25, 0, 0));
  });
  // hydraulic rams bracing the prow
  for (const sd of [-1, 1]) { pb.add('dark', cyl(0.07, 0.07, 0.5, k.hi ? 10 : 6), M4.trs(sd * 0.56 * hw, -0.02, len * 0.5 - 0.16, HALF, sd * -0.22, 0)); pb.add('chrome', cyl(0.04, 0.04, 0.52, k.hi ? 8 : 5), M4.trs(sd * 0.47 * hw, -0.02, len * 0.5 + 0.22, HALF, sd * -0.22, 0)); }
  // open cage + hazard side panels + rear bumper
  const cz0 = T.hip.z - 0.4, cz1 = T.zB - 0.16, cy = T.rimY + 0.84 * k.s;
  for (const sd of [-1, 1]) {
    pb.add('steel', tube([V(sd * T.wMax * 0.94, T.rimY, cz0), V(sd * T.wMax * 0.78, cy, cz0 + 0.04), V(sd * T.wMax * 0.78, cy, cz1 - 0.2), V(sd * T.wMax * 0.92, T.rimY + 0.04, cz1)], 0.045, k.hi ? 14 : 6, 6));
    pb.add('hazard', rbox(0.03, 0.2 * hw, 0.3 * len, 0.008), M4.t(sd * (T.wMax + 0.012), -0.06 * hw, -0.1 * len));
  }
  for (const z of [cz0 + 0.04, cz1 - 0.2]) pb.add('steel', tube([V(-T.wMax * 0.78, cy, z), V(T.wMax * 0.78, cy, z)], 0.04, 2, 6));
  pb.add('steel', rbox(1.9 * hw, 0.16, 0.14, 0.04), M4.t(0, -0.2 * hw, -len * 0.5 - 0.08));
  if (k.hi) for (const sd of [-1, 1]) pb.add('glow', rbox(0.2, 0.06, 0.03, 0.01), M4.t(sd * 0.7 * hw, -0.2 * hw, -len * 0.5 - 0.16));
  belly(k, T.wMax * 1.1, len * 0.5, -T.hBm - 0.03, -0.02 * len);
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

// ------------------------------------------------------------------ Session 20 / Phase 3: the four new pods
/** Tarn Cyclone – rotorcraft tub: sturdy open tub with a blunt glazed nose, roll hoop with beacon, twin tail booms with tailplane and fins, skids. */
const cyclone: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.62, 0.36, 0.4, 3.6, 0], [-0.42, 0.9, 0.42, 0.5, 3.6, 0], [-0.3, 1, 0.4, 0.56, 3.6, 0.5], [-0.1, 1, 0.36, 0.57, 3.6, 0.6], [0.08, 0.96, 0.36, 0.55, 3.4, 0.5], [0.22, 0.86, 0.42, 0.5, 3, 0], [0.38, 0.62, 0.36, 0.4, 2.6, 0], [0.5, 0.3, 0.2, 0.22, 2.3, 0]]);
  seat(k, T.hip); const P = pilot(k, T.hip); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.05, T.zB - 0.14), Math.min(T.wMax * 1.25, 1.4), 4, 1);
  windscreen(k, 'dome', V(0, T.rimY - 0.02, T.zB - 0.4 * (T.zB - T.zA)), T.wMax * 0.8, 0.4, 0.62);
  // roll hoop behind the pilot with a beacon on top
  const hz = T.hip.z - 0.46, hy = T.rimY + 0.82 * k.s;
  pb.add('steel', tube([V(-T.wMax * 0.9, T.rimY - 0.04, hz), V(-T.wMax * 0.66, hy, hz), V(0, hy + 0.07, hz), V(T.wMax * 0.66, hy, hz), V(T.wMax * 0.9, T.rimY - 0.04, hz)], 0.045, k.hi ? 18 : 6, 6));
  if (k.hi) { pb.add('dark', cyl(0.05, 0.06, 0.08, 8), M4.t(0, hy + 0.13, hz)); pb.add('glow', sphere(0.045, 8, 6), M4.t(0, hy + 0.2, hz)); }
  // twin tail booms carrying a tailplane with two fins (Bruchteil: its loss costs turn)
  const bz0 = -len * 0.4, bz1 = -len * 0.5 - 1.3, by = 0.1 * hw;
  for (const sd of [-1, 1]) {
    pb.add('steel', tube([V(sd * hw * 0.6, by, bz0), V(sd * hw * 0.68, by + 0.16, (bz0 + bz1) / 2), V(sd * hw * 0.68, by + 0.24, bz1)], 0.06, k.hi ? 10 : 4, 6));
    if (k.hi) pb.add('steel', tube([V(sd * hw * 0.66, by + 0.12, (bz0 + bz1) / 2 + 0.1), V(sd * hw * 0.4, T.rimY, -len * 0.47)], 0.025, 2, 5)); // brace
  }
  part(k, 'tail', V(0, by + 0.3, bz1), g => {
    g.add('hull', rbox(hw * 1.72, 0.05, 0.44, 0.015), M4.t(0, by + 0.26, bz1 - 0.05), SEC);
    for (const sd of [-1, 1]) g.add('hull', fin([[0, 0], [0.52, 0], [0.3, 0.54], [0.06, 0.58]], 0.04), M4.t(sd * hw * 0.68, by + 0.27, bz1 - 0.3), SEC);
    if (k.hi) for (const sd of [-1, 1]) g.add('glow', sphere(0.03, 6, 4), M4.t(sd * hw * 0.68, by + 0.86, bz1 - 0.2));
  });
  // landing skids under the tub
  for (const sd of [-1, 1]) {
    pb.add('steel', tube([V(sd * hw * 0.62, -T.hBm - 0.02, len * 0.34), V(sd * hw * 0.66, -T.hBm - 0.09, len * 0.24), V(sd * hw * 0.66, -T.hBm - 0.09, -len * 0.3), V(sd * hw * 0.62, -T.hBm - 0.03, -len * 0.38)], 0.032, k.hi ? 12 : 5, 5));
    if (k.hi) for (const z of [0.16, -0.2]) pb.add('steel', cyl(0.022, 0.022, 0.14, 5), M4.t(sd * hw * 0.64, -T.hBm - 0.02, len * z));
  }
  belly(k, T.wMax * 0.9, len * 0.44, -T.hBm - 0.03, -0.02 * len);
  if (k.hi) for (const sd of [-1, 1]) pb.add('glow', rbox(0.16, 0.05, 0.03, 0.01), M4.t(sd * hw * 0.34, 0.02, len * 0.49)); // nose lamps
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Lyss Halo-9 – glass drop in a gimbal: slim boat hull under a long bubble canopy, a flat ring round the hull like the ring wings,
 *  a chrome arch over the canopy, tail sting. */
const halo: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.04, 0.04, 0.04, 2.2, 0], [-0.4, 0.4, 0.2, 0.3, 2.3, 0], [-0.26, 0.78, 0.22, 0.48, 2.4, 0.62], [-0.08, 0.94, 0.2, 0.54, 2.5, 0.7], [0.1, 0.9, 0.2, 0.52, 2.5, 0.66], [0.26, 0.66, 0.22, 0.42, 2.4, 0], [0.4, 0.34, 0.18, 0.26, 2.2, 0], [0.5, 0.05, 0.05, 0.05, 2, 0]]);
  const lean = 0.22; seat(k, T.hip, lean); const P = pilot(k, T.hip, lean); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.04, T.zB - 0.14), Math.min(T.wMax * 1.2, 1.0), 2, 2);
  windscreen(k, 'bubble', V(0, T.rimY - 0.03, (T.zA + T.zB) * 0.5 - 0.04), T.wMax * 0.94, 0.8 * k.s, (T.zB - T.zA) * 0.57);
  // gimbal: a flat ring round the hull (secondary paint, light strip like the ring wings) on four stub struts
  const ax = hw * 1.26, az = len * 0.57, ry = T.rimY - 0.02, n = k.hi ? 40 : 14;
  const ring = (r: number, y: number) => M4.trs(0, y, 0, HALF, 0, 0, ax * r, az * r, 1);
  pb.add('hull', torus(1, 0.036, 6, n), ring(1, ry), SEC);
  pb.add('glow', torus(1, 0.011, 4, n), ring(1, ry + 0.04));
  for (const sd of [-1, 1]) { pb.add('steel', rbox(ax - T.wMax + 0.1, 0.05, 0.14, 0.015), M4.t(sd * (ax + T.wMax) / 2, ry, 0)); pb.add('steel', rbox(0.1, 0.05, 0.2, 0.015), M4.t(0, ry, sd * (az - 0.08))); }
  // chrome arch over the canopy (Bruchteil: its loss costs turn)
  part(k, 'arch', V(0, ry + 1, T.hip.z), g => {
    g.add('chrome', torus(1, 0.03, 6, k.hi ? 28 : 10, Math.PI), M4.trs(0, ry, T.hip.z - 0.08, 0, 0, 0, ax, 1.06 * k.s + 0.1, 1));
    if (k.hi) g.add('glow', sphere(0.035, 8, 6), M4.t(0, ry + 1.06 * k.s + 0.14, T.hip.z - 0.08));
  });
  // tail sting and two small stabiliser vanes
  pb.add('chrome', lathe(prof([[0, -0.6], [0.03, -0.2], [0.05, 0]]), k.hi ? 10 : 6, 0), M4.t(0, 0, -len * 0.5 + 0.03));
  for (const sd of [-1, 1]) pb.add('hull', fin([[0, 0], [0.4, 0], [0.12, 0.3]], 0.03), M4.trs(sd * 0.06, 0.04, -len * 0.47, 0, 0, sd * -0.9), SEC);
  belly(k, T.wMax * 0.8, len * 0.42, -T.hBm - 0.03, 0);
  const a = 0.62; // the cables meet the ring left and right of the nose
  return { head: P.head, eye: P.eye, anchors: anchors(k, [V(-Math.sin(a) * ax, ry + 0.07, Math.cos(a) * az), V(Math.sin(a) * ax, ry + 0.07, Math.cos(a) * az)]) };
};

/** Dorn Manta – low arrow sled: flat arrowhead hull, reclined pilot behind a wrap screen, delta wing plates, twin fins, slot lights at the stern. */
const manta: Design = (k) => {
  const { hw, len, pb } = k;
  const T = shell(k, [[-0.5, 0.86, 0.2, 0.3, 3.4, 0], [-0.42, 1, 0.26, 0.4, 3.4, 0], [-0.26, 0.98, 0.26, 0.46, 3.2, 0.56], [-0.06, 0.86, 0.24, 0.48, 3, 0.62], [0.12, 0.66, 0.24, 0.44, 2.8, 0.5], [0.26, 0.46, 0.26, 0.36, 2.6, 0], [0.4, 0.24, 0.16, 0.22, 2.4, 0], [0.5, 0.04, 0.04, 0.05, 2, 0]]);
  const hip = V(0, T.floorY * 0.42, T.hip.z - 0.08), lean = 0.42;
  seat(k, hip, lean); const P = pilot(k, hip, lean); levers(k, P.hands, T.floorY);
  dash(k, V(0, T.rimY - 0.04, T.zB - 0.12), Math.min(T.wMax * 1.1, 1.3), 4, 1, -0.8);
  windscreen(k, 'wrap', V(0, T.rimY - 0.2, T.zB - 0.36 * (T.zB - T.zA)), T.wMax * 0.9, 0.66, 0.86);
  // delta wing plates from the nose to the stern tips (Bruchteile: grip)
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'deltaL' : 'deltaR', V(sd * hw * 1.1, 0, -0.2 * len), g => {
    const w = extrude([[0, 0], [0.62 * hw, 0.74 * len], [0.7 * hw, 0.9 * len], [0, 0.82 * len]], 0.04, 0.012); w.rotateX(-HALF); // x = outwards, shape +y = backwards
    const m = M4.trs(sd * hw * 0.5, -0.06, 0.4 * len, 0, 0, sd * -0.07); if (sd < 0) m.multiply(M4.mirrorX());
    g.add('hull', w, m, SEC);
    if (k.hi) g.add('glow', sphere(0.03, 6, 4), M4.t(sd * hw * 1.18, -0.11, -0.47 * len));
  });
  // twin fins like the engines' (Bruchteile: turn)
  for (const sd of [-1, 1]) part(k, sd < 0 ? 'finL' : 'finR', V(sd * hw * 0.62, 0.4, -0.4 * len), g => g.add('hull', fin([[0, 0], [0.74, 0], [0.2, 0.52], [0.02, 0.55]], 0.04), M4.t(sd * hw * 0.62, 0.2 * hw, -0.5 * len + 0.02), SEC));
  // slot lights across the stern, chrome arrow tip, headrest fairing
  pb.add('dark', rbox(hw * 1.5, 0.1, 0.05, 0.015), M4.t(0, 0, -len * 0.5 - 0.01));
  pb.add('glow', rbox(hw * 1.36, 0.04, 0.03, 0.008), M4.t(0, 0, -len * 0.5 - 0.03));
  pb.add('chrome', lathe(prof([[0.04, 0], [0.026, 0.2], [0, 0.5]]), k.hi ? 10 : 6, 0), M4.t(0, 0, len * 0.5 - 0.03));
  pb.add('hull', loft([{ z: -0.5, w: 0.03, hT: 0.02, hB: 0.02 }, { z: -0.3, w: 0.2, hT: 0.2, hB: 0.06 }, { z: 0, w: 0.24, hT: 0.26, hB: 0.06 }, { z: 0.2, w: 0.06, hT: 0.05, hB: 0.03 }], k.hi ? 12 : 6, 3), M4.t(0, T.rimY + 0.02, T.zA + 0.34));
  belly(k, T.wMax * 0.9, len * 0.5, -T.hBm - 0.03, -0.08 * len);
  return { head: P.head, eye: P.eye, anchors: tubAnchors(k, T) };
};

/** Quill Voltspire – reactor ball: a closed bowl below, a glass ball inside a cage of hoops above (two hoops frame the view like
 *  A-pillars, the back is ribbed and plated), equipment pack behind the seat, console on a stalk, tall discharge mast on top.
 *  (First version: an open ball of five hoops – the user found the pod too open.) */
const volt: Design = (k) => {
  const { hw, pb } = k; const r = hw * 0.86, cy = 0.06, n = k.hi ? 36 : 12, tr = 0.028, yaw = 0.72, ri = r - 0.05, m = k.hi ? 8 : 4;
  // bowl: outer skin from the bottom up to the equator, rim, inner skin down to a flat floor
  const bowl: [number, number, (0 | 1)?][] = [];
  for (let i = 0; i <= m; i++) { const a = (i / m) * HALF; bowl.push([r * Math.sin(a), cy - r * Math.cos(a)]); }
  bowl[m][2] = 1; bowl.push([ri, cy, 1]);
  const aF = Math.acos(Math.min(0.99, (cy + 0.5 * hw) / ri)); // where the inner skin meets the floor (0.5·hw under the cockpit origin)
  for (let i = m - 1; i >= 1; i--) { const a = aF + (HALF - aF) * (i / m); bowl.push([ri * Math.sin(a), cy - ri * Math.cos(a)]); }
  bowl.push([ri * Math.sin(aF), -0.5 * hw, 1], [0, -0.5 * hw]);
  pb.add('hull', lathe(prof(bowl), n, 2).rotateX(-HALF));
  pb.add('steel', torus(r, tr * 1.2, 6, n), M4.trs(0, cy, 0, HALF, 0, 0));                       // rim on the equator
  // glass ball over the bowl, plated at the back (secondary paint) up to the lower rib ring
  pb.add('glass', sphere(r * 0.985, n, k.hi ? 10 : 5, 0, Math.PI * 2, 0, HALF), M4.t(0, cy, 0));
  pb.add('hull', sphere(r * 0.995, k.hi ? 14 : 6, k.hi ? 4 : 2, Math.PI * 1.5 - 0.9, 1.8, Math.acos(0.4), HALF - Math.acos(0.4)), M4.t(0, cy, 0), SEC);
  // cage: one hoop over the pilot from side to side, two diagonal hoops (pillars left and right of the view), ribs down the back
  const arc = (ry: number, a = Math.PI) => pb.add('steel', torus(r, tr, 6, Math.max(6, Math.round(n * a / (Math.PI * 2))), a), M4.trs(0, cy, 0, 0, ry, 0));
  arc(0); for (const sd of [-1, 1]) arc(HALF + sd * yaw);
  for (const b of k.hi ? [-0.5, 0, 0.5] : [0]) arc(HALF + b, HALF);                              // quarter ribs from the top joint down to the rear rim
  pb.add('steel', torus(r * Math.sqrt(1 - 0.72 * 0.72), tr * 0.8, 5, n), M4.trs(0, cy + 0.72 * r, 0, HALF, 0, 0));
  pb.add('steel', torus(r * Math.sqrt(1 - 0.4 * 0.4), tr * 0.8, 5, Math.max(6, n >> 1), Math.PI), M4.trs(0, cy + 0.4 * r, 0, -HALF, 0, 0)); // rib ring round the back
  if (k.hi) for (const a of [yaw, -yaw, HALF, -HALF, Math.PI - yaw, yaw - Math.PI]) pb.add('copper', sphere(0.05, 8, 6), M4.t(Math.sin(a) * r, cy, Math.cos(a) * r)); // joints on the rim
  const hip = V(0, -0.3 * hw, -0.1);
  seat(k, hip); const P = pilot(k, hip); levers(k, P.hands, -0.5 * hw);
  // equipment pack behind the seat: capacitor block, two coils, feed line up the centre rib to the mast
  pb.add('dark', rbox(0.5, 0.3, 0.16, 0.03), M4.t(0, hip.y + 0.2, hip.z - 0.36));
  if (k.hi) {
    for (const sd of [-1, 1]) { pb.add('copper', torus(0.07, 0.02, 5, 10), M4.trs(sd * 0.14, hip.y + 0.42, hip.z - 0.36, HALF, 0, 0)); pb.add('glow', sphere(0.022, 6, 4), M4.t(sd * 0.2, hip.y + 0.26, hip.z - 0.27)); }
    pb.add('rubber', tube([V(0, hip.y + 0.36, hip.z - 0.4), V(0, cy + 0.5 * r, -0.8 * r), V(0, cy + 0.9 * r, -0.36 * r), V(0, cy + r - 0.02, -0.04)], 0.022, 10, 5));
  }
  // console on a stalk
  dash(k, V(0, cy + 0.01, r * 0.68), 0.46, 2, 1, -1.05);
  pb.add('steel', tube([V(0, -0.5 * hw, r * 0.36), V(0, cy - 0.2, r * 0.6), V(0, cy - 0.03, r * 0.68)], 0.03, 6, 6));
  // discharge mast (Bruchteil) on the top joint
  pb.add('dark', cyl(0.07, 0.09, 0.08, 10), M4.t(0, cy + r + 0.02, 0));
  part(k, 'mast', V(0, cy + r + 0.7, 0), g => {
    g.add('chrome', cyl(0.012, 0.028, 1.3, 6), M4.t(0, cy + r + 0.68, 0));
    for (let i = 0; i < 3; i++) g.add('dark', torus(0.07 - i * 0.015, 0.014, 5, k.hi ? 12 : 6), M4.trs(0, cy + r + 0.32 + i * 0.3, 0, HALF, 0, 0));
    g.add('glow', sphere(0.04, 8, 6), M4.t(0, cy + r + 1.35, 0));
  });
  // light ring under the bowl
  { const rg = 0.34 * hw, a = Math.asin(rg / r); pb.add('glow', torus(rg, 0.02, 5, n), M4.trs(0, cy - r * Math.cos(a) - 0.012, 0, HALF, 0, 0)); }
  return { head: P.head, eye: P.eye, anchors: anchors(k, [V(-Math.sin(yaw) * r, cy + 0.07, Math.cos(yaw) * r), V(Math.sin(yaw) * r, cy + 0.07, Math.cos(yaw) * r)]) };
};

const DESIGNS: Record<string, Design> = { aurora, mavik, rattis, elana, gasvaro, brute, bomquad, aldo, teemo, odo, cyclone, halo, manta, volt };

function lampGeo(at: THREE.Vector3[], n: THREE.Vector3) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n.clone().normalize());
  const list = at.map(p => { const g = new THREE.CircleGeometry(0.024, LAMP_VERTS - 2); g.deleteAttribute('uv'); g.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(n, 0.004), q, V(1, 1, 1))); return g; });
  const mg = mergeGeometries(list, false)!; list.forEach(g => g.dispose());
  mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mg.attributes.position.count * 3).fill(0.05), 3));
  mg.computeBoundingSphere();
  return mg;
}

const cockpitCache = new Map<string, CockpitGeo>();
/** The cockpit of a pod: `layout.cockpit.design` (default: the pod's own id) picks the design. An unknown design throws. */
export function cockpitGeo(L: PodLayout, seg: number, head: PilotHead = 'goggles', detail: CockpitDetail = 1): CockpitGeo {
  const c = L.cockpit, id = c.design ?? ''; const key = `${id}|${c.hw}|${c.len}|${c.pilot}|${head}|${seg}|${detail}`;
  const hit = cockpitCache.get(key); if (hit) return hit;
  const design = DESIGNS[id];
  if (!design) throw new Error(`No cockpit design "${id}" – add it to DESIGNS in src/game/podCockpits.ts and name it in the pod's layout`);
  const k: Kit = { pb: new PartBuilder(), pp: new PartBuilder(), hw: c.hw, len: c.len, s: c.pilot, seg, d: detail, head, hi: detail >= 1, ultra: detail >= 2, lampAt: [], lampN: V(0, 1, 0), breaks: [] };
  const info = design(k);
  if (k.lampAt.length !== 3) throw new Error(`cockpit design "${id}" has no dashboard (three live lamps are required)`);
  const out: CockpitGeo = { parts: k.pb.build() as Map<string, THREE.BufferGeometry>, pilot: k.pp.build() as Map<string, THREE.BufferGeometry>, lamps: lampGeo(k.lampAt, k.lampN), lampCount: 3, breakParts: k.breaks, info };
  cockpitCache.set(key, out);
  return out;
}
/** ids of all cockpit designs (tests, tools) */
