# cert-to-kb MCP Server Dockerfile
# Multi-stage build for smaller final image

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (devDependencies included — needed to run `tsc`)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Build TypeScript
RUN pnpm build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Enable corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts --prod

# Copy built files
COPY --from=builder /app/dist ./dist

# Create certs directory
RUN mkdir -p /app/certs

# Set non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
USER nodejs

# Expose port
EXPOSE 3000

# Run using compiled JS
CMD ["node", "dist/index.js"]
