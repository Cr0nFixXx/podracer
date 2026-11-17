import { PODS, STAT_KEYS, type StatKey } from './data';

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

export const PRESETS: Record<'low' | 'medium' | 'high' | 'ultra', Omit<GfxSettings, 'preset' | 'fov' | 'showFps' | 'bloomStrength' | 'anisotropy' | 'shaderDetail' | 'bumpMapping' | 'tessellation'>> = {
  low: { renderScale: 0.75, shadows: 0, texRes: 512, parallax: false, ao: false, bloom: false, godRays: false, ssr: false, motionBlur: false, cinematic: false, particles: 0.35, detail: 0.4, geometry: 1, aa: 'none', drawDistance: 0.6 },
  medium: { renderScale: 1, shadows: 1, texRes: 1024, parallax: false, ao: false, bloom: true, godRays: true, ssr: false, motionBlur: true, cinematic: true, particles: 0.6, detail: 0.7, geometry: 2, aa: 'fxaa', drawDistance: 0.8 },
  high: { renderScale: 1, shadows: 2, texRes: 1024, parallax: true, ao: false, bloom: true, godRays: true, ssr: false, motionBlur: true, cinematic: true, particles: 1, detail: 1, geometry: 2, aa: 'smaa', drawDistance: 1 },
  ultra: { renderScale: 1, shadows: 3, texRes: 2048, parallax: true, ao: true, bloom: true, godRays: true, ssr: true, motionBlur: true, cinematic: true, particles: 1.4, detail: 1.4, geometry: 3, aa: 'smaa', drawDistance: 1.3 },
};

export const defaultGfx = (): GfxSettings => ({ preset: 'high', backend: 'auto', batching: true, fov: 75, showFps: true, bloomStrength: 0.5, anisotropy: 8, shaderDetail: 1, bumpMapping: true, tessellation: 1, ...PRESETS.high });

export interface PodCustom {
  colors: [string, string, string];
  tuning: Record<StatKey, number>; // 0..5
}

export interface RaceConfig {
  trackId: string;
  laps: number;
  opponents: number;
  difficulty: number;
  camera: number;
}

export interface Profile {
  podId: string;
  custom: Record<string, PodCustom>;
  race: RaceConfig;
  gfx: GfxSettings;
  volume: number;
  best: Record<string, number>;
}

const KEY = 'podracer-profile-v1';

export function defaultProfile(): Profile {
  const custom: Record<string, PodCustom> = {};
  for (const p of PODS) custom[p.id] = { colors: [...p.colors] as [string, string, string], tuning: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number> };
  return { podId: PODS[0].id, custom, race: { trackId: 'boonta', laps: 3, opponents: 7, difficulty: 1, camera: 0 }, gfx: defaultGfx(), volume: 0.6, best: {} };
}

export function loadProfile(): Profile {
  const d = defaultProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Profile>;
    return { ...d, ...p, custom: { ...d.custom, ...(p.custom || {}) }, race: { ...d.race, ...(p.race || {}) }, gfx: { ...d.gfx, ...(p.gfx || {}) }, best: { ...(p.best || {}) } };
  } catch { return d; }
}
export function saveProfile(p: Profile) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export function effectiveStats(podId: string, custom?: PodCustom) {
  const pod = PODS.find(p => p.id === podId)!;
  const out = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) out[k] = Math.min(1.25, pod.stats[k] + (custom?.tuning[k] ?? 0) * 0.05);
  return out;
}
