provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = merge({
      Project     = var.project_name
      Environment = var.environment
      Component   = "synthetic-load-generator"
      ManagedBy   = "terraform"
      CostCenter  = "demo"
    }, var.tags)
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

locals {
  name = "${var.project_name}-${var.environment}-load-generator"

  common_tags = merge({
    Project     = var.project_name
    Environment = var.environment
    Component   = "synthetic-load-generator"
    ManagedBy   = "terraform"
    CostCenter  = "demo"
  }, var.tags)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-vpc"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name}-igw"
  })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-public"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-public"
  })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "generator" {
  name        = "${local.name}-sg"
  description = "Outbound HTTPS only for the isolated synthetic load generator"
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name}-sg"
  })
}

# The isolated public-subnet generator requires HTTPS to API Gateway, regional
# AWS APIs, SSM channels, and Grafana's package repository. These hostnames
# resolve to changing public IP ranges, so a stable CIDR allowlist is not
# available without adding NAT/proxy infrastructure to this disposable lab.
resource "aws_vpc_security_group_egress_rule" "https" { #trivy:ignore:AVD-AWS-0104
  security_group_id = aws_security_group.generator.id
  description       = "Allow HTTPS to API Gateway, Secrets Manager, SSM, and package repositories"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  ip_protocol       = "tcp"
  to_port           = 443
}

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "generator" {
  name               = "${local.name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "runtime" {
  # SSM managed-instance channel APIs do not support resource-level scoping.
  statement {
    sid    = "AllowSSMManagedInstance"
    effect = "Allow"
    actions = [
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel"
    ]
    resources = ["*"]
  }

  statement {
    sid       = "InvokeIngestRouteOnly"
    effect    = "Allow"
    actions   = ["execute-api:Invoke"]
    resources = ["${var.target_api_execution_arn}/*/POST/v1/ingest"]
  }

  statement {
    sid       = "ReadTenantTokenOnly"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.tenant_token_secret_arn]
  }

  statement {
    sid       = "DecryptTenantTokenViaSecretsManager"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [var.tenant_token_kms_key_arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }

  statement {
    sid    = "WriteGeneratorLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.generator.arn}:*"]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "${local.name}-runtime"
  role   = aws_iam_role.generator.id
  policy = data.aws_iam_policy_document.runtime.json
}

resource "aws_iam_instance_profile" "generator" {
  name = "${local.name}-profile"
  role = aws_iam_role.generator.name

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "generator" {
  name              = "/aws/ec2/${local.name}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_instance" "generator" {
  ami                         = data.aws_ssm_parameter.al2023_ami.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.generator.id]
  iam_instance_profile        = aws_iam_instance_profile.generator.name

  # The rendered script embeds three base64 payloads and exceeds the 16 KiB
  # user-data limit, so it ships gzipped; cloud-init decompresses it on boot.
  user_data_base64 = base64gzip(templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region              = var.aws_region
    api_base_url            = trimsuffix(var.target_api_base_url, "/")
    tenant_id               = var.tenant_id
    tenant_token_secret_arn = var.tenant_token_secret_arn
    log_group_name          = aws_cloudwatch_log_group.generator.name
    k6_script_base64        = base64encode(file("${path.root}/../../tests/k6/continuous_demo_ingest.js"))
    run_script_base64       = base64encode(file("${path.module}/files/run-k6.sh"))
    signature_module_base64 = base64encode(file("${path.module}/files/signature.js"))
  }))
  user_data_replace_on_change          = true
  instance_initiated_shutdown_behavior = "stop"

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    encrypted             = true
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gib
    delete_on_termination = true
  }

  tags = merge(local.common_tags, {
    Name     = local.name
    AutoStop = "false-main-lifecycle-bound"
  })

  depends_on = [
    aws_route_table_association.public,
    aws_iam_role_policy.runtime
  ]
}
