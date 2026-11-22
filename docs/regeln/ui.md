# Rules: menus, HUD, hangar, saved profile

Part of the agent manual (`CLAUDE.md`). Read this before you change a menu, the HUD, the hangar or what is saved in the profile.

- The tag at the end of a rule is the session that wrote it; rules written after Session 20 carry their date. **If two rules disagree, the later one wins** (date > `S20 …` > `S19` > … > `≤ S9`).
- Design intent: `DESIGN.md` → „Bedienoberfläche & HUD". Keys and gamepad: `physik-steuerung.md` → "Input".

## Layout
- **No scrollbars, one UI scale.** Every menu/overlay lives inside `<Fit>` (`ui/Fit.tsx`): the window maps to a virtual canvas ≥ 1180 × 720 with the single scale `min(w/1180, h/720)` – identical on every screen. Design each screen to fit 720 px of virtual height: root `flex-1 flex flex-col min-h-0 p-6`, header `shrink-0`, panels in a fixed 3-column grid with `flex-1 min-h-0`; no `vh`/`vw`, no `overflow-auto`, no viewport breakpoints (`md:`/`lg:`), no percentage heights (use flex). If a screen is too tall, `Fit` shrinks only that screen (`data-fit-shrunk="1"`) and `tools/harness/pui.mjs` fails – make the screen more compact instead of accepting it. *(S14)*

## HUD
- **HUD** is a scaled layer (reference 1280 × 720, `hs` in `RaceView`). Position with absolute px inside it. *(S14)*
- **HUD left/right:** internal `hpL` / `engL` = local x < 0 = screen-RIGHT in the chase view. Only `Game.hud()` swaps; do not "fix" it anywhere else. *(S14)*
- **HUD:** new fields go into `HudState` + `Game.hud()` + `RaceView.tsx`. HUD refreshes at ~12 Hz – no per-frame animation there. *(S12)*

## Graphics panels
- **Graphics panels** are one component (`ui/GfxPanels.tsx`) used by the settings screen and the pause menu. New option → field in `GfxSettings`, value in **all four** `PRESETS` (ultra = maximum), slider/toggle in `GfxPanels`, and – if it can change at runtime – in `Game.LIVE_GFX` + `Game.applyLiveGfx`. *(S14)*

## Hangar
- **Hangar pod list:** one line per racer (28 px, pod name left, pilot's first name right) – 14 fit; with more racers make the list denser, never scroll. *(S20 Pods)*

## Saved profile
- **Saved profile:** key `podracer-profile-v2`; a v1 save is imported once and never written again (an older build would crash on pod ids it does not know). `loadProfile` validates the pod side (`sanitizeCustom`, unknown `podId` → first pod, unknown track → first track, `MAX_OPPONENTS`); `race.difficulty`, `race.laps` and the `gfx` values are still taken as saved. New `PodCustom` fields must be sanitised there. *(S20 Pods)*
