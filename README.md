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
| Gas / Bremse | `W` `S` / `↑` `↓` | RT / LT |
| Lenken | `A` `D` / `←` `→` | linker Stick |
| Boost | `Shift` / `Leertaste` | A |
| Luftbremse (enge Kurven) | `E` / `Q` / `Strg` | B / LB / RB |
| Reparatur (langsamer fahren) | `R` | X |
| Kamera wechseln | `C` | Y |
| Pause | `Esc` / `P` | Start |

Boost erhitzt die Triebwerke – rechtzeitig loslassen. **Hangar:** Pod mit der Maus drehen, Mausrad zoomt.

## Strecken-Gefahren

| Gefahr | Verhalten |
|---|---|
| Leitplanken / Felswände | harter Aufprall, Schaden auf der getroffenen Seite; über den Planken weiches Energiefeld |
| Rotoren, Fallgitter, Einsturz-Felsbögen | bewegliche Hindernisse (Lampen/Warnungen beachten) |
| Geysire / Lava-Schlote | 1 s Warnring, dann Ausbruch (Schaden, Hitze, Auftrieb) |
| Tunneldecken | Kopfstoß bei Sprüngen |

## Inhalte

**10 Podracer** (alle freigeschaltet, Tuning, Lackierung) · **14 Strecken: 8 Rundkurse, 6 Sprints** auf Tatooine, Ando Prime, Oovo IV, Malastare und weiteren Welten · bis zu 10 Gegner, 4 Schwierigkeitsstufen · 6 Kameras.

## Landschaft

- **Offene Welten:** weite Ebenen, Halbschluchten mit Talblick, Gebirgsketten und Silhouetten am Horizont, Höhennebel in Tälern, **ziehende Wolkenschatten**.
- **Boden:** Sand/Gras/Schnee wechselt mit **Kiesbanketten** an der Strecke, **Salzpfannen** (Tatooine), **gefrorenen Seen** (Ando Prime), **Sümpfen** (Malastare, Dschungel), **Lavakrusten mit glühenden Rissen**; Felsen zeigen Gesteinsschichten.
- **Bewuchs:** Gras, Schilf, Farne, Blumen, Büsche, Dornsträucher, Steine, Kiesel, Eissplitter, Kristalle, leuchtende Pilze – im Wind wiegend, je Welt passend.
- **Leben:** Vogelschwärme (Greifvögel, Möwen, Fledermäuse, leuchtende Motten), Bantha-Herden, Langhals-Riesen, Sandkriecher, Landgleiter, Himmelsverkehr, Patrouillenschiffe, Lastkähne.
- **Landmarken:** Krayt-Drachen-Skelett, Feuchtfarm, Mos Espa, Raumschiffwracks, Forschungsstationen, Raffinerien, Vulkane mit Aschesäule, Steinkreis, Leuchtturm, Gefängnistürme u. v. m.
- **Rauch ohne Partikel:** Rauch-, Dampf-, Asche- und Methansäulen über Schloten und Vulkanen, **Staubteufel** auf Tatooine, Schneeteufel auf Ando Prime.
- Sand- und Schneeverwehungen an den Planken, Pfützen mit Regenringen, Zwillingssonnen über Tatooine.

## Grafik-Einstellungen (Auswahl)

| Schalter | Wirkung |
|---|---|
| WebGL2 erzwingen | statt WebGPU |
| Static Batching | Streckengeometrie gebündelt (weniger Draw-Calls) – bei Grafikfehlern ausschalten |
| Detail-Dichte | Menge an Bewuchs, Deko, Tieren |
| Geometrie-Detail | auch Gelände-Feinheit nahe der Strecke |
| Sichtweite | Geländegröße + Nebeldichte |


## Neu in Session 6
- Detailliertere Landschaften: echte Dschungelbäume, Nadelbäume, Felsnadeln mit Deckstein, terrassierte Tafelberge, kantige Felsen, Kakteen mit Armen, Kristall- und Eiscluster.
- Neues Start-/Zieltor mit Fachwerkträger.
- Klügere Gegner in dichten Hindernisfeldern (planen ihren Weg durch die Felsen).
- Tipp: Bei niedriger Bildrate „Geometrie“ in den Grafikeinstellungen senken – der Dschungel ist auf Ultra sehr detailreich.

## Neu in Session 7
- Deutlich weniger Ruckeln am Start: entfernte Gegner werden vereinfacht gezeichnet, Landschaft wird nur noch in Sichtweite gerendert.
- Umgebungsverdeckung (GTAO, Ultra) ohne Grafikfehler.
- Kein Flackern mehr bei Glanzlichtern auf nassen Straßen, Eis und Chrom.
- Tipp: Bei Rucklern zuerst „SSR“ und „Umgebungsverdeckung“ ausschalten (die teuersten Effekte), dann die Render-Skalierung senken.

## Neu in Session 8
- Rennstart ohne Ruckler (Shader werden beim Laden vorbereitet).
- Weniger Felsen auf der Strecke, jeder mit leuchtendem Warnring und Bake.
- Staub und Rauch der Vorderleute stören die Sicht kaum noch.
- Podracer tauchen in Kurven nicht mehr in den Boden ein; die Triebwerke federn beim Lenken sichtbar auf und ab.

## Neu in Session 9 – Steuerung
| Taste | Funktion |
|---|---|
| W / S | Schub / Umkehrschub |
| A / D | Lenken links / rechts |
| Leertaste | Handbremse / Sliden |
| ← / → | Rolle nach links / rechts (90°, passt durch enge Lücken) |
| ↑ / ↓ | Neigung (schneller) / Anheben (mehr Bodenfreiheit) |
| Q / E / Strg | Linke / rechte / beide Luftbremsen |
| Shift | Boost |
| R / C | Reparatur / Ansicht |

Außerdem: Umgebungsverdeckung (GTAO) jetzt ohne Fehler bei Rauch und Abgasen, schönere Rauchwolken, Partikel laufen auf der Grafikkarte.

- Ultra: kaskadierte Schatten (schärfer in der Nähe, reichen viel weiter).

## Neu in Session 10
- Gegner sliden durch Haarnadeln, nutzen die kurveninnere Luftbremse und rollen sich durch enge Felsfelder.
- Gegner überleben deutlich öfter (weniger Massenkarambolagen).
- Neue Lage-Anzeige im Tacho (Rolle, Neigung, Luftbremsen, Slide).
- Sliden wirbelt Staub auf und zischt hörbar.
- Spiegelungen (SSR, Ultra) ohne Störungen durch Rauch und Abgase.

## Neu in Session 11
- Mehr Bildrate in dichten Landschaften: entfernte Bäume und Felsen werden automatisch vereinfacht (nah unverändert).
- Ando Prime: verschneite Nadelbäume.

## Neu in Session 12
- Wälder reichen jetzt bis zum Horizont.
- Lavafälle auf der Vulkanwelt, gefrorene Eisfälle auf Ando Prime, Wasserfälle an steilen Hängen.
- Glattere, realistischere Straßenoberfläche (keine Grübchen mehr).

## Neu in Session 13
- Dschungel, Malastare und Methan: Wasserfälle stürzen die Schluchtwände neben der Strecke hinunter.

## Neu in Session 14
- Wasserfälle rauschen, Lavafälle grollen – lauter, je näher du kommst.
- Nebel am Fuß der Wasserfälle, Glutfunken an Lavafällen; wer durch eine Kaskade fährt, spritzt Wasser auf.
- Fälle liegen jetzt dort, wo man sie von der Strecke aus sieht, und werden nicht mehr von Felsen oder Bäumen verdeckt.

## Neu in Session 15
- Herden galoppieren davon, wenn du ihnen zu nahe kommst.
- Vogelschwärme landen auf Felsen und fliegen auf, wenn du vorbeirast.
- Tiere und Fahrzeuge laufen nicht mehr durch Felsnadeln, Tafelberge, Landmarken oder Wasserfälle.
- Unter den Wasserfällen ist die Fahrbahn nass und spiegelt; wer hindurchfährt, hat kurz Tropfen auf der Kamera.
- Feinere Bodenstruktur aus der Nähe (z. B. Windverwehungen im Schnee) und Büsche bis in die Ferne.

## Neu in Session 16 – Steigungen und Schrägkurven
- Die Strecken führen jetzt über Hügel: Anstiege kosten Tempo, Gefälle geben es zurück (steilste Stellen 5–11 %, je nach Strecke).
- Kurven sind überhöht (bis 7 m am Außenrand). Wer in die Schräge einlenkt, kommt enger und schneller herum.
- Der Podracer legt sich in Schrägkurven parallel zur Fahrbahn; Startaufstellung und Sprungschanzen bleiben eben.
