# Solution 4: Database Scaling (The "Cloning" Strategy)

## 1. The Essence of the Problem: "The Single Brain Limit"
In the *Critical Bottlenecks* analysis, we identified that the database is the ultimate bottleneck.

*   **The Physics:** A single database server (Primary) has a finite number of CPU cores and Disk IOPS.
*   **The Limit:** Vertical Scaling (buying a bigger server) hits a wall. You can't buy a CPU with 1,000 GHz.
*   **The Failure Mode:** "Lock Contention." When 10,000 users try to read and write to the same table simultaneously, the database spends more time managing locks than executing queries.

## 2. The Architectural Solution: "Read Replicas"
We split the workload based on the nature of the operation:
*   **Writes (20%):** "Create Trip", "Update Location". These MUST go to the Primary DB to ensure consistency.
*   **Reads (80%):** "Get Profile", "List History". These can go to **Read Replicas** (Copies).

### The Pattern: Command Query Responsibility Segregation (CQRS - Lite)
We don't need full CQRS. We just need to route queries:
*   `INSERT/UPDATE/DELETE` -> **Primary**
*   `SELECT` -> **Replica 1, Replica 2, ...**

## 3. Why This Fixes the Crash
*   **Capacity:** By adding 2 replicas, we triple our read capacity.
*   **Isolation:** Heavy analytical queries (e.g., "Daily Report") run on a replica, so they don't slow down the "Create Trip" flow on the Primary.
*   **Availability:** If the Primary dies, a Replica can be promoted to become the new Primary (Failover).

## 4. Technology Selection
We use **PostgreSQL Streaming Replication**.

*   **Mechanism:** The Primary writes changes to a Write-Ahead Log (WAL). Replicas stream this log and apply the changes.
*   **Lag:** The replication is **Asynchronous**. There is a tiny delay (10-100ms) between the Primary and the Replica.

## 5. Implementation Strategy

We implemented a **Round-Robin Read Replica** system in the Application Layer.

### A. Infrastructure (`docker-compose.replicas.yml`)
We spin up 2 additional Postgres containers that follow the Primary.

```yaml
services:
  postgres-user-replica-1:
    image: postgres:15-alpine
    entrypoint: ["/setup-replica.sh", "postgres-user"] # Script to clone Primary
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

## 6. Trade-offs & Mitigation Status

Replication introduces the "Read-Your-Writes" consistency problem.

### A. Trade-off: "Replication Lag"
*   **The Cost:** A user updates their profile (Primary), then immediately refreshes the page (Replica). The Replica hasn't received the update yet (100ms lag). The user sees the old profile.
*   **Risk:** User confusion ("Did my update fail?").
*   **Status:** ✅ **MITIGATED (Design)**
    *   **Strategy:** **Critical Reads go to Primary.**
    *   *Logic:* For sensitive flows (e.g., "Get Trip Status" immediately after creation), we intentionally bypass the replica and read from the Primary.
    *   *Code:* `this.prisma.trip.findUnique(...)` instead of `getReadClient()`.

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
    *   **Missing:** Automated monitoring of `pg_stat_replication` to alert if lag > 1 second.
