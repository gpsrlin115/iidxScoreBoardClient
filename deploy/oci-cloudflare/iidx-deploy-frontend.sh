#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

readonly UPLOAD_DIR="/tmp/iidx-dist"
readonly APP_ROOT="/opt/iidx-scoreboard/client"
readonly CURRENT_DIR="$APP_ROOT/dist"
readonly BACKUP_DIR="$APP_ROOT/.dist-previous"
readonly FAILED_DIR="$APP_ROOT/.dist-failed"

if [[ ! -d "$UPLOAD_DIR" || -L "$UPLOAD_DIR" ]]; then
  echo "Deployment upload directory is missing or unsafe: $UPLOAD_DIR" >&2
  exit 1
fi

unsafe_path="$(find "$UPLOAD_DIR" ! -type d ! -type f -print -quit)"
if [[ -n "$unsafe_path" ]]; then
  echo "Deployment upload contains a non-regular file: $unsafe_path" >&2
  exit 1
fi

if [[ ! -s "$UPLOAD_DIR/index.html" || ! -d "$UPLOAD_DIR/assets" ]]; then
  echo "Deployment upload does not contain a valid Vite bundle." >&2
  exit 1
fi

expected_asset="$(
  sed -n 's/.*src="\([^"]*\/assets\/index-[^"]*\.js\)".*/\1/p' \
    "$UPLOAD_DIR/index.html"
)"
expected_asset="${expected_asset%%$'\n'*}"

if [[ -z "$expected_asset" || ! -s "$UPLOAD_DIR$expected_asset" ]]; then
  echo "Deployment upload references a missing entry script." >&2
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

cp -R --no-preserve=mode,ownership,timestamps \
  "$UPLOAD_DIR/." \
  "$staging_dir/"

find "$staging_dir" -type d -exec chmod 0755 {} +
find "$staging_dir" -type f -exec chmod 0644 {} +
chown -R root:root "$staging_dir"

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

rm -rf -- "$UPLOAD_DIR"
echo "Frontend deployment succeeded: $expected_asset"
