import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { PodState } from './physics';
import { gateDrop, gateWarn, nearestOnPath, rotorAngle, type Obstacle, type TrackData } from './trackBuilder';

/**
 * Dynamic set pieces (visuals + state). Collision lives in physics.ts (collideSetPieces) and reads the same state:
 *  - rotor: rotating hazard-striped arms on a pylon, one wide and one narrow lane
 *  - gate:  gantry with three portcullis sections that drop in sequence (amber warning → red)
 *  - arch:  rock arch that collapses when the leader approaches (lap 2 on circuits); boulders become obstacles
 */
export interface SetPieceFx { type: 'dust' | 'collapse'; x: number; y: number; z: number; strength: number; }
type Disp = { dispose: () => void }[];
type Fn = (t: number, rt: number, pods: PodState[], dt: number, frozen: boolean, fx: SetPieceFx[]) => void;

function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function hazardTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d')!;
  c.fillStyle = '#d9a514'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#121212';
  for (let i = -128; i < 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 16, 0); c.lineTo(i + 16 - 128, 128); c.lineTo(i - 128, 128); c.fill(); }
  c.fillStyle = 'rgba(40,30,20,0.35)'; for (let i = 0; i < 200; i++) c.fillRect(h2(i, 1) * 128, h2(i, 2) * 128, 1 + h2(i, 3) * 6, 1 + h2(i, 4) * 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); t.anisotropy = 8; return t;
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };
const merged = (list: THREE.BufferGeometry[]) => { const g = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x))); list.forEach(x => x.dispose()); return g!; };

export function buildSetPieces(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, rockMat: THREE.Material) {
  const S = td.main.samples, N = S.length; const fns: Fn[] = [];
  if (!td.setPieces.length) return { update: (): SetPieceFx[] => [] };
  const metal = new THREE.MeshStandardMaterial({ color: '#6c717b', metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.7, roughness: 0.5 });
  const tex = hazardTex(); const hazard = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.2) });
  disp.push(metal, dark, tex, hazard, glow);
  const RED = new THREE.Color('#ff2a18').multiplyScalar(1.4), AMBER = new THREE.Color('#ffb020').multiplyScalar(1.3), GREEN = new THREE.Color('#30ff60'), OFF = new THREE.Color('#201008');

  for (const sp of td.setPieces) {
    const s = S[sp.idx]; const yaw = Math.atan2(s.tx, s.tz);
    if (sp.type === 'rotor') {
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); group.add(root);
      root.add(mesh(merged([new THREE.CylinderGeometry(2.8, 3.4, 0.8, 24).translate(0, 0.4, 0), new THREE.CylinderGeometry(1.5, 1.8, 7.5, 20).translate(0, 3.75, 0), new THREE.TorusGeometry(2.0, 0.25, 8, 24).rotateX(Math.PI / 2).translate(0, 0.9, 0)]), metal));
      root.add(mesh(new THREE.SphereGeometry(0.5, 12, 8).translate(0, 7.8, 0), glow, false));
      const rot = new THREE.Group(); root.add(rot);
      rot.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.8, 20).translate(0, 2.0, 0), dark));
      const len = sp.armLen - 1.6;
      for (let k = 0; k < sp.arms; k++) {
        const arm = new THREE.Group(); arm.rotation.y = -(k / sp.arms) * Math.PI * 2; rot.add(arm);
        arm.add(mesh(new THREE.BoxGeometry(len, 2.6, 1.4).translate(1.6 + len / 2, 1.9, 0), hazard));
        arm.add(mesh(new THREE.BoxGeometry(1.2, 3.4, 1.9).translate(sp.armLen - 0.6, 1.9, 0), dark));
        arm.add(mesh(new THREE.SphereGeometry(0.42, 10, 8).translate(sp.armLen - 0.6, 3.85, 0), glow, false));
      }
      fns.push((_t, rt) => { rot.rotation.y = -rotorAngle(sp, rt); });
    } else if (sp.type === 'gate') {
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); root.rotation.y = yaw; group.add(root);
      const span = Math.max(s.wallL, s.wallR) + 1.8; const w3 = (2 * sp.hw) / 3;
      const frame: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) { frame.push(new THREE.BoxGeometry(2.4, 23, 2.4).translate(sd * span, 11.5 - 1.5, 0), new THREE.BoxGeometry(3.6, 1.2, 3.6).translate(sd * span, -1.2, 0)); }
      frame.push(new THREE.BoxGeometry(2 * span + 2.4, 1.6, 2.6).translate(0, 20.6, 0), new THREE.BoxGeometry(2 * span + 2.4, 0.8, 1.2).translate(0, 18.4, 0));
      for (let k = 1; k < 3; k++) frame.push(new THREE.BoxGeometry(0.9, 12, 0.9).translate(-(-sp.hw + k * w3), 13.5, -1.2)); // guide rails between sections
      root.add(mesh(merged(frame), metal));
      const panels: THREE.Mesh[] = [], lamps: THREE.MeshBasicMaterial[] = [];
      for (let k = 0; k < 3; k++) {
        const bars: THREE.BufferGeometry[] = []; const pw = w3 - 0.5;
        for (let x = -pw / 2; x <= pw / 2 + 0.01; x += 1.15) bars.push(new THREE.BoxGeometry(0.26, 9, 0.34).translate(x, 4.5, 0));
        for (const y of [0.3, 3.2, 6.1, 8.8]) bars.push(new THREE.BoxGeometry(pw, 0.36, 0.46).translate(0, y, 0));
        for (let x = -pw / 2; x <= pw / 2 + 0.01; x += 1.15) bars.push(new THREE.ConeGeometry(0.22, 0.7, 6).rotateX(Math.PI).translate(x, -0.3, 0));
        const p = mesh(merged(bars), dark); p.position.x = -(-sp.hw + (k + 0.5) * w3); root.add(p); panels.push(p);
        const lm = new THREE.MeshBasicMaterial({ color: GREEN.clone() }); disp.push(lm); lamps.push(lm);
        const lamp = mesh(new THREE.BoxGeometry(1.6, 0.7, 0.7), lm, false); lamp.position.set(p.position.x, 19.5, 1.5); root.add(lamp);
      }
      fns.push((t, rt) => {
        for (let k = 0; k < 3; k++) {
          const dr = gateDrop(sp, k, rt); panels[k].position.y = 0.2 + (1 - dr) * 9.5;
          lamps[k].color.copy(dr > 0.02 ? RED : gateWarn(sp, k, rt) ? (Math.sin(t * 22) > 0 ? AMBER : OFF) : GREEN);
        }
      });
    } else {
      // collapsing rock arch: 9 segments, the middle three fall
      const root = new THREE.Group(); root.position.set(s.x, s.y - 3, s.z); root.rotation.y = yaw; group.add(root);
      const Ra = sp.hw + 8, tube = 4.5 + h2(sp.idx, 3) * 1.5, segs = 9; const pieces: THREE.Mesh[] = [];
      for (let k = 0; k < segs; k++) {
        const g = new THREE.TorusGeometry(Ra, tube, 10, 8, Math.PI / segs); g.rotateZ((k * Math.PI) / segs);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const nn = 0.85 + h2(Math.round(x * 0.7 + k), Math.round(y * 0.7 + z)) * 0.3; p.setXYZ(i, x, y * 1.18 + (nn - 1) * 2, z * nn * 1.45); }
        g.computeBoundingBox(); const c = g.boundingBox!.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z); g.computeVertexNormals();
        const m = mesh(g, rockMat); m.position.copy(c); root.add(m); pieces.push(m);
      }
      root.updateMatrixWorld(true);
      const falling = [3, 4, 5].map(k => pieces[k]);
      fns.push((_t, rt, pods, dt, frozen, fx) => {
        if (sp.state === 0) {
          if (frozen || rt < 1) return;
          let lead: PodState | null = null; for (const p of pods) if (p.path === 0 && p.dead <= 0 && (!lead || p.prog > lead.prog)) lead = p;
          if (!lead) return;
          let ahead = sp.idx - lead.idx; if (td.main.closed) { if (ahead < -N / 2) ahead += N; if (ahead > N / 2) ahead -= N; }
          if (!((td.main.closed ? lead.lap >= 1 : true) && ahead > 0 && ahead < 70)) return;
          sp.state = 1; fx.push({ type: 'collapse', x: sp.x, y: sp.y + 20, z: sp.z, strength: 1 });
          // staggered landing spots → a slalom, never a wall across the road
          const targets: [number, number][] = [[-0.45, -14], [0.38, 4], [-0.02, 22]];
          falling.forEach((m, i) => {
            group.attach(m);
            const [lf, al] = targets[i]; const tx = s.x + s.rx * lf * sp.hw + s.tx * al, tz = s.z + s.rz * lf * sp.hw + s.tz * al;
            const drop = Math.max(1, m.position.y - (s.y + 1.7)); const tf = (3 + Math.sqrt(9 + 68 * drop)) / 34;
            sp.rocks.push({ x: m.position.x, y: m.position.y, z: m.position.z, vx: (tx - m.position.x) / tf, vy: 3, vz: (tz - m.position.z) / tf, r: 2.8, landed: false, hits: 0 });
          });
        } else if (sp.state === 1) {
          let all = true;
          sp.rocks.forEach((r, i) => {
            if (r.landed) return; all = false;
            r.vy -= 34 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
            const m = falling[i]; m.position.set(r.x, r.y, r.z); m.rotation.x += dt * (0.9 + i * 0.4); m.rotation.z += dt * 0.6;
            m.scale.setScalar(Math.max(0.48, m.scale.x - dt * 0.4));
            const qi = nearestOnPath(td.main, r.x, r.z, sp.idx, 40, 40); const q = S[qi];
            const lat = (r.x - q.x) * q.rx + (r.z - q.z) * q.rz; const gy = q.y + q.ramp - Math.max(-q.hw, Math.min(q.hw, lat)) * q.bank;
            if (r.y - r.r * 0.6 <= gy) {
              r.landed = true; r.y = gy + r.r * 0.6; m.position.y = r.y; m.scale.setScalar(0.48);
              const o: Obstacle = { path: 0, idx: qi, lat, r: r.r, kind: 0, x: r.x, y: gy, z: r.z };
              td.obstacles.push(o); const bk = Math.floor(qi / 10); const mm = td.obstaclesByPath[0]; if (!mm.has(bk)) mm.set(bk, []); mm.get(bk)!.push(o);
              fx.push({ type: 'dust', x: r.x, y: gy + 1, z: r.z, strength: 1 });
            }
          });
          if (all) sp.state = 2;
        }
      });
    }
  }
  return { update: (t: number, rt: number, pods: PodState[], dt: number, frozen: boolean) => { const fx: SetPieceFx[] = []; for (const f of fns) f(t, rt, pods, dt, frozen, fx); return fx; } };
}
