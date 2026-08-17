# Terraform Root -- CDO-04 Platform

The root module wires together networking, data, compute, and observability.

## Prerequisites

- Terraform >= 1.10.0 and AWS provider >= 5.80.0.
- AWS CLI credentials available through the local `default` profile, or through GitHub Actions OIDC.
- An existing Terraform state bucket.
- Three immutable application images in the project ECR repositories before the full apply.

## Backend configuration

`backend.tf` deliberately contains only the S3 backend type, encryption, and native lockfile setting. Supply bucket, key, and region at initialization time:

```bash
TF_STATE_BUCKET="<bootstrap-state-bucket>"
AWS_REGION="us-east-1"
TF_ENVIRONMENT="sandbox"

terraform -chdir=infra/terraform init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=tf4-cdo04/${TF_ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}"
```

State keys are isolated by environment:

```text
tf4-cdo04/sandbox/terraform.tfstate
tf4-cdo04/staging/terraform.tfstate
tf4-cdo04/prod/terraform.tfstate
```

Terraform uses the native S3 lockfile (`use_lockfile = true`); DynamoDB locking is not used.

## ECR-first deployment

The ECS task definitions require real image URIs, while the repositories are themselves managed by this root. On a first deployment, create only the repositories, push the images, then run the full plan:

```bash
terraform -chdir=infra/terraform apply \
  -target='module.compute.aws_ecr_repository.services["telemetry_api"]' \
  -target='module.compute.aws_ecr_repository.services["prediction_worker"]' \
  -target='module.compute.aws_ecr_repository.services["ai_engine"]'

# Build, scan, tag, and push the three images with one immutable tag.

terraform -chdir=infra/terraform plan \
  -var="telemetry_api_image_tag=<registry>/foresight-lens/telemetry_api:<tag>" \
  -var="prediction_worker_image_tag=<registry>/foresight-lens/prediction_worker:<tag>" \
  -var="ai_engine_image_tag=<registry>/foresight-lens/ai_engine:<tag>"
```

There is no `enable_services` variable. Do not use an `enable_services=false` two-phase apply.

## Disposable one-hour lab

Production/design defaults remain a 120-minute prediction window and two AI Engine tasks. The lab overrides them without changing the production defaults:

```bash
cp infra/terraform/lab.tfvars.example infra/terraform/lab.tfvars

terraform -chdir=infra/terraform plan \
  -var-file=lab.tfvars \
  -var="telemetry_api_image_tag=<registry>/foresight-lens/telemetry_api:<tag>" \
  -var="prediction_worker_image_tag=<registry>/foresight-lens/prediction_worker:<tag>" \
  -var="ai_engine_image_tag=<registry>/foresight-lens/ai_engine:<tag>"
```

The lab profile uses:

- 30-minute lookback;
- one AI Engine task, with autoscaling still allowed up to four;
- ACM disabled because no custom-domain consumer is wired;
- email notifications to the configured `alert_email` (manual SNS confirmation required);
- opt-in S3 `force_destroy` and ECR `force_delete` for disposable cleanup.

Evidence from this profile proves only a 30-minute demo window. It must not be presented as a newly executed 120-minute production-window test.

## Main variables

| Variable | Default | Notes |
|---|---:|---|
| `project_name` | `tf4-cdo04` | Naming and project tag |
| `environment` | `sandbox` | `sandbox`, `staging`, or `prod` |
| `aws_region` | `us-east-1` | Deployment region |
| `lookback_window_minutes` | `120` | Only `30` (lab) or `120` (production) |
| `ai_engine_desired_count` | `2` | Lab overrides to one |
| `ai_engine_min_capacity` | `2` | Lab overrides to one |
| `ai_engine_max_capacity` | `4` | Autoscaling maximum |
| `enable_acm` | `true` | Lab overrides to false |
| `evidence_force_destroy` | `false` | Lab-only cleanup override |
| `ecr_force_delete` | `false` | Lab-only cleanup override |

## SNS confirmation and teardown

SNS email subscriptions require a manual confirmation click after apply. Terraform cannot confirm them.

Destroy is a separate operation after evidence capture. Use the same backend, image variables, and lab var file that were used for apply:

```bash
terraform -chdir=infra/terraform destroy -var-file=lab.tfvars \
  -var="telemetry_api_image_tag=<registry>/foresight-lens/telemetry_api:<tag>" \
  -var="prediction_worker_image_tag=<registry>/foresight-lens/prediction_worker:<tag>" \
  -var="ai_engine_image_tag=<registry>/foresight-lens/ai_engine:<tag>"
```

Keep the bootstrap state bucket. KMS key deletion remains pending for the configured AWS waiting period.
