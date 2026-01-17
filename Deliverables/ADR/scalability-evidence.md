# Scalability Evidence - Module A

> **Câu hỏi:** Dựa vào đâu để khẳng định project này có khả năng scale?

---

## 📊 ADR-001: Event-Driven Async Communication

### Cơ Chế Scale

#### 1. Non-blocking Architecture
**File:** `services/trip-service/src/trips/trips.service.ts`

**Flow:** TripService publish message → Trả response ngay (60ms) → DriverService xử lý background

**Tại sao scale được:**
- Event loop **không bị block bởi async I/O**; handler trả về nhanh nên không giữ connection/RAM lâu
- Không cần “1 thread per request” → tăng concurrency hiệu quả (giới hạn bởi CPU + downstream như DB/queue)
- Scale horizontal thường gần tuyến tính nếu các bottleneck downstream chưa bão hòa

**Lưu ý kỹ thuật:** Node.js vẫn có thể *block* nếu dùng sync I/O (vd `fs.readFileSync`) hoặc xử lý CPU nặng (JSON lớn, crypto, sort, v.v.).

#### 2. Message Queue Buffer
**File:** `services/driver-service/src/common/aws.utils.ts`

**Flow:** SQS queue buffer message → DriverService poll độc lập → Consumer xử lý theo tốc độ riêng

**Tại sao scale được:**
- TripService và DriverService scale độc lập → Tách điểm thất bại
- Backpressure tự nhiên: Queue buffer spike → Service xử lý khi ready → Không bị overwhelm
- Horizontal scale: tăng số consumer thường tăng throughput xử lý (tới khi chạm bottleneck downstream như DB/Redis)

#### 3. Kết Quả Đo Được
```
Throughput tăng 7x:
- Before (sync): 45 RPS max
- After (async): 316 RPS @ 1000 VUs (potential 1,600 RPS)
```
**Source:** `docs/MODULE-A-LOAD-TEST-RESULTS.md`

---

## 📊 ADR-002: Database Read Replicas

### Cơ Chế Scale

#### 1. Horizontal Read Scaling
**File:** `docker-compose.replicas.yml`

**Topology:** 1 Primary (write) + 2 Replica (read) per database
- User DB: ports 5432, 5444, 5445
- Trip DB: ports 5433, 5446, 5447

**Tại sao scale được:**
- Workload 80% read → Phân tán 3 node → Mỗi node chỉ 26% load
- Primary tập trung write → Không bị contention → Throughput cao hơn
- Có thể thêm replica 3, 4, 5... → Linear: 5 replica = 5x read capacity

#### 2. Intelligent Load Distribution
**File:** `services/user-service/src/prisma/prisma.service.ts`

**Routing:** Read → Replica (round-robin) | Write → Primary

**Tại sao scale được:**
- Round-robin → CPU phân bổ đều → Không có hot spot
- Không có single bottleneck → 1 replica chậm không ảnh hưởng toàn hệ thống
- Thêm replica: cấu hình thêm `DATABASE_REPLICA*_URL` và chạy thêm replica container → app tự round-robin qua các replica đã cấu hình

#### 3. Kết Quả Đo Được
```
DB CPU giảm đáng kể:
- Before: 85-95% CPU (single DB)
- After: <50% CPU (1 Primary + 2 Replica)
→ Còn 50% headroom để scale thêm 2x traffic
```
**Source:** `docs/MODULE-A-SCALABILITY-REPORT.md`

---

## 📊 ADR-003: Distributed Caching (Redis Cluster)

### Cơ Chế Scale

#### 1. 6-Node Cluster Architecture
**File:** `docker-compose.redis-cluster.yml`

**Topology:** 3 Master (6379-6381) + 3 Replica (6382-6384)

**Tại sao scale được:**
- **3x capacity:** Slot-based sharding → Mỗi master giữ 33% data
- **Read scaling:** Read có thể phân tán qua nhiều node/replica (tùy cấu hình client và pattern truy cập)
- **Horizontal scaling:** Thêm Master 4, 5, 6 → Redis auto-rebalance slot → Linear capacity
- **High availability:** Master down → Replica auto-promote → Zero downtime

#### 2. Cache-Aside Pattern (DB Offload)
**File:** `services/user-service/src/users/users.service.ts`

**Flow:** Check cache → Hit: trả ngay | Miss: query DB → populate cache (TTL: 1h)

**Tại sao scale được:**
- 80-90% hit rate → Chỉ 10-20% request hit DB → DB handle được 5-10x traffic
- Memory (Redis) nhanh gấp 100x disk (PostgreSQL) → Response time giảm 7-10x
- DB có headroom → Write nhanh hơn, không bị overwhelm

#### 3. Kết Quả Đo Được
```
DB offload hiệu quả:
- Cache hit rate: 80-90%
- Profile lookup p95: 22ms (vs 150-200ms no cache) → 7x faster
- DB CPU: 85% → <50% → Handle thêm 2x traffic
```
**Source:** `docs/MODULE-A-LOAD-TEST-RESULTS.md`

---

## 📊 ADR-004: Auto-Scaling Infrastructure

### Cơ Chế Scale

#### 1. Elastic Auto-Scaler
**File:** `scripts/auto-scaler.py`

**Config:**
```python
"user-service":   {"min": 2, "max": 10, "target_cpu": 55%}
"trip-service":   {"min": 2, "max": 15, "target_cpu": 50%}
"driver-service": {"min": 2, "max": 15, "target_cpu": 40%}
```

**Tại sao scale được:**
- **Elastic capacity:** Traffic tăng → CPU > threshold → auto scale-out (+replica)
- **Fast reaction:** Monitor realtime (5s poll) → scale trong 15–20s (phụ thuộc container boot + healthcheck)
- **Service-specific:** Driver (I/O bound) scale sớm hơn User (CPU bound) → tối ưu resource
- **Max bound:** Có trần replica để tránh “runaway scaling” khi downstream (DB) bão hòa

#### 2. Dynamic Service Discovery
**File:** `docker-compose.loadbalancer.yml`

**Mechanism:** Nginx re-resolve DNS mỗi 10s → auto-discover replica mới

**Tại sao scale được:**
- **Zero downtime:** Thêm replica → Nginx discover nhanh → không restart
- **Decoupled:** Scale backend không ảnh hưởng load balancer
- **Dễ migrate:** Pattern gần với cách service discovery hoạt động trên ECS/ALB

#### 3. Kết Quả Đo Được - Timeline Thực Tế
```
1000 VUs Test - Auto-scaling trong 2 phút:
Time        CPU%     Replicas    Event
20:50:45    54.6%    2           Baseline
20:51:00    77.8%    2→3         Scale-out (CPU > 50%)
20:51:19    122.4%   3→4         Scale-out
20:51:40    84.5%    4→5         Scale-out
20:52:00    61.9%    5→6         Scale-out
20:52:20    57.7%    6→7         Scale-out
20:52:40    46.6%    7           Stabilized

→ Tự động 2→7 replica trong 2 phút (3.5x capacity)
→ System sống sót, error rate chỉ 0.67% @ 1000 VUs
```
**Source:** `docs/MODULE-A-SCALABILITY-REPORT.md` (line 358-368)

---

## 🎯 Tổng Hợp Kết Quả

### So Sánh Before/After

| Metric | Before | After (4 ADR) | Improvement | Source |
|--------|--------|---------------|-------------|--------|
| **Throughput** | 45 RPS | 316 RPS | **7x** | Load test results |
| **DB CPU** | 85-95% | <50% | **50% giảm** | Scaling report |
| **Replicas** | Fixed 2 | Dynamic 2-7 | **Elastic** | Auto-scaler log |
| **Error Rate** | 15% @ 100 VUs | 0.67% @ 1000 VUs | **22x tốt hơn** | Load test results |

### Scaling Capacity Tổng Hợp

**Theoretical (ước lượng, phụ thuộc bottleneck thật):**
- Auto-scaler: 2 → 15 replica = **tăng tối đa ~7.5x capacity compute**
- DB replica: tăng **read capacity** (không tăng write capacity)
- Redis: giảm tải DB cho read hot-path (tùy hit-rate)
- Async queue: hấp thụ spike và scale consumer độc lập (tùy queue depth + consumer count)

---

## 📁 File Reference

| Component | Path | Loại Evidence |
|-----------|------|---------------|
| Auto-scaler | `scripts/auto-scaler.py` | Code + Config |
| Load test | `docs/MODULE-A-LOAD-TEST-RESULTS.md` | Metric đo được |
| Scaling report | `docs/MODULE-A-SCALABILITY-REPORT.md` | Analysis + Timeline |
| DB replica | `docker-compose.replicas.yml` | Infrastructure |
| Redis cluster | `docker-compose.redis-cluster.yml` | Infrastructure |
| Load balancer | `docker-compose.loadbalancer.yml` | Routing config |
| Async util | `services/*/src/common/aws.utils.ts` | Implementation |

---

## ✅ Kết Luận

**Project scale được dựa trên 4 trụ cột:**

1. **Code thực tế:** Auto-scaler, async pattern, pooling
2. **Infrastructure đầy đủ:** Replica, cluster, load balancer
3. **Metric đo được:** 1000 VU test, 2→7 replica observed, 7x throughput
4. **Architecture đúng:** Horizontal scaling, stateless, decoupled

→ **Đã chạy thực tế và đo được số liệu**, không phải lý thuyết! 🎯
