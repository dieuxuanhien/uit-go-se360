.PHONY: help init plan apply deploy destroy build-push clean validate fmt

# Default AWS region
AWS_REGION ?= us-east-1

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)UIT-Go Terraform Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

init: ## Initialize Terraform
	@echo "$(GREEN)Initializing Terraform...$(NC)"
	terraform init

validate: ## Validate Terraform configuration
	@echo "$(GREEN)Validating Terraform configuration...$(NC)"
	terraform validate

fmt: ## Format Terraform files
	@echo "$(GREEN)Formatting Terraform files...$(NC)"
	terraform fmt -recursive

plan: ## Plan infrastructure changes
	@echo "$(GREEN)Planning infrastructure changes...$(NC)"
	terraform plan

apply: ## Apply infrastructure changes
	@echo "$(YELLOW)Applying infrastructure changes...$(NC)"
	terraform apply

deploy: init validate plan ## Full deployment (init, validate, plan, apply)
	@echo "$(GREEN)Deploying infrastructure...$(NC)"
	./deploy.sh

build-push: ## Build and push Docker images to ECR
	@echo "$(GREEN)Building and pushing Docker images...$(NC)"
	./build-and-push.sh

update: build-push ## Update ECS services with new images
	@echo "$(GREEN)Updating ECS services...$(NC)"
	terraform apply -auto-approve

destroy: ## Destroy all infrastructure
	@echo "$(RED)Destroying infrastructure...$(NC)"
	./destroy.sh

clean: ## Clean Terraform files
	@echo "$(GREEN)Cleaning Terraform files...$(NC)"
	rm -rf .terraform
	rm -f .terraform.lock.hcl
	rm -f tfplan
	rm -f terraform.tfstate.backup

outputs: ## Show Terraform outputs
	@echo "$(GREEN)Terraform Outputs:$(NC)"
	@terraform output

logs-user: ## Tail user service logs
	@echo "$(GREEN)Tailing user service logs...$(NC)"
	aws logs tail /ecs/uit-go/dev/user-service --follow --region $(AWS_REGION)

logs-trip: ## Tail trip service logs
	@echo "$(GREEN)Tailing trip service logs...$(NC)"
	aws logs tail /ecs/uit-go/dev/trip-service --follow --region $(AWS_REGION)

logs-driver: ## Tail driver service logs
	@echo "$(GREEN)Tailing driver service logs...$(NC)"
	aws logs tail /ecs/uit-go/dev/driver-service --follow --region $(AWS_REGION)

status: ## Show ECS service status
	@echo "$(GREEN)ECS Cluster Status:$(NC)"
	@aws ecs describe-clusters --clusters uit-go-dev-cluster --region $(AWS_REGION) --query 'clusters[0].[clusterName,status,runningTasksCount,pendingTasksCount]' --output table
	@echo ""
	@echo "$(GREEN)Services Status:$(NC)"
	@aws ecs describe-services --cluster uit-go-dev-cluster --services uit-go-dev-user-service uit-go-dev-trip-service uit-go-dev-driver-service --region $(AWS_REGION) --query 'services[*].[serviceName,status,runningCount,desiredCount]' --output table

costs: ## Estimate monthly costs
	@echo "$(GREEN)Cost Estimation:$(NC)"
	@echo "Development Environment: ~$$160/month"
	@echo "  - ECS Fargate: $$30"
	@echo "  - RDS (2x t3.micro): $$30"
	@echo "  - ElastiCache (1x t3.micro): $$15"
	@echo "  - NAT Gateways: $$60"
	@echo "  - ALB: $$20"
	@echo "  - Misc: $$5"

alb-url: ## Get ALB URL
	@echo "$(GREEN)Application Load Balancer URL:$(NC)"
	@terraform output -raw alb_dns_name

test-health: ## Test health endpoints
	@echo "$(GREEN)Testing health endpoints...$(NC)"
	@ALB=$$(terraform output -raw alb_dns_name); \
	echo "User Service: http://$$ALB/api/users/health"; \
	curl -s "http://$$ALB/api/users/health" || echo "$(RED)Failed$(NC)"; \
	echo ""; \
	echo "Trip Service: http://$$ALB/api/trips/health"; \
	curl -s "http://$$ALB/api/trips/health" || echo "$(RED)Failed$(NC)"; \
	echo ""; \
	echo "Driver Service: http://$$ALB/api/drivers/health"; \
	curl -s "http://$$ALB/api/drivers/health" || echo "$(RED)Failed$(NC)"

ecr-login: ## Login to ECR
	@echo "$(GREEN)Logging in to ECR...$(NC)"
	@aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $$(terraform output -raw user_service_repository_url | cut -d'/' -f1)

secrets: ## Show secrets (ARNs only)
	@echo "$(GREEN)Secrets Manager ARNs:$(NC)"
	@terraform output | grep secret_arn

dashboard: ## Open CloudWatch dashboard
	@echo "$(GREEN)CloudWatch Dashboard:$(NC)"
	@echo "https://console.aws.amazon.com/cloudwatch/home?region=$(AWS_REGION)#dashboards:name=$$(terraform output -raw dashboard_name)"

docs: ## Open documentation
	@echo "$(GREEN)Opening documentation...$(NC)"
	@cat README.md

graph: ## Generate Terraform dependency graph
	@echo "$(GREEN)Generating Terraform graph...$(NC)"
	terraform graph | dot -Tpng > graph.png
	@echo "Graph saved to graph.png"

security-scan: ## Run tfsec security scan
	@echo "$(GREEN)Running security scan...$(NC)"
	@if command -v tfsec > /dev/null; then \
		tfsec .; \
	else \
		echo "$(YELLOW)tfsec not installed. Install with: brew install tfsec$(NC)"; \
	fi

.DEFAULT_GOAL := help
