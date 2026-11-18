# CLAUDE.md – Agent Manual

## Always
- Output style: skill **i-have-adhd** (https://raw.githubusercontent.com/ayghri/i-have-adhd/refs/heads/main/skills/i-have-adhd/SKILL.md) – next action first, numbered steps, state restated, max 5 items per list group, no preamble/closers.
- Update `HANDOFF.md`, `README.md`, `CLAUDE.md`, `DESIGN.md`, `TODO.md` at the end of every task.
- Never hand-edit `package.json` / `vite.config.ts`. Add deps with `npm install <pkg>`.
- Finish with `npm run build` → `dist/index.html` (single file). Archived unrelated HTML stays in `.archiv/`.
- Spec don'ts: **no film grain, no excessive bloom / overexposure.**
- **Sandbox persistence:** if `.git` or `src/assets/menu-bg.jpg` vanished after a reset, restore via `git clone https://github.com/Cr0nFixXx/podracer.git /tmp/rc && cp -r /tmp/rc/.git . && mkdir -p src/assets && cp /tmp/rc/src/assets/menu-bg.jpg src/assets/ && chmod +x tools/harness/run.sh`.

## Stack
React 19 · Vite 7 · Tailwind 4 · three r187 **WebGPURenderer** (WebGPU, auto WebGL2 fallback) · **TSL** · TypeScript strict. Typecheck: `npx tsc --noEmit -p .`.

## Rendering & performance rules
- Renderer/node classes from `three/webgpu`, TSL from `three/tsl`. **No `ShaderMaterial` / `onBeforeCompile` / `EffectComposer`.**
- WGSL strictness: no constant `smoothstep(a,b,x)` with `a >= b` → `ssInv`. Keep all `.sample()` calls in uniform control flow; inside `If`/`Loop` use `textureLoad(...)` (for depth) or `.level(0)` / `.grad(dx, dy)`. In `Fn((_params, builder) => ...)`, `builder` is the **2nd** argument.
- **Normals & displacement:** Terrain/water/lava use singularity-free, derivative-free `xzNormalToView` / `transformNormalToView` + `polygonOffset` (`terrainMaterial.ts`). Roads/cliffs/pods use 128× pre-scaled derivative TBN with silhouette-jump rejection (`safePerturbNormal` / `safeHullNormal`). Never apply vertex `displace` to `wallMat` (tears seams); on `roadMat` taper displacement to `0` at `uv.x = 0/1`. Build PMREM with `makeSky(theme, true)`.
- **PostFX & warmup (`post.ts`):** AO = 4-pair symmetric `textureLoad` depth concavity (0 MRT, 0 flat-plane striping, 0 halos, immune to transparents). Bloom runs at `0.5×` resolution (`threshold = 2.1`). God rays = 14-tap `textureLoad` sky-depth shafts. SSR (opt-in) masks transparents with compile-time `alpha = 0` + `NormalBlending` in MRT. Always run `await post.warmup(renderer)` (with seeded particles & revealed pod LODs) before `onReady()` so countdown frame 1 never stalls. Never use full-screen CSS `filter: drop-shadow` on HUD text (`textShadow` only).
- **Static batching, pods & particles:** `StaticBatcher` (`trackMesh.ts`) merges world-space chunks into 580 m `THREE.Mesh` tiles (no `BatchedMesh`). All 10 opponent pods share **3 single TSL pipelines** (`sharedOpponentHullMaterial`, `sharedOpponentFlameMaterial`, `sharedOpponentBinderMaterial`) via baked vertex colours + 2-tier LOD (`48 m` / `520 m`). `PointsNodeMaterial` (`particles.ts`) clamps `sizeNode` to `≤ 0.16 * -positionView.z` and `0` for `vz < 1.2 m` with near-fade (prevents camera-plane overdraw & keeps sightlines clear). Texture budget: max 16/stage (peak 12–13/16; height in `map.a`, roughness in `normalMap.a`).

## Pod suspension, track, AI & landscape
- **Hover & turbine articulation (`physics.ts`, `podDesigns.ts`, `podModel.ts`):** `HOVER = 2.85 m`, `MIN_ROAD_CLEAR = 0.68 m`. `roadSurfaceAt` includes exact road crown + curb lip. `stepPod` aligns `pitch` to real longitudinal road slope, drives spring-damped opposite L/R engine heave & pitch (`engYL/engYR/engPL/engPR`, outer turbine rises ~1 m, inner tucks ~0.5 m) with diagonal binder tilt & GPU-flexing control cables (`cableFlexMaterial`), and enforces a 5-point repulsor ground clamp under L/R engines & cockpit (0 road clipping).
- **Obstacles & set pieces (`trackBuilder.ts`, `setPieces.ts`, `world.ts`):** ~7.5 spaced obstacles/track (`≥ 52 m` apart, clear of ramps/landings) marked with glowing ground rings + top strobe beacons; 6 `SetPiece` types (`rotor`, `gate`, `arch`, `icefall`, `boulder`, `bridge`); corridor AI (`aiInputs`) evaluates 27+ lanes with exact ETA timing.
- **Landscape (`world.ts`):** `terrain` → `waterfalls` → `landmarks` (`LandmarkFoot[]`) → `smoke` → `groundCover` (non-overlapping dome LOD) → `wildlife` (landmark avoidance, fleeing herds, perching birds, `nearAudio`) → `trackDetail` (reactive energy barrier) → `batcher.build`.

## Testing
Headless WebGPU: `tools/harness/run.sh game "t0:a,t5:c,t3:c"` and `"s9:30"`. Track indices: 0 boonta, 1 frost, 2 neon, 3 magma, 4 dunepass, 5 jungle, 6 aquilaris, 7 oovo, 8 crystal, 9 malastare, 10 mosespa, 11 howler, 12 methane, 13 executioner.
