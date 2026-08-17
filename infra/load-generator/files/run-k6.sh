#!/usr/bin/env bash
set -euo pipefail

readonly CONFIG_FILE="/etc/foresight-load-generator/config"
readonly K6_SCRIPT="/opt/foresight-load-generator/continuous_demo_ingest.js"
readonly CHUNK_DURATION="30m"
readonly HEALTH_BACKOFF_SECONDS=60
credentials_file=""
tenant_token=""
access_key_id=""
secret_access_key=""
session_token=""
cleanup() {
  if [[ -n "${credentials_file}" ]]; then
    rm -f "${credentials_file}"
  fi
  unset tenant_token access_key_id secret_access_key session_token
}
trap cleanup EXIT

if [[ ! -r "${CONFIG_FILE}" ]]; then
  echo "Generator config is missing: ${CONFIG_FILE}" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${CONFIG_FILE}"

for required in AWS_REGION API_BASE_URL TENANT_ID TENANT_TOKEN_SECRET_ARN LOG_GROUP_NAME; do
  if [[ -z "${!required:-}" ]]; then
    echo "Missing generator config: ${required}" >&2
    exit 1
  fi
done

publish_status() {
  local message="$1"
  local timestamp
  timestamp="$(date +%s%3N)"
  aws logs put-log-events \
    --region "${AWS_REGION}" \
    --log-group-name "${LOG_GROUP_NAME}" \
    --log-stream-name "${HOSTNAME}" \
    --log-events "timestamp=${timestamp},message=${message}" \
    >/dev/null 2>&1 || true
}

ensure_log_stream() {
  aws logs create-log-stream \
    --region "${AWS_REGION}" \
    --log-group-name "${LOG_GROUP_NAME}" \
    --log-stream-name "${HOSTNAME}" \
    >/dev/null 2>&1 || true
}

ensure_log_stream
publish_status "foresight-k6 wrapper started"

while true; do
  if ! curl --fail --silent --show-error --max-time 10 "${API_BASE_URL}/health" >/dev/null; then
    publish_status "main API unavailable; backing off ${HEALTH_BACKOFF_SECONDS}s"
    sleep "${HEALTH_BACKOFF_SECONDS}"
    continue
  fi

  if ! tenant_token="$(aws secretsmanager get-secret-value \
    --region "${AWS_REGION}" \
    --secret-id "${TENANT_TOKEN_SECRET_ARN}" \
    --query SecretString \
    --output text)"; then
    publish_status "could not refresh tenant token"
    sleep 30
    continue
  fi

  credentials_file="$(mktemp)"
  if ! python3 - "${credentials_file}" <<'PY'
import json
import os
import sys
import urllib.request

output_path = sys.argv[1]
token_request = urllib.request.Request(
    "http://169.254.169.254/latest/api/token",
    data=b"",
    method="PUT",
    headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"},
)
with urllib.request.urlopen(token_request, timeout=5) as response:
    imds_token = response.read().decode("utf-8")

headers = {"X-aws-ec2-metadata-token": imds_token}
role_request = urllib.request.Request(
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    headers=headers,
)
with urllib.request.urlopen(role_request, timeout=5) as response:
    role_name = response.read().decode("utf-8").strip()

credentials_request = urllib.request.Request(
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
    + urllib.parse.quote(role_name, safe=""),
    headers=headers,
)
with urllib.request.urlopen(credentials_request, timeout=5) as response:
    credentials = json.load(response)

with open(output_path, "w", encoding="utf-8") as stream:
    json.dump(credentials, stream)
os.chmod(output_path, 0o600)
PY
  then
    rm -f "${credentials_file}"
    credentials_file=""
    unset tenant_token
    publish_status "could not refresh instance-role credentials"
    sleep 30
    continue
  fi
  if ! readarray -t credential_values < <(python3 - "${credentials_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    credentials = json.load(stream)
print(credentials["AccessKeyId"])
print(credentials["SecretAccessKey"])
print(credentials["Token"])
PY
  ); then
    rm -f "${credentials_file}"
    credentials_file=""
    unset tenant_token credential_values
    publish_status "could not parse instance-role credentials"
    sleep 30
    continue
  fi
  rm -f "${credentials_file}"
  credentials_file=""
  access_key_id="${credential_values[0]:-}"
  secret_access_key="${credential_values[1]:-}"
  session_token="${credential_values[2]:-}"
  unset credential_values
  if [[ -z "${access_key_id}" || -z "${secret_access_key}" || -z "${session_token}" ]]; then
    unset tenant_token access_key_id secret_access_key session_token
    publish_status "instance-role credentials were incomplete"
    sleep 30
    continue
  fi

  publish_status "starting 30-minute k6 telemetry chunk"
  if env \
    AWS_REGION="${AWS_REGION}" \
    AWS_ACCESS_KEY_ID="${access_key_id}" \
    AWS_SECRET_ACCESS_KEY="${secret_access_key}" \
    AWS_SESSION_TOKEN="${session_token}" \
    TENANT_INGEST_TOKEN="${tenant_token}" \
    TENANT_ID="${TENANT_ID}" \
    TELEMETRY_API_HOST="${API_BASE_URL}" \
    DURATION="${CHUNK_DURATION}" \
    k6 run --quiet "${K6_SCRIPT}"; then
    publish_status "k6 telemetry chunk completed"
  else
    status=$?
    publish_status "k6 telemetry chunk failed with exit code ${status}"
    sleep 15
  fi

  unset tenant_token access_key_id secret_access_key session_token
  sleep 2
done
