# CDO SRE Dashboard — Local Operational Visibility

Local-only FastAPI backend for CDO capacity-management visibility. Binds to `127.0.0.1:8001`.

## Terraform output cache

Dashboard treats Terraform outputs like runtime config. Generate them yourself, then copy the JSON cache into this directory:

```bash
# Run from the repository root after initializing infra/terraform against the
# deployed state. The raw Terraform JSON includes the sensitive demo token, so
# remove it before writing the dashboard cache.
terraform -chdir=infra/terraform output -json | python -c '
import json, sys
from pathlib import Path
outputs = json.load(sys.stdin)
outputs.pop("tenant_ingest_token", None)
Path("src/sre_dashboard/terraform-output.json").write_text(
    json.dumps(outputs, indent=2), encoding="utf-8"
)
'
```

Expected local file:

```text
tf4-cdo04-repo/src/sre_dashboard/terraform-output.json
```

This file is ignored by git. It can contain environment-specific AWS resource IDs. Do not commit it.

Dashboard reads `terraform-output.json` from `TERRAFORM_OUTPUT_DIR` (default: current directory). Docker Compose mounts only that file, read-only:

```yaml
./terraform-output.json:/app/sre_dashboard/terraform-output.json:ro
```

## Run with Docker Compose

```bash
cd tf4-cdo04-repo/src/sre_dashboard
docker compose up --build
```

## Run with Python

```bash
cd tf4-cdo04-repo/src/sre_dashboard
pip install -r requirements.txt
PYTHONPATH=.. python -m sre_dashboard.main
```

## Prerequisites

- Python 3.10+
- Docker, if using Compose
- AWS credentials/SSO profile available locally (`aws sso login --profile <name>` if needed)
- `terraform-output.json` generated from `infra/terraform`

## Configuration

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `sre-dashboard` | Service name |
| `APP_VERSION` | `0.1.0` | Version |
| `LOG_LEVEL` | `INFO` | Logging level |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8001` | Listen port |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_PROFILE` | _(none)_ | AWS profile name |
| `TERRAFORM_OUTPUT_DIR` | `.` | Directory containing `terraform-output.json` |
| `DYNAMODB_AUDIT_TABLE` | `cdo04-audit-logs` | Fallback audit table name |
| `DYNAMODB_POLICY_TABLE` | `cdo04-service-policies` | Fallback policy table name |

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/profiles` | List available AWS profiles |
| POST | `/api/session` | Login with AWS profile |
| GET | `/api/session` | Current session info |
| DELETE | `/api/session` | Logout |
| POST | `/api/session/refresh` | Refresh session |
| GET | `/api/probes` | AWS permission probes |
| GET | `/api/tenants` | List tenants |
| GET | `/api/services?tenant_id=...` | List services for tenant |
| GET | `/api/overview?tenant_id=...` | Aggregated overview |
| GET | `/api/metrics/{service_id}?tenant_id=...` | All 7 metrics |
| GET | `/api/metrics/{service_id}/{metric_type}?tenant_id=...` | Single metric |
| GET | `/api/audits?tenant_id=...&limit=50&page=0` | Audit logs with page navigation |
| GET | `/api/policies?tenant_id=...` | List policies |
| PUT | `/api/policies/{tenant_id}/{service_name}` | Update policy |
| GET | `/api/alarms` | CloudWatch alarms |
| GET | `/api/queue` | SQS queues |
| GET | `/api/ecs` | ECS services |

## Security

- Binds to `127.0.0.1` only.
- Never returns AWS credentials via API.
- No raw PromQL input endpoint.
- SQS client only calls `GetQueueAttributes`; never `ReceiveMessage`.
- DynamoDB policy updates use conditional writes.
- All probes are read-only.
