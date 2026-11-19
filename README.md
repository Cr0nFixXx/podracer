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

**Tasten ändern:** Einstellungen → Steuerung. Aktion anklicken und die gewünschte Taste drücken (Esc bricht ab). Zwei Vorlagen stehen bereit: „Standard" (Tabelle oben) und „Klassisch" (Pfeiltasten lenken und geben Schub, `I`/`K` Neigen/Anheben, `J`/`L` Rolle). Pause bleibt auf `Esc`/`P`.

**Anzeige im Rennen:** unten links zeigt ein Pod-Symbol die Fluglage (dreht sich bei der Rolle, Pfeil für Anheben/Neigen). Der Balken darunter füllt sich im Slide – ist er gelb, gibt es beim Loslassen den Extra-Schub. Unter der Karte stehen Tageszeit und Wetter.

### Flugmanöver
1. **Slide:** `Leertaste` halten und lenken – das Heck bricht aus, der Pod dreht scharf ein und verliert kaum Tempo. Nach einem langen Slide loslassen und Schub geben: kurzer Extra-Schub.
2. **Weiter springen:** auf der Rampe und in der Luft `↓` halten – der Pod hebt die Nase und gleitet (etwa doppelte Sprungweite, kostet etwas Tempo).
3. **Schneller landen:** in der Luft `↑` halten – der Pod taucht ab. Am Boden drückt `↑` den Pod tiefer und gibt mehr Haftung.
4. **Hochkant durch Lücken:** `←` oder `→` halten – der Pod rollt 90° und ist nur noch ein Viertel so breit; dafür lenkt er träger.
5. Cockpit und Triebwerke neigen sich nur gemeinsam und nur, solange `↑`/`↓` gedrückt ist. Beim Lenken hebt sich das äußere Triebwerk als Ganzes, ohne zu kippen.

Boost erhitzt die Triebwerke – rechtzeitig loslassen. **Hangar:** Pod mit der Maus drehen, Mausrad zoomt. Leuchtende blaue **Reparaturbuchten** mit Tesla-Spulen markieren schnelle Service-Abschnitte.

## Tageszeit & Wetter

Im Menü **Renneinstellungen** gibt es zwei neue Auswahlfelder. Beide wirken auf jede der 14 Strecken (Ausnahme: Oovo IV liegt im Weltraum).

| Tageszeit | Wirkung |
|---|---|
| Standard der Welt | das ursprüngliche Licht der Strecke |
| Morgendämmerung | tiefe Sonne, rosa Horizont, Morgendunst |
| Mittag | hohe Sonne, klares hartes Licht |
| Abenddämmerung | Sonne knapp über dem Horizont, starke Blendung |
| Nacht | Mondlicht, Sternenhimmel, leuchtende Triebwerke und Streckenlichter |

| Wetter | Wirkung |
|---|---|
| Standard der Welt | jede Welt hat ihr eigenes Wetter (z. B. Staub auf Tatooine, Schneeböen auf Ando Prime, Smog auf der Vulkanwelt) |
| Klar | wenig Wolken, weite Sicht, volle Sonnenblendung |
| Regen | nasse, spiegelnde Fahrbahn, Regentropfen auf der Linse, Gischt hinter den Pods; etwas weniger Haftung |
| Gewitter | Starkregen, Wind, Blitze mit Donner; am wenigsten Haftung |
| Schneeböen | treibender Schnee, Schneeschwaden quer über die Piste, Schnee auf der Fahrbahn |
| Staubsturm | dichte Staubschwaden, diffuse Sonne |
| Nebel / Smog | Bodennebel mit ziehenden Nebelbänken |
| Aufziehendes Gewitter | Start im Nieselregen; in den ersten 75 Sekunden zieht ein Gewitter auf – mehr Regen, dunklerer Himmel, Blitze, weniger Haftung |

**Lichter:** Bei Nacht (und auf den dunklen Welten Vulkan und Oovo IV) schalten alle Pods Scheinwerfer, Positionslichter und ein Blitzlicht ein; dein Pod leuchtet die Fahrbahn aus. Hinter deinen Triebwerken flimmert die heiße Luft.

**Sound:** Turbinen mit Whine und Sub-Bass, Düsenrauschen beim Boost, Zischen im Slide, Regen, Wind, Donner und Echo in Schluchten und Tunneln.

**Linseneffekte** (Sonnenblendung, Regentropfen) lassen sich in den Grafik-Einstellungen abschalten.

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

- **Kaskaden-Schatten (neu, optional):** zweite, weite Schattenstufe bis 520 m für ferne Schluchtwände. Kostet einen zusätzlichen Schattenpass – nur bei Leistungsreserve einschalten.

| Schalter | Wirkung |
|---|---|
| Render-Skalierung | interne Auflösung (auf 4K/HiDPI bei ≤ 100 % automatisch für hohe FPS begrenzt, > 105 % natives UHD) |
| WebGL2 erzwingen | statt WebGPU |
| Static Batching | Streckengeometrie gebündelt (weniger Draw-Calls) – bei Grafikfehlern ausschalten |
| Ambient Occlusion (AO) | artefaktfreie Kontaktschatten an Kanten, Curbs, Klippenfüßen und Pods (bis 95 m) |
| Screen Space Reflections | optionale Echtzeit-Spiegelungen auf nahen Metall-/Glanzflächen (in Ultra standardmäßig aus für maximale FPS) |
| Detail-Dichte / Geometrie | Menge & Feinheit von Bewuchs, Sektor-Deko, Podracer-LODs und Gelände |

## Auf GitHub pushen

Der Projektordner ist ein Git-Repository (Branch `B`, Remote `origin` = `github.com/Cr0nFixXx/podracer`). Alle Änderungen sind lokal committet.

1. `git log --oneline` – Commits ansehen.
2. `git push origin B` – hochladen (GitHub-Anmeldung nötig).
3. Neue Änderungen sichern: `npm run save -- "Beschreibung"` (committet und schreibt zusätzlich die Sicherung `.archiv/git/podracer-B.bundle`).
4. Falls der Ordner `.git` fehlt: Anleitung in `HANDOFF.md` → „Git-Stand".

## Für Entwickler: Prüfbefehle

1. `npm run check` – Typecheck + Physik-Simulation aller 14 Strecken (11 Pods, 45 s, ca. 25 s Laufzeit, kein Browser nötig).
2. `npm run check:gpu` – lädt Strecken im Headless-Chrome mit WebGPU und meldet jeden Shader-/Konsolenfehler (braucht Puppeteer, siehe `HANDOFF.md`).
3. `npm run build` – erzeugt `dist/index.html`.
