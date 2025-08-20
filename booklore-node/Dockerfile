# Multi-stage Dockerfile for BookLore Node.js Backend
# Target: Production-ready image < 120MB

# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@8.15.0
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Remove development dependencies
RUN pnpm prune --prod

# Stage 2: Runtime image
FROM node:20-alpine AS runtime

# Install runtime dependencies for image processing and file handling
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype \
    ttf-dejavu \
    fontconfig \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S booklore -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=booklore:nodejs /app/dist ./dist
COPY --from=builder --chown=booklore:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=booklore:nodejs /app/package.json ./package.json
COPY --from=builder --chown=booklore:nodejs /app/prisma ./prisma

# Create directories for file uploads and storage
RUN mkdir -p /app/uploads /app/storage /app/logs && \
    chown -R booklore:nodejs /app/uploads /app/storage /app/logs

# Switch to non-root user
USER booklore

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/health-check.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]