# Main Controller PCB v1 — Design Spec

First custom PCB to replace the ESP32-S3-DevKitC-1 + breadboard prototype. Goal is a manufacturable two-board set that can run a real 12-zone irrigation system in a wall-mount enclosure.

## Scope and non-goals

**In scope (v1):**
- 12 zones, 24VAC switching via SSR
- ESP32-S3-WROOM-1-N8R8 hosted directly (no DevKitC daughterboard)
- Native USB over USB-C (no USB-to-UART chip)
- Rain sensor and flow meter inputs
- Single-board architecture housing logic + relay sections, sized for Polycase WC-25F enclosure

**Out of scope (deferred):**
- LoRa (SX1262) — reserved for the future in-ground waterproof zone-extender product, see `zone-extender-spec.md`
- Battery / RTC backup
- Ethernet
- Display

## Locked design decisions (2026-06-30)

| Decision | Choice | Rationale |
|---|---|---|
| MCU package | ESP32-S3-WROOM-1-N8R8 module | Pre-certified, antenna integrated, no RF layout work |
| USB | Native USB direct to GPIO19/20 | Fewer parts, keeps JTAG, no CP2102/CH340 needed |
| Power input | 24VAC via **2-pos screw terminal (J2) on PCB** — accepts pigtail from any source (panel-mount barrel jack, hardwired transformer, direct wall wart) | Decouples PCB design from enclosure/connector choice; panel-mount barrel jack chosen alongside enclosure selection |
| Power chain | Bridge rectifier → buck to 5V → LDO to 3.3V | Bulk caps absorb 24VAC ripple; buck handles the 30+ V peak |
| Zone switching | 12× G3MB-202P SSR | Same part as PoC; triac alternative adds layout complexity for marginal savings |
| Sensor inputs | Rain (NC dry contact) + flow (pulse) | Cheap to add now, painful to retrofit |
| Architecture | Single board (~120×170mm) with logic + relay regions | Simpler assembly; 4 corner mount to native enclosure bosses; no ribbon connector; split-board optimization deferred to rev3+ |
| Enclosure | Polycase WC-25F (222×146×55mm, clear polycarbonate, NEMA 4X / IP65, wall-mount flanges) | UL E194432 recognized, indoor/outdoor rated, built-in flanges, clear cover for status LED visibility, 8 native PCB bosses in two 4-boss clusters |

## Block diagram

```mermaid
graph TD
  AC[24VAC input<br/>2-pos screw terminal J2<br/>+ TVS + PTC fuse] --> BR[Bridge rectifier<br/>+ bulk cap ~470µF/50V]
  BR --> BUCK[Buck → 5V<br/>LM2596S-5]
  USB[USB-C receptacle<br/>+ ESD + CC pulldowns] -->|VBUS 5V via SS14 Schottky| RAIL5V[+5V rail]
  BUCK --> RAIL5V
  RAIL5V --> LDO[LDO → 3.3V<br/>AP2112K-3.3]
  RAIL5V --> SSR_RAIL[5V rail to SSR control]
  LDO --> MCU[ESP32-S3-WROOM-1-N8R8<br/>USB D+/D- direct to IO19/20]
  USB -->|D+/D-| MCU
  MCU -->|12 GPIO active-high<br/>internal traces| SSRS[12× G3MB-202P SSR]
  SSR_RAIL --> SSRS
  SSRS -->|switched 24VAC| TB[Zone terminal block<br/>12 zones + 2 commons]
  RAIN[Rain sensor input<br/>NC dry contact] --> MCU
  FLOW[Flow meter input<br/>pulse] --> MCU
  BTN[BOOT + RESET tact switches] --> MCU
  MCU --> LED[RGB status LED — WS2812B]
```

## Single-board architecture

```mermaid
graph LR
  subgraph Board["Main Controller PCB (~120×170mm)"]
    subgraph Logic["Logic region (left half)"]
      MCU[ESP32-S3-WROOM-1-N8R8]
      USB[USB-C]
      PWR[24VAC → 5V buck → 3.3V LDO]
      SENS[Rain / flow inputs]
      LED[Status LED + buttons]
    end
    subgraph Relay["Relay region (right half)"]
      SSRS[12× G3MB-202P SSRs]
      TB[14-pos screw terminal block<br/>12 zones + 2 commons]
    end
    Logic -->|"internal traces<br/>ZONE1–12 + 5V + GND"| Relay
  end
```

**Why single board:** At v1 qty=5 prototype scale, the two-board split adds cost (extra fab setup, ribbon connector BOM, second assembly step) without meaningful upside — first-bringup revisions almost always touch both halves anyway. A single board mounts on the enclosure's 4 corner bosses, has no ribbon-cable failure point, and simplifies hand-assembly for the first units. The split can be revisited at rev3+ if the relay side proves stable and the logic side is iterating rapidly.

**Isolation between regions:** A routed slot (or minimum ≥3mm creepage clearance with no traces underneath) separates logic and relay regions. Same UL trick as the two-board version, executed on one board instead of two.

## Enclosure: Polycase WC-25F

```mermaid
graph TD
  ENC[Polycase WC-25F<br/>222×146×55mm exterior<br/>214×138×49mm interior<br/>NEMA 4X / IP65 / UL E194432]
  ENC --> FLANGE[Wall-mount flanges<br/>molded-in, no external kit]
  ENC --> COVER[Clear polycarbonate cover<br/>6× stainless screws<br/>silicone gasket]
  ENC --> BOSSES[8 PCB mounting bosses<br/>two 4-boss clusters top and bottom<br/>M3 or #4 thread-forming screws]
  ENC --> GLANDS[Cable entry via drilled glands<br/>2× CG3 recommended<br/>24VAC in + 12-zone bundle out]
```

**Selection reasoning:** Trade-off across the WC-series was between footprint, depth, and boss layout. WC-25F wins on:
- **Depth:** 49mm interior height (vs 84mm on WC-40) — half the wall protrusion, matches commercial irrigation controllers (Rachio 3, Rain Bird ESP-Me).
- **Mounting:** 8 native bosses in two 4-boss clusters — supports a single ~120×170mm board on 4 corner bosses, or two skinny boards on separate clusters if the split is revived later.
- **Flanges:** Molded-in mounting flanges — no separate `WP-90` external kit required.
- **Certification-adjacent:** UL & cUL Listed file E194432, NEMA 4X, IP65 out of the box.

**Ordering notes:**
- Part number: `WC-25F` (gray base, clear cover, molded-in flanges)
- Unit price ~$23 (qty 50) / ~$35 (qty 1)
- Add: `SCREWS-M3-6-100` M3 thread-forming screws for PCB mount, `CG3` cable glands for 24VAC and zone bundle entries, and `UA-021` air vent if condensation becomes an issue in outdoor deployments.

## v1 BOM (single board)

| Block | Part | Qty | $ each | Subtotal |
|---|---|---:|---:|---:|
| MCU | ESP32-S3-WROOM-1-N8R8 | 1 | 3.50 | 3.50 |
| **Zone switching** | **G3MB-202P SSR** | **12** | **~2.00** | **~24.00** |
| Power | Bridge rectifier (DB107S), bulk cap, TVS, PTC fuse | 1 set | — | 1.50 |
| Power | Buck IC (LM2596S-5) + inductor + caps | 1 | 1.20 | 1.20 |
| Power | LDO 3.3V (AP2112K-3.3) + caps | 1 | 0.20 | 0.20 |
| USB | USB-C receptacle + ESD (USBLC6-2SC6) + CC resistors | 1 | 0.80 | 0.80 |
| UX | 2× tact switches, WS2812B RGB LED, resistors | — | — | 1.00 |
| Terminals | 14-pos screw terminal block (3.5mm pitch) + 2-pos 24VAC input | — | — | 2.50 |
| Passives | Decoupling, pull-ups, misc 0603 | ~50 | — | 1.00 |
| Enclosure | Polycase WC-25F + M3 screws + 2× CG3 glands | 1 set | — | 25.00 |
| **Parts total** | | | | **~$60** |

LCSC part numbers will be filled in during KiCad capture.

## Power input architecture

The PCB accepts 24VAC via a **2-position screw terminal (J2)**, 5mm pitch — Phoenix MPT 0.5/2 or Dinkle EK500V-2P. Wires screw down onto whatever pigtail feeds it. That's the entire PCB commitment.

The enclosure/connector side is intentionally deferred until enclosure selection. Any of these can drive J2 with no PCB change:

| Option | When it makes sense |
|---|---|
| **Panel-mount barrel jack + pigtail** | Consumer product, plug-and-go UX. Panel-mount so cable yank goes into enclosure wall, not PCB solder joints. |
| **Hardwired transformer via strain-relieved cable gland** | Wall-mount fixed install, no user-visible connector |
| **Direct bare-wire wall wart** | Dev / prototype phase |

**Polarity:** 24VAC is AC, tip/sleeve/orientation irrelevant. The bridge rectifier downstream handles either.

**Future variant:** for tool-less service, replace J2 with a JST XH 2-pin or Molex Micro-Fit and crimp a mating connector on the pigtail — no other PCB changes.

## Zone-count configurability

v1 is fixed at 12 zones — no field configurability, no auto-detection. Firmware assumes 12 zones and exposes 12 in the API/UI.

If a future variant needs 4 or 8 zones, the simplest path is to populate fewer SSRs on the same PCB (BOM-only variant, no PCB re-spin) and expose a `zoneCount` field on the server-side device record so the UI hides unused zones. Deferred until there's a real reason.

## How the WROOM module attaches to the PCB

The ESP32-S3-WROOM-1 is a surface-mount LGA module — 41 pads on the underside plus a large center thermal/ground pad, with castellated edges for optional hand-soldering during repair. Reflowed by JLCPCB as a standard SMT component; no headers, no socket, no connector.

Design steps in KiCad:
1. Use Espressif's or JLCPCB's published footprint (functionally identical)
2. Copy the "ESP32-S3-WROOM-1 minimum design" reference schematic verbatim for the module section
3. Draw a keep-out rule area under the antenna region so DRC blocks any copper or traces there
4. Route USB D+/D− (IO19/20) as a 90Ω differential pair to the USB-C receptacle
5. Provide 10µF + 100nF decoupling close to VDD pins, plus EN and IO0 pull-ups with tact switches for RESET and BOOT

The center thermal pad ties into the ground pour with multiple vias for heat sinking and RF return. Antenna end of the module overhangs the board edge — this is the keep-out zone where any copper detunes the antenna and voids the inherited FCC certification.

## Cost projections (all-in, JLCPCB PCBA, single board + WC-25F enclosure)

| Qty | All-in total | Per unit | Notes |
|---:|---:|---:|---|
| 5 | $260–320 | $52–65 | One board vs two eliminates second setup charge |
| 10 | $380–460 | $38–46 | Setup amortized; enclosure adds ~$25/unit at qty 1 |
| 50 | $1,100–1,400 | $22–28 | Enclosure drops to ~$23/unit; parts pricing tiers kick in |

Lead time: ~7–10 days PCBA + 5–7 days DHL. THT parts (screw terminals, SSRs depending on package) hand-soldered for first 5–10 boards; switch to JLC's THT assembly service at scale.

## Layout rules of note

- **Antenna keep-out:** The ESP32-S3-WROOM module overhangs the board edge. No copper, no traces, no ground pour under the antenna section. Espressif publishes the exact keep-out region in the module datasheet.
- **Logic/relay region isolation:** A routed slot (or minimum ≥3mm bare-copper-free clearance) separates the logic region from the relay region on the single board. Preserves the same UL creepage that a two-board split would provide.
- **Mains creepage:** ≥3mm between switched 24VAC traces on the relay region. Slots cut between adjacent SSRs improve isolation.
- **USB D+/D− differential pair:** Match length, keep short, 90Ω differential impedance.
- **Buck loop area:** Keep the input cap, switch node, inductor, and output cap tight to minimize EMI.
- **Star ground for the SSRs** in the relay region — return currents from 12 SSRs add up. Tie the SSR return star to the logic GND at exactly one point near the buck output.
- **Mounting holes:** 4× M3 through-holes positioned to match the WC-25F's 4 outermost corner bosses (two clusters of 4, use the outermost of each cluster). Exact XY coordinates transcribed from the Polycase WC-25F 2D DWG.

## Certification considerations

Certification strategy is documented separately — see the [UL certification strategy memory](../../.claude/projects/.../memory/project_ul_certification.md) or summary below.

**Architectural wins already baked in:**
- 24VAC Class 2 wall wart → no mains AC certification needed (UL 1310 / NEC 725)
- ESP32-S3-WROOM-1-N8R8 module is FCC/IC/CE pre-certified — inherited if antenna keep-out is respected

**No-regret items for v1 layout (basically free):**
- Strict antenna keep-out per Espressif datasheet — **the most expensive mistake to make**
- ≥3mm creepage between 24VAC channels in the relay region
- UL-Recognized components: G3MB-202P SSR, screw terminals (Phoenix/Wago/Dinkle), PTC fuse holder
- PTC resettable fuse on 24VAC input (~500mA hold / 1A trip)
- PCB fab notes specify FR-4 with UL94 V-0
- Silkscreen real estate reserved for FCC ID, IC ID, model number, ratings, "Class 2", manufacturer
- USB ESD: USBLC6-2 on D+/D− and VBUS
- Optional common-mode choke footprint on USB (DNP)
- Hi-pot test point pads on the 24VAC side
- Mounting hole layout compatible with off-the-shelf UL-listed flame-rated enclosures

**Certification roadmap:**
- v1 release: FCC SDoC + CE self-declaration ($5–10K, 1–3 months)
- Full UL/ETL listing deferred until a retail channel (Home Depot, Lowes, utility rebate program) requires it

## Open questions

- Status LED: single WS2812 or a few discrete LEDs (one per "system state")?
- USB-C orientation: edge-mounted (accessible through drilled hole in WC-25F short wall) or unmounted (service only, requires opening lid)? Edge-mount is more product-like but requires precise enclosure drilling.

## Next steps

1. ~~Install KiCad 10.x~~ done
2. ~~Schematic capture: logic section~~ done — see `hardware/main-controller-v1/`
3. Add SSR block (12× G3MB-202P) + 14-pos terminal block to the schematic
4. Assign footprints (JLCPCB LCSC parts where possible)
5. Re-run ERC
6. Import WC-25F 2D DWG → extract mounting boss XY coordinates → PCB layout with 4-corner mounting hole placement
7. PCB layout, DRC, Gerber export
8. Order first 5 boards + WC-25F enclosures + CG3 glands from JLCPCB + Polycase
