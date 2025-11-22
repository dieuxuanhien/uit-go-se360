# Load Testing Plan

## UIT-GO-SE360 Hyper-Scale Architecture Validation

**Project:** uit-go-se360 - Ride-Hailing Platform  
**Track:** BMad Method (Brownfield) + Module A: Scalability & Performance  
**Date:** 2025-11-21  
**Author:** Architect Agent  
**Status:** Ready for Implementation

---

## Executive Summary

This document defines the comprehensive load testing strategy to validate the hyper-scale architecture transformation. The plan includes baseline testing of the current synchronous architecture, followed by post-optimization testing after implementing async communication, database read replicas, distributed caching, resilience patterns, and API Gateway.

**Key Objectives:**

- ✅ Establish baseline performance metrics (current architecture capacity limits)
- ✅ Validate 100x scalability improvement (1k → 100k concurrent users)
- ✅ Measure p95/p99 latency improvements (5s → 500ms target)
- ✅ Verify error rate reduction (5% → <0.1%)
- ✅ Confirm cost efficiency ($0.173 → $0.0148 per user)

**Testing Tool:** k6 (Grafana k6) - Open-source load testing framework  
**Infrastructure:** AWS ECS Fargate + RDS + ElastiCache + API Gateway  
**Timeline:** 2 weeks (1 week baseline, 1 week post-optimization)

---

## 1. Testing Scope

### 1.1 Critical User Flows to Test

| Flow                        | Priority      | Description                                       | Expected Load       |
| --------------------------- | ------------- | ------------------------------------------------- | ------------------- |
| **Trip Creation**           | P0 (Critical) | Passenger creates trip request                    | 10k req/min at peak |
| **Driver Search**           | P0 (Critical) | System searches nearby drivers                    | 10k searches/min    |
| **Driver Location Updates** | P0 (Critical) | Drivers update location every 5-10s               | 50k updates/min     |
| **Trip Acceptance**         | P1 (High)     | Driver accepts trip                               | 8k req/min          |
| **Trip Lifecycle**          | P1 (High)     | Complete flow: create → accept → start → complete | 5k trips/min        |
| **User Authentication**     | P1 (High)     | Login/register                                    | 2k req/min          |
| **Trip History Query**      | P2 (Medium)   | Passenger views past trips                        | 5k req/min          |
| **Rating Submission**       | P2 (Medium)   | Passenger rates driver                            | 3k req/min          |

### 1.2 Out of Scope

- Admin panel operations (low frequency)
- Driver profile creation (one-time operation)
- Payment processing (not implemented in Phase 1)
- WebSocket real-time updates (future enhancement)

---

## 2. Test Scenarios

### 2.1 Scenario 1: Baseline Performance (Current Architecture)

**Objective:** Identify breaking points of synchronous architecture

**Load Profile:**

```javascript
export const options = {
  scenarios: {
    baseline_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 }, // Warm-up
        { duration: '5m', target: 100 }, // Sustain 100 users
        { duration: '2m', target: 500 }, // Ramp to 500
        { duration: '5m', target: 500 }, // Sustain 500
        { duration: '2m', target: 1000 }, // Ramp to 1000
        { duration: '5m', target: 1000 }, // Sustain (expect failure)
        { duration: '2m', target: 2000 }, // Push to breaking point
        { duration: '3m', target: 2000 }, // Hold at breaking point
        { duration: '2m', target: 0 }, // Ramp down
      ],
    },
  },
  thresholds: {
    'http_req_duration{endpoint:create_trip}': ['p95<2000', 'p99<5000'],
    'http_req_duration{endpoint:search_drivers}': ['p95<1000', 'p99<2000'],
    'http_req_duration{endpoint:update_location}': ['p95<200', 'p99<500'],
    http_req_failed: ['rate<0.05'], // <5% error rate
    http_reqs: ['rate>100'], // >100 req/s throughput
  },
};
```

**Expected Results:**

- System degrades at ~800-1000 concurrent users
- Database connection pool exhaustion
- TripService thread pool saturation
- p95 latency exceeds 5 seconds

---

### 2.2 Scenario 2: Spike Test (Traffic Burst)

**Objective:** Validate auto-scaling response time

**Load Profile:**

```javascript
export const options = {
  scenarios: {
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 500 }, // Normal load
        { duration: '5m', target: 500 }, // Baseline
        { duration: '30s', target: 5000 }, // Sudden 10x spike
        { duration: '2m', target: 5000 }, // Hold spike
        { duration: '1m', target: 500 }, // Return to normal
        { duration: '2m', target: 500 }, // Recovery period
        { duration: '1m', target: 0 }, // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p95<1000'], // Degrade gracefully
    http_req_failed: ['rate<0.1'], // <10% errors during spike
  },
};
```

**Expected Results:**

- Auto-scaling triggers within 2 minutes
- Graceful degradation (no cascading failures)
- Recovery within 5 minutes after spike ends

---

### 2.3 Scenario 3: Soak Test (24-Hour Stability)

**Objective:** Identify memory leaks, connection leaks, resource exhaustion

**Load Profile:**

```javascript
export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '24h',
    },
  },
  thresholds: {
    http_req_duration: ['p95<500', 'p99<1000'],
    http_req_failed: ['rate<0.01'],
  },
};
```

**Monitoring Focus:**

- Memory usage trend (should be stable, not growing)
- Database connection pool (should not leak connections)
- Response time degradation over time
- Error rate consistency

---

### 2.4 Scenario 4: Stress Test (Find Breaking Point)

**Objective:** Determine maximum system capacity

**Load Profile:**

```javascript
export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 10000,
      maxVUs: 50000,
      stages: [
        { duration: '5m', target: 500 }, // 500 req/s
        { duration: '5m', target: 1000 }, // 1k req/s
        { duration: '5m', target: 2000 }, // 2k req/s
        { duration: '5m', target: 5000 }, // 5k req/s
        { duration: '5m', target: 10000 }, // 10k req/s (breaking point)
        { duration: '5m', target: 0 }, // Ramp down
      ],
    },
  },
};
```

**Expected Results (Post-Optimization):**

- System handles 5k req/s with p95 < 500ms
- Degrades gracefully beyond 10k req/s
- No cascading failures (circuit breakers engaged)

---

## 3. k6 Test Scripts

### 3.1 Main Test Script Structure

```javascript
// tests/load/main.test.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const tripCreationErrors = new Rate('trip_creation_errors');
const tripCreationDuration = new Trend('trip_creation_duration');
const driverSearchDuration = new Trend('driver_search_duration');
const locationUpdateDuration = new Trend('location_update_duration');
const totalTripsCreated = new Counter('total_trips_created');

// Test data
const passengers = new SharedArray('passengers', function () {
  return JSON.parse(open('./data/passengers.json'));
});

const drivers = new SharedArray('drivers', function () {
  return JSON.parse(open('./data/drivers.json'));
});

const pickupLocations = new SharedArray('pickups', function () {
  return JSON.parse(open('./data/hcmc_locations.json'));
});

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'baseline';

export const options = getScenarioOptions(SCENARIO);

function getScenarioOptions(scenario) {
  const scenarios = {
    baseline: {
      scenarios: {
        baseline_ramp: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '2m', target: 100 },
            { duration: '5m', target: 100 },
            { duration: '2m', target: 500 },
            { duration: '5m', target: 500 },
            { duration: '2m', target: 1000 },
            { duration: '5m', target: 1000 },
            { duration: '2m', target: 0 },
          ],
        },
      },
      thresholds: {
        'http_req_duration{endpoint:create_trip}': ['p95<2000'],
        http_req_failed: ['rate<0.05'],
      },
    },
    spike: {
      scenarios: {
        spike_test: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '1m', target: 500 },
            { duration: '5m', target: 500 },
            { duration: '30s', target: 5000 },
            { duration: '2m', target: 5000 },
            { duration: '1m', target: 500 },
            { duration: '2m', target: 500 },
            { duration: '1m', target: 0 },
          ],
        },
      },
    },
    stress: {
      scenarios: {
        stress_test: {
          executor: 'ramping-arrival-rate',
          startRate: 100,
          timeUnit: '1s',
          preAllocatedVUs: 10000,
          maxVUs: 50000,
          stages: [
            { duration: '5m', target: 500 },
            { duration: '5m', target: 1000 },
            { duration: '5m', target: 2000 },
            { duration: '5m', target: 5000 },
            { duration: '5m', target: 10000 },
            { duration: '5m', target: 0 },
          ],
        },
      },
    },
  };

  return scenarios[scenario] || scenarios.baseline;
}

export default function () {
  const passenger = passengers[Math.floor(Math.random() * passengers.length)];
  const driver = drivers[Math.floor(Math.random() * drivers.length)];

  // Simulate mixed workload (realistic traffic pattern)
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

  sleep(Math.random() * 5 + 1); // Random think time 1-6 seconds
}

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
        Authorization: `Bearer ${passenger.token}`,
      },
      tags: { endpoint: 'create_trip' },
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/trips`, payload, params);
    const duration = Date.now() - startTime;

    const success = check(response, {
      'trip created (201)': (r) => r.status === 201,
      'response has tripId': (r) => JSON.parse(r.body).id !== undefined,
      'response has estimatedFare': (r) => JSON.parse(r.body).estimatedFare > 0,
      'latency < 2s': (r) => r.timings.duration < 2000,
    });

    tripCreationDuration.add(duration);
    tripCreationErrors.add(!success);

    if (success) {
      totalTripsCreated.add(1);
    }
  });
}

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
        Authorization: `Bearer ${driver.token}`,
      },
      tags: { endpoint: 'update_location' },
    };

    const startTime = Date.now();
    const response = http.put(`${BASE_URL}/drivers/location`, payload, params);
    const duration = Date.now() - startTime;

    check(response, {
      'location updated (200)': (r) => r.status === 200,
      'latency < 200ms': (r) => r.timings.duration < 200,
    });

    locationUpdateDuration.add(duration);
  });
}

function viewTripHistory(passenger) {
  group('View Trip History', function () {
    const params = {
      headers: {
        Authorization: `Bearer ${passenger.token}`,
      },
      tags: { endpoint: 'trip_history' },
    };

    const response = http.get(`${BASE_URL}/trips?limit=20`, params);

    check(response, {
      'history retrieved (200)': (r) => r.status === 200,
      'response has trips array': (r) => Array.isArray(JSON.parse(r.body).trips),
      'latency < 500ms': (r) => r.timings.duration < 500,
    });
  });
}

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

    const response = http.post(`${BASE_URL}/users/login`, payload, params);

    check(response, {
      'login successful (200)': (r) => r.status === 200,
      'response has accessToken': (r) => JSON.parse(r.body).accessToken !== undefined,
      'latency < 500ms': (r) => r.timings.duration < 500,
    });
  });
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
```

### 3.2 Test Data Generation

```javascript
// tests/load/data/generate-test-data.js
const fs = require('fs');
const { faker } = require('@faker-js/faker');

// Generate 1000 passenger accounts
function generatePassengers(count = 1000) {
  const passengers = [];

  for (let i = 0; i < count; i++) {
    passengers.push({
      id: faker.string.uuid(),
      email: `passenger${i}@loadtest.com`,
      password: 'LoadTest123!',
      token: `passenger_token_${i}`, // Pre-generated tokens
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phoneNumber: faker.phone.number('+84#########'),
    });
  }

  fs.writeFileSync('./passengers.json', JSON.stringify(passengers, null, 2));
  console.log(`✅ Generated ${count} passengers`);
}

// Generate 200 driver accounts
function generateDrivers(count = 200) {
  const drivers = [];

  for (let i = 0; i < count; i++) {
    drivers.push({
      id: faker.string.uuid(),
      email: `driver${i}@loadtest.com`,
      password: 'LoadTest123!',
      token: `driver_token_${i}`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phoneNumber: faker.phone.number('+84#########'),
      vehicleMake: faker.vehicle.manufacturer(),
      vehicleModel: faker.vehicle.model(),
      vehiclePlate: `51A-${faker.number.int({ min: 10000, max: 99999 })}`,
    });
  }

  fs.writeFileSync('./drivers.json', JSON.stringify(drivers, null, 2));
  console.log(`✅ Generated ${count} drivers`);
}

// Generate realistic HCMC locations
function generateLocations() {
  const hcmcDistricts = [
    { name: 'District 1', lat: 10.762622, lng: 106.660172 },
    { name: 'District 3', lat: 10.78636, lng: 106.68714 },
    { name: 'Binh Thanh', lat: 10.8078, lng: 106.698639 },
    { name: 'Phu Nhuan', lat: 10.7985, lng: 106.681944 },
    { name: 'Tan Binh', lat: 10.823099, lng: 106.629662 },
    { name: 'Go Vap', lat: 10.8382, lng: 106.6668 },
    { name: 'District 7', lat: 10.72882, lng: 106.7218 },
    { name: 'Thu Duc', lat: 10.85, lng: 106.77 },
  ];

  const locations = [];

  hcmcDistricts.forEach((district) => {
    for (let i = 0; i < 50; i++) {
      locations.push({
        lat: district.lat + (Math.random() - 0.5) * 0.05,
        lng: district.lng + (Math.random() - 0.5) * 0.05,
        address: `${faker.location.streetAddress()}, ${district.name}, HCMC`,
      });
    }
  });

  fs.writeFileSync('./hcmc_locations.json', JSON.stringify(locations, null, 2));
  console.log(`✅ Generated ${locations.length} locations`);
}

// Run generators
generatePassengers(1000);
generateDrivers(200);
generateLocations();
```

---

## 4. Success Criteria & Thresholds

### 4.1 Baseline Architecture (Current State)

| Metric                        | Target | Acceptable  | Unacceptable |
| ----------------------------- | ------ | ----------- | ------------ |
| **Max Concurrent Users**      | N/A    | 500-1000    | <500         |
| **Trip Creation p95 Latency** | N/A    | <3s         | >5s          |
| **Trip Creation p99 Latency** | N/A    | <5s         | >10s         |
| **Error Rate (at capacity)**  | N/A    | <5%         | >10%         |
| **Throughput**                | N/A    | >100 req/s  | <50 req/s    |
| **Database Connections**      | N/A    | <100        | Saturated    |
| **Breaking Point**            | N/A    | ~1000 users | <500 users   |

**Purpose:** Establish baseline metrics to measure improvement against

---

### 4.2 Post-Optimization Architecture (Target State)

| Metric                          | Target        | Acceptable    | Unacceptable    |
| ------------------------------- | ------------- | ------------- | --------------- |
| **Max Concurrent Users**        | 100,000       | >50,000       | <10,000         |
| **Trip Creation p95 Latency**   | <100ms        | <200ms        | >500ms          |
| **Trip Creation p99 Latency**   | <500ms        | <1s           | >2s             |
| **Location Update p95 Latency** | <50ms         | <100ms        | >200ms          |
| **Error Rate (at scale)**       | <0.01%        | <0.1%         | >1%             |
| **Throughput**                  | >5,000 req/s  | >2,000 req/s  | <1,000 req/s    |
| **Cache Hit Rate**              | >90%          | >80%          | <70%            |
| **Database Read Replica Load**  | Balanced ±10% | Balanced ±20% | Unbalanced >30% |
| **Auto-Scaling Response Time**  | <2 min        | <5 min        | >10 min         |
| **Circuit Breaker Activation**  | <1% requests  | <5%           | >10%            |

**Purpose:** Validate 100x scalability improvement

---

## 5. Infrastructure Setup

### 5.1 Test Environment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Load Testing Environment             │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐
│  k6 Load     │ (EC2 t3.xlarge × 10 instances)
│  Generators  │ Distributed load generation
└──────┬───────┘
       │ HTTP Requests
       ▼
┌──────────────────────────────────────────────────────────────┐
│  AWS API Gateway + WAF                                       │
│  - Rate limiting disabled for testing                        │
│  - CloudWatch metrics enabled                                │
└──────┬───────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│  Network Load Balancer (NLB)                                │
│  - Health checks: /health                                   │
│  - Connection draining: 30s                                 │
└──────┬──────────────────────────────────────────────────────┘
       │
       ├────────────────┬──────────────┬──────────────┐
       │                │              │              │
┌──────▼──────┐  ┌──────▼─────┐  ┌────▼────────┐  ┌──▼────────┐
│ UserService │  │TripService │  │DriverService│  │Matching   │
│ ECS Tasks   │  │ ECS Tasks  │  │ ECS Tasks   │  │Worker     │
│ (2-20)      │  │ (2-30)     │  │ (2-20)      │  │ (2-10)    │
└──────┬──────┘  └──────┬─────┘  └────┬────────┘  └──┬────────┘
       │                │              │              │
       ├────────────────┴──────────────┴──────────────┤
       │                                               │
┌──────▼──────────────────────────────────────────────▼──────┐
│  RDS PostgreSQL Cluster                                    │
│  - Primary: db.r6g.xlarge (4 vCPU, 32GB)                  │
│  - Read Replica 1: db.r6g.large (2 vCPU, 16GB)           │
│  - Read Replica 2: db.r6g.large                           │
│  - RDS Proxy: Connection pooling                          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  ElastiCache Redis Cluster                                 │
│  - Primary: cache.r6g.large (2 vCPU, 13GB)               │
│  - Replica 1: cache.r6g.large                             │
│  - Replica 2: cache.r6g.large                             │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  SNS Topics + SQS Queues                                   │
│  - TripEvents topic                                        │
│  - DriverMatchingQueue (+ DLQ)                            │
│  - NotificationQueue                                       │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Monitoring & Observability                                │
│  - CloudWatch Dashboards (real-time metrics)              │
│  - AWS X-Ray (distributed tracing)                        │
│  - k6 Cloud (test result aggregation)                     │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Load Generator Setup

**Terraform Configuration:**

```hcl
# infrastructure/terraform/load-testing.tf

resource "aws_instance" "k6_load_generator" {
  count = 10

  ami           = "ami-0c55b159cbfafe1f0" # Ubuntu 22.04
  instance_type = "t3.xlarge"             # 4 vCPU, 16GB RAM

  vpc_security_group_ids = [aws_security_group.k6.id]
  subnet_id              = aws_subnet.public[count.index % 3].id

  user_data = <<-EOF
    #!/bin/bash
    # Install k6
    sudo gpg -k
    sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
    sudo apt-get update
    sudo apt-get install k6 -y

    # Install monitoring agent
    wget -O /tmp/cloudwatch-agent.deb https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
    sudo dpkg -i /tmp/cloudwatch-agent.deb

    # Clone test scripts from S3
    aws s3 cp s3://uitgo-load-tests/scripts /home/ubuntu/tests --recursive

    echo "k6 load generator ready"
  EOF

  tags = {
    Name        = "uitgo-k6-generator-${count.index + 1}"
    Environment = "load-testing"
    Purpose     = "performance-validation"
  }
}

resource "aws_security_group" "k6" {
  name        = "uitgo-k6-load-generators"
  description = "Security group for k6 load testing instances"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Restrict in production
    description = "SSH access"
  }
}
```

---

## 6. Monitoring & Observability

### 6.1 CloudWatch Dashboard

**Metrics to Track:**

| Category        | Metric                                                                 | Purpose              |
| --------------- | ---------------------------------------------------------------------- | -------------------- |
| **API Gateway** | Request count, 4xx/5xx errors, latency (p50/p95/p99)                   | API layer health     |
| **ECS**         | CPU utilization, memory utilization, task count, auto-scaling events   | Service health       |
| **RDS**         | Database connections, CPU, read/write IOPS, replica lag, query latency | Database bottlenecks |
| **ElastiCache** | Cache hit rate, evictions, CPU, network throughput                     | Cache effectiveness  |
| **SQS/SNS**     | Messages sent, messages visible, DLQ depth, processing latency         | Async flow health    |
| **Application** | Custom metrics: trips/min, active users, error rate by endpoint        | Business metrics     |

### 6.2 AWS X-Ray Tracing

**Key Traces:**

- Trip creation end-to-end (API Gateway → TripService → SNS → Worker → Database)
- Driver search latency breakdown (TripService → DriverService → Redis)
- Cache hit vs miss performance difference

### 6.3 k6 Real-Time Monitoring

```bash
# Run k6 with real-time output
k6 run --out cloud tests/load/main.test.js

# Export results to InfluxDB + Grafana
k6 run --out influxdb=http://localhost:8086/k6 tests/load/main.test.js

# Generate HTML report
k6 run --out json=results.json tests/load/main.test.js
k6-reporter results.json --output report.html
```

---

## 7. Execution Plan

### 7.1 Phase 1: Baseline Testing (Week 1)

**Day 1-2: Environment Setup**

- [ ] Deploy test infrastructure (k6 generators, monitoring)
- [ ] Generate test data (1000 passengers, 200 drivers, locations)
- [ ] Pre-create user accounts in database
- [ ] Validate test scripts with smoke test (10 VUs for 2 minutes)

**Day 3: Smoke Test**

- [ ] Run 10 VUs for 10 minutes
- [ ] Verify all endpoints functional
- [ ] Check monitoring dashboards working
- [ ] Fix any issues before baseline test

**Day 4: Baseline Load Test**

- [ ] Run baseline scenario (ramp 0 → 2000 VUs)
- [ ] Monitor CloudWatch dashboards in real-time
- [ ] Document breaking point and bottlenecks
- [ ] Capture screenshots of metrics at failure point

**Day 5: Analysis & Reporting**

- [ ] Analyze results: identify bottlenecks (DB? Service? Network?)
- [ ] Generate baseline report with charts
- [ ] Document current capacity limits
- [ ] Share findings with team

### 7.2 Phase 2: Post-Optimization Testing (Week 2)

**Prerequisites:**

- ✅ Async communication implemented (SNS/SQS)
- ✅ Read replicas deployed
- ✅ ElastiCache cluster configured
- ✅ Circuit breakers added
- ✅ Auto-scaling policies enabled

**Day 1-2: Validation Testing**

- [ ] Smoke test optimized architecture (10 VUs, 10 min)
- [ ] Run spike test (validate auto-scaling response)
- [ ] Verify circuit breakers trigger correctly
- [ ] Check cache hit rates

**Day 3-4: Performance Testing**

- [ ] Run stress test (ramp to 100k VUs / 10k req/s)
- [ ] Monitor all metrics (API, DB, cache, queues)
- [ ] Capture breaking point (should be >>10k concurrent users)
- [ ] Document any issues encountered

**Day 5-7: Comparative Analysis**

- [ ] Generate comparison report (baseline vs optimized)
- [ ] Create before/after charts
- [ ] Calculate improvement percentages
- [ ] Document cost at different scales
- [ ] Write recommendations for future scaling

---

## 8. Test Execution Commands

### 8.1 Local Testing (Development)

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Ubuntu

# Generate test data
cd tests/load/data
node generate-test-data.js

# Run smoke test (quick validation)
k6 run --vus 10 --duration 2m tests/load/main.test.js

# Run baseline scenario
BASE_URL=http://localhost:3000 \
SCENARIO=baseline \
k6 run tests/load/main.test.js

# Run with custom thresholds
k6 run \
  --out json=baseline-results.json \
  --summary-export=baseline-summary.json \
  tests/load/main.test.js
```

### 8.2 Distributed Load Testing (Production)

```bash
# SSH into each k6 generator instance
for i in {1..10}; do
  ssh ubuntu@k6-generator-$i.uitgo.com \
    "BASE_URL=https://api.uitgo.com \
     SCENARIO=stress \
     K6_CLOUD_TOKEN=$K6_CLOUD_TOKEN \
     k6 run --out cloud tests/load/main.test.js" &
done

# Wait for all tests to complete
wait

# Aggregate results
aws s3 sync s3://uitgo-load-test-results/$(date +%Y-%m-%d) ./results
python scripts/aggregate-results.py ./results
```

### 8.3 Automated CI/CD Integration

```yaml
# .github/workflows/load-test.yml
name: Load Testing

on:
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Test scenario to run'
        required: true
        default: 'baseline'
        type: choice
        options:
          - baseline
          - spike
          - stress
          - soak

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Generate test data
        run: |
          cd tests/load/data
          npm install
          node generate-test-data.js

      - name: Run load test
        run: |
          BASE_URL=${{ secrets.LOAD_TEST_BASE_URL }} \
          SCENARIO=${{ github.event.inputs.scenario }} \
          K6_CLOUD_TOKEN=${{ secrets.K6_CLOUD_TOKEN }} \
          k6 run --out cloud tests/load/main.test.js

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: summary.json
```

---

## 9. Results Analysis & Reporting

### 9.1 Key Performance Indicators (KPIs)

**Latency Improvements:**

- Trip creation p95: Baseline vs Optimized
- Driver search p95: Baseline vs Optimized
- Location update p95: Baseline vs Optimized

**Throughput Improvements:**

- Max concurrent users: Baseline vs Optimized
- Requests per second: Baseline vs Optimized
- Breaking point: Baseline vs Optimized

**Reliability Improvements:**

- Error rate at capacity: Baseline vs Optimized
- Circuit breaker effectiveness (% cascading failures prevented)
- Auto-scaling response time

**Cost Efficiency:**

- Infrastructure cost at 1k users
- Infrastructure cost at 10k users
- Infrastructure cost at 100k users
- Cost per user ($/user/month)

### 9.2 Report Template

**Structure:**

1. Executive Summary
   - Test objectives
   - Key findings (3-5 bullet points)
   - Recommendations

2. Test Configuration
   - Infrastructure details
   - Test scenarios executed
   - Timeline

3. Baseline Results
   - Performance charts
   - Bottleneck analysis
   - Breaking point identification

4. Post-Optimization Results
   - Performance charts
   - Improvement metrics
   - Capacity validation

5. Comparative Analysis
   - Before/after charts
   - Percentage improvements
   - Cost-benefit analysis

6. Recommendations
   - Further optimizations
   - Scaling roadmap
   - Monitoring improvements

---

## 10. Risk Mitigation

### 10.1 Potential Issues & Mitigations

| Risk                                | Impact | Probability | Mitigation                                                           |
| ----------------------------------- | ------ | ----------- | -------------------------------------------------------------------- |
| **Load test crashes production**    | High   | Low         | Use isolated test environment, different AWS account                 |
| **Test data exhausts database**     | Medium | Medium      | Pre-allocate test data, cleanup after tests                          |
| **k6 generators overwhelm network** | Medium | Low         | Distribute across 10 instances, stagger start times                  |
| **AWS cost overrun**                | Medium | Medium      | Set billing alarms, auto-stop after 24h, use Spot instances for k6   |
| **False positives from cold start** | Low    | High        | Warm-up period (2 min ramp), exclude first 5 min from analysis       |
| **DDoS protection blocks tests**    | High   | Medium      | Whitelist k6 generator IPs in WAF, disable rate limiting during test |

### 10.2 Rollback Plan

If post-optimization tests fail:

1. **Immediate:** Stop load test, scale down infrastructure
2. **Analyze:** Review CloudWatch logs for errors
3. **Fix:** Address bottleneck (increase RDS size, fix circuit breaker config, etc.)
4. **Retry:** Re-run test after fixes

---

## 11. Success Criteria Summary

**Test is considered SUCCESSFUL if:**

- ✅ Baseline establishes clear capacity limit (~1k users)
- ✅ Post-optimization handles 50k+ concurrent users (50x improvement minimum)
- ✅ p95 latency < 500ms for trip creation
- ✅ Error rate < 0.1% at scale
- ✅ Auto-scaling responds within 2 minutes
- ✅ No cascading failures (circuit breakers effective)
- ✅ Cache hit rate > 80%
- ✅ Database read replicas balanced (±20%)

**Test is considered FAILED if:**

- ❌ Post-optimization handles <10k concurrent users
- ❌ p95 latency > 2s
- ❌ Error rate > 1%
- ❌ Cascading failures occur (services crash together)
- ❌ Auto-scaling doesn't trigger or takes >10 min

---

## 12. Next Steps

**After completing load testing:**

1. **Update bmm-workflow-status.yaml** to mark `load-testing-plan: completed`
2. **Create baseline-performance-test workflow** (SM agent)
   - Implement k6 scripts
   - Deploy test infrastructure
   - Execute baseline tests
   - Document results
3. **Proceed to sprint-planning workflow** (SM agent)
   - Break architecture changes into stories
   - Estimate complexity
   - Create sprint backlog
4. **Implement optimizations** (SM agent)
   - Story 1: SQS/SNS async communication
   - Story 2: RDS read replicas
   - Story 3: ElastiCache cluster
   - Story 4: Circuit breakers
   - Story 5: API Gateway
5. **Run post-optimization tests** (SM agent)
   - Execute same scenarios
   - Compare with baseline
   - Generate scalability report

---

## Appendix A: Test Data Samples

**Passenger Account:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "passenger123@loadtest.com",
  "password": "LoadTest123!",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+84901234567"
}
```

**Trip Request Payload:**

```json
{
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "District 1, Ho Chi Minh City",
  "destinationLatitude": 10.823099,
  "destinationLongitude": 106.629662,
  "destinationAddress": "Tan Binh District, Ho Chi Minh City"
}
```

---

## Appendix B: CloudWatch Metrics Reference

**Critical Alarms:**

- `TripService-HighLatency`: p95 > 1s for 5 min
- `Database-ConnectionSaturation`: Connections > 95% for 2 min
- `Cache-LowHitRate`: Hit rate < 70% for 10 min
- `SQS-HighQueueDepth`: Messages > 10,000 for 5 min
- `ECS-HighCPU`: CPU > 80% for 5 min
- `API-HighErrorRate`: 5xx errors > 1% for 2 min

---

## Document Control

**Status:** ✅ Ready for Implementation  
**Approved By:** [Pending stakeholder review]  
**Implementation Start:** 2025-11-25 (Week 1: Baseline Testing)  
**Related Documents:**

- `gap-analysis.md` (identifies capacity gaps)
- `async-communication.md` (architecture to test)
- `database-scaling-strategy.md` (read replicas)
- `caching-strategy.md` (ElastiCache)
- `resilience-patterns.md` (circuit breakers)
- `bmm-workflow-status.yaml` (project tracking)

**Next Workflow:** `baseline-performance-test` (SM agent implements k6 scripts)
