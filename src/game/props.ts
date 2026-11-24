import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import type { Sample, TrackData } from './trackBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { clamp, hash, instanceIndex, max, positionGeometry, positionLocal, sin, time, vec3 } = TSL;

export interface Emitter { x: number; y: number; z: number; type: 'smoke' | 'steam' | 'embers' | 'sparkle'; }
type Disp = { dispose: () => void }[];

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();

function surfY(s: Sample, lat: number) { const e = Math.min(1, Math.abs(lat) / s.hw); return s.y + s.ramp - lat * s.bank + (1 - e * e) * 0.2; }
function yawOf(s: Sample) { return Math.atan2(s.tx, s.tz); }
function faceOncoming(s: Sample) { return new THREE.Quaternion().setFromAxisAngle(UP, yawOf(s)); }

export function addProps(td: TrackData, theme: ThemeDef, group: THREE.Group, gfx: GfxSettings, heightAt: (x: number, z: number) => number, disp: Disp, rng: () => number, clear: (x: number, z: number, r: number, margin?: number) => boolean, dOff = 0) {
  const S = td.main.samples; const N = S.length;
  const det = gfx.detail;
  const anim: ((t: number) => void)[] = [];
  const emitters: Emitter[] = [];
  const barrier = new THREE.Color(theme.barrierColor);
  const metal = new THREE.MeshStandardMaterial({ color: '#7d828c', metalness: 0.88, roughness: 0.32 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#31353d', metalness: 0.8, roughness: 0.44 });
  const cyanGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#42dcff').multiplyScalar(1.25) });
  disp.push(metal, darkMetal, cyanGlow);
  const floatWorld = theme.terrain === 'prison' || theme.terrain === 'ocean';
  const sideOK = (s: Sample, side: number) => !s.gap && s.ramp === 0 && !s.bridge && !s.underpass && !s.lake && !(s.roof > 0) && !(side > 0 ? s.openR : s.openL) && !((side > 0 ? s.hR : s.hL) > 0);
  // Ground elevation for roadside posts: sinks into true terrain on land worlds, or seats into road-edge bracket on prison/ocean
  const postBaseY = (s: Sample, side: number, x: number, z: number) => {
    const ey = s.y - side * s.hw * s.bank;
    return floatWorld ? ey - 1.4 : Math.min(ey - 0.4, heightAt(x, z) - 1.5);
  };
  const nearStart = (i: number) => { const d = Math.abs(i - td.startIdx); return Math.min(d, N - d) < 70 || (!td.main.closed && Math.abs(i - td.finishIdx) < 70); };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow = true, colors?: THREE.Color[]) => {
    if (!mats.length) { geo.dispose(); return null; }
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); disp.push(geo);
    return im;
  };
  const mtx = (x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sz));

  // ---------- 1. corner arrow boards with back backing plate & twin braced masts ----------
  {
    const tex = canvasTex(512, 128, c => {
      c.fillStyle = '#0e1014'; c.fillRect(0, 0, 512, 128);
      for (let k = 0; k < 4; k++) {
        const x0 = 28 + k * 120;
        c.fillStyle = k % 2 === 0 ? '#ffcc1a' : '#ff9f14';
        c.beginPath(); c.moveTo(x0, 14); c.lineTo(x0 + 60, 64); c.lineTo(x0, 114); c.lineTo(x0 + 38, 114); c.lineTo(x0 + 98, 64); c.lineTo(x0 + 38, 14); c.closePath(); c.fill();
      }
      // Subtle weathered scuffs
      for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(20,16,12,${0.12 * h2(i, 7)})`; c.fillRect(h2(i, 8) * 512, h2(i, 9) * 128, 3 + h2(i, 10) * 10, 2); }
      c.strokeStyle = '#ffcc1a'; c.lineWidth = 8; c.strokeRect(4, 4, 504, 120);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.48, side: THREE.DoubleSide });
    disp.push(mat, tex);
    const boards: THREE.Matrix4[] = [], backs: THREE.Matrix4[] = [], posts: THREE.Matrix4[] = [];
    let lastI = -100;
    for (let i = 0; i < N; i += 4) {
      const s = S[i]; if (Math.abs(s.curv) < 1 / 160 || i - lastI < 22 || nearStart(i)) continue;
      const side = s.curv > 0 ? -1 : 1;
      if (!sideOK(s, side)) continue;
      const off = s.hw + 5; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!clear(x, z, 3.5, 0.3)) continue;
      lastI = i;
      const top = s.y - side * s.hw * s.bank + 4.6;
      boards.push(new THREE.Matrix4().compose(new THREE.Vector3(x, top, z), faceOncoming(s), new THREE.Vector3(s.curv > 0 ? -7.2 : 7.2, 1.8, 1)));
      backs.push(new THREE.Matrix4().compose(new THREE.Vector3(x + s.tx * 0.12, top, z + s.tz * 0.12), faceOncoming(s), new THREE.Vector3(7.4, 1.95, 0.16)));
      const yaw = yawOf(s);
      for (const o of [-2.6, 2.6]) {
        const px = x + Math.cos(yaw) * o, pz = z - Math.sin(yaw) * o, gy = postBaseY(s, side, px, pz), hgt = Math.max(2, top - gy);
        posts.push(mtx(px, gy + hgt / 2, pz, yaw, 1, hgt, 1));
      }
      if (floatWorld) backs.push(mtx(x - s.rx * side * 2.6, s.y - side * s.hw * s.bank - 0.85, z - s.rz * side * 2.6, yaw, 5.8, 0.45, 5.8));
    }
    inst(new THREE.PlaneGeometry(1, 1), mat, boards, false);
    inst(new THREE.BoxGeometry(1, 1, 1), darkMetal, backs, false);
    inst(new THREE.CylinderGeometry(0.14, 0.18, 1, 8), darkMetal, posts, false);
  }

  // ---------- distance / sector marker boards (every ~500 m) ----------
  {
    const tex = canvasTex(256, 192, c => {
      c.fillStyle = '#0f1216'; c.fillRect(0, 0, 256, 192);
      c.strokeStyle = '#ffbe22'; c.lineWidth = 10; c.strokeRect(6, 6, 244, 180);
      c.fillStyle = '#ffbe22'; c.fillRect(22, 24, 212, 18); c.fillRect(22, 150, 212, 18);
      c.fillStyle = '#f5eed8'; c.font = 'bold 58px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SEC', 128, 98);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.42, roughness: 0.55, side: THREE.DoubleSide });
    disp.push(mat, tex);
    const boards: THREE.Matrix4[] = [], posts2: THREE.Matrix4[] = [];
    for (let i = 250, n = 1; i < N; i += 250, n++) {
      const s = S[i]; const side = n % 2 ? 1 : -1; if (!sideOK(s, side)) continue;
      const x = s.x + s.rx * side * (s.hw + 3), z = s.z + s.rz * side * (s.hw + 3);
      if (!clear(x, z, 1, 0)) continue;
      const ey = s.y - side * s.hw * s.bank, gy = postBaseY(s, side, x, z), top = ey + 3.1, hgt = Math.max(2, top - gy);
      posts2.push(mtx(x, gy + hgt / 2, z, 0, 1, hgt / 3, 1));
      boards.push(new THREE.Matrix4().compose(new THREE.Vector3(x, ey + 3.4, z), faceOncoming(s), new THREE.Vector3(1.9, 1.4, 1)));
    }
    inst(new THREE.CylinderGeometry(0.11, 0.15, 3, 8), darkMetal, posts2, false);
    inst(new THREE.PlaneGeometry(1, 1), mat, boards, false);
  }

  // ---------- high-detail recharge / repair pads (animated chevron deck + side tesla pylons) ----------
  {
    const padTex = canvasTex(512, 256, c => {
      c.fillStyle = '#0d1a24'; c.fillRect(0, 0, 512, 256);
      // Hazard border rails
      c.fillStyle = '#d9a514'; c.fillRect(0, 0, 24, 256); c.fillRect(488, 0, 24, 256);
      c.fillStyle = '#111'; for (let y = 0; y < 256; y += 32) { c.fillRect(0, y, 24, 16); c.fillRect(488, y, 24, 16); }
      // Glowing cyan recharge grates & forward chevrons
      for (let x = 44; x < 468; x += 60) {
        const g = c.createLinearGradient(x, 0, x + 44, 0);
        g.addColorStop(0, '#10445e'); g.addColorStop(0.5, '#4ae4ff'); g.addColorStop(1, '#10445e');
        c.fillStyle = g; c.fillRect(x, 18, 44, 220);
      }
      c.fillStyle = 'rgba(8,18,26,0.65)';
      for (let y = 0; y < 256; y += 32) c.fillRect(32, y, 448, 10);
      c.strokeStyle = '#b8f6ff'; c.lineWidth = 8;
      for (const cy of [84, 180]) { c.beginPath(); c.moveTo(150, cy + 36); c.lineTo(256, cy - 28); c.lineTo(362, cy + 36); c.stroke(); }
    });
    padTex.wrapS = padTex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: padTex, emissiveMap: padTex, emissive: '#58e2ff', emissiveIntensity: 1.05, roughness: 0.32, metalness: 0.5 });
    disp.push(mat, padTex);
    // Build every recharge/repair pad as a curved road-conforming surface mesh with tucked perimeter skirt:
    // follows longitudinal hill crests, road crown AND up to 21° corner banking with 0.00 m floating anywhere!
    const padPos: number[] = [], padUv: number[] = [], padInd: number[] = [];
    const coils: THREE.Matrix4[] = [], coilRings: THREE.Matrix4[] = [];
    const COLS = 12, ROWS = 5; // across (-0.71..+0.71 hw) with outer skirt tuck, along [i-2..i+2] (8 m)
    for (let i = 400; i < N - 10; i += 700) {
      const s = S[i];
      let ok = true;
      for (let r = -2; r <= 2; r++) {
        const j = td.main.closed ? ((i + r) % N + N) % N : i + r;
        if (j < 0 || j >= N || S[j].gap || S[j].ramp > 0 || S[j].zeroG || S[j].openL || S[j].openR || S[j].lake) { ok = false; break; } // (no pads on lakes)
      }
      if (!ok) continue;
      const v0 = padPos.length / 3;
      for (let r = 0; r < ROWS; r++) {
        const rs = S[td.main.closed ? ((i + r - 2) % N + N) % N : i + r - 2];
        const vCoord = r / (ROWS - 1);
        const endTuck = (r === 0 || r === ROWS - 1) ? -0.18 : 0.055 + dOff;
        for (let c = 0; c <= COLS; c++) {
          const uCoord = c / COLS;
          const sideTuck = (c === 0 || c === COLS) ? -0.18 : endTuck;
          const f = (c === 0 ? 0 : c === COLS ? 1 : (c - 1) / (COLS - 2));
          const lat = (f * 2 - 1) * rs.hw * 0.71;
          padPos.push(rs.x + rs.rx * lat, surfY(rs, lat) + sideTuck, rs.z + rs.rz * lat);
          padUv.push(uCoord, vCoord);
        }
      }
      const stride = COLS + 1;
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
        const a = v0 + r * stride + c, b = a + 1, d = a + stride, e = d + 1;
        padInd.push(a, b, d, b, e, d);
      }
      const yaw = yawOf(s);
      for (const sd of [-1, 1]) {
        if (!sideOK(s, sd)) continue;
        const px = s.x + s.rx * sd * (s.hw + 2.2), pz = s.z + s.rz * sd * (s.hw + 2.2);
        if (!clear(px, pz, 1.2, 0)) continue;
        const py = floatWorld ? s.y - sd * s.hw * s.bank : Math.min(s.y - sd * s.hw * s.bank, heightAt(px, pz) + 0.6);
        coils.push(mtx(px, py, pz, yaw));
        for (const h of [2.4, 3.4, 4.4]) coilRings.push(mtx(px, py + h, pz, yaw));
      }
    }
    if (padInd.length) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(padPos, 3));
      pg.setAttribute('uv', new THREE.Float32BufferAttribute(padUv, 2));
      pg.setIndex(padInd); pg.computeVertexNormals();
      const pm = new THREE.Mesh(pg, mat); pm.receiveShadow = true; group.add(pm); disp.push(pg);
    }
    const coilGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.85, 1.15, 3.4, 12).translate(0, -1.65, 0), // deep pedestal root so coils never float
      new THREE.CylinderGeometry(0.65, 0.85, 1.2, 12).translate(0, 0.6, 0),
      new THREE.CylinderGeometry(0.32, 0.42, 4.2, 12).translate(0, 3.1, 0),
      new THREE.SphereGeometry(0.48, 12, 8).translate(0, 5.3, 0),
    ].map(g => g.toNonIndexed()));
    inst(coilGeo, metal, coils, true);
    inst(new THREE.TorusGeometry(0.58, 0.08, 6, 20).rotateX(Math.PI / 2), cyanGlow, coilRings, false);
    anim.push(t => { padTex.offset.y = -(t * 0.45) % 1; });
  }

  // ---------- 2. floodlight towers with sun-visor hood & mounting yoke ----------
  {
    const poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [];
    const step = Math.round(170 / 2 / Math.max(0.5, det));
    for (let i = 0, k = 0; i < N; i += step, k++) {
      const s = S[i]; const side = k % 2 ? 1 : -1;
      if (!sideOK(s, side)) continue;
      const off = s.hw + 9; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!clear(x, z, 2, 1)) continue;
      const gy = heightAt(x, z); const hgt = s.y + 22 - gy;
      poles.push(mtx(x, gy + hgt / 2, z, 0, 1, hgt, 1));
      const yaw = Math.atan2(-s.rx * side, -s.rz * side);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, yaw, 0, 'YXZ'));
      heads.push(new THREE.Matrix4().compose(new THREE.Vector3(x, gy + hgt + 0.6, z), q, new THREE.Vector3(1, 1, 1)));
    }
    const pg = mergeGeometries([
      new THREE.CylinderGeometry(0.24, 0.48, 1, 10),
      new THREE.CylinderGeometry(0.75, 0.85, 0.05, 10).translate(0, -0.475, 0),
    ].map(g => g.toNonIndexed()));
    inst(pg, metal, poles, true);
    const hg = mergeGeometries([
      new THREE.BoxGeometry(3.8, 1.9, 0.55),
      new THREE.BoxGeometry(4.0, 0.14, 1.1).translate(0, 0.98, 0.25),
    ].map(g => g.toNonIndexed()));
    const lampTex = canvasTex(128, 64, c => {
      c.fillStyle = '#1d1f24'; c.fillRect(0, 0, 128, 64);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) {
        const g = c.createRadialGradient(16 + x * 32, 16 + y * 32, 2, 16 + x * 32, 16 + y * 32, 14);
        g.addColorStop(0, '#fff'); g.addColorStop(1, '#ffe4a6');
        c.fillStyle = g; c.beginPath(); c.arc(16 + x * 32, 16 + y * 32, 12, 0, 7); c.fill();
      }
    });
    const hm = new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.72, roughness: 0.38, emissiveMap: lampTex, emissive: '#fff4dd', emissiveIntensity: 1.45 });
    disp.push(hm, lampTex);
    inst(hg, hm, heads, false);
  }

  // ---------- 3. waving banners along straights ----------
  {
    const bannerTex = canvasTex(128, 512, c => {
      const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c8c4bc'); c.fillStyle = g; c.fillRect(0, 0, 128, 512);
      c.fillStyle = 'rgba(0,0,0,0.78)'; c.fillRect(0, 0, 128, 42); c.fillRect(0, 470, 128, 42);
      c.fillStyle = 'rgba(255,210,90,0.9)'; c.fillRect(0, 44, 128, 8); c.fillRect(0, 460, 128, 8);
      c.save(); c.translate(68, 256); c.rotate(-Math.PI / 2); c.fillStyle = 'rgba(0,0,0,0.85)'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PODRACE', 0, 0); c.restore();
      c.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 64; y < 454; y += 28) c.fillRect(8, y, 8, 14);
    });
    const bg = new THREE.PlaneGeometry(2.2, 7, 4, 4); bg.translate(1.1, 0, 0);
    // 100% GPU cloth wave (zero per-frame CPU matrix loop & buffer upload across hundreds of flags!)
    const bm = new THREE.MeshStandardNodeMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.72 });
    const fReach = clamp(positionGeometry.x.div(2.2), 0, 1);
    const fPh = hash(instanceIndex).mul(6.2832);
    const fWave = sin(time.mul(4.2).add(fPh).sub(positionGeometry.x.mul(1.8))).mul(fReach).mul(0.55);
    bm.positionNode = positionLocal.add(vec3(fWave, 0, fWave.mul(0.6)));
    disp.push(bm, bannerTex);
    const poleG = new THREE.CylinderGeometry(0.08, 0.11, 11, 6).translate(0, 5.5, 0);
    const flagMats: THREE.Matrix4[] = [], poles: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
    const palette = ['#d8432f', '#e8b830', '#2f7ad8', '#f2ece0', theme.barrierColor, '#30b070'];
    for (let i = 0; i < N; i += 16) {
      const s = S[i]; if (Math.abs(s.curv) > 1 / 400 || nearStart(i)) continue;
      if (rng() > 0.55 * det) continue;
      for (const side of [-1, 1]) {
        if (!sideOK(s, side)) continue;
        const off = s.hw + 1.6; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
        if (!clear(x, z, 0.3, 0)) continue;
        const ey = s.y - side * s.hw * s.bank, gy = postBaseY(s, side, x, z), top = ey + 9.5;
        poles.push(mtx(x, gy, z, 0, 1, Math.max(0.5, (top - gy) / 11), 1));
        flagMats.push(mtx(x, ey + 6, z, yawOf(s) + Math.PI / 2));
        colors.push(new THREE.Color(palette[Math.floor(rng() * palette.length)]));
      }
    }
    inst(poleG, darkMetal, poles, false);
    inst(bg, bm, flagMats, false, colors);
  }

  // ---------- 4. checkpoint energy gates over the track ----------
  {
    const ringMat = new THREE.MeshBasicMaterial({ color: barrier.clone().multiplyScalar(1.45), transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    disp.push(ringMat);
    const frames: THREE.BufferGeometry[] = [], rings: THREE.BufferGeometry[] = [], feet: THREE.BufferGeometry[] = [];
    const count = Math.round(N * 2 / 650);
    for (let g = 0; g < count; g++) {
      const i = Math.floor((g + 0.5) / count * N); const s = S[i];
      if (s.gap || s.ramp > 0 || nearStart(i) || s.openL || s.openR || s.roof > 0 || s.zeroG || s.bridge || s.underpass || s.lake) continue;
      const R = s.hw + 5;
      if (![-1, 1].every(sd => clear(s.x + s.rx * sd * R, s.z + s.rz * sd * R, 2.6, -0.5))) continue;
      const qY = new THREE.Quaternion().setFromAxisAngle(UP, yawOf(s));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), qY, new THREE.Vector3(1, 0.82, 1));
      const m1 = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), qY, new THREE.Vector3(1, 1, 1));
      (td.overheads ??= []).push({ idx: i, y0: 0, y1: 0, half: 1.3, arch: { R, sy: 0.82 } });
      frames.push(new THREE.TorusGeometry(R, 1.15, 14, 72, Math.PI).applyMatrix4(m));
      rings.push(new THREE.TorusGeometry(R - 1.65, 0.26, 8, 96, Math.PI).applyMatrix4(m));
      for (let k = 1; k < 12; k++) {
        const a = Math.PI * k / 12;
        frames.push(new THREE.BoxGeometry(0.9, 1.6, 2.2).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * R, Math.sin(a) * R, 0).applyMatrix4(m));
        rings.push(new THREE.BoxGeometry(0.45, 0.45, 2.8).translate(Math.cos(a) * (R - 1.5), Math.sin(a) * (R - 1.5), 0).applyMatrix4(m));
      }
      // Deep grounded foundation piers (or structural road-deck outrigger brackets on prison/ocean) so checkpoint arches NEVER float!
      for (const sd of [-1, 1]) {
        const wSide = -sd; // local +X = world -rx
        const fx = s.x + s.rx * wSide * R, fz = s.z + s.rz * wSide * R;
        const edgeOff = -wSide * s.hw * s.bank;
        if (floatWorld) {
          const bot = Math.min(-3.8, edgeOff - 2.6), pH = 1.2 - bot;
          feet.push(new THREE.CylinderGeometry(2.1, 2.9, pH, 16).translate(sd * R, bot + pH * 0.5, 0).applyMatrix4(m1));
          feet.push(new THREE.BoxGeometry(7.8, 1.35, 3.6).translate(sd * (R - 3.2), edgeOff - 1.1, 0).applyMatrix4(m1));
          feet.push(new THREE.BoxGeometry(4.8, 0.9, 5.2).translate(sd * R, bot, 0).applyMatrix4(m1));
        } else {
          const gyRel = Math.max(-32, Math.min(edgeOff - 0.8, heightAt(fx, fz) - s.y));
          const bot = gyRel - 4.5, pH = Math.max(5.5, 1.2 - bot);
          feet.push(new THREE.CylinderGeometry(2.1, 3.3, pH, 16).translate(sd * R, bot + pH * 0.5, 0).applyMatrix4(m1));
          feet.push(new THREE.BoxGeometry(5.4, 1.4, 5.8).translate(sd * R, gyRel - 0.2, 0).applyMatrix4(m1));
        }
      }
    }
    const merge = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!list.length) return; const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)); list.forEach(x => x.dispose()); if (!g) return;
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); disp.push(g);
    };
    merge(frames, metal, true); merge(rings, ringMat, false); merge(feet, darkMetal, true);
    anim.push(t => { ringMat.opacity = 0.68 + Math.sin(t * 4) * 0.18; });
  }

  // ---------- 5. turbine scorch on the built race deck (deterministic) ----------
  // 2026-11-23: these decals were ten thin, sharp, dark lines – tyre tracks, on a track for hovering pods – and they lay on every
  // ground: dark on white on the snow passages (reported by the user: "Streifen wie Reifenspuren, besonders auf Schnee"). Now: two
  // broad, soft soot streaks (the two engines of a pod that fired up there), and only on the built deck. Natural ground gets its marks
  // from the pods themselves (snow trails; `TODO.md` Abschnitt 9: sand and moon dust).
  {
    const tex = canvasTex(128, 512, c => {
      c.clearRect(0, 0, 128, 512);
      for (let k = 0; k < 2; k++) {
        const x = 38 + k * 52 + (h2(k, 1) - 0.5) * 8, hw = 15 + h2(k, 3) * 7, a = 0.2 + h2(k, 2) * 0.14;
        const g = c.createLinearGradient(x - hw, 0, x + hw, 0);
        g.addColorStop(0, 'rgba(14,11,9,0)'); g.addColorStop(0.5, `rgba(14,11,9,${a})`); g.addColorStop(1, 'rgba(14,11,9,0)');
        c.fillStyle = g; c.fillRect(x - hw, 0, hw * 2, 512);
      }
      // break the soot up (unburnt specks), then let it fade in and out along its length
      c.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 420; k++) { c.fillStyle = `rgba(0,0,0,${0.15 + h2(k, 7) * 0.45})`; c.beginPath(); c.arc(h2(k, 5) * 128, h2(k, 6) * 512, 0.8 + h2(k, 8) * 2.6, 0, Math.PI * 2); c.fill(); }
      c.globalCompositeOperation = 'destination-in';
      const f = c.createLinearGradient(0, 0, 0, 512); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.3, 'rgba(0,0,0,1)'); f.addColorStop(0.6, 'rgba(0,0,0,0.8)'); f.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = f; c.fillRect(0, 0, 128, 512);
      c.globalCompositeOperation = 'source-over';
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    disp.push(mat, tex);
    const pos: number[] = [], uv: number[] = [], ind: number[] = []; let v = 0;
    const count = Math.floor(N / 42 * det);
    for (let d = 0; d < count; d++) {
      const i0 = Math.floor(rng() * N); const len = 7 + Math.floor(rng() * 14); const width = 2.6 + rng() * 3.2;
      const s0 = S[i0]; const lat0 = (rng() * 2 - 1) * (s0.hw - 5); const drift = (rng() - 0.5) * 0.4;
      let ok = true; for (let k = 0; k <= len; k++) { const s = S[(i0 + k) % N]; if (s.gap || s.ramp > 0 || s.surf > 0 || (!td.main.closed && i0 + k >= N)) ok = false; } // (built deck only; the random numbers above are drawn either way)
      if (!ok) continue;
      for (let k = 0; k <= len; k++) {
        const s = S[(i0 + k) % N]; const lat = lat0 + drift * k;
        for (const sd of [-0.5, 0.5]) { const l = lat + sd * width; pos.push(s.x + s.rx * l, surfY(s, l) + 0.07 + dOff, s.z + s.rz * l); uv.push(sd + 0.5, k / len); }
        if (k > 0) ind.push(v - 2, v - 1, v, v - 1, v + 1, v);
        v += 2;
      }
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; group.add(m); disp.push(g);
    }
  }

  // ---------- 6. pit-side cargo crates, fuel barrels & service equipment ----------
  {
    const crates: THREE.Matrix4[] = [], barrels: THREE.Matrix4[] = [], cc: THREE.Color[] = [], bc: THREE.Color[] = [];
    const crateCols = ['#8a6a44', '#6d7480', '#a8462e', '#c79a3a'], barrelCols = ['#b8342a', '#3a6ab8', '#c8a030', '#4a4a4a'];
    for (let i = 0; i < N; i += 9) {
      if (rng() > 0.22 * det) continue;
      const s = S[i]; const side = rng() > 0.5 ? 1 : -1; if (!sideOK(s, side) || nearStart(i)) continue;
      const off = s.hw + 4 + rng() * 10; const cx = s.x + s.rx * side * off, cz = s.z + s.rz * side * off;
      const n = 2 + Math.floor(rng() * 5);
      for (let k = 0; k < n; k++) {
        const x = cx + (rng() - 0.5) * 6, z = cz + (rng() - 0.5) * 6; if (!clear(x, z, 1.5, 1)) continue; const gy = heightAt(x, z);
        if (rng() > 0.4) { const sz = 1.2 + rng() * 1.2; crates.push(mtx(x, gy + sz / 2 + (k > 2 ? sz : 0), z, rng() * 3, sz, sz, sz)); cc.push(new THREE.Color(crateCols[Math.floor(rng() * crateCols.length)])); }
        else { barrels.push(mtx(x, gy + 0.65, z, rng() * 3)); bc.push(new THREE.Color(barrelCols[Math.floor(rng() * barrelCols.length)])); }
      }
    }
    const crateTex = canvasTex(256, 256, c => {
      const g = c.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#d2d2d2'); g.addColorStop(1, '#a6a6a6'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
      c.fillStyle = 'rgba(0,0,0,0.14)'; for (let y = 22; y < 236; y += 30) c.fillRect(22, y, 212, 2);
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${h2(i, 1) < 0.5 ? '255,255,255' : '40,30,20'},${0.05 + h2(i, 2) * 0.08})`; c.fillRect(h2(i, 3) * 256, h2(i, 4) * 256, 2 + h2(i, 5) * 18, 1); }
      c.strokeStyle = '#4a4d52'; c.lineWidth = 18; c.strokeRect(9, 9, 238, 238);
      c.lineWidth = 12; c.beginPath(); c.moveTo(18, 18); c.lineTo(238, 238); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.strokeRect(2, 2, 252, 252);
      c.fillStyle = '#d9d9d9'; for (const [x, y] of [[9, 9], [247, 9], [9, 247], [247, 247], [128, 9], [128, 247], [9, 128], [247, 128]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
      c.fillStyle = '#1a1a1a'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('PODRACE', 128, 112); c.font = 'bold 14px monospace'; c.fillText('PARTS · 7-B', 128, 134);
      c.fillStyle = '#d9a514'; c.beginPath(); c.moveTo(196, 160); c.lineTo(236, 160); c.lineTo(236, 236); c.closePath(); c.fill();
      c.fillStyle = '#111'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(206 + k * 10, 160); c.lineTo(211 + k * 10, 160); c.lineTo(236, 185 + k * 12); c.lineTo(236, 179 + k * 12); c.fill(); }
    });
    const cm = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.72, metalness: 0.22 }); disp.push(cm, crateTex);
    inst(new THREE.BoxGeometry(1, 1, 1), cm, crates, false, cc);
    const bg = mergeGeometries([new THREE.CylinderGeometry(0.45, 0.45, 1.3, 16), new THREE.TorusGeometry(0.46, 0.04, 6, 16).rotateX(Math.PI / 2).translate(0, 0.35, 0), new THREE.TorusGeometry(0.46, 0.04, 6, 16).rotateX(Math.PI / 2).translate(0, -0.35, 0)].map(g => g.toNonIndexed()));
    const barrelTex = canvasTex(256, 128, c => {
      c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(30,25,20,${0.04 + h2(i, 6) * 0.1})`; c.fillRect(h2(i, 7) * 256, h2(i, 8) * 128, 1 + h2(i, 9) * 2, 6 + h2(i, 10) * 40); }
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 30, 256, 6); c.fillRect(0, 92, 256, 6);
      c.fillStyle = '#e8e2d0'; c.fillRect(96, 44, 64, 40); c.fillStyle = '#d9a514'; c.beginPath(); c.moveTo(128, 50); c.lineTo(146, 78); c.lineTo(110, 78); c.closePath(); c.fill();
      c.fillStyle = '#111'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText('!', 128, 75); c.font = 'bold 9px monospace'; c.fillText('FUEL-X', 128, 86);
    });
    const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.44, metalness: 0.62 }); disp.push(barrelMat, barrelTex);
    inst(bg, barrelMat, barrels, false, bc);
  }

  // ---------- 7. shoulder stones & weathered scree along road edges ----------
  if (theme.terrain !== 'prison' && theme.terrain !== 'ocean') {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mats: THREE.Matrix4[] = []; const cols: THREE.Color[] = [];
    const base = new THREE.Color(theme.palette.wall[1]);
    const count = Math.floor(N * 0.9 * det);
    for (let c = 0; c < count; c++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; if (!sideOK(s, side)) continue;
      const off = s.hw + 1 + Math.pow(rng(), 2) * 35; const x = s.x + s.rx * side * off + (rng() - 0.5) * 3, z = s.z + s.rz * side * off + (rng() - 0.5) * 3;
      const sz = 0.15 + Math.pow(rng(), 3) * 0.95; if (!clear(x, z, sz, 0)) continue; const gy = heightAt(x, z);
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, gy + sz * 0.28, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3)), new THREE.Vector3(sz, sz * 0.58, sz * (0.7 + rng() * 0.6))));
      cols.push(base.clone().multiplyScalar(0.62 + rng() * 0.68));
    }
    const sm = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }); disp.push(sm);
    inst(geo, sm, mats, false, cols);
  }

  // ---------- 8. spectator viewing decks with safety railings & sunshade canopies at jumps ----------
  {
    const crowd: THREE.Matrix4[] = []; const cc: THREE.Color[] = []; const decks: THREE.Matrix4[] = []; const awnings: THREE.Matrix4[] = [];
    for (let i = 1; i < N; i++) {
      if (!(S[i].ramp > 0 && S[i - 1].ramp === 0)) continue;
      const s = S[i];
      for (const side of [-1, 1]) {
        const off = s.hw + 17; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
        if (!clear(x, z, 10, 0)) continue;
        const yaw = Math.atan2(-s.rx * side, -s.rz * side);
        const deckY = s.y + 5;
        decks.push(mtx(x, deckY - 0.4, z, yaw, 30, 0.8, 10));
        // Front safety handrail + rear canopy masts + angled shade awning
        decks.push(mtx(x + Math.sin(yaw) * 4.8, deckY + 0.95, z + Math.cos(yaw) * 4.8, yaw, 30, 0.16, 0.16));
        awnings.push(mtx(x - Math.sin(yaw) * 0.5, deckY + 4.8, z - Math.cos(yaw) * 0.5, yaw, 31, 0.25, 11));
        for (const px of [-13, 0, 13]) for (const pz of [-4.2, 4.2]) {
          const lx = Math.cos(yaw) * px + Math.sin(yaw) * pz, lz = -Math.sin(yaw) * px + Math.cos(yaw) * pz;
          const topP = pz < 0 ? deckY + 4.7 : deckY;
          const colGround = floatWorld ? s.y - 28 : Math.min(deckY - 4, heightAt(x + lx, z + lz) - 2.5);
          decks.push(mtx(x + lx, (colGround + topP) / 2, z + lz, yaw, 0.55, topP - colGround, 0.55));
        }
        for (let k = 0; k < 110 * det; k++) {
          const px = (rng() - 0.5) * 28, pz = (rng() - 0.5) * 8; const lx = Math.cos(yaw) * px + Math.sin(yaw) * pz, lz = -Math.sin(yaw) * px + Math.cos(yaw) * pz;
          crowd.push(mtx(x + lx, deckY + 0.5, z + lz, yaw)); cc.push(new THREE.Color().setHSL(rng(), 0.55, 0.3 + rng() * 0.35));
        }
      }
    }
    inst(new THREE.BoxGeometry(1, 1, 1), darkMetal, decks, true);
    const awnMat = new THREE.MeshStandardMaterial({ color: theme.id === 'desert' || theme.id === 'mesa' ? '#b86832' : theme.barrierColor, roughness: 0.72, metalness: 0.1 }); disp.push(awnMat);
    inst(new THREE.BoxGeometry(1, 1, 1), awnMat, awnings, true);
    const pg = mergeGeometries([new THREE.BoxGeometry(0.5, 0.75, 0.35).toNonIndexed(), new THREE.SphereGeometry(0.2, 6, 5).translate(0, 0.55, 0).toNonIndexed()]);
    // 100% GPU crowd cheer jump (eliminates updating & uploading 1,500+ Matrix4s on CPU every single frame!)
    const crMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
    crMat.positionNode = positionLocal.add(vec3(0, max(sin(time.mul(5.8).add(hash(instanceIndex).mul(6.2832))), 0).mul(0.34), 0));
    disp.push(crMat);
    inst(pg, crMat, crowd, false, cc);
  }

  // ---------- 9. theme-specific architectural & organic props ----------
  const scatterFar = (count: number, dMin: number, dMax: number, r: number, fn: (x: number, y: number, z: number, s: Sample) => void) => {
    for (let c = 0; c < count * det; c++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; const off = s.hw + dMin + rng() * (dMax - dMin);
      const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!clear(x, z, r, 1.5)) continue;
      fn(x, heightAt(x, z), z, s);
    }
  };
  if (theme.id === 'desert' || theme.id === 'mesa') {
    const vap: THREE.Matrix4[] = [], huts: THREE.Matrix4[] = [];
    scatterFar(75, 25, 360, 2, (x, y, z) => vap.push(mtx(x, y, z, rng() * 6, 1, 0.8 + rng() * 0.65, 1)));
    for (let c = 0; c < 9; c++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1;
      const cx = s.x + s.rx * side * (s.hw + 58 + rng() * 85), cz = s.z + s.rz * side * (s.hw + 58 + rng() * 85);
      for (let k = 0; k < 5; k++) { const x = cx + (rng() - 0.5) * 42, z = cz + (rng() - 0.5) * 42; const sz = 3.2 + rng() * 4.2; if (!clear(x, z, sz, 2)) continue; huts.push(mtx(x, heightAt(x, z) - 0.4, z, rng() * 6, sz, sz * 0.82, sz)); }
    }
    const vg = mergeGeometries([
      new THREE.CylinderGeometry(0.32, 0.52, 6.2, 12).translate(0, 3.1, 0),
      new THREE.CylinderGeometry(0.95, 0.95, 0.22, 16).translate(0, 4.2, 0),
      new THREE.CylinderGeometry(0.74, 0.74, 0.16, 16).translate(0, 5.25, 0),
      new THREE.ConeGeometry(0.28, 0.95, 10).translate(0, 6.55, 0),
      new THREE.BoxGeometry(0.1, 2.2, 0.55).translate(0.45, 2.8, 0),
      new THREE.BoxGeometry(1.3, 0.85, 1.3).translate(0, 0.42, 0),
    ].map(g => g.toNonIndexed()));
    inst(vg, metal, vap, true);
    const hg = mergeGeometries([
      new THREE.CylinderGeometry(1.02, 1.06, 0.45, 20).translate(0, 0.22, 0),
      new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.4, 0),
      new THREE.CylinderGeometry(0.32, 0.32, 0.65, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).translate(0, 0.35, 0.92),
      new THREE.CylinderGeometry(0.42, 0.45, 0.8, 12).translate(-0.92, 0.4, -0.2), // side silo annex
    ].map(g => g.toNonIndexed()));
    const hutMat = new THREE.MeshStandardMaterial({ color: '#d8c39c', roughness: 0.94 }); disp.push(hutMat);
    inst(hg, hutMat, huts, true);
  }
  if (theme.id === 'ice') {
    const domes: THREE.Matrix4[] = [];
    scatterFar(26, 40, 400, 13, (x, y, z) => { const s = 5 + rng() * 8; domes.push(mtx(x, y - 0.5, z, rng() * 6, s, s * 0.72, s)); });
    const dg = mergeGeometries([
      new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.BoxGeometry(0.38, 0.35, 0.45).translate(0, 0.18, 0.95), // airlock vestibule
      new THREE.CylinderGeometry(0.03, 0.04, 1.3, 6).translate(0.3, 1.4, 0),
    ].map(g => g.toNonIndexed()));
    const dm = new THREE.MeshStandardMaterial({ color: '#e8eef5', roughness: 0.28, metalness: 0.32 }); disp.push(dm);
    inst(dg, dm, domes, true);
    const ringG = new THREE.TorusGeometry(1.0, 0.03, 6, 40).rotateX(Math.PI / 2).translate(0, 0.08, 0);
    inst(ringG, cyanGlow, domes.map(m => m.clone()), false);
  }

  if (theme.id === 'jungle') {
    const stems: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
    scatterFar(70, 15, 300, 11, (x, y, z) => { const s = 1.5 + rng() * 3; stems.push(mtx(x, y, z, 0, s, s, s)); caps.push(mtx(x, y + 6 * s, z, rng() * 6, s, s, s)); });
    const sg = mergeGeometries([
      new THREE.CylinderGeometry(0.34, 0.68, 6, 10).translate(0, 3, 0),
      new THREE.TorusGeometry(0.56, 0.1, 6, 14).rotateX(Math.PI / 2).translate(0, 4.6, 0), // stem veil ring
    ].map(g => g.toNonIndexed()));
    const stMat = new THREE.MeshStandardMaterial({ color: '#d8cdb0', roughness: 0.8 }); disp.push(stMat);
    inst(sg, stMat, stems, true);
    const capG = new THREE.SphereGeometry(2.45, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.54); capG.scale(1, 0.55, 1);
    const capTex = canvasTex(256, 128, c => {
      const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#5a1e52'); g.addColorStop(1, '#8c346e'); c.fillStyle = g; c.fillRect(0, 0, 256, 128);
      for (let k = 0; k < 44; k++) { c.fillStyle = '#ffe8a0'; c.beginPath(); c.arc(h2(k, 1) * 256, h2(k, 2) * 110, 3 + h2(k, 3) * 6, 0, 7); c.fill(); }
    });
    const cm = new THREE.MeshStandardMaterial({ map: capTex, emissiveMap: capTex, emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.58, side: THREE.DoubleSide }); disp.push(cm, capTex);
    inst(capG, cm, caps, true);
  }
  if (theme.id === 'crystal') {
    const fl: { x: number; y: number; z: number; s: number; ph: number }[] = [];
    scatterFar(42, 6, 125, 4, (x, _y, z, s) => fl.push({ x, y: s.y + 10 + rng() * 25, z, s: 1.5 + rng() * 3, ph: rng() * 6 }));
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.58, 1.7, 0.58);
    const m = new THREE.MeshStandardMaterial({ color: '#d8b0ff', roughness: 0.18, metalness: 0.12, emissive: '#9a5aff', emissiveIntensity: 0.8, flatShading: true }); disp.push(m);
    const im = inst(g, m, fl.map(f => mtx(f.x, f.y, f.z, 0, f.s, f.s, f.s)), true);
    fl.forEach(f => { if (rng() > 0.6) emitters.push({ x: f.x, y: f.y, z: f.z, type: 'sparkle' }); });
    if (im) anim.push(t => { fl.forEach((f, i) => { tmpQ.setFromAxisAngle(UP, t * 0.6 + f.ph); tmpM.compose(tmpV.set(f.x, f.y + Math.sin(t + f.ph) * 1.5, f.z), tmpQ, tmpS.set(f.s, f.s, f.s)); im.setMatrixAt(i, tmpM); }); im.instanceMatrix.needsUpdate = true; });
  }
  if (theme.id === 'oovo') {
    const cells: THREE.Matrix4[] = []; const bars: THREE.Matrix4[] = [];
    scatterFar(30, 40, 250, 12, (x, _y, z, s) => {
      const sz = 8 + rng() * 10; const cy = s.y + 6 + rng() * 30;
      cells.push(mtx(x, cy, z, rng() * 6, sz, sz * 0.8, sz * 0.6));
      for (let k = 0; k < 6; k++) bars.push(mtx(x + (k - 2.5) * sz * 0.09, cy, z + sz * 0.31, 0, 1, sz * 0.8, 1));
    });
    const cellTex = canvasTex(128, 128, c => { c.fillStyle = '#1a2030'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#8a4aff'; for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { if (h2(x, y + 3) < 0.42) c.fillRect(x * 32 + 6, y * 16 + 4, 20, 9); } c.fillStyle = '#0a0c12'; c.fillRect(0, 0, 128, 6); });
    const cm = new THREE.MeshStandardMaterial({ color: '#4a5568', metalness: 0.85, roughness: 0.3, emissiveMap: cellTex, emissive: '#ffffff', emissiveIntensity: 0.8 }); disp.push(cm, cellTex);
    inst(new THREE.BoxGeometry(1, 1, 1), cm, cells, true);
    inst(new THREE.BoxGeometry(0.15, 1, 0.15), darkMetal, bars, false);
    const sats: { x: number; y: number; z: number; ph: number }[] = [];
    scatterFar(20, 60, 400, 6, (x, _y, z, s) => sats.push({ x, y: s.y + 30 + rng() * 50, z, ph: rng() * 6 }));
    const sg = mergeGeometries([new THREE.BoxGeometry(1.2, 1.2, 2).toNonIndexed(), new THREE.BoxGeometry(5.4, 0.08, 1.5).toNonIndexed(), new THREE.CylinderGeometry(0.15, 0.15, 2, 8).translate(0, 1.2, 0).toNonIndexed(), new THREE.SphereGeometry(0.4, 10, 8).translate(0, 2.3, 0).toNonIndexed()]);
    const sm = new THREE.MeshStandardMaterial({ color: '#c8ccd4', metalness: 0.9, roughness: 0.25, emissive: theme.barrierColor, emissiveIntensity: 0.4 }); disp.push(sm);
    const sim = inst(sg, sm, sats.map(o => mtx(o.x, o.y, o.z, 0)), true);
    if (sim) anim.push(t => { sats.forEach((o, i) => { tmpQ.setFromAxisAngle(UP, t * 0.4 + o.ph); tmpM.compose(tmpV.set(o.x, o.y + Math.sin(t * 0.5 + o.ph) * 2, o.z), tmpQ, tmpS.set(1, 1, 1)); sim.setMatrixAt(i, tmpM); }); sim.instanceMatrix.needsUpdate = true; });
    const ants: THREE.Matrix4[] = [];
    scatterFar(25, 20, 200, 3, (x, y, z) => ants.push(mtx(x, y, z, rng() * 6, 1, 0.7 + rng() * 0.8, 1)));
    const ag = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.4, 18, 8).translate(0, 9, 0).toNonIndexed(), new THREE.CylinderGeometry(0.05, 0.05, 6, 6).rotateZ(0.6).translate(2, 16, 0).toNonIndexed(), new THREE.SphereGeometry(0.5, 10, 8).translate(0, 18.4, 0).toNonIndexed()]);
    inst(ag, metal, ants, true);
    const deb: { x: number; y: number; z: number; sp: number }[] = [];
    scatterFar(40, 15, 180, 2, (x, _y, z, s) => deb.push({ x, y: s.y + 2 + rng() * 20, z, sp: (rng() - 0.5) * 0.5 }));
    const dg = mergeGeometries([new THREE.BoxGeometry(2.5, 0.4, 1.2).toNonIndexed(), new THREE.BoxGeometry(0.3, 0.8, 1.6).translate(1.1, 0.4, 0).toNonIndexed()]);
    const dim = inst(dg, darkMetal, deb.map(o => mtx(o.x, o.y, o.z, 0)), false);
    if (dim) anim.push(t => { deb.forEach((o, i) => { tmpQ.setFromEuler(new THREE.Euler(t * o.sp, t * o.sp * 1.7, t * o.sp * 0.6)); tmpM.compose(tmpV.set(o.x, o.y + Math.sin(t * 0.3 + i) * 0.6, o.z), tmpQ, tmpS.set(1, 1, 1)); dim.setMatrixAt(i, tmpM); }); dim.instanceMatrix.needsUpdate = true; });
    const signTex = canvasTex(512, 256, c => {
      c.fillStyle = '#111820'; c.fillRect(0, 0, 512, 256); c.strokeStyle = '#3ad8ff'; c.lineWidth = 12; c.strokeRect(6, 6, 500, 244);
      c.fillStyle = '#ffcc1a'; c.font = 'bold 70px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚠ ZERO-G ⚠', 256, 100);
      c.fillStyle = '#3ad8ff'; c.font = '36px sans-serif'; c.fillText('SCHWERELOSIGKEIT', 256, 175);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }); disp.push(signMat, signTex);
    const signs: THREE.Matrix4[] = [];
    // (2026-11-23: turned by half a turn – `faceOncoming` points the plane's FRONT along the track, an arriving pod saw the back of the sign: mirror writing)
    for (let i = 1; i < N; i++) { if (S[i].zeroG && !S[i - 1].zeroG) { const s = S[i]; signs.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + 12, s.z), new THREE.Quaternion().setFromAxisAngle(UP, yawOf(s) + Math.PI), new THREE.Vector3(1, 1, 1))); } }
    inst(new THREE.PlaneGeometry(14, 7), signMat, signs, false);
  }
  if (theme.id === 'lava') {
    for (let c = 0; c < 30; c++) { const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; const off = s.hw + 20 + rng() * 150; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off; if (!clear(x, z, 3)) continue; emitters.push({ x, y: heightAt(x, z), z, type: rng() > 0.4 ? 'smoke' : 'embers' }); }
  }
  if (theme.id === 'ice' || theme.id === 'jungle' || theme.id === 'malastare') {
    for (let c = 0; c < 16; c++) { const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; const off = s.hw + 15 + rng() * 100; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off; if (!clear(x, z, 3)) continue; emitters.push({ x, y: heightAt(x, z), z, type: 'steam' }); }
  }

  return { emitters, update: (t: number) => anim.forEach(f => f(t)) };
}
