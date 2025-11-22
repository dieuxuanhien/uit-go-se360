# ADR-005: API Gateway with AWS API Gateway and WAF

**Status:** ✅ Accepted  
**Date:** 2025-11-21  
**Decision Makers:** Architecture Team  
**Technical Story:** [api-gateway.md](../architecture/api-gateway.md)

## Context

The current architecture exposes microservices directly through an Application Load Balancer (ALB) with minimal protection:

### Current State Problems

**Security Vulnerabilities:**

- No rate limiting → API abuse possible (unlimited requests)
- No DDoS protection → Vulnerable to volumetric attacks
- No request validation → Malformed payloads reach services
- API keys in application code → Credential leakage risk

**Scalability Limitations:**

- Each service handles its own rate limiting (inconsistent)
- No centralized throttling → Spikes can overwhelm services
- No caching at edge → All requests hit services

**Operational Issues:**

- No usage analytics (which endpoints used most?)
- No API versioning strategy
- Difficult to change backends without client updates

**Threat Landscape:**

- DDoS attacks cost $16,000 per incident (estimated)
- API abuse incidents: ~6 per year (scrapers, bots)
- Annual risk: $96,000 in potential downtime

## Decision

**Implement AWS API Gateway with AWS WAF for centralized security, rate limiting, and API management.**

### Architecture

```
Internet
   │
   ▼
┌──────────────────────────┐
│   AWS WAF                │  ◄─── IP rate limiting, SQL injection block
│   - IP-based throttling  │       Geographic restrictions
│   - DDoS protection      │
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│   API Gateway (REST)     │  ◄─── Request validation, API keys
│   - Usage plans          │       Response caching (60% hit rate)
│   - API key management   │       CloudWatch metrics
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│   VPC Link               │  ◄─── Private connection (no internet exposure)
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│   Network Load Balancer  │  ◄─── Distributes traffic to ECS services
│   (Private subnet)       │
└───────────┬──────────────┘
            │
    ┌───────┼───────┐
    │       │       │
┌───▼───┐ ┌─▼────┐ ┌─▼────┐
│ Trip  │ │ User │ │Driver│
│Service│ │Service│ │Service│
└───────┘ └──────┘ └──────┘
```

**Key Components:**

1. **AWS API Gateway (REST API):**
   - Regional endpoint (lower latency than edge-optimized)
   - Request/response validation with JSON schemas
   - API key management with automatic rotation
   - CloudWatch logging and metrics

2. **Usage Plans (Three Tiers):**
   - **Free Tier:** 10,000 requests/day, 10 req/sec burst
   - **Premium Tier:** 1,000,000 requests/day, 100 req/sec burst
   - **Admin Tier:** Unlimited requests

3. **AWS WAF Rules:**
   - IP rate limiting: 1,000 requests per 5 minutes per IP
   - SQL injection protection (AWS managed rule)
   - Geographic blocking (block high-risk countries if needed)
   - Custom rules: Block known malicious IPs

4. **Rate Limiting Strategy:**
   - **Per-endpoint:** `/trips/create` limited to 25 req/sec
   - **Per-user:** API key throttled per usage plan
   - **Per-IP:** WAF enforces 1000 req/5min per IP
   - **Global:** API Gateway max 10,000 req/sec (regional limit)

5. **Response Caching:**
   - Cache driver search results (60s TTL)
   - Cache pricing rules (5 min TTL)
   - 60% cache hit rate → 238/month savings in compute

## Quantitative Analysis

### Performance Impact

| Metric                     | Current (ALB)            | Proposed (API Gateway) | Impact          |
| -------------------------- | ------------------------ | ---------------------- | --------------- |
| **Latency (uncached)**     | 50ms                     | 60ms (+10ms)           | Slight increase |
| **Latency (cached)**       | 50ms                     | 5ms                    | **10x faster**  |
| **Rate Limit Enforcement** | None (vulnerable)        | 10k TPS max            | Protected       |
| **DDoS Protection**        | AWS Shield Standard only | WAF + Shield           | Strong          |
| **Request Validation**     | Service-level (50ms)     | Edge (5ms)             | **10x faster**  |

**Cache Performance:**

```
Traffic: 100,000 requests/hour

Without caching:
- All requests hit services: 100,000 × 50ms = 5,000 CPU-seconds
- EC2 cost: 3× t3.large = $182/month

With caching (60% hit rate):
- Cached: 60,000 × 5ms = 300 CPU-seconds
- Uncached: 40,000 × 50ms = 2,000 CPU-seconds
- Total: 2,300 CPU-seconds (vs 5,000) = 54% reduction
- EC2 cost: 2× t3.large = $121/month
- **Savings: $61/month** (but offset by API Gateway cost)
```

### Cost Analysis

**Current State (ALB Only):**

```
Application Load Balancer:
- Base cost: $16.20/month
- LCU cost: $0.008/LCU × 50 LCUs × 730 hours = $292/month
- Total: $308.20/month

EC2 Instances (3× t3.large):
- $0.0832/hour × 3 × 730 hours = $182.21/month

Database (from ADR-002): $833.70/month
Cache (from ADR-003): $552.24/month

Total: $1,876.35/month
```

**Proposed State (API Gateway + WAF):**

```
AWS API Gateway (REST API):
- 100M requests/month: $3.50/million × 100 = $350/month
- Cache memory (10.6 GB): $0.02/GB-hour × 10.6 × 730 = $154.76/month
- Data transfer (1TB out): $0.09/GB × 1024 = $92.16/month
- Total API Gateway: $596.92/month

AWS WAF:
- Web ACL: $5/month
- Rules (5 rules): $1/rule × 5 = $5/month
- Requests: 100M × $0.60/million = $60/month
- Total WAF: $70/month

VPC Link (NLB):
- NLB base: $16.20/month
- LCU: $0.006/NLCU × 50 × 730 = $219/month
- Total VPC Link: $235.20/month

EC2 Instances (2× t3.large due to caching):
- $0.0832/hour × 2 × 730 hours = $121.47/month

Database: $833.70/month (same)
Cache: $552.24/month (same)

Total: $2,409.53/month
```

**Cost Increase:**

- Current: $1,876.35/month
- Proposed: $2,409.53/month
- **Increase: $533.18/month (28% more)**

**But - Risk-Adjusted Cost Analysis:**

Without API Gateway + WAF:

- DDoS attack cost: $16,000 per incident
- Expected incidents per year: 6
- Expected annual loss: 6 × $16,000 = $96,000

With API Gateway + WAF:

- DDoS attack cost: $0 (mitigated by WAF)
- API Gateway cost: $533.18 × 12 = $6,398/year

**Net Savings:** $96,000 - $6,398 = **$89,602/year**

**Break-Even:** 1 DDoS attack prevented = $16,000 saved > $6,398/year cost

**Recommendation: Cost-Optimized Deployment**

Only use API Gateway in **production**:

- Production: API Gateway ($2,409/month)
- Staging/Dev: ALB only ($308/month)
- **Total: $2,717/month** (vs $2,409 + $308 + $308 = $3,025 for all environments)
- **Savings: $308/month** (dev/staging use cheaper ALB)

### Scalability Metrics

| Dimension               | Current (ALB)           | Proposed (API Gateway)         | Factor               |
| ----------------------- | ----------------------- | ------------------------------ | -------------------- |
| **Max Throughput**      | 50,000 TPS              | 10,000 TPS (per region)        | 0.2x (lower)         |
| **Rate Limiting**       | None                    | Per-endpoint, per-user, per-IP | ∞ improvement        |
| **DDoS Protection**     | Basic (Shield Standard) | Advanced (WAF + Shield)        | Strong               |
| **Cache Hit Rate**      | 0%                      | 60%                            | Reduces backend load |
| **Global Availability** | Single region           | Multi-region possible          | Extensible           |

**Note on Throughput:** API Gateway has lower max TPS than ALB, but 10,000 TPS is sufficient for 100k users (100 req/user/day = 116 req/sec avg, 10x safety margin).

## Alternatives Considered

### Alternative 1: Keep ALB + Add CloudFront

**Approach:** Use CloudFront CDN in front of ALB for caching and DDoS protection

**Pros:**

- Lower cost: $100/month (CloudFront) vs $667/month (API Gateway + WAF)
- Higher throughput: 100k+ TPS (CloudFront edge locations)
- Global edge caching (lower latency worldwide)

**Cons:**

- **No API key management** (CloudFront is CDN, not API management)
- **No usage plans or throttling** (CloudFront rate limiting is basic)
- **No request validation** (JSON schema validation not available)
- **Less control:** CloudFront designed for static content, not APIs

**Cost:** $408/month ($308 ALB + $100 CloudFront)

**Verdict:** ❌ **Rejected** - Lacks API management features (keys, usage plans). Use for static assets later, not API traffic.

### Alternative 2: Self-Hosted API Gateway (Kong, Tyk)

**Approach:** Deploy Kong or Tyk API gateway on EC2 instances

**Pros:**

- Full control over configuration
- No per-request cost (flat EC2 pricing)
- Rich plugin ecosystem (Kong plugins for auth, rate limiting)

**Cons:**

- **Operational burden:** Manage Kong cluster, database, monitoring
- **High availability requires 3-node cluster:** 3× t3.medium = $91/month
- **No managed WAF:** Must integrate with AWS WAF separately
- **Team lacks Kong expertise:** Learning curve + maintenance

**Cost:** $91/month (EC2) + $70/month (WAF) = $161/month

**Verdict:** ❌ **Rejected** - Prefer managed service. $667/month for AWS API Gateway is worth avoiding operational complexity.

### Alternative 3: API Gateway + CloudFront (Hybrid)

**Approach:** CloudFront (global edge) → API Gateway (regional) → Services

**Pros:**

- Best of both worlds: Global edge + API management
- Lower latency worldwide (CloudFront edge caching)
- DDoS protection at edge (CloudFront + Shield Advanced)

**Cons:**

- **Higher cost:** $667/month (API Gateway) + $100/month (CloudFront) = $767/month
- **Added complexity:** Two layers to manage and monitor
- **Overkill for single-region app** (users in Vietnam only)

**Cost:** $767/month

**Verdict:** 🤔 **Consider for future** - If we expand to global users (Southeast Asia), add CloudFront. For now, regional API Gateway sufficient.

### Alternative 4: AWS App Sync (GraphQL)

**Approach:** Use AWS AppSync for GraphQL API instead of REST

**Pros:**

- Real-time subscriptions built-in (WebSocket)
- Better for frontend (flexible queries, reduce over-fetching)
- Managed resolvers (Lambda, DynamoDB, HTTP)

**Cons:**

- **Requires rewrite:** REST API → GraphQL schema (8-week project)
- **Higher complexity:** Schema design, resolver logic
- **Higher cost:** $4/million requests (vs $3.50 for API Gateway REST)
- **Team lacks GraphQL experience**

**Cost:** $400/month (100M requests)

**Verdict:** ❌ **Rejected** - Stick with REST API. GraphQL not worth migration cost for MVP.

## Consequences

### Positive

✅ **DDoS Protection**

- WAF blocks malicious traffic at edge (before hitting services)
- Save $96,000/year in expected DDoS attack costs

✅ **Centralized Rate Limiting**

- Per-endpoint, per-user, per-IP throttling
- Prevents API abuse (scrapers, bots)
- Protects backend services from overload

✅ **API Key Management**

- Automatic rotation (30-day cycle)
- Usage analytics per API key
- Revoke compromised keys instantly

✅ **Request Validation at Edge**

- JSON schema validation (5ms at API Gateway vs 50ms in service)
- Reject malformed requests before they hit services
- Reduces backend load (invalid requests never reach ECS)

✅ **Response Caching**

- 60% cache hit rate
- $61/month EC2 savings (but offset by API Gateway cost)
- 10x faster response for cached data (5ms vs 50ms)

### Negative

⚠️ **28% Cost Increase**

- $1,876/month → $2,409/month
- **Mitigation:** Only use in production (staging/dev use ALB)
- **ROI:** 1 DDoS attack prevented = $16k saved > $6.4k/year cost

⚠️ **Lower Max Throughput**

- 50k TPS (ALB) → 10k TPS (API Gateway)
- **Mitigation:** 10k TPS sufficient for 100k users (100 req/user/day)
- **Future:** Add CloudFront edge caching if we exceed 10k TPS

⚠️ **Vendor Lock-In**

- AWS-specific API Gateway features (usage plans, VPC Link)
- Migration to other providers harder
- **Mitigation:** Acceptable trade-off for managed service benefits

⚠️ **Added Latency (+10ms)**

- API Gateway adds 10ms overhead per request
- **Mitigation:** Offset by caching (60% of requests 10x faster)

### Risks and Mitigations

| Risk                            | Probability | Impact | Mitigation                                                           |
| ------------------------------- | ----------- | ------ | -------------------------------------------------------------------- |
| **API Gateway Regional Outage** | Low         | High   | Multi-region failover (future), CloudFront cache (temporary)         |
| **Throttling Legitimate Users** | Medium      | Medium | Tune usage plans, monitor 429 errors, upgrade users to Premium       |
| **Cache Invalidation Issues**   | Low         | Medium | Short TTLs (60s-5min), manual cache clear API                        |
| **WAF False Positives**         | Low         | Medium | Monitor blocked requests, whitelist legitimate IPs                   |
| **Cost Overrun**                | Low         | Low    | AWS Budget alerts at $2,500/month, CloudWatch cost anomaly detection |

## Implementation

### Timeline: 4 Weeks

**Week 1: Infrastructure Setup**

- Create API Gateway REST API via Terraform
- Configure VPC Link to NLB
- Set up usage plans (Free, Premium, Admin)
- Deploy WAF web ACL with basic rules

**Week 2: API Routes + Request Validation**

- Define API routes (OpenAPI spec)
- JSON schema validation for request/response
- API key management integration
- Deploy to staging environment

**Week 3: Rate Limiting + Caching**

- Configure per-endpoint throttling
- Enable response caching (60s TTL for driver search)
- WAF IP rate limiting rules
- Load testing: Verify rate limits work

**Week 4: Production Rollout**

- Blue-green deployment to production
- Gradual traffic shift: 10% → 50% → 100% over 3 days
- Monitor CloudWatch metrics: Latency, 4xx/5xx errors, cache hit rate
- Full cutover after 72-hour monitoring period

### API Gateway Configuration

**OpenAPI Specification:**

```yaml
# api-gateway-spec.yaml
openapi: 3.0.0
info:
  title: UIT-GO-SE360 API
  version: 1.0.0

paths:
  /trips:
    post:
      summary: Create trip
      x-amazon-apigateway-integration:
        uri: http://nlb-internal.example.com/trips
        httpMethod: POST
        type: http_proxy
      x-amazon-apigateway-request-validator: all
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTripRequest'
      responses:
        '201':
          description: Trip created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Trip'

components:
  schemas:
    CreateTripRequest:
      type: object
      required:
        - userId
        - pickup
        - destination
      properties:
        userId:
          type: string
          pattern: '^[0-9a-f]{24}$'
        pickup:
          $ref: '#/components/schemas/Location'
        destination:
          $ref: '#/components/schemas/Location'

  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key

security:
  - ApiKeyAuth: []
```

**Usage Plans:**

```hcl
# Terraform usage plan config
resource "aws_api_gateway_usage_plan" "free_tier" {
  name = "free-tier"

  api_stages {
    api_id = aws_api_gateway_rest_api.main.id
    stage  = aws_api_gateway_stage.prod.stage_name
  }

  quota_settings {
    limit  = 10000  # 10k requests per day
    period = "DAY"
  }

  throttle_settings {
    burst_limit = 10   # 10 req/sec burst
    rate_limit  = 5    # 5 req/sec sustained
  }
}

resource "aws_api_gateway_usage_plan" "premium_tier" {
  name = "premium-tier"

  api_stages {
    api_id = aws_api_gateway_rest_api.main.id
    stage  = aws_api_gateway_stage.prod.stage_name
  }

  quota_settings {
    limit  = 1000000  # 1M requests per day
    period = "DAY"
  }

  throttle_settings {
    burst_limit = 100  # 100 req/sec burst
    rate_limit  = 50   # 50 req/sec sustained
  }
}
```

**WAF Rules:**

```hcl
# Terraform WAF config
resource "aws_wafv2_web_acl" "api_protection" {
  name  = "api-gateway-protection"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # IP rate limiting
  rule {
    name     = "rate-limit-per-ip"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000  # 1000 requests per 5 minutes
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIP"
      sampled_requests_enabled   = true
    }
  }

  # AWS managed rule: SQL injection protection
  rule {
    name     = "sql-injection-protection"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLiProtection"
      sampled_requests_enabled   = true
    }
  }
}
```

### Migration Strategy

**Phase 1: Deploy API Gateway (No Traffic)**

- Create API Gateway infrastructure in production
- VPC Link to existing NLB
- Test with synthetic traffic only
- Verify request routing works

**Phase 2: Gradual Traffic Shift (10% → 100%)**

- Route 10% of production traffic through API Gateway
- Monitor: Latency, error rate, cache hit rate
- Increase to 50% if metrics healthy
- Full cutover to 100% after 72 hours

**Phase 3: Enable WAF Rules**

- Deploy WAF rules in "count" mode (log only, don't block)
- Analyze blocked requests for false positives
- Switch to "block" mode after 1 week of monitoring

**Phase 4: Decommission ALB**

- Once API Gateway handles 100% traffic for 2 weeks
- Remove ALB from production (save $308/month)
- Keep ALB in staging/dev environments

### Rollback Plan

**Scenario:** API Gateway latency spikes or error rate >1%

**Steps:**

1. **Immediate:** Route 100% traffic back to ALB via DNS change (5-minute rollback)
2. **Investigate:** Check API Gateway CloudWatch logs, VPC Link status
3. **Fix:** Increase API Gateway cache size, tune throttling limits
4. **Re-test:** Staging environment load test
5. **Re-deploy:** Gradual rollout again (10% → 100%)

**Rollback Cost:** $0 (ALB remains in place during transition)

## References

- **Detailed Design:** [api-gateway.md](../architecture/api-gateway.md)
- **Gap Analysis:** [gap-analysis.md](../architecture/gap-analysis.md)
- **AWS API Gateway Best Practices:** https://docs.aws.amazon.com/apigateway/latest/developerguide/best-practices.html
- **AWS WAF Documentation:** https://docs.aws.amazon.com/waf/latest/developerguide/
- **OpenAPI Specification:** https://swagger.io/specification/
- **Terraform Config:** [infrastructure/terraform/api-gateway.tf](../../infrastructure/terraform/) _(to be created)_

## Related ADRs

- [ADR-001: Async Communication](./ADR-001-event-driven-async-communication.md) - Reduces synchronous API load
- [ADR-003: Distributed Caching](./ADR-003-distributed-caching-elasticache.md) - Cache complements API Gateway cache
- [ADR-004: Resilience Patterns](./ADR-004-resilience-patterns-circuit-breakers.md) - API Gateway + circuit breakers = defense in depth
