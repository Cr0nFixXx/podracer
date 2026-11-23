# Stand: 2026-11-23 – nach der Probefahrt des Nutzers: drei Fehler, Verbesserungen, Streckenanpassungen

Der Nutzer ist den Stand vom 2026-11-23 (`ee20aa5`) auf echter GPU gefahren und hat eine Liste geschickt. Diese Datei hält den Auftrag, die Entscheidungen der Fragerunde und – Punkt für Punkt – fest, was gebaut und geprüft wurde. Was offen ist, steht in `TODO.md` Abschnitt 9.

## Auftrag (wörtlich)
**Bugs**
- auf der strecke "Methan-Derby" ragen felswände (falsch positionierte geometrie) halb auf die strecke.
- extrem schlechte sicht bei nacht + unwetter/gewitter (starker regen).
- bodentexturen haben teilweise streifen drauf welche so aussehen wie reifenspuren (besonders auf schnee).

**Verbesserungen / Soll**
- kein fallschaden bei sanfter/normaler landung
- erhöhte (schatten)sichtweite - ich sehe selbst auf ultra wie sich eine schattenwand vor mir her schiebt, nach der es wieder hell ist.
- wasserspritzer auf der linse auch bei fahrten über wasser/pfützen wenn es nicht regnet.
- boost alarm sound: langsam stärker werdener alarm sound wenn boost kurz vor maximum.
- sichtbares plasma hitzeschild, welches sich unter dem pod bei fahrten über lava aktiviert (nur optik).
- bei fahrten über lava extrem kurze boost möglichkeit.
- controller support auch im menü.
- reset taste (pod neu auf die strecke zurücksetzen)
- **Streckenanpassungen** (mit Fragerunde, `grill-me`):
  - bevor das rennen startet eine intro fahrt über die strecke bis man "Rennen starten" auswählt.
  - 3D Schnee: mehr schnee / viel höherer schnee, richtig 3D volumetrisch, schnee verwirbelung / schnee fliegt auf/zur seite beim reinfahren, feine partikel
  - dezente fahrspuren auch im sand/mondstaub.
  - auf malastare: giftig grüner methanregen - kein normaler regen. - setting etwas düsterer.
  - Schwerelosigkeitsüberarbeitung: zentrale mittige anziehung. wenn gelenkt wird, wird man danach zurück gezogen so wie im echten spiel auch (wie ein gummiband).
  - mehr und weitere sprünge über schluchten. zusätzlich passagen mit springen von erhöhten auf tiefere passagen. (erweitere/verlängere die strecken falls nötig)
  - fahreigenschaften auf verschiedenen untergründen generell kaum spürbar - etwas stärker. besonders mehr rutschen/sliden über eis(seen).
  - ersetze die fliegenden zeppelin deko assets mit zum star wars setting passenden assets. - fliegende raumschiffe/werbetafeln/tribünen?

**TODO-Punkte**
- 1. Am echten Gerät prüfen – „Geh mit mir die punkte durch."
- 2. Gamepad geht mitten im Rennen aus – soll das Rennen dann pausieren? **JA**
- 5. Strecken & Optik – komplett
- 8. Vom Nutzer am 2026-11-22 bestellt, was davon noch offen ist – komplett

## Entscheidungen des Nutzers (Fragerunde `grilling`, zwei Runden, 2026-11-23)
| Thema | Entscheidung |
|---|---|
| Intro-Fahrt | Durchgehender Flug in Endlosschleife: 20–35 m über der Ideallinie, etwa dreifaches Renntempo, Blick voraus. Unten Streckenname, Länge, Runden, Wetter und der Knopf „Rennen starten" (sofort aktiv, Enter oder A-Taste). Danach Schnitt auf die Startaufstellung, Countdown. |
| 3D-Schnee, Höhe | **„dynamische Höhe 1–3 m"** (eigene Antwort): Wehen zwischen 1 und 3 m; wo es 3 m sind, schneidet der Pod eine Schlucht in den Schnee. **Nur auf den Pulverschnee-Feldern** – normale Schnee-Passagen bleiben flach. |
| 3D-Schnee, Wirkung | Frisch 86 % Höchsttempo, im Graben eines Vorausfahrenden 99 %; die Gegner suchen die Gräben. |
| Spuren in Sand und Mondstaub | Nur Optik, dezent: zwei flache Streifen je Pod. Im Sand verweht sie der Wind nach etwa 40 s, im Mondstaub bleiben sie das ganze Rennen. Sand, Dünen, Strand, Asche, Mondstaub. |
| Methanregen, wann | Auf beiden Malastare-Strecken ersetzt er Regen und Gewitter vollständig (giftgrüne Tropfen, grün-gelber Dunst, grüne Nässe, grüne Linsentropfen, grünliche Blitze). „Klar" und „Methannebel" bleiben wählbar. Die Welt wird insgesamt düsterer (etwa 30 % weniger Licht). |
| Methanregen, Wirkung | Brennbar: Haftung wie bei Regen, Boost-Hitze **+12 %** (Wasserregen: −10 %), der Boost zieht grüne Flammenfahnen. |
| Schwerelosigkeit | Feder zur Mittelachse der Röhre, seitlich und in der Höhe. Lenken und Steigen/Sinken drücken den Pod bis etwa 70 % des Röhrenradius aus der Mitte; beim Loslassen schnellt er in rund 0,8 s zurück und schwingt leicht über. Die Nase folgt von selbst dem Röhrenverlauf. |
| Schwerelos-Röhre, Hindernisse | Wenige langsam treibende Felsbrocken (alle 150–200 m); ein Treffer kostet Tempo und Schaden wie ein Hindernisfels. |
| Sprünge, wo | **Nur auf den Schlucht-Strecken:** Boonta, Dünenpass, Magma, Kristall, Heuler, Malastare-100. Dort: vorhandene Lücken auf 70–90 m, EIN weiter Schluchtsprung von 130–160 m, EIN Abwurf (Kante, 12–18 m tiefer weiter). Strecken dürfen dafür länger werden. Stadt- und Seestrecken bleiben. |
| Sprünge, Anspruch | **Weite Sprünge nur mit Boost** – wer nicht boostet, fällt und wird an die Absprungkante zurückgesetzt. |
| Untergründe | „Deutlich": Eis und Eissee 45 % Haftung mit langem Nachrutschen · Pulverschnee 78 % · Schnee 86 % · Schlamm 80 % und 88 % Tempo · Dünen 85 % und 91 % Tempo · Sand, Geröll, Asche 90 % · Fels und Piste 100 %. |
| Flug-Deko | **Bekannte Vorbilder möglichst genau nachbauen.** Auswahl bestätigt: Tatooine und Tafelberge – Segelbarke, aufsteigende Zuschauer-Logen wie in der Mos-Espa-Arena, leichter Frachter (Untertasse mit seitlichem Cockpit); Aquilaris – Wolkenwagen (zwei Kapseln) und Frachter; auf allen Welten Holo-Werbetafeln. |
| TODO 8 – über den Felsreihen | Höhere Felsen (mindestens 7 m), das sichtbare Energiefeld entfällt; ganz oben bleibt ein unsichtbarer, weicher Rückdruck. |
| TODO 8 – Seen und Plateaus | Natürliche Ufer je nach Welt; Baken nur noch als Wegweiser an Ein- und Ausfahrt, ohne Feld. |
| TODO 5 – Aquilaris-Mauerkronen | „Bewachsen, aber richtig": echte Moospolster und Pflanzen statt grüner Tönung. |
| Ablauf | Reihenfolge: Fehler → Verbesserungen → Streckenanpassungen → TODO 2, 5, 8. Jeder Punkt ein eigener Commit. **Nach jedem fertigen Block wird gepusht** (ausdrücklich erlaubt für diese Runde). |

## TODO 1 – mit dem Nutzer durchgegangen (2026-11-23)
| Punkt | Antwort des Nutzers |
|---|---|
| Probefahrt auf echter GPU (Höhlen, Gabelungen, hohe Tunnel, See-Passagen, Oovo-Mond), Bildrate | **Sieht gut aus, läuft flüssig** – außer den drei gemeldeten Fehlern |
| Hoher Pod an Tunneldecke, Sponsor-Brücke, Checkpoint-Bogen | noch nicht geprüft |
| „Ultra" am Gaming-PC mit vollen Details, Teilen, Schaden | **Flüssig (60 FPS oder mehr)** |
| Hangar: Teile-Kombinationen, Lackmuster; Cockpit-Innenansicht im Tunnel | noch nicht geprüft |
| Schadens-Balance von Hand (5–10 % je Bruchteil; Rammbock-Nase schützt frontal) | **Fühlt sich richtig an** |
| Neues vom 22.11.: Brandmarken (Manta, Halo-9, Cyclone), Schnittkanten am Halo-9, kein Ruckler im ersten Bild des Countdowns | noch nicht geprüft |

Aus der Liste des Nutzers folgt außerdem: „ist Eis mit −25 % Haftung fair?" – zu schwach, siehe „Untergründe".

## Was gemacht wurde
### Fehler 1 – Methan-Derby: Felswände auf der Strecke
- **Ursache:** Auf dem Methan-Derby läuft eine Schlucht direkt in zwei Brücken. Brücken-Samples formen das Gelände nicht mit (es gehört der Straße darunter). Das Gelände auf den ersten 40 m der Brücke wurde deshalb allein vom letzten Schlucht-Sample beurteilt – und „hinter dessen 28 m hoher Wand" lag die halbe Brücke. Ein Felsmassiv stand quer über der rechten Hälfte der Fahrbahn, bis 18 m hoch, an drei Brückenenden (Samples 1202–1216, 1308–1320, 1702–1712).
- **Behoben:** (1) Unter einer Brücke und 2 m + 1,5 Gitterzellen daneben bleibt das Gelände 1,5 m unter der Fahrbahn (`underBridges` in `terrain.ts`). (2) Eine Schluchtwand läuft vor einer Brücke auf einen niedrigen Felsbord aus und steigt dahinter wieder an, wie neben einer Gabelung (`trackBuilder.ts`).
- **Warum es nie auffiel:** das Werkzeug `tools/ci/poke.ts` („Gelände über der Fahrbahn") übersprang Brücken. Es prüft sie jetzt; alle anderen Strecken sind sauber.
- **Neues Werkzeug:** `pdbg.mjs`-Variante `scan` – Strahlen quer über jedes vierte Sample; nennt jedes Mesh, das in der Fahrbahn steht. Hat die Stelle in einem Lauf gefunden.
- **Kein Fehler:** die Felstürme mit grünen Leuchtringen auf der Fahrbahn sind die Geysir-Schlote (`hazards`), sie stehen dort mit Absicht.

### Fehler 2 – extrem schlechte Sicht bei Nacht + Gewitter
- **Ursache:** Nacht und Unwetter wurden miteinander multipliziert: Mondlicht 0,30 statt 1,15, ein Viertel weniger Streulicht, Nebel und Himmel schwarz. Hinter dem Lichtfleck der Lampe war nichts zu erkennen.
- **Behoben:** Schlechtes Wetter ändert nachts die Stimmung (kälter, flacher, dunstiger), nicht mehr die Lichtmenge. Untergrenzen für Mondlicht, Streulicht, Horizont und Nebelfarbe; der Nebel wird nachts höchstens 1,8-mal so dicht wie auf der Welt üblich; Regenböen sind dünner und nicht mehr schwarz. Gilt für jede Welt und jedes Wetter (Regen, Gewitter, Schnee, Sandsturm, Nebel).
- **Lampe des eigenen Pods:** breiter, flacherer Abfall, zielt 60 m voraus statt 36 m – Wände, Felsen und Bögen fangen das Licht früher.
- **Dabei gefunden:** der Dschungel-Tunnel leuchtete nachts wieder grell hellgrün (die Lampenmenge richtete sich nach dem dunklen Nachthimmel statt nach der Welt). Behoben.

### Fehler 3 – Streifen wie Reifenspuren
- **Ursache:** rund 110 „Bremsspuren"-Aufkleber je Strecke, jeder mit zehn dünnen, scharfen, dunklen Linien – auf jedem Untergrund. Auf Schnee dunkel auf weiß.
- **Behoben:** auf Naturboden liegen keine mehr. Auf der gebauten Piste sind es jetzt Brandspuren: zwei breite, weiche Rußstreifen. Spuren auf Naturboden kommen künftig nur noch von den Pods selbst (Schnee heute, Sand und Mondstaub bestellt).

### Verbesserung – kein Fallschaden bei normaler Landung
- Bisher kostete jede Landung über 14 m/s Sinkrate Hülle – ein gewöhnlicher Rampensprung landet mit etwa 30 m/s und kostete jedes Mal rund 6 Punkte.
- Jetzt sind 38 m/s frei (freier Fall aus 21 m). Nur was darüber liegt, trifft den Rumpf. Gemessen wird gegen den Boden: eine abfallende Piste macht die Landung weicher. Staub, Geräusch und Kamerastoß bleiben.

### Verbesserung – Plasma-Hitzeschild über Lava (nur Optik)
- Unter jedem Pod, der über dem Lavasee fliegt, liegt jetzt eine flache Schale aus blau-weißem Plasma: Wabenmuster, heller Rand, Ringe laufen nach außen, leichtes Flackern. Sie blendet über der Lava ein (0,2 s) und dahinter wieder aus (0,5 s); beim Boost leuchtet sie stärker. Auch die Gegner haben eine.
- Reine Optik: an Hitze, Schaden und Fahrverhalten ändert sie nichts. Ein Zeichenaufruf für alle Pods (`src/game/heatShield.ts`, `Game.updateShields`).
- Größe aus der Hülle des jeweiligen Pods: Triebwerksnasen bis Cockpit-Heck plus 1 m, Triebwerks-Außenkanten plus 1 m.
- Erster Versuch war eine schwarze Scheibe: Muster auf `positionLocal` gebaut – bei instanzierten Netzen sind das schon Weltmeter. Regel dazu in `docs/regeln/grafik.md`.
- Nachgebessert: die Schale war noch milchig und verdeckte die Lava. Ursache war der Rand – sein Leuchten reichte über das äußere Drittel des Radius, das ist die halbe Fläche. Jetzt ist der Rand schmal: leuchtende Waben und ein heller Ring, die Lava bleibt darunter sichtbar.
- Geprüft: Bilder auf Magma über dem Lavasee (Verfolgerkamera, Seite, von oben), `tsc`, WebGPU-Konsolenprüfung mit der neuen Option `VIEW=chase_3600 TRACKS=2` (0 Fehler).

### Verbesserung – über Lava nur extrem kurzer Boost
- Lavasee: Hitzefaktor 4,5 statt 1,6. Ein kaltes Triebwerk ist nach 0,6–1,0 s Boost am Limit (auf der Piste 2,6–4,5 s).
- Der Überlast-Boost (Boost am Limit halten, kostet Triebwerk) läuft über dem See dreimal so schnell ab: 1 s statt 3 s, gleicher Schaden in einem Drittel der Zeit. Danach schalten die Triebwerke ab.
- Über dem See kühlt fast nichts ab (22 % der normalen Kühlung). Wer heiß ankommt, hat dort keinen Boost.
- Die Lavakruste bleibt bei +30 %. Gegner nutzen die Überlast nie – sie boosten über dem See nur kurz an.
- HUD-Hinweis über dem See: „Boost nur ganz kurz". README-Tabelle angepasst.
- Geprüft: zwei neue Unit-Prüfungen `lava:` (vorher rot: 2,1–2,3 s bis zum Limit, 3,8–4,0 s bis zur Abschaltung; jetzt ≤ 1,1 s und ≤ 2,3 s).

### Verbesserung – größere Schatten-Sichtweite („Schattenwand" auf Ultra)
- **Ursache der Schattenwand:** auf „Ultra" gibt es zwei Schattenstufen (nah, weit). Die weite Stufe hat gar nicht gearbeitet: ihr Tiefenbereich endete über dem Boden. Alle Schatten hörten deshalb 104 m vor dem Pod auf, und diese Kante fuhr mit.
- **Behoben:** die weite Stufe schattiert jetzt wirklich – bis 700 m (bis 112 m scharf, dahinter weicher, die letzten 175 m laufen aus).
- **Auch ohne Kaskaden weiter:** eine Schattenkarte reicht jetzt 195 / 245 / 295 m vor den Pod (bisher 148 m) und läuft am Rand weich aus statt mit einer harten Linie.
- **Tiefe Sonne (Dämmerung):** das Schattenlicht steht jetzt 2000 m statt 360 m hinter der Szene – vorher lag bei tiefer Sonne der größte Teil der Karte hinter dem Licht.
- **Felsen** (Felsreihen, Felsnadeln nahe der Strecke) werfen Schatten so weit, wie die Schatten reichen (bisher 150 m).
- Alles dazu steht in `src/game/sunShadow.ts`; Regeln in `docs/regeln/grafik.md` → „Sun shadows". Anzeige der Schattenqualität im Menü berichtigt (1024 / 1536 / 2048 statt 1024 / 2048 / 4096).
- Geprüft: drei neue Unit-Prüfungen `shadow:` (mit den alten Werten lagen 2801 von 4640 sichtbaren Bodenpunkten außerhalb ihrer Schattenstufe – jetzt 0), Bildvergleich vorher/nachher auf Boonta (Ultra: Wandschatten und Bogenschatten jetzt auch in der Ferne), WebGPU-Konsolenprüfung mit einer Karte und mit Kaskaden (0 Fehler).
- **Nicht gemessen:** die Kosten auf einer echten Grafikkarte. Die weite Stufe zeichnet jetzt wirklich (in jedem zweiten Bild). Fällt „Ultra" unter 60 FPS: `CSM_FAR` in `sunShadow.ts` kleiner stellen.

### Verbesserung – Wasserspritzer auf der Linse auch ohne Regen
- Tropfen landen jetzt auf der Linse, wenn du über einen See fliegst (Wasser, Sumpf, Spiegelsee, Methansee – nicht Lava), durch Pfützen nach einem Regen fährst oder dicht hinter einem Pod durch dessen Gischt.
- Stärke: die eigene Gischtfahne etwas schwächer als Regen, ein Pod dicht voraus stärker. Im Stand keine Tropfen. Nach etwa drei Sekunden über trockenem Boden ist die Linse wieder klar.
- Es sind dieselben Tropfen wie im Regen (gleiches Aussehen, gleicher Schalter „Linseneffekte").
- Betroffene Strecken: Dschungelfluss, Aquilaris, Kristallschlucht, Malastare 100, Methan-Derby – und jede Strecke nach einem Regen.
- Geprüft: fünf Unit-Prüfungen `lens:` (zuerst rot), Bilder auf Aquilaris (über dem See Tropfen, an Land keine, Vergleich mit Regen), WebGPU-Konsolenprüfung über dem See.

## Geprüft
- Fehler 1: neue Prüfungen `bridges: …` (11, zuerst rot: Gelände 22,7 m über der Brücke, 309 Punkte; Wand 28 m hoch direkt neben der Brücke). Nur mit Regel (2) stand das Gelände noch 5,2 m über der Fahrbahn – Regel (1) ist nötig. `poke.ts` auf allen Strecken, Gitter 4,5 / 7 / 13,75 m, Brücken eingeschlossen: 0 Punkte (vorher 242 auf dem Methan-Derby). Bilder vorher/nachher an allen drei Stellen (WebGL2, Software).

- Fehler 2: neue Prüfung `night: bad weather keeps the light of a clear night …` (zuerst rot: 39 Verstöße). Bilder aus der Sicht des Spielers (neue Harness-Ansicht `chase_<idx>`: echter Pod, echte Kamera, echte Lampe), vorher/nachher: Dschungel bei Nacht + Gewitter (offene Piste, Tunnel), dazu Nacht klar und Nacht + Regen zum Vergleich; Aquilaris Nacht + Gewitter; Frostspalt Nacht + Schnee.
- Fehler 3: Bilder vorher/nachher, Frostspalt Schnee-Passage (Streifen weg) und Start-Piste (weiche Brandspuren). Welches Mesh die Streifen waren, hat `pick:` gezeigt.
- Landung: neue Prüfung `landing: a normal landing costs nothing …` (zuerst rot: 5,9 Punkte bei 30 m/s). 30 und 36 m/s kosten nichts, 55 m/s kostet deutlich.

## Nicht geprüft
- Fehler 2: nur Standbilder in Software-WebGL2. Wie es sich bei Tempo 400 mit Regen, Gischt der Vorausfahrenden und Tropfen auf der Linse anfühlt, kann nur die Probefahrt zeigen – die Linsentropfen und der Regen selbst sind unverändert. Malastare, Kristall und Sandsturm bei Nacht nicht angesehen (die Prüfung deckt alle Welten rechnerisch ab).
- Fehler 3: die neuen Brandspuren nur auf der Eis-Piste gesehen.

## Git
