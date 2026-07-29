#!/usr/bin/env bash
set -u
set -o pipefail

RETRY_INTERVAL_SECONDS="${RETRY_INTERVAL_SECONDS:-3600}"
RATE_LIMIT_INTERVAL_SECONDS="${RATE_LIMIT_INTERVAL_SECONDS:-10800}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-24}"
LOG_FILE="${LOG_FILE:-a1-create.log}"
OUTPUT_FILE="${OUTPUT_FILE:-tf-output.txt}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

notify() {
  local message="$1"
  if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    curl -fsS \
      -H "Content-Type: application/json" \
      -X POST \
      -d "{\"content\":\"${message}\"}" \
      "$DISCORD_WEBHOOK_URL" >/dev/null || true
  fi
}

log_failure_reason() {
  if grep -qi "Out of host capacity" "$OUTPUT_FILE"; then
    log "OCI says: Out of host capacity. A1 stock is unavailable in this AD right now."
  elif grep -qi "Too many requests" "$OUTPUT_FILE"; then
    log "OCI says: Too many requests. Backing off longer."
  elif grep -Eqi "no such host|connection reset|connection refused|timed out|i/o timeout|deadline exceeded" "$OUTPUT_FILE"; then
    log "Network/API connectivity issue detected. This attempt may not have reached OCI successfully."
  else
    log "Retryable OCI error detected. Check ${OUTPUT_FILE} for the full provider output."
  fi
}

sleep_for_failure() {
  if grep -qi "Too many requests" "$OUTPUT_FILE"; then
    log "OCI rate limit detected. Waiting ${RATE_LIMIT_INTERVAL_SECONDS}s."
    sleep "$RATE_LIMIT_INTERVAL_SECONDS"
  else
    log "Capacity or transient failure detected. Waiting ${RETRY_INTERVAL_SECONDS}s."
    sleep "$RETRY_INTERVAL_SECONDS"
  fi
}

attempt=1
log "Starting OCI A1 creation loop."

while [ "$MAX_ATTEMPTS" -eq 0 ] || [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  log "Attempt #${attempt}: terraform apply."

  if terraform apply -auto-approve >"$OUTPUT_FILE" 2>&1; then
    public_ip="$(terraform output -raw instance_public_ip 2>/dev/null || true)"
    instance_id="$(terraform output -raw instance_id 2>/dev/null || true)"

    log "Success. Instance created. Public IP: ${public_ip:-unknown}"
    notify "OCI A1 instance created. Public IP: ${public_ip:-unknown}, Instance: ${instance_id:-unknown}"
    exit 0
  fi

  if grep -Eqi "Out of capacity|Too many requests|InternalError|Service unavailable|timed out|i/o timeout|deadline exceeded|temporarily unavailable|no such host|connection reset|connection refused" "$OUTPUT_FILE"; then
    log_failure_reason
    attempt=$((attempt + 1))
    sleep_for_failure
    continue
  fi

  log "Non-retryable Terraform or OCI error. See ${OUTPUT_FILE}; stopping."
  notify "OCI A1 creation stopped on a non-retryable error. Check ${OUTPUT_FILE}."
  exit 1
done

log "Max attempts reached without creating an instance."
notify "OCI A1 creation reached max attempts without success."
exit 2
