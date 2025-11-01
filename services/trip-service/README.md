# Trip Service

The Trip Service manages ride requests, trip lifecycle, and fare calculations for the UIT-Go ride-sharing platform.

## Description

Trip Service is a microservice responsible for:

- Managing trip requests and lifecycle (create, accept, complete, cancel)
- Fare calculation and estimation
- Trip-driver matching coordination
- Trip history and status tracking

## Fare Calculation Logic

The Trip Service includes a reusable fare calculation module that provides consistent fare estimates for passengers.

### Haversine Distance Formula

Distance calculations use the Haversine formula to compute the great-circle distance between two coordinate pairs:

```
a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
c = 2 * atan2(√a, √(1−a))
distance = R * c
```

Where:

- `R` = 6371 km (Earth radius)
- `Δlat` = lat2 - lat1 (in radians)
- `Δlng` = lng2 - lng1 (in radians)

### Pricing Model

Fare calculation follows this formula:

```
totalFare (cents) = baseFare + (distanceKm * perKmRate)
```

With the following constraints:

- **Minimum fare:** $5.00 (500 cents) - applied regardless of distance
- **Maximum fare:** $200.00 (20000 cents) - caps extremely long trips

### Default Pricing

- **Base fare:** $2.50 (250 cents)
- **Per-kilometer rate:** $1.20 (120 cents)
- **Minimum fare:** $5.00 (500 cents)
- **Maximum fare:** $200.00 (20000 cents)

### Example Calculations

- **10 km trip:** $2.50 + (10 × $1.20) = $14.50
- **Short trip (0.5 km):** Minimum $5.00 applied
- **Long trip (200 km):** Maximum $200.00 applied

### Configuration

Fare settings are configurable via environment variables:

| Variable             | Description        | Default | Unit  |
| -------------------- | ------------------ | ------- | ----- |
| `FARE_BASE_CENTS`    | Base fare amount   | 250     | cents |
| `FARE_PER_KM_CENTS`  | Per-kilometer rate | 120     | cents |
| `FARE_MINIMUM_CENTS` | Minimum fare       | 500     | cents |
| `FARE_MAXIMUM_CENTS` | Maximum fare cap   | 20000   | cents |

### Implementation Notes

- All monetary values are stored as integers (cents) to avoid floating-point precision issues
- Fares are rounded to whole cents (no fractional cents)
- Distance calculations use the WGS84 ellipsoid model via Haversine formula
- Accuracy: ±0.5% compared to geodesic calculations (sufficient for fare estimation)

## Tech Stack

- **Framework:** NestJS 10.x
- **Language:** TypeScript 5.3.x
- **Database:** PostgreSQL 15.x
- **ORM:** Prisma 5.x
- **Testing:** Jest 29.x, Supertest 6.x
- **Containerization:** Docker

## Prerequisites

- Node.js 20.x
- Docker and Docker Compose
- pnpm 8.x

## Setup Instructions

### Local Development (Without Docker)

1. **Install dependencies:**

   ```bash
   cd services/trip-service
   pnpm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env and configure DATABASE_URL for local PostgreSQL
   ```

3. **Run database migrations:**

   ```bash
   npx prisma migrate dev
   ```

4. **Generate Prisma client:**

   ```bash
   npx prisma generate
   ```

5. **Start the service:**
   ```bash
   pnpm start:dev
   ```

The service will start on port 3002 (or the port specified in your .env file).

### Docker Development

1. **Build and run with docker-compose:**

   ```bash
   # From project root
   docker-compose up trip-service
   ```

2. **Build Docker image manually:**

   ```bash
   docker build -t trip-service -f services/trip-service/Dockerfile .
   ```

3. **Run with docker-compose:**
   ```bash
   docker-compose up trip-service postgres-trip
   ```

## API Endpoints

### Health Check

- **GET /health** - Check service and database health status
  - Returns: `200 OK` if healthy, `503 Service Unavailable` if unhealthy
  - Example response:
    ```json
    {
      "status": "healthy",
      "service": "trip-service",
      "version": "1.0.0",
      "timestamp": "2025-10-29T10:30:00.000Z",
      "database": "connected"
    }
    ```

### Trip Management

#### POST /trips

Create a new trip request as a passenger.

**Authentication Required:** Bearer token with PASSENGER role

**Request Body:**

```json
{
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "District 1, Ho Chi Minh City",
  "destinationLatitude": 10.823099,
  "destinationLongitude": 106.629662,
  "destinationAddress": "Tan Binh District, Ho Chi Minh City"
}
```

**Validation Rules:**

- `pickupLatitude`: number, -90 to 90
- `pickupLongitude`: number, -180 to 180
- `pickupAddress`: non-empty string, max 500 characters
- `destinationLatitude`: number, -90 to 90
- `destinationLongitude`: number, -180 to 180
- `destinationAddress`: non-empty string, max 500 characters

**Success Response (201 Created):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "passengerId": "550e8400-e29b-41d4-a716-446655440000",
  "driverId": null,
  "status": "REQUESTED",
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "District 1, Ho Chi Minh City",
  "destinationLatitude": 10.823099,
  "destinationLongitude": 106.629662,
  "destinationAddress": "Tan Binh District, Ho Chi Minh City",
  "estimatedFare": 1450,
  "actualFare": null,
  "estimatedDistance": 8.5,
  "requestedAt": "2025-10-31T10:30:00Z",
  "driverAssignedAt": null,
  "startedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "cancellationReason": null,
  "createdAt": "2025-10-31T10:30:00Z",
  "updatedAt": "2025-10-31T10:30:00Z"
}
```

**Error Responses:**

- **400 Bad Request** - Invalid coordinates or missing required fields
  ```json
  {
    "statusCode": 400,
    "message": ["Latitude must be between -90 and 90"],
    "error": "Bad Request"
  }
  ```
- **401 Unauthorized** - Missing or invalid authentication token
- **403 Forbidden** - User is not a PASSENGER (only passengers can create trips)
- **500 Internal Server Error** - Unexpected server error

#### GET /trips/{trip_id}

Retrieve details of a specific trip.

**Authentication Required:** Bearer token with PASSENGER or DRIVER role

**Authorization:**

- PASSENGER: Can only view trips where `passengerId` matches authenticated user ID
- DRIVER: Can only view trips where `driverId` matches authenticated user ID

**Path Parameters:**

- `trip_id`: UUID - Trip identifier

**Request Body:** None

**Success Response (200 OK):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "passengerId": "550e8400-e29b-41d4-a716-446655440000",
  "driverId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "DRIVER_ASSIGNED",
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "District 1, Ho Chi Minh City",
  "destinationLatitude": 10.823099,
  "destinationLongitude": 106.629662,
  "destinationAddress": "Tan Binh District, Ho Chi Minh City",
  "estimatedFare": 2500,
  "actualFare": null,
  "estimatedDistance": 8.5,
  "requestedAt": "2025-11-01T10:30:00Z",
  "driverAssignedAt": "2025-11-01T10:31:15Z",
  "startedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "cancellationReason": null,
  "passenger": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "passenger@example.com",
    "role": "PASSENGER",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+84901234567"
  },
  "driver": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "email": "driver@example.com",
    "role": "DRIVER",
    "firstName": "Jane",
    "lastName": "Smith",
    "phoneNumber": "+84909876543"
  }
}
```

**Error Responses:**

- **401 Unauthorized** - Missing or invalid JWT token
- **403 Forbidden** - User not authorized to view this trip
  ```json
  {
    "statusCode": 403,
    "message": "You are not authorized to view this trip",
    "error": "Forbidden"
  }
  ```
- **404 Not Found** - Trip does not exist
  ```json
  {
    "statusCode": 404,
    "message": "Trip with ID {trip_id} not found",
    "error": "Not Found"
  }
  ```

**Example curl command:**

```bash
curl -X GET "http://localhost:3002/trips/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Driver Notifications

#### GET /notifications

Retrieve pending trip notifications for the authenticated driver.

**Authentication Required:** Bearer token with DRIVER role

**Request:** No body, requires JWT Bearer token in Authorization header

**Success Response (200 OK):**

```json
[
  {
    "notificationId": "123e4567-e89b-12d3-a456-426614174000",
    "tripId": "550e8400-e29b-41d4-a716-446655440000",
    "pickupLatitude": 10.762622,
    "pickupLongitude": 106.660172,
    "pickupAddress": "District 1, Ho Chi Minh City",
    "destinationLatitude": 10.823099,
    "destinationLongitude": 106.629662,
    "destinationAddress": "Tan Binh District, Ho Chi Minh City",
    "estimatedFare": 2500,
    "timeRemainingSeconds": 12,
    "notifiedAt": "2025-11-01T10:30:00Z"
  }
]
```

**Response 200 OK (No Notifications):**

```json
[]
```

**Error Responses:**

- **401 Unauthorized** - Missing or invalid JWT token
- **403 Forbidden** - User is not a driver (role check failed)

**Notes:**

- Only returns notifications with status = 'PENDING'
- Filters out notifications older than 15 seconds
- Results sorted by creation time (oldest first)
- Each notification includes full trip details for driver review

**Example curl command:**

```bash
curl -X GET "http://localhost:3002/notifications" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### POST /notifications/{notification_id}/accept

Accept a trip notification as a driver.

**Authentication Required:** Bearer token with DRIVER role

**Path Parameters:**

- `notification_id`: UUID - Notification identifier

**Request Body:** None

**Success Response (200 OK):**

```json
{
  "id": "trip-uuid",
  "passengerId": "passenger-uuid",
  "driverId": "driver-uuid",
  "status": "DRIVER_ASSIGNED",
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "District 1, Ho Chi Minh City",
  "destinationLatitude": 10.823099,
  "destinationLongitude": 106.629662,
  "destinationAddress": "Tan Binh District, Ho Chi Minh City",
  "estimatedFare": 2500,
  "requestedAt": "2025-11-01T10:30:00Z",
  "driverAssignedAt": "2025-11-01T10:31:15Z"
}
```

**Error Responses:**

- **400 Bad Request** - Notification expired (> 15 seconds old)
  ```json
  {
    "error": {
      "code": "NOTIFICATION_EXPIRED",
      "message": "Notification has expired (older than 15 seconds)",
      "timestamp": "2025-11-01T10:31:20Z"
    }
  }
  ```
- **401 Unauthorized** - Missing or invalid JWT token
- **403 Forbidden** - User is not a driver OR notification belongs to different driver
- **404 Not Found** - Notification does not exist
- **409 Conflict** - Notification already responded to OR trip already assigned
  ```json
  {
    "error": {
      "code": "TRIP_ALREADY_ASSIGNED",
      "message": "This trip has already been accepted by another driver",
      "timestamp": "2025-11-01T10:31:20Z"
    }
  }
  ```

**Notes:**

- Notifications expire after 15 seconds (DRIVER_NOTIFICATION_TIMEOUT_SECONDS)
- Accepting a notification assigns the trip to the driver and expires all other pending notifications for the same trip
- Driver status is updated to 'on_trip' via DriverService API call
- All operations are performed atomically to prevent race conditions

**Example curl command:**

```bash
curl -X POST "http://localhost:3002/notifications/123e4567-e89b-12d3-a456-426614174000/accept" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### POST /notifications/{notification_id}/decline

Decline a trip notification as a driver.

**Authentication Required:** Bearer token with DRIVER role

**Path Parameters:**

- `notification_id`: UUID - Notification identifier

**Request Body:** None

**Success Response (200 OK):**

```json
{
  "message": "Notification declined successfully",
  "notificationId": "notification-uuid",
  "status": "DECLINED"
}
```

**Error Responses:**

- **400 Bad Request** - Notification expired (> 15 seconds old)
- **401 Unauthorized** - Missing or invalid JWT token
- **403 Forbidden** - User is not a driver OR notification belongs to different driver
- **404 Not Found** - Notification does not exist
- **409 Conflict** - Notification already responded to

**Notes:**

- Notifications expire after 15 seconds (DRIVER_NOTIFICATION_TIMEOUT_SECONDS)
- Declining a notification only updates the notification status; the trip remains available for other drivers

**Example curl command:**

```bash
curl -X POST "http://localhost:3002/notifications/123e4567-e89b-12d3-a456-426614174000/decline" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Testing

### Run Unit Tests

```bash
pnpm test
```

### Run Integration Tests (E2E)

```bash
pnpm test:e2e
```

### Run Tests with Coverage

```bash
pnpm test:cov
```

### Watch Mode

```bash
pnpm test:watch
```

## Driver Notification Flow

When a passenger creates a trip request, the Trip Service automatically searches for nearby available drivers and notifies them. This enables rapid driver-passenger matching for ride requests.

### Workflow

1. **Trip Creation**: Passenger submits POST /trips with pickup and destination coordinates
2. **Initial Search**: System searches for online drivers within 5km radius
3. **Radius Expansion**: If no drivers found, expands search to 10km, then 15km
4. **Driver Selection**: Selects up to 5 nearest drivers (configurable)
5. **Notification Creation**: Creates notification records with status = 'PENDING'
6. **Status Update**: Trip status changes to 'FINDING_DRIVER'
7. **Response**: Returns trip details to passenger immediately

### Trip Status Transitions

```
REQUESTED → FINDING_DRIVER → DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED
                ↓
         NO_DRIVERS_AVAILABLE → CANCELLED
```

**Status Definitions:**

- `REQUESTED`: Initial state after trip creation
- `FINDING_DRIVER`: System is searching for and notifying nearby drivers
- `NO_DRIVERS_AVAILABLE`: No drivers found within maximum search radius (15km)
- `DRIVER_ASSIGNED`: A driver has accepted the trip
- `IN_PROGRESS`: Trip is active (driver picked up passenger)
- `COMPLETED`: Trip finished successfully
- `CANCELLED`: Trip was cancelled by passenger or system

### Radius Expansion Logic

The system uses an intelligent radius expansion strategy to balance speed and availability:

1. **First Attempt (5km)**: Fast, local drivers - typical urban scenario
2. **Second Attempt (10km)**: Medium range - suburban areas
3. **Final Attempt (15km)**: Maximum range - rural or low-density areas

If no drivers found after 15km search, trip status becomes `NO_DRIVERS_AVAILABLE`.

### Configuration

Driver notification behavior is customizable via environment variables:

| Variable                              | Description                    | Default               |
| ------------------------------------- | ------------------------------ | --------------------- |
| `DRIVER_SEARCH_INITIAL_RADIUS_KM`     | Initial search radius          | 5 km                  |
| `DRIVER_SEARCH_SECOND_RADIUS_KM`      | Second attempt radius          | 10 km                 |
| `DRIVER_SEARCH_FINAL_RADIUS_KM`       | Maximum search radius          | 15 km                 |
| `DRIVER_NOTIFICATION_LIMIT`           | Max drivers to notify per trip | 5                     |
| `DRIVER_SERVICE_URL`                  | Driver service base URL        | http://localhost:3003 |
| `DRIVER_NOTIFICATION_TIMEOUT_SECONDS` | Timeout for driver response    | 15 seconds            |
| `SERVICE_JWT_TOKEN`                   | JWT for inter-service auth     | (optional)            |

### Inter-Service Communication

- **Protocol**: HTTP REST API
- **Endpoint**: `GET /drivers/search`
- **Authentication**: Bearer token (service JWT) if configured
- **Timeout**: 5 seconds
- **Retry Logic**: Up to 2 retries on transient failures
- **Error Handling**: Graceful degradation if Driver Service unavailable

### Performance Characteristics

- **Search Speed**: < 3 seconds typical, includes all radius attempts
- **Notification Limit**: 5 drivers maximum to avoid system overload
- **Async Processing**: Driver search happens in background, trip creation returns immediately
- **Transaction Safety**: Notification creation + trip status update are atomic

### Example Scenario

**Urban Trip Request:**

```
1. Passenger requests trip in District 1, HCMC
2. System finds 8 drivers within 5km
3. Selects 5 nearest drivers (sorted by distance)
4. Creates 5 notification records (status=PENDING)
5. Updates trip status to FINDING_DRIVER
6. Returns trip details to passenger
7. Drivers receive notifications on mobile app
```

**Rural Trip Request:**

```
1. Passenger requests trip in rural area
2. No drivers within 5km → expands to 10km
3. No drivers within 10km → expands to 15km
4. Finds 2 drivers at 12km distance
5. Creates 2 notification records
6. Updates trip status to FINDING_DRIVER
```

**No Drivers Available:**

```
1. Passenger requests trip in remote area
2. Searches 5km, 10km, 15km → no drivers found
3. Updates trip status to NO_DRIVERS_AVAILABLE
4. Returns trip with error indication
5. Passenger notified to try again later
```

## Environment Variables

| Variable       | Description                                    | Default     | Required |
| -------------- | ---------------------------------------------- | ----------- | -------- |
| `NODE_ENV`     | Node environment (development/production/test) | development | No       |
| `PORT`         | Service port                                   | 3002        | No       |
| `LOG_LEVEL`    | Logging level (error/warn/info/debug)          | info        | No       |
| `DATABASE_URL` | PostgreSQL connection string                   | -           | Yes      |

## Database Schema

Currently, the service has a minimal schema for health checks. Trip models will be added in future stories.

### Migrations

- **Create migration:** `npx prisma migrate dev --name <migration_name>`
- **Apply migrations:** `npx prisma migrate deploy`
- **Reset database:** `npx prisma migrate reset`

## Scripts

- `pnpm build` - Build the service
- `pnpm start` - Start the service (production)
- `pnpm start:dev` - Start in watch mode (development)
- `pnpm start:debug` - Start in debug mode
- `pnpm test` - Run unit tests
- `pnpm test:e2e` - Run integration tests
- `pnpm test:cov` - Run tests with coverage
- `pnpm lint` - Lint code
- `pnpm format` - Format code with Prettier

## Project Structure

```
services/trip-service/
├── src/
│   ├── fare/               # Fare calculation module
│   │   ├── fare-calculator.service.ts    # Distance and fare logic
│   │   └── fare.module.ts                # Fare module definition
│   ├── health/             # Health check module
│   ├── prisma/             # Prisma service and module
│   ├── config/             # Configuration modules
│   ├── app.module.ts       # Root application module
│   └── main.ts             # Application entry point
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── migrations/          # Migration files
├── test/
│   ├── unit/               # Unit tests
│   │   └── fare/           # Fare calculation tests
│   └── integration/        # Integration tests (E2E)
├── Dockerfile              # Docker configuration
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## Swagger API Documentation

When the service is running, access the Swagger UI at:

```
http://localhost:3002/api
```

## Health Check

The service exposes a health check endpoint at `/health` that verifies:

- Service is running
- Database connection is active

Use this endpoint for:

- Docker health checks
- Kubernetes liveness/readiness probes
- Load balancer health monitoring

## Troubleshooting

### Database Connection Issues

- Verify PostgreSQL is running: `docker ps | grep postgres-trip`
- Check DATABASE_URL in `.env` file
- Ensure database exists: `docker-compose logs postgres-trip`

### Build Errors

- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Regenerate Prisma client: `npx prisma generate`

### Test Failures

- Ensure database is running for e2e tests
- Check DATABASE_URL points to test database
- Reset test database: `npx prisma migrate reset`

## License

UNLICENSED
