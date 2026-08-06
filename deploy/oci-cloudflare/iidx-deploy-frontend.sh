#!/usr/bin/env bash

set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 022

readonly DEPLOY_USER="iidxdeploy"
readonly INCOMING_DIR="/tmp/iidx-dist"
readonly APP_ROOT="/opt/iidx-scoreboard/client"
readonly CURRENT_DIR="$APP_ROOT/dist"
readonly BACKUP_DIR="$APP_ROOT/.dist-previous"
readonly FAILED_DIR="$APP_ROOT/.dist-failed"
readonly LOCK_FILE="/run/lock/iidx-deploy-frontend.lock"

exec 9>"$LOCK_FILE"
if ! flock -w 120 9; then
  echo "Another frontend deployment is already running." >&2
  exit 75
fi

if [[ ! -d "$INCOMING_DIR" || -L "$INCOMING_DIR" ]]; then
  echo "Deployment upload directory is missing or unsafe: $INCOMING_DIR" >&2
  exit 1
fi

upload_owner="$(stat -c '%U' "$INCOMING_DIR")"
if [[ "$upload_owner" != "$DEPLOY_USER" ]]; then
  echo "Deployment upload directory has an unexpected owner: $upload_owner" >&2
  exit 1
fi

upload_dir="$(mktemp -d /tmp/iidx-dist.processing.XXXXXX)"
rmdir -- "$upload_dir"
mv -- "$INCOMING_DIR" "$upload_dir"
chown root:root "$upload_dir"
chmod 0700 "$upload_dir"

staging_dir=""
switch_started=0
health_verified=0

cleanup() {
  exit_code=$?
  trap - EXIT HUP INT TERM
  set +e

  if (( switch_started == 1 && health_verified == 0 )) &&
    [[ -e "$BACKUP_DIR" || -L "$BACKUP_DIR" ]]; then
    echo "Deployment failed after switch; rolling back." >&2
    if [[ -e "$CURRENT_DIR" || -L "$CURRENT_DIR" ]]; then
      mv -- "$CURRENT_DIR" "$FAILED_DIR"
    fi
    if ! mv -- "$BACKUP_DIR" "$CURRENT_DIR"; then
      echo "Rollback could not restore the previous deployment." >&2
      if [[ ! -e "$CURRENT_DIR" && ! -L "$CURRENT_DIR" ]] &&
        [[ -e "$FAILED_DIR" || -L "$FAILED_DIR" ]]; then
        mv -- "$FAILED_DIR" "$CURRENT_DIR"
      fi
      exit_code=1
    else
      rm -rf -- "$FAILED_DIR"
    fi
  fi

  if [[ -n "$staging_dir" && -d "$staging_dir" ]]; then
    rm -rf -- "$staging_dir"
  fi
  if [[ -n "$upload_dir" && -d "$upload_dir" ]]; then
    rm -rf -- "$upload_dir"
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

unsafe_path="$(find "$upload_dir" -xdev ! -type d ! -type f -print -quit)"
if [[ -n "$unsafe_path" ]]; then
  echo "Deployment upload contains a non-regular file: $unsafe_path" >&2
  exit 1
fi

if [[ ! -s "$upload_dir/index.html" || ! -d "$upload_dir/assets" ]]; then
  echo "Deployment upload does not contain a valid Vite bundle." >&2
  exit 1
fi

expected_asset="$(
  sed -n 's/.*src="\([^"]*\/assets\/index-[^"]*\.js\)".*/\1/p' \
    "$upload_dir/index.html"
)"
expected_asset="${expected_asset%%$'\n'*}"

if [[ -z "$expected_asset" || ! -s "$upload_dir$expected_asset" ]]; then
  echo "Deployment upload references a missing entry script." >&2
  exit 1
fi

if [[ ! -d "$APP_ROOT" || -L "$APP_ROOT" ]]; then
  echo "Frontend application root is missing or unsafe: $APP_ROOT" >&2
  exit 1
fi

if [[ ! -d "$CURRENT_DIR" || -L "$CURRENT_DIR" ]]; then
  echo "Current frontend directory is missing or unsafe: $CURRENT_DIR" >&2
  exit 1
fi

staging_dir="$(mktemp -d "$APP_ROOT/.dist-staging.XXXXXX")"

cp -R --no-preserve=mode,ownership,timestamps \
  "$upload_dir/." \
  "$staging_dir/"

find "$staging_dir" -type d -exec chmod 0755 {} +
find "$staging_dir" -type f -exec chmod 0644 {} +
chown -R root:root "$staging_dir"

rm -rf -- "$BACKUP_DIR" "$FAILED_DIR"
switch_started=1
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

if ! local_html="$(curl \
  --fail \
  --silent \
  --show-error \
  --insecure \
  --connect-timeout 5 \
  --max-time 20 \
  --retry 2 \
  --retry-all-errors \
  --retry-delay 1 \
  --resolve iidxtier.page:443:127.0.0.1 \
  https://iidxtier.page/login)"; then
  echo "Local frontend health check request failed." >&2
  exit 1
fi

if [[ "$local_html" != *"$expected_asset"* ]]; then
  echo "Local frontend health check content did not match." >&2
  exit 1
fi

health_verified=1
echo "Frontend deployment succeeded: $expected_asset"
