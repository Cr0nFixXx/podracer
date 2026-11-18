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

## HUD-Lage-Anzeige (Session 10)
Kleines Instrument unter dem Tacho: cyan Balken = Pod (Neigung = Rolle, Höhe = Neigen/Anheben), Endpunkte amber = Luftbremse aktiv, Schriftzug „SLIDE“ (amber) / „ROLLE“ (cyan).

## Steuerung (Session 9)
W Schub · S Umkehrschub · A/D Lenken · Leertaste Handbremse/Slide · ←/→ Rolle 90° · ↑ Neigung · ↓ Anheben · Q/E Luftbremse links/rechts · Strg beide · Shift Boost · R Reparatur · C Ansicht.
Triebwerke: Lenken = vertikale Federbewegung ohne Neigung; Neigung nur synchron per ↑/↓. Rauch: rauschgeformte, oben aufgehellte Wölkchen (GPU).

## Fahrgefühl / Lesbarkeit (Session 8)
| Element | Wert |
|---|---|
| Visual-Roll | max ± 0,42 rad, Body-Lift hält ≥ 0,45 m Bodenfreiheit |
| Triebwerke | Feder je Triebwerk, ± 0,55 m beim Lenken, Overshoot sichtbar |
| Hindernisse | −45 %, Warnring (Barrier-Farbe) + Amber-Bake |
| Staub | 4–7 m, Deckkraft 0,15, ≈ 1 s |

## Landschaft (Session 12)
| Element | Regel |
|---|---|
| Baum-Impostors | gekreuzte Silhouetten-Ebenen, ab ≈ 1250 m eingeblendet, Nebel, keine Schatten |
| Wasserfall | Band über die Steilkante, Schaumstreifen, Becken + Gischt (steam) |
| Wand-Kaskade | folgt der gestuften Schluchtwand bis zum Fahrbahnrand, Ablaufgitter + Schaum (Dschungel-Welten) |
| Lavafall | fließende Krusten auf glühender Lava, Glutbecken, dunkler Rauch |
| Eisfall | statisch, glänzend blau-weiß, Eisbecken |
| Straße (`road`) | feine Körnung, flache Kiesel, Spurrinnen, keine Grübchen |

## Streckenprofil (Session 16)
| Element | Regel |
|---|---|
| Steigungen | Hügelfeld (520 m + 230 m), steilste Stelle 5–11 % je Strecke, Kuppen/Senken über ≈ 40 m gerundet |
| Eben gehalten | Startaufstellung, Sprint-Start/-Ziel, Rampen + Lücken + Landezonen |
| Schrägkurven | Überhöhung ∝ Krümmung, max. 0,34 Neigung bzw. 7 m Randhöhe, Ein-/Ausleitung ≈ 90 m |
| Ohne Überhöhung | Start, Rampen/Lücken, Schwerelos-Röhren, Abzweigungen |
| Fahrphysik | bergauf langsamer / bergab schneller (9 % ≈ ±2,4 m/s²); in der Schrägkurve bis +50 % Einlenken; Pod liegt parallel zur Fahrbahn |

## Tierverhalten und Nässe (Session 15)
| Element | Verhalten |
|---|---|
| Herden | grasen auf Kreisbahn; Spieler < 120 m → Galopp weg von der Bedrohung, Formation spreizt sich, beruhigen sich in ≈ 3 s |
| Vögel | kreisen 22–52 s, landen auf dem nächsten Felsbrocken, sitzen 14–30 s; Spieler < 110 m → sofortiger Abflug |
| Bahnen | Herden, Riesen, Gleiter, Sandkriecher halten ≥ 20 m Abstand zu Landmarken, Felsnadeln, Tafelbergen und Fällen |
| Nasse Fahrbahn | unter Wand-Kaskaden: dunkler, spiegelnd, dünner fließender Film |
| Linsentropfen | nach Durchfahrt durch eine Kaskade, klein und lichtbrechend, weg nach 3 s |
| Gelände-Detail | feine Bodenstruktur < 70 m; Ando Prime: lange Windverwehungen |
| Büsche | jenseits ihrer Sichtweite als getönte Billboards |

## Fall-Ambiente (Session 14)
| Fall | Sound | Partikel |
|---|---|---|
| Wasser / Wand-Kaskade | Rauschen, Bandpass 520–1420 Hz, bis 170 m | Nebel am Fuß; Spritzer beim Durchfahren |
| Lava | tiefes Grollen (Tiefpass 150 Hz) | aufsteigende Glutfunken |
| Eis | Rauschen (leise Umgebung) | keine |

## Render-Budget (Session 7)
| Element | Regel |
|---|---|
| Deko | 500-m-Zellen, Sicht 1400 m × Sichtweite, Schatten bis 240 m, Low-Poly-LOD ab 350 m |
| Bewuchs | 260-m-Zellen, Sichtweite je Typ |
| Pods | voll < 30 m, gebackener Proxy ≥ 30 m (2 Draws), Schatten < 110 m |
| Schatten | Ultra: 3 Kaskaden (CSM) bis 800 m × Sichtweite, ≤ 2048² je Kaskade; sonst 1 Karte ±130 m |
| GTAO | halbe Auflösung + Denoise, Radius 1,6 m, aus ab 220 m, Stärke 0,8 |
| Glanz | Specular-AA überall (kein Flimmern auf Pfützen/Eis/Chrom) |

## Deko-Geometrie (Session 6)
| Objekt | Form | Detail |
|---|---|---|
| Felsen | facettierter Block, flache Basis | Risse, Box-UV, AO unten |
| Hoodoo | Kegelstumpf, Hals, überstehender Deckstein | Schichtleisten |
| Tafelberg | 4 Terrassen, Schuttfuß | helle Simse |
| Dschungelbaum | Brettwurzeln, gekrümmter Stamm, 5–6 Äste, Blattballen | Lianen, Rinden-/Blattmap |
| Nadelbaum | 5–9 hängende, zerfranste Etagen | AO innen dunkel; Ando Prime: Schnee auf Oberseiten (Shader) |
| Kaktus / Kristall / Eis | Rippen + Arme / Hex-Prismen / Splitter | Vertex-AO |
| Start-/Zieltor | Türme mit Kragen + Finnen, Fachwerkträger | Lampengehäuse, Antennen |

## Strecken-Elemente, Podracer, Post-Processing
Unverändert (siehe frühere Sessions): Leitplanken + Energiefeld, Curbs, Set-Pieces, Geysire; Podracer-Farbrollen; ACES, God Rays nur aus dem Himmel, **Grain = 0**.
