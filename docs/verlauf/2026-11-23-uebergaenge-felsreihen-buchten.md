# Stand: 2026-11-23 – Übergänge, Felsreihen und Buchten, keine Falten, Höhlen-Optik, Farne, Schnee-Fotos

Auftrag des Nutzers: „weiter" – der Rest des Auftrags vom 2026-11-22 ([Protokoll](2026-11-22-skills-fehler-klima.md)): überarbeitete Textur- und Terrainübergänge (Entscheidung: alle drei Arten), offenere Streckenabschnitte (keine fest abgesteckten Strecken, Felsen oder Wände als Grenze), `TODO.md` Abschnitt 5.

Was offen bleibt, steht in `TODO.md` (Abschnitte 5 und 8). Die Regeln, die daraus entstanden sind, stehen in `docs/regeln/` (`grafik.md`, `strecken.md`, `tests.md`).

## Was gemacht wurde
### 1. Übergänge am Pistenrand und zwischen Untergründen, Felsreihen (`fec860b`)
- **Eine Naturpiste hat keinen sichtbaren Rand mehr.** `world.ts` baut je Passage ein Gitter: linker Rand · Piste · rechter Rand, mit glatten Normalen über die Kante. Neben einer Felsgrenze läuft der Boden als Schulter über die Pistenkante hinaus, senkt sich auf das GEZEICHNETE Gelände (`terrainMeshHeight` – die Höhe des Netzes, nicht des Höhenfelds; ein Streifen auf dem Feld schwebte oder tauchte ab) und dünnt dort aus. Neben einer Schluchtwand liegt er 1,7 m breit am Wandfuß an.
- **Hinter einer Felsgrenze steht kein Massiv mehr** – das Land dahinter bleibt offen.
- **Untergründe wechseln weich** (`fade: 'soft'`: alpha-geblendet statt ausgeschnittener Flecken). Sand- und Schneeverwehungen sind Streifen des losen Bodens der Welt, die zur Pistenmitte ausdünnen und entlang der Strecke kommen und gehen (vorher: deckendes Band mit gerader Innenkante).
- **Felsreihen statt Felsband:** `borderRocks.ts` (reine Daten, läuft auch in node) legt einzelne Felsen an die Grenzlinie – sie berühren die Kollisionslinie, überlappen sich und sind etwa so hoch wie die Grenze, die die Physik kennt; dahinter einzelne kleinere. Ein Fels, der in der Innenkurve in die Piste ragen würde, rückt nach außen oder entfällt. Etwa 190 Felsen je Kilometer Grenze, Radius 1,5–6 m; 848 (Malastare) bis 3 237 (Oovo) Felsen je Strecke (gezählt vor den Buchten, die die Reihen neu gewürfelt haben).
- Kosten, Boonta, vier Ansichten, vorher → nachher: gezeichnete Meshes 260 → 296, 282 → 314, 263 → 290, 410 → 454; Dreiecke +6,4 %, +5,1 %, +7,9 %, +3,0 %. *(Die Zahlen in der Commit-Nachricht von `fec860b` sind falsch: `pdbg` behielt damals die Sichtbarkeit der ersten Ansicht. Diese hier sind nachgemessen.)*

### 2. Felswände (`a97f7c8`)
- Die Textur läuft mit der Länge des Wandprofils statt mit seiner Höhe – an den zurückgelehnten Bänken und der flachen Kappe war das Bild bis 2,5-fach gestreckt (das verschmierte Band an jeder Oberkante). Liegt das Land hinter der Wand höchstens 3,5 m neben ihrer Oberkante, legt sich die äußere Hälfte der Kappe auf das Gelände und dünnt dort aus (`cliffBlend`).

### 3. Schnee ohne Fußspuren (`d7f9758`)
- Neue CC0-Fotosets von ambientCG: `Snow010A` (Schnee), `Snow008A` (Pulverschnee). Sechs Dateien, 0,54 MB statt 1,41 MB.

### 4. Die Fahrbahn faltet sich nicht mehr (`e147742`)
- Wo die Piste breiter ist, als ihr Knick erlaubt (halbe Breite > Kurvenradius), lag das Band auf der Innenseite über sich selbst. Solche Knicke werden jetzt ausgerundet: die Mittellinie wird dort – und nur dort – geglättet, bis die halbe Breite höchstens 0,85 × Radius ist. Die Piste behält ihre Breite; Strecken ohne solchen Knick bleiben bitgleich.

| Strecke | halbe Breite / Radius vorher | nachher |
|---|---|---|
| Boonta | 2,80 | 0,84 (Länge 9,63 → 9,40 km) |
| Mos Espa | 1,29 | 0,85 |
| Aquilaris | 1,05 | 0,89 |
| Dünenpass | 0,92 | 0,84 |
| Kristall | 0,91 | 0,84 |
| Frostspalt | 0,85 | 0,83 |

- Prüfung `layout: …` (Schwelle 0,9), vorher rot auf fünf Strecken. Zwei Fehlversuche stehen in `docs/regeln/strecken.md` (Mittellinie nach außen schieben; Glätten ohne die Samples neu zu verteilen).
- Dazu: Becken (Plateau, See) in enger Kurve überlappen jetzt vor und nach dem Scheitel – sonst entstand zwischen den Baken und der Kurvenmitte ein felsgesäumtes Loch (gesehen auf dem Boonta-Plateau, sobald die Kehre ausgerundet war).
- Folge auf Boonta: die Kehre vor dem Plateau hat Radius 65 statt 20 m, alle Passagen haben sich verschoben.

### 5. Höhlen-Optik (`765c551`)
- Fels im Tunnel (Gewölbe, Höhlenböden, Stirnwände, Tropfsteine) wird in Weltkoordinaten von drei Seiten aufgelegt (`caveMaterial`) – die Schichtung liegt an den Wänden waagerecht, statt dem Gewölbebogen zu folgen; die Wirbel in den Höhlenkammern sind weg.
- Das Licht der Lampen und Glutadern ist je Eckpunkt eingebacken (`aLit`) – kostet keine Lichtquelle. Die Menge richtet sich nach der Helligkeit der Welt (`CAVE_LIGHT = [1.5, 0.12]`: dunkle Welten viel, helle wenig – mit der dunklen Menge leuchtete die Dschungel-Höhle lindgrün). Die Felswände der Vulkan-Höhle sind nicht mehr schwarz.
- Unter einem Dach schalten die Pods ihre Lampen ein (nur in Rennen, die überhaupt Lampen haben).

### 6. HQ-Farne (`a7d18bd`)
- Zwölf Wedel als Karten mit gezeichneter Textur (128 × 512), 96 Dreiecke je Farn (vorher 90).

### 7. Steine der Bodendeckung, Werkzeug `pick:` (`64fcf6d`)
- Steine und Kiesel tragen das Fels-Set ihrer Welt. `pdbg` kann mit `pick:<x>_<y>` das Mesh unter einem Bildpunkt benennen – die „weißen Felsen ohne Textur" waren diese Steine, die „weißen Eier" Hütten in 115 m Entfernung.

### 8. Fels ist Fels (`1ff3374`)
- Auf Aquilaris und Oovo IV ist die Wand gebaut (Metallplatten, Stationsverkleidung). Felsbrocken, Felsreihen, Bögen und steiles Gelände trugen dort diese Platten. Jetzt gibt es zwei Namen in `world.ts`: `wallTex` / `wallMat` für Gebautes, `rockTex` / `rockMat` für Gewachsenes (`hasBuiltWall` in `data.ts`). Steiles Gelände ist auf Aquilaris jetzt Fels mit Moos. Tunnel einer gebauten Wand behalten ihre Platten (Oovo-Tunnel und Meeresröhre sehen aus wie vor der Höhlen-Optik).

### 9. Gelände: Fels nach der steilsten Fläche (`5886fec`)
- Entlang jeder niedrigen Klippe lief eine Reihe Felszähne, einer je Gitterzelle: das Material mischte Fels nach der Normalen der Eckpunkte ein, und die ist am Fuß und an der Kante einer niedrigen Klippe flach. Jetzt trägt jeder Eckpunkt die Steilheit der steilsten Fläche, die in ihm zusammentrifft (`aSplat.w`). Prüfung `terrain: every face …`, vorher rot.

### 10. Buchten (`af8d8f9`)
- Wo beide Seiten Felsgrenzen sind, öffnet und schließt sich die Piste: weite Buchten (je Seite bis 0,55 × halbe Breite, höchstens 18 m, 150–400 m lang) und kleine Einbuchtungen (bis 5 m, alle 50–100 m). Nur breiter als entworfen, nie schmaler. Die Ideallinie der Gegner folgt der entworfenen Breite; Ausweichen und Überholen nutzen die Bucht. Schalter `NO_BAYS`.
- Gemessen: von 51 km zwischen zwei Felsgrenzen sind 47 % mehr als 2 m je Seite breiter (14 km mehr als 5 m, 4 km mehr als 10 m); 2 bis 15 Buchten je Strecke, die größte 9 m (Malastare) bis 18 m.
- Gegner über drei Seeds, mit Buchten gegen ohne: Schnitt 109,9 gegen 110,1 m/s, langsamster Pod 100,3 gegen 100,8 m/s, kein zerstörter Pod.
- Dabei gefunden und behoben: ein Fels der Reihe bekam seine Höhe von einer geschätzten Stelle vor ihm statt von der Stelle, an der er steht (bis 2 m zu niedrig).
- In Schrägkurven bleibt die Bucht klein (der Rand höchstens 1,5 m höher oder tiefer als entworfen) – ohne diese Grenze stand das gröbste Gelände-Netz (13,75 m, niedrigste Geometrie-Stufe) auf Boonta 0,5 m über dem Fahrbahnrand.

### 11. Kabel im Tunnel, eine geklärte Sichtung (`e702794`)
- Die Oberleitungs-Kabel der Schluchten wurden auch quer durch Tunnel gespannt (dünne dunkle Linie am Gewölbe des Boonta-Tunnels) – nicht mehr.
- Geklärt, kein Fehler des Spiels: die „verschmierten Streifen" in der Frostspalt-Ansicht `g` sind die Schürze eines Gelände-Blatts; die Debug-Kamera steht dort unter der Erde.

### 12. Anzeige „Kühle Luft / Heiße Luft" am Hitzebalken (`63949ae`)
- Beim Rauchtest gesehen: die Klima-Anzeige vom 2026-11-22 stand in der Zeile über dem Balken neben „BOOST-HITZE" und der Prozentzahl. Die drei passen nicht in die 230 px des Tachos – „BOOST-HITZE" und „KÜHLE LUFT −21 %" brachen je in zwei Zeilen um. Sie steht jetzt unter dem Balken links (gegenüber von „MAX"); solange der Antrieb überhitzt ist, gehört die Zeile der Marke „BEREIT".
- `tools/harness/papp.mjs` prüft das jetzt: jede Beschriftung des Tachos auf einer Zeile, innerhalb des Tachos, ohne Überlappung (am alten Build rot, am neuen grün).

## Geprüft
- `npm run check` grün am Endstand: 114 Unit-Prüfungen (11 neue seit dem Vortag), Pod-Audit, Sim 13 / 13 Strecken.
- Neue Prüfungen: `rock rows: …` (3; die erste war rot: auf Boonta standen drei Felsen bis 0,5 m in der Piste), `layout: the road never folds …` (rot auf fünf Strecken), `terrain: every face …` (rot), `open sections: the road opens into bays …` (rot), `open sections: a bay keeps its distance …` (hält die Grenzen der Buchten fest), `open sections: the terrain stays below the road in every bay of …` (4 Strecken; rot ohne die Grenze für Schrägkurven: 0,51 m auf Boonta).
- `tools/ci/poke.ts`, alle Strecken, Gelände-Netz 4,5 / 7 / 13,75 m: 0 Punkte über der Fahrbahn.
- WebGPU-Check (`check:gpu`, Software; übersetzt die Shader nach WGSL), je bestanden ohne Fehler oder Warnung in der Konsole: Boonta am Endstand (mit Buchten und ihrer Grenze für Schrägkurven), Frostspalt und Kristall (Stand `5886fec`), Aquilaris und Oovo (`1ff3374`), Dschungel (`a7d18bd`), Magma (`765c551`).
- Beide Builds am Endstand grün: `npm run build` (16,5 MB), `npm run build:web`.
- Rauchtest der fertigen App (`papp.mjs`: Menü → Rennen → HUD → Pause → Tastenbelegung) bestanden: Frostspalt-Ring bei Schnee (vor der Korrektur am Hitzebalken; danach dort nur das Laden und die neue Tacho-Prüfung: grün) und Magma-Inferno bei klarem Tag am Endstand (komplett). Die Menüs (`pui.mjs`) liefen nicht noch einmal – `src/ui/screens.tsx` ist seit dem letzten grünen Lauf unverändert.
- Bilder (WebGL2 in Software, „Hoch"), meist vorher/nachher: Boonta (Pistenrand, Klippen, Dünen, Plateau, Tunnel, Buchten von oben und aus Pilotenhöhe), Frostspalt (Schnee, Felsreihen, Buchten), Magma (Höhle, Tunnel), Dschungel (Höhle, Farne, Buchten), Aquilaris und Oovo (Felsreihen, Tunnel), Kristall (Höhle), Malastare, Mos Espa (ausgerundeter Knick).

## Nicht geprüft
- Auf echter GPU nichts. Alle Bilder sind Software-WebGL2 bei „Hoch"; „Niedrig" und „Ultra" nie gesehen. Was das Ganze an Bildrate kostet, ist offen.
- Gefahren ist nichts davon – nur die KI-Simulation lief. Das gilt für Buchten, Felsreihen, ausgerundete Knicke, Schneespuren und Rückwärtslenken.
- Buchten: beide Seiten öffnen sich gemeinsam. Angesehen auf Boonta, Frostspalt, Dschungel, Aquilaris; die anderen neun Strecken nur gemessen.
- Felsreihen: die Kollision ist die glatte Linie, die Felsen ragen bis 0,25 m hinein; sie werfen keine Schatten. Über dem Fels drückt weiter das Energiefeld zurück.
- Höhlen: Fahrbahn und Pods bekommen kein Lampenlicht (die Fahrbahn der Lavahöhle bleibt schwarz). Der Oovo-Tunnel ist fast schwarz – war er schon vorher. Nicht angesehen: Unterführungen, Höhlen von Frostspalt und Howler, Malastare, Methan, Executioner.
- Farne nur im Dschungel gesehen, ihr Wiegen im Wind gar nicht. Steine auf Boonta, Frostspalt, Magma.
- Gemischter Boden zusammen mit Spiegelungen (SSR) nie gesehen.
- Ausgerundete Knicke: Boonta und Mos Espa angesehen, vier Strecken nur gemessen.
- Aquilaris: die Oberkanten der Stadtmauern sind moosgrün getönt, von oben ein breites grünes Kachelband – nicht angefasst (Frage in `TODO.md` Abschnitt 5).
- Hitzebalken: der überhitzte Zustand (Marke „BEREIT", die Klima-Anzeige ist dann ausgeblendet) und „ÜBERZOGEN" sind nicht im Bild gesehen.
- Der optionale WebGPU-Job der GitHub-Action ist noch nie gelaufen; auf GitHub liegt von dieser Runde nichts.

## Git
- Commits auf `dev`, nicht gepusht (der Nutzer hat keinen Push verlangt): `fec860b` Übergänge und Felsreihen · `a97f7c8` Felswände · `d7f9758` Schnee-Fotosets · `e147742` Falten · `765c551` Höhlen-Optik · `a7d18bd` Farne · `64fcf6d` Steine, `pick:` · `1ff3374` Fels ist Fels · `5886fec` Fels nach der steilsten Fläche · `af8d8f9` Buchten · `e702794` Kabel im Tunnel · `63949ae` Hitzebalken · der Commit mit diesem Protokoll.

## Erledigt (aus dem Auftrag und aus `TODO.md`)
- [x] Abschnitt 5 – **HQ-Farne:** Wedel als Alpha-Karten mit Textur
- [x] Abschnitt 5 – **Höhlen-Optik:** Felsschichtung läuft nicht mehr gebogen; die Felswände der Vulkan-Höhle sind nicht mehr schwarz → Rest in `TODO.md` Abschnitt 5: Lampenlicht auf Fahrbahn und Pods
- [x] Abschnitt 5 – **Schnee-Fotoset** ohne fußspurartige Flecken
- [x] Abschnitt 5 – **Fahrbahn faltet sich in sehr engen Knicken** weiter offener Flächen
- [x] Abschnitt 8 – **Textur- und Terrainübergänge** (alle drei Arten) → Rest in `TODO.md` Abschnitt 8: Ufer der Becken, Schwellen der übrigen Geländeschichten
- [x] Abschnitt 8 – **Offenere Abschnitte:** einzelne Felsen statt Band, schwankende Breite (Buchten) → Rest in `TODO.md` Abschnitt 8: unabhängige Seiten, Becken mit Baken, Energiefeld über dem Fels
