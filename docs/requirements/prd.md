# Product Requirements Document: Azul Sprinkler System

> **Status:** Draft
> **Author:** Gemini CLI
> **Date:** May 2, 2026

---

## 1. Introduction & Business Purpose

The Azul Sprinkler System is a next-generation, cloud-connected irrigation platform designed for homeowners and professional landscapers. Its core purpose is to provide intelligent, resilient, and cost-effective water management by combining mains-powered and wireless, battery-operated controllers within a single ecosystem. The system addresses a key market gap by eliminating the need for costly trenching and wiring to control remote irrigation valves, making smart sprinkler technology accessible for properties of any size or complexity. By offering distinct value propositions for both homeowners and professional landscapers, Azul aims to become a leader in the smart irrigation market through hardware sales and a tiered, service-based subscription model.

## 2. Monetization Strategy & Revenue Sources

The Azul ecosystem will generate revenue through a multi-channel approach:

*   **Hardware Sales:** Direct-to-consumer and B2B sales of physical devices, including:
    *   Azul Main Controller (Wi-Fi + LoRa Gateway)
    *   Azul Zone Extender (LoRa + Battery Operated)
    *   Branded accessories (e.g., Wireless Power Banks, Mounting Kits).
*   **Homeowner Monthly Service Fee:** A nominal monthly fee (e.g., $2.99/mo) for homeowners who wish to manage their system over the internet. This recurring revenue covers cloud infrastructure, support, and ongoing feature development.
    *   **Freemium Model:** On-site management via Bluetooth LE will be free, providing a no-cost entry point for all hardware owners.
*   **Landscaper Professional Subscription:** A monthly subscription (e.g., $25.00/mo) for landscaping businesses. This plan provides a comprehensive suite of tools for managing their entire client portfolio, including remote control, billing, and scheduling. This subscription also covers the service costs for all their managed homeowner clients.
*   **Landscaper Marketing Services:** Integration with third-party marketing platforms (e.g., Salesforce Marketing Cloud) to provide landscapers with tools for lead generation, client communication, and growing their business.

## 3. Goals and Objectives

*   **Goal 1:** Empower homeowners with a flexible and easy-to-install smart sprinkler system that saves water and money.
*   **Goal 2:** Provide professional landscapers with a powerful, centralized platform to efficiently manage multiple client properties, streamline operations, and increase profitability.
*   **Goal 3:** Establish a new standard for irrigation system resilience and flexibility with the wireless, long-range Zone Extender.
*   **Goal 4:** Build a sustainable business model combining one-time hardware revenue with recurring subscription fees.

## 4. Target Audience & User Personas

| Persona | Description | Key Needs & Pain Points |
| :--- | :--- | :--- |
| **Homeowner** | A tech-savvy individual who wants to automate and optimize their home's irrigation. | Wants to save water; frustrated by inflexible scheduling; has areas of the yard (e.g., gardens, new landscaping) without existing sprinkler wiring. |
| **Landscaper** | A professional business owner managing irrigation and maintenance for dozens of residential and/or commercial clients. | Wastes time driving between properties to adjust controllers; struggles to manage client billing and schedules efficiently; needs a single tool to view their entire operation. |

## 5. Primary Use Cases & Functional Requirements

### 5.1 Core System Capabilities

*   **Internet Control:** All controllers shall be Wi-Fi enabled, allowing for complete system management from anywhere in the world via the mobile and web apps.
*   **Bluetooth Control:** Users must be able to directly connect to any controller via Bluetooth LE when in physical proximity for management and diagnostics, even without an internet connection.
*   **LoRa Mesh Network:** Each Main Controller shall act as a LoRa gateway, creating a private, long-range mesh network to communicate with and control Zone Extenders.
*   **Wireless Zone Extender:**
    *   The system must support a battery-operated Zone Extender that communicates with a Main Controller via LoRa over a range of up to 1 mile (line of sight).
    *   It must actuate industry-standard DC latching solenoids.
    *   It must leverage an ultra-low-power deep sleep mode to achieve a battery life of over one year on 3x AA batteries.
    *   The enclosure must be IP68 certified for submersion and all-weather outdoor use.
    *   It shall support wireless charging. When battery capacity is ≤ 20%, an email/text notification must be sent to the user. The user can then charge the device by magnetically attaching a wireless power bank.

### 5.2 Homeowner Application Features

*   **Controller Management:**
    *   Users must be able to add/adopt new controllers, edit their settings (name, location), delete, and enable/disable them.
*   **Zone Management:**
    *   Within each controller, users must be able to add, edit (name, photo, plant type), and delete zones.
    *   **Manual Control:** Allow users to manually start or stop any zone for a specified duration.
*   **Schedule Management:**
    *   Support the creation of unlimited, independent watering schedules.
    *   Allow for unlimited watering cycles per day, scheduled by specific hour and minute.
    *   Support flexible day-of-the-week scheduling, including options for 'every day', 'every other day', and specific day selection (e.g., Mon/Wed/Fri).
*   **Water Source Management:**
    *   The system must allow a user to define the maximum number of zones that can be active simultaneously across their entire property. This may involve assigning zones to a specific water source (e.g., city vs. well) to prevent pressure loss.

### 5.3 Landscaper Application Features

*   **Remote Fleet Management:** A landscaper must be able to perform any action on a client's controller that the homeowner can, including viewing status, adjusting schedules, running zones manually, and configuring settings.
*   **Client Management (CRM):**
    *   Provide full CRUD (Create, Read, Update, Delete) functionality for client records.
    *   Client records must store contact information (name, phone, email, social IDs), physical addresses (support for multiple sites), and billing details.
    *   Integrate communication tools to email, call, or message clients directly from the app.
*   **Billing and Invoicing:**
    *   Allow landscapers to generate and schedule the delivery of PDF invoices to clients via email.
    *   Support automated billing reminders for overdue invoices.
*   **Payment Tracking:**
    *   Provide a dashboard to track payment status from all clients and send payment reminders.

### 5.4 Landscaper Dashboards

*   **Clients/Revenue Dashboard:** Provide an at-a-glance view of active clients, monthly recurring revenue, and outstanding invoices.
*   **Work Schedule Dashboard:** A calendar or list view showing upcoming landscape maintenance appointments for the day, week, and month.
*   **Billing/Payments Dashboard:** A detailed view of all invoices, their status (sent, paid, overdue), and payment history.

## 6. Non-Functional Requirements

### 6.1 Security

Security must be a foundational component of the system. All controllers, powered by the ESP32 chip, shall leverage the following hardware security features:

*   **Secure Boot:** The hardware will enforce that only authentically signed firmware can be executed, preventing unauthorized software from running on the device.
*   **Flash Encryption:** The contents of the off-chip SPI flash will be transparently encrypted. This protects firmware, LoRa keys, and other credentials from being read even with physical access to the hardware.
*   **Cryptographic Hardware Accelerators:** The system will utilize the ESP32's dedicated hardware for AES, SHA, RSA, and ECC to perform cryptographic operations efficiently without impacting application performance.
*   **World Controller (Hardware Isolation):** Sensitive operations, such as key management, will be isolated from the main application logic using the hardware-level World Controller.

### 6.2 Firmware Upgrades

The system must support seamless and robust over-the-air (OTA) firmware upgrades for all controllers.

*   Upgrades shall be deliverable over both Wi-Fi and Bluetooth LE.
*   The upgrade process must be "bulletproof," with mechanisms for rollback and recovery in case of interruption (e.g., power loss). LoRa will not be used for firmware upgrades.

---

## 7. Open Questions

*   Should the system integrate with weather services for automated "rain skip" functionality in v1?
*   What is the defined recovery protocol if a Zone Extender loses its stored schedule?
*   Will the landscaper CRM support integration with existing accounting software (e.g., QuickBooks)?
