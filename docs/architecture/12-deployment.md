## **SECTION 12: DEPLOYMENT ARCHITECTURE**

Defining deployment strategy based on AWS ECS Fargate platform choice.

### **12.1 Deployment Strategy**

**Backend Deployment:**

-**Platform:** AWS ECS Fargate (serverless container orchestration)

-**Build Process:** Multi-stage Docker builds for optimized image size

-**Container Registry:** AWS ECR (Elastic Container Registry)

-**Deployment Method:** Rolling updates with health checks

-**Infrastructure:** 100% Terraform-managed

**Service Deployment Configuration:**

| Service       | Port | Min Tasks | Max Tasks | CPU | Memory  | Health Check Path |

| ------------- | ---- | --------- | --------- | --- | ------- | ----------------- |

| UserService   | 3001 | 2         | 4         | 512 | 1024 MB | /health           |

| TripService   | 3002 | 2         | 4         | 512 | 1024 MB | /health           |

| DriverService | 3003 | 2         | 4         | 512 | 1024 MB | /health           |

**Build Commands:**

```bash

# Build production Docker images

dockerbuild-tuser-service:latest-fservices/user-service/Dockerfile.

dockerbuild-ttrip-service:latest-fservices/trip-service/Dockerfile.

dockerbuild-tdriver-service:latest-fservices/driver-service/Dockerfile.


# Tag for ECR

dockertaguser-service:latest123456789.dkr.ecr.us-east-1.amazonaws.com/user-service:latest

dockertagtrip-service:latest123456789.dkr.ecr.us-east-1.amazonaws.com/trip-service:latest

dockertagdriver-service:latest123456789.dkr.ecr.us-east-1.amazonaws.com/driver-service:latest


# Push to ECR

dockerpush123456789.dkr.ecr.us-east-1.amazonaws.com/user-service:latest

dockerpush123456789.dkr.ecr.us-east-1.amazonaws.com/trip-service:latest

dockerpush123456789.dkr.ecr.us-east-1.amazonaws.com/driver-service:latest

```

**Dockerfile (Multi-stage Build Example):**

```dockerfile

# ============================================

# services/user-service/Dockerfile

# ============================================


# Stage 1: Dependencies

FROM node:20-alpine AS deps

WORKDIR /app


# Install pnpm

RUN npm install -g pnpm@8


# Copy workspace files

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

COPY services/user-service/package.json ./services/user-service/

COPY packages/shared-types/package.json ./packages/shared-types/

COPY packages/common-utils/package.json ./packages/common-utils/


# Install dependencies

RUN pnpm install --frozen-lockfile


# Stage 2: Build

FROM node:20-alpine AS builder

WORKDIR /app


RUN npm install -g pnpm@8


# Copy dependencies from deps stage

COPY --from=deps /app/node_modules ./node_modules

COPY --from=deps /app/services/user-service/node_modules ./services/user-service/node_modules

COPY --from=deps /app/packages ./packages


# Copy source code

COPY services/user-service ./services/user-service

COPY packages ./packages

COPY tsconfig.json ./


# Generate Prisma client

WORKDIR /app/services/user-service

RUN pnpm prisma generate


# Build application

RUN pnpm build


# Stage 3: Production

FROM node:20-alpine AS production

WORKDIR /app


RUN npm install -g pnpm@8


# Copy built application

COPY --from=builder /app/services/user-service/dist ./dist

COPY --from=builder /app/services/user-service/node_modules ./node_modules

COPY --from=builder /app/services/user-service/package.json ./package.json

COPY --from=builder /app/services/user-service/prisma ./prisma


# Create non-root user

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

USER nodejs


# Expose port

EXPOSE 3001


# Health check

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \

CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"


# Start application

CMD ["node", "dist/main.js"]


# Stage 4: Development (for Docker Compose)

FROM node:20-alpine AS development

WORKDIR /app


RUN npm install -g pnpm@8


COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

COPY services/user-service/package.json ./services/user-service/

COPY packages/shared-types/package.json ./packages/shared-types/

COPY packages/common-utils/package.json ./packages/common-utils/


RUN pnpm install


COPY services/user-service ./services/user-service

COPY packages ./packages

COPY tsconfig.json ./


WORKDIR /app/services/user-service


EXPOSE 3001


CMD ["pnpm", "run", "start:dev"]

```

---

### **12.2 CI/CD Pipeline**

**GitHub Actions Workflow:**

```yaml

# ============================================

# .github/workflows/ci.yml

# CI Pipeline: Test and Lint on PRs

# ============================================

name: CI


on:

pull_request:

branches: [main, develop]


jobs:

test:

runs-on: ubuntu-latest


services:

postgres:

image: postgres:15-alpine

env:

POSTGRES_USER: postgres

POSTGRES_PASSWORD: postgres

POSTGRES_DB: test

options: >-

          --health-cmd pg_isready

          --health-interval 10s

          --health-timeout 5s

          --health-retries 5

ports:

          - 5432:5432


redis:

image: redis:7-alpine

options: >-

          --health-cmd "redis-cli ping"

          --health-interval 10s

          --health-timeout 5s

          --health-retries 5

ports:

          - 6379:6379


steps:

      - name: Checkout code

uses: actions/checkout@v4


      - name: Setup Node.js

uses: actions/setup-node@v4

with:

node-version: '20'


      - name: Setup pnpm

uses: pnpm/action-setup@v2

with:

version: 8


      - name: Get pnpm store directory

id: pnpm-cache

run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT


      - name: Setup pnpm cache

uses: actions/cache@v3

with:

path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}

key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}

restore-keys: |

            ${{ runner.os }}-pnpm-store-


      - name: Install dependencies

run: pnpm install --frozen-lockfile


      - name: Generate Prisma clients

run: pnpm prisma:generate


      - name: Run migrations

run: pnpm migrate:deploy

env:

DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test


      - name: Lint

run: pnpm lint


      - name: Type check

run: pnpm typecheck


      - name: Run unit tests

run: pnpm test


      - name: Run E2E tests

run: pnpm test:e2e

env:

DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

REDIS_URL: redis://localhost:6379


      - name: Upload coverage

uses: codecov/codecov-action@v3

with:

files: ./coverage/lcov.info


# ============================================

# .github/workflows/build-and-push.yml

# Build Docker images and push to ECR

# ============================================

name: Build and Push


on:

push:

branches: [main]

workflow_dispatch:


env:

AWS_REGION: us-east-1

ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}


jobs:

build-and-push:

runs-on: ubuntu-latest


strategy:

matrix:

service: [user-service, trip-service, driver-service]


steps:

      - name: Checkout code

uses: actions/checkout@v4


      - name: Configure AWS credentials

uses: aws-actions/configure-aws-credentials@v4

with:

aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}

aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

aws-region: ${{ env.AWS_REGION }}


      - name: Login to Amazon ECR

id: login-ecr

uses: aws-actions/amazon-ecr-login@v2


      - name: Set up Docker Buildx

uses: docker/setup-buildx-action@v3


      - name: Extract metadata

id: meta

uses: docker/metadata-action@v5

with:

images: ${{ env.ECR_REGISTRY }}/${{ matrix.service }}

tags: |

            type=ref,event=branch

            type=sha,prefix={{branch}}-

            type=raw,value=latest,enable={{is_default_branch}}


      - name: Build and push Docker image

uses: docker/build-push-action@v5

with:

context: .

file: services/${{ matrix.service }}/Dockerfile

target: production

push: true

tags: ${{ steps.meta.outputs.tags }}

labels: ${{ steps.meta.outputs.labels }}

cache-from: type=gha

cache-to: type=gha,mode=max


      - name: Output image digest

run: echo ${{ steps.build-and-push.outputs.digest }}


# ============================================

# .github/workflows/deploy.yml

# Deploy to AWS ECS

# ============================================

name: Deploy to ECS


on:

workflow_run:

workflows: ["Build and Push"]

types: [completed]

branches: [main]

workflow_dispatch:

inputs:

environment:

description: 'Environment to deploy to'

required: true

default: 'dev'

type: choice

options:

          - dev

          - prod


jobs:

deploy:

runs-on: ubuntu-latest

if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}


strategy:

matrix:

service: [user-service, trip-service, driver-service]


steps:

      - name: Checkout code

uses: actions/checkout@v4


      - name: Configure AWS credentials

uses: aws-actions/configure-aws-credentials@v4

with:

aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}

aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

aws-region: us-east-1


      - name: Download task definition

run: |

          aws ecs describe-task-definition \

            --task-definition uitgo-${{ matrix.service }}-${{ inputs.environment || 'dev' }} \

            --query taskDefinition > task-definition.json


      - name: Fill in new image ID in task definition

id: task-def

uses: aws-actions/amazon-ecs-render-task-definition@v1

with:

task-definition: task-definition.json

container-name: ${{ matrix.service }}

image: ${{ secrets.ECR_REGISTRY }}/${{ matrix.service }}:latest


      - name: Deploy to ECS

uses: aws-actions/amazon-ecs-deploy-task-definition@v1

with:

task-definition: ${{ steps.task-def.outputs.task-definition }}

service: uitgo-${{ matrix.service }}-${{ inputs.environment || 'dev' }}

cluster: uitgo-cluster-${{ inputs.environment || 'dev' }}

wait-for-service-stability: true


      - name: Notify deployment

run: |

          echo "Deployed ${{ matrix.service }} to ${{ inputs.environment || 'dev' }}"


# ============================================

# .github/workflows/terraform.yml

# Terraform validation and apply

# ============================================

name: Terraform


on:

push:

branches: [main]

paths:

      - 'infrastructure/terraform/**'

pull_request:

paths:

      - 'infrastructure/terraform/**'


jobs:

terraform:

runs-on: ubuntu-latest

defaults:

run:

working-directory: infrastructure/terraform/environments/dev


steps:

      - name: Checkout code

uses: actions/checkout@v4


      - name: Setup Terraform

uses: hashicorp/setup-terraform@v3

with:

terraform_version: 1.6.0


      - name: Configure AWS credentials

uses: aws-actions/configure-aws-credentials@v4

with:

aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}

aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

aws-region: us-east-1


      - name: Terraform Init

run: terraform init


      - name: Terraform Format Check

run: terraform fmt -check -recursive


      - name: Terraform Validate

run: terraform validate


      - name: Terraform Plan

id: plan

run: terraform plan -no-color

continue-on-error: true


      - name: Comment PR with plan

if: github.event_name == 'pull_request'

uses: actions/github-script@v7

with:

github-token: ${{ secrets.GITHUB_TOKEN }}

script: |

            const output = `#### Terraform Plan 📖


            \`\`\`

            ${{ steps.plan.outputs.stdout }}

            \`\`\`

            `;


            github.rest.issues.createComment({

              issue_number: context.issue.number,

              owner: context.repo.owner,

              repo: context.repo.repo,

              body: output

            });


      - name: Terraform Apply

if: github.ref == 'refs/heads/main' && github.event_name == 'push'

run: terraform apply -auto-approve

```

---

### **12.3 Environments**

| Environment           | Frontend URL | Backend URL                       | Purpose                         |

| --------------------- | ------------ | --------------------------------- | ------------------------------- |

| **Local**       | N/A          | http://localhost:3000             | Docker Compose development      |

| **Development** | N/A          | https://api-dev.uitgo.example.com | AWS dev environment for testing |

| **Production**  | N/A          | https://api.uitgo.example.com     | Live production environment     |

**Environment Configuration:**

**Development Environment:**

-**AWS Account:** Separate dev account (recommended) or same account with different VPC

-**Infrastructure:** Smaller instance sizes (t3.micro RDS, cache.t3.micro ElastiCache)

-**ECS Tasks:** Min 1, Max 2 per service

-**Database:** RDS Single-AZ, automated backups

-**Cost:** ~$50-80/month

**Production Environment:**

-**AWS Account:** Dedicated production account

-**Infrastructure:** Production-sized instances (db.t3.small RDS, cache.t3.small ElastiCache)

-**ECS Tasks:** Min 2, Max 4 per service (high availability)

-**Database:** RDS Multi-AZ, automated backups with extended retention

-**Cost:** ~$150-200/month

---

### **12.4 Deployment Process**

**Manual Deployment (Initial Setup):**

```bash

# 1. Configure AWS credentials

awsconfigure

AWSAccessKeyID:YOUR_ACCESS_KEY

AWSSecretAccessKey:YOUR_SECRET_KEY

Defaultregionname:us-east-1


# 2. Create ECR repositories

awsecrcreate-repository--repository-nameuser-service

awsecrcreate-repository--repository-nametrip-service

awsecrcreate-repository--repository-namedriver-service


# 3. Build and push initial images

./scripts/build-and-push.sh


# 4. Initialize Terraform

cdinfrastructure/terraform/environments/dev

terraforminit


# 5. Create infrastructure

terraformplan

terraformapply


# 6. Run database migrations

./scripts/run-migrations.shdev


# 7. Verify deployment

curlhttps://api-dev.uitgo.example.com/health

```

**Automated Deployment (via CI/CD):**

```bash

# 1. Make code changes

gitcheckout-bfeature/new-feature


# 2. Commit and push

gitcommit-m"feat: add new feature"

gitpushoriginfeature/new-feature


# 3. Create PR (triggers CI workflow)

# - GitHub Actions runs tests

# - Code review


# 4. Merge PR to main

# - Build and Push workflow triggers

# - Builds Docker images

# - Pushes to ECR


# 5. Deploy workflow triggers automatically

# - Updates ECS task definitions

# - Rolling update to ECS services

# - Health checks verify deployment


# 6. Monitor deployment

awsecsdescribe-services\

  --cluster uitgo-cluster-dev \

--servicesuitgo-user-service-dev


# 7. View logs

awslogstail/ecs/user-service--follow

```

**Rollback Procedure:**

```bash

# 1. Identify previous task definition

awsecslist-task-definitions\

  --family-prefix uitgo-user-service-dev \

--sortDESC


# 2. Update service to previous version

awsecsupdate-service\

  --cluster uitgo-cluster-dev \

--serviceuitgo-user-service-dev\

  --task-definition uitgo-user-service-dev:5


# 3. Wait for rollback to complete

awsecswaitservices-stable\

  --cluster uitgo-cluster-dev \

--servicesuitgo-user-service-dev


# 4. Verify rollback

curlhttps://api-dev.uitgo.example.com/health

```

---

### **Detailed Rationale:**

**Deployment Architecture Decisions:**

1.**Multi-stage Docker Builds:**

- Stage 1: Install dependencies
- Stage 2: Build TypeScript
- Stage 3: Production image (smallest size)
- Stage 4: Development image (hot reload)

-**Benefit:** Production images ~150MB vs ~1GB with dev dependencies

2.**ECS Fargate vs EC2:**

-**Why Fargate:** No server management, pay-per-use, auto-scaling

-**Trade-off:** Slightly more expensive than EC2 Spot, but simpler operations

-**Cost:** ~$30/month per service (2 tasks × 0.5 vCPU × 1GB RAM)

3.**Rolling Updates:**

- ECS deploys new tasks before draining old ones
- Zero downtime deployments
- Health checks verify new tasks before traffic routing

4.**GitHub Actions vs Jenkins/GitLab:**

-**Why GitHub Actions:** Native GitHub integration, free for public repos

-**Matrix strategy:** Build all services in parallel

-**Caching:** Docker layer caching speeds up builds

5.**Separate ECR Repositories:**

- One repository per service
- Independent versioning and rollback
- Faster builds (only changed services rebuild)

6.**Environment Strategy:**

-**Local:** Docker Compose (identical to production stack)

-**Dev:** AWS environment for integration testing

-**Prod:** Production with Multi-AZ, backups, monitoring

7.**Health Checks:**

- Application-level: `/health` endpoint returns service status
- ALB-level: Target group health checks
- Docker-level: HEALTHCHECK instruction

-**Defense in depth:** Multiple layers catch failures

8.**Secrets Management:**

- Never commit secrets to Git
- GitHub Secrets for CI/CD credentials
- AWS Secrets Manager for application secrets
- ECS task IAM roles for AWS service access

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Security and Performance)

2.**Expand or Contract for Audience** - Adjust deployment detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into deployment design

4.**Critique and Refine** - Challenge these deployment choices

5.**Analyze Logical Flow and Dependencies** - Review deployment coherence

6.**Assess Alignment with Overall Goals** - Verify deployment strategy

7.**Identify Potential Risks and Unforeseen Issues** - Deployment risks?

8.**Challenge from Critical Perspective** - Devil's advocate on ECS Fargate

9.**Tree of Thoughts Deep Dive** - Explore alternative deployment strategies

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Security and Performance section.

---
