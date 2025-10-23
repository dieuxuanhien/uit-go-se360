## **SECTION 3: TECH STACK**

This is the **definitive technology selection** for the entire UIT-Go project. All development must use these exact versions as the single source of truth.

### **3.1 Technology Stack Table**

| Category                          | Technology          | Version                      | Purpose                                        | Rationale                                                                                                                                                     |

| --------------------------------- | ------------------- | ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |

| **Backend Language**        | TypeScript          | 5.3.x                        | Primary language for all microservices         | Type safety reduces runtime errors; excellent AWS SDK support; shared types between services; aligns with modern Node.js ecosystem                            |

| **Backend Framework**       | NestJS              | 10.x                         | Microservices framework with built-in patterns | Enterprise-grade architecture out of box; dependency injection; microservices support; decorator-based routing; excellent documentation for academic learning |

| **API Style**               | REST (JSON)         | OpenAPI 3.0                  | Service-to-service and client-facing APIs      | Simplicity over gRPC; universal tooling support (Postman, Swagger UI); easier debugging; sufficient performance for project scale                             |

| **Database (User/Trip)**    | PostgreSQL          | 15.x                         | Relational data for users and trips            | ACID compliance for financial data; strong consistency for trip state machines; JSON column support for flexibility; RDS managed service                      |

| **Cache & Location Store**  | Redis               | 7.2.x                        | Driver location geospatial queries             | Native GEORADIUS/GEOSEARCH commands; sub-second nearby driver searches; high-throughput location updates; ElastiCache managed service                         |

| **ORM**                     | Prisma              | 5.x                          | Database access layer for PostgreSQL           | Type-safe query builder; automatic TypeScript types from schema; excellent migration tooling; modern alternative to TypeORM                                   |

| **Redis Client**            | ioredis             | 5.x                          | Redis connection and geospatial operations     | Robust connection pooling; native TypeScript support; comprehensive geospatial command support                                                                |

| **Authentication**          | JWT + bcrypt        | jsonwebtoken 9.x, bcrypt 5.x | Stateless authentication tokens                | Simple stateless auth; no external auth service costs; sufficient for MVP; can migrate to Cognito in Phase 2 Security module                                  |

| **Validation**              | class-validator     | 0.14.x                       | Request DTO validation                         | Integrates seamlessly with NestJS; decorator-based validation rules; type safety                                                                              |

| **Testing Framework**       | Jest                | 29.x                         | Unit and integration tests                     | NestJS default; excellent TypeScript support; snapshot testing; mocking utilities                                                                             |

| **E2E Testing**             | Supertest           | 6.x                          | API endpoint testing                           | HTTP assertion library; integrates with Jest; tests actual API contracts                                                                                      |

| **Load Testing**            | k6                  | 0.48.x                       | Performance validation (Phase 2 Scalability)   | Modern scriptable load testing; Grafana integration; cloud-native metrics                                                                                     |

| **API Documentation**       | Swagger/OpenAPI     | @nestjs/swagger 7.x          | Auto-generated API documentation               | Self-documenting APIs; Swagger UI for testing; contract-first development support                                                                             |

| **Containerization**        | Docker              | 24.x                         | Service packaging and deployment               | Industry standard; local-prod parity; ECS Fargate requirement                                                                                                 |

| **Container Orchestration** | AWS ECS Fargate     | Latest                       | Serverless container deployment                | No EC2 management; pay-per-use; AWS-native; simpler than EKS                                                                                                  |

| **IaC Tool**                | Terraform           | 1.6.x                        | Infrastructure definition                      | PRD requirement; declarative infrastructure; state management; multi-service orchestration                                                                    |

| **CI/CD**                   | GitHub Actions      | N/A                          | Automated testing and deployment               | Free for public repos; native GitHub integration; matrix builds; secrets management                                                                           |

| **Container Registry**      | AWS ECR             | N/A                          | Docker image storage                           | Native ECS integration; private registry; vulnerability scanning                                                                                              |

| **Logging**                 | Winston             | 3.x                          | Structured application logging                 | JSON formatting; multiple transports; NestJS integration                                                                                                      |

| **Monitoring**              | AWS CloudWatch      | N/A                          | Metrics, logs, and alarms                      | AWS-native; unified observability; Phase 2 module support; free tier available                                                                                |

| **Secrets Management**      | AWS Secrets Manager | N/A                          | Credential storage and rotation                | Secure credential injection; audit trail; Terraform integration                                                                                               |

| **Package Manager**         | pnpm                | 8.x                          | Monorepo dependency management                 | Disk-efficient; workspace support; faster than npm; deterministic installs                                                                                    |

| **Linting**                 | ESLint              | 8.x                          | Code quality enforcement                       | TypeScript support; NestJS recommended configs; CI integration                                                                                                |

| **Formatting**              | Prettier            | 3.x                          | Code style consistency                         | Auto-formatting; Git hooks integration; zero-config for TypeScript                                                                                            |

| **Git Hooks**               | Husky               | 8.x                          | Pre-commit validation                          | Enforces linting and tests before commits; prevents bad code from entering repo                                                                               |

---

### **Detailed Rationale:**

**Why NestJS over Express/Fastify:**

-**Opinionated structure:** Forces clean architecture patterns (controllers, services, modules) - beneficial for academic learning

-**Built-in features:** Dependency injection, request validation, error handling, OpenAPI generation reduce boilerplate

-**Microservices support:** Native decorators for REST, gRPC, message queues if needed in Phase 2

-**TypeScript-first:** Class-based architecture leverages TypeScript fully

-**Trade-off:** Slightly more overhead than raw Express, but negligible at project scale

**Why Prisma over TypeORM/Sequelize:**

-**Type safety:** Auto-generated types from schema prevent runtime type errors

-**Modern DX:** Declarative schema, intuitive API, excellent error messages

-**Migration management:**`prisma migrate` handles schema versioning cleanly

-**Performance:** Optimized query engine, supports connection pooling for RDS

-**Trade-off:** Less mature than TypeORM, but better TypeScript integration

**Why JWT over AWS Cognito (for Phase 1):**

-**Cost:** JWT is free; Cognito costs $0.0055/MAU after 50K free tier

-**Simplicity:** No external service dependencies for local development

-**Learning:** Students implement auth logic themselves (password hashing, token signing)

-**Phase 2 path:** Teams choosing Security module can migrate to Cognito with federated identity, MFA

-**Trade-off:** Manual implementation vs managed service; acceptable for MVP

**Why Redis over DynamoDB for driver locations:**

-**PRD guidance:** Explicitly suggests Redis for "speed-first" approach

-**Geospatial primitives:**`GEORADIUS` command is purpose-built for this use case

-**Developer experience:** Simpler mental model than DynamoDB + Geohashing library

-**Cost at scale:** Single Redis node (~$15/month) sufficient; DynamoDB wins at massive scale (Phase 2 Scalability module consideration)

-**Trade-off:** Redis is in-memory (data loss if node fails without persistence config); DynamoDB is durable

**Why k6 over JMeter/Locust:**

-**Modern scripting:** JavaScript-based test scripts (familiar to team)

-**Cloud-native:** Built for distributed load testing, integrates with CloudWatch

-**Grafana visualization:** Rich dashboards out of box

-**Trade-off:** Smaller ecosystem than JMeter, but better developer experience

**Why pnpm over npm/yarn:**

-**Disk efficiency:** Shared dependency store across projects

-**Monorepo support:** First-class workspace filtering and parallel execution

-**Speed:** Faster install times than npm (matters for CI/CD)

-**Trade-off:** Less widespread than npm, but growing adoption

**Version Strategy:**

-**Fixed major versions** (e.g., NestJS 10.x) ensure team compatibility

-**Minor/patch flexibility** (.x) allows security updates without breaking changes

-**Lock files** (pnpm-lock.yaml) guarantee reproducible builds across team and CI/CD

**Technology NOT chosen (and why):**

- ❌ **GraphQL:** Adds complexity over REST; unnecessary for backend-only APIs; harder to debug
- ❌ **MongoDB:** Trip state machine requires transactions; PostgreSQL JSONB provides NoSQL flexibility when needed
- ❌ **Kubernetes/EKS:** Over-engineered for 3 microservices; steep learning curve
- ❌ **Serverless Lambda:** Cold starts impact user experience; harder to debug; ECS Fargate provides better developer experience
- ❌ **gRPC:** REST is sufficient for project scale; easier testing with Postman/curl

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Data Models)

2.**Expand or Contract for Audience** - Adjust technical detail level

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into technology choices

4.**Critique and Refine** - Challenge these stack selections

5.**Analyze Logical Flow and Dependencies** - Review tech stack coherence

6.**Assess Alignment with Overall Goals** - Verify PRD requirements coverage

7.**Identify Potential Risks and Unforeseen Issues** - What tech risks exist?

8.**Challenge from Critical Perspective** - Devil's advocate on NestJS/Prisma

9.**Tree of Thoughts Deep Dive** - Explore alternative tech stack paths

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Data Models section.

---
