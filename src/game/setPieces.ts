import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { PodState } from './physics';
import { boulderState, bridgeSwing, bridgeWarn, gateDrop, gateWarn, nearestOnPath, rotorAngle, type Obstacle, type TrackData } from './trackBuilder';

/**
 * Dynamic set pieces (visuals + state). Collision & AI timing live in physics.ts and read the exact same state:
 *  - rotor:   rotating hazard-striped blades on an armored hub pylon
 *  - gate:    overhead gantry with three sequenced portcullis slabs (green → amber blink → red drop + slam FX)
 *  - arch:    stratified rock arch that collapses into a navigable slalom when the leader arrives
 *  - icefall: translucent glacier ice-bridge that fractures & drops crystalline monoliths (Ando Prime)
 *  - boulder: canyon stone chute launching giant bouncing boulders across the road (with warning beacon)
 *  - bridge:  twin side-pivoted swinging boom-bridge arms sweeping across outer lanes (leaving a bold center gap)
 */
export interface SetPieceFx { type: 'dust' | 'collapse' | 'slam' | 'ice'; x: number; y: number; z: number; strength: number; }
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
  const metal = new THREE.MeshStandardMaterial({ color: '#6c727c', metalness: 0.86, roughness: 0.33 });
  const dark = new THREE.MeshStandardMaterial({ color: '#282c33', metalness: 0.74, roughness: 0.48 });
  const tex = hazardTex(); const hazard = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.32, roughness: 0.48 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.25) });
  const iceMat = new THREE.MeshStandardMaterial({ color: '#b4e4ff', roughness: 0.18, metalness: 0.1, emissive: '#2c78b4', emissiveIntensity: 0.32 }); // opaque (the 88 % opacity made falling ice blocks look half see-through)
  disp.push(metal, dark, tex, hazard, glow, iceMat);
  const RED = new THREE.Color('#ff2a18').multiplyScalar(1.35), AMBER = new THREE.Color('#ffb020').multiplyScalar(1.3), GREEN = new THREE.Color('#30ff60'), OFF = new THREE.Color('#201008');

  for (const sp of td.setPieces) {
    const s = S[sp.idx]; const yaw = Math.atan2(s.tx, s.tz);
    if (sp.type === 'rotor') {
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); group.add(root);
      const pylonG = merged([
        new THREE.CylinderGeometry(3.0, 3.6, 0.85, 24).translate(0, 0.42, 0),
        new THREE.CylinderGeometry(1.5, 1.9, 8.0, 20).translate(0, 4.0, 0),
        new THREE.TorusGeometry(2.1, 0.28, 8, 24).rotateX(Math.PI / 2).translate(0, 0.95, 0),
        new THREE.TorusGeometry(1.75, 0.2, 8, 24).rotateX(Math.PI / 2).translate(0, 5.2, 0),
      ]);
      const capG = new THREE.SphereGeometry(0.55, 12, 8).translate(0, 8.3, 0);
      disp.push(pylonG, capG);
      root.add(mesh(pylonG, metal)); root.add(mesh(capG, glow, false));
      const rot = new THREE.Group(); root.add(rot);
      const hubG = new THREE.CylinderGeometry(2.4, 2.4, 1.9, 20).translate(0, 2.0, 0); disp.push(hubG);
      rot.add(mesh(hubG, dark));
      const len = sp.armLen - 1.6;
      for (let k = 0; k < sp.arms; k++) {
        const arm = new THREE.Group(); arm.rotation.y = -(k / sp.arms) * Math.PI * 2; rot.add(arm);
        const bg = new THREE.BoxGeometry(len, 2.5, 1.35).translate(1.6 + len / 2, 1.9, 0);
        const tg = new THREE.BoxGeometry(1.3, 3.4, 1.95).translate(sp.armLen - 0.6, 1.9, 0);
        const lg = new THREE.SphereGeometry(0.44, 10, 8).translate(sp.armLen - 0.6, 3.9, 0);
        disp.push(bg, tg, lg);
        arm.add(mesh(bg, hazard)); arm.add(mesh(tg, dark)); arm.add(mesh(lg, glow, false));
      }
      fns.push((_t, rt) => { rot.rotation.y = -rotorAngle(sp, rt); });
    } else if (sp.type === 'gate') {
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); root.rotation.y = yaw; group.add(root);
      const span = Math.max(s.wallL, s.wallR) + 1.8; const w3 = (2 * sp.hw) / 3;
      const frame: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) { frame.push(new THREE.BoxGeometry(2.4, 23, 2.6).translate(sd * span, 10, 0), new THREE.BoxGeometry(3.8, 1.3, 3.8).translate(sd * span, -1.2, 0)); }
      frame.push(new THREE.BoxGeometry(2 * span + 2.6, 1.8, 2.8).translate(0, 20.6, 0), new THREE.BoxGeometry(2 * span + 2.6, 0.85, 1.3).translate(0, 18.4, 0));
      for (let k = 1; k < 3; k++) frame.push(new THREE.BoxGeometry(0.9, 12, 0.9).translate(-(-sp.hw + k * w3), 13.5, -1.2));
      const fg = merged(frame); disp.push(fg); root.add(mesh(fg, metal));
      const panels: THREE.Mesh[] = [], lamps: THREE.MeshBasicMaterial[] = [], wasDown = [false, false, false];
      for (let k = 0; k < 3; k++) {
        const bars: THREE.BufferGeometry[] = []; const pw = w3 - 0.5;
        for (let x = -pw / 2; x <= pw / 2 + 0.01; x += 1.15) bars.push(new THREE.BoxGeometry(0.26, 9, 0.34).translate(x, 4.5, 0));
        for (const y of [0.3, 3.2, 6.1, 8.8]) bars.push(new THREE.BoxGeometry(pw, 0.38, 0.48).translate(0, y, 0));
        for (let x = -pw / 2; x <= pw / 2 + 0.01; x += 1.15) bars.push(new THREE.ConeGeometry(0.22, 0.7, 6).rotateX(Math.PI).translate(x, -0.3, 0));
        const pg = merged(bars); disp.push(pg);
        const p = mesh(pg, dark); p.position.x = -(-sp.hw + (k + 0.5) * w3); root.add(p); panels.push(p);
        const lm = new THREE.MeshBasicMaterial({ color: GREEN.clone() }); disp.push(lm); lamps.push(lm);
        const lg = new THREE.BoxGeometry(1.8, 0.75, 0.75); disp.push(lg);
        const lamp = mesh(lg, lm, false); lamp.position.set(p.position.x, 19.5, 1.5); root.add(lamp);
      }
      fns.push((t, rt, _pods, _dt, frozen, fx) => {
        for (let k = 0; k < 3; k++) {
          const dr = gateDrop(sp, k, rt); panels[k].position.y = 0.2 + (1 - dr) * 9.5;
          lamps[k].color.copy(dr > 0.02 ? RED : gateWarn(sp, k, rt) ? (Math.sin(t * 22) > 0 ? AMBER : OFF) : GREEN);
          const down = dr > 0.96;
          if (down && !wasDown[k] && !frozen && rt > 0.5) {
            const lat = -sp.hw + (k + 0.5) * w3;
            fx.push({ type: 'slam', x: sp.x + s.rx * lat, y: sp.y + 0.4, z: sp.z + s.rz * lat, strength: 0.9 });
          }
          wasDown[k] = down;
        }
      });
    } else if (sp.type === 'boulder') {
      // Sloped canyon rock-chute + warning beacon + giant bouncing craggy boulder rolling across the track!
      const side = sp.lat; // +1 right, -1 left
      const chute = new THREE.Group(); chute.position.set(s.x, s.y, s.z); chute.rotation.y = yaw; group.add(chute);
      // In root local (+Z = tangent), world s.rx corresponds to local -X
      const lx = -side * (sp.hw + 5.5);
      const chuteG = merged([
        new THREE.BoxGeometry(10, 0.8, 8.5).rotateZ(side * 0.48).translate(lx, 5.2, 0),
        new THREE.BoxGeometry(10, 2.2, 0.7).rotateZ(side * 0.48).translate(lx, 6.1, -4.1),
        new THREE.BoxGeometry(10, 2.2, 0.7).rotateZ(side * 0.48).translate(lx, 6.1, 4.1),
        new THREE.CylinderGeometry(0.22, 0.32, 9.5, 8).translate(-side * (sp.hw + 1.8), 4.75, -4.8),
      ]);
      const lampMat = new THREE.MeshBasicMaterial({ color: GREEN.clone() });
      const lampG = new THREE.SphereGeometry(0.65, 12, 8).translate(-side * (sp.hw + 1.8), 9.8, -4.8);
      disp.push(chuteG, lampMat, lampG);
      chute.add(mesh(chuteG, dark)); chute.add(mesh(lampG, lampMat, false));

      // Sculpted craggy rolling boulder
      const bGeo = new THREE.IcosahedronGeometry(sp.armLen, 3);
      const bp = bGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
        const k = 0.88 + h2(Math.round(x * 1.4), Math.round(y * 1.4 + z * 2.1)) * 0.16 + Math.sin(x * 1.3 + y * 1.1) * 0.08;
        bp.setXYZ(i, x * k, y * k, z * k);
      }
      bGeo.computeVertexNormals(); disp.push(bGeo);
      const rock = mesh(bGeo, rockMat, true); group.add(rock);
      let prevBounce = false;
      fns.push((t, rt, _pods, _dt, frozen, fx) => {
        const bs = boulderState(sp, frozen ? 0 : rt);
        rock.visible = bs.active || bs.warn;
        const clLat = Math.max(-sp.hw, Math.min(sp.hw, bs.lat));
        const gy = s.y - clLat * s.bank;
        const bx = s.x + s.rx * bs.lat, bz = s.z + s.rz * bs.lat, by = gy + sp.armLen * 0.85 + bs.hop;
        rock.position.set(bx, by, bz);
        rock.rotation.set(bs.spin * 0.4, yaw, side * bs.spin);
        lampMat.color.copy(bs.active ? RED : bs.warn ? (Math.sin(t * 20) > 0 ? AMBER : OFF) : GREEN);
        if (bs.bounce && !prevBounce && !frozen && Math.abs(bs.lat) < sp.hw) {
          fx.push({ type: 'dust', x: bx, y: gy + 0.5, z: bz, strength: 0.85 });
        }
        prevBounce = bs.bounce;
      });
    } else if (sp.type === 'bridge') {
      // Twin side-mounted industrial swing-bridge boom barriers sweeping across outer lanes
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); root.rotation.y = yaw; group.add(root);
      const pivots: THREE.Group[] = [];
      const lampMat = new THREE.MeshBasicMaterial({ color: GREEN.clone() }); disp.push(lampMat);
      for (const sd of [-1, 1]) {
        const px = -sd * (sp.hw + 1.4); // local X matching world side `sd`
        const towerG = merged([
          new THREE.CylinderGeometry(1.7, 2.2, 9.5, 16).translate(px, 4.2, 0),
          new THREE.TorusGeometry(1.95, 0.25, 8, 20).rotateX(Math.PI / 2).translate(px, 3.6, 0),
          new THREE.BoxGeometry(3.8, 1.2, 3.8).translate(px, -0.6, 0),
        ]);
        const lg = new THREE.SphereGeometry(0.6, 12, 8).translate(px, 9.4, 0);
        disp.push(towerG, lg);
        root.add(mesh(towerG, metal)); root.add(mesh(lg, lampMat, false));
        const piv = new THREE.Group(); piv.position.set(px, 2.1, 0); root.add(piv);
        const L = sp.armLen; const dir = sd; // extends inward toward X = 0
        const boomG = new THREE.BoxGeometry(L, 2.4, 1.35).translate(dir * (L / 2 + 1.2), 0, 0);
        const tipG = new THREE.BoxGeometry(1.1, 3.1, 1.8).translate(dir * (L + 1.2), 0, 0);
        const tipL = new THREE.SphereGeometry(0.42, 10, 8).translate(dir * (L + 1.2), 1.85, 0);
        disp.push(boomG, tipG, tipL);
        piv.add(mesh(boomG, hazard)); piv.add(mesh(tipG, dark)); piv.add(mesh(tipL, lampMat, false));
        pivots.push(piv);
      }
      fns.push((t, rt) => {
        const sw = bridgeSwing(sp, rt); // 0 = swung forward out of road, 1 = perpendicular blocking outer lanes
        pivots[0].rotation.y = (1 - sw) * (Math.PI * 0.48);
        pivots[1].rotation.y = -(1 - sw) * (Math.PI * 0.48);
        lampMat.color.copy(sw > 0.25 ? RED : bridgeWarn(sp, rt) || sw > 0.02 ? (Math.sin(t * 20) > 0 ? AMBER : OFF) : GREEN);
      });
    } else {
      // Collapsing rock arch ('arch') OR fracturing glacier ice-bridge ('icefall'): 9 segments, middle 3 drop into a slalom!
      const isIce = sp.type === 'icefall';
      const root = new THREE.Group(); root.position.set(s.x, s.y - 3, s.z); root.rotation.y = yaw; group.add(root);
      const Ra = sp.hw + 8, tube = (isIce ? 4.0 : 4.5) + h2(sp.idx, 3) * 1.5, segs = 9; const pieces: THREE.Mesh[] = [];
      for (let k = 0; k < segs; k++) {
        // Session 15: torus arc segments are open tubes – once a block broke out you could look straight through its ends. Both ends get caps.
        const rs = isIce ? 6 : 10, arc = Math.PI / segs;
        const tg = new THREE.TorusGeometry(Ra, tube, rs, 8, arc);
        const cap = (ang: number, dir: number) => { const cg = new THREE.CircleGeometry(tube, rs); cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-Math.sin(ang) * dir, Math.cos(ang) * dir, 0))); cg.translate(Math.cos(ang) * Ra, Math.sin(ang) * Ra, 0); return cg; };
        const c0 = cap(0, -1), c1 = cap(arc, 1);
        const g = mergeGeometries([tg, c0, c1])!; tg.dispose(); c0.dispose(); c1.dispose(); g.rotateZ((k * Math.PI) / segs);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const nn = 0.85 + h2(Math.round(x * 0.7 + k), Math.round(y * 0.7 + z)) * 0.3;
          p.setXYZ(i, x, y * 1.18 + (nn - 1) * 2, z * nn * (isIce ? 1.65 : 1.45));
        }
        g.computeBoundingBox(); const c = g.boundingBox!.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z); g.computeVertexNormals();
        disp.push(g);
        const m = mesh(g, isIce ? iceMat : rockMat); m.position.copy(c); root.add(m); pieces.push(m);
      }
      root.updateMatrixWorld(true);
      const falling = [3, 4, 5].map(k => pieces[k]);
      const fades: { o: Obstacle; m: THREE.Mesh; t: number; done: boolean }[] = [];
      fns.push((_t, rt, pods, dt, frozen, fx) => {
        if (sp.state === 0) {
          if (frozen || rt < 1) return;
          let lead: PodState | null = null; for (const p of pods) if (p.path === 0 && p.dead <= 0 && (!lead || p.prog > lead.prog)) lead = p;
          if (!lead) return;
          let ahead = sp.idx - lead.idx; if (td.main.closed) { if (ahead < -N / 2) ahead += N; if (ahead > N / 2) ahead -= N; }
          if (!((td.main.closed ? lead.lap >= 1 : true) && ahead > 0 && ahead < 70)) return;
          sp.state = 1; fx.push({ type: isIce ? 'ice' : 'collapse', x: sp.x, y: sp.y + 20, z: sp.z, strength: 1 });
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
              if (i !== 1) fades.push({ o, m, t: rt + 11 + i * 4, done: false });
              fx.push({ type: 'dust', x: r.x, y: gy + 1, z: r.z, strength: 1 });
            }
          });
          if (all) sp.state = 2;
        }
        // Session 14: two of the three fallen blocks crumble away 11–19 s after landing (the centre block stays as a permanent chicane)
        for (const f of fades) {
          if (f.done || rt < f.t) continue;
          const sc = f.m.scale.x - dt * 0.16; f.m.position.y -= dt * 0.9;
          if (sc <= 0.06) { f.done = true; f.m.visible = false; f.o.broken = true; f.o.x = 1e9; f.o.z = 1e9; f.o.lat = 1e6; }
          else { f.m.scale.setScalar(sc); if (Math.random() < dt * 6) fx.push({ type: 'dust', x: f.m.position.x, y: f.m.position.y + 1, z: f.m.position.z, strength: 0.5 }); }
        }
      });
    }
  }
  return { update: (t: number, rt: number, pods: PodState[], dt: number, frozen: boolean) => { const fx: SetPieceFx[] = []; for (const f of fns) f(t, rt, pods, dt, frozen, fx); return fx; } };
}
