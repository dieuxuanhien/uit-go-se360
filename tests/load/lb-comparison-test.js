// tests/load/lb-comparison-test.js
// Load Balancer Comparison Test: nginx vs LocalStack ALB
// Based on module-a-capacity-test.js patterns
//
// Usage:
//   nginx:         k6 run --env LB_TYPE=nginx --env MAX_VUS=200 lb-comparison-test.js
//   LocalStack:    k6 run --env LB_TYPE=localstack --env MAX_VUS=200 lb-comparison-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const tripCreationDuration = new Trend('trip_creation_duration', true);
const tripCreationSuccess = new Rate('trip_creation_success');
const driverSearchDuration = new Trend('driver_search_duration', true);
const driverSearchSuccess = new Rate('driver_search_success');
const locationUpdateDuration = new Trend('location_update_duration', true);
const locationUpdateSuccess = new Rate('location_update_success');
const requestSuccess = new Rate('request_success');
const totalRequests = new Counter('total_requests');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const LB_TYPE = __ENV.LB_TYPE || 'nginx';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '200');
const TEST_DURATION = __ENV.TEST_DURATION || '60s';

// Load balancer endpoints
const LB_CONFIGS = {
  nginx: {
    url: 'http://localhost:8080',
    name: 'nginx (least_conn)'
  },
  localstack: {
    url: 'http://uitgo-alb.elb.localhost.localstack.cloud:4566',
    name: 'LocalStack ALB (least_outstanding_requests)'
  }
};

const LB_CONFIG = LB_CONFIGS[LB_TYPE];
const BASE_URL = LB_CONFIG.url;

// Test users configuration
const TOTAL_PASSENGERS = parseInt(__ENV.TOTAL_PASSENGERS || '5000');
const TOTAL_DRIVERS = parseInt(__ENV.TOTAL_DRIVERS || '5000');
const DRIVER_START_INDEX = parseInt(__ENV.DRIVER_START_INDEX || '5001');

// HCMC coordinates
const HCMC_CENTER = { lat: 10.762622, lng: 106.660172 };
const LOCATION_RADIUS_KM = 10;

// Workload distribution
const PASSENGER_RATIO = parseFloat(__ENV.PASSENGER_RATIO || '0.7');
const DRIVER_RATIO = 1 - PASSENGER_RATIO;

export const options = {
  setupTimeout: '5m',
  stages: [
    { duration: '10s', target: Math.ceil(MAX_VUS * 0.2) },
    { duration: '15s', target: Math.ceil(MAX_VUS * 0.5) },
    { duration: '15s', target: MAX_VUS },
    { duration: TEST_DURATION, target: MAX_VUS },
    { duration: '10s', target: 0 },
  ],
  
  thresholds: {
    'trip_creation_success': ['rate>0.90'],
    'driver_search_success': ['rate>0.90'],
    'location_update_success': ['rate>0.90'],
    'http_req_failed': ['rate<0.10'],
  },
  
  tags: {
    lb_type: LB_TYPE,
    lb_name: LB_CONFIG.name,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateRandomLocation(center, radiusKm) {
  var radiusDeg = radiusKm / 111;
  var lat = center.lat + (Math.random() - 0.5) * radiusDeg * 2;
  var lng = center.lng + (Math.random() - 0.5) * radiusDeg * 2;
  return { lat: lat, lng: lng };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup: Authenticate test users and set drivers ONLINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function setup() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 LB COMPARISON TEST: ' + LB_CONFIG.name);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📍 Load Balancer URL: ' + BASE_URL);
  console.log('👥 Max VUs: ' + MAX_VUS);
  console.log('⏱️  Test Duration: ' + TEST_DURATION);
  console.log('📊 Workload: ' + (PASSENGER_RATIO*100) + '% passengers, ' + (DRIVER_RATIO*100) + '% drivers');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  var passengerTokens = {};
  var driverTokens = {};
  
  var passengersNeeded = Math.min(Math.ceil(MAX_VUS * PASSENGER_RATIO) + 50, TOTAL_PASSENGERS);
  var driversNeeded = Math.min(Math.ceil(MAX_VUS * DRIVER_RATIO) + 30, TOTAL_DRIVERS);
  
  // Authenticate passengers
  console.log('🔐 Authenticating ' + passengersNeeded + ' passengers...');
  for (var i = 1; i <= passengersNeeded; i++) {
    var email = 'loadtest' + i + '@test.com';
    var res = http.post(BASE_URL + '/users/login', JSON.stringify({
      email: email,
      password: 'password123'
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    
    if (res.status === 200) {
      var body = JSON.parse(res.body);
      if (body.accessToken) {
        passengerTokens[email] = body.accessToken;
      }
    }
    
    if (i % 50 === 0) {
      console.log('   ✓ ' + i + '/' + passengersNeeded + ' passengers authenticated');
    }
  }
  
  // Authenticate drivers
  console.log('🔐 Authenticating ' + driversNeeded + ' drivers...');
  for (var j = 0; j < driversNeeded; j++) {
    var driverEmail = 'loadtest' + (DRIVER_START_INDEX + j) + '@test.com';
    var driverRes = http.post(BASE_URL + '/users/login', JSON.stringify({
      email: driverEmail,
      password: 'password123'
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    
    if (driverRes.status === 200) {
      var driverBody = JSON.parse(driverRes.body);
      if (driverBody.accessToken) {
        driverTokens[driverEmail] = driverBody.accessToken;
      }
    }
    
    if ((j + 1) % 30 === 0) {
      console.log('   ✓ ' + (j + 1) + '/' + driversNeeded + ' drivers authenticated');
    }
  }
  
  console.log('');
  console.log('✅ Authentication complete:');
  console.log('   - Passengers: ' + Object.keys(passengerTokens).length + ' tokens');
  console.log('   - Drivers: ' + Object.keys(driverTokens).length + ' tokens');
  
  // Set drivers ONLINE and initial location
  console.log('');
  console.log('🚗 Setting drivers ONLINE with initial locations...');
  var driversOnline = 0;
  var driverEmails = Object.keys(driverTokens);
  
  for (var k = 0; k < driverEmails.length; k++) {
    var dEmail = driverEmails[k];
    var token = driverTokens[dEmail];
    
    // Set online status
    var statusRes = http.put(BASE_URL + '/drivers/status', JSON.stringify({
      isOnline: true
    }), {
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      timeout: '5s',
    });
    
    if (statusRes.status === 200) {
      driversOnline++;
      
      // Set initial location
      var initialLoc = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
      http.put(BASE_URL + '/drivers/location', JSON.stringify({
        latitude: initialLoc.lat,
        longitude: initialLoc.lng,
        heading: randomIntBetween(0, 359),
      }), {
        headers: { 
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        timeout: '5s',
      });
    }
    
    if ((k + 1) % 30 === 0) {
      console.log('   ✓ ' + (k + 1) + '/' + driverEmails.length + ' drivers set online');
    }
  }
  
  console.log('');
  console.log('✅ Setup complete:');
  console.log('   - Passengers ready: ' + Object.keys(passengerTokens).length);
  console.log('   - Drivers ONLINE: ' + driversOnline + '/' + Object.keys(driverTokens).length);
  console.log('');
  
  return { 
    passengerTokens: passengerTokens, 
    driverTokens: driverTokens,
    totalPassengers: Object.keys(passengerTokens).length,
    totalDrivers: Object.keys(driverTokens).length,
    driversOnline: driversOnline
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Test: Dual Workload (Passengers + Drivers)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function(data) {
  var isDriver = Math.random() < DRIVER_RATIO;
  
  if (isDriver) {
    driverWorkflow(data);
  } else {
    passengerWorkflow(data);
  }
}

// ────────────────────────────────────────────────────
// Passenger Workflow: Search + Trip Creation
// ────────────────────────────────────────────────────
function passengerWorkflow(data) {
  var passengerIndex = (__VU - 1) % data.totalPassengers;
  var email = 'loadtest' + (passengerIndex + 1) + '@test.com';
  var token = data.passengerTokens[email];
  
  if (!token) {
    return;
  }
  
  // Step 1: Search for nearby drivers
  var pickupLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
  
  var searchStart = Date.now();
  var searchRes = http.get(
    BASE_URL + '/drivers/search?latitude=' + pickupLocation.lat + '&longitude=' + pickupLocation.lng + '&radius=5',
    {
      headers: { 'Authorization': 'Bearer ' + token },
      tags: { name: 'driver_search' },
      timeout: '5s',
    }
  );
  
  var searchDuration = Date.now() - searchStart;
  driverSearchDuration.add(searchDuration);
  totalRequests.add(1);
  
  var searchOk = check(searchRes, {
    'driver search succeeded': function(r) { return r.status === 200; }
  });
  driverSearchSuccess.add(searchOk ? 1 : 0);
  requestSuccess.add(searchOk ? 1 : 0);
  
  sleep(randomIntBetween(1, 2));
  
  // Step 2: Create trip request (using correct DTO format from module-a-capacity-test.js)
  var dropoffLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
  
  var tripStart = Date.now();
  var tripRes = http.post(
    BASE_URL + '/trips',
    JSON.stringify({
      pickupLatitude: pickupLocation.lat,
      pickupLongitude: pickupLocation.lng,
      pickupAddress: 'Pickup at ' + pickupLocation.lat.toFixed(4) + ', ' + pickupLocation.lng.toFixed(4),
      destinationLatitude: dropoffLocation.lat,
      destinationLongitude: dropoffLocation.lng,
      destinationAddress: 'Destination at ' + dropoffLocation.lat.toFixed(4) + ', ' + dropoffLocation.lng.toFixed(4),
    }),
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      tags: { name: 'trip_creation' },
      timeout: '10s',
    }
  );
  
  var tripDuration = Date.now() - tripStart;
  tripCreationDuration.add(tripDuration);
  totalRequests.add(1);
  
  var tripOk = check(tripRes, {
    'trip created': function(r) { return r.status === 201 || r.status === 200; }
  });
  tripCreationSuccess.add(tripOk ? 1 : 0);
  requestSuccess.add(tripOk ? 1 : 0);
  
  sleep(randomIntBetween(2, 4));
}

// ────────────────────────────────────────────────────
// Driver Workflow: Continuous Location Updates
// ────────────────────────────────────────────────────
function driverWorkflow(data) {
  var driverIndex = (__VU - 1) % data.totalDrivers;
  var email = 'loadtest' + (DRIVER_START_INDEX + driverIndex) + '@test.com';
  var token = data.driverTokens[email];
  
  if (!token) {
    return;
  }
  
  // Update location (simulates driver moving)
  var currentLocation = generateRandomLocation(HCMC_CENTER, LOCATION_RADIUS_KM);
  
  var locationStart = Date.now();
  var locationRes = http.put(
    BASE_URL + '/drivers/location',
    JSON.stringify({
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
      heading: randomIntBetween(0, 359),
      speed: randomIntBetween(0, 60),
    }),
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      tags: { name: 'location_update' },
      timeout: '3s',
    }
  );
  
  var locationDuration = Date.now() - locationStart;
  locationUpdateDuration.add(locationDuration);
  totalRequests.add(1);
  
  var locationOk = check(locationRes, {
    'location updated': function(r) { return r.status === 200 || r.status === 204; }
  });
  locationUpdateSuccess.add(locationOk ? 1 : 0);
  requestSuccess.add(locationOk ? 1 : 0);
  
  // Think time: Drivers update location every 1 second
  sleep(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Teardown: Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function teardown(data) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 TEST COMPLETE: ' + LB_CONFIG.name);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Load Balancer: ' + LB_TYPE);
  console.log('URL: ' + BASE_URL);
  console.log('Passengers tested: ' + data.totalPassengers);
  console.log('Drivers tested: ' + data.totalDrivers + ' (' + data.driversOnline + ' ONLINE)');
  console.log('═══════════════════════════════════════════════════════════');
}
