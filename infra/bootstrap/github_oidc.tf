# -----------------------------------------------------------------------------
# GitHub Actions OIDC Deploy Role
#
# An-owned scope (CPOA-38 / CDO-W12-002):
# - IAM OIDC Provider for token.actions.githubusercontent.com
# - IAM deploy role for GitHub Actions
# - Trust policy scoped to official repo/branches/environments
# -----------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

locals {
  # The lab deploy runs from a fork, so the trust policy must accept the same
  # repository name under more than one owner.
  github_trusted_owners = distinct(concat(
    [var.github_owner],
    var.github_additional_owners
  ))

  github_oidc_subject_suffixes = concat(
    [
      "ref:refs/heads/main",
      "ref:refs/heads/develop",
      "pull_request",
      "environment:sandbox",
      "environment:staging",
      "environment:prod"
    ],
    [
      for branch in var.github_allowed_feature_branches :
      "ref:refs/heads/${branch}"
    ]
  )

  github_oidc_allowed_subjects = flatten([
    for owner in local.github_trusted_owners : [
      for suffix in local.github_oidc_subject_suffixes : [
        "repo:${owner}/${var.github_repo}:${suffix}",
        "repo:${owner}@*/${var.github_repo}@*:${suffix}"
      ]
    ]
  ])
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  # Both GitHub Actions OIDC thumbprints are declared because GitHub rotates
  # its intermediate CA; keeping the pair avoids trust gaps during a rotation.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1b511abead59c6ce207077c0bf0e0043b1382612"
  ]

  tags = merge(var.tags, {
    Name    = "${var.project_name}-github-oidc-provider"
    Purpose = "github-actions-oidc"
  })
}

data "aws_iam_policy_document" "github_oidc_trust" {
  statement {
    sid    = "AllowGitHubActionsAssumeRoleWithOIDC"
    effect = "Allow"
    actions = [
      "sts:AssumeRoleWithWebIdentity",
      "sts:TagSession"
    ]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # GitHub emits enterprise-style subjects (owner@<id>/repo@<id>) in this
      # environment, so both plain and enterprise forms are trusted, but only
      # for the explicitly approved refs and environments.
      values = local.github_oidc_allowed_subjects
    }
  }
}

resource "aws_iam_role" "github_deploy_role" {
  name               = "${var.project_name}-github-deploy-role"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_trust.json
  description        = "GitHub Actions OIDC deploy role for ${var.project_name} Terraform plan/apply"

  tags = merge(var.tags, {
    Name    = "${var.project_name}-github-deploy-role"
    Purpose = "terraform-deploy"
  })
}