#!/bin/sh
# Commit everything locally and refresh the repository copy inside .archiv/repo-sicherung/.
# Usage: npm run save -- "commit message"
# Lesson from three lost histories: the download/sandbox drops the hidden `.git` folder AND binary files without a known
# extension (git packs, bundles). Only TEXT survives reliably → the whole `.git` folder is stored as tar.gz in base64 text.
# (Verified at the start of Session 14: the base64 copy restored all commits; folder copy and bundle were gone/corrupt.)
# The copy is never committed (pathspec exclude) and must NOT be git-ignored.
set -e
cd "$(dirname "$0")/.."
A=.archiv/repo-sicherung
git add -A -- . ":(exclude)$A"
if git diff --cached --quiet; then echo "Nothing to commit."; else git commit -q -m "${1:-Zwischenstand}"; fi
git gc -q --prune=now 2>/dev/null || true
rm -rf "$A"; mkdir -p "$A"
tar -czf - .git | base64 > "$A/podracer-git.tar.gz.b64.txt"
cat > "$A/wiederherstellen.sh" <<'TXT'
#!/bin/sh
# Linux / macOS / Git-Bash: im Projektordner ausführen →  sh .archiv/repo-sicherung/wiederherstellen.sh
set -e
cd "$(dirname "$0")/../.."
[ -d .git ] && { echo ".git existiert bereits."; exit 0; }
base64 -d .archiv/repo-sicherung/podracer-git.tar.gz.b64.txt | tar -xz
git log --oneline | head -5
echo "Fertig. Hochladen mit: git push origin B"
TXT
cat > "$A/wiederherstellen.ps1" <<'TXT'
# Windows PowerShell: im Projektordner ausführen →  powershell -ExecutionPolicy Bypass -File .archiv\repo-sicherung\wiederherstellen.ps1
Set-Location (Join-Path $PSScriptRoot "..\..")
if (Test-Path ".git") { Write-Host ".git existiert bereits."; exit }
certutil -decode ".archiv\repo-sicherung\podracer-git.tar.gz.b64.txt" "$env:TEMP\podracer-git.tar.gz" | Out-Null
tar -xzf "$env:TEMP\podracer-git.tar.gz"
git log --oneline -5
Write-Host "Fertig. Hochladen mit: git push origin B"
TXT
cat > "$A/LIESMICH.txt" <<TXT
Git-Sicherung des Podracer-Projekts (Branch B)
Stand: $(git log -1 --format='%h %s' | cut -c1-110)
Commits: $(git log --oneline | wc -l | tr -d ' ')   Remote: https://github.com/Cr0nFixXx/podracer.git

Der versteckte Ordner ".git" fehlt im Download. Die Datei "podracer-git.tar.gz.b64.txt" enthält ihn vollständig
(als Text verpackt, weil nur Textdateien den Download zuverlässig überstehen).

Wiederherstellen – im Projektordner ausführen:
  Windows:      powershell -ExecutionPolicy Bypass -File .archiv\\repo-sicherung\\wiederherstellen.ps1
  Linux/macOS:  sh .archiv/repo-sicherung/wiederherstellen.sh

Von Hand:
  Linux/macOS:  base64 -d .archiv/repo-sicherung/podracer-git.tar.gz.b64.txt | tar -xz
  Windows:      certutil -decode .archiv\\repo-sicherung\\podracer-git.tar.gz.b64.txt git.tar.gz   und dann   tar -xzf git.tar.gz

Danach:  git log --oneline     und     git push origin B
TXT
# self-test: the text copy must restore a readable repository
T=$(mktemp -d); (cd "$T" && base64 -d "$OLDPWD/$A/podracer-git.tar.gz.b64.txt" | tar -xz && git log --oneline >/dev/null) && echo "Saved: $(git log --oneline | wc -l | tr -d ' ') commits, HEAD $(git rev-parse --short HEAD) → $A/podracer-git.tar.gz.b64.txt ($(du -sh "$A" | cut -f1), restore test ok)"; rm -rf "$T"
