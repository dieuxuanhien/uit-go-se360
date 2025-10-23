## **SECTION 13: SECURITY AND PERFORMANCE**

Defining security and performance considerations for the UIT-Go backend system.

### **13.1 Security Requirements**

**Backend Security:**

**Authentication & Authorization:**

-**JWT Token Security:**

- HS256 algorithm with strong secret (256-bit minimum)
- Token expiration: 7 days (configurable)
- Payload includes: userId, role, issued timestamp
- No sensitive data in payload (tokens are base64-encoded, not encrypted)

-**Password Security:**

- bcrypt hashing with salt rounds = 10
- Minimum 8 characters, complexity requirements enforced client-side
- Passwords never logged or exposed in responses
- Hash comparison using constant-time algorithm (bcrypt.compare)

-**Role-Based Access Control (RBAC):**

```typescript

// Guard implementation

@UseGuards(JwtAuthGuard, RolesGuard)

@Roles('PASSENGER')

@Post('/trips')

createTrip() { ... }


@UseGuards(JwtAuthGuard, RolesGuard)

@Roles('DRIVER')

@Put('/drivers/location')

updateLocation() { ... }

```

**Input Validation:**

-**Request DTO Validation:**

```typescript

// class-validator decorators

exportclassCreateTripDto {

@IsNumber()

@Min(-90)

@Max(90)

pickupLatitude: number;


@IsNumber()

@Min(-180)

@Max(180)

pickupLongitude: number;


@IsString()

@IsNotEmpty()

@MaxLength(500)

pickupAddress: string;

}

```

-**SQL Injection Prevention:**

- Prisma ORM uses parameterized queries
- Never construct raw SQL with user input
- Example: `prisma.user.findUnique({ where: { email } })` is safe

-**NoSQL Injection Prevention:**

- Redis commands use ioredis parameterized methods
- Sanitize driver IDs before Redis operations

**CORS Policy:**

```typescript

// main.ts

app.enableCors({

origin:process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],

credentials:true,

methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],

allowedHeaders: ['Content-Type', 'Authorization'],

});

```

**Rate Limiting:**

```typescript

// Application-level rate limiting (NestJS Throttler)

import { ThrottlerModule } from'@nestjs/throttler';


@Module({

imports: [

ThrottlerModule.forRoot({

ttl:60,      // Time window in seconds

limit:100,   // Max requests per window

    }),

  ],

})

exportclassAppModule {}


// Endpoint-specific rate limiting

@Throttle(10, 60)  // 10 requests per minute

@Post('/users/login')

login() { ... }

```

**Security Headers:**

```typescript

// Helmet middleware

importhelmetfrom'helmet';


app.use(helmet({

contentSecurityPolicy: {

directives: {

defaultSrc: ["'self'"],

styleSrc: ["'self'", "'unsafe-inline'"],

    },

  },

hsts: {

maxAge:31536000,

includeSubDomains:true,

  },

}));

```

**Secrets Management:**

-**AWS Secrets Manager Integration:**

```typescript

// config/secrets.config.ts

import { SecretsManagerClient, GetSecretValueCommand } from'@aws-sdk/client-secrets-manager';


asyncfunctiongetSecret(secretName: string): Promise<string> {

constclient = newSecretsManagerClient({ region:'us-east-1' });

constresponse = awaitclient.send(

newGetSecretValueCommand({ SecretId:secretName })

);

returnresponse.SecretString;

}


// Usage

constdbPassword = awaitgetSecret('uitgo/dev/db-password');

```

-**Environment-specific secrets:**

- Development: `.env` file (gitignored)
- AWS: Secrets Manager + ECS task IAM roles
- No hardcoded credentials in code or Dockerfile

**Network Security:**

-**VPC Segmentation:**

- Public subnets: ALB only
- Private subnets: ECS tasks, RDS, ElastiCache
- No direct internet access to databases

-**Security Groups:**

```hcl

  # ALB security group - allow HTTPS from internet

  ingress {

    from_port   = 443

    to_port     = 443

    protocol    = "tcp"

    cidr_blocks = ["0.0.0.0/0"]

  }


  # ECS security group - allow traffic only from ALB

  ingress {

    from_port       = 3001

    to_port         = 3003

    protocol        = "tcp"

    security_groups = [aws_security_group.alb.id]

  }


  # RDS security group - allow only from ECS

  ingress {

    from_port       = 5432

    to_port         = 5432

    protocol        = "tcp"

    security_groups = [aws_security_group.ecs.id]

  }

```

**Data Encryption:**

-**At Rest:**

- RDS: AES-256 encryption enabled by default
- ElastiCache: Encryption at rest enabled
- EBS volumes: Encrypted
- S3 (if used): Server-side encryption (SSE-S3)

-**In Transit:**

- HTTPS/TLS 1.2+ for all external communication
- ALB terminates TLS, forwards HTTP to ECS (within VPC)
- Database connections over TLS (optional but recommended)

**Audit Logging:**

```typescript

// Logging interceptor

@Injectable()

exportclassAuditLogInterceptorimplementsNestInterceptor {

intercept(context: ExecutionContext, next: CallHandler): Observable<any> {

constrequest = context.switchToHttp().getRequest();

const { method, url, body, user } = request;


logger.info('API Request', {

method,

url,

userId:user?.id,

role:user?.role,

timestamp:newDate().toISOString(),

requestId:request.id,

    });


returnnext.handle();

  }

}

```

**Dependency Security:**

```bash

# Regular dependency audits

pnpmaudit


# Automated vulnerability scanning in CI

pnpmaudit--audit-level=high


# Dependabot for automated security updates (GitHub)

# .github/dependabot.yml

version:2

updates:

-package-ecosystem:"npm"

directory:"/"

schedule:

interval:"weekly"

open-pull-requests-limit:10

```

---

### **13.2 Performance Optimization**

**Backend Performance:**

**Response Time Targets:**

-**Authentication endpoints:** < 200ms (p95)

-**Trip creation:** < 300ms (p95)

-**Driver search (nearby):** < 100ms (p95)

-**Trip state updates:** < 150ms (p95)

-**Health checks:** < 50ms (p95)

**Database Optimization:**

**Connection Pooling:**

```typescript

// Prisma connection pooling

datasourcedb {

provider = "postgresql"

url      = env("DATABASE_URL")


// Connection pool configuration

connection_limit = 10

pool_timeout     = 20

}


// Runtime configuration

constprisma = newPrismaClient({

datasources: {

db: {

url:process.env.DATABASE_URL,

    },

  },

log: ['query', 'error', 'warn'],

});

```

**Query Optimization:**

-**Indexed queries:**

```sql

-- All foreign keys indexed

CREATE INDEX idx_trips_passenger_id ON trips(passenger_id);

CREATE INDEX idx_trips_driver_id ON trips(driver_id);


-- Composite indexes for common queries

CREATE INDEX idx_trips_passenger_status ON trips(passenger_id, status);


-- Partial indexes for filtered queries

CREATE INDEX idx_trips_completed ON trips(completed_at) 

WHERE completed_at ISNOTNULL;

```

-**N+1 query prevention:**

```typescript

// BAD: N+1 queries

consttrips = awaitprisma.trip.findMany();

for (consttripoftrips) {

trip.passenger = awaitprisma.user.findUnique({ 

where: { id:trip.passengerId } 

});

}


// GOOD: Single query with join

consttrips = awaitprisma.trip.findMany({

include: {

passenger:true,

driver:true,

},

});

```

-**Pagination:**

```typescript

// Offset-based pagination (simple)

consttrips = awaitprisma.trip.findMany({

skip: (page - 1) * limit,

take:limit,

orderBy: { createdAt:'desc' },

});


// Cursor-based pagination (better for large datasets - Phase 2)

consttrips = awaitprisma.trip.findMany({

take:limit,

cursor:lastTripId ? { id:lastTripId } : undefined,

orderBy: { createdAt:'desc' },

});

```

**Caching Strategy:**

**Redis Caching:**

```typescript

// Cache driver locations (already in Redis)

// TTL: 300 seconds


// Cache user profile lookups (optional optimization)

constcacheKey = `user:${userId}`;

constcached = awaitredis.get(cacheKey);


if (cached) {

returnJSON.parse(cached);

}


constuser = awaitprisma.user.findUnique({ where: { id:userId } });

awaitredis.setex(cacheKey, 300, JSON.stringify(user));

returnuser;


// Cache driver rating stats (materialized view)

// Refresh on rating insert

```

**Response Compression:**

```typescript

// Enable gzip compression

importcompressionfrom'compression';


app.use(compression({

filter: (req, res) => {

if (req.headers['x-no-compression']) {

returnfalse;

    }

returncompression.filter(req, res);

  },

level:6, // Compression level (1-9)

}));

```

**Async Processing:**

```typescript

// Non-blocking driver notification (Phase 2 enhancement)

// Use AWS SQS for async job processing


// BAD: Synchronous (blocks response)

awaitnotifyNearbyDrivers(tripId);

returntrip;


// GOOD: Async (immediate response)

awaitsqs.sendMessage({

QueueUrl:process.env.NOTIFICATION_QUEUE_URL,

MessageBody:JSON.stringify({ tripId, action:'notify_drivers' }),

});

returntrip; // Immediate response

```

**Load Balancing:**

-**ALB Configuration:**

- Algorithm: Round robin (default)
- Sticky sessions: Disabled (stateless services)
- Health checks: Every 30 seconds
- Deregistration delay: 30 seconds (graceful shutdown)

**Auto Scaling:**

```hcl

# ECS Auto Scaling (Terraform)

resource "aws_appautoscaling_target" "ecs_target" {

  max_capacity       = 4

  min_capacity       = 2

  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.user_service.name}"

  scalable_dimension = "ecs:service:DesiredCount"

  service_namespace  = "ecs"

}


resource "aws_appautoscaling_policy" "ecs_policy_cpu" {

  name               = "cpu-autoscaling"

  policy_type        = "TargetTrackingScaling"

  resource_id        = aws_appautoscaling_target.ecs_target.resource_id

  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension

  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace


  target_tracking_scaling_policy_configuration {

    predefined_metric_specification {

      predefined_metric_type = "ECSServiceAverageCPUUtilization"

    }

    target_value = 70.0 # Scale when CPU > 70%

  }

}

```

**Performance Monitoring:**

```typescript

// Custom metrics tracking

import { performance } from'perf_hooks';


@Injectable()

exportclassPerformanceInterceptorimplementsNestInterceptor {

intercept(context: ExecutionContext, next: CallHandler): Observable<any> {

conststart = performance.now();


returnnext.handle().pipe(

tap(() => {

constduration = performance.now() - start;

constrequest = context.switchToHttp().getRequest();


logger.info('Request completed', {

method:request.method,

url:request.url,

duration:`${duration.toFixed(2)}ms`,

statusCode:context.switchToHttp().getResponse().statusCode,

        });


// Send to CloudWatch custom metrics

if (duration > 1000) {

logger.warn('Slow request detected', { duration, url:request.url });

        }

      }),

    );

  }

}

```

**Database Performance:**

-**RDS Configuration:**

- Instance type: db.t3.small (2 vCPU, 2GB RAM) for production
- Storage: GP3 SSD (3000 IOPS baseline)
- Connection pooling: Max 100 connections
- Query timeout: 30 seconds

-**Query Performance:**

```sql

-- Enable query logging for slow queries

ALTER SYSTEMSET log_min_duration_statement = 1000; -- Log queries > 1s


-- Analyze query plans

EXPLAIN ANALYZE SELECT * FROM trips WHERE passenger_id = '...';

```

**Redis Performance:**

-**ElastiCache Configuration:**

- Node type: cache.t3.micro (2 vCPU, 0.5GB RAM) for dev
- Node type: cache.t3.small (2 vCPU, 1.5GB RAM) for production
- Eviction policy: `allkeys-lru` (Least Recently Used)
- Max memory: 1GB with eviction enabled

-**Geospatial Query Optimization:**

```typescript

// Efficient GEORADIUS query

constdrivers = awaitredis.georadius(

'driver:geo',

longitude,

latitude,

5,           // 5km radius

'km',

'WITHDIST',  // Include distance

'ASC',       // Nearest first

'COUNT', 10// Limit results

);

```

---

### **Detailed Rationale:**

**Security Design Decisions:**

1.**JWT vs Session-based Auth:**

-**Why JWT:** Stateless, scales horizontally, no session storage needed

-**Trade-off:** Cannot revoke tokens before expiration (acceptable for MVP)

-**Phase 2 enhancement:** Add token blacklist in Redis for revocation

2.**bcrypt vs Argon2:**

-**Why bcrypt:** Industry standard, well-tested, Node.js native support

-**Trade-off:** Argon2 is newer and more secure, but bcrypt is sufficient

3.**Rate Limiting Strategy:**

-**Application-level:** Simple, works in dev and prod

-**Alternative:** AWS WAF for DDoS protection (Phase 2 Security module)

-**Cost:** Application-level is free, WAF costs extra

4.**VPC Architecture:**

-**Public subnet:** Only ALB exposed to internet

-**Private subnet:** All application and data services

-**NAT Gateway:** For outbound internet (AWS SDK calls, package updates)

**Performance Design Decisions:**

1.**Caching Strategy:**

-**Driver locations:** Redis (required for geospatial queries)

-**User profiles:** Optional Redis cache (implement if needed)

-**Rating stats:** PostgreSQL materialized view (trade-off: insert overhead for read speed)

2.**Database Connection Pooling:**

-**Pool size:** 10 connections per service (sufficient for 2-4 ECS tasks)

-**Timeout:** 20 seconds (prevents connection exhaustion)

3.**Auto Scaling Triggers:**

-**CPU > 70%:** Scale out (add tasks)

-**CPU < 30% for 10 min:** Scale in (remove tasks)

-**Cooldown:** 5 minutes between scaling actions

4.**Response Time Targets:**

-**p95 not p99:** More realistic for academic project

-**Phase 2 Scalability:** Optimize to p99 < 500ms with load testing

5.**Compression:**

-**Level 6:** Balance between CPU usage and size reduction

-**Benefit:** ~70% size reduction for JSON responses

-**Trade-off:** Slight CPU overhead (acceptable)

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Testing Strategy)

2.**Expand or Contract for Audience** - Adjust security/performance detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into security choices

4.**Critique and Refine** - Challenge these security/performance decisions

5.**Analyze Logical Flow and Dependencies** - Review security coherence

6.**Assess Alignment with Overall Goals** - Verify requirements coverage

7.**Identify Potential Risks and Unforeseen Issues** - Security/performance risks?

8.**Challenge from Critical Perspective** - Devil's advocate on JWT auth

9.**Tree of Thoughts Deep Dive** - Explore alternative security patterns

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Testing Strategy section.

---
