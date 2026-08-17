# -----------------------------------------------------------------------------
# CDO-04 Terraform Backend -- S3 Remote State
#
# IMPORTANT: Terraform backend blocks CANNOT use variable interpolation.
# This is a documented Terraform limitation (backend is evaluated before
# variables are processed).
#
# CI must pass the environment-specific state key during init:
#
#   terraform init -backend-config="key=tf4-cdo04/<env>/terraform.tfstate"
#
# Valid keys:
#   - tf4-cdo04/sandbox/terraform.tfstate
#   - tf4-cdo04/staging/terraform.tfstate
#   - tf4-cdo04/prod/terraform.tfstate
#
# Bucket is supplied at init time from infra/bootstrap output:
#
#   terraform init -reconfigure \
#     -backend-config="bucket=<state-bucket>" \
#     -backend-config="key=tf4-cdo04/sandbox/terraform.tfstate" \
#     -backend-config="region=us-east-1"
#
# State locking uses Terraform >= 1.10 native S3 lockfile. DynamoDB is not used.
# -----------------------------------------------------------------------------

terraform {
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}