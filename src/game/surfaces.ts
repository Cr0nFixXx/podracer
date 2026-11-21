// ===== Session 20: ground surfaces ("Untergründe") – what the track runs over, per passage =====
// Pure data (no three / DOM imports): used by the track builder, the physics, the node CI and the world builder.
//
// A track is no longer one uniform race deck. Every sample carries `Sample.surf` (index into SURFACES):
//   0            built race deck (start/finish, bridges, tunnels, ramps, zero-G tubes) – the look of earlier sessions
//   general      alternating natural passages per world (sand ↔ rock, snow ↔ ice, soil ↔ mud …)
//   open         the two wide open flats of every track: dunes, plateaus, lakes (the pod hovers directly over the liquid)
// `grip`, `vmax`, `heat` change the handling for player AND rivals (noticeable, but fair – see physics.ts).
import type { TexKind } from './data';

export type Liquid = 'water' | 'swamp' | 'methane' | 'mirror' | 'lava';
export interface SurfaceDef {
  id: string;
  /** HUD label */
  name: string;
  /** lateral grip factor (ice 0.75), top-speed factor (deep sand / mud / powder 0.92–0.95), engine-heat factor (lava) */
  grip: number; vmax: number; heat: number;
  /** level basin wider than the track (lake, frozen lake, rock plateau): road flattened, no camber, no rails – beacons instead */
  flat?: boolean;
  /** the surface is a liquid: no road mesh, the pod hovers over the lake */
  liquid?: Liquid;
  /** dune waves added to the road profile (metres) */
  dune?: number;
  /** photo texture set (src/assets/pbr) + procedural fallback kind, tile size in metres, default palette */
  tex?: { set: string; kind: TexKind; tile: number; pal: [string, string, string]; rough?: number; metal?: number; normal?: number; emissive?: string; wet?: number; env?: number };
  /** wake behind the pods: 'dust' (ground colour), 'spray' (white water), 'steam', 'embers', 'none' */
  wake: 'dust' | 'spray' | 'steam' | 'embers' | 'none';
  /** colour of dust / spray */
  wakeColor?: string;
}

const S = (d: SurfaceDef) => d;
export const SURFACES: SurfaceDef[] = [
  S({ id: 'road', name: 'Rennpiste', grip: 1, vmax: 1, heat: 1, wake: 'dust' }),
  // --- desert worlds ---
  S({ id: 'sand', name: 'Sand', grip: 0.96, vmax: 0.98, heat: 1, wake: 'dust', tex: { set: 'sand', kind: 'sand', tile: 9, pal: ['#b88a58', '#d8ae78', '#efcf9a'] } }),
  S({ id: 'dunes', name: 'Dünen · tiefer Sand', grip: 0.93, vmax: 0.94, heat: 1, dune: 1.5, wake: 'dust', tex: { set: 'sand', kind: 'sand', tile: 15, pal: ['#c49660', '#e2ba82', '#f6daa8'], normal: 1.5 } }),
  S({ id: 'rock', name: 'Fels', grip: 1, vmax: 1, heat: 1, wake: 'dust', tex: { set: 'rock', kind: 'rock', tile: 12, pal: ['#8a5a3a', '#b47e54', '#d8a878'], normal: 1.2 } }),
  S({ id: 'plateau', name: 'Felsplateau', grip: 1, vmax: 1, heat: 1, flat: true, wake: 'dust', tex: { set: 'cracked', kind: 'cracked', tile: 11, pal: ['#a07a5a', '#c8a480', '#e8cca8'], normal: 1.2 } }),
  // --- ice world ---
  S({ id: 'snow', name: 'Schnee', grip: 0.92, vmax: 0.97, heat: 0.9, wake: 'dust', wakeColor: '#eef4fa', tex: { set: 'snow', kind: 'snow', tile: 8, pal: ['#b4c6d8', '#e2ecf5', '#ffffff'], rough: 0.9 } }),
  S({ id: 'powder', name: 'Pulverschnee', grip: 0.9, vmax: 0.93, heat: 0.9, dune: 0.9, wake: 'dust', wakeColor: '#f4f8fc', tex: { set: 'powder', kind: 'snow', tile: 11, pal: ['#c0d0e0', '#eaf1f8', '#ffffff'], rough: 0.95, normal: 1.3 } }),
  S({ id: 'ice', name: 'Eis', grip: 0.75, vmax: 1, heat: 0.9, wake: 'none', tex: { set: 'ice', kind: 'ice', tile: 12, pal: ['#4f7da0', '#86b4d2', '#cfe8f8'], rough: 0.42, env: 1.5 } }),
  S({ id: 'icelake', name: 'Eissee', grip: 0.75, vmax: 1, heat: 0.9, flat: true, wake: 'none', tex: { set: 'ice', kind: 'ice', tile: 22, pal: ['#2c5878', '#5c8eb0', '#a8d0e8'], rough: 0.26, env: 1.6, normal: 0.7 } }),
  // --- volcano world ---
  S({ id: 'basalt', name: 'Basalt', grip: 1, vmax: 1, heat: 1.1, wake: 'dust', tex: { set: 'rock', kind: 'basalt', tile: 12, pal: ['#16110f', '#2c221e', '#463830'], normal: 1.3 } }),
  S({ id: 'crust', name: 'Lavakruste', grip: 0.97, vmax: 1, heat: 1.3, wake: 'embers', tex: { set: 'lava', kind: 'basalt', tile: 16, pal: ['#0c0807', '#1c1310', '#30221c'], emissive: '#ff5a14', normal: 1.2 } }),
  S({ id: 'lavalake', name: 'Lavasee', grip: 0.95, vmax: 1, heat: 1.6, flat: true, liquid: 'lava', wake: 'embers' }),
  S({ id: 'ash', name: 'Aschefeld', grip: 0.94, vmax: 0.95, heat: 1.1, wake: 'dust', wakeColor: '#4a4440', tex: { set: 'ash', kind: 'basalt', tile: 10, pal: ['#1c1816', '#34302c', '#4e4842'] } }),
  // --- jungle moon / Malastare ---
  S({ id: 'soil', name: 'Waldboden', grip: 0.98, vmax: 1, heat: 1, wake: 'dust', tex: { set: 'soil', kind: 'jungle', tile: 7, pal: ['#3a3220', '#5a4c30', '#7c6a44'] } }),
  S({ id: 'mud', name: 'Schlamm', grip: 0.9, vmax: 0.93, heat: 1, wake: 'spray', wakeColor: '#6a5a44', tex: { set: 'mud', kind: 'mud', tile: 8, pal: ['#33261a', '#4e3c28', '#6c563a'], wet: 0.6, rough: 0.8 } }),
  S({ id: 'swamp', name: 'Sumpf', grip: 0.94, vmax: 0.92, heat: 1, flat: true, liquid: 'swamp', wake: 'spray', wakeColor: '#9aa884' }),
  S({ id: 'gravel', name: 'Geröll', grip: 0.96, vmax: 0.97, heat: 1, wake: 'dust', tex: { set: 'gravel', kind: 'gravel', tile: 6, pal: ['#4a463a', '#6e6858', '#948c78'] } }),
  S({ id: 'methane', name: 'Methansee', grip: 0.95, vmax: 0.96, heat: 1.15, flat: true, liquid: 'methane', wake: 'spray', wakeColor: '#d8e08a' }),
  // --- Aquilaris ---
  S({ id: 'water', name: 'See', grip: 0.96, vmax: 1, heat: 0.9, flat: true, liquid: 'water', wake: 'spray', wakeColor: '#eef6fa' }),
  S({ id: 'beach', name: 'Strand', grip: 0.95, vmax: 0.96, heat: 1, wake: 'dust', tex: { set: 'sand', kind: 'sand', tile: 8, pal: ['#c8b898', '#e0d0b0', '#f0e4c8'] } }),
  S({ id: 'reef', name: 'Riff-Fels', grip: 1, vmax: 1, heat: 1, wake: 'spray', wakeColor: '#dfe8ea', tex: { set: 'reef', kind: 'rock', tile: 9, pal: ['#4e4a40', '#7a7464', '#a49c88'], wet: 0.4 } }),
  // --- Oovo IV ---
  S({ id: 'regolith', name: 'Mondstaub', grip: 0.93, vmax: 0.97, heat: 1, wake: 'dust', wakeColor: '#8a8c92', tex: { set: 'regolith', kind: 'gravel', tile: 12, pal: ['#4a4c52', '#6e7078', '#96989e'] } }),
  S({ id: 'deck', name: 'Stationsdeck', grip: 1, vmax: 1, heat: 1, wake: 'none', tex: { set: 'plate', kind: 'oovoRoad', tile: 10, pal: ['#4c5460', '#78828f', '#a8b2be'], metal: 0.35, rough: 0.62, env: 1.2 } }),
  // --- crystal canyons ---
  S({ id: 'crystal', name: 'Kristallfeld', grip: 0.98, vmax: 1, heat: 1, wake: 'none', tex: { set: '', kind: 'crystal', tile: 14, pal: ['#4a3478', '#7a5ab8', '#b494e8'], emissive: '#c87aff', rough: 0.5, env: 1.3 } }),
  S({ id: 'mirror', name: 'Spiegelsee', grip: 0.95, vmax: 1, heat: 0.95, flat: true, liquid: 'mirror', wake: 'spray', wakeColor: '#e8dcff' }),
];
export const SURF: Record<string, number> = Object.fromEntries(SURFACES.map((s, i) => [s.id, i]));
export const surfaceOf = (i: number | undefined): SurfaceDef => SURFACES[i ?? 0] ?? SURFACES[0];

/** Which surfaces a world uses: `general` passages alternate in this order, `open` = the two wide open flats, `cave` = cave floor. */
export interface ThemeSurfaces { general: string[]; open: [string, string]; cave?: string; pal?: Record<string, [string, string, string]> }
export const THEME_SURFACES: Record<string, ThemeSurfaces> = {
  desert: { general: ['sand', 'rock'], open: ['dunes', 'plateau'] },
  mesa: {
    general: ['rock', 'sand'], open: ['plateau', 'dunes'],
    pal: { sand: ['#a05a38', '#c87a50', '#e8a070'], dunes: ['#b46a40', '#d68a5a', '#f0ae80'], rock: ['#7a3a22', '#a8563a', '#d08058'], plateau: ['#96583c', '#be7e5c', '#e0a888'] },
  },
  ice: { general: ['snow', 'ice'], open: ['icelake', 'powder'], cave: 'ice' },
  lava: { general: ['basalt', 'crust'], open: ['lavalake', 'ash'], cave: 'basalt' },
  jungle: { general: ['soil', 'mud'], open: ['swamp', 'gravel'], cave: 'gravel', pal: { gravel: ['#3e4434', '#5e6650', '#868e74'] } },
  malastare: { general: ['road', 'gravel'], open: ['methane', 'swamp'], pal: { gravel: ['#4c483a', '#6c6652', '#908a70'] } },
  aquilaris: { general: ['road', 'beach', 'reef'], open: ['water', 'water'] },
  oovo: { general: ['regolith', 'deck', 'regolith'], open: ['regolith', 'deck'] }, // ~55 % moon surface, the rest station decks, tunnels and zero-G tubes
  crystal: { general: ['rock', 'crystal'], open: ['mirror', 'crystal'], cave: 'crystal', pal: { rock: ['#32243e', '#54426a', '#7a6894'] } },
};
export function surfacePalette(themeId: string, surf: SurfaceDef): [string, string, string] {
  return THEME_SURFACES[themeId]?.pal?.[surf.id] ?? surf.tex?.pal ?? ['#444444', '#777777', '#aaaaaa'];
}
