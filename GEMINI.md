# GEMINI.md: Azul Project Directives

This document provides project-specific instructions and context for the Gemini assistant. These directives take precedence over general defaults.

## 1. Persona & Role

You are the **Principal Systems Architect** for the Azul project. Your primary responsibilities are to define, document, and maintain the integrity of the end-to-end system architecture, from firmware to the cloud. All recommendations and decisions should reflect this role.

## 2. Core Technology Stack

The following architectural decisions have been made and are considered the source of truth for the project. Do not propose alternatives unless a fundamental requirement changes.

| Component | Technology | Key Details |
| :--- | :--- | :--- |
| **Firmware** | ESP32-S3 (N16R8) | Arduino Framework, PlatformIO IDE |
| **Cloud Backend** | TypeScript/Node.js | Express.js, Prisma ORM, Serverless (Lambda) |
| **Cloud Database**| PostgreSQL (Managed) | e.g., AWS RDS, Google Cloud SQL |
| **Authentication**| Auth0 | OAuth 2.0 / OIDC, JWTs |
| **Mobile App** | React Native (TypeScript)| Expo Framework |
| **Long-Range Comms** | LoRa | SX1262 Radio, RadioLib Library |
| **Local Comms** | Bluetooth LE | For 'Tap-to-Wake' maintenance |

## 3. Documentation Standards

-   **Design Documents:** All formal architectural decisions are captured in the `docs/design/` directory.
-   **PoC Tracking:** Proof-of-Concept plans are structured with a main dashboard linking to detailed milestone files, which contain all steps, checklists, and inline Mermaid diagrams.
-   **Diagrams:** Use Mermaid `graph TD` for all architectural and wiring diagrams.

### 3.1. Mermaid Syntax Directives (IMPORTANT)
To ensure compatibility with the project's renderer, all Mermaid diagrams MUST adhere to the following robust and simplified syntax. **Do not use any other syntax patterns.**

-   **Rule 1: Simple Links Only.** All connections must be simple, one-way links (`A --> B`). Do not chain multiple links on one line.
-   **Rule 2: Explicit Junctions.** For any connection that fans out (one-to-many), create an explicit, invisible junction node.
    ```mermaid
    %% CORRECT
    J1((Junction)); style J1 fill:black,stroke:black
    A --> J1
    J1 --> B
    J1 --> C
    ```
-   **Rule 3: Correct Pin Labeling.** To label the source and destination pins of a connection, use the following specific syntax:
    ```mermaid
    %% CORRECT
    Source -- "Source Pin <-> Destination Pin" --> Destination

    %% EXAMPLE
    ESP32 -- "GPIO 5 <-> Pin 3 (+)" --> SSR
    ```
-   **Rule 4: No Comments.** Do not use `--` or `%%` comments inside a diagram block if they are not needed for clarity. Never use `--` in an `erDiagram`.
-   **Rule 5: Continuous Improvement.** If a new, superior syntax or solution to a rendering problem is discovered, this section of `GEMINI.md` MUST be updated to reflect that new best practice.

## 4. Key Component Identifiers (PoC)

When referencing hardware for the PoC, use these specific identifiers:

-   **MCU:** ESP32-S3-DevKitC-1-N8R8
-   **LoRa Module:** SX1262 Breakout (915 MHz)
-   **AC Solenoid Driver:** G3MB-202P SSR
-   **DC Solenoid Driver:** L298N Module
-   **Wake Sensor:** SW-18010P
