output "user_db_secret_arn" {
  description = "ARN of the user database secret"
  value       = aws_secretsmanager_secret.user_db.arn
}

output "trip_db_secret_arn" {
  description = "ARN of the trip database secret"
  value       = aws_secretsmanager_secret.trip_db.arn
}

output "jwt_secret_arn" {
  description = "ARN of the JWT secret"
  value       = aws_secretsmanager_secret.jwt.arn
}

output "internal_api_key_arn" {
  description = "ARN of the internal API key secret"
  value       = aws_secretsmanager_secret.internal_api_key.arn
}

output "user_db_password" {
  description = "User database password"
  value       = random_password.user_db_password.result
  sensitive   = true
}

output "trip_db_password" {
  description = "Trip database password"
  value       = random_password.trip_db_password.result
  sensitive   = true
}
