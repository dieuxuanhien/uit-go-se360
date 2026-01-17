# Critical Architecture Bottlenecks

This document identifies the critical bottlenecks in the legacy architecture, prioritized by impact on system stability and scalability.

## 0. Core Concepts & Terminology

Before analyzing the bottlenecks, understand the technical mechanics that drive them.

### Synchronous vs. Asynchronous
- **Synchronous (Blocking):** Caller sends request and **waits** for answer; connection stays open
  - *Analogy:* Phone call—must stay on line until answered
- **Asynchronous (Non-Blocking):** Caller sends message and **continues working**; answer comes later
  - *Analogy:* Email—hit send and do other things

### Push vs. Pull Model
- **Push (Coupled):** Upstream forces work onto downstream immediately
  - *Risk:* If downstream is slow, upstream gets backed up
- **Pull (Decoupled):** Downstream requests work when ready
  - *Benefit:* Natural backpressure—downstream never overwhelmed

### Vertical vs. Horizontal Scaling
- **Vertical (Scale Up):** Larger server (more CPU/RAM)
  - *Limit:* Maximum hardware available
- **Horizontal (Scale Out):** More servers (instances)
  - *Limit:* Theoretically unlimited if software supports it

### Node.js Resource Model
- **Event Loop:** Single-threaded, handles many connections without blocking CPU
- **The Trap:** While CPU stays free, waiting connections consume **RAM** (state) and **File Descriptors** (sockets)
- **Crash:** Too many open connections → RAM/socket exhaustion → process crash

---

## 1. Synchronous HTTP Chaining (Coupled Scalability)

### Anti-Pattern

The system uses a **Synchronous Push Model** for inter-service communication. `TripService` pushes requests to `DriverService` via HTTP and waits for response.

> **Example:** User requests trip → `TripService` calls `POST /match` on `DriverService` → If driver matching takes 5 seconds → `TripService` (and User) waits 5 seconds.

### Core Problem: Temporal Coupling Without Backpressure

When `TripService` calls `DriverService` synchronously, it becomes **"Held Hostage"**—unable to finish the user's request until receiving a response. This creates **temporal coupling**: the lifetime of the upstream request is directly coupled to the downstream response time.

**Critical Definitions:**
- **Backpressure:** Resistance signal from a downstream system that cannot process work as fast as upstream produces it
- **Backpressure Mechanisms:** Explicit controls (queues, rate limiting, circuit breakers, bounded concurrency) that detect and respond to backpressure
- **The Node.js Problem:** Unlike thread-per-request models with limited worker pools providing *automatic* application-level backpressure, Node.js does not automatically bound concurrent request lifecycles. Without explicit mechanisms, the system accepts work until lower-level limits (heap memory, file descriptors, OS backlog, proxy queues) are exhausted.

### Why Node.js Makes This Worse

**Event Loop Efficiency as a Trap:**

Node.js's single-threaded event loop is optimized for I/O-bound workloads (network, database, files) where waiting is delegated to the OS. Network I/O is asynchronous—awaiting a downstream HTTP response does **not** block the event loop.

**Key Characteristics:**
- Single event loop handles many concurrent requests efficiently
- Awaiting I/O yields control back to the event loop (stays responsive)
- `async/await` does not block the event loop for I/O
- `async/await` does **not** impose concurrency limits
- Only synchronous CPU-bound work or explicit sync APIs (`fs.readFileSync`) block the event loop

**The Trade-off:**

While the event loop stays responsive, the **request lifecycle remains open**, silently accumulating retained state (memory, sockets, request context) across thousands of concurrent in-flight requests. This responsiveness masks overload until resources are exhausted.

### The Failure Cascade

#### 1. Resource Accumulation

Each waiting request must retain:
- **Socket (File Descriptor):** Open network connection to downstream service
- **Heap Memory:** HTTP headers, request bodies, response builders, closures, promise chains
- **Connection Pool Slot:** Cannot be returned until response arrives

These resources cannot be freed or garbage collected while the request is active (reachable from call stack).

#### 2. Multi-Layer Saturation

Exhaustion occurs across multiple layers:
- **Application Layer:** Connection pool starvation, event loop delay
- **Proxy Layer:** Load balancer request queues full
- **OS Layer:** File descriptor limits exceeded (`EMFILE: too many open files`)

#### 3. Memory Exhaustion (OOM)

Under sustained load:
1. Thousands of requests wait simultaneously
2. Retained state grows faster than Garbage Collector can reclaim
3. GC cycles become more frequent (Modern V8 Orinoco uses concurrent marking, but still struggles under extreme pressure)
4. When heap exceeds limit → `JavaScript heap out of memory`
5. Process crashes → entire server dies

**Note:** Unresolved promises retain closures and request context in memory. When many promises resolve simultaneously, their continuations run before timers/callbacks, increasing event loop delay under load.

#### 4. The Autoscaling Death Spiral

- **0:00** → Traffic spikes 10x (instant)
- **0:01** → Existing nodes unresponsive
  - Healthchecks fail (event loop delay, request queue saturation, memory pressure)
  - OOM crash (thousands of pending requests exceed container memory limit)
  - Docker marks "unhealthy" and restarts (worsens problem: cold startup, no cache, initialization overhead)
  - Nginx times out (502 Error) and marks server "down"
- **0:03** → Autoscaler finally triggers (reactive, waits for CPU threshold + ~2 min boot time)
- **0:05** → New nodes boot but face **"Thundering Herd"**
  - Queued/retried requests from multiple layers (3 layers × 3 retries = 27× amplification)
  - Synchronized retry storm when healthcheck passes
  - New nodes receive 10-100× burst load and crash immediately

**Result:** 4-5 minutes of downtime; users abandon platform before system stabilizes.

### Critical Impacts

**Coupled Scalability:**
- Cannot scale services independently
- Adding more `TripService` nodes just crashes `DriverService` faster
- One slow service bottlenecks the entire chain

**Latency Chaining:**
- Total latency = sum of all service latencies + network hops
- Downstream slowness directly impacts user experience
- No buffering or asynchronous processing

**Cascading Failures:**
- Temporary downstream slowness → upstream resource exhaustion → crash
- Failure propagates upward through all dependent services
- System-wide outage from single service degradation

**No Automatic Backpressure:**
- Node.js continues accepting requests beyond safe capacity
- Event loop responsiveness hides overload symptoms
- Failure only becomes visible when lower-level limits are hit
- By then, recovery requires full restart (all accumulated state lost)

### Solution Direction

Implement explicit backpressure mechanisms:
- **Bounded Concurrency:** Limit in-flight downstream requests (`p-limit`, per-route limits)
- **Load Shedding:** Reject requests when over capacity (`503 Service Unavailable`, `429 Too Many Requests`)
- **Circuit Breakers:** Stop calling failing downstream services
- **Message Queues:** Decouple services with asynchronous pull-based consumption
- **Timeouts:** Fail fast instead of accumulating indefinitely

When capacity is reached, producers must be slowed (rate-limited) or rejected, allowing consumers to process at a controlled rate and preventing cascading failures.

---

## 2. Static Infrastructure (Manual Scaling Limits)

### Anti-Pattern

Services run on fixed container count (e.g., `replicas: 2`). Scaling requires manual intervention by operations team.

### Core Problem: Human Reaction Slower Than Traffic Velocity

Traffic in ride-hailing is volatile (sudden rain, events). Static infrastructure fails because spike velocity exceeds human reaction velocity.

**Timeline of Failure:**
1. **Traffic Spike:** Instant (0 seconds)
2. **Monitoring Alert:** Minutes (threshold breach detection)
3. **Human Response:** Minutes (investigation, approval, config change)
4. **Container Boot:** Minutes (startup + cache/connection warm-up)

**Result:** System overwhelmed before humans can respond.

### The Utilization Paradox

Only two bad choices:
- **Under-Provision (Risk):** Run 10 servers to save cost → Crash during peak hours
- **Over-Provision (Waste):** Run 100 servers for safety → 95 servers idle at 3 AM, burning money

### Critical Impacts

**Hard Capacity Ceiling:**

Unlike autoscaling that adapts to load, static infrastructure hits a brick wall:

When traffic exceeds capacity:
1. Excess load doesn't disappear—it queues
2. Requests accumulate in proxies, application queues, database pools
3. Latency grows non-linearly → timeouts → 5xx errors
4. Client/proxy retries amplify load further
5. Resource exhaustion (memory, connections, GC pressure) before CPU hits 100%

**Financial Inefficiency:**

Paying for peak capacity 24/7 despite only needing it for brief periods. Average utilization remains low while worst-case capacity must always be provisioned.

### Solution Direction

- **Horizontal Autoscaling:** Automatically add/remove instances based on metrics (CPU, memory, request rate)
- **Predictive Scaling:** Pre-warm capacity before known traffic patterns
- **Load Shedding:** Reject excess requests gracefully when at capacity
- **Circuit Breakers:** Prevent cascading failures during overload

---

## 3. Unoptimized Data Retrieval (Hot Path Bottleneck)

### Anti-Pattern

All requests (User Profile, Trip History) hit Primary Database directly. No caching layer (Redis/Memcached).

### Core Problem: Hot Data Amplification

10% of data (Profiles, Active Trips) receives 90% of traffic. Every repeated read forces expensive database operations for mostly static data.

**B-Tree vs Hash Map Inefficiency:**

**Database (B-Tree):**
- Traverse tree structure: Root → Branch → Leaf
- Each step: CPU comparisons + potential disk I/O (8KB page)
- Complexity: O(log N) per query
- Cost: 30,000 queries/min for same profile ID wastes CPU/IOPS

**In-Memory Cache (Hash Map):**
- Direct lookup: O(1)
- Pure RAM access (microseconds)
- No disk I/O, no CPU-intensive traversal

**Connection Pool Bottleneck:**
- TCP connection requires handshake (CPU intensive)
- Pool has hard limit (e.g., 100 connections)
- When pool full: queries queue even if individual queries are fast
- High-volume reads starve critical writes

### Critical Impacts

**Read Amplification:**

Single user action triggers multiple redundant queries.

**Example:** 5000 drivers ping "Get My Profile" every 10s
- 30,000 queries/min for static data
- DB becomes CPU/IOPS bound serving low-value reads
- Critical writes ("Accept Trip") delayed or timeout

**Queue-Induced Latency Spike:**

When request rate exceeds database capacity:
- Queries wait in queue
- Latency rises non-linearly (not just slow—exponential growth)
- Tail latency explodes → user-visible impact

**Connection Pool Starvation:**

Failure Mode:
- Pool saturated with 100 "Get Profile" queries (fast but high-volume)
- "Create Trip" (Write) cannot acquire connection → timeout
- System fails not from DB overload, but from blocked pool access

### Solution Direction

- **Caching Layer (Redis):** Store hot data in-memory (O(1) access)
- **Cache-Aside Pattern:** Check cache first, DB on miss
- **TTL Strategy:** Balance freshness vs hit rate
- **Connection Pooling:** Separate pools for read/write operations
- **Read Replicas:** Offload read traffic from primary (see Critical 4)

---

## 4. Single Primary Database (Vertical Scaling Wall)

### Anti-Pattern

All services connect to single primary database node for both reads and writes. No separation of concerns (Read Replicas).

### Core Problem: Resource Contention Between Reads and Writes

Database has finite resources (CPU, RAM, IOPS). Low-value high-volume operations compete directly with critical transactions.

**The Reader-Writer War:**

**Writes (Critical):**
- "Create Trip" requires ACID guarantees
- Slow under contention (locking, transaction log, fsync/IOPS)
- Must complete successfully for business continuity

**Reads (High-Volume):**
- "Get Status" polling is cheap but frequent
- Thousands of small queries swarm CPU/IOPS
- Non-critical but consume shared resources

**Conflict:** Write transactions starve for CPU cycles because reads monopolize resources.

**Vertical Scaling Limits:**

**Scale Up (Bigger Server):**
- Has practical ceiling (hardware limits)
- Has financial ceiling (cost grows exponentially)
- Eventually hits hard limit

**Scale Out (Read Replicas):**
- Can offload read traffic
- **Trade-off:** Replicas are eventually consistent
- **Challenge:** "Read-your-writes" flows (e.g., read trip immediately after creating) may see stale data unless using consistency strategy:
  - Read from primary after write
  - Session stickiness
  - Version checks
- Without strategy: teams keep reads on primary → traps high-volume traffic with writes

### Critical Impacts

**Single Point of Failure (SPOF):**

**Scenario:** Mandatory database restart (security patch, OS update)

**Failure Sequence:**
1. Database stops → rejects all connections
2. Services crash or hang waiting for DB
3. Restart/recovery takes minutes
4. Cache cold → performance degraded during warm-up

**Result:** Without HA/failover, single maintenance event = full platform outage.

**Resource Starvation:**

**Example:** 1000 users polling trip status (adaptive 3s → 15s)
- Thousands of "Are we there yet?" queries consume CPU/IOPS budget
- "Book Trip" (Write) times out because DB too busy answering status checks
- Critical business transaction fails due to non-critical polling

**Hard Capacity Ceiling:**

**Scenario:** Already at largest practical instance size, traffic doubles
- Cannot scale vertically beyond hardware/budget limits
- System hits ceiling and fails under sustained load
- No horizontal scaling option without replicas

### Solution Direction

- **Read Replicas:** Separate read/write workloads (PostgreSQL streaming replication)
- **Explicit Routing:** Application decides primary vs replica per query
- **Consistency Strategy:** Handle read-your-writes requirements (primary reads after writes)
- **High Availability:** Standby promotion for failover
- **Monitoring:** Replication lag, connection pool saturation, query performance

---

## Summary

These four bottlenecks create a fragile system vulnerable to traffic spikes, cascading failures, and resource exhaustion. Addressing them requires:

1. **Asynchronous decoupling** (message queues) to eliminate temporal coupling
2. **Horizontal autoscaling** to match capacity with demand dynamically
3. **Caching layer** (Redis) to offload hot-path reads from database
4. **Read replicas** to separate read/write workloads and eliminate SPOF

Each solution is detailed in the corresponding architecture solution documents.
