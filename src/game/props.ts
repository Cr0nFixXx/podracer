import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import type { Sample, TrackData } from './trackBuilder';

export interface Emitter { x: number; y: number; z: number; type: 'smoke' | 'steam' | 'embers' | 'sparkle'; }
type Disp = { dispose: () => void }[];

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();

function surfY(s: Sample, lat: number) { const e = Math.min(1, Math.abs(lat) / s.hw); return s.y + s.ramp - lat * s.bank + (1 - e * e) * 0.2; }
function yawOf(s: Sample) { return Math.atan2(s.tx, s.tz); }
// rotation that makes a panel's front (+Z) point toward oncoming pods
function faceOncoming(s: Sample) { return new THREE.Quaternion().setFromAxisAngle(UP, yawOf(s)); }

export function addProps(td: TrackData, theme: ThemeDef, group: THREE.Group, gfx: GfxSettings, heightAt: (x: number, z: number) => number, disp: Disp, rng: () => number, clear: (x: number, z: number, r: number, margin?: number) => boolean) {
  const S = td.main.samples; const N = S.length;
  const det = gfx.detail;
  const anim: ((t: number) => void)[] = [];
  const emitters: Emitter[] = [];
  const barrier = new THREE.Color(theme.barrierColor);
  const metal = new THREE.MeshStandardMaterial({ color: '#7d828c', metalness: 0.9, roughness: 0.32 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#33363d', metalness: 0.8, roughness: 0.45 });
  disp.push(metal, darkMetal);
  const sideOK = (s: Sample, side: number) => !s.gap && s.ramp === 0 && !(side > 0 ? s.openR : s.openL) && !((side > 0 ? s.hR : s.hL) > 0);
  const nearStart = (i: number) => { const d = Math.abs(i - td.startIdx); return Math.min(d, N - d) < 70 || (!td.main.closed && Math.abs(i - td.finishIdx) < 70); };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow = true, colors?: THREE.Color[]) => {
    if (!mats.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = shadow; im.receiveShadow = true; group.add(im); disp.push(geo);
    return im;
  };
  const mtx = (x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sz));

  // ---------- 1. corner arrow boards ----------
  {
    const tex = canvasTex(512, 128, c => {
      c.fillStyle = '#111'; c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#ffcc1a';
      for (let k = 0; k < 4; k++) { const x0 = 30 + k * 120; c.beginPath(); c.moveTo(x0, 14); c.lineTo(x0 + 60, 64); c.lineTo(x0, 114); c.lineTo(x0 + 35, 114); c.lineTo(x0 + 95, 64); c.lineTo(x0 + 35, 14); c.closePath(); c.fill(); }
      c.strokeStyle = '#ffcc1a'; c.lineWidth = 8; c.strokeRect(4, 4, 504, 120);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.5, side: THREE.DoubleSide });
    disp.push(mat, tex);
    const boards: THREE.Matrix4[] = [], posts: THREE.Matrix4[] = [];
    let lastI = -100;
    for (let i = 0; i < N; i += 4) {
      const s = S[i]; if (Math.abs(s.curv) < 1 / 160 || i - lastI < 22 || nearStart(i)) continue;
      const side = s.curv > 0 ? -1 : 1; // outer side
      if (!sideOK(s, side)) continue;
      const off = s.hw + 5; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!clear(x, z, 3.5, 0.3)) continue;
      lastI = i;
      const gy = Math.max(heightAt(x, z), s.y - 4);
      const top = s.y + 4.6;
      boards.push(new THREE.Matrix4().compose(new THREE.Vector3(x, top, z), faceOncoming(s), new THREE.Vector3(s.curv > 0 ? -7 : 7, 1.75, 1)));
      const hgt = top - gy; const yaw = yawOf(s);
      for (const o of [-2.6, 2.6]) posts.push(mtx(x + Math.cos(yaw) * o, gy + hgt / 2, z - Math.sin(yaw) * o, yaw, 1, hgt, 1));
    }
    inst(new THREE.PlaneGeometry(1, 1), mat, boards, true);
    inst(new THREE.CylinderGeometry(0.12, 0.14, 1, 8), darkMetal, posts, true);
  }

  // ---------- distance markers (every ~500 m) ----------
  {
    const tex = canvasTex(128, 128, c => { c.fillStyle = '#111'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#ffcc1a'; c.lineWidth = 8; c.strokeRect(4, 4, 120, 120); });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.4, roughness: 0.6 });
    disp.push(mat, tex);
    const boards: THREE.Matrix4[] = [], posts2: THREE.Matrix4[] = [];
    for (let i = 250, n = 1; i < N; i += 250, n++) {
      const s = S[i]; const side = n % 2 ? 1 : -1; if (!sideOK(s, side)) continue;
      const x = s.x + s.rx * side * (s.hw + 3), z = s.z + s.rz * side * (s.hw + 3);
      if (!clear(x, z, 1, 0)) continue;
      const gy = Math.max(heightAt(x, z), s.y - 4);
      posts2.push(mtx(x, gy + 1.5, z, 0, 1, (s.y + 3 - gy) / 3, 1));
      boards.push(new THREE.Matrix4().compose(new THREE.Vector3(x, s.y + 3.4, z), faceOncoming(s), new THREE.Vector3(1.6, 1.2, 1)));
    }
    inst(new THREE.CylinderGeometry(0.1, 0.12, 3, 8), darkMetal, posts2, false);
    inst(new THREE.PlaneGeometry(1, 1), mat, boards, false);
  }

  // ---------- repair pads (glowing cyan strips) ----------
  {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ad8ff').multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.8 });
    disp.push(mat);
    const pads: THREE.Matrix4[] = [];
    for (let i = 400; i < N; i += 700) {
      const s = S[i]; if (s.gap || s.ramp > 0 || s.zeroG) continue;
      const yaw = yawOf(s);
      pads.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.ramp + 0.15, s.z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(s.hw * 1.4, 1, 6)));
    }
    inst(new THREE.BoxGeometry(1, 0.08, 1), mat, pads, false);
  }

  // ---------- 2. floodlight towers ----------
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
    const pg = mergeGeometries([new THREE.CylinderGeometry(0.25, 0.45, 1, 10), new THREE.CylinderGeometry(0.6, 0.6, 0.02, 10).translate(0, -0.5, 0)]);
    inst(pg, metal, poles, true);
    const hg = new THREE.BoxGeometry(3.6, 1.8, 0.5);
    const lampTex = canvasTex(128, 64, c => { c.fillStyle = '#222'; c.fillRect(0, 0, 128, 64); for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) { const g = c.createRadialGradient(16 + x * 32, 16 + y * 32, 2, 16 + x * 32, 16 + y * 32, 14); g.addColorStop(0, '#fff'); g.addColorStop(1, '#ffe8b0'); c.fillStyle = g; c.beginPath(); c.arc(16 + x * 32, 16 + y * 32, 12, 0, 7); c.fill(); } });
    const hm = new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.7, roughness: 0.4, emissiveMap: lampTex, emissive: '#fff4dd', emissiveIntensity: 1.6 });
    disp.push(hm, lampTex);
    inst(hg, hm, heads, false);
  }

  // ---------- 3. waving banners along straights ----------
  {
    const bannerTex = canvasTex(128, 512, c => {
      const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfcfcf'); c.fillStyle = g; c.fillRect(0, 0, 128, 512);
      c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(0, 0, 128, 40); c.fillRect(0, 472, 128, 40);
      c.save(); c.translate(64, 256); c.rotate(-Math.PI / 2); c.fillStyle = 'rgba(0,0,0,0.85)'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PODRACE', 0, 0); c.restore();
      c.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 60; y < 460; y += 28) c.fillRect(8, y, 8, 14);
    });
    const bg = new THREE.PlaneGeometry(2.2, 7, 4, 8); bg.translate(1.1, 0, 0);
    const pos = bg.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.6) * 0.25 * (pos.getX(i) / 2.2));
    bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.7 }); disp.push(bm, bannerTex);
    const poleG = new THREE.CylinderGeometry(0.08, 0.1, 11, 6).translate(0, 5.5, 0);
    const base: { x: number; y: number; z: number; yaw: number; ph: number }[] = []; const poles: THREE.Matrix4[] = []; const colors: THREE.Color[] = [];
    const palette = ['#d8432f', '#e8b830', '#2f7ad8', '#ffffff', theme.barrierColor, '#30b070'];
    for (let i = 0; i < N; i += 15) {
      const s = S[i]; if (Math.abs(s.curv) > 1 / 400 || nearStart(i)) continue;
      if (rng() > 0.55 * det) continue;
      for (const side of [-1, 1]) {
        if (!sideOK(s, side)) continue;
        const off = s.hw + 1.6; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
        if (!clear(x, z, 0.3, 0)) continue;
        const gy = Math.max(heightAt(x, z), s.y - 3.8);
        poles.push(mtx(x, gy, z, 0, 1, (s.y + 9.5 - gy) / 11, 1));
        base.push({ x, y: s.y + 6, z, yaw: yawOf(s) + Math.PI / 2, ph: rng() * 6 });
        colors.push(new THREE.Color(palette[Math.floor(rng() * palette.length)]));
      }
    }
    inst(poleG, darkMetal, poles, false);
    const flags = inst(bg, bm, base.map(b => mtx(b.x, b.y, b.z, b.yaw)), false, colors);
    if (flags) anim.push(t => {
      base.forEach((b, i) => { tmpQ.setFromAxisAngle(UP, b.yaw + Math.sin(t * 3 + b.ph) * 0.35); tmpM.compose(tmpV.set(b.x, b.y, b.z), tmpQ, tmpS.set(1, 1, 1)); flags.setMatrixAt(i, tmpM); });
      flags.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- 4. energy gates over the track (merged per material across all gates) ----------
  {
    const ringMat = new THREE.MeshBasicMaterial({ color: barrier.clone().multiplyScalar(1.6), transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    disp.push(ringMat);
    const frames: THREE.BufferGeometry[] = [], rings: THREE.BufferGeometry[] = [], feet: THREE.BufferGeometry[] = [];
    const count = Math.round(N * 2 / 650);
    for (let g = 0; g < count; g++) {
      const i = Math.floor((g + 0.5) / count * N); const s = S[i];
      if (s.gap || s.ramp > 0 || nearStart(i) || s.openL || s.openR) continue;
      const R = s.hw + 5;
      if (![-1, 1].every(sd => clear(s.x + s.rx * sd * R, s.z + s.rz * sd * R, 2.6, -0.5))) continue;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(UP, yawOf(s)), new THREE.Vector3(1, 0.55, 1));
      frames.push(new THREE.TorusGeometry(R, 1.1, 14, 72, Math.PI).applyMatrix4(m));
      rings.push(new THREE.TorusGeometry(R - 1.6, 0.25, 8, 96, Math.PI).applyMatrix4(m));
      for (let k = 1; k < 12; k++) { const a = Math.PI * k / 12; rings.push(new THREE.BoxGeometry(0.5, 0.5, 2.6).translate(Math.cos(a) * R, Math.sin(a) * R, 0).applyMatrix4(m)); }
      for (const sd of [-1, 1]) feet.push(new THREE.CylinderGeometry(2, 2.6, 4, 16).translate(sd * R, -1, 0).applyMatrix4(m));
    }
    const merge = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!list.length) return; const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)); list.forEach(x => x.dispose()); if (!g) return;
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); disp.push(g);
    };
    merge(frames, metal, true); merge(rings, ringMat, false); merge(feet, darkMetal, true);
    anim.push(t => { ringMat.opacity = 0.65 + Math.sin(t * 4) * 0.2; });
  }

  // ---------- 5. skid / scorch marks on the road (strip decals following the surface) ----------
  {
    const tex = canvasTex(128, 512, c => {
      c.clearRect(0, 0, 128, 512);
      for (let k = 0; k < 9; k++) {
        const x = 10 + k * 13 + Math.random() * 6; const a = 0.25 + Math.random() * 0.5;
        const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, `rgba(10,8,6,${a})`); g.addColorStop(0.85, `rgba(10,8,6,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x, 0, 3 + Math.random() * 5, 512);
      }
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    disp.push(mat, tex);
    const pos: number[] = [], uv: number[] = [], ind: number[] = []; let v = 0;
    const count = Math.floor(N / 45 * det);
    for (let d = 0; d < count; d++) {
      const i0 = Math.floor(rng() * N); const len = 6 + Math.floor(rng() * 12); const width = 2.5 + rng() * 3;
      const s0 = S[i0]; const lat0 = (rng() * 2 - 1) * (s0.hw - 5); const drift = (rng() - 0.5) * 0.4;
      let ok = true; for (let k = 0; k <= len; k++) { const s = S[(i0 + k) % N]; if (s.gap || s.ramp > 0 || (!td.main.closed && i0 + k >= N)) ok = false; }
      if (!ok) continue;
      for (let k = 0; k <= len; k++) {
        const s = S[(i0 + k) % N]; const lat = lat0 + drift * k;
        for (const sd of [-0.5, 0.5]) { const l = lat + sd * width; pos.push(s.x + s.rx * l, surfY(s, l) + 0.04, s.z + s.rz * l); uv.push(sd + 0.5, k / len); }
        if (k > 0) ind.push(v - 2, v - 1, v, v - 1, v + 1, v);
        v += 2;
      }
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; group.add(m); disp.push(g);
    }
  }

  // ---------- 6. crates, barrels and containers next to the track ----------
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
      const g = c.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#d2d2d2'); g.addColorStop(1, '#a8a8a8'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
      c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 22; y < 236; y += 30) c.fillRect(22, y, 212, 2);              // plank seams
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,30,20'},${0.05 + Math.random() * 0.08})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 18, 1); }
      c.strokeStyle = '#4a4d52'; c.lineWidth = 18; c.strokeRect(9, 9, 238, 238);                                     // steel frame
      c.lineWidth = 12; c.beginPath(); c.moveTo(18, 18); c.lineTo(238, 238); c.stroke();                            // brace
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.strokeRect(2, 2, 252, 252);
      c.fillStyle = '#d9d9d9'; for (const [x, y] of [[9, 9], [247, 9], [9, 247], [247, 247], [128, 9], [128, 247], [9, 128], [247, 128]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
      c.fillStyle = '#1a1a1a'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('PODRACE', 128, 112); c.font = 'bold 14px monospace'; c.fillText('PARTS · 7-B', 128, 134);
      c.fillStyle = '#d9a514'; c.beginPath(); c.moveTo(196, 160); c.lineTo(236, 160); c.lineTo(236, 236); c.closePath(); c.fill();
      c.fillStyle = '#111'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(206 + k * 10, 160); c.lineTo(211 + k * 10, 160); c.lineTo(236, 185 + k * 12); c.lineTo(236, 179 + k * 12); c.fill(); }
    });
    const cm = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.75, metalness: 0.2 }); disp.push(cm, crateTex);
    inst(new THREE.BoxGeometry(1, 1, 1), cm, crates, true, cc);
    const bg = mergeGeometries([new THREE.CylinderGeometry(0.45, 0.45, 1.3, 16), new THREE.TorusGeometry(0.46, 0.04, 6, 16).rotateX(Math.PI / 2).translate(0, 0.35, 0), new THREE.TorusGeometry(0.46, 0.04, 6, 16).rotateX(Math.PI / 2).translate(0, -0.35, 0)].map(g => g.toNonIndexed()));
    const barrelTex = canvasTex(256, 128, c => {
      c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(30,25,20,${0.04 + Math.random() * 0.1})`; c.fillRect(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 2, 6 + Math.random() * 40); }
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 30, 256, 6); c.fillRect(0, 92, 256, 6);
      c.fillStyle = '#e8e2d0'; c.fillRect(96, 44, 64, 40); c.fillStyle = '#d9a514'; c.beginPath(); c.moveTo(128, 50); c.lineTo(146, 78); c.lineTo(110, 78); c.closePath(); c.fill();
      c.fillStyle = '#111'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText('!', 128, 75); c.font = 'bold 9px monospace'; c.fillText('FUEL-X', 128, 92 - 6);
    });
    const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.45, metalness: 0.6 }); disp.push(barrelMat, barrelTex);
    inst(bg, barrelMat, barrels, true, bc);
  }

  // ---------- 7. gravel / small stones along the edges ----------
  if (theme.terrain !== 'city') {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mats: THREE.Matrix4[] = []; const cols: THREE.Color[] = [];
    const base = new THREE.Color(theme.palette.wall[1]);
    const count = Math.floor(N * 0.9 * det);
    for (let c = 0; c < count; c++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; if (!sideOK(s, side)) continue;
      const off = s.hw + 1 + Math.pow(rng(), 2) * 35; const x = s.x + s.rx * side * off + (rng() - 0.5) * 3, z = s.z + s.rz * side * off + (rng() - 0.5) * 3;
      const sz = 0.15 + Math.pow(rng(), 3) * 0.9; if (!clear(x, z, sz, 0)) continue; const gy = heightAt(x, z);
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, gy + sz * 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3)), new THREE.Vector3(sz, sz * 0.6, sz * (0.7 + rng() * 0.6))));
      cols.push(base.clone().multiplyScalar(0.6 + rng() * 0.7));
    }
    inst(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), mats, false, cols);
  }

  // ---------- 8. spectator platforms at the jumps ----------
  {
    const crowd: THREE.Matrix4[] = []; const cc: THREE.Color[] = []; const decks: THREE.Matrix4[] = [];
    for (let i = 1; i < N; i++) {
      if (!(S[i].ramp > 0 && S[i - 1].ramp === 0)) continue;
      const s = S[i];
      for (const side of [-1, 1]) {
        const off = s.hw + 17; const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
        if (!clear(x, z, 10, 0)) continue;
        const yaw = Math.atan2(-s.rx * side, -s.rz * side);
        const deckY = s.y + 5;
        decks.push(mtx(x, deckY - 0.4, z, yaw, 30, 0.8, 10));
        const gy = heightAt(x, z);
        for (const px of [-13, 13]) for (const pz of [-4, 4]) { const lx = Math.cos(yaw) * px + Math.sin(yaw) * pz, lz = -Math.sin(yaw) * px + Math.cos(yaw) * pz; decks.push(mtx(x + lx, (gy + deckY) / 2, z + lz, yaw, 0.6, deckY - gy, 0.6)); }
        for (let k = 0; k < 110 * det; k++) {
          const px = (rng() - 0.5) * 28, pz = (rng() - 0.5) * 8; const lx = Math.cos(yaw) * px + Math.sin(yaw) * pz, lz = -Math.sin(yaw) * px + Math.cos(yaw) * pz;
          crowd.push(mtx(x + lx, deckY + 0.5, z + lz, yaw)); cc.push(new THREE.Color().setHSL(rng(), 0.55, 0.3 + rng() * 0.35));
        }
      }
    }
    inst(new THREE.BoxGeometry(1, 1, 1), darkMetal, decks, true);
    const pg = mergeGeometries([new THREE.BoxGeometry(0.5, 0.75, 0.35).toNonIndexed(), new THREE.SphereGeometry(0.2, 8, 6).translate(0, 0.55, 0).toNonIndexed()]);
    const crowdMesh = inst(pg, new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowd, false, cc);
    if (crowdMesh) { const base = crowd.map(m => m.clone()); const ph = crowd.map(() => rng() * 6); anim.push(t => { for (let i = 0; i < base.length; i += 1) { tmpM.copy(base[i]); tmpM.elements[13] += Math.max(0, Math.sin(t * 6 + ph[i])) * 0.35; crowdMesh.setMatrixAt(i, tmpM); } crowdMesh.instanceMatrix.needsUpdate = true; }); }
  }

  // ---------- 9. theme specific props ----------
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
    scatterFar(70, 25, 350, 2, (x, y, z) => vap.push(mtx(x, y, z, rng() * 6, 1, 0.8 + rng() * 0.6, 1)));
    for (let c = 0; c < 8; c++) { const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; const cx = s.x + s.rx * side * (s.hw + 60 + rng() * 80), cz = s.z + s.rz * side * (s.hw + 60 + rng() * 80); for (let k = 0; k < 5; k++) { const x = cx + (rng() - 0.5) * 40, z = cz + (rng() - 0.5) * 40; const sz = 3 + rng() * 4; if (!clear(x, z, sz, 2)) continue; huts.push(mtx(x, heightAt(x, z) - 0.5, z, rng() * 6, sz, sz * 0.8, sz)); } }
    const vg = mergeGeometries([new THREE.CylinderGeometry(0.35, 0.5, 6, 12).translate(0, 3, 0), new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16).translate(0, 4.2, 0), new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16).translate(0, 5.2, 0), new THREE.ConeGeometry(0.3, 0.8, 10).translate(0, 6.4, 0), new THREE.BoxGeometry(1.2, 0.8, 1.2).translate(0, 0.4, 0)].map(g => g.toNonIndexed()));
    inst(vg, metal, vap, true);
    const hg = mergeGeometries([new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).translate(0, 0.25, 0.9).toNonIndexed()]);
    inst(hg, new THREE.MeshStandardMaterial({ color: '#d8c4a0', roughness: 0.95 }), huts, true);
  }
  if (theme.id === 'ice') {
    const domes: THREE.Matrix4[] = [];
    scatterFar(25, 40, 400, 13, (x, y, z) => { const s = 5 + rng() * 8; domes.push(mtx(x, y - 0.5, z, 0, s, s * 0.7, s)); });
    const dg = mergeGeometries([new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).translate(0.3, 1.4, 0).toNonIndexed()]);
    const dm = new THREE.MeshStandardMaterial({ color: '#e8eef5', roughness: 0.3, metalness: 0.3 });
    inst(dg, dm, domes, true);
    const ringG = new THREE.TorusGeometry(1.0, 0.03, 6, 40).rotateX(Math.PI / 2).translate(0, 0.08, 0);
    inst(ringG, new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ad8ff').multiplyScalar(1.5), toneMapped: false }), domes.map(m => m.clone()), false);
  }
  if (theme.id === 'city') {
    // holo billboards
    const words = ['BOONTA EVE', 'PODRACE LIVE', 'HYPERSPEED', 'NEON CUP', 'WATTO PARTS', 'ZOOM ZOOM', 'GRAND PRIX', 'OUTER RIM'];
    const hues = ['#ff3ad0', '#3ad8ff', '#ffb43a', '#7aff5a'];
    for (let b = 0; b < 14 * det; b++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() > 0.5 ? 1 : -1; const off = s.hw + 25 + rng() * 60;
      const x = s.x + s.rx * side * off, z = s.z + s.rz * side * off; const yaw = Math.atan2(-s.rx * side, -s.rz * side);
      if (!clear(x, z, 18, 2)) continue;
      const hue = hues[b % hues.length]; const word = words[b % words.length];
      const tex = canvasTex(512, 256, c => {
        const g = c.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, '#05030a'); g.addColorStop(1, '#140a20'); c.fillStyle = g; c.fillRect(0, 0, 512, 256);
        c.strokeStyle = hue; c.lineWidth = 10; c.strokeRect(8, 8, 496, 240);
        c.fillStyle = hue; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(word, 256, 118);
        c.font = '28px sans-serif'; c.fillStyle = '#ffffff'; c.fillText('★ ★ ★  CHAMPIONSHIP  ★ ★ ★', 256, 190);
        c.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < 256; y += 4) c.fillRect(0, y, 512, 1);
      });
      const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3), side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(36, 18), m); pl.position.set(x, s.y + 22 + rng() * 25, z); pl.rotation.y = yaw; group.add(pl);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, pl.position.y + 160, 10), darkMetal); pole.position.set(x, (pl.position.y - 160) / 2 - 9, z); group.add(pole);
      disp.push(m, tex, pl.geometry, pole.geometry);
      const ph = rng() * 6; anim.push(t => { m.opacity = 0.82 + Math.sin(t * 9 + ph) * 0.05 + (Math.sin(t * 37 + ph) > 0.97 ? -0.4 : 0); });
    }
    // flying traffic lanes
    const cars = Math.floor(160 * det); const carG = mergeGeometries([new THREE.CapsuleGeometry(0.9, 2.6, 4, 10).rotateX(Math.PI / 2).toNonIndexed(), new THREE.BoxGeometry(2.6, 0.2, 1.2).translate(0, -0.2, -1).toNonIndexed()]);
    const carM = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.7, roughness: 0.3, emissive: '#ffcc88', emissiveIntensity: 0.25 });
    const im = new THREE.InstancedMesh(carG, carM, cars); disp.push(carG, carM);
    const b = td.bounds; const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2; const rad = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.6;
    const lanes = Array.from({ length: cars }, () => ({ r: rad * (0.3 + rng() * 0.9), h: 40 + rng() * 120, sp: (0.01 + rng() * 0.03) * (rng() > 0.5 ? 1 : -1), ph: rng() * Math.PI * 2, wob: rng() * 30 }));
    lanes.forEach((_, i) => im.setColorAt(i, new THREE.Color().setHSL(rng(), 0.6, 0.55)));
    group.add(im);
    anim.push(t => {
      lanes.forEach((l, i) => {
        const a = l.ph + t * l.sp; const r = l.r + Math.sin(a * 3) * l.wob;
        tmpQ.setFromAxisAngle(UP, a + (l.sp > 0 ? 0 : Math.PI));
        tmpM.compose(tmpV.set(cx + Math.cos(a) * r, l.h, cz - Math.sin(a) * r), tmpQ, tmpS.set(1, 1, 1)); im.setMatrixAt(i, tmpM);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  }
  if (theme.id === 'jungle') {
    const stems: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
    scatterFar(70, 15, 300, 11, (x, y, z) => { const s = 1.5 + rng() * 3; stems.push(mtx(x, y, z, 0, s, s, s)); caps.push(mtx(x, y + 6 * s, z, rng() * 6, s, s, s)); });
    const sg = new THREE.CylinderGeometry(0.35, 0.6, 6, 10).translate(0, 3, 0);
    inst(sg, new THREE.MeshStandardMaterial({ color: '#d8cdb0', roughness: 0.8 }), stems, true);
    const capG = new THREE.SphereGeometry(2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); capG.scale(1, 0.55, 1);
    const capTex = canvasTex(256, 128, c => { c.fillStyle = '#7a2a6a'; c.fillRect(0, 0, 256, 128); for (let k = 0; k < 40; k++) { c.fillStyle = '#ffe8a0'; c.beginPath(); c.arc(Math.random() * 256, Math.random() * 110, 3 + Math.random() * 6, 0, 7); c.fill(); } });
    const cm = new THREE.MeshStandardMaterial({ map: capTex, emissiveMap: capTex, emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.6 }); disp.push(cm, capTex);
    inst(capG, cm, caps, true);
  }
  if (theme.id === 'crystal') {
    const fl: { x: number; y: number; z: number; s: number; ph: number }[] = [];
    scatterFar(40, 6, 120, 4, (x, _y, z, s) => fl.push({ x, y: s.y + 10 + rng() * 25, z, s: 1.5 + rng() * 3, ph: rng() * 6 }));
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.6, 1.6, 0.6);
    const m = new THREE.MeshPhysicalMaterial({ color: '#d8b0ff', roughness: 0.05, metalness: 0.1, clearcoat: 1, emissive: '#9a5aff', emissiveIntensity: 0.9, flatShading: true });
    const im = inst(g, m, fl.map(f => mtx(f.x, f.y, f.z, 0, f.s, f.s, f.s)), true);
    fl.forEach(f => { if (rng() > 0.6) emitters.push({ x: f.x, y: f.y, z: f.z, type: 'sparkle' }); });
    if (im) anim.push(t => { fl.forEach((f, i) => { tmpQ.setFromAxisAngle(UP, t * 0.6 + f.ph); tmpM.compose(tmpV.set(f.x, f.y + Math.sin(t + f.ph) * 1.5, f.z), tmpQ, tmpS.set(f.s, f.s, f.s)); im.setMatrixAt(i, tmpM); }); im.instanceMatrix.needsUpdate = true; });
  }
  if (theme.id === 'oovo') {
    // prison cell blocks hovering beside the track
    const cells: THREE.Matrix4[] = []; const bars: THREE.Matrix4[] = [];
    scatterFar(30, 40, 250, 12, (x, _y, z, s) => {
      const sz = 8 + rng() * 10; const cy = s.y + 6 + rng() * 30;
      cells.push(mtx(x, cy, z, rng() * 6, sz, sz * 0.8, sz * 0.6));
      for (let k = 0; k < 6; k++) bars.push(mtx(x + (k - 2.5) * sz * 0.09, cy, z + sz * 0.31, 0, 1, sz * 0.8, 1));
    });
    const cellTex = canvasTex(128, 128, c => { c.fillStyle = '#1a2030'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#8a4aff'; for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { if (Math.random() < 0.4) c.fillRect(x * 32 + 6, y * 16 + 4, 20, 9); } c.fillStyle = '#0a0c12'; c.fillRect(0, 0, 128, 6); });
    const cm = new THREE.MeshStandardMaterial({ color: '#4a5568', metalness: 0.85, roughness: 0.3, emissiveMap: cellTex, emissive: '#ffffff', emissiveIntensity: 0.8 }); disp.push(cm, cellTex);
    inst(new THREE.BoxGeometry(1, 1, 1), cm, cells, true);
    inst(new THREE.BoxGeometry(0.15, 1, 0.15), darkMetal, bars, false);
    // satellites
    const sats: { x: number; y: number; z: number; ph: number }[] = [];
    scatterFar(20, 60, 400, 6, (x, _y, z, s) => sats.push({ x, y: s.y + 30 + rng() * 50, z, ph: rng() * 6 }));
    const sg = mergeGeometries([new THREE.BoxGeometry(1.2, 1.2, 2).toNonIndexed(), new THREE.BoxGeometry(5, 0.08, 1.4).translate(0, 0, 0).toNonIndexed(), new THREE.CylinderGeometry(0.15, 0.15, 2, 8).translate(0, 1.2, 0).toNonIndexed(), new THREE.SphereGeometry(0.4, 10, 8).translate(0, 2.3, 0).toNonIndexed()]);
    const sm = new THREE.MeshStandardMaterial({ color: '#c8ccd4', metalness: 0.9, roughness: 0.25, emissive: theme.barrierColor, emissiveIntensity: 0.4 });
    const sim = inst(sg, sm, sats.map(o => mtx(o.x, o.y, o.z, 0)), true);
    if (sim) anim.push(t => { sats.forEach((o, i) => { tmpQ.setFromAxisAngle(UP, t * 0.4 + o.ph); tmpM.compose(tmpV.set(o.x, o.y + Math.sin(t * 0.5 + o.ph) * 2, o.z), tmpQ, tmpS.set(1, 1, 1)); sim.setMatrixAt(i, tmpM); }); sim.instanceMatrix.needsUpdate = true; });
    // comms antennas
    const ants: THREE.Matrix4[] = [];
    scatterFar(25, 20, 200, 3, (x, y, z) => ants.push(mtx(x, y, z, rng() * 6, 1, 0.7 + rng() * 0.8, 1)));
    const ag = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.4, 18, 8).translate(0, 9, 0).toNonIndexed(), new THREE.CylinderGeometry(0.05, 0.05, 6, 6).rotateZ(0.6).translate(2, 16, 0).toNonIndexed(), new THREE.SphereGeometry(0.5, 10, 8).translate(0, 18.4, 0).toNonIndexed()]);
    inst(ag, metal, ants, true);
    // drifting debris
    const deb: { x: number; y: number; z: number; sp: number }[] = [];
    scatterFar(40, 15, 180, 2, (x, _y, z, s) => deb.push({ x, y: s.y + 2 + rng() * 20, z, sp: (rng() - 0.5) * 0.5 }));
    const dg = mergeGeometries([new THREE.BoxGeometry(2.5, 0.4, 1.2).toNonIndexed(), new THREE.BoxGeometry(0.3, 0.8, 1.6).translate(1.1, 0.4, 0).toNonIndexed()]);
    const dim = inst(dg, darkMetal, deb.map(o => mtx(o.x, o.y, o.z, 0)), false);
    if (dim) anim.push(t => { deb.forEach((o, i) => { tmpQ.setFromEuler(new THREE.Euler(t * o.sp, t * o.sp * 1.7, t * o.sp * 0.6)); tmpM.compose(tmpV.set(o.x, o.y + Math.sin(t * 0.3 + i) * 0.6, o.z), tmpQ, tmpS.set(1, 1, 1)); dim.setMatrixAt(i, tmpM); }); dim.instanceMatrix.needsUpdate = true; });
    // zero-g warning signs at zone entries
    const signTex = canvasTex(512, 256, c => {
      c.fillStyle = '#111820'; c.fillRect(0, 0, 512, 256); c.strokeStyle = '#3ad8ff'; c.lineWidth = 12; c.strokeRect(6, 6, 500, 244);
      c.fillStyle = '#ffcc1a'; c.font = 'bold 70px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚠ ZERO-G ⚠', 256, 100);
      c.fillStyle = '#3ad8ff'; c.font = '36px sans-serif'; c.fillText('SCHWERELOSIGKEIT', 256, 175);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, side: THREE.DoubleSide }); disp.push(signMat, signTex);
    const signs: THREE.Matrix4[] = [];
    for (let i = 1; i < N; i++) { if (S[i].zeroG && !S[i - 1].zeroG) { const s = S[i]; signs.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + 12, s.z), faceOncoming(s), new THREE.Vector3(1, 1, 1))); } }
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
