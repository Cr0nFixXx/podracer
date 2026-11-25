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
