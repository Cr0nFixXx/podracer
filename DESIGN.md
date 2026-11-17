# DESIGN.md – Design Schema

## Look & feel
Episode-I-Racer: sonnenverbrannt, mechanisch, abgenutzt – und **weit und belebt**. Offene Landschaften mit Fernsicht, Schluchten als Höhepunkte, Tiere und Fahrzeuge in der Ferne. **Kein Filmkorn, kein überstrahlender Bloom.**

## UI
Schwarz/Dunkelbraun, Glas-Panels, Amber-Akzent (`#ffb040`), Orbitron + Rajdhani, abgeschrägte Ecken. HUD `FPS · WebGPU/WebGL2`.

## Gelände-Schichten (terrainMaterial)
| Schicht | Kachel | Wo | Gewicht |
|---|---|---|---|
| Boden (Sand/Gras/Schnee/Basalt) | 30 m | überall | Basis |
| Kies | 7 m | Bankette 3–14 m neben der Strecke, Flecken (Rauschen) | `aSplat.x` + Höhe |
| Becken | 18 m | flache Senken ≥ 30 m von der Strecke | `aSplat.y`, nur flach |
| Fels (Schichtung) | 26 m | Hänge > ~20 % | Neigung + Höhe |
| Wolkenschatten | 520/1500 m | überall | `theme.clouds × 0.45` |

| Welt | Kies | Becken |
|---|---|---|
| Tatooine | sandbrauner Kies | weiße Salzpfanne (Risse) |
| Ando Prime | graues Geröll, dunkle Felswände | gefrorener See (Rauheit 0,07) |
| Dschungel | Schlamm/Stein | moosiger Sumpf |
| Malastare | grauer Schotter | dunkler Methan-Sumpf (glänzend) |
| Vulkanwelt | Schlacke | Lavakruste, Risse glühen orange |

Gesteinsschichten: Bandhöhe 5–10 m, 3 Farbtöne je Welt + dunkle Fuge, auch auf Schluchtwänden und Landmarken.

## Bewuchs (groundCover)
| Welt | Typen | Dichte (pro km Strecke) |
|---|---|---|
| Tatooine | Trockengras, Dornstrauch, Steine, Kiesel | 1800 / 520 / 700 / 520 |
| Ando Prime | Schneefelsen, Eissplitter, bereifte Sträucher, Kiesel | 420 / 220 / 140 / 320 |
| Dschungel | Gras, Farn, Busch, Blumen | 6000 / 650 / 420 / 520 |
| Malastare | Schilf, Olivgras, Leuchtpilze, Steine, Büsche | 1300 / 1700 / 140 / 320 / 110 |
| Vulkanwelt | Schlacke, Glutfelsen, verkohlte Sträucher | 650 / 140 / 90 |
| Kristall / Aquilaris | Kristalle, violettes Gras / Gras, Büsche, Steine | – |
Sichtweite: Gras 110–150 m (Dither-Fade), Büsche/Steine 360–430 m. Wind nur auf Pflanzen.

## Leben (wildlife)
| Welt | Tiere | Fahrzeuge |
|---|---|---|
| Tatooine | Greifvögel (segelnd), Bantha-Herden | Sandkriecher, Landgleiter, Himmelsverkehr |
| Ando Prime | weiße Vögel, Wollherden | Schneegleiter, Himmelsverkehr |
| Dschungel | rote Vögel, Herden, Langhals-Riesen | Himmelsverkehr |
| Malastare | Fledermäuse, Herden, Langhals-Riesen | Gleiter, Himmelsverkehr |
| Vulkanwelt / Kristall / Aquilaris | Aschekrähen / Leuchtmotten / Möwen | Verkehr / Verkehr / Lastkähne |
| Oovo IV | – | 6 Patrouillenschiffe |

## Rauch (smoke)
| Art | Farbe | Höhe | Quelle |
|---|---|---|---|
| smoke | Grau 0,34 | 170 m | Raffinerie-Schlote, Bohrinseln |
| ash | Dunkel 0,2 | 430 m | Vulkane |
| dark | 0,15 | 120 m | Wracks, Lavaspalten |
| steam | Weiß | 90 m | Stationen, Feuchtfarm, Dschungel/Eis-Quellen |
| methane | Oliv | 110 m | Malastare-Schlote |
| Teufel | Sand/Schnee/Oliv | 55–100 m | wandernde Wirbel |

## Landmarken (Ergänzungen)
Krayt-Skelett (70–100 m, 17 Rippenpaare, Schädel mit Hörnern), Feuchtfarm (Ringmauer, Kuppel, 6 Verdunster), Steinkreis (11 Monolithen), Leuchtturm (Felsinsel), Wrack auch auf Ando Prime.

## Strecken-Elemente, Podracer, Post-Processing
Unverändert (siehe frühere Sessions): Leitplanken + Energiefeld, Curbs, Set-Pieces, Geysire; Podracer-Farbrollen; ACES, God Rays nur aus dem Himmel, **Grain = 0**.
