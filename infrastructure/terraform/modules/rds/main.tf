# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = var.database_subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
  }
}

# Get database credentials from Secrets Manager
data "aws_secretsmanager_secret_version" "user_db" {
  secret_id = var.user_db_secret_arn
}

data "aws_secretsmanager_secret_version" "trip_db" {
  secret_id = var.trip_db_secret_arn
}

locals {
  user_db_creds = jsondecode(data.aws_secretsmanager_secret_version.user_db.secret_string)
  trip_db_creds = jsondecode(data.aws_secretsmanager_secret_version.trip_db.secret_string)
}

# User Service RDS Instance
resource "aws_db_instance" "user_db" {
  identifier     = "${var.project_name}-${var.environment}-user-db"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = local.user_db_creds.dbname
  username = local.user_db_creds.username
  password = local.user_db_creds.password
  port     = 5432

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]
  publicly_accessible    = false

  backup_retention_period = var.backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  performance_insights_retention_period = 7

  skip_final_snapshot       = true # Set to false in production
  final_snapshot_identifier = "${var.project_name}-${var.environment}-user-db-final-snapshot"
  deletion_protection       = false # Set to true in production

  tags = {
    Name    = "${var.project_name}-${var.environment}-user-db"
    Service = "user-service"
  }
}

# Trip Service RDS Instance
resource "aws_db_instance" "trip_db" {
  identifier     = "${var.project_name}-${var.environment}-trip-db"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = local.trip_db_creds.dbname
  username = local.trip_db_creds.username
  password = local.trip_db_creds.password
  port     = 5432

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]
  publicly_accessible    = false

  backup_retention_period = var.backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  performance_insights_retention_period = 7

  skip_final_snapshot       = true # Set to false in production
  final_snapshot_identifier = "${var.project_name}-${var.environment}-trip-db-final-snapshot"
  deletion_protection       = false # Set to true in production

  tags = {
    Name    = "${var.project_name}-${var.environment}-trip-db"
    Service = "trip-service"
  }
}
