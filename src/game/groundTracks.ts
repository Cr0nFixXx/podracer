// ===== Subtle tracks the pods leave in loose ground (2026-11-23, user: "dezente Fahrspuren auch im Sand / Mondstaub") =====
// Look only – nothing here changes how a pod flies. Decision of the user: two flat stripes per pod, under its engine banks; in sand
// the wind erases them after about 40 s, in moon dust they stay for the whole race; on sand, dunes, beach, ash and moon dust.
//
// `TrackLayer` is pure data (node checks use it): a ring of quads. Every pod that flies over such ground lays one quad per stripe
// every TRACK_SEG metres. A cell of the road that already has a fresh stripe gets no second one – otherwise the racing line would
// turn darker with every pod, and "subtle" would be gone after one lap. `buildGroundTracks` only shows the ring: one mesh, a dark
// transparent band with a slightly darker line along each edge, fading out over the second half of its life.
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { roadSurfaceAt, type TrackData } from './trackBuilder';
import { SURFACES } from './surfaces';
import { podEnvelope } from './podDesigns';
import { HOVER, type PodState } from './physics';
import { macroTexture } from './textures';

// TSL typings are stricter than the runtime → loosely typed on purpose (see CLAUDE.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, attribute, float, oneMinus, positionLocal, smoothstep, step, texture, uniform, varying, vec3 } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** metres between two cross-sections of a stripe (dunes: TRACK_SEG_DUNE – their crests are curved) · width of a cell of the "already
 *  has a stripe" grid across the road, metres · height of the stripes above the physical road surface (the ground layer of the world
 *  lies up to 0.10 m above it) */
export const TRACK_SEG = 4, TRACK_SEG_DUNE = 3, TRACK_BUCKET = 1.2, TRACK_LIFT = 0.14;
/** how long the wind needs to erase a track in sand (seconds) */
export const TRACK_SAND_LIFE = 40;
const LIFE: Record<string, number> = { sand: TRACK_SAND_LIFE, dunes: TRACK_SAND_LIFE, beach: TRACK_SAND_LIFE, ash: TRACK_SAND_LIFE, regolith: Infinity };
/** how dark the stripe is, relative to sand: the dark grounds need more or a track does not show at all */
const STRENGTH: Record<string, number> = { ash: 1.8, regolith: 2.2 };
/** Seconds a track stays on a surface (index into SURFACES): 0 = this ground keeps no tracks, Infinity = for the whole race. */
export function trackLife(surf: number | undefined): number { return surf === undefined ? 0 : LIFE[SURFACES[surf]?.id ?? ''] ?? 0; }

/** last cross-section of one stripe of one pod: its centre and its two edge points on the ground */
interface Lane { on: boolean; x: number; z: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number }
const lane = (): Lane => ({ on: false, x: 0, z: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 });
const FOREVER = 1e9;

export class TrackLayer {
  /** quads the ring holds · next quad to write · quads written so far (at most `cap`) */
  readonly cap: number; head = 0; count = 0;
  /** 4 corners per quad: position (x, y, z) and info (u across the stripe 0 | 1, time it was laid, seconds it lives, strength) */
  readonly pos: Float32Array; readonly info: Float32Array;
  /** quads written since the mesh last uploaded (it resets them) */
  dirtyStart = 0; dirty = 0;
  private lanes = new WeakMap<PodState, [Lane, Lane]>();
  /** cell of the road (path, 4 m along, TRACK_BUCKET across) → when a stripe was last laid there */
  private laid = new Map<number, number>();
  constructor(cap = 40000) { this.cap = cap; this.pos = new Float32Array(cap * 12); this.info = new Float32Array(cap * 16); }

  /** May a stripe be laid at this cell now? Not while a stripe lies there or in a neighbouring cell across the road that is younger
   *  than three quarters of its life (in moon dust: ever). Marks the cell when the answer is yes. */
  private claim(path: number, idx: number, lat: number, time: number, life: number): boolean {
    const b = Math.round(lat / TRACK_BUCKET), base = (path * 8192 + (idx >> 1)) * 512 + 256;
    for (let d = -1; d <= 1; d++) { const t = this.laid.get(base + b + d); if (t !== undefined && time - t < life * 0.75) return false; }
    this.laid.set(base + b, time); return true;
  }
  private quad(L: Lane, ax: number, ay: number, az: number, bx: number, by: number, bz: number, time: number, life: number, strength: number) {
    const o = this.head * 12, i = this.head * 16, P = this.pos, I = this.info, lf = life === Infinity ? FOREVER : life;
    P[o] = L.ax; P[o + 1] = L.ay; P[o + 2] = L.az; P[o + 3] = L.bx; P[o + 4] = L.by; P[o + 5] = L.bz;
    P[o + 6] = ax; P[o + 7] = ay; P[o + 8] = az; P[o + 9] = bx; P[o + 10] = by; P[o + 11] = bz;
    for (let k = 0; k < 4; k++) { I[i + k * 4] = k & 1; I[i + k * 4 + 1] = time; I[i + k * 4 + 2] = lf; I[i + k * 4 + 3] = strength; }
    if (this.dirty === 0) this.dirtyStart = this.head; if (this.dirty < this.cap) this.dirty++;
    this.head = (this.head + 1) % this.cap; if (this.count < this.cap) this.count++;
  }
  /** Once per frame, after the physics: lays the stripes of every pod that flies close over loose ground. Returns the quads laid. */
  step(pods: PodState[], td: TrackData, time: number): number {
    let n = 0;
    for (const p of pods) {
      let st = this.lanes.get(p); if (!st) { st = [lane(), lane()]; this.lanes.set(p, st); }
      const path = td.paths[p.path], q = path?.samples[p.idx], life = q ? trackLife(q.surf) : 0, v = Math.hypot(p.vel.x, p.vel.z);
      if (!(life > 0) || !p.grounded || p.zeroG || p.dead > 0 || q!.gap || v < 4 || p.pos.y - p.groundY > HOVER + 1.6) { st[0].on = st[1].on = false; continue; }
      const sid = SURFACES[q!.surf]?.id ?? '', env = podEnvelope(p.def), dx = p.vel.x / v, dz = p.vel.z / v, seg = sid === 'dunes' ? TRACK_SEG_DUNE : TRACK_SEG, strength = STRENGTH[sid] ?? 1;
      for (let side = 0; side < 2; side++) {
        const e = side ? env.engR : env.engL, L = st[side], zc = (e.frontZ + e.backZ) / 2, hw = Math.max(0.55, Math.abs(e.outerX) - Math.abs(e.x)) * 0.9;
        // (pod layouts: local +x points to (cos yaw, −sin yaw) – here along the way the pod travels, not where its nose points)
        const cx = p.pos.x + e.x * dz + zc * dx, cz = p.pos.z - e.x * dx + zc * dz, d2 = (cx - L.x) ** 2 + (cz - L.z) ** 2;
        if (L.on && d2 < seg * seg) continue;
        const ax = cx - hw * dz, az = cz + hw * dx, bx = cx + hw * dz, bz = cz - hw * dx;
        const ga = roadSurfaceAt(path, p.idx, ax, az), gb = roadSurfaceAt(path, p.idx, bx, bz), ay = ga.y + TRACK_LIFT, by = gb.y + TRACK_LIFT;
        const lat = (cx - q!.x) * q!.rx + (cz - q!.z) * q!.rz;
        // a jump in position (reset, respawn) or a gap under an edge: start a new stripe instead of drawing a quad across
        if (L.on && d2 < seg * seg * 9 && !ga.gap && !gb.gap && this.claim(p.path, p.idx, lat, time, life)) { this.quad(L, ax, ay, az, bx, by, bz, time, life, strength); n++; }
        L.on = true; L.x = cx; L.z = cz; L.ax = ax; L.ay = ay; L.az = az; L.bx = bx; L.by = by; L.bz = bz;
      }
    }
    return n;
  }
  /** One invisible quad far below the world: with it the mesh is drawn from the first frame, so its pipeline is compiled while the
   *  race loads and not in the frame in which the first pod reaches sand. */
  prime() { if (this.count) return; const L = lane(); L.ay = L.by = -1e4; this.quad(L, 0, -1e4, 0, 0, -1e4, 0, 0, Infinity, 0); }
  /** quads that are still visible at `time` */
  alive(time: number): number { let n = 0; const I = this.info; for (let k = 0; k < this.count; k++) if (time - I[k * 16 + 1] < I[k * 16 + 2]) n++; return n; }
}

export interface GroundTracks { layer: TrackLayer; /** uploads what was laid since the last call and sets the clock of the fade */ update: (time: number) => void }

/** The mesh that shows a `TrackLayer`: one draw call, drawn right after the ground. */
export function buildGroundTracks(layer: TrackLayer, group: THREE.Object3D, disp: { dispose: () => void }[]): GroundTracks {
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(layer.pos, 3), aInfo = new THREE.BufferAttribute(layer.info, 4);
  aPos.setUsage(THREE.DynamicDrawUsage); aInfo.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('aInfo', aInfo);
  const ind = new Uint32Array(layer.cap * 6); for (let k = 0; k < layer.cap; k++) ind.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2], k * 6);
  g.setIndex(new THREE.BufferAttribute(ind, 1)); g.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const info: N = attribute('aInfo', 'vec4'), uT: N = uniform(0), age: N = uT.sub(info.y);
  // a quad whose life has run out collapses to a point: it costs no fill
  mat.positionNode = positionLocal.mul(step(age, info.z));
  const fade: N = varying(oneMinus(smoothstep(info.z.mul(0.5), info.z, age)).mul(smoothstep(0.0, 0.4, age)));
  const d: N = abs(varying(info.x).mul(2).sub(1)); // 0 in the middle of the stripe … 1 at its edge
  // the flat pressed band, a slightly darker line where the loose material was pushed to the side, a soft outer edge
  const band: N = oneMinus(smoothstep(0.84, 1.0, d)), edge: N = smoothstep(0.6, 0.78, d).mul(oneMinus(smoothstep(0.86, 1.0, d)));
  const grainy: N = texture(macroTexture(), positionLocal.xz.mul(1 / 7)).r.mul(0.5).add(0.75); // (the mesh is built in world coordinates)
  mat.colorNode = vec3(0, 0, 0);
  mat.opacityNode = band.mul(0.115).add(edge.mul(0.085)).mul(fade).mul(grainy).mul(varying(info.w)).min(float(0.6));
  mat.name = 'groundTracks';
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.name = 'groundTracks'; group.add(mesh);
  layer.prime(); g.setDrawRange(0, layer.count * 6); layer.dirty = 0; // (never an empty draw: WebGPU warns about a draw call with an index count of 0)
  disp.push(g, mat);
  return {
    layer,
    update: (time: number) => {
      uT.value = time;
      if (layer.dirty > 0) {
        const n = layer.dirty, st = layer.dirtyStart, wrap = st + n > layer.cap;
        for (const [at, w] of [[aPos, 12], [aInfo, 16]] as [THREE.BufferAttribute, number][]) { // (floats per quad)
          if (at.updateRanges.length > 24 || n >= layer.cap) at.clearUpdateRanges();
          if (n >= layer.cap) { /* empty range list = full upload */ }
          else if (wrap) { at.addUpdateRange(st * w, (layer.cap - st) * w); at.addUpdateRange(0, (st + n - layer.cap) * w); }
          else at.addUpdateRange(st * w, n * w);
          at.needsUpdate = true;
        }
        layer.dirty = 0; g.setDrawRange(0, layer.count * 6);
      }
    },
  };
}
