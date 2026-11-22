# TODO

Nur offene Punkte, nach Thema. Erledigtes steht im Verlauf: `docs/verlauf/`, je Sitzung unter „Erledigt".

## 1. Am echten Gerät prüfen (Nutzer) – in der Sandbox rendert nur Software
- [ ] **Probefahrt + FPS-Messung auf echter GPU** (weiter offen – die Sandbox rendert nur in Software): durchgehende Höhlen und Gabelungen, neue Tunnelhöhen (27–30 m), See-Passagen, Untergrund-Physik (ist Eis mit −25 % Haftung fair?), Oovo-Mond
- [ ] **Auf echter GPU ansehen:** einen hohen Pod (Vrak Splitter-X) im Tunnel an die Decke fliegen – und in eine Sponsor-Brücke und einen Checkpoint-Bogen. Die echten Überkopf-Bauten entstehen erst mit der Welt; geprüft ist die Regel nur an einer künstlichen Brücke und einem künstlichen Bogen
- [ ] **Am Gaming-PC prüfen (Nutzer):** „Ultra"-Bildrate mit vollen Details + Teilen + Schaden; Schadens-Balance fahren
- [ ] Teile-Kombinationen am Gaming-PC durchklicken (gesichtet sind 7; Maße und Dreiecke prüft das Audit an drei Sätzen je Pod)
- [ ] Cockpit-Innenansicht in einem Tunnel sichten (Regen und 90°-Rolle sind gesichtet)
- [ ] Schadens-Balance von Hand fahren (bisher nur KI-Sim): sind 5–10 % je Bruchteil richtig?
- [ ] **Neu seit dem 2026-11-22 – ansehen / probefahren:** (1) frontal in eine Felswand mit Mandrel Ram und Vrak Splitter-X: schützt die Nase spürbar, ein Streifer nicht? (2) Brandmarken bei Dorn Manta, Lyss Halo-9, Tarn Cyclone: sitzen sie jetzt auf Flanke, Ring und Rotor-Reif? (3) Lyss Halo-9 mit verlorenen Ringsegmenten aus der Nähe: Schnittkanten sauber? (4) Start eines Rennens: kein Ruckler mehr im ersten Bild des Countdowns (Einstellung „Hoch" oder „Ultra", WebGPU)

## 2. Entscheidungen des Nutzers
- [ ] Entscheidung offen: `npm run save` endgültig entfernen oder wieder einschalten? (2026-11-22, Nutzer: vorerst **abgeschaltet lassen**)
- [ ] Soll der Web-Build (`npm run build:web` → `build/`) online gestellt werden – Vercel, GitHub Pages? Er ist gebaut und über einen lokalen Server getestet, aber nirgends hochgeladen

## 3. Tunnel, Decke, Überkopf-Bauten
- [ ] Bögen (Checkpoint-Bögen, Felsbögen, einstürzender Bogen) werden an der seitlichen Position der Pod-Mitte gelesen, ihre Kollisionsform ist dafür gepolstert → Eckpunkt für Eckpunkt prüfen? Dafür müssten die Bogenformen neu vermessen werden
- [ ] Ein Pod, der auf seinen Repulsoren fährt, wird von der Decke nie heruntergedrückt: im Messerflug direkt neben der Tunnelwand kann die obere Flügelspitze im Fels stehen (gemessen: bis 4,16 m) → den Messerflug nahe der Wand begrenzen oder hinnehmen?
- [ ] Stahlrippen der Tunnel ragen bis 0,53 m unter die Schale, an der ein Pod stoppt (Portalrahmen bis 0,35 m) → die Schale in Tunneln mit Rippen um dieses Maß senken?
- [ ] Der Fels ist verrauscht: im oberen Gewölbe bis 0,35 m unter der gerechneten Schale, in der unteren Hälfte der Flanken ± 0,65 m (Höhlen ± 1,3 m) – ein Teil kann so weit im Fels stehen. Rauschen in die Schale einrechnen?
- [ ] Die Luftbrems-Klappen schwenken seitlich aus und sind nicht in der Hülle (zählt nur bei gerolltem Pod)
- [ ] Hülle der Gegner-Cockpits ist nicht gegen das Modell geprüft (die Triebwerksseiten sind es: höchstens 1,7 cm außerhalb)
- [ ] Langlauf `SECS=120`: vereinzelt „downward teleport" (schon vor Phase 3). Seit Phase 5 genauer: ein Respawn wird nicht mehr mitgezählt; übrig bleibt der Tunnel-Fall unten
- [ ] Tunnel-Logik: ein Pod kommt aus einem Sprung hoch über der Straße in den Tunnel und gilt als „im Tunnel" (Malastare, Sample 964). Seit dem Merge wird er nicht mehr umgesetzt, sondern sanft unter die Decke gedrückt (im 45-s-Lauf gemessen: 20,8 m über der Straße, 3 Bilder, 1,26 m). Offen ist nur noch, ob er dort nicht aufs Deck gehört: `p.upper` entscheidet mit Pod-Mitte + 1,2 m

## 4. Pods
- [ ] Dampf- / Ölstrahlen je Modell (Fireflare-Radiator, Kühlschleifen) – im Plan vorgesehen, nicht gebaut

## 5. Strecken & Optik
- [ ] **HQ-Farne:** Wedel als Alpha-Karten mit Textur in `groundCover.ts` (Schneekiefern, Felsbrocken, Kakteen sind erledigt)
- [ ] **Höhlen-Optik prüfen:** Felsschichtung läuft am Gewölbe stark gebogen (Textur folgt dem Bogen); Vulkan-Höhle ist ohne Zusatzlicht fast schwarz – ggf. mehr Glutadern/Lampen
- [ ] **Schnee-Fotoset:** zeigt auf Ando Prime fußspurartige Flecken – ggf. anderes CC0-Set (`tools/photos/pbr.py`)
- [ ] **Fahrbahn faltet sich in sehr engen Knicken weiter offener Flächen** (halbe Breite > Kurvenradius; besteht seit Session 18): Boonta 3462–3487 (Breite/Radius 2,8) und 2159–2178, Mos Espa 4671–4692, Aquilaris 4521–4534. Anzeige: `tools/ci/info.ts`, Zeile `fold`. Lösung in `trackBuilder.ts → controlPoints` (Breite an den Radius koppeln oder Knick entschärfen)

## 6. Spieltiefe
- [ ] **Meisterschafts- / Cup-Modus:** 4-Rennen-Serien mit Gesamtpunkten und Siegerehrung
- [ ] **Geist-Fahrzeug (Time Trial):** beste eigene Runde als transparenter Holo-Pod speichern
- [ ] **Mini-Karte erweitern:** Abkürzungen, Gefahrenzonen und Set-Pieces als Symbole auf dem gecachten Minimap-Layer

## 7. Performance, Build, Werkzeuge, Doku
- [ ] **Build-Größe:** die eine Datei (`dist/index.html`) bleibt 17,6 MB, weil die Fotosets als Text darin stecken; der Web-Build (`build/`) ist 13,1 MB und lädt Texturen erst je Strecke. Weiter möglich: WebP/AVIF oder 512-px-Sets für die Voreinstellung „Niedrig"
- [ ] Nur falls der Speicher wieder knapp wird: lokale Historie kürzen (`git fetch --depth 1`, rund 21 MB: die alte Text-Sicherung und die alten Harness-Bundles liegen nur noch in der Historie)
- [ ] **Harness:** WebGPU-Screenshots im headless Chrome reparieren (weiß; nur Konsolencheck möglich)
- [ ] **Regeln inhaltlich durchsehen** (`docs/regeln/`, `DESIGN.md`): beim Umbau am 2026-11-22 ist nur umsortiert worden. Ältere Regeln, denen eine jüngere widerspricht, stehen noch da → je Thema prüfen und streichen
- [ ] `tools/harness/shot.mjs` und `tools/harness/app.mjs` (Playwright) ruft nichts mehr auf, seit `run.sh` gelöscht ist – `pshot.mjs` / `papp.mjs` (Puppeteer) ersetzen sie. Löschen?
