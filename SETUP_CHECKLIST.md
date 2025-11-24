# 🚀 Quick Setup Checklist

Use this checklist when setting up the project for the first time or after pulling major changes.

## ✅ First-Time Setup (New Clone)

```bash
# 1. Install dependencies
cd /path/to/uit-go-se360
pnpm install

# 2. Build shared packages (CRITICAL - Services will fail without this)
cd packages/common-utils
pnpm run build
cd ../..

# 3. Verify build output exists
ls -la packages/common-utils/dist/
# Should show: index.js, index.d.ts, aws/ directory

# 4. Generate Prisma clients
pnpm run prisma:generate

# 5. Configure environment (optional - defaults work)
cp .env.example .env

# 6. Start infrastructure
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

# 7. Wait 30 seconds for services to be healthy
docker ps

# 8. Verify services are running
curl http://localhost:3001/health  # User Service
curl http://localhost:3002/health  # Trip Service
curl http://localhost:3003/health  # Driver Service
```

## ✅ After Pulling Changes

```bash
# 1. Update dependencies
pnpm install

# 2. Rebuild shared packages (if common-utils changed)
cd packages/common-utils && pnpm run build && cd ../..

# 3. Regenerate Prisma clients (if schema changed)
pnpm run prisma:generate

# 4. Restart services
docker-compose restart user-service trip-service driver-service
```

## ✅ Before Running Tests

```bash
# 1. Ensure all build steps are complete (see above)

# 2. Start all services
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

# 3. Wait 30 seconds for healthy status

# 4. For Story 2.1 specifically:
#    - Initialize LocalStack AWS resources
winpty docker exec -it uitgo-localstack bash -c "cd /etc/localstack/init/ready.d && bash init-story-2.1-resources.sh"

# 5. Run tests
/path/to/k6.exe run tests/load/story-2.1-async-smoke-test.js
```

## ⚠️ Common Issues

### "Cannot find module '@uit-go-se360/common-utils'"

**Cause:** You didn't build the common-utils package.

**Fix:**
```bash
cd packages/common-utils
pnpm run build
docker-compose restart user-service trip-service driver-service
```

### Services fail to start with "Module not found" errors

**Cause:** Missing Prisma clients or unbuild shared packages.

**Fix:**
```bash
pnpm run prisma:generate
cd packages/common-utils && pnpm run build && cd ../..
docker-compose restart user-service trip-service driver-service
```

### LocalStack connection errors

**Cause:** LocalStack not initialized or services started too early.

**Fix:**
```bash
# Verify LocalStack is healthy
curl http://localhost:4566/_localstack/health

# Re-run init script
winpty docker exec -it uitgo-localstack bash -c "cd /etc/localstack/init/ready.d && bash init-story-2.1-resources.sh"

# Restart services
docker-compose restart trip-service driver-service
```

## 📚 Documentation

- **Full Setup Guide:** [README.md](README.md)
- **Story 2.1 Testing:** [docs/testing/story-2.1-test-execution-guide.md](docs/testing/story-2.1-test-execution-guide.md)
- **Architecture:** [docs/architecture/](docs/architecture/)
- **API Docs:** [docs/api.yml](docs/api.yml)

## 🆘 Need Help?

1. Check [Troubleshooting](README.md#troubleshooting) in README.md
2. Review service logs: `docker-compose logs <service-name>`
3. Check GitHub Issues
4. Contact team lead
