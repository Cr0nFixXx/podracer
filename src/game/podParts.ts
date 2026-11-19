import * as THREE from 'three';
import type { EngineStyle } from './data';
import { PartBuilder, M4, blade, boltRing, cyl, extrude, lathe, prof, radial, rbox, sphere, torus, tube, type MatKey } from './podKit';

/** Parametric podracer engine. Geometry is merged per material and cached per spec. */
export interface EngineSpec { L: number; R: number; style: EngineStyle; bands: number; blades: number; spike: boolean; fins: number; }
export interface FlapGeo { geo: THREE.BufferGeometry; pivot: THREE.Vector3; sign: number; }
export interface EngineGeo {
  parts: Map<MatKey, THREE.BufferGeometry>;
  fan: THREE.BufferGeometry; fanZ: number;
  flaps: FlapGeo[];
  /** animated nozzle petals (attribute aPet), see petalMaterial() */
  petals: THREE.BufferGeometry;
  flameOuter: THREE.BufferGeometry; flameCore: THREE.BufferGeometry; flameZ: number;
  exhaustZ: number; pylon: THREE.Vector3; frontZ: number; top: number; R: number; L: number;
}

const cache = new Map<string, EngineGeo>();

function flameGeo(rn: number, len: number, seg: number) {
  const pts: [number, number, 0][] = [];
  for (let i = 0; i <= 12; i++) { const t = 1 - i / 12; const r = rn * Math.pow(1 - t, 0.55) * (1 + 0.18 * Math.sin(Math.PI * t)) + 0.01; pts.push([r, -t * len, 0]); }
  return lathe(prof(pts), seg, 0);
}

export function engineGeo(spec: EngineSpec, seg: number): EngineGeo {
  const key = `${spec.L}|${spec.R}|${spec.style}|${spec.bands}|${spec.blades}|${spec.spike}|${spec.fins}|${seg}`;
  const hit = cache.get(key); if (hit) return hit;
  const { L, R, style } = spec;
  const pb = new PartBuilder();
  const Z = (t: number) => -L / 2 + t * L;
  const segS = Math.max(10, Math.round(seg * 0.5));
  const bodyR = (t: number) => {
    switch (style) {
      case 'needle': return t < 0.3 ? 0.66 + 0.34 * Math.sin((t / 0.3) * Math.PI / 2) : 1 - 0.26 * Math.pow((t - 0.3) / 0.7, 1.5);
      case 'heavy': return 0.86 + 0.14 * Math.sin(Math.PI * t);
      case 'long': return t < 0.45 ? 0.82 + 0.18 * (t / 0.45) : 1.0;
      case 'ring': return 0.92;
      case 'blade': return 0.95;
      default: return 1.0;
    }
  };
  const split = style === 'split';
  const bodyEnd = split ? 0.8 : 1.0;

  // ---------------- outer cowling (painted, livery mode 1) ----------------
  const pts: [number, number, (0 | 1)?][] = [];
  const P = (t: number, r: number, hard = false) => pts.push([r * R, Z(t), hard ? 1 : 0]);
  P(0, 0.74, true); P(0.025, 0.8); P(0.08, bodyR(0.08) * 0.94); P(0.13, bodyR(0.13));
  const bandTs: number[] = []; for (let i = 0; i < spec.bands; i++) bandTs.push(0.2 + ((i + 0.5) / spec.bands) * 0.6);
  let t0 = 0.13;
  for (const tb of bandTs) {
    if (tb > bodyEnd - 0.04) break;
    for (let s = t0 + 0.05; s < tb - 0.03; s += 0.05) P(s, bodyR(s));
    const rb = bodyR(tb);
    P(tb - 0.013, rb, true); P(tb - 0.007, rb * 0.955, true); P(tb + 0.007, rb * 0.955, true); P(tb + 0.013, rb, true);
    t0 = tb + 0.013;
  }
  for (let s = t0 + 0.05; s < bodyEnd - 0.07; s += 0.05) P(s, bodyR(s));
  const rf = bodyR(0.93);
  if (!split) { P(0.92, rf); P(0.955, rf * 1.035); P(0.985, rf * 1.02); P(1.0, rf * 0.95, true); }
  else { P(bodyEnd - 0.02, rf, true); P(bodyEnd, rf * 0.97, true); }
  pb.add('hull', lathe(prof(pts), seg, 1));

  // ---------------- intake: throat, fan face, spinner ----------------
  const thr = rf * 0.95 * R, faceZ = Z(0.915);
  pb.add('steel', lathe(prof([[split ? rf * 0.97 * R : thr, split ? Z(bodyEnd) : Z(1.0)], [rf * 0.885 * R, split ? Z(bodyEnd - 0.01) : Z(0.992)], [rf * 0.86 * R, split ? Z(bodyEnd - 0.03) : Z(0.97)], [rf * 0.86 * R, faceZ, 1], [rf * 0.6 * R, faceZ]]), seg, 0));
  pb.add('dark', lathe(prof([[rf * 0.6 * R, faceZ], [0.2 * R, faceZ]]), seg, 0));
  if (spec.spike) pb.add('chrome', lathe(prof([[0.22 * R, faceZ, 1], [0.2 * R, faceZ + L * 0.03], [0.12 * R, Z(1.0)], [0.015 * R, Z(1.0) + L * 0.26]]), segS, 0));
  else pb.add('chrome', lathe(prof([[0.22 * R, faceZ, 1], [0.21 * R, faceZ + L * 0.035], [0.14 * R, faceZ + L * 0.07], [0.0, faceZ + L * 0.085]]), segS, 0));
  const detailHi = seg >= 24;
  if (!split && detailHi) pb.add('chrome', boltRing(rf * 0.985 * R, Math.round(seg * 0.5), 0.02 * R, Z(1.0) - 0.01));
  if (style === 'heavy' || style === 'turbine') pb.add('hazard', torus(rf * 1.005 * R, 0.022 * R, 5, seg), M4.t(0, 0, Z(0.965)));

  // fan (rotating) – twisted blades
  const nb = detailHi ? spec.blades : Math.max(8, Math.round(spec.blades * 0.65)); const rMid = 0.52 * R;
  const fan = radial(() => blade(0.21 * R, 0.83 * rf * R, (Math.PI * 2 * rMid / nb) * 1.25, 0.03 * R, 1.0, 0.38, 3), nb);
  fan.computeBoundingSphere();

  // ---------------- exhaust nozzle ----------------
  pb.add('dark', lathe(prof([[0, Z(0.07)], [0.58 * R, Z(0.07), 1], [0.6 * R, Z(0.06)], [0.66 * R, Z(0), 1], [0.74 * R, Z(0)]]), seg, 0));
  pb.add('glow', new THREE.CircleGeometry(0.5 * R, seg).rotateY(Math.PI).translate(0, 0, Z(0.07) - 0.01));
  pb.add('glow', torus(0.6 * R, 0.018 * R, 6, seg), M4.t(0, 0, Z(0.035)));
  // iris petals around the nozzle exit
  const np = Math.max(10, Math.round(seg * 0.35));
  // Session 16: the iris petals are a separate, animated geometry (they open when boosting). Each vertex carries its petal's outward
  // direction (aPet.xy) and how far it swings out when fully open (aPet.z: 0 at the hinge, 0.42·R at the tip).
  const petals = (() => {
    const pos: number[] = [], pet: number[] = [], idx: number[] = []; const zH = Z(0) + 0.012 * L, zT = Z(0) - 0.085 * L, rH = 0.745 * R, rT = 0.6 * R;
    for (let q = 0; q < np; q++) {
      const a0 = (q + 0.05) / np * Math.PI * 2, a1 = (q + 0.95) / np * Math.PI * 2, am = (a0 + a1) / 2, b = pos.length / 3;
      for (const [a, z, r, d] of [[a0, zH, rH, 0], [a1, zH, rH, 0], [a0, zT, rT, 0.42 * R], [a1, zT, rT, 0.42 * R]]) { pos.push(Math.cos(a) * r, Math.sin(a) * r, z); pet.push(Math.cos(am), Math.sin(am), d); }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aPet', new THREE.Float32BufferAttribute(pet, 3)); g.setIndex(idx); g.computeVertexNormals();
    const out = g.toNonIndexed(); g.dispose(); return out;
  })();
  pb.add('steel', torus(0.75 * R, 0.03 * R, 6, seg), M4.t(0, 0, Z(0.005)));

  // ---------------- band rings + bolts ----------------
  bandTs.forEach((tb, i) => {
    if (tb > bodyEnd - 0.04) return;
    const rb = bodyR(tb) * 0.955 * R;
    pb.add(style === 'heavy' ? 'dark' : 'steel', torus(rb + 0.012 * R, (style === 'heavy' ? 0.045 : 0.032) * R, 6, seg), M4.t(0, 0, Z(tb)));
    if (detailHi && i % 2 === 0) pb.add('chrome', boltRing(rb + 0.035 * R, Math.round(seg * 0.45), 0.018 * R, Z(tb), true));
  });

  // ---------------- armour side plates (secondary paint) ----------------
  {
    const a0 = 0.3, a1 = split ? 0.62 : 0.7; let rmax = 0; for (let s = a0; s <= a1; s += 0.02) rmax = Math.max(rmax, bodyR(s));
    const r0 = rmax * R + 0.01, r1 = r0 + (style === 'heavy' ? 0.06 : 0.035) * R;
    const plate = prof([[r1, Z(a0), 1], [r1, Z(a1), 1], [r0, Z(a1), 1], [r0, Z(a0), 1], [r1, Z(a0), 1]]);
    const span = style === 'heavy' ? 1.1 : 0.8;
    for (const c of [Math.PI / 2, Math.PI * 1.5]) pb.add('hull', lathe(plate, Math.max(6, Math.round(seg * 0.2)), 3, c - span / 2, span));
    if (detailHi) for (const sd of [-1, 1]) for (let s = a0 + 0.04; s < a1 - 0.01; s += 0.08) for (const dy of [-0.3, 0.3]) {
      pb.add('chrome', cyl(0.018 * R, 0.018 * R, 0.02 * R, 6), M4.trs(sd * (r1 + 0.005) * Math.cos(dy), r1 * Math.sin(dy), Z(s), 0, 0, Math.PI / 2));
    }
  }

  // ---------------- pipes & clamps ----------------
  const pipeSides = style === 'needle' ? [1] : [-1, 1];
  const pipeSeg = Math.max(12, Math.round(seg * 0.55));
  for (const sd of pipeSides) for (const [ang, mat, rad] of [[0.62, 'copper', 0.036], [0.85, 'steel', 0.028]] as [number, MatKey, number][]) {
    const pp: THREE.Vector3[] = []; const tA = 0.16, tB = split ? 0.74 : 0.86;
    for (let k = 0; k <= 8; k++) {
      const tt = tA + (tB - tA) * (k / 8); const lift = Math.sin((k / 8) * Math.PI);
      const rr = bodyR(tt) * R * (0.985 + 0.1 * lift) + rad * R * 1.2;
      const a = sd * ang;
      pp.push(new THREE.Vector3(Math.sin(a) * rr, Math.cos(a) * rr, Z(tt)));
    }
    pb.add(mat, tube(pp, rad * R, pipeSeg, 6));
    if (detailHi) for (let k = 1; k < 8; k += 2) { const p = pp[k]; pb.add('dark', torus(rad * R * 1.5, rad * R * 0.45, 5, 10), M4.t(p.x, p.y, p.z)); }
  }

  // ---------------- louvre vents on the flanks ----------------
  for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) {
    const tt = 0.17 + i * 0.022; const r = bodyR(tt) * R;
    pb.add('dark', rbox(0.03 * R, 0.34 * R, 0.016 * L, 0.006), M4.trs(sd * (r + 0.01 * R), -0.05 * R, Z(tt), 0, sd * 0.5, 0));
  }

  // ---------------- heat-sink fins ----------------
  if (style === 'long' || style === 'heavy' || spec.fins > 0) {
    const nf = Math.max(12, spec.fins * 3); const rr = bodyR(0.22) * R;
    pb.add('dark', radial(() => rbox(0.022 * R, 0.2 * R, 0.13 * L, 0.006).translate(0, rr + 0.09 * R, Z(0.22)), nf, 0.13));
  }

  // ---------------- belly repulsor + top pylon + sensor ----------------
  const bellyR = bodyR(0.5) * R;
  pb.add('dark', rbox(0.34 * R, 0.08 * R, 0.5 * L, 0.03), M4.t(0, -bellyR - 0.02 * R, Z(0.5)));
  pb.add('glow', rbox(0.2 * R, 0.03 * R, 0.44 * L, 0.01), M4.t(0, -bellyR - 0.07 * R, Z(0.5)));
  const topR = bodyR(0.58) * R; const py = topR + 0.42;
  pb.add('steel', rbox(0.16, 0.46, 0.34, 0.04), M4.t(0, topR + 0.2, Z(0.58)));
  pb.add('chrome', torus(0.1, 0.03, 8, 16), M4.trs(0, py + 0.06, Z(0.58), 0, Math.PI / 2, 0));
  pb.add('dark', cyl(0.025, 0.025, 0.5, 6), M4.trs(0.18 * R, bodyR(0.85) * R + 0.22, Z(0.85), 0.25, 0, 0));
  pb.add('glow', sphere(0.045, 8, 6), M4.t(0.18 * R, bodyR(0.85) * R + 0.47, Z(0.85) + 0.06));

  // ---------------- style specific ----------------
  if (split) {
    // Split-X: four armoured petals around the intake, hinged open
    const petal = prof([[rf * 1.02 * R, Z(bodyEnd), 1], [rf * 1.06 * R, Z(0.9)], [rf * 1.05 * R, Z(0.98)], [rf * 0.98 * R, Z(1.0), 1], [rf * 0.93 * R, Z(1.0), 1], [rf * 0.95 * R, Z(bodyEnd), 1], [rf * 1.02 * R, Z(bodyEnd)]]);
    for (let q = 0; q < 4; q++) {
      const c = Math.PI / 4 + q * Math.PI / 2; const gap = 0.12;
      const g = lathe(petal, Math.max(8, Math.round(seg / 4)), 3, c - Math.PI / 4 + gap / 2, Math.PI / 2 - gap);
      const hinge = new THREE.Vector3(Math.sin(c) * rf * R, Math.cos(c) * rf * R, Z(bodyEnd));
      const axis = new THREE.Vector3(Math.cos(c), -Math.sin(c), 0);
      const m = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, -0.22)).multiply(new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z));
      pb.add('hull', g, m);
      pb.add('steel', rbox(0.12 * R, 0.12 * R, 0.08 * L, 0.02), new THREE.Matrix4().makeTranslation(hinge.x * 1.02, hinge.y * 1.02, hinge.z));
    }
    // radial cooling slats on top
    for (let i = 0; i < 9; i++) pb.add('steel', rbox(0.035 * R, 0.32 * R, 0.4 * L, 0.01), M4.t((i - 4) * 0.11 * R, R * 1.08, Z(0.45)));
  }
  if (style === 'ring') {
    const rr = 1.24 * R;
    pb.add('hull', torus(rr, 0.11 * R, 12, seg), M4.t(0, 0, Z(0.95)), [0, 0, 3]);
    pb.add('chrome', torus(rr - 0.11 * R, 0.025 * R, 6, seg), M4.t(0, 0, Z(0.95) + 0.06 * R));
    for (let q = 0; q < 4; q++) { const a = Math.PI / 4 + q * Math.PI / 2; const mid = (rr + rf * R) / 2; pb.add('steel', rbox(0.08 * R, rr - rf * R + 0.1 * R, 0.1 * R, 0.02), M4.trs(Math.sin(a) * mid, Math.cos(a) * mid, Z(0.95), 0, 0, -a)); }
  }
  if (style === 'blade') {
    for (const sd of [-1, 1]) {
      const g = extrude([[0, 0], [1.25 * R, -0.25 * L], [1.3 * R, -0.42 * L], [0.0, -0.6 * L]], 0.05 * R, 0.015);
      g.rotateX(-Math.PI / 2); if (sd < 0) g.scale(-1, 1, 1);
      pb.add('hull', g, M4.t(sd * bodyR(0.6) * R * 0.9, 0, Z(0.8)), [0, 0, 3]);
    }
  }
  if (style === 'needle') pb.add('chrome', torus(rf * 0.75 * R, 0.02 * R, 6, seg), M4.t(0, 0, Z(0.97)));

  // ---------------- airbrake flaps (side, hinged at front edge) ----------------
  const flaps: FlapGeo[] = [];
  {
    const fr = bodyR(0.5) * R; const len = 0.22 * L;
    for (const sd of [-1, 1]) {
      const g = rbox(0.045 * R, 0.62 * R, len, 0.015).translate(0, 0, -len / 2);
      const gg = new PartBuilder().add('hull', g, undefined, [0, 0, 3]).build().get('hull')!;
      flaps.push({ geo: gg, pivot: new THREE.Vector3(sd * (fr + 0.06 * R), 0.05 * R, Z(0.62)), sign: -sd });
    }
  }

  const rn = 0.5 * R;
  const out: EngineGeo = {
    parts: pb.build(), fan, fanZ: faceZ + 0.06 * L * 0.5,
    flaps, petals, flameOuter: flameGeo(rn, L * 0.75, Math.max(12, Math.round(seg * 0.5))), flameCore: flameGeo(rn * 0.42, L * 0.38, 12), flameZ: Z(0.07) - 0.02,
    exhaustZ: Z(0) - 0.12 * L, pylon: new THREE.Vector3(0, py + 0.06, Z(0.58)), frontZ: Z(1.0), top: py, R, L,
  };
  cache.set(key, out);
  return out;
}
