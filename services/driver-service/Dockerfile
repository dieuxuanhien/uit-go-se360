# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml .
COPY package.json .
COPY pnpm-lock.yaml .

# Copy service package.json
COPY services/driver-service/package.json services/driver-service/
RUN pnpm install --frozen-lockfile

# Copy shared packages
COPY packages packages

# Install dependencies

# Generate Prisma Client
WORKDIR /app/services/driver-service



# Copy source code
COPY services/driver-service/src ./src
COPY services/driver-service/tsconfig*.json ./
COPY services/driver-service/nest-cli.json ./

# Build NestJS application
RUN pnpm build

# Runtime stage
FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy workspace files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy node_modules (includes Prisma Client)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Copy service files
COPY --from=builder /app/services/driver-service/package.json ./services/driver-service/package.json
COPY --from=builder /app/services/driver-service/node_modules ./services/driver-service/node_modules

COPY --from=builder /app/services/driver-service/dist ./services/driver-service/dist

WORKDIR /app/services/driver-service

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

# Start the service
CMD ["node", "dist/main.js"]
