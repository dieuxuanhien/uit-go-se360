## **SECTION 11: DEVELOPMENT WORKFLOW**

Defining the development setup and workflow for the UIT-Go platform.

### **11.1 Prerequisites**

Before starting development, ensure the following tools are installed:

```bash

# Node.js and pnpm

node--version# v20.x or higher

pnpm--version# v8.x or higher


# Docker and Docker Compose

docker--version# v24.x or higher

dockercomposeversion# v2.x or higher


# PostgreSQL client (for database access)

psql--version# v15.x or higher


# Redis client (for debugging)

redis-cli--version# v7.x or higher


# Terraform (for infrastructure)

terraform--version# v1.6.x or higher


# AWS CLI (for deployment)

aws--version# v2.x or higher


# Git

git--version# v2.x or higher

```

**Installation Commands (Ubuntu/Debian):**

```bash

# Install Node.js 20.x via nvm

curl-o-https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

nvminstall20

nvmuse20


# Install pnpm

npminstall-gpnpm@8


# Install Docker

curl-fsSLhttps://get.docker.com-oget-docker.sh

sudoshget-docker.sh

sudousermod-aGdocker$USER


# Install Docker Compose

sudoapt-getupdate

sudoapt-getinstalldocker-compose-plugin


# Install PostgreSQL client

sudoapt-getinstallpostgresql-client


# Install Redis client

sudoapt-getinstallredis-tools


# Install Terraform

wgethttps://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip

unzipterraform_1.6.0_linux_amd64.zip

sudomvterraform/usr/local/bin/


# Install AWS CLI

curl"https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"-o"awscliv2.zip"

unzipawscliv2.zip

sudo./aws/install

```

---

### **11.2 Initial Setup**

Clone the repository and set up the development environment:

```bash

# Clone repository

gitclonehttps://github.com/your-team/uit-go-se360.git

cduit-go-se360


# Install all dependencies (monorepo)

pnpminstall


# Copy environment template

cp.env.example.env


# Edit .env file with your local configuration

# (Database URLs, Redis URL, JWT secrets, etc.)

nano.env


# Generate Prisma clients for all services

pnpmprisma:generate


# Create local databases

dockercomposeup-dpostgresredis


# Wait for databases to be ready (10 seconds)

sleep10


# Run database migrations

pnpmmigrate:dev


# Seed development data (optional)

pnpmdb:seed


# Verify setup

pnpmtest

```

---

### **11.3 Development Commands**

All commands run from the repository root using pnpm workspaces:

```bash

# ============================================

# Start All Services (Development Mode)

# ============================================

# Start databases + all microservices with hot reload

pnpmdev


# Alternative: Start with Docker Compose

dockercomposeup


# ============================================

# Start Individual Services

# ============================================

# Start only UserService

pnpmdev:user-service


# Start only TripService

pnpmdev:trip-service


# Start only DriverService

pnpmdev:driver-service


# ============================================

# Database Commands

# ============================================

# Generate Prisma clients

pnpmprisma:generate


# Create a new migration

pnpm--filteruser-serviceprismamigratedev--nameadd_user_avatar


# Run migrations on all services

pnpmmigrate:dev


# Reset database (drop + recreate + migrate)

pnpmdb:reset


# Seed database with test data

pnpmdb:seed


# Open Prisma Studio (database GUI)

pnpm--filteruser-serviceprismastudio


# ============================================

# Testing Commands

# ============================================

# Run all tests

pnpmtest


# Run tests for specific service

pnpm--filteruser-servicetest


# Run tests in watch mode

pnpmtest:watch


# Run E2E tests

pnpmtest:e2e


# Run tests with coverage

pnpmtest:cov


# ============================================

# Code Quality Commands

# ============================================

# Lint all code

pnpmlint


# Fix linting issues

pnpmlint:fix


# Format all code

pnpmformat


# Type check

pnpmtypecheck


# ============================================

# Build Commands

# ============================================

# Build all services for production

pnpmbuild


# Build specific service

pnpm--filteruser-servicebuild


# Build Docker images

dockercompose-fdocker-compose.prod.ymlbuild


# ============================================

# Docker Commands

# ============================================

# Start all services in Docker

dockercomposeup


# Start in detached mode

dockercomposeup-d


# View logs

dockercomposelogs-f


# View logs for specific service

dockercomposelogs-fuser-service


# Stop all services

dockercomposedown


# Stop and remove volumes

dockercomposedown-v


# Rebuild and restart

dockercomposeup--build


# ============================================

# Infrastructure Commands

# ============================================

# Validate Terraform

cdinfrastructure/terraform/environments/dev

terraforminit

terraformvalidate


# Plan infrastructure changes

terraformplan


# Apply infrastructure changes

terraformapply


# Destroy infrastructure

terraformdestroy


# ============================================

# AWS Deployment Commands

# ============================================

# Build and push to ECR

./scripts/build-and-push.sh


# Deploy to AWS ECS

./scripts/deploy-to-ecs.shdev


# View ECS service logs

awslogstail/ecs/user-service--follow


# ============================================

# Git Workflow Commands

# ============================================

# Create feature branch

gitcheckout-bfeature/add-trip-notifications


# Run pre-commit checks (automatic via Husky)

gitcommit-m"feat: add trip notifications"


# Push and create PR

gitpushoriginfeature/add-trip-notifications

```

---

### **11.4 Environment Configuration**

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

### **11.5 Docker Compose Configuration**

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

      - "5432:5432"

volumes:

      - postgres-user-data:/var/lib/postgresql/data

healthcheck:

test: ["CMD-SHELL", "pg_isready -U postgres"]

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

      - "5433:5432"

volumes:

      - postgres-trip-data:/var/lib/postgresql/data

healthcheck:

test: ["CMD-SHELL", "pg_isready -U postgres"]

interval: 10s

timeout: 5s

retries: 5


redis:

image: redis:7-alpine

container_name: uitgo-redis

ports:

      - "6379:6379"

volumes:

      - redis-data:/data

command: redis-server --appendonly yes

healthcheck:

test: ["CMD", "redis-cli", "ping"]

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

      - "3001:3001"

environment:

DATABASE_URL: "postgresql://postgres:postgres@postgres-user:5432/uitgo_user?schema=public"

JWT_SECRET: "dev-secret-change-in-production"

NODE_ENV: "development"

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

      - "3002:3002"

environment:

DATABASE_URL: "postgresql://postgres:postgres@postgres-trip:5432/uitgo_trip?schema=public"

USER_SERVICE_URL: "http://user-service:3001"

DRIVER_SERVICE_URL: "http://driver-service:3003"

JWT_SECRET: "dev-secret-change-in-production"

NODE_ENV: "development"

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

      - "3003:3003"

environment:

REDIS_URL: "redis://redis:6379"

USER_SERVICE_URL: "http://user-service:3001"

JWT_SECRET: "dev-secret-change-in-production"

NODE_ENV: "development"

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

### **11.6 Development Workflow (Day-to-Day)**

**Typical Development Session:**

```bash

# 1. Start your day

gitcheckoutmain

gitpulloriginmain


# 2. Create feature branch

gitcheckout-bfeature/trip-cancellation-fee


# 3. Start local environment

dockercomposeup-d

# OR

pnpmdev


# 4. Make code changes

# Edit files in services/trip-service/src/...


# 5. Run tests

pnpm--filtertrip-servicetest


# 6. Check code quality

pnpmlint

pnpmtypecheck


# 7. Commit changes (Husky runs pre-commit hooks)

gitadd.

gitcommit-m"feat(trip): add cancellation fee calculation"


# 8. Push and create PR

gitpushoriginfeature/trip-cancellation-fee


# 9. End of day - stop services

dockercomposedown

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

"type":"node",

"request":"attach",

"name":"Attach to UserService",

"port":9229,

"restart":true,

"sourceMaps":true

}


# Start service with debug flag

pnpm--filteruser-servicestart:debug


# View logs

dockercomposelogs-fuser-service


# Connect to database

psql-hlocalhost-p5432-Upostgres-duitgo_user


# Connect to Redis

redis-cli-hlocalhost-p6379

```

---

### **Detailed Rationale:**

**Development Workflow Design:**

1.**pnpm Workspaces:**

- Single `pnpm install` for all services
- Shared dependencies cached
- Filter commands: `pnpm --filter user-service test`

2.**Docker Compose for Local Development:**

- Consistent environment across team
- Eliminates "works on my machine" issues
- Easy to start/stop all services

3.**Hot Reload:**

- Volume mounts in Docker Compose
- NestJS watch mode (`start:dev`)
- Changes reflected without rebuild

4.**Separate Databases:**

- UserService: port 5432
- TripService: port 5433
- Enforces database-per-service pattern locally

5.**Pre-commit Hooks:**

- Automatic linting and formatting
- Type checking before commit
- Prevents broken code from entering repo

6.**Environment Variables:**

-`.env.example` as template

-`.env` gitignored (never commit secrets)

- Different configs for local/dev/prod

7.**Script Shortcuts:**

-`pnpm dev` starts everything

-`pnpm test` runs all tests

- Reduces cognitive load

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Deployment Architecture)

2.**Expand or Contract for Audience** - Adjust workflow detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into workflow design

4.**Critique and Refine** - Challenge these workflow choices

5.**Analyze Logical Flow and Dependencies** - Review workflow coherence

6.**Assess Alignment with Overall Goals** - Verify developer experience

7.**Identify Potential Risks and Unforeseen Issues** - Workflow risks?

8.**Challenge from Critical Perspective** - Devil's advocate on Docker Compose

9.**Tree of Thoughts Deep Dive** - Explore alternative workflows

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Deployment Architecture section.

---
