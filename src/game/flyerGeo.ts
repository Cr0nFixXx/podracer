// ===== Flight decor (2026-11-25): the craft that fly over the worlds, and the holo billboards beside the track =====
// User, 2026-11-23: "bekannte Modelle so genau wie möglich nachbauen" – Tatooine and the red mesas: sail barge, rising spectator boxes
// as in the Mos Espa arena, light freighter (saucer with a side cockpit); Aquilaris: cloud car (two pods) and freighter; holo
// billboards on all worlds. User, 2026-11-25: "der Himmel ist teilweise ziemlich voll mit Zeppelinen – verringere die Anzahl der
// Flug-Deko um 20 %, ersetze aber sonst wie geplant."
//
// Geometry only (no materials, no three/webgpu, no DOM – the node checks build every model): each kind is ONE body geometry with
// vertex colours, in metres, nose towards +z, and one geometry of everything that glows (engines, lamps, the holo picture).
// `flyers.ts` instances and moves them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type FlyerKind = 'barge' | 'freighter' | 'box' | 'cloudCar' | 'transport' | 'holo';
export type FlyerPlan = Record<FlyerKind, number>;

/** airships a world had, before detail and track length (`place(airshipGeometry(), …, 40, …)`) · what flies there now: 20 % fewer */
export const FLYERS_BEFORE = 40, FLYERS_SHARE = 0.8;
/** How many flyers a world gets: `scale` = graphics detail × track-length density, as `place()` scaled the airships. */
export function flyerTotal(scale: number): number { return Math.floor(Math.floor(FLYERS_BEFORE * scale) * FLYERS_SHARE); }
/** Who flies where. `hadAirships`: the world's decor lists 'flyers' (it had the airships) – every other world gets holo boards only. */
export function flyerPlan(themeId: string, hadAirships: boolean, scale: number): FlyerPlan {
  const pl: FlyerPlan = { barge: 0, freighter: 0, box: 0, cloudCar: 0, transport: 0, holo: 0 }, total = flyerTotal(scale);
  pl.holo = Math.max(2, Math.min(10, Math.round(total * 0.18)));
  if (!hadAirships) return pl;
  pl.holo = Math.min(pl.holo, total);
  let rest = total - pl.holo;
  if (themeId === 'aquilaris') { pl.cloudCar = Math.round(rest * 0.55); pl.transport = rest - pl.cloudCar; }
  else { pl.box = Math.min(8, Math.round(total * 0.2), rest); rest -= pl.box; pl.barge = Math.floor(rest * 0.45); pl.freighter = rest - pl.barge; }
  return pl;
}

type V3 = [number, number, number];
type Col = V3 | ((x: number, y: number, z: number) => V3);
const TAU = Math.PI * 2;
const C = (hex: string): V3 => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** A part ready to merge: non-indexed, no uv, vertex colours. `flat`: every face gets its own normal (plates, boxes). */
function part(g: THREE.BufferGeometry, col: Col, flat = false): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose();
  n.deleteAttribute('uv'); if (flat || !n.attributes.normal) n.computeVertexNormals();
  const p = n.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = typeof col === 'function' ? col(p.getX(i), p.getY(i), p.getZ(i)) : col; a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return n;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry { const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); g.computeBoundingSphere(); g.computeBoundingBox(); return g; }
/** Skin over `n` cross-sections (rings of the same number of points, each a closed loop), ends closed with a fan. */
function loft(rings: V3[][], capA = true, capB = true): THREE.BufferGeometry {
  const m = rings[0].length, P: number[] = [], idx: number[] = [];
  for (const r of rings) for (const v of r) P.push(v[0], v[1], v[2]);
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < m; i++) { const a = k * m + i, b = k * m + (i + 1) % m, c = a + m, d = b + m; idx.push(a, b, c, b, d, c); }
  const cap = (k: number, flip: boolean) => { const r = rings[k], c = P.length / 3; let x = 0, y = 0, z = 0; for (const v of r) { x += v[0]; y += v[1]; z += v[2]; } P.push(x / m, y / m, z / m); for (let i = 0; i < m; i++) { const a = k * m + i, b = k * m + (i + 1) % m; if (flip) idx.push(c, b, a); else idx.push(c, a, b); } };
  if (capA) cap(0, true); if (capB) cap(rings.length - 1, false);
  // which way the rings run decides which side is out: a solid with its faces inside out (negative volume) gets them turned
  let vol = 0; for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3; vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Mirror image of a merged, non-indexed model across the plane x = 0 (faces stay outside). */
function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of ['position', 'normal']) { const a = g.attributes[name]; for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i)); }
  for (const name of Object.keys(g.attributes)) { const a = g.attributes[name], n = a.itemSize; for (let t = 0; t < a.count; t += 3) for (let k = 0; k < n; k++) { const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k, w = a.array[i1]; (a.array as Float32Array)[i1] = a.array[i2]; (a.array as Float32Array)[i2] = w; } }
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
/** Solid of revolution about the y axis: profile points (radius, y) from the top centre to the bottom centre. */
function revolve(profile: [number, number][], seg: number, sx = 1, sz = 1): THREE.BufferGeometry {
  const rings: V3[][] = profile.map(([r, y]) => Array.from({ length: seg }, (_, i) => { const a = -i / seg * TAU; return [Math.cos(a) * r * sx, y, Math.sin(a) * r * sz] as V3; }));
  return loft(rings, true, true);
}
/** Round tube along a polyline. */
function tube(pts: V3[], r: number | number[], sides = 6): THREE.BufferGeometry {
  const rings: V3[][] = []; let u = new THREE.Vector3(0, 1, 0);
  for (let j = 0; j < pts.length; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)], t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    if (Math.abs(u.dot(t)) > 0.95) u = new THREE.Vector3(1, 0, 0);
    u = u.clone().addScaledVector(t, -u.dot(t)).normalize(); const v = new THREE.Vector3().crossVectors(t, u), rr = typeof r === 'number' ? r : r[j];
    rings.push(Array.from({ length: sides }, (_, i) => { const an = i / sides * TAU, c = Math.cos(an) * rr, s = Math.sin(an) * rr; return [pts[j][0] + v.x * c + u.x * s, pts[j][1] + v.y * c + u.y * s, pts[j][2] + v.z * c + u.z * s] as V3; }));
  }
  return loft(rings, true, true);
}
const boxG = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A sheet over a grid of points (rows × cols), both faces (the flyer material is single-sided). */
function sheet(rows: number, cols: number, at: (u: number, v: number) => V3): THREE.BufferGeometry {
  const P: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) P.push(...at(i / cols, j / rows));
  const n = (rows + 1) * (cols + 1); for (let k = 0; k < n * 3; k++) P.push(P[k]); // the back face: the same points again
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d, n + a, n + b, n + c, n + b, n + d, n + c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ sail barge
/** Luxury sail barge of the Hutts (Khetanna): a 30 m slab-sided hull with an upswept pointed bow and a blunt stern, a row of
 *  shuttered windows along each flank, an open upper deck with a rail and a cabin aft, two steering vanes at the stern – and two
 *  large rust-orange sails stretched like awnings over the deck, each on a mast with a yard, wider than the hull. */
function bargeGeometry() {
  const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  const HULL = C('#7d5c3a'), KEEL = C('#4b3726'), BAND = C('#2c2219'), DECK = C('#93744b'), TRIM = C('#5b422b'), DARK = C('#33291f'), SAIL = C('#c8562a'), SAIL2 = C('#a8431f'), MAST = C('#3b2f25');
  // stations: z, half beam, keel height, deck height
  const st: [number, number, number, number][] = [[16, 0.22, 2.0, 2.75], [14.2, 1.15, 1.05, 2.6], [11.5, 2.3, 0.1, 2.45], [7, 3.3, -0.7, 2.35], [1, 3.72, -1.0, 2.3], [-5, 3.75, -1.0, 2.3], [-10.5, 3.45, -0.85, 2.4], [-14, 2.9, -0.35, 2.6]];
  const beamAt = (z: number) => { for (let k = 0; k < st.length - 1; k++) if (z <= st[k][0] && z >= st[k + 1][0]) { const t = (st[k][0] - z) / (st[k][0] - st[k + 1][0]); return st[k][1] + (st[k + 1][1] - st[k][1]) * t; } return 2.9; };
  const deckAt = (z: number) => { for (let k = 0; k < st.length - 1; k++) if (z <= st[k][0] && z >= st[k + 1][0]) { const t = (st[k][0] - z) / (st[k][0] - st[k + 1][0]); return st[k][3] + (st[k + 1][3] - st[k][3]) * t; } return 2.6; };
  body.push(part(loft(st.map(([z, w, y0, y1]) => { const h = y1 - y0; return [[-0.6 * w, y0, z], [0.6 * w, y0, z], [w, y0 + 0.34 * h, z], [1.05 * w, y1 - 0.18 * h, z], [w, y1, z], [-w, y1, z], [-1.05 * w, y1 - 0.18 * h, z], [-w, y0 + 0.34 * h, z]] as V3[]; })),
    (_x, y, z) => y > deckAt(z) - 0.03 ? DECK : y < 0.05 ? KEEL : y > 0.75 && y < 1.5 && z < 11 && z > -13 ? (Math.abs(((z + 13) % 1.5) - 0.75) < 0.5 ? BAND : HULL) : HULL, true)); // the dark squares are the shuttered windows
  // rubbing strake under the windows, bow ornament
  for (const sd of [-1, 1]) body.push(part(tube([[sd * 2.45, 0.6, 11.3], [sd * 3.5, 0.5, 6], [sd * 3.95, 0.45, 0], [sd * 3.95, 0.45, -6], [sd * 3.6, 0.5, -11], [sd * 3.0, 0.6, -14]], 0.11, 5), TRIM));
  body.push(part(tube([[0, 2.75, 16], [0, 3.5, 17], [0, 4.5, 17.4]], [0.16, 0.12, 0.05], 5), TRIM));
  // rail: posts and a hand rail round the open deck
  const railPts: V3[][] = [[], []];
  for (let z = 11; z >= -5; z -= 2) for (const [k, sd] of [[0, -1], [1, 1]] as const) { const x = sd * (beamAt(z) - 0.14), y = deckAt(z); body.push(part(boxG(0.1, 0.95, 0.1, x, y + 0.47, z), TRIM, true)); railPts[k].push([x, y + 0.95, z]); }
  for (const pts of railPts) body.push(part(tube(pts, 0.05, 4), TRIM));
  // aft cabin with an overhanging roof and a canopy frame, the helm in front of it
  body.push(part(boxG(5.3, 1.75, 5.2, 0, 3.25, -9.6), (x, y, z) => y < 3.9 && y > 3.0 && (Math.abs(x) > 2.6 || z > -7.1) ? (hash(Math.round(x * 1.3), Math.round(z * 1.3)) > 0.45 ? BAND : HULL) : HULL, true));
  body.push(part(boxG(6.1, 0.18, 6, 0, 4.22, -9.6), TRIM, true), part(boxG(1.2, 0.9, 0.5, 0, 2.8, -6.2), DARK, true));
  // steering vanes on the stern quarters, canted out; engine pods under the stern
  for (const sd of [-1, 1]) {
    body.push(part(boxG(0.16, 2.9, 3.4).rotateZ(-sd * 0.2).translate(sd * 4.0, 1.25, -12.3), TRIM, true));
    body.push(part(tube([[sd * 2.3, -0.25, -11.5], [sd * 2.3, -0.25, -15.2]], [0.75, 0.62], 10), DARK));
    glow.push(part(new THREE.CircleGeometry(0.5, 10).rotateY(Math.PI).translate(sd * 2.3, -0.25, -15.22), [1, 1, 1]));
  }
  // repulsor strips under the keel
  for (const z of [8, 0, -8]) glow.push(part(boxG(3.2, 0.06, 1.2, 0, st[4][2] - 0.04, z), [1, 1, 1]));
  // the two sails: a mast, a yard across, and the canvas from the yard down and aft to a boom – it sags and is wider than the hull
  const sail = (z0: number, half: number, top: number, len: number, low: number) => {
    body.push(part(tube([[0, deckAt(z0), z0], [0, top + 0.5, z0 + 0.3]], [0.2, 0.12], 6), MAST));
    body.push(part(tube([[-half, top - 0.25, z0 + 0.5], [0, top, z0 + 0.3], [half, top - 0.25, z0 + 0.5]], 0.1, 5), MAST));                       // yard
    body.push(part(tube([[-half * 0.92, low, z0 - len], [half * 0.92, low, z0 - len]], 0.08, 5), MAST));                                         // boom
    for (const sd of [-1, 1]) body.push(part(tube([[sd * half * 0.92, low, z0 - len], [sd * (beamAt(z0 - len) - 0.1), deckAt(z0 - len) + 0.9, z0 - len + 0.4]], 0.035, 4), MAST)); // sheets down to the rail
    body.push(part(sheet(5, 8, (u, v) => { const x = (u - 0.5) * 2, w = half * (1 - 0.08 * v); return [x * w, top - 0.25 * x * x - (top - low) * v - 0.55 * Math.sin(Math.PI * v) * (1 - 0.5 * x * x) + 0.12 * Math.cos(u * 8 * Math.PI) * Math.sin(Math.PI * v), z0 + 0.5 - (len + 0.5) * v - 0.5 * Math.sin(Math.PI * v)]; }),
      x => Math.abs((Math.abs(x) % 1.6) - 0.8) > 0.68 ? SAIL2 : SAIL));
  };
  sail(7.2, 6.4, 10.6, 8.2, 6.3); sail(-2.6, 5.6, 9.4, 7.0, 5.9);
  return { body: merge(body), glow: merge(glow) };
}

// ------------------------------------------------------------------ light freighter
/** Light freighter of the well-known Corellian pattern: a lens-shaped saucer, two blunt mandibles forward with the loading gap
 *  between them, the cockpit tube off to starboard, docking rings on both flanks, the sensor dish forward to port, a gun turret on
 *  top and below, six round heat vents aft – and the blue glow of the engine along the stern.
 *  (Built with the cockpit at +x and mirrored at the end: with the nose towards +z and y up, starboard is −x.) */
function freighterGeometry() {
  const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  const HULL = C('#b9bcbf'), PANEL = C('#9fa3a8'), DARK = C('#4a4d52'), RED = C('#8f4a3c'), GLASS = C('#18212c'), RIM = C('#7f8388');
  const R = 12.5;
  // panels: rings and sectors of slightly different grey, a few red-brown ones
  const skin = (x: number, y: number, z: number): V3 => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), sec = Math.floor((a + Math.PI) / TAU * 16), ring = r < 3.2 ? 0 : r < 7 ? 1 : r < 10.4 ? 2 : 3;
    if (Math.abs(r - 3.2) < 0.14 || Math.abs(r - 7) < 0.14 || Math.abs(r - 10.4) < 0.14) return DARK; // the seams between the rings
    if (r > R - 0.35) return RIM;
    const h = hash(sec + ring * 17, y > 0 ? 1 : 2);
    return ring > 0 && h > 0.86 ? RED : h > 0.5 ? PANEL : HULL;
  };
  body.push(part(revolve([[0, 2.75], [3.2, 2.7], [7, 2.2], [10.4, 1.45], [12.2, 0.75], [R, 0.32], [R, -0.32], [12.2, -0.75], [10.4, -1.4], [7, -2.05], [3.2, -2.5], [0, -2.55]], 40), skin));
  // mandibles: 3 m apart, 9 m beyond the rim, blunt and notched tips
  for (const sd of [-1, 1]) {
    body.push(part(loft([[9, 4.7, 6.2, 0.95], [14.5, 4.4, 5.6, 0.9], [20.3, 3.9, 4.6, 0.72], [21.6, 3.3, 3.9, 0.55]].map(([z, wi, , h]) => { const xi = sd * 1.5, xo = sd * (1.5 + wi); return [[xi, -h, z], [xo, -h * 0.8, z], [xo, h * 0.8, z], [xi, h, z]].map(v => v as V3); })),
      (x, _y, z) => Math.abs(x) < 1.62 ? DARK : z > 20.2 ? RIM : hash(Math.round(z * 0.7), sd) > 0.7 ? PANEL : HULL, true));
    body.push(part(boxG(1.0, 0.5, 1.4, sd * 3.6, 0, 22.0), DARK, true));
    // docking rings on the flanks
    body.push(part(tube([[sd * (R - 0.6), 0, 0], [sd * (R + 1.7), 0, 0]], [1.95, 1.75], 14), RIM), part(tube([[sd * (R + 1.7), 0, 0], [sd * (R + 1.95), 0, 0]], [1.3, 1.3], 12), DARK));
  }
  body.push(part(boxG(3.0, 1.1, 2.4, 0, 0, 10.4), DARK, true)); // the back wall of the loading gap
  // cockpit: a tube from the saucer out to starboard and forward, the cone of the cockpit pointing straight ahead, its glazed nose
  body.push(part(tube([[7.6, 0.55, 5.2], [10.6, 0.75, 7.6], [12.9, 0.85, 9.6]], [1.5, 1.45, 1.45], 10), PANEL));
  body.push(part(tube([[12.9, 0.85, 9.2], [13.0, 0.85, 12.2], [13.0, 0.85, 13.6]], [1.5, 1.45, 1.0], 12), HULL));
  body.push(part(tube([[13.0, 0.85, 13.55], [13.0, 0.85, 14.5], [13.0, 0.85, 14.75]], [1.0, 0.62, 0.2], 12), GLASS));
  // sensor dish forward to port, on a short mount
  body.push(part(tube([[-6.3, 2.0, 6.6], [-6.3, 3.3, 6.9]], 0.3, 6), DARK));
  body.push(part(revolve([[0, 0.55], [1.3, 0.38], [2.25, 0], [2.3, 0.08], [1.3, 0.5], [0, 0.68]], 16).rotateX(1.05).translate(-6.3, 3.7, 7.2), PANEL));
  // gun turrets top and bottom: a low drum, four short barrels
  for (const up of [1, -1]) {
    body.push(part(tube([[0, up * 2.5, 0], [0, up * 3.35, 0]], [1.35, 1.15], 12), RIM));
    for (const dx of [-0.32, 0.32]) body.push(part(tube([[dx, up * 3.1, 0.6], [dx, up * 3.1, 2.7]], 0.09, 5), DARK));
  }
  // six heat vents on the aft deck
  for (let i = 0; i < 6; i++) { const a = Math.PI * 1.5 + (i - 2.5) * 0.34, r = 8.4, x = Math.cos(a) * r, z = Math.sin(a) * r; body.push(part(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 12).translate(x, 1.93, z), DARK)); }
  // engine: a glowing band round the stern third of the rim, between two lips
  const arc = (r: number, y0: number, y1: number, col: V3) => { const pts: V3[][] = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * 1.5 + (i / 24 - 0.5) * 1.9, c = Math.cos(a), s = Math.sin(a); pts.push([[c * (r - 0.5), y0, s * (r - 0.5)], [c * r, y0, s * r], [c * r, y1, s * r], [c * (r - 0.5), y1, s * (r - 0.5)]]); } return part(loft(pts), col); };
  glow.push(arc(R + 0.12, -0.3, 0.3, [1, 1, 1]));
  body.push(arc(R + 0.2, 0.3, 0.52, DARK), arc(R + 0.2, -0.52, -0.3, DARK));
  // landing lights under the mandibles, the cockpit's glow
  for (const sd of [-1, 1]) glow.push(part(boxG(0.5, 0.06, 0.5, sd * 3.4, -0.75, 19), [1, 1, 1]));
  return { body: mirrorX(merge(body)), glow: mirrorX(merge(glow)) };
}

// ------------------------------------------------------------------ cloud car
/** Twin-pod cloud car: two rounded pods side by side – pilot and gunner, each under its own canopy – joined by the repulsor
 *  engine between them, with its intake forward and its nozzle aft. */
function cloudCarGeometry() {
  const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  const POD = C('#d2552c'), POD2 = C('#b8451f'), GREY = C('#8d9197'), DARK = C('#3d4046'), GLASS = C('#182330'), WHITE = C('#e6ded0');
  const prof: [number, number][] = [[3.45, 0.02], [3.1, 0.34], [2.3, 0.7], [1.0, 0.94], [-0.6, 1.0], [-1.9, 0.86], [-2.9, 0.52], [-3.35, 0.2]];
  for (const sd of [-1, 1]) {
    const cx = sd * 2.15;
    body.push(part(loft(prof.map(([z, r]) => Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU; return [cx + Math.cos(a) * r, Math.sin(a) * r * 0.82, z] as V3; }))),
      (_x, y, z) => Math.abs(z - 1.9) < 0.14 || Math.abs(z + 1.5) < 0.14 ? WHITE : y < -0.45 ? POD2 : POD));
    // canopy: a dark bubble set into the top of the pod, a little forward
    body.push(part(new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, Math.PI * 0.55).scale(0.6, 0.52, 1.2).translate(cx, 0.52, 0.75), GLASS));
    body.push(part(tube([[cx - sd * 0.1, -0.2, -3.3], [cx - sd * 0.1, -0.2, -3.75]], [0.3, 0.24], 8), DARK));           // manoeuvring thruster
    glow.push(part(new THREE.CircleGeometry(0.2, 8).rotateY(Math.PI).translate(cx - sd * 0.1, -0.2, -3.77), [1, 1, 1]));
    body.push(part(boxG(0.06, 0.5, 0.9, cx, 0.95, -2.3), POD2, true));                                                   // tail fin
  }
  // the engine between the pods: two struts, the housing, intake and nozzle
  for (const z of [0.9, -1.1]) body.push(part(tube([[-1.3, -0.05, z], [1.3, -0.05, z]], 0.24, 8), GREY));
  body.push(part(tube([[0, -0.05, 1.9], [0, -0.05, 1.3], [0, -0.05, -1.9], [0, -0.05, -2.5]], [0.62, 0.8, 0.8, 0.6], 14), GREY));
  body.push(part(new THREE.CircleGeometry(0.5, 12).translate(0, -0.05, 1.92), DARK));
  body.push(part(tube([[0, -0.05, -2.5], [0, -0.05, -2.9]], [0.56, 0.5], 12), DARK));
  glow.push(part(new THREE.CircleGeometry(0.44, 12).rotateY(Math.PI).translate(0, -0.05, -2.92), [1, 1, 1]));
  return { body: merge(body), glow: merge(glow) };
}

// ------------------------------------------------------------------ medium transport
/** Medium transport: a long smooth shell, pointed at the bow, open below – the cargo pods hang in rows under it – with the small
 *  bridge pod on top aft and a cluster of engines at the stern. */
function transportGeometry() {
  const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  const SHELL = C('#d1d4d6'), SHELL2 = C('#b4b8bb'), LIP = C('#7d8186'), DARK = C('#35383d');
  const CARGO = [C('#8d9197'), C('#8a4b32'), C('#56677a'), C('#a39a7c'), C('#6f7379')];
  const st: [number, number, number][] = [[45, 1.4, 1.8], [40, 4.6, 4.4], [30, 9, 7.4], [14, 12.6, 9.8], [-8, 14, 10.5], [-28, 12.2, 8.8], [-40, 8.6, 6.0], [-45, 6.4, 4.2]]; // z, half width, height
  const wAt = (z: number) => { for (let k = 0; k < st.length - 1; k++) if (z <= st[k][0] && z >= st[k + 1][0]) { const t = (st[k][0] - z) / (st[k][0] - st[k + 1][0]); return st[k][1] + (st[k + 1][1] - st[k][1]) * t; } return 6; };
  body.push(part(loft(st.map(([z, w, h]) => { const r: V3[] = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; r.push([-Math.cos(a) * w, Math.sin(a) * h, z]); } r.push([w * 0.9, -1.6, z], [-w * 0.9, -1.6, z]); return r; })),
    (x, y, z) => y < -0.2 ? LIP : Math.abs(((z + 45) % 11) - 5.5) > 5.2 || (y > 2 && Math.abs(Math.abs(x) - wAt(z) * 0.55) < 0.25) ? SHELL2 : SHELL));
  body.push(part(boxG(22, 0.5, 74, 0, -1.7, -2), DARK, true)); // the cargo deck that closes the shell from below
  // cargo pods: rows of containers under the deck, a few missing
  for (let iz = 0; iz < 9; iz++) for (let ix = 0; ix < 4; ix++) {
    const z = 30 - iz * 8, x = (ix - 1.5) * 5.6, w = wAt(z);
    if (Math.abs(x) + 2.6 > w * 0.92 || hash(ix, iz) < 0.14) continue;
    const h = 3.2 + hash(iz, ix + 7) * 1.6;
    body.push(part(boxG(5, h, 7.2, x, -2 - h / 2, z), CARGO[Math.floor(hash(ix * 3.1, iz * 1.7) * CARGO.length)], true));
  }
  // bridge pod on top aft, with a dark window band
  body.push(part(new THREE.SphereGeometry(1, 12, 8).scale(3, 2, 5.2).translate(0, 10.4, -22), (_x, y, z) => y > 10.5 && y < 11.3 && z > -20 ? DARK : SHELL2));
  // engines: one large and four small nozzles at the stern
  for (const [x, y, r] of [[0, 2.2, 2.6], [-3.9, 0.4, 1.5], [3.9, 0.4, 1.5], [-2.8, 3.9, 1.3], [2.8, 3.9, 1.3]] as const) {
    body.push(part(tube([[x, y, -43], [x, y, -47.2]], [r * 1.12, r], 12), LIP));
    glow.push(part(new THREE.CircleGeometry(r * 0.86, 12).rotateY(Math.PI).translate(x, y, -47.25), [1, 1, 1]));
  }
  for (const sd of [-1, 1]) for (const z of [26, 2, -22]) glow.push(part(boxG(0.4, 0.4, 0.4, sd * wAt(z) * 0.93, -1.3, z), [1, 1, 1])); // position lamps along the lip
  return { body: merge(body), glow: merge(glow) };
}

// ------------------------------------------------------------------ spectator box
/** Viewing platform of the Mos Espa arena: an oval repulsor platform with a low parapet that lifts a handful of spectators out of
 *  the stands and above the track. No glow geometry: it is small and near the road. */
function boxGeometry() {
  const body: THREE.BufferGeometry[] = [];
  const STONE = C('#b79b6b'), UNDER = C('#6b583b'), RAIL = C('#4a3a28'), METAL = C('#7a7f86');
  const CLOTH = [C('#8d6b4f'), C('#5f6f7a'), C('#a8a092'), C('#7a4f3e'), C('#c2b59b'), C('#6a5a7a')], SKIN = [C('#b98c68'), C('#7fb6a8'), C('#8a7361'), C('#c9a15a')];
  const AX = 3.7, AZ = 2.7;
  body.push(part(revolve([[0, 0.26], [0.93, 0.26], [1.0, 0.12], [0.94, -0.12], [0.62, -0.42], [0, -0.52]], 22, AX, AZ), (_x, y) => y > 0.2 ? STONE : UNDER));
  // parapet: a low wall with a rail on posts
  const ring: V3[] = []; for (let i = 0; i <= 22; i++) { const a = i / 22 * TAU; ring.push([Math.cos(a) * AX * 0.93, 1.12, Math.sin(a) * AZ * 0.93]); }
  body.push(part(tube(ring, 0.06, 5), RAIL));
  for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, x = Math.cos(a) * AX * 0.93, z = Math.sin(a) * AZ * 0.93; body.push(part(boxG(0.09, 0.9, 0.09, x, 0.7, z), RAIL, true)); if (i % 2 === 0) body.push(part(boxG(0.5, 0.42, 0.06).rotateY(-a + Math.PI / 2).translate(x, 0.5, z), STONE, true)); }
  // the repulsor under the platform, the pilot's console at the front
  body.push(part(tube([[0, -0.5, 0], [0, -0.95, 0]], [1.1, 0.75], 12), METAL), part(boxG(0.7, 0.9, 0.35, 0, 0.7, AZ * 0.62), METAL, true));
  // spectators: robe, head, two of them with an arm up
  const who: [number, number, number][] = [[-2.1, -0.4, 0], [-0.9, 0.9, 1], [0.5, -0.8, 0], [1.6, 0.6, 1], [2.5, -0.5, 0], [-0.2, 0.1, 0]];
  who.forEach(([x, z, arm], i) => {
    const hgt = 1.45 + hash(i, 3) * 0.4, cl = CLOTH[i % CLOTH.length], sk = SKIN[i % SKIN.length];
    body.push(part(tube([[x, 0.26, z], [x, 0.26 + hgt * 0.55, z], [x, 0.26 + hgt * 0.82, z]], [0.3, 0.24, 0.16], 7), cl));
    body.push(part(new THREE.SphereGeometry(0.17, 7, 5).translate(x, 0.26 + hgt * 0.94, z), sk));
    if (arm) body.push(part(tube([[x + 0.18, 0.26 + hgt * 0.74, z], [x + 0.42, 0.26 + hgt * 1.02, z + 0.1]], 0.055, 4), cl));
  });
  return { body: merge(body), glow: null };
}

// ------------------------------------------------------------------ holo billboard
/** Picture of a holo billboard, metres. */
export const HOLO_W = 10, HOLO_H = 5.6;
/** Holo billboard: a small projector that hovers beside the track – a bar with two emitter prongs on a repulsor puck – and the
 *  picture it throws above itself. The picture is the glow geometry: two quads back to back (it reads the right way round from
 *  both sides) with texture coordinates 0 … 1; `flyers.ts` maps them onto one advertisement of the atlas. */
function holoGeometry() {
  const body: THREE.BufferGeometry[] = [];
  const METAL = C('#4d525a'), DARK = C('#25282d'), LAMP = C('#9fd8ff');
  body.push(part(boxG(HOLO_W * 0.86, 0.34, 0.6, 0, 0, 0), METAL, true), part(tube([[0, -0.17, 0], [0, -0.75, 0]], [0.7, 0.45], 10), DARK));
  for (const sd of [-1, 1]) { body.push(part(boxG(0.22, 1.15, 0.22, sd * HOLO_W * 0.43, 0.7, 0), METAL, true), part(boxG(0.34, 0.12, 0.34, sd * HOLO_W * 0.43, 1.3, 0), LAMP, true)); }
  body.push(part(boxG(HOLO_W * 0.7, 0.06, 0.2, 0, 0.2, 0), LAMP, true));
  const y0 = 1.5, P: number[] = [], UV: number[] = [], idx: number[] = [];
  for (const back of [0, 1]) { // front faces +z, the back −z with the picture mirrored back
    const o = P.length / 3, s = back ? -1 : 1;
    P.push(-s * HOLO_W / 2, y0, 0, s * HOLO_W / 2, y0, 0, s * HOLO_W / 2, y0 + HOLO_H, 0, -s * HOLO_W / 2, y0 + HOLO_H, 0); UV.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const pic = new THREE.BufferGeometry(); pic.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); pic.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); pic.setIndex(idx); pic.computeVertexNormals(); pic.computeBoundingBox(); pic.computeBoundingSphere();
  return { body: merge(body), glow: pic };
}

/** The model of a flyer: `body` with vertex colours, `glow` = what shines (null: nothing). Built fresh on every call – the caller owns and disposes it. */
export function flyerGeometry(kind: FlyerKind): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } {
  switch (kind) {
    case 'barge': return bargeGeometry();
    case 'freighter': return freighterGeometry();
    case 'cloudCar': return cloudCarGeometry();
    case 'transport': return transportGeometry();
    case 'box': return boxGeometry();
    case 'holo': return holoGeometry();
  }
}
