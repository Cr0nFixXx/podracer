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
- **Jetzt:** Eine Rampe gibt jedem Pod dieselbe Steiggeschwindigkeit mit (`launchVy`: 16 m/s bis 60 m/s Tempo, 14 bei 90, 11 ab 180 m/s). Volles Tempo 89–126 m (0,65–0,92 s), Boost 99–159 m (eine Rampe auf Magma 186 m: dahinter fällt die Straße ab), langsam (60 m/s) 62–70 m – jede Lücke wird weiter überflogen. „Nase hoch" trägt über einer Lücke 10–40 % weiter (vorher etwa das Doppelte), „Nase runter" bringt den Pod nach 44–50 m herunter.
- **Rampen:** 2–2,6 m hoch statt 4–6 m, erst sanft ansteigend, dann gerade bis zur Kante (8–9 % Steigung). Bei vollem Tempo passt das zur neuen Steiggeschwindigkeit – der Pod verlässt die Rampe ohne Knick. Die Länge der Rampen bleibt.
- **Verworfen:** doppelt so lange Rampen. Tunnel, Hindernisse und Böden werden um die Rampen herum gesetzt; mit längeren Rampen standen auf sechs Strecken Tunnel an anderer Stelle (Frostspalt, Magma, Heuler, Executioner, leicht Aquilaris und Methan). Mit unveränderter Länge ist der Aufbau aller 13 Strecken derselbe wie vorher (`info.mjs`, 0 geänderte Zeilen).
- **Geprüft:** drei neue Prüfungen `jump: …` (erst rot mit den Messwerten oben, dann grün – alle Rampen aller Strecken; Nase hoch / runter / langsam; 60 gegen 120 Schritte/s). Alle 184 Prüfungen grün. Simulation 13 Strecken × 120 s, drei Startwerte: 1 / 0 / 0 Ausfälle, längste Flugzeit 0,9–1,5 s (vorher 2,2–2,9 s). Bilder `jp` (Boonta: Rampe von vorn, Pod an der Kante, über der Schlucht, Seitenansicht).
- **Nicht geprüft:** das Gefühl im Rennen. **Für die Überarbeitung der Sprünge danach** (Lücken 70–90 m, ein weiter Sprung nur mit Boost): die heutige Reichweite reicht auf den kurzen Rampen nicht für 90 m (Frostspalt 89 m) – dort müssen Rampe oder Abwurf höher werden; „nur mit Boost" braucht eine Rampe, deren Abwurf vom Boost abhängt.

### Verbesserung 4 – etwas besser sichtbare Spuren im Sand
- Deckkraft der Streifen im Sand (auch Dünen, Strand) von 0,115 auf 0,165, der Randlinie von 0,085 auf 0,12 – rund 45 % mehr. Asche und Mondstaub bleiben, wie sie waren (ihr Faktor wurde entsprechend gesenkt).
- **Geprüft:** Bild `tc` (Boonta-Sand, 128 m/s, Verfolger- und Seitenansicht) gegen `ta` (vorher): die zwei Streifen sind klar zu erkennen, bleiben aber dezent.
