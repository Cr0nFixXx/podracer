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
