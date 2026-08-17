# Isolated Continuous k6 Generator

This Terraform root creates one continuously running synthetic telemetry machine. It is deliberately outside the main platform:

- separate Terraform root and state key;
- separate VPC, subnet, route table, security group, IAM role, and EC2 lifecycle;
- no peering or route to the main VPC;
- no access to the internal ALB, ECS, AMP, SQS, or DynamoDB;
- only the public API Gateway `POST /v1/ingest` path is invoked.

The generator emits exactly 21 requests per minute: seven metrics for each of `ledger`, `payment-gw`, and `fraud-detector`.

## Cost

Current `us-east-1` unit prices used for the estimate:

- Linux `t3.micro`: `$0.0104/hour`;
- in-use public IPv4: `$0.005/hour`;
- 8 GiB gp3: approximately `$0.64/month`.

Running continuously for 730 hours is approximately `$11.88/month` before API Gateway requests, logs, and data transfer. The main platform cost breaker does not stop this instance.

## Prerequisites

Deploy the main platform first. Then export only these non-secret values:

```bash
terraform -chdir=infra/terraform output -raw api_gateway_base_url
terraform -chdir=infra/terraform output -raw ai_api_gateway_execution_arn
terraform -chdir=infra/terraform output -raw tenant_ingest_token_secret_arn
terraform -chdir=infra/terraform output -raw kms_key_arn
```

Do not copy `tenant_ingest_token` into this stack. The EC2 instance role retrieves the token directly from Secrets Manager at runtime.

## Initialize and plan

Local commands use the AWS CLI `default` profile:

```bash
cp infra/load-generator/terraform.tfvars.example infra/load-generator/terraform.tfvars
# Fill the four main-platform output values.

TF_STATE_BUCKET="$(terraform -chdir=infra/bootstrap output -raw state_bucket_name)"
terraform -chdir=infra/load-generator init -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=tf4-cdo04/load-generator/sandbox/terraform.tfstate" \
  -backend-config="region=us-east-1"
terraform -chdir=infra/load-generator fmt -check -recursive
terraform -chdir=infra/load-generator validate
terraform -chdir=infra/load-generator plan -var-file=terraform.tfvars
```

The load generator is not part of the main CI deployment workflow. Review and apply it separately after the main platform passes smoke tests. The complete validated procedure and strict teardown order are in [`../../docs/06_deployment_runbook.md`](../../docs/06_deployment_runbook.md).

## Operations

```bash
INSTANCE_ID="$(terraform -chdir=infra/load-generator output -raw instance_id)"

aws ssm describe-instance-information \
  --region us-east-1 \
  --filters "Key=InstanceIds,Values=${INSTANCE_ID}"

aws ssm start-session --region us-east-1 --target "${INSTANCE_ID}"

aws ssm send-command \
  --region us-east-1 \
  --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters commands='systemctl status foresight-k6 --no-pager'
```

On the machine:

```bash
sudo systemctl status foresight-k6
sudo systemctl restart foresight-k6
sudo systemctl stop foresight-k6
sudo journalctl -u foresight-k6 --since '30 minutes ago'
```

The systemd service runs 30-minute k6 chunks. Every chunk refreshes temporary instance-role credentials and the tenant token. If `/health` is unavailable, the wrapper backs off and resumes automatically when the main API returns.

## Teardown order

The generator has no fixed TTL because it should run while the main demo infrastructure exists. Teardown order is mandatory:

1. stop/destroy this root;
2. verify the EC2 instance, public IPv4, EBS volume, VPC, and IAM role are gone;
3. only then destroy the main platform.

```bash
terraform -chdir=infra/load-generator destroy -var-file=terraform.tfvars
```

Generator destroy and main-platform destroy are separate destructive actions and each requires confirmation. Stopping EC2 is only an emergency measure; EBS and other resources continue to exist until Terraform destroy.
