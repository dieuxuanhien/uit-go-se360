# Solution 1: Asynchronous Decoupling (The "Circuit Breaker" for Traffic)

## 1. The Essence of the Problem: "Temporal Coupling"
The root cause of the crash described in *Critical Bottlenecks* is not "slow code" or "bad servers." It is **Temporal Coupling**.

*   **Definition:** Service A (Trip) *cannot finish* until Service B (Driver) finishes.
*   **The Physics:** If Service B slows down by 1 second, Service A *must* hold its memory for 1 extra second.
*   **The Failure Mode:** During a spike, Service B slows down. Service A holds thousands of connections. RAM fills up. Service A crashes.

## 2. The Architectural Solution: "Fire-and-Forget"
We must break the temporal link. Service A should hand off the work and *immediately* return success to the user.

### The Pattern: Event-Driven Handoff
1.  **Trip Service (Producer):**
    *   Receives request.
    *   Validates input.
    *   Saves "Trip Requested" to DB.
    *   **Publishes Event:** `TripRequested` -> Event Bus.
    *   **Returns:** "202 Accepted" (Trip ID).
    *   *Time taken:* 50ms (Constant).

2.  **The Event Bus (The Buffer):**
    *   Stores the message safely.
    *   **The "Dam" Effect:** If 10,000 requests come in 1 second, the Bus accepts them all. It does not crash.

3.  **Driver Service (Consumer):**
    *   **Pulls** messages from the Bus.
    *   **The "Valve" Effect:** It processes 50 messages/second (or whatever it can handle).
    *   *Result:* The Driver Service is never overwhelmed. It works at 100% capacity, but never 101%.

## 3. Why This Fixes the Crash
*   **Decoupling:** Trip Service latency is now independent of Driver Service latency.
*   **Spike Absorption:** The Queue absorbs the "Blast Radius" of the traffic spike.
*   **Resource Protection:** No service ever holds a connection open while waiting for another.

## 4. Technology Selection (The Implementation Detail)
We need a durable Event Bus. The choice is secondary to the pattern, but we select based on **Operational Simplicity**.

*   **Option A: Kafka (The "Ferrari")**
    *   *Pros:* Extremely high throughput, replayable logs.
    *   *Cons:* High operational complexity (Zookeeper, partitions), expensive to run idle.
    *   *Verdict:* **Overkill** for our scale (10k RPS).

*   **Option B: RabbitMQ (The "Sedan")**
    *   *Pros:* Low latency, flexible routing.
    *   *Cons:* Requires manual cluster management, can lose messages if crashed.
    *   *Verdict:* **Too much maintenance**.

*   **Option C: AWS SQS + SNS (The "Taxi")**
    *   *Pros:* Fully managed (Serverless), infinite scaling, Dead Letter Queues built-in.
    *   *Cons:* Slightly higher latency (10-50ms) than Kafka.
    *   *Verdict:* **Selected.** We use **SNS** for fan-out (broadcasting events) and **SQS** for buffering (protecting the consumer). It is the simplest, most robust tool for the job.

## 5. Implementation Strategy

We implement the **Fan-Out Pattern** using SNS and SQS.

### A. Infrastructure Topology (`infrastructure/localstack/init-story-2.1-resources.sh`)
1.  **SNS Topic (`trip-events`):** The "Megaphone". Trip Service shouts here.
2.  **SQS Queue (`driver-match-queue`):** The "Inbox". Subscribed to the SNS Topic. It holds messages for the Driver Service.
3.  **Dead Letter Queue (DLQ):** The "Trash Can". If a message fails 3 times, it goes here so we can inspect it later.

#### SNS Filter Policy (Routing at the Bus Level)
We don't send ALL events to ALL queues. SNS filters messages based on `eventType`:

```bash
# Subscribe driver-match-queue (filter: TripRequested events ONLY)
awslocal sns subscribe \
  --topic-arn "$TRIP_EVENTS_TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$DRIVER_MATCH_QUEUE_ARN" \
  --attributes '{"FilterPolicy":"{\"eventType\":[\"TripRequested\"]}"}'

# Subscribe trip-update-queue (filter: TripMatched, NoDriversAvailable)
awslocal sns subscribe \
  --attributes '{"FilterPolicy":"{\"eventType\":[\"TripMatched\",\"NoDriversAvailable\"]}"}'
```

*   **Why:** Reduces noise. Driver Service doesn't receive "TripMatched" events meant for Trip Service.
*   **Benefit:** Lower SQS costs and faster processing (no wasted reads).

### B. The Code Flow

#### 1. Producer (Trip Service)
Instead of calling `DriverService` directly, we publish a message using our AWS utility wrapper.
```typescript
// trips.service.ts
import { publishToTopic, getTopicArn } from '../common/aws.utils';

async createTrip(dto: CreateTripDto) {
  // 1. Save to DB (Status: REQUESTED)
  const trip = await this.repo.create(dto);

  // 2. Publish Event (Async)
  // We construct the ARN dynamically using a helper (no env var needed)
  const topicArn = getTopicArn('trip-events'); 
  
  await publishToTopic(
    topicArn,
    {
      eventType: 'TripRequested',
      tripId: trip.id,
      pickup: { lat: dto.lat, lng: dto.lng }
    },
    'Trip Requested - Find Drivers'
  );

  // 3. Return immediately
  return { id: trip.id, status: 'REQUESTED' };
}
```

#### 2. Consumer (Driver Service)
A background worker constantly pulls from the queue using our AWS utility wrapper.
```typescript
// trip-matching.consumer.ts
import { receiveMessages, deleteMessage } from '../common/aws.utils';

@Injectable()
export class TripMatchingConsumer {
  // Long Polling Loop
  async startPolling() {
    while (this.isRunning) {
      try {
        // 1. Receive Messages (Batch of 10)
        const messages = await receiveMessages(this.queueUrl, 10);

        for (const msg of messages) {
          try {
            // 2. Parse SNS Envelope (Critical Step)
            // Since we use SNS-to-SQS subscription, the actual event is inside "Message"
            const snsMessage = JSON.parse(msg.Body);
            const event = JSON.parse(snsMessage.Message);

            // 3. Do the heavy work (with Retry Logic)
            // Phase 1 (0-30s): Retry every 5s (3km -> 5km -> 7km)
            await this.matchingService.matchDriverForTrip(event);
            
            // 4. ACK (Delete message)
            if (msg.ReceiptHandle) {
              await deleteMessage(this.queueUrl, msg.ReceiptHandle);
            }
          } catch (error) {
            // 5. On Error: Do nothing (SQS Visibility Timeout handles retry)
          }
        }
      } catch (error) {
        // Handle polling errors
      }
    }
  }
}
```

#### 3. The Retry Strategy (Expanding Radius)
The matching service doesn't just try once. It implements a **3-phase retry with expanding search radius**:

```typescript
// trip-matching.service.ts
const RETRY_CONFIG = {
  maxDurationMs: 3 * 60 * 1000,     // 3 minutes total
  phase1DurationMs: 30 * 1000,       // First 30 seconds
  phase2DurationMs: 2 * 60 * 1000,   // 30s to 2min
  phase1IntervalMs: 5 * 1000,        // Retry every 5s
  phase2IntervalMs: 10 * 1000,       // Retry every 10s
  phase3IntervalMs: 15 * 1000,       // Retry every 15s
  searchRadii: [3, 5, 7],            // km - expanding radius
};
```

**Timeline:**
| Time | Phase | Radius | Interval | Rationale |
|------|-------|--------|----------|-----------|
| 0-30s | 1 | 3km→5km→7km | 5s | Aggressive - drivers are nearby |
| 30s-2m | 2 | 7km | 10s | Moderate - wait for drivers to become available |
| 2m-3m | 3 | 7km | 15s | Final attempts before giving up |

*   **Why Expanding Radius:** Starting small (3km) finds the closest drivers first. Expanding only if needed.
*   **Why 3-Minute Limit:** User experience. Beyond 3 minutes, user will likely cancel anyway.

## 6. Trade-offs & Mitigation Roadmap

Every architectural choice has a cost. By choosing **Event-Driven Architecture**, we gained massive scalability but accepted **Operational Complexity** and **Eventual Consistency**. Below is our plan to mitigate these trade-offs in Phase 2.

### A. Trade-off: The "Eventual Consistency" Gap
*   **The Cost:** The user gets a "Trip Created" success message, but no driver has been found yet. There is a 5-30 second gap where the UI shows "Searching...".
*   **Risk:** If the matching service fails silently (or the queue gets stuck), the user waits forever without feedback.
*   **Mitigation (Future):** Implement **WebSockets** (Socket.io) to push real-time updates ("Driver Found", "Search Failed") to the client, closing the feedback loop.
    *   *New Trade-off:* **Stateful Complexity.** WebSockets require maintaining open connections, making Load Balancing harder (requires Sticky Sessions).
    *   *Counter-Measure:* Use a **Redis Adapter** to broadcast events across multiple WebSocket servers.

### B. Trade-off: "At-Least-Once" Delivery (Duplicates)
*   **The Cost:** SQS guarantees it will deliver a message *at least once*, but sometimes twice (e.g., network timeout during ACK).
*   **Risk:** We might accidentally assign two drivers to the same trip.
*   **Status:** ✅ **MITIGATED (Implemented)**
    *   **Strategy:** **In-Memory Idempotency Set.**
    *   *Logic:* The consumer maintains `processedMessageIds = new Set<string>()`. Before processing, it checks: `if (processedMessageIds.has(messageId)) return`.
    *   *Limitation:* This only works within a single container instance. If the container restarts, the Set is cleared.
    *   **Future Enhancement:** Move idempotency tracking to **Redis** for durability across restarts and across multiple consumer replicas.

### C. Trade-off: Loss of Strict Ordering
*   **The Cost:** Standard SQS does not guarantee FIFO (First-In-First-Out). A trip requested at 10:00:01 might be processed *after* a trip requested at 10:00:02.
*   **Risk:** Minor fairness issues during high load.
*   **Mitigation (Future):** If strict fairness becomes a business requirement, migrate to **SQS FIFO Queues**.
    *   *New Trade-off:* **Throughput Ceiling.** FIFO SQS is limited to ~300 TPS.
    *   *Counter-Measure:* Use **Message Grouping** (e.g., Group ID = Region) to restore parallel processing while maintaining order within a region.

---

## 7. Integration with Other Solutions

Async Decoupling is the **foundation** for all other scalability solutions:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Request Flow (After Async)                     │
├─────────────────────────────────────────────────────────────────────┤
│  User Request                                                       │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐    ┌───────────┐    ┌─────────────────────────┐   │
│  │ Trip Service│───►│ SNS Topic │───►│ SQS Queue               │   │
│  │ (50ms)      │    │ (Fan-Out) │    │ (Buffering)             │   │
│  └─────────────┘    └───────────┘    └───────────┬─────────────┘   │
│       │                                          │                  │
│       │ Returns "202 Accepted"                   │                  │
│       ▼                                          ▼                  │
│  User sees "Searching..."            ┌─────────────────────────┐   │
│                                      │ Driver Service          │   │
│                                      │ (Auto-Scaled by Sol.2)  │   │
│                                      │ + Redis Geo (Sol.3)     │   │
│                                      └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

*   **Solution 2 (Auto-Scaling):** The Driver Service can scale based on **SQS Queue Depth**. More messages = more replicas.
*   **Solution 3 (Caching):** The Driver Service uses **Redis GEORADIUS** for sub-millisecond driver lookups.
*   **Solution 4 (Replicas):** Trip status writes go to Primary; reads can go to Replicas (except "Read-Your-Writes" flows).