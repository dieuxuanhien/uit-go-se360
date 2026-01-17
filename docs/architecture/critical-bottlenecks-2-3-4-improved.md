# 2. Static Infrastructure (Manual Scaling Limits)

> **References:** See [bottleneck-references.md](./bottleneck-references.md) for authoritative sources on these concepts.

## Anti-Pattern

Services run on fixed container count (e.g., `replicas: 2`). Scaling requires manual intervention by operations team.

## Core Problem: Human Reaction Slower Than Traffic Velocity

Traffic in ride-hailing is volatile (sudden rain, events). Static infrastructure fails because spike velocity exceeds human reaction velocity.

### The Reaction Time Gap

**Timeline of Failure:**
1. **Traffic Spike:** Instant (0 seconds)
2. **Monitoring Alert:** Minutes (threshold breach detection)
3. **Human Response:** Minutes (investigation, approval, config change)
4. **Container Boot:** Minutes (startup + cache/connection warm-up)

**Result:** System overwhelmed before humans can respond.

### The Utilization Paradox

Only two bad choices:
- **Under-Provision (Risk):** Run 10 servers to save cost → Crash during peak hours
- **Over-Provision (Waste):** Run 100 servers for safety → 95 servers idle at 3 AM, burning money

## Critical Impacts

### Hard Capacity Ceiling

Unlike autoscaling that adapts to load, static infrastructure hits a brick wall:

**When traffic exceeds capacity:**
1. Excess load doesn't disappear—it queues
2. Requests accumulate in proxies, application queues, database pools
3. Latency grows non-linearly → timeouts → 5xx errors
4. Client/proxy retries amplify load further
5. Resource exhaustion (memory, connections, GC pressure) before CPU hits 100%

### Financial Inefficiency

Paying for peak capacity 24/7 despite only needing it for brief periods. Average utilization remains low while worst-case capacity must always be provisioned.

## Solution Direction

- **Horizontal Autoscaling:** Automatically add/remove instances based on metrics (CPU, memory, request rate)
- **Predictive Scaling:** Pre-warm capacity before known traffic patterns
- **Load Shedding:** Reject excess requests gracefully when at capacity
- **Circuit Breakers:** Prevent cascading failures during overload

---

---

# 3. Unoptimized Data Retrieval (Hot Path Bottleneck)

## Anti-Pattern

All requests (User Profile, Trip History) hit Primary Database directly. No caching layer (Redis/Memcached).

## Core Problem: Hot Data Amplification

10% of data (Profiles, Active Trips) receives 90% of traffic. Every repeated read forces expensive database operations for mostly static data.

### B-Tree vs Hash Map Inefficiency

**Database (B-Tree):**
- Traverse tree structure: Root → Branch → Leaf
- Each step: CPU comparisons + potential disk I/O (8KB page)
- Complexity: O(log N) per query
- Cost: 30,000 queries/min for same profile ID wastes CPU/IOPS

**In-Memory Cache (Hash Map):**
- Direct lookup: O(1)
- Pure RAM access (microseconds)
- No disk I/O, no CPU-intensive traversal

### Connection Pool Bottleneck

**TCP Connection Overhead:**
- Each connection requires handshake (CPU intensive)
- Pool has hard limit (e.g., 100 connections)
- When pool full: queries queue even if individual queries are fast
- High-volume reads starve critical writes

## Critical Impacts

### Read Amplification

Single user action triggers multiple redundant queries.

**Example:** 5000 drivers ping "Get My Profile" every 10s
- 30,000 queries/min for static data
- DB becomes CPU/IOPS bound serving low-value reads
- Critical writes ("Accept Trip") delayed or timeout

### Queue-Induced Latency Spike

When request rate exceeds database capacity:
- Queries wait in queue
- Latency rises non-linearly (not just slow—exponential growth)
- Tail latency explodes → user-visible impact

### Connection Pool Starvation

**Failure Mode:**
- Pool saturated with 100 "Get Profile" queries (fast but high-volume)
- "Create Trip" (Write) cannot acquire connection → timeout
- System fails not from DB overload, but from blocked pool access

## Solution Direction

- **Caching Layer (Redis):** Store hot data in-memory (O(1) access)
- **Cache-Aside Pattern:** Check cache first, DB on miss
- **TTL Strategy:** Balance freshness vs hit rate
- **Connection Pooling:** Separate pools for read/write operations
- **Read Replicas:** Offload read traffic from primary (see Critical 4)

---

---

# 4. Single Primary Database (Vertical Scaling Wall)

## Anti-Pattern

All services connect to single primary database node for both reads and writes. No separation of concerns (Read Replicas).

## Core Problem: Resource Contention Between Reads and Writes

Database has finite resources (CPU, RAM, IOPS). Low-value high-volume operations compete directly with critical transactions.

### The Reader-Writer War

**Writes (Critical):**
- "Create Trip" requires ACID guarantees
- Slow under contention (locking, transaction log, fsync/IOPS)
- Must complete successfully for business continuity

**Reads (High-Volume):**
- "Get Status" polling is cheap but frequent
- Thousands of small queries swarm CPU/IOPS
- Non-critical but consume shared resources

**Conflict:** Write transactions starve for CPU cycles because reads monopolize resources.

### Vertical Scaling Limits

**Scale Up (Bigger Server):**
- Has practical ceiling (hardware limits)
- Has financial ceiling (cost grows exponentially)
- Eventually hits hard limit

**Scale Out (Read Replicas):**
- Can offload read traffic
- **Trade-off:** Replicas are eventually consistent *(a fundamental trade-off formalized in the CAP theorem—Brewer, 2000)*
- **Challenge:** "Read-your-writes" flows (e.g., read trip immediately after creating) may see stale data unless using consistency strategy *(Kleppmann, "Designing Data-Intensive Applications", Ch.5)*:
  - Read from primary after write
  - Session stickiness
  - Version checks
- Without strategy: teams keep reads on primary → traps high-volume traffic with writes

## Critical Impacts

### Single Point of Failure (SPOF)

**Scenario:** Mandatory database restart (security patch, OS update)

**Failure Sequence:**
1. Database stops → rejects all connections
2. Services crash or hang waiting for DB
3. Restart/recovery takes minutes
4. Cache cold → performance degraded during warm-up

**Result:** Without HA/failover, single maintenance event = full platform outage.

### Resource Starvation

**Example:** 1000 users polling trip status (adaptive 3s → 15s)
- Thousands of "Are we there yet?" queries consume CPU/IOPS budget
- "Book Trip" (Write) times out because DB too busy answering status checks
- Critical business transaction fails due to non-critical polling

### Hard Capacity Ceiling

**Scenario:** Already at largest practical instance size, traffic doubles
- Cannot scale vertically beyond hardware/budget limits
- System hits ceiling and fails under sustained load
- No horizontal scaling option without replicas

## Solution Direction

- **Read Replicas:** Separate read/write workloads (PostgreSQL streaming replication)
- **Explicit Routing:** Application decides primary vs replica per query
- **Consistency Strategy:** Handle read-your-writes requirements (primary reads after writes)
- **High Availability:** Standby promotion for failover
- **Monitoring:** Replication lag, connection pool saturation, query performance

---

---

---

# TIẾNG VIỆT

# 2. Hạ tầng Tĩnh (Giới hạn Scale Thủ công)

## Anti-Pattern (Mô hình sai lầm)

Service chạy với số lượng container cố định (ví dụ: `replicas: 2`). Scale yêu cầu can thiệp thủ công từ đội ops.

## Vấn đề cốt lõi: Phản ứng con người chậm hơn tốc độ traffic

Traffic trong app gọi xe biến động mạnh (mưa đột ngột, sự kiện). Hạ tầng tĩnh thất bại vì tốc độ tăng đột biến vượt tốc độ phản ứng con người.

### Khoảng cách thời gian phản ứng

**Timeline của sự cố:**
1. **Traffic tăng đột biến:** Tức thì (0 giây)
2. **Cảnh báo giám sát:** Vài phút (phát hiện vượt ngưỡng)
3. **Phản ứng con người:** Vài phút (điều tra, phê duyệt, thay đổi config)
4. **Container khởi động:** Vài phút (startup + làm ấm cache/connection)

**Kết quả:** Hệ thống quá tải trước khi con người kịp phản ứng.

### Nghịch lý sử dụng

Chỉ có hai lựa chọn tồi:
- **Dự phòng thấp (Rủi ro):** Chạy 10 server để tiết kiệm → Crash trong giờ cao điểm
- **Dự phòng cao (Lãng phí):** Chạy 100 server để an toàn → 95 server nhàn rỗi lúc 3 giờ sáng, đốt tiền

## Tác động nghiêm trọng

### Trần dung lượng cứng

Khác với autoscaling thích nghi với tải, hạ tầng tĩnh đập vào tường gạch:

**Khi traffic vượt dung lượng:**
1. Tải dư không biến mất—nó xếp hàng
2. Request tích lũy trong proxy, application queue, database pool
3. Latency tăng phi tuyến → timeout → 5xx error
4. Client/proxy retry khuếch đại tải thêm
5. Cạn kiệt tài nguyên (memory, connection, GC pressure) trước khi CPU đạt 100%

### Không hiệu quả về tài chính

Trả tiền cho dung lượng cao điểm 24/7 dù chỉ cần trong thời gian ngắn. Mức sử dụng trung bình thấp trong khi dung lượng worst-case phải luôn được cấp.

## Hướng giải pháp

- **Horizontal Autoscaling:** Tự động thêm/xóa instance dựa trên metric (CPU, memory, request rate)
- **Predictive Scaling:** Làm ấm dung lượng trước các pattern traffic đã biết
- **Load Shedding:** Từ chối request dư một cách graceful khi đạt dung lượng
- **Circuit Breaker:** Ngăn sự cố lan truyền trong quá tải

---

---

# 3. Truy xuất Dữ liệu Chưa Tối ưu (Hot Path Bottleneck)

## Anti-Pattern (Mô hình sai lầm)

Tất cả request (User Profile, Trip History) truy cập Primary Database trực tiếp. Không có caching layer (Redis/Memcached).

## Vấn đề cốt lõi: Khuếch đại Hot Data

10% dữ liệu (Profile, Active Trip) nhận 90% traffic. Mỗi lần đọc lặp lại ép database thực hiện thao tác đắt đỏ cho dữ liệu hầu như tĩnh.

### Không hiệu quả B-Tree vs Hash Map

**Database (B-Tree):**
- Duyệt cấu trúc cây: Root → Branch → Leaf
- Mỗi bước: So sánh CPU + khả năng disk I/O (8KB page)
- Độ phức tạp: O(log N) mỗi query
- Chi phí: 30,000 query/phút cho cùng profile ID lãng phí CPU/IOPS

**In-Memory Cache (Hash Map):**
- Tra cứu trực tiếp: O(1)
- Truy cập RAM thuần (microsecond)
- Không disk I/O, không duyệt tốn CPU

### Nghẽn Connection Pool

**Overhead TCP Connection:**
- Mỗi connection yêu cầu handshake (tốn CPU)
- Pool có giới hạn cứng (ví dụ: 100 connection)
- Khi pool đầy: query xếp hàng ngay cả khi query riêng lẻ nhanh
- Read khối lượng cao làm chết đói critical write

## Tác động nghiêm trọng

### Khuếch đại Read

Một hành động user kích hoạt nhiều query dư thừa.

**Ví dụ:** 5000 tài xế ping "Get My Profile" mỗi 10s
- 30,000 query/phút cho dữ liệu tĩnh
- DB trở nên bị ràng buộc CPU/IOPS phục vụ read giá trị thấp
- Write quan trọng ("Accept Trip") bị trễ hoặc timeout

### Latency tăng vọt do hàng đợi

Khi tốc độ request vượt dung lượng database:
- Query chờ trong hàng đợi
- Latency tăng phi tuyến (không chỉ chậm—tăng trưởng mũ)
- Tail latency bùng nổ → tác động user nhìn thấy

### Connection Pool Starvation

**Chế độ thất bại:**
- Pool bão hòa với 100 query "Get Profile" (nhanh nhưng volume cao)
- "Create Trip" (Write) không thể lấy connection → timeout
- Hệ thống fail không phải từ DB overload, mà từ bị chặn truy cập pool

## Hướng giải pháp

- **Caching Layer (Redis):** Lưu hot data trong memory (truy cập O(1))
- **Cache-Aside Pattern:** Kiểm tra cache trước, DB khi miss
- **TTL Strategy:** Cân bằng độ tươi vs hit rate
- **Connection Pooling:** Pool riêng cho read/write operation
- **Read Replica:** Dỡ tải read traffic từ primary (xem Critical 4)

---

---

# 4. Database Primary Đơn (Vertical Scaling Wall)

## Anti-Pattern (Mô hình sai lầm)

Tất cả service kết nối tới single primary database node cho cả read và write. Không tách biệt concern (Read Replica).

## Vấn đề cốt lõi: Tranh chấp tài nguyên giữa Read và Write

Database có tài nguyên hữu hạn (CPU, RAM, IOPS). Thao tác giá trị thấp volume cao tranh chấp trực tiếp với transaction quan trọng.

### Cuộc chiến Reader-Writer

**Write (Quan trọng):**
- "Create Trip" yêu cầu đảm bảo ACID
- Chậm dưới contention (locking, transaction log, fsync/IOPS)
- Phải hoàn thành thành công cho tính liên tục kinh doanh

**Read (Volume cao):**
- Polling "Get Status" rẻ nhưng thường xuyên
- Hàng nghìn query nhỏ tràn ngập CPU/IOPS
- Không quan trọng nhưng tiêu thụ tài nguyên chung

**Xung đột:** Write transaction chết đói CPU cycle vì read độc chiếm tài nguyên.

### Giới hạn Vertical Scaling

**Scale Up (Server lớn hơn):**
- Có trần thực tế (giới hạn phần cứng)
- Có trần tài chính (chi phí tăng theo cấp số mũ)
- Cuối cùng chạm giới hạn cứng

**Scale Out (Read Replica):**
- Có thể dỡ tải read traffic
- **Đánh đổi:** Replica eventually consistent
- **Thách thức:** Flow "Read-your-writes" (ví dụ: đọc trip ngay sau tạo) có thể thấy dữ liệu cũ trừ khi dùng chiến lược consistency:
  - Đọc từ primary sau write
  - Session stickiness
  - Version check
- Không có chiến lược: team giữ read trên primary → bẫy traffic volume cao với write

## Tác động nghiêm trọng

### Single Point of Failure (SPOF)

**Kịch bản:** Restart database bắt buộc (security patch, OS update)

**Chuỗi sự cố:**
1. Database dừng → từ chối tất cả connection
2. Service crash hoặc treo chờ DB
3. Restart/recovery mất vài phút
4. Cache lạnh → hiệu năng giảm trong warm-up

**Kết quả:** Không có HA/failover, một sự kiện maintenance = sự cố toàn platform.

### Resource Starvation

**Ví dụ:** 1000 user polling trip status (adaptive 3s → 15s)
- Hàng nghìn query "Chúng ta đến chưa?" tiêu thụ ngân sách CPU/IOPS
- "Book Trip" (Write) timeout vì DB quá bận trả lời status check
- Transaction kinh doanh quan trọng fail do polling không quan trọng

### Trần dung lượng cứng

**Kịch bản:** Đã ở instance size lớn nhất thực tế, traffic gấp đôi
- Không thể scale vertically vượt giới hạn phần cứng/ngân sách
- Hệ thống chạm trần và fail dưới tải sustained
- Không có tùy chọn horizontal scaling không có replica

## Hướng giải pháp

- **Read Replica:** Tách workload read/write (PostgreSQL streaming replication)
- **Explicit Routing:** Application quyết định primary vs replica mỗi query
- **Consistency Strategy:** Xử lý yêu cầu read-your-writes (primary read sau write)
- **High Availability:** Standby promotion cho failover
- **Monitoring:** Replication lag, connection pool saturation, query performance
