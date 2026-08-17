# Disposable Lab Deployment Runbook

**Purpose:** deploy TF4 Foresight Lens from an empty project footprint, generate continuous demo telemetry, verify both fallback and AI decision paths, run the local SRE dashboard, collect evidence, and tear everything down in the correct order.

**Last validated:** 2026-08-17, AWS account `193229476041`, region `us-east-1`, fork `pho-veteran/fintech-observability-engine`.

> This is the operational source of truth for the disposable internship lab. Architecture rationale remains in [`08_adrs.md`](08_adrs.md); evidence boundaries remain in [`../tests/README.md`](../tests/README.md). Do not present a 30-minute lab window as a newly executed 120-minute production test.

---

## 1. What this runbook creates

The deployment has four lifecycle boundaries:

| Boundary | Terraform root / runtime | State | Teardown order |
|---|---|---|---:|
| Bootstrap | `infra/bootstrap` | local bootstrap state | 3 (last) |
| Main platform | `infra/terraform` | `tf4-cdo04/sandbox/terraform.tfstate` | 2 |
| Load generator | `infra/load-generator` | `tf4-cdo04/load-generator/sandbox/terraform.tfstate` | 1 (first) |
| SRE dashboard | Docker backend + local Vite frontend | local only | before AWS teardown |

The main platform includes API Gateway with `AWS_IAM`, an internal ALB, ECS Fargate services, ADOT remote write to AMP, Scheduler → SQS orchestration, DynamoDB audit records, SNS/CloudWatch evidence, and the cost breaker.

The load generator is intentionally separate. It creates one `t3.micro` in its own VPC and emits 21 requests per minute: seven metrics for each of `ledger`, `payment-gw`, and `fraud-detector`. It has no route or peering to the main VPC and invokes only the public API Gateway ingest route.

### Lab profile

`infra/terraform/lab.tfvars.example` applies these disposable overrides:

- 30-minute prediction lookback;
- one AI Engine task;
- ACM disabled;
- SNS email `vinhnt.23it@vku.udn.vn`;
- S3 evidence `force_destroy=true`;
- ECR `force_delete=true`.

Production/design defaults remain a 120-minute lookback and two AI tasks.

---

## 2. Prerequisites

Install and verify:

- AWS CLI v2 with the local `default` profile;
- Terraform `>= 1.10`;
- Git and GitHub CLI (`gh`);
- Docker Desktop / Docker Engine;
- Bash, `curl`, Python 3, Node.js, and npm;
- an account with permission to create the project resources;
- admin access to the deployment fork on GitHub.

The deployment workflow builds and scans images in GitHub Actions, so local k6 and local Docker image builds are not required for the normal path.

Set the reusable shell variables:

```bash
export AWS_PROFILE=default
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export PROJECT_NAME=tf4-cdo04
export DEPLOY_REPO=pho-veteran/fintech-observability-engine
export TF_ENVIRONMENT=sandbox
```

Verify the target before creating anything:

```bash
aws sts get-caller-identity
aws configure get region
gh auth status
gh repo view "${DEPLOY_REPO}" --json nameWithOwner,defaultBranchRef
```

Expected account and region for the validated lab:

```text
AWS account: 193229476041
AWS region:  us-east-1
```

Stop if either differs unintentionally.

### Repository setup

Clone the fork or add it as a remote:

```bash
git remote -v
git remote add fork https://github.com/pho-veteran/fintech-observability-engine.git 2>/dev/null || true
git fetch fork
```

The upstream repository currently protects `main` with a no-bypass ruleset. Deployment therefore runs from the `pho-veteran` fork. GitHub repository variables and Actions settings do **not** inherit when a fork is created.

---

## 3. Preflight gates

Run these before the first AWS mutation:

```bash
terraform fmt -check -recursive infra

terraform -chdir=infra/bootstrap init -backend=false
terraform -chdir=infra/bootstrap validate

terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate

terraform -chdir=infra/load-generator init -backend=false
terraform -chdir=infra/load-generator validate

bash -n infra/load-generator/files/run-k6.sh
bash -n infra/load-generator/templates/user_data.sh.tftpl
node --check tests/k6/continuous_demo_ingest.js

PYTHONPATH=src/ai_engine:src pytest -q
```

No Terraform command above creates resources.

---

## 4. Bootstrap state and GitHub OIDC

`infra/bootstrap` uses local Terraform state because it creates the remote state bucket itself. Keep that local state until final teardown.

The legacy IAM user `tin` is opt-in and defaults to disabled. The disposable lab must keep:

```hcl
create_tin_user = false
```

Initialize and review bootstrap:

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap fmt -check -recursive
terraform -chdir=infra/bootstrap validate
terraform -chdir=infra/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=infra/bootstrap show -no-color bootstrap.tfplan
```

Expected bootstrap scope:

- one versioned, AES256-encrypted S3 state bucket;
- public access block and TLS-only bucket policy;
- GitHub Actions OIDC provider;
- `tf4-cdo04-github-deploy-role` and its inline policy;
- no DynamoDB lock table;
- no static AWS key;
- no `tin` IAM user.

Apply only after reviewing the plan:

```bash
terraform -chdir=infra/bootstrap apply bootstrap.tfplan

export TF_STATE_BUCKET="$(terraform -chdir=infra/bootstrap output -raw state_bucket_name)"
export GITHUB_DEPLOY_ROLE="$(terraform -chdir=infra/bootstrap output -raw github_deploy_role_arn)"

printf 'State bucket: %s\nDeploy role:  %s\n' \
  "${TF_STATE_BUCKET}" "${GITHUB_DEPLOY_ROLE}"
```

The bucket name has a generated suffix; never copy an old bucket name from a previous run.

### Configure the fork

Enable Actions explicitly. New forks can report zero registered workflows until Actions is enabled once:

```bash
gh api --method PUT \
  "repos/${DEPLOY_REPO}/actions/permissions" \
  -F enabled=true \
  -f allowed_actions=all

gh variable set AWS_ACCOUNT_ID --repo "${DEPLOY_REPO}" --body "${AWS_ACCOUNT_ID}"
gh variable set AWS_REGION     --repo "${DEPLOY_REPO}" --body "${AWS_REGION}"
gh variable set TF_STATE_BUCKET --repo "${DEPLOY_REPO}" --body "${TF_STATE_BUCKET}"

gh variable list --repo "${DEPLOY_REPO}"
gh api "repos/${DEPLOY_REPO}/actions/workflows" --jq '.workflows[] | [.name,.state,.path]'
```

Do not add long-lived AWS credentials as GitHub secrets. The workflow uses short-lived OIDC credentials.

### OIDC trust note

This GitHub environment can emit an enterprise-style subject such as:

```text
repo:pho-veteran@<owner-id>/fintech-observability-engine@<repo-id>:ref:refs/heads/main
```

The checked-in trust policy accepts both plain and enterprise-style subjects for the upstream and fork owners. If the fork owner or repository name changes, update `github_owner`, `github_additional_owners`, or `github_repo` before bootstrap.

Verify the live role trust without printing an OIDC token:

```bash
aws iam get-role \
  --role-name tf4-cdo04-github-deploy-role \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition' \
  --output json
```

---

## 5. Initialize the main Terraform state

The main root uses a partial S3 backend and a native S3 lockfile:

```bash
terraform -chdir=infra/terraform init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${PROJECT_NAME}/${TF_ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"

terraform -chdir=infra/terraform validate
```

For this lab, the exact main key is:

```text
tf4-cdo04/sandbox/terraform.tfstate
```

Do not use a `prod` or `staging` key with `lab.tfvars.example`. The workflow is intentionally a sandbox lab workflow.

---

## 6. Create ECR repositories first

The first deployment has a dependency cycle: ECS task definitions need image URIs, but GitHub cannot push images until ECR repositories exist. There is no `enable_services` variable.

Create only the three repositories:

```bash
terraform -chdir=infra/terraform plan \
  -var-file=lab.tfvars.example \
  -target='module.compute.aws_ecr_repository.services["telemetry_api"]' \
  -target='module.compute.aws_ecr_repository.services["prediction_worker"]' \
  -target='module.compute.aws_ecr_repository.services["ai_engine"]' \
  -out=ecr.tfplan

terraform -chdir=infra/terraform show -no-color ecr.tfplan
terraform -chdir=infra/terraform apply ecr.tfplan
```

Expected result: exactly three ECR repositories under `foresight-lens/`.

```bash
aws ecr describe-repositories \
  --repository-names \
    foresight-lens/telemetry_api \
    foresight-lens/prediction_worker \
    foresight-lens/ai_engine \
  --query 'repositories[].repositoryUri' \
  --output text
```

---

## 7. Deploy the main platform through GitHub Actions

The deployment workflow supports manual execution so a dummy commit is not needed:

```bash
gh workflow run deploy.yml --repo "${DEPLOY_REPO}" --ref main

RUN_ID="$(gh run list \
  --repo "${DEPLOY_REPO}" \
  --workflow deploy.yml \
  --branch main \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')"

printf 'Run ID: %s\n' "${RUN_ID}"
gh run watch "${RUN_ID}" --repo "${DEPLOY_REPO}" --exit-status
```

The workflow must complete these stages:

1. Terraform format and validation for all three roots;
2. full Python tests;
3. Gitleaks scan;
4. build three Docker images;
5. Trivy scan for critical vulnerabilities;
6. push immutable `${GITHUB_SHA}` image tags to ECR;
7. Terraform plan and apply with `lab.tfvars.example`;
8. output extraction;
9. post-apply smoke test.

Inspect failures directly:

```bash
gh run view "${RUN_ID}" --repo "${DEPLOY_REPO}" --log-failed
```

### Expected smoke evidence

The smoke test should report:

```text
GET  /health                   -> 200
unsigned POST /v1/ingest       -> 403
signed   POST /v1/ingest       -> 201 or 202
public GET /metrics            -> 404
unsigned POST /v1/predict      -> 403
signed   POST /v1/predict      -> 200
all three ECS services         -> 1/1 ACTIVE
prediction queue and DLQ       -> readable
recent ADOT exporter errors    -> 0
```

The public endpoint is API Gateway. Do not use the internal ALB as the external ingest endpoint.

### Manual SNS step

AWS sends a subscription confirmation email to the configured `alert_email`. Open the message and click **Confirm subscription**. Until then, Terraform and SNS show `PendingConfirmation`, and alarm/budget email delivery is not proven.

Check status:

```bash
aws sns list-subscriptions \
  --query 'Subscriptions[?Endpoint==`vinhnt.23it@vku.udn.vn`].[Protocol,Endpoint,SubscriptionArn]' \
  --output table
```

---

## 8. Refresh local Terraform and capture outputs

Reinitialize the local root against the same state if needed:

```bash
terraform -chdir=infra/terraform init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${PROJECT_NAME}/${TF_ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"

terraform -chdir=infra/terraform output
```

Useful outputs:

```bash
export API_GATEWAY_BASE_URL="$(terraform -chdir=infra/terraform output -raw api_gateway_base_url)"
export ECS_CLUSTER_NAME="$(terraform -chdir=infra/terraform output -raw ecs_cluster_name)"
export TELEMETRY_API_SERVICE_NAME="$(terraform -chdir=infra/terraform output -raw telemetry_api_service_name)"
export PREDICTION_WORKER_SERVICE_NAME="$(terraform -chdir=infra/terraform output -raw prediction_worker_service_name)"
export AI_ENGINE_SERVICE_NAME="$(terraform -chdir=infra/terraform output -raw ai_engine_service_name)"
export PREDICTION_QUEUE_URL="$(terraform -chdir=infra/terraform output -raw prediction_queue_url)"
export PREDICTION_QUEUE_DLQ_URL="$(terraform -chdir=infra/terraform output -raw prediction_queue_dlq_url)"
export AMP_QUERY_ENDPOINT="$(terraform -chdir=infra/terraform output -raw amp_query_endpoint)"
export DYNAMODB_AUDIT_TABLE="$(terraform -chdir=infra/terraform output -raw audit_table_name)"
```

The raw `terraform output -json` includes the sensitive generated tenant token. Do not write it to the dashboard cache. Create a sanitized cache:

```bash
terraform -chdir=infra/terraform output -json | python -c '
import json, sys
from pathlib import Path
outputs = json.load(sys.stdin)
outputs.pop("tenant_ingest_token", None)
Path("src/sre_dashboard/terraform-output.json").write_text(
    json.dumps(outputs, indent=2), encoding="utf-8"
)
print(f"wrote {len(outputs)} non-secret outputs")
'

git check-ignore -v src/sre_dashboard/terraform-output.json
```

Expected: the cache is ignored by Git and does not contain `tenant_ingest_token`.

---

## 9. Deploy the isolated load generator

Create a git-ignored variable file from non-secret main outputs:

```bash
cat > infra/load-generator/terraform.tfvars <<EOF
aws_region                   = "${AWS_REGION}"
aws_profile                  = "default"
environment                  = "sandbox"
instance_type                = "t3.micro"
tenant_id                    = "demo-tenant-001"
target_api_base_url          = "$(terraform -chdir=infra/terraform output -raw api_gateway_base_url)"
target_api_execution_arn     = "$(terraform -chdir=infra/terraform output -raw ai_api_gateway_execution_arn)"
tenant_token_secret_arn      = "$(terraform -chdir=infra/terraform output -raw tenant_ingest_token_secret_arn)"
tenant_token_kms_key_arn     = "$(terraform -chdir=infra/terraform output -raw kms_key_arn)"
EOF

git check-ignore -v infra/load-generator/terraform.tfvars
```

The raw token is never copied into this root. The EC2 role reads the one allowed secret at runtime.

Initialize the separate state:

```bash
terraform -chdir=infra/load-generator init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${PROJECT_NAME}/load-generator/${TF_ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"

terraform -chdir=infra/load-generator validate
terraform -chdir=infra/load-generator plan \
  -var-file=terraform.tfvars \
  -out=generator.tfplan
terraform -chdir=infra/load-generator show -no-color generator.tfplan
```

Expected plan: 12 resources, including one VPC, subnet, IGW, route table, no-ingress security group, IAM role/profile, log group, and one `t3.micro`.

Reject the plan if it contains any of these:

- NAT Gateway or Elastic IP;
- VPC peering;
- inbound security-group rule;
- SSH key pair;
- route to the main VPC;
- raw token or static AWS credentials.

Apply:

```bash
terraform -chdir=infra/load-generator apply generator.tfplan
export GENERATOR_INSTANCE_ID="$(terraform -chdir=infra/load-generator output -raw instance_id)"
```

### Verify bootstrap and service

Wait for SSM:

```bash
until [[ "$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=${GENERATOR_INSTANCE_ID}" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null)" == "Online" ]]; do
  sleep 15
done
```

Inspect cloud-init, k6, and systemd without SSH:

```bash
COMMAND_ID="$(aws ssm send-command \
  --instance-ids "${GENERATOR_INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cloud-init status --long","k6 version","systemctl is-active foresight-k6.service","systemctl is-enabled foresight-k6.service","systemctl show foresight-k6.service -p NRestarts"]' \
  --query 'Command.CommandId' \
  --output text)"

aws ssm get-command-invocation \
  --command-id "${COMMAND_ID}" \
  --instance-id "${GENERATOR_INSTANCE_ID}" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' \
  --output text
```

Expected:

```text
cloud-init: done
k6: installed
foresight-k6.service: active
foresight-k6.service: enabled
NRestarts=0
```

The generator starts 30-minute k6 chunks and refreshes instance-role credentials and the tenant token between chunks.

---

## 10. Verify continuous telemetry and decision paths

### Confirm the 21 AMP series

After two to five minutes, AMP should contain:

- tenant `demo-tenant-001`;
- services `ledger`, `payment-gw`, `fraud-detector`;
- seven metrics per service.

The dashboard provides the easiest read-only check once it is running. For an AWS-native check, use the AMP query endpoint and SigV4-capable tooling. Expected logical query:

```promql
count by (__name__) ({tenant_id="demo-tenant-001"})
```

Expected metric names, each with three service series:

```text
active_connections
api_latency_ms
cache_hit_rate_pct
cpu_usage_percent
db_connection_pool_pct
memory_usage_percent
queue_depth
```

### Understand the evidence transition

The early records are expected to use the fallback path:

```text
prediction_source=STATIC_THRESHOLD_FALLBACK
evidence_status=partial_window
```

As the window fills, the AI path should appear:

```text
prediction_source=AI_ENGINE
prediction_status=complete
ai_status_code=200
```

A record can use `AI_ENGINE` while `evidence_status` is still `partial_window`. Full lab-window evidence requires:

```text
prediction_source=AI_ENGINE
evidence_status=complete_window
ai_status_code=200
```

Allow at least 30–35 minutes of uninterrupted ingestion before requiring `complete_window`.

Inspect audit combinations:

```bash
aws dynamodb scan \
  --table-name "${DYNAMODB_AUDIT_TABLE}" \
  --query 'Items[].[prediction_source.S,evidence_status.S,prediction_status.S,ai_status_code.N]' \
  --output text | sort | uniq -c
```

Optional one-hour evidence runner against the deployed `AWS_IAM` endpoint:

```bash
# curl signs from environment credentials, so export short-lived credentials from
# the configured profile instead of relying on the script's local-only Bearer mode.
eval "$(aws configure export-credentials --profile "${AWS_PROFILE}" --format env)"
export TENANT_INGEST_TOKEN="$(aws secretsmanager get-secret-value \
  --secret-id "$(terraform -chdir=infra/terraform output -raw tenant_ingest_token_secret_arn)" \
  --query SecretString \
  --output text)"

export API_GATEWAY_BASE_URL
export PREDICTION_QUEUE_URL
export DYNAMODB_AUDIT_TABLE
bash tests/e2e/one_hour_lab.sh

unset TENANT_INGEST_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
```

The script writes evidence under `evidence/lab/<run-id>/` and requires AI Engine,
complete-window, HTTP 200 audit evidence. Its direct SQS messages use unique
correlation IDs; normal five-minute Scheduler jobs continue in parallel and must
be excluded from run-specific queue, latency, and cost claims.

---

## 11. Run the local SRE dashboard

The dashboard is intentionally local-only and read-only.

### Backend in Docker

```bash
cd src/sre_dashboard
docker compose up --build -d

until curl -sf http://127.0.0.1:8001/health >/dev/null; do
  sleep 2
done

curl http://127.0.0.1:8001/health
docker ps --filter name=cdo-sre-dashboard --format '{{.Status}} {{.Ports}}'
cd ../..
```

Expected published port:

```text
127.0.0.1:8001->8001/tcp
```

The container binds `0.0.0.0` internally but Docker publishes it to host loopback only.

### Frontend locally

The current compose file containerizes only the FastAPI backend. Run the Vite frontend locally:

```bash
cd src/sre_dashboard/frontend
npm install --no-audit --no-fund
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The Vite proxy sends `/api` and `/health` to the Docker backend at `127.0.0.1:8001`.

### Dashboard verification

```bash
curl -s http://127.0.0.1:8001/health
curl -s http://127.0.0.1:8001/api/ecs
curl -s http://127.0.0.1:8001/api/queue
curl -s 'http://127.0.0.1:8001/api/tenants'
curl -s 'http://127.0.0.1:8001/api/metrics/ledger?tenant_id=demo-tenant-001'
curl -s 'http://127.0.0.1:8001/api/audits?tenant_id=demo-tenant-001&limit=5'
```

Be precise when parsing API responses:

- audit rows are under `records`;
- single-metric route payload is under `data`;
- all-metrics route payload is under `metrics`.

Immediately after the generator starts, metric arrays can be empty for a few scrape intervals. Recheck after two to five minutes before treating it as a dashboard defect.

---

## 12. Evidence checklist

Capture these before teardown:

- GitHub Actions deploy run URL and successful job list;
- smoke-test log excerpt showing signed/unsigned route behavior;
- ECS services at desired/running `1/1`;
- queue and DLQ depth;
- zero recent ADOT exporter errors;
- 21 AMP service/metric series;
- DynamoDB fallback records from the initial data gap;
- DynamoDB AI Engine records with HTTP 200;
- complete-window AI record after sufficient warm-up;
- SNS subscription status;
- dashboard screenshot.

Do not claim:

- that 50 RPS proves AMP persistence at 50 samples/second;
- that the disposable 30-minute lab is a 120-minute production-window test;
- that a design ceiling was demonstrated unless the corresponding test actually ran.

---

## 13. Troubleshooting from the validated deployment

### GitHub shows no workflows or runs on a new fork

Enable Actions once and verify registration:

```bash
gh api --method PUT \
  "repos/${DEPLOY_REPO}/actions/permissions" \
  -F enabled=true \
  -f allowed_actions=all

gh api "repos/${DEPLOY_REPO}/actions/workflows" --jq '.total_count'
```

### OIDC cannot assume the deploy role

Verify all three inputs:

1. repository variables are non-empty;
2. the role exists;
3. trust accepts both plain and enterprise-style subjects for the fork owner.

```bash
gh variable list --repo "${DEPLOY_REPO}"
aws iam get-role --role-name tf4-cdo04-github-deploy-role
```

Do not print the OIDC token. If claim diagnosis is necessary, decode and display only non-sensitive claims such as `iss`, `aud`, `sub`, `repository`, `ref`, and `environment`, then remove the diagnostic step.

### IAM policy exceeds the 6,144-character managed-policy limit

The deploy policy is intentionally an inline role policy. Do not convert it to a customer-managed `aws_iam_policy` without first reducing its size.

### Initial image push says the repository does not exist

Run the ECR-only targeted apply in section 6. Do not invent an `enable_services` variable.

### Application Auto Scaling asks for `iam:CreateServiceLinkedRole`

The deploy role must allow the service-linked role for:

```text
ecs.application-autoscaling.amazonaws.com
```

The checked-in bootstrap policy includes it.

### `logs:PutRetentionPolicy` is denied

Log-group follow-up calls cannot depend only on a resource-tag condition because a log group can be created before tags are attached. The bootstrap policy has project-prefix-scoped CloudWatch Logs permissions for this reason.

### Evidence bucket returns `BucketAlreadyExists`

S3 names are global. The checked-in evidence bucket name includes the AWS account ID. Do not return to the unsuffixed `${project}-evidence-${environment}` name.

### Generator plan rejects user data over 16 KiB

The vendored signer, wrapper, and k6 scenario exceed the raw EC2 user-data limit after base64 expansion. The instance uses `base64gzip(templatefile(...))`; cloud-init decompresses it automatically. Do not replace it with plain `user_data`.

### Generator cloud-init fails on `curl-minimal`

Amazon Linux 2023 already provides `curl` through `curl-minimal` and includes CA certificates. Installing the full `curl` package conflicts with `curl-minimal` and aborts the bootstrap under `set -e`. The checked-in user data installs only k6.

Inspect a failed instance through SSM:

```bash
aws ssm send-command \
  --instance-ids "${GENERATOR_INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cloud-init status --long","grep -inE \"error|fail|Traceback\" /var/log/cloud-init-output.log | head -30","systemctl status foresight-k6 --no-pager"]'
```

### SNS remains `PendingConfirmation`

Terraform cannot click the email confirmation link. Confirm it manually in the recipient inbox.

---

## 14. Full nuke runbook

This section is destructive. Save evidence first.

### 14.1 Stop local services and disable deployment automation

```bash
cd src/sre_dashboard
docker compose down
cd ../..

# Stop the Vite process separately (Ctrl+C in its terminal).

gh api --method PUT \
  "repos/${DEPLOY_REPO}/actions/permissions" \
  -F enabled=false
```

Disabling Actions prevents a merge or push from recreating the lab while teardown is in progress.

### 14.2 Destroy the load generator first

Use the same backend and `terraform.tfvars` used for apply:

```bash
terraform -chdir=infra/load-generator init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${PROJECT_NAME}/load-generator/${TF_ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"

terraform -chdir=infra/load-generator plan -destroy \
  -var-file=terraform.tfvars \
  -out=generator-destroy.tfplan
terraform -chdir=infra/load-generator show -no-color generator-destroy.tfplan
terraform -chdir=infra/load-generator apply generator-destroy.tfplan

terraform -chdir=infra/load-generator state list
```

Expected final state list: empty.

Verify there is no running/stopped project generator:

```bash
aws ec2 describe-instances \
  --filters \
    'Name=tag:Component,Values=synthetic-load-generator' \
    'Name=instance-state-name,Values=pending,running,stopping,stopped' \
  --query 'Reservations[].Instances[].InstanceId' \
  --output text
```

### 14.3 Destroy the main platform

```bash
terraform -chdir=infra/terraform init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${PROJECT_NAME}/${TF_ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"

terraform -chdir=infra/terraform plan -destroy \
  -var-file=lab.tfvars.example \
  -out=main-destroy.tfplan
terraform -chdir=infra/terraform show -no-color main-destroy.tfplan
terraform -chdir=infra/terraform apply main-destroy.tfplan

terraform -chdir=infra/terraform state list
```

Expected final state list: empty.

Terraform schedules Secrets Manager and KMS deletion rather than removing them immediately. For an explicit irreversible full nuke, purge the now-scheduled project secrets:

```bash
for secret in $(aws secretsmanager list-secrets \
  --include-planned-deletion \
  --query 'SecretList[?starts_with(Name, `tf4-cdo04/`)].ARN' \
  --output text); do
  aws secretsmanager delete-secret \
    --secret-id "${secret}" \
    --force-delete-without-recovery
done
```

Delete the Container Insights log group that ECS can create outside Terraform ownership:

```bash
aws logs delete-log-group \
  --log-group-name /aws/ecs/containerinsights/tf4-cdo04-sandbox-cluster/performance \
  2>/dev/null || true
```

KMS enforces a waiting period. The project key remains `PendingDeletion` for at least seven days; this is an AWS constraint, not a running resource.

### 14.4 Destroy GitHub OIDC and the deploy role

Do this only after both remote states are empty and Actions are disabled:

```bash
terraform -chdir=infra/bootstrap plan -destroy \
  -target='aws_iam_role_policy.github_deploy_policy' \
  -target='aws_iam_role.github_deploy_role' \
  -target='aws_iam_openid_connect_provider.github' \
  -out=bootstrap-identity-destroy.tfplan

terraform -chdir=infra/bootstrap apply bootstrap-identity-destroy.tfplan
```

### 14.5 Back up empty states and delete the state bucket last

Record the bucket name and copy the final empty states outside the repository:

```bash
mkdir -p "${TMPDIR:-/tmp}/tf4-cdo04-final-state-backup"

aws s3 cp \
  "s3://${TF_STATE_BUCKET}/${PROJECT_NAME}/${TF_ENVIRONMENT}/terraform.tfstate" \
  "${TMPDIR:-/tmp}/tf4-cdo04-final-state-backup/main-final.tfstate"

aws s3 cp \
  "s3://${TF_STATE_BUCKET}/${PROJECT_NAME}/load-generator/${TF_ENVIRONMENT}/terraform.tfstate" \
  "${TMPDIR:-/tmp}/tf4-cdo04-final-state-backup/generator-final.tfstate"
```

The state bucket is versioned. Empty **all** versions and delete markers:

```bash
python - <<'PY'
import os
import boto3

bucket = os.environ["TF_STATE_BUCKET"]
s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
count = 0
while True:
    page = s3.list_object_versions(Bucket=bucket)
    objects = [
        {"Key": item["Key"], "VersionId": item["VersionId"]}
        for field in ("Versions", "DeleteMarkers")
        for item in page.get(field, [])
    ]
    if not objects:
        break
    result = s3.delete_objects(
        Bucket=bucket,
        Delete={"Objects": objects, "Quiet": True},
    )
    if result.get("Errors"):
        raise SystemExit(result["Errors"])
    count += len(objects)
print(f"deleted {count} object versions/delete markers")
PY
```

`infra/bootstrap/main.tf` deliberately has `prevent_destroy=true`. Keep that guard in committed code. For a one-time full nuke, use this controlled special case:

1. temporarily change only `prevent_destroy` to `false` locally;
2. plan and confirm that exactly the bucket, its five configurations, and `random_string.bucket_suffix` will be destroyed;
3. apply the saved plan;
4. immediately restore `prevent_destroy=true` before committing any documentation or future deployment change.

```bash
terraform -chdir=infra/bootstrap plan -destroy \
  -out=bootstrap-bucket-destroy.tfplan
terraform -chdir=infra/bootstrap show -no-color bootstrap-bucket-destroy.tfplan
terraform -chdir=infra/bootstrap apply bootstrap-bucket-destroy.tfplan
```

Expected final plan scope: seven resources. Never commit `prevent_destroy=false`.

### 14.6 Final AWS verification

Active project resources should be absent:

```bash
aws ecs list-clusters --query 'clusterArns[?contains(@, `tf4-cdo04`)]' --output text
aws apigatewayv2 get-apis --query 'Items[?contains(Name, `tf4-cdo04`)].ApiId' --output text
aws amp list-workspaces --query 'workspaces[?contains(alias, `tf4-cdo04`)].workspaceId' --output text
aws dynamodb list-tables --query 'TableNames[?contains(@, `tf4-cdo04`)]' --output text
aws sqs list-queues --queue-name-prefix tf4-cdo04 --query QueueUrls --output text
aws s3api list-buckets --query 'Buckets[?starts_with(Name, `tf4-cdo04`)].Name' --output text
aws ecr describe-repositories --query 'repositories[?starts_with(repositoryName, `foresight-lens/`)].repositoryName' --output text 2>/dev/null || true
aws iam list-roles --query 'Roles[?starts_with(RoleName, `tf4-cdo04`)].RoleName' --output text
aws ec2 describe-vpcs --filters 'Name=tag:Project,Values=tf4-cdo04' --query 'Vpcs[].VpcId' --output text
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `tf4-cdo04`)].FunctionName' --output text
```

Normal historical/deferred remnants after a successful nuke:

- terminated EC2 instances can remain queryable for a while;
- deleted NAT Gateways and VPC endpoints can remain in tag search caches;
- deregistered ECS task-definition revisions are historical metadata;
- the KMS key remains `PendingDeletion` until the AWS waiting period ends;
- Resource Groups Tagging API can return stale mappings after deletion.

Use service-native APIs and lifecycle states, not tag-search output alone, to decide whether something is still active or billable.

---

## 15. Fast redeploy checklist

For the next lab, the shortest safe sequence is:

```text
[ ] Verify AWS account/region and GitHub fork
[ ] Run local validation/test gates
[ ] Bootstrap state bucket + OIDC role
[ ] Enable fork Actions and set AWS_ACCOUNT_ID/AWS_REGION/TF_STATE_BUCKET
[ ] Initialize main sandbox backend
[ ] Target-apply three ECR repositories
[ ] Manually run deploy.yml on fork main
[ ] Confirm all workflow jobs and post-apply smoke pass
[ ] Confirm SNS email subscription
[ ] Create sanitized dashboard Terraform cache
[ ] Plan/apply isolated load generator
[ ] Verify SSM, cloud-init, k6 service, and 21 AMP series
[ ] Start Docker backend and Vite frontend
[ ] Wait 30–35 minutes for complete-window AI evidence
[ ] Capture evidence
[ ] Disable Actions
[ ] Destroy generator, then main, then bootstrap
[ ] Verify only KMS PendingDeletion/history remains
```
