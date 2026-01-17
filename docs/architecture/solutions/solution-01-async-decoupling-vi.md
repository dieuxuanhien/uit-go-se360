# Giải Pháp 1: Tách Rời Bất Đồng Bộ (Phá Vỡ Gắn Kết Thời Gian)

## 1. Bản Chất Vấn Đề: "Gắn Kết Thời Gian"

Nguyên nhân gốc rễ của crash không phải "code chậm" hay "server kém". Đó là **Gắn Kết Thời Gian** (Temporal Coupling).

**Định nghĩa:**
- Service A (Trip) *không thể hoàn thành* cho đến khi Service B (Driver) hoàn thành
- **Vật lý:** Nếu Service B chậm thêm 1 giây, Service A *phải* giữ memory thêm 1 giây
- **Chế độ thất bại:** Trong spike, Service B chậm lại → Service A giữ hàng nghìn connection → RAM đầy → Service A crash

## 2. Giải Pháp Kiến Trúc: "Fire-and-Forget"

Phải phá vỡ liên kết thời gian. Service A nên giao công việc và *ngay lập tức* trả acknowledgement cho user.

### Pattern: Event-Driven Handoff

**1. Trip Service (Producer):**
- Nhận request
- Validate input
- Lưu "Trip Requested" vào DB
- **Publish Event:** `TripRequested` → Event Bus
- **Trả về:** "202 Accepted" (Trip ID)
- *Thời gian:* Nhanh và bị giới hạn (DB write + publish), không gắn với latency tìm tài xế

**2. Event Bus (Buffer):**
- Lưu trữ message an toàn
- **Hiệu ứng "Đập":** Burst được chuyển thành backlog mà consumer có thể xử lý theo tốc độ riêng
- *Lưu ý:* Bus vẫn có quota/limit; producer phải xử lý publish failure và áp dụng backpressure hoặc từ chối load khi cần

**3. Driver Service (Consumer):**
- **Pull** message từ Bus
- **Hiệu ứng "Van":** Xử lý 50 message/giây (hoặc tốc độ có thể xử lý)
- *Kết quả:* Driver Service được giữ trong concurrency kiểm soát. Khi demand vượt capacity, backlog tăng trong queue thay vì bùng nổ trong RAM qua các service upstream

## 3. Tại Sao Giải Pháp Này Sửa Crash

- **Tách rời:** Latency của Trip Service độc lập với latency của Driver Service
- **Hấp thụ spike:** Queue hấp thụ "Bán kính nổ" của traffic spike
- **Bảo vệ tài nguyên:** Không service nào giữ connection mở trong khi chờ service khác

## 4. Lựa Chọn Công Nghệ

**Option A: Kafka**
- *Ưu:* Throughput cực cao, log có thể replay
- *Nhược:* Độ phức tạp vận hành cao (cluster operation, capacity planning)
- *Verdict:* Tùy chọn mạnh, nhưng thường nhiều overhead ops hơn cần thiết cho team nhỏ

**Option B: RabbitMQ**
- *Ưu:* Latency thấp, routing linh hoạt
- *Nhược:* Yêu cầu vận hành broker/cluster và tune durability, HA, performance
- *Verdict:* Khả thi, nhưng gánh nặng maintenance cao hơn managed service

**Option C: AWS SQS + SNS** ✅ **ĐÃ CHỌN**
- *Ưu:* Fully managed, scale cao, đơn giản vận hành, hỗ trợ DLQ
- *Nhược:* Thêm cloud dependency; delivery thường at-least-once (thiết kế consumer idempotent)
- *Verdict:* Công cụ đơn giản và robust nhất. Dùng **SNS** cho fan-out (broadcast event) và **SQS** cho buffering (bảo vệ consumer)

## 5. Chiến Lược Triển Khai

### A. Infrastructure Topology

**1. SNS Topic (`trip-events`):** "Loa phóng thanh" - Trip Service công bố ở đây

**2. SQS Queue (`driver-match-queue`):** "Hộp thư" - Subscribe SNS Topic, giữ message cho Driver Service

**3. Dead Letter Queue (DLQ):** "Thùng rác" - Message fail 3 lần đi vào đây để kiểm tra sau

#### SNS Filter Policy (Routing Ở Tầng Bus)

Không gửi TẤT CẢ event đến TẤT CẢ queue. SNS filter message dựa trên `eventType`:

```bash
# Subscribe driver-match-queue (filter: chỉ TripRequested)
awslocal sns subscribe \
  --topic-arn "$TRIP_EVENTS_TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$DRIVER_MATCH_QUEUE_ARN" \
  --attributes '{"FilterPolicy":"{\"eventType\":[\"TripRequested\"]}"}'

# Subscribe trip-update-queue (filter: TripMatched, NoDriversAvailable)
awslocal sns subscribe \
  --topic-arn "$TRIP_EVENTS_TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$TRIP_UPDATE_QUEUE_ARN" \
  --attributes '{"FilterPolicy":"{\"eventType\":[\"TripMatched\",\"NoDriversAvailable\"]}"}'
```

**Lợi ích:** Giảm noise, chi phí SQS thấp hơn, xử lý nhanh hơn

### B. Code Flow

#### 1. Producer (Trip Service)

```typescript
// trips.service.ts
import { publishToTopic, getTopicArn } from '../common/aws.utils';

async createTrip(dto: CreateTripDto) {
  // 1. Lưu vào DB (Status: REQUESTED)
  const trip = await this.repo.create(dto);

  // 2. Publish Event (Async)
  const topicArn = getTopicArn('trip-events'); 
  
  await publishToTopic(
    topicArn,
    {
      eventType: 'TripRequested',
      tripId: trip.id,
      pickup: { lat: dto.lat, lng: dto.lng }
    },
    'Trip Requested - Find Drivers'
  );

  // 3. Trả về ngay lập tức
  return { id: trip.id, status: 'REQUESTED' };
}
```

#### 2. Consumer (Driver Service)

```typescript
// trip-matching.consumer.ts
import { receiveMessages, deleteMessage } from '../common/aws.utils';

@Injectable()
export class TripMatchingConsumer {
  async startPolling() {
    while (this.isRunning) {
      try {
        // 1. Nhận Message (Batch 10)
        const messages = await receiveMessages(this.queueUrl, 10);

        for (const msg of messages) {
          try {
            // 2. Parse SNS Envelope (Bước quan trọng)
            const snsMessage = JSON.parse(msg.Body);
            const event = JSON.parse(snsMessage.Message);

            // 3. Thực hiện công việc nặng (với Retry Logic)
            await this.matchingService.matchDriverForTrip(event);
            
            // 4. ACK (Delete message)
            if (msg.ReceiptHandle) {
              await deleteMessage(this.queueUrl, msg.ReceiptHandle);
            }
          } catch (error) {
            // 5. Lỗi: dựa vào SQS Visibility Timeout + DLQ cho retry
          }
        }
      } catch (error) {
        // Xử lý polling error
      }
    }
  }
}
```

#### 3. Chiến Lược Retry (Mở Rộng Bán Kính)

Matching service không chỉ thử một lần. Triển khai **retry 3 pha với mở rộng bán kính tìm kiếm**:

```typescript
const RETRY_CONFIG = {
  maxDurationMs: 3 * 60 * 1000,     // Tổng 3 phút
  phase1DurationMs: 30 * 1000,       // 30 giây đầu
  phase2DurationMs: 2 * 60 * 1000,   // 30s đến 2 phút
  phase1IntervalMs: 5 * 1000,        // Retry mỗi 5s
  phase2IntervalMs: 10 * 1000,       // Retry mỗi 10s
  phase3IntervalMs: 15 * 1000,       // Retry mỗi 15s
  searchRadii: [3, 5, 7],            // km - mở rộng bán kính
};
```

**Timeline:**

| Thời gian | Pha | Bán kính | Interval | Lý do |
|-----------|-----|----------|----------|-------|
| 0-30s | 1 | 3km→5km→7km | 5s | Tích cực - tài xế ở gần |
| 30s-2m | 2 | 7km | 10s | Vừa phải - chờ tài xế available |
| 2m-3m | 3 | 7km | 15s | Nỗ lực cuối trước khi từ bỏ |

**Giải thích:**
- **Mở rộng bán kính:** Bắt đầu nhỏ (3km) tìm tài xế gần nhất. Chỉ mở rộng khi cần
- **Giới hạn 3 phút:** Trải nghiệm user. Quá 3 phút, user có thể sẽ cancel

## 6. Tại Sao SNS + SQS? (Pattern Fan-Out)

### A. Khả Năng "Fan-Out" (Future-Proofing)

**Chỉ dùng SQS:** Trip Service phải biết địa chỉ của MỌI service cần data. Thêm **Analytics Service** hoặc **Notification Service** sau → phải **sửa và redeploy** Trip Service

**Dùng SNS + SQS:** Trip Service chỉ "hét" vào SNS Topic. Service nào muốn data chỉ cần tạo SQS queue riêng và subscribe. Trip Service **không bao giờ thay đổi**

### B. Tách Rời vs Độ Tin Cậy

| Feature | Chỉ SNS | Chỉ SQS | SNS + SQS |
|---------|---------|---------|-----------|
| **Nhiều Consumer?** | Có | Không | ✅ **Có** |
| **Persistence (Buffer)?** | Không | Có | ✅ **Có** |
| **Retry/DLQ?** | Hạn chế | Xuất sắc | ✅ **Xuất sắc** |
| **Tách rời Producer?** | Cao | Thấp | ✅ **Cao** |

## 7. Trade-offs & Lộ Trình Giảm Thiểu

### A. Trade-off: Khoảng Trống "Eventual Consistency"

**Chi phí:** User nhận acknowledgement ("Trip accepted") nhưng chưa tìm được tài xế. Có khoảng trống vài giây đến hàng chục giây UI hiển thị "Searching..."

**Rủi ro:** Nếu matching service fail âm thầm (hoặc queue bị stuck), user chờ mãi không có feedback

**Giảm thiểu (Tương lai):** Triển khai **WebSocket** (Socket.io) để push update real-time ("Driver Found", "Search Failed") đến client

*Trade-off mới:* **Độ phức tạp Stateful.** WebSocket yêu cầu duy trì open connection, làm Load Balancing khó hơn (cần Sticky Session)

*Đối sách:* Dùng **Redis Adapter** để broadcast event qua nhiều WebSocket server

### B. Trade-off: "At-Least-Once" Delivery (Duplicate)

**Chi phí:** SQS đảm bảo deliver message *ít nhất một lần*, đôi khi hai lần (ví dụ: network timeout trong ACK)

**Rủi ro:** Có thể vô tình assign hai tài xế cho cùng trip

**Trạng thái:** Đã giảm thiểu một phần

**Chiến lược hiện tại:** **In-Memory Idempotency Set**
- Logic: Consumer duy trì `processedMessageIds = new Set<string>()`
- Trước khi xử lý, check: `if (processedMessageIds.has(messageId)) return`

**Hạn chế:** Chỉ hoạt động trong single container instance; restart xóa set; có thể tăng không giới hạn trừ khi cap/expire

**Khuyến nghị cứng hóa:** Chuyển idempotency tracking sang shared store (Redis với TTL) và/hoặc enforce idempotency ở database level (unique constraint per `tripId` state transition)

### C. Trade-off: Mất Thứ Tự Nghiêm Ngặt

**Chi phí:** SQS Standard không đảm bảo FIFO. Trip request lúc 10:00:01 có thể được xử lý *sau* trip request lúc 10:00:02

**Rủi ro:** Vấn đề công bằng nhỏ trong high load

**Giảm thiểu (Tương lai):** Nếu công bằng nghiêm ngặt trở thành yêu cầu business, migrate sang **SQS FIFO Queue**

*Trade-off mới:* **Throughput thấp hơn Standard queue** và ràng buộc thiết kế thêm (deduplication, message group)

*Đối sách:* Dùng **Message Grouping** (ví dụ: Group ID = Region) để khôi phục xử lý song song trong khi duy trì thứ tự trong region

## 8. Tích Hợp Với Các Giải Pháp Khác

Async Decoupling là **nền tảng** cho tất cả giải pháp scalability khác:

```
┌─────────────────────────────────────────────────────────┐
│              Request Flow (Sau Async)                   │
├─────────────────────────────────────────────────────────┤
│  User Request                                           │
│       │                                                 │
│       ▼                                                 │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐     │
│  │Trip      │─►│SNS Topic │─►│SQS Queue           │     │
│  │Service   │  │(Fan-Out) │  │(Buffering)         │     │
│  │(nhanh)   │  └──────────┘  └─────────┬──────────┘     │
│  └──────────┘                          │                │
│       │                                │                │
│       │ Trả về "202 Accepted"          ▼                │
│       ▼                    ┌────────────────────────┐   │
│  User thấy "Searching..."  │Driver Service          │   │
│                            │(Auto-Scale bởi Sol.2)  │   │
│                            │+ Redis Geo (Sol.3)     │   │
│                            └────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

- **Solution 2 (Auto-Scaling):** Driver Service có thể scale dựa trên **SQS Queue Depth**
- **Solution 3 (Caching):** Driver Service dùng **Redis GEORADIUS** cho driver lookup sub-millisecond
- **Solution 4 (Replica):** Trip status write đi Primary; read có thể đi Replica (trừ flow "Read-Your-Write")
