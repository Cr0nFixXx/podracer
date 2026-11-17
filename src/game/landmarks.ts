import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { Emitter } from './props';
import type { SmokeSrc } from './smoke';
import type { TerrainField } from './terrain';
import type { TrackData } from './trackBuilder';

/**
 * Vista landmarks placed 250–1600 m off the track so the open landscape has focal points:
 * natural arches, buttes, a crashed starship, Mos-Espa-like domes, ice arches, research stations, methane refineries,
 * volcanoes, prison towers, giant trees, jungle ruins, crystal spires and offshore rigs. Merged per material (few draws).
 */
type Disp = { dispose: () => void }[];
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const n3 = (x: number, y: number, z: number) => (vn(x, y) + vn(y + 31.7, z) + vn(z + 17.3, x)) / 3;

/** displace along vertex normals with 3D value noise (two octaves) */
function deform(g: THREE.BufferGeometry, amp: number, f: number, seed: number) {
  g.computeVertexNormals(); const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = ((n3(x * f + seed, y * f, z * f) - 0.5) * 2 + (n3(x * f * 3.1, y * f * 3.1 + seed, z * f * 3.1) - 0.5) * 0.6) * amp;
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  g.computeVertexNormals(); return g;
}
/** world-space box projection (rock materials tile every `tile` metres regardless of object size) */
function projectUV(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position, n = g.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function addLandmarks(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, field: TerrainField, rng: () => number, rock: THREE.Material, emitters: Emitter[], smokes: SmokeSrc[] = []) {
  const S = td.main.samples, N = S.length;
  const std = (c: string, r: number, m: number, e?: string, ei = 0) => { const mt = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e ?? '#000000', emissiveIntensity: ei }); disp.push(mt); return mt; };
  const win = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512; const c = cv.getContext('2d')!;
    c.fillStyle = '#05070c'; c.fillRect(0, 0, 128, 512);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 8; x++) if (h2(x, y) < 0.42) { c.fillStyle = h2(y, x) < 0.5 ? '#9fd8ff' : '#ffd890'; c.fillRect(x * 16 + 3, y * 8 + 2, 10, 4); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 6); disp.push(t); return t;
  })();
  const M = {
    rock, bone: std('#ddd0b4', 0.85, 0), adobe: std('#cdb38a', 0.92, 0), metal: std('#5d6168', 0.55, 0.75), rust: std('#7a4c32', 0.75, 0.45), ice: std('#bfe4ff', 0.16, 0.05, '#3a7aa8', 0.15),
    crystal: std('#c8a0ff', 0.08, 0.1, '#7a3aff', 0.7), leaf: std('#2e5a22', 0.85, 0), bark: std('#4a3424', 0.92, 0), stone: std('#8a8270', 0.9, 0), white: std('#e6eaef', 0.4, 0.2),
    glow: (() => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a20').multiplyScalar(1.3) }); disp.push(m); return m; })(),
    tower: (() => { const m = new THREE.MeshStandardMaterial({ color: '#3a4250', metalness: 0.8, roughness: 0.3, map: win, emissiveMap: win, emissive: '#ffffff', emissiveIntensity: 0.9 }); disp.push(m); return m; })(),
  };
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry, m: THREE.Matrix4) => {
    const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose(); gg.applyMatrix4(m); if (!gg.attributes.normal) gg.computeVertexNormals();
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    let l = buckets.get(mat); if (!l) { l = []; buckets.set(mat, l); } l.push(gg);
  };
  const TRS = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, sy, s));
  const placed: { x: number; z: number; r: number }[] = [];
  const spot = (minD: number, maxD: number, r: number) => {
    for (let t = 0; t < 80; t++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const dd = minD + rng() * (maxD - minD);
      const x = s.x + s.rx * side * (s.hw + dd), z = s.z + s.rz * side * (s.hw + dd);
      if (!field.roadClear(x, z, r, 20) || placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 60)) continue;
      placed.push({ x, z, r }); return { x, z, y: field.heightAt(x, z), yaw: rng() * Math.PI * 2 };
    }
    return null;
  };
  const prison = theme.terrain === 'prison', ocean = theme.terrain === 'ocean';

  const B = {
    arch: (mat: THREE.Material) => { const span = 140 + rng() * 90, th = 14 + rng() * 10; const p = spot(320, 1150, span * 0.6); if (!p) return;
      const g = deform(new THREE.TorusGeometry(span / 2, th, 18, 56, Math.PI), th * 0.35, 0.045, rng() * 9); g.scale(1, 1.3, 1.5);
      put(mat, g, TRS(p.x, p.y - th * 0.6, p.z, p.yaw)); },
    butte: (mat: THREE.Material) => { const r = 24 + rng() * 40, h = 70 + rng() * 140; const p = spot(260, 1450, r * 1.3); if (!p) return;
      const g = new THREE.CylinderGeometry(r * 0.82, r * 1.05, h, 32, 14); g.translate(0, h / 2, 0);
      const pa = g.attributes.position as THREE.BufferAttribute; const seed = rng() * 7;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const rr = Math.hypot(x, z); if (rr < 0.5) continue; const k = 1 + 0.05 * Math.sin(y * 0.22 + seed) + (n3(x * 0.05 + seed, y * 0.05, z * 0.05) - 0.5) * 0.35; pa.setX(i, x * k); pa.setZ(i, z * k); }
      g.computeVertexNormals(); put(mat, g, TRS(p.x, p.y - 6, p.z, p.yaw)); },
    city: () => { const p = spot(380, 820, 190); if (!p) return;
      put(M.adobe, new THREE.SphereGeometry(30, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), TRS(p.x, p.y + 9, p.z));
      put(M.adobe, new THREE.CylinderGeometry(31, 33, 10, 28), TRS(p.x, p.y + 4, p.z));
      for (let k = 0; k < 22; k++) { const a = rng() * Math.PI * 2, d = 45 + rng() * 140, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), r = 6 + rng() * 9, hb = 3 + rng() * 5;
        put(M.adobe, new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), TRS(x, y + hb, z)); put(M.adobe, new THREE.CylinderGeometry(r, r * 1.05, hb, 16), TRS(x, y + hb / 2, z)); }
      for (let k = 0; k < 8; k++) { const a = rng() * Math.PI * 2, d = 30 + rng() * 120, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), h = 22 + rng() * 28;
        put(M.adobe, new THREE.CylinderGeometry(3.2, 4.2, h, 14), TRS(x, y + h / 2, z)); put(M.adobe, new THREE.SphereGeometry(4, 12, 8), TRS(x, y + h, z)); }
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + rng(), x = p.x + Math.cos(a) * 175, z = p.z + Math.sin(a) * 175; put(M.adobe, new THREE.BoxGeometry(60 + rng() * 40, 7, 3), TRS(x, field.heightAt(x, z) + 3, z, -a + Math.PI / 2)); } },
    wreck: () => { const p = spot(360, 950, 110); if (!p) return; const m0 = TRS(p.x, p.y - 7, p.z, p.yaw, 0.22, 0.12);
      const parts: [THREE.Material, THREE.BufferGeometry][] = [
        [M.metal, new THREE.CylinderGeometry(16, 20, 170, 24).rotateZ(Math.PI / 2)], [M.rust, new THREE.BoxGeometry(34, 14, 40).translate(-20, 16, 0)],
        [M.metal, new THREE.BoxGeometry(30, 4, 46).translate(60, 6, 34).rotateX(0.3)], [M.metal, new THREE.BoxGeometry(30, 4, 46).translate(60, 6, -34).rotateX(-0.3)],
        [M.rust, new THREE.TorusGeometry(18, 3.2, 10, 28).rotateY(Math.PI / 2).translate(86, 0, 0)], [M.rust, new THREE.TorusGeometry(14, 2.4, 10, 28).rotateY(Math.PI / 2).translate(96, 0, 0)]];
      for (const [mt, g] of parts) put(mt, g, m0);
      for (let k = 0; k < 10; k++) { const a = rng() * Math.PI * 2, d = 60 + rng() * 80, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; put(M.rust, new THREE.BoxGeometry(4 + rng() * 8, 2 + rng() * 4, 4 + rng() * 10), TRS(x, field.heightAt(x, z) + 1, z, rng() * 6, rng() - 0.5, rng() - 0.5)); } smokes.push({ x: p.x, y: p.y + 6, z: p.z, kind: 'dark', scale: 0.9 }); },
    station: () => { const p = spot(300, 1000, 70); if (!p) return; smokes.push({ x: p.x, y: p.y + 16, z: p.z, kind: 'steam', scale: 0.5 });
      for (let k = 0; k < 4; k++) { const a = k * 1.7, d = k ? 26 + rng() * 14 : 0, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, r = k ? 9 + rng() * 5 : 18; put(M.white, new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), TRS(x, field.heightAt(x, z) - 0.5, z)); }
      put(M.metal, new THREE.CylinderGeometry(0.8, 1.8, 72, 10), TRS(p.x + 34, p.y + 36, p.z)); put(M.glow, new THREE.SphereGeometry(1.6, 12, 8), TRS(p.x + 34, p.y + 73, p.z));
      put(M.white, new THREE.SphereGeometry(10, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), TRS(p.x - 30, p.y + 14, p.z + 10, 0, -0.9)); put(M.metal, new THREE.CylinderGeometry(0.8, 1.2, 12, 8), TRS(p.x - 30, p.y + 6, p.z + 10)); },
    refinery: () => { const p = spot(330, 1100, 90); if (!p) return;
      for (let k = 0; k < 6; k++) { const a = rng() * Math.PI * 2, d = rng() * 60, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), r = 9 + rng() * 7, h = 18 + rng() * 18;
        put(M.rust, new THREE.CylinderGeometry(r, r, h, 24), TRS(x, y + h / 2, z)); put(M.rust, new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), TRS(x, y + h, z)); }
      for (let k = 0; k < 3; k++) { const x = p.x - 40 + k * 22, z = p.z + 50, y = field.heightAt(x, z), h = 70 + rng() * 30;
        put(M.metal, new THREE.CylinderGeometry(2.2, 3.4, h, 14), TRS(x, y + h / 2, z)); put(M.glow, new THREE.TorusGeometry(2.4, 0.5, 8, 16).rotateX(Math.PI / 2), TRS(x, y + h, z)); emitters.push({ x, y: y + h + 2, z, type: 'smoke' }); smokes.push({ x, y: y + h + 1, z, kind: 'smoke', scale: 0.8 + rng() * 0.4 }); }
      for (let k = 0; k < 5; k++) put(M.metal, new THREE.BoxGeometry(80, 2, 2), TRS(p.x, p.y + 6 + k * 3, p.z + 20, rng() * 3)); },
    volcano: () => { const p = spot(800, 1600, 420); if (!p) return; const rb = 300 + rng() * 160, h = 230 + rng() * 140, rt = 55;
      const g = deform(new THREE.CylinderGeometry(rt, rb, h, 56, 12, true), 14, 0.02, rng() * 5); g.translate(0, h / 2, 0); put(M.rock, g, TRS(p.x, p.y - 10, p.z));
      put(M.glow, new THREE.CylinderGeometry(rt * 0.95, rt * 0.95, 3, 32), TRS(p.x, p.y - 12 + h, p.z)); emitters.push({ x: p.x, y: p.y + h, z: p.z, type: 'smoke' }); smokes.push({ x: p.x, y: p.y + h - 14, z: p.z, kind: 'ash', scale: 0.8 + rng() * 0.5 }); },
    prisonTower: () => { const p = spot(280, 1200, 40); if (!p) return; const base = field.avgY - 160, h = 260 + rng() * 120;
      put(M.tower, new THREE.BoxGeometry(46, h, 46), TRS(p.x, base + h / 2, p.z, p.yaw));
      put(M.metal, new THREE.TorusGeometry(40, 3, 8, 32).rotateX(Math.PI / 2), TRS(p.x, base + h * 0.62, p.z)); put(M.glow, new THREE.SphereGeometry(3, 12, 8), TRS(p.x, base + h + 6, p.z)); },
    giantTree: () => { const p = spot(260, 1100, 80); if (!p) return; const h = 130 + rng() * 60;
      put(M.bark, new THREE.CylinderGeometry(9, 16, h, 16), TRS(p.x, p.y + h / 2 - 4, p.z));
      for (let k = 0; k < 5; k++) put(M.bark, new THREE.CylinderGeometry(2, 5, 34, 8), TRS(p.x + Math.cos(k * 1.3) * 16, p.y + 6, p.z + Math.sin(k * 1.3) * 16, 0, Math.cos(k * 1.3) * 0.7, Math.sin(k * 1.3) * 0.7));
      for (let k = 0; k < 7; k++) { const r = 30 + rng() * 26; put(M.leaf, deform(new THREE.IcosahedronGeometry(r, 2), r * 0.18, 0.06, k), TRS(p.x + (rng() - 0.5) * 70, p.y + h - 10 + rng() * 30, p.z + (rng() - 0.5) * 70, 0, 0, 0, 1, 0.7)); } },
    ruin: () => { const p = spot(300, 1000, 70); if (!p) return;
      for (let k = 0; k < 6; k++) { const s = 84 - k * 13; put(M.stone, new THREE.BoxGeometry(s, 9, s), TRS(p.x, p.y + 4.5 + k * 9, p.z, p.yaw)); }
      put(M.stone, new THREE.BoxGeometry(14, 6, 60), TRS(p.x + Math.sin(p.yaw) * 44, p.y + 22, p.z + Math.cos(p.yaw) * 44, p.yaw, -0.62)); },
    crystalSpire: () => { const p = spot(260, 1200, 60); if (!p) return;
      for (let k = 0; k < 7; k++) { const r = 6 + rng() * 9, h = 60 + rng() * 110; put(M.crystal, new THREE.CylinderGeometry(0, r, h, 6).translate(0, h / 2, 0), TRS(p.x + (rng() - 0.5) * 40, p.y - 4, p.z + (rng() - 0.5) * 40, rng() * 6, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5)); } },
    rig: () => { const p = spot(320, 1200, 60); if (!p) return; const deck = field.avgY + 40;
      for (const [dx, dz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) { const y0 = field.heightAt(p.x + dx, p.z + dz); put(M.metal, new THREE.CylinderGeometry(2.4, 3.2, deck - y0, 10), TRS(p.x + dx, (deck + y0) / 2, p.z + dz)); }
      put(M.rust, new THREE.BoxGeometry(56, 8, 56), TRS(p.x, deck + 4, p.z, p.yaw)); put(M.metal, new THREE.BoxGeometry(9, 46, 9), TRS(p.x + 12, deck + 31, p.z, p.yaw));
      put(M.rust, new THREE.BoxGeometry(52, 2.6, 2.6), TRS(p.x, deck + 50, p.z, p.yaw + 0.6)); put(M.glow, new THREE.SphereGeometry(1.4, 10, 8), TRS(p.x + 12, deck + 55, p.z)); smokes.push({ x: p.x + 12, y: deck + 56, z: p.z, kind: 'smoke', scale: 0.6 }); },
    krayt: () => { const p = spot(260, 900, 70); if (!p) return; const L = 70 + rng() * 30; const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const pt = (t: number) => { const al = (t - 0.5) * L, off = Math.sin(t * Math.PI * 2.2) * 6; return [p.x + s * al + c * off, p.z + c * al - s * off]; };
      for (let i = 0; i <= 44; i++) {
        const t = i / 44; const [x, z] = pt(t); const y = field.heightAt(x, z); const r = 0.7 + Math.sin(t * Math.PI) * 1.1;
        put(M.bone, deform(new THREE.IcosahedronGeometry(r, 1), r * 0.25, 0.7, i), TRS(x, y + r * 0.2, z));
        if (i % 2 === 0 && t > 0.14 && t < 0.78) { const [x2, z2] = pt(t + 0.01); const yaw = Math.atan2(x2 - x, z2 - z); const rr = 2.5 + Math.sin(t * Math.PI) * 4;
          put(M.bone, new THREE.TorusGeometry(rr, 0.28 + rr * 0.03, 5, 14, Math.PI * 0.85), TRS(x, y - rr * 0.25, z, yaw, (rng() - 0.5) * 0.4, Math.PI * 0.075 + (rng() - 0.5) * 0.3)); }
      }
      const [hx, hz] = pt(1.0), [hx2, hz2] = pt(0.97); const hy = field.heightAt(hx, hz), hyaw = Math.atan2(hx - hx2, hz - hz2);
      const skull = deform(new THREE.SphereGeometry(1, 14, 10), 0.15, 1.2, 3); skull.scale(1.6, 1.3, 3.5); put(M.bone, skull, TRS(hx, hy + 1.1, hz, hyaw, 0.15));
      for (const sd of [-1, 1]) put(M.bone, new THREE.ConeGeometry(0.45, 3.4, 6), TRS(hx + Math.cos(hyaw) * sd * 1.2, hy + 2.8, hz - Math.sin(hyaw) * sd * 1.2, hyaw, -0.6, sd * 0.3));
    },
    homestead: () => { const p = spot(320, 900, 60); if (!p) return;
      put(M.adobe, new THREE.TorusGeometry(15, 2.2, 8, 32).rotateX(Math.PI / 2), TRS(p.x, p.y + 0.6, p.z));
      put(M.adobe, new THREE.SphereGeometry(6.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), TRS(p.x + 22, field.heightAt(p.x + 22, p.z) - 0.4, p.z));
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + rng(), d = 30 + rng() * 25, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z);
        put(M.metal, new THREE.CylinderGeometry(0.35, 0.5, 6, 10), TRS(x, y + 3, z)); put(M.metal, new THREE.CylinderGeometry(0.9, 0.9, 0.2, 14), TRS(x, y + 4.2, z)); put(M.metal, new THREE.CylinderGeometry(0.7, 0.7, 0.15, 14), TRS(x, y + 5.2, z)); }
      smokes.push({ x: p.x, y: p.y + 1, z: p.z, kind: 'steam', scale: 0.25 }); },
    obelisks: () => { const p = spot(280, 900, 50); if (!p) return;
      for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2, x = p.x + Math.cos(a) * 32, z = p.z + Math.sin(a) * 32, h = 16 + rng() * 12;
        put(M.stone, deform(new THREE.CylinderGeometry(1.8, 2.4, h, 5, 6), 0.35, 0.3, k), TRS(x, field.heightAt(x, z) + h / 2 - 1, z, a, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25)); }
      put(M.stone, new THREE.CylinderGeometry(6, 7, 2, 16), TRS(p.x, p.y + 0.6, p.z)); },
    lighthouse: () => { const p = spot(260, 800, 30); if (!p) return; const base = Math.max(p.y, field.avgY - 26);
      put(M.rock, deform(new THREE.IcosahedronGeometry(14, 2), 3, 0.1, 5), TRS(p.x, base - 6, p.z, 0, 0, 0, 1, 0.6));
      put(M.white, new THREE.CylinderGeometry(2.6, 3.6, 34, 16), TRS(p.x, base + 17, p.z)); put(M.rust, new THREE.CylinderGeometry(3, 3, 1.2, 16), TRS(p.x, base + 34.6, p.z));
      put(M.glow, new THREE.SphereGeometry(1.8, 12, 8), TRS(p.x, base + 36.5, p.z)); },
  };
  const id = theme.id; const rep = (n: number, f: () => void) => { for (let i = 0; i < n; i++) f(); };
  if (id === 'desert' || id === 'mesa') { if (['boonta', 'mosespa'].includes(td.def.id)) B.city(); rep(2, () => B.arch(M.rock)); rep(id === 'mesa' ? 7 : 5, () => B.butte(M.rock)); if (id === 'desert') { B.wreck(); B.homestead(); } B.krayt(); }
  else if (id === 'ice') { rep(2, () => B.arch(M.ice)); rep(2, B.station); rep(3, () => B.butte(M.rock)); B.wreck(); }
  else if (id === 'malastare') { rep(2, B.refinery); B.volcano(); rep(3, () => B.butte(M.rock)); B.obelisks(); }
  else if (id === 'lava') { rep(3, B.volcano); rep(2, () => B.butte(M.rock)); }
  else if (id === 'jungle') { rep(5, B.giantTree); rep(2, B.ruin); }
  else if (id === 'crystal') { rep(5, B.crystalSpire); B.arch(M.rock); }
  else if (prison) rep(5, B.prisonTower);
  else if (ocean) { rep(3, B.rig); B.arch(M.rock); B.lighthouse(); }

  for (const [mat, list] of buckets) {
    const g = mergeGeometries(list); list.forEach(x => x.dispose()); if (!g) continue;
    if (mat === rock) projectUV(g, 26);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; group.add(m); disp.push(g);
  }
  return placed.length;
}
