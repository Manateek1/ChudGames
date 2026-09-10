# syntax=docker/dockerfile:1
FROM node:24-alpine AS runner

WORKDIR /app

# Install dependencies first
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy server code and shared runtime content
COPY server/ ./server/
COPY src/games/fortliteRuntime/ ./src/games/fortliteRuntime/
COPY src/types/ ./src/types/
COPY src/engine/ ./src/engine/

# Expose HTTP and WebSocket port
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Health check
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start dedicated match server
CMD ["tsx", "server/index.ts"]
