import * as THREE from 'three';

/**
 * Static track geometry pipeline.
 *  chunkGeometries(): splits long strips (road, walls, rails, kerbs …) into compact chunks (own vertices, seamless
 *                     normals computed on the full strip first) → per-chunk frustum culling.
 *  StaticBatcher:     collects chunks/tiles per (material, castShadow) and builds ONE BatchedMesh per group
 *                     (per-object frustum culling for camera + shadow camera, multi-draw on WebGL2, one pipeline on
 *                     WebGPU). Falls back to plain meshes when batching is off or attribute layouts differ.
 */
type Disp = { dispose: () => void }[];

export function chunkGeometries(g: THREE.BufferGeometry, trisPerChunk = 2400): THREE.BufferGeometry[] {
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
interface Group { mat: THREE.Material; cast: boolean; items: Item[] }

export class StaticBatcher {
  batched: boolean; meshes = 0; batches = 0;
  private groups = new Map<string, Group>();
  constructor(batched: boolean) { this.batched = batched; }
  add(g: THREE.BufferGeometry, mat: THREE.Material, cast = false, m?: THREE.Matrix4) {
    const key = mat.uuid + (cast ? '|c' : '|n'); let grp = this.groups.get(key);
    if (!grp) { grp = { mat, cast, items: [] }; this.groups.set(key, grp); }
    grp.items.push({ g, m });
  }
  addStrip(g: THREE.BufferGeometry, mat: THREE.Material, trisPerChunk: number, cast = false) {
    for (const c of chunkGeometries(g, trisPerChunk)) this.add(c, mat, cast);
  }
  build(parent: THREE.Object3D, disp: Disp) {
    for (const grp of this.groups.values()) {
      const sig = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '|n');
      const s0 = sig(grp.items[0].g);
      const ok = this.batched && grp.items.length > 1 && grp.items.every(it => sig(it.g) === s0 && !!it.g.index);
      if (ok) {
        let nv = 0, ni = 0; for (const it of grp.items) { nv += it.g.attributes.position.count; ni += it.g.index!.count; }
        const bm = new THREE.BatchedMesh(grp.items.length, nv, ni, grp.mat);
        for (const it of grp.items) { const gid = bm.addGeometry(it.g); const iid = bm.addInstance(gid); if (it.m) bm.setMatrixAt(iid, it.m); it.g.dispose(); }
        bm.castShadow = grp.cast; bm.receiveShadow = true; bm.perObjectFrustumCulled = true; bm.sortObjects = false;
        bm.computeBoundingBox(); bm.computeBoundingSphere();
        parent.add(bm); disp.push(bm); this.batches++;
      } else {
        for (const it of grp.items) {
          const mesh = new THREE.Mesh(it.g, grp.mat); if (it.m) mesh.applyMatrix4(it.m);
          mesh.castShadow = grp.cast; mesh.receiveShadow = true; parent.add(mesh); disp.push(it.g); this.meshes++;
        }
      }
    }
    this.groups.clear();
  }
}
