# UIT-Go Product Requirements Document (PRD)

**Version:** 0.1
**Date:** 2025-10-20
**Author:** PM (John)

---

## Goals and Background Context

### Goals

- Build a cloud-native, scalable ride-hailing platform backend that demonstrates T-shaped engineering skills
- Implement a functional microservices foundation (UserService, TripService, DriverService) with proper service isolation
- Deploy infrastructure to AWS using Infrastructure as Code (Terraform) with containerized services
- Create a portfolio-defining project that showcases real-world system engineering capabilities
- Master trade-offs between cost, performance, and complexity in distributed systems
- Complete one specialization module demonstrating deep expertise in a specific technical domain

### Background Context

UIT-Go is a fictional ride-hailing platform designed as the SE360 course capstone project to simulate real-world system engineering challenges. The project addresses the gap between academic learning and industry requirements by requiring students to build, deploy, and operate a cloud-native distributed system rather than just writing code.

The platform enables passengers to request rides and connect with nearby drivers through a microservices architecture. The project is structured in two phases: Phase 1 establishes the core "skeleton" microservices foundation (mandatory for all teams), while Phase 2 allows teams to specialize in one of five technical domains (Scalability, Reliability, Security, Observability, or FinOps/Automation), enabling students to develop T-shaped skills with both broad system knowledge and deep specialization.

### Change Log

| Date       | Version | Description                             | Author    |
| ---------- | ------- | --------------------------------------- | --------- |
| 2025-10-20 | 0.1     | Initial PRD creation from project brief | PM (John) |

---

## Requirements

### Functional Requirements

**User Management & Authentication:**

- **FR1:** The system shall allow new users to register accounts with email and password
- **FR2:** The system shall support separate registration flows for passengers and drivers
- **FR3:** The system shall authenticate users and maintain session state
- **FR4:** The system shall allow drivers to register personal and vehicle information for approval
- **FR5:** The system shall provide user profile management capabilities

**Trip Management:**

- **FR6:** The system shall allow passengers to create ride requests with pickup and destination points
- **FR7:** The system shall calculate and display estimated fare before ride confirmation
- **FR8:** The system shall maintain trip state transitions (requested → finding driver → accepted → in-progress → completed/cancelled)
- **FR9:** The system shall allow passengers to cancel rides
- **FR10:** The system shall record trip completion with driver earnings calculation

**Driver Management & Location:**

- **FR11:** The system shall allow drivers to toggle between online/offline status
- **FR12:** The system shall continuously update driver location in real-time during active shifts
- **FR13:** The system shall search for nearby available drivers based on geolocation
- **FR14:** The system shall notify nearby drivers of ride requests
- **FR15:** The system shall give drivers 15 seconds to accept or decline ride requests
- **FR16:** The system shall update driver location during pickup and trip duration

**Rating & Feedback:**

- **FR17:** The system shall allow passengers to rate drivers (1-5 stars) after trip completion
- **FR18:** The system shall allow passengers to leave text comments about service quality

### Non-Functional Requirements

**Architecture & Design:**

- **NFR1:** The system shall implement a microservices architecture with at least three core services (UserService, TripService, DriverService)
- **NFR2:** Each microservice shall have its own isolated database following the Database per Service principle
- **NFR3:** Services shall communicate via RESTful APIs or gRPC
- **NFR4:** The system architecture shall support horizontal scalability

**Infrastructure & Deployment:**

- **NFR5:** All services shall be containerized using Docker
- **NFR6:** The system shall be deployable locally using Docker Compose
- **NFR7:** Infrastructure shall be defined as code using Terraform (VPC, Subnets, Security Groups, IAM Roles, Databases)
- **NFR8:** The system shall be deployed to AWS cloud platform
- **NFR9:** Container orchestration shall use either self-managed EC2, ECS, or EKS

**Performance:**

- **NFR10:** Driver location searches shall return results with sub-second latency
- **NFR11:** The system shall support real-time location updates with minimal lag
- **NFR12:** Driver notification timeout shall be enforced at 15 seconds

**Cost:**

- **NFR13:** AWS service usage should aim to stay within reasonable academic/student budget constraints
- **NFR14:** Architecture decisions shall consider cost-performance trade-offs explicitly

**Data Storage:**

- **NFR15:** UserService shall use a relational database (PostgreSQL or MySQL via RDS)
- **NFR16:** TripService shall use PostgreSQL or MongoDB (RDS or DocumentDB)
- **NFR17:** DriverService location data shall use either Redis (ElastiCache) for speed-first or DynamoDB with Geohashing for scale/cost-first approaches

**Documentation & Quality:**

- **NFR18:** All architectural decisions shall be documented in Architecture Decision Records (ADRs)
- **NFR19:** The system shall include comprehensive documentation (README, ARCHITECTURE.md, deployment guides)
- **NFR20:** Code repository shall follow professional structure and organization standards

**Specialization Modules (Phase 2 - Choose One):**

- **NFR21:** Teams shall implement one specialization module with depth: Scalability & Performance, Reliability & HA, Security (DevSecOps), Observability, or Automation & FinOps

---

## Technical Assumptions

### Repository Structure: Monorepo

The project shall use a **monorepo structure** containing all three microservices, infrastructure code, and documentation. This approach is recommended for:

- Simplified dependency management and versioning across services
- Easier coordination for academic team collaboration
- Unified CI/CD pipeline configuration
- Single source of truth for documentation and ADRs

### Service Architecture

**Architecture Pattern:** Microservices within containerized deployment

The system implements a **microservices architecture** with three core services:

1. **UserService** - User/authentication management
2. **TripService** - Trip lifecycle and state management
3. **DriverService** - Driver location and availability

**Service Communication:**

- **Primary:** RESTful APIs (recommended for simplicity and broad tooling support)
- **Alternative:** gRPC for internal service-to-service calls if performance optimization is needed
- **Async:** AWS SQS/SNS for event-driven patterns (especially if pursuing Scalability module)

**Technology Stack per Service:**

| Service       | Language Options | Database                               | Caching/Special Storage                         |
| ------------- | ---------------- | -------------------------------------- | ----------------------------------------------- |
| UserService   | nestjs           | PostgreSQL or MySQL (RDS)              | -                                               |
| TripService   | nestjs           | PostgreSQL or MongoDB (RDS/DocumentDB) | -                                               |
| DriverService | nestjs           | Same as TripService                    | Redis (ElastiCache) OR DynamoDB with Geohashing |

**Rationale for language flexibility:** Teams can choose based on expertise, but consistency across services is recommended for maintainability.

### Testing Requirements

**Testing Strategy:** Unit + Integration testing with local testability focus

- **Unit Tests:** Required for business logic in all services
- **Integration Tests:** Required for API endpoints and service interactions
- **Local Testing:** All services must be fully testable via Docker Compose without AWS dependencies
- **Contract Testing:** Recommended for service boundaries
- **Load Testing:** Required for teams choosing Scalability & Performance module (using k6 or JMeter)
- **Chaos Testing:** Required for teams choosing Reliability module (using AWS FIS)

**Test Automation:** Tests should run in CI/CD pipeline before deployment.

### Infrastructure & Deployment

**Infrastructure as Code:** Terraform (mandatory)

- Define all AWS resources: VPC, Subnets, Security Groups, IAM Roles, RDS/DocumentDB instances, ElastiCache/DynamoDB, Load Balancers
- Modular structure recommended for reusability
- State management via Terraform Cloud or S3 backend

**Container Orchestration Options:**

1. **Self-managed EC2** (maximum control, manual scaling)
2. **AWS ECS** (AWS-native, simpler than EKS)
3. **AWS EKS** (Kubernetes-based, most complex but industry-standard)

**Recommendation:** Start with ECS for balance of AWS integration and operational simplicity unless team has strong Kubernetes experience.

**CI/CD:** GitHub Actions recommended for:

- Automated testing on pull requests
- Docker image building and pushing to ECR
- Terraform validation and deployment
- Required for teams choosing Automation & FinOps module

### AWS Services & Architecture Patterns

**Core AWS Services:**

- **Compute:** EC2, ECS, or EKS
- **Databases:** RDS (PostgreSQL/MySQL), DocumentDB (MongoDB-compatible), OR DynamoDB
- **Caching:** ElastiCache (Redis)
- **Networking:** VPC, Application Load Balancer, Security Groups
- **IAM:** Service roles and policies following least-privilege principle
- **Container Registry:** ECR for Docker images

**Specialization Module Services (Phase 2 - as chosen):**

- **Scalability:** Auto Scaling Groups, SQS, SNS, CloudFront
- **Reliability:** Multi-AZ deployments, Fault Injection Simulator, Route 53
- **Security:** Cognito, Secrets Manager, KMS, AWS WAF, VPC Flow Logs
- **Observability:** CloudWatch, X-Ray, CloudWatch Logs Insights
- **FinOps:** Cost Explorer, Budgets, Spot Instances, Graviton instances

### Additional Technical Assumptions and Requests

- **API Documentation:** OpenAPI/Swagger specifications recommended for all REST endpoints
- **Environment Management:** Support for local (Docker Compose), staging, and production environments
- **Secrets Management:** Use AWS Secrets Manager or Parameter Store (not hardcoded credentials)
- **Logging:** Structured JSON logging to CloudWatch Logs from all services
- **Health Checks:** All services must expose `/health` endpoints for load balancer monitoring
- **Database Migrations:** Use migration tools (e.g., Flyway, Liquibase, or language-native tools) for schema versioning
- **Git Workflow:** Feature branch workflow with pull request reviews required
- **Code Quality:** Linting and formatting standards enforced via CI
- **Geospatial Calculations:** Haversine formula or database-native geospatial functions for distance calculations
- **Time Zones:** All timestamps stored in UTC, converted for display as needed

---

## Epic List

**Epic 1: Foundation & Core Infrastructure**
Establish project repository, containerization, local development environment, basic authentication service, and CI/CD pipeline. Delivers a deployable "hello world" microservice with health checks.

**Epic 2: User Management & Authentication**
Implement complete user registration, authentication, and profile management for both passengers and drivers. Delivers functional user account system with session management.

**Epic 3: Driver Location & Availability Management**
Build driver location tracking, online/offline status management, and geospatial search capabilities. Delivers ability to track and find nearby available drivers in real-time.

**Epic 4: Trip Lifecycle & Ride Matching**
Implement trip request creation, driver notification, acceptance flow, and trip state management. Delivers end-to-end ride booking functionality from request to driver acceptance.

**Epic 5: Trip Execution & Completion**
Build trip in-progress tracking, location updates during rides, trip completion, and earnings calculation. Delivers complete ride execution from pickup to drop-off.

**Epic 6: Rating & Feedback System**
Implement post-trip rating system allowing passengers to rate drivers and leave comments. Delivers quality tracking and driver performance metrics.

**Epic 7: AWS Infrastructure & Terraform Deployment**
Migrate from local Docker Compose to full AWS infrastructure using Terraform (VPC, RDS, ElastiCache/DynamoDB, ECS/EKS, Load Balancers). Delivers production-ready cloud deployment.

**Epic 8: [Optional] Phase 2 Specialization Module**
Implement one of the five specialization modules: Scalability & Performance, Reliability & HA, Security (DevSecOps), Observability, or Automation & FinOps. Delivers deep technical enhancement in chosen domain.

---
