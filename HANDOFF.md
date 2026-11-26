# HANDOFF

## Nächster Schritt (zuerst lesen)
**Laufender Auftrag: „nach der Probefahrt" (2026-11-23), dazu der Zwischentest des Nutzers vom 2026-11-25.** Protokolle: [Auftrag und alle Entscheidungen](docs/verlauf/2026-11-23-nach-der-probefahrt.md) · [Zwischentest: elf Punkte](docs/verlauf/2026-11-25-zwischentest.md). Offene Punkte: `TODO.md` Abschnitt 9.
- **Fertig:** Block 1 (drei Fehler), Block 2 (acht Verbesserungen), Block 3 bis auf die Sprünge (Intro-Flug, 3D-Schnee, Fahrspuren, Methanregen, Schwerelosigkeit, Untergründe, Flug-Deko) und **alle elf Punkte des Zwischentests** (2026-11-26): Röhrenboden, wachsende Spuren, Teile im Hauptmenü, Rammen · Intro-Tempo, kürzere Sprünge, Flug-Deko statt Zeppelinen (20 % weniger), Spuren im Sand, nähere Kamera, lackierbare Teile, Schatten- und Reflexions-Auflösung.
- **Als Nächstes: die Sprünge auf den sechs Schlucht-Strecken** (Boonta, Dünenpass, Magma, Kristall, Heuler, Malastare-100): Lücken 70–90 m, EIN weiter Sprung 130–160 m nur mit Boost, EIN Abwurf 12–18 m (Entscheidung des Nutzers, Protokoll vom 2026-11-23, Tabelle). Grundlage ist die Sprungregel vom 2026-11-25 (`launchVy`: jede Rampe wirft jeden Pod gleich hoch) – Messwerte je Rampe: `DEBUG=1 ONLY="jump:" npm run check:unit --silent`. Der Abschnitt „Sprünge: Vorarbeit" im Protokoll vom 2026-11-23 rechnet noch mit der alten Regel; weiter gültig sind dort: Zurücksetzen weit vor der Rampe, Boost-Zeitpunkt der Gegner, der Abwurf als Anstieg der Fahrbahn mit Kante.
- **Danach Block 4:** `TODO.md` Abschnitt 2, 5 und 8.
- **Pushen:** nach jedem fertigen Block (für diesen Auftrag ausdrücklich bestellt). Dazu braucht es den Zugangstoken des Nutzers; er wird nirgends gespeichert und fehlt nach einer Zusammenfassung der Sitzung – dann den Nutzer fragen. Das Repo ist privat: auch `git fetch` braucht ihn.
- **Der Nutzer soll prüfen** (alles lief nur in Software-Grafik, ohne Ton, ohne echtes Gamepad, fast nur als Standbild): die Tabelle „Nicht geprüft – bitte selbst fahren" im Protokoll vom 2026-11-25 (neun Zeilen, je mit Stellschraube) – vor allem Rammen (Stärke), Sprungweite, Flug-Deko (Menge, Tafelgröße), Bildrate mit den größeren Schattenkarten. Aus den Blöcken davor weiter offen: Bildrate auf „Ultra", Lautstärke des Boost-Alarms, Menüs mit dem echten Gamepad, Schneefeld, Eissee, Gummiband in den Röhren, Malastare „30 % düsterer" (Protokoll vom 2026-11-23, „Nicht geprüft").

Davor, weiter gültig:

Session 20 lief in zwei Zweigen und ist zusammengeführt ([Merge](docs/verlauf/2026-11-22-merge-session-20.md)): **Session 20 (Strecken)** aus `B` und **Session 20 (Pods)** aus `new_pods`. Offen:
0. **`dev` nach `main` bringen** (Pull Request auf GitHub – Schritt des Nutzers). `main` (`3625c99`) enthält beide Sitzungen und die Tunneldecke je Pod (Pull Request #2, gemergt am 2026-11-22). Auf `dev` liegen danach: die **Hülle je Pod** (Tunneldecke fertig, Überkopf-Bauten, Test-Werkzeuge repariert – [Protokoll](docs/verlauf/2026-11-22-huelle-je-pod.md); die [Vorstufe](docs/verlauf/2026-11-22-tunneldecke-je-pod.md) ist überholt), das **Aufräumen des Speichers** und der **Umbau der Doku** ([Protokoll](docs/verlauf/2026-11-22-speicher-und-doku.md)) und die **TODO-Runde** (Wandtreffer frontal = „Front", zehn Kleinigkeiten an den Pods, Aufwärmen, zweiter Build `npm run build:web`, GitHub-Action, Harness-Bundles aus Git – [Protokoll](docs/verlauf/2026-11-22-todo-runde.md)). Dazu die **Folgerunde**: die GitHub-Action ist auf GitHub und läuft, die Controller-Meldung ist untersucht ([Protokoll](docs/verlauf/2026-11-22-controller-und-action.md)). Und die **bestellte Runde vom 2026-11-22/23** (Punkt 5): Fehlerkorrekturen, Klima und Boost, Schneedecke, Felsreihen, Buchten, Übergänge. Alles davon liegt auf GitHub (`dev`, „Git-Stand"). **Vor dem ersten Commit lesen:** `docs/regeln/git-sandbox.md` (Speicher-Limit 128 MB).
1. **Strecken – Probefahrt auf echter GPU** (`npm run dev`, ≈ 10 Min.; in der Sandbox ließ sich nur in Software rendern):
   - **Aquilaris-Küstenlauf** und **Oovo-IV-Gefängnis**: Schrägkurven abfahren – ragt noch irgendwo ein Balken aus der Fahrbahn?
   - **Frostspalt-Ring:** 30-m-Tunnel, durchgehende Eishöhle mit Gabelung, Eissee (25 % weniger Haftung – fair?).
   - **Magma-Inferno:** Höhle (zu dunkel?), Lavasee (Triebwerke heizen schneller auf).
   - FPS unten rechts notieren (`WebGPU`), vor allem auf den offenen See-Passagen.
   - **Neu seit dem 2026-11-22/23 – nichts davon ist von Hand gefahren** ([Protokoll](docs/verlauf/2026-11-23-uebergaenge-felsreihen-buchten.md) → „Nicht geprüft"): **Boonta-Kessel** (Felsreihen statt Leitplanken, Buchten bis 18 m je Seite, Pistenrand ohne Kante, die ausgerundete Kehre vor dem Plateau, Tunnel) · **Frostspalt-Ring bei Schnee** (Schneedecke mit Spuren, Anzeige „Kühle Luft" unter dem Hitzebalken) · **Aquilaris** und **Oovo IV** (echter Fels statt Wandplatten) · **Magma** und **Dschungel** (Höhlen im Lampenlicht, Farne) · einmal **rückwärts lenken**. Wie viel Bildrate die Felsreihen und der gemischte Boden kosten, ist nicht gemessen.
2. **Pods:** alle acht Phasen (0–7) der Pod-Überholung sind fertig, die Abschluss-Durchsicht ist eingearbeitet (fünf Korrekturen, `docs/verlauf/2026-11-21-session-20-pods.md` → „Abschluss-Durchsicht"; dort stehen auch die zurückgestellten Kleinigkeiten) – Tabelle in `docs/verlauf/2026-11-21-session-20-pods.md` → „Phasen". **Selbst prüfen:** „Ultra" am Gaming-PC (Bildrate mit vollen Details, Teilen und Schaden), die Schadens-Balance von Hand fahren, die Teile-Kombinationen durchklicken. Die Listen „Nicht verifiziert" je Phase stehen in derselben Datei. Genauer Arbeitsstand der Pod-Sitzung: `.superpowers/sdd/swift-floating-kurzweil/progress.md` (git-ignoriert, nur auf dem Rechner des Nutzers). Im **Hangar** außerdem die 6 Lackiermuster & 3 Finishes testen (offen seit Session 19).
3. Vor jeder Änderung: `npm run check` (Typecheck + Unit-Prüfungen + Pod-Audit + Sim) muss grün sein. Pods ansehen: `npm run dev` → `http://localhost:5173/tools/harness/pods.dev.html`.
4. **Controller-Meldung des Nutzers:** erledigt – der Nutzer meldet am 2026-11-22 „geht wieder" (Verdacht war Microsoft GameInput 4.0.300, [Protokoll](docs/verlauf/2026-11-22-controller-und-action.md)). Am Spiel war nichts zu ändern.
5. **Vom Nutzer am 2026-11-22 bestellt:** alles ist gebaut, liegt seit dem 2026-11-23 auf GitHub (`dev`) und wartet auf die Probefahrt (Punkt 1) – Protokolle [2026-11-22](docs/verlauf/2026-11-22-skills-fehler-klima.md) (Skills, zwei Fehler, Klima und Boost, Schneedecke, Felsgrenzen) und [2026-11-23](docs/verlauf/2026-11-23-uebergaenge-felsreihen-buchten.md) (Übergänge, Felsreihen, Buchten, Falten, Höhlen-Optik, Farne, Schnee-Fotos). **Der Rest steht in `TODO.md`:** Abschnitt 8 (Ufer der Becken und Schwellen der übrigen Geländeschichten · Buchten öffnen beide Seiten gemeinsam · Seen und Plateaus haben weiter Baken · Energiefeld über dem Fels – gewollt?) und Abschnitt 5 (Feinschliff der Schneedecke nach der Probefahrt · Büsche · Lampenlicht auf Fahrbahn und Pods im Tunnel · Aquilaris-Mauerkronen).
6. **Skills:** `CLAUDE.md` → „Agent skills" (das Skill-Set liegt in `.agents/skills/`, nicht im Repo; ohne Ticket-Skills).

## Git-Stand
- Remote `origin` = `https://github.com/Cr0nFixXx/podracer.git`. Arbeitszweig **`dev`** (vom Nutzer am 2026-11-22 angelegt, gleich nach dem Merge von PR #2). `main` nicht direkt anfassen (Pull Requests). **Pushen** nur auf ausdrücklichen Wunsch: `git push origin dev`.
- **Stand 2026-11-26:** nach `72a581d` (auf GitHub seit dem 2026-11-24) liegen die elf Punkte des Zwischentests – `a032966` … `e0c2e8a` und der Abschluss-Commit, Liste im [Protokoll](docs/verlauf/2026-11-25-zwischentest.md) unter „Git". Sie werden direkt nach dem Abschluss-Commit gepusht (Auftrag: „arbeite diese erst ab, pushe dann"). Prüfen: `git log origin/dev..dev` – leer heißt, alles liegt auf GitHub (`git fetch` braucht den Token).
- **Stand 2026-11-23 (gepusht auf Wunsch des Nutzers):** auf GitHub liegt `dev` vollständig, bis einschließlich des Commits mit diesem Eintrag – lokal liegt nichts Ungepushtes mehr. Vor `main` (`3625c99`) liegen dort: die Runden bis zur Controller-Diagnose (Hülle je Pod `ee3dc4b` … `ea70d0a`, einzeln in den Protokollen vom 2026-11-22), die Runde vom 2026-11-22 (`5a21dc9` Skills … `cadfc78` Felsgrenzen), die Runde vom 2026-11-23 (`fec860b` Übergänge und Felsreihen … `ec07be9` Protokoll) – Listen in den beiden Protokollen unter „Git" – und die Reparatur von `npm run restore-git` (der Commit mit diesem Eintrag). **Die GitHub-Action läuft:** der Lauf für `ec07be9` am 2026-11-23 war grün (72 s: `npm ci`, `npm run check`, beide Builds; unter „Actions"); der optionale WebGPU-Job ist noch nie gelaufen. Der Zugangstoken des Nutzers darf seit dem 2026-11-22 auch Workflow-Dateien schreiben. Was lokal ungepusht liegt: `git log --oneline origin/dev..dev`.
- **Zweige seit Session 20:** `main` ist der Sammelzweig; bisher kam alles über Pull Requests auf GitHub hinein. PR #1 hat **Session 20 (Strecken)** aus `B` nach `main` gebracht; PR #2 hat **Session 20 (Pods)** aus `new_pods` nach `main` gebracht (gemergt am 2026-11-22). Damit PR #2 ohne Konflikte mergebar war, wurde vorher `main` in `new_pods` gemergt (`docs/verlauf/2026-11-22-merge-session-20.md`). Seitdem gibt es den Zweig `dev`.
- **Regeln zu Git und Sandbox** (Speicher-Limit 128 MB, nach jedem Commit `git gc --prune=now`, was nach einem Reset zu tun ist): `docs/regeln/git-sandbox.md`.

## Vorgaben des Nutzers, die weiter gelten
- Strecken: `docs/verlauf/2026-11-21-session-20-strecken.md` → „Vorgaben des Nutzers".
- Pods: `docs/verlauf/2026-11-21-session-20-pods.md` → „Auftrag und abgestimmte Entscheidungen".
- Arbeitsweise (Ausgabestil, Commits, Pushen nur auf Wunsch): `CLAUDE.md` → „Always".

## Wo was steht
| Datei | Inhalt |
|---|---|
| `HANDOFF.md` | nächster Schritt, Git-Stand, Wegweiser (diese Datei) |
| `TODO.md` | nur offene Punkte, nach Thema |
| `docs/verlauf/` | eine Datei je Aufgabe oder Sitzung: was gemacht, gemessen, geprüft und nicht geprüft wurde |
| `CLAUDE.md` | Grundregeln für die Arbeit und der Wegweiser zu den Regeln |
| `docs/regeln/` | Regeln nach Thema: Pods, Strecken, Physik & Steuerung, Grafik, Umwelt, UI, Tests, Git & Sandbox |
| `DESIGN.md` | Gestaltung nach Thema |
| `README.md` | das Spiel für Spieler, Prüfbefehle für Entwickler |
| `CONTEXT.md`, `docs/adr/` | Begriffe, grundlegende Entscheidungen |

## Verlauf (neueste zuerst)
- 2026-11-25 – [Zwischentest des Nutzers: vier Fehler (Röhrenboden, Spuren, Teile im Hauptmenü, Rammen) und sieben Verbesserungen (Intro-Tempo, Sprungweite, Flug-Deko statt Zeppelinen, Spuren im Sand, Kamera, Teile-Lack, Schatten- und Reflexions-Auflösung)](docs/verlauf/2026-11-25-zwischentest.md)
- 2026-11-23 – [Nach der Probefahrt: drei Fehler, acht Verbesserungen (Schatten-Sichtweite, Hitzeschild, Lava-Boost, Linsentropfen, Boost-Alarm, Reset-Taste, Controller im Menü) – Streckenanpassungen und TODO 2 / 5 / 8 noch offen](docs/verlauf/2026-11-23-nach-der-probefahrt.md)
- 2026-11-23 – [Übergänge am Pistenrand und zwischen Untergründen, Felsreihen und Buchten, keine Falten der Fahrbahn mehr, Höhlen-Optik, Farne, Schnee-Fotosets, echter Fels auf Aquilaris und Oovo IV](docs/verlauf/2026-11-23-uebergaenge-felsreihen-buchten.md)
- 2026-11-22 – [Skill-Set eingerichtet, Rückwärtslenkung, freie Eingänge an Höhlen und Abkürzungen, Klima wirkt auf den Boost, Schneedecke mit Spuren, Felsgrenzen statt Leitplanken](docs/verlauf/2026-11-22-skills-fehler-klima.md)
- 2026-11-22 – [Controller geht beim Rennstart aus (Diagnose), GitHub-Action auf GitHub](docs/verlauf/2026-11-22-controller-und-action.md)
- 2026-11-22 – [TODO-Runde: Wandtreffer, Pod-Kleinigkeiten, Aufwärmen, zweiter Build, GitHub-Action](docs/verlauf/2026-11-22-todo-runde.md)
- 2026-11-22 – [Speicher aufgeräumt, Doku nach Thema neu geordnet](docs/verlauf/2026-11-22-speicher-und-doku.md)
- 2026-11-22 – [Hülle je Pod: Tunneldecke und Überkopf-Bauten fertig, Test-Werkzeuge repariert](docs/verlauf/2026-11-22-huelle-je-pod.md)
- 2026-11-22 – [Tunneldecke je Pod (Folge-Commit zum Merge)](docs/verlauf/2026-11-22-tunneldecke-je-pod.md)
- 2026-11-22 – [Merge von Session 20 (Strecken) und Session 20 (Pods)](docs/verlauf/2026-11-22-merge-session-20.md)
- 2026-11-21 – [Session 20 (Pods), alle Phasen fertig – Pod-Überholung: Cockpits, Details, 4 neue Pods, Tuning-Optik, Schadensmodelle](docs/verlauf/2026-11-21-session-20-pods.md)
- Ältere Sitzungen (Session 8 bis 20 (Strecken)) und die ganze Liste: [docs/verlauf/README.md](docs/verlauf/README.md)
