# Stand: 2026-11-21 – Session 20 (Pods), alle Phasen fertig – Pod-Überholung: Cockpits, Details, 4 neue Pods, Tuning-Optik, Schadensmodelle

> **Verlauf.** Wörtlich aus dem früheren `HANDOFF.md` übernommen (Doku-Umbau am 2026-11-22). Verweise wie „Abschnitt … unten", „`HANDOFF.md` → …" oder „Regeln in `CLAUDE.md`" meinen den Stand von damals: die Protokolle stehen heute in diesem Ordner ([Übersicht](README.md)), die Regeln in `docs/regeln/`.

### Auftrag und abgestimmte Entscheidungen
1. **Umfang (nur Pods):** alle 10 Cockpits individuell neu, mehr Details, 4 neue Pods (Halo, Manta, Voltspire, Cyclone – eigene Entwürfe und Namen), Tuning mit sichtbaren Teilen, eigenes Schadensmodell je Racer.
2. **Tuning:** die 7 Tuning-Werte werden als **Tuning-Teile** sichtbar, dazu frei wählbare **Style-Teile** (Finnen, Einlass, Düse, Kanzel). Alles frei, kein Shop, kein Ausblend-Schalter.
3. **Schaden:** Optik + Fahrverhalten, mild (5–10 % je verlorenem Bruchteil, höchstens −15 % je Wert). Bruchteile brechen bei 50 / 35 / 20 % Triebwerkszustand und bleiben bis zum Respawn weg. Explosionsregel unverändert. **Treffermarken** statt echter Dellen.
4. **Ziel-Hardware:** Gaming-PC des Nutzers (Core i9 + RTX 4090) → **maximale Details auf „Ultra"**, nahe Gegner auf Ultra mit vollen Details. Dieses Notebook (Latitude 5590, Intel UHD 620) ist nur Entwicklungsrechner und kann Ultra-Bildraten nicht belegen.
5. **Sonstiges:** Kamera „Cockpit" zeigt künftig das eigene Cockpit von innen („Motorhaube" bleibt die freie Sicht) · max. 10 Gegner bleiben · alte Pods behalten Größe, Werte und Fahrverhalten · Begriffe in `CONTEXT.md`, Entscheidungen in `docs/adr/`.

### Phasen
| # | Inhalt | Stand |
|---|---|---|
| 0 | Setup + Sicherheitsnetz | ✅ erledigt |
| 1 | Refactoring ohne Spieländerung: Layout-Registry (`podLayouts.ts`), `engineExtent`, `podCockpits.ts`, `applyDamage` + Wirkungs-Struct, Profil v2 | ✅ erledigt |
| 2 | 10 neue Cockpits + Detailpass + Cockpit-Innenansicht → **Stopp: Nutzer sichtet** | ✅ erledigt, Nachbesserung „Cockpits weiter oben" eingearbeitet, vom Nutzer freigegeben („Go Phase 3") |
| 3 | 4 neue Pods (Cyclone → Halo → Manta → Voltspire), Hangar-Liste für 14, Gegner-Auslosung → **Stopp** | ✅ erledigt, vom Nutzer freigegeben („Go Phase 4"), Nachbesserung „Quill geschlossener" eingearbeitet |
| 4 | Tuning-Optik: `PodCustom.kit`, `podKitParts.ts`, Hangar-Reiter „Lack \| Teile" | ✅ erledigt |
| 5 | Schaden – Fahrverhalten: `podDamage.ts`, Bruchteil-Maske, HUD-Lampen | ✅ erledigt |
| 6 | Schaden – Optik Spieler: Bruchteile, Treffermarken, Trümmer, Hangar-Schadensvorschau | ✅ erledigt (fehlende Teile auch schon bei Gegnern) |
| 7 | Schaden – Optik Gegner: `userData`-Ruß/Flammenleistung in den geteilten Materialien | ✅ erledigt |

### Erledigt in Phase 0
1. **Node.js 26.13.1** per winget installiert (war auf dem Rechner nicht vorhanden), `npm ci`. Bereits laufende Shells kennen den neuen PATH nicht → `C:\Program Files\nodejs` voranstellen.
2. **Sichtprüfung unter Windows:** `.claude/launch.json` mit `podracer-dev` (Vite, Port 5173) und `podracer-shots` (`tools/harness/shot-server.mjs`, Port 5174, schreibt Bilder nach `tools/harness/out/`). Der Pod-Harness läuft ohne Bundle über Vite: `tools/harness/pods.dev.html`. WebGPU funktioniert im In-App-Browser.
3. **Harness (`tools/harness/pods.ts`):** `show(idx, hp, quality, { rival, save })`, `sheet('pod' | 'front' | 'rear' | 'side' | 'inside', { rival, quality, health, save })` (ein Feld je Pod, passt sich der Pod-Anzahl an), `stats()` / `statsAll()` (Mesh- und Dreieckszahlen des echten Modells).
4. **`src/game/podAssembly.ts` (neu):** materialfreie Montage eines Pods (Triebwerksbänke, Cockpit, Kabel, Binder, Fern-LOD, Vertex-Farben für Gegner). `podModel.ts` erzeugt daraus nur noch Meshes, Materialien und Animation. Ein nicht zusammenführbarer Bucket wirft jetzt einen Fehler (vorher: stillschweigend weggelassen).
5. **Pod-Audit `tools/ci/pods.ts` (neu, Teil von `npm run check`, 1 s):** baut alle Pods ohne Browser und prüft Mesh-/Dreieckszahlen gegen `tools/ci/pods-baseline.json`, Attribute/NaN/Indexbereich sowie das Sichtmodell gegen Kollisions- und Bodenform.
6. **Doku:** `CONTEXT.md` (Glossar), `docs/adr/0001-bruchteile-follow-health-steps.md`, `docs/adr/0002-ultra-targets-a-gaming-pc.md`.

### Verifiziert (Phase 0)
- `npm run check` vorher/nachher: Sim-Ausgabe **zeilengleich** (56 Zeilen, 13/13 Strecken, 0 Tode); Pod-Audit 10/10.
- Browser (WebGPU): `statsAll()` nach dem Umbau identisch zu den Goldwerten; vier Vorher/Nachher-Bögen (Spieler/Gegner, ganz/Cockpit) **bytegleich**.
- `npm run build` → `dist/index.html` (2,81 MB).

### Erledigt in Phase 1 (Refactoring, kein verändertes Fahrverhalten, kein verändertes Bild)
1. **`src/game/podLayouts.ts` (neu):** ein Eintrag je Pod-ID in `LAYOUTS`; eine unbekannte ID wirft einen Fehler (vorher wurde stillschweigend der Mandrel Ram gebaut). Neue Layout-Felder ersetzen alle fest verdrahteten Pod-IDs: `engineExtras` / `cockpitExtras`, `extraCircles`, `envelope`, `binders: { a, b, zOff }[]`, `cockpit.design`, `cockpit.topY`.
2. **`src/game/podCockpits.ts` (neu):** Cockpit- und Pilotengeometrie (unverändert verschoben). Der Kopf hängt an `PilotDef.head` (`goggles | snout | crest | aero | dome`), nicht mehr am Spezies-Namen.
3. **`engineExtent(spec)` in `podParts.ts`:** eine Quelle für Kollisionsradius, Bodenklemme (unten/außen) und Kabelhöhe; `EngineGeo` kennt `binder` (Ankerpunkt) und `breakParts` (noch leer).
4. **`podDesigns.ts`** enthält nur noch `podCollision` / `podEnvelope` (neu: `axisY`, `cockpit.topY`, `length`). Die Alt-Felder `engine`, `engineLen`, `engineRad`, `spread`, `cable`, `cockpit` in `PodDef` sind entfernt; Positionslichter, Hangar-Kamera und Harness lesen das Layout.
5. **Schaden:** einzige Stelle für Zustandsverlust ist `applyDamage(p, side | 'both', amount, zone)` (Zonen `front | side | top | belly | heat`); Fahrwirkungen verlorener Teile laufen über `PodState.fx` (noch überall 1). `collidePods` liest die Breite direkt aus der gecachten Kollisionsform.
6. **Spielstand:** Schlüssel `podracer-profile-v2` mit einmaligem Import des v1-Stands; `sanitizeCustom` (Farben, Tuning 0–5, Muster, Finish), unbekannte Pod-ID → erster Pod, `MAX_OPPONENTS`.
7. **Tests:** `tools/ci/unit.ts` (17 Prüfungen: Layout-Registry, `applyDamage`, `podParams`, Profil) und `tools/ci/pods-shapes.json` (Kollisionskreise + Bodenform aller Pods als Goldwerte) – beides Teil von `npm run check`.

### Verifiziert (Phase 1)
- `npm run check`: Typecheck, 17/17 Unit-Prüfungen, Pod-Audit 10/10 (Zahlen und Physikformen identisch), **Sim-Ausgabe zeilengleich zur Ausgangslage**.
- Browser (WebGPU): `statsAll()` identisch zu den Goldwerten, vier Bögen **bytegleich** zu den Vorher-Bildern.
- Echte App im In-App-Browser: v1-Spielstand wird importiert (Pod, Farben, Tuning – Wert 9 auf 5 begrenzt), v1 bleibt unangetastet; Hangar ohne Schrumpfen/Scrollen; Rennen Boonta bei Nacht mit 10 Gegnern 28 Rennsekunden per Hand getaktet: 0 Fehler, 0 NaN, Treffer landen auf der richtigen Seite.
- Bekannt: bei verdecktem Browser-Bereich läuft `requestAnimationFrame` nicht – das Rennen bleibt im Countdown, bis man die Schleife von Hand taktet (siehe `CLAUDE.md`).

### Erledigt in Phase 2 (10 Cockpits, Details, Innenansicht)
1. **`podCockpits.ts` neu aufgebaut:** Bausatz (`shell`, `seat`, `pilot`, `levers`, `dash`, `windscreen`, `anchors`, `belly`, `part`) + **ein eigener Entwurf je Pod** (`DESIGNS`; Beschreibung in `DESIGN.md`). Bruchteile sind bereits als eigene Teilesätze angelegt (`part(…)`: Kreisel, Sonde, Finne, Schwingen, Rammbug, Radiatoren, Panzerplatten …), werden aber bis Phase 6 mit dem Cockpit zusammengeführt.
2. **Cockpit-Innenansicht:** Kamera „Cockpit" sitzt im Kopf des Piloten (`PodVisual.setCockpitView`, `eyeWorld`). Technik siehe `docs/adr/0003`: Cockpit wird um den Augpunkt vergrößert (1,4–3,2×), Pilot per Draw-Range ausgeblendet, Near-Plane bleibt 0,8 m. Drei Warnlampen (Boost, Hitze, Schaden) auf jedem Armaturenbrett.
3. **Triebwerks-Detailpass (`podParts.ts`, ab `seg ≥ 24`):** Einspritzring, Verteilerkästen mit Leitung zum Pylon, Leitbleche, Griffbügel, Bremsklappen-Stempel; auf „Ultra" zusätzlich Ableiter und Bolzenringe.
4. **Eigener Anbausatz je Pod (`podLayouts.ts → engineExtras`):** z. B. Flügel-Endkappen (Aurora), Ansaugdorne + Kufenplatte (Splitter-X), Verteilerrohre (Tenroc), Kreuzverstrebung + Blitzdorne (Quadra), Canards + Staurohr (Needle), Fühler + Kufen (Vespa), Kühlschleife + Tank (Fireflare), Panzerschürzen (Ironclad), Schwanzfedern (Starling), Rammringe (Ram). Gegner-Anbauteile schwingen jetzt mit den Triebwerken mit.
5. **Detailstufen:** Gegner unter „Ultra" mit leichtem Cockpit/Piloten; auf „Ultra" 28 statt 18 Segmente und volle Details. Fern-LOD mit Cockpit-Grundform und allen Blitzen.
6. **Piloten:** `PilotDef.skin` + `skinMaterial`, Kragenring, Schulterpolster, Brustgerät.

### Nachbesserung aus der Sichtung: Cockpits weiter oben (Nutzerwunsch 2026-11-21, „positionier die cockpit weiter oben")
1. **Was:** alle 10 Cockpits sitzen 0,6–1,05 m höher. Vorher hing die Gondel auf Höhe der Triebwerksachse (mitten im Abgasstrahl, Triebwerke verdeckten in der Cockpit-Kamera den Horizont). Jetzt gilt für jeden Pod: **Wannenboden nicht unter der Achse der unteren Triebwerke, Augpunkt mindestens 0,25 m über deren Oberkante** (Unit-Prüfung „cockpit height").
2. **Wie (`podLayouts.ts`):** `...raised(y, up)` im Cockpit-Eintrag = sichtbare Höhe `y + up` **und** `keel: up`. `keel` wirkt nur auf die Bodenklemme (`podEnvelope().cockpit.minY` = Wannenboden − `keel`): die Physik rechnet weiter mit der alten Höhe → **Fahrverhalten, `pods-shapes.json` und Sim-Tabelle unverändert** (Entscheidung „alte Pods: nur Optik"). Kabel, Augpunkt, Warnblitz (`topY`), Fern-LOD und Gegner folgen der sichtbaren Höhe von selbst. Neue Pods (Phase 3) lassen `keel` weg.
3. **Anhebung je Pod (m):** Aurora 0,90 · Splitter-X 1,00 · Tenroc 0,80 · Quadra 0,65 · Needle 0,80 · Vespa 0,85 · Fireflare 0,90 · Ironclad 0,60 · Starling 0,80 · Ram 1,05. Mehr oder weniger: nur die zweite Zahl in `raised(…)` ändern (die Unit-Prüfung nennt die Untergrenze).
4. **Harness:** zwei neue Bogen-Ansichten – `sheet('chase')` (Verfolgerkamera des Spiels) und `sheet('profile')` (ganzer Pod exakt von der Seite, je Pod eine flache Zelle).
5. **Gesichtet:** Vorher/Nachher `p2_hoeher_profil.jpg`, `p2_hoeher_innen.jpg`, `p2_hoeher_verfolger.jpg` (alle 10, Spieler; Gegner in `p2c_profile_gegner.jpg`); echtes Rennen Boonta (Fireflare) Verfolger + Cockpit + **90°-Rolle**, Dschungel im **Gewitter** (Aurora) Cockpit + Verfolger, Hangar-Vorschau – alles ohne neue Konsolenfehler.
6. **Erkenntnisse zur Testmethode (verdeckter Browser-Bereich):** (a) die Schleife nie mit einem künstlichen Zeitstempel weit vor der echten Uhr stehen lassen – der nächste echte Frame bekommt sonst ein **negatives `dt`** (`Game.loop` begrenzt nur nach oben; im Browser sind rAF-Zeitstempel monoton, deshalb kein Spielfehler); nach dem Takten `g.lastT = performance.now()` setzen. (b) **nicht pauschal alle `requestAnimationFrame`-Handles abbrechen:** three.js zählt seine Frames in einer eigenen rAF-Schleife (`nodeFrame`); ohne sie bleiben die Kamera-Uniforms stehen und das Bild friert ein. (c) `canvas.toBlob` liefert bei getakteten Frames ein altes Bild – Screenshot-Werkzeug des Browsers benutzen. (d) Den eigenen Pod lenkt die KI: `g.readInput = () => { p.ai = {…}; aiInputs(p, g.td, g.pods, g.raceTime, null); p.ai = null; }` (`aiInputs` per `await import('/src/game/physics.ts')`).

### Verifiziert (Phase 2)
- Nach der Nachbesserung: `npm run check` grün – 23/23 Unit-Prüfungen, Pod-Audit 10/10 (Mesh-/Dreieckszahlen und Physikformen unverändert), **Sim-Tabelle zeilengleich** zum Stand vor der Anhebung; `npm run build` ok (2,84 MB).
- `npm run check`: 21/21 Unit-Prüfungen (u. a. „kein Cockpit doppelt", „Pilot ist eigener Teilesatz", „drei Lampen", „leichtes Cockpit < 4 600 Dreiecke"), Pod-Audit 10/10 inkl. Budgets, **Physikformen unverändert, Sim-Ausgabe zeilengleich zur Ausgangslage** (alte Pods fahren exakt wie vorher).
- Browser (WebGPU): `statsAll()` = Audit-Zahlen; Bögen `tools/harness/out/p2_{front,rear,side,inside,pod,front_gegner}.jpg` gesichtet; echtes Rennen mit Kamera „Cockpit" (Fireflare, Boonta) per Hand getaktet: 0 Fehler, Bild `p2_race_cockpit.jpg`.

### Messwerte nach Phase 2 (Meshes / Dreiecke; in Klammern die Veränderung gegenüber vorher)
| Pod | Spieler „Hoch" | Spieler „Ultra" | Gegner nah (unter Ultra) | Gegner nah (Ultra) | fern |
|---|---|---|---|---|---|
| Aurora XR-7 | 41 / 42 334 (+7 %) | 41 / 57 170 | 30 / 14 612 (−34 %) | 31 / 40 576 | 3 / 444 |
| Vrak Splitter-X | 39 / 41 210 (+3 %) | 39 / 55 462 | 28 / 16 052 (−30 %) | 29 / 39 452 | 3 / 492 |
| Tenroc 6-Fach | 64 / 89 698 (+8 %) | 64 / 119 050 | 29 / 33 016 (−16 %) | 30 / 84 484 | 3 / 884 |
| Quadra Lumber | 51 / 68 276 (+4 %) | 51 / 89 280 | 27 / 25 018 (−21 %) | 29 / 64 790 | 3 / 536 |
| Hollo Needle | 38 / 36 314 (+2 %) | 38 / 50 754 | 27 / 12 944 (−36 %) | 28 / 34 556 | 3 / 456 |
| Tyr Vespa | 40 / 34 454 (−1 %) | 40 / 43 710 | 28 / 12 424 (−36 %) | 30 / 32 696 | 3 / 444 |
| Beerak Fireflare | 39 / 42 914 (+10 %) | 39 / 57 662 | 28 / 14 688 (−30 %) | 29 / 41 156 | 3 / 444 |
| Pagali Ironclad | 51 / 62 022 (+1 %) | 51 / 80 194 | 28 / 23 952 (−23 %) | 29 / 58 536 | 3 / 528 |
| Mak Starling | 39 / 37 670 (+3 %) | 39 / 51 878 | 28 / 12 940 (−38 %) | 29 / 35 912 | 3 / 456 |
| Mandrel Ram | 41 / 39 670 (+5 %) | 41 / 52 638 | 30 / 14 660 (−30 %) | 31 / 37 912 | 3 / 492 |

### Nicht verifiziert (Phase 2)
- **Bildrate auf „Ultra"** (Gegner jetzt 33–84 Tsd. Dreiecke je nahem Pod) – bitte am Gaming-PC prüfen.
- Innenansicht **in Tunneln** nicht gesichtet (Regen/Gewitter und 90°-Rolle inzwischen gesichtet, siehe Nachbesserung; Regenstreifen und Linsentropfen liegen sichtbar über dem Bild, das Armaturenbrett bleibt lesbar).
- Innenansicht aller 10 Pods nur im Harness (Standbild), im Rennen nur Fireflare und Aurora.
- Ob die **Höhe der Cockpits** dem Nutzer so passt (Geschmack) – er entscheidet anhand der Vorher/Nachher-Bilder.

### Erledigt in Phase 3 (vier neue Pods)
1. **Neue Triebwerks-Bauer in `src/game/podEngines.ts`** (eigene Datei, der runde Turbinen-Bauer in `podParts.ts` blieb unangetastet → die zehn alten Pods können sich nicht verschieben). Vier Stile mit demselben `EngineGeo`-Vertrag, eingehängt über `OWN_ENGINES` / `OWN_EXTENTS`:
   - `rotor` (Tarn Cyclone): kurzer dicker Rumpf, offener 5-Blatt-Rotor (eigenes drehendes Mesh, `fanMat: 'steel'`, `fanSpin: 0.36`, `openRotor`), Schutzring mit Profilquerschnitt auf vier Streben, Auspuffstutzen.
   - `hoop` (Lyss Halo-9): schlanker Kern mit Einlass + Fan, Ringflügel (Radius 3,4 × Kernradius) mit Lichtbändern auf drei Streben, Luftbremsen und Blitz-Koppler sitzen am Ring.
   - `slab` (Dorn Manta): geloftete flache Platte, Briefschlitz-Einlass mit kleiner Stauturbine, Schlitzdüse mit eigenen Lippenklappen (`slotPetals`) und flach skalierter Flamme, Doppelleitwerk – die Ruder sind die Luftbremsen.
   - `cage` (Quill Voltspire): Gitterkäfig (5 Spanten, 6 Längsholme, Diagonalen), Plasmaspule mit Kupferwicklungen und Trommeln, drehender Kupferanker (`fanMat: 'copper'`), drei Elektroden je Flanke.
2. **`EngineGeo` erweitert:** `fanMat`, `fanSpin`, `openRotor`. Gegner zeigen offene Rotoren als eigenes drehendes Mesh (`RivalBank.rotors`, geteiltes Material – keine neue Pipeline); geschlossene Fans bleiben in den statischen Teilen.
3. **Energieblitze je Triebwerkspaar zusammengefasst** (`binderGroups` / `mergeBinders` in `podAssembly.ts`): die drei Bögen der Voltspire sind ein Mesh (Spieler und Gegner), das X der Quadra Lumber bleibt zwei Meshes (verschiedene Paare) – deren Zahlen sind unverändert.
4. **Layouts, Cockpits, Piloten:** vier Einträge in `LAYOUTS` (ohne `keel`: ehrliche Bodenklemme), vier Entwürfe in `DESIGNS` (`cyclone`, `halo`, `manta`, `volt`), vier Kopfvarianten (`maul`, `veil`, `horn`, `optic`), vier Piloten und Pods in `data.ts`. Namen und Entwürfe sind eigene (keine Film- oder Spielvorlagen).
5. **Fern-LOD:** Sonderformen je Stil (Ring um `rotor` / `hoop`, flache Kiste für `slab`), neue Cockpit-Marke `far: 'ring'`.
6. **Wer fährt:** `src/game/roster.ts → pickRivals` lost die Gegner für jedes Rennen neu aus den 13 anderen Pods (höchstens 10, nie doppelt). `tools/ci/roster.ts → ciRoster`: das CI-Feld (11 Pods) wandert je Strecke um drei Pods weiter; `ROSTER_OLD=1` fährt das alte Feld.
7. **Hangar:** Pod-Liste einzeilig (Pod-Name links, Vorname des Piloten rechts) – 14 Zeilen passen ohne Verkleinerung.
8. **Nebenbei behoben:** Stachel der Tyr Vespa war von innen nach außen gewickelt (Drehprofil lief Richtung −z); Harness-Bögen können das Fern-Modell zeigen (`far: true`).

### Nachbesserung aus der Sichtung (Phase 3): Quill Voltspire geschlossener und komplexer (Nutzer 2026-11-21: „zu offen (Gitterstruktur), etwas komplexer")
1. **Triebwerk (`cageEngine` in `podEngines.ts`, neu aufgebaut):** vorn und hinten geschlossene Verkleidungen (Triebwerks-Lackierung), dazwischen nur noch ein Fenster (33–67 % der Länge) auf die Plasmaspule: vier Kastenholme (Sekundärfarbe), drei Spanten, Längsholme, gekreuzte Diagonalen; darin dreht ein Käfigläufer (`fan`, Kupfer) um die Wicklungen. Dazu Kühlrippenring, vier Kondensatorkästen, Kabelstränge, Ansaugkanal, Rücken- und Bauchabdeckung. Größe, Elektroden und Blitz-Anker unverändert → Physikform und Sim unverändert.
2. **Cockpit (`volt` in `podCockpits.ts`):** unten geschlossene Schale, darüber Glaskugel im Reifenkäfig, Rücken beplankt und gerippt, Gerätepaket hinter dem Sitz. Die beiden vorderen Reifen bleiben links und rechts der Blickmitte.
3. **Prüfung:** neue Unit-Prüfung „Voltspire: … Außenhaut deckt mindestens 65 % der Tonne" (vorher 49 %). Neue Zahlen: Spieler 39 / 44 090 („Hoch"), 39 / 58 782 („Ultra"), Gegner nah 25 / 18 944 bzw. 29 / 42 332. Bilder `tools/harness/out/p3b_volt*.jpg`.

### Verifiziert (Phase 3)
- `npm run check` grün: 34/34 Unit-Prüfungen (neu u. a. „vier neue Racer mit eigenem Piloten", „Grenzen 1,9 m / 4,6 m / 1,85 m", „keine `keel`", „Cyclone-Rotoren drehen bei Gegnern", „drei Bögen = ein Mesh, 2,5 m hinter der Front", „Quadra behält ihr X", „Gegner-Auslosung", „CI-Feld"), Pod-Audit 14/14, Sim 13/13 (0 Ausfälle, kein NaN, Bodenfreiheit ≥ 0,67 m).
- **`ROSTER_OLD=1`: Sim-Tabelle zeilengleich zu Phase 2** → die zehn alten Pods fahren exakt wie vorher. Mesh-/Dreieckszahlen und Physikformen der zehn alten Pods unverändert (nur vier Zeilen dazu).
- Langlauf `SECS=120` mit dem neuen Feld: alle 13 Strecken „ok".
- Browser (WebGPU): `show()` aller vier Pods (Spieler + Gegner), Bögen `inside`, `profile`, `chase`, `front`, `pod` (Spieler, Gegner, Fern-Modell) für alle 14; Hangar bei 1280 × 720: 14 Zeilen à 28 px, `data-fit-shrunk = 0`, kein Scrollbalken; zwei echte Rennen per Hand getaktet – Boonta mit dem Cyclone (Gegner u. a. Voltspire), Aquilaris im Regen mit der Voltspire (Gegner u. a. Manta, Halo, Cyclone), jeweils Verfolger + Cockpit-Kamera, keine neuen Konsolenfehler.

### Messwerte Phase 3 (Meshes / Dreiecke)
| Pod | Spieler „Niedrig" | Spieler „Hoch" | Spieler „Ultra" | Gegner nah (unter Ultra) | Gegner nah (Ultra) | fern |
|---|---|---|---|---|---|---|
| Tarn Cyclone | 41 / 22 854 | 41 / 35 174 | 41 / 46 578 | 32 / 12 032 | 33 / 33 416 | 3 / 648 |
| Lyss Halo-9 | 39 / 23 462 | 39 / 32 538 | 39 / 45 062 | 28 / 12 724 | 29 / 30 780 | 3 / 732 |
| Dorn Manta | 38 / 16 254 | 38 / 21 554 | 38 / 27 042 | 27 / 8 140 | 28 / 19 796 | 3 / 748 |
| Quill Voltspire | 36 / 26 748 | 36 / 37 232 | 36 / 50 192 | 24 / 16 334 | 26 / 35 474 | 3 / 508 |

Budgets für neue Pods: Spieler „Hoch" ≤ 70 Tsd., Gegner nah ≤ 26 Tsd., Ultra ≤ 250 Tsd. / 100 Tsd., fern ≤ 1,1 Tsd. – alle weit darunter.

### Nicht verifiziert (Phase 3)
- **Bildrate auf „Ultra"** mit den neuen Pods – am Gaming-PC prüfen.
- Balance der vier neuen Pods (Werte in `data.ts`) nur über die KI-Sim, nicht von Hand gefahren.
- Cockpit-Kamera der Manta und des Halo nur im Harness (Standbild), im Rennen Cyclone und Voltspire.
- Der im Plan genannte „Schatten-Stellvertreter" für dünne Teile wurde nicht gebaut (es gab ihn auch in Phase 2 nicht): dünne Teile werfen Schatten wie bisher nach Material. Bei flimmernden Käfig-Schatten nachziehen.
- Langlauf `SECS=120` einzeln mit dem **alten** Feld: Malastare und Crystal melden je einen „downward teleport" nach dem Zieleinlauf – betrifft nur alte Pods und unveränderte Physik, also schon vor Phase 3 vorhanden; im Standardlauf (45 s) tritt es nicht auf.

### Erledigt in Phase 4 (Tuning-Optik)
1. **Zwei Arten sichtbarer Teile** (`src/game/podKitParts.ts`, neu – nur Geometrie, läuft auch im Node-Audit):
   - **Tuning-Teile** folgen den 7 Tuning-Werten in drei Stufen (`tuneTiers`): Stufe 0–1 nichts, 2–3 das kleine Teil, 4–5 das große.
   - **Style-Teile** sind frei wählbar in vier Steckplätzen (`PodCustom.kit`, 0 = Werk): Finnen, Einlass, Düse, Kanzel.
2. **Anbau über Ankerpunkte:** jeder Triebwerks-Bauer liefert `EngineGeo.hard` (`HardPoints`: Düse, Einlass, Dorn, Rumpf, Rücken, Heck, `sideMax` / `bottomMax`). Die Teile werden nur angesetzt, nie ausgetauscht – Werk-Geometrie, Goldwerte und Physikformen bleiben unverändert. Die flache Manta hat eigene Varianten (`slot`).
3. **Tuning-Teile:** Höchstgeschw. = Düsenkragen → Nachbrennerring mit Kühlrippen + Glühring · Beschleunigung = 4 Stauhutzen → + 2 Kompressorhutzen mit Kupferleitung · Kühlung = Kühlrippenring → + Radiatorplatten mit Kühlmittelleitung · Wendigkeit = 2 Canards → + 4 Steuerflächen mit Stellstangen · Traktion = langer Bauch-Repulsor mit Kufen → + Ausleger-Pads · Luftbremse = Klappen +25 % → + zweites, weiter öffnendes Klappenblatt (`FlapGeo.gain`) · Reparatur = Panzer-Doppler → + Reparatureinheit am Kabelpylon.
4. **Style-Teile:** Finnen = Haifinne · Doppel-Leitwerk · Pfeilflügel; Einlass = Gitter · Langer Dorn · Irisblende (acht verdrehte Metall-Lamellen); Düse = Lang · Schubvektor-Paddel · Zackenkrone; Kanzel = klar · Rauch · Bernstein · Spiegel (`canopyGlass(tint)` in `podMaterials.ts`: vier geteilte Glasmaterialien).
5. **Durchleitung:** `buildPodModel(…, opts: PodLook)` mit `kit` + `tune`; `assembleHero` / `assembleRival(…, kit)`. Spieler: Style-Teile + Tuning-Teile aus dem Profil. **Gegner: nur Style-Teile**, je Startplatz fest ausgelost (`rivalKit(seed)` in `roster.ts`) – reine Optik.
6. **Hangar:** Tafel „Lackierung & Design" mit den Reitern **Lack | Teile** (keine zusätzliche Höhe); „Teile" zeigt die vier Steckplätze + „Alles Werk". Die Vorschau baut sich bei jedem Klick und jeder Tuning-Stufe neu (`PodPreview` bekommt `kit` + `tune`).
7. **Spielstand:** `PodCustom.kit` wird in `sanitizeCustom` auf 0–3 begrenzt; ein Stand ohne `kit` = Werk.

### Verifiziert (Phase 4)
- `npm run check` grün: 41/41 Unit-Prüfungen (neu: Stufen 0–1 / 2–3 / 4–5, „Werk fügt nichts hinzu", jede Style-Wahl und jede Tuning-Stufe auf jedem Triebwerksstil, Gegner-Auslosung der Style-Teile, Profil-Begrenzung), Pod-Audit 14/14 **ohne neue Goldwerte** (Werk-Zahlen und Physikformen unverändert), Sim 13/13.
- **Sim-Tabelle zeilengleich** zu Phase 3 (neues Feld) und mit `ROSTER_OLD=1` zu Phase 2 → die Teile ändern nichts am Fahren.
- Audit der Varianten (drei Sätze je Pod: Style-Wahl 1 / 2 / 3 in allen Steckplätzen, Tuning-Stufe 1 bzw. 2): größte Überbreite über die Kollisionsform weiter 0,50 m (Tyr Vespa), einzelne Pods werden mit Teilen bis 0,18 m breiter (Fireflare 0,10 → 0,28 m; Grenze 0,55 m); nichts hängt mehr als 0,02 m unter der Bodenklemme (wie ohne Teile); Gegner mit Style-Teilen bleiben unter den Session-19-Zahlen.
- Browser (WebGPU): Bilder `tools/harness/out/p4_*.jpg` (Aurora mit allen drei Sätzen, Manta, Cyclone, Halo) gesichtet; Hangar bei 1280 × 720, 1920 × 1080, 1024 × 600, 800 × 1000, 2560 × 1440: `data-fit-shrunk = 0`, kein Scrollbalken, Vorschau ändert sich bei Klick auf Style-Teile und „Alles Max"; echtes Rennen Boonta mit der Voltspire (Pfeilflügel, Irisblende, lange Düse, Bernstein-Kanzel, Tuning 5) und 10 Gegnern 21 Rennsekunden per Hand getaktet: keine Konsolenfehler.
- `npm run build` → `dist/index.html` (2,89 MB).

### Messwerte Phase 4 (Dreiecke Spieler „Ultra"; „mit Teilen" = größter der drei geprüften Sätze)
| Pod | Werk | mit Teilen | Gegner nah mit Style-Teilen (unter Ultra) |
|---|---|---|---|
| Aurora XR-7 | 57 170 | 68 626 | 16 596 |
| Vrak Splitter-X | 55 462 | 66 918 | 18 036 |
| Tenroc 6-Fach | 119 050 | 153 418 | 38 968 |
| Quadra Lumber | 89 280 | 110 656 | 28 986 |
| Hollo Needle | 50 754 | 61 442 | 14 928 |
| Tyr Vespa | 43 710 | 55 166 | 14 408 |
| Beerak Fireflare | 57 662 | 69 118 | 16 672 |
| Pagali Ironclad | 80 194 | 103 106 | 27 920 |
| Mak Starling | 51 878 | 62 566 | 14 924 |
| Mandrel Ram | 52 638 | 64 094 | 16 644 |
| Tarn Cyclone | 46 578 | 58 034 | 14 016 |
| Lyss Halo-9 | 45 062 | 55 750 | 14 708 |
| Dorn Manta | 27 042 | 34 874 | 8 980 |
| Quill Voltspire | 58 782 | 70 238 | 20 928 |

Ultra-Grenze 250 Tsd. – der größte Pod (Tenroc, sechs Triebwerke) liegt bei 153 Tsd. Die Teile kommen in die vorhandenen Material-Töpfe; zusätzliche Meshes entstehen nur für das zweite Bremsklappenblatt (Luftbremse Stufe 2): +4 bei zwei Triebwerken, +8 bei vier, +12 beim Tenroc (76 statt 64, Grenze 110). Das Audit druckt die Zahlen je Pod in den Zeilen „kit: …".

### Nicht verifiziert (Phase 4)
- **Bildrate auf „Ultra"** mit vollem Teilesatz – am Gaming-PC prüfen.
- Nicht jede Kombination einzeln angesehen: gesichtet sind sechs Bilder (drei Sätze an der Aurora, je einer an Manta, Cyclone, Halo) und die Voltspire in Hangar und Rennen; die übrigen deckt nur das Audit ab (Maße, Dreiecke) – und das Audit prüft drei Sätze je Pod, nicht alle 4 × 4 × 4 Style-Kombinationen mal Tuning-Stufen.
- Von den vier Kanzel-Tönungen im Rennen nur „Bernstein" gesehen.

### Erledigt in Phase 5 (Schadensmodelle – Fahrverhalten)
1. **`src/game/podDamage.ts` (neu, ohne three – läuft im Node-CI):** ein **Schadensmodell je Racer** (`MODELS`, unbekannte Pod-ID wirft einen Fehler) aus
   - **Panzerzonen** `front | side | top | belly | heat`: Faktor auf den Schaden aus dieser Richtung (< 1 gepanzert, > 1 weich; im Mittel etwa 1),
   - **Bruchteilen**: je Schadensanzeige genau drei (Stufen 50 / 35 / 20 % Triebwerkszustand), paarig links/rechts oder als Mittelteil (bricht, sobald eine der beiden Seiten die Stufe unterschreitet). Jedes Bruchteil kostet 5–10 % eines Fahrwerts (`fx`) oder war ein **Schutz** (`guard`), der Treffer aus einer Zone abgefangen hat, solange er dran war.
2. **Regeln (`physics.ts`):** `applyDamage` gewichtet jeden Treffer mit `zoneFactor` (Panzerung × noch vorhandene Schutzteile dieser Seite) und bricht danach fällige Bruchteile ab (`PodState.parts` = Bitmaske, Ereignis `part`). Wirkungen multiplizieren sich, **höchstens −15 % je Fahrwert** (`FX_CAP`), **Gegner spüren die Hälfte**. Reparatur heilt nur den Zustand; **Teile kommen erst beim Respawn zurück** (`respawn` setzt Maske und `fx` zurück). Explosionsregel unverändert (eine Seite ≤ 0 %); ein explodierender Pod meldet keine Einzelteile.
3. **HUD:** die drei Zellen je Schadensanzeige sind jetzt Bruchteil-Lampen (oben 50 %, Mitte 35 %, unten 20 %; verloren = rot mit Kreuz, `data-lamp`). Seitentausch wie bisher nur in `Game.hud()` (`partsL` / `partsR`). Je Verlust eine Meldung („FLÜGELPLATTE ABGERISSEN!", „OBERES TRIEBWERK AUSGEFALLEN!" …), ein harter Schlag + Warnton, Funken.
4. **Kamera:** das Sichtfeld folgt der unbeschädigten Höchstgeschwindigkeit (`podParams().vmax0`) – verlorene Teile weiten das Bild nicht.
5. **CI:** je Strecke eine Zeile `parts lost: n (…)`; Schalter `ARMOR=0` (Panzerzonen aus) und `PARTS=0` (Bruchteile aus). Die Meldung „downward teleports" zählt einen Respawn (z. B. die KI-Selbstbefreiung) nicht mehr mit; `DEBUG=1` druckt zu jedem Teleport Ort und Tunnelzustand.

| Racer | weich / hart | Bruchteile (50 % · 35 % · 20 %) |
|---|---|---|
| Aurora XR-7 | Flanken weich | Flügelplatte (Haftung) · Kreisel-Stabilisator (Wendigkeit) · Innenflügel (Haftung) |
| Hollo Needle | Nase weich | Nasensonde (Wendigkeit) · Canards (Haftung) · Heckfinne (Wendigkeit) |
| Tyr Vespa | Flanken weich | Klingenflügel (Haftung) · Fühler (Wendigkeit) · Stachel (Haftung) |
| Mak Starling | Flanken + Oberseite weich | Schwinge (Haftung) · Bremsfeder (Luftbremse) · Rückenfinne (Wendigkeit) |
| Lyss Halo-9 | Flanken weich, Nase hart | Ringflügel-Segment (Wendigkeit) · Kuppelbogen (Wendigkeit) · Ringflügel-Segment (Haftung) |
| Vrak Splitter-X | Nase hart, Oberseite + Hitze weich | Kühllamellen (Kühlung) · Ansaugklappen (Beschleunigung) · Haifinne / Stummelfinne (Wendigkeit) |
| Beerak Fireflare | hitzefest | Radiator (Kühlung, mehr Hitze) · Kühlschleife (Kühlung, mehr Hitze) · Radiatorflügel (Haftung) |
| Mandrel Ram | Front erst durch Schutzteile sehr hart, danach weich | Rammring (Schutz Front) · Rammbug (Schutz Front) · Kufenplatte (Schutz Bauch) |
| Dorn Manta | Bauch weich | Flügelspitze (Haftung) · Seitenleitwerk (Wendigkeit) · Deltafläche (Haftung) |
| Tarn Cyclone | Front weich (offene Rotoren) | Rotorblatt (Tempo, Beschleunigung) · Ringfinne (Wendigkeit) · Leitwerksträger (Haftung) |
| Tenroc 6-Fach | dünne Haut überall | Oberes Triebwerk fällt aus · Äußeres Triebwerk fällt aus (je Tempo, Beschleunigung) · Verteilerrohr (Beschleunigung) |
| Quadra Lumber | Front weich, Oberseite hart | Ringschürze (Wendigkeit) · Energieblitz erlischt (Beschleunigung) · Ausleger (Haftung) |
| Pagali Ironclad | Flanken erst gepanzert, danach weich | Panzerschürze (Schutz Flanke) · Panzerplatte (Schutz Flanke + Front) · Oberes Triebwerk fällt aus |
| Quill Voltspire | schwache Hülle, Hitze prallt ab | Energiebogen erlischt · zweiter Energiebogen erlischt (je Beschleunigung) · Entladungsmast (Kühlung) |

### Verifiziert (Phase 5)
- `npm run check` grün: 57/57 Unit-Prüfungen (16 neue: jedes Modell eigenständig, Zonen-Mittel 0,9–1,1, genau ein Bruchteil je Stufe und Anzeige, Wirkung 5–10 %, Deckel 15 %, Gegner halb, Bruch genau einmal mit Ereignis, Mittelteile, Reparatur bringt nichts zurück / Respawn alles, Rammbug, seitengetrennter Schutz, Explosion ohne Einzelteile, Schalter, HUD-Lampen, `vmax0`), Pod-Audit 14/14 unverändert, Sim 13/13 mit **0 Ausfällen auf allen Strecken** (wie vorher).
- **`ARMOR=0 PARTS=0`: Sim-Tabelle zeilengleich zu Phase 4** → die Umstellung selbst ändert nichts; alle Unterschiede kommen aus den Modellen.
- Mit Schadensmodellen: 5–29 verlorene Bruchteile je Strecke (11 Pods, 45 s); Durchschnittstempo je Strecke −4 … +3 m/s gegenüber vorher, langsamster Pod auf Crystal 83 statt 96 m/s (Grenze 18).
- `GRIP=0.88` (Sturm): 13/13 „ok", höchstens 1 Ausfall je Strecke.
- Echte App (WebGPU, Boonta, Aurora): 55 Schaden links → Meldung „KREISEL-STABILISATOR AUSGEFALLEN!", Lampen der richtigen Anzeige rot (Seitentausch stimmt), 85 Schaden rechts → drei Lampen rot; keine neuen Konsolenfehler.
- `npm run build` → `dist/index.html` (2,89 MB).

### Nicht verifiziert / aufgefallen (Phase 5)
- **Balance von Hand nicht gefahren** – nur KI-Sim. Ob 5–10 % je Teil spürbar genug oder zu viel sind, muss der Nutzer fahren.
- **Langlauf `SECS=120` mit Schadensmodellen: Malastare meldet 1 echten „downward teleport"** (Gegner-Pod Splitter-X, t = 14,7 s, Sample 964, Standard-Tunnel: der Pod gilt als „im Tunnel" (`upper = false`, `inRoof = true`), ist aber 23 m über der Straße und wird unter die Decke gesetzt). Das ist Tunnel-Logik aus Session 17, kein Pod-Thema; im Standardlauf (45 s) und im Langlauf ohne Schadensmodelle tritt es nicht auf – andere Flugbahnen. Nachstellen: `DEBUG=1 SECS=120 node tools/ci/out/sim.mjs` (ganzer Lauf nötig, wegen des Zufallsstroms). *Nachtrag nach dem Merge:* die Tunneldecke setzt nicht mehr um, sie drückt höchstens 45 m/s herunter – derselbe Fall an Sample 964 ist im Abschnitt „Tunneldecke je Pod" beschrieben.
- Die Lampen stehen in gleichen Abständen, nicht auf Höhe der Stufen 50 / 35 / 20 % der Füllung.
- Verlorene Teile sind am Pod **noch nicht zu sehen** (Phase 6) – bisher nur Lampe, Meldung, Ton, Funken und Fahrwirkung.

### Erledigt in Phase 6 (Schaden – Optik)
1. **Bruchteile verschwinden ohne zusätzliche Meshes.** Jedes Bruchteil ist dort markiert, wo es gebaut wird: `pb.brk(id, …)` (neue Methode des `PartBuilder`) in den Triebwerks-Bauern und in `engineExtras`, `part(k, id, …)` in den Cockpits. Die Montage (`podAssembly.ts`) führt die Teile wie bisher in die Material-Töpfe zusammen und merkt sich je Bruchteil die Index-Bereiche (`BreakShow.ranges`). Geht ein Teil verloren, schreibt `podModel.ts` (`Hider`) den Index-Puffer des betroffenen Meshes neu – ohne das Teil (`visibleIndices`). **Zeichenaufrufe und Pipelines bleiben gleich**; derselbe Weg blendet jetzt auch den Piloten für die Cockpit-Kamera aus.
2. **Was ein Bruchteil außer Geometrie sein kann** (`PodLayout.flameOut / fanLoss / arcLoss`): ein Triebwerk fällt aus (Flamme weg, Fan steht, Düsen- und Lichtbänder dunkel, es zieht nur noch Rauch) · ein Rotor verliert ein Blatt (`EngineGeo.fanLost`) · ein Energieblitz erlischt (Bereich im Blitz-Mesh).
3. **`PodVisual`:** `setParts(mask)` (jede Frame aus `PodState.parts`, kostet nichts, solange sich nichts ändert), `engineOut[]`, `partWorld(i, out)`, Spieler zusätzlich `hitMark(x, y, z, stärke)` und `clearMarks()`.
4. **Treffermarken (nur Spieler-Pod, `hullMaterial`):** je Rumpf-Material (links, rechts, Cockpit) vier `uniform(vec4)` als Ringpuffer – Brandfleck mit ausgefranstem Rand, blankes Metall in der Mitte, dunkle Kerbe im Zentrum. Entfernung im Mesh-Raum, also bleibt die Marke am Blech. Keine echten Dellen (Entscheidung). Beim Respawn weg.
5. **Trümmer:** zweiter `DebrisPool('plate')` (`Game.scrap`): Blechplatten in der Zweitfarbe des Pods, wo ein Bruchteil abreißt; bei einer Explosion 16 Platten in Erst- und Zweitfarbe. Beide Pools werden beim Aufwärmen einmal leer gezeigt (Pipeline wird vor dem Start übersetzt).
6. **Hangar:** „Schadens-Vorschau" in der Pod-Vorschau unten links – Regler 100 → 0 % und die drei Stufen des Racers im Klartext (z. B. „50 % Flügelplatte · 35 % Kreisel-Stabilisator · 20 % Innenflügel"); die Vorschau lässt die Teile ohne Neuaufbau fallen.
7. **Lyss Halo-9:** der Ringflügel ist jetzt aus Bögen gebaut (oben, unten, zwei Flanken + je Flanke ein oberer und ein unterer Bogen als Bruchteil), mit Lichtbändern, Nieten und Trimmklappen je Bogen und dunklen Endplatten an den Bruchstellen. Nur seine Goldwerte haben sich geändert (+32 … +520 Dreiecke je Bau).
8. **Harness:** `show(idx, health, q, { both, parts, heat, marks })` und `sheet(view, { health })` lassen Bruchteile unter ihrer Stufe weg; `marks: [[x, y, z, stärke], …]` setzt Treffermarken (Pod-Koordinaten).

### Verifiziert (Phase 6)
- `npm run check` grün: 64/64 Unit-Prüfungen (7 neue: Index-Ausblendung, „jedes Bruchteil jedes Racers zeigt etwas" für Spieler (3 Detailstufen) und Gegner (leicht + Ultra), Bereiche überlappen nicht / linke Teile liegen links / Pilot zuletzt, Ausfälle und Blitze zeigen auf echte Triebwerke der richtigen Seite, ausgefallenes Triebwerk wird dunkel, Teil ≥ 0,4 m und < 45 % der Dreiecke), Pod-Audit 14/14 (13 Pods **unverändert** in Mesh- und Dreieckszahl, nur Halo neu), **Sim-Tabelle zeilengleich zu Phase 5** (reine Optik).
- Gegenprobe der Hauptprüfung: ein falsch benannter Bruchteil-Tag (`kanard`) lässt 5 Prüfungen scheitern.
- Browser (WebGPU): Bögen aller 14 Pods bei 100 / 45 / 30 / 15 % (`tools/harness/out/p6_pods_*.jpg`), Nahaufnahmen Aurora, Halo, Cyclone, Splitter-X (15 %), Voltspire, Tenroc (30 %), Gegner-Bogen bei 15 % (`p6_gegner_15.jpg`), Treffermarken (`p6_aurora_marks.jpg`).
- Echte App: Hangar-Regler bei 1280 × 720 ohne Schrumpfen / Scrollen, Vorschau verliert die Teile; Rennen Boonta mit dem Tenroc: 70 Schaden → vier von sechs Triebwerken aus (`engineOut`), Lampen und Meldung passen, alle 10 Gegner mit verlorenen Teilen, Explosion wirft grüne und sandfarbene Platten, nach dem Respawn sind alle Teile zurück; keine neuen Konsolenfehler.
- `npm run build` → `dist/index.html` (2,91 MB).

### Nicht verifiziert / nicht gebaut (Phase 6)
- **Dampf- und Ölstrahlen je Modell** (Plan, in der Streichliste an zweiter Stelle) sind nicht gebaut: ein ausgefallenes Triebwerk zieht Rauch, der Radiator der Fireflare verschwindet ohne Dampf.
- Treffermarken ohne geneigte Normale (Plan: „normal tilt") – die Kerbe ist gemalt (dunkles Zentrum, blanker Ring).
- **Kollisionsform bleibt:** ein abgerissener Flügel fehlt nur im Bild; die Physik rechnet weiter mit der vollen Breite (Entscheidung „alte Pods: Größe bleibt", gilt hier für alle).
- Im Rennen von Hand gesehen: Aurora und Tenroc als Spieler; die übrigen zwölf nur im Harness.
- WebGL2-Rückfall mit den neuen Shader-Teilen (Treffermarken) noch nicht gelaufen – folgt in Phase 7.
- Aufgefallen, nicht geändert: flache Bleche in Zweitfarbe (Flügel, Finnen, viele neue Teile) glühen bei hoher Triebwerkshitze wie die Düse (`aLiv.y = 0`) – das war schon vor Session 20 so, fällt mit mehr Blechen aber stärker auf.

### Erledigt in Phase 7 (Schaden – Optik der Gegner)
1. **Ruß je Mesh im geteilten Gegner-Rumpfmaterial** (`sharedOpponentHullMaterial`): der Wert kommt aus `mesh.userData.scorch` (TSL `userData`), gesetzt aus dem Zustand der jeweiligen Triebwerksseite (Cockpit: die schwächere Seite). **Eine Pipeline für alle Gegner wie bisher.**
2. **Sterbende Flammen** (`sharedOpponentFlameMaterial`): `mesh.userData.power` – unter 35 % Zustand schwächer, unter 15 % stotternd; je Triebwerksseite ein Flammen-Mesh. Ausgefallene Einzeltriebwerke (Tenroc, Ironclad) verlieren ihren Strahl über denselben Index-Schnitt wie die Bruchteile.
3. **Fehlende Teile** hatten die Gegner schon seit Phase 6 (gleicher Weg wie beim Spieler, ohne zusätzliche Meshes) – auf jeder Detailstufe alle Bruchteile, nicht nur zwei wie im Plan vorgesehen.
4. **Funken und Blech** beim Abriss eines Gegner-Bruchteils nur näher als 120 m.
5. `PodVisual.update` der Gegner liest jetzt `dmgL` / `dmgR` (Zustand 0…1) wie der Spieler-Pod.

### Verifiziert (Phase 7)
- **Pipeline-Zählung am Start (WebGPU, Boonta, 11 Pods, „Hoch"):** vor Phase 7 `renderer._pipelines.caches.size` = 100, `info.memory.programs` = 166 (69 Vertex / 97 Fragment) – **nach Phase 7 dieselben Zahlen**, und sie bleiben gleich, nachdem alle 11 Pods auf unter 40 % beschädigt wurden und Teile verloren haben (im Rennen wird nichts nachkompiliert).
- **WebGL2-Lauf der echten App** (`gfx.backend = 'webgl'`, Boonta, Aurora): Rennen läuft mit 31 Bilder/s auf dem Entwicklungs-Notebook, Treffermarken gesetzt, alle 11 Pods beschädigt und mit verlorenen Teilen – **0 Fehler, 0 Warnungen** in der Konsole.
- `npm run check` grün (64/64 Unit-Prüfungen, Audit 14/14, Sim 13/13, Tabelle zeilengleich zu Phase 5 und 6); `GRIP=0.88`: 13/13 „ok".
- Harness: Gegner Splitter-X bei 100 % und 12 % (`tools/harness/out/p7_splitter_gegner_*.jpg`), Gegner-Bogen bei 30 % (`p7_gegner_30.jpg`).
- **Neue Testmethode bei verdecktem Browser-Bereich:** der Seite direkt nach dem Laden einen zeitgesteuerten Ersatz für `requestAnimationFrame` geben (siehe `CLAUDE.md`). Dann laufen Spiel, three.js-Bildzähler und die Shader-Übersetzung des WebGL2-Rückfalls von selbst in Echtzeit – ohne das Takten von Hand. (Ohne den Ersatz bleibt die WebGL2-App im Ladebildschirm hängen: three.js fragt den Übersetzungsstand per `requestAnimationFrame` ab.)

### Nicht verifiziert (Phase 7)
- **Bildrate auf „Ultra"** – weiterhin nur am Gaming-PC zu klären.
- Der beschädigte Gegner „direkt neben dem Spieler" ist im Rennen nur in zwei Standbildern gesehen (Schwenk und Überholen nicht), dazu die Harness-Bilder.
- Treffermarken tragen nur der Spieler-Pod (Gegner: Ruß je Seite, keine einzelnen Marken).

### Abschluss-Durchsicht (unabhängiger Prüfer über den ganzen Branch, `d7b9c4b..0e624dc`)
Urteil des Prüfers: **bereit zum Zusammenführen, mit Korrekturen** – kein kritischer Fund. Der riskante Kern (verlorene Teile aus den Index-Puffern schneiden) hielt: 4542 Bruchteil-Bereiche über 14 Pods × 6 Teile-Sätze × alle Detailstufen ohne Fehler.

**Fünf Korrekturen (jede zuerst als fehlschlagende Prüfung gesehen):**
1. **Treffermarken saßen in der Verfolgerkamera zu weit vorn.** `Game.updateVisuals` wertet die Ereignisse eines Schritts aus, bevor das Modell seine neue Lage bekommt – `body.worldToLocal` rechnete mit der Lage des Bilds davor (bei 100 m/s und 60 Bildern/s 1,7 m, bei Boost mehr). Jetzt rechnen `worldToBody` / `bodyToWorld` (`physics.ts`) aus der Lage des aktuellen Physik-Schritts; `PodVisual.hitMark` und das neue `partBody` (vorher `partWorld`) arbeiten im Rumpf-Raum. Gilt genauso für den Startpunkt der Trümmer eines verlorenen Bruchteils.
2. **Treffermarken schlugen auf die Luftbremsklappen durch.** Eine Klappe hatte ihren eigenen Ursprung (das Scharnier), die Marken werden aber im Raum der Triebwerksbank gemessen – ein Treffer färbte Klappen an ganz anderer Stelle (Tenroc, Quadra, Needle, Ironclad, Halo, Manta). Jetzt liefert die Montage die Klappen des Spieler-Pods im Bank-Raum (`HeroFlap`), das Modell hängt sie an eine Scharnier-Gruppe. Kein Eingriff in den Shader.
3. **Lichter von Tuning- und Style-Teilen brannten an ausgefallenen Triebwerken weiter** (Nachbrenner-Ring ab Höchstgeschwindigkeit 4, lange Düse, Repulsor-Leiste – Tenroc und Ironclad, Spieler und Gegner). Sie tragen jetzt dieselbe Markierung wie die Werks-Lichter.
4. **Flache Rumpfteile glühten wie die Düse, egal wo sie saßen** (Flügelplatten, Finnen, Klappen, Kit-Finnen: `aLiv.y = 0`). Im Harness war die Manta bei voller Hitze bis zu den Flügelspitzen weiß; Klappen schimmerten schon im Leerlauf rosa. Jetzt bekommt jedes Rumpfteil in Grund- oder Zweitfarbe (Lackmodus 0 / 3) seine wahre Lage längs des Triebwerks (`heatAlong` in `podKit.ts`; Triebwerke, Bruchteile, Klappen, Kit-Teile, Flügel aus dem Layout). Glut und Ruß laufen damit auf Platten genauso von der Düse nach vorn wie auf dem Rumpf. Teile mit Lackmuster behalten ihre Koordinate.
5. **Prüflücke geschlossen:** die Bereichs-Prüfungen der Bruchteile liefen nur für den Spieler-Pod ab Werk. Jetzt für Spieler (alle Detailstufen + drei Teile-Sätze) und Gegner (einfach + Ultra + drei Style-Sätze), dazu neu: „ein Bereich besteht aus ganzen Teilen" (kein Dreieck außerhalb benutzt einen seiner Eckpunkte) sowie Flammen-Bereiche und Blitze der Gegner. Gegenprobe: lässt man Kit-Teile der Gegner ungezählt in den Topf, schlägt genau diese Prüfung an.

**Dabei gefunden:** die Harness-Option `heat` zeigte nur 15 % der verlangten Hitze (die Glut des Modells läuft nach). `settle()` lässt sie jetzt ankommen; Standard ist 0,03 (kalter Motor, wie die bisherigen Bilder). Neu: `airbrake` für `show`; `marks` erwartet Punkte im Rumpf-Raum.

### Verifiziert (Abschluss-Durchsicht)
- `npm run check` grün: **69/69** Unit-Prüfungen, Audit 14/14 (Mesh- und Dreieckszahlen unverändert), Sim 13/13 – **Tabelle zeilengleich zu Phase 7** (die Korrekturen ändern kein Fahrverhalten).
- **Echtes Rennen (WebGPU, Boonta, Aurora, 11 Pods):** 12 Probe-Treffer bei 60–129 m/s – der Punkt, den das Modell bekommt, stimmt auf 0 genau; dieselben Punkte über die Matrizen des Modells gerechnet lagen 1,6–6,5 m daneben (das Notebook schafft 22 Bilder/s). 0 Konsolenfehler.
- **Pipelines am Start unverändert** (100 / 166 Programme). In der ersten Rennsekunde kommen 3 dazu – Meshes direkt unter einer Welt-Gruppe (MeshBasic / MeshStandard), keine Pod-Meshes; nicht Teil dieses Auftrags.
- **Hangar-Layout** mit Schadens-Regler und Reitern bei 1280×720, 1920×1080, 1024×600, 800×1000, 2560×1440: `data-fit-shrunk="0"`, keine Scrollbalken.
- Harness: Manta bei Hitze 0,5 / 1,0, Aurora mit doppelten Klappen (keine rosa Klappen mehr), Treffermarken auf Aurora und Tenroc.

### Entscheidungen zu den Punkten, die der Prüfer offen ließ
1. **Äußeres Klappenblatt öffnet 96°** (Luftbremse ab Stufe 4): bleibt. Angesehen – es liest sich als voll geöffnete Bremse.
2. **Wandtreffer zählen immer als Zone „Seite"** (auch frontal): bleibt. Folge: Rammbug (Ram) und harte Nase (Splitter-X) helfen nur gegen Hindernisse und Pods, nicht beim Frontaleinschlag in die Wand. **Der Nutzer kann das anders wollen** – dann Zone nach Aufprallwinkel wählen (`physics.ts`, Wandkontakt).
3. **Bildrate auf „Ultra", Aussehen und Schadens-Balance** kann nur der Nutzer am Gaming-PC beurteilen.

### Zurückgestellt (klein, nicht behoben)
- Halo: die Abschlussplatten der Ringsegmente stehen bis 4,1 cm durch die Ringhaut, Nieten schweben 1,2–1,8 cm über ihr (`podEngines.ts`, `ringArc`).
- Treffermarken liegen bei nicht runden Triebwerken auf dem Kernradius: Manta rund 1 m innen neben der Flanke, Halo / Cyclone auf dem Kern statt auf dem Ring.
- Pod-gegen-Pod: das Ereignis bekommt nur einer der beiden (`collidePods`) – berührt ein Gegner mit kleinerer Startnummer den Spieler, entsteht keine Marke.
- CI: die Teleport-Messung überspringt nach einem Respawn 2–3 Bilder statt eines (`tools/ci/sim.ts`; besser `prevY` beim Respawn zurücksetzen).
- Hangar: die Vorschau baut das Modell bei jedem Tuning-Klick neu, auch wenn sich keine Teile-Stufe ändert (`PodPreview.tsx`, Schlüssel auf `tuneTiers`).
- Bild-Server des Harness nimmt Anfragen jeder Herkunft an (nur Entwicklungswerkzeug, Dateiname ist bereinigt).
- Toter Code: `cockpit.style` / `CockpitStyle`, `cockpitExtras` (ohne Nutzer; seine Bruchteile würden ohne Markierung eingebaut), `cockpitDesigns`, `glass` / `skin` in `sharedPodMaterials`.
- `loadProfile` prüft `race.difficulty`, `race.laps` und die Grafik-Werte nicht (ein von Hand geänderter Spielstand mit `difficulty: 9` lässt `Game.createPods` abstürzen – alt, nicht aus dieser Session).
- Wörter: Hangar-Liste heißt „Podracer" (Glossar: Pod / Racer); Meldungen „verklemmt", „leck", „ausgefallen", obwohl das Teil sichtbar abfällt. Kommentare in `data.ts` nennen `pilotParts` (gibt es nicht) und nur 3 von 6 Hauttönen.
- Älter als diese Session: `DebrisPool.dispose` wird nie aufgerufen (jetzt zwei Pools), ein Feld je Bild im `update` des Spieler-Pods.

### Messwerte vor der Überholung (Meshes / Dreiecke)
| Pod | Spieler „Hoch" | Spieler „Ultra" | Gegner nah | Gegner fern |
|---|---|---|---|---|
| Aurora XR-7 | 40 / 39 692 | 40 / 51 068 | 31 / 22 184 | 3 / 544 |
| Vrak Splitter-X | 37 / 39 888 | 37 / 50 656 | 28 / 22 976 | 3 / 544 |
| Tenroc 6-Fach | 62 / 83 388 | 62 / 106 412 | 29 / 39 328 | 3 / 984 |
| Quadra Lumber | 49 / 65 544 | 49 / 84 664 | 28 / 31 760 | 3 / 764 |
| Hollo Needle | 37 / 35 604 | 37 / 46 692 | 28 / 20 120 | 3 / 544 |
| Tyr Vespa | 38 / 34 676 | 38 / 44 196 | 29 / 19 324 | 3 / 544 |
| Beerak Fireflare | 37 / 39 148 | 37 / 50 508 | 28 / 21 096 | 3 / 544 |
| Pagali Ironclad | 50 / 61 684 | 50 / 78 308 | 30 / 30 996 | 3 / 764 |
| Mak Starling | 38 / 36 496 | 38 / 47 328 | 29 / 20 924 | 3 / 544 |
| Mandrel Ram | 40 / 37 660 | 40 / 48 044 | 31 / 20 872 | 3 / 544 |

Sichtmodell gegen Physikform: breiter als die Kollisionsform höchstens 0,50 m (Tyr Vespa, Klingenflügel); kein Triebwerk hängt mehr als 0,02 m, kein Cockpit überhaupt unter der Bodenklemme.

### Nicht verifiziert / offen
- Bildrate – auf diesem Notebook nicht aussagekräftig; „Ultra" testet der Nutzer am Gaming-PC.
- `tools/harness/pui.mjs:39` prüft noch die gelöschte Strecke „Neon-Spirale" (schlägt deshalb fehl) und braucht Puppeteer, das hier nicht installiert ist. Layout-Prüfung erfolgt vorerst im In-App-Browser.
- `tools/harness/run.sh` setzt Linux-Pfade voraus (`/tmp`, `LD_LIBRARY_PATH`).

### Befehle (neu)
1. `npm run check:pods` – nur das Pod-Audit. `POD=<id>` prüft einen Pod, `UPDATE=1` gibt neue Baseline-Zeilen aus (bewusst übernehmen, wenn Pods absichtlich geändert wurden).
2. Harness-Konsole: `await sheet('front', { quality: 3, save: 'name' })`, `await show(3, 0.3, 3, { rival: true })`, `statsAll()`. Bogen-Ansichten: `pod`, `front`, `rear`, `side`, `inside`, `chase` (Verfolgerkamera), `profile` (Seitenriss); `{ rival: true, far: true }` zeigt das Fern-Modell. Pod-Indizes der neuen: 10 Cyclone, 11 Halo, 12 Manta, 13 Voltspire. Teile zeigen: `await show(0, 1, 3, { kit: { fins: 3, intake: 3, nozzle: 1, canopy: 2 }, tune: { topSpeed: 5, cooling: 5 } })` (`kit` 0–3 je Steckplatz, `tune` = Tuning-Stufen 0–5; beides auch in `sheet(…)`).
3. `ROSTER_OLD=1 node tools/ci/out/sim.mjs` (nach `npm run check`) – Sim mit dem alten Startfeld; die Tabelle muss der von Phase 2 gleichen.
4. `ARMOR=0 PARTS=0 node tools/ci/out/sim.mjs` – Sim ohne Schadensmodelle (Tabelle = Stand Phase 4); einzeln: `ARMOR=0` nur Bruchteile, `PARTS=0` nur Panzerzonen.

## Erledigt (aus dem früheren `TODO.md`)
- [x] **Phase 0 – Setup + Sicherheitsnetz:** Node, Ausgangsmessung, Sichtprüfung im In-App-Browser, `podAssembly.ts`, Pod-Audit in `npm run check`, `CONTEXT.md`, ADR 0001/0002
- [x] **Phase 1 – Refactoring ohne Spieländerung:** Layout-Registry, `engineExtent`, `podCockpits.ts`, `applyDamage`, Profil v2, Unit-Prüfungen
- [x] **Phase 2 – 10 neue Cockpits + Details + Cockpit-Innenansicht** – wartet auf die Sichtung durch den Nutzer („Ultra" am Gaming-PC testen)
- [x] **Nachbesserung aus der Sichtung: Cockpits weiter oben** (0,6–1,05 m, über der Triebwerkslinie; Fahrverhalten unverändert über `keel`) – Höhe bestätigt der Nutzer anhand `tools/harness/out/p2_hoeher_*.jpg`
- [x] **Phase 3 – 4 neue Pods:** Cyclone, Halo, Manta, Voltspire, Gegner-Auslosung aus 13, Hangar-Liste für 14, wanderndes CI-Startfeld – vom Nutzer freigegeben, Quill Voltspire danach geschlossener gebaut
- [x] **Phase 4 – Tuning-Optik:** Tuning-Teile (7 Werte × 2 Stufen) + Style-Teile (Finnen, Einlass, Düse, Kanzel), Hangar-Reiter „Lack | Teile", Gegner mit ausgelosten Style-Teilen
- [x] **Phase 5 – Schadensmodelle, Fahrverhalten:** Panzerzonen + je drei Bruchteile pro Seite für alle 14 Racer, HUD-Lampen, Meldungen, CI-Schalter `ARMOR=0 PARTS=0`
- [x] **Phase 6 – Schadensmodelle, Optik:** Bruchteile fallen sichtbar ab (auch bei Gegnern, ohne zusätzliche Zeichenaufrufe), Triebwerke fallen aus, Blitze erlöschen, Treffermarken, Trümmer in Pod-Farben, Schadens-Vorschau im Hangar
- [x] **Phase 7 – Gegner:** Ruß und sterbende Flammen in den geteilten Materialien (je Mesh, eine Pipeline), Pipeline-Zählung unverändert (100), WebGL2-Lauf fehlerfrei
- [x] Flache Bleche glühten bei Hitze wie die Düse – behoben: jedes Rumpfteil in Grund- oder Zweitfarbe trägt seine Lage längs des Triebwerks (`heatAlong`)
- [x] **Abschluss-Durchsicht eingearbeitet:** Treffermarken sitzen exakt (Lage des aktuellen Schritts), schlagen nicht mehr auf die Klappen durch, Kit-Lichter gehen mit dem Triebwerk aus, Bruchteil-Prüfungen auch für Gegner und Teile-Sätze (69 Unit-Prüfungen)
