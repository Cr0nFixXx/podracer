#!/bin/sh
# Commit everything locally and refresh the repository copies inside .archiv/repo-sicherung/.
# Usage: npm run save -- "commit message"
# Why three copies: the download/sandbox drops the hidden `.git` folder (and dropped a lone binary bundle once). So we keep
#   git-ordner/                  plain copy of .git  → rename to `.git` inside the project folder
#   podracer-B.bundle            single-file git bundle of branch B
#   podracer-git.tar.gz.b64.txt  .git as tar.gz in base64 TEXT (survives binary filters)
# The copies are never committed (pathspec exclude) and must NOT be git-ignored.
set -e
cd "$(dirname "$0")/.."
A=.archiv/repo-sicherung
git add -A -- . ":(exclude)$A"
if git diff --cached --quiet; then echo "Nothing to commit."; else git commit -q -m "${1:-Zwischenstand}"; fi
git gc -q --prune=now 2>/dev/null || true
rm -rf "$A/git-ordner"; mkdir -p "$A"
cp -r .git "$A/git-ordner"
git bundle create "$A/podracer-B.bundle" B >/dev/null 2>&1
tar -czf - .git | base64 > "$A/podracer-git.tar.gz.b64.txt"
cat > "$A/LIESMICH.txt" <<TXT
Git-Sicherung des Podracer-Projekts (Branch B) – Stand: $(git log -1 --format='%h %s' | cut -c1-110)
Commits: $(git log --oneline | wc -l | tr -d ' ')   Remote: https://github.com/Cr0nFixXx/podracer.git

Der versteckte Ordner ".git" fehlt im Download. Diese drei Kopien enthalten dasselbe Repository:

1) git-ordner/  (einfachster Weg)
   Ordner in den Projektordner kopieren und in ".git" umbenennen. Danach: git status / git push origin B

2) podracer-B.bundle  (eine Datei)
   git clone -b B podracer-B.bundle podracer
   cd podracer && git remote set-url origin https://github.com/Cr0nFixXx/podracer.git && git push origin B

3) podracer-git.tar.gz.b64.txt  (Textdatei, falls 1 und 2 fehlen)
   Linux/macOS:  base64 -d podracer-git.tar.gz.b64.txt | tar -xz      (erzeugt den Ordner .git)
   Windows:      certutil -decode podracer-git.tar.gz.b64.txt git.tar.gz   und dann   tar -xzf git.tar.gz
TXT
git bundle verify "$A/podracer-B.bundle" >/dev/null 2>&1 && echo "Saved: $(git log --oneline | wc -l | tr -d ' ') commits, HEAD $(git rev-parse --short HEAD) → $A ($(du -sh "$A" | cut -f1))"
