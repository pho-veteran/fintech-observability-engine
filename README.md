# TF4 Foresight Lens — SLO Early-Warning Control Plane

Nền tảng cảnh báo sớm rủi ro SLO cho fintech: nhận telemetry của `payment-gw`, `ledger`, và `fraud-detector`; dự đoán capacity drift; đưa ra khuyến nghị có audit, alert và fallback khi AI không sẵn sàng. MVP chạy tại `us-east-1` trên AWS ECS Fargate, Amazon Managed Service for Prometheus (AMP), DynamoDB và SQS, với cost guard `$200/tháng`.

Không phải dashboard mới hay hệ thống auto-remediation. Dashboard chỉ hiển thị evidence; quyết định vận hành vẫn cần SRE phê duyệt.

## Architecture

```text
producer/k6
  -> POST /v1/ingest (API Gateway AWS_IAM/SigV4)
  -> telemetry-api: validate labels + Prometheus gauge
  -> ADOT sidecar (15s scrape) -> AMP
  -> EventBridge Scheduler (5m) -> SQS prediction queue
  -> prediction-worker: query_range 120m -> POST /v1/predict
  -> ai-engine or static-threshold fallback
  -> DynamoDB audit + SNS alert + SRE/CloudWatch dashboards
```

| Component | Responsibility |
|---|---|
| `src/telemetry_api/` | Validates ingest payloads and label policy; exposes metrics for ADOT. |
| `src/prediction_worker/` | Queries AMP, calls AI, applies fallback, writes audit records and alerts. |
| `src/ai_engine/` | Detects drift and returns confidence-gated recommendations. |
| `src/sre_dashboard/` | Local-only, read-only operational view of AMP, DynamoDB, CloudWatch, ECS and SQS. |
| `infra/` | Terraform for networking, data, ECS compute, observability, CI OIDC and budget controls. |
| `src/lambda/cost_breaker.py` | Stops AI Engine and Prediction Worker at 100% budget; telemetry remains available. |

## Repository map

- `docs/`: CDO design documents and internship-report preflight.
- `contracts/`: frozen telemetry, AI API and deployment contracts.
- `infra/`: Terraform bootstrap and platform implementation.
- `src/`: application and integration code.
- `tests/`: unit, contract, E2E and k6 scenario runners.
- `evidence/`: curated logs, reports and evidence indexes.
- `scripts/`: local, deployment and evidence helpers.

## Quick verification

Prerequisites for AWS checks: Terraform, AWS credentials with SigV4 access, and `k6` for load tests. Full inputs are documented in [`tests/README.md`](tests/README.md), [`infra/README.md`](infra/README.md), and [`src/sre_dashboard/README.md`](src/sre_dashboard/README.md).

```bash
export AWS_REGION=us-east-1
export API_GATEWAY_BASE_URL="$(terraform -chdir=infra/terraform output -raw api_gateway_base_url)"
export TENANT_ID=demo-tenant-001
export SERVICE_IDS=ledger,payment-gw,fraud-detector
export TENANT_INGEST_TOKEN="$(terraform -chdir=infra/terraform output -raw tenant_ingest_token)"

# Unit and contract gate
PYTHONPATH=src/ai_engine:src pytest -q

# Post-deploy protected-route and runtime smoke
bash scripts/post_apply_smoke.sh

# 2-minute ingest smoke
k6 run tests/k6/acceptance_ingest.js \
  -e TELEMETRY_API_HOST="$API_GATEWAY_BASE_URL" \
  -e TENANT_ID="$TENANT_ID" \
  -e SERVICE_IDS="$SERVICE_IDS" \
  -e TENANT_INGEST_TOKEN="$TENANT_INGEST_TOKEN" \
  -e RATE=50 -e DURATION=2m -e AWS_REGION="$AWS_REGION"
```

Provisioning starts with `infra/bootstrap/`, then `infra/terraform/`; see [`infra/README.md`](infra/README.md). For a disposable one-hour report demo, use [`infra/terraform/lab.tfvars.example`](infra/terraform/lab.tfvars.example). The continuous 21-request/minute k6 machine is an independent root under [`infra/load-generator/`](infra/load-generator/) and is not deployed by the main workflow. Run the local SRE dashboard with the instructions in [`src/sre_dashboard/README.md`](src/sre_dashboard/README.md).

## Evidence status

**Accepted for capstone demo / mentor review with a documented k6 caveat.** Primary artifacts live in [`evidence/logs/live-testing-20260701-141831/curated/`](evidence/logs/live-testing-20260701-141831/curated/).

| Check | Observed result |
|---|---|
| Unit/contract gate | Last known result: `155 passed, 1 warning`. |
| API Gateway preflight | `/health` 200; unsigned ingest/predict 403; signed ingest 201; signed predict 200; ECS stable. |
| 2-minute, 50 RPS | 5,999 requests, 0 failed, p95 258.94 ms, 2 dropped iterations. |
| 3-hour, 50 RPS | 539,974 requests, p95 256.19 ms, 19 failed (0.0035%), 27 dropped iterations. |
| AI workflow | `AI_ENGINE`, `complete_window`, `ai_status_code=200` audit records for all three canonical services. |

### Evidence boundaries

- The 3-hour run is **not** a strict zero-drop k6 pass; its exit code was 99 because 27 dropped iterations violated the strict threshold.
- 50 RPS proves ingest API headroom, **not** AMP persistence at 50 samples/sec; production-like telemetry uses a Prometheus gauge plus 15-second ADOT scrapes.
- CloudWatch service logs are not pass evidence for the curated live run. Use k6 summaries, ECS/SQS state, AMP responses and DynamoDB audit records.
- Same-day Cost Explorer data does not prove full-month spend. The cost claim is a design estimate and configured Budget/cost-breaker guardrail.

See [`evidence/README.md`](evidence/README.md) and [`docs/07_test_eval_report.md`](docs/07_test_eval_report.md) for evidence, context and caveats.

## CDO documents

- [`docs/01_requirements_analysis.md`](docs/01_requirements_analysis.md)
- [`docs/02_infra_design.md`](docs/02_infra_design.md)
- [`docs/03_security_design.md`](docs/03_security_design.md)
- [`docs/04_deployment_design.md`](docs/04_deployment_design.md)
- [`docs/05_cost_analysis.md`](docs/05_cost_analysis.md)
- [`docs/06_deployment_runbook.md`](docs/06_deployment_runbook.md) — bootstrap-to-nuke disposable lab procedure
- [`docs/07_test_eval_report.md`](docs/07_test_eval_report.md)
- [`docs/08_adrs.md`](docs/08_adrs.md)

## Contracts

- [`contracts/telemetry-contract.md`](contracts/telemetry-contract.md)
- [`contracts/ai-api-contract.md`](contracts/ai-api-contract.md)
- [`contracts/deployment-contract.md`](contracts/deployment-contract.md)

## Internship report

[`internship/internship_report_preflight.md`](internship/internship_report_preflight.md) maps report chapters to verified repository evidence, required screenshots and claims that must not be overstated.
