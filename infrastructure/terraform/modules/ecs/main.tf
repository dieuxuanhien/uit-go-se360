# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cluster"
  }
}

# ECS Cluster Capacity Providers
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# User Service Task Definition
resource "aws_ecs_task_definition" "user_service" {
  family                   = "${var.project_name}-${var.environment}-user-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.user_service_config.cpu
  memory                   = var.user_service_config.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "user-service"
      image     = var.user_service_config.image
      essential = true

      portMappings = [
        {
          containerPort = var.user_service_config.port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "LOG_LEVEL"
          value = var.environment == "prod" ? "info" : "debug"
        },
        {
          name  = "USER_SERVICE_PORT"
          value = tostring(var.user_service_config.port)
        },
        {
          name  = "DATABASE_URL"
          value = "postgresql://postgres:PASSWORD@${var.user_db_endpoint}/uitgo_user?schema=public"
        },
        {
          name  = "REDIS_HOST"
          value = var.redis_endpoint
        },
        {
          name  = "REDIS_PORT"
          value = "6379"
        }
      ]

      secrets = [
        {
          name      = "JWT_SECRET"
          valueFrom = "${var.jwt_secret_arn}:secret::"
        },
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.user_db_secret_arn}:password::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.user_service_config.log_group
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.user_service_config.port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-${var.environment}-user-service-task"
    Service = "user-service"
  }
}

# User Service ECS Service
resource "aws_ecs_service" "user_service" {
  name            = "${var.project_name}-${var.environment}-user-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.user_service.arn
  desired_count   = var.user_service_config.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.user_service_config.target_group_arn
    container_name   = "user-service"
    container_port   = var.user_service_config.port
  }

  health_check_grace_period_seconds = 60

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  depends_on = [var.user_service_config.target_group_arn]

  tags = {
    Name    = "${var.project_name}-${var.environment}-user-service"
    Service = "user-service"
  }
}

# Auto Scaling for User Service
resource "aws_appautoscaling_target" "user_service" {
  max_capacity       = var.user_service_config.max_capacity
  min_capacity       = var.user_service_config.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.user_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "user_service_cpu" {
  name               = "${var.project_name}-${var.environment}-user-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.user_service.resource_id
  scalable_dimension = aws_appautoscaling_target.user_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.user_service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "user_service_memory" {
  name               = "${var.project_name}-${var.environment}-user-service-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.user_service.resource_id
  scalable_dimension = aws_appautoscaling_target.user_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.user_service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

# Trip Service Task Definition
resource "aws_ecs_task_definition" "trip_service" {
  family                   = "${var.project_name}-${var.environment}-trip-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.trip_service_config.cpu
  memory                   = var.trip_service_config.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "trip-service"
      image     = var.trip_service_config.image
      essential = true

      portMappings = [
        {
          containerPort = var.trip_service_config.port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "LOG_LEVEL"
          value = var.environment == "prod" ? "info" : "debug"
        },
        {
          name  = "PORT"
          value = tostring(var.trip_service_config.port)
        },
        {
          name  = "DATABASE_URL"
          value = "postgresql://postgres:PASSWORD@${var.trip_db_endpoint}/uitgo_trip?schema=public"
        },
        {
          name  = "DRIVER_SERVICE_URL"
          value = "http://driver-service:3003"
        }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.trip_db_secret_arn}:password::"
        },
        {
          name      = "INTERNAL_API_KEY"
          valueFrom = "${var.internal_api_key_arn}:key::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.trip_service_config.log_group
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.trip_service_config.port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-${var.environment}-trip-service-task"
    Service = "trip-service"
  }
}

# Trip Service ECS Service
resource "aws_ecs_service" "trip_service" {
  name            = "${var.project_name}-${var.environment}-trip-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.trip_service.arn
  desired_count   = var.trip_service_config.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.trip_service_config.target_group_arn
    container_name   = "trip-service"
    container_port   = var.trip_service_config.port
  }

  health_check_grace_period_seconds = 60

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  service_registries {
    registry_arn = aws_service_discovery_service.trip_service.arn
  }

  depends_on = [var.trip_service_config.target_group_arn]

  tags = {
    Name    = "${var.project_name}-${var.environment}-trip-service"
    Service = "trip-service"
  }
}

# Auto Scaling for Trip Service
resource "aws_appautoscaling_target" "trip_service" {
  max_capacity       = var.trip_service_config.max_capacity
  min_capacity       = var.trip_service_config.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.trip_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "trip_service_cpu" {
  name               = "${var.project_name}-${var.environment}-trip-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.trip_service.resource_id
  scalable_dimension = aws_appautoscaling_target.trip_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.trip_service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Driver Service Task Definition
resource "aws_ecs_task_definition" "driver_service" {
  family                   = "${var.project_name}-${var.environment}-driver-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.driver_service_config.cpu
  memory                   = var.driver_service_config.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "driver-service"
      image     = var.driver_service_config.image
      essential = true

      portMappings = [
        {
          containerPort = var.driver_service_config.port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "LOG_LEVEL"
          value = var.environment == "prod" ? "info" : "debug"
        },
        {
          name  = "DRIVER_SERVICE_PORT"
          value = tostring(var.driver_service_config.port)
        },
        {
          name  = "REDIS_HOST"
          value = var.redis_endpoint
        },
        {
          name  = "REDIS_PORT"
          value = "6379"
        }
      ]

      secrets = [
        {
          name      = "JWT_SECRET"
          valueFrom = "${var.jwt_secret_arn}:secret::"
        },
        {
          name      = "INTERNAL_API_KEY"
          valueFrom = "${var.internal_api_key_arn}:key::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.driver_service_config.log_group
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.driver_service_config.port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-${var.environment}-driver-service-task"
    Service = "driver-service"
  }
}

# Driver Service ECS Service
resource "aws_ecs_service" "driver_service" {
  name            = "${var.project_name}-${var.environment}-driver-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.driver_service.arn
  desired_count   = var.driver_service_config.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.driver_service_config.target_group_arn
    container_name   = "driver-service"
    container_port   = var.driver_service_config.port
  }

  health_check_grace_period_seconds = 60

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  service_registries {
    registry_arn = aws_service_discovery_service.driver_service.arn
  }

  depends_on = [var.driver_service_config.target_group_arn]

  tags = {
    Name    = "${var.project_name}-${var.environment}-driver-service"
    Service = "driver-service"
  }
}

# Auto Scaling for Driver Service
resource "aws_appautoscaling_target" "driver_service" {
  max_capacity       = var.driver_service_config.max_capacity
  min_capacity       = var.driver_service_config.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.driver_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "driver_service_cpu" {
  name               = "${var.project_name}-${var.environment}-driver-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.driver_service.resource_id
  scalable_dimension = aws_appautoscaling_target.driver_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.driver_service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Service Discovery Namespace
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${var.project_name}-${var.environment}.local"
  vpc  = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-namespace"
  }
}

# Service Discovery for Trip Service
resource "aws_service_discovery_service" "trip_service" {
  name = "trip-service"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-trip-service-discovery"
  }
}

# Service Discovery for Driver Service
resource "aws_service_discovery_service" "driver_service" {
  name = "driver-service"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-driver-service-discovery"
  }
}

# Data sources
data "aws_region" "current" {}
