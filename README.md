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
