# ADR-003: Distributed Caching with ElastiCache Redis

**Status:** ✅ Accepted  
**Date:** 2025-11-21  
**Decision Makers:** Architecture Team  
**Technical Story:** [caching-strategy.md](../architecture/caching-strategy.md)

## Context

The current architecture has **no caching layer**. Every request hits the database, even for frequently accessed data that rarely changes.

### Current State Problems

**Performance Issues:**

- Driver profile queries: **200ms** (50 queries/second peak)
- User profile queries: **150ms** (100 queries/second peak)
- Pricing calculations: **300ms** (database query for pricing rules)
- Total database load: **10,000 queries/second** (80% are cacheable)

**Database Overload:**

- PostgreSQL CPU: **75% utilization** during peak hours
- Read replicas handle 40k TPS but only 10k needed if cached
- **Wasted capacity:** 30k TPS headroom unused due to redundant queries

**Cost Inefficiency:**

- Database scaled for peak load (includes redundant queries)
- db.r5.large instances handle repetitive reads
- **Money wasted** on database capacity for cacheable data

**Scalability Gap:**

- Current: 10k queries/second → 75% CPU
- Target: 100k queries/second for 100k users
- **Without caching:** Would need 10× database capacity ($8,000/month)

## Decision

**Implement distributed caching with AWS ElastiCache Redis cluster.**

### Architecture

```
┌──────────────┐       Cache Hit (90%)      ┌──────────────┐
│  Application │◄────5ms response───────────│   Redis      │
│  (NestJS)    │                            │  Cluster     │
└──────┬───────┘                            │  (3-node)    │
       │                                    └──────────────┘
       │ Cache Miss (10%)                          ▲
       │                                           │
       ▼                                    Write-through
┌──────────────┐                            Invalidation
│  PostgreSQL  │────────────────────────────────────┘
│  (Primary +  │       50ms response
│   Replicas)  │       1,000 queries/sec (vs 10k)
└──────────────┘
```

**Redis Cluster Configuration:**

- **Instance Type:** cache.r6g.large (2 vCPU, 13.07GB RAM)
- **Nodes:** 3 nodes (1 primary + 2 replicas) across 3 AZs
- **Multi-AZ:** Automatic failover enabled (<1 min)
- **Replication:** Synchronous to replicas (strong consistency)
- **Eviction Policy:** allkeys-lru (Least Recently Used)
- **Max Memory:** 10GB per node (30GB cluster total)

**Caching Strategy:**

1. **Cache-Aside Pattern** (Default):
   - Application checks cache first
   - On miss: Query database → Write to cache
   - TTL-based expiration

2. **Write-Through Invalidation**:
   - On data update: Invalidate cache keys
   - Next read will fetch fresh data from DB

3. **Cache Warming** (Optional):
   - Pre-populate cache at startup
   - Critical data: Pricing rules, city configs

## Quantitative Analysis

### Performance Impact

| Metric                    | No Cache   | With Cache | Improvement       |
| ------------------------- | ---------- | ---------- | ----------------- |
| **Driver Profile Query**  | 200ms      | 5ms        | **40x faster**    |
| **User Profile Query**    | 150ms      | 5ms        | **30x faster**    |
| **Pricing Calculation**   | 300ms      | 3ms        | **100x faster**   |
| **Average Response Time** | 180ms      | 18ms       | **10x faster**    |
| **Database Read Load**    | 10,000 TPS | 1,000 TPS  | **10x reduction** |
| **Cache Hit Rate**        | N/A        | 90%        | -                 |

**User Experience Impact:**

- Trip creation flow: 3 DB queries (600ms total) → 1 cache hit + 2 DB (100ms total) = **6x faster**
- Driver search: 5 DB queries (1000ms total) → 3 cache hits + 2 DB (200ms total) = **5x faster**

**Database Load Reduction:**

```
Before caching:
- Read queries: 10,000/sec × 100ms avg = 1,000 CPU-seconds/sec
- CPU utilization: 75% (approaching limit)

After caching (90% hit rate):
- Read queries: 1,000/sec × 100ms = 100 CPU-seconds/sec
- CPU utilization: 15% (massive headroom)
- Freed capacity: 9,000 TPS for growth
```

### Cost Analysis

**Current State (No Cache):**

```
Database costs to handle all reads:
- Primary + 2 replicas: $833.70/month (from ADR-002)
- Total: $833.70/month
```

**Proposed State (With Cache):**

```
ElastiCache Redis Cluster:
- 3× cache.r6g.large nodes
- $0.252/hour × 3 × 730 hours = $552.24/month

Database costs (reduced load):
- Can downsize replicas: 2× db.r5.medium instead of db.r5.large
- Primary (db.r5.large Multi-AZ): $350.40/month
- Replica 1 (db.r5.medium): $87.60/month (vs $175.20)
- Replica 2 (db.r5.medium): $87.60/month (vs $175.20)
- RDS Proxy: $21.90/month
- Total DB: $547.50/month (vs $833.70)

Total: $552.24 (Redis) + $547.50 (DB) = $1,099.74/month
```

**Cost Comparison:**

- No cache: $833.70/month (database only)
- With cache: $1,099.74/month
- **Increase: $266.04/month**

**But wait - Opportunity Cost Analysis:**

Without cache, to handle 100k users:

- Database would need 10x capacity: $8,337/month
- With cache: $1,099.74/month
- **Savings at scale: $7,237/month (87% reduction)**

**ROI Analysis:**

- Cache cost: $552/month
- Database savings: $286/month (downsize replicas)
- **Net cost: $266/month**
- **Break-even:** When database would need to scale up without cache (at 30k users)
- **At 100k users:** Save $7,237/month

**Cost Per User:**

- At 100k users: $1,099.74 / 100,000 = **$0.011/user**

### Scalability Metrics

| Dimension         | No Cache              | With Cache        | Factor          |
| ----------------- | --------------------- | ----------------- | --------------- |
| **Max Read TPS**  | 40,000 TPS (DB limit) | 400,000 TPS       | **10x**         |
| **Response Time** | 180ms avg             | 18ms avg          | **10x faster**  |
| **Database CPU**  | 75%                   | 15%               | **5x headroom** |
| **Cost at Scale** | $8,337/month          | $1,100/month      | **87% savings** |
| **Availability**  | 99.95% (DB only)      | 99.99% (Redis HA) | Higher          |

**Cache Capacity Planning:**

```
Cache data estimate:
- 100k users × 2KB profile = 200MB
- 10k drivers × 3KB profile = 30MB
- 50k active trips × 1KB = 50MB
- Pricing rules, city configs: 20MB
- Total: ~300MB

Redis capacity: 30GB cluster (10GB × 3 nodes)
**Headroom: 100x** (can cache 100x more data)
```

## Alternatives Considered

### Alternative 1: In-Memory Cache (Node.js LRU)

**Approach:** Use `node-cache` or `lru-cache` library in application memory

**Pros:**

- No infrastructure cost (runs in app memory)
- Lowest latency: <1ms (no network hop)
- Simple to implement (just a library)

**Cons:**

- **No shared cache:** Each app instance has separate cache (cache inefficiency)
- **Memory limits:** Each t3.medium instance has only 4GB RAM (limited cache capacity)
- **Cache inconsistency:** User updates profile on instance A, instance B serves stale cache
- **No high availability:** Instance restart = cache lost

**Cost:** $0/month (free)

**Verdict:** ❌ **Rejected** - Not viable for distributed system. Only suitable for single-instance apps.

### Alternative 2: Redis (Self-Hosted on EC2)

**Approach:** Run Redis on EC2 instances instead of ElastiCache

**Pros:**

- Lower cost: $60/month (t3.medium) vs $552/month (ElastiCache)
- Full control over Redis configuration
- Can use latest Redis version immediately

**Cons:**

- **Operational burden:** Must manage patching, backups, failover
- **High availability requires work:** Set up Sentinel for auto-failover (complex)
- **No automatic scaling:** Manual capacity planning
- **Risk of data loss:** If not configured correctly
- **Team lacks Redis ops expertise**

**Cost:** $60/month (single instance) or $180/month (3-node HA cluster)

**Verdict:** ❌ **Rejected** - Prefer managed service (ElastiCache) to avoid operational burden. $552/month is worth the peace of mind.

### Alternative 3: Memcached (ElastiCache Memcached)

**Approach:** Use Memcached instead of Redis

**Pros:**

- Slightly cheaper: $450/month (3× cache.r6g.large Memcached)
- Simpler protocol (less features = less complexity)
- Slightly lower latency (simpler protocol overhead)

**Cons:**

- **No persistence:** Restart = all cache lost (vs Redis RDB snapshots)
- **No data structures:** Only key-value (Redis has lists, sets, sorted sets)
- **No Pub/Sub:** Cannot implement real-time invalidation (vs Redis pub/sub)
- **No TTL per key flexibility:** (Redis supports variable TTLs)

**Cost:** $450/month (vs $552/month Redis) = **$102/month savings**

**Verdict:** ❌ **Rejected** - Redis's additional features (persistence, data structures, pub/sub) worth $102/month. Future-proofing for real-time features.

### Alternative 4: DynamoDB DAX (DynamoDB Accelerator)

**Approach:** If using DynamoDB, use DAX for caching

**Pros:**

- Fully managed (AWS handles everything)
- Microsecond latency (vs milliseconds for Redis)
- Auto-scaling built-in

**Cons:**

- **Only works with DynamoDB** (we use PostgreSQL)
- Migration to DynamoDB required (6-month project)
- Higher cost at low scale: $350/month base

**Cost:** Not applicable (requires DynamoDB migration)

**Verdict:** ❌ **Rejected** - Not compatible with PostgreSQL architecture.

## Consequences

### Positive

✅ **10x Database Load Reduction**

- 10,000 TPS → 1,000 TPS read load on database
- Frees capacity for 9,000 TPS growth (90k more users)

✅ **10x Faster Response Times**

- Average 180ms → 18ms for cached queries
- Better user experience (faster dashboards, search)

✅ **87% Cost Savings at Scale**

- Without cache: $8,337/month at 100k users
- With cache: $1,100/month at 100k users

✅ **High Availability**

- 99.99% uptime (Redis cluster with auto-failover)
- <1 minute failover time (automatic)

✅ **Future-Proof Architecture**

- Redis supports advanced features (pub/sub, leaderboards, rate limiting)
- Can implement real-time notifications, session management

### Negative

⚠️ **Cache Invalidation Complexity**

- Developers must invalidate cache on every data update
- Risk of serving stale data if invalidation missed
- "There are only two hard things in Computer Science: cache invalidation and naming things" - Phil Karlton

⚠️ **Increased Cost**

- $266/month net increase (vs no cache)
- Break-even at 30k users (when DB would need scaling)

⚠️ **Cache Warming Required**

- Cold start: First requests slow (cache miss penalty)
- Mitigation: Pre-populate cache at startup for critical data

⚠️ **Monitoring Overhead**

- Must monitor cache hit rate, memory usage, eviction rate
- Set up CloudWatch alarms for low hit rate (<80%)

### Risks and Mitigations

| Risk                      | Probability | Impact | Mitigation                                                         |
| ------------------------- | ----------- | ------ | ------------------------------------------------------------------ |
| **Cache Hit Rate <80%**   | Medium      | Medium | Analyze eviction logs, increase cache size, tune TTLs              |
| **Stale Data Served**     | Medium      | High   | Implement write-through invalidation, short TTLs for critical data |
| **Cache Cluster Failure** | Low         | Medium | Multi-AZ replication, app falls back to database on cache miss     |
| **Memory Exhaustion**     | Low         | Medium | LRU eviction policy, CloudWatch alarm on memory >80%               |
| **Thundering Herd**       | Low         | High   | Cache warming, distributed locking for cache rebuilds              |

## Implementation

### Timeline: 2 Weeks

**Week 1: Infrastructure + Core Caching**

- Create ElastiCache Redis cluster via Terraform
- Set up CloudWatch metrics (hit rate, memory, latency)
- Implement cache client wrapper (ioredis library)
- Deploy cache-aside pattern for driver profiles

**Week 2: Full Rollout + Monitoring**

- Extend caching to user profiles, pricing rules
- Implement write-through invalidation
- Cache warming script for critical data
- Load testing: Verify 90% hit rate
- Production deployment with gradual rollout

### Cache Key Design

**Key Naming Convention:**

```typescript
// Format: {service}:{entity}:{id}:{version}
driver:profile:123:v1
user:profile:456:v1
pricing:rules:city-hanoi:v2
trip:active:789:v1
```

**TTL Strategy:**

```typescript
const TTL = {
  DRIVER_PROFILE: 3600, // 1 hour (rarely changes)
  USER_PROFILE: 1800, // 30 minutes
  PRICING_RULES: 86400, // 24 hours (rarely changes)
  ACTIVE_TRIP: 60, // 1 minute (changes frequently)
  DRIVER_LOCATION: 10, // 10 seconds (real-time)
};
```

### Implementation Example

**Cache-Aside Pattern:**

```typescript
// lib/cache.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_ENDPOINT,
  port: 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export async function getOrSet<T>(key: string, ttl: number, fetchFn: () => Promise<T>): Promise<T> {
  // Try cache first
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - fetch from database
  const data = await fetchFn();

  // Write to cache
  await redis.setex(key, ttl, JSON.stringify(data));

  return data;
}

// services/driver.service.ts
async function getDriverProfile(driverId: string) {
  const cacheKey = `driver:profile:${driverId}:v1`;

  return getOrSet(cacheKey, TTL.DRIVER_PROFILE, async () => {
    // Database query only on cache miss
    return prisma.driver.findUnique({
      where: { id: driverId },
      include: { vehicle: true, ratings: true },
    });
  });
}
```

**Write-Through Invalidation:**

```typescript
async function updateDriverProfile(driverId: string, data: DriverUpdate) {
  // Update database
  const updated = await prisma.driver.update({
    where: { id: driverId },
    data,
  });

  // Invalidate cache
  const cacheKey = `driver:profile:${driverId}:v1`;
  await redis.del(cacheKey);

  return updated;
}
```

**Cache Warming (Startup):**

```typescript
// lib/cache-warmer.ts
async function warmCache() {
  console.log('Warming cache...');

  // Load pricing rules
  const pricingRules = await prisma.pricingRule.findMany();
  for (const rule of pricingRules) {
    const key = `pricing:rules:${rule.cityId}:v2`;
    await redis.setex(key, TTL.PRICING_RULES, JSON.stringify(rule));
  }

  // Load top 100 active drivers
  const drivers = await prisma.driver.findMany({
    where: { status: 'ACTIVE' },
    take: 100,
    orderBy: { rating: 'desc' },
  });
  for (const driver of drivers) {
    const key = `driver:profile:${driver.id}:v1`;
    await redis.setex(key, TTL.DRIVER_PROFILE, JSON.stringify(driver));
  }

  console.log('Cache warmed successfully');
}

// Call at application startup
warmCache();
```

### Monitoring

**CloudWatch Metrics:**

```hcl
# Terraform CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "cache_hit_rate_low" {
  alarm_name          = "redis-cache-hit-rate-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CacheHitRate"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Cache hit rate below 80%"
}

resource "aws_cloudwatch_metric_alarm" "memory_usage_high" {
  alarm_name          = "redis-memory-usage-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Redis memory usage above 80%"
}
```

### Migration Strategy

**Phase 1: Deploy Cache Cluster (No App Changes)**

- Create ElastiCache cluster in production VPC
- Verify connectivity from app instances
- No traffic yet

**Phase 2: Enable Caching for Driver Profiles (10% Traffic)**

- Deploy code with cache-aside pattern
- Feature flag: 10% of driver profile queries use cache
- Monitor hit rate, latency, error rate

**Phase 3: Gradual Rollout (10% → 100%)**

- Week 1: 10% cached
- Week 2: 50% cached
- Week 3: 100% cached
- Monitor CloudWatch metrics at each stage

**Phase 4: Extend to All Cacheable Queries**

- User profiles, pricing rules, trip data
- Target: 90% overall cache hit rate

### Rollback Plan

**Scenario:** Cache hit rate <50% or error rate spikes

**Steps:**

1. **Immediate:** Disable feature flag → 0% cache usage (app queries DB directly)
2. **Investigate:** Check Redis logs, CloudWatch metrics, TTL configs
3. **Fix:** Adjust TTL values, increase cache size, fix invalidation bugs
4. **Re-test:** Verify hit rate >80% in staging
5. **Re-deploy:** Gradual rollout again (10% → 100%)

**Rollback Cost:** $552/month (cache cluster remains running during investigation)

## References

- **Detailed Design:** [caching-strategy.md](../architecture/caching-strategy.md)
- **Gap Analysis:** [gap-analysis.md](../architecture/gap-analysis.md)
- **ElastiCache Best Practices:** https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html
- **Redis Best Practices:** https://redis.io/docs/management/optimization/
- **Cache-Aside Pattern:** Microsoft Azure Architecture Center
- **Terraform Config:** [infrastructure/terraform/elasticache.tf](../../infrastructure/terraform/) _(to be created)_

## Related ADRs

- [ADR-002: Database Read Scaling](./ADR-002-database-read-scaling-rds-replicas.md) - Caching reduces DB load
- [ADR-004: Resilience Patterns](./ADR-004-resilience-patterns-circuit-breakers.md) - Cache provides fallback during DB outages
- [ADR-001: Async Communication](./ADR-001-event-driven-async-communication.md) - Event-driven cache invalidation
