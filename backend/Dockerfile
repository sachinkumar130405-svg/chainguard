# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source code 
COPY . ./

# ---- Runtime Stage ----
FROM node:20-slim

WORKDIR /app

# Copy production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy application source from builder
COPY --from=builder /app ./

# Create directory for SQLite database
RUN mkdir -p /app/data && chown node:node /app/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/data/chainguard.db

# Expose the configured port
EXPOSE 3000

# Use non-root user for security
USER node

# Start the server
CMD ["node", "server.js"]
