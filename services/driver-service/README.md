# Driver Service

## Overview

The Driver Service is a microservice responsible for managing driver availability status and location data in the UIT-Go ride-hailing platform. It provides real-time driver status tracking using Redis for fast, ephemeral data storage.

## Purpose

- Manage driver online/offline status
- Store driver status with automatic expiration (TTL)
- Maintain a set of currently online drivers
- Provide health check endpoint for service monitoring

## Technology Stack

- **Framework**: NestJS 10.x
- **Language**: TypeScript 5.x
- **Database**: Redis 7.x (in-memory data store)
- **Authentication**: JWT (Passport JWT strategy)
- **Testing**: Jest 29.x, Supertest 7.x

## API Endpoints

### Driver Status Management

#### PUT /drivers/status

Update driver online/offline status.

**Authentication**: Required (JWT Bearer token, DRIVER role only)

**Request Body**:

```json
{
  "isOnline": true
}
```

**Response** (200 OK):

```json
{
  "driverId": "550e8400-e29b-41d4-a716-446655440000",
  "isOnline": true,
  "timestamp": "2025-10-27T10:00:00.000Z"
}
```

**Error Responses**:

- `400 Bad Request`: Invalid input (missing or invalid isOnline value)
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User is not a DRIVER
- `503 Service Unavailable`: Redis connection failed

**Example curl command**:

```bash
curl -X PUT http://localhost:3003/drivers/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isOnline": true}'
```

#### GET /drivers/status

Get current driver's status.

**Authentication**: Required (JWT Bearer token, DRIVER role only)

**Response** (200 OK):

```json
{
  "driverId": "550e8400-e29b-41d4-a716-446655440000",
  "isOnline": true,
  "timestamp": "2025-10-27T10:00:00.000Z"
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User is not a DRIVER
- `404 Not Found`: Status not found for driver
- `503 Service Unavailable`: Redis connection failed

**Example curl command**:

```bash
curl -X GET http://localhost:3003/drivers/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Driver Location Tracking

#### PUT /drivers/location

Update driver's current GPS location. Only online drivers can update their location.

**Authentication**: Required (JWT Bearer token, DRIVER role only)

**Location Update Frequency**: Recommended every 5-10 seconds while driver is online.

**Request Body**:

```json
{
  "latitude": 10.762622,
  "longitude": 106.660172,
  "heading": 45,
  "speed": 30,
  "accuracy": 10
}
```

**Request Fields**:

- `latitude` (required): GPS latitude, must be between -90 and 90
- `longitude` (required): GPS longitude, must be between -180 and 180
- `heading` (optional): Direction of travel in degrees, 0-359
- `speed` (optional): Speed in km/h
- `accuracy` (optional): GPS accuracy in meters

**Response** (200 OK):

```json
{
  "driverId": "550e8400-e29b-41d4-a716-446655440000",
  "latitude": 10.762622,
  "longitude": 106.660172,
  "isOnline": true,
  "heading": 45,
  "speed": 30,
  "accuracy": 10,
  "timestamp": "2025-10-27T10:00:00.000Z"
}
```

**Error Responses**:

- `400 Bad Request`: Invalid coordinates (latitude not in [-90, 90] or longitude not in [-180, 180])
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Driver is offline or user is not a DRIVER role
- `503 Service Unavailable`: Redis connection failure

**Example curl command**:

```bash
curl -X PUT http://localhost:3003/drivers/location \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 10.762622,
    "longitude": 106.660172,
    "heading": 45,
    "speed": 30,
    "accuracy": 10
  }'
```

**TTL Behavior**:

- Location data expires after 5 minutes (300 seconds) if no updates received
- Driver automatically removed from search if location not updated
- Allows for temporary connection loss without immediately removing driver

### Health Check

#### GET /health

Service health check endpoint.

**Authentication**: Not required

**Response** (200 OK):

```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T10:00:00.000Z",
  "service": "driver-service",
  "version": "0.1.0",
  "redis": "connected"
}
```

**Error Response** (503 Service Unavailable):

```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-27T10:00:00.000Z",
  "service": "driver-service",
  "version": "0.1.0",
  "redis": "disconnected"
}
```

## Environment Variables

| Variable              | Description                           | Default       | Required |
| --------------------- | ------------------------------------- | ------------- | -------- |
| `NODE_ENV`            | Environment (development/production)  | `development` | No       |
| `LOG_LEVEL`           | Logging level (debug/info/warn/error) | `debug`       | No       |
| `DRIVER_SERVICE_PORT` | Service HTTP port                     | `3003`        | No       |
| `REDIS_HOST`          | Redis server hostname                 | `localhost`   | Yes      |
| `REDIS_PORT`          | Redis server port                     | `6379`        | Yes      |
| `REDIS_PASSWORD`      | Redis password (if required)          | -             | No       |
| `REDIS_DB`            | Redis database number                 | `0`           | No       |
| `JWT_SECRET`          | JWT secret key for token validation   | -             | Yes      |
| `JWT_EXPIRES_IN`      | JWT token expiration time             | `7d`          | No       |

**⚠️ IMPORTANT**: Ensure `JWT_SECRET` matches across all services (user-service, trip-service, driver-service) for token validation to work correctly.

## Redis Key Patterns

### Status Keys

- **Pattern**: `driver:status:{driverId}`
- **Type**: String (JSON)
- **TTL**: 3600 seconds (1 hour)
- **Value**:
  ```json
  {
    "driverId": "uuid",
    "isOnline": true,
    "timestamp": "ISO 8601 datetime"
  }
  ```

### Online Drivers Set

- **Pattern**: `driver:online`
- **Type**: Set
- **Members**: Driver UUIDs of currently online drivers

### Location Keys

- **Pattern**: `driver:location:{driverId}`
- **Type**: String (JSON)
- **TTL**: 300 seconds (5 minutes)
- **Value**:
  ```json
  {
    "driverId": "uuid",
    "latitude": 10.762622,
    "longitude": 106.660172,
    "isOnline": true,
    "heading": 45,
    "speed": 30,
    "accuracy": 10,
    "timestamp": "ISO 8601 datetime"
  }
  ```

### Geospatial Index

- **Pattern**: `driver:geo`
- **Type**: Sorted Set (ZSET) - Redis Geospatial Index
- **Members**: Driver UUIDs with latitude/longitude coordinates
- **Purpose**: Enable fast nearby driver search using GEORADIUS/GEOSEARCH commands
- **Storage**: Uses GEOADD command with longitude, latitude order

## Local Development Setup

### Prerequisites

- Node.js 20.x or higher
- pnpm 8.x or higher
- Docker and Docker Compose (for Redis)

### Installation

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment template:

   ```bash
   cp .env.example .env
   ```

3. Start Redis:

   ```bash
   docker compose up -d redis
   ```

4. Start development server:
   ```bash
   pnpm start:dev
   ```

The service will be available at `http://localhost:3003`.

### Testing

#### Run all tests:

```bash
pnpm test
```

#### Run unit tests only:

```bash
pnpm test -- test/unit
```

#### Run e2e tests:

```bash
# Ensure Redis is running
docker compose up -d redis

# Run e2e tests
pnpm test:e2e
```

#### Run tests with coverage:

```bash
pnpm test:cov
```

### Linting

```bash
pnpm lint
```

### Build

```bash
pnpm build
```

## Docker Deployment

### Build Image

```bash
docker build -t uitgo-driver-service -f services/driver-service/Dockerfile .
```

### Run Container

```bash
docker run -p 3003:3003 \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  -e JWT_SECRET=your-secret \
  uitgo-driver-service
```

### Using Docker Compose

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f driver-service

# Stop services
docker compose down
```

## Architecture

### Module Structure

```
src/
├── app.module.ts           # Root module
├── main.ts                 # Application bootstrap
├── auth/                   # Authentication
│   ├── strategies/         # JWT strategy
│   └── guards/             # JWT auth guard, Driver role guard
├── common/                 # Shared utilities
│   ├── decorators/         # CurrentUser decorator
│   └── interfaces/         # JWT payload interface
├── config/                 # Configuration
│   ├── jwt.config.ts       # JWT configuration
│   └── redis.config.ts     # Redis configuration
├── drivers/                # Drivers module
│   ├── drivers.controller.ts
│   ├── drivers.service.ts
│   ├── drivers.module.ts
│   └── dto/
│       ├── update-status.dto.ts
│       ├── driver-status-response.dto.ts
│       ├── update-location.dto.ts
│       └── driver-location-response.dto.ts
├── health/                 # Health check
│   └── health.controller.ts
└── redis/                  # Redis module
    ├── redis.service.ts
    └── redis.module.ts
```

### Key Components

#### DriversService

- Manages driver status updates and retrieval
- Manages driver location updates
- Interacts with Redis for data storage
- Implements business logic for status and location management
- Handles geospatial indexing for location data

#### RedisService

- Extends ioredis client
- Provides health check functionality
- Handles connection lifecycle

#### JwtStrategy & Guards

- Validates JWT tokens from Authorization header
- DriverRoleGuard ensures only users with role=DRIVER can access endpoints

## Troubleshooting

### Redis Connection Failed

- Verify Redis is running: `docker compose ps redis`
- Check Redis connectivity: `redis-cli ping`
- Ensure `REDIS_HOST` and `REDIS_PORT` environment variables are correct

### JWT Token Validation Failed

- Verify `JWT_SECRET` matches across all services
- Check token expiration time
- Ensure Authorization header format: `Bearer {token}`

### Tests Failing

- Clean Redis before tests: `docker exec uitgo-redis redis-cli FLUSHDB`
- Restart Redis: `docker compose restart redis`
- Check test logs for specific error messages

## Future Enhancements

Planned features for subsequent stories:

- Geospatial nearby driver search (Story 3.3)
- Driver location update history
- Status change event notifications
- Advanced driver availability rules (e.g., scheduled breaks, geofence restrictions)
- Real-time location streaming via WebSocket

## Related Documentation

- [Architecture Documentation](../../docs/architecture.md)
- [API Specification](../../docs/api.yml)
- [User Service Documentation](../user-service/README.md)
- [Trip Service Documentation](../trip-service/README.md)

## Contributing

Please refer to the [Contributing Guide](../../CONTRIBUTING.md) for development guidelines and best practices.

## License

UNLICENSED - Private use only
