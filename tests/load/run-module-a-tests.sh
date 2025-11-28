#!/bin/bash
# tests/load/run-module-a-tests.sh
# Automated test runner for all Module A stages

set -e

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST_SCRIPT="tests/load/module-a-capacity-test.js"
RESULTS_DIR="docs/testing/results"
K6_BIN="/c/Users/ASUS/Desktop/k6.exe"
BASE_URL="http://localhost:3001"
CREATE_USERS_SCRIPT="scripts/create-10k-test-users.sh"

# Create results directory
mkdir -p "$RESULTS_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Module A Multi-Stage Load Testing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Script: $TEST_SCRIPT"
echo "Results: $RESULTS_DIR"
echo "k6 Binary: $K6_BIN"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helper Functions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function wait_for_services() {
  echo "⏳ Waiting for services to be healthy..."
  
  local max_attempts=60
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
      echo "✅ Services are healthy!"
      return 0
    fi
    
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
  done
  
  echo "❌ Services failed to start within 2 minutes"
  return 1
}

function create_test_users() {
  echo "👥 Creating test users..."
  
  if [ -f "$CREATE_USERS_SCRIPT" ]; then
    echo "   Running: $CREATE_USERS_SCRIPT"
    bash "$CREATE_USERS_SCRIPT"
  else
    echo "   ⚠️  User creation script not found: $CREATE_USERS_SCRIPT"
    echo "   Assuming users already exist (loadtest1-10000@test.com)"
  fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 0: Skeleton Architecture (Baseline)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function test_stage_0_skeleton() {
  echo ""
  echo "🔵 Stage 0: Skeleton Architecture (Synchronous)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   Commit: Before Story 2.1 (synchronous baseline)"
  echo "   Features: None (basic REST APIs only)"
  echo ""
  
  # Find skeleton commit (before async implementation)
  SKELETON_COMMIT=$(git log --grep="skeleton\|baseline\|Story 2.0" --all --oneline | head -1 | cut -d' ' -f1)
  
  if [ -z "$SKELETON_COMMIT" ]; then
    echo "⚠️  Skeleton commit not found, skipping..."
    echo "   Try manually: git checkout <commit-before-story-2.1>"
    return
  fi
  
  echo "   Checking out: $SKELETON_COMMIT"
  git stash
  git checkout "$SKELETON_COMMIT"
  
  # Start basic services (no LocalStack, no replicas, no Redis)
  echo "🐳 Starting services..."
  docker-compose up -d
  
  if wait_for_services; then
    create_test_users
    
    echo ""
    echo "🧪 Running load test..."
    $K6_BIN run --out json="$RESULTS_DIR/stage-0-skeleton.json" \
      --summary-export="$RESULTS_DIR/stage-0-skeleton-summary.json" \
      "$TEST_SCRIPT"
    
    echo "✅ Stage 0 complete!"
  else
    echo "❌ Stage 0 failed: services not healthy"
  fi
  
  # Cleanup
  echo "🧹 Cleaning up..."
  docker-compose down -v
  git checkout -
  git stash pop || true
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 1: After Story 2.1 (Async SNS/SQS)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function test_stage_1_async() {
  echo ""
  echo "🟢 Stage 1: After Async (Story 2.1)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   Feature: SNS/SQS event-driven architecture"
  echo "   Validation: ADR-001 (async driver matching)"
  echo ""
  
  # Find Story 2.1 completion commit
  ASYNC_COMMIT=$(git log --grep="Story 2.1\|2\.1\|async\|sns.*sqs" --all --oneline | head -1 | cut -d' ' -f1)
  
  if [ -z "$ASYNC_COMMIT" ]; then
    echo "⚠️  Story 2.1 commit not found, trying tag..."
    ASYNC_COMMIT=$(git tag | grep -i "story-2.1\|2.1" | head -1)
  fi
  
  if [ -z "$ASYNC_COMMIT" ]; then
    echo "❌ Story 2.1 commit not found, skipping..."
    return
  fi
  
  echo "   Checking out: $ASYNC_COMMIT"
  git stash
  git checkout "$ASYNC_COMMIT"
  
  # Start services with LocalStack (SNS/SQS)
  echo "🐳 Starting services + LocalStack..."
  docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d
  
  if wait_for_services; then
    create_test_users
    
    echo ""
    echo "🧪 Running load test..."
    $K6_BIN run --out json="$RESULTS_DIR/stage-1-async.json" \
      --summary-export="$RESULTS_DIR/stage-1-async-summary.json" \
      "$TEST_SCRIPT"
    
    echo "✅ Stage 1 complete!"
  else
    echo "❌ Stage 1 failed: services not healthy"
  fi
  
  # Cleanup
  echo "🧹 Cleaning up..."
  docker-compose -f docker-compose.yml -f docker-compose.localstack.yml down -v
  git checkout -
  git stash pop || true
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 2: After Story 2.2 (Read Replicas)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function test_stage_2_replicas() {
  echo ""
  echo "🟡 Stage 2: After Read Replicas (Story 2.2)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   Feature: PostgreSQL streaming replication"
  echo "   Validation: ADR-002 (read scaling with replicas)"
  echo ""
  
  REPLICAS_COMMIT=$(git log --grep="Story 2.2\|2\.2\|replica" --all --oneline | head -1 | cut -d' ' -f1)
  
  if [ -z "$REPLICAS_COMMIT" ]; then
    echo "⚠️  Story 2.2 commit not found, trying tag..."
    REPLICAS_COMMIT=$(git tag | grep -i "story-2.2\|2.2" | head -1)
  fi
  
  if [ -z "$REPLICAS_COMMIT" ]; then
    echo "❌ Story 2.2 commit not found, skipping..."
    return
  fi
  
  echo "   Checking out: $REPLICAS_COMMIT"
  git stash
  git checkout "$REPLICAS_COMMIT"
  
  # Start with replicas
  echo "🐳 Starting services + LocalStack + Replicas..."
  docker-compose -f docker-compose.yml \
    -f docker-compose.localstack.yml \
    -f docker-compose.replicas.yml up -d
  
  if wait_for_services; then
    create_test_users
    
    echo ""
    echo "🧪 Running load test..."
    $K6_BIN run --out json="$RESULTS_DIR/stage-2-replicas.json" \
      --summary-export="$RESULTS_DIR/stage-2-replicas-summary.json" \
      "$TEST_SCRIPT"
    
    echo "✅ Stage 2 complete!"
  else
    echo "❌ Stage 2 failed: services not healthy"
  fi
  
  # Cleanup
  echo "🧹 Cleaning up..."
  docker-compose -f docker-compose.yml \
    -f docker-compose.localstack.yml \
    -f docker-compose.replicas.yml down -v
  git checkout -
  git stash pop || true
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 3: After Story 2.3 (Redis Caching)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function test_stage_3_caching() {
  echo ""
  echo "🟠 Stage 3: After Caching (Story 2.3)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   Feature: Redis Cluster distributed caching"
  echo "   Validation: ADR-003 (read optimization with cache)"
  echo ""
  
  CACHING_COMMIT=$(git log --grep="Story 2.3\|2\.3\|cache\|redis" --all --oneline | head -1 | cut -d' ' -f1)
  
  if [ -z "$CACHING_COMMIT" ]; then
    echo "⚠️  Story 2.3 commit not found, trying tag..."
    CACHING_COMMIT=$(git tag | grep -i "story-2.3\|2.3" | head -1)
  fi
  
  if [ -z "$CACHING_COMMIT" ]; then
    echo "❌ Story 2.3 commit not found, skipping..."
    return
  fi
  
  echo "   Checking out: $CACHING_COMMIT"
  git stash
  git checkout "$CACHING_COMMIT"
  
  # Start with Redis cluster
  echo "🐳 Starting services + LocalStack + Replicas + Redis..."
  docker-compose -f docker-compose.yml \
    -f docker-compose.localstack.yml \
    -f docker-compose.replicas.yml \
    -f docker-compose.redis-cluster.yml up -d
  
  if wait_for_services; then
    create_test_users
    
    echo ""
    echo "🧪 Running load test..."
    $K6_BIN run --out json="$RESULTS_DIR/stage-3-caching.json" \
      --summary-export="$RESULTS_DIR/stage-3-caching-summary.json" \
      "$TEST_SCRIPT"
    
    echo "✅ Stage 3 complete!"
  else
    echo "❌ Stage 3 failed: services not healthy"
  fi
  
  # Cleanup
  echo "🧹 Cleaning up..."
  docker-compose -f docker-compose.yml \
    -f docker-compose.localstack.yml \
    -f docker-compose.replicas.yml \
    -f docker-compose.redis-cluster.yml down -v
  git checkout -
  git stash pop || true
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 4: Current (Before Auto-Scaling)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function test_stage_4_current() {
  echo ""
  echo "🔴 Stage 4: Current Architecture (Before Auto-Scaling)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   Feature: All optimizations, fixed replicas"
  echo "   Goal: Prove maximum capacity without auto-scaling"
  echo ""
  
  # Use current HEAD (no checkout needed)
  echo "   Using: HEAD (current branch)"
  
  # Start all services
  echo "🐳 Starting all services..."
  docker-compose -f docker-compose.yml \
    -f docker-compose.localstack.yml \
    -f docker-compose.replicas.yml \
    -f docker-compose.redis-cluster.yml up -d
  
  if wait_for_services; then
    create_test_users
    
    echo ""
    echo "🧪 Running load test..."
    $K6_BIN run --out json="$RESULTS_DIR/stage-4-current.json" \
      --summary-export="$RESULTS_DIR/stage-4-current-summary.json" \
      "$TEST_SCRIPT"
    
    echo "✅ Stage 4 complete!"
  else
    echo "❌ Stage 4 failed: services not healthy"
  fi
  
#   # Cleanup
#   echo "🧹 Cleaning up..."
#   docker-compose -f docker-compose.yml \
#     -f docker-compose.localstack.yml \
#     -f docker-compose.replicas.yml \
#     -f docker-compose.redis-cluster.yml down -v
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main Execution
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Parse arguments
STAGE="${1:-all}"

case "$STAGE" in
  "skeleton"|"0")
    test_stage_0_skeleton
    ;;
  "async"|"1")
    test_stage_1_async
    ;;
  "replicas"|"2")
    test_stage_2_replicas
    ;;
  "caching"|"3")
    test_stage_3_caching
    ;;
  "current"|"4")
    test_stage_4_current
    ;;
  "all")
    echo "🚀 Running all test stages (this will take 2-3 hours)..."
    echo ""
    test_stage_0_skeleton
    test_stage_1_async
    test_stage_2_replicas
    test_stage_3_caching
    test_stage_4_current
    ;;
  *)
    echo "Usage: $0 [skeleton|async|replicas|caching|current|all]"
    echo ""
    echo "Stages:"
    echo "  skeleton (0)  - Synchronous baseline (before Story 2.1)"
    echo "  async (1)     - After Story 2.1 (SNS/SQS async)"
    echo "  replicas (2)  - After Story 2.2 (read replicas)"
    echo "  caching (3)   - After Story 2.3 (Redis caching)"
    echo "  current (4)   - Current HEAD (all optimizations)"
    echo "  all           - Run all stages sequentially"
    exit 1
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Testing complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Results saved to: $RESULTS_DIR"
echo ""
echo "Next steps:"
echo "  1. Generate comparison report:"
echo "     python3 tests/load/compare-results.py > docs/testing/module-a-comparison.md"
echo ""
echo "  2. View results:"
echo "     cat docs/testing/module-a-comparison.md"
echo ""
echo "  3. Include in Module A deliverable"
echo ""
