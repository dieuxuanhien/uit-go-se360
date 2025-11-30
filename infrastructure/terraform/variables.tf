# Project Configuration
variable "project_name" {
  description = "Project name to be used for resource naming"
  type        = string
  default     = "uit-go"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

# RDS Database Variables
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

variable "db_allocated_storage" {
  description = "Allocated storage for RDS instances (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS autoscaling (GB)"
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = false # Set to true for production
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

# ElastiCache Redis Variables
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis cluster"
  type        = number
  default     = 1 # Set to 2+ for production with replication
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

# ECS Configuration
variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "uit-go-cluster"
}

variable "services" {
  description = "List of microservices"
  type        = list(string)
  default     = ["user-service", "trip-service", "driver-service"]
}

# User Service Configuration
variable "user_service_desired_count" {
  description = "Desired number of user service tasks"
  type        = number
  default     = 2
}

variable "user_service_min_capacity" {
  description = "Minimum number of user service tasks"
  type        = number
  default     = 2
}

variable "user_service_max_capacity" {
  description = "Maximum number of user service tasks"
  type        = number
  default     = 4
}

# Trip Service Configuration
variable "trip_service_desired_count" {
  description = "Desired number of trip service tasks"
  type        = number
  default     = 2
}

variable "trip_service_min_capacity" {
  description = "Minimum number of trip service tasks"
  type        = number
  default     = 2
}

variable "trip_service_max_capacity" {
  description = "Maximum number of trip service tasks"
  type        = number
  default     = 4
}

# Driver Service Configuration
variable "driver_service_desired_count" {
  description = "Desired number of driver service tasks"
  type        = number
  default     = 2
}

variable "driver_service_min_capacity" {
  description = "Minimum number of driver service tasks"
  type        = number
  default     = 2
}

variable "driver_service_max_capacity" {
  description = "Maximum number of driver service tasks"
  type        = number
  default     = 4
}

# CloudWatch Configuration
variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# ALB Configuration
variable "certificate_arn" {
  description = "ARN of SSL certificate for HTTPS (optional)"
  type        = string
  default     = ""
}
