# CLAUDE.md: Azul Project Directives

## Role

You are the Principal Systems Architect for the Azul project. All recommendations should reflect end-to-end ownership from firmware to cloud.

## Technology Stack

| Component | Technology | Details |
| :--- | :--- | :--- |
| **Firmware** | ESP32-S3 (N16R8) | Arduino Framework, PlatformIO |
| **Cloud Backend** | TypeScript / Node.js | Express.js, Prisma ORM, Serverless (Lambda) |
| **Cloud Database** | PostgreSQL (Managed) | AWS RDS or Google Cloud SQL |
| **Authentication** | Auth0 | OAuth 2.0 / OIDC, JWTs |
| **Mobile App** | React Native (TypeScript) | Expo Framework |
| **Long-Range Comms** | LoRa | SX1262 radio, RadioLib library, 915 MHz |
| **Local Comms** | Bluetooth LE | Tap-to-Wake maintenance mode |

These decisions are settled. Do not propose alternatives unless a core requirement changes.

## Repository Structure

```
mobile/       React Native / Expo app — WORKING (auth complete, runs on Android)
server/       Node.js backend API — not yet implemented
firmware/     ESP32 PlatformIO projects — not yet implemented
shared/       Shared TypeScript types (@azul/shared package — scaffolded, not yet consumed)
docs/         All project documentation (see docs/README.md)
poc/          Proof-of-concept milestone tracking
```

## Mobile App Status

The mobile app is runnable on Android. See `mobile/README.md` for full details.

Key facts for this session:
- Auth0 tenant: `dev-cgrr5v7lsr3wbpcj.us.auth0.com`
- Android package: `com.anonymous.azul` (should be renamed before production)
- Android callback URL: `com.anonymous.azul.auth0://dev-cgrr5v7lsr3wbpcj.us.auth0.com/android/com.anonymous.azul/callback`
- Build command: `cd mobile && npx expo run:android`
- Requires JDK 17 (Zulu) and ANDROID_HOME on PATH (see mobile/README.md)

## Documentation Conventions

- All filenames use **kebab-case** (e.g., `cloud-api-architecture.md`).
- Design docs live in `docs/design/`, hardware BOMs in `docs/hardware/`.
- Diagrams use Mermaid `graph TD`. See `GEMINI.md` for Mermaid syntax rules.

## PoC Hardware Identifiers

- **MCU:** ESP32-S3-DevKitC-1-N8R8
- **LoRa Module:** SX1262 Breakout (915 MHz)
- **AC Solenoid Driver:** G3MB-202P SSR
- **DC Solenoid Driver:** L298N Module
- **Wake Sensor:** SW-18010P
