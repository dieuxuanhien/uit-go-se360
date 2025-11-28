# Module A Load Testing - Quick Reference Guide

## Overview

This testing suite allows you to measure system capacity at different architectural stages using Git commits, providing a complete "before/after" analysis for your Module A report.

---

## 📁 Test Files

```
tests/load/
├── module-a-capacity-test.js          # Universal k6 test script
├── run-module-a-tests.sh              # Automated test runner
└── compare-results.py                 # Results comparison tool

docs/testing/
├── backend-instrumentation-guide.md   # How to add performance headers
└── results/                           # Auto-generated test results
    ├── stage-0-skeleton.json
    ├── stage-1-async.json
    ├── stage-2-replicas.json
    ├── stage-3-caching.json
    └── stage-4-current.json
```

---

## 🚀 Quick Start

### 1. Run All Tests (Recommended)

```bash
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# Make script executable
chmod +x tests/load/run-module-a-tests.sh

# Run all stages (takes ~2-3 hours)
bash tests/load/run-module-a-tests.sh all
```

### 2. Run Specific Stage

```bash
# Test only current architecture
bash tests/load/run-module-a-tests.sh current

# Test only Story 2.1 (async)
bash tests/load/run-module-a-tests.sh async

# Test only Story 2.3 (caching)
bash tests/load/run-module-a-tests.sh caching
```

### 3. Generate Comparison Report

```bash
python3 tests/load/compare-results.py > docs/testing/module-a-comparison.md

# View results
cat docs/testing/module-a-comparison.md
```

---

## 📊 Test Metrics Captured

### Business Flow Metrics

| Metric | Description | Threshold |
|--------|-------------|-----------|
| **trip_creation_duration** | Time to create trip request | p95 < 1000ms |
| **trip_creation_success** | % of successful trip creations | > 95% |
| **driver_search_duration** | Time to search nearby drivers | p95 < 500ms |
| **driver_search_success** | % of successful searches | > 95% |
| **location_update_duration** | Time to update driver location | p95 < 200ms |
| **location_update_success** | % of successful updates | > 95% |

### Infrastructure Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| **db_query_duration** | Database query time | `X-DB-Query-Time` header |
| **cache_hit_rate** | % of requests served from cache | `X-Cache-Hit` header |
| **connection_pool_usage** | Active DB connections | `X-Pool-Active` header |
| **replica_query_rate** | % of queries hitting replicas | `X-Query-Source` header |

---

## 🧪 Test Workload

The test simulates a **dual workload** representing realistic usage:

### Passenger Workflow (70% of VUs)
```
1. Search for nearby drivers (GET /trips/search-drivers)
2. Create trip request (POST /trips)
3. Think time: 1-3 seconds (variable)
```

### Driver Workflow (30% of VUs)
```
1. Update location (PUT /drivers/location)
2. Think time: 1 second (simulates real-time updates)
```

### Load Progression
```
Stage 1: 0 → 50 VUs    (2 min)  [35 passengers + 15 drivers]
Stage 2: 50 → 100 VUs  (3 min)  [70 passengers + 30 drivers]
Stage 3: 100 → 250 VUs (3 min)  [175 passengers + 75 drivers]
Stage 4: 250 → 500 VUs (3 min)  [350 passengers + 150 drivers]
Stage 5: 500 → 750 VUs (3 min)  [525 passengers + 225 drivers]
Stage 6: 750 → 1000 VUs (3 min) [700 passengers + 300 drivers]
Stage 7: 1000 → 0 VUs  (2 min)  [Cool down]

Total: 19 minutes per test
```

---

## 🎯 Expected Results by Stage

### Stage 0: Skeleton (Synchronous)
```
Expected Capacity: ~50 VUs
Bottleneck: Synchronous REST calls, single DB
p95 Latency: 1500-2000ms
Error Rate: 5-10% (connection exhaustion)
```

### Stage 1: Async (Story 2.1)
```
Expected Capacity: ~300 VUs
Improvement: 6x throughput, 80x latency reduction
p95 Latency: 20-50ms (fire-and-forget SNS)
Error Rate: <1%
```

### Stage 2: Replicas (Story 2.2)
```
Expected Capacity: ~500 VUs
Improvement: 1.7x throughput vs Stage 1
p95 Latency: 100-150ms (replica routing overhead)
Error Rate: <1%
Replica Usage: 60-80% of reads
```

### Stage 3: Caching (Story 2.3)
```
Expected Capacity: ~750 VUs
Improvement: 1.5x throughput vs Stage 2
p95 Latency: 50-80ms (cache hits <10ms)
Cache Hit Rate: 90%+ (after warm-up)
```

### Stage 4: Current (Pre-Auto-Scaling)
```
Expected Capacity: ~1000 VUs (fixed 2 replicas/service)
Overall Improvement: 20x vs skeleton
p95 Latency: 75-150ms
Error Rate: <0.5%
Note: Capacity limited by fixed resources
```

---

## 🛠️ Troubleshooting

### Test Fails to Start

```bash
# Check Docker is running
docker ps

# Check k6 binary exists
ls -lh /c/Users/ASUS/Desktop/k6.exe

# Verify test accounts exist
docker exec uitgo-postgres-user psql -U postgres -d uitgo_user \
  -c "SELECT COUNT(*) FROM users WHERE email LIKE 'loadtest%';"
```

### Services Not Healthy

```bash
# Check service logs
docker-compose logs user-service
docker-compose logs trip-service

# Restart services
docker-compose restart user-service trip-service driver-service

# Wait longer for health checks
sleep 60
```

### No Performance Headers in Results

This means backend instrumentation is missing. See `docs/testing/backend-instrumentation-guide.md`.

Quick test:
```bash
TOKEN="your_jwt_token_here"

curl -I http://localhost:3001/users/me \
  -H "Authorization: Bearer $TOKEN"

# Should see headers:
# X-DB-Query-Time: 23.5
# X-Cache-Hit: true
# X-Query-Source: replica
```

### Git Checkout Fails

```bash
# Find your commit hashes
git log --oneline --all | grep -i "story\|async\|replica\|cache"

# Manually test a specific commit
git checkout <commit-hash>
docker-compose up -d
# Run test manually
/c/Users/ASUS/Desktop/k6.exe run tests/load/module-a-capacity-test.js
```

---

## 📈 Using Results in Report

### Section 1: Executive Summary

Use the comparison table:
```markdown
| Architecture | RPS | p95 Latency | Improvement |
|--------------|-----|-------------|-------------|
| Skeleton | 45.2 | 1847ms | Baseline |
| Async (2.1) | 892.3 | 23ms | 19.7x RPS, 80x faster |
| ... | ... | ... | ... |
```

### Section 2: Design Validation (Task 2)

Show async vs sync comparison:
```markdown
**Architectural Decision**: Event-driven async (ADR-001)

Before (Sync): 45 RPS, p95=1847ms
After (Async): 892 RPS, p95=23ms
**Validation**: 100x latency improvement proves async design effective
```

### Section 3: Optimization Impact (Task 3)

Show incremental improvements:
```markdown
Story 2.2 (Replicas): +63% RPS
Story 2.3 (Caching): +46% RPS
**Cumulative**: 47x improvement vs skeleton
```

### Section 4: Infrastructure Analysis

Include infrastructure metrics:
```markdown
**Cache Effectiveness**:
- Hit rate: 97.5%
- Reduced DB load by 97.5%
- Average cache response: 5ms vs 50ms DB query

**Read Replica Utilization**:
- 78% of reads hit replicas
- Primary DB offload: 78%
- Zero replication lag observed
```

---

## 💡 Pro Tips

### 1. Run Tests Multiple Times

First run may show cold cache performance:
```bash
# Run twice, use second result
bash tests/load/run-module-a-tests.sh current
bash tests/load/run-module-a-tests.sh current  # Use this one
```

### 2. Monitor During Test

Open multiple terminals:
```bash
# Terminal 1: Run test
bash tests/load/run-module-a-tests.sh current

# Terminal 2: Watch k6 real-time output
# (shows VUs, RPS, p95 live)

# Terminal 3: Monitor Docker stats
watch -n 2 'docker stats --no-stream'

# Terminal 4: Check service logs
docker-compose logs -f user-service trip-service
```

### 3. Save Baseline Before Changes

```bash
# Before implementing new optimization
bash tests/load/run-module-a-tests.sh current
mv docs/testing/results/stage-4-current.json \
   docs/testing/results/baseline-before-optimization.json

# After implementing optimization
bash tests/load/run-module-a-tests.sh current

# Compare
python3 tests/load/compare-results.py
```

### 4. Focus on Bottlenecks

If test shows degradation:
```bash
# Check which metric failed
grep "✓\|✗" docs/testing/results/stage-4-current-summary.json

# Common issues:
# - High error rate → Check service logs
# - High latency → Check db_query_duration metric
# - Low throughput → Check connection_pool_usage metric
```

---

## 📋 Checklist for Module A Report

- [ ] Run all 5 stages (skeleton → current)
- [ ] Generate comparison report
- [ ] Verify infrastructure metrics captured (db_query, cache_hit, pool_usage)
- [ ] Take screenshots of k6 output showing thresholds
- [ ] Document breaking point (which VU count caused failures)
- [ ] Calculate concurrent user capacity (RPS × 10s think time)
- [ ] Create before/after charts (use k6 JSON output for graphs)
- [ ] Write trade-off analysis for each optimization
- [ ] Document cost implications (Story 2.6 ADR-006)

---

## 🆘 Support

If you encounter issues:

1. **Check logs**: `docker-compose logs <service-name>`
2. **Verify setup**: `docker ps` should show all services healthy
3. **Test manually**: Run k6 directly without script
4. **Simplify**: Test one stage at a time instead of `all`

For questions about metrics or thresholds, refer to:
- `docs/material/out_resource1.md` (VU, RPS, latency definitions)
- `docs/material/out_resource2.md` (throughput vs concurrency)

---

**Good luck with your Module A testing! 🚀**
