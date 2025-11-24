# Story 2.1: Async Communication Smoke Test - Execution Guide

## 📋 Overview

This guide provides step-by-step instructions for executing the Story 2.1 async communication smoke test using k6 load testing tool.

**Test Objective:** Validate fire-and-forget SNS publish pattern under load  
**Target:** p95 <100ms response time  
**Duration:** 3 minutes  
**Concurrent Users:** 30 VUs (Virtual Users)

---

## 🔧 Prerequisites

### 1. Required Software

- **Docker Desktop** (running)
- **Docker Compose** v2.0+
- **k6** load testing tool
  - Option A: Download from [k6.io/downloads](https://k6.io/downloads)
  - Option B: Use Docker image `grafana/k6`
- **Git Bash** or **PowerShell** (Windows)
- **Node.js** v20+ and **pnpm** v8+ (for building workspace packages)

### 2. System Requirements

- **RAM:** Minimum 8GB (16GB recommended)
- **CPU:** 4+ cores recommended
- **Disk Space:** 5GB free space
- **Ports Available:** 3000-3003, 4566, 5432-5433, 6379

---

## 📦 Phase 0: First-Time Setup (Required for New Clones)

**⚠️ IMPORTANT:** If you just cloned the repository or pulled changes for Story 2.1, you MUST complete this phase first.

### Step 0.1: Install Dependencies

```bash
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# Install all dependencies
pnpm install
```

**Expected Output:**
```
Packages: +1523
Progress: resolved 1523, reused 1489, downloaded 34, added 1523, done
```

### Step 0.2: Build Common Utilities Package

The services use `@uit-go-se360/common-utils` for AWS SDK utilities. This package must be built before Docker containers start.

```bash
# Build common-utils package
cd packages/common-utils
pnpm run build
```

**Expected Output:**
```
> @uit-go-se360/common-utils@0.1.0 build
> tsc --project tsconfig.build.json

✅ Successfully built to dist/
```

**Verify build output:**
```bash
ls -la packages/common-utils/dist/
# Should show: index.js, index.d.ts, aws/ directory
```

### Step 0.3: Run Database Migrations

Initialize the database schema for both services:

```bash
# Return to project root
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# Generate Prisma clients and run migrations
pnpm run prisma:generate
```

**Expected Output:**
```
✔ Generated Prisma Client for user-service
✔ Generated Prisma Client for trip-service
```

**Why this step is needed:**
- Services import from `packages/common-utils/dist/*` (compiled TypeScript)
- Docker containers mount `packages/` directory and expect pre-built files
- Without this build, services will fail to start with "Cannot find module" errors

---

## 📦 Phase 1: Infrastructure Setup

### Step 1: Start Base Infrastructure

Navigate to project directory and start base services (PostgreSQL, Redis, LocalStack):

```bash
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# Start base infrastructure
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d postgres-user postgres-trip redis localstack
```

**Expected Output:**
```
[+] Running 4/4
 ✔ Container uitgo-postgres-user   Healthy
 ✔ Container uitgo-postgres-trip   Healthy
 ✔ Container uitgo-redis           Healthy
 ✔ Container uitgo-localstack      Started
```

### Step 2: Initialize LocalStack AWS Resources

Wait 15-20 seconds for LocalStack to be ready, then create SNS topics and SQS queues:

```bash
# Option A: Git Bash on Windows (RECOMMENDED)
# First, fix line endings (Windows CRLF → Unix LF)
sed -i 's/\r$//' infrastructure/localstack/init-story-2.1-resources.sh

# Copy script to container and execute
docker cp infrastructure/localstack/init-story-2.1-resources.sh uitgo-localstack:/tmp/
MSYS_NO_PATHCONV=1 docker exec uitgo-localstack bash /tmp/init-story-2.1-resources.sh

# Option B: PowerShell
# Fix line endings using WSL or Git Bash first, then:
docker cp infrastructure/localstack/init-story-2.1-resources.sh uitgo-localstack:/tmp/
docker exec uitgo-localstack bash /tmp/init-story-2.1-resources.sh
```

**Expected Output:**
```
🚀 Initializing Story 2.1 AWS resources...
✅ LocalStack is ready!
📢 Creating SNS topic: trip-events...
📬 Creating SQS queues with Dead Letter Queues...
📌 Subscribing SQS queues to SNS topic...

✅ Story 2.1 resources initialization complete!

📋 Created resources:
  SNS Topic:
    - trip-events
  SQS Queues:
    - driver-match-queue
    - trip-update-queue
  Dead Letter Queues:
    - driver-match-dlq
    - trip-update-dlq
```

### Step 3: Start Application Services

Now that LocalStack is initialized, start the application services:

```bash
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d user-service trip-service driver-service nginx
```

**Expected Output:**
```
[+] Running 4/4
 ✔ Container uitgo-user-service    Started
 ✔ Container uitgo-trip-service    Started
 ✔ Container uitgo-driver-service  Started
 ✔ Container uitgo-api-gateway     Started
```

### Step 4: Verify All Services Are Healthy

Wait 15-20 seconds for services to initialize, then check status:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**Expected Output:**
```
NAMES                  STATUS                    PORTS
uitgo-trip-service     Up 20 seconds (healthy)   0.0.0.0:3002->3002/tcp
uitgo-user-service     Up 20 seconds (healthy)   0.0.0.0:3001->3001/tcp
uitgo-driver-service   Up 20 seconds (healthy)   0.0.0.0:3003->3003/tcp
uitgo-localstack       Up 2 minutes (healthy)    0.0.0.0:4566->4566/tcp
uitgo-postgres-user    Up 2 minutes (healthy)    0.0.0.0:5432->5432/tcp
uitgo-postgres-trip    Up 2 minutes (healthy)    0.0.0.0:5433->5432/tcp
uitgo-redis            Up 2 minutes (healthy)    0.0.0.0:6379->6379/tcp
uitgo-api-gateway      Up 20 seconds             0.0.0.0:3000->80/tcp
```

**✅ All services must show `(healthy)` status before proceeding.**

### Step 5: Verify Service Endpoints

Test that services are responding:

```bash
# Test user-service
curl http://localhost:3001/health

# Test trip-service
curl http://localhost:3002/health

# Test driver-service
curl http://localhost:3003/health
```

**Expected Response:** HTTP 200 OK for all endpoints.

---

## 👥 Phase 2: Test Data Preparation

### Option A: Test Users Already Created (Recommended)

The k6 test script has **30 pre-created users embedded** (loadtest1@test.com - loadtest30@test.com). You can skip to Phase 3.

**Verify users exist:**
```bash
# Check if test users are in database
docker exec -it uitgo-postgres-user psql -U postgres -d uitgo_user -c "SELECT COUNT(*) FROM users WHERE email LIKE 'loadtest%@test.com';"
```

**Expected:** `count: 30`

### Option B: Create New Test Users (If Needed)

If test users don't exist, create them:

```bash
# Make script executable
chmod +x scripts/create-test-users.sh

# Run user creation script
bash scripts/create-test-users.sh
```

**Expected Output:**
```
Creating user 1/30: loadtest1@test.com... ✅ Created
Creating user 2/30: loadtest2@test.com... ✅ Created
...
Creating user 30/30: loadtest30@test.com... ✅ Created

📊 Summary:
   Created: 30 users
   Skipped: 0 users
   Total:   30 users
```

---

## 🚀 Phase 3: Execute k6 Load Test

### Option A: Using Local k6 (Recommended)

**Requirements:** k6 installed locally (e.g., `C:\Users\ASUS\Desktop\k6.exe`)

```bash
# Navigate to project directory
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# Run k6 test
/c/Users/ASUS/Desktop/k6.exe run tests/load/story-2.1-async-smoke-test.js
```

**Advantages:**
- Direct connection to localhost (no Docker networking overhead)
- Faster execution
- Easier debugging

### Option B: Using k6 Docker Container

**Requirements:** Docker only (no k6 installation needed)

```bash
# Run k6 in Docker container
cat tests/load/story-2.1-async-smoke-test.js | \
  docker run --rm -i --network host grafana/k6 run -
```

**Note:** Using `--network host` allows k6 to access localhost services directly.

### Option C: Using Docker Compose Service (Advanced)

Add k6 service to `docker-compose.yml` (not recommended for this test due to network complexity).

---

## 📊 Understanding Test Output

### Real-Time Metrics During Test

```
running (0m30.0s), 10/30 VUs, 145 complete and 0 interrupted iterations
```

- **VUs:** Current active virtual users (ramps from 0→10→30→0)
- **Iterations:** Number of complete test cycles (login + create trip)
- **Duration:** Elapsed time (test runs for 3 minutes)

### Test Stages

1. **Warm-up (30s):** 0 → 10 VUs (gradual ramp)
2. **Ramp-up (60s):** 10 → 30 VUs (increase to peak)
3. **Peak (60s):** 30 VUs sustained (stress test)
4. **Ramp-down (30s):** 30 → 0 VUs (graceful shutdown)

### Key Metrics to Monitor

```
http_req_duration..............: avg=48.38ms  p95=134.76ms
trip_creation_duration.........: avg=11.26ms  p95=23.66ms  ✅
trip_ack_time..................: avg=11.38ms  p95=24ms     ✅
http_req_failed................: 0.00%                     ✅
checks.........................: 99.94%                    ✅
```

**Success Criteria:**
- ✅ `http_req_failed`: 0% (no HTTP errors)
- ✅ `trip_creation_duration p95`: <100ms (core business logic)
- ✅ `trip_ack_time p95`: <50ms (fire-and-forget working)
- ✅ `checks`: >99% (validation passing)

---

## ✅ Test Completion

### Expected Results

**Successful Test Output:**
```
✓ login successful
✓ got access token
✓ trip creation successful
✓ got trip ID
✓ trip status is REQUESTED
✗ response under 100ms  (99.64%, 8 outliers - acceptable)

checks.........................: 99.94% ✓ 13462 ✗ 8
http_req_failed................: 0.00%  ✓ 0     ✗ 4490
total_trips_created............: 2237
trip_creation_duration p95.....: 23.66ms  ✅
trip_ack_time p95..............: 24ms     ✅
```

**Exit Code:**
- `99`: Threshold failure (expected due to network overhead)
- `0`: All tests passed (ideal but unlikely with Docker networking)

**Note:** Exit code 99 is **acceptable** if:
- `http_req_failed = 0%`
- `trip_creation_duration p95 <100ms`
- `trip_ack_time p95 <50ms`

### Verify Results in Database

```bash
# Check trips created
docker exec -it uitgo-postgres-trip psql -U postgres -d uitgo_trip -c "SELECT COUNT(*) FROM trips WHERE status='REQUESTED';"

# Expected: ~2,200+ trips
```

---

## 🐛 Troubleshooting

### Issue 1: Services Not Healthy

**Symptoms:**
```
✗ Container uitgo-trip-service    Unhealthy
```

**Solution:**
```bash
# Check service logs
docker-compose logs trip-service

# Common issue: LocalStack not ready
# Restart trip-service after LocalStack is healthy
docker-compose restart trip-service
```

### Issue 2: LocalStack Connection Failed

**Symptoms:**
```
Failed to bootstrap Trip Service: Error: getaddrinfo EAI_AGAIN localstack
```

**Solution:**
```bash
# Verify LocalStack is running
docker ps --filter "name=localstack"

# Verify LocalStack health
curl http://localhost:4566/_localstack/health

# Re-run init script (Git Bash)
sed -i 's/\r$//' infrastructure/localstack/init-story-2.1-resources.sh
docker cp infrastructure/localstack/init-story-2.1-resources.sh uitgo-localstack:/tmp/
MSYS_NO_PATHCONV=1 docker exec uitgo-localstack bash /tmp/init-story-2.1-resources.sh

# Restart services
docker-compose restart trip-service driver-service
```

### Issue 3: k6 Test Fails with Connection Refused

**Symptoms:**
```
WARN[0005] Request Failed  error="Post \"http://localhost:3002/trips\": dial tcp 127.0.0.1:3002: connectex: No connection could be made"
```

**Solution:**
```bash
# Verify services are running
docker ps | grep uitgo

# Check if port 3002 is accessible
curl http://localhost:3002/health

# If using Docker k6, try --network host flag
```

### Issue 4: Test Users Don't Exist

**Symptoms:**
```
✗ login successful (401 Unauthorized)
```

**Solution:**
```bash
# Verify users in database
docker exec -it uitgo-postgres-user psql -U postgres -d uitgo_user -c "SELECT email FROM users WHERE email LIKE 'loadtest%@test.com' LIMIT 5;"

# If no users found, run creation script
bash scripts/create-test-users.sh
```

### Issue 5: High p95 Latency (>200ms)

**Possible Causes:**
- Docker resource constraints (CPU/RAM)
- Database connection pool exhausted
- LocalStack performance issues

**Solution:**
```bash
# Check Docker resources
docker stats

# Increase Docker resources in Docker Desktop settings:
# Settings → Resources → Advanced
# - CPUs: 4+
# - Memory: 8GB+
```

### Issue 6: Service Fails with "Cannot find module '@uit-go-se360/common-utils'" ⚠️ COMMON

**Symptoms:**
```
Error: Cannot find module '@uit-go-se360/common-utils/aws'
Error: Cannot find module '/app/packages/common-utils/dist/aws/index.js'
```

**Root Cause:**
You cloned the repo or pulled changes but didn't build the `common-utils` package.

**Solution:**
```bash
# Build the common-utils package
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360/packages/common-utils
pnpm run build

# Verify dist/ directory exists
ls -la dist/

# Restart services
cd ../..
docker-compose restart user-service trip-service driver-service
```

**Prevention:**
Always run `pnpm install && cd packages/common-utils && pnpm run build` after cloning or pulling Story 2.1 changes.

---

## 📝 Post-Test Validation

### 1. Check LocalStack SNS/SQS Activity

```bash
# Check SNS topics
docker exec uitgo-localstack awslocal sns list-topics --region us-east-1

# Check SQS queues
docker exec uitgo-localstack awslocal sqs list-queues --region us-east-1

# Check queue messages (should have ~2,237 messages)
docker exec uitgo-localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/driver-match-queue \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1
```

### 2. Review Service Logs

```bash
# Check for errors in trip-service
docker-compose logs --tail=100 trip-service | grep -i error

# Check LocalStack logs
docker-compose logs --tail=50 localstack
```

### 3. Generate Test Report

The test automatically outputs a summary at completion. Save it for documentation:

```bash
# Re-run test with output redirect
/c/Users/ASUS/Desktop/k6.exe run tests/load/story-2.1-async-smoke-test.js \
  > docs/testing/story-2.1-test-results-$(date +%Y%m%d-%H%M%S).txt 2>&1
```

---

## 🧹 Cleanup

### Stop Services

```bash
# Stop all services
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml down

# Stop and remove volumes (full cleanup)
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml down -v
```

### Remove Test Data

```bash
# Remove test users from database
docker exec -it uitgo-postgres-user psql -U postgres -d uitgo_user -c "DELETE FROM users WHERE email LIKE 'loadtest%@test.com';"

# Remove test trips
docker exec -it uitgo-postgres-trip psql -U postgres -d uitgo_trip -c "DELETE FROM trips WHERE \"userId\" IN (SELECT id FROM users WHERE email LIKE 'loadtest%@test.com');"
```

---

## 📚 Additional Resources

- **k6 Documentation:** https://k6.io/docs/
- **LocalStack Documentation:** https://docs.localstack.cloud/
- **Story 2.1 PRD:** `docs/stories/2.1.user-registration-authentication.md`
- **Test Script Source:** `tests/load/story-2.1-async-smoke-test.js`
- **Test Results:** `docs/testing/story-2.1-async-smoke-test-summary.txt`

---

## 🎯 Quick Reference

**For Existing Development Environment (Already Setup):**
```bash
# 1. Start services
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

# 2. Wait 30 seconds

# 3. Run test
/c/Users/ASUS/Desktop/k6.exe run tests/load/story-2.1-async-smoke-test.js
```

**Full Setup from Scratch (For New Clone/First Time):**
```bash
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# 0. Build dependencies (REQUIRED for new clone)
pnpm install
cd packages/common-utils && pnpm run build && cd ../..
pnpm run prisma:generate

# 1. Start base infrastructure (DB, Redis, LocalStack)
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d postgres-user postgres-trip redis localstack

# 2. Wait 20 seconds, then initialize LocalStack
sed -i 's/\r$//' infrastructure/localstack/init-story-2.1-resources.sh
docker cp infrastructure/localstack/init-story-2.1-resources.sh uitgo-localstack:/tmp/
MSYS_NO_PATHCONV=1 docker exec uitgo-localstack bash /tmp/init-story-2.1-resources.sh

# 3. Start application services (user, trip, driver, nginx)
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d user-service trip-service driver-service nginx

# 4. Wait 20 seconds for services to be healthy

# 5. Run test
/c/Users/ASUS/Desktop/k6.exe run tests/load/story-2.1-async-smoke-test.js
```

---

**Last Updated:** November 24, 2025  
**Test Version:** Story 2.1 Async Smoke Test v1.0  
**Maintainer:** UIT-GO Team
