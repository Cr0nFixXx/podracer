import * as THREE from 'three';
import type { PodDef } from './data';
import type { EngineSpec } from './podParts';
import { PartBuilder, M4, cyl, extrude, lathe, loft, loftRim, prof, rbox, sphere, torus, tube, type Section } from './podKit';

export type CockpitStyle = 'pod' | 'wedge' | 'saucer' | 'long';
export interface EngineMount { spec: EngineSpec; x: number; y: number; z: number; }
export interface PodLayout {
  engines: EngineMount[];
  cockpit: { style: CockpitStyle; hw: number; len: number; y: number; z: number; pilot: number };
  binder: [number, number] | null;
  livery: number;
  extras?: (pb: PartBuilder, L: PodLayout) => void;
}
export interface CockpitInfo { head: THREE.Vector3; anchors: [THREE.Vector3, THREE.Vector3]; }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const spec = (L: number, R: number, style: EngineSpec['style'], bands: number, blades: number, spike = true, fins = 0): EngineSpec => ({ L, R, style, bands, blades, spike, fins });

// ------------------------------------------------------------------ layouts
export function podLayout(def: PodDef): PodLayout {
  const pair = (s: EngineSpec, sp: number, y: number, z: number) => [{ spec: s, x: -sp, y, z }, { spec: s, x: sp, y, z }];
  switch (def.id) {
    case 'aurora': {
      const s = spec(9, 1.15, 'turbine', 6, 18);
      return { engines: pair(s, 2.5, 0, 4), cockpit: { style: 'pod', hw: 0.95, len: 3.4, y: 0.1, z: -6, pilot: 1 }, binder: [0, 1], livery: 0,
        extras: (pb) => { for (const sd of [-1, 1]) for (const s2 of [-1, 1]) { pb.add('hull', rbox(0.95, 0.08, 8.2, 0.03), M4.trs(sd * 2.5 + s2 * 1.5, -0.32, 4, 0, 0, s2 * -0.12), [0, 0, 3]); pb.add('steel', rbox(0.06, 0.12, 8.3, 0.02), M4.trs(sd * 2.5 + s2 * 1.97, -0.38, 4, 0, 0, s2 * -0.12)); } } };
    }
    case 'brute': {
      const s = spec(8, 1.5, 'split', 7, 20, false);
      return { engines: pair(s, 2.4, 0, 2), cockpit: { style: 'wedge', hw: 1.1, len: 3.0, y: 0.25, z: -9, pilot: 1.05 }, binder: [0, 1], livery: 2,
        extras: (pb) => {
          const fin = extrude([[0, 0], [2.2, 0], [2.7, 2.7], [1.6, 2.7]], 0.12, 0.03); fin.rotateY(Math.PI / 2);
          pb.add('hull', fin, M4.t(-2.4, 1.45, 1.2), [0, 0, 3]);
          pb.add('steel', rbox(0.3, 0.4, 1.6, 0.05), M4.t(-2.4, 1.6, 0.2));
        } };
    }
    case 'gasvaro': {
      const s = spec(6, 0.8, 'quad', 4, 12);
      return { engines: [...pair(s, 1.6, 0, 3), ...pair(s, 3.4, 0, 3), ...pair(s, 2.5, 1.55, 4)], cockpit: { style: 'long', hw: 0.75, len: 3.6, y: 0, z: -7, pilot: 0.95 }, binder: [0, 1], livery: 1,
        extras: (pb) => { for (const sd of [-1, 1]) { pb.add('steel', tube([V(sd * 1.6, 0.7, 3.4), V(sd * 2.05, 1.3, 3.7), V(sd * 2.5, 2.1, 4)], 0.07, 12, 8)); pb.add('steel', tube([V(sd * 3.4, 0.7, 3.4), V(sd * 2.95, 1.3, 3.7), V(sd * 2.5, 2.1, 4)], 0.07, 12, 8)); } } };
    }
    case 'bomquad': {
      const s = spec(5.5, 1.1, 'ring', 4, 14);
      return { engines: [{ spec: s, x: -2.4, y: 0, z: 1 }, { spec: s, x: 2.4, y: 0, z: 1 }, { spec: s, x: -1.6, y: 0.35, z: 7.2 }, { spec: s, x: 1.6, y: 0.35, z: 7.2 }], cockpit: { style: 'saucer', hw: 1.0, len: 2.4, y: 0.2, z: -6, pilot: 0.95 }, binder: [2, 3], livery: 3,
        extras: (pb) => { for (const sd of [-1, 1]) pb.add('rubber', tube([V(sd * 2.4, 1.7, 1.9), V(sd * 2.0, 1.2, 3.6), V(sd * 1.6, 2.0, 5.4)], 0.045, 16, 6)); } };
    }
    case 'mavik': {
      const s = spec(8, 0.62, 'needle', 6, 10);
      return { engines: pair(s, 1.7, 0, 3), cockpit: { style: 'pod', hw: 0.72, len: 2.5, y: -0.05, z: -5.5, pilot: 0.92 }, binder: [0, 1], livery: 1 };
    }
    case 'rattis': {
      const s = spec(6, 0.85, 'blade', 4, 14);
      return { engines: pair(s, 1.7, 0, 2.5), cockpit: { style: 'wedge', hw: 0.78, len: 2.6, y: -0.1, z: -3.2, pilot: 0.92 }, binder: [0, 1], livery: 2 };
    }
    case 'aldo': {
      const s = spec(9, 1.0, 'long', 7, 16, true, 6);
      return { engines: pair(s, 2.3, 0, 3.5), cockpit: { style: 'long', hw: 0.85, len: 3.2, y: 0, z: -6, pilot: 1 }, binder: [0, 1], livery: 0 };
    }
    case 'teemo': {
      const s = spec(5, 1.25, 'heavy', 4, 20, true);
      return { engines: [{ spec: s, x: -2.3, y: -0.4, z: 0 }, { spec: s, x: 2.3, y: -0.4, z: 0 }, { spec: s, x: -2.3, y: 1.45, z: 6 }, { spec: s, x: 2.3, y: 1.45, z: 6 }], cockpit: { style: 'saucer', hw: 0.82, len: 2.2, y: 0.35, z: -5.5, pilot: 0.95 }, binder: [0, 1], livery: 3,
        extras: (pb) => { for (const sd of [-1, 1]) { pb.add('dark', rbox(0.3, 0.3, 3.6, 0.06), M4.trs(sd * 2.3, 0.55, 3.0, -0.31, 0, 0)); pb.add('hazard', rbox(0.32, 0.06, 1.2, 0.02), M4.trs(sd * 2.3, 0.73, 3.0, -0.31, 0, 0)); } } };
    }
    case 'elana': {
      const s = spec(8.5, 0.78, 'needle', 6, 12);
      return { engines: pair(s, 2, 0, 3), cockpit: { style: 'long', hw: 0.8, len: 3.3, y: 0, z: -6, pilot: 0.95 }, binder: [0, 1], livery: 1,
        extras: (pb, L) => { const fin = extrude([[0, 0], [1.1, 0], [1.4, 1.3], [0.9, 1.3]], 0.07, 0.02); fin.rotateY(Math.PI / 2); pb.add('hull', fin, M4.t(0, L.cockpit.y + 0.3, L.cockpit.z - 0.7), [0, 0, 3]); } };
    }
    default: { // odo – ram
      const s = spec(7, 1.3, 'heavy', 5, 16, false);
      return { engines: pair(s, 2.4, 0, 3), cockpit: { style: 'wedge', hw: 1.0, len: 2.8, y: 0, z: -5.5, pilot: 1 }, binder: [0, 1], livery: 2,
        extras: (pb, L) => {
          const z = L.cockpit.z + L.cockpit.len * 0.5 + 0.35;
          pb.add('steel', rbox(3.0, 0.5, 0.35, 0.06), M4.trs(0, L.cockpit.y - 0.25, z, 0.35, 0, 0));
          pb.add('hazard', rbox(3.02, 0.16, 0.37, 0.03), M4.trs(0, L.cockpit.y - 0.08, z + 0.06, 0.35, 0, 0));
          for (const sd of [-1, 1]) pb.add('dark', rbox(0.12, 0.12, 0.9, 0.03), M4.t(sd * 0.9, L.cockpit.y - 0.3, z - 0.45));
        } };
    }
  }
}

// ------------------------------------------------------------------ cockpit
type Row = [number, number, number, number, number, number];
const TEMPLATES: Record<CockpitStyle, Row[]> = {
  pod: [[-0.5, 0.3, 0.26, 0.26, 2.2, 0], [-0.45, 0.7, 0.46, 0.44, 2.4, 0], [-0.36, 0.9, 0.46, 0.52, 2.6, 0], [-0.24, 0.98, 0.4, 0.55, 2.6, 0.5], [-0.08, 1, 0.36, 0.56, 2.6, 0.6], [0.06, 0.96, 0.36, 0.54, 2.6, 0.5], [0.18, 0.86, 0.42, 0.48, 2.4, 0], [0.32, 0.64, 0.38, 0.38, 2.3, 0], [0.44, 0.34, 0.24, 0.24, 2.2, 0], [0.5, 0.08, 0.07, 0.08, 2, 0]],
  wedge: [[-0.5, 0.55, 0.3, 0.3, 4, 0], [-0.44, 0.92, 0.38, 0.4, 4, 0], [-0.3, 1, 0.34, 0.42, 4, 0.5], [-0.1, 1, 0.3, 0.4, 4, 0.58], [0.06, 0.96, 0.28, 0.36, 4, 0.5], [0.18, 0.88, 0.3, 0.3, 3.6, 0], [0.34, 0.66, 0.2, 0.22, 3.2, 0], [0.5, 0.3, 0.05, 0.08, 3, 0]],
  saucer: [[-0.5, 0.4, 0.3, 0.3, 2, 0], [-0.4, 0.85, 0.5, 0.5, 2.1, 0], [-0.25, 1, 0.46, 0.58, 2.2, 0.5], [-0.05, 1.04, 0.42, 0.6, 2.2, 0.6], [0.12, 0.98, 0.42, 0.58, 2.2, 0.5], [0.26, 0.84, 0.48, 0.5, 2.1, 0], [0.4, 0.58, 0.4, 0.4, 2, 0], [0.5, 0.2, 0.16, 0.16, 2, 0]],
  long: [[-0.5, 0.3, 0.24, 0.24, 2.4, 0], [-0.44, 0.74, 0.4, 0.4, 2.5, 0], [-0.32, 0.9, 0.36, 0.46, 2.6, 0.5], [-0.16, 0.92, 0.32, 0.48, 2.6, 0.58], [-0.02, 0.88, 0.32, 0.46, 2.6, 0.5], [0.1, 0.78, 0.36, 0.42, 2.5, 0], [0.26, 0.58, 0.32, 0.34, 2.4, 0], [0.4, 0.36, 0.22, 0.22, 2.2, 0], [0.5, 0.08, 0.06, 0.07, 2, 0]],
};

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }

/** Smoothly resample sparse template rows into dense sections (scaled to metres). */
function sections(style: CockpitStyle, hw: number, len: number, perSpan: number): Section[] {
  const T = TEMPLATES[style]; const out: Section[] = [];
  for (let i = 0; i < T.length - 1; i++) for (let k = 0; k < perSpan; k++) {
    const t = k / perSpan; const g = (j: number) => T[Math.max(0, Math.min(T.length - 1, j))];
    const f = (c: number) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t);
    const e = t * t * (3 - 2 * t); const open = g(i)[5] + (g(i + 1)[5] - g(i)[5]) * e;
    out.push({ z: f(0) * len, w: Math.max(0.02, f(1)) * hw, hT: Math.max(0.02, f(2)) * hw, hB: Math.max(0.02, f(3)) * hw, n: f(4), open: Math.max(0, Math.min(0.85, open)) });
  }
  const l = T[T.length - 1]; out.push({ z: l[0] * len, w: l[1] * hw, hT: l[2] * hw, hB: l[3] * hw, n: l[4], open: 0 });
  return out;
}

function pilotParts(pb: PartBuilder, s: number, hip: THREE.Vector3) {
  const base = new THREE.Matrix4().compose(hip, new THREE.Quaternion(), V(s, s, s));
  const at = (m: THREE.Matrix4) => base.clone().multiply(m);
  const torso = lathe(prof([[0, 0], [0.16, 0, 1], [0.19, 0.12], [0.21, 0.32], [0.19, 0.44], [0.12, 0.52], [0.06, 0.56], [0, 0.57]]), 18, 0);
  torso.rotateX(-Math.PI / 2); torso.scale(1.15, 1, 0.82);
  pb.add('suit', torso, at(M4.trs(0, 0, 0, 0.22, 0, 0)));
  // harness straps
  for (const sd of [-1, 1]) pb.add('leather', rbox(0.05, 0.5, 0.02, 0.01), at(M4.trs(sd * 0.09, 0.27, 0.19, 0.22, 0, sd * 0.12)));
  pb.add('chrome', cyl(0.035, 0.035, 0.02, 10), at(M4.trs(0, 0.25, 0.205, Math.PI / 2 + 0.22, 0, 0)));
  const head = V(0, 0.71, 0.17);
  pb.add('skin', sphere(0.112, 18, 14), at(M4.trs(head.x, head.y - 0.015, head.z + 0.02, 0, 0, 0, 0.95, 1.05, 1)));
  pb.add('leather', sphere(0.128, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), at(M4.trs(head.x, head.y + 0.01, head.z - 0.015, -0.25, 0, 0, 1, 1.05, 1.08)));
  pb.add('rubber', torus(0.122, 0.013, 6, 24), at(M4.trs(head.x, head.y + 0.035, head.z, Math.PI / 2 - 0.2, 0, 0)));
  for (const sd of [-1, 1]) {
    pb.add('dark', cyl(0.045, 0.048, 0.045, 14), at(M4.trs(head.x + sd * 0.052, head.y + 0.03, head.z + 0.105, Math.PI / 2, 0, 0)));
    pb.add('visor', sphere(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), at(M4.trs(head.x + sd * 0.052, head.y + 0.03, head.z + 0.128, Math.PI / 2, 0, 0, 1, 0.45, 1)));
  }
  pb.add('leather', torus(0.075, 0.03, 8, 18), at(M4.trs(0, 0.56, 0.12, Math.PI / 2 - 0.25, 0, 0)));
  const hands: THREE.Vector3[] = [];
  for (const sd of [-1, 1]) {
    const sh = V(sd * 0.22, 0.46, 0.09), el = V(sd * 0.3, 0.27, 0.3), hd = V(sd * 0.21, 0.31, 0.5);
    pb.add('suit', sphere(0.085, 12, 10), at(M4.t(sh.x, sh.y, sh.z)));
    pb.add('suit', tube([sh, el, hd], 0.055, 14, 10), base);
    pb.add('leather', sphere(0.062, 12, 10), at(M4.trs(hd.x, hd.y, hd.z + 0.02, 0, 0, 0, 1, 0.9, 1.2)));
    hands.push(hd.clone().multiplyScalar(s).add(hip));
  }
  return { head: head.clone().multiplyScalar(s).add(hip), hands };
}

const cockpitCache = new Map<string, { parts: Map<string, THREE.BufferGeometry>; info: CockpitInfo }>();

/** Hollow lofted cockpit tub with interior, dashboard, windscreen, controls, pilot and fittings (cockpit-local space). */
export function cockpitGeo(L: PodLayout, seg: number) {
  const c = L.cockpit; const key = `${c.style}|${c.hw}|${c.len}|${c.pilot}|${seg}`;
  const hit = cockpitCache.get(key); if (hit) return hit;
  const pb = new PartBuilder(); const hw = c.hw, len = c.len;
  const secs = sections(c.style, hw, len, seg >= 40 ? 6 : seg >= 28 ? 4 : 3);
  const segC = Math.max(24, seg);
  pb.add('hull', loft(secs, segC, 2));
  // ---- hollow interior: inner shell between the closed rows around the opening ----
  let iA = secs.findIndex(s => (s.open ?? 0) > 0.001) - 1; let iB = secs.length - 1;
  for (let j = secs.length - 1; j >= 0; j--) if ((secs[j].open ?? 0) > 0.001) { iB = j + 1; break; }
  iA = Math.max(0, iA); iB = Math.min(secs.length - 1, iB);
  const th = 0.05 * hw + 0.02;
  const outerSub = secs.slice(iA, iB + 1);
  const inner: Section[] = outerSub.map(s => ({ ...s, w: s.w - th, hT: s.hT - th, hB: s.hB - th }));
  pb.add('interior', loft(inner, segC, 0, [true, true], true));
  pb.add('chrome', loftRim(outerSub, inner, segC));
  const zA = secs[iA].z, zB = secs[iB].z; let wMax = 0, hBm = 0; for (const s of outerSub) { wMax = Math.max(wMax, s.w); hBm = Math.max(hBm, s.hB); }
  const mid = outerSub[Math.floor(outerSub.length / 2)];
  const rimY = mid.hT * Math.pow(Math.cos(((mid.open ?? 0.5) * Math.PI) / 2), 2 / (mid.n ?? 2.4));
  const floorY = -(mid.hB - th);
  // ---- seat + pilot ----
  const hipZ = zA + (zB - zA) * 0.4, hipY = floorY * 0.5;
  pb.add('leather', rbox(0.56, 0.12, 0.5, 0.05), M4.t(0, hipY - 0.06, hipZ + 0.08));
  pb.add('leather', rbox(0.56, 0.7, 0.12, 0.06), M4.trs(0, hipY + 0.3, hipZ - 0.2, -0.15, 0, 0));
  pb.add('leather', rbox(0.3, 0.2, 0.12, 0.05), M4.trs(0, hipY + 0.78, hipZ - 0.27, -0.15, 0, 0));
  const pil = pilotParts(pb, c.pilot, V(0, hipY, hipZ));
  // ---- control levers under the hands ----
  for (const hd of pil.hands) {
    const base = V(hd.x, floorY + 0.05, hd.z + 0.1);
    pb.add('steel', tube([base, V(hd.x, (base.y + hd.y) / 2, hd.z + 0.08), V(hd.x, hd.y - 0.07, hd.z)], 0.022, 8, 6));
    pb.add('rubber', cyl(0.032, 0.032, 0.12, 10), M4.t(hd.x, hd.y - 0.06, hd.z));
    pb.add('glow', sphere(0.018, 8, 6), M4.t(hd.x, hd.y + 0.01, hd.z + 0.03));
  }
  // ---- dashboard + gauges ----
  const D = new THREE.Matrix4().compose(V(0, rimY - 0.06, zB - 0.16 * len * 0.3 - 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.65, 0, 0)), V(1, 1, 1));
  const dw = Math.min(wMax * 1.3, 1.5);
  pb.add('interior', rbox(dw, 0.06, 0.34, 0.03), D);
  for (let i = 0; i < 5; i++) {
    const gx = (i - 2) * dw * 0.18; const m = D.clone().multiply(M4.trs(gx, 0.032, 0.02 * (i % 2), -Math.PI / 2, 0, 0));
    pb.add('glow', new THREE.CircleGeometry(0.04, 16), m);
    pb.add('chrome', torus(0.045, 0.008, 6, 18), m);
  }
  // ---- windscreen with chrome frame ----
  const ws = c.style === 'wedge' ? [0.85, 0.2, 0.42] : c.style === 'saucer' ? [1.0, 0.45, 0.7] : c.style === 'long' ? [0.72, 0.34, 0.58] : [0.9, 0.32, 0.48];
  const wsM = M4.trs(0, rimY - 0.02, zB - 0.42 * (zB - zA), 0, 0, 0, wMax * ws[0], ws[1], ws[2]);
  pb.add('glass', sphere(1, 28, 10, 0, Math.PI, 0, Math.PI / 2), wsM);
  pb.add('chrome', torus(1, 0.022, 6, 28, Math.PI), wsM.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  // ---- side pods with louvres ----
  const spZ = zA + (zB - zA) * 0.25;
  for (const sd of [-1, 1]) {
    pb.add('hull', rbox(0.3 * hw, 0.34 * hw, 0.42 * len, 0.06), M4.t(sd * wMax * 0.97, -0.08 * hw, spZ), [0, 0, 3]);
    for (let i = 0; i < 5; i++) pb.add('dark', rbox(0.02, 0.22 * hw, 0.03, 0.006), M4.trs(sd * (wMax * 0.97 + 0.15 * hw + 0.01), -0.08 * hw, spZ - 0.12 * len + i * 0.06 * len, 0, sd * 0.6, 0));
    pb.add('dark', lathe(prof([[0.11 * hw, -0.1, 1], [0.11 * hw, 0.05, 1], [0.08 * hw, 0.05, 1], [0.0, -0.05]]), 16, 0), M4.t(sd * wMax * 0.97, -0.08 * hw, spZ + 0.21 * len + 0.02));
  }
  // ---- belly repulsor ----
  pb.add('dark', rbox(wMax * 1.1, 0.07, len * 0.5, 0.03), M4.t(0, -hBm - 0.03, zA + (zB - zA) * 0.5));
  pb.add('glow', rbox(wMax * 0.7, 0.025, len * 0.42, 0.01), M4.t(0, -hBm - 0.075, zA + (zB - zA) * 0.5));
  // ---- tail fins, lights, antenna, nose ----
  const rear = secs[1];
  for (const sd of [-1, 1]) {
    const fin = extrude([[0, 0], [0.55, 0], [0.75, 0.55 * hw], [0.45, 0.55 * hw]], 0.04, 0.012); fin.rotateY(Math.PI / 2);
    pb.add('hull', fin, M4.trs(sd * rear.w * 0.45, rear.hT * 0.6, secs[2].z, 0, 0, sd * -0.35), [0, 0, 3]);
    pb.add('glow', sphere(0.045, 10, 8), M4.t(sd * rear.w * 0.62, 0, secs[0].z + 0.06));
  }
  pb.add('dark', cyl(0.012, 0.016, 0.9, 6), M4.t(-rear.w * 0.3, rear.hT + 0.45, rear.z + 0.15));
  pb.add('glow', sphere(0.03, 8, 6), M4.t(-rear.w * 0.3, rear.hT + 0.92, rear.z + 0.15));
  pb.add('chrome', lathe(prof([[0.07 * hw, 0], [0.05 * hw, 0.12], [0.0, 0.3]]), 16, 0), M4.t(0, 0, len * 0.5 - 0.02));
  // ---- cable anchors ----
  const fr = secs[Math.min(secs.length - 1, iB + 2)];
  const anchors: [THREE.Vector3, THREE.Vector3] = [V(-fr.w * 0.45, fr.hT * 0.75 + 0.06, fr.z), V(fr.w * 0.45, fr.hT * 0.75 + 0.06, fr.z)];
  for (const a of anchors) { pb.add('chrome', torus(0.06, 0.02, 6, 14), M4.trs(a.x, a.y, a.z, 0, Math.PI / 2, 0)); pb.add('steel', rbox(0.1, 0.1, 0.16, 0.02), M4.t(a.x, a.y - 0.07, a.z)); }
  const out = { parts: pb.build() as Map<string, THREE.BufferGeometry>, info: { head: pil.head, anchors } };
  cockpitCache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ collision shape
export interface CollCircle { x: number; z: number; r: number; side: number } // pod-local (group space), side -1 = left engines (hpL)
const collCache = new Map<string, { circles: CollCircle[]; halfW: number }>();
/** Collision circles derived from the visual layout: two per engine + cockpit (+ wide extras). */
export function podCollision(def: PodDef) {
  const hit = collCache.get(def.id); if (hit) return hit;
  const L = podLayout(def); const bz = -L.cockpit.z * 0.25;
  const circles: CollCircle[] = [];
  for (const e of L.engines) {
    const side = e.x < 0 ? -1 : 1;
    const R = e.spec.R * 1.05 + (e.spec.style === 'blade' ? 0.45 : 0) + (e.spec.style === 'ring' ? 0.3 : 0);
    for (const f of [0.3, -0.3]) circles.push({ x: e.x, z: e.z + e.spec.L * f + bz, r: R, side });
  }
  if (def.id === 'aurora') for (const sd of [-1, 1]) for (const f of [2.5, -2.5]) circles.push({ x: sd * 4.0, z: 4 + f + bz, r: 0.6, side: sd });
  circles.push({ x: 0, z: L.cockpit.z + bz, r: L.cockpit.hw * 1.05, side: 0 });
  let halfW = 0; for (const c of circles) halfW = Math.max(halfW, Math.abs(c.x) + c.r);
  const out = { circles, halfW }; collCache.set(def.id, out); return out;
}

/** Exact 3D ground-clearance envelope in group-local space (accounts for body.position.z, cowling radius, rings & wings). */
export interface PodEnvelope {
  engL: { x: number; outerX: number; frontZ: number; backZ: number; minY: number };
  engR: { x: number; outerX: number; frontZ: number; backZ: number; minY: number };
  cockpit: { z: number; minY: number };
}
const envCache = new Map<string, PodEnvelope>();
export function podEnvelope(def: PodDef): PodEnvelope {
  const hit = envCache.get(def.id); if (hit) return hit;
  const L = podLayout(def); const bz = -L.cockpit.z * 0.25;
  const sideEnv = (sign: number) => {
    const ms = L.engines.filter(e => (e.x < 0 ? -1 : 1) === sign);
    let sx = 0, outerX = 0, frontZ = -1e9, backZ = 1e9, minY = 0;
    for (const e of ms) {
      const rBot = e.spec.R * (e.spec.style === 'ring' ? 1.36 : 1.12) + 0.1;
      sx += e.x;
      outerX = Math.max(outerX, Math.abs(e.x) + e.spec.R * (e.spec.style === 'blade' ? 2.1 : 1.1));
      frontZ = Math.max(frontZ, e.z + bz + e.spec.L * 0.5);
      backZ = Math.min(backZ, e.z + bz - e.spec.L * 0.5);
      minY = Math.min(minY, e.y - rBot);
    }
    if (def.id === 'aurora') { outerX = Math.max(outerX, 4.45); minY = Math.min(minY, -0.62); }
    return { x: sx / Math.max(1, ms.length), outerX: sign * outerX, frontZ, backZ, minY };
  };
  const ck = L.cockpit;
  const out: PodEnvelope = {
    engL: sideEnv(-1),
    engR: sideEnv(1),
    cockpit: { z: ck.z + bz, minY: ck.y - ck.hw * 0.68 - 0.14 },
  };
  envCache.set(def.id, out);
  return out;
}
