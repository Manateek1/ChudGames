# FortLite Dedicated Match Server & Client Deployment Guide

This guide details how to deploy FortLite's real join-code multiplayer architecture to production.

---

## 1. Architecture Overview

FortLite uses a split deployment architecture:
1. **Frontend Client (Vite Static Bundle)**: Can be hosted on any static hosting provider (Vercel, Cloudflare Pages, Netlify, GitHub Pages, or AWS S3/CloudFront).
2. **Authoritative Match Server (WebSocket / HTTP)**: Runs as a long-lived Node.js/TypeScript container service (Fly.io, Railway, Google Cloud Run with WebSockets, Render, or DigitalOcean App Platform).

```
 ┌─────────────────────────────────────────────────────────────┐
 │                       Browser Clients                       │
 │  (Chrome, Edge, Safari, Firefox via https://chudgames.com)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                 WebSocket Connection (wss://...)
                 & HTTP Health Checks (https://...)
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │           FortLite Authoritative Match Server               │
 │                (Node.js / tsx on Port 8080)                 │
 │                                                             │
 │  - Room Code Manager (6-char alphanumeric codes)            │
 │  - 20 Hz Authoritative Tick Loop (50ms delta)               │
 │  - Server Reconciliation & Snapshot Interpolation (20 Hz)   │
 │  - Hitscan Raycasting, Damage Falloff & Bloom Verification  │
 │  - Build Cost & Range Verification (20 wood / stone / metal)│
 │  - 45s Grace Period Reconnect Token Storage                 │
 │  - Multi-tier Bot Brains (Recruit, Soldier, Veteran, Elite) │
 └─────────────────────────────────────────────────────────────┘
```

---

## 2. Dockerfile for Dedicated Match Server

Create or use the following `Dockerfile` in the repository root:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine AS runner

WORKDIR /app

# Install dependencies first (layer caching)
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

# Start the dedicated match server
CMD ["tsx", "server/index.ts"]
```

---

## 3. Environment Variables

### Match Server (`server/`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Port for the HTTP health server and WebSocket server. |
| `NODE_ENV` | `production` | Node environment mode. |
| `CORS_ORIGIN` | `*` | Allowed origin for CORS headers. |

### Web Client (`src/`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_FORTLITE_SERVER_URL` | Auto-detected | The WebSocket URL of the backend (e.g., `wss://fortlite-server.fly.dev` or `ws://localhost:8080`). When left empty, client defaults to current host with `ws://` or `wss://`. |

---

## 4. Hosting Options for Match Server

### Option A: Fly.io (Recommended for low-latency WebSockets)

1. Install Fly CLI: `flyctl auth login`
2. Initialize app: `fly launch --no-deploy`
3. In `fly.toml`, ensure persistent connections are enabled:
```toml
app = "fortlite-match-server"
primary_region = "ord"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```
4. Deploy: `fly deploy`

### Option B: Railway

1. Create a new Railway project and link the repository.
2. Under **Settings**:
   - Build Command: `npm install`
   - Start Command: `npm run server`
   - Target Port: `8080`
3. Under **Networking**, generate a public domain (e.g. `fortlite-production.up.railway.app`).
4. Railway natively routes WebSocket upgrades on the public domain.

### Option C: Google Cloud Run

1. Build & Push image:
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/fortlite-server
```
2. Deploy with WebSocket support enabled:
```bash
gcloud run deploy fortlite-server \
  --image gcr.io/PROJECT_ID/fortlite-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600 \
  --min-instances 1 \
  --session-affinity
```
*(Note: `--timeout 3600` and `--session-affinity` are essential for long-lived WebSocket sessions).*

---

## 5. Frontend Deployment (Static Bundle)

Build the static distribution:
```bash
VITE_FORTLITE_SERVER_URL=wss://your-match-server.com npm run build
```
Deploy the generated `dist/` directory to:
- **Cloudflare Pages**: `wrangler pages deploy dist`
- **Vercel**: `vercel --prod`
- **Netlify**: `netlify deploy --prod --dir=dist`

---

## 6. Local Development & Verification

To run both client and match server locally on your development machine:

1. **Start Match Server**:
```bash
npm run server
```
*Server starts on `http://localhost:8080` with WebSocket endpoint ready.*

2. **Start Web Client**:
```bash
npm run dev
```
*Client opens on `http://localhost:5173`.*

3. **Verify Multiplayer**:
- Open `http://localhost:5173` in Chrome Window 1. Select FortLite -> "Create Match". Note the 6-character room code.
- Open `http://localhost:5173` in Chrome Window 2 (or Incognito). Select FortLite -> "Join Match" and paste the room code.
- Both players ready up. The 3-second countdown initiates, and both players drop together onto the island!
