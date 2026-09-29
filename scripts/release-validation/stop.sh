#!/usr/bin/env bash
# Stops the servers start.sh launched, by the PIDs it recorded.
# Not `pkill -f server.mjs`: that pattern also matches the calling shell's own command line.
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/out/pids" ]; then
  xargs -r kill < "$HERE/out/pids" 2>/dev/null
  rm -f "$HERE/out/pids"
fi
