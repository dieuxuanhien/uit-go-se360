# Module A: ADR Scope Decision Summary

## Executive Decision

**Final Architecture: 4 ADRs (Scalability-Focused)**

We are implementing Module A (Architecture Design for Scalability & Performance) with **4 core ADRs**, explicitly dropping ADR-004 (Circuit Breakers) and ADR-005 (API Gateway + WAF) to maintain clear boundaries with Module B (Reliability) and Module C (Security).

## Selected ADRs for Module A

1. **ADR-001**: Asynchronous Communication (SNS/SQS)
   - **Impact**: 100x throughput improvement, 76% latency reduction
   - **Validation**: Story 2.1 completed, p95=23.66ms

2. **ADR-002**: Database Read Replicas
   - **Impact**: 5.2x database performance improvement
   - **Validation**: Story 2.2 completed, 4 replicas deployed

3. **ADR-003**: Distributed Caching (Redis Cluster)
   - **Impact**: 97.51% cache hit rate, sub-5ms latency
   - **Validation**: Story 2.3 completed, 6-node cluster

4. **ADR-006**: Auto-Scaling with Container Orchestration
   - **Target**: 50x capacity improvement (2 → 10+ containers under load)
   - **Status**: Story 2.6 in progress

## Dropped ADRs and Rationale

### ADR-004: Circuit Breakers (Deferred to Module B)

**Why Dropped:**
- **Module Overlap**: Fault tolerance patterns belong in Module B (Reliability), not Module A (Scalability)
- **Container Orchestration Sufficiency**: Built-in auto-recovery mechanisms eliminate need for application-level circuit breakers in our scope
  - Docker Compose: `restart: always` recovers crashes in ~10s
  - ECS Fargate: `desired_count: 2+` with health checks replaces failed tasks in ~30s
  - Multiple replicas prevent single point of failure
- **Auto-Scaling Interference**: Circuit breakers can BLOCK auto-scaling signals by masking capacity issues (hiding error spikes that should trigger scale-out)
- **Testing Environment**: LocalStack doesn't have real-world AWS failure modes that require circuit breakers (no network partitions, no region outages)

**Key Insight:**
> "Observability (CloudWatch) + Container Auto-Recovery (Docker restart, ECS desired_count) + Multiple Replicas provides sufficient fault tolerance for Module A scope without overlapping into Module B territory."

### ADR-005: API Gateway + WAF (Deferred to Module C)

**Why Dropped:**
- **Security Focus**: Rate limiting for DDoS protection is security concern (Module C), not scalability optimization (Module A)
- **Weak Scalability Justification**: Hard to defend as "performance pattern" when primary value is threat mitigation
- **Cost-Benefit**: API Gateway adds $3.50/million requests without clear scalability benefits in our test environment

## Architectural Trade-offs Analysis

### Trade-off 1: Circuit Breakers vs Container Auto-Recovery

| Aspect | Circuit Breakers (ADR-004) | Container Auto-Recovery (Chosen) |
|--------|---------------------------|----------------------------------|
| **Recovery Time** | Immediate (0s) | 10-30s delay |
| **Complexity** | High (state management, thresholds) | Low (built-in orchestration) |
| **Cost** | $151k/year savings (reduced retries) | No additional cost |
| **Cascading Failures** | Prevents (breaks circuit) | Prevents (multiple replicas + fast recovery) |
| **Auto-Scaling** | Can interfere (masks capacity signals) | Enables (exposes true load) |
| **Module Fit** | Overlaps with Module B | Pure Module A (capacity management) |

**Decision**: Container auto-recovery is sufficient for Module A because:
1. 10-30s recovery window is acceptable in LocalStack testing (no real customers)
2. Multiple replicas (desired_count: 2+) prevent total outage
3. Simpler architecture reduces operational complexity
4. Enables clean auto-scaling signals without circuit breaker masking

### Trade-off 2: Single-Module Depth vs Multi-Module Breadth

| Approach | 6 ADRs (Overlap) | 4 ADRs (Focused) |
|----------|------------------|------------------|
| **Module Clarity** | Blurred boundaries | Clear scope |
| **Technical Depth** | Broader coverage | Deeper scalability focus |
| **Report Defense** | Harder to justify overlap | Clean narrative |
| **Implementation Time** | 14+ hours | 10 hours (focused) |
| **Course Alignment** | Spans 3 modules | Pure Module A |

**Decision**: 4 ADRs allow us to go **deeper** on scalability patterns rather than **broader** into reliability/security:
- More comprehensive load testing scenarios
- Deeper auto-scaling analysis (cost vs capacity optimization)
- Better alignment with Module A evaluation criteria

## Implementation Strategy

### Story 2.4: Dropped Entirely (No Application-Level Fault Tolerance)

**Status**: Marked as "backlog" - deferred to Module B

**Justification**: We do **NOT** implement any application-level timeout, fallback, or resilience patterns. This maintains clean module boundaries.

```typescript
// Pure Module A approach: NO fault tolerance code
const callDriverService = async () => {
  return await fetch('http://driver-service/search'); // Direct call, no timeout
};
```

**Why This Approach:**
- **Intellectual Honesty**: Any timeout/fallback is fault tolerance (Module B territory)
- **Container Orchestration Sufficiency**: Docker `restart: always` + ECS `desired_count: 2+` handles failures
- **Clean Auto-Scaling Signals**: No application code masking errors
- **Zero Implementation Time**: Skip entirely, focus on Story 2.6 (Auto-Scaling)

**The Logical Flaw We Avoided:**
> "Lightweight timeout" is intellectually dishonest - if we implement ANY resilience pattern, circuit breakers are strictly better. The honest choice is: (1) No application fault tolerance OR (2) Full circuit breaker. We chose option 1.

### Story 2.6: Auto-Scaling Implementation (Next Priority)

**Docker Compose Simulation:**
```python
# scripts/auto-scaler.py
import docker
import time

client = docker.from_env()

while True:
    stats = client.api.stats('driver-service', stream=False)
    cpu_usage = stats['cpu_stats']['cpu_usage']['total_usage']
    
    if cpu_usage > 80:  # Scale out at 80% CPU
        client.compose.up(scale={'driver-service': 10})
    elif cpu_usage < 20:  # Scale in at 20% CPU
        client.compose.up(scale={'driver-service': 2})
    
    time.sleep(30)
```

**ECS Integration:**
```hcl
# Terraform for production auto-scaling
resource "aws_appautoscaling_policy" "driver_service" {
  name               = "driver-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = "service/driver-service"
  scalable_dimension = "ecs:service:DesiredCount"
  
  target_tracking_scaling_policy_configuration {
    target_value = 70.0  # Target 70% CPU utilization
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
```

## Infrastructure Resilience Validation (Epic 3)

**Important**: We do NOT need chaos engineering tests for Module A because we have NO application-level resilience patterns to validate.

### Story 3.4: Infrastructure Resilience Test (Optional)

If we want to demonstrate container orchestration works, we can run a simple test:

```bash
# Simulate driver-service crash during load test
k6 run load-test.js &  # Start load test
sleep 30               # Let it stabilize
docker stop driver-service-1  # Kill one container
sleep 30               # Observe recovery
docker ps              # Verify auto-restart
```

**Expected Results (Pure Infrastructure Resilience):**
- 10-30s error window during container restart
- Automatic recovery via Docker `restart: always` (NO application code)
- 0% cascading failure (trip-service continues with replica 2)
- Auto-scaling triggers scale-out (2 → 4 containers) in response to capacity signals

**What This Validates:**
- Infrastructure handles failures (not application)
- Multiple replicas prevent total outage
- Auto-scaling responds to TRUE capacity signals (not masked by circuit breakers)

**Why This is NOT Chaos Engineering:**
- Chaos engineering validates application resilience patterns (circuit breakers, retries, bulkheads)
- We have NO application patterns to validate
- This is simply demonstrating Docker/ECS features work as documented

## Cost Analysis

### Cost Savings from 4-ADR Architecture

| Component | 6 ADRs Cost | 4 ADRs Cost | Savings |
|-----------|-------------|-------------|---------|
| **API Gateway** | $3.50/M requests | $0 (direct ALB) | $3.50/M |
| **WAF** | $5/month + $1/M requests | $0 | $65/month |
| **Circuit Breaker Ops** | Reduced retry costs | Container restart overhead | Neutral |
| **Implementation Time** | 14 hours | 10 hours | 4 hours saved |

**Total**: ~$800/year savings in LocalStack test environment (more significant at scale)

## Module Boundaries Clarification

### Module A (Scalability) - Our Focus
- **Goal**: Handle increasing load efficiently
- **Patterns**: Async communication, caching, read replicas, auto-scaling
- **Key Metrics**: Throughput, latency, cache hit rate, capacity improvement

### Module B (Reliability) - Deferred
- **Goal**: Handle failures gracefully
- **Patterns**: Circuit breakers, retries, bulkhead, chaos engineering
- **Key Metrics**: MTBF, MTTR, error rate, SLO compliance

### Module C (Security) - Deferred
- **Goal**: Protect against threats
- **Patterns**: WAF, rate limiting (DDoS), zero-trust networking
- **Key Metrics**: Attack mitigation, compliance, vulnerability count

## Lessons Learned

1. **Container Orchestration is Powerful**: Docker/ECS auto-recovery provides infrastructure-level resilience without application code
2. **Circuit Breakers Can Block Signals**: Fault tolerance patterns interfere with capacity management (auto-scaling)
3. **Module Scope Matters**: Clear boundaries prevent overlap and enable deeper focus
4. **Intellectual Honesty in Design**: "Lightweight timeout" is dishonest - either implement full circuit breaker (Module B) or nothing (Module A). We chose nothing.
5. **Testing Environment Shapes Design**: LocalStack's controlled environment eliminates real-world failure modes that justify circuit breakers
6. **Simplicity is Scalability**: Fewer moving parts = easier to scale (4 ADRs, zero fault tolerance code)

## References

- **Sprint Status**: `docs/sprint-artifacts/sprint-status.yaml`
- **Full ADR-004 Analysis**: `docs/adrs/ADR-004-resilience-patterns-circuit-breakers.md` (700+ lines, archived)
- **Container Config**: `docker-compose.yml` (restart policies), `infrastructure/terraform/main.tf` (ECS desired_count)
- **Project Requirements**: `UIT-GO.md` (Module A definition)

---

**Document Status**: Architectural decision finalized  
**Date**: Sprint 2, Story 2.4 → 2.6 transition  
**Decision Makers**: Team consensus after trade-off analysis  
**Next Steps**: Implement Story 2.6 (Auto-Scaling), Epic 3 chaos tests
