#!/bin/bash

# UIT-Go Infrastructure Destruction Script
# This script destroys all AWS resources created by Terraform

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

# Warning
log_warn "============================================"
log_warn "WARNING: This will destroy ALL resources!"
log_warn "This includes:"
log_warn "  - All ECS services and tasks"
log_warn "  - RDS databases (data will be lost)"
log_warn "  - ElastiCache clusters"
log_warn "  - Application Load Balancer"
log_warn "  - VPC and all networking"
log_warn "  - ECR repositories and images"
log_warn "  - CloudWatch logs"
log_warn "  - Secrets Manager secrets"
log_warn "============================================"
echo ""

read -p "Are you absolutely sure you want to destroy everything? (type 'destroy' to confirm): " confirm

if [ "$confirm" != "destroy" ]; then
    log_info "Destruction cancelled."
    exit 0
fi

log_warn "Last chance to cancel..."
sleep 3

cd infrastructure/terraform

log_info "Destroying infrastructure..."
terraform destroy

log_info "All resources have been destroyed."
