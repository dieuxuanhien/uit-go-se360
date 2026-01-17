# Solution 2: Dynamic Infrastructure (The "Thermostat" for Capacity)

> **References:** See [bottleneck-references.md](../bottleneck-references.md) for authoritative sources on distributed systems concepts.

## 1. The Essence of the Problem: "The Reaction Time Gap"
The root cause of the failure in *Critical Bottlenecks* is not "not enough servers," but "slow reaction speed."

*   **The Physics:** Traffic spikes happen in **seconds** (e.g., rain starts). Humans react in **minutes** (alert -> login -> scale).
*   **The Gap:** During human-and-change-pipeline latency (often minutes-scale), the system can be under-provisioned and fail.
*   **The Failure Mode:** "Utilization Paradox." You either waste money (over-provisioning) or risk crashing (under-provisioning). You cannot win with static numbers.

## 2. The Architectural Solution: "Automated Elasticity"
We replace static configuration with a dynamic **Control Loop**. The infrastructure must "breathe" with the load, expanding and contracting automatically.

### The Pattern: The Feedback Loop
1.  **Monitor (The Sensor):** Continuously measure "Pressure" (CPU, RAM, Queue Depth).
2.  **Decide (The Brain):** Compare Pressure vs. Target.
    *   *If CPU > 70%:* Add +1 Replica.
    *   *If CPU < 30%:* Remove -1 Replica.
3.  **Act (The Hand):** Boot or Kill containers via the Orchestrator (Docker/K8s).

## 3. Why This Fixes the Crash
*   **Speed:** The machine can react faster than humans (seconds-to-minutes depending on container startup, health checks, and the control loop interval).
*   **Efficiency:** The fleet can track load over time, reducing the need to permanently run at peak capacity.
*   **Survival:** The system can absorb spikes by scaling out—within the limits of boot time, quotas, downstream capacity (DB), and load balancer propagation.

## 4. Technology Selection
We need an Autoscaler.

*   **Option A: AWS Auto Scaling Groups (The "Standard")**
    *   *Pros:* Native AWS integration, reliable.
    *   *Cons:* Hard to simulate locally (requires LocalStack Pro or real AWS).
    *   *Verdict:* **Target for Production.**

*   **Option B: Kubernetes HPA (The "Modern Standard")**
    *   *Pros:* Industry standard for containers.
    *   *Cons:* High complexity to set up K8s for this project scope.
    *   *Verdict:* **Too complex** for current phase.

*   **Option C: Custom Python Auto-Scaler (The "MVP")**
    *   *Pros:* Works with standard Docker Compose, easy to customize logic, perfect for local simulation/demo.
    *   *Cons:* Not production-hardened.
    *   *Verdict:* **Selected for Development/Demo.** We built a custom "Control Loop" script (`scripts/auto-scaler.py`) that mimics AWS ECS behavior.

## 5. Implementation Strategy

We implemented a **Multi-Signal Auto-Scaler** in Python that monitors 5 different metrics to make intelligent scaling decisions. The system requires tight integration with a **Load Balancer** to distribute traffic across dynamically created replicas.

### A. Load Balancer Integration (`nginx-lb.conf`)

Scaling replicas is useless if traffic doesn't reach them. We use **Nginx** as a reverse proxy with **DNS-based service discovery**.

#### The Problem: Static Upstream Lists
Traditional Nginx config uses static server lists:
```nginx
upstream trip_backend {
    server trip-service-1:3002;
    server trip-service-2:3002;
    # What about trip-service-3 that the auto-scaler just created?
}
```
When the auto-scaler boots a new container, Nginx doesn't know about it.

#### The Solution: Docker DNS Resolution
Docker Compose assigns all replicas to the **same network alias**. When Nginx queries `trip-service`, Docker's internal DNS returns **all container IPs**.

```yaml
# docker-compose.loadbalancer.yml
trip-service-2:
  networks:
    uitgo-network:
      aliases:
        - trip-service  # SAME alias as primary!
```

```nginx
# nginx-lb.conf
resolver 127.0.0.11 valid=2s;  # Docker's internal DNS, refresh every 2s

upstream trip_backend {
    least_conn;  # Send to the container with fewest connections
    server trip-service:3002 resolve;  # DNS resolves to ALL replicas
    keepalive 128;  # Connection pooling for performance
}
```

#### Key Features Implemented:
*   **Least Connections:** Routes traffic to the least busy replica.
*   **Keepalive Connections:** Reuses upstream connections (example: 128), reducing connection setup overhead.
*   **Passive Health Handling:** `max_fails` / `fail_timeout` provide passive failure detection (based on failed requests). Active health checks require Nginx Plus or an external health checker.
*   **Fast DNS Re-resolution:** With `resolver ... valid=2s` and `resolve`, Nginx can re-resolve service names frequently to discover new replicas.

### B. The Control Loop (`scripts/auto-scaler.py`)
Unlike simple CPU-based scalers, our implementation uses a **Weighted Score System** combining multiple signals. Critically, it **reads metrics from the Nginx load balancer** (not just Docker stats) to get accurate per-service RPS and latency.

```python
# Pseudocode sketch (illustrative, not exact implementation)
SCALING_WEIGHTS = {
    "cpu": 0.30,       # 30% - Lagging indicator (from Docker stats)
    "memory": 0.15,    # 15% - Lagging indicator (from Docker stats)
    "rps": 0.30,       # 30% - Leading indicator (from Nginx logs)
    "latency": 0.25,   # 25% - Leading indicator (from Nginx logs)
}

# Auto-scaler parses Nginx access logs to extract per-service metrics
def get_service_metrics_from_nginx():
    # Parse: "GET /trips/xxx upstream: 172.19.0.21:3002 rt: 0.045"
    # -> Trip Service: 45ms latency
    pass

while True:
    for service in services:
        # 1. Measure (Multi-Signal)
        metrics = {
            "cpu": get_avg_cpu(service),
            "memory": get_avg_memory(service),
            "rps_per_replica": get_rps(service),
            "latency_ms": get_p95_latency(service),
            "queue_depth": get_queue_depth(service),
        }
        
        # 2. Calculate Weighted Score
        score = calculate_weighted_score(service, metrics)
        
        # 3. Decide with Burst Logic
        if score > 1.0 or metrics["queue_depth"] > 50:  # Over target
            if not in_cooldown(service, "scale_out"):
                replicas_to_add = get_burst_replicas(score, metrics)
                scale_service(service, +replicas_to_add)
                start_cooldown(service, scale_out_seconds=12)
        
        elif score < 0.5 and consecutive_low_count >= 3:  # Under target
            if not in_cooldown(service, "scale_in"):
                scale_service(service, -1)
                start_cooldown(service, scale_in_seconds=60)
                
    sleep(3)  # Poll every 3 seconds
```

### B. Key Features Implemented

#### 1. Multi-Signal Monitoring
*   **CPU Utilization:** Example target band (varies by service).
*   **Memory Utilization:** Example target band.
*   **RPS per Replica:** Example target band (varies by endpoint mix and service complexity).
*   **P95 Latency:** Example target band.
*   **Queue Depth:** Example target band (for async flows).

#### 2. Burst Scaling
When the system detects critical pressure, it scales by **multiple replicas** at once:
```python
BURST_SCALING = {
    "score > 1.0": "+2 replicas",
    "score > 1.5": "+3 replicas",
    "score > 2.0": "+4 replicas",
    "latency > 500ms": "Burst by latency ratio",
    "queue > 100": "Burst by queue ratio"
}
```

#### 3. Cooldown Periods (Anti-Flapping)

> **Industry Pattern:** Cooldown periods prevent "flapping" (rapid scale up/down oscillations). This is a standard practice in AWS Auto Scaling and Kubernetes HPA.

*   **Scale-Out Cooldown:** 12 seconds (Fast reaction).
*   **Scale-In Cooldown:** 60-90 seconds (Slow contraction).
*   **Philosophy:** "Scale up fast, scale down slow."

#### 4. Stability Mechanisms
*   **Consecutive Low Readings:** Require 3 consecutive low-usage readings before scaling down.
*   **Startup Grace Period:** 60-second window after boot where scale-in is disabled.
*   **Min/Max Bounds:** Each service has hard limits (e.g., Trip Service: min=4, max=15).

### C. Service-Specific Profiles
*   **Trip Service:** Min 4, Max 15 (Most critical, handles trip creation + SQS).
*   **Driver Service:** Min 3, Max 15 (Location updates, Redis-backed).
*   **User Service:** Min 2, Max 10 (Auth + Profile, DB read replicas).

## 6. Trade-offs & Mitigation Status

Automated scaling introduces dynamic instability risks. Below is the status of each trade-off and its mitigation.

### A. Trade-off: "Oscillation" (Flapping)
*   **The Cost:** The system scales up (CPU drops), then immediately scales down (CPU spikes), then scales up again. This "flapping" wastes resources and causes latency.
*   **Risk:** Constant restarting of containers makes the system unstable.
*   **Status:** ✅ **MITIGATED (Implemented)**
    *   **Cooldown Periods:** Scale-out cooldown = 12s, Scale-in cooldown = 60-90s.
    *   **Consecutive Readings:** Require 3 consecutive low-usage readings before scaling down.
    *   **Startup Grace Period:** 60-second grace period where scale-in is disabled.
    *   *Result:* Flapping is reduced in testing, but thresholds/cooldowns still need tuning as traffic patterns change.

### B. Trade-off: "Cold Start" Latency
*   **The Cost:** When we decide to scale up, it takes 30-60 seconds for the new container to boot and pass health checks.
*   **Risk:** During this 60s, the existing servers might crash before help arrives.
*   **Status:** ⚙️ **PARTIALLY MITIGATED**
    *   **Implemented:**
        *   **Pre-Scaling:** Critical services start with higher min replicas (Trip Service: min=4).
        *   **Burst Scaling:** Scale by +2 to +5 replicas at once during high pressure.
        *   **Fast Polling:** 3-second polling interval for quick detection.
    *   **Future Improvements:**
        *   **Predictive Scaling:** Use time-series analysis (e.g., "5 PM rush hour") to scale *before* the spike.
        *   **Warm Pool:** Keep 1-2 "warm" containers in standby mode (costs money but eliminates cold starts).

### C. Trade-off: Database Connection Storms
*   **The Cost:** If we suddenly boot 5+ new containers, they all try to connect to Postgres simultaneously.
*   **Risk:** The Database runs out of connections (`max_connections` limit) and crashes.
*   **Status:** ⏳ **NOT YET IMPLEMENTED**
    *   **Current Risk:** Moderate. Burst scaling can add multiple replicas at once, which can create a connection surge if every replica opens its own pools.
    *   **Planned Mitigation:** Implement **PgBouncer (Connection Pooling)**.
        *   The containers connect to the Proxy (PgBouncer), not the DB directly.
        *   The Proxy multiplexes thousands of app connections into ~100 DB connections.
        *   *Trade-off of the Fix:* Adds some latency and operational complexity.

### D. Trade-off: Load Balancer Awareness Delay
*   **The Cost:** When a new replica boots, there is a propagation gap before it receives traffic.
*   **Risk:** Capacity is technically increased but temporarily unused during this window.
*   **Status:** ✅ **MITIGATED (Implemented)**
    *   **Short DNS validity:** Nginx is configured to re-resolve frequently.
    *   **Nginx `least_conn`:** New replicas with 0 connections tend to receive traffic quickly.
    *   **Health Checks:** Replicas only receive traffic after passing health check.