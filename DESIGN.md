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

## Racer: eigene Cockpits, Innenansicht, Detailstufen (Session 20)
Leitidee: **Jeder Racer ist an seinem Cockpit erkennbar – auch als Silhouette.** Form zuerst, Kleinteile danach; kein Cockpit teilt sich mehr Wanne, Scheibe oder Heck mit einem anderen.

| Racer | Cockpit | Erkennungszeichen |
|---|---|---|
| Aurora XR-7 | schlanker Renn-Tropfen | flache Rundum-Scheibe, zwei Kopfstützen-Höcker, Canards wie die Triebwerksflügel, Kreisel-Stabilisator am Heck |
| Vrak Splitter-X | gepanzerter Kriegsschlitten | Überrollkäfig, Panzerblende mit Sehschlitz, Stoßzähne, zwei Auspuffrohre |
| Tenroc 6-Fach | lange Spindel | Glaskuppel, sechsarmiger Kabelverteiler („Spinne"), Fühler-Antennen |
| Quadra Lumber | fliegende Untertasse | volle Glaskuppel, vier Ausleger wie das Blitz-X, Lichtring am Bauch |
| Hollo Needle | Wurfpfeil | lange Nasensonde, hohe Finne, liegender Pilot unter schmaler Haube |
| Tyr Vespa | Wespen-Scooter | offener Sattelrahmen mit Lenker, gestreifter Hinterleib, Stachel |
| Beerak Fireflare | Kühler-Cockpit | Kiemen-Radiatoren an den Flanken, Kupferleitungen, Tanks und Schlote am Heck |
| Pagali Ironclad | Panzerturm | genietete Platten, Sehschlitze, aufgeklappte Luke, Stoßstangen |
| Mak Starling | Vogel | Schnabel, gepfeilte Schwingen, lange Rückenfinne, gespreizte Heck-Bremsklappen |
| Mandrel Ram | Planierraupe | V-Rammbug mit Warnstreifen und Räumgitter, Hydraulikstempel, Käfig |

- **Cockpit-Höhe:** die Gondel reitet **über der Triebwerkslinie** – Wannenboden nie unter der Achse der unteren Triebwerke, Augpunkt mindestens 0,25 m über deren Oberkante. So hängt kein Cockpit im Abgasstrahl, die Kabel laufen flach nach vorn statt steil nach oben, und der Pilot blickt über die Triebwerke hinweg auf die Strecke. Bei Vier- und Sechsfach-Pods sitzt das Cockpit auf Höhe der Lücke zwischen unterer und oberer Reihe (Blick durch die Mitte).
- **Innenansicht (Kamera „Cockpit"):** man sitzt im Pod. Die Triebwerke liegen unter dem Horizont; beim Lenken steigt das kurvenäußere Triebwerk kurz ins Bild. Unteres Bilddrittel = Armaturenbrett (Rundinstrumente mit Zeiger, Balkenanzeigen, drei Warnlampen Boost · Hitze · Schaden), darüber Scheibenrahmen bzw. Käfig, voraus Triebwerke, Kabel und Blitz. Kopf und Rumpf des Piloten sind ausgeblendet, Unterarme und Hände an den Hebeln bleiben. Der Blick auf die Strecke bleibt frei: nichts Massives auf Augenhöhe (Panzerblenden lassen einen Sehschlitz). Die freie Sicht ohne Cockpit ist die Kamera „Motorhaube".
- **Triebwerke:** Einspritzring an der Düse, Verteilerkästen mit Statuslicht, Leitbleche an den Flanken, Griffbügel, Bremsklappen-Stempel; dazu je Pod ein eigener Anbausatz (Flügel-Endkappen, Ansaugdorne, Kühlschleifen, Rammringe, Schwanzfedern …).
- **Detailstufen:** Spieler-Pod immer voll; Gegner unter „Ultra" mit leichtem Cockpit (Silhouette + einfacher Pilot) und damit leichter als vor der Überholung; auf „Ultra" (Ziel: Gaming-PC) nahe Gegner mit vollen Details. Fern-LOD zeigt die Cockpit-Grundform (Kiste, Scheibe, Finne, Käfig) und jeden Energieblitz.
- **Piloten:** Hautfarbe je Spezies, Kragenring, Schulterpolster, Brustgerät.

## Überführungen, Schleusen, verzweigte Höhlen, Blitze & Pods (Session 19)
- **Über-/Unterführungen:** Wo sich eine Strecke kreuzt (≥ 35 m Höhenabstand), trägt die obere Piste einen abgeschrägten Stahl-Hohlkasten mit Querträgern, seitlichen Leuchtstreifen, Widerlagern und Zwillingspfeilern; die untere führt durch einen 20-m-Unterführungstunnel oder frei unter dem Viadukt hindurch. Auf Karte und Minimap hebt eine dunkle Kontur die Brücke ab.
- **Futuristische Schleusen (statt Fallgitter):** 3-spurige Panzerschleuse mit Überkopf-Kammer, hydraulischen Verbund-Schotts, Plasma-Dichtnaht und dezentem Warn-Energiefeld; seitlich wachsen Fels-, Gletscher-, Kristall- oder Stations-Monolithen organisch in die Landschaft.
- **Hohe Tunnel & verzweigte Höhlen:** Luftige Querschnitte (19,5 m Standard/Unterwasser, 22,5 m Ando Prime, 20,5–38 m Höhlen). Höhlenkammern weiten sich mit modelliertem Felsboden, Leuchtadern und Stalagmiten; an Gabelungen teilt ein Felspfeiler mit Doppel-Leuchtpfeil den Weg in zwei vollwertige Röhren, die sich wieder vereinen.
- **Atmosphäre & Blitze:** Höhennebel bleibt unterhalb des Talbodens C¹-stetig dicht (keine schwebende Nebelkante am Hang). Gewitterblitze sind fein fraktal verästelt (64-Segment-Hauptkanal, 5 Hauptäste, 7 Haarzweige).
- **Podracer-Aufwertung:** 6 Lackiermuster × 3 Finishes (Klarlack, Metallic, Matt), Spezies-spezifische Pilotenköpfe/-Helme, Überrollbügel, Einlass-Statoren, Plasma-Koppler, seitengetrennt flatternde Schadensklappen und dezentes Hitzeflimmern auch hinter nahen Gegner-Düsen (weiterhin ohne aufgesetzte Nummernschilder).

## Streckenrhythmus, Vegetation, Foto-Detail (Session 18)
- **Rhythmus einer Strecke:** enge Passagen (Schlucht, Tunnel, Höhle) wechseln mit S-Kurven und zwei **weiten offenen Flächen**, auf denen das Feld auffächern kann. Tunnel sind lang genug, um als eigener Abschnitt zu wirken (≥ 260 m).
- **Höhle:** Folge von Kammern statt gleichförmiger Röhre – Decke wölbt sich in jeder Kammer hoch, dazwischen Tageslicht durch Lichtschächte; Felssäulen stehen frei in den Kammern, Stalagmiten säumen den Rand.
- **Baum (HQ):** Silhouette aus Schirmkronen bleibt; die Oberfläche besteht aus erkennbaren Zweigen mit Einzelblättern (hell- bis dunkelgrün gemischt), der Kern dahinter ist dunkel, der Stamm trägt fotografierte, leicht bemooste Rinde. Aus der Ferne wechselt der Baum auf glatte Kronenlappen gleicher Form.
- **Foto-Detail:** echte Fotos liefern Feinstruktur (Risse, Körnung, Rippel), nie die Farbe – Farbe, Schichtung und Stimmung kommen weiter aus der Palette der Welt. So bleibt roter Fels rot und Dschungelfels grün, bekommt aber echte Oberfläche.
- **Dichte:** mit der Streckenlänge wachsen Felsen, Bäume, Landmarken mit; nahe der Fahrbahn bleibt die Sicht frei.

## Tunnel-Typen, Hitze, Pendel (Session 17)
| Thema | Gestaltung |
|---|---|
| Standard-Tunnel | „unterirdisch": Röhre unter einem Erdwall (Böschung bis zum Gelände), geschlossene Portalwand, oben ein befahrbares Deck mit Fahrbahn-Belag und zwei schmalen Leuchtkanten |
| Unterwassertunnel (Aquilaris) | Stahl-Caisson, der an der Wasserlinie ins Meer abtaucht; innen Fensterbänder auf beiden Flanken zwischen Stahlrippen, Blick ins Blau mit Kaustik, Lichtstrahlen und Fischen; 9 m hoch |
| Höhle (Magma) | raue, unregelmäßige Felsröhre mit Stalaktiten und Glutadern, sparsame Lampen, zwei offene Lichtschächte; 11 m unter Gelände |
| Hitzeglühen | beginnt an der Düse, wandert mit der Hitze nach vorn; dunkelrot → orange → gelbweiß; träge (Metall); ab 86 % Funken |
| Überziehen | HUD: weißer ablaufender Balken im Hitzebalken + Text; Triebwerke gelbweiß, viele Funken |
| Energieblitz | fein: haardünner Kern, vier dünne Bögen, die getrennt wandern und flackern; Quadra Lumber: zwei Blitze als X |
| Cockpit-Pendel | sichtbar, aber nie hektisch: max. ±1,9 m seitlich, unterdämpft (schwingt 1–2-mal nach) |
| Staubfahne | zwei Fahnen unter den Triebwerken, driften nach außen, heller als der Boden, bis ~40 % Deckkraft; bei Nässe weißgraue Gischt |
| Ego-Ansicht | kein Cockpit-Rahmen, freier Blick auf Triebwerke, Leitungen und Blitz |

## Sci-Fi-Sprache, Tunnel, Schwerelosigkeit (Session 16)
Leitidee: **Technik leuchtet schmal und bewegt sich.** Futuristisch wirkt nicht die Menge an Teilen, sondern Licht in Linien, das mit der Fahrtrichtung läuft.

| Element | Gestaltung |
|---|---|
| Licht-Leitstreifen | 0,5 m breit an beiden Fahrbahnrändern, Farbe = `barrierColor`, Grundhelligkeit 55 %, Lichtpuls alle 28 m läuft mit ~42 m/s voraus |
| Holo-Tafel | 8,4 × 3,5 m, additiv, Rahmen + umschaltende Glyphen-Blöcke, Scanlines, leichtes Flackern; auf schlankem Projektormast, 20° zur Fahrbahn gedreht |
| Schwebe-Bake | kleiner Leuchtkörper mit Ring auf dünnem Stiel, paarweise alle 50 m |
| Energieleitung | Rohr Ø 1,6 m neben der Strecke, Halter zur Fahrbahnkante, Leuchtmuffen; wechselt alle ~520 m die Seite |
| Tunnel | Halbellipse über die ganze Breite, 12 m hoch, Stahlrippen alle 24 m, Deckenlampen, Leitstreifen, wuchtige Portalrahmen; folgt der Kurvenüberhöhung |
| Düsenklappen | 8–12 Lamellen am Triebwerksausgang, klappen beim Boost nach außen, Spitzen glühen orange |
| Schwerelosigkeit | nichts hält den Pod: langsames Taumeln, Triebwerke wippen einzeln, weiteres Sichtfeld, Sternenstaub; Tempo spürbar höher |
| Malastare | Metall-Renndeck mit Lichtlinien statt Schotter – Industrie-/Raffineriewelt |
| Unwetter | Sicht darf deutlich einbrechen, aber Leitstreifen, Baken und Barrieren bleiben als Orientierung sichtbar |

- **Keine Schilder am Pod** (Startnummern wirkten aufgesetzt): Identität über Lackierung und Triebwerksglühen.
- **Start:** Feld bleibt die ersten Sekunden in Formation und fächert erst dann auf.

## Einheitliche Oberfläche, Drift, Staub, Spiegelungen (Session 15)
- **Eine Schriftgröße überall:** virtuelle Leinwand 1180 × 720 (bei breiteren Fenstern breiter), ein Skalierungsfaktor für Menü, Streckenwahl, Hangar, Einstellungen, Pause und Ergebnis. Jede Ansicht füllt die Leinwand: Kopfzeile (Titel links, Aktionen rechts), darunter drei Spalten mit Panels; die mittlere Spalte ist die Bühne (Karte, Pod-Vorschau) und nimmt den Restplatz.
- **Kompakte Bausteine:** Panel-Innenabstand 16 px, Regler 2-zeilig (Beschriftung + Wert, darunter Schieber), Schalter einzeilig, Listenzeilen einzeilig mit Farbstreifen.
- **Drift:** der Pod darf weit quer stehen (bis ~50°), bleibt aber abfangbar; Staub-/Gischtfahne und seitliche Staubwolke machen den Drift sichtbar.
- **Staubfahne:** flach und bodennah, in Bodenfarbe, wird nach hinten breiter und blasser (Deckkraft ≤ 0,13); nie höher als die Triebwerke. Bei Nässe weißgraue Gischt stattdessen.
- **Startnummer:** helle quadratische Tafel mit dunkler Zahl auf kurzem Mast hinter dem Cockpit, von hinten und vorn lesbar, leicht selbstleuchtend.
- **Boost:** Triebwerksklappen klappen ~30° auf, Nachbrenner-Kern, Hitzebalken steigt.
- **Spiegelungen:** Pfützen und nasse Fahrbahn spiegeln Lichter, Pods und Umgebung (Screen Space), Himmel über die Umgebungsbeleuchtung; trockene raue Flächen spiegeln nicht.
- **Trümmer:** immer deckend und kantig; verschwinden durch Schrumpfen, nie durch Transparenz.

## Bedienoberfläche & Rückmeldungen (Session 14)
Leitidee: **Alles auf einen Blick, in jedem Fenster.** Kein Scrollen, keine abgeschnittenen Elemente; lieber Reiter und kompakte Zeilen als lange Seiten.

| Thema | Regel |
|---|---|
| Layout | Inhalt wird als Ganzes skaliert (0,3× bis 2×) und zentriert; drei Spalten ab ~1024 px virtueller Breite, Hochformat zweispaltig |
| Streckenliste | eine Zeile je Strecke: Farbstreifen (Cyan = Rundkurs, Rosa = Sprint), Name, Planet · Typ klein darunter, Schwierigkeits-Rauten rechts |
| Filter | Typ als Schaltflächen, Planet als Auswahlfeld (eine Zeile statt Chip-Wolke) |
| Einstellungen | Reiter „Grafik & Ton" / „Steuerung"; im Pausemenü dieselben Grafik-Panels, mit Hinweis was sofort wirkt |
| Boost-Balken | unter dem Tacho; Cyan → Amber → Rot, Gefahrenzone schraffiert ab 80 %, „MAX" rechts, nach Überhitzung weiße Marke „BEREIT" bei 55 % |
| Schadensanzeige | linke Box = im Bild linkes Triebwerk, rechte Box = rechtes |
| Energiekopplung | weißer Kern + zwei wandernde Gabel-Bögen + Flackern; deutlich heller als die Triebwerksflamme, aber schmal |
| Zerstörbares | nur Kleines (Kisten, Felsen bis ~2,9 m): Trümmerwolke in Bodenfarbe, Funken, dumpfer Schlag; Großes bleibt hart |
| Trümmer | zerbröseln langsam (schrumpfen + sinken über ~3 s), nie plötzliches Verschwinden; eine Schikane bleibt |
| Banner | Unterkante ≥ 16 m über der Fahrbahn; Traversen sind massiv |

## Umwelt-Verläufe, Regen, Gewitter, Licht (Session 13)
Leitidee: **Jede Welt hat ihr eigenes Klima, und es lebt.** Wetter und Tageszeit ändern sich langsam (rund eine Minute je Übergang), werden einmal angesagt und bleiben fair.

| Thema | Regel |
|---|---|
| Klima | Wüste: Sand statt Wasser. Eis: Schnee und Eisnebel. Vulkan: Smog und Asche mit trockenen Blitzen. Nur feuchte Welten kennen Regen und Gewitter. |
| Sonnenbahn | Aufgang 40° vor, Untergang 70° nach dem Mittags-Azimut der Welt; der Mond steht gegenüber. Beim Wechsel wird das Licht kurz dunkel statt über den Himmel zu wandern. |
| Regenstreifen | Länge und Richtung folgen der Relativgeschwindigkeit: im Stand fast senkrecht, in Fahrt vom Fluchtpunkt nach außen. Breite ~3 cm, Deckkraft ≤ 0,6. |
| Linsentropfen | langsam: laufen herab; schnell: werden nach außen gedrückt, Spuren werden länger, Perlen werden weniger. Nie größer als 2,5 % der Bildhöhe. |
| Gischt / Spritzer | Gischt weißgrau, hinter dem Pod, wächst mit Tempo; für Gegner unter 24 m aus (Sicht). Spritzer: winzige Kronen, 0,15 s. |
| Blitz | weißer Kern, sechsmal so breites weiches Glühen, 3 Äste, 2–4 Folgeblitze in 0,3 s. Erhellt Wolken und Umgebungslicht, kein Vollbild-Weiß. |
| Donner | Knall nur bei nahen Einschlägen, sonst Schlag + Grollen; Verzögerung = Entfernung / 343 m/s (max. 3 s). |
| Lichtkegel | 30 m lang, kühles Weiß, Deckkraft ≤ 0,15, zur Kante weich auslaufend; blendet mit der Dunkelheit ein. |
| Hitzeflimmern | nur direkt hinter den Düsen, Versatz < 0,15 % der Bildbreite, in Fahrt auf ein Drittel reduziert. |
| Nässe | Straße wird in ~12 s nass, trocknet in ~50 s; Pfützen spiegeln, Staub wird zu Gischt. |

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
