import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';
import type { PodState } from './physics';
import { boulderState, bridgeSwing, bridgeWarn, gateDrop, gateWarn, nearestOnPath, rotorAngle, zgRockAt, type Obstacle, type Sample, type TrackData } from './trackBuilder';

// TSL typings are stricter than the runtime → loosely typed on purpose (see CLAUDE.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;

/**
 * Dynamic set pieces (visuals + state). Collision & AI timing live in physics.ts and read the exact same state:
 *  - rotor:   rotating hazard-striped blades on a deeply grounded armored hub pylon
 *  - gate:    futuristic 3-bay airlock / blast-door bulkhead fused organically into each world's rock/ice/metal scenery
 *  - arch:    stratified rock arch (with deep terrain abutments) that collapses into a navigable slalom when the leader arrives
 *  - icefall: glacier ice-bridge (with deep ice abutments) that fractures & drops crystalline monoliths (Ando Prime)
 *  - boulder: buttressed canyon stone chute launching giant bouncing boulders across the road (with warning beacon)
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
/** Futuristic armored blast-door panel texture: beveled alloy plates, recessed hex-ribs & subtle sci-fi caution chevrons */
function airlockTex(accentHex: string) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3a414c'); g.addColorStop(0.5, '#262b34'); g.addColorStop(1, '#1c2028');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  // Horizontal armored bulkhead seams + beveled highlights
  for (const y of [56, 128, 200]) {
    c.fillStyle = '#0e1116'; c.fillRect(0, y - 3, 256, 6);
    c.fillStyle = 'rgba(210,225,245,0.18)'; c.fillRect(0, y + 3, 256, 2);
  }
  // Vertical interlocking stiffener channels
  for (let x = 32; x < 256; x += 64) {
    c.fillStyle = 'rgba(12,15,20,0.55)'; c.fillRect(x - 6, 10, 12, 236);
    c.fillStyle = 'rgba(180,200,220,0.12)'; c.fillRect(x + 6, 10, 2, 236);
  }
  // Bottom interlocking docking chevron band in world's barrier accent
  c.fillStyle = accentHex; c.globalAlpha = 0.72; c.fillRect(0, 226, 256, 22);
  c.globalAlpha = 1; c.fillStyle = '#12151b';
  for (let x = -32; x < 288; x += 32) { c.beginPath(); c.moveTo(x, 226); c.lineTo(x + 14, 226); c.lineTo(x + 2, 248); c.lineTo(x - 12, 248); c.fill(); }
  // Central futuristic diamond lock emblem
  c.strokeStyle = accentHex; c.lineWidth = 4; c.globalAlpha = 0.65;
  c.beginPath(); c.moveTo(128, 84); c.lineTo(164, 128); c.lineTo(128, 172); c.lineTo(92, 128); c.closePath(); c.stroke();
  c.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function cragRock(g: THREE.BufferGeometry, amp: number, seed: number) {
  const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose();
  const p = gg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (h2(Math.round(x * 1.3 + seed), Math.round(y * 1.1 + z * 1.7)) - 0.5) * amp + Math.sin(y * 0.45 + seed) * amp * 0.25;
    p.setXYZ(i, x * k, y, z * k);
  }
  gg.computeVertexNormals();
  const uv = gg.attributes.uv as THREE.BufferAttribute | undefined;
  if (uv) for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 14, p.getY(i) / 14);
  return gg;
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };
const merged = (list: THREE.BufferGeometry[]) => { const g = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x))); list.forEach(x => x.dispose()); return g!; };

/** Safe foundation drop in local `s.y`-relative coordinates so side towers/arches never float above banked slopes or valleys. */
function footDrop(s: Sample, worldSide: number, off: number, heightAt: (x: number, z: number) => number, isPrison: boolean) {
  const edgeY = s.y - worldSide * Math.min(s.hw, off) * s.bank;
  if (isPrison) return edgeY - s.y - 8;
  const fx = s.x + s.rx * worldSide * off, fz = s.z + s.rz * worldSide * off;
  const gy = Math.min(heightAt(fx, fz), heightAt(fx + 3, fz), heightAt(fx - 3, fz), heightAt(fx, fz + 3), heightAt(fx, fz - 3));
  return Math.max(edgeY - s.y - 36, Math.min(edgeY - s.y - 6, gy - s.y - 6));
}

export function buildSetPieces(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, rockMat: THREE.Material, heightAt: (x: number, z: number) => number = () => -40) {
  const S = td.main.samples, N = S.length; const fns: Fn[] = [];
  if (!td.setPieces.length && !td.zgRocks.length) return { update: (): SetPieceFx[] => [] };
  // 2026-11-23 – boulders drifting in the zero-G tubes (trackBuilder.zgRockAt gives their place for the physics, the rivals and this
  // mesh alike): one instanced mesh of a craggy ball of radius 1, moved and slowly turned every frame.
  if (td.zgRocks.length) {
    const bg = new THREE.IcosahedronGeometry(1, 2), bp = bg.attributes.position as THREE.BufferAttribute, uv = bg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const k = 0.84 + h2(Math.round(x * 4.2), Math.round(y * 4.2 + z * 6.3)) * 0.24 + Math.sin(x * 3.9 + y * 3.3) * 0.1;
      bp.setXYZ(i, x * k, y * k * 0.86, z * k); uv.setXY(i, (x + z) * 0.35, y * 0.35);
    }
    bg.computeVertexNormals(); disp.push(bg);
    // Their own material: plain grey rock with a rim in the colour of the tube's energy field. The tubes stand in the dark (Oovo IV,
    // the Executioner) – without the rim a boulder is a black shape against black, and a hit comes from nowhere.
    const zm = new MeshStandardNodeMaterial({ color: new THREE.Color('#615e5a'), roughness: 0.93, metalness: 0.05 });
    zm.emissiveNode = TSL.color(theme.barrierColor).mul(TSL.pow(TSL.oneMinus(TSL.dot(TSL.normalView, TSL.positionViewDirection).clamp(0.0, 1.0)), 2.0)).mul(0.9);
    zm.name = 'zgRock'; disp.push(zm);
    const im = new THREE.InstancedMesh(bg, zm, td.zgRocks.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.name = 'zgRocks'; group.add(im);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    fns.push((_t, rt) => {
      td.zgRocks.forEach((k, i) => { const p = zgRockAt(td, k, rt); eu.set(rt * 0.11 + k.seed, rt * 0.07 + k.seed * 1.7, k.seed * 0.3); m4.compose(pv.set(p.x, p.y, p.z), qt.setFromEuler(eu), sv.setScalar(k.r)); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
    });
  }
  const isPrison = theme.terrain === 'prison', isOcean = theme.terrain === 'ocean', isIce = theme.id === 'ice', isCrystal = theme.id === 'crystal';
  // Biome-tinted architectural alloy so futuristic gates blend harmoniously into each world's palette
  const wallTint = new THREE.Color(theme.palette.wall[1]).lerp(new THREE.Color('#646c78'), isPrison || isOcean ? 0.75 : 0.52);
  const metal = new THREE.MeshStandardMaterial({ color: wallTint, metalness: 0.84, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: '#242932', metalness: 0.78, roughness: 0.44 });
  const accentMat = new THREE.MeshStandardMaterial({ color: theme.barrierColor, metalness: 0.45, roughness: 0.36, emissive: theme.barrierColor, emissiveIntensity: 0.25 });
  const tex = hazardTex(); const hazard = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.32, roughness: 0.48 });
  const lockTex = airlockTex(theme.barrierColor);
  const doorMat = new THREE.MeshStandardMaterial({ map: lockTex, metalness: 0.82, roughness: 0.32 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.barrierColor).multiplyScalar(1.3) });
  const iceMat = new THREE.MeshStandardMaterial({ color: '#b4e4ff', roughness: 0.18, metalness: 0.1, emissive: '#2c78b4', emissiveIntensity: 0.32 });
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#c89aff', roughness: 0.16, metalness: 0.15, emissive: '#7a34e8', emissiveIntensity: 0.55, flatShading: true });
  disp.push(metal, dark, accentMat, tex, hazard, lockTex, doorMat, glow, iceMat, crystalMat);
  const RED = new THREE.Color('#ff2e1c').multiplyScalar(1.4), AMBER = new THREE.Color('#ffae1e').multiplyScalar(1.35), OPEN = new THREE.Color(theme.barrierColor).lerp(new THREE.Color('#34ff9a'), 0.55).multiplyScalar(1.2), OFF = new THREE.Color('#1c1410');

  for (const sp of td.setPieces) {
    const s = S[sp.idx]; const yaw = Math.atan2(s.tx, s.tz);
    if (sp.type === 'rotor') {
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); group.add(root);
      // Deep foundation plinth (-2.6 m) so the rotor hub sits solidly embedded on any slope or banked curve
      const pylonG = merged([
        new THREE.CylinderGeometry(3.5, 4.1, 2.8, 24).translate(0, -1.35, 0),
        new THREE.CylinderGeometry(3.0, 3.6, 0.9, 24).translate(0, 0.42, 0),
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
      // ==================== FUTURISTIC BIOME-FUSED 3-BAY AIRLOCK / BLAST-DOOR BULKHEAD ====================
      // Replaces old iron portcullis with a sculpted sci-fi lock chamber organically embedded in the map's rock/ice/station architecture!
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); root.rotation.y = yaw; group.add(root);
      const span = Math.max(s.wallL, s.wallR) + 1.6; const w3 = (2 * sp.hw) / 3;
      const H_HEADER = 19.6, H_TOP = 24.4;
      (td.overheads ??= []).push({ idx: sp.idx, y0: s.y + H_HEADER - 1.1, y1: s.y + H_TOP + 0.6, half: 2.9 });

      const frameM: THREE.BufferGeometry[] = [], frameD: THREE.BufferGeometry[] = [], frameA: THREE.BufferGeometry[] = [];
      const glowParts: THREE.BufferGeometry[] = [], bioParts: THREE.BufferGeometry[] = [];

      // 1. Massive side bulkhead towers + organic rock/glacier/crystal/caisson formations fusing the lock seamlessly into the scenery
      for (const sd of [-1, 1]) {
        const wSide = -sd; // local +X corresponds to world -rx (left)
        const yBot = footDrop(s, wSide, span + 2.5, heightAt, isPrison);
        const pH = H_TOP - yBot;
        const px = sd * span;
        // Slanted futuristic armored bulkhead pier + hydraulic side buttress + glowing plasma power core
        frameM.push(new THREE.BoxGeometry(3.6, pH, 5.4).translate(px, yBot + pH / 2, 0));
        frameD.push(new THREE.BoxGeometry(1.4, pH - 2, 6.2).translate(px - sd * 1.25, yBot + pH / 2, 0));
        frameM.push(new THREE.BoxGeometry(3.2, pH * 0.72, 3.8).rotateZ(sd * 0.18).translate(px + sd * 2.9, yBot + pH * 0.34, 0));
        // Horizontal tech cooling ribs & glowing conduit rings along the pier
        for (const ry of [4.2, 8.8, 13.4, 17.6]) {
          frameD.push(new THREE.BoxGeometry(4.3, 0.55, 5.9).translate(px, ry, 0));
          glowParts.push(new THREE.BoxGeometry(0.24, 2.8, 0.32).translate(px - sd * 1.85, ry - 1.6, 2.65));
          glowParts.push(new THREE.BoxGeometry(0.24, 2.8, 0.32).translate(px - sd * 1.85, ry - 1.6, -2.65));
        }
        frameA.push(new THREE.BoxGeometry(4.1, 0.42, 5.8).translate(px, H_HEADER - 0.6, 0));
        // Connect solidly to road deck on orbital/ocean maps
        if (isPrison || isOcean) {
          const rEdge = s.hw * wSide * -s.bank;
          frameD.push(new THREE.BoxGeometry(6.5, 2.2, 5.6).translate(px - sd * 2.2, rEdge - 1.2, 0));
          // Armored seawall / orbital docking wings fusing outward
          frameM.push(new THREE.CylinderGeometry(2.6, 3.8, pH * 0.85, 8).translate(px + sd * 5.2, yBot + pH * 0.4, 0));
          glowParts.push(new THREE.TorusGeometry(2.85, 0.16, 6, 8).rotateX(Math.PI / 2).translate(px + sd * 5.2, 12.5, 0));
        } else {
          // Sculpted rock / glacier-ice / crystal outcrops growing naturally around the outer bulkhead & framing the arch shoulders!
          const bH = 21 + h2(sp.idx, sd + 5) * 6;
          bioParts.push(cragRock(new THREE.ConeGeometry(7.2, bH, 9), 0.28, sp.idx + sd * 7).translate(px + sd * 4.8, yBot + bH * 0.46, 0));
          bioParts.push(cragRock(new THREE.CylinderGeometry(3.4, 6.2, bH * 0.78, 8), 0.3, sp.idx + sd * 13).rotateZ(sd * -0.22).translate(px + sd * 2.4, yBot + bH * 0.52, -1.2));
          if (isCrystal) {
            for (const [ox, oy, oz, rz] of [[3.2, 11, 2.4, 0.38], [5.4, 15, -1.8, 0.52]]) {
              const cg = new THREE.ConeGeometry(1.1, 6.8, 6).rotateZ(sd * -rz).translate(px + sd * ox, oy, oz);
              disp.push(cg); root.add(mesh(cg, crystalMat, false));
            }
          }
        }
      }

      // 2. Armored futuristic overhead airlock chamber housing (houses retracted blast doors cleanly inside!)
      const bridgeW = 2 * span + 5.2;
      frameM.push(new THREE.BoxGeometry(bridgeW, 4.4, 5.6).translate(0, H_HEADER + 2.1, 0));
      frameD.push(new THREE.BoxGeometry(bridgeW + 0.8, 1.1, 6.3).translate(0, H_HEADER - 0.35, 0));
      frameD.push(new THREE.BoxGeometry(bridgeW - 1.2, 1.0, 4.4).translate(0, H_TOP + 0.2, 0));
      frameA.push(new THREE.BoxGeometry(bridgeW + 0.4, 0.32, 6.45).translate(0, H_HEADER + 4.15, 0));
      // Ribbed structural clamp arches along the overhead lock chamber
      const nRibs = Math.max(5, Math.round(sp.hw / 4.5));
      for (let r = 0; r <= nRibs; r++) {
        const rx = -span + 2 + (r / nRibs) * (2 * (span - 2));
        frameD.push(new THREE.BoxGeometry(0.65, 4.9, 6.2).translate(rx, H_HEADER + 2.1, 0));
      }
      // Glowing continuous energy-conduit lines across front & rear header fascias
      for (const fz of [-3.2, 3.2]) glowParts.push(new THREE.BoxGeometry(bridgeW - 4, 0.18, 0.14).translate(0, H_HEADER + 3.4, fz));
      // Overhead twin vertical blast-track guide mullions between the 3 airlock bays (above flight envelope: y = 13.4..19.6)
      for (let k = 1; k < 3; k++) {
        const mx = -(-sp.hw + k * w3);
        frameD.push(new THREE.BoxGeometry(1.05, 6.8, 2.4).translate(mx, H_HEADER - 3.2, 0));
        glowParts.push(new THREE.BoxGeometry(0.18, 6.2, 2.55).translate(mx, H_HEADER - 3.2, 0));
      }

      // 3. Road-conforming recessed floor docking sill (sheared to exact road bank, tucked -1.2 m deep → zero floating!)
      for (let k = 0; k < 3; k++) {
        const latC = -sp.hw + (k + 0.5) * w3, lx = -latC;
        const e = Math.min(1, Math.abs(latC) / sp.hw);
        const sillY = -latC * s.bank + (1 - e * e) * 0.2;
        const sill = new THREE.BoxGeometry(w3 - 0.3, 1.25, 2.1);
        const spA = sill.attributes.position as THREE.BufferAttribute;
        for (let vi = 0; vi < spA.count; vi++) spA.setY(vi, spA.getY(vi) + spA.getX(vi) * s.bank);
        sill.computeVertexNormals();
        frameD.push(sill.translate(lx, sillY - 0.58, 0));
      }

      const fgM = merged(frameM), fgD = merged(frameD), fgA = merged(frameA), fgG = merged(glowParts);
      disp.push(fgM, fgD, fgA, fgG);
      root.add(mesh(fgM, metal)); root.add(mesh(fgD, dark)); root.add(mesh(fgA, accentMat)); root.add(mesh(fgG, glow, false));
      if (bioParts.length) { const bg = merged(bioParts); disp.push(bg); root.add(mesh(bg, isIce ? iceMat : rockMat)); }

      // 4. Three sequenced futuristic armored blast-door bulkheads + synchronized plasma containment seams + chevron status bars
      const DOOR_H = 11.4, LIFT = 12.6;
      const doors: { grp: THREE.Group; baseY: number; lamp: THREE.MeshBasicMaterial; field: THREE.MeshBasicMaterial }[] = [];
      const wasDown = [false, false, false];
      for (let k = 0; k < 3; k++) {
        const latC = -sp.hw + (k + 0.5) * w3, lx = -latC;
        const baseY = -latC * s.bank + 0.15;
        const pw = w3 - 0.75;
        const dGrp = new THREE.Group(); dGrp.position.set(lx, baseY + LIFT, 0); root.add(dGrp);

        // Thick chamfered armored blast bulkhead slab + twin chrome hydraulic actuator pistons + interlocking teeth
        const slabParts: THREE.BufferGeometry[] = [
          new THREE.BoxGeometry(pw, DOOR_H, 1.05).translate(0, DOOR_H * 0.5 + 0.35, 0),
          new THREE.BoxGeometry(pw * 0.92, 0.55, 1.42).translate(0, 0.45, 0), // heavy lower pressure-seal shoe
          new THREE.BoxGeometry(pw * 0.92, 0.55, 1.38).translate(0, DOOR_H + 0.5, 0),
          // Twin hydraulic actuator rods extending up into overhead airlock housing
          new THREE.CylinderGeometry(0.28, 0.32, 8.5, 10).translate(-pw * 0.3, DOOR_H + 4.5, 0),
          new THREE.CylinderGeometry(0.28, 0.32, 8.5, 10).translate(pw * 0.3, DOOR_H + 4.5, 0),
        ];
        // Sculpted diagonal sci-fi armor ribs on front & rear faces
        const ribParts: THREE.BufferGeometry[] = [
          new THREE.BoxGeometry(pw + 0.15, 0.42, 1.48).translate(0, DOOR_H * 0.34, 0),
          new THREE.BoxGeometry(pw + 0.15, 0.42, 1.48).translate(0, DOOR_H * 0.7, 0),
        ];
        for (const sx of [-0.34, 0, 0.34]) ribParts.push(new THREE.BoxGeometry(0.55, DOOR_H - 0.4, 1.36).translate(sx * pw, DOOR_H * 0.5 + 0.35, 0));
        const sg = merged(slabParts), rg = merged(ribParts); disp.push(sg, rg);
        dGrp.add(mesh(sg, doorMat)); dGrp.add(mesh(rg, dark));

        // Status light material (shared by overhead bay indicator bar & blast-door plasma lock seam)
        const lm = new THREE.MeshBasicMaterial({ color: OPEN.clone() });
        const fm = new THREE.MeshBasicMaterial({ color: RED.clone(), transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
        disp.push(lm, fm);

        // Luminous plasma seal along bottom lip + center telemetry bar on both sides of the blast door
        const doorGlow = merged([
          new THREE.BoxGeometry(pw * 0.94, 0.24, 1.56).translate(0, 0.14, 0),
          new THREE.BoxGeometry(pw * 0.62, 0.34, 1.54).translate(0, DOOR_H * 0.52, 0),
        ]);
        disp.push(doorGlow); dGrp.add(mesh(doorGlow, lm, false));

        // Subtle force-field warning curtain stretching across the bay just before & during airlock lock-down
        const fg = new THREE.PlaneGeometry(pw, H_HEADER - 1.2); disp.push(fg);
        const fMesh = new THREE.Mesh(fg, fm); fMesh.position.set(lx, baseY + (H_HEADER - 1.2) * 0.5, 0); root.add(fMesh);

        // Wide futuristic status indicator bars on both front & rear sides of overhead lock header
        const hdrBar = merged([
          new THREE.BoxGeometry(pw * 0.78, 0.68, 0.4).translate(lx, H_HEADER + 1.25, 3.05),
          new THREE.BoxGeometry(pw * 0.78, 0.68, 0.4).translate(lx, H_HEADER + 1.25, -3.05),
          new THREE.BoxGeometry(pw * 0.42, 0.32, 0.4).translate(lx, H_HEADER + 2.25, 3.05),
          new THREE.BoxGeometry(pw * 0.42, 0.32, 0.4).translate(lx, H_HEADER + 2.25, -3.05),
        ]);
        disp.push(hdrBar); root.add(mesh(hdrBar, lm, false));

        doors.push({ grp: dGrp, baseY, lamp: lm, field: fm });
      }
      fns.push((t, rt, _pods, _dt, frozen, fx) => {
        for (let k = 0; k < 3; k++) {
          const d = doors[k], dr = gateDrop(sp, k, rt), warn = gateWarn(sp, k, rt);
          d.grp.position.y = d.baseY + (1 - dr) * LIFT;
          const blink = Math.sin(t * 22) > 0;
          d.lamp.color.copy(dr > 0.02 ? RED : warn ? (blink ? AMBER : OFF) : OPEN);
          d.field.color.copy(dr > 0.02 ? RED : AMBER);
          d.field.opacity = dr > 0.02 ? 0.11 * dr : warn ? (blink ? 0.14 : 0.03) : 0;
          const down = dr > 0.96;
          if (down && !wasDown[k] && !frozen && rt > 0.5) {
            const lat = -sp.hw + (k + 0.5) * w3;
            fx.push({ type: 'slam', x: sp.x + s.rx * lat, y: sp.y - lat * s.bank + 0.4, z: sp.z + s.rz * lat, strength: 0.9 });
          }
          wasDown[k] = down;
        }
      });
    } else if (sp.type === 'boulder') {
      // Sloped canyon rock-chute + deep foundation support piers + warning beacon + giant bouncing craggy boulder!
      const side = sp.lat; // +1 right, -1 left
      const chute = new THREE.Group(); chute.position.set(s.x, s.y, s.z); chute.rotation.y = yaw; group.add(chute);
      const lx = -side * (sp.hw + 5.5);
      const yBot = footDrop(s, side, sp.hw + 5.5, heightAt, isPrison);
      const mastBot = footDrop(s, side, sp.hw + 1.8, heightAt, isPrison);
      const chuteG = merged([
        new THREE.BoxGeometry(10, 0.8, 8.5).rotateZ(side * 0.48).translate(lx, 5.2, 0),
        new THREE.BoxGeometry(10, 2.2, 0.7).rotateZ(side * 0.48).translate(lx, 6.1, -4.1),
        new THREE.BoxGeometry(10, 2.2, 0.7).rotateZ(side * 0.48).translate(lx, 6.1, 4.1),
        // Support stanchions anchoring the chute firmly into the ground/canyon below (never floats!)
        new THREE.BoxGeometry(2.4, 6.0 - yBot, 7.6).translate(lx - side * 2.5, (6.0 + yBot) * 0.5, 0),
        new THREE.BoxGeometry(1.4, 3.6 - yBot, 7.2).translate(lx + side * 2.5, (3.6 + yBot) * 0.5, 0),
        new THREE.CylinderGeometry(0.22, 0.34, 9.6 - mastBot, 8).translate(-side * (sp.hw + 1.8), (9.6 + mastBot) * 0.5, -4.8),
      ]);
      const lampMat = new THREE.MeshBasicMaterial({ color: OPEN.clone() });
      const lampG = new THREE.SphereGeometry(0.65, 12, 8).translate(-side * (sp.hw + 1.8), 9.8, -4.8);
      disp.push(chuteG, lampMat, lampG);
      chute.add(mesh(chuteG, dark)); chute.add(mesh(lampG, lampMat, false));

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
        lampMat.color.copy(bs.active ? RED : bs.warn ? (Math.sin(t * 20) > 0 ? AMBER : OFF) : OPEN);
        if (bs.bounce && !prevBounce && !frozen && Math.abs(bs.lat) < sp.hw) {
          fx.push({ type: 'dust', x: bx, y: gy + 0.5, z: bz, strength: 0.85 });
        }
        prevBounce = bs.bounce;
      });
    } else if (sp.type === 'bridge') {
      // Twin side-mounted swing-bridge boom barriers with deep foundations down into terrain / sea-deck
      const root = new THREE.Group(); root.position.set(sp.x, sp.y, sp.z); root.rotation.y = yaw; group.add(root);
      const pivots: THREE.Group[] = [];
      const lampMat = new THREE.MeshBasicMaterial({ color: OPEN.clone() }); disp.push(lampMat);
      for (const sd of [-1, 1]) {
        const px = -sd * (sp.hw + 1.4);
        const edgeOff = -sd * sp.hw * s.bank;
        const yBot = footDrop(s, sd, sp.hw + 1.8, heightAt, isPrison);
        const topY = edgeOff + 9.0;
        const towerG = merged([
          new THREE.CylinderGeometry(1.7, 2.35, topY - yBot, 16).translate(px, (topY + yBot) * 0.5, 0),
          new THREE.TorusGeometry(1.95, 0.25, 8, 20).rotateX(Math.PI / 2).translate(px, edgeOff + 3.6, 0),
          new THREE.BoxGeometry(4.2, 1.4, 4.2).translate(px, edgeOff - 0.5, 0),
        ]);
        const lg = new THREE.SphereGeometry(0.6, 12, 8).translate(px, topY + 0.45, 0);
        disp.push(towerG, lg);
        root.add(mesh(towerG, metal)); root.add(mesh(lg, lampMat, false));
        const piv = new THREE.Group(); piv.position.set(px, edgeOff + 2.1, 0); root.add(piv);
        const L = sp.armLen; const dir = sd;
        const boomG = new THREE.BoxGeometry(L, 2.4, 1.35).translate(dir * (L / 2 + 1.2), 0, 0);
        const tipG = new THREE.BoxGeometry(1.1, 3.1, 1.8).translate(dir * (L + 1.2), 0, 0);
        const tipL = new THREE.SphereGeometry(0.42, 10, 8).translate(dir * (L + 1.2), 1.85, 0);
        disp.push(boomG, tipG, tipL);
        piv.add(mesh(boomG, hazard)); piv.add(mesh(tipG, dark)); piv.add(mesh(tipL, lampMat, false));
        pivots.push(piv);
      }
      fns.push((t, rt) => {
        const sw = bridgeSwing(sp, rt);
        pivots[0].rotation.y = (1 - sw) * (Math.PI * 0.48);
        pivots[1].rotation.y = -(1 - sw) * (Math.PI * 0.48);
        lampMat.color.copy(sw > 0.25 ? RED : bridgeWarn(sp, rt) || sw > 0.02 ? (Math.sin(t * 20) > 0 ? AMBER : OFF) : OPEN);
      });
    } else {
      // Collapsing rock arch ('arch') OR fracturing glacier ice-bridge ('icefall') with deep terrain-anchored abutments!
      const iceBridge = sp.type === 'icefall';
      const root = new THREE.Group(); root.position.set(s.x, s.y - 3, s.z); root.rotation.y = yaw; group.add(root);
      const Ra = sp.hw + 8, tube = (iceBridge ? 4.0 : 4.5) + h2(sp.idx, 3) * 1.5, segs = 9; const pieces: THREE.Mesh[] = [];
      (td.overheads ??= []).push({ idx: sp.idx, y0: 0, y1: 0, half: tube * 1.5, arch: { R: Ra, sy: 1.18, inner: tube * 1.3, yOff: -3, thick: tube * 2.5, sp: td.setPieces.indexOf(sp) } });
      // Anchor BOTH arch springings deep into terrain below so neither stump EVER floats on half-canyons or banked turns!
      const abutParts: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) {
        const wSide = -sd;
        const yBot = footDrop(s, wSide, Ra, heightAt, isPrison) + 3; // relative to root at s.y - 3
        const pH = Math.max(8, 2.5 - yBot);
        abutParts.push(cragRock(new THREE.CylinderGeometry(tube * 1.12, tube * 1.65, pH, iceBridge ? 7 : 11), 0.24, sp.idx + sd * 9).scale(1, 1, 1.45).translate(sd * Ra, yBot + pH * 0.5, 0));
      }
      const abutG = merged(abutParts); disp.push(abutG); root.add(mesh(abutG, iceBridge ? iceMat : rockMat));

      for (let k = 0; k < segs; k++) {
        const rs = iceBridge ? 6 : 10, arc = Math.PI / segs;
        const tg = new THREE.TorusGeometry(Ra, tube, rs, 8, arc);
        const cap = (ang: number, dir: number) => { const cg = new THREE.CircleGeometry(tube, rs); cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-Math.sin(ang) * dir, Math.cos(ang) * dir, 0))); cg.translate(Math.cos(ang) * Ra, Math.sin(ang) * Ra, 0); return cg; };
        const c0 = cap(0, -1), c1 = cap(arc, 1);
        const g = mergeGeometries([tg, c0, c1])!; tg.dispose(); c0.dispose(); c1.dispose(); g.rotateZ((k * Math.PI) / segs);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const nn = 0.85 + h2(Math.round(x * 0.7 + k), Math.round(y * 0.7 + z)) * 0.3;
          p.setXYZ(i, x, y * 1.18 + (nn - 1) * 2, z * nn * (iceBridge ? 1.65 : 1.45));
        }
        g.computeBoundingBox(); const c = g.boundingBox!.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z); g.computeVertexNormals();
        disp.push(g);
        const m = mesh(g, iceBridge ? iceMat : rockMat); m.position.copy(c); root.add(m); pieces.push(m);
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
          sp.state = 1; fx.push({ type: iceBridge ? 'ice' : 'collapse', x: sp.x, y: sp.y + 20, z: sp.z, strength: 1 });
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
