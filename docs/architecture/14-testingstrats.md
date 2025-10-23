## **SECTION 14: TESTING STRATEGY**

Defining comprehensive testing approach for the UIT-Go backend system.

### **14.1 Testing Pyramid**

```

        E2E Tests (10%)

       /              \

      Integration Tests (30%)

     /                    \

    Unit Tests (60%)

```

**Test Distribution:**

-**Unit Tests:** 60% - Fast, isolated, test business logic

-**Integration Tests:** 30% - Test API endpoints and database interactions

-**E2E Tests:** 10% - Test complete user flows across services

---

### **14.2 Test Organization**

**UserService Tests:**

```

services/user-service/test/

├── unit/

│   ├── auth/

│   │   ├── auth.service.spec.ts          # Authentication logic

│   │   ├── jwt.strategy.spec.ts          # JWT validation

│   │   └── password-hasher.spec.ts       # bcrypt operations

│   ├── users/

│   │   ├── users.service.spec.ts         # User CRUD logic

│   │   └── users.repository.spec.ts      # Database queries

│   └── driver-profiles/

│       └── driver-profiles.service.spec.ts

├── integration/

│   ├── auth.e2e.spec.ts                  # POST /users/register, /login

│   ├── users.e2e.spec.ts                 # GET /users/me

│   └── driver-profiles.e2e.spec.ts       # POST /users/driver-profile

└── test-utils.ts                         # Shared test utilities

```

**TripService Tests:**

```

services/trip-service/test/

├── unit/

│   ├── trips/

│   │   ├── trips.service.spec.ts

│   │   ├── trip-state-machine.spec.ts    # State transition validation

│   │   └── fare-calculator.spec.ts       # Fare calculation logic

│   └── integrations/

│       ├── user-service.client.spec.ts   # Mock external calls

│       └── driver-service.client.spec.ts

├── integration/

│   ├── trips.e2e.spec.ts                 # Trip CRUD endpoints

│   ├── trip-lifecycle.e2e.spec.ts        # Complete flow: create → accept → complete

│   └── ratings.e2e.spec.ts               # POST /trips/{id}/rating

└── test-utils.ts

```

**DriverService Tests:**

```

services/driver-service/test/

├── unit/

│   ├── drivers/

│   │   ├── drivers.service.spec.ts

│   │   ├── drivers.repository.spec.ts    # Redis operations

│   │   └── geospatial.spec.ts            # Distance calculations

│   └── integrations/

│       └── user-service.client.spec.ts

├── integration/

│   ├── location.e2e.spec.ts              # PUT /drivers/location

│   ├── status.e2e.spec.ts                # PUT /drivers/status

│   └── search.e2e.spec.ts                # GET /drivers/search

└── test-utils.ts

```

---

### **14.3 Test Examples**

**Unit Test Example (TripService - Fare Calculator):**

```typescript

// services/trip-service/test/unit/fare-calculator.spec.ts

import { FareCalculator } from'../../src/trips/fare-calculator.service';


describe('FareCalculator', () => {

letfareCalculator: FareCalculator;


beforeEach(() => {

fareCalculator = newFareCalculator();

  });


describe('calculateDistance', () => {

it('should calculate distance between two coordinates using Haversine formula', () => {

// Ho Chi Minh City District 1 to Tan Binh District

constlat1 = 10.762622;

constlng1 = 106.660172;

constlat2 = 10.823099;

constlng2 = 106.629662;


constdistance = fareCalculator.calculateDistance(lat1, lng1, lat2, lng2);


// Expected distance: ~8.5 km

expect(distance).toBeGreaterThan(8);

expect(distance).toBeLessThan(9);

    });


it('should return 0 for same coordinates', () => {

constdistance = fareCalculator.calculateDistance(10.762622, 106.660172, 10.762622, 106.660172);

expect(distance).toBe(0);

    });


it('should handle coordinates across international date line', () => {

constdistance = fareCalculator.calculateDistance(0, 179, 0, -179);

expect(distance).toBeGreaterThan(0);

    });

  });


describe('calculateEstimatedFare', () => {

it('should calculate fare based on distance', () => {

constdistanceKm = 10;

constfare = fareCalculator.calculateEstimatedFare(distanceKm);


// Base fare: $2.00 (200 cents)

// Distance fare: 10 km × $1.50/km = $15.00 (1500 cents)

// Time fare: (10 km / 30 km/h) × 60 min/h × $0.30/min = 20 min × $0.30 = $6.00 (600 cents)

// Total: 200 + 1500 + 600 = 2300 cents ($23.00)


expect(fare).toBeGreaterThan(2000);

expect(fare).toBeLessThan(2500);

    });


it('should have minimum base fare for short distances', () => {

constfare = fareCalculator.calculateEstimatedFare(0.5);

expect(fare).toBeGreaterThanOrEqual(200); // At least base fare

    });


it('should scale linearly with distance', () => {

constfare1 = fareCalculator.calculateEstimatedFare(5);

constfare2 = fareCalculator.calculateEstimatedFare(10);


// Fare should roughly double for double distance

expect(fare2).toBeGreaterThan(fare1 * 1.8);

expect(fare2).toBeLessThan(fare1 * 2.2);

    });

  });

});

```

**Integration Test Example (UserService - Authentication):**

```typescript

// services/user-service/test/integration/auth.e2e.spec.ts

import { Test, TestingModule } from'@nestjs/testing';

import { INestApplication } from'@nestjs/common';

import*asrequestfrom'supertest';

import { AppModule } from'../../src/app.module';

import { PrismaService } from'../../src/prisma/prisma.service';


describe('Authentication (e2e)', () => {

letapp: INestApplication;

letprisma: PrismaService;


beforeAll(async () => {

constmoduleFixture: TestingModule = awaitTest.createTestingModule({

imports: [AppModule],

    }).compile();


app = moduleFixture.createNestApplication();

prisma = app.get<PrismaService>(PrismaService);

awaitapp.init();

  });


afterAll(async () => {

awaitprisma.$disconnect();

awaitapp.close();

  });


beforeEach(async () => {

// Clean database before each test

awaitprisma.user.deleteMany();

  });


describe('POST /users/register', () => {

it('should register a new passenger successfully', () => {

returnrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'passenger@example.com',

password:'SecurePass123!',

role:'PASSENGER',

firstName:'John',

lastName:'Doe',

phoneNumber:'+84901234567',

        })

        .expect(201)

        .expect((res) => {

expect(res.body).toHaveProperty('accessToken');

expect(res.body.user).toMatchObject({

email:'passenger@example.com',

role:'PASSENGER',

firstName:'John',

lastName:'Doe',

          });

expect(res.body.user).not.toHaveProperty('passwordHash');

        });

    });


it('should reject duplicate email', async () => {

// Create first user

awaitrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'duplicate@example.com',

password:'SecurePass123!',

role:'PASSENGER',

firstName:'First',

lastName:'User',

phoneNumber:'+84901234567',

        })

        .expect(201);


// Attempt to register with same email

returnrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'duplicate@example.com',

password:'DifferentPass456!',

role:'PASSENGER',

firstName:'Second',

lastName:'User',

phoneNumber:'+84909876543',

        })

        .expect(409)

        .expect((res) => {

expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');

        });

    });


it('should validate email format', () => {

returnrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'invalid-email',

password:'SecurePass123!',

role:'PASSENGER',

firstName:'John',

lastName:'Doe',

phoneNumber:'+84901234567',

        })

        .expect(400)

        .expect((res) => {

expect(res.body.error.message).toContain('email');

        });

    });


it('should enforce password minimum length', () => {

returnrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'test@example.com',

password:'short',

role:'PASSENGER',

firstName:'John',

lastName:'Doe',

phoneNumber:'+84901234567',

        })

        .expect(400)

        .expect((res) => {

expect(res.body.error.message).toContain('password');

        });

    });

  });


describe('POST /users/login', () => {

beforeEach(async () => {

// Register a test user

awaitrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'testuser@example.com',

password:'TestPass123!',

role:'PASSENGER',

firstName:'Test',

lastName:'User',

phoneNumber:'+84901234567',

        });

    });


it('should login successfully with correct credentials', () => {

returnrequest(app.getHttpServer())

        .post('/users/login')

        .send({

email:'testuser@example.com',

password:'TestPass123!',

        })

        .expect(200)

        .expect((res) => {

expect(res.body).toHaveProperty('accessToken');

expect(res.body.user.email).toBe('testuser@example.com');

        });

    });


it('should reject incorrect password', () => {

returnrequest(app.getHttpServer())

        .post('/users/login')

        .send({

email:'testuser@example.com',

password:'WrongPassword',

        })

        .expect(401)

        .expect((res) => {

expect(res.body.error.code).toBe('INVALID_CREDENTIALS');

        });

    });


it('should reject non-existent user', () => {

returnrequest(app.getHttpServer())

        .post('/users/login')

        .send({

email:'nonexistent@example.com',

password:'SomePassword123!',

        })

        .expect(401);

    });

  });


describe('GET /users/me', () => {

letaccessToken: string;


beforeEach(async () => {

// Register and login to get token

constresponse = awaitrequest(app.getHttpServer())

        .post('/users/register')

        .send({

email:'authenticated@example.com',

password:'SecurePass123!',

role:'DRIVER',

firstName:'Auth',

lastName:'User',

phoneNumber:'+84901234567',

        });


accessToken = response.body.accessToken;

    });


it('should return current user profile with valid token', () => {

returnrequest(app.getHttpServer())

        .get('/users/me')

        .set('Authorization', `Bearer ${accessToken}`)

        .expect(200)

        .expect((res) => {

expect(res.body.email).toBe('authenticated@example.com');

expect(res.body.role).toBe('DRIVER');

expect(res.body).not.toHaveProperty('passwordHash');

        });

    });


it('should reject request without token', () => {

returnrequest(app.getHttpServer())

        .get('/users/me')

        .expect(401);

    });


it('should reject request with invalid token', () => {

returnrequest(app.getHttpServer())

        .get('/users/me')

        .set('Authorization', 'Bearer invalid-token')

        .expect(401);

    });


it('should reject expired token', async () => {

// This test requires mocking time or using a short-lived token

// For simplicity, we'll skip implementation details here

// In production, use libraries like `timekeeper` or `sinon` to mock time

    });

  });

});

```

**E2E Test Example (Trip Lifecycle):**

```typescript

// services/trip-service/test/integration/trip-lifecycle.e2e.spec.ts

import { Test, TestingModule } from'@nestjs/testing';

import { INestApplication } from'@nestjs/common';

import*asrequestfrom'supertest';

import { AppModule } from'../../src/app.module';

import { PrismaService } from'../../src/prisma/prisma.service';


describe('Trip Lifecycle (e2e)', () => {

letapp: INestApplication;

letprisma: PrismaService;

letpassengerToken: string;

letdriverToken: string;

lettripId: string;


beforeAll(async () => {

constmoduleFixture: TestingModule = awaitTest.createTestingModule({

imports: [AppModule],

    }).compile();


app = moduleFixture.createNestApplication();

prisma = app.get<PrismaService>(PrismaService);

awaitapp.init();


// Setup: Create passenger and driver users

// Note: In real e2e tests, these would call UserService API

// For this example, we'll assume tokens are obtained

passengerToken = 'mock-passenger-token';

driverToken = 'mock-driver-token';

  });


afterAll(async () => {

awaitprisma.$disconnect();

awaitapp.close();

  });


it('should complete full trip lifecycle: request → accept → start → complete → rate', async () => {

// Step 1: Passenger creates trip

constcreateResponse = awaitrequest(app.getHttpServer())

      .post('/trips')

      .set('Authorization', `Bearer ${passengerToken}`)

      .send({

pickupLatitude:10.762622,

pickupLongitude:106.660172,

pickupAddress:'District 1, Ho Chi Minh City',

destinationLatitude:10.823099,

destinationLongitude:106.629662,

destinationAddress:'Tan Binh District, Ho Chi Minh City',

      })

      .expect(201);


tripId = createResponse.body.id;

expect(createResponse.body.status).toBe('REQUESTED');

expect(createResponse.body.estimatedFare).toBeGreaterThan(0);


// Step 2: Driver accepts trip

constacceptResponse = awaitrequest(app.getHttpServer())

      .post(`/trips/${tripId}/accept`)

      .set('Authorization', `Bearer ${driverToken}`)

      .expect(200);


expect(acceptResponse.body.status).toBe('DRIVER_ASSIGNED');

expect(acceptResponse.body.driverId).toBeDefined();


// Step 3: Driver starts trip

conststartResponse = awaitrequest(app.getHttpServer())

      .post(`/trips/${tripId}/start`)

      .set('Authorization', `Bearer ${driverToken}`)

      .expect(200);


expect(startResponse.body.status).toBe('IN_PROGRESS');

expect(startResponse.body.startedAt).toBeDefined();


// Step 4: Driver completes trip

constcompleteResponse = awaitrequest(app.getHttpServer())

      .post(`/trips/${tripId}/complete`)

      .set('Authorization', `Bearer ${driverToken}`)

      .expect(200);


expect(completeResponse.body.status).toBe('COMPLETED');

expect(completeResponse.body.completedAt).toBeDefined();

expect(completeResponse.body.actualFare).toBeGreaterThan(0);


// Step 5: Passenger rates driver

constratingResponse = awaitrequest(app.getHttpServer())

      .post(`/trips/${tripId}/rating`)

      .set('Authorization', `Bearer ${passengerToken}`)

      .send({

stars:5,

comment:'Excellent driver!',

      })

      .expect(201);


expect(ratingResponse.body.stars).toBe(5);

expect(ratingResponse.body.comment).toBe('Excellent driver!');

  });


it('should prevent invalid state transitions', async () => {

// Create trip

constcreateResponse = awaitrequest(app.getHttpServer())

      .post('/trips')

      .set('Authorization', `Bearer ${passengerToken}`)

      .send({

pickupLatitude:10.762622,

pickupLongitude:106.660172,

pickupAddress:'District 1',

destinationLatitude:10.823099,

destinationLongitude:106.629662,

destinationAddress:'Tan Binh',

      })

      .expect(201);


constnewTripId = createResponse.body.id;


// Attempt to complete trip without starting it (invalid transition)

awaitrequest(app.getHttpServer())

      .post(`/trips/${newTripId}/complete`)

      .set('Authorization', `Bearer ${driverToken}`)

      .expect(400)

      .expect((res) => {

expect(res.body.error.message).toContain('Cannot complete trip in REQUESTED state');

      });

  });

});

```

---

### **14.4 Test Configuration**

**Jest Configuration (jest.config.js):**

```javascript

module.exports = {

moduleFileExtensions: ['js', 'json', 'ts'],

rootDir:'.',

testRegex:'.*\\.spec\\.ts$',

transform: {

'^.+\\.(t|j)s$':'ts-jest',

  },

collectCoverageFrom: [

'src/**/*.ts',

'!src/**/*.module.ts',

'!src/main.ts',

'!src/**/*.interface.ts',

'!src/**/*.dto.ts',

  ],

coverageDirectory:'./coverage',

coverageThresholds: {

global: {

branches:70,

functions:75,

lines:80,

statements:80,

    },

  },

testEnvironment:'node',

setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],

};

```

**Test Setup File (test/setup.ts):**

```typescript

// Global test setup

import { PrismaClient } from'@prisma/client';


// Increase timeout for database operations

jest.setTimeout(30000);


// Clean database before all tests

beforeAll(async () => {

constprisma = newPrismaClient();


// Truncate all tables

awaitprisma.$executeRaw`TRUNCATE TABLE users CASCADE`;

awaitprisma.$executeRaw`TRUNCATE TABLE trips CASCADE`;

awaitprisma.$executeRaw`TRUNCATE TABLE ratings CASCADE`;


awaitprisma.$disconnect();

});


// Mock external services in tests

jest.mock('../src/integrations/user-service.client', () => ({

UserServiceClient:jest.fn().mockImplementation(() => ({

getUser:jest.fn().mockResolvedValue({

id:'mock-user-id',

email:'mock@example.com',

role:'DRIVER',

    }),

  })),

}));

```

---

### **14.5 Testing Commands**

```bash

# Run all tests

pnpmtest


# Run tests for specific service

pnpm--filteruser-servicetest


# Run tests in watch mode

pnpmtest:watch


# Run only unit tests

pnpmtest----testPathPattern=unit


# Run only integration tests

pnpmtest----testPathPattern=integration


# Run with coverage

pnpmtest:cov


# Run specific test file

pnpmtest--auth.service.spec.ts


# Debug tests in VS Code

# Add to .vscode/launch.json:

{

"type":"node",

"request":"launch",

"name":"Jest Debug",

"program":"${workspaceFolder}/node_modules/.bin/jest",

"args": ["--runInBand", "--testPathPattern=${fileBasename}"],

"console":"integratedTerminal",

"internalConsoleOptions":"neverOpen"

}

```

---

### **Detailed Rationale:**

**Testing Strategy Decisions:**

1.**60/30/10 Test Distribution:**

-**Why:** Aligns with testing pyramid best practices

- Unit tests are fast (milliseconds) and provide quick feedback
- Integration tests catch API contract violations
- E2E tests verify critical user flows but are slowest

2.**Supertest for API Testing:**

-**Why:** Industry standard for Node.js API testing

- Tests actual HTTP layer (not just business logic)
- Validates request/response formats and status codes

3.**In-memory Test Database:**

-**Alternative:** Use Docker PostgreSQL for tests

-**Trade-off:** Docker is more realistic but slower

-**Decision:** Use real PostgreSQL in CI, in-memory for local (speed)

4.**Test Isolation:**

- Each test cleans database before running
- No shared state between tests
- Tests can run in any order or parallel

5.**Coverage Thresholds:**

- 80% line coverage enforced
- Excludes DTOs, interfaces, and module files
- Balance between quality and development velocity

6.**Mock External Services:**

- UserService calls mocked in TripService tests
- Prevents cascading test failures
- Tests service in isolation

7.**Phase 2 Testing:**

-**Scalability:** Add k6 load tests

-**Reliability:** Add chaos testing

-**Security:** Add OWASP ZAP security scans

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Coding Standards)

2.**Expand or Contract for Audience** - Adjust testing detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into testing strategy

4.**Critique and Refine** - Challenge testing approach

5.**Analyze Logical Flow and Dependencies** - Review test coherence

6.**Assess Alignment with Overall Goals** - Verify testing coverage

7.**Identify Potential Risks and Unforeseen Issues** - Testing risks?

8.**Challenge from Critical Perspective** - Devil's advocate on test distribution

9.**Tree of Thoughts Deep Dive** - Explore alternative testing strategies

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Coding Standards section.

---
