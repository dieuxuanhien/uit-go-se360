// tests/load/module-a-capacity-test.js
// Universal capacity test for all Module A architectural stages
// Tests: Trip creation + Driver location updates (dual workload)
//
// ⚠️ KNOWN LIMITATION (Module A Skeleton):
// The driver-service currently only tracks `isOnline` status.
// Missing `isAvailable` tracking means:
//   - A driver serving a trip can still appear in nearby search
//   - Same driver could be "assigned" to multiple trips
// 
// This test simulates the INTENDED workflow where:
//   - Drivers must be ONLINE + AVAILABLE to receive trips
//   - Once assigned, driver is unavailable until trip completes
//
// TODO: Implement driver availability tracking in driver-service

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics - Business Flow Performance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const tripCreationDuration = new Trend('trip_creation_duration', true);
const tripCreationSuccess = new Rate('trip_creation_success');
const tripStatusCheckDuration = new Trend('trip_status_check_duration', true);
const tripStatusCheckSuccess = new Rate('trip_status_check_success');
const driverSearchDuration = new Trend('driver_search_duration', true);
const driverSearchSuccess = new Rate('driver_search_success');
const driversFoundInSearch = new Trend('drivers_found_in_search', true);  // Track how many drivers found
const locationUpdateDuration = new Trend('location_update_duration', true);
const locationUpdateSuccess = new Rate('location_update_success');
const authSuccess = new Rate('auth_success');

// Story 2.2+: Metrics for Read Replicas & Cache validation
const profileLookupDuration = new Trend('profile_lookup_duration', true);
const profileLookupSuccess = new Rate('profile_lookup_success');
const profileLookupRPS = new Counter('profile_lookup_rps');
const statusPollCount = new Counter('status_poll_count');  // Multiple polls per trip

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics - RPS (Requests Per Second)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const tripCreationRPS = new Counter('trip_creation_rps');
const driverSearchRPS = new Counter('driver_search_rps');
const locationUpdateRPS = new Counter('location_update_rps');
const totalRPS = new Counter('total_rps');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics - Infrastructure Performance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const dbQueryDuration = new Trend('db_query_duration', true);
const cacheHitRate = new Rate('cache_hit_rate');
const connectionPoolUsage = new Gauge('connection_pool_usage');
const replicaQueryRate = new Rate('replica_query_rate');

// Request counters by type
const passengerRequests = new Counter('passenger_requests');
const driverRequests = new Counter('driver_requests');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration (adapts to architecture)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Use load balancer if USE_LB=true - routes ALL traffic through nginx
// When USE_LB=true, ALL services go through the load balancer on port 8080
const USE_LB = __ENV.USE_LB === 'true';
const LB_URL = __ENV.LB_URL || 'http://localhost:8080';

// When load balancer is enabled, ALL services use it
// When disabled, use direct service URLs for development/debugging
const BASE_URL = USE_LB ? LB_URL : (__ENV.BASE_URL || 'http://localhost:3001');
const DRIVER_SERVICE_URL = USE_LB ? LB_URL : (__ENV.DRIVER_SERVICE_URL || 'http://localhost:3003');

// Trip service uses LB when enabled (this is the bottleneck we're scaling)
const TRIP_SERVICE_URL = USE_LB ? LB_URL : (__ENV.TRIP_SERVICE_URL || 'http://localhost:3002');

// Test accounts configuration (must match database)
// Database layout: loadtest1-5000 = passengers, loadtest5001-10000 = drivers
// Set via environment variables if different:
//   --env TOTAL_PASSENGERS=5000 --env TOTAL_DRIVERS=5000 --env DRIVER_START_INDEX=5001
const TOTAL_PASSENGERS = parseInt(__ENV.TOTAL_PASSENGERS || '5000');
const TOTAL_DRIVERS = parseInt(__ENV.TOTAL_DRIVERS || '5000');
const DRIVER_START_INDEX = parseInt(__ENV.DRIVER_START_INDEX || '5001'); // First driver email number

// Workload distribution (configurable)
const PASSENGER_RATIO = parseFloat(__ENV.PASSENGER_RATIO || '0.7'); // 70% passengers
const DRIVER_RATIO = 1 - PASSENGER_RATIO; // 30% drivers  

// HCMC coordinates for realistic location simulation
const HCMC_CENTER = { lat: 10.762622, lng: 106.660172 };
const LOCATION_RADIUS_KM = 10; // 10km radius from center

// Max VUs configuration (set via --env MAX_VUS=1000)
const MAX_VUS = parseInt(__ENV.MAX_VUS || '100');

// Validate configuration
if (MAX_VUS * PASSENGER_RATIO > TOTAL_PASSENGERS) {
  console.warn(`⚠️ WARNING: MAX_VUS (${MAX_VUS}) * PASSENGER_RATIO (${PASSENGER_RATIO}) = ${Math.ceil(MAX_VUS * PASSENGER_RATIO)} exceeds TOTAL_PASSENGERS (${TOTAL_PASSENGERS})`);
}
if (MAX_VUS * DRIVER_RATIO > TOTAL_DRIVERS) {
  console.warn(`⚠️ WARNING: MAX_VUS (${MAX_VUS}) * DRIVER_RATIO (${DRIVER_RATIO}) = ${Math.ceil(MAX_VUS * DRIVER_RATIO)} exceeds TOTAL_DRIVERS (${TOTAL_DRIVERS})`);
}

// Ramp-up profile: 'fast' (stress test) or 'gradual' (auto-scaler) or 'production' (realistic)
const RAMP_PROFILE = __ENV.RAMP_PROFILE || 'fast';

export const options = {
  setupTimeout: '5m', // Allow 5 minutes for authentication (more for 1000+ accounts)
  stages: RAMP_PROFILE === 'production' ? [
    // Production-realistic: slow ramp, long sustained peak (total ~8 min)
    // Simulates gradual traffic increase like real-world usage
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.1) },   // Warm-up: 10% (connection pool warm-up)
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.2) },   // Ramp 1: 20%
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.4) },   // Ramp 2: 40%
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.6) },   // Ramp 3: 60%
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.8) },   // Ramp 4: 80%
    { duration: '30s', target: MAX_VUS },                     // Ramp 5: 100%
    { duration: '180s', target: MAX_VUS },                    // Sustained peak: 3 minutes at 100%
    { duration: '60s', target: Math.ceil(MAX_VUS * 0.5) },   // Gradual cooldown: 50%
    { duration: '30s', target: 0 },                           // Final cooldown
  ] : RAMP_PROFILE === 'gradual' ? [
    // Gradual ramp-up: gives auto-scaler time to react (total ~3.5 min to peak)
    { duration: '20s', target: Math.ceil(MAX_VUS * 0.1) },   // Warm-up: 10% (slower start)
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.25) },  // Light: 25% (hold for scaling)
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.5) },   // Moderate: 50% (hold for scaling)
    { duration: '40s', target: Math.ceil(MAX_VUS * 0.75) },  // Heavy: 75% (gradual increase)
    { duration: '60s', target: MAX_VUS },                     // Peak: 100% (sustained load)
    { duration: '30s', target: 0 },                           // Cool down
  ] : [
    // Fast ramp-up: original profile for baseline testing (total ~1.5 min)
    { duration: '10s', target: Math.ceil(MAX_VUS * 0.1) },   // Warm-up: 10%
    { duration: '15s', target: Math.ceil(MAX_VUS * 0.25) },  // Light: 25%
    { duration: '15s', target: Math.ceil(MAX_VUS * 0.5) },   // Moderate: 50%
    { duration: '30s', target: MAX_VUS },                     // Heavy: 100%
    { duration: '20s', target: 0 },                           // Cool down
  ],
  
  thresholds: {
    // Business flow thresholds (will fail at different stages)
    'http_req_duration{name:trip_creation}': ['p(95)<1000'],      // 1s p95
    'http_req_duration{name:driver_search}': ['p(95)<500'],       // 500ms p95
    'http_req_duration{name:location_update}': ['p(95)<200'],     // 200ms p95
    
    'trip_creation_success': ['rate>0.95'],         // 95% success
    'driver_search_success': ['rate>0.95'],         // 95% success
    'location_update_success': ['rate>0.95'],       // 95% success
    'http_req_failed': ['rate<0.05'],               // <5% errors (now drivers are ONLINE)
    
    // Story 2.2+: Read path thresholds (validates replicas + cache)
    'http_req_duration{name:profile_lookup}': ['p(95)<300'],      // Profile lookup <300ms (cached)
    'http_req_duration{name:trip_status_check}': ['p(95)<400'],   // Status check <400ms (replica)
    'profile_lookup_success': ['rate>0.95'],        // 95% success
    'trip_status_check_success': ['rate>0.95'],     // 95% success
    
    // Infrastructure thresholds
    'db_query_duration': ['p(95)<300'],             // DB queries <300ms
    'cache_hit_rate': ['rate>0.8'],                 // 80%+ cache hits (if caching enabled)
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateRandomLocation(center, radiusKm) {
  // Generate random point within radius (simplified)
  const radiusDeg = radiusKm / 111; // Rough conversion km to degrees
  const lat = center.lat + (Math.random() - 0.5) * radiusDeg * 2;
  const lng = center.lng + (Math.random() - 0.5) * radiusDeg * 2;
  return { lat, lng };
}

function extractInfraMetrics(response) {
  // Extract custom headers if backend provides them
  const headers = response.headers;
  
  // Database query time (if backend includes X-DB-Query-Time header)
  if (headers['X-Db-Query-Time']) {
    dbQueryDuration.add(parseFloat(headers['X-Db-Query-Time']));
  }
  
  // Cache hit indicator (if backend includes X-Cache-Hit header)
  if (headers['X-Cache-Hit']) {
    cacheHitRate.add(headers['X-Cache-Hit'] === 'true' ? 1 : 0);
  }
  
  // Connection pool usage (if backend includes X-Pool-Active header)
  if (headers['X-Pool-Active']) {
    connectionPoolUsage.add(parseFloat(headers['X-Pool-Active']));
  }
  
  // Replica query indicator (if backend includes X-Query-Source header)
  if (headers['X-Query-Source']) {
    replicaQueryRate.add(headers['X-Query-Source'] === 'replica' ? 1 : 0);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup: Authenticate test users
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function setup() {
  console.log('🚀 Module A Capacity Test - Setup Phase');
  console.log(`   Architecture: Testing dual workload (passengers + drivers)`);
  console.log(`   Load Balancer: ${USE_LB ? '✅ ENABLED (' + LB_URL + ')' : '❌ Disabled (direct service URLs)'}`);
  console.log(`   User Service: ${BASE_URL}`);
  console.log(`   Trip Service: ${TRIP_SERVICE_URL}`);
  console.log(`   Driver Service: ${DRIVER_SERVICE_URL}`);
  console.log(`   Max VUs: ${MAX_VUS}`);
  console.log(`   Ramp Profile: ${RAMP_PROFILE} ${RAMP_PROFILE === 'production' ? '(~8 min)' : RAMP_PROFILE === 'gradual' ? '(~3.5 min)' : '(~1.5 min)'}`);
  console.log(`   Workload: ${PASSENGER_RATIO*100}% passengers, ${DRIVER_RATIO*100}% drivers`);
  console.log(`   Accounts: ${TOTAL_PASSENGERS} passengers, ${TOTAL_DRIVERS} drivers`);
  console.log('');
  console.log(`   Authenticating test users...`);
  
  const passengerTokens = {};
  const driverTokens = {};
  
  // Calculate how many accounts to authenticate
  // Need enough for all VUs, but not more than available in database
  const passengersNeeded = Math.min(
    Math.ceil(MAX_VUS * PASSENGER_RATIO) + 100,  // VUs needed + buffer
    TOTAL_PASSENGERS                               // Cap at available accounts
  );
  
  const driversNeeded = Math.min(
    Math.ceil(MAX_VUS * DRIVER_RATIO) + 50,      // VUs needed + buffer
    TOTAL_DRIVERS                                  // Cap at available accounts
  );
  
  console.log(`   → Authenticating ${passengersNeeded} passengers (for ${MAX_VUS} max VUs)...`);
  for (let i = 1; i <= passengersNeeded; i++) {
    const email = `loadtest${i}@test.com`;
    const res = http.post(`${BASE_URL}/users/login`, JSON.stringify({
      email: email,
      password: 'password123'
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    
    if (res.status === 200) {
      passengerTokens[email] = JSON.parse(res.body).accessToken;
    }
    
    if (i % 100 === 0) {
      console.log(`     ✓ ${i}/${passengersNeeded} passengers authenticated`);
    }
  }
  
  // Authenticate drivers (DRIVER_START_INDEX to DRIVER_START_INDEX + TOTAL_DRIVERS - 1)
  // Database: loadtest5001@test.com to loadtest10000@test.com are drivers
  console.log(`   → Authenticating ${driversNeeded} drivers (loadtest${DRIVER_START_INDEX} to loadtest${DRIVER_START_INDEX + driversNeeded - 1})...`);
  for (let i = 0; i < driversNeeded; i++) {
    const email = `loadtest${DRIVER_START_INDEX + i}@test.com`;
    const res = http.post(`${BASE_URL}/users/login`, JSON.stringify({
      email: email,
      password: 'password123'
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    
    if (res.status === 200) {
      driverTokens[email] = JSON.parse(res.body).accessToken;
    }
    
    if ((i + 1) % 50 === 0) {
      console.log(`     ✓ ${i + 1}/${driversNeeded} drivers authenticated`);
    }
  }
  
  console.log('');
  console.log(`✅ Authentication complete:`);
  console.log(`   - Passengers: ${Object.keys(passengerTokens).length} tokens`);
  console.log(`   - Drivers: ${Object.keys(driverTokens).length} tokens`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CRITICAL: Set drivers ONLINE before test starts
  // Business Rule: Drivers must be ONLINE to:
  //   1. Update their location
  //   2. Appear in nearby driver searches
  //   3. Receive trip notifications
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log(`   → Setting ${Object.keys(driverTokens).length} drivers ONLINE...`);
  let driversOnline = 0;
  const driverEmails = Object.keys(driverTokens);
  
  for (let i = 0; i < driverEmails.length; i++) {
    const email = driverEmails[i];
    const token = driverTokens[email];
    
    const statusRes = http.put(`${DRIVER_SERVICE_URL}/drivers/status`, JSON.stringify({
      isOnline: true
    }), {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: '5s',
    });
    
    // Debug: Log first few failures
    if (statusRes.status !== 200 && i < 5) {
      console.log(`     ⚠️ Driver ${email} status update failed: ${statusRes.status} - ${statusRes.body}`);
    }
    
    if (statusRes.status === 200) {
      driversOnline++;
      
      // Also set initial location for each driver so they appear in geo-search
      const initialLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
      http.put(`${DRIVER_SERVICE_URL}/drivers/location`, JSON.stringify({
        latitude: initialLocation.lat,
        longitude: initialLocation.lng,
        heading: randomIntBetween(0, 359),
      }), {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: '5s',
      });
    }
    
    if ((i + 1) % 50 === 0) {
      console.log(`     ✓ ${i + 1}/${driverEmails.length} drivers set online`);
    }
  }
  
  console.log('');
  console.log(`✅ Setup complete:`);
  console.log(`   - Passengers ready: ${Object.keys(passengerTokens).length}`);
  console.log(`   - Drivers ONLINE: ${driversOnline}/${Object.keys(driverTokens).length}`);
  console.log('');
  
  return { 
    passengerTokens, 
    driverTokens,
    totalPassengers: Object.keys(passengerTokens).length,
    totalDrivers: Object.keys(driverTokens).length,
    driversOnline: driversOnline
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Test: Dual Workload (Passengers + Drivers)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function(data) {
  // Determine if this VU is a passenger or driver
  const isDriver = Math.random() < DRIVER_RATIO;
  
  if (isDriver) {
    // Driver workflow: Continuous location updates
    driverWorkflow(data);
  } else {
    // Passenger workflow: Trip creation flow
    passengerWorkflow(data);
  }
}

// ────────────────────────────────────────────────────
// Passenger Workflow: Trip Creation + Search
// ────────────────────────────────────────────────────
function passengerWorkflow(data) {
  passengerRequests.add(1);
  
  // Select passenger (round-robin)
  const passengerIndex = (__VU - 1) % data.totalPassengers;
  const email = `loadtest${passengerIndex + 1}@test.com`;
  const token = data.passengerTokens[email];
  
  if (!token) {
    console.error(`No passenger token for ${email}`);
    return;
  }
  
  // Step 1: Search for nearby drivers (uses driver-service, not trip-service)
  const pickupLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
  
  const searchStart = Date.now();
  const searchRes = http.get(
    `${DRIVER_SERVICE_URL}/drivers/search?` +
    `latitude=${pickupLocation.lat}&longitude=${pickupLocation.lng}&radius=5`,
    {
      headers: { 
        'Authorization': `Bearer ${token}`,
      },
      tags: { name: 'driver_search', user_type: 'passenger' },
      timeout: '5s',
    }
  );
  
  const searchDuration = Date.now() - searchStart;
  driverSearchDuration.add(searchDuration);
  driverSearchRPS.add(1);  // Count for RPS calculation
  totalRPS.add(1);
  extractInfraMetrics(searchRes);
  
  // Track number of drivers found (for availability analysis)
  let driversCount = 0;
  if (searchRes.status === 200) {
    try {
      const body = JSON.parse(searchRes.body);
      driversCount = body.totalFound || (body.drivers && body.drivers.length) || 0;
    } catch (e) {
      // ignore
    }
  }
  driversFoundInSearch.add(driversCount);
  
  const searchSuccess = check(searchRes, {
    'driver search succeeded': (r) => r.status === 200,
    'drivers response valid': (r) => {
      if (r.status === 200) {
        try {
          const body = JSON.parse(r.body);
          // Accept empty driver list (drivers may all be on trips)
          // In production, this would trigger retry or expand radius
          return Array.isArray(body.drivers) || Array.isArray(body);
        } catch (e) {
          return false;
        }
      }
      return false;
    }
  });
  driverSearchSuccess.add(searchSuccess ? 1 : 0);
  
  // Step 2: Create trip request
  const dropoffLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
  
  const tripStart = Date.now();
  const tripRes = http.post(
    `${TRIP_SERVICE_URL}/trips`,
    JSON.stringify({
      pickupLatitude: pickupLocation.lat,
      pickupLongitude: pickupLocation.lng,
      pickupAddress: `Pickup at ${pickupLocation.lat.toFixed(4)}, ${pickupLocation.lng.toFixed(4)}`,
      destinationLatitude: dropoffLocation.lat,
      destinationLongitude: dropoffLocation.lng,
      destinationAddress: `Destination at ${dropoffLocation.lat.toFixed(4)}, ${dropoffLocation.lng.toFixed(4)}`,
    }),
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'trip_creation', user_type: 'passenger' },
      timeout: '10s',
    }
  );
  
  const tripDuration = Date.now() - tripStart;
  tripCreationDuration.add(tripDuration);
  tripCreationRPS.add(1);  // Count for RPS calculation
  totalRPS.add(1);
  extractInfraMetrics(tripRes);
  
  const tripSuccess = check(tripRes, {
    'trip created': (r) => r.status === 201 || r.status === 200,
    'trip has id': (r) => {
      if (r.status === 201 || r.status === 200) {
        try {
          const body = JSON.parse(r.body);
          return body.id || (body.trip && body.trip.id);
        } catch (e) {
          return false;
        }
      }
      return false;
    }
  });
  tripCreationSuccess.add(tripSuccess ? 1 : 0);
  
  // Step 3: Get user profile (tests user-service cache + read replicas)
  // Story 2.2+: This triggers Redis cache lookup, then DB replica if cache miss
  const profileStart = Date.now();
  const profileRes = http.get(
    `${BASE_URL}/users/me`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      tags: { name: 'profile_lookup', user_type: 'passenger' },
      timeout: '5s',
    }
  );
  
  const profileDuration = Date.now() - profileStart;
  profileLookupDuration.add(profileDuration);
  profileLookupRPS.add(1);
  totalRPS.add(1);
  extractInfraMetrics(profileRes);
  
  const profileSuccess = check(profileRes, {
    'profile retrieved': (r) => r.status === 200,
    'profile has email': (r) => {
      if (r.status === 200) {
        try {
          const body = JSON.parse(r.body);
          return body.email || (body.user && body.user.email);
        } catch (e) {
          return false;
        }
      }
      return false;
    }
  });
  profileLookupSuccess.add(profileSuccess ? 1 : 0);

  // Step 4: Check trip status multiple times (realistic passenger waiting behavior)
  // Story 2.2+: Multiple polls stress-test read replicas
  if (tripSuccess) {
    const body = JSON.parse(tripRes.body);
    const tripId = body.id || body.trip.id;
    
    // Simulate passenger polling for driver arrival (3-5 status checks)
    // Real users check status every 5-10 seconds while waiting
    const pollCount = randomIntBetween(3, 5);
    
    for (let poll = 0; poll < pollCount; poll++) {
      // Wait between polls (simulating real user behavior)
      sleep(randomIntBetween(1, 2));
      
      const statusStart = Date.now();
      const statusRes = http.get(
        `${TRIP_SERVICE_URL}/trips/${tripId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          tags: { name: 'trip_status_check', user_type: 'passenger' },
          timeout: '5s',
        }
      );
      
      const statusDuration = Date.now() - statusStart;
      tripStatusCheckDuration.add(statusDuration);
      statusPollCount.add(1);
      totalRPS.add(1);
      extractInfraMetrics(statusRes);
      
      const statusSuccess = check(statusRes, {
        'trip status retrieved': (r) => r.status === 200,
        'trip status valid': (r) => {
          if (r.status === 200) {
            try {
              const body = JSON.parse(r.body);
              const status = (body.trip && body.trip.status) || body.status;
              // Valid statuses from trip-service: REQUESTED, ACCEPTED, DRIVER_ASSIGNED, etc.
              return ['REQUESTED', 'ACCEPTED', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(status);
            } catch (e) {
              return false;
            }
          }
          return false;
        }
      });
      tripStatusCheckSuccess.add(statusSuccess ? 1 : 0);
    }
  }
  
  // Think time: Brief pause before next iteration
  sleep(randomIntBetween(1, 2));
}

// ────────────────────────────────────────────────────
// Driver Workflow: Continuous Location Updates
// ────────────────────────────────────────────────────
function driverWorkflow(data) {
  driverRequests.add(1);
  
  // Select driver (round-robin) - Use DRIVER_START_INDEX for correct email
  const driverIndex = (__VU - 1) % data.totalDrivers;
  const email = `loadtest${DRIVER_START_INDEX + driverIndex}@test.com`;
  const token = data.driverTokens[email];
  
  if (!token) {
    console.error(`No driver token for ${email}`);
    return;
  }
  
  // Simulate driver moving (update location every iteration)
  const currentLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
  
  const locationStart = Date.now();
  const locationRes = http.put(
    `${DRIVER_SERVICE_URL}/drivers/location`,
    JSON.stringify({
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
      heading: randomIntBetween(0, 359),
      speed: randomIntBetween(0, 60), // km/h
    }),
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'location_update', user_type: 'driver' },
      timeout: '3s',
    }
  );
  
  const locationDuration = Date.now() - locationStart;
  locationUpdateDuration.add(locationDuration);
  locationUpdateRPS.add(1);  // Count for RPS calculation
  totalRPS.add(1);
  extractInfraMetrics(locationRes);
  
  const locationSuccess = check(locationRes, {
    'location updated': (r) => r.status === 200 || r.status === 204,
    'location accepted': (r) => {
      // Now that drivers are set ONLINE in setup, 403 should not occur
      if (r.status === 200 || r.status === 204) {
        try {
          const body = JSON.parse(r.body);
          return body.success || body.status === 'updated' || body.latitude;
        } catch (e) {
          return true; // 204 No Content is valid
        }
      }
      return false;
    }
  });
  locationUpdateSuccess.add(locationSuccess ? 1 : 0);
  
  // Story 2.2+: Profile lookup for drivers too (tests user-service cache on driver accounts)
  // Every 5th iteration, driver checks their profile
  if (__ITER % 5 === 0) {
    const profileStart = Date.now();
    const profileRes = http.get(
      `${BASE_URL}/users/me`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'profile_lookup', user_type: 'driver' },
        timeout: '5s',
      }
    );
    
    const profileDuration = Date.now() - profileStart;
    profileLookupDuration.add(profileDuration);
    profileLookupRPS.add(1);
    totalRPS.add(1);
    extractInfraMetrics(profileRes);
    
    const profileSuccess = profileRes.status === 200;
    profileLookupSuccess.add(profileSuccess ? 1 : 0);
  }
  
  // Think time: Simulate real-time updates (1s interval)
  sleep(1); // Drivers update location every 1 second
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Teardown: Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function teardown(data) {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Module A Capacity Test - Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Passengers tested: ${data.totalPassengers}`);
  console.log(`   Drivers tested: ${data.totalDrivers} (${data.driversOnline} set ONLINE)`);
  console.log(`   Workload: ${PASSENGER_RATIO*100}% trip creation, ${DRIVER_RATIO*100}% location updates`);
  console.log('');
  console.log('   📈 Key metrics to analyze:');
  console.log('      - total_rps: Total requests per second (check rate in output)');
  console.log('      - trip_creation_rps: Trip creation throughput');
  console.log('      - driver_search_rps: Driver search throughput');
  console.log('      - location_update_rps: Location update throughput');
  console.log('      - drivers_found_in_search: Availability analysis');
  console.log('');
  console.log('   📚 Story 2.2+ (Read Replica & Cache Testing):');
  console.log('      - profile_lookup_rps: Profile lookups (tests user-service cache)');
  console.log('      - status_poll_count: Total status polls (tests trip-service replicas)');
  console.log('      - profile_lookup_duration: Should improve with cache hits');
  console.log('      - trip_status_check_duration: Should benefit from read replicas');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
