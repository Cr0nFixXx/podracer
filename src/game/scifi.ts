// ===== Session 16+: sci-fi track dressing =====
//  - flush road-conforming running edge light strips (sci-fi worlds, bridges & every tunnel/cave)
//  - grounded holographic info panels on projector masts, cantilevered hover beacons, energy conduits
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { Sample, TrackData } from './trackBuilder';
import { SURF } from './surfaces';
import { macroTexture } from './textures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { attribute, clamp, dot, float, floor, fract, length, mix, oneMinus, positionWorld, pow, sin, smoothstep, step, texture, time, uv, vec2, vec3 } = TSL;
type Disp = { dispose: () => void }[];
export const SCIFI_THEMES = new Set(['oovo', 'aquilaris', 'malastare']);

export function addSciFi(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, heightAt: (x: number, z: number) => number = () => -40, dOff = 0) {
  const S = td.main.samples, N = td.N, closed = td.main.closed, sci = SCIFI_THEMES.has(theme.id);
  const floatWorld = theme.terrain === 'prison' || theme.terrain === 'ocean';
  const glowC = new THREE.Color(theme.barrierColor);
  const nearStart = (i: number, d: number) => { let k = Math.abs(i - td.startIdx); if (closed) k = Math.min(k, N - k); return k < d; };
  const edgeY = (s: Sample, sd: number) => s.y + s.ramp - sd * s.hw * s.bank;
  const surfY = (s: Sample, lat: number) => { const e = Math.min(1, Math.abs(lat) / s.hw); const lip = e > 0.89 ? 0.18 * (e - 0.89) / 0.11 : 0; return s.y + s.ramp - lat * s.bank + (1 - e * e) * 0.2 + lip; };

  // ---------- 1. flush road-conforming running light strips along both road edges (main + cave branches) ----------
  {
    const pos: number[] = [], uvs: number[] = [], ind: number[] = [];
    for (const path of td.paths) {
      const P = path.samples, nP = P.length, pClosed = path.closed;
      for (const sd of [-1, 1]) {
        let prev = -1;
        for (let i = 0; i <= nP; i++) {
          if (!pClosed && i >= nP) break;
          const s = P[i % nP], sideOpen = sd > 0 ? s.openR : s.openL;
          const on = !s.gap && !sideOpen && !s.lake && ((path.id === 0 && (sci || s.bridge) && (s.surf === 0 || s.surf === SURF.deck)) || s.roof > 0); // Session 20: light strips only on built decks, not on natural ground
          if (!on) { prev = -1; continue; }
          // Step by 1 on ramps/hills for 100% flush seating over every crest, by 2 on flat sections
          if (prev >= 0 && i % 2 === 1 && s.ramp === 0 && i < nP - 1) continue;
          const base = pos.length / 3;
          for (const w of [-0.24, 0.24]) {
            const lat = sd * (s.hw - 1.05 + w);
            pos.push(s.x + s.rx * lat, surfY(s, lat) + 0.055 + dOff, s.z + s.rz * lat);
            uvs.push(w > 0 ? 1 : 0, i * 2);
          }
          if (prev >= 0) { if (sd > 0) ind.push(prev, base, prev + 1, prev + 1, base, base + 1); else ind.push(prev, prev + 1, base, prev + 1, base + 1, base); }
          prev = base;
        }
      }
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(ind); g.computeVertexNormals();
      const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
      const run = fract(uv().y.mul(1 / 28).sub(time.mul(1.5)));
      m.colorNode = vec3(glowC.r, glowC.g, glowC.b).mul(pow(run, 5.0).mul(2.4).add(0.55));
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; group.add(mesh); disp.push(g, m);
    }
  }
  if (!sci) return;

  // ---------- 2. holographic panels on grounded/cantilevered masts + 3. bracket-mounted beacons + 4. energy conduits ----------
  const sideFree = (s: Sample, sd: number) => !s.lake && (sd > 0 ? s.hR : s.hL) === 0 && !(sd > 0 ? s.openR : s.openL) && !s.gap && !(s.roof > 0) && !s.zeroG && !s.bridge && !s.underpass;
  const panels: THREE.BufferGeometry[] = [], solids: THREE.BufferGeometry[] = [], glows: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), qRd = new THREE.Quaternion();
  let n = 0;
  for (let i = 70; i < N - 40; i += 88, n++) {
    const s = S[i]; let sd = n % 2 ? 1 : -1; if (!sideFree(s, sd)) sd = -sd; if (!sideFree(s, sd) || nearStart(i, 70)) continue;
    const lat = sd * ((sd > 0 ? s.wallR : s.wallL) + 6.5), cx = s.x + s.rx * lat, cz = s.z + s.rz * lat, y0 = edgeY(s, sd);
    q.setFromAxisAngle(up, Math.atan2(s.tx, s.tz) + Math.PI + sd * 0.35);
    qRd.setFromAxisAngle(up, Math.atan2(s.tx, s.tz));
    const pg = new THREE.PlaneGeometry(8.4, 3.5); pg.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(4).fill(n * 7.3 + 1), 1));
    pg.applyQuaternion(q); pg.translate(cx, y0 + 9.4, cz); panels.push(pg);
    const topMast = y0 + 7.55;
    if (floatWorld) {
      // Weld holo-mast onto a heavy cantilevered steel outrigger arm extending solidly from the road deck underside!
      const mBot = y0 - 1.6, mH = topMast - mBot;
      solids.push(
        new THREE.CylinderGeometry(0.18, 0.34, mH, 6).translate(cx, mBot + mH * 0.5, cz),
        new THREE.BoxGeometry(7.6, 0.55, 0.9).applyQuaternion(qRd).translate(cx - s.rx * sd * 3.5, y0 - 0.95, cz - s.rz * sd * 3.5),
        new THREE.BoxGeometry(1.8, 0.5, 1.8).translate(cx, mBot, cz),
      );
    } else {
      const gy = Math.max(y0 - 24, Math.min(y0 - 0.5, heightAt(cx, cz)));
      const mBot = gy - 2.2, mH = topMast - mBot;
      solids.push(
        new THREE.CylinderGeometry(0.16, 0.36, mH, 6).translate(cx, mBot + mH * 0.5, cz),
        new THREE.BoxGeometry(2.1, 0.9, 2.1).translate(cx, gy - 0.2, cz),
      );
    }
    solids.push(new THREE.BoxGeometry(8.9, 0.14, 0.3).applyQuaternion(q).translate(cx, topMast, cz));
    glows.push(new THREE.BoxGeometry(8.6, 0.06, 0.12).applyQuaternion(q).translate(cx, topMast + 0.13, cz));
  }
  // side beacons mounted solidly to the road curb fascia with a cantilevered bracket (never dangling in mid-air!)
  for (let i = 20; i < N - 10; i += 25) {
    const s = S[i]; if (nearStart(i, 30)) continue;
    qRd.setFromAxisAngle(up, Math.atan2(s.tx, s.tz));
    for (const sd of [-1, 1]) {
      if (!sideFree(s, sd)) continue;
      const lat = sd * ((sd > 0 ? s.wallR : s.wallL) + 1.55), x = s.x + s.rx * lat, z = s.z + s.rz * lat, y = edgeY(s, sd);
      glows.push(new THREE.IcosahedronGeometry(0.34, 0).translate(x, y + 4.1, z), new THREE.TorusGeometry(0.62, 0.04, 4, 10).rotateX(Math.PI / 2).translate(x, y + 4.1, z));
      solids.push(
        new THREE.CylinderGeometry(0.06, 0.12, 4.4, 6).translate(x, y + 1.75, z),
        new THREE.BoxGeometry(2.1, 0.28, 0.32).applyQuaternion(qRd).translate(x - s.rx * sd * 0.9, y - 0.25, z - s.rz * sd * 0.9),
      );
    }
  }
  // energy conduits beside the track with brackets into the road edge and glowing coupling bands
  {
    const pos: number[] = [], ind: number[] = []; const R = 0.8, SEG = 8;
    for (const sd of [-1, 1]) {
      let prev = -1, runLen = 0;
      for (let i = 60; i < N - 30; i += 3) {
        const s = S[i], zone = Math.floor(i / 260) % 2 === (sd > 0 ? 0 : 1);
        if (!zone || !sideFree(s, sd) || nearStart(i, 80)) { prev = -1; runLen = 0; continue; }
        const lat = sd * ((sd > 0 ? s.wallR : s.wallL) + 4.3), cx = s.x + s.rx * lat, cz = s.z + s.rz * lat, cy = edgeY(s, sd) + 1.1, base = pos.length / 3;
        for (let a = 0; a < SEG; a++) { const an = a / SEG * Math.PI * 2, c = Math.cos(an) * R, d = Math.sin(an) * R; pos.push(cx + s.rx * c, cy + d, cz + s.rz * c); }
        if (prev >= 0) for (let a = 0; a < SEG; a++) { const b = (a + 1) % SEG; if (sd > 0) ind.push(prev + a, prev + b, base + a, prev + b, base + b, base + a); else ind.push(prev + a, base + a, prev + b, prev + b, base + a, base + b); }
        prev = base; runLen++;
        if (runLen % 4 === 1) {
          qRd.setFromAxisAngle(up, Math.atan2(s.tx, s.tz));
          solids.push(
            new THREE.BoxGeometry(4.8, 0.34, 0.48).applyQuaternion(qRd).translate(cx - s.rx * sd * 2.2, cy - 1.25, cz - s.rz * sd * 2.2),
            new THREE.BoxGeometry(0.45, 1.35, 0.48).applyQuaternion(qRd).translate(cx, cy - 0.65, cz),
          );
          glows.push(new THREE.TorusGeometry(R + 0.08, 0.09, 5, 12).applyQuaternion(qRd).translate(cx, cy, cz));
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
    const lit = step(0.5, fract(h.add(floor(time.mul(1.6).add(seed)).mul(0.37))));
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

/** Session 17 – window panes of the underwater tunnels: procedural ocean view in world space (depth gradient, moving caustics,
 *  sunlight shafts, drifting fish schools). Opaque – the real scene behind the glass is never shown. */
export function oceanWindowMaterial(seaY: number) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const wp = positionWorld, mt = macroTexture();
  const depth = clamp(float(seaY).sub(wp.y).div(28.0), 0.0, 1.0);
  let col = mix(vec3(0.08, 0.54, 0.66), vec3(0.0, 0.07, 0.19), pow(depth, 0.72));
  const c1 = texture(mt, wp.xz.mul(0.021).add(vec2(time.mul(0.012), time.mul(0.008)))).r, c2 = texture(mt, wp.xz.mul(0.034).sub(vec2(time.mul(0.016), time.mul(-0.011)))).g;
  const caust = smoothstep(0.4, 0.62, c1.mul(c2).mul(2.3));
  col = col.add(vec3(0.26, 0.5, 0.5).mul(caust).mul(oneMinus(depth).mul(0.8).add(0.2)));
  const shaft = pow(sin(wp.x.mul(0.19).add(wp.z.mul(0.13)).add(wp.y.mul(0.5)).add(time.mul(0.35))).mul(0.5).add(0.5), 6.0);
  col = col.add(vec3(0.1, 0.25, 0.27).mul(shaft).mul(oneMinus(depth)));
  const u = wp.x.add(wp.z).mul(0.5), row = floor(wp.y.mul(0.42));
  const dir = fract(sin(row.mul(12.9898)).mul(43758.5)).sub(0.5).mul(2.4);
  const fu = u.mul(0.22).add(time.mul(dir)), cell = floor(fu), f = fract(fu).sub(0.5), fv = fract(wp.y.mul(0.42)).sub(0.5);
  const present = step(0.72, fract(sin(dot(vec2(cell, row), vec2(127.1, 311.7))).mul(43758.5)));
  const fish = oneMinus(smoothstep(0.1, 0.16, length(vec2(f.mul(0.9), fv.mul(2.6)))));
  m.colorNode = col.mul(oneMinus(fish.mul(present).mul(0.7)));
  return m;
}
