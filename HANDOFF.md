# HANDOFF

## Nächster Schritt (zuerst lesen)
Session 20 lief in zwei Zweigen und ist zusammengeführt ([Merge](docs/verlauf/2026-11-22-merge-session-20.md)): **Session 20 (Strecken)** aus `B` und **Session 20 (Pods)** aus `new_pods`. Offen:
0. **`dev` nach `main` bringen** (Pull Request auf GitHub – Schritt des Nutzers). Vorher fehlt noch ein Push: die GitHub-Action liegt nur lokal, weil dem Token ein Recht fehlt (siehe „Git-Stand"). `main` (`3625c99`) enthält beide Sitzungen und die Tunneldecke je Pod (Pull Request #2, gemergt am 2026-11-22). Auf `dev` liegen danach: die **Hülle je Pod** (Tunneldecke fertig, Überkopf-Bauten, Test-Werkzeuge repariert – [Protokoll](docs/verlauf/2026-11-22-huelle-je-pod.md); die [Vorstufe](docs/verlauf/2026-11-22-tunneldecke-je-pod.md) ist überholt), das **Aufräumen des Speichers** und der **Umbau der Doku** ([Protokoll](docs/verlauf/2026-11-22-speicher-und-doku.md)) und die **TODO-Runde** (Wandtreffer frontal = „Front", zehn Kleinigkeiten an den Pods, Aufwärmen, zweiter Build `npm run build:web`, GitHub-Action, Harness-Bundles aus Git – [Protokoll](docs/verlauf/2026-11-22-todo-runde.md)). Was davon schon auf GitHub ist, steht unter „Git-Stand". **Vor dem ersten Commit lesen:** `docs/regeln/git-sandbox.md` (Speicher-Limit 128 MB).
1. **Strecken – Probefahrt auf echter GPU** (`npm run dev`, ≈ 10 Min.; in der Sandbox ließ sich nur in Software rendern):
   - **Aquilaris-Küstenlauf** und **Oovo-IV-Gefängnis**: Schrägkurven abfahren – ragt noch irgendwo ein Balken aus der Fahrbahn?
   - **Frostspalt-Ring:** 30-m-Tunnel, durchgehende Eishöhle mit Gabelung, Eissee (25 % weniger Haftung – fair?).
   - **Magma-Inferno:** Höhle (zu dunkel?), Lavasee (Triebwerke heizen schneller auf).
   - FPS unten rechts notieren (`WebGPU`), vor allem auf den offenen See-Passagen.
2. **Pods:** alle acht Phasen (0–7) der Pod-Überholung sind fertig, die Abschluss-Durchsicht ist eingearbeitet (fünf Korrekturen, `docs/verlauf/2026-11-21-session-20-pods.md` → „Abschluss-Durchsicht"; dort stehen auch die zurückgestellten Kleinigkeiten) – Tabelle in `docs/verlauf/2026-11-21-session-20-pods.md` → „Phasen". **Selbst prüfen:** „Ultra" am Gaming-PC (Bildrate mit vollen Details, Teilen und Schaden), die Schadens-Balance von Hand fahren, die Teile-Kombinationen durchklicken. Die Listen „Nicht verifiziert" je Phase stehen in derselben Datei. Genauer Arbeitsstand der Pod-Sitzung: `.superpowers/sdd/swift-floating-kurzweil/progress.md` (git-ignoriert, nur auf dem Rechner des Nutzers). Im **Hangar** außerdem die 6 Lackiermuster & 3 Finishes testen (offen seit Session 19).
3. Vor jeder Änderung: `npm run check` (Typecheck + Unit-Prüfungen + Pod-Audit + Sim) muss grün sein. Pods ansehen: `npm run dev` → `http://localhost:5173/tools/harness/pods.dev.html`.

## Git-Stand
- Remote `origin` = `https://github.com/Cr0nFixXx/podracer.git`. Arbeitszweig **`dev`** (vom Nutzer am 2026-11-22 angelegt, gleich nach dem Merge von PR #2). `main` nicht direkt anfassen (Pull Requests). **Pushen** nur auf ausdrücklichen Wunsch: `git push origin dev`.
- **Stand 2026-11-22:** auf GitHub liegt `dev` bis einschließlich der TODO-Runde (`6fc55fc`) und des Commits mit diesem Eintrag. Vor `main` (`3625c99`) liegen dort: Hülle je Pod `ee3dc4b`, Speicher aufgeräumt `a2925a4`, `npm run save` abgeschaltet `f845466`, `npm run restore-git` holt `dev` `a5a1fb7`, Doku neu geordnet `9fcd38a`, Git-Stand `50c310b`, TODO-Runde `6fc55fc`. **Nur lokal, nicht auf GitHub: der oberste Commit „GitHub-Action …"** (eine Datei: `.github/workflows/check.yml`). GitHub hat den Push abgelehnt: dem Zugangstoken des Nutzers fehlt das Recht, Workflow-Dateien zu schreiben (auf GitHub: Token → Repository permissions → „Workflows: Read and write"). Sobald der Token das Recht hat: `git push origin dev`, den ersten Lauf unter „Actions" ansehen, dann die Hinweise „noch nicht auf GitHub" aus `README.md`, `TODO.md` und `docs/regeln/tests.md` nehmen. Was lokal ungepusht liegt: `git log --oneline origin/dev..dev`.
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
- 2026-11-22 – [TODO-Runde: Wandtreffer, Pod-Kleinigkeiten, Aufwärmen, zweiter Build, GitHub-Action](docs/verlauf/2026-11-22-todo-runde.md)
- 2026-11-22 – [Speicher aufgeräumt, Doku nach Thema neu geordnet](docs/verlauf/2026-11-22-speicher-und-doku.md)
- 2026-11-22 – [Hülle je Pod: Tunneldecke und Überkopf-Bauten fertig, Test-Werkzeuge repariert](docs/verlauf/2026-11-22-huelle-je-pod.md)
- 2026-11-22 – [Tunneldecke je Pod (Folge-Commit zum Merge)](docs/verlauf/2026-11-22-tunneldecke-je-pod.md)
- 2026-11-22 – [Merge von Session 20 (Strecken) und Session 20 (Pods)](docs/verlauf/2026-11-22-merge-session-20.md)
- 2026-11-21 – [Session 20 (Pods), alle Phasen fertig – Pod-Überholung: Cockpits, Details, 4 neue Pods, Tuning-Optik, Schadensmodelle](docs/verlauf/2026-11-21-session-20-pods.md)
- Ältere Sitzungen (Session 8 bis 20 (Strecken)) und die ganze Liste: [docs/verlauf/README.md](docs/verlauf/README.md)
