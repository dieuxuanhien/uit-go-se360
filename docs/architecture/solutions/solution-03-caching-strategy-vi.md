# Giải Pháp 3: Chiến Lược Caching (The "Short-Term Memory")

## 1. Bản Chất Vấn Đề: "Database Bottleneck"

**Vật lý:** Database query bao gồm network round-trip, parsing/planning, index/page read, và lock/IO contention. Dưới load, tail latency và contention thường là vấn đề thực sự

**Lãng phí:** Nhiều read lặp lại (profile/config/pricing rule), nên repeatedly hit primary DB đốt CPU/IOPS budget cho công việc giá trị thấp

**Chế độ thất bại:** Khi read traffic vượt sustainable capacity, queue hình thành (connection pool, DB worker process, storage). Latency tăng phi tuyến, và critical write bắt đầu timeout

## 2. Giải Pháp Kiến Trúc: "Memory-First Architecture"

Giới thiệu **Caching Layer** (Short-Term Memory) trước Database (Long-Term Memory).

### Pattern: "Cache-Aside" (Lazy Loading)

Không coi Cache như magic box. Application quản lý nó tường minh:

**1. Hỏi Cache:** "Bạn có Driver Profile cho ID 123?"

**2. Hit (Nhanh):** "Có, đây." (Thời gian: 1ms) → **Trả về User**

**3. Miss (Chậm):** "Không."
- Fetch từ Database (thường chậm hơn cache, đặc biệt dưới load)
- **Write vào Cache** với expiration (TTL)
- Trả về User

## 3. Tại Sao Giải Pháp Này Sửa Crash

- **Tốc độ:** Cache hit thường nhanh hơn và ổn định hơn database read dưới contention nhiều
- **Bảo vệ:** Hit rate cao giảm load trên primary database, bảo toàn capacity cho critical write
- **Chi phí:** Chuyển hot read sang Redis thường rẻ hơn scale primary database cho peak read traffic

## 4. Lựa Chọn Công Nghệ

**Option A: In-Memory (Node.js Map)**
- *Ưu:* Nhanh nhất (nanosecond)
- *Nhược:* Mất data khi restart; memory giới hạn ở container; không shared qua replica (inconsistent)
- *Verdict:* **Bị từ chối** (Cần stateless)

**Option B: Redis** ✅ **ĐÃ CHỌN**
- *Ưu:* Sub-millisecond latency, shared qua tất cả container, rich data structure (List, Set, Geo), tùy chọn persistence
- *Nhược:* Thêm infrastructure piece để quản lý
- *Verdict:* Industry standard

**Option C: Memcached**
- *Ưu:* Đơn giản, multi-threaded
- *Nhược:* Data structure giới hạn (không Geo), không persistence
- *Verdict:* **Bị từ chối.** Cần Geo feature cho driver location

## 5. Chiến Lược Triển Khai

### A. Redis Cluster Architecture (`docker-compose.redis-cluster.yml`)

Chạy 6-node Redis Cluster cho high availability và horizontal scaling.

```
┌──────────────────────────────────────────────────────────┐
│                Redis Cluster (6 Node)                    │
├──────────────────────────────────────────────────────────┤
│  Primary 1 ──► Replica 1   (Hash Slot 0-5460)           │
│  Primary 2 ──► Replica 2   (Hash Slot 5461-10922)       │
│  Primary 3 ──► Replica 3   (Hash Slot 10923-16383)      │
└──────────────────────────────────────────────────────────┘
```

Config chính:
```yaml
# docker-compose.redis-cluster.yml
redis-node-1:
  command: >
    redis-server
    --cluster-enabled yes
    --maxmemory 512mb
    --maxmemory-policy allkeys-lru  # Evict least-recently-used khi đầy
```

```typescript
// RedisService - Cluster mode với read scaling
this.client = new Cluster(nodes, {
  scaleReads: 'slave',  // Tùy chọn: đọc từ replica (tăng read capacity)
  maxRedirections: 16,  // Xử lý slot migration gracefully
});
```

### B. Wrapper Service (`packages/common-utils/src/cache/cache.service.ts`)

Không dùng Redis client trực tiếp. Wrap nó để xử lý serialization, error suppression, và metric.

```typescript
export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        this.metrics.misses++; // Track hiệu quả
        return null;
      }
      this.metrics.hits++;
      return JSON.parse(value); // Auto-deserialize
    } catch (err) {
      // FAIL OPEN: Nếu cache down, fallback DB âm thầm
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    // Auto-serialize và set Expiration (TTL)
    await this.client.setex(key, ttl, JSON.stringify(value));
  }
}
```

### C. Geospatial Caching (The "Killer Feature")

Sử dụng **quan trọng nhất** của Redis KHÔNG phải traditional caching—mà là **Geospatial Index** cho driver location.

#### Vấn Đề: "Tìm Tài Xế Gần"

Không có Redis, cần:
1. Query TẤT CẢ tài xế từ PostgreSQL
2. Tính distance cho MỖI tài xế dùng Haversine formula
3. Sort theo distance

*Độ phức tạp thời gian:* O(N) với N = tổng tài xế. Với 10,000 tài xế, mất **500ms+**

#### Giải Pháp: Redis GEORADIUS

Redis có geospatial command built-in dùng **Sorted Set + Geohash** bên dưới.

```typescript
// services/driver-service/src/drivers/drivers.service.ts

// 1. Khi tài xế update location → Lưu trong Redis Geo Index
await this.redisService.geoadd(
  'driver:geo',        // Key
  longitude, latitude, // Tọa độ (lưu ý: lng trước!)
  driverId             // Member
);

// 2. Khi user request trip → Tìm tài xế trong 5km
const nearbyDrivers = await this.redisService.georadius(
  'driver:geo',
  pickupLongitude, pickupLatitude,
  5, 'km',           // Bán kính
  'WITHDIST', 'ASC', // Trả về distance, sort gần nhất trước
  'COUNT', '10'      // Giới hạn 10 tài xế
);
// Trả về: [['driver-123', '1.2'], ['driver-456', '2.8'], ...]
```

*Độ phức tạp thời gian:* O(log N + M) với M = kết quả. Là **sub-millisecond** bất kể tổng tài xế

*Thực tế trong codebase:* Geo query thường nhanh, nhưng total endpoint latency có thể bao gồm công việc thêm (ví dụ: fetch status/location metadata qua `MGET`, JSON parsing, filtering). Cũng log warning nếu geospatial search vượt 500ms threshold

### D. Sử Dụng Trong Repository Layer

Áp dụng caching cho read operation volume cao, như fetch User Profile.

```typescript
// services/user-service/src/users/users.repository.ts

async findByIdWithCacheInfo(userId: string): Promise<CacheAwareResult<User>> {
  const cacheKey = `user:${userId}`;

  // 1. Thử Cache
  if (this.cacheService) {
    const cached = await this.cacheService.get<User>(cacheKey);
    if (cached) {
      return { data: cached, cacheHit: true };
    }
  }

  // 2. Fallback DB (Read Replica)
  const readClient = this.replicaService.getReadClient();
  const user = await readClient.user.findUnique({
    where: { id: userId },
  });

  // 3. Populate Cache (TTL: 1 giờ)
  if (user && this.cacheService) {
    await this.cacheService.set(cacheKey, user, this.userTTL);
  }

  return { data: user, cacheHit: false };
}
```

## 6. Trade-offs & Trạng Thái Giảm Thiểu

Caching giới thiệu vấn đề khó nhất trong computer science: **Cache Invalidation**.

### A. Trade-off: "Stale Data"

**Chi phí:** User update email, nhưng cache vẫn hiển thị email cũ trong 1 giờ

**Rủi ro:** Password reset email đi đến địa chỉ sai

**Trạng thái:** ✅ **ĐÃ GIẢM THIỂU (Đã triển khai)**
- **Chiến lược:** **Invalidate-on-Write**
- *Logic:* Trong `UsersRepository.update()`, tường minh gọi `cacheService.delete(\`user:${id}\`)`
- *Fallback:* TTL (1 giờ) đảm bảo data cuối cùng tự sửa

### B. Trade-off: "Cache Stampede" (Thundering Herd)

**Chi phí:** Cache key phổ biến expire (ví dụ: "Pricing Rule"). 1,000 request hit cache đồng thời, nhận "Miss", và TẤT CẢ 1,000 hit database cùng lúc

**Rủi ro:** Database crash ngay tức thì vào đúng thời điểm expiration

**Trạng thái:** ⏳ **CHƯA TRIỂN KHAI**
- **Rủi ro hiện tại:** Vừa phải
- **Giảm thiểu đã lên kế hoạch:** **Probabilistic Early Expiration** (X-Fetch) hoặc **Locking**
  - *Ý tưởng:* Nếu TTL < 5s, một random request re-fetch data trong khi các request khác serve data "stale"

### C. Trade-off: Serialization Overhead

**Chi phí:** `JSON.stringify` và `JSON.parse` là synchronous CPU work. Cho object nhỏ thường OK, nhưng payload lớn có thể thêm event loop delay

**Rủi ro:** CPU usage cao trên Node.js server nếu cache object khổng lồ (ví dụ: 1MB list)

**Trạng thái:** ✅ **ĐÃ GIẢM THIỂU (Design)**
- **Rule:** Chỉ cache entity nhỏ (Profile, Config)
- **Rule:** Không cache list lớn (ví dụ: "All Trip History"). Pagination xử lý bởi DB

### D. Trade-off: Redis Failure

**Chi phí:** Nếu Redis crash, tất cả traffic hit DB

**Rủi ro:** DB crash ngay lập tức (cascading failure)

**Trạng thái:** ⚙️ **ĐÃ GIẢM THIỂU MỘT PHẦN**
- **Đã triển khai:** `try/catch` block đảm bảo app không crash nếu Redis down
- **Thiếu:** **Circuit Breaker**. Nếu Redis down, nên ngừng thử connect trong 30s để tránh timeout latency

## 7. Tích Hợp Với Các Giải Pháp Khác

Caching không tồn tại riêng lẻ. Nó tạo thành phần của chiến lược **defense-in-depth**:

```
Request Flow:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  User   │───►│  Redis  │───►│ Replica │───►│ Primary │
│ Request │    │  Cache  │    │   DB    │    │   DB    │
└─────────┘    └────┬────┘    └────┬────┘    └────┬────┘
                   │              │              │
              Cache Hit       Replica Read    Primary Read
            (đường nhanh)   (đường fallback) (đường chậm)
```

- **Solution 3 (Cache):** Xử lý phần lớn hot read khi hit rate cao
- **Solution 4 (Replica):** Xử lý read load thêm mà không đẩy mọi thứ lên Primary
- **Kết quả:** Primary DB được bảo vệ cho critical write (Create Trip, Update Status)
