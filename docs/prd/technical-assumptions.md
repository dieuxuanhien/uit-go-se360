# Technical Assumptions

## Repository Structure: Monorepo

The project shall use a **monorepo structure** containing all three microservices, infrastructure code, and documentation. This approach is recommended for:

- Simplified dependency management and versioning across services
- Easier coordination for academic team collaboration
- Unified CI/CD pipeline configuration
- Single source of truth for documentation and ADRs

## Service Architecture

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

## Testing Requirements

**Testing Strategy:** Unit + Integration testing with local testability focus

- **Unit Tests:** Required for business logic in all services
- **Integration Tests:** Required for API endpoints and service interactions
- **Local Testing:** All services must be fully testable via Docker Compose without AWS dependencies
- **Contract Testing:** Recommended for service boundaries
- **Load Testing:** Required for teams choosing Scalability & Performance module (using k6 or JMeter)
- **Chaos Testing:** Required for teams choosing Reliability module (using AWS FIS)

**Test Automation:** Tests should run in CI/CD pipeline before deployment.

## Infrastructure & Deployment

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

## AWS Services & Architecture Patterns

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

## Additional Technical Assumptions and Requests

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
