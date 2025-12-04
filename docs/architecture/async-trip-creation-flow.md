# Async Trip Creation Flow

**Status:** ✅ Implemented  
**Last Updated:** 2025-12-05  
**Module:** A - Scalability (Story 2.1)

---

## Overview

This document explains the complete flow when a user creates a trip request in UIT-GO, including the async driver matching process using SNS/SQS.

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["👤 CLIENT"]
        User["User/Mobile App"]
    end

    subgraph TripSvc["🚗 TRIP SERVICE (Port 3002)"]
        TC["TripController"]
        TS["TripService"]
        TR["TripRepository"]
        TEC["TripEventsConsumer"]
        TES["TripEventsService"]
        DB1[(PostgreSQL<br/>trips table)]
    end

    subgraph SNSTopic["📢 SNS TOPIC: trip-events"]
        SNS["Fan-out to subscribers"]
    end

    subgraph SQSQueues["📬 SQS QUEUES"]
        Q1["driver-match-queue<br/>Filter: TripRequested"]
        Q2["trip-update-queue<br/>Filter: TripMatched,<br/>NoDriversAvailable"]
    end

    subgraph DLQs["💀 DEAD LETTER QUEUES"]
        DLQ1["driver-match-dlq"]
        DLQ2["trip-update-dlq"]
    end

    subgraph DriverSvc["📍 DRIVER SERVICE (Port 3003)"]
        TMC["TripMatchingConsumer"]
        TMS["TripMatchingService"]
        DS["DriversService"]
        Redis[(Redis<br/>driver locations)]
    end

    %% Step 1: User creates trip
    User -->|"① POST /trips"| TC
    TC -->|"② createTrip()"| TS
    TS -->|"③ Save trip<br/>status: REQUESTED"| TR
    TR -->|"④ INSERT"| DB1
    
    %% Step 2: Publish to SNS
    TS -->|"⑤ await publishToTopic()<br/>TripRequested event"| SNS
    
    %% Step 3: Return to user
    TS -->|"⑥ Return trip"| TC
    TC -->|"⑦ HTTP 201<br/>status: REQUESTED"| User

    %% SNS Fan-out
    SNS -->|"Filter: TripRequested"| Q1
    SNS -->|"Filter: TripMatched,<br/>NoDriversAvailable"| Q2

    %% DLQ connections
    Q1 -.->|"After 3 failures"| DLQ1
    Q2 -.->|"After 3 failures"| DLQ2

    %% Step 4: Driver matching
    Q1 -->|"⑧ Poll messages"| TMC
    TMC -->|"⑨ matchDriverForTrip()"| TMS
    TMS -->|"⑩ searchNearbyDrivers()<br/>Retry: 3km→5km→7km"| DS
    DS -->|"⑪ GEORADIUS"| Redis

    %% Step 5: Publish result
    TMS -->|"⑫ TripMatched OR<br/>NoDriversAvailable"| SNS

    %% Step 6: Update trip
    Q2 -->|"⑬ Poll messages"| TEC
    TEC -->|"⑭ handleEvent()"| TES
    TES -->|"⑮ Update trip status"| TR
    TR -->|"⑯ UPDATE"| DB1

    %% User polls for status
    User -.->|"GET /trips/:id<br/>(polling)"| TC

    classDef userBox fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000000
    classDef tripBox fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000000
    classDef snsBox fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
    classDef sqsBox fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000000
    classDef dlqBox fill:#ffcdd2,stroke:#b71c1c,stroke-width:2px,color:#000000
    classDef driverBox fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000000
    classDef dbBox fill:#fff9c4,stroke:#f57f17,stroke-width:2px,color:#000000

    class User userBox
    class TC,TS,TR,TEC,TES tripBox
    class SNS snsBox
    class Q1,Q2 sqsBox
    class DLQ1,DLQ2 dlqBox
    class TMC,TMS,DS driverBox
    class DB1,Redis dbBox
```

---

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤 User
    participant TS as 🚗 TripService
    participant DB as 🗄️ PostgreSQL
    participant SNS as 📢 SNS Topic
    participant Q1 as 📬 driver-match-queue
    participant Q2 as 📬 trip-update-queue
    participant DS as 📍 DriverService
    participant Redis as 🔴 Redis

    Note over U,Redis: PHASE 1: Trip Creation (Sync)
    
    U->>+TS: POST /trips (pickup, destination)
    TS->>TS: Calculate distance & fare
    TS->>+DB: INSERT trip (status: REQUESTED)
    DB-->>-TS: Trip created
    
    TS->>+SNS: await publish(TripRequested)
    SNS-->>-TS: Published ✓
    
    TS-->>-U: HTTP 201 {tripId, status: REQUESTED}
    
    Note over U,Redis: PHASE 2: Driver Matching (Async)
    
    SNS->>Q1: Route TripRequested event
    
    loop Poll Queue
        DS->>+Q1: receiveMessages()
        Q1-->>-DS: TripRequested message
    end
    
    Note over DS: Retry Loop (max 3 min)
    
    Note over DS,Redis: Phase 1: 0-30s (every 5s)
    DS->>+Redis: GEORADIUS 3km
    Redis-->>-DS: No drivers
    DS->>DS: Wait 5s
    DS->>+Redis: GEORADIUS 5km
    Redis-->>-DS: No drivers
    DS->>DS: Wait 5s
    DS->>+Redis: GEORADIUS 7km
    Redis-->>-DS: Found drivers!
    
    DS->>+SNS: await publish(TripMatched)
    SNS-->>-DS: Published ✓
    DS->>Q1: deleteMessage()
    
    Note over U,Redis: PHASE 3: Trip Update (Async)
    
    SNS->>Q2: Route TripMatched event
    
    loop Poll Queue
        TS->>+Q2: receiveMessages()
        Q2-->>-TS: TripMatched message
    end
    
    TS->>+DB: UPDATE trip SET status='DRIVER_ASSIGNED', driverId=...
    DB-->>-TS: Updated ✓
    TS->>Q2: deleteMessage()
    
    Note over U,Redis: PHASE 4: User Polls Status
    
    U->>+TS: GET /trips/:id
    TS->>+DB: SELECT trip
    DB-->>-TS: Trip data
    TS-->>-U: {status: DRIVER_ASSIGNED, driver: {...}}
```

---

## Flow Details

### Phase 1: Trip Creation (Synchronous)

| Step | Component | Action | Duration |
|------|-----------|--------|----------|
| ① | User → TripController | `POST /trips` with pickup & destination | - |
| ② | TripController → TripService | `createTrip()` | - |
| ③ | TripService | Calculate distance & estimated fare | ~5ms |
| ④ | TripService → PostgreSQL | Save trip with `status: REQUESTED` | ~20ms |
| ⑤ | TripService → SNS | **await** `publishToTopic(TripRequested)` | ~50-100ms |
| ⑥⑦ | TripService → User | Return trip (HTTP 201) | - |

**Total response time:** ~100-150ms

**Key Point:** We `await` the SNS publish to ensure the message is delivered. If publish fails, trip is cancelled and user sees error.

---

### Phase 2: Driver Matching (Asynchronous)

| Step | Component | Action | Duration |
|------|-----------|--------|----------|
| ⑧ | TripMatchingConsumer | Poll `driver-match-queue` | Long-polling 5s |
| ⑨ | TripMatchingConsumer → TripMatchingService | `matchDriverForTrip()` | - |
| ⑩⑪ | TripMatchingService → DriversService → Redis | Search nearby drivers | ~10-50ms per attempt |
| ⑫ | TripMatchingService → SNS | Publish result event | ~50ms |

**Retry Strategy:**

```
┌─────────────────────────────────────────────────────────────────┐
│  RETRY CONFIGURATION                                            │
├─────────────────────────────────────────────────────────────────┤
│  Total Duration: 3 minutes max                                  │
│                                                                 │
│  Phase 1 (0-30s):                                               │
│    • Interval: every 5 seconds                                  │
│    • Radius: 3km → 5km → 7km (expands every 10s)               │
│                                                                 │
│  Phase 2 (30s-2min):                                            │
│    • Interval: every 10 seconds                                 │
│    • Radius: 7km (max)                                          │
│                                                                 │
│  Phase 3 (2min-3min):                                           │
│    • Interval: every 15 seconds                                 │
│    • Radius: 7km (max)                                          │
│                                                                 │
│  Timeout: Publish NoDriversAvailable event                      │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Trip Status Update (Asynchronous)

| Step | Component | Action |
|------|-----------|--------|
| ⑬ | TripEventsConsumer | Poll `trip-update-queue` |
| ⑭ | TripEventsConsumer → TripEventsService | Route by `eventType` |
| ⑮⑯ | TripEventsService → PostgreSQL | Update trip status |

**Event Handling:**

| Event Type | Handler | Trip Status Update |
|------------|---------|-------------------|
| `TripMatched` | `handleTripMatched()` | `REQUESTED` → `DRIVER_ASSIGNED` |
| `NoDriversAvailable` | `handleNoDriversAvailable()` | `REQUESTED` → `NO_DRIVERS_AVAILABLE` |

---

## Event Payloads

### TripRequested Event

```json
{
  "eventType": "TripRequested",
  "tripId": "uuid-xxxx",
  "passengerId": "user-uuid",
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "268 Lý Thường Kiệt, Q.10",
  "destinationLatitude": 10.773167,
  "destinationLongitude": 106.660879,
  "destinationAddress": "KTX Khu B ĐHQG",
  "estimatedFare": 25000,
  "estimatedDistance": 2.5,
  "requestedAt": "2025-12-05T10:30:00.000Z"
}
```

### TripMatched Event

```json
{
  "eventType": "TripMatched",
  "tripId": "uuid-xxxx",
  "driverId": "driver-uuid",
  "passengerId": "user-uuid",
  "driverDistance": 1.2,
  "matchedAt": "2025-12-05T10:30:15.000Z"
}
```

### NoDriversAvailable Event

```json
{
  "eventType": "NoDriversAvailable",
  "tripId": "uuid-xxxx",
  "passengerId": "user-uuid",
  "searchAttempts": 25,
  "searchDurationMs": 180000,
  "maxRadiusKm": 7,
  "failedAt": "2025-12-05T10:33:00.000Z"
}
```

---

## Error Handling

### Error Flow Diagram

```mermaid
flowchart TB
    subgraph TripCreation["Trip Creation Errors"]
        E1["SNS Publish Fails"]
        E1 --> A1["Cancel trip in DB"]
        A1 --> A2["Return error to user"]
        A2 --> A3["User can retry"]
    end

    subgraph DriverMatching["Driver Matching Errors"]
        E2["Redis/Search Fails"]
        E2 --> B1["Try publish NoDriversAvailable"]
        B1 --> B1a{Success?}
        B1a -->|Yes| B2["Message deleted<br/>User notified"]
        B1a -->|No| B3["Throw error"]
        B3 --> B4["SQS retries (3x)"]
        B4 --> B5["Message → DLQ"]
    end

    subgraph TripUpdate["Trip Update Errors"]
        E3["DB Update Fails"]
        E3 --> C1["Throw error"]
        C1 --> C2["SQS retries (3x)"]
        C2 --> C3["Message → DLQ"]
    end
```

### Error Summary Table

| Error Location | Error Type | Handling | User Impact |
|----------------|------------|----------|-------------|
| Trip Creation | SNS publish fails | Cancel trip, return error | Sees error, can retry |
| Driver Matching | Redis unavailable | Publish `NoDriversAvailable` | Sees "no drivers" |
| Driver Matching | SNS publish fails | SQS retry 3x → DLQ | May have delay |
| Trip Update | DB update fails | SQS retry 3x → DLQ | Status update delayed |

---

## Trip Status State Machine

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: User creates trip
    
    REQUESTED --> DRIVER_ASSIGNED: TripMatched event
    REQUESTED --> NO_DRIVERS_AVAILABLE: NoDriversAvailable event
    REQUESTED --> CANCELLED: SNS publish fails OR User cancels
    
    DRIVER_ASSIGNED --> EN_ROUTE_TO_PICKUP: Driver starts trip
    DRIVER_ASSIGNED --> CANCELLED: Driver/User cancels
    
    EN_ROUTE_TO_PICKUP --> ARRIVED_AT_PICKUP: Driver arrives
    
    ARRIVED_AT_PICKUP --> IN_PROGRESS: Passenger picked up
    ARRIVED_AT_PICKUP --> CANCELLED: No-show
    
    IN_PROGRESS --> COMPLETED: Trip finished
    
    COMPLETED --> [*]
    CANCELLED --> [*]
    NO_DRIVERS_AVAILABLE --> [*]
```

---

## SNS/SQS Configuration

### Topic & Queue Setup

```
┌─────────────────────────────────────────────────────────────────┐
│  SNS TOPIC: trip-events                                         │
│  ARN: arn:aws:sns:us-east-1:000000000000:trip-events           │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ driver-match-   │  │ trip-update-    │  │ (Future)        │
│ queue           │  │ queue           │  │ analytics-queue │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ Filter:         │  │ Filter:         │  │ Filter:         │
│ TripRequested   │  │ TripMatched,    │  │ All events      │
│                 │  │ NoDriversAvail. │  │                 │
├─────────────────┤  ├─────────────────┤  └─────────────────┘
│ Consumer:       │  │ Consumer:       │
│ DriverService   │  │ TripService     │
├─────────────────┤  ├─────────────────┤
│ DLQ:            │  │ DLQ:            │
│ driver-match-   │  │ trip-update-    │
│ dlq             │  │ dlq             │
│ maxReceive: 3   │  │ maxReceive: 3   │
└─────────────────┘  └─────────────────┘
```

### Filter Policies

| Queue | Filter Policy | Events Received |
|-------|---------------|-----------------|
| `driver-match-queue` | `{"eventType": ["TripRequested"]}` | TripRequested only |
| `trip-update-queue` | `{"eventType": ["TripMatched", "NoDriversAvailable"]}` | TripMatched, NoDriversAvailable |

---

## Monitoring & Observability

### Key Metrics to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Queue depth | SQS `ApproximateNumberOfMessages` | > 100 messages |
| DLQ messages | SQS DLQ count | > 0 |
| Message age | SQS `ApproximateAgeOfOldestMessage` | > 60 seconds |
| Publish latency | Application logs | > 500ms |
| Match success rate | Application logs | < 80% |

### Log Examples

```json
// Trip created
{"level":"log","message":"Trip created, publishing event...","tripId":"xxx","passengerId":"yyy"}

// SNS published
{"level":"log","message":"TripRequested event published successfully","tripId":"xxx","publishDurationMs":45}

// Driver matching started
{"level":"log","message":"🔍 Starting driver matching with retry strategy...","tripId":"xxx","maxDuration":"180s"}

// Retry attempt
{"level":"log","message":"🔄 Attempt #3: Searching within 5km...","tripId":"xxx","elapsed":"15s"}

// Driver found
{"level":"log","message":"✅ Driver matched successfully","tripId":"xxx","driverId":"zzz","attemptCount":5}

// No drivers
{"level":"warn","message":"❌ No drivers found after exhausting all retries","tripId":"xxx","totalAttempts":25}
```

---

## Related Documents

- [ADR-001: Event-Driven Async Communication](../../Deliverables/ADR/ADR-001-async-communication.md)
- [LocalStack Setup Script](../../infrastructure/localstack/init-story-2.1-resources.sh)
- [Trip Matching Service](../../services/driver-service/src/trip-matching/trip-matching.service.ts)
- [Trip Events Consumer](../../services/trip-service/src/trip-events/trip-events.consumer.ts)
