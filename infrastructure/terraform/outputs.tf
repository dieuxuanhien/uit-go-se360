output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "database_subnet_ids" {
  description = "List of database subnet IDs"
  value       = module.vpc.database_subnet_ids
}

# RDS Outputs
output "user_db_endpoint" {
  description = "User database endpoint"
  value       = module.rds.user_db_endpoint
}

output "trip_db_endpoint" {
  description = "Trip database endpoint"
  value       = module.rds.trip_db_endpoint
}

# ElastiCache Outputs
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.elasticache.redis_endpoint
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.redis_port
}

# ECR Outputs
output "user_service_repository_url" {
  description = "User service ECR repository URL"
  value       = module.ecr.user_service_repository_url
}

output "trip_service_repository_url" {
  description = "Trip service ECR repository URL"
  value       = module.ecr.trip_service_repository_url
}

output "driver_service_repository_url" {
  description = "Driver service ECR repository URL"
  value       = module.ecr.driver_service_repository_url
}

# ALB Outputs
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = module.alb.alb_zone_id
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = module.alb.alb_arn
}

# ECS Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = module.ecs.cluster_id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "user_service_name" {
  description = "Name of the user service"
  value       = module.ecs.user_service_name
}

output "trip_service_name" {
  description = "Name of the trip service"
  value       = module.ecs.trip_service_name
}

output "driver_service_name" {
  description = "Name of the driver service"
  value       = module.ecs.driver_service_name
}

# Secrets Manager Outputs
output "user_db_secret_arn" {
  description = "ARN of user database secret"
  value       = module.secrets.user_db_secret_arn
  sensitive   = true
}

output "trip_db_secret_arn" {
  description = "ARN of trip database secret"
  value       = module.secrets.trip_db_secret_arn
  sensitive   = true
}

output "jwt_secret_arn" {
  description = "ARN of JWT secret"
  value       = module.secrets.jwt_secret_arn
  sensitive   = true
}

# CloudWatch Outputs
output "user_service_log_group" {
  description = "CloudWatch log group for user service"
  value       = module.cloudwatch.user_service_log_group_name
}

output "trip_service_log_group" {
  description = "CloudWatch log group for trip service"
  value       = module.cloudwatch.trip_service_log_group_name
}

output "driver_service_log_group" {
  description = "CloudWatch log group for driver service"
  value       = module.cloudwatch.driver_service_log_group_name
}

# Summary Output
output "deployment_summary" {
  description = "Summary of key deployment endpoints"
  value = {
    alb_endpoint     = "http://${module.alb.alb_dns_name}"
    user_service     = "http://${module.alb.alb_dns_name}/api/users"
    trip_service     = "http://${module.alb.alb_dns_name}/api/trips"
    driver_service   = "http://${module.alb.alb_dns_name}/api/drivers"
    region          = var.aws_region
    environment     = var.environment
  }
}
