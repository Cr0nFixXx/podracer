// Engines of the Session 20 pods. Each style has a builder of its own with the same EngineGeo contract as the round turbine in
// podParts.ts:  rotor (Tarn Cyclone) · hoop (Lyss Halo-9) · slab (Dorn Manta) · cage (Quill Voltspire)
// Geometry only: no materials, no three/webgpu, no DOM (this file is bundled into the node CI).
// Engine space: +z = forward (intake), -z = exhaust, +y = up; the engine axis is the z axis.
import * as THREE from 'three';
import type { EngineStyle } from './data';
import { PartBuilder, M4, blade, boltRing, cyl, extrude, flameGeo, lathe, loft, prof, radial, rbox, sphere, torus, tube, type Section } from './podKit';
import type { EngineExtent, EngineGeo, EngineSpec, FlapGeo } from './podParts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const HALF = Math.PI / 2;
const SEC: [number, number, number] = [0, 0, 3]; // solid secondary paint

// ------------------------------------------------------------------ shared pieces
/** Animated nozzle petals (petalMaterial): every vertex carries its petal's outward direction (aPet.xy) and how far it moves when
 *  the nozzle is wide open (aPet.z: 0 at the hinge, `swing` at the tip). */
function petalsFrom(pos: number[], pet: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aPet', new THREE.Float32BufferAttribute(pet, 3)); g.setIndex(idx); g.computeVertexNormals();
  const out = g.toNonIndexed(); g.dispose(); return out;
}
/** Iris of `np` petals around a round exit: hinge ring (rH, zH) → tip ring (rT, zT). */
function irisPetals(np: number, rH: number, rT: number, zH: number, zT: number, swing: number) {
  const pos: number[] = [], pet: number[] = [], idx: number[] = [];
  for (let q = 0; q < np; q++) {
    const a0 = (q + 0.05) / np * Math.PI * 2, a1 = (q + 0.95) / np * Math.PI * 2, am = (a0 + a1) / 2, b = pos.length / 3;
    for (const [a, z, r, d] of [[a0, zH, rH, 0], [a1, zH, rH, 0], [a0, zT, rT, swing], [a1, zT, rT, swing]]) { pos.push(Math.cos(a) * r, Math.sin(a) * r, z); pet.push(Math.cos(am), Math.sin(am), d); }
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  return petalsFrom(pos, pet, idx);
}
/** Round exhaust nozzle with exit radius `rN` at the rear end `z0`: dark cone, glowing throat, steel rim, iris petals, flames. */
function roundNozzle(pb: PartBuilder, rN: number, z0: number, L: number, seg: number, hi: boolean) {
  const zi = z0 + 0.07 * L; // throat plane
  pb.add('dark', lathe(prof([[0, zi], [rN * 0.78, zi, 1], [rN * 0.81, zi - 0.01 * L], [rN * 0.89, z0, 1], [rN, z0]]), seg, 0));
  pb.add('glow', new THREE.CircleGeometry(rN * 0.68, seg).rotateY(Math.PI).translate(0, 0, zi - 0.01));
  pb.add('glow', torus(rN * 0.81, rN * 0.024, 6, seg), M4.t(0, 0, z0 + 0.035 * L));
  pb.add('steel', torus(rN * 1.01, rN * 0.04, 6, seg), M4.t(0, 0, z0 + 0.005 * L));
  if (hi) {
    pb.add('copper', torus(rN * 1.04, rN * 0.03, 6, seg), M4.t(0, 0, z0 + 0.055 * L));
    pb.add('copper', radial(() => cyl(rN * 0.02, rN * 0.03, rN * 0.1, 6).rotateX(HALF).translate(0, rN * 0.95, z0 + 0.085 * L), 12)); // injector ring
  }
  const rn = rN * 0.68;
  return {
    petals: irisPetals(Math.max(10, Math.round(seg * 0.35)), rN * 1.007, rN * 0.81, z0 + 0.012 * L, z0 - 0.085 * L, rN * 0.57),
    flameOuter: flameGeo(rn, L * 0.75, Math.max(12, Math.round(seg * 0.5))), flameCore: flameGeo(rn * 0.42, L * 0.38, 12), flameZ: zi - 0.02, exhaustZ: z0 - 0.12 * L,
  };
}
/** Cable pylon on the spine (body top at `topR`): returns the cable anchor and the height of the pylon top. */
function cablePylon(pb: PartBuilder, topR: number, z: number) {
  const py = topR + 0.42;
  pb.add('steel', rbox(0.16, 0.46, 0.34, 0.04), M4.t(0, topR + 0.2, z));
  pb.add('chrome', torus(0.1, 0.03, 8, 16), M4.trs(0, py + 0.06, z, 0, HALF, 0));
  return { py, pylon: V(0, py + 0.06, z) };
}
/** Induction couplers of the energy binder on both flanks (the bolt anchors at the one that faces the partner engine). */
function couplers(pb: PartBuilder, x: number, y: number, z: number, s: number) {
  for (const sd of [-1, 1]) {
    pb.add('dark', cyl(0.15 * s, 0.19 * s, 0.1 * s, 10), M4.trs(sd * (x + 0.02 * s), y, z, 0, 0, sd * -HALF));
    pb.add('copper', torus(0.13 * s, 0.024 * s, 5, 12), M4.trs(sd * (x + 0.06 * s), y, z, 0, HALF, 0));
    pb.add('glow', sphere(0.075 * s, 8, 6), M4.t(sd * (x + 0.075 * s), y, z));
  }
}
/** Air-brake flap: a plate hinged at its front edge (`pivot`) that swings out about the vertical axis. `sign` = -1 opens towards +x. */
function sideFlap(w: number, h: number, len: number, pivot: THREE.Vector3, sign: number): FlapGeo {
  const g = rbox(w, h, len, 0.015).translate(0, 0, -len / 2);
  return { geo: new PartBuilder().add('hull', g, undefined, SEC).build().get('hull')!, pivot, sign };
}
/** Belly repulsor: dark plate with a glow strip. */
function bellyStrip(pb: PartBuilder, w: number, len: number, y: number, z: number) {
  pb.add('dark', rbox(w, 0.1, len, 0.03), M4.t(0, y - 0.03, z));
  pb.add('glow', rbox(w * 0.6, 0.035, len * 0.88, 0.01), M4.t(0, y - 0.09, z));
}

// ------------------------------------------------------------------ rotor: Tarn Cyclone
/** Guard hoop radius of the rotor engine relative to its body radius. */
const HOOP = 1.42;
function rotorExtent({ R, L }: EngineSpec): EngineExtent { const Rh = HOOP * R; return { coll: Rh + 0.04, bottom: Rh + 0.07, side: Rh + 0.07, top: R, halfL: L * 0.5 }; }

/** A short fat body that drives a big open rotor; the rotor turns inside a guard hoop held by four struts. */
function rotorEngine(spec: EngineSpec, seg: number): EngineGeo {
  const { L, R } = spec; const pb = new PartBuilder(); const Z = (t: number) => -L / 2 + t * L;
  const hi = seg >= 24, ultra = seg >= 40;
  const Rh = HOOP * R, zR = Z(0.88), th = 0.036; // hoop centre radius, rotor plane, half skin thickness of the hoop
  // fat barrel that necks down into the rotor hub
  const bodyR = (t: number) => (t < 0.12 ? 0.7 + 0.3 * Math.sin((t / 0.12) * HALF) : t < 0.58 ? 1 : 1 - 0.52 * Math.pow((t - 0.58) / 0.24, 1.6));
  const pts: [number, number, (0 | 1)?][] = [[0.66 * R, Z(0), 1]];
  for (let t = 0.02; t < 0.815; t += 0.04) pts.push([bodyR(t) * R, Z(t)]);
  pts.push([bodyR(0.82) * R, Z(0.82), 1]);
  pb.add('hull', lathe(prof(pts), seg, 1));
  const rHub = bodyR(0.82) * R;
  pb.add('steel', lathe(prof([[rHub, Z(0.82), 1], [rHub * 1.04, Z(0.835)], [rHub * 0.98, zR - 0.09, 1], [rHub * 0.7, zR - 0.09]]), seg, 0)); // hub collar
  pb.add('chrome', lathe(prof([[0.4 * R, zR + 0.08, 1], [0.37 * R, zR + 0.2], [0.24 * R, Z(0.97)], [0.1 * R, Z(1.0) + 0.02 * L], [0, Z(1.0) + 0.045 * L]]), Math.max(10, Math.round(seg * 0.5)), 0)); // spinner

  // the rotor: broad scimitar blades on a hub disc (its own turning mesh)
  const fpb = new PartBuilder();
  fpb.add('steel', radial(() => blade(0.36 * R, Rh - 0.13, 0.46 * R, 0.05 * R, 0.95, 0.3, 3), Math.max(3, spec.blades)));
  fpb.add('steel', cyl(0.42 * R, 0.44 * R, 0.17, Math.max(12, Math.round(seg * 0.6))).rotateX(HALF));
  const fan = fpb.build().get('steel')!; fan.computeBoundingSphere();

  // guard hoop: a ring with an aerofoil section (secondary paint), light strip on the lip, warning band
  const zf = zR + 0.2, zb = zR - 0.52;
  pb.add('hull', lathe(prof([[Rh, zb, 1], [Rh + th, zb + 0.16], [Rh + th * 1.1, zf - 0.14], [Rh, zf], [Rh - th, zf - 0.1], [Rh - th * 0.85, zb + 0.14], [Rh, zb]]), seg, 3));
  pb.add('glow', torus(Rh, 0.017, 5, seg), M4.t(0, 0, zf + 0.004));
  pb.add('hazard', torus(Rh + th * 1.05, 0.018, 5, seg), M4.t(0, 0, zb + 0.22));
  { // four struts from the body shoulder to the rear of the hoop (they pass behind the rotor)
    const ri = bodyR(0.7) * R - 0.05, zi = Z(0.7), ro = Rh - th * 0.5, zo = zb + 0.12, len = Math.hypot(ro - ri, zo - zi), a = Math.atan2(zo - zi, ro - ri);
    pb.add('steel', radial(() => rbox(0.07, len, 0.2, 0.02).rotateX(a).translate(0, (ri + ro) / 2, (zi + zo) / 2), 4, Math.PI / 4));
    if (hi) pb.add('dark', radial(() => sphere(0.085, 8, 6).translate(0, ri + 0.03, zi), 4, Math.PI / 4)); // root fairings
  }

  // band rings, armour cheeks (secondary paint), exhaust stacks, cooling gills, fuel line
  for (const tb of [0.2, 0.36, 0.52]) {
    pb.add('steel', torus(R * 1.012, 0.034 * R, 6, seg), M4.t(0, 0, Z(tb)));
    if (hi) pb.add('chrome', boltRing(R * 1.045, Math.round(seg * 0.45), 0.018 * R, Z(tb), true));
  }
  { const r0 = R + 0.012, r1 = r0 + 0.04 * R, plate = prof([[r1, Z(0.31), 1], [r1, Z(0.57), 1], [r0, Z(0.57), 1], [r0, Z(0.31), 1], [r1, Z(0.31)]]);
    for (const c of [HALF, HALF * 3]) pb.add('hull', lathe(plate, Math.max(6, Math.round(seg * 0.2)), 3, c - 0.45, 0.9)); }
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
    const phi = sd * 0.92, m = M4.trs(Math.sin(phi) * R * 1.06, Math.cos(phi) * R * 1.06, Z(0.3 + i * 0.075) - 0.05, -0.55, 0, -phi);
    pb.add('dark', cyl(0.05 * R, 0.062 * R, 0.36 * R, 8), m);
    if (hi) pb.add('copper', torus(0.066 * R, 0.014 * R, 5, 10), m.clone().multiply(M4.trs(0, -0.1 * R, 0, HALF, 0, 0)));
  }
  for (let i = 0; i < 5; i++) { const tt = 0.07 + i * 0.03; pb.add('dark', rbox(0.5 * R, 0.03 * R, 0.018 * L, 0.006), M4.t(0, bodyR(tt) * R + 0.004, Z(tt))); }
  { const pp: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) { const tt = 0.1 + 0.5 * (k / 8), rr = bodyR(tt) * R * (1 + 0.07 * Math.sin((k / 8) * Math.PI)) + 0.05 * R; pp.push(V(Math.sin(0.42) * rr, Math.cos(0.42) * rr, Z(tt))); }
    pb.add('copper', tube(pp, 0.034 * R, Math.max(12, Math.round(seg * 0.55)), 6));
    if (hi) for (let k = 1; k < 8; k += 2) pb.add('dark', torus(0.05 * R, 0.016 * R, 5, 10), M4.t(pp[k].x, pp[k].y, pp[k].z)); }

  bellyStrip(pb, 0.36 * R, 0.44 * L, -R, Z(0.34));
  const { py, pylon } = cablePylon(pb, R, Z(0.42));
  pb.add('dark', cyl(0.025, 0.025, 0.5, 6), M4.trs(-0.2 * R, R * 0.98 + 0.22, Z(0.6), 0.25, 0, 0));
  pb.add('glow', sphere(0.045, 8, 6), M4.t(-0.2 * R, R * 0.98 + 0.47, Z(0.6) + 0.06));
  couplers(pb, R * 0.985, 0.2 * R, Z(0.45), R * 0.8);
  if (hi) {
    pb.add('chrome', boltRing(rHub * 0.86, 10, 0.02 * R, zR - 0.09));                                             // hub bolts
    pb.add('chrome', boltRing(Rh + th * 1.1 + 0.004, Math.round(seg * 0.9), 0.014 * R, zb + 0.36, true));        // hoop rivets
    for (const sd of [-1, 1]) { const h = sd * 0.5; pb.add('chrome', torus(0.05 * R + 0.03, 0.008 * R + 0.005, 5, 8, Math.PI), M4.trs(Math.sin(h) * R, Math.cos(h) * R, Z(0.24), 0, HALF, -h)); } // grab handles
    for (const sd of [-1, 1]) pb.add('chrome', cyl(0.018 * R, 0.018 * R, 0.1 * L, 5).rotateX(HALF), M4.t(sd * (R + 0.03 * R), -0.24 * R, Z(0.3)));    // flap rams
    if (ultra) {
      pb.add('glow', radial(() => sphere(0.03, 6, 4).translate(0, Rh + th * 1.1, zb + 0.5), 4));                 // marker lights on the hoop
      pb.add('chrome', boltRing(Rh - th - 0.004, Math.round(seg * 0.6), 0.012 * R, zf - 0.16, true));
      pb.add('dark', radial(() => cyl(0.005 * R + 0.003, 0.005 * R + 0.003, 0.12 * R + 0.05, 4).rotateX(HALF).translate(0, 0.67 * R, Z(0) - 0.05 * R), 6, 0.4)); // static wicks
    }
  }

  const flaps = [-1, 1].map(sd => sideFlap(0.05 * R, 0.6 * R, 0.2 * L, V(sd * (R + 0.075 * R), 0.05 * R, Z(0.28)), -sd));
  const nz = roundNozzle(pb, 0.66 * R, Z(0), L, seg, hi);
  return {
    parts: pb.build(), fan, fanZ: zR, fanMat: 'steel', fanSpin: 0.36, openRotor: true, flaps, ...nz,
    pylon, frontZ: Z(1.0) + 0.045 * L, top: py, R, L, binder: V(R * 0.97, R * 0.2, Z(0.45)), breakParts: [],
  };
}

// ------------------------------------------------------------------ hoop: Lyss Halo-9
/** Radius of the ring wing relative to the core radius, and its chord relative to the engine length. */
const RING = 3.4, RING_CHORD = 0.2;
function hoopExtent({ R, L }: EngineSpec): EngineExtent { const Rw = RING * R; return { coll: Rw + 0.06, bottom: Rw + 0.09, side: Rw + 0.12, top: R, halfL: L * 0.5 }; }

/** A slim turbine core inside a big ring wing: the ring carries light strips, the air brakes and the binder couplers. */
function hoopEngine(spec: EngineSpec, seg: number): EngineGeo {
  const { L, R } = spec; const pb = new PartBuilder(); const Z = (t: number) => -L / 2 + t * L;
  const hi = seg >= 24, ultra = seg >= 40, segS = Math.max(10, Math.round(seg * 0.5));
  const Rw = RING * R, c = RING_CHORD * L, zc = Z(0.56), zLE = zc + c / 2, zTE = zc - c / 2;
  // slim core: needle body, intake with fan and a long probe spike
  const bodyR = (t: number) => (t < 0.25 ? 0.72 + 0.28 * Math.sin((t / 0.25) * HALF) : t < 0.78 ? 1 : 1 - 0.14 * ((t - 0.78) / 0.22));
  const rf = bodyR(0.93), faceZ = Z(0.915);
  const pts: [number, number, (0 | 1)?][] = [[0.74 * R, Z(0), 1]];
  for (let t = 0.03; t < 0.9; t += 0.05) pts.push([bodyR(t) * R, Z(t)]);
  pts.push([rf * R, Z(0.92)], [rf * 1.035 * R, Z(0.955)], [rf * 1.02 * R, Z(0.985)], [rf * 0.95 * R, Z(1.0), 1]);
  pb.add('hull', lathe(prof(pts), seg, 1));
  pb.add('steel', lathe(prof([[rf * 0.95 * R, Z(1.0)], [rf * 0.885 * R, Z(0.992)], [rf * 0.86 * R, Z(0.97)], [rf * 0.86 * R, faceZ, 1], [rf * 0.6 * R, faceZ]]), seg, 0));
  pb.add('dark', lathe(prof([[rf * 0.6 * R, faceZ], [0.2 * R, faceZ]]), seg, 0));
  pb.add('chrome', lathe(prof([[0.22 * R, faceZ, 1], [0.2 * R, faceZ + 0.03 * L], [0.12 * R, Z(1.0)], [0.02 * R, Z(1.0) + 0.14 * L], [0, Z(1.0) + 0.16 * L]]), segS, 0));
  const nb = hi ? spec.blades : Math.max(8, Math.round(spec.blades * 0.65));
  const fan = radial(() => blade(0.21 * R, 0.83 * rf * R, (Math.PI * 2 * 0.52 * R / nb) * 1.25, 0.03 * R, 1.0, 0.38, 3), nb); fan.computeBoundingSphere();
  for (const tb of [0.14, 0.3, 0.74, 0.86]) pb.add('steel', torus(bodyR(tb) * R + 0.01, 0.028 * R + 0.006, 6, seg), M4.t(0, 0, Z(tb)));

  // ring wing: aerofoil section swept round the core (secondary paint), light strips on the leading edge and round both skins
  pb.add('hull', lathe(prof([[Rw, zTE, 1], [Rw + 0.03, zTE + 0.25 * c], [Rw + 0.05, zTE + 0.6 * c], [Rw + 0.045, zLE - 0.12 * c], [Rw, zLE],
    [Rw - 0.045, zLE - 0.12 * c], [Rw - 0.05, zTE + 0.6 * c], [Rw - 0.03, zTE + 0.25 * c], [Rw, zTE]]), seg, 3));
  pb.add('glow', torus(Rw, 0.02, 5, seg), M4.t(0, 0, zLE + 0.006));
  pb.add('glow', torus(Rw + 0.054, 0.011, 4, seg), M4.t(0, 0, zc + 0.1 * c));
  pb.add('glow', torus(Rw - 0.054, 0.011, 4, seg), M4.t(0, 0, zc + 0.1 * c));
  pb.add('chrome', torus(Rw, 0.014, 4, seg), M4.t(0, 0, zTE - 0.004));
  { // three struts carry the ring (none on top: the control cable leaves there)
    const ri = R * 0.96, ro = Rw - 0.035;
    pb.add('steel', radial(() => rbox(0.055, ro - ri, 0.4 * c, 0.02).translate(0, (ri + ro) / 2, zc - 0.04 * c), 3, Math.PI / 3));
    pb.add('dark', radial(() => rbox(0.14, 0.12, 0.5 * c, 0.03).translate(0, ri + 0.03, zc - 0.04 * c), 3, Math.PI / 3));
    if (hi) pb.add('chrome', radial(() => rbox(0.1, 0.05, 0.34 * c, 0.012).translate(0, ro - 0.03, zc - 0.04 * c), 3, Math.PI / 3));
  }
  // four small trim vanes on the trailing edge
  pb.add('dark', radial(() => rbox(0.03, 0.2, 0.26, 0.008).translate(0, Rw + 0.02, zTE - 0.05), 4, Math.PI / 4));

  // copper line, belly repulsor, cable pylon behind the ring, sensor, binder couplers on the ring
  { const pp: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) { const tt = 0.08 + 0.3 * (k / 6), rr = bodyR(tt) * R * (1 + 0.08 * Math.sin((k / 6) * Math.PI)) + 0.04; pp.push(V(Math.sin(0.7) * rr, Math.cos(0.7) * rr, Z(tt))); }
    pb.add('copper', tube(pp, 0.022, Math.max(10, Math.round(seg * 0.4)), 5)); }
  bellyStrip(pb, 0.3 * R + 0.06, 0.3 * L, -R, Z(0.24));
  const { py, pylon } = cablePylon(pb, R, Z(0.34));
  pb.add('dark', cyl(0.02, 0.02, 0.4, 6), M4.trs(0.1, R + 0.17, Z(0.8), 0.25, 0, 0));
  pb.add('glow', sphere(0.035, 8, 6), M4.t(0.1, R + 0.37, Z(0.8) + 0.05));
  const zB = zc + 0.18 * c;
  couplers(pb, Rw + 0.03, 0, zB, 0.55);
  if (hi) {
    pb.add('chrome', boltRing(rf * 0.985 * R, Math.round(seg * 0.5), 0.02 * R, Z(1.0) - 0.01));
    pb.add('chrome', boltRing(Rw + 0.052, Math.round(seg * 0.9), 0.012, zTE + 0.3 * c, true));
    for (const tb of [0.3, 0.74]) pb.add('chrome', boltRing(bodyR(tb) * R + 0.03, Math.round(seg * 0.45), 0.012, Z(tb), true));
    if (ultra) {
      pb.add('chrome', boltRing(Rw - 0.052, Math.round(seg * 0.9), 0.012, zTE + 0.3 * c, true));
      pb.add('dark', radial(() => cyl(0.006, 0.006, 0.16, 4).rotateX(HALF).translate(0, Rw, zTE - 0.1), 12, 0.2)); // static wicks on the trailing edge
    }
  }

  // air brakes: two plates on the outer flanks of the ring, hinged at their front edge (a dark hinge fairing carries each)
  const zH = zTE + 0.38 * c;
  for (const sd of [-1, 1]) pb.add('dark', rbox(0.07, 0.32 * Rw, 0.08, 0.02), M4.t(sd * (Rw + 0.05), 0, zH + 0.02));
  const flaps = [-1, 1].map(sd => sideFlap(0.04, 0.3 * Rw, 0.36 * c, V(sd * (Rw + 0.068), 0, zH), -sd));
  const nz = roundNozzle(pb, 0.74 * R, Z(0), L, seg, hi);
  return {
    parts: pb.build(), fan, fanZ: faceZ + 0.03 * L, flaps, ...nz,
    pylon, frontZ: Z(1.0), top: py, R, L, binder: V(Rw + 0.07, 0, zB), breakParts: [],
  };
}

// ------------------------------------------------------------------ slab: Dorn Manta
/** Half width of the slab relative to its half thickness `R`. */
const SLAB_W = 3;
function slabExtent({ R, L }: EngineSpec): EngineExtent { const W = SLAB_W * R; return { coll: W + 0.12, bottom: R + 0.14, side: W + 0.56, top: R + 0.05, halfL: L * 0.5 }; }
/** thin plate in the YZ plane (points [z, y]), `t` thick */
const plateYZ = (pts: [number, number][], t: number) => { const g = extrude(pts, t, Math.min(0.012, t * 0.3)); g.rotateY(-HALF); return g; };
/** Lip flaps of a slot nozzle (upper and lower row of `n` panels): they open up / down when the nozzle is wide open. */
function slotPetals(ws: number, hs: number, zH: number, zT: number, swing: number, n: number) {
  const pos: number[] = [], pet: number[] = [], idx: number[] = [];
  for (const sy of [-1, 1]) for (let q = 0; q < n; q++) {
    const x0 = -ws + (q + 0.04) / n * 2 * ws, x1 = -ws + (q + 0.96) / n * 2 * ws, b = pos.length / 3;
    for (const [x, z, y, d] of [[x0, zH, hs, 0], [x1, zH, hs, 0], [x0, zT, hs * 0.82, swing], [x1, zT, hs * 0.82, swing]]) { pos.push(x, sy * y, z); pet.push(0, sy, d); }
    if (sy > 0) idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); else idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  return petalsFrom(pos, pet, idx);
}

/** A flat wide plate: letterbox intake with a small ram turbine, slot nozzle, spine fairing, twin fins with split rudders, drooped winglets. */
function slabEngine(spec: EngineSpec, seg: number): EngineGeo {
  const { L, R } = spec; const pb = new PartBuilder(); const Z = (t: number) => -L / 2 + t * L;
  const hi = seg >= 24, ultra = seg >= 40, W = SLAB_W * R, segL = Math.max(20, seg);
  // cross sections rear → front (half width, half height top / bottom, corner sharpness)
  const rows: [number, number, number, number, number][] = [[0, 0.9, 0.62, 0.62, 6], [0.06, 0.96, 0.86, 0.82, 5], [0.2, 1, 1, 0.9, 4.5], [0.5, 1, 1, 0.9, 4.5], [0.72, 0.94, 0.92, 0.84, 4.2], [0.9, 0.8, 0.74, 0.7, 4], [1, 0.72, 0.6, 0.56, 5]];
  const secs: Section[] = rows.map(([t, w, hT, hB, n]) => ({ z: Z(t), w: w * W, hT: hT * R, hB: hB * R, n }));
  const at = (t: number, grow = 1): Section => { // section at any station (for straps that hug the body)
    let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < t) i++;
    const a = rows[i], b = rows[i + 1], f = (t - a[0]) / (b[0] - a[0]), m = (k: number) => a[k] + (b[k] - a[k]) * f;
    return { z: Z(t), w: m(1) * W * grow + (grow - 1) * 0.4, hT: m(2) * R * grow + (grow - 1) * 0.4, hB: m(3) * R * grow + (grow - 1) * 0.4, n: m(4) };
  };
  pb.add('hull', loft(secs, segL, 1));
  for (const tb of [0.14, 0.42, 0.66].slice(0, Math.max(1, spec.bands))) pb.add('steel', loft([at(tb - 0.006, 1.012), at(tb + 0.006, 1.012)], segL, 0, [false, false]));

  // letterbox intake: dark mouth, steel lip, guide vanes, a small ram turbine in the middle
  const mw = 0.72 * W * 0.88, mh = 0.58 * R * 0.66, zF = Z(1);
  pb.add('dark', rbox(mw * 2, mh * 2, 0.06, 0.02), M4.t(0, 0.01 * R, zF));
  for (const sy of [-1, 1]) pb.add('steel', rbox(mw * 2 + 0.08, 0.05, 0.12, 0.015), M4.t(0, 0.01 * R + sy * (mh + 0.02), zF + 0.01));
  for (const sx of [-1, 1]) pb.add('steel', rbox(0.05, mh * 2 + 0.08, 0.12, 0.015), M4.t(sx * (mw + 0.02), 0.01 * R, zF + 0.01));
  const rFan = Math.min(mh * 0.94, 0.3), nv = hi ? 4 : 2;
  for (const sx of [-1, 1]) for (let i = 0; i < nv; i++) pb.add('steel', rbox(0.022, mh * 1.9, 0.07, 0.006), M4.trs(sx * (rFan + 0.14 + (i / nv) * (mw - rFan - 0.2)), 0.01 * R, zF + 0.035, 0, sx * 0.3, 0));
  pb.add('chrome', lathe(prof([[0.09, zF + 0.05, 1], [0.07, zF + 0.12], [0, zF + 0.3]]), 10, 0), M4.t(0, 0.01 * R, 0));
  pb.add('glow', rbox(mw * 1.7, 0.016, 0.02, 0.004), M4.t(0, 0.01 * R + mh * 0.82, zF + 0.035));
  const nb = Math.max(6, Math.round(spec.blades * (hi ? 1 : 0.7)));
  const fan = radial(() => blade(0.08, rFan, (Math.PI * 2 * 0.6 * rFan / nb) * 1.2, 0.012, 1.0, 0.4, 3), nb); fan.computeBoundingSphere();

  // slot nozzle: dark throat, glowing slot, steel lips, copper injector bar
  const ws = 0.9 * W * 0.9, hs = 0.62 * R * 0.6, z0 = Z(0);
  pb.add('dark', rbox(ws * 2, hs * 2, 0.06, 0.02), M4.t(0, 0, z0));
  pb.add('glow', rbox(ws * 1.9, hs * 1.3, 0.02, 0.006), M4.t(0, 0, z0 - 0.035));
  for (const sy of [-1, 1]) pb.add('steel', rbox(ws * 2 + 0.1, 0.05, 0.16, 0.015), M4.t(0, sy * (hs + 0.03), z0 + 0.02));
  if (hi) { pb.add('copper', cyl(0.03, 0.03, ws * 2, 8).rotateZ(HALF), M4.t(0, hs + 0.1, z0 + 0.3)); for (let i = -3; i <= 3; i++) pb.add('copper', cyl(0.014, 0.02, 0.1, 5), M4.trs(i * ws * 0.28, hs + 0.06, z0 + 0.26, 0.6, 0, 0)); }
  const petals = slotPetals(ws, hs + 0.03, z0 + 0.03, z0 - 0.045 * L, 0.5 * hs + 0.06, Math.max(4, Math.round(seg * 0.22)));
  const fsx = ws * 0.94 / 0.3, fsy = hs * 1.25 / 0.3;
  const flameOuter = flameGeo(0.3, L * 0.62, Math.max(12, Math.round(seg * 0.5))).scale(fsx, fsy, 1), flameCore = flameGeo(0.126, L * 0.32, 12).scale(fsx, fsy, 1);

  // spine fairing (secondary paint) with the cable pylon, cooling grilles left and right of it
  pb.add('hull', loft([{ z: Z(0.1), w: 0.05, hT: 0.02, hB: 0.01 }, { z: Z(0.24), w: 0.3, hT: 0.2, hB: 0.02 }, { z: Z(0.6), w: 0.34, hT: 0.24, hB: 0.02 }, { z: Z(0.84), w: 0.2, hT: 0.1, hB: 0.02 }, { z: Z(0.93), w: 0.04, hT: 0.02, hB: 0.01 }], hi ? 12 : 8, 3), M4.t(0, R * 0.96, 0));
  const { py, pylon } = cablePylon(pb, R * 0.96 + 0.22, Z(0.5));
  for (const sd of [-1, 1]) for (let i = 0; i < (hi ? 8 : 4); i++) pb.add('dark', rbox(0.56 * W - 0.3, 0.03, 0.05, 0.008), M4.t(sd * (0.3 + (0.56 * W - 0.3) / 2 + 0.1), R + 0.004, Z(0.3 + i * (hi ? 0.035 : 0.07))));
  pb.add('dark', cyl(0.022, 0.022, 0.44, 6), M4.trs(-0.5 * W, R * 0.95 + 0.2, Z(0.8), 0.25, 0, 0));
  pb.add('glow', sphere(0.04, 8, 6), M4.t(-0.5 * W, R * 0.95 + 0.42, Z(0.8) + 0.055));

  // twin fins on the stern (secondary paint); their rudders are the air brakes (see flaps)
  const finX = 0.62 * W, finY = R * 0.84;
  for (const sd of [-1, 1]) {
    pb.add('hull', plateYZ([[Z(0.27), 0], [Z(0.04), 0], [Z(0) - 0.12, 0.98], [Z(0.11), 1.06]], 0.07), M4.t(sd * finX, finY, 0), SEC);
    pb.add('dark', rbox(0.11, 0.07, 0.24 * L, 0.02), M4.t(sd * finX, finY + 0.02, Z(0.155)));
    if (hi) pb.add('glow', sphere(0.03, 6, 4), M4.t(sd * finX, finY + 1.04, Z(0.07)));
  }
  // drooped winglets on both edges (secondary paint) with tip lights, side strakes
  for (const sd of [-1, 1]) {
    pb.add('hull', rbox(0.62, 0.045, 0.3 * L, 0.015), M4.trs(sd * (W + 0.24), -0.14 * R - 0.06, Z(0.32), 0, 0, sd * -0.36), SEC);
    pb.add('steel', rbox(0.07, 0.07, 0.3 * L + 0.1, 0.02), M4.t(sd * (W + 0.52), -0.14 * R - 0.165, Z(0.32)));
    pb.add('glow', sphere(0.035, 6, 4), M4.t(sd * (W + 0.52), -0.14 * R - 0.165, Z(0.32) + 0.15 * L + 0.07));
    pb.add('dark', rbox(0.05, 0.5 * R, 0.24 * L, 0.012), M4.t(sd * (W * 0.985), 0.02, Z(0.62)));
  }
  // belly: two repulsor strips; binder couplers on both edges
  for (const sd of [-1, 1]) { pb.add('dark', rbox(0.5, 0.09, 0.46 * L, 0.03), M4.t(sd * 0.5 * W, -R * 0.9 - 0.02, Z(0.42))); pb.add('glow', rbox(0.3, 0.035, 0.4 * L, 0.01), M4.t(sd * 0.5 * W, -R * 0.9 - 0.075, Z(0.42))); }
  couplers(pb, W * 0.985, 0, Z(0.6), 0.62);
  if (hi) {
    for (const sd of [-1, 1]) for (let i = 0; i < 12; i++) pb.add('chrome', cyl(0.012, 0.012, 0.012, 6), M4.t(sd * 0.84 * W, R * 0.985, Z(0.2 + i * 0.045)));   // rivet rows
    // heat pipes from the cooling grilles to the injector bar, panel seams, filler caps, intake fences, vents ahead of the fins
    for (const sd of [-1, 1]) {
      pb.add('copper', tube([V(sd * 0.76 * W, R + 0.03, Z(0.56)), V(sd * 0.78 * W, R * 0.98 + 0.03, Z(0.3)), V(sd * 0.74 * W, R * 0.9 + 0.03, Z(0.1)), V(sd * 0.6 * W, hs + 0.1, z0 + 0.32)], 0.024, 14, 5));
      pb.add('chrome', cyl(0.06, 0.06, 0.02, 12), M4.t(sd * 0.3 * W, R * 0.99, Z(0.78))); pb.add('dark', cyl(0.03, 0.03, 0.024, 8), M4.t(sd * 0.3 * W, R * 0.99, Z(0.78)));
      for (let i = 0; i < 3; i++) pb.add('steel', rbox(0.02, 0.07, 0.5, 0.006), M4.t(sd * (0.22 + i * 0.2) * W, R * 0.86 + 0.03, Z(0.9)));
      for (let i = 0; i < 5; i++) pb.add('dark', rbox(0.2, 0.02, 0.035, 0.005), M4.t(sd * 0.36 * W, R + 0.004, Z(0.2 + i * 0.016)));
    }
    for (const ts of [0.33, 0.6, 0.76]) pb.add('dark', rbox(1.8 * W * (ts > 0.7 ? 0.92 : 1), 0.008, 0.02, 0.002), M4.t(0, R * (ts > 0.7 ? 0.94 : 1) + 0.002, Z(ts)));
    for (const sd of [-1, 1]) pb.add('hull', rbox(0.5 * W, 0.016, 0.16 * L, 0.004), M4.t(sd * 0.5 * W, R * 1.0, Z(0.7)), SEC);                               // access panels
    if (ultra) {
      for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) pb.add('chrome', cyl(0.01, 0.01, 0.012, 5), M4.t(sd * (0.26 + i * 0.07 * W), R * 1.005, Z(0.78)));
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) pb.add('dark', cyl(0.005, 0.005, 0.16, 4).rotateX(HALF), M4.t(sx * (0.2 + i * 0.3) * ws, hs + 0.07, z0 - 0.06)); // static wicks
    }
  }

  const flaps = [-1, 1].map(sd => sideFlap(0.04, 0.6, 0.11 * L, V(sd * (finX + 0.058), finY + 0.42, Z(0.15)), -sd)); // split rudders: each opens outwards
  return {
    parts: pb.build(), fan, fanZ: zF + 0.06, flaps, petals, flameOuter, flameCore, flameZ: z0 - 0.05, exhaustZ: z0 - 0.12 * L,
    pylon, frontZ: zF, top: py, R, L, binder: V(W + 0.05, 0, Z(0.6)), breakParts: [],
  };
}

// ------------------------------------------------------------------ cage: Quill Voltspire
/** Spacing of the three arc electrodes along the engine (the layout's binder `zOff` values are ± this). */
export const CAGE_ARC_STEP = 1.3;
function cageExtent({ R, L }: EngineSpec): EngineExtent { return { coll: R * 1.08, bottom: R * 1.06 + 0.16, side: R + 0.36, top: R * 1.06, halfL: L * 0.5 }; }

/** An open truss cage round a plasma coil: ring frames, longerons and diagonals, a copper armature that turns in the front bay,
 *  two painted shells, three arc electrodes on each flank. */
function cageEngine(spec: EngineSpec, seg: number): EngineGeo {
  const { L, R } = spec; const pb = new PartBuilder(); const Z = (t: number) => -L / 2 + t * L;
  const hi = seg >= 24, ultra = seg >= 40, segC = Math.max(10, Math.round(seg * 0.6));
  // truss: ring frames, six longerons, a diagonal in every panel
  const frames = [0.1, 0.3, 0.5, 0.7, 0.9];
  for (const tf of frames) pb.add('steel', torus(R, 0.045, 6, seg), M4.t(0, 0, Z(tf)));
  pb.add('steel', radial(() => cyl(0.034, 0.034, 0.84 * L, 6).rotateX(HALF).translate(0, R, Z(0.5)), 6, Math.PI / 6));
  for (let b = 0; b < frames.length - 1; b++) for (let q = 0; q < 6; q++) {
    if (!hi && (q + b) % 2) continue; // Gegner below Ultra: every second diagonal
    const flip = (q + b) % 2 === 0, a0 = Math.PI / 6 + (q + (flip ? 0 : 1)) * Math.PI / 3, a1 = Math.PI / 6 + (q + (flip ? 1 : 0)) * Math.PI / 3;
    pb.add('steel', tube([V(Math.sin(a0) * R, Math.cos(a0) * R, Z(frames[b])), V(Math.sin(a1) * R, Math.cos(a1) * R, Z(frames[b + 1]))], 0.017, 1, 4));
  }
  // plasma coil: glowing core rod, copper windings, three capacitor drums on spokes
  pb.add('glow', cyl(0.1 * R, 0.1 * R, 0.74 * L, 10).rotateX(HALF), M4.t(0, 0, Z(0.5)));
  const drums = [0.3, 0.5, 0.7], nW = ultra ? 40 : hi ? 26 : 12;
  for (let i = 0; i < nW; i++) { const tt = 0.15 + 0.7 * (i / (nW - 1)); if (drums.some(td => Math.abs(tt - td) < 0.045)) continue; pb.add('copper', torus(0.33 * R, 0.03 * R, 5, segC), M4.t(0, 0, Z(tt))); }
  for (const td of drums) {
    pb.add('dark', cyl(0.5 * R, 0.5 * R, 0.07 * L, segC).rotateX(HALF), M4.t(0, 0, Z(td)));
    pb.add('glow', torus(0.505 * R, 0.022 * R, 5, segC), M4.t(0, 0, Z(td)));
    pb.add('steel', radial(() => cyl(0.022, 0.022, 0.5 * R, 5).translate(0, 0.75 * R, Z(td)), 6, Math.PI / 6));
  }
  // two painted shells (engine livery) above and below, intake ring (secondary paint) with a glow lip and an emitter spike on three vanes
  { const r0 = R + 0.05, r1 = r0 + 0.045, shell = prof([[r1, Z(0.16), 1], [r1, Z(0.84), 1], [r0, Z(0.84), 1], [r0, Z(0.16), 1], [r1, Z(0.16)]]);
    for (const c of [0, Math.PI]) pb.add('hull', lathe(shell, Math.max(8, Math.round(seg * 0.3)), 1, c - 0.8, 1.6)); }
  pb.add('hull', lathe(prof([[R + 0.02, Z(0.9), 1], [R + 0.07, Z(0.93)], [R + 0.06, Z(0.985)], [R - 0.02, Z(1.0), 1], [R - 0.09, Z(0.985), 1], [R - 0.05, Z(0.9), 1], [R + 0.02, Z(0.9)]]), seg, 3));
  pb.add('glow', torus(R - 0.03, 0.02, 5, seg), M4.t(0, 0, Z(1.0) + 0.005));
  pb.add('chrome', lathe(prof([[0.16 * R, Z(0.86), 1], [0.14 * R, Z(0.93)], [0.05 * R, Z(1.0) + 0.04 * L], [0, Z(1.0) + 0.1 * L]]), segC, 0));
  pb.add('steel', radial(() => rbox(0.03, 0.84 * R, 0.16, 0.008).translate(0, 0.58 * R, Z(0.93)), 3));
  // armature: six copper bars on a ring, turning in the front bay (its own mesh)
  const fpb = new PartBuilder();
  fpb.add('copper', radial(() => rbox(0.05, 0.62 * R, 0.07, 0.012).translate(0, 0.45 * R, 0), 6));
  fpb.add('copper', torus(0.76 * R, 0.03, 5, segC));
  fpb.add('copper', cyl(0.16 * R, 0.16 * R, 0.16, 10).rotateX(HALF));
  const fan = fpb.build().get('copper')!; fan.computeBoundingSphere();

  // arc electrodes on both flanks: insulator stack, copper ring, glowing tip (the energy binder jumps between the tips)
  const zB = -0.3;
  for (const sd of [-1, 1]) for (const k of [-1, 0, 1]) {
    const z = zB + k * CAGE_ARC_STEP, m = (x: number) => M4.trs(sd * (R + x), 0, z, 0, 0, sd * -HALF);
    pb.add('dark', cyl(0.085, 0.1, 0.08, 10), m(0.04)); pb.add('dark', cyl(0.07, 0.085, 0.07, 10), m(0.115)); pb.add('dark', cyl(0.055, 0.07, 0.06, 10), m(0.18));
    pb.add('copper', torus(0.06, 0.016, 5, 10), M4.trs(sd * (R + 0.225), 0, z, 0, HALF, 0));
    pb.add('glow', sphere(0.05, 8, 6), M4.t(sd * (R + 0.27), 0, z));
    if (hi) pb.add('copper', tube([V(sd * 0.5 * R, 0.06, z), V(sd * 0.8 * R, 0.14, z), V(sd * R, 0.02, z)], 0.014, 4, 4)); // bus bar from the coil
  }
  bellyStrip(pb, 0.34 * R, 0.4 * L, -(R + 0.095), Z(0.5));
  const { py, pylon } = cablePylon(pb, R + 0.095, Z(0.56));
  pb.add('dark', lathe(prof([[0.62 * R, Z(0), 1], [0.74 * R, Z(0.05)], [R * 0.98, Z(0.1), 1]]), seg, 0)); // shroud from the last frame down to the nozzle
  if (hi) {
    for (const tf of frames) pb.add('chrome', boltRing(R + 0.05, 6, 0.028, Z(tf), true));
    if (ultra) for (const tf of frames) pb.add('glow', radial(() => sphere(0.016, 5, 4).translate(0, R + 0.075, Z(tf)), 6, Math.PI / 6)); // tell-tales on every joint
  }

  const flaps = [-1, 1].map(sd => sideFlap(0.04, 0.5 * R, 0.86, V(sd * (R + 0.075), 0, 0.82), -sd));
  const nz = roundNozzle(pb, 0.6 * R, Z(0), L, seg, hi);
  return {
    parts: pb.build(), fan, fanZ: Z(0.8), fanMat: 'copper', fanSpin: 0.6, flaps, ...nz,
    pylon, frontZ: Z(1.0) + 0.1 * L, top: py, R, L, binder: V(R + 0.3, 0, zB), breakParts: [],
  };
}

// ------------------------------------------------------------------ registry
export const OWN_ENGINES: Partial<Record<EngineStyle, (spec: EngineSpec, seg: number) => EngineGeo>> = { rotor: rotorEngine, hoop: hoopEngine, slab: slabEngine, cage: cageEngine };
export const OWN_EXTENTS: Partial<Record<EngineStyle, (spec: EngineSpec) => EngineExtent>> = { rotor: rotorExtent, hoop: hoopExtent, slab: slabExtent, cage: cageExtent };
