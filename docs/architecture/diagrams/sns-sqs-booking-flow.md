# SNS/SQS Booking Flow Architecture

**Status:** ✅ Implemented  
**Last Updated:** 2025-12-12  
**Module:** A - Scalability (ADR-001: Async Communication)

---

## Architecture Overview Diagram

```mermaid
flowchart TB
    subgraph CLIENT["👤 CLIENT"]
        Passenger["Passenger App"]
        DriverApp["Driver App"]
    end

    subgraph TRIP_SERVICE["🚗 TRIP SERVICE"]
        TS["TripService<br/>(Port 3002)"]
        TEC["TripEventsConsumer"]
    end

    subgraph USER_SERVICE["👤 USER SERVICE"]
        US["UserService<br/>(Port 3001)"]
    end

    subgraph DRIVER_SERVICE["📍 DRIVER SERVICE"]
        DS["DriverService<br/>(Port 3003)"]
        TMC["TripMatchingConsumer"]
        Redis[(Redis<br/>Driver Locations)]
    end

    subgraph SNS_TOPIC["📢 SNS TOPIC"]
        SNS["trip-events<br/>Fan-out Pattern"]
    end

    subgraph SQS_QUEUES["📬 SQS QUEUES"]
        Q1["driver-match-queue"]
        Q2["trip-update-queue"]
    end

    subgraph DEAD_LETTER_QUEUES["💀 DEAD LETTER QUEUES"]
        DLQ1["driver-match-dlq"]
        DLQ2["trip-update-dlq"]
    end

    subgraph NOTIFICATION["🔔 PUSH NOTIFICATION"]
        Push["FCM / APNs"]
    end

    %% Passenger creates trip
    Passenger -->|"POST /trips"| TS
    Passenger -->|"POST /login"| US
    TS -->|"201 Trip Created<br/>(status: REQUESTED)"| Passenger

    %% Passenger polls for status updates (every 5s)
    Passenger -.->|"GET /trips/:id<br/>(Poll every 5s)"| TS
    TS -.->|"Trip status<br/>(REQUESTED → DRIVER_ASSIGNED)"| Passenger

    %% TripService publishes TripRequested to SNS
    TS -->|"SNS Publish<br/>(TripRequested)"| SNS

    %% SNS Fan-out to SQS queues
    SNS -->|"Filter: TripRequested"| Q1
    SNS -->|"Filter: TripMatched,<br/>NoDriversAvailable"| Q2

    %% DriverService polls driver-match-queue
    Q1 -->|"Poll & Process"| TMC
    TMC --> DS
    DS -->|"searchNearbyDrivers<br/>GEORADIUS"| Redis
    Redis -->|"Return drivers list"| DS

    %% DriverService notifies nearby drivers
    DS -->|"Notify Nearby Drivers"| Push
    Push -.->|"🔔 New Trip Request!"| DriverApp

    %% Driver accepts trip
    DriverApp -->|"POST /trips/:id/accept"| DS

    %% DriverService publishes result to SNS
    DS -->|"SNS Publish<br/>(TripMatched)"| SNS

    %% TripService polls trip-update-queue
    Q2 -->|"Poll & Process"| TEC
    TEC -->|"Update Trip Status"| TS

    %% DLQ connections
    Q1 -.->|"maxReceiveCount: 3"| DLQ1
    Q2 -.->|"maxReceiveCount: 3"| DLQ2

    %% Styling
    classDef passengerBox fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#000
    classDef driverAppBox fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000
    classDef tripBox fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000
    classDef userBox fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000
    classDef driverBox fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000
    classDef snsBox fill:#fff8e1,stroke:#f9a825,stroke-width:2px,color:#000
    classDef sqsBox fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
    classDef dlqBox fill:#ffcdd2,stroke:#c62828,stroke-width:2px,color:#000
    classDef redisBox fill:#ffebee,stroke:#d32f2f,stroke-width:2px,color:#000
    classDef notifBox fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#000

    class Passenger passengerBox
    class DriverApp driverAppBox
    class TS,TEC tripBox
    class US userBox
    class DS,TMC driverBox
    class SNS snsBox
    class Q1,Q2 sqsBox
    class DLQ1,DLQ2 dlqBox
    class Redis redisBox
    class Push notifBox
```

---

## Component Description

| Component | Port | Description |
|-----------|------|-------------|
| **Passenger App** | - | Mobile app for passengers to create trips and poll status |
| **Driver App** | - | Mobile app for drivers to receive trip notifications and accept |
| **TripService** | 3002 | Handles trip creation, publishes TripRequested events |
| **TripEventsConsumer** | - | Polls trip-update-queue, updates trip status in DB |
| **UserService** | 3001 | Manages authentication and user profiles |
| **DriverService** | 3003 | Manages driver locations, matching, notifications |
| **TripMatchingConsumer** | - | Polls driver-match-queue, triggers driver search |
| **Redis** | 6379 | Stores driver geo-locations (GEORADIUS queries) |
| **FCM/APNs** | - | Push notification services (Firebase/Apple) |
| **trip-events (SNS)** | - | Central pub/sub topic for all trip-related events |
| **driver-match-queue** | - | SQS queue for TripRequested events → Driver matching |
| **trip-update-queue** | - | SQS queue for TripMatched/NoDriversAvailable → Trip updates |
| **Dead Letter Queues** | - | Failed messages after 3 retry attempts |

---

## Event Flow Description

### 1️⃣ Trip Creation Flow (Sync)

```
Passenger → POST /trips → TripService → Save to DB (REQUESTED) → Publish TripRequested to SNS → Return 201
```

### 2️⃣ Passenger Polling (Every 5s)

```
Passenger → GET /trips/:id → TripService → Return current trip status (REQUESTED → DRIVER_ASSIGNED)
```

### 3️⃣ Driver Matching & Notification Flow (Async)

```
SNS (TripRequested) → driver-match-queue → TripMatchingConsumer → DriverService → GEORADIUS Redis → Push Notification to Drivers
```

### 4️⃣ Driver Accept Flow

```
Driver receives push → Driver App → POST /trips/:id/accept → DriverService → Publish TripMatched to SNS
```

### 5️⃣ Trip Status Update Flow (Async)

```
SNS (TripMatched/NoDriversAvailable) → trip-update-queue → TripEventsConsumer → Update trip status in DB
```

---

## Message Flow Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant P as 👤 Passenger App
    participant D as 🚗 Driver App
    participant TS as 🚗 TripService<br/>(Port 3002)
    participant US as 👤 UserService<br/>(Port 3001)
    participant SNS as 📢 SNS: trip-events
    participant Q1 as 📬 driver-match-queue
    participant Q2 as 📬 trip-update-queue
    participant TMC as 📍 TripMatchingConsumer
    participant DS as 📍 DriverService
    participant Redis as 🔴 Redis
    participant Push as 🔔 FCM/APNs
    participant TEC as 🚗 TripEventsConsumer
    participant DLQ1 as 💀 driver-match-dlq
    participant DLQ2 as 💀 trip-update-dlq

    Note over P,DLQ2: PHASE 1: User Authentication
    P->>+US: POST /login
    US-->>-P: 200 OK (JWT Token)

    Note over P,DLQ2: PHASE 2: Trip Creation (Sync - Fast Response ~50ms)
    P->>+TS: POST /trips (pickup, destination)
    TS->>TS: Calculate distance & fare
    TS->>TS: Save trip to DB (status: REQUESTED)
    TS->>+SNS: await publishToTopic(TripRequested)
    SNS-->>-TS: Published ✓
    TS-->>-P: 201 Created {tripId, status: REQUESTED}

    Note over P,DLQ2: PHASE 3: Passenger Polls for Status (every 5s)
    loop Poll Every 5s
        P->>+TS: GET /trips/:id
        TS-->>-P: {status: REQUESTED}
    end

    Note over P,DLQ2: PHASE 4: SNS Fan-out to SQS Queues
    SNS->>Q1: Route to driver-match-queue<br/>(Filter: eventType = TripRequested)
    SNS->>Q2: Route to trip-update-queue<br/>(Filter: eventType = TripMatched | NoDriversAvailable)

    Note over P,DLQ2: PHASE 5: Driver Matching & Notification (Async)
    loop Poll Queue (Long Polling 5s)
        TMC->>+Q1: receiveMessages()
        Q1-->>-TMC: TripRequested message
    end
    
    TMC->>+DS: matchDriverForTrip(event)
    
    Note over DS,Redis: Search Nearby Drivers
    DS->>+Redis: GEORADIUS (3km → 5km → 7km)
    Redis-->>-DS: Nearby drivers list

    alt Drivers Found
        DS->>+Push: Send push to nearby drivers
        Push-->>-D: 🔔 "New trip request nearby!"
        
        Note over D,DS: Driver accepts trip
        D->>+DS: POST /trips/:id/accept
        DS-->>-D: 200 OK (Trip accepted)
        
        DS->>+SNS: publishToTopic(TripMatched)
        SNS-->>-DS: Published ✓
    else No Drivers After 3 min
        DS->>+SNS: publishToTopic(NoDriversAvailable)
        SNS-->>-DS: Published ✓
    end
    
    DS-->>-TMC: Matching complete

    Note over P,DLQ2: PHASE 6: Trip Status Update (Async)
    loop Poll Queue (Long Polling 5s)
        TEC->>+Q2: receiveMessages()
        Q2-->>-TEC: TripMatched/NoDriversAvailable message
    end
    
    alt TripMatched
        TEC->>TS: handleTripMatched(event)
        TS->>TS: Update trip: status=DRIVER_ASSIGNED, driverId
    else NoDriversAvailable
        TEC->>TS: handleNoDriversAvailable(event)
        TS->>TS: Update trip: status=NO_DRIVERS_AVAILABLE
    end

    Note over P,DLQ2: PHASE 7: Passenger Gets Updated Status (Polling)
    P->>+TS: GET /trips/:id
    TS-->>-P: 200 OK {tripId, status: DRIVER_ASSIGNED, driverId}

    Note over P,DLQ2: ERROR HANDLING: Dead Letter Queues
    Q1--xDLQ1: After 3 failed processing attempts
    Q2--xDLQ2: After 3 failed processing attempts
```

---

## Event Types

| Event Type | Publisher | Subscribers | Description |
|------------|-----------|-------------|-------------|
| `TripRequested` | TripService | driver-match-queue | New trip created, needs driver matching |
| `TripMatched` | DriverService | trip-update-queue | Driver found and assigned to trip |
| `NoDriversAvailable` | DriverService | trip-update-queue | No drivers found within retry period |
| `TripCancelled` | TripService | (future) | Trip cancelled by user |
| `TripCompleted` | TripService | (future) | Trip completed successfully |

---

## Queue Configuration

### driver-match-queue
```json
{
  "QueueName": "driver-match-queue",
  "VisibilityTimeout": 30,
  "MessageRetentionPeriod": 345600,
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:us-east-1:000000000000:driver-match-dlq",
    "maxReceiveCount": 3
  }
}
```

### trip-update-queue
```json
{
  "QueueName": "trip-update-queue",
  "VisibilityTimeout": 30,
  "MessageRetentionPeriod": 345600,
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:us-east-1:000000000000:trip-update-dlq",
    "maxReceiveCount": 3
  }
}
```

---

## Benefits of This Architecture

| Benefit | Description |
|---------|-------------|
| ✅ **Non-blocking** | Trip creation returns in ~50ms instead of 2-5s |
| ✅ **Horizontal Scaling** | Services scale independently based on queue depth |
| ✅ **Fault Isolation** | Slow/failed driver searches don't crash TripService |
| ✅ **Automatic Retry** | Failed messages retry with exponential backoff |
| ✅ **Dead Letter Queues** | Poison messages captured for debugging |
| ✅ **Fan-out Pattern** | Single event can trigger multiple subscribers |

---

## Trade-offs

| Trade-off | Impact | Mitigation |
|-----------|--------|------------|
| ⚠️ Eventual Consistency | Trip status updates delayed 100-500ms | Client polling/WebSocket for updates |
| ⚠️ Added Complexity | More infrastructure components | LocalStack for local development |
| ⚠️ Message Ordering | No guaranteed FIFO | Idempotent message handling |
| ⚠️ Debugging Difficulty | Distributed async flow | AWS X-Ray / Correlation IDs |

---

## Related Documents

- [ADR-001: Event-Driven Async Communication](../../adrs/ADR-001-event-driven-async-communication.md)
- [Async Trip Creation Flow](../async-trip-creation-flow.md)
- [Async Communication Architecture](../async-communication.md)
