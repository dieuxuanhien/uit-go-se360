output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

output "user_service_target_group_arn" {
  description = "ARN of the user service target group"
  value       = aws_lb_target_group.user_service.arn
}

output "trip_service_target_group_arn" {
  description = "ARN of the trip service target group"
  value       = aws_lb_target_group.trip_service.arn
}

output "driver_service_target_group_arn" {
  description = "ARN of the driver service target group"
  value       = aws_lb_target_group.driver_service.arn
}
