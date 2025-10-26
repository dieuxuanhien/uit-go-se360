# **SECTION 5: API SPECIFICATION**

Based on the REST API choice from the Tech Stack, here's the OpenAPI 3.0 specification for all three microservices.

## **5.1 REST API Specification**

```yaml
openapi: 3.0.0
info:
  title: UIT-Go Ride-Hailing Platform API
  version: 1.0.0
  description: |
    RESTful API specification for the UIT-Go microservices architecture.
    This specification covers all three core services: UserService, TripService, and DriverService.

    **Base URLs:**
    - UserService: https://api.uitgo.example.com/users
    - TripService: https://api.uitgo.example.com/trips
    - DriverService: https://api.uitgo.example.com/drivers

    **Authentication:**
    All protected endpoints require a JWT Bearer token in the Authorization header.

servers:
  - url: https://api.uitgo.example.com
    description: Production API Gateway (ALB)
  - url: http://localhost:3000
    description: Local development via Docker Compose

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    # Common Schemas
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, timestamp, requestId]
          properties:
            code:
              type: string
              example: 'VALIDATION_ERROR'
            message:
              type: string
              example: 'Email is required'
            details:
              type: object
              additionalProperties: true
            timestamp:
              type: string
              format: date-time
            requestId:
              type: string
              format: uuid

    # User Schemas
    UserRole:
      type: string
      enum: [PASSENGER, DRIVER]

    User:
      type: object
      required: [id, email, role, firstName, lastName, phoneNumber, createdAt, updatedAt]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        role:
          $ref: '#/components/schemas/UserRole'
        firstName:
          type: string
        lastName:
          type: string
        phoneNumber:
          type: string
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    RegisterRequest:
      type: object
      required: [email, password, role, firstName, lastName, phoneNumber]
      properties:
        email:
          type: string
          format: email
          example: 'passenger@example.com'
        password:
          type: string
          minLength: 8
          example: 'SecurePass123!'
        role:
          $ref: '#/components/schemas/UserRole'
        firstName:
          type: string
          example: 'John'
        lastName:
          type: string
          example: 'Doe'
        phoneNumber:
          type: string
          example: '+84901234567'

    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string

    AuthResponse:
      type: object
      required: [accessToken, user]
      properties:
        accessToken:
          type: string
          description: JWT token for authenticated requests
        user:
          $ref: '#/components/schemas/User'

    # Driver Profile Schemas
    DriverApprovalStatus:
      type: string
      enum: [PENDING, APPROVED, REJECTED, SUSPENDED]

    DriverProfile:
      type: object
      required:
        [
          id,
          userId,
          vehicleMake,
          vehicleModel,
          vehicleYear,
          vehiclePlate,
          vehicleColor,
          licenseNumber,
          approvalStatus,
        ]
      properties:
        id:
          type: string
          format: uuid
        userId:
          type: string
          format: uuid
        vehicleMake:
          type: string
          example: 'Toyota'
        vehicleModel:
          type: string
          example: 'Camry'
        vehicleYear:
          type: integer
          example: 2022
        vehiclePlate:
          type: string
          example: '51A-12345'
        vehicleColor:
          type: string
          example: 'Silver'
        licenseNumber:
          type: string
          example: 'DL123456789'
        approvalStatus:
          $ref: '#/components/schemas/DriverApprovalStatus'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        user:
          $ref: '#/components/schemas/User'

    CreateDriverProfileRequest:
      type: object
      required: [vehicleMake, vehicleModel, vehicleYear, vehiclePlate, vehicleColor, licenseNumber]
      properties:
        vehicleMake:
          type: string
        vehicleModel:
          type: string
        vehicleYear:
          type: integer
          minimum: 2000
          maximum: 2026
        vehiclePlate:
          type: string
        vehicleColor:
          type: string
        licenseNumber:
          type: string

    # Trip Schemas
    TripStatus:
      type: string
      enum: [REQUESTED, DRIVER_ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED]

    Trip:
      type: object
      properties:
        id:
          type: string
          format: uuid
        passengerId:
          type: string
          format: uuid
        driverId:
          type: string
          format: uuid
          nullable: true
        status:
          $ref: '#/components/schemas/TripStatus'
        pickupLatitude:
          type: number
          format: double
          minimum: -90
          maximum: 90
        pickupLongitude:
          type: number
          format: double
          minimum: -180
          maximum: 180
        pickupAddress:
          type: string
        destinationLatitude:
          type: number
          format: double
        destinationLongitude:
          type: number
          format: double
        destinationAddress:
          type: string
        estimatedFare:
          type: integer
          description: Fare in USD cents
          example: 1250
        actualFare:
          type: integer
          nullable: true
        estimatedDistance:
          type: number
          format: double
          description: Distance in kilometers
        requestedAt:
          type: string
          format: date-time
        driverAssignedAt:
          type: string
          format: date-time
          nullable: true
        startedAt:
          type: string
          format: date-time
          nullable: true
        completedAt:
          type: string
          format: date-time
          nullable: true
        cancelledAt:
          type: string
          format: date-time
          nullable: true
        cancellationReason:
          type: string
          nullable: true
        passenger:
          $ref: '#/components/schemas/User'
        driver:
          $ref: '#/components/schemas/User'
        rating:
          $ref: '#/components/schemas/Rating'

    CreateTripRequest:
      type: object
      required:
        [
          pickupLatitude,
          pickupLongitude,
          pickupAddress,
          destinationLatitude,
          destinationLongitude,
          destinationAddress,
        ]
      properties:
        pickupLatitude:
          type: number
          format: double
          example: 10.762622
        pickupLongitude:
          type: number
          format: double
          example: 106.660172
        pickupAddress:
          type: string
          example: 'District 1, Ho Chi Minh City'
        destinationLatitude:
          type: number
          format: double
          example: 10.823099
        destinationLongitude:
          type: number
          format: double
          example: 106.629662
        destinationAddress:
          type: string
          example: 'Tan Binh District, Ho Chi Minh City'

    CancelTripRequest:
      type: object
      required: [reason]
      properties:
        reason:
          type: string
          example: 'Change of plans'

    # Driver Location Schemas
    DriverLocation:
      type: object
      required: [driverId, latitude, longitude, isOnline, timestamp]
      properties:
        driverId:
          type: string
          format: uuid
        latitude:
          type: number
          format: double
        longitude:
          type: number
          format: double
        isOnline:
          type: boolean
        heading:
          type: number
          format: double
          minimum: 0
          maximum: 359
          nullable: true
        speed:
          type: number
          format: double
          nullable: true
        accuracy:
          type: number
          format: double
          nullable: true
        timestamp:
          type: string
          format: date-time

    UpdateLocationRequest:
      type: object
      required: [latitude, longitude]
      properties:
        latitude:
          type: number
          format: double
        longitude:
          type: number
          format: double
        heading:
          type: number
          format: double
        speed:
          type: number
          format: double
        accuracy:
          type: number
          format: double

    UpdateDriverStatusRequest:
      type: object
      required: [isOnline]
      properties:
        isOnline:
          type: boolean

    NearbyDriver:
      type: object
      properties:
        driverId:
          type: string
          format: uuid
        latitude:
          type: number
          format: double
        longitude:
          type: number
          format: double
        distance:
          type: number
          format: double
          description: Distance in meters
        isOnline:
          type: boolean

    SearchNearbyDriversResponse:
      type: object
      properties:
        drivers:
          type: array
          items:
            $ref: '#/components/schemas/NearbyDriver'
        searchRadius:
          type: number
          format: double
          description: Search radius in kilometers
        totalFound:
          type: integer

    # Rating Schemas
    Rating:
      type: object
      properties:
        id:
          type: string
          format: uuid
        tripId:
          type: string
          format: uuid
        passengerId:
          type: string
          format: uuid
        driverId:
          type: string
          format: uuid
        stars:
          type: integer
          minimum: 1
          maximum: 5
        comment:
          type: string
          nullable: true
        createdAt:
          type: string
          format: date-time

    CreateRatingRequest:
      type: object
      required: [stars]
      properties:
        stars:
          type: integer
          minimum: 1
          maximum: 5
        comment:
          type: string
          maxLength: 500

paths:
  # UserService Endpoints
  /users/register:
    post:
      tags: [UserService]
      summary: Register a new user (passenger or driver)
      operationId: registerUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      responses:
        '201':
          description: User registered successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '400':
          description: Validation error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: Email already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/login:
    post:
      tags: [UserService]
      summary: Authenticate user and receive JWT token
      operationId: loginUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Invalid credentials
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/me:
    get:
      tags: [UserService]
      summary: Get current user profile
      operationId: getCurrentUser
      security:
        - BearerAuth: []
      responses:
        '200':
          description: User profile retrieved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '401':
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/driver-profile:
    post:
      tags: [UserService]
      summary: Create driver profile (driver users only)
      operationId: createDriverProfile
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateDriverProfileRequest'
      responses:
        '201':
          description: Driver profile created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DriverProfile'
        '400':
          description: Validation error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: User is not a driver
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    get:
      tags: [UserService]
      summary: Get current driver's profile
      operationId: getDriverProfile
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Driver profile retrieved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DriverProfile'
        '404':
          description: Driver profile not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  # TripService Endpoints
  /trips:
    post:
      tags: [TripService]
      summary: Create a new trip request (passengers only)
      operationId: createTrip
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTripRequest'
      responses:
        '201':
          description: Trip created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'
        '400':
          description: Validation error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: User is not a passenger
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    get:
      tags: [TripService]
      summary: Get user's trip history
      operationId: getUserTrips
      security:
        - BearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/TripStatus'
          description: Filter by trip status
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: Trip list retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  trips:
                    type: array
                    items:
                      $ref: '#/components/schemas/Trip'
                  total:
                    type: integer
                  limit:
                    type: integer
                  offset:
                    type: integer

  /trips/{tripId}:
    get:
      tags: [TripService]
      summary: Get trip details
      operationId: getTripById
      security:
        - BearerAuth: []
      parameters:
        - name: tripId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Trip details retrieved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'
        '404':
          description: Trip not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /trips/{tripId}/cancel:
    post:
      tags: [TripService]
      summary: Cancel a trip
      operationId: cancelTrip
      security:
        - BearerAuth: []
      parameters:
        - name: tripId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CancelTripRequest'
      responses:
        '200':
          description: Trip cancelled successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'
        '400':
          description: Trip cannot be cancelled in current state
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: Trip not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /trips/{tripId}/accept:
    post:
      tags: [TripService]
      summary: Driver accepts trip request
      operationId: acceptTrip
      security:
        - BearerAuth: []
      parameters:
        - name: tripId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Trip accepted successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'
        '403':
          description: User is not a driver or driver not approved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: Trip already assigned to another driver
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /trips/{tripId}/start:
    post:
      tags: [TripService]
      summary: Driver starts trip (picked up passenger)
      operationId: startTrip
      security:
        - BearerAuth: []
      parameters:
        - name: tripId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Trip started successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'

  /trips/{tripId}/complete:
    post:
      tags: [TripService]
      summary: Driver completes trip
      operationId: completeTrip
      security:
        - BearerAuth: []
      parameters:
        - name: tripId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Trip completed successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'

  /trips/{tripId}/rating:
    post:
      tags: [TripService]
      summary: Passenger rates completed trip
      operationId: rateTrip
      security:
        - BearerAuth: []
      parameters:
        - name: tripId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateRatingRequest'
      responses:
        '201':
          description: Rating submitted successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Rating'
        '400':
          description: Trip not completed or already rated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  # DriverService Endpoints
  /drivers/location:
    put:
      tags: [DriverService]
      summary: Update driver's current location
      operationId: updateDriverLocation
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateLocationRequest'
      responses:
        '200':
          description: Location updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DriverLocation'
        '403':
          description: User is not a driver
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /drivers/status:
    put:
      tags: [DriverService]
      summary: Update driver online/offline status
      operationId: updateDriverStatus
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateDriverStatusRequest'
      responses:
        '200':
          description: Status updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DriverLocation'

  /drivers/search:
    get:
      tags: [DriverService]
      summary: Search for nearby available drivers
      operationId: searchNearbyDrivers
      security:
        - BearerAuth: []
      parameters:
        - name: latitude
          in: query
          required: true
          schema:
            type: number
            format: double
          example: 10.762622
        - name: longitude
          in: query
          required: true
          schema:
            type: number
            format: double
          example: 106.660172
        - name: radius
          in: query
          schema:
            type: number
            format: double
            default: 5
          description: Search radius in kilometers
        - name: limit
          in: query
          schema:
            type: integer
            default: 10
            maximum: 50
      responses:
        '200':
          description: Nearby drivers found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SearchNearbyDriversResponse'

  # Health Check
  /health:
    get:
      tags: [Health]
      summary: Service health check
      operationId: healthCheck
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: 'healthy'
                  timestamp:
                    type: string
                    format: date-time
                  service:
                    type: string
                    example: 'user-service'
                  version:
                    type: string
                    example: '1.0.0'
```

---

## **Detailed Rationale:**

**API Design Decisions:**

1. **Path-based routing (not subdomain):**
   - All services behind single ALB: `api.uitgo.example.com`
   - ALB routes: `/users/*` → UserService, `/trips/*` → TripService, `/drivers/*` → DriverService
   - **Why:** Simpler than subdomain routing, single SSL certificate, easier local development

2. **RESTful conventions:**
   - Resource-oriented URLs (`/trips/{tripId}`)
   - HTTP verbs: GET (read), POST (create/action), PUT (update), DELETE (remove)
   - Action endpoints use POST: `/trips/{tripId}/accept`, `/trips/{tripId}/start`

3. **Authentication strategy:**
   - JWT Bearer tokens in `Authorization` header
   - Token contains: userId, role, expiration
   - No refresh tokens in Phase 1 (can add in Phase 2 Security module)

4. **Error response format:**
   - Consistent structure across all services
   - Includes `requestId` for debugging/tracing
   - HTTP status codes follow REST conventions

5. **Pagination strategy:**
   - Offset-based pagination (simple, sufficient for MVP)
   - Can upgrade to cursor-based in Phase 2 Scalability module

6. **Fare representation:**
   - Integer cents (not decimal dollars) to avoid floating-point errors
   - Frontend converts: `1250 cents → $12.50`

7. **Geospatial precision:**
   - Latitude/longitude as doubles (sufficient precision for ride-hailing)
   - Distance in meters for search results (standard SI unit)

8. **Trip state machine enforcement:**
   - Separate endpoints for each state transition (`/accept`, `/start`, `/complete`)
   - Backend validates state transitions (e.g., can't complete a requested trip)

9. **Rating constraints:**
   - Only passengers can rate (enforced by auth + business logic)
   - Can only rate completed trips
   - One rating per trip (enforced by unique database constraint)

10. **Health check endpoint:**
    - Required for ALB target group health checks
    - Returns service name and version for debugging

**API Examples:**

**Example 1: Passenger books a ride**

```bash
# 1. Register
POST /users/register
{"email": "passenger@example.com", "password": "Pass123!", "role": "PASSENGER", ...}
→ 201 Created, returns JWT token

# 2. Create trip
POST /trips
Authorization: Bearer <token>
{"pickupLatitude": 10.762622, "pickupLongitude": 106.660172, ...}
→ 201 Created, returns Trip with status=REQUESTED

# 3. Cancel trip
POST /trips/{tripId}/cancel
{"reason": "Changed my mind"}
→ 200 OK, Trip status=CANCELLED
```

**Example 2: Driver accepts and completes ride**

```bash
# 1. Go online
PUT /drivers/status
{"isOnline": true}
→ 200 OK

# 2. Update location
PUT /drivers/location
{"latitude": 10.762622, "longitude": 106.660172}
→ 200 OK

# 3. Accept trip
POST /trips/{tripId}/accept
→ 200 OK, Trip status=DRIVER_ASSIGNED

# 4. Start trip
POST /trips/{tripId}/start
→ 200 OK, Trip status=IN_PROGRESS

# 5. Complete trip
POST /trips/{tripId}/complete
→ 200 OK, Trip status=COMPLETED
```

**Service-to-Service Communication:**

- TripService calls DriverService: `GET /drivers/search?lat=...&lng=...` to find nearby drivers
- TripService calls UserService: `GET /users/{userId}` (internal API) to fetch driver details for trip response

**OpenAPI Benefits:**

- Auto-generate Swagger UI for testing (`/api-docs`)
- Generate TypeScript client SDKs
- Contract testing validation
- Living documentation

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (Components)
2. **Expand or Contract for Audience** - Adjust API spec detail
3. **Explain Reasoning (CoT Step-by-Step)** - Deeper dive into API design
4. **Critique and Refine** - Challenge these API decisions
5. **Analyze Logical Flow and Dependencies** - Review API coherence
6. **Assess Alignment with Overall Goals** - Verify user story coverage
7. **Identify Potential Risks and Unforeseen Issues** - API design risks?
8. **Challenge from Critical Perspective** - Devil's advocate on REST choices
9. **Tree of Thoughts Deep Dive** - Explore alternative API designs

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to the Components section.

---
