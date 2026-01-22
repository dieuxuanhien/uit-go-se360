# 1. Synchronous HTTP Chaining (Coupled Scalability)

## Anti-Pattern

The system uses a **Synchronous Push Model** for inter-service communication. `TripService` pushes requests to `DriverService` via HTTP and waits for response.

> **Example:** User requests trip → `TripService` calls `POST /match` on `DriverService` → If driver matching takes 5 seconds → `TripService` (and User) waits 5 seconds.

## Core Problem: Temporal Coupling Without Backpressure

When `TripService` calls `DriverService` synchronously, it becomes **"Held Hostage"**—unable to finish the user's request until receiving a response. This creates **temporal coupling**: the lifetime of the upstream request is directly coupled to the downstream response time.

**Critical Definitions:**
- **Backpressure:** An *active* flow control mechanism where a downstream system *signals* to an upstream system that it cannot process work at the current rate, causing the producer to slow down or stop. *As defined by the [Reactive Manifesto](https://www.reactivemanifesto.org/glossary#Back-Pressure): "When one component is struggling to keep-up, the system as a whole needs to respond in a sensible way... This is back-pressure."*
- **Buffering:** A *passive* mechanism where messages are temporarily stored until the consumer is ready. Buffers absorb bursts but do **not** signal producers to slow down. *If producers outpace consumers indefinitely, buffers eventually overflow.* *(Kleppmann, "Designing Data-Intensive Applications")*
- **Backpressure Mechanisms:** Explicit controls (rate limiting, circuit breakers, bounded concurrency, rejection) that detect overload and **actively respond**—either by signaling producers or rejecting work. *(Nygard, "Release It!", 2018)*
- **The Node.js Problem:** Unlike thread-per-request models with limited worker pools providing *automatic* application-level backpressure, Node.js does not automatically bound concurrent request lifecycles. Without explicit mechanisms, the system accepts work until lower-level limits (heap memory, file descriptors, OS backlog, proxy queues) are exhausted. *This phenomenon is described by Matteo Collina (Fastify creator, Node.js TSC) as "thrashing the event loop" leading to self-denial-of-service.*

### Understanding "Signal" in Backpressure

> **Common Question:** "If rate limiting returns `503 Service Unavailable`, users don't understand this and keep sending requests. How is this a 'signal'?"

Backpressure signals exist on a **spectrum from passive to active enforcement**:

| Signal Type | How It Works | Producer Response | Enforcement |
|------------|--------------|-------------------|-------------|
| **Passive (HTTP Status)** | Return `503`/`429` error code | Client *should* back off but can ignore | ❌ Not enforced; badly designed clients cause retry storms |
| **Bounded Concurrency** | Limit in-flight requests (e.g., 100 max) | New requests wait/queue until slot frees | ✅ Enforced; 101st request physically cannot proceed |
| **Circuit Breaker** | Detect failure rate → open circuit | Fail-fast without calling downstream | ✅ Enforced; downstream protected from additional load |
| **TCP Flow Control** | Receiver sends window size = 0 | Sender **must stop** sending (OS-level) | Kernel-enforced; no application choice |
| **Queue Rejection** | Bounded queue full → reject enqueue | Producer gets immediate error | ✅ Enforced; producer must handle rejection |

**Key Insight:** The "signal" means **the producer is given immediate feedback** about overload. Compare:

```
No Backpressure (Unbounded Buffer):
Producer → [Buffer grows: 1000...5000...10000] → Consumer (drowning)
                 ↑ Producer never knows consumer is struggling

With Backpressure (Bounded Queue):
Producer → [Queue: 100/100 FULL] → Consumer
              ↓ Immediate rejection
         Producer MUST react: retry later, alert, shed load
```

**Well-Designed vs. Poorly-Designed Clients:**

| Client Behavior | When Receiving `503`/`429` |
|-----------------|---------------------------|
| **Poorly designed** | Immediate retry → retry storm → amplifies overload |
| **Well designed** | Respect `Retry-After` header, exponential backoff, client-side circuit breaker |

The "signal" creates the **opportunity for cooperation**. Production systems combine:
1. **Passive signals** (HTTP error codes) for well-behaved clients
2. **Active enforcement** (rate limiting, circuit breakers) to protect against misbehaving clients
3. **OS-level limits** (connection limits, TCP backpressure) as final safety net

## Why Node.js Makes This Worse

> **Source:** This section draws from Matteo Collina's research on Node.js performance, presented at USENIX SREcon and documented in Node.js official guides.

### Event Loop Efficiency as a Trap

Node.js's single-threaded event loop is optimized for I/O-bound workloads (network, database, files) where waiting is delegated to the OS. Network I/O is asynchronous—awaiting a downstream HTTP response does **not** block the event loop.

**Key Characteristics:**
- Single event loop handles many concurrent requests efficiently
- Awaiting I/O yields control back to the event loop (stays responsive)
- `async/await` does not block the event loop for I/O
- `async/await` does **not** impose concurrency limits
- Only synchronous CPU-bound work or explicit sync APIs (`fs.readFileSync`) block the event loop

**The Trade-off:**

While the event loop stays responsive, the **request lifecycle remains open**, silently accumulating retained state (memory, sockets, request context) across thousands of concurrent in-flight requests. This responsiveness masks overload until resources are exhausted.

## The Failure Cascade

### 1. Resource Accumulation

Each waiting request must retain:
- **Socket (File Descriptor):** Open network connection to downstream service
- **Heap Memory:** HTTP headers, request bodies, response builders, closures, promise chains
- **Connection Pool Slot:** Cannot be returned until response arrives

These resources cannot be freed or garbage collected while the request is active (reachable from call stack).

#### Deep Dive: What Each Resource Means

**Socket (File Descriptor):**
A socket is an OS-level endpoint for network communication. Each HTTP connection to DriverService creates a socket, identified by a file descriptor (FD) number.

```
TripService ──── Socket (FD #42) ────► DriverService
                     ↑
                     └── Stays OPEN while waiting for response
                         OS limit: typically 1024-65535 FDs per process
```

*In Your Scenario:* If DriverService takes 5 seconds and 1000 requests arrive, you have 1000 open sockets. Hit the limit → `Error: EMFILE: too many open files` → new requests fail immediately.

---

**Heap Memory:**
Dynamic memory where JavaScript allocates objects. Each pending request holds:

| Component | What It Contains | Size |
|-----------|------------------|------|
| Request object | Headers, body, cookies, socket reference | Varies (depends on payload) |
| Response builder | Partial response data | Varies |
| Promise chain | Each `.then()` creates objects (~100-200 bytes each) | Grows with chain length |
| Closures | Captured variables from scope (~112 bytes + captured data) | Varies by context |
| HTTP client buffers | Socket read/write buffers | Library-dependent |

> **Note:** Exact sizes vary by V8 version, payload size, and application code. The key insight is that **each pending request holds memory that cannot be freed until completion**.

*In Your Scenario:* 
```
2000 req/sec × 5 sec response time = 10,000 pending requests
Each request holds: request context + closures + buffers
Memory accumulates faster than GC can reclaim
Eventually: 💥 "JavaScript heap out of memory"
```

The trap: Event loop stays responsive, so Node.js keeps accepting requests, silently accumulating memory until crash.

---

**Connection Pool Slot:**
HTTP clients reuse connections via a pool (avoids TCP handshake overhead). Pool has a fixed size.

```
┌───────────────── Connection Pool (size: 10) ─────────────────┐
│  Slot 1: [BUSY - waiting 5s for DriverService response]      │
│  Slot 2: [BUSY - waiting 5s for DriverService response]      │
│  ...                                                         │
│  Slot 10: [BUSY - waiting 5s for DriverService response]     │
├──────────────────────────────────────────────────────────────┤
│  Request #11: ⏳ Queued (waiting for slot)                   │
│  Request #12: ⏳ Queued (waiting for slot)                   │
│  ... (queue grows unbounded until timeout or OOM)            │
└──────────────────────────────────────────────────────────────┘
```

*In Your Scenario:* All 10 slots are occupied waiting for DriverService. Incoming requests queue behind them. If DriverService is slow, the queue grows faster than it drains → memory exhaustion or mass timeouts.

---

**The Cascade:**
```
DriverService slow (5s) → Sockets held → Heap grows → Pool exhausted
                                ↓
         ┌──────────────────────┴──────────────────────┐
         ▼                      ▼                      ▼
   💥 EMFILE              💥 OOM Crash           💥 Pool Timeout
   (FD limit)          (heap exhausted)         (queue overflow)
```


### 2. Multi-Layer Saturation

Exhaustion occurs across multiple layers simultaneously:

#### Application Layer

**Connection Pool Starvation:**
```
HTTP Client Connection Pool (e.g., axios, node-fetch)
┌─────────────────────────────────────────┐
│  Pool to DriverService (size: 10)       │
│  ┌─────┐ ┌─────┐ ┌─────┐ ... ┌─────┐    │
│  │BUSY │ │BUSY │ │BUSY │     │BUSY │    │  ← All slots occupied
│  └─────┘ └─────┘ └─────┘     └─────┘    │
│                                         │
│  Waiting Queue: [req11, req12, ...]     │  ← Requests pile up
└─────────────────────────────────────────┘
```
All connections are waiting for slow DriverService responses. New requests queue before even starting HTTP call.

**Event Loop Delay:**
```
Normal:    Tick 1 (1ms) → Tick 2 (1ms) → Tick 3 (1ms)
Saturated: Tick 1 (50ms) → Tick 2 (200ms GC) → Tick 3 (100ms)
                  ↑              ↑
           Many callbacks    GC pressure
```
Time between event loop ticks increases. All requests slow down, timeouts increase.

#### Proxy Layer (Load Balancer)

```
Nginx/HAProxy/ALB
┌─────────────────────────────────────────────────────┐
│  Request Queue (limited, e.g., 128-1024)            │
│  ┌────┐ ┌────┐ ┌────┐ ... ┌────┐ [FULL!]            │
│  │req1│ │req2│ │req3│     │reqN│                    │
│  └────┘ └────┘ └────┘     └────┘                    │
│                                                     │
│  New request arrives → 502 Bad Gateway              │
└─────────────────────────────────────────────────────┘
```
Backend (Node.js) is too slow to accept connections. Users see `502 Bad Gateway` or `503 Service Unavailable`.

#### OS Layer

```bash
# Each socket = 1 file descriptor (FD)
# Default soft limit: 1024 FDs

$ ulimit -n
1024

# When limit reached:
Error: EMFILE: too many open files
```
OS limits how many files/sockets a process can open. 1000+ pending connections = 1000+ FDs. Fix: `ulimit -n 65535`.

**Which fails first?** Depends on configuration. Usually:
1. Connection pool (smallest, ~10 connections)
2. File descriptors (default 1024)
3. Memory (512MB - 4GB)

### 3. Memory Exhaustion (OOM)

Under sustained load:
1. Thousands of requests wait simultaneously
2. Retained state grows faster than Garbage Collector can reclaim
3. GC cycles become more frequent
4. When heap exceeds limit → `JavaScript heap out of memory`
5. Process crashes → entire server dies

#### Why GC Can't Save You

```
Normal Operation:
Heap: [obj1] [obj2] [obj3] [   free   ]
GC runs → reclaims unreachable objects
Heap: [obj1] [          free          ]

Under Load (Pending Requests):
Heap: [req1] [req2] [req3] ... [req10000]
             ↑       ↑           ↑
        All REACHABLE (awaiting response)

GC runs → NOTHING to reclaim!
```
**Key insight:** GC only reclaims **unreachable** objects. Pending requests are **reachable** (held by event loop, promise chains). GC is powerless.

#### V8 Orinoco (Modern GC)

V8's garbage collector is sophisticated (concurrent marking, parallel scavenging, incremental marking). But under extreme pressure:
1. Too many live objects → marking takes longer
2. GC runs more frequently → CPU spent on GC, not your code
3. Eventually: "stop-the-world" major GC pauses (100ms+)
4. If allocation rate > reclamation rate → OOM inevitable

#### Promise Microtask Queue

```
V8 Event Loop Priority:
1. Microtasks (promise .then/.catch/.finally) ← FIRST
2. Timers (setTimeout, setInterval)
3. I/O callbacks (fs, net)
4. Check (setImmediate)
```
If 10,000 promises resolve simultaneously, their `.then()` callbacks all run before the event loop processes anything else → massive event loop delay spike.



### 4. The Autoscaling Death Spiral

> **References:** [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/), [AWS Auto Scaling Best Practices](https://docs.aws.amazon.com/autoscaling/), [AWS Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), [ByteByteGo on Retry Amplification](https://bytebytego.com/)

**The Cascade:**

| Time | Event | Reality Check |
|------|-------|---------------|
| **T+0s** | Traffic spikes 10x (instant) | Actual spike velocity varies; can be gradual or instant |
| **T+15-60s** | Existing nodes degrade | Event loop delay → healthchecks fail → memory pressure |
| | | Some nodes OOM crash; Docker restarts (cold startup worsens load) |
| | | Load balancer marks unhealthy nodes "down" (502 errors) |
| **T+1-2min** | Autoscaler detects overload | **K8s HPA:** 15s sync + 60s metrics scrape + evaluation = 1-2min |
| | | **AWS Auto Scaling:** 1-5min depending on metric resolution |
| **T+3-5min** | New nodes boot but... | Container startup + app initialization + cache warm-up |
| | | **Thundering Herd:** All queued/retried requests flood new nodes |

**Critical Misunderstanding: Retry Amplification Math**

> **Common Myth:** "3 layers × 3 retries = 9× load"
>
> **Reality:** Retry amplification is **exponential (K^N)**, not additive:

```
System: API Gateway → Service A → Service B → Database
Each layer retries 3 times on failure

Worst-case scenario (all layers retry):
- 1 user request triggers 1 call to Service A
- Service A fails, retries 3 times → 3 calls to Service B
- Each of those 3 calls fails, retries 3 times → 3×3 = 9 calls to Database
- If Service B also retries to Database 3 times → 3^3 = 27 calls to Database

Formula: K^N where K = retries per layer, N = call chain depth
```

**Sources:** [Uber Engineering on Retry Amplification](https://eng.uber.com/), [AWS Architecture Blog](https://aws.amazon.com/architecture/well-architected/)

**The Thundering Herd Problem:**

When new nodes pass healthcheck, **all queued requests hit simultaneously**:
- Load balancer floods new node with backlog
- Clients retry after previous timeouts (synchronized timing)
- Circuit breakers re-close → burst of traffic
- **Result:** New nodes receive 10-100× burst and crash before handling first request

**Why This Is Hard to Prevent:**

| Naive Solution | Why It Fails |
|----------------|--------------|
| "Just add more nodes" | New nodes face same thundering herd → crash loop |
| "Scale faster" | Autoscaler already at max speed; problem is burst arrival |
| "Increase resources per node" | Doesn't help if event loop is saturated |

**Proper Mitigations (Industry Best Practices):**

1. **Exponential Backoff with Jitter** *(AWS Well-Architected Framework)*
   ```
   retry_delay = min(max_delay, base_delay * 2^attempt) + random(0, jitter)
   ```
   - **Without jitter:** All clients retry at same time (1s, 2s, 4s...)
   - **With jitter:** Retries spread out randomly → no synchronized spike

2. **Circuit Breakers** *(Martin Fowler's pattern)*
   - Open circuit when failure rate exceeds threshold
   - Half-open after cooldown → test with limited requests
   - **Prevents:** Continuous retries to failing service

3. **Load Shedding**
   - Drop low-priority requests when overloaded
   - Return `503` immediately rather than queuing → client backs off

4. **Single-Layer Retries**
   - Only retry at edge (API gateway)
   - **Avoids:** K^N amplification in deep call chains

**Result:** Without these patterns, 4-5 minutes of complete downtime while system oscillates between crash and recovery. Users abandon platform before stability.



## Critical Impacts

### Coupled Scalability
- Cannot scale services independently
- Adding more `TripService` nodes just crashes `DriverService` faster
- One slow service bottlenecks the entire chain

### Latency Chaining
- Total latency = sum of all service latencies + network hops
- Downstream slowness directly impacts user experience
- No buffering or asynchronous processing

### Cascading Failures
- Temporary downstream slowness → upstream resource exhaustion → crash
- Failure propagates upward through all dependent services
- System-wide outage from single service degradation

### No Automatic Backpressure
- Node.js continues accepting requests beyond safe capacity
- Event loop responsiveness hides overload symptoms
- Failure only becomes visible when lower-level limits are hit
- By then, recovery requires full restart (all accumulated state lost)

## Solution Direction

Implement explicit flow control mechanisms:

### True Backpressure (Active Signaling)
- **Bounded Concurrency:** Limit in-flight downstream requests (`p-limit`, per-route limits)
- **Load Shedding:** Reject requests when over capacity (`503 Service Unavailable`, `429 Too Many Requests`)
  - *Node.js specific:* [`@fastify/under-pressure`](https://github.com/fastify/under-pressure) monitors event loop delay and heap usage, returning 503 when overloaded
- **Circuit Breakers:** Stop calling failing downstream services *(pattern popularized by Michael Nygard in "Release It!")*
- **Timeouts:** Fail fast instead of accumulating indefinitely

### Buffering/Decoupling (Passive, Not True Backpressure)
- **Message Queues:** Decouple services with asynchronous pull-based consumption. *Note: Queues provide **buffering and temporal decoupling**, not backpressure signaling. The producer is not told to slow down—the queue absorbs bursts. The consumer controls its own rate by pulling messages.* *(Kleppmann, "DDIA"; Enterprise Integration Patterns)*

> **Key Distinction:** Backpressure = producer is **told** to slow down. Buffering = producer keeps sending, messages are **stored** until consumed. Both are valid strategies; they solve different problems.

When capacity is reached, producers must be slowed (rate-limited) or rejected, allowing consumers to process at a controlled rate and preventing cascading failures.

> **References:** See [bottleneck-references.md](./bottleneck-references.md) for authoritative sources.

---

---

# 1. Synchronous HTTP Chaining (Coupled Scalability) - TIẾNG VIỆT

## Anti-Pattern (Mô hình sai lầm)

Hệ thống sử dụng **Mô hình Đồng bộ Kiểu Push** cho giao tiếp giữa các service. `TripService` đẩy request tới `DriverService` qua HTTP và chờ phản hồi.

> **Ví dụ:** User yêu cầu chuyến đi → `TripService` gọi `POST /match` tới `DriverService` → Nếu việc ghép tài xế mất 5 giây → `TripService` (và User) phải chờ 5 giây.

## Vấn đề cốt lõi: Gắn kết thời gian (Temporal Coupling) không có Backpressure

Khi `TripService` gọi `DriverService` đồng bộ, nó trở thành **"Con tin"**—không thể hoàn thành request của user cho đến khi nhận được response. Điều này tạo ra **temporal coupling**: vòng đời của request upstream bị gắn trực tiếp với thời gian phản hồi của downstream.

**Định nghĩa quan trọng:**
- **Backpressure:** Cơ chế kiểm soát luồng *chủ động* nơi hệ thống downstream *báo hiệu* cho upstream rằng nó không thể xử lý công việc ở tốc độ hiện tại, buộc producer phải chậm lại hoặc dừng. *Theo định nghĩa của [Reactive Manifesto](https://www.reactivemanifesto.org/glossary#Back-Pressure): "Khi một thành phần đang gặp khó khăn để theo kịp, toàn bộ hệ thống cần phản ứng một cách hợp lý... Đây là back-pressure."*
- **Buffering:** Cơ chế *bị động* nơi message được lưu trữ tạm thời cho đến khi consumer sẵn sàng. Buffer hấp thụ burst nhưng **không** báo hiệu producer chậm lại. *Nếu producer vượt consumer vô thời hạn, buffer cuối cùng sẽ tràn.* *(Kleppmann, "Designing Data-Intensive Applications")*
- **Backpressure Mechanisms:** Các điều khiển tường minh (rate limiting, circuit breaker, bounded concurrency, rejection) phát hiện quá tải và **phản ứng chủ động**—hoặc báo hiệu producer hoặc từ chối công việc. *(Nygard, "Release It!", 2018)*
- **Vấn đề của Node.js:** Khác với mô hình thread-per-request có worker pool giới hạn cung cấp backpressure *tự động* ở tầng ứng dụng, Node.js không tự động giới hạn số lượng vòng đời request đồng thời. Nếu không có cơ chế tường minh, hệ thống sẽ chấp nhận công việc cho đến khi cạn kiệt các giới hạn cấp thấp (heap memory, file descriptor, OS backlog, proxy queue). *Hiện tượng này được Matteo Collina (người tạo Fastify, Node.js TSC) mô tả là "thrashing the event loop" dẫn đến tự tấn công từ chối dịch vụ.*

### Hiểu về "Tín hiệu" trong Backpressure

> **Câu hỏi thường gặp:** "Nếu rate limiting trả về `503 Service Unavailable`, user không hiểu điều này và tiếp tục gửi request. Làm sao đây là 'tín hiệu'?"

Tín hiệu backpressure tồn tại trên **phổ từ bị động đến chủ động**:

| Loại tín hiệu | Cách hoạt động | Phản ứng của Producer | Enforcement |
|--------------|----------------|----------------------|-------------|
| **Bị động (HTTP Status)** | Trả về mã lỗi `503`/`429` | Client *nên* back off nhưng có thể bỏ qua | ❌ Không enforce; client thiết kế tồi gây retry storm |
| **Bounded Concurrency** | Giới hạn request in-flight (vd: tối đa 100) | Request mới chờ/queue đến khi có slot | ✅ Enforce; request thứ 101 không thể tiến hành |
| **Circuit Breaker** | Phát hiện tỷ lệ lỗi → mở circuit | Fail-fast mà không gọi downstream | ✅ Enforce; downstream được bảo vệ khỏi tải thêm |
| **TCP Flow Control** | Receiver gửi window size = 0 | Sender **phải dừng** gửi (cấp OS) | ✅✅ Kernel-enforced; ứng dụng không có lựa chọn |
| **Queue Rejection** | Bounded queue đầy → từ chối enqueue | Producer nhận lỗi ngay lập tức | ✅ Enforce; producer phải xử lý rejection |

**Insight quan trọng:** "Tín hiệu" có nghĩa **producer nhận phản hồi ngay lập tức** về quá tải. So sánh:

```
Không có Backpressure (Unbounded Buffer):
Producer → [Buffer tăng: 1000...5000...10000] → Consumer (chìm đuối)
                 ↑ Producer không bao giờ biết consumer đang gặp khó khăn

Có Backpressure (Bounded Queue):
Producer → [Queue: 100/100 ĐẦY] → Consumer
              ↓ Rejection ngay lập tức
         Producer PHẢI phản ứng: retry sau, alert, shed load
```

**Client thiết kế tốt vs. tồi:**

| Hành vi Client | Khi nhận `503`/`429` |
|----------------|---------------------|
| **Thiết kế tồi** | Retry ngay lập tức → retry storm → khuếch đại quá tải |
| **Thiết kế tốt** | Tôn trọng `Retry-After` header, exponential backoff, client-side circuit breaker |

"Tín hiệu" tạo **cơ hội cho sự hợp tác**. Hệ thống production kết hợp:
1. **Tín hiệu bị động** (HTTP error code) cho client tuân thủ
2. **Enforcement chủ động** (rate limiting, circuit breaker) để bảo vệ khỏi client không tuân thủ
3. **Giới hạn cấp OS** (connection limit, TCP backpressure) như lưới an toàn cuối cùng

## Tại sao Node.js làm vấn đề tệ hơn

### Hiệu suất Event Loop như một cái bẫy

Event loop đơn luồng của Node.js được tối ưu cho khối lượng công việc I/O-bound (network, database, file) nơi việc chờ đợi được ủy thác cho OS. Network I/O là bất đồng bộ—việc await HTTP response downstream **không** block event loop.

**Đặc điểm chính:**
- Event loop đơn xử lý nhiều request đồng thời hiệu quả
- Await I/O trả quyền kiểm soát về event loop (vẫn responsive)
- `async/await` không block event loop cho I/O
- `async/await` **không** áp đặt giới hạn concurrency
- Chỉ có CPU-bound work đồng bộ hoặc sync API tường minh (`fs.readFileSync`) mới block event loop

**Sự đánh đổi:**

Trong khi event loop vẫn responsive, **vòng đời request vẫn mở**, âm thầm tích lũy trạng thái giữ lại (memory, socket, request context) qua hàng nghìn request in-flight đồng thời. Tính responsive này che giấu quá tải cho đến khi tài nguyên cạn kiệt.

## Chuỗi sự cố (Failure Cascade)

### 1. Tích lũy tài nguyên

Mỗi request đang chờ phải giữ lại:
- **Socket (File Descriptor):** Kết nối mạng mở tới downstream service
- **Heap Memory:** HTTP header, request body, response builder, closure, promise chain
- **Connection Pool Slot:** Không thể trả về cho đến khi nhận response

Những tài nguyên này không thể được giải phóng hoặc garbage collect khi request còn active (reachable từ call stack).

#### Chi tiết: Ý nghĩa từng loại tài nguyên

**Socket (File Descriptor):**
Socket là endpoint cấp OS cho giao tiếp mạng. Mỗi kết nối HTTP tới DriverService tạo một socket, được định danh bằng file descriptor (FD).

```
TripService ──── Socket (FD #42) ────► DriverService
                     ↑
                     └── Giữ MỞ trong khi chờ response
                         Giới hạn OS: thường 1024-65535 FD mỗi process
```

*Trong kịch bản của bạn:* Nếu DriverService mất 5 giây và 1000 request đến, bạn có 1000 socket mở. Đạt giới hạn → `Error: EMFILE: too many open files` → request mới fail ngay lập tức.

---

**Heap Memory:**
Bộ nhớ động nơi JavaScript cấp phát object. Mỗi request đang chờ giữ:

| Thành phần | Chứa gì | Kích thước |
|------------|---------|------------|
| Request object | Header, body, cookie, socket reference | Thay đổi (tùy payload) |
| Response builder | Dữ liệu response tạm | Thay đổi |
| Promise chain | Mỗi `.then()` tạo object (~100-200 bytes mỗi cái) | Tăng theo độ dài chain |
| Closure | Biến được capture từ scope (~112 bytes + data) | Thay đổi theo context |
| HTTP client buffer | Buffer đọc/ghi socket | Tùy thư viện |

> **Lưu ý:** Kích thước chính xác thay đổi theo phiên bản V8, kích thước payload, và code ứng dụng. Điểm quan trọng là **mỗi request đang chờ giữ memory không thể giải phóng cho đến khi hoàn thành**.

*Trong kịch bản của bạn:* 
```
2000 req/giây × 5 giây response = 10,000 request đang chờ
Mỗi request giữ: request context + closure + buffer
Memory tích lũy nhanh hơn GC có thể thu hồi
Cuối cùng: 💥 "JavaScript heap out of memory"
```

Cái bẫy: Event loop vẫn responsive, nên Node.js tiếp tục chấp nhận request, âm thầm tích lũy memory cho đến khi crash.

---

**Connection Pool Slot:**
HTTP client tái sử dụng connection qua pool (tránh overhead TCP handshake). Pool có kích thước cố định.

```
┌───────────────── Connection Pool (size: 10) ─────────────────┐
│  Slot 1: [BẬN - chờ 5s cho DriverService response]          │
│  Slot 2: [BẬN - chờ 5s cho DriverService response]          │
│  ...                                                         │
│  Slot 10: [BẬN - chờ 5s cho DriverService response]         │
├──────────────────────────────────────────────────────────────┤
│  Request #11: ⏳ Xếp hàng (chờ slot trống)                   │
│  Request #12: ⏳ Xếp hàng (chờ slot trống)                   │
│  ... (hàng đợi tăng không giới hạn đến timeout hoặc OOM)     │
└──────────────────────────────────────────────────────────────┘
```

*Trong kịch bản của bạn:* Tất cả 10 slot đang bận chờ DriverService. Request đến xếp hàng phía sau. Nếu DriverService chậm, hàng đợi tăng nhanh hơn thoát → cạn kiệt memory hoặc timeout hàng loạt.

---

**Chuỗi sự cố:**
```
DriverService chậm (5s) → Socket giữ → Heap tăng → Pool cạn kiệt
                                ↓
         ┌──────────────────────┴──────────────────────┐
         ▼                      ▼                      ▼
   💥 EMFILE              💥 OOM Crash           💥 Pool Timeout
   (giới hạn FD)        (heap cạn kiệt)        (hàng đợi tràn)
```



### 2. Bão hòa đa tầng

Sự cạn kiệt xảy ra qua nhiều tầng đồng thời:

#### Application Layer

**Connection Pool Starvation:**
```
HTTP Client Connection Pool (axios, node-fetch)
┌─────────────────────────────────────────┐
│  Pool tới DriverService (size: 10)      │
│  ┌─────┐ ┌─────┐ ┌─────┐ ... ┌─────┐   │
│  │BẬN  │ │BẬN  │ │BẬN  │     │BẬN  │   │  ← Tất cả slot đang bận
│  └─────┘ └─────┘ └─────┘     └─────┘   │
│                                         │
│  Hàng đợi: [req11, req12, ...]          │  ← Request xếp hàng
└─────────────────────────────────────────┘
```
Tất cả connection đang chờ DriverService. Request mới phải xếp hàng trước khi bắt đầu HTTP call.

**Event Loop Delay:**
```
Bình thường: Tick 1 (1ms) → Tick 2 (1ms) → Tick 3 (1ms)
Bão hòa:     Tick 1 (50ms) → Tick 2 (200ms GC) → Tick 3 (100ms)
                   ↑              ↑
            Nhiều callback    GC pressure
```
Thời gian giữa các tick event loop tăng. Mọi request chậm lại, timeout tăng.

#### Proxy Layer (Load Balancer)

```
Nginx/HAProxy/ALB
┌─────────────────────────────────────────────────────┐
│  Request Queue (giới hạn, vd: 128-1024)            │
│  ┌────┐ ┌────┐ ┌────┐ ... ┌────┐ [ĐẦY!]           │
│  │req1│ │req2│ │req3│     │reqN│                   │
│  └────┘ └────┘ └────┘     └────┘                   │
│                                                     │
│  Request mới đến → 502 Bad Gateway                 │
└─────────────────────────────────────────────────────┘
```
Backend (Node.js) quá chậm để accept connection. User thấy `502 Bad Gateway` hoặc `503 Service Unavailable`.

#### OS Layer

```bash
# Mỗi socket = 1 file descriptor (FD)
# Giới hạn mặc định: 1024 FD

$ ulimit -n
1024

# Khi đạt giới hạn:
Error: EMFILE: too many open files
```
OS giới hạn số file/socket một process có thể mở. 1000+ connection = 1000+ FD. Sửa: `ulimit -n 65535`.

**Cái nào fail trước?** Tùy cấu hình. Thường:
1. Connection pool (nhỏ nhất, ~10 connection)
2. File descriptor (mặc định 1024)
3. Memory (512MB - 4GB)

### 3. Cạn kiệt bộ nhớ (OOM)

Dưới tải sustained:
1. Hàng nghìn request chờ đồng thời
2. Trạng thái giữ lại tăng nhanh hơn GC thu hồi
3. Chu kỳ GC thường xuyên hơn
4. Khi heap vượt giới hạn → `JavaScript heap out of memory`
5. Process crash → server chết

#### Tại sao GC không cứu được

```
Hoạt động bình thường:
Heap: [obj1] [obj2] [obj3] [   trống   ]
GC chạy → thu hồi object không còn tham chiếu
Heap: [obj1] [          trống          ]

Dưới tải (Request đang chờ):
Heap: [req1] [req2] [req3] ... [req10000]
             ↑       ↑           ↑
        Tất cả CÒN THAM CHIẾU (đang chờ response)

GC chạy → KHÔNG có gì để thu hồi!
```
**Điểm mấu chốt:** GC chỉ thu hồi object **không còn tham chiếu**. Request đang chờ **còn tham chiếu** (giữ bởi event loop, promise chain). GC bất lực.

#### V8 Orinoco (GC hiện đại)

GC của V8 rất tinh vi (concurrent marking, parallel scavenging, incremental marking). Nhưng dưới áp lực cực đoan:
1. Quá nhiều live object → marking mất nhiều thời gian hơn
2. GC chạy thường xuyên hơn → CPU dùng cho GC, không phải code
3. Cuối cùng: "stop-the-world" major GC pause (100ms+)
4. Nếu tốc độ cấp phát > tốc độ thu hồi → OOM không tránh khỏi

#### Promise Microtask Queue

```
V8 Event Loop Priority:
1. Microtask (promise .then/.catch/.finally) ← ĐẦU TIÊN
2. Timer (setTimeout, setInterval)
3. I/O callback (fs, net)
4. Check (setImmediate)
```
Nếu 10,000 promise resolve cùng lúc, các `.then()` callback đều chạy trước khi event loop xử lý thứ khác → spike event loop delay khổng lồ.



### 4. Vòng xoáy chết của Autoscaling

> **Tham khảo:** [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/), [AWS Auto Scaling Best Practices](https://docs.aws.amazon.com/autoscaling/), [AWS Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), [ByteByteGo on Retry Amplification](https://bytebytego.com/)

**Cascade:**

| Thời gian | Sự kiện | Reality Check |
|-----------|---------|---------------|
| **T+0s** | Traffic tăng đột biến 10x (tức thì) | Tốc độ spike thực tế thay đổi; có thể dần dần hoặc tức thì |
| **T+15-60s** | Các node hiện tại suy giảm | Event loop delay → healthcheck fail → memory pressure |
| | | Một số node OOM crash; Docker restart (cold startup làm tệ hơn) |
| | | Load balancer đánh dấu node unhealthy "down" (lỗi 502) |
| **T+1-2min** | Autoscaler phát hiện quá tải | **K8s HPA:** 15s sync + 60s metrics scrape + evaluation = 1-2min |
| | | **AWS Auto Scaling:** 1-5min tùy thuộc độ phân giải metric |
| **T+3-5min** | Node mới boot nhưng... | Container startup + app initialization + cache warm-up |
| | | **Thundering Herd:** Tất cả request queued/retry đổ xô vào node mới |

**Hiểu lầm quan trọng: Toán học Retry Amplification**

> **Lầm tưởng phổ biến:** "3 tầng × 3 retry = 9× load"
>
> **Thực tế:** Retry amplification là **lũy thừa (K^N)**, không phải cộng:

```
Hệ thống: API Gateway → Service A → Service B → Database
Mỗi tầng retry 3 lần khi fail

Kịch bản xấu nhất (tất cả tầng retry):
- 1 user request kích hoạt 1 call tới Service A
- Service A fail, retry 3 lần → 3 call tới Service B
- Mỗi trong 3 call đó fail, retry 3 lần → 3×3 = 9 call tới Database
- Nếu Service B cũng retry tới Database 3 lần → 3^3 = 27 call tới Database

Công thức: K^N với K = retry mỗi tầng, N = độ sâu call chain
```

**Nguồn:** [Uber Engineering on Retry Amplification](https://eng.uber.com/), [AWS Architecture Blog](https://aws.amazon.com/architecture/well-architected/)

**Vấn đề Thundering Herd:**

Khi node mới pass healthcheck, **tất cả request queued đổ xô vào cùng lúc**:
- Load balancer đổ backlog vào node mới
- Client retry sau timeout trước đó (timing đồng bộ)
- Circuit breaker đóng lại → burst traffic
- **Kết quả:** Node mới nhận burst 10-100× và crash trước khi xử lý request đầu tiên

**Tại sao khó ngăn chặn:**

| Giải pháp ngây thơ | Tại sao thất bại |
|-------------------|------------------|
| "Chỉ cần thêm node" | Node mới gặp cùng thundering herd → crash loop |
| "Scale nhanh hơn" | Autoscaler đã ở tốc độ tối đa; vấn đề là burst arrival |
| "Tăng resource mỗi node" | Không giúp nếu event loop bão hòa |

**Các biện pháp đúng (Industry Best Practices):**

1. **Exponential Backoff với Jitter** *(AWS Well-Architected Framework)*
   ```
   retry_delay = min(max_delay, base_delay * 2^attempt) + random(0, jitter)
   ```
   - **Không có jitter:** Tất cả client retry cùng lúc (1s, 2s, 4s...)
   - **Có jitter:** Retry trải đều ngẫu nhiên → không có spike đồng bộ

2. **Circuit Breaker** *(Pattern của Martin Fowler)*
   - Mở circuit khi failure rate vượt ngưỡng
   - Half-open sau cooldown → test với request giới hạn
   - **Ngăn:** Retry liên tục tới service đang fail

3. **Load Shedding**
   - Drop request ưu tiên thấp khi quá tải
   - Trả `503` ngay thay vì queue → client back off

4. **Single-Layer Retry**
   - Chỉ retry ở edge (API gateway)
   - **Tránh:** Khuếch đại K^N trong call chain sâu

**Kết quả:** Nếu không có các pattern này, 4-5 phút downtime hoàn toàn trong khi hệ thống dao động giữa crash và recovery. User rời khỏi platform trước khi ổn định.

## Tác động nghiêm trọng

### Khả năng mở rộng bị gắn kết
- Không thể scale service độc lập
- Thêm nhiều node `TripService` chỉ làm crash `DriverService` nhanh hơn
- Một service chậm làm nghẽn toàn bộ chuỗi

### Chuỗi độ trễ (Latency Chaining)
- Tổng latency = tổng latency của tất cả service + network hop
- Độ chậm downstream tác động trực tiếp đến trải nghiệm user
- Không có buffering hoặc xử lý bất đồng bộ

### Sự cố lan truyền (Cascading Failure)
- Độ chậm tạm thời downstream → cạn kiệt tài nguyên upstream → crash
- Sự cố lan truyền lên qua tất cả service phụ thuộc
- Sự cố toàn hệ thống từ một service suy giảm

### Không có Backpressure tự động
- Node.js tiếp tục chấp nhận request vượt dung lượng an toàn
- Tính responsive của event loop che giấu triệu chứng quá tải
- Sự cố chỉ hiện ra khi giới hạn cấp thấp bị đạt
- Lúc đó, phục hồi yêu cầu restart toàn bộ (mất tất cả trạng thái tích lũy)

## Hướng giải pháp

Triển khai cơ chế kiểm soát luồng tường minh:

### Backpressure thực sự (Signaling chủ động)
- **Bounded Concurrency:** Giới hạn request downstream in-flight (`p-limit`, per-route limit)
- **Load Shedding:** Từ chối request khi quá tải (`503 Service Unavailable`, `429 Too Many Requests`)
  - *Đặc biệt cho Node.js:* [`@fastify/under-pressure`](https://github.com/fastify/under-pressure) theo dõi event loop delay và heap usage, trả về 503 khi quá tải
- **Circuit Breaker:** Ngừng gọi downstream service đang fail *(pattern phổ biến bởi Michael Nygard trong "Release It!")*
- **Timeout:** Fail nhanh thay vì tích lũy vô thời hạn

### Buffering/Decoupling (Bị động, không phải Backpressure thực sự)
- **Message Queue:** Tách rời service với consumption bất đồng bộ kiểu pull. *Lưu ý: Queue cung cấp **buffering và temporal decoupling**, không phải backpressure signaling. Producer không được bảo chậm lại—queue hấp thụ burst. Consumer kiểm soát tốc độ riêng bằng cách pull message.* *(Kleppmann, "DDIA"; Enterprise Integration Patterns)*

> **Phân biệt quan trọng:** Backpressure = producer được **bảo** chậm lại. Buffering = producer tiếp tục gửi, message được **lưu trữ** cho đến khi consumed. Cả hai đều là chiến lược hợp lệ; chúng giải quyết vấn đề khác nhau.

Khi đạt dung lượng, producer phải bị làm chậm (rate-limit) hoặc từ chối, cho phép consumer xử lý ở tốc độ được kiểm soát và ngăn sự cố lan truyền.

> **Tham khảo:** Xem [bottleneck-references.md](./bottleneck-references.md) để biết nguồn authoritative.