import * as THREE from 'three';
import { Game } from '../../src/game/Game';
import { TRACKS } from '../../src/game/data';
import { PRESETS, defaultProfile } from '../../src/game/settings';
const div = document.createElement('div'); div.style.cssText = 'width:1280px;height:720px;position:fixed;left:0;top:0'; document.body.style.margin = '0'; document.body.appendChild(div);
let g: Game | null = null; let cur = -1;
(window as unknown as Record<string, unknown>).track = async (i: number, view: string) => {
  if (cur !== i) {
    g?.dispose(); cur = i;
    const prof = defaultProfile(); prof.race.trackId = TRACKS[i].id; prof.race.opponents = 7; prof.gfx.texRes = 1024; if (location.search.includes('webgl')) prof.gfx.backend = 'webgl'; if (location.search.includes('csm')) prof.gfx.csm = true; if (location.search.includes('ssr')) prof.gfx.ssr = true;
    { const qs = new URLSearchParams(location.search); if (qs.get('tod')) prof.race.timeOfDay = qs.get('tod') as never; if (qs.get('wx')) prof.race.weather = qs.get('wx') as never; if (qs.has('ultra')) Object.assign(prof.gfx, PRESETS.ultra, { preset: 'ultra', texRes: 1024, renderScale: 0.6 }); } prof.gfx.renderScale = 0.6; prof.gfx.shadows = 1;
    g = new Game(div, prof, { onHud: () => {}, onLoading: () => {}, onFinish: () => {}, onPause: () => {}, onReady: () => {} });
    const tLoad = performance.now(); await g.start(); (window as unknown as Record<string, unknown>).loadInfo = `load=${Math.round(performance.now() - tLoad)}ms ` + JSON.stringify(g.world.timings) + ' ' + JSON.stringify((g as unknown as { loadMs?: unknown }).loadMs ?? {}); g.paused = true; await new Promise(r => setTimeout(r, 400));
  }
  const G = g!; G.paused = true;
  if (view === 'b') {
    const S = G.td.main.samples, N = S.length; let best = 0, bc = 0;
    for (let k = 0; k < N; k += 3) { const c = Math.abs(S[k].curv); if (c > bc && !S[k].gap && S[k].ramp === 0 && !S[k].canyon) { bc = c; best = k; } }
    const side = Math.sign(S[best].curv); const a = S[(best - 12 + N) % N], b = S[(best + 3) % N];
    G.camera.position.set(a.x + a.rx * side * (a.hw - 7), a.y + 3.0, a.z + a.rz * side * (a.hw - 7));
    G.camera.lookAt(b.x + b.rx * side * (b.hw - 3), b.y + 0.4, b.z + b.rz * side * (b.hw - 3));
  } else if (view === 'c') {
    const S = G.td.main.samples, N = S.length; let k = S.findIndex((s, j) => j > N * 0.1 && s.canyon); if (k < 0) k = Math.floor(N * 0.3);
    const a = S[k], b = S[(k + 14) % N]; G.camera.position.set(a.x + a.rx * (a.hw - 5), a.y + 2.4, a.z + a.rz * (a.hw - 5)); G.camera.lookAt(b.x + b.rx * (b.hw + 2), b.y + 1.2, b.z + b.rz * (b.hw + 2));
  } else if (view === 'g') {
    const S = G.td.main.samples, N = S.length; const a = S[Math.floor(N * 0.45)]; const sd = 1;
    G.camera.position.set(a.x + a.rx * sd * (a.hw + 5), a.y + 2.2, a.z + a.rz * sd * (a.hw + 5)); G.camera.lookAt(a.x + a.rx * sd * (a.hw + 60) + a.tx * 40, a.y - 2, a.z + a.rz * sd * (a.hw + 60) + a.tz * 40);
  } else if (view === 'h') { // close-up of the first ground-cover instance (debug)
    let found: THREE.InstancedMesh | null = null; let n = 0, inst = 0;
    G.scene.traverse(o => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh && (im.material as unknown as { alphaTestNode?: unknown }).alphaTestNode) { n++; inst += im.count; if (!found) found = im; } });
    (window as unknown as Record<string, unknown>).coverInfo = `coverMeshes=${n} instances=${inst}`;
    if (found) { const m = new THREE.Matrix4(); (found as THREE.InstancedMesh).getMatrixAt(0, m); const p = new THREE.Vector3().setFromMatrixPosition(m); G.camera.position.set(p.x + 4, p.y + 1.6, p.z + 4); G.camera.lookAt(p.x, p.y + 0.3, p.z); }
  } else if (view === 'l') { // wildlife / vehicle close-up (debug): first shadow-casting animated instance
    let best: THREE.InstancedMesh | null = null;
    G.scene.traverse(o => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh && im.geometry.attributes.aAnim && im.castShadow && (!best || im.geometry.boundingSphere!.radius > best.geometry.boundingSphere!.radius)) best = im; });
    if (best) { G.world.update(G.clock + 5, G.camera.position); const m = new THREE.Matrix4(); (best as THREE.InstancedMesh).getMatrixAt(0, m); const p = new THREE.Vector3().setFromMatrixPosition(m); const r = (best as THREE.InstancedMesh).geometry.boundingSphere!.radius; G.camera.position.set(p.x + r * 2.2, p.y + r * 0.9, p.z + r * 2.2); G.camera.lookAt(p.x, p.y + r * 0.4, p.z); }
  } else if (view === 'e') {
    const S = G.td.main.samples, N = S.length; const a = S[Math.floor(N * 0.3)];
    G.camera.position.set(a.x - a.tx * 30, a.y + 34, a.z - a.tz * 30); G.camera.lookAt(a.x + a.tx * 600, a.y + 10, a.z + a.tz * 600);
  } else if (view.startsWith('d') && G.td.setPieces.length) {
    const sp = G.td.setPieces[Math.min(G.td.setPieces.length - 1, Number(view.slice(1)) || 0)]; const s = G.td.main.samples[sp.idx];
    G.world.setPieces.update(G.clock, 2.4, G.pods, 0.016, false);
    G.camera.position.set(sp.x - s.tx * 48 + s.rx * 6, sp.y + 8, sp.z - s.tz * 48 + s.rz * 6); G.camera.lookAt(sp.x, sp.y + 4, sp.z);
  } else if (view === 'm') { // relay tower close-up (mechProps)
    const tw = G.world.group.userData.mechTower as { x: number; y: number; z: number } | undefined;
    if (tw) { const a = G.td.main.samples[0]; void a; G.camera.position.set(tw.x + 17, tw.y + 9, tw.z + 14); G.camera.lookAt(tw.x, tw.y + 10, tw.z); }
  } else if (view === 'x' || view === 'y' || view === 'z') { // shortcut exit: x = from inside the shortcut, y = main road just before the rejoin, z = just after it
    const sc = G.td.paths[1];
    if (sc) {
      const M = G.td.main.samples, N = M.length, W = (k: number) => M[((Math.round(k) % N) + N) % N];
      const S2 = sc.samples, a = view === 'x' ? S2[Math.max(0, S2.length - 45)] : W(sc.mainTo + (view === 'y' ? -32 : 4)), b = view === 'x' ? S2[S2.length - 8] : W(sc.mainTo + (view === 'y' ? 6 : 44));
      G.camera.position.set(a.x, a.y + 4.2, a.z); G.camera.lookAt(b.x, b.y + 0.5, b.z);
    }
  } else if (view === 'u' || view === 'w') { // u = just inside the first main-path tunnel, w = inside the first zero-G tube
    const S = G.td.main.samples, N = S.length; let k = S.findIndex((s, j) => j > 50 && (view === 'u' ? s.roof > 0 : s.zeroG)); if (k < 0) k = 100;
    const a = S[(k + (view === 'u' ? -9 : 14)) % N], b = S[(k + 40) % N];
    G.camera.position.set(a.x + a.rx * 2, a.y + (view === 'u' ? 4.5 : 7), a.z + a.rz * 2); G.camera.lookAt(b.x, b.y + (view === 'u' ? 4 : 7), b.z);
  } else if (view === 'v' || view === 'k') { // v = inside the first tunnel (window / cave view), k = on the drivable deck of the first standard tunnel
    const S = G.td.main.samples, N = S.length; let a0 = S.findIndex((s, j) => j > 50 && s.roof > 0 && (view === 'v' || s.tun === 1)); if (a0 < 0) a0 = 100;
    let e0 = a0; while (e0 < N - 1 && S[e0 + 1].roof > 0) e0++;
    if (view === 'v') { const a = S[Math.floor((a0 + e0) / 2) - 12], b = S[Math.floor((a0 + e0) / 2) + 14]; G.camera.position.set(a.x, a.y + 4, a.z); G.camera.lookAt(b.x + b.rx * b.hw * 0.9, b.y + 4.5, b.z + b.rz * b.hw * 0.9); }
    else { const a = S[Math.max(0, a0 - 34)], b = S[a0 + 30]; G.camera.position.set(a.x + a.rx * 6, a.y + a.roof + 22, a.z + a.rz * 6); G.camera.lookAt(b.x, b.y + b.roof, b.z); }
  } else if (view === 's') { // look from above the road towards the sun (lens flare / god-ray / glare check)
    const S = G.td.main.samples, a = S[Math.floor(S.length * 0.2)];
    G.camera.position.set(a.x, a.y + 6, a.z); G.camera.lookAt(a.x + G.sunDir.x * 100, a.y + 6 + G.sunDir.y * 60, a.z + G.sunDir.z * 100);
  } else if (view === 'r') { // 3.4 s of real racing (AI + player idle) so exhaust/dust particles, banking and engine heave are live
    G.state = 'race'; (G as unknown as { keys: Set<string> }).keys.add('KeyW'); for (let k = 0; k < 170; k++) { G.update(1 / 60); if (k % 3 === 0) G.updateVisuals(); } G.updateCamera(0.5);
  } else { G.updateCamera(0.5); }
  G.camera.fov = 70; G.camera.updateProjectionMatrix(); G.sky.mesh.position.copy(G.camera.position);
  const fwd = G.camera.getWorldDirection(new THREE.Vector3()); const t = G.camera.position.clone().addScaledVector(fwd, 50);
  G.sun.target.position.copy(t); G.sun.position.copy(t).addScaledVector(G.sunDir, 400);
  { const rt = new URLSearchParams(location.search).get('rt'); if (rt) { G.raceTime = +rt; G.applyEnv(0, true); } }
  G.updateVisuals(); G.updateLights(); G.world.update(G.clock + 5, G.camera.position);
  if (location.search.includes('flash')) { G.sky.uniforms.flash.value = 0.9; G.hemi.intensity = 1.75; }
  if (location.search.includes('live')) { // live graphics switching: toggle everything that is switchable at runtime, render, toggle back
    const g0 = G.profile.gfx; G.render(0.016); await new Promise(r => setTimeout(r, 300));
    G.applyLiveGfx({ ...g0, volumetrics: 0, anisotropy: 2, bloom: !g0.bloom, ao: !g0.ao, godRays: !g0.godRays, aa: g0.aa === 'fxaa' ? 'smaa' : 'fxaa', shadows: g0.shadows ? 0 : 2, particles: 0.5, drawDistance: 0.8, motionBlur: !g0.motionBlur });
    await new Promise(r => setTimeout(r, 1500)); G.render(0.016); await new Promise(r => setTimeout(r, 600));
    G.applyLiveGfx({ ...g0, shadows: 2, lensFx: false, cinematic: !g0.cinematic }); await new Promise(r => setTimeout(r, 1500));
    (window as unknown as Record<string, unknown>).coverInfo = 'live-switch ok';
  }
  if (location.search.includes('wetnow')) { G.wet = 1; G.wetTarget = 1; }
  for (let k = 0; k < 3; k++) { G.render(0.016); await new Promise(r => setTimeout(r, 900)); }
  return `${(window as unknown as Record<string, unknown>).loadInfo ?? ''} ${(window as unknown as Record<string, unknown>).coverInfo ?? ''} ${G.backend} ${TRACKS[i].id}/${view} calls=${G.renderer.info.render.calls} tris=${G.renderer.info.render.triangles}`;
};
/** Physics/collision stress test without rendering: AI opponents race `secs` seconds. */
(window as unknown as Record<string, unknown>).sim = async (i: number, secs: number) => {
  if (cur !== i) {
    g?.dispose(); cur = i;
    const prof = defaultProfile(); prof.race.trackId = TRACKS[i].id; prof.race.opponents = 10; prof.gfx.texRes = 512; prof.gfx.geometry = 1; prof.gfx.shadows = 0; prof.gfx.particles = 0.2;
    g = new Game(div, prof, { onHud: () => {}, onLoading: () => {}, onFinish: () => {}, onPause: () => {}, onReady: () => {} });
    await g.start(); await new Promise(r => setTimeout(r, 300));
  }
  const G = g!; G.paused = true; G.state = 'race';
  let walls = 0, obst = 0, deaths = 0, maxPen = 0, nan = 0, geyser = 0;
  const hp0 = G.pods.map(p => p.hpL + p.hpR);
  const deathAt: string[] = []; const wasDead = G.pods.map(() => false);
  for (let k = 0; k < secs * 60; k++) {
    G.update(1 / 60);
    for (const p of G.pods) {
      if (!isFinite(p.pos.x) || !isFinite(p.pos.z) || !isFinite(p.pos.y)) nan++;
      const di = G.pods.indexOf(p); if (p.dead > 0 && !wasDead[di]) deathAt.push(`${p.path}:${p.idx}${p.hpL <= 0 || p.hpR <= 0 ? 'X' : 'F'}`); wasDead[di] = p.dead > 0;
      if (p.dead > 0 && p.dead > 2.5) deaths++;
      if (p.isPlayer || p.dead > 0) continue;
      const path = G.td.paths[p.path]; const s = path.samples[p.idx]; const lat = (p.pos.x - s.x) * s.rx + (p.pos.z - s.z) * s.rz;
      if (!s.gap) maxPen = Math.max(maxPen, Math.abs(lat) - (lat > 0 ? s.wallR : s.wallL));
    }
    for (const h of G.td.hazards) if (h.state >= 1) geyser++;
  }
  for (const p of G.pods) { void p; }
  const prog = G.pods.filter(p => !p.isPlayer).map(p => p.prog);
  const dmg = G.pods.map((p, j) => Math.round(hp0[j] - (p.hpL + p.hpR)));
  void walls; void obst;
  const SS = G.td.main.samples; const ramps: number[] = []; for (let k = 1; k < SS.length; k++) if (SS[k].ramp > 0 && SS[k - 1].ramp === 0) ramps.push(k);
  (window as unknown as Record<string, unknown>).dbg = `deaths=[${deathAt.join(' ')}] ramps=[${ramps.join(',')}] hz=[${G.td.hazards.map(h => h.idx).join(',')}] sp=[${G.td.setPieces.map(q => q.type[0] + q.idx).join(',')}] N=${SS.length}`;
  return `${TRACKS[i].id}: ${secs}s avgProg=${Math.round(prog.reduce((a, b) => a + b, 0) / prog.length)} minProg=${Math.min(...prog)} deaths~${deaths} NaN=${nan} centreBeyondWall=${maxPen.toFixed(2)}m hazards=${G.td.hazards.length} eruptFrames=${geyser} setPieces=[${G.td.setPieces.map(sp => sp.type + ':' + sp.state).join(' ')}] obstacles=${G.td.obstacles.length} dmg=[${dmg.join(',')}] ${(window as unknown as Record<string, unknown>).dbg}`;
};
/** Audio check without speakers: taps the master bus with an analyser and reports the peak level of rivals and thunder. */
(window as unknown as Record<string, unknown>).audioTest = async () => {
  const { AudioFX } = await import('../../src/game/audio');
  const a = new AudioFX(0.6); if (!a.ctx) return 'audio: no AudioContext';
  await a.ctx.resume(); const an = a.ctx.createAnalyser(); an.fftSize = 2048; a.master.connect(an); const buf = new Float32Array(an.fftSize);
  const peak = async (ms: number, tick: () => void) => { let pk = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { tick(); an.getFloatTimeDomainData(buf); for (const v of buf) pk = Math.max(pk, Math.abs(v)); await new Promise(r => setTimeout(r, 40)); } return pk; };
  const idle = await peak(900, () => a.update(60, 0.5, false, 1e9, 0, undefined, 0.04));
  a.setRivals(20, 3); const rival = await peak(900, () => a.update(60, 0.5, false, 12, 110, undefined, 0.04));
  a.setRivals(0, 0); await peak(500, () => a.update(60, 0.5, false, 1e9, 0, undefined, 0.04));
  a.thunder(1); const thunder = await peak(1500, () => a.update(60, 0.5, false, 1e9, 0, undefined, 0.04));
  return `audio state=${a.ctx.state} peak idle=${idle.toFixed(3)} rivalNear=${rival.toFixed(3)} thunder=${thunder.toFixed(3)}`;
};
/** Texture synthesis benchmark without any rendering: main thread vs. worker pool (out/texWorker.js). */
(window as unknown as Record<string, unknown>).texBench = async (size = 1024) => {
  const T = await import('../../src/game/textures');
  const mk = (seedOff: number) => [['mud', 11], ['rock', 22], ['jungle', 33], ['gravel', 57], ['cracked', 68], ['sand', 79]].map(([kind, seed]) => ({ kind: kind as never, palette: ['#4a3a24', '#6a5434', '#8a7048'], size, seed: (seed as number) + seedOff }));
  T.setTextureWorkerFactory(null); let t0 = performance.now(); await T.generateTextures(mk(1000), 8); const sync = Math.round(performance.now() - t0);
  T.setTextureWorkerFactory(() => new Worker('./texWorker.js')); t0 = performance.now(); await T.generateTextures(mk(2000), 8); const par = Math.round(performance.now() - t0);
  return `texBench ${size}px ×6: main thread ${sync} ms · ${T.textureStats.workers} workers ${par} ms (jobs ${T.textureStats.jobMs.join('/')} ms) · cores=${navigator.hardwareConcurrency}`;
};
