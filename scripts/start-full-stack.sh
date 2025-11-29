#!/bin/bash
# Full Stack Startup Script for UIT-GO
# 
# This script starts all infrastructure with proper initialization order:
# 1. Core databases (postgres-user, postgres-trip) + redis + standalone redis
# 2. LocalStack (SNS/SQS auto-initialized)
# 3. Redis Cluster (auto-initialized by redis-cluster-init container)
# 4. Database replicas (stream from primaries)
# 5. Application services
# 6. Load balancer + service replicas
#
# Usage: bash scripts/start-full-stack.sh
#
# After running: All services should be healthy in ~2-3 minutes

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 UIT-GO Full Stack Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$(dirname "$0")/.."

# Define compose files for reuse
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.localstack.yml -f docker-compose.replicas.yml -f docker-compose.redis-cluster.yml -f docker-compose.loadbalancer.yml"

# Step 1: Start core infrastructure (databases, localstack, redis nodes, standalone redis)
echo ""
echo "📦 Step 1: Starting core infrastructure..."
docker-compose $COMPOSE_FILES up -d \
  postgres-user postgres-trip \
  redis \
  localstack \
  redis-node-1 redis-node-2 redis-node-3 redis-node-4 redis-node-5 redis-node-6

# Step 2: Wait for primaries to be healthy
echo ""
echo "⏳ Step 2: Waiting for primary databases..."
until docker exec uitgo-postgres-user pg_isready -U postgres >/dev/null 2>&1; do
  echo "   Waiting for postgres-user..."
  sleep 2
done
until docker exec uitgo-postgres-trip pg_isready -U postgres >/dev/null 2>&1; do
  echo "   Waiting for postgres-trip..."
  sleep 2
done
echo "   ✅ Primary databases ready"

# Step 3: Configure primaries for replication (run init scripts)
echo ""
echo "🔧 Step 3: Configuring primary databases for replication..."
if docker exec uitgo-postgres-user psql -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='replicator'" | grep -q 1; then
  echo "   ✅ Replication already configured"
else
  # Copy and run init scripts (use MSYS_NO_PATHCONV to prevent path mangling on Windows)
  docker cp infrastructure/postgres/init-primary-replication.sh uitgo-postgres-user:/tmp/
  docker cp infrastructure/postgres/init-primary-replication.sh uitgo-postgres-trip:/tmp/
  MSYS_NO_PATHCONV=1 docker exec uitgo-postgres-user bash /tmp/init-primary-replication.sh
  MSYS_NO_PATHCONV=1 docker exec uitgo-postgres-trip bash /tmp/init-primary-replication.sh
  echo "   ✅ Replication configured"
fi

# Step 4: Wait for LocalStack
echo ""
echo "⏳ Step 4: Waiting for LocalStack..."
for i in {1..30}; do
  if curl -s http://localhost:4566/_localstack/health 2>/dev/null | grep -q '"sns"'; then
    echo "   ✅ LocalStack ready"
    break
  fi
  echo "   Waiting for LocalStack... ($i/30)"
  sleep 2
done

# Verify SNS/SQS resources
sleep 3
if docker exec uitgo-localstack awslocal sns list-topics --region us-east-1 2>/dev/null | grep -q "trip-events"; then
  echo "   ✅ SNS/SQS resources initialized"
else
  echo "   🔧 Initializing SNS/SQS resources..."
  MSYS_NO_PATHCONV=1 docker exec uitgo-localstack bash /etc/localstack/init/ready.d/init-story-2.1-resources.sh 2>/dev/null || true
fi

# Step 5: Initialize Redis Cluster
echo ""
echo "⏳ Step 5: Initializing Redis Cluster..."
# Wait for all redis nodes
for node in 1 2 3 4 5 6; do
  until docker exec uitgo-redis-node-$node redis-cli ping >/dev/null 2>&1; do
    echo "   Waiting for redis-node-$node..."
    sleep 2
  done
done

# Check if cluster already initialized
if docker exec uitgo-redis-node-1 redis-cli cluster info 2>/dev/null | grep -q "cluster_state:ok"; then
  echo "   ✅ Redis Cluster already initialized"
else
  echo "   🔧 Creating Redis Cluster..."
  # Use redis-cluster-init container or manual create
  docker-compose $COMPOSE_FILES up -d redis-cluster-init 2>/dev/null || \
    docker exec uitgo-redis-node-1 redis-cli --cluster create \
      redis-node-1:6379 redis-node-2:6379 redis-node-3:6379 \
      redis-node-4:6379 redis-node-5:6379 redis-node-6:6379 \
      --cluster-replicas 1 --cluster-yes 2>/dev/null || echo "   (Cluster may already exist)"
  sleep 3
  echo "   ✅ Redis Cluster ready"
fi

# Step 6: Start database replicas
echo ""
echo "📦 Step 6: Starting database replicas..."
docker-compose $COMPOSE_FILES up -d \
  postgres-user-replica-1 postgres-user-replica-2 \
  postgres-trip-replica-1 postgres-trip-replica-2

# Wait for replicas to sync (pg_basebackup takes ~30-60s)
echo "   ⏳ Waiting for replicas to sync (this may take 60s)..."
sleep 20
for replica in uitgo-postgres-user-replica-1 uitgo-postgres-user-replica-2 uitgo-postgres-trip-replica-1 uitgo-postgres-trip-replica-2; do
  timeout=60
  while ! docker exec $replica pg_isready -U postgres >/dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
      echo "   ⚠️  Timeout waiting for $replica (may still be syncing)"
      break
    fi
    echo "   Waiting for $replica... (${timeout}s remaining)"
    sleep 5
    timeout=$((timeout - 5))
  done
done
echo "   ✅ Replicas started"

# Step 7: Start application services
echo ""
echo "📦 Step 7: Starting application services..."
docker-compose $COMPOSE_FILES up -d user-service trip-service driver-service

# Wait for services to be healthy
echo "   ⏳ Waiting for services to start..."
sleep 10
for service in uitgo-user-service uitgo-trip-service uitgo-driver-service; do
  timeout=30
  while ! docker inspect $service --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
    if [ $timeout -le 0 ]; then
      echo "   ⚠️  $service may still be starting"
      break
    fi
    echo "   Waiting for $service to be healthy... (${timeout}s remaining)"
    sleep 3
    timeout=$((timeout - 3))
  done
done
echo "   ✅ Application services started"

# Step 8: Start load balancer and service replicas
echo ""
echo "📦 Step 8: Starting load balancer and service replicas..."
docker-compose $COMPOSE_FILES up -d nginx-lb user-service-2 trip-service-2 driver-service-2

# Wait for nginx to start
sleep 5

# Step 9: Reload nginx to ensure DNS resolution is fresh
echo ""
echo "🔄 Step 9: Refreshing nginx DNS resolution..."
docker exec uitgo-nginx-lb nginx -s reload 2>/dev/null || echo "   (nginx reload skipped)"
echo "   ✅ Load balancer ready"

# Final status check
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Full Stack Started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Service Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep uitgo | head -25
echo ""
echo "🔗 Endpoints:"
echo "   Load Balancer: http://localhost:8080"
echo "   User Service:  http://localhost:3001"
echo "   Trip Service:  http://localhost:3002"
echo "   Driver Service: http://localhost:3003"
echo "   LocalStack:    http://localhost:4566"
echo ""
echo "🧪 Quick health check:"
echo "   curl http://localhost:8080/health"
echo "   curl -X POST http://localhost:8080/users/login -H 'Content-Type: application/json' -d '{\"email\":\"loadtest1@test.com\",\"password\":\"password123\"}'"
echo ""
echo "📝 Verify infrastructure:"
echo "   SNS Topics:  docker exec uitgo-localstack awslocal sns list-topics --region us-east-1"
echo "   SQS Queues:  docker exec uitgo-localstack awslocal sqs list-queues --region us-east-1"
echo "   Redis:       docker exec uitgo-redis-node-1 redis-cli cluster info"
echo "   Replicas:    docker exec uitgo-postgres-user psql -U postgres -c 'SELECT client_addr,state FROM pg_stat_replication;'"
echo ""
