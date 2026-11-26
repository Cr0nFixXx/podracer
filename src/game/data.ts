// ===== Podracer / Pilot / Track / Theme definitions =====

export type StatKey = 'topSpeed' | 'accel' | 'turn' | 'traction' | 'airbrake' | 'cooling' | 'repair';
export const STAT_KEYS: StatKey[] = ['topSpeed', 'accel', 'turn', 'traction', 'airbrake', 'cooling', 'repair'];
export const STAT_LABELS: Record<StatKey, string> = {
  topSpeed: 'Höchstgeschw.',
  accel: 'Beschleunigung',
  turn: 'Wendigkeit',
  traction: 'Traktion',
  airbrake: 'Luftbremse',
  cooling: 'Kühlung',
  repair: 'Reparatur',
};

/** The first eight styles are variants of the round turbine builder (podParts.ts); the Session 20 pods have builders of their own
 *  (podEngines.ts): `rotor` open propfan in a guard hoop · `hoop` slim core in a ring wing · `slab` flat plate · `cage` open truss. */
export type EngineStyle = 'turbine' | 'long' | 'split' | 'heavy' | 'needle' | 'quad' | 'ring' | 'blade' | 'rotor' | 'hoop' | 'slab' | 'cage';

export interface PodDef {
  id: string;
  name: string;
  pilotId: string;
  desc: string;
  stats: Record<StatKey, number>; // 0..1
  colors: [string, string, string]; // primary, secondary, glow
}

/** head / helmet variant of the pilot figure (podCockpits.ts → pilot) */
export type PilotHead = 'goggles' | 'snout' | 'crest' | 'aero' | 'dome' | 'maul' | 'veil' | 'horn' | 'optic';

export interface PilotDef {
  id: string;
  name: string;
  species: string;
  head: PilotHead;
  /** skin tone of the pilot figure (heads that show skin: goggles, snout, crest, maul, veil, horn – not the closed helmets aero, dome, optic) */
  skin: string;
  skill: number; // 0..1
  aggression: number; // 0..1
  color: string;
}

export const PILOTS: PilotDef[] = [
  { id: 'kai', name: 'Kai Varrin', species: 'Mensch', head: 'goggles', skin: '#b98c68', skill: 0.9, aggression: 0.4, color: '#4aa3ff' },
  { id: 'zeb', name: 'Zebulox Vrak', species: 'Dugkin', head: 'snout', skin: '#b5673a', skill: 0.95, aggression: 0.95, color: '#ff9a2e' },
  { id: 'gas', name: 'Gasvaro Ten', species: 'Xantori', head: 'crest', skin: '#7fb6a8', skill: 0.8, aggression: 0.3, color: '#3fe0a0' },
  { id: 'bom', name: 'Bomquad Rii', species: 'Lurbani', head: 'dome', skin: '#8fa3b5', skill: 0.55, aggression: 0.2, color: '#e3e04a' },
  { id: 'mav', name: 'Mavik Hollo', species: 'Gurrani', head: 'aero', skin: '#a4b06a', skill: 0.75, aggression: 0.6, color: '#ff4a6e' },
  { id: 'rat', name: 'Rattis Tyr', species: 'Aleeni', head: 'crest', skin: '#a99bc0', skill: 0.7, aggression: 0.8, color: '#b46bff' },
  { id: 'ald', name: 'Aldo Beerak', species: 'Kraveen', head: 'aero', skin: '#c9a15a', skill: 0.85, aggression: 0.7, color: '#7fd3ff' },
  { id: 'tee', name: 'Teemo Pagali', species: 'Vexi', head: 'dome', skin: '#b8795a', skill: 0.65, aggression: 0.5, color: '#ff7b2e' },
  { id: 'ela', name: 'Elana Mak', species: 'Mensch', head: 'goggles', skin: '#b98c68', skill: 0.78, aggression: 0.35, color: '#ff5ad1' },
  { id: 'ody', name: 'Odo Mandrel', species: 'Erriton', head: 'aero', skin: '#8f9a8a', skill: 0.6, aggression: 0.55, color: '#9fff5a' },
  { id: 'cle', name: 'Clegg Halden', species: 'Mensch', head: 'goggles', skin: '#b98c68', skill: 0.68, aggression: 0.45, color: '#ffd27a' },
  // Session 20: the pilots of the four new pods
  { id: 'bra', name: 'Brask Tarn', species: 'Ursk', head: 'maul', skin: '#7b5a3c', skill: 0.72, aggression: 0.65, color: '#c8743a' },
  { id: 'sir', name: 'Sira Lyss', species: 'Nerai', head: 'veil', skin: '#8fc9cf', skill: 0.88, aggression: 0.3, color: '#7af0e0' },
  { id: 'hav', name: 'Havo Dorn', species: 'Brakkan', head: 'horn', skin: '#8a7361', skill: 0.8, aggression: 0.85, color: '#d1a43a' },
  { id: 'ixo', name: 'Ixo Quill', species: 'Synth', head: 'optic', skin: '#9aa3ad', skill: 0.82, aggression: 0.5, color: '#8f7bd6' },
];

export const PODS: PodDef[] = [
  {
    id: 'aurora', name: 'Aurora XR-7', pilotId: 'kai', desc: 'Ausgewogener Allrounder mit großen Turbinen-Triebwerken.',
    stats: { topSpeed: 0.7, accel: 0.75, turn: 0.75, traction: 0.65, airbrake: 0.7, cooling: 0.7, repair: 0.6 },
    colors: ['#2d6fd6', '#d9dde3', '#4ad2ff'],
  },
  {
    id: 'brute', name: 'Vrak Splitter-X', pilotId: 'zeb', desc: 'Riesige Split-X Triebwerke – brutale Geschwindigkeit.',
    stats: { topSpeed: 0.95, accel: 0.8, turn: 0.45, traction: 0.55, airbrake: 0.5, cooling: 0.55, repair: 0.5 },
    colors: ['#d07a1c', '#3a3a3a', '#ffb347'],
  },
  {
    id: 'gasvaro', name: 'Tenroc 6-Fach', pilotId: 'gas', desc: 'Sechs Triebwerke, extreme Beschleunigung, empfindlich.',
    stats: { topSpeed: 0.8, accel: 0.95, turn: 0.6, traction: 0.6, airbrake: 0.65, cooling: 0.45, repair: 0.45 },
    colors: ['#27a36d', '#e8d27a', '#5affb4'],
  },
  {
    id: 'bomquad', name: 'Quadra Lumber', pilotId: 'bom', desc: 'Vier schlanke Triebwerke im Quadrat, gekoppelt über ein X aus Energieblitzen. Wild, aber schnell.',
    stats: { topSpeed: 0.85, accel: 0.55, turn: 0.4, traction: 0.4, airbrake: 0.45, cooling: 0.8, repair: 0.7 },
    colors: ['#c9b23a', '#5d4a2c', '#fff07a'],
  },
  {
    id: 'mavik', name: 'Hollo Needle', pilotId: 'mav', desc: 'Schlanke Nadel-Triebwerke für maximale Wendigkeit.',
    stats: { topSpeed: 0.6, accel: 0.7, turn: 0.95, traction: 0.85, airbrake: 0.85, cooling: 0.65, repair: 0.6 },
    colors: ['#c2263f', '#efe9e1', '#ff5a7a'],
  },
  {
    id: 'rattis', name: 'Tyr Vespa', pilotId: 'rat', desc: 'Klein, leicht und agil – hohe Traktion.',
    stats: { topSpeed: 0.65, accel: 0.85, turn: 0.85, traction: 0.9, airbrake: 0.75, cooling: 0.6, repair: 0.55 },
    colors: ['#8a3ad6', '#20212a', '#c48bff'],
  },
  {
    id: 'aldo', name: 'Beerak Fireflare', pilotId: 'ald', desc: 'Hochleistungskühlung – Dauer-Boost-Spezialist.',
    stats: { topSpeed: 0.75, accel: 0.65, turn: 0.6, traction: 0.7, airbrake: 0.6, cooling: 0.95, repair: 0.75 },
    colors: ['#2a8fb5', '#c7c2b8', '#7fe8ff'],
  },
  {
    id: 'teemo', name: 'Pagali Ironclad', pilotId: 'tee', desc: 'Schwer gepanzert – steckt Kollisionen weg.',
    stats: { topSpeed: 0.7, accel: 0.5, turn: 0.5, traction: 0.75, airbrake: 0.55, cooling: 0.7, repair: 0.95 },
    colors: ['#7a4a2a', '#b5b5b5', '#ff8c3a'],
  },
  {
    id: 'elana', name: 'Mak Starling', pilotId: 'ela', desc: 'Elegant und präzise – perfekte Luftbremse.',
    stats: { topSpeed: 0.72, accel: 0.72, turn: 0.8, traction: 0.75, airbrake: 0.95, cooling: 0.6, repair: 0.6 },
    colors: ['#e6e6ee', '#d63aa8', '#ff7ae0'],
  },
  {
    id: 'odo', name: 'Mandrel Ram', pilotId: 'ody', desc: 'Rammbock mit Turbinen – aggressive Rennen.',
    stats: { topSpeed: 0.78, accel: 0.6, turn: 0.55, traction: 0.6, airbrake: 0.5, cooling: 0.75, repair: 0.85 },
    colors: ['#4c7a1e', '#2b2b2b', '#b4ff5a'],
  },
  // ---- Session 20: four new pods (keep the ten above first – the old CI grid and saved profiles count on their order) ----
  {
    id: 'cyclone', name: 'Tarn Cyclone', pilotId: 'bra', desc: 'Zwei offene Riesenrotoren in Schutzringen – saugt sich förmlich an der Piste fest.',
    stats: { topSpeed: 0.64, accel: 0.88, turn: 0.7, traction: 0.92, airbrake: 0.72, cooling: 0.62, repair: 0.6 },
    colors: ['#b08d57', '#3b4032', '#ffc94a'],
  },
  {
    id: 'halo', name: 'Lyss Halo-9', pilotId: 'sir', desc: 'Schlanke Kerntriebwerke in großen Ringflügeln – tanzt durch jede Kurve und steht auf der Bremse.',
    stats: { topSpeed: 0.68, accel: 0.68, turn: 0.9, traction: 0.74, airbrake: 0.9, cooling: 0.66, repair: 0.55 },
    colors: ['#cfeee6', '#1c3558', '#9bfff0'],
  },
  {
    id: 'manta', name: 'Dorn Manta', pilotId: 'hav', desc: 'Flache Triebwerksplatten mit Schlitzdüsen – auf der Geraden kaum zu halten, in Kurven träge.',
    stats: { topSpeed: 0.97, accel: 0.72, turn: 0.42, traction: 0.58, airbrake: 0.55, cooling: 0.6, repair: 0.55 },
    colors: ['#26282e', '#c99a2e', '#ff5f2e'],
  },
  {
    id: 'volt', name: 'Quill Voltspire', pilotId: 'ixo', desc: 'Reaktor-Triebwerke mit vergittertem Plasmafenster und drei Energiebögen – reißt aus dem Stand davon, verträgt aber wenig.',
    stats: { topSpeed: 0.74, accel: 0.92, turn: 0.66, traction: 0.62, airbrake: 0.6, cooling: 0.9, repair: 0.4 },
    colors: ['#34407a', '#c7ccd4', '#b79bff'],
  },
];

// ===================== THEMES =====================
export type TexKind = 'sand' | 'rock' | 'road' | 'snow' | 'ice' | 'jungle' | 'basalt' | 'metal' | 'crystal' | 'lavaRoad' | 'cityRoad' | 'mud' | 'oovoRoad' | 'oovoWall' | 'gravel' | 'cracked';
export type DecorKind = 'rocks' | 'spires' | 'mesas' | 'cacti' | 'iceSpikes' | 'pines' | 'trees' | 'ferns' | 'lavaRocks' | 'crystals' | 'wrecks' | 'flyers' | 'pylons' | 'asteroids' | 'cells' | 'satellites' | 'antennas' | 'debris';

export interface ThemeDef {
  id: string;
  name: string;
  skyTop: string;
  skyHorizon: string;
  sunColor: string;
  sunElev: number; // degrees
  sunAz: number; // degrees
  clouds: number;
  fogColor: string;
  fogDensity: number;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  exposure: number;
  road: TexKind;
  wall: TexKind;
  ground: TexKind;
  palette: { road: string[]; wall: string[]; ground: string[] };
  decor: DecorKind[];
  ambient: 'dust' | 'snow' | 'embers' | 'spores' | 'rain' | 'sparkle';
  terrain: 'dunes' | 'mountains' | 'lava' | 'jungle' | 'canyon' | 'prison' | 'ocean';
  emissiveGround?: string;
  barrierColor: string;
  stars?: number; // 0..1 night starfield (set by environment.ts)
}

/** Worlds whose wall is BUILT – metal plates with hazard marks (Aquilaris), station plating with lights (Oovo IV) – not rock.
 *  That texture is right for wall sheets, tunnel vaults and piers and wrong for everything that grew: boulders, rock rows,
 *  arches, stones, steep land. Those take the world's own rock set (`rockTex` in `world.ts`). */
export const hasBuiltWall = (t: ThemeDef) => t.wall === 'metal' || t.wall === 'oovoWall';
export const THEMES: Record<string, ThemeDef> = {
  desert: {
    id: 'desert', name: 'Tatooine', skyTop: '#3d7fd0', skyHorizon: '#f2d6a8', sunColor: '#fff1d0', sunElev: 28, sunAz: 40, clouds: 0.25,
    fogColor: '#e8c9a0', fogDensity: 0.00055, sunIntensity: 4.2, hemiSky: '#bcd5ff', hemiGround: '#b08050', exposure: 0.95,
    road: 'road', wall: 'rock', ground: 'sand',
    palette: { road: ['#8a6a48', '#b08d64', '#cfae80'], wall: ['#7a4a2c', '#b8743f', '#e0a86a'], ground: ['#b88a58', '#d8ae78', '#efcf9a'] },
    decor: ['rocks', 'spires', 'mesas', 'wrecks', 'flyers'], ambient: 'dust', terrain: 'canyon', barrierColor: '#ffb040',
  },
  ice: {
    id: 'ice', name: 'Ando Prime', skyTop: '#5a7fa8', skyHorizon: '#dde8f2', sunColor: '#e8f2ff', sunElev: 14, sunAz: 120, clouds: 0.55,
    fogColor: '#c8d8e8', fogDensity: 0.0008, sunIntensity: 3.0, hemiSky: '#cfe2ff', hemiGround: '#8aa0b8', exposure: 1.0,
    road: 'ice', wall: 'snow', ground: 'snow',
    palette: { road: ['#6f93b4', '#9fc2de', '#d8ecff'], wall: ['#7d8fa3', '#c5d4e3', '#ffffff'], ground: ['#a8bccf', '#dce7f2', '#ffffff'] },
    decor: ['iceSpikes', 'pines', 'rocks', 'pylons'], ambient: 'snow', terrain: 'mountains', barrierColor: '#5ad8ff',
  },
  lava: {
    id: 'lava', name: 'Vulkanwelt', skyTop: '#1a0a08', skyHorizon: '#a03a14', sunColor: '#ff9a50', sunElev: 10, sunAz: 300, clouds: 0.7,
    fogColor: '#4a1a0e', fogDensity: 0.0009, sunIntensity: 2.4, hemiSky: '#ff7a40', hemiGround: '#3a0a04', exposure: 1.15,
    road: 'lavaRoad', wall: 'basalt', ground: 'basalt',
    palette: { road: ['#1e1814', '#3a2c24', '#5a4434'], wall: ['#141010', '#2e2420', '#4a3a30'], ground: ['#100c0a', '#241a16', '#3a2a22'] },
    decor: ['lavaRocks', 'spires', 'wrecks'], ambient: 'embers', terrain: 'lava', emissiveGround: '#ff4a10', barrierColor: '#ff6a1a',
  },
  jungle: {
    id: 'jungle', name: 'Dschungelmond', skyTop: '#4a8ab8', skyHorizon: '#d8eac8', sunColor: '#fff4c8', sunElev: 35, sunAz: 80, clouds: 0.6,
    fogColor: '#a8c8a0', fogDensity: 0.0009, sunIntensity: 3.6, hemiSky: '#c8ffd0', hemiGround: '#3a5a20', exposure: 0.95,
    road: 'mud', wall: 'rock', ground: 'jungle',
    palette: { road: ['#4a3a24', '#6a5434', '#8a7048'], wall: ['#3a4a30', '#5a6a48', '#8a9070'], ground: ['#1e3a12', '#3a6020', '#5a8a30'] },
    decor: ['trees', 'rocks', 'wrecks'], ambient: 'spores', terrain: 'jungle', barrierColor: '#9aff4a',
  },
  aquilaris: {
    id: 'aquilaris', name: 'Wasserwelt', skyTop: '#4aa0d8', skyHorizon: '#d8f0ff', sunColor: '#fff6e0', sunElev: 32, sunAz: 60, clouds: 0.45,
    fogColor: '#b8d8ec', fogDensity: 0.0005, sunIntensity: 3.6, hemiSky: '#c8e8ff', hemiGround: '#3a6a5a', exposure: 1.0,
    road: 'cityRoad', wall: 'metal', ground: 'sand',
    palette: { road: ['#2a3848', '#3a4a5c', '#5a6a7c'], wall: ['#3a4a5a', '#5a6a7a', '#8aa0b0'], ground: ['#c8b898', '#e0d0b0', '#f0e4c8'] },
    decor: ['rocks', 'wrecks', 'flyers', 'pylons'], ambient: 'rain', terrain: 'ocean', barrierColor: '#3ad8ff',
  },
  oovo: {
    // Session 20: the sun stands higher (8° → 19°) and the fill light is a little stronger – the track now runs over a real moon surface
    id: 'oovo', name: 'Oovo IV', skyTop: '#02030a', skyHorizon: '#1a2440', sunColor: '#e8e0d0', sunElev: 19, sunAz: 200, clouds: 0.0,
    fogColor: '#0a0e18', fogDensity: 0.00035, sunIntensity: 2.6, hemiSky: '#3a4468', hemiGround: '#14161c', exposure: 1.05,
    road: 'oovoRoad', wall: 'oovoWall', ground: 'oovoWall',
    palette: { road: ['#2a2e38', '#3a404c', '#5a6270'], wall: ['#1a1e28', '#2e3444', '#4a5468'], ground: ['#10141c', '#1a1e28', '#2a3040'] },
    decor: ['asteroids', 'cells', 'satellites', 'antennas', 'debris'], ambient: 'sparkle', terrain: 'prison', barrierColor: '#3ad8ff',
  },
  crystal: {
    id: 'crystal', name: 'Kristallschluchten', skyTop: '#1a1a4a', skyHorizon: '#c88ad8', sunColor: '#e0d0ff', sunElev: 18, sunAz: 200, clouds: 0.3,
    fogColor: '#6a4a8a', fogDensity: 0.0008, sunIntensity: 3.0, hemiSky: '#b0a0ff', hemiGround: '#40205a', exposure: 1.05,
    road: 'road', wall: 'crystal', ground: 'rock',
    palette: { road: ['#4a3a5a', '#6a5a7a', '#8a7a9a'], wall: ['#3a2a5a', '#6a4a9a', '#a07ad8'], ground: ['#2a1a3a', '#4a3a5a', '#6a5a7a'] },
    decor: ['crystals', 'spires', 'rocks'], ambient: 'sparkle', terrain: 'mountains', barrierColor: '#c87aff',
  },
  malastare: {
    // 2026-11-23 (user: "Setting etwas düsterer"): about 30 % less light than before – sun 3.4 → 2.4, sky, fill lights and haze 15 %
    // lower in sRGB (= 30 % less light). The exposure stays: it must not make up for it. (Before: #4f6b5a, #e2cf96, #a8a880, #d8e8c0, #4a4a2a.)
    id: 'malastare', name: 'Malastare', skyTop: '#435b4d', skyHorizon: '#c0b080', sunColor: '#fff0c8', sunElev: 22, sunAz: 150, clouds: 0.55,
    fogColor: '#8f8f6d', fogDensity: 0.0008, sunIntensity: 2.4, hemiSky: '#b8c5a3', hemiGround: '#3f3f24', exposure: 1.0,
    road: 'cityRoad', wall: 'rock', ground: 'jungle', // Session 16: panelled metal race deck with light lines (methane refinery world)
    palette: { road: ['#4a4436', '#665e4a', '#8a8064'], wall: ['#3e3a2e', '#625a46', '#8e8466'], ground: ['#3a4422', '#566230', '#7a8240'] },
    decor: ['rocks', 'spires', 'wrecks', 'pylons'], ambient: 'spores', terrain: 'jungle', barrierColor: '#c8ff3a',
  },
  mesa: {
    id: 'mesa', name: 'Rote Tafelberge', skyTop: '#2a6ab0', skyHorizon: '#ffc890', sunColor: '#ffd8a0', sunElev: 12, sunAz: 270, clouds: 0.35,
    fogColor: '#e0a070', fogDensity: 0.0006, sunIntensity: 3.8, hemiSky: '#b0c8ff', hemiGround: '#a05030', exposure: 1.0,
    road: 'road', wall: 'rock', ground: 'sand',
    palette: { road: ['#7a4a30', '#a06040', '#c08058'], wall: ['#6a2a18', '#a8482a', '#d87a4a'], ground: ['#a05a38', '#c87a50', '#e8a070'] },
    decor: ['mesas', 'spires', 'rocks', 'cacti', 'flyers'], ambient: 'dust', terrain: 'canyon', barrierColor: '#ffa040',
  },
};

// ===================== TRACKS =====================
// Control points: [x (100m), z (100m), height m, width m]
export type CP = [number, number, number, number];

export interface TrackDef {
  id: string;
  name: string;
  planet: string;
  theme: string;
  type: 'circuit' | 'sprint';
  desc: string;
  pts: CP[];
  canyons: [number, number][]; // fractions with tall rock walls
  /** jump ramps: where (0 … 1 of the lap; the builder takes the straightest stretch near it), length and height of the ramp (m),
   *  length of the gap behind it (m, 0 = none). 2026-11-25: 2–2.6 m high instead of 4–6 m – see `rampProfile` (trackBuilder.ts). */
  ramps: { at: number; len: number; h: number; gap: number }[];
  shortcuts: number[]; // control point index hints
  obstacles: [number, number, number][]; // from, to, count
  arches: number;
  difficulty: number; // 1..5
  hazards?: [number, number, number][]; // from, to, count – periodic geysers / vents
  setPieces?: { rotor?: number[]; gate?: number[]; arch?: number[]; boulder?: number[]; bridge?: number[]; icefall?: number[] }; // track fractions
}

export const TRACKS: TrackDef[] = [
  {
    // Crossover at (8.2, 6.2): seg 6→7 dives south→north through canyon underpass (-12 m), seg 11→12 soars east→west over viaduct bridge (+18 m)
    id: 'boonta', name: 'Boonta-Kessel', planet: 'Tatooine', theme: 'desert', type: 'circuit', difficulty: 2, setPieces: { arch: [0.57], gate: [0.76], rotor: [0.92] },
    desc: 'Der Klassiker: enge Schluchten, eine Überführungsbrücke über den eigenen Canyon-Tunnel und die Todesschanze.',
    pts: [[0,0,0,36],[5,0,2,32],[9,-1,8,26],[12,1,12,24],[12,4,6,24],[9.5,3.2,-6,26],[7.6,4.2,-12,26],[8.4,8.2,-10,26],[11.5,10,4,28],[14.2,9.2,12,26],[13.5,6.6,18,26],[5.2,6.0,18,26],[3.5,9.5,8,28],[6,12.5,0,36],[2,12,4,26],[-1.5,10,8,24],[-2,6,6,28],[0,4.2,2,26],[-1,2,0,32]],
    canyons: [[0.14, 0.26], [0.3, 0.42], [0.72, 0.84]],
    ramps: [{ at: 0.22, len: 40, h: 2.6, gap: 46 }, { at: 0.68, len: 30, h: 2, gap: 0 }],
    shortcuts: [3],
    obstacles: [[0.44, 0.52, 9], [0.86, 0.95, 6]],
    arches: 9,
  },
  {
    // Crossover at (8.5, 6.2): seg 6→7 climbs over high glacier bridge (+18 m), seg 12→13 dives underneath (-14 m)
    id: 'frost', name: 'Frostspalt-Ring', planet: 'Ando Prime', theme: 'ice', type: 'circuit', difficulty: 3, setPieces: { icefall: [0.47], rotor: [0.65], gate: [0.82] },
    desc: 'Rutschige Eispisten, hohe Gletschertunnel, verzweigte Eishöhlen und eine Brücke quer über die untere Klamm.',
    pts: [[0,0,0,34],[6,0,-4,30],[10,-2,-10,26],[13.5,-1,-14,24],[15,2.5,-6,24],[13.5,5.5,8,26],[11,6.2,18,26],[5.8,6.2,18,26],[4.5,9.5,10,28],[7.2,12,2,28],[10.5,11,-6,26],[9.2,8.4,-14,26],[8.2,3.6,-14,26],[5.2,2.8,-8,26],[2.8,5.2,-2,26],[0,7,2,28],[-2.8,5.5,4,28],[-3,2.5,2,30],[-1.5,0.8,0,34]],
    canyons: [[0.1, 0.22], [0.45, 0.56], [0.74, 0.84]],
    ramps: [{ at: 0.24, len: 36, h: 2.3, gap: 40 }, { at: 0.88, len: 30, h: 2, gap: 0 }],
    shortcuts: [9],
    obstacles: [[0.5, 0.6, 10], [0.12, 0.2, 6]],
    arches: 6,
  },
  {
    // Crossover at (9.5, 7.2): seg 6→7 runs low through basalt gorge (-14 m), seg 12→13 crosses overhead on basalt viaduct (+18 m)
    id: 'magma', name: 'Magma-Inferno', planet: 'Vulkanwelt', theme: 'lava', type: 'circuit', difficulty: 4, setPieces: { arch: [0.42], boulder: [0.78] },
    desc: 'Über Lavaseen, Basaltbrücken und durch ein verzweigtes Vulkan-Höhlensystem mit fünf Kammern.',
    pts: [[0,0,0,32],[5,1,4,30],[8.5,-0.5,10,26],[12,-1.5,14,24],[14.5,1,8,26],[13.5,4,-4,24],[10,4.8,-14,24],[9.2,9.6,-14,24],[12.5,12,-4,26],[15.5,11,8,28],[15,8,16,26],[12,7.2,18,26],[6.8,7.2,18,26],[4.8,10.5,10,26],[2,12,6,28],[-0.5,9.5,6,24],[1,6.5,4,24],[-1.5,4.5,2,26],[-2,2,0,30]],
    canyons: [[0.08, 0.2], [0.34, 0.46], [0.72, 0.82]],
    ramps: [{ at: 0.22, len: 36, h: 2.6, gap: 44 }, { at: 0.5, len: 36, h: 2.6, gap: 44 }, { at: 0.9, len: 30, h: 2, gap: 0 }],
    shortcuts: [3],
    obstacles: [[0.44, 0.52, 9], [0.82, 0.9, 5]],
    arches: 7,
    hazards: [[0.1, 0.9, 8]],
  },
  {
    // Sprint with red-rock overpass loop at (19, 11.5): seg 7→8 dives low (-44 m), seg 11→12 loops high overhead (-12 m)
    id: 'dunepass', name: 'Dünenpass-Sprint', planet: 'Tatooine', theme: 'mesa', type: 'sprint', difficulty: 2, setPieces: { boulder: [0.18], arch: [0.46], gate: [0.8] },
    desc: 'Von den Hochplateaus hinab durch rote Tafelberge – mit großer Canyon-Schleife über dem eigenen Felstunnel.',
    pts: [[0,0,0,36],[5,0,-2,34],[9,2,-8,28],[11,5,-14,26],[10,8.5,-22,26],[12.5,11.5,-30,28],[16,11.5,-42,26],[21.8,11.5,-44,26],[24.5,9.2,-34,26],[23.5,6.2,-22,26],[19.5,6.5,-12,26],[18.8,9,-12,26],[18.8,14.2,-14,26],[21.5,17,-28,28],[25.5,18.5,-42,30],[29.5,17.5,-50,34],[33.5,18.5,-54,36]],
    canyons: [[0.1, 0.22], [0.36, 0.46], [0.76, 0.86]],
    ramps: [{ at: 0.26, len: 40, h: 2.6, gap: 46 }, { at: 0.88, len: 40, h: 2.6, gap: 48 }],
    shortcuts: [3],
    obstacles: [[0.3, 0.38, 8], [0.74, 0.82, 8]],
    arches: 10,
  },
  {
    // Sprint with jungle river loop crossover at (18.5, 9.5): seg 7→8 runs through river tunnel (-12 m), seg 11→12 flies over viaduct (+20 m)
    id: 'jungle', name: 'Dschungelfluss-Sprint', planet: 'Dschungelmond', theme: 'jungle', type: 'sprint', difficulty: 3, setPieces: { boulder: [0.2], arch: [0.44] },
    desc: 'Durch dichten Urwald, verzweigte Karsthöhlen und in einer weiten Schleife hoch über die eigene Flussschlucht.',
    pts: [[0,0,0,32],[4,1,2,28],[6,4,6,24],[4,7,10,22],[6,10,8,24],[10,10,4,30],[12.8,7.8,-4,26],[15.8,9.2,-12,26],[21.2,9.8,-12,26],[23.8,7.5,-2,26],[22.8,4.6,10,26],[19,4.8,18,26],[18.5,7.2,20,26],[18.4,12.4,20,26],[21,15.2,10,28],[25,15.5,4,30],[28.5,13.8,0,28],[31.5,15.5,0,32]],
    canyons: [[0.14, 0.28], [0.42, 0.54]],
    ramps: [{ at: 0.32, len: 36, h: 2.6, gap: 44 }, { at: 0.86, len: 40, h: 2.6, gap: 48 }],
    shortcuts: [2],
    obstacles: [[0.36, 0.44, 10], [0.78, 0.85, 8]],
    arches: 6,
  },
  {
    // Ocean figure-8 skyway crossover + two long deep underwater window tubes!
    id: 'aquilaris', name: 'Aquilaris-Küstenlauf', planet: 'Aquilaris', theme: 'aquilaris', type: 'circuit', difficulty: 3, setPieces: { rotor: [0.14], bridge: [0.5], gate: [0.84] },
    desc: 'Rennplattformen über dem Ozean: hohe Panorama-Unterwassertunnel, eine Skyway-Überführung und futuristische Flutschleusen.',
    pts: [[0,0,0,36],[6,0,2,32],[11,1,4,28],[15.5,3,6,26],[18.5,6.5,4,26],[19,10.5,2,26],[16.5,13.5,8,28],[12.5,13.5,18,26],[11.5,9.5,20,26],[10.5,5.5,18,26],[7.5,3.5,8,26],[5,5.5,-4,26],[6.5,9.2,-12,26],[14.2,9.6,-12,26],[15.5,15,-4,28],[10.5,17,0,28],[5.5,16,2,30],[1.8,12.5,4,26],[0.2,8,2,28],[-0.4,4,0,34]],
    canyons: [[0.18,0.28],[0.78,0.88]],
    ramps: [{ at: 0.26, len: 36, h: 2.6, gap: 44 }, { at: 0.88, len: 36, h: 2.3, gap: 40 }],
    shortcuts: [3],
    obstacles: [[0.08,0.16,6],[0.76,0.84,6]],
    arches: 6,
  },
  {
    // Prison orbital crossover at (13, 12): seg 8→9 low (-12 m), seg 14→15 high (+20 m)
    id: 'oovo', name: 'Oovo-IV-Gefängnis', planet: 'Oovo IV', theme: 'oovo', type: 'circuit', difficulty: 4, setPieces: { gate: [0.38, 0.72] },
    desc: 'Hochsicherheits-Gefängnismond: sich kreuzende Orbitaldecks, Druckschleusen und Schwerelosigkeitsröhren über dem Abgrund.',
    pts: [[0,0,0,34],[6,0,0,30],[10,2,-5,26],[12,5,-5,24],[10,7.5,0,24],[8,10,4,26],[9.5,12.2,-10,26],[16.2,12.2,-12,26],[19.5,10,-8,26],[21.5,12.5,4,26],[20,16,12,26],[15.5,16.5,18,26],[13.2,14.8,20,26],[13,9.2,20,26],[15.5,6.8,10,28],[19,7.5,4,26],[22,10.5,0,26],[21,19,2,26],[17,22,-4,28],[13,25,0,26],[9,24,4,28],[6,20,2,28],[3,17,2,26],[0.5,13.5,4,26],[-1,9.5,0,30],[-1,5,0,32]],
    canyons: [[0.1,0.2],[0.64,0.74],[0.82,0.92]],
    ramps: [{ at: 0.6, len: 36, h: 2.6, gap: 44 }, { at: 0.88, len: 36, h: 2.6, gap: 44 }],
    shortcuts: [20],
    obstacles: [[0.05,0.12,6],[0.74,0.82,6]],
    arches: 8,
  },
  {
    // Crystal canyon sprint with soaring crystal-bridge loop at (13.5, 12.5)
    id: 'crystal', name: 'Kristallschlucht-Sprint', planet: 'Kristallschluchten', theme: 'crystal', type: 'sprint', difficulty: 5, setPieces: { rotor: [0.24], gate: [0.4], arch: [0.84] },
    desc: 'Verzweigte Kristallkavernen, Energieschleusen und eine schwindelerregende Brückenschleife über der eigenen Schlucht.',
    pts: [[0,0,0,30],[4,-1,4,28],[7,1,10,24],[7.5,5,14,22],[5,7.5,12,24],[5.5,11,6,24],[9.5,12.5,-4,26],[17,12.5,-6,26],[19.5,10.2,4,24],[18.5,7.2,16,24],[14.2,7.5,24,24],[13.5,10,26,24],[13.5,15.5,26,24],[16.5,18,16,26],[20.5,17,8,28],[23.5,14.5,4,26],[26.5,15.5,0,32]],
    canyons: [[0.05, 0.16], [0.34, 0.44], [0.8, 0.9]],
    ramps: [{ at: 0.18, len: 36, h: 2.6, gap: 44 }, { at: 0.88, len: 34, h: 2.3, gap: 40 }],
    shortcuts: [3],
    obstacles: [[0.22, 0.3, 8], [0.76, 0.84, 7]],
    arches: 8,
  },
  {
    id: 'malastare', name: 'Malastare-100-Sprint', planet: 'Malastare', theme: 'malastare', type: 'sprint', difficulty: 4, setPieces: { rotor: [0.4], gate: [0.72] },
    desc: 'Dugs Heimatwelt: Methan-Dunst, Raffinerie-Schleusen, Dampfquellen und drei Schanzen über Sumpfschluchten.',
    pts: [[0,0,0,34],[5,1,2,30],[9,3,6,24],[10,7,10,22],[8,10,6,26],[10,13,2,30],[14,13,-2,24],[17,11,-6,22],[20,12,-4,28],[22,15,0,24],[20,18,4,22],[23,21,6,26],[27,20,2,30],[30,22,0,34]],
    canyons: [[0.1, 0.24], [0.46, 0.58], [0.74, 0.86]],
    ramps: [{ at: 0.3, len: 36, h: 2.6, gap: 44 }, { at: 0.64, len: 30, h: 2.3, gap: 0 }, { at: 0.9, len: 36, h: 2.6, gap: 46 }],
    shortcuts: [6],
    obstacles: [[0.36, 0.44, 10], [0.66, 0.74, 8]],
    arches: 7,
    hazards: [[0.08, 0.95, 10]],
  },
  {
    // Suzuka-style Grand Prix figure-8 crossover at (10.5, 8.5)!
    id: 'mosespa', name: 'Mos-Espa-Arena', planet: 'Tatooine', theme: 'desert', type: 'circuit', difficulty: 3, setPieces: { gate: [0.18], rotor: [0.72], bridge: [0.86] },
    desc: 'Achterbahn-Rundkurs vor Mos Espa: lange Startgerade, Wüstenschleuse und eine Grand-Prix-Brücke über dem Unterführungstunnel.',
    pts: [[0,0,0,40],[7,0,0,38],[12.5,-1,4,30],[15.5,1.5,8,26],[15,5,14,26],[12.5,7.2,18,26],[8.2,9.8,18,26],[6.2,13,12,26],[8.5,16,6,28],[13,16.5,2,28],[16.5,14.5,-4,26],[15.5,11.2,-10,26],[12.2,9.4,-14,26],[8.2,7,-14,26],[5,5.5,-6,26],[2.5,8.5,0,28],[0,10.5,2,30],[-2.2,7.2,4,26],[-1.2,3,2,32]],
    canyons: [[0.14, 0.24], [0.46, 0.56], [0.8, 0.9]],
    ramps: [{ at: 0.46, len: 40, h: 2.6, gap: 46 }, { at: 0.82, len: 30, h: 2, gap: 0 }],
    shortcuts: [8],
    obstacles: [[0.5, 0.58, 8], [0.9, 0.97, 6]],
    arches: 8,
  },
  {
    id: 'howler', name: 'Heulerschlucht-Sprint', planet: 'Ando Prime', theme: 'ice', type: 'sprint', difficulty: 4, setPieces: { icefall: [0.2, 0.55], gate: [0.78] },
    desc: '80 Höhenmeter bergab durch vereiste Klammen, hohe Gletschertunnel und eine verzweigte Eishöhle.',
    pts: [[0,0,40,34],[5,1,34,30],[8,4,28,26],[7,8,22,24],[9,11,14,26],[13,12,8,24],[16,10,2,24],[19,11,-4,26],[21,14,-10,24],[19,17,-16,24],[21,20,-22,26],[25,21,-28,28],[29,19,-34,30],[33,20,-40,34]],
    canyons: [[0.05, 0.3], [0.38, 0.6], [0.68, 0.9]],
    ramps: [{ at: 0.34, len: 36, h: 2.6, gap: 44 }, { at: 0.64, len: 36, h: 2.6, gap: 48 }],
    shortcuts: [5],
    obstacles: [[0.15, 0.25, 6], [0.45, 0.55, 6], [0.75, 0.85, 5]],
    arches: 10,
  },
  {
    // High-speed refinery overpass crossover at (11, 10.5)
    id: 'methane', name: 'Methan-Derby', planet: 'Malastare', theme: 'malastare', type: 'circuit', difficulty: 3, setPieces: { bridge: [0.22], gate: [0.5], rotor: [0.8] },
    desc: 'Breite Highspeed-Bögen und Raffinerie-Überführungen über Methan-Felder: Geysire brechen im Takt aus.',
    pts: [[0,0,0,44],[8,0,2,40],[13.5,2,4,32],[15.5,6,8,30],[14,9.5,16,30],[11.5,10.5,18,30],[7.5,10.8,18,30],[5,14,10,30],[7.5,17.5,4,32],[12.5,17,-4,30],[14.5,14,-10,28],[11.2,12.5,-14,28],[10.6,7.8,-14,28],[13.5,5.5,-6,30],[18.5,8,2,30],[20.5,13,6,30],[18,18,6,32],[11,20,4,34],[4,18.5,2,32],[-0.5,14,0,30],[-2,8.5,2,34],[-1,3,0,40]],
    canyons: [[0.14, 0.22], [0.72, 0.82]],
    ramps: [{ at: 0.72, len: 36, h: 2.6, gap: 44 }, { at: 0.9, len: 30, h: 2.3, gap: 0 }],
    shortcuts: [15],
    obstacles: [[0.08, 0.16, 6]],
    arches: 5,
    hazards: [[0.1, 0.95, 14]],
  },
  {
    id: 'executioner', name: 'Henker-Sprint', planet: 'Oovo IV', theme: 'oovo', type: 'sprint', difficulty: 5, setPieces: { gate: [0.3, 0.58], rotor: [0.88] },
    desc: 'Durch die Röhren und Hochsicherheitsschleusen des Gefängnismonds: zwei Schwerelos-Zonen und drei Abgrund-Sprünge.',
    pts: [[0,0,0,34],[6,0,-4,30],[11,2,-8,26],[13,6,-4,24],[11,10,0,26],[13,14,4,28],[17,15,0,24],[21,13,-6,26],[24,15,-10,28],[23,19,-6,24],[26,22,0,30],[30,21,4,32],[34,23,0,34]],
    canyons: [[0.12, 0.26], [0.5, 0.62], [0.74, 0.84]],
    ramps: [{ at: 0.34, len: 36, h: 2.6, gap: 46 }, { at: 0.68, len: 36, h: 2.6, gap: 50 }, { at: 0.9, len: 30, h: 2.3, gap: 40 }],
    shortcuts: [9],
    obstacles: [[0.28, 0.34, 8], [0.86, 0.92, 6]],
    arches: 6,
  },
];

export const DIFFICULTIES = [
  { id: 'easy', name: 'Leicht', speed: 0.8, skill: 0.55 },
  { id: 'normal', name: 'Normal', speed: 0.9, skill: 0.75 },
  { id: 'hard', name: 'Schwer', speed: 0.98, skill: 0.9 },
  { id: 'insane', name: 'Wahnsinn', speed: 1.05, skill: 1.0 },
];
