


















## **SECTION 10: UNIFIED PROJECT STRUCTURE**

Complete monorepo structure accommodating all three microservices, shared packages, infrastructure, and documentation.

```plaintext

uit-go-se360/

├── .github/                              # CI/CD workflows

│   └── workflows/

│       ├── ci.yml                        # Test and lint on PRs

│       ├── build-and-push.yml            # Build Docker images, push to ECR

│       ├── deploy-dev.yml                # Deploy to dev environment

│       ├── deploy-prod.yml               # Deploy to prod environment

│       └── terraform.yml                 # Validate and apply IaC changes

│

├── services/                             # Microservices

│   ├── user-service/                     # UserService

│   │   ├── src/

│   │   │   ├── auth/

│   │   │   │   ├── auth.controller.ts    # /register, /login endpoints

│   │   │   │   ├── auth.service.ts       # Authentication logic

│   │   │   │   ├── jwt.strategy.ts       # Passport JWT validation

│   │   │   │   ├── dto/

│   │   │   │   │   ├── register.dto.ts

│   │   │   │   │   └── login.dto.ts

│   │   │   │   └── guards/

│   │   │   │       └── jwt-auth.guard.ts

│   │   │   ├── users/

│   │   │   │   ├── users.controller.ts   # /users/me endpoint

│   │   │   │   ├── users.service.ts      # User CRUD operations

│   │   │   │   └── users.repository.ts   # Prisma database access

│   │   │   ├── driver-profiles/

│   │   │   │   ├── driver-profiles.controller.ts

│   │   │   │   ├── driver-profiles.service.ts

│   │   │   │   ├── driver-profiles.repository.ts

│   │   │   │   └── dto/

│   │   │   │       └── create-driver-profile.dto.ts

│   │   │   ├── ratings/

│   │   │   │   ├── ratings.controller.ts

│   │   │   │   ├── ratings.service.ts

│   │   │   │   └── ratings.repository.ts

│   │   │   ├── common/

│   │   │   │   ├── filters/

│   │   │   │   │   └── http-exception.filter.ts

│   │   │   │   ├── interceptors/

│   │   │   │   │   ├── logging.interceptor.ts

│   │   │   │   │   └── transform.interceptor.ts

│   │   │   │   ├── decorators/

│   │   │   │   │   └── current-user.decorator.ts

│   │   │   │   └── validators/

│   │   │   │       └── password-strength.validator.ts

│   │   │   ├── config/

│   │   │   │   ├── database.config.ts    # Prisma connection

│   │   │   │   └── jwt.config.ts         # JWT secrets

│   │   │   ├── health/

│   │   │   │   └── health.controller.ts  # /health endpoint

│   │   │   ├── app.module.ts             # Root module

│   │   │   └── main.ts                   # Bootstrap application

│   │   ├── prisma/

│   │   │   ├── schema.prisma             # Prisma schema definition

│   │   │   ├── migrations/               # Database migrations

│   │   │   └── seed.ts                   # Seed data for development

│   │   ├── test/

│   │   │   ├── unit/

│   │   │   │   ├── auth.service.spec.ts

│   │   │   │   └── users.service.spec.ts

│   │   │   ├── integration/

│   │   │   │   ├── auth.e2e.spec.ts

│   │   │   │   └── users.e2e.spec.ts

│   │   │   └── test-utils.ts

│   │   ├── Dockerfile                    # Multi-stage Docker build

│   │   ├── .env.example                  # Environment template

│   │   ├── package.json

│   │   ├── tsconfig.json

│   │   ├── nest-cli.json

│   │   └── README.md

│   │

│   ├── trip-service/                     # TripService

│   │   ├── src/

│   │   │   ├── trips/

│   │   │   │   ├── trips.controller.ts   # Trip endpoints

│   │   │   │   ├── trips.service.ts      # Business logic

│   │   │   │   ├── trips.repository.ts   # Database access

│   │   │   │   ├── trip-state-machine.ts # State transition validation

│   │   │   │   ├── fare-calculator.service.ts

│   │   │   │   └── dto/

│   │   │   │       ├── create-trip.dto.ts

│   │   │   │       └── cancel-trip.dto.ts

│   │   │   ├── integrations/

│   │   │   │   ├── user-service.client.ts

│   │   │   │   └── driver-service.client.ts

│   │   │   ├── common/

│   │   │   │   ├── filters/

│   │   │   │   ├── interceptors/

│   │   │   │   └── guards/

│   │   │   │       └── roles.guard.ts

│   │   │   ├── config/

│   │   │   │   ├── database.config.ts

│   │   │   │   └── services.config.ts    # Other service URLs

│   │   │   ├── health/

│   │   │   │   └── health.controller.ts

│   │   │   ├── app.module.ts

│   │   │   └── main.ts

│   │   ├── prisma/

│   │   │   ├── schema.prisma

│   │   │   ├── migrations/

│   │   │   └── seed.ts

│   │   ├── test/

│   │   │   ├── unit/

│   │   │   ├── integration/

│   │   │   └── test-utils.ts

│   │   ├── Dockerfile

│   │   ├── .env.example

│   │   ├── package.json

│   │   ├── tsconfig.json

│   │   └── README.md

│   │

│   └── driver-service/                   # DriverService

│       ├── src/

│       │   ├── drivers/

│       │   │   ├── drivers.controller.ts # Location & status endpoints

│       │   │   ├── drivers.service.ts    # Business logic

│       │   │   ├── drivers.repository.ts # Redis GEORADIUS operations

│       │   │   └── dto/

│       │   │       ├── update-location.dto.ts

│       │   │       └── update-status.dto.ts

│       │   ├── integrations/

│       │   │   └── user-service.client.ts

│       │   ├── common/

│       │   │   ├── filters/

│       │   │   ├── interceptors/

│       │   │   └── guards/

│       │   ├── config/

│       │   │   ├── redis.config.ts       # ioredis connection

│       │   │   └── services.config.ts

│       │   ├── health/

│       │   │   └── health.controller.ts

│       │   ├── app.module.ts

│       │   └── main.ts

│       ├── test/

│       │   ├── unit/

│       │   ├── integration/

│       │   └── test-utils.ts

│       ├── Dockerfile

│       ├── .env.example

│       ├── package.json

│       ├── tsconfig.json

│       └── README.md

│

├── packages/                             # Shared packages

│   ├── shared-types/                     # Shared TypeScript interfaces

│   │   ├── src/

│   │   │   ├── models/

│   │   │   │   ├── user.types.ts

│   │   │   │   ├── trip.types.ts

│   │   │   │   ├── driver.types.ts

│   │   │   │   └── rating.types.ts

│   │   │   ├── dtos/

│   │   │   │   ├── auth.dto.ts

│   │   │   │   ├── trip.dto.ts

│   │   │   │   └── driver.dto.ts

│   │   │   ├── enums/

│   │   │   │   └── index.ts              # UserRole, TripStatus, etc.

│   │   │   └── index.ts                  # Barrel export

│   │   ├── package.json

│   │   ├── tsconfig.json

│   │   └── README.md

│   │

│   └── common-utils/                     # Shared utility functions

│       ├── src/

│       │   ├── distance/

│       │   │   └── haversine.ts          # Distance calculation

│       │   ├── validation/

│       │   │   └── coordinates.validator.ts

│       │   ├── errors/

│       │   │   ├── app-error.ts

│       │   │   └── error-codes.ts

│       │   ├── logger/

│       │   │   └── winston-logger.ts     # Structured logging

│       │   └── index.ts

│       ├── package.json

│       ├── tsconfig.json

│       └── README.md

│

├── infrastructure/                       # Infrastructure as Code

│   └── terraform/

│       ├── modules/

│       │   ├── networking/               # VPC, subnets, NAT gateway

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── ecs/                      # ECS cluster, services, tasks

│       │   │   ├── main.tf

│       │   │   ├── task-definitions/

│       │   │   │   ├── user-service.json

│       │   │   │   ├── trip-service.json

│       │   │   │   └── driver-service.json

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── rds/                      # PostgreSQL instances

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── elasticache/              # Redis cluster

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── alb/                      # Application Load Balancer

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── ecr/                      # Container registries

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── iam/                      # IAM roles and policies

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   ├── secrets/                  # Secrets Manager

│       │   │   ├── main.tf

│       │   │   ├── variables.tf

│       │   │   └── outputs.tf

│       │   └── cloudwatch/               # Logging and metrics

│       │       ├── main.tf

│       │       ├── variables.tf

│       │       └── outputs.tf

│       ├── environments/

│       │   ├── dev/

│       │   │   ├── main.tf               # Dev environment config

│       │   │   ├── terraform.tfvars      # Dev-specific variables

│       │   │   └── backend.tf            # S3 state backend

│       │   └── prod/

│       │       ├── main.tf

│       │       ├── terraform.tfvars

│       │       └── backend.tf

│       ├── variables.tf                  # Global variables

│       ├── outputs.tf                    # Global outputs

│       └── README.md

│

├── scripts/                              # Build and deployment scripts

│   ├── build-all.sh                      # Build all Docker images

│   ├── push-to-ecr.sh                    # Push images to ECR

│   ├── deploy-local.sh                   # Start local Docker Compose

│   ├── run-migrations.sh                 # Run Prisma migrations

│   ├── seed-db.sh                        # Seed development data

│   └── setup-aws.sh                      # Initial AWS setup

│

├── docs/                                 # Documentation

│   ├── prd.md                            # Product Requirements Document

│   ├── architecture.md                   # This architecture document

│   ├── project brief.md                  # Course project description

│   ├── prd-summary.md                    # Executive summary

│   ├── prd-next-steps.md                 # Implementation roadmap

│   ├── adr/                              # Architecture Decision Records

│   │   ├── 001-monorepo-structure.md

│   │   ├── 002-nestjs-framework.md

│   │   ├── 003-redis-for-driver-locations.md

│   │   ├── 004-jwt-authentication.md

│   │   └── 005-ecs-fargate-deployment.md

│   ├── api/                              # API documentation

│   │   ├── openapi.yaml                  # OpenAPI 3.0 spec

│   │   └── postman-collection.json       # Postman test collection

│   └── guides/

│       ├── local-development.md          # Setup guide

│       ├── deployment.md                 # AWS deployment guide

│       ├── testing.md                    # Testing strategies

│       └── troubleshooting.md            # Common issues

│

├── docker-compose.yml                    # Local development environment

├── docker-compose.prod.yml               # Production-like local setup

├── .env.example                          # Environment variable template

├── .gitignore                            # Git ignore patterns

├── .eslintrc.js                          # ESLint configuration

├── .prettierrc                           # Prettier configuration

├── pnpm-workspace.yaml                   # pnpm workspace config

├── package.json                          # Root package.json

├── tsconfig.json                         # Root TypeScript config

├── README.md                             # Project README

└── LICENSE                               # License file

```

---

### **Detailed Rationale:**

**Monorepo Structure Benefits:**

1.**Single Source of Truth:**

- All code, infrastructure, and documentation in one repository
- Atomic commits across services (e.g., update shared types + all services)
- Unified versioning and release management

2.**Shared Packages:**

-`packages/shared-types`: TypeScript interfaces used by all services

-`packages/common-utils`: Reusable utilities (Haversine formula, logging)

- No need for private npm registry or complex package publishing

3.**Consistent Tooling:**

- Single `.eslintrc.js` and `.prettierrc` for all services
- Shared `tsconfig.json` base configuration
- Unified CI/CD pipeline in `.github/workflows`

4.**Service Independence:**

- Each service has its own `package.json`, `Dockerfile`, and tests
- Can be developed, tested, and deployed independently
- Clear boundaries prevent tight coupling

5.**Infrastructure Co-location:**

- Terraform modules alongside application code
- Infrastructure changes reviewed in same PRs as code changes
- Easier to understand relationships between code and infrastructure

**Key Directories Explained:**

**`services/`:**

- Three microservices with identical structure (consistency)
- Each has `src/`, `prisma/` (if SQL), `test/`, and `Dockerfile`
- Follows NestJS conventions (controllers, services, modules)

**`packages/`:**

-`shared-types`: Pure TypeScript types, no runtime dependencies

-`common-utils`: Shared business logic (distance calc, error handling)

- Published as internal npm packages within workspace

**`infrastructure/terraform/`:**

- Modular Terraform structure (reusable modules)
- Environment-specific configurations (`dev/`, `prod/`)
- S3 backend for remote state storage (team collaboration)

**docs:**

- PRD and architecture docs (single source of truth)
- ADRs document key decisions with context and trade-offs
- API documentation (OpenAPI spec, Postman collection)
- Guides for developers (setup, deployment, testing)

**`scripts/`:**

- Bash scripts for common operations
- Simplifies onboarding (new dev runs `./scripts/setup-local.sh`)
- Reduces manual errors in deployment

**`.github/workflows/`:**

- Automated CI/CD pipelines
- Run tests on every PR
- Build and push Docker images on merge to main
- Deploy to AWS using GitHub Actions

**Docker Compose Files:**

-`docker-compose.yml`: Local development (all services + databases)

-`docker-compose.prod.yml`: Production-like testing

**Root Configuration Files:**

-`pnpm-workspace.yaml`: Defines workspace packages

-`package.json`: Root scripts (`pnpm test`, `pnpm lint`, `pnpm build`)

-`tsconfig.json`: Base TypeScript config extended by services

**File Naming Conventions:**

- TypeScript: `kebab-case.ts` (e.g., `auth.controller.ts`)
- Classes: `PascalCase` (e.g., `AuthController`)
- Directories: `kebab-case` (e.g., `driver-profiles/`)
- Environment files: `.env.example`, `.env.development`, `.env.production`

**Service Internal Structure (NestJS Best Practices):**

```

service/src/

├── feature/              # Feature module (e.g., auth, users, trips)

│   ├── feature.controller.ts

│   ├── feature.service.ts

│   ├── feature.repository.ts

│   ├── feature.module.ts

│   └── dto/

├── common/               # Cross-cutting concerns

│   ├── filters/          # Exception filters

│   ├── interceptors/     # Request/response transformation

│   ├── guards/           # Authorization guards

│   └── decorators/       # Custom decorators

├── config/               # Configuration modules

├── health/               # Health check endpoints

├── app.module.ts         # Root module

└── main.ts               # Bootstrap

```

**Why This Structure:**

✅ **Academic Team Friendly:**

- Clear organization, easy to navigate
- Similar structure across all services
- Documented conventions

✅ **Production Ready:**

- Follows industry best practices
- Scales from 3 to 30+ services
- CI/CD ready

✅ **Phase 2 Extensibility:**

- Easy to add new modules (observability, security)
- Clear separation of concerns
- Infrastructure changes isolated

✅ **Cost Conscious:**

- No unnecessary tooling (Nx, Turborepo)
- Simple pnpm workspaces sufficient
- Fewer dependencies = lower complexity

**Trade-offs:**

❌ **Monorepo Challenges:**

- Larger repository size (not an issue for 3 services)
- All devs clone entire repo (acceptable for small team)
- CI/CD runs for all services (can optimize with path filters)

✅ **Why Worth It:**

- Atomic changes across services
- Simplified dependency management
- Better for academic timeline

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Development Workflow)

2.**Expand or Contract for Audience** - Adjust structure detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into structure decisions

4.**Critique and Refine** - Challenge this organization

5.**Analyze Logical Flow and Dependencies** - Review structure coherence

6.**Assess Alignment with Overall Goals** - Verify practicality

7.**Identify Potential Risks and Unforeseen Issues** - Structure risks?

8.**Challenge from Critical Perspective** - Devil's advocate on monorepo

9.**Tree of Thoughts Deep Dive** - Explore alternative structures

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Development Workflow section.

---
