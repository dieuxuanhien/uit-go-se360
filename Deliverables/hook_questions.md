# Module A: Hook Questions - Provocative Scenarios

> **Mục đích:** Đặt câu hỏi khiêu khích để người nghe thấy được **pain points** khi không có các ADRs, từ đó hiểu được **giá trị** của từng solution.

---

## 🎯 ADR-001: Event-Driven Async Communication

### 🔴 Hook Question:

**"Chuyện gì sẽ xảy ra khi 100 người cùng lúc bấm 'Đặt xe' vào giờ tan tầm, mà hệ thống xử lý ĐỒNG BỘ - mỗi request phải chờ tài xế accept mới trả kết quả?"**

### 💥 Scenario Without ADR-001 (Synchronous):

```
100 users cùng lúc: "Đặt xe ngay!"
    ↓
TripService (10 threads available):
├── Thread 1-10: Đang xử lý 10 requests đầu (blocked 2-5 giây mỗi request)
├── Request 11-100: ⏳ QUEUE chờ... chờ... chờ...
    ↓
🕐 User #11: "Sao lâu thế?" (chờ 3 giây)
🕑 User #20: "App bị lag à?" (chờ 6 giây)
🕒 User #50: "Tắt app, dùng Grab!" (chờ 15 giây)
    ↓
❌ Result: 50% users rời bỏ app
❌ DriverService chậm 1 chút → TripService timeout → UserService 504
❌ 100 concurrent users = TOÀN BỘ HỆ THỐNG DOWN
```

### ✅ Solution With ADR-001 (Async SNS/SQS):

```
100 users cùng lúc: "Đặt xe ngay!"
    ↓
TripService:
├── Tạo 100 trips trong 6 giây (60ms/request)
├── Publish 100 events vào SNS
├── Trả response ngay: "Đang tìm tài xế..."
    ↓
✅ User #1-100: Đều nhận feedback trong <1 giây
✅ DriverService xử lý background, không block users
✅ Message queue đảm bảo không mất requests
    ↓
🚀 Result: Throughput 40x, users không rời bỏ app
```

### 🎤 Key Takeaway:

> **"Không có Async → Blocking I/O → 100 concurrent users = App chết. Async SNS/SQS → Non-blocking → System scale 40x throughput."**

---

## 🎯 ADR-002: Database Read Replicas

### 🔴 Hook Question:

**"Chuyện gì sẽ xảy ra khi 1,000 người cùng lúc xem profile tài xế, mà TẤT CẢ queries đều đập vào 1 database duy nhất?"**

### 💥 Scenario Without ADR-002 (Single Database):

```
1,000 users xem driver profiles cùng lúc
    ↓
PostgreSQL Primary (Single instance):
├── CPU: 95% (RED ALERT! 🔥)
├── Connections: 195/200 (gần đầy)
├── Query latency: 500ms → 1s → 2s (chậm dần)
    ↓
🕐 User #1-500: Profile load chậm (1-2 giây)
🕑 User #501-900: Connection timeout (database đầy)
🕒 User #901-1000: Error 503 "Database unavailable"
    ↓
Thêm chút traffic → Primary CRASH 💥
    ↓
❌ Result: TOÀN BỘ HỆ THỐNG DOWN
❌ Recovery: Restore từ backup → MẤT DATA 30 phút cuối
```

### ✅ Solution With ADR-002 (Read Replicas):

```
1,000 users xem driver profiles cùng lúc
    ↓
Load balancing:
├── Primary: Xử lý WRITES only
├── Replica 1: Xử lý 500 READS
├── Replica 2: Xử lý 500 READS
    ↓
CPU per node: 40% (còn headroom)
Query latency: <50ms (nhanh)
Connections: 70/200 per node (còn xa giới hạn)
    ↓
✅ User #1-1000: Đều load profile <100ms
✅ Primary crash → Promote Replica1 → Service tiếp tục
✅ Không mất data, không downtime dài
    ↓
🚀 Result: Read capacity 3x, high availability
```

### 🎤 Key Takeaway:

> **"Không có Read Replicas → Single Point of Failure → 1,000 reads = Database chết. Read Replicas → Load phân tán → Scale 3x + High Availability."**

---

## 🎯 ADR-003: Distributed Caching (Redis Cluster)

### 🔴 Hook Question:

**"Chuyện gì sẽ xảy ra khi cùng 1 driver profile được 10,000 users xem trong 1 phút, mà KHÔNG CÓ CACHE - mọi request đều query database?"**

### 💥 Scenario Without ADR-003 (No Cache):

```
Driver #123 (5-star driver) - Hot profile
10,000 users xem trong 1 phút
    ↓
PostgreSQL:
├── Query giống nhau 10,000 lần:
│   SELECT * FROM drivers WHERE id = 123
│   ↓ Disk I/O: 10-50ms per query
│   ↓ Total: 10,000 × 50ms = 500,000ms CPU time
    ↓
CPU: 100% (MAXED OUT 🔥)
Slow queries: 500ms → 2s → 5s
Other queries bị chậm theo (collateral damage)
    ↓
🕐 User #1-1000: Profile load chậm (1-2s)
🕑 User #1001-5000: Profile load rất chậm (3-5s)
🕒 User #5001-10000: Timeout (database quá tải)
    ↓
❌ Result: Database CPU 100%, 50% requests fail
❌ Tất cả queries khác (create trip, update status) cũng chậm
```

### ✅ Solution With ADR-003 (Redis Cache):

```
Driver #123 (5-star driver) - Hot profile
10,000 users xem trong 1 phút
    ↓
Redis Cache:
├── Request 1: Cache MISS → Query PostgreSQL (50ms) → Store in cache
├── Request 2-10,000: Cache HIT → Return từ RAM (<1ms)
    ↓
PostgreSQL: 1 query duy nhất
Redis: 9,999 queries từ RAM
    ↓
Database CPU: 10% (idle)
Cache hit rate: 99.99%
Response time: <1ms (sub-millisecond)
    ↓
✅ User #1-10,000: Đều load profile <1ms
✅ Database có headroom xử lý writes
✅ System scale tốt, không overwhelm
    ↓
🚀 Result: DB offload 99.99%, response 50x nhanh hơn
```

### 🎤 Key Takeaway:

> **"Không có Cache → 10,000 requests = 10,000 DB queries = CPU 100% = System chết. Redis Cache → 1 DB query + 9,999 RAM reads = CPU 10% = Sub-ms response."**

---

## 🎯 ADR-004: Auto-Scaling Infrastructure

### 🔴 Hook Question:

**"Chuyện gì sẽ xảy ra vào cao điểm hàng ngàn người cùng bấm đặt xe, mà hệ thống chỉ có 2 CONTAINERS CỐ ĐỊNH - không tự động scale?"**

### 💥 Scenario Without ADR-004 (Fixed Containers):

```
⏰ 8:00 AM - Giờ cao điểm đi làm
Traffic: 10 req/min → 500 req/min trong 5 phút
    ↓
System capacity:
├── trip-service: 2 containers (cố định)
├── Mỗi container: 100 req/min capacity
├── Total capacity: 200 req/min
    ↓
500 req/min incoming:
├── 200 req/min: Xử lý được ✅
├── 300 req/min: OVERFLOW ❌
    ↓
🕐 Container CPU: 10% → 50% → 80% → 95% (5 phút)
🕑 Requests bắt đầu timeout (container quá tải)
🕒 Error rate: 0% → 30% → 60% (leo thang)
    ↓
DevOps nhận alert: "CPU 95%!"
DevOps thủ công: docker compose scale trip-service=7
⏱️ Manual action: 5-10 phút (quá chậm!)
    ↓
❌ Result: 60% requests FAIL trong 10 phút đầu
❌ Users bỏ app, chuyển sang Grab
❌ Sau 10 phút mới scale → đã mất users
```

### ✅ Solution With ADR-004 (Auto-Scaling):

```
⏰ 8:00 AM - Giờ cao điểm đi làm
Traffic: 10 req/min → 500 req/min trong 5 phút
    ↓
Auto-Scaler monitoring (mỗi 5 giây):
├── 8:00: CPU 10% (2 containers) ✅
├── 8:02: CPU 55% (detect spike!) 🚨
│   └── Action: Scale OUT +2 (total: 4 containers)
├── 8:03: CPU 60% (vẫn cao) 🚨
│   └── Action: Scale OUT +2 (total: 6 containers)
├── 8:04: CPU 45% (ổn định) ✅
    ↓
System capacity:
├── 8:00: 2 containers = 200 req/min
├── 8:02: 4 containers = 400 req/min
├── 8:03: 6 containers = 600 req/min
    ↓
✅ 500 req/min incoming < 600 req/min capacity
✅ CPU stable at 45% (còn headroom)
✅ Error rate: <1% (excellent)
✅ Users: 0 notice, seamless experience
    ↓
⏰ 9:00 AM - Sau giờ cao điểm
Traffic: 500 → 50 req/min
Auto-Scaler: Scale IN -1 mỗi phút (6→5→4→3→2)
💰 Cost optimization: Giảm containers khi idle
    ↓
🚀 Result: Elastic capacity, 0 manual intervention, 0 downtime
```

### 🎤 Key Takeaway:

> **"Không có Auto-Scaling → Fixed 2 containers → 500 req/min = 60% requests FAIL. Auto-Scaling → Dynamic 2-6 containers → Xử lý được mọi traffic spike, error <1%."**

---

## 📊 Combined Impact: What If We Had NONE of These?

### 🚨 Worst-Case Scenario (No ADR-001, 002, 003, 004):

```
⏰ Rush Hour - 1,000 concurrent users
    ↓
┌─────────────────────────────────────────────────────────────┐
│  DISASTER CASCADE:                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ❌ No Async (ADR-001):                                     │
│     └── 1,000 users → Blocking I/O → Threads exhausted     │
│         └── Throughput: 40 req/s (capacity: chỉ 40 users)  │
│                                                             │
│  ❌ No Read Replicas (ADR-002):                             │
│     └── All reads hit Primary → CPU 100%                   │
│         └── Database CRASH 💥                               │
│                                                             │
│  ❌ No Cache (ADR-003):                                     │
│     └── Same data queried 1,000x → DB overwhelmed          │
│         └── Query latency: 10-50ms → 5 seconds             │
│                                                             │
│  ❌ No Auto-Scaling (ADR-004):                              │
│     └── Fixed 2 containers → 200 req/min capacity          │
│         └── 1,000 concurrent = 800 OVERFLOW                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  🔥 RESULT:                                                 │
│     • Error Rate: 80-90%                                    │
│     • Response Time: 10-30 seconds (for lucky 10-20%)      │
│     • Database: CRASHED                                     │
│     • Users: 90% bỏ app, 1-star reviews                     │
│     • Business: Revenue loss, reputation damage            │
└─────────────────────────────────────────────────────────────┘
```

### ✅ With All 4 ADRs (Current System):

```
⏰ Rush Hour - 1,000 concurrent users
    ↓
✅ ADR-001 (Async):     Throughput 40x → 1,600 req/s
✅ ADR-002 (Replicas):  Read capacity 3x → DB CPU 40%
✅ ADR-003 (Cache):     99% cache hit → Response <1ms
✅ ADR-004 (Scaling):   2→7 containers → Elastic capacity
    ↓
📈 RESULT:
   • Error Rate: <1%
   • Response Time: <100ms (instant)
   • Database: Healthy, CPU 40%
   • Users: Seamless experience, 5-star reviews
   • Business: Scale to 10x users without infrastructure changes
```

---

## 🎯 Hook Script for Presentation

### Opening Hook:

> **"Hãy tưởng tượng: Sáng thứ 2, 8 giờ sáng, hàng ngàn người cùng lúc bấm 'Đặt xe' trên UIT-Go. Chuyện gì sẽ xảy ra nếu hệ thống KHÔNG CÓ những gì chúng ta vừa implement trong Module A?"**

### Transition Hooks:

**→ ADR-001:** *"Đầu tiên, nếu mọi request đều xử lý ĐỒNG BỘ..."*

**→ ADR-002:** *"Tiếp theo, giả sử tất cả 1,000 người đều xem profile tài xế cùng lúc, mà chỉ có 1 database..."*

**→ ADR-003:** *"Bây giờ, một tài xế 5 sao được 10,000 người xem profile trong 1 phút, mà KHÔNG CÓ cache..."*

**→ ADR-004:** *"Cuối cùng, traffic tăng gấp 10 lần vào giờ cao điểm, nhưng hệ thống chỉ có 2 containers cố định..."*

### Closing Hook:

> **"Đó là lý do tại sao Module A - Scalability không chỉ là 'nice to have', mà là CRITICAL để UIT-Go có thể scale từ 100 users lên 10,000 users mà không cần rebuild toàn bộ hệ thống."**

---

## 💡 Usage Tips

**1. Start with emotion:** "Hãy tưởng tượng..." / "Chuyện gì sẽ xảy ra nếu..."

**2. Use concrete numbers:** "1,000 users", "60% requests fail", "10 seconds latency"

**3. Show cascading failure:** "Database chậm → Service timeout → Users bỏ app"

**4. Contrast before/after:** "Không có ADR vs Có ADR" với metrics rõ ràng

**5. End with business impact:** "Users bỏ app = Revenue loss = Business fail"
