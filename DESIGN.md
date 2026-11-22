# DESIGN.md – Design Schema

Nach Thema geordnet. Hinter jedem Punkt steht die Sitzung, aus der er stammt (`S20 Pods`, `S19` … `≤ S9` = die ältesten). **Widersprechen sich zwei Punkte, gilt der jüngere.** Regeln für den Code stehen in `docs/regeln/`.

## 1. Leitbild
Episode-I-Racer: sonnenverbrannt, mechanisch, abgenutzt – **weit, plastisch und belebt**. Offene Landschaften mit dreistufigen Horizont-Silhouetten, gestufte Schluchten mit Wasser-/Lavafällen und Hängekabeln, reagierende Tierwelt. **Kein Filmkorn, kein überstrahlender Bloom.** *(≤ S9)*

## 2. Bedienoberfläche & HUD
Leitidee: **Alles auf einen Blick, in jedem Fenster.** Kein Scrollen, keine abgeschnittenen Elemente; lieber Reiter und kompakte Zeilen als lange Seiten. *(S14)*

Schwarz/Dunkelbraun, Glas-Panels, Amber-Akzent (`#ffb040`), Orbitron + Rajdhani, abgeschrägte Ecken. HUD `FPS · WebGPU/WebGL2` + gecachte Offscreen-Minimap. *(≤ S9)*

| Thema | Regel | Stand |
|---|---|---|
| Layout | Inhalt wird als Ganzes skaliert (0,3× bis 2×) und zentriert; drei Spalten ab ~1024 px virtueller Breite, Hochformat zweispaltig | S14 |
| Streckenliste | eine Zeile je Strecke: Farbstreifen (Cyan = Rundkurs, Rosa = Sprint), Name, Planet · Typ klein darunter, Schwierigkeits-Rauten rechts | S14 |
| Filter | Typ als Schaltflächen, Planet als Auswahlfeld (eine Zeile statt Chip-Wolke) | S14 |
| Einstellungen | Reiter „Grafik & Ton" / „Steuerung"; im Pausemenü dieselben Grafik-Panels, mit Hinweis was sofort wirkt | S14 |
| Boost-Balken | unter dem Tacho; Cyan → Amber → Rot, Gefahrenzone schraffiert ab 80 %, „MAX" rechts, nach Überhitzung weiße Marke „BEREIT" bei 55 % | S14 |
| Schadensanzeige | linke Box = im Bild linkes Triebwerk, rechte Box = rechtes | S14 |
| Überziehen | HUD: weißer ablaufender Balken im Hitzebalken + Text; Triebwerke gelbweiß, viele Funken | S17 |

- **Eine Schriftgröße überall:** virtuelle Leinwand 1180 × 720 (bei breiteren Fenstern breiter), ein Skalierungsfaktor für Menü, Streckenwahl, Hangar, Einstellungen, Pause und Ergebnis. Jede Ansicht füllt die Leinwand: Kopfzeile (Titel links, Aktionen rechts), darunter drei Spalten mit Panels; die mittlere Spalte ist die Bühne (Karte, Pod-Vorschau) und nimmt den Restplatz. *(S15)*
- **Kompakte Bausteine:** Panel-Innenabstand 16 px, Regler 2-zeilig (Beschriftung + Wert, darunter Schieber), Schalter einzeilig, Listenzeilen einzeilig mit Farbstreifen. *(S15)*
- **Fluglage-Anzeige:** runder Künstlicher-Horizont-Stil in HUD-Cyan, unten links neben der Triebwerksanzeige. Pod-Symbol = zwei Triebwerkskreise + Cockpitpunkt; dreht mit der Rolle (gelb ab 45°), verschiebt sich mit Anheben/Neigen; grüner Pfeil oben = Anheben, roter unten = Neigen. Slide-Balken cyan → gelb, sobald der Exit-Schub bereitsteht. Ein Statuswort in Versalien darunter. *(S12)*
- **Wetterzeile:** klein, rechtsbündig unter der Karte, nur Text („Nacht · Gewitter") – kein Symbol-Zoo. *(S12)*
- **Steuerungs-Menü:** jede Aktion ist eine Kachel (Taste links in Amber, Bezeichnung rechts); aktive Eingabe = Amber-Rahmen, fehlende Belegung = roter Rahmen. *(S12)*

## 3. Racer (Pods)
### Cockpits, Triebwerke, Teile, Schaden (S20 Pods)

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

**Die vier neuen Racer (Phase 3)** – jeder hat eine Triebwerksform, die es vorher nicht gab, und wiederholt sie im Cockpit:

| Racer | Triebwerke | Cockpit | Farben |
|---|---|---|---|
| Tarn Cyclone | kurzer, dicker Rumpf mit offenem 5-Blatt-Rotor in einem Schutzring (Lichtband, Warnstreifen), Auspuffstutzen wie ein Sternmotor | robuste Wanne mit Überrollbügel und Rundumleuchte, Doppel-Leitwerksträger, Kufen | Sand, Oliv, Bernstein |
| Lyss Halo-9 | schlanker Kern in einem großen Ringflügel mit Lichtbändern; Blitz springt von Ring zu Ring | Glastropfen in einem flachen Ring mit Lichtband, Chrombogen darüber | Eisweiß, Nachtblau, Türkis |
| Dorn Manta | flache Platte: Briefschlitz-Einlass mit Stauturbine, Schlitzdüse mit flacher Flamme, Rückenwulst, Doppelleitwerk, abgesenkte Flügelspitzen | flacher Pfeilschlitten, liegender Pilot, Deltaflächen, Doppelleitwerk | Schwarz, Gold, Glutrot |
| Quill Voltspire | Reaktor-Triebwerk: geschlossene Verkleidungen vorn und hinten (Kühlrippen, Kondensatorkästen), dazwischen ein dicht vergittertes Fenster auf die Plasmaspule mit drehendem Käfigläufer; Kastenholme, Kabelstränge, drei Elektroden je Flanke | Reaktorkugel: unten geschlossene Schale, oben Glaskugel im Reifenkäfig mit beplanktem Rücken, Gerätepaket hinter dem Sitz, Konsole am Stiel, hoher Entladungsmast | Indigo, Silber, Violett |

- **Erkennbarkeit aus der Ferne:** das Fern-Modell zeigt die Sonderform (Ring um Rotor- und Ringflügel-Triebwerke, flache Kiste beim Manta, Ring ums Halo-Cockpit).
- **Sichtachsen:** kein Bauteil in der Blickmitte der Cockpit-Kamera – die Käfigkugel hat ihre vorderen Reifen links und rechts wie A-Säulen; die drei Bögen der Voltspire liegen mindestens 2,5 m hinter der Triebwerksfront (freie Sicht von der Motorhaube).
- **Grenzen neuer Pods:** tiefster Punkt höchstens 1,9 m unter dem Pod-Ursprung, halbe Breite höchstens 4,6 m, Ringe höchstens 1,85 m Radius.
- **Cockpit-Höhe:** die Gondel reitet **über der Triebwerkslinie** – Wannenboden nie unter der Achse der unteren Triebwerke, Augpunkt mindestens 0,25 m über deren Oberkante. So hängt kein Cockpit im Abgasstrahl, die Kabel laufen flach nach vorn statt steil nach oben, und der Pilot blickt über die Triebwerke hinweg auf die Strecke. Bei Vier- und Sechsfach-Pods sitzt das Cockpit auf Höhe der Lücke zwischen unterer und oberer Reihe (Blick durch die Mitte).
- **Innenansicht (Kamera „Cockpit"):** man sitzt im Pod. Die Triebwerke liegen unter dem Horizont; beim Lenken steigt das kurvenäußere Triebwerk kurz ins Bild. Unteres Bilddrittel = Armaturenbrett (Rundinstrumente mit Zeiger, Balkenanzeigen, drei Warnlampen Boost · Hitze · Schaden), darüber Scheibenrahmen bzw. Käfig, voraus Triebwerke, Kabel und Blitz. Kopf und Rumpf des Piloten sind ausgeblendet, Unterarme und Hände an den Hebeln bleiben. Der Blick auf die Strecke bleibt frei: nichts Massives auf Augenhöhe (Panzerblenden lassen einen Sehschlitz). Die freie Sicht ohne Cockpit ist die Kamera „Motorhaube".
- **Triebwerke:** Einspritzring an der Düse, Verteilerkästen mit Statuslicht, Leitbleche an den Flanken, Griffbügel, Bremsklappen-Stempel; dazu je Pod ein eigener Anbausatz (Flügel-Endkappen, Ansaugdorne, Kühlschleifen, Rammringe, Schwanzfedern …).
- **Detailstufen:** Spieler-Pod immer voll; Gegner unter „Ultra" mit leichtem Cockpit (Silhouette + einfacher Pilot) und damit leichter als vor der Überholung; auf „Ultra" (Ziel: Gaming-PC) nahe Gegner mit vollen Details. Fern-LOD zeigt die Cockpit-Grundform (Kiste, Scheibe, Finne, Käfig) und jeden Energieblitz.
- **Piloten:** Hautfarbe je Spezies, Kragenring, Schulterpolster, Brustgerät.

**Tuning, das man sieht (Phase 4)** – Leitidee: **Man liest einem Pod an, was sein Besitzer getunt hat.** Jede Tuning-Größe hat ihren festen Platz am Triebwerk, damit sich die Teile nie in die Quere kommen und ein Blick genügt:

| Tuning-Wert | Platz am Triebwerk | kleines Teil (Stufe 2–3) | großes Teil (Stufe 4–5) |
|---|---|---|---|
| Höchstgeschw. | Düse | Düsenkragen mit Kupferring | Nachbrennerring mit Kühlrippen und zweitem Glühring |
| Beschleunigung | Einlasslippe | vier Stauhutzen | + zwei Kompressorhutzen mit Kupferleitung |
| Kühlung | Heck des Rumpfs | Kühlrippenring | + Radiatorplatten auf den Schultern mit Kühlmittelleitung |
| Wendigkeit | hinter dem Einlass / Düse | zwei Canards | + vier Steuerflächen mit Stellstangen |
| Traktion | Bauch | langer Repulsor-Streifen mit Kufen | + vier Ausleger-Pads |
| Luftbremse | Bremsklappen | Klappen 25 % größer | + zweites Klappenblatt, das weiter aufgeht |
| Reparatur | Flanken / Kabelpylon | aufgenietete Panzer-Doppler | + Reparatureinheit mit Gelenkarm und Statuslicht |

- **Farbe sagt, was es ist:** Tuning-Teile sind Technik (Stahl, Kupfer, dunkles Metall, Leuchtbänder). Flächen, die zum Pod gehören sollen – Canards, Steuerflächen, Panzer-Doppler und alle Finnen –, tragen die **Sekundärfarbe** der Lackierung.
- **Style-Teile** (frei, nur Aussehen) verändern die Silhouette an vier Stellen: **Finnen** (Haifinne · Doppel-Leitwerk · Pfeilflügel), **Einlass** (Gitter · Langer Dorn · Irisblende aus acht verdrehten Lamellen), **Düse** (Lang · Schubvektor-Paddel · Zackenkrone), **Kanzel** (klar · Rauch · Bernstein · Spiegel).
- **Größe folgt dem Triebwerk:** alle Teile skalieren mit dem Rumpfradius; flache Triebwerke (Manta) bekommen flache Varianten (Leisten statt Ringe, Zahnleiste statt Krone). Nichts ragt tiefer als die Bodenklemme oder weiter als 0,55 m über die Kollisionsform.
- **Gegner** tragen ausgeloste Style-Teile, aber keine Tuning-Teile – so sieht jedes Startfeld anders aus, und der eigene Pod bleibt der am weitesten ausgebaute.

**Schaden, der zum Racer passt (Phase 5)** – Leitidee: **Ein Racer geht so kaputt, wie er gebaut ist.** Leichte Renner verlieren Flügel und Finnen (Haftung, Wendigkeit), schwere verlieren Panzerung oder Kühlung, Mehrmotorige verlieren einzelne Triebwerke, die Voltspire ihre Energiebögen.
- **Lesbar in drei Stufen:** jede Schadensanzeige hat drei Lampen (50 / 35 / 20 %). Fällt die Füllung unter eine Stufe, bricht genau ein Teil – mit Meldung, Schlag und Funken. Kein Teil hat eigene Lebenspunkte.
- **Mild:** ein Teil kostet 5–10 %, zusammen nie mehr als 15 % je Fahrwert. Der Pod bleibt fahrbar; man merkt den Schaden in schnellen Kurven und beim Beschleunigen, nicht auf der Geraden.
- **Schutzteile:** Rammbug (Mandrel Ram) und Panzerschürzen (Pagali Ironclad) kosten nichts, wenn sie fehlen – sie haben vorher Treffer abgefangen. Wer sie verliert, steckt danach mehr ein.
- **Reparatur ist kein Zurückspulen:** `R` heilt die Triebwerke, verlorene Teile bleiben bis zum Respawn weg.
- **Man sieht, was fehlt (Phase 6):** ein Bruchteil reißt mit Funken ab und fliegt als Blech in der Zweitfarbe des Pods nach hinten weg; die Stelle bleibt leer (Ringflügel mit dunkler Bruchkante, Splitter-X mit offenem Ansaugrohr, Rotor mit vier statt fünf Blättern). Ausgefallene Triebwerke sind dunkel und ziehen Rauch, tote Energiebögen fehlen.
- **Treffermarken statt Dellen:** wo der eigene Pod getroffen wird, bleibt ein Brandfleck mit blankem Metall in der Mitte – höchstens vier je Rumpfseite, der älteste wird überschrieben. Nach dem Respawn ist der Pod wieder sauber.
- **Explosion in Pod-Farben:** ein zerstörter Pod zerlegt sich in Platten seiner Erst- und Zweitfarbe.
- **Gegner zeigen ihren Zustand (Phase 7):** je Triebwerksseite Ruß auf dem Lack, unter 35 % schwächere, unter 15 % stotternde Flammen, dazu dieselben fehlenden Teile wie beim Spieler. So erkennt man im Zweikampf, wer angeschlagen ist – ohne Anzeige.
- **Hitze hat einen Ort:** Glut und Ruß laufen von der Düse nach vorn – auf dem Rumpf und genauso auf Flügeln, Finnen, Platten und Klappen. Ein Blech vorn am Triebwerk bleibt kühl, eines an der Düse glüht mit. (Vorher glühte jedes flache Teil wie die Düse.)
- **Treffermarken sitzen, wo der Treffer war** – auch bei 500 km/h in der Verfolgerkamera; eine Marke auf dem Triebwerk färbt eine Klappe nur dort, wo die Klappe wirklich liegt.

### Weitere Punkte

| Thema | Gestaltung | Stand |
|---|---|---|
| Hitzeglühen | beginnt an der Düse, wandert mit der Hitze nach vorn; dunkelrot → orange → gelbweiß; träge (Metall); ab 86 % Funken | S17 |
| Energieblitz | fein: haardünner Kern, vier dünne Bögen, die getrennt wandern und flackern; Quadra Lumber: zwei Blitze als X | S17 |
| Cockpit-Pendel | sichtbar, aber nie hektisch: max. ±1,9 m seitlich, unterdämpft (schwingt 1–2-mal nach) | S17 |
| Düsenklappen | 8–12 Lamellen am Triebwerksausgang, klappen beim Boost nach außen, Spitzen glühen orange | S16 |
| Energiekopplung | weißer Kern + zwei wandernde Gabel-Bögen + Flackern; deutlich heller als die Triebwerksflamme, aber schmal | S14 |

- **Podracer-Aufwertung:** 6 Lackiermuster × 3 Finishes (Klarlack, Metallic, Matt), Spezies-spezifische Pilotenköpfe/-Helme, Überrollbügel, Einlass-Statoren, Plasma-Koppler, seitengetrennt flatternde Schadensklappen und dezentes Hitzeflimmern auch hinter nahen Gegner-Düsen (weiterhin ohne aufgesetzte Nummernschilder). *(S19)*
- **Keine Schilder am Pod** (Startnummern wirkten aufgesetzt): Identität über Lackierung und Triebwerksglühen. *(S16)*
- **Boost:** Triebwerksklappen klappen ~30° auf, Nachbrenner-Kern, Hitzebalken steigt. *(S15)*

## 4. Flug, Steuerung & Kamera
Leitidee: **Lenken hebt, Tasten neigen.** Der Pod kippt nie von selbst – jede Schräglage ist entweder die Straße (Überhöhung, Steigung) oder eine bewusste Eingabe. *(S10)*

| Manöver | Eingabe | Wirkung | Preis |
|---|---|---|---|
| Triebwerkshub | Lenken | äußeres Triebwerk +1,1 m, inneres −0,22 m, keine Kippung | – |
| Slide | Leertaste + Lenken | Haftung ×0,24, Gierrate ×1,16, Exit-Schub bis +7 m/s | Bremswirkung ×0,42 statt voller Luftbremse |
| Anheben | `↓` | +1,6 m Schwebehöhe, Sprung ≈ 2× weiter | −20 % Haftung, ~10 %/s Tempo in der Luft |
| Neigen | `↑` | −0,45 m, +14 % Haftung, Landung in halber Zeit | weniger Bodenfreiheit |
| Rolle 90° | `←` / `→` | Breite bis 22 %, passt durch enge Lücken | Lenkung −40 %, fliegt höher |

| Thema | Gestaltung | Stand |
|---|---|---|
| Fahrgefühl | spürbar, aber fair: höchstens 25 % weniger Haftung (Eis) oder 8 % weniger Tempo (Sumpf); gilt für alle Pods; das HUD nennt Boden und Wirkung in zwei Wörtern | S20 Strecken |
| Schwerelosigkeit | nichts hält den Pod: langsames Taumeln, Triebwerke wippen einzeln, weiteres Sichtfeld, Sternenstaub; Tempo spürbar höher | S16 |
| Ego-Ansicht | kein Cockpit-Rahmen, freier Blick auf Triebwerke, Leitungen und Blitz | S17 |

- **Kamera:** rollt nur 20 % der Pod-Rolle mit (Horizont bleibt lesbar, 90°-Rolle ≈ 18° Kamerarolle). *(S10)*
- **Drift:** der Pod darf weit quer stehen (bis ~50°), bleibt aber abfangbar; Staub-/Gischtfahne und seitliche Staubwolke machen den Drift sichtbar. *(S15)*
- **Start:** Feld bleibt die ersten Sekunden in Formation und fächert erst dann auf. *(S16)*
- **Aktive Triebwerks-Aufhängung:** Repulsor-Schwebehöhe 2,85 m + 5-Punkt-Bodenkollision (mind. 0,68 m Abstand über Straßenwölbung, Curbs und Rampen). Beim Lenken und Luftbremsen steigt das kurvenäußere Triebwerk dynamisch auf (~1 m, Nase leicht hoch), das innere taucht in den Scheitelpunkt (~0,5 m) – Energie-Binder und Steuerseile folgen live. *(≤ S9)*
- **Freie Sicht & klare Hindernisse:** Keine grauen Rauchschwaden aus intakten Düsen; Bodenstaub bleibt flach und transparent (im Windschatten < 24 m ausgeblendet). Streckenhindernisse (~7–8 je Strecke, ≥ 52 m Abstand) tragen leuchtende Boden-Warnringe, gelb-schwarze Warnflächen und hohe orange-rote Warnbaken. *(≤ S9)*

## 5. Strecken & Bauwerke
Leitidee: **Der Boden erzählt den Planeten.** Eine Strecke ist kein einheitliches Band mehr: alle paar hundert Meter wechselt, worüber der Pod schwebt – und man sieht und spürt es. *(S20 Strecken)*

Leitidee: **Technik leuchtet schmal und bewegt sich.** Futuristisch wirkt nicht die Menge an Teilen, sondern Licht in Linien, das mit der Fahrtrichtung läuft. *(S16)*

### Untergründe, Seen, Welten

| Thema | Gestaltung | Stand |
|---|---|---|
| Passagen-Rhythmus | allgemeine Passagen wechseln etwa alle 500 m zwischen zwei bis drei Böden der Welt; gebautes Renndeck nur an Start/Ziel, Brücken, Tunneln, Rampen und Zero-G-Röhren | S20 Strecken |
| Übergang | Naturboden löst sich über 30 m fleckig in den nächsten auf, nie mit hartem Schnitt; wo das Renndeck an einen See stößt, franst es über 26 m aus | S20 Strecken |
| See-Passage | die offene Fläche **ist** die Oberfläche: eben, bis über 100 m breit, kein Geländer. Rand = schlanke Baken mit Leuchtkopf in `barrierColor`; das Ufer ragt immer über die Flüssigkeit | S20 Strecken |
| Flüssigkeiten | Eissee: blankes dunkles Eis, spiegelt den Himmel · Lavasee: dunkle Kruste mit Glutadern · Methansee: gelbgrün, milchig · Sumpf: dunkles Wasser mit Algenflecken · Spiegelsee: fast schwarzviolett, glatt · Meer: der Ozean von Aquilaris selbst | S20 Strecken |
| Plateau | heller, rissiger Lehmboden; am Rand fällt eine Felskante 17 m ab | S20 Strecken |
| Oovo IV | Mond statt Leere: grauer Regolith, Krater, flache Kraterränder am Horizont; Stationsdecks aus hellen Metallplatten; Gasriese mit Ring tief am Himmel; flache Sonne (19°) für lange Schatten | S20 Strecken |
| Malastare | Metall-Renndeck mit Lichtlinien statt Schotter – Industrie-/Raffineriewelt | S16 |

### Tunnel & Höhlen

| Thema | Gestaltung | Stand |
|---|---|---|
| Tunnel-Gewölbe | Superellipse: fast senkrechte Wände, breite flache Decke – auch am Rand bleibt Luft. 27 m hoch (Ando Prime 30 m). Die Kamera bleibt immer im Gewölbe. Die Decke hält jeden Pod mit seiner eigenen Form draußen: geprüft wird die Hülle um das Modell – Triebwerksspitzen, beide Triebwerksseiten, Cockpit –, so wie der Pod gerade in der Luft liegt (Nase hoch, gerollt, Triebwerk angehoben, Cockpit ausgeschwungen). Das gilt für Pods in der Luft; wer auf den Repulsoren fährt, wird nie heruntergedrückt. Brücken, Tore und Bögen über der Strecke schlagen einen Pod um dieselbe Hülle herunter | S20 Strecken |
| Höhle | ein durchgehender Raum ohne Lücken. Kammern öffnen sich nach oben (bis 45 m) und zur Seite (die Piste wird breiter). An Gabelungen verschmelzen beide Röhren zu einer Halle mit Felspfeiler | S20 Strecken |
| Standard-Tunnel | „unterirdisch": Röhre unter einem Erdwall (Böschung bis zum Gelände), geschlossene Portalwand, oben ein befahrbares Deck mit Fahrbahn-Belag und zwei schmalen Leuchtkanten | S17 |
| Unterwassertunnel (Aquilaris) | Stahl-Caisson, der an der Wasserlinie ins Meer abtaucht; innen Fensterbänder auf beiden Flanken zwischen Stahlrippen, Blick ins Blau mit Kaustik, Lichtstrahlen und Fischen; 9 m hoch | S17 |
| Höhle (Magma) | raue, unregelmäßige Felsröhre mit Stalaktiten und Glutadern, sparsame Lampen, zwei offene Lichtschächte; 11 m unter Gelände | S17 |
| Tunnel | Halbellipse über die ganze Breite, 12 m hoch, Stahlrippen alle 24 m, Deckenlampen, Leitstreifen, wuchtige Portalrahmen; folgt der Kurvenüberhöhung | S16 |

- **Hohe Tunnel & verzweigte Höhlen:** Luftige Querschnitte (Maße und Profil seit Session 20: siehe oben). Höhlenkammern weiten sich mit modelliertem Felsboden, Leuchtadern und Stalagmiten; an Gabelungen teilt ein Felspfeiler mit Doppel-Leuchtpfeil den Weg in zwei vollwertige Röhren, die sich wieder vereinen. *(S19)*
- **Höhle:** Folge von Kammern statt gleichförmiger Röhre – Decke wölbt sich in jeder Kammer hoch; Felssäulen stehen frei in den Kammern, Stalagmiten säumen den Rand. (Die offenen Lichtschächte zwischen den Kammern sind seit Session 20 entfallen: die Höhle ist durchgehend.) *(S18)*

### Brücken, Kreuzungen, Profil, Rhythmus

- **Alles unter einer überhöhten Fahrbahn folgt der Überhöhung** (Pfeilerkappen, Träger). Ein waagerechter Balken sticht in der Kurve durch die Fahrbahn. *(S20 Strecken)*
- **Über-/Unterführungen:** Wo sich eine Strecke kreuzt (≥ 35 m Höhenabstand), trägt die obere Piste einen abgeschrägten Stahl-Hohlkasten mit Querträgern, seitlichen Leuchtstreifen, Widerlagern und Zwillingspfeilern; die untere führt durch einen 20-m-Unterführungstunnel oder frei unter dem Viadukt hindurch. Auf Karte und Minimap hebt eine dunkle Kontur die Brücke ab. *(S19)*
- **Rhythmus einer Strecke:** enge Passagen (Schlucht, Tunnel, Höhle) wechseln mit S-Kurven und zwei **weiten offenen Flächen**, auf denen das Feld auffächern kann. Tunnel sind lang genug, um als eigener Abschnitt zu wirken (≥ 260 m). *(S18)*
- **Schrägkurven:** Überhöhung proportional zur Krümmung, bis ≈ 21° bzw. 6,2 m Außenkante; der Pod legt sich mit der Straße, nicht durch Lenken. Überhöhung = mehr Haftung, also schnellere Kurven. *(S10)*
- **Steigungen:** zwei lange Wellen je Strecke (±15 m, ±6,5 m). Kuppen lassen Pods abheben – dort entscheiden Anheben/Neigen. Start, Ziel, Rampen, Lücken, Zero-G-Röhren und Über-/Unterführungen bleiben wie entworfen. *(S10)*

### Leitsystem & Technik am Streckenrand

| Thema | Gestaltung | Stand |
|---|---|---|
| Licht-Leitstreifen | 0,5 m breit an beiden Fahrbahnrändern, Farbe = `barrierColor`, Grundhelligkeit 55 %, Lichtpuls alle 28 m läuft mit ~42 m/s voraus | S16 |
| Holo-Tafel | 8,4 × 3,5 m, additiv, Rahmen + umschaltende Glyphen-Blöcke, Scanlines, leichtes Flackern; auf schlankem Projektormast, 20° zur Fahrbahn gedreht | S16 |
| Schwebe-Bake | kleiner Leuchtkörper mit Ring auf dünnem Stiel, paarweise alle 50 m | S16 |
| Energieleitung | Rohr Ø 1,6 m neben der Strecke, Halter zur Fahrbahnkante, Leuchtmuffen; wechselt alle ~520 m die Seite | S16 |
| Mechanik | dunkles Metall, schmale Leuchtstreifen in `barrierColor`, sichtbare Bewegung (gegenläufige Ringe, Rotoren) | S11 |

- **Leitplanken-Energiefeld:** H-Träger-Pfosten mit Außenstreben, Doppelplanken, darüber dezente TSL-Plasmafläche mit Scanlines und bis zu 4 gleichzeitigen Schockwellen-Ringen bei Wand-/Feldkontakt. *(≤ S9)*
- **Startportal:** Fachwerk statt Vollbalken, Türme kanneliert mit Kragenringen, Akzentfarbe = `barrierColor` nur als schmale Linien. *(S9)*
- **Fahrbahn & Schluchten:** Doppel-Turbinenspuren, Teerfugen/Spurrillen/Gletscherrisse, Themen-Curbs, 11-stufige Schluchtwände mit Felspfeilern, Hängekabel mit Baken, Doppelpfeiler-Viadukte mit Hammerkopf-Trägern, Stahl-Widerlager an Abgründen, Tunnel-Stützrippen, Oovo-Schottringe, Boonta-Startportal mit Rennleitung & überdachten Tribünen, Reparaturbuchten mit animierten Chevrons & Tesla-Spulen. *(≤ S9)*

### Set-Pieces, Hindernisse, Trümmer

- **Futuristische Schleusen (statt Fallgitter):** 3-spurige Panzerschleuse mit Überkopf-Kammer, hydraulischen Verbund-Schotts, Plasma-Dichtnaht und dezentem Warn-Energiefeld; seitlich wachsen Fels-, Gletscher-, Kristall- oder Stations-Monolithen organisch in die Landschaft. *(S19)*
- **6 Set-Piece-Typen:** `rotor` (Drehbalken), `gate` (3er-Fallgitter), `arch` (Einsturz-Felsbogen), `icefall` (berstende Gletscher-Eisbrücke), `boulder` (springende Felsbrocken aus Schluchtrinne), `bridge` (gegenläufige Schwenkbrücken-Ausleger). *(≤ S9)*
- **Trümmer:** immer deckend und kantig; verschwinden durch Schrumpfen, nie durch Transparenz. *(S15)*

| Thema | Regel | Stand |
|---|---|---|
| Zerstörbares | nur Kleines (Kisten, Felsen bis ~2,9 m): Trümmerwolke in Bodenfarbe, Funken, dumpfer Schlag; Großes bleibt hart | S14 |
| Trümmer | zerbröseln langsam (schrumpfen + sinken über ~3 s), nie plötzliches Verschwinden; eine Schikane bleibt | S14 |
| Banner | Unterkante ≥ 16 m über der Fahrbahn; Traversen sind massiv | S14 |

## 6. Landschaft & Leben
Leitidee: **Silhouette vor Textur** – jede Form muss aus 300 m als Gestein, Baum oder Bauwerk lesbar sein; keine glatten Drehkörper, keine Kugel-Blobs. *(S9)*

| Asset | Formregeln | Varianten |
|---|---|---|
| Felsbrocken | Rauschkörper, von 9 Spaltebenen gekappt (plane Bruchflächen), flache Standfläche, flat-shaded | 3 |
| Felsnadel (Hoodoo) | 8–11 Schichten, harte Lagen kragen aus, weiche weichen zurück; Erosionsrillen; Schuttfuß; Deckstein; leichte Neigung | 3 |
| Tafelberg | Schutthalde → Klippe mit Rinnen → Bank → Klippe → Plateau; gelappter Grundriss | 2 |
| Urwaldriese | 5–6 Brettwurzeln, gebogener Stamm, 4 Astgabeln, 6–10 flache Kronenlappen + Büschel, Lianen; unten dunkel, oben sonnig gelbgrün | 2 |
| Schneekiefer | 4–6 sternförmige, hängende Astetagen; Schnee nur auf Oberseiten (seit Session 20 durch die HQ-Kiefer ersetzt; diese Form bleibt nur für Umgebungen ohne Canvas, z. B. Node-Audits) | 1 (Höhe variiert) |
| Eis / Kristall | 5–8 sechseckige Prismen mit exzentrischer Spitze, Bruchstücke am Fuß, flat-shaded, leicht emissiv | 2 |
| Saguaro | 8 Rippen, runde Kuppe, 2–3 aufgebogene Arme | 2 |

| Thema | Gestaltung | Stand |
|---|---|---|
| Schneekiefer (HQ) | hängende Nadelzweige in Quirlen, Schnee auf den Oberseiten, dunkler Stamm mit Rinde; aus der Ferne Kegel-Etagen gleicher Silhouette | S20 Strecken |
| Felsbrocken (HQ) | kantiger Bruchkörper; das Relief folgt der Textur (Riss im Bild = Kerbe im Stein); große Bruchkanten hart, verwitterte Flächen weich schattiert | S20 Strecken |
| Kaktus (HQ) | Rippen dunkeln ins Tal ab; auf jedem Rippenkamm helle Areolen mit Dornenfächer | S20 Strecken |

- **Baum (HQ):** Silhouette aus Schirmkronen bleibt; die Oberfläche besteht aus erkennbaren Zweigen mit Einzelblättern (hell- bis dunkelgrün gemischt), der Kern dahinter ist dunkel, der Stamm trägt fotografierte, leicht bemooste Rinde. Aus der Ferne wechselt der Baum auf glatte Kronenlappen gleicher Form. *(S18)*
- **Dichte:** mit der Streckenlänge wachsen Felsen, Bäume, Landmarken mit; nahe der Fahrbahn bleibt die Sicht frei. *(S18)*
- **Fels-Textur:** horizontale Sedimentbänder dominieren; Klüfte sind verzerrt und nur lokal offen; Feinschichtung + Tafoni-Löcher. Kein regelmäßiges Blockraster. *(S9)*
- **Bewuchs:** 25 Typen (inkl. Agaven, bemooste Baumstämme, 9-wedelige Farne, 6-blütige Blumen); 150-m-Zellen; Büsche/Sträucher wechseln ab ~165 m per Dither-Crossfade auf 6-Dreieck-Impostors bis 540 m. *(≤ S9)*
- **Leben:** alle Kreisbahnen meiden Landmarken; Bantha-Herden fliehen bei Pods < 125 m; ufer-/streckennahe Vogelschwärme sitzen auf Felsen und starten aufgeschreckt; Langhals-Riesen, Sandkriecher (mit beleuchteter Brücke), 3-Düsen-Gleiter, Lastkähne, Himmels-/Patrouillenverkehr. *(≤ S9)*

### Gelände-Schichten & Detail-Normalmaps (`terrainMaterial`, `textures`) (≤ S9)

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

## 7. Umwelt: Tageszeit, Wetter, Licht
Leitidee: **Jede Welt hat ihr eigenes Klima, und es lebt.** Wetter und Tageszeit ändern sich langsam (rund eine Minute je Übergang), werden einmal angesagt und bleiben fair. *(S13)*

Leitidee: **Wetter verändert die Lesbarkeit, nie die Fairness.** Sicht wird weicher und stimmungsvoller, aber Fahrbahnkante, Hindernis-Baken und Vordermann bleiben immer erkennbar. *(S11)*

| Thema | Regel | Stand |
|---|---|---|
| Klima | Wüste: Sand statt Wasser. Eis: Schnee und Eisnebel. Vulkan: Smog und Asche mit trockenen Blitzen. Nur feuchte Welten kennen Regen und Gewitter. | S13 |
| Sonnenbahn | Aufgang 40° vor, Untergang 70° nach dem Mittags-Azimut der Welt; der Mond steht gegenüber. Beim Wechsel wird das Licht kurz dunkel statt über den Himmel zu wandern. | S13 |
| Regenstreifen | Länge und Richtung folgen der Relativgeschwindigkeit: im Stand fast senkrecht, in Fahrt vom Fluchtpunkt nach außen. Breite ~3 cm, Deckkraft ≤ 0,6. | S13 |
| Linsentropfen | langsam: laufen herab; schnell: werden nach außen gedrückt, Spuren werden länger, Perlen werden weniger. Nie größer als 2,5 % der Bildhöhe. | S13 |
| Gischt / Spritzer | Gischt weißgrau, hinter dem Pod, wächst mit Tempo; für Gegner unter 24 m aus (Sicht). Spritzer: winzige Kronen, 0,15 s. | S13 |
| Blitz | weißer Kern, sechsmal so breites weiches Glühen, 3 Äste, 2–4 Folgeblitze in 0,3 s. Erhellt Wolken und Umgebungslicht, kein Vollbild-Weiß. | S13 |
| Donner | Knall nur bei nahen Einschlägen, sonst Schlag + Grollen; Verzögerung = Entfernung / 343 m/s (max. 3 s). | S13 |
| Lichtkegel | 30 m lang, kühles Weiß, Deckkraft ≤ 0,15, zur Kante weich auslaufend; blendet mit der Dunkelheit ein. | S13 |
| Nässe | Straße wird in ~12 s nass, trocknet in ~50 s; Pfützen spiegeln, Staub wird zu Gischt. | S13 |
| Tageszeit | verschiebt Sonnenstand, Himmels-/Nebel-/Hemisphärenfarben; Nacht = Mondlicht (bläulich, Intensität 1,15), nie schwarz | S11 |
| Wetter | entsättigt den Himmel helligkeitsgleich (Regen/Sturm/Schnee) oder färbt ihn zur Bodenfarbe (Staub); Nebel verdichtet nur den Höhennebel | S11 |
| Nebel | Höhennebel liegt in Senken, dünnt nach oben aus, zieht in Bänken; Richtung Sonne heller (Vorwärtsstreuung) | S11 |
| Blendung | weicher Schleier + Kern + schmaler Streifen + 4 kleine Ghosts; Zusatzhelligkeit < 0,85, kein Bloom-Aufdrehen | S11 |
| Regen | dünne schräge Streifen, Tropfen auf der Linse klein (≤ 2,5 % Bildhöhe) und kurzlebig, Gischt statt Staub | S11 |
| Gewitter | Blitz ≤ 1,2 s, erhellt Wolken und Umgebungslicht – kein Vollbild-Weiß; Donner 0,2–3,2 s später | S11 |
| Böen | große, sehr transparente Schwaden (Alpha ≤ 0,11), nah an der Kamera ausgeblendet | S11 |
| Unwetter | Sicht darf deutlich einbrechen, aber Leitstreifen, Baken und Barrieren bleiben als Orientierung sichtbar | S16 |

- **Atmosphäre & Blitze:** Höhennebel bleibt unterhalb des Talbodens C¹-stetig dicht (keine schwebende Nebelkante am Hang). Gewitterblitze sind fein fraktal verästelt (64-Segment-Hauptkanal, 5 Hauptäste, 7 Haarzweige). *(S19)*
- **Nachtlichter:** kleine, helle Punkte statt großer Glows: weißblaue Scheinwerfer an den Triebwerksnasen, links rot / rechts grün an den Flügelspitzen (Luftfahrt-Konvention), kurzes weißes Blitzlicht am Cockpit. Nur der Spieler wirft echtes Licht (kühles Weiß, weicher Kegel auf die Fahrbahn). *(S12)*
- **Wetterverlauf:** Übergänge dauern rund eine Minute und werden einmal angesagt („GEWITTER ZIEHT AUF"); nie abrupte Sprünge in Sicht oder Haftung. *(S12)*

## 8. Grafik & Effekte
### Post-Processing & Grafik-Stabilität (`post`, `materials`, `terrainMaterial`, `trackMesh`)

- **Symmetrisches Depth-AO:** 4-Paar-Konkavitäts-AO via `textureLoad` (Ebenen = exakt 1,0 ohne Streifen, keine Halos an Silhouetten/Gras, 0 MRT, immun gegen Partikel/Flammen, Distanz-Fade 32–95 m). *(≤ S9)*
- **Reflexionen & Geometrie:** Räumlich gemergte 580-m-Kacheln (kein `BatchedMesh`), 128×-vorskaliertes TBN mit Silhouetten-Schutz, singularitätsfreie Welt-Normalen auf Terrain/Wasser/Lava, rissfreie Straßen-/Klippennähte, weiche PMREM-Sonne, Distanz-Specular-AA, optionales uniform-flow SSR. *(≤ S9)*
- **Bloom, God Rays, Speed-Blur & Warmup:** HDR-Clamp `[0, 12]`, Half-Res-Bloom (`threshold = 2.1`), 14-Tap-`textureLoad`-Sonnenstrahlen, 5-Tap-Speedblur, **Grain = 0**, komplettes GPU-Pipeline-Warmup vor dem Countdown. *(≤ S9)*

### Staub, Hitze, Spiegelungen, Fotos

| Thema | Gestaltung | Stand |
|---|---|---|
| Staubfahne | trägt die Farbe des Bodens (Schnee weiß, Asche dunkelgrau, Mondstaub grau); über Wasser, Sumpf und Spiegelsee Gischt; über Lava zusätzlich Glutfunken; auf blankem Eis, Stationsdeck und Kristall keine | S20 Strecken |
| Staubfahne | zwei Fahnen unter den Triebwerken, driften nach außen, heller als der Boden, bis ~40 % Deckkraft; bei Nässe weißgraue Gischt | S17 |
| Hitzeflimmern | nur direkt hinter den Düsen, Versatz < 0,15 % der Bildbreite, in Fahrt auf ein Drittel reduziert. | S13 |
| Foto-Sets | echte Materialien (Farbe, Normal-Map, Rauheit, Höhe). Die Struktur kommt vom Foto, die Farbe wird auf die Palette der Welt gezogen | S20 Strecken |

- **Staubfahne:** flach und bodennah, in Bodenfarbe, wird nach hinten breiter und blasser (Deckkraft ≤ 0,13); nie höher als die Triebwerke. Bei Nässe weißgraue Gischt stattdessen. *(S15)*
- **Spiegelungen:** Pfützen und nasse Fahrbahn spiegeln Lichter, Pods und Umgebung (Screen Space), Himmel über die Umgebungsbeleuchtung; trockene raue Flächen spiegeln nicht. *(S15)*
- **Foto-Detail:** echte Fotos liefern Feinstruktur (Risse, Körnung, Rippel), nie die Farbe – Farbe, Schichtung und Stimmung kommen weiter aus der Palette der Welt. So bleibt roter Fels rot und Dschungelfels grün, bekommt aber echte Oberfläche. *(S18)*
- **Leistung ohne Bildverlust:** Partikel-Flugbahnen rechnet die GPU; ferne Bäume/Felsnadeln nutzen gleichförmige LOD-Zwillinge; Kaskaden-Schatten sind eine Option, kein Standard. *(S10)*

## 9. Audio
### Welt- & Gefahren-Audio (`audio`) (≤ S9)

| Quelle | Klang | Auslöser |
|---|---|---|
| Geysire, Wasser-/Lavafälle | gefiltertes Dampf-/Magma-/Wasserrauschen | Distanz < 130–135 m |
| Rotoren & Schwenkbrücken | pulsierendes Blatt-Wummern (`arms × speed`) | Distanz < 145 m |
| Fallgitter & Felsen | metallischer Tor-Schlag / dumpfer Felsaufprall | Aufschlag < 140–165 m |
| Energiefeld | kurze Plasma-Entladung | Feldkontakt |
| Vögel, Herden, Sandkriecher | Biom-Vogelruf, tiefes Herden-Röhren, Ketten-Grollen | Vorbeifahrt an Schwarm/Herde/Crawler |

| Ebene | Regel | Stand |
|---|---|---|
| Klang | Schichten statt Lautstärke: Sub + Sägezahn + Whine + Rauschen; Echo nur zwischen Wänden; Kompressor auf dem Master | S11 |
