# TODO

## 1. Als Nächstes (Podracer & Ladezeit)
- [ ] **Podracer-Aufwertung:** Livery-Vorlagen & Startnummern im Hangar, Triebwerks-Hitzeflimmern (TSL-Distortion hinter Düsen)
- [ ] **Schadensgeometrie & Pilot-Spezies:** sichtbare lose Klappen bei niedrigen HP, individuelle Pilotenköpfe im Cockpit
- [ ] **Textur-Synthese im Web Worker:** `generateTexture` off-main-thread auslagern für verzögerungsfreien Ladebalken

## 2. Strecken & Spieltiefe
- [ ] **Meisterschafts- / Cup-Modus:** 4-Rennen-Serien mit Gesamtpunkten und Siegerehrung
- [ ] **Geist-Fahrzeug (Time Trial):** beste eigene Runde als transparenter Holo-Pod speichern
- [ ] **Mini-Karte erweitern:** Abkürzungen, Gefahrenzonen und Set-Pieces als Symbole auf dem gecachten Minimap-Layer

## 3. Performance & Tooling
- [ ] **Partikel-Simulation als WebGPU-Compute:** dynamische Abgas-/Funken-Pools auf GPU-Compute heben
- [ ] **Cascaded Shadow Maps (CSM):** zweite weite Schattenkaskade für ferne Schluchtwände
- [ ] **Automatischer CI-Check:** 14-Strecken-Physik-Sim + 3D-Bodenfreiheits- & WGSL-Uniformity-Check als npm-Skript

## Erledigt (Session 8 – Start-Lag, Grafikfehler, Hindernisse, Sicht & Triebwerks-Physik)
- [x] **Rennstart-Lag behoben:** volles GPU-Warmup (`scenePass.compileAsync` + 2 Pre-Render-Frames + `onSubmittedWorkDone` vor Countdown), geteilte Gegner-Pod-Pipelines (**64 → 11 TSL-Pipelines, 120 → 31 Materialien**), Kamera-Größenlimit auf Partikeln (kein Fullscreen-Overdraw), Half-Res-Bloom, 0-ms-`textShadow` im Countdown
- [x] **Restliche Grafikfehler behoben:** artefaktfreies symmetrisches `textureLoad`-Depth-AO & -God-Rays (0 WGSL-Uniformity-Fehler, 0 Streifen/Halos), `StaticBatcher` auf 580-m-Meshes statt `BatchedMesh`, 128×-TBN mit Silhouetten-Schutz, rissfreie Straßen-/Wandnähte, überschneidungsfreier Busch-Kuppel-LOD
- [x] **Hindernisse reduziert & markiert:** ~55 % weniger Steine/Hindernisse (Ø 7,5/Strecke, ≥ 52 m Abstand, frei vor Rampen/Landungen) + leuchtende Bodenringe, Warnstreifen & hohe Warnbaken
- [x] **Freie Sicht hinter Vordermännern:** kein Rauch aus intakten Düsen, flacher transparenter Staub (unter 24 m vor Kamera aus), gedämpfter Schadensrauch + Kamera-Nahfade
- [x] **Bodenkollision & aktive Triebwerks-Aufhängung:** `HOVER = 2,85 m`, 5-Punkt-Repulsor-Kollision + Straßensteigungs-Pitch (0 Boden-Clipping, mind. `+0,81 m` Freiheit auf allen 10 Pods) sowie dynamisches Auf-/Abschwingen der Triebwerke beim Lenken (0,99–1,78 m Hub inkl. schrägem Energie-Binder & biegsamen Steuerseilen)

## Erledigt (Session 6–7)
- [x] Pod-/Welt-/Schatten-Optimierung, Reflexions-Entflackerung, Strecken-/Landschafts-Texturen & Detail-Normalmaps, Wasser-/Lavafälle, Energiefeld, neue Set-Pieces (`boulder/bridge/icefall`), Korridor-KI (`deaths=[]`), Tierwelt & Welt-Sound
