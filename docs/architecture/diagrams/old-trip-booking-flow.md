# Old Trip Booking Flow (Synchronous Architecture)

This diagram shows the **BEFORE** state - synchronous HTTP calls that block the user request.

## Problems with this architecture:
1. **Thread Blocking**: Trip Service threads are blocked waiting for Driver Service responses
2. **Poor UX**: User waits for the entire flow to complete before getting a response
3. **Cascading Failures**: If Driver Service is slow/down, Trip Service requests pile up
4. **No Scalability**: Each request holds resources until ALL operations complete
5. **Tight Coupling**: Services are tightly coupled via synchronous HTTP calls

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant P as 👤 Passenger
    participant TS as Trip Service
    participant TDB as Trip Database
    participant DS as Driver Service
    participant DDB as Driver Database<br/>(Redis)

    Note over P,DDB: OLD ARCHITECTURE - Synchronous Blocking Calls

    %% Step 1: Passenger requests trip
    P->>+TS: POST /trips<br/>{pickup, dropoff, passengerId}
    
    Note over TS: 🔴 Thread BLOCKED<br/>Waiting for driver search...

    %% Step 2: Synchronous call to find drivers
    TS->>+DS: GET /drivers/search?lat=x&lng=y&radius=5km<br/>⚠️ SYNC HTTP CALL
    
    Note over DS: 🔴 Thread BLOCKED<br/>Querying database...
    
    DS->>+DDB: GEORADIUS nearby_drivers<br/>lat lng 5km
    DDB-->>-DS: [driver1, driver2, ..., driver10]
    
    DS-->>-TS: 200 OK<br/>{drivers: [...], count: 10}
    
    Note over TS: ✓ Got 10 nearby drivers

    %% Step 3: Create trip record
    TS->>+TDB: INSERT trip<br/>(status: PENDING, driverIds: [...])
    TDB-->>-TS: trip_id: "trip-123"
    
    Note over TS: Trip record created

    %% Step 4: Notify drivers and wait for acceptance - sync blocking!
    TS->>+DS: POST /drivers/match<br/>{tripId, driverIds: [...]}<br/>⚠️ SYNC HTTP CALL
    
    Note over DS: 🔴 Thread BLOCKED<br/>Notifying drivers and waiting...
    
    loop For each driver until one accepts
        DS->>DS: Send push notification to driver
        DS->>DS: Wait for driver response...
        Note over DS: Driver 1 rejected or timeout
        DS->>DS: Try next driver...
    end
    
    Note over DS: ✓ Driver 5 accepted!
    
    DS-->>-TS: 200 OK<br/>{driverId: "driver-5", status: "ACCEPTED"}
    
    Note over TS: Driver matched!

    %% Step 5: Update trip with assigned driver
    TS->>+TDB: UPDATE trip SET<br/>status='ASSIGNED', driverId='driver-5'
    TDB-->>-TS: OK

    %% Finally return to user
    TS-->>-P: 201 Created<br/>{tripId: "trip-123", status: "ASSIGNED", driverId: "driver-5"}

    Note over P,DDB: ❌ User blocked entire time waiting for driver assignment!

    %% Show the problem
    rect rgb(255, 200, 200)
        Note over P,DDB: 🚨 PROBLEMS:<br/>1. User waits for driver to accept (could be very long!)<br/>2. Trip Service threads exhausted under load<br/>3. If no driver accepts → user waits until timeout<br/>4. No way to cancel mid-request<br/>5. Cascading failures across services
    end
```

## Flow Summary

| Step | Operation | Issue |
|------|-----------|-------|
| 1 | Passenger calls POST /trips | Request starts |
| 2 | Trip Service → Driver Service (search) | 🔴 Sync blocking call |
| 3 | Create trip in database | DB write |
| 4 | Trip Service → Driver Service (notify) | 🔴 Sync blocking call with loop |
| 5 | Update trip status | DB write |
| 6 | Return response to passenger | User finally unblocked |

## Why This Fails Under Load

```
High Request Rate + Long Request Duration = Thread Pool Exhaustion

→ All threads blocked waiting for sync calls
→ New requests queue up
→ Latency increases exponentially  
→ Timeouts cascade across services
→ System collapse
```

## The Solution: Event-Driven Architecture

See [async-communication.md](../async-communication.md) for the new architecture using SNS/SQS that:
- Returns to user immediately after trip creation
- Processes driver matching asynchronously via message queue
- Handles failures with retry/DLQ
- Scales horizontally
