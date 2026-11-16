import * as THREE from 'three';
import { DIFFICULTIES, PILOTS, PODS, THEMES, TRACKS } from './data';
import { effectiveStats, type Profile } from './settings';
import { buildTrack, type TrackData } from './trackBuilder';
import { buildWorld, type World } from './world';
import { makeSky, sunDirection } from './sky';
import { buildPodModel } from './podModel';
import { Particles } from './particles';
import { PostFX } from './post';
import { AudioFX } from './audio';
import { aiInputs, podParams, respawn, stepPod, type PodState } from './physics';

export const CAMERA_NAMES = ['Verfolger', 'Verfolger (fern)', 'Cockpit', 'Motorhaube', 'TV-Kamera', 'Kino-Orbit'];

export interface Standing { name: string; color: string; isPlayer: boolean; gap: string; finished: boolean; }
export interface HudState {
  speed: number; place: number; total: number; lap: number; laps: number; sprint: boolean; progress: number;
  time: number; lastLap: number | null; bestLap: number | null;
  hpL: number; hpR: number; heat: number; boosting: boolean; overheat: boolean; repairing: boolean; airbrake: boolean;
  wrongWay: boolean; zeroG: boolean; countdown: number; message: string; camName: string; fps: number; standings: Standing[]; dead: boolean;
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
  renderer!: THREE.WebGLRenderer; scene = new THREE.Scene(); camera!: THREE.PerspectiveCamera;
  post!: PostFX; world!: World; td!: TrackData; particles!: Particles; audio!: AudioFX;
  sky!: ReturnType<typeof makeSky>; sun!: THREE.DirectionalLight; sunDir = new THREE.Vector3();
  pods: PodState[] = []; player!: PodState;
  keys = new Set<string>();
  running = false; paused = false; disposed = false;
  state: 'loading' | 'countdown' | 'race' | 'post' = 'loading';
  countdown = 4; raceTime = 0; clock = 0; acc = 0; lastT = 0;
  camMode = 0; camYaw = 0; camY = 0; camInit = false; tvIdx = -1; flash = 0;
  hudTimer = 0; mapTimer = 0; fps = 60; fpsAcc = 0; fpsCount = 0;
  minimap: HTMLCanvasElement | null = null;
  message = ''; messageT = 0; finishShown = false; postTimer = 0;
  gripMul = 1; lastBeep = 99;
  raf = 0; ro: ResizeObserver | null = null;
  tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3();
  prevCamBtn = false;

  constructor(container: HTMLDivElement, profile: Profile, cb: Callbacks) {
    this.container = container; this.profile = profile; this.cb = cb; this.camMode = profile.race.camera;
  }

  async start() {
    const gfx = this.profile.gfx;
    const trackDef = TRACKS.find(t => t.id === this.profile.race.trackId) ?? TRACKS[0];
    const theme = THEMES[trackDef.theme];
    this.gripMul = theme.id === 'ice' ? 0.55 : theme.id === 'jungle' ? 0.85 : 1;
    this.cb.onLoading(0.01, 'Initialisiere Renderer …');
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2) * gfx.renderScale);
    r.setSize(this.container.clientWidth, this.container.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = theme.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = gfx.shadows > 0; r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    this.container.appendChild(r.domElement);
    r.domElement.style.width = '100%'; r.domElement.style.height = '100%'; r.domElement.style.display = 'block';
    this.camera = new THREE.PerspectiveCamera(gfx.fov, this.container.clientWidth / this.container.clientHeight, 0.3, 12000);

    // sky & env
    this.sky = makeSky(theme);
    this.scene.add(this.sky.mesh);
    this.sunDir.copy(sunDirection(theme));
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene(); const envSky = makeSky(theme); envScene.add(envSky.mesh);
    this.scene.environment = pm.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.9;
    pm.dispose();
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity / gfx.drawDistance);
    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.55); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    sun.castShadow = gfx.shadows > 0;
    const ms = [0, 1024, 2048, 4096][gfx.shadows];
    if (ms) { sun.shadow.mapSize.set(ms, ms); }
    const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 900;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;

    // track & world
    this.cb.onLoading(0.03, 'Berechne Streckenverlauf …');
    await new Promise(res => setTimeout(res, 0));
    this.td = buildTrack(trackDef);
    this.world = await buildWorld(this.td, theme, gfx, (p, m) => this.cb.onLoading(0.05 + p * 0.85, m));
    if (this.disposed) return;
    this.scene.add(this.world.group);

    // particles
    this.particles = new Particles(gfx.particles);
    this.particles.initAmbient(theme.ambient);
    this.scene.add(this.particles.group);

    // pods
    this.cb.onLoading(0.92, 'Montiere Podracer …');
    await new Promise(res => setTimeout(res, 0));
    this.createPods();

    this.post = new PostFX(r, this.scene, this.camera, gfx, this.world.glossy, this.container.clientWidth * r.getPixelRatio(), this.container.clientHeight * r.getPixelRatio());
    this.particles.setScale(this.container.clientHeight * r.getPixelRatio());
    this.audio = new AudioFX(this.profile.volume);

    // compile
    this.cb.onLoading(0.97, 'Kompiliere Shader …');
    await new Promise(res => setTimeout(res, 0));
    this.updateCamera(0.016);
    try { r.compile(this.scene, this.camera); } catch { /* ignore */ }

    window.addEventListener('keydown', this.onKey); window.addEventListener('keyup', this.onKeyUp);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.container);
    this.state = 'countdown'; this.countdown = 4;
    this.running = true; this.lastT = performance.now();
    this.cb.onReady();
    this.raf = requestAnimationFrame(this.loop);
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
      const vis = buildPodModel(e.def, colors, this.profile.gfx.geometry);
      this.scene.add(vis.group);
      const pos = new THREE.Vector3(s.x + s.rx * lat, s.y + 1.8, s.z + s.rz * lat);
      const skill = diff.skill * (0.7 + 0.3 * pilot.skill);
      const pod: PodState = {
        id: g, isPlayer: e.isPlayer, def: e.def, pilot, stats: effectiveStats(e.def.id, custom),
        name: e.isPlayer ? 'Du' : pilot.name, color: e.isPlayer ? '#ffffff' : pilot.color,
        pos, vel: new THREE.Vector3(), yaw: Math.atan2(s.tx, s.tz), yawRate: 0, steer: 0,
        path: 0, idx, lat, grounded: true, zeroG: false, air: 0, groundY: s.y, prevGroundY: s.y,
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
    const w = this.container.clientWidth, h = this.container.clientHeight;
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
      if (frozen) { p.input.boost = false; }
    }
    // physics substeps
    this.acc += dt; const h = 1 / 120; let steps = 0;
    while (this.acc >= h && steps < 8) {
      for (const p of this.pods) stepPod(p, this.td, h, this.raceTime, this.gripMul, frozen);
      this.podCollisions();
      this.acc -= h; steps++;
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
      // lap message
      if (p.isPlayer && this.td.main.closed && p.lapTimes.length && p.lapTimes.length !== (p as unknown as { _lt?: number })._lt) {
        (p as unknown as { _lt?: number })._lt = p.lapTimes.length;
        if (!p.finished) this.showMsg(p.lap === this.profile.race.laps - 1 ? 'LETZTE RUNDE!' : `Runde ${p.lap + 1}`, 2);
      }
    }
    // standings
    const sorted = [...this.pods].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog);
    sorted.forEach((p, i) => (p.place = i + 1));

    if (this.state === 'post') {
      this.postTimer += dt;
      const allDone = this.pods.every(p => p.finished);
      if (!this.finishShown && (this.postTimer > 6 || (allDone && this.postTimer > 3))) { this.finishShown = true; this.cb.onFinish(this.results(sorted)); }
    }

    this.updateVisuals();
    this.updateCamera(dt);
    this.particles.update(dt, this.camera.position, this.clock);
    this.world.update(this.clock);
    this.sky.uniforms.time.value = this.clock;
    if (this.messageT > 0) this.messageT -= dt;
    this.flash = Math.max(0, this.flash - dt * 2);

    // audio
    let nd = 1e9, os = 0;
    for (const p of this.pods) if (p !== this.player) { const d = p.pos.distanceTo(this.player.pos); if (d < nd) { nd = d; os = Math.hypot(p.vel.x, p.vel.z); } }
    this.audio.update(Math.hypot(this.player.vel.x, this.player.vel.z), this.player.input.throttle, this.player.boosting, nd, os);

    this.hudTimer += dt;
    if (this.hudTimer > 0.066) { this.hudTimer = 0; this.cb.onHud(this.hud(sorted)); }
    this.mapTimer += dt;
    if (this.mapTimer > 0.05) { this.mapTimer = 0; this.drawMinimap(); }
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
        const dmg = Math.max(0, -rv - 4) * 0.9;
        if (dmg > 0) {
          a.hpL -= dmg * 0.5; a.hpR -= dmg * 0.5; b.hpL -= dmg * 0.5; b.hpR -= dmg * 0.5;
          a.shake = Math.min(1, a.shake + 0.3); b.shake = Math.min(1, b.shake + 0.3);
          a.events.push({ type: 'pod', strength: -rv, x: a.pos.x + nx * ra, y: a.pos.y, z: a.pos.z + nz * ra, nx: -nx, nz: -nz });
        }
      }
    }
  }

  updateVisuals() {
    const theme = THEMES[this.td.def.theme];
    const dustCol = new THREE.Color(theme.palette.ground[1]);
    const camPos = this.camera.position;
    for (const e of this.world.emitters) {
      const dx = e.x - camPos.x, dz = e.z - camPos.z;
      if (dx * dx + dz * dz < 450 * 450) this.particles.vent(this.tmpV.set(e.x, e.y, e.z), e.type);
    }
    for (const p of this.pods) {
      const v = p.visual!; const near = p.pos.distanceTo(camPos) < 380;
      // events
      for (const e of p.events) {
        const pos = new THREE.Vector3(e.x, e.y, e.z);
        if (e.type === 'wall' || e.type === 'obstacle' || e.type === 'pod') {
          if (near) this.particles.sparks(pos, new THREE.Vector3(e.nx, 0.3, e.nz), p.vel, 10 + e.strength);
          if (p.isPlayer || near) this.audio.hit(e.strength * (p.isPlayer ? 1 : 0.3));
        } else if (e.type === 'land') { if (near) this.particles.dust(pos, p.vel, dustCol, 12); if (p.isPlayer) this.audio.hit(e.strength * 0.5); }
        else if (e.type === 'explode') { this.particles.explosion(pos); if (p.isPlayer) { this.audio.boom(); this.flash = 0.8; this.showMsg('TRIEBWERK ZERSTÖRT!', 2.5); } else if (near) this.audio.hit(40); }
        else if (e.type === 'fall') { if (p.isPlayer) this.showMsg('ABSTURZ!', 2); }
      }
      p.events.length = 0;
      v.group.visible = p.dead <= 0 && !(p.invuln > 0 && Math.floor(this.clock * 12) % 2 === 0);
      v.group.position.copy(p.pos);
      v.group.rotation.set(0, p.yaw, 0);
      v.body.rotation.set(p.pitch, 0, p.roll);
      v.engines.forEach((e, i) => { e.position.y = Math.sin(this.clock * 7 + i * 2 + p.id) * 0.08; });
      v.update(this.clock, p.input.throttle, p.boosting ? 1 : 0, p.airbraking ? 1 : 0, p.hpL / 100, p.hpR / 100, p.heat);
      if (!v.group.visible || !near) continue;
      v.group.updateMatrixWorld(true);
      const back = this.tmpV2.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const glow = new THREE.Color(p.isPlayer ? this.profile.custom[p.def.id].colors[2] : p.def.colors[2]).multiplyScalar(0.9);
      v.exhaustLocal.forEach((loc, i) => {
        const wp = v.body.localToWorld(loc.clone());
        this.particles.exhaust(wp, back, p.vel, glow, p.input.throttle, p.boosting ? 1 : 0);
        const hp = i % 2 === 0 ? p.hpL : p.hpR;
        if (hp < 45) this.particles.smoke(wp, p.vel, 1 - hp / 45);
        if (hp < 22 || p.overheat) this.particles.fire(wp, p.vel);
      });
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (p.grounded && sp > 25 && p.pos.y - p.groundY < 3) {
        const n = sp > 90 ? 2 : 1;
        this.particles.dust(this.tmpV.set(p.pos.x, p.groundY + 0.3, p.pos.z), p.vel, dustCol, n);
      }
      if (p.repairing && Math.random() < 0.3) this.particles.sparks(this.tmpV.copy(p.pos).add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 1, 0), p.vel, 3);
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
    const shake = p.shake * 0.5 + Math.min(1, sp / 180) * 0.035 + (p.boosting ? 0.05 : 0);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const mode = this.camMode;
    if (mode === 0 || mode === 1) {
      const dist = (mode === 0 ? 13 : 24) + Math.min(5, sp * 0.02) - (p.boosting ? 1.5 : 0); const hgt = mode === 0 ? 4.2 : 7.5;
      cam.position.set(p.pos.x - fx * dist + sx, this.camY + hgt + sy, p.pos.z - fz * dist);
      const gy = p.zeroG ? -1e9 : this.world.heightAt(cam.position.x, cam.position.z);
      const S = this.td.paths[p.path].samples[p.idx];
      cam.position.y = Math.max(cam.position.y, Math.max(gy, S.gap ? -1e9 : S.y) + 1.5);
      cam.up.set(0, 1, 0);
      cam.lookAt(p.pos.x + fx * 14, p.pos.y + (mode === 0 ? 1.8 : 2.5), p.pos.z + fz * 14);
      cam.rotateZ(-p.roll * 0.18 + (p.zeroG ? Math.sin(this.clock * 0.6) * 0.25 : 0));
    } else if (mode === 2 || mode === 3) {
      const v = p.visual!; v.group.updateMatrixWorld(true);
      const local = mode === 2 ? new THREE.Vector3(0, 1.25, -p.def.cable * 0.5 - 0.8) : new THREE.Vector3(0, 0.7, p.def.cable * 0.5 + p.def.engineLen * 0.75);
      const look = mode === 2 ? new THREE.Vector3(0, 0.9, 40) : new THREE.Vector3(0, 0.4, 60);
      cam.position.copy(v.body.localToWorld(local)); cam.position.x += sx * 0.5; cam.position.y += sy * 0.5;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.body.getWorldQuaternion(new THREE.Quaternion()));
      cam.up.copy(up); cam.lookAt(v.body.localToWorld(look));
      fov += 4;
    } else if (mode === 4) {
      const cams = this.world.tvCams; let best = this.tvIdx, bd = 1e9;
      cams.forEach((c, i) => { const dd = c.distanceTo(p.pos); const ahead = (c.x - p.pos.x) * fx + (c.z - p.pos.z) * fz; if (ahead > -60 && dd < bd) { bd = dd; best = i; } });
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
    // shadows follow
    const t = this.tmpV.copy(p.pos).addScaledVector(new THREE.Vector3(fx, 0, fz), 60);
    this.sun.target.position.copy(t); this.sun.position.copy(t).addScaledVector(this.sunDir, 400);
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
      post.godRays.uniforms.intensity.value = THREE.MathUtils.smoothstep(facing, -0.1, 0.6) * 0.55;
    }
    post.render(dt);
  }

  hud(sorted: PodState[]): HudState {
    const p = this.player; const N = this.td.N; const closed = this.td.main.closed;
    const leader = sorted[0];
    const standings: Standing[] = sorted.map(q => {
      let gap = '';
      if (q === leader) gap = q.finished ? fmt(q.finishTime) : 'Führung';
      else if (q.finished) gap = '+' + (q.finishTime - leader.finishTime).toFixed(1) + 's';
      else { const sp = Math.max(40, Math.hypot(q.vel.x, q.vel.z)); gap = '+' + (((leader.prog - q.prog) * 2) / sp).toFixed(1) + 's'; }
      return { name: q.name, color: q.color, isPlayer: q.isPlayer, gap, finished: q.finished };
    });
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    const total = closed ? this.profile.race.laps : 1;
    return {
      speed: Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6), place: p.place, total: this.pods.length,
      lap: Math.max(1, Math.min(total, p.lap + 1)), laps: total, sprint: !closed,
      progress: closed ? 0 : Math.max(0, Math.min(1, p.rel / (this.td.finishIdx - this.td.startIdx))),
      time: this.raceTime, lastLap: p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : null, bestLap: closed ? best : null,
      hpL: Math.max(0, p.hpL), hpR: Math.max(0, p.hpR), heat: p.heat, boosting: p.boosting, overheat: p.overheat, repairing: p.repairing, airbrake: p.airbraking,
      wrongWay: p.wrongWay > 1.2, zeroG: p.zeroG, countdown: this.state === 'countdown' ? this.countdown : -1,
      message: this.messageT > 0 ? this.message : '', camName: CAMERA_NAMES[this.camMode], fps: this.fps, standings, dead: p.dead > 0, finished: p.finished,
    };
    void N;
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
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const b = this.td.bounds; const pad = 10;
    const s = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (H - (b.maxZ - b.minZ) * s) / 2;
    const X = (x: number) => W - (ox + (x - b.minX) * s), Z = (z: number) => oz + (z - b.minZ) * s;
    for (const path of this.td.paths) {
      ctx.beginPath();
      path.samples.forEach((p, i) => { if (i % 6) return; if (i === 0) ctx.moveTo(X(p.x), Z(p.z)); else ctx.lineTo(X(p.x), Z(p.z)); });
      if (path.closed) ctx.closePath();
      ctx.strokeStyle = path.id === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,200,80,0.8)';
      ctx.lineWidth = path.id === 0 ? 3 : 2; ctx.setLineDash(path.id === 0 ? [] : [4, 3]); ctx.stroke();
    }
    ctx.setLineDash([]);
    const st = this.td.main.samples[this.td.startIdx];
    ctx.fillStyle = '#ff4040'; ctx.fillRect(X(st.x) - 3, Z(st.z) - 3, 6, 6);
    if (!this.td.main.closed) { const fn = this.td.main.samples[this.td.finishIdx]; ctx.fillStyle = '#40ff60'; ctx.fillRect(X(fn.x) - 3, Z(fn.z) - 3, 6, 6); }
    for (const p of [...this.pods].sort((a) => (a.isPlayer ? 1 : -1))) {
      ctx.beginPath(); ctx.arc(X(p.pos.x), Z(p.pos.z), p.isPlayer ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.isPlayer ? '#ffffff' : p.color; ctx.fill();
      if (p.isPlayer) { ctx.strokeStyle = '#00d0ff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKeyUp);
    this.ro?.disconnect();
    this.audio?.dispose();
    this.pods.forEach(p => p.visual?.dispose());
    this.world?.dispose(); this.particles?.dispose(); this.post?.dispose();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

export function fmt(t: number | null) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}
