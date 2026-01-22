# 1. Synchronous HTTP Chaining (Coupled Scalability)

## Anti-Pattern

The system uses a **Synchronous Push Model** for inter-service communication. `TripService` pushes requests to `DriverService` via HTTP and waits for response.

> **Example:** User requests trip → `TripService` calls `POST /match` on `DriverService` → If driver matching takes 5 seconds → `TripService` (and User) waits 5 seconds.

## Critical Definitions

> ⚠️ **Read these first** — understanding these terms is essential before proceeding.

| Term | Definition | Source |
|------|------------|--------|
| **Backpressure** | An *active* flow control mechanism where a downstream system *signals* to an upstream system that it cannot process work at the current rate, causing the producer to slow down or stop. | [Reactive Manifesto](https://www.reactivemanifesto.org/glossary#Back-Pressure) |
| **Buffering** | A *passive* mechanism where messages are temporarily stored until the consumer is ready. Buffers absorb bursts but do **not** signal producers to slow down. If producers outpace consumers indefinitely, buffers overflow. | Kleppmann, *DDIA* |
| **Backpressure Mechanisms** | Explicit controls (rate limiting, circuit breakers, bounded concurrency, rejection) that detect overload and **actively respond**—either by signaling producers or rejecting work. | Nygard, *Release It!* (2018) |
| **The Node.js Problem** | Unlike thread-per-request models with limited worker pools providing *automatic* backpressure, Node.js does not bound concurrent request lifecycles. The system accepts work until lower-level limits (heap, FDs, OS backlog) are exhausted. | Matteo Collina (Node.js TSC) |

> **Key Distinction:** Backpressure = producer is **told** to slow down. Buffering = producer keeps sending, messages are **stored** until consumed.

<details>
<summary><strong>📖 Deep Dive: Understanding "Signal" in Backpressure</strong></summary>

> **Common Question:** "If rate limiting returns `503 Service Unavailable`, users don't understand this and keep sending requests. How is this a 'signal'?"

Backpressure signals exist on a **spectrum from passive to active enforcement**:

| Signal Type | How It Works | Producer Response | Enforcement |
|------------|--------------|-------------------|-------------|
| **Passive (HTTP Status)** | Return `503`/`429` error code | Client *should* back off but can ignore | ❌ Not enforced; badly designed clients cause retry storms |
| **Bounded Concurrency** | Limit in-flight requests (e.g., 100 max) | New requests wait/queue until slot frees | ✅ Enforced; 101st request physically cannot proceed |
| **Circuit Breaker** | Detect failure rate → open circuit | Fail-fast without calling downstream | ✅ Enforced; downstream protected from additional load |
| **TCP Flow Control** | Receiver sends window size = 0 | Sender **must stop** sending (OS-level) | ✅✅ Kernel-enforced; no application choice |
| **Queue Rejection** | Bounded queue full → reject enqueue | Producer gets immediate error | ✅ Enforced; producer must handle rejection |

**Key Insight:** The "signal" means **the producer is given immediate feedback** about overload:

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

</details>

## Core Problem

When `TripService` calls `DriverService` synchronously, it becomes **"Held Hostage"**—unable to finish the user's request until receiving a response. This creates **temporal coupling**: the lifetime of the upstream request is directly coupled to the downstream response time.

## Why Node.js Makes This Worse

> **Source:** This section draws from Matteo Collina's research on Node.js performance, presented at USENIX SREcon.

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

Each waiting request retains resources that cannot be freed until completion:

| Resource | What It Is | Limit | Failure Mode |
|----------|-----------|-------|--------------|
| **Socket (FD)** | OS-level network endpoint | 1024–65535 per process¹ | `EMFILE: too many open files` |
| **Heap Memory** | Request context, closures, promise chains | 512MB–4GB | `JavaScript heap out of memory` |
| **Connection Pool Slot** | Reusable HTTP connection | See table below² | Queue grows → timeout/OOM |

> ¹ **Process** = one running `node app.js` instance. Each container/replica is a separate process with its own FD limit.  
> ² See "Connection Pools" deep dive for this project's actual configuration.

```
DriverService slow (5s) → Sockets held → Heap grows → Pool exhausted
                                ↓
         ┌──────────────────────┴──────────────────────┐
         ▼                      ▼                      ▼
   💥 EMFILE              💥 OOM Crash           💥 Pool Timeout
   (FD limit)          (heap exhausted)         (queue overflow)
```

<details>
<summary><strong>📖 Deep Dive: Resource Details</strong></summary>

**Socket (File Descriptor):**

A socket is an OS-level endpoint for network communication. Each HTTP connection to DriverService creates a socket, identified by a file descriptor (FD) number.

```
TripService ──── Socket (FD #42) ────► DriverService
                     ↑
                     └── Stays OPEN while waiting for response
                         OS limit: typically 1024-65535 FDs per process
```

*Scenario:* If DriverService takes 5s and 1000 requests arrive, you have 1000 open sockets. Hit the limit → `EMFILE: too many open files` → new requests fail immediately.

⚠️ **FD exhaustion = immediate failure (no queue).** When the OS limit is hit, `socket()` syscall fails instantly with `EMFILE`. The kernel does not queue socket creation requests—it's a hard limit.

---

**Heap Memory per Request:**

| Component | What It Contains | Size |
|-----------|------------------|------|
| Request object | Headers, body, cookies, socket reference | Varies by payload |
| Response builder | Partial response data | Varies |
| Promise chain | Each `.then()` creates objects | ~100-200 bytes each |
| Closures | Captured variables from scope | ~112 bytes + captured data |
| HTTP client buffers | Socket read/write buffers | Library-dependent |

> **Note:** Exact sizes vary by V8 version, payload size, and application code. The key insight is that **each pending request holds memory that cannot be freed until completion**.

*Scenario:* `2000 req/sec × 5 sec = 10,000 pending` → Memory accumulates faster than GC reclaims → OOM.

The trap: Event loop stays responsive, so Node.js keeps accepting requests, silently accumulating memory until crash.

---

**Connection Pools (Multiple Types):**

| Pool Type | This Project | Behavior When Exhausted |
|-----------|--------------|-------------------------|
| **HTTP Client** (axios → DriverService) | ❌ No limit (`maxSockets: Infinity`) | Opens sockets immediately → FD/OOM first |
| **Database** (Prisma → Postgres) | ✅ `connection_limit=50` | Queues, then timeout after 60s |
| **Nginx Upstream** (keepalive) | ✅ `keepalive 32-128` | Opens new conn or queues |

```
┌─── HTTP Client Pool (UNBOUNDED - current project) ───┐
│  No limit → Opens socket for EVERY request           │
│  Request #1000: Opens socket #1000 immediately       │
│  ⚠️ Hits FD limit or OOM before "pool exhaustion"    │
└──────────────────────────────────────────────────────┘

┌─── DB Pool (BOUNDED - connection_limit=50) ──────────┐
│  Slot 1-50: [BUSY - waiting for query]               │
├──────────────────────────────────────────────────────┤
│  Request #51+: ⏳ Queued until pool_timeout (60s)    │
└──────────────────────────────────────────────────────┘
```

⚠️ **Bounded pools queue; unbounded pools don't.** The HTTP client in this project has no limit—it opens sockets immediately until FD/OOM. DB pool (50) and Nginx (32-128) ARE bounded and will queue.

</details>

### 2. Multi-Layer Saturation

Exhaustion occurs across multiple layers simultaneously:

| Layer | Limit | Failure Mode |
|-------|-------|--------------|
| **Application** (HTTP Client Pool) | Unlimited default (this project) | Opens sockets until FD/OOM |
| **Application** (DB Pool) | 50 connections | Queue grows, then timeout |
| **Proxy** (Nginx/ALB) | 128–1024 queue | `502 Bad Gateway` |
| **OS** (File Descriptors) | 1024 default | `EMFILE` error |

**Which fails first?** Depends on config. With unbounded HTTP pool (this project): FDs or Memory first. With bounded pool: Pool exhausts first.

<details>
<summary><strong>📖 Deep Dive: Layer Details</strong></summary>

#### Application Layer

**Connection Pool Starvation (if bounded):**
```
┌─────────────────────────────────────────┐
│  Pool to DriverService (size: 10)       │
│  ┌─────┐ ┌─────┐ ┌─────┐ ... ┌─────┐    │
│  │BUSY │ │BUSY │ │BUSY │     │BUSY │    │  ← All slots occupied
│  └─────┘ └─────┘ └─────┘     └─────┘    │
│  Waiting Queue: [req11, req12, ...]     │  ← Requests pile up
└─────────────────────────────────────────┘
```
All connections waiting for slow DriverService. New requests queue before even starting HTTP call.

**Event Loop Delay:**
```
Normal:    Tick 1 (1ms) → Tick 2 (1ms) → Tick 3 (1ms)
Saturated: Tick 1 (50ms) → Tick 2 (200ms GC) → Tick 3 (100ms)
                  ↑              ↑
           Many callbacks    GC pressure
```
Time between event loop ticks increases. All requests slow down, timeouts increase.

#### Proxy Layer
```
Nginx/HAProxy/ALB
┌─────────────────────────────────────────────────────┐
│  Request Queue (limited: 128-1024)    [FULL!]       │
│  New request arrives → 502 Bad Gateway              │
└─────────────────────────────────────────────────────┘
```
Backend (Node.js) too slow to accept connections. Users see `502 Bad Gateway`.

#### OS Layer
```bash
$ ulimit -n
1024    # Default soft limit

# When limit reached:
Error: EMFILE: too many open files
```
OS limits how many files/sockets a process can open. Fix: `ulimit -n 65535`.

</details>

### 3. Memory Exhaustion (OOM)

Under sustained load:
1. Thousands of requests wait simultaneously
2. Retained state grows faster than GC can reclaim
3. GC cycles become more frequent (CPU spent on GC, not your code)
4. When heap exceeds limit → `JavaScript heap out of memory`
5. Process crashes → entire server dies

<details>
<summary><strong>📖 Deep Dive: Garbage Collection Under Pressure</strong></summary>

**Why GC Can't Save You:**
```
Normal Operation:
Heap: [obj1] [obj2] [obj3] [   free   ]
GC runs → reclaims unreachable objects

Under Load (Pending Requests):
Heap: [req1] [req2] [req3] ... [req10000]
             ↑       ↑           ↑
        All REACHABLE (awaiting response)

GC runs → NOTHING to reclaim!
```

**Key insight:** GC only reclaims **unreachable** objects. Pending requests are **reachable** (held by event loop, promise chains). GC is powerless.

**V8 Orinoco (Modern GC):**

V8's garbage collector is sophisticated (concurrent marking, parallel scavenging, incremental marking). But under extreme pressure:
1. Too many live objects → marking takes longer
2. GC runs more frequently → CPU overhead
3. Eventually: "stop-the-world" major GC pauses (100ms+)
4. If allocation rate > reclamation rate → OOM inevitable

**Promise Microtask Queue:**
```
V8 Event Loop Priority:
1. Microtasks (promise .then/.catch/.finally) ← FIRST
2. Timers (setTimeout, setInterval)
3. I/O callbacks (fs, net)
4. Check (setImmediate)
```
If 10,000 promises resolve simultaneously → massive event loop delay spike.

</details>

### 4. The Autoscaling Death Spiral

> **References:** [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/), [AWS Auto Scaling](https://docs.aws.amazon.com/autoscaling/), [AWS Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

| Time | Event |
|------|-------|
| **T+0s** | Traffic spikes 10× (instant) |
| **T+15-60s** | Existing nodes degrade (event loop delay → healthchecks fail → OOM crash) |
| **T+1-2min** | Autoscaler detects overload (K8s HPA: 15s sync + 60s metrics + evaluation) |
| **T+3-5min** | New nodes boot → **Thundering Herd** → crash before handling first request |

**Result:** 4–5 minutes of downtime; users abandon platform before system stabilizes.

<details>
<summary><strong>📖 Deep Dive: Retry Amplification & Thundering Herd</strong></summary>

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

**Sources:** [Uber Engineering](https://eng.uber.com/), [AWS Architecture Blog](https://aws.amazon.com/architecture/well-architected/)

---

**The Thundering Herd Problem:**

When new nodes pass healthcheck, **all queued requests hit simultaneously**:
- Load balancer floods new node with backlog
- Clients retry after previous timeouts (synchronized timing)
- Circuit breakers re-close → burst of traffic
- **Result:** New nodes receive 10-100× burst and crash before handling first request

---

**Why Naive Solutions Fail:**

| Naive Solution | Why It Fails |
|----------------|--------------|
| "Just add more nodes" | New nodes face same thundering herd → crash loop |
| "Scale faster" | Autoscaler already at max speed; problem is burst arrival |
| "Increase resources per node" | Doesn't help if event loop is saturated |

---

**Proper Mitigations (Industry Best Practices):**

1. **Exponential Backoff with Jitter** *(AWS Well-Architected Framework)*
   ```
   retry_delay = min(max_delay, base_delay * 2^attempt) + random(0, jitter)
   ```
   - Without jitter: All clients retry at same time → synchronized spike
   - With jitter: Retries spread out randomly → no synchronized spike

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

</details>

## Critical Impacts

| Impact | Description |
|--------|-------------|
| **Coupled Scalability** | Cannot scale services independently. Adding `TripService` nodes just crashes `DriverService` faster. |
| **Latency Chaining** | Total latency = sum of all service latencies + network hops. Downstream slowness directly impacts UX. |
| **Cascading Failures** | Temporary downstream slowness → upstream resource exhaustion → system-wide outage. |
| **No Automatic Backpressure** | Node.js accepts requests beyond safe capacity. Failure only visible when low-level limits hit. |

## Solution Direction

Implement explicit flow control mechanisms:

### True Backpressure (Active Signaling)
- **Bounded Concurrency:** Limit in-flight downstream requests (`p-limit`, per-route limits)
- **Load Shedding:** Reject requests when over capacity (`503`, `429`)
  - *Node.js specific:* [`@fastify/under-pressure`](https://github.com/fastify/under-pressure) monitors event loop delay and heap usage
- **Circuit Breakers:** Stop calling failing downstream services *(pattern by Michael Nygard, "Release It!")*
- **Timeouts:** Fail fast instead of accumulating indefinitely

### Buffering/Decoupling (Passive)
- **Message Queues:** Decouple services with asynchronous pull-based consumption
  - *Note:* Queues provide **buffering and temporal decoupling**, not backpressure signaling. The producer is not told to slow down—the queue absorbs bursts. The consumer controls its rate.

> **Key Distinction:** Backpressure = producer is **told** to slow down. Buffering = producer keeps sending, messages are **stored** until consumed. Both are valid strategies; they solve different problems.

> **References:** See [bottleneck-references.md](./bottleneck-references.md) for authoritative sources.  
> **Implementation:** See [Solution 1: Async Decoupling](./solutions/solution-01-async-decoupling.md)

---

---

# 1. Synchronous HTTP Chaining (Coupled Scalability) - TIẾNG VIỆT

## Anti-Pattern (Mô hình sai lầm)

Hệ thống sử dụng **Mô hình Đồng bộ Kiểu Push** cho giao tiếp giữa các service. `TripService` đẩy request tới `DriverService` qua HTTP và chờ phản hồi.

> **Ví dụ:** User yêu cầu chuyến đi → `TripService` gọi `POST /match` tới `DriverService` → Nếu ghép tài xế mất 5 giây → `TripService` (và User) phải chờ 5 giây.

## Định nghĩa quan trọng

> ⚠️ **Đọc trước** — hiểu các thuật ngữ này là cần thiết trước khi tiếp tục.

| Thuật ngữ | Định nghĩa | Nguồn |
|-----------|------------|-------|
| **Backpressure** | Cơ chế kiểm soát luồng *chủ động* khi downstream *báo hiệu* cho upstream rằng không thể xử lý công việc ở tốc độ hiện tại, buộc producer phải chậm lại hoặc dừng. | [Reactive Manifesto](https://www.reactivemanifesto.org/glossary#Back-Pressure) |
| **Buffering** | Cơ chế *thụ động* lưu trữ message tạm thời đến khi consumer sẵn sàng. Buffer hấp thụ đột biến nhưng **không** báo hiệu producer chậm lại. | Kleppmann, *DDIA* |
| **Backpressure Mechanisms** | Các điều khiển tường minh (rate limiting, circuit breaker, bounded concurrency, rejection) phát hiện quá tải và **phản ứng chủ động**. | Nygard, *Release It!* (2018) |
| **Vấn đề Node.js** | Khác với thread-per-request có worker pool giới hạn, Node.js không giới hạn vòng đời request đồng thời. Hệ thống chấp nhận công việc đến khi cạn kiệt giới hạn cấp thấp. | Matteo Collina (Node.js TSC) |

> **Phân biệt:** Backpressure = producer được **báo** chậm lại. Buffering = producer tiếp tục gửi, message được **lưu trữ** đến khi consume.

<details>
<summary><strong>📖 Chi tiết: Hiểu "Tín hiệu" trong Backpressure</strong></summary>

> **Câu hỏi thường gặp:** "Nếu rate limiting trả về `503 Service Unavailable`, user không hiểu điều này và tiếp tục gửi request. Làm sao đây là 'tín hiệu'?"

Tín hiệu backpressure tồn tại trên **phổ từ bị động đến chủ động**:

| Loại tín hiệu | Cách hoạt động | Phản ứng của Producer | Enforcement |
|--------------|----------------|----------------------|-------------|
| **Bị động (HTTP Status)** | Trả về mã lỗi `503`/`429` | Client *nên* back off nhưng có thể bỏ qua | ❌ Không enforce |
| **Bounded Concurrency** | Giới hạn request in-flight | Request mới chờ/queue đến khi có slot | ✅ Enforce |
| **Circuit Breaker** | Phát hiện tỷ lệ lỗi → mở circuit | Fail-fast mà không gọi downstream | ✅ Enforce |
| **TCP Flow Control** | Receiver gửi window size = 0 | Sender **phải dừng** gửi (cấp OS) | ✅ Kernel-enforced |
| **Queue Rejection** | Bounded queue đầy → từ chối | Producer nhận lỗi ngay lập tức | ✅ Enforce |

**Insight quan trọng:** "Tín hiệu" có nghĩa **producer nhận phản hồi ngay lập tức** về quá tải:

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

</details>

## Vấn đề cốt lõi

Khi `TripService` gọi `DriverService` đồng bộ, nó trở thành **"Con tin"**—không thể hoàn thành request của user cho đến khi nhận response. Điều này tạo **temporal coupling**: vòng đời request upstream gắn trực tiếp với thời gian phản hồi downstream.

## Tại sao Node.js làm vấn đề tệ hơn

> **Nguồn:** Phần này dựa trên nghiên cứu của Matteo Collina về hiệu năng Node.js, trình bày tại USENIX SREcon.

### Hiệu suất Event Loop như một cái bẫy

Event loop đơn luồng của Node.js được tối ưu cho I/O-bound (network, database, file). Network I/O là bất đồng bộ—await HTTP response downstream **không** block event loop.

**Đặc điểm chính:**
- Event loop đơn xử lý nhiều request đồng thời hiệu quả
- Await I/O trả quyền kiểm soát về event loop (vẫn responsive)
- `async/await` không block event loop cho I/O
- `async/await` **không** áp đặt giới hạn concurrency
- Chỉ CPU-bound work đồng bộ hoặc sync API (`fs.readFileSync`) mới block event loop

**Sự đánh đổi:**

Trong khi event loop vẫn responsive, **vòng đời request vẫn mở**, âm thầm tích lũy trạng thái (memory, socket, request context) qua hàng nghìn request in-flight. Tính responsive này che giấu quá tải cho đến khi tài nguyên cạn kiệt.

## Chuỗi sự cố (Failure Cascade)

### 1. Tích lũy tài nguyên

Mỗi request đang chờ giữ tài nguyên không thể giải phóng cho đến khi hoàn thành:

| Tài nguyên | Là gì | Giới hạn | Lỗi |
|------------|-------|----------|-----|
| **Socket (FD)** | Endpoint mạng cấp OS | 1024–65535/process¹ | `EMFILE: too many open files` |
| **Heap Memory** | Request context, closure, promise chain | 512MB–4GB | `JavaScript heap out of memory` |
| **Connection Pool Slot** | HTTP connection tái sử dụng | Xem bảng bên dưới² | Queue tăng → timeout/OOM |

> ¹ **Process** = một instance `node app.js` đang chạy. Mỗi container/replica là process riêng với giới hạn FD riêng.  
> ² Xem phần "Connection Pool" chi tiết cho cấu hình thực tế của project.

```
DriverService chậm (5s) → Socket giữ → Heap tăng → Pool cạn kiệt
                                ↓
         ┌──────────────────────┴──────────────────────┐
         ▼                      ▼                      ▼
   💥 EMFILE              💥 OOM Crash           💥 Pool Timeout
   (giới hạn FD)        (heap cạn kiệt)        (hàng đợi tràn)
```

<details>
<summary><strong>📖 Chi tiết: Ý nghĩa từng tài nguyên</strong></summary>

**Socket (File Descriptor):**

Socket là endpoint cấp OS cho giao tiếp mạng. Mỗi kết nối HTTP tới DriverService tạo một socket, được định danh bằng file descriptor (FD).

```
TripService ──── Socket (FD #42) ────► DriverService
                     ↑
                     └── Giữ MỞ trong khi chờ response
                         Giới hạn OS: thường 1024-65535 FD mỗi process
```

*Kịch bản:* Nếu DriverService mất 5s và 1000 request đến, bạn có 1000 socket mở. Đạt giới hạn → `EMFILE` → request mới fail ngay.

⚠️ **FD cạn kiệt = fail ngay lập tức (không queue).** Khi đạt giới hạn OS, syscall `socket()` fail ngay với `EMFILE`. Kernel không queue các yêu cầu tạo socket—đây là giới hạn cứng.

---

**Heap Memory mỗi Request:**

| Thành phần | Chứa gì | Kích thước |
|------------|---------|------------|
| Request object | Header, body, cookie, socket ref | Thay đổi theo payload |
| Response builder | Dữ liệu response tạm | Thay đổi |
| Promise chain | Mỗi `.then()` tạo object | ~100-200 bytes mỗi cái |
| Closure | Biến captured từ scope | ~112 bytes + data |
| HTTP client buffer | Buffer đọc/ghi socket | Tùy thư viện |

> **Lưu ý:** Kích thước chính xác thay đổi theo V8, payload, và code. Điểm quan trọng là **mỗi request đang chờ giữ memory không thể giải phóng cho đến khi hoàn thành**.

*Kịch bản:* `2000 req/giây × 5 giây = 10,000 pending` → Memory tích lũy nhanh hơn GC → OOM.

Cái bẫy: Event loop vẫn responsive, nên Node.js tiếp tục chấp nhận request, âm thầm tích lũy memory cho đến crash.

---

**Connection Pool (Nhiều loại):**

| Loại Pool | Project này | Hành vi khi cạn kiệt |
|-----------|-------------|----------------------|
| **HTTP Client** (axios → DriverService) | ❌ Không giới hạn (`maxSockets: Infinity`) | Mở socket ngay → FD/OOM trước |
| **Database** (Prisma → Postgres) | ✅ `connection_limit=50` | Queue, rồi timeout sau 60s |
| **Nginx Upstream** (keepalive) | ✅ `keepalive 32-128` | Mở conn mới hoặc queue |

```
┌─── HTTP Client Pool (KHÔNG GIỚI HẠN - project hiện tại) ─┐
│  Không limit → Mở socket cho MỌI request                 │
│  Request #1000: Mở socket #1000 ngay lập tức             │
│  ⚠️ Đạt giới hạn FD hoặc OOM trước khi "pool cạn kiệt"   │
└──────────────────────────────────────────────────────────┘

┌─── DB Pool (CÓ GIỚI HẠN - connection_limit=50) ──────────┐
│  Slot 1-50: [BẬN - chờ query]                            │
├──────────────────────────────────────────────────────────┤
│  Request #51+: ⏳ Queue đến pool_timeout (60s)           │
└──────────────────────────────────────────────────────────┘
```

⚠️ **Pool có giới hạn thì queue; không giới hạn thì không.** HTTP client trong project này không có limit—mở socket ngay đến khi FD/OOM. DB pool (50) và Nginx (32-128) CÓ giới hạn và sẽ queue.

</details>

### 2. Bão hòa đa tầng

Cạn kiệt xảy ra qua nhiều tầng đồng thời:

| Tầng | Giới hạn | Lỗi |
|------|----------|-----|
| **Application** (HTTP Client Pool) | Không giới hạn (project này) | Mở socket đến FD/OOM |
| **Application** (DB Pool) | 50 connection | Queue tăng, rồi timeout |
| **Proxy** (Nginx/ALB) | 128–1024 queue | `502 Bad Gateway` |
| **OS** (File Descriptor) | 1024 mặc định | `EMFILE` |

**Cái nào fail trước?** Tùy config. Với HTTP pool không giới hạn (project này): FD hoặc Memory trước. Với pool giới hạn: Pool cạn kiệt trước.

<details>
<summary><strong>📖 Chi tiết: Từng tầng</strong></summary>

#### Application Layer

**Connection Pool Starvation (nếu có giới hạn):**
```
┌─────────────────────────────────────────┐
│  Pool tới DriverService (size: 10)      │
│  ┌─────┐ ┌─────┐ ┌─────┐ ... ┌─────┐    │
│  │BẬN  │ │BẬN  │ │BẬN  │     │BẬN  │    │  ← Tất cả slot bận
│  └─────┘ └─────┘ └─────┘     └─────┘    │
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

#### Proxy Layer
```
Nginx/HAProxy/ALB
┌─────────────────────────────────────────────────────┐
│  Request Queue (giới hạn: 128-1024)   [ĐẦY!]       │
│  Request mới đến → 502 Bad Gateway                 │
└─────────────────────────────────────────────────────┘
```
Backend (Node.js) quá chậm để accept connection. User thấy `502 Bad Gateway`.

#### OS Layer
```bash
$ ulimit -n
1024    # Giới hạn mặc định

# Khi đạt giới hạn:
Error: EMFILE: too many open files
```
OS giới hạn số file/socket một process có thể mở. Sửa: `ulimit -n 65535`.

</details>

### 3. Cạn kiệt bộ nhớ (OOM)

Dưới tải sustained:
1. Hàng nghìn request chờ đồng thời
2. Trạng thái giữ lại tăng nhanh hơn GC thu hồi
3. Chu kỳ GC thường xuyên hơn (CPU dùng cho GC, không phải code)
4. Khi heap vượt giới hạn → `JavaScript heap out of memory`
5. Process crash → server chết

<details>
<summary><strong>📖 Chi tiết: Garbage Collection dưới áp lực</strong></summary>

**Tại sao GC không cứu được:**
```
Hoạt động bình thường:
Heap: [obj1] [obj2] [obj3] [   trống   ]
GC chạy → thu hồi object không còn tham chiếu

Dưới tải (Request đang chờ):
Heap: [req1] [req2] [req3] ... [req10000]
             ↑       ↑           ↑
        Tất cả CÒN THAM CHIẾU (đang chờ response)

GC chạy → KHÔNG có gì để thu hồi!
```

**Điểm mấu chốt:** GC chỉ thu hồi object **không còn tham chiếu**. Request đang chờ **còn tham chiếu** (giữ bởi event loop, promise chain). GC bất lực.

**V8 Orinoco (GC hiện đại):**

GC của V8 rất tinh vi (concurrent marking, parallel scavenging, incremental marking). Nhưng dưới áp lực cực đoan:
1. Quá nhiều live object → marking mất nhiều thời gian
2. GC chạy thường xuyên → CPU overhead
3. Cuối cùng: "stop-the-world" major GC pause (100ms+)
4. Nếu tốc độ cấp phát > tốc độ thu hồi → OOM không tránh khỏi

**Promise Microtask Queue:**
```
V8 Event Loop Priority:
1. Microtask (promise .then/.catch/.finally) ← ĐẦU TIÊN
2. Timer (setTimeout, setInterval)
3. I/O callback (fs, net)
4. Check (setImmediate)
```
Nếu 10,000 promise resolve cùng lúc → spike event loop delay khổng lồ.

</details>

### 4. Vòng xoáy chết của Autoscaling

> **Tham khảo:** [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/), [AWS Auto Scaling](https://docs.aws.amazon.com/autoscaling/), [AWS Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

| Thời gian | Sự kiện |
|-----------|---------|
| **T+0s** | Traffic tăng đột biến 10× (tức thì) |
| **T+15-60s** | Các node hiện tại suy giảm (event loop delay → healthcheck fail → OOM crash) |
| **T+1-2min** | Autoscaler phát hiện quá tải (K8s HPA: 15s sync + 60s metrics + evaluation) |
| **T+3-5min** | Node mới boot → **Thundering Herd** → crash trước khi xử lý request đầu tiên |

**Kết quả:** 4–5 phút downtime; user rời khỏi platform trước khi hệ thống ổn định.

<details>
<summary><strong>📖 Chi tiết: Retry Amplification & Thundering Herd</strong></summary>

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

**Nguồn:** [Uber Engineering](https://eng.uber.com/), [AWS Architecture Blog](https://aws.amazon.com/architecture/well-architected/)

---

**Vấn đề Thundering Herd:**

Khi node mới pass healthcheck, **tất cả request queued đổ xô vào cùng lúc**:
- Load balancer đổ backlog vào node mới
- Client retry sau timeout trước đó (timing đồng bộ)
- Circuit breaker đóng lại → burst traffic
- **Kết quả:** Node mới nhận burst 10-100× và crash trước khi xử lý request đầu tiên

---

**Tại sao giải pháp ngây thơ thất bại:**

| Giải pháp ngây thơ | Tại sao thất bại |
|-------------------|------------------|
| "Chỉ cần thêm node" | Node mới gặp cùng thundering herd → crash loop |
| "Scale nhanh hơn" | Autoscaler đã ở tốc độ tối đa; vấn đề là burst arrival |
| "Tăng resource mỗi node" | Không giúp nếu event loop bão hòa |

---

**Các biện pháp đúng (Industry Best Practices):**

1. **Exponential Backoff với Jitter** *(AWS Well-Architected Framework)*
   ```
   retry_delay = min(max_delay, base_delay * 2^attempt) + random(0, jitter)
   ```
   - Không có jitter: Tất cả client retry cùng lúc → spike đồng bộ
   - Có jitter: Retry trải đều ngẫu nhiên → không có spike đồng bộ

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

</details>

## Tác động nghiêm trọng

| Tác động | Mô tả |
|----------|-------|
| **Khả năng mở rộng bị gắn kết** | Không thể scale service độc lập. Thêm node `TripService` chỉ làm crash `DriverService` nhanh hơn. |
| **Chuỗi độ trễ** | Tổng latency = tổng latency tất cả service + network hop. Độ chậm downstream tác động trực tiếp UX. |
| **Sự cố lan truyền** | Độ chậm tạm thời downstream → cạn kiệt tài nguyên upstream → sự cố toàn hệ thống. |
| **Không có Backpressure tự động** | Node.js chấp nhận request vượt dung lượng an toàn. Sự cố chỉ hiện khi giới hạn cấp thấp bị đạt. |

## Hướng giải pháp

Triển khai cơ chế kiểm soát luồng tường minh:

### True Backpressure (Báo hiệu chủ động)
- **Bounded Concurrency:** Giới hạn request downstream in-flight (`p-limit`, per-route limit)
- **Load Shedding:** Từ chối request khi quá tải (`503`, `429`)
  - *Node.js:* [`@fastify/under-pressure`](https://github.com/fastify/under-pressure) theo dõi event loop delay và heap usage
- **Circuit Breaker:** Ngừng gọi downstream service đang fail *(pattern bởi Michael Nygard, "Release It!")*
- **Timeout:** Fail nhanh thay vì tích lũy vô thời hạn

### Buffering/Decoupling (Thụ động)
- **Message Queue:** Tách rời service với consumption bất đồng bộ kiểu pull
  - *Lưu ý:* Queue cung cấp **buffering và temporal decoupling**, không phải backpressure signaling. Producer không được bảo chậm lại—queue hấp thụ burst. Consumer kiểm soát tốc độ.

> **Phân biệt quan trọng:** Backpressure = producer được **bảo** chậm lại. Buffering = producer tiếp tục gửi, message được **lưu trữ** đến khi consumed. Cả hai đều là chiến lược hợp lệ; chúng giải quyết vấn đề khác nhau.

> **Tham khảo:** Xem [bottleneck-references.md](./bottleneck-references.md) cho nguồn authoritative.  
> **Triển khai:** Xem [Solution 1: Async Decoupling](./solutions/solution-01-async-decoupling.md)
