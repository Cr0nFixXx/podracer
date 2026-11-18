# TODO

## 1. Als Nächstes
- [ ] FPS auf echter GPU messen (Start, Ultra mit CSM/GTAO/SSR)
- [ ] **Transparente Objekte aus dem MRT-Pass nehmen** (Layer + zweiter Pass) → GTAO/SSR-Artefakte um Partikel/Glas im WebGPU-Kompatibilitätsmodus
- [ ] Nutzer-Feedback zu verbliebenen Grafikfehlern einholen (Screenshot + Map + Preset)
- [ ] **FPS auf echter GPU messen** (Start mit 8+ Pods, Ultra mit GTAO/SSR); Ergebnis in HANDOFF eintragen
- [ ] **Nahe Pods:** ~45 Draws je Pod (≈ 16 Materialien) → Material-Atlas oder BatchedMesh über alle Pods
- [ ] Schattenkarte: Kaskaden oder Update jedes 2. Frame für statische Geometrie
- [ ] **Todeszonen analysieren:** Henker idx ≈ 805–860, Malastare idx ≈ 955–990 – auch mit alter KI, also keine Hindernisse; Rampe/Lücke/Pod-Pod prüfen (Event-Log je Tod ausgeben)
- [ ] Ladezeit messen (Bewuchs ≈ 3 `heightAt` je Instanz; ggf. Web Worker)
- [ ] Sound: Vögel, Herden, Sandkriecher, Geysire, Rotoren, Fallgitter

## 2. Landschaft
- [ ] Herden fliehen auch vor KI-Pods (aktuell nur vor dem Spieler); Staubfahne beim Galopp
- [ ] Vögel: Landeplätze auch auf Felsnadeln und Landmarken; Flügel im Sitzen enger anlegen
- [ ] Busch-Billboards: Helligkeit an Sonnenstand/Schatten anpassen (aktuell unbeleuchtet)
- [ ] Nasse Zonen auch an den Becken der Gelände-Wasserfälle; Rinnsal quer über die Fahrbahn
- [ ] Linsentropfen in den Grafikeinstellungen abschaltbar machen

## 3. Strecken
- [ ] Steigungen/Schrägkurven je Strecke feinjustieren (`RELIEF_GRADE`, Bank-Faktor 48, Randhöhe 7 m) nach Fahrtest
- [ ] Kuppen mit Abheben bei hohem Tempo (aktuell klebt der Pod durch den Boden-Dämpfer eher am Boden)
- [ ] Höhenprofil der Strecke im Streckenmenü anzeigen; HUD-Steigungsanzeige
- [ ] Alle 14 Strecken einzeln prüfen: Abzweigungen, Tunnel, Brücken mit dem neuen Relief
- [ ] Weitere Set-Pieces: Schwenkbrücken, rollende Felsen, einstürzende Eisbrücken
- [ ] KI: Rotor-Timing lesen
- [ ] Energiefeld: aufleuchtende Feldfläche

## 4. Podracer
- [ ] Schadensgeometrie, Startnummern, Pilot-Spezies, Hitzeflimmern, Livery-Auswahl im Hangar

## 5. Performance / Tooling
- [ ] CSM auf echter GPU messen; wenn günstig, auch für High standardmäßig an
- [ ] CI: `tools/ci/sim-check.sh` + Referenzbilder mit `diff.mjs` in einem Skript bündeln

## Erledigt (Session 16)
- [x] Steigungen: Hügelfeld + Steigungsbegrenzer, Ziel 5–11 % je Strecke, Schutzzonen an Start/Ziel/Rampen
- [x] Schrägkurven: Überhöhung bis 7 m Randhöhe, weich ein-/ausgeleitet, eben an Start, Rampen, Röhren, Abzweigungen
- [x] Physik: Hangabtrieb, Boden-relativer Schwebe-Dämpfer, Einlenk-Bonus in Schrägkurven, Pod liegt parallel zur Fahrbahn
- [x] KI-Referenztempo berücksichtigt Überhöhung; Wasserspiegel unter dem tiefsten Fahrbahnrand
- [x] `tools/harness/relief.ts`

## Erledigt (Session 15)
- [x] Herden, Riesen, Gleiter und Sandkriecher umgehen Landmarken, Felsnadeln, Tafelberge und Fälle
- [x] Herden fliehen vor dem Spieler (Galopp, weiches Umdrehen)
- [x] Vögel landen auf Felsbrocken und fliegen auf, wenn der Spieler naht
- [x] Landmarken und Bodenbewuchs bleiben aus den Fall-Korridoren
- [x] Nasse Fahrbahn unter Wand-Kaskaden, Linsentropfen beim Durchfahren
- [x] Gelände-Detail je Welt (u. a. Windverwehungen im Schnee)
- [x] Ferne Büsche als Billboards

## Erledigt (Session 14)
- [x] Wasserfall-Rauschen / Lava-Grollen nach Abstand
- [x] Nebel bzw. Glutfunken am Fallfuß, Spritzer beim Durchfahren einer Kaskade
- [x] Fälle bevorzugt dort, wo sie von der Strecke aus sichtbar sind
- [x] Bäume und Felsen stehen nicht mehr im Fall

## Erledigt (Session 13)
- [x] Wasserfälle an den Schluchtwänden entlang der Strecke (Dschungel-Welten) mit Ablaufgitter, Schaum und Gischt

## Erledigt (Session 12)
- [x] Baum-Impostors für den Horizont (1 Draw, Dither-Übergang)
- [x] Lavafälle (Vulkanwelt), Eisfälle (Ando Prime), Wasserfälle wo Gefälle vorhanden – mit Becken und Dampf
- [x] Straßenoberfläche: feine Körnung + Spurrinnen statt Grübchen

## Erledigt (Session 11)
- [x] Deko-Distanz-LOD (Felsen, Dschungel- und Nadelbäume) über `CellInstancer`
- [x] Boulder-Detail begrenzt (≤ 5120 Dreiecke)
- [x] Verschneite Nadelbäume auf Ando Prime (`snowMat.ts`)
- [x] Hot-Path-Allokationen in `updateVisuals` entfernt

## Erledigt (Session 10)
- [x] KI: Power-Slide, kurveninnere Luftbremse, 90°-Rolle in Feldern ohne Lücke, Nase runter auf Geraden
- [x] KI-Überleben: Hindernis-Sicherheitspass, kurzer Lenkpunkt beim Ausweichen, KI-Kontaktschaden × 0,35
- [x] HUD-Lage-Anzeige (Rolle, Neigung, Luftbremsen, SLIDE/ROLLE), Slide-Staub + Sound
- [x] SSR mit Normalen aus Tiefe, MRT nur noch metalrough
- [x] Sim-Forensik (letzte Events je Tod), `probe.ts`

## Erledigt (Session 9)
- [x] CSM verifiziert und im Ultra-Preset aktiv (Harness `?csm`)
- [x] GTAO vollständig kompatibel mit Rauch/Abgasen (Normalen aus Tiefe), MRT nur noch für SSR
- [x] Partikel auf GPU (Ringpuffer, analytische Bewegung im Vertex-Shader), neue Rauch-Wölkchen
- [x] Harness-Pixel-Diff (`diff.mjs`), `sim` als CI-Check (`tools/ci/sim-check.sh`), `setup.sh`
- [x] CSM eingebaut (opt-in, siehe offen)
- [x] Neue Steuerung: Handbremse/Slide, 90°-Rolle, Neigen/Anheben, Q/E einzeln, Strg beide
- [x] Triebwerke heben beim Lenken vertikal ohne Neigung; Neigung nur synchron per ↑/↓

## Erledigt (Session 8)
- [x] Start-Ruckler: LOD-Proxies + Shader-Warm-up beim Laden, KI-LOD ab 18 m
- [x] Hindernisse −45 %, Mindestabstand, Warnring + Bake
- [x] Staub/Abgasrauch deutlich dezenter
- [x] Kein Einsinken: Roll begrenzt, Body-Lift nach Roll/Bank/Pitch
- [x] Triebwerke federn dynamisch beim Lenken

## Erledigt (Session 7)
- [x] GTAO-Fehler behoben (three-r187-Gather-Bug im Kompatibilitätsmodus gepatcht, GTAO neu parametriert + Denoise + Himmelsmaske)
- [x] Flackernde Reflexionen: geometrisches Specular-AA (`specAA.ts`) für Straße, Gelände, Pods
- [x] Deko-Instancing in Zellen mit Distanz-Culling und Nah-Schatten (`instCells.ts`)
- [x] Pod-LOD ab 30 m (2 Draws), Pod-Schatten nur bis 110 m
- [x] Bewuchszellen 260 m; Harness-Metriken + `?ultra`

## Erledigt (Session 6)
- [x] KI-Pfadsuche über alle Hindernisse im Sichtfenster (Spurraster-DP, nur in dichten Feldern)
- [x] Neue Deko-Geometrie (`decorGeo.ts`): Felsen, Hoodoos, Tafelberge, Dschungelbäume, Nadelbäume, Kakteen, Kristalle, Eissplitter, Farne
- [x] Detailliertes Start-/Zieltor (Fachwerk, Türme, Lampengehäuse)
- [x] Box-UV + Vertex-AO für alle Deko-Objekte; 2–4 Varianten je Typ

## Erledigt (Session 5)
- [x] Gelände-Texturen: Splatting Sand/Kies/Becken/Fels, Gesteinsschichten je Welt, Wolkenschatten
- [x] Bodenbewuchs als Instancing mit Dichte nach Abstand (Zellen, Sichtweite je Typ, Dither-Fade, Wind)
- [x] Rauchsäulen ohne Partikel (Billboards) + Staub-/Schnee-/Methanteufel
- [x] Leben: Vögel, Herden, Langhals-Riesen, Sandkriecher, Gleiter, Himmelsverkehr, Patrouillen, Lastkähne
- [x] Mehr Details: Krayt-Skelett, Feuchtfarm, Steinkreis, Leuchtturm, Salzpfannen, gefrorene Seen, Sümpfe, Lavakrusten, Sandverwehungen
- [x] Fixes: Texturlimit (Packing), Wasserspiegel im Dschungel, God-Ray-Streifen, Schaden-Cooldowns, Set-Pieces nicht auf Hindernisfeldern
