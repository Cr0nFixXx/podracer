import * as THREE from 'three';
import { Game } from '../../src/game/Game';
import { TRACKS } from '../../src/game/data';
import { defaultProfile, PRESETS } from '../../src/game/settings';
const div = document.createElement('div'); div.style.cssText = 'width:1280px;height:720px;position:fixed;left:0;top:0'; document.body.style.margin = '0'; document.body.appendChild(div);
let g: Game | null = null; let cur = -1;
(window as unknown as Record<string, unknown>).track = async (i: number, view: string) => {
  if (cur !== i) {
    g?.dispose(); cur = i;
    const prof = defaultProfile(); prof.race.trackId = TRACKS[i].id; prof.race.opponents = 7; prof.gfx.texRes = 1024; if (location.search.includes('webgl')) prof.gfx.backend = 'webgl'; prof.gfx.renderScale = 0.6; prof.gfx.shadows = 1;
    if (location.search.includes('csm')) prof.gfx.csm = true;
    if (location.search.includes('ultra')) { Object.assign(prof.gfx, PRESETS.ultra, { renderScale: 0.6, texRes: 1024, shadows: 2 }); }
    g = new Game(div, prof, { onHud: () => {}, onLoading: () => {}, onFinish: () => {}, onPause: () => {}, onReady: () => {} });
    await g.start(); g.paused = true; await new Promise(r => setTimeout(r, 400));
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
  } else if (view === 'w') { // first waterfall / lavafall / icefall (session 12)
    let f: THREE.Mesh | null = null; G.scene.traverse(o => { if (!f && o.userData.fall) f = o as THREE.Mesh; });
    if (f) { const g0 = (f as THREE.Mesh).geometry; const nv = (f as THREE.Mesh).userData.fallVerts ?? g0.attributes.position.count; // first fall only
      const bb = new THREE.Box3(); const pa = g0.attributes.position as THREE.BufferAttribute; for (let k = 0; k < Math.min(nv, pa.count); k++) bb.expandByPoint(new THREE.Vector3(pa.getX(k), pa.getY(k), pa.getZ(k))); const g = g0; const c = bb.getCenter(new THREE.Vector3()); const sz = bb.getSize(new THREE.Vector3());
      const p0 = new THREE.Vector3((g.attributes.position as THREE.BufferAttribute).getX(0), 0, (g.attributes.position as THREE.BufferAttribute).getZ(0));
      const dir = new THREE.Vector3(c.x - p0.x, 0, c.z - p0.z).normalize(); const R = Math.max(sz.x, sz.y, sz.z) * 1.3 + 20;
      G.camera.position.set(c.x + dir.x * R + dir.z * R * 0.4, c.y + sz.y * 0.1, c.z + dir.z * R - dir.x * R * 0.4); G.camera.lookAt(c.x, c.y, c.z); }
  } else if (view === 'p') { // perched birds (session 15): every flock on its perch, camera next to the first one
    const pt = G.world.group.userData.perchTest?.() as { x: number; y: number; z: number; r: number } | null;
    if (pt) { G.camera.position.set(pt.x + pt.r + 5, pt.y + 1.8, pt.z + pt.r + 3.5); G.camera.lookAt(pt.x, pt.y, pt.z); }
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
  } else { G.updateCamera(0.5); }
  G.camera.fov = 70; G.camera.updateProjectionMatrix(); G.sky.mesh.position.copy(G.camera.position);
  const fwd = G.camera.getWorldDirection(new THREE.Vector3()); const t = G.camera.position.clone().addScaledVector(fwd, 50);
  G.sun.target.position.copy(t); G.sun.position.copy(t).addScaledVector(G.sunDir, 400);
  G.updateVisuals(); G.world.update(G.clock + 5, G.camera.position);
  if (location.search.includes('wet')) G.post.cine.uniforms.wet.value = 1; // lens droplet test
  for (let k = 0; k < 3; k++) { G.render(0.016); await new Promise(r => setTimeout(r, 900)); }
  // perf metrics: visible meshes in the camera frustum, shadow casters, wall time per frame (SwiftShader – relative only)
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(G.camera.projectionMatrix, G.camera.matrixWorldInverse));
  let vis = 0, cast = 0, triV = 0; G.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; let v = true; let q: THREE.Object3D | null = m; while (q) { if (!q.visible) { v = false; break; } q = q.parent; } if (!v) return; if (m.castShadow) cast++; if (!m.frustumCulled) { vis++; return; } if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); const bs = ((m as THREE.InstancedMesh).isInstancedMesh && (m as THREE.InstancedMesh).boundingSphere) ? (m as THREE.InstancedMesh).boundingSphere!.clone() : m.geometry.boundingSphere!.clone(); bs.applyMatrix4(m.matrixWorld); if (fr.intersectsSphere(bs)) { vis++; const g = m.geometry; triV += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1); } });
  let podM = 0; const podSet = new Set<THREE.Object3D>(); for (const pp of G.pods) if (pp.visual) podSet.add(pp.visual.group);
  const byType = new Map<string, number>();
  G.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || !m.visible) return; let q: THREE.Object3D | null = m; let inPod = false; while (q) { if (podSet.has(q)) inPod = true; if (!q.visible) return; q = q.parent; } if (inPod) podM++; else { const k = (m as THREE.InstancedMesh).isInstancedMesh ? 'inst' : (m as unknown as { isBatchedMesh?: boolean }).isBatchedMesh ? 'batch' : 'mesh'; byType.set(k, (byType.get(k) ?? 0) + 1); } });
  (window as unknown as Record<string, unknown>).coverInfo = `podMeshes=${podM} pods=${G.pods.length} other=${JSON.stringify(Object.fromEntries(byType))}`;
  const t0 = performance.now(); for (let k = 0; k < 4; k++) { G.render(0.016); await new Promise(r => requestAnimationFrame(() => r(0))); } const ms = (performance.now() - t0) / 4;
  return `meshesInView=${vis} trisInView=${(triV / 1e6).toFixed(2)}M casters=${cast} frame=${ms.toFixed(0)}ms ${(window as unknown as Record<string, unknown>).coverInfo ?? ''} ${G.backend} ${TRACKS[i].id}/${view} calls=${G.renderer.info.render.calls} tris=${G.renderer.info.render.triangles}`;
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
  // damage forensics: last events per pod (events are consumed inside G.update, so hook push)
  const evLog: string[][] = G.pods.map(() => []);
  G.pods.forEach((p, di) => { const arr = p.events; const orig = arr.push.bind(arr); (arr as unknown as { push: (...e: typeof arr) => number }).push = (...e) => { for (const ev of e) { evLog[di].push(`${ev.type[0]}${Math.round(ev.strength)}@${p.idx}`); if (evLog[di].length > 5) evLog[di].shift(); } return orig(...e); }; });
  for (let k = 0; k < secs * 60; k++) {
    G.update(1 / 60);
    for (const p of G.pods) {
      if (!isFinite(p.pos.x) || !isFinite(p.pos.z) || !isFinite(p.pos.y)) nan++;
      const di = G.pods.indexOf(p); if (p.dead > 0 && !wasDead[di]) deathAt.push(`${p.path}:${p.idx}${p.hpL <= 0 || p.hpR <= 0 ? 'X' : 'F'}${p.overheat ? 'H' : ''}{${evLog[di].join(',')}}`); wasDead[di] = p.dead > 0;
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
