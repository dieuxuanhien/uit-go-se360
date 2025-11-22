# ADR-001: Event-Driven Async Communication with SNS/SQS

**Status:** ✅ Accepted  
**Date:** 2025-11-21  
**Decision Makers:** Architecture Team  
**Technical Story:** [async-communication.md](../architecture/async-communication.md)

## Context

The current architecture uses **synchronous REST API calls** for inter-service communication, specifically for driver-trip matching. When a rider requests a trip:

1. TripService receives request
2. TripService makes **synchronous HTTP call** to DriverService
3. DriverService queries database for available drivers
4. Response sent back through the call chain
5. TripService creates trip record

### Problems with Current State

**Performance Bottlenecks:**

- Average response time: **2-5 seconds** for trip creation
- TripService blocked waiting for DriverService response
- Cascading failures when DriverService is slow/down
- No retry mechanism for failed requests

**Scalability Limitations:**

- Cannot handle burst traffic (100+ concurrent requests)
- Services tightly coupled through HTTP calls
- Horizontal scaling limited by synchronous dependencies
- Resource waste: threads blocked waiting for I/O

**Capacity Analysis:**

- Current: ~1,000 concurrent users
- Target: 100,000 concurrent users
- **Gap: 100x improvement needed**

## Decision

**Replace synchronous REST calls with event-driven async communication using AWS SNS/SQS.**

### Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│ TripService │──Pub──▶ │  SNS Topic  │──Fan──▶ │ SQS Queue   │
└─────────────┘         │ TripEvents  │         │DriverMatch  │
                        └─────────────┘         └──────┬──────┘
                                                       │
                                                    Subscribe
                                                       │
                                                ┌──────▼──────┐
                                                │DriverService│
                                                └─────────────┘
```

**Event Flow:**

1. TripService publishes `TripRequested` event to SNS
2. SNS fans out to SQS queue `DriverMatchQueue`
3. DriverService polls queue asynchronously
4. DriverService processes match and publishes `DriverMatched` event
5. TripService subscribes to `DriverMatched` events and updates trip

**Key Changes:**

- SNS Topic: `trip-events` for publishing
- SQS Queues: Standard queues for each service (10k TPS throughput)
- Dead Letter Queues (DLQ) for failed messages (after 3 retries)
- Message retention: 14 days
- Visibility timeout: 30 seconds

## Quantitative Analysis

### Performance Impact

| Metric                     | Current (Sync) | Proposed (Async) | Improvement     |
| -------------------------- | -------------- | ---------------- | --------------- |
| **Trip Creation Response** | 2-5 seconds    | 50ms (ack)       | **100x faster** |
| **End-to-End Match Time**  | 2-5 seconds    | 1-2 seconds      | 2x faster       |
| **Throughput (trips/min)** | 500            | 50,000+          | **100x more**   |
| **Failure Recovery**       | Manual retry   | Automatic (3x)   | ∞ improvement   |
| **Max Concurrent**         | 1,000 users    | 100,000+ users   | **100x scale**  |

**Latency Breakdown:**

- **Current:** TripService HTTP → DriverService (2000ms avg) → DB query (500ms) → Response (2000ms) = 4500ms total
- **Proposed:** Publish SNS (5ms) → SQS delivery (20ms) → Process (500ms) → Publish result (25ms) = 550ms total
- **User-facing response:** 50ms acknowledgment ("We're finding you a driver...")

### Cost Analysis

**Current State (Synchronous):**

```
EC2 Instances (for blocking I/O):
- 4x t3.medium instances (2 TripService + 2 DriverService)
- $0.0416/hour × 4 × 730 hours = $121.47/month

ALB for routing:
- $16.20/month (base) + $0.008/LCU × 50 LCUs = $16.60/month

Database:
- Increased load from retries: ~$50/month extra
Total: $188/month
```

**Proposed State (Event-Driven):**

```
SNS:
- 10M requests/month × $0.50/million = $5.00/month

SQS Standard:
- 10M requests/month × $0.40/million = $4.00/month
- Data transfer negligible (<1GB) = ~$0/month

EC2 Instances (optimized):
- 2x t3.medium instances (event processing is non-blocking)
- $0.0416/hour × 2 × 730 hours = $60.74/month

ALB: $16.60/month
Database: Reduced retry load = -$30/month savings

Total: $56.34/month
```

**Cost Savings:** $188 - $56.34 = **$131.66/month (70% reduction)**

**At 100k Users:**

- SNS: 50M events/month × $0.50/million = $25/month
- SQS: 50M requests/month × $0.40/million = $20/month
- EC2: 3x t3.large (auto-scaled) = $182/month
- **Total: $243.60/month = $0.0024/user**

### Scalability Metrics

| Dimension             | Current              | Proposed             | Factor     |
| --------------------- | -------------------- | -------------------- | ---------- |
| **Max TPS**           | 8 TPS                | 10,000 TPS           | **1,250x** |
| **Queue Depth**       | N/A (blocking)       | Unlimited            | ∞          |
| **Retry Capability**  | Manual               | Automatic (3×) + DLQ | ∞          |
| **Burst Handling**    | Fails at 100 req/min | 300,000 req/min      | **3,000x** |
| **Service Coupling**  | Tight (synchronous)  | Loose (async)        | N/A        |
| **Failure Isolation** | Cascading failures   | Isolated failures    | Critical   |

## Alternatives Considered

### Alternative 1: Keep Synchronous REST with Circuit Breakers

**Pros:**

- Simpler to understand (request-response paradigm)
- No new infrastructure (SNS/SQS)
- Immediate consistency (no eventual consistency concerns)

**Cons:**

- Still blocks threads (scalability bottleneck)
- Circuit breaker only fails fast, doesn't increase throughput
- Cannot handle burst traffic
- Max throughput: ~50 TPS (vs 10k TPS with SQS)
- Higher cost: $188/month vs $56/month

**Cost:** $188/month (current state)

**Verdict:** ❌ **Rejected** - Does not meet 100x scale requirement

### Alternative 2: Direct SQS (No SNS)

**Pros:**

- Simpler architecture (one less component)
- Lower cost: $4/month for SQS only (vs $9/month for SNS+SQS)
- Slightly lower latency (no SNS hop)

**Cons:**

- **Cannot fan-out** to multiple consumers (e.g., analytics, notification services)
- Tight coupling: TripService must know DriverService queue name
- Harder to add new services later (architectural rigidity)
- No topic-based routing or filtering

**Cost:** $4/month (vs $9/month) = **$5/month savings**

**Verdict:** ❌ **Rejected** - SNS fanout critical for future extensibility (analytics, notifications). $5/month trade-off is worth architectural flexibility.

### Alternative 3: Kafka / Amazon MSK

**Pros:**

- Higher throughput: 1M+ TPS per partition
- Strong ordering guarantees
- Replay capability (consumer can rewind)
- Better for complex event streaming

**Cons:**

- **Massive over-engineering** for current needs (10k TPS is sufficient)
- Higher cost: $270/month for smallest MSK cluster (vs $9/month SNS/SQS)
- Operational complexity: Need to manage Kafka brokers, partitions, consumer groups
- Longer development time: 8 weeks vs 4 weeks

**Cost:** $270/month (vs $9/month) = **30x more expensive**

**Verdict:** ❌ **Rejected** - Kafka is overkill. Use "boring technology" (SQS) that scales to our needs. Revisit if we exceed 100k TPS.

### Alternative 4: RabbitMQ (Self-Hosted)

**Pros:**

- Lower AWS costs (self-hosted)
- More control over routing logic (exchanges, bindings)
- Strong community support

**Cons:**

- **Operational burden:** Must manage RabbitMQ clusters, monitoring, patching
- High availability requires 3-node cluster: 3× t3.medium = $91/month
- No auto-scaling (manual capacity planning)
- Risk of data loss if not configured correctly
- Team lacks RabbitMQ expertise

**Cost:** $91/month + operational overhead

**Verdict:** ❌ **Rejected** - Prefer managed service (SQS) to avoid operational burden. Team should focus on business logic, not infrastructure.

## Consequences

### Positive

✅ **Massive Performance Improvement**

- 100x faster user-facing response (50ms acknowledgment)
- 100x higher throughput (10k TPS vs 8 TPS)
- Non-blocking architecture scales horizontally

✅ **70% Cost Reduction**

- $188/month → $56/month at current scale
- Cost-efficient at 100k users: $0.0024/user

✅ **Automatic Failure Recovery**

- SQS retries failed messages 3 times automatically
- Dead Letter Queue captures poison messages for manual review
- No cascading failures (services decoupled)

✅ **Burst Traffic Handling**

- Queue absorbs traffic spikes (300k req/min burst capacity)
- Auto-scaling triggers based on queue depth metrics

✅ **Future Extensibility**

- SNS fanout enables easy addition of new services (analytics, notifications)
- Event-driven pattern aligns with microservices best practices

### Negative

⚠️ **Eventual Consistency**

- Users see "Finding driver..." (50ms) → "Driver found!" (1-2s later)
- Requires UI changes to handle async updates (polling or WebSocket)
- Edge case: User might refresh and not see match immediately

⚠️ **Increased Complexity**

- Developers must understand pub/sub pattern (vs simple HTTP)
- Debugging harder: Need to trace events through SNS → SQS → Service
- Message ordering not guaranteed (use FIFO queues if needed)

⚠️ **Infrastructure Dependencies**

- New AWS services to manage (SNS, SQS)
- Monitoring requirements: CloudWatch metrics for queue depth, DLQ messages

⚠️ **Data Consistency Challenges**

- Duplicate message processing possible (at-least-once delivery)
- Requires idempotent handlers (check if trip already matched before processing)

### Risks and Mitigations

| Risk                        | Probability | Impact | Mitigation                                                               |
| --------------------------- | ----------- | ------ | ------------------------------------------------------------------------ |
| **Message Loss**            | Low         | High   | Enable SQS message persistence, DLQ for failures, CloudWatch alarms      |
| **Duplicate Processing**    | Medium      | Medium | Implement idempotent handlers (unique request IDs), database constraints |
| **Increased Latency**       | Low         | Medium | Optimize event payload size (<256KB), monitor SQS ApproximateAge metric  |
| **Queue Backlog**           | Medium      | High   | Auto-scaling based on `ApproximateNumberOfMessages > 1000` threshold     |
| **Dev Team Learning Curve** | Medium      | Low    | 1-week training on async patterns, comprehensive docs + code examples    |

## Implementation

### Timeline: 4 Weeks

**Week 1: Infrastructure Setup**

- Create SNS topics and SQS queues via Terraform
- Set up CloudWatch alarms (queue depth, DLQ messages)
- Configure IAM roles and permissions

**Week 2: TripService Async Publisher**

- Implement SNS publisher in TripService
- Add event schemas (TypeScript interfaces)
- Deploy to staging, test with synthetic events

**Week 3: DriverService Async Consumer**

- Implement SQS consumer in DriverService
- Add idempotent message processing
- Dead letter queue monitoring
- Deploy to staging

**Week 4: End-to-End Testing & Rollout**

- Integration testing (TripService → DriverService via SNS/SQS)
- Load testing: 10k concurrent trip requests
- Blue-green deployment to production
- Monitor for 48 hours before fully cutting over

### Migration Strategy

**Strangler Fig Pattern:**

1. **Deploy async system alongside sync system** (both running in parallel)
2. **Feature flag:** Route 10% of traffic to async path
3. **Gradual rollout:** 10% → 25% → 50% → 100% over 2 weeks
4. **Monitor metrics:** Error rate, latency, queue depth
5. **Rollback trigger:** Error rate >1% or p99 latency >3s

**Code Example:**

```typescript
// Feature flag determines sync vs async
if (featureFlags.isAsyncMatchingEnabled(userId)) {
  await publishTripRequestedEvent(tripData);
  return { status: 'PENDING', message: 'Finding driver...' };
} else {
  const driver = await driverService.findAvailableDriver(tripData);
  return { status: 'MATCHED', driver };
}
```

### Rollback Plan

**Scenario:** Async system fails (e.g., SQS queue fills up, DLQ messages spike)

**Steps:**

1. **Immediate:** Disable feature flag → 100% sync traffic (1-minute rollback)
2. **Investigate:** Check CloudWatch logs, SQS metrics, DLQ messages
3. **Fix:** Apply hotfix (e.g., increase consumer concurrency)
4. **Re-test:** Staging environment load test
5. **Re-deploy:** Gradual rollout again (10% → 100%)

**Rollback Cost:** $0 (sync infrastructure remains in place during transition)

## References

- **Detailed Design:** [async-communication.md](../architecture/async-communication.md)
- **Gap Analysis:** [gap-analysis.md](../architecture/gap-analysis.md)
- **AWS SQS Best Practices:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/best-practices.html
- **Event-Driven Architecture Patterns:** Martin Fowler's Enterprise Integration Patterns
- **Terraform Config:** [infrastructure/terraform/sns-sqs.tf](../../infrastructure/terraform/) _(to be created)_

## Related ADRs

- [ADR-004: Resilience Patterns](./ADR-004-resilience-patterns-circuit-breakers.md) - Circuit breakers for async failures
- [ADR-006: Auto-Scaling Infrastructure](./ADR-006-auto-scaling-infrastructure.md) - Scaling based on SQS metrics
