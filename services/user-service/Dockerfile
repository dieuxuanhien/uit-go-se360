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
COPY services/user-service/package.json services/user-service/

# Copy shared packages
COPY packages packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY services/user-service services/user-service

# Build the service
WORKDIR /app/services/user-service
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
COPY services/user-service/package.json services/user-service/

# Copy shared packages
COPY packages packages

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder
COPY --from=builder /app/services/user-service/dist /app/services/user-service/dist
COPY --from=builder /app/services/user-service/prisma /app/services/user-service/prisma

WORKDIR /app/services/user-service

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the service
CMD ["node", "dist/main"]
