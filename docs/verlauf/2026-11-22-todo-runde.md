# Stand: 2026-11-22 – TODO-Runde: Wandtreffer, Pod-Kleinigkeiten, Aufwärmen, zweiter Build, GitHub-Action

Auftrag des Nutzers: aus `TODO.md` die Entscheidungen (Abschnitt 2) durchgehen und abarbeiten – Pods: Kleinigkeiten aus der Durchsicht, die drei nachübersetzten Pipelines; Werkzeuge: Build-Größe / mehrere Dateien, Aufräumen, `pui.mjs`, GitHub Actions, Fern-LOD für Tafelberge. Abschnitt 1 (echte GPU) prüft der Nutzer selbst.

## Entscheidungen des Nutzers
| Frage | Entscheidung | Folge |
|---|---|---|
| Pod-Höhe an Decke und Brücken | **bleibt:** ein Pod zählt so hoch wie seine größte Ausstattung | nichts geändert, Regel in `docs/regeln/physik-steuerung.md` |
| Wandtreffer | **frontal = Zone „Front"** | umgesetzt (Punkt 1) |
| `npm run save` | **abgeschaltet lassen** | nichts geändert; ob das Skript ganz entfernt wird, bleibt offen |
| Build in mehrere Dateien | **zweiter Build daneben** | `npm run build:web` (Punkt 4) |
| Pushen | **am Ende direkt auf `dev`** | gepusht; die GitHub-Action kam in der Folgerunde nach (siehe „Git") |

## Was gemacht wurde
### 1. Wandtreffer: womit der Pod trifft, entscheidet
- `physics.ts`, Wandkontakt in `stepPod`: die Zone kommt aus `hitZone(p, nx, nz)` statt fest „Seite" – gelesen, bevor die Nase an die Wand gedreht wird. Steiler als 30° zur Wand = „Front", sonst „Seite" (dieselbe Regel wie bei Hindernissen).
- Beispiel Mandrel Ram: frontal kommen 54 % des Treffers durch (Rammbug und Rammring), seitlich 105 %.
- Dabei gesehen: eine Leitplanke schadet nur einem tief fliegenden Pod; darüber fängt das Energiefeld ihn ohne Schaden ab. Felswände schaden immer. (Nicht geändert, jetzt in den Regeln.)
- Sim: 13 / 13 Strecken, 0 Ausfälle. Die Tabelle hat sich verschoben (Tempo je Strecke ± 5 m/s): andere Zone → anderer Schaden → andere verlorene Teile.

### 2. Kleinigkeiten aus der Pod-Durchsicht – alle zehn Punkte der Liste „Zurückgestellt"
| Punkt | Jetzt | Geprüft mit |
|---|---|---|
| Halo: Abschlussplatten 4 cm durch die Ringhaut, Nieten schweben | Platte hat die Form des Ringquerschnitts und liegt überall innen; Nieten sind in die Haut versenkte Stifte (Kopf 4 mm über einer Rippe). +512 Dreiecke je Bau (Spieler „Hoch" 32 810 → 33 322) – Basiswerte und Hülle neu geschrieben | Unit-Prüfung misst die Platte gegen die gebaute Haut (der alte Balken fällt durch); Bild im Pod-Harness |
| Treffermarken auf dem Kernradius | die Marke sitzt auf der Haut, die der Treffer zuerst trifft (`skinPoint`): Manta 2,05 m statt 0,50 m von der Achse, Halo 1,73 m, Cyclone 1,81 m (Rotor-Reif). Ein abgefallenes Teil bekommt keine Marke | 3 Unit-Prüfungen über alle 14 Racer |
| Pod gegen Pod: Marke nur bei der Hälfte der Kontakte | ein Ereignis je Kontakt, und der Spieler bekommt es, wenn er beteiligt ist (Marke, volle Lautstärke) | Unit-Prüfung, beide Reihenfolgen |
| CI: Teleport-Messung übersprang 2–3 Bilder nach einem Respawn | genau das eine Bild des Respawns bleibt außen vor | Sim: 0 Teleports auf allen Strecken |
| Hangar baut das Modell bei jedem Tuning-Klick neu | nur noch, wenn sich eine Teile-Stufe ändert | Typprüfung; Hangar-Seite im UI-Test ohne Fehler (das Ausbleiben des Neubaus selbst ist nicht gemessen) |
| Bild-Server des Harness nahm jede Herkunft an | nur noch der lokale Entwicklungsserver (`localhost:5173`), sonst 403; weitere über `SHOT_ORIGINS` | `curl`: erlaubt 200, fremd 403, ohne Herkunft 200 |
| Toter Code | entfernt: `cockpit.style` / `CockpitStyle`, `cockpitExtras`, `cockpitDesigns`, `glass` / `skin` in `sharedPodMaterials` | Typprüfung, Pod-Audit unverändert |
| `loadProfile` prüft `difficulty` / `laps` / Grafik nicht | alles, was ein Spielstand enthält, wird in die Bereiche der Menüs gezwungen (`sanitizeRace`, `sanitizeGfx`); `difficulty: 9` stürzt nicht mehr ab | 3 Unit-Prüfungen (auch: alle vier Voreinstellungen überleben Speichern und Laden) |
| Wörter | Hangar-Liste heißt „Racer"; „abgerissen" statt „ausgefallen" / „verklemmt" / „leck", wenn das Teil sichtbar abfällt (Kreisel-Stabilisator, Ansaugklappen, Radiator); Kommentare in `data.ts` berichtigt | Unit-Prüfung über alle Bruchteile |
| `DebrisPool.dispose` nie aufgerufen, ein Feld je Bild | beide Pools werden mit dem Spiel freigegeben; kein Feld mehr je Bild im `update` des Spieler-Pods | Typprüfung, Smoke-Test |

### 3. Aufwärmen: die drei nachübersetzten Pipelines
- **Gefunden** (WebGPU im Headless-Chrome, Boonta, Voreinstellung „Hoch"; jede neue Pipeline mit Objekt- und Materialname protokolliert): es waren keine Welt-Meshes, sondern die drei Durchgänge der Spiegelungen – `SSR [ Reflections ]`, `SSR [ Blur Level 0 ]`, `SSR [ Blur Level 1 ]` – und sie entstanden im **ersten Bild nach dem Aufwärmen** (erstes Bild des Countdowns), nicht in der ersten Rennsekunde.
- **Ursache:** ein Durchgang, der selbst ein Knoten ist (SSR, Bloom, die Zwischentexturen), baut seine inneren Materialien ein Bild nach dem Material neu, das ihn enthält. Mit SSR + SMAA ist diese Kette drei Bilder lang; das Aufwärmen zeichnete zwei.
- **Behoben:** `post.ts → warmup` zeichnet vier Bilder (`WARM_FRAMES`). Gemessen danach: 0 neue Pipelines nach dem Aufwärmen – „Hoch" (113 beim Laden, 103 im Cache) und „Ultra" (114 / 104), auch nicht im Countdown und in den ersten 1,3 s des Rennens.

### 4. Zweiter Build für einen Webserver
- `npm run build` bleibt, wie er ist: `dist/index.html`, eine Datei (17,61 MB), läuft per Doppelklick. `vite.config.ts` ist nicht angefasst.
- Neu: `npm run build:web` (`vite.web.config.ts`) → Ordner `build/`, 13,06 MB in 56 Dateien: Code in drei Teilen (three.js 1 068 kB, Spiel 665 kB, React 192 kB – komprimiert 312 + 247 + 60 kB), 51 Bilder (11,19 MB), relative Adressen (läuft auch in einem Unterordner). `npm run preview:web` zeigt ihn lokal.
- Über einen lokalen Server gemessen: bis zum Menü 10 Dateien, davon 5 Bilder (0,74 MB); beim Start eines Rennens auf dem Frostspalt-Ring 15 weitere Bilder (3,20 MB) – nur die Sets dieser Strecke. Kein Fehler, keine fehlende Datei.
- `index.html`: Symbol für den Browser-Tab als eingebettete Grafik (ohne sie fragte der gehostete Build den Server nach `/favicon.ico` → 404).
- Nicht per Doppelklick: mehrere Dateien lädt ein Browser von der Festplatte nicht als Module.

### 5. Aufräumen und Werkzeuge
- **Harness-Bundles sind nicht mehr in Git:** `tools/harness/out/` ist ignoriert (vorher `game.js` 19,8 MB, `pods.js` 3,1 MB, `texWorker.js` und zwei Seiten). Neu: `npm run harness:build` (`tools/harness/build.mjs`) baut alles in ≈ 2 s auf jedem System. Das nur unter Linux lauffähige `tools/harness/run.sh` (Playwright) ist gelöscht; `npm run check:gpu` baut sein Bundle über das neue Skript.
- `world.ts → place()`: der Früh-Ausstieg bei Anzahl 0 stand hinter einem Kommentar – wieder aktiv (ohne Wirkung auf das Bild: es wurde auch vorher nichts gesetzt).
- `tools/harness/pui.mjs`: der Planeten-Filter wird mit „Frostspalt-Ring" (muss verschwinden) und „Boonta-Kessel" (muss bleiben) geprüft statt mit der gelöschten „Neon-Spirale" – die Prüfung schlug vorher immer fehl.
- `tools/harness/papp.mjs` nimmt auch eine http-Adresse (Web-Build). Das Strecken-Harness setzt `window.__podracer` wie die App.

### 6. GitHub-Action
- `.github/workflows/check.yml`: bei jedem Push auf `dev` und jedem Pull Request nach `main` laufen `npm ci`, `npm run check`, `npm run build`, `npm run build:web` (Node 20 wie in der Sandbox).
- `npm run check:gpu` ist ein zweiter Job, der nur läuft, wenn man den Lauf von Hand startet und das Häkchen setzt; schlägt er fehl, wird der Lauf nicht rot.
- Der Push dieser einen Datei wurde in dieser Runde abgelehnt: dem Zugangstoken des Nutzers fehlte das Recht, Workflow-Dateien zu schreiben. **Nachtrag:** seit der Folgerunde ist die Action auf GitHub, der erste Lauf war grün – [Protokoll](2026-11-22-controller-und-action.md).

### 7. Fern-LOD für Tafelberge: gemessen, nicht gebaut
| Strecke | Bild am Start | Tafelberge | Anteil | Zwilling ab 900 m spart | Draw-Calls der Tafelberge heute → mit Sektoren |
|---|---|---|---|---|---|
| Dünenpass-Sprint | 2 997 772 Dreiecke, 161 Draw-Calls | 74 × 1 008 = 74 592 | 2,5 % | 1,6 % | 2 → bis 42 |
| Boonta-Kessel | 2 770 234 Dreiecke, 161 Draw-Calls | 80 × 1 008 = 80 640 | 2,9 % | 1,9 % | 2 → bis 46 |

- 87–88 % der Tafelberge stehen weiter als 900 m von der Strecke; ein Zwilling mit einem Viertel der Dreiecke sparte also höchstens 1,9 % eines Bildes.
- Ein Zwilling braucht die Aufteilung in 900-m-Sektoren. Aus 2 Draw-Calls würden bis zu 46 – mehr Arbeit für die CPU, als die GPU spart. **Die Messung rechtfertigt es nicht.**
- Voreinstellung „Hoch", Geometrie-Stufe 2, WebGL2 in Software; gezählt ist die Szene, nicht die Bildrate.

## Geprüft
- `npm run check` grün: 85 Unit-Prüfungen (12 neue), Pod-Audit 14 / 14, Sim 13 / 13 Strecken mit 0 Ausfällen und 0 Teleports.
- Gegenprobe der neuen Prüfungen: mit der alten Wand-Regel fallen zwei „walls"-Prüfungen durch, mit dem alten Balken die Halo-Prüfung.
- `npm run build` und `npm run build:web` bauen.
- App-Smoke-Test (`papp.mjs`, eine Datei, Lyss Halo-9 auf dem Boonta-Kessel): bestanden. Ladetest der fertigen Datei nach der letzten Änderung (`index.html`): lädt bis zum HUD (Tarn Cyclone, Dünenpass-Sprint).
- UI-Test (`pui.mjs`, 1280 × 720): bestanden, Planeten-Filter in Ordnung.
- Web-Build über einen lokalen Server (Dorn Manta, Frostspalt-Ring): lädt, Rennen startet, keine Fehler.
- Pipelines nach dem Aufwärmen: 0 („Hoch" und „Ultra", WebGPU in Software).

## Nicht geprüft
- Auf echter GPU: ob der Ruckler im ersten Bild des Countdowns spürbar war und jetzt weg ist (gezählt sind Pipelines, nicht Millisekunden); Brandmarken an Manta, Halo, Cyclone am Bild; Halo-Schnittkanten aus der Nähe; Wandtreffer von Hand gefahren.
- Die GitHub-Action lief in dieser Runde nicht auf GitHub (siehe „Git"); geprüft war nur: gültiges YAML, die Befehle darin liefen in der Sandbox. **Nachtrag:** der erste Lauf in der Folgerunde war grün. Der optionale WebGPU-Job ist noch nie gelaufen (muss von Hand gestartet werden).
- Der Web-Build ist nirgends hochgeladen; getestet ist er nur lokal im Headless-Chrome (WebGL2).
- Der Bild-Server des Harness nur mit `curl`, nicht aus einem Browser unter Windows.

## Git
- Commit `6fc55fc` (alles außer der GitHub-Action) und der Commit mit dem Git-Stand sind auf Wunsch des Nutzers nach `origin/dev` gepusht.
- Der Commit „GitHub-Action …" (`.github/workflows/check.yml`) blieb in dieser Runde lokal: GitHub lehnte ihn ab („refusing to allow a Personal Access Token to create or update workflow … without `workflow` scope"). **Nachtrag:** in der Folgerunde gepusht als `2d089ca` ([Protokoll](2026-11-22-controller-und-action.md)).

## Erledigt (aus `TODO.md`)
- [x] Entscheidung prüfen: ein Pod zählt so hoch wie seine größte Ausstattung (Aurora XR-7 ab Werk 0,70 m mehr, als sie ist) – oder Höhe je montierter Ausstattung? → **entschieden: bleibt so** (ein Pod zählt so hoch wie seine größte Ausstattung)
- [x] **Entscheidung des Nutzers:** sollen frontale Wandtreffer als Zone „Front" zählen (dann helfen Rammbug und harte Nase auch an der Wand)? Heute zählt jede Wand als „Seite" → **entschieden und umgesetzt: frontal = „Front"**
- [x] Kleinigkeiten aus der Durchsicht (Liste in `docs/verlauf/2026-11-21-session-20-pods.md` → „Zurückgestellt"): Halo-Abschlussplatten 4 cm durch die Ringhaut · Treffermarken bei Manta / Halo / Cyclone auf dem Kernradius · keine Marke bei der Hälfte der Pod-Kontakte · Hangar baut das Modell bei jedem Tuning-Klick neu · toter Code (`cockpit.style`, `cockpitExtras`) · `loadProfile` prüft `difficulty` / `laps` nicht → alle zehn Punkte der Liste behoben
- [x] In der ersten Rennsekunde werden 3 Pipelines nachübersetzt (Welt-Meshes, keine Pods) – ins Aufwärmen nehmen? → es waren die drei SSR-Durchgänge im ersten Bild des Countdowns; das Aufwärmen zeichnet jetzt vier Bilder
- [x] **Aufräumen:** `tools/harness/out/game.js` (19,6 MB Build-Artefakt) ist getrackt – aus dem Repo nehmen; `world.ts → place()`: der Früh-Ausstieg `if (count <= 0)` steht versehentlich hinter einem Kommentar → beides erledigt, der ganze Ordner `tools/harness/out/` ist ignoriert
- [x] `tools/harness/pui.mjs:39` prüft noch die gelöschte „Neon-Spirale" → anpassen; `tools/harness/run.sh` läuft nur unter Linux → `pui.mjs` prüft mit „Frostspalt-Ring" / „Boonta-Kessel"; `run.sh` gelöscht, `npm run harness:build` läuft auf jedem System
- [x] **Fern-LOD auch für Tafelberge**, falls die Messung es rechtfertigt (Kiefern und Felsbrocken haben seit Session 20 einen Zwilling) → gemessen: lohnt nicht, nicht gebaut
- [x] **`npm run check` in GitHub Actions** (Push auf `dev`), `check:gpu` als optionaler Job → `.github/workflows/check.yml` (auf GitHub seit der Folgerunde)
