// ===== Session 16: sci-fi track dressing =====
//  - running edge light strips (whole track on the sci-fi worlds, inside tunnels on every world)
//  - holographic info panels on projector masts, hover beacons, energy conduits with glowing bands along the track
// Static merged / instanced geometry, animated purely in the shader (TSL `time`). ~6 draw calls.
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { Sample, TrackData } from './trackBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { attribute, dot, floor, fract, pow, sin, step, time, uv, vec2, vec3 } = TSL;
type Disp = { dispose: () => void }[];
export const SCIFI_THEMES = new Set(['oovo', 'aquilaris', 'malastare', 'city']);

export function addSciFi(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp) {
  const S = td.main.samples, N = td.N, closed = td.main.closed, sci = SCIFI_THEMES.has(theme.id);
  const glowC = new THREE.Color(theme.barrierColor);
  const nearStart = (i: number, d: number) => { let k = Math.abs(i - td.startIdx); if (closed) k = Math.min(k, N - k); return k < d; };
  const edgeY = (s: Sample, sd: number) => s.y + s.ramp - sd * s.hw * s.bank;

  // ---------- 1. running light strips along both road edges ----------
  {
    const pos: number[] = [], uvs: number[] = [], ind: number[] = [];
    for (const sd of [-1, 1]) {
      let prev = -1;
      for (let i = 0; i <= N; i += 2) {
        if (!closed && i >= N) break;
        const s = S[i % N], on = !s.gap && (sci || s.roof > 0);
        if (!on) { prev = -1; continue; }
        const base = pos.length / 3;
        for (const w of [-0.26, 0.26]) { const lat = sd * (s.hw - 0.8 + w); pos.push(s.x + s.rx * lat, s.y + s.ramp - lat * s.bank + 0.36, s.z + s.rz * lat); uvs.push(w > 0 ? 1 : 0, i * 2); }
        if (prev >= 0) { if (sd > 0) ind.push(prev, base, prev + 1, prev + 1, base, base + 1); else ind.push(prev, prev + 1, base, prev + 1, base + 1, base); }
        prev = base;
      }
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(ind); g.computeVertexNormals();
      const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
      const run = fract(uv().y.mul(1 / 28).sub(time.mul(1.5))); // a light pulse every 28 m, racing forward at ~42 m/s
      m.colorNode = vec3(glowC.r, glowC.g, glowC.b).mul(pow(run, 5.0).mul(2.4).add(0.55));
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; group.add(mesh); disp.push(g, m);
    }
  }
  if (!sci) return;

  // ---------- 2. holographic panels on projector masts + 3. hover beacons + 4. energy conduits ----------
  const sideFree = (s: Sample, sd: number) => (sd > 0 ? s.hR : s.hL) === 0 && !(sd > 0 ? s.openR : s.openL) && !s.gap && !(s.roof > 0) && !s.zeroG;
  const panels: THREE.BufferGeometry[] = [], solids: THREE.BufferGeometry[] = [], glows: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  let n = 0;
  for (let i = 70; i < N - 40; i += 88, n++) {
    const s = S[i]; let sd = n % 2 ? 1 : -1; if (!sideFree(s, sd)) sd = -sd; if (!sideFree(s, sd) || nearStart(i, 70)) continue;
    const lat = sd * ((sd > 0 ? s.wallR : s.wallL) + 6.5), cx = s.x + s.rx * lat, cz = s.z + s.rz * lat, y0 = edgeY(s, sd);
    // panel faces the oncoming pods, turned 20° towards the road
    q.setFromAxisAngle(up, Math.atan2(s.tx, s.tz) + Math.PI + sd * 0.35);
    const pg = new THREE.PlaneGeometry(8.4, 3.5); pg.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(4).fill(n * 7.3 + 1), 1));
    pg.applyQuaternion(q); pg.translate(cx, y0 + 9.4, cz); panels.push(pg);
    solids.push(new THREE.CylinderGeometry(0.16, 0.3, 9.2, 6).translate(cx, y0 + 3.2, cz), new THREE.BoxGeometry(1.6, 0.5, 1.6).translate(cx, y0 - 1.2, cz), new THREE.BoxGeometry(8.9, 0.14, 0.3).applyQuaternion(q).translate(cx, y0 + 7.55, cz));
    glows.push(new THREE.BoxGeometry(8.6, 0.06, 0.12).applyQuaternion(q).translate(cx, y0 + 7.68, cz));
  }
  // hover beacons: pairs of glowing orbs on thin antigrav stalks every ~50 m
  for (let i = 20; i < N - 10; i += 25) {
    const s = S[i]; if (nearStart(i, 30)) continue;
    for (const sd of [-1, 1]) {
      if (!sideFree(s, sd)) continue;
      const lat = sd * ((sd > 0 ? s.wallR : s.wallL) + 1.7), x = s.x + s.rx * lat, z = s.z + s.rz * lat, y = edgeY(s, sd);
      glows.push(new THREE.IcosahedronGeometry(0.34, 0).translate(x, y + 4.1, z), new THREE.TorusGeometry(0.62, 0.04, 4, 10).rotateX(Math.PI / 2).translate(x, y + 4.1, z));
      solids.push(new THREE.CylinderGeometry(0.05, 0.09, 2.6, 5).translate(x, y + 2.3, z));
    }
  }
  // energy conduits: a pipe run beside the track with brackets to the road edge and glowing coupling bands
  {
    const pos: number[] = [], ind: number[] = []; const R = 0.8, SEG = 8;
    for (const sd of [-1, 1]) {
      let prev = -1, runLen = 0;
      for (let i = 60; i < N - 30; i += 3) {
        const s = S[i], zone = Math.floor(i / 260) % 2 === (sd > 0 ? 0 : 1); // alternate sides every ~520 m
        if (!zone || !sideFree(s, sd) || nearStart(i, 80)) { prev = -1; runLen = 0; continue; }
        const lat = sd * ((sd > 0 ? s.wallR : s.wallL) + 4.3), cx = s.x + s.rx * lat, cz = s.z + s.rz * lat, cy = edgeY(s, sd) + 1.5, base = pos.length / 3;
        for (let a = 0; a < SEG; a++) { const an = a / SEG * Math.PI * 2, c = Math.cos(an) * R, d = Math.sin(an) * R; pos.push(cx + s.rx * c, cy + d, cz + s.rz * c); }
        if (prev >= 0) for (let a = 0; a < SEG; a++) { const b = (a + 1) % SEG; if (sd > 0) ind.push(prev + a, prev + b, base + a, prev + b, base + b, base + a); else ind.push(prev + a, base + a, prev + b, prev + b, base + a, base + b); }
        prev = base; runLen++;
        if (runLen % 4 === 1) { // bracket to the road edge + glowing coupling band
          q.setFromAxisAngle(up, Math.atan2(s.tx, s.tz));
          solids.push(new THREE.BoxGeometry(3.6, 0.28, 0.4).applyQuaternion(q).translate(cx - s.rx * sd * 2.0, cy - 0.5, cz - s.rz * sd * 2.0));
          glows.push(new THREE.TorusGeometry(R + 0.08, 0.09, 5, 12).applyQuaternion(q).translate(cx, cy, cz));
        }
      }
    }
    if (ind.length) { const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(ind); pg.computeVertexNormals(); const g2 = pg.toNonIndexed(); pg.dispose(); g2.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2)); solids.push(g2); }
  }
  const addM = (list: THREE.BufferGeometry[], mat: THREE.Material, order = 0) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map(x => { const y = x.index ? x.toNonIndexed() : x; if (y !== x) x.dispose(); return y; }), false); list.forEach(x => x.dispose()); if (!g) return;
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = order; group.add(mesh); disp.push(g);
  };
  const metal = new THREE.MeshStandardMaterial({ color: '#4c535e', metalness: 0.86, roughness: 0.36 });
  const glow = new THREE.MeshBasicMaterial({ color: glowC.clone().multiplyScalar(1.7) });
  const holo = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  {
    const u = uv(), seed = attribute('aSeed', 'float');
    const cell = floor(u.mul(vec2(16.0, 6.0))), h = fract(sin(dot(cell.add(seed), vec2(127.1, 311.7))).mul(43758.5453));
    const lit = step(0.5, fract(h.add(floor(time.mul(1.6).add(seed)).mul(0.37))));                       // glyph blocks switching
    const gaps = step(0.14, fract(u.x.mul(16.0))).mul(step(0.24, fract(u.y.mul(6.0))));
    const inside = step(0.04, u.x).mul(step(u.x, 0.96)).mul(step(0.09, u.y)).mul(step(u.y, 0.91));
    const scan = sin(u.y.mul(120.0).add(time.mul(7.0))).mul(0.2).add(0.8);
    const flick = step(0.04, fract(sin(floor(time.mul(11.0)).add(seed)).mul(917.3))).mul(0.35).add(0.65);
    holo.colorNode = vec3(glowC.r, glowC.g, glowC.b).mul(1.25).add(vec3(0.25));
    holo.opacityNode = lit.mul(gaps).mul(inside).mul(0.5).add(inside.oneMinus().mul(0.85)).add(0.07).mul(scan).mul(flick);
  }
  disp.push(metal, glow, holo);
  addM(solids, metal); addM(glows, glow); addM(panels, holo, 3);
}
