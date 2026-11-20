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

export type EngineStyle = 'turbine' | 'long' | 'split' | 'heavy' | 'needle' | 'quad' | 'ring' | 'blade';

export interface PodDef {
  id: string;
  name: string;
  pilotId: string;
  desc: string;
  stats: Record<StatKey, number>; // 0..1
  engine: EngineStyle;
  engineLen: number;
  engineRad: number;
  spread: number; // distance between engines
  cable: number; // engine -> cockpit distance
  cockpit: 'pod' | 'wedge' | 'saucer' | 'long';
  colors: [string, string, string]; // primary, secondary, glow
}

export interface PilotDef {
  id: string;
  name: string;
  species: string;
  skill: number; // 0..1
  aggression: number; // 0..1
  color: string;
}

export const PILOTS: PilotDef[] = [
  { id: 'kai', name: 'Kai Varrin', species: 'Mensch', skill: 0.9, aggression: 0.4, color: '#4aa3ff' },
  { id: 'zeb', name: 'Zebulox Vrak', species: 'Dugkin', skill: 0.95, aggression: 0.95, color: '#ff9a2e' },
  { id: 'gas', name: 'Gasvaro Ten', species: 'Xantori', skill: 0.8, aggression: 0.3, color: '#3fe0a0' },
  { id: 'bom', name: 'Bomquad Rii', species: 'Lurbani', skill: 0.55, aggression: 0.2, color: '#e3e04a' },
  { id: 'mav', name: 'Mavik Hollo', species: 'Gurrani', skill: 0.75, aggression: 0.6, color: '#ff4a6e' },
  { id: 'rat', name: 'Rattis Tyr', species: 'Aleeni', skill: 0.7, aggression: 0.8, color: '#b46bff' },
  { id: 'ald', name: 'Aldo Beerak', species: 'Kraveen', skill: 0.85, aggression: 0.7, color: '#7fd3ff' },
  { id: 'tee', name: 'Teemo Pagali', species: 'Vexi', skill: 0.65, aggression: 0.5, color: '#ff7b2e' },
  { id: 'ela', name: 'Elana Mak', species: 'Mensch', skill: 0.78, aggression: 0.35, color: '#ff5ad1' },
  { id: 'ody', name: 'Odo Mandrel', species: 'Erriton', skill: 0.6, aggression: 0.55, color: '#9fff5a' },
  { id: 'cle', name: 'Clegg Halden', species: 'Mensch', skill: 0.68, aggression: 0.45, color: '#ffd27a' },
];

export const PODS: PodDef[] = [
  {
    id: 'aurora', name: 'Aurora XR-7', pilotId: 'kai', desc: 'Ausgewogener Allrounder mit großen Turbinen-Triebwerken.',
    stats: { topSpeed: 0.7, accel: 0.75, turn: 0.75, traction: 0.65, airbrake: 0.7, cooling: 0.7, repair: 0.6 },
    engine: 'turbine', engineLen: 7, engineRad: 1.15, spread: 4.2, cable: 9, cockpit: 'pod', colors: ['#2d6fd6', '#d9dde3', '#4ad2ff'],
  },
  {
    id: 'brute', name: 'Vrak Splitter-X', pilotId: 'zeb', desc: 'Riesige Split-X Triebwerke – brutale Geschwindigkeit.',
    stats: { topSpeed: 0.95, accel: 0.8, turn: 0.45, traction: 0.55, airbrake: 0.5, cooling: 0.55, repair: 0.5 },
    engine: 'split', engineLen: 10, engineRad: 1.25, spread: 5.2, cable: 10, cockpit: 'wedge', colors: ['#d07a1c', '#3a3a3a', '#ffb347'],
  },
  {
    id: 'gasvaro', name: 'Tenroc 6-Fach', pilotId: 'gas', desc: 'Sechs Triebwerke, extreme Beschleunigung, empfindlich.',
    stats: { topSpeed: 0.8, accel: 0.95, turn: 0.6, traction: 0.6, airbrake: 0.65, cooling: 0.45, repair: 0.45 },
    engine: 'quad', engineLen: 8.5, engineRad: 0.9, spread: 4.8, cable: 11, cockpit: 'long', colors: ['#27a36d', '#e8d27a', '#5affb4'],
  },
  {
    id: 'bomquad', name: 'Quadra Lumber', pilotId: 'bom', desc: 'Vier schlanke Triebwerke im Quadrat, gekoppelt über ein X aus Energieblitzen. Wild, aber schnell.',
    stats: { topSpeed: 0.85, accel: 0.55, turn: 0.4, traction: 0.4, airbrake: 0.45, cooling: 0.8, repair: 0.7 },
    engine: 'ring', engineLen: 7.6, engineRad: 0.7, spread: 4.6, cable: 12, cockpit: 'saucer', colors: ['#c9b23a', '#5d4a2c', '#fff07a'],
  },
  {
    id: 'mavik', name: 'Hollo Needle', pilotId: 'mav', desc: 'Schlanke Nadel-Triebwerke für maximale Wendigkeit.',
    stats: { topSpeed: 0.6, accel: 0.7, turn: 0.95, traction: 0.85, airbrake: 0.85, cooling: 0.65, repair: 0.6 },
    engine: 'needle', engineLen: 8, engineRad: 0.75, spread: 3.6, cable: 8, cockpit: 'pod', colors: ['#c2263f', '#efe9e1', '#ff5a7a'],
  },
  {
    id: 'rattis', name: 'Tyr Vespa', pilotId: 'rat', desc: 'Klein, leicht und agil – hohe Traktion.',
    stats: { topSpeed: 0.65, accel: 0.85, turn: 0.85, traction: 0.9, airbrake: 0.75, cooling: 0.6, repair: 0.55 },
    engine: 'blade', engineLen: 6.5, engineRad: 0.85, spread: 3.4, cable: 7.5, cockpit: 'wedge', colors: ['#8a3ad6', '#20212a', '#c48bff'],
  },
  {
    id: 'aldo', name: 'Beerak Fireflare', pilotId: 'ald', desc: 'Hochleistungskühlung – Dauer-Boost-Spezialist.',
    stats: { topSpeed: 0.75, accel: 0.65, turn: 0.6, traction: 0.7, airbrake: 0.6, cooling: 0.95, repair: 0.75 },
    engine: 'long', engineLen: 9.5, engineRad: 1.0, spread: 4.4, cable: 9.5, cockpit: 'long', colors: ['#2a8fb5', '#c7c2b8', '#7fe8ff'],
  },
  {
    id: 'teemo', name: 'Pagali Ironclad', pilotId: 'tee', desc: 'Schwer gepanzert – steckt Kollisionen weg.',
    stats: { topSpeed: 0.7, accel: 0.5, turn: 0.5, traction: 0.75, airbrake: 0.55, cooling: 0.7, repair: 0.95 },
    engine: 'heavy', engineLen: 7.5, engineRad: 1.45, spread: 5.0, cable: 9, cockpit: 'saucer', colors: ['#7a4a2a', '#b5b5b5', '#ff8c3a'],
  },
  {
    id: 'elana', name: 'Mak Starling', pilotId: 'ela', desc: 'Elegant und präzise – perfekte Luftbremse.',
    stats: { topSpeed: 0.72, accel: 0.72, turn: 0.8, traction: 0.75, airbrake: 0.95, cooling: 0.6, repair: 0.6 },
    engine: 'needle', engineLen: 9, engineRad: 0.85, spread: 4.0, cable: 9, cockpit: 'long', colors: ['#e6e6ee', '#d63aa8', '#ff7ae0'],
  },
  {
    id: 'odo', name: 'Mandrel Ram', pilotId: 'ody', desc: 'Rammbock mit Turbinen – aggressive Rennen.',
    stats: { topSpeed: 0.78, accel: 0.6, turn: 0.55, traction: 0.6, airbrake: 0.5, cooling: 0.75, repair: 0.85 },
    engine: 'heavy', engineLen: 8, engineRad: 1.3, spread: 4.6, cable: 8.5, cockpit: 'wedge', colors: ['#4c7a1e', '#2b2b2b', '#b4ff5a'],
  },
];

// ===================== THEMES =====================
export type TexKind = 'sand' | 'rock' | 'road' | 'snow' | 'ice' | 'jungle' | 'basalt' | 'metal' | 'crystal' | 'lavaRoad' | 'cityRoad' | 'mud' | 'oovoRoad' | 'oovoWall' | 'gravel' | 'cracked';
export type DecorKind = 'rocks' | 'spires' | 'mesas' | 'cacti' | 'iceSpikes' | 'pines' | 'trees' | 'ferns' | 'lavaRocks' | 'towers' | 'buildings' | 'crystals' | 'wrecks' | 'balloons' | 'pylons' | 'asteroids' | 'cells' | 'satellites' | 'antennas' | 'debris';

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
  terrain: 'dunes' | 'mountains' | 'lava' | 'city' | 'jungle' | 'canyon' | 'prison' | 'ocean';
  emissiveGround?: string;
  barrierColor: string;
  stars?: number; // 0..1 night starfield (set by environment.ts)
}

export const THEMES: Record<string, ThemeDef> = {
  desert: {
    id: 'desert', name: 'Tatooine', skyTop: '#3d7fd0', skyHorizon: '#f2d6a8', sunColor: '#fff1d0', sunElev: 28, sunAz: 40, clouds: 0.25,
    fogColor: '#e8c9a0', fogDensity: 0.00055, sunIntensity: 4.2, hemiSky: '#bcd5ff', hemiGround: '#b08050', exposure: 0.95,
    road: 'road', wall: 'rock', ground: 'sand',
    palette: { road: ['#8a6a48', '#b08d64', '#cfae80'], wall: ['#7a4a2c', '#b8743f', '#e0a86a'], ground: ['#b88a58', '#d8ae78', '#efcf9a'] },
    decor: ['rocks', 'spires', 'mesas', 'wrecks', 'balloons'], ambient: 'dust', terrain: 'canyon', barrierColor: '#ffb040',
  },
  ice: {
    id: 'ice', name: 'Ando Prime', skyTop: '#5a7fa8', skyHorizon: '#dde8f2', sunColor: '#e8f2ff', sunElev: 14, sunAz: 120, clouds: 0.55,
    fogColor: '#c8d8e8', fogDensity: 0.0008, sunIntensity: 3.0, hemiSky: '#cfe2ff', hemiGround: '#8aa0b8', exposure: 1.0,
    road: 'ice', wall: 'snow', ground: 'snow',
    palette: { road: ['#6f93b4', '#9fc2de', '#d8ecff'], wall: ['#7d8fa3', '#c5d4e3', '#ffffff'], ground: ['#a8bccf', '#dce7f2', '#ffffff'] },
    decor: ['iceSpikes', 'pines', 'rocks', 'pylons'], ambient: 'snow', terrain: 'mountains', barrierColor: '#5ad8ff',
  },
  city: {
    id: 'city', name: 'Ökumenopolis', skyTop: '#140c2e', skyHorizon: '#ff7a4a', sunColor: '#ffb080', sunElev: 6, sunAz: 250, clouds: 0.4,
    fogColor: '#5a3a5a', fogDensity: 0.0006, sunIntensity: 2.6, hemiSky: '#6a5aa0', hemiGround: '#40303a', exposure: 1.1,
    road: 'cityRoad', wall: 'metal', ground: 'metal',
    palette: { road: ['#2a2c34', '#3c404c', '#5a6070'], wall: ['#30343e', '#555c6c', '#8a94a8'], ground: ['#1a1c24', '#2a2e38', '#3a4050'] },
    decor: ['buildings', 'towers', 'pylons', 'balloons'], ambient: 'rain', terrain: 'city', barrierColor: '#ff3ad0',
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
    decor: ['rocks', 'wrecks', 'balloons', 'pylons'], ambient: 'rain', terrain: 'ocean', barrierColor: '#3ad8ff',
  },
  oovo: {
    id: 'oovo', name: 'Oovo IV', skyTop: '#02030a', skyHorizon: '#1a2440', sunColor: '#e8e0d0', sunElev: 8, sunAz: 200, clouds: 0.0,
    fogColor: '#0a0e18', fogDensity: 0.00035, sunIntensity: 2.2, hemiSky: '#2a3355', hemiGround: '#0a0c12', exposure: 1.05,
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
    id: 'malastare', name: 'Malastare', skyTop: '#4f6b5a', skyHorizon: '#e2cf96', sunColor: '#fff0c8', sunElev: 22, sunAz: 150, clouds: 0.55,
    fogColor: '#a8a880', fogDensity: 0.0008, sunIntensity: 3.4, hemiSky: '#d8e8c0', hemiGround: '#4a4a2a', exposure: 1.0,
    road: 'cityRoad', wall: 'rock', ground: 'jungle', // Session 16: panelled metal race deck with light lines (methane refinery world)
    palette: { road: ['#4a4436', '#665e4a', '#8a8064'], wall: ['#3e3a2e', '#625a46', '#8e8466'], ground: ['#3a4422', '#566230', '#7a8240'] },
    decor: ['rocks', 'spires', 'wrecks', 'pylons'], ambient: 'spores', terrain: 'jungle', barrierColor: '#c8ff3a',
  },
  mesa: {
    id: 'mesa', name: 'Rote Tafelberge', skyTop: '#2a6ab0', skyHorizon: '#ffc890', sunColor: '#ffd8a0', sunElev: 12, sunAz: 270, clouds: 0.35,
    fogColor: '#e0a070', fogDensity: 0.0006, sunIntensity: 3.8, hemiSky: '#b0c8ff', hemiGround: '#a05030', exposure: 1.0,
    road: 'road', wall: 'rock', ground: 'sand',
    palette: { road: ['#7a4a30', '#a06040', '#c08058'], wall: ['#6a2a18', '#a8482a', '#d87a4a'], ground: ['#a05a38', '#c87a50', '#e8a070'] },
    decor: ['mesas', 'spires', 'rocks', 'cacti', 'balloons'], ambient: 'dust', terrain: 'canyon', barrierColor: '#ffa040',
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
    id: 'boonta', name: 'Boonta-Kessel', planet: 'Tatooine', theme: 'desert', type: 'circuit', difficulty: 2, setPieces: { arch: [0.57], rotor: [0.92] },
    desc: 'Der Klassiker: enge Schluchten, Felsbögen und eine Todesschanze über den Abgrund.',
    pts: [[0,0,0,36],[5,0,2,32],[9,-1,8,26],[12,1,14,24],[12,4,10,22],[9,5,4,28],[7,3.5,0,24],[5,4.5,6,22],[5,7,12,26],[8,8.5,16,30],[11,8,10,24],[13,9.5,4,22],[12,12,0,30],[8,12.5,-4,40],[4,11,0,26],[1,12,6,22],[-2,10,10,24],[-2,6,6,28],[0,4.5,2,26],[-1,2,0,32]],
    canyons: [[0.16, 0.3], [0.52, 0.6], [0.7, 0.82]],
    ramps: [{ at: 0.36, len: 40, h: 6, gap: 46 }, { at: 0.62, len: 30, h: 4, gap: 0 }],
    shortcuts: [5],
    obstacles: [[0.55, 0.62, 10], [0.86, 0.95, 6]],
    arches: 9,
  },
  {
    id: 'frost', name: 'Frostspalt-Ring', planet: 'Ando Prime', theme: 'ice', type: 'circuit', difficulty: 3, setPieces: { icefall: [0.47], rotor: [0.65] },
    desc: 'Rutschige Eispisten, Gletscherspalten und Eisdorn-Felder.',
    pts: [[0,0,0,34],[6,0,-6,30],[10,-2,-14,26],[13,-1,-20,24],[14,2,-16,22],[12,4,-8,26],[14,6,-2,28],[13,9,4,24],[10,9,8,30],[9,7,4,22],[7,8,0,24],[6,11,-6,30],[3,11,-10,36],[1,9,-6,24],[3,7,-2,22],[1,5,0,26],[-2,6,4,28],[-3,3,2,30],[-1.5,0.8,0,34]],
    canyons: [[0.1, 0.22], [0.42, 0.55], [0.74, 0.8]],
    ramps: [{ at: 0.3, len: 36, h: 5, gap: 40 }, { at: 0.86, len: 30, h: 4, gap: 0 }],
    shortcuts: [8],
    obstacles: [[0.58, 0.7, 12], [0.12, 0.2, 6]],
    arches: 6,
  },
  {
    id: 'neon', name: 'Neon-Spirale', planet: 'Ökumenopolis', theme: 'city', type: 'circuit', difficulty: 3, setPieces: { gate: [0.3, 0.86] },
    desc: 'Hochgeschwindigkeits-Skyways zwischen Megatürmen bei Sonnenuntergang.',
    pts: [[0,0,0,40],[8,0,4,36],[10,2,12,28],[8,4,20,26],[4,4,24,24],[2,6,20,24],[4,8,12,28],[10,8,6,36],[12,6,10,26],[14,7,16,24],[15,10,20,28],[12,12,14,34],[6,12,6,40],[2,11,2,28],[-1,12,6,24],[-3,9,10,26],[-2,5,6,28],[-3,2,2,32]],
    canyons: [[0.2, 0.28], [0.58, 0.66]],
    ramps: [{ at: 0.44, len: 40, h: 6, gap: 50 }, { at: 0.8, len: 30, h: 4, gap: 30 }],
    shortcuts: [3],
    obstacles: [[0.3, 0.4, 8], [0.84, 0.94, 8]],
    arches: 10,
  },
  {
    id: 'magma', name: 'Magma-Inferno', planet: 'Vulkanwelt', theme: 'lava', type: 'circuit', difficulty: 4, setPieces: { arch: [0.42], boulder: [0.71] },
    desc: 'Über Lavaseen und durch glühende Basaltschluchten. Ein Fehler – und du schmilzt.',
    pts: [[0,0,0,32],[5,1,4,30],[8,0,10,24],[10,-2,16,22],[13,-1,12,26],[13,2,6,22],[10,3,2,24],[9,5,-4,20],[11,7,0,24],[14,7,6,28],[15,10,10,22],[13,12,6,26],[10,11,0,30],[8,9,-4,22],[6,11,0,20],[3,12,6,28],[1,10,8,24],[2,7,4,22],[-1,5,2,26],[-2,2,0,30]],
    canyons: [[0.08, 0.2], [0.36, 0.48], [0.66, 0.74]],
    ramps: [{ at: 0.25, len: 36, h: 6, gap: 44 }, { at: 0.56, len: 36, h: 6, gap: 44 }, { at: 0.9, len: 30, h: 4, gap: 0 }],
    shortcuts: [4],
    obstacles: [[0.6, 0.66, 10], [0.0, 0.06, 4]],
    arches: 7,
    hazards: [[0.1, 0.9, 8]],
  },
  {
    id: 'dunepass', name: 'Dünenpass-Sprint', planet: 'Tatooine', theme: 'mesa', type: 'sprint', difficulty: 2, setPieces: { boulder: [0.2], arch: [0.5] },
    desc: 'Von den Hochplateaus hinab durch rote Tafelberge – Vollgas von Start bis Ziel.',
    pts: [[0,0,0,36],[5,0,-2,34],[9,2,-8,28],[11,5,-14,24],[10,8,-20,26],[12,11,-26,30],[16,11,-30,26],[18,8,-34,22],[21,7,-40,28],[24,9,-46,36],[25,13,-50,26],[22,15,-54,22],[23,18,-56,26],[27,19,-58,30],[31,17,-60,34],[34,18,-60,36]],
    canyons: [[0.12, 0.25], [0.45, 0.55], [0.7, 0.8]],
    ramps: [{ at: 0.3, len: 40, h: 6, gap: 46 }, { at: 0.6, len: 34, h: 5, gap: 0 }, { at: 0.86, len: 40, h: 6, gap: 50 }],
    shortcuts: [9],
    obstacles: [[0.35, 0.45, 10], [0.62, 0.7, 8]],
    arches: 10,
  },
  {
    id: 'jungle', name: 'Dschungelfluss-Sprint', planet: 'Dschungelmond', theme: 'jungle', type: 'sprint', difficulty: 3, setPieces: { boulder: [0.23], arch: [0.56] },
    desc: 'Durch dichten Urwald, über Flussschluchten und an Wracks vorbei.',
    pts: [[0,0,0,32],[4,1,2,28],[6,4,6,24],[4,7,10,22],[6,10,8,24],[10,10,4,30],[12,7,0,24],[15,6,-4,22],[17,9,-8,26],[16,12,-6,22],[19,15,-2,24],[23,14,2,30],[25,11,0,26],[28,12,-2,28],[30,15,0,32]],
    canyons: [[0.15, 0.3], [0.5, 0.62]],
    ramps: [{ at: 0.34, len: 36, h: 6, gap: 44 }, { at: 0.72, len: 40, h: 6, gap: 48 }],
    shortcuts: [2],
    obstacles: [[0.4, 0.5, 12], [0.78, 0.88, 10]],
    arches: 6,
  },
  {
    id: 'aquilaris', name: 'Aquilaris-Küstenlauf', planet: 'Aquilaris', theme: 'aquilaris', type: 'circuit', difficulty: 3, setPieces: { rotor: [0.15], bridge: [0.48], gate: [0.82] },
    desc: 'Schwebende Rennplattformen über dem Ozean: enge Kurven zwischen Felsinseln, Sprünge über Buchten und eine Abkürzung durch die Klippen.',
    pts: [[0,0,0,36],[6,0,2,32],[11,1,4,28],[15,3,6,24],[18,6,4,22],[19,10,0,26],[17,13,-4,24],[14,15,-2,28],[10,16,0,24],[6,15,2,30],[3,12,4,26],[1,8,2,28],[0,4,0,34]],
    canyons: [[0.2,0.34],[0.55,0.68]],
    ramps: [{ at: 0.32, len: 36, h: 6, gap: 44 }, { at: 0.7, len: 36, h: 5, gap: 40 }],
    shortcuts: [4],
    obstacles: [[0.1,0.2,6],[0.6,0.7,6]],
    arches: 6,
  },
  {
    id: 'oovo', name: 'Oovo-IV-Gefängnis', planet: 'Oovo IV', theme: 'oovo', type: 'circuit', difficulty: 4, setPieces: { gate: [0.4, 0.7] },
    desc: 'Der Hochsicherheits-Gefängnismond: schwebende Metallröhren, Asteroidenfelder und Schwerelosigkeitszonen über dem Abgrund.',
    pts: [[0,0,0,34],[6,0,0,30],[10,2,-5,26],[12,5,-5,24],[10,7,0,22],[8,9,5,26],[6,11,5,24],[8,13,0,28],[12,14,-5,24],[14,12,-10,22],[16,9,-10,26],[18,7,-5,30],[20,9,0,24],[22,12,5,22],[20,15,10,26],[16,16,5,28],[14,18,0,24],[16,21,-5,30],[14,24,-5,26],[12,26,0,22],[9,25,5,26],[7,22,5,30],[5,20,0,24],[3,18,0,26],[1,16,5,28],[0,13,5,26],[-1,10,0,30],[-1,6,0,32]],
    canyons: [[0.18,0.32],[0.48,0.62],[0.78,0.9]],
    ramps: [{ at: 0.28, len: 36, h: 6, gap: 44 }, { at: 0.62, len: 36, h: 6, gap: 44 }],
    shortcuts: [12],
    obstacles: [[0.05,0.15,6],[0.7,0.78,6]],
    arches: 8,
  },
  {
    id: 'crystal', name: 'Kristallschlucht-Sprint', planet: 'Kristallschluchten', theme: 'crystal', type: 'sprint', difficulty: 5, setPieces: { rotor: [0.3], arch: [0.72] },
    desc: 'Leuchtende Kristallfelder, schmale Grate und gewaltige Sprünge.',
    pts: [[0,0,0,30],[4,-1,4,28],[7,1,10,22],[7,5,16,20],[4,6,20,22],[3,9,14,18],[6,11,8,22],[10,10,12,26],[12,12,18,20],[11,15,24,18],[14,17,16,24],[18,16,8,28],[19,13,4,22],[22,12,2,26],[25,14,0,32]],
    canyons: [[0.05, 0.18], [0.38, 0.5], [0.66, 0.78]],
    ramps: [{ at: 0.22, len: 36, h: 6, gap: 44 }, { at: 0.55, len: 40, h: 6, gap: 52 }, { at: 0.85, len: 34, h: 5, gap: 40 }],
    shortcuts: [4],
    obstacles: [[0.28, 0.36, 10], [0.6, 0.66, 8]],
    arches: 8,
  },
  {
    id: 'malastare', name: 'Malastare-100-Sprint', planet: 'Malastare', theme: 'malastare', type: 'sprint', difficulty: 4, setPieces: { rotor: [0.4] },
    desc: 'Dugs Heimatwelt: Methan-Dunst, Dampfquellen und drei Schanzen über Sumpfschluchten – Vollgas durch olivgrüne Hügel.',
    pts: [[0,0,0,34],[5,1,2,30],[9,3,6,24],[10,7,10,22],[8,10,6,26],[10,13,2,30],[14,13,-2,24],[17,11,-6,22],[20,12,-4,28],[22,15,0,24],[20,18,4,22],[23,21,6,26],[27,20,2,30],[30,22,0,34]],
    canyons: [[0.1, 0.24], [0.46, 0.58], [0.74, 0.86]],
    ramps: [{ at: 0.3, len: 36, h: 6, gap: 44 }, { at: 0.64, len: 30, h: 5, gap: 0 }, { at: 0.9, len: 36, h: 6, gap: 46 }],
    shortcuts: [6],
    obstacles: [[0.36, 0.44, 10], [0.66, 0.74, 8]],
    arches: 7,
    hazards: [[0.08, 0.95, 10]],
  },
  {
    id: 'mosespa', name: 'Mos-Espa-Arena', planet: 'Tatooine', theme: 'desert', type: 'circuit', difficulty: 3, setPieces: { gate: [0.44], rotor: [0.7], bridge: [0.84] },
    desc: 'Stadion-Rundkurs vor den Toren von Mos Espa: lange Startgerade, Haarnadeln, drei Schluchten und eine Todesschanze.',
    pts: [[0,0,0,40],[7,0,0,38],[12,-1,4,30],[15,1,8,24],[14,4,6,22],[11,5,2,26],[10,8,0,24],[12,10,4,22],[16,11,10,28],[18,14,14,24],[15,16,10,22],[11,15,6,26],[8,13,2,24],[5,15,-2,22],[2,13,0,26],[0,10,2,30],[-2,7,4,24],[-1,3,2,32]],
    canyons: [[0.14, 0.26], [0.5, 0.6], [0.78, 0.88]],
    ramps: [{ at: 0.34, len: 40, h: 6, gap: 46 }, { at: 0.68, len: 30, h: 4, gap: 0 }],
    shortcuts: [11],
    obstacles: [[0.4, 0.48, 8], [0.9, 0.97, 6]],
    arches: 8,
  },
  {
    id: 'howler', name: 'Heulerschlucht-Sprint', planet: 'Ando Prime', theme: 'ice', type: 'sprint', difficulty: 4, setPieces: { icefall: [0.2, 0.55] },
    desc: '80 Höhenmeter bergab durch drei vereiste Klammen – Eissäulen, zwei Abgrund-Schanzen, kaum Platz für Fehler.',
    pts: [[0,0,40,34],[5,1,34,30],[8,4,28,26],[7,8,22,24],[9,11,14,26],[13,12,8,24],[16,10,2,24],[19,11,-4,26],[21,14,-10,24],[19,17,-16,24],[21,20,-22,26],[25,21,-28,28],[29,19,-34,30],[33,20,-40,34]],
    canyons: [[0.05, 0.3], [0.38, 0.6], [0.68, 0.9]],
    ramps: [{ at: 0.34, len: 36, h: 6, gap: 44 }, { at: 0.64, len: 36, h: 6, gap: 48 }],
    shortcuts: [5],
    obstacles: [[0.15, 0.25, 6], [0.45, 0.55, 6], [0.75, 0.85, 5]],
    arches: 10,
  },
  {
    id: 'methane', name: 'Methan-Derby', planet: 'Malastare', theme: 'malastare', type: 'circuit', difficulty: 3, setPieces: { bridge: [0.26], rotor: [0.55] },
    desc: 'Breite Highspeed-Bögen über Methan-Felder: Geysire brechen im Takt aus – Timing schlägt Mut.',
    pts: [[0,0,0,44],[8,0,2,40],[13,2,4,32],[14,6,2,28],[11,8,0,30],[8,7,-2,26],[5,9,0,28],[6,13,4,30],[10,15,6,34],[15,14,4,30],[18,11,2,28],[21,13,4,26],[20,17,6,30],[15,19,4,34],[8,19,2,36],[2,17,0,32],[-1,13,0,30],[-2,8,2,34],[-1,3,0,40]],
    canyons: [[0.2, 0.3], [0.62, 0.7]],
    ramps: [{ at: 0.4, len: 36, h: 6, gap: 44 }, { at: 0.82, len: 30, h: 5, gap: 0 }],
    shortcuts: [5],
    obstacles: [[0.08, 0.16, 6]],
    arches: 5,
    hazards: [[0.1, 0.95, 14]],
  },
  {
    id: 'executioner', name: 'Henker-Sprint', planet: 'Oovo IV', theme: 'oovo', type: 'sprint', difficulty: 5, setPieces: { gate: [0.3, 0.58], rotor: [0.88] },
    desc: 'Durch die Röhren des Gefängnismonds: zwei Schwerelos-Zonen, drei Abgrund-Sprünge und Trümmer auf der Ideallinie.',
    pts: [[0,0,0,34],[6,0,-4,30],[11,2,-8,26],[13,6,-4,24],[11,10,0,26],[13,14,4,28],[17,15,0,24],[21,13,-6,26],[24,15,-10,28],[23,19,-6,24],[26,22,0,30],[30,21,4,32],[34,23,0,34]],
    canyons: [[0.12, 0.26], [0.5, 0.62], [0.74, 0.84]],
    ramps: [{ at: 0.34, len: 36, h: 6, gap: 46 }, { at: 0.68, len: 36, h: 6, gap: 50 }, { at: 0.9, len: 30, h: 5, gap: 40 }],
    shortcuts: [6],
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
