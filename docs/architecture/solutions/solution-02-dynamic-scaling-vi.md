# Giải Pháp 2: Hạ Tầng Động (The "Thermostat" Cho Dung Lượng)

## 1. Bản Chất Vấn Đề: "Khoảng Cách Thời Gian Phản Ứng"

Nguyên nhân gốc rễ của thất bại không phải "không đủ server", mà là "tốc độ phản ứng chậm".

**Vật lý:**
- Traffic spike xảy ra trong **giây** (ví dụ: mưa bắt đầu)
- Con người phản ứng trong **phút** (alert → login → scale)

**Khoảng cách:** Trong latency human-and-change-pipeline (thường minutes-scale), hệ thống có thể bị under-provision và fail

**Chế độ thất bại:** "Nghịch lý sử dụng" - Hoặc lãng phí tiền (over-provision) hoặc rủi ro crash (under-provision). Không thể thắng với số cố định

## 2. Giải Pháp Kiến Trúc: "Elasticity Tự Động"

Thay thế config tĩnh bằng **Control Loop** động. Hạ tầng phải "thở" theo load, mở rộng và co lại tự động.

### Pattern: Feedback Loop

**1. Monitor (Cảm biến):** Đo liên tục "Áp lực" (CPU, RAM, Queue Depth)

**2. Decide (Não bộ):** So sánh Áp lực vs Target
- *Nếu CPU > 70%:* Thêm +1 Replica
- *Nếu CPU < 30%:* Xóa -1 Replica

**3. Act (Tay):** Boot hoặc Kill container qua Orchestrator (Docker/K8s)

## 3. Tại Sao Giải Pháp Này Sửa Crash

- **Tốc độ:** Máy móc phản ứng nhanh hơn con người (giây đến phút tùy container startup, health check, và control loop interval)
- **Hiệu quả:** Fleet có thể theo dõi load theo thời gian, giảm nhu cầu chạy vĩnh viễn ở peak capacity
- **Sống sót:** Hệ thống có thể hấp thụ spike bằng scale out—trong giới hạn boot time, quota, downstream capacity (DB), và load balancer propagation

## 4. Lựa Chọn Công Nghệ

**Option A: AWS Auto Scaling Groups**
- *Ưu:* Tích hợp AWS native, đáng tin cậy
- *Nhược:* Khó mô phỏng locally (cần LocalStack Pro hoặc AWS thật)
- *Verdict:* **Target cho Production**

**Option B: Kubernetes HPA**
- *Ưu:* Industry standard cho container
- *Nhược:* Độ phức tạp cao để setup K8s cho scope project này
- *Verdict:* **Quá phức tạp** cho giai đoạn hiện tại

**Option C: Custom Python Auto-Scaler** ✅ **ĐÃ CHỌN**
- *Ưu:* Hoạt động với Docker Compose standard, dễ customize logic, hoàn hảo cho local simulation/demo
- *Nhược:* Không production-hardened
- *Verdict:* Script "Control Loop" tùy chỉnh (`scripts/auto-scaler.py`) mô phỏng hành vi AWS ECS

## 5. Chiến Lược Triển Khai

### A. Tích Hợp Load Balancer (`nginx-lb.conf`)

Scale replica vô dụng nếu traffic không đến được chúng. Dùng **Nginx** làm reverse proxy với **DNS-based service discovery**.

#### Vấn Đề: Upstream List Tĩnh

Config Nginx truyền thống dùng server list tĩnh:
```nginx
upstream trip_backend {
    server trip-service-1:3002;
    server trip-service-2:3002;
    # trip-service-3 mà auto-scaler vừa tạo thì sao?
}
```

#### Giải Pháp: Docker DNS Resolution

Docker Compose assign tất cả replica cùng **network alias**. Khi Nginx query `trip-service`, Docker's internal DNS trả về **tất cả container IP**.

```yaml
# docker-compose.loadbalancer.yml
trip-service-2:
  networks:
    uitgo-network:
      aliases:
        - trip-service  # CÙNG alias với primary!
```

```nginx
# nginx-lb.conf
resolver 127.0.0.11 valid=2s;  # Docker's internal DNS, refresh mỗi 2s

upstream trip_backend {
    least_conn;  # Gửi đến container có ít connection nhất
    server trip-service:3002 resolve;  # DNS resolve thành TẤT CẢ replica
    keepalive 128;  # Connection pooling cho performance
}
```

#### Tính Năng Chính:
- **Least Connections:** Route traffic đến replica ít bận nhất
- **Keepalive Connections:** Tái sử dụng upstream connection (ví dụ: 128), giảm connection setup overhead
- **Passive Health Handling:** `max_fails` / `fail_timeout` cung cấp passive failure detection
- **Fast DNS Re-resolution:** Với `resolver ... valid=2s` và `resolve`, Nginx có thể re-resolve service name thường xuyên để discover replica mới

### B. Control Loop (`scripts/auto-scaler.py`)

Không giống simple CPU-based scaler, triển khai của chúng ta dùng **Weighted Score System** kết hợp nhiều signal. Quan trọng, nó **đọc metric từ Nginx load balancer** (không chỉ Docker stats) để có RPS và latency chính xác per-service.

```python
# Pseudocode minh họa
SCALING_WEIGHTS = {
    "cpu": 0.30,       # 30% - Lagging indicator (từ Docker stats)
    "memory": 0.15,    # 15% - Lagging indicator (từ Docker stats)
    "rps": 0.30,       # 30% - Leading indicator (từ Nginx log)
    "latency": 0.25,   # 25% - Leading indicator (từ Nginx log)
}

# Auto-scaler parse Nginx access log để extract per-service metric
def get_service_metrics_from_nginx():
    # Parse: "GET /trips/xxx upstream: 172.19.0.21:3002 rt: 0.045"
    # -> Trip Service: 45ms latency
    pass

while True:
    for service in services:
        # 1. Đo (Multi-Signal)
        metrics = {
            "cpu": get_avg_cpu(service),
            "memory": get_avg_memory(service),
            "rps_per_replica": get_rps(service),
            "latency_ms": get_p95_latency(service),
            "queue_depth": get_queue_depth(service),
        }
        
        # 2. Tính Weighted Score
        score = calculate_weighted_score(service, metrics)
        
        # 3. Quyết định với Burst Logic
        if score > 1.0 or metrics["queue_depth"] > 50:
            if not in_cooldown(service, "scale_out"):
                replicas_to_add = get_burst_replicas(score, metrics)
                scale_service(service, +replicas_to_add)
                start_cooldown(service, scale_out_seconds=12)
        
        elif score < 0.5 and consecutive_low_count >= 3:
            if not in_cooldown(service, "scale_in"):
                scale_service(service, -1)
                start_cooldown(service, scale_in_seconds=60)
                
    sleep(3)  # Poll mỗi 3 giây
```

### C. Tính Năng Chính

#### 1. Multi-Signal Monitoring
- **CPU Utilization:** Target band ví dụ (thay đổi theo service)
- **Memory Utilization:** Target band ví dụ
- **RPS per Replica:** Target band ví dụ (thay đổi theo endpoint mix và service complexity)
- **P95 Latency:** Target band ví dụ
- **Queue Depth:** Target band ví dụ (cho async flow)

#### 2. Burst Scaling

Khi hệ thống phát hiện áp lực nghiêm trọng, scale **nhiều replica** cùng lúc:

```python
BURST_SCALING = {
    "score > 1.0": "+2 replica",
    "score > 1.5": "+3 replica",
    "score > 2.0": "+4 replica",
    "latency > 500ms": "Burst by latency ratio",
    "queue > 100": "Burst by queue ratio"
}
```

#### 3. Cooldown Period (Anti-Flapping)

- **Scale-Out Cooldown:** 12 giây (Phản ứng nhanh)
- **Scale-In Cooldown:** 60-90 giây (Co lại chậm)
- **Triết lý:** "Scale up nhanh, scale down chậm"

#### 4. Cơ Chế Ổn Định

- **Consecutive Low Reading:** Yêu cầu 3 reading low-usage liên tiếp trước khi scale down
- **Startup Grace Period:** Window 60 giây sau boot mà scale-in bị disable
- **Min/Max Bound:** Mỗi service có giới hạn cứng (ví dụ: Trip Service: min=4, max=15)

### D. Profile Theo Service

- **Trip Service:** Min 4, Max 15 (Quan trọng nhất, xử lý trip creation + SQS)
- **Driver Service:** Min 3, Max 15 (Location update, Redis-backed)
- **User Service:** Min 2, Max 10 (Auth + Profile, DB read replica)

## 6. Trade-offs & Trạng Thái Giảm Thiểu

### A. Trade-off: "Oscillation" (Flapping)

**Chi phí:** Hệ thống scale up (CPU giảm), rồi ngay lập tức scale down (CPU tăng), rồi scale up lại. "Flapping" này lãng phí tài nguyên và gây latency

**Rủi ro:** Restart container liên tục làm hệ thống không ổn định

**Trạng thái:** ✅ **ĐÃ GIẢM THIỂU (Đã triển khai)**
- **Cooldown Period:** Scale-out cooldown = 12s, Scale-in cooldown = 60-90s
- **Consecutive Reading:** Yêu cầu 3 reading low-usage liên tiếp trước scale down
- **Startup Grace Period:** 60 giây grace period mà scale-in bị disable
- *Kết quả:* Flapping giảm trong testing, nhưng threshold/cooldown vẫn cần tune theo traffic pattern thay đổi

### B. Trade-off: "Cold Start" Latency

**Chi phí:** Khi quyết định scale up, mất 30-60 giây để container mới boot và pass health check

**Rủi ro:** Trong 60s này, server hiện tại có thể crash trước khi help đến

**Trạng thái:** ⚙️ **ĐÃ GIẢM THIỂU MỘT PHẦN**

**Đã triển khai:**
- **Pre-Scaling:** Critical service bắt đầu với min replica cao hơn (Trip Service: min=4)
- **Burst Scaling:** Scale +2 đến +5 replica cùng lúc trong high pressure
- **Fast Polling:** 3 giây polling interval cho detection nhanh

**Cải tiến tương lai:**
- **Predictive Scaling:** Dùng time-series analysis (ví dụ: "5 PM rush hour") để scale *trước* spike
- **Warm Pool:** Giữ 1-2 container "warm" ở standby mode (tốn tiền nhưng loại bỏ cold start)

### C. Trade-off: Database Connection Storm

**Chi phí:** Nếu đột ngột boot 5+ container mới, tất cả thử connect Postgres đồng thời

**Rủi ro:** Database hết connection (`max_connections` limit) và crash

**Trạng thái:** ⏳ **CHƯA TRIỂN KHAI**
- **Rủi ro hiện tại:** Vừa phải. Burst scaling có thể thêm nhiều replica cùng lúc, tạo connection surge nếu mỗi replica mở pool riêng
- **Giảm thiểu đã lên kế hoạch:** Triển khai **PgBouncer (Connection Pooling)**
  - Container connect đến Proxy (PgBouncer), không phải DB trực tiếp
  - Proxy multiplex hàng nghìn app connection thành ~100 DB connection
  - *Trade-off của fix:* Thêm một chút latency và độ phức tạp vận hành

### D. Trade-off: Load Balancer Awareness Delay

**Chi phí:** Khi replica mới boot, có propagation gap trước khi nhận traffic

**Rủi ro:** Capacity đã tăng về mặt kỹ thuật nhưng tạm thời không được sử dụng trong window này

**Trạng thái:** ✅ **ĐÃ GIẢM THIỂU (Đã triển khai)**
- **Short DNS validity:** Nginx config để re-resolve thường xuyên
- **Nginx `least_conn`:** Replica mới với 0 connection có xu hướng nhận traffic nhanh
- **Health Check:** Replica chỉ nhận traffic sau khi pass health check
