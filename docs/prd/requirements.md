# Requirements

## Functional Requirements

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

## Non-Functional Requirements

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
