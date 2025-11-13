# 📋 Checklist Tài liệu Nộp Đồ án SE360 - UIT-Go

> **Cập nhật lần cuối:** 30/11/2025
> Các mục đánh dấu ✅ là đã hoàn thành, ⏳ là đang làm, ❌ là chưa có.

---

## 📁 Cấu trúc Thư mục Deliverables

```
Deliverables/
├── README.md                    ✅ Hướng dẫn cài đặt & chạy
├── ARCHITECTURE.md              ✅ Kiến trúc hệ thống
├── REPORT.md                    ✅ Báo cáo chuyên sâu (3-5 trang)
├── DEMO_SCRIPT.md               ✅ Script demo video
├── CHECKLIST_DELIVERABLES.md    ✅ File này
└── ADR/                         ✅ 4 ADRs
    ├── README.md                ✅ Index
    ├── ADR-001-async-communication.md    ✅ SNS/SQS LocalStack
    ├── ADR-002-read-replicas.md          ✅ PostgreSQL Streaming
    ├── ADR-003-distributed-caching.md    ✅ Redis Cluster
    └── ADR-004-auto-scaling.md           ✅ Docker + Python
```

---

## 1. Tài liệu Bắt buộc

### 1.1 README.md ✅ HOÀN THÀNH
- [x] Giới thiệu dự án UIT-Go
- [x] Prerequisites (Node.js, Docker, k6...)
- [x] Quick Start commands
- [x] Load test instructions
- [x] Link đến ARCHITECTURE.md, REPORT.md

### 1.2 ARCHITECTURE.md ✅ HOÀN THÀNH
- [x] Sơ đồ kiến trúc tổng quan (ASCII art)
- [x] Mô tả 3 microservices
- [x] Hybrid Stack Approach giải thích
- [x] 4 ADRs summary table
- [x] Data flow diagrams
- [x] Technology decisions

### 1.3 REPORT.md ✅ HOÀN THÀNH (ĐÃ CẬP NHẬT)
- [x] **Section 1:** Tổng quan kiến trúc với sơ đồ
- [x] **Section 2:** Phân tích Module A chuyên sâu
- [x] **Section 3:** Trade-offs Analysis (⭐ QUAN TRỌNG NHẤT)
  - [x] ADR-001: Async Communication trade-offs
  - [x] ADR-002: Read Replicas trade-offs  
  - [x] ADR-003: Distributed Caching trade-offs
  - [x] ADR-004: Auto-Scaling trade-offs
  - [x] Trade-off Spectrum diagram
- [x] **Section 4:** Thách thức & Bài học kinh nghiệm
- [x] **Section 5:** Kết quả & Hướng phát triển
- [x] Tài liệu tham khảo

### 1.4 ADRs ✅ HOÀN THÀNH (ĐÃ CẬP NHẬT FORMAT MỚI)

| ADR | Status | Template Sections |
|-----|--------|-------------------|
| ADR-001: Async Communication | ✅ | The Problem, Options Considered, Trade-offs Accepted (4 sub-sections), Measured Impact, Failure Modes, Limitations |
| ADR-002: Read Replicas | ✅ | The Problem, Options Considered, Trade-offs Accepted (4 sub-sections), Measured Impact, Failure Modes, Limitations |
| ADR-003: Distributed Caching | ✅ | The Problem, Options Considered, Trade-offs Accepted (4 sub-sections), Measured Impact, Failure Modes, Limitations |
| ADR-004: Auto-Scaling | ✅ | The Problem, Options Considered, Trade-offs Accepted (4 sub-sections), Measured Impact, Failure Modes, Limitations |

**ADR Template Format (đã áp dụng cho tất cả 4 ADRs):**
```markdown
## The Problem
## Options Considered (table)
## Chosen Solution
## Trade-offs Accepted
  ### 1. ⚖️ [Trade-off 1] - Table + Decision paragraph
  ### 2. ⚖️ [Trade-off 2] - Table + Decision paragraph
  ### 3. ⚖️ [Trade-off 3] - Table + Decision paragraph
  ### 4. ⚖️ [Trade-off 4] - Table + Decision paragraph
## Measured Impact (table with actual numbers)
## Failure Modes (table)
## Limitations & Future Work
## Implementation Notes
## References
```

---

## 2. Load Testing ✅ HOÀN THÀNH

### 2.1 k6 Scripts (10+ scripts)
- [x] `module-a-capacity-test.js` - Main test (1000 VUs)
- [x] `story-2.1-async-smoke-test.js` - Async test
- [x] `story-2.2-read-scaling-test.js` - Read replicas
- [x] `story-2.3-redis-cache-performance.js` - Cache test
- [x] `story-2.6-auto-scaling-test.js` - Auto-scaling
- [x] `baseline-authenticated-test.js` - Baseline
- [x] Các scripts khác...

### 2.2 Kết quả Load Test (từ PHASE2-OPTIMIZATION-NOTES.md)
| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| Concurrent VUs | 1,000 | 1,000 | ✅ |
| Total RPS | >200 | **316** | ✅ |
| Error Rate | <5% | **0.67%** | ✅ |
| Trip Creation p95 | <1000ms | **720ms** | ✅ |
| Driver Search p95 | <500ms | **36ms** | ✅ |
| Cache Hit Rate | >80% | **100%** | ✅ |
| Auto-Scaling | Functional | **2→7** | ✅ |

---

## 3. Infrastructure ✅ HOÀN THÀNH

### 3.1 Docker Compose Files
- [x] `docker-compose.yml` - Base
- [x] `docker-compose.loadbalancer.yml` - Nginx LB
- [x] `docker-compose.localstack.yml` - LocalStack SNS/SQS
- [x] `docker-compose.replicas.yml` - PostgreSQL replicas
- [x] `docker-compose.redis-cluster.yml` - Redis Cluster 6 nodes

### 3.2 Scripts
- [x] `scripts/auto-scaler.py` - Python auto-scaler
- [x] `scripts/init-redis-cluster.sh` - Redis setup
- [x] `scripts/create-test-users.sh` - Test data

### 3.3 LocalStack
- [x] SNS Topic: `trip-events`
- [x] SQS Queues: `driver-match-queue`, `trip-update-queue`
- [x] DLQs: `driver-match-dlq`, `trip-update-dlq`

---

## 4. Video Demo ⏳ CẦN LÀM

### 4.1 DEMO_SCRIPT.md ✅ HOÀN THÀNH
- [x] Script chi tiết 5-7 phút
- [x] Commands để demo
- [x] Talking points

### 4.2 Video Recording ❌ CHƯA LÀM
- [ ] Record demo theo DEMO_SCRIPT.md
- [ ] Upload lên YouTube/Google Drive
- [ ] Thêm link vào README.md

---

## 5. Presentation Slides ❌ CHƯA LÀM

- [ ] Tạo slides (15-20 slides)
- [ ] Export PDF
- [ ] Upload

---

## 6. Checklist Cuối cùng

### Trước khi nộp:
- [x] ✅ Tất cả files trong Deliverables/ đã có
- [x] ✅ REPORT.md đã có 5 sections theo yêu cầu
- [x] ✅ 4 ADRs với format Trade-offs chi tiết
- [x] ✅ Metrics chính xác (316 RPS, 0.67% error, 720ms p95)
- [ ] ⏳ Điền thông tin nhóm vào REPORT.md
- [ ] ⏳ Video demo
- [ ] ⏳ Slides

### Repository:
- [x] ✅ Code hoạt động
- [x] ✅ Docker Compose chạy được
- [x] ✅ Load test có thể reproduce
- [ ] ⏳ Repository public (check)

---

## 📊 Tổng kết Progress

| Deliverable | Status | Notes |
|-------------|--------|-------|
| README.md | ✅ 100% | Đầy đủ |
| ARCHITECTURE.md | ✅ 100% | Có sơ đồ, ADRs summary |
| REPORT.md | ✅ 100% | 5 sections, trade-offs analysis |
| ADR-001 | ✅ 100% | Format mới với 4 trade-offs |
| ADR-002 | ✅ 100% | Format mới với 4 trade-offs |
| ADR-003 | ✅ 100% | Format mới với 4 trade-offs |
| ADR-004 | ✅ 100% | Format mới với 4 trade-offs |
| DEMO_SCRIPT.md | ✅ 100% | Script chi tiết |
| Load Test Scripts | ✅ 100% | 10+ k6 scripts |
| Video Demo | ❌ 0% | Cần record |
| Slides | ❌ 0% | Cần tạo |

**Overall Progress: ~85%**

---

*File này được cập nhật mỗi khi có task hoàn thành.*
