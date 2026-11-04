#!/usr/bin/env bash
# Every study case, 15 at a time, into the directory given (default .study). Takes a few minutes.
#   bash scripts/study-all.sh [dir] && node scripts/study-collect.mjs [dir]
cd "$(dirname "$0")/.."
OUT="${1:-.study}"
mkdir -p "$OUT"
{
  for sd in 1000 8919 16838 24757 32676; do echo "reference $sd reference-$sd"; done
  for c in single moon deep fouled storm tide tearBusy tearBusySingle leak10 leak10Single pumps overload debris; do echo "$c 1000 $c"; done
  for k in slide leak snag swim flow; do
    for v in low high; do echo "sens:$k:$v 1000 sens-$k-$v"; done
  done
} | xargs -P 15 -L 1 bash -c 'node --import tsx scripts/study-case.ts case=$0 seed=$1 out="'"$OUT"'/$2.json"'
