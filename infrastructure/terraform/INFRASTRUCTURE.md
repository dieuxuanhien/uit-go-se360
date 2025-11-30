# UIT-Go Terraform Infrastructure Documentation

## Quick Start

```bash
# 1. Copy example variables
cp terraform.tfvars.example terraform.tfvars

# 2. Edit terraform.tfvars with your configuration
nano terraform.tfvars

# 3. Deploy everything
./deploy.sh

# Or deploy step by step:
terraform init
terraform plan
terraform apply
./build-and-push.sh
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │   ALB   │ (Application Load Balancer)
                    └────┬────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
   │  User   │     │  Trip   │     │ Driver  │
   │ Service │     │ Service │     │ Service │
   │  (ECS)  │     │  (ECS)  │     │  (ECS)  │
   └────┬────┘     └────┬────┘     └────┬────┘
        │                │                │
        │                │                │
   ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
   │   RDS   │     │   RDS   │     │  Redis  │
   │ (Users) │     │ (Trips) │     │(Locations)│
   └─────────┘     └─────────┘     └─────────┘
```

## Infrastructure Components

### 1. Networking (VPC Module)

**Resources Created:**

- 1 VPC (`10.0.0.0/16`)
- 2 Public Subnets (for ALB)
- 2 Private Subnets (for ECS tasks)
- 2 Database Subnets (for RDS & ElastiCache)
- 1 Internet Gateway
- 2 NAT Gateways (one per AZ for high availability)
- Route Tables for each subnet type
- VPC Flow Logs to CloudWatch

**Design Decisions:**

- Multi-AZ deployment across `us-east-1a` and `us-east-1b`
- Private subnets for security (no direct internet access)
- NAT Gateways allow outbound internet for ECS tasks (updates, ECR pulls)
- Database subnets isolated from application subnets

### 2. Security Groups (Security Groups Module)

**ALB Security Group:**

- Inbound: 80 (HTTP), 443 (HTTPS) from anywhere
- Outbound: All traffic

**ECS Security Group:**

- Inbound: 3001-3003 from ALB only
- Inbound: All from self (service-to-service communication)
- Outbound: All traffic

**RDS Security Group:**

- Inbound: 5432 (PostgreSQL) from ECS only
- Outbound: All traffic

**Redis Security Group:**

- Inbound: 6379 from ECS only
- Outbound: All traffic

### 3. IAM (IAM Module)

**ECS Task Execution Role:**

- Pull images from ECR
- Write logs to CloudWatch
- Read secrets from Secrets Manager
- Decrypt with KMS

**ECS Task Role:**

- Application permissions
- Access to Secrets Manager
- CloudWatch metrics
- X-Ray tracing
- SNS/SQS (for future async features)

**Auto Scaling Role:**

- Scale ECS services based on metrics

### 4. Secrets Manager (Secrets Module)

**Secrets Created:**

- User Database credentials (auto-generated)
- Trip Database credentials (auto-generated)
- JWT signing secret (auto-generated)
- Internal API key for service-to-service auth (auto-generated)

**Features:**

- 7-day recovery window for accidental deletion
- Automatic rotation ready (can be enabled)
- KMS encryption

### 5. RDS (RDS Module)

**User Service Database:**

- Engine: PostgreSQL 15.4
- Instance: `db.t3.micro` (configurable)
- Storage: 20GB gp3 with auto-scaling to 100GB
- Multi-AZ: Configurable (default: disabled for cost)
- Backups: 7-day retention
- Encryption: At rest with KMS
- Performance Insights: Enabled (7-day retention)

**Trip Service Database:**

- Same configuration as User DB
- Separate instance for isolation

**Features:**

- Automated backups during maintenance window
- CloudWatch log exports (PostgreSQL, upgrades)
- Connection pooling via application
- Deletion protection (disabled in dev, enable for prod)

### 6. ElastiCache (ElastiCache Module)

**Redis Cluster:**

- Engine: Redis 7.0
- Node Type: `cache.t3.micro` (configurable)
- Nodes: 1 (configurable for replication)
- Encryption: At rest enabled, in-transit optional
- Logging: Slow log and engine log to CloudWatch
- Parameter Group: Custom with LRU eviction policy

**Use Cases:**

- Driver location storage (geospatial data)
- Session caching for User Service
- Rate limiting data

### 7. ECR (ECR Module)

**Repositories Created:**

- `uit-go/dev/user-service`
- `uit-go/dev/trip-service`
- `uit-go/dev/driver-service`

**Features:**

- Image scanning on push (vulnerability detection)
- Lifecycle policy (keep last 10 images)
- Encryption with AES-256
- Immutable tags (can be enabled)

### 8. Application Load Balancer (ALB Module)

**Configuration:**

- Internet-facing
- HTTP listener on port 80
- HTTPS listener on port 443 (optional, requires certificate)
- Path-based routing:
  - `/api/users/*` → User Service
  - `/api/auth/*` → User Service
  - `/api/trips/*` → Trip Service
  - `/api/drivers/*` → Driver Service
  - `/api/locations/*` → Driver Service

**Health Checks:**

- Path: `/health`
- Interval: 30 seconds
- Timeout: 5 seconds
- Healthy threshold: 2
- Unhealthy threshold: 3

### 9. CloudWatch (CloudWatch Module)

**Log Groups:**

- `/ecs/uit-go/dev/user-service` (7-day retention)
- `/ecs/uit-go/dev/trip-service` (7-day retention)
- `/ecs/uit-go/dev/driver-service` (7-day retention)
- `/aws/vpc/uit-go-dev` (VPC flow logs)
- `/aws/elasticache/uit-go-dev/redis/*` (Redis logs)

**Dashboard:**

- ECS cluster CPU and memory metrics
- ALB request count and response times
- RDS connection count and latency
- Redis cache hit/miss ratio

### 10. ECS (ECS Module)

**Cluster:**

- Name: `uit-go-dev-cluster`
- Type: Fargate
- Container Insights: Enabled
- Capacity Providers: FARGATE, FARGATE_SPOT

**User Service:**

- CPU: 512 (0.5 vCPU)
- Memory: 1024 MB
- Desired Count: 2
- Auto Scaling: 2-4 tasks
- Port: 3001
- Health Check: `GET /health`

**Trip Service:**

- CPU: 512 (0.5 vCPU)
- Memory: 1024 MB
- Desired Count: 2
- Auto Scaling: 2-4 tasks
- Port: 3002
- Health Check: `GET /health`
- Service Discovery: Enabled (for internal communication)

**Driver Service:**

- CPU: 512 (0.5 vCPU)
- Memory: 1024 MB
- Desired Count: 2
- Auto Scaling: 2-4 tasks
- Port: 3003
- Health Check: `GET /health`
- Service Discovery: Enabled (for internal communication)

**Auto Scaling Policies:**

- Target CPU: 70%
- Target Memory: 80%
- Scale out cooldown: 60 seconds
- Scale in cooldown: 300 seconds

**Service Discovery:**

- Private DNS namespace: `uit-go-dev.local`
- Services:
  - `trip-service.uit-go-dev.local`
  - `driver-service.uit-go-dev.local`
- Allows services to communicate via DNS names

## Cost Estimation

### Development Environment (Monthly)

| Service        | Configuration               | Estimated Cost  |
| -------------- | --------------------------- | --------------- |
| ECS Fargate    | 6 tasks × 0.5 vCPU, 1GB     | $30             |
| RDS PostgreSQL | 2 × db.t3.micro             | $30             |
| ElastiCache    | 1 × cache.t3.micro          | $15             |
| NAT Gateway    | 2 × NAT Gateway             | $60             |
| ALB            | 1 Application Load Balancer | $20             |
| Data Transfer  | Minimal                     | $5              |
| **Total**      |                             | **~$160/month** |

### Production Environment (Monthly)

| Service        | Configuration               | Estimated Cost  |
| -------------- | --------------------------- | --------------- |
| ECS Fargate    | 12 tasks × 0.5 vCPU, 1GB    | $60             |
| RDS PostgreSQL | 2 × db.t3.small (Multi-AZ)  | $100            |
| ElastiCache    | 2 × cache.t3.small          | $60             |
| NAT Gateway    | 2 × NAT Gateway             | $60             |
| ALB            | 1 Application Load Balancer | $20             |
| Data Transfer  | Moderate                    | $20             |
| **Total**      |                             | **~$320/month** |

**Cost Optimization Tips:**

1. Use Fargate Spot for non-critical tasks (70% savings)
2. Enable RDS read replicas only when needed
3. Use single NAT Gateway for dev (not HA)
4. Clean up old ECR images regularly
5. Reduce CloudWatch log retention for dev

## Deployment Workflow

### First-Time Deployment

```bash
# 1. Clone repository
git clone <your-repo>
cd uit-go-se360/infrastructure/terraform

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# 3. Initialize and deploy
terraform init
terraform plan
terraform apply

# 4. Build and push images
./build-and-push.sh

# 5. Verify deployment
terraform output alb_dns_name
curl http://<alb-dns>/health
```

### Updating Services

```bash
# 1. Make code changes
# 2. Build and push new images
./build-and-push.sh

# 3. Update task definitions
terraform apply -auto-approve

# 4. Monitor deployment
aws ecs describe-services --cluster uit-go-dev-cluster --services uit-go-dev-user-service
```

### Updating Infrastructure

```bash
# 1. Modify Terraform files
# 2. Plan changes
terraform plan

# 3. Apply changes
terraform apply

# 4. Verify
terraform output
```

## Monitoring and Debugging

### View Logs

```bash
# Real-time logs
aws logs tail /ecs/uit-go/dev/user-service --follow
aws logs tail /ecs/uit-go/dev/trip-service --follow
aws logs tail /ecs/uit-go/dev/driver-service --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /ecs/uit-go/dev/user-service \
  --filter-pattern "ERROR"
```

### Check Service Health

```bash
# ECS service status
aws ecs describe-services \
  --cluster uit-go-dev-cluster \
  --services uit-go-dev-user-service

# Task status
aws ecs list-tasks --cluster uit-go-dev-cluster
aws ecs describe-tasks --cluster uit-go-dev-cluster --tasks <task-id>

# ALB target health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>
```

### Database Access

```bash
# Get RDS endpoint
terraform output user_db_endpoint

# Connect via bastion or ECS Exec
aws ecs execute-command \
  --cluster uit-go-dev-cluster \
  --task <task-id> \
  --container user-service \
  --interactive \
  --command "/bin/bash"
```

## Security Best Practices

1. **Never commit `terraform.tfvars`** - Contains sensitive configuration
2. **Rotate secrets regularly** - Use Secrets Manager rotation
3. **Enable Multi-AZ for production** - High availability
4. **Use HTTPS in production** - Add ACM certificate
5. **Enable deletion protection** - For critical resources
6. **Regular backups** - Verify RDS automated backups
7. **Monitor CloudWatch** - Set up alarms for anomalies
8. **Least privilege IAM** - Review and tighten policies
9. **VPC Flow Logs** - Monitor network traffic
10. **Regular updates** - Keep Terraform and providers updated

## Troubleshooting

### Issue: ECS Tasks Keep Restarting

**Possible Causes:**

1. Container health check failing
2. Application crash on startup
3. Cannot pull image from ECR
4. Secrets not accessible

**Solution:**

```bash
# Check CloudWatch logs
aws logs tail /ecs/uit-go/dev/user-service --follow

# Check task stopped reason
aws ecs describe-tasks --cluster uit-go-dev-cluster --tasks <task-id>

# Verify IAM permissions
aws iam simulate-principal-policy --policy-source-arn <task-execution-role-arn>
```

### Issue: Cannot Connect to Database

**Solution:**

```bash
# Verify security group rules
terraform state show module.security_groups.aws_security_group.rds

# Check RDS status
aws rds describe-db-instances --db-instance-identifier uit-go-dev-user-db

# Test connectivity from ECS task
aws ecs execute-command ... --command "nc -zv <rds-endpoint> 5432"
```

### Issue: High Costs

**Solution:**

1. Check NAT Gateway usage (consider single NAT for dev)
2. Review ECS task count and sizes
3. Check data transfer costs
4. Enable CloudWatch cost anomaly detection

## Maintenance

### Regular Tasks

**Daily:**

- Review CloudWatch dashboards
- Check for failed deployments

**Weekly:**

- Review CloudWatch alarms
- Check RDS disk usage
- Review ECS auto-scaling events

**Monthly:**

- Review AWS costs
- Update Terraform providers
- Rotate secrets
- Clean up old ECR images

### Backup and Recovery

**RDS Backups:**

- Automated daily backups (7-day retention)
- Manual snapshots before major changes

**Disaster Recovery:**

```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier uit-go-dev-user-db \
  --db-snapshot-identifier pre-update-snapshot

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier uit-go-dev-user-db-restored \
  --db-snapshot-identifier pre-update-snapshot
```

## Additional Resources

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
