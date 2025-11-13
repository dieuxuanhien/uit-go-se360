# 📦 UIT-Go SE360 - Deliverables Package

> **Đồ án môn học SE360 - Cloud Computing**  
> **Đề tài:** Nền tảng Ride-Sharing với Kiến trúc Microservices  
> **Module A:** Scalability & Performance Architecture

---

## 📋 Mục Lục Deliverables

| File/Folder | Mô tả | Trạng thái |
|-------------|-------|------------|
| `README.md` | File này - Hướng dẫn sử dụng | ✅ |
| `ARCHITECTURE.md` | Tài liệu kiến trúc hệ thống | ✅ |
| `REPORT.md` | Báo cáo chi tiết 3-5 trang | ✅ |
| `ADR/` | Architectural Decision Records | ✅ |
| `DEMO_SCRIPT.md` | Script hướng dẫn demo video | ✅ |
| `CHECKLIST_DELIVERABLES.md` | Checklist nộp bài | ✅ |

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Hệ Thống

### Prerequisites

```bash
# Kiểm tra các công cụ cần thiết
node --version      # v20.x+
pnpm --version      # 8.x+
docker --version    # 24.x+
docker compose version # 2.x+
```

### Quick Start (5 phút)

```bash
# 1. Clone repository
git clone https://github.com/dieuxuanhien/uit-go-se360.git
cd uit-go-se360

# 2. Install dependencies
pnpm install

# 3. Build shared packages (QUAN TRỌNG!)
cd packages/common-utils && pnpm run build && cd ../..

# 4. Generate Prisma clients
pnpm run prisma:generate

# 5. Start infrastructure (LocalStack + PostgreSQL + Redis)
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

# 6. Run services
pnpm run dev
```

### Verify Installation

```bash
# Check services are running
curl http://localhost:3001/health  # UserService
curl http://localhost:3002/health  # TripService
curl http://localhost:3003/health  # DriverService

# Check LocalStack (AWS emulation)
aws --endpoint-url=http://localhost:4566 sns list-topics
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

---

## 🏗️ Kiến Trúc Tổng Quan

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx Load Balancer                      │
│                        (least_conn routing)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  UserService    │ │  TripService    │ │  DriverService  │
│  (Port 3001)    │ │  (Port 3002)    │ │  (Port 3003)    │
│  Auth, Profile  │ │  Trip Matching  │ │  Driver Pool    │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         │              Async Events             │
         │          (SNS/SQS via LocalStack)     │
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  PostgreSQL     │ │  Redis Cluster  │ │  LocalStack     │
│  (Primary +     │ │  (Caching +     │ │  (SNS/SQS       │
│   Replicas)     │ │   Pub/Sub)      │ │   Emulation)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 📊 Kết Quả Load Test

| Metric | Giá trị | Mục tiêu | Đạt |
|--------|---------|----------|-----|
| Virtual Users | 1,000 VUs | 1,000 | ✅ |
| Request Rate | 316 RPS | 300+ | ✅ |
| Error Rate | 0.67% | <5% | ✅ |
| Trip Creation p95 | 720ms | <1000ms | ✅ |
| Auto-scaling | 2→7 containers | Dynamic | ✅ |

---

## 📁 Cấu Trúc Thư Mục

```
Deliverables/
├── README.md                    # File này
├── ARCHITECTURE.md              # Kiến trúc chi tiết
├── REPORT.md                    # Báo cáo 3-5 trang
├── CHECKLIST_DELIVERABLES.md    # Checklist nộp bài
├── DEMO_SCRIPT.md               # Script cho video demo
└── ADR/                         # Architectural Decision Records
    ├── README.md
    ├── ADR-001-async-communication.md
    ├── ADR-002-read-replicas.md
    ├── ADR-003-distributed-caching.md
    └── ADR-004-auto-scaling.md
```

---

## 🎯 Module A - Scalability Patterns

### 4 ADRs Implemented:

1. **ADR-001: Event-Driven Async Communication**
   - SNS/SQS via LocalStack ($0 vs ~$50-100/month AWS)
   - Decoupling services for scalability

2. **ADR-002: Database Read Scaling**
   - PostgreSQL Streaming Replication
   - Read Replicas for load distribution

3. **ADR-003: Distributed Caching**
   - Redis Cluster (6 nodes)
   - Cache-aside pattern

4. **ADR-004: Auto-Scaling Infrastructure**
   - Docker Compose replicas
   - Python auto-scaler script

---

## 🔧 Hybrid Stack Approach

### Why Hybrid?

| Component | Production (AWS) | Development (Local) | Cost Savings |
|-----------|------------------|---------------------|--------------|
| SNS/SQS | AWS SNS/SQS | LocalStack | $50-100/month |
| ECS Fargate | AWS ECS | Docker Compose | Variable |
| RDS | RDS Multi-AZ | PostgreSQL Replicas | $200+/month |
| ElastiCache | Redis Cluster | Redis Cluster | $100+/month |

### Running Hybrid Stack

```bash
# Full hybrid stack với tất cả các components
./scripts/start-hybrid-stack.sh

# Hoặc manual:
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.localstack.yml \
  -f docker-compose.replicas.yml \
  -f docker-compose.redis-cluster.yml \
  up -d
```

---

## 📹 Video Demo (5-7 phút)

### Nội dung chính:
1. **Giới thiệu** (30s) - Tổng quan project
2. **Kiến trúc** (1 phút) - Diagram và components
3. **Demo hệ thống** (2-3 phút) - Các features chính
4. **Load Test** (1-2 phút) - k6 test và kết quả
5. **Kết luận** (30s) - Lessons learned

> 📝 Xem chi tiết tại: `DEMO_SCRIPT.md`

---

## 👥 Thông Tin Nhóm

| STT | Họ và Tên | MSSV | Role |
|-----|-----------|------|------|
| 1 | [Tên thành viên 1] | [MSSV] | Team Lead |
| 2 | [Tên thành viên 2] | [MSSV] | Developer |
| 3 | [Tên thành viên 3] | [MSSV] | Developer |
| 4 | [Tên thành viên 4] | [MSSV] | Developer |

---

## 📚 References

- **Main README:** [../README.md](../README.md)
- **Architecture Docs:** [../docs/architecture/](../docs/architecture/)
- **Load Test Results:** [../docs/MODULE-A-SCALABILITY-REPORT.md](../docs/MODULE-A-SCALABILITY-REPORT.md)
- **ADRs Original:** [../docs/adrs/](../docs/adrs/)

---

## ✅ Submission Checklist

- [x] Source code hoàn chỉnh
- [x] README.md hướng dẫn
- [x] ARCHITECTURE.md
- [x] REPORT.md (3-5 trang)
- [x] ADR/ folder với 4 ADRs
- [ ] Video demo (5-7 phút)
- [ ] GitHub repository link

---

**Last Updated:** December 2025  
**Course:** SE360 - Cloud Computing  
**University:** UIT - VNU-HCM
