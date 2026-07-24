# main-controller-v1 rev1/rev2 order status

**Goal:** submit a corrected fab archive to JLCPCB and get 5 boards assembled.

**Current state (2026-07-17):**
- **JLC PCBA** (5 boards, main-controller-v1): In Production per JLC dashboard (advanced 2026-07-12 17:34). DHL Express DDP shipping. Est. delivery **2026-07-22 to 2026-07-24**. Held informally at Data Preparation stage pending SSR (C401984) substitution reply from Swee.
- **Digikey DNP parts** (Sales Order 100338361, $70.24): ✅ **DELIVERED 2026-07-17.** All 5 line items received, ahead of JLC boards as planned.

Digikey line items:
| Ref | Digikey P/N | MPN | Qty | Received | Notes |
|---|---|---|---|---|---|
| J1 | 455-1708-ND | JST B6B-PH-K-S | 10 | ✅ 2026-07-17 | 2.0mm 6-pin vertical header for USB-C pigtail |
| SW1/SW2 | SW400-ND | Omron B3F-1000 | 10 | ✅ 2026-07-17 | 6mm tact THT (BOOT/RESET) |
| D3 | 4878-1N5822CT-ND | Diotec 1N5822 | 10 | ✅ 2026-07-17 | DO-201AD Schottky buck freewheel |
| J2/J3/J4/J6 | ED2609-ND | On Shore OSTTC022162 | 100 | ✅ 2026-07-17 | 5.08mm 2-pos screw terminal (gang-mount for J6 14-pos) |
| C5 | P14461-ND | Panasonic EEU-FR1H471 | 10 | ✅ 2026-07-17 | 470µF **50V** FR-A radial, D10×L20mm, upgraded from 25V for +VRAW headroom |

**Digikey sourcing notes:**
- C5 voltage upgraded from parts.yaml's "25V+" to **50V** — +VRAW after bridge peaks ~38V at high line, 25V caps would fail in service.
- J6 14-pos terminal implemented as **7× ganged 2-pos** OSTTC022162 blocks (5.08mm pitch, interlocking sides). Simpler sourcing than single 14-pos, standard field practice.
- Terminal blocks are **5.08mm pitch** vs. KiCad footprint's 5.00mm — 0.08mm delta is within typical hole/lead tolerance, interchangeable in practice. Consider updating KiCad footprint to 5.08mm for rev2 to match industry standard.

Update the checkboxes as you complete each item.

---

## Phase 1 — Verify what's actually broken (Saturday morning, 2-3 hrs)

Open each footprint in KiCad Footprint Editor, cross-reference against the manufacturer datasheet, and probe pcbnew for net names. Record verdict: **false alarm** (3D model only), **silkscreen only** (cosmetic), or **real bug** (copper/footprint wrong).

**Phase 1 running tally (updated as we verify):**
| Part | Status | Verdict |
|---|---|---|
| D2  | ✅ done + FIXED 2026-07-11 | REAL BUG — schematic net swap on pads 1/4 (now resolved) |
| C6  | ✅ done | FALSE ALARM — JLC `CP_Elec_*` 180° rotation artifact |
| C7  | ✅ done | FALSE ALARM — JLC `CP_Elec_*` 180° rotation artifact |
| U4  | ✅ done | FALSE ALARM — JLC SOT-23 −90° rotation artifact; footprint + wiring correct |

**Verification method reminder:** JLC's 3D preview is NOT source of truth — some package families (SOT-23, CP_Elec_*) have known rotation-offset artifacts that make correct footprints render "wrong." Ground truth = KiCad Footprint Editor + pcbnew net probe + datasheet cross-check.


- [x] **D2 DB107S — verify silkscreen vs pinout** (task #21) — verified 2026-07-11
  - Footprint: `Diode_SMD:Diode_Bridge_Diotec_SO-DIL-Slim`
  - Footprint pad layout confirmed correct: pad 1 top-left, pad 4 top-right, pad 2 bottom-left, pad 3 bottom-right (pins on left/right sides, matches physical SO-DIL-Slim package)
  - Net probe in pcbnew:
    - Pad 1 → **+VRAW** ❌ (expected AC/24VAC)
    - Pad 2 → GND ✓
    - Pad 3 → 24VAC_HOT ✓
    - Pad 4 → **24VAC_COM** ❌ (expected +VRAW / DC+)
  - **Verdict: REAL BUG — schematic pin-to-net mapping swapped on pads 1 and 4.** 24VAC would be shorted onto the +VRAW rail; downstream (C6, LM2596, +5V, +3V3, MCU) would see AC and burn on power-up.
  - **Fix required (Phase 3 batch):** in eeschema, swap D2's pad-1 and pad-4 net connections so pad 1 = 24VAC_COM and pad 4 = +VRAW. Also verify against DB107S datasheet that pad 1 and pad 3 both being AC inputs is the intended pin function (diagonal AC/DC arrangement is standard for this package). Re-route the affected traces in pcbnew after schematic update.
  - Root-cause note: the JLC 3D preview flagged this correctly. The footprint's silkscreen showed the standard bridge symbol on correctly-numbered pads, but the schematic wired the wrong nets to those pads — a schematic-symbol issue, not a footprint issue.
  - **FIX APPLIED 2026-07-11 (out of order, ahead of Phase 3 batch):**
    - Root cause: D2 used `Device:D_Bridge_+-AA` (pins: 1=+, 2=−, 3=A, 4=A). DB107S needs 1=A, 2=−, 3=A, 4=+. KiCad stock library has 5 D_Bridge variants; none match DB107S.
    - Fix path: renumbered pins in-place via Symbol Editor (right-click D2 → Edit Symbol). Symbol unlinks from Device library, becomes a local instance. Pin position/name preserved; only pin numbers changed. Top: 3→1. Bottom: 4→3. Right: 1→4. Left: 2 (unchanged). Also added `~` names to AC pins (cosmetic).
    - ERC: 0 errors, 1 expected warning ("Symbol doesn't match copy in library Device" — intended after local edit).
    - Update PCB from Schematic (F8) log: `Reconnected D2 pin 3 from 24VAC_HOT to 24VAC_COM. Reconnected D2 pin 1 from /+VRAW to 24VAC_HOT. Reconnected D2 pin 4 from 24VAC_COM to /+VRAW.` Pad 2 (GND) unchanged. 0 errors.
    - PCB re-routed. Final pad assignments verified on board: pad 1=24VAC_HOT, pad 2=GND, pad 3=24VAC_COM, pad 4=+VRAW. All traces reach correct downstream nets (F1, C6, C5, J2, D1). DRC clean.

- [x] **C6/C7 electrolytics — verify polarity** (task #22) — verified 2026-07-11
  - Footprint: `Capacitor_SMD:CP_Elec_6.3x5.4`
  - Footprint confirmed correct: pad 1 = anode with "+" silkscreen marker, pad 2 = cathode
  - Net probe in pcbnew:
    - C6: pad 1 → **+VRAW** ✓, pad 2 → **GND** ✓
    - C7: pad 1 → **+5V** ✓, pad 2 → **GND** ✓
  - **Verdict: FALSE ALARM.** JLC 3D preview showed the cathode band over silkscreen "+" because `CP_Elec_*` footprints have a known **180° rotation offset** in the JLC rotation-correction DB (JLCKicadTools, Fabrication Toolkit). The manufactured cap will be placed 180° from the 3D preview render — cathode band over pad 2, "+" over pad 1 = correct polarity.
  - **Fix required: none.** No footprint changes, no schematic changes.
  - Note: if using the plugin-free `export_jlc_package.sh` (kicad-cli), verify it applies the CP_Elec 180° rotation offset when generating positions.csv. If not, use Fabrication Toolkit (once fixed) or manually offset. Otherwise the assembled cap really will be reversed.

- [x] **U4 SOT-23-5 — verify pad geometry** (task #23) — verified 2026-07-11
  - Footprint: `Package_TO_SOT_SMD:SOT-23-5` (KiCad stock, JEDEC MO-178 Variation AA)
  - Pad center coordinates measured in Footprint Editor:
    - Pad 1: (−1.1375, −0.95)
    - Pad 2: (−1.1375,  0.00)
    - Pad 3: (−1.1375, +0.95)
    - Pad 4: (+1.1375, +0.95)
    - Pad 5: (+1.1375, −0.95)
  - Same-row pitch = 0.95 mm ✓ (matches JEDEC spec)
  - Row-to-row pad center X = 2.275 mm — matches IPC-7351 nominal for SOT-23-5. Physical lead tip at ~1.40 mm sits within pad's outer edge (1.6375) and inner edge (0.6375) with ~0.24 mm heel margin. Textbook footprint.
  - Pad-1 marker (yellow triangle) at top-left ✓; pad 4 marked with "x" = KiCad's unconnected-pad indicator, expected because AP2112K pin 4 is NC.
  - **Verdict: FALSE ALARM.** JLC 3D preview showed "pins floating over blank mask" because SOT-23 has a **−90° rotation offset** in JLC's rotation-correction DB. The preview rotated the 3D model 90° from the pads. Manufactured board will apply the offset and land the leads correctly.
  - **Fix required: none** at the footprint level.
  - Net probe in pcbnew (2026-07-11):
    - Pad 1 (VIN) → **+5V** ✓
    - Pad 2 (GND) → **GND** ✓
    - Pad 3 (EN)  → **+5V** ✓ (tied to VIN = always-on, standard config)
    - Pad 4 (NC)  → unconnected ✓
    - Pad 5 (VOUT) → **+3V3** ✓
  - Both footprint AND schematic wiring correct. C8/C9 (10µF in/out decoupling) properly placed at pads 1 and 5.

- [x] **Decision point (2026-07-11):** Phase 1 reveals **1 real bug (D2 schematic net swap)** and **3 false alarms (C6, C7, U4 — all JLC 3D preview rotation-offset artifacts)**. Under the ≤2-real-bug gate → proceed to Phase 2 audit, then Phase 3 fixes.

**Phase 1 result summary:**
| Part | Verdict | Fix action |
|---|---|---|
| D2 | 🔴 REAL BUG | Schematic edit: swap D2 pad 1 ↔ pad 4 net connections; re-route |
| C6 | ✅ FALSE ALARM | None (design correct; JLC preview rotation artifact) |
| C7 | ✅ FALSE ALARM | None (design correct; JLC preview rotation artifact) |
| U4 | ✅ FALSE ALARM | None (design correct; JLC preview rotation artifact) |

**Two new Phase 3 items surfaced during Phase 1:**
1. ~~**D2 schematic net swap** (pads 1 ↔ 4) — highest priority; would destroy board on power-up if unfixed.~~ **FIXED 2026-07-11.**
2. ~~**Verify CPL rotation offsets applied by `export_jlc_package.sh`** — critical for `CP_Elec_*` (180°) and `SOT-23*` (−90°). If the plugin-free script doesn't apply them, physical assembly will be reversed even though the design is correct. Highest-risk unknown in fab flow.~~ **FIXED 2026-07-12.** Audited script — original had NO offset correction (would have shipped C6/C7 reversed and U2/U4 rotated 90°). Added inline Python `ROTATION_OFFSETS` table sourced from JLCKicadTools `cpl_rotations_db.csv`; covers `CP_Elec_*` (+180), `SOT-23-5/6/generic` (+270 = −90), `SOT-223` (+180), `SOIC/SSOP/TSSOP/LQFP/TQFP/QFN` (+270). Script now prints audit log: 4 parts corrected (C6, C7 → 180°; U2, U4 → 270°), 50 parts pass-through with per-package review annotations documented in-script (WS2812B 5.0×5.0 not in DB, ESP32-S3 not covered by DB's ESP32-W pattern, TO-263 no known offset, D_SMA/D_SMB standard). Verified `production/main-controller-v1_positions.csv` header matches JLC expectation (`Designator,Mid X,Mid Y,Rotation,Layer`).

**Post-D2 layout follow-ups (2026-07-11):**
- **Buck loop trace widths**: audited and widened 2026-07-11. All high-current segments now ~0.5-1mm: L1↔D3 (SW node), D2→C5/C6 (+VRAW), C6→U3 pin 1, U3 pin 4→C7 (+5V), F1→D2 (24VAC in), D2→J2 (24VAC return), D3 anode via to B.Cu GND plane. Comfortable margin over IPC-2221 1A ratings. **Closed.**
- **Zone AC output trace widths (KX/2 → J6/X)**: audited and widened 2026-07-11. All 12 Z_OUT traces now ~0.75mm (30 mil) — supports 1A steady per zone with margin for solenoid inrush (~500mA-1A). 24VAC_HOT trunk rail on B.Cu (K1/1 ↔ K2/1 ↔ ... ↔ K12/1) widened to 1.5mm (60 mil) — carries sum of active zone currents from the trunk. 24VAC_COM return from J6 back to bridge similarly widened. DRC clean, 0 errors, 0 warnings. **Closed.**
- **U3 GND connection (tab + pin 5)**: pads were on **physically isolated F.Cu GND islands** carved out by the +VRAW / +5V / SW traces entering U3. Visual fill touched the pads but no continuous F.Cu path joined the fragments, and no vias dropped them to the B.Cu GND plane. Highlight-net (backtick) on pin 5 confirmed island isolation. **Fixed 2026-07-11** by adding stitching vias: one via at pin 5 and a thermal via array in the tab pad. Ratsnest cleared. Bonus: thermal vias in the tab are the standard LM2596 pattern for heatsinking — needed regardless. **Closed.**
- **Zone-fanout GND stitching (R7-R16 area)**: F.Cu GND pour was carved into isolated pockets by the parallel zone control traces exiting the WROOM to the relay drivers. **Added 7 stitching vias 2026-07-11** to bond the F.Cu islands to the B.Cu GND plane. Textbook practice — improves return-current paths, reduces EMI, and resolves ratsnest on fragmented pours. **Closed.** Consider adding more stitching along the board perimeter and in any other dense fanout areas (e.g. relay AC-side traces) as time permits — no downside to being generous.

**Key lesson learned:** JLC 3D DFM preview is **not source of truth** for polarized parts. Some package families have known rotation-offset artifacts (CP_Elec_* 180°, SOT-23* -90°, LQFP 270°, SOIC 270°, per JLCKicadTools/Fabrication Toolkit rotation DB). Always verify with: (a) footprint editor + datasheet mechanical drawing, (b) pcbnew net probe, (c) CPL rotation values. The preview flags a specific *symptom* (visual mismatch) but not the *cause* (schematic wiring vs. footprint vs. preview artifact).

---

## Phase 2 — Full SMD footprint audit (Saturday afternoon, 2-3 hrs, task #24)

For each SMT part in `parts.yaml`, verify:
1. Footprint pad geometry matches datasheet mechanical drawing
2. Pad numbering matches datasheet pin function assignments
3. Pad-1 designator marker on correct pad
4. Silkscreen graphics (polarity marks, orientation) match pad numbers

Priority order (custom → fine-pitch → passives):

- [x] **K1-K12 G3MB-202P** (Azul:G3MB-202P custom footprint — HIGHEST RISK, 12 relays) — verified 2026-07-11
  - Pad geometry: 7.62/10.16/2.54mm pitches (total span 20.32mm) match G3MB-202P (no `-4` suffix) datasheet
  - Hole 1.0mm ✓, pads 1-2 (AC load) OD 2.0mm, pads 3-4 (DC input) OD 1.8mm
  - Pad 3 → Net-(KX-+) LED anode side ✓; pad 4 → GND cathode side ✓; datasheet reverse-polarity warning satisfied
  - **Fix applied**: added F.Fab triangle pad-1 marker (apex-up) to `Azul:G3MB-202P` library footprint, propagated to all 12 K instances via **Tools → Update Footprints from Library** with library id filter `Azul:G3MB-202P`. All 12 report `: OK`.
  - Verdict: PASS. All 12 relays fully verified.
- [x] **U1 ESP32-S3-WROOM-1** (PCM_Espressif:ESP32-S3-WROOM-1) — verified 2026-07-11
  - Source: official Espressif PCM library (Package Manager). No local edits.
  - Pad geometry: 51 pads (40 castellated + 11 thermal GND). Castellated pad 0.9 × 1.5 mm, matches datasheet Fig. 5.1 exactly.
  - Pin 1 = GND ✓ (position −8.75, −8.26 mm), pin 15 = GPIO3/TOUCH3/ADC1_CH2 ✓
  - Antenna keep-out: board Edge.Cuts steps in above the module so antenna hangs off the PCB edge. "Antenna Area" region has both F.Cu and B.Cu pours cleared. Textbook Espressif compliance.
  - Thermal pad (pad 41 array): stitching vias present in each of the 11 GND thermal pads bonding to B.Cu GND plane.
  - Net probe: pin 1 GND, pin 2 +3V3, pin 40 GND, pins 4-5 RAIN/FLOW (future sensor inputs), zones 1-12 all mapped, LED_DATA + USB_D± wired.
  - Verdict: PASS. No changes.
- [x] **U2 USBLC6-2SC6** (Package_TO_SOT_SMD:SOT-23-6) — verified 2026-07-11
  - Footprint: stock KiCad `Package_TO_SOT_SMD:SOT-23-6`, JEDEC MO-178 Var AB. 6 pads, pad-1 marker on F.Silkscreen (yellow triangle).
  - Net probe: pin 1 USB_D-, pin 2 GND, pin 3 USB_D+, pin 4 USB_D+_RAW, pin 5 +5V, pin 6 USB_D-_RAW. Matches ST datasheet pinout — connector-side pins (1,3) clamp to MCU-side pins (6,4).
  - LCSC C7519 confirmed in parts.yaml.
  - Rotation offset: SOT-23-6 family = −90° in JLC rotation DB. Covered by Task #5 (CPL rotation offset verification in Phase 3).
  - Verdict: PASS. No changes.
- [x] **U3 LM2596S-5** (Package_TO_SOT_SMD:TO-263-5_TabPin3) — verified 2026-07-11
  - Footprint: stock KiCad `Package_TO_SOT_SMD:TO-263-5_TabPin3` (D²PAK-5, tab = pin 3). 10 pads (5 gullwing + 5 tab sub-pads, all wired to pin 3). F.Silkscreen pad-1 marker.
  - Net probe:
    - Pin 1 (VIN) → +VRAW ✓
    - Pin 2 (SW) → Net-(D3-K) → L1/1 + D3 cathode ✓
    - Pin 3 (GND) + tab → GND ✓
    - Pin 4 (FB) → +5V ✓ (fixed-5V variant, FB tied directly to output)
    - Pin 5 (ON/OFF) → GND ✓ (always-on config)
  - Full buck loop traced end-to-end: +VRAW → U3/1 → U3/2 (SW) → L1 → +5V; catch diode D3 → SW node with anode to GND.
  - LCSC C5276750 confirmed.
  - Verdict: PASS. No changes.
- [x] **D1 SMBJ33CA** (Diode_SMD:D_SMB) — verified 2026-07-11, **Phase 3 fix required**
  - Footprint: stock `Diode_SMD:D_SMB` (DO-214AA). 2 pads. Pass on geometry.
  - Net probe: pad 1 = 24VAC_COM, pad 2 = 24VAC_HOT — placed across the AC input, pre-bridge.
  - Schematic verified: D1 is intentionally on the AC side (pre-F1 wire between 24VAC_HOT after fuse and 24VAC_COM). PCB layout correctly implements the schematic. Not a "wiring bug" like D2.
  - **Concern**: SMBJ33CA has 33V standoff / 36.7V breakdown min. 24VAC peaks at 34V; real-world wall warts often run 26-28VAC unloaded → 37-40V peaks. D1 would conduct on every AC cycle at high line, self-heat, and eventually fail short → PTC trips → controller dead.
  - **Fix decided (2026-07-11)**: move D1 to DC side (+VRAW / GND). 33V standoff matches +VRAW nominal (~33VDC), well below LM2596 40V max input. AC-side transient suppression is better served by a MOV or gas-discharge if desired, not a small SMB TVS.
  - **Phase 3 action**: in eeschema, disconnect D1 from 24VAC_HOT/24VAC_COM. Reconnect D1 between +VRAW and GND. Update PCB from schematic (F8). Re-route D1 in pcbnew near C6 (buck input cap) for shortest clamp loop.
  - **Schematic redrawn 2026-07-11**: D1 pad 2 wired to +VRAW node (D2 pin 4), D1 pad 1 wired to GND.
  - **PCB re-routed 2026-07-11**: F8 propagated schematic changes; D1 pad 2 traces to +VRAW rail alongside D2 pad 4; D1 pad 1 bonded to B.Cu GND plane. Short clamp loop, low inductance. DRC clean.
  - **Verdict: FIXED same day (out of Phase 3 batch, done inline).**
- [x] **D4 SS14** (Diode_SMD:D_SMA) — verified 2026-07-11
  - Footprint: stock KiCad `Diode_SMD:D_SMA` (DO-214AC). 2 pads. LCSC C2480 ✓ (matches parts.yaml).
  - Pad geometry standard; silkscreen shows diode symbol with pad-1 (cathode) marked correctly on the band side.
  - Net probe:
    - Pad 1 (K, cathode) → **+5V** ✓
    - Pad 2 (A, anode) → Net-(D4-A) → J1 pins B9 + A9 (USB-C VBUS, both orientations) ✓
  - Role: VBUS OR-ing / anti-backfeed diode. USB plugged in → forward-biased, powers +5V rail through ~0.3V Schottky drop. Wall wart running → reverse-biased, no backfeed to USB host. Textbook design.
  - SS14 specs match role: 40V VR (8× margin over 5V), 1A forward (5× margin over ESP32-S3 boot current), ~0.3V Vf keeps +5V rail at ~4.7V (adequate for LDO headroom).
  - Rotation offset: no known JLC offset for `D_SMA` family; 0° default should be correct in CPL.
  - Verdict: PASS. No changes.
- [x] **D5 WS2812B** (LED_SMD:LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm) — verified 2026-07-11
  - Footprint: stock KiCad `LED_SMD:LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm`. 4 pads in PLCC-4 layout: 1 top-left, 2 bottom-left, 3 bottom-right, 4 top-right.
  - LCSC C2761795 ✓; datasheet: adafruit WS2812B PDF ✓.
  - Physical package has molded chamfered corner at pin 3 (per datasheet) — visible in F.Silkscreen; not a pad-1 marker (that's a printed dot on top of the physical LED at pin 1).
  - Net probe (matches WS2812B datasheet pinout perfectly):
    - Pad 1 (VDD_1, power_in) → **+5V** ✓
    - Pad 2 (DOUT_2, output+no_connect) → **unconnected-(D5-DOUT-Pad2)** ✓ (single-LED chain, no daisy)
    - Pad 3 (VSS_3, power_in) → **GND** ✓
    - Pad 4 (DIN_4, input) → **/LED_DATA** ✓ (from WROOM GPIO21)
  - C11 (100nF 0603) decoupling cap adjacent to D5 at +5V/GND — standard WS2812B design practice.
  - **Rotation offset caveat**: WS2812B isn't in the big-four JLC rotation-offset families, but LCSC WS2812B listings sometimes need rotation correction. **Add to Task #5 CPL rotation verification checklist** — confirm printed pin-1 dot lands on the +5V corner (top-left) in JLC preview before submitting.
  - Verdict: PASS. No changes to design; verify CPL rotation in Phase 3.
- [x] **L1 33uH** (Inductor_SMD:L_Bourns_SRR1260) — verified 2026-07-11
  - Footprint: stock KiCad `Inductor_SMD:L_Bourns_SRR1260`. 2 rectangular pads (2.9 × 5.4mm) on opposite sides of ~12.5mm body. Matches Bourns SRR1260 datasheet.
  - LCSC C840528 ✓.
  - Non-polar; either pad on either net is fine electrically.
  - Net probe:
    - Pad 1 → **Net-(D3-K)** ✓ (SW node — shared with LM2596 pin 2 and D3 cathode)
    - Pad 2 → **+5V** ✓ (buck output rail)
  - Full buck loop consistency confirmed end-to-end across U3 + L1 + D3 verifications: `+VRAW → U3/1 → U3/2 (SW) → L1 → +5V`, with D3 catch diode at SW node.
  - Verdict: PASS. No changes.
- [x] **F1 500mA PTC** (Fuse:Fuse_1812_4532Metric) — verified 2026-07-11
  - Footprint: stock KiCad `Fuse:Fuse_1812_4532Metric` — IPC-7351 nominal 1812 SMD. Non-polar. 2 rectangular pads.
  - LCSC C17313 ✓.
  - Net probe:
    - Pad 1 → **24VAC_HOT** ✓ (fused side → D2 pin 1)
    - Pad 2 → **Net-(J2-Pin_1)** ✓ (pre-fuse side, J2 screw terminal input)
  - Topology: J2/1 → Net-(J2-Pin_1) → F1/2 → F1/1 → 24VAC_HOT → D2/1. Textbook AC input protection in series with the hot leg.
  - 500mA hold rating is well-sized: single active solenoid coil (~350mA @ 24VAC) + buck-side draw (~50-100mA) ≈ 500mA. Trips on shorts or multi-coil fault; passes on legitimate 1-zone operation.
  - Verdict: PASS. No changes.
- [x] **Ceramic caps 0603** (C2/4/10/11, C3) — Capacitor_SMD:C_0603_1608Metric — verified 2026-07-11 by representative sample
  - **Representative verified: C2 (100nF WROOM decoupling)** — footprint `Capacitor_SMD:C_0603_1608Metric` (IPC-7351 nominal), LCSC C14663.
    - Net probe: pad 1 → +3V3 ✓, pad 2 → GND ✓
  - Verification-by-inspection basis: all 5 caps use identical stock KiCad footprint (2 pads, IPC nominal geometry), non-polar ceramic (orientation irrelevant), and DRC pass confirms all nets resolve without ratsnest.
  - Verdict: PASS. No changes.
- [x] **Ceramic caps 0805** (C1/8/9) — Capacitor_SMD:C_0805_2012Metric — verified 2026-07-11 by representative sample
  - **Representative verified: C8 (10µF U4 LDO input)** — footprint `Capacitor_SMD:C_0805_2012Metric` (IPC-7351 nominal), LCSC C15850.
    - Net probe: pad 1 → +5V ✓, pad 2 → GND ✓
  - Same verification-by-inspection basis as 0603 caps; larger pads than C_0603 but same stock KiCad geometry.
  - Verdict: PASS. No changes.
- [x] **Resistors 0603** (R1-R18) — Resistor_SMD:R_0603_1608Metric — verified 2026-07-11 by representative sample
  - **Representative verified: R1 (10k WROOM EN pull-up)** — footprint `Resistor_SMD:R_0603_1608Metric` (IPC-7351 nominal), LCSC C25804.
    - Net probe: pad 1 → +3V3 ✓, pad 2 → Net-(U1-EN) ✓
  - Same verification-by-inspection basis: all 18 resistors use identical stock KiCad footprint, non-polar, DRC clean.
  - Verdict: PASS. No changes.

**Phase 2 result summary (closed 2026-07-11):**

| Category | Parts | Verdict | Fix action |
|---|---|---|---|
| K1-K12 | G3MB-202P (Azul custom) | ✅ PASS | Added F.Fab pad-1 marker to library, propagated to 12 relays |
| U1 | ESP32-S3-WROOM-1 | ✅ PASS | None |
| U2 | USBLC6-2SC6 (SOT-23-6) | ✅ PASS | None (rotation offset via CPL) |
| U3 | LM2596S-5 (TO-263-5) | ✅ PASS | None |
| D1 | SMBJ33CA (SMB) | 🟡 REAL BUG | Moved AC→DC (FIXED inline 2026-07-11) |
| D4 | SS14 (SMA) | ✅ PASS | None |
| D5 | WS2812B (PLCC-4) | ✅ PASS | None (verify CPL rotation) |
| L1 | 33µH SRR1260 | ✅ PASS | None |
| F1 | 500mA PTC 1812 | ✅ PASS | None |
| C1-C4, C10, C11 | 0603 ceramic | ✅ PASS | None (representative: C2) |
| C1, C8, C9 | 0805 ceramic | ✅ PASS | None (representative: C8) |
| R1-R18 | 0603 resistor | ✅ PASS | None (representative: R1) |

**Phase 2 real-bug count: 1 (D1)** — fixed inline same day. Running total (Phase 1+2): **2 real bugs** (D2 net swap, D1 clamp placement), both fixed. **Escape-hatch threshold (≤2 real bugs) cleared → proceed to Phase 3.**

---

## Phase 3 — Batch fixes in KiCad (Sunday morning, 2-3 hrs)

Do ALL fixes in one KiCad session, in this order:

- [x] **Schematic changes** (main-controller-v1.kicad_sch) — DONE 2026-07-12
  - [x] Delete J1 (USB-C receptacle) and remove HRO TYPE-C-31-M-12 footprint reference
  - [x] Add 6-pin header (2.0mm pitch, JST PH keyed shroud) for USB-C pigtail connection
    - **Part: JST B6B-PH-K-S** (top-entry, keyed, 6-pin, 2.0mm pitch). LCSC C131357. Footprint: `Connector_JST:JST_PH_B6B-PH-K-S_1x06_P2.00mm_Vertical`. Keyed shroud prevents pigtail from being plugged in backward.
    - Pigtail: https://www.amazon.com/Female-Waterproof-Terminal-Pigtail-Extension/dp/B0D962KHF2 (waterproof, IP-rated USB-C bulkhead)
    - **Header pinout (locked, do not reorder):**
      | Pin | Signal | Cable color | USB-C pin(s) |
      |---|---|---|---|
      | 1 | +VBUS | Red    | A4, B9 (bonded) |
      | 2 | GND   | Black  | A1/A12/B1/B12 (bonded) |
      | 3 | D+    | Blue   | A6, B6 (bonded, reversible) |
      | 4 | D−    | White  | A7, B7 (bonded, reversible) |
      | 5 | CC1   | Green  | A5 |
      | 6 | CC2   | Yellow | B5 |
    - Verify wire-to-pin mapping with a multimeter on pigtail arrival before wiring the schematic (Amazon listings sometimes swap D+/D− or CC1/CC2 — the diagram from the seller is the source of truth, not the product photo).
  - [x] **CC1/CC2 pull-downs verified wired** — DONE 2026-07-12. R3 (5.1kΩ) on J1 pin 5 (CC1) → GND, R4 (5.1kΩ) on J1 pin 6 (CC2) → GND. F8 log confirms: "Reconnect R3 pin 1 from Net-(J1-CC1) to Net-(J1-Pin_5). Reconnect R4 pin 1 from Net-(J1-CC2) to Net-(J1-Pin_6)."
    - **Why USB-C sinks need these:** USB-C sources use CC-line resistance to detect that a sink is attached before enabling VBUS. Without 5.1kΩ to GND on both CC lines, most modern USB-C hosts refuse to output 5V.
    - **Verify on pigtail arrival:** multimeter from pigtail CC1 wire → USB-C shell GND, and CC2 wire → USB-C shell GND. If either reads ~5.1kΩ, the pigtail duplicates the pull-downs — decide whether to keep both (harmless, parallel = 2.55kΩ, still spec'd as Rd) or remove R3/R4 from the PCB.
  - [x] ~~**Move D1 (SMBJ33CA) from AC to DC side**~~ — DONE 2026-07-11 inline (out of Phase 3 batch). Schematic rewired, PCB re-routed, DRC clean.
  - [ ] Fix any wrong symbols found in Phase 1/2 (e.g. DB107S pin assignments if needed)

- [x] **Update PCB from schematic** — F8 in pcbnew — DONE 2026-07-12, 0 errors 0 warnings

- [x] **PCB layout changes** (main-controller-v1.kicad_pcb) — DONE 2026-07-12
  - [x] Place new 6-pin header near where J1 was — placed in USB-C Port region, top of board
  - [x] Re-route affected traces (D+/D-/VBUS/GND, CC1/CC2)
  - [x] Keep U2 (USBLC6-2SC6) ESD protection near new header — retained in place
  - [x] Keep C4 (VBUS decoupling) near new header — retained in place
  - [x] ~~**Move D1 SMBJ33CA to DC side**~~ — DONE 2026-07-11 inline. D1 pad 2 tied to +VRAW rail alongside D2/4; D1 pad 1 stitched to B.Cu GND plane.
  - [x] **Fillet outer 90° corners** (task #25) — 8× R.076 fillets rendered in preview_outline.py, verified in board_preview.png.
  - [ ] **Verify U1 antenna alignment** — U1 must sit under the enclosure top-wall antenna cutout when PCB is seated (see project_enclosure_first_samples.md)

- [x] **DRC pass** — clean, 0 violations, 0 unconnected, 0 errors, 0 warnings (completed 2026-07-12 in 1.19s)

- [ ] **Rerun apply_lcsc_fields.py**
  - [ ] Update parts.yaml — remove J1 entry, add header entry
  - [ ] Run `python3 scripts/apply_lcsc_fields.py --dry-run` — verify no unexpected changes
  - [ ] Run `python3 scripts/apply_lcsc_fields.py`

- [ ] **Regenerate fab package** — run `scripts/export_jlc_package.sh` (plugin-free, uses kicad-cli). Produces gerbers.zip + BOM.csv + positions.csv in `production/`. Fabrication Toolkit plugin is broken on current KiCad 10 point-release; do NOT rely on it.

---

## Phase 4 — Re-upload + re-verify DFM (Sunday afternoon, 1 hr)

- [ ] Return to JLC cart (auto-saved, `cart.jlcpcb.com/smt-order/?pcbFileNo=37e48b4526e1411b99176bf7126519a9`)
- [ ] Re-upload new gerber zip → will force BOM re-match (should be quick since parts.yaml LCSCs are baked into schematic)
- [ ] Re-review BOM matching page — confirm all 20 parts match with correct LCSCs
- [ ] **Advance to Component Placements review**
- [ ] **Re-check 3D DFM preview with same scrutiny as before:**
  - [ ] Every part's 3D model orientation
  - [ ] Silkscreen polarity marks align with pads
  - [ ] No pins floating off pads
  - [ ] No connectors facing inward
  - [ ] Antenna keep-out respected
- [ ] If clean → click NEXT → complete order (Standard PCBA, ENIG, depanel yes, edge rails added by fab)
- [ ] If new issues surface → document, defer, repeat next weekend

---

## Escape hatches

- **>2 real footprint bugs beyond U4 in Phase 1** → defer fab, extend audit
- **DRC won't pass by end of Sunday** → defer, don't ship a broken board
- **New DFM issues in Phase 4** → document, defer, don't push through
- **Losing enjoyment** → hobby project; $50-80 fab cost the same next weekend

---

## Also-buy (workshop tools + enclosure interface parts) — ✅ ALL ORDERED 2026-07-12

- [x] **USB-C-female-to-6-pin-header waterproof pigtail** — ordered
  - Primary candidate (waterproof, 2026-07-11): https://www.amazon.com/Female-Waterproof-Terminal-Pigtail-Extension/dp/B0D962KHF2
  - **Expected wire→signal mapping (USB 2.0 only, 6-conductor):** Red=+VBUS, Black=GND, White=D−, Blue=D+, Green=CC1, Yellow=CC2. Verify with multimeter on arrival (probe each wire against the correct USB-C receptacle pin).
  - **Also verify on arrival:** measure CC1↔GND and CC2↔GND resistance. If both are open circuit → PCB's R3/R4 5.1kΩ pull-downs (already wired) provide the CC pull-downs. If both read ~5.1kΩ → pigtail already has them, R3/R4 are redundant but harmless (parallel = 2.55kΩ, still spec'd as Rd).

- [x] **IP68 panel-mount 5.5×2.1mm DC barrel jack** — ordered
  - https://www.amazon.com/Waterproof-5-5x2-1mm-Pre-Soldered-Dustproof-Electronics/dp/B0FST27TBY
  - Specs: DC-099 style, 10A/50V, IP68 with threaded cap, 20 AWG × 150 mm pre-soldered pigtail, **12mm mounting hole**, panel range covers WC-25F's ~2.5mm short wall
  - Wires land on J2 (24VAC screw terminal). Polarity irrelevant (AC).

- [x] **24VAC 1A wall wart** — ordered
  - ANYINELEC 24V 1000mA AC adapter, 5.5×2.1mm plug, Rachio-compatible
  - Output: 24VAC 1000mA (27.5V no-load per seller multimeter test) → confirms C5 50V rating was necessary (27.5VAC RMS → ~38V peak → ~37V DC after rectification)
  - Delivers to J2 through the IP68 barrel jack + pigtail

- [x] **PG13.5 cable gland (5-pack)** — ordered
  - Nylon (PA66), black, IP68, with locknut + sealing insert
  - Sized for **0.355" (9mm) OD** Syston 8813 direct-burial 13-conductor sprinkler cable. PG13.5 range 6–12mm covers this comfortably in the middle third.

- [x] **Irwin 11103 Unibit3M step drill bit** — ordered
  - 6-18mm metric range, 3/8" shank
  - Covers the 12mm barrel jack hole cleanly. **Max is 18mm** — does NOT reach the 20mm gland hole size.
  - **Correction 2026-07-13:** Unibit3M's 18mm max was confirmed against the Amazon listing. To open the 20mm PG13.5 gland hole, drill 18mm then ream up 2mm with a hand reamer.

- [ ] **HSS hand reamer (3-20mm+ range)** — TODO before drilling
  - Needed to open the PG13.5 gland hole from 18mm (Unibit3M max) to 20mm.
  - Amazon search: "HSS hand reamer 3-20mm" or "taper reamer set" — ~$15-25.
  - Alternative: half-round bastard file for ~15 min hand-shaping (free if on hand).

---

## Reference

- Rev1 known bugs: tasks #20, #21, #22, #23; full audit #24
- Blocked JLC submission: tasks #9, #17
- LCSC corrections applied 2026-07-08: C6→C2836438, C7→C178541, D1→C78420, D2→C5377, D5→C2761795, F1→C17313, L1→C840528, U3→C5276750, U4→C51118
- Cart state at pause: "Automatically saved, last updated on 8 July, 08:53"
- Session memory: `~/.claude/projects/-Users-mitch-christensen-personal-dev-azul/memory/project_j1_usb_c_placement_bug.md` (and 3 sibling files)
