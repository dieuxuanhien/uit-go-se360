#!/bin/bash
# Story 2.3: Redis Cluster Setup Script
# Initializes 6-node Redis Cluster (3 masters + 3 replicas)

set -e

echo "🔧 Story 2.3: Initializing Redis Cluster..."
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Start Redis Cluster nodes
echo "🚀 Starting Redis Cluster nodes..."
docker-compose -f docker-compose.yml -f docker-compose.redis-cluster.yml up -d \
  redis-node-1 redis-node-2 redis-node-3 redis-node-4 redis-node-5 redis-node-6

echo "⏳ Waiting for Redis nodes to be ready..."
sleep 10

# Check if cluster is already initialized
if docker exec uitgo-redis-node-1 redis-cli cluster info 2>/dev/null | grep -q "cluster_state:ok"; then
  echo "✅ Redis Cluster already initialized"
else
  echo "🔧 Creating Redis Cluster..."
  
  # Get container IPs
  NODE1_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' uitgo-redis-node-1)
  NODE2_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' uitgo-redis-node-2)
  NODE3_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' uitgo-redis-node-3)
  NODE4_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' uitgo-redis-node-4)
  NODE5_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' uitgo-redis-node-5)
  NODE6_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' uitgo-redis-node-6)

  echo "  Node 1: $NODE1_IP:6379"
  echo "  Node 2: $NODE2_IP:6379"
  echo "  Node 3: $NODE3_IP:6379"
  echo "  Node 4: $NODE4_IP:6379"
  echo "  Node 5: $NODE5_IP:6379"
  echo "  Node 6: $NODE6_IP:6379"
  echo ""

  # Create cluster
  docker exec uitgo-redis-node-1 redis-cli --cluster create \
    $NODE1_IP:6379 \
    $NODE2_IP:6379 \
    $NODE3_IP:6379 \
    $NODE4_IP:6379 \
    $NODE5_IP:6379 \
    $NODE6_IP:6379 \
    --cluster-replicas 1 \
    --cluster-yes

  echo "✅ Redis Cluster created successfully"
fi

echo ""
echo "📊 Redis Cluster Status:"
docker exec uitgo-redis-node-1 redis-cli cluster info | grep -E "cluster_state|cluster_slots"
echo ""

echo "📋 Cluster Nodes:"
docker exec uitgo-redis-node-1 redis-cli cluster nodes | awk '{print $2, $3, $8}'
echo ""

echo "✅ Redis Cluster is ready!"
echo ""
echo "🧪 Test commands:"
echo "  # Set a value:"
echo "  docker exec uitgo-redis-node-1 redis-cli set test-key 'Hello Redis Cluster'"
echo ""
echo "  # Get the value (may route to different node):"
echo "  docker exec uitgo-redis-node-2 redis-cli get test-key"
echo ""
echo "  # Check cluster slots:"
echo "  docker exec uitgo-redis-node-1 redis-cli cluster slots"
