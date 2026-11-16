import * as THREE from 'three';
import type { PodDef } from './data';

/** Painted engine casing: panel grid, vents, exposed pipework, bolts and warning marks. */
const engineTexCache = new Map<string, { albedo: THREE.Texture; emissive: THREE.Texture }>();
/** Painted engine casing: panels, vents, heat sinks, hex grating and glowing conduits. */
export function engineTextures(base: string, accent: string) {
  const key = base + '|' + accent; const hit = engineTexCache.get(key); if (hit) return hit;
  const W = 1024, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!;
  const ev = document.createElement('canvas'); ev.width = W; ev.height = H; const ec = ev.getContext('2d')!;
  ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 128) { const g = c.createLinearGradient(x, 0, x + 128, 0); g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.32)'); c.fillStyle = g; c.fillRect(x, 0, 128, H); }
  // carbon weave
  c.save(); c.globalAlpha = 0.22; c.strokeStyle = '#000'; c.lineWidth = 2;
  for (let i = -H; i < W + H; i += 9) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); c.beginPath(); c.moveTo(i, H); c.lineTo(i + H, 0); c.stroke(); }
  c.restore();
  // panel grid
  c.strokeStyle = 'rgba(0,0,0,0.72)'; c.lineWidth = 4;
  for (let x = 0; x <= W; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y <= H; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2;
  for (let x = 5; x < W; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  // bolts
  for (let y = 12; y < H; y += 64) for (let x = 12; x < W; x += 64) { c.fillStyle = '#d8dde3'; c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill(); c.fillStyle = '#5c636c'; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
  // per-panel mechanical details
  for (let py = 0; py < 4; py++) for (let px = 0; px < 8; px++) {
    const x = px * 128, y = py * 128; const kind = (px * 3 + py) % 4;
    if (kind === 0) {
      c.fillStyle = '#0b0d12'; c.fillRect(x + 16, y + 22, 96, 84);
      c.strokeStyle = '#7a828c'; c.lineWidth = 2; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(x + 20, y + 28 + i * 9); c.lineTo(x + 108, y + 28 + i * 9); c.stroke(); }
      c.strokeStyle = accent; c.lineWidth = 3; c.strokeRect(x + 14, y + 20, 100, 88);
    } else if (kind === 1) {
      c.fillStyle = '#10141a'; c.fillRect(x + 14, y + 18, 100, 92);
      c.fillStyle = '#9098a2'; for (let i = 0; i < 15; i++) c.fillRect(x + 18, y + 22 + i * 6, 92, 3);
    } else if (kind === 2) {
      c.fillStyle = '#0e1116'; c.fillRect(x + 14, y + 18, 100, 92);
      c.strokeStyle = accent; c.lineWidth = 1.5;
      for (let hy = 0; hy < 5; hy++) for (let hx = 0; hx < 5; hx++) { const cx = x + 26 + hx * 19, cy = y + 32 + hy * 17 + (hx % 2) * 8; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; c.lineTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); } c.closePath(); c.stroke(); }
    } else {
      c.strokeStyle = accent; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x + 18, y + 66); c.lineTo(x + 52, y + 66); c.lineTo(x + 66, y + 38); c.lineTo(x + 112, y + 38); c.stroke();
      ec.strokeStyle = accent; ec.lineWidth = 7; ec.lineJoin = 'round'; ec.beginPath(); ec.moveTo(x + 18, y + 66); ec.lineTo(x + 52, y + 66); ec.lineTo(x + 66, y + 38); ec.lineTo(x + 112, y + 38); ec.stroke();
      ec.fillStyle = '#ffffff'; ec.beginPath(); ec.arc(x + 112, y + 38, 4, 0, 7); ec.fill();
    }
  }
  // glowing status lights
  for (let i = 0; i < 16; i++) { const x = 36 + i * 63; ec.fillStyle = i % 4 === 0 ? '#ff4040' : accent; ec.beginPath(); ec.arc(x, 256, 5, 0, 7); ec.fill(); c.fillStyle = '#090b10'; c.beginPath(); c.arc(x, 256, 8, 0, 7); c.fill(); }
  // warning chevrons
  c.fillStyle = '#e8c030'; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(14 + i * 128, 494); c.lineTo(50 + i * 128, 494); c.lineTo(32 + i * 128, 510); c.fill(); }
  // scratches and grime
  c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 1; for (let i = 0; i < 80; i++) { const x = Math.random() * W, y = Math.random() * H; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18 + Math.random() * 46, y + (Math.random() - 0.5) * 5); c.stroke(); }
  c.fillStyle = 'rgba(18,12,6,0.15)'; for (let i = 0; i < 26; i++) c.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 22, 2);
  const mk = (canvas: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t; };
  const out = { albedo: mk(cv), emissive: mk(ev) }; engineTexCache.set(key, out); return out;
}

export interface Kit { seg: number; geos: THREE.BufferGeometry[]; mesh: (g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D) => THREE.Mesh; }
export const kit = (seg: number): Kit => {
  const geos: THREE.BufferGeometry[] = [];
  return { seg, geos, mesh: (g, m, parent) => { geos.push(g); const me = new THREE.Mesh(g, m); me.castShadow = true; me.receiveShadow = true; if (parent) parent.add(me); return me; } };
};
export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

export interface Mats { paint: THREE.Material; paint2: THREE.Material; chrome: THREE.Material; dark: THREE.Material; steel: THREE.Material; glow: THREE.Material; flame: THREE.Material; core: THREE.Material; }
export interface EngineOut { group: THREE.Group; flames: THREE.Mesh[]; flaps: THREE.Mesh[]; fan: THREE.Object3D | null; exhaust: THREE.Vector3; radius: number; length: number; }

export function makeEngine(k: Kit, M: Mats, L: number, R: number, opts: { bands?: number; blades?: number; spike?: boolean; fins?: number; style?: PodDef['engine'] } = {}): EngineOut {
  const e = new THREE.Group();
  const seg = k.seg;
  const bands = opts.bands ?? 5;
  const tex = engineTextures('#' + (M.paint as THREE.MeshStandardMaterial).color.getHexString(), '#' + (M.paint2 as THREE.MeshStandardMaterial).color.getHexString());
  const casing = (M.paint as THREE.MeshStandardMaterial).clone();
  casing.map = tex.albedo; casing.emissiveMap = tex.emissive; casing.emissive = new THREE.Color('#ffffff'); casing.emissiveIntensity = 0.8;
  casing.color.set('#ffffff');
  // banded barrel
  for (let i = 0; i < bands; i++) {
    const t = i / bands; const rr = R * (0.78 + 0.22 * Math.sin(t * Math.PI));
    const h = L / bands * 0.86;
    const zc = -L / 2 + (i + 0.5) * L / bands;
    const g = new THREE.CylinderGeometry(rr, rr * 0.98, h, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, zc);
    k.mesh(g, casing, e);
    const ring = new THREE.TorusGeometry(rr * 1.02, R * 0.035, 6, seg); ring.translate(0, 0, -L / 2 + (i + 1) * L / bands);
    k.mesh(ring, M.chrome, e);
    // panel seam line + small access hatch
    if (i % 2 === 0) k.mesh(box(rr * 0.5, rr * 0.16, 0.05, 0, rr * 0.55, zc), M.paint2, e);
  }
  // exposed mechanics: pipe bundles running along the top
  for (const off of [-0.18, 0, 0.18]) {
    const pipe = new THREE.CylinderGeometry(R * 0.045, R * 0.045, L * 0.7, 6); pipe.rotateX(Math.PI / 2); pipe.translate(off * R, R * 0.62, 0);
    k.mesh(pipe, M.steel, e);
  }
  // open access panel revealing the core
  k.mesh(box(R * 0.7, R * 0.35, L * 0.3, 0, R * 0.35, -L * 0.05), M.dark, e);
  for (let i = 0; i < 4; i++) k.mesh(new THREE.TorusGeometry(R * 0.12, R * 0.02, 6, 12).rotateX(Math.PI / 2).translate((i - 1.5) * R * 0.16, R * 0.42, -L * 0.05), M.chrome, e);
  // intake grille bars
  for (let i = -3; i <= 3; i++) { const bar = new THREE.BoxGeometry(R * 0.03, R * 1.5, R * 0.03); bar.translate(i * R * 0.2, 0, L / 2 + R * 0.02); k.mesh(bar, M.steel, e); }
  // racing stripe
  k.mesh(box(R * 0.28, 0.06, L * 0.8, 0, R * 0.78, 0), M.paint2, e);
  // side vents
  for (const sd of [-1, 1]) for (let v = 0; v < 3; v++) k.mesh(box(0.05, R * 0.3, L * 0.08, sd * R * 0.9, 0, -L * 0.2 + v * L * 0.16), M.dark, e);
  // front turbine face
  const face = new THREE.TorusGeometry(R * 0.92, R * 0.09, 10, seg); face.translate(0, 0, L / 2); k.mesh(face, M.steel, e);
  const blades = opts.blades ?? 16;
  const fan = new THREE.Group();
  const bg = new THREE.BoxGeometry(R * 0.05, R * 0.78, R * 0.02); k.geos.push(bg);
  for (let i = 0; i < blades; i++) { const b = new THREE.Mesh(bg, M.dark); b.rotation.z = (i / blades) * Math.PI * 2; b.rotation.y = 0.35; fan.add(b); }
  fan.position.z = L / 2 - R * 0.05; e.add(fan);
  // central spike / hub
  if (opts.spike !== false) {
    const sp = new THREE.ConeGeometry(R * 0.16, L * 0.34, 14); sp.rotateX(Math.PI / 2); sp.translate(0, 0, L / 2 + L * 0.12); k.mesh(sp, M.chrome, e);
  } else k.mesh(new THREE.SphereGeometry(R * 0.16, 12, 8), M.chrome, e).position.z = L / 2;
  // rear nozzle
  const noz = new THREE.CylinderGeometry(R * 0.55, R * 0.72, L * 0.1, seg); noz.rotateX(Math.PI / 2); noz.translate(0, 0, -L / 2 - L * 0.04); k.mesh(noz, M.dark, e);
  const coreDisc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.5, 20), M.glow); coreDisc.rotation.y = Math.PI; coreDisc.position.z = -L / 2 - L * 0.02; e.add(coreDisc);
  // flame
  const flames: THREE.Mesh[] = [];
  const fg = new THREE.ConeGeometry(R * 0.5, L * 0.8, 16, 1, true); fg.rotateX(-Math.PI / 2); fg.translate(0, 0, -L * 0.4); k.geos.push(fg);
  const flame = new THREE.Mesh(fg, M.flame); flame.position.z = -L / 2 - L * 0.08; e.add(flame); flames.push(flame);
  const fc = new THREE.ConeGeometry(R * 0.24, L * 0.42, 10, 1, true); fc.rotateX(-Math.PI / 2); fc.translate(0, 0, -L * 0.2); k.geos.push(fc);
  const fcm = new THREE.Mesh(fc, M.core); fcm.position.z = -L / 2 - L * 0.08; e.add(fcm); flames.push(fcm);
  // airbrake flaps (top & bottom)
  const flaps: THREE.Mesh[] = [];
  for (const sd of [1, -1]) {
    const fl = new THREE.Mesh(box(R * 0.9, 0.06, L * 0.2, 0, 0, -L * 0.1), M.paint2); fl.castShadow = true;
    fl.position.set(0, sd * R * 0.95, -L * 0.15); fl.userData.s = sd; e.add(fl); flaps.push(fl);
  }
  // style extras
  if (opts.style === 'long' || (opts.fins ?? 0) > 0) for (let i = 0; i < (opts.fins ?? 4); i++) k.mesh(box(0.05, R * 0.55, L * 0.05, 0, R * 0.6, -L * 0.35 + i * L * 0.12), M.paint2, e);
  return { group: e, flames, flaps, fan, exhaust: new THREE.Vector3(0, 0, -L / 2 - L * 0.12), radius: R, length: L };
}

/** Control-cable pylon sitting on top of an engine, cables run to the cockpit anchors. */
export function cablePylon(k: Kit, M: Mats, parent: THREE.Object3D, height: number) {
  k.mesh(box(0.12, height, 0.12, 0, height / 2, 0), M.steel, parent);
  k.mesh(box(0.5, 0.1, 0.3, 0, height, 0), M.steel, parent);
}

export function cable(k: Kit, mat: THREE.Material, parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, sag = 0.4, r = 0.035) {
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
  const g = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, r, 5, false); k.geos.push(g);
  parent.add(new THREE.Mesh(g, mat));
}
