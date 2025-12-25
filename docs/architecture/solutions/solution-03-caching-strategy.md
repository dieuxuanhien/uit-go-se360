# Solution 3: Caching Strategy (The "Short-Term Memory")

## 1. The Essence of the Problem: "The Database Bottleneck"
In the *Critical Bottlenecks* analysis, we identified that the database is the single point of failure.

*   **The Physics:** A database query involves network round-trips, parsing/planning, index/page reads, and lock/IO contention. Under load, tail latency and contention are often the real problem.
*   **The Waste:** Many reads are repetitive (profiles/config/pricing rules), so repeatedly hitting the primary DB burns CPU/IOPS budget for low-value work.
*   **The Failure Mode:** When read traffic exceeds sustainable capacity, queues form (connection pools, DB worker processes, storage). Latency rises non-linearly, and critical writes start timing out.

## 2. The Architectural Solution: "Memory-First Architecture"
We introduce a **Caching Layer** (Short-Term Memory) in front of the Database (Long-Term Memory).

### The Pattern: "Cache-Aside" (Lazy Loading)
We do not treat the Cache as a magic box. The application explicitly manages it:

1.  **Ask Cache:** "Do you have the Driver Profile for ID 123?"
2.  **Hit (Fast):** "Yes, here it is." (Time: 1ms) -> **Return to User.**
3.  **Miss (Slow):** "No."
  *   Fetch from Database (typically slower than cache, especially under load).
    *   **Write to Cache** with an expiration (TTL).
    *   Return to User.

## 3. Why This Fixes the Crash
*   **Speed:** Cache hits are typically much faster and more stable than database reads under contention.
*   **Protection:** High hit rates reduce load on the primary database, preserving capacity for critical writes.
*   **Cost:** Shifting hot reads to Redis is often cheaper than scaling the primary database for peak read traffic.

## 4. Technology Selection
We need a high-performance Key-Value store.

*   **Option A: In-Memory (Node.js Map)**
    *   *Pros:* Fastest (nanoseconds).
    *   *Cons:* Data is lost on restart; memory is limited to the container; not shared across replicas (inconsistent).
    *   *Verdict:* **Rejected** (Statelessness is required).

*   **Option B: Redis (Remote Dictionary Server)**
    *   *Pros:* Sub-millisecond latency, shared across all containers, rich data structures (Lists, Sets, Geo), persistence options.
    *   *Cons:* Another infrastructure piece to manage.
    *   *Verdict:* **Selected.** The industry standard.

*   **Option C: Memcached**
    *   *Pros:* Simple, multi-threaded.
    *   *Cons:* Limited data structures (no Geo), no persistence.
    *   *Verdict:* **Rejected.** We need Geo features for driver location.

## 5. Implementation Strategy

We implemented a **Distributed Redis Cluster** using the `ioredis` library. Redis serves two distinct purposes in our architecture:
1. **Data Caching:** Traditional key-value caching for User Profiles.
2. **Geospatial Index:** Real-time driver location queries (the "killer feature").

### A. Redis Cluster Architecture (`docker-compose.redis-cluster.yml`)
We run a 6-node Redis Cluster for high availability and horizontal scaling.

```
┌──────────────────────────────────────────────────────────┐
│                   Redis Cluster (6 Nodes)                │
├──────────────────────────────────────────────────────────┤
│  Primary 1 ──► Replica 1   (Hash Slots 0-5460)          │
│  Primary 2 ──► Replica 2   (Hash Slots 5461-10922)      │
│  Primary 3 ──► Replica 3   (Hash Slots 10923-16383)     │
└──────────────────────────────────────────────────────────┘
```

Key configuration:
```yaml
# docker-compose.redis-cluster.yml
redis-node-1:
  command: >
    redis-server
    --cluster-enabled yes
    --maxmemory 512mb
    --maxmemory-policy allkeys-lru  # Evict least-recently-used when full
```

```typescript
// RedisService - Cluster mode with read scaling
this.client = new Cluster(nodes, {
  scaleReads: 'slave',  // Optional: read from replicas (increases read capacity)
  maxRedirections: 16,  // Handle slot migrations gracefully
});
```

### B. The Wrapper Service (`packages/common-utils/src/cache/cache.service.ts`)
We don't use the Redis client directly. We wrap it to handle serialization, error suppression, and metrics.

```typescript
// The "Safe" Cache Client
export class CacheService {
  // ... setup code ...

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        this.metrics.misses++; // Track effectiveness
        return null;
      }
      this.metrics.hits++;
      return JSON.parse(value); // Auto-deserialize
    } catch (err) {
      // FAIL OPEN: If cache is down, fallback to DB silently
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    // Auto-serialize and set Expiration (TTL)
    await this.client.setex(key, ttl, JSON.stringify(value));
  }
}
```

### C. Geospatial Caching (The "Killer Feature")
The **most impactful** use of Redis is NOT traditional caching—it's the **Geospatial Index** for driver locations.

#### The Problem: "Find Nearby Drivers"
Without Redis, we would need to:
1. Query ALL drivers from PostgreSQL.
2. Calculate distance for EACH driver using Haversine formula.
3. Sort by distance.
*   **Time Complexity:** O(N) where N = total drivers. At 10,000 drivers, this takes **500ms+**.

#### The Solution: Redis GEORADIUS
Redis has built-in geospatial commands that use a **Sorted Set + Geohash** under the hood.

```typescript
// services/driver-service/src/drivers/drivers.service.ts

// 1. When driver updates location → Store in Redis Geo Index
await this.redisService.geoadd(
  'driver:geo',        // Key
  longitude, latitude, // Coordinates (note: lng first!)
  driverId             // Member
);

// 2. When user requests trip → Find drivers within 5km
const nearbyDrivers = await this.redisService.georadius(
  'driver:geo',
  pickupLongitude, pickupLatitude,
  5, 'km',           // Radius
  'WITHDIST', 'ASC', // Return distance, sorted closest first
  'COUNT', '10'      // Limit to 10 drivers
);
// Returns: [['driver-123', '1.2'], ['driver-456', '2.8'], ...]
```

*   **Time Complexity:** O(log N + M) where M = results. This is **sub-millisecond** regardless of total drivers.
*   **Reality in our codebase:** The geo query is usually fast, but total endpoint latency can include additional work (e.g., fetching status/location metadata via `MGET`, JSON parsing, filtering). We also log a warning if geospatial search exceeds a 500ms threshold.

### D. Usage in Repository Layer
We apply caching to high-volume read operations, like fetching User Profiles.

```typescript
// services/user-service/src/users/users.repository.ts

async findByIdWithCacheInfo(userId: string): Promise<CacheAwareResult<User>> {
  const cacheKey = `user:${userId}`;

  // 1. Try Cache
  if (this.cacheService) {
    const cached = await this.cacheService.get<User>(cacheKey);
    if (cached) {
      return { data: cached, cacheHit: true };
    }
  }

  // 2. Fallback to DB (Read Replica)
  const readClient = this.replicaService.getReadClient();
  const user = await readClient.user.findUnique({
    where: { id: userId },
  });

  // 3. Populate Cache (TTL: 1 hour)
  if (user && this.cacheService) {
    await this.cacheService.set(cacheKey, user, this.userTTL);
  }

  return { data: user, cacheHit: false };
}
```

## 6. Trade-offs & Mitigation Status

Caching introduces the hardest problem in computer science: **Cache Invalidation**.

### A. Trade-off: "Stale Data"
*   **The Cost:** A user updates their email, but the cache still shows the old one for 1 hour.
*   **Risk:** Password reset emails go to the wrong address.
*   **Status:** ✅ **MITIGATED (Implemented)**
    *   **Strategy:** **Invalidate-on-Write.**
    *   *Logic:* In `UsersRepository.update()`, we explicitly call `cacheService.delete(\`user:${id}\`)`.
    *   *Fallback:* TTL (1 hour) ensures data eventually corrects itself.

### B. Trade-off: "Cache Stampede" (Thundering Herd)
*   **The Cost:** A popular cache key expires (e.g., "Pricing Rules"). 1,000 requests hit the cache simultaneously, get a "Miss", and ALL 1,000 hit the database at once.
*   **Risk:** Instant database crash at the exact moment of expiration.
*   **Status:** ⏳ **NOT YET IMPLEMENTED**
    *   **Current Risk:** Moderate.
    *   **Planned Mitigation:** **Probabilistic Early Expiration** (X-Fetch) or **Locking**.
        *   *Idea:* If TTL < 5s, one random request re-fetches the data while others serve the "stale" data.

### C. Trade-off: Serialization Overhead
*   **The Cost:** `JSON.stringify` and `JSON.parse` are synchronous CPU work. For small objects this is usually fine, but large payloads can add event loop delay.
*   **Risk:** High CPU usage on the Node.js server if we cache massive objects (e.g., 1MB lists).
*   **Status:** ✅ **MITIGATED (Design)**
    *   **Rule:** We only cache small entities (Profiles, Configs).
    *   **Rule:** We do not cache large lists (e.g., "All Trips History"). Pagination is handled by the DB.

### D. Trade-off: Redis Failure
*   **The Cost:** If Redis crashes, all traffic hits the DB.
*   **Risk:** The DB crashes immediately (cascading failure).
*   **Status:** ⚙️ **PARTIALLY MITIGATED**
    *   **Implemented:** `try/catch` blocks ensure the app doesn't crash if Redis is down.
    *   **Missing:** **Circuit Breaker**. If Redis is down, we should stop trying to connect for 30s to avoid timeout latency.

---

## 7. Integration with Other Solutions

Caching does not exist in isolation. It forms part of a **defense-in-depth** strategy:

```
Request Flow:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  User   │───►│  Redis  │───►│ Replica │───►│ Primary │
│ Request │    │  Cache  │    │   DB    │    │   DB    │
└─────────┘    └────┬────┘    └────┬────┘    └────┬────┘
                   │              │              │
              Cache Hit       Replica Read    Primary Read
            (fastest path)   (fallback path)  (slowest path)
```

*   **Solution 3 (Cache):** Handles a large share of hot reads when hit rate is high.
*   **Solution 4 (Replicas):** Handles additional read load without pushing everything onto the Primary.
*   **Result:** Primary DB is protected for critical writes (Create Trip, Update Status).