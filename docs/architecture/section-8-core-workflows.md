# **SECTION 8: CORE WORKFLOWS**

Illustrating key system workflows using sequence diagrams to show component interactions, error handling, and async operations.

## **8.1 User Registration and Authentication Flow**

```mermaid
sequenceDiagram
    participant Client
    participant ALB
    participant UserService
    participant UserDB as RDS PostgreSQL
    participant Secrets as Secrets Manager

    Note over Client,Secrets: User Registration Flow

    Client->>ALB: POST /users/register<br/>{email, password, role, ...}
    ALB->>UserService: Forward request

    UserService->>UserService: Validate request DTO<br/>(email format, password strength)

    UserService->>UserDB: Check if email exists
    alt Email already exists
        UserDB-->>UserService: User found
        UserService-->>Client: 409 Conflict<br/>{"error": "Email already registered"}
    else Email available
        UserDB-->>UserService: No user found

        UserService->>UserService: Hash password with bcrypt<br/>(salt rounds = 10)
        UserService->>UserDB: INSERT INTO users<br/>(id, email, passwordHash, role, ...)
        UserDB-->>UserService: User created

        UserService->>UserService: Generate JWT token<br/>(payload: userId, role, exp)
        UserService-->>Client: 201 Created<br/>{accessToken, user}
    end

    Note over Client,Secrets: Login Flow

    Client->>ALB: POST /users/login<br/>{email, password}
    ALB->>UserService: Forward request

    UserService->>UserDB: SELECT * FROM users<br/>WHERE email = ?

    alt User not found
        UserDB-->>UserService: NULL
        UserService-->>Client: 401 Unauthorized<br/>{"error": "Invalid credentials"}
    else User found
        UserDB-->>UserService: User record

        UserService->>UserService: Compare password<br/>bcrypt.compare(password, passwordHash)

        alt Password invalid
            UserService-->>Client: 401 Unauthorized<br/>{"error": "Invalid credentials"}
        else Password valid
            UserService->>UserService: Generate JWT token
            UserService-->>Client: 200 OK<br/>{accessToken, user}
        end
    end

    Note over Client,Secrets: Authenticated Request Flow

    Client->>ALB: GET /users/me<br/>Authorization: Bearer <token>
    ALB->>UserService: Forward request with token

    UserService->>UserService: Validate JWT signature<br/>and expiration

    alt Token invalid/expired
        UserService-->>Client: 401 Unauthorized<br/>{"error": "Invalid token"}
    else Token valid
        UserService->>UserService: Extract userId from token
        UserService->>UserDB: SELECT * FROM users<br/>WHERE id = ?
        UserDB-->>UserService: User record
        UserService-->>Client: 200 OK<br/>{user data}
    end
```

---

## **8.2 Driver Registration and Approval Flow**

```mermaid
sequenceDiagram
    participant Client
    participant ALB
    participant UserService
    participant UserDB as RDS PostgreSQL

    Note over Client,UserDB: Driver Creates Profile

    Client->>ALB: POST /users/driver-profile<br/>Authorization: Bearer <token><br/>{vehicleMake, vehicleModel, ...}
    ALB->>UserService: Forward request

    UserService->>UserService: Validate JWT<br/>Extract userId and role

    alt User is not DRIVER
        UserService-->>Client: 403 Forbidden<br/>{"error": "User must be a driver"}
    else User is DRIVER
        UserService->>UserDB: Check if profile exists

        alt Profile already exists
            UserDB-->>UserService: Profile found
            UserService-->>Client: 409 Conflict<br/>{"error": "Profile already exists"}
        else No profile
            UserDB-->>UserService: NULL

            UserService->>UserService: Validate vehicle info<br/>(year range, plate format)

            UserService->>UserDB: INSERT INTO driver_profiles<br/>(userId, vehicleMake, ..., approvalStatus=PENDING)
            UserDB-->>UserService: Profile created

            UserService-->>Client: 201 Created<br/>{driverProfile}

            Note right of UserService: In production, this would<br/>trigger admin notification
        end
    end

    Note over Client,UserDB: Driver Checks Approval Status

    Client->>ALB: GET /users/driver-profile<br/>Authorization: Bearer <token>
    ALB->>UserService: Forward request

    UserService->>UserService: Validate JWT<br/>Extract userId
    UserService->>UserDB: SELECT * FROM driver_profiles<br/>WHERE userId = ?

    alt Profile not found
        UserDB-->>UserService: NULL
        UserService-->>Client: 404 Not Found<br/>{"error": "Driver profile not found"}
    else Profile exists
        UserDB-->>UserService: Profile with status
        UserService-->>Client: 200 OK<br/>{driverProfile, approvalStatus}
    end
```

---

## **8.3 Trip Request and Driver Matching Flow**

```mermaid
sequenceDiagram
    participant Client as Passenger Client
    participant ALB
    participant TripService
    participant TripDB as Trip Database
    participant DriverService
    participant Redis
    participant DriverClient as Driver Client

    Note over Client,DriverClient: Passenger Creates Trip Request

    Client->>ALB: POST /trips<br/>{pickupLat, pickupLng, destLat, destLng, ...}
    ALB->>TripService: Forward request

    TripService->>TripService: Validate JWT<br/>Extract passengerId, verify PASSENGER role

    alt User is not PASSENGER
        TripService-->>Client: 403 Forbidden<br/>{"error": "Only passengers can create trips"}
    else User is PASSENGER
        TripService->>TripService: Calculate distance<br/>Haversine(pickup, destination)

        TripService->>TripService: Estimate fare<br/>baseFare + (distance * ratePerKm)

        TripService->>TripDB: INSERT INTO trips<br/>(passengerId, pickup*, dest*, estimatedFare,<br/>status=REQUESTED)
        TripDB-->>TripService: Trip created with ID

        TripService-->>Client: 201 Created<br/>{trip, estimatedFare}

        Note right of TripService: Async driver search begins

        TripService->>DriverService: GET /drivers/search<br/>?lat={pickupLat}&lng={pickupLng}&radius=5
        DriverService->>Redis: GEORADIUS driver:geo<br/>{pickupLng} {pickupLat} 5 km

        Redis-->>DriverService: List of driverIds with distances

        DriverService->>Redis: MGET driver:location:{driverId}
        Redis-->>DriverService: Driver metadata (isOnline, etc)

        DriverService->>DriverService: Filter online drivers<br/>Sort by distance
        DriverService-->>TripService: {drivers: [{driverId, distance}, ...]}

        alt No nearby drivers found
            TripService->>TripDB: Update trip status=CANCELLED<br/>reason="No drivers available"
            Note right of TripService: In production, would retry<br/>or expand search radius
        else Drivers found
            Note right of TripService: Notify first 3 drivers<br/>(15 second timeout each)

            loop For each driver (max 3)
                TripService-->>DriverClient: Push notification<br/>"New trip request: {tripId}"
                Note right of DriverClient: Driver has 15 seconds<br/>to accept or decline
            end
        end
    end
```

---

## **8.4 Driver Accepts Trip and Completes Journey**

```mermaid
sequenceDiagram
    participant DriverClient as Driver Client
    participant ALB
    participant TripService
    participant TripDB as Trip Database
    participant UserService
    participant PassengerClient as Passenger Client

    Note over DriverClient,PassengerClient: Driver Accepts Trip

    DriverClient->>ALB: POST /trips/{tripId}/accept<br/>Authorization: Bearer <token>
    ALB->>TripService: Forward request

    TripService->>TripService: Validate JWT<br/>Extract driverId, verify DRIVER role

    TripService->>UserService: GET /users/{driverId}<br/>(internal API call)
    UserService-->>TripService: {user, driverProfile}

    alt Driver not approved
        TripService-->>DriverClient: 403 Forbidden<br/>{"error": "Driver not approved"}
    else Driver approved
        TripService->>TripDB: SELECT * FROM trips WHERE id=?<br/>FOR UPDATE (pessimistic lock)

        alt Trip already assigned
            TripDB-->>TripService: Trip with driverId != null
            TripService-->>DriverClient: 409 Conflict<br/>{"error": "Trip already taken"}
        else Trip still available
            TripDB-->>TripService: Trip with status=REQUESTED

            TripService->>TripService: Validate state transition<br/>REQUESTED → DRIVER_ASSIGNED

            TripService->>TripDB: UPDATE trips SET<br/>driverId=?, status=DRIVER_ASSIGNED,<br/>driverAssignedAt=NOW()
            TripDB-->>TripService: Updated

            TripService-->>DriverClient: 200 OK<br/>{trip with driver info}

            Note right of TripService: Notify passenger
            TripService-->>PassengerClient: "Driver assigned: {driverName}"
        end
    end

    Note over DriverClient,PassengerClient: Driver Picks Up Passenger

    DriverClient->>ALB: POST /trips/{tripId}/start
    ALB->>TripService: Forward request

    TripService->>TripDB: UPDATE trips SET<br/>status=IN_PROGRESS,<br/>startedAt=NOW()
    TripDB-->>TripService: Updated
    TripService-->>DriverClient: 200 OK<br/>{trip}

    Note right of DriverClient: During trip: Driver updates<br/>location every 5-10 seconds

    loop Every 5-10 seconds
        DriverClient->>ALB: PUT /drivers/location<br/>{lat, lng, heading, speed}
        ALB->>TripService: Could query for real-time tracking
        Note right of PassengerClient: Passenger sees driver<br/>location on map
    end

    Note over DriverClient,PassengerClient: Driver Completes Trip

    DriverClient->>ALB: POST /trips/{tripId}/complete
    ALB->>TripService: Forward request

    TripService->>TripService: Validate state transition<br/>IN_PROGRESS → COMPLETED

    TripService->>TripService: Calculate actual fare<br/>(could differ from estimate)

    TripService->>TripDB: UPDATE trips SET<br/>status=COMPLETED,<br/>completedAt=NOW(),<br/>actualFare=?
    TripDB-->>TripService: Updated

    TripService-->>DriverClient: 200 OK<br/>{trip, actualFare}
    TripService-->>PassengerClient: "Trip completed. Please rate driver."
```

---

## **8.5 Passenger Rates Driver**

```mermaid
sequenceDiagram
    participant PassengerClient
    participant ALB
    participant TripService
    participant TripDB as Trip Database
    participant UserService

    PassengerClient->>ALB: POST /trips/{tripId}/rating<br/>{stars: 5, comment: "Great driver!"}
    ALB->>TripService: Forward request

    TripService->>TripService: Validate JWT<br/>Extract passengerId

    TripService->>TripDB: SELECT * FROM trips WHERE id=?

    alt Trip not found
        TripDB-->>TripService: NULL
        TripService-->>PassengerClient: 404 Not Found
    else Trip exists
        TripDB-->>TripService: Trip record

        alt Trip not completed
            TripService-->>PassengerClient: 400 Bad Request<br/>{"error": "Can only rate completed trips"}
        else Requester is not passenger
            TripService-->>PassengerClient: 403 Forbidden<br/>{"error": "Only passenger can rate"}
        else Trip completed and authorized
            TripService->>TripDB: SELECT * FROM ratings<br/>WHERE tripId=?

            alt Rating already exists
                TripDB-->>TripService: Rating found
                TripService-->>PassengerClient: 409 Conflict<br/>{"error": "Trip already rated"}
            else No rating yet
                TripDB-->>TripService: NULL

                TripService->>TripService: Validate stars (1-5)<br/>Sanitize comment

                TripService->>TripDB: INSERT INTO ratings<br/>(tripId, passengerId, driverId,<br/>stars, comment)
                TripDB-->>TripService: Rating created

                TripService->>TripDB: Calculate driver avg rating<br/>(aggregate query)
                TripDB-->>TripService: Updated stats

                TripService-->>PassengerClient: 201 Created<br/>{rating}

                Note right of TripService: Could notify driver<br/>of new rating
            end
        end
    end
```

---

## **8.5 Rating Retrieval Flow (GET /trips/{tripId}/rating)**

```mermaid
sequenceDiagram
    participant Client
    participant ALB
    participant UserService
    participant TripDB as Trip Database
    participant RatingDB as Rating Database

    Note over Client,RatingDB: Passenger or Driver Views Trip Rating

    Client->>ALB: GET /trips/{tripId}/rating
    ALB->>UserService: Forward request

    UserService->>UserService: Validate JWT<br/>Extract userId, userRole

    UserService->>TripDB: GET /api/trips/{tripId}<br/>(internal call)
    TripDB-->>UserService: Trip details or 404

    alt Trip not found
        UserService-->>Client: 404 Not Found<br/>{"error": "Trip not found"}
    else Trip exists
        UserService->>UserService: Check authorization

        alt PASSENGER and trip.passengerId !== userId
            UserService-->>Client: 403 Forbidden<br/>{"error": "Not authorized"}
        else DRIVER and trip.driverId !== userId
            UserService-->>Client: 403 Forbidden<br/>{"error": "Not authorized"}
        else Authorized
            UserService->>RatingDB: SELECT * FROM ratings<br/>WHERE tripId = ?

            alt No rating found
                RatingDB-->>UserService: NULL
                UserService-->>Client: 404 Not Found<br/>{"error": "No rating found"}
            else Rating exists
                RatingDB-->>UserService: Rating record

                UserService->>UserService: Map to DTO

                alt Requester is DRIVER
                    Note right of UserService: Exclude passengerId<br/>from response
                end

                UserService-->>Client: 200 OK<br/>{rating object}

                Note right of UserService: Log rating retrieval<br/>for audit trail
            end
        end
    end
```

---

## **8.6 Trip Cancellation Flow (Error Handling)**

```mermaid
sequenceDiagram
    participant Client
    participant ALB
    participant TripService
    participant TripDB as Trip Database

    Note over Client,TripDB: Passenger Cancels Before Driver Assigned

    Client->>ALB: POST /trips/{tripId}/cancel<br/>{reason: "Change of plans"}
    ALB->>TripService: Forward request

    TripService->>TripService: Validate JWT<br/>Extract userId

    TripService->>TripDB: SELECT * FROM trips WHERE id=?

    alt Trip not found
        TripDB-->>TripService: NULL
        TripService-->>Client: 404 Not Found
    else Trip exists
        TripDB-->>TripService: Trip record

        alt Requester not authorized
            TripService-->>Client: 403 Forbidden<br/>{"error": "Not authorized"}
        else Status is COMPLETED
            TripService-->>Client: 400 Bad Request<br/>{"error": "Cannot cancel completed trip"}
        else Valid cancellation
            TripService->>TripService: Validate state transition<br/>(REQUESTED/DRIVER_ASSIGNED/IN_PROGRESS → CANCELLED)

            TripService->>TripDB: UPDATE trips SET<br/>status=CANCELLED,<br/>cancelledAt=NOW(),<br/>cancellationReason=?
            TripDB-->>TripService: Updated

            TripService-->>Client: 200 OK<br/>{trip with CANCELLED status}

            alt Driver was assigned
                Note right of TripService: Notify driver of cancellation<br/>Release driver for new requests
            end
        end
    end
```

---

## **8.7 Driver Location Update Flow (High Frequency)**

```mermaid
sequenceDiagram
    participant DriverClient
    participant ALB
    participant DriverService
    participant Redis

    Note over DriverClient,Redis: Driver Goes Online

    DriverClient->>ALB: PUT /drivers/status<br/>{isOnline: true}
    ALB->>DriverService: Forward request

    DriverService->>DriverService: Validate JWT<br/>Extract driverId

    DriverService->>Redis: SADD driver:online {driverId}
    Redis-->>DriverService: OK

    DriverService->>Redis: SET driver:location:{driverId}<br/>JSON({isOnline: true, ...})
    Redis-->>DriverService: OK

    DriverService-->>DriverClient: 200 OK

    Note over DriverClient,Redis: Location Updates (Every 5-10 seconds)

    loop Every 5-10 seconds while online
        DriverClient->>ALB: PUT /drivers/location<br/>{lat, lng, heading, speed}
        ALB->>DriverService: Forward request

        DriverService->>DriverService: Validate coordinates<br/>(-90 ≤ lat ≤ 90, -180 ≤ lng ≤ 180)

        par Update geospatial index
            DriverService->>Redis: GEOADD driver:geo<br/>{lng} {lat} {driverId}
            Redis-->>DriverService: OK
        and Update metadata
            DriverService->>Redis: SET driver:location:{driverId}<br/>JSON({lat, lng, isOnline, heading, speed, timestamp})
            Redis-->>DriverService: OK
        and Set TTL (expire if no update)
            DriverService->>Redis: EXPIRE driver:location:{driverId}<br/>300 (5 minutes)
            Redis-->>DriverService: OK
        end

        DriverService-->>DriverClient: 200 OK
    end

    Note over DriverClient,Redis: Driver Goes Offline

    DriverClient->>ALB: PUT /drivers/status<br/>{isOnline: false}
    ALB->>DriverService: Forward request

    DriverService->>Redis: SREM driver:online {driverId}
    DriverService->>Redis: ZREM driver:geo {driverId}
    DriverService->>Redis: SET driver:location:{driverId}<br/>JSON({isOnline: false, ...})

    DriverService-->>DriverClient: 200 OK
```

---

## **Detailed Rationale:**

**Workflow Design Decisions:**

1. **JWT in Authorization Header:**
   - Standard OAuth 2.0 Bearer token pattern
   - Stateless authentication (no session storage)
   - Token contains userId and role for authorization

2. **Pessimistic Locking for Trip Assignment:**
   - `SELECT ... FOR UPDATE` prevents race condition
   - Multiple drivers accepting same trip simultaneously
   - PostgreSQL row-level lock ensures atomicity

3. **State Machine Validation:**
   - Each transition validates current state
   - Returns 400 Bad Request for invalid transitions
   - Prevents data corruption from out-of-order requests

4. **Async Driver Notification:**
   - Trip creation returns immediately after DB insert
   - Driver search happens asynchronously (non-blocking)
   - Real implementation would use WebSockets or FCM push notifications

5. **Redis TTL for Driver Locations:**
   - 5-minute expiration prevents stale data
   - Drivers automatically removed if app crashes
   - Can increase TTL in Phase 2 for reliability

6. **Error Handling Pattern:**
   - Consistent error response format across all services
   - HTTP status codes follow REST conventions
   - Detailed error messages for debugging

7. **Rate Limiting (Not Shown):**
   - Should implement in Phase 2 Security module
   - Prevent abuse of location update endpoint
   - AWS WAF or application-level rate limiting

8. **Idempotency (Future Enhancement):**
   - Trip acceptance should be idempotent
   - Use idempotency keys for critical operations
   - Phase 2 Reliability module consideration

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (Database Schema)
2. **Expand or Contract for Audience** - Adjust workflow detail
3. **Explain Reasoning (CoT Step-by-Step)** - Deeper dive into workflow design
4. **Critique and Refine** - Challenge these workflows
5. **Analyze Logical Flow and Dependencies** - Review sequence logic
6. **Assess Alignment with Overall Goals** - Verify user story coverage
7. **Identify Potential Risks and Unforeseen Issues** - Workflow risks?
8. **Challenge from Critical Perspective** - Devil's advocate on flow design
9. **Tree of Thoughts Deep Dive** - Explore alternative workflow patterns

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Database Schema section.

---
