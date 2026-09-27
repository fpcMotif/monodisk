#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
: "${BLITZTREE_BENCH:=/tmp/monodisk-blitztree-reference/target/release/bench}"
mise run build >/dev/null
mise exec -- bun scripts/benchmark.ts /Applications "$BLITZTREE_BENCH" /tmp/monodisk-experiment.json 5
mise exec -- bun -e 'const r = await Bun.file("/tmp/monodisk-experiment.json").json(); console.log("METRIC wall_seconds=" + r.summary.monodiskWall); console.log("METRIC speed_ratio=" + r.summary.ratio);'
