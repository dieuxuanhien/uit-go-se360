#!/bin/bash

# UIT-Go Docker Build and Push Script
# This script builds and pushes Docker images to ECR

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

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if in correct directory
if [ ! -f "infrastructure/terraform/main.tf" ]; then
    log_error "Please run this script from the project root directory"
    exit 1
fi

# Get ECR repository URLs from Terraform
cd infrastructure/terraform

if [ ! -f "terraform.tfstate" ]; then
    log_error "Terraform state not found. Please run 'terraform apply' first."
    exit 1
fi

log_info "Getting ECR repository URLs..."
export USER_SERVICE_REPO=$(terraform output -raw user_service_repository_url)
export TRIP_SERVICE_REPO=$(terraform output -raw trip_service_repository_url)
export DRIVER_SERVICE_REPO=$(terraform output -raw driver_service_repository_url)
export AWS_REGION=$(terraform output -json deployment_summary | jq -r '.region')

cd ../..

# Login to ECR
log_info "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $USER_SERVICE_REPO

# Build and push User Service
log_info "Building User Service..."
docker build -t $USER_SERVICE_REPO:latest \
    -t $USER_SERVICE_REPO:$(git rev-parse --short HEAD) \
    -f services/user-service/Dockerfile .

log_info "Pushing User Service..."
docker push $USER_SERVICE_REPO:latest
docker push $USER_SERVICE_REPO:$(git rev-parse --short HEAD)

# Build and push Trip Service
log_info "Building Trip Service..."
docker build -t $TRIP_SERVICE_REPO:latest \
    -t $TRIP_SERVICE_REPO:$(git rev-parse --short HEAD) \
    -f services/trip-service/Dockerfile .

log_info "Pushing Trip Service..."
docker push $TRIP_SERVICE_REPO:latest
docker push $TRIP_SERVICE_REPO:$(git rev-parse --short HEAD)

# Build and push Driver Service
log_info "Building Driver Service..."
docker build -t $DRIVER_SERVICE_REPO:latest \
    -t $DRIVER_SERVICE_REPO:$(git rev-parse --short HEAD) \
    -f services/driver-service/Dockerfile .

log_info "Pushing Driver Service..."
docker push $DRIVER_SERVICE_REPO:latest
docker push $DRIVER_SERVICE_REPO:$(git rev-parse --short HEAD)

log_info "All images built and pushed successfully!"
log_info "To update ECS services, run: cd infrastructure/terraform && terraform apply"
