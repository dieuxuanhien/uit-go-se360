# UIT-GO Current Implementation Architecture

> **Generated:** December 12, 2025  
> **Scope:** All 4 scalability patterns - SNS/SQS, Read Replicas, Distributed Caching, Auto-Scaling

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Clients["📱 Clients"]
        P["Passenger App"]
        D["Driver App"]
    end

    subgraph LB["🔀 Load Balancer Layer"]
        NGINX["Nginx LB<br/>least_conn + keepalive<br/>DNS TTL: 2s"]
    end

    subgraph Services["🚀 Microservices (Auto-Scaled)"]
        US["user-service<br/>×2-10 replicas"]
        TS["trip-service<br/>×4-15 replicas"]
        DS["driver-service<br/>×3-15 replicas"]
    end

    subgraph Messaging["📨 AWS SNS/SQS (LocalStack)"]
        SNS["SNS Topic<br/>trip-events"]
        SQS1["SQS Queue<br/>driver-match-queue<br/>(TripRequested)"]
        SQS2["SQS Queue<br/>trip-update-queue<br/>(TripMatched)"]
        DLQ1["DLQ<br/>driver-match-dlq"]
        DLQ2["DLQ<br/>trip-update-dlq"]
    end

    subgraph Databases["🗄️ PostgreSQL with Read Replicas"]
        subgraph UserDB["User Database"]
            UPrimary["postgres-user<br/>PRIMARY (writes)"]
            UReplica1["postgres-user-replica-1<br/>READ"]
            UReplica2["postgres-user-replica-2<br/>READ"]
        end
        subgraph TripDB["Trip Database"]
            TPrimary["postgres-trip<br/>PRIMARY (writes)"]
            TReplica1["postgres-trip-replica-1<br/>READ"]
            TReplica2["postgres-trip-replica-2<br/>READ"]
        end
    end

    subgraph Cache["⚡ Redis Cluster (6 nodes)"]
        RC1["redis-node-1<br/>PRIMARY"]
        RC2["redis-node-2<br/>PRIMARY"]
        RC3["redis-node-3<br/>PRIMARY"]
        RC4["redis-node-4<br/>REPLICA"]
        RC5["redis-node-5<br/>REPLICA"]
        RC6["redis-node-6<br/>REPLICA"]
    end

    subgraph AutoScale["🤖 Auto-Scaler"]
        AS["Python Auto-Scaler<br/>CPU/Memory/RPS/Latency"]
        DC["Docker Compose<br/>--scale SERVICE=N"]
    end

    %% Client connections
    P --> NGINX
    D --> NGINX

    %% Load balancer to services
    NGINX --> US
    NGINX --> TS
    NGINX --> DS

    %% Service to DB connections
    US -->|writes| UPrimary
    US -->|reads| UReplica1
    US -->|reads| UReplica2
    TS -->|writes| TPrimary
    TS -->|reads| TReplica1
    TS -->|reads| TReplica2

    %% Streaming replication
    UPrimary -.->|streaming| UReplica1
    UPrimary -.->|streaming| UReplica2
    TPrimary -.->|streaming| TReplica1
    TPrimary -.->|streaming| TReplica2

    %% Cache connections
    US --> RC1
    US --> RC2
    US --> RC3
    DS --> RC1
    DS --> RC2
    DS --> RC3

    %% Redis cluster replication
    RC1 -.-> RC4
    RC2 -.-> RC5
    RC3 -.-> RC6

    %% Async messaging flow
    TS -->|publish| SNS
    SNS -->|filter: TripRequested| SQS1
    SNS -->|filter: TripMatched| SQS2
    SQS1 -->|consume| DS
    SQS2 -->|consume| TS
    SQS1 -->|failed 3x| DLQ1
    SQS2 -->|failed 3x| DLQ2

    %% Auto-scaler
    AS -->|monitor| US
    AS -->|monitor| TS
    AS -->|monitor| DS
    AS --> DC
    DC -->|scale| US
    DC -->|scale| TS
    DC -->|scale| DS

    classDef primary fill:#4CAF50,stroke:#2E7D32,color:white
    classDef replica fill:#81C784,stroke:#4CAF50,color:black
    classDef cache fill:#FF9800,stroke:#F57C00,color:white
    classDef messaging fill:#2196F3,stroke:#1565C0,color:white
    classDef service fill:#9C27B0,stroke:#6A1B9A,color:white
    classDef dlq fill:#F44336,stroke:#C62828,color:white

    class UPrimary,TPrimary primary
    class UReplica1,UReplica2,TReplica1,TReplica2 replica
    class RC1,RC2,RC3,RC4,RC5,RC6 cache
    class SNS,SQS1,SQS2 messaging
    class US,TS,DS service
    class DLQ1,DLQ2 dlq
```

---

## 2. Story 2.1: Async Communication Flow (SNS/SQS)

```mermaid
sequenceDiagram
    participant Passenger
    participant TripService
    participant SNS as SNS<br/>trip-events
    participant DriverMatchQ as SQS<br/>driver-match-queue
    participant TripUpdateQ as SQS<br/>trip-update-queue
    participant DriverService
    participant Driver

    %% Trip Request Flow
    Passenger->>TripService: POST /trips (create trip)
    TripService->>TripService: Save trip (status: REQUESTED)
    TripService->>SNS: publish TripRequested event
    
    Note over SNS: Filter Policy Routes Events
    SNS->>DriverMatchQ: TripRequested (filtered)
    
    DriverService->>DriverMatchQ: poll messages
    DriverMatchQ-->>DriverService: TripRequested event
    
    DriverService->>DriverService: GEORADIUS search<br/>(5km → 10km → 15km)
    
    alt Drivers Found
        DriverService->>Driver: Notify nearby drivers
        Driver->>DriverService: Accept trip
        DriverService->>SNS: publish TripMatched event
        SNS->>TripUpdateQ: TripMatched (filtered)
        TripUpdateQ-->>TripService: TripMatched event
        TripService->>TripService: Update trip (CONFIRMED)
        TripService->>Passenger: Trip confirmed!
    else No Drivers
        DriverService->>SNS: publish NoDriversAvailable
        SNS->>TripUpdateQ: NoDriversAvailable
        TripUpdateQ-->>TripService: NoDriversAvailable
        TripService->>TripService: Update trip (NO_DRIVER)
        TripService->>Passenger: No drivers available
    end
```

### SNS/SQS Resources Created

| Resource | Type | Purpose | DLQ |
|----------|------|---------|-----|
| `trip-events` | SNS Topic | Central event bus | - |
| `driver-match-queue` | SQS Queue | Receives `TripRequested` | `driver-match-dlq` |
| `trip-update-queue` | SQS Queue | Receives `TripMatched`, `NoDriversAvailable` | `trip-update-dlq` |

---

## 3. Story 2.2: Database Read Scaling (Replicas)

```mermaid
flowchart LR
    subgraph Application["Application Layer"]
        US["user-service"]
        TS["trip-service"]
    end

    subgraph UserDB["User Database Cluster"]
        UW["postgres-user<br/>:5432<br/>PRIMARY"]
        UR1["postgres-user-replica-1<br/>:5444<br/>REPLICA"]
        UR2["postgres-user-replica-2<br/>:5445<br/>REPLICA"]
    end

    subgraph TripDB["Trip Database Cluster"]
        TW["postgres-trip<br/>:5443<br/>PRIMARY"]
        TR1["postgres-trip-replica-1<br/>:5446<br/>REPLICA"]
        TR2["postgres-trip-replica-2<br/>:5447<br/>REPLICA"]
    end

    US -->|"CREATE/UPDATE/DELETE"| UW
    US -->|"SELECT (round-robin)"| UR1
    US -->|"SELECT (round-robin)"| UR2

    TS -->|"CREATE/UPDATE/DELETE"| TW
    TS -->|"SELECT (round-robin)"| TR1
    TS -->|"SELECT (round-robin)"| TR2

    UW -.->|"Streaming Replication"| UR1
    UW -.->|"Streaming Replication"| UR2
    TW -.->|"Streaming Replication"| TR1
    TW -.->|"Streaming Replication"| TR2

    classDef primary fill:#4CAF50,stroke:#2E7D32,color:white
    classDef replica fill:#81C784,stroke:#4CAF50,color:black

    class UW,TW primary
    class UR1,UR2,TR1,TR2 replica
```

### Read/Write Routing Logic

```typescript
// PrismaReplicaService - Round-robin read routing
getReadClient(): PrismaClient {
  if (this.replicas.length === 0) {
    return this.primaryClient; // Fallback to primary
  }
  const client = this.replicas[this.currentIndex];
  this.currentIndex = (this.currentIndex + 1) % this.replicas.length;
  return client;
}
```

---

## 4. Story 2.3: Distributed Caching (Redis Cluster)

```mermaid
flowchart TB
    subgraph UserService["user-service"]
        US["UsersController"]
        UR["UsersRepository"]
        CS["CacheService"]
    end

    subgraph RedisCluster["Redis Cluster (6 nodes)"]
        subgraph Primaries["Primaries (sharded)"]
            R1["redis-node-1<br/>:7000<br/>slots 0-5460"]
            R2["redis-node-2<br/>:7001<br/>slots 5461-10922"]
            R3["redis-node-3<br/>:7002<br/>slots 10923-16383"]
        end
        subgraph Replicas["Replicas (HA)"]
            R4["redis-node-4<br/>:7003"]
            R5["redis-node-5<br/>:7004"]
            R6["redis-node-6<br/>:7005"]
        end
    end

    subgraph Database["PostgreSQL"]
        DB[(postgres-user)]
    end

    US --> UR
    UR --> CS
    CS --> R1
    CS --> R2
    CS --> R3

    R1 -.->|failover| R4
    R2 -.->|failover| R5
    R3 -.->|failover| R6

    UR -->|cache miss| DB

    classDef cache fill:#FF9800,stroke:#F57C00,color:white
    class R1,R2,R3,R4,R5,R6 cache
```

### Cache TTL Configuration

| Data Type | Cache Key Pattern | TTL | Source |
|-----------|-------------------|-----|--------|
| User Profile | `user:{userId}` | 3600s (1 hour) | `CACHE_TTL_USER` env var |
| Driver Profile | `driver:user:{userId}` | 1800s (30 min) | `CACHE_TTL_DRIVER_PROFILE` env var |
| Driver Status | `driver:status:{driverId}` | 3600s (1 hour) | Hardcoded in `DriversService` |
| Driver Location | `driver:location:{driverId}` | 300s (5 min) | Hardcoded `LOCATION_TTL` |
| Driver Geo Index | `driver:geo` | No TTL | Geospatial index |

### Cache-Aside Pattern Flow

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant Repository
    participant Cache as Redis Cluster
    participant DB as PostgreSQL

    Client->>Controller: GET /users/:id
    Controller->>Repository: findByIdWithCacheInfo(id)
    Repository->>Cache: GET user:{id}
    
    alt Cache Hit
        Cache-->>Repository: User JSON
        Repository-->>Controller: {data, cacheHit: true}
        Controller->>Client: 200 OK<br/>X-Cache-Hit: true
    else Cache Miss
        Cache-->>Repository: null
        Repository->>DB: SELECT * FROM users WHERE id = ?
        DB-->>Repository: User row
        Repository->>Cache: SETEX user:{id} 3600 {json}
        Repository-->>Controller: {data, cacheHit: false}
        Controller->>Client: 200 OK<br/>X-Cache-Hit: false
    end
```

---

## 5. Story 2.4: Auto-Scaling (Docker Compose)

```mermaid
flowchart TB
    subgraph Monitoring["📊 Metrics Collection"]
        DStat["Docker Stats API"]
        SQS["SQS Queue Depth"]
        LT["Latency Metrics"]
    end

    subgraph AutoScaler["🤖 Python Auto-Scaler"]
        MC["Metrics Collector<br/>(3s interval)"]
        SC["Scaling Calculator<br/>(multi-signal weighted)"]
        SE["Scaling Executor"]
    end

    subgraph Signals["📈 Scaling Signals (Weighted)"]
        CPU["CPU: 30%"]
        MEM["Memory: 15%"]
        RPS["RPS/replica: 30%"]
        LAT["P95 Latency: 25%"]
    end

    subgraph Actions["🔧 Scaling Actions"]
        SO["Scale Out<br/>cooldown: 6-10s"]
        SI["Scale In<br/>cooldown: 60-90s"]
        BS["Burst Scale<br/>(score > 1.0)"]
    end

    subgraph DockerServices["🐳 Docker Services"]
        US2["user-service<br/>min:2 max:10"]
        TS2["trip-service<br/>min:4 max:15"]
        DS2["driver-service<br/>min:3 max:15"]
    end

    DStat --> MC
    SQS --> MC
    LT --> MC

    MC --> SC
    CPU --> SC
    MEM --> SC
    RPS --> SC
    LAT --> SC

    SC -->|score > 0.7| SO
    SC -->|score < 0.3| SI
    SC -->|score > 1.0| BS

    SO --> SE
    SI --> SE
    BS --> SE

    SE -->|docker compose up --scale| US2
    SE -->|docker compose up --scale| TS2
    SE -->|docker compose up --scale| DS2
```

### Scaling Thresholds

| Service | Min | Max | Target CPU | Target RPS/replica | P95 Target |
|---------|-----|-----|------------|-------------------|------------|
| user-service | 2 | 10 | 55% | 100 | 200ms |
| trip-service | 4 | 15 | 45% | 60 | 300ms |
| driver-service | 3 | 15 | 35% | 100 | 150ms |

### Burst Scaling Rules

| Scaling Score | Replica Delta | Trigger |
|---------------|---------------|---------|
| > 1.0 | +2 | High load |
| > 1.5 | +3 | Very high load |
| > 2.0 | +4 | Critical load |
| > 3.0 | +5 | Emergency |

---

## 6. Nginx Load Balancer Configuration

```mermaid
flowchart LR
    subgraph Clients["Clients"]
        C1["Client 1"]
        C2["Client 2"]
        C3["Client N"]
    end

    subgraph Nginx["Nginx LB (least_conn)"]
        N["Port 80<br/>keepalive: 32-128<br/>DNS TTL: 2s"]
    end

    subgraph UserPool["user_backend pool"]
        U1["user-service:3001"]
        U2["user-service-2:3001"]
    end

    subgraph TripPool["trip_backend pool"]
        T1["trip-service:3002"]
        T2["trip-service-2:3002"]
    end

    subgraph DriverPool["driver_backend pool"]
        D1["driver-service:3003"]
        D2["driver-service-2:3003"]
    end

    C1 --> N
    C2 --> N
    C3 --> N

    N -->|"/users/*"| U1
    N -->|"/users/*"| U2
    N -->|"/trips/*"| T1
    N -->|"/trips/*"| T2
    N -->|"/drivers/*"| D1
    N -->|"/drivers/*"| D2
```

### Upstream Keepalive Configuration

| Upstream | Algorithm | Keepalive Connections | Purpose |
|----------|-----------|----------------------|---------|
| user_backend | least_conn | 32 | Auth/Profile - moderate traffic |
| trip_backend | least_conn | 128 | Trip creation - highest traffic |
| driver_backend | least_conn | 64 | Location updates - medium traffic |

---

## 7. Complete Infrastructure Summary

### Docker Compose Files

| File | Purpose | Components |
|------|---------|------------|
| `docker-compose.yml` | Base services | user/trip/driver services, postgres, redis, nginx |
| `docker-compose.localstack.yml` | AWS emulation | LocalStack (SNS, SQS) |
| `docker-compose.replicas.yml` | Read scaling | 4 postgres read replicas |
| `docker-compose.redis-cluster.yml` | Distributed cache | 6-node Redis cluster |
| `docker-compose.loadbalancer.yml` | LB config | Nginx load balancer |

### Port Mapping

| Service | Internal Port | External Port |
|---------|---------------|---------------|
| nginx-lb | 80 | 3000 |
| user-service | 3001 | 3001 |
| trip-service | 3002 | 3002 |
| driver-service | 3003 | 3003 |
| postgres-user | 5432 | 5432 |
| postgres-trip | 5432 | 5443 |
| postgres-user-replica-1 | 5432 | 5444 |
| postgres-user-replica-2 | 5432 | 5445 |
| postgres-trip-replica-1 | 5432 | 5446 |
| postgres-trip-replica-2 | 5432 | 5447 |
| redis-node-1 | 6379 | 7000 |
| redis-node-2 | 6379 | 7001 |
| redis-node-3 | 6379 | 7002 |
| redis-node-4 | 6379 | 7003 |
| redis-node-5 | 6379 | 7004 |
| redis-node-6 | 6379 | 7005 |
| LocalStack | 4566 | 4566 |

---

## 8. Startup Command

```bash
# Full stack with all scalability patterns
docker compose \
  -f docker-compose.yml \
  -f docker-compose.localstack.yml \
  -f docker-compose.replicas.yml \
  -f docker-compose.redis-cluster.yml \
  -f docker-compose.loadbalancer.yml \
  up -d

# Start auto-scaler (separate terminal)
python scripts/auto-scaler.py
```
