# Giải Pháp 4: Database Scaling (Chiến Lược "Nhân Bản")

## 1. Bản Chất Vấn Đề: "Giới Hạn Bộ Não Đơn"

**Vật lý:** Một database server đơn (Primary) có số lượng CPU core và Disk IOPS hữu hạn

**Giới hạn:** Vertical Scaling (mua server lớn hơn) chạm tường. Không thể mua CPU 1,000 GHz

**Chế độ thất bại:** Dưới high concurrency, thường thấy mix của contention (lock), saturated I/O, exhausted connection pool, và queueing time dài hơn—hiện ra như tail-latency spike và timeout

## 2. Giải Pháp Kiến Trúc: "Read Replica"

Chia workload dựa trên bản chất operation:
- **Write:** "Create Trip", "Update Location" - PHẢI đi Primary DB để đảm bảo đúng đắn
- **Read:** "Get Profile", "List History" - Có thể đi **Read Replica** (bản sao) khi endpoint có thể chấp nhận data hơi cũ

### Pattern: Command Query Responsibility Segregation (CQRS - Lite)

Không cần full CQRS. Chỉ cần route query:
- `INSERT/UPDATE/DELETE` → **Primary**
- Read-only query → **Replica 1, Replica 2, ...** (được chọn tường minh trong repository code)

## 3. Tại Sao Giải Pháp Này Sửa Crash

- **Read scaling:** Replica tăng read throughput *tiềm năng* bằng distribute read-only query qua nhiều database instance
- **Isolation:** Read-heavy hoặc query chậm hơn có thể chạy trên replica nên không cạnh tranh nhiều với write-critical flow trên Primary
- **Giới hạn quan trọng:** Read replica **không** tăng write capacity
- **Availability (về mặt khái niệm):** Replica *có thể* được promote thành Primary mới, nhưng failover/promotion đó là operational procedure (không được tự động triển khai bởi setup `docker-compose` hiện tại của chúng ta)

## 4. Lựa Chọn Công Nghệ

Dùng **PostgreSQL Streaming Replication**.

**Cơ chế:** Primary ghi thay đổi vào Write-Ahead Log (WAL). Replica stream log này và apply thay đổi

**Lag:** Replication thường **asynchronous**. Staleness window có thể thay đổi (có thể nhỏ trong steady-state, và trở nên lớn hơn dưới load hoặc trong recovery)

## 5. Chiến Lược Triển Khai

### A. Infrastructure (`docker-compose.replicas.yml`)

Khởi động 2 replica Postgres container per database (user DB và trip DB) follow Primary tương ứng.

```yaml
services:
  postgres-user-replica-1:
    image: postgres:15-alpine
    entrypoint: ["/bin/bash", "/setup-replica.sh", "postgres-user", "postgres", "postgres"]
    depends_on:
      postgres-user:
        condition: service_healthy
```

### B. Routing Logic (`services/user-service/src/database/database-replica.service.ts`)

Mở rộng Prisma Client để quản lý nhiều connection.

```typescript
@Injectable()
export class PrismaReplicaService extends PrismaClient {
  private replicas: PrismaClient[] = [];
  private currentReplicaIndex = 0;

  /**
   * Round-Robin Load Balancer
   * Trả về replica client khác nhau cho mỗi lần gọi
   */
  getReadClient(): PrismaClient {
    if (this.replicas.length === 0) return this; // Fallback Primary

    const replica = this.replicas[this.currentReplicaIndex];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicas.length;
    return replica;
  }
}
```

### C. Sử Dụng Trong Repository

Chọn tường minh connection nào để dùng.

```typescript
// services/user-service/src/users/users.repository.ts

async findById(id: string) {
  // DÙNG REPLICA cho Read
  return this.replicaService.getReadClient().user.findUnique({ where: { id } });
}

async update(id: string, data: any) {
  // DÙNG PRIMARY cho Write (this.prisma là Primary)
  return this.prisma.user.update({ where: { id }, data });
}
```

Trong `trip-service`, follow cùng pattern, nhưng giữ một số read trên Primary theo mặc định để bảo toàn hành vi **read-your-writes** (ví dụ: `findById()` dùng Primary trừ khi option `allowStale` được truyền).

## 6. Trade-offs & Trạng Thái Giảm Thiểu

Replication giới thiệu vấn đề consistency "Read-Your-Writes".

### A. Trade-off: "Replication Lag"

**Chi phí:** User write trên Primary, rồi ngay lập tức read từ Replica; Replica có thể chưa apply write đó. User có thể thấy data cũ

**Rủi ro:** User bối rối ("Update của tôi fail à?")

**Trạng thái:** ⚙️ **ĐÃ GIẢM THIỂU MỘT PHẦN**
- **Đã triển khai:** Một số endpoint tường minh read từ Primary cho freshness (ví dụ: `trip-service` single-trip lookup default Primary)
- **Rủi ro còn lại:** Một số read trong `user-service` đi replica sau cache miss; sau recent write, vẫn có thể observe staleness trừ khi chúng ta cố ý pin các read đó vào Primary trong short window

### B. Trade-off: Connection Complexity

**Chi phí:** Thay vì 1 DB connection pool, app giờ quản lý 3 pool (Primary + 2 Replica)

**Rủi ro:** Có thể cạn kiệt OS file descriptor hoặc memory nếu mở quá nhiều connection

**Trạng thái:** ⏳ **CHƯA TRIỂN KHAI**
- **Rủi ro hiện tại:** Thấp (hiện tại)
- **Giảm thiểu đã lên kế hoạch:** **PgBouncer**. Như đề cập trong Solution 2, cần proxy để multiplex các connection này

### C. Trade-off: Operational Overhead

**Chi phí:** Quản lý replication slot, monitor lag, và xử lý failover phức tạp

**Rủi ro:** Nếu replica fall quá xa phía sau, WAL log trên Primary có thể fill disk

**Trạng thái:** ⚙️ **ĐÃ GIẢM THIỂU MỘT PHẦN**
- **Đã triển khai:** Docker health check cơ bản
- **Thiếu:** Automated monitoring/alerting của replication health (ví dụ: `pg_stat_replication` trên primary) và failover procedure được định nghĩa

## 7. Tích Hợp Với Các Giải Pháp Khác

```
Kiến Trúc Tổng Thể:
┌─────────────────────────────────────────────────────┐
│              Request Flow (Full Stack)              │
├─────────────────────────────────────────────────────┤
│  User Request                                       │
│       │                                             │
│       ▼                                             │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐             │
│  │ Load    │─►│ Trip    │─►│ Redis    │             │
│  │Balancer │  │ Service │  │ Cache    │             │ 
│  │(Nginx)  │  │(Scaled) │  │(Sol. 3)  │             │
│  └─────────┘  └─────┬───┘  └────┬─────┘             │
│                    │            │                   │
│                    ▼            ▼                   │
│            ┌────────────┐  ┌────────────┐           │
│            │  Primary   │  │  Replica   │           │
│            │  Database  │◄─│  Database  │           │
│            │  (Write)   │  │  (Read)    │           │
│            └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────┘
```

**Làm việc cùng nhau:**
- **Solution 1 (Async):** Tách Trip Service khỏi Driver Service
- **Solution 2 (Auto-Scale):** Trip Service scale theo SQS queue depth
- **Solution 3 (Cache):** Redis xử lý hot read, giảm DB load
- **Solution 4 (Replica):** Phân phối read load, bảo vệ Primary cho write

**Kết quả:** Hệ thống có khả năng chịu traffic spike, scale động, và bảo vệ database khỏi exhaustion.
