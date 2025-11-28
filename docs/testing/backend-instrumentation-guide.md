# Backend Instrumentation Guide for Module A Load Testing

## Overview

To capture infrastructure metrics during load testing, your backend services need to expose performance data via HTTP response headers. This guide shows how to instrument NestJS services to provide:

1. **Database Query Time** - How long DB queries take
2. **Cache Hit/Miss** - Whether data came from cache or DB
3. **Connection Pool Usage** - Active DB connections
4. **Query Source** - Whether query hit primary or replica

---

## 1. Database Query Time Instrumentation

### Option A: Prisma Middleware (Recommended)

Add to `services/*/src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    
    // Middleware to track query duration
    this.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;
      
      // Store duration in async context (see below)
      const store = getAsyncLocalStorage();
      if (store) {
        store.dbQueryTime = (store.dbQueryTime || 0) + duration;
      }
      
      return result;
    });
  }
}
```

### Option B: NestJS Interceptor

Create `services/*/src/common/interceptors/performance.interceptor.ts`:

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AsyncLocalStorage } from 'async_hooks';

// Global async storage for request context
export const performanceStorage = new AsyncLocalStorage();

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Initialize performance tracking
    const store = {
      dbQueryTime: 0,
      cacheHit: false,
      cacheChecked: false,
      poolActive: 0,
      querySource: 'primary',
    };
    
    return performanceStorage.run(store, () => {
      return next.handle().pipe(
        tap(() => {
          // Add custom headers with performance data
          if (store.dbQueryTime > 0) {
            response.setHeader('X-DB-Query-Time', store.dbQueryTime.toString());
          }
          if (store.cacheChecked) {
            response.setHeader('X-Cache-Hit', store.cacheHit ? 'true' : 'false');
          }
          if (store.poolActive > 0) {
            response.setHeader('X-Pool-Active', store.poolActive.toString());
          }
          if (store.querySource) {
            response.setHeader('X-Query-Source', store.querySource);
          }
        }),
      );
    });
  }
}
```

Register globally in `main.ts`:

```typescript
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new PerformanceInterceptor());
  await app.listen(3001);
}
```

---

## 2. Cache Hit Rate Instrumentation

Update your Redis cache service (`services/*/src/cache/cache.service.ts`):

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { performanceStorage } from '../common/interceptors/performance.interceptor';

@Injectable()
export class CacheService {
  constructor(private readonly redis: Redis) {}
  
  async get<T>(key: string): Promise<T | null> {
    const store = performanceStorage.getStore();
    
    const value = await this.redis.get(key);
    
    if (store) {
      store.cacheChecked = true;
      store.cacheHit = value !== null;
    }
    
    return value ? JSON.parse(value) : null;
  }
  
  async set(key: string, value: any, ttl: number): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

Update repository to use cache:

```typescript
// services/user-service/src/users/users.repository.ts
@Injectable()
export class UsersRepository {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}
  
  async findById(id: string) {
    // Try cache first
    const cacheKey = `user:${id}`;
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      return cached; // Cache hit tracked automatically
    }
    
    // Cache miss - query DB
    const user = await this.prisma.user.findUnique({ where: { id } });
    
    if (user) {
      await this.cache.set(cacheKey, user, 3600); // 1 hour TTL
    }
    
    return user;
  }
}
```

---

## 3. Connection Pool Usage Instrumentation

### For Prisma

Create a connection pool monitor:

```typescript
// services/*/src/prisma/pool-monitor.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { performanceStorage } from '../common/interceptors/performance.interceptor';

@Injectable()
export class PoolMonitorService {
  constructor(private prisma: PrismaService) {}
  
  async trackPoolUsage() {
    const store = performanceStorage.getStore();
    if (!store) return;
    
    // Query Prisma connection pool metrics
    // Note: This requires Prisma 4.7+ with metrics preview feature
    const metrics = await this.prisma.$metrics.json();
    
    // Extract active connections
    const poolMetric = metrics.counters.find(
      m => m.key === 'prisma_client_queries_active'
    );
    
    if (poolMetric) {
      store.poolActive = poolMetric.value;
    }
  }
}
```

Alternative: Track manually in queries:

```typescript
// Simpler approach without Prisma metrics
async findById(id: string) {
  const store = performanceStorage.getStore();
  if (store) {
    store.poolActive++; // Increment on query start
  }
  
  try {
    const result = await this.prisma.user.findUnique({ where: { id } });
    return result;
  } finally {
    if (store) {
      store.poolActive--; // Decrement on query end
    }
  }
}
```

---

## 4. Read Replica Source Tracking

Update your PrismaReplicaService (`services/*/src/prisma/prisma-replica.service.ts`):

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { performanceStorage } from '../common/interceptors/performance.interceptor';

@Injectable()
export class PrismaReplicaService {
  constructor(
    private primaryClient: PrismaService,
    private replicaClients: PrismaService[],
  ) {}
  
  // For read operations - use replica
  async executeRead<T>(operation: (client: PrismaService) => Promise<T>): Promise<T> {
    const store = performanceStorage.getStore();
    
    // Round-robin replica selection
    const replica = this.replicaClients[
      Math.floor(Math.random() * this.replicaClients.length)
    ];
    
    try {
      const result = await operation(replica);
      
      // Track that we used a replica
      if (store) {
        store.querySource = 'replica';
      }
      
      return result;
    } catch (error) {
      // Fallback to primary
      console.warn('Replica read failed, falling back to primary', error);
      
      const result = await operation(this.primaryClient);
      
      if (store) {
        store.querySource = 'primary-fallback';
      }
      
      return result;
    }
  }
  
  // For write operations - always use primary
  async executeWrite<T>(operation: (client: PrismaService) => Promise<T>): Promise<T> {
    const store = performanceStorage.getStore();
    
    if (store) {
      store.querySource = 'primary';
    }
    
    return operation(this.primaryClient);
  }
}
```

Update repositories to use PrismaReplicaService:

```typescript
@Injectable()
export class UsersRepository {
  constructor(private replicaService: PrismaReplicaService) {}
  
  // Read operation
  async findById(id: string) {
    return this.replicaService.executeRead(
      client => client.user.findUnique({ where: { id } })
    );
  }
  
  // Write operation
  async create(data: CreateUserDto) {
    return this.replicaService.executeWrite(
      client => client.user.create({ data })
    );
  }
}
```

---

## 5. Quick Setup Checklist

### User Service

- [ ] Add PerformanceInterceptor to `main.ts`
- [ ] Update PrismaService with query duration middleware
- [ ] Update CacheService to track hits/misses
- [ ] Update UsersRepository to use cache + replicas
- [ ] Test: `curl -I http://localhost:3001/users/me` should show `X-DB-Query-Time`, `X-Cache-Hit` headers

### Trip Service

- [ ] Add PerformanceInterceptor to `main.ts`
- [ ] Update PrismaService with query duration middleware
- [ ] Update CacheService to track hits/misses (if caching trips)
- [ ] Update TripsRepository to use replicas
- [ ] Test: `curl -I http://localhost:3002/trips/:id` should show performance headers

### Driver Service

- [ ] Add PerformanceInterceptor to `main.ts`
- [ ] Update location update endpoint to track Redis write time
- [ ] Update driver search to track geospatial query time
- [ ] Test: `curl -I http://localhost:3003/drivers/location` should show performance headers

---

## 6. Example Response Headers

After instrumentation, your API responses should include:

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-DB-Query-Time: 23.5
X-Cache-Hit: true
X-Pool-Active: 3
X-Query-Source: replica
Content-Length: 245

{
  "user": { ... }
}
```

These headers are automatically captured by the k6 test script via `extractInfraMetrics()` function.

---

## 7. Testing Instrumentation

Quick test script to verify headers:

```bash
#!/bin/bash
# Test performance headers

echo "Testing User Service..."
curl -I http://localhost:3001/users/me -H "Authorization: Bearer YOUR_TOKEN"

echo -e "\nTesting Trip Service..."
curl -I http://localhost:3002/trips/TRIP_ID -H "Authorization: Bearer YOUR_TOKEN"

echo -e "\nTesting Driver Service..."
curl -I http://localhost:3003/drivers/location \
  -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lat":10.762622,"lng":106.660172}'
```

Expected output should include `X-DB-Query-Time`, `X-Cache-Hit`, etc.

---

## 8. Optional: Prometheus Metrics (Advanced)

For production-grade monitoring, consider also exposing metrics via Prometheus:

```bash
npm install @willsoto/nestjs-prometheus prom-client
```

```typescript
// main.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
})
export class AppModule {}
```

This gives you `/metrics` endpoint that k6 can also scrape.

---

## Summary

With these instrumentations in place, your k6 load tests will capture:

✅ **Database query performance** (X-DB-Query-Time)
✅ **Cache effectiveness** (X-Cache-Hit)
✅ **Connection pool utilization** (X-Pool-Active)
✅ **Read replica usage** (X-Query-Source)

All metrics will be visible in k6 output under:
- `db_query_duration` (trend)
- `cache_hit_rate` (rate)
- `connection_pool_usage` (gauge)
- `replica_query_rate` (rate)

This data is critical for your Module A report's infrastructure analysis section! 📊
