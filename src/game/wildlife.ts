import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { TerrainField } from './terrain';
import type { TrackData } from './trackBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, attribute, clamp, cos, float, hash, instanceIndex, max, oneMinus, positionGeometry, positionLocal, sin, smoothstep, step, time, vec3, vertexColor } = TSL;

/**
 * Life in the landscape: bird flocks (soaring raptors, gulls, bats, glowing moths), grazing herds (bantha-like),
 * long-necked giants, sand crawlers, landspeeders, sky traffic / patrol ships and hover barges.
 * Instanced per type; CPU moves the instances (few hundred), the GPU animates legs, necks and wings (TSL positionNode).
 * Vertex colours > 1 glow (engines, moth wings).
 */
type Disp = { dispose: () => void }[];
type RGB = [number, number, number];
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const rgb = (s: string, k = 1): RGB => { const c = new THREE.Color(s); return [c.r * k, c.g * k, c.b * k]; };
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** part with vertex colour + animation channel (0 static, 1/2 leg pairs, 3 neck/head, signed wing weight for birds) */
function part(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, col: RGB, anim: number | ((x: number, y: number, z: number) => number) = 0) {
  const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose();
  if (m) ng.applyMatrix4(m);
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  if (!ng.attributes.normal) ng.computeVertexNormals();
  const p = ng.attributes.position as THREE.BufferAttribute; const c = new Float32Array(p.count * 3), a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; a[i] = typeof anim === 'function' ? anim(p.getX(i), p.getY(i), p.getZ(i)) : anim; }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); ng.setAttribute('aAnim', new THREE.BufferAttribute(a, 1));
  return ng;
}
const merge = (list: THREE.BufferGeometry[]) => { const g = mergeGeometries(list)!; list.forEach(x => x.dispose()); g.computeBoundingSphere(); return g; };
function shaggy(g: THREE.BufferGeometry, amp: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + Math.sin(x * 13 + z * 3) * Math.sin(y * 11) * Math.sin(z * 9) * amp; p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ models (face +Z)
function bantha(fur: RGB, horn: RGB) {
  const dark: RGB = [fur[0] * 0.6, fur[1] * 0.6, fur[2] * 0.6]; const L: THREE.BufferGeometry[] = [];
  L.push(part(shaggy(new THREE.SphereGeometry(1, 16, 12), 0.07), M(0, 2.05, 0, 0, 0, 0, 1.25, 1.1, 1.95), fur));
  L.push(part(shaggy(new THREE.SphereGeometry(1, 12, 10), 0.06), M(0, 2.6, -0.3, 0, 0, 0, 1.0, 0.7, 1.2), fur));
  L.push(part(new THREE.SphereGeometry(0.62, 12, 10), M(0, 2.3, 2.05, 0, 0, 0, 0.9, 1, 1.2), fur));
  for (const sd of [-1, 1]) L.push(part(new THREE.TorusGeometry(0.42, 0.11, 6, 12, Math.PI * 1.45), M(sd * 0.52, 2.5, 1.9, 0, sd * Math.PI / 2, sd * 0.6), horn));
  for (const [x, z, a] of [[-0.62, 1.05, 1], [0.62, 1.05, 2], [-0.62, -1.15, 2], [0.62, -1.15, 1]]) L.push(part(new THREE.CylinderGeometry(0.26, 0.21, 1.55, 7), M(x, 0.78, z), dark, a));
  L.push(part(new THREE.CylinderGeometry(0.06, 0.12, 0.9, 5), M(0, 1.8, -2.1, 0.9, 0, 0), dark));
  return merge(L);
}
function giant(skin: RGB) {
  const belly: RGB = [skin[0] * 1.25, skin[1] * 1.2, skin[2] * 1.1]; const L: THREE.BufferGeometry[] = [];
  L.push(part(new THREE.SphereGeometry(1, 18, 12), M(0, 7, 0, 0, 0, 0, 2.6, 2.4, 4.6), skin));
  L.push(part(new THREE.SphereGeometry(1, 12, 8), M(0, 5.6, 0, 0, 0, 0, 2.0, 1.2, 3.6), belly));
  for (const [x, z, a] of [[-1.7, 2.8, 1], [1.7, 2.8, 2], [-1.7, -2.8, 2], [1.7, -2.8, 1]]) L.push(part(new THREE.CylinderGeometry(0.75, 0.65, 6.5, 8), M(x, 3.25, z), skin, a));
  const neck = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 8, 3.5), new THREE.Vector3(0, 13, 6.5), new THREE.Vector3(0, 17, 8.5)]), 12, 0.8, 8);
  L.push(part(neck, null, skin, 3)); L.push(part(new THREE.SphereGeometry(0.9, 10, 8), M(0, 17.3, 9.4, 0, 0, 0, 0.8, 0.7, 1.3), skin, 3));
  L.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 7.5, -4.2), new THREE.Vector3(0, 6, -8), new THREE.Vector3(0, 4.2, -11.5)]), 10, 0.5, 6), null, skin));
  return merge(L);
}
function bird(col: RGB, span: number) {
  const pos = [0, 0, 0.18, 0, 0, -0.16, -span, 0, -0.06, 0, 0, 0.18, -span, 0, -0.06, 0, 0, -0.16]; // left wing (both faces)
  const right = pos.map((v, i) => (i % 3 === 0 ? -v : v));
  const tail = [0, 0, -0.14, -0.14, 0, -0.42, 0.14, 0, -0.42];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...pos, ...right, ...tail], 3)); g.computeVertexNormals();
  return merge([part(g, null, col, (x: number) => x / span), part(new THREE.OctahedronGeometry(1, 0), M(0, 0, 0, 0, 0, 0, 0.09 * span, 0.08 * span, 0.32 * span), col)]);
}
function speeder() {
  const hull: RGB = [0.9, 0.86, 0.78], dark: RGB = [0.14, 0.16, 0.2], metal: RGB = [0.5, 0.5, 0.53], glow: RGB = [2.6, 1.6, 0.9];
  return merge([
    part(new THREE.BoxGeometry(1.5, 0.45, 3.0), M(0, 0.35, 0.1), hull), part(new THREE.CylinderGeometry(0.3, 0.75, 1.2, 4), M(0, 0.35, 2.15, Math.PI / 2, Math.PI / 4, 0), hull),
    part(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0, 0.55, -0.1, 0, 0, 0, 1, 0.6, 1.4), dark),
    ...[-0.68, 0.68].flatMap(x => [part(new THREE.CylinderGeometry(0.28, 0.32, 1.5, 10), M(x, 0.55, -1.35, Math.PI / 2), metal), part(new THREE.CircleGeometry(0.24, 10), M(x, 0.55, -2.12, 0, Math.PI), glow)]),
  ]);
}
function crawler() {
  const rust: RGB = [0.4, 0.29, 0.21], tread: RGB = [0.16, 0.15, 0.14];
  const sh = new THREE.Shape([new THREE.Vector2(15, 2.5), new THREE.Vector2(-15, 2.5), new THREE.Vector2(-15, 7), new THREE.Vector2(-10, 17), new THREE.Vector2(13, 17), new THREE.Vector2(15, 14)]);
  const body = new THREE.ExtrudeGeometry(sh, { depth: 16, bevelEnabled: false }); body.translate(0, 0, -8); body.rotateY(Math.PI / 2);
  return merge([part(body, null, rust), ...[[-6.5, 9], [6.5, 9], [-6.5, -9], [6.5, -9]].map(([x, z]) => part(new THREE.BoxGeometry(4.5, 3, 9), M(x, 1.5, z), tread)), part(new THREE.BoxGeometry(10, 1.2, 2), M(0, 12, 15.2), [0.1, 0.1, 0.1]), ...[-8.05, 8.05].map(x => part(new THREE.BoxGeometry(0.3, 1.0, 22), M(x, 11, 0), [0.08, 0.08, 0.08])), part(new THREE.BoxGeometry(14, 0.6, 26), M(0, 17.3, -1), [0.3, 0.22, 0.17])]);
}
function flyer(hullC: RGB) {
  const dark: RGB = [0.1, 0.13, 0.18], glow: RGB = [2.6, 1.7, 1.0];
  return merge([
    part(new THREE.CylinderGeometry(0.5, 1.4, 9, 10), M(0, 0, 0, Math.PI / 2), hullC), part(new THREE.SphereGeometry(0.8, 10, 8), M(0, 0.6, 2.4, 0, 0, 0, 0.8, 0.6, 1.6), dark),
    part(new THREE.BoxGeometry(12, 0.25, 2.8), M(0, -0.2, -1.2), [hullC[0] * 0.85, hullC[1] * 0.85, hullC[2] * 0.85]), part(new THREE.BoxGeometry(0.2, 2.2, 2.0), M(0, 1.2, -3.6), hullC),
    part(new THREE.CircleGeometry(1.1, 12), M(0, 0, -4.55, 0, Math.PI), glow),
  ]);
}
function barge() {
  return merge([part(new THREE.BoxGeometry(5, 1.2, 14), M(0, 0.6, 0), [0.5, 0.46, 0.42]), part(new THREE.BoxGeometry(3.5, 2.2, 4), M(0, 2.3, -3), [0.86, 0.82, 0.75]), part(new THREE.CylinderGeometry(0.12, 0.12, 5), M(0, 4.6, -3), [0.4, 0.4, 0.4]), part(new THREE.SphereGeometry(0.25, 8, 6), M(0, 7.2, -3), [2.4, 0.6, 0.4])]);
}

// ------------------------------------------------------------------ materials
function lifeMat(kind: 'walker' | 'bird' | 'hover' | 'static', o: { speed?: number; hip?: number; amp?: number; soar?: boolean; neckBase?: number; side?: THREE.Side } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, side: o.side ?? THREE.FrontSide }); mat.roughness = 0.8; mat.metalness = 0.05;
  const a = attribute('aAnim', 'float'); const ph = hash(instanceIndex).mul(6.2832);
  if (kind === 'walker') {
    const hip = o.hip ?? 1.55; const tt = time.mul(o.speed ?? 3).add(ph); const legW = clamp(oneMinus(positionGeometry.y.div(hip)), 0, 1);
    const isA = step(0.5, a).mul(step(a, 1.5)), isB = step(1.5, a).mul(step(a, 2.5)), isN = step(2.5, a);
    const lift = max(sin(tt), 0).mul(isA).add(max(sin(tt.add(Math.PI)), 0).mul(isB)).mul(legW).mul(o.amp ?? 0.3);
    const nW = clamp(positionGeometry.y.sub(o.neckBase ?? 8).div(9), 0, 1).mul(isN);
    mat.positionNode = positionLocal.add(vec3(sin(tt.mul(0.23)).mul(nW).mul(0.9), lift.add(sin(tt.mul(2)).mul(0.04 * hip)), cos(tt.mul(0.19)).mul(nW).mul(0.6)));
  } else if (kind === 'bird') {
    const gate = o.soar ? smoothstep(-0.3, 0.5, sin(time.mul(0.55).add(ph))).mul(0.85).add(0.15) : float(1);
    mat.positionNode = positionLocal.add(vec3(0, sin(time.mul(o.speed ?? 10).add(ph.mul(3))).mul(abs(a)).mul(o.amp ?? 0.5).mul(gate), 0));
  } else if (kind === 'hover') mat.positionNode = positionLocal.add(vec3(0, sin(time.mul(2.1).add(ph)).mul(o.amp ?? 0.12), 0));
  mat.emissiveNode = max(vertexColor().sub(1.0), 0.0).mul(1.4);
  return mat;
}

interface LifeCfg {
  birds?: { flocks: number; size: number; color: string; span: number; soar: boolean; alt: [number, number]; glow?: boolean };
  herds?: { n: number; size: number; fur: string; horn: string; scale: number };
  giants?: { n: number; skin: string }; speeders?: number; crawlers?: number; flyers?: number; barges?: number; patrol?: boolean;
}
const LIFE: Record<string, LifeCfg> = {
  desert: { birds: { flocks: 4, size: 5, color: '#2e221a', span: 1.6, soar: true, alt: [30, 110] }, herds: { n: 3, size: 8, fur: '#5c4130', horn: '#d8ccb0', scale: 1 }, speeders: 4, crawlers: 1, flyers: 3 },
  ice: { birds: { flocks: 3, size: 9, color: '#e8eef4', span: 0.8, soar: false, alt: [20, 70] }, herds: { n: 2, size: 7, fur: '#c8ccd2', horn: '#6a6258', scale: 1.15 }, speeders: 3, flyers: 2 },
  jungle: { birds: { flocks: 5, size: 11, color: '#c84a30', span: 0.7, soar: false, alt: [15, 60] }, herds: { n: 2, size: 8, fur: '#6a5638', horn: '#e0d4b8', scale: 0.9 }, giants: { n: 4, skin: '#6a7a5a' }, flyers: 2 },
  malastare: { birds: { flocks: 3, size: 10, color: '#24261c', span: 0.9, soar: false, alt: [20, 80] }, herds: { n: 2, size: 6, fur: '#4a4a36', horn: '#b8b090', scale: 1.1 }, giants: { n: 3, skin: '#5a6048' }, speeders: 3, flyers: 3 },
  lava: { birds: { flocks: 2, size: 6, color: '#181210', span: 1.4, soar: true, alt: [40, 140] }, flyers: 3 },
  crystal: { birds: { flocks: 4, size: 12, color: '#d8a0ff', span: 0.35, soar: false, alt: [6, 30], glow: true }, flyers: 2 },
  aquilaris: { birds: { flocks: 5, size: 8, color: '#f2f2f0', span: 1.0, soar: true, alt: [15, 70] }, barges: 5, flyers: 3 },
  oovo: { flyers: 6, patrol: true },
};
LIFE.mesa = { ...LIFE.desert, herds: { n: 3, size: 7, fur: '#6a3e2a', horn: '#e0d0b8', scale: 1 } };

export function buildLife(td: TrackData, theme: ThemeDef, field: TerrainField, waterY: number, rng: () => number, group: THREE.Group, disp: Disp, detail: number) {
  const cfg = LIFE[theme.id]; const ups: ((t: number, dt: number) => void)[] = [];
  let lastT = -1, frame = 0;
  const update = (t: number) => { const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t; frame++; for (const f of ups) f(t, dt); };
  if (!cfg) return { update, count: 0 };
  const S = td.main.samples, N = S.length; const b = td.bounds; const cx0 = (b.minX + b.maxX) / 2, cz0 = (b.minZ + b.maxZ) / 2;
  const avgY = S.reduce((a, s) => a + s.y, 0) / N; const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(0, 0, 0, 'YXZ'), tv = new THREE.Vector3(), ts = new THREE.Vector3();
  const setM = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, s: number) => { te.set(pitch, yaw, roll); tq.setFromEuler(te); im.setMatrixAt(i, tm.compose(tv.set(x, y, z), tq, ts.set(s, s, s))); };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow: boolean) => {
    const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color().setScalar(0.82 + rng() * 0.3));
    group.add(im); disp.push(geo, mat); return im;
  };
  /** open ground: a circle of radius R whose rim keeps `clear` metres from every road and stays above water */
  const openCircle = (minD: number, maxD: number, R: number, clear: number) => {
    for (let t = 0; t < 60; t++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const d = minD + rng() * (maxD - minD);
      const x = s.x + s.rx * side * (s.hw + d + R), z = s.z + s.rz * side * (s.hw + d + R); let ok = true;
      for (let k = 0; k < 10 && ok; k++) { const a = (k / 10) * Math.PI * 2; const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; if (field.distToTrack(px, pz) < clear || field.heightAt(px, pz) < waterY + 1) ok = false; }
      if (ok) return { x, z };
    }
    return null;
  };
  let count = 0;

  // ---- birds ----
  if (cfg.birds) {
    const B = cfg.birds; const col = rgb(B.color, B.glow ? 2.2 : 1);
    const flocks: { x: number; z: number; y: number; r: number; w: number; n: number; off: number[] }[] = [];
    for (let f = 0; f < Math.max(1, Math.round(B.flocks * detail)); f++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const d = 30 + rng() * 380; const x = s.x + s.rx * side * (s.hw + d), z = s.z + s.rz * side * (s.hw + d);
      const r = 18 + rng() * 70; const speed = B.soar ? 9 + rng() * 5 : 12 + rng() * 6;
      flocks.push({ x, z, y: Math.max(field.heightAt(x, z), waterY) + B.alt[0] + rng() * (B.alt[1] - B.alt[0]), r, w: (speed / r) * (rng() < 0.5 ? -1 : 1), n: B.size, off: Array.from({ length: B.size * 3 }, () => rng()) });
    }
    const n = flocks.reduce((a, f) => a + f.n, 0);
    const im = inst(bird(col, B.span), lifeMat('bird', { speed: B.soar ? 7 : 13, amp: B.span * 0.45, soar: B.soar, side: THREE.DoubleSide }), n, false);
    ups.push(t => {
      let i = 0;
      for (const f of flocks) for (let k = 0; k < f.n; k++) {
        const o = f.off; const a = f.w * t + o[k * 3] * (B.soar ? 6.28 : 1.4); const rr = f.r * (B.soar ? 0.6 + o[k * 3 + 1] * 0.8 : 0.85 + o[k * 3 + 1] * 0.3);
        const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr, y = f.y + Math.sin(t * 0.4 + o[k * 3 + 2] * 6) * 4 + o[k * 3 + 2] * 10;
        const dir = f.w > 0 ? 1 : -1; const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
        setM(im, i++, x, y, z, yaw, 0, -dir * (B.soar ? 0.35 : 0.2), 1);
      }
      im.instanceMatrix.needsUpdate = true;
    });
    count += n;
  }

  // ---- herds ----
  if (cfg.herds) {
    const H = cfg.herds; const herds: { cx: number; cz: number; r: number; a: number; w: number; m: { ox: number; oz: number; y: number; s: number; ph: number }[] }[] = [];
    for (let h = 0; h < Math.max(1, Math.round(H.n * detail)); h++) {
      const r = 50 + rng() * 110; const c = openCircle(60, 520, r + 18, 26); if (!c) continue;
      const m = Array.from({ length: H.size }, () => ({ ox: (rng() - 0.5) * 22, oz: (rng() - 0.5) * 26, y: 0, s: H.scale * (0.8 + rng() * 0.4), ph: rng() * 6 }));
      herds.push({ cx: c.x, cz: c.z, r, a: rng() * 6.28, w: ((1.2 + rng() * 0.8) / r) * (rng() < 0.5 ? -1 : 1), m });
    }
    const n = herds.reduce((a, h) => a + h.m.length, 0);
    if (n) {
      const im = inst(bantha(rgb(H.fur), rgb(H.horn)), lifeMat('walker', { speed: 2.6, hip: 1.55, amp: 0.28 }), n, true);
      herds.forEach(h => h.m.forEach(mm => { mm.y = field.heightAt(h.cx + Math.cos(h.a) * h.r, h.cz + Math.sin(h.a) * h.r); }));
      ups.push((_t, dt) => {
        let i = 0;
        for (const h of herds) {
          h.a += h.w * dt; const hx = h.cx + Math.cos(h.a) * h.r, hz = h.cz + Math.sin(h.a) * h.r; const dir = h.w > 0 ? 1 : -1;
          const fx = -Math.sin(h.a) * dir, fz = Math.cos(h.a) * dir; const yaw = Math.atan2(fx, fz);
          h.m.forEach((mm, k) => {
            const x = hx + fz * mm.ox + fx * mm.oz, z = hz - fx * mm.ox + fz * mm.oz;
            if ((frame + k) % 8 === 0) mm.y = field.heightAt(x, z);
            setM(im, i++, x, mm.y - 0.05, z, yaw + Math.sin(_t * 0.2 + mm.ph) * 0.25, 0, 0, mm.s);
          });
        }
        im.instanceMatrix.needsUpdate = true;
      });
      count += n;
    }
  }

  // ---- long-necked giants ----
  if (cfg.giants) {
    const G: { cx: number; cz: number; r: number; a: number; w: number; y: number; s: number }[] = [];
    for (let k = 0; k < Math.max(1, Math.round(cfg.giants.n * detail)); k++) { const r = 70 + rng() * 140; const c = openCircle(250, 900, r + 20, 40); if (c) G.push({ cx: c.x, cz: c.z, r, a: rng() * 6.28, w: ((0.9 + rng() * 0.5) / r) * (rng() < 0.5 ? -1 : 1), y: 0, s: 0.9 + rng() * 0.4 }); }
    if (G.length) {
      const im = inst(giant(rgb(cfg.giants.skin)), lifeMat('walker', { speed: 1.1, hip: 6.5, amp: 0.9, neckBase: 8 }), G.length, true);
      ups.push((_t, dt) => {
        G.forEach((g, i) => { g.a += g.w * dt; const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r; const dir = g.w > 0 ? 1 : -1; if ((frame + i) % 10 === 0 || g.y === 0) g.y = field.heightAt(x, z); setM(im, i, x, g.y - 0.2, z, Math.atan2(-Math.sin(g.a) * dir, Math.cos(g.a) * dir), 0, 0, g.s); });
        im.instanceMatrix.needsUpdate = true;
      });
      count += G.length;
    }
  }

  // ---- ground vehicles: crawlers (slow) and landspeeders (fast loops) ----
  const ground = (n: number, model: THREE.BufferGeometry, mat: THREE.Material, R: [number, number], v: [number, number], hover: number, minD: number, maxD: number, shadow: boolean, every: number) => {
    const L: { cx: number; cz: number; r: number; a: number; w: number; y: number }[] = [];
    for (let k = 0; k < n; k++) { const r = R[0] + rng() * (R[1] - R[0]); const c = openCircle(minD, maxD, r + 10, 14); if (c) L.push({ cx: c.x, cz: c.z, r, a: rng() * 6.28, w: ((v[0] + rng() * (v[1] - v[0])) / r) * (rng() < 0.5 ? -1 : 1), y: 0 }); }
    if (!L.length) { model.dispose(); mat.dispose(); return; }
    const im = inst(model, mat, L.length, shadow);
    ups.push((_t, dt) => {
      L.forEach((o, i) => {
        o.a += o.w * dt; const x = o.cx + Math.cos(o.a) * o.r, z = o.cz + Math.sin(o.a) * o.r; const dir = o.w > 0 ? 1 : -1;
        if ((frame + i) % every === 0 || o.y === 0) { const ny = field.heightAt(x, z); o.y = o.y === 0 ? ny : o.y + (ny - o.y) * 0.5; }
        setM(im, i, x, o.y + hover, z, Math.atan2(-Math.sin(o.a) * dir, Math.cos(o.a) * dir), 0, -dir * Math.min(0.35, Math.abs(o.w) * o.r * 0.006), 1);
      });
      im.instanceMatrix.needsUpdate = true;
    });
    count += L.length;
  };
  if (cfg.crawlers) ground(cfg.crawlers, crawler(), lifeMat('static'), [260, 520], [2, 3], 0, 300, 900, true, 12);
  if (cfg.speeders) ground(Math.round(cfg.speeders * detail), speeder(), lifeMat('hover', { amp: 0.15 }), [140, 380], [32, 52], 1.3, 60, 600, true, 1);

  // ---- barges on the water ----
  if (cfg.barges && waterY > -1e8) {
    const L: { cx: number; cz: number; r: number; a: number; w: number }[] = [];
    for (let k = 0; k < cfg.barges; k++) { const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const d = 80 + rng() * 500; const r = 60 + rng() * 200; L.push({ cx: s.x + s.rx * side * (s.hw + d), cz: s.z + s.rz * side * (s.hw + d), r, a: rng() * 6.28, w: ((8 + rng() * 6) / r) * (rng() < 0.5 ? -1 : 1) }); }
    const im = inst(barge(), lifeMat('hover', { amp: 0.2 }), L.length, true);
    ups.push((_t, dt) => { L.forEach((o, i) => { o.a += o.w * dt; const dir = o.w > 0 ? 1 : -1; setM(im, i, o.cx + Math.cos(o.a) * o.r, waterY + 0.4, o.cz + Math.sin(o.a) * o.r, Math.atan2(-Math.sin(o.a) * dir, Math.cos(o.a) * dir), 0, 0, 1); }); im.instanceMatrix.needsUpdate = true; });
    count += L.length;
  }

  // ---- sky traffic / patrol ships ----
  if (cfg.flyers) {
    const F: { r: number; a: number; w: number; y: number; cx: number; cz: number }[] = [];
    for (let k = 0; k < cfg.flyers; k++) {
      const r = cfg.patrol ? 200 + rng() * 500 : span * (0.5 + rng() * 0.6) + 600; const v = cfg.patrol ? 45 + rng() * 25 : 70 + rng() * 40;
      F.push({ r, a: rng() * 6.28, w: (v / r) * (rng() < 0.5 ? -1 : 1), y: avgY + (cfg.patrol ? 30 + rng() * 120 : 160 + rng() * 280), cx: cx0 + (rng() - 0.5) * span * 0.3, cz: cz0 + (rng() - 0.5) * span * 0.3 });
    }
    const im = inst(flyer(cfg.patrol ? [0.32, 0.34, 0.38] : [0.82, 0.82, 0.86]), lifeMat('static'), F.length, false);
    ups.push((t, dt) => { F.forEach((o, i) => { o.a += o.w * dt; const dir = o.w > 0 ? 1 : -1; setM(im, i, o.cx + Math.cos(o.a) * o.r, o.y + Math.sin(t * 0.3 + i) * 6, o.cz + Math.sin(o.a) * o.r, Math.atan2(-Math.sin(o.a) * dir, Math.cos(o.a) * dir), 0, -dir * 0.3, 1); }); im.instanceMatrix.needsUpdate = true; });
    count += F.length;
  }
  void h2;
  return { update, count };
}
