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

- **0:00** → Traffic spikes 10x (instant)
- **0:01** → Existing nodes unresponsive
  - Healthchecks fail (event loop delay, request queue saturation, memory pressure)
  - OOM crash (thousands of pending requests exceed container memory limit)
  - Docker marks "unhealthy" and restarts (worsens problem: cold startup, no cache, initialization overhead)
  - Nginx times out (502 Error) and marks server "down"
- **0:03** → Autoscaler finally triggers (reactive, waits for CPU threshold + ~2 min boot time)
- **0:05** → New nodes boot but face **"Thundering Herd"**
  - Queued/retried requests from multiple layers cause **retry amplification** (illustrative: 3 layers × 3 retries = 27× load multiplier)
  - Synchronized retry storm when healthcheck passes *(mitigated by exponential backoff with jitter—see AWS Architecture Best Practices)*
  - New nodes receive 10-100× burst load and crash immediately

**Result:** 4-5 minutes of downtime; users abandon platform before system stabilizes.

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
- **Backpressure:** Tín hiệu kháng cự từ hệ thống downstream không thể xử lý công việc nhanh bằng tốc độ upstream tạo ra
- **Backpressure Mechanisms:** Các cơ chế kiểm soát tường minh (hàng đợi, giới hạn tốc độ, circuit breaker, giới hạn đồng thời) để phát hiện và phản ứng với backpressure
- **Vấn đề của Node.js:** Khác với mô hình thread-per-request có worker pool giới hạn cung cấp backpressure *tự động* ở tầng ứng dụng, Node.js không tự động giới hạn số lượng vòng đời request đồng thời. Nếu không có cơ chế tường minh, hệ thống sẽ chấp nhận công việc cho đến khi cạn kiệt các giới hạn cấp thấp (heap memory, file descriptor, OS backlog, proxy queue).

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
Heap: [obj1] [   trống                  ]

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

- **0:00** → Traffic tăng đột biến 10x (tức thì)
- **0:01** → Các node hiện tại không phản hồi
  - Healthcheck fail (event loop delay, request queue saturation, memory pressure)
  - OOM crash (hàng nghìn pending request vượt giới hạn memory container)
  - Docker đánh dấu "unhealthy" và restart (làm tệ hơn: cold startup, không có cache, initialization overhead)
  - Nginx timeout (502 Error) và đánh dấu server "down"
- **0:03** → Autoscaler cuối cùng kích hoạt (reactive, chờ CPU threshold + ~2 phút boot)
- **0:05** → Node mới boot nhưng gặp **"Thundering Herd"**
  - Request queued/retry từ nhiều tầng (3 tầng × 3 lần retry = 27× khuếch đại)
  - Synchronized retry storm khi healthcheck pass
  - Node mới nhận 10-100× burst load và crash ngay lập tức

**Kết quả:** 4-5 phút downtime; user rời khỏi platform trước khi hệ thống ổn định.

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

Triển khai cơ chế backpressure tường minh:
- **Bounded Concurrency:** Giới hạn request downstream in-flight (`p-limit`, per-route limit)
- **Load Shedding:** Từ chối request khi quá tải (`503 Service Unavailable`, `429 Too Many Requests`)
- **Circuit Breaker:** Ngừng gọi downstream service đang fail
- **Message Queue:** Tách rời service với consumption bất đồng bộ kiểu pull
- **Timeout:** Fail nhanh thay vì tích lũy vô thời hạn

Khi đạt dung lượng, producer phải bị làm chậm (rate-limit) hoặc từ chối, cho phép consumer xử lý ở tốc độ được kiểm soát và ngăn sự cố lan truyền.