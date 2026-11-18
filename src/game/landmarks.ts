import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { Emitter } from './props';
import type { SmokeSrc } from './smoke';
import type { TerrainField } from './terrain';
import type { TrackData } from './trackBuilder';

/**
 * Vista landmarks placed 250–1600 m off the track so the open landscape has focal points:
 * natural arches, terraced buttes, a broken crashed starship with impact trench, Mos-Espa arena & domes,
 * ice arches, connected geodesic research stations, methane refineries with spherical tanks, lava-channel
 * volcanoes, prison towers, giant buttressed trees, stepped jungle temple ruins, crystal spires, offshore
 * rigs with helipads, Krayt dragon skeleton, sunken moisture farm, carved monolith ring, and striped lighthouse.
 * Returns LandmarkFoot[] so wildlife herds & vehicles avoid colliding with landmarks.
 */
type Disp = { dispose: () => void }[];
export interface LandmarkFoot { x: number; z: number; r: number }

function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const n3 = (x: number, y: number, z: number) => (vn(x, y) + vn(y + 31.7, z) + vn(z + 17.3, x)) / 3;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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

export function addLandmarks(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, field: TerrainField, rng: () => number, rock: THREE.Material, emitters: Emitter[], smokes: SmokeSrc[] = []): LandmarkFoot[] {
  const S = td.main.samples, N = S.length;
  const std = (c: string, r: number, m: number, e?: string, ei = 0) => { const mt = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e ?? '#000000', emissiveIntensity: ei }); disp.push(mt); return mt; };
  const win = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512; const c = cv.getContext('2d')!;
    c.fillStyle = '#05070c'; c.fillRect(0, 0, 128, 512);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 8; x++) if (h2(x, y) < 0.42) { c.fillStyle = h2(y, x) < 0.5 ? '#9fd8ff' : '#ffd890'; c.fillRect(x * 16 + 3, y * 8 + 2, 10, 4); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 6); disp.push(t); return t;
  })();
  const M = {
    rock, bone: std('#dfd2b6', 0.84, 0), adobe: std('#cfb48a', 0.92, 0), adobeDark: std('#8e7250', 0.94, 0),
    metal: std('#5d626a', 0.48, 0.78), dark: std('#272b32', 0.55, 0.72), rust: std('#7c4a30', 0.72, 0.48),
    red: std('#a83226', 0.55, 0.2), ice: std('#bfe4ff', 0.2, 0.08, '#3a7aa8', 0.16),
    crystal: std('#c8a0ff', 0.16, 0.12, '#7a3aff', 0.68), leaf: std('#2c5a20', 0.84, 0), bark: std('#483222', 0.92, 0),
    stone: std('#867e6c', 0.88, 0), moss: std('#3b5c28', 0.88, 0), white: std('#e6ebf0', 0.36, 0.22),
    glow: (() => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a20').multiplyScalar(1.3) }); disp.push(m); return m; })(),
    cyan: (() => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ad8ff').multiplyScalar(1.25) }); disp.push(m); return m; })(),
    tower: (() => { const m = new THREE.MeshStandardMaterial({ color: '#3a4250', metalness: 0.8, roughness: 0.3, map: win, emissiveMap: win, emissive: '#ffffff', emissiveIntensity: 0.9 }); disp.push(m); return m; })(),
  };
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry, m: THREE.Matrix4) => {
    const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose(); gg.applyMatrix4(m); if (!gg.attributes.normal) gg.computeVertexNormals();
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    let l = buckets.get(mat); if (!l) { l = []; buckets.set(mat, l); } l.push(gg);
  };
  const TRS = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, sy, s));
  const placed: LandmarkFoot[] = [];
  const spot = (minD: number, maxD: number, r: number) => {
    for (let t = 0; t < 80; t++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const dd = minD + rng() * (maxD - minD);
      const x = s.x + s.rx * side * (s.hw + dd), z = s.z + s.rz * side * (s.hw + dd);
      if (!field.roadClear(x, z, r, 22) || placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 60)) continue;
      placed.push({ x, z, r }); return { x, z, y: field.heightAt(x, z), yaw: rng() * Math.PI * 2 };
    }
    return null;
  };
  const prison = theme.terrain === 'prison', ocean = theme.terrain === 'ocean';

  const B = {
    arch: (mat: THREE.Material) => {
      const span = 140 + rng() * 90, th = 14 + rng() * 10; const p = spot(320, 1150, span * 0.6); if (!p) return;
      const g = deform(new THREE.TorusGeometry(span / 2, th, 20, 60, Math.PI), th * 0.36, 0.045, rng() * 9); g.scale(1, 1.32, 1.55);
      put(mat, g, TRS(p.x, p.y - th * 0.6, p.z, p.yaw));
      // Flared basal rock buttresses anchoring both feet
      for (const sd of [-1, 1]) {
        const bx = p.x + Math.cos(p.yaw) * sd * (span * 0.5), bz = p.z - Math.sin(p.yaw) * sd * (span * 0.5);
        put(mat, deform(new THREE.ConeGeometry(th * 1.9, th * 2.6, 14), th * 0.3, 0.06, sd + 4), TRS(bx, field.heightAt(bx, bz) + th * 0.6, bz, rng() * 6));
      }
    },
    butte: (mat: THREE.Material) => {
      // Multi-tier terraced Monument-Valley sandstone butte with basal scree skirt + flat caprock
      const r = 26 + rng() * 42, h = 72 + rng() * 145; const p = spot(260, 1450, r * 1.45); if (!p) return;
      const g = new THREE.CylinderGeometry(r * 0.78, r * 1.35, h, 36, 20); g.translate(0, h / 2, 0);
      const pa = g.attributes.position as THREE.BufferAttribute; const seed = rng() * 7;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const rr = Math.hypot(x, z); if (rr < 0.5) continue;
        const yf = y / h;
        // Flared concave talus apron at bottom (yf < 0.32), stepped vertical cliff tiers above, crisp overhanging caprock!
        const talus = Math.pow(Math.max(0, 1 - yf / 0.36), 1.7) * 0.36;
        const tier = (Math.floor(yf * 4) + sstep(0.18, 0.52, (yf * 4) % 1)) / 4;
        const stepK = 0.92 - tier * 0.14 + (yf > 0.88 ? 0.06 : 0) + talus;
        const crag = (n3(x * 0.055 + seed, y * 0.04, z * 0.055) - 0.5) * 0.32 + Math.sin(Math.atan2(z, x) * 7 + seed) * 0.06;
        pa.setX(i, x * (stepK + crag)); pa.setZ(i, z * (stepK + crag));
      }
      g.computeVertexNormals(); put(mat, g, TRS(p.x, p.y - 6, p.z, p.yaw));
    },
    city: () => {
      const p = spot(380, 820, 195); if (!p) return;
      // Central Grand Mos Espa dome + stepped drum + recessed entrance portal + spire
      put(M.adobe, new THREE.CylinderGeometry(32, 35, 11, 32), TRS(p.x, p.y + 4.5, p.z));
      put(M.adobeDark, new THREE.TorusGeometry(32.2, 1.1, 8, 32).rotateX(Math.PI / 2), TRS(p.x, p.y + 10, p.z));
      put(M.adobe, new THREE.SphereGeometry(30, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), TRS(p.x, p.y + 10, p.z));
      put(M.metal, new THREE.CylinderGeometry(0.6, 1.4, 24, 10), TRS(p.x, p.y + 50, p.z));
      put(M.glow, new THREE.SphereGeometry(1.4, 10, 8), TRS(p.x, p.y + 62.5, p.z));
      for (let k = 0; k < 24; k++) {
        const a = rng() * Math.PI * 2, d = 46 + rng() * 142, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), r = 6 + rng() * 9, hb = 3.5 + rng() * 5.5;
        put(M.adobe, new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), TRS(x, y + hb, z));
        put(M.adobe, new THREE.CylinderGeometry(r, r * 1.06, hb, 18), TRS(x, y + hb / 2, z));
        put(M.adobeDark, new THREE.BoxGeometry(r * 0.55, hb * 0.7, r * 0.5), TRS(x + Math.cos(a) * r * 0.9, y + hb * 0.35, z + Math.sin(a) * r * 0.9, -a + Math.PI / 2));
      }
      for (let k = 0; k < 9; k++) {
        const a = rng() * Math.PI * 2, d = 32 + rng() * 125, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), h = 24 + rng() * 32;
        put(M.adobe, new THREE.CylinderGeometry(3.0, 4.4, h, 16), TRS(x, y + h / 2, z));
        put(M.adobeDark, new THREE.CylinderGeometry(4.2, 3.6, 2.2, 16), TRS(x, y + h * 0.78, z));
        put(M.adobe, new THREE.SphereGeometry(4, 14, 8), TRS(x, y + h, z));
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rng() * 0.4, x = p.x + Math.cos(a) * 175, z = p.z + Math.sin(a) * 175, wy = field.heightAt(x, z);
        put(M.adobe, new THREE.BoxGeometry(64 + rng() * 36, 8, 3.4), TRS(x, wy + 3.5, z, -a + Math.PI / 2));
        put(M.adobeDark, new THREE.CylinderGeometry(3.2, 3.8, 12, 12), TRS(x, wy + 5.5, z));
      }
    },
    wreck: () => {
      const p = spot(360, 950, 115); if (!p) return; const m0 = TRS(p.x, p.y - 6, p.z, p.yaw, 0.2, 0.12);
      // Split battle-damaged corvette: forward & aft hull halves, exposed structural ribs, bridge tower + triple ion bells
      const parts: [THREE.Material, THREE.BufferGeometry][] = [
        [M.metal, new THREE.CylinderGeometry(14, 18, 82, 24).rotateZ(Math.PI / 2).translate(-48, 2, 0)],
        [M.metal, new THREE.CylinderGeometry(18, 21, 78, 24).rotateZ(Math.PI / 2).translate(44, 0, 0)],
        [M.dark, new THREE.CylinderGeometry(15, 16, 22, 16).rotateZ(Math.PI / 2).translate(-2, 0, 0)],
        [M.rust, new THREE.BoxGeometry(36, 15, 42).translate(-26, 17, 0)],
        [M.cyan, new THREE.BoxGeometry(4, 2.2, 26).translate(-44, 20, 0)], // flickering bridge viewport
        [M.metal, new THREE.BoxGeometry(34, 3.6, 52).translate(54, 6, 36).rotateX(0.32)],
        [M.metal, new THREE.BoxGeometry(34, 3.6, 52).translate(54, 6, -36).rotateX(-0.32)],
        [M.rust, new THREE.TorusGeometry(18, 3.2, 10, 28).rotateY(Math.PI / 2).translate(86, 0, 0)],
        [M.rust, new THREE.TorusGeometry(11, 2.4, 10, 24).rotateY(Math.PI / 2).translate(88, 6, 14)],
        [M.rust, new THREE.TorusGeometry(11, 2.4, 10, 24).rotateY(Math.PI / 2).translate(88, 6, -14)],
      ];
      for (let r = -10; r <= 6; r += 5) parts.push([M.rust, new THREE.TorusGeometry(16.8, 0.9, 6, 20, Math.PI * 1.3).rotateY(Math.PI / 2).translate(r, 1, 0)]);
      for (const [mt, g] of parts) put(mt, g, m0);
      for (let k = 0; k < 12; k++) { const a = rng() * Math.PI * 2, d = 58 + rng() * 82, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; put(k % 3 ? M.rust : M.metal, new THREE.BoxGeometry(4 + rng() * 9, 1.5 + rng() * 4, 4 + rng() * 11), TRS(x, field.heightAt(x, z) + 0.8, z, rng() * 6, rng() - 0.5, rng() - 0.5)); }
      smokes.push({ x: p.x, y: p.y + 6, z: p.z, kind: 'dark', scale: 0.95 });
    },
    station: () => {
      const p = spot(300, 1000, 75); if (!p) return; smokes.push({ x: p.x, y: p.y + 16, z: p.z, kind: 'steam', scale: 0.5 });
      put(M.white, new THREE.SphereGeometry(18, 26, 13, 0, Math.PI * 2, 0, Math.PI / 2), TRS(p.x, p.y - 0.4, p.z));
      put(M.cyan, new THREE.TorusGeometry(18.1, 0.45, 6, 32).rotateX(Math.PI / 2), TRS(p.x, p.y + 1.2, p.z));
      for (let k = 1; k <= 3; k++) {
        const a = k * 2.05, d = 28 + rng() * 12, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), r = 9 + rng() * 5;
        put(M.white, new THREE.SphereGeometry(r, 22, 11, 0, Math.PI * 2, 0, Math.PI / 2), TRS(x, y - 0.4, z));
        // Pressurized connecting corridor tube
        put(M.metal, new THREE.CylinderGeometry(2.2, 2.2, d - 14, 10).rotateZ(Math.PI / 2), TRS((p.x + x) / 2, (p.y + y) / 2 + 2.2, (p.z + z) / 2, -a));
      }
      put(M.metal, new THREE.CylinderGeometry(0.8, 1.9, 74, 10), TRS(p.x + 34, p.y + 37, p.z));
      put(M.glow, new THREE.SphereGeometry(1.7, 12, 8), TRS(p.x + 34, p.y + 75, p.z));
      put(M.white, new THREE.SphereGeometry(10.5, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), TRS(p.x - 30, p.y + 15, p.z + 10, 0, -0.9));
      put(M.metal, new THREE.CylinderGeometry(0.9, 1.4, 13, 8), TRS(p.x - 30, p.y + 6.5, p.z + 10));
    },
    refinery: () => {
      const p = spot(330, 1100, 95); if (!p) return;
      for (let k = 0; k < 5; k++) {
        const a = rng() * Math.PI * 2, d = rng() * 58, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z), r = 9 + rng() * 7, h = 18 + rng() * 18;
        put(M.rust, new THREE.CylinderGeometry(r, r, h, 24), TRS(x, y + h / 2, z));
        put(M.rust, new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), TRS(x, y + h, z));
        put(M.metal, new THREE.TorusGeometry(r + 0.3, 0.35, 6, 24).rotateX(Math.PI / 2), TRS(x, y + h * 0.65, z));
      }
      // Spherical Horton-sphere pressurized methane tanks on stilt legs
      for (const sd of [-1, 1]) {
        const sx = p.x + sd * 48, sz = p.z - 28, sy = field.heightAt(sx, sz), sr = 12;
        put(M.white, new THREE.SphereGeometry(sr, 22, 16), TRS(sx, sy + sr + 6, sz));
        for (let l = 0; l < 4; l++) { const la = (l / 4) * Math.PI * 2; put(M.metal, new THREE.CylinderGeometry(0.6, 0.8, sr + 8, 8), TRS(sx + Math.cos(la) * sr * 0.78, sy + (sr + 6) / 2, sz + Math.sin(la) * sr * 0.78)); }
      }
      for (let k = 0; k < 3; k++) {
        const x = p.x - 40 + k * 24, z = p.z + 50, y = field.heightAt(x, z), h = 72 + rng() * 32;
        put(M.metal, new THREE.CylinderGeometry(2.1, 3.5, h, 14), TRS(x, y + h / 2, z));
        put(M.glow, new THREE.TorusGeometry(2.5, 0.55, 8, 16).rotateX(Math.PI / 2), TRS(x, y + h, z));
        emitters.push({ x, y: y + h + 2, z, type: 'smoke' }); smokes.push({ x, y: y + h + 1, z, kind: 'smoke', scale: 0.8 + rng() * 0.4 });
      }
      for (let k = 0; k < 5; k++) put(M.metal, new THREE.BoxGeometry(84, 2.1, 2.1), TRS(p.x, p.y + 6 + k * 3.2, p.z + 20, rng() * 3));
    },
    volcano: () => {
      const p = spot(800, 1600, 420); if (!p) return; const rb = 300 + rng() * 160, h = 235 + rng() * 145, rt = 56;
      const g = deform(new THREE.CylinderGeometry(rt, rb, h, 56, 14, true), 15, 0.02, rng() * 5); g.translate(0, h / 2, 0); put(M.rock, g, TRS(p.x, p.y - 10, p.z));
      put(M.glow, new THREE.CylinderGeometry(rt * 0.94, rt * 0.94, 3, 32), TRS(p.x, p.y - 12 + h, p.z));
      // Glowing molten lava channel spilling down the facing flank
      const la = p.yaw, len = Math.hypot(rb - rt, h); const tilt = Math.atan2(rb - rt, h);
      const mr = (rt + rb) * 0.5;
      put(M.glow, new THREE.BoxGeometry(9, len * 0.78, 2.5), TRS(p.x + Math.sin(la) * mr * 0.92, p.y + h * 0.52, p.z + Math.cos(la) * mr * 0.92, la, -tilt));
      emitters.push({ x: p.x, y: p.y + h, z: p.z, type: 'smoke' }); smokes.push({ x: p.x, y: p.y + h - 14, z: p.z, kind: 'ash', scale: 0.85 + rng() * 0.5 });
    },
    prisonTower: () => {
      const p = spot(280, 1200, 46); if (!p) return; const base = field.avgY - 160, h = 265 + rng() * 125;
      put(M.tower, new THREE.BoxGeometry(46, h, 46), TRS(p.x, base + h / 2, p.z, p.yaw));
      put(M.metal, new THREE.TorusGeometry(42, 3.2, 8, 32).rotateX(Math.PI / 2), TRS(p.x, base + h * 0.62, p.z));
      put(M.metal, new THREE.TorusGeometry(34, 2.4, 8, 32).rotateX(Math.PI / 2), TRS(p.x, base + h * 0.84, p.z));
      put(M.cyan, new THREE.TorusGeometry(42.5, 0.6, 6, 32).rotateX(Math.PI / 2), TRS(p.x, base + h * 0.62, p.z));
      put(M.metal, new THREE.CylinderGeometry(0.8, 1.8, 34, 8), TRS(p.x, base + h + 17, p.z));
      put(M.glow, new THREE.SphereGeometry(3.2, 12, 8), TRS(p.x, base + h + 35, p.z));
    },
    giantTree: () => {
      const p = spot(260, 1100, 82); if (!p) return; const h = 132 + rng() * 62;
      put(M.bark, deform(new THREE.CylinderGeometry(8.5, 17, h, 18, 8), 1.4, 0.08, 2), TRS(p.x, p.y + h / 2 - 4, p.z));
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + rng() * 0.3; put(M.bark, new THREE.CylinderGeometry(2.2, 6, 38, 8), TRS(p.x + Math.cos(a) * 16, p.y + 8, p.z + Math.sin(a) * 16, 0, Math.cos(a) * 0.68, Math.sin(a) * 0.68)); }
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + p.yaw; put(M.bark, new THREE.CylinderGeometry(2.5, 4.8, 42, 8), TRS(p.x + Math.cos(a) * 18, p.y + h - 16, p.z + Math.sin(a) * 18, 0, Math.cos(a) * 0.85, Math.sin(a) * 0.85)); }
      for (let k = 0; k < 9; k++) { const r = 28 + rng() * 28; put(M.leaf, deform(new THREE.IcosahedronGeometry(r, 2), r * 0.2, 0.06, k), TRS(p.x + (rng() - 0.5) * 76, p.y + h - 8 + rng() * 32, p.z + (rng() - 0.5) * 76, 0, 0, 0, 1, 0.62)); }
    },
    ruin: () => {
      // Yavin-IV style stepped jungle temple with moss ledges, grand staircase, summit sanctuary & twin braziers
      const p = spot(300, 1000, 76); if (!p) return;
      for (let k = 0; k < 6; k++) {
        const s = 86 - k * 12.5;
        put(M.stone, new THREE.BoxGeometry(s, 9, s), TRS(p.x, p.y + 4.5 + k * 9, p.z, p.yaw));
        if (k < 5) put(M.moss, new THREE.BoxGeometry(s + 0.8, 0.9, s + 0.8), TRS(p.x, p.y + 8.65 + k * 9, p.z, p.yaw));
      }
      // Summit sanctuary chamber + entry doorway
      put(M.stone, new THREE.BoxGeometry(22, 12, 18), TRS(p.x, p.y + 60, p.z, p.yaw));
      put(M.dark, new THREE.BoxGeometry(6, 8, 19), TRS(p.x, p.y + 58, p.z, p.yaw));
      // Grand staircase + twin balustrades + glowing entrance braziers
      const sx = Math.sin(p.yaw), cz = Math.cos(p.yaw);
      put(M.stone, new THREE.BoxGeometry(15, 6, 66), TRS(p.x + sx * 38, p.y + 24, p.z + cz * 38, p.yaw, -0.66));
      for (const sd of [-1, 1]) {
        const bx = p.x + sx * 56 + cz * sd * 12, bz = p.z + cz * 56 - sx * sd * 12, by = field.heightAt(bx, bz);
        put(M.stone, new THREE.CylinderGeometry(2.2, 2.8, 9, 8), TRS(bx, by + 4.5, bz));
        put(M.glow, new THREE.SphereGeometry(1.6, 10, 8), TRS(bx, by + 9.8, bz));
      }
    },
    crystalSpire: () => {
      const p = spot(260, 1200, 62); if (!p) return;
      for (let k = 0; k < 8; k++) {
        const r = 5.5 + rng() * 9.5, h = 58 + rng() * 118;
        const body = new THREE.CylinderGeometry(r * 0.72, r, h * 0.76, 6).translate(0, h * 0.38, 0);
        const tip = new THREE.ConeGeometry(r * 0.72, h * 0.24, 6).translate(0, h * 0.88, 0);
        const m = TRS(p.x + (rng() - 0.5) * 42, p.y - 4, p.z + (rng() - 0.5) * 42, rng() * 6, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
        put(M.crystal, body, m); put(M.crystal, tip, m);
      }
    },
    rig: () => {
      const p = spot(320, 1200, 65); if (!p) return; const deck = field.avgY + 40;
      for (const [dx, dz] of [[-19, -19], [19, -19], [-19, 19], [19, 19]]) { const y0 = field.heightAt(p.x + dx, p.z + dz); put(M.metal, new THREE.CylinderGeometry(2.5, 3.4, deck - y0, 12), TRS(p.x + dx, (deck + y0) / 2, p.z + dz)); }
      put(M.rust, new THREE.BoxGeometry(58, 8, 58), TRS(p.x, deck + 4, p.z, p.yaw));
      put(M.white, new THREE.BoxGeometry(20, 10, 16), TRS(p.x - 14, deck + 13, p.z - 10, p.yaw)); // crew quarters
      put(M.dark, new THREE.CylinderGeometry(11, 11, 1.2, 20), TRS(p.x - 18, deck + 9.5, p.z + 22)); // helipad
      put(M.cyan, new THREE.TorusGeometry(9.5, 0.35, 6, 24).rotateX(Math.PI / 2), TRS(p.x - 18, deck + 10.3, p.z + 22));
      put(M.metal, new THREE.CylinderGeometry(2.2, 6.5, 48, 4), TRS(p.x + 12, deck + 32, p.z, p.yaw + Math.PI / 4)); // lattice derrick
      put(M.rust, new THREE.BoxGeometry(54, 2.4, 2.4), TRS(p.x, deck + 50, p.z, p.yaw + 0.6));
      put(M.glow, new THREE.SphereGeometry(1.6, 10, 8), TRS(p.x + 12, deck + 57, p.z));
      smokes.push({ x: p.x + 12, y: deck + 58, z: p.z, kind: 'smoke', scale: 0.65 });
    },
    krayt: () => {
      const p = spot(260, 900, 72); if (!p) return; const L = 74 + rng() * 32; const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const pt = (t: number) => { const al = (t - 0.5) * L, off = Math.sin(t * Math.PI * 2.2) * 6.5; return [p.x + s * al + c * off, p.z + c * al - s * off]; };
      for (let i = 0; i <= 46; i++) {
        const t = i / 46; const [x, z] = pt(t); const y = field.heightAt(x, z); const r = 0.72 + Math.sin(t * Math.PI) * 1.15;
        put(M.bone, deform(new THREE.IcosahedronGeometry(r, 1), r * 0.25, 0.7, i), TRS(x, y + r * 0.22, z));
        if (i % 2 === 0 && t > 0.13 && t < 0.79) {
          const [x2, z2] = pt(t + 0.01); const yaw = Math.atan2(x2 - x, z2 - z); const rr = 2.6 + Math.sin(t * Math.PI) * 4.4;
          put(M.bone, new THREE.TorusGeometry(rr, 0.3 + rr * 0.03, 6, 16, Math.PI * 0.88), TRS(x, y - rr * 0.24, z, yaw, (rng() - 0.5) * 0.35, Math.PI * 0.075 + (rng() - 0.5) * 0.28));
        }
      }
      const [hx, hz] = pt(1.0), [hx2, hz2] = pt(0.97); const hy = field.heightAt(hx, hz), hyaw = Math.atan2(hx - hx2, hz - hz2);
      const skull = deform(new THREE.SphereGeometry(1, 16, 12), 0.16, 1.2, 3); skull.scale(1.75, 1.35, 3.8); put(M.bone, skull, TRS(hx, hy + 1.15, hz, hyaw, 0.15));
      for (const sd of [-1, 1]) put(M.bone, new THREE.ConeGeometry(0.48, 3.8, 7), TRS(hx + Math.cos(hyaw) * sd * 1.3, hy + 2.9, hz - Math.sin(hyaw) * sd * 1.3, hyaw, -0.62, sd * 0.32));
    },
    homestead: () => {
      const p = spot(320, 900, 62); if (!p) return;
      put(M.adobe, new THREE.TorusGeometry(15, 2.4, 10, 36).rotateX(Math.PI / 2), TRS(p.x, p.y + 0.7, p.z));
      put(M.adobeDark, new THREE.CylinderGeometry(13.5, 13.5, 1.2, 28), TRS(p.x, p.y - 0.3, p.z));
      const dx = p.x + 22, dz = p.z, dy = field.heightAt(dx, dz);
      put(M.adobe, new THREE.SphereGeometry(7, 22, 11, 0, Math.PI * 2, 0, Math.PI / 2), TRS(dx, dy - 0.3, dz));
      put(M.adobe, new THREE.CylinderGeometry(2.6, 2.6, 5, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), TRS(dx - 6.5, dy + 0.2, dz));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rng() * 0.5, d = 30 + rng() * 25, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = field.heightAt(x, z);
        put(M.metal, new THREE.CylinderGeometry(0.35, 0.55, 6.5, 10), TRS(x, y + 3.25, z));
        put(M.metal, new THREE.CylinderGeometry(1.0, 1.0, 0.22, 14), TRS(x, y + 4.4, z));
        put(M.metal, new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14), TRS(x, y + 5.5, z));
        put(M.metal, new THREE.BoxGeometry(0.12, 2.4, 0.8), TRS(x + 0.55, y + 3.2, z, a));
      }
      smokes.push({ x: p.x, y: p.y + 1, z: p.z, kind: 'steam', scale: 0.28 });
    },
    obelisks: () => {
      const p = spot(280, 900, 52); if (!p) return;
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2, x = p.x + Math.cos(a) * 32, z = p.z + Math.sin(a) * 32, h = 16 + rng() * 13, oy = field.heightAt(x, z);
        put(M.stone, deform(new THREE.CylinderGeometry(1.7, 2.5, h, 5, 6), 0.35, 0.3, k), TRS(x, oy + h / 2 - 1, z, a, (rng() - 0.5) * 0.22, (rng() - 0.5) * 0.22));
      }
      put(M.stone, new THREE.CylinderGeometry(7, 8, 2.2, 18), TRS(p.x, p.y + 0.6, p.z));
      put(M.cyan, new THREE.TorusGeometry(5.5, 0.22, 6, 24).rotateX(Math.PI / 2), TRS(p.x, p.y + 1.85, p.z));
    },
    lighthouse: () => {
      const p = spot(260, 800, 34); if (!p) return; const base = Math.max(p.y, field.avgY - 26);
      put(M.rock, deform(new THREE.IcosahedronGeometry(15, 2), 3.2, 0.1, 5), TRS(p.x, base - 5.5, p.z, 0, 0, 0, 1, 0.62));
      // Striped coastal tower (alternating white & crimson bands) + lantern gallery + cupola
      for (let b = 0; b < 5; b++) {
        const r0 = 3.8 - (b + 1) * 0.24, r1 = 3.8 - b * 0.24;
        put(b % 2 ? M.red : M.white, new THREE.CylinderGeometry(r0, r1, 7, 18), TRS(p.x, base + 3.5 + b * 7, p.z));
      }
      put(M.dark, new THREE.CylinderGeometry(3.4, 3.2, 1.3, 18), TRS(p.x, base + 35.6, p.z));
      put(M.glow, new THREE.CylinderGeometry(2.1, 2.1, 3.4, 14), TRS(p.x, base + 37.8, p.z));
      put(M.red, new THREE.ConeGeometry(2.6, 3.2, 16), TRS(p.x, base + 41, p.z));
    },
  };
  const id = theme.id; const rep = (n: number, f: () => void) => { for (let i = 0; i < n; i++) f(); };
  if (id === 'desert' || id === 'mesa') { if (['boonta', 'mosespa'].includes(td.def.id)) B.city(); rep(2, () => B.arch(M.rock)); rep(id === 'mesa' ? 7 : 5, () => B.butte(M.rock)); if (id === 'desert') { B.wreck(); B.homestead(); } B.krayt(); }
  else if (id === 'ice') { rep(2, () => B.arch(M.ice)); rep(2, B.station); rep(3, () => B.butte(M.rock)); B.wreck(); }
  else if (id === 'malastare') { rep(2, B.refinery); B.volcano(); rep(3, () => B.butte(M.rock)); B.obelisks(); }
  else if (id === 'lava') { rep(3, B.volcano); rep(3, () => B.butte(M.rock)); }
  else if (id === 'jungle') { rep(5, B.giantTree); rep(2, B.ruin); B.arch(M.rock); }
  else if (id === 'crystal') { rep(5, B.crystalSpire); rep(2, () => B.arch(M.rock)); }
  else if (prison) rep(5, B.prisonTower);
  else if (ocean) { rep(3, B.rig); B.arch(M.rock); rep(2, B.lighthouse); }

  for (const [mat, list] of buckets) {
    const g = mergeGeometries(list); list.forEach(x => x.dispose()); if (!g) continue;
    if (mat === rock) projectUV(g, 26);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; group.add(m); disp.push(g);
  }
  return placed;
}
