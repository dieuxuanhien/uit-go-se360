# UIT-Go: Microservices Ride-Sharing Platform

A modern microservices-based ride-sharing platform built with NestJS, TypeScript, PostgreSQL, and Redis. This monorepo contains three independent microservices (User Service, Trip Service, Driver Service) that communicate via REST APIs and Redis pub/sub for real-time updates.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Development Workflow](#development-workflow)
- [Database Access](#database-access)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## 🎯 Overview

UIT-Go is a comprehensive ride-sharing platform designed to handle user management, trip coordination, and driver operations through independent, scalable microservices. Each service is responsible for a specific domain and communicates with other services through well-defined APIs.

**Key Features:**

- Scalable microservices architecture with shared packages
- Type-safe development with TypeScript strict mode
- Local development environment with Docker Compose
- Comprehensive code quality tooling (ESLint, Prettier, Husky)
- Monorepo management with pnpm workspaces

## 🏗️ Architecture

The project uses a **microservices architecture** with the following key principles:

- **Service Independence:** Each service has its own database, deployment cycle, and repository boundary
- **Shared Packages:** Common types, utilities, and constants are shared via npm packages
- **Async Communication:** Services communicate via REST APIs and Redis pub/sub
- **Local Development:** Complete environment runs locally with Docker Compose

### Microservices

1. **User Service** (Port 3001)
   - User registration, authentication, profile management
   - Manages user data, preferences, and authentication

2. **Trip Service** (Port 3002)
   - Trip creation, management, and coordination
   - Handles trip lifecycle from booking to completion

3. **Driver Service** (Port 3003)
   - Driver management and availability
   - Location tracking and driver preferences

## 📦 Prerequisites

Before getting started, ensure you have the following installed:

| Tool              | Version        | Purpose                                |
| ----------------- | -------------- | -------------------------------------- |
| Node.js           | 20.x or higher | JavaScript runtime                     |
| pnpm              | 8.x or higher  | Package manager with workspace support |
| Docker            | 24.x or higher | Container runtime                      |
| Docker Compose    | 2.x or higher  | Multi-container orchestration          |
| PostgreSQL Client | 15.x or higher | Database connection testing            |
| Redis CLI         | 7.x or higher  | Redis connection testing               |

### Verify Installation

```bash
node --version      # Should be v20.x or higher
pnpm --version      # Should be 8.x or higher
docker --version    # Should be 24.x or higher
docker compose version # Should be 2.x or higher
psql --version      # Should be 15.x or higher
redis-cli --version # Should be 7.x or higher
```

## 🚀 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/dieuxuanhien/uit-go-se360.git
cd uit-go-se360
```

### Step 2: Install Dependencies

```bash
pnpm install
```

This installs dependencies for the root workspace, services, and shared packages.

### Step 3: Configure Environment

```bash
cp .env.example .env
```

The `.env` file contains all required configuration. Default values work for local development.

### Step 4: Start Database Services

```bash
docker compose up -d
```

This starts:

- PostgreSQL for User Service (port 5432)
- PostgreSQL for Trip Service (port 5433)
- Redis (port 6379)

### Step 5: Verify Setup

```bash
# Test databases are running
docker compose ps

# Test PostgreSQL connections
psql -h localhost -p 5432 -U postgres -d uitgo_user -c "SELECT version();"
psql -h localhost -p 5433 -U postgres -d uitgo_trip -c "SELECT version();"

# Test Redis connection
redis-cli -h localhost -p 6379 ping
```

## 📁 Project Structure

```
uit-go-se360/
├── services/                          # Microservices
│   ├── user-service/                  # User management service
│   │   ├── src/                       # TypeScript source code
│   │   ├── test/                      # Test files
│   │   ├── prisma/                    # Database schema
│   │   └── package.json               # Service dependencies
│   ├── trip-service/                  # Trip coordination service
│   └── driver-service/                # Driver management service
│
├── packages/                          # Shared workspace packages
│   ├── shared-types/                  # TypeScript interfaces and types
│   │   └── src/
│   │       └── index.ts               # Exported types
│   └── common-utils/                  # Utility functions and helpers
│       └── src/
│           └── index.ts               # Exported utilities
│
├── infrastructure/                    # Infrastructure as Code
│   └── terraform/                     # Terraform IaC configuration
│
├── scripts/                           # Build and deployment scripts
├── docs/                              # Project documentation
│
├── docker-compose.yml                 # Local development environment
├── pnpm-workspace.yaml                # pnpm workspace configuration
├── package.json                       # Root package with scripts
├── tsconfig.json                      # TypeScript base configuration
├── tsconfig.build.json                # TypeScript production build config
├── .eslintrc.js                       # ESLint configuration
├── .prettierrc                        # Prettier code formatting config
├── .lintstagedrc.json                 # Lint-staged pre-commit config
├── .env.example                       # Environment variables template
├── .gitignore                         # Git ignore rules
└── README.md                          # This file
```

### Service Structure (Each Service)

```
services/user-service/
├── src/
│   ├── main.ts                        # Application entry point
│   ├── app.module.ts                  # Root NestJS module
│   ├── controllers/                   # HTTP request handlers
│   ├── services/                      # Business logic
│   ├── entities/                      # TypeORM/Prisma entities
│   ├── dto/                           # Data Transfer Objects
│   └── filters/                       # Exception filters
├── test/
│   ├── app.e2e-spec.ts                # End-to-end tests
│   └── jest-e2e.json                  # Test configuration
├── prisma/
│   ├── schema.prisma                  # Database schema
│   └── migrations/                    # Database migrations
├── Dockerfile                         # Container image definition
├── package.json                       # Service dependencies
└── tsconfig.json                      # Service-specific TypeScript config
```

## 📝 Available Scripts

All scripts are run from the root directory using pnpm:

### Development & Building

| Script | Command      | Description                            |
| ------ | ------------ | -------------------------------------- |
| dev    | `pnpm dev`   | Start all services in development mode |
| build  | `pnpm build` | Build all services and packages        |

### Testing

| Script     | Command           | Description                     |
| ---------- | ----------------- | ------------------------------- |
| test       | `pnpm test`       | Run all tests across workspaces |
| test:watch | `pnpm test:watch` | Run tests in watch mode         |
| test:cov   | `pnpm test:cov`   | Run tests with coverage reports |

### Code Quality

| Script    | Command          | Description                   |
| --------- | ---------------- | ----------------------------- |
| lint      | `pnpm lint`      | Lint all TypeScript files     |
| lint:fix  | `pnpm lint:fix`  | Auto-fix linting issues       |
| format    | `pnpm format`    | Format all code with Prettier |
| typecheck | `pnpm typecheck` | Run TypeScript type checking  |

### Database

| Script          | Command                | Description                   |
| --------------- | ---------------------- | ----------------------------- |
| prisma:generate | `pnpm prisma:generate` | Generate Prisma clients       |
| migrate:dev     | `pnpm migrate:dev`     | Run migrations in development |
| migrate:deploy  | `pnpm migrate:deploy`  | Run migrations in production  |

### Service-Specific Commands

Run commands for a specific service using pnpm filter:

```bash
# Build only user-service
pnpm --filter user-service build

# Run tests for trip-service
pnpm --filter trip-service test

# Lint only driver-service
pnpm --filter driver-service lint
```

## 💻 Development Workflow

### Starting Development

1. **Ensure databases are running:**

   ```bash
   docker compose up -d
   ```

2. **Type check all code:**

   ```bash
   pnpm typecheck
   ```

3. **Fix linting issues:**

   ```bash
   pnpm lint:fix
   ```

4. **Format code:**
   ```bash
   pnpm format
   ```

### Making Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make code changes (auto-formatted on commit via Husky)
3. Run tests: `pnpm test`
4. Commit changes (pre-commit hooks run automatically)
5. Push to repository

### Common Development Tasks

**Add a dependency to a service:**

```bash
pnpm --filter user-service add lodash
```

**Add a shared type to shared-types package:**

```bash
pnpm --filter shared-types add some-package
```

**Generate Prisma client:**

```bash
pnpm --filter user-service prisma generate
```

## 🗄️ Database Access

### PostgreSQL User Service (Port 5432)

```bash
# Connect via psql
psql -h localhost -p 5432 -U postgres -d uitgo_user

# Connection string
postgresql://postgres:postgres@localhost:5432/uitgo_user
```

### PostgreSQL Trip Service (Port 5433)

```bash
# Connect via psql
psql -h localhost -p 5433 -U postgres -d uitgo_trip

# Connection string
postgresql://postgres:postgres@localhost:5433/uitgo_trip
```

### Redis (Port 6379)

```bash
# Connect via redis-cli
redis-cli -h localhost -p 6379

# Common commands
redis-cli PING           # Check connectivity
redis-cli FLUSHALL       # Clear all data (development only!)
redis-cli MONITOR        # Monitor all commands
```

### Database Management

**Backup user database:**

```bash
pg_dump -h localhost -p 5432 -U postgres -d uitgo_user > backup.sql
```

**Restore user database:**

```bash
psql -h localhost -p 5432 -U postgres -d uitgo_user < backup.sql
```

## 🐛 Troubleshooting

### Port Already in Use

**Error:** `Address already in use`

**Solution:**

```bash
# Find process using the port
lsof -i :5432  # For PostgreSQL User Service
lsof -i :5433  # For PostgreSQL Trip Service
lsof -i :6379  # For Redis

# Kill the process
kill -9 <PID>

# Or stop containers
docker compose down
docker compose up -d
```

### Database Connection Failed

**Error:** `unable to connect to database server`

**Solution:**

```bash
# Check containers are running
docker compose ps

# View container logs
docker compose logs postgres-user
docker compose logs postgres-trip
docker compose logs redis

# Restart containers
docker compose restart

# Verify with health check
docker compose ps --filter "health=healthy"
```

### pnpm install Fails

**Error:** `ERR_PNPM_FETCH_404`

**Solution:**

```bash
# Clear pnpm cache
pnpm store prune

# Try install again
pnpm install
```

### TypeScript Errors

**Error:** `Type error in service`

**Solution:**

```bash
# Run type check to see all errors
pnpm typecheck

# Check specific service
pnpm --filter user-service exec tsc --noEmit
```

### ESLint Errors

**Error:** `ESLint configuration not found`

**Solution:**

```bash
# Reinstall dependencies
pnpm install

# Clear ESLint cache
pnpm lint -- --no-cache

# Auto-fix issues
pnpm lint:fix
```

## 📚 Documentation

- **[PRD & Requirements](docs/prd/)** - Product requirements and specifications
- **[Architecture Documentation](docs/architecture/)** - Detailed system design
- **[Coding Standards](docs/architecture/section-15-coding-standards.md)** - Code style and conventions
- **[Testing Strategy](docs/architecture/section-14-testing-strategy.md)** - Testing approach
- **[Development Workflow](docs/architecture/section-11-development-workflow.md)** - Development guidelines

---

**Last Updated:** October 26, 2025  
**Repository:** https://github.com/dieuxuanhien/uit-go-se360  
**License:** MIT
