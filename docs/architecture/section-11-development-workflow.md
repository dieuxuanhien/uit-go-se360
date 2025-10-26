# **SECTION 11: DEVELOPMENT WORKFLOW**

Defining the development setup and workflow for the UIT-Go platform.

## **11.1 Prerequisites**

Before starting development, ensure the following tools are installed:

```bash
# Node.js and pnpm
node --version   # v20.x or higher
pnpm --version   # v8.x or higher

# Docker and Docker Compose
docker --version          # v24.x or higher
docker compose version    # v2.x or higher

# PostgreSQL client (for database access)
psql --version   # v15.x or higher

# Redis client (for debugging)
redis-cli --version   # v7.x or higher

# Terraform (for infrastructure)
terraform --version   # v1.6.x or higher

# AWS CLI (for deployment)
aws --version   # v2.x or higher

# Git
git --version   # v2.x or higher
```

**Installation Commands (Ubuntu/Debian):**

```bash
# Install Node.js 20.x via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Install pnpm
npm install -g pnpm@8

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Install PostgreSQL client
sudo apt-get install postgresql-client

# Install Redis client
sudo apt-get install redis-tools

# Install Terraform
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

---

## **11.2 Initial Setup**

Clone the repository and set up the development environment:

```bash
# Clone repository
git clone https://github.com/your-team/uit-go-se360.git
cd uit-go-se360

# Install all dependencies (monorepo)
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env file with your local configuration
# (Database URLs, Redis URL, JWT secrets, etc.)
nano .env

# Generate Prisma clients for all services
pnpm prisma:generate

# Create local databases
docker compose up -d postgres redis

# Wait for databases to be ready (10 seconds)
sleep 10

# Run database migrations
pnpm migrate:dev

# Seed development data (optional)
pnpm db:seed

# Verify setup
pnpm test
```

---

## **11.3 Development Commands**

All commands run from the repository root using pnpm workspaces:

```bash
# ============================================
# Start All Services (Development Mode)
# ============================================
# Start databases + all microservices with hot reload
pnpm dev

# Alternative: Start with Docker Compose
docker compose up

# ============================================
# Start Individual Services
# ============================================
# Start only UserService
pnpm dev:user-service

# Start only TripService
pnpm dev:trip-service

# Start only DriverService
pnpm dev:driver-service

# ============================================
# Database Commands
# ============================================
# Generate Prisma clients
pnpm prisma:generate

# Create a new migration
pnpm --filter user-service prisma migrate dev --name add_user_avatar

# Run migrations on all services
pnpm migrate:dev

# Reset database (drop + recreate + migrate)
pnpm db:reset

# Seed database with test data
pnpm db:seed

# Open Prisma Studio (database GUI)
pnpm --filter user-service prisma studio

# ============================================
# Testing Commands
# ============================================
# Run all tests
pnpm test

# Run tests for specific service
pnpm --filter user-service test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Run tests with coverage
pnpm test:cov

# ============================================
# Code Quality Commands
# ============================================
# Lint all code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format all code
pnpm format

# Type check
pnpm typecheck

# ============================================
# Build Commands
# ============================================
# Build all services for production
pnpm build

# Build specific service
pnpm --filter user-service build

# Build Docker images
docker compose -f docker-compose.prod.yml build

# ============================================
# Docker Commands
# ============================================
# Start all services in Docker
docker compose up

# Start in detached mode
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f user-service

# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v

# Rebuild and restart
docker compose up --build

# ============================================
# Infrastructure Commands
# ============================================
# Validate Terraform
cd infrastructure/terraform/environments/dev
terraform init
terraform validate

# Plan infrastructure changes
terraform plan

# Apply infrastructure changes
terraform apply

# Destroy infrastructure
terraform destroy

# ============================================
# AWS Deployment Commands
# ============================================
# Build and push to ECR
./scripts/build-and-push.sh

# Deploy to AWS ECS
./scripts/deploy-to-ecs.sh dev

# View ECS service logs
aws logs tail /ecs/user-service --follow

# ============================================
# Git Workflow Commands
# ============================================
# Create feature branch
git checkout -b feature/add-trip-notifications

# Run pre-commit checks (automatic via Husky)
git commit -m "feat: add trip notifications"

# Push and create PR
git push origin feature/add-trip-notifications
```

---

## **11.4 Environment Configuration**

**Local Development (.env):**

```bash
# ============================================
# Database Configuration
# ============================================
# UserService Database
USER_SERVICE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/uitgo_user?schema=public"

# TripService Database
TRIP_SERVICE_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/uitgo_trip?schema=public"

# Redis (DriverService)
REDIS_URL="redis://localhost:6379"

# ============================================
# Service URLs (for inter-service communication)
# ============================================
USER_SERVICE_URL="http://localhost:3001"
TRIP_SERVICE_URL="http://localhost:3002"
DRIVER_SERVICE_URL="http://localhost:3003"

# ============================================
# Authentication
# ============================================
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# ============================================
# Application Configuration
# ============================================
NODE_ENV="development"
LOG_LEVEL="debug"

# Service Ports
USER_SERVICE_PORT=3001
TRIP_SERVICE_PORT=3002
DRIVER_SERVICE_PORT=3003

# ============================================
# AWS Configuration (for development testing)
# ============================================
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"

# ============================================
# Optional: External APIs (Phase 2)
# ============================================
# GOOGLE_MAPS_API_KEY="your-api-key"
# ENABLE_EXTERNAL_GEOCODING="false"
```

**Docker Compose Environment (.env for docker-compose.yml):**

```bash
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=uitgo

# Redis
REDIS_PASSWORD=""

# Services
USER_SERVICE_PORT=3001
TRIP_SERVICE_PORT=3002
DRIVER_SERVICE_PORT=3003
```

---

## **11.5 Docker Compose Configuration**

**docker-compose.yml (Local Development):**

```yaml
version: '3.8'

services:
  # ============================================
  # Databases
  # ============================================
  postgres-user:
    image: postgres:15-alpine
    container_name: uitgo-postgres-user
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: uitgo_user
    ports:
      - '5432:5432'
    volumes:
      - postgres-user-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  postgres-trip:
    image: postgres:15-alpine
    container_name: uitgo-postgres-trip
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: uitgo_trip
    ports:
      - '5433:5432'
    volumes:
      - postgres-trip-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: uitgo-redis
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  # ============================================
  # Microservices
  # ============================================
  user-service:
    build:
      context: .
      dockerfile: services/user-service/Dockerfile
      target: development
    container_name: uitgo-user-service
    ports:
      - '3001:3001'
    environment:
      DATABASE_URL: 'postgresql://postgres:postgres@postgres-user:5432/uitgo_user?schema=public'
      JWT_SECRET: 'dev-secret-change-in-production'
      NODE_ENV: 'development'
      PORT: 3001
    volumes:
      - ./services/user-service/src:/app/src
      - ./packages:/app/packages
    depends_on:
      postgres-user:
        condition: service_healthy
    command: pnpm run start:dev

  trip-service:
    build:
      context: .
      dockerfile: services/trip-service/Dockerfile
      target: development
    container_name: uitgo-trip-service
    ports:
      - '3002:3002'
    environment:
      DATABASE_URL: 'postgresql://postgres:postgres@postgres-trip:5432/uitgo_trip?schema=public'
      USER_SERVICE_URL: 'http://user-service:3001'
      DRIVER_SERVICE_URL: 'http://driver-service:3003'
      JWT_SECRET: 'dev-secret-change-in-production'
      NODE_ENV: 'development'
      PORT: 3002
    volumes:
      - ./services/trip-service/src:/app/src
      - ./packages:/app/packages
    depends_on:
      postgres-trip:
        condition: service_healthy
      user-service:
        condition: service_started
    command: pnpm run start:dev

  driver-service:
    build:
      context: .
      dockerfile: services/driver-service/Dockerfile
      target: development
    container_name: uitgo-driver-service
    ports:
      - '3003:3003'
    environment:
      REDIS_URL: 'redis://redis:6379'
      USER_SERVICE_URL: 'http://user-service:3001'
      JWT_SECRET: 'dev-secret-change-in-production'
      NODE_ENV: 'development'
      PORT: 3003
    volumes:
      - ./services/driver-service/src:/app/src
      - ./packages:/app/packages
    depends_on:
      redis:
        condition: service_healthy
      user-service:
        condition: service_started
    command: pnpm run start:dev

volumes:
  postgres-user-data:
  postgres-trip-data:
  redis-data:
```

---

## **11.6 Development Workflow (Day-to-Day)**

**Typical Development Session:**

```bash
# 1. Start your day
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/trip-cancellation-fee

# 3. Start local environment
docker compose up -d
# OR
pnpm dev

# 4. Make code changes
# Edit files in services/trip-service/src/...

# 5. Run tests
pnpm --filter trip-service test

# 6. Check code quality
pnpm lint
pnpm typecheck

# 7. Commit changes (Husky runs pre-commit hooks)
git add .
git commit -m "feat(trip): add cancellation fee calculation"

# 8. Push and create PR
git push origin feature/trip-cancellation-fee

# 9. End of day - stop services
docker compose down
```

**Pre-commit Hooks (Husky):**

```json
// .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run linting
pnpm lint-staged

# Run type checking
pnpm typecheck

# Run tests for changed files
pnpm test --bail --findRelatedTests
```

**Debugging:**

```bash
# Attach debugger to running service (VS Code)
# Add to .vscode/launch.json:
{
  "type": "node",
  "request": "attach",
  "name": "Attach to UserService",
  "port": 9229,
  "restart": true,
  "sourceMaps": true
}

# Start service with debug flag
pnpm --filter user-service start:debug

# View logs
docker compose logs -f user-service

# Connect to database
psql -h localhost -p 5432 -U postgres -d uitgo_user

# Connect to Redis
redis-cli -h localhost -p 6379
```

---

## **Detailed Rationale:**

**Development Workflow Design:**

1. **pnpm Workspaces:**
   - Single `pnpm install` for all services
   - Shared dependencies cached
   - Filter commands: `pnpm --filter user-service test`

2. **Docker Compose for Local Development:**
   - Consistent environment across team
   - Eliminates "works on my machine" issues
   - Easy to start/stop all services

3. **Hot Reload:**
   - Volume mounts in Docker Compose
   - NestJS watch mode (`start:dev`)
   - Changes reflected without rebuild

4. **Separate Databases:**
   - UserService: port 5432
   - TripService: port 5433
   - Enforces database-per-service pattern locally

5. **Pre-commit Hooks:**
   - Automatic linting and formatting
   - Type checking before commit
   - Prevents broken code from entering repo

6. **Environment Variables:**
   - `.env.example` as template
   - `.env` gitignored (never commit secrets)
   - Different configs for local/dev/prod

7. **Script Shortcuts:**
   - `pnpm dev` starts everything
   - `pnpm test` runs all tests
   - Reduces cognitive load

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (Deployment Architecture)
2. **Expand or Contract for Audience** - Adjust workflow detail
3. **Explain Reasoning (CoT Step-by-Step)** - Deeper dive into workflow design
4. **Critique and Refine** - Challenge these workflow choices
5. **Analyze Logical Flow and Dependencies** - Review workflow coherence
6. **Assess Alignment with Overall Goals** - Verify developer experience
7. **Identify Potential Risks and Unforeseen Issues** - Workflow risks?
8. **Challenge from Critical Perspective** - Devil's advocate on Docker Compose
9. **Tree of Thoughts Deep Dive** - Explore alternative workflows

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Deployment Architecture section.

---
