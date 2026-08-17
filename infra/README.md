# CDO-04 Infrastructure -- Terraform

This folder contains the full Terraform ownership slice for the CDO-04 platform.

## Implemented scope

| Jira | Scope | Module | Status |
|---|---|---|---|
| CPOA-37 | Terraform S3 backend | `bootstrap/` | done |
| CPOA-38 | GitHub OIDC deploy role | `bootstrap/` | done |
| CPOA-39 | Networking (VPC, subnets, NAT, endpoints) | `modules/networking/` | done |
| CPOA-40 | Security groups (ALB, API, Worker, AI) | `modules/networking/` | done |
| CPOA-41 | ECS Cluster + Service Connect namespace | `modules/compute/` | done |
| CPOA-42 | Data foundation (AMP, SQS/DLQ, DynamoDB, S3) | `modules/data/` | done |
| CPOA-43 | KMS + Secrets Manager + SSM | `modules/data/` | done |
| CPOA-44 | EventBridge Scheduler (prediction jobs) | `modules/data/` | done |
| CPOA-45 | ECS circuit breaker rollback | `modules/compute/` | done |
| CPOA-46 | Telemetry API task definition + service | `modules/compute/` | done |
| CPOA-47 | Prediction Worker task definition + service | `modules/compute/` | done |
| CPOA-48 | AI Engine task definition + service | `modules/compute/` | done |
| CPOA-49 | Service Connect AI route (server discovery) | `modules/compute/` | done |
| CPOA-50 | ECS autoscaling (API / Worker / AI) | `modules/compute/` | done |
| CPOA-51 | AI Engine S3 baseline access | `modules/compute/` | done |
| CPOA-78 | ECR repos, lifecycle policies, ALB | `modules/compute/` | done |
| CPOA-88 | Observability alarms (18 alarms + SNS) | `modules/observability/` | done |
| CPOA-98 | Cost budget, billing alarm, cost dashboard | `modules/observability/` | done |
| CPOA-100 | Cost breaker Lambda (circuit breaker) | `modules/observability/` | done |

## Layout

```text
infra/
├── bootstrap/                  # CPOA-37 backend + CPOA-38 OIDC
└── terraform/
    ├── main.tf                 # wires all modules
    ├── backend.tf              # S3 backend config
    ├── variables.tf
    ├── outputs.tf
    ├── terraform.tfvars.example
    └── modules/
        ├── networking/         # CPOA-39 VPC + CPOA-40 security groups
        ├── data/               # CPOA-42 data + CPOA-43 KMS/SSM + CPOA-44 scheduler
        ├── compute/            # CPOA-41 cluster + CPOA-45/46/47/48/49/50/51/78
        └── observability/      # CPOA-88 alarms + CPOA-98/100 budgets/cost
```

## What this builds

- **HTTP ALB** on port 80 exposing `/v1/ingest` to the Telemetry API. ACM/HTTPS is deferred.
- **Telemetry API** ECS service (Fargate, 1 task, 1 vCPU / 2GB) accepting ingest, writing to AMP and SQS.
- **Prediction Worker** ECS service (Fargate, 1+ tasks) consuming SQS, querying AMP, calling AI Engine via Service Connect, and writing audit records to DynamoDB.
- **AI Engine** ECS service (Fargate, 2 tasks) serving `/v1/predict` on Service Connect with S3 baseline access.
- **ECS Service Connect** for private service-to-service discovery (no ALB needed between Worker and AI).
- **Autoscaling** for Prediction Worker (queue-driven step scale-out/scale-in) and AI Engine (CPU target tracking + latency step). Telemetry API is pinned to 1 task for MVP single-writer AMP consistency.
- **18 CloudWatch alarms** covering CPU, memory, latency, error rate, running task count, SQS queue depth/age, and DLQ visibility.
- **Operational SNS topic** with email subscription for runtime alarm notifications.
- **Budget alert SNS topic** with AWS Budget (50/80/100% thresholds at $200/month), billing alarm ($160 at 80%), cost breaker Lambda, and cost dashboard.

## Authoritative deployment procedure

Use [`../docs/06_deployment_runbook.md`](../docs/06_deployment_runbook.md) for the complete validated path: bootstrap, fork/OIDC setup, ECR-first deployment, CI apply, load generator, dashboard, evidence, troubleshooting, and full teardown. The shorter component notes below are reference material, not a substitute for that ordered runbook.

## Bootstrap

```bash
cd infra/bootstrap
terraform init
terraform fmt -recursive
terraform validate
terraform plan
terraform apply          # creates S3 backend bucket + GitHub OIDC
```

## Main Terraform

Local commands use the AWS CLI `default` profile. Initialize the partial S3 backend with an existing state bucket, then create ECR before the first image push:

```bash
AWS_REGION="us-east-1"
TF_STATE_BUCKET="<bootstrap-state-bucket>"

terraform -chdir=infra/terraform init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=tf4-cdo04/sandbox/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform validate

terraform -chdir=infra/terraform apply \
  -target='module.compute.aws_ecr_repository.services["telemetry_api"]' \
  -target='module.compute.aws_ecr_repository.services["prediction_worker"]' \
  -target='module.compute.aws_ecr_repository.services["ai_engine"]'
```

After building, scanning, and pushing all three images, run the full plan/apply with their immutable ECR URIs. There is no `enable_services` toggle.

Production/design defaults use a 120-minute lookback and two AI Engine tasks. `terraform/lab.tfvars.example` is a disposable profile with a 30-minute lookback, one AI task, ACM disabled, and opt-in S3/ECR forced cleanup. Lab evidence must not be relabeled as a 120-minute production-window test.

The full apply creates the VPC, security groups, data stores, ECS cluster, all three services, ALB, autoscaling, and observability.

## Isolated continuous load generator

`load-generator/` is a separate Terraform root and state. It creates a small EC2 machine in its own VPC and continuously sends 21 synthetic ingest requests per minute through the public API Gateway. It is not part of the main platform modules or VPC and must be destroyed before the main platform. See [`load-generator/README.md`](load-generator/README.md).

## Interaction points

Core outputs:

```
terraform output vpc_id
terraform output private_subnet_ids
terraform output public_subnet_ids
terraform output nat_gateway_id
terraform output s3_endpoint_id
terraform output dynamodb_endpoint_id
terraform output api_gateway_base_url
terraform output alb_zone_id
terraform output alb_listener_arn
terraform output alb_sg_id
```

Compute:

```
terraform output ecs_cluster_name
terraform output service_connect_namespace_name
terraform output telemetry_api_task_definition_arn
terraform output telemetry_api_service_name
terraform output prediction_worker_task_definition_arn
terraform output prediction_worker_service_name
terraform output ai_engine_task_definition_arn
terraform output ai_service_name
```

Data:

```
terraform output amp_workspace_id
terraform output amp_remote_write_endpoint
terraform output amp_query_endpoint
terraform output prediction_queue_url
terraform output prediction_queue_dlq_url
terraform output prediction_queue_name
terraform output prediction_queue_dlq_name
terraform output audit_table_name
terraform output evidence_bucket_name
terraform output eventbridge_scheduler_role_arn
terraform output prediction_schedule_group_name
terraform output prediction_schedule_names
```

Secrets and config:

```
terraform output kms_key_arn
terraform output kms_key_alias
terraform output ssm_ai_service_name_parameter
terraform output ssm_ai_predict_path_parameter
terraform output ssm_lookback_window_parameter
terraform output tenant_ingest_token_secret_arn
terraform output slack_webhook_secret_arn
terraform output ai_sigv4_config_secret_arn
```

Autoscaling policies:

```
terraform output telemetry_api_alb_p99_step_policy_arn
terraform output ai_engine_latency_step_policy_arn
```

Observability:

```
terraform output operational_alerts_topic_arn
```

## Verification commands

Negative-check API Gateway authorization (an unsigned ingest request must return
`403`):

```bash
API_URL=$(terraform output -raw api_gateway_base_url)
curl -s -o /dev/null -w "%{http_code}" "${API_URL}/v1/ingest" \
  -H "X-Tenant-Id: demo-tenant-001"
```

Use `scripts/post_apply_smoke.sh` for the signed success path and full runtime
checks; the unsigned command above does not prove ingestion.

Check ECS service health:

```bash
CLUSTER=$(terraform output -raw ecs_cluster_name)
aws ecs describe-services --cluster "$CLUSTER" \
  --services "tf4-cdo04-sandbox-telemetry-api" \
            "tf4-cdo04-sandbox-prediction-worker" \
            "tf4-cdo04-sandbox-ai-engine" \
  --query "services[*].[serviceName,status,desiredCount,runningCount]"
```

Queue depth and DLQ:

```bash
AWS_REGION="${AWS_REGION:-$(aws configure get region)}"
QUEUE_URL=$(terraform output -raw prediction_queue_url)
aws sqs get-queue-attributes --region "$AWS_REGION" --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

DLQ_URL=$(terraform output -raw prediction_queue_dlq_url)
aws sqs get-queue-attributes --region "$AWS_REGION" --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages
```

## Notes

- Terraform generates and stores the demo tenant ingest token in Secrets Manager. Slack webhook and optional AI SigV4 config secrets remain empty until populated separately.
- The internal ALB listens on HTTP port 80. ACM is managed only when `enable_acm=true`; the disposable lab disables it because no custom-domain consumer is wired.
- ECS task definitions must receive real immutable Telemetry API, Prediction Worker, and AI Engine image URIs before the full apply.
- The cost breaker Lambda scales `ai-engine` and `prediction-worker` to 0 when the monthly budget hits 100%. Telemetry API is intentionally left running.
