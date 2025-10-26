# Terraform Variables for UIT-Go Infrastructure

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "uit-go"
}

# ECR Repository variables (Phase 2)
variable "ecr_repository_names" {
  description = "Names of ECR repositories for microservices"
  type        = list(string)
  default     = ["user-service", "trip-service", "driver-service"]
}

# ECS Cluster variables (Phase 2)
variable "ecs_cluster_name" {
  description = "Name of ECS Fargate cluster"
  type        = string
  default     = "uit-go-cluster"
}

# RDS Database variables (Phase 2)
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15.4"
}

# Redis cache variables (Phase 2)
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}
