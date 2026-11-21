// Cockpits: the gondola the pilot sits in. Geometry only (merged per material key, cached) – no materials, no three/webgpu.
import * as THREE from 'three';
import type { PilotHead } from './data';
import { PartBuilder, M4, cyl, extrude, lathe, loft, loftRim, prof, rbox, sphere, torus, tube, type Section } from './podKit';
import type { CockpitStyle, PodLayout } from './podLayouts';

export interface CockpitInfo { head: THREE.Vector3; anchors: [THREE.Vector3, THREE.Vector3]; }
export interface CockpitGeo { parts: Map<string, THREE.BufferGeometry>; info: CockpitInfo }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

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

/** Builds pilot figure with its head / racing helmet variant (`PilotDef.head`). */
function pilotParts(pb: PartBuilder, s: number, hip: THREE.Vector3, kind: PilotHead) {
  const base = new THREE.Matrix4().compose(hip, new THREE.Quaternion(), V(s, s, s));
  const at = (m: THREE.Matrix4) => base.clone().multiply(m);
  const torso = lathe(prof([[0, 0], [0.16, 0, 1], [0.19, 0.12], [0.21, 0.32], [0.19, 0.44], [0.12, 0.52], [0.06, 0.56], [0, 0.57]]), 18, 0);
  torso.rotateX(-Math.PI / 2); torso.scale(1.15, 1, 0.82);
  pb.add('suit', torso, at(M4.trs(0, 0, 0, 0.22, 0, 0)));
  for (const sd of [-1, 1]) pb.add('leather', rbox(0.05, 0.5, 0.02, 0.01), at(M4.trs(sd * 0.09, 0.27, 0.19, 0.22, 0, sd * 0.12)));
  pb.add('chrome', cyl(0.035, 0.035, 0.02, 10), at(M4.trs(0, 0.25, 0.205, Math.PI / 2 + 0.22, 0, 0)));
  const head = V(0, 0.71, 0.17);
  if (kind === 'snout') {
    // Elongated predatory snout, swept brow horns & leather racing cap with oversized goggles
    pb.add('skin', sphere(0.115, 16, 12), at(M4.trs(head.x, head.y, head.z + 0.03, 0.18, 0, 0, 0.88, 0.92, 1.38)));
    pb.add('leather', sphere(0.124, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), at(M4.trs(head.x, head.y + 0.02, head.z - 0.02, -0.3, 0, 0, 0.94, 0.95, 1.15)));
    for (const sd of [-1, 1]) {
      pb.add('leather', cyl(0.012, 0.032, 0.14, 7), at(M4.trs(head.x + sd * 0.085, head.y + 0.09, head.z - 0.06, -0.75, 0, sd * -0.35)));
      pb.add('chrome', cyl(0.048, 0.052, 0.05, 12), at(M4.trs(head.x + sd * 0.058, head.y + 0.035, head.z + 0.13, Math.PI / 2, 0, 0)));
      pb.add('glow', sphere(0.038, 10, 8), at(M4.trs(head.x + sd * 0.058, head.y + 0.035, head.z + 0.15, 0, 0, 0, 1, 0.8, 0.45)));
    }
  } else if (kind === 'crest') {
    // Tall swept alien cranial fin + twin trailing lekku / head-tails + sleek wrap visor
    pb.add('skin', sphere(0.112, 16, 12), at(M4.trs(head.x, head.y, head.z, -0.25, 0, 0, 0.9, 1.15, 1.25)));
    pb.add('suit', rbox(0.045, 0.14, 0.24, 0.018), at(M4.trs(head.x, head.y + 0.11, head.z - 0.06, -0.35, 0, 0)));
    for (const sd of [-1, 1]) pb.add('skin', tube([V(head.x + sd * 0.08, head.y + 0.02, head.z - 0.06), V(head.x + sd * 0.11, head.y - 0.1, head.z - 0.18), V(head.x + sd * 0.09, head.y - 0.24, head.z - 0.22)], 0.032, 8, 7), base);
    pb.add('visor', sphere(0.118, 16, 8, 0, Math.PI, Math.PI * 0.25, Math.PI * 0.32), at(M4.trs(head.x, head.y + 0.02, head.z + 0.02, 0, 0, 0, 1.02, 0.9, 1.05)));
  } else if (kind === 'aero') {
    // Futuristic full-face armored aero-helmet with swept dorsal fin & glowing wrap visor
    pb.add('suit', sphere(0.138, 18, 14), at(M4.trs(head.x, head.y + 0.015, head.z, 0, 0, 0, 0.98, 1.06, 1.22)));
    pb.add('dark', rbox(0.04, 0.09, 0.26, 0.012), at(M4.trs(head.x, head.y + 0.13, head.z - 0.05, -0.2, 0, 0)));
    pb.add('visor', sphere(0.141, 18, 8, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.34), at(M4.trs(head.x, head.y + 0.015, head.z + 0.015, 0, 0, 0, 1.0, 0.95, 1.2)));
    pb.add('glow', rbox(0.16, 0.016, 0.02, 0.004), at(M4.t(head.x, head.y + 0.02, head.z + 0.165)));
  } else if (kind === 'dome') {
    // Broad domed pressurized helmet + wide cyber-optic rangefinder bar + twin sensor antennae
    pb.add('chrome', sphere(0.136, 18, 12), at(M4.trs(head.x, head.y + 0.01, head.z, 0, 0, 0, 1.12, 0.96, 1.08)));
    pb.add('dark', rbox(0.24, 0.065, 0.09, 0.016), at(M4.t(head.x, head.y + 0.025, head.z + 0.11)));
    pb.add('glow', rbox(0.2, 0.026, 0.02, 0.005), at(M4.t(head.x, head.y + 0.025, head.z + 0.156)));
    for (const sd of [-1, 1]) pb.add('steel', cyl(0.008, 0.012, 0.16, 6), at(M4.trs(head.x + sd * 0.13, head.y + 0.11, head.z - 0.02, -0.3, 0, sd * -0.2)));
  } else {
    // 'goggles': classic Outer-Rim flight helmet with chrome rim & twin reflective racing goggles
    pb.add('skin', sphere(0.112, 18, 14), at(M4.trs(head.x, head.y - 0.015, head.z + 0.02, 0, 0, 0, 0.95, 1.05, 1)));
    pb.add('leather', sphere(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.64), at(M4.trs(head.x, head.y + 0.012, head.z - 0.015, -0.25, 0, 0, 1, 1.05, 1.1)));
    pb.add('chrome', rbox(0.032, 0.04, 0.22, 0.008), at(M4.trs(head.x, head.y + 0.135, head.z - 0.02, -0.18, 0, 0)));
    pb.add('rubber', torus(0.122, 0.013, 6, 24), at(M4.trs(head.x, head.y + 0.035, head.z, Math.PI / 2 - 0.2, 0, 0)));
    for (const sd of [-1, 1]) {
      pb.add('chrome', cyl(0.046, 0.05, 0.046, 14), at(M4.trs(head.x + sd * 0.052, head.y + 0.03, head.z + 0.105, Math.PI / 2, 0, 0)));
      pb.add('visor', sphere(0.041, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), at(M4.trs(head.x + sd * 0.052, head.y + 0.03, head.z + 0.128, Math.PI / 2, 0, 0, 1, 0.45, 1)));
    }
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

const cockpitCache = new Map<string, CockpitGeo>();

/** Hollow lofted cockpit tub with interior, dashboard, roll-hoop, windscreen, controls, pilot & fittings. */
export function cockpitGeo(L: PodLayout, seg: number, head: PilotHead = 'goggles'): CockpitGeo {
  const c = L.cockpit; const key = `${c.style}|${c.hw}|${c.len}|${c.pilot}|${head}|${seg}`;
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
  const pil = pilotParts(pb, c.pilot, V(0, hipY, hipZ), head);
  // Chrome twin-strut racing roll-hoop behind the headrest + glowing HUD targeting reticle above dashboard
  pb.add('chrome', torus(0.24 * c.pilot, 0.022, 7, 18, Math.PI), M4.t(0, hipY + 0.78 * c.pilot, hipZ - 0.34));
  pb.add('glow', torus(0.055, 0.006, 5, 16), M4.t(0, rimY + 0.11, zB - 0.34 * (zB - zA)));
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
  const out: CockpitGeo = { parts: pb.build() as Map<string, THREE.BufferGeometry>, info: { head: pil.head, anchors } };
  cockpitCache.set(key, out);
  return out;
}
