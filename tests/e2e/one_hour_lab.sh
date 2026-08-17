#!/usr/bin/env bash
set -euo pipefail

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 2
  fi
}

require API_GATEWAY_BASE_URL
require PREDICTION_QUEUE_URL
require DYNAMODB_AUDIT_TABLE

AWS_REGION="${AWS_REGION:-us-east-1}"
WARMUP_MINUTES="${WARMUP_MINUTES:-35}"
POLL_SECONDS="${POLL_SECONDS:-1800}"
POST_SEED_SLEEP_SECONDS="${POST_SEED_SLEEP_SECONDS:-30}"
RUN_ID="${RUN_ID:-lab30-$(date -u +%Y%m%dT%H%M%SZ)}"
TENANT_ID="${TENANT_ID:-demo-tenant-001}"
BASE_URL="${API_GATEWAY_BASE_URL%/}"
ARTIFACT_DIR="${ARTIFACT_DIR:-evidence/lab/${RUN_ID}}"
SERVICES=(ledger payment-gw fraud-detector)

case "${BASE_URL}" in
  http://*|https://*) ;;
  *) BASE_URL="https://${BASE_URL}" ;;
esac

INGEST_AUTH_HEADER=()
INGEST_AUTH_FLAGS=()
if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  INGEST_AUTH_FLAGS=(--aws-sigv4 "aws:amz:${AWS_REGION}:execute-api" --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}")
  if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
    INGEST_AUTH_HEADER+=(-H "x-amz-security-token: ${AWS_SESSION_TOKEN}")
  fi
  if [[ -n "${TENANT_INGEST_TOKEN:-}" ]]; then
    INGEST_AUTH_HEADER+=(-H "X-Tenant-Ingest-Token: ${TENANT_INGEST_TOKEN}")
  fi
elif [[ -n "${TENANT_INGEST_TOKEN:-}" ]]; then
  INGEST_AUTH_HEADER=(-H "Authorization: Bearer ${TENANT_INGEST_TOKEN}")
else
  echo "Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or TENANT_INGEST_TOKEN for ingest auth." >&2
  exit 2
fi

mkdir -p "${ARTIFACT_DIR}"
expr_values="$(mktemp)"
trap 'rm -f "${expr_values}" /tmp/one-hour-lab-ingest-response.txt' EXIT

python - "${TENANT_ID}" "${expr_values}" <<'PY'
import json
import sys

tenant, path = sys.argv[1:3]
with open(path, "w", encoding="utf-8") as stream:
    json.dump({":tenant": {"S": tenant}}, stream)
PY

post_metric() {
  local correlation_id="$1"
  local payload="$2"
  curl -sS -o /tmp/one-hour-lab-ingest-response.txt -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/ingest" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-Id: ${TENANT_ID}" \
    -H "X-Correlation-Id: ${correlation_id}" \
    "${INGEST_AUTH_FLAGS[@]}" \
    "${INGEST_AUTH_HEADER[@]}" \
    -d "${payload}"
}

generate_payloads() {
  local service="$1"
  python - "${TENANT_ID}" "${service}" "${AWS_REGION}" <<'PY'
import json
import sys
from datetime import datetime, timezone

tenant, service, region = sys.argv[1:4]
timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
metrics = [
    ("cpu_usage_percent", 42.0, {"region": region, "environment": "lab"}),
    ("memory_usage_percent", 55.0, {"region": region, "environment": "lab"}),
    ("active_connections", 120.0, {"region": region, "environment": "lab"}),
    ("db_connection_pool_pct", 35.0, {"region": region, "db_type": "postgres", "environment": "lab"}),
    ("queue_depth", 3.0, {"region": region, "queue_name": "lab", "environment": "lab"}),
    ("cache_hit_rate_pct", 91.0, {"region": region, "cache_type": "redis", "environment": "lab"}),
    ("api_latency_ms", 180.0, {"region": region, "environment": "lab"}),
]
for metric_type, value, labels in metrics:
    print(json.dumps({
        "ts": timestamp,
        "tenant_id": tenant,
        "service_id": service,
        "metric_type": metric_type,
        "value": value,
        "labels": labels,
    }, separators=(",", ":")))
PY
}

echo "Starting disposable lab run ${RUN_ID}"
echo "Warming 7 signals for ${SERVICES[*]} for ${WARMUP_MINUTES} minutes"
for minute in $(seq 1 "${WARMUP_MINUTES}"); do
  for service in "${SERVICES[@]}"; do
    while IFS= read -r payload; do
      status="$(post_metric "${RUN_ID}-warmup-${service}" "${payload}" || true)"
      if [[ "${status}" != "201" && "${status}" != "202" ]]; then
        echo "Ingest failed for ${service}: HTTP ${status}" >&2
        cat /tmp/one-hour-lab-ingest-response.txt >&2 || true
        exit 1
      fi
    done < <(generate_payloads "${service}")
  done

  printf 'Warm-up minute %s/%s complete\n' "${minute}" "${WARMUP_MINUTES}"
  if (( minute < WARMUP_MINUTES )); then
    sleep 60
  fi
done

sleep "${POST_SEED_SLEEP_SECONDS}"

for service in "${SERVICES[@]}"; do
  prediction_id="${RUN_ID}-${service}"
  job_body="$(python - "${TENANT_ID}" "${service}" "${prediction_id}" <<'PY'
import json
import sys

tenant, service, prediction_id = sys.argv[1:4]
print(json.dumps({
    "tenant_id": tenant,
    "service_id": service,
    "lookback_window_minutes": 30,
    "correlation_id": prediction_id,
}))
PY
)"

  aws sqs send-message \
    --region "${AWS_REGION}" \
    --queue-url "${PREDICTION_QUEUE_URL}" \
    --message-body "${job_body}" \
    >"${ARTIFACT_DIR}/send-${service}.json"
done

echo "Polling audit records for three 30-minute prediction jobs"
deadline=$((SECONDS + POLL_SECONDS))
while (( SECONDS < deadline )); do
  aws dynamodb query \
    --region "${AWS_REGION}" \
    --table-name "${DYNAMODB_AUDIT_TABLE}" \
    --key-condition-expression "tenant_id = :tenant" \
    --expression-attribute-values "file://${expr_values}" \
    --consistent-read \
    >"${ARTIFACT_DIR}/audit-query.json"

  result="$(python - "${ARTIFACT_DIR}/audit-query.json" "${RUN_ID}" <<'PY'
import json
import sys

path, run_id = sys.argv[1:3]
services = ["ledger", "payment-gw", "fraud-detector"]
expected = {f"{run_id}-{service}": service for service in services}
with open(path, encoding="utf-8") as stream:
    items = json.load(stream).get("Items", [])

seen = {}
for item in items:
    prediction_id = item.get("prediction_id", {}).get("S")
    if prediction_id in expected:
        seen[prediction_id] = {
            "service": item.get("service_id", {}).get("S", ""),
            "source": item.get("prediction_source", {}).get("S", ""),
            "evidence": item.get("evidence_status", {}).get("S", ""),
            "ai_status": item.get("ai_status_code", {}).get("N", "0"),
            "decision": item.get("decision", {}).get("S", ""),
        }

complete_ai = [
    prediction_id for prediction_id, value in seen.items()
    if value["source"] == "AI_ENGINE"
    and value["evidence"] == "complete_window"
    and value["ai_status"] == "200"
]
print(json.dumps({
    "found": len(seen),
    "complete_ai": len(complete_ai),
    "records": seen,
}, separators=(",", ":")))
PY
)"
  printf '%s\n' "${result}" >"${ARTIFACT_DIR}/summary.json"

  found="$(python -c 'import json,sys; print(json.loads(sys.argv[1])["found"])' "${result}")"
  complete_ai="$(python -c 'import json,sys; print(json.loads(sys.argv[1])["complete_ai"])' "${result}")"
  if [[ "${found}" == "3" ]]; then
    if [[ "${complete_ai}" == "3" ]]; then
      echo "Lab passed: all three services produced AI_ENGINE + complete_window + HTTP 200."
      exit 0
    fi
    echo "All jobs were audited, but not all produced complete AI evidence." >&2
    echo "Observed records are in ${ARTIFACT_DIR}/summary.json" >&2
    exit 1
  fi

  sleep 15
done

echo "Lab timed out before all three audit records appeared." >&2
echo "Latest query is in ${ARTIFACT_DIR}/audit-query.json" >&2
exit 1
