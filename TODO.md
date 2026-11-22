# TODO

## Aus dem Merge von Session 20 (Strecken) und Session 20 (Pods) (2026-11-22)
- [x] **Tunneldecke je Pod** – erledigt im Folge-Commit: gemessener Kasten je Pod (`POD_BOX`), `podHeight`, zwei Unit-Prüfungen, Audit-Spalte `box` (`HANDOFF.md` → „Tunneldecke je Pod")
- [ ] Tunneldecke, Rest: sie wird über der Pod-Mitte geprüft – an der Flanke kann die äußere Triebwerksseite weiter ins Gewölbe reichen; Nicken ist nicht eingerechnet → an drei Punkten prüfen (Cockpit, beide Triebwerksseiten)?
- [ ] Überkopf-Bauten (Sponsor-Brücken, Startportal, Bögen) rechnen mit festen 1,5 m Pod-Höhe (`physics.ts`, `ext`) → `podHeight` verwenden
- [ ] Entscheidung prüfen: ein Pod zählt so hoch wie seine größte Ausstattung (Aurora XR-7 ab Werk 0,70 m mehr, als sie ist) – oder Höhe je montierter Ausstattung?
- [ ] Sichtprüfung im Browser: einen hohen Pod (Vrak Splitter-X) im Tunnel an die Decke fliegen
- [ ] `tools/harness/papp.mjs` schreibt und liest noch den Profil-Schlüssel `podracer-profile-v1` → auf v2 umstellen (die Zeile „stored:" gibt sonst `undefined` aus und prüft nichts)
- [ ] `tools/` ist nicht im Typecheck: 4 Typfehler in `tools/ci/unit.ts` (Parametertyp von `triCount`, Zeilen 41 / 59 / 140 / 145) – beheben und `tools/ci`, `tools/harness` in `tsconfig.json` aufnehmen?

## 0. Direkt aus Session 20 (Strecken)
- [ ] **Probefahrt + FPS-Messung auf echter GPU** (weiter offen – die Sandbox rendert nur in Software): durchgehende Höhlen und Gabelungen, neue Tunnelhöhen (27–30 m), See-Passagen, Untergrund-Physik (ist Eis mit −25 % Haftung fair?), Oovo-Mond
- [ ] **HQ-Farne:** Wedel als Alpha-Karten mit Textur in `groundCover.ts` (Schneekiefern, Felsbrocken, Kakteen sind erledigt)
- [ ] **Höhlen-Optik prüfen:** Felsschichtung läuft am Gewölbe stark gebogen (Textur folgt dem Bogen); Vulkan-Höhle ist ohne Zusatzlicht fast schwarz – ggf. mehr Glutadern/Lampen
- [ ] **Schnee-Fotoset:** zeigt auf Ando Prime fußspurartige Flecken – ggf. anderes CC0-Set (`tools/photos/pbr.py`)
- [ ] **Fahrbahn faltet sich in sehr engen Knicken weiter offener Flächen** (halbe Breite > Kurvenradius; besteht seit Session 18): Boonta 3462–3487 (Breite/Radius 2,8) und 2159–2178, Mos Espa 4671–4692, Aquilaris 4521–4534. Anzeige: `tools/ci/info.ts`, Zeile `fold`. Lösung in `trackBuilder.ts → controlPoints` (Breite an den Radius koppeln oder Knick entschärfen)
- [ ] **Build-Größe 17,5 MB** (Fotosets): optional WebP/AVIF oder 512-px-Sets für die Voreinstellung „Niedrig"
- [ ] **Aufräumen:** `tools/harness/out/game.js` (19,6 MB Build-Artefakt) ist getrackt – aus dem Repo nehmen; `world.ts → place()`: der Früh-Ausstieg `if (count <= 0)` steht versehentlich hinter einem Kommentar

## 1. Session 20 (Pods) – Pod-Überholung (alle Phasen fertig; Phasen und Entscheidungen in `HANDOFF.md`)
- [x] **Phase 0 – Setup + Sicherheitsnetz:** Node, Ausgangsmessung, Sichtprüfung im In-App-Browser, `podAssembly.ts`, Pod-Audit in `npm run check`, `CONTEXT.md`, ADR 0001/0002
- [x] **Phase 1 – Refactoring ohne Spieländerung:** Layout-Registry, `engineExtent`, `podCockpits.ts`, `applyDamage`, Profil v2, Unit-Prüfungen
- [x] **Phase 2 – 10 neue Cockpits + Details + Cockpit-Innenansicht** – wartet auf die Sichtung durch den Nutzer („Ultra" am Gaming-PC testen)
- [x] **Nachbesserung aus der Sichtung: Cockpits weiter oben** (0,6–1,05 m, über der Triebwerkslinie; Fahrverhalten unverändert über `keel`) – Höhe bestätigt der Nutzer anhand `tools/harness/out/p2_hoeher_*.jpg`
- [ ] Cockpit-Innenansicht in einem Tunnel sichten (Regen und 90°-Rolle sind gesichtet)
- [x] **Phase 3 – 4 neue Pods:** Cyclone, Halo, Manta, Voltspire, Gegner-Auslosung aus 13, Hangar-Liste für 14, wanderndes CI-Startfeld – vom Nutzer freigegeben, Quill Voltspire danach geschlossener gebaut
- [ ] Langlauf `SECS=120`: vereinzelt „downward teleport" (schon vor Phase 3). Seit Phase 5 genauer: ein Respawn wird nicht mehr mitgezählt; übrig bleibt der Tunnel-Fall unten
- [x] **Phase 4 – Tuning-Optik:** Tuning-Teile (7 Werte × 2 Stufen) + Style-Teile (Finnen, Einlass, Düse, Kanzel), Hangar-Reiter „Lack | Teile", Gegner mit ausgelosten Style-Teilen
- [ ] Teile-Kombinationen am Gaming-PC durchklicken (gesichtet sind 7; Maße und Dreiecke prüft das Audit an drei Sätzen je Pod)
- [x] **Phase 5 – Schadensmodelle, Fahrverhalten:** Panzerzonen + je drei Bruchteile pro Seite für alle 14 Racer, HUD-Lampen, Meldungen, CI-Schalter `ARMOR=0 PARTS=0`
- [x] **Phase 6 – Schadensmodelle, Optik:** Bruchteile fallen sichtbar ab (auch bei Gegnern, ohne zusätzliche Zeichenaufrufe), Triebwerke fallen aus, Blitze erlöschen, Treffermarken, Trümmer in Pod-Farben, Schadens-Vorschau im Hangar
- [x] **Phase 7 – Gegner:** Ruß und sterbende Flammen in den geteilten Materialien (je Mesh, eine Pipeline), Pipeline-Zählung unverändert (100), WebGL2-Lauf fehlerfrei
- [ ] **Am Gaming-PC prüfen (Nutzer):** „Ultra"-Bildrate mit vollen Details + Teilen + Schaden; Schadens-Balance fahren
- [ ] Dampf- / Ölstrahlen je Modell (Fireflare-Radiator, Kühlschleifen) – im Plan vorgesehen, nicht gebaut
- [x] Flache Bleche glühten bei Hitze wie die Düse – behoben: jedes Rumpfteil in Grund- oder Zweitfarbe trägt seine Lage längs des Triebwerks (`heatAlong`)
- [x] **Abschluss-Durchsicht eingearbeitet:** Treffermarken sitzen exakt (Lage des aktuellen Schritts), schlagen nicht mehr auf die Klappen durch, Kit-Lichter gehen mit dem Triebwerk aus, Bruchteil-Prüfungen auch für Gegner und Teile-Sätze (69 Unit-Prüfungen)
- [ ] **Entscheidung des Nutzers:** sollen frontale Wandtreffer als Zone „Front" zählen (dann helfen Rammbug und harte Nase auch an der Wand)? Heute zählt jede Wand als „Seite"
- [ ] Kleinigkeiten aus der Durchsicht (Liste in `HANDOFF.md` → „Zurückgestellt"): Halo-Abschlussplatten 4 cm durch die Ringhaut · Treffermarken bei Manta / Halo / Cyclone auf dem Kernradius · keine Marke bei der Hälfte der Pod-Kontakte · Hangar baut das Modell bei jedem Tuning-Klick neu · toter Code (`cockpit.style`, `cockpitExtras`) · `loadProfile` prüft `difficulty` / `laps` nicht
- [ ] In der ersten Rennsekunde werden 3 Pipelines nachübersetzt (Welt-Meshes, keine Pods) – ins Aufwärmen nehmen?
- [ ] Schadens-Balance von Hand fahren (bisher nur KI-Sim): sind 5–10 % je Bruchteil richtig?
- [ ] Tunnel-Logik: ein Pod kommt aus einem Sprung hoch über der Straße in den Tunnel und gilt als „im Tunnel" (Malastare, Sample 964). Seit dem Merge wird er nicht mehr umgesetzt, sondern sanft unter die Decke gedrückt (im 45-s-Lauf gemessen: 20,8 m über der Straße, 3 Bilder, 1,26 m). Offen ist nur noch, ob er dort nicht aufs Deck gehört: `p.upper` entscheidet mit Pod-Mitte + 1,2 m
- [ ] `tools/harness/pui.mjs:39` prüft noch die gelöschte „Neon-Spirale" → anpassen; `tools/harness/run.sh` läuft nur unter Linux

## Erledigt (Session 20 (Strecken) – Höhlen, „Balken", Tunneldecken, Untergründe, Seen, Oovo-Mond, PBR-Fotosets, HQ-Assets)
- [x] **Bugs behoben:** „Balken" in Schrägkurven (Pfeilerkappen folgen der Überhöhung), Tunneldecken +6,5–7,5 m mit breitem Gewölbe (Superellipse) und Kamera im Gewölbe, Höhlen durchgehend und an Gabelungen verschmolzen
- [x] **25 Untergründe mit eigener Fahrphysik** auf allen 13 Strecken (Eis, Pulverschnee, Dünen, Schlamm, Lava …), HUD-Zeile, Staubfahne in Untergrundfarbe
- [x] **Seen und Plateaus als offene Passage:** Eissee, Lavasee, Methansee, Sumpf, Spiegelsee, Meer (Aquilaris), Felsplateau
- [x] **Oovo IV:** Mondoberfläche mit Kratern, Stationsdecks, Gasriese am Himmel
- [x] **15 PBR-Fotosets (CC0, 1024 px)** mit echten Normal-Maps: Fels, Klippe, Sand, Schnee, Pulverschnee, Eis, Lava, Asche, Waldboden, Schlamm, Kies, Riff, Regolith, Metallplatten, rissiger Lehm
- [x] **HQ-Assets:** Schneekiefern mit Nadel-Karten, Felsbrocken mit Displacement aus der Textur-Höhe, Kakteen mit Rippen-/Dornen-Haut
- [x] **Textur-Cache gibt alte Welten frei**, Strecken-Dump `tools/ci/info.ts`, Harness-Ansichten (Sonde, Dekor-Nahaufnahme, Bench)

## Erledigt (Session 19 – Bugfixes, Brücken/Kreuzungen, Schleusen, verzweigte Höhlen, Pod-Aufwertung)
- [x] **Bugs behoben:** hohe Tunneldecken (Ando Prime 22,5 m, Aquilaris 19,5 m, Höhlen bis 38 m), C¹-stetiger Talnebel ohne schwebende Schicht am Hang, straßenkonforme Bodenplatten/Ladepads/Vents, tief verankerte Bögen & Strecken-Assets, saubere Abkürzungs-Einmündung auf Dschungelfluss-Sprint
- [x] **Ökumenopolis (`city`/`neon`) entfernt** (13 Strecken auf 8 Planeten, Profil-Fallback aktiv)
- [x] **Feinere fraktale Gewitterblitze** (64-Segment-Hauptkanal, 5 Hauptäste, 7 Haarverästelungen)
- [x] **Strecken-Über-/Unterführungen:** 12 Brücken-/Tunnel-Kreuzungen (Δy = 35–41 m) mit Hohlkasten-Viadukten, Widerlagern, Pfeilern und Unterführungs-Tunneln + Kartendarstellung
- [x] **Futuristische Schleusen/Tore** statt Fallgitter (3-spurige Panzerschotts mit Plasma-Dichtnaht, in Fels/Eis/Kristall/Stationsbau der Karte integriert)
- [x] **Höhlen verzweigt & Kammern verbreitert:** echte zweite Höhlenröhre mit Wiedervereinigung + Gabelpfeiler (Vulkan ×2, Ando Prime, Kristall, Dschungel) und Höhlenboden-Mesh
- [x] **Podracer-Aufwertung:** 6 Lackiermuster + 3 Lackfinishes + 8 Vorlagen im Hangar, individuelle Alien-Pilotenköpfe/-Helme, feinere Triebwerks-/Cockpit-Details, seitengetrennte lose Schadensklappen, Hitzeflimmern auch für Gegner-Pods
- [x] **Git-Sicherung in `.archive/`** (`git`-Ordnerkopie + Base64-Textarchiv + Wiederherstellungsskripte), `canwelk.html` → `.archiv/`

## 2. Strecken & Spieltiefe
- [ ] **Meisterschafts- / Cup-Modus:** 4-Rennen-Serien mit Gesamtpunkten und Siegerehrung
- [ ] **Geist-Fahrzeug (Time Trial):** beste eigene Runde als transparenter Holo-Pod speichern
- [ ] **Mini-Karte erweitern:** Abkürzungen, Gefahrenzonen und Set-Pieces als Symbole auf dem gecachten Minimap-Layer

## 3. Performance & Tooling
- [ ] **`npm run check` in GitHub Actions** (Push auf `B`), `check:gpu` als optionaler Job
- [ ] **Harness:** WebGPU-Screenshots im headless Chrome reparieren (weiß; nur Konsolencheck möglich)
- [ ] **Fern-LOD auch für Tafelberge**, falls die Messung es rechtfertigt (Kiefern und Felsbrocken haben seit Session 20 einen Zwilling)

## Erledigt (Session 18 – Erweiterung, Höhlen, HQ-Bäume, Foto-Texturen)
- [x] **Alle Strecken länger** (7,0–13,9 km), **mehr Kurven** (eingefügte S-Kurven), **offene Flächen** (bis ~108 m breit)
- [x] **Längere Tunnel** (260–560 m, Unterwasser 650–840 m), **Höhlensysteme mit Kammern** auf Vulkan, Ando Prime, Kristall
- [x] **Mehr Deko** (dichteabhängig von der Streckenlänge), mehr Landmarken
- [x] **HQ-Bäume:** Blattwerk-Karten + echte Rinde
- [x] **Echte Foto-Texturen** für Fels, Sand, Boden, Rinde

## Erledigt (Session 17 – Tunneldecks, Unterwasser, Höhle, Quadra, Überziehen, Pendel)
- [x] **Kein Teleport mehr:** befahrbares Tunneldeck + Erdwall; Tunnel vor Hindernissen platziert
- [x] **Aquilaris:** 2 Unterwassertunnel mit Ozean-Fenstern, keine Schanzen davor
- [x] **Magma-Inferno:** Höhlensystem (3 Teile, 2 Lichtschächte), keine Schanzen davor
- [x] **Quadra Lumber** 2×2 schlanke Triebwerke + X-Energieblitz; **Blitze feiner und mehrfach**
- [x] **Boost überziehen** (3 s gegen Schaden), **Hitzeglühen als Anzeige** mit Funken
- [x] **Cockpit-Pendel**, **Ego-Ansicht ohne halbes Cockpit**, **mehr Triebwerkshub**
- [x] **Staub/Gischt am eigenen Pod sichtbar** und stärker, **Spiegelungs-Auflösung einstellbar**, **Zero-G zentrierter**

## Erledigt (Session 16 – Klappen, Bögen, Start, Tunnel, Sci-Fi, Zero-G, Wetter, Gamepad)
- [x] **Düsenklappen** öffnen beim Boost (Spieler + Gegner); Bremsklappen nur bei Luftbremse; **Startnummern entfernt**
- [x] **Kollision für Felsbögen und Einsturz-Bögen**; Tunnel-Decken
- [x] **KI-Start-Disziplin** (Berührungen Ø 8,3 → 2,6), Startreihen weiter auseinander
- [x] **Heck-Drift**, **Schwerelosigkeit** (frei schweben, +28 % Tempo), **stärkeres Wetter**
- [x] **Tunnel auf allen Strecken** (2–4), **Sci-Fi-Ausstattung** (Leitstreifen, Holo-Tafeln, Baken, Energieleitungen, Metall-Deck auf Malastare)
- [x] **Gamepad-Belegung im Menü**, **Volumetrie + Textur-Filter live**, **Tribünen-Fundament / Landmarken am Hang**
- [x] CSM ist im Ultra-Preset aktiv (seit Session 14)

## Erledigt (Session 15 – Bugfixes, Drift, Staub, Live-Grafik)
- [x] **Schmier-Textur behoben** (Fahrbahn-UV segmentweise), **Trümmer deckend** (Eis, Bogen-Deckel, solide Brocken)
- [x] **Einheitliche UI-Skalierung** auf allen Ansichten, **Objekte sitzen am Hang auf**
- [x] **Spiegelungen (SSR) in Pfützen/auf nasser Fahrbahn**, SSR in „Hoch" aktiv
- [x] **Staubfahnen / Gischt** hinter allen Pods, **Boost-Klappen**, **Startnummern**
- [x] **Mehr Drift**, **stärkere Rollen-Lenkung**
- [x] **Kollision für Checkpoint-Bögen**, **Grafik-Optionen live** (Effekte, Schatten, AA, Partikel, Sichtweite)

## Erledigt (Session 14 – Bugfixes, UI, Steuerung, Hindernisse, Cache)
- [x] **Bugs:** Slide weicher/progressiv, HUD-Schaden L/R, Klappen-Klappern, Leitungen durchs Triebwerk, Ton in der Pause, Banner zu niedrig + Kollision
- [x] **Responsive UI ohne Scrollbalken** (`Fit`, Container-Queries, Reiter, kompakte Streckenliste, skalierendes HUD)
- [x] **Planeten-Filter**, **Ultra = alles Maximum**, neue Grafik-Optionen (LOD, Pod-Detail, Wetter, Volumetrie), **Grafik im Pausemenü**
- [x] **Rollen-Steuerung** (Anheben/Neigen lenkt, Links/Rechts = auf/ab), **stärkerer Energieblitz**
- [x] **Zerstörbare Hindernisse**, **Trümmer verschwinden teilweise**, **Boost-/Überhitzungsanzeige**
- [x] **Regen unter Dächern aus**, **persistenter Textur-Cache** (IndexedDB)
- [x] Git-Sicherung als Textkopie (einzige Variante, die Download/Neustart übersteht)

## Erledigt (Session 13 – Zeitleiste, Regen/Gewitter, Licht, Sound, Ladezeit, KI)
- [x] **Tag-Nacht-Übergänge** (Sonnenuntergang, Sonnenaufgang, Zeitraffer) und **Wetterwechsel im Rennen** (Aufziehend, Aufklarend, Wechselhaft)
- [x] **Wetter passend zur Welt** (kein Schnee in der Wüste, kein Regen am Vulkan; Menü zeigt nur Passendes)
- [x] **Regen:** tempoabhängige Streifen und Linsentropfen, Gischtfahnen, Aufschlag-Spritzer, Straße wird nass und trocknet
- [x] **Gewitter:** Blitz mit Kern/Glühen/Folgeblitzen, lauter Donner (Knall, Schlag, Grollen), Bodenfunken
- [x] **Scheinwerfer:** volumetrische Lichtkegel, dynamisches Spot-Licht
- [x] **Gegner lauter** (Reichweite 170 m, Doppler, Vorbeiflug), **Hitzeflimmern dezent**
- [x] **Textur-Synthese in Web Workern**, Start schon vor der Renderer-Initialisierung
- [x] **KI-„Neigen" behoben** (4,1–7,3 % → ≤ 1,0 % der Zeit), CI-Grenzwert
- [x] **Podracer:** Lackierungs-Vorlagen, Nachbrenner, klappernde Klappen bei Schaden
- [x] **Git-Kopien in `.archiv/repo-sicherung/`** (Ordner, Bundle, Base64-Text) + `npm run restore-git`

## Erledigt (Session 12 – Tastenbelegung, HUD, Nachtlichter, Wetterfront)
- [x] **Tastenbelegung im Menü** mit 2 Presets (Standard / Klassisch) und freiem Umbelegen
- [x] **HUD:** Fluglage-Anzeige (Rolle, Anheben/Neigen, Slide-Ladung) + Wetter-/Tageszeit-Zeile
- [x] **Nachtlichter:** Scheinwerfer, Positionslichter, Blitzlicht an allen Pods; Spot-Scheinwerfer am Spieler
- [x] **Wetter „Aufziehendes Gewitter"** mit Laufzeit-Überblendung; Blitz-Einschlagglimmen
- [x] **Hitzeflimmern** hinter den Düsen des Spieler-Pods
- [x] **App-Smoke-Test** (`papp.mjs`), `npm run save` (Commit + Bundle, übersteht Sandbox-Resets)

## Erledigt (Session 11 – Atmosphäre, Wetter, Sound, Mechanik)
- [x] **5 Tageszeiten × 7 Wetterlagen** wählbar; jede Welt mit eigenem Standardwetter
- [x] **Volumetrischer Höhennebel** mit driftenden Bänken; **Sonnenblendung/Lens-Flare**; God-Ray-Spiegelfehler behoben
- [x] **Regen:** Linsentropfen, Streifen, Gischt; **Gewitter:** Blitz-Mesh, Wolkenleuchten, Donner; **Böen:** Schnee/Staub/Nebel
- [x] **Sound:** Kompressor, Whine, Sub, Düsenrauschen, Slide, Regen, Wind, Donner, Echo
- [x] **Mechanik:** Relaistürme mit gegenläufigen Ringen, Patrouillen-Drohnen
- [x] **Strecken +18 % breiter**, Basalt-Textur, Nachtwolken, Slide-Fahne, Rollen-Kondensstreifen
- [x] **Pod-zu-Pod-Kollision** rollbewusst + in der Node-Sim; lokales Git + Bundle-Sicherung

## Erledigt (Session 10 – Performance, CI, Flugsteuerung, Steigungen & Schrägkurven)
- [x] **TODO §3 komplett:** GPU-Partikel (Vertex-Shader-Simulation, 0 CPU-Schleife), Kaskaden-Schatten (Opt-in), CI `npm run check` + `npm run check:gpu`
- [x] **Fern-LOD** für Bäume (1 347 → 368 Dreiecke) und Felsnadeln (1 078 → 539)
- [x] **Neue Steuerung:** WASD, Leertaste Luftbremse/Slide, Pfeile = Rolle/Neigen/Anheben, Shift Boost
- [x] **Flugphysik:** Handbrems-Slide, Anheben/Neigen (Sprungweite 102–324 m), 90°-Rolle mit schmaler Kollision, Triebwerke heben ohne Kippen, exakter Boden-Clamp
- [x] **KI nutzt** Gleiten, Abtauchen, Hochkant-Rolle und Slides
- [x] **Alle 14 Strecken:** Steigungen bis 11–17 %, Schrägkurven bis ≈ 21°

## Erledigt (Session 9 – Landschafts-Assets, Fels-Textur, Startportal)
- [x] `decorGeo.ts`: Brocken, Hoodoos, Tafelberge, Dschungelbäume, Schneekiefern, Kristall-/Eis-Cluster, Saguaros, Luftschiffe, Energiemasten
- [x] Fels-Textur ohne Ziegelmuster (verzerrte Klüfte, Feinschichtung, Tafoni)
- [x] Startportal mit Fachwerk-Traverse, kannelierten Türmen, Abspannseilen, Zeitentafel
- [x] Stadt-Megablöcke/Türme mit Rücksprüngen und Decks, detailliertere Pod-Wracks
- [x] Puppeteer-Harness `pshot.mjs` mit Kontaktbogen, `.gitignore`

## Erledigt (Session 8 – Start-Lag, Grafikfehler, Hindernisse, Sicht & Triebwerks-Physik)
- [x] **Rennstart-Lag behoben:** volles GPU-Warmup (`scenePass.compileAsync` + 2 Pre-Render-Frames + `onSubmittedWorkDone` vor Countdown), geteilte Gegner-Pod-Pipelines (**64 → 11 TSL-Pipelines, 120 → 31 Materialien**), Kamera-Größenlimit auf Partikeln (kein Fullscreen-Overdraw), Half-Res-Bloom, 0-ms-`textShadow` im Countdown
- [x] **Restliche Grafikfehler behoben:** artefaktfreies symmetrisches `textureLoad`-Depth-AO & -God-Rays (0 WGSL-Uniformity-Fehler, 0 Streifen/Halos), `StaticBatcher` auf 580-m-Meshes statt `BatchedMesh`, 128×-TBN mit Silhouetten-Schutz, rissfreie Straßen-/Wandnähte, überschneidungsfreier Busch-Kuppel-LOD
- [x] **Hindernisse reduziert & markiert:** ~55 % weniger Steine/Hindernisse (Ø 7,5/Strecke, ≥ 52 m Abstand, frei vor Rampen/Landungen) + leuchtende Bodenringe, Warnstreifen & hohe Warnbaken
- [x] **Freie Sicht hinter Vordermännern:** kein Rauch aus intakten Düsen, flacher transparenter Staub (unter 24 m vor Kamera aus), gedämpfter Schadensrauch + Kamera-Nahfade
- [x] **Bodenkollision & aktive Triebwerks-Aufhängung:** `HOVER = 2,85 m`, 5-Punkt-Repulsor-Kollision + Straßensteigungs-Pitch (0 Boden-Clipping, mind. `+0,81 m` Freiheit auf allen 10 Pods) sowie dynamisches Auf-/Abschwingen der Triebwerke beim Lenken (0,99–1,78 m Hub inkl. schrägem Energie-Binder & biegsamen Steuerseilen)

## Erledigt (Session 6–7)
- [x] Pod-/Welt-/Schatten-Optimierung, Reflexions-Entflackerung, Strecken-/Landschafts-Texturen & Detail-Normalmaps, Wasser-/Lavafälle, Energiefeld, neue Set-Pieces (`boulder/bridge/icefall`), Korridor-KI (`deaths=[]`), Tierwelt & Welt-Sound
