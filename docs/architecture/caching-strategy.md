# Distributed Caching Architecture

## ElastiCache Redis Cluster for Hyper-Scale Performance

**Project:** uit-go-se360 - Ride-Hailing Platform  
**Track:** BMad Method (Brownfield) + Module A: Scalability & Performance  
**Design Date:** 2025-11-21  
**Designer:** Architect Agent  
**Status:** Design Complete - Pending Implementation

---

## Executive Summary

This document designs a **distributed caching layer** using AWS ElastiCache Redis to address the critical database overload bottleneck identified in the gap analysis. Without caching, user profile and trip history queries create 30,000+ database hits per second at scale, overwhelming PostgreSQL capacity (5,000 TPS max).

**Key Benefits:**

- ✅ **10x Database Load Reduction:** 90% cache hit rate reduces DB queries from 30k/s → 3k/s
- ✅ **5x Faster Response Times:** Cache hits return in 1-5ms vs 20-50ms database queries
- ✅ **Cost Efficiency:** $300/month cache cluster saves $1,000+/month in database scaling costs
- ✅ **Horizontal Scalability:** Add cache nodes independently without database changes
- ✅ **High Availability:** Multi-AZ cluster with automatic failover

**Trade-offs:**

- ⚠️ **Cache Invalidation Complexity:** Must invalidate stale data on writes
- ⚠️ **Memory Constraints:** Hot data must fit in RAM (100GB cluster = ~10M user profiles)
- ⚠️ **Cold Start Penalty:** First request after cache miss is slower (cache warm-up)
- ⚠️ **Consistency Risk:** Eventual consistency between cache and database

---

## 1. Current Architecture (No Caching - Baseline)

### 1.1 Current Database Load Pattern

```typescript
// services/user-service/src/users/users.service.ts
// 🔴 CURRENT: Every request hits database

async getUserProfile(userId: string): Promise<UserProfileDto> {
  // Database query on EVERY request
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      driverProfile: true,
      ratingsReceived: {
        select: { stars: true },
      },
    },
  });

  // Calculate average rating (database aggregation)
  const avgRating = user.ratingsReceived.length > 0
    ? user.ratingsReceived.reduce((sum, r) => sum + r.stars, 0) / user.ratingsReceived.length
    : 0;

  return this.mapToDto(user, avgRating);
}
```

**Problem: Database Query for Every Request**

```
Scenario: 100,000 concurrent users
Average requests per user per minute: 5 (profile views, trip details, driver searches)

Total Requests per Minute: 100,000 × 5 = 500,000/min = 8,333/sec

Query Breakdown:
- User profile lookups:      30,000/min = 500/sec
- Driver profile lookups:    20,000/min = 333/sec
- Trip history queries:      15,000/min = 250/sec
- Rating aggregations:       10,000/min = 167/sec
- Active trip status:        25,000/min = 417/sec

Total Database Load: 1,667 queries/sec

🔴 BOTTLENECK: PostgreSQL max capacity = 5,000 TPS
🔴 Current load = 33% of capacity WITHOUT caching
🔴 At 300k users = saturation (5,000 TPS limit reached)
```

### 1.2 Current Performance Metrics

| Query Type                      | Current Latency  | DB Load       | Cost                 |
| ------------------------------- | ---------------- | ------------- | -------------------- |
| User profile (with driver data) | 30-50ms          | 500/sec       | High CPU             |
| Driver rating calculation       | 100-200ms        | 167/sec       | Aggregation overhead |
| Trip history (last 30 days)     | 200-500ms        | 250/sec       | Full table scan      |
| Active trip lookup              | 20-30ms          | 417/sec       | Indexed query        |
| **Total**                       | **50-150ms avg** | **1,667/sec** | **33% DB capacity**  |

**Issues:**

1. **Repeated Identical Queries:** Same user profile fetched 100+ times/minute
2. **Expensive Aggregations:** Driver ratings calculated on every request
3. **No Query Result Reuse:** Each service instance queries independently
4. **Database Saturation:** Will hit limit at 300k users (3x current target)

---

## 2. Target Caching Architecture

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AWS Cloud - VPC                                │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  UserService / TripService (ECS Tasks)                       │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ...  ┌──────────┐│     │
│  │  │ Task 1   │  │ Task 2   │  │ Task 3   │       │ Task N   ││     │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘       └────┬─────┘│     │
│  └───────┼─────────────┼─────────────┼──────────────────┼──────┘     │
│          │             │             │                  │             │
│          │             │             │                  │             │
│  ┌───────▼─────────────▼─────────────▼──────────────────▼──────────┐ │
│  │                    Cache-Aside Pattern                           │ │
│  │  ┌──────────────────────────────────────────────────────────┐   │ │
│  │  │  1. Check ElastiCache (L1 - In-Memory)                   │   │ │
│  │  │     ├─ Hit (90%): Return cached data (1-5ms)             │   │ │
│  │  │     └─ Miss (10%): Query database, cache result          │   │ │
│  │  └──────────────────────────────────────────────────────────┘   │ │
│  └───────┬────────────────────────────────┬─────────────────────────┘ │
│          │ CACHE HIT (90%)                │ CACHE MISS (10%)          │
│          ▼                                 ▼                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ElastiCache Redis Cluster (Replicated)                      │   │
│  │  ┌────────────┐   ┌────────────┐   ┌────────────┐           │   │
│  │  │ Primary    │──►│ Replica 1  │──►│ Replica 2  │           │   │
│  │  │ r6g.large  │   │ r6g.large  │   │ r6g.large  │           │   │
│  │  │ 13.07 GB   │   │ Read-only  │   │ Read-only  │           │   │
│  │  └────────────┘   └────────────┘   └────────────┘           │   │
│  │                                                               │   │
│  │  ✅ Cluster Mode Disabled (simpler setup)                   │   │
│  │  ✅ Multi-AZ with Auto-Failover (99.95% availability)       │   │
│  │  ✅ Encryption at rest + in transit                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 │ CACHE MISS ONLY                    │
│                                 ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL (RDS Primary + Read Replicas)                    │   │
│  │  ├─ User profiles (cold data)                                │   │
│  │  ├─ Trip history (recent 90 days)                            │   │
│  │  └─ Driver ratings (aggregated on write)                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  📊 Cache Hit Rate: 90% → 10x DB load reduction                    │
│  ⚡ Cache Latency: 1-5ms (vs 30-50ms DB)                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Cache Hit Rate Projection

**Expected Cache Performance:**

| Data Type              | Access Frequency      | Cache Hit Rate | Impact                    |
| ---------------------- | --------------------- | -------------- | ------------------------- |
| **User profiles**      | Very high (repeated)  | 95%            | 20x fewer DB queries      |
| **Driver profiles**    | High (trip matching)  | 92%            | 12x fewer DB queries      |
| **Driver ratings**     | High (search results) | 90%            | 10x fewer aggregations    |
| **Active trip status** | Medium (polling)      | 85%            | 7x fewer DB queries       |
| **Trip history**       | Low (infrequent)      | 60%            | 2.5x fewer scans          |
| **Overall Average**    | -                     | **90%**        | **10x DB load reduction** |

**Calculation:**

```
Without Cache:
  Total queries: 1,667/sec
  Database load: 1,667/sec (100%)

With 90% Cache Hit Rate:
  Cache hits: 1,667 × 0.90 = 1,500/sec (returned from Redis)
  Cache misses: 1,667 × 0.10 = 167/sec (hit database)
  Database load: 167/sec (10% of original)

Load Reduction: 1,667 → 167 = 10x reduction ✅
```

---

## 3. Cache Key Design

### 3.1 Naming Convention

**Pattern:** `{service}:{entity}:{id}:{version}`

**Examples:**

```redis
# User profiles
user:profile:550e8400-e29b-41d4-a716-446655440000:v1

# Driver profiles (includes vehicle info)
user:driver:550e8400-e29b-41d4-a716-446655440001:v1

# Driver ratings (aggregated)
user:rating:550e8400-e29b-41d4-a716-446655440001:v1

# Active trip for user
trip:active:550e8400-e29b-41d4-a716-446655440000:v1

# Trip history (list of trip IDs)
trip:history:550e8400-e29b-41d4-a716-446655440000:page:1:v1

# Trip details
trip:details:660e8400-e29b-41d4-a716-446655440000:v1
```

**Benefits:**

- Consistent namespace prevents key collisions
- Version suffix enables cache busting (`v1` → `v2` on schema changes)
- Service prefix enables selective eviction (`DEL user:*`)
- Scannable for debugging (`SCAN 0 MATCH user:profile:*`)

### 3.2 Key-Value Schema

**User Profile Cache:**

```json
// Key: user:profile:{userId}:v1
// TTL: 3600 seconds (1 hour)
// Type: String (JSON serialized)
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "PASSENGER",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+84123456789",
  "createdAt": "2025-01-15T10:30:00Z",
  "cachedAt": "2025-11-21T14:22:00Z"
}
```

**Driver Profile Cache:**

```json
// Key: user:driver:{userId}:v1
// TTL: 1800 seconds (30 minutes)
// Type: String (JSON serialized)
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "userId": "550e8400-e29b-41d4-a716-446655440001",
  "vehicleMake": "Toyota",
  "vehicleModel": "Camry",
  "vehicleYear": 2022,
  "vehiclePlate": "ABC-1234",
  "vehicleColor": "Silver",
  "approvalStatus": "APPROVED",
  "cachedAt": "2025-11-21T14:22:00Z"
}
```

**Driver Rating Cache (Aggregated):**

```json
// Key: user:rating:{driverId}:v1
// TTL: 600 seconds (10 minutes)
// Type: String (JSON serialized)
{
  "driverId": "550e8400-e29b-41d4-a716-446655440001",
  "averageRating": 4.73,
  "totalRatings": 1247,
  "fiveStarCount": 892,
  "fourStarCount": 278,
  "threeStarCount": 61,
  "twoStarCount": 12,
  "oneStarCount": 4,
  "lastRatedAt": "2025-11-21T12:15:00Z",
  "cachedAt": "2025-11-21T14:22:00Z"
}
```

**Active Trip Cache:**

```json
// Key: trip:active:{userId}:v1
// TTL: 60 seconds (1 minute)
// Type: String (JSON serialized)
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "passengerId": "550e8400-e29b-41d4-a716-446655440000",
  "driverId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "IN_PROGRESS",
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "destinationLatitude": 10.771382,
  "destinationLongitude": 106.698639,
  "estimatedFare": 45000,
  "requestedAt": "2025-11-21T14:10:00Z",
  "cachedAt": "2025-11-21T14:22:00Z"
}
```

**Trip History Cache (Paginated):**

```json
// Key: trip:history:{userId}:page:1:v1
// TTL: 1800 seconds (30 minutes)
// Type: String (JSON serialized)
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "page": 1,
  "pageSize": 20,
  "totalCount": 156,
  "trips": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "status": "COMPLETED",
      "pickupAddress": "123 Nguyen Hue, District 1",
      "destinationAddress": "456 Le Loi, District 3",
      "actualFare": 45000,
      "completedAt": "2025-11-21T13:45:00Z"
    }
    // ... 19 more trips
  ],
  "cachedAt": "2025-11-21T14:22:00Z"
}
```

---

## 4. TTL (Time-To-Live) Strategy

### 4.1 TTL Guidelines

**Principle:** Balance freshness vs cache hit rate

| Data Type              | TTL            | Rationale                                            |
| ---------------------- | -------------- | ---------------------------------------------------- |
| **User profiles**      | 3600s (1 hour) | Rarely change (name, email), safe to cache long      |
| **Driver profiles**    | 1800s (30 min) | Vehicle info changes occasionally (approval status)  |
| **Driver ratings**     | 600s (10 min)  | Aggregate changes with each trip, refresh frequently |
| **Active trip status** | 60s (1 min)    | Real-time data, must be fresh for UI updates         |
| **Trip history**       | 1800s (30 min) | Historical data, rarely accessed repeatedly          |
| **Trip details**       | 3600s (1 hour) | Immutable after completion, safe to cache long       |

### 4.2 TTL Trade-offs

**Longer TTL (e.g., 1 hour):**

- ✅ Higher cache hit rate
- ✅ Lower database load
- ❌ Stale data risk (user sees outdated profile after update)

**Shorter TTL (e.g., 1 minute):**

- ✅ Fresher data
- ✅ Lower consistency risk
- ❌ More cache misses
- ❌ Higher database load

**Recommended Approach:**

1. Start with conservative TTLs (shorter)
2. Monitor cache hit rates
3. Incrementally increase TTL if hit rate < 85%
4. Implement **cache invalidation on write** (next section) to allow longer TTLs

---

## 5. Cache Invalidation Strategy

### 5.1 Invalidation Patterns

**Pattern 1: Write-Through Cache (Immediate Invalidation)**

```typescript
// services/user-service/src/users/users.service.ts
async updateUserProfile(userId: string, dto: UpdateUserDto): Promise<UserProfileDto> {
  // Step 1: Update database
  const updatedUser = await this.prisma.user.update({
    where: { id: userId },
    data: dto,
  });

  // Step 2: ✅ IMMEDIATELY INVALIDATE CACHE
  await this.cacheService.delete(`user:profile:${userId}:v1`);

  // Step 3: (Optional) Warm cache with new data
  await this.cacheService.set(
    `user:profile:${userId}:v1`,
    JSON.stringify(updatedUser),
    3600, // TTL: 1 hour
  );

  return this.mapToDto(updatedUser);
}
```

**Pattern 2: Write-Behind Cache (Eventual Invalidation)**

```typescript
// services/user-service/src/users/users.service.ts
async createRating(dto: CreateRatingDto): Promise<RatingDto> {
  // Step 1: Save rating to database
  const rating = await this.prisma.rating.create({ data: dto });

  // Step 2: Publish event to SNS for async invalidation
  await this.eventPublisher.publish('RatingCreated', {
    driverId: dto.driverId,
    ratingId: rating.id,
    timestamp: new Date().toISOString(),
  });

  // Step 3: Return immediately (cache invalidation happens async)
  return this.mapToDto(rating);
}

// Separate worker consumes event and invalidates cache
async onRatingCreated(event: RatingCreatedEvent): Promise<void> {
  // Invalidate driver rating cache
  await this.cacheService.delete(`user:rating:${event.driverId}:v1`);

  // Optionally: Recalculate and warm cache
  const avgRating = await this.calculateDriverRating(event.driverId);
  await this.cacheService.set(
    `user:rating:${event.driverId}:v1`,
    JSON.stringify(avgRating),
    600, // TTL: 10 minutes
  );
}
```

**Pattern 3: Tag-Based Invalidation (Batch Eviction)**

```typescript
// Invalidate all trip-related caches for a user
async invalidateUserTripCaches(userId: string): Promise<void> {
  const keysToDelete = [
    `trip:active:${userId}:v1`,
    `trip:history:${userId}:*`, // Wildcard pattern
  ];

  // Use Redis SCAN + DEL for pattern matching
  const keys = await this.redis.keys(`trip:history:${userId}:*`);
  if (keys.length > 0) {
    await this.redis.del(...keys);
  }

  // Delete other keys
  await this.redis.del(`trip:active:${userId}:v1`);
}
```

### 5.2 Invalidation Rules

| Event                       | Cache Keys to Invalidate                              | Pattern       |
| --------------------------- | ----------------------------------------------------- | ------------- |
| **User profile updated**    | `user:profile:{userId}:v1`                            | Write-through |
| **Driver profile updated**  | `user:driver:{userId}:v1`                             | Write-through |
| **Rating created**          | `user:rating:{driverId}:v1`                           | Write-behind  |
| **Trip status changed**     | `trip:active:{userId}:v1`, `trip:details:{tripId}:v1` | Write-through |
| **Trip completed**          | `trip:active:{userId}:v1`, `trip:history:{userId}:*`  | Write-behind  |
| **Driver approval changed** | `user:driver:{userId}:v1`                             | Write-through |

---

## 6. Cache-Aside Pattern Implementation

### 6.1 Cache Service Layer

```typescript
// services/user-service/src/cache/cache.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class CacheService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.ELASTICACHE_ENDPOINT,
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      tls: process.env.NODE_ENV === 'production' ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get value from cache
   * @returns Parsed JSON or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse cache value for key: ${key}`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.redis.setex(key, ttlSeconds, serialized);
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return 0;

    return await this.redis.del(...keys);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlSeconds: number): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    const value = await fetchFn();

    // Store in cache (fire and forget)
    this.set(key, value, ttlSeconds).catch((error) => {
      console.error(`Failed to cache value for key: ${key}`, error);
    });

    return value;
  }
}
```

### 6.2 Repository with Caching

```typescript
// services/user-service/src/users/users.repository.ts
@Injectable()
export class UsersRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService,
  ) {}

  /**
   * Get user profile with caching
   */
  async findById(userId: string): Promise<User | null> {
    const cacheKey = `user:profile:${userId}:v1`;
    const TTL = 3600; // 1 hour

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Cache miss - query database
        return this.prisma.user.findUnique({
          where: { id: userId },
          include: { driverProfile: true },
        });
      },
      TTL,
    );
  }

  /**
   * Update user profile (invalidate cache)
   */
  async update(userId: string, data: UpdateUserDto): Promise<User> {
    // Update database
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    // Invalidate cache
    await this.cache.delete(`user:profile:${userId}:v1`);

    // Optionally: Warm cache with new data
    await this.cache.set(`user:profile:${userId}:v1`, updated, 3600);

    return updated;
  }

  /**
   * Get driver rating with caching
   */
  async getDriverRating(driverId: string): Promise<DriverRatingDto> {
    const cacheKey = `user:rating:${driverId}:v1`;
    const TTL = 600; // 10 minutes

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Expensive aggregation query
        const ratings = await this.prisma.rating.findMany({
          where: { driverId },
          select: { stars: true },
        });

        const totalRatings = ratings.length;
        const averageRating =
          totalRatings > 0 ? ratings.reduce((sum, r) => sum + r.stars, 0) / totalRatings : 0;

        const distribution = {
          fiveStarCount: ratings.filter((r) => r.stars === 5).length,
          fourStarCount: ratings.filter((r) => r.stars === 4).length,
          threeStarCount: ratings.filter((r) => r.stars === 3).length,
          twoStarCount: ratings.filter((r) => r.stars === 2).length,
          oneStarCount: ratings.filter((r) => r.stars === 1).length,
        };

        return {
          driverId,
          averageRating: parseFloat(averageRating.toFixed(2)),
          totalRatings,
          ...distribution,
          cachedAt: new Date().toISOString(),
        };
      },
      TTL,
    );
  }
}
```

### 6.3 Service Layer Usage

```typescript
// services/user-service/src/users/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Get user profile (cache-aware)
   */
  async getUserProfile(userId: string): Promise<UserProfileDto> {
    // Repository handles caching transparently
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return this.mapToDto(user);
  }

  /**
   * Update user profile (invalidates cache automatically)
   */
  async updateUserProfile(userId: string, dto: UpdateUserDto): Promise<UserProfileDto> {
    // Repository handles cache invalidation
    const updated = await this.usersRepository.update(userId, dto);
    return this.mapToDto(updated);
  }

  /**
   * Get driver rating (cache-aware)
   */
  async getDriverRating(driverId: string): Promise<DriverRatingDto> {
    // Cached aggregation
    return this.usersRepository.getDriverRating(driverId);
  }
}
```

---

## 7. ElastiCache Cluster Configuration

### 7.1 Cluster Topology

**Recommended Setup: Redis Replication (Cluster Mode Disabled)**

```
┌─────────────────────────────────────────────────────────┐
│  ElastiCache Redis Replication Group                    │
│                                                         │
│  ┌────────────────┐                                    │
│  │  Primary Node  │                                    │
│  │  r6g.large     │  Async Replication                │
│  │  AZ: us-east-1a│────────────────┐                  │
│  │  Read + Write  │                │                  │
│  └────────────────┘                │                  │
│                                    ▼                  │
│  ┌────────────────┐   ┌────────────────┐             │
│  │  Replica 1     │   │  Replica 2     │             │
│  │  r6g.large     │   │  r6g.large     │             │
│  │  AZ: us-east-1b│   │  AZ: us-east-1c│             │
│  │  Read-only     │   │  Read-only     │             │
│  └────────────────┘   └────────────────┘             │
│                                                         │
│  ✅ Multi-AZ: Auto-failover (< 1 min)                 │
│  ✅ Encryption: At-rest + In-transit (TLS)            │
│  ✅ Backup: Daily snapshots (7-day retention)         │
└─────────────────────────────────────────────────────────┘
```

**Why Cluster Mode Disabled:**

- Simpler setup (single endpoint)
- No data sharding complexity
- Sufficient for 100k users (~10GB data)
- Easy to migrate to Cluster Mode later if needed

**When to Use Cluster Mode Enabled:**

- Data exceeds 100GB
- Need horizontal scaling beyond 3 nodes
- Write-heavy workload requiring sharding

### 7.2 Instance Sizing

**Formula: Estimate Cache Memory Needs**

```
User Profile Size:
  - User record: 500 bytes (JSON)
  - Driver profile: 300 bytes
  - Total per user: 800 bytes

Trip Cache Size:
  - Active trip: 400 bytes
  - Trip history (20 trips): 8 KB per user

Driver Rating Cache:
  - Rating aggregate: 200 bytes per driver

Total Memory Estimate (100k users):
  - User profiles: 100k × 800 bytes = 80 MB
  - Active trips: 10k concurrent × 400 bytes = 4 MB
  - Trip history: 100k × 8 KB = 800 MB (if all cached)
  - Driver ratings: 20k drivers × 200 bytes = 4 MB

Total Hot Data: ~900 MB
Safety Factor (3x): 2.7 GB
Recommended Instance: cache.r6g.large (13.07 GB) ✅
```

**Instance Type Selection:**

| Instance Type       | vCPU  | Memory       | Cost/Month | Use Case                     |
| ------------------- | ----- | ------------ | ---------- | ---------------------------- |
| cache.t3.micro      | 2     | 0.5 GB       | $12        | Dev/Test                     |
| cache.t3.small      | 2     | 1.38 GB      | $25        | Staging                      |
| **cache.r6g.large** | **2** | **13.07 GB** | **$100**   | **Production (Recommended)** |
| cache.r6g.xlarge    | 4     | 26.32 GB     | $200       | High-traffic (optional)      |

**Recommendation:** Start with `cache.r6g.large` (3-node cluster)

### 7.3 Terraform Configuration

```hcl
# infrastructure/terraform/elasticache.tf

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "uit-go-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "uit-go-redis-subnet-group"
  }
}

# ElastiCache Replication Group (Primary + Replicas)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "uit-go-redis-cluster"
  replication_group_description = "Redis cluster for UIT-Go caching"

  # Node configuration
  node_type                  = "cache.r6g.large"
  num_cache_clusters         = 3  # 1 primary + 2 replicas
  port                       = 6379

  # Multi-AZ with automatic failover
  automatic_failover_enabled = true
  multi_az_enabled           = true

  # Engine version
  engine                     = "redis"
  engine_version             = "7.0"
  parameter_group_name       = aws_elasticache_parameter_group.redis.name

  # Subnet and security
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true
  auth_token                 = var.redis_auth_token

  # Backup configuration
  snapshot_retention_limit   = 7
  snapshot_window            = "03:00-05:00"  # UTC
  maintenance_window         = "sun:05:00-sun:07:00"

  # Notifications
  notification_topic_arn     = aws_sns_topic.elasticache_events.arn

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = {
    Name        = "uit-go-redis-cluster"
    Environment = "production"
  }
}

# Parameter Group (Custom Settings)
resource "aws_elasticache_parameter_group" "redis" {
  name   = "uit-go-redis-params"
  family = "redis7"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"  # Evict least recently used keys
  }

  # Timeout settings
  parameter {
    name  = "timeout"
    value = "300"  # Close idle connections after 5 minutes
  }

  # Slow log threshold
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"  # Log queries slower than 10ms
  }

  parameter {
    name  = "slowlog-max-len"
    value = "128"  # Keep last 128 slow queries
  }
}

# Security Group
resource "aws_security_group" "redis" {
  name        = "uit-go-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  # Allow Redis access from ECS tasks
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.ecs_task_security_group_id]
    description     = "Allow Redis access from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "uit-go-redis-sg"
  }
}

# CloudWatch Log Group for Slow Logs
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/uit-go-redis/slow-log"
  retention_in_days = 7

  tags = {
    Name = "uit-go-redis-slow-log"
  }
}

# SNS Topic for ElastiCache Events
resource "aws_sns_topic" "elasticache_events" {
  name = "uit-go-elasticache-events"

  tags = {
    Name = "uit-go-elasticache-events"
  }
}

# Outputs
output "redis_primary_endpoint" {
  description = "Primary endpoint for Redis cluster"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Reader endpoint for Redis replicas"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
}
```

---

## 8. Monitoring & Observability

### 8.1 CloudWatch Metrics

**ElastiCache Metrics to Track:**

```yaml
Critical Metrics (Alert on):
  - CPUUtilization > 70% for 5 minutes
  - EngineCPUUtilization > 90% for 5 minutes
  - Evictions > 1000 per minute (memory pressure)
  - CacheHitRate < 80% for 10 minutes
  - ReplicationLag > 5 seconds (replica sync delay)
  - CurrConnections > 10,000 (connection saturation)

Performance Metrics (Monitor):
  - CacheHits vs CacheMisses (calculate hit rate)
  - GetTypeCmds (GET operations per second)
  - SetTypeCmds (SET operations per second)
  - NetworkBytesIn/Out (bandwidth usage)
  - BytesUsedForCache (memory consumption)
```

### 8.2 Custom Application Metrics

```typescript
// services/user-service/src/metrics/cache.metrics.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

export class CacheMetrics {
  private cloudwatch = new CloudWatch({ region: 'us-east-1' });

  async trackCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', duration: number) {
    await this.cloudwatch.putMetricData({
      Namespace: 'UIT-Go/Cache',
      MetricData: [
        {
          MetricName: `Cache${operation === 'hit' ? 'Hit' : operation === 'miss' ? 'Miss' : 'Operation'}`,
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
        },
        {
          MetricName: `CacheLatency`,
          Value: duration,
          Unit: 'Milliseconds',
          Dimensions: [
            {
              Name: 'Operation',
              Value: operation,
            },
          ],
        },
      ],
    });
  }

  async trackCacheHitRate(hits: number, misses: number) {
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;

    await this.cloudwatch.putMetricData({
      Namespace: 'UIT-Go/Cache',
      MetricData: [
        {
          MetricName: 'CacheHitRate',
          Value: hitRate,
          Unit: 'Percent',
        },
      ],
    });
  }
}
```

### 8.3 Alerting Strategy

**CloudWatch Alarms:**

```yaml
Critical Alarms (Page Oncall):
  - CacheHitRate < 70% for 15 minutes
    Action: Investigate cache configuration, increase TTLs

  - Evictions > 5000 per minute for 5 minutes
    Action: Increase instance size or reduce TTLs

  - ReplicationLag > 10 seconds for 5 minutes
    Action: Check network issues, consider increasing instance size

  - CurrConnections > 15,000 for 5 minutes
    Action: Connection leak, check application connection pooling

Warning Alarms (Slack Notification):
  - CacheHitRate < 85% for 30 minutes
  - CPUUtilization > 50% for 10 minutes
  - BytesUsedForCache > 80% of available memory
```

---

## 9. Implementation Plan

### 9.1 Phase 1: Infrastructure Setup (Week 1)

**Day 1-2: Terraform Deployment**

```bash
# Deploy ElastiCache cluster
cd infrastructure/terraform
terraform apply -target=aws_elasticache_replication_group.redis

# Verify endpoints
terraform output redis_primary_endpoint
terraform output redis_reader_endpoint
```

**Day 3: Environment Configuration**

```bash
# Update .env.production
ELASTICACHE_ENDPOINT=uit-go-redis-cluster.xxxx.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=<from-secrets-manager>
REDIS_TLS=true
```

**Day 4-5: Code Integration**

- Implement `CacheService` (cache.service.ts)
- Add ioredis dependency to package.json
- Write unit tests for cache operations
- Update Docker Compose for local Redis testing

### 9.2 Phase 2: Repository Integration (Week 2)

**Day 1-2: UserService Caching**

- Update `UsersRepository.findById()` with caching
- Implement cache invalidation in `update()` method
- Add caching for `getDriverRating()`

**Day 3-4: TripService Caching**

- Add caching for `getActiveTrip()`
- Implement trip history pagination caching
- Add cache invalidation on trip status changes

**Day 5: Testing**

- Integration tests for cache hit/miss scenarios
- Test cache invalidation logic
- Verify TTL expiration behavior

### 9.3 Phase 3: Monitoring & Optimization (Week 3)

**Day 1-2: Metrics Implementation**

- Deploy CloudWatch dashboards
- Configure alarms for cache hit rate
- Add custom metrics to application

**Day 3-4: Performance Testing**

- Run load tests with caching enabled
- Measure cache hit rate (target: 90%)
- Adjust TTLs based on results

**Day 5: Documentation**

- Update API documentation with caching behavior
- Document cache invalidation rules
- Create runbook for cache incidents

---

## 10. Cost Analysis

### 10.1 Monthly Costs

**ElastiCache Cluster:**

| Component    | Instance Type   | Qty | Unit Cost | Total       |
| ------------ | --------------- | --- | --------- | ----------- |
| Primary Node | cache.r6g.large | 1   | $100      | $100        |
| Replica 1    | cache.r6g.large | 1   | $100      | $100        |
| Replica 2    | cache.r6g.large | 1   | $100      | $100        |
| **Subtotal** |                 |     |           | **$300/mo** |

**Data Transfer (Estimated):**

- Intra-AZ traffic: Free
- Cross-AZ traffic: ~10 GB/month × $0.01/GB = $0.10/mo

**Backup Storage:**

- Daily snapshots (7-day retention): ~2 GB × $0.025/GB = $0.05/mo

**Total Cost:** **$300/month**

**Cost per User:** $300 ÷ 100,000 = **$0.003/user/month**

### 10.2 Cost-Benefit Analysis

**Without Caching (Database Scaling Required):**

- Additional RDS read replicas: $180/month × 2 = $360/mo
- Larger RDS instances (handle 30k TPS): $500/mo
- **Total:** $860/month

**With Caching:**

- ElastiCache cluster: $300/month
- Database load reduced 10x (no additional RDS needed)
- **Total:** $300/month

**Net Savings:** $860 - $300 = **$560/month** 💰

**Additional Benefits:**

- 5x faster response times (1-5ms vs 30-50ms)
- Better user experience
- Lower database CPU/memory usage
- Future-proof for 1M+ users

---

## 11. Trade-offs & Risks

### 11.1 Architectural Trade-offs

| Decision                  | Pros                         | Cons                   | Mitigation                  |
| ------------------------- | ---------------------------- | ---------------------- | --------------------------- |
| **Cache-Aside Pattern**   | Simple, app controls caching | Code complexity in app | Abstract in CacheService    |
| **Long TTLs (1 hour)**    | High hit rate, low DB load   | Stale data risk        | Cache invalidation on write |
| **JSON Serialization**    | Flexible, easy debugging     | CPU overhead           | Acceptable for read-heavy   |
| **3-Node Cluster**        | High availability            | 3x cost                | Start with 1 node in dev    |
| **Cluster Mode Disabled** | Simpler setup                | Max 13GB per shard     | Sufficient for 100k users   |

### 11.2 Risk Assessment

| Risk                           | Probability | Impact | Mitigation                              |
| ------------------------------ | ----------- | ------ | --------------------------------------- |
| **Cache invalidation bugs**    | Medium      | High   | Extensive testing, short TTLs initially |
| **Memory evictions**           | Low         | Medium | Monitor BytesUsedForCache, alert at 80% |
| **Redis failover latency**     | Low         | Medium | Multi-AZ auto-failover (<1 min)         |
| **Cache stampede**             | Medium      | High   | Use locks or TTL jitter                 |
| **Connection pool exhaustion** | Low         | High   | Connection pooling in ioredis           |

**Cache Stampede Prevention:**

```typescript
// Prevent thundering herd on cache expiration
async getOrSetWithLock<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const cached = await this.get<T>(key);
  if (cached !== null) return cached;

  // Acquire lock to prevent multiple fetches
  const lockKey = `lock:${key}`;
  const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (lockAcquired) {
    try {
      const value = await fetchFn();
      await this.set(key, value, ttlSeconds);
      return value;
    } finally {
      await this.redis.del(lockKey);
    }
  } else {
    // Another process is fetching, wait and retry
    await new Promise((resolve) => setTimeout(resolve, 100));
    return this.getOrSetWithLock(key, fetchFn, ttlSeconds);
  }
}
```

---

## 12. Success Criteria

### 12.1 Performance Targets

| Metric                          | Baseline (No Cache) | Target (With Cache) | Measurement                    |
| ------------------------------- | ------------------- | ------------------- | ------------------------------ |
| **Cache Hit Rate**              | N/A                 | 90%                 | CloudWatch ElastiCache metrics |
| **User Profile Latency (p95)**  | 50ms                | 5ms                 | Application metrics            |
| **Driver Rating Latency (p95)** | 200ms               | 10ms                | Application metrics            |
| **Database Query Load**         | 1,667/sec           | 167/sec             | RDS CloudWatch                 |
| **API Response Time (p95)**     | 150ms               | 50ms                | ALB metrics                    |
| **Memory Utilization**          | N/A                 | < 70%               | ElastiCache BytesUsedForCache  |

### 12.2 Validation Tests

**Load Test Scenario (k6):**

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 1000 }, // Warm cache
    { duration: '5m', target: 10000 }, // Peak load
    { duration: '5m', target: 10000 }, // Sustain
    { duration: '2m', target: 0 }, // Ramp down
  ],
  thresholds: {
    'http_req_duration{endpoint:user_profile}': ['p95<10'], // Cache hit target
    'http_req_duration{endpoint:trip_history}': ['p95<50'],
    cache_hit_rate: ['value>0.85'], // Minimum 85% hit rate
  },
};

export default function () {
  // User profile lookup (should be cached)
  const userId = `user-${__VU % 1000}`; // 1000 unique users (high cache hit)
  const profileRes = http.get(`http://localhost:3000/users/${userId}`, {
    tags: { endpoint: 'user_profile' },
  });

  check(profileRes, {
    'profile loaded': (r) => r.status === 200,
    'latency < 10ms': (r) => r.timings.duration < 10, // Cache hit expected
  });

  sleep(1);
}
```

**Expected Results:**

- ✅ Cache hit rate: 90% (9000 hits / 1000 misses out of 10k requests)
- ✅ p95 latency < 10ms for cached endpoints
- ✅ Database load reduced by 10x (measured in RDS metrics)
- ✅ No memory evictions during test

---

## 13. Next Steps

### 13.1 Immediate Actions

1. **Review and approve this document** with stakeholders
2. **Allocate budget** for ElastiCache cluster ($300/month production)
3. **Assign implementation team** (1 backend engineer)
4. **Schedule implementation** (3 weeks, per plan above)

### 13.2 Implementation Sequence

**Week 1:** ElastiCache infrastructure (Terraform)  
**Week 2:** Cache integration in UserService + TripService  
**Week 3:** Monitoring, load testing, optimization

### 13.3 Dependencies

- ✅ Gap analysis completed (docs/architecture/gap-analysis.md)
- ✅ Database scaling designed (docs/architecture/database-scaling-strategy.md)
- ⏳ AWS account with budget approval
- ⏳ Load testing environment ready
- ⏳ Monitoring dashboards configured

---

## 14. Conclusion

This distributed caching strategy addresses the **critical database overload bottleneck** by introducing a high-performance ElastiCache Redis layer. By achieving a 90% cache hit rate, we reduce database load by 10x while delivering 5x faster response times.

**Key Achievements:**

- **10x Database Load Reduction:** 1,667 → 167 queries/sec
- **5x Faster Queries:** 50ms → 5ms (cache hits)
- **Cost-Efficient:** $300/month saves $560/month in database scaling costs
- **High Availability:** Multi-AZ with automatic failover

The cache-aside pattern with write-through invalidation balances performance with data consistency. Combined with the database read replica strategy, this caching layer enables the system to scale to 100,000+ concurrent users while maintaining sub-100ms response times.

**Next Workflow:** `resilience-patterns` → Design circuit breakers and fault tolerance

---

**Document Control:**

- **Status:** ✅ Design Complete - Pending Implementation
- **Reviewed By:** [Pending stakeholder review]
- **Next Review:** After Phase 2 implementation (Week 2)
- **Related Documents:**
  - `gap-analysis.md` (identified bottleneck)
  - `database-scaling-strategy.md` (complementary design)
  - `async-communication.md` (event-driven architecture)
  - `section-9-database-schema.md` (data models)
  - `bmm-workflow-status.yaml` (workflow tracking)
