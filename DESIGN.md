# DESIGN.md – Design Schema

## Look & feel
Episode-I-Racer: sonnenverbrannt, mechanisch, abgenutzt – **weit, plastisch und belebt**. Offene Landschaften mit dreistufigen Horizont-Silhouetten, gestufte Schluchten mit Wasser-/Lavafällen und Hängekabeln, reagierende Tierwelt. **Kein Filmkorn, kein überstrahlender Bloom.**

## UI
Schwarz/Dunkelbraun, Glas-Panels, Amber-Akzent (`#ffb040`), Orbitron + Rajdhani, abgeschrägte Ecken. HUD `FPS · WebGPU/WebGL2` + gecachte Offscreen-Minimap.

## Podracer-Dynamik, Sicht & Hindernis-Lesbarkeit
- **Aktive Triebwerks-Aufhängung:** Repulsor-Schwebehöhe 2,85 m + 5-Punkt-Bodenkollision (mind. 0,68 m Abstand über Straßenwölbung, Curbs und Rampen). Beim Lenken und Luftbremsen steigt das kurvenäußere Triebwerk dynamisch auf (~1 m, Nase leicht hoch), das innere taucht in den Scheitelpunkt (~0,5 m) – Energie-Binder und Steuerseile folgen live.
- **Freie Sicht & klare Hindernisse:** Keine grauen Rauchschwaden aus intakten Düsen; Bodenstaub bleibt flach und transparent (im Windschatten < 24 m ausgeblendet). Streckenhindernisse (~7–8 je Strecke, ≥ 52 m Abstand) tragen leuchtende Boden-Warnringe, gelb-schwarze Warnflächen und hohe orange-rote Warnbaken.

## Post-Processing & Grafik-Stabilität (`post`, `materials`, `terrainMaterial`, `trackMesh`)
- **Symmetrisches Depth-AO:** 4-Paar-Konkavitäts-AO via `textureLoad` (Ebenen = exakt 1,0 ohne Streifen, keine Halos an Silhouetten/Gras, 0 MRT, immun gegen Partikel/Flammen, Distanz-Fade 32–95 m).
- **Reflexionen & Geometrie:** Räumlich gemergte 580-m-Kacheln (kein `BatchedMesh`), 128×-vorskaliertes TBN mit Silhouetten-Schutz, singularitätsfreie Welt-Normalen auf Terrain/Wasser/Lava, rissfreie Straßen-/Klippennähte, weiche PMREM-Sonne, Distanz-Specular-AA, optionales uniform-flow SSR.
- **Bloom, God Rays, Speed-Blur & Warmup:** HDR-Clamp `[0, 12]`, Half-Res-Bloom (`threshold = 2.1`), 14-Tap-`textureLoad`-Sonnenstrahlen, 5-Tap-Speedblur, **Grain = 0**, komplettes GPU-Pipeline-Warmup vor dem Countdown.

## Gelände-Schichten & Detail-Normalmaps (`terrainMaterial`, `textures`)
| Schicht / Kanal | Kachel | Wo | Quelle |
|---|---|---|---|
| Boden (Sand/Schnee/Dschungel/Basalt) | 30 m | überall | Basis (`map.a` = Höhe, `normalMap.a` = Rauheit) |
| Kies / Wadi-Geröll | 7,2 m | Bankette 2,5–15 m, Wadis, Hangfüße, Flecken | `aSplat.x` + Höhe |
| Becken | 17,5 m | flache Senken ≥ 30 m (Salzpfanne, Eissee, Sumpf, Lavakruste) | `aSplat.y`, nur flach |
| Fels (4-Band-Schichtung + Absätze) | 25 m | Hänge > ~19 %; flache Simse tragen Schnee/Moos/Sand | Neigung + Höhe |
| Kamm- & Uferzone | Welt | gebleichte Dünenkämme/Schneegrate (`aSplat.z`), nasser Strand + Schaum / Lavaglut an `waterY` | `aSplat.z`, `waterY` |
| Weltspezifische Detail-Normalmap | 9,5 m & 1,75 m | Mittel- (≤ 240 m) & Nahbereich (≤ 56 m) | `detailNormalTexture(kind)` |
| Wolkenschatten | 520 / 1500 m | überall (auch Wasser, Straße, Klippen) | `theme.clouds × 0.45` |

| Welt | Detail-Map | Besonderheiten Gelände / Wasser |
|---|---|---|
| Tatooine / Mesa | `dunes` (asymmetrische Windrippel + Quarz) | Barchan-Dünen, Kies-Wadis, Salzpfannen mit Wulsträndern, Stufen-Mesas |
| Ando Prime | `sastrugi` (Windrillen + Eiskristalle) | Gletschergrate, gefrorene Seen, Schneeauflage auf dunklen Felsabsätzen, Schmelzkaskaden |
| Dschungel | `humus` (Wurzelgeflecht + Lehm) | Karsthügel, Flussarme, moosige Schluchtsimse, Schlucht-Wasserfälle mit Gischtbecken |
| Malastare | `humus` | glänzende Methan-Sümpfe, olivgrüne Hügel, Sinterkrater-Geysire |
| Vulkanwelt | `lava` (Pahoehoe-Stricke + Schlackeporen) | Basaltsäulen, Lavakrusten, treibendes Magmameer, glühende Schlucht-Lavafälle |
| Kristall / Aquilaris | `crystal` / `beach` | Kristall-Spaltstufen / Atoll-Inseln, Felsnadeln, Uferschaum, Küsten-Wasserfälle |

## Strecken-Architektur & Set-Pieces
- **Fahrbahn & Schluchten:** Doppel-Turbinenspuren, Teerfugen/Spurrillen/Gletscherrisse, Themen-Curbs, 11-stufige Schluchtwände mit Felspfeilern, Hängekabel mit Baken, Doppelpfeiler-Viadukte mit Hammerkopf-Trägern, Stahl-Widerlager an Abgründen, Tunnel-Stützrippen, Oovo-Schottringe, Boonta-Startportal mit Rennleitung & überdachten Tribünen, Reparaturbuchten mit animierten Chevrons & Tesla-Spulen.
- **Leitplanken-Energiefeld:** H-Träger-Pfosten mit Außenstreben, Doppelplanken, darüber dezente TSL-Plasmafläche mit Scanlines und bis zu 4 gleichzeitigen Schockwellen-Ringen bei Wand-/Feldkontakt.
- **6 Set-Piece-Typen:** `rotor` (Drehbalken), `gate` (3er-Fallgitter), `arch` (Einsturz-Felsbogen), `icefall` (berstende Gletscher-Eisbrücke), `boulder` (springende Felsbrocken aus Schluchtrinne), `bridge` (gegenläufige Schwenkbrücken-Ausleger).

## Bewuchs (`groundCover`) & Leben (`wildlife`)
- **Bewuchs:** 25 Typen (inkl. Agaven, bemooste Baumstämme, 9-wedelige Farne, 6-blütige Blumen); 150-m-Zellen; Büsche/Sträucher wechseln ab ~165 m per Dither-Crossfade auf 6-Dreieck-Impostors bis 540 m.
- **Leben:** alle Kreisbahnen meiden Landmarken; Bantha-Herden fliehen bei Pods < 125 m; ufer-/streckennahe Vogelschwärme sitzen auf Felsen und starten aufgeschreckt; Langhals-Riesen, Sandkriecher (mit beleuchteter Brücke), 3-Düsen-Gleiter, Lastkähne, Himmels-/Patrouillenverkehr.

## Welt- & Gefahren-Audio (`audio`)
| Quelle | Klang | Auslöser |
|---|---|---|
| Geysire, Wasser-/Lavafälle | gefiltertes Dampf-/Magma-/Wasserrauschen | Distanz < 130–135 m |
| Rotoren & Schwenkbrücken | pulsierendes Blatt-Wummern (`arms × speed`) | Distanz < 145 m |
| Fallgitter & Felsen | metallischer Tor-Schlag / dumpfer Felsaufprall | Aufschlag < 140–165 m |
| Energiefeld | kurze Plasma-Entladung | Feldkontakt |
| Vögel, Herden, Sandkriecher | Biom-Vogelruf, tiefes Herden-Röhren, Ketten-Grollen | Vorbeifahrt an Schwarm/Herde/Crawler |
