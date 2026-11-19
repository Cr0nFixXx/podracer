// ===== Session 11: time of day + weather → derived theme (sky, sun, fog, clouds, ambient) + runtime effect levels =====
// Everything downstream (sky dome, PMREM, lights, fog node, wet/snowy road shader, ambient particles) keeps reading a plain ThemeDef.
import type { ThemeDef } from './data';

export type TimeOfDay = 'auto' | 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherKind = 'auto' | 'clear' | 'rain' | 'storm' | 'snow' | 'dust' | 'fog' | 'front';
type Wx = Exclude<WeatherKind, 'auto' | 'front'>;
export const TIME_OPTIONS: [TimeOfDay, string][] = [['auto', 'Standard der Welt'], ['dawn', 'Morgendämmerung'], ['day', 'Mittag'], ['dusk', 'Abenddämmerung'], ['night', 'Nacht']];
export const WEATHER_OPTIONS: [WeatherKind, string][] = [['auto', 'Standard der Welt'], ['clear', 'Klar'], ['rain', 'Regen'], ['storm', 'Gewitter'], ['snow', 'Schneeböen'], ['dust', 'Staubsturm'], ['fog', 'Nebel / Smog'], ['front', 'Aufziehendes Gewitter']];

export interface EnvFx {
  weather: Wx; tod: TimeOfDay;
  rain: number;        // 0..1 lens droplets, rain streak density, rain audio, road spray
  lightning: number;   // 0..1 strike frequency (0 = none)
  gust: 'none' | 'snow' | 'dust' | 'mist'; gustColor: string;
  wind: number;        // 0..1 slant of rain/snow, gust speed, wind audio
  volFog: number;      // 0..1 strength of the drifting volumetric fog banks
  flare: number;       // 0..1 sun glare / lens flare strength
  grip: number;        // multiplier on lateral grip
  night: number;       // 0..1
  dark: number;        // 0..1 how dark the resolved sky is (pods switch their lights on above 0.45)
}
export interface EnvState { theme: ThemeDef; fx: EnvFx }

/** Default weather per world when the player keeps "Standard der Welt": [kind, intensity]. */
const AUTO: Record<string, [Wx, number]> = {
  desert: ['dust', 0.45], mesa: ['clear', 1], ice: ['snow', 0.6], city: ['rain', 0.7], lava: ['fog', 0.8],
  jungle: ['fog', 0.5], aquilaris: ['rain', 0.55], crystal: ['fog', 0.4], malastare: ['storm', 0.55],
};

// All colour blending happens in sRGB (perceptual) space: a linear-space lerp keeps 15 % of a bright day colour visibly grey at night.
const rgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const mixHex = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** Lerp towards a tinted grey of the SAME brightness (×mul) – overcast skies stay correct at noon and at night. */
function overcast(a: string, t: number, tint: [number, number, number], mul: number) {
  const A = rgb(a), l = (0.2126 * A[0] + 0.7152 * A[1] + 0.0722 * A[2]) * mul;
  return hex(A[0] + (l * tint[0] - A[0]) * t, A[1] + (l * tint[1] - A[1]) * t, A[2] + (l * tint[2] - A[2]) * t);
}

/** `from` is set for the weather front: the race starts in `from` (drizzle) and blends to the returned state (thunderstorm). */
export function resolveEnvironment(base: ThemeDef, todIn: TimeOfDay = 'auto', wxIn: WeatherKind = 'auto'): EnvState & { from?: EnvState } {
  if (wxIn === 'front' && base.terrain !== 'prison') return { ...resolveOne(base, todIn, 'storm'), from: resolveOne(base, todIn, 'rain', 0.4) };
  return resolveOne(base, todIn, wxIn === 'front' ? 'auto' : wxIn);
}

function resolveOne(base: ThemeDef, todIn: TimeOfDay, wxIn: Exclude<WeatherKind, 'front'>, kIn?: number): EnvState {
  const th: ThemeDef = { ...base };
  const space = base.terrain === 'prison'; // airless moon: no weather, no day cycle
  const tod: TimeOfDay = space ? 'auto' : todIn;
  let night = 0;
  if (tod === 'day') {
    th.sunElev = Math.max(base.sunElev, 50); th.sunColor = mixHex(base.sunColor, '#fff6e6', 0.6);
    th.skyTop = mixHex(base.skyTop, '#3f86d8', 0.5); th.skyHorizon = mixHex(base.skyHorizon, '#dcecf8', 0.45);
    th.fogColor = mixHex(base.fogColor, '#cfdde8', 0.35); th.sunIntensity = Math.min(4.4, base.sunIntensity * 1.12);
    th.hemiSky = mixHex(base.hemiSky, '#cfe2ff', 0.4);
  } else if (tod === 'dawn') {
    th.sunElev = 7; th.sunColor = '#ffc9a0';
    th.skyTop = mixHex(base.skyTop, '#5a7fc0', 0.55); th.skyHorizon = mixHex(base.skyHorizon, '#ffb38a', 0.7);
    th.fogColor = mixHex(base.fogColor, '#e8b8a0', 0.55); th.fogDensity = base.fogDensity * 1.25;
    th.sunIntensity = base.sunIntensity * 0.72; th.hemiSky = mixHex(base.hemiSky, '#c8b8d8', 0.5);
  } else if (tod === 'dusk') {
    th.sunElev = 4.5; th.sunAz = base.sunAz + 180; th.sunColor = '#ff9a5a';
    th.skyTop = mixHex(base.skyTop, '#2a2550', 0.7); th.skyHorizon = mixHex(base.skyHorizon, '#ff7a3a', 0.75);
    th.fogColor = mixHex(base.fogColor, '#b06a5a', 0.55); th.sunIntensity = base.sunIntensity * 0.6;
    th.hemiSky = mixHex(base.hemiSky, '#7a6aa0', 0.55); th.hemiGround = mixHex(base.hemiGround, '#2a2028', 0.5); th.exposure = base.exposure * 1.05;
  } else if (tod === 'night') {
    night = 1; th.sunElev = 34; th.sunAz = base.sunAz + 140; th.sunColor = '#a9c4ff'; th.sunIntensity = 1.15; // moonlight
    th.skyTop = mixHex(base.skyTop, '#01030c', 0.9); th.skyHorizon = mixHex(base.skyHorizon, '#0d1a36', 0.85);
    th.fogColor = mixHex(base.fogColor, '#0a1226', 0.85); th.hemiSky = mixHex(base.hemiSky, '#4a5f9a', 0.75);
    th.hemiGround = mixHex(base.hemiGround, '#0c1018', 0.8); th.exposure = base.exposure * 1.15; th.clouds = base.clouds * 0.6; th.stars = 1;
  }

  let wx: Wx = 'clear', k = 1, untouched = false;
  if (space) untouched = true;
  else if (wxIn === 'auto') { const a = AUTO[base.id]; if (a) { wx = a[0]; k = a[1]; } else untouched = true; }
  else wx = wxIn;
  if (kIn !== undefined) k = kIn;
  const fx: EnvFx = { weather: wx, tod, rain: 0, lightning: 0, gust: 'none', gustColor: '#ffffff', wind: 0.15, volFog: space ? 0 : 0.25, flare: 0.85, grip: 1, night, dark: 0 };
  const wetAmbient = th.ambient === 'rain' || th.ambient === 'snow';
  if (!untouched) switch (wx) {
    case 'clear':
      th.clouds = Math.min(th.clouds, 0.2); th.fogDensity *= 0.8; if (wetAmbient) th.ambient = 'dust'; fx.flare = 1; break;
    case 'rain':
      th.clouds = Math.max(th.clouds, 0.6 + 0.3 * k); th.fogDensity *= 1 + 0.45 * k; th.sunIntensity *= 1 - 0.4 * k;
      th.skyTop = overcast(th.skyTop, 0.6 * k, [0.9, 1, 1.12], 0.85); th.skyHorizon = overcast(th.skyHorizon, 0.55 * k, [0.94, 1, 1.06], 0.9);
      th.fogColor = overcast(th.fogColor, 0.5 * k, [0.92, 1, 1.08], 0.9); th.ambient = 'rain';
      fx.rain = 0.7 * k; fx.wind = 0.4 * k; fx.grip = 1 - 0.07 * k; fx.flare = 0.3; fx.volFog = 0.4; break;
    case 'storm':
      th.clouds = 1; th.fogDensity *= 1 + 0.8 * k; th.sunIntensity *= 1 - 0.62 * k;
      th.skyTop = overcast(th.skyTop, 0.8 * k, [0.85, 0.95, 1.15], 0.5); th.skyHorizon = overcast(th.skyHorizon, 0.7 * k, [0.9, 1, 1.1], 0.6);
      th.fogColor = overcast(th.fogColor, 0.65 * k, [0.9, 1, 1.1], 0.65); th.hemiSky = overcast(th.hemiSky, 0.5 * k, [0.9, 1, 1.12], 0.8); th.ambient = 'rain';
      fx.rain = 0.55 + 0.45 * k; fx.lightning = k; fx.gust = 'mist'; fx.gustColor = th.fogColor; fx.wind = 0.9 * k; fx.grip = 1 - 0.1 * k; fx.flare = 0; fx.volFog = 0.55; break;
    case 'snow':
      th.clouds = Math.max(th.clouds, 0.55 + 0.35 * k); th.fogDensity *= 1 + 0.9 * k; th.sunIntensity *= 1 - 0.4 * k;
      th.skyTop = overcast(th.skyTop, 0.6 * k, [0.95, 1, 1.08], 1.15); th.skyHorizon = overcast(th.skyHorizon, 0.6 * k, [0.97, 1, 1.04], 1.2);
      th.fogColor = overcast(th.fogColor, 0.6 * k, [0.96, 1, 1.05], 1.25); th.ambient = 'snow';
      fx.gust = 'snow'; fx.gustColor = mixHex(th.fogColor, '#ffffff', night ? 0.15 : 0.6); fx.wind = 0.75 * k; fx.grip = 1 - 0.1 * k; fx.flare = 0.2; fx.volFog = 0.5; break;
    case 'dust':
      th.clouds *= 1 - 0.4 * k; th.fogDensity *= 1 + 1.3 * k; th.sunIntensity *= 1 - 0.25 * k; th.sunColor = mixHex(th.sunColor, '#ffc890', 0.4 * k);
      th.fogColor = mixHex(th.fogColor, mixHex(base.palette.ground[1], th.fogColor, night ? 0.8 : 0.25), 0.6 * k);
      th.skyTop = mixHex(th.skyTop, th.fogColor, 0.45 * k); th.skyHorizon = mixHex(th.skyHorizon, th.fogColor, 0.6 * k); th.ambient = 'dust';
      fx.gust = 'dust'; fx.gustColor = mixHex(base.palette.ground[2], th.fogColor, night ? 0.75 : 0.3); fx.wind = 0.85 * k; fx.flare = 0.55; fx.volFog = 0.45 + 0.3 * k; break;
    case 'fog':
      th.clouds = Math.max(th.clouds, 0.5); th.fogDensity *= 1 + 0.7 * k; th.sunIntensity *= 1 - 0.3 * k;
      th.skyHorizon = mixHex(th.skyHorizon, th.fogColor, 0.5 * k); if (th.ambient === 'rain') th.ambient = 'dust';
      fx.volFog = 0.45 + 0.55 * k; fx.flare = 0.4; fx.wind = 0.1; break;
  }
  if (night) fx.flare *= 0.4;
  const lum = (h: string) => { const c = rgb(h); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  fx.dark = Math.max(0, Math.min(1, 1 - (lum(th.skyTop) + lum(th.skyHorizon)) * 0.5 / 0.4));
  return { theme: th, fx };
}
