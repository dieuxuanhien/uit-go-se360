# Trip Service

The Trip Service manages ride requests, trip lifecycle, and fare calculations for the UIT-Go ride-sharing platform.

## Description

Trip Service is a microservice responsible for:

- Managing trip requests and lifecycle (create, accept, complete, cancel)
- Fare calculation and estimation
- Trip-driver matching coordination
- Trip history and status tracking

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
│   ├── health/              # Health check module
│   ├── prisma/              # Prisma service and module
│   ├── config/              # Configuration modules
│   ├── app.module.ts        # Root application module
│   └── main.ts              # Application entry point
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Migration files
├── test/
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests (E2E)
├── Dockerfile               # Docker configuration
├── package.json             # Dependencies and scripts
└── README.md                # This file
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
