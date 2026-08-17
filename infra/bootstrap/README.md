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

The legacy developer IAM user `tin` is disabled by default (`create_tin_user=false`) and is not part of the disposable lab. Enable it only for an explicit developer-access requirement.

For the ordered bootstrap-to-nuke procedure, use [`../../docs/06_deployment_runbook.md`](../../docs/06_deployment_runbook.md).

## GitHub OIDC trust

For the upstream owner and every owner in `github_additional_owners`, trust is
limited to these repository contexts in both plain and enterprise-style GitHub
subject formats:

- `ref:refs/heads/main`;
- `ref:refs/heads/develop`;
- `pull_request`;
- `environment:sandbox`;
- `environment:staging`;
- `environment:prod`;
- temporary branches listed in `github_allowed_feature_branches`.

The wildcard portions of enterprise-style subjects match GitHub's immutable
owner/repository IDs; they do not widen the allowed ref or environment suffix.

Configure these GitHub repository variables before enabling the workflows:

| Variable | Example | Purpose |
|---|---|---|
| `AWS_ACCOUNT_ID` | output of `aws sts get-caller-identity --query Account --output text` | Builds the deploy-role ARN and ECR registry URI |
| `AWS_REGION` | `us-east-1` | AWS and Terraform backend region |
| `TF_STATE_BUCKET` | bootstrap `state_bucket_name` output | Partial S3 backend configuration |

The checked-in `.github/workflows/oidc-smoke-test.yml` uses those variables. GitHub obtains short-lived credentials through OIDC; do not store long-lived AWS access keys as repository secrets.
