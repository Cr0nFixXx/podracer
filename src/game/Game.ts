import * as THREE from 'three/webgpu';
import { DIFFICULTIES, PILOTS, PODS, THEMES, TRACKS } from './data';
import { effectiveStats, type Profile } from './settings';
import { buildTrack, type TrackData } from './trackBuilder';
import { buildWorld, type World } from './world';
import { makeSky, sunDirection } from './sky';
import { buildPodModel } from './podModel';
import { Particles } from './particles';
import { PostFX } from './post';
import { AudioFX, type WorldAudioState } from './audio';
import { HOVER, aiInputs, podParams, respawn, stepPod, type PodState } from './physics';
import { applyAtmosphere } from './atmosphere';
import type { LifeAudio } from './wildlife';

const ZERO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const C_ICE = new THREE.Color('#d8f2ff');
export const CAMERA_NAMES = ['Verfolger', 'Verfolger (fern)', 'Cockpit', 'Motorhaube', 'TV-Kamera', 'Kino-Orbit'];

export interface Standing { name: string; color: string; isPlayer: boolean; gap: string; finished: boolean; }
export interface HudState {
  speed: number; place: number; total: number; lap: number; laps: number; sprint: boolean; progress: number;
  time: number; lastLap: number | null; bestLap: number | null;
  hpL: number; hpR: number; heat: number; boosting: boolean; overheat: boolean; repairing: boolean; airbrake: boolean;
  wrongWay: boolean; zeroG: boolean; countdown: number; message: string; camName: string; fps: number; backend: string; standings: Standing[]; dead: boolean;
  finished: boolean;
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
  gripMul = 1; lastBeep = 99;
  raf = 0; ro: ResizeObserver | null = null;
  // Pre-allocated scratch math objects (zero per-frame GC allocations!)
  tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3(); tmpV3 = new THREE.Vector3();
  tmpQ = new THREE.Quaternion(); tmpC = new THREE.Color(); dustCol = new THREE.Color(); barrierGlow = new THREE.Color();
  lifeAudio: LifeAudio = { bird: 0, herd: 0, crawler: 0 };
  worldAudio: WorldAudioState = { themeId: 'desert', geyser: 0, rotor: 0, rotorHz: 2, crawler: 0, bird: 0, herd: 0 };
  prevCamBtn = false;

  constructor(container: HTMLDivElement, profile: Profile, cb: Callbacks) {
    this.container = container; this.profile = profile; this.cb = cb; this.camMode = profile.race.camera;
  }

  async start() {
    const gfx = this.profile.gfx;
    const trackDef = TRACKS.find(t => t.id === this.profile.race.trackId) ?? TRACKS[0];
    const theme = THEMES[trackDef.theme];
    this.gripMul = theme.id === 'ice' ? 0.55 : theme.id === 'jungle' ? 0.85 : 1;
    this.dustCol.set(theme.palette.ground[1]);
    this.barrierGlow.set(theme.barrierColor).multiplyScalar(1.25);

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
    const envScene = new THREE.Scene(); const envSky = makeSky(theme, true); envScene.add(envSky.mesh);
    this.scene.environment = pm.fromScene(envScene, 0.035, 1, 2000).texture;
    this.scene.environmentIntensity = 0.85;
    envSky.mesh.geometry.dispose(); (envSky.mesh.material as THREE.Material).dispose();
    pm.dispose();

    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity / gfx.drawDistance);
    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.58); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    sun.castShadow = gfx.shadows > 0;
    const ms = [0, 1024, 1536, 2048][gfx.shadows] ?? 1536;
    const sExt = 96;
    if (ms) { sun.shadow.mapSize.set(ms, ms); this.shadowTexel = (sExt * 2) / ms; }
    const sc = sun.shadow.camera; sc.left = -sExt; sc.right = sExt; sc.top = sExt; sc.bottom = -sExt; sc.near = 20; sc.far = 620;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.65;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;

    // track & world
    this.cb.onLoading(0.03, 'Berechne Streckenverlauf …');
    await new Promise(res => setTimeout(res, 0));
    this.td = buildTrack(trackDef);
    { const avgY = this.td.main.samples.reduce((a, s) => a + s.y, 0) / this.td.N; applyAtmosphere(this.scene, theme, theme.fogDensity / gfx.drawDistance, avgY - 12, this.sunDir); }
    this.world = await buildWorld(this.td, theme, gfx, (p, m) => this.cb.onLoading(0.05 + p * 0.85, m));
    if (this.disposed) return;
    this.scene.add(this.world.group);

    // particles
    this.particles = new Particles(gfx.particles);
    this.particles.initAmbient(theme.ambient);
    this.scene.add(this.particles.group);

    // pods (player = full hero detail; opponents = merged whole-pod + automatic 2-tier distance LOD!)
    this.cb.onLoading(0.92, 'Montiere Podracer …');
    await new Promise(res => setTimeout(res, 0));
    this.createPods();

    this.post = new PostFX(r, this.scene, this.camera, gfx);
    this.particles.setScale(h0 * r.getPixelRatio());
    this.audio = new AudioFX(this.profile.volume);

    // Full GPU warmup: compile HalfFloat scenePass + shadow + particle + both pod LODs + all PostFX passes & flush VRAM uploads!
    this.cb.onLoading(0.96, 'Wärme Grafik-Pipeline auf …');
    await new Promise(res => setTimeout(res, 0));
    this.updateCamera(0.016);
    this.world.update(0, this.camera.position, this.pods);
    this.updateVisuals(0.016);
    this.particles.seedWarmup(this.camera.position);
    for (const p of this.pods) if (!p.isPlayer) p.visual?.setDistance(10, true); // expose both near & far LOD once for compilation
    await this.post.warmup(r);
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
    const others = PODS.filter(p => p.id !== playerDef.id);
    const n = Math.min(10, prof.race.opponents);
    const list = [{ def: playerDef, isPlayer: true }];
    for (let i = 0; i < n; i++) list.push({ def: others[i % others.length], isPlayer: false });
    const playerGrid = Math.min(n, Math.floor(n * 0.6));
    const order = list.slice(1); order.splice(playerGrid, 0, list[0]);
    const S = this.td.main.samples; const N = this.td.N;
    order.forEach((e, g) => {
      const row = Math.floor(g / 3), col = g % 3;
      let idx = this.td.startIdx - 6 - row * 9;
      idx = this.td.main.closed ? ((idx % N) + N) % N : Math.max(0, idx);
      const s = S[idx]; const lat = (col - 1) * s.hw * 0.55;
      const pilot = PILOTS.find(p => p.id === e.def.pilotId) ?? PILOTS[0];
      const custom = e.isPlayer ? prof.custom[e.def.id] : undefined;
      const colors = custom ? custom.colors : (g > 10 ? [e.def.colors[1], e.def.colors[0], e.def.colors[2]] as [string, string, string] : e.def.colors);
      const geo = this.profile.gfx.geometry;
      const vis = buildPodModel(e.def, colors, geo, this.profile.gfx.texRes, !e.isPlayer);
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
        ai: e.isPlayer ? null : { skill, speedF: diff.speed * (0.93 + 0.09 * pilot.skill), lineOff: Math.random() * 2 - 1, takeShortcut: Math.random() < skill * 0.75, boostUntil: 0, repairMode: false, noiseT: Math.random() * 100, rubber: 1 },
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
    if (e.code === 'KeyC') this.cycleCamera();
    if (e.code === 'Escape' || e.code === 'KeyP') this.setPaused(!this.paused);
    this.audio?.resume();
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
    let steer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let throttle = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    let brake = k.has('ArrowDown') || k.has('KeyS') ? 1 : 0;
    let boost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space');
    let airbrake = k.has('KeyE') || k.has('ControlLeft') || k.has('KeyQ');
    let repair = k.has('KeyR');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] ?? 0; if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * (Math.abs(ax) - 0.12) / 0.88;
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0;
      if (rt > 0.05) throttle = Math.max(throttle, rt); if (lt > 0.05) brake = Math.max(brake, lt);
      if (gp.buttons[0]?.pressed) boost = true;
      if (gp.buttons[1]?.pressed || gp.buttons[4]?.pressed || gp.buttons[5]?.pressed) airbrake = true;
      if (gp.buttons[2]?.pressed) repair = true;
      const cam = !!gp.buttons[3]?.pressed; if (cam && !this.prevCamBtn) this.cycleCamera(); this.prevCamBtn = cam;
      if (gp.buttons[9]?.pressed && !this.paused) this.setPaused(true);
      break;
    }
    inp.steer = steer; inp.throttle = throttle; inp.brake = brake; inp.boost = boost; inp.airbrake = airbrake; inp.repair = repair;
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
      for (const p of this.pods) stepPod(p, this.td, h, this.raceTime, this.gripMul, frozen);
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
        if (p.invuln <= 0) { p.hpL -= 12 * dt * P.sturdy; p.hpR -= 12 * dt * P.sturdy; }
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
      if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) respawn(p, this.td); }
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
    this.particles.update(dt, this.camera.position, this.clock);
    this.world.update(this.clock, this.camera.position, this.pods);
    this.sky.uniforms.time.value = this.clock;
    if (this.messageT > 0) this.messageT -= dt;
    this.flash = Math.max(0, this.flash - dt * 2);

    // audio
    const pp = this.player.pos;
    let nd = 1e9, os = 0;
    for (const p of this.pods) if (p !== this.player && p.dead <= 0) { const d = p.pos.distanceTo(pp); if (d < nd) { nd = d; os = Math.hypot(p.vel.x, p.vel.z); } }
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
    this.audio.update(Math.hypot(this.player.vel.x, this.player.vel.z), this.player.input.throttle, this.player.boosting, nd, os, wa, dt);

    this.hudTimer += dt;
    if (this.hudTimer > 0.085) { this.hudTimer = 0; this.cb.onHud(this.hud()); }
    this.mapTimer += dt;
    if (this.mapTimer > 0.065) { this.mapTimer = 0; this.drawMinimap(); }
  }

  podCollisions() {
    const ps = this.pods;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j]; if (a.dead > 0 || b.dead > 0 || a.invuln > 0 || b.invuln > 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
      if (Math.abs(dy) > 3) continue;
      const ra = podParams(a).width * 0.8, rb = podParams(b).width * 0.8; const R = ra + rb;
      const d2 = dx * dx + dz * dz; if (d2 > R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2); const nx = dx / d, nz = dz / d; const pen = R - d;
      a.pos.x -= nx * pen / 2; a.pos.z -= nz * pen / 2; b.pos.x += nx * pen / 2; b.pos.z += nz * pen / 2;
      const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rv < 0) {
        const jv = -rv * 0.65;
        a.vel.x -= nx * jv; a.vel.z -= nz * jv; b.vel.x += nx * jv; b.vel.z += nz * jv;
        const ac = a as unknown as { pCd?: number }, bc = b as unknown as { pCd?: number };
        const dmg = Math.min(22, Math.max(0, -rv - 5) * 0.85);
        if (dmg > 0 && this.raceTime - (ac.pCd ?? -1) > 0.2 && this.raceTime - (bc.pCd ?? -1) > 0.2) {
          ac.pCd = this.raceTime; bc.pCd = this.raceTime;
          a.hpL -= dmg * 0.5; a.hpR -= dmg * 0.5; b.hpL -= dmg * 0.5; b.hpR -= dmg * 0.5;
          a.shake = Math.min(1, a.shake + 0.3); b.shake = Math.min(1, b.shake + 0.3);
          a.events.push({ type: 'pod', strength: -rv, x: a.pos.x + nx * ra, y: a.pos.y, z: a.pos.z + nz * ra, nx: -nx, nz: -nz });
        }
      }
    }
  }

  updateVisuals(dt = 0.016) {
    this.particles.setFrameDt(dt);
    const camPos = this.camera.position;
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
        } else if (e.type === 'land') { if (near) this.particles.dust(this.tmpV, p.vel, this.dustCol, 8); if (p.isPlayer) this.audio.hit(e.strength * 0.5); }
        else if (e.type === 'explode') { if (dist < 480) this.particles.explosion(this.tmpV); if (p.isPlayer) { this.audio.boom(); this.flash = 0.8; this.showMsg('TRIEBWERK ZERSTÖRT!', 2.5); } else if (near) this.audio.hit(40); }
        else if (e.type === 'field') {
          if (near) {
            this.particles.shimmer(this.tmpV, this.tmpV2.set(e.nx, 0, e.nz), this.barrierGlow);
            this.world.flashField(e.x, e.y, e.z, e.strength * 1.4);
          }
          if (p.isPlayer) this.audio.fieldZap(e.strength);
        } else if (e.type === 'fall' && p.isPlayer) this.showMsg('ABSTURZ!', 2);
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
      v.setEngineMotion(eyL, eyR, p.engPL ?? 0, p.engPR ?? 0, p.roll);
      v.update(this.clock, p.input.throttle, p.boosting ? 1 : 0, p.airbraking ? 1 : 0, p.hpL / 100, p.hpR / 100, p.heat);

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
        this.tmpV3.set(p.pos.x + loc.x * cy + lz * sy, p.pos.y + loc.y + eLift + loc.x * p.roll - lz * p.pitch, p.pos.z - loc.x * sy + lz * cy);
        this.particles.exhaust(this.tmpV3, back, p.vel, this.tmpC, p.input.throttle, p.boosting ? 1 : 0, emitScale);
        const hp = loc.x < 0 ? p.hpL : p.hpR;
        if (hp < 40 && (p.isPlayer || (i < 2 && dist > 22))) this.particles.smoke(this.tmpV3, p.vel, 1 - hp / 40, rivalVis);
        if ((hp < 20 || p.overheat) && (p.isPlayer || i < 2)) this.particles.fire(this.tmpV3, p.vel, rivalVis);
      }
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (p.grounded && sp > 42 && p.pos.y - p.groundY < HOVER + 1.2) {
        // Keep rival dust very subtle (0.28×) and strictly omitted within 24 m ahead so leader never blinds player!
        if (p.isPlayer) this.particles.dust(this.tmpV.set(p.pos.x, p.groundY + 0.15, p.pos.z), p.vel, this.dustCol, 1, 0.75);
        else if (dist > 24 && dist < 80) this.particles.dust(this.tmpV.set(p.pos.x, p.groundY + 0.15, p.pos.z), p.vel, this.dustCol, 1, 0.25);
      }
      if (p.repairing && p.isPlayer && this.particles.chance(0.26)) {
        this.particles.sparks(this.tmpV.set(p.pos.x, p.pos.y + 0.9, p.pos.z), UP, p.vel, 3);
      }
    }
  }

  updateCamera(dt: number) {
    const p = this.player; const cam = this.camera; const gfx = this.profile.gfx;
    const sp = Math.hypot(p.vel.x, p.vel.z); const vmax = podParams(p).vmax;
    let fov = gfx.fov + Math.min(1.3, sp / vmax) * 16 + (p.boosting ? 8 : 0);
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
      cam.up.set(0, 1, 0);
      cam.lookAt(p.pos.x + fx * 16, p.pos.y + (mode === 0 ? 1.6 : 2.3), p.pos.z + fz * 16);
      cam.rotateZ(-p.roll * 0.2 + (p.zeroG ? Math.sin(this.clock * 0.6) * 0.25 : 0));
    } else if (mode === 2 || mode === 3) {
      const v = p.visual!; v.group.position.copy(p.pos); v.group.rotation.set(0, p.yaw, 0); v.body.rotation.set(p.pitch, 0, p.roll); v.group.updateMatrixWorld(true);
      const src = mode === 2 ? v.eye : v.hood;
      this.tmpV.copy(src); v.body.localToWorld(this.tmpV);
      cam.position.set(this.tmpV.x + sx * 0.5, this.tmpV.y + sy * 0.5, this.tmpV.z);
      v.body.getWorldQuaternion(this.tmpQ);
      cam.up.copy(UP).applyQuaternion(this.tmpQ);
      this.tmpV2.set(0, src.y - (mode === 2 ? 0.35 : 0.45), 60); v.body.localToWorld(this.tmpV2);
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
    u.flash.value = this.flash;
    if (post.godRays) {
      const sp3 = this.tmpV.copy(this.camera.position).addScaledVector(this.sunDir, 5000).project(this.camera);
      const camDir = this.camera.getWorldDirection(this.tmpV2);
      const facing = camDir.dot(this.sunDir);
      post.godRays.uniforms.sunPos.value.set(sp3.x * 0.5 + 0.5, sp3.y * 0.5 + 0.5);
      post.godRays.uniforms.intensity.value = sp3.z < 1 ? THREE.MathUtils.smoothstep(facing, 0.05, 0.72) * 0.5 : 0;
    }
    post.render();
  }

  hud(): HudState {
    const p = this.player; const closed = this.td.main.closed;
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    const total = closed ? this.profile.race.laps : 1;
    return {
      speed: Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6), place: p.place, total: this.pods.length,
      lap: Math.max(1, Math.min(total, p.lap + 1)), laps: total, sprint: !closed,
      progress: closed ? 0 : Math.max(0, Math.min(1, p.rel / (this.td.finishIdx - this.td.startIdx))),
      time: this.raceTime, lastLap: p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : null, bestLap: closed ? best : null,
      hpL: Math.max(0, p.hpL), hpR: Math.max(0, p.hpR), heat: p.heat, boosting: p.boosting, overheat: p.overheat, repairing: p.repairing, airbrake: p.airbraking,
      wrongWay: p.wrongWay > 1.2, zeroG: p.zeroG, countdown: this.state === 'countdown' ? this.countdown : -1,
      message: this.messageT > 0 ? this.message : '', camName: CAMERA_NAMES[this.camMode], fps: this.fps, backend: this.backend,
      standings: [], dead: p.dead > 0, finished: p.finished,
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
        bc.strokeStyle = path.id === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,200,80,0.8)';
        bc.lineWidth = path.id === 0 ? 3 : 2; bc.setLineDash(path.id === 0 ? [] : [4, 3]); bc.stroke();
      }
      bc.setLineDash([]);
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
    this.world?.dispose(); this.particles?.dispose(); this.post?.dispose();
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
