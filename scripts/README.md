# Scripts

Helper scripts for local checks and CI post-deploy smoke tests.

## `post_apply_smoke.sh`

Runs after Terraform apply in CI. It checks:

- API Gateway `/health`
- `POST /v1/ingest`
- unsigned `POST /v1/predict` is denied by IAM auth
- signed `POST /v1/predict` reaches AI Engine when curl SigV4 is available
- ECS service stability
- prediction SQS queue depth
- prediction DLQ depth

Required env vars:

```bash
AWS_REGION=us-east-1
API_GATEWAY_BASE_URL=...
ECS_CLUSTER_NAME=...
TELEMETRY_API_SERVICE_NAME=...
PREDICTION_WORKER_SERVICE_NAME=...
AI_ENGINE_SERVICE_NAME=...
PREDICTION_QUEUE_URL=...
PREDICTION_QUEUE_DLQ_URL=...
```

Local commands use the AWS CLI `default` profile. For curl SigV4, export short-lived/current credentials into the shell without committing them:

```bash
eval "$(aws configure export-credentials --profile default --format env)"
```

Local syntax check:

```bash
bash -n scripts/post_apply_smoke.sh
bash -n tests/e2e/one_hour_lab.sh
```

## Disposable one-hour lab

`tests/e2e/one_hour_lab.sh` continuously seeds all seven metrics for `ledger`, `payment-gw`, and `fraud-detector`, warms AMP for 35 minutes, sends a 30-minute job per service, and polls DynamoDB audit evidence. It writes results under `evidence/lab/<run-id>/`.

Required values can be read from the initialized Terraform root:

```bash
export AWS_REGION=us-east-1
export API_GATEWAY_BASE_URL="$(terraform -chdir=infra/terraform output -raw api_gateway_base_url)"
export PREDICTION_QUEUE_URL="$(terraform -chdir=infra/terraform output -raw prediction_queue_url)"
export DYNAMODB_AUDIT_TABLE="$(terraform -chdir=infra/terraform output -raw audit_table_name)"
export TENANT_INGEST_TOKEN="$(terraform -chdir=infra/terraform output -raw tenant_ingest_token)"
bash tests/e2e/one_hour_lab.sh
```

The disposable lab verifies a 30-minute window only. Production/design defaults and historical E2E scenarios remain 120 minutes.

## Continuous synthetic telemetry

`tests/k6/continuous_demo_ingest.js` is used only by the isolated `infra/load-generator/` EC2 stack. It sends exactly 21 requests per minute: every combination of seven canonical metrics and three demo services. It is separate from `acceptance_ingest.js`, which remains the short load/soak scenario.

The EC2 systemd wrapper refreshes temporary instance-role credentials and the Secrets Manager token every 30 minutes. Never run the continuous scenario with static AWS keys or place the tenant token in Terraform variables, user data, or logs.
