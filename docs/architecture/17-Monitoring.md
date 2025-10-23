## **SECTION 17: MONITORING AND OBSERVABILITY**

Defining monitoring strategy for the UIT-Go backend system.

### **17.1 Monitoring Stack**

**Phase 1 (MVP) Monitoring:**

-**Backend Monitoring:** AWS CloudWatch Metrics + Logs

-**Error Tracking:** CloudWatch Logs Insights with structured JSON logs

-**Performance Monitoring:** CloudWatch custom metrics for API latency

-**Infrastructure Monitoring:** CloudWatch dashboards for ECS, RDS, ElastiCache

**Phase 2 (Optional Enhancements):**

-**Distributed Tracing:** AWS X-Ray (if pursuing Observability module)

-**APM:** Application Performance Monitoring with detailed spans

-**Real-time Dashboards:** Grafana with CloudWatch data source

-**Alerting:** SNS + Lambda for custom alert routing

---

### **17.2 Key Metrics**

**Application Metrics:**

| Metric Category           | Metric Name                        | Description                   | Target                  |

| ------------------------- | ---------------------------------- | ----------------------------- | ----------------------- |

| **API Performance** | `api.request.duration`           | Response time (p50, p95, p99) | p95 < 300ms             |

|                           | `api.request.count`              | Total requests per endpoint   | -                       |

|                           | `api.error.count`                | Error count by status code    | < 1% error rate         |

| **Authentication**  | `auth.login.success`             | Successful logins             | -                       |

|                           | `auth.login.failure`             | Failed login attempts         | -                       |

|                           | `auth.token.validation.failure`  | Invalid token count           | -                       |

| **Trip Operations** | `trip.created.count`             | Trips created                 | -                       |

|                           | `trip.acceptance.time`           | Time to driver acceptance     | < 60s median            |

|                           | `trip.completed.count`           | Trips completed               | -                       |

|                           | `trip.cancelled.count`           | Trips cancelled               | < 10% cancellation rate |

| **Driver Location** | `driver.location.update.count`   | Location updates per minute   | -                       |

|                           | `driver.location.update.latency` | Redis write latency           | < 10ms p95              |

|                           | `driver.search.latency`          | GEORADIUS query time          | < 50ms p95              |

|                           | `driver.online.count`            | Active online drivers         | -                       |

| **Database**        | `db.query.duration`              | Database query time           | < 100ms p95             |

|                           | `db.connection.count`            | Active connections            | < 80% pool              |

|                           | `db.error.count`                 | Database errors               | -                       |

**Infrastructure Metrics (AWS CloudWatch):**

| Service               | Metrics                                                        | Alerts                      |

| --------------------- | -------------------------------------------------------------- | --------------------------- |

| **ECS Fargate** | CPUUtilization, MemoryUtilization, RunningTaskCount            | CPU > 80%, Memory > 90%     |

| **ALB**         | TargetResponseTime, HTTPCode_Target_5XX_Count, RequestCount    | 5XX > 10/5min               |

| **RDS**         | CPUUtilization, DatabaseConnections, ReadLatency, WriteLatency | CPU > 80%, Connections > 90 |

| **ElastiCache** | CPUUtilization, CurrConnections, Evictions, CacheHits          | Evictions > 100/min         |

---

### **17.3 Logging Strategy**

**Structured JSON Logging:**

```typescript

// common/logger/winston-logger.ts

import*aswinstonfrom'winston';


constlogger = winston.createLogger({

level:process.env.LOG_LEVEL || 'info',

format:winston.format.combine(

winston.format.timestamp(),

winston.format.errors({ stack:true }),

winston.format.json(),

  ),

defaultMeta: {

service:process.env.SERVICE_NAME || 'unknown-service',

environment:process.env.NODE_ENV || 'development',

version:process.env.APP_VERSION || '1.0.0',

  },

transports: [

// CloudWatch in production, console in development

process.env.NODE_ENV === 'production'

      ? newwinston.transports.Console() // ECS sends stdout to CloudWatch

      : newwinston.transports.Console({

format:winston.format.combine(

winston.format.colorize(),

winston.format.simple(),

          ),

        }),

  ],

});


exportdefaultlogger;

```

**Log Levels:**

-**ERROR:** Application errors, exceptions (5XX)

-**WARN:** Client errors (4XX), deprecated API usage

-**INFO:** Significant events (trip created, driver assigned)

-**DEBUG:** Detailed debugging information (development only)

**Example Logs:**

```json

// Trip created

{

"level": "info",

"message": "Trip created",

"timestamp": "2025-10-20T10:30:00.000Z",

"service": "trip-service",

"environment": "production",

"version": "1.0.0",

"context": {

"tripId": "trip-abc123",

"passengerId": "user-def456",

"estimatedFare": 2300,

"estimatedDistance": 8.5,

"requestId": "req-xyz789"

  }

}


// Error log

{

"level": "error",

"message": "Failed to update driver location",

"timestamp": "2025-10-20T10:35:00.000Z",

"service": "driver-service",

"environment": "production",

"version": "1.0.0",

"context": {

"driverId": "driver-ghi012",

"error": "Redis connection timeout",

"requestId": "req-abc456"

  },

"stack": "Error: Redis connection timeout\n    at ..."

}

```

**CloudWatch Logs Insights Queries:**

```sql

-- Find all errors in last hour

fields @timestamp, service, message, context.error

| filterlevel = "error"

| sort @timestamp desc

| limit100


-- Track trip creation rate

fields @timestamp

| filtermessage = "Trip created"

| stats count() as trip_count by bin(5m)


-- Find slow API requests (> 1 second)

fields @timestamp, context.method, context.path, context.duration

| filter context.duration > 1000

| sort context.duration desc


-- Track failed login attempts

fields @timestamp, context.email

| filtermessage = "Login failed"

| stats count() by context.email

| sort countdesc


-- Monitor driver location update rate

fields @timestamp

| filtermessage = "Driver location updated"

| stats count() as updates by bin(1m)

```

---

### **17.4 CloudWatch Dashboard**

**Terraform Dashboard Definition:**

```hcl

resource "aws_cloudwatch_dashboard" "uitgo_dashboard" {

  dashboard_name = "UIT-Go-${var.environment}"


  dashboard_body = jsonencode({

    widgets = [

      # ALB Metrics

      {

        type = "metric"

        properties = {

          metrics = [

            ["AWS/ApplicationELB", "RequestCount", { stat = "Sum", label = "Total Requests" }],

            [".", "HTTPCode_Target_2XX_Count", { stat = "Sum", label = "2XX Responses" }],

            [".", "HTTPCode_Target_4XX_Count", { stat = "Sum", label = "4XX Errors" }],

            [".", "HTTPCode_Target_5XX_Count", { stat = "Sum", label = "5XX Errors" }],

          ]

          period = 300

          stat   = "Sum"

          region = var.aws_region

          title  = "ALB Request Metrics"

        }

      },


      # ECS Service Metrics

      {

        type = "metric"

        properties = {

          metrics = [

            ["AWS/ECS", "CPUUtilization", { service = "uitgo-user-service", label = "UserService CPU" }],

            [".", ".", { service = "uitgo-trip-service", label = "TripService CPU" }],

            [".", ".", { service = "uitgo-driver-service", label = "DriverService CPU" }],

          ]

          period = 300

          stat   = "Average"

          region = var.aws_region

          title  = "ECS CPU Utilization"

        }

      },


      # RDS Database Metrics

      {

        type = "metric"

        properties = {

          metrics = [

            ["AWS/RDS", "CPUUtilization", { dbinstance = "uitgo-user-db" }],

            [".", "DatabaseConnections", { dbinstance = "uitgo-user-db" }],

            [".", "ReadLatency", { dbinstance = "uitgo-user-db" }],

          ]

          period = 300

          stat   = "Average"

          region = var.aws_region

          title  = "RDS User Database"

        }

      },


      # ElastiCache Redis Metrics

      {

        type = "metric"

        properties = {

          metrics = [

            ["AWS/ElastiCache", "CPUUtilization", { cachecluster = "uitgo-redis" }],

            [".", "CurrConnections", { cachecluster = "uitgo-redis" }],

            [".", "CacheHits", { cachecluster = "uitgo-redis" }],

            [".", "CacheMisses", { cachecluster = "uitgo-redis" }],

          ]

          period = 300

          stat   = "Average"

          region = var.aws_region

          title  = "ElastiCache Redis"

        }

      },


      # Custom Application Metrics

      {

        type = "metric"

        properties = {

          metrics = [

            ["UIT-Go/Application", "TripCreated", { stat = "Sum", label = "Trips Created" }],

            [".", "TripCompleted", { stat = "Sum", label = "Trips Completed" }],

            [".", "DriverOnline", { stat = "Sum", label = "Online Drivers" }],

          ]

          period = 300

          stat   = "Sum"

          region = var.aws_region

          title  = "Application Business Metrics"

        }

      },

    ]

  })

}

```

---

### **17.5 Alerting**

**SNS Topic for Alerts:**

```hcl

resource "aws_sns_topic" "alerts" {

  name = "uitgo-alerts-${var.environment}"

}


resource "aws_sns_topic_subscription" "alerts_email" {

  topic_arn = aws_sns_topic.alerts.arn

  protocol  = "email"

  endpoint  = var.alert_email

}

```

**CloudWatch Alarms:**

```hcl

# High 5XX error rate

resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {

  alarm_name          = "uitgo-alb-5xx-errors-${var.environment}"

  comparison_operator = "GreaterThanThreshold"

  evaluation_periods  = "2"

  metric_name         = "HTTPCode_Target_5XX_Count"

  namespace           = "AWS/ApplicationELB"

  period              = "300"

  statistic           = "Sum"

  threshold           = "10"

  alarm_description   = "Alert when 5XX errors exceed 10 in 5 minutes"

  alarm_actions       = [aws_sns_topic.alerts.arn]


  dimensions = {

    LoadBalancer = aws_lb.main.arn_suffix

  }

}


# High ECS CPU utilization

resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu" {

  alarm_name          = "uitgo-ecs-high-cpu-${var.environment}"

  comparison_operator = "GreaterThanThreshold"

  evaluation_periods  = "2"

  metric_name         = "CPUUtilization"

  namespace           = "AWS/ECS"

  period              = "300"

  statistic           = "Average"

  threshold           = "80"

  alarm_description   = "Alert when ECS CPU exceeds 80%"

  alarm_actions       = [aws_sns_topic.alerts.arn]


  dimensions = {

    ServiceName = aws_ecs_service.user_service.name

    ClusterName = aws_ecs_cluster.main.name

  }

}


# RDS high connection count

resource "aws_cloudwatch_metric_alarm" "rds_high_connections" {

  alarm_name          = "uitgo-rds-high-connections-${var.environment}"

  comparison_operator = "GreaterThanThreshold"

  evaluation_periods  = "2"

  metric_name         = "DatabaseConnections"

  namespace           = "AWS/RDS"

  period              = "300"

  statistic           = "Average"

  threshold           = "90"

  alarm_description   = "Alert when database connections exceed 90"

  alarm_actions       = [aws_sns_topic.alerts.arn]


  dimensions = {

    DBInstanceIdentifier = aws_db_instance.user_db.id

  }

}


# ElastiCache high eviction rate

resource "aws_cloudwatch_metric_alarm" "redis_high_evictions" {

  alarm_name          = "uitgo-redis-evictions-${var.environment}"

  comparison_operator = "GreaterThanThreshold"

  evaluation_periods  = "2"

  metric_name         = "Evictions"

  namespace           = "AWS/ElastiCache"

  period              = "300"

  statistic           = "Sum"

  threshold           = "100"

  alarm_description   = "Alert when Redis evictions exceed 100 in 5 minutes"

  alarm_actions       = [aws_sns_topic.alerts.arn]


  dimensions = {

    CacheClusterId = aws_elasticache_cluster.redis.id

  }

}

```

---

### **17.6 Health Checks**

**Service Health Check Endpoint:**

```typescript

// health/health.controller.ts

import { Controller, Get } from'@nestjs/common';

import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from'@nestjs/terminus';

import { PrismaService } from'../prisma/prisma.service';


@Controller('health')

exportclassHealthController {

constructor(

privatehealth: HealthCheckService,

privateprismaHealth: PrismaHealthIndicator,

privateprisma: PrismaService,

  ) {}


  @Get()

  @HealthCheck()

check() {

returnthis.health.check([

// Database health

      () =>this.prismaHealth.pingCheck('database', this.prisma),


// Service metadata

      () => ({

service: {

status:'up',

name:process.env.SERVICE_NAME,

version:process.env.APP_VERSION || '1.0.0',

environment:process.env.NODE_ENV,

timestamp:newDate().toISOString(),

        },

      }),

    ]);

  }


  @Get('ready')

ready() {

// Kubernetes-style readiness probe

return {

status:'ready',

timestamp:newDate().toISOString(),

    };

  }


  @Get('live')

live() {

// Kubernetes-style liveness probe

return {

status:'alive',

timestamp:newDate().toISOString(),

    };

  }

}

```

**ALB Health Check Configuration:**

```hcl

resource "aws_lb_target_group" "user_service" {

  name        = "uitgo-user-service-${var.environment}"

  port        = 3001

  protocol    = "HTTP"

  vpc_id      = aws_vpc.main.id

  target_type = "ip"


  health_check {

    enabled             = true

    healthy_threshold   = 2

    unhealthy_threshold = 3

    timeout             = 5

    interval            = 30

    path                = "/health"

    matcher             = "200"

    protocol            = "HTTP"

  }


  deregistration_delay = 30

}

```

---

### **17.7 Performance Monitoring**

**Custom Metrics Tracking:**

```typescript

// common/interceptors/metrics.interceptor.ts

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from'@nestjs/common';

import { Observable } from'rxjs';

import { tap } from'rxjs/operators';

import { CloudWatchClient, PutMetricDataCommand } from'@aws-sdk/client-cloudwatch';


@Injectable()

exportclassMetricsInterceptorimplementsNestInterceptor {

privatecloudwatch: CloudWatchClient;


constructor() {

if (process.env.NODE_ENV === 'production') {

this.cloudwatch = newCloudWatchClient({ region:'us-east-1' });

    }

  }


intercept(context: ExecutionContext, next: CallHandler): Observable<any> {

conststart = Date.now();

constrequest = context.switchToHttp().getRequest();

const { method, url } = request;


returnnext.handle().pipe(

tap(() => {

constduration = Date.now() - start;

constresponse = context.switchToHttp().getResponse();


// Send metrics to CloudWatch in production

if (this.cloudwatch) {

this.sendMetrics(method, url, response.statusCode, duration);

        }

      }),

    );

  }


privateasyncsendMetrics(

method: string,

url: string,

statusCode: number,

duration: number,

  ) {

try {

awaitthis.cloudwatch.send(

newPutMetricDataCommand({

Namespace:'UIT-Go/Application',

MetricData: [

            {

MetricName:'APIRequestDuration',

Value:duration,

Unit:'Milliseconds',

Dimensions: [

                { Name:'Method', Value:method },

                { Name:'Endpoint', Value:this.normalizeEndpoint(url) },

                { Name:'StatusCode', Value:statusCode.toString() },

              ],

Timestamp:newDate(),

            },

            {

MetricName:'APIRequestCount',

Value:1,

Unit:'Count',

Dimensions: [

                { Name:'Method', Value:method },

                { Name:'Endpoint', Value:this.normalizeEndpoint(url) },

                { Name:'StatusCode', Value:statusCode.toString() },

              ],

Timestamp:newDate(),

            },

          ],

        }),

      );

    } catch (error) {

// Don't fail request if metrics fail

console.error('Failed to send metrics', error);

    }

  }


privatenormalizeEndpoint(url: string): string {

// Replace IDs with placeholders for grouping

returnurl.replace(/\/[0-9a-f-]{36}/g, '/:id');

  }

}

```

---

### **Detailed Rationale:**

**Monitoring Design Decisions:**

1.**CloudWatch-First Approach:**

-**Why:** Native AWS integration, no additional services

-**Cost:** Included in AWS costs, predictable pricing

-**Trade-off:** Less feature-rich than Datadog/New Relic, but sufficient for MVP

2.**Structured JSON Logging:**

-**Why:** Machine-readable, queryable with CloudWatch Logs Insights

-**Pattern:** Consistent log format across all services

-**Benefit:** Easy correlation with requestId

3.**Custom Metrics:**

-**Why:** Track business metrics (trips created, drivers online)

-**How:** Send to CloudWatch using AWS SDK

-**Async:** Don't block requests, fail silently if metrics fail

4.**Health Check Strategy:**

-`/health`: Comprehensive check (database, dependencies)

-`/ready`: Readiness probe for load balancer

-`/live`: Liveness probe for container orchestration

5.**Alert Thresholds:**

- Conservative thresholds for MVP (avoid alert fatigue)
- 5XX > 10 in 5 minutes (not 1 error = alert)
- CPU > 80% for 10 minutes (not brief spikes)

6.**Dashboard Design:**

- Single dashboard per environment
- Focus on actionable metrics
- Grouped by service and infrastructure

7.**Phase 2 Enhancements:**

-**X-Ray:** Distributed tracing for complex flows

-**Grafana:** Custom dashboards with better visualization

-**PagerDuty:** On-call rotation and incident management

---
