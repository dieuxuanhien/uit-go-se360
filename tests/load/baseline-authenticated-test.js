// Baseline Performance Test with Real Authentication
// Registers users, gets JWT tokens, and tests authenticated endpoints

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Service URLs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const USER_SERVICE = __ENV.USER_SERVICE_URL || 'http://localhost:3001';
const TRIP_SERVICE = __ENV.TRIP_SERVICE_URL || 'http://localhost:3002';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const registrationErrors = new Rate('registration_errors');
const loginErrors = new Rate('login_errors');
const tripCreationErrors = new Rate('trip_creation_errors');
const tripCreationDuration = new Trend('trip_creation_duration');
const loginDuration = new Trend('login_duration');
const totalTripsCreated = new Counter('total_trips_created');
const totalUsersRegistered = new Counter('total_users_registered');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const locations = new SharedArray('locations', function () {
  return JSON.parse(open('./data/hcmc_locations.json'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const options = {
  scenarios: {
    baseline_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Ramp up to 10 users
        { duration: '1m', target: 10 },    // Stay at 10 users
        { duration: '30s', target: 20 },   // Ramp to 20 users
        { duration: '1m', target: 20 },    // Stay at 20 users
        { duration: '30s', target: 0 },    // Ramp down
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<2000'],     // 95% of requests under 2s
    'http_req_failed': ['rate<0.05'],        // <5% failures
    'trip_creation_errors': ['rate<0.05'],   // <5% trip creation failures
    'login_errors': ['rate<0.05'],           // <5% login failures
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup Phase: Register Test Users
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function setup() {
  console.log('🚀 Setting up test users...');
  
  const testUsers = {
    passengers: [],
    drivers: []
  };

  // Register 30 passengers (enough for 20 VUs with some buffer)
  console.log('📝 Registering passengers...');
  for (let i = 0; i < 30; i++) {
    const userData = {
      email: `loadtest.passenger.${Date.now()}.${i}@example.com`,
      password: 'LoadTest123!',
      firstName: 'Test',
      lastName: `Passenger${i}`,
      phoneNumber: `+8490${String(1000000 + i).padStart(7, '0')}`,
      role: 'PASSENGER'
    };

    const registerRes = http.post(
      `${USER_SERVICE}/users/register`,
      JSON.stringify(userData),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (registerRes.status === 201) {
      testUsers.passengers.push(userData);
      console.log(`  ✅ Registered passenger ${i + 1}/30`);
    } else {
      console.log(`  ❌ Failed to register passenger ${i + 1}: ${registerRes.status}`);
    }
  }

  // Register 10 drivers (for future driver tests)
  console.log('📝 Registering drivers...');
  for (let i = 0; i < 10; i++) {
    const userData = {
      email: `loadtest.driver.${Date.now()}.${i}@example.com`,
      password: 'LoadTest123!',
      firstName: 'Test',
      lastName: `Driver${i}`,
      phoneNumber: `+8491${String(1000000 + i).padStart(7, '0')}`,
      role: 'DRIVER'
    };

    const registerRes = http.post(
      `${USER_SERVICE}/users/register`,
      JSON.stringify(userData),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (registerRes.status === 201) {
      testUsers.drivers.push(userData);
      console.log(`  ✅ Registered driver ${i + 1}/10`);
    } else {
      console.log(`  ❌ Failed to register driver ${i + 1}: ${registerRes.status}`);
    }
  }

  console.log(`✅ Setup complete: ${testUsers.passengers.length} passengers, ${testUsers.drivers.length} drivers`);
  return testUsers;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Test Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function (data) {
  // Each VU gets a unique passenger
  const vuIndex = __VU - 1;
  const passenger = data.passengers[vuIndex % data.passengers.length];
  
  if (!passenger) {
    console.log(`⚠️  VU ${__VU}: No passenger data available`);
    return;
  }

  // Login and get JWT token
  const token = loginAndGetToken(passenger);
  
  if (!token) {
    console.log(`❌ VU ${__VU}: Failed to get token for ${passenger.email}`);
    sleep(1);
    return;
  }

  // Perform authenticated actions
  group('Authenticated Trip Flow', function () {
    // Create trip request
    createTripRequest(token);
    
    sleep(2); // Think time between requests
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loginAndGetToken(user) {
  const startTime = Date.now();
  
  const loginPayload = JSON.stringify({
    email: user.email,
    password: user.password
  });

  const loginRes = http.post(
    `${USER_SERVICE}/users/login`,
    loginPayload,
    { 
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' }
    }
  );

  const duration = Date.now() - startTime;
  loginDuration.add(duration);

  const success = check(loginRes, {
    'login successful (200)': (r) => r.status === 200,
    'login has accessToken': (r) => {
      try {
        return JSON.parse(r.body).accessToken !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  loginErrors.add(!success);

  if (success) {
    try {
      const body = JSON.parse(loginRes.body);
      return body.accessToken;
    } catch (e) {
      console.log(`❌ Failed to parse login response: ${e}`);
      return null;
    }
  }

  return null;
}

function createTripRequest(token) {
  const pickup = locations[Math.floor(Math.random() * locations.length)];
  const destination = locations[Math.floor(Math.random() * locations.length)];

  const tripPayload = JSON.stringify({
    pickupLatitude: pickup.lat,
    pickupLongitude: pickup.lng,
    pickupAddress: pickup.address,
    destinationLatitude: destination.lat,
    destinationLongitude: destination.lng,
    destinationAddress: destination.address,
  });

  const startTime = Date.now();
  
  const tripRes = http.post(
    `${TRIP_SERVICE}/trips`,
    tripPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { endpoint: 'create_trip' }
    }
  );

  const duration = Date.now() - startTime;
  tripCreationDuration.add(duration);

  const success = check(tripRes, {
    'trip created (201)': (r) => r.status === 201,
    'trip has id': (r) => {
      try {
        return JSON.parse(r.body).id !== undefined;
      } catch (e) {
        return false;
      }
    },
    'trip has estimatedFare': (r) => {
      try {
        return JSON.parse(r.body).estimatedFare !== undefined;
      } catch (e) {
        return false;
      }
    },
    'trip has status REQUESTED': (r) => {
      try {
        return JSON.parse(r.body).status === 'REQUESTED';
      } catch (e) {
        return false;
      }
    },
    'latency < 2s': (r) => r.timings.duration < 2000,
  });

  tripCreationErrors.add(!success);
  
  if (success) {
    totalTripsCreated.add(1);
  } else {
    console.log(`❌ Trip creation failed: ${tripRes.status} - ${tripRes.body.substring(0, 100)}`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Teardown Phase: Cleanup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function teardown(data) {
  console.log('🧹 Teardown complete');
  console.log(`   Total test users: ${data.passengers.length + data.drivers.length}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function handleSummary(data) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 BASELINE PERFORMANCE TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  const metrics = data.metrics;
  
  // Overall HTTP metrics
  console.log('🌐 HTTP METRICS:');
  console.log(`   Total Requests: ${metrics.http_reqs.values.count}`);
  console.log(`   Request Rate: ${metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  console.log(`   Failed Requests: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  console.log('');
  
  // Latency metrics
  console.log('⏱️  LATENCY:');
  console.log(`   Average: ${metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`   Median (p50): ${metrics.http_req_duration.values.med.toFixed(2)}ms`);
  console.log(`   p95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`   p99: ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
  console.log(`   Max: ${metrics.http_req_duration.values.max.toFixed(2)}ms`);
  console.log('');
  
  // Login metrics
  if (metrics.login_duration) {
    console.log('🔐 LOGIN PERFORMANCE:');
    console.log(`   Average: ${metrics.login_duration.values.avg.toFixed(2)}ms`);
    console.log(`   p95: ${metrics.login_duration.values['p(95)'].toFixed(2)}ms`);
    console.log(`   Error Rate: ${(metrics.login_errors.values.rate * 100).toFixed(2)}%`);
    console.log('');
  }
  
  // Trip creation metrics
  if (metrics.trip_creation_duration) {
    console.log('🚗 TRIP CREATION PERFORMANCE:');
    console.log(`   Total Trips Created: ${metrics.total_trips_created ? metrics.total_trips_created.values.count : 0}`);
    console.log(`   Average Duration: ${metrics.trip_creation_duration.values.avg.toFixed(2)}ms`);
    console.log(`   p95 Duration: ${metrics.trip_creation_duration.values['p(95)'].toFixed(2)}ms`);
    console.log(`   Error Rate: ${(metrics.trip_creation_errors.values.rate * 100).toFixed(2)}%`);
    console.log('');
  }
  
  // Check results
  console.log('✅ CHECK RESULTS:');
  const totalChecks = metrics.checks.values.passes + metrics.checks.values.fails;
  console.log(`   Total Checks: ${totalChecks}`);
  console.log(`   Passed: ${metrics.checks.values.passes} (${(metrics.checks.values.rate * 100).toFixed(2)}%)`);
  console.log(`   Failed: ${metrics.checks.values.fails}`);
  console.log('');
  
  // Iterations
  console.log('🔄 ITERATIONS:');
  console.log(`   Total: ${metrics.iterations.values.count}`);
  console.log(`   Rate: ${metrics.iterations.values.rate.toFixed(2)} iter/s`);
  console.log(`   Duration (avg): ${metrics.iteration_duration.values.avg.toFixed(2)}ms`);
  console.log('');
  
  // VUs
  console.log('👥 VIRTUAL USERS:');
  console.log(`   Max VUs: ${metrics.vus_max.values.max}`);
  console.log('');
  
  // Threshold results
  console.log('🎯 THRESHOLD RESULTS:');
  const thresholds = data.metrics;
  for (const [metric, data] of Object.entries(thresholds)) {
    if (data.thresholds) {
      for (const [threshold, result] of Object.entries(data.thresholds)) {
        const status = result.ok ? '✅ PASS' : '❌ FAIL';
        console.log(`   ${status}: ${metric} - ${threshold}`);
      }
    }
  }
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  
  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}
