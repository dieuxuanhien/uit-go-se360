# UIT-Go Terraform Infrastructure

This directory contains Terraform configurations to deploy the UIT-Go application on AWS using ECS Fargate.

## Architecture Overview

The infrastructure includes:

- **VPC**: Multi-AZ VPC with public, private, and database subnets
- **ECS Fargate**: Serverless container orchestration for microservices
- **RDS PostgreSQL**: Managed databases for User and Trip services
- **ElastiCache Redis**: In-memory cache for Driver service location data
- **Application Load Balancer**: HTTP/HTTPS traffic distribution
- **ECR**: Container image repositories
- **CloudWatch**: Centralized logging and monitoring
- **Secrets Manager**: Secure credential storage
- **Auto Scaling**: CPU and memory-based scaling policies

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Terraform** >= 1.6.0 ([Install Terraform](https://www.terraform.io/downloads))
3. **AWS CLI** configured with credentials ([Install AWS CLI](https://aws.amazon.com/cli/))
4. **Docker** for building images ([Install Docker](https://docs.docker.com/get-docker/))

## Setup Instructions

### 1. Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and default region
```

### 2. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

### 3. Configure Variables

Copy the example variables file and customize it:

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your desired configuration
```

### 4. Plan Infrastructure

Review the infrastructure changes:

```bash
terraform plan
```

### 5. Apply Infrastructure

Deploy the infrastructure:

```bash
terraform apply
```

Type `yes` when prompted to confirm.

## Post-Deployment Steps

### 1. Build and Push Docker Images

After the infrastructure is created, build and push your Docker images to ECR:

```bash
# Get the ECR repository URLs from Terraform output
USER_SERVICE_REPO=$(terraform output -raw user_service_repository_url)
TRIP_SERVICE_REPO=$(terraform output -raw trip_service_repository_url)
DRIVER_SERVICE_REPO=$(terraform output -raw driver_service_repository_url)

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $USER_SERVICE_REPO

# Build and push images
cd ../../

# User Service
docker build -t $USER_SERVICE_REPO:latest -f services/user-service/Dockerfile .
docker push $USER_SERVICE_REPO:latest

# Trip Service
docker build -t $TRIP_SERVICE_REPO:latest -f services/trip-service/Dockerfile .
docker push $TRIP_SERVICE_REPO:latest

# Driver Service
docker build -t $DRIVER_SERVICE_REPO:latest -f services/driver-service/Dockerfile .
docker push $DRIVER_SERVICE_REPO:latest
```

### 2. Update ECS Services

After pushing images, update the ECS services:

```bash
cd infrastructure/terraform
terraform apply -auto-approve
```

### 3. Run Database Migrations

Connect to the RDS instances and run migrations. You can use an ECS task or a bastion host.

### 4. Access the Application

Get the Application Load Balancer DNS name:

```bash
terraform output alb_dns_name
```

Access your services:

- User Service: `http://<ALB_DNS>/api/users`
- Trip Service: `http://<ALB_DNS>/api/trips`
- Driver Service: `http://<ALB_DNS>/api/drivers`

## Module Structure

```
terraform/
├── main.tf                 # Root module configuration
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.tfvars        # Variable values (gitignored)
└── modules/
    ├── vpc/                # VPC and networking
    ├── security-groups/    # Security group definitions
    ├── iam/                # IAM roles and policies
    ├── secrets/            # Secrets Manager
    ├── rds/                # RDS PostgreSQL databases
    ├── elasticache/        # ElastiCache Redis
    ├── ecr/                # ECR repositories
    ├── alb/                # Application Load Balancer
    ├── cloudwatch/         # CloudWatch log groups
    └── ecs/                # ECS cluster and services
```

## Configuration Variables

Key variables you can customize in `terraform.tfvars`:

| Variable            | Description             | Default          |
| ------------------- | ----------------------- | ---------------- |
| `project_name`      | Project identifier      | `uit-go`         |
| `environment`       | Environment name        | `dev`            |
| `aws_region`        | AWS region              | `us-east-1`      |
| `db_instance_class` | RDS instance type       | `db.t3.micro`    |
| `redis_node_type`   | ElastiCache node type   | `cache.t3.micro` |
| `db_multi_az`       | Enable Multi-AZ for RDS | `false`          |
| `*_desired_count`   | Desired ECS tasks       | `2`              |
| `*_min_capacity`    | Min autoscaling tasks   | `2`              |
| `*_max_capacity`    | Max autoscaling tasks   | `4`              |

## Cost Optimization

For development:

- Use `db.t3.micro` and `cache.t3.micro` (free tier eligible)
- Set `db_multi_az = false`
- Set `redis_num_cache_nodes = 1`
- Use FARGATE for compute (pay per second)

For production:

- Use larger instance types
- Enable Multi-AZ for high availability
- Increase cache nodes for redundancy
- Enable deletion protection on critical resources

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will permanently delete all resources including databases. Make sure to backup any important data first.

## Security Considerations

1. **Secrets Management**: All sensitive data is stored in AWS Secrets Manager
2. **Network Isolation**: Services run in private subnets with no direct internet access
3. **Encryption**:
   - RDS encryption at rest enabled
   - ElastiCache encryption at rest enabled
   - ECR encryption enabled
4. **Least Privilege**: IAM roles follow principle of least privilege
5. **Security Groups**: Restrictive rules limiting traffic between components

## Monitoring

Access CloudWatch dashboards:

```bash
aws cloudwatch get-dashboard --dashboard-name $(terraform output -raw dashboard_name)
```

View logs:

```bash
aws logs tail /ecs/uit-go/dev/user-service --follow
aws logs tail /ecs/uit-go/dev/trip-service --follow
aws logs tail /ecs/uit-go/dev/driver-service --follow
```

## Troubleshooting

### ECS Tasks Not Starting

1. Check CloudWatch logs for errors
2. Verify ECR images are pushed
3. Check security group rules
4. Verify Secrets Manager secrets exist

### Database Connection Issues

1. Verify security group allows traffic from ECS
2. Check database credentials in Secrets Manager
3. Ensure database is in `available` state

### Redis Connection Issues

1. Verify Redis is in `available` state
2. Check security group rules
3. Verify endpoint in task definition

## Support

For issues or questions:

1. Check CloudWatch logs
2. Review AWS service status
3. Check Terraform state: `terraform show`

## License

This project is part of the UIT-Go academic project.
