# UIT-Go Terraform - Quick Reference Card

## 🚀 Common Commands

### Using Makefile (Recommended)

```bash
make help              # Show all available commands
make deploy            # Full deployment
make build-push        # Build and push Docker images
make update            # Update services with new images
make status            # Check ECS service status
make logs-user         # View user service logs
make logs-trip         # View trip service logs
make logs-driver       # View driver service logs
make test-health       # Test health endpoints
make destroy           # Destroy all infrastructure
```

### Using Scripts

```bash
./deploy.sh            # Automated deployment
./build-and-push.sh    # Build and push images
./destroy.sh           # Destroy infrastructure
```

### Using Terraform Directly

```bash
terraform init         # Initialize Terraform
terraform plan         # Preview changes
terraform apply        # Apply changes
terraform destroy      # Destroy infrastructure
terraform output       # Show outputs
```

## 📋 Initial Setup

### 1. First Time Setup

```bash
# Navigate to terraform directory
cd infrastructure/terraform

# Copy example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit configuration (required!)
nano terraform.tfvars
```

### 2. Deploy Infrastructure

```bash
# Option A: Automated (recommended)
make deploy

# Option B: Manual
terraform init
terraform plan
terraform apply
```

### 3. Build and Deploy Applications

```bash
# Build and push Docker images
make build-push

# Update ECS services
make update
```

### 4. Verify Deployment

```bash
# Get ALB URL
make alb-url

# Test health endpoints
make test-health

# Check service status
make status
```

## 🔍 Monitoring & Debugging

### View Logs

```bash
# Real-time logs for each service
make logs-user
make logs-trip
make logs-driver

# Or using AWS CLI directly
aws logs tail /ecs/uit-go/dev/user-service --follow
```

### Check Service Health

```bash
# ECS service status
make status

# Or manually
aws ecs describe-services \
  --cluster uit-go-dev-cluster \
  --services uit-go-dev-user-service
```

### View Infrastructure Outputs

```bash
make outputs

# Or
terraform output
```

## 🔧 Common Tasks

### Update Application Code

```bash
# 1. Make code changes
# 2. Build and push new images
make build-push

# 3. Update ECS services
make update
```

### Update Infrastructure

```bash
# 1. Modify .tf files
# 2. Plan changes
terraform plan

# 3. Apply changes
terraform apply
```

### Scale Services

```bash
# Edit terraform.tfvars
user_service_desired_count = 4

# Apply changes
terraform apply
```

### Access Database

```bash
# Get database endpoint
terraform output user_db_endpoint

# Connect via ECS Exec
aws ecs execute-command \
  --cluster uit-go-dev-cluster \
  --task TASK_ID \
  --container user-service \
  --interactive \
  --command "psql -h DB_HOST -U postgres -d uitgo_user"
```

## 📊 Important Outputs

### Get All Outputs

```bash
terraform output
```

### Specific Outputs

```bash
terraform output alb_dns_name              # ALB DNS
terraform output user_service_repository_url  # ECR repo
terraform output user_db_endpoint          # Database endpoint
terraform output redis_endpoint            # Redis endpoint
```

## 🔐 Security

### View Secrets (ARNs only)

```bash
make secrets

# Get actual secret values
aws secretsmanager get-secret-value \
  --secret-id uit-go/dev/user-db \
  --query SecretString \
  --output text | jq
```

### Login to ECR

```bash
make ecr-login

# Or manually
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
```

## 💰 Cost Management

### Estimate Costs

```bash
make costs
```

### Reduce Costs (Development)

Edit `terraform.tfvars`:

```hcl
db_instance_class = "db.t3.micro"
redis_node_type = "cache.t3.micro"
db_multi_az = false
user_service_desired_count = 1
trip_service_desired_count = 1
driver_service_desired_count = 1
```

## 🚨 Troubleshooting

### ECS Tasks Not Starting

```bash
# Check logs
make logs-user

# Check task status
aws ecs describe-tasks \
  --cluster uit-go-dev-cluster \
  --tasks TASK_ID

# Check events
aws ecs describe-services \
  --cluster uit-go-dev-cluster \
  --services uit-go-dev-user-service \
  --query 'services[0].events[:5]'
```

### Database Connection Issues

```bash
# Verify security groups
terraform state show module.security_groups.aws_security_group.rds

# Check database status
aws rds describe-db-instances \
  --db-instance-identifier uit-go-dev-user-db
```

### Image Pull Errors

```bash
# Verify ECR repositories exist
aws ecr describe-repositories

# Check IAM permissions
aws iam get-role-policy \
  --role-name uit-go-dev-ecs-task-execution-role \
  --policy-name uit-go-dev-ecs-task-execution-additional
```

## 🧹 Cleanup

### Full Cleanup

```bash
# Option A: Using script (recommended)
make destroy

# Option B: Manual
terraform destroy
```

### Partial Cleanup (Keep Infrastructure)

```bash
# Scale down to zero
terraform apply -var="user_service_desired_count=0" \
                -var="trip_service_desired_count=0" \
                -var="driver_service_desired_count=0"
```

## 📚 Documentation Files

- `README.md` - Quick start guide
- `INFRASTRUCTURE.md` - Detailed architecture documentation
- `SUMMARY.md` - Complete overview
- `QUICK_REFERENCE.md` - This file
- `terraform.tfvars.example` - Configuration template

## 🔗 Useful URLs

### AWS Console

```bash
# Get URLs
echo "ECS: https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/uit-go-dev-cluster"
echo "RDS: https://console.aws.amazon.com/rds/home?region=us-east-1"
echo "CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1"
echo "ECR: https://console.aws.amazon.com/ecr/repositories?region=us-east-1"
```

### Application Endpoints

```bash
ALB=$(terraform output -raw alb_dns_name)
echo "User Service:   http://$ALB/api/users"
echo "Trip Service:   http://$ALB/api/trips"
echo "Driver Service: http://$ALB/api/drivers"
```

## ⚡ Power User Tips

### Format All Files

```bash
make fmt
```

### Validate Configuration

```bash
make validate
```

### Generate Dependency Graph

```bash
make graph
# Opens graph.png
```

### Run Security Scan

```bash
make security-scan
# Requires tfsec: brew install tfsec
```

### Watch Service Scaling

```bash
watch -n 5 'make status'
```

### Tail All Logs Simultaneously

```bash
# In separate terminals
make logs-user
make logs-trip
make logs-driver
```

## 📞 Support

For issues:

1. Check CloudWatch logs: `make logs-user`
2. Review service status: `make status`
3. Check Terraform state: `terraform show`
4. Review documentation: `make docs`

---

**Pro Tip:** Use the Makefile for all common operations - it's faster and safer! 🚀
