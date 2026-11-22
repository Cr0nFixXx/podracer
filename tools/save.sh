#!/bin/sh
# Commit everything locally and refresh the repository copy inside `.archive` (full `.git` copy + base64 text archive)
# and `.archiv/repo-sicherung` (base64 text archive + restore scripts).
# Usage: npm run save -- "commit message"

# --- SWITCHED OFF since 2026-11-22 (user decision, "for now") -------------------------------------------
# The script writes three copies of .git (measured: 123 MB together). The saved workspace of the sandbox
# may only hold 128 MB; above that the state is lost (HANDOFF.md, section "Git-Stand").
# To switch it on again: delete this block down to the line "--- end of switch ---".
cat >&2 <<'TXT'
npm run save ist abgeschaltet (seit 2026-11-22). Es wurde nichts committet und nichts gesichert.

Grund: Das Skript legt drei Kopien von .git an (zusammen rund 120 MB).
       Der Arbeitsordner der Sandbox darf aber nur 128 MB groß sein.

Stattdessen committen:
  git add <Pfade>
  git commit -m "Nachricht"
  git gc --prune=now

Wieder einschalten: den markierten Block am Anfang von tools/save.sh löschen.
TXT
exit 1
# --- end of switch --------------------------------------------------------------------------------------

set -e
cd "$(dirname "$0")/.."
A=.archiv/repo-sicherung
B=.archive
git add -A -- . ":(exclude)$B"
if git diff --cached --quiet; then echo "Nothing to commit."; else git commit -q -m "${1:-Zwischenstand}"; fi
git gc -q --prune=now 2>/dev/null || true

write_restore() {
  DIR="$1"
  cat > "$DIR/wiederherstellen.sh" <<'TXT'
#!/bin/sh
# Linux / macOS / Git-Bash: im Projektordner ausführen
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
while [ ! -f package.json ] && [ "$(pwd)" != "/" ]; do cd ..; done
[ -d .git ] && { echo ".git existiert bereits."; exit 0; }
if [ -f "$SRC/podracer-git.tar.gz.b64.txt" ]; then
  base64 -d "$SRC/podracer-git.tar.gz.b64.txt" | tar -xz
elif [ -d "$SRC/git/objects" ]; then
  cp -a "$SRC/git" .git
fi
git log --oneline | head -5
echo "Fertig. Hochladen mit: git push origin B"
TXT
  cat > "$DIR/wiederherstellen.ps1" <<'TXT'
# Windows PowerShell: im Projektordner ausführen
$Src = $PSScriptRoot
$Root = Resolve-Path (Join-Path $Src "..")
if (-not (Test-Path (Join-Path $Root "package.json"))) { $Root = Resolve-Path (Join-Path $Src "..\..") }
Set-Location $Root
if (Test-Path ".git") { Write-Host ".git existiert bereits."; exit }
$B64 = Join-Path $Src "podracer-git.tar.gz.b64.txt"
if (Test-Path $B64) {
  certutil -decode $B64 "$env:TEMP\podracer-git.tar.gz" | Out-Null
  tar -xzf "$env:TEMP\podracer-git.tar.gz"
} elseif (Test-Path (Join-Path $Src "git\objects")) {
  Copy-Item -Recurse -Force (Join-Path $Src "git") ".git"
}
git log --oneline -5
Write-Host "Fertig. Hochladen mit: git push origin B"
TXT
  cat > "$DIR/LIESMICH.txt" <<TXT
Git-Sicherung des Podracer-Projekts (Branch B)
Stand: $(git log -1 --format='%h %s' | cut -c1-110)
Commits: $(git log --oneline | wc -l | tr -d ' ')   Remote: https://github.com/Cr0nFixXx/podracer.git

Enthält sowohl eine direkte Kopie von .git (in .archive/git) als auch "podracer-git.tar.gz.b64.txt"
(vollständiges .git als Base64-Text, falls Binär-Packdateien beim Download gefiltert werden).

Wiederherstellen – im Projektordner ausführen:
  Linux/macOS:  sh .archive/wiederherstellen.sh
  Windows:      powershell -ExecutionPolicy Bypass -File .archive\\wiederherstellen.ps1
  Oder manuell: cp -a .archive/git .git   bzw.   base64 -d .archive/podracer-git.tar.gz.b64.txt | tar -xz

Danach:  git log --oneline   und   git push origin B
TXT
}

rm -rf "$A" "$B"
mkdir -p "$A" "$B"
cp -a .git "$B/git"
tar -czf - .git | base64 > "$B/podracer-git.tar.gz.b64.txt"
cp "$B/podracer-git.tar.gz.b64.txt" "$A/podracer-git.tar.gz.b64.txt"
write_restore "$B"
write_restore "$A"

# Self-test both backups
T=$(mktemp -d)
(cd "$T" && base64 -d "$OLDPWD/$B/podracer-git.tar.gz.b64.txt" | tar -xz && git log --oneline >/dev/null)
git --git-dir="$B/git" log -1 --oneline >/dev/null
echo "Saved: $(git log --oneline | wc -l | tr -d ' ') commits, HEAD $(git rev-parse --short HEAD) → .archive/git + .archive/podracer-git.tar.gz.b64.txt ($(du -sh "$B" | cut -f1), both restore tests ok)"
rm -rf "$T"
