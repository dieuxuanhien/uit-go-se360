# ADR-001: Asynchronous Inter-Service Communication

**Status:** ✅ Accepted  
**Date:** 2025-12-17  
**Decision Makers:** Architecture Team

## Context

The system currently uses synchronous HTTP calls between services for driver-trip matching. TripService calls DriverService and blocks waiting for a response.

**Current flow:**
```
User → TripService → HTTP call → DriverService → DB query
                      ↓ (blocks 2-5s)
User ← TripService ← Response ← DriverService ← Result
```

**Problems:**
- **Tight coupling** - TripService fails if DriverService is down
- **Latency Chaining** - TripService response time = DriverService latency + Network overhead
- **Cascading failures** - Slow DriverService causes timeouts in TripService
- **Coupled Scalability** - Ingestion capacity is tied to processing capacity
  ```
  The Scaling Bottleneck (Push vs Pull):
  
  1. Synchronous (Push Model):
     → TripService pushes load directly to DriverService.
     → If we scale TripService to accept 10x traffic, DriverService MUST scale to 10x immediately.
     → If DriverService cannot handle the spike, requests fail.
     → Result: We are forced to scale DriverService to match Peak Ingestion Rate.
  
  2. Asynchronous (Pull Model):
     → TripService pushes to a Queue (Buffer). DriverService pulls when ready.
     → TripService can scale to handle 10x traffic spike (High Ingestion).
     → DriverService can stay at 1x capacity and process the backlog over time (Load Leveling).
     → Result: We can scale DriverService based on Average Processing Rate, not Peak Ingestion.
  ```

We need asynchronous communication to decouple services, improve resilience, and enable independent scaling.

## Decision

Adopt **AWS SNS/SQS** for asynchronous inter-service communication.

**New flow:**
```
User → TripService → Publish to SNS → Returns immediately (50ms)
                           ↓
                        SNS Topic
                           ↓
                     SQS Queue (buffered)
                           ↓
                     DriverService polls → Processes match → Publishes result
```

**Architecture:**
- Producers publish events to SNS topics
- SNS fans out to multiple SQS queues
- Consumers poll SQS queues independently
- Dead Letter Queues (DLQ) capture failed messages

**Example event:**
```json
{
  "eventType": "TripRequested",
  "tripId": "trip-123",
  "userId": "user-456",
  "pickupLocation": {"lat": 10.762622, "lng": 106.660172},
  "timestamp": "2025-12-17T10:30:00Z"
}
```

**Configuration:**
- Standard SQS queues (at-least-once delivery)
- Message retention: 14 days
- Visibility timeout: 30 seconds
- Auto-retry: 3 attempts before DLQ

## Options Considered

### Option 1: AWS SNS/SQS (Chosen)

**Strengths:**
- Fully managed (no operational overhead)
- Built-in durability and availability
- Simple pub/sub with fan-out capability
- Straightforward integration with AWS services
- DLQ support for error handling
- Low latency for standard use cases

**Weaknesses:**
- At-least-once delivery requires idempotent handlers
- No message ordering in standard queues
- Limited visibility into message flow
- No native event replay capability

**Trade-offs:**
- Eventual consistency model
- AWS vendor lock-in
- Additional AWS services to monitor

### Option 2: Apache Kafka / Amazon MSK

**Strengths:**
- High throughput (1M+ TPS)
- Strong ordering guarantees per partition
- Event replay capability
- Rich ecosystem and tooling
- Event streaming and processing support

**Weaknesses:**
- Significant operational complexity
- Requires cluster management and monitoring
- Steeper learning curve
- Higher infrastructure cost
- Overkill for current requirements

**Trade-offs:**
- Over-engineering for current scale
- Team lacks Kafka expertise
- Longer implementation time

**Verdict:** ❌ Rejected - Complexity and cost not justified for current needs

### Option 3: RabbitMQ

**Strengths:**
- Flexible routing (exchanges, bindings)
- Mature technology with strong community
- Supports multiple messaging patterns
- Message prioritization capabilities

**Weaknesses:**
- Self-hosted operational burden (clustering, HA, backups)
- Manual capacity planning and scaling
- Team lacks RabbitMQ operational experience
- Risk of data loss if misconfigured
- No managed service option in current infrastructure

**Trade-offs:**
- Operational overhead vs control
- Cost of self-hosting vs managed service
- Team focus on infrastructure vs business logic

**Verdict:** ❌ Rejected - Operational burden outweighs benefits

## Consequences

### Benefits

✅ **Decoupled services** - Services communicate without direct dependencies
```
Example: DriverService down? TripService still accepts requests → queued
```

✅ **Improved resilience** - Failures isolated, no cascading effects
```
Example: Failed match → auto-retry 3x → moves to DLQ → manual review
```

✅ **Independent scaling** - Services scale based on their own load
```
Example: 1000 trip requests → TripService scales up
         Only 100 drivers available → DriverService handles at its own pace
```

✅ **Burst handling** - Queue absorbs traffic spikes
```
Example: 5000 requests in 1 minute → all queued → processed over 5 minutes
```

✅ **Multi-consumer support** - SNS enables fan-out to multiple services
```
Example: TripRequested event → DriverService + AnalyticsService + NotificationService
```

### Drawbacks

⚠️ **Eventual consistency** - Results not immediately available
```
Example: User sees "Finding driver..." (immediate)
         → 2s later → "Driver John matched!" (eventual)
```

⚠️ **Idempotency required** - Must handle duplicate messages
```
Example: Same TripRequested processed twice → check if trip already matched
Code: if (trip.status !== 'PENDING') return; // skip duplicate
```

⚠️ **Debugging complexity** - Event-driven patterns harder to trace
```
Example: Failed trip → check TripService logs → SNS metrics → SQS DLQ → DriverService logs
Need: Correlation IDs across all services
```

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Message loss | SQS persistence, DLQ, CloudWatch alarms |
| Duplicate processing | Idempotent handlers, unique message IDs |
| Queue backlog | Auto-scaling based on queue metrics |
| Debugging complexity | Distributed tracing, correlation IDs |

## Implementation Notes

- Use SQS FIFO queues only if strict ordering required
- Implement idempotent message handlers
- Set up CloudWatch alarms for DLQ depth
- Use correlation IDs for distributed tracing
- Gradual rollout with feature flags

## References

- [AWS SQS Best Practices](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/best-practices.html)
- [Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/)
