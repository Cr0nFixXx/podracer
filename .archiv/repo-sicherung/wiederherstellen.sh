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
