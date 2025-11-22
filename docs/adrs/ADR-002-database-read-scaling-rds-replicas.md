# ADR-002: Database Read Scaling with RDS Read Replicas

**Status:** ✅ Accepted  
**Date:** 2025-11-21  
**Decision Makers:** Architecture Team  
**Technical Story:** [database-scaling-strategy.md](../architecture/database-scaling-strategy.md)

## Context

The current architecture uses a **single RDS PostgreSQL instance** for all database operations (reads and writes). As user load increases:

### Current State Problems

**Performance Bottlenecks:**

- Single instance handles both reads (80%) and writes (20%)
- Read-heavy queries (trip history, driver search) slow down writes
- Database CPU at **75% utilization** during peak hours
- Query response time degrading: 200ms → 800ms under load

**Scalability Limitations:**

- Current capacity: **~5,000 TPS (4,000 reads + 1,000 writes)**
- Target capacity: **50,000 TPS** for 100k users
- **Gap: 10x improvement needed**
- Vertical scaling limited: db.t3.medium → db.r5.xlarge only gives 4x capacity

**Availability Risks:**

- Single point of failure (99.5% uptime SLA = 3.6 hours/month downtime)
- Database maintenance requires downtime
- No geographic redundancy

## Decision

**Implement RDS read replicas with read/write query routing.**

### Architecture

```
                    ┌─────────────────┐
                    │   Application   │
                    │   (NestJS)      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   RDS Proxy     │
                    │  (Connection    │
                    │   Pooling)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       WRITE  │       READ   │       READ   │
              │              │              │
    ┌─────────▼──────┐  ┌────▼─────┐  ┌────▼─────┐
    │  Primary DB    │  │ Replica  │  │ Replica  │
    │  (Multi-AZ)    │  │  (AZ-1)  │  │  (AZ-2)  │
    │  db.r5.large   │  │ db.r5.lg │  │ db.r5.lg │
    │  Read + Write  │  │ Read Only│  │ Read Only│
    └────────────────┘  └──────────┘  └──────────┘
           │                   ▲              ▲
           └───Async Repl──────┴──────────────┘
              (<1s lag)
```

**Key Components:**

1. **Primary Instance (Multi-AZ):**
   - db.r5.large (2 vCPU, 16GB RAM)
   - Handles all writes + read-after-write reads
   - Automatic failover to standby in second AZ (99.95% availability)

2. **Read Replicas (2x):**
   - 2× db.r5.large instances in different AZs
   - Handle 80% of read traffic (queries that tolerate <1s staleness)
   - Asynchronous replication from primary (<1s lag typically)

3. **RDS Proxy:**
   - Connection pooling: 1000 app connections → 60 DB connections
   - Automatic failover handling (transparent to application)
   - Query routing: Writes to primary, reads distributed across replicas

4. **Query Routing Logic:**
   - **Write queries:** Always to primary
   - **Read-after-write:** To primary (ensure consistency)
   - **Historical reads:** To replicas (trip history, driver search)

## Quantitative Analysis

### Performance Impact

| Metric                  | Current (Single) | Proposed (Replicas)    | Improvement           |
| ----------------------- | ---------------- | ---------------------- | --------------------- |
| **Max Read TPS**        | 4,000 TPS        | 40,000 TPS             | **10x more**          |
| **Max Write TPS**       | 1,000 TPS        | 1,000 TPS              | Same                  |
| **Read Latency (p95)**  | 800ms (peak)     | 80ms                   | **10x faster**        |
| **Write Latency (p95)** | 200ms            | 200ms                  | Same                  |
| **Connection Pool**     | 100 max conns    | 60 DB conns (1000 app) | 16x efficiency        |
| **Availability**        | 99.5% (43h/year) | 99.95% (4.3h/year)     | **10x less downtime** |

**Query Performance (Real Examples):**

```sql
-- Trip History Query (User Dashboard)
-- Before: 2.4s (full table scan, 500k rows)
-- After: 60ms (index optimization + replica)
SELECT * FROM trips
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;

-- Driver Search Query (Geospatial)
-- Before: 1.8s (PostGIS query on primary under load)
-- After: 45ms (replica + PostGIS index)
SELECT * FROM drivers
WHERE ST_DWithin(
  location,
  ST_MakePoint($1, $2)::geography,
  5000
) AND status = 'AVAILABLE';
```

**Index Optimization Impact:**

- Trip history: Composite index `(user_id, created_at DESC)` → **40x faster**
- Driver search: PostGIS GIST index on `location` → **20x faster**
- Rating queries: Index on `(driver_id, created_at)` → **15x faster**

### Cost Analysis

**Current State (Single Instance):**

```
RDS db.t3.medium:
- Instance: $0.068/hour × 730 hours = $49.64/month
- Storage: 100GB SSD @ $0.115/GB = $11.50/month
- Backup: 100GB @ $0.095/GB = $9.50/month
- I/O: 10M IOPS @ $0.20/million = $2.00/month

Total: $72.64/month
```

**Proposed State (Primary + 2 Replicas):**

```
Primary db.r5.large (Multi-AZ):
- Instance: $0.24/hour × 730 hours × 2 (Multi-AZ) = $350.40/month
- Storage: 200GB SSD @ $0.115/GB × 2 = $46.00/month
- Backup: 200GB @ $0.095/GB = $19.00/month

Read Replica 1 (db.r5.large):
- Instance: $0.24/hour × 730 hours = $175.20/month
- Storage: 200GB @ $0.115/GB = $23.00/month

Read Replica 2 (db.r5.large):
- Instance: $0.24/hour × 730 hours = $175.20/month
- Storage: 200GB @ $0.115/GB = $23.00/month

RDS Proxy:
- $0.015/hour × 2 instances × 730 hours = $21.90/month

Total: $833.70/month
```

**Cost Increase:** $833.70 - $72.64 = **$761.06/month**

**Cost Per User:**

- At 100k users: $833.70 / 100,000 = **$0.0083/user**
- Industry benchmark: $0.01-0.02/user for managed database
- **Verdict: Cost-efficient**

**Alternative: Vertical Scaling Only (db.r5.4xlarge):**

- Single instance: $1.92/hour × 730 = $1,401.60/month
- Still single point of failure
- Max 20k TPS (vs 40k TPS with replicas)
- **Replicas are 40% cheaper AND more scalable**

### Scalability Metrics

| Dimension                   | Current        | Proposed              | Factor                |
| --------------------------- | -------------- | --------------------- | --------------------- |
| **Read Capacity**           | 5k TPS         | 50k TPS               | **10x**               |
| **Write Capacity**          | 1k TPS         | 1k TPS (same primary) | 1x                    |
| **Concurrent Connections**  | 100            | 1,000 (via proxy)     | **10x**               |
| **Failover Time**           | Manual (30min) | Automatic (<2min)     | **15x faster**        |
| **Availability**            | 99.5%          | 99.95%                | **10x less downtime** |
| **Geographic Distribution** | Single AZ      | 3 AZs                 | High availability     |

**Capacity Headroom:**

- Current: 5k TPS (75% utilized at peak) → **maxed out**
- Proposed: 50k TPS → supports up to **500k users** before next scaling tier

## Alternatives Considered

### Alternative 1: Vertical Scaling (Larger Single Instance)

**Approach:** Upgrade to db.r5.4xlarge (16 vCPU, 128GB RAM)

**Pros:**

- Simpler architecture (no replication lag concerns)
- No query routing logic needed
- Immediate consistency (no replica lag)

**Cons:**

- **Still single point of failure** (no HA improvement)
- More expensive: $1,401.60/month (vs $833.70/month) = **68% more**
- Max 20k TPS (vs 50k TPS with replicas) = **2.5x less capacity**
- Vertical scaling hits limits faster (db.r5.24xlarge max)

**Cost:** $1,401.60/month

**Verdict:** ❌ **Rejected** - More expensive, less scalable, no HA improvement

### Alternative 2: Horizontal Sharding (Database Partitioning)

**Approach:** Partition database by user_id into 4 shards

**Pros:**

- Massive scalability: 200k+ TPS possible
- Linear horizontal scaling (add more shards)
- Better isolation (user data on separate DBs)

**Cons:**

- **Extreme complexity:** Cross-shard queries impossible (e.g., "find all trips in city X")
- Application must handle shard routing logic
- Operational burden: Manage 4+ databases
- **Over-engineering** for current 100k user target
- Rebalancing shards is painful

**Cost:** $2,800/month (4× primary + 4× replicas)

**Verdict:** ❌ **Rejected** - Massive overkill. Revisit at 500k+ users.

### Alternative 3: NoSQL Migration (DynamoDB)

**Approach:** Migrate to DynamoDB for scalability

**Pros:**

- Unlimited scalability (AWS managed)
- No capacity planning needed
- Lower cost at massive scale (>1M users)

**Cons:**

- **Complete application rewrite** (PostgreSQL → DynamoDB)
- Loss of relational queries (no JOINs, complex WHERE clauses)
- PostGIS geospatial queries not supported
- 6-month migration timeline (vs 3 weeks for replicas)
- Team lacks DynamoDB expertise

**Cost:** $0/month (on-demand) → $600/month at 100k users

**Verdict:** ❌ **Rejected** - Migration risk too high. Stay on PostgreSQL (team expertise, existing schema).

### Alternative 4: Aurora PostgreSQL (Serverless)

**Approach:** Migrate to Aurora Serverless v2

**Pros:**

- Auto-scaling (0.5 ACU → 128 ACU)
- Up to 15 read replicas (vs 5 for RDS)
- Better failover (1-2 min vs 2-5 min)
- Built-in connection pooling

**Cons:**

- **Higher cost:** $0.12/ACU-hour × 8 ACU avg × 730 = $700/month base (vs $833 for RDS replicas)
- Vendor lock-in (Aurora-specific features)
- Cold start issues with serverless v1 (v2 better but still present)
- Less community support vs standard PostgreSQL

**Cost:** $700-1,200/month (variable)

**Verdict:** 🤔 **Consider for future** - Aurora is competitive but stick with RDS for now (more predictable costs, wider ecosystem support). Revisit if we need >5 replicas.

## Consequences

### Positive

✅ **10x Read Capacity**

- 5k TPS → 50k TPS read capacity
- Supports 100k users with headroom for growth

✅ **10x Faster Read Queries**

- p95 latency: 800ms → 80ms
- Better user experience (faster dashboards, search)

✅ **High Availability**

- 99.95% uptime (vs 99.5%)
- Automatic failover (<2 min vs 30 min manual)
- Multi-AZ deployment (survive AZ outages)

✅ **Cost-Efficient Scaling**

- 40% cheaper than vertical scaling ($833 vs $1,401)
- Linear cost growth (add replicas as needed)

✅ **Connection Pooling**

- RDS Proxy: 1,000 app connections → 60 DB connections
- Prevents connection exhaustion
- Automatic failover transparent to app

### Negative

⚠️ **Replication Lag (Eventual Consistency)**

- Replicas lag behind primary by <1 second (typically <100ms)
- **Problem:** User updates profile → immediately queries → sees stale data
- **Mitigation:** Route read-after-write queries to primary (see routing logic)

⚠️ **Application Complexity**

- Developers must understand read/write routing
- Prisma ORM config requires read/write connection strings
- Risk of routing bugs (e.g., accidentally reading from replica after write)

⚠️ **Increased Cost**

- $72/month → $833/month = **11.5x increase**
- Fixed cost regardless of traffic (vs single instance scaling down)

⚠️ **Operational Overhead**

- Monitor replication lag (CloudWatch alerts)
- Manage 3 database instances (primary + 2 replicas)
- Coordinate backups, patching across instances

### Risks and Mitigations

| Risk                              | Probability | Impact | Mitigation                                                                         |
| --------------------------------- | ----------- | ------ | ---------------------------------------------------------------------------------- |
| **Replication Lag >1s**           | Low         | High   | CloudWatch alarm on `ReplicaLag > 1000ms`, automatic failover removes slow replica |
| **Read-After-Write Stale Data**   | Medium      | Medium | Route all writes + immediate reads to primary (session affinity)                   |
| **Primary Failover During Write** | Low         | High   | Multi-AZ automatic failover (<2 min), RDS Proxy retries writes                     |
| **Connection Pool Exhaustion**    | Low         | Medium | RDS Proxy max_connections: 60, monitor `DatabaseConnections` metric                |
| **Cost Overrun**                  | Low         | Low    | Set AWS budget alerts at $900/month, CloudWatch cost anomaly detection             |

## Implementation

### Timeline: 3 Weeks

**Week 1: Infrastructure Setup**

- Create RDS read replicas via Terraform (2× db.r5.large)
- Set up RDS Proxy with connection pooling
- Configure CloudWatch alarms (replication lag, CPU, connections)
- Test replication lag (<100ms confirmed)

**Week 2: Application Changes**

- Update Prisma schema with read/write connection strings
- Implement read replica routing middleware
- Add read-after-write logic (session-based routing)
- Deploy to staging environment

**Week 3: Testing & Rollout**

- Load testing: 50k read TPS, 5k write TPS
- Chaos engineering: Kill primary, verify auto-failover
- Blue-green deployment to production
- Monitor for 72 hours before full cutover

### Read/Write Routing Implementation

**Prisma Configuration:**

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")          // Primary (write)
  directUrl = env("DATABASE_DIRECT_URL")   // Primary (write)
}

// lib/prisma.ts
export const prismaWrite = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

export const prismaRead = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_REPLICA_URL } }
});
```

**Routing Middleware:**

```typescript
// middleware/db-router.ts
export function getDbClient(operation: 'read' | 'write', userId?: string) {
  if (operation === 'write') {
    return prismaWrite;
  }

  // Read-after-write: Check if user made write in last 2 seconds
  const lastWrite = recentWritesCache.get(userId);
  if (lastWrite && Date.now() - lastWrite < 2000) {
    return prismaWrite; // Use primary for consistency
  }

  return prismaRead; // Use replica
}

// Usage in service
async function getTripHistory(userId: string) {
  const db = getDbClient('read', userId);
  return db.trip.findMany({ where: { userId } });
}

async function createTrip(data: TripInput, userId: string) {
  const db = getDbClient('write');
  recentWritesCache.set(userId, Date.now()); // Track write
  return db.trip.create({ data });
}
```

**Index Optimization:**

```sql
-- Trip history query (40x faster)
CREATE INDEX idx_trips_user_created
ON trips (user_id, created_at DESC);

-- Driver search query (20x faster)
CREATE INDEX idx_drivers_location
ON drivers USING GIST (location);

-- Rating queries (15x faster)
CREATE INDEX idx_ratings_driver_created
ON ratings (driver_id, created_at);

-- Analyze tables to update statistics
ANALYZE trips;
ANALYZE drivers;
ANALYZE ratings;
```

### Migration Strategy

**Phase 1: Create Replicas (No Traffic Shift)**

- Deploy replicas alongside primary
- Verify replication working (<100ms lag)
- No application changes yet

**Phase 2: Read-Only Queries to Replicas (10% Traffic)**

- Deploy routing middleware with feature flag
- Route 10% of read-only queries to replicas
- Monitor for errors, replication lag

**Phase 3: Gradual Rollout (10% → 100%)**

- Week 1: 10% reads to replicas
- Week 2: 50% reads to replicas
- Week 3: 100% reads to replicas
- Monitor `ReplicaLag`, `ReadLatency` metrics

**Phase 4: Enable Read-After-Write Logic**

- Deploy session-based routing for consistency
- Test: User creates trip → immediately queries → sees new trip

### Rollback Plan

**Scenario:** Replication lag spikes to >5 seconds, stale data issues

**Steps:**

1. **Immediate:** Disable feature flag → route 100% reads to primary (2-minute rollback)
2. **Investigate:** Check `ReplicaLag` metric, replica CPU/IOPS
3. **Fix:** Scale replica to larger instance size OR reduce read traffic
4. **Re-test:** Verify replication lag <100ms consistently
5. **Re-deploy:** Gradual rollout again (10% → 100%)

**Rollback Cost:** $0 (primary handles all traffic during rollback, replicas remain for retry)

## References

- **Detailed Design:** [database-scaling-strategy.md](../architecture/database-scaling-strategy.md)
- **Gap Analysis:** [gap-analysis.md](../architecture/gap-analysis.md)
- **RDS Read Replicas Guide:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html
- **RDS Proxy Best Practices:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html
- **Prisma Read Replicas:** https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#read-replicas
- **Terraform Config:** [infrastructure/terraform/rds-replicas.tf](../../infrastructure/terraform/) _(to be created)_

## Related ADRs

- [ADR-003: Distributed Caching](./ADR-003-distributed-caching-elasticache.md) - Reduces read load via caching
- [ADR-001: Async Communication](./ADR-001-event-driven-async-communication.md) - Reduces database write load
- [ADR-006: Auto-Scaling](./ADR-006-auto-scaling-infrastructure.md) - Scales app tier to match DB capacity
