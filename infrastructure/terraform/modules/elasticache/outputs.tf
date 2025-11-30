output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_cluster.main.port
}

output "redis_cluster_id" {
  description = "Redis cluster ID"
  value       = aws_elasticache_cluster.main.id
}
