# Auto-Scaler Architecture

**Module A - Scalability** | Last Updated: 2025-12-05

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph AutoScaler["🐍 PYTHON AUTO-SCALER"]
        Script["Python Script<br/>─────────────<br/>• Polls Docker stats (5s interval)<br/>• Monitors CPU/Memory/Containers<br/>• Scaling logic (min/max/target)"]
    end

    subgraph Traffic["📡 TRAFFIC"]
        LB["Nginx Load Balancer<br/>least_conn distribution"]
    end

    subgraph Docker["🐳 DOCKER COMPOSE"]
        TS["🚗 TripService<br/>Min: 2 / Max: 10<br/>Current: Dynamic<br/>Target CPU: 45%"]
        DS["📍 DriverService<br/>Min: 2 / Max: 10<br/>Current: Dynamic<br/>Target CPU: 35%"]
        US["👤 UserService<br/>Min: 2 / Max: 5<br/>Current: Dynamic<br/>Target CPU: 50%"]
    end

    Script -->|"① Monitor container stats"| Docker
    Script -->|"② If CPU > target: Scale OUT<br/>③ If CPU < target: Scale IN"| Decision
    Decision["docker-compose up --scale<br/>service=N"] --> Docker
    
    LB --> TS & DS & US

    style AutoScaler fill:#fffde7,stroke:#f9a825,stroke-width:2px
    style Traffic fill:#fffde7,stroke:#f9a825,stroke-width:2px
    style Docker fill:#fffde7,stroke:#f9a825,stroke-width:2px
    style Script fill:#fff3e0,stroke:#ff9800,stroke-width:1px,color:#000
    style LB fill:#e3f2fd,stroke:#1976d2,stroke-width:1px,color:#000
    style TS fill:#e8f5e9,stroke:#4caf50,stroke-width:2px,color:#000
    style DS fill:#e8f5e9,stroke:#4caf50,stroke-width:2px,color:#000
    style US fill:#e8f5e9,stroke:#4caf50,stroke-width:2px,color:#000
    style Decision fill:#eceff1,stroke:#607d8b,stroke-width:1px,color:#000
```

---

## Scaling Flow

```mermaid
flowchart LR
    A["📊 CPU > 45%"] -->|"Scale OUT"| B["Add Instance"]
    C["📊 CPU < 30%"] -->|"Scale IN"| D["Remove Instance"]
    B --> E["Nginx auto-discovers<br/>via Docker DNS"]
    D --> E

    style A fill:#ffcdd2,stroke:#c62828,color:#000
    style C fill:#c8e6c9,stroke:#2e7d32,color:#000
    style E fill:#e3f2fd,stroke:#1976d2,color:#000
```

---

## Configuration

| Service | Min | Max | Scale OUT | Scale IN | Cooldown |
|---------|-----|-----|-----------|----------|----------|
| **TripService** | 2 | 10 | CPU > 45% | CPU < 30% | 30s |
| **DriverService** | 2 | 10 | CPU > 35% | CPU < 20% | 30s |
| **UserService** | 2 | 5 | CPU > 50% | CPU < 35% | 30s |

---

## Why Nginx + Python?

| LocalStack Auto Scaling | Our Solution |
|------------------------|--------------|
| ❌ Mock containers only | ✅ Real Docker containers |
| ❌ Manual target registration | ✅ Auto-discovery via DNS |
| High complexity | Single Python script |
