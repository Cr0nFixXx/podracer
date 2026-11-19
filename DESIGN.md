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

## HUD-Fluglage, Nachtlichter, Wetterverlauf (Session 12)
- **Fluglage-Anzeige:** runder Künstlicher-Horizont-Stil in HUD-Cyan, unten links neben der Triebwerksanzeige. Pod-Symbol = zwei Triebwerkskreise + Cockpitpunkt; dreht mit der Rolle (gelb ab 45°), verschiebt sich mit Anheben/Neigen; grüner Pfeil oben = Anheben, roter unten = Neigen. Slide-Balken cyan → gelb, sobald der Exit-Schub bereitsteht. Ein Statuswort in Versalien darunter.
- **Wetterzeile:** klein, rechtsbündig unter der Karte, nur Text („Nacht · Gewitter") – kein Symbol-Zoo.
- **Nachtlichter:** kleine, helle Punkte statt großer Glows: weißblaue Scheinwerfer an den Triebwerksnasen, links rot / rechts grün an den Flügelspitzen (Luftfahrt-Konvention), kurzes weißes Blitzlicht am Cockpit. Nur der Spieler wirft echtes Licht (kühles Weiß, weicher Kegel auf die Fahrbahn).
- **Wetterverlauf:** Übergänge dauern rund eine Minute und werden einmal angesagt („GEWITTER ZIEHT AUF"); nie abrupte Sprünge in Sicht oder Haftung.
- **Hitzeflimmern:** nur unmittelbar hinter den Düsen, Versatz < 0,35 % der Bildbreite – flirrt, verzerrt aber weder Gegner noch Strecke.
- **Steuerungs-Menü:** jede Aktion ist eine Kachel (Taste links in Amber, Bezeichnung rechts); aktive Eingabe = Amber-Rahmen, fehlende Belegung = roter Rahmen.

## Atmosphäre: Licht, Wetter, Klang (Session 11)
Leitidee: **Wetter verändert die Lesbarkeit, nie die Fairness.** Sicht wird weicher und stimmungsvoller, aber Fahrbahnkante, Hindernis-Baken und Vordermann bleiben immer erkennbar.

| Ebene | Regel |
|---|---|
| Tageszeit | verschiebt Sonnenstand, Himmels-/Nebel-/Hemisphärenfarben; Nacht = Mondlicht (bläulich, Intensität 1,15), nie schwarz |
| Wetter | entsättigt den Himmel helligkeitsgleich (Regen/Sturm/Schnee) oder färbt ihn zur Bodenfarbe (Staub); Nebel verdichtet nur den Höhennebel |
| Nebel | Höhennebel liegt in Senken, dünnt nach oben aus, zieht in Bänken; Richtung Sonne heller (Vorwärtsstreuung) |
| Blendung | weicher Schleier + Kern + schmaler Streifen + 4 kleine Ghosts; Zusatzhelligkeit < 0,85, kein Bloom-Aufdrehen |
| Regen | dünne schräge Streifen, Tropfen auf der Linse klein (≤ 2,5 % Bildhöhe) und kurzlebig, Gischt statt Staub |
| Gewitter | Blitz ≤ 1,2 s, erhellt Wolken und Umgebungslicht – kein Vollbild-Weiß; Donner 0,2–3,2 s später |
| Böen | große, sehr transparente Schwaden (Alpha ≤ 0,11), nah an der Kamera ausgeblendet |
| Klang | Schichten statt Lautstärke: Sub + Sägezahn + Whine + Rauschen; Echo nur zwischen Wänden; Kompressor auf dem Master |
| Mechanik | dunkles Metall, schmale Leuchtstreifen in `barrierColor`, sichtbare Bewegung (gegenläufige Ringe, Rotoren) |

## Flugsteuerung & Streckenprofil (Session 10)
Leitidee: **Lenken hebt, Tasten neigen.** Der Pod kippt nie von selbst – jede Schräglage ist entweder die Straße (Überhöhung, Steigung) oder eine bewusste Eingabe.

| Manöver | Eingabe | Wirkung | Preis |
|---|---|---|---|
| Triebwerkshub | Lenken | äußeres Triebwerk +1,1 m, inneres −0,22 m, keine Kippung | – |
| Slide | Leertaste + Lenken | Haftung ×0,24, Gierrate ×1,16, Exit-Schub bis +7 m/s | Bremswirkung ×0,42 statt voller Luftbremse |
| Anheben | `↓` | +1,6 m Schwebehöhe, Sprung ≈ 2× weiter | −20 % Haftung, ~10 %/s Tempo in der Luft |
| Neigen | `↑` | −0,45 m, +14 % Haftung, Landung in halber Zeit | weniger Bodenfreiheit |
| Rolle 90° | `←` / `→` | Breite bis 22 %, passt durch enge Lücken | Lenkung −40 %, fliegt höher |

- **Schrägkurven:** Überhöhung proportional zur Krümmung, bis ≈ 21° bzw. 6,2 m Außenkante; der Pod legt sich mit der Straße, nicht durch Lenken. Überhöhung = mehr Haftung, also schnellere Kurven.
- **Steigungen:** zwei lange Wellen je Strecke (±15 m, ±6,5 m). Kuppen lassen Pods abheben – dort entscheiden Anheben/Neigen. Start, Ziel, Rampen, Lücken, Zero-G-Röhren und Über-/Unterführungen bleiben wie entworfen.
- **Kamera:** rollt nur 20 % der Pod-Rolle mit (Horizont bleibt lesbar, 90°-Rolle ≈ 18° Kamerarolle).
- **Leistung ohne Bildverlust:** Partikel-Flugbahnen rechnet die GPU; ferne Bäume/Felsnadeln nutzen gleichförmige LOD-Zwillinge; Kaskaden-Schatten sind eine Option, kein Standard.

## Landschafts-Assets (`decorGeo`, Session 9)
Leitidee: **Silhouette vor Textur** – jede Form muss aus 300 m als Gestein, Baum oder Bauwerk lesbar sein; keine glatten Drehkörper, keine Kugel-Blobs.

| Asset | Formregeln | Varianten |
|---|---|---|
| Felsbrocken | Rauschkörper, von 9 Spaltebenen gekappt (plane Bruchflächen), flache Standfläche, flat-shaded | 3 |
| Felsnadel (Hoodoo) | 8–11 Schichten, harte Lagen kragen aus, weiche weichen zurück; Erosionsrillen; Schuttfuß; Deckstein; leichte Neigung | 3 |
| Tafelberg | Schutthalde → Klippe mit Rinnen → Bank → Klippe → Plateau; gelappter Grundriss | 2 |
| Urwaldriese | 5–6 Brettwurzeln, gebogener Stamm, 4 Astgabeln, 6–10 flache Kronenlappen + Büschel, Lianen; unten dunkel, oben sonnig gelbgrün | 2 |
| Schneekiefer | 4–6 sternförmige, hängende Astetagen; Schnee nur auf Oberseiten | 1 (Höhe variiert) |
| Eis / Kristall | 5–8 sechseckige Prismen mit exzentrischer Spitze, Bruchstücke am Fuß, flat-shaded, leicht emissiv | 2 |
| Saguaro | 8 Rippen, runde Kuppe, 2–3 aufgebogene Arme | 2 |

- **Fels-Textur:** horizontale Sedimentbänder dominieren; Klüfte sind verzerrt und nur lokal offen; Feinschichtung + Tafoni-Löcher. Kein regelmäßiges Blockraster.
- **Startportal:** Fachwerk statt Vollbalken, Türme kanneliert mit Kragenringen, Akzentfarbe = `barrierColor` nur als schmale Linien.
- **Stadt:** Rücksprung-Hochhäuser (Art-Déco), Eckrippen, auskragende Decks; Fenstertextur bleibt einzige Lichtquelle (kein zusätzliches Bloom).

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
