#!/bin/sh
# Restores a missing .git folder. Order: plain copy → bundle → base64 tar → GitHub (history of unpushed commits is lost in the last case).
set -e
cd "$(dirname "$0")/.."
[ -d .git ] && { echo ".git exists – nothing to do."; exit 0; }
A=.archiv/repo-sicherung
if [ -d "$A/git-ordner" ]; then cp -r "$A/git-ordner" .git; echo "restored from $A/git-ordner"
elif [ -f "$A/podracer-B.bundle" ]; then rm -rf /tmp/rc; git clone -q -b B "$A/podracer-B.bundle" /tmp/rc; cp -r /tmp/rc/.git .; echo "restored from bundle"
elif [ -f "$A/podracer-git.tar.gz.b64.txt" ]; then base64 -d "$A/podracer-git.tar.gz.b64.txt" | tar -xz; echo "restored from base64 text"
else rm -rf /tmp/rc; git clone -q --branch B https://github.com/Cr0nFixXx/podracer.git /tmp/rc; cp -r /tmp/rc/.git .; echo "restored from GitHub (run: npm run save -- \"Stand wiederhergestellt\")"; fi
git remote set-url origin https://github.com/Cr0nFixXx/podracer.git
git config user.name >/dev/null || git config user.name "Podracer Dev"; git config user.email >/dev/null || git config user.email "dev@podracer.local"
git status --short | head -5
