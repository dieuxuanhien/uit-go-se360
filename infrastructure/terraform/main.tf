terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state management
  # backend "s3" {
  #   bucket         = "uit-go-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "uit-go-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "UIT-Go"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name        = var.project_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
}

# Security Groups Module
module "security_groups" {
  source = "./modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# IAM Module
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  account_id   = data.aws_caller_identity.current.account_id
}

# Secrets Manager Module
module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment
}

# RDS Module
module "rds" {
  source = "./modules/rds"

  project_name           = var.project_name
  environment            = var.environment
  db_instance_class      = var.db_instance_class
  db_engine_version      = var.db_engine_version
  db_allocated_storage   = var.db_allocated_storage
  db_max_allocated_storage = var.db_max_allocated_storage
  multi_az               = var.db_multi_az
  backup_retention_period = var.db_backup_retention_period
  
  vpc_id                 = module.vpc.vpc_id
  database_subnet_ids    = module.vpc.database_subnet_ids
  db_security_group_id   = module.security_groups.rds_security_group_id
  
  user_db_secret_arn     = module.secrets.user_db_secret_arn
  trip_db_secret_arn     = module.secrets.trip_db_secret_arn
}

# ElastiCache Redis Module
module "elasticache" {
  source = "./modules/elasticache"

  project_name         = var.project_name
  environment          = var.environment
  redis_node_type      = var.redis_node_type
  redis_num_cache_nodes = var.redis_num_cache_nodes
  redis_engine_version = var.redis_engine_version
  
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  redis_security_group_id = module.security_groups.redis_security_group_id
}

# ECR Module
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
  services     = var.services
}

# ALB Module
module "alb" {
  source = "./modules/alb"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  alb_security_group_id = module.security_groups.alb_security_group_id
  
  health_check_path   = "/health"
  certificate_arn     = var.certificate_arn # Optional SSL certificate
}

# CloudWatch Logs Module
module "cloudwatch" {
  source = "./modules/cloudwatch"

  project_name        = var.project_name
  environment         = var.environment
  services            = var.services
  log_retention_days  = var.log_retention_days
}

# ECS Cluster Module
module "ecs" {
  source = "./modules/ecs"

  project_name        = var.project_name
  environment         = var.environment
  services            = var.services
  
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  ecs_security_group_id = module.security_groups.ecs_security_group_id
  
  task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn           = module.iam.ecs_task_role_arn
  
  # Service-specific configurations
  user_service_config = {
    port           = 3001
    cpu            = 512
    memory         = 1024
    desired_count  = var.user_service_desired_count
    min_capacity   = var.user_service_min_capacity
    max_capacity   = var.user_service_max_capacity
    image          = "${module.ecr.user_service_repository_url}:latest"
    log_group      = module.cloudwatch.user_service_log_group_name
    target_group_arn = module.alb.user_service_target_group_arn
  }
  
  trip_service_config = {
    port           = 3002
    cpu            = 512
    memory         = 1024
    desired_count  = var.trip_service_desired_count
    min_capacity   = var.trip_service_min_capacity
    max_capacity   = var.trip_service_max_capacity
    image          = "${module.ecr.trip_service_repository_url}:latest"
    log_group      = module.cloudwatch.trip_service_log_group_name
    target_group_arn = module.alb.trip_service_target_group_arn
  }
  
  driver_service_config = {
    port           = 3003
    cpu            = 512
    memory         = 1024
    desired_count  = var.driver_service_desired_count
    min_capacity   = var.driver_service_min_capacity
    max_capacity   = var.driver_service_max_capacity
    image          = "${module.ecr.driver_service_repository_url}:latest"
    log_group      = module.cloudwatch.driver_service_log_group_name
    target_group_arn = module.alb.driver_service_target_group_arn
  }
  
  # Environment variables
  user_db_endpoint    = module.rds.user_db_endpoint
  trip_db_endpoint    = module.rds.trip_db_endpoint
  redis_endpoint      = module.elasticache.redis_endpoint
  user_db_secret_arn  = module.secrets.user_db_secret_arn
  trip_db_secret_arn  = module.secrets.trip_db_secret_arn
  jwt_secret_arn      = module.secrets.jwt_secret_arn
  internal_api_key_arn = module.secrets.internal_api_key_arn
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
