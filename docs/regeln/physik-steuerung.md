# Rules: flight physics, AI, input

Part of the agent manual (`CLAUDE.md`). Read this before you change `physics.ts`, the AI or the input handling.

- The tag at the end of a rule is the session that wrote it; rules written after Session 20 carry their date. **If two rules disagree, the later one wins** (date > `S20 …` > `S19` > … > `≤ S9`).
- Design intent: `DESIGN.md` → „Flug, Steuerung & Kamera".
- Measuring the hull of a pod (`podHulls.json`): `pods.md`. Tunnel shapes and overheads as they are built: `strecken.md`.

## Hull, tunnel vault, overheads
- **Decided by the user (2026-11-22): a pod counts as high as its largest outfit.** One hull per pod (`podHulls.json`, "largest outfit"): Teile never change what fits under a vault, no Teil ever sticks in the ceiling; the price is up to 0.70 m less room than the factory pod shows (Aurora XR-7). Do not measure hulls per mounted outfit. *(2026-11-22)*
- **What a pod must stay out of is tested against ONE shape: its hull** – `src/game/podHulls.json` → `podEnvelope().hull` (three parts: left engine side, right engine side, cockpit; slabs `HULL_SLAB` = 3 m wide; the pod in its largest outfit, so Teile never change how a pod drives). `hullWorld(p, env)` in `physics.ts` puts its corners where the model is drawn: yaw, pitch, roll, engine travel, cockpit sway (`COCKPIT_SWAY` – shared with `podModel.ts`). Tunnel vaults (`vaultOver`: every corner against the shell above THAT corner) and overheads (highest / lowest corner under the structure) use it. Never put a pod height or a box into physics again: 2.15 m for all left tall pods 3.5 m inside the vault, and one height above the pod centre ignored pitch (the nose of a climbing pod was up to 5.96 m higher). *(S20 Strecken)*
- **The vault only stops a pod in the AIR** (`!p.grounded`) and is tested LAST in `stepPod`, when pitch, roll, engine travel and cockpit sway are final. A pod that rides on its repulsors is never pressed down: on knife-edge right beside a wall its upper wing tip stands in the vault's flank, and pressing it down would fight the ground clamp – do not add that back. Where a cave forks the higher shell of the two tubes counts; a corner beyond a portal is under the open sky. **Arches are read at the pod CENTRE's lateral position** (their collision shape is padded for that: `arch.inner`); only the pod's height comes from the hull. *(S20 Strecken)*
- **Portal entry is decided by the vault height at the pod's lateral position** (`p.upper`), and the ceiling pushes down at most 45 m/s. Otherwise a pod that enters above the low side vault is pressed through the headwall (CI: downward teleports). *(S20 Strecken)*
- **Never clamp a pod down to a ceiling it approached from outside.** Entering a roofed run decides once: `PodState.upper` (drive on the deck, ground = road + `roof + TUNNEL_DECK`) or inside (ceiling applies). Everything that asks "is this pod under a roof?" must use `roof > 0 && !p.upper`. CI: deck self-test + `downward teleports` must stay 0. *(S17)*

## Hover, ground clamp, engines
- **Ground clamp is exact per point** (front tip vs. road under the tip, tail vs. road under the tail; roll uses barrel-or-wingtip). Never go back to `max(front, back)` floors – on gradients it lifts pods off the road (`grounded = false`, half steering). Clamp range grows with `knife·halfSpan` and lift. *(S10)*
- **Engines never tilt on their own:** `engPL/engPR` stay `0`, `setEngineMotion(yL, yR, 0, 0, 0)`. Steering = pure vertical heave (outer +1.1 m, inner −0.22 m). Whole-pod pitch only from road slope + pitch key. *(S10)*
- **Hover & turbine articulation (`physics.ts`, `podDesigns.ts`, `podModel.ts`):** `HOVER = 2.85 m`, `MIN_ROAD_CLEAR = 0.68 m`. `roadSurfaceAt` includes exact road crown + curb lip. `stepPod` aligns `pitch` to real longitudinal road slope, drives spring-damped opposite L/R engine heave & pitch (`engYL/engYR/engPL/engPR`, outer turbine rises ~1 m, inner tucks ~0.5 m) with diagonal binder tilt & GPU-flexing control cables (`cableFlexMaterial`), and enforces a 5-point repulsor ground clamp under L/R engines & cockpit (0 road clipping). *(≤ S9)*

## Surfaces, slide, boost
- **Handling per surface (`stepPod`):** `SF = surfaceOf(sample.surf)`; grip and top speed apply only when `grounded && !zeroG`, heat scales boost heat-up and cool-down. Rival reference speeds: `q.vmax *= 0.45 + 0.55 · grip`. World base grip lives in `Game.baseGrip` (ice 0.8, jungle 0.9). Retune → `npm run check` and `GRIP=0.88 npm run check`. HUD: `HudState.surface` / `surfaceFx`. *(S20 Strecken)*
- **Boost overdrive:** `PodState.overT` (0..3 s) in the heat block of `stepPod`; HUD field `overdrive`. *(S17)*
- **Slide strength** is `sk` (player) / `sk × 0.45` (AI). Retune grip (`0.035`), return rate (`1.4`), slip limiter (`0.88` rad) together and rerun `npm run check`. *(S15)*
- **Slide** (`physics.ts`): state `slideK` 0..1; all slide effects scale with it (grip, yaw boost, decel, body lean). No hard on/off switches. *(S14)*
- **Slide** = `airbraking && |steer| > 0.25 && grounded`. AI adds brake while sliding too fast; keep that when retuning grip (`0.24`). *(S10)*

## Roll, pitch, knife-edge, zero-G
- **Zero-G** (`p.zeroG`): free vertical thrusters (`pc·30`), weak centring, `vmax ×1.28`, thrust ×1.35, no drag, grip ×0.34; guided down 26 samples before the tube ends. CI prints tube vs. ground speed. *(S16)*
- **Knife-edge controls:** `stepPod` mixes steer/pitch by the roll amount (`steerMix`, `pitchMix`); `aiInputs` applies the inverse so the AI keeps thinking in turn/pitch. Any new input consumer must read the mixed values. *(S14)*
- **`Inputs.pitch` / `Inputs.roll` are optional** (old call sites keep compiling). Smoothed states live in `PodState.pitchCtl / rollCtl`; `p.roll = rollBase·(1-knife) + rollCtl·π/2`. *(S10)*

## Pod contact
- **Pod contact** lives in `physics.ts → collidePods` (game + CI share it). *(S11)*
- Who gets the event of a contact, and which zone a wall hit counts as: `pods.md` → "Damage". *(2026-11-22)*

## AI
- **AI start discipline:** `ai.gridLat` (grid lane) is held for ~4.5 s, blended out until 7.5 s; no lateral dodging and lift-off when tailgating during that phase. CI column `startTouch`. *(S16)*
- **AI dive rule** lives in `aiInputs` (`ai.dive`, `ai.diveT`, `ai.diveRoll`); CI fails above 1.5 % dive frames. Do not loosen it without re-measuring. *(S13)*

## Input: keys and gamepad
- **Reversing mirrors the yaw** (`dirF` in `stepPod`): stick right swings the tail to the right, as a car does in reverse. Only the steering term is mirrored – the pull of a damaged engine side (`hpR − hpL`) keeps its direction. The authority runs through 0 at standstill (`lowF`), so nothing jumps. A Gegner never reverses (`aiInputs` only brakes above its target speed). Unit checks `steering: …`. *(2026-11-22)*
- **The game only READS gamepads:** `navigator.getGamepads()` once per frame in `Game.readInput` (so only while a race runs) and in `PadBindings` (settings → Steuerung, as long as that screen is open). It sends nothing to a pad: no vibration, no HID / USB / Bluetooth API. That has been so since the first upload (2026-11-16); Session 16 only made the mapping configurable. **A controller that powers off when a race starts is not switched off by game code** – the race is the first moment the page uses the Gamepad API, and only then does the browser start to poll the pad (in Chromium / Edge on Windows through `Windows.Gaming.Input`). Reported by the user on 2026-11-22 (Edge, wireless Xbox controller: off at every race start, off again 1–2 s after switching it on). Suspected cause, **not confirmed**: Microsoft's GameInput runtime 4.0.300 (October 2026) powered Xbox controllers off by itself, 4.0.302 fixed it (`winget upgrade Microsoft.GameInput`). The sandbox has neither a controller nor Windows; the user's cross-check is an open item in `TODO.md` section 1. Details: `docs/verlauf/2026-11-22-controller-und-action.md`. Do not hunt for this in `readInput` again before that cross-check is in. *(2026-11-22)*
- **Gamepad:** `PadMap` in `keymap.ts` (`padValue`, `readPadBind`, `bindPad`); `Game.readInput` reads only `this.padmap`; UI `PadBindings`. Start (button 9) = pause, fixed. *(S16)*
- **Keys:** `keymap.ts` is the single source (`ACTIONS`, `KEY_PRESETS`, `normalizeKeys`, `bindKey`). `Game.readInput` / `onKey` only use `this.keymap`; never hard-code `KeyboardEvent.code` again. UI = `ui/KeyBindings.tsx`. New action → add to `Action`, `ACTIONS`, both presets, `readInput`. *(S12)*
- **Key map (`Game.readInput`):** `W` thrust, `S` brake/reverse, `A`/`D` steer, `Shift` boost, `Space` air brake / slide, `↑` dive (`pitch = -1`), `↓` lift (`pitch = +1`), `←`/`→` 90° roll (`roll = ∓1`), `R` repair, `C` view. Arrows never steer. Update `screens.tsx` + `RaceView.tsx` + `README.md` together when changing keys. *(S10)*
