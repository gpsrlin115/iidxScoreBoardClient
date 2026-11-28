#!/usr/bin/env bash
set -euo pipefail

bundle_dir="${1:-dist}"
if [[ ! -s "$bundle_dir/index.html" || ! -d "$bundle_dir/assets" ]]; then
  printf 'Missing index.html or assets directory in %s\n' "$bundle_dir" >&2
  exit 1
fi

for family in gothic-a1 ibm-plex-sans-jp space-grotesk space-mono; do
  font_file="$(find "$bundle_dir/assets" -maxdepth 1 -type f -name "$family-*.woff2" -print -quit)"
  if [[ ! -s "$font_file" || ! -s "$bundle_dir/licenses/fonts/$family.txt" ]]; then
    printf 'Missing WOFF2 file or license for %s in %s\n' "$family" "$bundle_dir" >&2
    exit 1
  fi
done
