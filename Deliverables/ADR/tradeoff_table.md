# Module A: Trade-offs Summary Table (ADR 001, 002, 003)

## 📊 ADR-001: Event-Driven Async Communication

| Trade-offs | GAIN | LOST |
|------------|------|------|
| **Throughput vs Immediate Result** | Throughput tăng **40x**<br>Response **60ms** (instant feedback) | User phải poll kết quả cuối cùng<br>End-to-end vẫn 2-5s (non-blocking) |
| **Availability vs Consistency** | Service isolation (no cascading)<br>Message queue buffer (no loss)<br>High availability (partial degradation) | Eventual consistency (1-3s lag)<br>Race conditions (cần idempotent)<br>Cannot guarantee immediate consistency |
| **Dev Cost vs Reliability** | $0/month dev (LocalStack)<br>Dễ migrate lên AWS | LocalStack ≠ AWS 100%<br>Không có event replay |
| **Simplicity vs Debuggability** | Decoupled, extensible, scalable | Code phân tán nhiều files<br>Debug khó (cần correlation IDs) |

### Giải thích:

**1. Throughput vs Immediate Result:**
- **GAIN:**
  - **Throughput tăng 40x:** Sync block thread 2-5s mỗi request → Async chỉ block 60ms → Thread free nhanh → Server xử lý được 40 req/s lên 1,600 req/s
  - **Response 60ms (instant feedback):** User nhận "Đang tìm tài xế..." ngay trong 60ms thay vì chờ 2-5s
- **LOST:**
  - **User phải poll kết quả cuối cùng:** Không biết driver matched ngay → Frontend phải poll GET /trips/{id} mỗi 1-2s để check status
  - **End-to-end vẫn 2-5s:** Toàn bộ flow (tìm driver + notify) vẫn mất 2-5s, nhưng non-blocking (user không chờ)

**2. Availability vs Consistency:**
- **GAIN:**
  - **Service isolation (no cascading failures):** DriverService down/slow → Messages queue trong SQS → TripService vẫn accept requests → No cascading failure, services độc lập
  - **Message queue buffer (no loss):** SQS persistent storage → DriverService restart → Process backlog messages → Zero message loss (DLQ backup)
  - **High availability (partial degradation):** 1 service fail → Other services still operational → Graceful degradation thay vì total failure
- **LOST:**
  - **Eventual consistency (1-3s lag):** TripService tạo trip → Message qua SNS → Vào SQS → Poll cycle (5s) → DriverService nhận → Delay 1-3s → Data không đồng bộ trong window này
  - **Race conditions (cần idempotent):** Message duplicate hoặc out-of-order → Cần check trip.status trước khi update tránh driver matched 2 lần
  - **Cannot guarantee immediate consistency:** Async = eventual → Critical real-time operations khó (thí dụ payment confirmation cần sync)

**3. Dev Cost vs Reliability:**
- **GAIN:**
  - **$0/month dev (LocalStack):** LocalStack emulate SNS/SQS free trên Docker → Dev không tốn tiền AWS → Test patterns local
  - **Dễ migrate lên AWS:** Code giống nhau (SNS publish, SQS poll) → Chỉ đổi endpoint từ localhost:4566 → AWS real
- **LOST:**
  - **LocalStack ≠ AWS 100%:** Polling delay cao hơn (100ms vs 10ms), edge cases khác nhau → 80% compatible, không perfect
  - **Không có event replay:** LocalStack/SQS không có Kafka offset replay → Debug khó hơn khi cần reprocess messages

**4. Simplicity vs Debuggability:**
- **GAIN:**
  - **Decoupled, extensible, scalable:** Services độc lập → Thêm Analytics service subscribe SNS không sửa TripService code → Scale riêng
- **LOST:**
  - **Code phân tán nhiều files:** Logic nằm trip.service.ts, driver.handler.ts, trip.handler.ts → Flow nhảy giữa 3 files
  - **Debug khó (cần correlation IDs):** Stack trace bị cắt giữa messages → Phải thêm correlationId vào mọi message để trace flow

---

## 📊 ADR-002: Database Read Replicas

| Trade-offs | GAIN | LOST |
|------------|------|------|
| **Consistency vs Read Capacity** | Read capacity tăng **3x** (1 Primary + 2 Replicas)<br>Fault tolerance (replicas backup)<br>Load distribution (round-robin) | Eventual consistency (replication lag 100-500ms)<br>Read-after-write routing complexity (2s window)<br>Session tracking logic required |
| **Cost vs Availability** | High availability (promote replica)<br>Fast recovery (không mất data)<br>Partial service khi fail | Chi phí tăng (3 DB instances)<br>Manual failover (Docker)<br>More containers to manage |
| **Simplicity vs Scalability** | Horizontal scaling (thêm replicas dễ)<br>Distribute read load | Read/Write routing logic<br>Debugging: "Which DB?" |
| **Local Dev vs Production Parity** | Test replication locally (Docker)<br>Core concepts identical | Manual promotion (vs RDS auto-failover)<br>Basic monitoring (vs CloudWatch) |

### Giải thích:

**1. Consistency vs Read Capacity:**
- **GAIN:**
  - **Read capacity tăng 3x:** 1 DB handle all reads → 3 DBs phân tán (1 Primary + 2 Replicas) → Round-robin load balancing → Mỗi DB chỉ handle 33% reads
  - **Fault tolerance (replicas backup):** Primary down → 2 replicas vẫn serve reads → Promote 1 replica thành primary → Data không mất (WAL streaming sync)
  - **Load distribution (round-robin):** Nginx route reads round-robin → Replica1 → Replica2 → Replica1... → CPU phân bổ đều giữa 3 nodes
- **LOST:**
  - **Eventual consistency (replication lag):** Primary write → Async replicate sang replicas (delay 100-500ms) → Read từ replica có thể stale (nếu không route đúng)
  - **Read-after-write routing complexity:** User update profile → Phải route reads về Primary trong 2s window → Cần track "session vừa write" → Logic phức tạp
  - **Routing logic required:** Application phải implement: Writes → Primary, Normal reads → Replicas, Read-after-write → Primary (2s window) → Code phức tạp hơn single DB

**2. Cost vs Availability:**
- **GAIN:**
  - **High availability (promote replica):** Primary crash → `docker exec` promote Replica1 thành Primary → Service tiếp tục (downtime <1 phút)
  - **Fast recovery (không mất data):** WAL streaming continuous → Replicas luôn gần latest → Promote replica → Không mất data như restore backup
  - **Partial service khi fail:** Primary down → Replicas vẫn serve reads (read-only mode) → Users vẫn xem được data, chỉ không write được
- **LOST:**
  - **Chi phí tăng (3 DB instances):** 1 container → 3 containers → Memory/CPU usage x3 → Chi phí cloud x3 (hoặc local laptop nặng hơn)
  - **Manual failover (Docker):** Phải thủ công promote replica → Không auto như RDS Multi-AZ (detect failure → auto-promote trong 60s)
  - **More containers to manage:** 3 containers → 3x logs to check, 3x monitoring, 3x backup/restore → Operational overhead

**3. Simplicity vs Scalability:**
- **GAIN:**
  - **Horizontal scaling (thêm replicas dễ):** Traffic tăng → Add Replica3, Replica4... → Linear scaling capacity → Không cần upgrade hardware
  - **Distribute read load:** 1000 reads/s → 3 DBs → 333 reads/s per DB → Mỗi DB CPU thấp hơn, latency giảm
- **LOST:**
  - **Read/Write routing logic:** Code phải implement: `if (operation === 'write') → Primary; else → randomReplica()` → Không transparent như single DB
  - **Debugging: "Which DB?"** Query chậm → Check log → "Query này hit Replica1 hay Replica2?" → Phải thêm logging DB target

**4. Local Dev vs Production Parity:**
- **GAIN:**
  - **Test replication locally (Docker):** Docker Compose setup 1 Primary + 2 Replicas → Dev test replication lag, failover scenarios local
  - **Core concepts identical:** WAL streaming, Read/Write routing giống production RDS → Patterns validate local → Ít surprises production
- **LOST:**
  - **Manual promotion (vs RDS auto-failover):** Docker: `docker exec promote_replica.sh` thủ công → RDS Multi-AZ: auto-detect + auto-promote trong 60s
  - **Basic monitoring (vs CloudWatch):** Docker: `docker stats` basic CPU/Memory → CloudWatch: full metrics (connections, IOPS, replication lag, slow queries)

---

## 📊 ADR-003: Distributed Caching (Redis Cluster)

| Trade-offs | GAIN | LOST |
|------------|------|------|
| **Memory Cost vs Database Load** | DB CPU giảm nhiều (offload reads)<br>Response nhanh (memory vs disk)<br>Throughput cao hơn | Memory cost (Redis cluster)<br>Cache infrastructure overhead |
| **Consistency vs Performance** | Response sub-millisecond<br>Throughput cao<br>DB có headroom cho writes | Read có thể stale (TTL-based)<br>Cache invalidation complexity<br>Eventual consistency |
| **Simplicity vs Scalability** | Horizontal scaling (6 nodes)<br>Auto-failover (self-healing)<br>High capacity | More components (DB + Redis)<br>Cache patterns complexity<br>More failure points |
| **Cold Start vs Hot Path** | Hot path rất nhanh (cache hit)<br>Majority requests from memory<br>No DB load (cache hit) | Cold start chậm hơn (DB query)<br>Cache warming needed<br>First request populates cache |

### Giải thích:

**1. Memory Cost vs Database Load:**
- **GAIN:**
  - **DB CPU giảm nhiều (offload reads):** 80% reads cacheable → Cache hit → Không query DB → PostgreSQL CPU từ 85-95% xuống <50%
  - **Response nhanh (memory vs disk):** Redis RAM 0.1-1ms vs PostgreSQL disk I/O 10-50ms → User profile query nhanh gấp 10-50x
  - **Throughput cao hơn:** DB offload reads → Có headroom xử lý writes → Concurrent users tăng → System scale tốt hơn
- **LOST:**
  - **Memory cost (Redis cluster):** 6 nodes Redis (3 masters + 3 replicas) → Mỗi node 512MB-2GB RAM → Chi phí memory tăng (ElastiCache ~$50-200/month)
  - **Cache infrastructure overhead:** Thêm 6 containers Redis → Phải monitor, backup, maintain → Operational complexity tăng

**2. Consistency vs Performance:**
- **GAIN:**
  - **Response sub-millisecond:** Cache hit → Redis RAM trả lời <1ms → User thấy profile instant → UX tốt hơn nhiều
  - **Throughput cao:** Cache handle majority reads → DB không bị overwhelm → System xử lý được nhiều concurrent users hơn
  - **DB có headroom cho writes:** Reads offload → Primary CPU thấp → Writes nhanh hơn, không bị contention với reads
- **LOST:**
  - **Read có thể stale (TTL-based):** User profile TTL 1 hour → User update name → Cache vẫn cũ 1 tiếng → User thấy name cũ
  - **Cache invalidation complexity:** User update → Phải invalidate cache key → Nếu quên invalidate → Data stale mãi → Logic phức tạp
  - **Eventual consistency:** Write DB → Cache invalidate → Window vài ms data inconsistent → Race condition có thể xảy ra

**3. Simplicity vs Scalability:**
- **GAIN:**
  - **Horizontal scaling (6 nodes):** Traffic tăng → Add more Redis nodes → Linear scaling → 3 masters = 3x capacity
  - **Auto-failover (self-healing):** Master1 down → Replica1 tự động promote thành Master1 → No manual intervention → High availability
  - **High capacity:** 6 nodes → Memory pool lớn → Cache nhiều data → Hit rate cao → DB load thấp
- **LOST:**
  - **More components (DB + Redis):** Single DB → DB + Redis Cluster (6 nodes) → 7 components total → Architecture phức tạp hơn
  - **Cache patterns complexity:** Phải hiểu cache-aside (check cache → miss → query DB → populate), write-through (write DB + cache) → Learning curve
  - **More failure points:** DB fail → 1 failure point → DB or Redis fail → 2 failure points → Debugging phức tạp hơn

**4. Cold Start vs Hot Path:**
- **GAIN:**
  - **Hot path rất nhanh (cache hit):** Popular profiles (driver#123 queried 1000x) → Cache hit 999/1000 → Sub-ms response → UX tốt
  - **Majority requests from memory:** 80-90% cache hit rate → Majority không hit DB → DB CPU thấp → Scale tốt
  - **No DB load (cache hit):** Cache hit → 0 DB query → DB CPU idle → Có thể serve nhiều traffic hơn
- **LOST:**
  - **Cold start chậm hơn (DB query):** First request → Cache miss → Query DB (10-50ms) + Populate cache → Chậm hơn subsequent requests
  - **Cache warming needed:** Deploy mới → Cache empty (cold) → All requests miss → DB overwhelmed → Cần script pre-populate hot keys
  - **First request populates cache:** User#1 query driver#123 → Miss → Chậm → Populate → User#2 query driver#123 → Hit → Nhanh → User#1 experience xấu hơn

---

## 📊 ADR-004: Auto-Scaling Infrastructure

| Trade-offs | GAIN | LOST |
|------------|------|------|
| **Simplicity vs Production-Grade** | No learning curve (Docker familiar)<br>Setup time: hours (vs days for k8s)<br>Rapid iteration, 0 learning curve | Not production-grade features<br>No HA, self-healing, rolling updates<br>Basic scaling only (vs full orchestration) |
| **Cold Start vs Always-Warm** | Elastic capacity (scale on-demand)<br>Cost optimization (scale in when idle)<br>Min 2 instances always warm | Container startup delay (scale-out)<br>First requests may queue<br>Cold start khi burst beyond capacity |
| **Local Portability vs Cloud-Native** | Chạy trên laptop ($0 cost dev)<br>No AWS account needed<br>Local Docker logs (debug dễ)<br>Offline development | Not production-grade managed service<br>Single host only<br>Basic monitoring (CPU + Memory only) |
| **Predictive vs Reactive Scaling** | Simple implementation (if/else logic)<br>Quick to build (hours vs weeks)<br>Threshold-based, good enough | No pre-emptive scaling<br>Cannot learn patterns (ML-based)<br>Small delay khi scale-out (reactive) |

### Giải thích:

**1. Simplicity vs Production-Grade:**
- **GAIN:**
  - **No learning curve (Docker familiar):** Team đã biết Docker → Không cần học Kubernetes (pods, deployments, services, ingress...) → Mất tuần để học
  - **Setup time: hours (vs days for k8s):** Python script 200 lines → Setup vài giờ → k8s: Helm charts, manifests → Setup mất ngày
  - **Rapid iteration, 0 learning curve:** Sửa threshold → Restart script → Test ngay → k8s: Update HPA manifest → kubectl apply → Wait propagate
- **LOST:**
  - **Not production-grade features:** Không có advanced orchestration (service mesh, traffic splitting, canary deployments)
  - **No HA, self-healing, rolling updates:** Script crash → Stop scaling → k8s: Controller crash → Restart auto → Pod crash → Recreate auto
  - **Basic scaling only (vs full orchestration):** Chỉ scale replicas → k8s: Scale + health checks + resource limits + affinity rules + PDBs...

**2. Cold Start vs Always-Warm:**
- **GAIN:**
  - **Elastic capacity (scale on-demand):** Traffic spike 500 req/min → CPU>50% → Scale out +2 containers → Capacity tăng → Xử lý được traffic
  - **Cost optimization (scale in when idle):** Đêm traffic 10 req/min → CPU<20% → Scale in -1 → 2 containers → Tiết kiệm RAM/CPU
  - **Min 2 instances always warm:** Min=2 → Luôn có 2 containers sẵn sàng → Normal traffic không có cold start → Chỉ cold start khi burst
- **LOST:**
  - **Container startup delay (scale-out):** Scale out trigger → `docker compose up --scale` → Container start ~1-2s → Delay nhỏ trước khi serve traffic
  - **First requests may queue:** Burst 500 req/min → 2 containers overwhelmed → Scale out +2 → Trong 1-2s startup → Requests queue → Latency tăng
  - **Cold start khi burst beyond capacity:** 2 containers handle 200 req/min → 500 req/min burst → Scale out delay → Cold start experience cho requests đầu

**3. Local Portability vs Cloud-Native:**
- **GAIN:**
  - **Chạy trên laptop ($0 cost dev):** Docker Compose local → Mọi dev test auto-scaling trên laptop → Không tốn tiền AWS → DevOps không cần tạo staging env
  - **No AWS account needed:** Dev không cần AWS credentials → Security đơn giản → Onboarding nhanh → Không lo quota/billing
  - **Local Docker logs (debug dễ):** `docker logs trip-service-1` → Thấy ngay logs → AWS ECS: Phải vào CloudWatch → Tìm log group → Filter
  - **Offline development:** Không có internet → Vẫn dev được → AWS ECS: Phải online → API calls fail offline
- **LOST:**
  - **Not production-grade managed service:** Không có AWS managed features (auto-recovery, multi-AZ, AWS support)
  - **Single host only:** Tất cả containers 1 laptop/server → Không scale across multiple machines → Giới hạn bởi host CPU/Memory
  - **Basic monitoring (CPU + Memory only):** Script chỉ monitor CPU + Memory → ECS: CloudWatch full metrics (network, disk, custom metrics, alarms)

**4. Predictive vs Reactive Scaling:**
- **GAIN:**
  - **Simple implementation (if/else logic):** `if cpu > 50%: scale_out()` → 10 lines code → Dễ hiểu, dễ debug → ML model: Training, features, tuning
  - **Quick to build (hours vs weeks):** Python script vài giờ → Ship luôn → ML predictive: Collect data → Train model → Validate → Deploy (tuần)
  - **Threshold-based, good enough:** User=55%, Trip=50%, Driver=40% thresholds → Tune dễ → Test load → Adjust → Good enough cho demo
- **LOST:**
  - **No pre-emptive scaling:** Reactive: CPU>50% → Scale → Predictive: Biết 8am traffic cao → Pre-scale trước 8am → Không có cold start
  - **Cannot learn patterns (ML-based):** Script không học patterns (traffic cao 8-9am, 5-6pm) → Predictive ML: Học patterns → Auto pre-scale rush hour
  - **Small delay khi scale-out (reactive):** Threshold vượt → Detect (5s poll) → Scale (1-2s startup) → Total delay ~7s → Predictive: Pre-scale → 0 delay

---

## 🎯 Decision Summary

| ADR | Solution | Key Trade-off | Mitigation |
|-----|----------|---------------|------------|
| **001** | SNS/SQS Async | Throughput vs Latency | Polling UX pattern (acceptable) |
| **002** | Read Replicas | Consistency vs Capacity | Route critical reads to Primary |
| **003** | Redis Cluster | Performance vs Consistency | TTL strategy, Write-through invalidation |
| **004** | Docker Auto-Scaler | Simplicity vs Production-Grade | Clear migration path to ECS Fargate |

---

## 📈 Combined Impact

| Metric | Before | After (All ADRs) | Improvement |
|--------|--------|------------------|-------------|
| **Throughput** | 40 req/s | 1,600+ req/s | **40x** |
| **Response Time** | 2-5s | <100ms | **20-50x faster** |
| **Database CPU** | 85-95% | <50% | **~50% reduction** |
| **Error Rate** | High (cascading) | <1% | **Significant** |
| **Scalability** | Fixed | Elastic | **Horizontal** |
