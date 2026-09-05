# Main Controller Rev2 — Board Bring-Up Procedure

**Scope:** Incremental power-up, verification, and firmware bring-up for the Azul main-controller Rev2 PCB (12-zone discrete-triac topology).

**Audience:** You, at the bench, hands dirty, iron hot. Print this. Check boxes with a pen.

**Companion log:** [`poc/rev2/dashboard.md`](../../poc/rev2/dashboard.md) — fill in per-board voltages, currents, and anomalies as you go.

**Time budget:** First board 90–120 min. Boards 2–5 drop to 30–45 min each once you have the rhythm.

**Golden rule:** if any stage misses spec, **STOP**, remove the last-installed R_JMP, and diagnose. Cascading past a broken rail destroys parts.

---

## 1. Bench setup

**Tools & instruments:**

- [ ] Soldering iron with fine tip (≤1 mm chisel), ~330 °C
- [ ] Kester 44 63/37 leaded, 0.020" (per shopping list)
- [ ] Flux pen/gel (MG Chemicals 8341 or Chip Quik SMD291)
- [ ] Solder wick, tweezers, magnification (loupe or USB scope)
- [ ] Flux cleaner (MG Chemicals 4140A aerosol or 91% IPA + toothbrush)
- [ ] Digital multimeter with continuity beep
- [ ] Bench power: **24 VAC transformer, 500 mA – 1 A**, terminated in 5.5×2.1 mm barrel plug
- [ ] Optional but nice: DC oscilloscope (buck ripple, zone triac firing)
- [ ] USB-C cable + laptop for firmware flash and serial console
- [ ] Zone load for triac test: 24 VAC incandescent lamp OR ~200 Ω 10 W resistor OR real solenoid
- [ ] Alligator-clip test leads

**Bench safety:**

- [ ] Board is on ESD mat, wrist strap grounded
- [ ] 24 VAC transformer is **unplugged from wall** during any solder work or R_JMP change
- [ ] Fume extraction on
- [ ] Nothing metallic beneath the board (no bare workbench + shorts to solder points)

---

## 2. Board identification

**Assign a serial number now.** Write it on the silkscreen with a fine Sharpie in the reserved rectangle (bottom edge, near J2). Use format `A2-01` through `A2-05` where `A2` = Rev2 batch A.

- [ ] Serial number assigned: `A2-___`
- [ ] Recorded on log at `poc/rev2/dashboard.md`

---

## 3. Pre-power inspection (before any parts installed)

Under magnification, check the JLC-assembled work.

### 3.1 WROOM (MSL 3+ part — JLC bake fee was paid)

- [ ] All 41 castellated pads have visible solder fillets
- [ ] No solder bridges between adjacent pads
- [ ] Center thermal pad reflowed (no visible tombstone / lift)
- [ ] Antenna keep-out zone is bare copper on top layer, no stray solder

### 3.2 Triac stage (per zone × 12 — spot-check 4 randomly, all if issues)

- [ ] MOC3062M (U*) oriented pin 1 to silkscreen dot / notch
- [ ] BT137 triac (Q*) tab orientation matches silkscreen
- [ ] Snubber R (39 Ω 2010) + snubber cap (X2) placed
- [ ] 120 Ω 0805 (R7/R10/…/R40) and 470 Ω 0805 (R8/R11/…/R41) in correct positions — pattern repeats every 3 refs per zone

### 3.3 Power stage

- [ ] Bridge rectifier D2 orientation: **pin 1 dot on silkscreen matches "+" AC input** (rev1 shipped with pins 1/4 swapped — verify rev2 fixed this)
- [ ] LM2596 (U3) orientation correct
- [ ] AP2112K-3.3 (U4) orientation correct
- [ ] SMD electrolytics (C6, C7) polarity: cathode bar on part matches "−" on silkscreen

### 3.4 USB-C footprint area (J1 landing)

- [ ] JST PH 6-pin footprint (J1) has all 6 pads visibly clean and un-bridged
- [ ] ESD chip (USBLC6-2) present and oriented correctly

### 3.5 Continuity checks (multimeter, no power)

Probe on each rail's exposed R_JMP pad (the R_JMPs are NOT installed yet, so rails are broken):

- [ ] **+5V rail pad → GND**: measure resistance. Should be **>10 kΩ** (buck output cap + downstream loads). If <100 Ω, there's a short — do not proceed.
- [ ] **+3V3 rail pad → GND**: should be **>10 kΩ**. If <100 Ω, short somewhere on WROOM/LDO section.
- [ ] **+VRAW pad → GND**: should be **>10 kΩ**. If low, bulk cap C5 (not installed yet, so this reads through bridge) or bridge is suspect.
- [ ] **24VAC HOT pad → 24VAC NEUTRAL pad**: should be **open** (no path yet). If low, TVS or MOV is shorted.

**STOP if any short is found.** Diagnose before continuing.

---

## 4. Hand-install pre-power parts

**Order matters.** These parts are power-path or programming-path. Install BEFORE any power is applied.

### 4.1 C5 — bulk cap, 470 µF 50 V radial electrolytic (Panasonic EEU-FR1H471)

⚠️ **POLARITY CRITICAL** — reversed = pops on power-up.

- [ ] Longer leg (anode, "+") to the pad marked "+" on silkscreen
- [ ] Body seated flush to board, leads clipped short, joints shiny
- [ ] Confirm polarity **once more** before soldering the second lead

### 4.2 D3 — Schottky freewheel diode, 1N5822 DO-201AD

⚠️ **POLARITY CRITICAL** — reversed = buck can't switch, or worse.

- [ ] Cathode band on diode body aligned with cathode line on silkscreen
- [ ] Body seated, leads clipped, joints shiny

### 4.3 SW1, SW2 — 6 mm tact switches (RESET, BOOT)

Non-polar. Install and confirm they click cleanly and springs back.

- [ ] SW1 (RESET) installed, clicks
- [ ] SW2 (BOOT) installed, clicks

### 4.4 J1 — JST PH 6-pin vertical header (USB-C pigtail landing)

Non-polar but orientation-locked by the shrouded connector body. Install with the shroud opening facing where the pigtail will exit.

- [ ] J1 installed, all 6 pins fully seated, no lifted pads
- [ ] Silkscreen pin-1 mark aligns with pigtail pin 1 (VBUS)

### 4.5 Do NOT install yet

- [ ] R_JMP1..R_JMP4 — installed one at a time during § 5
- [ ] J6 — zone terminal blocks — installed at § 8, right before zone tests

### 4.6 SMBJ33CA TVS — mandatory after A2-01 failure (2026-08-27)

⚠️ **Do NOT skip.** Rev2 boards without this TVS have failed on first power-up (see A2-01 in `poc/rev2/dashboard.md`). The 24 VAC wall wart produces plug-in transients that exceed the LM2596's 45 V absolute max.

- [ ] Solder **SMBJ33CA-13-F** (Diodes Inc., SMB / DO-214AA) across **+VRAW → GND**
- [ ] Topside tack: one wing on C5(+) can top, other wing to a nearby GND pad (D3 anode terminal works, or any exposed GND ring)
- [ ] Alternative: solder short leads to the SMBJ, then solder the leads to C5+ and any GND — strain-relieve with hot glue
- [ ] Bidirectional part (CA suffix) — orientation doesn't matter electrically, but for good habit, cathode dot faces +VRAW

---

## 4.7 Bench PSU LM2596 pre-check — mandatory after A2-01 failure (2026-08-27)

⚠️ **Run this BEFORE proceeding to § 5.** Validates the LM2596 in isolation using a clean, current-limited DC source, safe from any transformer transients. A2-02 established the healthy baseline: **+5.000 V at R_JMP3.2 across 12–34 V input, PSU in CV mode**.

Full procedure: `poc/rev2/board-A2-01-buck-diagnostic.md`

Short form:

- [ ] Probe wires soldered to R_JMP2.2 (drain / LM2596 VIN side) and to D3 anode (GND reference)
- [ ] R_JMP2 and R_JMP3 both **out**
- [ ] Bench PSU set to **12 V DC, 100 mA current limit**
- [ ] Connect PSU (+) → R_JMP2.2 wire, (−) → D3 anode wire
- [ ] Expected: PSU displays `12.0 V, 5–15 mA, CV lit` ✅
- [ ] R_JMP3.2 → GND (DMM): expected **~5.0 V DC** ✅
- [ ] LM2596 body: cool ✅
- [ ] Ramp PSU to 24 V then 30 V — output should stay at 5.0 V, chip cool
- [ ] If CC mode / voltage clamped / chip warm → chip is damaged. STOP. Do not proceed to AC. Rework required.

Once passed: unplug PSU, remove probe wires, continue to § 5.

---

## 5. Staged power-up

Each stage installs exactly **one** R_JMP and verifies the next rail. Between stages, **24 VAC is disconnected** while you're near the board with an iron.

### Stage A — 24 VAC input, no jumpers

- [ ] Confirm R_JMP1..R_JMP4 all **out**
- [ ] Connect USB-C pigtail to J1 (do NOT plug USB into laptop yet)
- [ ] Plug 24 VAC transformer into barrel jack, then into wall
- [ ] Measure at J2 terminals: **24 VAC ± 10 %** (target 24.0 V, acceptable 21.6 – 26.4 V)
- [ ] Measure across PTC fuse F1: should read **0 Ω** cold. If open, F1 tripped or bad.
- [ ] +VRAW pad → GND: still open circuit (no current path yet, R_JMP1 out)

**Pass criterion:** 24 VAC present at J2, PTC intact, no smoke, no heat. Unplug 24 VAC.

### Stage B — Install R_JMP1 (24VAC_HOT into bridge)

- [ ] R_JMP1 installed
- [ ] Plug in 24 VAC
- [ ] Measure at +VRAW rail (before R_JMP2): expect **~30 V DC** (24 × √2 − 2 Vf ≈ 32 V) with ~2 V ripple
- [ ] Touch bridge D2 and bulk cap C5 with fingertip — **should feel cool or barely warm**. Hot = problem.
- [ ] Current into board (measure at 24 VAC feed if you have a bench meter, else skip): a few mA (leakage only)

**Pass criterion:** +VRAW ≈ 28–34 V DC. Nothing warm.
**STOP if:** +VRAW is 0 V (bridge dead), or D2 gets hot in <5 s (pinout wrong — verify vs § 3.3.3), or C5 pops (polarity wrong).

Unplug 24 VAC.

### Stage C — Install R_JMP2 (+VRAW → LM2596 VIN)

- [ ] R_JMP2 installed
- [ ] Plug in 24 VAC
- [ ] Measure at LM2596 output node (before R_JMP3, at the switching-node capacitor): expect **5.0 V ± 5 %** (4.75 – 5.25 V)
- [ ] LM2596 (U3) fingertip: warm is fine, hot to touch (>60 °C) = problem

**Pass criterion:** buck produces stable 5.0 V.
**STOP if:** output is 0 V (buck not switching — check D3 orientation, L1 solder joint), or output is ~30 V (buck feedback loop broken — passthrough would kill downstream), or LM2596 is hot in <10 s.

Unplug 24 VAC.

### Stage D — Install R_JMP3 (+5V rail distribution)

- [ ] R_JMP3 installed
- [ ] Plug in 24 VAC
- [ ] Measure at +5V rail (any decoupling cap on the 5V rail): **5.0 V ± 5 %**
- [ ] Measure at LDO U4 input pin: **5.0 V**
- [ ] Measure at LDO U4 output pin: **3.30 V ± 3 %** (3.20 – 3.40 V) — LDO now running, but 3V3 rail not yet distributed
- [ ] Current draw: still small (~10–30 mA — LDO quiescent + status LED if wired to 5V)

**Pass criterion:** +5V clean, LDO producing 3.30 V at its output pin.
**STOP if:** +5V droops when R_JMP3 goes in (short on 5V rail — remove R_JMP3, re-check with meter), or LDO output is 0 V (LDO dead, or shutdown pin misrouted).

Unplug 24 VAC.

### Stage E — Install R_JMP4 (+3V3 → WROOM)

- [ ] R_JMP4 installed
- [ ] Plug in 24 VAC — WROOM should now be powered
- [ ] Measure at +3V3 rail: **3.30 V ± 3 %**
- [ ] Current draw at 24 VAC input, at 24 VAC × current: **~150–250 mA during boot** (WiFi radio ramp), settling to **~80–150 mA idle** after ~5 s
- [ ] Status LED (WS2812B) should show boot sequence (usually blinking or solid color per firmware)

**Pass criterion:** WROOM boots without dropping the 3V3 rail. Idle current stable.
**STOP if:** 3V3 rail collapses on boot (LDO can't source WROOM inrush — check LDO stability caps), or current sits at max draw and doesn't settle (WROOM stuck in reset loop — check EN pull-up R1, BOOT strap).

**Board is now alive.** All rails up, WROOM running whatever firmware was last flashed (or blank).

---

## 6. Firmware flash + serial console

- [ ] USB-C cable plugged into J1 pigtail on one end, laptop on the other
- [ ] Laptop enumerates a serial device (typically `/dev/cu.usbmodem*` on macOS)
- [ ] Open serial monitor at **115200 baud**
- [ ] Press RESET (SW1). Boot banner appears.

**If nothing enumerates:**
- Confirm USB pigtail pinout: VBUS/GND/D+/D−/CC1/CC2 in J1 pin order
- Confirm CC pull-downs (R3, R4) present — without them, host doesn't provide VBUS
- Try holding BOOT (SW2) while pressing RESET (SW1) to force download mode

### 6.1 Flash bring-up firmware

From laptop:

```bash
cd firmware/main-controller
pio run -t upload   # uses default esp32-s3 env
```

Expected serial output on boot:

```
  Azul Main Controller CLI
Version: 0.2.5-<sha>
```

- [ ] Firmware version prints
- [ ] `help` command lists commands
- [ ] `status` command runs without crash

### 6.2 Zone init sanity check

At the CLI:

```
> zones
```

Expected: 12 zones listed as `idle`, all GPIOs shown as configured (should match `BoardPins.h`: 38, 14, 13, 12, 11, 10, 9, 8, 18, 17, 7, 6 for Zones 1–12).

- [ ] `zones` output lists 12 zones, all idle
- [ ] GPIO mapping matches Board Pins expected values

---

## 7. Zone GPIO logic-level test (no AC, no load)

Before installing J6 (zone terminal block), verify that firmware zone commands actually toggle the GPIO pins that drive the MOC3062M LED anodes.

**Test method:** with 24 VAC still connected (needed for triac to switch) but no J6 and no load, probe the MOC3062M LED anode pad (or the far side of the 120 Ω current-limit resistor, e.g. R7 for Zone 1) with a DMM in DC-V mode relative to GND.

- [ ] `stop-all` — all zones off — probe reads **0 V** on each LED anode
- [ ] `start 1 5` — Zone 1 fires — probe on Z1 anode reads **~3.0 V** (3V3 minus LED Vf ~0.3 V)
- [ ] Repeat for Zones 2–12 (one at a time or batch a few)
- [ ] `stop-all` — all back to 0 V

**Pass criterion:** every zone's GPIO drives the LED anode high on command, low on stop.
**STOP if:** wrong zone fires (GPIO mapping bug), or nothing fires (GPIO not driving — check WROOM strap or firmware zone config).

Unplug 24 VAC before proceeding to § 8.

---

## 8. Hand-install J6 (zone terminal block)

J6 is 7× ganged 2-pos 5 mm-pitch screw terminals soldered into a 14-position footprint (Zones 1–12 + 2× COM).

⚠️ **Orientation:** screw-terminal wire entry faces the **interior** of the board, back of the block faces the edge. Getting this backwards ships an un-wireable board (see [[terminal-block-orientation]] memory).

- [ ] Ganged terminals mated together, aligned to footprint
- [ ] Wire-entry openings face interior (toward the WROOM), not edge
- [ ] Soldered from bottom side, joints shiny, no bridges

---

## 9. Zone triac firing test (AC + load)

Now the full analog chain gets exercised.

**Setup:**
- 24 VAC still connected via barrel jack
- Test load: 24 VAC lamp or 200 Ω 10 W resistor across (Zone N, COM)
- Optional: scope probe on load for waveform capture

For each of Zones 1–12:

- [ ] Wire load between Zone N terminal and COM terminal
- [ ] CLI: `start <N> 5`
- [ ] Load energizes within <100 ms (lamp lights, resistor heats)
- [ ] Load de-energizes ≤5 s later when zone auto-stops
- [ ] No adjacent-zone bleed: touch adjacent Zone N±1 terminal — should read 0 VAC to COM
- [ ] Triac (Q_N) fingertip check: **warm is OK, hot in <5 s is not** — snubber R/C or gate resistor issue

**Repeat for all 12 zones.** Log each pass/fail in the per-board log.

**Pass criterion:** every zone switches on command, off on stop, no cross-talk.
**Common failures:**
- Zone N always on → triac shorted or MOC3062M output shorted
- Zone N never fires → gate resistor R8 open, MOC3062M pin 4 (MT) not connected, or wrong GPIO
- Adjacent zones fire together → common trace bridge or crosstalk

---

## 10. Sensor + status LED bench check

- [ ] **Rain sensor** (J3 pin RAIN): short to GND with a clip lead → `status` should show `rain: closed`; open → `rain: open`
- [ ] **Flow sensor** (J3 pin FLOW): tap to GND repeatedly → `status` should increment a pulse counter
- [ ] **Status LED** (WS2812B, D5 on-board): color cycles per firmware boot pattern; readable through enclosure cover once installed

---

## 11. Radio + integration

### 11.1 WiFi

At CLI:

```
> wifi-scan
> wifi-set <SSID> <password>
> wifi-status
```

- [ ] Scan lists your bench AP
- [ ] `wifi-status` reports **CONNECTED** within ~10 s of `wifi-set`
- [ ] IP address printed

### 11.2 MQTT

At CLI, point to laptop broker (or azul-server once § P6 of home-server-hosting-plan is complete):

```
> mqtt-set 192.168.1.153 1883
> reboot
```

After reboot:

- [ ] Serial log shows `[MQTT] Connected` within 5 s of WiFi join
- [ ] On broker side (`mosquitto_sub -t 'azul/#' -v`): heartbeat topic arrives for this board's MAC

### 11.3 Cloud round-trip

- [ ] Server device list (`curl http://localhost:3000/api/devices | jq`) shows this MAC as `online: true`
- [ ] Mobile app: adopt controller, see it come online, fire Zone 1 remotely, verify load energizes

---

## 12. Enclosure fit check (optional, first board only)

- [ ] Board drops into Polycase WC-25F on the 4 corner bosses without forcing
- [ ] M3 screws seat cleanly, no cracking
- [ ] Barrel jack cutout on short wall aligns with J2 pigtail
- [ ] Cable gland cutout aligns with J6 wire bundle exit

---

## 13. Sign-off

- [ ] All boxes above checked or noted as N/A with reason
- [ ] Per-board entry in `poc/rev2/dashboard.md` completed with actual voltages and current draws
- [ ] Board labeled with serial number + firmware version + date
- [ ] Board photographed top and bottom for the log
- [ ] Anomalies (if any) documented as sub-bullets in the per-board section

**Bring-up complete.** Board ready for deployment or shelf storage.

---

## Appendix A — STOP conditions summary

If **any** of these appear at any stage, stop immediately and diagnose before continuing:

| Symptom | Likely cause |
| :--- | :--- |
| Any part gets hot enough to smell in <10 s | Short, reversed polarity, wrong part value |
| Rail voltage is 0 V after installing the R_JMP that feeds it | Downstream short, or the R_JMP itself has a cold joint |
| Rail voltage is >20 % above target | Buck feedback loop broken, or LDO wrong part |
| WROOM draws 500+ mA continuous | Reset loop, or 3V3 rail can't hold up under boot inrush |
| Triac fires without command | Triac shorted, or GPIO leakage / strap wrong |
| Board smokes | Unplug 24 VAC immediately, wait 60 s, do not re-power |

---

## Appendix B — Firmware CLI cheatsheet (bring-up subset)

```
help                          List commands
status                        Overall device state
version                       FW version + git SHA
zones                         List all 12 zones with state
start <N> <sec>               Fire zone N for <sec> seconds
stop <N>                      Stop zone N
stop-all                      Stop everything
wifi-scan                     Show visible APs
wifi-set <ssid> <pass>        Save + connect WiFi
wifi-status                   IP, RSSI, state
mqtt-set <host> <port>        Save MQTT broker
mqtt-status                   Broker state
nvs-dump                      Dump saved config (masked passwords)
reboot                        Restart the ESP32
```

---

## Appendix C — Reference documents

- [Main Controller PCB v1 spec](../design/main-controller-pcb-v1.md) — hardware topology
- [parts.yaml](../../hardware/main-controller-v1/parts.yaml) — source of truth for LCSC parts + DNP list
- [Firmware architecture](../design/firmware-architecture.md) — what the CLI is doing under the hood
- [Deploy workflow](../design/deploy-workflow.md) — post-bring-up ops
- [Per-board log](../../poc/rev2/dashboard.md) — fill this out as you go
