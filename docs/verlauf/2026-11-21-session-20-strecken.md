# Stand: 2026-11-21 – Session 20 (Strecken) – Bugfixes (Höhlen, „Balken", Tunneldecken), Untergründe je Passage, Seen, Oovo-Mond, PBR-Fotosets

> **Verlauf.** Wörtlich aus dem früheren `HANDOFF.md` übernommen (Doku-Umbau am 2026-11-22). Verweise wie „Abschnitt … unten", „`HANDOFF.md` → …" oder „Regeln in `CLAUDE.md`" meinen den Stand von damals: die Protokolle stehen heute in diesem Ordner ([Übersicht](README.md)), die Regeln in `docs/regeln/`.

### Vorgaben des Nutzers (gelten weiter, Ausnahme siehe letzter Punkt)
1. **Fahrphysik je Untergrund:** spürbar, aber fair – und für die KI genauso.
2. **Seen:** der Pod schwebt in den offenen Passagen direkt über der Flüssigkeit; kein Hineinfallen.
3. **Oovo IV:** etwa 55 % Mondoberfläche, 45 % Station; Zero-G-Röhren bleiben; keine Stelzen ins Nichts.
4. **Alle 13 Strecken** bekommen wechselnde Passagen.
5. **Texturen:** CC0-Fotosets in 1024 px, Build bis etwa 20 MB; HQ-Assets prozedural.
- Außerdem galt in dieser Sitzung: **Pod-Dateien nicht anfassen** (`podModel`, `podTextures`, `podDesigns`, `podKit`, `podMaterials`, `podParts`, `PodPreview.tsx`, `tools/harness/pods.ts`) – die Pods wurden gleichzeitig in Session 20 (Pods) überarbeitet. **Mit dem Merge ist diese Vorgabe erledigt.** Weiter gilt: **nicht pushen** ohne ausdrücklichen Wunsch.

### Erledigt in Session 20 (Strecken)
**Bugs**
1. **„Balken" am Boden in Schrägkurven (Aquilaris, Oovo IV) – `world.ts → addViaductPiers`:** Ursache: die Hammerkopf-Kappen der Viaduktpfeiler lagen waagerecht, die Fahrbahn ist in Kurven aber bis ≈ 21° überhöht → das Kappenende stach auf der tiefen Seite als Balken durch die Fahrbahn. Jetzt neigt sich jede Kappe mit der Überhöhung, jedes Bein bekommt seine eigene Höhe.
2. **Tunneldecken noch einmal +6,5 … 7,5 m und anderes Profil (`trackBuilder.ts`, `world.ts`, `physics.ts`, `Game.ts`):** Standard **27 m** (Ando Prime **30 m**), Unterführung 26 / 28 m, Abkürzung 25 / 27 m, Höhle 27 / 29 m + 8,5–16 m in den Kammern (bis 45 m), Unterwasserröhre 26 m. Querschnitt = **Superellipse (n = 3)** statt Halbellipse: bei 90 % der Breite sind noch 65 % der Scheitelhöhe frei (vorher 44 %) – genau dort tauchte man in die Decke. Die Deckenkollision rechnet jetzt mit der Pod-Oberkante (2,15 m + Flügelspitze bei Rolle; seit dem Commit „Tunneldecke je Pod" mit der gemessenen Höhe des jeweiligen Pods – Abschnitt oben), die Verfolgerkamera bleibt im Gewölbe. Stalaktiten-Spitzen ≥ 22 m über der Fahrbahn. Eine einzige Profilquelle: `tunnelProfile` / `tunnelArc` / `tunnelCeiling` (Mesh, Kollision, Kamera).
3. **Höhlen (Vulkan, Ando Prime ×2, Kristall, Dschungel) – `trackBuilder.ts`, `world.ts → buildTunnel`:** vorher waren die Kammern getrennte 150-m-Röhren mit offenem Himmel dazwischen, Schluchtklippen standen in der Höhle, die verbreiterte Kammer (`caveW`) lag hinter einer unsichtbaren Wand, und die Abzweigröhre schnitt mit sichtbaren Wänden durch die Hauptröhre. Jetzt: **eine durchgehende Höhle** (`tun === 3` über die ganze Länge), die **Fahrbahn selbst weitet sich** in den Kammern (kein `caveW` mehr), Abzweigröhren sind von Anfang bis Ende überdacht und werden per **Hüllen-Vereinigung** (`insideCave` + Dreiecks-Culling) mit der Hauptröhre verschmolzen; Klippen werden in Höhlen ausgelassen. Der Wandrest der Abzweigröhre an der Gabelung hat eigene Texturkoordinaten (vorher zog sich die Fels-Textur dort zu dünnen Streifen zusammen).
4. **Folgefehler aus (2), in derselben Session behoben (`physics.ts`):** ein Pod, der über dem niedrigeren Seitengewölbe in ein Portal einflog, wurde durch die Stirnwand gedrückt (CI: 1 Teleport auf `executioner`). Der Deck-Einstieg entscheidet jetzt nach der Gewölbehöhe an der seitlichen Position des Pods, die Decke drückt mit höchstens 45 m/s nach unten.

**Untergründe & Passagen (alle 13 Strecken)**
5. **25 Untergründe (`surfaces.ts`, `Sample.surf`):** jede Strecke wechselt zwischen „allgemeinen" und „offenen" Passagen ihres Planeten (Tabelle `THEME_SURFACES`). Übergänge lösen sich über 30 m auf (natürlicher Boden) bzw. über eine 26-m-Schürze (gebautes Deck).

   | Welt | allgemeine Passagen | offene Passagen | Höhle |
   |---|---|---|---|
   | Tatooine | Sand, Gestein | Dünen, Plateau | – |
   | Rote Tafelberge | Gestein, Sand | Plateau, Dünen | – |
   | Ando Prime | Schnee, Eis | **Eissee**, Pulverschnee | Eis |
   | Vulkanwelt | Basalt, Lavakruste | **Lavasee**, Asche | Basalt |
   | Dschungelmond | Waldboden, Schlamm | **Sumpf**, Kies | Kies |
   | Malastare | Renndeck, Kies | **Methansee**, Sumpf | – |
   | Aquilaris | Plattform, Strand, Riff-Fels | **offene See** (auf Meereshöhe) | – |
   | Oovo IV | Regolith, Stationsdeck | Regolith, Deck | – |
   | Kristallschluchten | Fels, Kristallfeld | **Spiegelsee**, Kristallfeld | Kristall |

6. **Fahrphysik je Untergrund (`physics.ts`, gilt auch für die KI; Werte in `surfaces.ts → SURFACES`):** Eis/Eissee Haftung ×0,75 · Höchsttempo: Pulverschnee ×0,93, Dünen ×0,94, Schlamm ×0,93, Sumpf ×0,92, Asche ×0,95 (dazu Haftung ×0,90–0,94) · Triebwerkshitze: Lavakruste ×1,3, Lavasee ×1,6, Methansee ×1,15, Basalt/Asche ×1,1, Schnee/Eis/Wasser ×0,9 · Fels, Plateau, Riff, Deck, Rennpiste voll · übrige Naturböden ×0,92–0,98 Haftung, ×0,96–1,0 Tempo. Haftung/Tempo wirken nur am Boden (`grounded && !zeroG`). Grund-Haftung der Welt dafür angehoben (`Game.baseGrip` Eis 0,8 statt 0,55, Dschungel 0,9 statt 0,85). KI-Referenztempo skaliert mit der Haftung. **HUD:** Untergrund-Zeile unter der Wetterzeile (`HudState.surface` / `surfaceFx`: Name + Hinweis „wenig Haftung" / „bremst" / „rutschig" / „Triebwerke heizen auf"), Staub-/Gischtfahne in der Farbe des Untergrunds.
7. **Seen & Plateaus als offene Passage (`Sample.lake`, `world.ts → buildBasins`, `terrain.ts`):** Die bis ~108 m breite offene Fläche ist die See-Oberfläche selbst – der Pod schwebt direkt über Eis, Lava, Methan, Sumpf, Wasser oder Spiegelsee. Eben, keine Überhöhung, keine Leitplanken/Curbs; den Rand markieren Baken + höheres Energiefeld. Kein Hineinfallen. Aquilaris-Seen liegen auf Meereshöhe (`seaY0 + 0,4`). Flüssigkeits-Looks in `terrainMaterial.ts → LIQUIDS`.
8. **Oovo IV = Mond + Station (`terrain.ts`, `world.ts`, `data.ts`):** Mondoberfläche mit Kratern statt Stelzen ins Nichts (Pfeiler nur noch, wo wirklich Luft unter der Piste ist), ~55 % Regolith / ~45 % Stationsdeck, Gasriese + Sterne am Himmel, Sonne 19° über dem Horizont, helleres Fülllicht. Zero-G-Röhren unverändert.
9. **15 echte PBR-Fotosets, 1024 px, CC0 (`pbrTex.ts`, `photoAssets.ts`, `src/assets/pbr/`, `tools/photos/pbr.py`):** Albedo + echte Normal-Map + AO/Rauheit/Höhe je Set (Lava zusätzlich Emission). Beim Laden ins `TexSet`-Layout gepackt und auf die Palette der Welt gegradet. Quellen im README („Bildnachweis"). Build dadurch **17,5 MB** (vorher 2,8 MB; vom Nutzer bis ~20 MB freigegeben).
10. **HQ-Assets (`decorGeo.ts`, `foliage.ts`, `world.ts → scatterDecor`):**
    - **Schneekiefern** (`snowPineGeometry`, `pineMaterial`): Stamm mit Rindenfoto, 10 Quirle hängender Nadelzweig-Karten (Alpha), Schneeauflagen, ~700 Dreiecke; ab 230 m glatter Kegel-Zwilling. Ab Geometrie-Stufe 1.
    - **Felsbrocken mit Displacement** (`boulderGeometry`, `heightSampler`): der Bruchkörper von `rockGeometry`, feiner tesselliert (720 Dreiecke, „Ultra" 980), jeder Vertex um die **Höhe der Fels-Textur** an seiner Stelle verschoben (+ Grat-Rauschen), Textur als Box-Projektion (keine Polverzerrung mehr), geglättete Normalen mit harten Bruchkanten (52°). Ab 120 m (Lava 150 m) der 180-Dreieck-Zwilling aus demselben Verschiebungsfeld. Gilt für Streu-Felsen, Lava-Felsen und die Hindernis-Felsen auf der Piste. Ab Geometrie-Stufe 2 („Mittel").
    - **Kakteen** (`cactusGeometry` UV, `cactusMaterial`): prozedurale Haut – Rippen dunkeln ins Tal ab, Areolen mit Dornenfächer auf jedem Rippenkamm. Nur auf „Rote Tafelberge" (Dünenpass-Sprint).
    - **Offen:** Farne (siehe `TODO.md`).
11. **Textur-Cache gibt alte Welten frei (`textures.ts → beginTextureEpoch`):** nur aktuelle + vorige Welt bleiben im Speicher (vorher wuchs jeder Weltwechsel um ~100 MB).

12. **Loch im Plateau / See an engen Knicken (`trackBuilder.ts`, `world.ts → buildBasins`) – in dieser Session entstanden und behoben:** Wo die halbe Fahrbahnbreite größer ist als der Kurvenradius (Mos-Espa-Arena, Index 4660–4707: Breite/Radius 1,29), faltete sich die Beckenfläche; die umgeklappten Dreiecke wurden weggecullt, zwischen den sich kreuzenden Rändern klaffte eine rautenförmige Grube im Felsplateau, und die Randbaken standen als Knäuel mitten auf der Fläche. Jetzt: Fläche mit **beiden Windungen** und festen +Y-Normalen (eben und in Weltkoordinaten texturiert → Überlappungen unsichtbar), Innenufer behält an solchen Knicken 34 m (die Flächen vor und nach dem Knick überlappen), keine Baken, wo der Rand rückwärts läuft. Geprüft per Rasterabdeckung (0 Löcher) und Screenshot.

**Werkzeuge**
13. `tools/ci/info.ts` (Strecken-Dump: Tunnel, Wände, offene Flächen, Untergründe, Abzweige, engste Kurven) · Harness: Sonden-Ansicht `p<idx>_<lat>_<höhe>_<voraus>_<pfad>_<blickLat>_<blickHöhe>`, Ansicht `n` (Gasriese), Ansicht `g_<name>[_<instanz>[_<abstand×10>]]` (Nahaufnahme eines Dekor-Objekts: `g_boulder`, `g_cactus`), Query `bright` (dunkle Höhlen), `tex=256` (kleine Texturen für den WebGPU-Check bei wenig RAM), Bench-Items `b<strecke>:<ansicht>` (Frame-Zeit synchron über `readPixels`). `info.ts` meldet zusätzlich `fold` (Fahrbahn breiter als der Kurvenradius) und `basin` (Ufer jenseits des Radius).

### Verifiziert
- `npm run check`: **13/13 Strecken bestanden** – 0 Tode, 0 NaN, 0,00 m Wand-Durchdringung, Bodenfreiheit ≥ 0,66 m, Deck- und Overhead-Selbsttest grün, 0 Teleports. Auch mit Sturm-Haftung (`GRIP=0.88`): 13/13 (1 Tod auf Magma, erlaubt ≤ 3).
- `npm run check:gpu` (WebGPU, SwiftShader, je Strecke einzeln mit `QUERY='?tex=256'`): **alle 13 Strecken, 0 Konsolenfehler/-warnungen** – mit dem Endstand des Codes.
- `npm run build` → `dist/index.html` **17 505 684 Bytes** (gzip 12,36 MB; vorher 2,8 MB – Zuwachs = 46 JPEGs der Fotosets).
- App-Test `papp.mjs` auf dem fertigen Build (Frostspalt-Ring; davor auch Dünenpass-Sprint): **bestanden** – Menü → Rennen, HUD mit Untergrund-Zeile, Schadensseiten, Pause-Ton, Grafik-Menü in der Pause, Tasten- und Gamepad-Belegung.
- **Screenshots (WebGL2-Harness, Software-Rendering), alle 13 Strecken gesichtet:**
  - „Balken": Aquilaris-Schrägkurve und Oovo-Startkurve (Überhöhung 0,16) – nichts ragt mehr aus der Fahrbahn.
  - Höhlen: Frost, Magma (mit `bright`), Howler, Kristall, Dschungel – durchgehend, kein offener Himmel, Gabelung mit Felspfeiler.
  - Untergründe/Seen: Eissee, Lavasee, Methansee, Sumpf, Spiegelsee, offene See, Plateau, Dünen, Strand, Regolith, Stationsdeck.
  - HQ-Assets: Schneekiefern (Frost, Howler), Felsbrocken und Kakteen (Dünenpass, Mos Espa).
- **Frame-Zeit vorher/nachher** (Software-Rendering, 768 × 432, 6 Frames, über `readPixels` synchronisiert – nur als Verhältnis brauchbar):

  | Ansicht | Session 19 (`d7b9c4b`) | Session 20 | Unterschied |
  |---|---|---|---|
  | Boonta, Übersicht `c` | 914 ms | 928 ms | +1,5 % |
  | Boonta, offene Fläche `o` | 684 ms | 770 ms | +12,6 % |
  | Frost, Tunnel `u` | 1064 ms | 1039 ms | −2,3 % |
  | Frost, offene Fläche `o` (jetzt Eissee) | 728 ms | 829 ms | +13,9 % |

  Normale Passagen und Tunnel: gleich schnell. Offene Flächen: etwa 13 % langsamer (zusätzliche Boden-/Seefläche mit eigenem Material).

### Nicht verifiziert
- **Probefahrt und FPS auf echter GPU.** Die Sandbox hat keine GPU; die Tabelle oben misst Software-Rendering (~1 s je Frame). Die HUD-FPS-Anzeige ist dort unbrauchbar.
- **Fahrgefühl der Untergründe** (Eis −25 % Haftung, Tempo-Abzug in Schlamm/Dünen): nur die KI ist in der Node-Simulation darüber gefahren.
- **Optisch offen** (gesehen, nicht bearbeitet): Felsschichtung am Höhlengewölbe stark gebogen; Vulkan-Höhle ohne `bright` fast schwarz; fußspurartige Flecken im Schnee-Fotoset; Fahrbahn-Falten an vier sehr engen Knicken (siehe `TODO.md`).
- **Sandbox-Grenzen:** 2 GB RAM. Zwei Strecken mit 1024-px-Fotosets in einer Browser-Sitzung sprengen den Speicher (Software-GL hält jede Textur im RAM) → je Lauf eine Strecke, bei `check:gpu` `QUERY='?tex=256'`. Browser nie gleichzeitig mit `tsc`/Simulation starten.

## Erledigt (aus dem früheren `TODO.md`)
- [x] **Bugs behoben:** „Balken" in Schrägkurven (Pfeilerkappen folgen der Überhöhung), Tunneldecken +6,5–7,5 m mit breitem Gewölbe (Superellipse) und Kamera im Gewölbe, Höhlen durchgehend und an Gabelungen verschmolzen
- [x] **25 Untergründe mit eigener Fahrphysik** auf allen 13 Strecken (Eis, Pulverschnee, Dünen, Schlamm, Lava …), HUD-Zeile, Staubfahne in Untergrundfarbe
- [x] **Seen und Plateaus als offene Passage:** Eissee, Lavasee, Methansee, Sumpf, Spiegelsee, Meer (Aquilaris), Felsplateau
- [x] **Oovo IV:** Mondoberfläche mit Kratern, Stationsdecks, Gasriese am Himmel
- [x] **15 PBR-Fotosets (CC0, 1024 px)** mit echten Normal-Maps: Fels, Klippe, Sand, Schnee, Pulverschnee, Eis, Lava, Asche, Waldboden, Schlamm, Kies, Riff, Regolith, Metallplatten, rissiger Lehm
- [x] **HQ-Assets:** Schneekiefern mit Nadel-Karten, Felsbrocken mit Displacement aus der Textur-Höhe, Kakteen mit Rippen-/Dornen-Haut
- [x] **Textur-Cache gibt alte Welten frei**, Strecken-Dump `tools/ci/info.ts`, Harness-Ansichten (Sonde, Dekor-Nahaufnahme, Bench)
