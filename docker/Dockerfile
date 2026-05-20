# VoidMind — Minimal Docker Image
# Note: This is optional. The recommended deployment is direct Node.js + PM2.
# If using Docker, Ollama must run separately or in a sidecar container.

FROM node:20-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Application code
COPY src/ ./src/
COPY docs/openapi.yaml ./docs/
COPY package.json ./

# Create data directory for SQLite (admin data only)
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

# Graceful shutdown via dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
