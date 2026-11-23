# Rules: menus, HUD, hangar, saved profile

Part of the agent manual (`CLAUDE.md`). Read this before you change a menu, the HUD, the hangar or what is saved in the profile.

- The tag at the end of a rule is the session that wrote it; rules written after Session 20 carry their date. **If two rules disagree, the later one wins** (date > `S20 …` > `S19` > … > `≤ S9`).
- Design intent: `DESIGN.md` → „Bedienoberfläche & HUD". Keys and gamepad: `physik-steuerung.md` → "Input".

## Layout
- **No scrollbars, one UI scale.** Every menu/overlay lives inside `<Fit>` (`ui/Fit.tsx`): the window maps to a virtual canvas ≥ 1180 × 720 with the single scale `min(w/1180, h/720)` – identical on every screen. Design each screen to fit 720 px of virtual height: root `flex-1 flex flex-col min-h-0 p-6`, header `shrink-0`, panels in a fixed 3-column grid with `flex-1 min-h-0`; no `vh`/`vw`, no `overflow-auto`, no viewport breakpoints (`md:`/`lg:`), no percentage heights (use flex). If a screen is too tall, `Fit` shrinks only that screen (`data-fit-shrunk="1"`) and `tools/harness/pui.mjs` fails – make the screen more compact instead of accepting it. *(S14)*

## HUD
- **HUD** is a scaled layer (reference 1280 × 720, `hs` in `RaceView`). Position with absolute px inside it. *(S14)*
- **The boost gauge is 230 px wide – a HUD label has no room to grow.** At 9 px with 0.25 em tracking a character is ≈ 8 px: the line above the heat bar holds the state label and the percentage, nothing more (longest state: „ÜBERZOGEN · NOCH 2.4 s"). A third text there wraps BOTH labels into two lines (2026-11-23, the climate label). New information goes into the row under the bar (left of „MAX", not while BEREIT is shown) or elsewhere. The smoke test `tools/harness/papp.mjs` checks every label of the gauge: one line, inside the gauge, no overlap (`HUD boost gauge labels: … ok`) – it looks at the state the test race is in, so try a new label with the track and weather that make it longest. *(2026-11-23)*
- **HUD left/right:** internal `hpL` / `engL` = local x < 0 = screen-RIGHT in the chase view. Only `Game.hud()` swaps; do not "fix" it anywhere else. *(S14)*
- **HUD:** new fields go into `HudState` + `Game.hud()` + `RaceView.tsx`. HUD refreshes at ~12 Hz – no per-frame animation there. *(S12)*

## Graphics panels
- **Graphics panels** are one component (`ui/GfxPanels.tsx`) used by the settings screen and the pause menu. New option → field in `GfxSettings`, value in **all four** `PRESETS` (ultra = maximum), slider/toggle in `GfxPanels`, and – if it can change at runtime – in `Game.LIVE_GFX` + `Game.applyLiveGfx`. *(S14)*

## Hangar
- **Hangar preview:** the model is rebuilt only when a part tier changes (`tuneTiers(tune)` in the effect's dependencies of `PodPreview.tsx`) – a tuning step that mounts no new part must not rebuild it. The list is headed "Racer" (glossary: Podracer is the game). *(2026-11-22)*
- **Hangar pod list:** one line per racer (28 px, pod name left, pilot's first name right) – 14 fit; with more racers make the list denser, never scroll. *(S20 Pods)*

## Saved profile
- **Saved profile:** key `podracer-profile-v2`; a v1 save is imported once and never written again (an older build would crash on pod ids it does not know). `loadProfile` validates the pod side (`sanitizeCustom`, unknown `podId` → first pod, unknown track → first track, `MAX_OPPONENTS`). New `PodCustom` fields must be sanitised there. *(S20 Pods)*
- **Everything a save holds is forced into what the screens can produce** (`settings.ts`): `sanitizeRace` (laps 1..`MAX_LAPS`; `difficulty` and `camera` are list indices – `difficulty: 9` used to crash `Game.createPods`; time of day and weather from their lists), `sanitizeGfx` (the ranges of the settings screen, a value of the wrong kind → default, unknown fields dropped), volume 0..1, best times > 0. **A new setting needs its line in `sanitizeGfx` / `sanitizeRace`**, or it is lost on load – the unit check "every setting the screens can produce survives saving and loading" fails then. `CAMERA_NAMES` and `MAX_LAPS` live in `settings.ts` (no three import: the node checks read them). *(2026-11-22)*
