import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { Sample, TrackData } from './trackBuilder';
import type { StaticBatcher } from './trackMesh';

/**
 * Track-side detail geometry (all merged, instanced or chunked):
 *  - 3D guard rails exactly on the collision walls (posts, twin box rails, glowing energy strip)
 *  - reflector studs, raised kerbs, painted start grid, canyon boulders, canyon wall light strips
 *  - ramp substructure (columns + braces), take-off/landing light rows, gap warning masts
 *  - TV camera towers, overhead sponsor gantries on long straights
 *  - geyser vents with a pulsing warning ring (driven by Hazard.state)
 */
type Disp = { dispose: () => void }[];
export interface DetailOpts { across: number; disp: number; detail: number; tvCams: THREE.Vector3[]; batcher: StaticBatcher; }

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const UP = new THREE.Vector3(0, 1, 0);

export function addTrackDetail(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, rng: () => number, rockMat: THREE.Material, o: DetailOpts) {
  const barrier = new THREE.Color(theme.barrierColor);
  const lipStart = 1 - 2 / o.across; const dOff = o.disp * 0.55;
  /** road surface height incl. crown and the raised edge lip used by the road mesh */
  const surf = (s: Sample, lat: number) => { const e = Math.min(1, Math.abs(lat) / s.hw); const lip = e > lipStart ? 0.18 * (e - lipStart) / (1 - lipStart) : 0; return s.y + s.ramp - lat * s.bank + (1 - e * e) * 0.2 + lip; };
  const yawQ = (s: Sample) => new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(s.tx, s.tz));
  const M = (x: number, y: number, z: number, q: THREE.Quaternion, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  const S = td.main.samples, N = S.length;

  // ---------------- materials ----------------
  const railTex = canvasTex(512, 64, c => {
    const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#d8dce2'); g.addColorStop(0.45, '#9aa0a8'); g.addColorStop(0.55, '#b4b9c0'); g.addColorStop(1, '#6e737b');
    c.fillStyle = g; c.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${h2(i, 1) > 0.5 ? '255,255,255' : '40,36,30'},${0.04 + h2(i, 2) * 0.08})`; c.fillRect(h2(i, 3) * 512, h2(i, 4) * 64, 4 + h2(i, 5) * 30, 1); }
    for (let x = 16; x < 512; x += 128) for (const y of [18, 46]) { c.fillStyle = '#3a3e44'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.fillStyle = '#e4e8ee'; c.beginPath(); c.arc(x - 1, y - 1, 3, 0, 7); c.fill(); }
  });
  const railMat = new THREE.MeshStandardMaterial({ map: railTex, metalness: 0.8, roughness: 0.38, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: '#3b3f47', metalness: 0.75, roughness: 0.42 });
  const glowMat = new THREE.MeshBasicMaterial({ color: barrier.clone().multiplyScalar(1.2), side: THREE.DoubleSide });
  const studA = new THREE.MeshBasicMaterial({ color: barrier.clone().multiplyScalar(1.05) });
  const studB = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfeaff') });
  const redL = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3020').multiplyScalar(1.3) });
  const greenL = new THREE.MeshBasicMaterial({ color: new THREE.Color('#30ff60').multiplyScalar(1.2) });
  const kerbTex = canvasTex(64, 256, c => {
    c.fillStyle = '#b3241c'; c.fillRect(0, 0, 64, 128); c.fillStyle = '#e8e6e0'; c.fillRect(0, 128, 64, 128);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, 4, 256); c.fillRect(60, 0, 4, 256);
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(30,24,20,${0.05 + h2(i, 11) * 0.18})`; c.fillRect(h2(i, 12) * 64, h2(i, 13) * 256, 1 + h2(i, 14) * 4, 1 + h2(i, 15) * 3); }
  });
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.55, metalness: 0.05 });
  const paintMat = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.12 });
  const trussMat = new THREE.MeshStandardMaterial({ color: '#5a5f68', metalness: 0.85, roughness: 0.35 });
  const hazardTex = canvasTex(128, 128, c => { c.fillStyle = '#d9a514'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#111'; for (let i = -128; i < 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 16, 0); c.lineTo(i + 16 - 128, 128); c.lineTo(i - 128, 128); c.fill(); } });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.5, metalness: 0.2 });
  disp.push(railTex, railMat, postMat, glowMat, studA, studB, redL, greenL, kerbTex, kerbMat, paintMat, trussMat, hazardTex, hazardMat);

  const addStrip = (pos: number[], uv: number[], idx: number[], mat: THREE.Material, cast: boolean, tris = 3000) => {
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    o.batcher.addStrip(g, mat, tris, cast);
  };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow: boolean) => {
    if (!mats.length) { geo.dispose(); return null; }
    const im = new THREE.InstancedMesh(geo, mat, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); disp.push(geo);
    return im;
  };

  // ---------------- guard rails (exactly on the collision wall) ----------------
  const RING = 9; const ring: [number, number][] = [];
  for (let k = 0; k < RING; k++) { const a = (k / (RING - 1)) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a); ring.push([0.055 * Math.sign(ca) * Math.pow(Math.abs(ca), 0.45), 0.15 * Math.sign(sa) * Math.pow(Math.abs(sa), 0.45)]); }
  const rp: number[] = [], ru: number[] = [], ri: number[] = []; let rv = 0;
  const gp: number[] = [], gu: number[] = [], gi: number[] = []; let gv = 0;
  const posts: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [], studsA: THREE.Matrix4[] = [], studsB: THREE.Matrix4[] = [], canyonLights: THREE.Matrix4[] = [];
  for (const path of td.paths) {
    const P = path.samples, n = P.length;
    for (const side of [-1, 1]) {
      const ok = (s: Sample) => !((side > 0 ? s.hR : s.hL) > 0) && !(side > 0 ? s.openR : s.openL) && !s.gap && !s.zeroG;
      let prev = false, along = 0, postCount = 0;
      for (let i = 0; i < n; i += 2) {
        const s = P[i]; const on = ok(s); if (i > 0) along += 4;
        const wall = side > 0 ? s.wallR : s.wallL;
        if (on) {
          const lat = side * (wall + 0.06); const base = surf(s, side * s.hw) + 0.02;
          const ix = -side * s.rx, iz = -side * s.rz; // inward
          for (const hgt of [0.62, 1.12]) for (let k = 0; k < RING; k++) { const [px, py] = ring[k]; rp.push(s.x + s.rx * lat + ix * px, base + hgt + py, s.z + s.rz * lat + iz * px); ru.push(along / 8, k / (RING - 1)); }
          if (prev) for (let r = 0; r < 2; r++) { const a0 = rv - RING * 2 + r * RING, b0 = rv + r * RING; for (let k = 0; k < RING - 1; k++) ri.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1); }
          rv += RING * 2;
          const topY = base + 1.12 + 0.165;
          gp.push(s.x + s.rx * lat + ix * 0.035, topY, s.z + s.rz * lat + iz * 0.035, s.x + s.rx * lat - ix * 0.035, topY, s.z + s.rz * lat - iz * 0.035); gu.push(along, 0, along, 1);
          if (prev) gi.push(gv - 2, gv - 1, gv, gv - 1, gv + 1, gv);
          gv += 2;
          if (i % 4 === 0) {
            const pl = side * (wall + 0.18); const px = s.x + s.rx * pl, pz = s.z + s.rz * pl;
            posts.push(M(px, base + 0.6, pz, yawQ(s)));
            if (postCount++ % 5 === 0) caps.push(M(px, base + 1.34, pz, yawQ(s)));
          }
        }
        prev = on;
        if (path.id === 0 && i % 6 === 0 && !s.gap && s.ramp === 0) {
          const lat = side * (s.hw - 0.7);
          (side > 0 ? studsA : studsB).push(M(s.x + s.rx * lat, surf(s, lat) + 0.06 + dOff, s.z + s.rz * lat, yawQ(s)));
        }
        // light strip at the foot of canyon walls (speed reference in the gorges)
        if ((side > 0 ? s.hR : s.hL) > 0 && !s.gap && i % 8 === 0) {
          const lat = side * (s.hw + 0.55); canyonLights.push(M(s.x + s.rx * lat, s.y + s.ramp - side * s.hw * s.bank + 0.7, s.z + s.rz * lat, yawQ(s)));
        }
      }
    }
  }
  addStrip(rp, ru, ri, railMat, false, 3600);
  addStrip(gp, gu, gi, glowMat, false, 4000);
  inst(new THREE.BoxGeometry(0.16, 1.3, 0.2), postMat, posts, true);
  inst(new THREE.BoxGeometry(0.22, 0.08, 0.26), glowMat, caps, false);
  inst(new THREE.BoxGeometry(0.3, 0.08, 0.55), studA, studsA, false);
  inst(new THREE.BoxGeometry(0.3, 0.08, 0.55), studB, studsB, false);
  inst(new THREE.BoxGeometry(0.18, 0.12, 1.4), glowMat, canyonLights, false);

  // ---------------- snow / sand drifts against rails and cliffs ----------------
  if (theme.id === 'ice' || theme.id === 'desert' || theme.id === 'mesa') {
    const snowMat = theme.id === 'ice' ? new THREE.MeshStandardMaterial({ color: '#eef4fb', roughness: 0.72, metalness: 0 }) : new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.palette.ground[1]).multiplyScalar(0.95), roughness: 0.96, metalness: 0 }); disp.push(snowMat);
    const sp: number[] = [], su: number[] = [], si: number[] = []; let sv = 0; const PR = 6;
    for (const path of td.paths) {
      const P = path.samples, n = P.length;
      for (const side of [-1, 1]) {
        let prev = false;
        for (let i = 0; i < n; i += 2) {
          const s = P[i]; const on = !s.gap && s.ramp === 0 && !(side > 0 ? s.openR : s.openL) && !s.zeroG;
          if (on) {
            const wall = Math.min(side > 0 ? s.wallR : s.wallL, s.hw + 0.4);
            const amp = 0.25 + 0.75 * Math.max(0, Math.sin(s.s * 0.011 + side * 2.1) * 0.6 + h2(i >> 3, side + 5) * 0.6);
            const width = 2.2 + amp * 3.4;
            for (let k = 0; k < PR; k++) { const f = k / (PR - 1); const lat = side * (wall - f * width); sp.push(s.x + s.rx * lat, surf(s, lat) + dOff + amp * 0.95 * Math.pow(1 - f, 1.6) + 0.02, s.z + s.rz * lat); su.push(f, s.s / 6); }
            if (prev) { const a = sv - PR, b = sv; for (let k = 0; k < PR - 1; k++) { if (side > 0) si.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1); else si.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k); } }
            sv += PR;
          }
          prev = on;
        }
      }
    }
    addStrip(sp, su, si, snowMat, false, 3000);
  }

  // ---------------- kerbs on the inside of tight corners ----------------
  {
    const kp: number[] = [], ku: number[] = [], ki: number[] = []; let kv = 0;
    const prof = [0, 0.09, 0.13, 0.09, 0]; const PL = prof.length;
    let i = 0;
    while (i < N) {
      const c0 = S[i].curv;
      if (Math.abs(c0) < 1 / 230 || S[i].gap || S[i].ramp > 0) { i++; continue; }
      const side = c0 > 0 ? 1 : -1; let j = i;
      while (j < N && Math.abs(S[j].curv) > 1 / 300 && Math.sign(S[j].curv) === side && !S[j].gap && S[j].ramp === 0) j++;
      if (j - i >= 12) {
        let along = 0;
        for (let k = i; k < j; k++) {
          const s = S[k]; if (k > i) along += 2;
          const taper = Math.min(1, (k - i) / 3, (j - 1 - k) / 3);
          for (let p = 0; p < PL; p++) {
            const lat = side * (s.hw - 3.4 + (p / (PL - 1)) * 2.8);
            kp.push(s.x + s.rx * lat, surf(s, lat) + 0.035 + dOff + prof[p] * taper, s.z + s.rz * lat); ku.push(p / (PL - 1), along / 6);
          }
          if (k > i) { const a = kv - PL, b = kv; for (let p = 0; p < PL - 1; p++) { if (side > 0) ki.push(a + p, a + p + 1, b + p, a + p + 1, b + p + 1, b + p); else ki.push(a + p, b + p, a + p + 1, a + p + 1, b + p, b + p + 1); } }
          kv += PL;
        }
      }
      i = Math.max(j, i + 1);
    }
    addStrip(kp, ku, ki, kerbMat, false, 3000);
  }

  // ---------------- start grid boxes ----------------
  {
    const marks: THREE.Matrix4[] = [];
    for (let g = 0; g < 11; g++) {
      const row = Math.floor(g / 3), col = g % 3;
      let idx = td.startIdx - 6 - row * 9; idx = td.main.closed ? ((idx % N) + N) % N : Math.max(0, idx);
      const front = S[Math.min(N - 1, idx + 2)], s = S[idx]; const lat = (col - 1) * s.hw * 0.55;
      marks.push(M(front.x + front.rx * lat, surf(front, lat) + 0.04 + dOff, front.z + front.rz * lat, yawQ(front), 7, 1, 0.4));
      for (const sd of [-1, 1]) { const l2 = lat + sd * 3.5; marks.push(M(s.x + s.rx * l2 + s.tx * 1.5, surf(s, l2) + 0.04 + dOff, s.z + s.rz * l2 + s.tz * 1.5, yawQ(s), 0.4, 1, 5)); }
    }
    inst(new THREE.BoxGeometry(1, 0.03, 1), paintMat, marks, false);
  }

  // ---------------- boulders at canyon wall feet ----------------
  {
    const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const nn = 0.72 + h2(Math.round(x * 3), Math.round(y * 3 + z * 7)) * 0.2 + Math.sin(x * 2.3 + z * 1.7) * 0.08; p.setXYZ(i, x * nn, y * nn * 0.75, z * nn); }
    g.computeVertexNormals();
    const mats: THREE.Matrix4[] = []; const e = new THREE.Euler(); const q = new THREE.Quaternion();
    for (let i = 0; i < N; i += 3) {
      const s = S[i]; if (s.gap) continue;
      for (const side of [-1, 1]) {
        if (!((side > 0 ? s.hR : s.hL) > 0) || rng() > 0.55 * o.detail) continue;
        const size = 0.7 + Math.pow(rng(), 2) * 2.2; const lat = side * (s.hw + 0.6 + size * 0.55);
        e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e);
        mats.push(M(s.x + s.rx * lat, s.y + s.ramp - side * s.hw * s.bank + size * 0.25, s.z + s.rz * lat, q, size, size * (0.7 + rng() * 0.5), size));
      }
    }
    inst(g, rockMat, mats, true);
  }

  // ---------------- ramps: substructure, take-off & landing lights, gap warning masts ----------------
  {
    const cols: THREE.Matrix4[] = [], braces: THREE.Matrix4[] = [], reds: THREE.Matrix4[] = [], greens: THREE.Matrix4[] = [], lips: THREE.Matrix4[] = [], masts: THREE.Matrix4[] = [], mastLamps: THREE.Matrix4[] = [];
    for (let i = 1; i < N; i++) {
      const s = S[i], pv = S[i - 1];
      if (s.ramp > 0 && pv.ramp === 0) { // walk the ramp
        let j = i; while (j < N && S[j].ramp > 0) j++;
        for (let k = i; k < j; k += 3) {
          const r = S[k]; if (r.ramp < 1.2) continue; const q = yawQ(r);
          for (const f of [-0.92, -0.45, 0, 0.45, 0.92]) {
            const lat = f * r.hw; const top = r.y + r.ramp - lat * r.bank, bot = r.y - 3.6;
            cols.push(M(r.x + r.rx * lat, (top + bot) / 2, r.z + r.rz * lat, q, 0.5, top - bot, 0.5));
          }
          if ((k - i) % 6 === 0) for (const sd of [-1, 1]) { const lat = sd * r.hw * 0.7; const top = r.y + r.ramp * 0.92 - lat * r.bank; braces.push(M(r.x + r.rx * lat, (top + r.y - 3.6) / 2, r.z + r.rz * lat, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, Math.atan2(r.tx, r.tz), 0, 'YXZ')), 0.28, (top - r.y + 3.6) * 1.12, 0.28)); }
        }
        const lip = S[Math.max(i, j - 1)]; const q = yawQ(lip);
        lips.push(M(lip.x, surf(lip, 0) + 0.06 + dOff, lip.z, q, lip.hw * 1.9, 1, 1.2));
        for (let l = -1; l <= 1.001; l += 0.125) { const lat = l * lip.hw * 0.95; reds.push(M(lip.x + lip.rx * lat, surf(lip, lat) + 0.16 + dOff, lip.z + lip.rz * lat, q)); }
      }
      if (!s.gap && pv.gap) { // landing edge
        const q = yawQ(s);
        for (let l = -1; l <= 1.001; l += 0.125) { const lat = l * s.hw * 0.95; greens.push(M(s.x + s.rx * lat, surf(s, lat) + 0.16 + dOff, s.z + s.rz * lat, q)); }
      }
      if (s.gap !== pv.gap) for (const sd of [-1, 1]) { // warning masts on both chasm edges
        const e = s.gap ? pv : s; const lat = sd * (e.hw + 1.2); const base = e.y + e.ramp - sd * e.hw * e.bank;
        masts.push(M(e.x + e.rx * lat, base - 2, e.z + e.rz * lat, yawQ(e), 1, 12, 1));
        mastLamps.push(M(e.x + e.rx * lat, base + 4.3, e.z + e.rz * lat, yawQ(e)));
      }
    }
    inst(new THREE.BoxGeometry(1, 1, 1), trussMat, cols, true);
    inst(new THREE.BoxGeometry(1, 1, 1), trussMat, braces, true);
    inst(new THREE.BoxGeometry(1, 0.04, 1), hazardMat, lips, false);
    inst(new THREE.BoxGeometry(0.5, 0.18, 0.5), redL, reds, false);
    inst(new THREE.BoxGeometry(0.5, 0.18, 0.5), greenL, greens, false);
    inst(new THREE.CylinderGeometry(0.16, 0.22, 1, 8), postMat, masts, true);
    inst(new THREE.SphereGeometry(0.45, 12, 8), redL, mastLamps, false);
  }

  // ---------------- TV camera towers ----------------
  {
    const poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], tallies: THREE.Matrix4[] = [];
    for (const c of o.tvCams) {
      // nearest main sample: skip cameras that are mounted inside canyon walls
      let bi = 0, bd = 1e12; for (let i = 0; i < N; i += 4) { const d = (S[i].x - c.x) ** 2 + (S[i].z - c.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      const s = S[bi]; if (s.canyon || s.gap) continue;
      const ground = s.y - 3.5; const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(s.x - c.x, s.z - c.z));
      poles.push(M(c.x, (ground + c.y - 0.5) / 2, c.z, q, 1, c.y - 0.5 - ground, 1));
      heads.push(M(c.x, c.y, c.z, q)); tallies.push(M(c.x, c.y + 0.55, c.z, q));
    }
    const head = mergeGeometries([new THREE.BoxGeometry(0.9, 0.7, 1.4), new THREE.CylinderGeometry(0.28, 0.32, 0.6, 12).rotateX(Math.PI / 2).translate(0, 0, 0.95), new THREE.BoxGeometry(1.6, 0.12, 1.6).translate(0, -0.45, 0)].map(g => g.toNonIndexed()));
    inst(new THREE.CylinderGeometry(0.14, 0.22, 1, 8), postMat, poles, true);
    inst(head, trussMat, heads, true);
    inst(new THREE.SphereGeometry(0.1, 8, 6), redL, tallies, false);
  }

  // ---------------- overhead sponsor gantries on long straights ----------------
  {
    const words = ['BOONTA CLASSIC', 'HYPERSPEED', 'WATTO PARTS', 'GALACTIC CUP', 'OUTER RIM GP'];
    const bannerTex = canvasTex(1024, 128, c => {
      const g = c.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#120c06'); g.addColorStop(0.5, '#2a1a08'); g.addColorStop(1, '#120c06'); c.fillStyle = g; c.fillRect(0, 0, 1024, 128);
      c.strokeStyle = theme.barrierColor; c.lineWidth = 6; c.strokeRect(6, 6, 1012, 116);
      c.fillStyle = '#f2d080'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(words[Math.floor(rng() * words.length)] + ' ◆ PODRACING', 512, 66);
    });
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bannerTex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide });
    disp.push(bannerTex, bannerMat);
    const truss: THREE.BufferGeometry[] = [], banners: THREE.BufferGeometry[] = [], lamps: THREE.BufferGeometry[] = [];
    let last = -1e9;
    for (let i = 60; i < N - 60; i += 10) {
      if (i - last < 280) continue;
      let ok = true; for (let k = -20; k <= 20 && ok; k += 2) { const q = S[(i + k + N) % N]; if (Math.abs(q.curv) > 1 / 700 || q.canyon || q.gap || q.ramp > 0 || q.openL || q.openR) ok = false; }
      if (!ok || Math.abs(i - td.startIdx) < 90 || td.setPieces.some(sp => Math.abs(sp.idx - i) < 70)) continue;
      last = i; const s = S[i]; const yaw = Math.atan2(s.tx, s.tz); const span = Math.max(s.wallL, s.wallR) + 1.6; const H = 10.5;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
      for (const sd of [-1, 1]) { truss.push(new THREE.BoxGeometry(1.1, H + 4, 1.1).translate(sd * span, H / 2 - 2, 0).applyMatrix4(m)); truss.push(new THREE.BoxGeometry(2.4, 0.5, 2.4).translate(sd * span, -1.8, 0).applyMatrix4(m)); }
      for (const dy of [0, 1.6]) truss.push(new THREE.BoxGeometry(span * 2 + 1.1, 0.35, 0.35).translate(0, H + dy, 0).applyMatrix4(m));
      for (let x = -span; x < span; x += 2.2) truss.push(new THREE.BoxGeometry(0.16, 1.9, 0.16).rotateZ(((x / 2.2) | 0) % 2 ? 0.55 : -0.55).translate(x + 1.1, H + 0.8, 0).applyMatrix4(m));
      banners.push(new THREE.PlaneGeometry(span * 1.5, span * 1.5 / 8).rotateY(Math.PI).translate(0, H - 1.6, -0.25).applyMatrix4(m)); // faces oncoming pods
      for (let x = -span * 0.8; x <= span * 0.8 + 0.01; x += span * 0.4) lamps.push(new THREE.BoxGeometry(0.9, 0.25, 0.5).translate(x, H - 0.25, -0.6).applyMatrix4(m));
    }
    const addMerged = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean) => { if (!list.length) return; const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)); list.forEach(x => x.dispose()); if (!g) return; const mesh = new THREE.Mesh(g, mat); mesh.castShadow = cast; mesh.receiveShadow = true; group.add(mesh); disp.push(g); };
    addMerged(truss, trussMat, true); addMerged(banners, bannerMat, false); addMerged(lamps, glowMat, false);
  }

  // ---------------- geyser vents (Hazard) ----------------
  let ventRing: THREE.InstancedMesh | null = null;
  if (td.hazards.length) {
    const grate = mergeGeometries([new THREE.CylinderGeometry(4.3, 4.6, 0.3, 32), ...Array.from({ length: 8 }, (_, k) => new THREE.BoxGeometry(8.2, 0.12, 0.22).rotateY((k / 8) * Math.PI).translate(0, 0.2, 0))].map(g => g.toNonIndexed()));
    const vm = new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: 0.7, roughness: 0.6 }); disp.push(vm);
    const mats = td.hazards.map(h => { const s = S[h.idx]; return M(h.x, h.y + 0.12 + dOff, h.z, yawQ(s)); });
    inst(grate, vm, mats, false);
    const rm = new THREE.MeshBasicMaterial({ color: '#ffffff' }); disp.push(rm);
    ventRing = inst(new THREE.TorusGeometry(3.7, 0.22, 8, 40).rotateX(Math.PI / 2), rm, mats.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.3, 0))), false);
  }
  const ventCol = new THREE.Color(), hot = new THREE.Color('#ff6a10');
  const update = (t: number) => {
    if (!ventRing) return;
    td.hazards.forEach((h, i) => { const k = h.state >= 1 ? 1.5 : h.state > 0 ? 0.55 + 0.45 * Math.sin(t * 22) : 0.12; ventRing!.setColorAt(i, ventCol.copy(hot).multiplyScalar(k)); });
    if (ventRing.instanceColor) ventRing.instanceColor.needsUpdate = true;
  };
  return { update };
}
