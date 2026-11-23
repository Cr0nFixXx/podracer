# Rules: menus, HUD, hangar, saved profile

Part of the agent manual (`CLAUDE.md`). Read this before you change a menu, the HUD, the hangar or what is saved in the profile.

- The tag at the end of a rule is the session that wrote it; rules written after Session 20 carry their date. **If two rules disagree, the later one wins** (date > `S20 …` > `S19` > … > `≤ S9`).
- Design intent: `DESIGN.md` → „Bedienoberfläche & HUD". Keys and gamepad: `physik-steuerung.md` → "Input".

## Layout
- **No scrollbars, one UI scale.** Every menu/overlay lives inside `<Fit>` (`ui/Fit.tsx`): the window maps to a virtual canvas ≥ 1180 × 720 with the single scale `min(w/1180, h/720)` – identical on every screen. Design each screen to fit 720 px of virtual height: root `flex-1 flex flex-col min-h-0 p-6`, header `shrink-0`, panels in a fixed 3-column grid with `flex-1 min-h-0`; no `vh`/`vw`, no `overflow-auto`, no viewport breakpoints (`md:`/`lg:`), no percentage heights (use flex). If a screen is too tall, `Fit` shrinks only that screen (`data-fit-shrunk="1"`) and `tools/harness/pui.mjs` fails – make the screen more compact instead of accepting it. *(S14)*

- **A heading painted with `bg-clip-text` needs a box as wide as its text (`w-max`).** The gradient is painted only inside the box: at 16:9 the title „PODRACER" overflowed its half of the main menu and read „PODRACE" – the last letter was transparent, and the pod preview lay on top of it as well (`relative z-20` on the column). `pui.mjs` now fails when a heading's text is wider than its box or covered by another element. *(2026-11-23)*

## Gamepad in the menus (2026-11-23, user request)
- **One hook for every screen: `usePadNav()` in `App` (`ui/usePadNav.tsx`).** It polls the first gamepad every frame and works on the page as it is: every visible, enabled `button`, `select` and `input[type=range]` that is not covered by an overlay is a target (`padTargets`). A new screen needs no code – only, if wanted, roles: `<Btn pad="default back start">` (plain elements: `data-pad-default`, `data-pad-back`, `data-pad-start`). Without `default` the top-left control gets the focus.
- **Buttons are fixed, not the rebindable driving layout:** D-pad / left stick move the focus · A presses · B = `data-pad-back` · Start = `data-pad-start` · on a slider or a selection list left / right change the value and **LB / RB move on sideways**. `<select>` cannot be opened by a gamepad (browsers want a real click): it steps through its options.
- **The pure parts live in `ui/padNav.ts`** (unit checks `padnav:`): `readPadNav` (stick 55 % on / 35 % off, stronger axis wins, D-pad buttons only in the standard layout), `PadRepeater` (one event per press; a held direction repeats after 380 ms every 130 ms; **nothing counts until the pad has been let go once** – the press that opened a menu must not act in it), `nextFocus` (nearest control in the direction: gap + 3 × sideways distance), `stepRange`.
- **Every control must be reachable.** `window.__padNav.unreachable()` lists the controls that cannot be reached from the default one; `tools/harness/ppad.mjs` fails on any (all screens, both hangar tabs, pause, result). Run it after every change to a screen's layout.
- **Focus ring inside the control:** `body.pad-nav :focus` (index.css) draws the cyan ring with a negative outline offset and an inset shadow – the buttons are cut with `clip-path`, an outline around them is invisible. The class `pad-nav` is set by the first gamepad event and removed when the mouse moves; `<PadLegend />` (the line naming the buttons) shows only with it. Put `<PadLegend />` into every overlay that is not inside `App`'s menu screens (pause, result).
- **A dialog that reads the gamepad itself** (binding a button) sets `document.body.dataset.padCapture = '1'` while it listens; the navigation keeps still and re-arms afterwards.
- **In the race, Start pauses on the press, not while held** (`Game.prevStartBtn`), and resuming marks Start, reset and view as held – otherwise „Weiter" by Start would pause again in the next frame.
- **Never test a gamepad press with a fixed pause.** With software rendering a menu frame can take 400 ms: a 70 ms press is missed, a two-frame hold counts as a repeat. `ppad.mjs` presses for exactly one frame of the page (`frames(1)`).

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
