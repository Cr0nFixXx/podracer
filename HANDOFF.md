# HANDOFF

## Nächster Schritt (zuerst lesen)
`npm run dev` → Renneinstellungen → **Wetter „Aufziehendes Gewitter"**, Tageszeit „Nacht", Strecke Boonta-Kessel → 90 s fahren und prüfen: Regen nimmt zu, Meldung „GEWITTER ZIEHT AUF", Blitze ab ca. 40 s, Scheinwerfer an (≈ 5 Min.).

## Git-Stand
- Lokales Repo im Projekt-Root, Branch **`B`**, Remote `origin` = `https://github.com/Cr0nFixXx/podracer.git`. **Pushen:** `git push origin B`.
- **Committen immer mit `npm run save -- "Nachricht"`** (`tools/save.sh`): staged alles außer `.archiv/git`, committet und schreibt das Sicherungs-Bundle `.archiv/git/podracer-B.bundle`.
- **Warum das Bundle:** Diese Sandbox verwirft zwischen Sitzungen den Ordner `.git` **und alle Dateien, die in `.gitignore` stehen**. In Session 11 stand das Bundle in `.gitignore` und ging deshalb mit verloren; die drei Einzel-Commits aus Session 9–11 sind dadurch weg. Der Inhalt ist vollständig erhalten und liegt jetzt als ein Sammel-Commit vor. Das Bundle ist jetzt **nicht** mehr ignoriert (wird per Pathspec aus den Commits herausgehalten, erscheint in `git status` als unversioniert – so gewollt).
- **`.git` fehlt, Bundle da?** `git clone -b B .archiv/git/podracer-B.bundle /tmp/rc && cp -r /tmp/rc/.git . && git remote set-url origin https://github.com/Cr0nFixXx/podracer.git && git status`.
- **`.git` und Bundle fehlen?** `git clone --branch B https://github.com/Cr0nFixXx/podracer.git /tmp/rc && cp -r /tmp/rc/.git .` → Arbeitsstand erscheint als Änderung → `npm run save -- "Stand wiederhergestellt"`.
- Commit-Autor ist der Platzhalter „Podracer Dev <dev@podracer.local>" (`git config user.name/user.email` vor dem Pushen anpassen).

## Stand: 2026-11-19 (Session 12) – Tastenbelegung, HUD-Fluglage, Nachtlichter, Wetterfront, Hitzeflimmern

### Erledigt in Session 12
1. **Tastenbelegung (`keymap.ts`, `ui/KeyBindings.tsx`):** 12 Aktionen frei belegbar (Einstellungen → Steuerung: Aktion anklicken, Taste drücken; Esc bricht ab). Eine Taste gehört immer nur zu einer Aktion. 2 Presets: „Standard (WASD + Pfeile = Fluglage)" und „Klassisch (Pfeile lenken, IJKL = Fluglage)". Gespeichert in `Profile.keys`; `Game.readInput` liest nur noch `this.keymap`. Pause bleibt fest auf Esc/P.
2. **HUD (`RaceView.tsx`, `HudState`):** Fluglage-Anzeige unten links (Pod-Symbol dreht mit der Rolle, Pfeil für Anheben/Neigen, Slide-Ladebalken – gelb ab Exit-Schub), Statuswort (FLUGLAGE / ROLLE / SLIDE / ANHEBEN / GLEITEN / NEIGEN / ABTAUCHEN), Wetter-/Tageszeit-Zeile unter der Karte. Tipp-Text im Ladebildschirm zeigt die tatsächlich belegten Tasten.
3. **Nachtlichter (`Game.updateLights`):** ab `EnvFx.dark > 0.45` (Nacht auf jeder Welt, Vulkanwelt, Oovo IV) pro Pod 2 Scheinwerfer, rot/grüne Flügelspitzen-Lichter, blinkendes Cockpit-Blitzlicht (1 instanzierter Draw-Call für alle Pods) + ein echter `SpotLight` am Spieler-Pod (auf die Fahrbahn 36 m voraus gerichtet).
4. **Wetter „Aufziehendes Gewitter" (`environment.ts` → `from`, `Game.applyFront`):** Start im Nieselregen, Überblendung zum Gewitter zwischen Rennsekunde 12 und 75: Himmel, Nebel (jetzt Uniforms in `atmosphere.ts`), Sonne/Hemisphäre, Belichtung, Regenmenge (Partikel + Linse), Blitzhäufigkeit, Wind, Haftung. Fahrbahn ist von Beginn an nass.
5. **Hitzeflimmern (`post.ts` → `heat`):** flirrende Brechung hinter beiden Düsen des Spieler-Pods (reiner UV-Versatz, keine Zusatz-Samples), stärker bei Schub/Boost/Hitze.
6. **Blitz-Einschlagglimmen** am Fußpunkt des Blitzkanals (`weather.ts`).
7. **Tooling:** `tools/harness/papp.mjs` – Smoke-Test der echten App (Menü → Rennen → Tasten → HUD-Screenshot → Einstellungen → Taste umbelegen). Harness-Query neu: `ultra`, `rt=<Rennsekunde>`, `wx=front`.

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden. `npm run build` → `dist/index.html`.
- **App-Smoke-Test** (`papp.mjs`, WebGL2/SwiftShader, Ando Prime Nacht + Schneeböen): Menüs durchgeklickt, Rennen gestartet, `W` + `→` gehalten → Pod rollt 90°, HUD zeigt „ROLLE", Wetterzeile „Nacht · Schneeböen", Scheinwerferkegel sichtbar; Umbelegen `Rolle nach links` → `Q` wird angezeigt und gespeichert; Preset „Klassisch" setzt `A / ←`. 0 Seitenfehler.
- `npm run check:gpu` (WebGPU): Ando Prime + Vulkan bei Nacht/Wetterfront (Rennsekunde 60), Boonta mit **Ultra + CSM + Gewitter** → 0 Konsolenfehler/-warnungen. Gleiches Ultra-Setup auf WebGL2 ohne Shader-Fehler (Textur-Budget hält).
- Standbilder: Wetterfront Start vs. Sekunde 90 (mehr Regen, Linsentropfen), Vulkan mit Lichtern.

### Nicht verifiziert
- **Ton** (kein Hörtest möglich), **Bildrate** auf echter GPU (Software-Rendering lief hier in ~1/16 Echtzeit).
- **Hitzeflimmern** und **Blitz-Einschlagglimmen** nicht im Bild gesehen (nur fehlerfrei kompiliert und gelaufen).
- Wetterfront nur als zwei Standbilder, nicht als durchgehender Übergang; Scheinwerfer auf der sehr dunklen Lava-Fahrbahn kaum sichtbar (beleuchtet vor allem Pods voraus).
- Umbelegen nur für eine Aktion getestet; Gamepad unverändert und ungetestet.

### Befehle (neu)
1. `npm run save -- "Nachricht"` – committen + Bundle schreiben.
2. `cd /tmp/t && node papp.mjs <repo>/dist/index.html /tmp/t/app '{"race":{"trackId":"frost","timeOfDay":"night","weather":"snow"}}'` – App-Smoke-Test (vorher `npm run build`, `cp tools/harness/papp.mjs /tmp/t/`).
3. Harness: `?webgl&wx=front&rt=90`, `?webgl&ultra&csm&wx=storm`.

---

## Stand: 2026-11-19 (Session 11) – Atmosphäre: Tageszeiten, Wetter, Blendung, Nebel, Sound, Mechanik

### Erledigt in Session 11
1. **Tageszeit & Wetter (`environment.ts`, neu):** `resolveEnvironment(theme, timeOfDay, weather)` liefert ein abgeleitetes `ThemeDef` (Himmel, Sonne/Mond, Nebel, Wolken, Ambient-Partikel, Belichtung) + `EnvFx` (Regen, Blitz, Böen, Wind, Nebelstärke, Blendung, Haftung, Nacht). Alles dahinter liest weiter nur `theme`.
   - Tageszeiten: Standard, Morgendämmerung, Mittag, Abenddämmerung, Nacht (Mondlicht + Sterne). Wetter: Standard, Klar, Regen, Gewitter, Schneeböen, Staubsturm, Nebel/Smog.
   - „Standard der Welt" hat jetzt pro Welt ein eigenes Wetter (Tabelle `AUTO`): Tatooine Staub, Ando Prime Schneeböen, Stadt Regen, Vulkan Smog, Dschungel Nebel, Aquilaris Regen, Kristall Nebel, Malastare Gewitter. Oovo IV (Weltraum) bleibt unberührt.
   - Auswahl: Renneinstellungen → „Tageszeit" / „Wetter" (`RaceConfig.timeOfDay/weather`). Regen/Sturm/Schnee senken die Haftung um 7–10 %.
2. **Volumetrischer Nebel (`atmosphere.ts`):** analytisch integrierter Höhennebel entlang des Sehstrahls + driftende Nebelbänke (2 Rausch-Taps mit explizitem LOD) + Vorwärtsstreuung zur Sonne. Kein Extra-Pass.
3. **Sonnenblendung & Lens-Flare (`post.ts`):** Schleier, Kernglühen, anamorpher Streifen, 4 Ghosts; Sichtbarkeit über 9 Depth-Taps am Sonnenpixel. Max. Zusatzhelligkeit < 0,85 → keine Überstrahlung. **Bug-Fix:** God-Rays nutzten eine vertikal gespiegelte Sonnenposition (`screenUV` ist oben-links) und erschienen deshalb praktisch nie.
4. **Regen:** Tropfen auf der Linse (wachsende/verdunstende Perlen + laufende Tropfen mit Spur, brechen das Bild), Regen als windschräge Streifen statt Punkte, dichteres Volumen, Gischt statt Staub hinter den Pods, nasse Fahrbahn auf jeder Strecke.
5. **Gewitter & Böen (`weather.ts`, neu):** Blitzkanal mit 2 Ästen als Ribbon-Mesh, Doppelblitz-Hüllkurve, Wolken leuchten von innen (`sky.uniforms.flash`), Hemisphärenlicht pulst, Donner zeitversetzt nach Entfernung. Böen-Schwaden (Schnee/Staub/Regennebel) über den GPU-Partikelpool.
6. **Sound (`audio.ts`):** Master-Kompressor, Turbinen-Whine, Sub-Bass, Düsenrauschen (Schub/Boost), Slide-Zischen, Regen, Windheulen, Donner, Roll-„Whoosh", Slap-back-Echo in Schluchten/Tunneln.
7. **Futuristisch/mechanisch (`mechProps.ts`, neu):** Repulsor-Relaistürme mit zwei gegenläufigen Zahnringen und Leuchtstreifen (alle ~280 m), Patrouillen-Drohnen neben der Strecke. 5 Draw-Calls, kein Schattenwurf.
8. **Strecken +18 % breiter** (`TRACK_WIDTH` in `trackBuilder.ts`).
9. **Grafik/Physik sonst:** Basalt-Textur ohne Wabenmuster (Glut nur in dünner Kruste), Wolken werden vom Himmelslicht beleuchtet (nachts dunkel, vorher immer 48 % Weiß), Slide-Staubfahne + Funken, Kondensstreifen bei 90°-Rolle, Schneeauflage auf der Fahrbahn bei Schneewetter, Pod-zu-Pod-Kollision rollbewusst und jetzt in `physics.ts` (`collidePods`) → vom CI abgedeckt.

### Verifiziert
- `npm run check`: 14/14 Strecken, 0 NaN, 0 m Wand-Durchdringung, Bodenfreiheit ≥ 0,66 m, max. 1 Ausfall je Strecke (Limit 3) – jetzt **inkl. Pod-Kollisionen** und breiterer Strecken. Zusätzlich `GRIP=0.88` (Sturm-Haftung): 14/14.
- WebGL2-Standbilder gesichtet: Boonta Staub + Sonnenblendung, Boonta Abenddämmerung, Dschungel Gewitter (Linsentropfen, nasse Fahrbahn), Ando Prime Nacht + Schnee (Sterne, Mond), Vulkan Abend + Smog, Malastare Abend + Gewitter, Stadt Abend + Gewitter (Regenstreifen, Linsentropfen), Relaisturm-Nahaufnahme.
- `npm run build` → `dist/index.html`.
- `npm run check:gpu` (WebGPU, SwiftShader) mit **0 Konsolenfehlern/-warnungen**: Dschungel + Ando Prime bei Gewitter/Nacht, Boonta + Vulkan mit Standardwetter (Staub/Smog, Lens-Flare aktiv), Kristall bei Schnee/Morgendämmerung mit CSM.

### Nicht verifiziert
- **Ton** (keine Audioausgabe in der Sandbox – nur Code-Review, kein Hörtest).
- **Bildrate** auf echter GPU mit Nebel-Node (+2 Textur-Taps je Fragment) und Linsen-Effekten.
- Blitz-Mesh, Böen-Schwaden und Drohnen in Bewegung (nur Standbilder; Blitz nur als erzwungener Himmels-Flash gesehen).
- Textur-Budget: Nebel-Node bindet `macroTexture` in jedem Material (+1 Sampler). WebGL2-Limit 16 – auf Ultra mit CSM auf echter Hardware prüfen.

### Befehle (neu)
1. Harness-Query: `?webgl&tod=night&wx=storm` (auch `flash` für Dauerblitz, `csm`). Ansichten neu: `s` (zur Sonne), `m` (Relaisturm).
2. `GRIP=0.88 npm run check` – Physik bei Sturm-Haftung.
3. (ersetzt durch `npm run save`, siehe „Git-Stand")

---

## Stand: 2026-11-19 (Session 10) – Performance, CI-Tooling, Flugsteuerung, Steigungen & Schrägkurven

### Erledigt in Session 10
1. **Neue Steuerung (`Game.ts → readInput`, `screens.tsx`, `RaceView.tsx`):** `W` Schub · `S` Umkehrschub/Bremse · `A`/`D` lenken · `Shift` Boost · `Leertaste` Luftbremse/Slide · `↑` Neigen · `↓` Anheben · `←`/`→` 90°-Rolle · `R` Reparatur · `C` Ansicht. Gamepad: rechter Stick = Rolle/Neigen/Anheben. Alte Belegung (Pfeile lenken, `E`/`Q`/`Strg` Luftbremse, Leertaste Boost) ist entfernt.
2. **Flugphysik (`physics.ts → stepPod`):** `Inputs.pitch` (+1 Anheben, −1 Neigen) und `Inputs.roll` (∓1 = ∓90°).
   - **Slide:** Luftbremse + Lenken am Boden → Seitenhaftung ×0,24, Bremswirkung ×0,42, Gierrate ×1,16; nach ≥ 0,45 s Slide gibt Loslassen + Schub bis +7 m/s.
   - **Anheben:** Schwebehöhe +1,6 m, Rampenabsprung +20 %, in der Luft halbe Schwerkraft (kostet ~10 %/s Tempo). **Neigen:** −0,45 m, +14 % Haftung, in der Luft 2,15-fache Schwerkraft.
   - **Rolle:** 90° in ≈ 0,23 s, Kollisionsbreite bis auf 22 %, Lenkwirkung −40 %, Schwebehöhe automatisch + 0,92 × halbe Spannweite.
   - **Triebwerke:** heben sich beim Lenken als Ganzes (außen +1,1 m, innen −0,22 m), **keine** eigene Neigung/Rollung mehr (`setEngineMotion(y, y, 0, 0, 0)`); Lenk-Schräglage des Pods 0,26 → 0,07 rad. Nicken von Cockpit + Triebwerken gemeinsam nur über `↑`/`↓` (plus Straßensteigung).
   - **Boden-Clamp exakt pro Punkt** (Bug-Fix): vorher hob der konservative Clamp Pods auf Gefällen/Schräglagen an → „in der Luft" mit halber Lenkung. Jetzt Spitze gegen Straße unter der Spitze, Heck gegen Straße unter dem Heck; vom Clamp getragene Pods gelten als `grounded`.
3. **KI (`aiInputs`):** gleitet über Lücken (Anheben), neigt nach Sprüngen zum schnellen Landen, rollt hochkant an nahen Hindernissen vorbei (Skill > 0,55), bremst in Slides mit.
4. **Strecken (`trackBuilder.ts`, alle 14 Maps automatisch):**
   - **Schrägkurven:** `bank = curv × 46`, Limit 0,39 (≈ 21°) bzw. 6,2 m Außenkanten-Überhöhung (vorher 2,4 m). Abkürzungen behalten die alte flache Querneigung. Überhöhung gibt Haftung (`bankGrip` bis ×1,9) und +45 %·|bank| KI-Referenztempo.
   - **Steigungen:** zwei geseedete Wellen (±15 m, ±6,5 m), Kontrollpunkt-Höhen ×1,2 → max. 11–17 % Steigung je Strecke. Flach gehalten an Start/Ziel, Rampen/Lücken, Zero-G-Röhren und überall, wo die Strecke sich selbst nahekommt (Über-/Unterführungen behalten ihre Höhe).
5. **Performance ohne Grafikverlust:**
   - **Partikel auf der GPU (`particles.ts`):** CPU schreibt nur noch Spawn-Datensätze in einen Ringpuffer (Teil-Upload); Flugbahn, Größe, Farbe, Tod rechnet der Vertex-Shader geschlossen. Vorher: bis 5 400 Partikel pro Frame auf der CPU integriert + 8 Floats/Partikel hochgeladen.
   - **Fern-LOD für Dekor (`world.ts → place` mit Option `lod`, `decorGeo.ts`):** Bäume 1 347 → 368 Dreiecke ab 240 m, Felsnadeln 1 078 → 539 ab 430 m (gleiche Seeds = gleiche Silhouette, sektorweise umgeschaltet).
6. **TODO §3 „Performance & Tooling":**
   - **GPU-Partikel:** umgesetzt als zustandslose Vertex-Shader-Simulation statt Compute-Pass (läuft identisch auf WebGPU **und** WebGL2, kein Readback, kein Zustand auf der GPU).
   - **CSM:** `CSMShadowNode`, 2 Kaskaden (0–104 m, 104–520 m, überblendet). **Opt-in** (`gfx.csm`, Schalter „Kaskaden-Schatten"), weil es einen Schattenpass mehr kostet.
   - **CI:** `npm run check` (Typecheck + Node-Physik-Sim, ≈ 25 s, kein Browser) und `npm run check:gpu` (WebGPU-Konsolencheck per Puppeteer).

### Verifiziert
- `npm run check`: 14/14 Strecken × 11 Pods × 45 s → **0 Abstürze, 0 NaN, 0 m Wand-Durchdringung, Bodenfreiheit ≥ 0,67 m**, langsamster Pod ≥ 51 m/s; Pod 0 fährt dabei Rolle/Anheben/Neigen/Slide als Stresstest.
- Sprungtest Boonta (`PITCH_AIR=1|0|-1`): Anheben 3,10 s / 324 m · neutral 1,60 s / 171 m · Neigen 0,86 s / 102 m.
- `npm run check:gpu` (WebGPU, SwiftShader): boonta, jungle und frost mit CSM → **0 Konsolenfehler/-warnungen**.
- WebGL2-Standbilder gesichtet: boonta (Start, Schrägkurve), jungle (Start, Fern-LOD), frost + CSM, magma. `npm run build` → 2,04 MB.

### Nicht verifiziert
- **FPS-Gewinn auf echter GPU** – nicht gemessen. Belegt sind nur weniger CPU-Arbeit pro Frame und weniger Dreiecke in der Ferne.
- **Fahrgefühl** der neuen Steuerung durch einen Menschen (Werte sind per Simulation abgestimmt, nicht per Probefahrt).
- CSM-Bildqualität auf echter GPU; Gamepad-Belegung (rechter Stick); Steigungen optisch nur auf 4 von 14 Strecken gesichtet.

### Befehle
1. `npm run check` – muss vor jedem Abschluss grün sein.
2. `DEBUG=1 TRACK=jungle npm run check` – schlechtester Fall je Strecke. `SECS=90` für längere Läufe.
3. `PUPPETEER_DIR=/tmp/t npm run check:gpu` – `TRACKS=0,5` wählt Strecken, `QUERY='?csm'` schaltet CSM zu.
4. Harness-Ansicht `r` (neu): 2,8 s echtes Rennen mit Schub, z. B. `pshot.mjs … "t0:r"`.

---

## Stand: 2026-11-18 (Session 9) – Landschafts-Assets, Fels-Textur, Startportal

### Erledigt in Session 9
1. **Aufräumen & Repo:** `canblatt.html` → `.archiv/`. Repo `Cr0nFixXx/podracer`, Branch **`B`**, liegt direkt im Projekt-Root (inkl. `.git`). Neu: `.gitignore` (`node_modules/`, `dist/`, Harness-Bilder).
2. **Neues Modul `src/game/decorGeo.ts`** (seeded, je 1 `BufferGeometry` pro Asset, wird von `scatterDecor` in `world.ts` instanziert):
   - `rockGeometry` – Brocken mit 9 Spaltebenen (kantige Bruchflächen), Schichtstufen, flacher Standfläche; 3 Varianten pro Thema.
   - `spireGeometry` – Hoodoos mit harten/weichen Schichten (überhängende Simse), Erosionsrillen, Schuttfuß, Deckstein, Neigung; 3 Varianten.
   - `mesaGeometry` – Tafelberge mit Schutthalden, 2 Klippenbändern mit Rinnen, Bank und Plateau; 2 Varianten.
   - `jungleTreeGeometry` – Brettwurzeln, gebogener Stamm, 4 Astgabeln, geschichtete Krone aus rauschverformten Lappen + Büscheln, Lianen; 2 Varianten.
   - `pineGeometry` (sternförmige hängende Astetagen + Schneelast), `crystalClusterGeometry` (Eissplitter & Kristalle, flat-shaded), `cactusGeometry` (gerippter Saguaro), `airshipGeometry` (Rennluftschiff mit Leitwerk, Gondel, Triebwerken), `pylonGeometry` (Dreibein-Energiemast).
3. **Fels-Textur (`textures.ts`, Kind `rock`):** Ziegel-/Mauerwerk-Look entfernt. Klüfte sind jetzt domain-verzerrt und öffnen nur in „schwachen" Zonen; dazu Feinschichtung und Tafoni-Löcher. Wirkt auf Schluchtwände, Felsnadeln, Brocken, Bögen in 6 Themen.
4. **Startportal (`world.ts` → `addStartArea`/`mkGate`):** kannelierte Türme auf Stufensockeln mit Kragenringen, Strebe mit Sprossen, Abspannseile, Warren-Fachwerk-Traverse, gerahmte Zeitentafel, Startlichter mit Blenden. Weiterhin in dieselben 5 Material-Buckets gemerged (keine zusätzlichen Draw-Calls).
5. **Stadt & Wracks (`world.ts`):** Megablöcke mit 4 Rücksprüngen, Eckrippen, Sky-Dock, Mast (2 Silhouetten); Türme mit Strebepfeilern, 2 Ringdecks, Nadel; Pod-Wracks mit offener Verkleidung, freiliegenden Spanten, losen Platten (`DoubleSide`).
6. **Harness:** `tools/harness/pshot.mjs` (Puppeteer-Variante von `shot.mjs`, schreibt zusätzlich Kontaktbogen `<out>_grid.jpg`).

### Verifiziert
- `npx tsc --noEmit -p .` → 0 Fehler. `npm run build` → `dist/index.html` (2,03 MB).
- Headless WebGL2 (SwiftShader), Screenshots **aller 14 Strecken** gesichtet (0 Konsolenfehler).
- Headless **WebGPU** (SwiftShader): crystal, frost, neon, jungle laden mit **0 Konsolen-Fehlern/-Warnungen**.
- Physik-Sim `s0:12` (boonta, 11 Pods): 0 Todesfälle, 0 NaN, 0 m hinter Wand.
- Alle 9 Geometrie-Builder: 0 NaN-Vertices (Node-Test).

### Nicht verifiziert
- **FPS auf echter GPU.** Dreiecke pro Instanz: Baum ~1 350 (gq 2) / ~1 050 (gq 1), Hoodoo ~1 080, Tafelberg ~1 010, Kiefer ~270, Kaktus ~600. Baum-Instanzen dafür 1 100 → 940.
- Nur Standbilder geprüft (Kamera `a`/`b`/`c`/`e`/`g`), kein gefahrenes Rennen im Browser; Kollision nur über `s0:12`.
- WebGPU-**Screenshots** sind in Chrome 148 headless weiß (Canvas-Präsentation des Harness, kein Spielfehler). Für Bilder `?webgl` verwenden; WebGPU nur auf Konsolenfehler prüfen.

### Test-Setup in frischer Sandbox (≈ 4 Min.; `.git` fehlt? → `git clone --branch B … /tmp/rc && cp -r /tmp/rc/.git .`)
1. `mkdir -p /tmp/t && cd /tmp/t && npm i puppeteer`
2. `sudo apt-get update && sudo apt-get install -y --no-install-recommends libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 libatspi2.0-0 libcups2 libcairo2 libpango-1.0-0`
3. `cd <repo>/tools/harness && npx esbuild game.ts --bundle --format=esm --outfile=out/game.js && cp pshot.mjs /tmp/t/`
4. `cd /tmp/t && node pshot.mjs <repo>/tools/harness/out/game.html "t0:e,t5:b" /tmp/t/out "?webgl"` → `/tmp/t/out_grid.jpg` (≈ 35 s pro Strecke)

---

## Stand: 2026-11-17 (Session 8) – Start-Lag, Grafikfehler, Sicht, Hindernisse & aktive Triebwerks-Aufhängung

### Erledigt in Session 8
1. **Rennstart-Lag beseitigt (`post.ts`, `Game.ts`, `particles.ts`, `podMaterials.ts`, `podModel.ts`, `trackMesh.ts`, `RaceView.tsx`)**
   - **Ursache 1 – Fehlende Pipeline-Vorkompilierung:** `r.compileAsync(scene, cam)` kompilierte fürs Canvas-Format statt für den `HalfFloat`-`scenePass` (+ Schatten + PostFX + Partikel + Pod-Fern-LOD) → alle Pipelines kompilierten erst mitten im Countdown/Start. **Fix:** `post.warmup(renderer)` kompiliert `scenePass.compileAsync`, rendert 2 komplette Frames (inkl. Seed-Partikeln & beiden Pod-LODs) und wartet auf `queue.onSubmittedWorkDone()` noch hinter dem Ladescreen.
   - **Ursache 2 – Fullscreen-Partikel-Overdraw an der Kamera:** `PointsNodeMaterial` teilte durch `-positionView.z` ohne Obergrenze → Abgas-/Staub-/Wetterpartikel vor/an der Verfolgerkamera wurden zu 4K-Vollbild-Quads. **Fix:** `sizeNode` auf `≤ 14–16 %` Bildhöhe gedeckelt, `0` für `vz < 1,2 m`, weicher Nah-Fade, keine Abgas-Spawns im Countdown.
   - **Ursache 3 – 64 einzelne Pod-Shader-Pipelines am Start:** Gegner-Lack, -Flammen, -Binder & -Glow laufen jetzt über **je 1 geteilte Pipeline** mit gebackenen Vertex-Farben (**64 → 11 TSL-Pipelines, 120 → 31 Materialien** für 11 Pods am Start).
   - **Ursache 4 – PostFX, Schatten & HUD-Filter:** `BloomNode.setResolutionScale(0.5)` (−75 % Fillrate), Schattenkarte `[0, 1024, 1536, 2048]` auf ±96 m, Ultra-SSR standardmäßig aus (optional zuschaltbar), 40-px-CSS-`drop-shadow` im 3-2-1-Countdown durch 0-ms-`textShadow` ersetzt, `smoke.ts` mit `macroTexture` statt 3D-Perlin.

2. **Restliche Grafikfehler behoben (`post.ts`, `trackMesh.ts`, `materials.ts`, `terrainMaterial.ts`, `world.ts`, `groundCover.ts`, `trackDetail.ts`)**
   - **AO & God Rays:** `depth.sample()` in nicht-uniformem `If`/`Loop` und `GTAONode`-Artefakte ersetzt durch 4-Paar-symmetrisches Depth-AO + 14-Tap-God-Rays per ableitungsfreiem `textureLoad` (0 WGSL-Uniformity-Fehler, 0 Halos, 0 Streifen auf Ebenen, immun gegen Partikel/Gras). SSR-Composite zu 100 % in uniformem Control-Flow.
   - **`StaticBatcher` (`trackMesh.ts`):** `BatchedMesh` (mit geteilter `_indirectTexture` zwischen Schatten- und Kamerapass) ersetzt durch räumlich gemergte 580-m-`THREE.Mesh`-Kacheln (0 `BatchedMesh`, unabhängiges Frustum-Culling, 0 Textur-Uploads/Frame).
   - **Naht- & TBN-Fixes:** `displace = 0` auf `wallMat` und Kanten-Lock (`uv.x = 0/1`) auf `roadMat` (keine Risse an Straßenkanten/Klippen/Tunneln); 128×-vorskalierter TBN + Silhouetten-Sprungschutz in `materials.ts`/`podMaterials.ts`; singularitätsfreies `xzNormalToView` + `polygonOffset` auf Wasser/Lava; überschneidungsfreier Kuppel-LOD für ferne Büsche; Moiré-freies Energiefeld.

3. **Weniger & klar erkennbare Streckenhindernisse (`trackBuilder.ts`, `world.ts`)**
   - Hindernisanzahl um **~55 % gesenkt** (Ø **7,5 statt ~17** pro Strecke), Mindestabstand **≥ 52 m**, Freihaltezone vor Rampen und Landezonen (`-68..+42` Samples für Set-Pieces), nur 1 Säule in Abkürzungstunneln.
   - Jedes Hindernis trägt jetzt einen leuchtenden Boden-Warnring, gelb-schwarze Warnstreifen (Kisten) bzw. mehrere Leuchtringe (Säulen) und eine hohe orange-rote Warnbake auf der Spitze (auch auf jedem Felsbrocken).

4. **Klare Sicht hinter Vordermännern (`particles.ts`, `Game.ts`)**
   - Kein grauer Rauch mehr aus intakten Triebwerken; Bodenstaub flach (`vy < 0,9`), klein (`≤ 3,2 m`), dezent (`alpha ≤ 0,06`) und bei Gegnern unter 24 m vor der Kamera komplett unterdrückt; Schadensrauch auf `alpha ≤ 0,16` (Gegner `× 0,32`) gedämpft + Kamera-Nahfade ab 12 m.

5. **5-Punkt-Bodenkollision & dynamische Triebwerks-Aufhängung (`physics.ts`, `podModel.ts`, `podMaterials.ts`, `podDesigns.ts`, `trackBuilder.ts`, `PodPreview.tsx`)**
   - Flughöhe `HOVER = 2,85 m`, exakte Straßenwölbung (`crown` + Randlippe) in `frameAt`/`roadSurfaceAt`, Längsneigung folgt realer Straßen-/Rampensteigung, harte 5-Punkt-Repulsor-Kollision (`MIN_ROAD_CLEAR = 0,68 m`) für linkes/rechtes Triebwerk (vorn/hinten inkl. Flügel) und Cockpit.
   - Beim Lenken & Luftbremsen schwingen linkes und rechtes Triebwerk per Feder-Dämpfer (`ω = 11,5, ζ = 0,66`) dynamisch gegengleich auf und ab (**0,99–1,78 m Hub**, Außentriebwerk steigt & hebt die Nase, Innentriebwerk taucht in den Scheitelpunkt) – bei Spieler **und** Gegnern, inkl. diagonal mitziehendem Energie-Binder und GPU-biegsamen Steuerseilen (`cableFlexMaterial`).
   - **Verifiziert:** alle 10 Pods im Extrem-Slalom + Luftbremse + Schanzen + harter Landung → **kleinste Bodenfreiheit `+0,81 m`, `0` Boden-Durchdringungen**; alle 14 Strecken × 11 Pods × 45 s → **`0` Todesfälle/Abstürze, `0` NaN**; 256 WGSL-/GLSL-Builds mit **0 Warnungen**.

### Nächster Schritt aus Session 8 (weiterhin offen)
`TODO.md` §1: Livery-Vorlagen & Startnummern im Hangar + Triebwerks-Hitzeflimmern (≈ 60–90 Min.).
