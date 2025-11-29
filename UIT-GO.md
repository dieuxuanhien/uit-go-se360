# SE360 Course Project Document: Building the "UIT-Go" Cloud-Native Platform

## 1. Overview

Welcome to the SE360 course project. As the software industry shifts rapidly toward cloud-native architecture, the role of engineers extends beyond just writing code. Leading tech companies today seek professionals with "T-shaped skills" - those who are not only deep in one area but also have broad knowledge of the entire product lifecycle.

The goal of this project is not just to build an application, but to embark on a journey simulating the role of a System Engineer at a tech company. This is an opportunity to build a 'portfolio-defining' product that solves real-world problems: **how to design, deploy, and operate a distributed system that is scalable, reliable, and secure?** These are the core skills that differentiate you and make you sought after by leading tech companies. Understanding the trade-offs between cost, performance, and complexity will be the guiding principle for all your decisions in this project.

We will work together to solve the problem of building a backend system for UIT-Go, a fictional ride-hailing application. Rather than building all features, the project will be divided into two main phases:

1. **Phase 1: Building the Microservices "Skeleton"**: All teams will build a minimal microservices platform that serves as the system's framework.
2. **Phase 2: Specialized Module**: Each team will choose ONE of five specialized areas to research and implement. This is an opportunity to dive deep into a specific technical challenge of modern systems and shape your professional role.

## 2. Context & Business Requirements

UIT-Go is an application that allows passengers to book rides and connect with nearby drivers. The system needs to handle the following basic business flows:

### Passengers:
- **User Story 1**: As a new user, I want to register an account with email and password to use the application.
- **User Story 2**: As a passenger, I want to enter pickup and drop-off points to request a ride and see an estimated fare.
- **User Story 3**: While waiting for my ride, I want to see the driver's real-time location moving on the map to know when they will arrive.
- **User Story 4**: As a passenger, I want to be able to cancel a trip if something urgent comes up.
- **User Story 5**: After the trip ends, I want to rate the driver (1-5 stars) and leave comments to provide feedback on service quality.

### Drivers:
- **User Story 1**: As a driver, I want to register my personal information and vehicle details to be approved to join the system.
- **User Story 2**: When starting my shift, I want to turn on "Ready" (Online) status to start receiving new trip requests.
- **User Story 3**: When there's a nearby trip request, I want to receive a notification and have 15 seconds to decide whether to accept or decline.
- **User Story 4**: Throughout the journey to the pickup point and transporting passengers, my location needs to be continuously updated to the system.
- **User Story 5**: Upon arrival, I want to press the "Complete" button to end the trip and have the system record the revenue.

## 3. Phase 1: Microservices "Skeleton" (Mandatory for all teams)

The goal of this phase is to build a solid foundation for UIT-Go, where services can communicate with each other reliably.

### 3.1. Required Architecture

Each team needs to build and deploy at least 3 basic microservices:

#### 1. UserService:
- **Responsibility**: Manage user information (passengers and drivers), handle registration, login, and profiles.
- **Suggested APIs**: POST /users, POST /sessions (login), GET /users/me.
- **Suggested Technology**: Node.js/Go/Python, PostgreSQL/MySQL (RDS).

#### 2. TripService:
- **Responsibility**: Central service that handles trip creation logic, manages trip states (searching for driver, accepted, in progress, completed, cancelled).
- **Suggested APIs**: POST /trips, GET /trips/{id}, POST /trips/{id}/cancel.
- **Suggested Technology**: Node.js/Go/Python, PostgreSQL/MongoDB (RDS/DocumentDB).

#### 3. DriverService:
- **Responsibility**: Manage driver status and real-time location. Provide API to search for suitable nearby drivers.
- **Suggested APIs**: PUT /drivers/{id}/location, GET /drivers/search?lat=...&lng=....
- **Suggested Technology**: Node.js/Go/Python. For location data, analyze and choose between two main approaches:
  - **Speed-first Priority**: Use Redis (ElastiCache) with Geospatial features to search for drivers within a radius with extremely low latency.
  - **Scale/Cost-first Priority**: Use DynamoDB combined with Geohashing to optimize for massive location writes and operational costs as the system scales.

### 3.2. Technical Requirements for the "Skeleton"

- **Communication**: Services communicate via APIs. Analyze and choose between RESTful (simple, popular) and gRPC (high performance, suitable for internal communication).
- **Containerization**: All services must be packaged with Docker and run independently via Docker Compose in local environment.
- **Database**: Each service must have its own database, adhering to the "Database per Service" principle to ensure independence and scalability.
- **Infrastructure as Code (IaC)**: Use Terraform to define and deploy basic infrastructure resources (VPC, Subnets, Security Groups, IAM Roles, Databases). This ensures your infrastructure can be recreated consistently and version-controlled like code.
- **Deployment**: Containers are deployed on AWS. Consider between self-managing on EC2 (maximum flexibility) and using orchestration services like ECS/EKS (reduced operational burden).

## 4. Phase 2: Choose a Specialized Module (Choose 1 of 5)

After completing the "skeleton," each team will choose one module to dive deep into and complete their system. Each module has equivalent difficulty and depth, requiring the team to analyze, defend their design decisions and trade-offs.

### Module A: Architecture Design for Scalability & Performance

- **Role**: System Architect Engineer.
- **Objective**: Proactively design an architecture capable of achieving hyper-scale, rather than just tuning the existing system. Focus on analyzing and making decisions regarding fundamental architectural choices and important trade-offs to ensure smooth user experience as scale increases dramatically.
- **Specific Tasks**:
  1. **Analyze and Defend Architectural Choices**: Analyze critical business flows (driver search, location updates), then propose and defend fundamental design decisions. Example: "We use an asynchronous communication model with SQS between TripService and DriverService. This helps the system withstand sudden spikes in ride requests without crashing DriverService, but the trade-off is slightly increased ride-finding latency."
  2. **Validate Design with Load Testing**: Build and execute load testing scenarios (using k6, JMeter...) to validate design assumptions, identify bottlenecks, and measure system limits (e.g., how many requests/second can the system handle).
  3. **Implement Optimization Techniques (Tuning)**: Based on results, apply caching (ElastiCache) for infrequently changing data, set up Auto Scaling Groups for services, and implement database scaling strategies like Read Replicas.
- **Deliverable**: In-depth report with a separate section analyzing design choices and trade-offs made (e.g., Consistency vs. Availability, Cost vs. Performance), accompanied by load testing result charts before and after optimization.

### Module B: Design for Reliability & High Availability

- **Role**: Site Reliability Engineer (SRE).
- **Objective**: Design a system capable of resilience and self-recovery from failures, rather than just configuring high availability features. Focus on analyzing single points of failure, quantifying reliability, and practicing failure scenarios.
- **Specific Tasks**:
  1. **Analyze and Eliminate Failure Points**: Draw architecture diagrams, identify potential failure points, and propose architectural solutions to eliminate them. Example: deploy services across multiple Availability Zones (Multi-AZ), use Application Load Balancer for load distribution and automatic traffic redirection when a node fails.
  2. **Practice Chaos Engineering**: Use tools like AWS Fault Injection Simulator to proactively "inject" failures into the system (e.g., shut down a service, increase database latency) and analyze system behavior to validate reliability patterns (Retry, Circuit Breaker, Timeout).
  3. **Design and Practice Disaster Recovery (DR) Scenarios**: Build a detailed DR process, calculate RTO (Recovery Time Objective) and RPO (Recovery Point Objective) for the system. Practice recovering the entire system to another Region using database backups (snapshots) and IaC infrastructure.
- **Deliverable**: Report analyzing failure points and solutions, video/log documenting successful Chaos Engineering practice and DR scenario, presentation on trade-offs made. Example: "We considered between Single-AZ and Multi-AZ database architecture. Single-AZ has 50% lower cost and write latency about 5-10ms lower. However, RTO when failures occur is 15-30 minutes. Conversely, Multi-AZ increases reliability to 99.99% and RTO is nearly 0, but cost doubles. After analysis, we decided on Multi-AZ because ride-hailing service availability is a core business requirement, and we accept trade-offs in cost and slight performance impact."

### Module C: Design for Security (DevSecOps)

- **Role**: Security Engineer.
- **Objective**: Design and build a secure system following "Zero Trust" philosophy (trust no one), rather than just configuring security tools. Focus on analyzing threats, designing defense-in-depth layers, and integrating security into development processes (Shift-left security).
- **Specific Tasks**:
  1. **Threat Modeling**: Build Data Flow Diagrams, then analyze system architecture to identify potential attack surfaces and threats (using STRIDE model), then propose mitigation measures.
  2. **Design Zero Trust Network Architecture**: Design and configure VPC with public and private subnets, Network ACLs, Security Groups strictly to isolate services and only allow minimum necessary communication flows.
  3. **Build Data Security and Identity Perimeter**: Implement secure authentication flow (with Cognito), apply Least Privilege principle for all IAM Roles, encrypt data both in transit (TLS) and at rest (KMS), and securely manage secrets (with Secrets Manager).
- **Deliverable**: Threat Modeling report, detailed network architecture diagram, and presentation on trade-offs between security level and convenience for development/operations. Example: "Requiring all database access through a bastion host increases security but also increases complexity for developers when debugging."

### Module D: Design for Observability

- **Role**: Platform/Operations Engineer.
- **Objective**: Design a system capable of "self-diagnosis," providing deep insights into state and performance, rather than just collecting logs and metrics. Focus on identifying important metrics and connecting them to user experience and business goals.
- **Specific Tasks**:
  1. **Define SLOs/SLIs**: Identify Service Level Objectives (SLOs) and Service Level Indicators (SLIs) important for main business flows (e.g., successful ride booking rate > 99.9%, driver search API latency at 95th percentile (p95) < 200ms). Define "Error Budget" for each SLO.
  2. **Build Observability Platform**: Set up centralized logging system (CloudWatch Logs), integrate custom metrics to track SLIs, and deploy Distributed Tracing (AWS X-Ray) to track a request's journey through multiple microservices.
  3. **Build Dashboard and Intelligent Alerting System**: Design a Dashboard visualizing SLIs/SLOs and Error Budget. Configure automatic alerting system (Alarms) when there's risk of SLO violation and create a "runbook" guiding how to handle incidents for specific alerts.
- **Deliverable**: Complete monitoring Dashboard based on SLOs/SLIs, demonstration of tracing a complex request using X-Ray, and report analyzing trade-offs when choosing between types of observability data (logs, metrics, traces).

### Module E: Design for Automation & Cost Optimization (FinOps)

- **Role**: Platform & FinOps Engineer.
- **Objective**: Design an efficient development and operations process capable of controlling and optimizing costs, rather than just building pipelines and passively cutting costs. Focus on building a "self-service platform" for developers and applying cloud financial management principles.
- **Specific Tasks**:
  1. **Design Self-Service Platform**: Build a complete CI/CD pipeline (using GitHub Actions) and restructure Terraform code into reusable modules, allowing new developers to deploy services safely and quickly.
  2. **Build Cost Management Mechanism**: Analyze system costs using AWS Cost Explorer. Set up consistent resource tagging mechanism to allocate costs by service. Configure AWS Budgets to send alerts when costs risk exceeding thresholds.
  3. **Research and Defend Optimization Decisions**: Propose and analyze cost optimization options (Spot Instances, Serverless, Graviton processors...). Implement one option and measure effectiveness with specific metrics.
- **Deliverable**: Presentation of automated CI/CD process, modularized Terraform source code, and cost analysis report emphasizing trade-offs between cost, performance, and operational effort.

## 5. Submission Requirements & Evaluation Criteria

### 5.1. Required Deliverables

1. **Source Code**: Public GitHub repository link with professional structure.
2. **Documentation**:
   - **README.md**: Clear instructions on how to install and run the system in local and AWS environments.
   - **ARCHITECTURE.md**: Overall system architecture diagram and detailed diagrams for specialized module.
   - **ADR/**: A directory containing Architectural Decision Records. Each markdown file records an important decision (e.g., why choose Redis over DynamoDB, why choose gRPC over REST) with context and trade-offs considered. This is evidence of the team's design thinking process
   - **REPORT.md**: In-depth report (3-5 pages) structured as:
     1. **System Architecture Overview**: Diagram and brief explanation.
     2. **Specialized Module Analysis**: Describe approach and results.
     3. **Summary of Design Decisions and Trade-offs (Most Important)**: This is the core section of the report, summarizing key points from the team's ADRs. Must clearly present options considered, why current solution was chosen, and what was traded off (in terms of cost, performance, complexity...).
     4. **Challenges & Lessons Learned**: Technical difficulties encountered and lessons learned.
     5. **Results & Development Direction**: Summary of results and future improvement suggestions.
3. **Demo Video (5-7 minutes)**: Screen recording demonstrating main functionalities and specialized module features.

### 5.2. Final Presentation Session (15 minutes/team)

- **Live Demo (5 minutes)**: Operate main system flows.
- **Architecture & Specialized Module Presentation (7 minutes)**: Explain design choices and present specialized module results.
- **Q&A (3 minutes)**.

### 5.3. Evaluation Criteria

- **"Skeleton" Completion (30%)**: Completeness, stability, and deployment quality of basic microservices.
- **Specialized Module (40%)**:
  - **Analysis & Design Depth (20%)**: Ability to analyze problems, propose solutions, and explain trade-offs.
  - **Implementation Quality (20%)**: Completeness of technical solutions and results achieved.
- **Technical Quality (15%)**: Source code quality (code, IaC), repository structure, documentation (especially ADRs).
- **Report & Presentation (15%)**: Ability to present problems clearly and concisely, demo, and answer questions.

## 6. Project Timeline & Milestones

This is a suggested timeline; teams can adjust as appropriate.

| Week | Main Activities | Corresponding Theory (in curriculum) |
|------|----------------|-------------------------------------|
| 1-2 | **Kickoff & Design**: Form teams, register for specialized module, analyze requirements, draw overall architecture diagram, set up repository and workflow. | Chapters 1, 2: Systems Thinking, Microservices |
| 3-5 | **Build "Skeleton"**: Code 3 microservices, design database schema, write Dockerfiles. Test locally using Docker Compose. | Chapters 3, 4, 5: Data, 12-Factor App, Containers |
| 6-7 | **Deploy Basic Infrastructure**: Write Terraform for VPC, DB, IAM. Start deploying services to AWS. | Chapters 6, 7, 8: Networking, IAM, IaC |
| 8 | **MILESTONE 1: PROGRESS REPORT**: Demo "skeleton" running in local environment (using Docker Compose), where services can successfully communicate via APIs (e.g., prove UserService can call TripService). Submit first version of ARCHITECTURE.md and present detailed plan for specialized module. | - |
| 9-12 | **Implement Specialized Module**: Focus on tasks of chosen module. Continuously update decisions in ADR. | Chapters 9-14: Observability, Caching, Reliability, Security, Cost |
| 13 | **Finalization & Summary**: Integration, test entire system. Complete code, write report, prepare slides, record demo video. | - |
| 14 | **MILESTONE 2: FINAL REPORT**: Submit product and present to class. | Chapter 15: Summary |

**Wishing you a successful project term and valuable learning experiences!**