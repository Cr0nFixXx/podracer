# Stand: 2026-11-22 – Skill-Set eingerichtet, zwei Fehler behoben, Klima wirkt auf den Boost

Auftrag des Nutzers: (1) das Skill-Set `mattpocock/skills` installieren; (2) Fehler: rückwärts ist die Lenkung nicht invertiert · Höhlen und Abkürzungen haben am Anfang Geometriefehler und sind teilweise versperrt; (3) Aufgaben: `TODO.md` Abschnitt 5 · Klima/Wetter wirkt auf den Boost · Pulverschnee als feiner 3D-Schnee mit Spuren · überarbeitete Textur-/Terrainübergänge · offenere Streckenabschnitte mit Felsen und Wänden als Grenze.

Diese Datei hält fest, was davon erledigt ist. Was offen bleibt, steht in `TODO.md` (Abschnitte 5 und 8).

## Entscheidungen des Nutzers (eine Fragerunde, `grilling`)
| Frage | Entscheidung | Folge |
|---|---|---|
| Einrichtung der Skills (Tracker, Status-Namen, Glossar-Name) | **„erstmal keine ticket skills"** | kein Issue-Tracker, kein `.scratch/`; `CONTEXT.md` behält seinen Namen; `TODO.md` bleibt die Übersicht |
| Wetter/Klima → Boost | **nur die Hitze** | umgesetzt (Punkt 4) |
| Pulverschnee | **3D-Schneedecke mit Spuren, und die Spuren ändern das Fahren** (gespurter Schnee ist schneller) | offen, `TODO.md` Abschnitt 8 |
| Textur-/Terrainübergänge | **alle drei Arten** (Pistenrand ↔ Gelände, Untergrund-Wechsel, im Gelände) | offen, `TODO.md` Abschnitt 8 |
| Offenere Abschnitte | **auf allen Natur-Untergründen** Leitplanken, Randsteine, Pistenkante weg; Felsreihen und Felswände als feste Grenze; gebaute Decks behalten Geländer | offen, `TODO.md` Abschnitt 8 |
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
- Anzeige: im Renn-Menü ein Satz unter Tageszeit und Wetter; im Rennen am Hitzebalken „KÜHLE LUFT −18 %" oder „HEISSE LUFT +11 %" (ab 3 %).

## Geprüft
- `npm run check` grün: 96 Unit-Prüfungen (11 neue), Pod-Audit, Sim 13 / 13 Strecken.
- Neue Prüfungen, vorher rot: `steering: …` (1 von 2), `forks: …` (5 von 5: Gelände bis 14,5 m über der Fahrbahn, Wand neben der Boonta-Einfahrt 36,5 m hoch), `boost climate: …` (3 von 3). `clipOutside` ist neuer Code.
- Bilder (WebGL2 in Software, „Hoch"): Boonta-Kessel – Einfahrt und Ausfahrt der Abkürzung aus Pilotenhöhe, eine normale Schlucht; Frostspalt-Ring – Höhlengabelung und Wiedervereinigung. Die Platten und die verschmierten Felsbrocken sind weg, die Wege frei.

## Nicht geprüft
- Auf echter GPU nichts. In der Sandbox rendert nur Software.
- Gabelungen der anderen elf Strecken nur gemessen, nicht angesehen. Höhlen von Magma-Inferno, Dschungel, Kristall, Howler nicht angesehen.
- Die Kappen auf den Felswänden zeigen aus der Nähe eine gestreckte Textur (helles Band an der Oberkante). Das gehört zu den Übergängen (`TODO.md` Abschnitt 8).
- Die Anzeigen zum Klima (Renn-Menü, Hitzebalken) sind nicht im Browser angesehen, nur typgeprüft.
- In der Frostspalt-Höhle bleibt an der Gabelung eine schmale Felsrippe (0,5 m) stehen, wo die Abschlusswand in die Haupthöhle ragt.
- Rückwärtslenken ist nicht von Hand gefahren.

## Git
- Commits auf `dev`, nicht gepusht (der Nutzer hat diesmal keinen Push verlangt): `5a21dc9` Skills · `0c03a22` Rückwärtslenkung · `7690d96` Gabelungen · `e3f739c` Klima und Boost · der Commit mit dieser Datei.

## Erledigt (aus dem Auftrag)
- [x] Skill-Set installieren → ohne Ticket-Skills eingerichtet
- [x] Fehler: rückwärts ist die Lenkung nicht invertiert
- [x] Fehler: Höhlen/Abkürzungen haben am Anfang Geometriefehler und sind teilweise versperrt
- [x] Das Klima/Wetter hat Einfluss auf die Boost-Funktion
