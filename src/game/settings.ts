import { PODS, STAT_KEYS, TRACKS, type StatKey } from './data';

import type { TimeOfDay, WeatherKind } from './environment';
import { defaultKeys, defaultPad, normalizeKeys, normalizePad, type KeyMap, type PadMap } from './keymap';

export interface GfxSettings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  renderScale: number;
  shadows: number; // 0 off, 1 1024, 2 2048, 3 4096
  texRes: number;
  parallax: boolean;
  ao: boolean;
  bloom: boolean;
  bloomStrength: number; // 0..1.5
  godRays: boolean;
  ssr: boolean;
  reflRes?: number;     // 0.35..1 resolution scale of the screen-space reflections
  lodBias?: number;     // 0.5..2 distance scale for landscape LOD switches (live)
  podDetail?: number;   // 0.5..3 distance scale for detailed rival pods (live)
  weatherFx?: number;   // 0 off · 1 reduced · 2 full: rain/snow particles, gusts, spray, splashes, lens drops (live)
  volumetrics?: number; // 0 off · 1 height fog + light cones · 2 + drifting fog banks
  lensFx?: boolean; // sun glare / lens flare + rain droplets on the lens (default on)
  csm?: boolean; // opt-in 2-cascade sun shadows (near 0–105 m + far 105–520 m) – costs one extra shadow pass
  motionBlur: boolean;
  cinematic: boolean;
  particles: number;
  detail: number;
  geometry: number; // 1..3
  aa: 'none' | 'fxaa' | 'smaa';
  anisotropy: number; // 1, 4, 8, 16
  shaderDetail: number; // 0..2
  bumpMapping: boolean;
  tessellation: number; // 0..2
  fov: number;
  drawDistance: number;
  showFps: boolean;
  backend?: 'auto' | 'webgl'; // auto = WebGPU with WebGL2 fallback
  batching?: boolean; // static track geometry as BatchedMesh (per-object culling, fewer draws)
}

export const PRESETS: Record<'low' | 'medium' | 'high' | 'ultra', Omit<GfxSettings, 'preset' | 'fov' | 'showFps' | 'bloomStrength'>> = {
  low: { renderScale: 0.75, shadows: 0, texRes: 512, parallax: false, ao: false, bloom: false, godRays: false, ssr: false, motionBlur: false, cinematic: false, particles: 0.35, detail: 0.4, geometry: 1, aa: 'none', drawDistance: 0.6, anisotropy: 4, shaderDetail: 0, bumpMapping: true, tessellation: 0, csm: false, lensFx: false, lodBias: 0.6, podDetail: 0.6, weatherFx: 1, volumetrics: 0, reflRes: 0.35 },
  medium: { renderScale: 1, shadows: 1, texRes: 1024, parallax: false, ao: false, bloom: true, godRays: true, ssr: false, motionBlur: true, cinematic: true, particles: 0.6, detail: 0.7, geometry: 2, aa: 'fxaa', drawDistance: 0.8, anisotropy: 8, shaderDetail: 1, bumpMapping: true, tessellation: 0, csm: false, lensFx: true, lodBias: 0.8, podDetail: 0.8, weatherFx: 1, volumetrics: 1, reflRes: 0.5 },
  high: { renderScale: 1, shadows: 2, texRes: 1024, parallax: true, ao: false, bloom: true, godRays: true, ssr: true, motionBlur: true, cinematic: true, particles: 1, detail: 1, geometry: 2, aa: 'smaa', drawDistance: 1, anisotropy: 8, shaderDetail: 1, bumpMapping: true, tessellation: 1, csm: false, lensFx: true, lodBias: 1, podDetail: 1, weatherFx: 2, volumetrics: 2, reflRes: 0.75 },
  // Session 14: "Ultra" = every option at its maximum (only field of view and bloom strength stay as chosen)
  ultra: { renderScale: 1.5, shadows: 3, texRes: 2048, parallax: true, ao: true, bloom: true, godRays: true, ssr: true, motionBlur: true, cinematic: true, particles: 1.5, detail: 1.6, geometry: 3, aa: 'smaa', drawDistance: 1.5, anisotropy: 16, shaderDetail: 2, bumpMapping: true, tessellation: 2, csm: true, lensFx: true, lodBias: 2, podDetail: 3, weatherFx: 2, volumetrics: 2, reflRes: 1 },
};

export const defaultGfx = (): GfxSettings => ({ preset: 'high', backend: 'auto', batching: true, fov: 75, showFps: true, bloomStrength: 0.5, ...PRESETS.high });

export type PaintFinish = 0 | 1 | 2; // 0 = Klarlack, 1 = Chrom-Metallic, 2 = Carbon-Matt
export const LIVERY_PATTERNS = ['Klassik', 'Streifen', 'Flammen', 'Rennringe', 'Chevron', 'Rallye'] as const;
export const PAINT_FINISHES = ['Klarlack', 'Metallic', 'Matt'] as const;

export interface PodCustom {
  colors: [string, string, string];
  tuning: Record<StatKey, number>; // 0..5
  /** Optional hull livery pattern override (0..5); undefined uses the pod's factory pattern */
  pattern?: number;
  /** Hull clearcoat / metallic / satin-matte finish (0..2) */
  finish?: PaintFinish;
}

export interface RaceConfig {
  trackId: string;
  laps: number;
  opponents: number;
  difficulty: number;
  camera: number;
  timeOfDay?: TimeOfDay; // 'auto' = the world's own lighting
  weather?: WeatherKind;  // 'auto' = the world's own weather
}

export interface Profile {
  podId: string;
  custom: Record<string, PodCustom>;
  race: RaceConfig;
  gfx: GfxSettings;
  volume: number;
  best: Record<string, number>;
  keys?: KeyMap; // rebindable keyboard controls (keymap.ts)
  pad?: PadMap;  // rebindable gamepad controls
}

const KEY = 'podracer-profile-v2';
/** Saves of builds before the pod overhaul (10 pods). Imported when no v2 save exists and never written again – an older build that
 *  still reads this key keeps working (it would crash on pod ids it does not know). */
const KEY_V1 = 'podracer-profile-v1';
/** Largest rival field a race can have (slider in the race setup, clamp in Game.createPods). */
export const MAX_OPPONENTS = 10;

const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const hexColor = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

/** One pod's saved look + tuning, forced into the valid range (old, damaged or foreign saves). `base` = that pod's defaults. */
export function sanitizeCustom(c: Partial<PodCustom> | undefined | null, base: PodCustom): PodCustom {
  const colors = [0, 1, 2].map(i => hexColor(c?.colors?.[i], base.colors[i])) as [string, string, string];
  const tuning = Object.fromEntries(STAT_KEYS.map(k => [k, clampInt(c?.tuning?.[k], 0, 5, 0)])) as Record<StatKey, number>;
  const out: PodCustom = { colors, tuning };
  if (c?.pattern !== undefined && c.pattern !== null) out.pattern = clampInt(c.pattern, 0, LIVERY_PATTERNS.length - 1, 0); // absent = the pod's factory pattern
  if (c?.finish !== undefined && c.finish !== null) out.finish = clampInt(c.finish, 0, PAINT_FINISHES.length - 1, 0) as PaintFinish;
  return out;
}

export function defaultProfile(): Profile {
  const custom: Record<string, PodCustom> = {};
  for (const p of PODS) custom[p.id] = { colors: [...p.colors] as [string, string, string], tuning: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number> };
  return { podId: PODS[0].id, custom, race: { trackId: 'boonta', laps: 3, opponents: 7, difficulty: 1, camera: 0, timeOfDay: 'auto', weather: 'auto' }, gfx: defaultGfx(), volume: 0.6, best: {}, keys: defaultKeys(), pad: defaultPad() };
}

export function loadProfile(): Profile {
  const d = defaultProfile();
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(KEY_V1);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Profile>;
    const race = { ...d.race, ...(p.race || {}) };
    if (!TRACKS.some(t => t.id === race.trackId)) race.trackId = TRACKS[0].id; // safe fallback if saved track (e.g. deleted neon) no longer exists
    race.opponents = clampInt(race.opponents, 0, MAX_OPPONENTS, d.race.opponents);
    // every pod of THIS build gets a valid entry; entries of pods this build does not know are dropped
    const custom: Record<string, PodCustom> = {};
    for (const pod of PODS) custom[pod.id] = sanitizeCustom(p.custom?.[pod.id], d.custom[pod.id]);
    const podId = PODS.some(x => x.id === p.podId) ? p.podId! : d.podId; // the menus look the pod up without a fallback
    return { ...d, ...p, podId, custom, race, gfx: { ...d.gfx, ...(p.gfx || {}) }, best: { ...(p.best || {}) }, keys: normalizeKeys(p.keys), pad: normalizePad(p.pad) };
  } catch { return d; }
}
export function saveProfile(p: Profile) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export function effectiveStats(podId: string, custom?: PodCustom) {
  const pod = PODS.find(p => p.id === podId)!;
  const out = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) out[k] = Math.min(1.25, pod.stats[k] + (custom?.tuning[k] ?? 0) * 0.05);
  return out;
}
