# Solution 4: Database Scaling (The "Cloning" Strategy)

## 1. The Essence of the Problem: "The Single Brain Limit"
In the *Critical Bottlenecks* analysis, we identified that the database is the ultimate bottleneck.

*   **The Physics:** A single database server (Primary) has a finite number of CPU cores and Disk IOPS.
*   **The Limit:** Vertical Scaling (buying a bigger server) hits a wall. You can't buy a CPU with 1,000 GHz.
*   **The Failure Mode:** Under high concurrency, you typically see a mix of contention (locks), saturated I/O, exhausted connection pools, and longer queueing time — which shows up as tail-latency spikes and timeouts.

## 2. The Architectural Solution: "Read Replicas"
We split the workload based on the nature of the operation:
*   **Writes:** "Create Trip", "Update Location". These MUST go to the Primary DB to ensure correctness.
*   **Reads:** "Get Profile", "List History". These can go to **Read Replicas** (copies) when the endpoint can tolerate slightly stale data.

### The Pattern: Command Query Responsibility Segregation (CQRS - Lite)
We don't need full CQRS. We just need to route queries:
*   `INSERT/UPDATE/DELETE` -> **Primary**
*   Read-only queries -> **Replica 1, Replica 2, ...** (chosen explicitly in repository code)

## 3. Why This Fixes the Crash
*   **Read scaling:** Replicas increase read throughput *potential* by distributing read-only queries across more database instances.
*   **Isolation:** Read-heavy or slower queries can run on replicas so they don't compete as much with write-critical flows on the Primary.
*   **Important limitation:** Read replicas do **not** increase write capacity.
*   **Availability (conceptually):** A replica *can* be promoted to become the new Primary, but that failover/promotion is an operational procedure (it is not automatically implemented by our current `docker-compose` setup).

## 4. Technology Selection
We use **PostgreSQL Streaming Replication**.

*   **Mechanism:** The Primary writes changes to a Write-Ahead Log (WAL). Replicas stream this log and apply the changes.
*   **Lag:** The replication is typically **asynchronous**. The staleness window is variable (it can be small in steady-state, and become larger under load or during recovery).

## 5. Implementation Strategy

We implemented a **Round-Robin Read Replica** system in the Application Layer.

This is **explicit routing**: repositories choose whether to use Primary (`this.prisma` / `DatabaseService`) or a replica (`this.replicaService.getReadClient()`), rather than auto-detecting SQL types.

### A. Infrastructure (`docker-compose.replicas.yml`)
We spin up 2 replica Postgres containers per database (user DB and trip DB) that follow their respective Primaries.

```yaml
services:
  postgres-user-replica-1:
    image: postgres:15-alpine
    entrypoint: ["/bin/bash", "/setup-replica.sh", "postgres-user", "postgres", "postgres"] # Script to clone Primary
    depends_on:
      postgres-user:
        condition: service_healthy
```

### B. The Routing Logic (`services/user-service/src/database/database-replica.service.ts`)
We extended the Prisma Client to manage multiple connections.

```typescript
@Injectable()
export class PrismaReplicaService extends PrismaClient {
  private replicas: PrismaClient[] = [];
  private currentReplicaIndex = 0;

  // ... initialization code ...

  /**
   * Round-Robin Load Balancer
   * Returns a different replica client for each call.
   */
  getReadClient(): PrismaClient {
    if (this.replicas.length === 0) return this; // Fallback to Primary

    const replica = this.replicas[this.currentReplicaIndex];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicas.length;
    return replica;
  }
}
```

### C. Usage in Repository
We explicitly choose which connection to use.

```typescript
// services/user-service/src/users/users.repository.ts

async findById(id: string) {
  // USE REPLICA for Reads
  return this.replicaService.getReadClient().user.findUnique({ where: { id } });
}

async update(id: string, data: any) {
  // USE PRIMARY for Writes (this.prisma is the Primary)
  return this.prisma.user.update({ where: { id }, data });
}
```

In `trip-service`, we follow the same pattern, but keep some reads on Primary by default to preserve **read-your-writes** behavior (e.g., `findById()` uses Primary unless an `allowStale` option is passed).

## 6. Trade-offs & Mitigation Status

Replication introduces the "Read-Your-Writes" consistency problem.

### A. Trade-off: "Replication Lag"
*   **The Cost:** A user writes on Primary, then immediately reads from a Replica; the Replica may not have applied that write yet. The user can see stale data.
*   **Risk:** User confusion ("Did my update fail?").
*   **Status:** ⚙️ **PARTIALLY MITIGATED**
    *   **Implemented:** Some endpoints explicitly read from Primary for freshness (e.g., `trip-service` single-trip lookup defaults to Primary).
    *   **Remaining risk:** Some reads in `user-service` go to replicas after cache miss; after a recent write, that can still observe staleness unless we deliberately pin those reads to Primary for a short window.

### B. Trade-off: Connection Complexity
*   **The Cost:** Instead of 1 DB connection pool, the app now manages 3 pools (Primary + 2 Replicas).
*   **Risk:** We might exhaust the OS file descriptors or memory if we open too many connections.
*   **Status:** ⏳ **NOT YET IMPLEMENTED**
    *   **Current Risk:** Low (for now).
    *   **Planned Mitigation:** **PgBouncer**. As mentioned in Solution 2, we need a proxy to multiplex these connections.

### C. Trade-off: Operational Overhead
*   **The Cost:** Managing replication slots, monitoring lag, and handling failover is complex.
*   **Risk:** If a replica falls too far behind, the WAL logs on the Primary can fill up the disk.
*   **Status:** ⚙️ **PARTIALLY MITIGATED**
    *   **Implemented:** Basic Docker health checks.
    *   **Missing:** Automated monitoring/alerting of replication health (e.g., `pg_stat_replication` on the primary) and a defined failover procedure.
