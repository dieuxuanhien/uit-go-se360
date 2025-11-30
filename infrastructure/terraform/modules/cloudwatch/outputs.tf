output "user_service_log_group_name" {
  description = "Name of the user service log group"
  value       = aws_cloudwatch_log_group.user_service.name
}

output "trip_service_log_group_name" {
  description = "Name of the trip service log group"
  value       = aws_cloudwatch_log_group.trip_service.name
}

output "driver_service_log_group_name" {
  description = "Name of the driver service log group"
  value       = aws_cloudwatch_log_group.driver_service.name
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}
