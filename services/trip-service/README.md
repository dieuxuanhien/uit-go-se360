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
