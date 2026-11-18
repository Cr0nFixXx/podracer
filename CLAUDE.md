# CLAUDE.md – Agent Manual

## Always
- Output style: skill **i-have-adhd** (https://raw.githubusercontent.com/ayghri/i-have-adhd/refs/heads/main/skills/i-have-adhd/SKILL.md) – next action first, numbered steps, state restated, no preamble/closers.
- Update `HANDOFF.md`, `README.md`, `CLAUDE.md`, `DESIGN.md`, `TODO.md` at the end of every task.
- Never hand-edit `package.json` / `vite.config.ts`. Add deps with `npm install <pkg>`.
- Finish with `npm run build` → `dist/index.html` (single file).
- Spec don'ts: **no film grain, no excessive bloom / overexposure.**
- **Sandbox persistence:** only text files survive sessions – `.git`, `src/assets/menu-bg.jpg`, `/tmp`, exec bits vanish. First: `git status`; restore with
  `git clone https://github.com/Cr0nFixXx/podracer.git /tmp/rc && cp -r /tmp/rc/.git . && mkdir -p src/assets && cp /tmp/rc/src/assets/menu-bg.jpg src/assets/ && chmod +x tools/harness/run.sh`. Local commits are lost (never pushed) – the working tree holds the work.

## Stack
React 19 · Vite 7 · Tailwind 4 · three r187 **WebGPURenderer** (WebGPU, auto WebGL2 fallback) · **TSL** · TypeScript strict. Typecheck: `npx tsc --noEmit -p .`.

## Rendering rules
- Renderer/node classes from `three/webgpu`, TSL from `three/tsl`. **No `ShaderMaterial` / `onBeforeCompile` / `EffectComposer`.**
- `await renderer.init()` before PMREM/compile. WGSL: no constant `smoothstep(a,b,x)` with `a >= b` → `ssInv`. Derivatives only in uniform control flow.
- **Texture budget: max 16 sampled textures per shader stage** (WebGPU), env map + shadow maps included. Same texture object = one binding. `generateTexture` packs **height into `map.a`** and **roughness into `normalMap.a`** – use them instead of extra `rhMap` samples in new materials.
- `positionNode` runs **after instancing**: `positionLocal` is already instance-transformed (world space for meshes at the origin); use `positionGeometry` for model-space values (e.g. wind weight by blade height). `instanceIndex` + `hash` give per-instance phases.
- Dithered fades: `opacityNode` + `alphaTestNode = interleavedGradientNoise(screenCoordinate.xy)` on opaque materials (no sorting). Not for shadow casters.
- God rays use a sky mask (depth == 1) – bright surfaces never streak.
- Fog = `scene.fogNode` (atmosphere.ts). Smoke columns use their own weaker haze (`fog: false`).
- Static track geometry → `StaticBatcher` (BatchedMesh per material/shadow flag). Batched geometries need identical attribute sets.

## Performance rules (session 7)
- Never one InstancedMesh for a whole map: use `CellInstancer` (instCells.ts) – frustum/distance culling + shadow casting only near the camera. Call its `update(cam)` from `world.update`.
- Pods: `PodVisual.setLod(dist)` every frame (Game.updateVisuals). Far proxy = baked vertex colours + shared `farMaterial()`. New pod parts must still work when merged (non-transparent parts are merged, transparent ones except glow are skipped).
- New glossy materials: wrap the roughness node in `specAA()` (specAA.ts) – otherwise highlights shimmer.
- `post.ts` patches `WGSLNodeBuilder.prototype.generateTextureGather` (r187 compat-mode depth gather bug). Remove when three is upgraded and GTAO compiles without it (`tools/harness/run.sh game "t5:a" "?ultra"` → no WGSL errors).
- Harness `?ultra` enables GTAO + SSR; output lists meshesInView / trisInView / casters / podMeshes.

## Session 16 notes (track profile)
- `buildTrack` order: samples → ramps/gaps flags → **`applyRelief`** → `finalizeSamples` → shortcuts → **`applyBanking` (all paths)** → cliffs → walls → obstacles / hazards / set pieces. Anything that reads `s.y` or `s.bank` must come after the respective stage.
- Relief is a 2D field in plan (nearby sections share heights) + slope limiter; tune per track via `RELIEF_GRADE`. Protected zones hold the relief constant (start grid, sprint ends, ramps + landings).
- Banking: `curv × 48`, limit `min(0.34, 7 / hw)`, masked at start / ramps / gaps / zero-G / junctions. Sign: `bank > 0` ⇔ `curv > 0` ⇔ steer > 0 ⇔ right side (lat > 0) is lower.
- Physics: `SLOPE_K`, ground-relative hover damper (`gvs`), bank turn assist; roll target includes `atan(S.bank)`. Visual ground clearance uses roll relative to the road.
- Check after changes: `npx esbuild tools/harness/relief.ts --bundle --platform=node --outfile=/tmp/relief.cjs && node /tmp/relief.cjs` (grades, bank, self-crossings) and `tools/ci/sim-check.sh`.
- Water / lava level must stay below `bounds.minY − 13` (banked inner edges sit up to 7 m below the centreline).

## Session 15 notes
- Build order in `buildWorld` matters: wall cascades (top, before `roadMat` → `wetZones`) → terrain falls → `scatterDecor` (returns `{ update, zones, perches }`) → landmarks (return footprints) → smoke → cover → life (`avoid` + `perches`).
- `World.update(t, cam, player?)`: third argument is the threat for wildlife (herds flee < 120 m, perched birds take off < 110 m).
- Wildlife leg phase: pass `gait` (uniform, accumulated on the CPU) to `lifeMat('walker')` when the cadence must change – never scale `time` (phase jump).
- Per-instance animation state on instanced life meshes: `InstancedBufferAttribute` + `instancedBufferAttribute()` (see bird `fold`).
- Road wet zones are shader constants (max 8) – rebuilding the road material is required when zones change.
- Lens droplets: `post.cine.uniforms.wet` (0..1), only compiled when `gfx.cinematic` is on.
- Harness: view `p` (perched birds), query `?wet` (droplets).

## Session 14 notes
- `World.falls: FallInfo[]` is the single source for fall ambience. `Game.updateFalls()` (after `world.update`) drives `AudioFX.setFall`, `particles.fallMist` and `particles.splash`.
- Falls are built BEFORE `scatterDecor` with their own rng (`mulberry32(977 + td.N)`); decor uses `decorClear` (road + fall corridors). Keep that order when adding new scatter passes.
- Fall candidates are ranked by track line-of-sight (`vis` 0/1/2) before drop height.

## Session 13 notes
- `buildWallFalls` duplicates the canyon wall profile as `WALL_PROF` – if `prof` in world.ts changes, update both.
- Harness `w` view uses `userData.fallVerts` (vertices of the first fall in a merged geometry).
- `tools/harness/walls.ts`: per-track cliff statistics (`npx esbuild … --platform=node`).

## Session 12 notes
- Impostors: `placeV(..., { impostor })` → `buildImpostors` (impostors.ts); fade-in must match the CellInstancer view distance (`1400 * dd`).
- Falls: `buildFalls(kind, ...)` (falls.ts) runs before `buildSmoke` and pushes steam/dark smoke sources. Harness view `w` frames the first fall (`userData.fall`).
- WGSL reminder (bit me again): constant `smoothstep(a, b, x)` with a >= b is a compile error → `oneMinus(smoothstep(b, a, x))`.

## Session 11 notes
- `placeV(..., { low })`: optional low-poly variants (same order as variants) → `CellInstancer` switches beyond 350 m; far LOD casts no shadows.
- Vertex colours > 1 on instanced foliage did NOT show up in renders → for world-space effects (snow, wetness) use node materials (`snowMat.ts`) instead of baked vertex colours.
- `boulderGeo` detail is capped at 4.

## Session 10 notes
- Sim forensics: harness `s<N>:<secs>` prints each death as `path:idx X{events}` (w=wall o=obstacle p=pod l=land e=explode, number = impact speed). Use it before guessing.
- Track probe: `npx esbuild tools/harness/probe.ts --bundle --platform=node --outfile=/tmp/probe.cjs && node /tmp/probe.cjs <track> <from> <to>`.
- AI: obstacle safety pass runs AFTER pod-avoidance (keep that order); `nearBlock` shortens the steering point. AI-vs-AI contact damage × 0.35 (cap 30) in `Game` pod collision.
- PostFX: no normal MRT target; GTAO + SSR use depth-reconstructed normals. Don't reintroduce `normalView` into the MRT.

## Session 9 notes
- After a sandbox reset: `bash tools/harness/setup.sh` (restores .git, Playwright, libs). CI: `tools/ci/sim-check.sh`; image diff: `node tools/harness/diff.mjs a.png b.png out.png`.
- GTAO uses depth-reconstructed normals (`ao(depth, null, camera)`) – keep it that way; MRT only exists when SSR is on.
- Particles: GPU ring buffer (`Pool.spawn` writes spawn records; vertex stage evaluates motion). Don't add per-frame CPU loops; new effects = new spawn parameters.
- Inputs gained `handbrake, abL, abR, roll, pitch` (optional; AI leaves them undefined). Runtime state on the pod: ad-hoc `knife`, `pitchC`, `sliding` (cast like `wCd`).
- Engines: `Game.updateVisuals` – steering = vertical spring only; `rotation.x` only from `pitchC` (both engines). Don't reintroduce steering tilt.
- CSM: on in the Ultra preset (`csm: true`), opt-in elsewhere (`gfx.csm`, harness `?csm`). Cascades initialise on the first rendered frame – keep the warm-up render in `Game.start()`.

## Session 8 notes
- `Game.start()` warms up: all pod proxies built + `compileAsync` with frustum culling off for both LOD states + one post frame. New lazily created materials must be added there or they hitch mid-race.
- Visual roll is clamped in physics (±0.42); `updateVisuals` lifts `v.body.position.y` for ground clearance and springs every engine (`userData.y/vy/rx`). Don't set engine `position.y` elsewhere.
- Obstacle density: `OB_DENSITY` in trackBuilder.ts; obstacles get ring + beacon in `addObstacles`.
- Do NOT use `material.mrtNode` with the PostFX MRT (r187 emits an empty WGSL struct).

## Decor geometry (session 6)
`decorGeo.ts` builders return non-indexed geometry with exactly `position, normal, uv, color` (vertex colour = baked AO/tint, multiplied with instance colour → materials need `vertexColors: true`). Trees return `[wood, leaves]`. `scatterDecor` uses `placeV(variants, …)`: every variant is a list of `[geometry, material]` parts sharing instance matrices. Keep new builders on `finalize()` so merges never fail on attribute mismatch.

## AI obstacle avoidance (session 6)
`aiInputs`: obstacles in −5…60 samples ahead are collected. With `< AI_DENSE` (3) the classic single dodge is used; otherwise a lane-grid DP (`AI_ROWS`×`AI_LANES`, rows every 4 samples) picks the lane, target row ≈ 30 % of look-ahead. Buffers cached on `ai.dpCost/dpFrom/dpX`. Avoid speed cuts in fields – pods braking together crash into each other.

## Track model / collision
Unchanged from session 4 (see `trackBuilder.ts`, `physics.ts` headers): per-sample `hL/hR` cliffs, `wallL/wallR` collision, `roof`, set pieces, hazards. Session 5 added **damage cooldowns** (walls 0.2 s, obstacles 0.35 s, set pieces 0.7 s per pod, stored as ad-hoc fields `wCd/obCd/spHit` on the pod) and **AI obstacle/set-piece damage × 0.45**. Set pieces are never placed within 45 samples of an obstacle field. Geysers: 12 dmg/s inside radius, AI avoids if erupting within ETA−2.2 s … +0.6 s.

## Landscape pipeline (world.ts → order matters)
1. `makeTerrainField` (terrain.ts): `heightAt` also writes `field.splat` (gravel, basin) for the last query; basins are flattened lowlands.
2. `buildTerrain`: quadtree LOD leaves with attributes `position, normal, uv(world/30), color (tint), aSplat (gravel, basin, 0, rnd)` → batcher.
3. `terrainMaterial` (terrainMaterial.ts): ground + gravel (7 m) + basin (18 m) + 2-plane rock (26 m, strata) blended by `aSplat` + slope + packed heights; micro grit, vertex tint, `cloudShade`. Per-theme palettes in `LAYERS`, strata in `STRATA` (also used by canyon walls/landmarks via `surfaceMaterial({ strata, cloud })`).
4. Landmarks (landmarks.ts) push `SmokeSrc` → `buildSmoke` (smoke.ts, one draw, billboards + moving devils).
5. `buildGroundCover` (groundCover.ts): per theme `SETS`, clustered placement (3 `heightAt` per instance), 150 m cells (InstancedMesh each), per-type view distance, wind, dithered fade.
6. `buildLife` (wildlife.ts): `LIFE` per theme – birds, herds, giants, crawlers, speeders, barges, flyers; CPU moves instances, GPU animates (aAnim channel; vertex colour > 1 glows).
7. `world.update(t, cameraPos)` drives smoke devils, life and cover visibility.
`waterY` (lava/water level) is computed once and passed to cover/smoke/life (nothing spawns under water).

## Testing (headless, real WebGPU via SwiftShader)
Setup script: `HANDOFF.md` → "Test setup". Then `export LD_LIBRARY_PATH=/tmp/libs/root/usr/lib/x86_64-linux-gnu:/tmp/libs/root/lib/x86_64-linux-gnu`.
```bash
tools/harness/run.sh game "t0:e,t5:l"     # views: a chase · b corner · c canyon · e vista · g roadside close-up · h first ground-cover instance · l largest animal/vehicle · d<N> set piece
tools/harness/run.sh game "s9:30"         # physics stress: NaN, wall penetration, deaths=[path:idx X(explode)/F(fall)], ramps, hazards, set pieces
tools/harness/run.sh game "t9:e" "?webgl" # WebGL2 fallback
cp tools/harness/app.mjs /tmp/pw/ && (cd /tmp/pw && node app.mjs $PWD/dist/index.html $PWD/tools/harness/out)
```
Track indices: 0 boonta, 1 frost, 2 neon, 3 magma, 4 dunepass, 5 jungle, 6 aquilaris, 7 oovo, 8 crystal, 9 malastare, 10 mosespa, 11 howler, 12 methane, 13 executioner. Harness calls `G.updateVisuals()` + `G.world.update()` before rendering (game is paused).
