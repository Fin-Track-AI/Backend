# ---- Base stage ----
FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies only (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

# Ensure uploads directories exist with appropriate non-root permissions
RUN mkdir -p uploads/bills && chown -R node:node /app

# ---- Runtime ----
ENV NODE_ENV=production
# Cloud Run injects PORT=8080 automatically
ENV PORT=8080

EXPOSE 8080

# Run container as unprivileged non-root user (SEC-018)
USER node

CMD ["node", "src/server.js"]
