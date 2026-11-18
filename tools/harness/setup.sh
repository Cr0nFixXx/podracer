#!/usr/bin/env bash
# Restores the headless test environment + .git after a sandbox reset (idempotent). Usage: bash tools/harness/setup.sh
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
if [ ! -d "$ROOT/.git" ]; then rm -rf /tmp/rc && git clone -q https://github.com/Cr0nFixXx/podracer.git /tmp/rc && cp -r /tmp/rc/.git "$ROOT/"; fi
mkdir -p "$ROOT/src/assets"; [ -f "$ROOT/src/assets/menu-bg.jpg" ] || cp /tmp/rc/src/assets/menu-bg.jpg "$ROOT/src/assets/" 2>/dev/null || true
chmod +x "$ROOT"/tools/harness/*.sh "$ROOT"/tools/ci/*.sh 2>/dev/null || true
if [ ! -d /tmp/pw/node_modules/playwright ]; then mkdir -p /tmp/pw && (cd /tmp/pw && npm init -y >/dev/null && npm i playwright@1.49.1 >/dev/null 2>&1 && npx playwright install chromium >/dev/null 2>&1 || true); fi
if [ ! -d /tmp/libs/root ]; then
  mkdir -p /tmp/libs/debs /tmp/libs/state/lists/partial /tmp/libs/cache/archives/partial && cd /tmp/libs/debs
  O="-o Dir::State::Lists=/tmp/libs/state/lists -o Dir::Cache=/tmp/libs/cache -o Debug::NoLocking=1"
  apt-get $O update >/dev/null 2>&1
  apt-get $O download libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 libxkbcommon0 libwayland-server0 libxi6 libxtst6 libxshmfence1 libvulkan1 libxrender1 libxext6 libx11-6 libxcb1 libxau6 libxdmcp6 libbsd0 libmd0 >/dev/null 2>&1
  for f in *.deb; do dpkg-deb -x "$f" /tmp/libs/root; done
fi
echo "test env ready"
