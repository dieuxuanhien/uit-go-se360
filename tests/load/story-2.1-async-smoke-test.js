/**
 * Story 2.1: Async Communication Smoke Test
 * 
 * Quick validation that async architecture works under moderate load
 * 
 * Target: Validate fire-and-forget SNS publish doesn't degrade under 30 VUs
 * Expected: p95 <100ms (Story 2.1 target), 0% errors
 * Comparison: curl showed 10-20ms, this validates it holds under load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const loginErrors = new Rate('login_errors');
const tripCreationErrors = new Rate('trip_creation_errors');
const tripCreationDuration = new Trend('trip_creation_duration');
const tripAckTime = new Trend('trip_ack_time'); // Custom: measures pure ACK
const totalTripsCreated = new Counter('total_trips_created');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const options = {
  scenarios: {
    async_smoke_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Ramp up to 10 VUs
        { duration: '1m', target: 30 },    // Ramp to 30 VUs
        { duration: '1m', target: 30 },    // Hold 30 VUs (peak load)
        { duration: '30s', target: 0 },    // Ramp down
      ],
    },
  },
  thresholds: {
    // Story 2.1 acceptance criteria: p95 <100ms
    'http_req_duration': ['p(95)<100', 'p(99)<200'],
    'http_req_failed': ['rate<0.01'],  // <1% failures
    'trip_creation_errors': ['rate<0.01'],
    'trip_creation_duration': ['p(95)<100'],  // Trip-specific metric
    'trip_ack_time': ['p(95)<50'],  // ACK should be instant with async
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Data - 30 Pre-created Users (Embedded)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TEST_USERS = [{"email":"loadtest1@test.com","password":"Test123!","userId":"0f37f8cd-8289-4ba6-b7bf-4154f278e7c9"},{"email":"loadtest2@test.com","password":"Test123!","userId":"e700a0f6-c82c-4a1d-9db0-ab8fdb286ea1"},{"email":"loadtest3@test.com","password":"Test123!","userId":"99b304b1-3415-4214-8ad1-68f83da37699"},{"email":"loadtest4@test.com","password":"Test123!","userId":"51feccbc-c99a-439f-ac9a-e92452f2bfbb"},{"email":"loadtest5@test.com","password":"Test123!","userId":"41b81bb5-ccdb-40cf-ab35-6b73aedef57e"},{"email":"loadtest6@test.com","password":"Test123!","userId":"cc869abb-8483-4ef7-ae7c-afbf16ea8aa2"},{"email":"loadtest7@test.com","password":"Test123!","userId":"bd881bdb-254e-40d8-8516-e3f16fe6e685"},{"email":"loadtest8@test.com","password":"Test123!","userId":"6c63e9d8-a782-4c8b-9a40-958e9039ed75"},{"email":"loadtest9@test.com","password":"Test123!","userId":"8bc4def0-d412-4a63-8b36-f5da3bfdeb30"},{"email":"loadtest10@test.com","password":"Test123!","userId":"e6e3483b-f1d8-44eb-8d9c-f0d882ef7369"},{"email":"loadtest11@test.com","password":"Test123!","userId":"a4ccccfe-cbe4-4bdc-b0b7-7091b3ed0ff4"},{"email":"loadtest12@test.com","password":"Test123!","userId":"409c1964-42ec-4c36-9aab-2110a86726e0"},{"email":"loadtest13@test.com","password":"Test123!","userId":"7be702ef-f4e7-45e2-82c4-75ea81025ebc"},{"email":"loadtest14@test.com","password":"Test123!","userId":"856a604f-9983-4e0e-98c7-721a8b6f8833"},{"email":"loadtest15@test.com","password":"Test123!","userId":"4c8b8e43-66d9-4035-bc7f-ce2ff3711760"},{"email":"loadtest16@test.com","password":"Test123!","userId":"2d390130-ad70-44d7-8f81-1a70f2a6f4d1"},{"email":"loadtest17@test.com","password":"Test123!","userId":"2d230875-1063-4931-ab9e-dacca6227539"},{"email":"loadtest18@test.com","password":"Test123!","userId":"535420a9-5dc4-45dc-ac0c-de5c3c591bf3"},{"email":"loadtest19@test.com","password":"Test123!","userId":"0c007bba-cb98-47af-b2dc-d0fe634f65f5"},{"email":"loadtest20@test.com","password":"Test123!","userId":"afcd182e-2dab-45f9-a8b4-42be943dd9ff"},{"email":"loadtest21@test.com","password":"Test123!","userId":"7624094f-263c-41a4-a04d-84260ef130e8"},{"email":"loadtest22@test.com","password":"Test123!","userId":"f3d9d82e-bc94-4da6-90bc-8f2dafe53e60"},{"email":"loadtest23@test.com","password":"Test123!","userId":"4913d82b-3724-48f4-92fa-2011dd72aaa7"},{"email":"loadtest24@test.com","password":"Test123!","userId":"9f512adf-b3fd-45b5-a7db-eb47f85d2e9a"},{"email":"loadtest25@test.com","password":"Test123!","userId":"0486277a-0774-4401-9792-6b5cfe709778"},{"email":"loadtest26@test.com","password":"Test123!","userId":"d427a27c-fbd8-4ca4-8258-844e670eb03b"},{"email":"loadtest27@test.com","password":"Test123!","userId":"5e89aa78-303e-491d-8641-def3f0a1ecb6"},{"email":"loadtest28@test.com","password":"Test123!","userId":"6da88f2e-342b-442b-b9ea-54b36b342da0"},{"email":"loadtest29@test.com","password":"Test123!","userId":"ee8b995e-dc43-4d5d-a184-2b46370dd44f"},{"email":"loadtest30@test.com","password":"Test123!","userId":"ce842e27-b369-418f-8c29-e87398a668ff"}];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Data - HCM Locations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const locations = [
  { lat: 10.762622, lng: 106.660172, address: 'District 1, HCMC' },
  { lat: 10.773996, lng: 106.700000, address: 'District 3, HCMC' },
  { lat: 10.8142, lng: 106.6438, address: 'Tan Binh District' },
  { lat: 10.7769, lng: 106.7009, address: 'Binh Thanh District' },
  { lat: 10.7624, lng: 106.6822, address: 'District 5' },
];

function getRandomLocation() {
  return locations[Math.floor(Math.random() * locations.length)];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup: Validate test users
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function setup() {
  console.log('🚀 Story 2.1 Async Smoke Test - Setup');
  console.log('   VUs: 30 peak, Duration: 3 minutes');
  console.log('   Target: p95 <100ms (Story 2.1 acceptance criteria)');
  console.log('   Validation: Fire-and-forget SNS publish under load');
  console.log('   Test Data: 30 unique users (diverse data, no DB cache pollution)');
  console.log('');

  console.log(`✅ Loaded ${TEST_USERS.length} test users (embedded)`);
  console.log('');
  
  return { testUsers: TEST_USERS };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Login and get token
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function loginAndGetToken(email, password) {
  const loginRes = http.post(
    'http://localhost:3001/users/login',
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const loginOk = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'got access token': (r) => r.json('accessToken') !== undefined,
  });

  loginErrors.add(!loginOk);

  if (loginOk) {
    return loginRes.json('accessToken');
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Create trip with async SNS publish
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createTrip(token) {
  const pickup = getRandomLocation();
  const dropoff = getRandomLocation();

  const tripData = {
    pickupLatitude: pickup.lat,
    pickupLongitude: pickup.lng,
    pickupAddress: pickup.address,
    destinationLatitude: dropoff.lat,
    destinationLongitude: dropoff.lng,
    destinationAddress: dropoff.address,
  };

  // Measure ACK time (should be instant with async)
  const ackStart = Date.now();

  const tripRes = http.post(
    'http://localhost:3002/trips',
    JSON.stringify(tripData),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { name: 'CreateTripAsync' },
    }
  );

  const ackTime = Date.now() - ackStart;

  const tripOk = check(tripRes, {
    'trip creation successful': (r) => r.status === 201,
    'got trip ID': (r) => r.json('id') !== undefined,
    'trip status is REQUESTED': (r) => r.json('status') === 'REQUESTED',
    'response under 100ms': (r) => r.timings.duration < 100,
  });

  tripCreationErrors.add(!tripOk);

  if (tripOk) {
    tripCreationDuration.add(tripRes.timings.duration);
    tripAckTime.add(ackTime);
    totalTripsCreated.add(1);
  }

  return tripOk;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function (data) {
  if (!data || !data.testUsers) {
    console.error('⚠️  No test user data available');
    return;
  }

  // Each VU uses a different user (VU 1 → User 1, VU 2 → User 2, etc.)
  // This ensures diverse data and realistic DB load
  const vuIndex = __VU - 1;  // VU IDs are 1-indexed
  const userIndex = vuIndex % data.testUsers.length;
  const user = data.testUsers[userIndex];

  // Login once per VU (reuse token)
  const token = loginAndGetToken(user.email, user.password);
  
  if (!token) {
    sleep(1);
    return;
  }

  // Create trip with async SNS publish
  createTrip(token);

  // Think time: 1-2 seconds (realistic user behavior)
  sleep(1 + Math.random());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Teardown: Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function teardown(data) {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Story 2.1 Async Smoke Test Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📊 Expected Results:');
  console.log('   ✅ p95 <100ms (Story 2.1 target)');
  console.log('   ✅ ACK time <50ms (fire-and-forget working)');
  console.log('   ✅ Error rate <1%');
  console.log('');
  console.log('📈 Compare with curl validation:');
  console.log('   Curl (1 user):  10-20ms response time (DB cache hot)');
  console.log('   k6 (30 users):  Expected 30-50ms (realistic diverse data)');
  console.log('');
  console.log('💡 Why k6 is slower:');
  console.log('   - 30 unique users → diverse data (no cache pollution)');
  console.log('   - Real DB load: different user_ids, fresh queries');
  console.log('   - Connection pool contention (serialization)');
  console.log('   - Index lookups on diverse values (not cached)');
  console.log('');
  console.log('🔍 If results differ significantly:');
  console.log('   1. Check DB connection pool size (should be ≥30)');
  console.log('   2. Check LocalStack CPU/memory usage');
  console.log('   3. Check SQS queue depth (consumer keeping up?)');
  console.log('   4. Check service logs for errors');
  console.log('');
}
