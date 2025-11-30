output "cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "user_service_name" {
  description = "Name of the user service"
  value       = aws_ecs_service.user_service.name
}

output "user_service_id" {
  description = "ID of the user service"
  value       = aws_ecs_service.user_service.id
}

output "trip_service_name" {
  description = "Name of the trip service"
  value       = aws_ecs_service.trip_service.name
}

output "trip_service_id" {
  description = "ID of the trip service"
  value       = aws_ecs_service.trip_service.id
}

output "driver_service_name" {
  description = "Name of the driver service"
  value       = aws_ecs_service.driver_service.name
}

output "driver_service_id" {
  description = "ID of the driver service"
  value       = aws_ecs_service.driver_service.id
}

output "service_discovery_namespace_id" {
  description = "ID of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.main.id
}

output "service_discovery_namespace_name" {
  description = "Name of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.main.name
}
