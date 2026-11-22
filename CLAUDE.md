# CLAUDE.md – Agent Manual

## Always
- Output style: skill **i-have-adhd** (https://raw.githubusercontent.com/ayghri/i-have-adhd/refs/heads/main/skills/i-have-adhd/SKILL.md) – next action first, numbered steps, state restated, max 5 items per list group, no preamble/closers.
- **Start of a session:** read `HANDOFF.md` (next step, git state).
- **Read the rules for the area before you change code** – table "Rules by area" below. Those files are part of this manual.
- **Docs:** update them at the end of every task – table "Where things are written down" below.
- Never hand-edit `package.json` / `vite.config.ts`. Add deps with `npm install <pkg>`.
- Finish with `npm run build` → `dist/index.html` (single file). The second build `npm run build:web` → `build/` (many files, for a web server; `vite.web.config.ts`) must build too. Archived unrelated HTML stays in `.archiv/`.
- Spec don'ts: **no film grain, no excessive bloom / overexposure.**
- **Before finishing: `npm run check` must be green** (typecheck + unit checks + pod audit + 13-track node physics sim). Add npm scripts only with `npm pkg set scripts.<name>=…`.
- **Git:** commit after every finished task (user request) with plain commits – `git add <explicit paths>`, `git commit` – and run **`git gc --prune=now`** after every commit: the saved sandbox workspace may only hold 128 MB. Never `git add -A` by hand, never push unless asked. `npm run save` is switched off. The harness bundles (`tools/harness/out/`) are not in git: `npm run harness:build`. Work branch: `dev`. Details: `docs/regeln/git-sandbox.md`.
- **Words:** use the glossary in `CONTEXT.md` (Racer, Cockpit, Tuning-Teil, Style-Teil, Schadensmodell, Bruchteil, Gegner …). Hard-to-reverse decisions live in `docs/adr/`.

## Repo
- Root = Klon von `https://github.com/Cr0nFixXx/podracer.git`, Arbeitszweig **`dev`** (Stand: `HANDOFF.md` → „Git-Stand"). `.archiv/` enthält fremde Alt-Dateien (nicht anfassen, nicht ins Spiel einbinden).

## Stack
React 19 · Vite 7 · Tailwind 4 · three r187 **WebGPURenderer** (WebGPU, auto WebGL2 fallback) · **TSL** · TypeScript strict. Typecheck: `npx tsc --noEmit -p .`.

## Rules by area – read before you change code
| If you touch … | read first |
|---|---|
| pods: geometry, cockpits, engines, Teile, damage, look of the Gegner | `docs/regeln/pods.md` |
| tracks: layout, surfaces, tunnels, caves, set pieces, landscape, decor | `docs/regeln/strecken.md` |
| flight physics, hull against vaults and overheads, AI, keys, gamepad | `docs/regeln/physik-steuerung.md` |
| renderer, TSL, materials, post-processing, textures, particles | `docs/regeln/grafik.md` |
| time of day, weather, sky, fog, lights, audio | `docs/regeln/umwelt.md` |
| menus, HUD, hangar, saved profile | `docs/regeln/ui.md` |
| checks, harness, browser tests, test setup | `docs/regeln/tests.md` |
| git, commits, sandbox limits, after a reset | `docs/regeln/git-sandbox.md` |

- A rule ends with the session that wrote it (`S20 Pods`, `S19` … `≤ S9`); rules written after Session 20 carry their date. **If two rules disagree, the later one wins.**
- New rule → into the area file, under the fitting heading, tagged with the date. The rule it replaces → delete it there.

## Where things are written down
| File | Holds | Update |
|---|---|---|
| `HANDOFF.md` | next step, git state, pointers | every task |
| `TODO.md` | open items only, by topic | every task |
| `docs/verlauf/` | one file per task: what was done, numbers, what was verified and what was not (index: `docs/verlauf/README.md`) | every task: new file `YYYY-MM-DD-thema.md`, add it to the index, move finished TODO items into it |
| `docs/regeln/*.md` | the rules by area (table above) | when a rule was learned or replaced |
| `DESIGN.md` | look & feel, by topic | when the design changed |
| `README.md` | the game for players, commands for developers | when features, controls or commands changed |
| `CONTEXT.md`, `docs/adr/` | glossary, hard-to-reverse decisions | when a term or such a decision was added |
