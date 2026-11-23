import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static track & terrain geometry pipeline:
 *  chunkGeometries(): splits long strips (road, walls, rails, kerbs …) into compact chunks with seamless normals.
 *  StaticBatcher:     groups world-space chunks into ~560 m spatial cells per (material, castShadow) and merges
 *                     each cell into a plain indexed THREE.Mesh (16-bit indices where possible).
 *                     Compared to BatchedMesh on WebGPU, this cuts real drawIndexed calls by ~10×, removes
 *                     per-frame indirect-texture uploads, avoids shadow/camera indirect-buffer races, and lets
 *                     Three.js frustum-cull every 560 m tile independently in both camera and shadow passes.
 */
type Disp = { dispose: () => void }[];

export function chunkGeometries(g: THREE.BufferGeometry, trisPerChunk = 3200): THREE.BufferGeometry[] {
  if (!g.attributes.normal) g.computeVertexNormals();
  const index = g.index; if (!index) return [g];
  const arr = index.array as ArrayLike<number>; const tris = arr.length / 3;
  const names = Object.keys(g.attributes); const count = g.attributes.position.count;
  const map = new Int32Array(count).fill(-1); const out: THREE.BufferGeometry[] = [];
  for (let t0 = 0; t0 < tris; t0 += trisPerChunk) {
    const i0 = t0 * 3, i1 = Math.min(tris, t0 + trisPerChunk) * 3;
    const used: number[] = []; const idx = new Uint32Array(i1 - i0);
    for (let k = i0; k < i1; k++) { const v = arr[k]; let m = map[v]; if (m < 0) { m = used.length; map[v] = m; used.push(v); } idx[k - i0] = m; }
    const cg = new THREE.BufferGeometry();
    for (const name of names) {
      const a = g.attributes[name] as THREE.BufferAttribute; const sz = a.itemSize; const src = a.array as Float32Array;
      const dst = new Float32Array(used.length * sz);
      for (let j = 0; j < used.length; j++) { const o = used[j] * sz; for (let c = 0; c < sz; c++) dst[j * sz + c] = src[o + c]; }
      cg.setAttribute(name, new THREE.BufferAttribute(dst, sz, a.normalized));
    }
    cg.setIndex(new THREE.BufferAttribute(used.length > 65535 ? idx : new Uint16Array(idx), 1));
    cg.computeBoundingBox(); cg.computeBoundingSphere();
    for (const v of used) map[v] = -1;
    out.push(cg);
  }
  g.dispose();
  return out;
}

interface Item { g: THREE.BufferGeometry; m?: THREE.Matrix4 }
interface Group { mat: THREE.Material; cast: boolean; items: Item[]; order?: number }

/** Draw order of alpha-blended GROUND (surface materials with `fade: 'soft'`): after everything opaque, before every other transparent
 *  object (dust, flames, glass – they have order ≥ 0 and do not write depth, so ground drawn after them would paint over them).
 *  BODY = the shoulder beside a natural road, OVER = a surface that fades in on top of another one (it must come after BODY: both
 *  write depth, and a body drawn second would be rejected under the faint rim of the overlay). */
export const GROUND_ORDER = { BODY: -3, OVER: -2 } as const;

const CELL = 580;
const MAX_VERTS = 60000;

export class StaticBatcher {
  batched: boolean; meshes = 0; batches = 0;
  private groups = new Map<string, Group>();
  constructor(batched: boolean) { this.batched = batched; }
  /** `order` (optional): render order of the meshes of this group – the same material can be drawn in several orders (`GROUND_ORDER`). */
  add(g: THREE.BufferGeometry, mat: THREE.Material, cast = false, m?: THREE.Matrix4, order?: number) {
    const key = mat.uuid + (cast ? '|c' : '|n') + (order === undefined ? '' : '|o' + order); let grp = this.groups.get(key);
    if (!grp) { grp = { mat, cast, items: [], order }; this.groups.set(key, grp); }
    grp.items.push({ g, m });
  }
  addStrip(g: THREE.BufferGeometry, mat: THREE.Material, trisPerChunk: number, cast = false, order?: number) {
    for (const c of chunkGeometries(g, trisPerChunk)) this.add(c, mat, cast, undefined, order);
  }
  build(parent: THREE.Object3D, disp: Disp) {
    const sig = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '|n');
    const cTmp = new THREE.Vector3();
    for (const grp of this.groups.values()) {
      const isTrans = grp.mat.transparent;
      const addMesh = (geo: THREE.BufferGeometry) => {
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, grp.mat);
        mesh.castShadow = grp.cast && !isTrans;
        mesh.receiveShadow = !isTrans || grp.order !== undefined; // (blended ground receives shadows like the ground below it)
        if (grp.order !== undefined) mesh.renderOrder = grp.order; else if (isTrans) mesh.renderOrder = 4;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh); disp.push(geo);
      };
      if (!this.batched || grp.items.length <= 1) {
        for (const it of grp.items) { if (it.m) it.g.applyMatrix4(it.m); addMesh(it.g); this.meshes++; }
        continue;
      }
      // Group compatible geometries into ~580 m spatial cells (larger 1700 m far-terrain cells grouped into 1740 m supercells)
      const cells = new Map<string, THREE.BufferGeometry[]>();
      for (const it of grp.items) {
        if (it.m) it.g.applyMatrix4(it.m);
        if (!it.g.boundingSphere) it.g.computeBoundingSphere();
        const sp = it.g.boundingSphere!;
        cTmp.copy(sp.center);
        const step = sp.radius > 450 ? CELL * 3 : CELL;
        const k = `${sig(it.g)}|${step}|${Math.floor(cTmp.x / step)},${Math.floor(cTmp.z / step)}`;
        let list = cells.get(k); if (!list) { list = []; cells.set(k, list); }
        list.push(it.g);
      }
      const flush = (batch: THREE.BufferGeometry[]) => {
        if (batch.length === 1) { addMesh(batch[0]); this.meshes++; return; }
        const mg = mergeGeometries(batch, false);
        if (mg) { batch.forEach(x => x.dispose()); addMesh(mg); this.batches++; }
        else for (const x of batch) { addMesh(x); this.meshes++; }
      };
      for (const list of cells.values()) {
        let cur: THREE.BufferGeometry[] = [], vSum = 0;
        for (const g of list) {
          const vc = g.attributes.position.count;
          if (cur.length > 0 && vSum + vc > MAX_VERTS) { flush(cur); cur = []; vSum = 0; }
          cur.push(g); vSum += vc;
        }
        if (cur.length) flush(cur);
      }
    }
    this.groups.clear();
  }
}
