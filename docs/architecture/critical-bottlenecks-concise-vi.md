# Các Điểm Nghẽn Kiến Trúc Quan Trọng

Tài liệu này xác định các điểm nghẽn quan trọng trong kiến trúc legacy, được ưu tiên theo tác động đến tính ổn định và khả năng mở rộng của hệ thống.

## 0. Các Khái Niệm & Thuật Ngữ Cốt Lõi

Trước khi phân tích các điểm nghẽn, cần hiểu các cơ chế kỹ thuật điều khiển chúng.

### Đồng Bộ vs Bất Đồng Bộ
- **Đồng Bộ (Blocking):** Người gọi gửi request và **chờ đợi** câu trả lời; kết nối vẫn mở
  - *Ví dụ:* Cuộc gọi điện thoại—phải giữ máy cho đến khi được trả lời
- **Bất Đồng Bộ (Non-Blocking):** Người gọi gửi thông điệp và **tiếp tục làm việc**; câu trả lời đến sau
  - *Ví dụ:* Email—gửi đi và làm việc khác

### Mô Hình Push vs Pull
- **Push (Gắn Kết):** Upstream ép công việc lên downstream ngay lập tức
  - *Rủi ro:* Nếu downstream chậm, upstream bị tắc nghẽn
- **Pull (Tách Rời):** Downstream yêu cầu công việc khi sẵn sàng
  - *Lợi ích:* Backpressure tự nhiên—downstream không bao giờ bị quá tải

### Scale Dọc vs Scale Ngang
- **Scale Dọc (Scale Up):** Server lớn hơn (nhiều CPU/RAM hơn)
  - *Giới hạn:* Phần cứng có mức tối đa
- **Scale Ngang (Scale Out):** Nhiều server hơn (instances)
  - *Giới hạn:* Lý thuyết không giới hạn nếu phần mềm hỗ trợ

### Mô Hình Tài Nguyên Node.js
- **Event Loop:** Đơn luồng, xử lý nhiều kết nối mà không block CPU
- **Bẫy:** Trong khi CPU rảnh, các kết nối đang chờ tiêu thụ **RAM** (trạng thái) và **File Descriptors** (socket)
- **Crash:** Quá nhiều kết nối mở → cạn kiệt RAM/socket → process crash

---

## 1. Synchronous HTTP Chaining (Khả Năng Mở Rộng Bị Gắn Kết)

### Anti-Pattern (Mô Hình Sai Lầm)

Hệ thống sử dụng **Mô hình Push Đồng bộ** cho giao tiếp giữa các service. `TripService` đẩy request tới `DriverService` qua HTTP và chờ response.

> **Ví dụ:** User yêu cầu chuyến đi → `TripService` gọi `POST /match` tới `DriverService` → Nếu việc ghép tài xế mất 5 giây → `TripService` (và User) chờ 5 giây.

### Vấn Đề Cốt Lõi: Gắn Kết Thời Gian Không Có Backpressure

Khi `TripService` gọi `DriverService` đồng bộ, nó trở thành **"Con tin"**—không thể hoàn thành request của user cho đến khi nhận được response. Điều này tạo ra **gắn kết thời gian**: vòng đời của request upstream bị gắn trực tiếp với thời gian phản hồi của downstream.

**Định Nghĩa Quan Trọng:**
- **Backpressure:** Tín hiệu kháng cự từ hệ thống downstream không thể xử lý công việc nhanh bằng tốc độ upstream tạo ra
- **Backpressure Mechanisms:** Các cơ chế kiểm soát tường minh (hàng đợi, giới hạn tốc độ, circuit breaker, giới hạn đồng thời) phát hiện và phản ứng với backpressure
- **Vấn Đề Node.js:** Khác với mô hình thread-per-request có worker pool giới hạn cung cấp backpressure *tự động* ở tầng ứng dụng, Node.js không tự động giới hạn vòng đời request đồng thời. Không có cơ chế tường minh, hệ thống chấp nhận công việc cho đến khi cạn kiệt giới hạn cấp thấp (heap memory, file descriptor, OS backlog, proxy queue).

### Tại Sao Node.js Làm Vấn Đề Tệ Hơn

**Hiệu Suất Event Loop Như Một Cái Bẫy:**

Event loop đơn luồng của Node.js được tối ưu cho workload I/O-bound (network, database, file) nơi việc chờ đợi được ủy thác cho OS. Network I/O là bất đồng bộ—await HTTP response downstream **không** block event loop.

**Đặc Điểm Chính:**
- Event loop đơn xử lý nhiều request đồng thời hiệu quả
- Await I/O trả quyền kiểm soát về event loop (vẫn responsive)
- `async/await` không block event loop cho I/O
- `async/await` **không** áp đặt giới hạn concurrency
- Chỉ có CPU-bound work đồng bộ hoặc sync API tường minh (`fs.readFileSync`) mới block event loop

**Sự Đánh Đổi:**

Trong khi event loop vẫn responsive, **vòng đời request vẫn mở**, âm thầm tích lũy trạng thái giữ lại (memory, socket, request context) qua hàng nghìn request in-flight đồng thời. Tính responsive này che giấu quá tải cho đến khi tài nguyên cạn kiệt.

### Chuỗi Sự Cố

#### 1. Tích Lũy Tài Nguyên

Mỗi request đang chờ phải giữ lại:
- **Socket (File Descriptor):** Kết nối mạng mở tới downstream service
- **Heap Memory:** HTTP header, request body, response builder, closure, promise chain
- **Connection Pool Slot:** Không thể trả về cho đến khi nhận response

Những tài nguyên này không thể được giải phóng hoặc garbage collect khi request còn active (reachable từ call stack).

#### 2. Bão Hòa Đa Tầng

Sự cạn kiệt xảy ra qua nhiều tầng:
- **Application Layer:** Connection pool starvation, event loop delay
- **Proxy Layer:** Load balancer request queue đầy
- **OS Layer:** File descriptor limit vượt quá (`EMFILE: too many open files`)

#### 3. Cạn Kiệt Bộ Nhớ (OOM)

Dưới tải sustained:
1. Hàng nghìn request chờ đồng thời
2. Trạng thái giữ lại tăng nhanh hơn Garbage Collector có thể thu hồi
3. Chu kỳ GC trở nên thường xuyên hơn (V8 Orinoco hiện đại dùng concurrent marking, nhưng vẫn vật lộn dưới áp lực cực đoan)
4. Khi heap vượt giới hạn → `JavaScript heap out of memory`
5. Process crash → toàn bộ server chết

**Lưu ý:** Promise chưa resolve giữ lại closure và request context trong memory. Khi nhiều promise resolve cùng lúc, continuation của chúng chạy trước timer/callback, làm tăng event loop delay dưới tải.

#### 4. Vòng Xoáy Chết Của Autoscaling

- **0:00** → Traffic tăng đột biến 10x (tức thì)
- **0:01** → Các node hiện tại không phản hồi
  - Healthcheck fail (event loop delay, request queue saturation, memory pressure)
  - OOM crash (hàng nghìn pending request vượt giới hạn memory container)
  - Docker đánh dấu "unhealthy" và restart (làm tệ hơn: cold startup, không cache, initialization overhead)
  - Nginx timeout (502 Error) và đánh dấu server "down"
- **0:03** → Autoscaler cuối cùng kích hoạt (reactive, chờ CPU threshold + ~2 phút boot)
- **0:05** → Node mới boot nhưng gặp **"Thundering Herd"**
  - Request queued/retry từ nhiều tầng (3 tầng × 3 retry = 27× khuếch đại)
  - Synchronized retry storm khi healthcheck pass
  - Node mới nhận 10-100× burst load và crash ngay lập tức

**Kết quả:** 4-5 phút downtime; user rời khỏi platform trước khi hệ thống ổn định.

### Tác Động Nghiêm Trọng

**Khả Năng Mở Rộng Bị Gắn Kết:**
- Không thể scale service độc lập
- Thêm nhiều node `TripService` chỉ làm crash `DriverService` nhanh hơn
- Một service chậm làm nghẽn toàn bộ chuỗi

**Chuỗi Độ Trễ:**
- Tổng latency = tổng latency của tất cả service + network hop
- Độ chậm downstream tác động trực tiếp đến trải nghiệm user
- Không có buffering hoặc xử lý bất đồng bộ

**Sự Cố Lan Truyền:**
- Độ chậm tạm thời downstream → cạn kiệt tài nguyên upstream → crash
- Sự cố lan truyền lên qua tất cả service phụ thuộc
- Sự cố toàn hệ thống từ một service suy giảm

**Không Có Backpressure Tự Động:**
- Node.js tiếp tục chấp nhận request vượt dung lượng an toàn
- Tính responsive của event loop che giấu triệu chứng quá tải
- Sự cố chỉ hiện ra khi giới hạn cấp thấp bị đạt
- Lúc đó, phục hồi yêu cầu restart toàn bộ (mất tất cả trạng thái tích lũy)

### Hướng Giải Pháp

Triển khai cơ chế backpressure tường minh:
- **Bounded Concurrency:** Giới hạn request downstream in-flight (`p-limit`, per-route limit)
- **Load Shedding:** Từ chối request khi quá tải (`503 Service Unavailable`, `429 Too Many Requests`)
- **Circuit Breaker:** Ngừng gọi downstream service đang fail
- **Message Queue:** Tách rời service với consumption bất đồng bộ kiểu pull
- **Timeout:** Fail nhanh thay vì tích lũy vô thời hạn

Khi đạt dung lượng, producer phải bị làm chậm (rate-limit) hoặc từ chối, cho phép consumer xử lý ở tốc độ được kiểm soát và ngăn sự cố lan truyền.

---

## 2. Hạ Tầng Tĩnh (Giới Hạn Scale Thủ Công)

### Anti-Pattern (Mô Hình Sai Lầm)

Service chạy với số lượng container cố định (ví dụ: `replicas: 2`). Scale yêu cầu can thiệp thủ công từ đội operations.

### Vấn Đề Cốt Lõi: Phản Ứng Con Người Chậm Hơn Tốc Độ Traffic

Traffic trong app gọi xe biến động mạnh (mưa đột ngột, sự kiện). Hạ tầng tĩnh thất bại vì tốc độ tăng đột biến vượt tốc độ phản ứng con người.

**Timeline Của Sự Cố:**
1. **Traffic Tăng Đột Biến:** Tức thì (0 giây)
2. **Cảnh Báo Giám Sát:** Vài phút (phát hiện vượt ngưỡng)
3. **Phản Ứng Con Người:** Vài phút (điều tra, phê duyệt, thay đổi config)
4. **Container Khởi Động:** Vài phút (startup + làm ấm cache/connection)

**Kết quả:** Hệ thống quá tải trước khi con người kịp phản ứng.

### Nghịch Lý Sử Dụng

Chỉ có hai lựa chọn tồi:
- **Dự Phòng Thấp (Rủi ro):** Chạy 10 server để tiết kiệm → Crash trong giờ cao điểm
- **Dự Phòng Cao (Lãng phí):** Chạy 100 server để an toàn → 95 server nhàn rỗi lúc 3 giờ sáng, đốt tiền

### Tác Động Nghiêm Trọng

**Trần Dung Lượng Cứng:**

Khác với autoscaling thích nghi với tải, hạ tầng tĩnh đập vào tường gạch:

Khi traffic vượt dung lượng:
1. Tải dư không biến mất—nó xếp hàng
2. Request tích lũy trong proxy, application queue, database pool
3. Latency tăng phi tuyến → timeout → 5xx error
4. Client/proxy retry khuếch đại tải thêm
5. Cạn kiệt tài nguyên (memory, connection, GC pressure) trước khi CPU đạt 100%

**Không Hiệu Quả Về Tài Chính:**

Trả tiền cho dung lượng cao điểm 24/7 dù chỉ cần trong thời gian ngắn. Mức sử dụng trung bình thấp trong khi dung lượng worst-case phải luôn được cấp.

### Hướng Giải Pháp

- **Horizontal Autoscaling:** Tự động thêm/xóa instance dựa trên metric (CPU, memory, request rate)
- **Predictive Scaling:** Làm ấm dung lượng trước các pattern traffic đã biết
- **Load Shedding:** Từ chối request dư một cách graceful khi đạt dung lượng
- **Circuit Breaker:** Ngăn sự cố lan truyền trong quá tải

---

## 3. Truy Xuất Dữ Liệu Chưa Tối Ưu (Hot Path Bottleneck)

### Anti-Pattern (Mô Hình Sai Lầm)

Tất cả request (User Profile, Trip History) truy cập Primary Database trực tiếp. Không có caching layer (Redis/Memcached).

### Vấn Đề Cốt Lõi: Khuếch Đại Hot Data

10% dữ liệu (Profile, Active Trip) nhận 90% traffic. Mỗi lần đọc lặp lại ép database thực hiện thao tác đắt đỏ cho dữ liệu hầu như tĩnh.

**Không Hiệu Quả B-Tree vs Hash Map:**

**Database (B-Tree):**
- Duyệt cấu trúc cây: Root → Branch → Leaf
- Mỗi bước: So sánh CPU + khả năng disk I/O (8KB page)
- Độ phức tạp: O(log N) mỗi query
- Chi phí: 30,000 query/phút cho cùng profile ID lãng phí CPU/IOPS

**In-Memory Cache (Hash Map):**
- Tra cứu trực tiếp: O(1)
- Truy cập RAM thuần (microsecond)
- Không disk I/O, không duyệt tốn CPU

**Nghẽn Connection Pool:**
- TCP connection yêu cầu handshake (tốn CPU)
- Pool có giới hạn cứng (ví dụ: 100 connection)
- Khi pool đầy: query xếp hàng ngay cả khi query riêng lẻ nhanh
- Read volume cao làm chết đói critical write

### Tác Động Nghiêm Trọng

**Khuếch Đại Read:**

Một hành động user kích hoạt nhiều query dư thừa.

**Ví dụ:** 5000 tài xế ping "Get My Profile" mỗi 10s
- 30,000 query/phút cho dữ liệu tĩnh
- DB trở nên bị ràng buộc CPU/IOPS phục vụ read giá trị thấp
- Write quan trọng ("Accept Trip") bị trễ hoặc timeout

**Latency Tăng Vọt Do Hàng Đợi:**

Khi tốc độ request vượt dung lượng database:
- Query chờ trong hàng đợi
- Latency tăng phi tuyến (không chỉ chậm—tăng trưởng mũ)
- Tail latency bùng nổ → tác động user nhìn thấy

**Connection Pool Starvation:**

Chế độ thất bại:
- Pool bão hòa với 100 query "Get Profile" (nhanh nhưng volume cao)
- "Create Trip" (Write) không thể lấy connection → timeout
- Hệ thống fail không phải từ DB overload, mà từ bị chặn truy cập pool

### Hướng Giải Pháp

- **Caching Layer (Redis):** Lưu hot data trong memory (truy cập O(1))
- **Cache-Aside Pattern:** Kiểm tra cache trước, DB khi miss
- **TTL Strategy:** Cân bằng độ tươi vs hit rate
- **Connection Pooling:** Pool riêng cho read/write operation
- **Read Replica:** Dỡ tải read traffic từ primary (xem Critical 4)

---

## 4. Database Primary Đơn (Vertical Scaling Wall)

### Anti-Pattern (Mô Hình Sai Lầm)

Tất cả service kết nối tới single primary database node cho cả read và write. Không tách biệt concern (Read Replica).

### Vấn Đề Cốt Lõi: Tranh Chấp Tài Nguyên Giữa Read Và Write

Database có tài nguyên hữu hạn (CPU, RAM, IOPS). Thao tác giá trị thấp volume cao tranh chấp trực tiếp với transaction quan trọng.

**Cuộc Chiến Reader-Writer:**

**Write (Quan Trọng):**
- "Create Trip" yêu cầu đảm bảo ACID
- Chậm dưới contention (locking, transaction log, fsync/IOPS)
- Phải hoàn thành thành công cho tính liên tục kinh doanh

**Read (Volume Cao):**
- Polling "Get Status" rẻ nhưng thường xuyên
- Hàng nghìn query nhỏ tràn ngập CPU/IOPS
- Không quan trọng nhưng tiêu thụ tài nguyên chung

**Xung đột:** Write transaction chết đói CPU cycle vì read độc chiếm tài nguyên.

**Giới Hạn Vertical Scaling:**

**Scale Up (Server Lớn Hơn):**
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

### Tác Động Nghiêm Trọng

**Single Point of Failure (SPOF):**

**Kịch bản:** Restart database bắt buộc (security patch, OS update)

**Chuỗi sự cố:**
1. Database dừng → từ chối tất cả connection
2. Service crash hoặc treo chờ DB
3. Restart/recovery mất vài phút
4. Cache lạnh → hiệu năng giảm trong warm-up

**Kết quả:** Không có HA/failover, một sự kiện maintenance = sự cố toàn platform.

**Resource Starvation:**

**Ví dụ:** 1000 user polling trip status (adaptive 3s → 15s)
- Hàng nghìn query "Chúng ta đến chưa?" tiêu thụ ngân sách CPU/IOPS
- "Book Trip" (Write) timeout vì DB quá bận trả lời status check
- Transaction kinh doanh quan trọng fail do polling không quan trọng

**Trần Dung Lượng Cứng:**

**Kịch bản:** Đã ở instance size lớn nhất thực tế, traffic gấp đôi
- Không thể scale vertically vượt giới hạn phần cứng/ngân sách
- Hệ thống chạm trần và fail dưới tải sustained
- Không có tùy chọn horizontal scaling không có replica

### Hướng Giải Pháp

- **Read Replica:** Tách workload read/write (PostgreSQL streaming replication)
- **Explicit Routing:** Application quyết định primary vs replica mỗi query
- **Consistency Strategy:** Xử lý yêu cầu read-your-writes (primary read sau write)
- **High Availability:** Standby promotion cho failover
- **Monitoring:** Replication lag, connection pool saturation, query performance

---

## Tóm Tắt

Bốn điểm nghẽn này tạo ra một hệ thống mỏng manh dễ bị tổn thương trước traffic spike, sự cố lan truyền, và cạn kiệt tài nguyên. Giải quyết chúng yêu cầu:

1. **Tách rời bất đồng bộ** (message queue) để loại bỏ gắn kết thời gian
2. **Horizontal autoscaling** để điều chỉnh dung lượng với nhu cầu một cách động
3. **Caching layer** (Redis) để dỡ tải hot-path read từ database
4. **Read replica** để tách workload read/write và loại bỏ SPOF

Mỗi giải pháp được trình bày chi tiết trong các tài liệu architecture solution tương ứng.
