#!/bin/sh
# Restores a missing or unusable .git folder (npm run restore-git). Three cases:
#   1. .git works                          -> nothing to do (after a sandbox reset the lost .git/config is written again).
#   2. only the folder .git/refs is gone   -> it is created again, NOTHING is lost. After `git gc` every ref lives in
#      .git/packed-refs and .git/refs holds nothing but empty folders; a sandbox reset does not keep empty folders, and without
#      .git/refs git says "not a git repository". Until 2026-11-23 this script answered that message with `rm -rf .git` – on that
#      day 21 commits that had not been pushed were one command away from being deleted.
#      So that it does not happen again, every run leaves the empty file .git/refs/.keep: a folder with a file in it survives
#      the reset, and git ignores names in .git/refs that begin with a dot (tried: for-each-ref, fsck, commit and gc are unmoved).
#   3. no .git, or one that cannot be repaired -> from the text copy in .archiv/repo-sicherung if one exists (it was deleted on
#      2026-11-22), otherwise from GitHub, work branch `dev` – commits that were never pushed are lost then. An unusable .git is
#      MOVED aside (.git.kaputt-<time>), never deleted: it may still hold such commits.
set -e
cd "$(dirname "$0")/.."
URL=https://github.com/Cr0nFixXx/podracer.git
ok() { [ -d .git ] && git rev-parse HEAD >/dev/null 2>&1; }
keep() { if [ -d .git/refs ]; then : > .git/refs/.keep; fi; }
author() { git config user.name >/dev/null || git config user.name "Podracer Dev"; git config user.email >/dev/null || git config user.email "dev@podracer.local"; }
# .git/config does not survive a sandbox reset. No remote `origin` = that happened: write the settings the sandbox needs.
config() {
  keep; author
  git remote get-url origin >/dev/null 2>&1 && return 0
  git remote add origin "$URL"; git config core.fileMode false
  echo "config written again: remote origin, core.fileMode false, author (next: git fetch origin --prune)"
}
if ok; then config; echo ".git ok – nothing to do."; exit 0; fi
if [ -f .git/HEAD ] && [ -d .git/objects ]; then
  mkdir -p .git/refs/heads .git/refs/tags
  if ok; then
    config
    echo ".git repaired: the folder .git/refs was missing, the refs themselves are in .git/packed-refs – nothing lost. HEAD $(git rev-parse --short HEAD), $(git log --oneline | wc -l | tr -d ' ') commits."
    git status --short | head -5
    exit 0
  fi
fi
if [ -e .git ]; then
  B=.git.kaputt-$(date +%Y%m%d-%H%M%S); mv .git "$B"
  echo "the unusable .git was moved to $B – it may hold commits that were never pushed. Delete it only when you are sure (it counts towards the 128 MB of the sandbox)."
fi
A=.archiv/repo-sicherung
if [ -f "$A/podracer-git.tar.gz.b64.txt" ] && base64 -d "$A/podracer-git.tar.gz.b64.txt" | tar -xz && git rev-parse HEAD >/dev/null 2>&1; then echo "restored from $A/podracer-git.tar.gz.b64.txt ($(git log --oneline | wc -l | tr -d ' ') commits)"
else rm -rf .git /tmp/rc; git clone -q --branch dev "$URL" /tmp/rc; cp -r /tmp/rc/.git .; echo "restored from GitHub, branch dev (commits that were never pushed are lost) – local changes now show as modified: git status"; fi
git remote set-url origin "$URL"
keep; author
git status --short | head -5
