import * as THREE from 'three';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import type { Sample, TrackData } from './trackBuilder';
import type { StaticBatcher } from './trackMesh';

/* ------------------------------------------------------------------------------------------------
 * Open terrain model (replaces the old "trench everywhere" terrain):
 *  - open land follows a smooth regional level of the track, stays below the road near it (sightlines)
 *    and forms embankments instead of pits
 *  - plateaus/massifs only behind real cliff walls (per side, tapered at gorge ends)
 *  - distant mountain ranges (theme specific: terraced mesas, ridges, rolling hills) for a horizon
 *  - quadtree LOD mesh (fine near the track, coarse far away) with crack-hiding skirts
 *  - unlit skyline rings beyond the terrain edge
 * ---------------------------------------------------------------------------------------------- */

function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.02; } return s / n; }
function ridged(x: number, y: number, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); s += v * v * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const terrace = (v: number, k: number) => { const s = v * k, f = s - Math.floor(s); return (Math.floor(s) + sstep(0.3, 0.7, f)) / k; };
/** height fraction of the canyon-wall profile (world.ts) at lateral distance u (units of H/25) */
function wallFrac(u: number) {
  const P = [[0, 0], [2.5, 0.6], [5, 0.75], [9, 0.88], [15, 1]];
  if (u <= 0) return 0;
  for (let i = 1; i < P.length; i++) if (u <= P[i][0]) { const t = (u - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; }
  return 1;
}

export interface TerrainField {
  heightAt: (x: number, z: number) => number;
  splat: { g: number; b: number }; // splat weights of the last heightAt() call (gravel, basin)
  nearest: (x: number, z: number) => { d: number; s: Sample };
  roadClear: (x: number, z: number, r: number, margin?: number) => boolean;
  distToTrack: (x: number, z: number) => number;
  avgY: number;
}
export interface Extent { cx: number; cz: number; W: number; D: number }

// open-land amplitude, far-range start / full distance (beyond the road edge), far-range amplitude
const PARAMS: Record<string, [number, number, number, number]> = {
  canyon: [16, 420, 1500, 240], mountains: [22, 340, 1700, 470], jungle: [20, 380, 1600, 210], lava: [18, 380, 1500, 300], dunes: [26, 600, 2000, 120],
};

export function makeTerrainField(td: TrackData, theme: ThemeDef): TerrainField {
  const coarse: Sample[] = []; for (const p of td.paths) for (let i = 0; i < p.samples.length; i += 4) coarse.push(p.samples[i]);
  const cell = 40; const grid = new Map<number, Sample[]>(); const key = (cx: number, cz: number) => cx * 100003 + cz;
  for (const s of coarse) { const k = key(Math.floor(s.x / cell), Math.floor(s.z / cell)); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(s); }
  const sparse: Sample[] = []; for (let i = 0; i < td.main.samples.length; i += 20) sparse.push(td.main.samples[i]);
  const avgY = td.main.samples.reduce((a, s) => a + s.y, 0) / td.N;

  const nearest = (x: number, z: number) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell); let bd = 1e12, bs: Sample | null = null;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const arr = grid.get(key(cx + i, cz + j)); if (!arr) continue; for (const s of arr) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; bs = s; } } }
    if (!bs) { for (const s of sparse) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; bs = s; } } }
    return { d: Math.sqrt(bd), s: bs! };
  };
  const roadClear = (x: number, z: number, r: number, margin = 3) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell); const reach = Math.ceil((r + margin + 40) / cell) + 1;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const arr = grid.get(key(cx + i, cz + j)); if (!arr) continue;
      for (const q of arr) if (Math.hypot(q.x - x, q.z - z) - q.hw - 1 < r + margin) return false;
    }
    return true;
  };
  const distToTrack = (x: number, z: number) => { const { d, s } = nearest(x, z); return d - s.hw; };

  // regional level: Gaussian-weighted track height on a 64 m grid (smooth, no Voronoi creases)
  const b = td.bounds; const RM = 3400, G = 64;
  const gx0 = b.minX - RM, gz0 = b.minZ - RM;
  const gnx = Math.ceil((b.maxX - b.minX + 2 * RM) / G) + 2, gnz = Math.ceil((b.maxZ - b.minZ + 2 * RM) / G) + 2;
  const reg = new Float32Array(gnx * gnz); const sig2 = 2 * 240 * 240, cut2 = 720 * 720;
  const regS: Sample[] = []; for (const p of td.paths) for (let i = 0; i < p.samples.length; i += 10) regS.push(p.samples[i]);
  for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) {
    const x = gx0 + i * G, z = gz0 + j * G; let sw = 0.02, sy = 0.02 * avgY;
    for (const s of regS) { const dx = s.x - x, dz = s.z - z; const d2 = dx * dx + dz * dz; if (d2 > cut2) continue; const w = Math.exp(-d2 / sig2); sw += w; sy += w * s.y; }
    reg[j * gnx + i] = sy / sw;
  }
  const regAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(gnx - 1.001, (x - gx0) / G)), fz = Math.max(0, Math.min(gnz - 1.001, (z - gz0) / G));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * gnx + i;
    return (reg[k] * (1 - u) + reg[k + 1] * u) * (1 - v) + (reg[k + gnx] * (1 - u) + reg[k + gnx + 1] * u) * v;
  };

  const T = theme.terrain; const splat = { g: 0, b: 0 };
  const heightAt = (x: number, z: number) => {
    splat.g = 0; splat.b = 0;
    if (T === 'city') return -160;
    if (T === 'prison') return -400;
    const { d, s } = nearest(x, z);
    const roadLow = s.y - 3.2 - Math.abs(s.bank) * s.hw;
    if (T === 'ocean') {
      const far = avgY - 30 + sstep(0.55, 0.75, fbm(x * 0.004, z * 0.004)) * 45; const bs = s.hw + 8;
      let h = roadLow + (far - roadLow) * sstep(bs, bs + 120, d);
      if (s.gap && d < s.hw + 40) h = Math.min(h, s.y - 55 + sstep(s.hw, s.hw + 40, d) * 40);
      splat.g = 1 - sstep(6, 26, d - s.hw);
      return h;
    }
    const e = d - s.hw;
    const [amp, R0, R1, A] = PARAMS[T] ?? PARAMS.canyon;
    const n1 = fbm(x * 0.0021, z * 0.0021, 5), n2 = fbm(x * 0.009 + 7.1, z * 0.009 - 3.3, 3);
    const rg = regAt(x, z); let open = rg - 7 + (n1 - 0.5) * amp + (n2 - 0.5) * amp * 0.3;
    if (T === 'lava') open -= sstep(0.45, 0.72, fbm(x * 0.0035 + 3, z * 0.0035, 4)) * 22; // lava basins
    const bas = T === 'lava' ? 0 : sstep(0.335, 0.28, n1) * sstep(30, 75, e); // flat basins: salt flats, frozen lakes, swamps
    if (bas > 0) open += (rg - 7 - amp * 0.17 - open) * bas * 0.85;
    open = Math.min(open, roadLow + Math.max(0, e - 8) * 0.12); // sightlines: only gentle rises near the track
    open = Math.max(open, roadLow - Math.max(0, e) * 0.75); // embankment instead of pits next to the road
    const fr = sstep(R0, R1, e);
    splat.g = Math.max((1 - sstep(3, 14, e)) * 0.85, sstep(0.64, 0.74, n2) * 0.7 * (1 - fr)); splat.b = bas * (1 - fr);
    if (fr > 0) {
      const nx = x * 0.0011, nz = z * 0.0011;
      const shape = T === 'canyon' ? terrace(ridged(nx + 1.7, nz - 2.2, 5), 4) : T === 'jungle' ? fbm(nx * 1.6, nz * 1.6, 5) * 1.1 : Math.pow(ridged(nx + 0.3, nz + 0.9, 6), 1.25);
      open += fr * shape * A;
    }
    let h = open;
    // massif behind cliff walls (per side, already tapered at gorge entrances)
    const lat = (x - s.x) * s.rx + (z - s.z) * s.rz;
    const H = lat >= 0 ? s.hR : s.hL;
    if (H > 0 && !s.gap) {
      const rim = s.y + H, foot = s.hw + 0.6 + H * 0.6;
      const ch = d < foot
        ? roadLow + (rim - 3 - roadLow) * Math.pow(wallFrac(Math.max(0, d - s.hw) / Math.max(0.5, H / 25)), 1.5)
        : rim + (n2 - 0.5) * 10 - sstep(foot, foot + 170 + H * 3, d) * Math.max(0, rim - open);
      if (ch > h + 0.5) splat.b = 0;
      h = Math.max(h, ch);
    }
    if (s.gap && d < s.hw + 40) h = Math.min(h, s.y - 55 + sstep(s.hw, s.hw + 40, d) * 40);
    if (T === 'lava' && d < s.hw + 30) h = Math.min(h, roadLow - sstep(s.hw + 4, s.hw + 30, d) * 14);
    return h;
  };
  return { heightAt, nearest, roadClear, distToTrack, avgY, splat };
}

/** Quadtree LOD terrain: leaves of 16×16 cells, fine near the track, coarse far away; skirts hide T-junction cracks. */
export async function buildTerrain(field: TerrainField, theme: ThemeDef, gfx: GfxSettings, mat: THREE.Material, batcher: StaticBatcher, ext: Extent, progress: (p: number, m: string) => void) {
  const R = 16, geoQ = gfx.geometry;
  const minLeaf = geoQ >= 3 ? 64 : geoQ === 2 ? 110 : 220, maxLeaf = 1700;
  const S0 = Math.max(ext.W, ext.D);
  const rx0 = ext.cx - ext.W / 2, rx1 = ext.cx + ext.W / 2, rz0 = ext.cz - ext.D / 2, rz1 = ext.cz + ext.D / 2;
  const leaves: [number, number, number][] = [];
  const stack: [number, number, number][] = [[ext.cx - S0 / 2, ext.cz - S0 / 2, S0]];
  while (stack.length) {
    const [x0, z0, sz] = stack.pop()!;
    if (x0 > rx1 || x0 + sz < rx0 || z0 > rz1 || z0 + sz < rz0) continue;
    const dT = field.distToTrack(x0 + sz / 2, z0 + sz / 2) - sz * 0.7072;
    if (sz > minLeaf && (dT < sz * 1.5 || sz > maxLeaf)) { const hs = sz / 2; stack.push([x0, z0, hs], [x0 + hs, z0, hs], [x0, z0 + hs, hs], [x0 + hs, z0 + hs, hs]); }
    else leaves.push([x0, z0, sz]);
  }
  const hueAmt = theme.id === 'desert' || theme.id === 'mesa' ? 0.1 : 0.05;
  const n = R + 1, E = R + 3; const hg = new Float32Array(E * E), sg = new Float32Array(E * E), sb = new Float32Array(E * E);
  const baseIdx: number[] = [];
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) { const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1; baseIdx.push(a, b, d, b, c, d); }
  const edges: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) { edges[0].push(i); edges[1].push((n - 1) * n + i); edges[2].push(i * n); edges[3].push(i * n + n - 1); }
  for (let li = 0; li < leaves.length; li++) {
    const [x0, z0, sz] = leaves[li]; const c = sz / R;
    for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) { const k0 = j * E + i; hg[k0] = field.heightAt(x0 + (i - 1) * c, z0 + (j - 1) * c); sg[k0] = field.splat.g; sb[k0] = field.splat.b; }
    const H = (i: number, j: number) => hg[(j + 1) * E + (i + 1)];
    const vCount = n * n + 4 * n;
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uvs = new Float32Array(vCount * 2), col = new Float32Array(vCount * 3), spl = new Float32Array(vCount * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = x0 + i * c, z = z0 + j * c;
      let nx = (H(i - 1, j) - H(i + 1, j)) / (2 * c), ny = 1, nz = (H(i, j - 1) - H(i, j + 1)) / (2 * c); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      pos[k * 3] = x; pos[k * 3 + 1] = H(i, j); pos[k * 3 + 2] = z; nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      uvs[k * 2] = x / 30; uvs[k * 2 + 1] = z / 30;
      const v = 0.82 + fbm(x * 0.004, z * 0.004, 3) * 0.36, hue = (fbm(x * 0.0017 + 5, z * 0.0017, 2) - 0.5) * hueAmt * 2;
      col[k * 3] = v * (1 + hue); col[k * 3 + 1] = v; col[k * 3 + 2] = v * (1 - hue * 1.2);
      const ks = (j + 1) * E + (i + 1); spl[k * 4] = sg[ks]; spl[k * 4 + 1] = sb[ks]; spl[k * 4 + 2] = 0; spl[k * 4 + 3] = h2(i + x0, j + z0);
    }
    const idx = baseIdx.slice(); let v = n * n; const drop = c * 0.5 + 2;
    for (const e of edges) {
      for (let q = 0; q < n; q++) {
        const src = e[q], dst = v + q;
        pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - drop; pos[dst * 3 + 2] = pos[src * 3 + 2];
        for (let t = 0; t < 3; t++) { nor[dst * 3 + t] = nor[src * 3 + t]; col[dst * 3 + t] = col[src * 3 + t]; }
        for (let t = 0; t < 4; t++) spl[dst * 4 + t] = spl[src * 4 + t];
        uvs[dst * 2] = uvs[src * 2]; uvs[dst * 2 + 1] = uvs[src * 2 + 1];
      }
      for (let q = 0; q < n - 1; q++) { const a = e[q], b2 = e[q + 1], a2 = v + q, b3 = v + q + 1; idx.push(a, a2, b2, b2, a2, b3, a, b2, a2, b2, b3, a2); }
      v += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4)); g.setIndex(idx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    batcher.add(g, mat, false);
    if (li % 24 === 23) { progress(li / leaves.length, `Generiere Terrain (LOD ${li}/${leaves.length}) …`); await new Promise(r => setTimeout(r, 0)); }
  }
  return leaves.length;
}

/** Two unlit silhouette rings beyond the terrain edge: distant ranges / city skyline / islands fading into the haze. */
export function addSkyline(theme: ThemeDef, group: THREE.Group, disp: { dispose: () => void }[], avgY: number, ext: Extent) {
  if (theme.terrain === 'prison') return;
  const fog = new THREE.Color(theme.fogColor), top = new THREE.Color(theme.skyTop);
  const half = Math.hypot(ext.W, ext.D) / 2;
  const layers = [{ r: 1.04, amp: 1, mixTop: 0.3, dark: 0.74, seed: 1.3 }, { r: 1.2, amp: 1.35, mixTop: 0.16, dark: 0.88, seed: 7.7 }];
  layers.forEach((L, li) => {
    const seg = 360, R = half * L.r; const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const cBot = fog.clone(), cTop = fog.clone().lerp(top, L.mixTop).multiplyScalar(L.dark);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2; const px = Math.cos(a) * 3 + L.seed, pz = Math.sin(a) * 3;
      let h: number;
      if (theme.terrain === 'city') h = (h2(Math.floor(i / 3), L.seed) > 0.25 ? 1 : 0.25) * (120 + Math.floor(h2(Math.floor(i / 3) + 9, L.seed) * 7) * 70) * L.amp;
      else if (theme.terrain === 'ocean') h = 20 + ridged(px * 2, pz * 2, 4) * 160 * L.amp;
      else h = (140 + ridged(px * 1.5, pz * 1.5, 6) * 760 * (theme.terrain === 'mountains' ? 1.35 : theme.terrain === 'canyon' ? 0.75 : 1)) * L.amp;
      const x = ext.cx + Math.cos(a) * R, z = ext.cz + Math.sin(a) * R;
      pos.push(x, avgY - 400, z, x, avgY + h, z); col.push(cBot.r, cBot.g, cBot.b, cTop.r, cTop.g, cTop.b);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -7 + li; group.add(mesh); disp.push(g, m);
  });
}
