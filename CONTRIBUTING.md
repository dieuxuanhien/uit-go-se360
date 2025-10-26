# Contributing Guide

Welcome to the UIT-Go project! This guide explains how to set up your environment, run tests, and prepare code for submission.

## Table of Contents

1. [Setup & Installation](#setup--installation)
2. [Development Workflow](#development-workflow)
3. [Running Tests](#running-tests)
4. [Code Quality Standards](#code-quality-standards)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [GitHub Secrets Configuration](#github-secrets-configuration)
7. [Branch Protection Rules](#branch-protection-rules)
8. [Troubleshooting](#troubleshooting)

---

## Setup & Installation

### Prerequisites

Ensure you have the following installed:

```bash
node --version    # v20.x or higher
pnpm --version    # v8.x or higher
docker --version  # v24.x or higher
```

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/dieuxuanhien/uit-go-se360.git
cd uit-go-se360

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start databases with Docker Compose
docker compose up -d

# Verify setup
docker compose ps
```

---

## Development Workflow

### Available Scripts

**Local Development:**

```bash
pnpm dev              # Start all services in development mode
pnpm build            # Build all services
pnpm test             # Run all tests
pnpm test:watch      # Run tests in watch mode
pnpm test:cov        # Run tests with coverage reports
```

**Code Quality:**

```bash
pnpm lint            # Run ESLint to check code quality
pnpm lint:fix        # Auto-fix ESLint issues
pnpm format          # Auto-format code with Prettier
pnpm format --check  # Check formatting without changes
pnpm typecheck       # TypeScript type checking
```

**Database:**

```bash
pnpm prisma:generate   # Generate Prisma clients for all services
pnpm migrate:dev       # Run migrations in development
pnpm migrate:deploy    # Run migrations in production
```

### Git Workflow

1. **Create a feature branch:**

```bash
git checkout -b feature/my-feature
```

2. **Make your changes and commit:**

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat(service-name): add new feature"
git commit -m "fix(auth): resolve JWT validation bug"
git commit -m "docs(readme): update setup instructions"
```

3. **Push to GitHub:**

```bash
git push origin feature/my-feature
```

4. **Create a Pull Request and ensure CI passes:**

All checks must pass before merging:

- ✅ ESLint (code quality)
- ✅ Prettier (formatting)
- ✅ TypeScript (type checking)
- ✅ Tests (80% coverage minimum)
- ✅ Docker builds (all services)
- ✅ Terraform validation (infrastructure)

---

## Running Tests

### Local Testing

```bash
# Run all tests in all workspaces
pnpm test

# Run tests for specific service
pnpm --filter user-service test

# Run tests in watch mode (re-run on changes)
pnpm test:watch

# Run tests with coverage report
pnpm test:cov

# Debug tests (opens inspector)
pnpm --filter user-service run test:debug
```

### Test Coverage Requirements

- **Minimum coverage:** 80% of lines
- **Target coverage:** 80%+ for all metrics (lines, branches, functions, statements)

Coverage reports are generated in `services/{service}/coverage/` after running `pnpm test:cov`.

### E2E Testing

```bash
# Run end-to-end tests for user-service
pnpm --filter user-service run test:e2e
```

---

## Code Quality Standards

### ESLint Rules

The project enforces TypeScript best practices:

- ✅ No implicit `any` types (except in tests)
- ✅ No unused variables (enforced with linter)
- ✅ No floating promises (must use `await`)
- ✅ No `console.log` in production code (only `warn`, `error`, `info`)

**Fix ESLint issues automatically:**

```bash
pnpm lint:fix
```

### Prettier Formatting

All code must be formatted according to these rules:

- **Print width:** 100 characters
- **Single quotes:** enabled
- **Trailing commas:** all
- **Tab width:** 2 spaces
- **Arrow parentheses:** always

**Auto-format all code:**

```bash
pnpm format
```

### Naming Conventions

| Element               | Convention             | Example                             |
| --------------------- | ---------------------- | ----------------------------------- |
| Files                 | kebab-case             | `auth.controller.ts`                |
| Directories           | kebab-case             | `driver-profiles/`                  |
| Classes/Services      | PascalCase + suffix    | `AuthService`, `TripsController`    |
| Functions/Variables   | camelCase              | `calculateFare()`, `userId`         |
| Constants             | SCREAMING_SNAKE_CASE   | `JWT_SECRET`, `MAX_RETRY_ATTEMPTS`  |
| Environment Variables | SCREAMING_SNAKE_CASE   | `DATABASE_URL`, `JWT_SECRET`        |
| Git branches          | kebab-case with prefix | `feature/add-auth`, `fix/login-bug` |

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting changes (no logic change)
- `refactor`: Code refactoring (no feature or bug fix)
- `perf`: Performance improvements
- `test`: Test-related changes
- `chore`: Build, dependencies, tooling

**Examples:**

```bash
feat(trip): add cancellation fee calculation
fix(auth): resolve JWT token expiration bug
docs(readme): update deployment instructions
refactor(user): simplify password validation logic
test(auth): add login endpoint tests
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

Two workflows automate testing and deployment:

#### 1. PR Workflow (`ci-pr.yml`)

**Triggered:** On pull requests to any branch  
**Runs:**

- ESLint code quality checks
- Prettier formatting checks
- TypeScript type checking
- Jest tests (unit + integration)
- Test coverage verification (80% minimum)
- Terraform validation
- Docker image builds (all services)

**Status checks must pass before merging to main.**

#### 2. Deploy Workflow (`cd-deploy.yml`)

**Triggered:** On push to `main` branch  
**Runs:**

- All pre-deployment checks (same as PR workflow)
- Docker image builds for all services
- Push images to AWS ECR with commit SHA tag
- Tag latest images

### Workflow Configuration

Workflows are defined in `.github/workflows/`:

- `ci-pr.yml` - Pull request validation
- `cd-deploy.yml` - Main branch deployment

View workflow status in GitHub Actions tab of the repository.

---

## GitHub Secrets Configuration

### Required Secrets

The CI/CD pipeline requires AWS credentials to push Docker images to ECR. Configure these secrets in GitHub:

1. Go to **GitHub Repository** → **Settings** → **Secrets and variables** → **Actions**

2. Add the following secrets:

| Secret Name             | Description                    |
| ----------------------- | ------------------------------ |
| `AWS_ACCESS_KEY_ID`     | AWS IAM user access key        |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key        |
| `AWS_ACCOUNT_ID`        | AWS account number (12 digits) |
| `AWS_REGION`            | AWS region (e.g., `us-east-1`) |

### Creating AWS Credentials

To create AWS credentials for GitHub Actions:

1. **In AWS Console:**
   - Go to IAM → Users
   - Create a new user (e.g., `github-actions`)
   - Assign policy: `AmazonEC2ContainerRegistryPowerUser` (for ECR access)
   - Create access keys

2. **In GitHub:**
   - Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as repository secrets
   - Never commit credentials to the repository

### Secret Security Best Practices

✅ **Do:**

- Store all secrets in GitHub Secrets (not in code)
- Rotate credentials regularly
- Use least-privilege IAM policies
- Review secret usage in workflows

❌ **Don't:**

- Commit secrets to the repository
- Log secrets in workflow output (GitHub masks them automatically)
- Use personal AWS credentials (create service account instead)
- Hardcode credentials anywhere

---

## Branch Protection Rules

The `main` branch is protected with the following rules:

1. **Require status checks to pass** - All workflow jobs must succeed
2. **Require code review** - Minimum 1 approval before merge
3. **Dismiss stale approvals** - Reviews invalidated by new commits
4. **Require branches to be up to date** - Must be rebased with main
5. **Include administrators** - Rules apply to all users including admins

To merge to `main`, your PR must:

- ✅ Have all CI checks passing
- ✅ Have at least 1 approval
- ✅ Be up to date with `main` branch
- ✅ Have no conflicting changes

---

## Local Workflow Testing

### Testing with `act`

You can test GitHub Actions workflows locally using the `act` tool without pushing to GitHub.

### Installation

**macOS:**

```bash
brew install act
```

**Linux:**

```bash
# Using Docker
docker run --rm -v $(pwd):/tmp/act -w /tmp/act nektos/act --version

# Or download binary
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | bash
```

**Windows:**

```powershell
choco install act-cli
```

### Running Workflows Locally

**Test PR workflow (code quality checks):**

```bash
act pull_request --job code-quality
act pull_request --job type-check
act pull_request --job tests
```

**Test all PR checks:**

```bash
act pull_request
```

**Test deployment workflow (requires secrets):**

```bash
# Create .actrc file with secrets
echo "AWS_ACCESS_KEY_ID=xxx" > .actrc
echo "AWS_SECRET_ACCESS_KEY=xxx" >> .actrc
echo "AWS_ACCOUNT_ID=123456789012" >> .actrc
echo "AWS_REGION=us-east-1" >> .actrc

# Run deployment workflow
act push --branch main
```

### Workflow Events

Available events to test:

- `act pull_request` - Simulate PR workflow
- `act push --branch main` - Simulate deployment workflow
- `act schedule` - Test scheduled workflows (if any)

### Limitations

- `act` runs workflows in Docker containers, which may behave differently than GitHub Actions runners
- Some GitHub-specific variables may not be available
- Matrix strategies are supported but may be slower locally
- Cache actions may not work exactly as they do in GitHub

### Debugging

**View workflow logs:**

```bash
act -v  # Verbose output
```

**Run single job:**

```bash
act pull_request --job code-quality
```

**Use default branch:**

```bash
act -r  # Use current branch name
```

---

## Troubleshooting

### "pnpm install" Fails

**Symptom:** `Error: Workspaces not found`

**Solution:**

```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Or force fresh install
pnpm install --force
```

### Docker Compose Won't Start

**Symptom:** `Error response from daemon`

**Solution:**

```bash
# Stop all containers
docker compose down -v

# Start fresh
docker compose up -d

# Check status
docker compose ps
```

### Tests Fail with "Cannot find module"

**Symptom:** `Cannot find module '@uit-go/shared-types'`

**Solution:**

```bash
# Regenerate Prisma clients
pnpm prisma:generate

# Rebuild all packages
pnpm build

# Retry tests
pnpm test
```

### ESLint/Prettier Conflicts

**Symptom:** `Prettier & ESLint disagree on formatting`

**Solution:**

```bash
# Auto-fix all issues
pnpm lint:fix
pnpm format

# Verify no conflicts
pnpm lint
pnpm format --check
```

### Workflow Fails with AWS Credentials Error

**Symptom:** `Unable to locate credentials`

**Solution:**

1. Verify secrets are set in GitHub Settings
2. Confirm `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are in the repo
3. Check IAM user has `AmazonEC2ContainerRegistryPowerUser` policy
4. Regenerate credentials if expired

### Local Workflow Testing with `act`

To test workflows locally before pushing:

```bash
# Install act (GitHub Actions emulator)
brew install act  # macOS
# or download from https://github.com/nektos/act

# Test PR workflow
act pull_request

# Test deployment workflow
act push --branch main
```

### Performance Issues

**Slow tests:**

```bash
# Run tests in parallel
pnpm test -- --maxWorkers=4

# Run only changed tests
pnpm test -- --onlyChanged
```

**Slow builds:**

```bash
# Build only specific service
pnpm --filter user-service build

# Use turbo for incremental builds (optional)
# pnpm build -- --since=main
```

---

## Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Project Architecture](./docs/architecture/index.md)
- [Project PRD](./docs/prd/index.md)

---

## Getting Help

- Check the [Troubleshooting](#troubleshooting) section
- Review GitHub Actions logs: **GitHub** → **Actions** → **Workflow name** → **Failed job**
- Ask in project discussions or contact the team

Thank you for contributing! 🚀
