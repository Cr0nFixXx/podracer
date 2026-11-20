import * as THREE from 'three';
import type { TexKind } from './data';
import { TileNoise, aeolianWave, blur, clamp01, computeTexture, sstep, type TexBytes } from './texCore';
import { texGet, texPut } from './texStore';
import { applyPhotoDetail, hasPhotoFor, photosReady } from './photoTex';

export interface TexSet {
  map: THREE.Texture;       // RGB = sRGB albedo (with baked multi-scale cavity AO), A = packed height
  normalMap: THREE.Texture; // RGB = dual-scale tangent normal, A = packed roughness
  rhMap: THREE.Texture;     // R = height, G = roughness, B = cavity (legacy / POM)
  emissiveMap?: THREE.Texture;
}

function toTex(data: Uint8Array, size: number, srgb: boolean, aniso: number) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, TexSet>();
const texKey = (kind: TexKind, palette: string[], size: number, seed: number, emissive?: string) => `${kind}|${palette.join(',')}|${size}|${seed}|${emissive ?? ''}`;
function wrap(b: TexBytes, size: number, aniso: number, kind?: TexKind): TexSet {
  let map = b.map, nrm = b.nrm;
  if (kind && hasPhotoFor(kind)) { map = b.map.slice(); nrm = b.nrm.slice(); applyPhotoDetail(kind, size, map, nrm); } // copies: the originals go to the persistent cache
  const set: TexSet = { map: toTex(map, size, true, aniso), normalMap: toTex(nrm, size, false, aniso), rhMap: toTex(b.rh, size, false, aniso) };
  if (b.em) set.emissiveMap = toTex(b.em, size, true, aniso);
  return set;
}

/** Synchronous synthesis on the calling thread (cached per kind/palette/size/seed). */
export function generateTexture(kind: TexKind, palette: string[], size: number, seed: number, aniso = 8, emissiveColor?: string): TexSet {
  const key = texKey(kind, palette, size, seed, emissiveColor);
  const c = cache.get(key); if (c) return c;
  const set = wrap(computeTexture(kind, palette, size, seed, emissiveColor), size, aniso, kind);
  cache.set(key, set);
  return set;
}

// ---------- Session 13: parallel synthesis in Web Workers (cuts the dominant part of the loading time) ----------
export interface TexSpec { kind: TexKind; palette: string[]; size: number; seed: number; emissive?: string }
let workerFactory: (() => Worker) | null = null;
/** The app registers an inlined worker (main.tsx); without a factory (test harness, node) everything runs synchronously. */
export function setTextureWorkerFactory(f: (() => Worker) | null) { workerFactory = f; }
export const textureStats = { workers: 0, ms: 0, jobMs: [] as number[], cached: 0 };
let storeOn = false;
/** Persistent cache (IndexedDB). Off by default (harness, node); the app switches it on in main.tsx (`?nocache` disables). */
export function setTextureCacheEnabled(on: boolean) { storeOn = on; }
/** The cache key carries a hash of the synthesis code itself – any change to texCore.ts invalidates old entries automatically. */
let codeHash = '';
function storeKey(k: string) {
  if (!codeHash) { const src = computeTexture.toString() + TileNoise.toString() + blur.toString() + aeolianWave.toString(); let h = 2166136261; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); } codeHash = (h >>> 0).toString(36); }
  return codeHash + '|' + k;
}

/** Generates several texture sets at once: one job per worker, largest first; the main thread stays free meanwhile. */
const inflight = new Map<string, Promise<TexSet[]>>();
export const hasTextureWorkers = () => !!workerFactory && typeof Worker !== 'undefined';
/** Same request while it is still running (pre-warm during renderer init → buildWorld) shares one promise instead of starting twice. */
export function generateTextures(specs: TexSpec[], aniso: number): Promise<TexSet[]> {
  const id = specs.map(s => texKey(s.kind, s.palette, s.size, s.seed, s.emissive)).join(';') + '@' + aniso;
  let p = inflight.get(id);
  if (!p) { p = runTextures(specs, aniso).finally(() => inflight.delete(id)); inflight.set(id, p); }
  return p;
}
async function runTextures(specs: TexSpec[], aniso: number): Promise<TexSet[]> {
  await photosReady(); // photo detail is applied when a set is wrapped into GPU textures
  const t0 = performance.now();
  const keys = specs.map(s => texKey(s.kind, s.palette, s.size, s.seed, s.emissive));
  const todo: number[] = []; const seen = new Set<string>();
  specs.forEach((_s, i) => { if (!cache.has(keys[i]) && !seen.has(keys[i])) { seen.add(keys[i]); todo.push(i); } });
  todo.sort((a, b) => specs[b].size - specs[a].size);
  textureStats.workers = 0; textureStats.jobMs = []; textureStats.cached = 0;
  // 1) persistent cache
  if (storeOn && todo.length) {
    const hit = await texGet(todo.map(i => storeKey(keys[i])));
    for (let q = todo.length - 1; q >= 0; q--) { const i = todo[q], b = hit.get(storeKey(keys[i])); if (b) { cache.set(keys[i], wrap(b, specs[i].size, aniso, specs[i].kind)); todo.splice(q, 1); textureStats.cached++; } }
  }
  // 2) synthesise the rest: worker pool, or the calling thread as fallback
  const fresh: [string, TexBytes][] = [];
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 1;
  const n = workerFactory && typeof Worker !== 'undefined' ? Math.min(todo.length, Math.min(6, Math.max(2, cores - 1))) : 0; // the main thread mostly waits → 2 workers even on dual-core
  if (n >= 2) {
    try {
      await new Promise<void>((resolve, reject) => {
        let next = 0, done = 0; const ws: Worker[] = [];
        const fail = (e: unknown) => { ws.forEach(w => w.terminate()); reject(e); };
        const feed = (w: Worker) => { if (next >= todo.length) { w.terminate(); return; } const i = todo[next++], sp = specs[i]; w.postMessage({ id: i, kind: sp.kind, palette: sp.palette, size: sp.size, seed: sp.seed, emissive: sp.emissive }); };
        for (let k = 0; k < n; k++) {
          const w = workerFactory!(); ws.push(w);
          w.onerror = e => fail(e);
          w.onmessage = (e: MessageEvent<TexBytes & { id: number; ms: number }>) => {
            const d = e.data, i = d.id, b: TexBytes = d.em ? { map: d.map, nrm: d.nrm, rh: d.rh, em: d.em } : { map: d.map, nrm: d.nrm, rh: d.rh };
            textureStats.jobMs.push(d.ms); cache.set(keys[i], wrap(b, specs[i].size, aniso, specs[i].kind)); fresh.push([storeKey(keys[i]), b]);
            if (++done === todo.length) { ws.forEach(x => x.terminate()); resolve(); } else feed(w);
          };
          feed(w);
        }
      });
      textureStats.workers = n;
    } catch { /* worker blocked (CSP, old browser) → synchronous fallback below */ }
  }
  for (const i of todo) {
    if (cache.has(keys[i])) continue;
    const sp = specs[i], b = computeTexture(sp.kind, sp.palette, sp.size, sp.seed, sp.emissive);
    cache.set(keys[i], wrap(b, sp.size, aniso, sp.kind)); fresh.push([storeKey(keys[i]), b]);
    await new Promise(r => setTimeout(r, 0)); // keep the loading bar alive
  }
  // 3) write new sets to the persistent cache a little later (never delays the race start)
  if (storeOn && fresh.length) setTimeout(() => { void texPut(fresh); }, 2500);
  const out = specs.map((_sp, i) => cache.get(keys[i])!);
  textureStats.ms = Math.round(performance.now() - t0);
  return out;
}

// low-frequency tileable noise used for anti-tiling macro variation & clouds
let macroTex: THREE.DataTexture | null = null;
export function macroTexture() {
  if (macroTex) return macroTex;
  const s = 256; const N = new TileNoise(4242); const d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s; const i = (y * s + x) * 4;
    d[i] = N.fbm(u, v, 4, 5) * 255; d[i + 1] = N.fbm(u + 0.37, v + 0.71, 2, 4) * 255; d[i + 2] = N.ridged(u, v, 3, 4) * 255; d[i + 3] = 255;
  }
  macroTex = toTex(d, s, false, 4);
  return macroTex;
}

export function cloneSet(s: TexSet, rx: number, ry: number): TexSet {
  const c = (t?: THREE.Texture) => { if (!t) return undefined; const n = t.clone(); n.repeat.set(rx, ry); n.needsUpdate = true; return n; };
  return { map: c(s.map)!, normalMap: c(s.normalMap)!, rhMap: c(s.rhMap)!, emissiveMap: c(s.emissiveMap) };
}

// Soft particle sprite
export function spriteTexture() {
  const s = 64; const d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5) / s * 2 - 1, dy = (y + 0.5) / s * 2 - 1; const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r); const i = (y * s + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.pow(a, 1.6) * 255;
  }
  const t = new THREE.DataTexture(d, s, s); t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; return t;
}

/**
 * Per-world tileable detail map (RGB = tangent normal, A = micro albedo factor):
 *  - 'grit'    (roads/cliffs): angular aggregate, micro-cracks & pebbles
 *  - 'dunes'   (Tatooine/Mesa): crisp wind-blown aeolian sand ripples + quartz grains
 *  - 'sastrugi'(Ando Prime): directional wind-carved snow rills + frost facets
 *  - 'humus'   (Jungle/Malastare): fine rootlets, fallen twigs, moss pores & soil crumbs
 *  - 'lava'    (Vulkanwelt): ropy pahoehoe lava folds + sharp vesicular scoria
 *  - 'crystal' (Kristallschluchten): geometric mineral cleavage steps & facets
 *  - 'beach'   (Aquilaris): wave-rippled coastal sand + shell fragments
 */
export type DetailKind = 'grit' | 'dunes' | 'sastrugi' | 'humus' | 'lava' | 'crystal' | 'beach';
const detailCache = new Map<DetailKind, THREE.DataTexture>();

export function detailKindForTheme(themeId: string): DetailKind {
  switch (themeId) {
    case 'desert': case 'mesa': return 'dunes';
    case 'ice': return 'sastrugi';
    case 'jungle': case 'malastare': return 'humus';
    case 'lava': return 'lava';
    case 'crystal': return 'crystal';
    case 'aquilaris': return 'beach';
    default: return 'grit';
  }
}

export function detailNormalTexture(kind: DetailKind): THREE.DataTexture {
  const hit = detailCache.get(kind); if (hit) return hit;
  const S = 512; const seedMap: Record<DetailKind, number> = { grit: 777, dunes: 1301, sastrugi: 2113, humus: 3049, lava: 4211, crystal: 5381, beach: 6421 };
  const N = new TileNoise(seedMap[kind]); const w: number[] = [0, 0, 0, 0];
  const H = new Float32Array(S * S), A = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S; const i = y * S + x;
      let h = 0.5, a = 0.5;
      switch (kind) {
        case 'dunes': {
          const wp = N.fbm(u, v, 4, 3) * 1.9;
          const r1 = aeolianWave(u * 14 + v * 4 + wp);
          const r2 = aeolianWave(u * 38 - v * 6 + wp * 1.7);
          const g = N.fbm(u, v, 32, 3);
          N.worley(u, v, 48, w); const peb = (1 - sstep(0.05, 0.22, w[0])) * (w[2] > 0.86 ? 1 : 0);
          h = r1 * 0.52 + r2 * 0.2 + g * 0.16 + peb * 0.25;
          a = clamp01(0.46 + r1 * 0.24 + (g - 0.5) * 0.25 - peb * 0.22);
          break;
        }
        case 'sastrugi': {
          // Sharp wind-eroded snow flutes & undercut ripples
          const wp = N.fbm(u, v, 3, 4) * 2.3;
          const flute = aeolianWave(v * 11 + u * 2 + wp);
          const streak = N.noise2(u, v, 14, 64) * 0.6 + N.noise2(u, v, 32, 128) * 0.4;
          const ridge = Math.pow(N.ridged(u, v, 8, 3), 1.6);
          const spark = N.noise(u * 128, v * 128, 128) > 0.92 ? 0.18 : 0;
          h = flute * 0.48 + streak * 0.28 + ridge * 0.24;
          a = clamp01(0.45 + flute * 0.22 + (streak - 0.5) * 0.2 + spark);
          break;
        }
        case 'humus': {
          const roots = Math.pow(N.ridged(u, v, 9, 4), 2.2);
          N.worley(u, v, 34, w); const clod = 1 - sstep(0.05, 0.42, w[0]);
          const f = N.fbm(u, v, 18, 4);
          h = roots * 0.42 + clod * (0.3 + w[2] * 0.3) * 0.38 + f * 0.28;
          a = clamp01(0.48 + (f - 0.5) * 0.4 + (w[3] - 0.5) * 0.35 * clod - roots * 0.12);
          break;
        }
        case 'lava': {
          // Ropy pahoehoe lava chords + sharp fractured scoria vesicles
          const wp = N.fbm(u, v, 4, 4) * 3.4;
          const rope = Math.pow(Math.sin((u * 12 + v * 5 + wp) * Math.PI * 2) * 0.5 + 0.5, 1.4);
          N.worley(u, v, 44, w); const ves = (1 - sstep(0.04, 0.24, w[0])) * (w[2] > 0.65 ? 1 : 0);
          const cr = 1 - sstep(0.0, 0.03, w[1] - w[0]);
          h = rope * 0.58 + N.fbm(u, v, 16, 3) * 0.26 - ves * 0.28 - cr * 0.2;
          a = clamp01(0.46 + rope * 0.24 - ves * 0.22 - cr * 0.18);
          break;
        }
        case 'crystal': {
          N.worley(u, v, 18, w);
          const ed = 1 - sstep(0.0, 0.045, w[1] - w[0]);
          const stepH = Math.floor(w[2] * 6) / 6;
          const f = N.fbm(u, v, 24, 3);
          h = stepH * 0.65 - ed * 0.38 + f * 0.15;
          a = clamp01(0.44 + stepH * 0.34 + ed * 0.14);
          break;
        }
        case 'beach': {
          const wp = N.fbm(u, v, 3, 3) * 1.6;
          const swash = Math.sin((u * 10 + v * 10 + wp) * Math.PI * 2) * 0.5 + 0.5;
          N.worley(u, v, 52, w); const shell = (1 - sstep(0.04, 0.2, w[0])) * (w[2] > 0.85 ? 1 : 0);
          const f = N.fbm(u, v, 24, 3);
          h = swash * 0.46 + f * 0.3 + shell * 0.28;
          a = clamp01(0.48 + swash * 0.16 + shell * 0.32 + (f - 0.5) * 0.22);
          break;
        }
        default: {
          N.worley(u, v, 40, w); const peb = 1 - sstep(0.0, 0.45, w[0]);
          const cr = (1 - sstep(0.0, 0.025, w[1] - w[0])) * 0.3;
          const f = N.fbm(u, v, 16, 4);
          h = peb * (0.45 + w[2] * 0.55) * 0.68 + f * 0.32 - cr;
          a = clamp01(0.5 + (w[2] - 0.5) * 0.55 * peb + (f - 0.5) * 0.45 - (1 - peb) * 0.08 - cr * 0.25);
        }
      }
      H[i] = h; A[i] = a;
    }
  }
  const d = new Uint8Array(S * S * 4);
  const nStr = kind === 'sastrugi' || kind === 'lava' || kind === 'crystal' ? 3.8 : 3.2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const xm = (x - 1 + S) % S, xp = (x + 1) % S, ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S;
    const gx = H[y * S + xp] - H[y * S + xm], gy = H[yp + x] - H[ym + x];
    let nx = -gx * nStr, ny = -gy * nStr, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    d[i * 4] = (nx * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; d[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; d[i * 4 + 3] = A[i] * 255;
  }
  const tex = toTex(d, S, false, 8);
  detailCache.set(kind, tex);
  return tex;
}

export function microTexture() { return detailNormalTexture('grit'); }

/** Live graphics option: anisotropic filtering of all generated texture sets. */
export function setTextureAnisotropy(a: number) {
  for (const set of cache.values()) for (const t of [set.map, set.normalMap, set.rhMap, set.emissiveMap]) if (t && t.anisotropy !== a) { t.anisotropy = a; t.needsUpdate = true; }
}
