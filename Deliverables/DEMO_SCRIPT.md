# 🎬 Video Demo Script (5-7 phút)

> **Hướng dẫn chi tiết cho video demo SE360**

---

## 📋 Tổng Quan Video

| Phần | Thời gian | Nội dung |
|------|-----------|----------|
| 1. Intro | 0:00 - 0:30 | Giới thiệu đề tài, team |
| 2. Architecture | 0:30 - 1:30 | Kiến trúc hệ thống |
| 3. Demo Features | 1:30 - 3:30 | Demo các tính năng |
| 4. Load Test | 3:30 - 5:30 | Chạy load test, kết quả |
| 5. Conclusion | 5:30 - 6:00 | Kết luận, lessons learned |

**Tổng thời gian:** ~6 phút

---

## 🎤 PHẦN 1: GIỚI THIỆU (30 giây)

### Script:

> "Xin chào thầy và các bạn!
> 
> Hôm nay nhóm em sẽ trình bày đồ án môn SE360 - Cloud Computing.
> 
> Đề tài của nhóm là: **UIT-Go - Nền tảng Ride-Sharing với Kiến trúc Microservices**.
> 
> Nhóm gồm [số] thành viên: [tên các thành viên].
> 
> Project này tập trung vào **Module A - Scalability & Performance Architecture**."

### Slide/Screen hiển thị:
- Tên đề tài
- Logo UIT-Go
- Tên các thành viên

---

## 🏗️ PHẦN 2: KIẾN TRÚC (1 phút)

### Script:

> "Đầu tiên, em xin trình bày kiến trúc tổng quan của hệ thống.
> 
> Hệ thống UIT-Go được thiết kế theo **kiến trúc Microservices** với 3 services chính:
> 
> 1. **UserService** - Quản lý authentication và user profiles
> 2. **TripService** - Xử lý đặt xe và trip management  
> 3. **DriverService** - Quản lý driver pool và matching
> 
> Các services giao tiếp với nhau qua **Event-Driven Architecture** sử dụng SNS/SQS.
> 
> Để đảm bảo scalability, chúng em đã implement 4 patterns chính..."

### Demo Actions:
1. Show architecture diagram (terminal hoặc slide)
2. Highlight 3 services
3. Show SNS/SQS flow

### Code snippet để show:
```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    UserService         TripService        DriverService
     (3001)              (3002)              (3003)
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
              SNS/SQS (LocalStack) + Redis + PostgreSQL
```

---

## 💻 PHẦN 3: DEMO FEATURES (2 phút)

### 3.1 Start Services (30s)

**Script:**
> "Bây giờ em sẽ demo hệ thống đang chạy."

**Commands:**
```powershell
# Terminal 1: Check Docker containers
docker compose ps

# Show services running
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### 3.2 Demo LocalStack (30s)

**Script:**
> "Đây là LocalStack - giúp chúng em emulate AWS SNS/SQS với chi phí $0."

**Commands:**
```powershell
# List SNS topics
aws --endpoint-url=http://localhost:4566 sns list-topics

# List SQS queues  
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

### 3.3 Demo Redis Cluster (30s)

**Script:**
> "Redis Cluster với 6 nodes để caching và tăng performance."

**Commands:**
```powershell
# Check Redis cluster
redis-cli -p 6379 cluster info

# Check cache hit
redis-cli -p 6379 INFO stats | grep hits
```

### 3.4 Demo Auto-Scaling (30s)

**Script:**
> "Và đây là auto-scaling script đang monitor CPU usage."

**Commands:**
```powershell
# Show auto-scaler
Get-Content scripts/auto-scaler.py | Select-Object -First 30

# Check current replicas
docker compose ps | Select-String "user-service"
```

---

## 📊 PHẦN 4: LOAD TEST (2 phút)

### 4.1 Giới thiệu k6 (15s)

**Script:**
> "Để đánh giá performance, chúng em sử dụng k6 load testing tool."

### 4.2 Chạy Load Test (45s)

**Commands:**
```powershell
# Run k6 load test
cd tests/load
k6 run --vus 100 --duration 30s health-check.js
```

**Script trong khi chạy:**
> "Hiện tại đang chạy 100 virtual users trong 30 giây.
> Các bạn có thể thấy request rate đang tăng lên..."

### 4.3 Show Results (30s)

**Script:**
> "Đây là kết quả load test với 1000 VUs:
> - Request Rate: 316 requests/second
> - Error Rate: chỉ 0.67%
> - Auto-scaling: từ 2 lên 7 containers
> 
> Kết quả này đạt được nhờ vào các patterns mà chúng em đã implement."

### 4.4 Show Auto-Scaling Effect (30s)

**Commands:**
```powershell
# Before: 2 containers
docker compose ps

# After load test: check replicas increased
docker compose ps
```

**Script:**
> "Các bạn có thể thấy số containers đã tự động tăng từ 2 lên 7 khi load tăng cao."

---

## 🎯 PHẦN 5: KẾT LUẬN (30 giây)

### Script:

> "Qua dự án này, nhóm em đã học được:
> 
> 1. **Event-Driven Architecture** giúp decouple services hiệu quả
> 2. **Caching với Redis** giảm 90% database load
> 3. **Auto-Scaling** là yếu tố quan trọng cho cloud applications
> 4. **LocalStack** là công cụ tuyệt vời để develop mà không tốn chi phí AWS
> 
> **Trade-off quan trọng nhất:** Eventual consistency vs Performance.
> Chúng em chọn eventual consistency vì user experience vẫn tốt với async updates.
> 
> Cảm ơn thầy và các bạn đã lắng nghe!"

---

## 🛠️ Preparation Checklist

### Trước khi quay:

- [ ] Docker Desktop đang chạy
- [ ] Tất cả services healthy
- [ ] LocalStack có topics/queues
- [ ] Redis cluster active
- [ ] k6 installed
- [ ] Terminal font size đủ lớn (18pt+)
- [ ] Screen recording software ready
- [ ] Microphone test

### Commands chuẩn bị:

```powershell
# 1. Start full stack
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

# 2. Verify services
curl http://localhost:3001/health

# 3. Setup LocalStack resources
aws --endpoint-url=http://localhost:4566 sns create-topic --name trip-events
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name driver-match-queue

# 4. Start services
pnpm run dev
```

---

## 📝 Notes

### Tips cho video chất lượng:

1. **Nói chậm, rõ ràng** - Không vội vàng
2. **Zoom terminal** - Đảm bảo đọc được commands
3. **Highlight quan trọng** - Dùng cursor hoặc highlight tool
4. **Chuẩn bị script** - Nhưng nói tự nhiên
5. **Practice 2-3 lần** trước khi quay chính thức

### Backup plans:

- Nếu load test fail: Có sẵn kết quả từ report
- Nếu services down: Có screenshots backup
- Nếu LocalStack lỗi: Demo với Redis cluster thay thế

---

## 🎥 Recording Tips

1. **Resolution:** 1920x1080 (Full HD)
2. **Frame rate:** 30fps
3. **Audio:** Microphone riêng, không dùng mic laptop
4. **Format:** MP4 (H.264)
5. **File size:** Nén nếu >500MB

### Suggested Tools:
- **OBS Studio** (Free, đầy đủ tính năng)
- **Loom** (Dễ sử dụng, có cloud storage)
- **Windows Game Bar** (Built-in, Win+G)

---

**Good luck với video demo! 🎬**
