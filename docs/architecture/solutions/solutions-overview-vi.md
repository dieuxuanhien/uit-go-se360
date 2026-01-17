# Tổng Quan Giải Pháp Scalability (Module A)

Tài liệu này tổng hợp 4 giải pháp đã triển khai để cải thiện khả năng scale và độ ổn định của hệ thống UIT-GO (Module A). Mục tiêu là **giảm gắn kết thời gian**, **tăng elasticity**, **giảm tải database**, và **mở rộng read capacity**.

> Tham khảo chi tiết từng giải pháp:
> - `solution-01-async-decoupling-vi.md`
> - `solution-02-dynamic-scaling-vi.md`
> - `solution-03-caching-strategy-vi.md`
> - `solution-04-database-scaling-vi.md`

---

## 1. Tóm Tắt (Executive Summary)

Hệ thống scale được nhờ 4 “lớp phòng thủ”:

1. **Async Decoupling (Sol.1):** Trip Service không chờ Driver Service → tránh giữ connection/RAM lâu → giảm cascade failure khi spike.
2. **Dynamic Scaling (Sol.2):** Auto-scaler tăng/giảm replica theo tín hiệu tải → phản ứng nhanh hơn thao tác thủ công.
3. **Redis Caching + Geo Index (Sol.3):** Đưa hot-read và truy vấn “tìm tài xế gần” ra khỏi Postgres → giảm DB load và tail latency.
4. **DB Read Replicas (Sol.4):** Tách read khỏi primary → tăng read throughput và bảo vệ primary cho write.

---

## 2. Request Flow Sau Khi Áp Dụng Giải Pháp

```
(1) User Request
     │
     ▼
Nginx Load Balancer (DNS-based discovery)
     │
     ▼
Trip Service (fast path)
  - write DB (primary)
  - publish event (SNS)
  - trả response ngay
     │
     ▼
SNS Topic (fan-out)
     │
     ▼
SQS Queue (buffer + retry + DLQ)
     │
     ▼
Driver Service (consumer)
  - pull message
  - geo lookup (Redis)
  - cập nhật trạng thái trip

Read-heavy endpoint:
User/Trip Service → Cache (Redis) → Read Replica (Postgres) → Primary (fallback / write)
```

---

## 3. Giải Pháp 1 — Async Decoupling (Phá Vỡ Gắn Kết Thời Gian)

**Bài toán:** Synchronous HTTP chaining tạo temporal coupling: Trip “kẹt” theo Driver → spike làm tăng số request đang chờ → RAM tăng → crash.

**Giải pháp:** Chuyển sang “fire-and-forget” bằng SNS + SQS.

**Tác động chính:**
- Trip Service latency **không phụ thuộc** vào latency tìm tài xế.
- Spike được “đẩy” vào queue backlog thay vì nằm trong RAM upstream.

**Artefacts chính:**
- Infrastructure (LocalStack/AWS): SNS topic + SQS queue + DLQ.
- Producer: `services/trip-service/...` publish `TripRequested`.
- Consumer: `services/driver-service/...` poll SQS, parse SNS envelope, xử lý matching.

**Lưu ý vận hành:** SQS thường là **at-least-once** → consumer phải idempotent (chống xử lý trùng).

---

## 4. Giải Pháp 2 — Dynamic Scaling (Elastic Capacity)

**Bài toán:** Spike đến trong vài giây; thao tác scale thủ công mất vài phút → hệ thống under-provision và fail.

**Giải pháp:** Auto-scaler điều khiển số replica theo tín hiệu tải + Nginx load balancer tự discover replica mới.

**Tác động chính:**
- Tăng capacity theo thời gian thực (có độ trễ phụ thuộc boot + healthcheck).
- Giảm “utilization paradox”: không cần chạy vĩnh viễn ở peak.

**Artefacts chính:**
- Auto-scaler: `scripts/auto-scaler.py`
- Load balancer config: `nginx-lb.conf` + `docker-compose.loadbalancer.yml`

**Guardrails quan trọng:**
- Cooldown / anti-flapping.
- Giới hạn min/max replica.
- Cẩn thận “connection storm” lên DB khi scale-out nhanh (đặc biệt nếu mỗi replica mở pool riêng).

---

## 5. Giải Pháp 3 — Redis Caching + Geo Index (DB Offload)

**Bài toán:** Database là bottleneck và single point of failure; nhiều read lặp lại và truy vấn tìm tài xế gần tốn kém nếu làm trên Postgres.

**Giải pháp:** Redis cluster làm “short-term memory”, gồm:
- **Cache-aside** cho entity hot-read (vd user profile).
- **Geo index** cho vị trí tài xế (query gần như O(log N + M)).

**Tác động chính:**
- Giảm DB CPU/IOPS, giảm tail latency.
- Tăng throughput read-path khi cache hit cao.

**Artefacts chính:**
- Redis cluster: `docker-compose.redis-cluster.yml`
- Cache wrapper: `packages/common-utils/src/cache/cache.service.ts`

**Lưu ý kỹ thuật:**
- Cache invalidation (invalidate-on-write) + TTL.
- Khi Redis down: thiết kế “fail-open” (fallback DB) nhưng cần tránh cascade (circuit breaker là hướng tăng cường).

---

## 6. Giải Pháp 4 — Database Read Replicas (Read Scaling)

**Bài toán:** Một primary DB có giới hạn CPU/IOPS; khi read nhiều sẽ tranh chấp với write và tăng tail latency.

**Giải pháp:** PostgreSQL streaming replication + routing read trong application layer.

**Tác động chính:**
- Tăng **read capacity** bằng cách phân tán read-only query lên replica.
- Primary được “giải phóng” để xử lý write-critical flow.

**Artefacts chính:**
- Replica infra: `docker-compose.replicas.yml`
- Routing logic (Prisma):
  - `services/user-service/src/database/database-replica.service.ts`
  - `services/trip-service/src/prisma/prisma-replica.service.ts`

**Lưu ý kỹ thuật:** Replication lag → có thể thấy stale read. Một số endpoint cần read-your-writes phải pin read về primary.

---

## 7. Evidence & Cách Kiểm Chứng

Các nguồn bằng chứng (đã đo):
- `docs/MODULE-A-LOAD-TEST-RESULTS.md`
- `docs/MODULE-A-SCALABILITY-REPORT.md`
- `Deliverables/ADR/scalability-evidence.md`

Bạn có thể đối chiếu:
- Throughput before/after (sync → async)
- DB CPU trước/sau (single DB → replicas + cache)
- Timeline auto-scaling (2 → 7 replica)

---

## 8. Thứ Tự Áp Dụng Khuyến Nghị

Nếu triển khai theo từng bước (giảm rủi ro):

1. **Sol.1 (Async):** giảm cascade failure trước (nền tảng).
2. **Sol.3 (Redis):** offload read/geo để giảm DB pressure.
3. **Sol.4 (Replica):** tăng read throughput khi load tăng.
4. **Sol.2 (Auto-scale):** thêm elasticity sau khi downstream (DB/Redis) đã vững.

---

## 9. Quick Reference

- Async messaging: SNS/SQS/DLQ + consumer idempotency
- Traffic distribution: Nginx LB + DNS-based discovery
- Hot path optimization: Redis cache + geo index
- DB scaling: Primary (write) + replicas (read) + app-level routing
