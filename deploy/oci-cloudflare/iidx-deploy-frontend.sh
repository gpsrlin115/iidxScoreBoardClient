#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

readonly ARCHIVE="/tmp/iidx-scoreboard-frontend.tar.gz"
readonly APP_ROOT="/opt/iidx-scoreboard/client"
readonly CURRENT_DIR="$APP_ROOT/dist"
readonly BACKUP_DIR="$APP_ROOT/.dist-previous"
readonly FAILED_DIR="$APP_ROOT/.dist-failed"

if [[ ! -s "$ARCHIVE" ]]; then
  echo "Deployment archive is missing or empty: $ARCHIVE" >&2
  exit 1
fi

archive_entries="$(tar -tzf "$ARCHIVE")"
if grep -Eq '(^/|(^|/)\.\.(/|$))' <<<"$archive_entries"; then
  echo "Deployment archive contains an unsafe path." >&2
  exit 1
fi

archive_listing="$(tar -tvzf "$ARCHIVE")"
if grep -Eq '^[lh]' <<<"$archive_listing"; then
  echo "Deployment archive must not contain links." >&2
  exit 1
fi

mkdir -p "$APP_ROOT"
staging_dir="$(mktemp -d "$APP_ROOT/.dist-staging.XXXXXX")"

cleanup_staging() {
  if [[ -n "${staging_dir:-}" && -d "$staging_dir" ]]; then
    rm -rf -- "$staging_dir"
  fi
}
trap cleanup_staging EXIT

tar \
  --extract \
  --gzip \
  --file="$ARCHIVE" \
  --directory="$staging_dir" \
  --no-same-owner \
  --no-same-permissions

symlink_path="$(find "$staging_dir" -type l -print -quit)"
if [[ -n "$symlink_path" ]]; then
  echo "Deployment archive must not contain symbolic links." >&2
  exit 1
fi

if [[ ! -s "$staging_dir/index.html" || ! -d "$staging_dir/assets" ]]; then
  echo "Deployment archive does not contain a valid Vite bundle." >&2
  exit 1
fi

expected_asset="$(
  sed -n 's/.*src="\([^"]*\/assets\/index-[^"]*\.js\)".*/\1/p' \
    "$staging_dir/index.html"
)"
expected_asset="${expected_asset%%$'\n'*}"

if [[ -z "$expected_asset" || ! -s "$staging_dir$expected_asset" ]]; then
  echo "Deployment bundle references a missing entry script." >&2
  exit 1
fi

find "$staging_dir" -type d -exec chmod 0755 {} +
find "$staging_dir" -type f -exec chmod 0644 {} +

rm -rf -- "$BACKUP_DIR" "$FAILED_DIR"
if [[ -e "$CURRENT_DIR" || -L "$CURRENT_DIR" ]]; then
  mv -- "$CURRENT_DIR" "$BACKUP_DIR"
fi

if ! mv -- "$staging_dir" "$CURRENT_DIR"; then
  if [[ -e "$BACKUP_DIR" || -L "$BACKUP_DIR" ]]; then
    mv -- "$BACKUP_DIR" "$CURRENT_DIR"
  fi
  exit 1
fi
staging_dir=""

local_html="$(curl \
  --fail \
  --silent \
  --show-error \
  --insecure \
  --resolve iidxtier.page:443:127.0.0.1 \
  https://iidxtier.page/login)"

if [[ "$local_html" != *"$expected_asset"* ]]; then
  echo "Local frontend health check failed; rolling back." >&2
  mv -- "$CURRENT_DIR" "$FAILED_DIR"
  if [[ -e "$BACKUP_DIR" || -L "$BACKUP_DIR" ]]; then
    mv -- "$BACKUP_DIR" "$CURRENT_DIR"
  fi
  rm -rf -- "$FAILED_DIR"
  exit 1
fi

rm -f -- "$ARCHIVE"
echo "Frontend deployment succeeded: $expected_asset"
