# CloudWatch Log Groups for ECS Services
resource "aws_cloudwatch_log_group" "user_service" {
  name              = "/ecs/${var.project_name}/${var.environment}/user-service"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "${var.project_name}-${var.environment}-user-service-logs"
    Service = "user-service"
  }
}

resource "aws_cloudwatch_log_group" "trip_service" {
  name              = "/ecs/${var.project_name}/${var.environment}/trip-service"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "${var.project_name}-${var.environment}-trip-service-logs"
    Service = "trip-service"
  }
}

resource "aws_cloudwatch_log_group" "driver_service" {
  name              = "/ecs/${var.project_name}/${var.environment}/driver-service"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "${var.project_name}-${var.environment}-driver-service-logs"
    Service = "driver-service"
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", { stat = "Average" }],
            [".", "MemoryUtilization", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "ECS Cluster Metrics"
        }
      }
    ]
  })
}
