# ---- Base stage ----
FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies only (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

# ---- Runtime ----
ENV NODE_ENV=production
# Cloud Run injects PORT=8080 automatically
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]
