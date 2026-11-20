import * as THREE from 'three';
import type { ThemeDef } from './data';
import type { GfxSettings } from './settings';
import type { Sample, TrackData } from './trackBuilder';
import type { StaticBatcher } from './trackMesh';

/* ------------------------------------------------------------------------------------------------
 * Open terrain model:
 *  - Biome-specific geomorphology: asymmetric desert dunes + gravelly wadi channels + terraced mesas,
 *    glaciated alpine arêtes, karst jungle hills & river valleys, volcanic rift channels, ocean atolls
 *  - Open land stays below road sightlines near the track with sculpted embankments & talus aprons
 *  - Stratified massifs behind real cliff walls (per side, tapered at gorge ends; supports half-canyons)
 *  - Quadtree LOD mesh with macro curvature AO baked into vertex colours + 3-channel splat (aSplat)
 *  - Fast single-lookup sampleCover() cutting ground-cover placement cost by ~3×
 *  - Three-layer biome-authentic skyline silhouettes fading into horizon haze
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
const terrace = (v: number, k: number) => { const s = v * k, f = s - Math.floor(s); return (Math.floor(s) + sstep(0.24, 0.62, f)) / k; };
/** Asymmetric dune wave in [0,1]: gentle windward back, steep leeward slipface */
function duneWave(p: number) { const f = p - Math.floor(p); return f < 0.72 ? sstep(0, 0.72, f) : 1 - sstep(0.72, 1, f); }

/** height fraction of the canyon-wall profile (world.ts) at lateral distance u (units of H/25) */
function wallFrac(u: number) {
  const P = [[0, 0], [1.4, 0.3], [2.6, 0.58], [5.2, 0.76], [9.2, 0.9], [15, 1]];
  if (u <= 0) return 0;
  for (let i = 1; i < P.length; i++) if (u <= P[i][0]) { const t = (u - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; }
  return 1;
}

export interface TerrainField {
  heightAt: (x: number, z: number) => number;
  /** Single spatial-lookup height + road edge distance + gradient (gx = dh/dx, gz = dh/dz) for fast cover placement */
  sampleCover: (x: number, z: number, out: { y: number; edge: number; gx: number; gz: number }) => void;
  splat: { g: number; b: number; c: number }; // splat weights of last heightAt(): gravel, basin, crest/talus
  nearest: (x: number, z: number) => { d: number; s: Sample };
  roadClear: (x: number, z: number, r: number, margin?: number) => boolean;
  distToTrack: (x: number, z: number) => number;
  avgY: number;
}
export interface Extent { cx: number; cz: number; W: number; D: number }

// open-land amplitude, far-range start / full distance (beyond the road edge), far-range amplitude
const PARAMS: Record<string, [number, number, number, number]> = {
  canyon: [18, 400, 1480, 260], mountains: [25, 320, 1650, 500], jungle: [22, 360, 1560, 235], lava: [20, 360, 1480, 320], dunes: [28, 560, 1950, 140],
};

export function makeTerrainField(td: TrackData, theme: ThemeDef): TerrainField {
  // Ground-shaping samples skip elevated overpass bridges (`!s.bridge`) so terrain hugs the lower road cleanly beneath every viaduct!
  // `allGrid` still holds bridges too so `roadClear()` keeps trees, rocks & bridge piers completely off both upper & lower roadways.
  const coarse: Sample[] = [], allCoarse: Sample[] = [];
  for (const p of td.paths) for (let i = 0; i < p.samples.length; i += 4) { const s = p.samples[i]; allCoarse.push(s); if (!s.bridge) coarse.push(s); }
  const cell = 40; const grid = new Map<number, Sample[]>(), allGrid = new Map<number, Sample[]>();
  const key = (cx: number, cz: number) => cx * 100003 + cz;
  for (const s of coarse) { const k = key(Math.floor(s.x / cell), Math.floor(s.z / cell)); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(s); }
  for (const s of allCoarse) { const k = key(Math.floor(s.x / cell), Math.floor(s.z / cell)); let a = allGrid.get(k); if (!a) { a = []; allGrid.set(k, a); } a.push(s); }
  const sparse: Sample[] = []; for (let i = 0; i < td.main.samples.length; i += 20) if (!td.main.samples[i].bridge) sparse.push(td.main.samples[i]);
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
      const arr = allGrid.get(key(cx + i, cz + j)); if (!arr) continue;
      for (const q of arr) if (Math.hypot(q.x - x, q.z - z) - q.hw - 1 < r + margin) return false;
    }
    return true;
  };
  const distToTrack = (x: number, z: number) => { const { d, s } = nearest(x, z); return d - s.hw; };

  // regional level: Gaussian-weighted ground-road height on a 64 m grid (excludes elevated bridge decks so valleys stay low)
  const b = td.bounds; const RM = 3400, G = 64;
  const gx0 = b.minX - RM, gz0 = b.minZ - RM;
  const gnx = Math.ceil((b.maxX - b.minX + 2 * RM) / G) + 2, gnz = Math.ceil((b.maxZ - b.minZ + 2 * RM) / G) + 2;
  const reg = new Float32Array(gnx * gnz); const sig2 = 2 * 240 * 240, cut2 = 720 * 720;
  const regS: Sample[] = []; for (const p of td.paths) for (let i = 0; i < p.samples.length; i += 10) if (!p.samples[i].bridge) regS.push(p.samples[i]);
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

  const T = theme.terrain; const id = theme.id;
  const isDesert = id === 'desert' || id === 'mesa';
  const splat = { g: 0, b: 0, c: 0 };

  const evalWithSample = (x: number, z: number, s: Sample, d: number, writeSplat: boolean) => {
    if (writeSplat) { splat.g = 0; splat.b = 0; splat.c = 0; }
    if (T === 'prison') return -400;
    const roadLow = s.y - 3.1 - Math.abs(s.bank) * s.hw;
    if (T === 'ocean') {
      // Sculpted volcanic atolls: sandy shoals + rugged coastal islets + dramatic distant sea stacks
      const isleN = fbm(x * 0.0036, z * 0.0036, 5);
      const shoal = sstep(0.5, 0.72, isleN) * 34;
      const stack = Math.pow(sstep(0.66, 0.84, ridged(x * 0.0028 + 2.1, z * 0.0028, 4)), 1.4) * 58;
      const far = avgY - 31 + shoal + stack;
      const bs = s.hw + 8;
      let h = roadLow + (far - roadLow) * sstep(bs, bs + 115, d);
      if (s.gap && d < s.hw + 40) h = Math.min(h, s.y - 55 + sstep(s.hw, s.hw + 40, d) * 40);
      if (writeSplat) {
        splat.g = Math.max(1 - sstep(6, 26, d - s.hw), sstep(0.56, 0.72, isleN) * 0.45);
        splat.c = sstep(avgY - 12, avgY + 14, h) * 0.8;
      }
      return h;
    }
    const e = d - s.hw;
    const [amp, R0, R1, A] = PARAMS[T] ?? PARAMS.canyon;
    const n1 = fbm(x * 0.0021, z * 0.0021, 5), n2 = fbm(x * 0.0088 + 7.1, z * 0.0088 - 3.3, 3);
    const n3 = vnoise(x * 0.028, z * 0.028) - 0.5;
    const rg = regAt(x, z);
    let open = rg - 7 + (n1 - 0.5) * amp + (n2 - 0.5) * amp * 0.3 + n3 * 1.1;

    // Biome-specific midground landform relief (stays clear of immediate road edge via eFade)
    const eFade = sstep(16, 75, e);
    let crest = 0, wadiGravel = 0;
    if (isDesert) {
      // Sculpted barchan/transverse dune belts + winding gravelly dry wadi washes
      const duneMask = sstep(0.46, 0.68, n1) * eFade;
      const dw = duneWave(x * 0.0085 + z * 0.0032 + n2 * 1.45);
      open += (dw - 0.35) * 8.5 * duneMask;
      crest = sstep(0.58, 0.92, dw) * duneMask;
      const wadi = (1 - sstep(0.0, 0.036, Math.abs(fbm(x * 0.0026 + 4.3, z * 0.0026 - 1.9, 4) - 0.5))) * eFade * (1 - duneMask);
      open -= wadi * 3.8; wadiGravel = wadi * 0.82;
    } else if (T === 'mountains') {
      // Glacial drumlins, moraine ridges & crisp fluted snowdrifts
      const ridge = ridged(x * 0.0048 + 1.2, z * 0.0048, 4);
      open += (ridge - 0.45) * 9.5 * eFade;
      crest = sstep(0.58, 0.85, ridge) * eFade;
      wadiGravel = sstep(0.68, 0.82, ridge) * 0.55 * eFade;
    } else if (T === 'jungle') {
      // Meandering river/swamp channels + lush terraced hummocks
      const chan = (1 - sstep(0.0, 0.042, Math.abs(fbm(x * 0.0024 - 2.7, z * 0.0024 + 5.1, 4) - 0.5))) * eFade;
      const mound = sstep(0.55, 0.78, n1) * (n2 * 6.5) * eFade;
      open += mound - chan * 5.2;
      crest = sstep(0.56, 0.8, n1) * 0.7 * eFade;
      wadiGravel = chan * 0.65;
    } else if (T === 'lava') {
      // Collapsed glowing volcanic rift channels & jagged aa-lava pressure ridges
      const rift = sstep(0.44, 0.72, fbm(x * 0.0035 + 3, z * 0.0035, 4));
      const pRidge = Math.pow(ridged(x * 0.0065, z * 0.0065, 3), 1.5) * (1 - rift) * eFade;
      open += pRidge * 7.5 - rift * 23;
      crest = sstep(0.45, 0.8, pRidge) * 0.85;
    }

    // Flattened lowland basins: salt flats (desert), frozen lakes (ice), mossy/methane swamps (jungle/malastare), cooled lava crusts (lava)
    const bas = T === 'lava'
      ? sstep(0.36, 0.27, n1) * sstep(34, 85, e) * 0.85
      : sstep(0.34, 0.28, n1) * sstep(30, 75, e);
    if (bas > 0) open += (rg - 7 - amp * 0.17 - open) * bas * 0.86;

    open = Math.min(open, roadLow + Math.max(0, e - 8) * 0.125); // preserve clean racing sightlines
    open = Math.max(open, roadLow - Math.max(0, e) * 0.72);      // sculpted road embankment shoulder

    // Distant mountain ranges (multi-tiered mesas, alpine horns, karst towers, volcanic cordilleras)
    const fr = sstep(R0, R1, e);
    if (fr > 0) {
      const nx = x * 0.0011, nz = z * 0.0011;
      let shape: number;
      if (T === 'canyon') {
        const rd = ridged(nx + 1.7, nz - 2.2, 5);
        shape = terrace(rd, id === 'mesa' ? 5 : 4) * 0.88 + n2 * 0.08;
      } else if (T === 'jungle') {
        shape = fbm(nx * 1.55, nz * 1.55, 5) * 0.85 + Math.pow(ridged(nx * 2.1, nz * 2.1, 4), 1.6) * 0.42;
      } else {
        shape = Math.pow(ridged(nx + 0.3, nz + 0.9, 6), 1.22);
      }
      open += fr * shape * A;
      crest = Math.max(crest, fr * sstep(0.45, 0.82, shape));
    }

    let h = open;
    // Stratified massif behind cliff walls (per side, tapered at gorge entrances)
    const lat = (x - s.x) * s.rx + (z - s.z) * s.rz;
    const H = lat >= 0 ? s.hR : s.hL;
    let talus = 0;
    if (H > 0 && !s.gap) {
      const rim = s.y + H, foot = s.hw + 0.6 + H * 0.6;
      const rimTerrace = id === 'mesa' || id === 'desert' ? (terrace(n2, 3) - 0.5) * 12 : (n2 - 0.5) * 11;
      const ch = d < foot
        ? roadLow + (rim - 3 - roadLow) * Math.pow(wallFrac(Math.max(0, d - s.hw) / Math.max(0.5, H / 25)), 1.48)
        : rim + rimTerrace - sstep(foot, foot + 175 + H * 3.1, d) * Math.max(0, rim - open);
      if (ch > h + 0.5) {
        if (writeSplat) splat.b = 0;
        talus = 1 - sstep(foot, foot + 45, d);
      }
      h = Math.max(h, ch);
    }
    if (writeSplat) {
      const shoulder = (1 - sstep(2.5, 15, e)) * 0.88;
      const patch = sstep(0.62, 0.74, n2) * 0.72 * (1 - fr);
      splat.g = Math.max(shoulder, patch, wadiGravel, talus * 0.55);
      splat.b = Math.min(splat.b > 0 || !(H > 0 && h > open + 0.5) ? bas * (1 - fr) : 0, 1);
      splat.c = Math.min(1, crest);
    }
    if (s.gap && d < s.hw + 40) h = Math.min(h, s.y - 55 + sstep(s.hw, s.hw + 40, d) * 40);
    if (T === 'lava' && d < s.hw + 30) h = Math.min(h, roadLow - sstep(s.hw + 4, s.hw + 30, d) * 14);
    return h;
  };

  const heightAt = (x: number, z: number) => {
    const { d, s } = nearest(x, z);
    return evalWithSample(x, z, s, d, true);
  };
  const sampleCover = (x: number, z: number, out: { y: number; edge: number; gx: number; gz: number }) => {
    const { d, s } = nearest(x, z);
    out.edge = d - s.hw;
    const y0 = evalWithSample(x, z, s, d, false);
    out.y = y0;
    const eps = 1.25;
    const dX = Math.hypot(s.x - (x + eps), s.z - z), dZ = Math.hypot(s.x - x, s.z - (z + eps));
    out.gx = (evalWithSample(x + eps, z, s, dX, false) - y0) / eps;
    out.gz = (evalWithSample(x, z + eps, s, dZ, false) - y0) / eps;
  };
  return { heightAt, sampleCover, nearest, roadClear, distToTrack, avgY, splat };
}

/** Quadtree LOD terrain: leaves of 16×16 cells, fine near track, coarse far away; skirts hide T-junction cracks. */
export async function buildTerrain(field: TerrainField, theme: ThemeDef, gfx: GfxSettings, mat: THREE.Material, batcher: StaticBatcher, ext: Extent, progress: (p: number, m: string) => void) {
  const R = 16, geoQ = gfx.geometry;
  const minLeaf = geoQ >= 3 ? 72 : geoQ === 2 ? 112 : 220, maxLeaf = 1700;
  const S0 = Math.max(ext.W, ext.D);
  const rx0 = ext.cx - ext.W / 2, rx1 = ext.cx + ext.W / 2, rz0 = ext.cz - ext.D / 2, rz1 = ext.cz + ext.D / 2;
  const leaves: [number, number, number][] = [];
  const stack: [number, number, number][] = [[ext.cx - S0 / 2, ext.cz - S0 / 2, S0]];
  while (stack.length) {
    const [x0, z0, sz] = stack.pop()!;
    if (x0 > rx1 || x0 + sz < rx0 || z0 > rz1 || z0 + sz < rz0) continue;
    const dT = field.distToTrack(x0 + sz / 2, z0 + sz / 2) - sz * 0.7072;
    if (sz > minLeaf && (dT < sz * 1.55 || sz > maxLeaf)) { const hs = sz / 2; stack.push([x0, z0, hs], [x0 + hs, z0, hs], [x0, z0 + hs, hs], [x0 + hs, z0 + hs, hs]); }
    else leaves.push([x0, z0, sz]);
  }
  const hueAmt = theme.id === 'desert' || theme.id === 'mesa' ? 0.11 : theme.id === 'jungle' || theme.id === 'malastare' ? 0.08 : 0.05;
  const n = R + 1, E = R + 3;
  const hg = new Float32Array(E * E), sg = new Float32Array(E * E), sb = new Float32Array(E * E), sc = new Float32Array(E * E);
  const baseIdx: number[] = [];
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) { const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1; baseIdx.push(a, b, d, b, c, d); }
  const edges: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) { edges[0].push(i); edges[1].push((n - 1) * n + i); edges[2].push(i * n); edges[3].push(i * n + n - 1); }
  for (let li = 0; li < leaves.length; li++) {
    const [x0, z0, sz] = leaves[li]; const c = sz / R;
    for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) {
      const k0 = j * E + i; hg[k0] = field.heightAt(x0 + (i - 1) * c, z0 + (j - 1) * c);
      sg[k0] = field.splat.g; sb[k0] = field.splat.b; sc[k0] = field.splat.c;
    }
    const H = (i: number, j: number) => hg[(j + 1) * E + (i + 1)];
    const vCount = n * n + 4 * n;
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uvs = new Float32Array(vCount * 2), col = new Float32Array(vCount * 3), spl = new Float32Array(vCount * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = x0 + i * c, z = z0 + j * c;
      const hc = H(i, j), hl = H(i - 1, j), hr = H(i + 1, j), hd = H(i, j - 1), hu = H(i, j + 1);
      let nx = (hl - hr) / (2 * c), ny = 1, nz = (hd - hu) / (2 * c); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      pos[k * 3] = x; pos[k * 3 + 1] = hc; pos[k * 3 + 2] = z; nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      uvs[k * 2] = x / 30; uvs[k * 2 + 1] = z / 30;
      // Macro Laplacian curvature AO: concave gullies & cliff feet darken softly, sunlit ridges lift gently
      const lap = (hc - (hl + hr + hd + hu) * 0.25) / Math.max(3, c);
      const ao = Math.max(0.74, Math.min(1.12, 1 + lap * 0.55));
      const v = (0.82 + fbm(x * 0.004, z * 0.004, 3) * 0.36) * ao;
      const hue = (fbm(x * 0.0017 + 5, z * 0.0017, 2) - 0.5) * hueAmt * 2;
      col[k * 3] = v * (1 + hue); col[k * 3 + 1] = v; col[k * 3 + 2] = v * (1 - hue * 1.2);
      const ks = (j + 1) * E + (i + 1);
      const localCrest = Math.min(1, sc[ks] + Math.max(0, lap * 1.4));
      spl[k * 4] = sg[ks]; spl[k * 4 + 1] = sb[ks]; spl[k * 4 + 2] = localCrest; spl[k * 4 + 3] = h2(i + x0, j + z0);
    }
    const idx = baseIdx.slice(); let v = n * n; const drop = c * 0.5 + 2.5;
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
    if (li % 28 === 27) { progress(li / leaves.length, `Generiere Terrain (LOD ${li}/${leaves.length}) …`); await new Promise(r => setTimeout(r, 0)); }
  }
  return leaves.length;
}

/** Three atmospheric silhouette rings beyond the terrain edge: terraced mesas, alpine horns, volcanoes, city megatowers or atolls. */
export function addSkyline(theme: ThemeDef, group: THREE.Group, disp: { dispose: () => void }[], avgY: number, ext: Extent) {
  if (theme.terrain === 'prison') return;
  const fog = new THREE.Color(theme.fogColor), top = new THREE.Color(theme.skyTop);
  const half = Math.hypot(ext.W, ext.D) / 2;
  const layers = [
    { r: 1.02, amp: 0.92, mixTop: 0.34, dark: 0.7, seed: 1.3 },
    { r: 1.15, amp: 1.22, mixTop: 0.22, dark: 0.82, seed: 5.1 },
    { r: 1.3, amp: 1.5, mixTop: 0.12, dark: 0.91, seed: 9.7 },
  ];
  layers.forEach((L, li) => {
    const seg = 420, R = half * L.r; const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const cBot = fog.clone(), cTop = fog.clone().lerp(top, L.mixTop).multiplyScalar(L.dark);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2; const px = Math.cos(a) * 3.2 + L.seed, pz = Math.sin(a) * 3.2;
      let h: number;
      if (theme.terrain === 'ocean') {
        const isle = Math.max(0, ridged(px * 2.2, pz * 2.2, 5) - 0.36);
        h = (8 + isle * 280) * L.amp;
      } else if (theme.terrain === 'canyon') {
        // Iconic Monument-Valley / Tatooine flat-topped terraced mesas & slender sandstone needles
        const rd = ridged(px * 1.4, pz * 1.4, 5);
        const flat = terrace(rd, 5) * 580;
        const needle = Math.pow(Math.max(0, vnoise(px * 9, pz * 9) - 0.72), 1.5) * 480;
        h = (110 + flat + needle) * L.amp;
      } else if (theme.terrain === 'lava') {
        // Broad volcanic cones with truncated caldera rims + jagged basalt ridges
        const cone = Math.min(0.78, Math.pow(ridged(px * 1.3, pz * 1.3, 5), 1.15));
        h = (150 + cone * 860) * L.amp;
      } else {
        const mult = theme.terrain === 'mountains' ? 1.38 : 0.92;
        h = (140 + Math.pow(ridged(px * 1.55, pz * 1.55, 6), 1.12) * 780 * mult) * L.amp;
      }
      const x = ext.cx + Math.cos(a) * R, z = ext.cz + Math.sin(a) * R;
      pos.push(x, avgY - 420, z, x, avgY + h, z); col.push(cBot.r, cBot.g, cBot.b, cTop.r, cTop.g, cTop.b);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -8 + li; group.add(mesh); disp.push(g, m);
  });
}
