// Simple Health Check Smoke Test
// Tests service availability without authentication

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const healthCheckErrors = new Rate('health_check_errors');
const healthCheckDuration = new Trend('health_check_duration');

const USER_SERVICE = 'http://localhost:3001';
const TRIP_SERVICE = 'http://localhost:3002';

export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<100'],  // Health checks should be <100ms
    'http_req_failed': ['rate<0.01'],     // <1% failures
    'health_check_errors': ['rate<0.01'], // <1% unhealthy
  },
};

export default function () {
  // Test user-service health
  const userHealthRes = http.get(`${USER_SERVICE}/health`);
  const userHealthy = check(userHealthRes, {
    'user-service healthy': (r) => r.status === 200,
    'user-service has status': (r) => {
      try {
        return JSON.parse(r.body).status === 'healthy';
      } catch (e) {
        return false;
      }
    },
  });
  
  healthCheckDuration.add(userHealthRes.timings.duration);
  healthCheckErrors.add(!userHealthy);

  // Test trip-service health
  const tripHealthRes = http.get(`${TRIP_SERVICE}/health`);
  const tripHealthy = check(tripHealthRes, {
    'trip-service healthy': (r) => r.status === 200,
    'trip-service has status': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'healthy' && body.database === 'connected';
      } catch (e) {
        return false;
      }
    },
  });
  
  healthCheckDuration.add(tripHealthRes.timings.duration);
  healthCheckErrors.add(!tripHealthy);

  sleep(1);
}

export function handleSummary(data) {
  console.log('📊 Health Check Summary:');
  console.log(`   Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`   Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  console.log(`   Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  console.log(`   p95 Latency: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`   Health Check Error Rate: ${(data.metrics.health_check_errors.values.rate * 100).toFixed(2)}%`);

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
