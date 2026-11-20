#!/usr/bin/env bash
# Visual test harness (headless Chromium + SwiftShader WebGL2). See CLAUDE.md "Visual testing".
# Usage:  tools/harness/run.sh pods "0,1,g,7:0.1"     (pod index[:hp], g = grid of all pods)
#         tools/harness/run.sh game "t0:a,t0:b,t7:c"  (track index : a = chase cam, b = tightest corner, c = canyon)
set -e
cd "$(dirname "$0")"
H=$1; LIST=$2; QUERY=${3:-}; OUT=out; PW_DIR=${PW_DIR:-/tmp/pw}
mkdir -p "$OUT"
npx esbuild "$H.ts" --bundle --format=esm --loader:.jpg=dataurl --outfile="$OUT/$H.js" --log-level=error
echo "<!doctype html><html><body><script type=module src=./$H.js></script></body></html>" > "$OUT/$H.html"
export LD_LIBRARY_PATH=${PW_LIBS:-/tmp/libs/root/usr/lib/x86_64-linux-gnu:/tmp/libs/root/lib/x86_64-linux-gnu}
QUERY_TAG=$( [ -n "$QUERY" ] && echo "_webgl" || echo "" )
cp shot.mjs "$PW_DIR/shot.mjs"
(cd "$PW_DIR" && node shot.mjs "$OLDPWD/$OUT/$H.html" "$LIST" "$OLDPWD/$OUT/$H$QUERY_TAG" "$QUERY")
