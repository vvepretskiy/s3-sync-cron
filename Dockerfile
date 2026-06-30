# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first — leverage Docker layer cache on dep changes
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY src/ ./src/
RUN npm run build

# ─── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Create a non-root user with a fixed UID/GID for predictable permissions
RUN addgroup -g 1001 -S nodejs \
 && adduser  -S nodejs -u 1001 -G nodejs

# Install only production dependencies (no dev tools in final image)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npm cache clean --force

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Drop to non-root user before starting the process
USER nodejs

# Run as PID 1 so the process receives SIGTERM directly from Docker
ENTRYPOINT ["node", "dist/index.js"]
