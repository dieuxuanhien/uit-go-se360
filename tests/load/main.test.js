// tests/load/main.test.js
// UIT-GO-SE360 Load Testing - Main Test Script
// Based on load-testing-plan.md specifications

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tripCreationErrors = new Rate('trip_creation_errors');
const tripCreationDuration = new Trend('trip_creation_duration');
const driverSearchDuration = new Trend('driver_search_duration');
const locationUpdateDuration = new Trend('location_update_duration');
const tripHistoryDuration = new Trend('trip_history_duration');
const loginDuration = new Trend('login_duration');
const totalTripsCreated = new Counter('total_trips_created');
const totalLocationUpdates = new Counter('total_location_updates');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Data (Shared Arrays for memory efficiency)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const passengers = new SharedArray('passengers', function () {
  const data = open('./data/passengers.json');
  return JSON.parse(data);
});

const drivers = new SharedArray('drivers', function () {
  const data = open('./data/drivers.json');
  return JSON.parse(data);
});

const pickupLocations = new SharedArray('pickups', function () {
  const data = open('./data/hcmc_locations.json');
  return JSON.parse(data);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002'; // trip-service port
const USER_SERVICE_URL = __ENV.USER_SERVICE_URL || 'http://localhost:3001'; // user-service port
const SCENARIO = __ENV.SCENARIO || 'baseline';

console.log(`🚀 Starting k6 load test`);
console.log(`   BASE_URL (trip-service): ${BASE_URL}`);
console.log(`   USER_SERVICE_URL: ${USER_SERVICE_URL}`);
console.log(`   SCENARIO: ${SCENARIO}`);
console.log(`   Passengers: ${passengers.length}`);
console.log(`   Drivers: ${drivers.length}`);
console.log(`   Locations: ${pickupLocations.length}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario Configurations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getScenarioOptions(scenario) {
  const scenarios = {
    // Baseline: Find breaking point of current architecture
    baseline: {
      scenarios: {
        baseline_ramp: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '2m', target: 100 },    // Warm-up
            { duration: '5m', target: 100 },    // Sustain 100 users
            { duration: '2m', target: 500 },    // Ramp to 500
            { duration: '5m', target: 500 },    // Sustain 500
            { duration: '2m', target: 1000 },   // Ramp to 1000
            { duration: '5m', target: 1000 },   // Sustain (expect failure)
            { duration: '2m', target: 2000 },   // Push to breaking point
            { duration: '3m', target: 2000 },   // Hold at breaking point
            { duration: '2m', target: 0 },      // Ramp down
          ],
        },
      },
      thresholds: {
        'http_req_duration{endpoint:create_trip}': ['p(95)<2000', 'p(99)<5000'],
        'http_req_duration{endpoint:search_drivers}': ['p(95)<1000', 'p(99)<2000'],
        'http_req_duration{endpoint:update_location}': ['p(95)<200', 'p(99)<500'],
        'http_req_failed': ['rate<0.05'],  // <5% error rate
        'http_reqs': ['rate>100'],         // >100 req/s throughput
      },
    },

    // Spike: Validate auto-scaling response
    spike: {
      scenarios: {
        spike_test: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '1m', target: 500 },    // Normal load
            { duration: '5m', target: 500 },    // Baseline
            { duration: '30s', target: 5000 },  // Sudden 10x spike
            { duration: '2m', target: 5000 },   // Hold spike
            { duration: '1m', target: 500 },    // Return to normal
            { duration: '2m', target: 500 },    // Recovery period
            { duration: '1m', target: 0 },      // Ramp down
          ],
        },
      },
      thresholds: {
        'http_req_duration': ['p(95)<1000'],     // Degrade gracefully
        'http_req_failed': ['rate<0.1'],       // <10% errors during spike
      },
    },

    // Soak: 24-hour stability test
    soak: {
      scenarios: {
        soak_test: {
          executor: 'constant-vus',
          vus: 1000,
          duration: '24h',
        },
      },
      thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1000'],
        'http_req_failed': ['rate<0.01'],
      },
    },

    // Stress: Find maximum capacity
    stress: {
      scenarios: {
        stress_test: {
          executor: 'ramping-arrival-rate',
          startRate: 100,
          timeUnit: '1s',
          preAllocatedVUs: 10000,
          maxVUs: 50000,
          stages: [
            { duration: '5m', target: 500 },    // 500 req/s
            { duration: '5m', target: 1000 },   // 1k req/s
            { duration: '5m', target: 2000 },   // 2k req/s
            { duration: '5m', target: 5000 },   // 5k req/s
            { duration: '5m', target: 10000 },  // 10k req/s (breaking point)
            { duration: '5m', target: 0 },      // Ramp down
          ],
        },
      },
      thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1000'],
        'http_req_failed': ['rate<0.01'],
      },
    },

    // Smoke: Quick validation (5 minutes)
    smoke: {
      scenarios: {
        smoke_test: {
          executor: 'constant-vus',
          vus: 10,
          duration: '5m',
        },
      },
      thresholds: {
        'http_req_duration': ['p(95)<1000'],
        'http_req_failed': ['rate<0.01'],
      },
    },
  };

  return scenarios[scenario] || scenarios.baseline;
}

export const options = getScenarioOptions(SCENARIO);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main VU Code (Simulates User Behavior)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function () {
  const passenger = passengers[Math.floor(Math.random() * passengers.length)];
  const driver = drivers[Math.floor(Math.random() * drivers.length)];

  // Simulate mixed workload (realistic traffic pattern from load-testing-plan.md)
  const rand = Math.random();

  if (rand < 0.4) {
    // 40% - Trip creation flow (most critical)
    createTripFlow(passenger);
  } else if (rand < 0.7) {
    // 30% - Driver location updates
    updateDriverLocation(driver);
  } else if (rand < 0.9) {
    // 20% - Query trip history
    viewTripHistory(passenger);
  } else {
    // 10% - Authentication flow
    loginFlow(passenger);
  }

  // Random think time (1-6 seconds) to simulate real user behavior
  sleep(Math.random() * 5 + 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Flow: Trip Creation (P0 Critical)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createTripFlow(passenger) {
  group('Trip Creation Flow', function () {
    const pickup = pickupLocations[Math.floor(Math.random() * pickupLocations.length)];
    const destination = pickupLocations[Math.floor(Math.random() * pickupLocations.length)];

    const payload = JSON.stringify({
      pickupLatitude: pickup.lat,
      pickupLongitude: pickup.lng,
      pickupAddress: pickup.address,
      destinationLatitude: destination.lat,
      destinationLongitude: destination.lng,
      destinationAddress: destination.address,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${passenger.token}`,
      },
      tags: { endpoint: 'create_trip' },
    };

    const startTime = new Date().getTime();
    const response = http.post(`${BASE_URL}/trips`, payload, params);
    const duration = new Date().getTime() - startTime;

    const success = check(response, {
      'trip created (201)': (r) => r.status === 201,
      'response has tripId': (r) => {
        try {
          return JSON.parse(r.body).id !== undefined;
        } catch (e) {
          return false;
        }
      },
      'response has estimatedFare': (r) => {
        try {
          return JSON.parse(r.body).estimatedFare !== undefined;
        } catch (e) {
          return false;
        }
      },
      'latency < 2s': (r) => r.timings.duration < 2000,
    });

    tripCreationDuration.add(duration);
    tripCreationErrors.add(!success);

    if (success) {
      totalTripsCreated.add(1);
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Flow: Driver Location Update (P0 Critical)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateDriverLocation(driver) {
  group('Driver Location Update', function () {
    const location = pickupLocations[Math.floor(Math.random() * pickupLocations.length)];

    const payload = JSON.stringify({
      latitude: location.lat + (Math.random() - 0.5) * 0.01, // Small random offset
      longitude: location.lng + (Math.random() - 0.5) * 0.01,
      heading: Math.floor(Math.random() * 360),
      speed: Math.random() * 60, // 0-60 km/h
      accuracy: 10,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${driver.token}`,
      },
      tags: { endpoint: 'update_location' },
    };

    const startTime = new Date().getTime();
    const response = http.put(`${BASE_URL}/drivers/location`, payload, params);
    const duration = new Date().getTime() - startTime;

    check(response, {
      'location updated (200)': (r) => r.status === 200,
      'latency < 200ms': (r) => r.timings.duration < 200,
    });

    locationUpdateDuration.add(duration);
    totalLocationUpdates.add(1);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Flow: View Trip History (P2 Medium Priority)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function viewTripHistory(passenger) {
  group('View Trip History', function () {
    const params = {
      headers: {
        'Authorization': `Bearer ${passenger.token}`,
      },
      tags: { endpoint: 'trip_history' },
    };

    const startTime = new Date().getTime();
    const response = http.get(`${BASE_URL}/trips?limit=20`, params);
    const duration = new Date().getTime() - startTime;

    check(response, {
      'history retrieved (200)': (r) => r.status === 200,
      'response has trips array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).trips);
        } catch (e) {
          return false;
        }
      },
      'latency < 500ms': (r) => r.timings.duration < 500,
    });

    tripHistoryDuration.add(duration);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Flow: Login (P1 High Priority)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loginFlow(user) {
  group('Login Flow', function () {
    const payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { endpoint: 'login' },
    };

    const startTime = new Date().getTime();
    const response = http.post(`${BASE_URL}/users/login`, payload, params);
    const duration = new Date().getTime() - startTime;

    check(response, {
      'login successful (200)': (r) => r.status === 200,
      'response has accessToken': (r) => {
        try {
          return JSON.parse(r.body).accessToken !== undefined;
        } catch (e) {
          return false;
        }
      },
      'latency < 500ms': (r) => r.timings.duration < 500,
    });

    loginDuration.add(duration);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function handleSummary(data) {
  console.log('📊 Test Summary:');
  console.log(`   Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`   Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  console.log(`   Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  console.log(`   p95 Latency: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`   p99 Latency: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);

  return {
    'summary.json': JSON.stringify(data),
    'stdout': JSON.stringify(data, null, 2),
  };
}
