# UIT-GO-SE360 Load Testing

Comprehensive k6-based load testing suite for the ride-hailing platform.

## 📁 Directory Structure

```
tests/load/
├── main.test.js              # Main k6 test script with all scenarios
├── data/                     # Test data
│   ├── generate-test-data.js # Script to generate test users and locations
│   ├── passengers.json       # 1000 passenger accounts (generated)
│   ├── drivers.json          # 200 driver accounts (generated)
│   └── hcmc_locations.json   # 400 HCMC locations (generated)
├── scripts/                  # Execution scripts
│   ├── run-smoke.sh          # Quick 5-minute validation test
│   ├── run-baseline.sh       # Full baseline test (~30 min)
│   ├── run-spike.sh          # Spike test for auto-scaling
│   ├── run-stress.sh         # Find breaking point
│   └── analyze-results.js    # Analyze test results
└── results/                  # Test results (gitignored)
    └── baseline-YYYYMMDD-HHMMSS/
        ├── results.json
        ├── summary.json
        └── report-snippet.md
```

## 🚀 Quick Start

### 1. Install k6

**macOS:**

```bash
brew install k6
```

**Ubuntu/Debian:**

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**

```powershell
choco install k6
```

### 2. Generate Test Data

```bash
cd tests/load/data
node generate-test-data.js
```

This creates:

- `passengers.json` - 1000 passenger accounts
- `drivers.json` - 200 driver accounts
- `hcmc_locations.json` - 400 realistic HCMC locations

### 3. Run Smoke Test (Validation)

```bash
cd tests/load
chmod +x scripts/*.sh
./scripts/run-smoke.sh http://localhost:3000
```

Quick 5-minute test with 10 VUs to verify everything works.

### 4. Run Baseline Test

```bash
./scripts/run-baseline.sh http://localhost:3000
```

Full ~30-minute baseline test to find breaking point of current architecture.

## 📊 Test Scenarios

### Smoke Test

- **Duration:** 5 minutes
- **Load:** 10 constant VUs
- **Purpose:** Quick validation that all endpoints work

```bash
BASE_URL=http://localhost:3000 SCENARIO=smoke k6 run main.test.js
```

### Baseline Test

- **Duration:** ~30 minutes
- **Load:** Ramp 0 → 100 → 500 → 1000 → 2000 VUs
- **Purpose:** Establish current capacity limits and breaking points

```bash
BASE_URL=http://localhost:3000 SCENARIO=baseline k6 run main.test.js
```

### Spike Test

- **Duration:** ~15 minutes
- **Load:** 500 VUs → sudden spike to 5000 VUs → back to 500
- **Purpose:** Validate auto-scaling response time

```bash
BASE_URL=http://localhost:3000 SCENARIO=spike k6 run main.test.js
```

### Stress Test

- **Duration:** ~35 minutes
- **Load:** Ramp to 10,000 req/s
- **Purpose:** Find maximum capacity of optimized architecture

```bash
BASE_URL=http://localhost:3000 SCENARIO=stress k6 run main.test.js
```

### Soak Test

- **Duration:** 24 hours
- **Load:** 1000 constant VUs
- **Purpose:** Identify memory leaks, connection leaks, degradation over time

```bash
BASE_URL=http://localhost:3000 SCENARIO=soak k6 run main.test.js
```

## 🎯 Traffic Pattern

Realistic user behavior simulation (from `load-testing-plan.md`):

- **40%** - Trip creation flow (P0 critical)
- **30%** - Driver location updates (P0 critical)
- **20%** - Trip history queries (P2 medium)
- **10%** - Authentication/login (P1 high)

Random think time: 1-6 seconds between requests

## 📈 Success Criteria

### Baseline (Current Architecture)

| Metric               | Acceptable | Unacceptable |
| -------------------- | ---------- | ------------ |
| Max Concurrent Users | 500-1000   | <500         |
| Trip Creation p95    | <3s        | >5s          |
| Error Rate           | <5%        | >10%         |
| Throughput           | >100 req/s | <50 req/s    |

### Post-Optimization (Target)

| Metric               | Target       | Acceptable   | Unacceptable |
| -------------------- | ------------ | ------------ | ------------ |
| Max Concurrent Users | 100,000      | >50,000      | <10,000      |
| Trip Creation p95    | <100ms       | <200ms       | >500ms       |
| Error Rate           | <0.01%       | <0.1%        | >1%          |
| Throughput           | >5,000 req/s | >2,000 req/s | <1,000 req/s |

## 🔍 Analyzing Results

After a test completes, analyze the results:

```bash
node scripts/analyze-results.js ./results/baseline-20251122-140530
```

This generates:

- Console output with key metrics
- `report-snippet.md` - Ready to copy into `docs/testing/baseline-results.md`

## 📝 Custom Metrics Tracked

- `trip_creation_duration` - Trip creation latency
- `driver_search_duration` - Driver search latency
- `location_update_duration` - Location update latency
- `trip_history_duration` - Trip history query latency
- `login_duration` - Login latency
- `total_trips_created` - Count of successful trip creations
- `total_location_updates` - Count of location updates
- `trip_creation_errors` - Rate of trip creation failures

## 🔧 Advanced Usage

### Run with k6 Cloud (Real-time monitoring)

```bash
K6_CLOUD_TOKEN=your-token-here \
BASE_URL=http://localhost:3000 \
k6 run --out cloud main.test.js
```

### Export to InfluxDB + Grafana

```bash
k6 run --out influxdb=http://localhost:8086/k6 main.test.js
```

### Custom thresholds

Edit `main.test.js` and modify the `thresholds` section in scenario options.

## 🚨 Important Notes

1. **Test Data:** Pre-generate users before running tests (see step 2 above)
2. **Environment:** Use isolated test environment, not production
3. **Database:** Ensure test database can handle the load
4. **Monitoring:** Watch CloudWatch/logs during tests to identify bottlenecks
5. **Cleanup:** Clean up test data after completing all tests

## 📚 Related Documentation

- `docs/testing/load-testing-plan.md` - Comprehensive testing strategy
- `docs/testing/baseline-results.md` - Baseline test results
- `docs/testing/post-optimization-results.md` - Post-optimization results
- `docs/architecture/gap-analysis.md` - Performance gaps identified

## 🆘 Troubleshooting

### k6 not found

Install k6 (see Quick Start section)

### Test data not found

Run `node data/generate-test-data.js`

### Connection refused

Ensure services are running: `docker-compose up`

### High error rates

- Check service logs
- Verify database connections
- Ensure services have enough resources

### Out of memory (k6)

Reduce VUs or use distributed load testing with multiple k6 instances

## 📞 Support

For issues with load testing setup, contact the DevOps team or refer to:

- k6 Documentation: https://k6.io/docs/
- Load Testing Plan: `docs/testing/load-testing-plan.md`
