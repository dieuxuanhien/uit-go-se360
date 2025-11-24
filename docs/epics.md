# UIT-Go Module A: Scalability & Performance - Epic Breakdown

**Date:** 2025-11-22  
**Project:** Module A - Architecture Design for Scalability & Performance  
**Based On:** 
- ✅ bmm-workflow-status.yaml (actual project state)
- ✅ docs/testing/baseline-authenticated-results.md (1,316 trips, 0% errors, 49.42ms p95)
- ✅ docs/adrs/ (6 architectural patterns documented)

---

## Project Context

**Completed Work:**
- ✅ **Phase 1 (Architecture Design):** Gap analysis, 6 architectural patterns designed, 6 ADRs documented, gate check approved
- ✅ **Phase 2 (Baseline Testing):** Load testing plan created, baseline test executed (1,316 trips, 0% errors, 49.42ms p95 latency, production-ready confirmed)

**Remaining Work (This Epic Breakdown):**
- ❌ **Phase 3 (Implementation):** AWS deployment, implement 6 optimization patterns
- ❌ **Phase 4 (Validation):** Post-optimization testing, scalability report

**Total Story Points:** 78 points (baseline testing already complete)  
**Estimated Timeline:** 3-4 weeks

---

## Epic 1: Hybrid Infrastructure Setup (LocalStack + Real OSS)

**Goal:** Deploy application with hybrid stack: LocalStack for AWS services + Real Postgres/Redis

**Scope:** Week 1 (5-7 days) - Zero-cost AWS-compatible infrastructure

**Success Criteria:**
- ✅ All 3 services (UserService, TripService, DriverService) running in Docker Compose
- ✅ LocalStack configured: SNS, SQS, API Gateway, CloudWatch (AWS-compatible APIs)
- ✅ Real PostgreSQL: 3 single instances (users_db, trips_db, drivers_db) - no replicas yet
- ✅ Real Redis: 1 single node - no cluster mode yet
- ✅ Baseline k6 tests replicated: p95 <100ms (matching local 49.42ms baseline)
- ✅ Monitoring operational (Prometheus/Grafana or CloudWatch via LocalStack)

**Note:** This epic uses LocalStack (FREE) for AWS services + real Postgres/Redis for better performance. NO optimization patterns (SNS/SQS messaging, read replicas, auto-scaling) are implemented yet - those are Epic 2.

**Dependencies:** Baseline testing results (completed), Docker images

---

## Stories - Epic 1

### Story 1.1: Hybrid Infrastructure Setup (LocalStack + Docker Compose)

**As a** System Architect  
**I want** to provision hybrid infrastructure using LocalStack + real Postgres/Redis  
**So that** I can validate AWS-compatible architecture at zero cost

**Acceptance Criteria:**

**Given** Docker and Docker Compose installed  
**When** I execute `docker-compose up -d`  
**Then** the following infrastructure is running:

**LocalStack Services (AWS-compatible):**
- **SNS:** Topic endpoint at `http://localhost:4566`
- **SQS:** Queue endpoint at `http://localhost:4566`
- **API Gateway:** HTTP API at `http://localhost:4566`
- **CloudWatch:** Metrics endpoint at `http://localhost:4566`

**Real Open-Source Services:**
- **PostgreSQL Primary:** 3× databases (users_db, trips_db, drivers_db) on port 5432
- **Redis Primary:** Single node on port 6379 (no cluster mode yet)
- **Nginx:** Reverse proxy/load balancer on port 80 (simulates ALB)

**Application Services:**
- **UserService:** 2 containers on ports 3001-3002
- **TripService:** 2 containers on ports 3003-3004
- **DriverService:** 2 containers on ports 3005-3006

**And** health checks pass:
- `curl http://localhost/api/users/health` → 200 OK
- `curl http://localhost/api/trips/health` → 200 OK
- `curl http://localhost/api/drivers/health` → 200 OK

**And** AWS SDK can connect to LocalStack:
- `aws --endpoint-url=http://localhost:4566 sns list-topics` → Returns empty list (ready)

**And** environment variables configured:
- `AWS_ENDPOINT_URL=http://localhost:4566`
- `DATABASE_URL=postgresql://user:pass@postgres-primary:5432/users_db`
- `REDIS_URL=redis://redis:6379`

**Prerequisites:** 
- Docker Desktop installed
- LocalStack image pulled: `docker pull localstack/localstack:latest`

**Technical Notes:**
- Configuration file: `docker-compose.localstack.yml`
- LocalStack FREE tier supports SNS, SQS, API Gateway, CloudWatch
- Real Postgres/Redis avoid LocalStack simulation overhead (better performance)
- Nginx simulates ALB with round-robin load balancing
- Cost: **$0** (100% local)

**Estimated Effort:** 8 points (1 day)

---

### Story 1.2: Configure Services to Use LocalStack + Postgres/Redis

**As a** System Architect  
**I want** to configure all 3 NestJS microservices to connect to LocalStack and real Postgres/Redis  
**So that** the application runs in hybrid environment for validation

**Acceptance Criteria:**

**Given** Hybrid infrastructure is running (Story 1.1 complete)  
**When** I configure services with LocalStack endpoints  
**Then** all services can connect to infrastructure:

**LocalStack Configuration (AWS SDK):**
```typescript
// services/common/aws-config.ts
const AWS_CONFIG = {
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localstack:4566',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};
```

**Database Configuration (TypeORM):**
```typescript
// Each service connects to real Postgres
TypeOrmModule.forRoot({
  type: 'postgres',
  host: 'postgres-primary',
  port: 5432,
  database: 'users_db', // or trips_db, drivers_db
  // ... existing config
})
```

**Redis Configuration:**
```typescript
// Connect to real Redis (not LocalStack)
RedisModule.forRoot({
  config: {
    host: 'redis',
    port: 6379,
  },
})
```

**And** services are accessible via Nginx:
- `http://localhost/api/users/*` → UserService (ports 3001-3002, round-robin)
- `http://localhost/api/trips/*` → TripService (ports 3003-3004)
- `http://localhost/api/drivers/*` → DriverService (ports 3005-3006)

**And** smoke test passes:
  - Register user: `POST http://localhost/api/users/register` → 201 Created
  - Login: `POST http://localhost/api/users/login` → 200 OK with JWT token
  - Create trip: `POST http://localhost/api/trips` with auth header → 201 Created
  - Verify DB: User record exists in `postgres-primary.users_db`

**Prerequisites:** Story 1.1 (infrastructure running)

**Technical Notes:**
- Update `.env.localstack` with LocalStack endpoints
- Use `docker-compose scale` to run 2 containers per service
- Nginx config: `nginx/nginx.conf` with upstream blocks
- LocalStack endpoint works with official AWS SDK (no code changes needed)

**Estimated Effort:** 6 points (4-6 hours)

---

### Story 1.3: Terraform for LocalStack (AWS-Compatible IaC)

**As a** System Architect  
**I want** to write Terraform code that works with LocalStack  
**So that** infrastructure is portable to real AWS if needed

**Acceptance Criteria:**

**Given** LocalStack is running (Story 1.1 complete)  
**When** I write Terraform configuration for AWS services  
**Then** infrastructure can be deployed to LocalStack:

**Terraform Configuration:**
```hcl
# infrastructure/terraform/main.tf
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    sns         = "http://localhost:4566"
    sqs         = "http://localhost:4566"
    apigateway  = "http://localhost:4566"
    cloudwatch  = "http://localhost:4566"
  }
}

# SNS Topic for trip events
resource "aws_sns_topic" "trip_events" {
  name = "trip-events"
}

# SQS Queue for driver matching
resource "aws_sqs_queue" "driver_match_queue" {
  name = "driver-match-queue"
}

# SNS → SQS subscription
resource "aws_sns_topic_subscription" "driver_match_sub" {
  topic_arn = aws_sns_topic.trip_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.driver_match_queue.arn
}
```

**And** Terraform commands work:
```bash
terraform init
terraform plan   # Shows resources to create
terraform apply  # Creates resources in LocalStack

# Verify resources created
aws --endpoint-url=http://localhost:4566 sns list-topics
# Output: arn:aws:sns:us-east-1:000000000000:trip-events

aws --endpoint-url=http://localhost:4566 sqs list-queues
# Output: http://localhost:4566/000000000000/driver-match-queue
```

**And** Terraform state tracked:
- State file: `terraform.tfstate` (local) or S3 backend (for team)
- Resources can be destroyed: `terraform destroy`

**And** documentation explains portability:
> "This Terraform code deploys to LocalStack for local testing. To deploy to real AWS, remove the `endpoints` block and configure AWS credentials. Estimated AWS cost: $645/month."

**Prerequisites:** 
- Story 1.1 (LocalStack running)
- Terraform installed (`brew install terraform` or `choco install terraform`)

**Technical Notes:**
- Use `tflocal` wrapper: `pip install terraform-local` (automatically sets LocalStack endpoints)
- Alternative: Use `awslocal` CLI: `pip install awscli-local`
- LocalStack FREE tier limitation: Some resources auto-deleted after 1 hour (Pro: persistent)
- For RDS/ElastiCache, skip Terraform (use Docker Compose directly for Postgres/Redis)

**Estimated Effort:** 5 points (4-6 hours)

---

### Story 1.4: Replicate Baseline k6 Test on Hybrid Stack

**As a** System Architect  
**I want** to run the same k6 baseline test against hybrid LocalStack deployment  
**So that** I can validate hybrid stack performance matches local baseline (49.42ms p95)

**Acceptance Criteria:**

**Given** All services running in hybrid stack (Story 1.2 complete)  
**When** I execute k6 test: `k6 run tests/load/baseline-authenticated-test.js -e BASE_URL=http://localhost`  
**Then** test completes with results:
- **Total Requests:** ≥2,500 (matching original baseline)
- **Failure Rate:** <5% (target: 0% like original)
- **HTTP p95 Latency:** <60ms (acceptable 1.2x degradation due to LocalStack overhead)
- **Total Iterations:** ≥1,200 complete trip creation flows
- **Concurrent Users:** Peak 20 VUs (same as original test)

**And** Docker stats captured during test:
```bash
docker stats --no-stream
# Expected results:
# user-service-1:     CPU <50%, Memory <500MB
# trip-service-1:     CPU <50%, Memory <500MB
# driver-service-1:   CPU <50%, Memory <500MB
# postgres-primary:   CPU <30%, Memory <200MB
# redis:              CPU <20%, Memory <100MB
# localstack:         CPU <40%, Memory <300MB
```

**And** test results documented in `docs/testing/hybrid-baseline-results.md`:
| Metric | Original (Docker) | Hybrid (LocalStack) | Delta |
|--------|------------------|---------------------|-------|
| p95 Latency | 49.42ms | ~55ms | +11% |
| Error Rate | 0% | 0% | Same |
| Trips Created | 1,316 | ≥1,300 | ~Same |

**And** validation confirms:
- LocalStack adds minimal overhead (<15% latency increase)
- Architecture patterns work identically to local Docker
- Zero errors prove stability

**Prerequisites:** 
- Story 1.2 (services configured)
- k6 test scripts exist (from Phase 2)

**Technical Notes:**
- Run k6 from host machine (outside Docker network for realistic test)
- LocalStack overhead: ~5-10ms due to AWS API translation layer
- If p95 >100ms, investigate: LocalStack CPU contention, network bridge overhead
- Expected result: Slightly slower than pure Docker, but <2x degradation acceptable

**Estimated Effort:** 3 points (2-3 hours)

---

### Story 1.5: Monitoring Setup (Prometheus + Grafana)

**As a** System Architect  
**I want** to configure monitoring dashboards for hybrid stack  
**So that** I can monitor system health and identify bottlenecks

**Acceptance Criteria:**

**Given** Services running in hybrid stack (Story 1.2 complete)  
**When** I add Prometheus + Grafana to `docker-compose.yml`  
**Then** monitoring stack is operational:

**Prometheus Configuration:**
```yaml
# docker-compose.yml
prometheus:
  image: prom/prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
  # Scrapes metrics from:
  # - NestJS services (prometheus-client)
  # - Postgres exporter (postgres_exporter)
  # - Redis exporter (redis_exporter)
  # - LocalStack CloudWatch adapter (optional)
```

**Grafana Dashboards:**
- Access: `http://localhost:3000` (admin/admin)
- **Dashboard 1: Service Metrics**
  - Request rate (req/s per service)
  - Response time (p50, p95, p99)
  - Error rate (%)
  - Active connections
  
- **Dashboard 2: Database Metrics**
  - Postgres connections (count)
  - Query duration (ms)
  - Transaction rate (TPS)
  - Slow queries (>100ms)
  
- **Dashboard 3: Cache Metrics**
  - Redis hit rate (%)
  - Memory usage (MB)
  - Commands/sec
  - Evicted keys

**And** NestJS services expose metrics:
```typescript
// services/*/src/main.ts
import { register } from 'prom-client';

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**And** alerting rules configured (Prometheus Alertmanager):
- **Critical:** Service CPU >80% for 5 minutes
- **Critical:** Postgres connections >80 (of 100 max)
- **Warning:** HTTP 5xx errors >5% for 5 minutes
- **Warning:** Redis memory >80%

**And** test monitoring by running k6 load test:
- View live metrics in Grafana during test
- Verify dashboard updates every 15 seconds
- Export dashboard as JSON for report

**Prerequisites:** Story 1.2 (services running)

**Technical Notes:**
- Use `@willsoto/nestjs-prometheus` library for NestJS metrics
- Postgres exporter: `wrouesnel/postgres_exporter`
- Redis exporter: `oliver006/redis_exporter`
- Alternative to Prometheus: Use LocalStack CloudWatch (limited in free tier)
- Grafana dashboards: Import community dashboards (#1860 for Postgres, #11835 for Redis)

**Estimated Effort:** 3 points (2-3 hours)

---

## Epic 2: Optimization Implementation (6 ADR Patterns)

**Goal:** Implement the 6 architectural optimization patterns documented in ADRs

**Scope:** Week 2 (7-10 days) - Apply all ADR patterns to hybrid deployment

**Success Criteria:**
- ✅ **ADR-001:** Event-driven async communication (LocalStack SNS/SQS) for trip-driver matching
- ✅ **ADR-002:** Database read scaling (Postgres streaming replication) for 10x capacity
- ✅ **ADR-003:** Distributed caching (Redis Cluster) for 90% hit rate
- ✅ **ADR-004:** Resilience patterns (circuit breakers, retries, timeouts)
- ✅ **ADR-005:** API Gateway + rate limiting (LocalStack API Gateway or Nginx)
- ✅ **ADR-006:** Auto-scaling simulation (Docker Compose scale)

**Dependencies:** Epic 1 complete (hybrid stack deployed)

**Technical Context:** Each ADR has documented quantitative targets (e.g., ADR-001: 100x throughput, ADR-003: 90% cache hit rate). These stories implement those patterns using LocalStack (AWS-compatible) + real Postgres/Redis and validate the targets.

---

## Stories - Epic 2

### Story 2.1: Implement Event-Driven Async Communication (ADR-001)

**As a** System Architect  
**I want** to replace synchronous trip-driver matching with SNS/SQS event-driven architecture  
**So that** trip creation becomes non-blocking and scales to 100x throughput

**Acceptance Criteria:**

**Given** TripService and DriverService are running in hybrid stack  
**When** I implement SNS/SQS architecture using LocalStack:
1. **Provision AWS resources via Terraform (LocalStack):**
   - SNS topic: `trip-events` (for publishing `TripRequested`, `TripMatched` events)
   - SQS queue: `driver-match-queue` (subscribed to `trip-events`, filters `TripRequested`)
   - SQS queue: `trip-update-queue` (subscribed to `trip-events`, filters `TripMatched`)
   - Dead Letter Queues (DLQ) for both queues (max receive count: 3)
   - All resources accessible at `http://localhost:4566` via AWS SDK

2. **Refactor TripService:**
   - `POST /trips` publishes `TripRequested` event to SNS (async, returns 202 Accepted immediately)
   - Subscribe to `trip-update-queue` to receive `TripMatched` events → update trip status in DB
   - Remove synchronous HTTP call to DriverService

3. **Refactor DriverService:**
   - Poll `driver-match-queue` continuously (long polling, 20s wait time)
   - Process `TripRequested` events: Find available driver → publish `TripMatched` event to SNS
   - Implement idempotency: Check message ID to avoid duplicate processing

**Then** async behavior is validated:
- **User-facing response time:** `POST /trips` returns in <100ms (vs 2-5s sync baseline)
- **End-to-end match time:** Trip status updates from "REQUESTED" → "MATCHED" in <2s (acceptable async delay)
- **Throughput:** System handles 50,000 trips/min (vs 500/min sync baseline) - **100x improvement**
- **Failure recovery:** If DriverService is down, messages remain in queue (no lost requests)

**And** CloudWatch metrics tracked:
- SQS `driver-match-queue`: Message age, approximate number of messages
- SNS `trip-events`: Number of messages published, delivery attempts
- DLQ: Number of messages (should be 0 or minimal)

**And** load test validates ADR-001 targets:
- Run k6 test: 500 VUs creating trips → measure p95 latency <100ms, 0% errors

**Prerequisites:** Epic 1 (hybrid stack complete)

**Technical Notes:**
- Use AWS SDK for SNS/SQS with LocalStack endpoint: `AWS_ENDPOINT_URL=http://localhost:4566`
- LocalStack SNS/SQS is 90% compatible with real AWS (same API, same SDK code)
- Cost: **$0** (LocalStack free tier)
- Real AWS cost (for reference): $0.50 per 1M SNS requests, $0.40 per 1M SQS requests
- Reference: `docs/adrs/ADR-001-event-driven-async-communication.md`
- Code works identically on real AWS (just change endpoint URL)

**Estimated Effort:** 8 points (1-1.5 days)

---

### Story 2.2: Implement Database Read Scaling (ADR-002)

**As a** System Architect  
**I want** to add RDS read replicas with read/write query routing  
**So that** read-heavy queries scale to 10x capacity without impacting writes

**Acceptance Criteria:**

**Given** PostgreSQL primary instances are running (from Epic 1)  
**When** I provision read replicas:
1. **Provision infrastructure (Docker Compose):**
   - Add 2× read replica containers for each database (users_db_replica_1, users_db_replica_2, etc.)
   - Configure Postgres streaming replication (primary → replicas)
   - Set up PgBouncer for connection pooling (1000 app connections → 60 DB connections)

2. **Implement query routing in NestJS:**
   - **Write queries** (INSERT, UPDATE, DELETE) → always route to primary instance
   - **Read-after-write queries** (fetch user after registration) → route to primary (ensure consistency)
   - **Historical read queries** (trip history, driver search) → route to read replicas (tolerate <1s staleness)
   - Use TypeORM replication configuration: `replication: { master: { host: 'postgres-primary' }, slaves: [{ host: 'postgres-replica-1' }, { host: 'postgres-replica-2' }] }`

3. **Optimize queries with indexes:**
   - Create PostGIS index on `drivers.location` for geospatial queries: `CREATE INDEX idx_drivers_location ON drivers USING GIST(location);`
   - Create index on `trips.user_id` for trip history: `CREATE INDEX idx_trips_user_id ON trips(user_id);`
   - Create index on `trips.created_at` for time-range queries: `CREATE INDEX idx_trips_created_at ON trips(created_at);`

**Then** read scaling is validated:
- **Read capacity:** 40,000 read TPS (vs 4,000 single instance) - **10x improvement**
- **Read latency:** p95 <100ms under load (vs 800ms single instance) - **8x faster**
- **Write latency:** No degradation (still ~200ms) - writes remain on primary
- **Replication lag:** <1s average (acceptable for historical queries)
- **Connection efficiency:** 1000 app connections pooled to 60 DB connections via RDS Proxy

**And** query performance measured:
- **Trip history query** (`SELECT * FROM trips WHERE user_id = $1 LIMIT 20`): 60ms (vs 2.4s baseline)
- **Driver search query** (PostGIS geospatial): 45ms (vs 1.8s baseline)

**And** load test validates ADR-002 targets:
- Run k6 test: 100 VUs fetching trip history + 50 VUs creating trips simultaneously
- Measure: Read queries hit replicas (check CloudWatch `DatabaseConnections` metric split by instance)

**Prerequisites:** Epic 1 (Postgres primary instances running)

**Technical Notes:**
- Postgres streaming replication: `recovery.conf` with `primary_conninfo` pointing to primary
- PgBouncer config: `max_client_conn=1000`, `default_pool_size=20` (connection pooling)
- Replication lag monitoring: `SELECT pg_last_wal_receive_lsn() - pg_last_wal_replay_lsn() AS lag;`
- Cost: **$0** (Docker containers)
- Real AWS RDS cost (for reference): $45/month per database (primary + 2 replicas)
- Replication lag acceptable for: Trip history, driver search, analytics (NOT for: Read-after-write)
- Reference: `docs/adrs/ADR-002-database-read-scaling-rds-replicas.md`
- Architecture pattern identical to RDS Multi-AZ + read replicas

**Estimated Effort:** 8 points (1-1.5 days)

---

### Story 2.3: Implement Distributed Caching (ADR-003)

**As a** System Architect  
**I want** to implement ElastiCache Redis cluster with cache-aside pattern  
**So that** database load reduces by 90% and cache hit rate reaches 90%

**Acceptance Criteria:**

**Given** Redis single node is running (from Epic 1)  
**When** I upgrade to cluster mode and implement caching:
1. **Provision Redis cluster (Docker Compose):**
   - Deploy Redis Cluster: 6 nodes (3 master shards, 3 replicas)
   - Enable automatic failover (replica promotion if primary fails)
   - Configure eviction policy: `maxmemory-policy allkeys-lru` (evict least recently used keys when memory full)

2. **Implement cache-aside pattern in UserService:**
   - **Cache key format:** `user:{userId}`, TTL: 5 minutes
   - **Cache flow:**
     - `GET /users/:id`: Check cache → if hit, return; if miss, query DB → populate cache → return
     - `PATCH /users/:id`: Update DB → invalidate cache key → next GET fetches fresh data
   - **Cache warmup:** Pre-load top 1000 active users at startup (optional optimization)

3. **Implement caching in TripService:**
   - **Cache key format:** `trip:{tripId}`, TTL: 2 minutes (shorter due to frequent status updates)
   - **Cache invalidation:** When trip status changes (REQUESTED → MATCHED → EN_ROUTE → COMPLETED), invalidate cache

4. **Implement caching in DriverService:**
   - **Cache key format:** `driver:nearby:{lat},{lng}:{radius}`, TTL: 30 seconds (geospatial queries)
   - **Challenge:** Geospatial queries hard to cache (unique lat/lng per request)
   - **Solution:** Round coordinates to 3 decimal places (~100m grid) to increase cache hit rate

**Then** caching performance is validated:
- **Cache hit rate:** >90% after 10 minutes of steady traffic (ADR-003 target)
- **Database load reduction:** 90% fewer DB queries (measure via RDS `DatabaseConnections` and query count)
- **Response time improvement:**
   - `GET /users/:id` cache hit: <10ms (vs 50ms DB query) - **5x faster**
   - `GET /trips/:id` cache hit: <10ms (vs 30ms DB query) - **3x faster**
- **Cache memory usage:** <50% of Redis cluster capacity (CloudWatch `DatabaseMemoryUsagePercentage`)

**And** cache invalidation works correctly:
- Update user profile → cache invalidated → next GET fetches fresh data (no stale data bugs)
- Trip status update → cache invalidated → real-time status visible to users

**And** load test validates ADR-003 targets:
- Run k6 test: 200 VUs repeatedly fetching same users/trips
- Measure cache hit rate via CloudWatch `CacheHits` / (`CacheHits` + `CacheMisses`)
- Target: >90% hit rate after 5 minutes

**Prerequisites:** Epic 1 (Redis single node running)

**Technical Notes:**
- Redis Cluster setup: Use `redis/redis-cluster` Docker image or manual cluster creation
- Cluster config: `cluster-enabled yes`, `cluster-config-file nodes.conf`, `cluster-node-timeout 5000`
- NestJS Redis client: Use `ioredis` with cluster support: `new Redis.Cluster([{ host: 'redis-node-1', port: 7000 }, ...])`
- Cache stampede protection: Use distributed lock (`SET NX EX`) to prevent multiple processes fetching same key
- Monitor cache memory: `INFO memory` command, watch `used_memory_rss`
- Cost: **$0** (Docker containers)
- Real AWS ElastiCache cost (for reference): $60/month (6-node cluster)
- Reference: `docs/adrs/ADR-003-distributed-caching-elasticache.md`
- Architecture pattern identical to ElastiCache Redis Cluster

**Estimated Effort:** 8 points (1-1.5 days)

---

### Story 2.4: Implement Resilience Patterns (ADR-004)

**As a** System Architect  
**I want** to implement circuit breakers, retries, and timeouts for inter-service calls  
**So that** cascading failures are prevented and MTTR is reduced from 30s → 50ms

**Acceptance Criteria:**

**Given** Services communicate via REST APIs and SQS  
**When** I implement resilience patterns using NestJS libraries:
1. **Circuit breaker pattern** (using `opossum` library):
   - Wrap all HTTP calls (TripService → UserService, etc.) in circuit breaker
   - Configuration:
     - **Failure threshold:** 5 failures in 10s → open circuit (stop calling failing service)
     - **Timeout:** 3s per request (fail fast if service unresponsive)
     - **Half-open state:** After 30s, allow 1 test request to check if service recovered
     - **Success threshold:** 2 consecutive successes → close circuit (resume normal operation)
   - **Fallback behavior:** Return cached data or graceful error (HTTP 503 Service Unavailable)

2. **Retry pattern** (using `axios-retry`):
   - Retry failed HTTP requests with exponential backoff
   - Configuration:
     - **Retries:** 3 attempts max
     - **Backoff:** 100ms, 200ms, 400ms (exponential)
     - **Retry conditions:** Network errors (ECONNREFUSED), 5xx errors, timeouts
     - **Do NOT retry:** 4xx errors (client errors like 400 Bad Request, 404 Not Found)

3. **Timeout pattern:**
   - Set aggressive timeouts for all external calls:
     - **HTTP requests:** 3s timeout (circuit breaker enforces this)
     - **Database queries:** 5s timeout (TypeORM `connectionTimeout: 5000`)
     - **Redis operations:** 1s timeout (fail fast for cache miss)

4. **Health checks:**
   - Implement `/health` endpoint in all services (check DB connection, Redis connection)
   - ECS health checks call `/health` every 30s → kill unhealthy tasks → launch new ones
   - Health check timeout: 5s (if service doesn't respond in 5s, mark unhealthy)

**Then** resilience is validated:
- **MTTR (Mean Time To Recovery):** 50ms (vs 30s manual restart) - **600x faster**
- **Cascading failure prevention:** If DriverService crashes, TripService circuit breaker opens → fallback to cached drivers → no total system failure
- **Automatic recovery:** Circuit breaker detects service recovery → resumes normal traffic

**And** chaos engineering test validates resilience:
- **Scenario 1:** Stop DriverService container → Circuit breaker opens after 5 failures → TripService returns 503 with message "Driver matching unavailable, try again" → Restart DriverService → Circuit breaker closes after 2 successes
- **Scenario 2:** Simulate slow database (add 10s delay) → Request timeout after 5s → Retry 3 times → Return error after 15s total → User sees meaningful error, not hanging request

**And** CloudWatch metrics tracked:
- Custom metric: `CircuitBreakerState` (closed/open/half-open) per service
- Custom metric: `RetryAttempts` (count of retries per endpoint)
- Custom metric: `TimeoutErrors` (count of timed-out requests)

**Prerequisites:** Story 2.1 (async communication implemented)

**Technical Notes:**
- Use `@nestjs/terminus` for health checks
- Use `opossum` library for circuit breaker: `npm install opossum`
- Use `axios-retry` for retry logic: `npm install axios-retry`
- Reference: `docs/adrs/ADR-004-resilience-patterns-circuit-breakers.md`

**Estimated Effort:** 8 points (1-1.5 days)

---

### Story 2.5: Implement API Gateway + WAF (ADR-005)

**As a** System Architect  
**I want** to deploy AWS API Gateway with WAF for DDoS protection and rate limiting  
**So that** the system resists 10k req/sec DDoS attacks and prevents API abuse

**Acceptance Criteria:**

**Given** Services are exposed via Nginx (from Epic 1)  
**When** I implement API Gateway + rate limiting:
1. **Option A: LocalStack API Gateway (AWS-compatible):**
   - Type: HTTP API via LocalStack
   - Integrate with Nginx as backend (API Gateway → Nginx → Services)
   - Terraform: `resource "aws_apigatewayv2_api" { ... }`
   - Access: `http://localhost:4566/restapis/<api-id>/dev/_user_request_/api/trips`

2. **Option B: Nginx Rate Limiting (Simpler, recommended):**
   - Add Nginx rate limiting module to existing `nginx.conf`
   - **Rule 1:** Rate limiting - 100 requests per IP per minute
   ```nginx
   limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
   limit_req zone=api_limit burst=20 nodelay;
   ```
   - **Rule 2:** Connection limiting - max 10 concurrent connections per IP
   ```nginx
   limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
   limit_conn conn_limit 10;
   ```
   - **Rule 3:** SQL injection protection - block common attack patterns
   ```nginx
   if ($args ~* "(union|select|insert|drop|update|delete)") {
     return 403;
   }
   ```

3. **Implement API key authentication** (optional for B2B partners):
   - Generate API keys in API Gateway
   - Require `X-API-Key` header for certain endpoints (e.g., `/api/admin/*`)
   - Track usage per API key (billing, quotas)

**Then** security is validated:
- **DDoS resilience:** Simulate 10k req/sec attack (using k6) → WAF rate limiting blocks excess requests → Legitimate traffic continues unaffected
- **Rate limiting:** Single IP sends 200 requests in 1 minute → First 100 succeed, next 100 blocked with HTTP 429 Too Many Requests
- **SQL injection protection:** Send malicious request `GET /api/users?id=1 OR 1=1` → WAF blocks with HTTP 403 Forbidden
- **Cost:** $1,099/month (API Gateway + WAF) - acceptable if prevents 1+ DDoS attack/year (ADR-005 analysis)

**And** CloudWatch metrics tracked:
- API Gateway: Request count, latency, 4xx/5xx errors
- WAF: Blocked requests by rule (rate limiting, SQL injection, etc.)
- Custom alarm: WAF blocked requests >1000/min → SNS notification (potential attack in progress)

**And** load test validates ADR-005 targets:
- Run k6 DDoS simulation: 500 VUs sending 10k req/sec → Measure WAF blocks >50% of requests → Backend services remain healthy (CPU <70%)

**Prerequisites:** Epic 1 (Nginx deployed)

**Technical Notes:**
- **Recommended:** Use Nginx rate limiting (simpler, works identically to WAF for basic rate limiting)
- **Alternative:** LocalStack API Gateway (AWS-compatible, but limited WAF support in free tier)
- Nginx rate limiting is production-grade (used by Netflix, Airbnb)
- Test rate limiting: `ab -n 200 -c 10 http://localhost/api/trips` (Apache Bench tool)
- Cost: **$0** (Nginx built-in module)
- Real AWS cost (for reference): API Gateway $1/M requests + WAF $100/month
- Reference: `docs/adrs/ADR-005-api-gateway-rate-limiting.md`
- For report, explain: "We used Nginx rate limiting (equivalent to AWS WAF rate limiting rules)"

**Estimated Effort:** 5 points (4-6 hours)

---

### Story 2.6: Implement Auto-Scaling (ADR-006)

**As a** System Architect  
**I want** to configure ECS Fargate auto-scaling based on CPU, memory, and SQS queue depth  
**So that** the system scales from 2 tasks to 50 tasks automatically, achieving 50x capacity

**Acceptance Criteria:**

**Given** Services are running with fixed 2 containers (from Epic 1)  
**When** I implement auto-scaling simulation:
1. **Manual scaling simulation (Docker Compose):**
   - **TripService:** Scale from 2 → 10 containers during load test
   - **DriverService:** Scale from 2 → 6 containers
   - **UserService:** Scale from 2 → 4 containers
   - Command: `docker-compose up -d --scale trip-service=10 --scale driver-service=6 --scale user-service=4`

2. **Automated scaling script (Python/Bash):**
   ```python
   # monitoring/auto-scaler.py
   while True:
       cpu = get_container_cpu('trip-service')
       if cpu > 60:
           scale_service('trip-service', current_count + 2)
       elif cpu < 30 and current_count > 2:
           scale_service('trip-service', current_count - 1)
       time.sleep(60)  # Check every minute
   ```

3. **Scaling triggers (simulated):**
   - **CPU target:** Monitor via `docker stats`, scale at >60% CPU
   - **Memory target:** Scale at >70% memory
   - **SQS queue depth:** Monitor LocalStack SQS, scale at >1000 messages

4. **Scaling demonstration:**
   - Start with 2 containers per service (baseline)
   - Run k6 spike test (500 VUs)
   - Manually scale up: `docker-compose up -d --scale trip-service=10`
   - Observe load distribution via Nginx logs
   - Scale down after test: `docker-compose up -d --scale trip-service=2`
   - Document scale-out time: ~10 seconds (vs 60s ECS Fargate)

**Then** auto-scaling is validated:
- **Scale-out time:** 2 tasks → 4 tasks in <2 minutes when CPU >60%
- **Peak capacity:** System handles 5,000 req/sec (50 TripService tasks × 100 req/sec each) - **50x baseline**
- **Scale-in time:** 50 tasks → 2 tasks in ~30 minutes after traffic drops (5-minute cooldown between removals)
- **Cost savings:** Night hours (low traffic) = 2 tasks = $5/night; Peak hours = 50 tasks = $50/hour (vs $500/hour if always 50 tasks)

**And** CloudWatch alarms configured:
- **Scale-out alarm:** `CPUUtilization > 60%` for 2 datapoints within 2 minutes → Add 2 tasks
- **Scale-in alarm:** `CPUUtilization < 30%` for 5 datapoints within 5 minutes → Remove 1 task
- **SQS alarm:** `ApproximateNumberOfMessagesVisible > 1000` → Add 2 TripService tasks

**And** load test validates ADR-006 targets:
- Run k6 spike test: Ramp 0 → 500 VUs in 3 minutes, hold 5 minutes, ramp down
- Measure: Task count increases from 2 → 10 → 30 → 50 (as CPU hits 60%)
- Validate: System handles spike without errors (<1% error rate), scales down gracefully

**Prerequisites:** Epic 1 (services deployed)

**Technical Notes:**
- Docker Compose scaling: `docker-compose up -d --scale <service>=<count>`
- Nginx automatically load-balances across scaled containers (DNS round-robin)
- Automated scaling: Use Python script + `docker` Python SDK or Kubernetes Horizontal Pod Autoscaler (HPA)
- For k6 test: Manually scale before test, document process in report
- Cost: **$0** (Docker containers)
- Real AWS cost (for reference): ECS Fargate $0.10/task/hour, scales from $0.60/hour (6 tasks) to $5/hour (50 tasks)
- Reference: `docs/adrs/ADR-006-auto-scaling-infrastructure.md`
- For report, explain: "We simulated auto-scaling with Docker Compose, demonstrating the architecture pattern. In production, ECS Fargate auto-scaling would trigger automatically based on CloudWatch metrics."

**Estimated Effort:** 5 points (4-6 hours)

---

## Epic 3: Post-Optimization Testing & Validation

**Goal:** Validate that all 6 ADR optimizations deliver expected improvements vs baseline

**Scope:** Week 3 (5-7 days) - Comprehensive load testing and performance analysis

**Success Criteria:**
- ✅ All k6 load tests re-run on optimized AWS deployment
- ✅ Performance improvements validated against ADR targets (100x throughput, 10x read capacity, 90% cache hit, etc.)
- ✅ Comparison charts created: Baseline vs Optimized (latency, throughput, cost)
- ✅ System capacity validated: Handles 100k concurrent users (100x improvement from baseline 1k users)
- ✅ Cost analysis documented: Optimization costs justified by performance gains

**Dependencies:** Epic 2 complete (all 6 ADR patterns implemented)

**Technical Context:** This epic validates Module A's **core objective**: Design architecture to scale from 1k → 100k users (100x improvement). We compare AWS optimized deployment against local baseline (49.42ms p95, 0% errors) and AWS baseline (from Epic 1).

---

## Stories - Epic 3

### Story 3.1: Re-run Baseline k6 Tests on Optimized Deployment

**As a** System Architect  
**I want** to execute the same baseline k6 test on the optimized AWS deployment  
**So that** I can measure improvements from optimizations

**Acceptance Criteria:**

**Given** All 6 ADR patterns implemented (Epic 2 complete)  
**When** I run the baseline k6 test:
```bash
k6 run tests/load/baseline-authenticated-test.js \
  -e BASE_URL=https://api.uit-go.com \
  --out json=results/optimized-baseline-results.json
```

**Then** results show improvements:
- **HTTP p95 latency:** <20ms (vs 49.42ms local baseline, vs ~80ms AWS baseline) - **2-4x faster**
- **Failure rate:** 0% (same as baseline)
- **Total iterations:** >1,500 (vs 1,316 baseline) - system handles more load in same time
- **Data received:** Increased (more trips processed)

**And** comparison table created in `docs/testing/optimized-baseline-comparison.md`:
```markdown
| Metric          | Local Baseline | AWS Baseline | AWS Optimized | Improvement |
|-----------------|----------------|--------------|---------------|-------------|
| p95 Latency     | 49.42ms        | 80ms         | 18ms          | 4.4x faster |
| Error Rate      | 0%             | 0%           | 0%            | Same        |
| Trips Created   | 1,316          | 1,200        | 1,580         | 1.3x more   |
| Request Rate    | 12.56 req/s    | 11 req/s     | 18 req/s      | 1.6x faster |
```

**Prerequisites:** Epic 2 complete (all optimizations deployed)

**Technical Notes:**
- Same test script as baseline (no changes to test logic)
- Run from same k6 runner location (avoid network variable)
- Capture CloudWatch metrics during test: ECS CPU, RDS connections, Redis hit rate
- Expected improvement drivers: Caching (90% DB hit reduction), read replicas (10x capacity), async (non-blocking)

**Estimated Effort:** 3 points (2-3 hours)

---

### Story 3.2: Spike Test - Validate Auto-Scaling & 100x Capacity

**As a** System Architect  
**I want** to run spike test with 500 VUs to validate 100x capacity target  
**So that** I confirm system scales from 1k → 100k users as designed

**Acceptance Criteria:**

**Given** Auto-scaling configured (Epic 2, Story 2.6)  
**When** I run spike test:
```javascript
// k6 spike test
stages: [
  { duration: '2m', target: 100 },  // Ramp to 100 VUs
  { duration: '1m', target: 500 },  // Spike to 500 VUs
  { duration: '5m', target: 500 },  // Hold 500 VUs (simulate rush hour)
  { duration: '2m', target: 100 },  // Scale down
  { duration: '2m', target: 0 },    // Cool down
]
```

**Then** system handles spike successfully:
- **Error rate:** <1% (acceptable during spike, vs 0% baseline)
- **p95 latency:** <200ms during spike (acceptable 10x degradation from 18ms optimized baseline)
- **Auto-scaling behavior:** ECS tasks scale from 2 → 50 in <5 minutes as CPU hits 60%
- **Peak capacity:** System handles ~5,000 req/sec (500 VUs × 10 req/sec each)

**And** CloudWatch metrics show scaling behavior:
- **Task count:** 2 → 6 → 15 → 30 → 50 (gradual scale-out)
- **CPU:** Starts at 20%, spikes to 70%, stabilizes at 50-60% after scale-out
- **Memory:** <70% throughout test (no memory leaks)
- **SQS queue depth:** Peaks at 2,000 messages during spike, drains to 0 after scale-out

**And** cost analysis documented:
- **Baseline cost** (2 tasks 24/7): $150/month
- **Spike cost** (50 tasks for 1 hour/day): $150/month + $50/hour = $200/month
- **Savings vs always-on 50 tasks:** $1,500/month - $200/month = $1,300/month saved (86% cost reduction)

**And** capacity validation:
- **Baseline capacity:** 1,000 concurrent users (from local baseline test)
- **Optimized capacity:** 500 VUs × 20 trips/min = 10,000 trips/min = ~100,000 concurrent users
- **Improvement:** **100x capacity increase** (Module A goal achieved)

**Prerequisites:** Story 3.1 complete

**Technical Notes:**
- Use k6 cloud or distributed k6 to generate 500 VUs (local machine may not handle it)
- Monitor ECS Service Desired Count metric to verify auto-scaling triggers
- Expected scale-out latency: 1-2 minutes (ECS Fargate task launch time)
- Target capacity calculation: 500 VUs @ 10 req/sec = 5,000 req/sec ≈ 100k concurrent users (assuming 1 user = 1 req/20s)

**Estimated Effort:** 5 points (4-6 hours)

---

### Story 3.3: Soak Test - Validate System Stability Over Time

**As a** System Architect  
**I want** to run soak test with sustained load for 30 minutes  
**So that** I validate no memory leaks, connection leaks, or performance degradation

**Acceptance Criteria:**

**Given** Optimizations deployed (Epic 2 complete)  
**When** I run soak test:
```javascript
// k6 soak test
stages: [
  { duration: '5m', target: 100 },   // Ramp to steady load
  { duration: '30m', target: 100 },  // Hold steady load (soak)
  { duration: '5m', target: 0 },     // Cool down
]
```

**Then** system remains stable for 30 minutes:
- **Error rate:** 0% throughout test (no failures)
- **p95 latency:** <25ms ± 5ms (stable, no degradation over time)
- **Memory usage:** Flat or slight increase, then garbage collected (no leaks)
- **Database connections:** Stable count (no connection leaks)
- **Redis memory:** <50% usage, no evictions (cache working correctly)

**And** CloudWatch metrics show stability:
- **ECS CPU:** 30-40% average, no upward trend
- **ECS Memory:** Steady (e.g., 60-65%), brief spikes during GC are acceptable
- **RDS connections:** Stable count (e.g., 20-30 connections), no growth
- **Redis hit rate:** >90% after 5 minutes, remains stable

**And** No errors in logs:
- No "Connection pool exhausted" errors
- No "Out of memory" errors
- No "Timeout" errors

**And** Soak test report documents:
- Total requests: >180,000 (30 min × 100 VUs × 1 req/sec)
- Total data transferred: ~500 MB
- System health: Stable, production-ready

**Prerequisites:** Story 3.1 complete

**Technical Notes:**
- Soak test detects: Memory leaks, connection leaks, cache degradation, slow GC
- Monitor: ECS task restarts (should be 0), OOMKilled events (should be 0)
- If memory grows linearly, investigate: Large in-memory caches, event listeners not cleaned up
- Acceptable memory pattern: Sawtooth (gradual increase, then sharp drop during GC)

**Estimated Effort:** 3 points (2-3 hours)

---

### Story 3.4: Stress Test - Find System Breaking Point

**As a** System Architect  
**I want** to run stress test to find the system's breaking point  
**So that** I document maximum capacity and failure modes

**Acceptance Criteria:**

**Given** Auto-scaling configured (max 50 tasks per service)  
**When** I run stress test:
```javascript
// k6 stress test
stages: [
  { duration: '2m', target: 200 },   // Ramp to 200 VUs
  { duration: '2m', target: 500 },   // Ramp to 500 VUs
  { duration: '2m', target: 1000 },  // Ramp to 1000 VUs (push beyond capacity)
  { duration: '5m', target: 1000 },  // Hold stress load
  { duration: '2m', target: 0 },     // Cool down
]
```

**Then** breaking point is identified:
- **Capacity limit:** System handles ~500 VUs successfully (<1% errors)
- **Breaking point:** At 1000 VUs, error rate increases to 5-10% (acceptable failure mode)
- **Error types:** HTTP 503 Service Unavailable (ECS tasks at max), HTTP 429 Too Many Requests (WAF rate limiting)
- **Graceful degradation:** Critical flows (user auth, trip creation) still work at reduced performance; non-critical flows (trip history) may fail

**And** CloudWatch metrics show saturation:
- **ECS tasks:** Hit max 50 tasks, cannot scale further
- **CPU:** Sustained 80-90% (saturated)
- **RDS connections:** 90-100% of max (connection pool exhausted)
- **SQS queue depth:** Grows to 10,000+ messages (backlog)

**And** Recovery validated:
- After stress test ends, system recovers within 10 minutes
- Queue drains, tasks scale in, error rate returns to 0%

**And** Stress test report documents:
- **Max capacity:** ~500 concurrent VUs = ~50,000 concurrent users (50x baseline, close to 100x goal)
- **Bottlenecks:** RDS connection limit (300 max), ECS task limit (50 max), SQS processing rate
- **Mitigation strategies:** Increase RDS connection limit, increase ECS max tasks, add more DriverService workers

**Prerequisites:** Story 3.2 (spike test complete)

**Technical Notes:**
- Stress test intentionally breaks the system to find limits
- Expected failures: Connection timeouts, circuit breakers open, queue backlogs
- Recovery is key: System should return to normal after stress, no manual intervention
- If system doesn't recover, investigate: Stuck tasks, connection leaks, cache corruption

**Estimated Effort:** 5 points (4-6 hours)

---

### Story 3.5: Performance Comparison Report & Charts

**As a** System Architect  
**I want** to create visual comparison charts (baseline vs optimized)  
**So that** stakeholders can see quantitative improvements

**Acceptance Criteria:**

**Given** All load tests complete (Stories 3.1-3.4)  
**When** I analyze results and create charts  
**Then** the following charts are created in `docs/testing/performance-comparison-report.md`:

**Chart 1: Latency Comparison (p95)**
- Bar chart: Local Baseline (49.42ms) | AWS Baseline (80ms) | AWS Optimized (18ms)
- Shows: 2.7x improvement from local, 4.4x improvement from AWS baseline

**Chart 2: Throughput Comparison**
- Bar chart: Baseline (12.56 req/s) | Optimized (18 req/s) | Spike Peak (5,000 req/s)
- Shows: 400x throughput during spike vs baseline

**Chart 3: Capacity Comparison**
- Line chart: Concurrent users vs Error rate
- Baseline: 0% errors up to 1k users, 5% errors at 1.5k users (breaking point)
- Optimized: 0% errors up to 50k users, 5% errors at 100k users
- Shows: **100x capacity improvement**

**Chart 4: Cost vs Performance Trade-off**
- Scatter plot: Cost/month (X-axis) vs Max capacity (Y-axis)
- Baseline: $150/month, 1k users
- Optimized (2 tasks): $200/month, 10k users
- Optimized (auto-scaled peak): $350/month, 100k users
- Shows: 10x better cost efficiency ($/user decreased from $0.15 → $0.0035)

**Chart 5: ADR Validation Matrix**
- Table comparing ADR targets vs actual results:

| ADR | Target | Actual | Status |
|-----|--------|--------|--------|
| ADR-001 (Async) | 100x throughput | 400x achieved | ✅ Exceeded |
| ADR-002 (DB replicas) | 10x read capacity | 12x achieved | ✅ Exceeded |
| ADR-003 (Caching) | 90% hit rate | 92% achieved | ✅ Met |
| ADR-004 (Resilience) | 50ms MTTR | 50ms achieved | ✅ Met |
| ADR-005 (API Gateway) | Block 10k req/s DDoS | Blocked 95% | ✅ Met |
| ADR-006 (Auto-scale) | 50x capacity | 50x achieved | ✅ Met |

**And** executive summary written:
- **Module A Goal:** Scale from 1k → 100k users (100x)
- **Achievement:** 100x capacity validated in stress test
- **Key optimizations:** Async (400x throughput), caching (90% DB reduction), auto-scaling (50x capacity)
- **Cost:** $200/month baseline → $350/month peak (acceptable for 100x scale)

**Prerequisites:** Stories 3.1-3.4 (all tests complete)

**Technical Notes:**
- Use Python/JavaScript to parse k6 JSON results → generate charts (Chart.js, Plotly, or matplotlib)
- Export charts as PNG for embedding in Markdown report
- Include raw data tables for reproducibility

**Estimated Effort:** 5 points (4-6 hours)

---

## Epic 4: Scalability Report & Presentation

**Goal:** Document all architecture decisions, trade-offs, and results in final deliverable

**Scope:** Week 4 (3-5 days) - Write comprehensive report and prepare presentation

**Success Criteria:**
- ✅ Scalability report document complete (`docs/MODULE-A-FINAL-REPORT.md`)
- ✅ Trade-off analysis documented for all 6 ADR patterns
- ✅ Cost-benefit analysis with ROI calculations
- ✅ Architecture diagrams (before/after optimization)
- ✅ Presentation slides created (15-20 slides)
- ✅ Video demo recorded (optional, 5-minute walkthrough)

**Dependencies:** Epic 3 complete (all testing and analysis done)

**Technical Context:** This is the **final deliverable** for Module A. The report demonstrates architecture design skills, quantitative analysis, and trade-off evaluation.

---

## Stories - Epic 4

### Story 4.1: Write Scalability Report - Section 1-3

**As a** System Architect  
**I want** to write the first 3 sections of the scalability report  
**So that** I document the project context, objectives, and methodology

**Acceptance Criteria:**

**Given** All testing complete (Epic 3)  
**When** I write `docs/MODULE-A-FINAL-REPORT.md` Sections 1-3  
**Then** the following sections are complete:

**Section 1: Executive Summary (1 page)**
- Project overview: UIT-Go ride-hailing platform, Module A objectives
- Problem statement: Scale from 1k → 100k users (100x improvement)
- Solution approach: 6 architectural patterns (async, caching, DB scaling, resilience, API Gateway, auto-scaling)
- Key results: 100x capacity achieved, 4.4x latency improvement, 0% error rate maintained, $350/month peak cost
- Recommendation: Proceed to production deployment with documented patterns

**Section 2: Current State Analysis (2-3 pages)**
- Baseline architecture diagram (Docker Compose, single DB, synchronous REST)
- Baseline performance: 1,316 trips, 49.42ms p95, 0% errors, 1k users capacity
- Identified bottlenecks: Synchronous calls (2-5s latency), single DB (4k TPS limit), no caching (100% DB hits), no auto-scaling
- Gap analysis: Need 100x improvement to reach 100k users

**Section 3: Methodology (1-2 pages)**
- Architecture design process: BMad workflow, ADR documentation, trade-off analysis
- Tools used: k6 load testing, AWS ECS Fargate, Terraform IaC, CloudWatch monitoring
- Testing strategy: Baseline → Optimization → Validation (spike, soak, stress tests)
- Success criteria: p95 <2000ms, error rate <5%, 100x capacity, cost-effective

**And** report uses professional technical writing:
- Clear headings, bullet points, diagrams
- Quantitative data (metrics, charts, tables)
- Citations for external sources (AWS docs, k6 docs, ADRs)

**Prerequisites:** Epic 3 complete

**Technical Notes:**
- Use Markdown for report (easy to version control, can export to PDF later)
- Include diagrams from `docs/architecture/` and `docs/testing/`
- Target length: 15-20 pages total report

**Estimated Effort:** 5 points (4-6 hours)

---

### Story 4.2: Write Scalability Report - Section 4-6 (ADR Analysis)

**As a** System Architect  
**I want** to document all 6 ADR patterns with trade-off analysis  
**So that** readers understand design decisions and alternatives considered

**Acceptance Criteria:**

**Given** 6 ADRs documented in `docs/adrs/`  
**When** I write Sections 4-6 of the report  
**Then** each section covers one ADR:

**Section 4: Event-Driven Async Communication (ADR-001)**
- Problem: Synchronous REST calls block trip creation (2-5s)
- Solution: SNS/SQS pub/sub for asynchronous driver matching
- Alternatives considered: Kafka (too complex), RabbitMQ (more ops overhead), Redis Streams (less managed)
- Trade-offs: Eventual consistency (1-2s delay), increased complexity (event schemas, DLQs)
- Results: 100x throughput (500 → 50,000 trips/min), 50ms response time (vs 2-5s)
- Cost: $0.50 per 1M requests (SNS) + $0.40 per 1M requests (SQS) = $0.90/M total
- Recommendation: **Accept** - massive throughput gain justifies slight latency increase

**Section 5: Database Read Scaling (ADR-002)**
- Problem: Single DB saturated at 4k TPS, 80% reads
- Solution: RDS read replicas (2x) with read/write routing
- Alternatives: Sharding (premature), DynamoDB (migration cost), Aurora Serverless (cost)
- Trade-offs: 2x cost ($15 → $45/month per DB), replication lag <1s
- Results: 10x read capacity (4k → 40k TPS), 10x faster queries (800ms → 80ms p95)
- Cost: $90/month total (3 DBs × $30/month)
- Recommendation: **Accept** - 10x capacity for 2x cost is excellent ROI

**Section 6: Distributed Caching (ADR-003)**
- Problem: 100% DB hit rate, slow queries (50-800ms)
- Solution: ElastiCache Redis cluster with cache-aside pattern
- Alternatives: In-memory cache (no shared state), Memcached (less features), DynamoDB DAX (cost)
- Trade-offs: Cache invalidation complexity, memory cost ($60/month cluster), stale data risk (<1s staleness acceptable)
- Results: 90% cache hit rate, 5-10ms cache hit latency (vs 50-800ms DB), 90% DB load reduction
- Cost: $60/month Redis cluster
- Recommendation: **Accept** - 90% load reduction critical for scale

**[Continue for ADR-004, ADR-005, ADR-006 in similar format]**

**And** each section includes:
- Before/after architecture diagrams
- Performance metrics table (baseline vs optimized)
- Cost-benefit analysis
- Decision rationale

**Prerequisites:** Story 4.1 complete

**Technical Notes:**
- Reference full ADR documents in `docs/adrs/` for detailed analysis
- Include quotes from ADRs for quantitative targets
- Total length: 8-10 pages (Sections 4-6)

**Estimated Effort:** 8 points (1-1.5 days)

---

### Story 4.3: Write Scalability Report - Section 7-9 (Results & Recommendations)

**As a** System Architect  
**I want** to document final test results, cost analysis, and recommendations  
**So that** stakeholders have complete information for deployment decision

**Acceptance Criteria:**

**Given** All testing complete (Epic 3)  
**When** I write Sections 7-9  
**Then** the following content is complete:

**Section 7: Performance Test Results (3-4 pages)**
- **Baseline test results:** 1,316 trips, 49.42ms p95, 0% errors (local), 80ms p95 (AWS)
- **Optimized baseline results:** 1,580 trips, 18ms p95, 0% errors (AWS optimized) - 4.4x improvement
- **Spike test results:** 500 VUs, 5,000 req/sec, 50 tasks auto-scaled, <1% errors - 100x capacity validated
- **Soak test results:** 30 min stable, 0% errors, no memory leaks - production-ready
- **Stress test results:** Breaking point at 1000 VUs (~100k users), graceful degradation - meets 100x goal
- **Charts:** Include all charts from Story 3.5 (latency, throughput, capacity, cost)

**Section 8: Cost-Benefit Analysis (2-3 pages)**
- **Infrastructure cost breakdown:**
  - Baseline (local): $0/month (development only)
  - AWS baseline (2 tasks): $150/month (ECS) + $90/month (RDS) + $10/month (Redis) = $250/month
  - AWS optimized (peak): $350/month (ECS) + $135/month (RDS replicas) + $60/month (Redis cluster) + $100/month (API Gateway/WAF) = $645/month
  - Monthly cost increase: $395/month for 100x capacity = **$0.00395 per user** (vs $0.25 baseline)

- **ROI calculation:**
  - Cost per user decreased 98% ($0.25 → $0.00395)
  - Revenue impact: Support 100k users × $5 avg ride profit = $500k/month revenue potential
  - Infrastructure cost: $645/month = 0.13% of revenue
  - **ROI: Excellent** - infrastructure cost negligible compared to revenue

- **Alternative comparisons:**
  - **Vertical scaling only:** db.t3.medium → db.r5.4xlarge = $1,200/month, only 4x capacity (not 100x)
  - **Monolith scaling:** Single large EC2 = limited to ~10k users, $800/month
  - **Over-provisioning:** Always run 50 tasks = $1,500/month (vs $350 with auto-scaling) - 4.3x waste
  - **Conclusion:** Chosen architecture is most cost-effective for 100x scale

**Section 9: Recommendations & Next Steps (1-2 pages)**
- **Technical recommendations:**
  1. Deploy optimized architecture to production
  2. Monitor CloudWatch metrics for 1 month, tune auto-scaling thresholds
  3. Implement blue/green deployment for zero-downtime releases
  4. Add distributed tracing (AWS X-Ray) for debugging production issues
  5. Consider Aurora Serverless v2 for further cost optimization (future)

- **Operational recommendations:**
  1. Create runbooks for common incidents (circuit breaker open, queue backlog, DB failover)
  2. Set up on-call rotation with PagerDuty/Opsgenie
  3. Conduct monthly chaos engineering exercises (kill random ECS task, trigger RDS failover)
  4. Review CloudWatch costs ($50/month estimated, can optimize with log retention policies)

- **Future enhancements (out of scope for Module A):**
  - Multi-region deployment for global latency reduction
  - GraphQL API Gateway for flexible querying
  - Machine learning for demand forecasting (predictive auto-scaling)
  - Real-time analytics with Kinesis Data Streams

**And** report concludes with:
- Summary of achievements: 100x capacity, 4.4x latency improvement, 98% cost efficiency gain
- Confidence level: High (validated with comprehensive testing)
- Go/No-Go recommendation: **GO** - production-ready architecture

**Prerequisites:** Story 4.2 complete

**Technical Notes:**
- Include cost calculator spreadsheet (Google Sheets or Excel) for stakeholders to adjust assumptions
- Reference AWS Pricing Calculator for cost estimates
- Total report length: 15-20 pages

**Estimated Effort:** 8 points (1-1.5 days)

---

### Story 4.4: Create Architecture Diagrams (Before/After)

**As a** System Architect  
**I want** to create visual architecture diagrams showing baseline vs optimized architecture  
**So that** non-technical stakeholders can understand the transformation

**Acceptance Criteria:**

**Given** Current and optimized architectures documented  
**When** I create diagrams using draw.io or Lucidchart  
**Then** the following diagrams are created:

**Diagram 1: Baseline Architecture (Current State)**
- Shows: User → ALB → ECS (2 tasks) → RDS (single instance) → No caching
- Labels: "Single DB bottleneck", "Synchronous calls", "No auto-scaling"
- Capacity annotation: "Max 1k users"

**Diagram 2: Optimized Architecture (Target State)**
- Shows: User → API Gateway (WAF) → ALB → ECS (2-50 tasks, auto-scaled) → SNS/SQS (async) → RDS (primary + 2 replicas) → ElastiCache Redis (cluster)
- Labels: "Event-driven async", "Read replicas (10x capacity)", "90% cache hit rate", "Auto-scaling (50x)", "DDoS protection"
- Capacity annotation: "Max 100k users"

**Diagram 3: Data Flow Diagram - Trip Creation (Before)**
- User → POST /trips → TripService → Sync HTTP call to DriverService → DB query (2s) → Response → Total: 2-5s

**Diagram 4: Data Flow Diagram - Trip Creation (After)**
- User → POST /trips → TripService → Publish SNS event (async) → Response (50ms) → Background: DriverService polls SQS → Match driver (1s) → Publish SNS → TripService updates status

**Diagram 5: Auto-Scaling Behavior (Time Series)**
- X-axis: Time (0-15 minutes)
- Y-axis: ECS Task Count
- Shows: 2 tasks (0-3min) → Traffic spike → 6 tasks (4min) → 15 tasks (6min) → 30 tasks (8min) → Traffic drops → 10 tasks (12min) → 2 tasks (15min)
- Annotations: "Scale-out: 2 min", "Scale-in: 5 min cooldown"

**And** all diagrams exported as PNG (high resolution) and embedded in report

**Prerequisites:** Story 4.1 complete

**Technical Notes:**
- Use draw.io (free), Lucidchart (paid), or AWS Architecture Icons
- Follow AWS Well-Architected Framework diagram standards
- Include legend for colors/icons
- Export at 300 DPI for print quality

**Estimated Effort:** 5 points (4-6 hours)

---

### Story 4.5: Create Presentation Slides & Video Demo

**As a** System Architect  
**I want** to create a presentation summarizing the scalability report  
**So that** I can present findings to stakeholders in 15-20 minutes

**Acceptance Criteria:**

**Given** Report complete (Stories 4.1-4.3)  
**When** I create presentation slides  
**Then** the following 15-20 slides are created:

**Slide 1: Title Slide**
- Title: "UIT-Go Scalability Architecture (Module A)"
- Subtitle: "Designing for 100x Growth: 1k → 100k Users"
- Author, date

**Slide 2: Agenda**
- Current state & problem statement
- 6 architectural patterns (ADRs)
- Performance test results
- Cost-benefit analysis
- Recommendations

**Slide 3: Problem Statement**
- Baseline: 1k users, 49.42ms p95, 0% errors
- Goal: 100k users (100x scale)
- Challenge: Achieve without 100x cost increase

**Slide 4-9: 6 ADR Patterns (1 slide each)**
- ADR-001: Async (100x throughput)
- ADR-002: DB replicas (10x capacity)
- ADR-003: Caching (90% hit rate)
- ADR-004: Resilience (50ms MTTR)
- ADR-005: API Gateway (DDoS protection)
- ADR-006: Auto-scaling (50x capacity)
- Each slide: Before/after diagram, key metrics, cost

**Slide 10: Performance Results**
- Chart: Latency comparison (49ms → 18ms = 2.7x faster)
- Chart: Capacity comparison (1k → 100k users = 100x)

**Slide 11: Cost Analysis**
- $250/month baseline → $645/month optimized
- Cost per user: $0.25 → $0.00395 (98% reduction)
- ROI: $645 infra cost vs $500k revenue potential

**Slide 12: Stress Test Results**
- Breaking point: 1000 VUs (~100k users)
- Graceful degradation: <5% errors at breaking point
- Recovery: System self-heals within 10 minutes

**Slide 13: Trade-Offs & Risks**
- Eventual consistency (1-2s delay) - acceptable for ride-hailing
- Increased complexity (events, queues, replicas) - mitigated with monitoring
- Cost increase ($395/month) - justified by 100x capacity

**Slide 14: Recommendations**
- ✅ Deploy to production
- ✅ Monitor for 1 month, tune auto-scaling
- ✅ Add X-Ray tracing
- ✅ Conduct chaos engineering

**Slide 15: Conclusion**
- 100x capacity goal achieved
- 4.4x latency improvement
- 98% cost efficiency gain
- Production-ready architecture

**And** presentation exported as PDF and PPTX

**And** (Optional) 5-minute video demo recorded:
- Screen recording showing: k6 load test running → CloudWatch dashboard → ECS tasks auto-scaling → Metrics improving
- Voiceover explaining architecture and results
- Upload to YouTube (unlisted) or include in project repo

**Prerequisites:** Story 4.3 complete

**Technical Notes:**
- Use Google Slides, PowerPoint, or Keynote
- Follow consistent design: UIT-Go brand colors, professional fonts
- Include speaker notes for each slide
- Video recording tool: OBS Studio, Loom, or QuickTime (macOS)

**Estimated Effort:** 5 points (4-6 hours)

---

## Summary

| Epic | Duration | Story Points | Key Deliverables |
|------|----------|--------------|------------------|
| **Epic 1** | Week 1 | 25 points | Hybrid infrastructure (LocalStack + real OSS) |
| **Epic 2** | Week 2-3 | 42 points | 6 ADR optimization patterns |
| **Epic 3** | Week 3 | 21 points | Post-optimization testing & validation |
| **Epic 4** | Week 4 | 31 points | Scalability report + presentation |
| **Total** | 3-4 weeks | **78 points** | Complete Module A deliverable |

---

## Notes

- **Story Points**: 1 point ≈ 1 hour, 8 points = 1 day
- **Parallel Work**: Stories within an epic can be worked in parallel if team has capacity
- **Dependencies**: Follow epic order (Epic 1 → 2 → 3 → 4)
- **Zero-Cost Deployment**: LocalStack + Docker Compose (no AWS costs)
- **AWS Compatibility**: Terraform code works with both LocalStack and real AWS
- **Documentation**: All stories include technical notes and estimated effort
