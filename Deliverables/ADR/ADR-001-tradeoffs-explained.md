# ADR-001: Trade-offs Giải Thích Chi Tiết

> **Mục đích:** Giải thích rõ ràng 4 trade-offs khi chuyển từ **Sync HTTP** sang **Async SNS/SQS**

---

## 🎯 Tổng quan: Trade-off là gì?

**Trade-off = Đánh đổi.** Khi chọn solution A, bạn **được** một số thứ nhưng cũng **mất** một số thứ khác.

**Không có solution hoàn hảo** - chỉ có solution phù hợp với context.

---

# Trade-off 1: Throughput vs Latency

## 📖 Giải thích khái niệm

| Thuật ngữ | Định nghĩa | Ví dụ đời thực |
|-----------|------------|----------------|
| **Throughput** | Số lượng requests xử lý được trong 1 đơn vị thời gian | Quán phở phục vụ được 100 khách/giờ |
| **Latency** | Thời gian từ lúc gửi request đến lúc nhận response | Khách chờ 10 phút để có tô phở |

## 🔴 SYNC: Throughput THẤP, Latency CAO

```
User gửi request tạo trip
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  TripService                                        │
│  ┌────────────────────────────────────────────────┐ │
│  │ Thread 1: Đang xử lý User A                    │ │
│  │           ├── Gọi DriverService (chờ 2 giây)   │ │
│  │           ├── Query DB (chờ 0.5 giây)          │ │
│  │           └── Trả response                     │ │
│  │           TỔNG: 2.5 giây thread bị BLOCK       │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Thread 2: Đang chờ User B...                       │
│  Thread 3: Đang chờ User C...                       │
│  (Threads có hạn, ví dụ 100 threads)                │
└─────────────────────────────────────────────────────┘
```

**Vấn đề:**
- Mỗi request chiếm 1 thread trong **2.5 giây**
- Server có 100 threads → Chỉ xử lý được **100 / 2.5 = 40 requests/giây**
- User thứ 101 phải **chờ** thread rảnh

**Số liệu:**
| Metric | Giá trị |
|--------|---------|
| Latency (User chờ) | **2-5 giây** |
| Throughput | **~40 requests/giây** (bị giới hạn bởi threads) |

## 🟢 ASYNC: Throughput CAO, Latency phức tạp hơn

```
User gửi request tạo trip
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  TripService                                        │
│  ┌────────────────────────────────────────────────┐ │
│  │ Thread 1: Xử lý User A                         │ │
│  │           ├── Tạo trip PENDING (50ms)          │ │
│  │           ├── Publish SNS event (10ms)         │ │
│  │           └── Trả response ngay!               │ │
│  │           TỔNG: 60ms → Thread FREE ngay        │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Thread 1 ngay lập tức xử lý User B (60ms)          │
│  Thread 1 ngay lập tức xử lý User C (60ms)          │
│  ...                                                │
└─────────────────────────────────────────────────────┘

        (Background - User không chờ)
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  SNS → SQS → DriverService                          │
│  Xử lý driver matching (2-3 giây)                   │
│  User poll để xem kết quả                           │
└─────────────────────────────────────────────────────┘
```

**Lợi ích:**
- Mỗi request chỉ chiếm thread trong **60ms** (không phải 2.5 giây)
- Server có 100 threads → Xử lý được **100 / 0.06 = 1,666 requests/giây**
- **Throughput tăng 40x!**

**Số liệu:**
| Metric | Giá trị |
|--------|---------|
| User-facing Latency | **60ms** (nhận "Đang tìm tài xế...") |
| End-to-end Latency | **2-5 giây** (chờ driver match, nhưng user không bị block) |
| Throughput | **~1,600 requests/giây** |

## ⚖️ Trade-off thực sự

| Được gì? | Mất gì? |
|----------|---------|
| ✅ Throughput tăng **40x** | ❌ User không có kết quả **ngay lập tức** |
| ✅ User nhận response trong **60ms** | ❌ User phải **poll** để xem driver matched chưa |
| ✅ Server handle nhiều users hơn | ❌ Code phức tạp hơn (async patterns) |

**Tại sao chấp nhận được?**
- UX của ride-hailing đã quen: "Đang tìm tài xế..." animation
- User không expect kết quả ngay (như Grab, Uber)
- Throughput quan trọng hơn cho scale

---

# Trade-off 2: Consistency vs Availability

## 📖 Giải thích khái niệm

| Thuật ngữ | Định nghĩa | Ví dụ đời thực |
|-----------|------------|----------------|
| **Strong Consistency** | Đọc luôn trả về data mới nhất | Xem số dư tài khoản ngân hàng = luôn chính xác |
| **Eventual Consistency** | Data sẽ consistent **sau một khoảng thời gian** | Facebook likes: bạn thấy 100, người khác thấy 99 |
| **Availability** | Hệ thống luôn trả về response (không lỗi) | Website luôn load được, không bao giờ 503 |

## 🔴 SYNC: Strong Consistency, nhưng Availability THẤP

```
┌─────────────────────────────────────────────────────┐
│  Scenario: DriverService bị DOWN                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  User ──► TripService ──► DriverService (DOWN!)     │
│                │                   │                │
│                │              ❌ TIMEOUT             │
│                │                   │                │
│                ◄───────────────────┘                │
│                │                                    │
│           ❌ Error 503                               │
│           "Không thể tạo chuyến đi"                 │
│                │                                    │
│                ▼                                    │
│           User bực mình 😤                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Cascading Failure:**
```
DriverService slow/down
        ↓
TripService timeout (chờ 5 giây)
        ↓
TripService threads bị block
        ↓
TripService cũng slow/down
        ↓
UserService timeout
        ↓
TOÀN BỘ HỆ THỐNG DOWN! 💥
```

**Số liệu:**
| Metric | Giá trị |
|--------|---------|
| Consistency | ✅ **Strong** - Data luôn chính xác |
| Availability | ❌ **Thấp** - 1 service down = cả hệ thống ảnh hưởng |

## 🟢 ASYNC: Eventual Consistency, nhưng Availability CAO

```
┌─────────────────────────────────────────────────────┐
│  Scenario: DriverService bị DOWN                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  User ──► TripService                               │
│                │                                    │
│                ├── Tạo trip PENDING ✅               │
│                ├── Publish SNS event ✅              │
│                │                                    │
│                ▼                                    │
│           ✅ Response 201                            │
│           "Đang tìm tài xế..."                      │
│                │                                    │
│                ▼                                    │
│           User OK, tiếp tục dùng app 😊             │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Background (User không biết):                      │
│                                                     │
│  SNS → SQS ──► DriverService (DOWN!)                │
│                       │                             │
│                  Message đợi trong queue            │
│                  (Không mất!)                       │
│                       │                             │
│         ... 5 phút sau, DriverService restart ...   │
│                       │                             │
│                  DriverService poll SQS             │
│                  Xử lý message                      │
│                  Match driver                       │
│                       │                             │
│                       ▼                             │
│           User nhận notification 🚗                 │
│           "Đã tìm thấy tài xế!"                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Service Isolation:**
```
DriverService slow/down
        ↓
Messages queue up trong SQS (không mất)
        ↓
TripService VẪN HOẠT ĐỘNG BÌNH THƯỜNG ✅
        ↓
UserService VẪN HOẠT ĐỘNG BÌNH THƯỜNG ✅
        ↓
User vẫn tạo được trip (status PENDING)
        ↓
Khi DriverService khôi phục → Xử lý backlog
```

**Eventual Consistency là gì?**

```
Timeline khi User tạo trip:

T=0:    TripService: trip.status = PENDING
        DriverService: Chưa biết có trip mới
        → INCONSISTENT ❌

T=1s:   Message đến SQS queue
        DriverService: Chưa poll
        → INCONSISTENT ❌

T=2s:   DriverService poll, nhận message
        DriverService: Đang xử lý
        → INCONSISTENT ❌

T=3s:   DriverService match driver, publish TripMatched
        TripService nhận event, update trip.status = MATCHED
        → CONSISTENT ✅ (cuối cùng!)
```

**"Eventual" = Cuối cùng sẽ consistent, nhưng có window 1-3 giây data không đồng bộ.**

## ⚖️ Trade-off thực sự

| Được gì? | Mất gì? |
|----------|---------|
| ✅ **Availability cao** - 1 service down không ảnh hưởng user | ❌ Data có thể **stale 1-3 giây** |
| ✅ **No cascading failures** - Services isolated | ❌ **Race conditions** có thể xảy ra |
| ✅ **Messages không mất** - SQS queue buffer | ❌ Debugging **khó hơn** (async flow) |

**Tại sao chấp nhận được?**
- Trip matching không cần precision đến millisecond
- 1-3 giây delay hoàn toàn OK cho ride-hailing
- Availability quan trọng hơn cho user experience

**Race condition example và cách xử lý:**
```
T=0: User tạo trip → status PENDING
T=1: User cancel trip → status CANCELLED
T=2: DriverService nhận TripRequested (message cũ!)
     → Định match driver cho trip đã bị cancel

Solution: Idempotent handler
     → Check trip.status trước khi update
     → Nếu status != PENDING → Ignore message
```

---

# Trade-off 3: Cost vs Reliability

## 📖 Giải thích khái niệm

| Thuật ngữ | Định nghĩa |
|-----------|------------|
| **Development Cost** | Chi phí để dev/test locally |
| **Production Cost** | Chi phí chạy trên cloud |
| **Reliability** | Khả năng hoạt động ổn định, không lỗi |

## 📊 So sánh các môi trường

### LocalStack (Development) - FREE

```
┌─────────────────────────────────────────────────────┐
│  Developer's Laptop                                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Docker Compose:                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ UserService │  │ TripService │  │DriverService│  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                         │                          │
│                         ▼                          │
│                ┌─────────────────┐                 │
│                │   LocalStack    │                 │
│                │   (SNS + SQS)   │                 │
│                │   Port 4566     │                 │
│                └─────────────────┘                 │
│                                                     │
│  💰 Cost: $0/month                                  │
│  ⚠️ Reliability: Phụ thuộc Docker                   │
│  ⚠️ Không 100% giống AWS (polling delay khác)       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### AWS SNS/SQS (Production) - LOW COST

```
┌─────────────────────────────────────────────────────┐
│  AWS Cloud                                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ECS Fargate:                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ UserService │  │ TripService │  │DriverService│  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                         │                          │
│                         ▼                          │
│                ┌─────────────────┐                 │
│                │   AWS SNS/SQS   │                 │
│                │   (Managed)     │                 │
│                └─────────────────┘                 │
│                                                     │
│  💰 Cost: ~$10-50/month (low volume)                │
│  ✅ Reliability: 99.9% SLA từ AWS                   │
│  ✅ Managed - không cần maintain                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Kafka MSK (Enterprise) - HIGH COST

```
┌─────────────────────────────────────────────────────┐
│  AWS Cloud                                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  💰 Cost: $200-500+/month (minimum)                 │
│  ✅ Reliability: Very high                          │
│  ✅ Event replay, strong ordering                   │
│  ❌ Overkill cho project này                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## ⚖️ Trade-off thực sự

| Môi trường | Cost | Reliability | Chọn khi nào? |
|------------|------|-------------|---------------|
| **LocalStack** | $0 | Thấp | Development, testing |
| **AWS SNS/SQS** | $10-50/mo | Cao | Production |
| **Kafka MSK** | $200+/mo | Rất cao | Enterprise scale |

| Được gì? | Mất gì? |
|----------|---------|
| ✅ **Dev cost = $0** với LocalStack | ❌ LocalStack **không 100% giống AWS** |
| ✅ **Prod cost thấp** với SNS/SQS | ❌ Không có **event replay** như Kafka |
| ✅ **Dễ migrate** LocalStack → AWS | ❌ Một số edge cases khác nhau |

**Tại sao chấp nhận được?**
- Course project không cần Kafka-level reliability
- $0 development cost rất quan trọng cho students
- LocalStack đủ tốt để validate patterns

**LocalStack khác AWS như thế nào?**
| Aspect | LocalStack | AWS |
|--------|------------|-----|
| Polling delay | Cao hơn (~100ms) | Thấp (~10ms) |
| Message ordering | Có thể khác | Đảm bảo |
| DLQ behavior | Giống | Giống |
| Core functionality | ✅ Giống | ✅ Giống |

---

# Trade-off 4: Simplicity vs Debuggability

## 📖 Giải thích khái niệm

| Thuật ngữ | Định nghĩa |
|-----------|------------|
| **Simplicity** | Code dễ hiểu, ít components |
| **Debuggability** | Khả năng tìm và fix bugs dễ dàng |

## 🔴 SYNC: Simple code, Easy debugging

```typescript
// SYNC approach - Rất dễ hiểu
async function createTrip(data) {
  // Step 1: Tạo trip
  const trip = await tripRepo.save(data);
  
  // Step 2: Gọi DriverService (SYNC - chờ response)
  const driver = await driverService.matchDriver(trip);
  
  // Step 3: Update trip với driver
  trip.driverId = driver.id;
  await tripRepo.save(trip);
  
  return trip;
}

// Debugging: Dễ!
// - Set breakpoint ở mỗi line
// - Xem flow từ trên xuống dưới
// - Error ở line nào → biết ngay
```

**Debug flow:**
```
Request vào
    ↓
Line 3: trip created ✅
    ↓
Line 6: driver matched ❌ ERROR!
    ↓
Stack trace chỉ thẳng line 6
    ↓
Fix bug
```

## 🟢 ASYNC: Complex code, Hard debugging

```typescript
// ASYNC approach - Phức tạp hơn

// File 1: trip.service.ts
async function createTrip(data) {
  const trip = await tripRepo.save(data);
  
  // Fire-and-forget - không biết kết quả!
  await snsClient.publish({
    topic: 'trip-events',
    message: { tripId: trip.id, type: 'TripRequested' }
  });
  
  return trip; // Return ngay, không chờ driver
}

// File 2: driver.handler.ts (KHÁC FILE!)
async function handleTripRequested(message) {
  const { tripId } = message;
  const trip = await tripRepo.findById(tripId);
  
  const driver = await matchDriver(trip);
  
  await snsClient.publish({
    topic: 'trip-events', 
    message: { tripId, driverId: driver.id, type: 'TripMatched' }
  });
}

// File 3: trip.handler.ts (LẠI KHÁC FILE!)
async function handleTripMatched(message) {
  const { tripId, driverId } = message;
  await tripRepo.update(tripId, { driverId, status: 'MATCHED' });
}
```

**Debug flow:**
```
Request vào trip.service.ts
    ↓
trip created ✅
    ↓
SNS publish... (message đi đâu?)
    ↓
... (vài giây sau) ...
    ↓
driver.handler.ts nhận message
    ↓
Error! Nhưng:
- Không có stack trace liên tục
- Không biết message từ request nào
- Log ở nhiều files khác nhau
```

## 📊 So sánh chi tiết

| Aspect | SYNC | ASYNC |
|--------|------|-------|
| **Số files liên quan** | 1 file | 3+ files |
| **Flow** | Từ trên xuống | Nhảy giữa các handlers |
| **Stack trace** | Liên tục, đầy đủ | Bị cắt giữa các messages |
| **Breakpoints** | Set 1 chỗ | Set nhiều chỗ, chờ message |
| **Reproduce bug** | Gọi API là thấy | Phải trigger đúng event sequence |
| **Correlation** | Request ID tự động | Phải tự thêm Correlation ID |

## 🔧 Mitigation: Làm sao debug ASYNC dễ hơn?

### 1. Correlation ID
```typescript
// Thêm correlationId vào mọi message
const correlationId = uuid();

await snsClient.publish({
  message: { 
    tripId, 
    correlationId,  // ← Track message này
    type: 'TripRequested' 
  }
});

// Tất cả handlers log correlationId
console.log(`[${correlationId}] Processing TripRequested`);
console.log(`[${correlationId}] Driver matched: ${driverId}`);
console.log(`[${correlationId}] Trip updated to MATCHED`);

// Giờ có thể grep log theo correlationId!
// grep "abc-123" logs.txt → Thấy toàn bộ flow
```

### 2. Structured Logging
```typescript
logger.info({
  correlationId,
  tripId,
  event: 'TripRequested',
  handler: 'driver.handler',
  timestamp: new Date()
});
```

### 3. Integration Tests
```typescript
// Test full async flow
it('should match driver when trip created', async () => {
  // 1. Create trip
  const trip = await createTrip(data);
  expect(trip.status).toBe('PENDING');
  
  // 2. Wait for async processing
  await waitFor(async () => {
    const updated = await getTrip(trip.id);
    return updated.status === 'MATCHED';
  }, { timeout: 5000 });
  
  // 3. Verify
  const finalTrip = await getTrip(trip.id);
  expect(finalTrip.driverId).toBeDefined();
});
```

## ⚖️ Trade-off thực sự

| Được gì? | Mất gì? |
|----------|---------|
| ✅ **Decoupled architecture** | ❌ Code phân tán nhiều files |
| ✅ **Independent scaling** | ❌ **Debug khó hơn** |
| ✅ **Extensible** (thêm consumers dễ) | ❌ Phải học **async patterns** |
| ✅ **Fault tolerant** | ❌ Cần **thêm tooling** (tracing, correlation) |

**Tại sao chấp nhận được?**
- Team có thể học async patterns
- Tooling (correlation ID, tracing) giải quyết được debug issues
- Benefits của decoupling outweigh complexity

---

# 📊 Summary: 4 Trade-offs

| # | Trade-off | Được | Mất | Mitigation |
|---|-----------|------|-----|------------|
| 1 | **Throughput vs Latency** | Throughput tăng 40x | User không có final result ngay | Polling pattern (UX đã quen) |
| 2 | **Consistency vs Availability** | 1 service down không ảnh hưởng | Data stale 1-3 giây | Idempotent handlers |
| 3 | **Cost vs Reliability** | Dev cost $0 | LocalStack ≠ AWS 100% | Core patterns identical |
| 4 | **Simplicity vs Debuggability** | Decoupled, extensible | Debug phức tạp | Correlation ID, tracing |

---

# 🎯 Kết luận

**Tại sao chọn ASYNC SNS/SQS dù có nhiều trade-offs?**

1. **Scale là priority #1** cho Module A
2. **Throughput tăng 40x** xứng đáng với complexity
3. **Service isolation** quan trọng cho production
4. **Mitigations đều có sẵn** và không quá phức tạp

**Công thức:**
```
Benefits của ASYNC (throughput, availability, isolation)
    >
Costs của ASYNC (complexity, debugging, eventual consistency)
```

→ **Chọn ASYNC là đúng cho context của UIT-Go.**
