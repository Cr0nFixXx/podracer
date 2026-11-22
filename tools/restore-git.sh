#!/bin/sh
# Restores a missing .git folder: from the text copy in .archiv/repo-sicherung if one exists (it was deleted on 2026-11-22),
# otherwise from GitHub, work branch `dev` – commits that were never pushed are lost then.
set -e
cd "$(dirname "$0")/.."
[ -d .git ] && git rev-parse HEAD >/dev/null 2>&1 && { echo ".git ok – nothing to do."; exit 0; }
rm -rf .git
A=.archiv/repo-sicherung
if [ -f "$A/podracer-git.tar.gz.b64.txt" ] && base64 -d "$A/podracer-git.tar.gz.b64.txt" | tar -xz && git rev-parse HEAD >/dev/null 2>&1; then echo "restored from $A/podracer-git.tar.gz.b64.txt ($(git log --oneline | wc -l | tr -d ' ') commits)"
else rm -rf .git /tmp/rc; git clone -q --branch dev https://github.com/Cr0nFixXx/podracer.git /tmp/rc; cp -r /tmp/rc/.git .; echo "restored from GitHub, branch dev (commits that were never pushed are lost) – local changes now show as modified: git status"; fi
git remote set-url origin https://github.com/Cr0nFixXx/podracer.git
git config user.name >/dev/null || git config user.name "Podracer Dev"; git config user.email >/dev/null || git config user.email "dev@podracer.local"
git status --short | head -5
