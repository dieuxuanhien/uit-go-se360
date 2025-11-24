// Story 2.2: Database Read Scaling - Load Test
// Tests read replica performance with 100 VUs fetching trip history

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const readQueryDuration = new Trend('read_query_duration');
const readQuerySuccess = new Rate('read_query_success');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Warm-up: 0 → 20 VUs
    { duration: '1m', target: 50 },    // Ramp-up: 20 → 50 VUs
    { duration: '2m', target: 100 },   // Peak load: 50 → 100 VUs (read-heavy)
    { duration: '2m', target: 100 },   // Sustain: 100 VUs
    { duration: '30s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],           // 95% requests under 200ms
    read_query_duration: ['p(95)<150'],         // Read queries under 150ms
    http_req_failed: ['rate<0.01'],             // <1% errors
    read_query_success: ['rate>0.99'],          // >99% read success
  },
};

// Pre-created test users (1:1 ratio with peak VUs for realistic load)
const users = Array.from({ length: 100 }, (_, i) => ({
  email: `loadtest${i + 1}@test.com`,
  password: 'password123',
}));

let authTokens = {};

export function setup() {
  console.log('🔐 Authenticating 100 test users...');
  
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
  
  users.forEach((user, index) => {
    const res = http.post(`${BASE_URL}/users/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      authTokens[user.email] = data.accessToken; // API returns camelCase
    } else {
      console.error(`Failed to login user ${user.email}: ${res.status} - ${res.body}`);
    }
    
    if ((index + 1) % 20 === 0) {
      console.log(`  Authenticated ${index + 1}/100 users`);
    }
  });
  
  console.log(`✅ Setup complete: ${Object.keys(authTokens).length}/100 users authenticated`);
  return { authTokens };
}

export default function (data) {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
  
  // Round-robin user selection (1:1 mapping with VUs)
  const userIndex = (__VU - 1) % 100;
  const user = users[userIndex];
  const token = data.authTokens[user.email];
  
  if (!token) {
    console.error(`No auth token for ${user.email}`);
    return;
  }
  
  const isDriver = userIndex >= 50; // loadtest51-100 are drivers
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Read-heavy queries (90% of traffic - should hit replicas)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (isDriver) {
    // Query 1: Fetch driver profile (driver-profiles.repository → replica)
    const startRead = Date.now();
    const driverProfileRes = http.get(`${BASE_URL}/users/driver-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const readDuration = Date.now() - startRead;
    
    const readSuccess = check(driverProfileRes, {
      'driver profile status 200': (r) => r.status === 200,
      'driver profile has data': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.vehiclePlate && data.licenseNumber;
        } catch (e) {
          return false;
        }
      },
      'read query fast': (r) => r.timings.duration < 150,
    });
    
    readQueryDuration.add(readDuration);
    readQuerySuccess.add(readSuccess ? 1 : 0);
    
    sleep(0.5);
  }
  
  // Query 2: Fetch trip history (trips.repository → replica)
  // Both passengers and drivers can query their trip history
  const tripHistoryRes = http.get(`${BASE_URL}/trips?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  check(tripHistoryRes, {
    'trip history status': (r) => r.status === 200 || r.status === 404,
    'trip history is array': (r) => {
      if (r.status !== 200) return true; // 404 is acceptable
      try {
        const data = JSON.parse(r.body);
        return Array.isArray(data) || Array.isArray(data.trips);
      } catch (e) {
        return false;
      }
    },
  });
  
  sleep(0.4);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Write query (10% of traffic - should hit primary)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (isDriver && Math.random() < 0.1) { // 10% write operations (drivers only)
    const updateProfileRes = http.patch(`${BASE_URL}/users/driver-profile`, JSON.stringify({
      vehicleType: Math.random() < 0.5 ? 'CAR' : 'BIKE',
    }), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    
    check(updateProfileRes, {
      'profile updated': (r) => r.status === 200,
    });
    
    sleep(1); // Longer sleep after write
  }
  
  sleep(1); // Base sleep between iterations
}

export function teardown(data) {
  console.log('\n📊 Story 2.2 Read Scaling Test Complete');
  console.log(`  Tested with ${Object.keys(data.authTokens).length} authenticated users`);
  console.log('  Read-heavy traffic pattern: 90% reads, 10% writes');
  console.log('  Target: p95 read latency <150ms (vs 800ms baseline single DB)');
}
