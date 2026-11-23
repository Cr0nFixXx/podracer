# Stand: 2026-11-22 – Controller geht beim Rennstart aus (Diagnose), GitHub-Action auf GitHub

Auftrag des Nutzers: (1) „workflows sollte nun gehen" – der Zugangstoken darf jetzt Workflow-Dateien schreiben; (2) Fehlermeldung: der drahtlose Xbox-Controller geht bei jedem Rennstart aus, nach dem Einschalten nach 1–2 s wieder. Nur in diesem Spiel, in anderen Spielen läuft er, früher lief er auch hier. Browser: Edge; (3) am Ende alles pushen.

## Was gemacht wurde
### 1. Controller: im Spiel nichts gefunden, der Verdacht liegt bei Windows – nicht bestätigt
- **Was das Spiel mit dem Controller macht:** es liest ihn, sonst nichts. `navigator.getGamepads()` steht an genau zwei Stellen:
  - `Game.readInput` (`src/game/Game.ts`): jedes Bild, solange ein Rennen läuft – auch schon im Countdown. Ein `Game` gibt es nur im Rennen (`RaceView.tsx`).
  - `PadBindings` (`src/ui/KeyBindings.tsx`): jedes Bild, solange Einstellungen → Steuerung offen ist.
- **Was im Quelltext fehlt:** Vibration (`vibrationActuator`, `playEffect`), WebHID, WebUSB, Web Bluetooth, Wake Lock, Gamepad-Ereignisse. Die Gamepad-Schnittstelle des Browsers hat auch gar keinen Befehl zum Ausschalten.
- **Hat sich der Zugriff geändert, seit es lief?** Nein. So gelesen wird seit dem ersten Upload (`0c5941a`, 2026-11-16): jedes Bild `getGamepads()`, das erste gemeldete Gamepad zählt. Session 16 (`fd499cb`, 2026-11-19) hat nur die Belegung einstellbar gemacht. Danach wurde an `keymap.ts`, `KeyBindings.tsx` und `readInput` nichts mehr geändert (`e4a44ce` änderte nur Dateirechte).
- **Warum gerade beim Rennstart:** kein Menü außer „Steuerung" fragt den Controller ab. Der Rennstart ist der Moment, in dem die Seite zum ersten Mal die Gamepad-Schnittstelle benutzt; erst dann beginnt der Browser, den Controller abzufragen (Chromium und Edge unter Windows über `Windows.Gaming.Input`). „Nach dem Einschalten nach 1–2 s wieder aus" passt dazu: das Rennen läuft weiter, der Browser fragt weiter ab.
- **Verdacht:** ein Fehler in **Microsoft GameInput 4.0.300** unter Windows (Oktober 2026). Nutzerberichte beschreiben dasselbe Bild: der Xbox-Controller (meist am Xbox Wireless Adapter) schaltet sich direkt nach dem Einschalten oder beim Start eines Spiels aus, immer wieder.
  - Genannte Abhilfe: `winget upgrade Microsoft.GameInput` (ab 4.0.302 behoben), dann Neustart.
  - Genannte Behelfe: im Task-Manager „GameInput" und „Gaming Services" beenden; einmal per Kabel verbinden; Firmware mit der App „Xbox-Zubehör" aktualisieren.
  - Im winget-Katalog stehen am 2026-11-22: 4.0.300, 4.0.302, 4.0.306, 4.1.313, 4.1.314.
- **Was gegen den Verdacht sprechen kann:** „in anderen Spielen geht er" passt nur, wenn diese Spiele den Controller auf einem anderen Weg lesen (zum Beispiel XInput oder Steam). Sind es auch Browser-Spiele in Edge, stimmt der Verdacht nicht.
- **Gegenprobe (Schritt des Nutzers, steht in `TODO.md` Abschnitt 1):**
  1. Im Spiel Einstellungen → Steuerung öffnen, Controller einschalten, eine Taste drücken. Bleibt er dort an („verbunden")?
  2. In Edge eine Gamepad-Testseite öffnen und eine Taste drücken. Bleibt er dort an?
  3. Im Terminal `winget list Microsoft.GameInput`: welche Version?
  - Geht er bei 1 oder 2 aus → es liegt am Lesen durch den Browser, nicht am Rennen. Dann `winget upgrade Microsoft.GameInput`, PC neu starten.
  - Bleibt er bei 1 und 2 an und geht nur im Rennen aus → der Verdacht ist falsch, im Spiel weitersuchen.
- **Am Spiel wurde nichts geändert.** Für einen Eingriff in den Code fehlt eine belegte Ursache.
- Neue Regel: `docs/regeln/physik-steuerung.md` → „Input: keys and gamepad" (das Spiel liest nur; nicht noch einmal in `readInput` suchen, bevor die Gegenprobe da ist).
- Bei der Durchsicht aufgefallen, als Entscheidung in `TODO.md` Abschnitt 2: verschwindet das Gamepad mitten im Rennen, fliegt der Pod ungesteuert weiter; und es zählt immer das erste gemeldete Gamepad.

Quellen (nur als Suchtreffer gelesen; reddit ließ sich nicht abrufen):
- https://www.reddit.com/r/WindowsHelp/comments/1x9ghid/strange_problem_with_xbox_controller_suddenly/ (GameInput 4.0.300, behoben mit 4.0.302)
- https://www.reddit.com/r/pcmasterrace/comments/1x9x1ag/xbox_controller_instantly_disconnects_after/ („GameInput Redist Service")
- https://steamcommunity.com/discussions/forum/11/666114913574560079/ (Ausschalt-Schleife am Wireless Adapter)
- https://github.com/obsproject/obs-studio/issues/14139 und https://dev.to/fancy39_9841cbc02f99f729c/obs-33-froze-every-controller-overlay-the-bug-is-three-windows-input-apis-deep-3kmn (Chromium liest Gamepads unter Windows über `Windows.Gaming.Input`)
- winget-Katalog: https://github.com/microsoft/winget-pkgs/tree/master/manifests/m/Microsoft/GameInput

### 2. Die GitHub-Action ist auf GitHub und läuft
- Der Push ging diesmal durch (`e734d36..2d089ca`): der Token des Nutzers darf jetzt Workflow-Dateien schreiben.
- Vor dem Push geändert: `actions/checkout` und `actions/setup-node` von `@v4` auf `@v7` (die aktuellen Hauptversionen am 2026-11-22, v7.0.1 und v7.1.0; beide laufen auf Node 24). Der noch nicht gepushte Commit wurde dafür neu geschrieben (`b1d6602` → `2d089ca`). Das Projekt selbst wird weiter mit Node 20 geprüft, wie in der Sandbox.
- **Erster Lauf auf GitHub: grün**, 65 s, keine Warnungen – https://github.com/Cr0nFixXx/podracer/actions/runs/45045368885

  | Schritt | Dauer |
  |---|---|
  | `npm ci` | 3 s |
  | `npm run check` | 39 s |
  | `npm run build` | 7 s |
  | `npm run build:web` | 6 s |
- Der optionale Job `npm run check:gpu` wurde übersprungen – so gewollt, er läuft nur bei einem Start von Hand mit Häkchen.
- Die Hinweise „noch nicht auf GitHub" sind aus `HANDOFF.md`, `TODO.md`, `README.md` und `docs/regeln/tests.md` entfernt; `docs/verlauf/2026-11-22-todo-runde.md` hat einen Nachtrag.

## Geprüft
- Quelltext-Suche in `src` und `index.html` nach `getGamepads`, `vibration`, `playEffect`, `hapticActuators`, `navigator.hid`, `navigator.usb`, `navigator.bluetooth`, `wakeLock`, `gamepadconnected`, `gamepaddisconnected`: nur die zwei Lesestellen.
- Git-Historie des Gamepad-Codes (`git log -S"getGamepads"`, `git log -- src/game/keymap.ts src/ui/KeyBindings.tsx`).
- Das Paket `Microsoft.GameInput` gibt es im winget-Katalog (Versionsliste oben).
- Probelauf vor dem Push in einem frischen Klon in der Sandbox: `npm ci`, `npm run check`, `npm run build`, `npm run build:web` – alle Exit 0.
- Erster Lauf der Action auf GitHub: grün (oben). `dev` liegt 9 Commits vor `main`, 0 dahinter.

## Nicht geprüft
- **Die Ursache am Rechner des Nutzers.** In der Sandbox gibt es weder einen Controller noch Windows. Der Verdacht stützt sich auf den Code (liest nur) und auf Nutzerberichte.
- Ob Edge den Controller am Rechner des Nutzers wirklich über GameInput anspricht und welche Version dort installiert ist.
- Der optionale WebGPU-Job der Action: noch nie gelaufen (`TODO.md` Abschnitt 7).

## Git
- `2d089ca` „GitHub-Action …" – gepusht, erster Lauf grün.
- Der Commit mit dieser Datei (Doku: Diagnose, Regel, `TODO.md`, `HANDOFF.md`) – auf Wunsch des Nutzers am Ende der Runde gepusht.

## Erledigt (aus `TODO.md`)
- [x] **GitHub-Action auf GitHub bringen:** `.github/workflows/check.yml` ist fertig und lokal committet, aber GitHub hat den Push abgelehnt – dem Zugangstoken des Nutzers fehlt das Recht, Workflow-Dateien zu schreiben. Danach: pushen, den ersten Lauf unter „Actions" ansehen, den optionalen WebGPU-Job einmal von Hand starten → gepusht, erster Lauf grün; der WebGPU-Job bleibt als eigener Punkt in `TODO.md` Abschnitt 7
- [x] **Xbox-Controller geht beim Rennstart aus** (Gegenprobe des Nutzers) → der Nutzer meldet am 2026-11-22: „geht wieder". Welche der Abhilfen geholfen hat, hat er nicht gesagt; am Spiel wurde nichts geändert
