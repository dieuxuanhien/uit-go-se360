output "user_db_endpoint" {
  description = "User database endpoint"
  value       = aws_db_instance.user_db.endpoint
}

output "user_db_address" {
  description = "User database address"
  value       = aws_db_instance.user_db.address
}

output "trip_db_endpoint" {
  description = "Trip database endpoint"
  value       = aws_db_instance.trip_db.endpoint
}

output "trip_db_address" {
  description = "Trip database address"
  value       = aws_db_instance.trip_db.address
}

output "user_db_id" {
  description = "User database instance ID"
  value       = aws_db_instance.user_db.id
}

output "trip_db_id" {
  description = "Trip database instance ID"
  value       = aws_db_instance.trip_db.id
}
