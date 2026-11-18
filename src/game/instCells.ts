// Spatially chunked instancing (session 7 – performance).
// One huge InstancedMesh per decor type defeats frustum culling and puts *every* instance into the
// shadow pass each frame. CellInstancer buckets instances into square cells (one InstancedMesh per cell
// and part) with proper bounding spheres, hides cells beyond their view distance and only lets cells
// near the camera cast shadows (the sun shadow frustum is ±130 m around the player anyway).
import * as THREE from 'three';

interface Cell { cx: number; cz: number; r: number; meshes: THREE.InstancedMesh[]; low: THREE.InstancedMesh[]; cast: boolean }

export class CellInstancer {
  private cells: Cell[] = [];
  private frame = 0;
  constructor(private viewDist: number, private shadowDist: number, private lodDist = 350) {}

  /** Add instances. `parts` share every matrix (e.g. wood + leaves of one tree variant). */
  /** `low` (optional): low-poly parts with the same materials, shown beyond `lodDist` (session 11). */
  add(group: THREE.Group, parts: [THREE.BufferGeometry, THREE.Material][], mats: THREE.Matrix4[], cols: THREE.Color[], cellSize: number, cast: boolean, low?: [THREE.BufferGeometry, THREE.Material][]) {
    const buckets = new Map<string, number[]>();
    const p = new THREE.Vector3();
    mats.forEach((m, i) => { p.setFromMatrixPosition(m); const k = `${Math.floor(p.x / cellSize)},${Math.floor(p.z / cellSize)}`; let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(i); });
    for (const [k, idx] of buckets) {
      const [ix, iz] = k.split(',').map(Number);
      const cell: Cell = { cx: (ix + 0.5) * cellSize, cz: (iz + 0.5) * cellSize, r: cellSize * 0.75, meshes: [], low: [], cast };
      const mk = (list: [THREE.BufferGeometry, THREE.Material][], out: THREE.InstancedMesh[], visible: boolean) => {
        for (const [geo, mat] of list) {
          const im = new THREE.InstancedMesh(geo, mat, idx.length);
          idx.forEach((src, j) => { im.setMatrixAt(j, mats[src]); if (cols.length) im.setColorAt(j, cols[src]); });
          im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); im.visible = visible;
          if (im.boundingSphere) cell.r = Math.max(cell.r, im.boundingSphere.radius);
          group.add(im); out.push(im);
        }
      };
      mk(parts, cell.meshes, true); if (low) mk(low, cell.low, false);
      this.cells.push(cell);
    }
  }

  /** Distance culling + shadow-caster selection; cheap, runs every 4th frame. */
  update(cam: THREE.Vector3) {
    if ((this.frame++ & 3) !== 0) return;
    for (const c of this.cells) {
      const d = Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - c.r);
      const vis = d < this.viewDist; const sh = c.cast && d < this.shadowDist; const far = c.low.length > 0 && d > this.lodDist;
      for (const m of c.meshes) { m.visible = vis && !far; m.castShadow = sh; }
      for (const m of c.low) { m.visible = vis && far; m.castShadow = false; } // far LOD never needs shadows (beyond the 240 m caster range)
    }
  }
  get count() { return this.cells.length; }
}
