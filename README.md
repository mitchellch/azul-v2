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
- **[Overall Architecture](docs/azul-architecture.md):** A high-level overview of the entire system, its components, and how they interact.
- **[Zone Extender Specification](docs/azul-zone-extender.md):** Detailed technical specifications for the battery-powered, LoRa-based zone controller.
- **[Main Controller Bill of Materials](docs/main-controller-bom.md):** A complete list of electronic components for the main, wall-powered controller.

## Getting Started

### Running the Mobile App
To run the mobile application for development:

1.  Navigate to the mobile directory:
    ```bash
    cd mobile
    ```
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Start the Expo development server:
    ```bash
    npm start
    ```
This will open the Expo developer tools in your browser, where you can launch the app in an iOS Simulator, Android Emulator, or on a physical device using the Expo Go app.
