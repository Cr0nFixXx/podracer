import * as THREE from 'three/webgpu';
import { resolveEnvironment, type EnvBuild, type EnvFx, type EnvTimeline } from './environment';
import { WEATHER } from './materials';
import { beginTextureEpoch, generateTextures, hasTextureWorkers, setTextureAnisotropy, textureStats } from './textures';
import { makeBeams } from './lights';
import { DebrisPool } from './debris';
import { DS, TUNNEL_SHOULDER, roadSurfaceAt, tunnelCeiling } from './trackBuilder';
import { surfaceOf, surfacePalette, type SurfaceDef } from './surfaces';
import { normalizeKeys, normalizePad, padValue, type Action, type KeyMap, type PadMap } from './keymap';
import { podEnvelope } from './podDesigns';
import { WeatherFx } from './weather';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { DIFFICULTIES, PILOTS, PODS, THEMES, TRACKS } from './data';
import { CAMERA_NAMES, effectiveStats, MAX_OPPONENTS, type Profile, type GfxSettings } from './settings';
import { pickRivals, rivalKit } from './roster';
import { buildTrack, type TrackData } from './trackBuilder';
import { buildWorld, type World, worldTextureSpecs } from './world';
import { makeSky, sunDirection } from './sky';
import { buildPodModel, setPodLodScale } from './podModel';
import { Particles } from './particles';
import { PostFX } from './post';
import { AudioFX, type WorldAudioState } from './audio';
import { HOVER, aiInputs, applyDamage, bodyToWorld, podParams, respawn, stepPod, worldToBody, type PodState, collidePods } from './physics';
import { damageModel, lostMessage, partLamps } from './podDamage';
import { applyAtmosphere } from './atmosphere';
import type { LifeAudio } from './wildlife';

const ZERO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const C_ICE = new THREE.Color('#d8f2ff'), WHITE_C = new THREE.Color(1, 1, 1);
export { CAMERA_NAMES };

export interface Standing { name: string; color: string; isPlayer: boolean; gap: string; finished: boolean; }
export interface HudState {
  speed: number; place: number; total: number; lap: number; laps: number; sprint: boolean; progress: number;
  time: number; lastLap: number | null; bestLap: number | null;
  hpL: number; hpR: number; heat: number; boosting: boolean; overheat: boolean; repairing: boolean; airbrake: boolean;
  wrongWay: boolean; zeroG: boolean; countdown: number; message: string; camName: string; fps: number; backend: string; standings: Standing[]; dead: boolean;
  finished: boolean;
  /** Session 12: flight attitude (roll -1..1 = ∓90°, pitch -1 dive..+1 lift), slide state/charge, weather label */
  roll: number; pitch: number; sliding: boolean; slideCharge: number; airborne: boolean; env: string;
  /** Session 20: ground under the player (label + effect hint, e.g. "Eis · wenig Haftung") */
  surface: string; surfaceFx: string;
  /** engine-heat factor of climate and weather, 1 = neutral (the HUD shows it beside the heat bar when it is off by 3 % or more) */
  heatEnv: number;
  /** 0..1 share of the 3 s boost overdrive that is used up */
  overdrive: number;
  /** Bruchteil lamps of the two damage boxes (screen-left / screen-right), rows 50 / 35 / 20 %: 0 no part · 1 attached · 2 lost */
  partsL: number[]; partsR: number[];
}
export interface RaceResult { place: number; name: string; pod: string; color: string; isPlayer: boolean; time: number | null; bestLap: number | null; }

interface Callbacks {
  onHud: (h: HudState) => void;
  onLoading: (p: number, msg: string) => void;
  onFinish: (r: RaceResult[]) => void;
  onPause: (p: boolean) => void;
  onReady: () => void;
}

export class Game {
  container: HTMLDivElement; profile: Profile; cb: Callbacks;
  renderer!: THREE.WebGPURenderer; backend = 'WebGL2'; scene = new THREE.Scene(); camera!: THREE.PerspectiveCamera;
  post!: PostFX; world!: World; td!: TrackData; particles!: Particles; audio!: AudioFX;
  sky!: ReturnType<typeof makeSky>; sun!: THREE.DirectionalLight; sunDir = new THREE.Vector3();
  csm: CSMShadowNode | null = null; csmFov = 0;
  env!: EnvFx; weather!: WeatherFx; hemi!: THREE.HemisphereLight; prevRoll = 0;
  keymap: KeyMap = normalizeKeys(null); padmap: PadMap = normalizePad(null); envLabel = '';
  fog!: ReturnType<typeof applyAtmosphere>;
  navLights: THREE.InstancedMesh | null = null; headLamp: THREE.SpotLight | null = null; private tmpM = new THREE.Matrix4();
  /** Session 13: environment timeline (time of day × weather) + derived runtime state */
  tl!: EnvTimeline; envBuild!: EnvBuild; envInit = false; baseGrip = 1; wet = 0; wetTarget = 0; private sunBaseI = 1; private envI = 0.85; private envLum = 1;
  private sevPrev = 0; private darkPrev = 0; private dustBase = new THREE.Color(); lightLevel = 0;
  beams: ReturnType<typeof makeBeams> | null = null; private tmpE = new THREE.Euler();
  private prevNd = 1e9; private closing = 0; private flybyT = 0;
  loadMs: Record<string, number> = {};
  debris = new DebrisPool(); /** sheet metal: Bruchteile and pieces of exploding pods */ scrap = new DebrisPool('plate'); dustAmt = 1;
  /** Session 14: 0..1 how far the player is under a roof (rain, splashes and lens drops fade out); weather-effects quality 0 / 0.5 / 1 */
  cover = 0; wxQ = 1; envDirty = false;
  private shadowTexel = 0;
  private sunRight = new THREE.Vector3(); private sunUp = new THREE.Vector3();
  pods: PodState[] = []; player!: PodState;
  keys = new Set<string>();
  running = false; paused = false; disposed = false;
  state: 'loading' | 'countdown' | 'race' | 'post' = 'loading';
  countdown = 4; raceTime = 0; clock = 0; acc = 0; lastT = 0;
  camMode = 0; camYaw = 0; camY = 0; camInit = false; tvIdx = -1; flash = 0;
  hudTimer = 0; mapTimer = 0; fps = 60; fpsAcc = 0; fpsCount = 0;
  minimap: HTMLCanvasElement | null = null;
  private mapBg: HTMLCanvasElement | null = null; private mapW = 0; private mapH = 0;
  message = ''; messageT = 0; finishShown = false; postTimer = 0;
  gripMul = 1; /** engine-heat factor of climate and weather (EnvFx.heat) */ heatMul = 1; lastBeep = 99;
  raf = 0; ro: ResizeObserver | null = null;
  // Pre-allocated scratch math objects (zero per-frame GC allocations!)
  tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3(); tmpV3 = new THREE.Vector3();
  tmpQ = new THREE.Quaternion(); tmpQ2 = new THREE.Quaternion(); tmpC = new THREE.Color(); dustCol = new THREE.Color(); barrierGlow = new THREE.Color();
  lifeAudio: LifeAudio = { bird: 0, herd: 0, crawler: 0 };
  worldAudio: WorldAudioState = { themeId: 'desert', geyser: 0, rotor: 0, rotorHz: 2, crawler: 0, bird: 0, herd: 0 };
  prevCamBtn = false;

  constructor(container: HTMLDivElement, profile: Profile, cb: Callbacks) {
    this.container = container; this.profile = profile; this.cb = cb; this.camMode = profile.race.camera;
  }

  async start() {
    const gfx = this.profile.gfx;
    const trackDef = TRACKS.find(t => t.id === this.profile.race.trackId) ?? TRACKS[0];
    // Session 11: time of day + weather produce a derived theme; everything below keeps reading `theme`
    const tL0 = performance.now();
    const res = resolveEnvironment(THEMES[trackDef.theme], this.profile.race.timeOfDay, this.profile.race.weather);
    const { theme, fx, build } = res;
    this.env = fx; this.envBuild = build; this.tl = res.timeline; this.envLabel = res.label; this.keymap = normalizeKeys(this.profile.keys); this.padmap = normalizePad(this.profile.pad);
    this.baseGrip = theme.id === 'ice' ? 0.8 : theme.id === 'jungle' ? 0.9 : 1; // Session 20: the surfaces carry the rest (ice ×0.75, snow ×0.92, mud ×0.9 …)
    this.gripMul = this.baseGrip * fx.grip; this.heatMul = fx.heat;
    this.dustBase.set(theme.palette.ground[1]); this.dustCol.copy(this.dustBase);
    this.dustAmt = theme.terrain === 'prison' || theme.road === 'cityRoad' ? 0.35 : theme.id === 'ice' ? 0.8 : 1; // little loose dust on metal decks
    this.barrierGlow.set(theme.barrierColor).multiplyScalar(1.25);

    // Load-time optimisation: texture workers start NOW and run in parallel with renderer init, track build and sky/PMREM setup
    beginTextureEpoch(); // textures of the world before the previous one are released
    if (hasTextureWorkers()) void generateTextures(worldTextureSpecs(theme, gfx), gfx.anisotropy ?? 8).catch(() => { /* buildWorld retries */ });
    this.cb.onLoading(0.01, 'Initialisiere Renderer …');
    const r = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: gfx.backend === 'webgl' });
    await r.init();
    this.backend = (r.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    if (this.disposed) { r.dispose(); return; }
    // Keep internal framebuffer bounded to ~1440p-equivalent on 4K/HiDPI screens unless renderScale > 1
    const w0 = Math.max(1, this.container.clientWidth), h0 = Math.max(1, this.container.clientHeight);
    r.setPixelRatio(this.computePixelRatio(w0, h0));
    r.setSize(w0, h0);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = theme.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = gfx.shadows > 0; r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    this.container.appendChild(r.domElement);
    r.domElement.style.width = '100%'; r.domElement.style.height = '100%'; r.domElement.style.display = 'block';
    // near = 0.8 gives crisp 24-bit depth precision across the entire world (zero Z-fighting & zero AO stripes)
    this.camera = new THREE.PerspectiveCamera(gfx.fov, w0 / h0, 0.8, 9500);

    // sky & softened-sun PMREM (prevents pinpoint sun-disc specular flickering on water/ice/metal!)
    this.sky = makeSky(theme, false);
    this.scene.add(this.sky.mesh);
    this.sunDir.copy(sunDirection(theme));
    this.sunRight.crossVectors(UP, this.sunDir).normalize();
    if (this.sunRight.lengthSq() < 1e-4) this.sunRight.set(1, 0, 0);
    this.sunUp.crossVectors(this.sunDir, this.sunRight).normalize();

    const pm = new THREE.PMREMGenerator(r);
    // reflections are baked from the brightest sky the timeline reaches and dimmed at runtime (applyEnv)
    const envScene = new THREE.Scene(); const envSky = makeSky(build.envTheme, true); envScene.add(envSky.mesh);
    { const c1 = new THREE.Color(build.envTheme.skyHorizon), c2 = new THREE.Color(build.envTheme.skyTop), L = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; this.envLum = Math.max(1e-3, L(c1) * 0.6 + L(c2) * 0.4); }
    this.scene.environment = pm.fromScene(envScene, 0.035, 1, 2000).texture;
    this.scene.environmentIntensity = 0.85;
    envSky.mesh.geometry.dispose(); (envSky.mesh.material as THREE.Material).dispose();
    pm.dispose();

    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity / gfx.drawDistance);
    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.58); this.scene.add(hemi); this.hemi = hemi;
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    sun.castShadow = gfx.shadows > 0;
    const ms = [0, 1024, 1536, 2048][gfx.shadows] ?? 1536;
    const sExt = 96;
    if (ms) { sun.shadow.mapSize.set(ms, ms); this.shadowTexel = (sExt * 2) / ms; }
    const sc = sun.shadow.camera; sc.left = -sExt; sc.right = sExt; sc.top = sExt; sc.bottom = -sExt; sc.near = 20; sc.far = 620;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.65;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
    if (gfx.csm && gfx.shadows > 0) {
      // Cascaded shadow maps (TODO §3): cascade 0 keeps the crisp near map, cascade 1 reaches distant canyon walls (blended split)
      const csm = new CSMShadowNode(sun, { cascades: 2, maxFar: 520, mode: 'custom', lightMargin: 340, customSplitsCallback: (_n: number, _near: number, _far: number, out: number[]) => { out.push(0.2, 1); } });
      csm.fade = true; sun.shadow.shadowNode = csm; this.csm = csm;
    }

    // track & world
    this.loadMs.init = Math.round(performance.now() - tL0);
    this.cb.onLoading(0.03, 'Berechne Streckenverlauf …');
    await new Promise(res => setTimeout(res, 0));
    this.td = buildTrack(trackDef);
    { const avgY = this.td.main.samples.reduce((a, s) => a + s.y, 0) / this.td.N; const fogFloor = Math.min(avgY - 14, this.td.bounds.minY - 6); this.fog = applyAtmosphere(this.scene, theme, theme.fogDensity / gfx.drawDistance, fogFloor, this.sunDir, fx.volFog, gfx.volumetrics ?? 2); }
    this.world = await buildWorld(this.td, theme, gfx, (p, m) => this.cb.onLoading(0.05 + p * 0.85, m));
    if (this.disposed) return;
    this.scene.add(this.world.group);

    // particles
    this.particles = new Particles(gfx.particles);
    this.particles.initAmbient(theme.ambient, build.wind, Math.max(1, build.ambMax / 0.45));
    this.wxQ = [0, 0.5, 1][gfx.weatherFx ?? 2] ?? 1; setPodLodScale(gfx.podDetail ?? 1);
    this.weather = new WeatherFx(fx, this.particles, this.scene, theme.sunAz * Math.PI / 180 + 1.1, build.bolt); this.weather.quality = this.wxQ;
    this.scene.add(this.particles.group); this.scene.add(this.debris.mesh); this.scene.add(this.scrap.mesh);

    // pods (player = full hero detail; opponents = merged whole-pod + automatic 2-tier distance LOD!)
    this.loadMs.world = Math.round(performance.now() - tL0) - this.loadMs.init;
    this.cb.onLoading(0.92, 'Montiere Podracer …');
    await new Promise(res => setTimeout(res, 0));
    this.createPods();
    // Session 12: pods switch their lights on when the sky is dark (night, volcano, deep space):
    // 2 headlights + red/green wingtip markers + cockpit strobe per pod in ONE instanced draw; the player also gets a real spot light.
    if (build.lights) {
      const g = new THREE.IcosahedronGeometry(1, 1), m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const im = new THREE.InstancedMesh(g, m, this.pods.length * 5); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const cols = [new THREE.Color(2.4, 2.6, 3.1), new THREE.Color(2.4, 2.6, 3.1), new THREE.Color(0.25, 2.6, 0.5), new THREE.Color(2.8, 0.22, 0.16), new THREE.Color(2.6, 2.6, 2.6)];
      for (let i = 0; i < this.pods.length * 5; i++) im.setColorAt(i, cols[i % 5]);
      this.scene.add(im); this.navLights = im;
      if ((gfx.volumetrics ?? 2) > 0) { this.beams = makeBeams(this.pods.length * 2); this.scene.add(this.beams.mesh); }
      const sl = new THREE.SpotLight('#dfeaff', 12000, 0, 0.5, 0.6, 2); this.scene.add(sl); this.scene.add(sl.target); this.headLamp = sl;
    }

    this.post = new PostFX(r, this.scene, this.camera, gfx, { rain: (gfx.weatherFx ?? 2) > 0 ? build.maxRain : 0, flare: build.flare });
    this.applyEnv(0);
    this.post.lens.sunColor?.value.set(theme.sunColor);
    this.particles.setScale(h0 * r.getPixelRatio());
    this.audio = new AudioFX(this.profile.volume);

    // Full GPU warmup: compile HalfFloat scenePass + shadow + particle + both pod LODs + all PostFX passes & flush VRAM uploads!
    this.loadMs.pods = Math.round(performance.now() - tL0) - this.loadMs.init - this.loadMs.world;
    console.info(`[load] init ${this.loadMs.init} ms · world ${this.loadMs.world} ms (textures ${this.world.timings.texMs} ms, ${textureStats.cached} from cache, ${textureStats.workers} workers${textureStats.jobMs.length ? ', jobs ' + textureStats.jobMs.join('/') + ' ms' : ''}) · pods ${this.loadMs.pods} ms`);
    this.cb.onLoading(0.96, 'Wärme Grafik-Pipeline auf …');
    await new Promise(res => setTimeout(res, 0));
    this.updateCamera(0.016);
    this.world.update(0, this.camera.position, this.pods);
    this.updateVisuals(0.016);
    this.particles.seedWarmup(this.camera.position);
    for (const p of this.pods) if (!p.isPlayer) p.visual?.setDistance(10, true); // expose both near & far LOD once for compilation
    this.debris.warm(true); this.scrap.warm(true); // (empty instance pools: only their pipelines get compiled)
    await this.post.warmup(r);
    this.debris.warm(false); this.scrap.warm(false);
    this.particles.clear();
    for (const p of this.pods) if (!p.isPlayer) p.visual?.setDistance(p.pos.distanceTo(this.camera.position), false);
    if (this.disposed) return;

    window.addEventListener('keydown', this.onKey); window.addEventListener('keyup', this.onKeyUp);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.container);
    this.state = 'countdown'; this.countdown = 4;
    this.running = true;
    this.cb.onReady();
    // Wait one browser paint after hiding the loading overlay so frame 1 dt is smooth & unstalled
    requestAnimationFrame(t0 => {
      if (this.disposed) return;
      this.lastT = t0;
      this.raf = requestAnimationFrame(this.loop);
    });
  }

  private computePixelRatio(w: number, h: number) {
    const gfx = this.profile.gfx;
    const raw = Math.min(window.devicePixelRatio || 1, 2) * gfx.renderScale;
    // Cap max pixel throughput to ~4.2M px (≈2720×1530) unless user explicitly pushed renderScale > 1.05
    const maxPx = gfx.renderScale > 1.05 ? 8_300_000 : 4_200_000;
    const px = w * h * raw * raw;
    return px > maxPx ? raw * Math.sqrt(maxPx / px) : raw;
  }

  createPods() {
    const prof = this.profile; const diff = DIFFICULTIES[prof.race.difficulty];
    const playerDef = PODS.find(p => p.id === prof.podId) ?? PODS[0];
    const n = Math.min(MAX_OPPONENTS, prof.race.opponents);
    const list = [{ def: playerDef, isPlayer: true }];
    for (const def of pickRivals(playerDef.id, n)) list.push({ def, isPlayer: false }); // Session 20: drawn afresh for every race from all other pods
    const playerGrid = Math.min(n, Math.floor(n * 0.6));
    const order = list.slice(1); order.splice(playerGrid, 0, list[0]);
    const S = this.td.main.samples; const N = this.td.N;
    order.forEach((e, g) => {
      const row = Math.floor(g / 3), col = g % 3;
      let idx = this.td.startIdx - 6 - row * 13; // Session 16: 26 m between grid rows (pods are up to 22 m long)
      idx = this.td.main.closed ? ((idx % N) + N) % N : Math.max(0, idx);
      const s = S[idx]; const lat = (col - 1) * s.hw * 0.55;
      const pilot = PILOTS.find(p => p.id === e.def.pilotId) ?? PILOTS[0];
      const custom = e.isPlayer ? prof.custom[e.def.id] : undefined;
      const colors = custom ? custom.colors : e.def.colors;
      const geo = this.profile.gfx.geometry;
      // player: saved paint, Style-Teile and the Tuning-Teile of the tuning steps · Gegner: paint pattern and Style-Teile by grid slot (look only)
      const podOpts = e.isPlayer ? { pattern: custom?.pattern, finish: custom?.finish, kit: custom?.kit, tune: custom?.tuning } : { pattern: (g + 1) % 6, kit: rivalKit(g * 31 + e.def.id.length * 7 + e.def.id.charCodeAt(0)) };
      const vis = buildPodModel(e.def, colors, geo, this.profile.gfx.texRes, !e.isPlayer, podOpts);
      this.scene.add(vis.group);
      const eLat = Math.min(1, Math.abs(lat) / s.hw);
      const gY = s.y - lat * s.bank + (1 - eLat * eLat) * 0.2 + 0.08;
      const pos = new THREE.Vector3(s.x + s.rx * lat, gY + HOVER, s.z + s.rz * lat);
      const skill = diff.skill * (0.7 + 0.3 * pilot.skill);
      const pod: PodState = {
        id: g, isPlayer: e.isPlayer, def: e.def, pilot, stats: effectiveStats(e.def.id, custom),
        name: e.isPlayer ? 'Du' : pilot.name, color: e.isPlayer ? '#ffffff' : pilot.color,
        pos, vel: new THREE.Vector3(), yaw: Math.atan2(s.tx, s.tz), yawRate: 0, steer: 0,
        path: 0, idx, lat, grounded: true, zeroG: false, air: 0, groundY: gY, prevGroundY: gY,
        engYL: 0, engYR: 0, engVL: 0, engVR: 0, engPL: 0, engPR: 0,
        input: { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false, repair: false },
        hpL: 100, hpR: 100, heat: 0, boosting: false, overheat: false, repairing: false, airbraking: false,
        lap: 0, passedMid: true, rel: 0, prog: 0, finished: false, finishTime: 0, lapStart: 0, lapTimes: [],
        dead: 0, invuln: 0, lastSafePath: 0, lastSafeIdx: idx, wrongWay: 0, roll: 0, pitch: 0, shake: 0, events: [], visual: vis,
        ai: e.isPlayer ? null : { skill, speedF: diff.speed * (0.93 + 0.09 * pilot.skill), lineOff: Math.random() * 2 - 1, takeShortcut: Math.random() < skill * 0.75, boostUntil: 0, repairMode: false, noiseT: Math.random() * 100, rubber: 1, gridLat: lat },
        place: g + 1,
      };
      const rel = ((idx - this.td.startIdx) % N + N) % N;
      if (this.td.main.closed) { pod.rel = rel; pod.lap = rel > N / 2 ? -1 : 0; pod.prog = pod.lap * N + rel; }
      else { pod.rel = idx - this.td.startIdx; pod.prog = pod.rel; }
      this.pods.push(pod);
      if (e.isPlayer) this.player = pod;
    });
  }

  onKey = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (this.keymap.view.includes(e.code)) this.cycleCamera();
    if (e.code === 'Escape' || e.code === 'KeyP') this.setPaused(!this.paused);
    if (!this.paused) this.audio?.resume(); // (was unconditional: pressing Esc suspended the audio and resumed it right away)
  };
  onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  cycleCamera() { this.camMode = (this.camMode + 1) % CAMERA_NAMES.length; this.camInit = false; this.showMsg(CAMERA_NAMES[this.camMode], 1.2); }
  showMsg(m: string, t = 2) { this.message = m; this.messageT = t; }

  setPaused(p: boolean) {
    if (this.state === 'loading' || this.state === 'post' && this.finishShown) return;
    this.paused = p; this.cb.onPause(p);
    if (p) this.audio?.suspend(); else { this.audio?.resume(); this.lastT = performance.now(); }
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(this.computePixelRatio(w, h));
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post?.setSize(w * pr, h * pr); this.particles?.setScale(h * pr);
  }

  readInput() {
    const k = this.keys; const inp = this.player.input;
    // Session 10 layout: WASD drive · Space air brake / slide · Shift boost · arrows = attitude (←/→ 90° roll, ↑ dive, ↓ lift)
    const km = this.keymap; const on = (a: Action) => { const c = km[a]; for (let i = 0; i < c.length; i++) if (k.has(c[i])) return 1; return 0; };
    let steer = on('right') - on('left');
    let throttle = on('thrust');
    let brake = on('brake');
    let boost = on('boost') === 1;
    let airbrake = on('airbrake') === 1;
    let repair = on('repair') === 1;
    let roll = on('rollRight') - on('rollLeft');
    let pitch = on('pitchUp') - on('pitchDown');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      // Session 16: rebindable gamepad mapping (keymap.ts → PadMap); analog triggers / sticks stay analog
      const pm = this.padmap, pv = (a: Action) => padValue(gp, pm[a]);
      const st = pv('right') - pv('left'); if (Math.abs(st) > 0.02) steer = st;
      throttle = Math.max(throttle, pv('thrust')); brake = Math.max(brake, pv('brake'));
      if (pv('boost') > 0.5) boost = true; if (pv('airbrake') > 0.5) airbrake = true; if (pv('repair') > 0.5) repair = true;
      const rl = pv('rollRight') - pv('rollLeft'); if (Math.abs(rl) > 0.02) roll = rl;
      const pt = pv('pitchUp') - pv('pitchDown'); if (Math.abs(pt) > 0.02) pitch = pt;
      const cam = pv('view') > 0.5; if (cam && !this.prevCamBtn) this.cycleCamera(); this.prevCamBtn = cam;
      if (gp.buttons[9]?.pressed && !this.paused) this.setPaused(true);
      break;
    }
    inp.steer = steer; inp.throttle = throttle; inp.brake = brake; inp.boost = boost; inp.airbrake = airbrake; inp.repair = repair; inp.pitch = pitch; inp.roll = roll;
  }

  loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) return;
    let dt = (now - this.lastT) / 1000; this.lastT = now;
    dt = Math.min(dt, 0.05);
    this.fpsAcc += dt; this.fpsCount++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsCount / this.fpsAcc); this.fpsAcc = 0; this.fpsCount = 0; }
    this.update(dt);
    this.render(dt);
  };

  update(dt: number) {
    this.clock += dt;
    const frozen = this.state === 'countdown';
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.lastBeep && c <= 3 && c >= 1) { this.audio.beep(440, 0.25, 'square', 0.25); this.lastBeep = c; }
      if (this.countdown <= 0) { this.state = 'race'; this.audio.beep(880, 0.6, 'square', 0.3); this.showMsg('LOS!', 1.2); for (const p of this.pods) p.lapStart = 0; }
    } else this.raceTime += dt;

    if (this.player.finished || this.state === 'post') { if (!this.player.ai) this.player.ai = { skill: 0.9, speedF: 0.9, lineOff: 0, takeShortcut: false, boostUntil: 0, repairMode: false, noiseT: 0, rubber: 1 }; }
    else this.readInput();
    for (const p of this.pods) {
      if (p.ai && (!p.isPlayer || p.finished)) aiInputs(p, this.td, this.pods, this.raceTime, p.isPlayer ? null : this.player);
      if (frozen) p.input.boost = false;
    }
    // physics substeps
    this.acc += dt; const h = 1 / 120; let steps = 0;
    while (this.acc >= h && steps < 6) {
      for (const p of this.pods) stepPod(p, this.td, h, this.raceTime, this.gripMul, frozen, this.heatMul);
      this.podCollisions();
      this.acc -= h; steps++;
    }
    if (this.acc > h * 2) this.acc = 0; // prevent spiral-of-death after tab switch

    // hazards
    for (const hz of this.td.hazards) {
      const ph = (((this.raceTime + hz.phase) % hz.period) + hz.period) % hz.period;
      hz.state = frozen ? 0 : ph < hz.period * hz.duty ? 1 : ph > hz.period - 1 ? 0.5 : 0;
      if (hz.state < 1) continue;
      for (const p of this.pods) {
        if (p.dead > 0) continue;
        const dx = p.pos.x - hz.x, dz = p.pos.z - hz.z;
        if (dx * dx + dz * dz > hz.r ** 2 || p.pos.y > hz.y + 18) continue;
        const P = podParams(p);
        if (p.invuln <= 0) applyDamage(p, 'both', 12 * dt * P.sturdy, 'heat');
        p.heat = Math.min(1, p.heat + 0.55 * dt); p.vel.y += 28 * dt; p.shake = Math.min(1, p.shake + dt * 1.5);
        if (p.isPlayer && this.messageT <= 0) this.showMsg(this.td.def.theme === 'lava' ? 'LAVA-SCHLOT!' : 'GEYSIR!', 0.8);
      }
    }
    // set pieces
    for (const f of this.world.setPieces.update(this.clock, this.raceTime, this.pods, dt, frozen)) {
      const d = Math.hypot(f.x - this.player.pos.x, f.z - this.player.pos.z);
      if (f.type === 'dust') {
        if (d < 340) this.particles.dust(this.tmpV.set(f.x, f.y, f.z), ZERO, this.dustCol, 18);
        if (d < 140) { this.player.shake = Math.min(1, this.player.shake + 0.55 * (1 - d / 140)); this.audio.hit(34 * (1 - d / 140)); }
      } else if (f.type === 'slam') {
        if (d < 165) { this.player.shake = Math.min(1, this.player.shake + 0.25 * (1 - d / 165)); this.audio.gateSlam(1 - d / 165); }
      } else if (f.type === 'ice') {
        if (d < 380) this.particles.dust(this.tmpV.set(f.x, f.y, f.z), ZERO, C_ICE, 22);
        if (d < 600) this.showMsg('EISBRUCH!', 2);
      } else if (f.type === 'collapse' && d < 600) this.showMsg('STEINSCHLAG!', 2);
    }
    // deaths / finish
    for (const p of this.pods) {
      if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) { respawn(p, this.td); p.visual?.clearMarks?.(); } } // a respawned pod is patched up: parts back, hit marks gone
      if (!p.finished && this.state !== 'countdown') {
        const done = this.td.main.closed ? p.lap >= this.profile.race.laps : p.rel >= this.td.finishIdx - this.td.startIdx;
        if (done) {
          p.finished = true; p.finishTime = this.raceTime;
          if (!this.td.main.closed) p.lapTimes.push(this.raceTime);
          if (p.isPlayer) { this.state = 'post'; this.postTimer = 0; const place = this.pods.filter(q => q.finished).length; this.showMsg(place === 1 ? 'SIEG!' : `ZIEL – Platz ${place}`, 5); this.audio.beep(660, 0.8, 'triangle', 0.3); }
        }
      }
      if (p.isPlayer && this.td.main.closed && p.lapTimes.length && p.lapTimes.length !== (p as unknown as { _lt?: number })._lt) {
        (p as unknown as { _lt?: number })._lt = p.lapTimes.length;
        if (!p.finished) this.showMsg(p.lap === this.profile.race.laps - 1 ? 'LETZTE RUNDE!' : `Runde ${p.lap + 1}`, 2);
      }
    }
    // standings (in-place place calculation without cloning array unless finishing/HUD)
    let playerRank = 1;
    for (let i = 0; i < this.pods.length; i++) {
      const q = this.pods[i]; if (q === this.player) continue;
      const ahead = (q.finished && this.player.finished) ? q.finishTime < this.player.finishTime : q.finished ? true : this.player.finished ? false : q.prog > this.player.prog;
      if (ahead) playerRank++;
    }
    this.player.place = playerRank;

    if (this.state === 'post') {
      this.postTimer += dt;
      const allDone = this.pods.every(p => p.finished);
      if (!this.finishShown && (this.postTimer > 6 || (allDone && this.postTimer > 3))) {
        this.finishShown = true;
        const sorted = [...this.pods].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog);
        sorted.forEach((p, i) => (p.place = i + 1));
        this.cb.onFinish(this.results(sorted));
      }
    }

    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.updateLights();
    this.particles.update(dt, this.camera.position, this.clock); this.debris.update(dt); this.scrap.update(dt);
    this.world.update(this.clock, this.camera.position, this.pods);
    this.sky.uniforms.time.value = this.clock;
    this.weather.update(dt, this.clock, this.camera, this.state === 'countdown', v => this.audio.thunder(v), near => { if (near > 0.5) this.player.shake = Math.min(1, this.player.shake + (near - 0.5) * 0.9); });
    { const pl = this.player, ps = this.td.paths[pl.path].samples[pl.idx]; this.cover += ((ps && ps.roof > 0 && !pl.upper ? 1 : 0) - this.cover) * Math.min(1, dt * 5); this.particles.setAmbientFade(1 - this.cover); }
    this.applyEnv(dt);
    if (this.env.wind > 0.6 && this.cover < 0.5 && this.state === 'race') this.player.shake = Math.max(this.player.shake, this.weather.gust * (this.env.wind - 0.5) * 0.22); // storm gusts buffet the pod
    if (this.post) this.post.lens.rain.value = this.wxQ > 0 ? this.env.rain * (1 - this.cover) : 0;
    if (this.messageT > 0) this.messageT -= dt;
    this.flash = Math.max(0, this.flash - dt * 2);

    // audio
    const pp = this.player.pos;
    let nd = 1e9, os = 0, pack = 0, rvx = 0, rvz = 0;
    for (const p of this.pods) if (p !== this.player && p.dead <= 0) { const d = p.pos.distanceTo(pp); if (d < 70) pack++; if (d < nd) { nd = d; os = Math.hypot(p.vel.x, p.vel.z); rvx = p.vel.x; rvz = p.vel.z; } }
    { // rival audio: Doppler from the closing speed, pack rumble, fly-by whoosh when a pod shoots past within 17 m
      const cl = dt > 1e-4 && this.prevNd < 1e8 && nd < 1e8 ? Math.max(-80, Math.min(80, (this.prevNd - nd) / dt)) : 0;
      this.closing += (cl - this.closing) * Math.min(1, dt * 6); this.prevNd = nd; this.audio.setRivals(this.closing, pack);
      if (nd < 17 && this.clock > this.flybyT) { const rel = Math.hypot(rvx - this.player.vel.x, rvz - this.player.vel.z); if (rel > 9) { this.audio.flyby(Math.min(1, rel / 38) * (1 - nd / 24)); this.flybyT = this.clock + 1.4; } }
    }
    let geyserW = 0, rotorW = 0, rotorHz = 2;
    for (const hz of this.td.hazards) {
      if (hz.state <= 0) continue;
      const d = Math.hypot(hz.x - pp.x, hz.z - pp.z);
      if (d < 130) geyserW = Math.max(geyserW, (1 - d / 130) * (hz.state >= 1 ? 1 : 0.35));
    }
    for (const cs of this.world.cascades) {
      const d = Math.hypot(cs.x - pp.x, cs.z - pp.z);
      if (d < 135) geyserW = Math.max(geyserW, (1 - d / 135) * 0.72);
    }
    for (const sp of this.td.setPieces) {
      if (sp.type !== 'rotor' && sp.type !== 'bridge') continue;
      const d = Math.hypot(sp.x - pp.x, sp.z - pp.z);
      if (d < 145) {
        const w = 1 - d / 145;
        if (w > rotorW) { rotorW = w; rotorHz = sp.type === 'rotor' ? (Math.abs(sp.speed) * sp.arms) / (Math.PI * 2) * 2.2 : 1.4; }
      }
    }
    this.world.nearAudio(pp, this.lifeAudio);
    const wa = this.worldAudio;
    wa.themeId = this.td.def.theme; wa.geyser = geyserW; wa.rotor = rotorW; wa.rotorHz = rotorHz;
    wa.bird = this.lifeAudio.bird; wa.herd = this.lifeAudio.herd; wa.crawler = this.lifeAudio.crawler;
    {
      const pl = this.player, ps = this.td.paths[pl.path].samples[pl.idx];
      const enc = ps ? (ps.roof > 0 ? 1 : (ps.hL > 0 ? 0.35 : 0) + (ps.hR > 0 ? 0.35 : 0)) : 0; // tunnel / canyon walls → slap-back echo
      this.audio.setEnv(pl.sliding ? 1 : 0, enc, this.env.rain * (1 - 0.85 * this.cover), Math.min(1, this.env.wind * (0.55 + 0.45 * this.weather.gust) + (this.env.gust !== 'none' ? 0.15 : 0)));
      const rc = Math.abs(pl.rollCtl ?? 0); if (rc > 0.5 && this.prevRoll <= 0.5) this.audio.whoosh(); this.prevRoll = rc;
    }
    this.audio.update(Math.hypot(this.player.vel.x, this.player.vel.z), this.player.input.throttle, this.player.boosting, nd, os, wa, dt);

    this.hudTimer += dt;
    if (this.hudTimer > 0.085) { this.hudTimer = 0; this.cb.onHud(this.hud()); }
    this.mapTimer += dt;
    if (this.mapTimer > 0.065) { this.mapTimer = 0; this.drawMinimap(); }
  }

  podCollisions() { collidePods(this.pods, this.raceTime); }

  updateVisuals(dt = 0.016) {
    this.particles.setFrameDt(dt);
    const camPos = this.camera.position;
    // Session 16 – zero-G: drifting star dust in the tube streaks past the camera (sense of speed and of floating)
    { const pl = this.player;
      if (pl.zeroG && dt > 0) {
        const path = this.td.paths[pl.path], S = path.samples;
        for (let i = 0; i < 4; i++) {
          let k = pl.idx + 12 + Math.floor(Math.random() * 60); k = path.closed ? k % S.length : Math.min(S.length - 1, k);
          const s = S[k], a = Math.random() * Math.PI * 2, r = (0.25 + Math.random() * 0.75) * (s.hw + 0.5);
          this.particles.add.spawn(this.tmpV.set(s.x + s.rx * Math.cos(a) * r, s.y + 7 + Math.sin(a) * r * 0.8, s.z + s.rz * Math.cos(a) * r), ZERO, 1.1, 0.2, 0.2, this.barrierGlow, this.barrierGlow, 0.6, 0, 0);
        }
      }
    }
    // rain drops bursting on the road ahead of the player (count follows the rain intensity)
    if (this.env.rain > 0.08 && dt > 0 && this.wxQ > 0 && this.cover < 0.5) {
      const pl = this.player, path = this.td.paths[pl.path], S = path.samples, n = Math.round(this.env.rain * 20 * this.wxQ * Math.min(1.2, this.particles.amount) * this.particles.rateScale + Math.random());
      for (let i = 0; i < n; i++) {
        let k = pl.idx - 3 + Math.floor(Math.random() * 46); k = path.closed ? ((k % S.length) + S.length) % S.length : Math.max(0, Math.min(S.length - 1, k));
        const s = S[k]; if (s.gap || s.roof > 0) continue; const lat = (Math.random() * 2 - 1) * s.hw, x = s.x + s.rx * lat, z = s.z + s.rz * lat;
        this.particles.splash(this.tmpV.set(x, roadSurfaceAt(path, k, x, z).y + 0.07, z));
      }
    }
    for (let i = 0; i < this.world.emitters.length; i++) {
      const e = this.world.emitters[i];
      const dx = e.x - camPos.x, dz = e.z - camPos.z;
      if (dx * dx + dz * dz < 420 * 420) this.particles.vent(this.tmpV.set(e.x, e.y, e.z), e.type);
    }
    for (let i = 0; i < this.td.hazards.length; i++) {
      const hz = this.td.hazards[i]; if (hz.state <= 0) continue;
      const dx = hz.x - camPos.x, dz = hz.z - camPos.z; if (dx * dx + dz * dz > 320 * 320) continue;
      if (hz.state >= 1) {
        for (let k = 0; k < 2; k++) this.particles.fire(this.tmpV.set(hz.x + (Math.random() - 0.5) * hz.r, hz.y + 0.5, hz.z + (Math.random() - 0.5) * hz.r), this.tmpV2.set(0, 60, 0));
        if (Math.random() < 0.25) this.particles.smoke(this.tmpV.set(hz.x, hz.y + 4, hz.z), this.tmpV2.set(0, 20, 0), 0.6);
      } else if (Math.random() < 0.2) this.particles.sparks(this.tmpV.set(hz.x, hz.y + 0.4, hz.z), UP, ZERO, 2);
    }

    for (let pi = 0; pi < this.pods.length; pi++) {
      const p = this.pods[pi]; const v = p.visual!;
      const dist = p.pos.distanceTo(camPos);
      const near = dist < 340;
      for (let ei = 0; ei < p.events.length; ei++) {
        const e = p.events[ei];
        this.tmpV.set(e.x, e.y, e.z);
        if (e.type === 'wall' || e.type === 'obstacle' || e.type === 'pod') {
          if (near) {
            this.particles.sparks(this.tmpV, this.tmpV2.set(e.nx, 0.3, e.nz), p.vel, 8 + e.strength * 0.8);
            if (e.type === 'wall') this.world.flashField(e.x, e.y + 0.6, e.z, e.strength);
          }
          if (p.isPlayer || dist < 140) this.audio.hit(e.strength * (p.isPlayer ? 1 : 0.28));
          if (p.isPlayer && e.strength > 5 && v.hitMark) { // Treffermarke where the hit landed (this step's pose: the model still stands where it was last frame)
            worldToBody(p, v.body.position.z, this.tmpV2.set(e.x, e.y, e.z)); v.hitMark(this.tmpV2.x, this.tmpV2.y, this.tmpV2.z, e.strength);
          }
        } else if (e.type === 'break') {
          if (e.ref) this.world.breakObstacle(e.ref);
          if (dist < 420) { this.tmpC.copy(this.dustBase).multiplyScalar(0.6); this.particles.debris(this.tmpV, p.vel, this.tmpC); this.debris.spawn(e.x, e.y, e.z, e.y, p.vel, this.tmpC, e.strength, 16); }
          if (p.isPlayer || dist < 130) this.audio.hit(34 * (p.isPlayer ? 1 : 0.4));
        } else if (e.type === 'land') { if (near) this.particles.dust(this.tmpV, p.vel, this.dustCol, 8); if (p.isPlayer) this.audio.hit(e.strength * 0.5); }
        else if (e.type === 'explode') {
          if (dist < 480) { // the pod flies apart in its own colours
            this.particles.explosion(this.tmpV); const cols = p.isPlayer ? this.profile.custom[p.def.id].colors : p.def.colors;
            this.scrap.spawn(e.x, e.y, e.z, p.groundY, p.vel, this.tmpC.set(cols[0]), 2.6, 9); this.scrap.spawn(e.x, e.y, e.z, p.groundY, p.vel, this.tmpC.set(cols[1]), 2.6, 7);
          }
          if (p.isPlayer) { this.audio.boom(); this.flash = 0.8; this.showMsg('TRIEBWERK ZERSTÖRT!', 2.5); } else if (near) this.audio.hit(40);
        }
        else if (e.type === 'field') {
          if (near) {
            this.particles.shimmer(this.tmpV, this.tmpV2.set(e.nx, 0, e.nz), this.barrierGlow);
            this.world.flashField(e.x, e.y, e.z, e.strength * 1.4);
          }
          if (p.isPlayer) this.audio.fieldZap(e.strength);
        } else if (e.type === 'fall' && p.isPlayer) this.showMsg('ABSTURZ!', 2);
        else if (e.type === 'part') { // a Bruchteil broke off: sparks where it sat, a hard knock, and the player is told which part
          v.setParts(p.parts ?? 0); bodyToWorld(p, v.body.position.z, v.partBody(e.part ?? 0, this.tmpV));
          if (p.isPlayer || dist < 120) { // sparks and a few plates in the pod's second colour where the part sat (Gegner: only close by)
            this.particles.sparks(this.tmpV, UP, p.vel, 14);
            this.scrap.spawn(this.tmpV.x, this.tmpV.y, this.tmpV.z, p.groundY, p.vel, this.tmpC.set((p.isPlayer ? this.profile.custom[p.def.id].colors : p.def.colors)[1]), 0.9, 4);
          }
          if (p.isPlayer) { this.audio.hit(48); this.audio.beep(196, 0.22, 'sawtooth', 0.16); p.shake = Math.min(1, p.shake + 0.35); this.showMsg(lostMessage(damageModel(p.def.id).parts[e.part ?? 0]), 2.2); }
          else if (dist < 120) this.audio.hit(18);
        }
      }
      p.events.length = 0;

      const alive = p.dead <= 0 && !(p.invuln > 0 && Math.floor(this.clock * 12) % 2 === 0);
      v.group.visible = alive && (p.isPlayer || dist < 520);
      if (!v.group.visible) continue;
      if (!p.isPlayer) v.setDistance(dist);
      v.group.position.copy(p.pos);
      v.group.rotation.set(0, p.yaw, 0);
      v.body.rotation.set(p.pitch, 0, p.roll);
      const eyL = p.engYL ?? 0, eyR = p.engYR ?? 0;
      v.setEngineMotion(eyL, eyR, 0, 0, 0); // engines lift as a whole – no extra tilt
      v.setCockpitSway?.(p.ckX ?? 0, p.ckY ?? 0, p.ckZ ?? 0);
      v.setParts(p.parts ?? 0); // lost Bruchteile are gone from the model (all of them return on respawn)
      v.update(this.clock, p.input.throttle, p.boosting ? 1 : 0, p.airbraking ? 1 : 0, p.hpL / 100, p.hpR / 100, p.heat + (p.overT ?? 0) / 3 * 0.25); // overdrive pushes the glow past the limit (yellow-white)

      // Skip exhaust/dust particle spawning while stationary on countdown grid; keep rival trails super clean for visibility!
      if (this.state === 'countdown') continue;
      const emitScale = p.isPlayer ? 0.85 : (dist > 16 && dist < 68) ? (1 - dist / 68) * 0.22 : 0;
      if (emitScale <= 0.02) continue;
      const back = this.tmpV2.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const glowHex = p.isPlayer ? this.profile.custom[p.def.id].colors[2] : p.def.colors[2];
      this.tmpC.set(glowHex).multiplyScalar(0.88);
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), bz = v.body.position.z;
      const rivalVis = p.isPlayer ? 1 : 0.32;
      for (let i = 0; i < v.exhaustLocal.length; i++) {
        const loc = v.exhaustLocal[i]; const lz = loc.z + bz;
        const eLift = loc.x < 0 ? eyL : eyR;
        this.tmpV3.set(p.pos.x + loc.x * cy + lz * sy, p.pos.y + (loc.y + eLift) * Math.cos(p.roll) + loc.x * Math.sin(p.roll) - lz * p.pitch, p.pos.z - loc.x * sy + lz * cy);
        if (v.engineOut[i]) { if (p.isPlayer || dist < 160) this.particles.smoke(this.tmpV3, p.vel, 0.85, rivalVis); continue; } // a flamed-out engine only trails smoke
        this.particles.exhaust(this.tmpV3, back, p.vel, this.tmpC, p.input.throttle, p.boosting ? 1 : 0, emitScale);
        // close to the heat limit the engines spit sparks (more while overdriving)
        if (p.heat > 0.86 && (p.isPlayer || dist < 160) && this.particles.chance((p.heat - 0.86) * 4 + (p.overT ?? 0) * 0.5)) this.particles.sparks(this.tmpV3, back, p.vel, 3);
        const hp = loc.x < 0 ? p.hpL : p.hpR;
        if (hp < 40 && (p.isPlayer || (i < 2 && dist > 22))) this.particles.smoke(this.tmpV3, p.vel, 1 - hp / 40, rivalVis);
        if ((hp < 20 || p.overheat) && (p.isPlayer || i < 2)) this.particles.fire(this.tmpV3, p.vel, rivalVis);
      }
      const sp = Math.hypot(p.vel.x, p.vel.z);
      // Every pod drags two dust wakes from under its engines (spray on a wet road); denser and longer with speed.
      // Session 17: the PLAYER's wakes start under the engines (≥ 15 m ahead of the chase camera) and drift outwards, so they pass left and
      // right of the cockpit and are actually visible; rivals closer than 24 m ahead of the camera keep only a hint.
      if (p.grounded && sp > 16 && p.pos.y - p.groundY < HOVER + 2.2 && (p.isPlayer || dist < 260)) {
        const smp = this.td.paths[p.path].samples[p.idx];
        const wet = this.envBuild.rainRoad && this.wet > 0.3 && this.wxQ > 0 && !(smp && smp.roof > 0 && !p.upper); // dry inside tunnels
        const envP = podEnvelope(p.def), cyD = Math.cos(p.yaw), syD = Math.sin(p.yaw);
        const near = !p.isPlayer && dist < 24 ? 0.3 : 1, aD = (p.isPlayer ? 0.42 : 0.36) * near * this.dustAmt;
        this.tmpC.copy(this.dustCol).lerp(WHITE_C, 0.3); // a little lighter than the ground, otherwise the wake is invisible on its own surface
        const sfw = surfaceOf(smp?.surf), wk = sfw.liquid && sfw.liquid !== 'lava' && sfw.liquid !== 'methane' ? 'spray' : sfw.wake === 'spray' ? 'dust' : sfw.wake, wkCol = this.wakeColor(sfw);
        for (const e of [envP.engL, envP.engR]) {
          const lz = p.isPlayer ? (e.frontZ + e.backZ) * 0.5 : e.backZ - 1.2, lx = e.outerX * 1.1, sg = e.x < 0 ? -1 : 1;
          this.tmpV.set(p.pos.x + lx * cyD + lz * syD, p.groundY + 0.25, p.pos.z - lx * syD + lz * cyD);
          this.tmpV2.set(p.vel.x + cyD * sg * 11, 0, p.vel.z - syD * sg * 11); // slight outward drift: the wakes pass left and right of the cockpit
          // Session 20: the wake shows what the pod is flying over – white spray on lakes, coloured dust on sand / snow / ash / mud,
          // glowing embers over lava, next to nothing on bare ice and metal decks
          if (wet || wk === 'spray') this.particles.spray(this.tmpV, this.tmpV2, sp, (wet ? this.wet : 0.9) * (p.isPlayer ? 1 : 0.85) * near);
          else if (wk !== 'none') {
            this.particles.trail(this.tmpV, this.tmpV2, wkCol ?? this.tmpC, sp, wkCol ? aD / Math.max(0.35, this.dustAmt) : aD);
            if (wk === 'embers' && this.particles.chance(0.22)) this.particles.sparks(this.tmpV, UP, p.vel, 2);
          }
        }
      }
      // Slide plume: the rear steps out and throws ground material (or spray) sideways + a few skid sparks
      if (p.sliding && (p.isPlayer || (dist > 24 && dist < 120))) {
        this.particles.dust(this.tmpV.set(p.pos.x - Math.sin(p.yaw) * 3, p.groundY + 0.2, p.pos.z - Math.cos(p.yaw) * 3), p.vel, this.dustCol, 2, p.isPlayer ? 1.6 : 0.6);
        if (p.isPlayer && this.particles.chance(0.45)) this.particles.sparks(this.tmpV.set(p.pos.x, p.groundY + 0.3, p.pos.z), UP, p.vel, 2);
      }
      // Knife-edge roll: thin vapour ribbons off the upper/lower engine at speed
      const rk = Math.abs(p.rollCtl ?? 0);
      if (rk > 0.55 && sp > 60 && (p.isPlayer || dist < 140) && this.particles.chance(0.9)) {
        this.tmpC.set('#dfe8f0'); this.tmpV2.copy(p.vel).multiplyScalar(0.25);
        for (const sgn of [-1, 1]) this.particles.alpha.spawn(this.tmpV.set(p.pos.x, p.pos.y + sgn * 2.6 * rk, p.pos.z), this.tmpV2, 0.45, 0.35, 1.5, this.tmpC, this.tmpC, p.isPlayer ? 0.1 : 0.05, 1.2, 0);
      }
      if (p.repairing && p.isPlayer && this.particles.chance(0.26)) {
        this.particles.sparks(this.tmpV.set(p.pos.x, p.pos.y + 0.9, p.pos.z), UP, p.vel, 3);
      }
    }
  }

  /** Graphics settings that take effect while the race is running (pause menu). The rest needs a restart of the race:
   *  texture resolution, geometry/detail density, tessellation, parallax, shader detail, bump mapping, batching, backend,
   *  cascaded shadows, screen-space reflections – they are baked into geometry, compiled materials or the
   *  render-target layout. */
  static readonly LIVE_GFX: (keyof GfxSettings)[] = ['fov', 'showFps', 'renderScale', 'lodBias', 'podDetail', 'weatherFx', 'preset',
    'bloom', 'bloomStrength', 'ao', 'godRays', 'motionBlur', 'cinematic', 'aa', 'lensFx', 'shadows', 'particles', 'drawDistance', 'volumetrics', 'anisotropy'];
  // (SSR is NOT live: it adds two render targets to the scene pass; pipelines compiled for the old attachment layout become invalid on WebGPU)
  private static readonly POST_KEYS: (keyof GfxSettings)[] = ['bloom', 'bloomStrength', 'ao', 'godRays', 'motionBlur', 'cinematic', 'aa', 'lensFx', 'weatherFx'];
  applyLiveGfx(g: GfxSettings, volume?: number) {
    const prev = this.profile.gfx; this.profile = { ...this.profile, gfx: g, volume: volume ?? this.profile.volume };
    if (volume !== undefined) this.audio?.setVolume(volume);
    if (!this.renderer || !this.world || !this.weather || !this.post) return;
    if (g.renderScale !== prev.renderScale) this.resize();
    this.world.setLodBias(g.lodBias ?? 1); setPodLodScale(g.podDetail ?? 1);
    this.wxQ = [0, 0.5, 1][g.weatherFx ?? 2] ?? 1; this.weather.quality = this.wxQ; this.envDirty = true; // also re-applies fog density (draw distance)
    if (g.particles !== prev.particles) this.particles.amount = g.particles;
    { const vq = g.volumetrics ?? 2; this.fog.hOn.value = vq > 0 ? 1 : 0; this.fog.bankOn.value = vq >= 2 ? 1 : 0; // fog layers + light cones
      if (vq > 0 && !this.beams && this.navLights) { this.beams = makeBeams(this.pods.length * 2); this.scene.add(this.beams.mesh); }
      if (this.beams) this.beams.mesh.userData.off = vq === 0; }
    if ((g.anisotropy ?? 8) !== (prev.anisotropy ?? 8)) setTextureAnisotropy(g.anisotropy ?? 8);
    if (g.shadows !== prev.shadows && !this.csm) { // sun shadows on/off + resolution (cascaded shadows stay as built)
      const on = g.shadows > 0, ms = [0, 1024, 1536, 2048][g.shadows] ?? 1536;
      this.renderer.shadowMap.enabled = on; this.sun.castShadow = on;
      if (ms) { this.sun.shadow.mapSize.set(ms, ms); this.shadowTexel = 192 / ms; this.sun.shadow.map?.dispose(); (this.sun.shadow as unknown as { map: unknown }).map = null; }
    }
    if (Game.POST_KEYS.some(k => g[k] !== prev[k])) { // rebuild the post-processing chain with the new options
      const old = this.post;
      this.post = new PostFX(this.renderer, this.scene, this.camera, { ...g, ssr: prev.ssr && g.ssr }, { rain: (g.weatherFx ?? 2) > 0 ? this.envBuild.maxRain : 0, flare: this.envBuild.flare });
      old.dispose(); // no async warm-up here: it would interleave with running frames and compile pipelines for the wrong target layout
    }
  }

  /** Sun / moon direction: sky, fog scattering, shadow basis, second sun of the desert worlds. */
  setSunDir(x: number, y: number, z: number) {
    const d = this.sunDir; if (Math.abs(d.x - x) + Math.abs(d.y - y) + Math.abs(d.z - z) < 1e-5) return;
    d.set(x, y, z).normalize();
    this.sunRight.crossVectors(UP, d).normalize(); if (this.sunRight.lengthSq() < 1e-4) this.sunRight.set(1, 0, 0);
    this.sunUp.crossVectors(d, this.sunRight).normalize();
    const U = this.sky.uniforms; U.sunDir.value.copy(d); this.fog.sunDir.value.copy(d);
    const el = Math.asin(d.y) - 2.5 * Math.PI / 180, az = Math.atan2(d.x, d.z) + 7 * Math.PI / 180;
    U.sunDir2.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    if (!this.sun.castShadow) this.sun.position.copy(this.sun.target.position).addScaledVector(d, 360);
  }

  /** Applies the environment timeline (time of day × weather) for the current race time: sky, fog, lights, exposure, rain,
   *  lightning, wind, grip, particle density, road wetness (with soak/dry lag) and the lightning flash. `snapWet` skips the lag. */
  applyEnv(dt: number, snapWet = false) {
    const tl = this.tl, e = this.env, b = this.envBuild;
    if (tl.dynamic || !this.envInit || this.envDirty) {
      this.envDirty = false;
      const s = tl.eval(this.raceTime), U = this.sky.uniforms, S = THREE.SRGBColorSpace;
      U.top.value.setRGB(s.top[0], s.top[1], s.top[2], S); U.horizon.value.setRGB(s.hor[0], s.hor[1], s.hor[2], S); U.sunColor.value.setRGB(s.sun[0], s.sun[1], s.sun[2], S);
      U.clouds.value = s.clouds; U.stars.value = s.stars; U.cloudLit.value = s.lit;
      this.fog.color.value.setRGB(s.fog[0], s.fog[1], s.fog[2], S); this.fog.sunColor.value.setRGB(s.sun[0], s.sun[1], s.sun[2], S);
      this.fog.density.value = s.dens / this.profile.gfx.drawDistance; this.fog.volFog.value = s.volFog;
      this.sun.color.setRGB(s.sun[0], s.sun[1], s.sun[2], S); this.sunBaseI = s.sunI;
      this.hemi.color.setRGB(s.hemiS[0], s.hemiS[1], s.hemiS[2], S); this.hemi.groundColor.setRGB(s.hemiG[0], s.hemiG[1], s.hemiG[2], S);
      this.renderer.toneMappingExposure = s.exp; this.envI = 0.85 * Math.max(0.05, Math.min(1.3, s.lum / this.envLum));
      this.setSunDir(s.dir[0], s.dir[1], s.dir[2]);
      e.rain = s.rain; e.lightning = s.lightning; e.wind = s.wind; e.flare = s.flare; e.dark = s.dark; e.gustAmt = s.gustAmt; e.volFog = s.volFog; e.grip = s.grip;
      this.gripMul = this.baseGrip * s.grip; e.heat = s.heat; this.heatMul = s.heat;
      if (this.post) { this.post.lens.rain.value = s.rain; this.post.lens.sunColor?.value.setRGB(s.sun[0], s.sun[1], s.sun[2], S); }
      this.particles?.setAmbientAmount(s.amb / b.ambMax * this.wxQ);
      this.wetTarget = b.rainRoad ? s.wet : 1;
      const k = Math.max(0, Math.min(1, (s.rain - 0.1) / 0.3));
      this.dustCol.copy(this.dustBase).lerp(this.tmpC.set('#c9d6e0'), k * 0.75).multiplyScalar(1 - 0.55 * s.dark);
      this.lightLevel = Math.max(0, Math.min(1, (s.dark - 0.35) / 0.2));
      if (this.envInit && this.state === 'race' && this.messageT <= 0) {
        if (s.sev > 0.45 && this.sevPrev <= 0.45) this.showMsg(e.gust === 'dust' ? 'STURM ZIEHT AUF' : e.gust === 'snow' ? 'SCHNEESTURM ZIEHT AUF' : 'UNWETTER ZIEHT AUF', 2.4);
        else if (s.sev < 0.3 && this.sevPrev >= 0.3) this.showMsg('ES KLART AUF', 2.2);
        else if (s.dark > 0.5 && this.darkPrev <= 0.5) this.showMsg('NACHT – LICHTER AN', 2.2);
        else if (s.dark < 0.4 && this.darkPrev >= 0.4) this.showMsg('TAGESANBRUCH', 2.2);
      }
      this.sevPrev = s.sev; this.darkPrev = s.dark;
      if (!this.envInit) { this.wet = this.wetTarget; this.envInit = true; }
    }
    if (b.rainRoad) { if (snapWet) this.wet = this.wetTarget; else this.wet += Math.max(-0.02 * dt, Math.min(0.085 * dt, this.wetTarget - this.wet)); } // soaks in ~12 s, dries in ~50 s
    WEATHER.wet.value = b.rainRoad ? this.wet : 1;
    const f = this.weather ? this.weather.flash : 0;
    this.sun.intensity = this.sunBaseI; this.hemi.intensity = 0.58 + f * 3.0; this.scene.environmentIntensity = this.envI + f * 1.1; this.sky.uniforms.flash.value = f;
  }

  /** Running lights (fade in with darkness): headlights with soft volumetric beams at both engine noses, wingtip markers, cockpit strobe.
   *  The player's lamp is a real spot light: it follows steering and pitch, brightens with boost and flickers on a damaged engine. */
  updateLights() {
    const im = this.navLights; if (!im) return;
    const lv = this.lightLevel, bm = this.beams, sl = this.headLamp;
    im.visible = lv > 0.01; if (bm) { bm.mesh.visible = lv > 0.01 && !bm.mesh.userData.off; bm.strength.value = lv; }
    if (lv <= 0.01) { if (sl) sl.intensity = 0; return; }
    const m = this.tmpM, q0 = this.tmpQ.identity(), pos = this.tmpV, sc = this.tmpV2, qb = this.tmpQ2; let n = 0, nb = 0;
    for (const p of this.pods) {
      const env = podEnvelope(p.def), dead = p.dead > 0;
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cr = Math.cos(p.roll), sr = Math.sin(p.roll);
      qb.setFromEuler(this.tmpE.set(p.pitch + 0.07, p.yaw, 0, 'YXZ'));
      const put = (lx: number, ly: number, lz: number, s: number, beam = false) => {
        const x = lx * cr - ly * sr, y = lx * sr + ly * cr - lz * p.pitch;
        pos.set(p.pos.x + x * cy + lz * sy, p.pos.y + y, p.pos.z - x * sy + lz * cy);
        m.compose(pos, q0, sc.setScalar(dead ? 0 : s * lv)); im.setMatrixAt(n++, m);
        if (beam && bm) { const hpS = lx < 0 ? p.hpL : p.hpR; m.compose(pos, qb, sc.setScalar(dead || hpS < 12 ? 0 : 1)); bm.mesh.setMatrixAt(nb++, m); }
      };
      const eL = env.engL, eR = env.engR, yL = (p.engYL ?? 0) + eL.axisY, yR = (p.engYR ?? 0) + eR.axisY; // nav lights sit on the (lowest) engine axis
      put(eL.x, yL, eL.frontZ + 0.15, 0.24, true); put(eR.x, yR, eR.frontZ + 0.15, 0.24, true);
      put(eL.outerX, yL, (eL.frontZ + eL.backZ) * 0.5, 0.18); put(eR.outerX, yR, (eR.frontZ + eR.backZ) * 0.5, 0.18);
      put(0, env.cockpit.topY, env.cockpit.z, ((this.clock * 1.3 + p.id * 0.37) % 1) < 0.16 ? 0.22 : 0);
    }
    im.instanceMatrix.needsUpdate = true; if (bm) bm.mesh.instanceMatrix.needsUpdate = true;
    const pl = this.player;
    if (sl) {
      const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw), rx = -fz, rz = fx, st = pl.steer * 9; // beam leads into the corner
      sl.position.set(pl.pos.x + fx * 6, pl.pos.y + 1.6, pl.pos.z + fz * 6);
      sl.target.position.set(pl.pos.x + fx * 36 + rx * st, Math.min(pl.groundY, pl.pos.y - 2.5) - pl.pitch * 14, pl.pos.z + fz * 36 + rz * st);
      const hurt = Math.min(pl.hpL, pl.hpR) < 35 ? (Math.sin(this.clock * 47) > 0.2 ? 1 : 0.35) : 1;
      sl.intensity = pl.dead > 0 ? 0 : 12000 * lv * (pl.boosting ? 1.2 : 1) * hurt;
    }
  }

  /** wake / dust colour of a ground surface (null = the world's default dust colour) */
  private wakeCols = new Map<string, THREE.Color | null>();
  private wakeColor(sf: SurfaceDef): THREE.Color | null {
    let c = this.wakeCols.get(sf.id);
    if (c === undefined) { const hex = sf.wakeColor ?? (sf.tex ? surfacePalette(this.td.def.theme, sf)[2] : null); c = hex ? new THREE.Color(hex) : null; this.wakeCols.set(sf.id, c); }
    return c;
  }

  /** HUD hint for the ground under the player */
  private surfaceHud(): { surface: string; surfaceFx: string } {
    const p = this.player, sf = surfaceOf(this.td.paths[p.path]?.samples[p.idx]?.surf);
    const fx = sf.grip <= 0.8 ? 'wenig Haftung' : sf.heat >= 1.25 ? 'Triebwerke heizen auf' : sf.vmax <= 0.95 ? 'bremst' : sf.grip < 0.95 ? 'rutschig' : '';
    return { surface: p.zeroG ? 'Schwerelos' : sf.name, surfaceFx: p.zeroG ? '' : fx };
  }

  updateCamera(dt: number) {
    const p = this.player; const cam = this.camera; const gfx = this.profile.gfx;
    p.visual?.setCockpitView?.(this.camMode === 2); // Session 20: the cockpit camera sits in the pilot's head and shows the cockpit from inside (see PodVisual.setCockpitView)
    const sp = Math.hypot(p.vel.x, p.vel.z); const vmax = podParams(p).vmax0; // (undamaged top speed: lost parts must not widen the view)
    let fov = gfx.fov + Math.min(1.3, sp / vmax) * 16 + (p.boosting ? 8 : 0) + (p.zeroG ? 8 : 0); // zero-G: wider view = more sense of speed
    const velYaw = sp > 8 ? Math.atan2(p.vel.x, p.vel.z) : p.yaw;
    let dy = velYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    const tgtYaw = p.yaw + dy * 0.45;
    if (!this.camInit) { this.camYaw = tgtYaw; this.camY = p.pos.y; this.camInit = true; }
    let d = tgtYaw - this.camYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.camYaw += d * Math.min(1, dt * 5.5);
    this.camY += (p.pos.y - this.camY) * Math.min(1, dt * (p.grounded ? 7 : 3.5));
    const shake = p.shake * 0.5 + Math.min(1, sp / 180) * 0.032 + (p.boosting ? 0.045 : 0);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const mode = this.camMode;
    if (mode === 0 || mode === 1) {
      const dist = (mode === 0 ? 13.5 : 24) + Math.min(5, sp * 0.02) - (p.boosting ? 1.5 : 0); const hgt = mode === 0 ? 4.5 : 7.6;
      cam.position.set(p.pos.x - fx * dist + sx, this.camY + hgt + sy, p.pos.z - fz * dist);
      const gy = p.zeroG ? -1e9 : this.world.heightAt(cam.position.x, cam.position.z);
      const S = this.td.paths[p.path].samples[p.idx];
      cam.position.y = Math.max(cam.position.y, Math.max(gy, S.gap ? -1e9 : S.y) + 2.2);
      if (S.roof > 0 && !p.upper) { // Session 20: the chase camera stays inside the tunnel vault (it used to poke through the ceiling near the walls)
        const P = this.td.paths[p.path], n = P.samples.length, back = Math.round(dist / DS);
        const cs = P.samples[P.closed ? ((p.idx - back) % n + n) % n : Math.max(0, p.idx - back)];
        if (cs.roof > 0) {
          let lat = (cam.position.x - cs.x) * cs.rx + (cam.position.z - cs.z) * cs.rz;
          const lim = (cs.hw + TUNNEL_SHOULDER + (cs.caveW ?? 0)) * 0.9;
          if (Math.abs(lat) > lim) { const k = Math.sign(lat) * lim - lat; cam.position.x += cs.rx * k; cam.position.z += cs.rz * k; lat += k; }
          cam.position.y = Math.min(cam.position.y, cs.y + cs.ramp - lat * cs.bank + tunnelCeiling(cs, lat) - 1.4);
        }
      }
      cam.up.set(0, 1, 0);
      cam.lookAt(p.pos.x + fx * 16, p.pos.y + (mode === 0 ? 1.6 : 2.3), p.pos.z + fz * 16);
      cam.rotateZ(-p.roll * 0.2 + (p.zeroG ? Math.sin(this.clock * 0.6) * 0.25 : 0));
    } else if (mode === 2 || mode === 3) {
      const v = p.visual!; v.group.position.copy(p.pos); v.group.rotation.set(0, p.yaw, 0); v.body.rotation.set(p.pitch, 0, p.roll); v.group.updateMatrixWorld(true);
      const src = mode === 2 ? v.eye : v.hood;
      if (mode === 2 && v.eyeWorld) v.eyeWorld(this.tmpV); // the eye rides with the swaying cockpit
      else { this.tmpV.copy(src); v.body.localToWorld(this.tmpV); }
      cam.position.set(this.tmpV.x + sx * 0.5, this.tmpV.y + sy * 0.5, this.tmpV.z);
      v.body.getWorldQuaternion(this.tmpQ);
      cam.up.copy(UP).applyQuaternion(this.tmpQ);
      this.tmpV2.set(0, src.y - (mode === 2 ? 3.2 : 0.45), 60); v.body.localToWorld(this.tmpV2); // cockpit: look slightly down over the dashboard
      cam.lookAt(this.tmpV2);
      fov += 4;
    } else if (mode === 4) {
      const cams = this.world.tvCams; let best = this.tvIdx, bd = 1e9;
      for (let i = 0; i < cams.length; i++) { const c = cams[i]; const dd = c.distanceTo(p.pos); const ahead = (c.x - p.pos.x) * fx + (c.z - p.pos.z) * fz; if (ahead > -60 && dd < bd) { bd = dd; best = i; } }
      if (best !== this.tvIdx) this.tvIdx = best;
      const c = cams[Math.max(0, this.tvIdx)]; cam.position.copy(c); cam.up.set(0, 1, 0); cam.lookAt(p.pos);
      const dist = c.distanceTo(p.pos); fov = THREE.MathUtils.clamp(2 * Math.atan(14 / dist) * 180 / Math.PI, 8, 70);
    } else {
      const a = this.clock * 0.35; const r = 18;
      cam.position.set(p.pos.x + Math.sin(a) * r, p.pos.y + 4 + Math.sin(this.clock * 0.5) * 2, p.pos.z + Math.cos(a) * r);
      cam.up.set(0, 1, 0); cam.lookAt(p.pos);
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
    this.sky.mesh.position.copy(cam.position);
    if (this.csm && this.csm.camera && Math.abs(cam.fov - this.csmFov) > 1) { this.csmFov = cam.fov; this.csm.updateFrustums(); } // cascades follow the speed-FOV

    // Shadow frustum follows player, snapped to exact light-space texel increments (eliminates shadow-edge shimmering!)
    if (this.sun.castShadow) {
      this.tmpV.set(p.pos.x + fx * 52, p.pos.y, p.pos.z + fz * 52);
      if (this.shadowTexel > 0) {
        const tx = this.shadowTexel;
        const u = this.tmpV.dot(this.sunRight), v = this.tmpV.dot(this.sunUp), w = this.tmpV.dot(this.sunDir);
        const su = Math.round(u / tx) * tx, sv = Math.round(v / tx) * tx;
        this.tmpV.set(0, 0, 0).addScaledVector(this.sunRight, su).addScaledVector(this.sunUp, sv).addScaledVector(this.sunDir, w);
      }
      this.sun.target.position.copy(this.tmpV);
      this.sun.position.copy(this.tmpV).addScaledVector(this.sunDir, 360);
    }
  }

  render(dt: number) {
    const post = this.post; const p = this.player;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const u = post.cine.uniforms;
    u.time.value = this.clock; u.speed.value = Math.min(1.5, sp / 150) * (this.camMode === 4 ? 0.2 : 1);
    u.boost.value += ((p.boosting ? 1 : 0) - u.boost.value) * Math.min(1, dt * 5);
    u.damage.value = Math.max(0, 1 - Math.min(p.hpL, p.hpR) / 40) * 0.8;
    u.flash.value = this.flash; u.flow.value += dt * (0.35 + 1.9 * Math.min(1, sp / 150));
    if (post.godRays) {
      const sp3 = this.tmpV.copy(this.camera.position).addScaledVector(this.sunDir, 5000).project(this.camera);
      const camDir = this.camera.getWorldDirection(this.tmpV2);
      const facing = camDir.dot(this.sunDir);
      // screenUV has its origin TOP-left on both backends → flip y (the old `+ sp3.y * 0.5` mirrored the sun, so shafts never showed)
      post.godRays.uniforms.sunPos.value.set(sp3.x * 0.5 + 0.5, 0.5 - sp3.y * 0.5);
      post.godRays.uniforms.intensity.value = sp3.z < 1 ? THREE.MathUtils.smoothstep(facing, 0.05, 0.72) * 0.5 : 0;
      const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sp3.x), Math.abs(sp3.y)), 0.8, 0.98);
      post.lens.flare.value = sp3.z < 1 ? THREE.MathUtils.smoothstep(facing, 0.0, 0.55) * this.env.flare * edge : 0;
    }
    post.lens.aspect.value = this.camera.aspect;
    if (post.heat) { // heat haze behind player's nozzles (slots 0–1) AND the 2 closest on-screen rival pods (slots 2–5)!
      const hz = post.heat, P = hz.plumes, camP = this.camera.position;
      for (let k = 0; k < P.length; k++) P[k].value.set(-2, -2, 30, 0);
      const emitPod = (pod: PodState, slot: number, maxDist: number, scale: number) => {
        const v = pod.visual; if (!v || pod.dead > 0) return false;
        const sy = Math.sin(pod.yaw), cy = Math.cos(pod.yaw), bz = v.body.position.z, cr = Math.cos(pod.roll), sr = Math.sin(pod.roll);
        const podSpd = Math.hypot(pod.vel.x, pod.vel.z);
        const w0 = Math.min(1, 0.25 + pod.input.throttle * 0.55 + (pod.boosting ? 0.55 : 0) + pod.heat * 0.4) * (1 - 0.6 * Math.min(1, podSpd / 105)) * scale;
        if (w0 < 0.03) return false;
        let gotL = false, gotR = false, any = false;
        for (let i = 0; i < v.exhaustLocal.length && !(gotL && gotR); i++) {
          const loc = v.exhaustLocal[i], left = loc.x < 0; if (left ? gotL : gotR) continue;
          const lz = loc.z + bz - 2.2, ly = loc.y + (left ? pod.engYL ?? 0 : pod.engYR ?? 0), x = loc.x * cr - ly * sr, y = loc.x * sr + ly * cr - lz * pod.pitch;
          this.tmpV3.set(pod.pos.x + x * cy + lz * sy, pod.pos.y + y, pod.pos.z - x * sy + lz * cy);
          const dist = this.tmpV3.distanceTo(camP);
          if (dist > 3 && dist < maxDist) {
            this.tmpV3.project(this.camera);
            if (this.tmpV3.z > 0 && this.tmpV3.z < 1 && Math.abs(this.tmpV3.x) < 1.12 && Math.abs(this.tmpV3.y) < 1.12) {
              const rad = Math.max(0.01, Math.min(0.05, 0.85 / dist)), dFade = 1 - Math.max(0, dist - maxDist * 0.55) / (maxDist * 0.45);
              P[slot + (left ? 0 : 1)].value.set(this.tmpV3.x * 0.5 + 0.5, 0.5 - this.tmpV3.y * 0.5, 1 / rad, w0 * dFade);
              any = true;
            }
          }
          if (left) gotL = true; else gotR = true;
        }
        return any;
      };
      let anyHaze = emitPod(p, 0, 55, 1.0);
      // Pick the two closest living rival pods within 82 m for slots 2–3 and 4–5 (allocation-free)
      let r1: PodState | null = null, r2: PodState | null = null, d1 = 82 * 82, d2 = 82 * 82;
      for (let i = 0; i < this.pods.length; i++) {
        const q = this.pods[i]; if (q.isPlayer || q.dead > 0) continue;
        const dd = q.pos.distanceToSquared(camP);
        if (dd < d1) { d2 = d1; r2 = r1; d1 = dd; r1 = q; } else if (dd < d2) { d2 = dd; r2 = q; }
      }
      if (r1 && emitPod(r1, 2, 82, 0.92)) anyHaze = true;
      if (r2 && emitPod(r2, 4, 82, 0.85)) anyHaze = true;
      hz.strength.value += ((anyHaze ? 1 : 0) - hz.strength.value) * Math.min(1, dt * 6);
    }
    post.render();
  }

  hud(): HudState {
    const p = this.player; const closed = this.td.main.closed;
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    const total = closed ? this.profile.race.laps : 1;
    const dm = damageModel(p.def.id), lostParts = p.parts ?? 0;
    return {
      speed: Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6), place: p.place, total: this.pods.length,
      lap: Math.max(1, Math.min(total, p.lap + 1)), laps: total, sprint: !closed,
      progress: closed ? 0 : Math.max(0, Math.min(1, p.rel / (this.td.finishIdx - this.td.startIdx))),
      time: this.raceTime, lastLap: p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : null, bestLap: closed ? best : null,
      // HUD boxes mean screen-left / screen-right. Internal "L" is local x < 0 = the RIGHT engine in the chase view → swapped here.
      hpL: Math.max(0, p.hpR), hpR: Math.max(0, p.hpL), partsL: partLamps(dm, lostParts, 1), partsR: partLamps(dm, lostParts, -1), heat: p.heat, boosting: p.boosting, overheat: p.overheat, repairing: p.repairing, airbrake: p.airbraking,
      wrongWay: p.wrongWay > 1.2, zeroG: p.zeroG, countdown: this.state === 'countdown' ? this.countdown : -1,
      message: this.messageT > 0 ? this.message : '', camName: CAMERA_NAMES[this.camMode], fps: this.fps, backend: this.backend,
      standings: [], dead: p.dead > 0, finished: p.finished,
      roll: p.rollCtl ?? 0, pitch: p.pitchCtl ?? 0, sliding: !!p.sliding, slideCharge: Math.min(1, (p.slideT ?? 0) / 1.6), airborne: !p.grounded && !p.zeroG, env: this.envLabel, ...this.surfaceHud(), heatEnv: this.heatMul, overdrive: Math.min(1, (p.overT ?? 0) / 3),
    };
  }

  results(sorted: PodState[]): RaceResult[] {
    const L = this.td.main.closed ? this.td.N * this.profile.race.laps : this.td.finishIdx - this.td.startIdx;
    return sorted.map((q, i) => {
      let time: number | null = q.finished ? q.finishTime : null;
      if (!q.finished) { const avg = Math.max(30, (q.prog * 2) / Math.max(1, this.raceTime)); time = this.raceTime + ((L - q.prog) * 2) / avg; }
      return { place: i + 1, name: q.name, pod: q.def.name, color: q.color, isPlayer: q.isPlayer, time, bestLap: q.lapTimes.length && this.td.main.closed ? Math.min(...q.lapTimes) : null };
    }).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9)).map((r, i) => ({ ...r, place: i + 1 }));
  }

  drawMinimap() {
    const c = this.minimap; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height;
    const b = this.td.bounds; const pad = 10;
    const s = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (H - (b.maxZ - b.minZ) * s) / 2;
    const X = (x: number) => W - (ox + (x - b.minX) * s), Z = (z: number) => oz + (z - b.minZ) * s;

    // Bake static track outline once per race onto an offscreen canvas (50× faster minimap!)
    if (!this.mapBg || this.mapW !== W || this.mapH !== H) {
      const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
      const bc = bg.getContext('2d')!;
      for (const path of this.td.paths) {
        bc.beginPath();
        const ps = path.samples;
        for (let i = 0; i < ps.length; i += 6) { if (i === 0) bc.moveTo(X(ps[i].x), Z(ps[i].z)); else bc.lineTo(X(ps[i].x), Z(ps[i].z)); }
        if (path.closed) bc.closePath();
        bc.strokeStyle = path.id === 0 ? 'rgba(255,255,255,0.82)' : path.isCave ? 'rgba(110,225,255,0.85)' : 'rgba(255,200,80,0.82)';
        bc.lineWidth = path.id === 0 ? 3 : 2; bc.setLineDash(path.id === 0 ? [] : [4, 3]); bc.stroke();
      }
      bc.setLineDash([]);
      // Overdraw elevated overpass bridges with a dark separation casing so crossings read cleanly on the minimap!
      const ms = this.td.main.samples;
      for (const [col, lw] of [['rgba(0,0,0,0.9)', 6], ['#7fe8ff', 3.2]] as const) {
        bc.strokeStyle = col; bc.lineWidth = lw; bc.beginPath(); let on = false;
        for (let i = 0; i < ms.length; i += 3) {
          if (ms[i].bridge) { if (!on) { bc.moveTo(X(ms[i].x), Z(ms[i].z)); on = true; } else bc.lineTo(X(ms[i].x), Z(ms[i].z)); } else on = false;
        }
        bc.stroke();
      }
      const st = this.td.main.samples[this.td.startIdx];
      bc.fillStyle = '#ff4040'; bc.fillRect(X(st.x) - 3, Z(st.z) - 3, 6, 6);
      if (!this.td.main.closed) { const fn = this.td.main.samples[this.td.finishIdx]; bc.fillStyle = '#40ff60'; bc.fillRect(X(fn.x) - 3, Z(fn.z) - 3, 6, 6); }
      this.mapBg = bg; this.mapW = W; this.mapH = H;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.mapBg, 0, 0);
    for (let i = 0; i < this.pods.length; i++) {
      const p = this.pods[i]; if (p.isPlayer) continue;
      ctx.beginPath(); ctx.arc(X(p.pos.x), Z(p.pos.z), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    }
    const me = this.player;
    ctx.beginPath(); ctx.arc(X(me.pos.x), Z(me.pos.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#00d0ff'; ctx.lineWidth = 2; ctx.stroke();
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKeyUp);
    this.ro?.disconnect();
    this.audio?.dispose();
    this.pods.forEach(p => p.visual?.dispose());
    this.weather?.dispose(); this.world?.dispose(); this.particles?.dispose(); this.debris?.dispose(); this.scrap?.dispose(); this.post?.dispose(); this.csm?.dispose();
    this.sky?.mesh.geometry.dispose(); (this.sky?.mesh.material as THREE.Material | undefined)?.dispose();
    (this.scene.environment as THREE.Texture | null)?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

export function fmt(t: number | null) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}
