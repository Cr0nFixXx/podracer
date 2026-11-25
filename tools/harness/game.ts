import * as THREE from 'three';
import { Game } from '../../src/game/Game';
import { TRACKS } from '../../src/game/data';
import { PRESETS, defaultProfile } from '../../src/game/settings';
import { loadPhotoTextures } from '../../src/game/photoAssets';
import { stepPod, type PodState } from '../../src/game/physics';
import { makeBoostAlarm } from '../../src/game/audio';
if (!location.search.includes('nophoto')) void loadPhotoTextures();
const div = document.createElement('div'); div.style.cssText = 'width:1280px;height:720px;position:fixed;left:0;top:0'; document.body.style.margin = '0'; document.body.appendChild(div);
let g: Game | null = null; let cur = -1;
// Boost alarm without speakers (2026-11-23): renders the alarm's voice at one level on an offline audio context and measures it –
// loudness, pulses per second, pitch, how much of the time it sounds, and the largest step between two samples (a click shows there).
// `tools/harness/palarm.mjs` prints the table. No track needs to be loaded.
(window as unknown as Record<string, unknown>).alarmProbe = async (level: number, seconds = 2.5) => {
  const sr = 24000, ctx = new OfflineAudioContext(1, sr * seconds, sr);
  makeBoostAlarm(ctx, ctx.destination).set(level, 0);
  const d = (await ctx.startRendering()).getChannelData(0), i0 = Math.floor(sr * 0.5), n = d.length - i0; // (the first half second: the parameters glide to their targets)
  let sum = 0, peak = 0, jump = 0; for (let i = i0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); if (i > i0) jump = Math.max(jump, Math.abs(d[i] - d[i - 1])); }
  const win = Math.floor(sr * 0.004), env = new Float32Array(d.length); let acc = 0; // envelope: |x| averaged over 4 ms
  for (let i = 0; i < d.length; i++) { acc += Math.abs(d[i]); if (i >= win) acc -= Math.abs(d[i - win]); env[i] = acc / win; }
  let emax = 0; for (let i = i0; i < d.length; i++) emax = Math.max(emax, env[i]);
  let pulses = 0, on = 0, zc = 0, high = env[i0] >= emax * 0.5;
  for (let i = i0 + 1; i < d.length; i++) {
    if (!high && env[i] >= emax * 0.65) { high = true; pulses++; } else if (high && env[i] < emax * 0.3) high = false; // (two thresholds: the ripple of the tone must not count twice)
    if (env[i] >= emax * 0.5) { on++; if (d[i - 1] < 0 && d[i] >= 0) zc++; }
  }
  const r = (v: number, k = 1000) => Math.round(v * k) / k;
  return { level, rms: r(Math.sqrt(sum / n), 1e4), peak: r(peak, 1e4), pulsesPerSecond: r(pulses / (n / sr), 10), hz: on ? Math.round(zc / (on / sr)) : 0, sounding: r(emax > 1e-5 ? on / n : 0, 100), maxStep: r(jump, 1e4) };
};
// "Which mesh is that?" – the first visible mesh under a point of the picture (x, y: 0 … 1 from the top left). Used by `pdbg.mjs pick:`.
(window as unknown as Record<string, unknown>).pick = (nx: number, ny: number) => {
  const G = (window as unknown as { __podracer: { scene: THREE.Scene; camera: THREE.Camera } }).__podracer;
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), G.camera);
  const shown = (o: THREE.Object3D | null) => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
  const h = rc.intersectObjects(G.scene.children, true).find(q => shown(q.object) && (q.object as THREE.Mesh).isMesh);
  if (!h) return 'nothing';
  const o = h.object as THREE.Mesh, m = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material, g = o.geometry;
  const col = g.attributes.color as THREE.BufferAttribute | undefined, im = o as THREE.InstancedMesh, ic = new THREE.Color();
  if (h.instanceId !== undefined && im.instanceColor) im.getColorAt(h.instanceId, ic);
  const mm = m as unknown as { vertexColors?: boolean; alphaTestNode?: unknown; roughness?: number; color?: THREE.Color };
  return `${o.type} name="${o.name}" material="${m?.name ?? ''}" (${m?.type}, vertexColors=${mm.vertexColors}, dither=${!!mm.alphaTestNode}, roughness=${mm.roughness}) geometry="${g.name}" `
    + `attrs=${Object.keys(g.attributes).join('+')} verts=${g.attributes.position.count} radius=${g.boundingSphere?.radius.toFixed(2)} dist=${h.distance.toFixed(1)}m`
    + (col ? ` vertexColour0=${[col.getX(0), col.getY(0), col.getZ(0)].map(v => v.toFixed(2)).join('/')}` : '')
    + (h.instanceId !== undefined ? ` instance ${h.instanceId}/${im.count}` + (im.instanceColor ? ` instanceColour=${[ic.r, ic.g, ic.b].map(v => v.toFixed(2)).join('/')}` : '') : '')
    // where, and how steep: the hit point (feed it to the view `at_…`), the face's normal.y and the normal.y of its three vertices
    // (the terrain blends rock in by 1 − normal.y, interpolated from the vertices)
    + ` at=${[h.point.x, h.point.y, h.point.z].map(v => v.toFixed(1)).join('_')}`
    + (h.face ? ` faceNy=${h.face.normal.y.toFixed(2)}` + (g.attributes.normal ? ` vertexNy=${[h.face.a, h.face.b, h.face.c].map(k => (g.attributes.normal as THREE.BufferAttribute).getY(k).toFixed(2)).join('/')}` : '') : '');
};
// "What stands in the road?" – rays across every `step`-th sample of every path, parallel to the (banked) road surface at two
// heights, from `margin` metres inside the left edge to `margin` metres inside the right edge. Reports the meshes they hit, clustered
// by mesh and stretch. Used by `pdbg.mjs scan` (2026-11-23: rock walls stood half on the road of the Methan-Derby).
// `only` = material names to test, '+'-separated ('' = everything except the road, liquids, sky and effects – slow: three's raycast
// walks every triangle of every mesh whose bounding sphere the ray touches). `scanRoad(0)` lists the material names of the scene.
(window as unknown as Record<string, unknown>).scanRoad = (step = 4, margin = 2.5, only = 'cliff+cliffBlend+rock+terrain+tunnelWall+caveRock+caveRockFlat', heights = [1.5, 4]) => {
  const G = g!; const rc = new THREE.Raycaster();
  const shown = (o: THREE.Object3D | null) => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
  const matOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material & { alphaTestNode?: unknown };
  const tris = (m: THREE.Mesh) => ((m.geometry.index?.count ?? m.geometry.attributes.position?.count ?? 0) / 3) * ((m as unknown as THREE.InstancedMesh).count ?? 1);
  if (!step) { // the names to choose from
    const seen = new Map<string, [number, number]>();
    G.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const k = `${matOf(m)?.name || '(' + matOf(m)?.type + ')'} / mesh "${m.name}"`, e = seen.get(k) ?? [0, 0]; e[0]++; e[1] += tris(m); seen.set(k, e); });
    return [...seen].sort((a, b) => b[1][1] - a[1][1]).map(([k, [n, t]]) => `${k}: ${n} meshes, ${Math.round(t)} triangles`).join('\n');
  }
  const names = only ? only.split('+') : null, all: THREE.Mesh[] = [];
  G.scene.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return; const mat = matOf(m), n = mat?.name ?? '';
    if (names ? !(names.includes(n) || names.includes(m.name)) : ((m as unknown as THREE.InstancedMesh).isInstancedMesh && !!mat.alphaTestNode) || mat.transparent || /road|ground|water|sky|lava|liquid|snow/i.test(n + m.name)) return;
    all.push(m);
  });
  let cands: THREE.Object3D[] = [], sinceUpdate = 1e9;
  type Hit = { p: number; i: number; lat: number; h: number; key: string; at: string };
  const hits: Hit[] = []; let rays = 0;
  G.td.paths.forEach((path, p) => {
    const S = path.samples;
    for (let i = 0; i < S.length; i += step) {
      const s = S[i]; if (s.gap) continue;
      const L = s.hw - margin; if (L < 2) continue;
      // decor, rock rows and the near / far twins are switched by sector around the camera: look from where the pod would be
      if (++sinceUpdate > 12) { sinceUpdate = 0; G.world.update(G.clock + 5, new THREE.Vector3(s.x, s.y + 3, s.z)); cands = all.filter(shown); }
      for (const h of heights) {
        const y0 = s.y + s.ramp, a = new THREE.Vector3(s.x - s.rx * L, y0 + L * s.bank + h, s.z - s.rz * L), b = new THREE.Vector3(s.x + s.rx * L, y0 - L * s.bank + h, s.z + s.rz * L);
        const d = b.clone().sub(a), len = d.length(); d.normalize(); rc.set(a, d); rc.near = 0; rc.far = len; rays++;
        const hit = rc.intersectObjects(cands, false)[0]; if (!hit) continue;
        const o = hit.object as THREE.Mesh, m = matOf(o);
        hits.push({ p, i, lat: -L + hit.distance, h, key: `${m?.name || m?.type} / mesh "${o.name}" / geometry "${o.geometry.name}"`, at: [hit.point.x, hit.point.y, hit.point.z].map(v => v.toFixed(1)).join('_') });
      }
    }
  });
  // cluster: same mesh key, same path, sample indices closer than 40
  hits.sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : x.p - y.p || x.i - y.i);
  const out: string[] = [`rays=${rays} hits=${hits.length} meshes tested=${all.length} (${Math.round(all.reduce((t, m) => t + tris(m), 0))} triangles)`]; let k = 0;
  while (k < hits.length) {
    let e = k; while (e + 1 < hits.length && hits[e + 1].key === hits[k].key && hits[e + 1].p === hits[k].p && hits[e + 1].i - hits[e].i <= 40) e++;
    const c = hits.slice(k, e + 1), lats = c.map(q => q.lat), hw = G.td.paths[c[0].p].samples[c[0].i].hw, mid = c[Math.floor(c.length / 2)];
    out.push(`${c[0].key}  path ${c[0].p} ${c[0].i}-${c[c.length - 1].i}  n=${c.length}  lat ${Math.min(...lats).toFixed(0)}..${Math.max(...lats).toFixed(0)} (hw ${hw.toFixed(0)})  heights ${[...new Set(c.map(q => q.h))].join('/')}  e.g. sample ${mid.i} at=${mid.at}`);
    k = e + 1;
  }
  return out.join('\n');
};
(window as unknown as Record<string, unknown>).track = async (i: number, view: string) => {
  if (cur !== i) {
    g?.dispose(); cur = i;
    const prof = defaultProfile(); prof.race.trackId = TRACKS[i].id; prof.race.opponents = 7; prof.gfx.texRes = 1024; if (location.search.includes('webgl')) prof.gfx.backend = 'webgl'; if (location.search.includes('csm')) prof.gfx.csm = true; if (location.search.includes('ssr')) prof.gfx.ssr = true;
    { const qs = new URLSearchParams(location.search); if (qs.get('tod')) prof.race.timeOfDay = qs.get('tod') as never; if (qs.get('wx')) prof.race.weather = qs.get('wx') as never; if (qs.has('ultra')) Object.assign(prof.gfx, PRESETS.ultra, { preset: 'ultra', texRes: 1024, renderScale: 0.6 }); if (qs.get('tex')) prof.gfx.texRes = +qs.get('tex')!; if (qs.get('pod')) prof.podId = qs.get('pod')!; if (qs.get('fx')) prof.gfx.particles = +qs.get('fx')!; /* fx=1: particle amount of the „Hoch" preset (the harness default is 0.2 – a plume looks five times thinner than in the game) */ /* pod=brute: the player's pod */ /* tex=256: small textures for the WebGPU console check on machines with little RAM */ } prof.gfx.renderScale = 0.6; prof.gfx.shadows = 1;
    g = new Game(div, prof, { onHud: () => {}, onLoading: () => {}, onFinish: () => {}, onPause: () => {}, onReady: () => {} });
    (window as unknown as Record<string, unknown>).__podracer = g; // debug / test handle, as in the app (RaceView.tsx)
    const tLoad = performance.now(); await g.start(); (window as unknown as Record<string, unknown>).loadInfo = `load=${Math.round(performance.now() - tLoad)}ms ` + JSON.stringify(g.world.timings) + ' ' + JSON.stringify((g as unknown as { loadMs?: unknown }).loadMs ?? {}); g.paused = true; await new Promise(r => setTimeout(r, 400));
  }
  const G = g!; G.paused = true; if (G.state === 'intro') G.state = 'countdown'; // (a fly_ view of an earlier call)
  let chase = false;
  G.lensWet = 0; G.updateLens(0); // a dry lens for every view (spray of an earlier view must not leak into this one)
  (window as unknown as Record<string, unknown>).coverInfo = ''; // per-view info line (probe / decor views fill it) – reset so it never leaks into the next view
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
  } else if (view === 'f') { // close-up of the first alpha-mapped decor instance (HQ tree)
    let found: THREE.InstancedMesh | null = null;
    G.scene.traverse(o => { const im = o as THREE.InstancedMesh; if (!found && im.isInstancedMesh && im.visible && (im.material as THREE.MeshStandardMaterial).alphaMap && im.count > 0) found = im; });
    if (found) { const m = new THREE.Matrix4(); (found as THREE.InstancedMesh).getMatrixAt(0, m); const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); m.decompose(p, q, sc); (found as THREE.InstancedMesh).visible = true; G.camera.position.set(p.x + 21 * sc.x, p.y + 9 * sc.y, p.z + 17 * sc.x); G.camera.lookAt(p.x, p.y + 11.5 * sc.y, p.z); }
  } else if (view.startsWith('g_')) { // Session 20: close-up of a named decor geometry – g_<geometry.name>[_<instance>[_<distance factor ×10>]], e.g. g_boulder, g_cactus_3
    const [, name, kStr, dStr] = view.split('_'); let found: THREE.InstancedMesh | null = null;
    G.scene.traverse(o => { const im = o as THREE.InstancedMesh; if (!found && im.isInstancedMesh && im.geometry.name === name && im.count > 0) found = im; });
    if (found) {
      const im = found as THREE.InstancedMesh, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      im.getMatrixAt(Math.min(im.count - 1, +(kStr ?? 0) || 0), m); m.decompose(p, q, sc); im.visible = true;
      const bs = im.geometry.boundingSphere!, R = bs.radius * sc.x * (dStr ? +dStr / 10 : 1.7), sun = G.sunDir ?? new THREE.Vector3(0.5, 0.6, 0.4);
      const side = new THREE.Vector3(sun.x, 0, sun.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7); // from the lit side, 40° off the sun
      G.camera.position.set(p.x + side.x * R, p.y + bs.center.y * sc.y + R * 0.38, p.z + side.z * R); G.camera.lookAt(p.x, p.y + bs.center.y * sc.y, p.z);
      (window as unknown as Record<string, unknown>).coverInfo = `decor ${name} tris=${(im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3} scale=${sc.x.toFixed(1)} instances=${im.count}`;
    } else (window as unknown as Record<string, unknown>).coverInfo = `decor ${name}: not found`;
  } else if (view === 'j' && G.td.crossings.length) { // crossing: from the lower approach looking at the overpass bridge + underpass
    const cx = G.td.crossings[0], S = G.td.main.samples, N = S.length;
    const a = S[((cx.lowerFrom - 26) % N + N) % N], b = S[((cx.lowerIdx) % N + N) % N];
    G.camera.position.set(a.x, a.y + 5.5, a.z); G.camera.lookAt(b.x, b.y + 14, b.z);
  } else if (view === 'q') { // branching cave Y-junction view
    const cb = G.td.paths.find(p => p.isCave);
    if (cb) { const S = G.td.main.samples, N = S.length, a = S[((cb.mainFrom - 4) % N + N) % N], b = cb.samples[Math.min(28, cb.samples.length - 1)]; G.camera.position.set(a.x, a.y + 4.8, a.z); G.camera.lookAt(b.x, b.y + 3.2, b.z); }
  } else if (view === 'o') { // the widest point of the track (open flat), seen from 16 m above the road edge
    const S = G.td.main.samples, N = S.length; let k = 0; for (let j = 0; j < N; j++) if (S[j].hw > S[k].hw) k = j;
    const a = S[(k - 60 + N) % N], b = S[(k + 40) % N]; G.camera.position.set(a.x + a.rx * a.hw * 0.7, a.y + 16, a.z + a.rz * a.hw * 0.7); G.camera.lookAt(b.x, b.y, b.z);
  } else if (view === 's') { // look from above the road towards the sun (lens flare / god-ray / glare check)
    const S = G.td.main.samples, a = S[Math.floor(S.length * 0.2)];
    G.camera.position.set(a.x, a.y + 6, a.z); G.camera.lookAt(a.x + G.sunDir.x * 100, a.y + 6 + G.sunDir.y * 60, a.z + G.sunDir.z * 100);
  } else if (view.startsWith('at_')) { // camera at a world position looking at another: at_<x>_<y>_<z>_<tx>_<ty>_<tz> (positions as `pick` prints them)
    const v = view.split('_').slice(1).map(Number); G.camera.position.set(v[0], v[1], v[2]); G.camera.lookAt(v[3], v[4], v[5]);
  } else if (/^p\d/.test(view)) { // generic probe: p<idx>_<lat>_<height>_<ahead>_<path>_<lookLat>_<lookHeight> – camera on sample idx looking `ahead` samples forward
    const [i0, lat = 0, hh = 5, ahead = 40, pi = 0, lLat = 0, lH = 3] = view.slice(1).split('_').map(Number);
    const P = G.td.paths[pi] ?? G.td.main, S = P.samples, N = S.length, W = (k: number) => P.closed ? S[((k % N) + N) % N] : S[Math.max(0, Math.min(N - 1, k))];
    const a = W(i0), b = W(i0 + ahead);
    G.camera.position.set(a.x + a.rx * lat, a.y + a.ramp - lat * a.bank + hh, a.z + a.rz * lat); G.camera.lookAt(b.x + b.rx * lLat, b.y + b.ramp - lLat * b.bank + lH, b.z + b.rz * lLat);
    (window as unknown as Record<string, unknown>).coverInfo = `probe idx=${i0} roof=${a.roof} tun=${a.tun ?? 0} hw=${a.hw.toFixed(1)} bank=${a.bank.toFixed(3)} surf=${(a as unknown as { surf?: number }).surf ?? '-'}`;
  } else if (view === 'n') { // towards the gas giant in the sky of Oovo IV (Session 20)
    const a = G.td.main.samples[300]; let dir: THREE.Vector3 | null = null; G.scene.traverse(o => { if (o.userData.dir) dir = o.userData.dir as THREE.Vector3; });
    G.camera.position.set(a.x, a.y + 5, a.z); if (dir) G.camera.lookAt(a.x + (dir as THREE.Vector3).x, a.y + 5 + (dir as THREE.Vector3).y * 0.6, a.z + (dir as THREE.Vector3).z);
  } else if (view === 'top' || view === 'topw' || view === 'topf') { // the player's pod pushed up against the vault of the first standard tunnel (top: at the crown, nose up · topw: beside the wall, level · topf: as topw, seen from the front – both engine sides under the flank of the vault) – no part of the model may stand in the shell
    const S = G.td.main.samples; let a0 = S.findIndex((q, j) => j > 50 && q.roof > 0 && q.tun === 1); if (a0 < 0) a0 = 100;
    const s = S[a0 + 45], pl = G.player, wall = view !== 'top', lat = wall ? s.wallR - 6 : 0, x0 = s.x + s.rx * lat, z0 = s.z + s.rz * lat, speed = wall ? 100 : 0;
    pl.pos.set(x0, s.y + 6, z0); pl.yaw = Math.atan2(s.tx, s.tz); pl.path = 0; pl.idx = a0 + 45; pl.dead = 0; pl.invuln = 99; pl.inRoof = true; pl.upper = false; pl.grounded = false;
    for (let k = 0; k < 260; k++) { pl.pos.x = x0; pl.pos.z = z0; pl.vel.set(s.tx * speed, 9, s.tz * speed); pl.input.pitch = 0; pl.input.roll = 0; stepPod(pl, G.td, 1 / 60, G.clock + k / 60, 1, false); }
    pl.pos.x = x0; pl.pos.z = z0; pl.invuln = 0; G.updateVisuals(); // (an invulnerable pod blinks: it would be invisible in every other shot)
    (window as unknown as Record<string, unknown>).coverInfo = `pod ${pl.def.id} at the vault: ${(pl.pos.y - s.y).toFixed(2)} m above the road (roof ${s.roof} m), pitch ${pl.pitch.toFixed(2)}, lat ${lat.toFixed(1)}`;
    const side = wall ? -1 : 1; // (beside the wall: seen from the middle of the tunnel)
    if (view === 'topf') { G.camera.position.set(x0 - s.rx * 6 + s.tx * 26, pl.pos.y + 1, z0 - s.rz * 6 + s.tz * 26); G.camera.lookAt(x0 + s.rx * 1.5, pl.pos.y + 1.5, z0 + s.rz * 1.5); }
    else { G.camera.position.set(x0 + s.rx * side * 15 + s.tx * 9, pl.pos.y - 2.5, z0 + s.rz * side * 15 + s.tz * 9); G.camera.lookAt(x0 + s.tx * 4, pl.pos.y + 2.5, z0 + s.tz * 4); }
  } else if (view.startsWith('chase_')) { // the player's own view: chase_<idx>[_<lat>[_<speed m/s>]] – the pod on the main road at that sample, the real chase camera, field of view and head lamp (2026-11-23: "how far can I see at night in a storm?")
    const [, i0, l0, v0] = view.split('_'); const S = G.td.main.samples, idx = (+i0) % S.length, s = S[idx], lat = +(l0 ?? 0), speed = +(v0 ?? 100), pl = G.player;
    const x0 = s.x + s.rx * lat, z0 = s.z + s.rz * lat;
    pl.pos.set(x0, s.y + s.ramp + 2.85, z0); pl.yaw = Math.atan2(s.tx, s.tz); pl.path = 0; pl.idx = idx; pl.dead = 0; pl.invuln = 99; pl.grounded = true; pl.inRoof = s.roof > 0; pl.upper = false;
    for (let k = 0; k < 40; k++) { pl.pos.x = x0; pl.pos.z = z0; pl.vel.set(s.tx * speed, 0, s.tz * speed); pl.yaw = Math.atan2(s.tx, s.tz); stepPod(pl, G.td, 1 / 60, G.clock + k / 60, 1, false); }
    pl.pos.x = x0; pl.pos.z = z0; pl.invuln = 0; G.lensWet = 0; G.updateVisuals(); G.updateLens(1); for (let k = 0; k < 10; k++) G.updateCamera(0.5); // (updateLens: spray of the pod's own wake has settled on the lens)
    chase = true;
    // three seconds of weather around that camera (rain streaks, snow, gust banks need time to fill the air)
    { const W = (G as unknown as { weather?: { update: (dt: number, t: number, cam: THREE.Camera, frozen: boolean, thunder: (v: number) => void, near: (v: number) => void) => void } }).weather; if (W) for (let k = 0; k < 90; k++) { G.clock += 1 / 30; W.update(1 / 30, G.clock, G.camera, false, () => {}, () => {}); } }
  } else if (view.startsWith('plough_')) { // 3D snow (2026-11-23): plough_<idx>[_<lat>[_<speed m/s>[_<seconds>[_<rivals>[_<side camera m>[_<boost 0|1>]]]]]] – the player flies the last
    // seconds up to that sample in the REAL game loop (physics, particles, camera), held on its line `lat` m beside the centre:
    // it cuts its trench and throws the snow up. `rivals` (0–3): that many rivals fly ahead of it, 45 m apart, 9 m further left each.
    const [, i0, l0, v0, t0, r0, c0, b0] = view.split('_'); const S = G.td.main.samples, N = S.length, lat = +(l0 ?? 0), speed = +(v0 ?? 110), secs = +(t0 ?? 1.6), nRiv = Math.min(3, +(r0 ?? 0)), side = +(c0 ?? 0), pl = G.player;
    const W = (k: number) => S[((k % N) + N) % N];
    const put = (q: PodState, idx: number, la: number) => { const s = W(idx); q.pos.set(s.x + s.rx * la, s.y + s.ramp + 2.85, s.z + s.rz * la); q.yaw = Math.atan2(s.tx, s.tz); q.yawRate = 0; q.vel.set(s.tx * speed, 0, s.tz * speed); q.path = 0; q.idx = ((idx % N) + N) % N; q.dead = 0; q.invuln = 0; q.grounded = true; q.inRoof = s.roof > 0; q.upper = false; };
    const hold = (q: PodState, la: number) => { const s = S[q.idx], al = (q.pos.x - s.x) * s.tx + (q.pos.z - s.z) * s.tz, v = Math.hypot(q.vel.x, q.vel.z); q.pos.x = s.x + s.tx * al + s.rx * la; q.pos.z = s.z + s.tz * al + s.rz * la; q.yaw = Math.atan2(s.tx, s.tz); q.yawRate = 0; q.vel.x = s.tx * v; q.vel.z = s.tz * v; };
    const start = +i0 - Math.round(secs * speed / 2), riv = G.pods.filter(q => q !== pl).slice(0, nRiv);
    G.td.snow?.snowIn(9); // an untouched field for every view (the trenches of an earlier view would still be there)
    { const g0 = S[G.td.startIdx]; for (const q of G.pods) if (q !== pl && !riv.includes(q)) { q.pos.set(g0.x, g0.y + 2.85, g0.z); q.vel.set(0, 0, 0); q.path = 0; q.idx = G.td.startIdx; } } // rivals of an earlier view: back to the start
    put(pl, start, lat); riv.forEach((q, k) => put(q, start + 22 * (k + 1), lat - 9 * (k + 1)));
    G.state = 'race'; (G as unknown as { keys: Set<string> }).keys.add('KeyW');
    // `?hold=ArrowUp,…`: further keys held down for the whole flight (2026-11-25: sink in a zero-G tube)
    const held = (new URLSearchParams(location.search).get('hold') ?? '').split(',').filter(Boolean); for (const c of held) (G as unknown as { keys: Set<string> }).keys.add(c);
    // a 7th value of 1: the player (and the rivals of this view) boost for the last 0.7 s – flames, heat, alarm
    const boostFrom = b0 === '1' ? secs * 60 - 42 : 1e9;
    for (let k = 0; k < secs * 60; k++) { if (k >= boostFrom) { (G as unknown as { keys: Set<string> }).keys.add('ShiftLeft'); for (const q of riv) { q.heat = 0; if (q.ai) q.ai.boostUntil = G.raceTime + 2; } } G.update(1 / 60); hold(pl, lat); riv.forEach((q, j) => hold(q, lat - 9 * (j + 1))); if (k % 2 === 0) G.updateVisuals(); }
    (G as unknown as { keys: Set<string> }).keys.delete('ShiftLeft'); for (const c of held) (G as unknown as { keys: Set<string> }).keys.delete(c);
    G.updateVisuals(); G.updateLens(1); for (let k = 0; k < 10; k++) G.updateCamera(0.5); // (the lens keeps what the weather and the wake put on it)
    chase = true;
    // a 6th value: instead of the chase camera, a camera that many metres to the right of the pod (negative: left), 14 m ahead of it, looking back at it
    if (side) { const s = S[pl.idx]; G.camera.position.set(pl.pos.x + s.rx * side + s.tx * 14, pl.pos.y + 1.6, pl.pos.z + s.rz * side + s.tz * 14); G.camera.up.set(0, 1, 0); G.camera.lookAt(pl.pos.x - s.tx * 4, pl.pos.y - 0.6, pl.pos.z - s.tz * 4); G.camera.fov = 62; }
    (window as unknown as Record<string, unknown>).coverInfo = `probe plough: player at sample ${pl.idx}, ${Math.hypot(pl.vel.x, pl.vel.z).toFixed(0)} m/s, ${(pl.pos.y - pl.groundY).toFixed(2)} m above the ground${pl.zeroG ? ' (zero-G)' : ''}, snow ahead ${(pl.snowDepth ?? 0).toFixed(2)} m, cut ${(pl.snowPack ?? 0).toFixed(2)}`;
  } else if (view.startsWith('ram_')) { // 2026-11-25: ram_<idx>[_<rams>[_<m/s across>]] – the player rams the Gegner flying beside it, in the REAL
    // game loop: sparks and smoke at the Gegner, the Treffermarke on its hull, the HUD line. Before every ram the two are put side
    // by side again (the Gegner 11 m ahead of the chase camera's left edge: both are in the picture).
    const [, i0, n0, v0] = view.split('_'); const S = G.td.main.samples, N = S.length, pl = G.player, rv = G.pods.find(q => q !== pl)!, rams = +(n0 ?? 1), across = +(v0 ?? 18), speed = 110;
    const put = (q: PodState, idx: number, la: number, al: number) => { const s = S[((idx % N) + N) % N]; q.pos.set(s.x + s.rx * la + s.tx * al, s.y + s.ramp + 2.85, s.z + s.rz * la + s.tz * al); q.yaw = Math.atan2(s.tx, s.tz); q.yawRate = 0; q.vel.set(s.tx * speed, 0, s.tz * speed); q.path = 0; q.idx = ((idx % N) + N) % N; q.dead = 0; q.invuln = 0; q.grounded = true; q.inRoof = s.roof > 0; q.upper = false; };
    { const g0 = S[G.td.startIdx]; for (const q of G.pods) if (q !== pl && q !== rv) { q.pos.set(g0.x, g0.y + 2.85, g0.z); q.vel.set(0, 0, 0); q.path = 0; q.idx = G.td.startIdx; } }
    G.state = 'race'; (G as unknown as { keys: Set<string> }).keys.add('KeyW');
    put(pl, +i0, -5, 0); put(rv, +i0, 5, 0); for (let k = 0; k < 30; k++) { G.update(1 / 60); put(pl, pl.idx, -5, 0); put(rv, pl.idx, 5, 0); }
    const log: string[] = [];
    for (let r = 0; r < rams; r++) {
      const at = pl.idx; put(pl, at, -5, 0); put(rv, at, 5, 0);
      const h0 = [pl.hpL + pl.hpR, rv.hpL + rv.hpR]; let hit = false;
      for (let k = 0, after = 0; k < 30; k++) {
        if (hit && r === rams - 1 && ++after > 5 && !view.split('_')[5]) break; // the picture: six frames after the last hit (a 5th value: half a second later)
        if (!hit) { // until they touch: the Gegner holds its line (its AI would steer back to its own), the player comes across at `across` m/s
          const s = S[pl.idx], vt = pl.vel.x * s.tx + pl.vel.z * s.tz; pl.vel.x = s.tx * vt + s.rx * across; pl.vel.z = s.tz * vt + s.rz * across;
          const q = S[rv.idx], al = (rv.pos.x - q.x) * q.tx + (rv.pos.z - q.z) * q.tz, vr = Math.hypot(rv.vel.x, rv.vel.z); rv.pos.x = q.x + q.tx * al + q.rx * 5; rv.pos.z = q.z + q.tz * al + q.rz * 5; rv.vel.x = q.tx * vr; rv.vel.z = q.tz * vr; rv.yaw = Math.atan2(q.tx, q.tz);
        }
        G.update(1 / 60); if (k % 2 === 0) G.updateVisuals();
        hit = hit || pl.hpL + pl.hpR < h0[0] || rv.hpL + rv.hpR < h0[1];
      }
      log.push(`ram ${r + 1}: player −${(h0[0] - pl.hpL - pl.hpR).toFixed(1)}, Gegner −${(h0[1] - rv.hpL - rv.hpR).toFixed(1)}`);
    }
    G.updateVisuals(); for (let k = 0; k < 10; k++) G.updateCamera(0.5);
    chase = true;
    // a 4th value of 1: a camera close behind the Gegner, on the side it was hit from (Treffermarke, smoke)
    if (view.split('_')[4] === '1') { const s = S[rv.idx]; G.camera.position.set(rv.pos.x - s.rx * 4.5 - s.tx * 9, rv.pos.y + 2.2, rv.pos.z - s.rz * 4.5 - s.tz * 9); G.camera.up.set(0, 1, 0); G.camera.lookAt(rv.pos.x + s.tx * 2, rv.pos.y, rv.pos.z + s.tz * 2); G.camera.fov = 55; }
    (window as unknown as Record<string, unknown>).coverInfo = `probe ${log.join(' · ')} · Gegner ${rv.name}: engines ${rv.hpL.toFixed(0)} / ${rv.hpR.toFixed(0)}, parts lost ${(rv.parts ?? 0).toString(2)}, dead ${rv.dead > 0} · player engines ${pl.hpL.toFixed(0)} / ${pl.hpR.toFixed(0)} · HUD ${JSON.stringify(G.hud().ram)}`;
  } else if (view.startsWith('fly_')) { // the intro flight (2026-11-23): fly_<metres into the pass> – the game's own flight camera, field of view and shadows
    G.startIntro(); G.flightDist = +view.slice(4); for (let k = 0; k < 12; k++) G.updateCamera(0.5);
    chase = true;
    (window as unknown as Record<string, unknown>).coverInfo = `intro flight at ${G.flightDist} m of ${G.flight!.length} m: sample ${G.flight!.sampleAt(G.flightDist)}, ${G.flight!.heightAt(G.flight!.sampleAt(G.flightDist)).toFixed(1)} m above the road, ${G.flight!.speedAt(G.flightDist).toFixed(0)} m/s`;
  } else if (view === 'r') { // 3.4 s of real racing (AI + player idle) so exhaust/dust particles, banking and engine heave are live
    G.state = 'race'; (G as unknown as { keys: Set<string> }).keys.add('KeyW'); for (let k = 0; k < 170; k++) { G.update(1 / 60); if (k % 3 === 0) G.updateVisuals(); } G.updateCamera(0.5);
  } else { G.updateCamera(0.5); }
  if (!chase) G.camera.fov = 70; G.camera.updateProjectionMatrix(); G.sky.mesh.position.copy(G.camera.position);
  const fwd = G.camera.getWorldDirection(new THREE.Vector3());
  // (2026-11-23: the game's own placement of the shadows – box, depth and cascades as in a race. The single map is centred `ahead`
  //  metres in front of the given point; a probe camera has no pod, so the box goes where the camera looks.)
  if (!chase) { const h = Math.hypot(fwd.x, fwd.z) || 1; G.placeShadow(G.camera.position.x, G.camera.position.y, G.camera.position.z, fwd.x / h, fwd.z / h); }
  { const rt = new URLSearchParams(location.search).get('rt'); if (rt) { G.raceTime = +rt; G.applyEnv(0, true); } }
  G.updateVisuals(); G.updateLights(); G.updateShields(0.5); G.world.update(G.clock + 5, G.camera.position);
  G.world.setPieces.update(G.clock, G.raceTime, G.pods, 0, false); // (views that step the physics themselves never run the game loop: rotors, gates and the boulders of the zero-G tubes would stand where they were built)
  if (location.search.includes('bright') && !G.scene.getObjectByName('dbgAmb')) { const al = new THREE.AmbientLight(0xffffff, 2.5); al.name = 'dbgAmb'; G.scene.add(al); } // diagnostic fill light (caves)
  if (location.search.includes('flash')) { G.sky.uniforms.flash.value = 0.9; G.hemi.intensity = 1.75; }
  if (location.search.includes('live')) { // live graphics switching: toggle everything that is switchable at runtime, render, toggle back
    const g0 = G.profile.gfx; G.render(0.016); await new Promise(r => setTimeout(r, 300));
    G.applyLiveGfx({ ...g0, volumetrics: 0, anisotropy: 2, bloom: !g0.bloom, ao: !g0.ao, godRays: !g0.godRays, aa: g0.aa === 'fxaa' ? 'smaa' : 'fxaa', shadows: g0.shadows ? 0 : 2, particles: 0.5, drawDistance: 0.8, motionBlur: !g0.motionBlur });
    await new Promise(r => setTimeout(r, 1500)); G.render(0.016); await new Promise(r => setTimeout(r, 600));
    G.applyLiveGfx({ ...g0, shadows: 2, lensFx: false, cinematic: !g0.cinematic }); await new Promise(r => setTimeout(r, 1500));
    (window as unknown as Record<string, unknown>).coverInfo = 'live-switch ok';
  }
  if (location.search.includes('wetnow')) { G.wet = 1; G.wetTarget = 1; }
  if (location.search.includes('ptest')) { // particle pool self-test: 300 big red (alpha pool) + 300 green (additive pool) particles 25 m ahead of the camera
    const f = G.camera.getWorldDirection(new THREE.Vector3()), c = G.camera.position, P = G.particles, v0 = new THREE.Vector3();
    for (let i = 0; i < 300; i++) {
      const p = new THREE.Vector3(c.x + f.x * 25 + (Math.random() - 0.5) * 16, c.y + f.y * 25 + (Math.random() - 0.5) * 6, c.z + f.z * 25 + (Math.random() - 0.5) * 16);
      if (location.search.includes('ptest2')) P.alpha.spawn(p, new THREE.Vector3(f.x * 60, 2, f.z * 60), 1.1, 1.5, 9, new THREE.Color(0xff0000), new THREE.Color(0xff0000), 0.42, 3.2, -0.5); // dust-like parameters, red
      else (i % 2 ? P.alpha : P.add).spawn(p, v0, 5, 2.5, 2.5, new THREE.Color(i % 2 ? 0xff0000 : 0x00ff00), new THREE.Color(i % 2 ? 0xff0000 : 0x00ff00), 1, 0.1, 0);
    }
    P.update(location.search.includes('ptest2') ? 0.2 : 1.25, c, G.clock);
    (window as unknown as Record<string, unknown>).coverInfo = `ptest alphaLive=${(P.alpha as unknown as { live: number }).live} addLive=${(P.add as unknown as { live: number }).live} count=${P.alpha.sprite.count}`;
  }
  (G.particles.alpha as unknown as { fullUpload: () => void }).fullUpload(); (G.particles.add as unknown as { fullUpload: () => void }).fullUpload(); // the harness runs many updates without rendering
  for (let k = 0; k < 3; k++) { G.render(0.016); await new Promise(r => setTimeout(r, 900)); }
  return `${(window as unknown as Record<string, unknown>).loadInfo ?? ''} ${(window as unknown as Record<string, unknown>).coverInfo ?? ''} ${G.backend} ${TRACKS[i].id}/${view} calls=${(G.renderer.info.render as unknown as { drawCalls?: number }).drawCalls ?? G.renderer.info.render.calls} tris=${G.renderer.info.render.triangles}`; // (calls = draw calls of the last frame; `render.calls` only counts render passes since the start)
};
/** Session 20 – frame-time benchmark of one view: positions the camera like `track(i, view)`, then times `n` full frames (synchronised with readPixels).
 *  Software rendering (SwiftShader) → only useful to COMPARE views / builds, not as an absolute FPS figure. */
(window as unknown as Record<string, unknown>).bench = async (i: number, view: string, n = 6) => {
  const info = String(await (window as unknown as { track: (i: number, v: string) => Promise<string> }).track(i, view)); const G = g!;
  const gl = (G.renderer as unknown as { backend?: { gl?: WebGL2RenderingContext } }).backend?.gl;
  const t0 = performance.now();
  const px = new Uint8Array(4); // readPixels blocks until the frame is really rendered (gl.finish() does not in Chrome)
  for (let k = 0; k < n; k++) { G.render(0.016); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); else await new Promise(r => setTimeout(r, 50)); }
  const ms = (performance.now() - t0) / n;
  return `${info.trim().split(' ').slice(-3, -2).join(' ')} bench ${ms.toFixed(0)} ms/frame = ${(1000 / ms).toFixed(1)} fps (${gl ? 'readPixels sync' : 'no gl'})`;
};
/** Physics/collision stress test without rendering: AI opponents race `secs` seconds. */
(window as unknown as Record<string, unknown>).sim = async (i: number, secs: number) => {
  if (cur !== i) {
    g?.dispose(); cur = i;
    const prof = defaultProfile(); prof.race.trackId = TRACKS[i].id; prof.race.opponents = 10; prof.gfx.texRes = 512; prof.gfx.geometry = 1; prof.gfx.shadows = 0; prof.gfx.particles = 0.2;
    g = new Game(div, prof, { onHud: () => {}, onLoading: () => {}, onFinish: () => {}, onPause: () => {}, onReady: () => {} });
    (window as unknown as Record<string, unknown>).__podracer = g; // debug / test handle, as in the app (RaceView.tsx)
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
