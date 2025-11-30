# ECR Repositories for each service
resource "aws_ecr_repository" "user_service" {
  name                 = "${var.project_name}/${var.environment}/user-service"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-${var.environment}-user-service"
    Service = "user-service"
  }
}

resource "aws_ecr_repository" "trip_service" {
  name                 = "${var.project_name}/${var.environment}/trip-service"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-${var.environment}-trip-service"
    Service = "trip-service"
  }
}

resource "aws_ecr_repository" "driver_service" {
  name                 = "${var.project_name}/${var.environment}/driver-service"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-${var.environment}-driver-service"
    Service = "driver-service"
  }
}

# ECR Lifecycle Policies
resource "aws_ecr_lifecycle_policy" "user_service" {
  repository = aws_ecr_repository.user_service.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "trip_service" {
  repository = aws_ecr_repository.trip_service.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "driver_service" {
  repository = aws_ecr_repository.driver_service.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
