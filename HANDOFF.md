# HANDOFF

## Nächster Schritt (zuerst lesen)
Session 20 lief in zwei Zweigen und ist zusammengeführt (Abschnitt „Merge" unten): **Session 20 (Strecken)** aus `B` und **Session 20 (Pods)** aus `new_pods`. Offen:
0. **`dev` nach `main` bringen** (Pull Request auf GitHub – Schritt des Nutzers). Stand: **Pull Request #2 ist gemergt** (2026-11-22, `main` = `3625c99`, `https://github.com/Cr0nFixXx/podracer/pull/2`) – `main` enthält damit beide Sitzungen und die Tunneldecke je Pod. Danach hat der Nutzer den Zweig **`dev`** angelegt. Dort liegt, einen Commit vor `main`, die **Hülle je Pod**: Tunneldecke fertig, Überkopf-Bauten, Test-Werkzeuge repariert (auf Wunsch des Nutzers direkt nach `dev` gepusht). Die Tunneldecke steht in den beiden Abschnitten direkt unter „Git-Stand"; der obere gilt.
1. **Strecken – Probefahrt auf echter GPU** (`npm run dev`, ≈ 10 Min.; in der Sandbox ließ sich nur in Software rendern):
   - **Aquilaris-Küstenlauf** und **Oovo-IV-Gefängnis**: Schrägkurven abfahren – ragt noch irgendwo ein Balken aus der Fahrbahn?
   - **Frostspalt-Ring:** 30-m-Tunnel, durchgehende Eishöhle mit Gabelung, Eissee (25 % weniger Haftung – fair?).
   - **Magma-Inferno:** Höhle (zu dunkel?), Lavasee (Triebwerke heizen schneller auf).
   - FPS unten rechts notieren (`WebGPU`), vor allem auf den offenen See-Passagen.
2. **Pods:** alle acht Phasen (0–7) der Pod-Überholung sind fertig, die Abschluss-Durchsicht ist eingearbeitet (fünf Korrekturen, Abschnitt „Abschluss-Durchsicht" unten; dort stehen auch die zurückgestellten Kleinigkeiten) – Tabelle im Abschnitt „Session 20 (Pods)" unten. **Selbst prüfen:** „Ultra" am Gaming-PC (Bildrate mit vollen Details, Teilen und Schaden), die Schadens-Balance von Hand fahren, die Teile-Kombinationen durchklicken. Die Listen „Nicht verifiziert" je Phase stehen unten. Genauer Arbeitsstand der Pod-Sitzung: `.superpowers/sdd/swift-floating-kurzweil/progress.md` (git-ignoriert, nur auf dem Rechner des Nutzers). Im **Hangar** außerdem die 6 Lackiermuster & 3 Finishes testen (offen seit Session 19).
3. Vor jeder Änderung: `npm run check` (Typecheck + Unit-Prüfungen + Pod-Audit + Sim) muss grün sein. Pods ansehen: `npm run dev` → `http://localhost:5173/tools/harness/pods.dev.html`.

## Git-Stand (wichtig)
- Lokales Repo im Projekt-Root, Branch **`B`**, Remote `origin` = `https://github.com/Cr0nFixXx/podracer.git`. **Pushen:** `git push origin B`.
- Fremde Alt-Dateien (`canblatt.html`, `canwelk.html`) liegen sauber in `.archiv/` (git-ignoriert).
- **Doppelte `.git`-Sicherung in `.archive/`** (+ kompatible Spiegelkopie in `.archiv/repo-sicherung/`):
  1. `.archive/git` – direkte vollständige Ordnerkopie von `.git`
  2. `.archive/podracer-git.tar.gz.b64.txt` – vollständiges `.git` als Base64-Text (falls Binär-Packdateien beim Download gefiltert werden) + `wiederherstellen.sh` / `wiederherstellen.ps1` / `LIESMICH.txt`.
- **Committen immer mit `npm run save -- "Nachricht"`** (`tools/save.sh`): committet alles außer `.archive`/`.archiv`, aktualisiert beide Sicherungen und führt Probe-Wiederherstellungen aus.
- Commit-Autor ist der Platzhalter „Podracer Dev".
- **Lokaler Windows-Rechner (Claude-Desktop, Git-Worktrees unter `.claude/worktrees/`):** dort ist `.git` nur eine Zeigerdatei – `npm run save` würde nur diesen Zeiger „sichern" und die versionierte Sicherungsdatei durch einen Stummel ersetzen. Entscheidung des Nutzers (2026-11-21): `.archive` und die Git-Sicherung sind in dieser Umgebung nicht relevant → dort einfache `git commit`s. Session 20 (Pods) lag dort auf dem Branch `claude/caveman-mode-fa82ce` (abgezweigt von `new_pods` = `origin/B`, Commit `d7b9c4b`) und liegt auf GitHub in `new_pods`.
- Seit dem Commit `d7b9c4b` ist `.archiv/repo-sicherung/` versioniert: im Haupt-Checkout committet dadurch jedes `npm run save` eine Kopie des ganzen Repos ins Repo (Größe wächst je Sicherung etwa um den Faktor 2,3). Nicht angefasst – Entscheidung des Nutzers offen.
- **Session 20 (Strecken), Sandbox:** Das Repo wurde frisch von GitHub geholt (`git init` + `fetch` + `checkout --track origin/B`); `.archive/` gibt es in diesem Arbeitsordner nicht. Laut Nutzer ist die `.git`-Sicherung nicht mehr relevant → die Sitzung ist mit **normalen Commits** gesichert (`git add <Pfade>` + `git commit`, ohne `npm run save`) und auf Wunsch des Nutzers **nach `origin/B` gepusht**. Die Textkopie in `.archiv/repo-sicherung/` steht deshalb auf dem Stand von Session 19 – GitHub ist die Sicherung.
- **Mit committet (Wunsch des Nutzers: „das Ganze"):** das neu gebaute Harness-Bundle `tools/harness/out/game.js` (Build-Artefakt, durch die Fotosets 19,6 MB) und `.archiv/canbaum.html` (fremde Datei aus einer anderen Aufgabe). Weiterhin gilt: nur auf ausdrücklichen Wunsch pushen.
- **Nach einem Sandbox-Reset** fehlt `.git/config`: `git config core.fileMode false` (sonst erscheinen alle Dateien als geändert – nur Dateirechte), `git remote add origin https://github.com/Cr0nFixXx/podracer.git`, `git checkout -- tools/harness/out`.
- **Zweig `dev`** (vom Nutzer am 2026-11-22 angelegt, gleich nach dem Merge von PR #2): der Arbeitszweig ab jetzt. Der Commit „Hülle je Pod" (Abschnitt direkt unter diesem) liegt dort, einen Commit vor `main` (`3625c99`), auf Wunsch des Nutzers direkt gepusht. **Pushen:** `git push origin dev` – weiterhin nur auf ausdrücklichen Wunsch. `main` nicht direkt anfassen (Pull Requests).
- **Ein Sandbox-Reset nimmt nicht gepushte Commits mit** (2026-11-22 passiert: der lokale Commit war nach dem Reset weg, `HEAD` stand wieder auf dem letzten gepushten Stand). Die Dateien im Arbeitsordner blieben erhalten, bis auf `node_modules`, `dist` und `tools/harness/out`. Wiederherstellen: die Schritte aus dem Punkt „Nach einem Sandbox-Reset" oben, `npm ci`, beide Harness-Bundles neu bauen, `npm run check`, neu committen. Deshalb: vor dem Ende einer Runde pushen lassen – oder dem Nutzer sagen, dass der Commit nur lokal liegt.
- **Zweige seit Session 20:** `main` ist der Sammelzweig; bisher kam alles über Pull Requests auf GitHub hinein. PR #1 hat **Session 20 (Strecken)** aus `B` nach `main` gebracht; PR #2 hat **Session 20 (Pods)** aus `new_pods` nach `main` gebracht (gemergt am 2026-11-22). Damit PR #2 ohne Konflikte mergebar war, wurde vorher `main` in `new_pods` gemergt (Abschnitt „Merge" unten). Seitdem gibt es den Zweig `dev` (Punkt darüber). Die erste Zeile dieses Abschnitts (Branch `B`) beschreibt den Stand bis Session 19.

## Stand: 2026-11-22 – Hülle je Pod: Tunneldecke und Überkopf-Bauten fertig, Test-Werkzeuge repariert

Auftrag des Nutzers („Offene Punkte aus dem Merge"): die Tunneldecke fertig machen, Brücken und Bögen mit der echten Pod-Höhe rechnen, die Test-Werkzeuge reparieren. Der Abschnitt darunter („Tunneldecke je Pod") beschreibt den Zwischenstand davor – `POD_BOX` und `podHeight` von dort gibt es nicht mehr.

**Was am Zwischenstand noch falsch war**
- Die Decke kannte nur **eine Höhe über der Pod-Mitte**. Ein Pod, der nach oben fliegt, hebt aber die Nase: bei 0,2 rad liegen die Triebwerksspitzen (bis 12 m vor dem Ursprung) 2,4 m höher, im Extrem (0,76 rad: Steigflug + Anheben-Taste in der Luft) 8 m. Gemessen: das Modell ragte bis 5,96 m über die gerechnete Höhe.
- An der Flanke fällt das Gewölbe nach außen ab – das äußere Triebwerk steht unter einem tieferen Teil als die Mitte.
- Das Cockpit pendelt an seinen Kabeln (bis 0,8 m nach oben) – nicht eingerechnet.
- Überkopf-Bauten rechneten für jeden Pod mit 1,5 m über und unter der Mitte.

**Lösung**
1. **Hülle statt Höhe (`src/game/podHulls.json`, gelesen von `podDesigns.ts` → `podEnvelope().hull`):** je Pod drei Teile – linke Triebwerksseite, rechte Triebwerksseite, Cockpit –, jedes Teil eine Reihe 3 m breiter Scheiben quer über den Pod (`HULL_SLAB`). Eine Scheibe ist der Umriss ihrer Seitenansicht (Oberkante von hinten nach vorn), durch ihre Breite geschoben. Gemessen am Modell in seiner größten Ausstattung (ab Werk in allen drei Detailstufen + die drei Teile-Ausstattungen des Audits), jede Zahl auf den Zentimeter nach außen gerundet; beim Ausdünnen des Umrisses kommen höchstens 3 cm dazu. 1 548 Zahlen, 72 bis 148 Eckpunkte je Pod. **Nicht von Hand ändern** – neu messen mit `HULL=write npm run check:pods`.
2. **`hullWorld(p, env)` (`physics.ts`):** die Eckpunkte der Hülle in der Welt, in der Lage, in der das Modell gezeichnet wird – Gieren, Nicken und Rollen um den Rumpf-Ursprung, jede Triebwerksseite mit ihrem Hub, das Cockpit mit seinem Pendeln (Verschiebung und Neigung, `COCKPIT_SWAY` – dieselbe Konstante nutzt jetzt `podModel.ts`).
3. **Tunneldecke (`vaultOver`, `crossSection`, `shellHeight`):** jeder Eckpunkt wird gegen die Schale **über diesem Eckpunkt** geprüft. Die Schale ist die Superellipse des Meshs (`tunnelProfile`, mit der Querneigung geschert), gelesen im Querschnitt, in dem der Eckpunkt liegt, und gerade zwischen zwei Samples – so folgt die Decke der Straße ein Gefälle hinab, um eine Kurve und in eine Höhlenkammer. Ein Eckpunkt jenseits eines Portals steht unter freiem Himmel. **Wo eine Höhle sich gabelt**, zählt die höhere der beiden Schalen – wie im Mesh, das die Röhren vereinigt.
4. **Zeitpunkt:** die Decke wird als **Letztes im Schritt** geprüft, wenn Nicken, Rollen, Triebwerkshub und Cockpit-Pendeln für das nächste Bild feststehen.
5. **Nur für Pods in der Luft:** ein Pod, der auf seinen Repulsoren fährt (`p.grounded`), wird von der Decke nie berührt. Aufrecht bleibt ihm überall Luft (Prüfung 2 unten). Im Messerflug direkt neben der Wand steht die obere Flügelspitze dagegen in der Gewölbeflanke (einmalig gemessen: 14 872 von 261 856 Fahr-Lagen, bis 4,16 m); ihn dort herunterzudrücken, würde gegen die Bodenfreiheit arbeiten.
6. **Überkopf-Bauten** (Startbrücke, Sponsor-Brücken, Tore, Bögen): der Pod ist so hoch und so tief wie seine Hülle in ihrer jetzigen Lage – der höchste und der tiefste Eckpunkt, der gerade unter dem Bau liegt (`oh.half + 1` m längs). **Ein Bogen wird weiter an der seitlichen Position der Pod-Mitte gelesen**: seine Kollisionsform ist dafür gepolstert (`inner`: 1,7 m bei Checkpoint-Bögen, 1,3 × Röhrenradius bei Felsbögen und dem einstürzenden Bogen). Eckpunkt für Eckpunkt geprüft, würde ein Pod, der nah an der Wand fährt, vom Bogenfuß getroffen.
7. **`tunnelProfile`** rechnet für n = 3 mit `cbrt` statt zweimal `pow` (gleiche Kurve; sie wird jetzt für jeden Eckpunkt nahe einem Gewölbe gefragt).

**Prüfungen**
- **Pod-Audit** (`tools/ci/pods.ts`, Messcode in `tools/ci/hull.ts`): Spalten `hull` (so weit ragt das Modell aus seiner Hülle, Grenze 2 cm) und `stale` (so viel ist die Hülle größer als das Modell, Grenze 9 cm; frisch gemessen 3 cm). Ein Pod ohne Hülle fällt durch.
- **Unit-Prüfungen** (`tools/ci/unit.ts`, jetzt 73; die zwei vom Zwischenstand sind durch vier ersetzt). `ONLY="tunnel ceiling" npm run check:unit`, mit `CEIL_TABLE=1` wird jeder Fall gedruckt:
  1. „pushed up against the vault": Pods werden im Tunnel nach oben gedrückt – waagerecht und mit Nase hoch, am Scheitel und an der Wand, ein Triebwerk angehoben, Cockpit ausgeschwungen, gerollt bis zum Messerflug; in einem geraden Tunnel (Boonta), in einer Höhlenkammer in einer Kurve (Frostspalt) und an einer Höhlen-Gabelung (Kristallschlucht). Verglichen wird unabhängig von der Physik: die Hülle so aufgestellt, wie das Modell gezeichnet wird (three.js-Hierarchie), gegen die Schale, wie das Mesh sie baut. **172 Fälle: 0,000 m im Gewölbe, 0,000 m darunter.**
  2. „every pod fits under every tunnel": 108 304 Fahr-Lagen auf allen 13 Strecken (Anheben-Taste gehalten, Nase hoch, beide Triebwerke voll angehoben, Cockpit hochgeschwungen, nach beiden Seiten geneigt, an beiden Wänden) – engste Stelle **1,53 m Luft** (Pagali Ironclad im Höhlen-Abzweig von Magma-Inferno, Pfad 2, Sample 21).
  3. „a pod that rides on its repulsors is never pressed down": in einem künstlich 5,5 m niedrigen Tunnel fährt jeder Pod exakt so hoch wie ohne Dach.
  4. „overheads": 84 Durchflüge unter einer Brücke und einem Bogen (künstlich aufgestellt, Maße wie im Spiel) in einer Höhe, in der die Oberkante 1,5 m im Bau wäre – jeder Pod wird heruntergeschlagen, kein Eckpunkt steht mehr als 0,18 m im Bau (Grenze 0,3 m: der Bau wird mitten im Schritt geprüft, die Nase schwenkt danach noch bis 0,2 m weiter).
- **Gegenprobe** (die alten Regeln unter den neuen Prüfungen, einmalig): 167 von 172 Decken-Fällen fallen durch (bis 4,60 m im Gewölbe), 77 von 84 Überkopf-Fällen (bis 1,67 m im Bau).
- **Simulation:** `npm run check` grün (13/13, 0 Ausfälle im 45-s-Lauf, Bodenfreiheit 0,68 m). Jede Strecke einzeln gegen den Commit davor (`TRACK=<id>`): **11 von 13 byte-gleich.** Anders sind Boonta (der absichtlich niedrige Test-Bau der CI schlägt die Pods jetzt um ihre echte Höhe herunter) und Heulerschlucht (ein Deckenkontakt: Dorn Manta, Pod 10, t = 25,42 s, Sample 1345, im Fallen 17,7 m über der Straße – die äußere Ecke der rechten Triebwerksseite in der Gewölbeflanke, 0,60 m, 2 Bilder, kein Schaden).
- **Deckenkontakte gezählt** (Endstand, einmalig mit einem Zähler in `physics.ts`, danach wieder entfernt; die Tabelle ist mit Zähler byte-gleich): im 45-s-Gesamtlauf **ein Pod** – Heulerschlucht, Dorn Manta kommt aus einem Sprung 27,2 m über der Straße in den Tunnel (Dach 30 m), anfangs 2,01 m im Gewölbe, 26 Bilder lang heruntergedrückt, kein Schaden. `GRIP=0.88`: keiner. `SECS=120`: keiner. **Fahrende Pods** wurden mitgezählt, obwohl die Regel sie in Ruhe lässt: in allen drei Läufen stand keiner im Gewölbe.
- `GRIP=0.88`: 13/13. `SECS=120`: 13/13, 0 „downward teleports". Im 120-s-Gesamtlauf fällt auf dem Henker-Sprint ein Pod aus (Commit davor: keiner). Allein gefahren (`SECS=120 TRACK=executioner`) sind beide Stände byte-gleich, ohne Ausfall: die Strecken eines Gesamtlaufs teilen sich eine Zufallsfolge, die geänderten Läufe auf Boonta und Heulerschlucht verschieben jedes Rennen danach.
- **Hülle gegen alle Ausstattungen** (einmalig, Wegwerf-Skript; Gegenprobe: ein um 10 cm angehobenes Modell wird mit 9,7 cm gemeldet): Spieler-Modell, alle 192 Teile-Kombinationen aller 14 Pods in allen drei Detailstufen (8 064 Modelle) – höchstens 1,7 cm außerhalb der Hülle (`aldo`, Detailstufe 2), in Detailstufe 3 überall 0. Gegner-Modelle, Triebwerksseiten, 64 Style-Kombinationen × 14 Pods × 2 Detailstufen (1 792 Modelle) – höchstens 1,7 cm (`aldo`).
- `npm run build`: 17 610 469 Bytes. Harness-Bundles neu gebaut.
- **Bilder** (Harness, Software-Rendering, Boonta-Kessel): Vrak Splitter-X gegen die Decke gedrückt – am Scheitel mit Nase hoch (21,91 m über der Straße, Dach 27 m) und neben der Wand, von der Seite und von vorn (11,31 m über der Straße, 23 m neben der Mitte: dort stoppt die äußere Triebwerksseite an der Gewölbeflanke). In allen drei Ansichten steht das Modell unter dem Fels, kein Teil ist im Fels zu sehen. Im ersten Bild berührt die Triebwerksspitze eine Stahlrippe des Tunnels (siehe „offen").
- **Smoke-Test auf dem Build** (`tools/harness/papp.mjs`, Quill Voltspire auf dem Frostspalt-Ring, Software-Rendering): bestanden („App smoke test passed."). Die reparierte Zeile lautet jetzt `rebind rollLeft → Q | stored: ["KeyQ"] ok` – vorher stand dort `undefined`.

**Test-Werkzeuge**
- `tools/ci` und `tools/harness` sind jetzt im Typecheck (`tsconfig.json` → `include`) – also Teil von `npm run check`. Die vier Typfehler in `unit.ts` sind behoben (`triCount` nimmt eine `THREE.BufferGeometry`), eine ungenutzte Konstante in `pods.ts` ist entfernt.
- `tools/harness/papp.mjs` schreibt und liest das Profil unter `podracer-profile-v2`; die Zeile „stored:" prüft jetzt wirklich, ob die neue Tastenbelegung gespeichert wurde, und lässt den Test sonst durchfallen.
- Harness (`tools/harness/game.ts`): Ansichten `top` (Spieler-Pod am Scheitel gegen die Decke gedrückt, Nase hoch), `topw` (neben der Wand, waagerecht, von der Tunnelmitte gesehen) und `topf` (wie `topw`, von vorn – beide Triebwerksseiten unter der Gewölbeflanke); Abfrage `pod=<id>` wählt den Pod. Beispiel: `node pshot.mjs <repo>/tools/harness/out/game.html "t0:top,t0:topw,t0:topf" /tmp/t/vault "?webgl&bright&pod=brute"` (≈ 2,5 Min. in Software).

**Was sich beim Fahren ändert**
- Fahren auf den Repulsoren: nichts.
- Fliegt ein Pod an die Decke, stoppt er, sobald sein erstes Teil die Schale berührt – mit Nase hoch also deutlich früher als bisher.
- Fliegt ein Pod in eine Brücke oder einen Bogen, wird er um seine echte Höhe heruntergeschlagen (bisher gingen beim höchsten Pod, Vrak Splitter-X, die oberen 2,7 m durch den Bau, mit Nase hoch mehr). Schaden und Tempoverlust je Treffer sind unverändert.

**Zeit:** `npm run check` braucht in der Sandbox jetzt 57 – 83 s (je nach Maschine): der Typecheck nimmt die Werkzeuge mit, das Pod-Audit misst die Hüllen (6 s), und auf derselben Maschine dauerten die Unit-Prüfungen 19 – 22 s statt 16 s, die Simulation 38 – 40 s statt 36 s.

**Nicht verifiziert / offen** (steht auch in `TODO.md`)
- **Nichts davon lief auf echter GPU.** Die drei Bilder sind Software-Rendering.
- **Die echten Überkopf-Bauten sind nicht durchflogen worden.** Startbrücke, Sponsor-Brücken, Tore und Bögen entstehen erst mit der Welt (`world.ts`, `props.ts`, `setPieces.ts`, `trackDetail.ts`) – die Simulation kennt nur den Test-Bau der CI auf Boonta. Geprüft ist die Regel an einer künstlichen Brücke und einem künstlichen Bogen (Unit-Prüfung 4).
- **Bögen** (Checkpoint-Bögen, Felsbögen, der einstürzende Bogen): gelesen an der Pod-Mitte, siehe Punkt 6. Für eine Prüfung Eckpunkt für Eckpunkt müssten ihre Kollisionsformen neu vermessen werden – das braucht den Blick auf echter GPU.
- **Fahrende Pods werden nie heruntergedrückt** (Punkt 5): im Messerflug direkt neben der Tunnelwand kann die obere Flügelspitze im Fels stehen.
- Die Hülle ist bewusst etwas größer als das Modell (einmalig gemessen): nahezu aufrecht im Mittel 0,12 m, höchstens 0,38 m; über alle Lagen im Mittel 0,29 m, höchstens 1,11 m. Der Pod stoppt entsprechend früher.
- Der Fels der Tunnelschale ist verrauscht (`world.ts`, `buildTunnel`): im oberen Gewölbe liegt er höchstens 0,35 m unter der gerechneten Schale und im Mittel darüber; in der unteren Hälfte der Flanken streut er um ± 0,65 m (Höhlen ± 1,3 m). So weit kann ein Teil im Fels stehen oder vor ihm stoppen.
- **Stahlrippen** der Tunnel (Rohrradius 0,38 m, Rohrmitte 0,15 m unter der Schale) ragen bis 0,53 m unter die gerechnete Schale, Portalrahmen bis 0,35 m: ein Teil, das an einer Rippe die Decke erreicht, steht so weit in der Rippe. Im Bild `top` zu sehen; bei Renntempo ist eine Rippe in weniger als einem Bild vorbei.
- Die Gewölbeschale wird bei 96 % der halben Breite gekappt (`VAULT_CLAMP`) – direkt am Wandfuß käme sie bis zur Straße herunter. An einer Gabelung zählt die höhere Schale: der Felskeil zwischen den zwei Röhren ist nicht nachgebildet.
- Die Portal-Regel (`p.upper`: aufs Deck oder in den Tunnel) entscheidet weiter mit Pod-Mitte + 1,2 m. Der eine Deckenkontakt der Simulation ist so ein Fall: der Pod kommt aus einem Sprung 27 m hoch in den Tunnel (Heulerschlucht), gilt als „im Tunnel" und wird unter die Decke gedrückt – wie Malastare, Sample 964 (`TODO.md`).
- Die Luftbrems-Klappen schwenken seitlich aus – das ist nicht in der Hülle (zählt nur, wenn der Pod gerollt ist).
- Das Gegner-Cockpit lässt sich mit dem Wegwerf-Skript nicht gegen die Hülle messen (sein Geometrie-Topf deckt einen anderen Bereich ab) – nicht geprüft.
- Entscheidung von früher, weiter offen: ein Pod zählt immer als seine größte Ausstattung.

## Stand: 2026-11-22 – Tunneldecke je Pod (Folge-Commit zum Merge)

*Zwischenstand – überholt durch den Abschnitt darüber: `POD_BOX` und `podHeight` sind durch die Hülle ersetzt, die Prüfungen neu geschrieben, die offenen Punkte am Ende dort erledigt oder neu eingeordnet.*

**Fehler:** Die Tunneldecke (`physics.ts`, Session 20 (Strecken)) hielt jeden Pod mit derselben Höhe draußen: 2,15 m über dem Pod-Ursprung. Am Modell gemessen sind viele Pods höher – Vrak Splitter-X 4,18 m (Haifinne), Pagali Ironclad 3,31 m, Quadra Lumber 3,27 m, Tenroc 6-Fach 2,96 m, Quill Voltspire 3,12 m (Cockpit-Spitze); mit dem Style-Teil „Haifinne" bis 3,95 m. Dazu hebt sich in Kurven das äußere Triebwerk (bis 1,95 m). Gegen die Decke gedrückt steckten solche Pods bis 3,5 m im Gewölbe.

**Lösung**
1. **`POD_BOX` in `podDesigns.ts`:** je Pod vier gemessene Zahlen – Oberkante der linken und der rechten Triebwerksseite, Oberkante des Cockpits, halbe Breite. Gemessen am Modell in seiner **größten Ausstattung** (Werk oder mit Teilen), nicht berechnet: der höchste Punkt ist ein Kabelmast, eine Lampe, eine Spitze oder eine Finne, die keine Formel kennt. Über `podEnvelope(def).box` erreichbar.
2. **`podHeight(env, liftL, liftR, roll)`** (`podDesigns.ts`): wie weit der Pod in seiner jetzigen Lage über seinen Ursprung reicht – das höhere von Cockpit und Triebwerksseiten (jede Seite mit ihrem momentanen Hub `engYL` / `engYR`), gedreht um die Messerflug-Rolle. Aufrecht ist das die gemessene Höhe, bei 90° die halbe Breite.
3. **`physics.ts`:** Grenze = Gewölbeschale − `podHeight(…)`. Sanftes Herunterdrücken (höchstens 45 m/s) und Schaden (`'top'`) sind unverändert.
4. **Pod-Audit** (`tools/ci/pods.ts`, neue Spalte `box`): misst jeden Pod neu (Werk + die drei Teile-Kombinationen) und schlägt fehl, wenn eine Zahl mehr als 2 cm zu klein oder 5 cm zu groß ist oder ein Pod keine Zeile hat. Die Meldung nennt die gemessene Zeile zum Übernehmen. Gegengeprüft (einmalig): die drei Kombinationen des Audits ergeben dieselbe Höhe und Breite wie alle 192 Kombinationen aus 4 Finnen × 4 Einlässen × 4 Düsen × 3 Tuning-Stufen.
5. **Zwei neue Unit-Prüfungen** (`tools/ci/unit.ts`, jetzt 71):
   - „pushed up against the vault": jeder Pod wird im Tunnel 2,5 s lang nach oben gedrückt – aufrecht (Scheitel, Flanke, linkes Triebwerk 1,5 m angehoben), in halber Rolle nach beiden Seiten und im Messerflug. Gemessen wird der höchste Punkt des Modells Eckpunkt für Eckpunkt. 84 Fälle: höchstens 0,007 m über der Schale. Mit der alten Regel: 38 Fälle im Gewölbe, 0,08 – 3,48 m.
   - „every pod fits under every tunnel": an jedem überdachten Sample aller 13 Strecken, von der Mittellinie bis zur Wand, liegt die Deckengrenze über der Höhe, in der ein Pod fährt (Anheben-Taste gehalten; aufrecht, Triebwerk voll angehoben, halbe Rolle, Messerflug). Engste Stelle: 0,50 m Luft (Tarn Cyclone im Messerflug auf Magma-Inferno, 22 m neben der Mittellinie bei 14 m halber Fahrbahnbreite, Decke 27 m).
6. **`tools/ci/sim.ts`:** der Deck-Selbsttest hebt Pod 1 in den letzten 2 s eines Laufs nicht mehr an. Erreichte der Pod den ersten Tunnel erst im letzten Augenblick, endete der Lauf vor den geforderten 20 Bildern auf dem Deck – ein Fehlalarm (so aufgetreten auf Mos Espa: 1 Bild, „FAIL").

**Entscheidung dabei (bitte prüfen):** ein Pod zählt immer so hoch wie seine größte Ausstattung. So ändern Teile nie das Fahrverhalten, und kein Teil steckt in der Decke. Preis: ein Pod ohne Finne wird etwas früher gebremst, als er hoch ist (Aurora XR-7 ab Werk: 0,70 m). Alternative: Höhe je montierter Ausstattung.

**Was sich beim Fahren ändert**
- Normales Fahren: nichts. Aufrecht bleiben auch an der Tunnelwand, mit gehaltener Anheben-Taste und voll angehobenem Triebwerk, mindestens 3,3 m Luft (einmalige Messung über alle Strecken).
- Fliegt ein hoher Pod an die Decke, stoppt er jetzt früher (Splitter-X: 2,03 m).
- Messerflug: die Grenze ist die halbe Breite statt „2,15 m + 95 % der halben Spannweite". Rechnerisch lag die alte Grenze für einen breiten Pod im Messerflug mit gehaltener Anheben-Taste stellenweise bis 1,2 m **unter** der Fahrhöhe (Magma, Dschungelfluss, Kristallschlucht – dort, wo die Wand weit neben der Fahrbahn steht; einmalige Messung). Das entfällt.

**Verifiziert**
- `npm run check`: grün in 41 s – Typecheck, 71 Unit-Prüfungen, Pod-Audit (14 Pods), Simulation 13/13 (0 NaN, 0,00 m Wanddurchdringung, Bodenfreiheit ≥ 0,67 m, 1 Ausfall auf dem Kristallschlucht-Sprint).
- Deckenkontakte in der Simulation (einmalig mitgezählt): im 45-s-Lauf genau **einer** – Malastare, Tenroc 6-Fach, Sample 964: der Pod kommt aus einem Sprung 20,8 m über der Straße in den Tunnel, seine Oberkante liegt 1,26 m über der Schale, er wird in 3 Bildern heruntergedrückt (kein Schaden, er fällt bereits). Mit `GRIP=0.88` und `SECS=120`: keiner.
- Vergleich mit dem Merge-Commit: jede Strecke einzeln (`TRACK=<id>`) byte-gleich, ebenso `GRIP=0.88` und `SECS=120` (0 „downward teleports"). Im Gesamtlauf sind die ersten 8 Zeilen gleich; ab Malastare weichen die Zahlen ab, weil alle Strecken einen Zufallsstrom teilen und der eine Deckenkontakt ihn verschiebt.
- Gegenprobe gegen `main` (`ROSTER_OLD=1 ARMOR=0 PARTS=0`): alle Tabellenzeilen gleich; es fehlt nur die Deck-Selbsttest-Zeile von Oovo IV (Punkt 6: der Pod erreicht den Tunnel dort in den letzten 2 s und wird nicht mehr angehoben).
- `npm run build`: 17 600 129 Bytes. Harness-Bundle `game.js` neu gebaut (19 743 706 Bytes), `pods.js` unverändert.
- `papp.mjs` auf diesem Build (Quill Voltspire auf dem Frostspalt-Ring, WebGL2 in Software): „App smoke test passed." – der Test fährt nicht an eine Tunneldecke, er zeigt nur, dass das Spiel weiter startet und läuft.
- Typprüfung von `tools/ci` und `tools/harness`: weiter nur die vier bekannten Fehler in `unit.ts`, keine neuen.

**Nicht verifiziert / offen** (steht auch in `TODO.md`)
- Im Browser nicht angesehen: kein Pod wurde im laufenden Spiel an eine Decke geflogen.
- Die Decke wird **über der Pod-Mitte** geprüft. An der Flanke fällt das Gewölbe nach außen ab (am Fahrbahnrand rechnerisch etwa 1,4 m je Meter) – die äußere Triebwerksseite kann dort weiter ins Gewölbe reichen. Nicken (Bug hoch) ist ebenfalls nicht eingerechnet.
- In halber Rolle ist die Grenze vorsichtig: der Pod stoppt 0,2 – 1,6 m unter der Decke (Ecke des Kastens um den Pod).
- **Überkopf-Bauten** (Sponsor-Brücken, Startportal, Bögen) rechnen weiter mit festen 1,5 m (`physics.ts`, `ext`). Nicht angefasst – nicht Teil des Auftrags.
- Die Portal-Regel (`p.upper`: aufs Deck oder in den Tunnel) entscheidet weiter mit Pod-Mitte + 1,2 m.

## Stand: 2026-11-22 – Merge von Session 20 (Strecken) und Session 20 (Pods)

Beide Sitzungen hießen „Session 20" und liefen gleichzeitig ab dem Commit `d7b9c4b`: die Strecken-Sitzung in `B` (per PR #1 in `main`), die Pod-Sitzung in `new_pods` (per PR #2 in `main`, gemergt am 2026-11-22). In der Doku heißen sie jetzt **Session 20 (Strecken)** und **Session 20 (Pods)** (Wunsch des Nutzers). Für PR #2 wurde `main` in `new_pods` gemergt; `main` selbst blieb unberührt.

### Konflikte und ihre Lösung
1. **`src/game/physics.ts`** (2 Stellen): beide Import-Zeilen bleiben. An der Tunneldecke gilt das sanfte Herunterdrücken der Strecken-Sitzung (höchstens 45 m/s, kein Versetzen) **und** der Schaden läuft über `applyDamage(p, 0, dmg, 'top')` der Pod-Sitzung.
2. **Die fünf Doku-Dateien** (8 Stellen): beide Session-20-Blöcke stehen untereinander; „Nächster Schritt", „Git-Stand", die Regeln in `CLAUDE.md` und die Beschreibung von `npm run check` sind zusammengeführt. Der Abschnitt „Direkt aus Session 19" in `TODO.md` entfällt – seine drei Punkte sind in Session 20 (Strecken) erledigt oder übernommen.
3. **`tools/harness/out/game.js`** (16 Stellen) und `pods.js`: nicht gemischt, sondern aus dem zusammengeführten Quelltext neu gebaut (`cd tools/harness && npx esbuild <name>.ts --bundle --format=esm --loader:.jpg=dataurl --outfile=out/<name>.js`).
4. **Ohne Konflikt von Git gemischt** und durchgesehen: `Game.ts` (Untergrund-Zeile im HUD, Staubfahne je Untergrund und Textur-Epoche aus der Strecken-Sitzung neben wechselndem Startfeld, Bruchteilen, Treffermarken und Trümmern aus der Pod-Sitzung), `data.ts` (Licht auf Oovo IV neben den Pod-Daten), `RaceView.tsx` (Untergrund-Zeile neben den Bruchteil-Lampen). Schaden zieht im zusammengeführten Stand nur `applyDamage` ab (`hpL` / `hpR`; geprüft mit `grep`); die direkte Abzugsstelle, die `main` an der Tunneldecke hatte, ist umgestellt.

### Verifiziert (zusammengeführter Stand)
- `npm run check` (38 s): Typecheck, 69 Unit-Prüfungen, Pod-Audit (14 Pods), Simulation 13/13 Strecken – 0 NaN, 0,00 m Wanddurchdringung, Bodenfreiheit ≥ 0,67 m, 1 Ausfall (Kristallschlucht-Sprint; erlaubt 3).
- `GRIP=0.88 node tools/ci/out/sim.mjs`: 13/13 (2 Ausfälle auf dem Kristallschlucht-Sprint).
- **Gegenprobe Fahrphysik:** `ROSTER_OLD=1 ARMOR=0 PARTS=0 node tools/ci/out/sim.mjs` gibt byte-gleich dieselbe Ausgabe wie die Simulation von `main` vor dem Merge (`diff` leer). Die Strecken-Physik (Untergründe, Tunneldecke, Seen) fährt für die alten Pods also unverändert; die Unterschiede der normalen Tabelle kommen vom wandernden Startfeld und vom Schadensmodell.
- `SECS=120 node tools/ci/out/sim.mjs`: 13/13, auf allen 10 Strecken mit Tunneldeck „downward teleports: 0".
- `npm run build`: `dist/index.html` 17 599 346 Bytes (`main` vorher 17 505 684).
- `papp.mjs` auf genau diesem Build (Quill Voltspire auf dem Frostspalt-Ring, 5 Gegner, WebGL2 in Software, 20 FPS): „App smoke test passed." – HUD-Seiten, Pause-Audio, Grafik-Menü, Umbelegen (Q), Gamepad (L3). Im Bildschirmfoto stehen die Untergrund-Zeile („Rennpiste", Strecken-Sitzung) und die Bruchteil-Lampen in den Schadensfeldern (Pod-Sitzung) nebeneinander.

### Aufgefallen beim Merge
- **Tunneldecke rechnete fest mit 2,15 m Pod-Höhe** (Session 20 (Strecken)). Vier alte Pods ragen höher auf (Vrak Splitter-X 4,18 m), die höheren Cockpits und Anbauteile aus Session 20 (Pods) ebenfalls → behoben im Folge-Commit, Abschnitt „Tunneldecke je Pod" oben.
- `tools/harness/papp.mjs` schreibt und liest noch den Profil-Schlüssel `podracer-profile-v1`. Das Profil kommt an (v1 wird einmal importiert), aber die Zeile „stored:" liest nach dem Umbelegen den alten Schlüssel und gibt `undefined` aus – die Prüfung „Belegung gespeichert" greift so nicht (→ `TODO.md`).
- `tools/` ist nicht Teil des Typechecks (`tsconfig.json` → `include: ["src", "vite.config.ts"]`). Mit `tools/ci/*.ts` und `tools/harness/*.ts` geprüft (ohne die Regeln für ungenutzte Namen): 4 Typfehler in `tools/ci/unit.ts` (`BufferGeometry` als Parameter des Zählhelfers `triCount`), sonst keine – auch keine durch den Merge; auf `new_pods` allein dieselben vier. Die Prüfungen laufen (esbuild prüft keine Typen).
- Beim Langlauf `SECS=120` sind `avgSpeed` und `slowest` auf den sechs Sprint-Strecken gleich und niedrig (z. B. 74 m/s): alle Pods erreichen dort vor Ablauf das Ziel, danach wächst der Fortschritt nicht mehr. Kein Fahrfehler; auf `new_pods` allein genauso. Für Tempo-Aussagen auf Sprints taugt nur der 45-s-Lauf.

---

## Stand: 2026-11-21 – Session 20 (Pods), alle Phasen fertig – Pod-Überholung: Cockpits, Details, 4 neue Pods, Tuning-Optik, Schadensmodelle

### Auftrag und abgestimmte Entscheidungen
1. **Umfang (nur Pods):** alle 10 Cockpits individuell neu, mehr Details, 4 neue Pods (Halo, Manta, Voltspire, Cyclone – eigene Entwürfe und Namen), Tuning mit sichtbaren Teilen, eigenes Schadensmodell je Racer.
2. **Tuning:** die 7 Tuning-Werte werden als **Tuning-Teile** sichtbar, dazu frei wählbare **Style-Teile** (Finnen, Einlass, Düse, Kanzel). Alles frei, kein Shop, kein Ausblend-Schalter.
3. **Schaden:** Optik + Fahrverhalten, mild (5–10 % je verlorenem Bruchteil, höchstens −15 % je Wert). Bruchteile brechen bei 50 / 35 / 20 % Triebwerkszustand und bleiben bis zum Respawn weg. Explosionsregel unverändert. **Treffermarken** statt echter Dellen.
4. **Ziel-Hardware:** Gaming-PC des Nutzers (Core i9 + RTX 4090) → **maximale Details auf „Ultra"**, nahe Gegner auf Ultra mit vollen Details. Dieses Notebook (Latitude 5590, Intel UHD 620) ist nur Entwicklungsrechner und kann Ultra-Bildraten nicht belegen.
5. **Sonstiges:** Kamera „Cockpit" zeigt künftig das eigene Cockpit von innen („Motorhaube" bleibt die freie Sicht) · max. 10 Gegner bleiben · alte Pods behalten Größe, Werte und Fahrverhalten · Begriffe in `CONTEXT.md`, Entscheidungen in `docs/adr/`.

### Phasen
| # | Inhalt | Stand |
|---|---|---|
| 0 | Setup + Sicherheitsnetz | ✅ erledigt |
| 1 | Refactoring ohne Spieländerung: Layout-Registry (`podLayouts.ts`), `engineExtent`, `podCockpits.ts`, `applyDamage` + Wirkungs-Struct, Profil v2 | ✅ erledigt |
| 2 | 10 neue Cockpits + Detailpass + Cockpit-Innenansicht → **Stopp: Nutzer sichtet** | ✅ erledigt, Nachbesserung „Cockpits weiter oben" eingearbeitet, vom Nutzer freigegeben („Go Phase 3") |
| 3 | 4 neue Pods (Cyclone → Halo → Manta → Voltspire), Hangar-Liste für 14, Gegner-Auslosung → **Stopp** | ✅ erledigt, vom Nutzer freigegeben („Go Phase 4"), Nachbesserung „Quill geschlossener" eingearbeitet |
| 4 | Tuning-Optik: `PodCustom.kit`, `podKitParts.ts`, Hangar-Reiter „Lack \| Teile" | ✅ erledigt |
| 5 | Schaden – Fahrverhalten: `podDamage.ts`, Bruchteil-Maske, HUD-Lampen | ✅ erledigt |
| 6 | Schaden – Optik Spieler: Bruchteile, Treffermarken, Trümmer, Hangar-Schadensvorschau | ✅ erledigt (fehlende Teile auch schon bei Gegnern) |
| 7 | Schaden – Optik Gegner: `userData`-Ruß/Flammenleistung in den geteilten Materialien | ✅ erledigt |

### Erledigt in Phase 0
1. **Node.js 26.13.1** per winget installiert (war auf dem Rechner nicht vorhanden), `npm ci`. Bereits laufende Shells kennen den neuen PATH nicht → `C:\Program Files\nodejs` voranstellen.
2. **Sichtprüfung unter Windows:** `.claude/launch.json` mit `podracer-dev` (Vite, Port 5173) und `podracer-shots` (`tools/harness/shot-server.mjs`, Port 5174, schreibt Bilder nach `tools/harness/out/`). Der Pod-Harness läuft ohne Bundle über Vite: `tools/harness/pods.dev.html`. WebGPU funktioniert im In-App-Browser.
3. **Harness (`tools/harness/pods.ts`):** `show(idx, hp, quality, { rival, save })`, `sheet('pod' | 'front' | 'rear' | 'side' | 'inside', { rival, quality, health, save })` (ein Feld je Pod, passt sich der Pod-Anzahl an), `stats()` / `statsAll()` (Mesh- und Dreieckszahlen des echten Modells).
4. **`src/game/podAssembly.ts` (neu):** materialfreie Montage eines Pods (Triebwerksbänke, Cockpit, Kabel, Binder, Fern-LOD, Vertex-Farben für Gegner). `podModel.ts` erzeugt daraus nur noch Meshes, Materialien und Animation. Ein nicht zusammenführbarer Bucket wirft jetzt einen Fehler (vorher: stillschweigend weggelassen).
5. **Pod-Audit `tools/ci/pods.ts` (neu, Teil von `npm run check`, 1 s):** baut alle Pods ohne Browser und prüft Mesh-/Dreieckszahlen gegen `tools/ci/pods-baseline.json`, Attribute/NaN/Indexbereich sowie das Sichtmodell gegen Kollisions- und Bodenform.
6. **Doku:** `CONTEXT.md` (Glossar), `docs/adr/0001-bruchteile-follow-health-steps.md`, `docs/adr/0002-ultra-targets-a-gaming-pc.md`.

### Verifiziert (Phase 0)
- `npm run check` vorher/nachher: Sim-Ausgabe **zeilengleich** (56 Zeilen, 13/13 Strecken, 0 Tode); Pod-Audit 10/10.
- Browser (WebGPU): `statsAll()` nach dem Umbau identisch zu den Goldwerten; vier Vorher/Nachher-Bögen (Spieler/Gegner, ganz/Cockpit) **bytegleich**.
- `npm run build` → `dist/index.html` (2,81 MB).

### Erledigt in Phase 1 (Refactoring, kein verändertes Fahrverhalten, kein verändertes Bild)
1. **`src/game/podLayouts.ts` (neu):** ein Eintrag je Pod-ID in `LAYOUTS`; eine unbekannte ID wirft einen Fehler (vorher wurde stillschweigend der Mandrel Ram gebaut). Neue Layout-Felder ersetzen alle fest verdrahteten Pod-IDs: `engineExtras` / `cockpitExtras`, `extraCircles`, `envelope`, `binders: { a, b, zOff }[]`, `cockpit.design`, `cockpit.topY`.
2. **`src/game/podCockpits.ts` (neu):** Cockpit- und Pilotengeometrie (unverändert verschoben). Der Kopf hängt an `PilotDef.head` (`goggles | snout | crest | aero | dome`), nicht mehr am Spezies-Namen.
3. **`engineExtent(spec)` in `podParts.ts`:** eine Quelle für Kollisionsradius, Bodenklemme (unten/außen) und Kabelhöhe; `EngineGeo` kennt `binder` (Ankerpunkt) und `breakParts` (noch leer).
4. **`podDesigns.ts`** enthält nur noch `podCollision` / `podEnvelope` (neu: `axisY`, `cockpit.topY`, `length`). Die Alt-Felder `engine`, `engineLen`, `engineRad`, `spread`, `cable`, `cockpit` in `PodDef` sind entfernt; Positionslichter, Hangar-Kamera und Harness lesen das Layout.
5. **Schaden:** einzige Stelle für Zustandsverlust ist `applyDamage(p, side | 'both', amount, zone)` (Zonen `front | side | top | belly | heat`); Fahrwirkungen verlorener Teile laufen über `PodState.fx` (noch überall 1). `collidePods` liest die Breite direkt aus der gecachten Kollisionsform.
6. **Spielstand:** Schlüssel `podracer-profile-v2` mit einmaligem Import des v1-Stands; `sanitizeCustom` (Farben, Tuning 0–5, Muster, Finish), unbekannte Pod-ID → erster Pod, `MAX_OPPONENTS`.
7. **Tests:** `tools/ci/unit.ts` (17 Prüfungen: Layout-Registry, `applyDamage`, `podParams`, Profil) und `tools/ci/pods-shapes.json` (Kollisionskreise + Bodenform aller Pods als Goldwerte) – beides Teil von `npm run check`.

### Verifiziert (Phase 1)
- `npm run check`: Typecheck, 17/17 Unit-Prüfungen, Pod-Audit 10/10 (Zahlen und Physikformen identisch), **Sim-Ausgabe zeilengleich zur Ausgangslage**.
- Browser (WebGPU): `statsAll()` identisch zu den Goldwerten, vier Bögen **bytegleich** zu den Vorher-Bildern.
- Echte App im In-App-Browser: v1-Spielstand wird importiert (Pod, Farben, Tuning – Wert 9 auf 5 begrenzt), v1 bleibt unangetastet; Hangar ohne Schrumpfen/Scrollen; Rennen Boonta bei Nacht mit 10 Gegnern 28 Rennsekunden per Hand getaktet: 0 Fehler, 0 NaN, Treffer landen auf der richtigen Seite.
- Bekannt: bei verdecktem Browser-Bereich läuft `requestAnimationFrame` nicht – das Rennen bleibt im Countdown, bis man die Schleife von Hand taktet (siehe `CLAUDE.md`).

### Erledigt in Phase 2 (10 Cockpits, Details, Innenansicht)
1. **`podCockpits.ts` neu aufgebaut:** Bausatz (`shell`, `seat`, `pilot`, `levers`, `dash`, `windscreen`, `anchors`, `belly`, `part`) + **ein eigener Entwurf je Pod** (`DESIGNS`; Beschreibung in `DESIGN.md`). Bruchteile sind bereits als eigene Teilesätze angelegt (`part(…)`: Kreisel, Sonde, Finne, Schwingen, Rammbug, Radiatoren, Panzerplatten …), werden aber bis Phase 6 mit dem Cockpit zusammengeführt.
2. **Cockpit-Innenansicht:** Kamera „Cockpit" sitzt im Kopf des Piloten (`PodVisual.setCockpitView`, `eyeWorld`). Technik siehe `docs/adr/0003`: Cockpit wird um den Augpunkt vergrößert (1,4–3,2×), Pilot per Draw-Range ausgeblendet, Near-Plane bleibt 0,8 m. Drei Warnlampen (Boost, Hitze, Schaden) auf jedem Armaturenbrett.
3. **Triebwerks-Detailpass (`podParts.ts`, ab `seg ≥ 24`):** Einspritzring, Verteilerkästen mit Leitung zum Pylon, Leitbleche, Griffbügel, Bremsklappen-Stempel; auf „Ultra" zusätzlich Ableiter und Bolzenringe.
4. **Eigener Anbausatz je Pod (`podLayouts.ts → engineExtras`):** z. B. Flügel-Endkappen (Aurora), Ansaugdorne + Kufenplatte (Splitter-X), Verteilerrohre (Tenroc), Kreuzverstrebung + Blitzdorne (Quadra), Canards + Staurohr (Needle), Fühler + Kufen (Vespa), Kühlschleife + Tank (Fireflare), Panzerschürzen (Ironclad), Schwanzfedern (Starling), Rammringe (Ram). Gegner-Anbauteile schwingen jetzt mit den Triebwerken mit.
5. **Detailstufen:** Gegner unter „Ultra" mit leichtem Cockpit/Piloten; auf „Ultra" 28 statt 18 Segmente und volle Details. Fern-LOD mit Cockpit-Grundform und allen Blitzen.
6. **Piloten:** `PilotDef.skin` + `skinMaterial`, Kragenring, Schulterpolster, Brustgerät.

### Nachbesserung aus der Sichtung: Cockpits weiter oben (Nutzerwunsch 2026-11-21, „positionier die cockpit weiter oben")
1. **Was:** alle 10 Cockpits sitzen 0,6–1,05 m höher. Vorher hing die Gondel auf Höhe der Triebwerksachse (mitten im Abgasstrahl, Triebwerke verdeckten in der Cockpit-Kamera den Horizont). Jetzt gilt für jeden Pod: **Wannenboden nicht unter der Achse der unteren Triebwerke, Augpunkt mindestens 0,25 m über deren Oberkante** (Unit-Prüfung „cockpit height").
2. **Wie (`podLayouts.ts`):** `...raised(y, up)` im Cockpit-Eintrag = sichtbare Höhe `y + up` **und** `keel: up`. `keel` wirkt nur auf die Bodenklemme (`podEnvelope().cockpit.minY` = Wannenboden − `keel`): die Physik rechnet weiter mit der alten Höhe → **Fahrverhalten, `pods-shapes.json` und Sim-Tabelle unverändert** (Entscheidung „alte Pods: nur Optik"). Kabel, Augpunkt, Warnblitz (`topY`), Fern-LOD und Gegner folgen der sichtbaren Höhe von selbst. Neue Pods (Phase 3) lassen `keel` weg.
3. **Anhebung je Pod (m):** Aurora 0,90 · Splitter-X 1,00 · Tenroc 0,80 · Quadra 0,65 · Needle 0,80 · Vespa 0,85 · Fireflare 0,90 · Ironclad 0,60 · Starling 0,80 · Ram 1,05. Mehr oder weniger: nur die zweite Zahl in `raised(…)` ändern (die Unit-Prüfung nennt die Untergrenze).
4. **Harness:** zwei neue Bogen-Ansichten – `sheet('chase')` (Verfolgerkamera des Spiels) und `sheet('profile')` (ganzer Pod exakt von der Seite, je Pod eine flache Zelle).
5. **Gesichtet:** Vorher/Nachher `p2_hoeher_profil.jpg`, `p2_hoeher_innen.jpg`, `p2_hoeher_verfolger.jpg` (alle 10, Spieler; Gegner in `p2c_profile_gegner.jpg`); echtes Rennen Boonta (Fireflare) Verfolger + Cockpit + **90°-Rolle**, Dschungel im **Gewitter** (Aurora) Cockpit + Verfolger, Hangar-Vorschau – alles ohne neue Konsolenfehler.
6. **Erkenntnisse zur Testmethode (verdeckter Browser-Bereich):** (a) die Schleife nie mit einem künstlichen Zeitstempel weit vor der echten Uhr stehen lassen – der nächste echte Frame bekommt sonst ein **negatives `dt`** (`Game.loop` begrenzt nur nach oben; im Browser sind rAF-Zeitstempel monoton, deshalb kein Spielfehler); nach dem Takten `g.lastT = performance.now()` setzen. (b) **nicht pauschal alle `requestAnimationFrame`-Handles abbrechen:** three.js zählt seine Frames in einer eigenen rAF-Schleife (`nodeFrame`); ohne sie bleiben die Kamera-Uniforms stehen und das Bild friert ein. (c) `canvas.toBlob` liefert bei getakteten Frames ein altes Bild – Screenshot-Werkzeug des Browsers benutzen. (d) Den eigenen Pod lenkt die KI: `g.readInput = () => { p.ai = {…}; aiInputs(p, g.td, g.pods, g.raceTime, null); p.ai = null; }` (`aiInputs` per `await import('/src/game/physics.ts')`).

### Verifiziert (Phase 2)
- Nach der Nachbesserung: `npm run check` grün – 23/23 Unit-Prüfungen, Pod-Audit 10/10 (Mesh-/Dreieckszahlen und Physikformen unverändert), **Sim-Tabelle zeilengleich** zum Stand vor der Anhebung; `npm run build` ok (2,84 MB).
- `npm run check`: 21/21 Unit-Prüfungen (u. a. „kein Cockpit doppelt", „Pilot ist eigener Teilesatz", „drei Lampen", „leichtes Cockpit < 4 600 Dreiecke"), Pod-Audit 10/10 inkl. Budgets, **Physikformen unverändert, Sim-Ausgabe zeilengleich zur Ausgangslage** (alte Pods fahren exakt wie vorher).
- Browser (WebGPU): `statsAll()` = Audit-Zahlen; Bögen `tools/harness/out/p2_{front,rear,side,inside,pod,front_gegner}.jpg` gesichtet; echtes Rennen mit Kamera „Cockpit" (Fireflare, Boonta) per Hand getaktet: 0 Fehler, Bild `p2_race_cockpit.jpg`.

### Messwerte nach Phase 2 (Meshes / Dreiecke; in Klammern die Veränderung gegenüber vorher)
| Pod | Spieler „Hoch" | Spieler „Ultra" | Gegner nah (unter Ultra) | Gegner nah (Ultra) | fern |
|---|---|---|---|---|---|
| Aurora XR-7 | 41 / 42 334 (+7 %) | 41 / 57 170 | 30 / 14 612 (−34 %) | 31 / 40 576 | 3 / 444 |
| Vrak Splitter-X | 39 / 41 210 (+3 %) | 39 / 55 462 | 28 / 16 052 (−30 %) | 29 / 39 452 | 3 / 492 |
| Tenroc 6-Fach | 64 / 89 698 (+8 %) | 64 / 119 050 | 29 / 33 016 (−16 %) | 30 / 84 484 | 3 / 884 |
| Quadra Lumber | 51 / 68 276 (+4 %) | 51 / 89 280 | 27 / 25 018 (−21 %) | 29 / 64 790 | 3 / 536 |
| Hollo Needle | 38 / 36 314 (+2 %) | 38 / 50 754 | 27 / 12 944 (−36 %) | 28 / 34 556 | 3 / 456 |
| Tyr Vespa | 40 / 34 454 (−1 %) | 40 / 43 710 | 28 / 12 424 (−36 %) | 30 / 32 696 | 3 / 444 |
| Beerak Fireflare | 39 / 42 914 (+10 %) | 39 / 57 662 | 28 / 14 688 (−30 %) | 29 / 41 156 | 3 / 444 |
| Pagali Ironclad | 51 / 62 022 (+1 %) | 51 / 80 194 | 28 / 23 952 (−23 %) | 29 / 58 536 | 3 / 528 |
| Mak Starling | 39 / 37 670 (+3 %) | 39 / 51 878 | 28 / 12 940 (−38 %) | 29 / 35 912 | 3 / 456 |
| Mandrel Ram | 41 / 39 670 (+5 %) | 41 / 52 638 | 30 / 14 660 (−30 %) | 31 / 37 912 | 3 / 492 |

### Nicht verifiziert (Phase 2)
- **Bildrate auf „Ultra"** (Gegner jetzt 33–84 Tsd. Dreiecke je nahem Pod) – bitte am Gaming-PC prüfen.
- Innenansicht **in Tunneln** nicht gesichtet (Regen/Gewitter und 90°-Rolle inzwischen gesichtet, siehe Nachbesserung; Regenstreifen und Linsentropfen liegen sichtbar über dem Bild, das Armaturenbrett bleibt lesbar).
- Innenansicht aller 10 Pods nur im Harness (Standbild), im Rennen nur Fireflare und Aurora.
- Ob die **Höhe der Cockpits** dem Nutzer so passt (Geschmack) – er entscheidet anhand der Vorher/Nachher-Bilder.

### Erledigt in Phase 3 (vier neue Pods)
1. **Neue Triebwerks-Bauer in `src/game/podEngines.ts`** (eigene Datei, der runde Turbinen-Bauer in `podParts.ts` blieb unangetastet → die zehn alten Pods können sich nicht verschieben). Vier Stile mit demselben `EngineGeo`-Vertrag, eingehängt über `OWN_ENGINES` / `OWN_EXTENTS`:
   - `rotor` (Tarn Cyclone): kurzer dicker Rumpf, offener 5-Blatt-Rotor (eigenes drehendes Mesh, `fanMat: 'steel'`, `fanSpin: 0.36`, `openRotor`), Schutzring mit Profilquerschnitt auf vier Streben, Auspuffstutzen.
   - `hoop` (Lyss Halo-9): schlanker Kern mit Einlass + Fan, Ringflügel (Radius 3,4 × Kernradius) mit Lichtbändern auf drei Streben, Luftbremsen und Blitz-Koppler sitzen am Ring.
   - `slab` (Dorn Manta): geloftete flache Platte, Briefschlitz-Einlass mit kleiner Stauturbine, Schlitzdüse mit eigenen Lippenklappen (`slotPetals`) und flach skalierter Flamme, Doppelleitwerk – die Ruder sind die Luftbremsen.
   - `cage` (Quill Voltspire): Gitterkäfig (5 Spanten, 6 Längsholme, Diagonalen), Plasmaspule mit Kupferwicklungen und Trommeln, drehender Kupferanker (`fanMat: 'copper'`), drei Elektroden je Flanke.
2. **`EngineGeo` erweitert:** `fanMat`, `fanSpin`, `openRotor`. Gegner zeigen offene Rotoren als eigenes drehendes Mesh (`RivalBank.rotors`, geteiltes Material – keine neue Pipeline); geschlossene Fans bleiben in den statischen Teilen.
3. **Energieblitze je Triebwerkspaar zusammengefasst** (`binderGroups` / `mergeBinders` in `podAssembly.ts`): die drei Bögen der Voltspire sind ein Mesh (Spieler und Gegner), das X der Quadra Lumber bleibt zwei Meshes (verschiedene Paare) – deren Zahlen sind unverändert.
4. **Layouts, Cockpits, Piloten:** vier Einträge in `LAYOUTS` (ohne `keel`: ehrliche Bodenklemme), vier Entwürfe in `DESIGNS` (`cyclone`, `halo`, `manta`, `volt`), vier Kopfvarianten (`maul`, `veil`, `horn`, `optic`), vier Piloten und Pods in `data.ts`. Namen und Entwürfe sind eigene (keine Film- oder Spielvorlagen).
5. **Fern-LOD:** Sonderformen je Stil (Ring um `rotor` / `hoop`, flache Kiste für `slab`), neue Cockpit-Marke `far: 'ring'`.
6. **Wer fährt:** `src/game/roster.ts → pickRivals` lost die Gegner für jedes Rennen neu aus den 13 anderen Pods (höchstens 10, nie doppelt). `tools/ci/roster.ts → ciRoster`: das CI-Feld (11 Pods) wandert je Strecke um drei Pods weiter; `ROSTER_OLD=1` fährt das alte Feld.
7. **Hangar:** Pod-Liste einzeilig (Pod-Name links, Vorname des Piloten rechts) – 14 Zeilen passen ohne Verkleinerung.
8. **Nebenbei behoben:** Stachel der Tyr Vespa war von innen nach außen gewickelt (Drehprofil lief Richtung −z); Harness-Bögen können das Fern-Modell zeigen (`far: true`).

### Nachbesserung aus der Sichtung (Phase 3): Quill Voltspire geschlossener und komplexer (Nutzer 2026-11-21: „zu offen (Gitterstruktur), etwas komplexer")
1. **Triebwerk (`cageEngine` in `podEngines.ts`, neu aufgebaut):** vorn und hinten geschlossene Verkleidungen (Triebwerks-Lackierung), dazwischen nur noch ein Fenster (33–67 % der Länge) auf die Plasmaspule: vier Kastenholme (Sekundärfarbe), drei Spanten, Längsholme, gekreuzte Diagonalen; darin dreht ein Käfigläufer (`fan`, Kupfer) um die Wicklungen. Dazu Kühlrippenring, vier Kondensatorkästen, Kabelstränge, Ansaugkanal, Rücken- und Bauchabdeckung. Größe, Elektroden und Blitz-Anker unverändert → Physikform und Sim unverändert.
2. **Cockpit (`volt` in `podCockpits.ts`):** unten geschlossene Schale, darüber Glaskugel im Reifenkäfig, Rücken beplankt und gerippt, Gerätepaket hinter dem Sitz. Die beiden vorderen Reifen bleiben links und rechts der Blickmitte.
3. **Prüfung:** neue Unit-Prüfung „Voltspire: … Außenhaut deckt mindestens 65 % der Tonne" (vorher 49 %). Neue Zahlen: Spieler 39 / 44 090 („Hoch"), 39 / 58 782 („Ultra"), Gegner nah 25 / 18 944 bzw. 29 / 42 332. Bilder `tools/harness/out/p3b_volt*.jpg`.

### Verifiziert (Phase 3)
- `npm run check` grün: 34/34 Unit-Prüfungen (neu u. a. „vier neue Racer mit eigenem Piloten", „Grenzen 1,9 m / 4,6 m / 1,85 m", „keine `keel`", „Cyclone-Rotoren drehen bei Gegnern", „drei Bögen = ein Mesh, 2,5 m hinter der Front", „Quadra behält ihr X", „Gegner-Auslosung", „CI-Feld"), Pod-Audit 14/14, Sim 13/13 (0 Ausfälle, kein NaN, Bodenfreiheit ≥ 0,67 m).
- **`ROSTER_OLD=1`: Sim-Tabelle zeilengleich zu Phase 2** → die zehn alten Pods fahren exakt wie vorher. Mesh-/Dreieckszahlen und Physikformen der zehn alten Pods unverändert (nur vier Zeilen dazu).
- Langlauf `SECS=120` mit dem neuen Feld: alle 13 Strecken „ok".
- Browser (WebGPU): `show()` aller vier Pods (Spieler + Gegner), Bögen `inside`, `profile`, `chase`, `front`, `pod` (Spieler, Gegner, Fern-Modell) für alle 14; Hangar bei 1280 × 720: 14 Zeilen à 28 px, `data-fit-shrunk = 0`, kein Scrollbalken; zwei echte Rennen per Hand getaktet – Boonta mit dem Cyclone (Gegner u. a. Voltspire), Aquilaris im Regen mit der Voltspire (Gegner u. a. Manta, Halo, Cyclone), jeweils Verfolger + Cockpit-Kamera, keine neuen Konsolenfehler.

### Messwerte Phase 3 (Meshes / Dreiecke)
| Pod | Spieler „Niedrig" | Spieler „Hoch" | Spieler „Ultra" | Gegner nah (unter Ultra) | Gegner nah (Ultra) | fern |
|---|---|---|---|---|---|---|
| Tarn Cyclone | 41 / 22 854 | 41 / 35 174 | 41 / 46 578 | 32 / 12 032 | 33 / 33 416 | 3 / 648 |
| Lyss Halo-9 | 39 / 23 462 | 39 / 32 538 | 39 / 45 062 | 28 / 12 724 | 29 / 30 780 | 3 / 732 |
| Dorn Manta | 38 / 16 254 | 38 / 21 554 | 38 / 27 042 | 27 / 8 140 | 28 / 19 796 | 3 / 748 |
| Quill Voltspire | 36 / 26 748 | 36 / 37 232 | 36 / 50 192 | 24 / 16 334 | 26 / 35 474 | 3 / 508 |

Budgets für neue Pods: Spieler „Hoch" ≤ 70 Tsd., Gegner nah ≤ 26 Tsd., Ultra ≤ 250 Tsd. / 100 Tsd., fern ≤ 1,1 Tsd. – alle weit darunter.

### Nicht verifiziert (Phase 3)
- **Bildrate auf „Ultra"** mit den neuen Pods – am Gaming-PC prüfen.
- Balance der vier neuen Pods (Werte in `data.ts`) nur über die KI-Sim, nicht von Hand gefahren.
- Cockpit-Kamera der Manta und des Halo nur im Harness (Standbild), im Rennen Cyclone und Voltspire.
- Der im Plan genannte „Schatten-Stellvertreter" für dünne Teile wurde nicht gebaut (es gab ihn auch in Phase 2 nicht): dünne Teile werfen Schatten wie bisher nach Material. Bei flimmernden Käfig-Schatten nachziehen.
- Langlauf `SECS=120` einzeln mit dem **alten** Feld: Malastare und Crystal melden je einen „downward teleport" nach dem Zieleinlauf – betrifft nur alte Pods und unveränderte Physik, also schon vor Phase 3 vorhanden; im Standardlauf (45 s) tritt es nicht auf.

### Erledigt in Phase 4 (Tuning-Optik)
1. **Zwei Arten sichtbarer Teile** (`src/game/podKitParts.ts`, neu – nur Geometrie, läuft auch im Node-Audit):
   - **Tuning-Teile** folgen den 7 Tuning-Werten in drei Stufen (`tuneTiers`): Stufe 0–1 nichts, 2–3 das kleine Teil, 4–5 das große.
   - **Style-Teile** sind frei wählbar in vier Steckplätzen (`PodCustom.kit`, 0 = Werk): Finnen, Einlass, Düse, Kanzel.
2. **Anbau über Ankerpunkte:** jeder Triebwerks-Bauer liefert `EngineGeo.hard` (`HardPoints`: Düse, Einlass, Dorn, Rumpf, Rücken, Heck, `sideMax` / `bottomMax`). Die Teile werden nur angesetzt, nie ausgetauscht – Werk-Geometrie, Goldwerte und Physikformen bleiben unverändert. Die flache Manta hat eigene Varianten (`slot`).
3. **Tuning-Teile:** Höchstgeschw. = Düsenkragen → Nachbrennerring mit Kühlrippen + Glühring · Beschleunigung = 4 Stauhutzen → + 2 Kompressorhutzen mit Kupferleitung · Kühlung = Kühlrippenring → + Radiatorplatten mit Kühlmittelleitung · Wendigkeit = 2 Canards → + 4 Steuerflächen mit Stellstangen · Traktion = langer Bauch-Repulsor mit Kufen → + Ausleger-Pads · Luftbremse = Klappen +25 % → + zweites, weiter öffnendes Klappenblatt (`FlapGeo.gain`) · Reparatur = Panzer-Doppler → + Reparatureinheit am Kabelpylon.
4. **Style-Teile:** Finnen = Haifinne · Doppel-Leitwerk · Pfeilflügel; Einlass = Gitter · Langer Dorn · Irisblende (acht verdrehte Metall-Lamellen); Düse = Lang · Schubvektor-Paddel · Zackenkrone; Kanzel = klar · Rauch · Bernstein · Spiegel (`canopyGlass(tint)` in `podMaterials.ts`: vier geteilte Glasmaterialien).
5. **Durchleitung:** `buildPodModel(…, opts: PodLook)` mit `kit` + `tune`; `assembleHero` / `assembleRival(…, kit)`. Spieler: Style-Teile + Tuning-Teile aus dem Profil. **Gegner: nur Style-Teile**, je Startplatz fest ausgelost (`rivalKit(seed)` in `roster.ts`) – reine Optik.
6. **Hangar:** Tafel „Lackierung & Design" mit den Reitern **Lack | Teile** (keine zusätzliche Höhe); „Teile" zeigt die vier Steckplätze + „Alles Werk". Die Vorschau baut sich bei jedem Klick und jeder Tuning-Stufe neu (`PodPreview` bekommt `kit` + `tune`).
7. **Spielstand:** `PodCustom.kit` wird in `sanitizeCustom` auf 0–3 begrenzt; ein Stand ohne `kit` = Werk.

### Verifiziert (Phase 4)
- `npm run check` grün: 41/41 Unit-Prüfungen (neu: Stufen 0–1 / 2–3 / 4–5, „Werk fügt nichts hinzu", jede Style-Wahl und jede Tuning-Stufe auf jedem Triebwerksstil, Gegner-Auslosung der Style-Teile, Profil-Begrenzung), Pod-Audit 14/14 **ohne neue Goldwerte** (Werk-Zahlen und Physikformen unverändert), Sim 13/13.
- **Sim-Tabelle zeilengleich** zu Phase 3 (neues Feld) und mit `ROSTER_OLD=1` zu Phase 2 → die Teile ändern nichts am Fahren.
- Audit der Varianten (drei Sätze je Pod: Style-Wahl 1 / 2 / 3 in allen Steckplätzen, Tuning-Stufe 1 bzw. 2): größte Überbreite über die Kollisionsform weiter 0,50 m (Tyr Vespa), einzelne Pods werden mit Teilen bis 0,18 m breiter (Fireflare 0,10 → 0,28 m; Grenze 0,55 m); nichts hängt mehr als 0,02 m unter der Bodenklemme (wie ohne Teile); Gegner mit Style-Teilen bleiben unter den Session-19-Zahlen.
- Browser (WebGPU): Bilder `tools/harness/out/p4_*.jpg` (Aurora mit allen drei Sätzen, Manta, Cyclone, Halo) gesichtet; Hangar bei 1280 × 720, 1920 × 1080, 1024 × 600, 800 × 1000, 2560 × 1440: `data-fit-shrunk = 0`, kein Scrollbalken, Vorschau ändert sich bei Klick auf Style-Teile und „Alles Max"; echtes Rennen Boonta mit der Voltspire (Pfeilflügel, Irisblende, lange Düse, Bernstein-Kanzel, Tuning 5) und 10 Gegnern 21 Rennsekunden per Hand getaktet: keine Konsolenfehler.
- `npm run build` → `dist/index.html` (2,89 MB).

### Messwerte Phase 4 (Dreiecke Spieler „Ultra"; „mit Teilen" = größter der drei geprüften Sätze)
| Pod | Werk | mit Teilen | Gegner nah mit Style-Teilen (unter Ultra) |
|---|---|---|---|
| Aurora XR-7 | 57 170 | 68 626 | 16 596 |
| Vrak Splitter-X | 55 462 | 66 918 | 18 036 |
| Tenroc 6-Fach | 119 050 | 153 418 | 38 968 |
| Quadra Lumber | 89 280 | 110 656 | 28 986 |
| Hollo Needle | 50 754 | 61 442 | 14 928 |
| Tyr Vespa | 43 710 | 55 166 | 14 408 |
| Beerak Fireflare | 57 662 | 69 118 | 16 672 |
| Pagali Ironclad | 80 194 | 103 106 | 27 920 |
| Mak Starling | 51 878 | 62 566 | 14 924 |
| Mandrel Ram | 52 638 | 64 094 | 16 644 |
| Tarn Cyclone | 46 578 | 58 034 | 14 016 |
| Lyss Halo-9 | 45 062 | 55 750 | 14 708 |
| Dorn Manta | 27 042 | 34 874 | 8 980 |
| Quill Voltspire | 58 782 | 70 238 | 20 928 |

Ultra-Grenze 250 Tsd. – der größte Pod (Tenroc, sechs Triebwerke) liegt bei 153 Tsd. Die Teile kommen in die vorhandenen Material-Töpfe; zusätzliche Meshes entstehen nur für das zweite Bremsklappenblatt (Luftbremse Stufe 2): +4 bei zwei Triebwerken, +8 bei vier, +12 beim Tenroc (76 statt 64, Grenze 110). Das Audit druckt die Zahlen je Pod in den Zeilen „kit: …".

### Nicht verifiziert (Phase 4)
- **Bildrate auf „Ultra"** mit vollem Teilesatz – am Gaming-PC prüfen.
- Nicht jede Kombination einzeln angesehen: gesichtet sind sechs Bilder (drei Sätze an der Aurora, je einer an Manta, Cyclone, Halo) und die Voltspire in Hangar und Rennen; die übrigen deckt nur das Audit ab (Maße, Dreiecke) – und das Audit prüft drei Sätze je Pod, nicht alle 4 × 4 × 4 Style-Kombinationen mal Tuning-Stufen.
- Von den vier Kanzel-Tönungen im Rennen nur „Bernstein" gesehen.

### Erledigt in Phase 5 (Schadensmodelle – Fahrverhalten)
1. **`src/game/podDamage.ts` (neu, ohne three – läuft im Node-CI):** ein **Schadensmodell je Racer** (`MODELS`, unbekannte Pod-ID wirft einen Fehler) aus
   - **Panzerzonen** `front | side | top | belly | heat`: Faktor auf den Schaden aus dieser Richtung (< 1 gepanzert, > 1 weich; im Mittel etwa 1),
   - **Bruchteilen**: je Schadensanzeige genau drei (Stufen 50 / 35 / 20 % Triebwerkszustand), paarig links/rechts oder als Mittelteil (bricht, sobald eine der beiden Seiten die Stufe unterschreitet). Jedes Bruchteil kostet 5–10 % eines Fahrwerts (`fx`) oder war ein **Schutz** (`guard`), der Treffer aus einer Zone abgefangen hat, solange er dran war.
2. **Regeln (`physics.ts`):** `applyDamage` gewichtet jeden Treffer mit `zoneFactor` (Panzerung × noch vorhandene Schutzteile dieser Seite) und bricht danach fällige Bruchteile ab (`PodState.parts` = Bitmaske, Ereignis `part`). Wirkungen multiplizieren sich, **höchstens −15 % je Fahrwert** (`FX_CAP`), **Gegner spüren die Hälfte**. Reparatur heilt nur den Zustand; **Teile kommen erst beim Respawn zurück** (`respawn` setzt Maske und `fx` zurück). Explosionsregel unverändert (eine Seite ≤ 0 %); ein explodierender Pod meldet keine Einzelteile.
3. **HUD:** die drei Zellen je Schadensanzeige sind jetzt Bruchteil-Lampen (oben 50 %, Mitte 35 %, unten 20 %; verloren = rot mit Kreuz, `data-lamp`). Seitentausch wie bisher nur in `Game.hud()` (`partsL` / `partsR`). Je Verlust eine Meldung („FLÜGELPLATTE ABGERISSEN!", „OBERES TRIEBWERK AUSGEFALLEN!" …), ein harter Schlag + Warnton, Funken.
4. **Kamera:** das Sichtfeld folgt der unbeschädigten Höchstgeschwindigkeit (`podParams().vmax0`) – verlorene Teile weiten das Bild nicht.
5. **CI:** je Strecke eine Zeile `parts lost: n (…)`; Schalter `ARMOR=0` (Panzerzonen aus) und `PARTS=0` (Bruchteile aus). Die Meldung „downward teleports" zählt einen Respawn (z. B. die KI-Selbstbefreiung) nicht mehr mit; `DEBUG=1` druckt zu jedem Teleport Ort und Tunnelzustand.

| Racer | weich / hart | Bruchteile (50 % · 35 % · 20 %) |
|---|---|---|
| Aurora XR-7 | Flanken weich | Flügelplatte (Haftung) · Kreisel-Stabilisator (Wendigkeit) · Innenflügel (Haftung) |
| Hollo Needle | Nase weich | Nasensonde (Wendigkeit) · Canards (Haftung) · Heckfinne (Wendigkeit) |
| Tyr Vespa | Flanken weich | Klingenflügel (Haftung) · Fühler (Wendigkeit) · Stachel (Haftung) |
| Mak Starling | Flanken + Oberseite weich | Schwinge (Haftung) · Bremsfeder (Luftbremse) · Rückenfinne (Wendigkeit) |
| Lyss Halo-9 | Flanken weich, Nase hart | Ringflügel-Segment (Wendigkeit) · Kuppelbogen (Wendigkeit) · Ringflügel-Segment (Haftung) |
| Vrak Splitter-X | Nase hart, Oberseite + Hitze weich | Kühllamellen (Kühlung) · Ansaugklappen (Beschleunigung) · Haifinne / Stummelfinne (Wendigkeit) |
| Beerak Fireflare | hitzefest | Radiator (Kühlung, mehr Hitze) · Kühlschleife (Kühlung, mehr Hitze) · Radiatorflügel (Haftung) |
| Mandrel Ram | Front erst durch Schutzteile sehr hart, danach weich | Rammring (Schutz Front) · Rammbug (Schutz Front) · Kufenplatte (Schutz Bauch) |
| Dorn Manta | Bauch weich | Flügelspitze (Haftung) · Seitenleitwerk (Wendigkeit) · Deltafläche (Haftung) |
| Tarn Cyclone | Front weich (offene Rotoren) | Rotorblatt (Tempo, Beschleunigung) · Ringfinne (Wendigkeit) · Leitwerksträger (Haftung) |
| Tenroc 6-Fach | dünne Haut überall | Oberes Triebwerk fällt aus · Äußeres Triebwerk fällt aus (je Tempo, Beschleunigung) · Verteilerrohr (Beschleunigung) |
| Quadra Lumber | Front weich, Oberseite hart | Ringschürze (Wendigkeit) · Energieblitz erlischt (Beschleunigung) · Ausleger (Haftung) |
| Pagali Ironclad | Flanken erst gepanzert, danach weich | Panzerschürze (Schutz Flanke) · Panzerplatte (Schutz Flanke + Front) · Oberes Triebwerk fällt aus |
| Quill Voltspire | schwache Hülle, Hitze prallt ab | Energiebogen erlischt · zweiter Energiebogen erlischt (je Beschleunigung) · Entladungsmast (Kühlung) |

### Verifiziert (Phase 5)
- `npm run check` grün: 57/57 Unit-Prüfungen (16 neue: jedes Modell eigenständig, Zonen-Mittel 0,9–1,1, genau ein Bruchteil je Stufe und Anzeige, Wirkung 5–10 %, Deckel 15 %, Gegner halb, Bruch genau einmal mit Ereignis, Mittelteile, Reparatur bringt nichts zurück / Respawn alles, Rammbug, seitengetrennter Schutz, Explosion ohne Einzelteile, Schalter, HUD-Lampen, `vmax0`), Pod-Audit 14/14 unverändert, Sim 13/13 mit **0 Ausfällen auf allen Strecken** (wie vorher).
- **`ARMOR=0 PARTS=0`: Sim-Tabelle zeilengleich zu Phase 4** → die Umstellung selbst ändert nichts; alle Unterschiede kommen aus den Modellen.
- Mit Schadensmodellen: 5–29 verlorene Bruchteile je Strecke (11 Pods, 45 s); Durchschnittstempo je Strecke −4 … +3 m/s gegenüber vorher, langsamster Pod auf Crystal 83 statt 96 m/s (Grenze 18).
- `GRIP=0.88` (Sturm): 13/13 „ok", höchstens 1 Ausfall je Strecke.
- Echte App (WebGPU, Boonta, Aurora): 55 Schaden links → Meldung „KREISEL-STABILISATOR AUSGEFALLEN!", Lampen der richtigen Anzeige rot (Seitentausch stimmt), 85 Schaden rechts → drei Lampen rot; keine neuen Konsolenfehler.
- `npm run build` → `dist/index.html` (2,89 MB).

### Nicht verifiziert / aufgefallen (Phase 5)
- **Balance von Hand nicht gefahren** – nur KI-Sim. Ob 5–10 % je Teil spürbar genug oder zu viel sind, muss der Nutzer fahren.
- **Langlauf `SECS=120` mit Schadensmodellen: Malastare meldet 1 echten „downward teleport"** (Gegner-Pod Splitter-X, t = 14,7 s, Sample 964, Standard-Tunnel: der Pod gilt als „im Tunnel" (`upper = false`, `inRoof = true`), ist aber 23 m über der Straße und wird unter die Decke gesetzt). Das ist Tunnel-Logik aus Session 17, kein Pod-Thema; im Standardlauf (45 s) und im Langlauf ohne Schadensmodelle tritt es nicht auf – andere Flugbahnen. Nachstellen: `DEBUG=1 SECS=120 node tools/ci/out/sim.mjs` (ganzer Lauf nötig, wegen des Zufallsstroms). *Nachtrag nach dem Merge:* die Tunneldecke setzt nicht mehr um, sie drückt höchstens 45 m/s herunter – derselbe Fall an Sample 964 ist im Abschnitt „Tunneldecke je Pod" beschrieben.
- Die Lampen stehen in gleichen Abständen, nicht auf Höhe der Stufen 50 / 35 / 20 % der Füllung.
- Verlorene Teile sind am Pod **noch nicht zu sehen** (Phase 6) – bisher nur Lampe, Meldung, Ton, Funken und Fahrwirkung.

### Erledigt in Phase 6 (Schaden – Optik)
1. **Bruchteile verschwinden ohne zusätzliche Meshes.** Jedes Bruchteil ist dort markiert, wo es gebaut wird: `pb.brk(id, …)` (neue Methode des `PartBuilder`) in den Triebwerks-Bauern und in `engineExtras`, `part(k, id, …)` in den Cockpits. Die Montage (`podAssembly.ts`) führt die Teile wie bisher in die Material-Töpfe zusammen und merkt sich je Bruchteil die Index-Bereiche (`BreakShow.ranges`). Geht ein Teil verloren, schreibt `podModel.ts` (`Hider`) den Index-Puffer des betroffenen Meshes neu – ohne das Teil (`visibleIndices`). **Zeichenaufrufe und Pipelines bleiben gleich**; derselbe Weg blendet jetzt auch den Piloten für die Cockpit-Kamera aus.
2. **Was ein Bruchteil außer Geometrie sein kann** (`PodLayout.flameOut / fanLoss / arcLoss`): ein Triebwerk fällt aus (Flamme weg, Fan steht, Düsen- und Lichtbänder dunkel, es zieht nur noch Rauch) · ein Rotor verliert ein Blatt (`EngineGeo.fanLost`) · ein Energieblitz erlischt (Bereich im Blitz-Mesh).
3. **`PodVisual`:** `setParts(mask)` (jede Frame aus `PodState.parts`, kostet nichts, solange sich nichts ändert), `engineOut[]`, `partWorld(i, out)`, Spieler zusätzlich `hitMark(x, y, z, stärke)` und `clearMarks()`.
4. **Treffermarken (nur Spieler-Pod, `hullMaterial`):** je Rumpf-Material (links, rechts, Cockpit) vier `uniform(vec4)` als Ringpuffer – Brandfleck mit ausgefranstem Rand, blankes Metall in der Mitte, dunkle Kerbe im Zentrum. Entfernung im Mesh-Raum, also bleibt die Marke am Blech. Keine echten Dellen (Entscheidung). Beim Respawn weg.
5. **Trümmer:** zweiter `DebrisPool('plate')` (`Game.scrap`): Blechplatten in der Zweitfarbe des Pods, wo ein Bruchteil abreißt; bei einer Explosion 16 Platten in Erst- und Zweitfarbe. Beide Pools werden beim Aufwärmen einmal leer gezeigt (Pipeline wird vor dem Start übersetzt).
6. **Hangar:** „Schadens-Vorschau" in der Pod-Vorschau unten links – Regler 100 → 0 % und die drei Stufen des Racers im Klartext (z. B. „50 % Flügelplatte · 35 % Kreisel-Stabilisator · 20 % Innenflügel"); die Vorschau lässt die Teile ohne Neuaufbau fallen.
7. **Lyss Halo-9:** der Ringflügel ist jetzt aus Bögen gebaut (oben, unten, zwei Flanken + je Flanke ein oberer und ein unterer Bogen als Bruchteil), mit Lichtbändern, Nieten und Trimmklappen je Bogen und dunklen Endplatten an den Bruchstellen. Nur seine Goldwerte haben sich geändert (+32 … +520 Dreiecke je Bau).
8. **Harness:** `show(idx, health, q, { both, parts, heat, marks })` und `sheet(view, { health })` lassen Bruchteile unter ihrer Stufe weg; `marks: [[x, y, z, stärke], …]` setzt Treffermarken (Pod-Koordinaten).

### Verifiziert (Phase 6)
- `npm run check` grün: 64/64 Unit-Prüfungen (7 neue: Index-Ausblendung, „jedes Bruchteil jedes Racers zeigt etwas" für Spieler (3 Detailstufen) und Gegner (leicht + Ultra), Bereiche überlappen nicht / linke Teile liegen links / Pilot zuletzt, Ausfälle und Blitze zeigen auf echte Triebwerke der richtigen Seite, ausgefallenes Triebwerk wird dunkel, Teil ≥ 0,4 m und < 45 % der Dreiecke), Pod-Audit 14/14 (13 Pods **unverändert** in Mesh- und Dreieckszahl, nur Halo neu), **Sim-Tabelle zeilengleich zu Phase 5** (reine Optik).
- Gegenprobe der Hauptprüfung: ein falsch benannter Bruchteil-Tag (`kanard`) lässt 5 Prüfungen scheitern.
- Browser (WebGPU): Bögen aller 14 Pods bei 100 / 45 / 30 / 15 % (`tools/harness/out/p6_pods_*.jpg`), Nahaufnahmen Aurora, Halo, Cyclone, Splitter-X (15 %), Voltspire, Tenroc (30 %), Gegner-Bogen bei 15 % (`p6_gegner_15.jpg`), Treffermarken (`p6_aurora_marks.jpg`).
- Echte App: Hangar-Regler bei 1280 × 720 ohne Schrumpfen / Scrollen, Vorschau verliert die Teile; Rennen Boonta mit dem Tenroc: 70 Schaden → vier von sechs Triebwerken aus (`engineOut`), Lampen und Meldung passen, alle 10 Gegner mit verlorenen Teilen, Explosion wirft grüne und sandfarbene Platten, nach dem Respawn sind alle Teile zurück; keine neuen Konsolenfehler.
- `npm run build` → `dist/index.html` (2,91 MB).

### Nicht verifiziert / nicht gebaut (Phase 6)
- **Dampf- und Ölstrahlen je Modell** (Plan, in der Streichliste an zweiter Stelle) sind nicht gebaut: ein ausgefallenes Triebwerk zieht Rauch, der Radiator der Fireflare verschwindet ohne Dampf.
- Treffermarken ohne geneigte Normale (Plan: „normal tilt") – die Kerbe ist gemalt (dunkles Zentrum, blanker Ring).
- **Kollisionsform bleibt:** ein abgerissener Flügel fehlt nur im Bild; die Physik rechnet weiter mit der vollen Breite (Entscheidung „alte Pods: Größe bleibt", gilt hier für alle).
- Im Rennen von Hand gesehen: Aurora und Tenroc als Spieler; die übrigen zwölf nur im Harness.
- WebGL2-Rückfall mit den neuen Shader-Teilen (Treffermarken) noch nicht gelaufen – folgt in Phase 7.
- Aufgefallen, nicht geändert: flache Bleche in Zweitfarbe (Flügel, Finnen, viele neue Teile) glühen bei hoher Triebwerkshitze wie die Düse (`aLiv.y = 0`) – das war schon vor Session 20 so, fällt mit mehr Blechen aber stärker auf.

### Erledigt in Phase 7 (Schaden – Optik der Gegner)
1. **Ruß je Mesh im geteilten Gegner-Rumpfmaterial** (`sharedOpponentHullMaterial`): der Wert kommt aus `mesh.userData.scorch` (TSL `userData`), gesetzt aus dem Zustand der jeweiligen Triebwerksseite (Cockpit: die schwächere Seite). **Eine Pipeline für alle Gegner wie bisher.**
2. **Sterbende Flammen** (`sharedOpponentFlameMaterial`): `mesh.userData.power` – unter 35 % Zustand schwächer, unter 15 % stotternd; je Triebwerksseite ein Flammen-Mesh. Ausgefallene Einzeltriebwerke (Tenroc, Ironclad) verlieren ihren Strahl über denselben Index-Schnitt wie die Bruchteile.
3. **Fehlende Teile** hatten die Gegner schon seit Phase 6 (gleicher Weg wie beim Spieler, ohne zusätzliche Meshes) – auf jeder Detailstufe alle Bruchteile, nicht nur zwei wie im Plan vorgesehen.
4. **Funken und Blech** beim Abriss eines Gegner-Bruchteils nur näher als 120 m.
5. `PodVisual.update` der Gegner liest jetzt `dmgL` / `dmgR` (Zustand 0…1) wie der Spieler-Pod.

### Verifiziert (Phase 7)
- **Pipeline-Zählung am Start (WebGPU, Boonta, 11 Pods, „Hoch"):** vor Phase 7 `renderer._pipelines.caches.size` = 100, `info.memory.programs` = 166 (69 Vertex / 97 Fragment) – **nach Phase 7 dieselben Zahlen**, und sie bleiben gleich, nachdem alle 11 Pods auf unter 40 % beschädigt wurden und Teile verloren haben (im Rennen wird nichts nachkompiliert).
- **WebGL2-Lauf der echten App** (`gfx.backend = 'webgl'`, Boonta, Aurora): Rennen läuft mit 31 Bilder/s auf dem Entwicklungs-Notebook, Treffermarken gesetzt, alle 11 Pods beschädigt und mit verlorenen Teilen – **0 Fehler, 0 Warnungen** in der Konsole.
- `npm run check` grün (64/64 Unit-Prüfungen, Audit 14/14, Sim 13/13, Tabelle zeilengleich zu Phase 5 und 6); `GRIP=0.88`: 13/13 „ok".
- Harness: Gegner Splitter-X bei 100 % und 12 % (`tools/harness/out/p7_splitter_gegner_*.jpg`), Gegner-Bogen bei 30 % (`p7_gegner_30.jpg`).
- **Neue Testmethode bei verdecktem Browser-Bereich:** der Seite direkt nach dem Laden einen zeitgesteuerten Ersatz für `requestAnimationFrame` geben (siehe `CLAUDE.md`). Dann laufen Spiel, three.js-Bildzähler und die Shader-Übersetzung des WebGL2-Rückfalls von selbst in Echtzeit – ohne das Takten von Hand. (Ohne den Ersatz bleibt die WebGL2-App im Ladebildschirm hängen: three.js fragt den Übersetzungsstand per `requestAnimationFrame` ab.)

### Nicht verifiziert (Phase 7)
- **Bildrate auf „Ultra"** – weiterhin nur am Gaming-PC zu klären.
- Der beschädigte Gegner „direkt neben dem Spieler" ist im Rennen nur in zwei Standbildern gesehen (Schwenk und Überholen nicht), dazu die Harness-Bilder.
- Treffermarken tragen nur der Spieler-Pod (Gegner: Ruß je Seite, keine einzelnen Marken).

### Abschluss-Durchsicht (unabhängiger Prüfer über den ganzen Branch, `d7b9c4b..0e624dc`)
Urteil des Prüfers: **bereit zum Zusammenführen, mit Korrekturen** – kein kritischer Fund. Der riskante Kern (verlorene Teile aus den Index-Puffern schneiden) hielt: 4542 Bruchteil-Bereiche über 14 Pods × 6 Teile-Sätze × alle Detailstufen ohne Fehler.

**Fünf Korrekturen (jede zuerst als fehlschlagende Prüfung gesehen):**
1. **Treffermarken saßen in der Verfolgerkamera zu weit vorn.** `Game.updateVisuals` wertet die Ereignisse eines Schritts aus, bevor das Modell seine neue Lage bekommt – `body.worldToLocal` rechnete mit der Lage des Bilds davor (bei 100 m/s und 60 Bildern/s 1,7 m, bei Boost mehr). Jetzt rechnen `worldToBody` / `bodyToWorld` (`physics.ts`) aus der Lage des aktuellen Physik-Schritts; `PodVisual.hitMark` und das neue `partBody` (vorher `partWorld`) arbeiten im Rumpf-Raum. Gilt genauso für den Startpunkt der Trümmer eines verlorenen Bruchteils.
2. **Treffermarken schlugen auf die Luftbremsklappen durch.** Eine Klappe hatte ihren eigenen Ursprung (das Scharnier), die Marken werden aber im Raum der Triebwerksbank gemessen – ein Treffer färbte Klappen an ganz anderer Stelle (Tenroc, Quadra, Needle, Ironclad, Halo, Manta). Jetzt liefert die Montage die Klappen des Spieler-Pods im Bank-Raum (`HeroFlap`), das Modell hängt sie an eine Scharnier-Gruppe. Kein Eingriff in den Shader.
3. **Lichter von Tuning- und Style-Teilen brannten an ausgefallenen Triebwerken weiter** (Nachbrenner-Ring ab Höchstgeschwindigkeit 4, lange Düse, Repulsor-Leiste – Tenroc und Ironclad, Spieler und Gegner). Sie tragen jetzt dieselbe Markierung wie die Werks-Lichter.
4. **Flache Rumpfteile glühten wie die Düse, egal wo sie saßen** (Flügelplatten, Finnen, Klappen, Kit-Finnen: `aLiv.y = 0`). Im Harness war die Manta bei voller Hitze bis zu den Flügelspitzen weiß; Klappen schimmerten schon im Leerlauf rosa. Jetzt bekommt jedes Rumpfteil in Grund- oder Zweitfarbe (Lackmodus 0 / 3) seine wahre Lage längs des Triebwerks (`heatAlong` in `podKit.ts`; Triebwerke, Bruchteile, Klappen, Kit-Teile, Flügel aus dem Layout). Glut und Ruß laufen damit auf Platten genauso von der Düse nach vorn wie auf dem Rumpf. Teile mit Lackmuster behalten ihre Koordinate.
5. **Prüflücke geschlossen:** die Bereichs-Prüfungen der Bruchteile liefen nur für den Spieler-Pod ab Werk. Jetzt für Spieler (alle Detailstufen + drei Teile-Sätze) und Gegner (einfach + Ultra + drei Style-Sätze), dazu neu: „ein Bereich besteht aus ganzen Teilen" (kein Dreieck außerhalb benutzt einen seiner Eckpunkte) sowie Flammen-Bereiche und Blitze der Gegner. Gegenprobe: lässt man Kit-Teile der Gegner ungezählt in den Topf, schlägt genau diese Prüfung an.

**Dabei gefunden:** die Harness-Option `heat` zeigte nur 15 % der verlangten Hitze (die Glut des Modells läuft nach). `settle()` lässt sie jetzt ankommen; Standard ist 0,03 (kalter Motor, wie die bisherigen Bilder). Neu: `airbrake` für `show`; `marks` erwartet Punkte im Rumpf-Raum.

### Verifiziert (Abschluss-Durchsicht)
- `npm run check` grün: **69/69** Unit-Prüfungen, Audit 14/14 (Mesh- und Dreieckszahlen unverändert), Sim 13/13 – **Tabelle zeilengleich zu Phase 7** (die Korrekturen ändern kein Fahrverhalten).
- **Echtes Rennen (WebGPU, Boonta, Aurora, 11 Pods):** 12 Probe-Treffer bei 60–129 m/s – der Punkt, den das Modell bekommt, stimmt auf 0 genau; dieselben Punkte über die Matrizen des Modells gerechnet lagen 1,6–6,5 m daneben (das Notebook schafft 22 Bilder/s). 0 Konsolenfehler.
- **Pipelines am Start unverändert** (100 / 166 Programme). In der ersten Rennsekunde kommen 3 dazu – Meshes direkt unter einer Welt-Gruppe (MeshBasic / MeshStandard), keine Pod-Meshes; nicht Teil dieses Auftrags.
- **Hangar-Layout** mit Schadens-Regler und Reitern bei 1280×720, 1920×1080, 1024×600, 800×1000, 2560×1440: `data-fit-shrunk="0"`, keine Scrollbalken.
- Harness: Manta bei Hitze 0,5 / 1,0, Aurora mit doppelten Klappen (keine rosa Klappen mehr), Treffermarken auf Aurora und Tenroc.

### Entscheidungen zu den Punkten, die der Prüfer offen ließ
1. **Äußeres Klappenblatt öffnet 96°** (Luftbremse ab Stufe 4): bleibt. Angesehen – es liest sich als voll geöffnete Bremse.
2. **Wandtreffer zählen immer als Zone „Seite"** (auch frontal): bleibt. Folge: Rammbug (Ram) und harte Nase (Splitter-X) helfen nur gegen Hindernisse und Pods, nicht beim Frontaleinschlag in die Wand. **Der Nutzer kann das anders wollen** – dann Zone nach Aufprallwinkel wählen (`physics.ts`, Wandkontakt).
3. **Bildrate auf „Ultra", Aussehen und Schadens-Balance** kann nur der Nutzer am Gaming-PC beurteilen.

### Zurückgestellt (klein, nicht behoben)
- Halo: die Abschlussplatten der Ringsegmente stehen bis 4,1 cm durch die Ringhaut, Nieten schweben 1,2–1,8 cm über ihr (`podEngines.ts`, `ringArc`).
- Treffermarken liegen bei nicht runden Triebwerken auf dem Kernradius: Manta rund 1 m innen neben der Flanke, Halo / Cyclone auf dem Kern statt auf dem Ring.
- Pod-gegen-Pod: das Ereignis bekommt nur einer der beiden (`collidePods`) – berührt ein Gegner mit kleinerer Startnummer den Spieler, entsteht keine Marke.
- CI: die Teleport-Messung überspringt nach einem Respawn 2–3 Bilder statt eines (`tools/ci/sim.ts`; besser `prevY` beim Respawn zurücksetzen).
- Hangar: die Vorschau baut das Modell bei jedem Tuning-Klick neu, auch wenn sich keine Teile-Stufe ändert (`PodPreview.tsx`, Schlüssel auf `tuneTiers`).
- Bild-Server des Harness nimmt Anfragen jeder Herkunft an (nur Entwicklungswerkzeug, Dateiname ist bereinigt).
- Toter Code: `cockpit.style` / `CockpitStyle`, `cockpitExtras` (ohne Nutzer; seine Bruchteile würden ohne Markierung eingebaut), `cockpitDesigns`, `glass` / `skin` in `sharedPodMaterials`.
- `loadProfile` prüft `race.difficulty`, `race.laps` und die Grafik-Werte nicht (ein von Hand geänderter Spielstand mit `difficulty: 9` lässt `Game.createPods` abstürzen – alt, nicht aus dieser Session).
- Wörter: Hangar-Liste heißt „Podracer" (Glossar: Pod / Racer); Meldungen „verklemmt", „leck", „ausgefallen", obwohl das Teil sichtbar abfällt. Kommentare in `data.ts` nennen `pilotParts` (gibt es nicht) und nur 3 von 6 Hauttönen.
- Älter als diese Session: `DebrisPool.dispose` wird nie aufgerufen (jetzt zwei Pools), ein Feld je Bild im `update` des Spieler-Pods.

### Messwerte vor der Überholung (Meshes / Dreiecke)
| Pod | Spieler „Hoch" | Spieler „Ultra" | Gegner nah | Gegner fern |
|---|---|---|---|---|
| Aurora XR-7 | 40 / 39 692 | 40 / 51 068 | 31 / 22 184 | 3 / 544 |
| Vrak Splitter-X | 37 / 39 888 | 37 / 50 656 | 28 / 22 976 | 3 / 544 |
| Tenroc 6-Fach | 62 / 83 388 | 62 / 106 412 | 29 / 39 328 | 3 / 984 |
| Quadra Lumber | 49 / 65 544 | 49 / 84 664 | 28 / 31 760 | 3 / 764 |
| Hollo Needle | 37 / 35 604 | 37 / 46 692 | 28 / 20 120 | 3 / 544 |
| Tyr Vespa | 38 / 34 676 | 38 / 44 196 | 29 / 19 324 | 3 / 544 |
| Beerak Fireflare | 37 / 39 148 | 37 / 50 508 | 28 / 21 096 | 3 / 544 |
| Pagali Ironclad | 50 / 61 684 | 50 / 78 308 | 30 / 30 996 | 3 / 764 |
| Mak Starling | 38 / 36 496 | 38 / 47 328 | 29 / 20 924 | 3 / 544 |
| Mandrel Ram | 40 / 37 660 | 40 / 48 044 | 31 / 20 872 | 3 / 544 |

Sichtmodell gegen Physikform: breiter als die Kollisionsform höchstens 0,50 m (Tyr Vespa, Klingenflügel); kein Triebwerk hängt mehr als 0,02 m, kein Cockpit überhaupt unter der Bodenklemme.

### Nicht verifiziert / offen
- Bildrate – auf diesem Notebook nicht aussagekräftig; „Ultra" testet der Nutzer am Gaming-PC.
- `tools/harness/pui.mjs:39` prüft noch die gelöschte Strecke „Neon-Spirale" (schlägt deshalb fehl) und braucht Puppeteer, das hier nicht installiert ist. Layout-Prüfung erfolgt vorerst im In-App-Browser.
- `tools/harness/run.sh` setzt Linux-Pfade voraus (`/tmp`, `LD_LIBRARY_PATH`).

### Befehle (neu)
1. `npm run check:pods` – nur das Pod-Audit. `POD=<id>` prüft einen Pod, `UPDATE=1` gibt neue Baseline-Zeilen aus (bewusst übernehmen, wenn Pods absichtlich geändert wurden).
2. Harness-Konsole: `await sheet('front', { quality: 3, save: 'name' })`, `await show(3, 0.3, 3, { rival: true })`, `statsAll()`. Bogen-Ansichten: `pod`, `front`, `rear`, `side`, `inside`, `chase` (Verfolgerkamera), `profile` (Seitenriss); `{ rival: true, far: true }` zeigt das Fern-Modell. Pod-Indizes der neuen: 10 Cyclone, 11 Halo, 12 Manta, 13 Voltspire. Teile zeigen: `await show(0, 1, 3, { kit: { fins: 3, intake: 3, nozzle: 1, canopy: 2 }, tune: { topSpeed: 5, cooling: 5 } })` (`kit` 0–3 je Steckplatz, `tune` = Tuning-Stufen 0–5; beides auch in `sheet(…)`).
3. `ROSTER_OLD=1 node tools/ci/out/sim.mjs` (nach `npm run check`) – Sim mit dem alten Startfeld; die Tabelle muss der von Phase 2 gleichen.
4. `ARMOR=0 PARTS=0 node tools/ci/out/sim.mjs` – Sim ohne Schadensmodelle (Tabelle = Stand Phase 4); einzeln: `ARMOR=0` nur Bruchteile, `PARTS=0` nur Panzerzonen.

---

## Stand: 2026-11-21 – Session 20 (Strecken) – Bugfixes (Höhlen, „Balken", Tunneldecken), Untergründe je Passage, Seen, Oovo-Mond, PBR-Fotosets

### Vorgaben des Nutzers (gelten weiter, Ausnahme siehe letzter Punkt)
1. **Fahrphysik je Untergrund:** spürbar, aber fair – und für die KI genauso.
2. **Seen:** der Pod schwebt in den offenen Passagen direkt über der Flüssigkeit; kein Hineinfallen.
3. **Oovo IV:** etwa 55 % Mondoberfläche, 45 % Station; Zero-G-Röhren bleiben; keine Stelzen ins Nichts.
4. **Alle 13 Strecken** bekommen wechselnde Passagen.
5. **Texturen:** CC0-Fotosets in 1024 px, Build bis etwa 20 MB; HQ-Assets prozedural.
- Außerdem galt in dieser Sitzung: **Pod-Dateien nicht anfassen** (`podModel`, `podTextures`, `podDesigns`, `podKit`, `podMaterials`, `podParts`, `PodPreview.tsx`, `tools/harness/pods.ts`) – die Pods wurden gleichzeitig in Session 20 (Pods) überarbeitet. **Mit dem Merge ist diese Vorgabe erledigt.** Weiter gilt: **nicht pushen** ohne ausdrücklichen Wunsch.

### Erledigt in Session 20 (Strecken)
**Bugs**
1. **„Balken" am Boden in Schrägkurven (Aquilaris, Oovo IV) – `world.ts → addViaductPiers`:** Ursache: die Hammerkopf-Kappen der Viaduktpfeiler lagen waagerecht, die Fahrbahn ist in Kurven aber bis ≈ 21° überhöht → das Kappenende stach auf der tiefen Seite als Balken durch die Fahrbahn. Jetzt neigt sich jede Kappe mit der Überhöhung, jedes Bein bekommt seine eigene Höhe.
2. **Tunneldecken noch einmal +6,5 … 7,5 m und anderes Profil (`trackBuilder.ts`, `world.ts`, `physics.ts`, `Game.ts`):** Standard **27 m** (Ando Prime **30 m**), Unterführung 26 / 28 m, Abkürzung 25 / 27 m, Höhle 27 / 29 m + 8,5–16 m in den Kammern (bis 45 m), Unterwasserröhre 26 m. Querschnitt = **Superellipse (n = 3)** statt Halbellipse: bei 90 % der Breite sind noch 65 % der Scheitelhöhe frei (vorher 44 %) – genau dort tauchte man in die Decke. Die Deckenkollision rechnet jetzt mit der Pod-Oberkante (2,15 m + Flügelspitze bei Rolle; seit dem Commit „Tunneldecke je Pod" mit der gemessenen Höhe des jeweiligen Pods – Abschnitt oben), die Verfolgerkamera bleibt im Gewölbe. Stalaktiten-Spitzen ≥ 22 m über der Fahrbahn. Eine einzige Profilquelle: `tunnelProfile` / `tunnelArc` / `tunnelCeiling` (Mesh, Kollision, Kamera).
3. **Höhlen (Vulkan, Ando Prime ×2, Kristall, Dschungel) – `trackBuilder.ts`, `world.ts → buildTunnel`:** vorher waren die Kammern getrennte 150-m-Röhren mit offenem Himmel dazwischen, Schluchtklippen standen in der Höhle, die verbreiterte Kammer (`caveW`) lag hinter einer unsichtbaren Wand, und die Abzweigröhre schnitt mit sichtbaren Wänden durch die Hauptröhre. Jetzt: **eine durchgehende Höhle** (`tun === 3` über die ganze Länge), die **Fahrbahn selbst weitet sich** in den Kammern (kein `caveW` mehr), Abzweigröhren sind von Anfang bis Ende überdacht und werden per **Hüllen-Vereinigung** (`insideCave` + Dreiecks-Culling) mit der Hauptröhre verschmolzen; Klippen werden in Höhlen ausgelassen. Der Wandrest der Abzweigröhre an der Gabelung hat eigene Texturkoordinaten (vorher zog sich die Fels-Textur dort zu dünnen Streifen zusammen).
4. **Folgefehler aus (2), in derselben Session behoben (`physics.ts`):** ein Pod, der über dem niedrigeren Seitengewölbe in ein Portal einflog, wurde durch die Stirnwand gedrückt (CI: 1 Teleport auf `executioner`). Der Deck-Einstieg entscheidet jetzt nach der Gewölbehöhe an der seitlichen Position des Pods, die Decke drückt mit höchstens 45 m/s nach unten.

**Untergründe & Passagen (alle 13 Strecken)**
5. **25 Untergründe (`surfaces.ts`, `Sample.surf`):** jede Strecke wechselt zwischen „allgemeinen" und „offenen" Passagen ihres Planeten (Tabelle `THEME_SURFACES`). Übergänge lösen sich über 30 m auf (natürlicher Boden) bzw. über eine 26-m-Schürze (gebautes Deck).

   | Welt | allgemeine Passagen | offene Passagen | Höhle |
   |---|---|---|---|
   | Tatooine | Sand, Gestein | Dünen, Plateau | – |
   | Rote Tafelberge | Gestein, Sand | Plateau, Dünen | – |
   | Ando Prime | Schnee, Eis | **Eissee**, Pulverschnee | Eis |
   | Vulkanwelt | Basalt, Lavakruste | **Lavasee**, Asche | Basalt |
   | Dschungelmond | Waldboden, Schlamm | **Sumpf**, Kies | Kies |
   | Malastare | Renndeck, Kies | **Methansee**, Sumpf | – |
   | Aquilaris | Plattform, Strand, Riff-Fels | **offene See** (auf Meereshöhe) | – |
   | Oovo IV | Regolith, Stationsdeck | Regolith, Deck | – |
   | Kristallschluchten | Fels, Kristallfeld | **Spiegelsee**, Kristallfeld | Kristall |

6. **Fahrphysik je Untergrund (`physics.ts`, gilt auch für die KI; Werte in `surfaces.ts → SURFACES`):** Eis/Eissee Haftung ×0,75 · Höchsttempo: Pulverschnee ×0,93, Dünen ×0,94, Schlamm ×0,93, Sumpf ×0,92, Asche ×0,95 (dazu Haftung ×0,90–0,94) · Triebwerkshitze: Lavakruste ×1,3, Lavasee ×1,6, Methansee ×1,15, Basalt/Asche ×1,1, Schnee/Eis/Wasser ×0,9 · Fels, Plateau, Riff, Deck, Rennpiste voll · übrige Naturböden ×0,92–0,98 Haftung, ×0,96–1,0 Tempo. Haftung/Tempo wirken nur am Boden (`grounded && !zeroG`). Grund-Haftung der Welt dafür angehoben (`Game.baseGrip` Eis 0,8 statt 0,55, Dschungel 0,9 statt 0,85). KI-Referenztempo skaliert mit der Haftung. **HUD:** Untergrund-Zeile unter der Wetterzeile (`HudState.surface` / `surfaceFx`: Name + Hinweis „wenig Haftung" / „bremst" / „rutschig" / „Triebwerke heizen auf"), Staub-/Gischtfahne in der Farbe des Untergrunds.
7. **Seen & Plateaus als offene Passage (`Sample.lake`, `world.ts → buildBasins`, `terrain.ts`):** Die bis ~108 m breite offene Fläche ist die See-Oberfläche selbst – der Pod schwebt direkt über Eis, Lava, Methan, Sumpf, Wasser oder Spiegelsee. Eben, keine Überhöhung, keine Leitplanken/Curbs; den Rand markieren Baken + höheres Energiefeld. Kein Hineinfallen. Aquilaris-Seen liegen auf Meereshöhe (`seaY0 + 0,4`). Flüssigkeits-Looks in `terrainMaterial.ts → LIQUIDS`.
8. **Oovo IV = Mond + Station (`terrain.ts`, `world.ts`, `data.ts`):** Mondoberfläche mit Kratern statt Stelzen ins Nichts (Pfeiler nur noch, wo wirklich Luft unter der Piste ist), ~55 % Regolith / ~45 % Stationsdeck, Gasriese + Sterne am Himmel, Sonne 19° über dem Horizont, helleres Fülllicht. Zero-G-Röhren unverändert.
9. **15 echte PBR-Fotosets, 1024 px, CC0 (`pbrTex.ts`, `photoAssets.ts`, `src/assets/pbr/`, `tools/photos/pbr.py`):** Albedo + echte Normal-Map + AO/Rauheit/Höhe je Set (Lava zusätzlich Emission). Beim Laden ins `TexSet`-Layout gepackt und auf die Palette der Welt gegradet. Quellen im README („Bildnachweis"). Build dadurch **17,5 MB** (vorher 2,8 MB; vom Nutzer bis ~20 MB freigegeben).
10. **HQ-Assets (`decorGeo.ts`, `foliage.ts`, `world.ts → scatterDecor`):**
    - **Schneekiefern** (`snowPineGeometry`, `pineMaterial`): Stamm mit Rindenfoto, 10 Quirle hängender Nadelzweig-Karten (Alpha), Schneeauflagen, ~700 Dreiecke; ab 230 m glatter Kegel-Zwilling. Ab Geometrie-Stufe 1.
    - **Felsbrocken mit Displacement** (`boulderGeometry`, `heightSampler`): der Bruchkörper von `rockGeometry`, feiner tesselliert (720 Dreiecke, „Ultra" 980), jeder Vertex um die **Höhe der Fels-Textur** an seiner Stelle verschoben (+ Grat-Rauschen), Textur als Box-Projektion (keine Polverzerrung mehr), geglättete Normalen mit harten Bruchkanten (52°). Ab 120 m (Lava 150 m) der 180-Dreieck-Zwilling aus demselben Verschiebungsfeld. Gilt für Streu-Felsen, Lava-Felsen und die Hindernis-Felsen auf der Piste. Ab Geometrie-Stufe 2 („Mittel").
    - **Kakteen** (`cactusGeometry` UV, `cactusMaterial`): prozedurale Haut – Rippen dunkeln ins Tal ab, Areolen mit Dornenfächer auf jedem Rippenkamm. Nur auf „Rote Tafelberge" (Dünenpass-Sprint).
    - **Offen:** Farne (siehe `TODO.md`).
11. **Textur-Cache gibt alte Welten frei (`textures.ts → beginTextureEpoch`):** nur aktuelle + vorige Welt bleiben im Speicher (vorher wuchs jeder Weltwechsel um ~100 MB).

12. **Loch im Plateau / See an engen Knicken (`trackBuilder.ts`, `world.ts → buildBasins`) – in dieser Session entstanden und behoben:** Wo die halbe Fahrbahnbreite größer ist als der Kurvenradius (Mos-Espa-Arena, Index 4660–4707: Breite/Radius 1,29), faltete sich die Beckenfläche; die umgeklappten Dreiecke wurden weggecullt, zwischen den sich kreuzenden Rändern klaffte eine rautenförmige Grube im Felsplateau, und die Randbaken standen als Knäuel mitten auf der Fläche. Jetzt: Fläche mit **beiden Windungen** und festen +Y-Normalen (eben und in Weltkoordinaten texturiert → Überlappungen unsichtbar), Innenufer behält an solchen Knicken 34 m (die Flächen vor und nach dem Knick überlappen), keine Baken, wo der Rand rückwärts läuft. Geprüft per Rasterabdeckung (0 Löcher) und Screenshot.

**Werkzeuge**
13. `tools/ci/info.ts` (Strecken-Dump: Tunnel, Wände, offene Flächen, Untergründe, Abzweige, engste Kurven) · Harness: Sonden-Ansicht `p<idx>_<lat>_<höhe>_<voraus>_<pfad>_<blickLat>_<blickHöhe>`, Ansicht `n` (Gasriese), Ansicht `g_<name>[_<instanz>[_<abstand×10>]]` (Nahaufnahme eines Dekor-Objekts: `g_boulder`, `g_cactus`), Query `bright` (dunkle Höhlen), `tex=256` (kleine Texturen für den WebGPU-Check bei wenig RAM), Bench-Items `b<strecke>:<ansicht>` (Frame-Zeit synchron über `readPixels`). `info.ts` meldet zusätzlich `fold` (Fahrbahn breiter als der Kurvenradius) und `basin` (Ufer jenseits des Radius).

### Verifiziert
- `npm run check`: **13/13 Strecken bestanden** – 0 Tode, 0 NaN, 0,00 m Wand-Durchdringung, Bodenfreiheit ≥ 0,66 m, Deck- und Overhead-Selbsttest grün, 0 Teleports. Auch mit Sturm-Haftung (`GRIP=0.88`): 13/13 (1 Tod auf Magma, erlaubt ≤ 3).
- `npm run check:gpu` (WebGPU, SwiftShader, je Strecke einzeln mit `QUERY='?tex=256'`): **alle 13 Strecken, 0 Konsolenfehler/-warnungen** – mit dem Endstand des Codes.
- `npm run build` → `dist/index.html` **17 505 684 Bytes** (gzip 12,36 MB; vorher 2,8 MB – Zuwachs = 46 JPEGs der Fotosets).
- App-Test `papp.mjs` auf dem fertigen Build (Frostspalt-Ring; davor auch Dünenpass-Sprint): **bestanden** – Menü → Rennen, HUD mit Untergrund-Zeile, Schadensseiten, Pause-Ton, Grafik-Menü in der Pause, Tasten- und Gamepad-Belegung.
- **Screenshots (WebGL2-Harness, Software-Rendering), alle 13 Strecken gesichtet:**
  - „Balken": Aquilaris-Schrägkurve und Oovo-Startkurve (Überhöhung 0,16) – nichts ragt mehr aus der Fahrbahn.
  - Höhlen: Frost, Magma (mit `bright`), Howler, Kristall, Dschungel – durchgehend, kein offener Himmel, Gabelung mit Felspfeiler.
  - Untergründe/Seen: Eissee, Lavasee, Methansee, Sumpf, Spiegelsee, offene See, Plateau, Dünen, Strand, Regolith, Stationsdeck.
  - HQ-Assets: Schneekiefern (Frost, Howler), Felsbrocken und Kakteen (Dünenpass, Mos Espa).
- **Frame-Zeit vorher/nachher** (Software-Rendering, 768 × 432, 6 Frames, über `readPixels` synchronisiert – nur als Verhältnis brauchbar):

  | Ansicht | Session 19 (`d7b9c4b`) | Session 20 | Unterschied |
  |---|---|---|---|
  | Boonta, Übersicht `c` | 914 ms | 928 ms | +1,5 % |
  | Boonta, offene Fläche `o` | 684 ms | 770 ms | +12,6 % |
  | Frost, Tunnel `u` | 1064 ms | 1039 ms | −2,3 % |
  | Frost, offene Fläche `o` (jetzt Eissee) | 728 ms | 829 ms | +13,9 % |

  Normale Passagen und Tunnel: gleich schnell. Offene Flächen: etwa 13 % langsamer (zusätzliche Boden-/Seefläche mit eigenem Material).

### Nicht verifiziert
- **Probefahrt und FPS auf echter GPU.** Die Sandbox hat keine GPU; die Tabelle oben misst Software-Rendering (~1 s je Frame). Die HUD-FPS-Anzeige ist dort unbrauchbar.
- **Fahrgefühl der Untergründe** (Eis −25 % Haftung, Tempo-Abzug in Schlamm/Dünen): nur die KI ist in der Node-Simulation darüber gefahren.
- **Optisch offen** (gesehen, nicht bearbeitet): Felsschichtung am Höhlengewölbe stark gebogen; Vulkan-Höhle ohne `bright` fast schwarz; fußspurartige Flecken im Schnee-Fotoset; Fahrbahn-Falten an vier sehr engen Knicken (siehe `TODO.md`).
- **Sandbox-Grenzen:** 2 GB RAM. Zwei Strecken mit 1024-px-Fotosets in einer Browser-Sitzung sprengen den Speicher (Software-GL hält jede Textur im RAM) → je Lauf eine Strecke, bei `check:gpu` `QUERY='?tex=256'`. Browser nie gleichzeitig mit `tsc`/Simulation starten.

---

## Stand: 2026-11-20 (Session 19) – Bugfixes, Brücken/Unterführungen, futuristische Schleusen, verzweigte Höhlen, Pod-Aufwertung

### Erledigt in Session 19
**Bugs**
1. **Tunnel-Deckenhöhen deutlich erhöht (`trackBuilder.ts`, `world.ts`, `physics.ts`):** Aquilaris-Unterwasserröhren **19,5 m** (vorher 9 m; weiterhin 858 m voll unter Wasser mit Panorama-Ozeanfenstern), Ando-Prime-Gletschertunnel **22,5 m** (vorher 13 m), übrige Standard-Tunnel **19,5 m**, Abkürzungstunnel **18,5–20,5 m**, Höhlen **20,5–22 m** am Eingang bis **30–38 m** in den Kammern; breitere Schulterwölbung (`hw + 3,4 m`), Decken-Stalaktiten strikt ≥ 17,5 m über der Fahrbahn.
2. **Schwebende Bodenplatten an Erhebungen/Schrägkurven behoben (`props.ts`, `trackDetail.ts`, `world.ts`, `scifi.ts`):** Reparatur-/Ladepads, Rampen-Warnpfeile, Rampen-Abschlussleisten und Start-/Ziellinien folgen jetzt Vertex-für-Vertex exakt Steigung, Straßenkrone und Querneigung (mit eingezogenem Randflansch); Geysir-/Lavaschlote, Startboxen, Straßen-Studs, Hindernis-Warnringe und Kisten sind an 3D-Steigung + Querneigung ausgerichtet und im Belag verankert; Licht-Leitstreifen bündig eingelassen statt +36 cm schwebend.
3. **Schwebende Nebelschicht bei Gefälle behoben (`atmosphere.ts`, `Game.ts`):** Ursache war `max(y - baseY, 0)` (ergab unterhalb von `baseY` schlagartig 0 Höhennebel und darüber eine scharfe horizontale Kante). Ersetzt durch die exakte C¹-stetige Stammfunktion `F(u) = min(u, 0) + (1 - exp(-b·max(u, 0))) / b` mit weicher L'Hôpital-Überblendung für flache Sehstrahlen und tieferem Talboden `min(avgY - 14, minY - 6)`.
4. **Schwebende Bögen & Strecken-Assets verankert (`world.ts`, `props.ts`, `setPieces.ts`, `trackDetail.ts`, `scifi.ts`, `landmarks.ts`):** Felsbögen, Einsturz-/Eisbögen, Vista-Naturbögen, Checkpoint-Tore, Sponsoren-Traversen, Startportale, Schleusen, Schwenkbrücken, Felsrinnen, Tribünenstützen, Holo-Masten, Schwebe-Baken, Schilderpfosten und Felsen/Wracks erhalten tiefe Geländefundamente bzw. Ausleger-Konsolen an der Fahrbahnunterseite (Oovo IV / Aquilaris).
5. **Dschungelfluss-Sprint Abkürzungs-Ende behoben (`trackBuilder.ts`, `world.ts`):** `openL`/`openR` prüfte gegen `samples[ia].hw` statt der tatsächlichen Breite am Ausgang (offene Fläche 108 m → 24-m-Felswand stand mitten in der Piste) und ignorierte die Querneigung (−4,66 m Höhenversatz). Jetzt exakte Höhen-/Querneigungs-Anpassung (`stitchBranch`), sanft auslaufende Klippenwände und ausgesparte Böschungsschürzen auf allen 13 Strecken.

**Verbesserungen / Soll**
6. **Welt/Map „Ökumenopolis" (`city` / `neon`) vollständig entfernt:** 13 Strecken auf 8 Planeten; gespeicherte Profile mit `trackId: 'neon'` fallen sauber auf `boonta` zurück.
7. **Feinere Gewitterblitze (`weather.ts`):** 64-teiliger fraktaler Hauptkanal (~3,4× feiner, kamera-senkrechtes 3D-Ribbon mit Quer-Falloff) + 5 sich verjüngende Hauptäste + 7 haardünne Zweigverästelungen + dezente Korona.
8. **Strecken kreuzen sich über/unter sich selbst (`data.ts`, `trackBuilder.ts`, `terrain.ts`, `world.ts`, `physics.ts`, `screens.tsx`):** 12 höhengetrennte Kreuzungen (Δy = 35–41 m) auf 10 Strecken – obere Führung als Hohlkasten-Viaduktbrücke (`buildBridges`) mit Querträgern, Leuchtkanten, Widerlagern und Zwillingspfeilern (frei von der unteren Piste), untere Führung als Unterführungs-Tunnel (`tun = 4`) oder offene Schlucht; Terrain folgt der unteren Ebene; Karten/Minimap zeigen Brücken abgesetzt.
9. **Futuristische, in die Szenerie verschmolzene Schleusen statt Fallgitter (`setPieces.ts`):** 3-spurige Panzerschleusen mit seitlichen Fels-/Eis-/Kristall-/Stations-Monolithen, Überkopf-Schleusenbrücke (solide Kollision), hydraulischen Verbund-Schottplatten, Plasma-Dichtnaht, dezentem Warn-Kraftfeld und Statusleisten.

**TODO-Punkte**
10. **Verzweigte & verbreiterte Höhlen (`trackBuilder.ts`, `world.ts`, `physics.ts`):** Höhlen auf Vulkan (2 Abzweige!), Ando Prime (`frost`, `howler`), Kristall und Dschungel verzweigen in eine echte zweite unterirdische Höhlenröhre (`Path.isCave`), die sich weiter hinten wieder vereint (inkl. Fels-Gabelpfeiler mit Doppel-Leuchtpfeil und KI-Feldaufteilung); Kammern verbreitern sich seitlich (`caveW`) mit modelliertem Höhlenboden-Mesh, Leuchtadern und Stalagmiten.
11. **Podracer-Aufwertung (`settings.ts`, `podMaterials.ts`, `podParts.ts`, `podDesigns.ts`, `podModel.ts`, `post.ts`, `Game.ts`, `screens.tsx`):** 6 wählbare Lackiermuster + 3 Lackfinishes (Klarlack, Metallic, Matt) + 8 Vorlagen im Hangar, individuelle Alien-Pilotenköpfe/-Helme je Spezies, Cockpit-Überrollbügel & HUD-Ring, feinere Einlass-Statoren & Plasma-Koppler, seitengetrennte verbogene/flatternde Schadensklappen und Düsen-Hitzeflimmern auch für die zwei nächsten Gegner-Pods.

### Verifiziert
- `npm run check` (45 s Standard **und** 90 s Sturm-Haftung `GRIP=0.88`): 13/13 Strecken bestanden, **0 Tode, 0 NaN, 0,00 m Wand-Durchdringung, 0 Teleports**, Deck- & Overhead-Selbsttests grün.
- Node-Geometrie- & 3D-Welt-Audit: alle 13 kompletten 3D-Welten + alle 10 Podracer (Hero & Rival, 6 Muster, 3 Finishes) + Blitz + Nebel gebaut (12 410 Meshes, 0 NaN/Inf, 0 Abkürzungs-/Kreuzungsfehler); KI-Befahrung aller Höhlenabzweige und der Dschungel-Abkürzung bestanden.
- `npm run build` → `dist/index.html` fehlerfrei; `npm run save` → `.archive/git` + `.archive/podracer-git.tar.gz.b64.txt` (beide Wiederherstellungstests ok).

### Nicht verifiziert
- Optische Probefahrt & FPS auf echter GPU (kein Browser in dieser Sandbox): Brücken-Unteransichten, neue Schleusen, Höhlengabelungen, feine Blitze und Gegner-Hitzeflimmern im Live-Rennen sichten.

---

## Stand: 2026-11-20 (Session 18) – Strecken erweitert, längere Tunnel/Höhlen, offene Flächen, HQ-Bäume, echte Foto-Texturen

### Erledigt in Session 18
1. **Alle 14 Strecken prozedural erweitert (`trackBuilder.ts → controlPoints`):** Layout ×1,3 skaliert (`TRACK_SCALE`), in lange Segmente werden **S-Kurven** eingefügt (mit Abstandsprüfung ≥ 185 m zum Rest des Layouts), die zwei längsten Segmente werden zu **offenen Flächen** (Fahrbahn bis ~108 m breit, ohne Schluchtwände/Tunnel). Start-/Zielgerade bleiben wie entworfen. Die Kontrollpunkte in `data.ts` sind unverändert; Abkürzungs-Hinweise werden über `map` umgerechnet.
   - Ergebnis: **7,0–13,9 km** je Strecke (vorher 5,2–9,9 km), 11–27 Kurven (vorher 5–9 … gemessen an Richtungswechseln), 1,6–4,4 km offene Fläche, alle Abkürzungen weiter vorhanden.
   - Mehr Wellen in der Höhe (±19 m / ±8 m), Hindernisse/Geysire/Felsbögen in der Anzahl angehoben.
2. **Längere Tunnel:** Standard-Tunnel 260–560 m (vorher 120–240 m), Aquilaris-Unterwasserröhren 650–840 m, davon 230–340 m eben unter Wasser.
3. **Komplexere Höhlen:** Höhlensysteme jetzt auf **Vulkan (5 Kammern, ~1,1 km), Ando Prime (3 Kammern) und Kristallschluchten (3 Kammern)**: abgesenkte Fahrbahn, Kammern mit hochgewölbter Decke (12,5 → 18–24 m), offene Lichtschächte dazwischen, **Felssäulen als Hindernisse** in den Kammern, Stalaktiten und Stalagmiten.
4. **Mehr Deko:** Dekor-Anzahl skaliert mit der Streckenlänge + 20 % (`dens` in `scatterDecor`, max. ×2,6), mehr Landmarken auf langen Strecken.
5. **HQ-Bäume (`decorGeo.ts → jungleTreeGeometry`, `foliage.ts`):** Stamm/Äste mit **echter Rinden-Textur**, dunkler Kronenkern + **Blattwerk-Karten** (Zweige mit Einzelblättern, Alpha-Test; 16 je Kronenlappen), Zweige in die Seitenkronen, Lianen. 986 Dreiecke (vorher 1 347), Fern-LOD 368. Ein Material mit Atlas (Rinde | 4 Zweig-Kacheln | weißer Streifen) + `alphaMap`.
6. **Echte Foto-Texturen (`photoTex.ts`, `photoAssets.ts`, `src/assets/tex/*.jpg`):** vier Pexels-Fotos (Fels, Rinde, Sand, Boden), offline kachelbar gemacht und beleuchtungsbereinigt (`tools/photos/process.mjs`). Sie modulieren die prozeduralen Textursätze beim Einpacken: Albedo × Foto-Helligkeit, Normal + Foto-Relief, Höhe + Foto. Zuordnung `KIND` in `photoTex.ts`: rock/basalt → Fels, sand → Sand, jungle/mud/gravel/cracked → Boden. Paletten und Schichtbänder bleiben.
   - Quellen: Fels Pexels 19786610 (Alfo Medeiros), Rinde 7717796 (Marina Leonova), Sand 19215109 (Alejandro Henriquez), Boden 3859201 (Engin Akyurt). Neu erzeugen: Fotos nach `/tmp/ph/{rock2,bark2,sand1,soil1}.jpg` laden, `node process.mjs <repo>/src/assets/tex`.
   - Der Harness braucht jetzt `--loader:.jpg=dataurl` beim esbuild-Aufruf (in `run.sh` und `gpu.mjs` eingetragen).

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden (0 Abstürze, 0 NaN, 0 m Wand-Durchdringung, Deck-Selbsttest ok, 0 Teleports). Layout-Report je Strecke in der CI-Ausgabe (`layout: … km · … corners · … shortcut(s) · open flats …`). Alt/Neu-Vergleich: `NO_EXPAND=1 npm run check`.
- Standbilder (WebGL2): HQ-Baum nah + Wald, offene Fläche auf Boonta, Schluchtwand mit Foto-Relief, Magma-Höhlenkammer mit Säule, Magma-Übersicht.
- WebGPU-Konsolencheck Dschungel (neues Baum-Material) + Magma (Höhle): 0 Fehler. Standbilder Ando-Prime-Tunnel und Aquilaris-Unterwassertunnel nach der Erweiterung in Ordnung.
- App-Smoke-Test (gebaute App mit Foto-Texturen und Workern, Dschungel): bestanden (Rennen, HUD, Pause, Grafik-Menü, Tasten- und Gamepad-Belegung).

### Nicht verifiziert
- **Bildrate** auf echter GPU: größere Welten (Fläche ×1,7), bis ×2,6 Dekor, alpha-getestetes Blattwerk.
- **Fahrgefühl** der neuen Kurven und Flächen; die S-Kurven sind nur per Simulation befahren.
- Blattwerk-Schatten (Alpha in der Schatten-Pass) nicht gesichtet.
- Build wuchs um ~0,55 MB (Fotos als Base64) auf ~2,8 MB.

---

## Stand: 2026-11-19 (Session 17) – befahrbare Tunneldecks, Unterwassertunnel, Höhle, Quadra Lumber, Boost-Überziehen, Cockpit-Pendel

### Erledigt in Session 17
**Bugs**
1. **Teleport in den Tunnel:** Ursache war die Deckenkollision – jeder Pod über der Decke wurde auf Deckenhöhe gesetzt, auch wenn er von außen über das Portal flog. Jetzt hat jeder Tunnel ein **befahrbares Deck** (`TUNNEL_DECK` = 1,2 m über der Decke). Beim Eintritt in einen überdachten Abschnitt wird einmal entschieden: über der Kuppe → `PodState.upper = true` (fährt oben, Boden = Deck), sonst innen (Decke gilt). Am Deckende fällt der Pod auf die Strecke zurück.
   - Tunnel sind jetzt „unterirdisch": Innenröhre + **Erdwall** (Böschung bis zum Gelände) + geschlossene Portalwände; Deck mit Fahrbahn-Textur und Leuchtkanten (`world.ts → buildTunnel`).
   - Tunnel werden jetzt **vor** Hindernissen/Geysiren/Set-Pieces platziert (`trackBuilder.ts`), die sich fernhalten. Drei Arten (`Sample.tun`): 1 Standard, 2 Unterwasser, 3 Höhle.
2. **Aquilaris – Unterwassertunnel:** 2 Röhren (360 m und 456 m), die Fahrbahn taucht 14–16 m unter den Meeresspiegel (max. 20 % Gefälle), Stahl-Caisson, **Fenster mit Ozean-Ansicht** (prozedural: Tiefenverlauf, Kaustik, Lichtstrahlen, Fischschwärme) dort, wo die Röhre unter Wasser liegt. Keine Schanze innerhalb von 600 m davor. Meeresspiegel ist jetzt fest (`td.seaY`); die Wasserfläche hat ein Loch-Raster über den Röhren-Enden (`tunnelWaterMask`), sonst schnitte sie durchs Tunnelinnere.
3. **Magma-Inferno – Höhlensystem:** 600 m langer Abschnitt, 11 m ins Gelände abgesenkt, in drei Teilen überdacht (176 / 148 / 108 m) mit zwei offenen Lichtschächten; raue Felsröhre, Stalaktiten, Glutadern. Keine Schanze innerhalb von 520 m davor. Dazu weiterhin 2 Standard-Tunnel.
4. **Quadra Lumber:** vier schlanke Triebwerke im Quadrat (oberes Paar direkt über dem unteren), **X aus zwei Energieblitzen** (`PodLayout.binders`), Verbindungsstreben.
5. **Kein Staub/Gischt am eigenen Pod:** die Partikel wurden bis 12 m vor der Kamera ausgeblendet, starteten hinter den Triebwerken und blieben mit 20 % Pod-Tempo sofort zurück – sichtbar wurden sie erst hinter der Kamera. Jetzt: Start unter den Triebwerken, sie werden im Fahrtwind mitgerissen (80 % Tempo, starker Luftwiderstand), driften leicht nach außen, Ausblendung erst ab 8,5 m, deutlich deckender und heller als der Boden.
6. **Halbes Cockpit in der Ego-Ansicht:** die Near-Plane (0,8 m) schnitt das Cockpit. Cockpit wird in der Fahrer-Ansicht ausgeblendet (Triebwerke und Leitungen bleiben), Kamera folgt dem Cockpit-Pendel.

**Soll**
7. **Boost überziehen:** am Hitze-Maximum kann der Boost bis zu 3 s weiter gehalten werden, kostet 3,2 Schaden/s je Triebwerk; danach Zwangsabschaltung bis 55 %. HUD zeigt „ÜBERZOGEN · NOCH x s" + ablaufenden Balken.
8. **Triebwerksglühen als Überhitzungs-Anzeige:** Glut beginnt an der Düse dunkelrot und wandert mit der Hitze nach vorn (Farbverlauf gelbweiß → orange → dunkelrot, am Limit schwach bis zur Blitz-Kopplung); folgt der Hitze träge (Metall wärmt langsam auf, kühlt langsam ab). Ab 86 % Funken, beim Überziehen mehr.
9. **Mehr Triebwerkshub** beim Lenken (außen +1,5 m, innen −0,5 m, lebhafteres Wippen).
10. **Spiegelungs-Auflösung** einstellbar (35–100 %, Standard 75 %, vorher fest 35 %; Ultra 100 %).
11. **Cockpit-Pendel:** Cockpit schwingt an den Leitungen – nach außen in Kurven/Slides, nach hinten beim Beschleunigen, nach vorn beim Bremsen, federt bei Landungen (nur eigener Pod).
12. **Energieblitz feiner, mehrere gleichzeitig:** haardünner Kern + vier dünne, unabhängig flackernde Bögen.
13. **Staub/Gischt verstärkt** (siehe 5).
14. **Schwerelosigkeit zentrierter:** Feder zur Röhrenmitte wieder nah am alten Wert, weniger Taumeln; das höhere Tempo bleibt.

### Verifiziert
- `npm run check` (14/14): 0 Abstürze, 0 NaN, 0 m Wand-Durchdringung. **Deck-Selbsttest:** ein Pod wird kurz vor dem ersten Standard-Tunnel 24 m angehoben → fährt auf allen 12 Strecken mit Standard-Tunnel über das Deck (55–960 Frames), **0 Teleports nach unten** (kein Pod verliert > 4,5 m Höhe in einem Frame).
- Tunnel-Report: Aquilaris 2 × Unterwasser (Fahrbahn 14,4 / 15,9 m unter dem Meer), Magma Höhle 176 + 148 + 108 m + 2 Standard; alle anderen 2–4 Standard.
- WebGPU-Konsolencheck Aquilaris + Magma: 0 Fehler. Layout-Test (mit neuem Regler): keine Scrollbalken, einheitliche Skalierung.
- Standbilder: Quadra Lumber 2×2; Unterwassertunnel Portal + innen mit Ozean-Fenstern; Höhle innen; Boonta-Tunnel mit Erdwall; **Staubfahne am eigenen Pod (Boonta) und Gischt (Dschungel, Regen) sichtbar**.
- App-Smoke-Test (gebaute App, Aquilaris mit Unterwassertunneln): bestanden.
- **Lehre aus der Staub-Fehlersuche:** die Aufnahmen zeigten lange keinen Staub, weil (a) die Wolken mit nur 20 % Pod-Tempo sofort zurückblieben und erst hinter der Kamera sichtbar wurden – jetzt 80 % + starker Luftwiderstand (reiten im Fahrtwind mit); (b) der Test-Harness 170 Updates ohne Rendern fährt und der Partikel-Pool dabei noch nicht hochgeladene Bereiche verwarf – Pool sammelt Bereiche jetzt, Harness ruft `fullUpload()`. (b) betraf nur den Test, nicht das Spiel.

### Nicht verifiziert
- **Sprung aufs Tunneldach von Hand** (nur simuliert), Fahrgefühl auf dem Deck, Sturz am Deckende (14 m, kostet etwas Schaden).
- X-Blitz, feine Bögen, wanderndes Glühen, Funken, Cockpit-Pendel, Überziehen-Anzeige nicht in Bewegung gesehen.
- Unterwassertunnel von außen (Caisson an der Wasserlinie, Loch-Raster) nicht gesichtet – dort sind Darstellungsfehler am wahrscheinlichsten.
- Cockpit-Pendel und Hitzeglühen gibt es nur am eigenen Pod (Gegner-Modelle sind statisch gemerged).

---

## Stand: 2026-11-19 (Session 16) – Düsenklappen, Bogen-Kollision, Start-Disziplin, Tunnel, Sci-Fi, Schwerelosigkeit, Wetter, Gamepad

### Erledigt in Session 16
**Bugs**
1. **Boost öffnete die Bremsklappen:** mein Fehler aus Session 15. Jetzt öffnen sich die **Düsenklappen am Triebwerksausgang** (`podParts.ts → petals`, Attribut `aPet`; ein gemeinsames Material `petalMaterial()`, Öffnung je Mesh über `mesh.userData.open`). Seitliche Bremsklappen reagieren wieder nur auf die Luftbremse (+ Klappern bei Schaden).
2. **Bögen ohne Kollision:** die 6–10 **Felsbögen** je Strecke (`addArches`) und der **Einsturz-Bogen/Eisbogen** (Set-Piece; nach dem Einsturz nur noch die Stümpfe) sind jetzt massiv (`Overhead.arch` mit `inner`, `yOff`, `thick`, `sp`). Checkpoint-Bögen, Traversen, Startportal waren es schon. Tunnel haben Deckenkollision.
3. **Gegner fahren am Start ineinander:** KI hält die ersten ~4,5 s ihre Startspur und fädelt bis 7,5 s auf die Ideallinie ein; kein seitliches Ausweichen in der Startphase; wer dicht auffährt, nimmt Gas weg. Startreihen 26 m statt 18 m auseinander (Pods sind bis 22 m lang).

**Soll**
4. **Startnummern-Schilder entfernt.**
5. **Drift mit Heck-Ausbruch:** im Slide +60 % Gier-Wirkung, Gierrate baut sich träge auf und schwingt nach (weich), Begrenzer erst bei ~60° Schräglauf.
6. **Wetter stärker:** bis 4 200 Wetterpartikel (vorher 2 000), dickere/deckendere Regenstreifen, größere Schneeflocken, Nebel/Sichtweite deutlich dichter je Wetter, Regenböen auch bei normalem Regen, Böen-Schwaden +60 % und deckender, Blitze ~40 % häufiger und heller, Sturmböen rütteln an der Kamera, Regen/Wind lauter, doppelt so viele Aufschlag-Spritzer.
7. **Sci-Fi (`scifi.ts`, neu):** laufende **Licht-Leitstreifen** an beiden Fahrbahnrändern (Oovo, Aquilaris, Malastare, Ökumenopolis: ganze Strecke; alle Welten: in Tunneln), **Holo-Tafeln** auf Projektormasten, **Schwebe-Baken**, **Energieleitungen** mit Leuchtmuffen neben der Strecke. Malastare hat jetzt ein getäfeltes Metall-Renndeck (`cityRoad`) und Energiemasten.
8. **Tunnel auf allen Strecken (`trackBuilder.ts`):** 2 je Strecke, 3–4 auf Aquilaris, Oovo IV, Ando Prime, Malastare (je 120–240 m, gesamt 280–660 m je Strecke). Bevorzugt in Schluchten; nie an Start, Rampen, Lücken, Zero-G, Abkürzungs-Einmündungen, Set-Pieces, Geysiren. Tunnelbau generalisiert (`buildTunnel`: je Dach-Abschnitt, mit Querneigung geschert, Portale, Rippen, Deckenlampen).
9. **Schwerelosigkeit:** keine Feder mehr zur Röhrenmitte – der Pod driftet frei, `↑`/`↓` sind Schubdüsen nach unten/oben, Impuls bleibt; +28 % Höchsttempo, mehr Schub, kein Luftwiderstand; seitlich schwebend aber steuerbar; Pod und Triebwerke taumeln/wippen langsam; Sichtfeld +8°; Sternenstaub zieht vorbei. Kurz vor dem Röhrenende wird der Pod sanft auf Schwebehöhe geführt.

**TODO-Punkte**
10. **Boost-Klappen bei Gegnern:** erledigt (gleiches Material, pro Mesh `userData.open`).
11. **Grafik live:** zusätzlich **Volumetrie** (Nebel-Schichten per Uniform, Lichtkegel) und **Textur-Filter**. Weiter nur per Neustart: Texturauflösung, Geometrie/Detaildichte, Tessellation, Material-Optionen, SSR, **Kaskaden-Schatten** (nicht umgesetzt: Schatten-Knoten ist in alle beleuchteten Materialien kompiliert; nach der SSR-Erfahrung nicht riskiert), Renderer.
12. **Tribünen/Landmarken am Hang:** Tribünen haben einen 18 m tiefen Fundamentblock; Landmarken sitzen auf dem tiefsten Punkt (5 Höhenproben).
13. **Gamepad-Belegung im Menü** (`keymap.ts → PadMap`, `ui/KeyBindings.tsx → PadBindings`): Aktion anklicken, Taste drücken oder Stick bewegen; Trigger/Sticks bleiben analog; „Standard" setzt zurück.
14. **CSM auf Ultra:** ist seit Session 14 im Ultra-Preset eingeschaltet (TODO-Eintrag war veraltet).

### Verifiziert
- `npm run check` (14/14): 0 Abstürze, 0 NaN, 0 m Wand-Durchdringung. **Start-Berührungen** (Paare in den ersten 8 s): vorher Ø 8,3 (2–15), jetzt Ø 2,6 (0–5). **Zero-G:** Ø 147 m/s (Oovo) bzw. 160 m/s (Henker) in den Röhren gegenüber 123 / 113 m/s außerhalb. **Tunnel:** 2–4 je Strecke.
- Standbilder (WebGL2): Malastare-Tunnel mit Portal, Lampen, Leitstreifen und Metall-Deck; Malastare im Gewitter (dichte Regenstreifen); Oovo Zero-G-Röhre und Tunnel; Aquilaris im Sturm mit Leitstreifen und Energieleitung; Pod mit Düsenklappen.
- **WebGPU-Konsolencheck** (0 Fehler): Oovo IV + Malastare inkl. Live-Umschalten (Volumetrie aus, Textur-Filter, Bloom, AO, AA, Schatten …), Aquilaris bei Gewitter/Nacht. WebGL2: Ando Prime mit Live-Umschalten fehlerfrei.
- **Layout-Test:** 1280×720, 1920×1080, 800×1000 – einheitliche Skalierung, keine Scrollbalken, auch mit dem neuen Gamepad-Abschnitt.
- **App-Smoke-Test** (gebaute App, Oovo IV): Rennen, HUD, stumme Pause, Grafik im Pausemenü, Taste umbelegen und **Gamepad-Umbelegen** (simuliertes Pad: Boost → „L3") bestanden.

### Nicht verifiziert
- **Fahrgefühl:** Heck-Drift, Schwerelosigkeit, Start (Mensch + 10 Gegner; die Simulation hat keinen Spieler-Pod mit menschlichem Verhalten).
- Düsenklappen in geöffnetem Zustand, Holo-Tafeln, Blitz/Böen-Stärke und Sternenstaub nicht in Bewegung gesehen.
- Bogen-Kollision: nur die gerade Test-Traverse per Selbsttest; Felsbögen liegen meist so hoch (≥ 12 m am Rand), dass die KI sie nie berührt.
- Tunnel: frei stehende Tunnel (ohne Schlucht) von außen nicht gesichtet; Gelände kann die Röhre schneiden.
- Start-Berührungen sind nicht null (Ø 2,6 Paare streifen sich beim Einfädeln).

---

## Stand: 2026-11-19 (Session 15) – Bugfixes (UV-Schmieren, UI-Skalierung, Trümmer, SSR), Drift, Staubfahnen, Live-Grafik

### Erledigt in Session 15
**Bugs**
1. **Schmierige/langgezogene Bodentextur (alle Strecken, am stärksten spät auf Sprints):** Die Fahrbahn-Texturkoordinate war `zurückgelegte Strecke / Kachellänge(Breite)`. Wo sich die Streckenbreite ändert, wird damit die GESAMTE bisherige Strecke durch eine andere Zahl geteilt → Textur wird immer stärker gestreckt/gestaucht, je weiter man ist. Jetzt segmentweise integriert (`world.ts`, Road-Deck).
2. **Halb durchsichtige Trümmer:** (a) Eisbrücken-Material hatte 88 % Deckkraft → jetzt deckend. (b) Bogen-/Eisblöcke sind Torus-Segmente ohne Stirnflächen; nach dem Herausbrechen sah man durch die offenen Enden → Deckel ergänzt. (c) Die Trümmer-„Brocken" zerplatzender Hindernisse waren weiche Sprites → jetzt echte, deckende Brocken (`debris.ts`, instanziert, prallen ab, schrumpfen am Ende).
3. **UI uneinheitlich (Hangar winzig, Steuerung riesig):** `Fit` skalierte jede Ansicht nach ihrer eigenen Höhe. Jetzt **ein** Faktor für alle Ansichten: `min(Breite/1180, Höhe/720)`; jede Ansicht ist auf die virtuelle Höhe 720 px ausgelegt (Flex-Spalten). Notfall-Schrumpfen nur, wenn eine Ansicht zu hoch ist – der Layout-Test schlägt dann fehl.
4. **Schwebende Objekte an Hängen:** Dekor, Streckenrand-Props und Relaistürme saßen auf der Geländehöhe ihres Mittelpunkts. Jetzt auf dem tiefsten Punkt ihrer Standfläche (5 Höhenproben).
5. **Keine Spiegelungen in Pfützen:** Die SSR verwarf alle Nichtmetalle. Der Puffer führt jetzt „Reflektivität" statt Metallanteil (glatte, nasse Flächen zählen mit); SSR-Reichweite 42 m, stärker; nasse Fahrbahn glatter. SSR ist jetzt auch in der Voreinstellung „Hoch" an.

**Soll**
6. **Staubfahnen:** jeder Pod zieht unter beiden Triebwerken eine Staubfahne (dichter/länger mit Tempo, ab 16 m/s), bei Nässe Gischt. Gegner näher als 24 m vor der Kamera nur angedeutet (Sicht). Auf Metallstrecken (Stadt, Oovo) 30 %.
7. **Triebwerksklappen** öffnen beim Boost (weich, leichtes Flattern) und schließen wieder (nur Spieler-Pod und Hangar; Gegner-Modelle sind statisch gemerged).
8. **Mehr Drift:** Seitenhaftung im Slide 3,5 % (vorher 8,5 %), Haftung kehrt in ~0,7 s zurück, Eindreh-Begrenzer erst ab ~50° Schräglauf, weniger Bremswirkung. Gegner sliden mit 45 % Stärke.
9. **Rolle:** Anheben/Neigen lenken mit +45 % Wirkung (vorher −40 %), Eingabe ×1,25, Lenkung spricht schneller an.

**TODO-Punkte**
10. **Checkpoint-Bögen haben Kollision** (`Overhead.arch`): Decke folgt der Halbellipse – am Rand niedrig, in der Mitte hoch.
11. **Grafik live schalten** (`Game.applyLiveGfx`): zusätzlich Bloom (+Stärke), AO, God Rays, Unschärfe, Kino-Shader, Kantenglättung, Linseneffekte (Post-Kette wird neu gebaut), Schatten an/aus + Auflösung (nicht bei Kaskaden-Schatten), Partikel, Sichtweite. Neustart weiter nötig: Texturen, Geometrie/Detaildichte, Tessellation, Parallax/Bump/Shader-Details, Batching, Renderer, Anisotropie, Kaskaden-Schatten, Volumetrie und **SSR** (SSR ändert die Render-Ziele der Szene; live umgeschaltet gab es auf WebGPU Pipeline-Fehler – getestet und deshalb herausgenommen).
12. **Podracer-Aufwertung:** Startnummern-Tafel hinter dem Cockpit (1 gemeinsames Material/Atlas), Boost-Klappen, Staubfahnen.

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden (0 NaN, 0 m Wand-Durchdringung, KI-Neigen ≤ 1,3 %).
- **Layout-Test** (`pui.mjs`): gleiche Skalierung auf allen Ansichten (1280×720 → 1,00 · 1920×1080 → 1,50 · 1024×600 → 0,83 · 800×1000 → 0,68 · 2560×1440 → 2,00), kein Notfall-Schrumpfen, keine Scrollbalken. Screenshots gesichtet.
- **Standbilder:** Dschungel nach der Abkürzung vorher (Streifen bis zum Horizont) / nachher (normale Schlammtextur); Startnummern an Spieler- und Gegner-Pods.
- **Live-Umschalten** (Harness `?live`: Bloom, AO, God Rays, AA, Unschärfe, Kino-Shader, Linseneffekte, Schatten aus/an, Partikel, Sichtweite): WebGPU Boonta + Stadt bei Regen → 0 Konsolenfehler; WebGL2 Boonta → ebenfalls fehlerfrei. Zwei Fehler dabei gefunden und behoben: (1) SSR live umzuschalten erzeugt auf beiden Backends ungültige Pipelines → SSR ist jetzt Neustart-Option; (2) asynchrones Warm-up nach dem Neuaufbau kollidierte mit laufenden Frames → entfernt.
- **SSR:** WebGPU Dschungel bei Gewitter mit SSR 0 Fehler. Standbild Stadt bei Regen: Triebwerksglühen spiegelt sich unter dem Pod auf der nassen Fahrbahn (im Software-Rendering körnig; Weichzeichnung danach erhöht, nicht erneut gesichtet). Gebäude-Spiegelungen kaum sichtbar.
- **App-Smoke-Test** (gebaute App): Rennen, HUD-Seiten, stumme Pause, Grafik im Pausemenü ohne Scrollen, Tasten umbelegen – bestanden.

### Nicht verifiziert
- **Fahrgefühl** von Drift und Rollen-Lenkung (nur Simulation).
- In Bewegung nicht gesehen: Staubfahnen, Boost-Klappen, solide Trümmer, gedeckelte Bogenblöcke, Bogen-Kollision (nur gerade Traverse per Selbsttest geprüft).
- Hang-Sitz der Objekte nicht einzeln gesichtet; Tribünen am Start und Landmarken nutzen den alten Weg.
- Schatten-Umschalten zur Laufzeit optisch (nur auf Fehlerfreiheit geprüft).

---

## Stand: 2026-11-19 (Session 14) – Bugfixes, responsive UI, Rollen-Steuerung, zerstörbare Hindernisse, Textur-Cache

### Erledigt in Session 14
**Bugs**
1. **Hand-/Luftbremse zu hart (`physics.ts`):** progressiver Slide über `slideK` (0→1 in ~0,3 s). Gier-Verstärkung ×1,2–1,47 statt ×1,7–2,4, Seitenhaftung fällt auf 8,5 % (Pod driftet auf seinem Schwung), Bremswirkung im Slide 30 %, Schräglaufwinkel-Begrenzer ab ~35° (kein Eindrehen), Haftung kehrt nach dem Loslassen über ~0,45 s zurück.
2. **Schadensanzeige L/R vertauscht:** intern ist „L" = lokales x < 0 = im Verfolgerbild das **rechte** Triebwerk. `Game.hud()` tauscht jetzt.
3. **Klappen klappern im Hangar/am Start:** mein Fehler aus Session 13 (`update()` bekommt Gesundheits-, nicht Schadenswerte). Klappern jetzt nur unter 45 % Triebwerkszustand.
4. **Steuerleitungen durchs Triebwerk (`podModel.ts → buildFlexCables`):** die Leitung lief in gerader Linie vom Cockpit zum Pylon bei 58 % der Gondellänge, also durch die hintere Gondelhälfte. Jetzt: frei hängender Bogen bis zu einem Sattel knapp über/hinter dem Gondelheck, dann mit zwei Schellen auf der Gondeloberseite zum Pylon.
5. **Ton im Pausemenü:** `onKey` rief nach jedem Tastendruck `audio.resume()` – auch direkt nach dem Pausieren. Jetzt nur, wenn nicht pausiert; zusätzlich wird in der Pause der Master-Pegel auf 0 gesetzt.
6. **Banner zu niedrig, ohne Kollision:** Sponsoren-Traversen von 11 m auf 21 m (Banner-Unterkante ~17,7 m). Neu `TrackData.overheads` (Traversen + Startportal): wer hineinfliegt, wird nach unten (oder oben) abgewiesen, verliert 10 % Tempo und 5–18 Schaden. Checkpoint-Bögen 46 % höher (ohne Kollision).

**Soll**
7. **Responsive UI ohne Scrollbalken (`ui/Fit.tsx`):** Inhalt wird bei virtueller Breite gesetzt, gemessen und so skaliert, dass er in beide Richtungen passt (klein und groß); überschüssige Breite verbreitert das Layout. Breakpoints sind Container-Queries (`@3xl:`, `@5xl:`), nicht mehr Viewport-Queries. Einstellungen haben Reiter „Grafik & Ton" / „Steuerung", die Streckenliste ist einzeilig-kompakt, das HUD skaliert mit dem Fenster (Referenz 1280 × 720).
8. **Planeten-Filter** in der Streckenwahl (Auswahlfeld, kombiniert mit Rundkurs/Sprint).
9. **„Ultra" = alles Maximum** außer Sichtfeld und Bloom-Stärke (Render-Skalierung 150 %, Texturen 2048, SSR, Kaskaden-Schatten, Partikel 150 %, Sichtweite 150 % …). Alle Presets setzen jetzt jede Option (kein Liegenbleiben alter Werte).
10. **Energiekopplung (`podMaterials.ts → boltLook`):** weißer Kern, zwei wandernde Gabel-Bögen, 24-Hz-Flackern, laufende Pulse, breiteres Band, stärkeres Zucken.
11. **Rollen-Steuerung:** im gerollten Zustand lenken **Anheben/Neigen** (zieht zur Pod-Oberseite, also zur Rollseite hin), **Links/Rechts** bewegt den Pod auf/ab. Überblendet mit dem Rollwinkel. Die KI rechnet ihre Lenkung entsprechend um.
12. **Trümmer verschwinden:** von den drei herabgefallenen Bogen-/Eisblöcken zerbröseln zwei nach 11–19 s, der mittlere bleibt als Schikane.
13. **Zerstörbare Hindernisse:** Frachtkisten und kleine Felsen (r < 2,9 m) zerplatzen bei > 38 m/s; kostet 9–12 Schaden und 7 % Tempo. Trümmerpartikel, Instanzen werden aus den Meshes entfernt.
14. **Boost-Anzeige im HUD:** Hitzebalken mit schraffierter Gefahrenzone (80–100 %), „MAX" = Überhitzung, nach Überhitzung Marke „BEREIT" bei 55 %.
15. **Neue Grafik-Optionen:** LOD-Distanz (Landschaft), Gegner-Pod-Detail-Sichtweite, Wetter-Effekte (Aus/Reduziert/Voll), Volumetrie (Aus/Einfach/Voll).
16. **Grafik im Pausemenü:** gleiche Panels wie in den Einstellungen (`ui/GfxPanels.tsx`). Sofort wirksam: Sichtfeld, Render-Skalierung, LOD, Pod-Detail, Wetter-Effekte, FPS, Lautstärke (`Game.applyLiveGfx`). Alles andere: Schaltfläche „Übernehmen & neu starten".

**TODO-Punkte**
17. **Regen unter Dächern:** in Tunneln/überdachten Abkürzungen blenden Regenpartikel, Linsentropfen, Aufschlag-Spritzer, Gischt und Regengeräusch aus (`Game.cover`).
18. **Persistenter Textur-Cache (`texStore.ts`, IndexedDB):** fertige Textursätze werden gespeichert; Folgestarts lesen sie statt zu rechnen. Schlüssel enthält einen Hash des Synthese-Codes (Änderungen an `texCore.ts` verwerfen alte Einträge automatisch). Obergrenze 420 MB, älteste zuerst gelöscht. `?nocache` schaltet ab.

### Verifiziert
- `npm run check`: 14/14 Strecken, 0 NaN, 0 m Wand-Durchdringung, max. 1 Ausfall je Strecke; Banner-Selbsttest (künstlich niedrige Traverse auf Boonta): 11 Treffer registriert; KI zertrümmert 0–3 Hindernisse je Strecke; KI-„Neigen" ≤ 1,3 %.
- **UI-Layout-Test** (`tools/harness/pui.mjs`): 5 Fenstergrößen (1280×720, 1920×1080, 1024×600, 800×1000, 2560×1440) × 5 Ansichten → keine scrollbaren Elemente, nichts außerhalb des Fensters. Screenshots gesichtet (1280, 1024, 800).
- Pod-Nahaufnahmen (3 Pods): Leitungen laufen über die Gondel.
- **App-Smoke-Test** (`papp.mjs`, gebaute App): HUD-Schaden auf der richtigen Seite (intern L = 32 % → rechte Box), Boost-Balken sichtbar; **Pause: Audio-Kontext `suspended`, Master-Pegel 0 – auch nach Tastendrücken**, nach „Weiter" wieder 0,3; Grafik-Menü in der Pause öffnet, 0 scrollbare Elemente; Tasten umbelegen ok; 0 Seitenfehler.
- **Textur-Cache** (Dschungel, 1024 px, gleiche Browser-Sitzung): erster Start Texturen 8 006 ms, zweiter Start **244 ms (5 Sätze aus dem Cache)**; Weltaufbau 13,5 s → 5,4 s, Laden gesamt 18,9 s → 11,8 s.
- **Ultra-Preset** (Texturen im Test auf 1024, Render-Skalierung 0,6): WebGL2 Dschungel bei Gewitter/Nacht ohne Shader-Fehler (Textur-Limit hält), WebGPU Boonta mit Wetterfront 0 Konsolenfehler. Standard-Einstellungen WebGPU: Vulkan + Dschungel 0 Fehler.

### Nicht verifiziert
- **Fahrgefühl** von Slide und Rollen-Steuerung (nur per Simulation, nicht von Hand gefahren).
- Energieblitz, Trümmer-Zerfall, zerplatzende Hindernisse, Boost-Balken unter Last und Tunnel-Ausblendung nicht in Bewegung gesehen.
- Checkpoint-Bögen haben weiterhin keine Kollision.
- „Ultra" auf echter Hardware (Render-Skalierung 150 % + SSR + CSM ist sehr teuer).

### Befehle (neu)
1. `node pui.mjs <dist/index.html> /tmp/t/ui` – UI-Layout-Test (`SIZES=1280,800` wählt Größen).
2. `TWICE=1 LOAD_ONLY=1 node papp.mjs <dist/index.html> /tmp/t/tw '{"race":{"trackId":"jungle"}}'` – Ladezeit erster/zweiter Start (Cache).
3. `papp.mjs` prüft jetzt zusätzlich: HUD-Seiten, Ton in der Pause, Grafik im Pausemenü. Debug-Zugriff im Browser: `window.__podracer`.

---

## Stand: 2026-11-19 (Session 13) – Umwelt-Zeitleiste, Regen/Gewitter, Lichtkegel, Sound, Ladezeit, KI-Fix

### Erledigt in Session 13
1. **Umwelt-Zeitleiste (`environment.ts` neu geschrieben, `Game.applyEnv`):** Tageszeit und Wetter sind zwei unabhängige Keyframe-Spuren. `EnvTimeline.eval(raceTime)` mischt die vier Nachbarzustände (Tageszeit a/b × Wetter c/d) zu einem `EnvSnap`; `Game.applyEnv` setzt daraus Himmel, Nebel, Sonne/Mond (Richtung, Farbe, Stärke), Hemisphäre, Belichtung, Reflexionsstärke, Sterne, Wolkenlicht, Regen, Blitzrate, Wind, Haftung, Partikeldichte, Lichter.
   - **Tag-Nacht-Übergänge:** „Sonnenuntergang (Abend → Nacht)", „Sonnenaufgang (Nacht → Tag)", „Tag-Nacht-Zeitraffer" (6-Minuten-Schleife). Sonne und Mond haben eine feste Bahn je Welt; beim Wechsel Sonne ↔ Mond wird das Licht kurz auf null gedimmt und kommt aus der neuen Richtung zurück.
   - **Wetterwechsel im Rennen:** „Aufziehendes Unwetter", „Aufklarend", „Wechselhaft" (3,5-Minuten-Schleife). Ansagen: „UNWETTER/STURM ZIEHT AUF", „ES KLART AUF", „NACHT – LICHTER AN", „TAGESANBRUCH".
   - **Realismus:** Tabelle `CLIMATE` legt pro Welt fest, welches Wetter es gibt und was „ruhig"/„heftig" bedeutet. Wüste: nur Klar/Sandsturm. Eis: Klar/Schneeböen/Eisnebel. Vulkan: Klar/Smog/Aschesturm mit Vulkanblitzen (kein Regen). Stadt, Dschungel, Aquilaris, Kristall, Malastare: Klar/Regen/Gewitter/Nebel. Das Menü zeigt nur passende Einträge; gespeicherte unpassende Wahl fällt auf „Standard" zurück (`sanitizeEnv`).
   - **Fahrbahn-Nässe zur Laufzeit:** `materials.ts → WEATHER.wet` (globales Uniform). Die Straße wird in ~12 s nass und trocknet in ~50 s.
2. **Regen:** Tropfen als bewegungsunscharfe Streifen entlang ihrer Bildschirm-Geschwindigkeit relativ zur Kamera (langsam: fast senkrecht; schnell: lange Streifen an den Rändern, kurze Punkte voraus). Linsentropfen in drei Schichten: Perlen, bei wenig Tempo herablaufende Tropfen, bei hohem Tempo radial nach außen getriebene Tropfen mit längeren Spuren (`post.ts`, Phase `cine.uniforms.flow`). **Gischtfahne** hinter jedem Pod (wächst mit Tempo, `particles.spray`), **Aufschlag-Spritzer** auf der Fahrbahn vor dem Spieler (`particles.splash`).
3. **Gewitter (`weather.ts`, `audio.ts`):** Blitz mit weißem Kern + weichem Glühen, 3 Äste, 2–4 Folgeblitze (Flackern), häufiger; Einschlagglimmen + Bodenfunken bei nahen Einschlägen; Kamerawackeln bei sehr nahen. **Donner:** scharfer Knall (nah) → Schlag → rollendes Grollen mit 3–4 Wellen + Sub-Bass, eigener lauter Bus mit Echo.
4. **Scheinwerfer (`lights.ts`, `Game.updateLights`):** weiche volumetrische Lichtkegel an beiden Triebwerksnasen aller Pods (1 instanzierter Draw-Call, additiv, zur Silhouette hin ausgeblendet). Spot-Licht des Spielers folgt Lenkung und Neigung, wird mit Boost heller, flackert bei beschädigtem Triebwerk. Alle Lichter blenden mit der Dunkelheit ein/aus.
5. **Gegner-Sound:** ca. 3× lauter, Reichweite 170 m statt 80 m, zweite Harmonische + Düsenrauschen, Doppler-Verschiebung, Rudel-Grollen, Vorbeiflug-„Whoosh" (`audio.setRivals`, `audio.flyby`).
6. **Hitzeflimmern:** Amplitude 60 % kleiner, Radius halbiert, bei Renntempo auf 35 % zurückgenommen (am stärksten am Start).
7. **Ladezeit:** Textur-Synthese läuft in parallelen **Web Workern** (`texCore.ts` = reine Rechnung ohne three.js, `texWorker.ts`, Pool in `textures.ts → generateTextures`). Die Worker starten schon vor der Renderer-Initialisierung (`Game.start`). Registrierung des Inline-Workers in `main.tsx`; ohne Factory (Harness, Node) läuft alles synchron wie bisher. `?noworkers` schaltet zum Vergleich ab.
8. **KI-Fix „Neigen":** Die KI hielt „Neigen" bei jeder kleinen Kuppe und in der zweiten Hälfte jedes Sprungs. Jetzt nur noch gute Piloten, nur bei ~30 % der großen Sprünge (> 9 m über der Straße, im Sinkflug, ≥ 0,9 s in der Luft), höchstens alle 6 s, nie mit vollem Ausschlag. CI prüft den Anteil (`dive%` ≤ 1,5 %).
9. **Podracer:** 8 Lackierungs-Vorlagen im Hangar, weißglühender Nachbrenner-Strahl beim Boost, klappernde Luftbremsklappen bei schwerem Schaden, Lichtkegel.

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden. **KI-„Neigen": vorher 4,1–7,3 % aller KI-Frames (5 Strecken gemessen), jetzt 0,0–1,0 %** (alle 14).
- **Audio ohne Lautsprecher gemessen** (Analyser am Master-Bus, Headless-Chrome): Leerlauf-Spitze 0,13 · Gegner in 12 m 0,26 · Donner 0,63.
- **Ladezeit, Textur-Synthese 6 × 1024 px isoliert:** Hauptthread 7,6 s → 2 Worker 4,3 s (Sandbox hat 2 Kerne). **In der App in dieser Sandbox nur ~9 % schneller** (gesamt 19,1 s → 17,4 s), weil das Software-Rendering beide Kerne mitbelegt.
- `npm run check:gpu` (WebGPU), 0 Konsolenfehler: Dschungel + Boonta (Wechselhaft × Zeitraffer, t = 180 s), Vulkan + Ando Prime (Aufziehend × Sonnenuntergang, t = 70 s), Stadt mit Ultra + CSM + Gewitter + Nacht.
- **App-Smoke-Test** (`papp.mjs`, gebaute App mit Textur-Workern, Stadt bei Sonnenuntergang + aufziehendem Unwetter): Menü → Rennen → 90°-Rolle → Tasten umbelegen, 0 Seitenfehler; Menü zeigt die neuen Einträge.
- Standbilder gesichtet (WebGL2): Sonnenuntergang auf Boonta bei 0 / 55 / 100 s (Abendrot → Dämmerung mit ersten Sternen → Nacht mit Scheinwerferlicht auf der Piste), Sandsturm auf Boonta, Dschungel-Gewitter in Fahrt (Regenstreifen laufen richtig vom Fluchtpunkt weg, nasse Fahrbahn, Linsentropfen), Aschesturm auf der Vulkanwelt, klare Nacht auf Ando Prime (Scheinwerfer der Pods als Lichtpunkte).

### Nicht verifiziert
- **Ladezeit-Gewinn auf echter Hardware** (GPU + ≥ 4 Kerne) – nur hochgerechnet, nicht gemessen.
- **Klangqualität** (nur Pegel gemessen, nicht gehört); Doppler und Vorbeiflug-Whoosh gar nicht.
- **In Bewegung nicht gesehen:** Blitz-Mesh mit Folgeblitzen, radiale Linsentropfen bei hohem Tempo, Gischtfahne, Aufschlag-Spritzer, Lichtkegel (im Nachtbild nur das Spot-Licht erkennbar), Nachbrenner, klappernde Klappen.
- Übergänge nur als Einzelbilder, nicht als durchgehender Verlauf; „Sonnenaufgang" und „Aufklarend" gar nicht gesichtet.
- Bildrate auf echter GPU.

### Befehle (neu)
1. `npm run save -- "Nachricht"` · `npm run restore-git`
2. Harness: `?webgl&tod=sunset&rt=55`, `?webgl&wx=changing&rt=100`, `tod=cycle`, `wx=front|clearing`; `pshot.mjs … "audio"` (Pegeltest), `"tex:1024"` (Textur-Benchmark, braucht `out/texWorker.js`: `npx esbuild ../../src/game/texWorker.ts --bundle --format=iife --outfile=out/texWorker.js`).
3. App-Ladezeit: `LOAD_ONLY=1 node papp.mjs <dist/index.html> /tmp/t/ld '{"race":{"trackId":"jungle"}}'` (mit `QUERY='?noworkers'` zum Vergleich) → Zeile `[load] …`.

---

## Stand: 2026-11-19 (Session 12) – Tastenbelegung, HUD-Fluglage, Nachtlichter, Wetterfront, Hitzeflimmern

### Erledigt in Session 12
1. **Tastenbelegung (`keymap.ts`, `ui/KeyBindings.tsx`):** 12 Aktionen frei belegbar (Einstellungen → Steuerung: Aktion anklicken, Taste drücken; Esc bricht ab). Eine Taste gehört immer nur zu einer Aktion. 2 Presets: „Standard (WASD + Pfeile = Fluglage)" und „Klassisch (Pfeile lenken, IJKL = Fluglage)". Gespeichert in `Profile.keys`; `Game.readInput` liest nur noch `this.keymap`. Pause bleibt fest auf Esc/P.
2. **HUD (`RaceView.tsx`, `HudState`):** Fluglage-Anzeige unten links (Pod-Symbol dreht mit der Rolle, Pfeil für Anheben/Neigen, Slide-Ladebalken – gelb ab Exit-Schub), Statuswort (FLUGLAGE / ROLLE / SLIDE / ANHEBEN / GLEITEN / NEIGEN / ABTAUCHEN), Wetter-/Tageszeit-Zeile unter der Karte. Tipp-Text im Ladebildschirm zeigt die tatsächlich belegten Tasten.
3. **Nachtlichter (`Game.updateLights`):** ab `EnvFx.dark > 0.45` (Nacht auf jeder Welt, Vulkanwelt, Oovo IV) pro Pod 2 Scheinwerfer, rot/grüne Flügelspitzen-Lichter, blinkendes Cockpit-Blitzlicht (1 instanzierter Draw-Call für alle Pods) + ein echter `SpotLight` am Spieler-Pod (auf die Fahrbahn 36 m voraus gerichtet).
4. **Wetter „Aufziehendes Gewitter" (`environment.ts` → `from`, `Game.applyFront`):** Start im Nieselregen, Überblendung zum Gewitter zwischen Rennsekunde 12 und 75: Himmel, Nebel (jetzt Uniforms in `atmosphere.ts`), Sonne/Hemisphäre, Belichtung, Regenmenge (Partikel + Linse), Blitzhäufigkeit, Wind, Haftung. Fahrbahn ist von Beginn an nass.
5. **Hitzeflimmern (`post.ts` → `heat`):** flirrende Brechung hinter beiden Düsen des Spieler-Pods (reiner UV-Versatz, keine Zusatz-Samples), stärker bei Schub/Boost/Hitze.
6. **Blitz-Einschlagglimmen** am Fußpunkt des Blitzkanals (`weather.ts`).
7. **Tooling:** `tools/harness/papp.mjs` – Smoke-Test der echten App (Menü → Rennen → Tasten → HUD-Screenshot → Einstellungen → Taste umbelegen). Harness-Query neu: `ultra`, `rt=<Rennsekunde>`, `wx=front`.

### Verifiziert
- `npm run check`: 14/14 Strecken bestanden. `npm run build` → `dist/index.html`.
- **App-Smoke-Test** (`papp.mjs`, WebGL2/SwiftShader, Ando Prime Nacht + Schneeböen): Menüs durchgeklickt, Rennen gestartet, `W` + `→` gehalten → Pod rollt 90°, HUD zeigt „ROLLE", Wetterzeile „Nacht · Schneeböen", Scheinwerferkegel sichtbar; Umbelegen `Rolle nach links` → `Q` wird angezeigt und gespeichert; Preset „Klassisch" setzt `A / ←`. 0 Seitenfehler.
- `npm run check:gpu` (WebGPU): Ando Prime + Vulkan bei Nacht/Wetterfront (Rennsekunde 60), Boonta mit **Ultra + CSM + Gewitter** → 0 Konsolenfehler/-warnungen. Gleiches Ultra-Setup auf WebGL2 ohne Shader-Fehler (Textur-Budget hält).
- Standbilder: Wetterfront Start vs. Sekunde 90 (mehr Regen, Linsentropfen), Vulkan mit Lichtern.

### Nicht verifiziert
- **Ton** (kein Hörtest möglich), **Bildrate** auf echter GPU (Software-Rendering lief hier in ~1/16 Echtzeit).
- **Hitzeflimmern** und **Blitz-Einschlagglimmen** nicht im Bild gesehen (nur fehlerfrei kompiliert und gelaufen).
- Wetterfront nur als zwei Standbilder, nicht als durchgehender Übergang; Scheinwerfer auf der sehr dunklen Lava-Fahrbahn kaum sichtbar (beleuchtet vor allem Pods voraus).
- Umbelegen nur für eine Aktion getestet; Gamepad unverändert und ungetestet.

### Befehle (neu)
1. `npm run save -- "Nachricht"` – committen + Bundle schreiben.
2. `cd /tmp/t && node papp.mjs <repo>/dist/index.html /tmp/t/app '{"race":{"trackId":"frost","timeOfDay":"night","weather":"snow"}}'` – App-Smoke-Test (vorher `npm run build`, `cp tools/harness/papp.mjs /tmp/t/`).
3. Harness: `?webgl&wx=front&rt=90`, `?webgl&ultra&csm&wx=storm`.

---

## Stand: 2026-11-19 (Session 11) – Atmosphäre: Tageszeiten, Wetter, Blendung, Nebel, Sound, Mechanik

### Erledigt in Session 11
1. **Tageszeit & Wetter (`environment.ts`, neu):** `resolveEnvironment(theme, timeOfDay, weather)` liefert ein abgeleitetes `ThemeDef` (Himmel, Sonne/Mond, Nebel, Wolken, Ambient-Partikel, Belichtung) + `EnvFx` (Regen, Blitz, Böen, Wind, Nebelstärke, Blendung, Haftung, Nacht). Alles dahinter liest weiter nur `theme`.
   - Tageszeiten: Standard, Morgendämmerung, Mittag, Abenddämmerung, Nacht (Mondlicht + Sterne). Wetter: Standard, Klar, Regen, Gewitter, Schneeböen, Staubsturm, Nebel/Smog.
   - „Standard der Welt" hat jetzt pro Welt ein eigenes Wetter (Tabelle `AUTO`): Tatooine Staub, Ando Prime Schneeböen, Stadt Regen, Vulkan Smog, Dschungel Nebel, Aquilaris Regen, Kristall Nebel, Malastare Gewitter. Oovo IV (Weltraum) bleibt unberührt.
   - Auswahl: Renneinstellungen → „Tageszeit" / „Wetter" (`RaceConfig.timeOfDay/weather`). Regen/Sturm/Schnee senken die Haftung um 7–10 %.
2. **Volumetrischer Nebel (`atmosphere.ts`):** analytisch integrierter Höhennebel entlang des Sehstrahls + driftende Nebelbänke (2 Rausch-Taps mit explizitem LOD) + Vorwärtsstreuung zur Sonne. Kein Extra-Pass.
3. **Sonnenblendung & Lens-Flare (`post.ts`):** Schleier, Kernglühen, anamorpher Streifen, 4 Ghosts; Sichtbarkeit über 9 Depth-Taps am Sonnenpixel. Max. Zusatzhelligkeit < 0,85 → keine Überstrahlung. **Bug-Fix:** God-Rays nutzten eine vertikal gespiegelte Sonnenposition (`screenUV` ist oben-links) und erschienen deshalb praktisch nie.
4. **Regen:** Tropfen auf der Linse (wachsende/verdunstende Perlen + laufende Tropfen mit Spur, brechen das Bild), Regen als windschräge Streifen statt Punkte, dichteres Volumen, Gischt statt Staub hinter den Pods, nasse Fahrbahn auf jeder Strecke.
5. **Gewitter & Böen (`weather.ts`, neu):** Blitzkanal mit 2 Ästen als Ribbon-Mesh, Doppelblitz-Hüllkurve, Wolken leuchten von innen (`sky.uniforms.flash`), Hemisphärenlicht pulst, Donner zeitversetzt nach Entfernung. Böen-Schwaden (Schnee/Staub/Regennebel) über den GPU-Partikelpool.
6. **Sound (`audio.ts`):** Master-Kompressor, Turbinen-Whine, Sub-Bass, Düsenrauschen (Schub/Boost), Slide-Zischen, Regen, Windheulen, Donner, Roll-„Whoosh", Slap-back-Echo in Schluchten/Tunneln.
7. **Futuristisch/mechanisch (`mechProps.ts`, neu):** Repulsor-Relaistürme mit zwei gegenläufigen Zahnringen und Leuchtstreifen (alle ~280 m), Patrouillen-Drohnen neben der Strecke. 5 Draw-Calls, kein Schattenwurf.
8. **Strecken +18 % breiter** (`TRACK_WIDTH` in `trackBuilder.ts`).
9. **Grafik/Physik sonst:** Basalt-Textur ohne Wabenmuster (Glut nur in dünner Kruste), Wolken werden vom Himmelslicht beleuchtet (nachts dunkel, vorher immer 48 % Weiß), Slide-Staubfahne + Funken, Kondensstreifen bei 90°-Rolle, Schneeauflage auf der Fahrbahn bei Schneewetter, Pod-zu-Pod-Kollision rollbewusst und jetzt in `physics.ts` (`collidePods`) → vom CI abgedeckt.

### Verifiziert
- `npm run check`: 14/14 Strecken, 0 NaN, 0 m Wand-Durchdringung, Bodenfreiheit ≥ 0,66 m, max. 1 Ausfall je Strecke (Limit 3) – jetzt **inkl. Pod-Kollisionen** und breiterer Strecken. Zusätzlich `GRIP=0.88` (Sturm-Haftung): 14/14.
- WebGL2-Standbilder gesichtet: Boonta Staub + Sonnenblendung, Boonta Abenddämmerung, Dschungel Gewitter (Linsentropfen, nasse Fahrbahn), Ando Prime Nacht + Schnee (Sterne, Mond), Vulkan Abend + Smog, Malastare Abend + Gewitter, Stadt Abend + Gewitter (Regenstreifen, Linsentropfen), Relaisturm-Nahaufnahme.
- `npm run build` → `dist/index.html`.
- `npm run check:gpu` (WebGPU, SwiftShader) mit **0 Konsolenfehlern/-warnungen**: Dschungel + Ando Prime bei Gewitter/Nacht, Boonta + Vulkan mit Standardwetter (Staub/Smog, Lens-Flare aktiv), Kristall bei Schnee/Morgendämmerung mit CSM.

### Nicht verifiziert
- **Ton** (keine Audioausgabe in der Sandbox – nur Code-Review, kein Hörtest).
- **Bildrate** auf echter GPU mit Nebel-Node (+2 Textur-Taps je Fragment) und Linsen-Effekten.
- Blitz-Mesh, Böen-Schwaden und Drohnen in Bewegung (nur Standbilder; Blitz nur als erzwungener Himmels-Flash gesehen).
- Textur-Budget: Nebel-Node bindet `macroTexture` in jedem Material (+1 Sampler). WebGL2-Limit 16 – auf Ultra mit CSM auf echter Hardware prüfen.

### Befehle (neu)
1. Harness-Query: `?webgl&tod=night&wx=storm` (auch `flash` für Dauerblitz, `csm`). Ansichten neu: `s` (zur Sonne), `m` (Relaisturm).
2. `GRIP=0.88 npm run check` – Physik bei Sturm-Haftung.
3. (ersetzt durch `npm run save`, siehe „Git-Stand")

---

## Stand: 2026-11-19 (Session 10) – Performance, CI-Tooling, Flugsteuerung, Steigungen & Schrägkurven

### Erledigt in Session 10
1. **Neue Steuerung (`Game.ts → readInput`, `screens.tsx`, `RaceView.tsx`):** `W` Schub · `S` Umkehrschub/Bremse · `A`/`D` lenken · `Shift` Boost · `Leertaste` Luftbremse/Slide · `↑` Neigen · `↓` Anheben · `←`/`→` 90°-Rolle · `R` Reparatur · `C` Ansicht. Gamepad: rechter Stick = Rolle/Neigen/Anheben. Alte Belegung (Pfeile lenken, `E`/`Q`/`Strg` Luftbremse, Leertaste Boost) ist entfernt.
2. **Flugphysik (`physics.ts → stepPod`):** `Inputs.pitch` (+1 Anheben, −1 Neigen) und `Inputs.roll` (∓1 = ∓90°).
   - **Slide:** Luftbremse + Lenken am Boden → Seitenhaftung ×0,24, Bremswirkung ×0,42, Gierrate ×1,16; nach ≥ 0,45 s Slide gibt Loslassen + Schub bis +7 m/s.
   - **Anheben:** Schwebehöhe +1,6 m, Rampenabsprung +20 %, in der Luft halbe Schwerkraft (kostet ~10 %/s Tempo). **Neigen:** −0,45 m, +14 % Haftung, in der Luft 2,15-fache Schwerkraft.
   - **Rolle:** 90° in ≈ 0,23 s, Kollisionsbreite bis auf 22 %, Lenkwirkung −40 %, Schwebehöhe automatisch + 0,92 × halbe Spannweite.
   - **Triebwerke:** heben sich beim Lenken als Ganzes (außen +1,1 m, innen −0,22 m), **keine** eigene Neigung/Rollung mehr (`setEngineMotion(y, y, 0, 0, 0)`); Lenk-Schräglage des Pods 0,26 → 0,07 rad. Nicken von Cockpit + Triebwerken gemeinsam nur über `↑`/`↓` (plus Straßensteigung).
   - **Boden-Clamp exakt pro Punkt** (Bug-Fix): vorher hob der konservative Clamp Pods auf Gefällen/Schräglagen an → „in der Luft" mit halber Lenkung. Jetzt Spitze gegen Straße unter der Spitze, Heck gegen Straße unter dem Heck; vom Clamp getragene Pods gelten als `grounded`.
3. **KI (`aiInputs`):** gleitet über Lücken (Anheben), neigt nach Sprüngen zum schnellen Landen, rollt hochkant an nahen Hindernissen vorbei (Skill > 0,55), bremst in Slides mit.
4. **Strecken (`trackBuilder.ts`, alle 14 Maps automatisch):**
   - **Schrägkurven:** `bank = curv × 46`, Limit 0,39 (≈ 21°) bzw. 6,2 m Außenkanten-Überhöhung (vorher 2,4 m). Abkürzungen behalten die alte flache Querneigung. Überhöhung gibt Haftung (`bankGrip` bis ×1,9) und +45 %·|bank| KI-Referenztempo.
   - **Steigungen:** zwei geseedete Wellen (±15 m, ±6,5 m), Kontrollpunkt-Höhen ×1,2 → max. 11–17 % Steigung je Strecke. Flach gehalten an Start/Ziel, Rampen/Lücken, Zero-G-Röhren und überall, wo die Strecke sich selbst nahekommt (Über-/Unterführungen behalten ihre Höhe).
5. **Performance ohne Grafikverlust:**
   - **Partikel auf der GPU (`particles.ts`):** CPU schreibt nur noch Spawn-Datensätze in einen Ringpuffer (Teil-Upload); Flugbahn, Größe, Farbe, Tod rechnet der Vertex-Shader geschlossen. Vorher: bis 5 400 Partikel pro Frame auf der CPU integriert + 8 Floats/Partikel hochgeladen.
   - **Fern-LOD für Dekor (`world.ts → place` mit Option `lod`, `decorGeo.ts`):** Bäume 1 347 → 368 Dreiecke ab 240 m, Felsnadeln 1 078 → 539 ab 430 m (gleiche Seeds = gleiche Silhouette, sektorweise umgeschaltet).
6. **TODO §3 „Performance & Tooling":**
   - **GPU-Partikel:** umgesetzt als zustandslose Vertex-Shader-Simulation statt Compute-Pass (läuft identisch auf WebGPU **und** WebGL2, kein Readback, kein Zustand auf der GPU).
   - **CSM:** `CSMShadowNode`, 2 Kaskaden (0–104 m, 104–520 m, überblendet). **Opt-in** (`gfx.csm`, Schalter „Kaskaden-Schatten"), weil es einen Schattenpass mehr kostet.
   - **CI:** `npm run check` (Typecheck + Node-Physik-Sim, ≈ 25 s, kein Browser) und `npm run check:gpu` (WebGPU-Konsolencheck per Puppeteer).

### Verifiziert
- `npm run check`: 14/14 Strecken × 11 Pods × 45 s → **0 Abstürze, 0 NaN, 0 m Wand-Durchdringung, Bodenfreiheit ≥ 0,67 m**, langsamster Pod ≥ 51 m/s; Pod 0 fährt dabei Rolle/Anheben/Neigen/Slide als Stresstest.
- Sprungtest Boonta (`PITCH_AIR=1|0|-1`): Anheben 3,10 s / 324 m · neutral 1,60 s / 171 m · Neigen 0,86 s / 102 m.
- `npm run check:gpu` (WebGPU, SwiftShader): boonta, jungle und frost mit CSM → **0 Konsolenfehler/-warnungen**.
- WebGL2-Standbilder gesichtet: boonta (Start, Schrägkurve), jungle (Start, Fern-LOD), frost + CSM, magma. `npm run build` → 2,04 MB.

### Nicht verifiziert
- **FPS-Gewinn auf echter GPU** – nicht gemessen. Belegt sind nur weniger CPU-Arbeit pro Frame und weniger Dreiecke in der Ferne.
- **Fahrgefühl** der neuen Steuerung durch einen Menschen (Werte sind per Simulation abgestimmt, nicht per Probefahrt).
- CSM-Bildqualität auf echter GPU; Gamepad-Belegung (rechter Stick); Steigungen optisch nur auf 4 von 14 Strecken gesichtet.

### Befehle
1. `npm run check` – muss vor jedem Abschluss grün sein.
2. `DEBUG=1 TRACK=jungle npm run check` – schlechtester Fall je Strecke. `SECS=90` für längere Läufe.
3. `PUPPETEER_DIR=/tmp/t npm run check:gpu` – `TRACKS=0,5` wählt Strecken, `QUERY='?csm'` schaltet CSM zu.
4. Harness-Ansicht `r` (neu): 2,8 s echtes Rennen mit Schub, z. B. `pshot.mjs … "t0:r"`.

---

## Stand: 2026-11-18 (Session 9) – Landschafts-Assets, Fels-Textur, Startportal

### Erledigt in Session 9
1. **Aufräumen & Repo:** `canblatt.html` → `.archiv/`. Repo `Cr0nFixXx/podracer`, Branch **`B`**, liegt direkt im Projekt-Root (inkl. `.git`). Neu: `.gitignore` (`node_modules/`, `dist/`, Harness-Bilder).
2. **Neues Modul `src/game/decorGeo.ts`** (seeded, je 1 `BufferGeometry` pro Asset, wird von `scatterDecor` in `world.ts` instanziert):
   - `rockGeometry` – Brocken mit 9 Spaltebenen (kantige Bruchflächen), Schichtstufen, flacher Standfläche; 3 Varianten pro Thema.
   - `spireGeometry` – Hoodoos mit harten/weichen Schichten (überhängende Simse), Erosionsrillen, Schuttfuß, Deckstein, Neigung; 3 Varianten.
   - `mesaGeometry` – Tafelberge mit Schutthalden, 2 Klippenbändern mit Rinnen, Bank und Plateau; 2 Varianten.
   - `jungleTreeGeometry` – Brettwurzeln, gebogener Stamm, 4 Astgabeln, geschichtete Krone aus rauschverformten Lappen + Büscheln, Lianen; 2 Varianten.
   - `pineGeometry` (sternförmige hängende Astetagen + Schneelast), `crystalClusterGeometry` (Eissplitter & Kristalle, flat-shaded), `cactusGeometry` (gerippter Saguaro), `airshipGeometry` (Rennluftschiff mit Leitwerk, Gondel, Triebwerken), `pylonGeometry` (Dreibein-Energiemast).
3. **Fels-Textur (`textures.ts`, Kind `rock`):** Ziegel-/Mauerwerk-Look entfernt. Klüfte sind jetzt domain-verzerrt und öffnen nur in „schwachen" Zonen; dazu Feinschichtung und Tafoni-Löcher. Wirkt auf Schluchtwände, Felsnadeln, Brocken, Bögen in 6 Themen.
4. **Startportal (`world.ts` → `addStartArea`/`mkGate`):** kannelierte Türme auf Stufensockeln mit Kragenringen, Strebe mit Sprossen, Abspannseile, Warren-Fachwerk-Traverse, gerahmte Zeitentafel, Startlichter mit Blenden. Weiterhin in dieselben 5 Material-Buckets gemerged (keine zusätzlichen Draw-Calls).
5. **Stadt & Wracks (`world.ts`):** Megablöcke mit 4 Rücksprüngen, Eckrippen, Sky-Dock, Mast (2 Silhouetten); Türme mit Strebepfeilern, 2 Ringdecks, Nadel; Pod-Wracks mit offener Verkleidung, freiliegenden Spanten, losen Platten (`DoubleSide`).
6. **Harness:** `tools/harness/pshot.mjs` (Puppeteer-Variante von `shot.mjs`, schreibt zusätzlich Kontaktbogen `<out>_grid.jpg`).

### Verifiziert
- `npx tsc --noEmit -p .` → 0 Fehler. `npm run build` → `dist/index.html` (2,03 MB).
- Headless WebGL2 (SwiftShader), Screenshots **aller 14 Strecken** gesichtet (0 Konsolenfehler).
- Headless **WebGPU** (SwiftShader): crystal, frost, neon, jungle laden mit **0 Konsolen-Fehlern/-Warnungen**.
- Physik-Sim `s0:12` (boonta, 11 Pods): 0 Todesfälle, 0 NaN, 0 m hinter Wand.
- Alle 9 Geometrie-Builder: 0 NaN-Vertices (Node-Test).

### Nicht verifiziert
- **FPS auf echter GPU.** Dreiecke pro Instanz: Baum ~1 350 (gq 2) / ~1 050 (gq 1), Hoodoo ~1 080, Tafelberg ~1 010, Kiefer ~270, Kaktus ~600. Baum-Instanzen dafür 1 100 → 940.
- Nur Standbilder geprüft (Kamera `a`/`b`/`c`/`e`/`g`), kein gefahrenes Rennen im Browser; Kollision nur über `s0:12`.
- WebGPU-**Screenshots** sind in Chrome 148 headless weiß (Canvas-Präsentation des Harness, kein Spielfehler). Für Bilder `?webgl` verwenden; WebGPU nur auf Konsolenfehler prüfen.

### Test-Setup in frischer Sandbox (≈ 4 Min.; `.git` fehlt? → `git clone --branch B … /tmp/rc && cp -r /tmp/rc/.git .`)
1. `mkdir -p /tmp/t && cd /tmp/t && npm i puppeteer`
2. `sudo apt-get update && sudo apt-get install -y --no-install-recommends libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 libatspi2.0-0 libcups2 libcairo2 libpango-1.0-0`
3. `cd <repo> && git checkout -- tools/harness/out && cd tools/harness && npx esbuild game.ts --bundle --format=esm --loader:.jpg=dataurl --outfile=out/game.js && cp pshot.mjs papp.mjs /tmp/t/`
4. `cd /tmp/t && node pshot.mjs <repo>/tools/harness/out/game.html "t0:e,t5:b" /tmp/t/out "?webgl"` → `/tmp/t/out_grid.jpg` (≈ 35 s pro Strecke)
5. Seit Session 20 (Fotosets): **eine Strecke je Lauf** (≈ 50 s Laden + 12–18 s je Ansicht), immer mit `timeout 285 …`; `/tmp` ist ein RAM-Laufwerk – alte Screenshots und `/tmp/puppeteer_dev_chrome_profile-*` löschen. WebGPU-Check: `PUPPETEER_DIR=/tmp/t TRACKS=1 QUERY='?tex=256' npm run check:gpu`.

---

## Stand: 2026-11-17 (Session 8) – Start-Lag, Grafikfehler, Sicht, Hindernisse & aktive Triebwerks-Aufhängung

### Erledigt in Session 8
1. **Rennstart-Lag beseitigt (`post.ts`, `Game.ts`, `particles.ts`, `podMaterials.ts`, `podModel.ts`, `trackMesh.ts`, `RaceView.tsx`)**
   - **Ursache 1 – Fehlende Pipeline-Vorkompilierung:** `r.compileAsync(scene, cam)` kompilierte fürs Canvas-Format statt für den `HalfFloat`-`scenePass` (+ Schatten + PostFX + Partikel + Pod-Fern-LOD) → alle Pipelines kompilierten erst mitten im Countdown/Start. **Fix:** `post.warmup(renderer)` kompiliert `scenePass.compileAsync`, rendert 2 komplette Frames (inkl. Seed-Partikeln & beiden Pod-LODs) und wartet auf `queue.onSubmittedWorkDone()` noch hinter dem Ladescreen.
   - **Ursache 2 – Fullscreen-Partikel-Overdraw an der Kamera:** `PointsNodeMaterial` teilte durch `-positionView.z` ohne Obergrenze → Abgas-/Staub-/Wetterpartikel vor/an der Verfolgerkamera wurden zu 4K-Vollbild-Quads. **Fix:** `sizeNode` auf `≤ 14–16 %` Bildhöhe gedeckelt, `0` für `vz < 1,2 m`, weicher Nah-Fade, keine Abgas-Spawns im Countdown.
   - **Ursache 3 – 64 einzelne Pod-Shader-Pipelines am Start:** Gegner-Lack, -Flammen, -Binder & -Glow laufen jetzt über **je 1 geteilte Pipeline** mit gebackenen Vertex-Farben (**64 → 11 TSL-Pipelines, 120 → 31 Materialien** für 11 Pods am Start).
   - **Ursache 4 – PostFX, Schatten & HUD-Filter:** `BloomNode.setResolutionScale(0.5)` (−75 % Fillrate), Schattenkarte `[0, 1024, 1536, 2048]` auf ±96 m, Ultra-SSR standardmäßig aus (optional zuschaltbar), 40-px-CSS-`drop-shadow` im 3-2-1-Countdown durch 0-ms-`textShadow` ersetzt, `smoke.ts` mit `macroTexture` statt 3D-Perlin.

2. **Restliche Grafikfehler behoben (`post.ts`, `trackMesh.ts`, `materials.ts`, `terrainMaterial.ts`, `world.ts`, `groundCover.ts`, `trackDetail.ts`)**
   - **AO & God Rays:** `depth.sample()` in nicht-uniformem `If`/`Loop` und `GTAONode`-Artefakte ersetzt durch 4-Paar-symmetrisches Depth-AO + 14-Tap-God-Rays per ableitungsfreiem `textureLoad` (0 WGSL-Uniformity-Fehler, 0 Halos, 0 Streifen auf Ebenen, immun gegen Partikel/Gras). SSR-Composite zu 100 % in uniformem Control-Flow.
   - **`StaticBatcher` (`trackMesh.ts`):** `BatchedMesh` (mit geteilter `_indirectTexture` zwischen Schatten- und Kamerapass) ersetzt durch räumlich gemergte 580-m-`THREE.Mesh`-Kacheln (0 `BatchedMesh`, unabhängiges Frustum-Culling, 0 Textur-Uploads/Frame).
   - **Naht- & TBN-Fixes:** `displace = 0` auf `wallMat` und Kanten-Lock (`uv.x = 0/1`) auf `roadMat` (keine Risse an Straßenkanten/Klippen/Tunneln); 128×-vorskalierter TBN + Silhouetten-Sprungschutz in `materials.ts`/`podMaterials.ts`; singularitätsfreies `xzNormalToView` + `polygonOffset` auf Wasser/Lava; überschneidungsfreier Kuppel-LOD für ferne Büsche; Moiré-freies Energiefeld.

3. **Weniger & klar erkennbare Streckenhindernisse (`trackBuilder.ts`, `world.ts`)**
   - Hindernisanzahl um **~55 % gesenkt** (Ø **7,5 statt ~17** pro Strecke), Mindestabstand **≥ 52 m**, Freihaltezone vor Rampen und Landezonen (`-68..+42` Samples für Set-Pieces), nur 1 Säule in Abkürzungstunneln.
   - Jedes Hindernis trägt jetzt einen leuchtenden Boden-Warnring, gelb-schwarze Warnstreifen (Kisten) bzw. mehrere Leuchtringe (Säulen) und eine hohe orange-rote Warnbake auf der Spitze (auch auf jedem Felsbrocken).

4. **Klare Sicht hinter Vordermännern (`particles.ts`, `Game.ts`)**
   - Kein grauer Rauch mehr aus intakten Triebwerken; Bodenstaub flach (`vy < 0,9`), klein (`≤ 3,2 m`), dezent (`alpha ≤ 0,06`) und bei Gegnern unter 24 m vor der Kamera komplett unterdrückt; Schadensrauch auf `alpha ≤ 0,16` (Gegner `× 0,32`) gedämpft + Kamera-Nahfade ab 12 m.

5. **5-Punkt-Bodenkollision & dynamische Triebwerks-Aufhängung (`physics.ts`, `podModel.ts`, `podMaterials.ts`, `podDesigns.ts`, `trackBuilder.ts`, `PodPreview.tsx`)**
   - Flughöhe `HOVER = 2,85 m`, exakte Straßenwölbung (`crown` + Randlippe) in `frameAt`/`roadSurfaceAt`, Längsneigung folgt realer Straßen-/Rampensteigung, harte 5-Punkt-Repulsor-Kollision (`MIN_ROAD_CLEAR = 0,68 m`) für linkes/rechtes Triebwerk (vorn/hinten inkl. Flügel) und Cockpit.
   - Beim Lenken & Luftbremsen schwingen linkes und rechtes Triebwerk per Feder-Dämpfer (`ω = 11,5, ζ = 0,66`) dynamisch gegengleich auf und ab (**0,99–1,78 m Hub**, Außentriebwerk steigt & hebt die Nase, Innentriebwerk taucht in den Scheitelpunkt) – bei Spieler **und** Gegnern, inkl. diagonal mitziehendem Energie-Binder und GPU-biegsamen Steuerseilen (`cableFlexMaterial`).
   - **Verifiziert:** alle 10 Pods im Extrem-Slalom + Luftbremse + Schanzen + harter Landung → **kleinste Bodenfreiheit `+0,81 m`, `0` Boden-Durchdringungen**; alle 14 Strecken × 11 Pods × 45 s → **`0` Todesfälle/Abstürze, `0` NaN**; 256 WGSL-/GLSL-Builds mit **0 Warnungen**.

### Nächster Schritt aus Session 8 (weiterhin offen)
`TODO.md` §1: Livery-Vorlagen & Startnummern im Hangar + Triebwerks-Hitzeflimmern (≈ 60–90 Min.).
