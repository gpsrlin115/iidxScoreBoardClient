#!/usr/bin/env bash
# Starts the three fake backends (see README.md in this folder):
#   5301 = dev build  + new-server responses
#   5302 = dev build  + old-server responses
#   5303 = main build + old-server responses (visual baseline)
# Usage: verify/start.sh <dev dist dir> <main baseline dist dir>
# Put nvm's node first on PATH before running (see the README).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEV_DIST="$(realpath "$1")"
BASE_DIST="$(realpath "$2")"
OUT="$HERE/out"
mkdir -p "$OUT/logs"
: > "$OUT/pids"

start() {
  node "$HERE/server.mjs" --dist "$1" --port "$2" --mode "$3" --log "$OUT/logs/s$2.log" > "$OUT/logs/s$2.out" 2>&1 &
  echo $! >> "$OUT/pids"
}

start "$DEV_DIST" 5301 new
start "$DEV_DIST" 5302 old
start "$BASE_DIST" 5303 old
sleep 1
cat "$OUT"/logs/*.out
