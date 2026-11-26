# Podracer: Hyperspeed Legends

Podracer-Rennspiel im Stil von *Star Wars Episode I: Racer*. Läuft komplett im Browser mit **WebGPU** (automatischer **WebGL2-Fallback**) und wird als **eine einzige HTML-Datei** ausgeliefert.

## Schnellstart

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # erzeugt dist/index.html (alles inline, offline lauffähig, ca. 17,5 MB)
npm run build:web  # erzeugt den Ordner build/ für einen Webserver (mehrere Dateien, ca. 13 MB)
```

`dist/index.html` direkt im Browser öffnen – fertig. Rechts unten im Rennen steht, welcher Renderer läuft (`WebGPU` oder `WebGL2`).

**Online stellen:** `npm run build:web` und den Ordner `build/` hochladen (Vercel, GitHub Pages, jeder statische Webspace – er läuft auch in einem Unterordner). Dieser Build lädt beim Start nur den Code (0,6 MB komprimiert) und jede Textur erst, wenn eine Strecke sie braucht; der Browser behält alles im Cache. Er läuft nur über einen Webserver, nicht per Doppelklick. Lokal ansehen: `npm run preview:web`.

## Steuerung

| Aktion | Tastatur | Gamepad |
|---|---|---|
| Schub | `W` | RT |
| Umkehrschub / Bremse | `S` | LT |
| Links / rechts lenken | `A` / `D` | linker Stick |
| Boost | `Shift` | A |
| Luftbremse / Sliden | `Leertaste` | B / LB / RB |
| Neigung (Nase runter) | `↑` | rechter Stick vor |
| Anheben (Nase hoch) | `↓` | rechter Stick zurück |
| Rolle nach links / rechts (90°) | `←` / `→` | rechter Stick links / rechts |
| Reparatur (langsamer fahren) | `R` | X |
| Ansicht wechseln | `C` | Y |
| Zurück auf die Strecke (Reset) | `⌫` Rücktaste | Back / Select |
| Pause | `Esc` / `P` | Start |

**Intro-Flug:** Nach dem Laden fliegt die Kamera in einer Endlosschleife über die Strecke – 20 bis 35 m über der Fahrbahn, so schnell wie ein Podracer ohne Boost (rund 520 km/h), durch Tunnel und Röhren hindurch. Unten stehen Strecke, Länge, Runden, Wetter und Gegner. **„Rennen starten"** (auch `Enter` oder Gamepad **A** / **Start**) schneidet auf die Startaufstellung, dann läuft der Countdown. Bei „Neustart" und „Nochmal" entfällt der Flug.

**Gamepad im Menü:** Alle Menüs lassen sich mit dem Gamepad bedienen – auch Pause und Ergebnis. Steuerkreuz oder linker Stick bewegen die Markierung (türkiser Rahmen), **A** wählt aus, **B** geht zurück, **Start** startet das Rennen bzw. setzt es fort. Auf Schiebereglern und Auswahllisten ändern links / rechts den Wert; **LB / RB** springen von dort zur Nachbarspalte. Unten im Fenster steht die Tastenhilfe, solange das Gamepad benutzt wird; bewegt man die Maus, verschwindet sie.

Rückwärts (Umkehrschub halten, bis der Pod zurücksetzt) lenkt der Pod wie ein Auto im Rückwärtsgang: das Heck schwenkt zur gelenkten Seite.

**Reset:** Festgefahren, verirrt oder falsch herum? Die Reset-Taste setzt den Pod nach 0,8 Sekunden an die letzte sichere Stelle zurück – mittig, in Fahrtrichtung, mit 35 m/s und gut zwei Sekunden Schutz. Repariert wird dabei nichts: Triebwerkszustand, verlorene Teile und Hitze bleiben. Danach ruht die Taste drei Sekunden. Wer drei Sekunden steht oder falsch herum fliegt, bekommt die Taste eingeblendet.

In der Ansicht „Cockpit" (`C`) sitzt man im Pod und sieht das eigene Cockpit von innen: Armaturenbrett mit drei Warnlampen (Boost, Hitze, Schaden), Scheibenrahmen und die Hände des Piloten – bei jedem Racer anders. Die Cockpits hängen über der Triebwerkslinie: man schaut über die Triebwerke hinweg auf die Strecke. Die freie Sicht ganz ohne Cockpit bietet weiterhin die Ansicht „Motorhaube".

**Gamepad ändern:** Einstellungen → Steuerung → Abschnitt „Gamepad": Aktion anklicken, dann Taste drücken oder Stick bewegen. „Standard" stellt die Belegung aus der Tabelle wieder her.

**Tasten ändern:** Einstellungen → Steuerung. Aktion anklicken und die gewünschte Taste drücken (Esc bricht ab). Zwei Vorlagen stehen bereit: „Standard" (Tabelle oben) und „Klassisch" (Pfeiltasten lenken und geben Schub, `I`/`K` Neigen/Anheben, `J`/`L` Rolle). Pause bleibt auf `Esc`/`P`.

**Anzeige im Rennen:** unten links zeigt ein Pod-Symbol die Fluglage (dreht sich bei der Rolle, Pfeil für Anheben/Neigen). Der Balken darunter füllt sich im Slide – ist er gelb, gibt es beim Loslassen den Extra-Schub. Unter der Karte stehen Tageszeit und Wetter.

### Flugmanöver
1. **Slide / Drift:** `Leertaste` halten und lenken – die Haftung lässt weich nach, das Heck bricht aus und schwingt herum, der Pod driftet weit auf seinem Schwung (bis etwa 60° quer). Gegenlenken fängt ihn ab; nach dem Loslassen greift er über etwa eine halbe Sekunde wieder. Nach einem langen Slide loslassen und Schub geben: kurzer Extra-Schub (Balken unter der Fluglage-Anzeige wird gelb).
2. **Weiter springen:** auf der Rampe und in der Luft `↓` halten – der Pod hebt die Nase und gleitet (über einer Lücke 10–40 % weiter, kostet etwas Tempo). Ein Sprung trägt bei vollem Tempo rund 90–125 m (knapp eine Sekunde in der Luft), mit Boost 100–160 m.
3. **Schneller landen:** in der Luft `↑` halten – der Pod taucht ab (direkt an der Rampenkante gedrückt reicht das nur knapp über eine 50-m-Lücke). Am Boden drückt `↑` den Pod tiefer und gibt mehr Haftung.
4. **Hochkant durch Lücken:** `←` oder `→` halten – der Pod rollt 90° und ist nur noch ein Viertel so breit. **Im gerollten Zustand ist die Steuerung mitgedreht:** `↓` (Anheben) zieht den Pod zur Rollseite hin, `↑` (Neigen) von ihr weg; `A`/`D` bewegen ihn auf und ab. Die Lenkung über `↑`/`↓` ist dabei kräftiger als die normale Lenkung.
5. Cockpit und Triebwerke neigen sich nur gemeinsam und nur, solange `↑`/`↓` gedrückt ist. Beim Lenken hebt sich das äußere Triebwerk als Ganzes, ohne zu kippen.

**Boost-Anzeige:** Der Balken unter dem Tacho zeigt die Triebwerkshitze; im schraffierten Bereich (ab 80 %) wird es kritisch. **Überziehen:** bei „MAX" lässt sich der Boost noch bis zu 3 Sekunden halten – das kostet langsam Triebwerkszustand (Anzeige „ÜBERZOGEN · NOCH x s"). Danach schalten die Triebwerke ab, bis die Hitze unter die Marke „BEREIT" gefallen ist. Die Hitze sieht man auch am Pod: die Glut wandert von der Düse nach vorn, kurz vor dem Limit glühen die Triebwerke hellgelb und sprühen Funken. **Boost-Alarm:** ab 70 % Hitze warnt beim Boosten ein Piepton, der mit der Hitze schneller, höher und lauter wird; beim Überziehen wird er zum schnellen Trillern, bis die Triebwerke abschalten.

**Klima und Wetter:** Kalte Luft kühlt die Triebwerke, heiße heizt sie auf – der Boost hält länger oder kürzer. Kühlend wirken Regen, Gewitter, Schneeböen, die Nacht und die Eiswelt; heizend ein Sand- oder Aschesturm, die Wüste am Tag und die Vulkanwelt. Zusammen macht das höchstens 25 % aus und gilt für die Gegner genauso. Beim Einstellen des Rennens steht neben „Wetter", was die Wahl bewirkt („Boost-Hitze −16 %"); im Rennen zeigt es der Balken („KÜHLE LUFT −18 %" oder „HEISSE LUFT +11 %"). Die Kraft des Boosts bleibt immer gleich.

**Hindernisse:** Frachtkisten und kleine Felsen lassen sich mit Tempo zertrümmern – das kostet etwas Triebwerkszustand und Tempo. Säulen und große Felsen bleiben hart. Sponsoren-Traversen, das Startportal und die Checkpoint-Bögen sind massiv: nicht hineinfliegen (die Bögen sind am Rand niedriger als in der Mitte).

**Pods:** Jeder Pod zieht zwei Staubfahnen unter den Triebwerken hervor (bei Nässe Gischt) – auch der eigene. Das Cockpit hängt an den Leitungen und pendelt in Kurven, beim Beschleunigen und Bremsen mit. Der **Quadra Lumber** fliegt mit vier schlanken Triebwerken im Quadrat und einem X aus Energieblitzen. Beim Boost öffnen sich die Düsenklappen am Triebwerksausgang – auch bei den Gegnern.

**Schwerelosigkeit (Oovo IV, Executioner):** In den Röhren gibt es keine Schwerkraft und keinen Luftwiderstand – der Pod wird schneller. Er hängt wie an einem Gummiband an der Mittelachse der Röhre: Lenken drückt ihn zur Seite, `↓` und `↑` nach oben und unten – zur Seite und nach oben bis etwa 70 % des Röhrenradius, nach unten bis knapp über die Fahrbahn (sie ist fest, durchtauchen geht nicht). Lässt du los, schnellt er in rund 0,8 Sekunden in die Mitte zurück und schwingt leicht über. Die Nase folgt von selbst dem Verlauf der Röhre – lenken dreht den Pod dort nicht, es verschiebt ihn. In jeder Röhre treiben einige Felsbrocken langsam umher (alle 150–200 m, mit leuchtendem Rand); ein Treffer kostet Tempo und Rumpf wie ein Hindernisfels. Kurz vor dem Ende führt die Röhre den Pod zur Mitte und auf Schwebehöhe zurück.

**Rammen:** Wer einen anderen Pod rammt – von der Seite hineinlenkt oder von hinten auffährt –, zahlt nur ein Drittel dessen, was der Gerammte verliert. Der Schaden trifft das Triebwerk auf der getroffenen Seite. Am Gegner siehst du den Treffer: Funken, eine kurze Stichflamme, Rauch – und rechts oben steht für ein paar Sekunden „Treffer · Name · Zustand in %". Unter 60 % zieht sein Triebwerk eine Rauchfahne, unter 38 % nimmt er Tempo raus und repariert. Das gilt in beide Richtungen: lenkt ein Gegner in dich hinein, zahlst du den größeren Teil. Leichte Berührungen (unter 5 m/s) kosten nichts.

**Tunnel, Brücken & verzweigte Höhlen:** Jede Strecke hat hohe Tunnel (27 m, auf Ando Prime 30 m; oben befahrbar) mit breitem Gewölbe – auch am Rand bleibt viel Luft nach oben. Zehn Strecken kreuzen sich über/unter sich selbst über **Hohlkasten-Viaduktbrücken** und **Unterführungstunnel**.
- **Aquilaris:** zwei hohe (26 m) Panorama-Unterwassertunnel mit Ozeanfenstern, Kaustik und Fischschwärmen sowie zwei Skyway-Überführungen.
- **Verzweigte Höhlensysteme** (Vulkanwelt, Ando Prime, Kristallschluchten, Dschungelmond): eine durchgehende Höhle mit bis zu 45 m hohen Kammern, in denen die Piste breiter wird, Stalagmiten/Stalaktiten und **echten Höhlengabelungen** (zwei Röhren, die sich weiter hinten wieder vereinen).

### Untergründe

Jede Strecke wechselt zwischen mehreren Untergründen. Unter der Wetterzeile im HUD steht, worüber der Pod gerade schwebt – und was das bewirkt. Für die Gegner gilt dasselbe.

| Untergrund | Wirkung |
|---|---|
| Rennpiste, Fels, Felsplateau, Riff-Fels, Stationsdeck, Basalt | volle Haftung, volles Tempo |
| Waldboden, Kristallfeld, Lavakruste | fast wie Fels (2–3 % weniger Haftung) |
| Sand, Geröll, Aschefeld, Strand, Mondstaub | 10 % weniger Haftung; Sand, Geröll, Mondstaub und Strand bis 4 % weniger Höchsttempo, Asche 5 % |
| Schnee | 14 % weniger Haftung, 3 % weniger Höchsttempo |
| Dünen (tiefer Sand) | 15 % weniger Haftung, 9 % weniger Höchsttempo |
| Schlamm | 20 % weniger Haftung, 12 % weniger Höchsttempo |
| Sumpf | 6 % weniger Haftung, 8 % weniger Höchsttempo |
| Pulverschnee (1–3 m tiefe Wehen) | 22 % weniger Haftung; frisch 14 % weniger Höchsttempo, im Graben eines anderen Pods nur 1 % – siehe unten |
| **Eis, Eissee** | **55 % weniger Haftung – und wer einmal rutscht, rutscht lange weiter.** Früh und sanft einlenken; ein Slide trägt weit |
| Lavakruste | Triebwerke heizen 30 % schneller auf – Boost kürzer halten |
| Lavasee | Boost nur ganz kurz: ein kaltes Triebwerk ist nach 0,6–1 s am Hitzelimit, der Überlast-Boost hält 1 s statt 3 s, und über dem See kühlt fast nichts ab. Unter dem Pod leuchtet solange ein Plasma-Hitzeschild |
| See (Aquilaris), Spiegelsee, Methansee | 4–5 % weniger Haftung; der Pod zieht Gischt. Methan heizt 15 % schneller auf |

Kalte Untergründe (Schnee, Eis, Wasser) kühlen: die Triebwerke heizen dort 10 % langsamer auf. Haftung und Höchsttempo ändern sich nur am Boden – nicht in der Luft und nicht in den Zero-G-Röhren. Die HUD-Zeile nennt den Untergrund und einen Hinweis („wenig Haftung", „bremst", „rutschig", „Triebwerke heizen auf", „Boost nur ganz kurz").

**Fahrspuren:** In Sand, Dünen, Strand, Asche und Mondstaub hinterlässt jeder Pod zwei flache, dezente Streifen. Im Sand verweht sie der Wind nach etwa 40 Sekunden, im Mondstaub von Oovo IV bleiben sie das ganze Rennen. Reine Optik – das Fahren ändert sich dadurch nicht.

**Pulverschnee ist echter Tiefschnee:** Auf den Pulverschnee-Feldern von Ando Prime (Frostspalt, Heuler-Schlucht) liegen Schneewehen von 1 bis 3 m Höhe. Der Pod fliegt nicht darüber, er pflügt hindurch: seine Triebwerke schneiden einen Graben bis fast auf den Boden, so breit wie der Pod. Wo der Schnee 3 m hoch liegt, fliegt man in einer Schlucht aus Schnee. Vor den Triebwerken stiebt der Schnee nach oben und zur Seite, feiner Pulverschnee bleibt über dem Graben hängen. **Frischer Schnee bremst auf 86 % Höchsttempo, im Graben eines anderen Pods sind es 99 %** – wer vorn fliegt, räumt für die anderen. Der eigene Graben hilft erst in der nächsten Runde. Die Gegner suchen die Gräben. Bei Schneeböen schneien die Gräben langsam wieder zu. Am Tor, an beiden Enden des Feldes und rund um Hindernisse liegt der Schnee flach, damit nichts verschüttet ist. Die HUD-Zeile zeigt „Pulverschnee · pflügt · bremst stark" oder „Pulverschnee · Graben · freie Bahn".

**Offene Abschnitte:** Über Sand, Fels, Schnee, Schlamm und allen anderen Naturböden gibt es keine Leitplanken und keine sichtbare Pistenkante. Die Grenze ist eine Reihe einzelner Felsen (2,5 bis 7 m hoch, einzelne bis 12 m); dahinter liegt das offene Land. Der Boden der Piste läuft zwischen den Felsen hindurch und geht weich ins Gelände über. Die Felsen sind fest – wer sie rammt, prallt ab und nimmt Schaden wie an einer Schluchtwand. Wer höher fliegt als die Felsen, wird nur sanft zurückgedrückt. Gebaute Decks (Start und Ziel, Brücken, Tunnel, Rampen) behalten ihre Geländer, Seen und Plateaus ihre Baken.

**Übergänge:** Wo ein Untergrund in den nächsten übergeht (Sand in Fels, Schnee in Eis), mischen sich beide über 30 m mit weichen Rändern. In Wüste und Eis weht der Wind Sand oder Schnee gegen Felsen, Wände und Geländer – die Verwehungen dünnen zur Pistenmitte aus. An Schluchtwänden liegt der Boden am Wandfuß an.

**Seen:** In den weiten offenen Passagen fährt man direkt über die Oberfläche von Eissee, Lavasee, Methansee, Sumpf, Spiegelsee oder dem Meer von Aquilaris. Die Fläche ist eben und bis über 100 m breit; Baken und ein Energiefeld markieren den Rand. Hineinfallen kann man nicht.

## Tageszeit & Wetter

Im Menü **Renneinstellungen** gibt es die Auswahlfelder „Tageszeit" und „Wetter". Sie wirken auf alle Strecken außer Oovo IV (Weltraum).

| Tageszeit | Wirkung |
|---|---|
| Standard der Welt | das ursprüngliche Licht der Strecke |
| Morgendämmerung · Mittag · Abenddämmerung · Nacht | feste Tageszeit |
| Sonnenuntergang (Abend → Nacht) | die Sonne sinkt in den ersten 95 Sekunden, Sterne erscheinen, Lichter gehen an |
| Sonnenaufgang (Nacht → Tag) | Start bei Mondlicht, nach 2,5 Minuten heller Tag |
| Tag-Nacht-Zeitraffer | ein voller Tag in 6 Minuten, in Schleife |

**Wetter passt zur Welt** – das Menü zeigt nur, was es dort gibt:

| Welt | Wetter |
|---|---|
| Tatooine, Rote Tafelberge | Klar, Sandsturm |
| Ando Prime | Klar, Schneeböen, Eisnebel |
| Vulkanwelt | Klar, Smog, Aschesturm mit Vulkanblitzen |
| Dschungelmond, Aquilaris, Kristallschluchten | Klar, Regen, Gewitter, Nebel |
| Malastare | Klar, Methanregen, Methangewitter, Methannebel |

Dazu überall drei **Wetterverläufe**: „Aufziehendes Unwetter" (ruhig → heftig in 75 s), „Aufklarend" (umgekehrt) und „Wechselhaft" (beides im Wechsel). Was „heftig" ist, hängt von der Welt ab: Gewitter, Sandsturm, Schneesturm oder Aschesturm.

- **Intensität:** Regen, Schnee und Staub sind dicht (bis 4 200 Partikel), die Sicht geht bei Unwetter spürbar zurück, Böen ziehen Schwaden quer über die Piste und rütteln an der Kamera.
- **Regen:** Tropfen ziehen mit steigendem Tempo immer längere Streifen, auf der Linse laufen sie erst herab und werden bei hohem Tempo nach außen getrieben. Pods ziehen Gischtfahnen, Tropfen spritzen auf der Fahrbahn. Die Straße wird nass und trocknet nach dem Regen langsam ab. Etwas weniger Haftung.
- **Methanregen (Malastare):** auf Malastare regnet es kein Wasser. Die Tropfen sind giftgrün, der Dunst grün-gelb, die Piste glänzt grün, auch die Tropfen auf der Linse und die Blitze sind grün. Die Welt ist insgesamt düsterer. **Der Regen brennt:** die Haftung ist wie bei Regen, aber der Boost heizt die Triebwerke 12 % schneller auf (Wasserregen kühlt um 10 %) – und wer im Regen boostet, zieht grüne Flammenfahnen hinter sich her.
- **Gischt auf der Linse:** auch ohne Regen landen Tropfen auf der Linse, wenn du über einen See, Sumpf oder Methansee fliegst, durch Pfützen nach einem Regen fährst oder dicht hinter einem Pod durch dessen Gischt. Nach etwa drei Sekunden über trockenem Boden ist die Linse wieder klar.
- **Gewitter:** verzweigte Blitze mit Folgeblitzen, lauter Donner mit Verzögerung je nach Entfernung, Wind.
- **Lichter:** Bei Dunkelheit schalten alle Pods Scheinwerfer mit Lichtkegeln, Positionslichter und Blitzlicht ein. Dein Scheinwerfer folgt der Lenkung.
- **Sound:** Turbinen mit Whine und Sub-Bass, deutlich hörbare Gegner (mit Vorbeiflug-Geräusch), Düsenrauschen beim Boost, Zischen im Slide, Regen, Wind, Donner, Echo in Schluchten und Tunneln.

**Linseneffekte** (Sonnenblendung, Regentropfen, Hitzeflimmern) lassen sich in den Grafik-Einstellungen abschalten.

## Strecken-Gefahren & Set-Pieces

| Gefahr | Verhalten |
|---|---|
| Markierte Hindernisse | Felsen, Säulen und Frachtblöcke mit Leuchtring am Boden und Warnbake auf der Spitze – mit klarem Abstand für Highspeed-Linien |
| Leitplanken & Energiefeld | harter Aufprall an den Doppelplanken (Seiten-Schaden); darüber leuchtendes Plasma-Energiefeld mit Schockwellen-Aufblitzen bei Kontakt |
| Rotoren & Schwenkbrücken | rotierende Warnbalken bzw. gegenläufige Brücken-Ausleger mit Signallampen und hörbarem Wummern |
| Futuristische Schleusen | drei in die Landschaft integrierte Panzerschotts mit Plasma-Dichtnaht schließen der Reihe nach (Grün/Cyan → Gelb blinkend → Rot mit Druckstoß) |
| Rollende Felsen | Schluchtrinnen schleudern nach gelber Warnlampe springende Felsbrocken quer über die Piste |
| Einsturz-Fels- & Eisbögen | brechen beim Anflug der Spitze und hinterlassen einen Slalom aus Fels- bzw. Gletscherblöcken |
| Geysire / Lava-Schlote | Sinterkrater mit 1 s Warnring, dann Ausbruch (Schaden, Hitze, Auftrieb, Dampf-/Magmagrollen) |
| Tunneldecken & Zero-G-Röhren | Kopfstoß bei hohen Sprüngen; Schwerelosigkeitsröhren auf Oovo IV |

## Inhalte

**14 Podracer** (alle freigeschaltet, Tuning mit sichtbaren Tuning-Teilen, frei wählbare Style-Teile, 6 Lackiermuster, 3 Lackfinishes, 8 Vorlagen, individuelle Piloten-Spezies) · **13 Strecken: 7 Rundkurse, 6 Sprints** auf Tatooine, Ando Prime, Vulkanwelt, Dschungelmond, Aquilaris, Oovo IV, Kristallschluchten und Malastare · bis zu 10 Gegner (für jedes Rennen neu aus den 13 anderen Pods ausgelost) mit vorausschauender Korridor-KI und Düsen-Hitzeflimmern, 4 Schwierigkeitsstufen · 6 Kameras.

## Landschaft & Atmosphäre

- **Über-/Unterführungen & Steigungen (neu):** 10 Strecken kreuzen sich auf Hohlkasten-Viaduktbrücken und durch Unterführungstunnel (35–41 m Höhenabstand); alle 13 Strecken bieten lange Anstiege/Gefälle sowie überhöhte Kurven (bis ca. 21°).
- **Bedienoberfläche:** alle Menüs haben dieselbe Schriftgröße und wachsen mit dem Fenster (Bezugsgröße 1180 × 720); keine Scrollbalken. In der Streckenwahl filtert ein Auswahlfeld nach Planet; die Karte markiert Brücken und Höhlenabzweige.
- **Schnellere Folgestarts:** berechnete Texturen werden im Browser gespeichert (IndexedDB); ab dem zweiten Start einer Welt entfällt die Berechnung. `?nocache` an der Adresse schaltet das ab.
- **Eigene Cockpits (neu):** jeder Racer hat ein unverwechselbares Cockpit – Renn-Tropfen mit Kreisel-Stabilisator (Aurora XR-7), gepanzerter Kriegsschlitten mit Überrollkäfig und Stoßzähnen (Vrak Splitter-X), Spindel mit Kuppel und sechsarmigem Kabelverteiler (Tenroc 6-Fach), fliegende Untertasse (Quadra Lumber), Wurfpfeil mit liegendem Piloten (Hollo Needle), Wespen-Scooter mit Lenker und Stachel (Tyr Vespa), Kühler-Cockpit mit Kiemen und Tanks (Beerak Fireflare), Panzerturm mit offener Luke (Pagali Ironclad), Vogel mit Schwingen und Rückenfinne (Mak Starling), Planierraupe mit Rammbug (Mandrel Ram). Dazu mehr Triebwerksdetails, eigene Anbauteile je Pod und Piloten mit eigener Hautfarbe.
- **Vier neue Pods (neu, eigene Entwürfe):**
  1. **Tarn Cyclone** (Brask Tarn, Ursk) – zwei kurze, dicke Triebwerke mit offenen Riesenrotoren in Schutzringen; die Rotoren drehen sich auch bei Gegnern. Stärke: Traktion und Beschleunigung.
  2. **Lyss Halo-9** (Sira Lyss, Nerai) – schlanke Kerntriebwerke in großen Ringflügeln mit Lichtbändern, der Energieblitz springt von Ring zu Ring. Stärke: Wendigkeit und Luftbremse.
  3. **Dorn Manta** (Havo Dorn, Brakkan) – flache Triebwerksplatten mit Briefschlitz-Einlass, Schlitzdüsen und Doppelleitwerk, dessen Ruder als Luftbremse aufspreizen. Stärke: Höchstgeschwindigkeit.
  4. **Quill Voltspire** (Ixo Quill, Synth-Droide) – Reaktor-Triebwerke: vorn und hinten geschlossen verkleidet, dazwischen ein vergittertes Fenster auf die Plasmaspule, in dem ein Käfigläufer dreht; gekoppelt über drei Energiebögen. Cockpit: Glaskugel im Reifenkäfig. Stärke: Beschleunigung und Kühlung, dafür empfindlich.
- **Tuning, das man sieht:** jede der 7 Tuning-Größen baut ab Stufe 2 ein kleines und ab Stufe 4 ein großes Teil an (Nachbrennerring, Kompressorhutzen, Radiatoren, Steuerflächen, Repulsor-Pads, Doppelklappen, Reparatureinheit). Dazu vier Steckplätze mit **Style-Teilen** im Hangar-Reiter „Teile": Finnen (Haifinne, Doppel-Leitwerk, Pfeilflügel), Einlass (Gitter, Langer Dorn, Irisblende), Düse (Lang, Schubvektor-Paddel, Zackenkrone), Kanzel (klar, Rauch, Bernstein, Spiegel). Style-Teile ändern nur das Aussehen; Gegner tragen ausgeloste. **Lack der Teile:** im selben Reiter lassen sich die Gehäuse aller Anbauteile – Tuning-Teile und Style-Teile – lackieren: Werk (blankes Metall), Farbe 1, Farbe 2 oder eine eigene Farbe. Rippen, Leitungen, Gitter und Leuchten bleiben, wie sie sind.
- **Schadensmodell je Racer:** jeder Pod ist an anderen Stellen empfindlich (z. B. Splitter-X: harte Nase, weiche Oberseite; Voltspire: schwache Hülle, aber hitzefest) und verliert eigene **Bruchteile**, wenn ein Triebwerk unter 50 / 35 / 20 % fällt – Flügelplatten, Finnen, Radiatoren, ganze Triebwerke oder Energiebögen. Jedes verlorene Teil kostet 5–10 % Haftung, Wendigkeit, Tempo, Beschleunigung, Bremse oder Kühlung (zusammen höchstens 15 % je Wert); Rammbug und Panzerschürzen fangen stattdessen Treffer ab, bis sie abfallen. Auch an der Felswand zählt, womit man trifft: frontal (steiler als 30° zur Wand) ist es die Nase – harte Nase und Rammbug helfen dann –, ein Streifer zählt als Seite. Reparieren (`R`) heilt die Triebwerke, die Teile kommen erst nach einem Respawn zurück. Die drei Lampen in jeder Schadensanzeige zeigen, was noch dran ist. Man sieht es auch am Pod: Flügel und Finnen reißen ab und fliegen als Blech in Pod-Farbe davon, Ringflügel verlieren Segmente, einzelne Triebwerke gehen aus, Energiebögen erlöschen; Treffer hinterlassen Brandmarken mit blankem Metall. Im Hangar zeigt die **Schadens-Vorschau** (Regler in der Pod-Ansicht), was jeder Racer bei 50 / 35 / 20 % verliert. Auch den Gegnern sieht man ihren Zustand an: verrußte Triebwerke, fehlende Teile, schwache und stotternde Flammen. Hitze und Ruß wandern bei jedem Pod von der Düse nach vorn – auch über Flügel, Finnen und Klappen.
- **Hangar & Podracer:** 6 Lackiermuster (Klassik, Streifen, Flammen, Rennringe, Chevron, Rallye), 3 Finishes (Klarlack, Metallic, Matt) und 8 Vorlagen neben freier Farbwahl; individuelle Piloten-Spezies, seitengetrennte lose Schadensklappen und Hitzeflimmern auch hinter Gegner-Pods.
- **Größere Strecken:** alle 13 Kurse sind 7–16 km lang, mit S-Kurven, zwei weiten offenen Flächen je Strecke (bis über 100 m breit) und hohen Tunneln (27 m, Ando Prime 30 m).
- **Verzweigte Höhlensysteme:** auf Vulkanwelt (2 Gabelungen), Ando Prime, Kristallschluchten und Dschungelmond – eine durchgehende Höhle ohne Lücken, bis 45 m hohe Kammern, in denen die Piste breiter wird, Felssäulen, Leuchtadern und wieder zusammenführende Seitenröhren.
- **Untergründe, Seen und Plateaus (neu):** jede Strecke wechselt zwischen den Böden ihres Planeten – Sand, Fels und Dünen auf Tatooine; Schnee, Eis und Pulverschnee auf Ando Prime; Basalt, Lavakruste und Asche auf der Vulkanwelt; Waldboden, Schlamm und Kies im Dschungel; Strand, Riff-Fels und Plattform auf Aquilaris; Kristallfelder in den Kristallschluchten. Die offenen Flächen sind Seen (Eis, Lava, Methan, Sumpf, Spiegelsee, Meer) oder Felsplateaus. Jeder Boden fährt sich anders (Tabelle „Untergründe" oben).
- **Oovo IV mit Mondoberfläche (neu):** grauer Regolith mit Kratern statt Stelzen ins Nichts, dazwischen Stationsdecks; am Himmel ein Gasriese mit Ring.
- **Echte Foto-Texturen (neu: 15 PBR-Sets):** Fels, Klippen, Sand, Schnee, Eis, Lava, Asche, Waldboden, Schlamm, Kies, Riff, Mondstaub und Metallplatten stammen aus fotografierten Materialien mit echter Normal-Map (1024 px). Die Farbe passt sich weiter der Welt an.
- **HQ-Vegetation und -Felsen:** Urwaldbäume mit Blattwerk aus einzelnen Zweigen und fotografierter Rinde; Schneekiefern mit hängenden Nadelzweigen und Schneeauflage; Felsbrocken, deren Form der Textur folgt (Risse im Bild sind Risse im Stein); Kakteen mit Rippen und Dornen.
- **Sci-Fi-Ausstattung:** bündig eingelassene Licht-Leitstreifen an den Fahrbahnrändern (Oovo IV, Aquilaris, Malastare, auf allen Brücken und in jedem Tunnel), Holo-Tafeln, Schwebe-Baken, Energieleitungen und futuristische 3-Spur-Panzerschleusen.
- **Breitere Pisten & Renntechnik (neu):** alle Strecken sind 18 % breiter. Am Rand stehen Repulsor-Relaistürme mit gegenläufig drehenden Ringen, Patrouillen-Drohnen begleiten das Feld.
- **Offene Welten & Schluchten:** Barchan-Dünen und Kies-Wadis (Tatooine), Gletschergrate (Ando Prime), Karsthügel und Flussläufe (Dschungel/Malastare), glühende Lavarinnen (Vulkanwelt), Atolle und Felsnadeln (Aquilaris), dreistufige Horizont-Silhouetten, Talnebel und **ziehende Wolkenschatten**.
- **Mehrschichtiger Boden & Detail-Normalmaps:** Sand/Gras/Schnee wechselt mit **Kiesbanketten**, **Salzpfannen**, **gefrorenen Seen**, **Sümpfen**, **Lavakrusten mit glühenden Rissen** und geschichtetem Fels (Schnee-, Moos- und Sandauflage auf flachen Felsabsätzen); jede Welt hat eigene Nah-/Mitteldistanz-Normalmaps (Windrippel, Sastrugi, Humus/Wurzeln, Pahoehoe-Lava, Kristallfacetten, Strandsand) sowie Uferschaum am Wasser.
- **Detaillierte Fels- & Pflanzenformen (neu):** geschichtete Felsnadeln (Hoodoos) mit überhängenden Simsen und Schuttfuß, kantig gebrochene Felsbrocken, gestufte Tafelberge mit Erosionsrinnen, Urwaldriesen mit Brettwurzeln, Schirmkronen und Lianen, Schneekiefern mit hängenden Astetagen, facettierte Eis- und Kristall-Cluster, gerippte Saguaro-Kakteen. Fels zeigt natürliche Schichtung, Klüfte und Verwitterungslöcher statt eines Ziegelmusters.
- **Rennarchitektur (neu):** Startportal mit Fachwerk-Traverse, kannelierten Türmen, Abspannseilen und Zeitentafel; Dreibein-Energiemasten; Megastadt-Hochhäuser mit Rücksprüngen, Sky-Docks und Antennen; aufgerissene Pod-Wracks am Streckenrand.
- **Flug-Deko (2026-11-25):** über Tatooine und den Tafelbergen kreisen Segelbarken und leichte Frachter, an der Start-Geraden steigen Zuschauer-Logen auf und ab; über Aquilaris fliegen Wolkenwagen und Transporter; auf allen Strecken stehen durchscheinende Holo-Werbetafeln neben der Fahrbahn. (Ersetzt die Rennluftschiffe; 20 % weniger als vorher.)
- **Wasser- & Lavafälle:** animierte Kaskaden an hohen Schluchtwänden (Dschungel, Aquilaris, Ando Prime) und glühende Magmafälle (Vulkanwelt) mit Gischt-/Glutbecken und aufsteigendem Dampf.
- **Bewuchs mit LOD:** Gras, Schilf, Farne, Blumen, Agaven, bemooste Stämme, Büsche, Dornsträucher, Steine, Kiesel, Eissplitter, Kristalle, Leuchtpilze – im Wind wiegend, ferne Büsche mit nahtlosem Dither-LOD bis über 500 m.
- **Reagierende Tierwelt & Verkehr:** Vogelschwärme (inkl. auf Felsen sitzender Schwärme, die bei vorbeirasenden Pods auffliegen), vor Pods fliehende Bantha-Herden, Langhals-Riesen, Sandkriecher, Landgleiter, Himmelsverkehr, Patrouillenschiffe und Lastkähne – weichen Landmarken aus und haben eigene Umgebungsgeräusche.
- **Landmarken & Rauch:** Krayt-Drachen-Skelett, Feuchtfarm, Mos Espa, zerbrochene Raumschiffwracks, verbundene Forschungsstationen, Raffinerien mit Kugeltanks, Vulkane mit Lavastrom und Aschesäule, Stufentempel mit Feuerschalen, Steinkreis, Bohrinseln mit Helipad, gestreifte Leuchttürme, Gefängnistürme sowie wandernde Staub-, Schnee- und Methanteufel.

## Grafik-Einstellungen (Auswahl)

- **Erreichbar** über „Einstellungen → Grafik & Ton" und im Rennen über **Pause (`Esc`) → Grafik-Einstellungen**. **Sofort wirksam:** alle Effekte (Bloom, Ambient Occlusion, God Rays, Unschärfe, Kino-Shader, Linseneffekte), Kantenglättung, Schatten, Textur-Filter, Volumetrie, Partikel, Wetter-Effekte, Sichtweite, LOD, Gegner-Pod-Detail, Render-Skalierung, Sichtfeld, Lautstärke. **Neustart des Rennens nötig:** Texturauflösung, Geometrie/Detaildichte, Tessellation, Material-Optionen, Spiegelungen (SSR), Kaskaden-Schatten, Renderer.
- **Spiegelungen:** „Screen Space Reflections" spiegeln jetzt auch in Pfützen, auf nasser Fahrbahn und Eis (in „Hoch" und „Ultra" eingeschaltet). Die **Spiegelungs-Auflösung** ist einstellbar (35–100 %; „Hoch" und „Ultra": 100 %, bis 2026-11-25 waren es 75 % – ein gespeichertes Profil wird beim ersten Laden einmal entsprechend angehoben). Der Himmel, den Pods, Eis und Wasser spiegeln, ist doppelt so fein aufgelöst.
- **Voreinstellung „Ultra":** stellt jede Option auf ihr Maximum (nur Sichtfeld und Bloom-Stärke bleiben). Sehr leistungshungrig.
- **Neu:** LOD-Distanz (ab wann ferne Bäume/Felsen vereinfacht werden), Gegner-Pod-Detail (bis zu welcher Entfernung Gegner voll detailliert sind), Wetter-Effekte (Aus/Reduziert/Voll), Volumetrie (Nebelbänke und Lichtkegel).

- **Schatten-Auflösung:** die Schattenkarten sind doppelt so fein wie zuvor (2048 / 3072 / 4096 statt 1024 / 1536 / 2048 Pixel Kantenlänge – ein Schattenpixel ist 9–12 cm statt 18–23 cm groß). Wem das zu viel Leistung kostet: Schattenqualität eine Stufe tiefer stellen.
- **Schatten-Sichtweite:** Schatten reichen je nach Schattenqualität 195 m, 245 m oder 295 m vor den Pod und laufen am Ende weich aus. Mit **Kaskaden-Schatten** (in „Ultra" eingeschaltet, sonst optional) reichen sie 700 m weit: bis 112 m scharf, dahinter weicher. Die weite Stufe kostet einen zusätzlichen Schattenpass in jedem zweiten Bild – nur bei Leistungsreserve einschalten.

| Schalter | Wirkung |
|---|---|
| Render-Skalierung | interne Auflösung (auf 4K/HiDPI bei ≤ 100 % automatisch für hohe FPS begrenzt, > 105 % natives UHD) |
| WebGL2 erzwingen | statt WebGPU |
| Static Batching | Streckengeometrie gebündelt (weniger Draw-Calls) – bei Grafikfehlern ausschalten |
| Ambient Occlusion (AO) | artefaktfreie Kontaktschatten an Kanten, Curbs, Klippenfüßen und Pods (bis 95 m) |
| Screen Space Reflections | optionale Echtzeit-Spiegelungen auf nahen Metall-/Glanzflächen (in Ultra standardmäßig aus für maximale FPS) |
| Detail-Dichte / Geometrie | Menge & Feinheit von Bewuchs, Sektor-Deko, Podracer-LODs und Gelände |

## Git: Stand und Sicherung

Alle Änderungen sind committet (Remote `origin` = `github.com/Cr0nFixXx/podracer`). Session 20 besteht aus zwei Teilen: **Strecken** (Branch `B`, per Pull Request #1 in `main`) und **Pods** (Branch `new_pods`, per Pull Request #2 in `main`). `main` enthält beide; die Weiterarbeit liegt im Zweig `dev`.

**GitHub ist die Sicherung.** Den Stand holen: `git clone https://github.com/Cr0nFixXx/podracer.git` (`main` = gemergter Stand, `dev` = Weiterarbeit). Fehlt im Arbeitsordner nur der Ordner `.git`: `npm run restore-git` holt ihn von GitHub (Zweig `dev`) – nie gepushte Commits sind dann weg, lokale Änderungen erscheinen als geändert. Ist `.git` noch da und nur beschädigt, repariert das Skript, was es kann, und löscht nichts (ein unbrauchbarer Ordner wird nach `.git.kaputt-<Zeit>` verschoben).

**Der versteckte Ordner `.git` fehlt im Download des Arbeitsordners.** Früher lag er deshalb als Textkopie im Repo (`.archiv/repo-sicherung/`, erneuert von `npm run save`). Diese Kopie stand auf Session 19 und ist seit dem 2026-11-22 gelöscht. Die Git-Historie behält sie: `git show ee3dc4b:.archiv/repo-sicherung/podracer-git.tar.gz.b64.txt`.

**`npm run save` ist seit dem 2026-11-22 abgeschaltet.** Der Befehl meldet das, bricht ab und ändert nichts. Grund: das Skript legte drei Kopien von `.git` an (gemessen: zusammen 123 MB) – der gesicherte Arbeitsordner der Sandbox darf aber nur 128 MB groß sein. Committen stattdessen: `git add <Pfade>`, `git commit`, `git gc --prune=now` (Regeln in `docs/regeln/git-sandbox.md`). Wieder einschalten: den markierten Block am Anfang von `tools/save.sh` löschen.

## Für Entwickler: Prüfbefehle

1. `npm run check` – Typecheck + Unit-Prüfungen (`tools/ci/unit.ts`) + Pod-Audit + Physik-Simulation aller 13 Strecken (11 Pods, 45 s; kein Browser nötig; etwa 1 bis 1,5 Minuten Laufzeit auf zwei CPU-Kernen). Der Typecheck schließt `tools/ci` und `tools/harness` ein. Das Startfeld wandert je Strecke um drei Pods weiter, damit alle 14 gefahren werden; `ROSTER_OLD=1` fährt das alte Feld der ersten zehn Pods (Vergleich mit früheren Tabellen).
2. `npm run check:pods` – nur das Pod-Audit (ca. 6 s): baut jeden Pod ohne Browser, vergleicht Mesh- und Dreieckszahlen mit `tools/ci/pods-baseline.json` und prüft das Sichtmodell gegen die Kollisionsform und gegen die Hülle je Pod (`src/game/podHulls.json` – gegen sie werden Tunneldecken, Brücken und Bögen geprüft; das Modell darf höchstens 2 cm herausragen, die Hülle höchstens 9 cm größer sein). Nach einer Änderung an einem Pod-Modell die Hüllen neu messen: `HULL=write npm run check:pods`.
3. `npm run check:gpu` – lädt Strecken im Headless-Chrome mit WebGPU und meldet jeden Shader-/Konsolenfehler (braucht Puppeteer, siehe `docs/regeln/tests.md` → „Test-Setup"). Bei wenig Arbeitsspeicher: `TRACKS=1 QUERY='?tex=256' npm run check:gpu` (eine Strecke, kleine Texturen).
4. `npm run build` – erzeugt `dist/index.html` (eine Datei, läuft per Doppelklick). `npm run build:web` – erzeugt `build/` (mehrere Dateien für einen Webserver, `vite.web.config.ts`); ansehen mit `npm run preview:web`.
5. Pods ansehen: `npm run dev`, dann `http://localhost:5173/tools/harness/pods.dev.html` öffnen und in der Browser-Konsole z. B. `await sheet('front')` oder `await show(0)` aufrufen (Befehle im Kopf von `tools/harness/pods.ts`).
6. Strecken-Aufbau ansehen (Tunnel, Untergründe, Seen, engste Kurven): `npx esbuild tools/ci/info.ts --bundle --platform=node --format=esm --outfile=tools/ci/out/info.mjs --log-level=error && node tools/ci/out/info.mjs frost`.
7. `npm run harness:build` – baut die Test-Seiten für den Headless-Browser (`tools/harness/out/`, auf jedem System; sie liegen nicht in Git).

**Auf GitHub** laufen `npm run check` und beide Builds bei jedem Push auf `dev` und bei jedem Pull Request nach `main` (`.github/workflows/check.yml`, unter „Actions"). Der WebGPU-Check läuft dort nur, wenn man den Lauf von Hand startet und das Häkchen setzt.

Begriffe des Projekts stehen in `CONTEXT.md`, grundlegende Entscheidungen in `docs/adr/`. Stand und nächster Schritt: `HANDOFF.md`. Regeln für die Arbeit am Code: `CLAUDE.md` und `docs/regeln/`. Was in welcher Sitzung gemacht wurde: `docs/verlauf/`.

## Bildnachweis

1. **PBR-Texturen (CC0, gemeinfrei):**
   - [Poly Haven](https://polyhaven.com): `aerial_beach_01` (Sand), `sandstone_cracks` (Fels), `cliff_side` (Klippen, Höhlen), `mud_cracked_dry_03` (Plateau), `burned_ground_01` (Asche), `moon_02` (Mondstaub), `brown_mud_02` (Schlamm), `forest_floor` (Waldboden), `river_small_rocks` (Kies), `metal_plate_02` (Stationsdeck), `coast_land_rocks_01` (Riff).
   - [ambientCG](https://ambientcg.com): `Ice003` (Eis), `Lava001` (Lavasee und Lavameer), `Snow010A` (Schnee), `Snow008A` (Pulverschnee).
   - Neu laden und umwandeln: `python3 tools/photos/pbr.py` (braucht Pillow und Internet).
2. **Foto-Details von Pexels (freie Lizenz):** Fels – Alfo Medeiros, Rinde – Marina Leonova, Sand – Alejandro Henriquez, Boden – Engin Akyurt.
