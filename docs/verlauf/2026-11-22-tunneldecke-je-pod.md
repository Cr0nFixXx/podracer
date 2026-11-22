# Stand: 2026-11-22 – Tunneldecke je Pod (Folge-Commit zum Merge)

> **Verlauf.** Wörtlich aus dem früheren `HANDOFF.md` übernommen (Doku-Umbau am 2026-11-22). Verweise wie „Abschnitt … unten", „`HANDOFF.md` → …" oder „Regeln in `CLAUDE.md`" meinen den Stand von damals: die Protokolle stehen heute in diesem Ordner ([Übersicht](README.md)), die Regeln in `docs/regeln/`.

*Zwischenstand – überholt durch den Abschnitt darüber: `POD_BOX` und `podHeight` sind durch die Hülle ersetzt, die Prüfungen neu geschrieben, die offenen Punkte am Ende dort erledigt oder neu eingeordnet.*

**Fehler:** Die Tunneldecke (`physics.ts`, Session 20 (Strecken)) hielt jeden Pod mit derselben Höhe draußen: 2,15 m über dem Pod-Ursprung. Am Modell gemessen sind viele Pods höher – Vrak Splitter-X 4,18 m (Haifinne), Pagali Ironclad 3,31 m, Quadra Lumber 3,27 m, Tenroc 6-Fach 2,96 m, Quill Voltspire 3,12 m (Cockpit-Spitze); mit dem Style-Teil „Haifinne" bis 3,95 m. Dazu hebt sich in Kurven das äußere Triebwerk (bis 1,95 m). Gegen die Decke gedrückt steckten solche Pods bis 3,5 m im Gewölbe.

**Lösung**
1. **`POD_BOX` in `podDesigns.ts`:** je Pod vier gemessene Zahlen – Oberkante der linken und der rechten Triebwerksseite, Oberkante des Cockpits, halbe Breite. Gemessen am Modell in seiner **größten Ausstattung** (Werk oder mit Teilen), nicht berechnet: der höchste Punkt ist ein Kabelmast, eine Lampe, eine Spitze oder eine Finne, die keine Formel kennt. Über `podEnvelope(def).box` erreichbar.
2. **`podHeight(env, liftL, liftR, roll)`** (`podDesigns.ts`): wie weit der Pod in seiner jetzigen Lage über seinen Ursprung reicht – das höhere von Cockpit und Triebwerksseiten (jede Seite mit ihrem momentanen Hub `engYL` / `engYR`), gedreht um die Messerflug-Rolle. Aufrecht ist das die gemessene Höhe, bei 90° die halbe Breite.
3. **`physics.ts`:** Grenze = Gewölbeschale − `podHeight(…)`. Sanftes Herunterdrücken (höchstens 45 m/s) und Schaden (`'top'`) sind unverändert.
4. **Pod-Audit** (`tools/ci/pods.ts`, neue Spalte `box`): misst jeden Pod neu (Werk + die drei Teile-Kombinationen) und schlägt fehl, wenn eine Zahl mehr als 2 cm zu klein oder 5 cm zu groß ist oder ein Pod keine Zeile hat. Die Meldung nennt die gemessene Zeile zum Übernehmen. Gegengeprüft (einmalig): die drei Kombinationen des Audits ergeben dieselbe Höhe und Breite wie alle 192 Kombinationen aus 4 Finnen × 4 Einlässen × 4 Düsen × 3 Tuning-Stufen.
5. **Zwei neue Unit-Prüfungen** (`tools/ci/unit.ts`, jetzt 71):
   - „pushed up against the vault": jeder Pod wird im Tunnel 2,5 s lang nach oben gedrückt – aufrecht (Scheitel, Flanke, linkes Triebwerk 1,5 m angehoben), in halber Rolle nach beiden Seiten und im Messerflug. Gemessen wird der höchste Punkt des Modells Eckpunkt für Eckpunkt. 84 Fälle: höchstens 0,007 m über der Schale. Mit der alten Regel: 38 Fälle im Gewölbe, 0,08 – 3,48 m.
   - „every pod fits under every tunnel": an jedem überdachten Sample aller 13 Strecken, von der Mittellinie bis zur Wand, liegt die Deckengrenze über der Höhe, in der ein Pod fährt (Anheben-Taste gehalten; aufrecht, Triebwerk voll angehoben, halbe Rolle, Messerflug). Engste Stelle: 0,50 m Luft (Tarn Cyclone im Messerflug auf Magma-Inferno, 22 m neben der Mittellinie bei 14 m halber Fahrbahnbreite, Decke 27 m).
6. **`tools/ci/sim.ts`:** der Deck-Selbsttest hebt Pod 1 in den letzten 2 s eines Laufs nicht mehr an. Erreichte der Pod den ersten Tunnel erst im letzten Augenblick, endete der Lauf vor den geforderten 20 Bildern auf dem Deck – ein Fehlalarm (so aufgetreten auf Mos Espa: 1 Bild, „FAIL").

**Entscheidung dabei (bitte prüfen):** ein Pod zählt immer so hoch wie seine größte Ausstattung. So ändern Teile nie das Fahrverhalten, und kein Teil steckt in der Decke. Preis: ein Pod ohne Finne wird etwas früher gebremst, als er hoch ist (Aurora XR-7 ab Werk: 0,70 m). Alternative: Höhe je montierter Ausstattung.

**Was sich beim Fahren ändert**
- Normales Fahren: nichts. Aufrecht bleiben auch an der Tunnelwand, mit gehaltener Anheben-Taste und voll angehobenem Triebwerk, mindestens 3,3 m Luft (einmalige Messung über alle Strecken).
- Fliegt ein hoher Pod an die Decke, stoppt er jetzt früher (Splitter-X: 2,03 m).
- Messerflug: die Grenze ist die halbe Breite statt „2,15 m + 95 % der halben Spannweite". Rechnerisch lag die alte Grenze für einen breiten Pod im Messerflug mit gehaltener Anheben-Taste stellenweise bis 1,2 m **unter** der Fahrhöhe (Magma, Dschungelfluss, Kristallschlucht – dort, wo die Wand weit neben der Fahrbahn steht; einmalige Messung). Das entfällt.

**Verifiziert**
- `npm run check`: grün in 41 s – Typecheck, 71 Unit-Prüfungen, Pod-Audit (14 Pods), Simulation 13/13 (0 NaN, 0,00 m Wanddurchdringung, Bodenfreiheit ≥ 0,67 m, 1 Ausfall auf dem Kristallschlucht-Sprint).
- Deckenkontakte in der Simulation (einmalig mitgezählt): im 45-s-Lauf genau **einer** – Malastare, Tenroc 6-Fach, Sample 964: der Pod kommt aus einem Sprung 20,8 m über der Straße in den Tunnel, seine Oberkante liegt 1,26 m über der Schale, er wird in 3 Bildern heruntergedrückt (kein Schaden, er fällt bereits). Mit `GRIP=0.88` und `SECS=120`: keiner.
- Vergleich mit dem Merge-Commit: jede Strecke einzeln (`TRACK=<id>`) byte-gleich, ebenso `GRIP=0.88` und `SECS=120` (0 „downward teleports"). Im Gesamtlauf sind die ersten 8 Zeilen gleich; ab Malastare weichen die Zahlen ab, weil alle Strecken einen Zufallsstrom teilen und der eine Deckenkontakt ihn verschiebt.
- Gegenprobe gegen `main` (`ROSTER_OLD=1 ARMOR=0 PARTS=0`): alle Tabellenzeilen gleich; es fehlt nur die Deck-Selbsttest-Zeile von Oovo IV (Punkt 6: der Pod erreicht den Tunnel dort in den letzten 2 s und wird nicht mehr angehoben).
- `npm run build`: 17 600 129 Bytes. Harness-Bundle `game.js` neu gebaut (19 743 706 Bytes), `pods.js` unverändert.
- `papp.mjs` auf diesem Build (Quill Voltspire auf dem Frostspalt-Ring, WebGL2 in Software): „App smoke test passed." – der Test fährt nicht an eine Tunneldecke, er zeigt nur, dass das Spiel weiter startet und läuft.
- Typprüfung von `tools/ci` und `tools/harness`: weiter nur die vier bekannten Fehler in `unit.ts`, keine neuen.

**Nicht verifiziert / offen** (steht auch in `TODO.md`)
- Im Browser nicht angesehen: kein Pod wurde im laufenden Spiel an eine Decke geflogen.
- Die Decke wird **über der Pod-Mitte** geprüft. An der Flanke fällt das Gewölbe nach außen ab (am Fahrbahnrand rechnerisch etwa 1,4 m je Meter) – die äußere Triebwerksseite kann dort weiter ins Gewölbe reichen. Nicken (Bug hoch) ist ebenfalls nicht eingerechnet.
- In halber Rolle ist die Grenze vorsichtig: der Pod stoppt 0,2 – 1,6 m unter der Decke (Ecke des Kastens um den Pod).
- **Überkopf-Bauten** (Sponsor-Brücken, Startportal, Bögen) rechnen weiter mit festen 1,5 m (`physics.ts`, `ext`). Nicht angefasst – nicht Teil des Auftrags.
- Die Portal-Regel (`p.upper`: aufs Deck oder in den Tunnel) entscheidet weiter mit Pod-Mitte + 1,2 m.
