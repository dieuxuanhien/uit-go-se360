#!/bin/bash

# UIT-Go Infrastructure Deployment Script
# This script automates the deployment of the UIT-Go infrastructure on AWS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install Terraform 1.6.0 or later."
        exit 1
    fi
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install AWS CLI."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials are not configured. Please run 'aws configure'."
        exit 1
    fi
    
    log_info "All prerequisites met!"
}

# Initialize Terraform
init_terraform() {
    log_info "Initializing Terraform..."
    cd infrastructure/terraform
    terraform init
}

# Validate Terraform configuration
validate_terraform() {
    log_info "Validating Terraform configuration..."
    terraform validate
    
    if [ $? -eq 0 ]; then
        log_info "Terraform configuration is valid!"
    else
        log_error "Terraform configuration is invalid. Please fix the errors."
        exit 1
    fi
}

# Plan infrastructure
plan_infrastructure() {
    log_info "Planning infrastructure changes..."
    terraform plan -out=tfplan
}

# Apply infrastructure
apply_infrastructure() {
    log_info "Applying infrastructure changes..."
    log_warn "This will create resources in AWS and may incur costs."
    
    read -p "Do you want to proceed? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "Deployment cancelled."
        exit 0
    fi
    
    terraform apply tfplan
    rm tfplan
    
    log_info "Infrastructure deployed successfully!"
}

# Get outputs
get_outputs() {
    log_info "Getting infrastructure outputs..."
    
    export USER_SERVICE_REPO=$(terraform output -raw user_service_repository_url)
    export TRIP_SERVICE_REPO=$(terraform output -raw trip_service_repository_url)
    export DRIVER_SERVICE_REPO=$(terraform output -raw driver_service_repository_url)
    export ALB_DNS=$(terraform output -raw alb_dns_name)
    export AWS_REGION=$(terraform output -json deployment_summary | jq -r '.region')
    
    log_info "ECR Repositories:"
    echo "  User Service: $USER_SERVICE_REPO"
    echo "  Trip Service: $TRIP_SERVICE_REPO"
    echo "  Driver Service: $DRIVER_SERVICE_REPO"
    echo ""
    log_info "Application Load Balancer: http://$ALB_DNS"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    cd ../..
    
    # Login to ECR
    log_info "Logging in to ECR..."
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $USER_SERVICE_REPO
    
    # Build and push User Service
    log_info "Building User Service..."
    docker build -t $USER_SERVICE_REPO:latest -f services/user-service/Dockerfile .
    log_info "Pushing User Service..."
    docker push $USER_SERVICE_REPO:latest
    
    # Build and push Trip Service
    log_info "Building Trip Service..."
    docker build -t $TRIP_SERVICE_REPO:latest -f services/trip-service/Dockerfile .
    log_info "Pushing Trip Service..."
    docker push $TRIP_SERVICE_REPO:latest
    
    # Build and push Driver Service
    log_info "Building Driver Service..."
    docker build -t $DRIVER_SERVICE_REPO:latest -f services/driver-service/Dockerfile .
    log_info "Pushing Driver Service..."
    docker push $DRIVER_SERVICE_REPO:latest
    
    log_info "All images built and pushed successfully!"
    
    cd infrastructure/terraform
}

# Update ECS services
update_ecs_services() {
    log_info "Updating ECS services with new images..."
    terraform apply -auto-approve
    log_info "ECS services updated!"
}

# Display summary
display_summary() {
    log_info "=== Deployment Summary ==="
    echo ""
    log_info "Application Load Balancer: http://$ALB_DNS"
    echo ""
    log_info "Service Endpoints:"
    echo "  User Service: http://$ALB_DNS/api/users"
    echo "  Trip Service: http://$ALB_DNS/api/trips"
    echo "  Driver Service: http://$ALB_DNS/api/drivers"
    echo ""
    log_info "CloudWatch Logs:"
    echo "  aws logs tail /ecs/uit-go/dev/user-service --follow"
    echo "  aws logs tail /ecs/uit-go/dev/trip-service --follow"
    echo "  aws logs tail /ecs/uit-go/dev/driver-service --follow"
    echo ""
    log_warn "Note: ECS tasks may take 2-3 minutes to start and become healthy."
    echo ""
}

# Main execution
main() {
    log_info "Starting UIT-Go Infrastructure Deployment..."
    echo ""
    
    check_prerequisites
    init_terraform
    validate_terraform
    plan_infrastructure
    apply_infrastructure
    get_outputs
    
    log_warn "Infrastructure is ready. Do you want to build and push Docker images now?"
    read -p "Build and push images? (yes/no): " build_confirm
    
    if [ "$build_confirm" = "yes" ]; then
        build_and_push_images
        update_ecs_services
    else
        log_info "Skipping image build. You can build and push images later using:"
        log_info "./scripts/build-and-push.sh"
    fi
    
    display_summary
    
    log_info "Deployment completed successfully!"
}

# Run main function
main
