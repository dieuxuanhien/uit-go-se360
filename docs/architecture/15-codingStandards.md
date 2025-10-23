## **SECTION 15: CODING STANDARDS**

Defining **minimal but critical** standards for AI agents and developers. Focus only on project-specific rules that prevent common mistakes.

### **15.1 Critical Backend Rules**

-**Type Safety:** Always use TypeScript strict mode - never use `any` type except for legitimate third-party integration edge cases. Use `unknown` and type guards instead.

-**Prisma Generated Types:** Always use Prisma-generated types for database models - never manually define duplicates. Import from `@prisma/client`.

-**Environment Variables:** Access only through config modules, never `process.env` directly in business logic. Centralize in `config/` directory with validation.

-**Error Handling:** All API routes must use centralized error handler middleware. Throw standard exceptions (`BadRequestException`, `NotFoundException`, etc.) - never return raw errors.

-**Async/Await:** Always use `async/await` for asynchronous operations - never use raw Promises with `.then()/.catch()` in application code.

-**Database Transactions:** Use Prisma transactions for multi-step operations that must be atomic. Wrap in try-catch and rollback on error.

-**Secret Management:** Never hardcode credentials, API keys, or secrets. Use AWS Secrets Manager in production, `.env` files in development (gitignored).

-**Input Validation:** All API endpoints must validate inputs using class-validator DTOs. Never trust client data.

-**SQL Injection Prevention:** Always use Prisma parameterized queries - never construct raw SQL with string concatenation.

-**Password Security:** Always hash passwords with bcrypt before storage. Never log or expose password hashes in API responses.

-**JWT Token Verification:** Always verify JWT signature and expiration before trusting token claims. Use Passport JWT strategy.

-**CORS Configuration:** Explicitly whitelist allowed origins - never use `*` wildcard in production.

-**Logging Sensitive Data:** Never log passwords, tokens, or PII (email, phone) in plain text. Redact before logging.

-**Redis Key Naming:** Follow consistent pattern: `entity:action:id` (e.g., `driver:location:${driverId}`). Document all key patterns.

-**HTTP Status Codes:** Use correct status codes: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 500 (Internal Error).

-**Response Format:** Always return consistent JSON structure - use DTOs for responses, never expose database models directly.

-**Null Safety:** Handle nullable fields explicitly - use optional chaining (`?.`) and nullish coalescing (`??`) operators.

-**Dependency Injection:** Use NestJS dependency injection for all services - never instantiate services with `new` in controllers.

-**Module Boundaries:** Services must communicate via APIs - no direct database access across service boundaries (enforces microservices isolation).

-**Health Check:** Every service must expose `/health` endpoint returning `{ status: 'healthy', timestamp, service, version }`.

---

### **15.2 Naming Conventions**

| Element                         | Convention                         | Example                                                     |

| ------------------------------- | ---------------------------------- | ----------------------------------------------------------- |

| **Controllers**           | PascalCase +`Controller` suffix  | `AuthController`, `TripsController`                     |

| **Services**              | PascalCase +`Service` suffix     | `AuthService`, `FareCalculatorService`                  |

| **Repositories**          | PascalCase +`Repository` suffix  | `UsersRepository`, `TripsRepository`                    |

| **DTOs**                  | PascalCase +`Dto` suffix         | `CreateTripDto`, `LoginRequestDto`                      |

| **Interfaces**            | PascalCase (no prefix)             | `User`, `Trip`, `DriverLocation`                      |

| **Enums**                 | PascalCase, UPPERCASE values       | `UserRole { PASSENGER, DRIVER }`                          |

| **Files**                 | kebab-case                         | `auth.controller.ts`, `trip-state-machine.ts`           |

| **Directories**           | kebab-case                         | `driver-profiles/`, `common/`                           |

| **Functions**             | camelCase                          | `calculateFare()`, `hashPassword()`                     |

| **Variables**             | camelCase                          | `accessToken`, `userId`, `pickupLatitude`             |

| **Constants**             | SCREAMING_SNAKE_CASE               | `JWT_SECRET`, `BASE_FARE_CENTS`, `MAX_RETRY_ATTEMPTS` |

| **Private Properties**    | camelCase with `private` keyword | `private readonly prisma: PrismaService`                  |

| **Environment Variables** | SCREAMING_SNAKE_CASE               | `DATABASE_URL`, `JWT_SECRET`, `AWS_REGION`            |

| **API Endpoints**         | kebab-case                         | `/users/driver-profile`, `/trips/{id}/accept`           |

| **Database Tables**       | snake_case                         | `users`, `driver_profiles`, `trip_state_changes`      |

| **Database Columns**      | snake_case                         | `password_hash`, `pickup_latitude`, `created_at`      |

| **Redis Keys**            | colon-separated                    | `driver:location:${id}`, `driver:geo`                   |

| **Git Branches**          | kebab-case with type prefix        | `feature/trip-cancellation`, `fix/auth-token-expiry`    |

| **Git Commits**           | Conventional Commits format        | `feat(trip): add cancellation fee logic`                  |

---

### **15.3 Code Style Examples**

**Controller Example:**

```typescript

// ✅ GOOD: Proper controller structure

@Controller('trips')

@UseGuards(JwtAuthGuard)

exportclassTripsController {

constructor(privatereadonlytripsService: TripsService) {}


  @Post()

  @UseGuards(RolesGuard)

  @Roles('PASSENGER')

asynccreateTrip(

    @CurrentUser() user: User,

    @Body() createTripDto: CreateTripDto,

  ): Promise<TripDto> {

returnthis.tripsService.createTrip(user.id, createTripDto);

  }


  @Get(':id')

asyncgetTrip(@Param('id') id: string): Promise<TripDto> {

returnthis.tripsService.findById(id);

  }

}


// ❌ BAD: Missing guards, validation, types

@Controller('trips')

exportclassTripsController {

constructor(privatetripsService) {} // Missing type


  @Post()

asynccreateTrip(@Body() body) { // No validation DTO

returnthis.tripsService.createTrip(body); // No user context

  }

}

```

**Service Example:**

```typescript

// ✅ GOOD: Proper service with error handling

@Injectable()

exportclassTripsService {

constructor(

privatereadonlytripsRepository: TripsRepository,

privatereadonlyfareCalculator: FareCalculatorService,

privatereadonlylogger: Logger,

  ) {}


asynccreateTrip(passengerId: string, dto: CreateTripDto): Promise<TripDto> {

try {

// Calculate distance and fare

constdistance = this.fareCalculator.calculateDistance(

dto.pickupLatitude,

dto.pickupLongitude,

dto.destinationLatitude,

dto.destinationLongitude,

      );


constestimatedFare = this.fareCalculator.calculateEstimatedFare(distance);


// Create trip

consttrip = awaitthis.tripsRepository.create({

passengerId,

        ...dto,

estimatedDistance:distance,

estimatedFare,

status:TripStatus.REQUESTED,

      });


this.logger.log(`Trip created: ${trip.id}`, { passengerId, distance });


returnthis.mapToDto(trip);

    } catch (error) {

this.logger.error('Failed to create trip', { passengerId, error });

thrownewInternalServerErrorException('Failed to create trip');

    }

  }


privatemapToDto(trip: Trip): TripDto {

// Transform database model to DTO

return {

id:trip.id,

passengerId:trip.passengerId,

driverId:trip.driverId,

status:trip.status,

// ... map all fields

    };

  }

}


// ❌ BAD: No error handling, no logging, exposes database model

@Injectable()

exportclassTripsService {

asynccreateTrip(data) {

consttrip = awaitthis.prisma.trip.create({ data }); // Direct Prisma call

returntrip; // Returns database model directly

  }

}

```

**DTO Example:**

```typescript

// ✅ GOOD: Properly validated DTO

exportclassCreateTripDto {

  @IsNumber()

  @Min(-90)

  @Max(90)

  @ApiProperty({ example:10.762622, description:'Pickup latitude' })

pickupLatitude: number;


  @IsNumber()

  @Min(-180)

  @Max(180)

  @ApiProperty({ example:106.660172, description:'Pickup longitude' })

pickupLongitude: number;


  @IsString()

  @IsNotEmpty()

  @MaxLength(500)

  @ApiProperty({ example:'District 1, Ho Chi Minh City' })

pickupAddress: string;


  @IsNumber()

  @Min(-90)

  @Max(90)

  @ApiProperty({ example:10.823099 })

destinationLatitude: number;


  @IsNumber()

  @Min(-180)

  @Max(180)

  @ApiProperty({ example:106.629662 })

destinationLongitude: number;


  @IsString()

  @IsNotEmpty()

  @MaxLength(500)

  @ApiProperty({ example:'Tan Binh District, Ho Chi Minh City' })

destinationAddress: string;

}


// ❌ BAD: No validation

exportclassCreateTripDto {

pickupLatitude: number; // No validation

pickupLongitude: number;

pickupAddress: string;

// ... missing fields

}

```

**Error Handling Example:**

```typescript

// ✅ GOOD: Proper error handling

asyncacceptTrip(tripId: string, driverId: string): Promise<TripDto> {

  const trip = awaitthis.tripsRepository.findById(tripId);


if (!trip) {

thrownewNotFoundException(`Trip ${tripId} not found`);

  }


if (trip.status !== TripStatus.REQUESTED) {

thrownewBadRequestException(

`Trip cannot be accepted in ${trip.status} state`,

    );

  }


if (trip.driverId) {

thrownewConflictException('Trip already assigned to another driver');

  }


// Update trip

  const updatedTrip = awaitthis.tripsRepository.update(tripId, {

driverId,

status:TripStatus.DRIVER_ASSIGNED,

driverAssignedAt:newDate(),

  });


  return this.mapToDto(updatedTrip);

}


// ❌ BAD: No error handling, allows invalid state transitions

asyncacceptTrip(tripId: string, driverId: string) {

consttrip = awaitthis.prisma.trip.update({

where: { id:tripId },

data: { driverId, status:'DRIVER_ASSIGNED' }, // No validation

  });

returntrip;

}

```

**Environment Configuration Example:**

```typescript

// ✅ GOOD: Centralized config with validation

// config/database.config.ts

import { registerAs } from'@nestjs/config';

import*asJoifrom'joi';


exportconstdatabaseConfigValidationSchema = {

DATABASE_URL:Joi.string().required(),

};


exportdefaultregisterAs('database', () => ({

url:process.env.DATABASE_URL,

maxConnections:parseInt(process.env.DB_MAX_CONNECTIONS ?? '10', 10),

timeout:parseInt(process.env.DB_TIMEOUT ?? '20000', 10),

}));


// Usage in service

@Injectable()

exportclassUsersRepository {

constructor(

    @Inject('database') privateconfig: ConfigType<typeofdatabaseConfig>,

privateprisma: PrismaService,

  ) {}

}


// ❌ BAD: Direct process.env access

@Injectable()

exportclassUsersRepository {

privatedbUrl = process.env.DATABASE_URL; // No validation, scattered access

}

```

**Logging Example:**

```typescript

// ✅ GOOD: Structured logging with context

this.logger.log('Trip created', {

tripId:trip.id,

passengerId:trip.passengerId,

estimatedFare:trip.estimatedFare,

timestamp:newDate().toISOString(),

});


this.logger.error('Failed to update driver location', {

driverId,

error:error.message,

stack:error.stack,

});


// ❌ BAD: Unstructured logging, exposes sensitive data

console.log(`Creating trip for ${user.email} with password ${user.password}`);

```

---

### **15.4 Git Commit Convention**

**Conventional Commits Format:**

```

<type>(<scope>): <subject>


<body>


<footer>

```

**Types:**

-`feat`: New feature

-`fix`: Bug fix

- docs: Documentation changes

-`style`: Code style changes (formatting, no logic change)

-`refactor`: Code refactoring (no feature or bug fix)

-`perf`: Performance improvements

-`test`: Adding or updating tests

-`chore`: Build process, dependencies, tooling

**Examples:**

```bash

# Feature

feat(trip): add cancellation fee calculation


# Bug fix

fix(auth): resolve JWT token expiration bug


# Documentation

docs(readme): update deployment instructions


# Breaking change

feat(api)!:changetripstatusenumvalues


BREAKINGCHANGE:Tripstatus'PENDING'renamedto'REQUESTED'

```

---

### **15.5 Code Review Checklist**

**Before Submitting PR:**

- [ ] All tests pass (`pnpm test`)
- [ ] Code is linted (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] No console.log statements in production code
- [ ] No commented-out code
- [ ] Environment variables documented in `.env.example`
- [ ] API changes documented in OpenAPI spec
- [ ] Database migrations created if schema changed
- [ ] Error handling added for all async operations
- [ ] Input validation added for all API endpoints
- [ ] Sensitive data not logged or exposed
- [ ] Code follows naming conventions
- [ ] Tests added for new functionality
- [ ] PR description explains what/why/how

**Reviewer Checklist:**

- [ ] Code follows project conventions
- [ ] Business logic is correct
- [ ] Error handling is comprehensive
- [ ] Security best practices followed
- [ ] Performance considerations addressed
- [ ] Tests cover edge cases
- [ ] Database queries are optimized
- [ ] No breaking changes without justification

---

### **Detailed Rationale:**

**Coding Standards Decisions:**

1.**Minimal Rules Philosophy:**

-**Why:** Too many rules slow down development

-**Focus:** Only project-specific rules that prevent bugs

-**Omit:** General TypeScript/JavaScript best practices (assume known)

2.**TypeScript Strict Mode:**

-**Why:** Catches type errors at compile time

-**Trade-off:** More verbose, but prevents runtime errors

-**Benefit:** AI agents generate safer code

3.**Centralized Config:**

-**Why:** Single place to change environment variables

-**Why:** Validation catches misconfiguration early

-**Alternative:** Scattered `process.env` calls (error-prone)

4.**Conventional Commits:**

-**Why:** Enables automated changelog generation

-**Why:** Clear commit history for code archaeology

-**Tools:** Can use `commitlint` to enforce

5.**Naming Consistency:**

-**Why:** Reduces cognitive load

-**Why:** Easier for AI agents to generate correct code

-**Example:** Always `Service` suffix, never `Manager` or `Helper`

6.**DTO Response Mapping:**

-**Why:** Never expose database models directly

-**Why:** Control what fields are returned (no password hashes)

-**Pattern:**`mapToDto()` method in every service

7.**Structured Logging:**

-**Why:** Machine-readable logs for CloudWatch Insights

-**Why:** Easier debugging with context

-**Format:** JSON with timestamp, requestId, userId

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Error Handling Strategy)

2.**Expand or Contract for Audience** - Adjust coding standards detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into standards

4.**Critique and Refine** - Challenge these conventions

5.**Analyze Logical Flow and Dependencies** - Review standards coherence

6.**Assess Alignment with Overall Goals** - Verify practicality

7.**Identify Potential Risks and Unforeseen Issues** - Standards risks?

8.**Challenge from Critical Perspective** - Are these too strict/lenient?

9.**Tree of Thoughts Deep Dive** - Explore alternative conventions

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Error Handling Strategy section.

---
