# CLAUDE.md – Agent Manual

## Always
- Output style: skill **i-have-adhd** (https://raw.githubusercontent.com/ayghri/i-have-adhd/refs/heads/main/skills/i-have-adhd/SKILL.md) – next action first, numbered steps, state restated, max 5 items per list group, no preamble/closers.
- Update `HANDOFF.md`, `README.md`, `CLAUDE.md`, `DESIGN.md`, `TODO.md` at the end of every task.
- Never hand-edit `package.json` / `vite.config.ts`. Add deps with `npm install <pkg>`.
- Finish with `npm run build` → `dist/index.html` (single file). Archived unrelated HTML stays in `.archiv/`.
- Spec don'ts: **no film grain, no excessive bloom / overexposure.**
- **Sandbox persistence:** if `.git` or `src/assets/menu-bg.jpg` vanished after a reset, restore via `git clone --branch B https://github.com/Cr0nFixXx/podracer.git /tmp/rc && cp -r /tmp/rc/.git . && mkdir -p src/assets && cp -n /tmp/rc/src/assets/menu-bg.jpg src/assets/` (working tree stays, shows as modified vs. `B`).
- **Commit with `npm run save -- "message"` after every finished task** (user request). It commits everything except `.archiv/repo-sicherung` and rewrites the repository copy there as **base64 text** (`podracer-git.tar.gz.b64.txt` + restore scripts), then test-restores it. Background: the user's download and every sandbox restart drop `.git` **and extension-less/unknown binary files** (packs, bundles) – only the text copy survived (verified Session 14). Never `git add -A` by hand, never git-ignore the copy, never push unless asked. **Session start: `npm run restore-git`.**
- **Before finishing: `npm run check` must be green** (typecheck + 14-track node physics sim). Add npm scripts only with `npm pkg set scripts.<name>=…`.

## Repo
- Root = Klon von `https://github.com/Cr0nFixXx/podracer.git`, Branch **`B`**. `.archiv/` enthält fremde Alt-Dateien (nicht anfassen, nicht ins Spiel einbinden).

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

## Controls, flight physics & track profile (Session 10)
- **Key map (`Game.readInput`):** `W` thrust, `S` brake/reverse, `A`/`D` steer, `Shift` boost, `Space` air brake / slide, `↑` dive (`pitch = -1`), `↓` lift (`pitch = +1`), `←`/`→` 90° roll (`roll = ∓1`), `R` repair, `C` view. Arrows never steer. Update `screens.tsx` + `RaceView.tsx` + `README.md` together when changing keys.
- **`Inputs.pitch` / `Inputs.roll` are optional** (old call sites keep compiling). Smoothed states live in `PodState.pitchCtl / rollCtl`; `p.roll = rollBase·(1-knife) + rollCtl·π/2`.
- **Engines never tilt on their own:** `engPL/engPR` stay `0`, `setEngineMotion(yL, yR, 0, 0, 0)`. Steering = pure vertical heave (outer +1.1 m, inner −0.22 m). Whole-pod pitch only from road slope + pitch key.
- **Ground clamp is exact per point** (front tip vs. road under the tip, tail vs. road under the tail; roll uses barrel-or-wingtip). Never go back to `max(front, back)` floors – on gradients it lifts pods off the road (`grounded = false`, half steering). Clamp range grows with `knife·halfSpan` and lift.
- **Slide** = `airbraking && |steer| > 0.25 && grounded`. AI adds brake while sliding too fast; keep that when retuning grip (`0.24`).
- **Track profile (`trackBuilder.ts`):** banking via `finalizeSamples(S, closed, banked = true)` for the main path only; hills are added after ramps are placed and are damped to 0 at grid/finish/ramps/gaps/zero-G and wherever the track comes within `hwA + hwB + 14 m` of itself. Do not add height elsewhere (jump tuning + over/underpass clearance depend on it).
- **Particles (`particles.ts`):** stateless GPU simulation. `Pool.spawn` writes one record (5 × vec4) into a ring buffer; the vertex shader integrates drag/gravity in closed form. No per-frame CPU loop – never reintroduce `pos/vel` arrays. Colour/alpha travel as one `varying(vec4)`.
- **Decor LOD:** `place(geo, …, { lod: { geo, dist } })` builds a far twin per sector (forces sector chunking); LOD geometry must come from the same seed (`jungleTreeGeometry(seed, gq, true)`, `spireGeometry(seed, halfRadial, sameStrata)`).
- **CSM** is opt-in (`gfx.csm`): `CSMShadowNode` on `sun.shadow.shadowNode`; call `csm.updateFrustums()` only after `csm.camera` exists (first render).

## Session 18 rules
- **Track layouts are expanded procedurally** in `trackBuilder.ts → controlPoints()` (scale `TRACK_SCALE`, meander insertion with clearance check, two open flats). `data.ts` control points stay the designer's base layout; index-based hints (`def.shortcuts`) must go through the returned `map`. `NO_EXPAND=1` (CI) builds the old layouts. Fraction-based fields (canyons, ramps, set pieces …) shift slightly – that is expected.
- **Open flats** = samples with `hw > wideLim` (min(1.45 × median, 45 m)): no canyon flag, no tunnels. Keep anything that assumes a narrow road (tunnels, arches) out of them.
- **Caves** are configured in `CAVES` (theme → [samples, depth, chambers]); roof height varies per sample inside a chamber, pillars come from `cavePillars` as kind-1 obstacles.
- **Photo textures:** `photoTex.ts` (`KIND` map, `applyPhotoDetail` in `textures.wrap()` on COPIES – the persistent cache stores the pure procedural bytes), sources bundled in `photoAssets.ts`, registered by `main.tsx` and the harness only. Photos must be 512² power-of-two, tileable, lighting-flattened (`tools/photos/process.mjs`). Any esbuild call that bundles `Game` needs `--loader:.jpg=dataurl`.
- **Tree material / atlas:** `foliage.ts → treeMaterial` (map + `alphaMap` + `alphaTest`; alpha must be a separate grey texture – the shadow pass only copies `alphaMap`). UV conventions in `decorGeo.ts`: `barkUV` (left half, mirror-tiled), `plainUV` (white strip), `LEAF_TILE(q)` (4 sprig tiles). Every part merged into a tree needs position, normal, uv, color.
- **Decor density:** `dens` in `scatterDecor` (track length + 20 %, cap 2.6) multiplies every `place()` count – change counts there, not per call.

## Session 17 rules
- **Tunnels have three kinds** (`Sample.tun`: 1 standard, 2 underwater, 3 cave) and are placed in `buildTrack` BEFORE obstacles / hazards / set pieces (those skip `roof > 0`). Underwater tubes and the cave dip the road (`dip()`); never put a ramp within 520–600 m before them (`rampBefore`).
- **Never clamp a pod down to a ceiling it approached from outside.** Entering a roofed run decides once: `PodState.upper` (drive on the deck, ground = road + `roof + TUNNEL_DECK`) or inside (ceiling applies). Everything that asks "is this pod under a roof?" must use `roof > 0 && !p.upper`. CI: deck self-test + `downward teleports` must stay 0.
- **`buildTunnel`** (world.ts) builds per roof run: inner shell, berm or caisson, drivable deck (road material, UV integrated per segment), portal faces, ribs, lamps; underwater: window faces share the shell's vertex buffer and use `oceanWindowMaterial` (scifi.ts) where the tube top is below `td.seaY`.
- **Sea level of ocean worlds is `td.seaY`** (fixed before the dips). The water plane takes a hole mask (`tunnelWaterMask`) where an underwater tube breaks the surface.
- **Pod layouts may define several binders** (`PodLayout.binders`); hero and rival builders loop over them, A is always the left-hand engine. Binder look = `boltLook` (thin core + 4 independent arcs).
- **Hull heat glow** = `uHeat` in `hullMaterial` (temperature falls off along `aLiv.y` from the nozzle); the hero model feeds a lagged value (`glowH`). The cockpit uses its own hull instance (`hullC`, no heat).
- **Cockpit pendulum:** physics state `ckX/ckY/ckZ` (stepPod), visual via `setCockpitSway` (cockpit group + cable uniform `uCk`); first-person view hides the cockpit group (`setCockpitVisible`) – do not lower the camera near plane instead.
- **Boost overdrive:** `PodState.overT` (0..3 s) in the heat block of `stepPod`; HUD field `overdrive`.
- **Own-pod dust must stay visible:** spawn under the engines, inherit ~80 % of the pod velocity with strong drag (slipstream), slight outward drift; alpha-pool near fade is 3–8.5 m. Check with harness view `r`.
- **Particle pools add update ranges** (the renderer clears them after upload). Any test that runs several `Game.update()` calls without rendering must call `pool.fullUpload()` before the screenshot (the harness does) – otherwise particles are missing in the picture although the game is fine.
- **`reflRes`** (0.35–1) scales the SSR buffer; restart-only like SSR.

## Session 16 rules
- **Boost opens the nozzle petals, never the side flaps.** Petals = `EngineGeo.petals` (attribute `aPet`: outward dir xy + swing z), ONE shared `petalMaterial()`; opening per mesh via `mesh.userData.open` (TSL `userData`). Hero: `petals[]` in `update()`; rivals: `oppPetals` in the opponent `update(t, throttle, boost)`. Side flaps = air brake (+ damage rattle) only.
- **No number plates / signs on pods** (user dislikes them).
- **Everything that spans the road is solid:** push an `Overhead` (`{ idx, y0, y1, half }` or `arch: { R, sy, inner?, yOff?, thick?, sp? }`) to `td.overheads` when building it (gantries, start portal, checkpoint gates, rock arches, set-piece arches). Never place such structures on samples with `roof > 0` or `zeroG`.
- **Tunnels:** `sample.roof > 0` (main path: placed at the end of `buildTrack`, shortcuts: middle half). `buildTunnel` builds one shell per roof run, sheared with `bank`. Physics ceiling, rain cover, lamp strips follow `roof` automatically.
- **AI start discipline:** `ai.gridLat` (grid lane) is held for ~4.5 s, blended out until 7.5 s; no lateral dodging and lift-off when tailgating during that phase. CI column `startTouch`.
- **Zero-G** (`p.zeroG`): free vertical thrusters (`pc·30`), weak centring, `vmax ×1.28`, thrust ×1.35, no drag, grip ×0.34; guided down 26 samples before the tube ends. CI prints tube vs. ground speed.
- **Sci-fi dressing** lives in `scifi.ts` (`SCIFI_THEMES`); edge light strips also light every tunnel. Animated in the shader only.
- **Weather intensity** numbers live in `environment.ts` (fog/sun/wind per weather), `particles.initAmbient` (count, streak width/opacity), `weather.ts` (gusts, lightning rate), `Game.applyEnv` (flash).
- **Gamepad:** `PadMap` in `keymap.ts` (`padValue`, `readPadBind`, `bindPad`); `Game.readInput` reads only `this.padmap`; UI `PadBindings`. Start (button 9) = pause, fixed.
- **Live graphics now also:** volumetrics (`fog.hOn` / `fog.bankOn` uniforms – the fog branch is always compiled) and anisotropy (`setTextureAnisotropy`). CSM and SSR stay restart-only.

## Session 15 rules
- **Texture coordinates along the track must be integrated per segment** (`vAcc += ds / tile(width)`), never `distance / tile(width)` – the latter smears the texture wherever the width changes (worse the further along the track).
- **Set-piece materials are opaque.** Broken-out arch/ice blocks are capped torus segments; flying chunks are real meshes (`debris.ts → DebrisPool`), not sprites.
- **Placing objects on terrain:** use the minimum of several height samples under the footprint (`groundMin` in `world.ts`, `place()` in `scatterDecor`), not the centre height.
- **SSR:** MRT channel `metalrough.r` is *reflectivity* (`max(metalness, smooth-dielectric term)`); SSRNode discards pixels where it is 0. New glossy non-metal surfaces need roughness < 0.3 to reflect.
- **Live graphics:** `Game.LIVE_GFX` lists what `applyLiveGfx` can change at runtime; `POST_KEYS` trigger a rebuild of `PostFX` (dispose old, warm up new). Anything baked into geometry/compiled materials stays restart-only – keep the two UI texts (pause menu, README) in sync with the list.
- **Slide strength** is `sk` (player) / `sk × 0.45` (AI). Retune grip (`0.035`), return rate (`1.4`), slip limiter (`0.88` rad) together and rerun `npm run check`.
- **Overheads** may carry `arch: { R, sy }` (checkpoint gates): ceiling = `sy·√((R−1.7)² − lat²)` above the road.
- **Pod extras:** `numberPlate()` (shared atlas + material, added to the hero body / rival near-LOD group), boost flaps via `boostK` in the hero `update()`. `buildPodModel(…, isOpponent, num)`.
- **Dust:** `particles.trail` (dry) / `particles.spray` (wet) from both engine tails in `Game.updateVisuals`; `dustAmt` scales it per world. Keep the 24 m near-camera reduction for rivals.

## UI layout, controls, obstacles, cache (Session 14)
- **No scrollbars, one UI scale.** Every menu/overlay lives inside `<Fit>` (`ui/Fit.tsx`): the window maps to a virtual canvas ≥ 1180 × 720 with the single scale `min(w/1180, h/720)` – identical on every screen. Design each screen to fit 720 px of virtual height: root `flex-1 flex flex-col min-h-0 p-6`, header `shrink-0`, panels in a fixed 3-column grid with `flex-1 min-h-0`; no `vh`/`vw`, no `overflow-auto`, no viewport breakpoints (`md:`/`lg:`), no percentage heights (use flex). If a screen is too tall, `Fit` shrinks only that screen (`data-fit-shrunk="1"`) and `tools/harness/pui.mjs` fails – make the screen more compact instead of accepting it.
- **HUD** is a scaled layer (reference 1280 × 720, `hs` in `RaceView`). Position with absolute px inside it.
- **Graphics panels** are one component (`ui/GfxPanels.tsx`) used by the settings screen and the pause menu. New option → field in `GfxSettings`, value in **all four** `PRESETS` (ultra = maximum), slider/toggle in `GfxPanels`, and – if it can change at runtime – in `Game.LIVE_GFX` + `Game.applyLiveGfx`.
- **HUD left/right:** internal `hpL` / `engL` = local x < 0 = screen-RIGHT in the chase view. Only `Game.hud()` swaps; do not "fix" it anywhere else.
- **`podModel.update(…, dmgL, dmgR, …)` receives HEALTH fractions** (1 = intact) despite the names.
- **Slide** (`physics.ts`): state `slideK` 0..1; all slide effects scale with it (grip, yaw boost, decel, body lean). No hard on/off switches.
- **Knife-edge controls:** `stepPod` mixes steer/pitch by the roll amount (`steerMix`, `pitchMix`); `aiInputs` applies the inverse so the AI keeps thinking in turn/pitch. Any new input consumer must read the mixed values.
- **Overheads:** `td.overheads` (filled by `trackDetail` gantries and the start portal) are solid in `stepPod`. New overhead structure → push `{ idx, y0, y1, half }`. Keep banner undersides ≥ 16 m above the road.
- **Breakable / vanished obstacles:** `o.breakable` (crates, rocks r < 2.9). A broken or despawned obstacle gets `broken = true` and is moved to x/z = 1e9, lat = 1e6 – every consumer ignores it without extra checks. Visual removal: `world.breakObstacle(o)`.
- **Roof cover:** `Game.cover` (player under `sample.roof > 0`) fades rain particles, lens drops, splashes, spray, rain audio.
- **Audio pause:** only `setPaused` may resume the context; never call `audio.resume()` from input handlers while paused.
- **Texture cache:** `texStore.ts` (IndexedDB), enabled only by `main.tsx`. Keys include a hash of the synthesis source – helper functions used by `computeTexture` must be part of that hash (`storeKey` in `textures.ts`) or stale textures survive code changes.

## Environment timeline, rain, storm, lights, loading (Session 13)
- **`environment.ts` owns everything about time of day and weather.** `resolveEnvironment(theme, tod, wx)` → `{ theme, fx, build, timeline, label }`. `theme`/`fx` = state at t = 0, `build` = union of everything the timeline can reach (rain road shader, lens rain, bolt mesh, stars, lights, ambient particle type, brightest sky for the PMREM). Anything that must exist at compile time has to come from `build`, never from the start state.
- **Realism table `CLIMATE`** (allowed weather, calm/severe, auto, local names). New world → add a row; the menu (`weatherOptionsFor`) and `sanitizeEnv` follow automatically. Never offer weather that does not fit the world.
- **Adding a blended parameter:** field in `EnvSnap` (+ `NUM`/`COL` list, `snapOf`, `emptySnap`) → apply it in `Game.applyEnv`. Colours in `EnvSnap` are sRGB triples (`setRGB(r, g, b, THREE.SRGBColorSpace)`).
- **Sun ↔ moon hand-over dips the light to zero** (`EnvTimeline.eval`); do not lerp the direction across the sky. `Game.setSunDir` updates sky, fog, shadow basis and the second sun.
- **Road wetness is the global uniform `WEATHER.wet`** (`materials.ts`), driven with soak/dry lag in `applyEnv`; keep it at 1 on worlds whose `build.rainRoad` is false (mud roads rely on it).
- **Rain streaks** (`particles.initAmbient`): direction/length come from the drop's screen-space velocity relative to the camera (`ambVel`). Wind is baked into the ambient velocities (use `build.wind`), density is runtime (`setAmbientAmount`). Lens drops: speed-dependent phase must be an accumulated uniform (`cine.uniforms.flow`), never `time × speed`.
- **Lightning never uses the full-screen flash**; it raises `sky.uniforms.flash`, hemisphere and environment intensity (all in `applyEnv`). Thunder goes through `audio.thunderBus`.
- **Lights:** `lights.ts → makeBeams` (one instanced additive cone mesh), `Game.updateLights`; everything scales with `lightLevel` (from `EnvSnap.dark`). Still only ONE real light besides sun/hemisphere.
- **Textures:** `texCore.ts` must stay free of three.js/DOM imports (it is bundled into the worker). `generateTexture` = sync, `generateTextures(specs)` = worker pool with in-flight dedupe; `worldTextureSpecs` is the single list used by the pre-warm in `Game.start` and by `buildWorld`. Worker registration only in `main.tsx` (`?worker&inline`) – harness and node stay synchronous.
- **AI dive rule** lives in `aiInputs` (`ai.dive`, `ai.diveT`, `ai.diveRoll`); CI fails above 1.5 % dive frames. Do not loosen it without re-measuring.

## Input, HUD, lights, weather front (Session 12)
- **Keys:** `keymap.ts` is the single source (`ACTIONS`, `KEY_PRESETS`, `normalizeKeys`, `bindKey`). `Game.readInput` / `onKey` only use `this.keymap`; never hard-code `KeyboardEvent.code` again. UI = `ui/KeyBindings.tsx`. New action → add to `Action`, `ACTIONS`, both presets, `readInput`.
- **HUD:** new fields go into `HudState` + `Game.hud()` + `RaceView.tsx`. HUD refreshes at ~12 Hz – no per-frame animation there.
- **Lights:** `EnvFx.dark` (0..1, from resolved sky brightness) > 0.45 → `navLights` (one `InstancedMesh`, 5 instances per pod, colours > 1 for gentle bloom) + one player `SpotLight`. No more real lights (every lit material pays per light).
- **Weather front / timelines:** superseded by the Session 13 environment timeline (next section).
- **Heat haze:** `post.heat` (2 screen positions, radius, strength), set in `Game.render`. UV offset only – keep it free of extra samples and control flow.
- **Real-app test:** `tools/harness/papp.mjs` (Puppeteer). Match UI text via `textContent` (CSS uppercases `innerText`). Software rendering runs the game ~16× slow: wait for the `LOS!` message instead of fixed times.

## Atmosphere pipeline (Session 11)
- **One entry point:** `resolveEnvironment(THEMES[id], race.timeOfDay, race.weather)` in `Game.start()` → `{ theme, fx }`. Pass only the resolved `theme` on; never read `THEMES[...]` again for visuals. New weather/time presets = edit `environment.ts` only. `theme.id` stays unchanged (texture caches, `STRATA`, `HEIGHT_FOG` keep working).
- **Blend colours in sRGB** (`mixHex`, `overcast`). A linear-space lerp left night skies mid-grey.
- **Sky (`sky.ts`):** cloud albedo scales with the sky light level (`lit`) – no constant white. `uniforms.flash` = lightning. Stars only when `theme.stars` is set.
- **Fog node (`atmosphere.ts`):** analytic height fog + 2 noise taps with `.level(0)` (valid in any control flow). It binds `macroTexture` in every fogged material: +1 sampler → keep material texture counts ≤ 14.
- **`screenUV` origin is top-left on WebGPU *and* WebGL2.** Any NDC → screen conversion must flip y (`0.5 - ndc.y * 0.5`). The old god-ray code did not.
- **Lens effects (`post.ts`):** compiled in only when needed (`env.rain > 0.05`, `env.flare`), gated by `gfx.lensFx`. Flare peak add < 0.85; do not raise (spec: no overexposure). Lightning must not use the full-screen `flash` uniform.
- **Weather runtime (`weather.ts`):** gust sheets go through `particles.alpha.spawn` (stay ≤ 12 spawns/frame); the bolt is one pre-allocated ribbon mesh rebuilt per strike.
- **Audio (`audio.ts`):** new continuous layers are created in `initLayers`, driven by `setEnv(slide, enclosure, rain, wind)` + `update`. One-shots: `thunder`, `whoosh`. Everything goes through the master compressor.
- **Mechanical props (`mechProps.ts`):** instanced only, no shadows; animated parts via per-frame instance matrices (≤ ~70). Towers stand `wall + 10.5 m` outside the road and are skipped at cliffs, gaps, tunnels, water.
- **Track width:** change only `TRACK_WIDTH`; rerun `npm run check`.
- **Pod contact** lives in `physics.ts → collidePods` (game + CI share it).

## Landscape assets (`decorGeo.ts`, Session 9)
- All scatter decor geometry lives in `src/game/decorGeo.ts` (pure functions, seeded, **no materials**). `world.ts → scatterDecor` only calls builders and `place(...)`.
- Variants = call the builder with different seeds and split the instance count (rocks 3, spires 3, mesas 2, trees 2). Keep the total count unchanged.
- Helpers: `ringSurface` (welded lathe grid, outward normals), `tube`, `paint` (vertex colours), `flat` / `smooth`, `merge`. Merged parts need identical attributes (`position, normal, uv` + `color` for trees/pines).
- Keep unit sizes: spire/mesa height `0..1` (scaled by `scaleY`), tree ≈ 19 m, pine ≈ 11 m, crystal cluster `h` param. `foot` in `place` must cover the base radius.
- Triangle budget per instance (gq 2): tree ≤ 1 400, spire ≤ 1 100, mesa ≤ 1 050, pine ≤ 300, rock 180. Check with a node script before raising.
- `rock` texture: never re-add un-warped Worley block cracks (reads as brick wall).
- Start gate: add parts only through `put(mat, geo)` / `strut(...)` in `mkGate` (5 merged buckets).

## Testing
- **`npm run check`** (≈ 25 s, node only): `tools/ci/sim.ts` – fails on NaN, deaths > 3, wall penetration > 0.6 m, ground clearance < 0.2 m, pod slower than 18 m/s. `DEBUG=1`, `TRACK=<id>`, `SECS=<n>`, `PITCH_AIR=1|0|-1` (jump experiment).
- **Session 18 tests:** CI prints `layout:` per track; harness views `f` (first HQ tree close-up), `o` (widest open flat); `?nophoto` disables the photo detail for A/B shots.
- **Session 17 tests:** CI prints a tunnel report per track + deck self-test; harness views `v` (inside first tunnel), `k` (above the first standard tunnel); pods harness item `3` = Quadra Lumber.
- **Session 16 tests:** harness views `u` (first main tunnel), `w` (zero-G tube); pods harness `?boost`; `NOGRID=1 npm run check` = old start behaviour for A/B; `papp.mjs` fakes a gamepad and rebinds Boost.
- **Session 15 tests:** `pui.mjs` prints scale + content height per screen and fails on non-uniform scale / emergency shrink; harness query `live` (runtime graphics switching), `ssr`, `wetnow`; views `x`/`y`/`z` = shortcut exit.
- **Session 14 tests:** `pui.mjs` (layout, 5 window sizes), `papp.mjs` (HUD sides, pause audio, pause graphics menu; `TWICE=1 LOAD_ONLY=1` = cache timing), CI overhead self-test + `smashed` column. Test handle in the browser: `window.__podracer`.
- **Session 13 test hooks:** harness `tod=sunset|sunrise|cycle`, `wx=front|clearing|changing`, `rt=<s>`; pshot items `audio` (level test via analyser) and `tex:1024` (worker benchmark, needs `out/texWorker.js`); `papp.mjs` env `LOAD_ONLY=1`, `QUERY='?noworkers'` → `[load]` line.
- **App smoke test:** `node papp.mjs <dist/index.html> <out prefix> '<profile json>'` after `npm run build`. Harness extras: `?ultra`, `?rt=<race seconds>`, `wx=front`.
- **Weather in tests:** harness query `?webgl&tod=night&wx=storm` (`flash`, `csm` optional), views `s` (towards the sun) and `m` (relay tower). `GRIP=0.88 npm run check` = storm grip.
- **`npm run check:gpu`**: `tools/ci/gpu.mjs` – WebGPU console check (`PUPPETEER_DIR`, `TRACKS=0,5`, `QUERY='?csm'`). Harness view `r` = 2.8 s of real racing (live particles/banking).
- **No Playwright?** Use Puppeteer: `tools/harness/pshot.mjs` (setup + commands in `HANDOFF.md` → "Test-Setup"). Screenshots need `?webgl`; WebGPU run = console-error check only (white screenshots in headless Chrome 148).
Headless WebGPU: `tools/harness/run.sh game "t0:a,t5:c,t3:c"` and `"s9:30"`. Track indices: 0 boonta, 1 frost, 2 neon, 3 magma, 4 dunepass, 5 jungle, 6 aquilaris, 7 oovo, 8 crystal, 9 malastare, 10 mosespa, 11 howler, 12 methane, 13 executioner.
