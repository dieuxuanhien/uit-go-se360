
# SE360 Course Project Documentation:

## Building the "UIT-Go" Cloud-Native Platform

---

### 1. Overview

Welcome to the SE360 course project. In an era where the software industry is rapidly shifting toward  **cloud-native architectures** , the role of an engineer extends far beyond writing code. Leading tech companies today seek professionals with **T-shaped skills** — individuals who possess deep expertise in one area but also broad understanding across the entire product lifecycle.

The goal of this project is not just to build an application, but to simulate the role of a **System Engineer** in a real-world tech company. This is your chance to create a  **portfolio-defining project** , tackling practical challenges such as designing, deploying, and operating  **scalable, reliable, and secure distributed systems** .

Mastering the trade-offs between **cost, performance, and complexity** will guide every decision you make throughout this project.

You will build the backend system for  **UIT-Go** , a fictional ride-hailing platform. Instead of implementing every feature, the project is divided into two major phases:

1. **Phase 1 – The "Skeleton" Microservices:**

   All teams will develop a minimal, functional microservices foundation forming the system’s core.
2. **Phase 2 – Specialized Module:**

   Each team will choose **one of five specialization modules** to research and implement. This allows you to dive deeper into a specific technical challenge in modern system design and shape your professional focus.

---

### 2. Business Context & Requirements

**UIT-Go** is an application that allows passengers to book rides and connect with nearby drivers. The system must handle the following core business flows:

#### Passenger Stories:

* **User Story 1:** As a new user, I want to register an account using my email and password so I can use the app.
* **User Story 2:** As a passenger, I want to enter my pickup and destination points to request a ride and see an estimated fare.
* **User Story 3:** While waiting, I want to see my driver’s real-time location on the map so I know when they’ll arrive.
* **User Story 4:** As a passenger, I want to cancel my ride if something unexpected comes up.
* **User Story 5:** After the trip ends, I want to rate my driver (1–5 stars) and leave a comment about the service.

#### Driver Stories:

* **User Story 1:** As a driver, I want to register my personal and vehicle information to apply for system approval.
* **User Story 2:** At the start of my shift, I want to switch to “Online” status to receive ride requests.
* **User Story 3:** When a nearby ride request appears, I want to be notified and have 15 seconds to accept or decline.
* **User Story 4:** While driving to the pickup point and during the trip, my location should be continuously updated in the system.
* **User Story 5:** Upon arrival, I want to press “Complete” to end the trip and record my earnings.

---

### 3. Phase 1 – "Skeleton" Microservices (Mandatory for All Teams)

The goal of this phase is to build a **solid foundation** for UIT-Go, where services can communicate reliably with one another.

#### 3.1 Required Architecture

Each team must implement and deploy at least  **three core microservices** :

1. **UserService:**
   * **Responsibility:** Manage passenger and driver information, handle registration, login, and profiles.
   * **Suggested APIs:**
     * `POST /users`
     * `POST /sessions` (login)
     * `GET /users/me`
   * **Suggested Stack:** Node.js / Go / Python + PostgreSQL or MySQL (RDS).
2. **TripService:**
   * **Responsibility:** Central service managing ride creation and trip states (finding driver, accepted, ongoing, completed, canceled).
   * **Suggested APIs:**
     * `POST /trips`
     * `GET /trips/{id}`
     * `POST /trips/{id}/cancel`
   * **Suggested Stack:** Node.js / Go / Python + PostgreSQL or MongoDB (RDS / DocumentDB).
3. **DriverService:**
   * **Responsibility:** Manage driver location and status in real time; provide APIs to search nearby drivers.
   * **Suggested APIs:**
     * `PUT /drivers/{id}/location`
     * `GET /drivers/search?lat=...&lng=...`
   * **Suggested Stack:** Node.js / Go / Python.
   * **Location Data Options:**
     * **Speed-first:** Use Redis (ElastiCache) with Geospatial features for ultra-low latency nearby searches.
     * **Scale/Cost-first:** Use DynamoDB with Geohashing to handle large-scale location writes at lower cost.

#### 3.2 Technical Requirements

* **Communication:** Services must communicate via APIs. Choose between **RESTful** (simple and common) or **gRPC** (high-performance, ideal for internal communication).
* **Containerization:** All services must be packaged with **Docker** and runnable independently using **Docker Compose** in the local environment.
* **Database Isolation:** Each service must have its own database, following the **Database per Service** principle for scalability and independence.
* **Infrastructure as Code (IaC):** Use **Terraform** to define and deploy base infrastructure (VPC, Subnets, Security Groups, IAM Roles, Databases), ensuring reproducibility and version control.
* **Deployment:** Deploy containers to  **AWS** , using either self-managed EC2 instances (maximum flexibility) or orchestration tools like **ECS/EKS** (simplified operations).

---

### 4. Phase 2 – Specialized Modules (Choose One of Five)

After completing the skeleton, each team must select **one specialization module** to deepen their understanding and enhance the system. Each module has equal difficulty and depth, requiring analysis, design justification, and trade-off reasoning.

#### **Module A: Scalability & Performance Architecture**

* **Role:** System Architect
* **Goal:** Design for hyper-scale, focusing on proactive architectural decisions rather than reactive tuning.
* **Tasks:**
  1. Analyze and defend architecture decisions (e.g., async SQS communication between TripService and DriverService).
  2. Validate design via **load testing** (k6, JMeter) to identify bottlenecks and measure system limits.
  3. Apply optimization techniques: caching (ElastiCache), auto-scaling, DB replication.
* **Deliverables:** In-depth report including trade-offs (Consistency vs. Availability, Cost vs. Performance) and pre/post load test metrics.

#### **Module B: Reliability & High Availability**

* **Role:** Site Reliability Engineer (SRE)
* **Goal:** Build a system resilient to failures and capable of self-recovery.
* **Tasks:**
  1. Identify and eliminate single points of failure (e.g., Multi-AZ deployment).
  2. Practice **Chaos Engineering** with AWS Fault Injection Simulator.
  3. Design and test a **Disaster Recovery (DR)** plan with calculated RTO/RPO values.
* **Deliverables:** Failure analysis, Chaos Engineering logs, DR test evidence, and trade-off evaluation (e.g., Single-AZ vs Multi-AZ).

#### **Module C: Security (DevSecOps)**

* **Role:** Security Engineer
* **Goal:** Implement a **Zero Trust** architecture and integrate security throughout development (Shift-left security).
* **Tasks:**
  1. Conduct **Threat Modeling** using STRIDE and Data Flow Diagrams.
  2. Design **Zero Trust Network Architecture** (VPC segmentation, ACLs, Security Groups).
  3. Implement secure authentication (Cognito), IAM least privilege, data encryption (KMS, TLS), and secret management (Secrets Manager).
* **Deliverables:** Threat model, detailed network diagram, and trade-off analysis (e.g., security vs. developer convenience).

#### **Module D: Observability**

* **Role:** Platform / Operations Engineer
* **Goal:** Build a self-diagnosing system that provides deep visibility into health and performance.
* **Tasks:**
  1. Define **SLOs/SLIs** (e.g., 99.9% ride success rate, p95 latency <200ms).
  2. Build  **centralized logging** , custom metrics, and distributed tracing (AWS X-Ray).
  3. Create **dashboards and intelligent alerts** with runbooks.
* **Deliverables:** Complete monitoring dashboard, trace visualization, and analysis of log/metric/trace trade-offs.

#### **Module E: Automation & Cost Optimization (FinOps)**

* **Role:** Platform & FinOps Engineer
* **Goal:** Build efficient DevOps workflows and implement active cloud cost control.
* **Tasks:**
  1. Build **self-service CI/CD pipelines** (GitHub Actions) and modular Terraform structure.
  2. Implement **cost tracking** via AWS Cost Explorer, tagging, and Budgets alerts.
  3. Propose and justify optimization strategies (Spot Instances, Serverless, Graviton).
* **Deliverables:** Automated CI/CD workflow, modular Terraform code, and cost-performance trade-off analysis.

---

### 5. Submission Requirements & Evaluation Criteria

#### 5.1 Deliverables

1. **Source Code:** Public GitHub repository with professional structure.
2. **Documentation:**
   * **README.md:** Installation and deployment instructions (local & AWS).
   * **ARCHITECTURE.md:** System architecture diagram and detailed module diagram.
   * **ADR Folder:** Architectural Decision Records documenting rationale, context, and trade-offs (e.g., why Redis over DynamoDB).
   * **REPORT.md (3–5 pages):**
     1. System overview and diagram.
     2. Detailed module analysis and results.
     3. Consolidated design decisions and trade-offs.
     4. Technical challenges and lessons learned.
     5. Results and future improvements.
3. **Demo Video (5–7 min):** Screen-recorded demonstration of core features and specialized module.

#### 5.2 Final Presentation (15 min per team)

* **Demo (5 min):** Showcase core system flows.
* **Architecture & Module Presentation (7 min):** Explain design decisions and outcomes.
* **Q&A (3 min)**

#### 5.3 Grading Criteria

| Category                      | Weight | Description                                                    |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| Core "Skeleton" Microservices | 30%    | Completeness, stability, and quality of basic services         |
| Specialized Module            | 40%    | Depth of analysis (20%) + Quality of implementation (20%)      |
| Technical Quality             | 15%    | Code quality, repository structure, documentation, ADR quality |
| Report & Presentation         | 15%    | Clarity, conciseness, demo, and Q&A performance                |
