# Separate state from the main platform. Initialize with:
# terraform init -reconfigure \
#   -backend-config="bucket=<state-bucket>" \
#   -backend-config="key=tf4-cdo04/load-generator/sandbox/terraform.tfstate" \
#   -backend-config="region=us-east-1"
terraform {
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
