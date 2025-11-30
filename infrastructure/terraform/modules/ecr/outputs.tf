output "user_service_repository_url" {
  description = "URL of the user service ECR repository"
  value       = aws_ecr_repository.user_service.repository_url
}

output "trip_service_repository_url" {
  description = "URL of the trip service ECR repository"
  value       = aws_ecr_repository.trip_service.repository_url
}

output "driver_service_repository_url" {
  description = "URL of the driver service ECR repository"
  value       = aws_ecr_repository.driver_service.repository_url
}

output "user_service_repository_arn" {
  description = "ARN of the user service ECR repository"
  value       = aws_ecr_repository.user_service.arn
}

output "trip_service_repository_arn" {
  description = "ARN of the trip service ECR repository"
  value       = aws_ecr_repository.trip_service.arn
}

output "driver_service_repository_arn" {
  description = "ARN of the driver service ECR repository"
  value       = aws_ecr_repository.driver_service.arn
}
