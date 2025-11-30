variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "services" {
  description = "List of services"
  type        = list(string)
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  type        = string
}

variable "task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the ECS task role"
  type        = string
}

# Service Configurations
variable "user_service_config" {
  description = "User service configuration"
  type = object({
    port             = number
    cpu              = number
    memory           = number
    desired_count    = number
    min_capacity     = number
    max_capacity     = number
    image            = string
    log_group        = string
    target_group_arn = string
  })
}

variable "trip_service_config" {
  description = "Trip service configuration"
  type = object({
    port             = number
    cpu              = number
    memory           = number
    desired_count    = number
    min_capacity     = number
    max_capacity     = number
    image            = string
    log_group        = string
    target_group_arn = string
  })
}

variable "driver_service_config" {
  description = "Driver service configuration"
  type = object({
    port             = number
    cpu              = number
    memory           = number
    desired_count    = number
    min_capacity     = number
    max_capacity     = number
    image            = string
    log_group        = string
    target_group_arn = string
  })
}

# Environment Variables
variable "user_db_endpoint" {
  description = "User database endpoint"
  type        = string
}

variable "trip_db_endpoint" {
  description = "Trip database endpoint"
  type        = string
}

variable "redis_endpoint" {
  description = "Redis endpoint"
  type        = string
}

variable "user_db_secret_arn" {
  description = "ARN of user database secret"
  type        = string
}

variable "trip_db_secret_arn" {
  description = "ARN of trip database secret"
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of JWT secret"
  type        = string
}

variable "internal_api_key_arn" {
  description = "ARN of internal API key secret"
  type        = string
}
