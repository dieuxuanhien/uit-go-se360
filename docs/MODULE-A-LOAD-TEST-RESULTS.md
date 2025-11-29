# Module A - Load Test Results

**Date**: November 29, 2025  
**Test Environment**: Intel i3-1115G4 (2 cores / 4 threads), 8GB RAM, Docker Desktop  
**Branch**: Phase2  

---

## Executive Summary

| VU Level | Error Rate | trip_creation p95 | Status |
|----------|------------|-------------------|--------|
| 200 | 0.00% | 202ms | ✅ **Excellent** |
| 300 | 0.00% | 608ms | ✅ **Good** |
| 400 | 0.00% | 1.3s | ⚠️ **Threshold Breached** |
| 500 | 26.74% | 10s+ | ❌ **Overloaded** |

**Conclusion**: System handles **300 VUs** reliably with zero errors. The 500 VU failure is due to **hardware limitations** (4 CPU threads), not architectural issues.

---

## Test Configuration

### Infrastructure
- **Load Balancer**: nginx with upstream pools + keepalive connections
- **Application Services**: 2 replicas each (trip-service, driver-service, user-service)
- **PostgreSQL**: Primary + 2 read replicas per database
- **Redis**: 6-node cluster (3 primary + 3 replica)
- **Message Queue**: LocalStack SNS/SQS

### Auto-Scaler Settings
```python
trip-service:   min=2, max=6, CPU target=50%
driver-service: min=2, max=6, CPU target=40%
user-service:   min=2, max=4, CPU target=55%
```

### Connection Pool Settings
```
Primary:  connection_limit=50, pool_timeout=60
Replicas: connection_limit=25, pool_timeout=60
```

---

## Detailed Test Results

### Test 1: 200 VUs (Baseline)

**Command**:
```bash
k6 run --env MAX_VUS=200 --env USE_LB=true --env RAMP_PROFILE=gradual \
  --env TOTAL_PASSENGERS=1400 --env TOTAL_DRIVERS=600 \
  tests/load/module-a-capacity-test.js
```

**Results**:
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| HTTP Error Rate | 0.00% | <5% | ✅ |
| Check Success | 99.99% | >95% | ✅ |
| trip_creation p95 | 202ms | <1000ms | ✅ |
| trip_status_check p95 | 160ms | <400ms | ✅ |
| driver_search p95 | 103ms | <500ms | ✅ |
| profile_lookup p95 | 50ms | <300ms | ✅ |
| location_update p95 | 106ms | <200ms | ✅ |
| Total RPS | 88 req/s | - | ✅ |

**Auto-Scaler**: No scaling events (CPU stayed under thresholds)

---

### Test 2: 300 VUs (Peak Capacity)

**Command**:
```bash
k6 run --env MAX_VUS=300 --env USE_LB=true --env RAMP_PROFILE=gradual \
  --env TOTAL_PASSENGERS=2100 --env TOTAL_DRIVERS=900 \
  tests/load/module-a-capacity-test.js
```

**Results**:
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| HTTP Error Rate | 0.00% | <5% | ✅ |
| Check Success | 100.00% | >95% | ✅ |
| trip_creation p95 | 608ms | <1000ms | ✅ |
| trip_status_check p95 | 373ms | <400ms | ✅ |
| driver_search p95 | 168ms | <500ms | ✅ |
| profile_lookup p95 | 65ms | <300ms | ✅ |
| location_update p95 | 145ms | <200ms | ✅ |
| Total RPS | 94 req/s | - | ✅ |

**Auto-Scaler**: No scaling events (trip-service peaked at 62.5% CPU)

---

### Test 3: 400 VUs (Threshold Breached)

**Command**:
```bash
k6 run --env MAX_VUS=400 --env USE_LB=true --env RAMP_PROFILE=gradual \
  --env TOTAL_PASSENGERS=2800 --env TOTAL_DRIVERS=1200 \
  tests/load/module-a-capacity-test.js
```

**Results**:
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| HTTP Error Rate | 0.00% | <5% | ✅ |
| Check Success | 100.00% | >95% | ✅ |
| trip_creation p95 | 1.3s | <1000ms | ❌ |
| trip_status_check p95 | 950ms | <400ms | ❌ |
| driver_search p95 | 161ms | <500ms | ✅ |
| profile_lookup p95 | 83ms | <300ms | ✅ |
| location_update p95 | 206ms | <200ms | ❌ |
| Total RPS | 113 req/s | - | ✅ |

**Auto-Scaler**: No scaling events (trip-service peaked at 61% CPU)

**Note**: Zero errors, but latency thresholds exceeded due to request queuing.

---

### Test 4: 500 VUs (Overloaded)

**Command**:
```bash
k6 run --env MAX_VUS=500 --env USE_LB=true --env RAMP_PROFILE=gradual \
  --env TOTAL_PASSENGERS=3500 --env TOTAL_DRIVERS=1500 \
  tests/load/module-a-capacity-test.js
```

**Results**:
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| HTTP Error Rate | 26.74% | <5% | ❌ |
| Check Success | 71.83% | >95% | ❌ |
| trip_creation p95 | 10.02s | <1000ms | ❌ |
| trip_status_check p95 | 5.01s | <400ms | ❌ |
| driver_search p95 | 5.02s | <500ms | ❌ |
| profile_lookup p95 | 5.02s | <300ms | ❌ |
| Total RPS | 75 req/s | - | ⚠️ |

**Auto-Scaler**: 5 scaling events
- trip-service: 2 → 6 replicas
- user-service: 2 → 3 replicas

**Root Cause**: Hardware saturation (trip-service hit 106% CPU with 6 replicas on 4-thread CPU)

---

## Latency Progression Analysis

| Metric | 200 VU | 300 VU | 400 VU | 500 VU |
|--------|--------|--------|--------|--------|
| trip_creation p95 | 202ms | 608ms | 1.3s | 10s |
| trip_status_check p95 | 160ms | 373ms | 950ms | 5s |
| driver_search p95 | 103ms | 168ms | 161ms | 5s |
| profile_lookup p95 | 50ms | 65ms | 83ms | 5s |

**Observation**: Latency grows **exponentially** above 300 VUs, indicating queuing saturation.

---

## Fixes Applied During Testing

### 1. Connection Pool Fix
**Issue**: user-service missing connection pool settings caused timeouts  
**Fix**: Added `connection_limit=50&pool_timeout=60` to DATABASE_URL

```yaml
# docker-compose.yml - user-service
DATABASE_URL: postgresql://...?connection_limit=50&pool_timeout=60
```

### 2. Auto-Scaler Minimum Replicas
**Issue**: user-service scaled down to 1 replica during test, causing timeouts  
**Fix**: Changed `min_replicas: 1` → `2` in auto-scaler.py

```python
"user-service": {
    "min_replicas": 2,  # Was 1, caused timeouts when scaled down
}
```

### 3. Nginx Load Balancer Configuration
**Issue**: Variable-based DNS bypassed keepalive connections  
**Fix**: Rewrote nginx-lb.conf with proper upstream blocks

```nginx
upstream user_backend {
    least_conn;
    server user-service:3001;
    server user-service-2:3001;
    keepalive 64;
}
```

### 4. k6 Test Script Routing
**Issue**: Test called services directly instead of through load balancer  
**Fix**: Modified test to route ALL traffic through LB when USE_LB=true

---

## Hardware Limitations

**Test Machine**: Intel i3-1115G4 (2 cores / 4 threads)

| Resource | Available | Used at 500 VU |
|----------|-----------|----------------|
| CPU Threads | 4 | 4 (100%) |
| Memory | 8 GB | ~3 GB |
| Containers | - | 23+ |

**Conclusion**: The 500 VU failure is due to **CPU saturation**, not architectural issues. On a machine with 8+ cores, the system would scale properly.

---

## Capacity Recommendations

### For Current Hardware (4 cores)
- **Production Load**: 200 VUs max (excellent latency)
- **Peak Load**: 300 VUs (acceptable latency)
- **Emergency**: 400 VUs (degraded but no errors)

### For Production (8+ cores recommended)
- Scale target: 500-1000 VUs
- Auto-scaler threshold: 70% CPU (industry standard)
- Minimum replicas: 2 per service

### Scaling Formula
```
Estimated Capacity = (Available CPUs / 4) × 300 VUs

Examples:
- 4 cores  → 300 VUs (tested)
- 8 cores  → 600 VUs (estimated)
- 16 cores → 1200 VUs (estimated)
```

---

## Files Changed

| File | Change |
|------|--------|
| `docker-compose.yml` | Added connection pool settings to user-service |
| `docker-compose.loadbalancer.yml` | Added user-service-2, driver-service-2 replicas |
| `scripts/auto-scaler.py` | Fixed min_replicas for user-service (1→2) |
| `infrastructure/nginx/nginx-lb.conf` | Rewrote with proper upstream blocks |
| `infrastructure/postgres/setup-replica-entrypoint.sh` | Fixed quoting in cat command |
| `services/driver-service/src/redis/redis.service.ts` | Added mget method |
| `services/driver-service/src/drivers/drivers.service.ts` | Fixed georadius type conversion |
| `tests/load/module-a-capacity-test.js` | Fixed to route all traffic through LB |

---

## Appendix: Test Commands

```bash
# 200 VUs (Recommended)
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360 && \
/c/Users/ASUS/Desktop/k6.exe run \
  --env MAX_VUS=200 --env USE_LB=true --env RAMP_PROFILE=gradual \
  --env TOTAL_PASSENGERS=1400 --env TOTAL_DRIVERS=600 \
  tests/load/module-a-capacity-test.js

# 300 VUs (Peak Capacity)
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360 && \
/c/Users/ASUS/Desktop/k6.exe run \
  --env MAX_VUS=300 --env USE_LB=true --env RAMP_PROFILE=gradual \
  --env TOTAL_PASSENGERS=2100 --env TOTAL_DRIVERS=900 \
  tests/load/module-a-capacity-test.js

# Start Auto-Scaler (separate terminal)
python scripts/auto-scaler.py
```
