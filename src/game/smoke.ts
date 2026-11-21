import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';
import type { TerrainField } from './terrain';
import { macroTexture } from './textures';
import type { TrackData } from './trackBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, attribute, cameraPosition, clamp, color, cos, length, mix, normalize, oneMinus, positionLocal, pow, sin, smoothstep, texture, time, uniform, vec2, vec3 } = TSL;

/**
 * Particle-free smoke columns: camera-facing (cylindrical) strips with scrolling noise, wind bend and haze (scene fog).
 * One draw call for all columns. Used for distant landmarks (refinery stacks, volcanoes, wrecks, stations, rigs),
 * theme vents (lava fissures, methane vents, village fires) and moving dust / snow / methane devils.
 */
type Disp = { dispose: () => void }[];
export type SmokeKind = 'smoke' | 'steam' | 'ash' | 'dark' | 'methane';
export interface SmokeSrc { x: number; y: number; z: number; kind: SmokeKind; scale: number }
const KINDS: Record<SmokeKind, { col: [number, number, number]; h: number; w0: number; w1: number; op: number }> = {
  smoke: { col: [0.34, 0.32, 0.3], h: 170, w0: 6, w1: 42, op: 0.7 },
  steam: { col: [0.95, 0.96, 0.98], h: 90, w0: 4, w1: 26, op: 0.55 },
  ash: { col: [0.2, 0.18, 0.17], h: 430, w0: 30, w1: 170, op: 0.62 },
  dark: { col: [0.15, 0.14, 0.13], h: 120, w0: 3, w1: 24, op: 0.5 },
  methane: { col: [0.5, 0.56, 0.34], h: 110, w0: 5, w1: 28, op: 0.5 },
};
const SEG = 12;
interface Devil { cx: number; cz: number; r: number; a: number; sp: number; y: number; first: number }

export function buildSmoke(srcs: SmokeSrc[], theme: ThemeDef, td: TrackData, field: TerrainField, group: THREE.Group, disp: Disp, rng: () => number, waterY: number) {
  const S = td.main.samples, N = S.length;
  const spot = (minD: number, maxD: number, clear: number) => {
    for (let t = 0; t < 40; t++) {
      const s = S[Math.floor(rng() * N)]; const side = rng() < 0.5 ? -1 : 1; const d = minD + rng() * (maxD - minD);
      const x = s.x + s.rx * side * (s.hw + d), z = s.z + s.rz * side * (s.hw + d);
      if (field.distToTrack(x, z) < clear) continue; const y = field.heightAt(x, z); if (y < waterY + 0.5) continue;
      return { x, y, z };
    }
    return null;
  };
  // theme vents
  const extra: SmokeSrc[] = [];
  const vents = (n: number, kind: SmokeKind, minD: number, maxD: number, scale: [number, number]) => { for (let i = 0; i < n; i++) { const p = spot(minD, maxD, 40); if (p) extra.push({ ...p, kind, scale: scale[0] + rng() * (scale[1] - scale[0]) }); } };
  if (theme.id === 'lava') vents(8, 'dark', 120, 900, [0.6, 1.3]);
  if (theme.id === 'malastare') vents(6, 'methane', 100, 700, [0.6, 1.2]);
  if (theme.id === 'jungle') vents(3, 'steam', 200, 800, [0.4, 0.7]);
  if (theme.id === 'ice') vents(3, 'steam', 150, 700, [0.5, 0.9]);
  const cols = [...srcs, ...extra];
  // devils
  const devils: Devil[] = []; const devilCol: [number, number, number] | null = theme.id === 'desert' || theme.id === 'mesa' ? (() => { const c = new THREE.Color(theme.palette.ground[2]); return [c.r * 1.05, c.g, c.b * 0.95] as [number, number, number]; })() : theme.id === 'ice' ? [0.95, 0.97, 1.0] : theme.id === 'malastare' ? [0.72, 0.78, 0.52] : null;
  if (devilCol) for (let i = 0; i < (theme.id === 'ice' || theme.id === 'malastare' ? 3 : 5); i++) {
    const p = spot(90, 650, 70); if (!p) continue; const r = 40 + rng() * 120;
    devils.push({ cx: p.x, cz: p.z, r, a: rng() * Math.PI * 2, sp: ((5 + rng() * 6) / r) * (rng() < 0.5 ? -1 : 1), y: p.y, first: 0 });
  }
  const total = cols.length + devils.length;
  if (!total) return { update: (t: number) => { void t; } };
  const vpc = (SEG + 1) * 2; const nv = total * vpc;
  const pos = new Float32Array(nv * 3), corner = new Float32Array(nv * 2), param = new Float32Array(nv * 4), colA = new Float32Array(nv * 3), misc = new Float32Array(nv * 2); const idx: number[] = [];
  const write = (ci: number, x: number, y: number, z: number, H: number, w0: number, w1: number, c: [number, number, number], op: number, devil: number) => {
    const seed = rng() * 50;
    for (let r = 0; r <= SEG; r++) for (let sd = 0; sd < 2; sd++) {
      const v = ci * vpc + r * 2 + sd;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; corner[v * 2] = sd ? 1 : -1; corner[v * 2 + 1] = r / SEG;
      param[v * 4] = H; param[v * 4 + 1] = w0; param[v * 4 + 2] = w1; param[v * 4 + 3] = seed;
      colA[v * 3] = c[0]; colA[v * 3 + 1] = c[1]; colA[v * 3 + 2] = c[2]; misc[v * 2] = op; misc[v * 2 + 1] = devil;
    }
    for (let r = 0; r < SEG; r++) { const a = ci * vpc + r * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  };
  cols.forEach((s, i) => { const k = KINDS[s.kind]; write(i, s.x, s.y, s.z, k.h * s.scale, k.w0 * s.scale, k.w1 * s.scale, k.col, k.op, 0); });
  devils.forEach((d, j) => { d.first = (cols.length + j) * vpc; const h = 55 + rng() * 45; write(cols.length + j, d.cx, d.y, d.cz, h, 1.4, h * 0.2, devilCol!, 0.32, 1); });
  const g = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', posAttr); g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2)); g.setAttribute('aParam', new THREE.BufferAttribute(param, 4));
  g.setAttribute('aCol', new THREE.BufferAttribute(colA, 3)); g.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2)); g.setIndex(idx);
  // ---- shader ----
  const c = attribute('aCorner', 'vec2'), p = attribute('aParam', 'vec4'), pc = attribute('aCol', 'vec3'), pm = attribute('aMisc', 'vec2');
  const wind = uniform(new THREE.Vector3(1, 0, 0.45).normalize());
  const v = c.y, H = p.x, devil = pm.y;
  const tw = v.mul(10).sub(time.mul(4)).add(p.w);
  const swirl = vec3(sin(tw), 0, cos(tw)).mul(v.mul(p.z).mul(0.35)).mul(devil);
  const bend = wind.mul(pow(v, 1.6).mul(H).mul(0.35)).mul(oneMinus(devil));
  const center = positionLocal.add(vec3(0, v.mul(H), 0)).add(bend).add(swirl);
  const toCam = cameraPosition.sub(center); const right = normalize(vec3(toCam.z, 0, toCam.x.negate()).add(vec3(1e-4, 0, 0)));
  const w = p.y.add(p.z.sub(p.y).mul(pow(v, 0.75)));
  // own (weaker) aerial perspective + fast macroTexture billow (zero 3D Perlin ALU, zero overhead-camera NaN)
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  mat.positionNode = center.add(right.mul(c.x).mul(w));
  const u = c.x; const mTex = macroTexture();
  const n1 = texture(mTex, vec2(u.mul(0.28).add(p.w.mul(0.13)), v.mul(H.div(150)).sub(time.mul(0.045)))).r;
  const n2 = texture(mTex, vec2(u.mul(0.62).sub(p.w.mul(0.07)), v.mul(H.div(58)).sub(time.mul(0.085)))).g;
  const n = n1.mul(0.65).add(n2.mul(0.35));
  const edge = oneMinus(pow(abs(u), 1.6)); const vert = smoothstep(0.0, 0.05, v).mul(pow(oneMinus(v), 1.2));
  const camD = length(center.sub(cameraPosition)); const haze = smoothstep(300.0, 5000.0, camD).mul(0.55);
  mat.colorNode = mix(pc.mul(n.mul(0.5).add(0.72)), color(new THREE.Color(theme.fogColor)), haze);
  mat.opacityNode = clamp(edge.mul(vert).mul(n.mul(0.9).add(0.25)).mul(pm.x).mul(oneMinus(haze.mul(0.5))), 0.0, 1.0);
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; group.add(mesh); disp.push(g, mat);
  let lastT = -1, frame = 0;
  const update = (t: number) => {
    if (!devils.length) return;
    const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t; frame++;
    devils.forEach((d, j) => {
      d.a += d.sp * dt; const x = d.cx + Math.cos(d.a) * d.r, z = d.cz + Math.sin(d.a) * d.r;
      if ((frame + j) % 6 === 0) d.y = field.heightAt(x, z);
      for (let k = 0; k < vpc; k++) { const o = (d.first + k) * 3; pos[o] = x; pos[o + 1] = d.y; pos[o + 2] = z; }
    });
    posAttr.needsUpdate = true;
  };
  return { update };
}
