# **SECTION 6: COMPONENTS**

Based on the architectural patterns, tech stack, and data models, here are the major logical components across the fullstack system:

---

## **6.1 UserService**

**Responsibility:** Manages user authentication, authorization, and profile information for both passengers and drivers. Owns the User and DriverProfile data models with exclusive database access.

**Key Interfaces:**

- `POST /users/register` - User registration with role selection
- `POST /users/login` - Authentication and JWT token issuance
- `GET /users/me` - Retrieve current user profile
- `POST /users/driver-profile` - Create driver-specific profile with vehicle information
- `GET /users/driver-profile` - Retrieve driver profile details
- `GET /users/{userId}` (internal) - Fetch user details for other services

**Dependencies:**

- AWS Secrets Manager - Database credentials
- RDS PostgreSQL - User and DriverProfile persistence
- CloudWatch Logs - Application logging

**Technology Stack:**

- NestJS 10.x with TypeScript 5.3.x
- Prisma 5.x ORM for PostgreSQL access
- bcrypt 5.x for password hashing
- jsonwebtoken 9.x for JWT generation/validation
- class-validator 0.14.x for request validation

**Internal Architecture:**

```
UserService/
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts       # /register, /login endpoints
│   │   ├── auth.service.ts          # Authentication logic
│   │   ├── jwt.strategy.ts          # Passport JWT validation
│   │   └── guards/
│   │       └── jwt-auth.guard.ts    # Protect routes with JWT
│   ├── users/
│   │   ├── users.controller.ts      # /users/me endpoint
│   │   ├── users.service.ts         # User CRUD operations
│   │   └── users.repository.ts      # Prisma database access
│   ├── driver-profiles/
│   │   ├── driver-profiles.controller.ts
│   │   ├── driver-profiles.service.ts
│   │   └── driver-profiles.repository.ts
│   ├── common/
│   │   ├── filters/                 # Exception filters
│   │   ├── interceptors/            # Logging interceptors
│   │   └── validators/              # Custom validators
│   └── main.ts                      # Application bootstrap
```

---

## **6.2 TripService**

**Responsibility:** Central orchestrator for ride lifecycle management. Handles trip creation, state transitions (REQUESTED → DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED/CANCELLED), driver-trip matching, and rating collection. Coordinates with UserService and DriverService.

**Key Interfaces:**

- `POST /trips` - Create new trip request with fare estimation
- `GET /trips` - List user's trip history with filtering
- `GET /trips/{tripId}` - Retrieve trip details
- `POST /trips/{tripId}/accept` - Driver accepts trip request
- `POST /trips/{tripId}/start` - Mark trip as in-progress
- `POST /trips/{tripId}/complete` - Complete trip and calculate final fare
- `POST /trips/{tripId}/cancel` - Cancel trip with reason
- `POST /trips/{tripId}/rating` - Passenger rates completed trip

**Dependencies:**

- AWS Secrets Manager - Database credentials
- RDS PostgreSQL - Trip and Rating persistence
- UserService API - Fetch user/driver details for responses
- DriverService API - Search nearby drivers when trip created
- CloudWatch Logs - Application logging

**Technology Stack:**

- NestJS 10.x with TypeScript 5.3.x
- Prisma 5.x ORM for PostgreSQL access
- axios/node-fetch for HTTP client (service-to-service calls)
- class-validator 0.14.x for request validation

**Internal Architecture:**

```
TripService/
├── src/
│   ├── trips/
│   │   ├── trips.controller.ts          # Trip endpoints
│   │   ├── trips.service.ts             # Business logic
│   │   ├── trips.repository.ts          # Database access
│   │   ├── trip-state-machine.ts        # State transition validation
│   │   └── fare-calculator.service.ts   # Fare estimation algorithm
│   ├── ratings/
│   │   ├── ratings.controller.ts
│   │   ├── ratings.service.ts
│   │   └── ratings.repository.ts
│   ├── integrations/
│   │   ├── user-service.client.ts       # HTTP client for UserService
│   │   └── driver-service.client.ts     # HTTP client for DriverService
│   ├── common/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   └── validators/
│   └── main.ts
```

**State Machine Logic:**

```typescript
// Allowed transitions
REQUESTED → DRIVER_ASSIGNED (via /accept)
REQUESTED → CANCELLED (via /cancel)
DRIVER_ASSIGNED → IN_PROGRESS (via /start)
DRIVER_ASSIGNED → CANCELLED (via /cancel)
IN_PROGRESS → COMPLETED (via /complete)
IN_PROGRESS → CANCELLED (via /cancel)
```

---

## **6.3 DriverService**

**Responsibility:** Real-time driver location tracking and geospatial queries. Manages driver online/offline status and provides sub-second nearby driver searches using Redis GEORADIUS commands. Ephemeral data storage optimized for high-throughput writes.

**Key Interfaces:**

- `PUT /drivers/location` - Update driver GPS coordinates
- `PUT /drivers/status` - Toggle online/offline availability
- `GET /drivers/search?lat={lat}&lng={lng}&radius={km}` - Find nearby available drivers

**Dependencies:**

- AWS Secrets Manager - Redis credentials
- ElastiCache Redis - Location data with geospatial indexing
- UserService API - Validate driver authorization
- CloudWatch Logs - Application logging

**Technology Stack:**

- NestJS 10.x with TypeScript 5.3.x
- ioredis 5.x for Redis connections with geospatial commands
- class-validator 0.14.x for request validation

**Internal Architecture:**

```
DriverService/
├── src/
│   ├── drivers/
│   │   ├── drivers.controller.ts        # Driver location endpoints
│   │   ├── drivers.service.ts           # Business logic
│   │   └── drivers.repository.ts        # Redis GEOADD/GEORADIUS
│   ├── integrations/
│   │   └── user-service.client.ts       # Validate driver role
│   ├── common/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   └── validators/
│   └── main.ts
```

**Redis Data Structures:**

```
# Geospatial index (all online drivers)
GEOADD driver:geo <longitude> <latitude> <driverId>

# Driver metadata (per driver)
SET driver:location:{driverId} JSON.stringify({
  driverId, isOnline, heading, speed, accuracy, timestamp
})

# Driver online status index (for fast filtering)
SADD driver:online <driverId>

# Query example
GEORADIUS driver:geo 106.660172 10.762622 5 km WITHDIST ASC COUNT 10
```

---

## **6.4 Application Load Balancer (ALB)**

**Responsibility:** Single entry point for all API traffic. Provides TLS termination, path-based routing to microservices, health check monitoring, and request distribution.

**Key Interfaces:**

- HTTPS listener on port 443 (TLS 1.2+)
- Path routing rules:
  - `/users/*` → UserService target group
  - `/trips/*` → TripService target group
  - `/drivers/*` → DriverService target group

**Dependencies:**

- ACM (AWS Certificate Manager) - TLS certificate
- ECS Fargate - Target groups for each service
- Route 53 - DNS resolution (optional)
- CloudWatch Metrics - Request count, latency, error rates

**Technology Stack:**

- AWS Application Load Balancer
- Target Groups with health check configuration
- Security Groups for traffic control

**Health Check Configuration:**

```
Protocol: HTTP
Path: /health
Healthy threshold: 2
Unhealthy threshold: 3
Timeout: 5 seconds
Interval: 30 seconds
Success codes: 200
```

---

## **6.5 Shared Types Package**

**Responsibility:** Single source of truth for TypeScript interfaces shared across all microservices. Ensures type consistency for data models, DTOs, and enums.

**Key Interfaces:**

- Data models: `User`, `DriverProfile`, `Trip`, `Rating`, `DriverLocation`
- DTOs: `UserDTO`, `TripDTO`, `RatingDTO`, `NearbyDriver`
- Enums: `UserRole`, `TripStatus`, `DriverApprovalStatus`
- Request/Response types for all API endpoints

**Dependencies:**

- None (pure TypeScript types)

**Technology Stack:**

- TypeScript 5.3.x
- Published as internal npm package within monorepo

**Package Structure:**

```
packages/shared-types/
├── src/
│   ├── models/
│   │   ├── user.types.ts
│   │   ├── trip.types.ts
│   │   ├── driver.types.ts
│   │   └── rating.types.ts
│   ├── dtos/
│   │   ├── auth.dto.ts
│   │   ├── trip.dto.ts
│   │   └── driver.dto.ts
│   ├── enums/
│   │   └── index.ts
│   └── index.ts                    # Barrel export
└── package.json
```

---

## **6.6 Infrastructure Module (Terraform)**

**Responsibility:** Defines all AWS resources as code. Manages VPC networking, ECS clusters, RDS databases, ElastiCache Redis, ALB, IAM roles, and Security Groups. Ensures reproducible infrastructure deployment.

**Key Components:**

- VPC with public/private subnets across 2 AZs
- ECS Fargate cluster with 3 services
- RDS PostgreSQL instances (2 databases)
- ElastiCache Redis cluster
- Application Load Balancer with target groups
- IAM roles with least-privilege policies
- Security Groups for network segmentation
- Secrets Manager for credential storage
- CloudWatch Log Groups

**Dependencies:**

- Terraform 1.6.x
- AWS Provider
- Terraform State (S3 backend recommended)

**Technology Stack:**

- Terraform HCL
- AWS CLI (for manual operations)

**Module Structure:**

```
infrastructure/terraform/
├── modules/
│   ├── networking/              # VPC, subnets, NAT gateway
│   ├── ecs/                     # ECS cluster, services, tasks
│   ├── rds/                     # PostgreSQL instances
│   ├── elasticache/             # Redis cluster
│   ├── alb/                     # Load balancer config
│   └── iam/                     # Roles and policies
├── environments/
│   ├── dev/
│   │   └── main.tf
│   └── prod/
│       └── main.tf
├── variables.tf
├── outputs.tf
└── backend.tf                   # S3 state storage
```

---

## **6.7 CI/CD Pipeline (GitHub Actions)**

**Responsibility:** Automated testing, building, and deployment workflow. Runs on every pull request and main branch push. Builds Docker images, pushes to ECR, and updates ECS services.

**Key Workflows:**

- `ci.yml` - Run tests and linting on PRs
- `build-and-push.yml` - Build Docker images and push to ECR
- `deploy.yml` - Deploy to ECS after successful build
- `terraform.yml` - Validate and apply infrastructure changes

**Dependencies:**

- GitHub Actions runners
- AWS credentials (stored as GitHub secrets)
- ECR repositories
- ECS services

**Technology Stack:**

- GitHub Actions YAML
- Docker buildx for multi-platform builds
- AWS CLI for ECS deployments

**Workflow Example:**

```yaml
# .github/workflows/ci.yml
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test
      - run: pnpm lint
```

---

## **6.8 Component Diagram**

```mermaid
C4Component
    title Component Diagram - UIT-Go System

    Container_Boundary(aws, "AWS Cloud") {
        Component(alb, "Application Load Balancer", "AWS ALB", "Routes traffic, TLS termination")

        Container_Boundary(ecs, "ECS Fargate Cluster") {
            Component(user_svc, "UserService", "NestJS + Prisma", "Authentication & user management")
            Component(trip_svc, "TripService", "NestJS + Prisma", "Trip lifecycle & state machine")
            Component(driver_svc, "DriverService", "NestJS + ioredis", "Location tracking & search")
        }

        Container_Boundary(data, "Data Layer") {
            ComponentDb(user_db, "User Database", "RDS PostgreSQL", "User, DriverProfile, Rating")
            ComponentDb(trip_db, "Trip Database", "RDS PostgreSQL", "Trip records")
            ComponentDb(redis, "Location Cache", "ElastiCache Redis", "Driver geospatial data")
        }

        Component(secrets, "Secrets Manager", "AWS", "Credentials storage")
        Component(cloudwatch, "CloudWatch", "AWS", "Logs & metrics")
        Component(ecr, "ECR", "AWS", "Container registry")
    }

    Container_Boundary(dev, "Development") {
        Component(github, "GitHub Actions", "CI/CD", "Automated pipeline")
        Component(terraform, "Terraform", "IaC", "Infrastructure provisioning")
    }

    Person(client, "API Client", "Postman/Mobile App")

    Rel(client, alb, "HTTPS requests", "JSON/REST")
    Rel(alb, user_svc, "Routes /users/*", "HTTP")
    Rel(alb, trip_svc, "Routes /trips/*", "HTTP")
    Rel(alb, driver_svc, "Routes /drivers/*", "HTTP")

    Rel(user_svc, user_db, "Reads/Writes", "SQL")
    Rel(trip_svc, trip_db, "Reads/Writes", "SQL")
    Rel(driver_svc, redis, "GEOADD/GEORADIUS", "Redis Protocol")

    Rel(trip_svc, user_svc, "Fetch user details", "REST API")
    Rel(trip_svc, driver_svc, "Search nearby drivers", "REST API")

    Rel(user_svc, secrets, "Fetch credentials", "AWS SDK")
    Rel(trip_svc, secrets, "Fetch credentials", "AWS SDK")
    Rel(driver_svc, secrets, "Fetch credentials", "AWS SDK")

    Rel(user_svc, cloudwatch, "Logs", "AWS SDK")
    Rel(trip_svc, cloudwatch, "Logs", "AWS SDK")
    Rel(driver_svc, cloudwatch, "Logs", "AWS SDK")

    Rel(github, ecr, "Push images", "Docker")
    Rel(github, ecs, "Update services", "AWS CLI")
    Rel(terraform, aws, "Provision resources", "Terraform Provider")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

---

## **Detailed Rationale:**

**Component Boundaries:**

- **Clear separation of concerns:** Each service owns its data and business logic
- **Independent scalability:** Services can scale horizontally without affecting others
- **Database per service:** No shared database access prevents tight coupling
- **API-based communication:** Services communicate only through well-defined REST APIs

**Service Communication Patterns:**

- **Synchronous REST calls:** TripService → UserService/DriverService for data enrichment
- **No message queues in Phase 1:** Simplicity over complexity; can add SQS in Phase 2 Scalability module
- **Circuit breaker pattern:** Can implement in Phase 2 Reliability module using resilience libraries

**Technology Consistency:**

- **All services use NestJS:** Reduces context switching, shared knowledge
- **TypeScript everywhere:** Type safety from API to database
- **Prisma for SQL, ioredis for Redis:** Best-in-class libraries for each datastore

**Deployment Independence:**

- **Separate ECS services:** Each microservice deploys independently
- **Separate Docker images:** Build and push only changed services
- **Version tagging:** `user-service:v1.2.3` enables rollback capability

**Infrastructure as Code Benefits:**

- **Reproducibility:** `terraform apply` recreates entire environment
- **Version control:** Infrastructure changes tracked in Git
- **Collaboration:** Team reviews Terraform PRs before changes
- **Disaster recovery:** Can rebuild production in minutes

**Why ALB over API Gateway:**

- **Cost:** ALB is cheaper for sustained traffic ($16/month + data transfer)
- **Simplicity:** Path-based routing is all we need
- **ECS integration:** Native target group support
- **Can upgrade later:** If Phase 2 requires API Gateway features (rate limiting, request transformation), can add in front of ALB

**Shared Types Package Benefits:**

- **Type safety:** Compile-time checks prevent API contract violations
- **Single source of truth:** Update type once, propagates everywhere
- **Refactoring safety:** TypeScript compiler catches breaking changes
- **Monorepo advantage:** No need to publish to npm registry

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (External APIs)
2. **Expand or Contract for Audience** - Adjust component detail
3. **Explain Reasoning (CoT Step-by-Step)** - Deeper dive into component design
4. **Critique and Refine** - Challenge component boundaries
5. **Analyze Logical Flow and Dependencies** - Review component interactions
6. **Assess Alignment with Overall Goals** - Verify architecture goals
7. **Identify Potential Risks and Unforeseen Issues** - Component risks?
8. **Challenge from Critical Perspective** - Devil's advocate on service boundaries
9. **Tree of Thoughts Deep Dive** - Explore alternative component designs

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to External APIs section.

---
