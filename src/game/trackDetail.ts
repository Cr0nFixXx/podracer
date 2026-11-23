import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { TexSet } from './textures';
import type { Sample, TrackData } from './trackBuilder';
import { GROUND_ORDER, type StaticBatcher } from './trackMesh';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, clamp, color, float, length, max, mix, oneMinus, positionView, positionWorld, sin, smoothstep, time, uniform, uv } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/**
 * Track-side detail geometry (all merged, instanced or chunked):
 *  - 3D guard rails on collision walls: H-posts with outer buttress struts, twin sculpted box rails,
 *    glowing emitter strip, and a reactive TSL energy-field curtain that flares on pod impacts!
 *  - Textured wind-blown sand/snow drifts, theme-matched raised corner kerbs, painted start grid + chevrons
 *  - Canyon wall talus boulders, armored light sconces, and high overhead gorge cables + beacons
 *  - Ramp substructure (flanged columns + cross-braces), launch/landing light bars, chasm warning masts
 *  - TV camera towers, angled space-truss sponsor gantries, and mineral-crater geyser/lava vents
 */
type Disp = { dispose: () => void }[];
export interface DetailOpts {
  across: number; disp: number; detail: number; tvCams: THREE.Vector3[]; batcher: StaticBatcher; groundTex?: TexSet; heightAt?: (x: number, z: number) => number;
  /** 2026-11-23: the wind-blown drifts are strips of the world's loose ground (sand, snow): `mat` = its alpha-blended surface material
   *  (world-space UVs with `tile` metres per repeat, vertex attribute `aFade`), `same` = the surfaces that are this ground themselves
   *  (no drift there). Absent: the opaque drift of before. */
  drift?: { mat: THREE.Material; tile: number; same: number[] };
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const UP = new THREE.Vector3(0, 1, 0);

export function addTrackDetail(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, rng: () => number, rockMat: THREE.Material, o: DetailOpts) {
  const barrier = new THREE.Color(theme.barrierColor);
  const lipStart = 1 - 2 / o.across; const dOff = o.disp * 0.95; // keeps markings/studs/kerbs strictly above displaced road (zero Z-fight!)
  const surf = (s: Sample, lat: number) => { const e = Math.min(1, Math.abs(lat) / s.hw); const lip = e > lipStart ? 0.18 * (e - lipStart) / (1 - lipStart) : 0; return s.y + s.ramp - lat * s.bank + (1 - e * e) * 0.2 + lip; };
  const yawQ = (s: Sample) => new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(s.tx, s.tz));
  const M = (x: number, y: number, z: number, q: THREE.Quaternion, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  const S = td.main.samples, N = S.length;
  const floatWorld = theme.terrain === 'prison' || theme.terrain === 'ocean';
  const gAt = o.heightAt ?? ((_x: number, _z: number) => -40);
  // Exact 3D road-surface orientation at sample index `i` (aligns plates/studs/vents with BOTH longitudinal hill slope & lateral bank!)
  const roadQ = (i: number, lat = 0) => {
    const s = S[i];
    const ia = td.main.closed ? ((i - 2) % N + N) % N : Math.max(0, i - 2);
    const ib = td.main.closed ? ((i + 2) % N + N) % N : Math.min(N - 1, i + 2);
    const a = S[ia], b = S[ib], ds = Math.max(1, (ib === ia ? 4 : Math.hypot(b.x - a.x, b.z - a.z)));
    const slope = (surf(b, lat) - surf(a, lat)) / ds;
    const fwd = new THREE.Vector3(s.tx, slope, s.tz).normalize();
    // In Three.js local +X corresponds to -rx when +Z = fwd
    const locX = new THREE.Vector3(-s.rx, s.bank, -s.rz).normalize();
    const up = new THREE.Vector3().crossVectors(fwd, locX).normalize();
    locX.crossVectors(up, fwd).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(locX, up, fwd));
  };

  // ---------------- materials ----------------
  const railTex = canvasTex(512, 128, c => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#dce0e6'); g.addColorStop(0.22, '#8b929c'); g.addColorStop(0.46, '#525760');
    g.addColorStop(0.54, '#c2c8d0'); g.addColorStop(0.78, '#8a909a'); g.addColorStop(1, '#585d66');
    c.fillStyle = g; c.fillRect(0, 0, 512, 128);
    // Longitudinal W-beam groove + brushed wear streaks + occasional yellow/black scuff chevrons
    c.fillStyle = 'rgba(20,22,26,0.45)'; c.fillRect(0, 58, 512, 12);
    for (let i = 0; i < 1100; i++) {
      c.fillStyle = `rgba(${h2(i, 1) > 0.45 ? '255,250,240' : '32,28,24'},${0.04 + h2(i, 2) * 0.1})`;
      c.fillRect(h2(i, 3) * 512, h2(i, 4) * 128, 6 + h2(i, 5) * 42, 1 + (h2(i, 6) > 0.8 ? 1 : 0));
    }
    // Panel seam + recessed bolts every 128 px
    for (let x = 0; x < 512; x += 128) {
      c.fillStyle = 'rgba(15,17,20,0.6)'; c.fillRect(x, 0, 3, 128);
      for (const y of [28, 100]) {
        c.fillStyle = '#2d3138'; c.beginPath(); c.arc(x + 18, y, 6, 0, 7); c.fill();
        c.fillStyle = '#dce2ea'; c.beginPath(); c.arc(x + 17, y - 1, 3.5, 0, 7); c.fill();
      }
    }
  });
  const railMat = new THREE.MeshStandardMaterial({ map: railTex, metalness: 0.82, roughness: 0.34, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: '#393e46', metalness: 0.78, roughness: 0.4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: barrier.clone().multiplyScalar(1.2), side: THREE.DoubleSide });
  const studA = new THREE.MeshBasicMaterial({ color: barrier.clone().multiplyScalar(1.08) });
  const studB = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfeaff') });
  const redL = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3020').multiplyScalar(1.3) });
  const greenL = new THREE.MeshBasicMaterial({ color: new THREE.Color('#30ff60').multiplyScalar(1.2) });

  // Reactive TSL energy-field barrier curtain (subtle scanlines at rest, bright expanding shockwave on impact!)
  const hitU = Array.from({ length: 4 }, () => uniform(new THREE.Vector4(0, -9999, 0, 0))); // xyz = world hit, w = age (0 = off, >0 decaying)
  const hitState = Array.from({ length: 4 }, () => ({ x: 0, y: -9999, z: 0, t: -99, str: 0 }));
  let hitCursor = 0, curTime = 0;
  const flashField = (x: number, y: number, z: number, strength = 1) => {
    const s = hitState[hitCursor]; hitCursor = (hitCursor + 1) & 3;
    s.x = x; s.y = y; s.z = z; s.t = curTime; s.str = Math.min(1.6, 0.55 + strength * 0.045);
  };
  const fieldMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  {
    const fu = uv(); const pw = positionWorld; const dCam = length(positionView);
    // Smooth band-limited barrier shimmer (zero grazing-angle scanline moiré) + vivid expanding impact shockwaves
    const distFade = ssInv(135.0, 22.0, dCam);
    const bottomGlow = ssInv(0.42, 0.0, fu.y).mul(0.11);
    const topRim = ssInv(0.12, 0.0, oneMinus(fu.y)).mul(0.08);
    const pulse = sin(fu.x.mul(0.18).sub(time.mul(3.2))).mul(0.02).add(0.03);
    const idle = bottomGlow.add(topRim).add(pulse.mul(ssInv(0.85, 0.0, fu.y))).mul(distFade);

    let flare: N = float(0);
    for (let k = 0; k < 4; k++) {
      const hu = hitU[k];
      const active = clamp(hu.w, 0.0, 1.5);
      const r = length(pw.sub(hu.xyz));
      const radius = oneMinus(clamp(hu.w, 0.0, 1.0)).mul(17.0).add(1.2);
      const ring = ssInv(2.5, 0.0, abs(r.sub(radius))).mul(active);
      const core = ssInv(8.0, 0.0, r).mul(active);
      const grid = sin(fu.x.mul(3.8)).mul(sin(fu.y.mul(14.0))).mul(0.35).add(0.65);
      flare = max(flare, ring.mul(1.05).add(core.mul(grid).mul(0.75)));
    }
    const fCol = color(barrier);
    fieldMat.colorNode = mix(fCol, color('#ffffff'), clamp(flare.mul(0.5), 0.0, 0.7));
    fieldMat.opacityNode = clamp(idle.add(flare.mul(0.72)), 0.0, 0.85);
  }

  // Theme-matched sculpted rumble kerb texture
  const kerbColA = theme.id === 'ice' ? '#1c62b8' : theme.id === 'lava' ? '#d47814' : theme.id === 'oovo' ? '#1a98c8' : '#b5241c';
  const kerbColB = theme.id === 'lava' ? '#2c2622' : '#eae6de';
  const kerbTex = canvasTex(128, 256, c => {
    c.fillStyle = kerbColA; c.fillRect(0, 0, 128, 128); c.fillStyle = kerbColB; c.fillRect(0, 128, 128, 128);
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(0, 125, 128, 6); c.fillRect(0, 0, 128, 4); // mortar joints
    c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(0, 0, 7, 256); c.fillRect(121, 0, 7, 256);
    // Rumble drainage ribs + rubber tire/hover scuffing
    for (let y = 16; y < 256; y += 32) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(14, y, 100, 5); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(14, y + 5, 100, 3); }
    for (let i = 0; i < 360; i++) { c.fillStyle = `rgba(26,22,18,${0.05 + h2(i, 11) * 0.2})`; c.fillRect(h2(i, 12) * 128, h2(i, 13) * 256, 1 + h2(i, 14) * 6, 1 + h2(i, 15) * 4); }
  });
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.52, metalness: 0.06 });
  const paintMat = new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.48, emissive: '#ffffff', emissiveIntensity: 0.12 });
  const trussMat = new THREE.MeshStandardMaterial({ color: '#585e68', metalness: 0.85, roughness: 0.34 });
  const cableMat = new THREE.MeshStandardMaterial({ color: '#23262b', metalness: 0.6, roughness: 0.65 });
  const hazardTex = canvasTex(128, 128, c => { c.fillStyle = '#d9a514'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#111'; for (let i = -128; i < 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 16, 0); c.lineTo(i + 16 - 128, 128); c.lineTo(i - 128, 128); c.fill(); } });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.48, metalness: 0.22 });
  disp.push(railTex, railMat, postMat, glowMat, fieldMat, studA, studB, redL, greenL, kerbTex, kerbMat, paintMat, trussMat, cableMat, hazardTex, hazardMat);

  const addStrip = (pos: number[], uvA: number[], idx: number[], mat: THREE.Material, cast: boolean, tris = 3000) => {
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2)); g.setIndex(idx); g.computeVertexNormals();
    o.batcher.addStrip(g, mat, tris, cast);
  };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow: boolean) => {
    if (!mats.length) { geo.dispose(); return null; }
    const im = new THREE.InstancedMesh(geo, mat, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); disp.push(geo);
    return im;
  };

  // ---------------- guard rails + reactive energy-field curtain ----------------
  const RING = 9; const ring: [number, number][] = [];
  for (let k = 0; k < RING; k++) { const a = (k / (RING - 1)) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a); ring.push([0.06 * Math.sign(ca) * Math.pow(Math.abs(ca), 0.45), 0.155 * Math.sign(sa) * Math.pow(Math.abs(sa), 0.45)]); }
  const rp: number[] = [], ru: number[] = [], ri: number[] = []; let rv = 0;
  const gp: number[] = [], gu: number[] = [], gi: number[] = []; let gv = 0;
  const fp: number[] = [], fuA: number[] = [], fi: number[] = []; let fv = 0;
  const posts: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [], studsA: THREE.Matrix4[] = [], studsB: THREE.Matrix4[] = [], canyonLights: THREE.Matrix4[] = [], sconceFrames: THREE.Matrix4[] = [];
  for (const path of td.paths) {
    const P = path.samples, n = P.length;
    for (const side of [-1, 1]) {
      const ok = (s: Sample) => !((side > 0 ? s.hR : s.hL) > 0) && !(side > 0 ? s.openR : s.openL) && !s.gap && !s.zeroG;
      let prev = false, prevRail = false, along = 0, postCount = 0;
      for (let i = 0; i < n; i += 2) {
        const s = P[i]; const on = ok(s); if (i > 0) along += 4;
        const rail = on && !s.lake; // Session 20: basins (lakes, plateaus) have no rails – beacons + a taller energy field mark the edge
        const wall = side > 0 ? s.wallR : s.wallL;
        if (on) {
          const lat = side * (wall + 0.06); const base = surf(s, side * s.hw) + 0.02;
          const ix = -side * s.rx, iz = -side * s.rz;
          if (rail) for (const hgt of [0.58, 1.12]) for (let k = 0; k < RING; k++) { const [px, py] = ring[k]; rp.push(s.x + s.rx * lat + ix * px, base + hgt + py, s.z + s.rz * lat + iz * px); ru.push(along / 8, k / (RING - 1)); }
          if (rail && prevRail) for (let r = 0; r < 2; r++) { const a0 = rv - RING * 2 + r * RING, b0 = rv + r * RING; for (let k = 0; k < RING - 1; k++) ri.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1); }
          if (rail) rv += RING * 2;
          const topY = base + 1.29;
          if (rail) { gp.push(s.x + s.rx * lat + ix * 0.04, topY, s.z + s.rz * lat + iz * 0.04, s.x + s.rx * lat - ix * 0.04, topY, s.z + s.rz * lat - iz * 0.04); gu.push(along, 0, along, 1);
          if (prevRail) gi.push(gv - 2, gv - 1, gv, gv - 1, gv + 1, gv);
          gv += 2; }
          // Energy-field curtain rising 1.65 m above the upper rail
          const fx = s.x + s.rx * lat, fz = s.z + s.rz * lat;
          fp.push(fx, rail ? topY + 0.02 : base + 0.3, fz, fx, rail ? topY + 1.68 : base + 3.0, fz); fuA.push(along, 0, along, 1);
          if (prev) fi.push(fv - 2, fv - 1, fv, fv - 1, fv + 1, fv);
          fv += 2;
          if (rail && i % 4 === 0) {
            const pl = side * (wall + 0.2); const px = s.x + s.rx * pl, pz = s.z + s.rz * pl;
            // Orient post so +X points outward (for angled outer buttress brace)
            const qPost = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(s.tx, s.tz) + (side < 0 ? Math.PI : 0));
            posts.push(M(px, base, pz, qPost));
            if (postCount++ % 4 === 0) caps.push(M(px, base + 1.48, pz, yawQ(s)));
          }
        }
        prev = on; prevRail = rail;
        if (path.id === 0 && i % 6 === 0 && !s.gap && s.ramp === 0 && !s.lake && !(side > 0 ? s.openR : s.openL) && !(side > 0 ? s.rockR : s.rockL)) { // (no studs along a natural rock border)
          const lat = side * (s.hw - 0.72);
          (side > 0 ? studsA : studsB).push(M(s.x + s.rx * lat, surf(s, lat) + 0.015 + dOff, s.z + s.rz * lat, roadQ(i, lat)));
        }
        // Armored guide-light sconces at the foot of canyon walls (skipped across open merge mouths)
        if ((side > 0 ? s.hR : s.hL) > 2 && !(side > 0 ? s.rockR : s.rockL) && !(side > 0 ? s.openR : s.openL) && !s.gap && i % 8 === 0) { // (canyon walls only – a rock border carries no lamps)
          const lat = side * (s.hw + 0.55); const ly = s.y + s.ramp - side * s.hw * s.bank + 0.72;
          const lx = s.x + s.rx * lat, lz = s.z + s.rz * lat, q = yawQ(s);
          canyonLights.push(M(lx, ly, lz, q));
          sconceFrames.push(M(lx + s.rx * side * 0.08, ly, lz + s.rz * side * 0.08, q));
        }
      }
    }
  }
  addStrip(rp, ru, ri, railMat, false, 5600);
  addStrip(gp, gu, gi, glowMat, false, 5600);
  addStrip(fp, fuA, fi, fieldMat, false, 4200); // chunked + frustum-culled so distant energy barriers never draw!
  // Compound H-beam guard-rail post with angled outer brace, base flange & plasma-projector mast tip
  const postGeo = mergeGeometries([
    new THREE.BoxGeometry(0.18, 1.44, 0.22).translate(0, 0.72, 0),
    new THREE.BoxGeometry(0.42, 0.08, 0.36).translate(0.08, 0.04, 0),
    new THREE.BoxGeometry(0.1, 0.95, 0.12).rotateZ(0.42).translate(0.24, 0.44, 0),
    new THREE.BoxGeometry(0.26, 0.1, 0.28).translate(0, 1.38, 0),
  ].map(g => g.toNonIndexed()));
  inst(postGeo, postMat, posts, false); // skip rendering 900 track-wide 18cm posts into the 3K shadow map
  inst(new THREE.BoxGeometry(0.24, 0.1, 0.3), glowMat, caps, false);
  inst(new THREE.BoxGeometry(0.32, 0.14, 0.6), studA, studsA, false);
  inst(new THREE.BoxGeometry(0.32, 0.14, 0.6), studB, studsB, false);
  inst(new THREE.BoxGeometry(0.16, 0.13, 1.45), glowMat, canyonLights, false);
  inst(new THREE.BoxGeometry(0.26, 0.28, 1.7), postMat, sconceFrames, false);

  // ---------------- overhead catenary power cables & marker beacons across two-walled gorges ----------------
  if (theme.terrain !== 'prison') {
    const cabGeos: THREE.BufferGeometry[] = [], beaconMats: THREE.Matrix4[] = [];
    for (let i = 30; i < N - 30; i += 28) {
      const s = S[i];
      if (s.gap || s.ramp > 0 || s.hL < 18 || s.hR < 18 || rng() > 0.55 * o.detail) continue;
      const hCab = 15 + rng() * Math.min(10, Math.min(s.hL, s.hR) - 16);
      const sag = 1.8 + rng() * 1.4;
      const spanL = s.hw + 2.5 + hCab * 0.18;
      const pL = new THREE.Vector3(s.x - s.rx * spanL, s.y + hCab, s.z - s.rz * spanL);
      const pM = new THREE.Vector3(s.x, s.y + hCab - sag, s.z);
      const pR = new THREE.Vector3(s.x + s.rx * spanL, s.y + hCab, s.z + s.rz * spanL);
      cabGeos.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pL, pM, pR), 10, 0.09, 5, false).toNonIndexed());
      beaconMats.push(M(pM.x, pM.y - 0.22, pM.z, yawQ(s)));
    }
    if (cabGeos.length) {
      const cg = mergeGeometries(cabGeos)!; cabGeos.forEach(x => x.dispose()); cg.computeBoundingSphere();
      const cm = new THREE.Mesh(cg, cableMat); cm.castShadow = false; group.add(cm); disp.push(cg);
    }
    inst(new THREE.OctahedronGeometry(0.34, 0), glowMat, beaconMats, false);
  }

  // ---------------- wind-blown drifts of sand / snow against rails, rocks and cliffs ----------------
  // 2026-11-23: a drift is a strip of the world's loose ground (`o.drift`) that thins out towards the middle of the road – its alpha
  // falls from the wall inwards and with the strength of the drift along the track, so drifts come and go without an edge. (Before:
  // an opaque band in a texture of its own with a straight inner edge – on a sand road a darker stripe of sand along both sides.)
  // No drift where the road is that ground itself.
  if (theme.id === 'ice' || theme.id === 'desert' || theme.id === 'mesa') {
    const soft = o.drift, PR = 7, FADE = [1, 1, 0.92, 0.74, 0.5, 0.24, 0];
    const gt = o.groundTex;
    let snowMat: THREE.Material | null = null;
    if (!soft) {
      const driftMap = gt?.map.clone(), driftNrm = gt?.normalMap.clone();
      if (driftMap) { driftMap.needsUpdate = true; disp.push(driftMap); }
      if (driftNrm) { driftNrm.needsUpdate = true; disp.push(driftNrm); }
      snowMat = new THREE.MeshStandardMaterial({
        color: theme.id === 'ice' ? '#f0f6fc' : '#f5e4cc',
        map: driftMap, normalMap: driftNrm,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: theme.id === 'ice' ? 0.68 : 0.94, metalness: 0,
      });
      disp.push(snowMat);
    }
    const sp: number[] = [], su: number[] = [], si: number[] = [], sf: number[] = []; let sv = 0;
    for (const path of td.paths) {
      const P = path.samples, n = P.length;
      for (const side of [-1, 1]) {
        let prev = false;
        for (let i = 0; i < n; i += 2) {
          const s = P[i]; const on = !s.gap && s.ramp === 0 && !(side > 0 ? s.openR : s.openL) && !s.zeroG && !s.lake && !(soft && soft.same.includes(s.surf));
          if (on) {
            const wall = Math.min(side > 0 ? s.wallR : s.wallL, s.hw + 0.4);
            // strength of the drift: slow swell along the track (soft drifts: no jump from one block of samples to the next)
            const amp = soft
              ? Math.max(0, Math.min(1, 0.36 + Math.sin(s.s * 0.011 + side * 2.1) * 0.5 + Math.sin(s.s * 0.031 + side) * 0.28 + Math.sin(s.s * 0.083 + side * 4.4) * 0.14))
              : 0.22 + 0.78 * Math.max(0, Math.sin(s.s * 0.011 + side * 2.1) * 0.55 + Math.sin(s.s * 0.031) * 0.2 + h2(i >> 3, side + 5) * 0.5);
            const width = soft ? 3.2 + amp * 5.2 : 2.0 + amp * 3.5, flat = s.surf > 0; // (natural ground has no kerb lip – `surf()` adds one)
            for (let k = 0; k < PR; k++) {
              const f = k / (PR - 1); const lat = side * (wall - f * width);
              const crest = Math.pow(1 - f, 1.55) * (1 + 0.14 * Math.sin(f * Math.PI));
              const e = Math.min(1, Math.abs(lat) / s.hw), y0 = flat ? s.y + s.ramp - lat * s.bank + (1 - e * e) * 0.2 + 0.06 : surf(s, lat);
              const x = s.x + s.rx * lat, z = s.z + s.rz * lat;
              sp.push(x, y0 + dOff + amp * 0.92 * crest + (soft ? 0.06 : k === PR - 1 ? -0.02 : 0.02), z);
              if (soft) { su.push(x / soft.tile, z / soft.tile); sf.push(FADE[k] * amp * (0.3 + 0.7 * amp)); } else su.push(f * (width / 12), s.s / 12); // (a weak drift is a few faint patches, not a narrow stripe)
            }
            if (prev) { const a = sv - PR, b = sv; for (let k = 0; k < PR - 1; k++) { if (side > 0) si.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1); else si.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k); } }
            sv += PR;
          }
          prev = on;
        }
      }
    }
    if (soft && si.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
      g.setAttribute('aFade', new THREE.Float32BufferAttribute(sf, 1)); g.setIndex(si); g.computeVertexNormals();
      o.batcher.addStrip(g, soft.mat, 3000, false, GROUND_ORDER.OVER);
    } else if (snowMat) addStrip(sp, su, si, snowMat, false, 3000);
  }

  // ---------------- sculpted chamfered kerbs on the inside of tight corners ----------------
  {
    const kp: number[] = [], ku: number[] = [], ki: number[] = []; let kv = 0;
    const prof = [-0.14, 0.07, 0.14, 0.15, 0.1, -0.14]; const PL = prof.length; // tucked inner/outer skirts never gap on hill crests
    let i = 0;
    while (i < N) {
      const c0 = S[i].curv;
      if (Math.abs(c0) < 1 / 230 || S[i].gap || S[i].ramp > 0 || S[i].lake || S[i].rockL || S[i].rockR) { i++; continue; } // (no kerbs on lakes / plateaus, none on natural ground with rock borders)
      const side = c0 > 0 ? 1 : -1; let j = i;
      while (j < N && Math.abs(S[j].curv) > 1 / 300 && Math.sign(S[j].curv) === side && !S[j].gap && S[j].ramp === 0 && !S[j].lake) j++;
      if (j - i >= 12) {
        let along = 0;
        for (let k = i; k < j; k++) {
          const s = S[k]; if (k > i) along += 2;
          const taper = Math.min(1, (k - i) / 3, (j - 1 - k) / 3);
          for (let p = 0; p < PL; p++) {
            const lat = side * (s.hw - 3.5 + (p / (PL - 1)) * 2.9);
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

  // ---------------- start grid boxes + glowing grid docking lights ----------------
  {
    const marks: THREE.Matrix4[] = [], gridLeds: THREE.Matrix4[] = [];
    for (let g = 0; g < 11; g++) {
      const row = Math.floor(g / 3), col = g % 3;
      let idx = td.startIdx - 6 - row * 13; idx = td.main.closed ? ((idx % N) + N) % N : Math.max(0, idx);
      const fIdx = Math.min(N - 1, idx + 2), front = S[fIdx], s = S[idx]; const lat = (col - 1) * s.hw * 0.55;
      const qF = roadQ(fIdx, lat);
      marks.push(M(front.x + front.rx * lat, surf(front, lat) + dOff, front.z + front.rz * lat, qF, 7.2, 1, 0.45));
      gridLeds.push(M(front.x + front.rx * lat, surf(front, lat) + 0.02 + dOff, front.z + front.rz * lat, qF, 2.2, 1, 0.18));
      for (const sd of [-1, 1]) {
        const l2 = lat + sd * 3.6;
        marks.push(M(s.x + s.rx * l2 + s.tx * 1.5, surf(s, l2) + dOff, s.z + s.rz * l2 + s.tz * 1.5, roadQ(idx, l2), 0.42, 1, 5.2));
      }
    }
    inst(new THREE.BoxGeometry(1, 0.14, 1), paintMat, marks, false); // embedded 7 cm down into road surface (never floats!)
    inst(new THREE.BoxGeometry(1, 0.14, 1), glowMat, gridLeds, false);
  }

  // ---------------- angular talus boulders & rock slabs at canyon wall feet ----------------
  {
    const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Angular faceted rock planes + natural strata step
      const nn = 0.7 + h2(Math.round(x * 3), Math.round(y * 3 + z * 7)) * 0.22 + Math.sin(x * 2.5 + z * 1.9) * 0.1 + Math.sin(y * 5.2) * 0.04;
      p.setXYZ(i, x * nn, y * nn * 0.72, z * nn);
    }
    g.computeVertexNormals();
    const mats: THREE.Matrix4[] = []; const e = new THREE.Euler(); const q = new THREE.Quaternion();
    for (let i = 0; i < N; i += 3) {
      const s = S[i]; if (s.gap) continue;
      for (const side of [-1, 1]) {
        if (!((side > 0 ? s.hR : s.hL) > 5) || (side > 0 ? s.openR : s.openL) || rng() > 0.62 * o.detail) continue;
        const size = 0.7 + Math.pow(rng(), 1.9) * 2.5; const lat = side * (s.hw + 0.65 + size * 0.55);
        e.set((rng() - 0.5) * 0.8, rng() * 6.28, (rng() - 0.5) * 0.8); q.setFromEuler(e);
        mats.push(M(s.x + s.rx * lat, s.y + s.ramp - side * s.hw * s.bank + size * 0.22, s.z + s.rz * lat, q, size * (0.9 + rng() * 0.3), size * (0.55 + rng() * 0.55), size));
      }
    }
    inst(g, rockMat, mats, false);
  }

  // ---------------- ramps: heavy truss substructure, launch/landing lights, chasm warning masts ----------------
  {
    const cols: THREE.Matrix4[] = [], braces: THREE.Matrix4[] = [], crossBeams: THREE.Matrix4[] = [], reds: THREE.Matrix4[] = [], greens: THREE.Matrix4[] = [], masts: THREE.Matrix4[] = [], mastLamps: THREE.Matrix4[] = [];
    const lipPos: number[] = [], lipUv: number[] = [], lipInd: number[] = [];
    const addConformLip = (s0: Sample, widthZ: number, dirSign: number) => {
      const segs = 12, v0 = lipPos.length / 3;
      const sAdj = S[td.main.closed ? ((S.indexOf(s0) + dirSign) % N + N) % N : Math.max(0, Math.min(N - 1, S.indexOf(s0) + dirSign))];
      const slope = (sAdj.y + sAdj.ramp - (s0.y + s0.ramp)) / 2 * dirSign;
      for (const rz of [-widthZ * 0.5, widthZ * 0.5]) for (let c = 0; c <= segs; c++) {
        const f = c / segs, lat = (f * 2 - 1) * s0.hw * 0.96;
        lipPos.push(s0.x + s0.rx * lat + s0.tx * rz, surf(s0, lat) + slope * rz + 0.05 + dOff, s0.z + s0.rz * lat + s0.tz * rz);
        lipUv.push(f * 6, rz > 0 ? 1 : 0);
      }
      for (let c = 0; c < segs; c++) { const a = v0 + c, b = a + segs + 1; lipInd.push(a, a + 1, b, a + 1, b + 1, b); }
    };
    for (let i = 1; i < N; i++) {
      const s = S[i], pv = S[i - 1];
      if (s.ramp > 0 && pv.ramp === 0) {
        let j = i; while (j < N && S[j].ramp > 0) j++;
        for (let k = i; k < j; k += 3) {
          const r = S[k]; if (r.ramp < 1.2) continue; const q = yawQ(r);
          crossBeams.push(M(r.x, r.y + r.ramp - Math.abs(r.bank) * r.hw - 0.35, r.z, q, r.hw * 1.92, 0.55, 0.65));
          for (const f of [-0.92, -0.45, 0, 0.45, 0.92]) {
            const lat = f * r.hw, cx = r.x + r.rx * lat, cz = r.z + r.rz * lat;
            const top = r.y + r.ramp - lat * r.bank, bot = floatWorld ? r.y - 6 : Math.min(r.y - 5, gAt(cx, cz) - 2.5);
            cols.push(M(cx, (top + bot) / 2, cz, q, 0.55, Math.max(1, top - bot), 0.55));
          }
          if ((k - i) % 6 === 0) for (const sd of [-1, 1]) {
            const lat = sd * r.hw * 0.7; const top = r.y + r.ramp * 0.92 - lat * r.bank;
            braces.push(M(r.x + r.rx * lat, (top + r.y - 4.2) / 2, r.z + r.rz * lat, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, Math.atan2(r.tx, r.tz), 0, 'YXZ')), 0.3, (top - r.y + 4.2) * 1.14, 0.3));
          }
        }
        const lipIdx = Math.max(i, j - 1), lip = S[lipIdx]; const q = roadQ(lipIdx);
        addConformLip(lip, 1.4, -1);
        for (let l = -1; l <= 1.001; l += 0.125) { const lat = l * lip.hw * 0.95; reds.push(M(lip.x + lip.rx * lat, surf(lip, lat) + 0.08 + dOff, lip.z + lip.rz * lat, q)); }
      }
      if (!s.gap && pv.gap) {
        const q = roadQ(i);
        addConformLip(s, 1.1, 1);
        for (let l = -1; l <= 1.001; l += 0.125) { const lat = l * s.hw * 0.95; greens.push(M(s.x + s.rx * lat, surf(s, lat) + 0.08 + dOff, s.z + s.rz * lat, q)); }
      }
      if (s.gap !== pv.gap) for (const sd of [-1, 1]) {
        const e = s.gap ? pv : s; const lat = sd * (e.hw + 1.2); const base = e.y + e.ramp - sd * e.hw * e.bank;
        masts.push(M(e.x + e.rx * lat, base - 2.5, e.z + e.rz * lat, yawQ(e), 1, 15.4, 1));
        mastLamps.push(M(e.x + e.rx * lat, base + 5.2, e.z + e.rz * lat, yawQ(e)));
      }
    }
    inst(new THREE.BoxGeometry(1, 1, 1), trussMat, cols, false);
    inst(new THREE.BoxGeometry(1, 1, 1), trussMat, braces, false);
    inst(new THREE.BoxGeometry(1, 1, 1), postMat, crossBeams, false);
    addStrip(lipPos, lipUv, lipInd, hazardMat, false, 1200);
    inst(new THREE.BoxGeometry(0.55, 0.2, 0.55), redL, reds, false);
    inst(new THREE.BoxGeometry(0.55, 0.2, 0.55), greenL, greens, false);
    inst(new THREE.CylinderGeometry(0.18, 0.28, 1, 8), postMat, masts, false);
    inst(new THREE.SphereGeometry(0.5, 12, 8), redL, mastLamps, false);
  }

  // ---------------- TV camera towers ----------------
  {
    const poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], tallies: THREE.Matrix4[] = [];
    for (const c of o.tvCams) {
      let bi = 0, bd = 1e12; for (let i = 0; i < N; i += 4) { const d = (S[i].x - c.x) ** 2 + (S[i].z - c.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      const s = S[bi]; if (s.canyon || s.gap || s.bridge || s.roof > 0 || s.lake || floatWorld) continue;
      const ground = Math.min(s.y - 4, gAt(c.x, c.z) - 2.2); const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(s.x - c.x, s.z - c.z));
      poles.push(M(c.x, (ground + c.y - 0.5) / 2, c.z, q, 1, Math.max(2, c.y - 0.5 - ground), 1));
      heads.push(M(c.x, c.y, c.z, q)); tallies.push(M(c.x, c.y + 0.55, c.z, q));
    }
    const head = mergeGeometries([
      new THREE.BoxGeometry(0.95, 0.72, 1.45),
      new THREE.CylinderGeometry(0.28, 0.34, 0.65, 12).rotateX(Math.PI / 2).translate(0, 0, 1.0),
      new THREE.BoxGeometry(0.7, 0.1, 0.45).translate(0, 0.38, 1.05), // lens sun hood
      new THREE.BoxGeometry(1.8, 0.14, 1.8).translate(0, -0.46, 0),
    ].map(g => g.toNonIndexed()));
    inst(new THREE.CylinderGeometry(0.16, 0.26, 1, 8), postMat, poles, false);
    inst(head, trussMat, heads, false);
    inst(new THREE.SphereGeometry(0.11, 8, 6), redL, tallies, false);
  }

  // ---------------- overhead space-truss sponsor gantries on long straights ----------------
  {
    const words = ['BOONTA CLASSIC', 'HYPERSPEED', 'WATTO PARTS', 'GALACTIC CUP', 'OUTER RIM GP'];
    const bannerTex = canvasTex(1024, 128, c => {
      const g = c.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#0f0a05'); g.addColorStop(0.5, '#2b1b08'); g.addColorStop(1, '#0f0a05'); c.fillStyle = g; c.fillRect(0, 0, 1024, 128);
      c.strokeStyle = theme.barrierColor; c.lineWidth = 6; c.strokeRect(6, 6, 1012, 116);
      c.fillStyle = theme.barrierColor; c.fillRect(24, 24, 14, 80); c.fillRect(986, 24, 14, 80);
      c.fillStyle = '#f5d588'; c.font = 'bold 62px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(words[Math.floor(rng() * words.length)] + ' ◆ PODRACING', 512, 66);
    });
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bannerTex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.55, side: THREE.DoubleSide });
    disp.push(bannerTex, bannerMat);
    const truss: THREE.BufferGeometry[] = [], banners: THREE.BufferGeometry[] = [], lamps: THREE.BufferGeometry[] = [];
    let last = -1e9;
    for (let i = 60; i < N - 60; i += 10) {
      if (i - last < 280) continue;
      let ok = true; for (let k = -20; k <= 20 && ok; k += 2) { const q = S[(i + k + N) % N]; if (Math.abs(q.curv) > 1 / 700 || q.canyon || q.gap || q.ramp > 0 || q.lake || q.openL || q.openR || q.roof > 0 || q.zeroG || q.bridge || q.underpass) ok = false; }
      if (!ok || Math.abs(i - td.startIdx) < 90 || td.setPieces.some(sp => Math.abs(sp.idx - i) < 70)) continue;
      last = i; const s = S[i]; const yaw = Math.atan2(s.tx, s.tz); const span = Math.max(s.wallL, s.wallR) + 1.8; const H = 21;
      (td.overheads ??= []).push({ idx: i, y0: s.y + H - 1.8 - span * 1.5 / 16, y1: s.y + H + 2.1, half: 1.0 });
      const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
      // Twin A-frame legs per side sunk deep into real terrain (or road-deck cantilever on prison/ocean) so bases NEVER float!
      for (const sd of [-1, 1]) {
        const wSide = -sd, fx = s.x + s.rx * wSide * span, fz = s.z + s.rz * wSide * span, edgeOff = -wSide * s.hw * s.bank;
        const gyRel = floatWorld ? edgeOff - 2.2 : Math.max(-28, Math.min(edgeOff - 0.6, gAt(fx, fz) - s.y));
        const bot = gyRel - (floatWorld ? 0.4 : 4.2), legH = H + 1.8 - bot;
        for (const dz of [-0.9, 0.9]) truss.push(new THREE.BoxGeometry(0.85, legH, 0.65).rotateX(dz * -0.05).translate(sd * span, bot + legH * 0.5, dz).applyMatrix4(m));
        truss.push(new THREE.BoxGeometry(3.2, 1.1, 3.8).translate(sd * span, gyRel - 0.2, 0).applyMatrix4(m));
        if (floatWorld) truss.push(new THREE.BoxGeometry(4.8, 0.9, 3.2).translate(sd * (span - 1.8), edgeOff - 1.0, 0).applyMatrix4(m));
      }
      for (const dy of [0, 1.7]) for (const dz of [-0.55, 0.55]) truss.push(new THREE.BoxGeometry(span * 2 + 1.4, 0.32, 0.32).translate(0, H + dy, dz).applyMatrix4(m));
      for (let x = -span; x < span; x += 2.2) truss.push(new THREE.BoxGeometry(0.16, 2.0, 0.16).rotateZ(((x / 2.2) | 0) % 2 ? 0.55 : -0.55).translate(x + 1.1, H + 0.85, -0.55).applyMatrix4(m));
      banners.push(new THREE.PlaneGeometry(span * 1.5, span * 1.5 / 8).rotateY(Math.PI).translate(0, H - 1.55, -0.62).applyMatrix4(m));
      for (let x = -span * 0.8; x <= span * 0.8 + 0.01; x += span * 0.32) lamps.push(new THREE.BoxGeometry(1.0, 0.26, 0.55).translate(x, H - 0.22, -0.85).applyMatrix4(m));
    }
    const addMerged = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean) => { if (!list.length) return; const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)); list.forEach(x => x.dispose()); if (!g) return; const mesh = new THREE.Mesh(g, mat); mesh.castShadow = cast; mesh.receiveShadow = true; group.add(mesh); disp.push(g); };
    addMerged(truss, trussMat, true); addMerged(banners, bannerMat, false); addMerged(lamps, glowMat, false);
  }

  // ---------------- geyser / lava vents with sculpted mineral sinter crater & pulsing warning ring ----------------
  let ventRing: THREE.InstancedMesh | null = null;
  let ventCore: THREE.InstancedMesh | null = null;
  if (td.hazards.length) {
    // Ragged volcanic/mineral crater cone collar + industrial grate bars
    // Deeply skirted (-1.6 m) volcanic/mineral crater cone collar aligned to 3D road slope + bank (never floats on hills/turns!)
    const rimParts: THREE.BufferGeometry[] = [
      new THREE.CylinderGeometry(4.1, 6.2, 2.0, 28, 1, true).translate(0, -0.55, 0),
      new THREE.TorusGeometry(4.2, 0.38, 8, 28).rotateX(Math.PI / 2).translate(0, 0.36, 0),
      ...Array.from({ length: 8 }, (_, k) => new THREE.BoxGeometry(8.1, 0.14, 0.24).rotateY((k / 8) * Math.PI).translate(0, 0.28, 0)),
    ];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      rimParts.push(new THREE.DodecahedronGeometry(0.55 + (k % 3) * 0.18, 0).scale(1.2, 0.85, 1.1).translate(Math.cos(a) * 4.55, 0.1, Math.sin(a) * 4.55));
    }
    const grate = mergeGeometries(rimParts.map(g => (g.index ? g.toNonIndexed() : g)));
    const vm = new THREE.MeshStandardMaterial({ color: theme.id === 'lava' ? '#241815' : '#333128', metalness: 0.55, roughness: 0.68, side: THREE.DoubleSide }); disp.push(vm);
    const mats = td.hazards.map(h => M(h.x, surf(S[h.idx], h.lat) + 0.02 + dOff, h.z, roadQ(h.idx, h.lat)));
    inst(grate, vm, mats, false);
    const rm = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const cm = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    disp.push(rm, cm);
    ventRing = inst(new THREE.TorusGeometry(3.85, 0.24, 8, 40).rotateX(Math.PI / 2), rm, mats.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.42, 0))), false);
    ventCore = inst(new THREE.CircleGeometry(3.6, 28).rotateX(-Math.PI / 2), cm, mats.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.16, 0))), false);
  }
  const ventCol = new THREE.Color(), hot = new THREE.Color(theme.id === 'malastare' ? '#a8ff38' : '#ff6a10'), ember = new THREE.Color(theme.id === 'malastare' ? '#285218' : '#581606');
  const update = (t: number) => {
    curTime = t;
    // Update reactive energy-field shockwave uniforms
    for (let k = 0; k < 4; k++) {
      const hs = hitState[k]; const age = t - hs.t;
      const w = age >= 0 && age < 0.95 ? (1 - age / 0.95) * hs.str : 0;
      hitU[k].value.set(hs.x, hs.y, hs.z, w);
    }
    if (!ventRing) return;
    td.hazards.forEach((h, i) => {
      const k = h.state >= 1 ? 1.55 : h.state > 0 ? 0.6 + 0.45 * Math.sin(t * 22) : 0.14;
      ventRing!.setColorAt(i, ventCol.copy(hot).multiplyScalar(k));
      if (ventCore) {
        const ck = h.state >= 1 ? 1.2 : h.state > 0 ? 0.45 + 0.25 * Math.sin(t * 16) : 0.22;
        ventCore.setColorAt(i, ventCol.copy(h.state > 0 ? hot : ember).multiplyScalar(ck));
      }
    });
    if (ventRing.instanceColor) ventRing.instanceColor.needsUpdate = true;
    if (ventCore?.instanceColor) ventCore.instanceColor.needsUpdate = true;
  };
  return { update, flashField };
}
