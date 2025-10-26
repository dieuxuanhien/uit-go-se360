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

# Copy shared packages
COPY packages packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY services/trip-service services/trip-service

# Build the service
WORKDIR /app/services/trip-service
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml .
COPY package.json .
COPY pnpm-lock.yaml .

# Copy service package.json
COPY services/trip-service/package.json services/trip-service/

# Copy shared packages
COPY packages packages

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder
COPY --from=builder /app/services/trip-service/dist /app/services/trip-service/dist
COPY --from=builder /app/services/trip-service/prisma /app/services/trip-service/prisma

WORKDIR /app/services/trip-service

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start the service
CMD ["node", "dist/main"]
