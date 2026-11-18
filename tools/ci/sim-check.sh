#!/usr/bin/env bash
# Physics CI check: runs harness sims and fails on NaN, wall penetration or too many AI explosions.
# Usage: tools/ci/sim-check.sh ["s0:30,s9:30,s13:30"] [maxDeathsPerTrack=2]
set -e
cd "$(dirname "$0")/../harness"
LIST=${1:-"s0:30,s9:30,s13:30"}; MAXD=${2:-2}
export LD_LIBRARY_PATH=/tmp/libs/root/usr/lib/x86_64-linux-gnu:/tmp/libs/root/lib/x86_64-linux-gnu
OUT=$(./run.sh game "$LIST" 2>&1 | grep -E "^[a-z]+: [0-9]+s ")
echo "$OUT"
FAIL=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  name=${line%%:*}
  nan=$(echo "$line" | grep -o "NaN=[0-9]*" | cut -d= -f2)
  wall=$(echo "$line" | grep -o "centreBeyondWall=[0-9.]*" | cut -d= -f2)
  deaths=$(echo "$line" | grep -o "deaths=\[[^]]*\]" | grep -o "X\|F" | wc -l)
  if [ "${nan:-0}" != "0" ]; then echo "FAIL $name: NaN=$nan"; FAIL=1; fi
  if awk "BEGIN{exit !(${wall:-0} > 0.5)}"; then echo "FAIL $name: wall penetration ${wall} m"; FAIL=1; fi
  if [ "$deaths" -gt "$MAXD" ]; then echo "FAIL $name: $deaths deaths (> $MAXD)"; FAIL=1; fi
done <<< "$OUT"
[ -z "$OUT" ] && { echo "FAIL: no sim output"; exit 1; }
[ $FAIL = 0 ] && echo "sim-check OK" || exit 1
