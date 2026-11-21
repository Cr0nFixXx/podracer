# HANDOFF

## Nächster Schritt (zuerst lesen)
1. **Pod-Überholung fortsetzen:** Phasentabelle im Abschnitt „Session 20" unten – die erste offene Phase ist dran. **Stand: Phase 2 fertig, der Nutzer sichtet die 10 neuen Cockpits (Bilder `tools/harness/out/p2_*.jpg`); erst nach seinem „weiter" beginnt Phase 3 (4 neue Pods).** Genauer Arbeitsstand: `.superpowers/sdd/swift-floating-kurzweil/progress.md` (git-ignoriert, nur lokal).
2. Vor jeder Änderung: `npm run check` (Typecheck + Pod-Audit + Sim) muss grün sein. Pods ansehen: `npm run dev` → `http://localhost:5173/tools/harness/pods.dev.html`.
3. Weiterhin offen aus Session 19: `npm run dev` → **Aquilaris-Küstenlauf** (19,5-m-Unterwassertunnel, 2 Skyway-Brücken, Flutschleuse) und **Frostspalt-Ring** (22,5-m-Gletschertunnel, verzweigte Eishöhle, Eisschleuse, Viadukt) Probe fahren; im **Hangar** die 6 Lackiermuster & 3 Finishes testen (≈ 6 Min.).

## Git-Stand (wichtig)
- Lokales Repo im Projekt-Root, Branch **`B`**, Remote `origin` = `https://github.com/Cr0nFixXx/podracer.git`. **Pushen:** `git push origin B`.
- Fremde Alt-Dateien (`canblatt.html`, `canwelk.html`) liegen sauber in `.archiv/` (git-ignoriert).
- **Doppelte `.git`-Sicherung in `.archive/`** (+ kompatible Spiegelkopie in `.archiv/repo-sicherung/`):
  1. `.archive/git` – direkte vollständige Ordnerkopie von `.git`
  2. `.archive/podracer-git.tar.gz.b64.txt` – vollständiges `.git` als Base64-Text (falls Binär-Packdateien beim Download gefiltert werden) + `wiederherstellen.sh` / `wiederherstellen.ps1` / `LIESMICH.txt`.
- **Committen immer mit `npm run save -- "Nachricht"`** (`tools/save.sh`): committet alles außer `.archive`/`.archiv`, aktualisiert beide Sicherungen und führt Probe-Wiederherstellungen aus.
- Commit-Autor ist der Platzhalter „Podracer Dev".
- **Lokaler Windows-Rechner (Claude-Desktop, Git-Worktrees unter `.claude/worktrees/`):** dort ist `.git` nur eine Zeigerdatei – `npm run save` würde nur diesen Zeiger „sichern" und die versionierte Sicherungsdatei durch einen Stummel ersetzen. Entscheidung des Nutzers (2026-11-21): `.archive` und die Git-Sicherung sind in dieser Umgebung nicht relevant → dort einfache `git commit`s. Session 20 liegt auf dem Branch `claude/caveman-mode-fa82ce` (abgezweigt von `new_pods` = `origin/B`, Commit `d7b9c4b`).
- Seit dem Commit `d7b9c4b` ist `.archiv/repo-sicherung/` versioniert: im Haupt-Checkout committet dadurch jedes `npm run save` eine Kopie des ganzen Repos ins Repo (Größe wächst je Sicherung etwa um den Faktor 2,3). Nicht angefasst – Entscheidung des Nutzers offen.

## Stand: 2026-11-21 (Session 20, läuft) – Pod-Überholung: Cockpits, Details, 4 neue Pods, Tuning-Optik, Schadensmodelle

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
| 2 | 10 neue Cockpits + Detailpass + Cockpit-Innenansicht → **Stopp: Nutzer sichtet** | ✅ erledigt – **wartet auf Sichtung durch den Nutzer** |
| 3 | 4 neue Pods (Cyclone → Halo → Manta → Voltspire), Hangar-Liste für 14, Gegner-Auslosung → **Stopp** | offen |
| 4 | Tuning-Optik: `PodCustom.kit`, `podKitParts.ts`, Hangar-Reiter „Lack \| Teile" | offen |
| 5 | Schaden – Fahrverhalten: `podDamage.ts`, Bruchteil-Maske, HUD-Lampen | offen |
| 6 | Schaden – Optik Spieler: Bruchteile, Treffermarken, Trümmer, Hangar-Schadensvorschau | offen |
| 7 | Schaden – Optik Gegner: `userData`-Ruß/Flammenleistung in den geteilten Materialien | offen |

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

### Verifiziert (Phase 2)
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
- Innenansicht bei Regen/Staub (Partikel können vor Cockpit-Teilen erscheinen, siehe ADR 0003), bei 90°-Rolle und in Tunneln nicht gesichtet.
- Innenansicht aller 10 Pods nur im Harness (Standbild), im Rennen nur Fireflare.

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
2. Harness-Konsole: `await sheet('front', { quality: 3, save: 'name' })`, `await show(3, 0.3, 3, { rival: true })`, `statsAll()`.

---

## Stand: 2026-11-20 (Session 19) – Bugfixes, Brücken/Unterführungen, futuristische Schleusen, verzweigte Höhlen, Pod-Aufwertung

### Erledigt in Session 19
**Bugs**
1. **Tunnel-Deckenhöhen deutlich erhöht (`trackBuilder.ts`, `world.ts`, `physics.ts`):** Aquilaris-Unterwasserröhren **19,5 m** (vorher 9 m; weiterhin 858 m voll unter Wasser mit Panorama-Ozeanfenstern), Ando-Prime-Gletschertunnel **22,5 m** (vorher 13 m), übrige Standard-Tunnel **19,5 m**, Abkürzungstunnel **18,5–20,5 m**, Höhlen **20,5–22 m** am Eingang bis **30–38 m** in den Kammern; breitere Schulterwölbung (`hw + 3,4 m`), Decken-Stalaktiten strikt ≥ 17,5 m über der Fahrbahn.
2. **Schwebende Bodenplatten an Erhebungen/Schrägkurven behoben (`props.ts`, `trackDetail.ts`, `world.ts`, `scifi.ts`):** Reparatur-/Ladepads, Rampen-Warnpfeile, Rampen-Abschlussleisten und Start-/Ziellinien folgen jetzt Vertex-für-Vertex exakt Steigung, Straßenkrone und Querneigung (mit eingezogenem Randflansch); Geysir-/Lavaschlote, Startboxen, Straßen-Studs, Hindernis-Warnringe und Kisten sind an 3D-Steigung + Querneigung ausgerichtet und im Belag verankert; Licht-Leitstreifen bündig eingelassen statt +36 cm schwebend.
3. **Schwebende Nebelschicht bei Gefälle behoben (`atmosphere.ts`, `Game.ts`):** Ursache war `max(y - baseY, 0)` (ergab unterhalb von `baseY` schlagartig 0 Höhennebel und darüber eine scharfe horizontale Kante). Ersetzt durch die exakte C¹-stetige Stammfunktion `F(u) = min(u, 0) + (1 - exp(-b·max(u, 0))) / b` mit weicher L'Hôpital-Überblendung für flache Sehstrahlen und tieferem Talboden `min(avgY - 14, minY - 6)`.
4. **Schwebende Bögen & Strecken-Assets verankert (`world.ts`, `props.ts`, `setPieces.ts`, `trackDetail.ts`, `scifi.ts`, `landmarks.ts`):** Felsbögen, Einsturz-/Eisbögen, Vista-Naturbögen, Checkpoint-Tore, Sponsoren-Traversen, Startportale, Schleusen, Schwenkbrücken, Felsrinnen, Tribünenstützen, Holo-Masten, Schwebe-Baken, Schilderpfosten und Felsen/Wracks erhalten tiefe Geländefundamente bzw. Ausleger-Konsolen an der Fahrbahnunterseite (Oovo IV / Aquilaris).
5. **Dschungelfluss-Sprint Abkürzungs-Ende behoben (`trackBuilder.ts`, `world.ts`):** `openL`/`openR` prüfte gegen `samples[ia].hw` statt der tatsächlichen Breite am Ausgang (offene Fläche 108 m → 24-m-Felswand stand mitten in der Piste) und ignorierte die Querneigung (−4,66 m Höhenversatz). Jetzt exakte Höhen-/Querneigungs-Anpassung (`stitchBranch`), sanft auslaufende Klippenwände und ausgesparte Böschungsschürzen auf allen 13 Strecken.

**Verbesserungen / Soll**
6. **Welt/Map „Ökumenopolis" (`city` / `neon`) vollständig entfernt:** 13 Strecken auf 8 Planeten; gespeicherte Profile mit `trackId: 'neon'` fallen sauber auf `boonta` zurück.
7. **Feinere Gewitterblitze (`weather.ts`):** 64-teiliger fraktaler Hauptkanal (~3,4× feiner, kamera-senkrechtes 3D-Ribbon mit Quer-Falloff) + 5 sich verjüngende Hauptäste + 7 haardünne Zweigverästelungen + dezente Korona.
8. **Strecken kreuzen sich über/unter sich selbst (`data.ts`, `trackBuilder.ts`, `terrain.ts`, `world.ts`, `physics.ts`, `screens.tsx`):** 12 höhengetrennte Kreuzungen (Δy = 35–41 m) auf 10 Strecken – obere Führung als Hohlkasten-Viaduktbrücke (`buildBridges`) mit Querträgern, Leuchtkanten, Widerlagern und Zwillingspfeilern (frei von der unteren Piste), untere Führung als Unterführungs-Tunnel (`tun = 4`) oder offene Schlucht; Terrain folgt der unteren Ebene; Karten/Minimap zeigen Brücken abgesetzt.
9. **Futuristische, in die Szenerie verschmolzene Schleusen statt Fallgitter (`setPieces.ts`):** 3-spurige Panzerschleusen mit seitlichen Fels-/Eis-/Kristall-/Stations-Monolithen, Überkopf-Schleusenbrücke (solide Kollision), hydraulischen Verbund-Schottplatten, Plasma-Dichtnaht, dezentem Warn-Kraftfeld und Statusleisten.

**TODO-Punkte**
10. **Verzweigte & verbreiterte Höhlen (`trackBuilder.ts`, `world.ts`, `physics.ts`):** Höhlen auf Vulkan (2 Abzweige!), Ando Prime (`frost`, `howler`), Kristall und Dschungel verzweigen in eine echte zweite unterirdische Höhlenröhre (`Path.isCave`), die sich weiter hinten wieder vereint (inkl. Fels-Gabelpfeiler mit Doppel-Leuchtpfeil und KI-Feldaufteilung); Kammern verbreitern sich seitlich (`caveW`) mit modelliertem Höhlenboden-Mesh, Leuchtadern und Stalagmiten.
11. **Podracer-Aufwertung (`settings.ts`, `podMaterials.ts`, `podParts.ts`, `podDesigns.ts`, `podModel.ts`, `post.ts`, `Game.ts`, `screens.tsx`):** 6 wählbare Lackiermuster + 3 Lackfinishes (Klarlack, Metallic, Matt) + 8 Vorlagen im Hangar, individuelle Alien-Pilotenköpfe/-Helme je Spezies, Cockpit-Überrollbügel & HUD-Ring, feinere Einlass-Statoren & Plasma-Koppler, seitengetrennte verbogene/flatternde Schadensklappen und Düsen-Hitzeflimmern auch für die zwei nächsten Gegner-Pods.

### Verifiziert
- `npm run check` (45 s Standard **und** 90 s Sturm-Haftung `GRIP=0.88`): 13/13 Strecken bestanden, **0 Tode, 0 NaN, 0,00 m Wand-Durchdringung, 0 Teleports**, Deck- & Overhead-Selbsttests grün.
- Node-Geometrie- & 3D-Welt-Audit: alle 13 kompletten 3D-Welten + alle 10 Podracer (Hero & Rival, 6 Muster, 3 Finishes) + Blitz + Nebel gebaut (12 410 Meshes, 0 NaN/Inf, 0 Abkürzungs-/Kreuzungsfehler); KI-Befahrung aller Höhlenabzweige und der Dschungel-Abkürzung bestanden.
- `npm run build` → `dist/index.html` fehlerfrei; `npm run save` → `.archive/git` + `.archive/podracer-git.tar.gz.b64.txt` (beide Wiederherstellungstests ok).

### Nicht verifiziert
- Optische Probefahrt & FPS auf echter GPU (kein Browser in dieser Sandbox): Brücken-Unteransichten, neue Schleusen, Höhlengabelungen, feine Blitze und Gegner-Hitzeflimmern im Live-Rennen sichten.

---

## Stand: 2026-11-20 (Session 18) – Strecken erweitert, längere Tunnel/Höhlen, offene Flächen, HQ-Bäume, echte Foto-Texturen

### Erledigt in Session 18
1. **Alle 14 Strecken prozedural erweitert (`trackBuilder.ts → controlPoints`):** Layout ×1,3 skaliert (`TRACK_SCALE`), in lange Segmente werden **S-Kurven** eingefügt (mit Abstandsprüfung ≥ 185 m zum Rest des Layouts), die zwei längsten Segmente werden zu **offenen Flächen** (Fahrbahn bis ~108 m breit, ohne Schluchtwände/Tunnel). Start-/Zielgerade bleiben wie entworfen. Die Kontrollpunkte in `data.ts` sind unverändert; Abkürzungs-Hinweise werden über `map` umgerechnet.
   - Ergebnis: **7,0–13,9 km** je Strecke (vorher 5,2–9,9 km), 11–27 Kurven (vorher 5–9 … gemessen an Richtungswechseln), 1,6–4,4 km offene Fläche, alle Abkürzungen weiter vorhanden.
   - Mehr Wellen in der Höhe (±19 m / ±8 m), Hindernisse/Geysire/Felsbögen in der Anzahl angehoben.
2. **Längere Tunnel:** Standard-Tunnel 260–560 m (vorher 120–240 m), Aquilaris-Unterwasserröhren 650–840 m, davon 230–340 m eben unter Wasser.
3. **Komplexere Höhlen:** Höhlensysteme jetzt auf **Vulkan (5 Kammern, ~1,1 km), Ando Prime (3 Kammern) und Kristallschluchten (3 Kammern)**: abgesenkte Fahrbahn, Kammern mit hochgewölbter Decke (12,5 → 18–24 m), offene Lichtschächte dazwischen, **Felssäulen als Hindernisse** in den Kammern, Stalaktiten und Stalagmiten.
4. **Mehr Deko:** Dekor-Anzahl skaliert mit der Streckenlänge + 20 % (`dens` in `scatterDecor`, max. ×2,6), mehr Landmarken auf langen Strecken.
5. **HQ-Bäume (`decorGeo.ts → jungleTreeGeometry`, `foliage.ts`):** Stamm/Äste mit **echter Rinden-Textur**, dunkler Kronenkern + **Blattwerk-Karten** (Zweige mit Einzelblättern, Alpha-Test; 16 je Kronenlappen), Zweige in die Seitenkronen, Lianen. 986 Dreiecke (vorher 1 347), Fern-LOD 368. Ein Material mit Atlas (Rinde | 4 Zweig-Kacheln | weißer Streifen) + `alphaMap`.
6. **Echte Foto-Texturen (`photoTex.ts`, `photoAssets.ts`, `src/assets/tex/*.jpg`):** vier Pexels-Fotos (Fels, Rinde, Sand, Boden), offline kachelbar gemacht und beleuchtungsbereinigt (`tools/photos/process.mjs`). Sie modulieren die prozeduralen Textursätze beim Einpacken: Albedo × Foto-Helligkeit, Normal + Foto-Relief, Höhe + Foto. Zuordnung `KIND` in `photoTex.ts`: rock/basalt → Fels, sand → Sand, jungle/mud/gravel/cracked → Boden. Paletten und Schichtbänder bleiben.
   - Quellen: Fels Pexels 19786610 (Alfo Medeiros), Rinde 7717796 (Marina Leonova), Sand 19215109 (Alejandro Henriquez), Boden 3859201 (Engin Akyurt). Neu erzeugen: Fotos nach `/tmp/ph/{rock2,bark2,sand1,soil1}.jpg` laden, `node process.mjs <repo>/src/assets/tex`.
   - Der Harness braucht jetzt `--loader:.jpg=dataurl` beim esbuild-Aufruf (in `run.sh` und `gpu.mjs` eingetragen).

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden (0 Abstürze, 0 NaN, 0 m Wand-Durchdringung, Deck-Selbsttest ok, 0 Teleports). Layout-Report je Strecke in der CI-Ausgabe (`layout: … km · … corners · … shortcut(s) · open flats …`). Alt/Neu-Vergleich: `NO_EXPAND=1 npm run check`.
- Standbilder (WebGL2): HQ-Baum nah + Wald, offene Fläche auf Boonta, Schluchtwand mit Foto-Relief, Magma-Höhlenkammer mit Säule, Magma-Übersicht.
- WebGPU-Konsolencheck Dschungel (neues Baum-Material) + Magma (Höhle): 0 Fehler. Standbilder Ando-Prime-Tunnel und Aquilaris-Unterwassertunnel nach der Erweiterung in Ordnung.
- App-Smoke-Test (gebaute App mit Foto-Texturen und Workern, Dschungel): bestanden (Rennen, HUD, Pause, Grafik-Menü, Tasten- und Gamepad-Belegung).

### Nicht verifiziert
- **Bildrate** auf echter GPU: größere Welten (Fläche ×1,7), bis ×2,6 Dekor, alpha-getestetes Blattwerk.
- **Fahrgefühl** der neuen Kurven und Flächen; die S-Kurven sind nur per Simulation befahren.
- Blattwerk-Schatten (Alpha in der Schatten-Pass) nicht gesichtet.
- Build wuchs um ~0,55 MB (Fotos als Base64) auf ~2,8 MB.

---

## Stand: 2026-11-19 (Session 17) – befahrbare Tunneldecks, Unterwassertunnel, Höhle, Quadra Lumber, Boost-Überziehen, Cockpit-Pendel

### Erledigt in Session 17
**Bugs**
1. **Teleport in den Tunnel:** Ursache war die Deckenkollision – jeder Pod über der Decke wurde auf Deckenhöhe gesetzt, auch wenn er von außen über das Portal flog. Jetzt hat jeder Tunnel ein **befahrbares Deck** (`TUNNEL_DECK` = 1,2 m über der Decke). Beim Eintritt in einen überdachten Abschnitt wird einmal entschieden: über der Kuppe → `PodState.upper = true` (fährt oben, Boden = Deck), sonst innen (Decke gilt). Am Deckende fällt der Pod auf die Strecke zurück.
   - Tunnel sind jetzt „unterirdisch": Innenröhre + **Erdwall** (Böschung bis zum Gelände) + geschlossene Portalwände; Deck mit Fahrbahn-Textur und Leuchtkanten (`world.ts → buildTunnel`).
   - Tunnel werden jetzt **vor** Hindernissen/Geysiren/Set-Pieces platziert (`trackBuilder.ts`), die sich fernhalten. Drei Arten (`Sample.tun`): 1 Standard, 2 Unterwasser, 3 Höhle.
2. **Aquilaris – Unterwassertunnel:** 2 Röhren (360 m und 456 m), die Fahrbahn taucht 14–16 m unter den Meeresspiegel (max. 20 % Gefälle), Stahl-Caisson, **Fenster mit Ozean-Ansicht** (prozedural: Tiefenverlauf, Kaustik, Lichtstrahlen, Fischschwärme) dort, wo die Röhre unter Wasser liegt. Keine Schanze innerhalb von 600 m davor. Meeresspiegel ist jetzt fest (`td.seaY`); die Wasserfläche hat ein Loch-Raster über den Röhren-Enden (`tunnelWaterMask`), sonst schnitte sie durchs Tunnelinnere.
3. **Magma-Inferno – Höhlensystem:** 600 m langer Abschnitt, 11 m ins Gelände abgesenkt, in drei Teilen überdacht (176 / 148 / 108 m) mit zwei offenen Lichtschächten; raue Felsröhre, Stalaktiten, Glutadern. Keine Schanze innerhalb von 520 m davor. Dazu weiterhin 2 Standard-Tunnel.
4. **Quadra Lumber:** vier schlanke Triebwerke im Quadrat (oberes Paar direkt über dem unteren), **X aus zwei Energieblitzen** (`PodLayout.binders`), Verbindungsstreben.
5. **Kein Staub/Gischt am eigenen Pod:** die Partikel wurden bis 12 m vor der Kamera ausgeblendet, starteten hinter den Triebwerken und blieben mit 20 % Pod-Tempo sofort zurück – sichtbar wurden sie erst hinter der Kamera. Jetzt: Start unter den Triebwerken, sie werden im Fahrtwind mitgerissen (80 % Tempo, starker Luftwiderstand), driften leicht nach außen, Ausblendung erst ab 8,5 m, deutlich deckender und heller als der Boden.
6. **Halbes Cockpit in der Ego-Ansicht:** die Near-Plane (0,8 m) schnitt das Cockpit. Cockpit wird in der Fahrer-Ansicht ausgeblendet (Triebwerke und Leitungen bleiben), Kamera folgt dem Cockpit-Pendel.

**Soll**
7. **Boost überziehen:** am Hitze-Maximum kann der Boost bis zu 3 s weiter gehalten werden, kostet 3,2 Schaden/s je Triebwerk; danach Zwangsabschaltung bis 55 %. HUD zeigt „ÜBERZOGEN · NOCH x s" + ablaufenden Balken.
8. **Triebwerksglühen als Überhitzungs-Anzeige:** Glut beginnt an der Düse dunkelrot und wandert mit der Hitze nach vorn (Farbverlauf gelbweiß → orange → dunkelrot, am Limit schwach bis zur Blitz-Kopplung); folgt der Hitze träge (Metall wärmt langsam auf, kühlt langsam ab). Ab 86 % Funken, beim Überziehen mehr.
9. **Mehr Triebwerkshub** beim Lenken (außen +1,5 m, innen −0,5 m, lebhafteres Wippen).
10. **Spiegelungs-Auflösung** einstellbar (35–100 %, Standard 75 %, vorher fest 35 %; Ultra 100 %).
11. **Cockpit-Pendel:** Cockpit schwingt an den Leitungen – nach außen in Kurven/Slides, nach hinten beim Beschleunigen, nach vorn beim Bremsen, federt bei Landungen (nur eigener Pod).
12. **Energieblitz feiner, mehrere gleichzeitig:** haardünner Kern + vier dünne, unabhängig flackernde Bögen.
13. **Staub/Gischt verstärkt** (siehe 5).
14. **Schwerelosigkeit zentrierter:** Feder zur Röhrenmitte wieder nah am alten Wert, weniger Taumeln; das höhere Tempo bleibt.

### Verifiziert
- `npm run check` (14/14): 0 Abstürze, 0 NaN, 0 m Wand-Durchdringung. **Deck-Selbsttest:** ein Pod wird kurz vor dem ersten Standard-Tunnel 24 m angehoben → fährt auf allen 12 Strecken mit Standard-Tunnel über das Deck (55–960 Frames), **0 Teleports nach unten** (kein Pod verliert > 4,5 m Höhe in einem Frame).
- Tunnel-Report: Aquilaris 2 × Unterwasser (Fahrbahn 14,4 / 15,9 m unter dem Meer), Magma Höhle 176 + 148 + 108 m + 2 Standard; alle anderen 2–4 Standard.
- WebGPU-Konsolencheck Aquilaris + Magma: 0 Fehler. Layout-Test (mit neuem Regler): keine Scrollbalken, einheitliche Skalierung.
- Standbilder: Quadra Lumber 2×2; Unterwassertunnel Portal + innen mit Ozean-Fenstern; Höhle innen; Boonta-Tunnel mit Erdwall; **Staubfahne am eigenen Pod (Boonta) und Gischt (Dschungel, Regen) sichtbar**.
- App-Smoke-Test (gebaute App, Aquilaris mit Unterwassertunneln): bestanden.
- **Lehre aus der Staub-Fehlersuche:** die Aufnahmen zeigten lange keinen Staub, weil (a) die Wolken mit nur 20 % Pod-Tempo sofort zurückblieben und erst hinter der Kamera sichtbar wurden – jetzt 80 % + starker Luftwiderstand (reiten im Fahrtwind mit); (b) der Test-Harness 170 Updates ohne Rendern fährt und der Partikel-Pool dabei noch nicht hochgeladene Bereiche verwarf – Pool sammelt Bereiche jetzt, Harness ruft `fullUpload()`. (b) betraf nur den Test, nicht das Spiel.

### Nicht verifiziert
- **Sprung aufs Tunneldach von Hand** (nur simuliert), Fahrgefühl auf dem Deck, Sturz am Deckende (14 m, kostet etwas Schaden).
- X-Blitz, feine Bögen, wanderndes Glühen, Funken, Cockpit-Pendel, Überziehen-Anzeige nicht in Bewegung gesehen.
- Unterwassertunnel von außen (Caisson an der Wasserlinie, Loch-Raster) nicht gesichtet – dort sind Darstellungsfehler am wahrscheinlichsten.
- Cockpit-Pendel und Hitzeglühen gibt es nur am eigenen Pod (Gegner-Modelle sind statisch gemerged).

---

## Stand: 2026-11-19 (Session 16) – Düsenklappen, Bogen-Kollision, Start-Disziplin, Tunnel, Sci-Fi, Schwerelosigkeit, Wetter, Gamepad

### Erledigt in Session 16
**Bugs**
1. **Boost öffnete die Bremsklappen:** mein Fehler aus Session 15. Jetzt öffnen sich die **Düsenklappen am Triebwerksausgang** (`podParts.ts → petals`, Attribut `aPet`; ein gemeinsames Material `petalMaterial()`, Öffnung je Mesh über `mesh.userData.open`). Seitliche Bremsklappen reagieren wieder nur auf die Luftbremse (+ Klappern bei Schaden).
2. **Bögen ohne Kollision:** die 6–10 **Felsbögen** je Strecke (`addArches`) und der **Einsturz-Bogen/Eisbogen** (Set-Piece; nach dem Einsturz nur noch die Stümpfe) sind jetzt massiv (`Overhead.arch` mit `inner`, `yOff`, `thick`, `sp`). Checkpoint-Bögen, Traversen, Startportal waren es schon. Tunnel haben Deckenkollision.
3. **Gegner fahren am Start ineinander:** KI hält die ersten ~4,5 s ihre Startspur und fädelt bis 7,5 s auf die Ideallinie ein; kein seitliches Ausweichen in der Startphase; wer dicht auffährt, nimmt Gas weg. Startreihen 26 m statt 18 m auseinander (Pods sind bis 22 m lang).

**Soll**
4. **Startnummern-Schilder entfernt.**
5. **Drift mit Heck-Ausbruch:** im Slide +60 % Gier-Wirkung, Gierrate baut sich träge auf und schwingt nach (weich), Begrenzer erst bei ~60° Schräglauf.
6. **Wetter stärker:** bis 4 200 Wetterpartikel (vorher 2 000), dickere/deckendere Regenstreifen, größere Schneeflocken, Nebel/Sichtweite deutlich dichter je Wetter, Regenböen auch bei normalem Regen, Böen-Schwaden +60 % und deckender, Blitze ~40 % häufiger und heller, Sturmböen rütteln an der Kamera, Regen/Wind lauter, doppelt so viele Aufschlag-Spritzer.
7. **Sci-Fi (`scifi.ts`, neu):** laufende **Licht-Leitstreifen** an beiden Fahrbahnrändern (Oovo, Aquilaris, Malastare, Ökumenopolis: ganze Strecke; alle Welten: in Tunneln), **Holo-Tafeln** auf Projektormasten, **Schwebe-Baken**, **Energieleitungen** mit Leuchtmuffen neben der Strecke. Malastare hat jetzt ein getäfeltes Metall-Renndeck (`cityRoad`) und Energiemasten.
8. **Tunnel auf allen Strecken (`trackBuilder.ts`):** 2 je Strecke, 3–4 auf Aquilaris, Oovo IV, Ando Prime, Malastare (je 120–240 m, gesamt 280–660 m je Strecke). Bevorzugt in Schluchten; nie an Start, Rampen, Lücken, Zero-G, Abkürzungs-Einmündungen, Set-Pieces, Geysiren. Tunnelbau generalisiert (`buildTunnel`: je Dach-Abschnitt, mit Querneigung geschert, Portale, Rippen, Deckenlampen).
9. **Schwerelosigkeit:** keine Feder mehr zur Röhrenmitte – der Pod driftet frei, `↑`/`↓` sind Schubdüsen nach unten/oben, Impuls bleibt; +28 % Höchsttempo, mehr Schub, kein Luftwiderstand; seitlich schwebend aber steuerbar; Pod und Triebwerke taumeln/wippen langsam; Sichtfeld +8°; Sternenstaub zieht vorbei. Kurz vor dem Röhrenende wird der Pod sanft auf Schwebehöhe geführt.

**TODO-Punkte**
10. **Boost-Klappen bei Gegnern:** erledigt (gleiches Material, pro Mesh `userData.open`).
11. **Grafik live:** zusätzlich **Volumetrie** (Nebel-Schichten per Uniform, Lichtkegel) und **Textur-Filter**. Weiter nur per Neustart: Texturauflösung, Geometrie/Detaildichte, Tessellation, Material-Optionen, SSR, **Kaskaden-Schatten** (nicht umgesetzt: Schatten-Knoten ist in alle beleuchteten Materialien kompiliert; nach der SSR-Erfahrung nicht riskiert), Renderer.
12. **Tribünen/Landmarken am Hang:** Tribünen haben einen 18 m tiefen Fundamentblock; Landmarken sitzen auf dem tiefsten Punkt (5 Höhenproben).
13. **Gamepad-Belegung im Menü** (`keymap.ts → PadMap`, `ui/KeyBindings.tsx → PadBindings`): Aktion anklicken, Taste drücken oder Stick bewegen; Trigger/Sticks bleiben analog; „Standard" setzt zurück.
14. **CSM auf Ultra:** ist seit Session 14 im Ultra-Preset eingeschaltet (TODO-Eintrag war veraltet).

### Verifiziert
- `npm run check` (14/14): 0 Abstürze, 0 NaN, 0 m Wand-Durchdringung. **Start-Berührungen** (Paare in den ersten 8 s): vorher Ø 8,3 (2–15), jetzt Ø 2,6 (0–5). **Zero-G:** Ø 147 m/s (Oovo) bzw. 160 m/s (Henker) in den Röhren gegenüber 123 / 113 m/s außerhalb. **Tunnel:** 2–4 je Strecke.
- Standbilder (WebGL2): Malastare-Tunnel mit Portal, Lampen, Leitstreifen und Metall-Deck; Malastare im Gewitter (dichte Regenstreifen); Oovo Zero-G-Röhre und Tunnel; Aquilaris im Sturm mit Leitstreifen und Energieleitung; Pod mit Düsenklappen.
- **WebGPU-Konsolencheck** (0 Fehler): Oovo IV + Malastare inkl. Live-Umschalten (Volumetrie aus, Textur-Filter, Bloom, AO, AA, Schatten …), Aquilaris bei Gewitter/Nacht. WebGL2: Ando Prime mit Live-Umschalten fehlerfrei.
- **Layout-Test:** 1280×720, 1920×1080, 800×1000 – einheitliche Skalierung, keine Scrollbalken, auch mit dem neuen Gamepad-Abschnitt.
- **App-Smoke-Test** (gebaute App, Oovo IV): Rennen, HUD, stumme Pause, Grafik im Pausemenü, Taste umbelegen und **Gamepad-Umbelegen** (simuliertes Pad: Boost → „L3") bestanden.

### Nicht verifiziert
- **Fahrgefühl:** Heck-Drift, Schwerelosigkeit, Start (Mensch + 10 Gegner; die Simulation hat keinen Spieler-Pod mit menschlichem Verhalten).
- Düsenklappen in geöffnetem Zustand, Holo-Tafeln, Blitz/Böen-Stärke und Sternenstaub nicht in Bewegung gesehen.
- Bogen-Kollision: nur die gerade Test-Traverse per Selbsttest; Felsbögen liegen meist so hoch (≥ 12 m am Rand), dass die KI sie nie berührt.
- Tunnel: frei stehende Tunnel (ohne Schlucht) von außen nicht gesichtet; Gelände kann die Röhre schneiden.
- Start-Berührungen sind nicht null (Ø 2,6 Paare streifen sich beim Einfädeln).

---

## Stand: 2026-11-19 (Session 15) – Bugfixes (UV-Schmieren, UI-Skalierung, Trümmer, SSR), Drift, Staubfahnen, Live-Grafik

### Erledigt in Session 15
**Bugs**
1. **Schmierige/langgezogene Bodentextur (alle Strecken, am stärksten spät auf Sprints):** Die Fahrbahn-Texturkoordinate war `zurückgelegte Strecke / Kachellänge(Breite)`. Wo sich die Streckenbreite ändert, wird damit die GESAMTE bisherige Strecke durch eine andere Zahl geteilt → Textur wird immer stärker gestreckt/gestaucht, je weiter man ist. Jetzt segmentweise integriert (`world.ts`, Road-Deck).
2. **Halb durchsichtige Trümmer:** (a) Eisbrücken-Material hatte 88 % Deckkraft → jetzt deckend. (b) Bogen-/Eisblöcke sind Torus-Segmente ohne Stirnflächen; nach dem Herausbrechen sah man durch die offenen Enden → Deckel ergänzt. (c) Die Trümmer-„Brocken" zerplatzender Hindernisse waren weiche Sprites → jetzt echte, deckende Brocken (`debris.ts`, instanziert, prallen ab, schrumpfen am Ende).
3. **UI uneinheitlich (Hangar winzig, Steuerung riesig):** `Fit` skalierte jede Ansicht nach ihrer eigenen Höhe. Jetzt **ein** Faktor für alle Ansichten: `min(Breite/1180, Höhe/720)`; jede Ansicht ist auf die virtuelle Höhe 720 px ausgelegt (Flex-Spalten). Notfall-Schrumpfen nur, wenn eine Ansicht zu hoch ist – der Layout-Test schlägt dann fehl.
4. **Schwebende Objekte an Hängen:** Dekor, Streckenrand-Props und Relaistürme saßen auf der Geländehöhe ihres Mittelpunkts. Jetzt auf dem tiefsten Punkt ihrer Standfläche (5 Höhenproben).
5. **Keine Spiegelungen in Pfützen:** Die SSR verwarf alle Nichtmetalle. Der Puffer führt jetzt „Reflektivität" statt Metallanteil (glatte, nasse Flächen zählen mit); SSR-Reichweite 42 m, stärker; nasse Fahrbahn glatter. SSR ist jetzt auch in der Voreinstellung „Hoch" an.

**Soll**
6. **Staubfahnen:** jeder Pod zieht unter beiden Triebwerken eine Staubfahne (dichter/länger mit Tempo, ab 16 m/s), bei Nässe Gischt. Gegner näher als 24 m vor der Kamera nur angedeutet (Sicht). Auf Metallstrecken (Stadt, Oovo) 30 %.
7. **Triebwerksklappen** öffnen beim Boost (weich, leichtes Flattern) und schließen wieder (nur Spieler-Pod und Hangar; Gegner-Modelle sind statisch gemerged).
8. **Mehr Drift:** Seitenhaftung im Slide 3,5 % (vorher 8,5 %), Haftung kehrt in ~0,7 s zurück, Eindreh-Begrenzer erst ab ~50° Schräglauf, weniger Bremswirkung. Gegner sliden mit 45 % Stärke.
9. **Rolle:** Anheben/Neigen lenken mit +45 % Wirkung (vorher −40 %), Eingabe ×1,25, Lenkung spricht schneller an.

**TODO-Punkte**
10. **Checkpoint-Bögen haben Kollision** (`Overhead.arch`): Decke folgt der Halbellipse – am Rand niedrig, in der Mitte hoch.
11. **Grafik live schalten** (`Game.applyLiveGfx`): zusätzlich Bloom (+Stärke), AO, God Rays, Unschärfe, Kino-Shader, Kantenglättung, Linseneffekte (Post-Kette wird neu gebaut), Schatten an/aus + Auflösung (nicht bei Kaskaden-Schatten), Partikel, Sichtweite. Neustart weiter nötig: Texturen, Geometrie/Detaildichte, Tessellation, Parallax/Bump/Shader-Details, Batching, Renderer, Anisotropie, Kaskaden-Schatten, Volumetrie und **SSR** (SSR ändert die Render-Ziele der Szene; live umgeschaltet gab es auf WebGPU Pipeline-Fehler – getestet und deshalb herausgenommen).
12. **Podracer-Aufwertung:** Startnummern-Tafel hinter dem Cockpit (1 gemeinsames Material/Atlas), Boost-Klappen, Staubfahnen.

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden (0 NaN, 0 m Wand-Durchdringung, KI-Neigen ≤ 1,3 %).
- **Layout-Test** (`pui.mjs`): gleiche Skalierung auf allen Ansichten (1280×720 → 1,00 · 1920×1080 → 1,50 · 1024×600 → 0,83 · 800×1000 → 0,68 · 2560×1440 → 2,00), kein Notfall-Schrumpfen, keine Scrollbalken. Screenshots gesichtet.
- **Standbilder:** Dschungel nach der Abkürzung vorher (Streifen bis zum Horizont) / nachher (normale Schlammtextur); Startnummern an Spieler- und Gegner-Pods.
- **Live-Umschalten** (Harness `?live`: Bloom, AO, God Rays, AA, Unschärfe, Kino-Shader, Linseneffekte, Schatten aus/an, Partikel, Sichtweite): WebGPU Boonta + Stadt bei Regen → 0 Konsolenfehler; WebGL2 Boonta → ebenfalls fehlerfrei. Zwei Fehler dabei gefunden und behoben: (1) SSR live umzuschalten erzeugt auf beiden Backends ungültige Pipelines → SSR ist jetzt Neustart-Option; (2) asynchrones Warm-up nach dem Neuaufbau kollidierte mit laufenden Frames → entfernt.
- **SSR:** WebGPU Dschungel bei Gewitter mit SSR 0 Fehler. Standbild Stadt bei Regen: Triebwerksglühen spiegelt sich unter dem Pod auf der nassen Fahrbahn (im Software-Rendering körnig; Weichzeichnung danach erhöht, nicht erneut gesichtet). Gebäude-Spiegelungen kaum sichtbar.
- **App-Smoke-Test** (gebaute App): Rennen, HUD-Seiten, stumme Pause, Grafik im Pausemenü ohne Scrollen, Tasten umbelegen – bestanden.

### Nicht verifiziert
- **Fahrgefühl** von Drift und Rollen-Lenkung (nur Simulation).
- In Bewegung nicht gesehen: Staubfahnen, Boost-Klappen, solide Trümmer, gedeckelte Bogenblöcke, Bogen-Kollision (nur gerade Traverse per Selbsttest geprüft).
- Hang-Sitz der Objekte nicht einzeln gesichtet; Tribünen am Start und Landmarken nutzen den alten Weg.
- Schatten-Umschalten zur Laufzeit optisch (nur auf Fehlerfreiheit geprüft).

---

## Stand: 2026-11-19 (Session 14) – Bugfixes, responsive UI, Rollen-Steuerung, zerstörbare Hindernisse, Textur-Cache

### Erledigt in Session 14
**Bugs**
1. **Hand-/Luftbremse zu hart (`physics.ts`):** progressiver Slide über `slideK` (0→1 in ~0,3 s). Gier-Verstärkung ×1,2–1,47 statt ×1,7–2,4, Seitenhaftung fällt auf 8,5 % (Pod driftet auf seinem Schwung), Bremswirkung im Slide 30 %, Schräglaufwinkel-Begrenzer ab ~35° (kein Eindrehen), Haftung kehrt nach dem Loslassen über ~0,45 s zurück.
2. **Schadensanzeige L/R vertauscht:** intern ist „L" = lokales x < 0 = im Verfolgerbild das **rechte** Triebwerk. `Game.hud()` tauscht jetzt.
3. **Klappen klappern im Hangar/am Start:** mein Fehler aus Session 13 (`update()` bekommt Gesundheits-, nicht Schadenswerte). Klappern jetzt nur unter 45 % Triebwerkszustand.
4. **Steuerleitungen durchs Triebwerk (`podModel.ts → buildFlexCables`):** die Leitung lief in gerader Linie vom Cockpit zum Pylon bei 58 % der Gondellänge, also durch die hintere Gondelhälfte. Jetzt: frei hängender Bogen bis zu einem Sattel knapp über/hinter dem Gondelheck, dann mit zwei Schellen auf der Gondeloberseite zum Pylon.
5. **Ton im Pausemenü:** `onKey` rief nach jedem Tastendruck `audio.resume()` – auch direkt nach dem Pausieren. Jetzt nur, wenn nicht pausiert; zusätzlich wird in der Pause der Master-Pegel auf 0 gesetzt.
6. **Banner zu niedrig, ohne Kollision:** Sponsoren-Traversen von 11 m auf 21 m (Banner-Unterkante ~17,7 m). Neu `TrackData.overheads` (Traversen + Startportal): wer hineinfliegt, wird nach unten (oder oben) abgewiesen, verliert 10 % Tempo und 5–18 Schaden. Checkpoint-Bögen 46 % höher (ohne Kollision).

**Soll**
7. **Responsive UI ohne Scrollbalken (`ui/Fit.tsx`):** Inhalt wird bei virtueller Breite gesetzt, gemessen und so skaliert, dass er in beide Richtungen passt (klein und groß); überschüssige Breite verbreitert das Layout. Breakpoints sind Container-Queries (`@3xl:`, `@5xl:`), nicht mehr Viewport-Queries. Einstellungen haben Reiter „Grafik & Ton" / „Steuerung", die Streckenliste ist einzeilig-kompakt, das HUD skaliert mit dem Fenster (Referenz 1280 × 720).
8. **Planeten-Filter** in der Streckenwahl (Auswahlfeld, kombiniert mit Rundkurs/Sprint).
9. **„Ultra" = alles Maximum** außer Sichtfeld und Bloom-Stärke (Render-Skalierung 150 %, Texturen 2048, SSR, Kaskaden-Schatten, Partikel 150 %, Sichtweite 150 % …). Alle Presets setzen jetzt jede Option (kein Liegenbleiben alter Werte).
10. **Energiekopplung (`podMaterials.ts → boltLook`):** weißer Kern, zwei wandernde Gabel-Bögen, 24-Hz-Flackern, laufende Pulse, breiteres Band, stärkeres Zucken.
11. **Rollen-Steuerung:** im gerollten Zustand lenken **Anheben/Neigen** (zieht zur Pod-Oberseite, also zur Rollseite hin), **Links/Rechts** bewegt den Pod auf/ab. Überblendet mit dem Rollwinkel. Die KI rechnet ihre Lenkung entsprechend um.
12. **Trümmer verschwinden:** von den drei herabgefallenen Bogen-/Eisblöcken zerbröseln zwei nach 11–19 s, der mittlere bleibt als Schikane.
13. **Zerstörbare Hindernisse:** Frachtkisten und kleine Felsen (r < 2,9 m) zerplatzen bei > 38 m/s; kostet 9–12 Schaden und 7 % Tempo. Trümmerpartikel, Instanzen werden aus den Meshes entfernt.
14. **Boost-Anzeige im HUD:** Hitzebalken mit schraffierter Gefahrenzone (80–100 %), „MAX" = Überhitzung, nach Überhitzung Marke „BEREIT" bei 55 %.
15. **Neue Grafik-Optionen:** LOD-Distanz (Landschaft), Gegner-Pod-Detail-Sichtweite, Wetter-Effekte (Aus/Reduziert/Voll), Volumetrie (Aus/Einfach/Voll).
16. **Grafik im Pausemenü:** gleiche Panels wie in den Einstellungen (`ui/GfxPanels.tsx`). Sofort wirksam: Sichtfeld, Render-Skalierung, LOD, Pod-Detail, Wetter-Effekte, FPS, Lautstärke (`Game.applyLiveGfx`). Alles andere: Schaltfläche „Übernehmen & neu starten".

**TODO-Punkte**
17. **Regen unter Dächern:** in Tunneln/überdachten Abkürzungen blenden Regenpartikel, Linsentropfen, Aufschlag-Spritzer, Gischt und Regengeräusch aus (`Game.cover`).
18. **Persistenter Textur-Cache (`texStore.ts`, IndexedDB):** fertige Textursätze werden gespeichert; Folgestarts lesen sie statt zu rechnen. Schlüssel enthält einen Hash des Synthese-Codes (Änderungen an `texCore.ts` verwerfen alte Einträge automatisch). Obergrenze 420 MB, älteste zuerst gelöscht. `?nocache` schaltet ab.

### Verifiziert
- `npm run check`: 14/14 Strecken, 0 NaN, 0 m Wand-Durchdringung, max. 1 Ausfall je Strecke; Banner-Selbsttest (künstlich niedrige Traverse auf Boonta): 11 Treffer registriert; KI zertrümmert 0–3 Hindernisse je Strecke; KI-„Neigen" ≤ 1,3 %.
- **UI-Layout-Test** (`tools/harness/pui.mjs`): 5 Fenstergrößen (1280×720, 1920×1080, 1024×600, 800×1000, 2560×1440) × 5 Ansichten → keine scrollbaren Elemente, nichts außerhalb des Fensters. Screenshots gesichtet (1280, 1024, 800).
- Pod-Nahaufnahmen (3 Pods): Leitungen laufen über die Gondel.
- **App-Smoke-Test** (`papp.mjs`, gebaute App): HUD-Schaden auf der richtigen Seite (intern L = 32 % → rechte Box), Boost-Balken sichtbar; **Pause: Audio-Kontext `suspended`, Master-Pegel 0 – auch nach Tastendrücken**, nach „Weiter" wieder 0,3; Grafik-Menü in der Pause öffnet, 0 scrollbare Elemente; Tasten umbelegen ok; 0 Seitenfehler.
- **Textur-Cache** (Dschungel, 1024 px, gleiche Browser-Sitzung): erster Start Texturen 8 006 ms, zweiter Start **244 ms (5 Sätze aus dem Cache)**; Weltaufbau 13,5 s → 5,4 s, Laden gesamt 18,9 s → 11,8 s.
- **Ultra-Preset** (Texturen im Test auf 1024, Render-Skalierung 0,6): WebGL2 Dschungel bei Gewitter/Nacht ohne Shader-Fehler (Textur-Limit hält), WebGPU Boonta mit Wetterfront 0 Konsolenfehler. Standard-Einstellungen WebGPU: Vulkan + Dschungel 0 Fehler.

### Nicht verifiziert
- **Fahrgefühl** von Slide und Rollen-Steuerung (nur per Simulation, nicht von Hand gefahren).
- Energieblitz, Trümmer-Zerfall, zerplatzende Hindernisse, Boost-Balken unter Last und Tunnel-Ausblendung nicht in Bewegung gesehen.
- Checkpoint-Bögen haben weiterhin keine Kollision.
- „Ultra" auf echter Hardware (Render-Skalierung 150 % + SSR + CSM ist sehr teuer).

### Befehle (neu)
1. `node pui.mjs <dist/index.html> /tmp/t/ui` – UI-Layout-Test (`SIZES=1280,800` wählt Größen).
2. `TWICE=1 LOAD_ONLY=1 node papp.mjs <dist/index.html> /tmp/t/tw '{"race":{"trackId":"jungle"}}'` – Ladezeit erster/zweiter Start (Cache).
3. `papp.mjs` prüft jetzt zusätzlich: HUD-Seiten, Ton in der Pause, Grafik im Pausemenü. Debug-Zugriff im Browser: `window.__podracer`.

---

## Stand: 2026-11-19 (Session 13) – Umwelt-Zeitleiste, Regen/Gewitter, Lichtkegel, Sound, Ladezeit, KI-Fix

### Erledigt in Session 13
1. **Umwelt-Zeitleiste (`environment.ts` neu geschrieben, `Game.applyEnv`):** Tageszeit und Wetter sind zwei unabhängige Keyframe-Spuren. `EnvTimeline.eval(raceTime)` mischt die vier Nachbarzustände (Tageszeit a/b × Wetter c/d) zu einem `EnvSnap`; `Game.applyEnv` setzt daraus Himmel, Nebel, Sonne/Mond (Richtung, Farbe, Stärke), Hemisphäre, Belichtung, Reflexionsstärke, Sterne, Wolkenlicht, Regen, Blitzrate, Wind, Haftung, Partikeldichte, Lichter.
   - **Tag-Nacht-Übergänge:** „Sonnenuntergang (Abend → Nacht)", „Sonnenaufgang (Nacht → Tag)", „Tag-Nacht-Zeitraffer" (6-Minuten-Schleife). Sonne und Mond haben eine feste Bahn je Welt; beim Wechsel Sonne ↔ Mond wird das Licht kurz auf null gedimmt und kommt aus der neuen Richtung zurück.
   - **Wetterwechsel im Rennen:** „Aufziehendes Unwetter", „Aufklarend", „Wechselhaft" (3,5-Minuten-Schleife). Ansagen: „UNWETTER/STURM ZIEHT AUF", „ES KLART AUF", „NACHT – LICHTER AN", „TAGESANBRUCH".
   - **Realismus:** Tabelle `CLIMATE` legt pro Welt fest, welches Wetter es gibt und was „ruhig"/„heftig" bedeutet. Wüste: nur Klar/Sandsturm. Eis: Klar/Schneeböen/Eisnebel. Vulkan: Klar/Smog/Aschesturm mit Vulkanblitzen (kein Regen). Stadt, Dschungel, Aquilaris, Kristall, Malastare: Klar/Regen/Gewitter/Nebel. Das Menü zeigt nur passende Einträge; gespeicherte unpassende Wahl fällt auf „Standard" zurück (`sanitizeEnv`).
   - **Fahrbahn-Nässe zur Laufzeit:** `materials.ts → WEATHER.wet` (globales Uniform). Die Straße wird in ~12 s nass und trocknet in ~50 s.
2. **Regen:** Tropfen als bewegungsunscharfe Streifen entlang ihrer Bildschirm-Geschwindigkeit relativ zur Kamera (langsam: fast senkrecht; schnell: lange Streifen an den Rändern, kurze Punkte voraus). Linsentropfen in drei Schichten: Perlen, bei wenig Tempo herablaufende Tropfen, bei hohem Tempo radial nach außen getriebene Tropfen mit längeren Spuren (`post.ts`, Phase `cine.uniforms.flow`). **Gischtfahne** hinter jedem Pod (wächst mit Tempo, `particles.spray`), **Aufschlag-Spritzer** auf der Fahrbahn vor dem Spieler (`particles.splash`).
3. **Gewitter (`weather.ts`, `audio.ts`):** Blitz mit weißem Kern + weichem Glühen, 3 Äste, 2–4 Folgeblitze (Flackern), häufiger; Einschlagglimmen + Bodenfunken bei nahen Einschlägen; Kamerawackeln bei sehr nahen. **Donner:** scharfer Knall (nah) → Schlag → rollendes Grollen mit 3–4 Wellen + Sub-Bass, eigener lauter Bus mit Echo.
4. **Scheinwerfer (`lights.ts`, `Game.updateLights`):** weiche volumetrische Lichtkegel an beiden Triebwerksnasen aller Pods (1 instanzierter Draw-Call, additiv, zur Silhouette hin ausgeblendet). Spot-Licht des Spielers folgt Lenkung und Neigung, wird mit Boost heller, flackert bei beschädigtem Triebwerk. Alle Lichter blenden mit der Dunkelheit ein/aus.
5. **Gegner-Sound:** ca. 3× lauter, Reichweite 170 m statt 80 m, zweite Harmonische + Düsenrauschen, Doppler-Verschiebung, Rudel-Grollen, Vorbeiflug-„Whoosh" (`audio.setRivals`, `audio.flyby`).
6. **Hitzeflimmern:** Amplitude 60 % kleiner, Radius halbiert, bei Renntempo auf 35 % zurückgenommen (am stärksten am Start).
7. **Ladezeit:** Textur-Synthese läuft in parallelen **Web Workern** (`texCore.ts` = reine Rechnung ohne three.js, `texWorker.ts`, Pool in `textures.ts → generateTextures`). Die Worker starten schon vor der Renderer-Initialisierung (`Game.start`). Registrierung des Inline-Workers in `main.tsx`; ohne Factory (Harness, Node) läuft alles synchron wie bisher. `?noworkers` schaltet zum Vergleich ab.
8. **KI-Fix „Neigen":** Die KI hielt „Neigen" bei jeder kleinen Kuppe und in der zweiten Hälfte jedes Sprungs. Jetzt nur noch gute Piloten, nur bei ~30 % der großen Sprünge (> 9 m über der Straße, im Sinkflug, ≥ 0,9 s in der Luft), höchstens alle 6 s, nie mit vollem Ausschlag. CI prüft den Anteil (`dive%` ≤ 1,5 %).
9. **Podracer:** 8 Lackierungs-Vorlagen im Hangar, weißglühender Nachbrenner-Strahl beim Boost, klappernde Luftbremsklappen bei schwerem Schaden, Lichtkegel.

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden. **KI-„Neigen": vorher 4,1–7,3 % aller KI-Frames (5 Strecken gemessen), jetzt 0,0–1,0 %** (alle 14).
- **Audio ohne Lautsprecher gemessen** (Analyser am Master-Bus, Headless-Chrome): Leerlauf-Spitze 0,13 · Gegner in 12 m 0,26 · Donner 0,63.
- **Ladezeit, Textur-Synthese 6 × 1024 px isoliert:** Hauptthread 7,6 s → 2 Worker 4,3 s (Sandbox hat 2 Kerne). **In der App in dieser Sandbox nur ~9 % schneller** (gesamt 19,1 s → 17,4 s), weil das Software-Rendering beide Kerne mitbelegt.
- `npm run check:gpu` (WebGPU), 0 Konsolenfehler: Dschungel + Boonta (Wechselhaft × Zeitraffer, t = 180 s), Vulkan + Ando Prime (Aufziehend × Sonnenuntergang, t = 70 s), Stadt mit Ultra + CSM + Gewitter + Nacht.
- **App-Smoke-Test** (`papp.mjs`, gebaute App mit Textur-Workern, Stadt bei Sonnenuntergang + aufziehendem Unwetter): Menü → Rennen → 90°-Rolle → Tasten umbelegen, 0 Seitenfehler; Menü zeigt die neuen Einträge.
- Standbilder gesichtet (WebGL2): Sonnenuntergang auf Boonta bei 0 / 55 / 100 s (Abendrot → Dämmerung mit ersten Sternen → Nacht mit Scheinwerferlicht auf der Piste), Sandsturm auf Boonta, Dschungel-Gewitter in Fahrt (Regenstreifen laufen richtig vom Fluchtpunkt weg, nasse Fahrbahn, Linsentropfen), Aschesturm auf der Vulkanwelt, klare Nacht auf Ando Prime (Scheinwerfer der Pods als Lichtpunkte).

### Nicht verifiziert
- **Ladezeit-Gewinn auf echter Hardware** (GPU + ≥ 4 Kerne) – nur hochgerechnet, nicht gemessen.
- **Klangqualität** (nur Pegel gemessen, nicht gehört); Doppler und Vorbeiflug-Whoosh gar nicht.
- **In Bewegung nicht gesehen:** Blitz-Mesh mit Folgeblitzen, radiale Linsentropfen bei hohem Tempo, Gischtfahne, Aufschlag-Spritzer, Lichtkegel (im Nachtbild nur das Spot-Licht erkennbar), Nachbrenner, klappernde Klappen.
- Übergänge nur als Einzelbilder, nicht als durchgehender Verlauf; „Sonnenaufgang" und „Aufklarend" gar nicht gesichtet.
- Bildrate auf echter GPU.

### Befehle (neu)
1. `npm run save -- "Nachricht"` · `npm run restore-git`
2. Harness: `?webgl&tod=sunset&rt=55`, `?webgl&wx=changing&rt=100`, `tod=cycle`, `wx=front|clearing`; `pshot.mjs … "audio"` (Pegeltest), `"tex:1024"` (Textur-Benchmark, braucht `out/texWorker.js`: `npx esbuild ../../src/game/texWorker.ts --bundle --format=iife --outfile=out/texWorker.js`).
3. App-Ladezeit: `LOAD_ONLY=1 node papp.mjs <dist/index.html> /tmp/t/ld '{"race":{"trackId":"jungle"}}'` (mit `QUERY='?noworkers'` zum Vergleich) → Zeile `[load] …`.

---

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
