// Debug shots of one track: the same views several times, each time with other parts of the scene hidden – "which mesh is it?"
// (docs/regeln/tests.md). Also counts what each view draws. Puppeteer, software WebGL2.
//
//   cd /var/tmp/t   (a folder with puppeteer installed – "Test-Setup" in docs/regeln/tests.md)
//   node pdbg.mjs <abs path to tools/harness/out/game.html> <track index> "<view>,<view>" <abs out prefix> [variants] [query]
//
// views     as in pshot.mjs / game.ts, e.g. the probe p<idx>_<lat>_<height>_<ahead>_<path>_<lookLat>_<lookHeight>
// variants  comma list, default "all". One picture per view and variant:
//   all                 the scene as it is
//   hide:<a>+<b>        without the meshes whose material (or mesh) is named a or b: road, cliff, terrain, ground, groundBlend,
//                       snow, borderRocks …  (noterrain / nocliff / noroad = short forms)
//   only:<a>+<b>        only those meshes
//   wire                terrain as wireframe
//   trails              presses test trails into the first powder snow field (three passes in the middle, one 9 m left, one weaving)
//   race                all pods fly four seconds over the first powder snow field (real trails, real plumes)
// query     default "?webgl" (screenshots need WebGL2: headless WebGPU frames come out white)
//
// Output: <out>_<view>_<variant>.png, the contact sheet <out>_grid.jpg, and per view one line
//   "<view> drawn: <meshes> meshes, <triangles> triangles (instances counted)" – every visible mesh whose bounding sphere touches the
//   view frustum, i.e. the scene pass without shadow passes. Compare two builds with it (three's `info.render` mixes the passes).
import puppeteer from 'puppeteer';
const [,, page, ti, view, out, variants = 'all', query = '?webgl'] = process.argv;
if (!page || !out) { console.log('usage: node pdbg.mjs <game.html> <track> <views> <out prefix> [variants] [query]'); process.exit(2); }
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('file://' + page + query);
await p.waitForFunction(() => typeof window.track === 'function', { timeout: 120000 });
const shots = [], views = view.split(',');
for (const v of views) {
  console.log(String(await p.evaluate(([i, d]) => window.track(+i, d), [ti, v])).replace(/^.*?(probe|WebGL2|WebGPU)/, '$1').slice(0, 170));
  let fresh = true; // (first variant of this view: remember which meshes `track()` left visible – it switches the decor and rock sectors for the new camera)
  for (const variant of variants.split(',')) {
    const info = await p.evaluate(async (variant, fresh) => {
      const G = window.__podracer, seen = {}, names = variant.includes(':') ? variant.slice(variant.indexOf(':') + 1).split('+') : [];
      G.scene.traverse(o => {
        if (!o.isMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material, n = m?.name || '';
        seen[n] = (seen[n] || 0) + 1;
        if (fresh || o.userData.__vis === undefined) o.userData.__vis = o.visible;
        o.visible = o.userData.__vis;
        if (m && m.userData.__wire === undefined) m.userData.__wire = !!m.wireframe; if (m) m.wireframe = m.userData.__wire;
        const named = names.includes(n) || names.includes(o.name);
        if (variant.startsWith('hide:') && named) o.visible = false;
        if (variant.startsWith('only:') && !named) o.visible = false;
        if (variant === 'noterrain' && n === 'terrain') o.visible = false;
        if (variant === 'nocliff' && n === 'cliff') o.visible = false;
        if (variant === 'noroad' && n === 'road') o.visible = false;
        if (variant === 'wire' && n === 'terrain' && m) m.wireframe = true;
      });
      let extra = '';
      if (variant === 'race' && G.td.snow?.runs.length) {
        const S = G.td.main.samples, run = G.td.snow.runs[0]; let n = 0;
        for (const q of G.pods) { const i = run.a + 40 + (n % 4) * 8, lat = (n - G.pods.length / 2) * 5, s = S[i]; q.path = 0; q.idx = i; q.pos.set(s.x + s.rx * lat, s.y + 2.85, s.z + s.rz * lat); q.vel.set(s.tx * 80, 0, s.tz * 80); q.yaw = Math.atan2(s.tx, s.tz); n++; }
        G.state = 'race'; G.keys.add('KeyW'); for (let k = 0; k < 250; k++) { G.update(1 / 60); if (k % 3 === 0) G.updateVisuals(); }
        G.updateVisuals(); G.particles.alpha.fullUpload(); G.particles.add.fullUpload(); G.world.update(G.clock, G.camera.position, []);
        extra = ' pods at ' + G.pods.map(q => q.idx).join(',') + ' packMax=' + Math.max(...run.data);
      }
      if (variant === 'trails' && G.td.snow?.runs.length) {
        const snow = G.td.snow, S = G.td.main.samples, run = snow.runs[0];
        const pass = (latFn, n) => { for (let k = 0; k < n; k++) for (let i = run.a + 20; i < run.a + run.n - 20; i++) for (let f = 0; f < 3; f++) { const s = S[i], lat = latFn(i + f / 3), al = f / 3 * 2;
          for (const off of [-2.2, 2.2]) snow.stamp(0, i, s.x + s.tx * al + s.rx * (lat + off), s.z + s.tz * al + s.rz * (lat + off), 1.5, 0.32); } };
        pass(() => 0, 3); pass(() => -9, 1); pass(i => 12 + Math.sin(i * 0.12) * 6, 1);
        G.world.update(0, G.camera.position, []);
      }
      for (let k = 0; k < 3; k++) { G.render(0.016); await new Promise(r => setTimeout(r, 700)); }
      // what the scene pass draws: visible meshes in the view frustum, triangles × instances
      const cam = G.camera; cam.updateMatrixWorld(); const M = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements;
      const planes = [[M[3] - M[0], M[7] - M[4], M[11] - M[8], M[15] - M[12]], [M[3] + M[0], M[7] + M[4], M[11] + M[8], M[15] + M[12]], [M[3] + M[1], M[7] + M[5], M[11] + M[9], M[15] + M[13]], [M[3] - M[1], M[7] - M[5], M[11] - M[9], M[15] - M[13]], [M[3] - M[2], M[7] - M[6], M[11] - M[10], M[15] - M[14]]]
        .map(q => { const l = Math.hypot(q[0], q[1], q[2]) || 1; return q.map(x => x / l); });
      let meshes = 0, tris = 0; const by = {};
      G.scene.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        for (let a = o; a; a = a.parent) if (!a.visible) return;
        const g = o.geometry, sph = o.isInstancedMesh ? (o.boundingSphere ?? (o.computeBoundingSphere(), o.boundingSphere)) : (g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere));
        if (o.frustumCulled && sph) { const e = o.matrixWorld.elements, c = sph.center, x = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12], y = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13], z = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14], r = sph.radius * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])); if (planes.some(q => q[0] * x + q[1] * y + q[2] * z + q[3] < -r)) return; }
        const n = ((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3) * (o.isInstancedMesh ? o.count : 1), m = Array.isArray(o.material) ? o.material[0] : o.material, key = o.name === 'borderRocks' ? 'borderRocks' : (m?.name || 'other');
        meshes++; tris += n; const q = by[key] ?? (by[key] = [0, 0]); q[0]++; q[1] += n;
      });
      return JSON.stringify({ seen, drawn: `${meshes} meshes, ${Math.round(tris)} triangles`, by: Object.entries(by).filter(([k]) => k !== 'other').map(([k, q]) => `${k} ${q[0]}/${Math.round(q[1] / 1000)}k`).join(' ') + extra });
    }, variant, fresh);
    fresh = false;
    const r = JSON.parse(info);
    if (variant === variants.split(',')[0] && v === views[0]) console.log('materials:', JSON.stringify(r.seen).slice(0, 300));
    console.log(`${v} [${variant}] drawn: ${r.drawn} · ${r.by}`);
    const buf = await p.screenshot({ path: `${out}_${v}_${variant.replace(/[:+]/g, '-')}.png` });
    shots.push('data:image/png;base64,' + Buffer.from(buf).toString('base64'));
  }
}
const g = await b.newPage(); const cols = Math.min(2, shots.length), w = 800, h = 450;
await g.setViewport({ width: w * cols, height: Math.ceil(shots.length / cols) * h });
await g.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px)">` + shots.map(s => `<img src="${s}" style="width:${w}px;height:${h}px;display:block">`).join('') + '</body>');
await g.screenshot({ path: `${out}_grid.jpg`, type: 'jpeg', quality: 80 });
await b.close();
