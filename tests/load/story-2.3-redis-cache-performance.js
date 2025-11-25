/**
 * Story 2.3: Redis Cluster Cache Performance Test
 * 
 * Test Objectives:
 * - Validate Redis Cluster cache-aside pattern
 * - Measure cache effectiveness for user profile reads
 * - Compare cached vs uncached response times
 * 
 * Load Pattern:
 * - 30 VUs (virtual users, one per test account)
 * - 5 minute duration
 * - Continuous user profile reads (GET /users/me)
 * - Tests cache-aside: First read = DB (slow), Subsequent reads = Cache (fast)
 * 
 * Success Criteria:
 * - Response time improves significantly after first read (cache warmup)
 * - p95 response time <100ms (cache-accelerated)
 * - <1% error rate
 * - Verify Redis contains cached data
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

// Custom metrics
const cachedReads = new Counter('cached_reads');
const firstReads = new Counter('first_reads');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Warm up cache
    { duration: '1m', target: 20 },   // Ramp to 20 VUs
    { duration: '2m', target: 30 },   // Ramp to 30 VUs (all users active)
    { duration: '1m', target: 30 },   // Sustain 30 VUs (peak load)
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% errors
    http_req_duration: ['p(95)<100'],         // p95 <100ms (cache-accelerated)
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const USER_COUNT = 30;

export function setup() {
  console.log('🔧 Story 2.3: Setting up Redis Cluster cache test...');
  console.log(`📊 Authenticating ${USER_COUNT} test users...`);
  
  const tokens = [];
  
  // Login users to get their tokens
  for (let i = 1; i <= USER_COUNT; i++) {
    const loginRes = http.post(`${BASE_URL}/users/login`, JSON.stringify({
      email: `loadtest${i}@test.com`,
      password: 'password123',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (loginRes.status === 200 || loginRes.status === 201) {
      try {
        const body = loginRes.json();
        if (body && body.accessToken) {
          tokens.push(body.accessToken);
        }
      } catch (e) {
        console.error(`❌ Failed to parse token for loadtest${i}@test.com`);
      }
    } else {
      console.error(`❌ Login failed for loadtest${i}@test.com: ${loginRes.status}`);
    }
  }

  if (tokens.length === 0) {
    throw new Error('Setup failed: No users could authenticate');
  }

  console.log(`✅ Successfully authenticated ${tokens.length}/${USER_COUNT} users`);
  return { tokens };
}

export default function (data) {
  // Each VU uses a unique user account (VU 1 → loadtest1, VU 2 → loadtest2, etc.)
  const vuIndex = __VU - 1; // Convert to 0-based index
  const tokenIndex = vuIndex % data.tokens.length; // Wrap around if more VUs than tokens
  const token = data.tokens[tokenIndex];
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Read user profile - tests cache-aside pattern
  // First read: Cache miss → Query DB → Store in cache
  // Subsequent reads: Cache hit → Fast response
  const startTime = Date.now();
  const res = http.get(`${BASE_URL}/users/me`, { headers });
  const duration = Date.now() - startTime;

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'has user data': (r) => {
      try {
        const body = r.json();
        return body && body.id && body.email;
      } catch (e) {
        return false;
      }
    },
  });

  if (success) {
    // Track response times: Fast = cached, Slow = DB read
    if (duration < 50) {
      cachedReads.add(1);
    } else {
      firstReads.add(1);
    }
  }

  sleep(0.1); // 100ms think time between requests
}

export function handleSummary(data) {
  const totalReqs = (data.metrics.http_reqs && data.metrics.http_reqs.values && data.metrics.http_reqs.values.count) || 0;
  const failedReqs = (data.metrics.http_req_failed && data.metrics.http_req_failed.values && data.metrics.http_req_failed.values.passes) || 0;
  const successReqs = totalReqs - failedReqs;
  const errorRate = totalReqs > 0 ? ((failedReqs / totalReqs) * 100).toFixed(2) : 0;
  
  const p50 = (data.metrics.http_req_duration && data.metrics.http_req_duration.values && data.metrics.http_req_duration.values['p(50)']) ? data.metrics.http_req_duration.values['p(50)'].toFixed(2) : 0;
  const p95 = (data.metrics.http_req_duration && data.metrics.http_req_duration.values && data.metrics.http_req_duration.values['p(95)']) ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) : 0;
  const p99 = (data.metrics.http_req_duration && data.metrics.http_req_duration.values && data.metrics.http_req_duration.values['p(99)']) ? data.metrics.http_req_duration.values['p(99)'].toFixed(2) : 0;
  
  const cachedCount = (data.metrics.cached_reads && data.metrics.cached_reads.values && data.metrics.cached_reads.values.count) || 0;
  const firstReadCount = (data.metrics.first_reads && data.metrics.first_reads.values && data.metrics.first_reads.values.count) || 0;
  const totalCacheOps = cachedCount + firstReadCount;
  const cacheEffectiveness = totalCacheOps > 0 ? ((cachedCount / totalCacheOps) * 100).toFixed(2) : 0;

  console.log('');
  console.log('='.repeat(80));
  console.log('  📊 Story 2.3: Redis Cluster Cache Performance Results');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('🔍 Request Summary:');
  console.log(`  Total Requests: ${totalReqs}`);
  console.log(`  Successful: ${successReqs} (${(100 - errorRate).toFixed(2)}%)`);
  console.log(`  Failed: ${failedReqs} (${errorRate}%) ${errorRate < 1 ? '✅' : '❌'}`);
  console.log('');
  
  console.log('⚡ Response Times (cache-accelerated):');
  console.log(`  p50: ${p50}ms`);
  console.log(`  p95: ${p95}ms ${p95 < 100 ? '✅' : '⚠️'}`);
  console.log(`  p99: ${p99}ms`);
  console.log('');
  
  console.log('💾 Cache Effectiveness:');
  console.log(`  Fast responses (<50ms): ${cachedCount} (likely cached)`);
  console.log(`  Slow responses (≥50ms): ${firstReadCount} (likely DB reads)`);
  console.log(`  Cache effectiveness: ${cacheEffectiveness}% ${cacheEffectiveness > 80 ? '✅' : '⚠️'}`);
  console.log('');
  
  console.log('📋 Verification Steps:');
  console.log('  1. Check Redis Cluster has cached data:');
  console.log('     docker exec uitgo-redis-node-1 redis-cli --cluster call redis-node-1:6379 DBSIZE');
  console.log('');
  console.log('  2. Verify cache hit rate:');
  console.log('     docker exec uitgo-redis-node-1 redis-cli -c INFO stats | grep keyspace');
  console.log('');
  
  const passed = errorRate < 1 && p95 < 100 && cacheEffectiveness > 80;
  console.log(passed ? '✅ TEST PASSED' : '⚠️  CHECK RESULTS');
  console.log('='.repeat(80));
  console.log('');

  return {
    'stdout': '', // Don't print default summary
  };
}
