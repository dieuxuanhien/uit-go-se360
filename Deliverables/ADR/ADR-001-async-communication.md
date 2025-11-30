# ADR-001: Event-Driven Async Communication

**Status:** ✅ Accepted  
**Date:** 2025-11-21  
**Module:** A - Scalability

---

## The Problem

Hệ thống UIT-Go ban đầu sử dụng **synchronous REST API calls** cho giao tiếp giữa TripService và DriverService:

```
TripService --[HTTP SYNC]--> DriverService --[Query DB]--> Response --[several seconds blocked]
```

**Symptoms:**
- Response time: **vài giây** cho trip creation (user phải chờ lâu)
- TripService bị **block** chờ DriverService response
- **Cascading failures:** DriverService slow → TripService timeout → User error
- Không handle được burst traffic (concurrent requests cao → errors)

**Scale Gap:**
- **Concurrent users:** Cần hỗ trợ số lượng lớn hơn đáng kể so với hiện tại
- **Throughput:** Cần tăng khả năng xử lý trips/phút lên nhiều lần

---

## Options Considered

### Option 1: Keep Synchronous + Circuit Breakers

**Mô tả:** Giữ nguyên HTTP sync calls, thêm Circuit Breaker pattern (Hystrix/Resilience4j) để fail-fast khi downstream service slow.

| Pros | Cons |
|------|------|
| ✅ Simple - không cần học thêm | ❌ Vẫn block threads → throughput thấp |
| ✅ Không cần infrastructure mới | ❌ Không giải quyết root cause (coupling) |
| ✅ Team đã familiar với pattern | ❌ User vẫn phải chờ lâu |

**Verdict:** ❌ Circuit breaker chỉ giúp fail-fast, không tăng throughput. Vấn đề cốt lõi là blocking I/O.

---

### Option 2: Direct SQS (Không có SNS)

**Mô tả:** TripService push message trực tiếp vào SQS queue, DriverService poll từ queue.

| Pros | Cons |
|------|------|
| ✅ Đơn giản hơn SNS+SQS | ❌ Không fan-out được (1 queue = 1 consumer type) |
| ✅ Ít components hơn | ❌ Tight coupling - TripService phải biết queue names |
| ✅ Latency thấp hơn một chút | ❌ Thêm Analytics/Notification service = sửa code |

**Verdict:** ❌ Không extensible. Khi cần thêm consumers mới (Analytics, Push Notification), phải modify TripService code.

---

### Option 3: Apache Kafka (MSK) ⭐ Ideal nhưng không khả thi

**Mô tả:** Sử dụng AWS Managed Streaming for Apache Kafka - industry standard cho event streaming.

| Pros | Cons |
|------|------|
| ✅ **Throughput cực cao** - scale vô hạn | ❌ **Chi phí cao** (managed service đắt hơn nhiều) |
| ✅ Strong ordering guarantees | ❌ Team **không có Kafka experience** |
| ✅ Event replay (reprocess từ offset) | ❌ Operational complexity (partitions, consumer groups) |
| ✅ Event sourcing ready | ❌ Overkill cho quy mô hiện tại |

**Tại sao vẫn muốn Kafka?**
- Event replay rất hữu ích cho debugging và analytics
- Strong ordering tránh race conditions
- Industry standard, dễ hire developers

**Tại sao không chọn?**
- **Budget constraint:** Chi phí vượt ngân sách cho course project
- **Team skill gap:** Cần thời gian đáng kể học Kafka concepts
- **Over-engineering:** Quy mô hiện tại không cần throughput cực cao của Kafka

**Khi nào sẽ migrate sang Kafka?**
- Khi throughput vượt xa capacity của SNS/SQS
- Khi cần event replay/sourcing
- Khi team có Kafka expertise

---

### Option 4: RabbitMQ (Self-hosted)

**Mô tả:** Deploy RabbitMQ cluster trên EC2/ECS, tự quản lý.

| Pros | Cons |
|------|------|
| ✅ Flexible routing (exchanges, bindings) | ❌ **Operational burden** (patching, monitoring, HA) |
| ✅ Rẻ hơn managed services | ❌ Team không có RabbitMQ expertise |
| ✅ Rich features (priority queues, TTL) | ❌ Single point of failure nếu setup sai |

**Verdict:** ❌ Prefer managed service để focus vào business logic, không muốn maintain message broker infrastructure.

---

### Option 5: SNS/SQS + LocalStack ✅ CHOSEN

**Mô tả:** AWS SNS (pub/sub) + SQS (queue) pattern, emulate bằng LocalStack cho development.

| Pros | Cons |
|------|------|
| ✅ **Fan-out pattern** - SNS broadcast to multiple SQS | ❌ **Eventual consistency** - có delay nhỏ |
| ✅ **Managed by AWS** - zero ops | ❌ Debugging khó hơn (async flow) |
| ✅ **DLQ built-in** - no message loss | ❌ LocalStack ≠ AWS 100% (polling delay) |
| ✅ **$0 development cost** (LocalStack) | ❌ Team cần học async patterns |
| ✅ **Chi phí production thấp** | |
| ✅ **High availability** từ AWS | |

---

## Why SNS/SQS? Decision Matrix

| Criteria | Weight | Sync+CB | Direct SQS | Kafka | RabbitMQ | SNS/SQS |
|----------|--------|---------|------------|-------|----------|---------|
| **Throughput** | 30% | 1 | 3 | 5 | 4 | 4 |
| **Cost (dev)** | 25% | 5 | 4 | 1 | 3 | 5 |
| **Team expertise** | 20% | 5 | 4 | 1 | 2 | 3 |
| **Extensibility** | 15% | 2 | 2 | 5 | 4 | 4 |
| **Operational effort** | 10% | 5 | 4 | 2 | 1 | 5 |
| **TOTAL** | 100% | **3.1** | **3.3** | **2.6** | **2.8** | **4.1** |

**Kết luận:** SNS/SQS wins với score 4.1/5, cân bằng giữa features và constraints hiện tại.

---

## Chosen Solution

**Event-Driven Architecture với AWS SNS/SQS (emulated via LocalStack for $0 development cost)**

```mermaid
flowchart TB
    subgraph Publisher["📤 TRIP SERVICE (Publisher)"]
        TS["🚗 TripService<br/>(Port 3002)"]
        HTTP["⚡ HTTP 201<br/>status: PENDING<br/>(instant response)"]
    end

    subgraph SNS["📢 SNS TOPIC"]
        Topic["trip-events<br/>Fan-out Pattern"]
    end

    subgraph Queues["📬 SQS QUEUES"]
        SQS1["driver-match-queue"]
        SQS2["trip-update-queue"]
    end

    subgraph DLQs["💀 DEAD LETTER QUEUES"]
        DLQ1["driver-match-dlq"]
        DLQ2["trip-update-dlq"]
    end

    subgraph Consumer["📥 DRIVER SERVICE (Consumer)"]
        DS["📍 DriverService<br/>Match Driver & Respond"]
    end

    %% Trip Creation Flow
    TS -->|"1. Return immediately"| HTTP
    TS -->|"2. SNS Publish<br/>(TripRequested)"| Topic

    %% SNS Fan-out to Queues
    Topic -->|"Filter: TripRequested"| SQS1
    Topic -->|"Filter: TripMatched"| SQS2
    Topic -.->|"Future: Analytics,<br/>Notifications"| Future["..."]

    %% DLQ connections
    SQS1 -.->|"maxReceiveCount: 3"| DLQ1
    SQS2 -.->|"maxReceiveCount: 3"| DLQ2

    %% Driver Service processes and responds
    SQS1 -->|"3. Poll & Process"| DS
    DS -->|"4. SNS Publish<br/>(TripMatched)"| Topic

    %% Trip Service receives update
    SQS2 -->|"5. Poll & Update<br/>Trip Status"| TS

    classDef tsBox fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef snsBox fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef sqsBox fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef dlqBox fill:#ffcdd2,stroke:#c62828,stroke-width:2px
    classDef dsBox fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef httpBox fill:#e1f5fe,stroke:#0288d1,stroke-width:2px

    class TS tsBox
    class Topic snsBox
    class SQS1,SQS2 sqsBox
    class DLQ1,DLQ2 dlqBox
    class DS dsBox
    class HTTP httpBox
```

**Message Flow:**
1. **TripService** nhận request tạo trip → trả về HTTP 201 ngay lập tức
2. **TripService** publish `TripRequested` event lên SNS
3. **SNS** fan-out đến `driver-match-queue` (filter: TripRequested)
4. **DriverService** poll queue, tìm driver phù hợp
5. **DriverService** publish `TripMatched` event lên SNS
6. **SNS** fan-out đến `trip-update-queue` (filter: TripMatched)
7. **TripService** poll queue, update trip status thành MATCHED

**Key Components:**
| Component | Purpose | Config |
|-----------|---------|--------|
| SNS Topic `trip-events` | Publish events, enable fan-out | Standard topic |
| SQS `driver-match-queue` | Driver matching consumer | Standard, high throughput |
| SQS `trip-update-queue` | Trip status updates | Standard |
| DLQ (Dead Letter Queue) | Failed messages after 3 retries | maxReceiveCount: 3 |
| LocalStack | AWS emulation for local dev | Port 4566, **free** |

---

## Trade-offs của Solution Đã Chọn (SNS/SQS)

> **Nguyên tắc:** Mọi architectural decision đều có trade-offs. Section này phân tích những gì chúng ta **được** và **mất** khi chọn SNS/SQS.

### Trade-off 1: 🚀 Throughput vs 🎯 Latency

```
┌─────────────────────────────────────────────────────────────┐
│  SYNC (Before)          │  ASYNC (After)                   │
├─────────────────────────┼───────────────────────────────────┤
│  User waits several     │  User sees "Finding..." instantly│
│  seconds for result     │  But must poll for final status  │
│  Throughput: thấp       │  Throughput: cao hơn nhiều       │
└─────────────────────────┴───────────────────────────────────┘
```

| Metric | Sync | Async | Verdict |
|--------|------|-------|---------|
| User-facing response | Vài giây (blocking) | Tức thì | ✅ Async wins |
| End-to-end completion | Vài giây | Tương tự (background) | ≈ Similar |
| Throughput | Thấp | Cao hơn nhiều | ✅ Async wins |
| User experience | Spinner lâu | "Finding driver..." instant | ✅ Async wins |

**What we gain:** Throughput cao hơn đáng kể, instant feedback cho user
**What we lose:** User không có immediate final result (phải poll status)
**Why acceptable:** Ride-hailing UX pattern đã chuẩn - user expect "Finding driver" animation

---

### Trade-off 2: 🔄 Consistency vs 💪 Availability

```
┌─────────────────────────────────────────────────────────────┐
│  SYNC: Strong Consistency    │  ASYNC: Eventual Consistency │
├──────────────────────────────┼──────────────────────────────┤
│  DriverService down?         │  DriverService down?         │
│  → TripService also fails    │  → Messages queue up         │
│  → User gets error           │  → User request succeeds     │
│  → Cascading failure         │  → Process when back online  │
└──────────────────────────────┴──────────────────────────────┘
```

| Aspect | Sync | Async | Verdict |
|--------|------|-------|---------|
| Data consistency | Strong (immediate) | Eventual (có delay nhỏ) | Sync better |
| Service isolation | Cascading failures | Isolated failures | ✅ Async wins |
| Failure handling | User sees error | Message queued, retry | ✅ Async wins |
| Data integrity | All-or-nothing | Need idempotent handlers | Sync simpler |

**What we gain:** Service isolation, no cascading failures, graceful degradation
**What we lose:** Strong consistency - có thể có race conditions
**Why acceptable:** 
- Trip matching không cần microsecond precision
- DLQ đảm bảo **no message loss** (retry 3 lần)
- Idempotent handlers giải quyết duplicate messages

---

### Trade-off 3: 💰 Cost vs 🏢 Reliability

| Environment | Cost | Reliability | Use Case |
|-------------|------|-------------|----------|
| **LocalStack (Dev)** | Free | Phụ thuộc Docker | Development, testing |
| **AWS SNS/SQS (Prod)** | Thấp | Rất cao (AWS SLA) | Production |
| **Kafka MSK** | Cao | Rất cao | Enterprise (overkill) |

**What we gain:** Free development cost với LocalStack, dễ dàng migrate lên AWS
**What we lose:** LocalStack không 100% giống AWS (polling delay cao hơn)
**Why acceptable:** 
- Development không cần production reliability
- Patterns validated locally → minimal changes khi deploy AWS

---

### Trade-off 4: 📚 Simplicity vs 🔧 Debuggability

| Aspect | Sync | Async |
|--------|------|-------|
| Code complexity | 1 HTTP call | Pub/Sub + handlers + DLQ |
| Debugging | Request → Response trace | Event correlation across services |
| Testing | Unit tests đủ | Cần integration tests |
| Onboarding | Immediate | Team cần học patterns |

**What we gain:** Decoupled architecture, independent scaling, extensibility
**What we lose:** Simple request-response flow, easy debugging
**Mitigation:**
- Document patterns kỹ trong ADRs
- Add correlation IDs cho event tracing
- Integration tests cho happy path + failure scenarios

---

## Khi nào nên migrate sang solution khác?

| Trigger | Current (SNS/SQS) | Migrate To | Reason |
|---------|-------------------|------------|--------|
| Throughput vượt capacity | ✅ Đủ cho hiện tại | Kafka MSK | SNS/SQS có giới hạn |
| Need event replay | ❌ No replay | Kafka MSK | Debug, analytics |
| Strong ordering required | ❌ Standard queues | SQS FIFO | Exactly-once processing |
| Multi-region | ✅ Works | Kafka MSK | Better replication |

---

## Expected Benefits

**Performance Improvements:**
- **Response time:** User nhận phản hồi ngay lập tức thay vì chờ full processing
- **Throughput:** Hệ thống xử lý được nhiều requests đồng thời hơn nhờ non-blocking
- **Error rate:** Giảm đáng kể nhờ decoupling và retry mechanism
- **Scalability:** Hỗ trợ scale horizontally dễ dàng hơn

**Operational Benefits:**
- Auto-scaling có thể trigger dựa trên queue depth
- Services scale independently theo workload

---

## Failure Modes

| Failure | Impact | Mitigation | Recovery |
|---------|--------|------------|----------|
| **SNS unavailable** | Cannot publish events | Circuit breaker → fallback sync HTTP | Auto-recover when SNS back |
| **SQS unavailable** | Cannot consume messages | Messages queued in SNS (buffered) | Process backlog when back |
| **Message processing fails** | Trip stuck PENDING | DLQ after 3 retries | Manual review dashboard |
| **Duplicate messages** | Driver matched twice | Idempotent handler (check trip.status before update) | No duplicate trips |
| **Message ordering** | Race conditions possible | Not critical for matching; use FIFO if needed | N/A |
| **LocalStack crash (dev)** | Dev env down | `docker restart localstack` | No prod impact |

**Monitoring Alerts:**
```
CloudWatch Alarm: DLQ messages > 0 → PagerDuty
CloudWatch Alarm: Queue depth cao → Trigger auto-scale
```

---

## Limitations & Future Work

### Current Limitations:
1. **LocalStack ≠ AWS exactly** - Polling delay cao hơn AWS production
2. **No distributed tracing** - Hard to debug cross-service message flows
3. **Manual DLQ processing** - No automated retry/dashboard yet
4. **Standard queues** - At-least-once delivery, need idempotent handlers

### Future Improvements:
| Priority | Task | Effort | Value |
|----------|------|--------|-------|
| 🔴 High | Migrate to real AWS SNS/SQS | Medium | Production reliability |
| 🟡 Medium | Add X-Ray/Jaeger tracing | Low | Debug visibility |
| 🟡 Medium | DLQ processing dashboard | Low | Ops efficiency |
| 🟢 Low | FIFO queues for strict ordering | Low | If needed later |


