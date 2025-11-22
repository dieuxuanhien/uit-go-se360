# ADR-006: Auto-Scaling Infrastructure with ECS Fargate

**Status:** ✅ Accepted  
**Date:** 2025-11-21  
**Decision Makers:** Architecture Team  
**Technical Story:** [gap-analysis.md](../architecture/gap-analysis.md)

## Context

The current architecture uses **fixed EC2 instances** with no auto-scaling. This causes two major problems:

### Current State Problems

**Over-Provisioning During Low Traffic:**

```
Night hours (11pm-6am): 10 req/sec average
- Provisioned: 3× t3.large instances = $182/month
- Utilized: ~5% CPU (massive waste)
- Wasted cost: $173/month (95% of capacity unused)
```

**Under-Provisioning During Peak Traffic:**

```
Rush hours (7-9am, 5-7pm): 200 req/sec peak
- Current capacity: 100 req/sec (3× t3.large)
- Gap: 100 req/sec → 50% requests fail
- Errors during peak: User churn, revenue loss
```

**Manual Scaling Process:**

- DevOps receives alert: "High CPU"
- Manually add EC2 instance: 10-15 minutes
- Rush hour over by the time instance ready
- **Problem:** Cannot react fast enough to traffic spikes

**Cost Inefficiency:**

- Provisioned for peak load (200 req/sec) 24/7
- Average load: 50 req/sec (4× over-provisioned)
- **Wasted cost:** $500/month on idle capacity

**Scalability Gap:**

- Current: Manual scaling to 3× instances (100 req/sec)
- Target: 100k users = 1,000 req/sec sustained, 5,000 req/sec burst
- **Gap: 50x scale needed, manual scaling impossible**

## Decision

**Migrate to AWS ECS Fargate with auto-scaling based on CPU, memory, and SQS queue depth metrics.**

### Architecture

```
┌──────────────────────────────────────────┐
│   CloudWatch Metrics                     │
│   - ECS CPU >70%   (scale out)          │
│   - ECS Memory >80% (scale out)          │
│   - SQS Queue Depth >1000 (scale out)   │
│   - ECS CPU <30%   (scale in)           │
└───────────┬──────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────┐
│   ECS Service Auto-Scaling Policy        │
│   Target: CPU 60%, Memory 70%            │
│   Min: 2 tasks, Max: 50 tasks           │
│   Scale out: +2 tasks (1 min cooldown)  │
│   Scale in: -1 task (5 min cooldown)    │
└───────────┬──────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────┐
│   ECS Fargate Cluster                    │
│   ┌────────┐  ┌────────┐  ┌────────┐    │
│   │ Task 1 │  │ Task 2 │  │ Task N │    │
│   │ 1vCPU  │  │ 1vCPU  │  │ 1vCPU  │    │
│   │ 2GB    │  │ 2GB    │  │ 2GB    │    │
│   └────────┘  └────────┘  └────────┘    │
│   (2-50 tasks scale dynamically)         │
└──────────────────────────────────────────┘
```

**Auto-Scaling Configuration:**

1. **Service-Level Auto-Scaling:**
   - **TripService:** Min 2, Max 50 tasks (1vCPU, 2GB each)
   - **DriverService:** Min 2, Max 30 tasks
   - **UserService:** Min 2, Max 20 tasks

2. **Scaling Triggers:**
   - **CPU Target:** 60% (scale out if >60%, scale in if <30%)
   - **Memory Target:** 70% (scale out if >70%, scale in if <40%)
   - **SQS Queue Depth:** >1000 messages (scale out TripService consumers)

3. **Scaling Speed:**
   - **Scale Out:** Add 2 tasks per scaling event, 1-minute cooldown
   - **Scale In:** Remove 1 task per scaling event, 5-minute cooldown
   - **Cold Start:** 30-60 seconds (Fargate task launch time)

4. **Cost Optimization:**
   - **Fargate Spot:** Use for 50% of tasks (70% cost savings)
   - **Graceful Termination:** 30s drain period before killing tasks

## Quantitative Analysis

### Performance Impact

| Metric             | Fixed EC2                 | Fargate Auto-Scale        | Improvement        |
| ------------------ | ------------------------- | ------------------------- | ------------------ |
| **Scale-Out Time** | 10-15 min (manual)        | 1-2 min (auto)            | **10x faster**     |
| **Peak Capacity**  | 100 req/sec (3 instances) | 5,000 req/sec (50 tasks)  | **50x more**       |
| **Scale-In Time**  | Never (manual only)       | 5 min (auto)              | Saves cost         |
| **Idle Capacity**  | 95% wasted (night hours)  | 10% wasted (min 2 tasks)  | **10x less waste** |
| **Burst Handling** | Fails at 100 req/sec      | Handles 5k req/sec spikes | **50x better**     |

**Traffic Pattern Analysis:**

```
Daily Traffic Pattern (100k users):
- Night (11pm-6am):   10 req/sec   (2 tasks,  $14/month)
- Morning (6am-11am): 50 req/sec   (5 tasks,  $35/month)
- Lunch (11am-2pm):  100 req/sec   (10 tasks, $70/month)
- Afternoon (2pm-5pm): 50 req/sec  (5 tasks,  $35/month)
- Rush (5pm-8pm):    200 req/sec   (20 tasks, $140/month)
- Evening (8pm-11pm): 30 req/sec   (3 tasks,  $21/month)

Average tasks running: 7.5 tasks/hour
Monthly cost: $525/month (vs $2,190/month fixed 22 tasks)
Savings: $1,665/month (76% reduction)
```

### Cost Analysis

**Current State (Fixed EC2 - 3× t3.large):**

```
EC2 Instances:
- 3× t3.large (2 vCPU, 8GB): $0.0832/hour × 3 × 730 hours = $182.21/month

Wasted capacity (night hours, 8 hours/day):
- 8 hours × 30 days × 3 instances × $0.0832/hour = $59.90/month wasted
- Utilization: 20% average (80% waste)

To scale for 100k users (need 22 instances):
- 22× t3.large: $0.0832/hour × 22 × 730 hours = $1,336.64/month
- Total: $1,336.64/month
```

**Proposed State (ECS Fargate with Auto-Scaling):**

```
Fargate Pricing:
- 1 vCPU, 2GB: $0.04048/vCPU-hour + $0.004445/GB-hour
- Per task: $0.04048 + (2 × $0.004445) = $0.04937/hour
- Per task per month: $0.04937 × 730 hours = $36.04/month

TripService (average 7.5 tasks running):
- 7.5 tasks × $36.04 = $270.30/month

DriverService (average 5 tasks running):
- 5 tasks × $36.04 = $180.20/month

UserService (average 3 tasks running):
- 3 tasks × $36.04 = $108.12/month

Total Fargate: $558.62/month

Fargate Spot (50% of tasks, 70% savings):
- Regular Fargate: $558.62/month
- Spot Savings: $558.62 × 50% × 70% = $195.52/month saved
- Net Fargate Cost: $558.62 - $195.52 = $363.10/month

CloudWatch Metrics & Alarms:
- 10 metrics × $0.30/metric = $3.00/month
- 5 alarms × $0.10/alarm = $0.50/month
- Total Monitoring: $3.50/month

Total: $366.60/month
```

**Cost Comparison:**

- Fixed EC2 (for 100k users): $1,336.64/month
- Fargate Auto-Scale: $366.60/month
- **Savings: $970.04/month (73% reduction)**

**Cost Efficiency:**

- Fixed EC2: $1,336.64 / 100,000 users = **$0.0134/user**
- Fargate Auto-Scale: $366.60 / 100,000 users = **$0.0037/user**
- **3.6x more cost-efficient**

### Scalability Metrics

| Dimension                  | Fixed EC2                 | Fargate Auto-Scale       | Factor            |
| -------------------------- | ------------------------- | ------------------------ | ----------------- |
| **Max Capacity**           | 100 req/sec (3 instances) | 5,000 req/sec (50 tasks) | **50x**           |
| **Min Cost (low traffic)** | $182/month (always 3)     | $73/month (2 tasks)      | **2.5x cheaper**  |
| **Scaling Speed**          | 10-15 min (manual)        | 1-2 min (auto)           | **10x faster**    |
| **Burst Handling**         | Fails >100 req/sec        | Handles 5k req/sec       | **50x better**    |
| **Idle Waste**             | 80% wasted capacity       | 10% wasted capacity      | **8x less waste** |
| **Operational Burden**     | Manual scaling (DevOps)   | Automatic (0 ops)        | ∞ improvement     |

**Capacity Planning:**

- Current: 100 req/sec max (fixed 3 instances)
- Fargate: 5,000 req/sec max (50 tasks)
- **Headroom: 50x** (can grow to 500k users before hitting limits)

## Alternatives Considered

### Alternative 1: EC2 Auto-Scaling Groups (ASG)

**Approach:** Use EC2 Auto-Scaling Groups instead of Fargate

**Pros:**

- Lower cost per instance: $0.0832/hour (t3.large) vs $0.178/hour (Fargate 2vCPU, 4GB)
- More control over OS, kernel settings
- Can use Reserved Instances for 40% savings

**Cons:**

- **Slower scaling:** 5-10 min to launch EC2 (vs 1-2 min Fargate)
- **Operational burden:** Manage AMIs, patches, OS updates
- **Less granular:** EC2 instances larger than needed (2 vCPU min)
- **Wasted capacity:** t3.large = 2 vCPU, but service only needs 1 vCPU

**Cost Comparison:**

- EC2 ASG (average 11 instances): 11 × $60.74/month = $668.14/month
- Fargate (average 15.5 tasks): $366.60/month
- **Fargate 45% cheaper** (due to better resource utilization)

**Verdict:** ❌ **Rejected** - Fargate faster scaling, lower operational burden, more cost-efficient

### Alternative 2: Kubernetes (EKS) with Horizontal Pod Autoscaler

**Approach:** Deploy services on EKS, use HPA for auto-scaling

**Pros:**

- Kubernetes standard (portable to other clouds)
- Rich ecosystem (Helm charts, operators)
- Fine-grained control over scheduling, networking

**Cons:**

- **Massive complexity:** Manage EKS cluster, worker nodes, networking
- **Higher cost:** EKS control plane = $73/month + worker nodes
- **Operational burden:** Kubernetes expertise required
- **Over-engineering:** Team lacks Kubernetes experience

**Cost:**

- EKS control plane: $73/month
- EC2 worker nodes (3× t3.large): $182/month
- Total: $255/month (vs $366 Fargate)
- **26% cheaper** but **much higher operational complexity**

**Verdict:** ❌ **Rejected** - Not worth the complexity for 3 services. Revisit at 50+ microservices.

### Alternative 3: AWS Lambda (Serverless)

**Approach:** Rewrite services as Lambda functions

**Pros:**

- True serverless (0 cost at 0 traffic)
- Unlimited scalability (1000+ concurrent executions)
- No infrastructure management

**Cons:**

- **Complete rewrite:** NestJS apps → Lambda functions (6-month project)
- **Cold start:** 1-3s (vs 50ms Fargate)
- **Stateless only:** Cannot run long-lived WebSocket connections
- **Higher cost at scale:** $0.20/1M requests + $0.0000166667/GB-second
  - 100M requests/month: $20/month (requests) + $100/month (compute) = $120/month
  - But cold starts hurt UX (3s latency spikes)

**Cost:** $120/month (vs $366 Fargate)

**Verdict:** ❌ **Rejected** - Cold start latency unacceptable for real-time trip requests. Stick with Fargate (always-warm containers).

### Alternative 4: Fargate + EC2 Spot (Hybrid)

**Approach:** Mix Fargate for baseline + EC2 Spot for burst capacity

**Pros:**

- EC2 Spot = 70% cheaper than on-demand
- Fargate baseline ensures always-on capacity
- Potentially lowest cost

**Cons:**

- **Complexity:** Manage two compute platforms (Fargate + EC2)
- **Spot interruptions:** EC2 Spot can be terminated with 2-minute notice
- **Operational burden:** Handle Spot interruptions gracefully

**Cost:** $180/month (2 Fargate baseline) + $70/month (EC2 Spot burst) = $250/month

**Verdict:** 🤔 **Consider for future optimization** - Fargate Spot (not EC2 Spot) is simpler. Use Fargate Spot for 50% of tasks first.

## Consequences

### Positive

✅ **73% Cost Savings**

- $1,336/month (fixed EC2) → $366/month (Fargate auto-scale)
- Save $970/month by eliminating idle capacity

✅ **50x Scalability**

- 100 req/sec (fixed) → 5,000 req/sec (auto-scale)
- Handles 500k users before hitting limits

✅ **10x Faster Scaling**

- 10-15 min (manual EC2) → 1-2 min (auto Fargate)
- Respond to traffic spikes in real-time

✅ **Zero Operational Burden**

- No manual scaling (DevOps freed up)
- No OS patching, AMI management
- AWS manages infrastructure

✅ **Burst Traffic Handling**

- Automatically scale to 50 tasks during rush hour
- Scale down to 2 tasks at night (cost savings)

### Negative

⚠️ **Cold Start (30-60s)**

- Fargate tasks take 30-60s to launch
- First requests after scale-out may see slight delay
- **Mitigation:** Keep min 2 tasks always warm, scale out proactively

⚠️ **Fargate Spot Interruptions**

- Fargate Spot tasks can be terminated (rare, <5% chance)
- **Mitigation:** Only use Spot for 50% of tasks (other 50% on-demand)

⚠️ **Less Control vs EC2**

- Cannot SSH into Fargate tasks
- Cannot customize OS kernel settings
- **Mitigation:** Use CloudWatch Logs for debugging, sufficient for most cases

⚠️ **Learning Curve**

- Team must learn ECS concepts (tasks, services, clusters)
- **Mitigation:** 1-week training, comprehensive documentation

### Risks and Mitigations

| Risk                          | Probability | Impact | Mitigation                                                         |
| ----------------------------- | ----------- | ------ | ------------------------------------------------------------------ |
| **Scale-Out Too Slow**        | Medium      | High   | Proactive scaling based on SQS queue depth (+1min early warning)   |
| **Fargate Spot Interruption** | Low         | Medium | 50% on-demand (guaranteed), graceful shutdown (30s drain)          |
| **Cold Start Latency**        | Medium      | Medium | Min 2 tasks always warm, scale out at 50% CPU (not 70%)            |
| **Cost Overrun**              | Low         | Low    | AWS Budget alerts at $500/month, CloudWatch cost anomaly detection |
| **Task Crash Loop**           | Low         | High   | ECS health checks (restart unhealthy tasks), CloudWatch alarms     |

## Implementation

### Timeline: 3 Weeks

**Week 1: ECS Cluster + Task Definitions**

- Create ECS Fargate cluster via Terraform
- Define task definitions (TripService, DriverService, UserService)
- Configure CloudWatch Logs for container logging
- Deploy to staging, test basic functionality

**Week 2: Auto-Scaling Policies**

- Configure target tracking policies (CPU 60%, Memory 70%)
- Set up SQS-based scaling for TripService
- Deploy Fargate Spot capacity provider (50% Spot)
- Load testing: Verify scaling behavior (simulate rush hour)

**Week 3: Production Migration**

- Blue-green deployment: Run Fargate alongside EC2
- Gradually shift traffic: 10% → 50% → 100% over 3 days
- Monitor CloudWatch metrics: Task count, CPU, memory, scaling events
- Decommission EC2 instances after 1 week of stable Fargate operation

### ECS Task Definition

**TripService Task:**

```json
{
  "family": "trip-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "trip-service",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/trip-service:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "DATABASE_URL", "value": "postgresql://..." }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/trip-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### Auto-Scaling Configuration

**Target Tracking Policy (CPU):**

```hcl
# Terraform auto-scaling config
resource "aws_appautoscaling_target" "trip_service" {
  max_capacity       = 50
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.trip_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "trip_service_cpu" {
  name               = "trip-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.trip_service.resource_id
  scalable_dimension = aws_appautoscaling_target.trip_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.trip_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 60.0   # Target 60% CPU
    scale_in_cooldown  = 300    # 5 min cooldown before scale-in
    scale_out_cooldown = 60     # 1 min cooldown before scale-out
  }
}

resource "aws_appautoscaling_policy" "trip_service_memory" {
  name               = "trip-service-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.trip_service.resource_id
  scalable_dimension = aws_appautoscaling_target.trip_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.trip_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }

    target_value       = 70.0   # Target 70% memory
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

**SQS-Based Scaling (Custom Metric):**

```hcl
resource "aws_appautoscaling_policy" "trip_service_sqs" {
  name               = "trip-service-sqs-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.trip_service.resource_id
  scalable_dimension = aws_appautoscaling_target.trip_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.trip_service.service_namespace

  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessages"
      namespace   = "AWS/SQS"
      statistic   = "Average"

      dimensions {
        name  = "QueueName"
        value = "driver-match-queue"
      }
    }

    target_value = 1000  # Scale out if queue depth >1000
  }
}
```

**Fargate Spot Capacity Provider:**

```hcl
resource "aws_ecs_capacity_provider" "fargate_spot" {
  name = "FARGATE_SPOT"
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 2  # Always keep 2 on-demand tasks
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1  # 50% Spot, 50% on-demand
  }
}
```

### Monitoring

**CloudWatch Dashboard:**

```hcl
resource "aws_cloudwatch_dashboard" "ecs_autoscaling" {
  dashboard_name = "ecs-autoscaling-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", { stat = "Average" }],
            ["AWS/ECS", "MemoryUtilization", { stat = "Average" }],
            ["AWS/ECS", "RunningTaskCount", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "ECS Service Metrics"
        }
      }
    ]
  })
}
```

**CloudWatch Alarms:**

```hcl
resource "aws_cloudwatch_metric_alarm" "ecs_max_capacity" {
  alarm_name          = "ecs-trip-service-max-capacity"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "45"  # Alert at 90% of max (50 tasks)
  alarm_description   = "ECS TripService approaching max capacity"
}
```

### Migration Strategy

**Phase 1: Deploy ECS Alongside EC2 (No Traffic)**

- Create Fargate cluster, deploy task definitions
- Test health checks, logging, basic functionality
- No production traffic yet

**Phase 2: Gradual Traffic Shift (10% → 100%)**

- Week 1: 10% traffic to Fargate (monitor closely)
- Week 2: 50% traffic to Fargate
- Week 3: 100% traffic to Fargate
- Monitor CloudWatch: Task count, CPU, scaling events

**Phase 3: Enable Auto-Scaling**

- Enable target tracking policies (CPU, memory)
- Test scaling: Inject load, verify tasks scale out
- Verify scale-in: Remove load, verify tasks scale down

**Phase 4: Decommission EC2**

- After 1 week of 100% Fargate traffic (stable)
- Terminate EC2 instances
- Save $1,336/month

### Rollback Plan

**Scenario:** Fargate tasks crash-looping or cold start too slow

**Steps:**

1. **Immediate:** Route 100% traffic back to EC2 instances (5-minute rollback)
2. **Investigate:** Check CloudWatch Logs, ECS task events, health check failures
3. **Fix:** Adjust task CPU/memory, fix application bugs, tune health checks
4. **Re-test:** Staging environment load test
5. **Re-deploy:** Gradual rollout again (10% → 100%)

**Rollback Cost:** $0 (EC2 instances remain in place during migration)

## References

- **Gap Analysis:** [gap-analysis.md](../architecture/gap-analysis.md)
- **AWS ECS Best Practices:** https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html
- **Fargate Pricing:** https://aws.amazon.com/fargate/pricing/
- **ECS Auto-Scaling:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html
- **Terraform ECS Module:** https://registry.terraform.io/modules/terraform-aws-modules/ecs/aws/latest
- **Terraform Config:** [infrastructure/terraform/ecs.tf](../../infrastructure/terraform/) _(to be created)_

## Related ADRs

- [ADR-001: Async Communication](./ADR-001-event-driven-async-communication.md) - SQS queue depth triggers auto-scaling
- [ADR-002: Database Scaling](./ADR-002-database-read-scaling-rds-replicas.md) - App tier scales independently from DB tier
- [ADR-004: Resilience Patterns](./ADR-004-resilience-patterns-circuit-breakers.md) - Circuit breakers prevent cascade during scale-out
