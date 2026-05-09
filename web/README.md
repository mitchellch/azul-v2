# Azul Web App

Browser-based dashboard for the Azul irrigation system. Mirrors the mobile app's functionality with a full-screen web interface. Communicates exclusively through the backend API — no BLE or direct device access.

## Prerequisites

- Node.js 18+
- Azul backend running on port 3000 (`cd server && npm run dev`)
- Auth0 **Regular Web Application** configured (see Auth0 Setup below)

## Setup

```bash
cp .env.example .env.local
# Edit .env.local — fill in AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET
npm install
npm run dev
```

Open http://localhost:3001.

## Auth0 Setup

1. In Auth0 Dashboard → Applications → **Create Application**
2. Choose **Regular Web Application**
3. Under **Settings**:
   - Allowed Callback URLs: `http://localhost:3001/api/auth/callback`
   - Allowed Logout URLs: `http://localhost:3001`
4. Copy **Client ID** and **Client Secret** to `.env.local`

Note: The mobile app uses a **Native** Auth0 application. The web app needs its own **Regular Web Application** so Auth0 can issue server-side tokens.

## Development

```bash
npm run dev     # Start on http://localhost:3001
npm run build   # Production build
npm run start   # Start production server
```

## Architecture

The web app uses a **Backend-for-Frontend (BFF)** pattern:

```
Browser → /api/proxy/* (Next.js API route) → Backend API (port 3000)
```

Client components never hold the Auth0 access token — it stays server-side in the session cookie. The `/api/proxy/[...path]` route handler attaches it to every request to the backend.

Server components (like the dashboard page) can call the backend directly using `getAccessToken()`.

## Features

- **Dashboard** — controller list with online/offline status
- **Zone control** — run/stop individual zones per controller
- **Schedules** — view and activate/deactivate schedules
- **Activity log** — zone run history
- **Real-time** — SSE stream available at `/api/proxy/devices/:mac/stream`
