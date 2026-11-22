# Stand: 2026-11-22 – Speicher aufgeräumt, Doku nach Thema neu geordnet

## Speicher der Sandbox (Commits `a2925a4`, `f845466`, `a5a1fb7`)
- **Anlass:** der gesicherte Arbeitsordner der Sandbox darf 128 MB groß sein; er lag bei 130,6 MB. Sehr wahrscheinlich ist deshalb ein lokaler Commit bei einem Reset verloren gegangen (geschlossen aus den Größen, nicht bewiesen).
- **`.git` neu gepackt:** 105,8 → 33,2 MB. Alle Commits und Zweige unverändert (`git fsck` sauber; die Liste der erreichbaren Objekte ist vorher und nachher gleich).
- **Alte Text-Sicherung gelöscht:** `.archiv/repo-sicherung/` (10,2 MB, Stand Session 19) – Entscheidung des Nutzers. Arbeitsordner danach: 47,8 MB.
- **`npm run save` abgeschaltet** (Entscheidung des Nutzers: „erstmal"). **`npm run restore-git` holt den Zweig `dev`** (vorher fest `B`).
- Regeln, Zahlen und Rezepte dazu: `docs/regeln/git-sandbox.md`.

## Doku nach Thema neu geordnet (Commit `9fcd38a`)
Entscheidungen des Nutzers: (1) Sitzungsprotokolle und erledigte Punkte in eigene Dateien verschieben, (2) `CLAUDE.md` in Grundregeln und Themen-Dateien teilen, (3) Texte nur umsortieren und Überholtes streichen – keine Regel neu formulieren.

| Datei | vorher | nachher |
|---|---|---|
| `HANDOFF.md` | 158,5 kB | 5,7 kB – die 17 Sitzungsprotokolle stehen in `docs/verlauf/` (zusammen 167,0 kB, mit den erledigten Punkten aus `TODO.md`) |
| `CLAUDE.md` | 58,6 kB | 3,9 kB – die Regeln stehen in `docs/regeln/` (69,5 kB in 8 Dateien) |
| `TODO.md` | 21,7 kB | 6,5 kB – nur offene Punkte |
| `DESIGN.md` | 35,2 kB | 35,9 kB – nach Thema statt nach Sitzung |

**So ist umsortiert**
- `HANDOFF.md`: jeder Abschnitt „Stand: …" ist eine Datei in `docs/verlauf/`. Die erledigten Punkte aus `TODO.md` hängen an der Datei ihrer Sitzung.
- `CLAUDE.md`: jede Regel steht wörtlich in genau einer Themen-Datei. Dahinter steht die Sitzung, aus der sie stammt; widersprechen sich zwei Regeln, gilt die jüngere.
- `DESIGN.md`: Punkte und Tabellenzeilen stehen wörtlich unter ihrem Thema, ebenfalls mit der Sitzung. Tabellen mit zwei Spalten sind zeilenweise verteilt.
- Eine Regel aus Session 19 (Bodenplatten, Nebel, Schleusen, Pod-Aufwertung) ist satzweise auf vier Themen-Dateien verteilt.
- Das Test-Setup stand im Protokoll von Session 9 und steht jetzt in `docs/regeln/tests.md`.
- Acht überholte Punkte aus dem alten „Git-Stand" (Branch `B`, `.archive`, `npm run save`) stehen wörtlich am Ende dieser Datei.

**Gestrichen** (fünf Zeilen) – alles andere ist erhalten
- `CLAUDE.md`, „Sandbox storage limit": englische Kurzfassung des deutschen Blocks „Speicher-Limit der Sandbox". Der Block steht in `docs/regeln/git-sandbox.md`, die Kurzregel in `CLAUDE.md`.
- `CLAUDE.md`, „Weather front / timelines" (Session 12): sagte nur, dass die Regel durch Session 13 ersetzt ist.
- `DESIGN.md`, „Startnummer" (Session 15): ersetzt durch „Keine Schilder am Pod" (Session 16).
- `DESIGN.md`, „Hitzeflimmern < 0,35 %" (Session 12): ersetzt durch die Zeile aus Session 13 (< 0,15 %).
- `DESIGN.md`, „Stadt" (Session 9): die Ökumenopolis ist seit Session 19 entfernt.

**Neu geschrieben** – Stand-Texte und Verweise, keine Regeln
- `HANDOFF.md`: Einleitung und Punkt 0 von „Nächster Schritt", „Git-Stand" (Zweige, was gepusht ist), die Wegweiser.
- `CLAUDE.md`: die Doku-Regel (neuer Aufbau), die Zeile „Repo" (`B` → `dev`), die Kurzregel zu Git, die beiden Tabellen.
- Verweise in 13 umgezogenen Zeilen, die auf alte Abschnitte zeigten („rules above", „`HANDOFF.md` → …", „Abschnitt … unten"); in `TODO.md` außerdem „Push auf `B`" → `dev`. Der übrige Text dieser Zeilen ist unverändert.
- Verweise außerhalb der vier Dateien: `README.md` (drei Stellen), Kommentare in `tools/ci/pods.ts`, `tools/ci/gpu.mjs`, `tools/harness/run.sh`, `tools/save.sh` und die Notiz in `tools/ci/pods-baseline.json` („say why in `HANDOFF.md`" → `docs/verlauf/`).

**Neu dazugekommen**
- Kopf jeder Themen-Datei: wozu sie da ist, was die Marken hinter den Regeln bedeuten, Querverweise.
- `CLAUDE.md`: „Start of a session: read `HANDOFF.md`" und die Regel, vor einer Änderung die Themen-Datei zu lesen.
- `docs/regeln/tests.md`, Test-Setup Punkt 6: Arbeitsordner `/var/tmp/t`, Dauer des Smoke-Tests, eine Strecke je Lauf.
- `README.md`: ein Satz zu `npm run restore-git` (holt einen fehlenden Ordner `.git` von GitHub, Zweig `dev`).
- `TODO.md`: neuer offener Punkt „Regeln inhaltlich durchsehen".

**Geprüft**
- Das Umbau-Skript hat jede Zeile abgerechnet: von 1423 nicht leeren Zeilen der vier alten Dateien stehen 1302 wörtlich in den neuen Dateien. Bei 13 ist nur ein Verweis angepasst, 1 ist satzweise aufgeteilt, 6 sind neu geschrieben (Stand-Texte, siehe oben), 5 gestrichen. 96 waren Überschriften oder Tabellenköpfe der alten Gliederung.
- Gegenprobe ohne das Skript: jede alte Zeile im neuen Text gesucht – es fehlen genau die eben genannten.
- Alle Verweise auf Dateien zeigen auf vorhandene Dateien (Ausnahme: `.superpowers/…/progress.md` liegt nur auf dem Rechner des Nutzers).
- `npm run check` grün. Am Quelltext des Spiels (`src/`) und an den Bundles hat sich nichts geändert, in den Werkzeugen nur Kommentare.

**Nicht geändert**
- Zwei Kommentare in `src/game/` nennen weiter die alten Orte (`photoTex.ts`: „see HANDOFF", `terrainMaterial.ts`: „see CLAUDE.md"). Beide Dateien führen über ihre Wegweiser zum Ziel (`docs/verlauf/2026-11-20-session-18.md`, `docs/regeln/grafik.md`).

**Nicht geprüft**
- Ob jede alte Regel noch zum Code passt. Gestrichen ist nur, was nachweislich überholt war. Ältere Regeln, denen eine jüngere widerspricht, stehen weiter da – die jüngere gilt.

## Gepusht
- Am 2026-11-22 auf Wunsch des Nutzers nach `origin/dev`: `f845466`, `a5a1fb7`, `9fcd38a`. Geprüft mit `git ls-remote` und dem Vergleich auf GitHub: `dev` = `9fcd38a`, fünf Commits vor `main`, keiner dahinter. Danach der Commit mit diesem Eintrag.

## Überholte Punkte aus dem früheren Abschnitt „Git-Stand" (wörtlich, nur zur Erinnerung)
- Lokales Repo im Projekt-Root, Branch **`B`**, Remote `origin` = `https://github.com/Cr0nFixXx/podracer.git`. **Pushen:** `git push origin B`.
- Fremde Alt-Dateien (`canblatt.html`, `canwelk.html`) liegen sauber in `.archiv/` (git-ignoriert).
- **Doppelte `.git`-Sicherung in `.archive/`** (+ kompatible Spiegelkopie in `.archiv/repo-sicherung/`):
  1. `.archive/git` – direkte vollständige Ordnerkopie von `.git`
  2. `.archive/podracer-git.tar.gz.b64.txt` – vollständiges `.git` als Base64-Text (falls Binär-Packdateien beim Download gefiltert werden) + `wiederherstellen.sh` / `wiederherstellen.ps1` / `LIESMICH.txt`.
- (**Überholt:** `npm run save` ist seit dem 2026-11-22 abgeschaltet – siehe „Speicher-Limit der Sandbox" weiter unten. Committen: `git add <Pfade>`, `git commit`, `git gc --prune=now`.) **Committen immer mit `npm run save -- "Nachricht"`** (`tools/save.sh`): committet alles außer `.archive`/`.archiv`, aktualisiert beide Sicherungen und führt Probe-Wiederherstellungen aus.
- Seit dem Commit `d7b9c4b` ist `.archiv/repo-sicherung/` versioniert: im Haupt-Checkout committet dadurch jedes `npm run save` eine Kopie des ganzen Repos ins Repo (Größe wächst je Sicherung etwa um den Faktor 2,3). **Entschieden am 2026-11-22: gelöscht.** `.archiv/repo-sicherung/` ist aus dem Repo entfernt (letzter Commit mit der Datei: `ee3dc4b`; die Historie behält sie).
- **Session 20 (Strecken), Sandbox:** Das Repo wurde frisch von GitHub geholt (`git init` + `fetch` + `checkout --track origin/B`); `.archive/` gibt es in diesem Arbeitsordner nicht. Laut Nutzer ist die `.git`-Sicherung nicht mehr relevant → die Sitzung ist mit **normalen Commits** gesichert (`git add <Pfade>` + `git commit`, ohne `npm run save`) und auf Wunsch des Nutzers **nach `origin/B` gepusht**. Die Textkopie in `.archiv/repo-sicherung/` stand deshalb auf dem Stand von Session 19 und ist inzwischen gelöscht (Punkt darüber) – GitHub ist die Sicherung.

## Erledigt (aus dem früheren `TODO.md`)
- [x] `.git` neu gepackt (105,8 → 33,2 MB, nichts verloren) und die alte Text-Sicherung `.archiv/repo-sicherung/` gelöscht: der Arbeitsordner ist von 130,6 auf rund 48 MB geschrumpft (Limit 128 MB). Regel seitdem: nach jedem Commit `git gc --prune=now` (`docs/regeln/git-sandbox.md`)
- [x] `npm run save` abgeschaltet (Entscheidung des Nutzers: „erstmal"): `tools/save.sh` meldet das, endet mit Exit-Code 1 und ändert nichts. Es schriebe heute 123 MB in den Arbeitsordner. Wieder einschalten: den markierten Block am Anfang von `tools/save.sh` löschen
- [x] `npm run restore-git` holt jetzt den Zweig `dev` (vorher fest `B`) – in einem Ordner ohne `.git` getestet
