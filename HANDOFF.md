# HANDOFF

## Stand: Session 16 – Steigungen und Schrägkurven

### Erledigt in Session 16
1. **Steigungen** (`trackBuilder.ts → applyRelief`, vor `finalizeSamples` und vor den Abkürzungen)
   - **Hügelfeld im Grundriss:** 2 Oktaven Value-Noise, 520 m + 230 m. Benachbarte Streckenteile steigen und fallen gemeinsam (keine Strecke kreuzt sich selbst – geprüft).
   - **Amplitude:** `20 m × Ziel / 9 %`. Danach Steigungsbegrenzer (Lipschitz-Hüllkurve: nur zu steile Stellen werden gekappt) und Rundung der Kuppen/Senken über ≈ 40 m.
   - **Ziel-Steigung je Strecke:** `RELIEF_GRADE` (Standard 9 %; Aquilaris 5 %, Neon/Oovo 6 %, Henker/Methan 7 %, Frost/Kristall/Dünenpass 10 %, Howler 11 %).
   - **Schutzzonen (Relief konstant gehalten):** Startaufstellung, Sprint-Start/-Ziel, Rampen + Lücken + Landezonen.
   - **Ergebnis:** mittlere Steigung 1,6–4,7 % (vorher 0,4–1,5 %), 14–40 % der Strecke steiler als 5 % (Aquilaris 2 %), Höhenunterschied z. B. Boonta 39 m, Howler 110 m.
2. **Schrägkurven** (`applyBanking`, nach den Abkürzungen, vor Klippen/Hindernissen)
   - Überhöhung = `Krümmung × 48`, begrenzt auf `min(0,34; 7 m / halbe Breite)` → bis **7 m Randhöhe** (vorher 2,4 m); über ≈ 90 m ein-/ausgeleitet.
   - Eben: Startbereich, Sprint-Enden, Rampen/Lücken, Schwerelos-Röhren, Abzweigungen (Maske, um 25 Samples erweitert).
   - 18–53 % jeder Strecke haben Überhöhung > 0,12 (Aquilaris 4 %, Oovo 11 %). Set-Pieces meiden überhöhte Stellen (Bank-Term in der Bewertung).
   - `refSpeeds()` (aus `finalizeSamples` herausgelöst): KI-Referenztempo × `(1 + 1,1·|bank|)`, danach Brems-Rückwärtspass.
3. **Physik** (`physics.ts`)
   - Hangabtrieb: `vf −= GRAVITY · SLOPE_K(0,8) · Steigung · dt` (Steigung aus Boden-Höhenänderung, ±20 % begrenzt; nicht auf Rampen, in Lücken, in Schwerelosigkeit). 9 % ≈ ±2,4 m/s².
   - Schwebe-Dämpfer arbeitet relativ zur Vertikalgeschwindigkeit des Bodens → Pod hält die Schwebehöhe am Berg.
   - Schrägkurve: Einlenken in die Überhöhung bis +50 % Drehrate, dagegen bis −25 %.
   - Pod-Roll folgt der Fahrbahnneigung (`+ atan(bank)`); `Game.updateVisuals` rechnet die Bodenfreiheit mit dem Roll **relativ zur Fahrbahn**.
4. **Wasserspiegel:** Lava/Dschungel/Eis/Ozean liegen jetzt ≥ 13–14 m unter dem tiefsten Streckenpunkt (überhöhte Innenränder liegen bis 7 m tiefer als die Mitte).
5. **Tool:** `tools/harness/relief.ts` – je Strecke Höhenbereich, max./mittlere Steigung, Anteil > 5 %, Überhöhung, Selbstkreuzungen, mittleres KI-Tempo.

### Verifiziert
- `tsc` sauber, Build ok.
- `sim-check` auf 6 Strecken OK: Boonta, Frost, Dschungel, Howler, Magma 0 Tote; Malastare 2 (bekanntes Felsfeld). KI-Fortschritt gleich oder höher (Boonta 1720 statt 1642).
- Renders: Boonta-Kurve und Howler-Kurve deutlich überhöht (Leitplanken, Böschung folgen), Howler-Übersicht mit Senke und Anstieg, Startaufstellung eben.

### Nicht verifiziert
- Fahrgefühl (Hangabtrieb, Einlenken in Schrägkurven, Kuppen bei hohem Tempo) – nur per Sim abgesichert, nicht selbst gefahren.
- Abzweigungen zu Abkürzungen bei starkem Relief und alle 14 Strecken einzeln im Bild (geprüft: Boonta, Howler).

## Stand: Session 15 – TODO §2 „Landschaft“ komplett: Tierverhalten, nasse Fahrbahn, Linsentropfen, Gelände-Detail, Busch-Billboards

### Erledigt in Session 15
1. **Tiere und Fahrzeuge umgehen Hindernisse** (`wildlife.ts → openCircle`)
   - Neue Parameter `avoid: LifeZone[]` und `perches: LifeZone[]` in `buildLife`.
   - Eine Kreisbahn wird verworfen, wenn sie näher als `r + 20 m` an einer Zone vorbeiführt (90 Versuche).
   - Zonen kommen aus `world.ts`: Landmarken (`addLandmarks` gibt jetzt `placed` zurück), große Deko (`scatterDecor` → `zones`, alles mit `sMax > 7,5`: Felsnadeln, Tafelberge) und Fall-Fuß + Fall-Kante.
2. **Herden fliehen vor dem Spieler**
   - Schreck unter 120 m: Galopp entlang der Bahn (Winkelgeschwindigkeit × 6), weg von der Bedrohung; weiches Umdrehen (geglättetes Yaw), Formation spreizt sich × 1,5, Beruhigung über ≈ 3 s.
   - Beinanimation über Uniform `gait` (CPU-akkumulierte Phase), damit die Schrittfrequenz ohne Phasensprung steigt.
   - `World.update(t, cam, player)` reicht die Spielerposition durch (`Game` übergibt `player.pos`; ohne Angabe gilt die Kamera).
3. **Vögel landen und starten**
   - Jeder Schwarm hat einen Landeplatz: nächster Felsbrocken < 500 m (`decor.perches`, Felsen > 2,2 m), sonst Boden/Wasser.
   - Zyklus: Luft (22–52 s) → Gleitflug 5 s → sitzen (14–30 s) → Abflug 2,2 s. Sofortiger Abflug, wenn der Spieler näher als 110 m kommt; gelandet wird nur bei > 260 m Abstand.
   - Flügel im Sitzen angelegt: instanziertes Attribut `fold` schaltet das Flattern ab.
   - Test-Hook `group.userData.perchTest()` setzt alle Schwärme auf den Landeplatz (Harness-Ansicht `p`).
4. **Fälle frei von Landmarken und Bewuchs:** `addLandmarks` bekommt `{ ...field, roadClear: decorClear }`, der Bodenbewuchs ein `distToTrack`, das im Fall-Korridor −1 liefert. Kein Eingriff in `landmarks.ts`/`groundCover.ts` nötig.
5. **Nasse Fahrbahn unter Wand-Kaskaden** (`materials.ts`, Option `wetZones`)
   - Wand-Kaskaden werden jetzt ganz am Anfang von `buildWorld` gebaut; ihre Fußpunkte gehen als Konstanten in den Straßen-Shader (max. 8 Zonen, keine Uniforms).
   - Wirkung: Albedo × 0,58, Rauheit → 0,05, Normale geglättet + dünner fließender Film.
6. **Linsentropfen** (`post.ts`, Uniform `wet`): zwei Zell-Lagen, jeder Tropfen bricht das Bild; max. ≈ 35 % der Zellen belegt, Tropfen verschwinden einzeln.
   - `Game.updateFalls` setzt `wetCam = 1`, wenn der Spieler durch eine Kaskade fährt; trocknet in 3 s. Nur bei aktivem „Cinematic“.
7. **Gelände-Detail je Welt** (`terrainMaterial.ts`, `TERRAIN_DETAIL`): die Boden-Normal-/Rauheitskarte ein zweites Mal in feinerem, weltspezifischem Maßstab – nur Bodenschicht, nur < 70 m. Ando Prime 3 × 8 gestreckt → lange Windverwehungen. Gleiche Textur → kein zusätzliches Binding.
8. **Busch-Billboards** (`groundCover.ts`): Typen mit `shrub|bush` im Namen und Sichtweite ≥ 240 m bekommen jenseits ihrer Sichtweite Billboards in einem Draw (`buildImpostors`, Art `bush`, getönt mit der mittleren Vertexfarbe). `buildImpostors` hat neu den Parameter `fadeLen`.

### Verifiziert
- `tsc` sauber, Build ok, `sim-check` OK (Dschungel, Boonta, Frost: 0 Tote, 0 NaN).
- Renders ohne Shader-Fehler: Dschungel `w` (nasse Zone sichtbar), Dschungel `p` (Vögel sitzen auf Felsbrocken), Frost `g` (Windverwehungen), Frost `l` (Herde), Boonta `l` (Sandkriecher), Dschungel `a` mit `?wet` (Linsentropfen).

### Nicht verifiziert (nur Logik + Typecheck + Sim)
- Flucht-Bewegung der Herden und Lande-/Start-Übergänge der Vögel (Standbilder zeigen keine Bewegung).
- Busch-Billboards in der Ferne; Freihaltung der Fall-Korridore.

### Harness
- Neue Ansicht `p` (sitzende Vögel), Query `?wet` (Linsentropfen an).

## Stand: Session 14 – Fall-Ambiente: Sound, Gischt, Sichtbarkeit, Deko-Freihaltung

### Erledigt in Session 14
1. **Fall-Positionen als Daten:** `buildFalls` / `buildWallFalls` liefern `FallInfo[]` (Fuß `x,y,z`, Radius `r`, Kante `lx,lz`, `kind`, `wall`). `World.falls` reicht sie an `Game` weiter.
2. **Sound** (`AudioFX.setFall`): Rauschen nach Abstand zum nächsten Fall (hörbar bis 170 m, quadratisch).
   - Wasser/Eis: Bandpass 520–1420 Hz. Lava: tiefes Grollen (Tiefpass 150 Hz).
   - Der Audio-Knoten wird erst bei Bedarf angelegt.
3. **Partikel** (`particles.ts`)
   - `fallMist`: treibender Nebel am Fuß (Wasser) bzw. aufsteigende Glutfunken (Lava), nur wenn die Kamera < 240 m entfernt ist.
   - `splash`: Spritzer, wenn ein Pod durch eine Wand-Kaskade fährt (Radius = Fallbreite, jeder 2. Frame).
   - Aufruf in `Game.updateFalls()` direkt nach `world.update`.
4. **Sichtbarkeit:** Fall-Kandidaten werden nach Sichtlinie von der Strecke sortiert.
   - Geländestrahl vom nächsten Streckenpunkt (+4 m) zur oberen Fallhälfte, 18 Stützpunkte; dazu muss die Fallfläche zur Strecke zeigen.
   - Reihenfolge: sichtbar + zugewandt > sichtbar > Rest, danach Fallhöhe. Vulkanwelt: Fall jetzt frei sichtbar (Render geprüft).
5. **Deko-Freihaltung:** Fälle werden **vor** der Deko gebaut (eigener RNG `mulberry32(977 + N)` → übrige Platzierung bleibt deterministisch). `decorClear` hält Bäume/Felsen aus dem Korridor Kante → Fuß (`r + Objektgröße + 5 m`).
6. **Verifiziert:** `tsc` sauber, Renders Lava/Dschungel ohne Fehler, `sim-check` OK (Dschungel 0, Magma 0, Malastare 1 Tod), Build ok.

### Offen
- Landmarken (`addLandmarks`) und Bodenbewuchs prüfen die Fall-Korridore noch nicht.
- Sound und Partikel sind nur per Typecheck + Sim abgesichert (kein Audio im Headless-Test) → im Spiel anhören.

## Stand: Session 13 – Wasserfälle an den Schluchtwänden (Dschungel)

### Erledigt in Session 13
1. **Schluchtwand-Kaskaden** (`falls.ts → buildWallFalls`, Dschungel-Terrain: Dschungel, Malastare, Methan)
   - **Auswahl:** bis zu 6 Wandabschnitte (High+; sonst 3) mit Klippe ≥ 18 m, über ±5 Samples durchgehend, keine Öffnung/Lücke/Rampe, ≥ 140 Samples Abstand.
   - **Form:** Das Band folgt dem gestuften, nach hinten geneigten Wandprofil (`WALL_PROF` = Profil aus `world.ts`), 0,9–2,8 m vor der Wand (Wandrauschen ±2,5 m), Breite 7–14 m, verbreitert sich nach unten.
   - **Fuß:** Ablaufgitter am Fahrbahnrand (Stahlstreben), Schaumfleck, Gischt. Rein optisch – Kollision bleibt auf der Wandlinie.
2. **Refactor:** `fallMaterials(kind)` für Gelände- und Wandfälle gemeinsam.
3. **Gelände-Wasserfälle** wieder mit 16 m Mindestgefälle (10 m erzeugte kleine „Geister-Schleier“ im flachen Dschungel).
4. **Harness/Tools**
   - Ansicht `w` rahmt nur den ersten Fall ein (`userData.fallVerts`); `userData.fall` ist `'wall'` oder `'terrain'`.
   - Neu: `tools/harness/walls.ts` (Klippenstatistik je Strecke).

## Stand: Session 12 – Landschaft: Baum-Impostors, Wasser-/Lava-/Eisfälle, Straßenoberfläche

### Erledigt in Session 12
1. **Ferne Bäume als Impostors** (`impostors.ts`)
   - Jeder platzierte Baum bekommt zusätzlich zwei gekreuzte Ebenen mit gemalter Silhouette (Laubbaum / Nadelbaum) – alle in **einem** Draw.
   - Dither-Einblendung ab `1400 m × Sichtweite − 150 m`, genau wo die echten Baumzellen ausgeblendet werden. Unbeleuchtet, Nebel an, Helligkeit je Instanz variiert, keine Schatten.
   - Ando Prime: hellerer (verschneiter) Ton. Ergebnis: Dschungel-Horizont durchgehend bewaldet statt abrupt leer.
   - Einbindung: `placeV(..., { impostor: { kind, w, h, tint } })`.
2. **Wasser-, Lava- und Eisfälle** (`falls.ts`)
   - Sucht echte Steilhänge im Höhenfeld (≥ 16 m bzw. Wasser ≥ 10 m Gefälle auf 12 m, ≥ 55 m von der Strecke, ≥ 320 m Abstand untereinander).
   - Gebogenes Band von der Kante bis zum Fuß, ≥ 3 m über dem Gelände (Mitte + Ränder geprüft). Dazu Becken- bzw. Glut-Scheibe und Dampf/Rauch über das Smoke-System.
   - TSL-Animation: Wasser mit Schaum-Streifen, Lava mit fließenden Krusten + Glühen, Eis statisch und glänzend.
   - Vulkanwelt verifiziert. **Dschungel hat kein ausreichendes Gefälle** → dort (korrekt) keine Fälle.
   - Harness-Ansicht `w` (erster Fall).
3. **Boonta-/Standard-Straße** (`textures.ts`, Kind `road`): Kiesel feiner (Worley 170), seltener und flacher; Niederfrequenz-Höhe halbiert; feine Gesteinskörnung und abgefahrene Spurrinnen. Keine runden Grübchen mehr durch Parallax/Displacement.

### Offen
- Lavafall auf Magma wird von einem Felszacken mittig verdeckt → Kandidaten auf freie Sicht vom Track prüfen.

## Stand: Session 11 – Deko-LOD, Boulder-Budget, verschneite Nadelbäume, Allokationen

### Erledigt in Session 11
1. **Deko-Distanz-LOD:** `CellInstancer.add(..., low)` legt je Zelle eine Low-Poly-Variante an.
   - Umschalten ab 350 m (Abstand zum Zellrand); der Far-LOD wirft keine Schatten (liegt ohnehin außerhalb der 240-m-Schattenreichweite).
   - Low-Varianten: Felsen (Detail 0), Dschungelbäume und Nadelbäume (Qualität 0: weniger Äste, keine Brettwurzeln, Blattballen Detail 1).
   - Dschungel (High): **sichtbare Dreiecke 4,1 M → 3,0 M**, nahes Bild unverändert.
2. **Boulder-Budget:** Ikosaeder-Detail max. 4 (≤ 5.120 statt 20.480 Dreiecke bei Ultra). Mit Bruchflächen und Normal-Maps sichtbar gleich.
3. **Verschneite Nadelbäume (Ando Prime):** neues `snowMat.ts` – Node-Material legt Schnee in Weltkoordinaten auf nach oben zeigende Flächen (`normalWorld.y` + Rauschen), unabhängig von Vertex-/Instanzfarben.
   - **Befund:** Vertex-Farben > 1 kamen bei diesen Instanzen nicht an. Die Rechnung stimmte numerisch: 30 % der Nadel-Vertices verschneit.
4. **Allokationen pro Frame:** Staubfarbe und Abgas-Weltposition werden wiederverwendet (`dustCol`, `tmpV3`).
5. **Malastare:** Sims über 30 s und 45 s ohne Tod (Rest war zufällig).

## Stand: Session 10 – KI-Manöver, HUD, Slide-Effekte, SSR ohne Normalen-Puffer, KI-Überleben

### Erledigt in Session 10
1. **KI nutzt die neuen Manöver** (`aiInputs`)
   - **Haarnadeln:** Power-Slide mit Handbremse statt Bremsen.
   - **Kurven:** kurveninnere Luftbremse (Q/E) statt beider.
   - **Kein freier Weg im Hindernisfeld** (DP-Kosten > 1500): 90°-Rolle für 1,3 s (Hysterese).
   - **Lange Geraden:** Nase runter (+4 % vmax).
2. **KI-Überleben**
   - **Forensik:** Die Harness-Sim protokolliert je Tod die letzten 5 Schadens-Events (`deaths=[0:986X{p89@986,o62@978,…}]`). Ergebnis: Hindernis-Treffer mit ~119 m/s, meist nach Pod-zu-Pod-Stößen im Pulk.
   - **Fixes:**
     - Hindernis-Abstand hat das letzte Wort (Sicherheitspass nach Pod-Ausweichen und Rammen).
     - Kurzer Lenkpunkt (70 % bis zum Hindernis), solange die aktuelle Linie ein Hindernis überdeckt.
     - KI-gegen-KI-Kontaktschaden × 0,35, max. 30 je Treffer (Spieler unverändert).
   - **Sim 30 s:** Malastare 4 → 1 Tod; Boonta, Henker, Dschungel, Methan je 0. Alle Strecken schneller (z. B. Dschungel 1446 → 1607). `tools/ci/sim-check.sh` **OK**.
3. **HUD:** Lage-Anzeige im Tacho – Balken kippt mit der Rolle und verschiebt sich mit Neigen/Anheben, Endpunkte leuchten bei aktiver Luftbremse, dazu „SLIDE“ und „ROLLE“.
4. **Slide-Effekte:** Staubfahnen an beiden Triebwerken und Zisch-Sound (Rauschen, Bandpass nach seitlichem Rutschen, `AudioFX.setSlide`).
5. **SSR:** Normalen ebenfalls aus der Tiefe (`getNormalFromDepth`). Das MRT hat nur noch `metalrough` → Partikel können Reflexionen höchstens abschwächen, nicht verzerren; weniger Bandbreite. Ultra-Render Aquilaris/Dschungel fehlerfrei.
6. **Tooling:** `tools/harness/probe.ts` (Streckenmerkmale um einen Index: Höhe, Breite, Wände, Rampen, Hindernisse, Set-Pieces, Hazards).

### Offen
- Ein Rest-Tod auf Malastare (Pulk + Wand bei idx ≈ 999).
- FPS auf echter GPU weiterhin ungemessen.

## Nachtrag Session 9b – CSM aktiviert
- Gegenprobe: dieselbe Ansicht (Boonta, `t0:g`) ohne und mit CSM. **Mit CSM** sind die Schatten scharf und lang, ohne CSM schwächer und verwaschen.
- Das frühere „Schatten fehlen“ war ein Timing-Effekt: `CSMShadowNode` richtet die Kaskaden erst im ersten Frame nach dem Kompilieren ein. Der Warm-up in `Game.start()` rendert bereits einen Frame.
- **Ultra-Preset hat jetzt `csm: true`**; bei High per `gfx.csm` zuschaltbar. Verifiziert auf Boonta Start, Kurve und Seitenrand.
- Harness: `?csm` schaltet CSM zu (auch ohne Ultra).

## Stand: Session 9 – GTAO/Rauch-Kompatibilität, GPU-Partikel, neue Steuerung, Tooling

### Erledigt in Session 9
1. **GTAO ↔ Rauch/Abgase**
   - **Ursache:** Im WebGPU-Kompatibilitätsmodus mischt die MRT-Ausgabe transparente Partikel in den Normalen-Puffer → GTAO bekam falsche Normalen.
   - **Fix:** GTAO und Denoise rekonstruieren Normalen aus der Tiefe (`ao(depth, null, camera)`). Transparentes schreibt keine Tiefe → **vollständig kompatibel**.
   - Der MRT-Pass läuft nur noch mit SSR → weniger Bandbreite bei High/Ultra ohne SSR.
   - `material.mrtNode` bleibt ungenutzt (r187 erzeugt leere WGSL-Structs, auch mit `output`).
2. **GPU-Partikel** (`particles.ts → Pool`)
   - Ringpuffer mit Spawn-Daten; Bewegung (Drag + Gravitation, geschlossene Form), Größe, Farbe und Fade rechnet der Vertex-Shader aus Zeit-Uniform.
   - Keine CPU-Schleife pro Frame; es werden nur neue Slots hochgeladen.
   - **Rauch:** rotierende, rauschgeformte Wölkchen (`mx_noise_float`), oben heller.
3. **Neue Steuerung** (`Game.readInput`, `physics.ts`):

   | Taste | Funktion |
   |---|---|
   | W | Schub |
   | S | Umkehrschub |
   | A / D | Lenken |
   | Leertaste | Handbremse / Slide (Seitengrip × 0,12, Yaw × 1,35) |
   | ← / → | 90°-Rolle (Kollisionsbreite halbiert) |
   | ↑ | Neigung (Nase runter, + 4 % vmax) |
   | ↓ | Anheben (+ 2,2 m Schwebehöhe, − 5 % vmax) |
   | Q / E | einseitige Luftbremse (zieht zur Seite) |
   | Strg | beide Luftbremsen |
   | Shift | Boost |
   | R | Reparatur |
   | C | Ansicht |

   Gamepad: rechter Stick Rolle/Neigung, LB/RB einzelne Luftbremsen, L3 Handbremse. Hilfe-Screen und Renn-Tipp angepasst.
4. **Triebwerke:** Lenken hebt nur vertikal (äußeres Triebwerk komplett hoch, inneres leicht runter, gefedert), **ohne Neigung**. Neigen/Anheben nur mit ↑/↓, dann beide synchron.
5. **Tooling**
   - `tools/harness/setup.sh` stellt nach einem Sandbox-Reset alles wieder her (`.git`, Playwright, Libs).
   - `tools/harness/diff.mjs` (Pixel-Diff, Exit 1 bei > 2 %).
   - `tools/ci/sim-check.sh` (Fehler bei NaN, Wanddurchdringung oder > 2 Explosionen je Strecke) – aktuell **OK**.
6. **CSM:** `CSMShadowNode` eingebaut, aber **opt-in** (`gfx.csm`). In Harness-Renders fehlten damit die Schatten → nicht standardmäßig an.

### Bekannt / offen
- **SSR:** liest weiter MRT-Normalen; Partikel können dort leichte Artefakte erzeugen (nur mit SSR, Ultra).
- **KI** nutzt die neuen Manöver (Slide, Rolle) noch nicht.

## Stand: Session 8 – Start-Ruckler, Hindernisse, Staub, Bodenfreiheit, dynamische Triebwerke

### Erledigt in Session 8
1. **Start-Ruckler**
   - **Ursache:** Pod-LOD-Proxies wurden lazy gebaut, genau wenn die Gegner nach dem Start 30 m überschreiten. Dabei liefen Geometrie-Merge und die Erst-Kompilierung des LOD-Shaders mitten im Rennen.
   - **Fix:** Warm-up in `Game.start()`: alle Proxies bauen, `compileAsync` mit Frustum-Culling aus für beide LOD-Zustände, dann ein Post-Frame.
   - KI-Pod-LOD ab 18 m (vorher 30 m) → Pod-Meshes am Start 365 → **161**.
   - Weniger Allokationen pro Frame: Glow-Farbe wiederverwendet, konstante Partikelfarben.
2. **Hindernisse** (`trackBuilder.ts`)
   - × 0,55 Dichte (`OB_DENSITY`), mindestens 9 Samples Abstand, außer bei ≥ 10 m seitlichem Versatz; Radius 1,6–3.
   - **Sichtbarkeit:** leuchtender Warnring am Fuß + Amber-Bake je Felsen (`addObstacles`).
   - Sims: Malastare 1 Toter (vorher 3), Henker 0 (vorher 3).
3. **Staub/Rauch:** Staubwolken 4–7 m statt 10–16 m, Deckkraft 0,15 statt 0,35, Lebensdauer ≈ 1 s. Pods < 60 m vor der Kamera emittieren halb so oft; Abgasrauch 0,07.
4. **Einsinken beim Lenken**
   - **Ursache:** unbegrenztes Visual-Roll (`steer·0,55 + latV·0,012`) bei 3–4 m Triebwerksabstand und 1,7 m Schwebehöhe.
   - **Fix:** Roll auf ±0,42 begrenzt. Zusätzlich hebt `Game.updateVisuals` den Body um `span·|sin roll| + span·|bank| + Triebwerks-Dip + Pitch` (gefedert), damit Triebwerke nie den Boden schneiden – auch in Steilkurven.
5. **Dynamische Triebwerke:** jedes Triebwerk ist unterdämpft gefedert, mit eigener Steifigkeit.
   - Außen hoch / innen runter (± 0,55 m) beim Lenken, Nase kippt mit Gas, Airbrake und Lenken.
   - Leichtes Schweben bleibt erhalten.
6. **Grafikfehler**
   - WGSL-Scan Ultra auf Boonta, Neon, Aquilaris, Methan, Dschungel, Malastare: 0 Fehler.
   - TSL-Umbenennungen (`packNormalToRGB` / `unpackRGBToNormal`) übernommen.

### Bekannt / offen
- **MRT im Kompatibilitätsmodus:** three warnt „MRT blending not fully supported“. Transparente Objekte (Partikel, Glas, Flammen) blenden in die Normal-/Rauheits-Puffer → mögliche GTAO/SSR-Artefakte um Partikel.
  - Versuch `material.mrtNode` (Alpha 0) erzeugt in r187 ungültiges WGSL (leere Struct) → nicht aktiv (`PostFX.protectMRT` bleibt als Code).
  - Alternative: Transparentes in einem zweiten Pass ohne MRT rendern (Layer).
- Echte FPS nicht gemessen (nur SwiftShader).

## Stand: Session 7 – Performance, GTAO-Fix, Glanz-Flackern

### Erledigt in Session 7
1. **GTAO-Grafikfehler – Ursache:** Bug in three r187.
   - Im WebGPU-Kompatibilitätsmodus werden Tiefentexturen als `texture_2d<f32>` gebunden, `generateTextureGather` lässt aber die Komponente weg → ungültiges WGSL („no matching call to textureGather“) → GTAO-Pipeline kaputt.
   - **Fix:** Laufzeit-Patch von `WGSLNodeBuilder.prototype.generateTextureGather` in `post.ts`; `node_modules` bleibt unverändert.
   - Zusätzlich GTAO für Meter-Maßstab: Radius 1,6, Dicke 2,5, 12 Samples, halbe Auflösung + tiefenbewusster `denoise`, Himmel maskiert, Ausblendung 60–220 m, Stärke 0,8.
2. **Flackernde Glanzlichter:** neues `specAA.ts` (geometrisches Specular-AA nach Tokuyoshi/Kaplanyan + Distanz-Untergrenze).
   - Eingesetzt in `surfaceMaterial` (Straße, Wände, Pfützen), `terrainMaterial` (Eis, Methan, Salz) und Pod-Hülle.
   - Wirkt auch auf SSR, weil das MRT dieselbe Rauheit liest.
3. **Performance**
   - **Deko-Instancing in Zellen:** neues `instCells.ts` (`CellInstancer`): 500-m-Zellen, Riesen-/Luftobjekte 1200 m.
     - Vorher gab es je Deko-Typ einen einzigen InstancedMesh über die ganze Karte: kein Frustum-Culling, und alle Instanzen landeten in jedem Frame im Schatten-Pass.
     - Jetzt: Frustum- und Distanz-Culling (1400 m × Sichtweite); Schatten nur bis 240 m.
   - **Pod-LOD:** ab 30 m Kameraabstand gebackener Proxy (`podModel.ts → setLod`).
     - Alle Teile werden zu 1 Geometrie verschmolzen, Materialfarbe in Vertexfarben, 1 geteiltes Material + Glow → **2 statt ~45 Draws pro Pod**.
     - Schatten nur bis 110 m. Der Spieler-Pod bleibt immer voll detailliert.
   - **Bodenbewuchs:** Zellen 150 → 260 m (weniger Draws).
   - **Messung** (Harness, Start Boonta / Dschungel):

     | Metrik | vorher | nachher |
     |---|---|---|
     | sichtbare Meshes | 446 / 510 | 333 / 432 |
     | Schattenwerfer | 420 / 417 | 276 / 282 |
     | Dreiecke Dschungel | 5,8 M | 4,1 M |
     | Pod-Meshes am Start | 365 | 254 |

4. **Harness:** `game.ts` meldet jetzt `meshesInView`, `trisInView`, `casters`, `podMeshes`, Aufschlüsselung `other` und `frame` (ms, SwiftShader → nur relativ). Neuer Modus `?ultra` (GTAO + SSR an).
5. Build ok (≈ 2,0 MB), `tsc` sauber, Ultra-Renders Dschungel/Magma ohne WGSL-Fehler.

### Bekannt / offen
- Pods näher als 30 m sind weiter ~45 Draws (≈ 16 Materialien × Teile). Nächster Hebel: Materialien pro Pod zusammenlegen (Atlas/Array-Textur) oder BatchedMesh für alle Pods.
- Frame-Zeit unter SwiftShader nicht aussagekräftig → auf echter GPU mit `showFps` prüfen.
- Dauerläufer pro Frame: `updateVisuals` legt `new THREE.Color` je Pod an (GC); Binder-Geometrie-Upload je Pod.
- Session-6-Themen bleiben offen: Todeszonen Henker/Malastare, Frost-Nadelbäume, Boonta-Straßentextur.

## Stand: Session 6 – Landschaftsgeometrie + KI-Spurraster

### Erledigt in Session 6
1. **Aufgeräumt:** altes Projekt `canwelk.html` liegt in `.archiv/`. Repo `Cr0nFixXx/podracer` ins Root geklont, `npm install` ok.
2. **Neue Deko-Geometrie** – `src/game/decorGeo.ts`, ersetzt die Primitive in `world.ts → scatterDecor`:
   - Hilfsfunktionen: 3D-Rauschen (`vnoise3/fbm3`), Box-UV-Projektion (keine Polverzerrung), Vertex-AO in `color`. Alle Builder liefern nicht-indizierte Geometrie mit `position/normal/uv/color`.
   - **Fels:** `boulderGeo` – domain-warped, Bruchflächen, Rissrillen, flache Basis; auch für Hindernisse (`rockGeo` delegiert).
   - **Felsnadeln und Tafelberge:** `spireGeo` (Hoodoos mit Deckstein, Hals, Leisten) und `mesaGeo` (Terrassen, Schuttfuß, unregelmäßiger Grundriss).
   - **Bäume:** `jungleTreeGeo` (Brettwurzeln, gekrümmter Stamm, Äste, Blattballen, Lianen) und `pineGeo` (hängende, zerfranste Etagen); beide liefern `[Holz, Laub]`. `leafTexture()` und `barkTexture()` sind Canvas-Detailmaps.
   - **Weitere Typen:** `cactusGeo` (gerippt, Arme), `crystalGeo`, `iceShardGeo`, `fernGeo` (Wedel).
   - **Start-/Zieltor:** `gateGeo` – Lathe-Türme mit Kragen und Finnen, Fachwerkträger, Lampengehäuse.
   - Je Typ 2–4 Varianten (`placeV`, mehrere Teile teilen sich Instanz-Matrizen).
3. **KI:** neue Spurraster-Pfadsuche in dichten Hindernisfeldern (≥ 3 Hindernisse im Fenster):
   - 15 Spuren × 14 Reihen (alle 4 Samples), DP über Blockierung + Querruck + Ideallinie.
   - In dünn besetzten Feldern bleibt das klassische Ausweichen.
4. **Verifiziert**
   - `tsc` sauber, Build ok (≈ 2,0 MB).
   - WebGPU-Renders: Boonta (Tor, Hoodoos), Dschungel (Bäume), Frost (Eissplitter).
   - Sims 30 s: Boonta 0 Tote, Henker 3, Malastare 3, 0 NaN, 0 Wanddurchdringung.

### Bekannt / offen
- **Sim ist nicht deterministisch.** Baseline (alte `physics.ts`) hat ebenfalls Tote: Henker ≈ idx 805–860, Malastare ≈ idx 955–990. Diese Toten sind **keine Hindernis-Kollisionen** (sie bleiben mit beiden KI-Varianten) → Ursache prüfen (Rampen/Lücken/Pod-Pod?). Siehe `TODO.md` §1.
- **Dreiecke:** Dschungel ≈ 10 M (vorher 5,4 M) durch echte Bäume → Impostor-LOD nötig (`TODO.md` §1).
- **Frost:** die Nadelbäume dort stammen offenbar nicht aus `scatterDecor` → Quelle suchen (`grep ConeGeometry`).

### Test setup (nach jedem Sandbox-Reset)
Kurz: `bash tools/harness/setup.sh` (ab Session 9). Manuell:
```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright@1.49.1 && npx playwright install chromium
mkdir -p /tmp/libs/debs /tmp/libs/state/lists/partial /tmp/libs/cache/archives/partial && cd /tmp/libs/debs
apt-get -o Dir::State::Lists=/tmp/libs/state/lists -o Dir::Cache=/tmp/libs/cache -o Debug::NoLocking=1 update
apt-get -o Dir::State::Lists=/tmp/libs/state/lists -o Dir::Cache=/tmp/libs/cache download libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 libxkbcommon0 libwayland-server0 libxi6 libxtst6 libxshmfence1 libvulkan1 libxrender1 libxext6 libx11-6 libxcb1 libxau6 libxdmcp6 libbsd0 libmd0
for f in *.deb; do dpkg-deb -x "$f" /tmp/libs/root; done
```

### Frühere Sessions
- S5: Gelände-Splatting, Bewuchs, Rauch, Leben, Landmarken.
- S4: offene Landschaften, Halbschluchten, Landmarken, BatchedMesh, Gelände-LOD, Set-Pieces, Wetter.
- S3: Trefferkreis-Kollision, Chunking, Streckendetails, Geysire, 4 neue Strecken.
- S2: WebGPU + TSL. S1: High-Poly-Podracer.

### Wichtig für den nächsten Agenten
- Lokaler Commit ist **nicht gepusht**; die Sandbox verliert `.git` → Wiederherstellung siehe `CLAUDE.md`.
- Neue Materialien: Texturbudget (16/Stage) beachten, gepackte Kanäle nutzen (`CLAUDE.md` → Rendering rules).

### Nächster sinnvoller Schritt (S7)
Auf echter Hardware messen (FPS am Start, Ultra). Dann Pod-Materialien zusammenlegen (≈ 2 h).

### Nächster sinnvoller Schritt (S6)
`TODO.md` §1: Todeszonen Henker idx ≈ 805 / Malastare idx ≈ 958 analysieren (≈ 45 min; Test: `tools/harness/run.sh game "s13:30,s9:30"`).
