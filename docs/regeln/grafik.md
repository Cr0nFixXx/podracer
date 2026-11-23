# Rules: rendering, materials, textures, particles

Part of the agent manual (`CLAUDE.md`). Read this before you change the renderer, a TSL material, post-processing, textures or particles.

- The tag at the end of a rule is the session that wrote it; rules written after Session 20 carry their date. **If two rules disagree, the later one wins** (date > `S20 …` > `S19` > … > `≤ S9`).
- Design intent: `DESIGN.md` → „Grafik & Effekte". Sky, fog, rain and lights: `umwelt.md`. Pod materials and the shared Gegner pipelines: also `pods.md`.

## Renderer and TSL
- Renderer/node classes from `three/webgpu`, TSL from `three/tsl`. **No `ShaderMaterial` / `onBeforeCompile` / `EffectComposer`.** *(≤ S9)*
- WGSL strictness: no constant `smoothstep(a,b,x)` with `a >= b` → `ssInv`. Keep all `.sample()` calls in uniform control flow; inside `If`/`Loop` use `textureLoad(...)` (for depth) or `.level(0)` / `.grad(dx, dy)`. In `Fn((_params, builder) => ...)`, `builder` is the **2nd** argument. *(≤ S9)*
- **`screenUV` origin is top-left on WebGPU *and* WebGL2.** Any NDC → screen conversion must flip y (`0.5 - ndc.y * 0.5`). The old god-ray code did not. *(S11)*

## Normals, materials, batching
- **Normals & displacement:** Terrain/water/lava use singularity-free, derivative-free `xzNormalToView` / `transformNormalToView` + `polygonOffset` (`terrainMaterial.ts`). Roads/cliffs/pods use 128× pre-scaled derivative TBN with silhouette-jump rejection (`safePerturbNormal` / `safeHullNormal`). Never apply vertex `displace` to `wallMat` (tears seams); on `roadMat` taper displacement to `0` at `uv.x = 0/1`. Build PMREM with `makeSky(theme, true)`. *(≤ S9)*
- **Static batching, pods & particles:** `StaticBatcher` (`trackMesh.ts`) merges world-space chunks into 580 m `THREE.Mesh` tiles (no `BatchedMesh`). All 10 opponent pods share **3 single TSL pipelines** (`sharedOpponentHullMaterial`, `sharedOpponentFlameMaterial`, `sharedOpponentBinderMaterial`) via baked vertex colours + 2-tier LOD (`48 m` / `520 m`). `PointsNodeMaterial` (`particles.ts`) clamps `sizeNode` to `≤ 0.16 * -positionView.z` and `0` for `vz < 1.2 m` with near-fade (prevents camera-plane overdraw & keeps sightlines clear). Texture budget: max 16/stage (peak 12–13/16; height in `map.a`, roughness in `normalMap.a`). *(≤ S9)*
- **Snow layer (`snowDeck.ts`) – what the first version got wrong:** (1) tangent × right points DOWN in this code base (`right = (−cos yaw, sin yaw)`): a grid built along / across the track needs the index order `i0, i1, i2` or it is back-face culled and simply invisible. (2) A texture read in `positionNode` must be `.level(0)` (vertex stage); the fragment stage takes its own `texture()` nodes. (3) One-channel data: `DataTexture(…, RedFormat, UnsignedByteType)`, linear filter, no mipmaps, `needsUpdate` only when the field is dirty. Checked on WebGL2 (pictures) and WebGPU (`check:gpu`, track 1). *(2026-11-22)*

## Post-processing
- **The warm-up draws `WARM_FRAMES` (4) frames, not one** (`post.ts → warmup`): a pass that is a node of its own (SSR, bloom, the RTT textures between two passes) builds its inner materials again in the frame AFTER the material round it was built – their `setup()` sets `needsUpdate`, the old render object is disposed and its pipeline compiled anew. With SSR + SMAA the chain is three frames long: with two warm-up frames the three SSR pipelines (`SSR [ Reflections ]`, `Blur Level 0 / 1`) were compiled in the first frame of the countdown. After adding a pass that contains other passes, repeat the proof in `tests.md` ("no pipeline is compiled after the warm-up"). *(2026-11-22)*
- **Heat haze slots:** `post.heat.plumes` has 6 slots (player + 2 nearest rivals). *(S19)*
- **`reflRes`** (0.35–1) scales the SSR buffer; restart-only like SSR. *(S17)*
- **SSR:** MRT channel `metalrough.r` is *reflectivity* (`max(metalness, smooth-dielectric term)`); SSRNode discards pixels where it is 0. New glossy non-metal surfaces need roughness < 0.3 to reflect. *(S15)*
- **Heat haze:** `post.heat` (2 screen positions, radius, strength), set in `Game.render`. UV offset only – keep it free of extra samples and control flow. *(S12)*
- **Lens effects (`post.ts`):** compiled in only when needed (`env.rain > 0.05`, `env.flare`), gated by `gfx.lensFx`. Flare peak add < 0.85; do not raise (spec: no overexposure). Lightning must not use the full-screen `flash` uniform. *(S11)*
- **PostFX & warmup (`post.ts`):** AO = 4-pair symmetric `textureLoad` depth concavity (0 MRT, 0 flat-plane striping, 0 halos, immune to transparents). Bloom runs at `0.5×` resolution (`threshold = 2.1`). God rays = 14-tap `textureLoad` sky-depth shafts. SSR (opt-in) masks transparents with compile-time `alpha = 0` + `NormalBlending` in MRT. Always run `await post.warmup(renderer)` (with seeded particles & revealed pod LODs) before `onReady()` so countdown frame 1 never stalls. Never use full-screen CSS `filter: drop-shadow` on HUD text (`textShadow` only). *(≤ S9)*

## Graphics settings: live or restart
- **Live graphics now also:** volumetrics (`fog.hOn` / `fog.bankOn` uniforms – the fog branch is always compiled) and anisotropy (`setTextureAnisotropy`). CSM and SSR stay restart-only. *(S16)*
- **Live graphics:** `Game.LIVE_GFX` lists what `applyLiveGfx` can change at runtime; `POST_KEYS` trigger a rebuild of `PostFX` (dispose old, warm up new). Anything baked into geometry/compiled materials stays restart-only – keep the two UI texts (pause menu, README) in sync with the list. *(S15)*
- **CSM** is opt-in (`gfx.csm`): `CSMShadowNode` on `sun.shadow.shadowNode`; call `csm.updateFrustums()` only after `csm.camera` exists (first render). *(S10)*

## Textures
- **PBR photo sets (`pbrTex.ts`, `photoAssets.ts`, `src/assets/pbr/<name>_{c,n,p}.jpg`, lava also `_e`):** `TexSpec.photo = '<set>'` replaces the procedural bytes when the set is registered (browser only – node CI and `?nophoto` fall back to the spec's `kind`). Packed into the usual TexSet layout (height in `map.a`, roughness in `normalMap.a`), albedo graded to the spec's palette. New set → entry in `tools/photos/pbr.py` (CC0 sources only), import in `photoAssets.ts`, credit in README. 1024 px JPEG, tileable. *(S20 Strecken)*
- **Texture memory:** `beginTextureEpoch()` (world build) keeps only the current and the previous world's sets. Do not cache TexSets at module level outside `textures.ts`. *(S20 Strecken)*
- **Photo textures:** `photoTex.ts` (`KIND` map, `applyPhotoDetail` in `textures.wrap()` on COPIES – the persistent cache stores the pure procedural bytes), sources bundled in `photoAssets.ts`, registered by `main.tsx` and the harness only. Photos must be 512² power-of-two, tileable, lighting-flattened (`tools/photos/process.mjs`). Any esbuild call that bundles `Game` needs `--loader:.jpg=dataurl`. *(S18)*
- **Texture cache:** `texStore.ts` (IndexedDB), enabled only by `main.tsx`. Keys include a hash of the synthesis source – helper functions used by `computeTexture` must be part of that hash (`storeKey` in `textures.ts`) or stale textures survive code changes. *(S14)*
- **Textures:** `texCore.ts` must stay free of three.js/DOM imports (it is bundled into the worker). `generateTexture` = sync, `generateTextures(specs)` = worker pool with in-flight dedupe; `worldTextureSpecs` is the single list used by the pre-warm in `Game.start` and by `buildWorld`. Worker registration only in `main.tsx` (`?worker&inline`) – harness and node stay synchronous. *(S13)*
- `rock` texture: never re-add un-warped Worley block cracks (reads as brick wall). *(S9)*

## Particles and dust
- **Particle pools add update ranges** (the renderer clears them after upload). Any test that runs several `Game.update()` calls without rendering must call `pool.fullUpload()` before the screenshot (the harness does) – otherwise particles are missing in the picture although the game is fine. *(S17)*
- **Own-pod dust must stay visible:** spawn under the engines, inherit ~80 % of the pod velocity with strong drag (slipstream), slight outward drift; alpha-pool near fade is 3–8.5 m. Check with harness view `r`. *(S17)*
- **Dust:** `particles.trail` (dry) / `particles.spray` (wet) from both engine tails in `Game.updateVisuals`; `dustAmt` scales it per world. Keep the 24 m near-camera reduction for rivals. *(S15)*
- **Particles (`particles.ts`):** stateless GPU simulation. `Pool.spawn` writes one record (5 × vec4) into a ring buffer; the vertex shader integrates drag/gravity in closed form. No per-frame CPU loop – never reintroduce `pos/vel` arrays. Colour/alpha travel as one `varying(vec4)`. *(S10)*

## Performance target
- **Target hardware:** "Ultra" aims at a gaming PC (Core i9 + RTX 4090) – max detail there; lower presets must not get slower. The dev laptop cannot prove Ultra frame rate: report triangles + draw calls (ADR 0002). *(S20 Pods)*
