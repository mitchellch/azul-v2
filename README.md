# Azul Sprinkler System

## Main Purpose
The Azul Sprinkler System is a comprehensive, open-source irrigation control ecosystem designed for flexibility, resilience, and remote management. It is architected to support both standard wired irrigation zones and wireless, battery-operated "Zone Extenders" for areas without existing infrastructure. The entire system—from mobile app to firmware—is managed within this monorepo.

## Project Structure
This repository is a monorepo containing all components of the Azul system.

- **`mobile/`**: A cross-platform (iOS/Android) mobile application built with React Native and Expo. This is the primary user interface for controlling and monitoring the system.
- **`server/`**: The backend API and services. This component will handle business logic, data persistence, and communication between the apps and the hardware controllers. *(Not yet implemented)*
- **`firmware/`**: ESP32-based firmware for the physical sprinkler controllers. This includes code for the mains-powered Main Controller and the battery-powered Zone Extenders. *(Not yet implemented)*
- **`shared/`**: A directory for shared code, such as TypeScript types, constants, or validation schemas, that can be used across the mobile, server, and potentially firmware components.
- **`docs/`**: Contains all project documentation, including architecture diagrams, specifications, and bills of materials.

## Key Documentation
- **[Overall Architecture](docs/design/architecture.md):** A high-level overview of the entire system, its components, and how they interact.
- **[Zone Extender Specification](docs/design/zone-extender-spec.md):** Detailed technical specifications for the battery-powered, LoRa-based zone controller.
- **[Main Controller Bill of Materials](docs/hardware/main-controller-bom.md):** A complete list of electronic components for the main, wall-powered controller.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 25.x | `node -v` to check |
| npm | 11.x | Ships with Node |
| Docker Desktop | 29.x+ | Runs PostgreSQL and Mosquitto |
| Android Studio | Panda 4+ | SDK, emulator, and `adb` |
| JDK 17 (Azul Zulu) | 17.x | At `/Library/Java/JavaVirtualMachines/zulu-17.jdk` |
| PlatformIO | Latest | VS Code extension or CLI — for firmware only |

Required shell config (`~/.zshrc`):

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

> **macOS managed machine note:** A Salesforce Java stub at `/usr/local/bin/java` intercepts the `java` command. The `$JAVA_HOME/bin` prepend to `PATH` overrides it. If `java -version` shows a Salesforce warning instead of the JDK version, run `source ~/.zshrc`.

## Development Setup

The dev environment runs across **five terminal tabs** plus an Android emulator. Tabs are numbered by position, not startup order. Start services in this order: **Tab 5 (Docker) → Tab 4 (Server) → Tabs 2 & 3 (Mobile & Web, either order)**.

| Tab | Name | Description |
|-----|------|-------------|
| 1 | **Claude Code** | AI development agent (Anthropic CLI). Primary interaction point for editing code, running commands, and managing git. |
| 2 | **Mobile (Expo/React Native)** | Android app via `npx expo run:android`. BLE + cloud zone control, schedules, Auth0 native auth. |
| 3 | **Web (Next.js Dashboard)** | Next.js 14 browser dashboard on port 3001. Auth0 server-side sessions, REST proxy to backend, SSE zone updates, Tailwind CSS. |
| 4 | **Server (Express.js API)** | Node.js/TypeScript backend on port 3000. REST API, Auth0 JWT auth, Prisma ORM, MQTT client, SSE streams. |
| 5 | **Docker (Postgres + Mosquitto)** | Infrastructure services via Docker Compose. PostgreSQL 16 database and Eclipse Mosquitto 2 MQTT broker. Must start first. |
| — | **Firmware (VS Code + PlatformIO)** | Not a terminal tab. ESP32-S3 firmware built/flashed/monitored from VS Code with the PlatformIO extension. |

### 0. Connect an Android device

`npx expo run:android` needs a target device — either a physical phone or the emulator.

- **Physical phone (current setup):** Connect via USB with Developer Options and USB Debugging enabled. Run `adb devices` to confirm it appears.
- **Emulator (optional):** Open Android Studio → Device Manager → ▶ play on Pixel 9 (API 35). Wait for the home screen before proceeding.

### Tab 1 — Claude Code

```bash
cd ~/personal/dev/azul
claude
```

| | Details |
|---|---|
| **Tool** | Claude Code (Anthropic CLI) |
| **What it does** | AI-assisted development agent running in the terminal. Has full access to the repo for editing code, running commands, searching files, and managing git. This is the primary tab you interact with during development. |

### Tab 2 — Mobile app

```bash
cd mobile
npx expo run:android
```

| | Details |
|---|---|
| **Framework** | React Native 0.81 + Expo SDK 54 (TypeScript) |
| **Build tool** | Expo CLI — compiles native Android binary with linked native modules, then starts Metro bundler |
| **What it does** | Primary user interface. Auth via `react-native-auth0`, BLE communication via `react-native-ble-plx`, cloud communication via REST polling to the backend API. Manages zone control (start/stop/queue), schedules, and controller settings. |
| **Key env vars** | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID` (in `mobile/.env` and `mobile/.env.local`) |

> **Important:** This project uses native modules (BLE, Auth0) that require a development build. **Do NOT use `npx expo start`** — that launches Expo Go, which cannot load native modules. Always use `npx expo run:android`.

> **Env var changes:** `EXPO_PUBLIC_*` vars are baked in at Metro startup. After editing `.env` or `.env.local`, restart Metro with `npx expo start --reset-cache`, then press `a` to relaunch on Android.

First build takes 2–3 minutes (compiles native code). Subsequent runs are faster (~30s). The app installs and launches on the emulator automatically.

### Tab 3 — Web dashboard

```bash
cd web
npm run dev
```

| | Details |
|---|---|
| **Framework** | Next.js 14 (TypeScript, App Router) |
| **Port** | `localhost:3001` |
| **What it does** | Browser-based dashboard for controlling irrigation. Auth via `@auth0/nextjs-auth0` (server-side sessions). Proxies API requests to the backend at `localhost:3000`. Receives real-time zone updates via SSE (Server-Sent Events) through a fetch-based stream. Styled with Tailwind CSS. |
| **Key env vars** | `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`, `NEXT_PUBLIC_API_URL` (in `web/.env.local`) |

Open `http://localhost:3001` in a browser. You'll be redirected to Auth0 for login (Google OAuth).

### Tab 4 — Backend API server

```bash
cd server
npm run dev
```

| | Details |
|---|---|
| **Framework** | Express.js (Node.js / TypeScript) |
| **Runner** | `tsx watch` — auto-reloads on file changes |
| **Port** | `localhost:3000` |
| **What it does** | REST API for devices, zones, schedules, and users. Authenticates requests via Auth0 JWTs. Connects to PostgreSQL via Prisma ORM and to Mosquitto via MQTT.js. Maintains an in-memory zone state cache from MQTT status messages. Serves SSE streams to the web app. Runs an offline-sweep job to detect disconnected controllers. |
| **Key env vars** | `DATABASE_URL`, `MQTT_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` (in `server/.env`) |

You should see `Server listening on port 3000` and `[MQTT] Connected to mqtt://localhost:1883`.

### Tab 5 — Docker infrastructure

```bash
cd server
docker compose up
```

| What it runs | Details |
|---|---|
| **PostgreSQL 16** (Alpine) | Relational database. Stores users, devices, zones, schedules, audit logs. Accessible at `localhost:5432`, credentials `azul/azul/azul` (user/password/database). Data persists in a Docker volume (`postgres_data`). |
| **Eclipse Mosquitto 2** | MQTT message broker. Relays commands and status between the backend server and ESP32 controllers. Listens on `localhost:1883` (MQTT) and `localhost:9001` (WebSocket). Anonymous access enabled for local dev. |

Leave this tab running. You should see `database system is ready to accept connections` and `mosquitto version 2.x.x running`.

### Firmware (VS Code + PlatformIO)

Firmware development uses **VS Code with the PlatformIO extension** — not a terminal tab. Open the `firmware/main-controller` folder in VS Code as a PlatformIO project.

| Action | How |
|---|---|
| **Build** | PlatformIO sidebar → Build, or `pio run -e esp32-s3` |
| **Flash** | Connect ESP32 via USB → PlatformIO sidebar → Upload, or `pio run --target upload -e esp32-s3` |
| **Serial monitor** | PlatformIO sidebar → Monitor, or `pio device monitor --baud 115200` |
| **Build + Flash + Monitor** | PlatformIO sidebar → Upload and Monitor |

| | Details |
|---|---|
| **Platform** | ESP32-S3 (N16R8), Arduino framework |
| **Build system** | PlatformIO |
| **What it does** | Runs on the physical irrigation controller. Manages zone GPIOs (solenoid drivers), WiFi connectivity, MQTT communication with the backend, BLE GATT server for mobile app pairing, NTP time sync, schedule execution, and a serial CLI for debugging. |
| **Integration tests** | `python3 -m pytest tests/integration/ --host=<controller-ip> -q` (requires controller on same network) |

### Service dependency graph

```
Docker (Postgres + Mosquitto)
  └── Backend API server (connects to both)
        ├── Mobile app (REST polling to backend)
        ├── Web app (REST proxy + SSE from backend)
        └── ESP32 firmware (MQTT via Mosquitto)
```

### First-time setup

If this is a fresh clone or the Docker volume was wiped:

```bash
cd server
npm install
npx prisma db push       # creates tables in PostgreSQL
npx prisma generate       # generates the Prisma client

cd ../mobile
npm install

cd ../web
npm install
```

### Stopping everything

1. **Ctrl+C** in each terminal tab (mobile, server, web, Docker)
2. Close the Android emulator from Android Studio Device Manager
3. Docker volumes persist — your database data survives restarts
