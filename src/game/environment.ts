// ===== Environment: time of day + weather → derived theme, runtime effect levels and (Session 13) timelines =====
// - World realism: every world only offers weather that fits its climate (no snow on the desert planet, no rain on the volcano …).
// - Timelines: time of day and weather are two independent key-frame tracks. `EnvTimeline.eval(raceTime)` blends the four
//   neighbouring resolved states (tod a/b × weather c/d) into one `EnvSnap`; Game applies it through uniforms / light properties.
// - Compile-time features (rain shader on the road, lens droplets, bolt mesh, stars, lights, ambient particle type) are the UNION of
//   everything the timeline can reach, so nothing has to be recompiled while racing.
import type { ThemeDef } from './data';

export type TimeOfDay = 'auto' | 'dawn' | 'day' | 'dusk' | 'night' | 'sunset' | 'sunrise' | 'cycle';
export type WeatherKind = 'auto' | 'clear' | 'rain' | 'storm' | 'snow' | 'dust' | 'fog' | 'front' | 'clearing' | 'changing';
type Tod = 'auto' | 'dawn' | 'day' | 'dusk' | 'night';
type Wx = 'clear' | 'rain' | 'storm' | 'snow' | 'dust' | 'fog';
type WxKey = [Wx, number] | 'auto';
type RGB = [number, number, number];

export const TIME_OPTIONS: [TimeOfDay, string][] = [
  ['auto', 'Standard der Welt'], ['dawn', 'Morgendämmerung'], ['day', 'Mittag'], ['dusk', 'Abenddämmerung'], ['night', 'Nacht'],
  ['sunset', 'Sonnenuntergang (Abend → Nacht)'], ['sunrise', 'Sonnenaufgang (Nacht → Tag)'], ['cycle', 'Tag-Nacht-Zeitraffer'],
];
const WX_NAMES: Record<WeatherKind, string> = {
  auto: 'Standard der Welt', clear: 'Klar', rain: 'Regen', storm: 'Gewitter', snow: 'Schneeböen', dust: 'Staubsturm', fog: 'Nebel',
  front: 'Aufziehendes Unwetter', clearing: 'Aufklarend', changing: 'Wechselhaft',
};
export const WEATHER_OPTIONS: [WeatherKind, string][] = (Object.keys(WX_NAMES) as WeatherKind[]).map(k => [k, WX_NAMES[k]]);

/** Climate per world: which weather exists there, what "calm" and "severe" mean for dynamic weather, local names. */
interface Climate { allowed: Wx[]; calm: [Wx, number]; severe: [Wx, number]; auto: [Wx, number]; names?: Partial<Record<Wx, string>> }
const CLIMATE: Record<string, Climate> = {
  desert: { allowed: ['clear', 'dust'], calm: ['clear', 1], severe: ['dust', 1], auto: ['dust', 0.45], names: { dust: 'Sandsturm' } },
  mesa: { allowed: ['clear', 'dust'], calm: ['clear', 1], severe: ['dust', 0.9], auto: ['clear', 1], names: { dust: 'Sandsturm' } },
  ice: { allowed: ['clear', 'snow', 'fog'], calm: ['clear', 1], severe: ['snow', 1], auto: ['snow', 0.6], names: { fog: 'Eisnebel' } },
  lava: { allowed: ['clear', 'fog', 'dust'], calm: ['fog', 0.5], severe: ['dust', 1], auto: ['fog', 0.8], names: { fog: 'Smog', dust: 'Aschesturm mit Vulkanblitzen' } },
  jungle: { allowed: ['clear', 'rain', 'storm', 'fog'], calm: ['fog', 0.4], severe: ['storm', 1], auto: ['fog', 0.5] },
  aquilaris: { allowed: ['clear', 'rain', 'storm', 'fog'], calm: ['clear', 1], severe: ['storm', 1], auto: ['rain', 0.55], names: { fog: 'Seenebel' } },
  crystal: { allowed: ['clear', 'rain', 'storm', 'fog'], calm: ['fog', 0.4], severe: ['storm', 0.8], auto: ['fog', 0.4] },
  malastare: { allowed: ['clear', 'rain', 'storm', 'fog'], calm: ['rain', 0.3], severe: ['storm', 1], auto: ['storm', 0.55], names: { fog: 'Methannebel' } },
};
const DYNAMIC: WeatherKind[] = ['front', 'clearing', 'changing'];
/** Weather choices that make sense on this world (airless Oovo IV: none). */
export function weatherOptionsFor(themeId: string): [WeatherKind, string][] {
  const c = CLIMATE[themeId]; if (!c) return [['auto', WX_NAMES.auto]];
  return [['auto', WX_NAMES.auto], ...c.allowed.map(w => [w, c.names?.[w] ?? WX_NAMES[w]] as [WeatherKind, string]), ...DYNAMIC.map(w => [w, WX_NAMES[w]] as [WeatherKind, string])];
}
export function timeOptionsFor(themeId: string): [TimeOfDay, string][] { return CLIMATE[themeId] ? TIME_OPTIONS : [TIME_OPTIONS[0]]; }
/** Falls back to "Standard der Welt" when a stored choice does not exist on this world. */
export function sanitizeEnv(themeId: string, tod: TimeOfDay = 'auto', wx: WeatherKind = 'auto'): [TimeOfDay, WeatherKind] {
  const c = CLIMATE[themeId]; if (!c) return ['auto', 'auto'];
  const okW = wx === 'auto' || DYNAMIC.includes(wx) || c.allowed.includes(wx as Wx);
  return [TIME_OPTIONS.some(o => o[0] === tod) ? tod : 'auto', okW ? wx : 'auto'];
}
export function envLabel(themeId: string, tod: TimeOfDay, wx: WeatherKind) {
  const c = CLIMATE[themeId]; if (!c) return '';
  const tn = tod !== 'auto' ? TIME_OPTIONS.find(o => o[0] === tod)?.[1].replace(/ \(.*\)/, '') ?? '' : '';
  const w: Wx | WeatherKind = wx === 'auto' ? c.auto[0] : wx;
  const wn = (c.names as Record<string, string> | undefined)?.[w] ?? WX_NAMES[w as WeatherKind];
  const short: Partial<Record<WeatherKind, string>> = { front: 'Aufziehend', clearing: 'Aufklarend', changing: 'Wechselhaft' }; // HUD line stays short
  return [tn, short[wx] ?? wn.replace(/ mit .*/, '')].filter(Boolean).join(' · ');
}

export interface EnvFx {
  weather: Wx; tod: TimeOfDay;
  rain: number;        // 0..1 lens droplets, rain streak density, rain audio, road spray
  lightning: number;   // 0..1 strike frequency (0 = none)
  gust: 'none' | 'snow' | 'dust' | 'mist'; gustColor: string; gustAmt: number;
  wind: number;        // 0..1 slant of rain/snow, gust speed, wind audio
  volFog: number;      // 0..1 strength of the drifting volumetric fog banks
  flare: number;       // 0..1 sun glare / lens flare strength
  grip: number;        // multiplier on lateral grip
  heat: number;        // engine-heat factor (boost): heating × heat, cooling ÷ heat – climate × time of day × weather, 0.75 … 1.25
  night: number;       // 0..1
  dark: number;        // 0..1 how dark the sky is (pods switch their lights on above ~0.45)
  amb: number;         // 0..1 density of the ambient weather particles
}
export interface EnvState { theme: ThemeDef; fx: EnvFx }
/** What must exist at build time so the whole timeline can play without recompiling anything. */
export interface EnvBuild { rainRoad: boolean; maxRain: number; bolt: boolean; flare: boolean; lights: boolean; stars: boolean; wind: number; ambMax: number; envTheme: ThemeDef; dynamic: boolean }

// All colour blending happens in sRGB (perceptual) space: a linear-space lerp keeps 15 % of a bright day colour visibly grey at night.
const rgb = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const mixHex = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** Lerp towards a tinted grey of the SAME brightness (×mul) – overcast skies stay correct at noon and at night. */
function overcast(a: string, t: number, tint: RGB, mul: number) {
  const A = rgb(a), l = (0.2126 * A[0] + 0.7152 * A[1] + 0.0722 * A[2]) * mul;
  return hex(A[0] + (l * tint[0] - A[0]) * t, A[1] + (l * tint[1] - A[1]) * t, A[2] + (l * tint[2] - A[2]) * t);
}
const lumS = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const lin = (v: number) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const lumL = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

// 2026-11-22 – climate and weather change the boost (user decision: only the engine heat, ±10–25 %, for the Gegner too).
// factor = climate of the world × time of day × weather, clamped to 0.75 … 1.25. Heating is multiplied by it, cooling divided (physics.ts).
// The ground adds its own factor on top (surfaces.ts: lava lake 1.6, snow 0.9 …) – the climate values here are kept moderate for that reason.
const HEAT_CLIMATE: Record<string, number> = { ice: 0.94, desert: 1.06, mesa: 1.06, lava: 1.06, jungle: 1.03, malastare: 1.03, aquilaris: 0.97 };
const HEAT_HOT_DAY = new Set(['desert', 'mesa', 'lava', 'jungle', 'malastare']); // the sun adds 5 % there; every night takes 8 % off
const HEAT_WX: Record<Wx, number> = { clear: 1, rain: 0.9, storm: 0.84, snow: 0.84, fog: 0.96, dust: 1.18 };
/** `k` = strength of the weather 0..1, `dark` = how dark the sky is 0..1 (night, and partly a storm sky). */
export function engineHeat(themeId: string, wx: Wx, k: number, dark: number) {
  const day = HEAT_HOT_DAY.has(themeId) ? 1.05 : 1, tod = day + (0.92 - day) * dark;
  const w = 1 + ((wx === 'dust' && themeId === 'lava' ? 1.2 : HEAT_WX[wx]) - 1) * Math.max(0, Math.min(1, k)); // (lava: ash storm)
  return Math.max(0.75, Math.min(1.25, (HEAT_CLIMATE[themeId] ?? 1) * tod * w));
}

function resolveOne(base: ThemeDef, tod: Tod, key: WxKey): EnvState {
  const th: ThemeDef = { ...base };
  const clim = CLIMATE[base.id];
  let night = 0;
  // One consistent sun path per world: rises at az-40°, noon at the world's own azimuth, sets at az+70°; the moon stands opposite.
  if (tod === 'day') {
    th.sunElev = Math.max(base.sunElev, 50); th.sunColor = mixHex(base.sunColor, '#fff6e6', 0.6);
    th.skyTop = mixHex(base.skyTop, '#3f86d8', 0.5); th.skyHorizon = mixHex(base.skyHorizon, '#dcecf8', 0.45);
    th.fogColor = mixHex(base.fogColor, '#cfdde8', 0.35); th.sunIntensity = Math.min(4.4, base.sunIntensity * 1.12);
    th.hemiSky = mixHex(base.hemiSky, '#cfe2ff', 0.4);
  } else if (tod === 'dawn') {
    th.sunElev = 7; th.sunAz = base.sunAz - 40; th.sunColor = '#ffc9a0';
    th.skyTop = mixHex(base.skyTop, '#5a7fc0', 0.55); th.skyHorizon = mixHex(base.skyHorizon, '#ffb38a', 0.7);
    th.fogColor = mixHex(base.fogColor, '#e8b8a0', 0.55); th.fogDensity = base.fogDensity * 1.25;
    th.sunIntensity = base.sunIntensity * 0.72; th.hemiSky = mixHex(base.hemiSky, '#c8b8d8', 0.5);
  } else if (tod === 'dusk') {
    th.sunElev = 4.5; th.sunAz = base.sunAz + 70; th.sunColor = '#ff9a5a';
    th.skyTop = mixHex(base.skyTop, '#2a2550', 0.7); th.skyHorizon = mixHex(base.skyHorizon, '#ff7a3a', 0.75);
    th.fogColor = mixHex(base.fogColor, '#b06a5a', 0.55); th.sunIntensity = base.sunIntensity * 0.6;
    th.hemiSky = mixHex(base.hemiSky, '#7a6aa0', 0.55); th.hemiGround = mixHex(base.hemiGround, '#2a2028', 0.5); th.exposure = base.exposure * 1.05;
  } else if (tod === 'night') {
    night = 1; th.sunElev = 34; th.sunAz = base.sunAz - 110; th.sunColor = '#a9c4ff'; th.sunIntensity = 1.15; // moonlight
    th.skyTop = mixHex(base.skyTop, '#01030c', 0.9); th.skyHorizon = mixHex(base.skyHorizon, '#0d1a36', 0.85);
    th.fogColor = mixHex(base.fogColor, '#0a1226', 0.85); th.hemiSky = mixHex(base.hemiSky, '#4a5f9a', 0.75);
    th.hemiGround = mixHex(base.hemiGround, '#0c1018', 0.8); th.exposure = base.exposure * 1.15; th.clouds = base.clouds * 0.6; th.stars = 1;
  }

  const [wx, k]: [Wx, number] = !clim ? ['clear', 1] : key === 'auto' ? clim.auto : key;
  const fx: EnvFx = { weather: wx, tod, rain: 0, lightning: 0, gust: 'none', gustColor: '#ffffff', gustAmt: 0, wind: 0.15, volFog: clim ? 0.25 : 0, flare: 0.85, grip: 1, heat: 1, night, dark: 0, amb: 0.45 };
  const wetAmbient = th.ambient === 'rain' || th.ambient === 'snow';
  if (clim) switch (wx) {
    case 'clear':
      th.clouds = Math.min(th.clouds, 0.2); th.fogDensity *= 0.8; if (wetAmbient) th.ambient = 'dust'; fx.flare = 1; fx.amb = 0.3; break;
    case 'rain':
      th.clouds = Math.max(th.clouds, 0.6 + 0.3 * k); th.fogDensity *= 1 + 0.75 * k; th.sunIntensity *= 1 - 0.5 * k;
      th.skyTop = overcast(th.skyTop, 0.6 * k, [0.9, 1, 1.12], 0.85); th.skyHorizon = overcast(th.skyHorizon, 0.55 * k, [0.94, 1, 1.06], 0.9);
      th.fogColor = overcast(th.fogColor, 0.5 * k, [0.92, 1, 1.08], 0.9); th.ambient = 'rain';
      fx.rain = Math.min(1, 0.85 * k); fx.wind = 0.55 * k; fx.grip = 1 - 0.07 * k; fx.flare = 0.3 * (1.6 - k); fx.volFog = 0.5; fx.amb = fx.rain;
      fx.gust = 'mist'; fx.gustColor = th.fogColor; fx.gustAmt = 0.5 * k; break; // Session 16: rain squalls drift across the track
    case 'storm':
      th.clouds = 1; th.fogDensity *= 1 + 1.25 * k; th.sunIntensity *= 1 - 0.74 * k;
      th.skyTop = overcast(th.skyTop, 0.85 * k, [0.85, 0.95, 1.15], 0.42); th.skyHorizon = overcast(th.skyHorizon, 0.75 * k, [0.9, 1, 1.1], 0.55);
      th.fogColor = overcast(th.fogColor, 0.7 * k, [0.9, 1, 1.1], 0.6); th.hemiSky = overcast(th.hemiSky, 0.55 * k, [0.9, 1, 1.12], 0.75); th.ambient = 'rain';
      fx.rain = 0.55 + 0.45 * k; fx.lightning = k; fx.gust = 'mist'; fx.gustColor = th.fogColor; fx.gustAmt = k; fx.wind = Math.min(1, 1.05 * k); fx.grip = 1 - 0.1 * k; fx.flare = 0; fx.volFog = 0.72; fx.amb = fx.rain; break;
    case 'snow':
      th.clouds = Math.max(th.clouds, 0.55 + 0.35 * k); th.fogDensity *= 1 + 1.35 * k; th.sunIntensity *= 1 - 0.45 * k;
      th.skyTop = overcast(th.skyTop, 0.6 * k, [0.95, 1, 1.08], 1.15); th.skyHorizon = overcast(th.skyHorizon, 0.6 * k, [0.97, 1, 1.04], 1.2);
      th.fogColor = overcast(th.fogColor, 0.6 * k, [0.96, 1, 1.05], 1.25); th.ambient = 'snow';
      fx.gust = 'snow'; fx.gustColor = mixHex(th.fogColor, '#ffffff', night ? 0.15 : 0.6); fx.gustAmt = k; fx.wind = 0.92 * k; fx.grip = 1 - 0.1 * k; fx.flare = 0.2; fx.volFog = 0.65; fx.amb = 0.45 + 0.55 * k; break;
    case 'dust': {
      const ash = base.id === 'lava'; // volcano: dark ash fall with dry volcanic lightning instead of a sand storm
      th.clouds *= 1 - 0.4 * k; th.fogDensity *= 1 + 1.8 * k; th.sunIntensity *= 1 - 0.25 * k; th.sunColor = mixHex(th.sunColor, ash ? '#ff7a40' : '#ffc890', 0.4 * k);
      th.fogColor = mixHex(th.fogColor, ash ? '#2a1c18' : mixHex(base.palette.ground[1], th.fogColor, night ? 0.8 : 0.25), 0.6 * k);
      th.skyTop = mixHex(th.skyTop, th.fogColor, 0.45 * k); th.skyHorizon = mixHex(th.skyHorizon, th.fogColor, 0.6 * k); th.ambient = ash ? 'embers' : 'dust';
      fx.gust = 'dust'; fx.gustColor = ash ? '#3a302c' : mixHex(base.palette.ground[2], th.fogColor, night ? 0.75 : 0.3); fx.gustAmt = k; fx.wind = Math.min(1, 1.0 * k); fx.flare = 0.5; fx.volFog = 0.5 + 0.35 * k;
      fx.amb = 0.4 + 0.6 * k; if (ash) { fx.lightning = 0.6 * k; th.clouds = Math.max(th.clouds, 0.8); } break;
    }
    case 'fog':
      th.clouds = Math.max(th.clouds, 0.5); th.fogDensity *= 1 + 1.05 * k; th.sunIntensity *= 1 - 0.3 * k;
      th.skyHorizon = mixHex(th.skyHorizon, th.fogColor, 0.5 * k); if (th.ambient === 'rain') th.ambient = 'dust';
      fx.volFog = Math.min(1, 0.55 + 0.6 * k); fx.flare = 0.4; fx.wind = 0.1; break;
  }
  if (night) fx.flare *= 0.4;
  fx.dark = Math.max(0, Math.min(1, 1 - (lumS(rgb(th.skyTop)) + lumS(rgb(th.skyHorizon))) * 0.5 / 0.4));
  fx.heat = clim ? engineHeat(base.id, wx, k, fx.dark) : 1;
  return { theme: th, fx };
}

// ---------------- runtime snapshot + timeline ----------------
export interface EnvSnap {
  top: RGB; hor: RGB; sun: RGB; fog: RGB; hemiS: RGB; hemiG: RGB; dir: RGB; moon: number; // colours = sRGB triples
  clouds: number; dens: number; sunI: number; exp: number; stars: number; lit: number; lum: number;
  rain: number; lightning: number; wind: number; grip: number; heat: number; volFog: number; flare: number; dark: number; gustAmt: number; amb: number; wet: number; sev: number;
}
const NUM: (keyof EnvSnap)[] = ['moon', 'clouds', 'dens', 'sunI', 'exp', 'stars', 'lit', 'lum', 'rain', 'lightning', 'wind', 'grip', 'heat', 'volFog', 'flare', 'dark', 'gustAmt', 'amb', 'wet', 'sev'];
const COL: (keyof EnvSnap)[] = ['top', 'hor', 'sun', 'fog', 'hemiS', 'hemiG', 'dir'];
function snapOf(s: EnvState, ambient: string): EnvSnap {
  const t = s.theme, f = s.fx, el = t.sunElev * Math.PI / 180, az = t.sunAz * Math.PI / 180;
  const top = rgb(t.skyTop), hor = rgb(t.skyHorizon);
  return {
    top, hor, sun: rgb(t.sunColor), fog: rgb(t.fogColor), hemiS: rgb(t.hemiSky), hemiG: rgb(t.hemiGround),
    dir: [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)], moon: f.night,
    clouds: t.clouds, dens: t.fogDensity, sunI: t.sunIntensity, exp: t.exposure, stars: t.stars ?? 0,
    lit: Math.min(1, lumL(hor) * 2.4 + lumL(top) * 0.8), lum: lumL(hor) * 0.6 + lumL(top) * 0.4,
    rain: f.rain, lightning: f.lightning, wind: f.wind, grip: f.grip, heat: f.heat, volFog: f.volFog, flare: f.flare, dark: f.dark, gustAmt: f.gustAmt,
    amb: t.ambient === ambient ? f.amb : 0, wet: f.rain > 0.05 ? Math.min(1, 0.35 + f.rain) : 0, sev: Math.max(f.rain * 0.9, f.lightning, f.gustAmt * 0.8),
  };
}
const emptySnap = (): EnvSnap => ({ top: [0, 0, 0], hor: [0, 0, 0], sun: [0, 0, 0], fog: [0, 0, 0], hemiS: [0, 0, 0], hemiG: [0, 0, 0], dir: [0, 1, 0], moon: 0, clouds: 0, dens: 0, sunI: 0, exp: 1, stars: 0, lit: 1, lum: 1, rain: 0, lightning: 0, wind: 0, grip: 1, heat: 1, volFog: 0, flare: 0, dark: 0, gustAmt: 0, amb: 0, wet: 0, sev: 0 });
function blend(o: EnvSnap, a: EnvSnap, b: EnvSnap, s: number) {
  const O = o as unknown as Record<string, number | RGB>, A = a as unknown as Record<string, number | RGB>, B = b as unknown as Record<string, number | RGB>;
  for (const k of NUM) O[k] = (A[k] as number) + ((B[k] as number) - (A[k] as number)) * s;
  for (const k of COL) { const x = A[k] as RGB, y = B[k] as RGB, z = O[k] as RGB; z[0] = x[0] + (y[0] - x[0]) * s; z[1] = x[1] + (y[1] - x[1]) * s; z[2] = x[2] + (y[2] - x[2]) * s; }
}

interface Track<T> { keys: { t: number; v: T }[]; loop?: number }
function evalTrack<T>(tr: Track<T>, time: number): { a: T; b: T; s: number } {
  const K = tr.keys; if (K.length === 1) return { a: K[0].v, b: K[0].v, s: 0 };
  let t = Math.max(0, time); if (tr.loop) t %= tr.loop;
  let i = 0; while (i < K.length - 2 && t >= K[i + 1].t) i++;
  const x = Math.max(0, Math.min(1, (t - K[i].t) / Math.max(1e-3, K[i + 1].t - K[i].t)));
  return { a: K[i].v, b: K[i + 1].v, s: x * x * (3 - 2 * x) };
}
const TOD_TRACKS: Partial<Record<TimeOfDay, Track<Tod>>> = {
  sunset: { keys: [{ t: 0, v: 'dusk' }, { t: 15, v: 'dusk' }, { t: 95, v: 'night' }] },
  sunrise: { keys: [{ t: 0, v: 'night' }, { t: 15, v: 'night' }, { t: 85, v: 'dawn' }, { t: 150, v: 'day' }] },
  cycle: { loop: 360, keys: [{ t: 0, v: 'day' }, { t: 25, v: 'day' }, { t: 85, v: 'dusk' }, { t: 110, v: 'dusk' }, { t: 170, v: 'night' }, { t: 215, v: 'night' }, { t: 275, v: 'dawn' }, { t: 300, v: 'dawn' }, { t: 360, v: 'day' }] },
};
function wxTrack(c: Climate, wx: WeatherKind): Track<WxKey> {
  if (wx === 'front') return { keys: [{ t: 0, v: c.calm }, { t: 12, v: c.calm }, { t: 75, v: c.severe }] };
  if (wx === 'clearing') return { keys: [{ t: 0, v: c.severe }, { t: 15, v: c.severe }, { t: 85, v: c.calm }] };
  if (wx === 'changing') return { loop: 210, keys: [{ t: 0, v: c.calm }, { t: 20, v: c.calm }, { t: 75, v: c.severe }, { t: 125, v: c.severe }, { t: 185, v: c.calm }, { t: 210, v: c.calm }] };
  return { keys: [{ t: 0, v: wx === 'auto' ? 'auto' : [wx as Wx, 1] }] };
}

export class EnvTimeline {
  readonly cur = emptySnap();
  private cache = new Map<string, EnvSnap>(); private A = emptySnap(); private B = emptySnap();
  readonly dynamic: boolean;
  constructor(private base: ThemeDef, private tod: Track<Tod>, private wx: Track<WxKey>, private ambient: string) { this.dynamic = tod.keys.length > 1 || wx.keys.length > 1; }
  private state(t: Tod, w: WxKey) {
    const key = t + '|' + (w === 'auto' ? 'auto' : w.join(':')); let s = this.cache.get(key);
    if (!s) { s = snapOf(resolveOne(this.base, t, w), this.ambient); this.cache.set(key, s); }
    return s;
  }
  /** Blends tod (a→b) × weather (c→d). Sun ↔ moon hand-overs dip the light to zero before it returns from the new direction. */
  eval(time: number): EnvSnap {
    const T = evalTrack(this.tod, time), W = evalTrack(this.wx, time), o = this.cur;
    blend(this.A, this.state(T.a, W.a), this.state(T.a, W.b), W.s);
    if (T.a === T.b) { blend(o, this.A, this.A, 0); return o; }
    blend(this.B, this.state(T.b, W.a), this.state(T.b, W.b), W.s);
    blend(o, this.A, this.B, T.s);
    const a = this.A, b = this.B, cos = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] + a.dir[2] * b.dir[2];
    if (Math.abs(a.moon - b.moon) > 0.5 || cos < -0.2) {
      const first = T.s < 0.5, src = first ? a : b, f = Math.pow(first ? 1 - 2 * T.s : 2 * T.s - 1, 0.8);
      o.dir[0] = src.dir[0]; o.dir[1] = src.dir[1]; o.dir[2] = src.dir[2]; o.sun[0] = src.sun[0]; o.sun[1] = src.sun[1]; o.sun[2] = src.sun[2];
      o.sunI = src.sunI * f; o.flare = src.flare * f;
    } else { const l = Math.hypot(o.dir[0], o.dir[1], o.dir[2]) || 1; o.dir[0] /= l; o.dir[1] /= l; o.dir[2] /= l; }
    return o;
  }
}

export interface EnvResult extends EnvState { build: EnvBuild; timeline: EnvTimeline; label: string }
export function resolveEnvironment(base: ThemeDef, todIn: TimeOfDay = 'auto', wxIn: WeatherKind = 'auto'): EnvResult {
  const [tod, wx] = sanitizeEnv(base.id, todIn, wxIn);
  const clim = CLIMATE[base.id];
  const tTr: Track<Tod> = TOD_TRACKS[tod] ?? { keys: [{ t: 0, v: tod as Tod }] };
  const wTr: Track<WxKey> = clim ? wxTrack(clim, wx) : { keys: [{ t: 0, v: 'auto' }] };
  // union over everything the two tracks can reach
  const states: EnvState[] = [];
  for (const a of tTr.keys) for (const b of wTr.keys) states.push(resolveOne(base, a.v, b.v));
  const sev = (s: EnvState) => Math.max(s.fx.rain * 0.9, s.fx.lightning, s.fx.gustAmt * 0.8);
  const worst = states.reduce((m, s) => sev(s) > sev(m) ? s : m, states[0]);
  const bright = states.reduce((m, s) => lumL(rgb(s.theme.skyHorizon)) > lumL(rgb(m.theme.skyHorizon)) ? s : m, states[0]);
  const ambient = worst.theme.ambient;
  const max = (f: (s: EnvState) => number) => states.reduce((m, s) => Math.max(m, f(s)), 0);
  const timeline = new EnvTimeline(base, tTr, wTr, ambient);
  const build: EnvBuild = {
    rainRoad: max(s => s.fx.rain) > 0.05, maxRain: max(s => s.fx.rain), bolt: max(s => s.fx.lightning) > 0, flare: max(s => s.fx.flare) > 0.02,
    lights: max(s => s.fx.dark) > 0.4, stars: max(s => s.theme.stars ?? 0) > 0, wind: max(s => s.fx.wind),
    ambMax: Math.max(0.05, max(s => s.theme.ambient === ambient ? s.fx.amb : 0)), envTheme: bright.theme, dynamic: timeline.dynamic,
  };
  const start = states[0], s0 = timeline.eval(0);
  const theme: ThemeDef = { ...start.theme, ambient, clouds: Math.max(start.theme.clouds, timeline.dynamic ? 0.02 : 0) };
  if (build.stars) theme.stars = start.theme.stars ?? 0; else delete theme.stars;
  const fx: EnvFx = { ...start.fx, tod, gust: worst.fx.gust, gustColor: worst.fx.gustColor, gustAmt: s0.gustAmt, amb: s0.amb };
  return { theme, fx, build, timeline, label: envLabel(base.id, tod, wx) };
}
