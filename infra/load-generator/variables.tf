variable "aws_region" {
  description = "AWS region for the isolated load generator"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used in resource names and tags"
  type        = string
  default     = "tf4-cdo04"
}

variable "environment" {
  description = "Environment receiving synthetic telemetry"
  type        = string
  default     = "sandbox"
}

variable "aws_profile" {
  description = "Local AWS CLI profile used for code-only planning or manual deployment"
  type        = string
  default     = "default"
}

variable "vpc_cidr" {
  description = "CIDR for the load-generator-only VPC"
  type        = string
  default     = "10.50.0.0/24"
}

variable "public_subnet_cidr" {
  description = "CIDR for the single public subnet"
  type        = string
  default     = "10.50.0.0/27"
}

variable "instance_type" {
  description = "EC2 instance type for k6"
  type        = string
  default     = "t3.micro"
}

variable "target_api_base_url" {
  description = "Public API Gateway base URL from the main platform output"
  type        = string

  validation {
    condition     = can(regex("^https://", var.target_api_base_url))
    error_message = "target_api_base_url must be an HTTPS URL."
  }
}

variable "target_api_execution_arn" {
  description = "API Gateway execution ARN from the main platform output"
  type        = string
}

variable "tenant_token_secret_arn" {
  description = "Secrets Manager ARN containing the demo tenant ingest token"
  type        = string
}

variable "tenant_token_kms_key_arn" {
  description = "KMS key ARN encrypting the tenant token secret"
  type        = string
}

variable "tenant_id" {
  description = "Tenant used for continuous synthetic telemetry"
  type        = string
  default     = "demo-tenant-001"
}

variable "root_volume_size_gib" {
  description = "Encrypted gp3 root volume size"
  type        = number
  default     = 8
}

variable "log_retention_days" {
  description = "CloudWatch log retention for generator status logs"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Additional tags for the isolated generator"
  type        = map(string)
  default     = {}
}
