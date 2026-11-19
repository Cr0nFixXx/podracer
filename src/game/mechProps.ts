// ===== Session 11: futuristic / mechanical trackside machinery =====
//  - Repulsor relay towers (hex plinth, tripod struts, mast, collar decks, emitter prongs) with two counter-rotating toothed rings
//  - Patrol drones (quad-rotor body, sensor eye, nav lights) cruising against the race direction outside the racing volume
// 5 instanced draw calls for the whole track, no shadow casting, ~70 instance matrices updated per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import { DS, type TrackData } from './trackBuilder';

type Disp = { dispose: () => void }[];
const UP = new THREE.Vector3(0, 1, 0);

function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map(p => { const n = p.index ? p.toNonIndexed() : p; if (n !== p) p.dispose(); n.deleteAttribute('uv'); return n; }))!;
  parts.length = 0; g.computeBoundingSphere(); return g;
}
function strut(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az), len = d.length(); d.normalize();
  const g = new THREE.BoxGeometry(w, len, w * 1.5); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d)); g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); return g;
}

export function addMechProps(
  td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp,
  heightAt: (x: number, z: number) => number, roadClear: (x: number, z: number, r: number, margin?: number) => boolean, waterY: number, detail: number,
) {
  const S = td.main.samples, N = td.N;
  const metal = new THREE.MeshStandardMaterial({ color: '#59606c', metalness: 0.86, roughness: 0.36 });
  const dark = new THREE.MeshStandardMaterial({ color: '#23272e', metalness: 0.8, roughness: 0.48 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.55) });
  disp.push(metal, dark, glow);

  // ---------- relay tower (static) ----------
  const tw: THREE.BufferGeometry[] = [], tg: THREE.BufferGeometry[] = [];
  tw.push(new THREE.CylinderGeometry(2.3, 2.9, 1.3, 6).translate(0, 0.3, 0), new THREE.CylinderGeometry(1.5, 2.0, 0.7, 6).translate(0, 1.3, 0));
  tw.push(new THREE.CylinderGeometry(0.42, 0.72, 15.4, 8).translate(0, 9.2, 0));
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + 0.52, c = Math.cos(a), s = Math.sin(a);
    tw.push(strut(c * 2.5, 0.6, s * 2.5, c * 0.5, 7.4, s * 0.5, 0.26));
    tw.push(strut(c * 1.75, 3.2, s * 1.75, Math.cos(a + 2.094) * 1.75, 3.2, Math.sin(a + 2.094) * 1.75, 0.14));
    tw.push(strut(c * 0.4, 16.2, s * 0.4, c * 1.35, 17.4, s * 1.35, 0.16), strut(c * 1.35, 17.4, s * 1.35, c * 1.0, 19.3, s * 1.0, 0.12));
    tg.push(new THREE.BoxGeometry(0.1, 7.5, 0.1).translate(c * 0.6, 11.2, s * 0.6), new THREE.SphereGeometry(0.16, 6, 4).translate(c * 1.0, 19.4, s * 1.0));
    tw.push(new THREE.BoxGeometry(0.5, 0.9, 0.34).translate(c * 2.2, 1.5, s * 2.2).rotateY(0)); // service boxes
  }
  for (const [y, r] of [[7.4, 1.25], [12.0, 0.95], [16.2, 0.8]]) tw.push(new THREE.CylinderGeometry(r, r * 0.72, 0.26, 10).translate(0, y, 0));
  tg.push(new THREE.SphereGeometry(0.62, 12, 8).translate(0, 17.8, 0), new THREE.TorusGeometry(1.3, 0.05, 4, 20).rotateX(Math.PI / 2).translate(0, 7.62, 0), new THREE.TorusGeometry(2.36, 0.06, 4, 6).rotateX(Math.PI / 2).translate(0, 1.0, 0));
  const towerGeo = merge(tw), towerGlowGeo = merge(tg);
  // toothed stator ring (animated, 2 per tower)
  const rg: THREE.BufferGeometry[] = [new THREE.TorusGeometry(2.4, 0.17, 6, 30).rotateX(Math.PI / 2)];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; rg.push(new THREE.BoxGeometry(0.5, 0.46, 0.3).translate(2.72, 0, 0).rotateY(a)); if (k % 2 === 0) rg.push(new THREE.BoxGeometry(1.5, 0.1, 0.16).translate(1.62, 0, 0).rotateY(a + 0.39)); }
  const ringGeo = merge(rg);

  const towers: { x: number; y: number; z: number; ph: number }[] = [];
  const step = Math.max(60, Math.round(280 / DS / Math.max(0.5, Math.min(1.3, detail))));
  for (let i = 60, n = 0; i < N - 40; i += step, n++) {
    const s = S[i]; if (s.gap || s.zeroG || s.roof > 0 || s.ramp > 0) continue;
    let side = n % 2 ? 1 : -1;
    const blocked = (sd: number) => (sd > 0 ? s.hR : s.hL) > 0 || (sd > 0 ? s.openR : s.openL);
    if (blocked(side)) side = -side; if (blocked(side)) continue;
    const off = (side > 0 ? s.wallR : s.wallL) + 10.5, x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
    if (!roadClear(x, z, 4, 2.5)) continue;
    const y = heightAt(x, z); if (y < waterY + 0.6 || Math.abs(y - s.y) > 13) continue;
    towers.push({ x, y: y - 0.25, z, ph: n * 1.7 });
  }
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count)); im.count = count; im.receiveShadow = true; im.frustumCulled = false; group.add(im); disp.push(geo); return im; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const tIM = mk(towerGeo, metal, towers.length), tgIM = mk(towerGlowGeo, glow, towers.length), rIM = mk(ringGeo, dark, towers.length * 2);
  towers.forEach((t, i) => { m4.compose(v.set(t.x, t.y, t.z), q.setFromAxisAngle(UP, t.ph), sc.set(1, 1, 1)); tIM.setMatrixAt(i, m4); tgIM.setMatrixAt(i, m4); });
  rIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // ---------- patrol drones ----------
  const db: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.75, 12, 8).scale(1, 0.55, 1.35), new THREE.BoxGeometry(0.5, 0.3, 1.1).translate(0, -0.42, 0.1)], dg: THREE.BufferGeometry[] = [];
  for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    db.push(strut(ax * 0.4, 0.05, az * 0.5, ax * 1.25, 0.18, az * 1.2, 0.09), new THREE.CylinderGeometry(0.62, 0.62, 0.05, 14).translate(ax * 1.25, 0.3, az * 1.2), new THREE.TorusGeometry(0.66, 0.045, 4, 14).rotateX(Math.PI / 2).translate(ax * 1.25, 0.26, az * 1.2));
    dg.push(new THREE.SphereGeometry(0.09, 5, 4).translate(ax * 1.25, 0.12, az * 1.2));
  }
  dg.push(new THREE.SphereGeometry(0.2, 8, 6).translate(0, -0.3, 0.72), new THREE.BoxGeometry(0.9, 0.05, 0.05).translate(0, 0.02, -0.98));
  const nDr = Math.max(4, Math.round(9 * Math.min(1.3, detail)));
  const dIM = mk(merge(db), metal, nDr), dgIM = mk(merge(dg), glow, nDr);
  dIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dgIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const update = (t: number) => {
    for (let i = 0; i < towers.length; i++) {
      const tw2 = towers[i];
      m4.compose(v.set(tw2.x, tw2.y + 13.6, tw2.z), q.setFromAxisAngle(UP, t * 0.9 + tw2.ph), sc.set(1, 1, 1)); rIM.setMatrixAt(i * 2, m4);
      m4.compose(v.set(tw2.x, tw2.y + 15.0, tw2.z), q.setFromAxisAngle(UP, -t * 1.5 + tw2.ph), sc.set(0.72, 0.8, 0.72)); rIM.setMatrixAt(i * 2 + 1, m4);
    }
    if (towers.length) rIM.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < nDr; i++) {
      const f = ((i / nDr * N - t * 9 + N * 4) % N + N) % N, i0 = Math.floor(f), s = S[i0], s2 = S[(i0 + 1) % N], w = f - i0;
      const side = i % 2 ? 1 : -1, lat = side * (s.hw + 7.5);
      const hide = s.gap || s.zeroG || s.roof > 0 || (side > 0 ? s.hR : s.hL) > 0;
      const x = s.x + (s2.x - s.x) * w + s.rx * lat, z = s.z + (s2.z - s.z) * w + s.rz * lat, y = s.y + (s2.y - s.y) * w + 12.5 + Math.sin(t * 1.3 + i * 2.1) * 1.1;
      q.setFromAxisAngle(UP, Math.atan2(-s.tx, -s.tz) + Math.sin(t * 0.7 + i) * 0.25);
      m4.compose(v.set(x, y, z), q, hide ? sc.set(0, 0, 0) : sc.set(1.15, 1.15, 1.15)); dIM.setMatrixAt(i, m4); dgIM.setMatrixAt(i, m4);
    }
    dIM.instanceMatrix.needsUpdate = true; dgIM.instanceMatrix.needsUpdate = true;
  };
  update(0);
  if (towers.length) group.userData.mechTower = towers[Math.min(1, towers.length - 1)];
  return { update, towers: towers.length, drones: nDr };
}
