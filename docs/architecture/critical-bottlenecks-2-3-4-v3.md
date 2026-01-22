# 2. No Reactive Autoscaling (Delayed Scaling Response)

## Anti-Pattern

Services run on fixed container count (e.g., `replicas: 2`) with **no reactive autoscaling mechanism**. Scaling relies on manual intervention or scheduled scaling alone.

> **Example:** Traffic spikes 10× in 2 minutes → Fixed 2 replicas overwhelmed → 5xx errors → Ops team notices after 3 minutes → Manual scale-up takes 2 more minutes → 5 minutes of degradation.

## Critical Definitions

> ⚠️ **Read these first** — understanding these terms is essential before proceeding.

| Term | Definition | Source |
|------|------------|--------|
| **Reactive Autoscaling** | Automatic capacity adjustment based on real-time metrics (CPU, RPS, latency). Responds to actual load. | [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) |
| **Scheduled Scaling** | Time-based rules from historical patterns (e.g., "20 instances at 7 AM"). Handles **predictable** load. | [AWS Auto Scaling](https://docs.aws.amazon.com/autoscaling/) |
| **Eventual Scalability** | Systems scale in response to load, but with inherent delay (1-5 minutes). During lag, existing capacity absorbs spike. | AWS EKS Best Practices |
| **Cold Start** | New containers start with empty caches, cold JIT, no connections. Performance degraded until warmed up. | [Netflix Tech Blog](https://netflixtechblog.com/) |

> **Key Distinction:** Scheduled scaling handles **predictable** patterns. Reactive autoscaling handles **unpredictable** spikes. Production systems need both.

## Core Problem: "Eventual Scalability" Lag

Even with reactive autoscaling enabled, there's an inherent delay between spike and new capacity being ready:

| Component | Typical Duration |
|-----------|------------------|
| Metric polling interval | 15-60 seconds |
| Control plane processing | 5-30 seconds |
| Container scheduling | 10-60 seconds |
| Application initialization | 30-300 seconds |
| **Total lag** | **1-5 minutes** |

> **Critical Insight:** During this lag, incoming requests hit existing capacity. If spike velocity exceeds scaling velocity, degradation occurs before new capacity is ready.

<details>
<summary><strong>📖 Deep Dive: Why Manual/Scheduled-Only Scaling Is Insufficient</strong></summary>

**Scheduled Scaling Limitations:**
- ✅ Handles predictable patterns (morning rush, evening lull)
- ❌ Cannot predict sudden weather, accidents, viral events
- ❌ Scheduled rules become stale as patterns change

**Manual Scaling with Observability:**
- ✅ Better than pure static (ops can react to dashboards)
- ❌ Human decision delay: see → decide → act takes 30-60+ seconds minimum
- ❌ 24/7 coverage gap: ops team isn't monitoring at 2 AM Sunday
- ❌ Alert fatigue: too many alerts → slow response

**The Core Gap: Unpredictable Spikes**

Even with scheduled scaling for predictable patterns, **unpredictable spikes** cannot be handled by static configuration:

- **Sudden rain** → Demand spikes 5× in minutes
- **Concert ends** → 10,000 people need rides simultaneously  
- **Viral event** → Unexpected surge with no historical pattern

No amount of historical data or scheduled rules can predict these.

</details>

<details>
<summary><strong>📖 Deep Dive: Industry Evidence</strong></summary>

**Lyft Engineering:** Uses service mesh (Envoy) to handle up to **8× traffic increases** during peak demand. Developed *SimulatedRides* load testing platform to identify bottlenecks before production failures. *(Source: Lyft Engineering Blog)*

**Uber Engineering:** Microservices like "Ride Request" dynamically adjust instance count based on incoming requests and response time. Proactive scaling ensures low latency during surges. *(Source: Uber Engineering Blog)*

**Google SRE:** Emphasizes that manual processes are "prone to errors and do not scale efficiently." Autoscaling is a primary mechanism for capacity management, but acknowledges the need for **"kill switches and manual overrides"** as safety mechanisms. *(Source: Google SRE Book)*

</details>

## Critical Impacts

| Impact | Description |
|--------|-------------|
| **Hard Capacity Ceiling** | Traffic exceeds capacity → queues grow → latency spikes non-linearly → timeouts → 5xx errors |
| **Retry Amplification** | Client/proxy retries amplify load exponentially (K^N) during overload |
| **Resource Exhaustion** | Memory, connections, GC pressure hit limits before CPU reaches 100% |
| **Cascading Failures** | Even with autoscaling, extreme unexpected load can cause cascading failures |

## Solution Direction

**Best Practice (AWS/Kubernetes):** Combine:
- **Scheduled scaling** for predictable baselines
- **Reactive autoscaling** (HPA, Karpenter) for unpredictable spikes
- **Predictive scaling** (ML-based forecasting where available)
- **Load shedding + Circuit breakers** as safety nets

---

## Cache Warm-up Strategy (Mitigating Cold Start)

> **References:** [Netflix Tech Blog](https://netflixtechblog.com/), [Uber Engineering - CacheFront](https://eng.uber.com/), [Kubernetes Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/)

### The Cold Start Problem

When new pods spin up during autoscaling:
1. **Empty cache** → All requests hit database directly
2. **Empty connection pools** → Time to establish connections
3. **Cold JIT/V8** → Node.js needs time to optimize hot paths
4. **Thundering herd** → Multiple cold requests for same key overwhelm DB

> **Industry Insight (Netflix):** "Cold start kills" - Netflix developed Cache Warmer to move petabytes of data (up to 700 TB, 46 billion items) between cache clusters.

### What CAN vs. CANNOT Be Warmed (Ride-Hailing Context)

| Data Category | Warmable? | Strategy |
|---------------|-----------|----------|
| **Driver/Rider Profiles** | ✅ Yes | Init container loads top N active users |
| **Pricing zones/rules** | ✅ Yes | Pre-load from config store at startup |
| **Geo-fencing polygons** | ✅ Yes | Bulk load from DB |
| **Vehicle types/categories** | ✅ Yes | Configuration pre-load |
| **Live driver locations** | ❌ No | Streaming data, stale in seconds |
| **Active trip state** | ❌ No | Changes every second (ETA, position) |
| **Surge pricing** | ❌ No | Calculated real-time from supply/demand |
| **Matching results** | ❌ No | Per-request computation |
| **Connection pools** | ⚠️ Partial | Can pre-establish minimum connections |

<details>
<summary><strong>📖 Deep Dive: Industry Best Practices for Cache Warm-up</strong></summary>

**1. Kubernetes Init Containers**
```yaml
initContainers:
  - name: cache-warmer
    image: myapp-warmer:latest
    command: ['./warm-cache.sh']
    # Runs to completion BEFORE main container starts
```
- Pre-populate Redis with top 1000 active drivers
- Main container only starts AFTER warm-up complete

**2. Readiness Probe Separation**
```yaml
readinessProbe:
  httpGet:
    path: /health/ready  # Returns 200 only after cache warm
  initialDelaySeconds: 30
  periodSeconds: 5
```
Pod marked "ready" only AFTER cache populated + connections established.

**3. Staggered Traffic Ramp-up (Netflix/Uber Pattern)**
```
New Pod Lifecycle:
1. Boot container (30s)
2. Run init container - warm cache (60s)
3. Establish connection pools (10s)
4. Pass readiness probe
5. Load balancer sends 10% traffic
6. ... gradually increase to 100%
```

**4. Request Coalescing (Singleflight)**
```
Without Coalescing:
100 requests for "driver-123" → 100 DB queries

With Coalescing:
100 requests for "driver-123" → 1 DB query → 100 responses
```
Prevents cache stampede during cold start.

**5. Uber's CacheFront Strategy**
- Replicate only cache **keys** (not values) across regions
- Local read triggers DB fetch → populate Redis
- Ensures consistency, avoids stale data replication

</details>

### Practical Warm-up Sequence

```
Container Startup Sequence:
┌─────────────────────────────────────────────────────────────┐
│ 1. Pre-establish DB connection pool (min: 10, max: 50)     │
├─────────────────────────────────────────────────────────────┤
│ 2. Warm Redis with:                                        │
│    ├── Top 1000 active drivers (by last_activity)          │
│    ├── All pricing zones/rules                             │
│    ├── Geo-fencing polygons                                │
│    └── Vehicle type master data                            │
├─────────────────────────────────────────────────────────────┤
│ 3. Establish external service connections                   │
├─────────────────────────────────────────────────────────────┤
│ 4. Mark pod "ready" (pass readiness probe)                  │
├─────────────────────────────────────────────────────────────┤
│ 5. Load balancer gradually increases traffic                │
│    0% → 10% → 25% → 50% → 100%                             │
└─────────────────────────────────────────────────────────────┘
```

---

---

# 3. Unoptimized Data Retrieval (Hot Path Bottleneck)

## Anti-Pattern

All requests (User Profile, Trip History) hit Primary Database directly. No caching layer (Redis/Memcached).

> **Example:** 5000 drivers ping "Get My Profile" every 10s → 30,000 queries/min for static data → Connection pool exhausted → "Create Trip" times out waiting for connection.

## Critical Definitions

> ⚠️ **Read these first** — understanding these terms is essential before proceeding.

| Term | Definition | Source |
|------|------------|--------|
| **Hot Data** | 10% of data receiving 90% of traffic (Profiles, Active Trips). Repeatedly queried but rarely changes. | Pareto Principle |
| **Connection Pool** | Fixed set of reusable database connections. PostgreSQL: ~9MB RAM per connection. | [PgBouncer Docs](https://www.pgbouncer.org/) |
| **Cache-Aside** | App checks cache first, DB on miss, populates cache. Most common caching pattern. | [Microsoft Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside) |
| **Read Amplification** | Single user action triggers multiple redundant queries for same data. | Database Performance |

> **Key Insight:** PostgreSQL uses **shared buffers** (in-memory cache), so hot data is often served from RAM. The bottleneck is **connection overhead and pool exhaustion**, not disk I/O.

## Core Problem: Connection Pool as Bottleneck

> **Common Myth:** "The database is slow because B-tree is O(log N) while cache is O(1)."
> 
> **Reality:** For indexed lookups, algorithmic complexity difference is negligible. The **real costs** are:

| Cost Factor | Database (Even with Index) | In-Memory Cache (Redis) |
|-------------|---------------------------|-------------------------|
| **Connection overhead** | Each query requires connection (~1-5ms) | Connection persistent, pipelined |
| **Network round-trip** | App → DB → App (~0.5-1ms) | Redis protocol optimized |
| **Query parsing** | Every query parsed, planned | Direct key lookup |
| **Connection pool exhaustion** | Limited slots (e.g., 100) | Thousands of concurrent ops |

### PostgreSQL Connection Cost

PostgreSQL is **process-per-connection** (~9MB RAM per connection):

```
PostgreSQL max_connections = 100 (typical)
Each connection = 1 process = ~9MB RAM

100 connections × 9MB = 900MB just for connection overhead
```

**Failure Mode:**
1. Pool saturated with 100 "Get Profile" queries (fast but high-volume)
2. "Create Trip" (Write) cannot acquire connection → timeout
3. System fails from **connection exhaustion**, not DB compute overload

<details>
<summary><strong>📖 Deep Dive: Why Cache-Aside Is Not "Simple"</strong></summary>

> **Myth:** "Cache-aside is simple to implement."
>
> **Reality:** Correct implementation requires handling:

| Challenge | What Can Go Wrong |
|-----------|-------------------|
| **Cache stampede** | Cache expires → 1000 requests hit DB simultaneously |
| **TTL tuning** | Too short = cache useless; too long = stale data |
| **Invalidation on writes** | Forgot to invalidate → users see stale data |
| **Serialization format** | JSON vs MessagePack vs Protobuf performance |
| **Error handling** | Cache down → should you fail or bypass? |
| **Memory limits** | Redis OOM → eviction policy matters |

**Cache Stampede Mitigation:**
- **Probabilistic early expiration:** Refresh before TTL expires
- **Singleflight pattern:** Coalesce concurrent requests for same key
- **Background refresh:** Async update before expiration

</details>

## Critical Impacts

| Impact | Description |
|--------|-------------|
| **Read Amplification** | 5000 drivers × 6 polls/min = 30,000 queries/min for static data |
| **Connection Exhaustion** | Pool saturated with reads → writes blocked → critical transactions fail |
| **Queue-Induced Latency** | Request rate > pool capacity → latency rises non-linearly (Little's Law) |
| **Tail Latency Explosion** | P99 latency spikes → user-visible impact |

## Solution Direction

### 1. Caching Layer (Redis)

| Strategy | How It Works | Trade-offs |
|----------|-------------|------------|
| **Cache-Aside** | Check cache first, DB on miss | Simple; stale data risk |
| **Write-Through** | Write to cache AND DB | Always fresh; slower writes |
| **Write-Behind** | Write to cache, async sync to DB | Fast writes; data loss risk |

### 2. Connection Pooling (PgBouncer)

| Direct Connections | With PgBouncer |
|-------------------|----------------|
| 2,000 connections = 4-8 GB RAM | 100 pooled connections = 200-400 MB |
| Each app maintains own pool | Single pool multiplexes all apps |

**Recommended:** Transaction pooling mode (connection returned after each transaction).

### 3. Read Replicas

Offload read traffic from primary. **Caveat:** Replicas are eventually consistent—"read-your-writes" flows need routing to primary.

---

---

# 4. Single Primary Database (Vertical Scaling Wall)

## Anti-Pattern

All services connect to single primary database node for both reads and writes. No Read Replicas and no automated failover.

> **Example:** Primary fails → All services hang → Manual intervention required → 30+ minutes to promote standby → Total outage.

## Critical Definitions

> ⚠️ **Read these first** — understanding these terms is essential before proceeding.

| Term | Definition | Source |
|------|------------|--------|
| **SPOF** | Single Point of Failure. One component whose failure causes total system outage. | [Google SRE Book](https://sre.google/sre-book/table-of-contents/) |
| **Streaming Replication** | Primary streams WAL to replicas in real-time. Replicas can serve reads. | [PostgreSQL Docs](https://www.postgresql.org/docs/current/warm-standby.html) |
| **Synchronous Replication** | Primary waits for replica to confirm write. Zero data loss; higher latency. | PostgreSQL Docs |
| **Asynchronous Replication** | Primary commits without waiting. Faster; risk of data loss on failure. | PostgreSQL Docs |
| **Patroni** | Industry-standard PostgreSQL HA tool. Automates failover, leader election. | [Patroni Docs](https://patroni.readthedocs.io/) |

> **Key Insight:** PostgreSQL has **no native automatic failover**. Without external tooling (Patroni), primary failure = full outage until manual intervention.

## Core Problem: Resource Contention + SPOF

### Reader-Writer Contention

> **Common Myth:** "Writes starve because reads monopolize CPU."
>
> **Reality:** The bottleneck is usually **connection pool exhaustion** and **lock contention**, not CPU:

| Resource | How Reads Hurt Writes |
|----------|----------------------|
| **Connection Pool** | "Get Status" queries hold connections; pool exhausted before "Create Trip" can acquire |
| **Shared Buffers** | High-volume reads cause buffer churn; write working set evicted |
| **Row-level Locks** | Long-running reads can block writers (depending on isolation level) |
| **WAL Write Amplification** | Under load, fsync latency increases for all transactions |

### Vertical Scaling Limits

> **Myth:** "Just get a bigger server."

| Limit Type | Concrete Example |
|------------|------------------|
| **Hardware ceiling** | Cloud max: ~128 vCPUs, ~4TB RAM |
| **Cost exponential** | Doubling capacity often 3-4× cost |
| **Connection limit** | PostgreSQL ~100 connections practical (9MB each) |
| **Downtime required** | Vertical scaling often requires restart |

<details>
<summary><strong>📖 Deep Dive: Replication Modes & Trade-offs</strong></summary>

PostgreSQL streaming replication enables horizontal scaling for reads:

| Replication Mode | How It Works | Trade-off |
|------------------|-------------|-----------|
| **Asynchronous** (default) | Primary commits without waiting | Faster writes; stale reads; potential data loss |
| **Synchronous** | Primary waits for replica confirm | Zero data loss; slower writes |
| **Synchronous Apply** | Primary waits for replica to apply | Strongest consistency; highest latency |

> **Myth Correction:** "CAP theorem means replicas are always eventually consistent."
>
> **Reality:** CAP theorem is about behavior during **network partitions**, not normal operation. With synchronous replication, PostgreSQL provides strong consistency (at cost of availability during replica failure). *(Source: Kleppmann, DDIA, Ch.5)*

---

**Read-Your-Writes Challenge:**

When user creates a trip and immediately reads it, they may see stale data from async replica:

| Strategy | Implementation | Trade-off |
|----------|---------------|-----------|
| **Read from primary after write** | Route post-write reads to primary for N seconds | Simple; adds primary load |
| **Session stickiness** | All requests in session go to same node | Can cause hotspots |
| **Version checks** | Include write timestamp in read request | Complex; requires app changes |
| **Synchronous replication** | No stale reads | Write latency penalty |

</details>

## Critical Impacts

| Impact | Description |
|--------|-------------|
| **Single Point of Failure** | Primary fails → all services hang → manual intervention required |
| **Resource Starvation** | 1000 users polling status → connection pool exhausted → "Book Trip" blocked |
| **Replication Lag** | Async replicas lag under high write load → users see stale data |
| **No Automatic Recovery** | PostgreSQL has no native auto-failover → minutes to hours of downtime |

## Solution Direction

### 1. High Availability with Patroni

**Patroni** is industry standard for PostgreSQL HA (used by GitLab, Zalando):

| Component | Role |
|-----------|------|
| **Patroni** | Manages nodes, leader election, automates failover |
| **etcd/Consul/ZooKeeper** | Distributed config store for cluster state |
| **HAProxy** | Routes read/write traffic to correct node |

**Failover Process:**
1. Primary fails → Patroni detects via health check
2. Leader election among replicas (etcd consensus)
3. Most up-to-date replica promoted to primary
4. HAProxy automatically routes to new primary

### 2. Read Replicas for Scale

| Configuration | Use Case |
|---------------|----------|
| **1 Primary + 1 Sync Standby** | HA with zero data loss |
| **1 Primary + N Async Replicas** | Read scaling with some lag tolerance |
| **Hybrid** | 1 sync for HA, N async for read load |

### 3. Connection Pooling (PgBouncer)

- Place PgBouncer in front of Patroni
- Transaction pooling mode
- Multiplexes thousands of app connections into ~100 DB connections

### 4. Monitoring Essentials

| Metric | Why It Matters |
|--------|----------------|
| **Replication lag** | Stale reads if lag > threshold |
| **Connection pool utilization** | Approaching limit = imminent failures |
| **WAL generation rate** | High rate can cause replica lag |
| **Failover time** | Test regularly; should be < 30 seconds |

---

---

---

# TIẾNG VIỆT

# 2. Thiếu Reactive Autoscaling (Phản ứng Scale chậm trễ)

## Anti-Pattern (Mô hình sai lầm)

Service chạy với số lượng container cố định (ví dụ: `replicas: 2`) **không có cơ chế autoscaling reactive**. Scale dựa vào can thiệp thủ công hoặc scheduled scaling.

> **Ví dụ:** Traffic tăng 10× trong 2 phút → 2 replica cố định quá tải → lỗi 5xx → Đội ops phát hiện sau 3 phút → Scale thủ công mất thêm 2 phút → 5 phút suy giảm.

## Định nghĩa quan trọng

> ⚠️ **Đọc trước** — hiểu các thuật ngữ này là cần thiết trước khi tiếp tục.

| Thuật ngữ | Định nghĩa | Nguồn |
|-----------|------------|-------|
| **Reactive Autoscaling** | Điều chỉnh capacity tự động dựa trên metric real-time (CPU, RPS, latency). | [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) |
| **Scheduled Scaling** | Quy tắc dựa trên thời gian từ pattern lịch sử (ví dụ: "20 instance lúc 7 AM"). | [AWS Auto Scaling](https://docs.aws.amazon.com/autoscaling/) |
| **Eventual Scalability** | Hệ thống scale theo tải, nhưng có độ trễ cố hữu (1-5 phút). | AWS EKS Best Practices |
| **Cold Start** | Container mới khởi động với cache trống, JIT lạnh, không connection. | [Netflix Tech Blog](https://netflixtechblog.com/) |

> **Phân biệt:** Scheduled scaling xử lý pattern **dự đoán được**. Reactive autoscaling xử lý spike **không dự đoán được**. Production cần cả hai.

## Vấn đề cốt lõi: Độ trễ "Eventual Scalability"

Ngay cả với reactive autoscaling, có độ trễ cố hữu giữa spike và capacity mới sẵn sàng:

| Thành phần | Thời gian điển hình |
|-----------|---------------------|
| Interval polling metric | 15-60 giây |
| Xử lý control plane | 5-30 giây |
| Scheduling container | 10-60 giây |
| Khởi tạo ứng dụng | 30-300 giây |
| **Tổng độ trễ** | **1-5 phút** |

> **Insight quan trọng:** Trong khoảng trễ này, request đổ vào capacity hiện có. Nếu tốc độ spike > tốc độ scale, suy giảm xảy ra trước khi capacity mới sẵn sàng.

<details>
<summary><strong>📖 Chi tiết: Tại sao Scale thủ công/Scheduled không đủ</strong></summary>

**Giới hạn Scheduled Scaling:**
- ✅ Xử lý pattern dự đoán được (rush giờ sáng, lull buổi tối)
- ❌ Không thể dự đoán thời tiết đột ngột, tai nạn, sự kiện viral
- ❌ Quy tắc scheduled trở nên lỗi thời khi pattern thay đổi

**Scale thủ công với Observability:**
- ✅ Tốt hơn static thuần (ops phản ứng với dashboard)
- ❌ Độ trễ quyết định: thấy → quyết định → hành động mất 30-60+ giây
- ❌ Khoảng trống 24/7: đội ops không giám sát lúc 2 AM Chủ nhật
- ❌ Alert fatigue: quá nhiều alert → phản ứng chậm

**Khoảng trống cốt lõi: Spike không dự đoán được**

- **Mưa đột ngột** → Nhu cầu tăng 5× trong vài phút
- **Concert kết thúc** → 10,000 người cần xe cùng lúc
- **Sự kiện viral** → Surge bất ngờ không có pattern lịch sử

</details>

<details>
<summary><strong>📖 Chi tiết: Bằng chứng từ Industry</strong></summary>

**Lyft Engineering:** Dùng service mesh (Envoy) xử lý tăng **8× traffic** trong peak demand. Phát triển *SimulatedRides* để phát hiện bottleneck trước khi production failure.

**Uber Engineering:** Microservice như "Ride Request" điều chỉnh instance count động dựa trên request và response time. Proactive scaling đảm bảo latency thấp trong surge.

**Google SRE:** Nhấn mạnh quy trình thủ công "dễ lỗi và không scale hiệu quả." Autoscaling là cơ chế chính cho capacity management, nhưng cần **"kill switch và manual override"** làm safety mechanism.

</details>

## Tác động nghiêm trọng

| Tác động | Mô tả |
|----------|-------|
| **Trần dung lượng cứng** | Traffic vượt capacity → queue tăng → latency phi tuyến → timeout → lỗi 5xx |
| **Khuếch đại Retry** | Client/proxy retry khuếch đại tải lũy thừa (K^N) trong overload |
| **Cạn kiệt tài nguyên** | Memory, connection, GC pressure đạt limit trước CPU 100% |
| **Sự cố lan truyền** | Ngay cả với autoscaling, tải cực đoan có thể gây cascading failure |

## Hướng giải pháp

**Best Practice (AWS/Kubernetes):** Kết hợp:
- **Scheduled scaling** cho baseline dự đoán được
- **Reactive autoscaling** (HPA, Karpenter) cho spike không dự đoán được
- **Predictive scaling** (ML-based forecasting nếu có)
- **Load shedding + Circuit breaker** làm safety net

---

## Chiến lược Làm ấm Cache (Giảm thiểu Cold Start)

### Vấn đề Cold Start

Khi pod mới khởi động trong autoscaling:
1. **Cache trống** → Tất cả request đánh thẳng database
2. **Connection pool trống** → Mất thời gian thiết lập
3. **JIT/V8 lạnh** → Node.js cần thời gian tối ưu hot path
4. **Thundering herd** → Nhiều cold request cho cùng key làm quá tải DB

### Dữ liệu CÓ THỂ vs. KHÔNG THỂ Làm ấm

| Loại dữ liệu | Làm ấm được? | Chiến lược |
|--------------|-------------|------------|
| **Profile Tài xế/Khách** | ✅ Có | Init container load top N user active |
| **Vùng/quy tắc giá** | ✅ Có | Pre-load từ config store khi startup |
| **Polygon geo-fencing** | ✅ Có | Bulk load từ DB |
| **Loại xe/danh mục** | ✅ Có | Pre-load cấu hình |
| **Vị trí tài xế live** | ❌ Không | Streaming data, cũ trong giây |
| **Trạng thái trip active** | ❌ Không | Thay đổi mỗi giây |
| **Giá surge** | ❌ Không | Tính real-time từ supply/demand |
| **Kết quả matching** | ❌ Không | Tính toán per-request |
| **Connection pool** | ⚠️ Một phần | Pre-establish connection tối thiểu |

<details>
<summary><strong>📖 Chi tiết: Best Practice từ Industry</strong></summary>

**1. Kubernetes Init Container**
```yaml
initContainers:
  - name: cache-warmer
    command: ['./warm-cache.sh']
    # Chạy hoàn thành TRƯỚC container chính
```

**2. Tách biệt Readiness Probe**
```yaml
readinessProbe:
  httpGet:
    path: /health/ready  # Trả 200 chỉ sau cache warm
```
Pod "ready" chỉ SAU KHI cache populated + connection established.

**3. Tăng Traffic từ từ (Netflix/Uber Pattern)**
```
0% → 10% → 25% → 50% → 100%
```
Ngăn thundering herd trên pod mới.

**4. Request Coalescing (Singleflight)**
```
100 request cho "driver-123" → 1 DB query → 100 response
```
Ngăn cache stampede trong cold start.

</details>

### Trình tự Làm ấm thực tế

```
Trình tự Khởi động Container:
┌─────────────────────────────────────────────────────────────┐
│ 1. Pre-establish DB connection pool (min: 10, max: 50)     │
├─────────────────────────────────────────────────────────────┤
│ 2. Warm Redis với:                                         │
│    ├── Top 1000 tài xế active                              │
│    ├── Tất cả pricing zone/rule                            │
│    ├── Geo-fencing polygon                                 │
│    └── Vehicle type master data                            │
├─────────────────────────────────────────────────────────────┤
│ 3. Thiết lập connection external service                    │
├─────────────────────────────────────────────────────────────┤
│ 4. Đánh dấu pod "ready"                                     │
├─────────────────────────────────────────────────────────────┤
│ 5. Load balancer tăng dần traffic                           │
│    0% → 10% → 25% → 50% → 100%                             │
└─────────────────────────────────────────────────────────────┘
```

---

---

# 3. Truy xuất Dữ liệu Chưa Tối ưu (Hot Path Bottleneck)

## Anti-Pattern (Mô hình sai lầm)

Tất cả request (User Profile, Trip History) truy cập Primary Database trực tiếp. Không có caching layer (Redis/Memcached).

> **Ví dụ:** 5000 tài xế ping "Get My Profile" mỗi 10s → 30,000 query/phút cho dữ liệu tĩnh → Connection pool cạn → "Create Trip" timeout chờ connection.

## Định nghĩa quan trọng

> ⚠️ **Đọc trước** — hiểu các thuật ngữ này là cần thiết trước khi tiếp tục.

| Thuật ngữ | Định nghĩa | Nguồn |
|-----------|------------|-------|
| **Hot Data** | 10% dữ liệu nhận 90% traffic (Profile, Active Trip). Query lặp lại nhưng ít thay đổi. | Nguyên lý Pareto |
| **Connection Pool** | Tập connection database tái sử dụng. PostgreSQL: ~9MB RAM mỗi connection. | [PgBouncer](https://www.pgbouncer.org/) |
| **Cache-Aside** | App kiểm tra cache trước, DB khi miss, populate cache. Pattern phổ biến nhất. | [Microsoft Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside) |
| **Read Amplification** | Một hành động user kích hoạt nhiều query dư thừa cho cùng dữ liệu. | Database Performance |

> **Insight quan trọng:** PostgreSQL dùng **shared buffers** (cache trong memory), nên hot data thường phục vụ từ RAM. Bottleneck là **overhead connection và cạn kiệt pool**, không phải disk I/O.

## Vấn đề cốt lõi: Connection Pool là Bottleneck

> **Hiểu lầm:** "Database chậm vì B-tree là O(log N) trong khi cache là O(1)."
>
> **Thực tế:** Với lookup có index, sự khác biệt không đáng kể. **Chi phí thực sự** là:

| Yếu tố chi phí | Database (Có Index) | Cache (Redis) |
|----------------|---------------------|---------------|
| **Overhead connection** | Mỗi query cần connection (~1-5ms) | Connection persistent |
| **Network round-trip** | App → DB → App (~0.5-1ms) | Protocol tối ưu |
| **Query parsing** | Mỗi query parse, plan | Tra cứu key trực tiếp |
| **Cạn kiệt pool** | Slot giới hạn (ví dụ: 100) | Hàng nghìn thao tác |

### Chi phí Connection PostgreSQL

PostgreSQL là **process-per-connection** (~9MB RAM mỗi connection):

```
max_connections = 100 (thông thường)
100 connections × 9MB = 900MB chỉ cho overhead connection
```

**Chế độ thất bại:**
1. Pool bão hòa với 100 query "Get Profile" (nhanh nhưng volume cao)
2. "Create Trip" (Write) không lấy được connection → timeout
3. Hệ thống fail từ **cạn kiệt connection**, không phải DB compute

<details>
<summary><strong>📖 Chi tiết: Tại sao Cache-Aside không "đơn giản"</strong></summary>

> **Hiểu lầm:** "Cache-aside đơn giản implement."
>
> **Thực tế:** Implementation đúng cần xử lý:

| Thách thức | Có thể sai gì |
|-----------|---------------|
| **Cache stampede** | Cache expire → 1000 request đánh DB cùng lúc |
| **TTL tuning** | Quá ngắn = cache vô dụng; quá dài = stale data |
| **Invalidation khi write** | Quên invalidate → user thấy data cũ |
| **Format serialization** | JSON vs MessagePack vs Protobuf performance |
| **Error handling** | Cache down → fail hay bypass? |
| **Memory limit** | Redis OOM → eviction policy quan trọng |

</details>

## Tác động nghiêm trọng

| Tác động | Mô tả |
|----------|-------|
| **Khuếch đại Read** | 5000 tài xế × 6 poll/phút = 30,000 query/phút cho dữ liệu tĩnh |
| **Cạn kiệt Connection** | Pool bão hòa với read → write blocked → transaction quan trọng fail |
| **Latency do Queue** | Tốc độ request > capacity pool → latency phi tuyến (Little's Law) |
| **Tail Latency bùng nổ** | P99 latency spike → tác động user nhìn thấy |

## Hướng giải pháp

### 1. Caching Layer (Redis)

| Chiến lược | Cách hoạt động | Đánh đổi |
|-----------|---------------|----------|
| **Cache-Aside** | Kiểm tra cache trước, DB khi miss | Đơn giản; rủi ro stale |
| **Write-Through** | Ghi vào cache VÀ DB | Luôn fresh; write chậm |
| **Write-Behind** | Ghi cache, async sync DB | Write nhanh; rủi ro mất data |

### 2. Connection Pooling (PgBouncer)

| Direct Connection | Với PgBouncer |
|------------------|---------------|
| 2,000 conn = 4-8 GB RAM | 100 pooled conn = 200-400 MB |
| Mỗi app maintain pool riêng | Single pool multiplex |

**Khuyến nghị:** Transaction pooling mode.

### 3. Read Replica

Dỡ tải read từ primary. **Lưu ý:** Replica eventually consistent—"read-your-writes" cần routing tới primary.

---

---

# 4. Database Primary Đơn (Vertical Scaling Wall)

## Anti-Pattern (Mô hình sai lầm)

Tất cả service kết nối tới single primary database node cho cả read và write. Không có Read Replica và không có automated failover.

> **Ví dụ:** Primary fail → Tất cả service treo → Can thiệp thủ công cần → 30+ phút promote standby → Sự cố toàn bộ.

## Định nghĩa quan trọng

> ⚠️ **Đọc trước** — hiểu các thuật ngữ này là cần thiết trước khi tiếp tục.

| Thuật ngữ | Định nghĩa | Nguồn |
|-----------|------------|-------|
| **SPOF** | Single Point of Failure. Một component mà failure gây sự cố toàn hệ thống. | [Google SRE Book](https://sre.google/sre-book/table-of-contents/) |
| **Streaming Replication** | Primary stream WAL tới replica real-time. Replica có thể phục vụ read. | [PostgreSQL Docs](https://www.postgresql.org/docs/current/warm-standby.html) |
| **Synchronous Replication** | Primary chờ replica confirm write. Zero data loss; latency cao hơn. | PostgreSQL Docs |
| **Asynchronous Replication** | Primary commit không chờ. Nhanh hơn; rủi ro mất data khi failure. | PostgreSQL Docs |
| **Patroni** | Công cụ HA PostgreSQL tiêu chuẩn industry. Automate failover, leader election. | [Patroni Docs](https://patroni.readthedocs.io/) |

> **Insight quan trọng:** PostgreSQL **không có native automatic failover**. Không có external tooling (Patroni), primary failure = sự cố toàn bộ đến khi can thiệp thủ công.

## Vấn đề cốt lõi: Tranh chấp tài nguyên + SPOF

### Tranh chấp Reader-Writer

> **Hiểu lầm:** "Write chết đói vì read độc chiếm CPU."
>
> **Thực tế:** Bottleneck thường là **cạn kiệt connection pool** và **tranh chấp lock**, không phải CPU:

| Tài nguyên | Cách Read gây hại Write |
|-----------|------------------------|
| **Connection Pool** | Query "Get Status" giữ connection; pool cạn trước "Create Trip" lấy được |
| **Shared Buffers** | Read volume cao gây churn buffer; working set write bị evict |
| **Row-level Lock** | Read chạy lâu có thể block writer |
| **WAL Write Amplification** | Dưới tải, fsync latency tăng cho tất cả transaction |

### Giới hạn Vertical Scaling

> **Hiểu lầm:** "Chỉ cần mua server lớn hơn."

| Loại giới hạn | Ví dụ cụ thể |
|--------------|-------------|
| **Trần phần cứng** | Cloud max: ~128 vCPU, ~4TB RAM |
| **Chi phí lũy thừa** | Gấp đôi capacity thường 3-4× chi phí |
| **Giới hạn connection** | PostgreSQL ~100 connection thực tế (9MB mỗi cái) |
| **Cần downtime** | Vertical scaling thường cần restart |

<details>
<summary><strong>📖 Chi tiết: Chế độ Replication & Đánh đổi</strong></summary>

PostgreSQL streaming replication cho phép horizontal scaling cho read:

| Chế độ Replication | Cách hoạt động | Đánh đổi |
|-------------------|----------------|----------|
| **Asynchronous** (mặc định) | Primary commit không chờ replica | Write nhanh; stale read; khả năng mất data |
| **Synchronous** | Primary chờ replica confirm | Zero data loss; write chậm |
| **Synchronous Apply** | Primary chờ replica apply | Consistency mạnh nhất; latency cao nhất |

> **Sửa hiểu lầm:** "CAP theorem nghĩa là replica luôn eventually consistent."
>
> **Thực tế:** CAP theorem nói về hành vi trong **network partition**, không phải hoạt động bình thường. Với synchronous replication, PostgreSQL cung cấp strong consistency (với chi phí availability khi replica fail). *(Nguồn: Kleppmann, DDIA, Ch.5)*

---

**Thách thức Read-Your-Writes:**

Khi user tạo trip và đọc ngay, họ có thể thấy data cũ từ async replica:

| Chiến lược | Implementation | Đánh đổi |
|-----------|---------------|----------|
| **Đọc từ primary sau write** | Route post-write read tới primary N giây | Đơn giản; thêm tải primary |
| **Session stickiness** | Tất cả request trong session tới cùng node | Có thể gây hotspot |
| **Version check** | Bao gồm write timestamp trong read request | Phức tạp; cần thay đổi app |
| **Synchronous replication** | Không stale read | Write latency penalty |

</details>

## Tác động nghiêm trọng

| Tác động | Mô tả |
|----------|-------|
| **Single Point of Failure** | Primary fail → tất cả service treo → can thiệp thủ công cần |
| **Resource Starvation** | 1000 user polling status → connection pool cạn → "Book Trip" blocked |
| **Replication Lag** | Async replica lag dưới high write load → user thấy data cũ |
| **Không Recovery tự động** | PostgreSQL không có native auto-failover → phút đến giờ downtime |

## Hướng giải pháp

### 1. High Availability với Patroni

**Patroni** là tiêu chuẩn industry cho PostgreSQL HA (dùng bởi GitLab, Zalando):

| Component | Vai trò |
|-----------|--------|
| **Patroni** | Quản lý node, leader election, automate failover |
| **etcd/Consul/ZooKeeper** | Distributed config store cho cluster state |
| **HAProxy** | Route read/write traffic tới đúng node |

**Quy trình Failover:**
1. Primary fail → Patroni detect qua health check
2. Leader election giữa replica (etcd consensus)
3. Replica up-to-date nhất promote thành primary
4. HAProxy tự động route tới primary mới

### 2. Read Replica để Scale

| Cấu hình | Use Case |
|---------|----------|
| **1 Primary + 1 Sync Standby** | HA với zero data loss |
| **1 Primary + N Async Replica** | Read scaling với chấp nhận lag |
| **Hybrid** | 1 sync cho HA, N async cho read load |

### 3. Connection Pooling (PgBouncer)

- Đặt PgBouncer trước Patroni
- Transaction pooling mode
- Multiplex hàng nghìn app connection thành ~100 DB connection

### 4. Monitoring Thiết yếu

| Metric | Tại sao quan trọng |
|--------|-------------------|
| **Replication lag** | Stale read nếu lag > ngưỡng |
| **Connection pool utilization** | Gần limit = failure sắp xảy ra |
| **WAL generation rate** | Rate cao có thể gây replica lag |
| **Failover time** | Test thường xuyên; nên < 30 giây |
