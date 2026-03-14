# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# ---- Runtime Stage ----
FROM node:20-slim

WORKDIR /app

# Copy production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source from builder or existing tree
COPY --from=builder /app .

# Create directory for SQLite database
RUN mkdir -p /app/data && chown node:node /app/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/data/chainguard.db

EXPOSE 3000

USER node

CMD ["node", "server.js"]
