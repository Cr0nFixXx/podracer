# 2026-11-25 – Zwischentest des Nutzers (nach sechs Punkten von Block 3)

Der Nutzer hat den Stand `72a581d` gefahren und elf Punkte gemeldet. Sie werden vor dem Rest von Block 3 abgearbeitet, dann wird gepusht, dann geht es mit den offenen Schritten weiter (Sprünge, Flug-Deko, Block 4 – [Protokoll davor](2026-11-23-nach-der-probefahrt.md)).

## Auftrag (wörtlich)
> # kleiner test zwischenstand:
> hier ein paar punkte. arbeite diese erst ab pushe dann und mach dann weiter mit den restlichen schritten + .
>
> ## Veresserungen
> - **intro-flug:** ist viel zu schnell. lieber in podracer geschwindigkeit (ohne boost)
> - **sprünge:** reduziere die generelle sprung weiter. diese ist gerade bei boost zu weit.
> - **flug deko:** der himmel ist teilweise ziemlich voll mit zeppelinen. veringer die anzahl der flug deko um 20% - ersetzte aber sonst wie geplant
> - etwas besser sichtbare spuren im sand
> - etwas nähere verfolger cam
> - tuning teile auch lackierbar machen
> - schatten und reflektions auflösung erhöhen
>
> ## Bugs
> - **schwerkraftstunnel:** man kann durch den boden tauchen.
> - man sieht das erzeugen seiner eigenen spuren bei normaler geschwindigkeit nicht (langsam sieht man es etwas) (nur verfolger ansicht)
> - im hauptmenü werden beim ausgewählten podracer nicht die eingebauten teile angezeigt.
> - gegner nehmen kein schaden wenn ich sie ramme, nur ich.

Reihenfolge: erst die vier Fehler, dann die sieben Verbesserungen. Jeder Punkt ein eigener Commit.

## Was gemacht wurde

### Fehler 1 – Schwerkrafttunnel: man konnte durch den Boden tauchen
- **Ursache:** Die Röhre ist ein Kreis von 30–56 m Radius um eine Achse, die nur 7 m über der Fahrbahn liegt. „Sinken" durfte den Pod wie „Steigen" bis 70 % des Radius von der Achse wegschieben – das sind 14–32 m unter der Fahrbahn. Der feste Boden galt in der Schwerelosigkeit nicht.
- **Jetzt:** Nach unten endet der Weg auf Schwebehöhe über der Fahrbahn (`ZG_DOWN` in `physics.ts`), zusätzlich hält `stepPod` den Pod dort fest (kein Aufsetzen, kein Schaden). Zur Seite und nach oben bleibt es bei 70 %.
- **Nebenbei gefunden:** Die treibenden Felsbrocken durften bis 12 m unter der Achse hängen – einige steckten in oder unter der Fahrbahn (Oovo IV z. B. bei Abtastpunkt 855 und 5640). Ihr tiefster Punkt bleibt jetzt mindestens 1,2 m über der Fahrbahn (`buildZgRocks`). Folge: es hängen mehr Brocken auf Flughöhe als vorher.
- **Geprüft:** neue Prüfung `zerog: the pod cannot dive through the deck …` (erst rot: Pod 15,5 m unter der Fahrbahn; dann grün – alle vier Röhren, mit Lenken links / rechts, mit 45 m/s nach unten geworfen, alle Brocken über 60 s). Die alte Prüfung der Reichweite erwartet nach unten jetzt Schwebehöhe. Bild `zf` (Oovo IV, „Sinken" gehalten, Verfolger- und Seitenansicht: Pod 3,0 m über der Fahrbahn; Brocken schwebt über der Fahrbahn). Simulation 200 s: Oovo IV 0 Ausfälle, Brocken 1 × getroffen (vorher 4 ×); Executioner 0 Ausfälle, 3 × (vorher 2 ×).
- **Nicht geprüft:** das Gefühl am Boden der Röhre mit echter Steuerung.

### Fehler 2 – die eigenen Spuren entstehen bei normalem Tempo nicht sichtbar (Verfolger-Ansicht)
- **Ursache:** Ein Streifen wuchs in Stücken von 4 m und wurde über 0,4 s eingeblendet. Bei 120 m/s lag er schon 48 m hinter dem Pod, bevor er zu sehen war – die Verfolger-Kamera fliegt 13,5–18,5 m hinter dem Pod. Langsam (30 m/s) waren es 12 m: deshalb „langsam sieht man es etwas".
- **Jetzt:** Das jüngste Stück eines Streifens wächst in jedem Bild mit dem Pod mit, seine Vorderkante liegt unter den Triebwerken. Eingeblendet wird nach Flugzeit je Eckpunkt über 0,04 s (`TRACK_FADE_IN`) – bei 120 m/s ist der Streifen 5 m hinter den Triebwerken voll da.
- **Geprüft:** neue Prüfung `tracks: a stripe grows right under the engines in every frame …` (erst rot, dann grün – bei 30, 120 und 190 m/s). Bilder Boonta-Sand bei 128 m/s, Verfolger-Ansicht: vorher (`tb`) kein Streifen hinter dem Pod, nachher (`ta`) zwei Streifen von den Triebwerken bis zur Kamera; Seitenansicht ebenso.
- **Nicht geprüft:** in Bewegung (nur Standbilder). Der Schneegraben im Pulverschnee war schon vorher sofort da (Bilder `sn` von Block 3, 120 m/s, Verfolger-Ansicht) – nicht neu angefasst.

### Fehler 3 – Hauptmenü zeigt den gewählten Pod ohne seine eingebauten Teile
- **Ursache:** Die Vorschau im Hauptmenü bekam Farben, Muster und Lack, aber weder die Style-Teile noch die Tuning-Stufen (`screens.tsx`). Hangar und Rennen bekamen sie.
- **Jetzt:** Das Hauptmenü reicht `kit` und `tune` durch. Jede Pod-Vorschau schreibt, was sie zeigt, in `data-pod-look` – daran prüft `pui.mjs`.
- **Geprüft:** `pui.mjs` (Fenster 1280) speichert ein Profil mit Teilen, lädt neu und vergleicht Hauptmenü und Hangar. Vorher rot (`Hauptmenü aurora|000|0000000|0`, `Hangar aurora|213|2212122|1`), nachher grün (beide `aurora|213|2212122|1`).

### Fehler 4 – Gegner nehmen keinen Schaden, wenn ich sie ramme
- **Befund:** Beide Pods bekamen bei einer Berührung denselben Schaden, je zur Hälfte auf beide Triebwerke (bei 18 m/s: 5,5 je Triebwerk). Am Gegner war davon nichts zu sehen: kein HUD, Rauch erst unter 40 %, nur 22–62 m von der Kamera entfernt und mit einem Drittel der Dichte. Der eigene Schaden stand dagegen sofort im HUD.
- **Jetzt (eigene Entscheidung, bitte prüfen):**
  - **Der Gerammte zahlt 1,5-fach, der Rammende 0,5-fach** – auf dem Triebwerk der getroffenen Seite. Wer rammt: wer quer zur Strecke in den anderen hineinfährt oder von hinten auffährt. Lenken beide ineinander, zahlen beide gleich. Die Regel gilt für Spieler und Gegner gleich.
  - Grundschaden: (Aufprall − 5 m/s) × 1, höchstens 16 – der Gerammte verliert also höchstens 24 (vorher × 0,85, höchstens 22 für jeden der beiden). **Nachtrag:** zuerst stand die Obergrenze bei 24. Die Simulation zeigte dann, dass ein stehender Pod (an einem Felsen hängengeblieben, hinter der Ziellinie geparkt) 36–43 je Auffahrer verlor und nach zwei Treffern weg war (Ausfälle auf 13 Strecken, drei Startwerte: 3 / 4 / 5). Mit 16: 1 / 0 / 0.
  - **Sichtbar am Gegner:** Funken, kurze Stichflamme und dunkler Rauch an seiner Flanke, Treffermarke auf seinem Rumpf. **HUD:** „Treffer · Name · Zustand %" für 3,5 s (rechts oben unter dem Untergrund), „Zerstört" wenn er explodiert. Rauchfahne des Gegners schon unter 60 % und in jeder Entfernung bis 170 m.
- **Geprüft:** zwei neue Prüfungen `ram: …` (erst rot: gerammt 11,1 gesamt, je Triebwerk 5,5; dann grün – von der Seite, von hinten, Spieler rammt Gegner und umgekehrt, beide lenken ineinander, leichte Berührung kostet nichts, das Ereignis nennt den Gegner und seinen Verlust). Bild `rm` (echte Spielschleife, Boonta): Spieler rammt mit 18 m/s → Gegner −19 bis −20 auf einem Triebwerk, Spieler −7 bis −9; Stichflamme und Funken zwischen den Pods; HUD-Wert `{name, hp 80}`. Drei Rammstöße: Triebwerk des Gegners bei 31–34 %, zwei Bruchteile ab. Simulation 13 Strecken × 120 s (nur Gegner): Ausfälle 1 → 1, Tempo gleich, verlorene Bruchteile 217 → 311.
- **Nicht geprüft:** wie es sich im Rennen anfühlt (zu stark / zu schwach?), die Rauchfahne in Bewegung – im Standbild ist sie dünn. Ein Gegner unter 38 % repariert mit bis zu 22 %/s und wird dabei langsamer: zerstören lässt er sich nur mit schnellen Folgetreffern.

### Verbesserung 1 – Intro-Flug im Tempo eines Podracers ohne Boost
- **Vorher:** 420 m/s auf Geraden (etwa dreifaches Renntempo – die frühere Entscheidung). **Jetzt:** `FLIGHT_SPEED` 145 m/s; die Pods erreichen ohne Boost je nach Racer 138–157 m/s. Ein Durchgang dauert 49 s (Malastare-100) bis 111 s (Oovo IV) statt 20–50 s; die Schleife läuft weiter, bis „Rennen starten" gedrückt wird.
- Der Fahrtwind im Ton bleibt wie vorher (Faktor an das neue Tempo angepasst).
- **Geprüft:** Prüfung `intro: a calm flight – at the speed of a pod without boost …` (erst rot: „420 m/s – the pods reach 138 … 157 m/s", dann grün auf allen 13 Strecken); die anderen vier `intro:`-Prüfungen grün. `pintro.mjs` läuft am Ende des Blocks mit dem fertigen Build (Schwelle „die Kamera fliegt" von 20 auf 8 m in sechs Bildern gesenkt).

### Verbesserung 2 – kürzere Sprünge
- **Gemessen vorher** (alle 29 Rampen, Aurora auf der Mittellinie): volles Tempo 160–310 m (1,2–2,4 s in der Luft, bis 23 m über der Kante), Boost 250–570 m, Boost + Nase hoch über 600 m – bei Lücken von 40–50 m. Die Steiggeschwindigkeit an der Kante war Rampensteigung × Tempo (bis 62 m/s) und hing vom Bild ab, in dem der Pod die Rampe verließ: dieselbe Rampe 144 m bei 60 Bildern/s, 215 m bei 120.
- **Jetzt:** Eine Rampe gibt jedem Pod dieselbe Steiggeschwindigkeit mit (`launchVy`: 16 m/s bis 60 m/s Tempo, 14 bei 90, 11 ab 180 m/s). Volles Tempo 89–126 m (0,65–0,92 s), Boost 99–159 m (eine Rampe auf Magma 186 m: dahinter fällt die Straße ab), langsam (60 m/s) 74–95 m – jede Lücke wird weiter überflogen. „Nase hoch" trägt über einer Lücke 13–24 % weiter (102–154 m; vorher etwa das Doppelte), „Nase runter" bringt den Pod nach 44–63 m herunter. (Die drei letzten Zahlen standen hier zuerst geschätzt – 62–70 m, 10–40 %, 44–50 m; am 2026-11-26 nachgemessen, die Prüfung druckt sie jetzt mit `DEBUG=1` je Rampe.)
- **Rampen:** 2–2,6 m hoch statt 4–6 m, erst sanft ansteigend, dann gerade bis zur Kante (8–9 % Steigung). Bei vollem Tempo passt das zur neuen Steiggeschwindigkeit – der Pod verlässt die Rampe ohne Knick. Die Länge der Rampen bleibt.
- **Verworfen:** doppelt so lange Rampen. Tunnel, Hindernisse und Böden werden um die Rampen herum gesetzt; mit längeren Rampen standen auf sechs Strecken Tunnel an anderer Stelle (Frostspalt, Magma, Heuler, Executioner, leicht Aquilaris und Methan). Mit unveränderter Länge ist der Aufbau aller 13 Strecken derselbe wie vorher (`info.mjs`, 0 geänderte Zeilen).
- **Geprüft:** drei neue Prüfungen `jump: …` (erst rot mit den Messwerten oben, dann grün – alle Rampen aller Strecken; Nase hoch / runter / langsam; 60 gegen 120 Schritte/s). Alle 184 Prüfungen grün. Simulation 13 Strecken × 120 s, drei Startwerte: 1 / 0 / 0 Ausfälle, längste Flugzeit 0,9–1,5 s (vorher 2,2–2,9 s). Bilder `jp` (Boonta: Rampe von vorn, Pod an der Kante, über der Schlucht, Seitenansicht).
- **Nicht geprüft:** das Gefühl im Rennen. **Für die Überarbeitung der Sprünge danach** (Lücken 70–90 m, ein weiter Sprung nur mit Boost): die heutige Reichweite reicht auf den kurzen Rampen nicht für 90 m (Frostspalt 89 m) – dort müssen Rampe oder Abwurf höher werden; „nur mit Boost" braucht eine Rampe, deren Abwurf vom Boost abhängt.

### Verbesserung 3 – Flug-Deko: 20 % weniger, Zeppeline ersetzt wie geplant
- **Vorher:** 40 Zeppeline × Detailstufe × Streckenlänge standen still am Himmel von Tatooine (Boonta, Mos Espa), den Tafelbergen (Dünenpass) und Aquilaris – bei „Hoch" 77 über Boonta, 87 über Mos Espa, 71 über dem Dünenpass und 104 über Aquilaris; bei „Ultra" 123, 140, 114 und 166.
- **Jetzt – Anzahl:** überall 20 % weniger (`flyerPlan` in `flyerGeo.ts`). In der neuen Zahl stecken auch die Logen (bis 8) und Holo-Tafeln (bis 10) – am Himmel selbst ist es deshalb auf den Wüstenwelten deutlich leerer als 20 %:

  | Strecke | Zeppeline „Hoch" | Flug-Deko „Hoch" | davon am Himmel | Zeppeline „Ultra" | Flug-Deko „Ultra" | davon am Himmel |
  |---|---|---|---|---|---|---|
  | Boonta | 77 | 61 | 43 | 123 | 98 | 80 |
  | Mos Espa | 87 | 69 | 51 | 140 | 112 | 94 |
  | Dünenpass | 71 | 56 | 38 | 114 | 91 | 73 |
  | Aquilaris | 104 | 83 | 73 | 166 | 132 | 122 |

  Die anderen neun Strecken hatten keine Zeppeline; sie bekommen nur Holo-Tafeln (8–10 bei „Hoch").
- **Jetzt – Modelle (bekannte Vorbilder, wie am 2026-11-23 ausgewählt):**
  - **Tatooine und Tafelberge:** Segelbarke (32 m, zwei rote Sonnensegel, Deckshaus, Reling), leichter Frachter (Untertasse mit zwei Mandibeln, Cockpit-Röhre an Steuerbord, Radarschüssel, blaues Triebwerksband am Heck), bis zu acht **Zuschauer-Logen** beidseits der Start-Geraden (52–430 m vor und hinter der Linie), die wie in der Mos-Espa-Arena auf- und absteigen (9–17 m Hub, einmal auf und ab in 18–32 s).
  - **Aquilaris:** Wolkenwagen (zwei orange Kapseln, Triebwerk dazwischen) und Transporter (weiße Muschelschale, Frachtkisten darunter).
  - **Alle 13 Strecken:** 8–10 **Holo-Werbetafeln** bei „Hoch" (25 × 14 m, durchscheinend, vier Motive, flackern leicht) neben der Strecke, dem ankommenden Pod zugedreht – etwa eine je Kilometer.
- **Jetzt – Bewegung:** Die Schiffe fliegen langsame Kreise (Barke 6–10 m/s, Frachter 14–26, Wolkenwagen 22–38, Transporter 5–9), Nase voraus, in die Kurve geneigt – mindestens 60 m über jeder Fahrbahn unter ihrem Kreis (der Intro-Flug fliegt 20–35 m hoch). Steht ein Tafelberg, eine Felsnadel oder ein Wahrzeichen unter dem Kreis, sucht sich das Schiff einen anderen Kreis oder überfliegt es mit 30 m Abstand.
- **Platzierung der Tafeln und Logen:** nie an Tunneln, Brücken, in der Schwerelosigkeit, an Lücken oder Rampen (auch nicht 260 m dahinter – dort fliegen Pods), nicht im Start-Bereich; nicht in Felsen, Bäumen, Masten oder Zuschauer-Decks (`buildWorld` merkt sich jetzt, wo etwas steht), und nichts steht zwischen Tafel und Fahrbahn.
- **Eigene Entscheidungen (bitte prüfen):**
  - Der zweite Flieger über Aquilaris ist ein **mittlerer Transporter** (Muschelform), nicht noch einmal der leichte Frachter von Tatooine – abgesprochen war „Wolkenwagen und Frachter".
  - Die Holo-Tafeln sind **25 m breit**. Mit 10 m und 16 m waren sie von der Fahrbahnmitte aus (Fahrbahn 70–110 m breit) nur ein Fleck. Die Scheibe ist dunkel getönt: eine helle, nur leuchtende Scheibe verschwand vor dem hellen Wüstendunst.
  - Die Werbetexte sind erfunden („Repulsor-Tec", „Kessel Fuel", „Grand Arena", „Toydarian Parts").
- **Geprüft:** vier neue Prüfungen `flyers: …` (drei davon erst rot, die vierte – Bewegung – kam am 2026-11-26 dazu und wurde mit zwei absichtlich eingebauten Fehlern gegengeprüft: falsche Neigung und rückwärts fliegende Schiffe lassen sie rot werden): Anzahl 20 % unter den Zeppelinen bei jeder Detailstufe und Streckenlänge; die Modelle haben die Form ihres Vorbilds (Segel breiter als der Rumpf, Cockpit allein an Steuerbord, zwei Kapseln, …) und keine nach innen gedrehten Flächen; auf allen 13 Strecken × 3 Detailstufen stehen Tafeln und Logen nur an freier Fahrbahn, zeigen die Tafeln zum ankommenden Pod, fliegt jedes Schiff hoch genug und um einen Test-Tafelberg herum; **Bewegung** (aus den Matrizen, die das Spiel je Bild schreibt – Boonta, Dünenpass, Aquilaris: 154 Schiffe zu je drei Zeitpunkten, 16 Logen): jedes Schiff fliegt mit der Nase voraus auf seinem Kreis, mit seinem Tempo, auf seiner Höhe und neigt sich zur Kreismitte; jede Loge steigt und sinkt an ihrem Platz zwischen ihren zwei Höhen. Bilder `fl` (Boonta, Dünenpass, Aquilaris, Mos Espa, Frostspalt, Kristallhöhlen bei Nacht): jedes Modell aus der Nähe, Tafeln und Logen aus Fahrersicht (Boonta und Aquilaris am 2026-11-26 mit dem fertigen Stand noch einmal: Barke, Frachter, Tafel, Start-Gerade; Wolkenwagen, Transporter, Tafel). WebGPU-Prüfung auf Boonta und Aquilaris („Ultra"): 0 Fehler und Warnungen.
- **Nicht geprüft:** wie die Bewegung aussieht (gesehen sind nur Standbilder; gerechnet ist sie, siehe oben) – also ob die Kreise natürlich wirken und ob das Flackern der Tafeln stört. Die Bildrate auf echter Hardware: die Flug-Deko kostet bei „Hoch" 84 000 (Aquilaris) bis 106 000 (Boonta) Dreiecke je Bild, bei „Ultra" 140 000–185 000 – das sind 4–8 % eines Bildes, ohne Schatten, in höchstens 12 Zeichenaufrufen.
- **Nebenwirkung:** Felsen, Kakteen und Felsnadeln stehen auf Boonta, Mos Espa, Dünenpass und Aquilaris an anderen Stellen als vorher (die Zeppeline verbrauchten Zufallszahlen, die jetzt fehlen). Hindernisse auf der Fahrbahn sind davon nicht betroffen.

### Verbesserung 4 – etwas besser sichtbare Spuren im Sand
- Deckkraft der Streifen im Sand (auch Dünen, Strand) von 0,115 auf 0,165, der Randlinie von 0,085 auf 0,12 – rund 45 % mehr. Asche und Mondstaub bleiben, wie sie waren (ihr Faktor wurde entsprechend gesenkt).
- **Geprüft:** Bild `tc` (Boonta-Sand, 128 m/s, Verfolger- und Seitenansicht) gegen `ta` (vorher): die zwei Streifen sind klar zu erkennen, bleiben aber dezent.

### Verbesserung 5 – etwas nähere Verfolger-Kamera
- Abstand 12 m + bis 4 m mit dem Tempo statt 13,5 m + bis 5 m, Höhe 4,1 m statt 4,5 m: bei vollem Tempo 14,5 m statt 16,2 m hinter dem Pod (rund 10 % näher). Die weite Kamera bleibt.
- **Geprüft:** Bilder `cm` (Boonta, 128 m/s und im Stand) und `cn` (Frostspalt mit dem Brute – sein Cockpit hängt am weitesten hinten: nichts ragt ins Bild). Im Pulverschnee sieht man dabei auch den Graben direkt hinter dem Pod entstehen.

### Verbesserung 7 – Schatten- und Reflexions-Auflösung erhöht
- **Schatten:** Karten 2048 / 3072 / 4096 statt 1024 / 1536 / 2048 (Stufe 1 / 2 / 3) – ein Schattenpixel ist 12 / 10 / 9 cm groß statt 23 / 20 / 18 cm. Mit Kaskaden („Ultra") hat die nahe Kaskade 8 cm. Gilt sofort für jedes gespeicherte Profil (die Stufe ist gespeichert, nicht die Größe).
- **Reflexionen:** Spiegelungen auf nasser Fahrbahn, Eis und Wasser laufen bei „Hoch" mit 100 % der Bildauflösung statt 75 % („Mittel": 75 % statt 50 %, dort sind sie aber aus). Ein gespeichertes Profil hat seine eigene Zahl – es wird beim ersten Laden einmal um denselben Faktor angehoben (`GFX_REV` 2), danach gilt, was im Menü steht. Der gespiegelte Himmel (auf Pods, Eis, Wasser) hat 512 statt 256 Pixel je Würfelseite.
- **Geprüft:** zwei neue Prüfungen `resolution: …` (erst rot: „quality 1: map 1024, 23 cm per texel", „[0.75, 1]"; dann grün). Bild `sh` (Boonta): der Schatten des Pods zeigt beide Triebwerke und das Cockpit getrennt, vorher ein weicher Fleck. WebGPU-Prüfung auf „Ultra" (zwei Kaskaden mit 4096, Himmel 512): 0 Fehler und Warnungen.
- **Nicht geprüft:** die Bildrate auf echter Hardware. Die größeren Karten kosten Füllrate und Speicher (4096² = 64 MB je Karte). Wenn es ruckelt: Schattenqualität eine Stufe tiefer, Spiegelungs-Auflösung auf 75 %.

### Verbesserung 6 – Tuning-Teile lackierbar
- **Vorher:** Die Anbauteile waren blankes Metall; nur Steuerflächen, Panzerplatten und Finnen trugen Lack – immer die zweite Farbe.
- **Jetzt:** Im Hangar-Reiter „Teile" gibt es „Lack der Teile": **Werk (Metall) · Farbe 1 · Farbe 2 · Eigene Farbe** (mit Farbwähler und Farbfeldern). Lackiert werden die Gehäuse aller Anbauteile – Tuning-Teile und Style-Teile: Nachbrennerring, Hutzen, Radiatorplatten, Steuerflächen, Repulsor-Gehäuse und -Pads, Panzerplatten, Reparatureinheit, Finnen, Irisblende, lange Düse, Paddel, Zackenkrone. Rippen, Leitungen, Gelenke, Gitter und Leuchten bleiben. Gegner fahren weiter ab Werk.
- **Eigene Entscheidung:** eine Wahl für alle Anbauteile zusammen, nicht je Teil. Wenn du je Teil eine Farbe willst, sag es.
- **Geprüft:** zwei neue Prüfungen `kit paint: …` (erst rot; dann grün – auf allen 14 Pods: gleich viele Dreiecke wie ab Werk, alles Lackierte in der gewählten Farbe, jedes Tuning-Teil nimmt Lack; die Wahl übersteht das Speichern). Bilder `kp3` (Hangar und Hauptmenü mit eigener Farbe Grün: Düsen, Ringe, Hutzen, Radiatoren, Panzerbänder und Finnen grün, Leitungen kupfern). `pui.mjs` öffnet den Reiter „Teile" mit eigener Farbe: nichts ragt heraus, Hauptmenü und Hangar zeigen dasselbe.
- **Nicht geprüft:** jede Kombination aus Pod und Teil im Bild (14 Pods × 3 Lackarten) – nur die Aurora.

## Abschluss der Liste (2026-11-26)
Alle elf Punkte sind gebaut, jeder in einem eigenen Commit. Danach lief der fertige Stand durch alle Prüfungen.

### Geprüft
- **`npm run check` grün:** Typprüfung, 192 Unit-Prüfungen, Pod-Audit, Simulation auf allen 13 Strecken.
- **Beide Builds gebaut:** `npm run build` (`dist/index.html`, 16,55 MB) und `npm run build:web` (`build/`).
- **Im gebauten Spiel** (Chromium, Software-Grafik, je ein Lauf):
  - `pintro.mjs` auf WebGL und auf WebGPU: der Intro-Flug läuft mit dem neuen Tempo (in sechs Bildern 22 → 60 m und 29 → 80 m geflogen – die Bilder der Software-Grafik sind lang), Enter startet das Rennen. Nur auf WebGL geprüft: Gamepad A, Gamepad Start und ein Mausklick starten das Rennen, „Neustart" zeigt den Flug nicht noch einmal.
  - `papp.mjs`: HUD, Schadensseiten, die neue HUD-Zeile nach einem Rammstoß („Treffer · Mavik Hollo · 58 %"), Pause (Ton, Grafikmenü), Tastenbelegung.
  - `pui.mjs` in fünf Fenstergrößen: nichts scrollt, nichts ragt heraus. Hauptmenü und Hangar zeigen denselben Pod mit Teilen und eigener Teile-Farbe. Der Reiter „Teile" mit offenem Farbwähler passt im Quer- und im Hochformat (das Hochformat prüft der Test seit dem 2026-11-26 mit).
  - `ppad.mjs`: jedes Bedienelement ist mit dem Gamepad erreichbar, auch der neue Lack-Wähler (Hangar-Reiter „Teile": 56 Elemente).
- **Nachträge beim Abschluss:**
  - Die Prüfung `profile: Style-Teile are clamped into range …` war seit dem Commit „Anbauteile lackierbar" rot (ein Teilesatz trägt jetzt auch `paint`). Das blieb unbemerkt, weil vor jenem Commit nur einzelne Prüf-Gruppen liefen. Im Flug-Deko-Commit korrigiert. Seitdem läuft vor jedem Commit der ganze Unit-Lauf.
  - Sprünge: drei Zahlen im Abschnitt oben waren geschätzt statt gemessen – nachgemessen und korrigiert (bei 60 m/s 74–95 m; Nase hoch 13–24 % weiter; Nase runter 44–63 m).
  - Flug-Deko: die Bewegung wird jetzt gerechnet geprüft (vierte Prüfung); die Bilder von Boonta und Aquilaris sind mit dem fertigen Stand wiederholt.

### Nicht geprüft – bitte selbst fahren
Alles lief in Software-Grafik, ohne Ton, ohne echtes Gamepad und fast nur als Standbild. Was nur am echten Gerät zu beurteilen ist:

| Punkt | Was ansehen | Stellschraube |
|---|---|---|
| Schwerkrafttunnel | Boden der Röhre mit „Sinken" (Oovo IV, Executioner): hält er, fühlt er sich weich genug an? | `ZG_DOWN` in `physics.ts` |
| Eigene Spuren | Verfolger-Ansicht bei vollem Tempo auf Sand: entstehen die Streifen direkt hinter den Triebwerken? Deckkraft recht? | `TRACK_FADE_IN`, `TRACK_BAND` in `groundTracks.ts` |
| Rammen | Stärke (Gerammter 1,5-fach, Rammender 0,5-fach, höchstens 24), HUD-Zeile, Rauch des Gegners | `RAM_*` in `physics.ts` |
| Intro-Flug | Tempo 145 m/s – ruhig genug? | `FLIGHT_SPEED` in `introFlight.ts` |
| Sprünge | Weite bei vollem Tempo (89–126 m) und mit Boost (99–159 m) | `JUMP_VY` in `physics.ts`, Rampenhöhe `h` in `data.ts` |
| Flug-Deko | Menge am Himmel, Größe der Holo-Tafeln (25 m), Kreise, Flackern, Bildrate | `flyerTotal` in `flyerGeo.ts`, `HOLO_SIZE` und `CRAFT` in `flyers.ts` |
| Verfolger-Kamera | Abstand 12–16 m, Höhe 4,1 m | `CHASE_DIST`, `CHASE_HEIGHT` in `Game.ts` |
| Teile-Lack | eine Wahl für alle Anbauteile – reicht das? Andere Pods als die Aurora ansehen | `podKitParts.ts` (`inPaint`) |
| Schatten und Spiegelungen | Bildrate auf „Hoch" und „Ultra" mit den größeren Karten | Menü: Schattenqualität, Spiegelungs-Auflösung |

### Git
Zweig `dev`, vor diesem Auftrag `72a581d`. Jeder Punkt ein Commit, danach `git gc --prune=now`.

| Commit | Inhalt |
|---|---|
| `a032966` | Fehler 1: Boden der Schwerkraft-Röhre ist fest, Brocken schweben über der Fahrbahn |
| `6d4b123` | Fehler 2: die Fahrspur wächst mit dem Pod mit |
| `831616e` | Fehler 3: Hauptmenü zeigt die eingebauten Teile |
| `825bf52`, `b8c0e58` | Fehler 4: Rammen 3 : 1, Treffer am Gegner sichtbar; Obergrenze 16 |
| `6181f05` | Verbesserung 1: Intro-Flug mit 145 m/s |
| `0659caf` | Verbesserung 2: kürzere Sprünge |
| `9cf13e2` | Verbesserung 4: Spuren im Sand besser sichtbar |
| `4563a03` | Verbesserung 5: Verfolger-Kamera näher |
| `7ea1787` | Verbesserung 7: Schatten- und Reflexions-Auflösung |
| `b2304fc` | Verbesserung 6: Anbauteile lackierbar |
| `e0c2e8a` | Verbesserung 3: Flug-Deko |
| Commit mit diesem Abschnitt | Abschluss: Bewegungs-Prüfung der Flug-Deko, `pui.mjs` im Hochformat mit Teilen, nachgemessene Sprung-Zahlen, Doku |

Gepusht wird nach diesem Commit (Auftrag: „arbeite diese erst ab, pushe dann"). Ob es geklappt hat, zeigt `git log origin/dev..dev` (leer = alles auf GitHub) und der Eintrag „Git-Stand" in `HANDOFF.md`.
