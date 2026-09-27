#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
: "${BLITZTREE_BENCH:=/tmp/monodisk-blitztree-reference/target/release/bench}"
mise run build >/dev/null
report="$(mktemp /tmp/monodisk-experiment.XXXXXX)"
result=0
mise exec -- bun scripts/benchmark.ts /Applications "$BLITZTREE_BENCH" "$report" 5 || result=$?
if [[ -s "$report" ]]; then
  mise exec -- bun -e 'const r = await Bun.file(process.argv[1]).json(); console.log("METRIC wall_seconds=" + r.summary.monodiskWall); console.log("METRIC speed_ratio=" + r.summary.ratio);' "$report"
  echo "Report: $report"
fi
exit "$result"
