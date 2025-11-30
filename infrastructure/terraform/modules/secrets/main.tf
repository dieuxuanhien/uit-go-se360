# Generate random passwords for databases
resource "random_password" "user_db_password" {
  length  = 32
  special = true
}

resource "random_password" "trip_db_password" {
  length  = 32
  special = true
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "random_password" "internal_api_key" {
  length  = 64
  special = true
}

# User Database Secret
resource "aws_secretsmanager_secret" "user_db" {
  name                    = "${var.project_name}/${var.environment}/user-db"
  description             = "User database credentials"
  recovery_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-${var.environment}-user-db-secret"
    Database    = "user-db"
  }
}

resource "aws_secretsmanager_secret_version" "user_db" {
  secret_id = aws_secretsmanager_secret.user_db.id
  secret_string = jsonencode({
    username = "postgres"
    password = random_password.user_db_password.result
    engine   = "postgres"
    host     = "" # Will be updated after RDS creation
    port     = 5432
    dbname   = "uitgo_user"
  })
}

# Trip Database Secret
resource "aws_secretsmanager_secret" "trip_db" {
  name                    = "${var.project_name}/${var.environment}/trip-db"
  description             = "Trip database credentials"
  recovery_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-${var.environment}-trip-db-secret"
    Database    = "trip-db"
  }
}

resource "aws_secretsmanager_secret_version" "trip_db" {
  secret_id = aws_secretsmanager_secret.trip_db.id
  secret_string = jsonencode({
    username = "postgres"
    password = random_password.trip_db_password.result
    engine   = "postgres"
    host     = "" # Will be updated after RDS creation
    port     = 5432
    dbname   = "uitgo_trip"
  })
}

# JWT Secret
resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${var.project_name}/${var.environment}/jwt-secret"
  description             = "JWT signing secret"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-jwt-secret"
  }
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id = aws_secretsmanager_secret.jwt.id
  secret_string = jsonencode({
    secret = random_password.jwt_secret.result
  })
}

# Internal API Key Secret
resource "aws_secretsmanager_secret" "internal_api_key" {
  name                    = "${var.project_name}/${var.environment}/internal-api-key"
  description             = "Internal API key for service-to-service communication"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-internal-api-key"
  }
}

resource "aws_secretsmanager_secret_version" "internal_api_key" {
  secret_id = aws_secretsmanager_secret.internal_api_key.id
  secret_string = jsonencode({
    key = random_password.internal_api_key.result
  })
}
