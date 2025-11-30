# UIT-Go Architecture Documentation

> **Đồ án môn SE360 - Cloud Computing**  
> **Module:** A - Scalability & Performance  
> **Ngày cập nhật:** 30/11/2025

---

## Mục lục

1. [Tổng quan Hệ thống](#1-tổng-quan-hệ-thống)
2. [Các Microservices](#2-các-microservices)
3. [Module A: Scalability & Performance](#3-module-a-scalability--performance)
4. [Các Pattern đã Implement](#4-các-pattern-đã-implement)
5. [Infrastructure Architecture](#5-infrastructure-architecture)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Technology Decisions](#7-technology-decisions)
8. [Tài liệu Chi tiết](#8-tài-liệu-chi-tiết)

---

## 1. Tổng quan Hệ thống

### 1.1 High-Level Architecture

```mermaid
flowchart TB
    subgraph LB["🌐 Load Balancer"]
        NGINX["Nginx<br/>least_conn routing"]
    end

    subgraph Services["Application Services"]
        US["👤 User Service<br/>(2-10 replicas)"]
        TS["🚗 Trip Service<br/>(2-15 replicas)"]
        DS["📍 Driver Service<br/>(2-15 replicas)"]
    end

    subgraph Cache["Caching Layer"]
        RC["Redis Cluster<br/>6 nodes (User Cache)"]
        RS["Redis Standalone<br/>(Driver Geo)"]
    end

    subgraph MQ["Message Queue (LocalStack)"]
        SNS["📢 SNS Topic<br/>trip-events"]
        SQS1["📬 SQS Queue<br/>driver-match-queue"]
        SQS2["📬 SQS Queue<br/>trip-update-queue"]
        DLQ1["💀 DLQ<br/>driver-match-dlq"]
        DLQ2["💀 DLQ<br/>trip-update-dlq"]
    end

    subgraph DB["Database Layer"]
        PGU["PostgreSQL<br/>user-db<br/>1 Primary + 2 Replicas"]
        PGT["PostgreSQL<br/>trip-db<br/>1 Primary + 2 Replicas"]
    end

    %% Load Balancer to Services
    NGINX --> US
    NGINX --> TS
    NGINX --> DS

    %% User Service connections
    US --> RC
    RC --> PGU

    %% Trip Service connections
    TS -->|"HTTP GET<br/>(driver search)"| DS
    TS -->|"SNS Publish<br/>(TripRequested)"| SNS
    TS --> PGT

    %% SNS Fan-out to SQS
    SNS -->|"Filter: TripRequested"| SQS1
    SNS -->|"Filter: TripMatched"| SQS2
    SQS1 -.->|"maxReceiveCount: 3"| DLQ1
    SQS2 -.->|"maxReceiveCount: 3"| DLQ2

    %% Driver Service connections
    DS --> RS
    SQS1 -->|"Poll & Process"| DS
    DS -->|"SNS Publish<br/>(TripMatched)"| SNS

    %% Trip Service subscribes to updates
    SQS2 -->|"Poll & Process"| TS

    classDef serviceBox fill:#e1f5fe,stroke:#000000,stroke-width:2px,color:#000000
    classDef cacheBox fill:#fff3e0,stroke:#000000,stroke-width:2px,color:#000000
    classDef dbBox fill:#e8f5e9,stroke:#000000,stroke-width:2px,color:#000000
    classDef mqBox fill:#fce4ec,stroke:#000000,stroke-width:2px,color:#000000
    classDef lbBox fill:#f3e5f5,stroke:#000000,stroke-width:2px,color:#000000
    classDef dlqBox fill:#ffcdd2,stroke:#000000,stroke-width:2px,color:#000000

    class US,TS,DS serviceBox
    class RC,RS cacheBox
    class PGU,PGT dbBox
    class SNS,SQS1,SQS2 mqBox
    class NGINX lbBox
    class DLQ1,DLQ2 dlqBox
```

### 1.2 Tech Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js 20.x | JavaScript runtime |
| **Framework** | NestJS 10.x | Backend framework |
| **Language** | TypeScript 5.3.x | Type-safe development |
| **Database** | PostgreSQL 15 | Relational data (Users, Trips) |
| **Cache** | Redis 7.x | Distributed caching + Geospatial |
| **Message Queue** | LocalStack (SNS/SQS) | Async communication |
| **Load Balancer** | Nginx | Request routing, least_conn |
| **Container** | Docker + Docker Compose | Containerization |
| **IaC** | Terraform | Infrastructure as Code |
| **CI/CD** | GitHub Actions | Automated pipelines |

---

## 2. Các Microservices

### 2.1 UserService (Port 3001)

**Trách nhiệm:**
- Quản lý thông tin người dùng (passengers và drivers)
- Xử lý đăng ký, đăng nhập, authentication
- Quản lý driver profiles và vehicle information

**Database:** PostgreSQL (user-db) với 1 Primary + 2 Read Replicas

**Key APIs:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/register` | Đăng ký tài khoản |
| POST | `/users/login` | Đăng nhập, trả về JWT |
| GET | `/users/me` | Lấy profile user hiện tại |
| POST | `/users/driver-profile` | Tạo driver profile |

**Caching Strategy:**
- Cache user profiles trong Redis Cluster (TTL: 1 hour)
- Cache-aside pattern với 100% hit rate đạt được trong load test

### 2.2 TripService (Port 3002)

**Trách nhiệm:**
- Tạo và quản lý trip lifecycle
- Điều phối việc matching driver với passenger
- Quản lý trip states: PENDING → ACCEPTED → IN_PROGRESS → COMPLETED

**Database:** PostgreSQL (trip-db) với 1 Primary + 2 Read Replicas

**Key APIs:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/trips` | Tạo trip request mới |
| GET | `/trips/{id}` | Lấy thông tin trip |
| POST | `/trips/{id}/accept` | Driver accept trip |
| POST | `/trips/{id}/complete` | Hoàn thành trip |
| POST | `/trips/{id}/cancel` | Hủy trip |

**Communication Pattern:**
- **Synchronous HTTP:** Gọi DriverService để tìm driver gần nhất
- **Asynchronous SNS:** Publish `TripRequested` event cho driver notifications

### 2.3 DriverService (Port 3003)

**Trách nhiệm:**
- Quản lý driver status (online/offline)
- Real-time location tracking (GPS updates)
- Geospatial queries để tìm drivers gần nhất

**Database:** Redis (driver-db) với Geospatial commands

**Key APIs:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/drivers/location` | Cập nhật vị trí GPS |
| PUT | `/drivers/status` | Toggle online/offline |
| GET | `/drivers/search` | Tìm drivers trong bán kính |

**Redis Data Structures:**
```
# Geospatial index
GEOADD driver:geo <longitude> <latitude> <driverId>

# Query nearby drivers (5km radius)
GEORADIUS driver:geo 106.660172 10.762622 5 km WITHDIST ASC COUNT 10
```

---

## 3. Module A: Scalability & Performance

### 3.1 Hybrid Stack Approach

> **Điểm đặc biệt:** Thay vì triển khai AWS thực (~$645/tháng), project sử dụng **Hybrid Stack** với chi phí $0 để validate các scalability patterns.

| AWS Service | Local Equivalent | Purpose |
|-------------|------------------|---------|
| **SNS/SQS** | LocalStack | Async messaging, event-driven |
| **RDS Read Replicas** | PostgreSQL Streaming Replication | Read scaling |
| **ElastiCache** | Redis Cluster (6 nodes) | Distributed caching |
| **ECS Auto Scaling** | Docker Compose + Python Script | Container scaling |

### 3.2 Key Results Achieved

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| **Concurrent VUs** | 1,000 | 1,000 | ✅ Pass |
| **Total RPS** | >200 | 316 RPS | ✅ Pass |
| **Error Rate** | <5% | 0.67% | ✅ Pass |
| **Trip Creation p95** | <1000ms | 720ms | ✅ Pass |
| **Cache Hit Rate** | >80% | 100% | ✅ Pass |
| **Auto-Scaling** | Functional | 2→7 replicas | ✅ Pass |

### 3.3 Architecture Decisions (ADRs)

| ADR | Pattern | Technology | Trade-off |
|-----|---------|------------|-----------|
| [ADR-001](./ADR/ADR-001-event-driven-async-communication.md) | Event-Driven Async | LocalStack SNS/SQS | +Throughput, +Latency (~200ms) |
| [ADR-002](./ADR/ADR-002-database-read-scaling-rds-replicas.md) | Database Read Scaling | PostgreSQL Streaming | +Read capacity, ~Replication lag |
| [ADR-003](./ADR/ADR-003-distributed-caching-elasticache.md) | Distributed Caching | Redis Cluster | +Speed, ~Cache invalidation |
| [ADR-004](./ADR/ADR-004-auto-scaling-infrastructure.md) | Auto-Scaling | Docker + Python | +Elasticity, ~Cold start |

---

## 4. Các Pattern đã Implement

### 4.1 Event-Driven Async Communication (ADR-001)

```mermaid
sequenceDiagram
    participant C as 📱 Client
    participant TS as 🚗 Trip Service
    participant DS as 📍 Driver Service
    participant DB as 🗄️ Trip DB
    participant SNS as 📢 SNS Topic
    participant SQS as 📬 SQS Queue

    C->>TS: POST /trips (create trip)
    
    rect rgba(255, 240, 220, 0.5)
        Note over TS,DS: Synchronous HTTP (real-time driver search)
        TS->>DS: GET /drivers/search?lat=X&lng=Y&radius=5000
        DS-->>TS: [driver1, driver2, ...] (8ms p50)
    end
    
    TS->>DB: INSERT trip (PENDING)
    TS-->>C: 201 Created (109ms p50)
    
    rect rgba(220, 240, 255, 0.5)
        Note over TS,SQS: Asynchronous SNS/SQS (notifications)
        TS->>SNS: Publish TripRequested event
        SNS->>SQS: Fan-out to driver-match-queue
        SQS->>DS: Poll & receive message
        DS->>DS: Match driver to trip
        DS->>SNS: Publish TripMatched event
        SNS->>SQS: Fan-out to trip-update-queue
        SQS->>TS: Poll & update trip status
        TS->>C: Notify user (driver assigned)
    end
    
    Note over C: User polls status → sees driver assigned
```


**Hybrid Approach:**
- **Synchronous HTTP:** Driver search (user cần kết quả ngay lập tức)
- **Asynchronous SNS/SQS:** Driver notifications (có thể delay vài trăm ms)

### 4.2 Database Read Scaling (ADR-002)

```mermaid
flowchart TD
    App[Application]
    
    App -->|WRITE| Primary
    App -->|READ| Rep1
    App -->|READ| Rep2
    
    Primary[(Primary DB)]
    Rep1[(Replica 1)]
    Rep2[(Replica 2)]
    
    Primary -.->|Async Replication<br>less than 1s lag| Rep1
    Primary -.->|Async Replication<br>less than 1s lag| Rep2
```

**Configuration:**
- Primary: Handles all writes + critical reads
- Replicas (2x): Handle 80% of read traffic (round-robin)
- Replication lag: <100ms typical

### 4.3 Distributed Caching (ADR-003)


```mermaid
flowchart TD
    App[NestJS Application]
    
    App -->|WRITE 20%| Primary
    App -->|READ 40%| Rep1
    App -->|READ 40%| Rep2
    
    Primary[(Primary DB<br>Port 5432<br>R/W)]
    Rep1[(Replica 1<br>Port 5433<br>Read-Only)]
    Rep2[(Replica 2<br>Port 5434<br>Read-Only)]
    
    Primary -.->|WAL Streaming<br>Async| Rep1
    Primary -.->|WAL Streaming<br>Async| Rep2
    
    Note[Less than 100ms lag typical]
    
    style Primary fill:#c8e6c9,stroke:#388e3c
    style Rep1 fill:#fff3e0,stroke:#f57c00
    style Rep2 fill:#fff3e0,stroke:#f57c00
    style App fill:#e3f2fd,stroke:#1976d2
```


```typescript
// Cache-Aside Pattern Implementation
async findById(id: string): Promise<User | null> {
  const cacheKey = `user:${id}`;
  
  // 1. Try cache first
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached);  // Cache HIT
  
  // 2. Cache miss: query database
  const user = await this.prisma.user.findUnique({ where: { id } });
  
  // 3. Store in cache for future requests
  if (user) {
    await this.redis.setex(cacheKey, 3600, JSON.stringify(user));
  }
  
  return user;
}
```

**Redis Cluster Configuration:**
- 6 nodes: 3 primary + 3 replica
- Cache-aside pattern với TTL 1 hour cho user profiles
- `X-Cache-Hit` header để monitor hit rate

### 4.4 Auto-Scaling Infrastructure (ADR-004)

```mermaid
flowchart TB
    A["📊 Metrics Collection"]
    A1["• CPU Usage per container• Memory Usage• Request latency"]
    
    B["🤖 Auto-Scaler(Python Script)"]
    B1["Algorithm: HPA-like proportionaldesiredReplicas = ceil(current × CPU/target)"]
    
    C["🐳 Docker Compose Scale"]
    C1["docker compose up --scale SERVICE=N"]
    
    A --> A1
    A1 --> B
    B --> B1
    B1 --> C
    C --> C1
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style A1 fill:#e3f2fd,stroke:#1976d2,stroke-width:1px,stroke-dasharray: 5 5
    style B fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style B1 fill:#fff3e0,stroke:#f57c00,stroke-width:1px,stroke-dasharray: 5 5
    style C fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style C1 fill:#e8f5e9,stroke:#388e3c,stroke-width:1px,stroke-dasharray: 5 5
```



**Scaling Policy:**
| Service | CPU Threshold | Scale Out Cooldown | Min/Max |
|---------|---------------|-------------------|---------|
| trip-service | 50% | 15s | 2-15 |
| driver-service | 40% | 15s | 2-15 |
| user-service | 55% | 20s | 2-10 |

---

## 5. Infrastructure Architecture

### 5.1 Docker Compose Stack

```yaml
# Simplified architecture
services:
  # Application Services (scalable)
  user-service:    # Port 3001, scales 2-10
  trip-service:    # Port 3002, scales 2-15
  driver-service:  # Port 3003, scales 2-15
  
  # Load Balancer
  nginx:           # Port 8080, least_conn routing
  
  # Data Layer
  postgres-user:   # Port 5432, user-db
  postgres-trip:   # Port 5433, trip-db
  postgres-user-replica-1:
  postgres-user-replica-2:
  postgres-trip-replica-1:
  postgres-trip-replica-2:
  
  # Caching Layer
  redis-node-1 through redis-node-6:  # Redis Cluster
  redis-driver:    # Standalone for geospatial
  
  # Message Queue
  localstack:      # Port 4566, SNS/SQS emulation
```

### 5.2 Network Architecture

```mermaid
flowchart TD
    Client[Client]
    
    Client -->|:8080| LB[Nginx Load Balancer]
    
    LB -->|/users/*| US[User Service<br>:3001]
    LB -->|/trips/*| TS[Trip Service<br>:3002]
    LB -->|/drivers/*| DS[Driver Service<br>:3003]
    
    US --> RC[(Redis Cluster)]
    TS --> PG[(PostgreSQL<br>Primary + Replicas)]
    DS --> RG[(Redis Geo)]
```

---

## 6. Data Flow Diagrams

### 6.1 Trip Booking Flow

```mermaid
sequenceDiagram
    participant P as 📱 Passenger
    participant LB as 🌐 Nginx LB
    participant TS as 🚗 TripService
    participant DS as 📍 DriverService
    participant SNS as 📢 SNS
    participant SQS as 📬 SQS
    participant D as 🚕 Driver

    P->>LB: POST /trips {pickup, dropoff}
    LB->>TS: Route to TripService
    
    TS->>DS: GET /drivers/search (sync)
    DS-->>TS: [nearby_drivers]
    
    TS->>TS: Create Trip (PENDING)
    TS-->>P: 201 Created {tripId, estimatedFare}
    
    TS->>SNS: Publish TripRequested
    SNS->>SQS: driver-match-queue
    
    SQS->>DS: Poll message
    DS->>DS: Match best driver
    DS->>SNS: Publish TripMatched
    
    SNS->>SQS: trip-update-queue
    SQS->>TS: Update trip status
    
    TS-->>P: Notify: Driver assigned!
    TS-->>D: Notify: New trip request!
```

### 6.2 Real-time Location Update Flow

```mermaid
sequenceDiagram
    participant D as 🚕 Driver App
    participant LB as 🌐 Nginx LB
    participant DS as 📍 DriverService
    participant Redis as 🔴 Redis Geo
    
    loop Every 5 seconds
        D->>LB: PUT /drivers/location {lat, lng}
        LB->>DS: Route request
        DS->>Redis: GEOADD driver:geo lng lat driverId
        Redis-->>DS: OK
        DS-->>D: 200 OK
    end
    
    Note over D,Redis: Location updates: 11ms p50 latency
```

---

## 7. Technology Decisions

### 7.1 REST vs gRPC

| Aspect | REST (Chosen) | gRPC |
|--------|---------------|------|
| **Latency** | ~10ms higher | Lower |
| **Debugging** | Easy (curl, Postman) | Harder (binary) |
| **Team Expertise** | High | Low |
| **Browser Support** | Native | Requires proxy |

**Decision:** REST - Team expertise và debugging ease quan trọng hơn 10ms latency improvement.

### 7.2 Redis vs DynamoDB (Driver Location)

| Aspect | Redis (Chosen) | DynamoDB |
|--------|----------------|----------|
| **Latency** | <5ms | ~10ms |
| **Geospatial** | Native GEORADIUS | Need Geohashing |
| **Cost** | $0 (Docker) | Pay-per-request |
| **Complexity** | Simple | Higher |

**Decision:** Redis - Native geospatial support, lower latency, simpler implementation.

### 7.3 LocalStack vs Real AWS

| Aspect | LocalStack (Chosen) | Real AWS |
|--------|---------------------|----------|
| **Cost** | $0/month | ~$645/month |
| **Features** | 80% compatibility | Full |
| **Setup** | Docker Compose | IAM, VPC, etc. |
| **Purpose** | Pattern validation | Production |

**Decision:** LocalStack - Validate patterns at zero cost before AWS investment.

---

## 8. Tài liệu Chi tiết

### 8.1 Architecture Documentation
- [Section 1: Introduction](../docs/architecture/section-1-introduction.md)
- [Section 2: High-Level Architecture](../docs/architecture/section-2-high-level-architecture.md)
- [Section 3: Tech Stack](../docs/architecture/section-3-tech-stack.md)
- [Section 5: API Specification](../docs/architecture/section-5-api-specification.md)
- [Section 6: Components](../docs/architecture/section-6-components.md)
- [Section 8: Core Workflows](../docs/architecture/section-8-core-workflows.md)
- [Section 9: Database Schema](../docs/architecture/section-9-database-schema.md)

### 8.2 ADRs (Architectural Decision Records)
- [ADR-001: Event-Driven Async Communication](./ADR/ADR-001-async-communication.md)
- [ADR-002: Database Read Scaling](./ADR/ADR-002-read-replicas.md)
- [ADR-003: Distributed Caching](./ADR/ADR-003-distributed-caching.md)
- [ADR-004: Auto-Scaling Infrastructure](./ADR/ADR-004-auto-scaling.md)


### 8.3 Module A Report
- [Full Scalability Report](../docs/MODULE-A-SCALABILITY-REPORT.md)
- [Load Test Results](../docs/MODULE-A-LOAD-TEST-RESULTS.md)

### 8.4 Load Testing
- [Load Test Scripts](../tests/load/)
- [Test Runner Script](../tests/load/run-module-a-tests.sh)
- [Results Comparison Tool](../tests/load/compare-results.py)

---

**Repository:** https://github.com/dieuxuanhien/uit-go-se360  
**Branch:** Phase2  
**Last Updated:** November 30, 2025
