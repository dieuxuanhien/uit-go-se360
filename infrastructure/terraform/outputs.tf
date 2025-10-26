# Terraform Outputs for UIT-Go Infrastructure

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

# Note: Additional outputs will be added in Phase 2
# - ECR repository URLs
# - ECS cluster ARN
# - RDS endpoint
# - Redis endpoint
# - Load balancer URL
# - CloudFront distribution URL
