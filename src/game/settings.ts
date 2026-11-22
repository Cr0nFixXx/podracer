import { DIFFICULTIES, PODS, STAT_KEYS, TRACKS, type StatKey } from './data';

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

/** Style-Teile of a pod: one choice per slot, 0 = Werk (factory look). Look only – they never change how the pod drives. */
export interface PodKit { fins: number; intake: number; nozzle: number; canopy: number }
export const KIT_SLOTS: { key: keyof PodKit; label: string; choices: readonly string[] }[] = [
  { key: 'fins', label: 'Finnen', choices: ['Werk', 'Haifinne', 'Doppel-Leitwerk', 'Pfeilflügel'] },
  { key: 'intake', label: 'Einlass', choices: ['Werk', 'Gitter', 'Langer Dorn', 'Irisblende'] },
  { key: 'nozzle', label: 'Düse', choices: ['Werk', 'Lang', 'Schubvektor-Paddel', 'Zackenkrone'] },
  { key: 'canopy', label: 'Kanzel', choices: ['Klar', 'Rauch', 'Bernstein', 'Spiegel'] },
];

export interface PodCustom {
  colors: [string, string, string];
  tuning: Record<StatKey, number>; // 0..5
  /** Optional hull livery pattern override (0..5); undefined uses the pod's factory pattern */
  pattern?: number;
  /** Hull clearcoat / metallic / satin-matte finish (0..2) */
  finish?: PaintFinish;
  /** Style-Teile; undefined = everything Werk */
  kit?: PodKit;
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

/** Camera modes (the `C` key cycles through them; `RaceConfig.camera` is an index into this list). */
export const CAMERA_NAMES = ['Verfolger', 'Verfolger (fern)', 'Cockpit', 'Motorhaube', 'TV-Kamera', 'Kino-Orbit'];
/** Most laps the race setup offers. */
export const MAX_LAPS = 7;
const TIMES_OF_DAY: readonly TimeOfDay[] = ['auto', 'dawn', 'day', 'dusk', 'night', 'sunset', 'sunrise', 'cycle'];
const WEATHERS: readonly WeatherKind[] = ['auto', 'clear', 'rain', 'storm', 'snow', 'dust', 'fog', 'front', 'clearing', 'changing'];

const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const clampNum = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const oneOf = <T,>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const hexColor = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

/** One pod's saved look + tuning, forced into the valid range (old, damaged or foreign saves). `base` = that pod's defaults. */
export function sanitizeCustom(c: Partial<PodCustom> | undefined | null, base: PodCustom): PodCustom {
  const colors = [0, 1, 2].map(i => hexColor(c?.colors?.[i], base.colors[i])) as [string, string, string];
  const tuning = Object.fromEntries(STAT_KEYS.map(k => [k, clampInt(c?.tuning?.[k], 0, 5, 0)])) as Record<StatKey, number>;
  const out: PodCustom = { colors, tuning };
  if (c?.pattern !== undefined && c.pattern !== null) out.pattern = clampInt(c.pattern, 0, LIVERY_PATTERNS.length - 1, 0); // absent = the pod's factory pattern
  if (c?.finish !== undefined && c.finish !== null) out.finish = clampInt(c.finish, 0, PAINT_FINISHES.length - 1, 0) as PaintFinish;
  if (c?.kit && typeof c.kit === 'object') out.kit = Object.fromEntries(KIT_SLOTS.map(s => [s.key, clampInt((c.kit as Partial<PodKit>)[s.key], 0, s.choices.length - 1, 0)])) as unknown as PodKit;
  return out;
}

/** A saved race setup forced into what the race setup screen can produce (a save edited by hand must not crash the game:
 *  `difficulty` and `camera` are list indices). `d` = the defaults. An unknown track falls back to the first one. */
export function sanitizeRace(r: Partial<RaceConfig> | undefined | null, d: RaceConfig): RaceConfig {
  return {
    trackId: TRACKS.some(t => t.id === r?.trackId) ? r!.trackId! : TRACKS[0].id, // (e.g. a deleted track)
    laps: clampInt(r?.laps, 1, MAX_LAPS, d.laps),
    opponents: clampInt(r?.opponents, 0, MAX_OPPONENTS, d.opponents),
    difficulty: clampInt(r?.difficulty, 0, DIFFICULTIES.length - 1, d.difficulty),
    camera: clampInt(r?.camera, 0, CAMERA_NAMES.length - 1, d.camera),
    timeOfDay: oneOf(r?.timeOfDay, TIMES_OF_DAY, d.timeOfDay ?? 'auto'),
    weather: oneOf(r?.weather, WEATHERS, d.weather ?? 'auto'),
  };
}
/** Saved graphics settings forced into the ranges of the settings screen; a value of the wrong kind becomes the default `d`.
 *  Fields this build does not know are dropped. */
export function sanitizeGfx(g: Partial<GfxSettings> | undefined | null, d: GfxSettings): GfxSettings {
  const o = (g && typeof g === 'object' ? g : {}) as Partial<GfxSettings>;
  return {
    preset: oneOf(o.preset, ['low', 'medium', 'high', 'ultra', 'custom'] as const, d.preset),
    renderScale: clampNum(o.renderScale, 0.5, 1.5, d.renderScale),
    shadows: clampInt(o.shadows, 0, 3, d.shadows),
    texRes: oneOf(o.texRes, [512, 1024, 2048], d.texRes),
    parallax: bool(o.parallax, d.parallax), ao: bool(o.ao, d.ao), bloom: bool(o.bloom, d.bloom),
    bloomStrength: clampNum(o.bloomStrength, 0, 1.5, d.bloomStrength),
    godRays: bool(o.godRays, d.godRays), ssr: bool(o.ssr, d.ssr),
    reflRes: clampNum(o.reflRes, 0.35, 1, d.reflRes ?? 0.75),
    lodBias: clampNum(o.lodBias, 0.5, 2, d.lodBias ?? 1),
    podDetail: clampNum(o.podDetail, 0.5, 3, d.podDetail ?? 1),
    weatherFx: clampInt(o.weatherFx, 0, 2, d.weatherFx ?? 2),
    volumetrics: clampInt(o.volumetrics, 0, 2, d.volumetrics ?? 2),
    lensFx: bool(o.lensFx, d.lensFx ?? true), csm: bool(o.csm, d.csm ?? false),
    motionBlur: bool(o.motionBlur, d.motionBlur), cinematic: bool(o.cinematic, d.cinematic),
    particles: clampNum(o.particles, 0.2, 1.5, d.particles),
    detail: clampNum(o.detail, 0.2, 1.6, d.detail),
    geometry: clampInt(o.geometry, 1, 3, d.geometry),
    aa: oneOf(o.aa, ['none', 'fxaa', 'smaa'] as const, d.aa),
    anisotropy: oneOf(o.anisotropy, [1, 4, 8, 16], d.anisotropy),
    shaderDetail: clampInt(o.shaderDetail, 0, 2, d.shaderDetail),
    bumpMapping: bool(o.bumpMapping, d.bumpMapping),
    tessellation: clampInt(o.tessellation, 0, 2, d.tessellation),
    fov: clampNum(o.fov, 60, 100, d.fov),
    drawDistance: clampNum(o.drawDistance, 0.5, 1.5, d.drawDistance),
    showFps: bool(o.showFps, d.showFps),
    backend: oneOf(o.backend, ['auto', 'webgl'] as const, d.backend ?? 'auto'),
    batching: bool(o.batching, d.batching ?? true),
  };
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
    const race = sanitizeRace({ ...d.race, ...(p.race || {}) }, d.race);
    // every pod of THIS build gets a valid entry; entries of pods this build does not know are dropped
    const custom: Record<string, PodCustom> = {};
    for (const pod of PODS) custom[pod.id] = sanitizeCustom(p.custom?.[pod.id], d.custom[pod.id]);
    const podId = PODS.some(x => x.id === p.podId) ? p.podId! : d.podId; // the menus look the pod up without a fallback
    const best: Record<string, number> = {}; // best times: seconds per track id
    if (p.best && typeof p.best === 'object') for (const [k, v] of Object.entries(p.best)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) best[k] = v;
    return { podId, custom, race, gfx: sanitizeGfx(p.gfx, d.gfx), volume: clampNum(p.volume, 0, 1, d.volume), best, keys: normalizeKeys(p.keys), pad: normalizePad(p.pad) };
  } catch { return d; }
}
export function saveProfile(p: Profile) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export function effectiveStats(podId: string, custom?: PodCustom) {
  const pod = PODS.find(p => p.id === podId)!;
  const out = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) out[k] = Math.min(1.25, pod.stats[k] + (custom?.tuning[k] ?? 0) * 0.05);
  return out;
}
