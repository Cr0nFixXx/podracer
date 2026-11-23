# Rules: time of day, weather, sky, fog, lights, audio

Part of the agent manual (`CLAUDE.md`). Read this before you change `environment.ts`, the sky, the fog, weather effects, lights or audio.

- The tag at the end of a rule is the session that wrote it; rules written after Session 20 carry their date. **If two rules disagree, the later one wins** (date > `S20 …` > `S19` > … > `≤ S9`).
- Design intent: `DESIGN.md` → „Umwelt: Tageszeit, Wetter, Licht" and „Audio".

## Environment: one entry point
- **`environment.ts` owns everything about time of day and weather.** `resolveEnvironment(theme, tod, wx)` → `{ theme, fx, build, timeline, label }`. `theme`/`fx` = state at t = 0, `build` = union of everything the timeline can reach (rain road shader, lens rain, bolt mesh, stars, lights, ambient particle type, brightest sky for the PMREM). Anything that must exist at compile time has to come from `build`, never from the start state. *(S13)*
- **Realism table `CLIMATE`** (allowed weather, calm/severe, auto, local names). New world → add a row; the menu (`weatherOptionsFor`) and `sanitizeEnv` follow automatically. Never offer weather that does not fit the world. *(S13)*
- **Adding a blended parameter:** field in `EnvSnap` (+ `NUM`/`COL` list, `snapOf`, `emptySnap`) → apply it in `Game.applyEnv`. Colours in `EnvSnap` are sRGB triples (`setRGB(r, g, b, THREE.SRGBColorSpace)`). *(S13)*
- **Sun ↔ moon hand-over dips the light to zero** (`EnvTimeline.eval`); do not lerp the direction across the sky. `Game.setSunDir` updates sky, fog, shadow basis and the second sun. *(S13)*
- **One entry point:** `resolveEnvironment(THEMES[id], race.timeOfDay, race.weather)` in `Game.start()` → `{ theme, fx }`. Pass only the resolved `theme` on; never read `THEMES[...]` again for visuals. New weather/time presets = edit `environment.ts` only. `theme.id` stays unchanged (texture caches, `STRATA`, `HEIGHT_FOG` keep working). *(S11)*
- **Blend colours in sRGB** (`mixHex`, `overcast`). A linear-space lerp left night skies mid-grey. *(S11)*

## Sky and fog
- **C¹ fog:** `atmosphere.ts` integrates `F(u) = min(u,0) + (1-exp(-b·max(u,0)))/b` (zero shelf below `baseY`). *(S19)*
- **Sky (`sky.ts`):** cloud albedo scales with the sky light level (`lit`) – no constant white. `uniforms.flash` = lightning. Stars only when `theme.stars` is set. *(S11)*
- **Fog node (`atmosphere.ts`):** analytic height fog + 2 noise taps with `.level(0)` (valid in any control flow). It binds `macroTexture` in every fogged material: +1 sampler → keep material texture counts ≤ 14. *(S11)*

## Climate and the boost
- **Climate, time of day and weather change only the engine heat of the boost** (user decision 2026-11-22; never the boost's power): `EnvFx.heat` = `engineHeat(theme, weather, strength, dark)` in `environment.ts`, clamped to 0.75 … 1.25, blended like `grip` (`EnvSnap.heat`), applied in `Game.applyEnv` as `heatMul` and handed to `stepPod` (heating × factor, cooling ÷ factor – for the Gegner too). Tables `HEAT_CLIMATE`, `HEAT_HOT_DAY`, `HEAT_WX`. The ground multiplies on top (`SurfaceDef.heat`), so keep the climate values moderate. Shown in the race menu on the line of the label „Wetter" (`screens.tsx`, `data-heat-env`; it must not get a line of its own – the setup screen has no height to spare at 1280 × 720, `pui.mjs` fails) and UNDER the heat bar, left (`HudState.heatEnv`, from 3 %; hidden while overheated – the row then belongs to the mark BEREIT. Not in the line above the bar: label + climate + percentage are wider than the gauge, both labels broke in two – seen 2026-11-23, `papp.mjs` checks it now). Unit checks `boost climate: …`. *(2026-11-22)*

## Rain, wetness, storm
- **Weather intensity** numbers live in `environment.ts` (fog/sun/wind per weather), `particles.initAmbient` (count, streak width/opacity), `weather.ts` (gusts, lightning rate), `Game.applyEnv` (flash). *(S16)*
- **Roof cover:** `Game.cover` (player under `sample.roof > 0`) fades rain particles, lens drops, splashes, spray, rain audio. *(S14)*
- **Road wetness is the global uniform `WEATHER.wet`** (`materials.ts`), driven with soak/dry lag in `applyEnv`; keep it at 1 on worlds whose `build.rainRoad` is false (mud roads rely on it). *(S13)*
- **Rain streaks** (`particles.initAmbient`): direction/length come from the drop's screen-space velocity relative to the camera (`ambVel`). Wind is baked into the ambient velocities (use `build.wind`), density is runtime (`setAmbientAmount`). Lens drops: speed-dependent phase must be an accumulated uniform (`cine.uniforms.flow`), never `time × speed`. *(S13)*
- **Lightning never uses the full-screen flash**; it raises `sky.uniforms.flash`, hemisphere and environment intensity (all in `applyEnv`). Thunder goes through `audio.thunderBus`. *(S13)*
- **Weather runtime (`weather.ts`):** gust sheets go through `particles.alpha.spawn` (stay ≤ 12 spawns/frame); the bolt is one pre-allocated ribbon mesh rebuilt per strike. *(S11)*

## Lights
- **Lights:** `lights.ts → makeBeams` (one instanced additive cone mesh), `Game.updateLights`; everything scales with `lightLevel` (from `EnvSnap.dark`). Still only ONE real light besides sun/hemisphere. *(S13)*
- **Lights:** `EnvFx.dark` (0..1, from resolved sky brightness) > 0.45 → `navLights` (one `InstancedMesh`, 5 instances per pod, colours > 1 for gentle bloom) + one player `SpotLight`. No more real lights (every lit material pays per light). *(S12)*

## Audio
- **Audio pause:** only `setPaused` may resume the context; never call `audio.resume()` from input handlers while paused. *(S14)*
- **Audio (`audio.ts`):** new continuous layers are created in `initLayers`, driven by `setEnv(slide, enclosure, rain, wind)` + `update`. One-shots: `thunder`, `whoosh`. Everything goes through the master compressor. *(S11)*
