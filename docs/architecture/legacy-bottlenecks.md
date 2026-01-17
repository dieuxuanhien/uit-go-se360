# Critical Bottlenecks in Legacy Architecture

This document outlines the four critical issues identified in the legacy architecture that limit scalability, resilience, and performance. These bottlenecks are the primary drivers for the architectural decisions (ADRs) implemented in the modernization phase.

## 1. Blocking I/O and Synchronous HTTP Chaining

**Problem / Anti-Pattern:**
The system relies on sequential synchronous HTTP calls between services (e.g., TripService calling DriverService). The upstream service blocks and waits for the downstream service to respond.

**Observable Impact:**
- **Increased Latency:** End-to-end flows experience high latency due to the sum of sequential calls.
- **Cascading Failures:** Failures or slowness in downstream dependencies (DriverService) propagate upstream, causing request timeouts and failures in the caller (TripService).
- **Tight Coupling:** Services cannot function independently; operational resilience is reduced.

**Correction:**
- [ADR-001: Event-Driven Async Communication](../adrs/ADR-001-event-driven-async-communication.md) - Decouples services using SNS/SQS.

---

## 2. Single Primary Database Instance

**Problem / Anti-Pattern:**
Each service relies on a single primary database node for both read and write operations.

**Observable Impact:**
- **Single Point of Failure (SPOF):** The entire system depends on one node; outages or maintenance cause full service disruption.
- **Resource Contention:** Increased read traffic competes with write operations for the primary node's CPU and I/O resources.
- **Limited Scalability:** Vertical scaling (bigger machine) is the only option, which has a hard limit.

**Correction:**
- [ADR-002: Database Read Scaling with Read Replicas](../adrs/ADR-002-database-read-scaling-rds-replicas.md) - Offloads read traffic to replicas.

---

## 3. All Read Operations Target Primary Database

**Problem / Anti-Pattern:**
There is no data retrieval optimization layer (caching). All read requests, even for static or frequently accessed data, hit the database directly.

**Observable Impact:**
- **Unnecessary Load:** Repeated queries for the same data generate redundant load on the database.
- **High Latency:** Data retrieval is slower compared to in-memory access.
- **Connection Pool Contention:** Database connection pools are exhausted by redundant read operations, blocking critical writes.

**Correction:**
- [ADR-003: Distributed Caching with ElastiCache](../adrs/ADR-003-distributed-caching-elasticache.md) - Introduces Redis to cache frequent reads.

---

## 4. Fixed Number of Containers (No Elasticity)

**Problem / Anti-Pattern:**
Services run on a fixed number of containers/instances. Scaling requires manual intervention.

**Observable Impact:**
- **Static Capacity:** System cannot adapt to variable traffic volume (e.g., rush hour spikes).
- **Under-provisioning:** Leads to timeouts, high latency, and increased error rates during traffic spikes.
- **Over-provisioning:** Wastes resources and budget during periods of low demand.
- **Operational Overhead:** Manual scaling is slow and error-prone.

**Correction:**
- [ADR-004: Auto-Scaling Infrastructure](../adrs/ADR-004-auto-scaling-infrastructure.md) - Implements HPA (Horizontal Pod Autoscaler) or EC2 Auto Scaling.
