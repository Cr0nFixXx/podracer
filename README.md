# Podracer: Hyperspeed Legends

Podracer-Rennspiel im Stil von *Star Wars Episode I: Racer*. Läuft komplett im Browser mit **WebGPU** (automatischer **WebGL2-Fallback**) und wird als **eine einzige HTML-Datei** ausgeliefert.

## Schnellstart

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # erzeugt dist/index.html (alles inline, offline lauffähig)
```

`dist/index.html` direkt im Browser öffnen – fertig. Rechts unten im Rennen steht, welcher Renderer läuft (`WebGPU` oder `WebGL2`).

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
| Pause | `Esc` / `P` | Start |

In der Ansicht „Cockpit" (`C`) blickt man ohne Cockpit-Rahmen frei über die Triebwerke.

**Gamepad ändern:** Einstellungen → Steuerung → Abschnitt „Gamepad": Aktion anklicken, dann Taste drücken oder Stick bewegen. „Standard" stellt die Belegung aus der Tabelle wieder her.

**Tasten ändern:** Einstellungen → Steuerung. Aktion anklicken und die gewünschte Taste drücken (Esc bricht ab). Zwei Vorlagen stehen bereit: „Standard" (Tabelle oben) und „Klassisch" (Pfeiltasten lenken und geben Schub, `I`/`K` Neigen/Anheben, `J`/`L` Rolle). Pause bleibt auf `Esc`/`P`.

**Anzeige im Rennen:** unten links zeigt ein Pod-Symbol die Fluglage (dreht sich bei der Rolle, Pfeil für Anheben/Neigen). Der Balken darunter füllt sich im Slide – ist er gelb, gibt es beim Loslassen den Extra-Schub. Unter der Karte stehen Tageszeit und Wetter.

### Flugmanöver
1. **Slide / Drift:** `Leertaste` halten und lenken – die Haftung lässt weich nach, das Heck bricht aus und schwingt herum, der Pod driftet weit auf seinem Schwung (bis etwa 60° quer). Gegenlenken fängt ihn ab; nach dem Loslassen greift er über etwa eine halbe Sekunde wieder. Nach einem langen Slide loslassen und Schub geben: kurzer Extra-Schub (Balken unter der Fluglage-Anzeige wird gelb).
2. **Weiter springen:** auf der Rampe und in der Luft `↓` halten – der Pod hebt die Nase und gleitet (etwa doppelte Sprungweite, kostet etwas Tempo).
3. **Schneller landen:** in der Luft `↑` halten – der Pod taucht ab. Am Boden drückt `↑` den Pod tiefer und gibt mehr Haftung.
4. **Hochkant durch Lücken:** `←` oder `→` halten – der Pod rollt 90° und ist nur noch ein Viertel so breit. **Im gerollten Zustand ist die Steuerung mitgedreht:** `↓` (Anheben) zieht den Pod zur Rollseite hin, `↑` (Neigen) von ihr weg; `A`/`D` bewegen ihn auf und ab. Die Lenkung über `↑`/`↓` ist dabei kräftiger als die normale Lenkung.
5. Cockpit und Triebwerke neigen sich nur gemeinsam und nur, solange `↑`/`↓` gedrückt ist. Beim Lenken hebt sich das äußere Triebwerk als Ganzes, ohne zu kippen.

**Boost-Anzeige:** Der Balken unter dem Tacho zeigt die Triebwerkshitze; im schraffierten Bereich (ab 80 %) wird es kritisch. **Überziehen:** bei „MAX" lässt sich der Boost noch bis zu 3 Sekunden halten – das kostet langsam Triebwerkszustand (Anzeige „ÜBERZOGEN · NOCH x s"). Danach schalten die Triebwerke ab, bis die Hitze unter die Marke „BEREIT" gefallen ist. Die Hitze sieht man auch am Pod: die Glut wandert von der Düse nach vorn, kurz vor dem Limit glühen die Triebwerke hellgelb und sprühen Funken.

**Hindernisse:** Frachtkisten und kleine Felsen lassen sich mit Tempo zertrümmern – das kostet etwas Triebwerkszustand und Tempo. Säulen und große Felsen bleiben hart. Sponsoren-Traversen, das Startportal und die Checkpoint-Bögen sind massiv: nicht hineinfliegen (die Bögen sind am Rand niedriger als in der Mitte).

**Pods:** Jeder Pod zieht zwei Staubfahnen unter den Triebwerken hervor (bei Nässe Gischt) – auch der eigene. Das Cockpit hängt an den Leitungen und pendelt in Kurven, beim Beschleunigen und Bremsen mit. Der **Quadra Lumber** fliegt mit vier schlanken Triebwerken im Quadrat und einem X aus Energieblitzen. Beim Boost öffnen sich die Düsenklappen am Triebwerksausgang – auch bei den Gegnern.

**Schwerelosigkeit (Oovo IV):** In den Röhren gibt es keine Schwerkraft und keinen Luftwiderstand: der Pod wird schneller, schwebt frei und driftet seitlich nach. `↓` und `↑` schieben ihn dort wie Steuerdüsen nach oben und unten. Kurz vor dem Röhrenende sinkt er von selbst auf Schwebehöhe.

**Tunnel:** Jede Strecke hat Tunnel. Die Decke ist massiv – und **oben befahrbar**: wer vor dem Portal abhebt und darüber fliegt, landet auf dem Tunneldach, fährt dort weiter und springt am Ende wieder auf die Strecke hinunter.
- **Aquilaris:** zwei Unterwassertunnel; die Fahrbahn taucht unter den Meeresspiegel, durch die Fenster sieht man den Ozean.
- **Magma-Inferno:** ein Höhlensystem – 600 m teils unterirdisch, mit zwei offenen Lichtschächten.

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
| Ökumenopolis, Dschungelmond, Aquilaris, Kristallschluchten, Malastare | Klar, Regen, Gewitter, Nebel |

Dazu überall drei **Wetterverläufe**: „Aufziehendes Unwetter" (ruhig → heftig in 75 s), „Aufklarend" (umgekehrt) und „Wechselhaft" (beides im Wechsel). Was „heftig" ist, hängt von der Welt ab: Gewitter, Sandsturm, Schneesturm oder Aschesturm.

- **Intensität:** Regen, Schnee und Staub sind dicht (bis 4 200 Partikel), die Sicht geht bei Unwetter spürbar zurück, Böen ziehen Schwaden quer über die Piste und rütteln an der Kamera.
- **Regen:** Tropfen ziehen mit steigendem Tempo immer längere Streifen, auf der Linse laufen sie erst herab und werden bei hohem Tempo nach außen getrieben. Pods ziehen Gischtfahnen, Tropfen spritzen auf der Fahrbahn. Die Straße wird nass und trocknet nach dem Regen langsam ab. Etwas weniger Haftung.
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
| Fallgitter | drei Torsektionen fallen der Reihe nach (Grün → Gelb blinkend → Rot mit Metallschlag) |
| Rollende Felsen | Schluchtrinnen schleudern nach gelber Warnlampe springende Felsbrocken quer über die Piste |
| Einsturz-Fels- & Eisbögen | brechen beim Anflug der Spitze und hinterlassen einen Slalom aus Fels- bzw. Gletscherblöcken |
| Geysire / Lava-Schlote | Sinterkrater mit 1 s Warnring, dann Ausbruch (Schaden, Hitze, Auftrieb, Dampf-/Magmagrollen) |
| Tunneldecken & Zero-G-Röhren | Kopfstoß bei hohen Sprüngen; Schwerelosigkeitsröhren auf Oovo IV |

## Inhalte

**10 Podracer** (alle freigeschaltet, Tuning, Lackierung) · **14 Strecken: 8 Rundkurse, 6 Sprints** auf Tatooine, Ando Prime, Ökumenopolis, Vulkanwelt, Dschungelmond, Aquilaris, Oovo IV, Kristallschluchten und Malastare · bis zu 10 Gegner mit vorausschauender Korridor-KI, 4 Schwierigkeitsstufen · 6 Kameras.

## Landschaft & Atmosphäre

- **Steigungen & Schrägkurven (neu):** jede der 14 Strecken hat lange Anstiege und Gefälle (bis 11–17 %) mit Kuppen zum Abheben sowie überhöhte Kurven (bis ca. 21°), die spürbar mehr Haftung geben.
- **Bedienoberfläche:** alle Menüs haben dieselbe Schriftgröße und wachsen mit dem Fenster (Bezugsgröße 1180 × 720); keine Scrollbalken. In der Streckenwahl filtert ein Auswahlfeld nach Planet.
- **Schnellere Folgestarts:** berechnete Texturen werden im Browser gespeichert (IndexedDB); ab dem zweiten Start einer Welt entfällt die Berechnung. `?nocache` an der Adresse schaltet das ab.
- **Hangar (neu):** 8 Lackierungs-Vorlagen (z. B. „Boonta Gold", „Tarnkappe", „Neon-Nacht") neben der freien Farbwahl.
- **Größere Strecken (neu):** alle 14 Kurse sind 7–14 km lang (vorher 5–10 km), mit zusätzlichen S-Kurven, zwei weiten offenen Flächen je Strecke (Fahrbahn bis über 100 m breit) und längeren Tunneln (260–560 m).
- **Höhlensysteme (neu):** auf der Vulkanwelt (5 Kammern, rund 1,1 km), Ando Prime und in den Kristallschluchten – abgesenkte Fahrbahn, hohe Kammern, Lichtschächte, Felssäulen, Stalaktiten.
- **HQ-Vegetation und echte Texturen (neu):** Urwaldbäume mit Blattwerk aus einzelnen Zweigen und fotografierter Rinde; Fels, Sand und Waldboden tragen Detail aus echten Fotos. Mehr Felsen, Bäume und Landmarken entlang der längeren Strecken.
- **Sci-Fi-Ausstattung (neu):** laufende Licht-Leitstreifen an den Fahrbahnrändern, Holo-Tafeln, Schwebe-Baken und Energieleitungen auf Oovo IV, Aquilaris, Malastare und in Ökumenopolis; Leitstreifen in jedem Tunnel. Malastare fährt auf einem getäfelten Metall-Renndeck.
- **Breitere Pisten & Renntechnik (neu):** alle Strecken sind 18 % breiter. Am Rand stehen Repulsor-Relaistürme mit gegenläufig drehenden Ringen, Patrouillen-Drohnen begleiten das Feld.
- **Offene Welten & Schluchten:** Barchan-Dünen und Kies-Wadis (Tatooine), Gletschergrate (Ando Prime), Karsthügel und Flussläufe (Dschungel/Malastare), glühende Lavarinnen (Vulkanwelt), Atolle und Felsnadeln (Aquilaris), dreistufige Horizont-Silhouetten, Talnebel und **ziehende Wolkenschatten**.
- **Mehrschichtiger Boden & Detail-Normalmaps:** Sand/Gras/Schnee wechselt mit **Kiesbanketten**, **Salzpfannen**, **gefrorenen Seen**, **Sümpfen**, **Lavakrusten mit glühenden Rissen** und geschichtetem Fels (Schnee-, Moos- und Sandauflage auf flachen Felsabsätzen); jede Welt hat eigene Nah-/Mitteldistanz-Normalmaps (Windrippel, Sastrugi, Humus/Wurzeln, Pahoehoe-Lava, Kristallfacetten, Strandsand) sowie Uferschaum am Wasser.
- **Detaillierte Fels- & Pflanzenformen (neu):** geschichtete Felsnadeln (Hoodoos) mit überhängenden Simsen und Schuttfuß, kantig gebrochene Felsbrocken, gestufte Tafelberge mit Erosionsrinnen, Urwaldriesen mit Brettwurzeln, Schirmkronen und Lianen, Schneekiefern mit hängenden Astetagen, facettierte Eis- und Kristall-Cluster, gerippte Saguaro-Kakteen. Fels zeigt natürliche Schichtung, Klüfte und Verwitterungslöcher statt eines Ziegelmusters.
- **Rennarchitektur (neu):** Startportal mit Fachwerk-Traverse, kannelierten Türmen, Abspannseilen und Zeitentafel; Rennluftschiffe mit Leitwerk und Gondel; Dreibein-Energiemasten; Megastadt-Hochhäuser mit Rücksprüngen, Sky-Docks und Antennen; aufgerissene Pod-Wracks am Streckenrand.
- **Wasser- & Lavafälle:** animierte Kaskaden an hohen Schluchtwänden (Dschungel, Aquilaris, Ando Prime) und glühende Magmafälle (Vulkanwelt) mit Gischt-/Glutbecken und aufsteigendem Dampf.
- **Bewuchs mit LOD:** Gras, Schilf, Farne, Blumen, Agaven, bemooste Stämme, Büsche, Dornsträucher, Steine, Kiesel, Eissplitter, Kristalle, Leuchtpilze – im Wind wiegend, ferne Büsche mit nahtlosem Dither-LOD bis über 500 m.
- **Reagierende Tierwelt & Verkehr:** Vogelschwärme (inkl. auf Felsen sitzender Schwärme, die bei vorbeirasenden Pods auffliegen), vor Pods fliehende Bantha-Herden, Langhals-Riesen, Sandkriecher, Landgleiter, Himmelsverkehr, Patrouillenschiffe und Lastkähne – weichen Landmarken aus und haben eigene Umgebungsgeräusche.
- **Landmarken & Rauch:** Krayt-Drachen-Skelett, Feuchtfarm, Mos Espa, zerbrochene Raumschiffwracks, verbundene Forschungsstationen, Raffinerien mit Kugeltanks, Vulkane mit Lavastrom und Aschesäule, Stufentempel mit Feuerschalen, Steinkreis, Bohrinseln mit Helipad, gestreifte Leuchttürme, Gefängnistürme sowie wandernde Staub-, Schnee- und Methanteufel.

## Grafik-Einstellungen (Auswahl)

- **Erreichbar** über „Einstellungen → Grafik & Ton" und im Rennen über **Pause (`Esc`) → Grafik-Einstellungen**. **Sofort wirksam:** alle Effekte (Bloom, Ambient Occlusion, God Rays, Unschärfe, Kino-Shader, Linseneffekte), Kantenglättung, Schatten, Textur-Filter, Volumetrie, Partikel, Wetter-Effekte, Sichtweite, LOD, Gegner-Pod-Detail, Render-Skalierung, Sichtfeld, Lautstärke. **Neustart des Rennens nötig:** Texturauflösung, Geometrie/Detaildichte, Tessellation, Material-Optionen, Spiegelungen (SSR), Kaskaden-Schatten, Renderer.
- **Spiegelungen:** „Screen Space Reflections" spiegeln jetzt auch in Pfützen, auf nasser Fahrbahn und Eis (in „Hoch" und „Ultra" eingeschaltet). Die **Spiegelungs-Auflösung** ist einstellbar (35–100 %, Standard 75 %).
- **Voreinstellung „Ultra":** stellt jede Option auf ihr Maximum (nur Sichtfeld und Bloom-Stärke bleiben). Sehr leistungshungrig.
- **Neu:** LOD-Distanz (ab wann ferne Bäume/Felsen vereinfacht werden), Gegner-Pod-Detail (bis zu welcher Entfernung Gegner voll detailliert sind), Wetter-Effekte (Aus/Reduziert/Voll), Volumetrie (Nebelbänke und Lichtkegel).

- **Kaskaden-Schatten (neu, optional):** zweite, weite Schattenstufe bis 520 m für ferne Schluchtwände. Kostet einen zusätzlichen Schattenpass – nur bei Leistungsreserve einschalten.

| Schalter | Wirkung |
|---|---|
| Render-Skalierung | interne Auflösung (auf 4K/HiDPI bei ≤ 100 % automatisch für hohe FPS begrenzt, > 105 % natives UHD) |
| WebGL2 erzwingen | statt WebGPU |
| Static Batching | Streckengeometrie gebündelt (weniger Draw-Calls) – bei Grafikfehlern ausschalten |
| Ambient Occlusion (AO) | artefaktfreie Kontaktschatten an Kanten, Curbs, Klippenfüßen und Pods (bis 95 m) |
| Screen Space Reflections | optionale Echtzeit-Spiegelungen auf nahen Metall-/Glanzflächen (in Ultra standardmäßig aus für maximale FPS) |
| Detail-Dichte / Geometrie | Menge & Feinheit von Bewuchs, Sektor-Deko, Podracer-LODs und Gelände |

## Git: lokale Commits und Kopie im Archiv

Alle Änderungen sind lokal committet (Branch `B`, Remote `origin` = `github.com/Cr0nFixXx/podracer`).

**Der versteckte Ordner `.git` fehlt im Download.** Er steckt deshalb als Textdatei in **`.archiv/repo-sicherung/podracer-git.tar.gz.b64.txt`**. Wiederherstellen (im Projektordner ausführen):

1. Windows: `powershell -ExecutionPolicy Bypass -File .archiv\repo-sicherung\wiederherstellen.ps1`
2. Linux/macOS: `sh .archiv/repo-sicherung/wiederherstellen.sh`
3. Danach: `git log --oneline` und `git push origin B`.

Neue Änderungen sichern: `npm run save -- "Beschreibung"` (committet und erneuert die Kopie).

## Für Entwickler: Prüfbefehle

1. `npm run check` – Typecheck + Physik-Simulation aller 14 Strecken (11 Pods, 45 s, ca. 25 s Laufzeit, kein Browser nötig).
2. `npm run check:gpu` – lädt Strecken im Headless-Chrome mit WebGPU und meldet jeden Shader-/Konsolenfehler (braucht Puppeteer, siehe `HANDOFF.md`).
3. `npm run build` – erzeugt `dist/index.html`.

## Bildnachweis

Foto-Texturen von Pexels (freie Lizenz): Fels – Alfo Medeiros, Rinde – Marina Leonova, Sand – Alejandro Henriquez, Boden – Engin Akyurt.
