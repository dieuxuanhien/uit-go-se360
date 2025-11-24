#!/bin/bash
# Start Hybrid Infrastructure (LocalStack + Real Postgres/Redis)
# Story 1.1: Hybrid Infrastructure Setup

set -e

echo "🚀 Starting UIT-Go Hybrid Infrastructure..."
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Pull LocalStack image if not exists
echo "📥 Pulling LocalStack image (if needed)..."
docker pull localstack/localstack:latest

echo ""
echo "🏗️  Starting services..."
echo "   - LocalStack (SNS, SQS, API Gateway, CloudWatch)"
echo "   - PostgreSQL (user, trip databases)"
echo "   - Redis"
echo "   - Nginx (load balancer)"
echo "   - Microservices (user, trip, driver)"
echo ""

# Start all services
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
echo ""
echo "🔍 Checking service health..."

# Check LocalStack
if curl -sf http://localhost:4566/_localstack/health >/dev/null 2>&1; then
  echo "  ✅ LocalStack: http://localhost:4566"
else
  echo "  ⏳ LocalStack: Starting... (check logs: docker logs uitgo-localstack)"
fi

# Check PostgreSQL
if docker exec uitgo-postgres-user pg_isready -U postgres >/dev/null 2>&1; then
  echo "  ✅ PostgreSQL (user): localhost:5432"
else
  echo "  ⏳ PostgreSQL (user): Starting..."
fi

if docker exec uitgo-postgres-trip pg_isready -U postgres >/dev/null 2>&1; then
  echo "  ✅ PostgreSQL (trip): localhost:5433"
else
  echo "  ⏳ PostgreSQL (trip): Starting..."
fi

# Check Redis
if docker exec uitgo-redis redis-cli ping >/dev/null 2>&1; then
  echo "  ✅ Redis: localhost:6379"
else
  echo "  ⏳ Redis: Starting..."
fi

echo ""
echo "📋 Service URLs:"
echo "   - LocalStack Gateway: http://localhost:4566"
echo "   - User Service: http://localhost:3001"
echo "   - Trip Service: http://localhost:3002"
echo "   - Driver Service: http://localhost:3003"
echo "   - Nginx (Load Balancer): http://localhost"
echo ""
echo "🧪 Test LocalStack:"
echo "   awslocal sns list-topics --region us-east-1"
echo "   awslocal sqs list-queues --region us-east-1"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f localstack"
echo "   docker-compose logs -f user-service"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose -f docker-compose.yml -f docker-compose.localstack.yml down"
echo ""
echo "✅ Hybrid infrastructure is starting!"
echo "   Wait 30-60 seconds for all services to be fully ready."
