# Critical Bottlenecks #2, #3, #4 - Presentation Deck

---

# Bottleneck #2: Static Infrastructure

## The Problem

```
Manual Scaling:
Traffic spike (0s) → Alert (2min) → Human (5min) → Boot (3min)
                    
Total: 10 minutes to respond
Result: System dead at 30 seconds
```

**Anti-Pattern:** Fixed container count (`replicas: 2`)  
**Core Issue:** Human reaction slower than traffic velocity

---

## The Utilization Paradox

**Only two bad choices:**

| Strategy | Capacity | Cost | Risk |
|----------|----------|------|------|
| Under-provision | 10 servers | Low 💰 | Crash at peak 💥 |
| Over-provision | 100 servers | High 💰💰💰 | 95% idle at 3AM ⏰ |

**Reality:** Average 20% utilization, paying for 100% capacity 24/7

---

## Hard Capacity Ceiling

```
Static: 10 servers (fixed)
         ↓
      Brick wall
         ↓
Traffic exceeds → Queue → Latency spike → Timeout → Crash

Autoscaling: 10 → 20 → 50 servers (adaptive)
                   ↓
              Matches demand
```

**When traffic exceeds static capacity:**
1. Requests queue (don't disappear)
2. Latency grows non-linearly
3. Timeouts → 5xx errors
4. Client retries amplify load
5. Resource exhaustion before CPU hits 100%

---

## Solution

| Mechanism | Purpose | Example |
|-----------|---------|---------|
| **Horizontal Autoscaling** | Auto add/remove instances | CPU > 70% → +2 pods |
| **Predictive Scaling** | Pre-warm before spike | 8AM rush → scale at 7:50AM |
| **Load Shedding** | Reject gracefully at capacity | `503 Service Unavailable` |
| **Circuit Breakers** | Prevent cascade failures | Stop calling failed service |

---

---

# Bottleneck #3: Unoptimized Data Retrieval

## The Problem

```
All requests → Primary Database (directly)
             ↓
    No caching layer
             ↓
     Hot data amplification
```

**Hot Data:** 10% of data receives 90% of traffic  
**Anti-Pattern:** 30,000 queries/min for same static profile

---

## B-Tree vs Hash Map

| Operation | Database (B-Tree) | Cache (Hash Map) |
|-----------|-------------------|------------------|
| Complexity | O(log N) | O(1) |
| Path | Root → Branch → Leaf | Direct lookup |
| Medium | Disk I/O (8KB pages) | RAM (microseconds) |
| Cost | CPU + IOPS intensive | Negligible |

**Example:**  
5000 drivers ping "Get My Profile" every 10s  
= 30,000 queries/min for **static data**  
= DB CPU/IOPS bound serving low-value reads

---

## Connection Pool Bottleneck

```
┌─── Connection Pool (100 slots) ───┐
│ [■■■■■■■■■■] ALL BUSY             │
│ • 100 "Get Profile" (fast)        │
│ • "Create Trip" cannot acquire    │
│   → TIMEOUT                       │
└───────────────────────────────────┘
```

**Failure Mode:** High-volume reads starve critical writes

---

## Critical Impacts

### 📈 Read Amplification
- Single action → multiple redundant queries
- DB becomes CPU/IOPS bound
- Critical writes delayed/timeout

### ⏱️ Queue-Induced Latency Spike
- Queries wait in queue
- Latency rises **non-linearly** (exponential)
- Tail latency explodes

### 🚫 Connection Pool Starvation
- Pool saturated with reads
- Writes cannot acquire connection
- System fails from blocked access, not DB overload

---

## Solution

```
BEFORE:
Request → Database (every time)
            ↓
    Slow + Expensive

AFTER:
Request → Cache (hit) → Return (1ms)
            ↓ (miss)
         Database → Cache → Return
```

**Mechanisms:**
- **Redis Cache:** Store hot data in-memory (O(1))
- **Cache-Aside Pattern:** Check cache first, DB on miss
- **TTL Strategy:** Balance freshness vs hit rate
- **Separate Pools:** Read/write isolation
- **Read Replicas:** Offload read traffic (see #4)

---

---

# Bottleneck #4: Single Primary Database

## The Problem

```
All services → Single Primary DB (reads + writes)
                      ↓
            Resource contention
                      ↓
           Writes starve for CPU
```

**Anti-Pattern:** No read replicas, no separation of concerns

---

## The Reader-Writer War

| Operation | Characteristics | Volume | Priority |
|-----------|----------------|--------|----------|
| **Writes** | ACID guarantees | Low | 🔴 Critical |
| | Slow (locking, fsync) | | Must succeed |
| **Reads** | Eventually consistent OK | High | 🟡 Non-critical |
| | Fast but frequent | | Can tolerate lag |

**Conflict:** Reads monopolize CPU/IOPS → Writes starve

---

## Vertical Scaling Wall

```
Scale UP (bigger server):
$100/mo → $500/mo → $2000/mo → ⛔ Hardware/budget limit
   ↓          ↓          ↓           ↓
  2GB       8GB       32GB      128GB (ceiling)

Scale OUT (read replicas):
Primary (writes) + 5 Replicas (reads)
     ↓                  ↓
  Stable            Horizontal
```

**Trade-off:** Replicas are eventually consistent  
**Challenge:** "Read-your-writes" flows

---

## Single Point of Failure

**Scenario:** Mandatory DB restart (security patch)

| Time | Event |
|------|-------|
| 0s | Database stops |
| 0s | All services crash/hang |
| 5min | DB restarts + recovery |
| 10min | Cache cold → degraded performance |

**Result:** Single maintenance event = full platform outage

---

## Critical Impacts

### 🔴 Single Point of Failure (SPOF)
- No HA/failover → maintenance = outage
- One DB restart → entire platform down

### 🔄 Resource Starvation
- 1000 users polling status (3-15s)
- "Book Trip" timeouts because DB too busy
- Critical transaction fails due to non-critical polling

### 📊 Hard Capacity Ceiling
- Already at largest instance size
- Traffic doubles → no scaling option
- System hits wall and fails

---

## Solution

```
BEFORE:
Services → Primary (reads + writes)
             ↓
        Bottleneck

AFTER:
Services → Primary (writes only)
        ↓
        └→ Replica 1 (reads)
        └→ Replica 2 (reads)
        └→ Replica 3 (reads)
```

**Mechanisms:**
- **Read Replicas:** PostgreSQL streaming replication
- **Explicit Routing:** App decides primary vs replica
- **Consistency Strategy:** Handle read-your-writes
  - Read from primary after write
  - Session stickiness
  - Version checks
- **High Availability:** Standby promotion for failover
- **Monitoring:** Replication lag, query performance

---

---

# Summary: All Bottlenecks

| # | Bottleneck | Core Issue | Solution |
|---|------------|------------|----------|
| 1 | Sync HTTP Chaining | Temporal coupling | Message queue + Circuit breaker |
| 2 | Static Infrastructure | Manual scaling | Horizontal autoscaling + Load shedding |
| 3 | Unoptimized Retrieval | Hot data amplification | Redis cache + Read replicas |
| 4 | Single Primary DB | Resource contention | Read replicas + HA failover |

**Common Theme:** Lack of decoupling and automatic adaptation

---

---

# Speaker Notes

## Bottleneck #2: Static Infrastructure

### Slide 1: The Problem
- **Timeline emphasis:** Show gap between spike and response
- **Analogy:** "Fighting a fire with a garden hose that takes 10 minutes to turn on"
- **Connect to:** Real incident (if you had one during load test)

### Slide 2: Utilization Paradox
- **Financial impact:** Calculate actual waste (95 idle servers × $100/mo)
- **Business decision:** "Do we risk crashes or waste money?"
- **Key point:** False dilemma - autoscaling solves both

### Slide 3: Hard Capacity Ceiling
- **Visual:** Show queue building up, requests timing out
- **Emphasize non-linear:** "Not just slow - exponential failure"
- **Lead to:** Load test graph (latency vs time)

### Slide 4: Solution
- **Demo opportunity:** Show autoscaling in action (k6 test)
- **Metrics:** Response time P99 before/after
- **ROI:** Cost savings + reliability improvement

## Bottleneck #3: Data Retrieval

### Slide 1: The Problem
- **Hot data concept:** "Same profile ID hit 30,000 times/min"
- **Waste emphasis:** "Database doing expensive work for static data"
- **Analogy:** "Looking up contact in phone book vs speed dial"

### Slide 2: B-Tree vs Hash Map
- **Technical but accessible:** Tree traversal vs direct lookup
- **Performance delta:** 10-100× faster
- **Visual:** Show tree structure vs hash table

### Slide 3: Connection Pool
- **Counter-intuitive:** "System fails before DB overloaded"
- **Blocked access:** Pool full of fast queries
- **Critical writes starve:** Business impact

### Slide 4: Solution
- **Cache hit rate:** 95%+ for hot data
- **Latency improvement:** 500ms → 5ms
- **DB load reduction:** 90% fewer queries

## Bottleneck #4: Single Primary

### Slide 1: The Problem
- **Resource competition:** "Readers vs Writers fighting for CPU"
- **Critical path:** Writes must succeed for business

### Slide 2: Reader-Writer War
- **Table walkthrough:** Contrast characteristics
- **Business impact:** "Status checks kill trip bookings"
- **Key insight:** Non-critical high-volume kills critical low-volume

### Slide 3: Scaling Wall
- **Cost escalation:** Show exponential price curve
- **Hardware limits:** "Eventually hits ceiling"
- **Replicas:** Horizontal scaling breakthrough

### Slide 4: SPOF
- **Incident simulation:** "5-minute restart = platform outage"
- **No HA:** Single point of failure
- **Business risk:** Lost revenue during maintenance

### Slide 5: Solution
- **Architecture diagram:** Primary + replicas
- **Consistency trade-off:** Acknowledge eventual consistency
- **CAP theorem:** Brief mention if technical audience
- **Read-your-writes:** Strategy for critical flows

## Summary Slide

- **Recap all four:** Quick reminder of each
- **Common pattern:** Lack of decoupling/adaptation
- **Holistic solution:** All mechanisms work together
- **Next steps:** Implementation roadmap

---

## Backup Slides (Q&A)

### Q: How much does Redis/caching cost?

**Infrastructure:**
- Redis cluster: $50-200/mo (AWS ElastiCache)
- vs 10× larger DB: $500-2000/mo

**ROI:** 5-10× cheaper than scaling DB

### Q: Read replica lag acceptable?

**Typical lag:** 100-500ms (same region)  
**Trade-offs:**
- ✅ 95% of reads (tolerate lag)
- ❌ Read-your-writes (need consistency)

**Strategy:** Route critical reads to primary

### Q: Autoscaling costs more?

**Myth:** More instances = higher cost

**Reality:**
- Static over-provision: 24/7 peak capacity
- Autoscaling: Pay only for actual usage
- **Savings:** 40-60% lower average cost

**Example:**
- Static: 100 servers × 24h × $0.10 = $240/day
- Autoscale: 20 servers (avg) × 24h × $0.10 = $48/day

### Q: Message queue vs direct HTTP?

**When to use HTTP:**
- Synchronous user flows (login, checkout)
- Sub-100ms latency requirements
- Simple request-response

**When to use queue:**
- Background processing (emails, reports)
- High-volume async tasks (matching, notifications)
- Decoupling for scalability

### Q: CAP theorem implications?

**CAP:** Consistency, Availability, Partition-tolerance (pick 2)

**Read replicas:**
- ✅ Availability (more nodes)
- ✅ Partition-tolerance (replication)
- ⚠️ Consistency (eventual, not strong)

**Read-your-writes:** Explicit consistency strategy required

### Q: How to monitor these bottlenecks?

**Key metrics:**

| Bottleneck | Metric | Alert Threshold |
|------------|--------|-----------------|
| Sync HTTP | Event loop delay | >50ms |
| | Pending requests | >1000 |
| Static infra | CPU utilization | >70% (scale trigger) |
| Data retrieval | Cache hit rate | <90% |
| | Connection pool | >80% saturation |
| Single DB | Replication lag | >1s |
| | Connection count | >80% max |

**Tools:** Prometheus, Grafana, CloudWatch

---

## References

- Brewer, "CAP Theorem" (2000)
- Kleppmann, "Designing Data-Intensive Applications" (2017)
- Reactive Manifesto (reactivemanifesto.org)
- AWS Architecture Best Practices
- PostgreSQL Replication Documentation
