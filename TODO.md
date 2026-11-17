# TODO

## 1. Als Nächstes
- [ ] **KI in dichten Hindernisfeldern:** Malastare-100 (Felder bei 36–44 %) – KI pendelt zwischen Felsen; Pfadsuche über alle Hindernisse im Sichtfenster statt Einzelausweichen
- [ ] Ladezeit messen (Bewuchs ≈ 3 `heightAt` je Instanz; ggf. Web Worker)
- [ ] Sound: Vögel, Herden, Sandkriecher, Geysire, Rotoren, Fallgitter

## 2. Landschaft
- [ ] Bewuchs-LOD: ferne Büsche als Billboards / Impostors
- [ ] Herden und Fahrzeuge weichen Landmarken aus (aktuell Kreisbahnen ohne Hindernisprüfung)
- [ ] Vögel landen/starten an Felsen; Herden fliehen vor nahen Pods
- [ ] Wasserfälle an Schluchtwänden (Dschungel), Lavafälle (Vulkanwelt)
- [ ] Gelände-Detail-Normalmaps je Welt (z. B. Windrillen im Schnee)

## 3. Strecken
- [ ] Weitere Set-Pieces: Schwenkbrücken, rollende Felsen, einstürzende Eisbrücken
- [ ] KI: Rotor-Timing lesen
- [ ] Energiefeld: aufleuchtende Feldfläche

## 4. Podracer
- [ ] Schadensgeometrie, Startnummern, Pilot-Spezies, Hitzeflimmern, Livery-Auswahl im Hangar

## 5. Performance / Tooling
- [ ] Partikel als GPU-Compute, Cascaded Shadow Maps
- [ ] Harness-Pixel-Diff, `sim` als CI-Check

## Erledigt (Session 5)
- [x] Gelände-Texturen: Splatting Sand/Kies/Becken/Fels, Gesteinsschichten je Welt, Wolkenschatten
- [x] Bodenbewuchs als Instancing mit Dichte nach Abstand (Zellen, Sichtweite je Typ, Dither-Fade, Wind)
- [x] Rauchsäulen ohne Partikel (Billboards) + Staub-/Schnee-/Methanteufel
- [x] Leben: Vögel, Herden, Langhals-Riesen, Sandkriecher, Gleiter, Himmelsverkehr, Patrouillen, Lastkähne
- [x] Mehr Details: Krayt-Skelett, Feuchtfarm, Steinkreis, Leuchtturm, Salzpfannen, gefrorene Seen, Sümpfe, Lavakrusten, Sandverwehungen
- [x] Fixes: Texturlimit (Packing), Wasserspiegel im Dschungel, God-Ray-Streifen, Schaden-Cooldowns, Set-Pieces nicht auf Hindernisfeldern
