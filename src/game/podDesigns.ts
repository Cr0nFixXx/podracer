import * as THREE from 'three';
import type { PodDef } from './data';
import { PILOTS } from './data';
import { box, cable, cablePylon, makeEngine, type EngineOut, type Kit, type Mats } from './podParts';

export interface Built { engines: EngineOut[]; cockpitZ: number; }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function pilot(k: Kit, parent: THREE.Object3D, color: string, scale: number, x = 0, y = 0, z = 0) {
  const skin = new THREE.MeshStandardMaterial({ color: '#c89868', roughness: 0.6 });
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
  const visor = new THREE.MeshStandardMaterial({ color: '#9fd8ff', metalness: 0.9, roughness: 0.05 });
  const g = new THREE.Group(); g.scale.setScalar(scale); g.position.set(x, y, z);
  k.mesh(new THREE.CapsuleGeometry(0.3, 0.35, 5, 10), suit, g).position.y = 0.25;
  const head = k.mesh(new THREE.SphereGeometry(0.22, 16, 12), skin, g); head.position.y = 0.78; head.scale.set(0.95, 1.15, 1);
  for (const sd of [-1, 1]) { const e = k.mesh(new THREE.SphereGeometry(0.07, 10, 8), visor, g); e.scale.set(1, 0.7, 0.45); e.position.set(sd * 0.08, 0.8, 0.18); }
  for (const sd of [-1, 1]) { const a = k.mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), suit, g); a.position.set(sd * 0.34, 0.35, 0.12); a.rotation.z = sd * 0.9; a.rotation.x = 0.5; }
  parent.add(g);
  return [skin, suit, visor];
}

const cockTexCache = new Map<string, { albedo: THREE.Texture; emissive: THREE.Texture }>();
function cockpitTextures(accent: string) {
  const hit = cockTexCache.get(accent); if (hit) return hit;
  const W = 512, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!;
  const ev = document.createElement('canvas'); ev.width = W; ev.height = H; const ec = ev.getContext('2d')!;
  ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  c.fillStyle = '#181b22'; c.fillRect(0, 0, W, H);
  // padded panels with stitching
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
    const x = px * 128 + 8, y = py * 128 + 8;
    const g = c.createLinearGradient(x, y, x + 112, y + 112); g.addColorStop(0, '#323844'); g.addColorStop(1, '#14171d');
    c.fillStyle = g; c.fillRect(x, y, 112, 112);
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; c.strokeRect(x + 5, y + 5, 102, 102);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.strokeRect(x + 8, y + 8, 96, 96);
  }
  // instrument cluster
  c.fillStyle = '#0b0d13'; c.fillRect(0, 300, W, 96);
  for (let i = 0; i < 8; i++) {
    const x = 32 + i * 62;
    c.strokeStyle = '#46505f'; c.lineWidth = 4; c.beginPath(); c.arc(x, 348, 24, 0, 7); c.stroke();
    c.fillStyle = '#10131a'; c.beginPath(); c.arc(x, 348, 19, 0, 7); c.fill();
    ec.strokeStyle = i % 3 === 0 ? '#ff4040' : accent; ec.lineWidth = 3; ec.beginPath(); ec.arc(x, 348, 13, Math.PI, 0); ec.stroke();
    ec.fillStyle = accent; ec.fillRect(x - 1, 342, 2, 9);
  }
  // switch row
  for (let i = 0; i < 10; i++) { ec.fillStyle = i % 2 ? '#39e07a' : accent; ec.fillRect(26 + i * 48, 412, 14, 9); c.fillStyle = '#0c0e14'; c.fillRect(24 + i * 48, 410, 18, 13); }
  // warning chevrons
  c.fillStyle = '#e8c030'; for (let i = 0; i < W; i += 26) { c.beginPath(); c.moveTo(i, 494); c.lineTo(i + 13, 494); c.lineTo(i + 6, 508); c.fill(); }
  // rivets
  c.fillStyle = '#a4acb6'; for (let y = 6; y < H; y += 64) for (let x = 6; x < W; x += 64) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
  const mk = (canvas: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const out = { albedo: mk(cv), emissive: mk(ev) }; cockTexCache.set(accent, out); return out;
}

type CockpitStyle = 'sleek' | 'armored' | 'bubble' | 'compact' | 'racer';

/** Detailed open cockpit with textured interior, seat, roll hoop, instruments and a style variation. */
function openCockpit(k: Kit, M: Mats, parent: THREE.Object3D, w: number, len: number, pilotColor: string, pilotScale: number, style: CockpitStyle = 'racer') {
  const tex = cockpitTextures(pilotColor);
  const interior = (M.paint as THREE.MeshStandardMaterial).clone();
  interior.map = tex.albedo; interior.emissiveMap = tex.emissive; interior.emissive = new THREE.Color('#ffffff'); interior.emissiveIntensity = 0.55; interior.color.set('#ffffff');
  const leather = new THREE.MeshStandardMaterial({ color: '#3a2c24', roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.3, roughness: 0.02, metalness: 0.05, side: THREE.DoubleSide, depthWrite: false });

  // hull
  const tub = new THREE.CylinderGeometry(w * 0.55, w * 0.72, len, 20); tub.rotateX(Math.PI / 2); tub.scale(1, 0.5, 1); k.mesh(tub, interior, parent);
  k.mesh(box(w * 1.05, 0.08, len * 0.92, 0, -w * 0.22, 0), M.steel, parent);
  // riveted cockpit rim
  const rim = new THREE.TorusGeometry(w * 0.52, 0.035, 8, 28); rim.rotateX(Math.PI / 2); rim.scale(1, 1, len / w * 0.8); k.mesh(rim, M.chrome, parent).position.y = w * 0.02;

  // seat: cushion, backrest, headrest
  k.mesh(box(w * 0.5, 0.1, len * 0.42, 0, -w * 0.14, -len * 0.04), leather, parent);
  k.mesh(box(w * 0.46, w * 0.42, 0.08, 0, w * 0.02, -len * 0.26), leather, parent);
  k.mesh(box(w * 0.28, 0.14, 0.1, 0, w * 0.28, -len * 0.28), leather, parent);
  for (const sd of [-1, 1]) k.mesh(box(0.06, 0.16, len * 0.36, sd * w * 0.24, -w * 0.06, -len * 0.04), leather, parent);

  // roll hoop / cage
  const hoop = (z: number, h: number) => {
    for (const sd of [-1, 1]) k.mesh(box(0.05, h, 0.05, sd * w * 0.4, h / 2 - w * 0.1, z), M.steel, parent);
    k.mesh(box(w * 0.86, 0.05, 0.05, 0, h - w * 0.1, z), M.steel, parent);
  };
  hoop(-len * 0.26, w * 0.7);
  if (style === 'armored') { hoop(len * 0.02, w * 0.6); for (const sd of [-1, 1]) k.mesh(box(0.04, 0.04, len * 0.3, sd * w * 0.4, w * 0.45, -len * 0.12), M.steel, parent); }

  // side armor or consoles
  for (const sd of [-1, 1]) {
    const thick = style === 'armored' ? w * 0.34 : w * 0.2;
    k.mesh(box(thick, w * 0.28, len * 0.78, sd * (w * 0.5 + thick * 0.3), -w * 0.04, 0), style === 'armored' ? M.paint2 : interior, parent);
    // button row on the console
    for (let i = 0; i < 4; i++) k.mesh(box(0.05, 0.03, 0.05, sd * w * 0.42, w * 0.12, -len * 0.1 + i * 0.14), M.glow, parent);
  }

  // dashboard + gauges
  k.mesh(box(w * 0.72, 0.14, 0.26, 0, 0.0, len * 0.3), interior, parent);
  for (let i = 0; i < 5; i++) {
    const gz = len * 0.4, gx = (i - 2) * w * 0.13;
    k.mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 14).rotateX(1.1).translate(gx, 0.1, gz), M.chrome, parent);
    k.mesh(new THREE.CircleGeometry(0.045, 12).rotateX(-0.5).translate(gx, 0.1, gz), M.glow, parent);
  }
  // throttle lever
  k.mesh(box(0.03, 0.2, 0.03, w * 0.3, 0.16, len * 0.16), M.chrome, parent);

  // pedals
  for (const sd of [-1, 1]) k.mesh(box(0.07, 0.1, 0.05, sd * 0.12, -w * 0.16, len * 0.3).rotateX(-0.4), M.steel, parent);

  // windscreen
  if (style === 'bubble') {
    const dome = new THREE.SphereGeometry(w * 0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const d = k.mesh(dome, glass, parent); d.position.set(0, 0, 0); d.scale.set(1, 0.85, len / w * 0.55);
  } else if (style === 'armored') {
    const slit = new THREE.BoxGeometry(w * 0.6, 0.16, 0.03); slit.translate(0, w * 0.18, len * 0.34); slit.rotateX(-0.5);
    k.mesh(slit, glass, parent);
  } else {
    const ws = new THREE.SphereGeometry(w * 0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const scr = k.mesh(ws, glass, parent); scr.position.set(0, w * 0.08, len * 0.2); scr.scale.set(1, style === 'compact' ? 0.4 : 0.6, 0.65);
    for (const sd of [-1, 1]) k.mesh(box(0.025, w * 0.3, 0.025, sd * w * 0.3, w * 0.16, len * 0.26), M.chrome, parent);
  }

  // antenna
  if (style !== 'compact') {
    k.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6).translate(-w * 0.3, w * 0.34, -len * 0.2), M.steel, parent);
    k.mesh(new THREE.SphereGeometry(0.035, 8, 6).translate(-w * 0.3, w * 0.66, -len * 0.2), M.glow, parent);
  }
  // rear winglets
  if (style === 'racer' || style === 'sleek') for (const sd of [-1, 1]) { const f = k.mesh(box(0.05, w * 0.4, len * 0.3, sd * w * 0.62, w * 0.16, -len * 0.3), M.paint2, parent); f.rotation.z = sd * 0.3; }

  pilot(k, parent, pilotColor, pilotScale, 0, -w * 0.06, -len * 0.08);
  return [glass, interior, leather];
}

export function designPod(def: PodDef, k: Kit, M: Mats, body: THREE.Group, extraMats: THREE.Material[]): Built {
  const pilotColor = (PILOTS.find(p => p.id === def.pilotId) ?? PILOTS[0]).color;
  const engines: EngineOut[] = [];
  const place = (x: number, y: number, z: number, L: number, R: number, o: { bands?: number; blades?: number; spike?: boolean; fins?: number } = {}) => {
    y = Math.max(y, R - 0.9);
    const e = makeEngine(k, M, L, R, { style: def.engine, ...o }); e.group.position.set(x, y, z); body.add(e.group);
    e.exhaust.add(V(x, y, z)); engines.push(e); return e;
  };
  let cockpitZ = -def.cable * 0.5;

  if (def.id === 'aurora') {
    // Anakin-style: long banded turbines, radial faces with gold spikes, yellow anti-grav panels, slim cockpit far behind
    const L = 9, R = 1.15, sp = 2.5;
    for (const sd of [-1, 1]) {
      const e = place(sd * sp, 0, 4, L, R, { bands: 6, blades: 18 });
      for (const s2 of [-1, 1]) { const p = k.mesh(box(0.9, 0.12, L * 0.95, sd * sp + s2 * 1.5, -0.3, 4), M.paint2, body); p.rotation.z = s2 * -0.12; }
      cablePylon(k, M, e.group, 1.6);
      cable(k, M.dark, body, V(sd * sp, 1.6, 4.5), V(sd * 0.4, 0.4, cockpitZ + 0.8), 0.5, 0.05);
    }
    cockpitZ = -6;
    const c = new THREE.Group(); c.position.set(0, 0.1, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.5, 3.2, pilotColor, 1.3, 'sleek'));
    k.mesh(new THREE.ConeGeometry(0.3, 1.4, 12).rotateX(-Math.PI / 2), M.paint2, c).position.z = 2.2;
  } else if (def.id === 'brute') {
    // Sebulba-style: huge plug engines with radial cooling slats, orange split housings, tall rear fin, cockpit far ahead
    const L = 8, R = 1.5, sp = 2.2;
    for (const sd of [-1, 1]) {
      const e = place(sd * sp, 0, 2, L, R, { bands: 7, blades: 20, spike: false });
      // cooling slats sitting on top of the engine
      for (let i = 0; i < 9; i++) k.mesh(box(0.05, 0.5, L * 0.5, (i - 4) * 0.17, R + 0.25, -L * 0.15), M.steel, e.group);
      // split cowl over the engine
      const cowl = k.mesh(box(R * 2.2, 0.5, L * 0.45, 0, R * 0.55, L * 0.05), M.paint, e.group); cowl.rotation.z = sd * 0.12;
      cablePylon(k, M, e.group, 2);
      if (sd === -1) { // rear stabiliser fin, attached to the engine
        k.mesh(box(0.12, 2.4, 1.8, 0, R + 1.2, -L * 0.3), M.paint, e.group);
        k.mesh(box(0.08, 2.0, 1.4, 0.1, R + 1.2, -L * 0.3), M.paint2, e.group);
      }
    }
    cockpitZ = -9;
    const c = new THREE.Group(); c.position.set(0, 0.3, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.3, 2.6, pilotColor, 1.1, 'armored'));
    for (const sd of [-1, 1]) cable(k, M.dark, body, V(sd * sp, R + 2, 2), V(sd * 0.3, 0.6, cockpitZ + 0.6), 0.3, 0.045);
  } else if (def.id === 'gasvaro') {
    const L = 6, R = 0.8;
    [[-2.6, 0.6], [2.6, 0.6], [-1.5, -0.5], [1.5, -0.5], [-3.2, -0.1], [3.2, -0.1]].forEach(([x, y], i) => { const e = place(x, y, 3, L, R, { bands: 4, blades: 12 }); if (i < 2) cablePylon(k, M, e.group, 1.2); });
    cockpitZ = -7;
    const c = new THREE.Group(); c.position.set(0, 0, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.2, 3.4, pilotColor, 1.2, 'racer'));
    for (const sd of [-1, 1]) cable(k, M.dark, body, V(sd * 2.6, 1.8, 3), V(sd * 0.3, 0.4, cockpitZ + 0.8), 0.6, 0.04);
  } else if (def.id === 'bomquad') {
    // four engines in two rows (Ben Quadinaros)
    const L = 5.5, R = 1.1;
    [[-2.4, 0, 1], [2.4, 0, 1], [-1.6, 0.3, 7], [1.6, 0.3, 7]].forEach(([x, y, z]) => place(x, y, z, L, R, { bands: 4, blades: 14 }));
    cockpitZ = -6;
    const c = new THREE.Group(); c.position.set(0, 0.2, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.4, 2.4, pilotColor, 1.1, 'bubble'));
    for (const sd of [-1, 1]) cable(k, M.dark, body, V(sd * 2.4, 1.2, 1), V(sd * 0.3, 0.5, cockpitZ + 0.5), 0.5, 0.04);
  } else if (def.id === 'mavik') {
    const L = 8, R = 0.6, sp = 1.7;
    for (const sd of [-1, 1]) { const e = place(sd * sp, 0, 3, L, R, { bands: 6, blades: 10 }); cablePylon(k, M, e.group, 1); cable(k, M.dark, body, V(sd * sp, 1, 3), V(sd * 0.25, 0.3, -4), 0.4, 0.03); }
    cockpitZ = -5.5;
    const c = new THREE.Group(); c.position.set(0, -0.1, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.1, 2.2, pilotColor, 1, 'compact'));
  } else if (def.id === 'rattis') {
    const L = 6, R = 0.85, sp = 1.6;
    for (const sd of [-1, 1]) place(sd * sp, 0, 2.5, L, R, { bands: 4, blades: 14 });
    cockpitZ = -1.5;
    const c = new THREE.Group(); c.position.set(0, -0.2, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.2, 2.4, pilotColor, 1, 'compact'));
    for (const sd of [-1, 1]) cable(k, M.dark, body, V(sd * sp, 0.9, 2.5), V(sd * 0.3, 0.3, cockpitZ + 0.4), 0.3, 0.035);
  } else if (def.id === 'aldo') {
    const L = 9, R = 1, sp = 2.3;
    for (const sd of [-1, 1]) { const e = place(sd * sp, 0, 3.5, L, R, { bands: 7, blades: 16, fins: 6 }); cablePylon(k, M, e.group, 1.4); cable(k, M.dark, body, V(sd * sp, 1.4, 3.5), V(sd * 0.35, 0.4, -4.5), 0.5, 0.04); }
    cockpitZ = -6;
    const c = new THREE.Group(); c.position.set(0, 0, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.3, 3, pilotColor, 1.1, 'sleek'));
  } else if (def.id === 'teemo') {
    // Teemto-style: four big drum engines with red spikes, two rows, tiny cockpit
    const L = 5, R = 1.25;
    [[-2.3, -0.6, 0.5], [2.3, -0.6, 0.5], [-2.3, 1.3, 5.5], [2.3, 1.3, 5.5]].forEach(([x, y, z]) => place(x, y, z, L, R, { bands: 4, blades: 20 }));
    cockpitZ = -5.5;
    const c = new THREE.Group(); c.position.set(0, 0.4, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.1, 2, pilotColor, 0.95, 'armored'));
    for (const sd of [-1, 1]) { cable(k, M.dark, body, V(sd * 2.3, 0.6, 0.5), V(sd * 0.25, 0.6, cockpitZ + 0.4), 0.4, 0.035); cable(k, M.dark, body, V(sd * 2.3, 2.5, 5.5), V(sd * 0.25, 0.7, cockpitZ + 0.4), 0.8, 0.035); }
  } else if (def.id === 'elana') {
    const L = 8.5, R = 0.75, sp = 2;
    for (const sd of [-1, 1]) { const e = place(sd * sp, 0, 3, L, R, { bands: 6, blades: 12 }); cablePylon(k, M, e.group, 1.2); cable(k, M.dark, body, V(sd * sp, 1.2, 3), V(sd * 0.3, 0.4, -4.5), 0.45, 0.035); }
    cockpitZ = -6;
    const c = new THREE.Group(); c.position.set(0, 0, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.2, 3.2, pilotColor, 1.1, 'sleek'));
    k.mesh(box(0.08, 1.4, 1, 0, 0.9, -1.2), M.paint2, c);
  } else {
    // ram: heavy engines, front plough
    const L = 7, R = 1.3, sp = 2.4;
    for (const sd of [-1, 1]) { const e = place(sd * sp, 0, 3, L, R, { bands: 5, blades: 16 }); cablePylon(k, M, e.group, 1.5); cable(k, M.dark, body, V(sd * sp, 1.5, 3), V(sd * 0.35, 0.4, -4), 0.5, 0.045); }
    cockpitZ = -5.5;
    const c = new THREE.Group(); c.position.set(0, 0, cockpitZ); body.add(c);
    extraMats.push(...openCockpit(k, M, c, 1.4, 2.6, pilotColor, 1.1, 'armored'));
    k.mesh(box(3.2, 0.35, 1, 0, -0.3, 1.8), M.steel, c);
  }
  return { engines, cockpitZ };
}
