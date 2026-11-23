# Stand: 2026-11-22 – Skill-Set eingerichtet, zwei Fehler behoben, Klima und Boost, Schneedecke mit Spuren, Felsgrenzen statt Leitplanken

Auftrag des Nutzers: (1) das Skill-Set `mattpocock/skills` installieren; (2) Fehler: rückwärts ist die Lenkung nicht invertiert · Höhlen und Abkürzungen haben am Anfang Geometriefehler und sind teilweise versperrt; (3) Aufgaben: `TODO.md` Abschnitt 5 · Klima/Wetter wirkt auf den Boost · Pulverschnee als feiner 3D-Schnee mit Spuren · überarbeitete Textur-/Terrainübergänge · offenere Streckenabschnitte mit Felsen und Wänden als Grenze.

Diese Datei hält fest, was davon erledigt ist. Was offen bleibt, steht in `TODO.md` (Abschnitte 5 und 8).

## Entscheidungen des Nutzers (eine Fragerunde, `grilling`)
| Frage | Entscheidung | Folge |
|---|---|---|
| Einrichtung der Skills (Tracker, Status-Namen, Glossar-Name) | **„erstmal keine ticket skills"** | kein Issue-Tracker, kein `.scratch/`; `CONTEXT.md` behält seinen Namen; `TODO.md` bleibt die Übersicht |
| Wetter/Klima → Boost | **nur die Hitze** | umgesetzt (Punkt 4) |
| Pulverschnee | **3D-Schneedecke mit Spuren, und die Spuren ändern das Fahren** (gespurter Schnee ist schneller) | umgesetzt (Punkt 5) |
| Textur-/Terrainübergänge | **alle drei Arten** (Pistenrand ↔ Gelände, Untergrund-Wechsel, im Gelände) | offen, `TODO.md` Abschnitt 8 |
| Offenere Abschnitte | **auf allen Natur-Untergründen** Leitplanken, Randsteine, Pistenkante weg; Felsreihen und Felswände als feste Grenze; gebaute Decks behalten Geländer | erster Schritt umgesetzt (Punkt 6), Rest in `TODO.md` Abschnitt 8 |
| Wo sind die Fehler an Höhlen/Abkürzungen? | **bei (fast) allen** | Punkt 3 |

## Was gemacht wurde
### 1. Skill-Set `mattpocock/skills`
- 27 Skills (Plugin 1.3.2, Commit `abeeaf9`) liegen in `.agents/skills/<name>/SKILL.md`. Von Hand kopiert: der Installer `npx skills@latest` braucht Node ≥ 22.20, die Sandbox hat Node 20.
- Nicht im Repo (`.gitignore`). Neu installieren: `docs/regeln/git-sandbox.md` → „Skills".
- `CLAUDE.md` → „Agent skills": welche Skills genutzt werden (`grilling`, `diagnosing-bugs`, `tdd`, `code-review`, `domain-modeling`, `writing-for-agents`) und welche nicht (die Ticket-Skills).

### 2. Rückwärts lenkt der Pod wie ein Auto
- Ursache: die Drehrate hing nur vom Betrag der Geschwindigkeit ab, nicht von der Fahrtrichtung.
- Jetzt: fliegt der Pod rückwärts, ist die Drehung gespiegelt – Stick nach rechts schwenkt das Heck nach rechts (`dirF` in `stepPod`). Bei Stillstand ist die Lenkwirkung 0 wie bisher, es springt nichts.
- Nur die Lenkung ist gespiegelt, der Zug einer beschädigten Triebwerksseite nicht. Gegner fahren nie rückwärts.

### 3. Höhlen und Abkürzungen: Eingänge frei (`diagnosing-bugs`)
Vier Ursachen, gefunden mit Bildern, in denen je ein Material ausgeblendet war, und mit einer Messung im Node:
- **Gelände an Gabelungen:** die Höhe kam nur vom nächstgelegenen Streckenpunkt. So stand das Felsmassiv der einen Piste auf der anderen, und der Boden sprang, wo der nächste Punkt die Seite wechselte. Jetzt stimmen zwei Abschnitte ab, der tiefere Boden gewinnt (`evalMulti` in `terrain.ts`).
- **Geländenetz:** seine Zellen sind 4,5 / 7 / 13,75 m groß („Ultra" / „Mittel", „Hoch" / „Niedrig"). Eine Wand direkt hinter der Wandfläche kann es nicht abbilden: schräge, verschmierte Geländeflächen standen vor den Felswänden und auf dem Pistenrand – überall, an Gabelungen am stärksten. Das Massiv beginnt jetzt 1,5 Zellen hinter der Wand; die Wand hat dafür einen Rücken (eine Kappe von der Oberkante zurück zum Boden). An Gefällen liegt der Boden neben der Piste tiefer.
- **Felswand der Hauptpiste:** sie endete neben der Einfahrt in voller Höhe (bis 50 m). Jetzt läuft sie über 16 Punkte auf einen 1,2 m hohen Felsbord aus. Niedrige Wände haben keine Zacken mehr (`lowK`).
- **Höhlen:** die Abschlusswand eines Abzweigs war ein Fächer aus großen Dreiecken. Er blieb ganz stehen, sobald eine Ecke im Fels lag – eine flache Platte mitten in der Gabelung. Jetzt ist die Wand fein geteilt und wird exakt entlang der Haupthöhle geschnitten (`clipOutside`, `meshClip.ts`).

Messung „Geländenetz über der Fahrbahn" (`tools/ci/poke.ts`, alle 13 Strecken, Zahl der Messpunkte):

| Zellgröße | vorher | nachher |
|---|---|---|
| 4,5 m („Ultra") | 3 742 | ≤ 71 |
| 7 m („Mittel", „Hoch") | 8 635 | 44 |
| 13,75 m („Niedrig") | 23 599 | ≤ 72 |

Der Rest sind die Falten der Fahrbahn (`TODO.md` Abschnitt 5) und zwei Becken-Ränder, alle unter 1,5 m.

### 4. Klima und Wetter ändern die Boost-Hitze
- Faktor = Klima der Welt × Tageszeit × Wetter, begrenzt auf 0,75 … 1,25. Aufheizen beim Boosten × Faktor, Abkühlen ÷ Faktor. Die Boost-Kraft bleibt gleich. Gilt für Gegner.
- Kühl: Regen −10 %, Gewitter und Schneeböen −16 %, Nebel −4 %, Nacht −8 %, Eiswelt −6 %. Heiß: Sandsturm +18 %, Aschesturm +20 %, Tag auf heißen Welten +5 %, Wüste und Vulkan +6 %. Der Untergrund zählt wie bisher dazu (Lavasee × 1,6).
- Beispiele Tag / Nacht: Wüste klar 1,11 / 1,02 · Sandsturm 1,25 / 1,23 · Eiswelt klar 0,94 / 0,89 · Schneeböen 0,79 / 0,75 · Dschungel Gewitter 0,91 / 0,82 · Aquilaris Gewitter 0,81 / 0,76 · Oovo IV immer 1,00.
- Anzeige: im Renn-Menü neben dem Wort „Wetter" („Boost-Hitze −16 %", Erklärung beim Überfahren mit der Maus). Zuerst stand dort ein eigener Satz – der machte den Bildschirm bei 1280 × 720 um 21 px zu hoch (`pui.mjs` schlug an), deshalb die kurze Form; im Rennen am Hitzebalken „KÜHLE LUFT −18 %" oder „HEISSE LUFT +11 %" (ab 3 %; seit dem 2026-11-23 unter dem Balken – in der Zeile darüber passte es nicht).

### 5. Pulverschnee: eine Schneedecke, die sich die Spuren merkt
- **Daten** (`snowField.ts`): über jedem Pulverschnee-Feld liegt ein Raster aus 1-m-Zellen. Jede Zelle hält, wie fest der Schnee ist (0 frisch … 255 fest). Frostspalt-Ring: ein Feld, 474 Streckenpunkte (0,95 km), 116 × 948 Zellen.
- **Fahren** (`stepPod`): jeder Pod stempelt alle 0,75 m unter seinen beiden Triebwerksbänken (Radius 1,5 m). Eine Überfahrt festigt die Spur etwa zur Hälfte, vier Überfahrten zu rund 90 %. Höchsttempo: frisch 93 %, fest 98,5 %. Haftung: 90 % → 95 %. Gilt für alle Pods; die Gegner suchen die Spuren nicht, fahren sie aber entlang ihrer Linie selbst ein.
- **Bild** (`snowDeck.ts`): eine Schneeschicht je Feld, 58 cm dick, mit flachen Wellen und feinem Korn. Spuren sind bis 39 cm tief, bläulicher und glatter; daneben ein aufgeworfener Rand. Die Schicht läuft an beiden Enden des Feldes über 24 m aus und fällt neben der Piste in den Boden ab.
- **Wetter:** bei Schneeböen schneien die Spuren zu – eine feste Spur ist nach rund 2,5 Minuten voller Böen wieder frisch.
- **Dazu:** dichte Schneefahne in frischem Pulver, kaum eine auf fester Spur. HUD: „Pulverschnee · gespurt – trägt besser".

### 6. Offene Abschnitte: Felsgrenzen statt Leitplanken (erster Schritt)
- Auf jedem Naturboden (alles außer dem gebauten Deck) steht statt der Leitplanke eine niedrige, unregelmäßige Felsreihe: 2,6 bis 7 m hoch, einzelne Felsnasen bis 12 m. Gebaute Decks, Tunnel, Brücken, Rampen und Zero-G behalten ihre Geländer, Seen und Plateaus ihre Baken.
- Der Fels steht genau dort, wo die Leitplanke stand (Tore und Bögen sind für diese Breite gebaut). Er ist fest wie eine Schluchtwand; wer höher fliegt als der Fels, wird nur zurückgedrückt.
- Entlang der Felsgrenzen gibt es keine Reflektoren, keine Wandlampen und keine Randsteine mehr.
- Anteil der Streckenpunkte mit Leitplanke auf beiden Seiten, vorher → nachher: Boonta 69 → 9 %, Frostspalt 67 → 16 %, Magma 62 → 9 %, Dünenpass 52 → 12 %, Dschungel 59 → 11 %, Aquilaris 56 → 31 %, Oovo IV 71 → 31 %, Kristall 60 → 12 %, Malastare 48 → 25 %, Mos Espa 66 → 10 %, Howler 44 → 16 %, Methan 66 → 40 %, Executioner 55 → 30 %. Was bleibt, ist gebautes Deck (Start/Ziel, Rampen, auf Oovo IV und dem Executioner auch die Stationsdecks).
- Nicht gebaut: schwankende Breite, einzelne Felsbrocken an der Grenze (`TODO.md` Abschnitt 8).

## Geprüft
- `npm run check` grün: 103 Unit-Prüfungen (18 neue), Pod-Audit, Sim 13 / 13 Strecken – auch mit den Felsgrenzen.
- Neue Prüfungen, vorher rot: `steering: …` (1 von 2), `forks: …` (5 von 5: Gelände bis 14,5 m über der Fahrbahn, Wand neben der Boonta-Einfahrt 36,5 m hoch), `boost climate: …` (3 von 3), `snow: …` (4 von 4). `clipOutside` ist neuer Code. `open sections: …` (3): der Schalter `NO_ROCK_BORDERS` zeigt, dass die Prüfung fallen kann.
- Bilder (WebGL2 in Software, „Hoch"): Boonta-Kessel – Einfahrt und Ausfahrt der Abkürzung aus Pilotenhöhe, eine normale Schlucht; Frostspalt-Ring – Höhlengabelung und Wiedervereinigung. Die Platten und die verschmierten Felsbrocken sind weg, die Wege frei.

- Schneedecke: Bilder in WebGL2 (frisches Feld, gestempelte Spuren aus Pilotenhöhe und von oben, vier Sekunden echtes Rennen mit acht Pods – Doppelspuren und Schneefahnen sind da). WebGPU-Check des Frostspalt-Rings (`check:gpu`): 0 Fehler, 0 Warnungen.
- Felsgrenzen: Bilder vom Boonta-Kessel (Sandpiste, offene Dünenfläche, Felspiste).
- Im Browser, die fertige App (`dist/index.html`): Rauchtest `papp.mjs` auf dem Frostspalt-Ring bei Schnee bestanden. Menüs in fünf Fenstergrößen (`pui.mjs`): zuerst rot – die eigene Zeile „Boost-Hitze" machte das Renn-Menü bei 1280 × 720 um 21 px zu hoch (741 px); sie steht seitdem neben „Wetter" (`e675bfb`), danach alle fünf Größen grün.

## Nicht geprüft
- Auf echter GPU nichts. In der Sandbox rendert nur Software.
- Schneedecke: Bildrate, das Aussehen bei Sonne (die Eiswelt war bedeckt), die Voreinstellung „Niedrig" (Netz alle 2 m), das Zuschneien im laufenden Rennen, Howler-Schlucht.
- Felsgrenzen: nur Boonta angesehen. Wie sie in Eis, Lava, Dschungel, Kristall und auf dem Mond aussehen, ist offen. Ihre Oberkante ist flach und zeigt die gestreckte Textur der Kappen.
- Ob sich die Rennen mit Felsgrenzen und Schneespuren gut fahren – nur die KI-Simulation lief.
- Gabelungen der anderen elf Strecken nur gemessen, nicht angesehen. Höhlen von Magma-Inferno, Dschungel, Kristall, Howler nicht angesehen.
- Die Kappen auf den Felswänden zeigen aus der Nähe eine gestreckte Textur (helles Band an der Oberkante). Das gehört zu den Übergängen (`TODO.md` Abschnitt 8).
- Die Anzeigen zum Klima (Renn-Menü, Hitzebalken) sind nicht im Browser angesehen, nur typgeprüft.
- In der Frostspalt-Höhle bleibt an der Gabelung eine schmale Felsrippe (0,5 m) stehen, wo die Abschlusswand in die Haupthöhle ragt.
- Rückwärtslenken ist nicht von Hand gefahren.

**Nachtrag 2026-11-23 – was davon inzwischen erledigt ist** ([Protokoll](2026-11-23-uebergaenge-felsreihen-buchten.md)):
- Die gestreckte Textur der Kappen und der Felsgrenzen ist behoben (`a97f7c8`); aus dem Felsband sind Reihen einzelner Felsen geworden (`fec860b`), angesehen auch auf Frostspalt, Magma, Dschungel, Aquilaris, Oovo IV und Malastare.
- Die Höhlen von Magma-Inferno, Dschungel und Kristall sind angesehen und haben neues Material und Lampenlicht (`765c551`); Howler weiter nicht.
- Die Anzeigen zum Klima sind im Browser angesehen: das Renn-Menü passte nicht (siehe „Geprüft"), die Anzeige am Hitzebalken brach in zwei Zeilen um – beides behoben.

## Git
- Commits auf `dev` (am 2026-11-23 auf Wunsch des Nutzers gepusht, zusammen mit der Folgerunde): `5a21dc9` Skills · `0c03a22` Rückwärtslenkung · `7690d96` Gabelungen · `e3f739c` Klima und Boost · `f97e425` Doku · `3a809b5` Schneedecke · `e675bfb` Renn-Menü (Boost-Hitze neben „Wetter") · `cadfc78` Felsgrenzen.

## Erledigt (aus dem Auftrag)
- [x] Skill-Set installieren → ohne Ticket-Skills eingerichtet
- [x] Fehler: rückwärts ist die Lenkung nicht invertiert
- [x] Fehler: Höhlen/Abkürzungen haben am Anfang Geometriefehler und sind teilweise versperrt
- [x] Das Klima/Wetter hat Einfluss auf die Boost-Funktion
- [x] Pulverschnee soll feiner realistischer 3D-Schnee sein, der bei Durchfahrten dynamisch Spuren hinterlässt → Schneedecke mit Spuren, gespurter Schnee ist schneller; Feinschliff nach der Probefahrt steht in `TODO.md` Abschnitt 5
- [x] Offenere Streckenabschnitte: keine fest abgesteckten Strecken, Begrenzungen durch Felsen oder Wände → erster Schritt: Felsgrenzen statt Leitplanken; Rest in `TODO.md` Abschnitt 8
