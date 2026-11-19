# TODO

## 0. Direkt aus Session 15
- [ ] **Probefahrt:** Drift-Stärke, Rollen-Lenkung, Staubfahnen-Dichte, Spiegelungen bei Regen, Live-Umschalten der Grafik
- [ ] **Boost-Klappen auch bei Gegnern** (GPU-Vertexanimation im geteilten Gegner-Material) + Pilotenköpfe
- [ ] **Restliche Grafik-Optionen live** (Volumetrie, Kaskaden-Schatten, Anisotropie) – brauchen Material-Neuaufbau
- [ ] **Tribünen/Landmarken am Hang** auf tiefsten Standpunkt setzen (Dekor/Props/Türme sind erledigt)
- [ ] **Gamepad-Belegung im Menü** + Touch-Steuerung

## 1. Als Nächstes (Podracer & Ladezeit)
- [ ] **Podracer-Aufwertung:** Livery-Vorlagen & Startnummern im Hangar; Hitzeflimmern auch für Gegner-Pods
- [ ] **Schadensgeometrie & Pilot-Spezies:** sichtbare lose Klappen bei niedrigen HP, individuelle Pilotenköpfe im Cockpit

## 2. Strecken & Spieltiefe
- [ ] **Meisterschafts- / Cup-Modus:** 4-Rennen-Serien mit Gesamtpunkten und Siegerehrung
- [ ] **Geist-Fahrzeug (Time Trial):** beste eigene Runde als transparenter Holo-Pod speichern
- [ ] **Mini-Karte erweitern:** Abkürzungen, Gefahrenzonen und Set-Pieces als Symbole auf dem gecachten Minimap-Layer

## 3. Performance & Tooling
- [ ] **CSM standardmäßig auf „Ultra"** – erst nach FPS-Messung entscheiden (aktuell Opt-in)
- [ ] **`npm run check` in GitHub Actions** (Push auf `B`), `check:gpu` als optionaler Job
- [ ] **Harness:** WebGPU-Screenshots im headless Chrome reparieren (weiß; nur Konsolencheck möglich)
- [ ] **Fern-LOD auch für Kiefern/Tafelberge**, falls die Messung es rechtfertigt

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
