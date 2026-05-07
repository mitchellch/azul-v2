Create a professional Product Requirements Document (PRD) which describes the requirements for entire Azul system.  Search the web and choose a highly relevant template to use.  Write it to docs/azul-prd.md.

The PRD needs to cover the following areas at a minimum:

- High level business purpose
- Primary revenue sources
  - Hardware sales: Selling controllers, extended controllers, wireless power banks, etc
  - Monthly service fee: Homeowners pay a nominal fee which covers supporting their systems (e.g. $2.99/mo) for wifi management.  Bluetooth management is free for howeowners
  - Landscapers: Landscapers pay a monthly fee for the service which covers the cost of providing the service (for landscapers and homeowners) + a markup (e.g. $25.00/mo)
  - Marketing landscaper services: The system interfaces with 3rd party marketing services (e.g. Salesforce Marketing Cloud) to market to and enroll new clients
- Dashboards
  - Landscaper:
    - Clients/Revenue
    - Work schedule: what landscape mtce appts are due today, this week, etc.
    - Billing/Payments
- Primary use cases
  - Manage sprinklers
    - Internet: Controllers are wifi enabled, and accessible from anywhere
    - Bluetooth: Being near a controller allows the user to access and manage that controller
    - LoRa (Long Range): Each controller supports LoRa connectivit, meaning it can communicate with other Azul controllers
    - Wireless connectivity to valves: An extended controller which is battery operated can be place up to 1 mile from a controller.  The controller will push schedule changes, etc. to the extended controller over LoRa.
      - Eliminates the need to run wires from the controller to the valves
      - Supports deep sleep mode which means the extended controller lasts for over a full year on 3 AA batteries.
      - Leverages DC latching solenoids
      - IP68 certified for outdoor use in any weather
      - Wireless charging: When the battery is at or below 20%, the extended controller notifies the owner via email/text.
        - The owner carries a wireless power bank to the controller and magnetically attaches the power bank, which wirelessly charges the controller in 4-6 hours (once every year or more)
  - Homeowner managing their own sprinklers
    - Manage controllers: Add/Adopt, edit, delete, enable/disable
      - Manage zones: Add, edit, delete
        - Manual control
        - Schedule management
          - Multiple watering cycles per day (unlimited)
          - Hour/minute scheduling within a day
          - Days of the week
            - Support 'every day', 'every other day' in addition to selecting days of the week
    - Manage the number of zones which can be simultaneously active across all controllers: This may require assigning zones to a given water source (e.g. city water, well, etc.)
  - Landscaper managing clients/homeowners, each with thier own controller(s)
    - Managing any customer's controller(s) from anywhere
      - Viewing and adjusting sprinkler times, duration, skip days, rain delays, etc.
      - Anything that can be done by a homeowner can be done by an authorized landscaper
    - Manage clients
      - Create, read, update and delete clients
      - Record names, contact information, social IDs, email addresses, physical addresses, support for multiple addresses, support for sites without addresses, payment status, billing details, etc.
      - Email/Call/Message/Social contact clients
      - Billing: Allow a landscaper to setup and schedule PDF invoices to be emailed to each client on any schedule
        - Billing reminders
      - Payment tracking: Track payments from all clients, send payment reminders
- Security: Security is baked in from the beginning.  The ESP32 chip which powers all the controllers supports the following security features
  - Secure Boot: This ensures that only digitally signed firmware can execute on the chip. During the boot process, the hardware verifies the signature of the application image against a public key stored in the ESP32-S3's eFuses.

  - Flash Encryption: This feature transparently encrypts the contents of the off-chip SPI flash. Even if an attacker physically removes the flash chip from your controller, they cannot read the firmware or sensitive data like your 915MHz LoRa keys or 1Password managed credentials.

  - Cryptographic Hardware Accelerators: The chip includes dedicated hardware to speed up encryption tasks without taxing the main CPU. It supports:

    - AES-128/256 for data encryption.

    - SHA-2 for hashing.

    - RSA and ECC for public-key cryptography.

  - Random Number Generator (RNG) for generating secure cryptographic keys.

  - World Controller (Hardware Isolation): The ESP32-S3 introduces a "World Controller" that provides hardware-level isolation. It allows you to run sensitive code (like key management) in a "secure world" while keeping the rest of the application in a "non-secure world".
- Firmware upgrades: Seamless and bulletproof firmware upgrades over wifi and/or Bluetooth (not LoRa)
