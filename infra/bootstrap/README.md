# Bootstrap -- CDO-04 Terraform Foundation

Bootstrap creates the S3 remote-state bucket and the GitHub Actions OIDC deploy role. It does not create a DynamoDB lock table, static GitHub AWS keys, or an AdministratorAccess role.

Created resources:

- versioned, AES256-encrypted S3 state bucket with public access blocked and TLS-only access;
- native Terraform S3 lockfile support (`use_lockfile = true`);
- OIDC provider for `token.actions.githubusercontent.com`;
- `tf4-cdo04-github-deploy-role` with project-scoped permissions.

## Local bootstrap

Local commands use the AWS CLI `default` profile unless `AWS_PROFILE` is set explicitly:

```bash
aws sts get-caller-identity
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap fmt -check -recursive
terraform -chdir=infra/bootstrap validate
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply
```

Bootstrap is normally a one-time operation. Do not rerun it just to deploy the disposable lab when a state bucket already exists outside the current bootstrap state.

## GitHub OIDC trust

The default repository trust is:

- `repo:dragoncoil2609/fintech-observability-engine:ref:refs/heads/main`
- `repo:dragoncoil2609/fintech-observability-engine:ref:refs/heads/develop`
- `repo:dragoncoil2609/fintech-observability-engine:environment:staging`
- `repo:dragoncoil2609/fintech-observability-engine:environment:prod`
- temporary branches listed in `github_allowed_feature_branches`

Configure these GitHub repository variables before enabling the workflows:

| Variable | Example | Purpose |
|---|---|---|
| `AWS_ACCOUNT_ID` | output of `aws sts get-caller-identity --query Account --output text` | Builds the deploy-role ARN and ECR registry URI |
| `AWS_REGION` | `us-east-1` | AWS and Terraform backend region |
| `TF_STATE_BUCKET` | bootstrap `state_bucket_name` output | Partial S3 backend configuration |

The checked-in `.github/workflows/oidc-smoke-test.yml` uses those variables. GitHub obtains short-lived credentials through OIDC; do not store long-lived AWS access keys as repository secrets.
