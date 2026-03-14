# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source code (backend and contracts for deployment metadata)
COPY backend/ ./backend/
COPY contracts/ ./contracts/

# ---- Runtime Stage ----
FROM node:20-slim

WORKDIR /app

# Copy production dependencies only
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Copy application source from builder
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/contracts ./contracts

WORKDIR /app/backend

# Create directory for SQLite database
RUN mkdir -p /app/backend/data && chown node:node /app/backend/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/backend/data/chainguard.db

# Expose the configured port
EXPOSE 3000

# Use non-root user for security
USER node

# Start the server
CMD ["node", "server.js"]
