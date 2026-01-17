#!/bin/bash
# LocalStack ALB vs nginx Load Balancer Comparison Test
# Runs identical load tests against both and compares results

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "LocalStack ALB vs nginx Comparison Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Configuration
K6_BIN="${K6_BIN:-/c/Users/ASUS/Desktop/k6.exe}"
VUS="${VUS:-100}"
DURATION="${DURATION:-30s}"
RESULTS_DIR="docs/testing/lb-comparison"

# URLs
NGINX_URL="http://localhost:8080"
LOCALSTACK_ALB_URL="http://uitgo-alb.elb.localhost.localstack.cloud:4566"

mkdir -p "$RESULTS_DIR"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Simple k6 test script (inline)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > /tmp/lb-comparison-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const successRate = new Rate('success_rate');
const requestDuration = new Trend('request_duration', true);

export const options = {
  vus: __ENV.VUS ? parseInt(__ENV.VUS) : 100,
  duration: __ENV.DURATION || '30s',
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'success_rate': ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function() {
  // Test all three services
  const endpoints = [
    '/users/health',
    '/trips/health', 
    '/drivers/health',
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  
  const start = Date.now();
  const res = http.get(`${BASE_URL}${endpoint}`, {
    timeout: '10s',
  });
  const duration = Date.now() - start;
  
  requestDuration.add(duration);
  
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  successRate.add(success ? 1 : 0);
  
  sleep(0.1);
}
EOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pre-flight checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "🔍 Pre-flight checks..."

# Check nginx
echo -n "   nginx ($NGINX_URL): "
if curl -s "$NGINX_URL/health" > /dev/null 2>&1; then
  echo "✅ OK"
  NGINX_AVAILABLE=true
else
  echo "❌ Not available"
  NGINX_AVAILABLE=false
fi

# Check LocalStack ALB
echo -n "   LocalStack ALB ($LOCALSTACK_ALB_URL): "
if curl -s "$LOCALSTACK_ALB_URL/users/health" > /dev/null 2>&1; then
  echo "✅ OK"
  LOCALSTACK_AVAILABLE=true
else
  echo "❌ Not available"
  LOCALSTACK_AVAILABLE=false
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Test nginx
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ "$NGINX_AVAILABLE" = true ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔵 Testing nginx Load Balancer"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   URL: $NGINX_URL"
  echo "   VUs: $VUS"
  echo "   Duration: $DURATION"
  echo ""
  
  $K6_BIN run \
    --env BASE_URL="$NGINX_URL" \
    --env VUS="$VUS" \
    --env DURATION="$DURATION" \
    --summary-export="$RESULTS_DIR/nginx-summary.json" \
    /tmp/lb-comparison-test.js 2>&1 | tee "$RESULTS_DIR/nginx-output.txt"
else
  echo ""
  echo "⚠️ Skipping nginx test (not available)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Test LocalStack ALB
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ "$LOCALSTACK_AVAILABLE" = true ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🟢 Testing LocalStack ALB"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   URL: $LOCALSTACK_ALB_URL"
  echo "   VUs: $VUS"
  echo "   Duration: $DURATION"
  echo ""
  
  $K6_BIN run \
    --env BASE_URL="$LOCALSTACK_ALB_URL" \
    --env VUS="$VUS" \
    --env DURATION="$DURATION" \
    --summary-export="$RESULTS_DIR/localstack-alb-summary.json" \
    /tmp/lb-comparison-test.js 2>&1 | tee "$RESULTS_DIR/localstack-alb-output.txt"
else
  echo ""
  echo "⚠️ Skipping LocalStack ALB test (not available)"
  echo "   Run: bash infrastructure/localstack/init-alb.sh"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Compare Results
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Comparison Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$RESULTS_DIR/nginx-summary.json" ] && [ -f "$RESULTS_DIR/localstack-alb-summary.json" ]; then
  echo ""
  echo "┌─────────────────────┬──────────────┬──────────────────┐"
  echo "│ Metric              │ nginx        │ LocalStack ALB   │"
  echo "├─────────────────────┼──────────────┼──────────────────┤"
  
  # Extract metrics using jq
  NGINX_P95=$(jq -r '.metrics.http_req_duration.values["p(95)"] // "N/A"' "$RESULTS_DIR/nginx-summary.json" | xargs printf "%.2f")
  NGINX_AVG=$(jq -r '.metrics.http_req_duration.values.avg // "N/A"' "$RESULTS_DIR/nginx-summary.json" | xargs printf "%.2f")
  NGINX_REQ=$(jq -r '.metrics.http_reqs.values.count // "N/A"' "$RESULTS_DIR/nginx-summary.json")
  NGINX_FAIL=$(jq -r '.metrics.http_req_failed.values.rate // 0' "$RESULTS_DIR/nginx-summary.json" | awk '{printf "%.2f%%", $1*100}')
  
  LS_P95=$(jq -r '.metrics.http_req_duration.values["p(95)"] // "N/A"' "$RESULTS_DIR/localstack-alb-summary.json" | xargs printf "%.2f")
  LS_AVG=$(jq -r '.metrics.http_req_duration.values.avg // "N/A"' "$RESULTS_DIR/localstack-alb-summary.json" | xargs printf "%.2f")
  LS_REQ=$(jq -r '.metrics.http_reqs.values.count // "N/A"' "$RESULTS_DIR/localstack-alb-summary.json")
  LS_FAIL=$(jq -r '.metrics.http_req_failed.values.rate // 0' "$RESULTS_DIR/localstack-alb-summary.json" | awk '{printf "%.2f%%", $1*100}')
  
  printf "│ p95 Latency (ms)    │ %12s │ %16s │\n" "$NGINX_P95" "$LS_P95"
  printf "│ Avg Latency (ms)    │ %12s │ %16s │\n" "$NGINX_AVG" "$LS_AVG"
  printf "│ Total Requests      │ %12s │ %16s │\n" "$NGINX_REQ" "$LS_REQ"
  printf "│ Error Rate          │ %12s │ %16s │\n" "$NGINX_FAIL" "$LS_FAIL"
  
  echo "└─────────────────────┴──────────────┴──────────────────┘"
  echo ""
  
  # Save comparison to file
  cat > "$RESULTS_DIR/comparison.md" << ENDMD
# Load Balancer Comparison: nginx vs LocalStack ALB

**Test Configuration:**
- VUs: $VUS
- Duration: $DURATION
- Date: $(date)

## Results

| Metric | nginx | LocalStack ALB |
|--------|-------|----------------|
| p95 Latency (ms) | $NGINX_P95 | $LS_P95 |
| Avg Latency (ms) | $NGINX_AVG | $LS_AVG |
| Total Requests | $NGINX_REQ | $LS_REQ |
| Error Rate | $NGINX_FAIL | $LS_FAIL |

## Analysis

$(if (( $(echo "$NGINX_P95 < $LS_P95" | bc -l 2>/dev/null || echo 0) )); then
  echo "✅ **nginx is faster** by $(echo "$LS_P95 - $NGINX_P95" | bc)ms at p95"
else
  echo "✅ **LocalStack ALB is faster** by $(echo "$NGINX_P95 - $LS_P95" | bc)ms at p95"
fi)

## Conclusion

_Fill in after analyzing results_
ENDMD

  echo "📝 Comparison saved to: $RESULTS_DIR/comparison.md"
else
  echo "⚠️ Not enough data to compare (need both nginx and LocalStack ALB results)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Comparison test complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results saved to: $RESULTS_DIR/"
echo ""
