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
COPY services/trip-service/package.json services/trip-service/
COPY services/trip-service/prisma services/trip-service/prisma
# Copy shared packages
COPY packages packages


# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages
RUN cd packages/shared-types && pnpm build

# Generate Prisma client
WORKDIR /app/services/trip-service
RUN pnpm prisma:generate

# Copy source code
COPY services/trip-service/src ./src
COPY services/trip-service/tsconfig*.json ./
COPY services/trip-service/nest-cli.json ./

# Build the service
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
COPY --from=builder /app/services/trip-service/package.json ./services/trip-service/package.json
COPY --from=builder /app/services/trip-service/node_modules ./services/trip-service/node_modules
COPY --from=builder /app/services/trip-service/prisma ./services/trip-service/prisma
COPY --from=builder /app/services/trip-service/dist ./services/trip-service/dist

WORKDIR /app/services/trip-service


# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start the service
CMD ["node", "dist/main"]
