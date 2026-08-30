# Rev2 Main Controller — Bring-Up Log

**Program:** Bring up 5× Azul main-controller Rev2 PCBs (batch A2) from JLC delivery to fully-functional cloud-connected devices.

**Procedure:** [`docs/hardware/rev2-bring-up.md`](../../docs/hardware/rev2-bring-up.md) — read alongside this log.

**Order:** JLCPCB SMT026080860985, shipped 2026-08-17 via UPS WW Express (tracking 1ZJ449G90412131815), qty 5.

---

## Status key

| Symbol | Meaning |
| :--- | :--- |
| ⚪ | Not started |
| 🔵 | In progress |
| ✅ | Passed |
| ⚠️ | Passed with anomaly (note in board section) |
| ❌ | Failed / on hold |

---

## Board summary

| Board | Serial | Inspection | Bench PSU | Rails | FW flash | Zones | Radio | Cloud | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | A2-01 | ✅ | ❌ | ❌ | ⚪ | ⚪ | ⚪ | ⚪ | LM2596 dead on first power-up. Rework 2026-09-02 when Digikey shipment arrives. |
| 2 | A2-02 | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | Bench PSU pre-check +5.031 V @ 12/33 V (RE-VERIFIED 2026-08-29 after 10 plug-in stress cycles + spark event). Awaiting AC bring-up. |
| 3 | A2-03 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | Not started |
| 4 | A2-04 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | Not started |
| 5 | A2-05 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | Not started |

---

## Batch-level notes

_Anything that applies to all boards — DFM anomalies, revised bring-up steps, tool changes, part substitutions. Add dated bullets._

- **2026-08-17:** Boards shipped from JLC.
- **2026-08-27 — A2-01 LM2596 failed on first power-up.** Stage C rail check produced 1.5 V DC at LM2596 pin 1 instead of the expected ~30 V. Bench-PSU isolation on R_JMP2.2's drain side (R_JMP2/R_JMP3 removed) confirmed a **dynamic short at ~9 Ω effective** when powered, vs. **16.66 MΩ static** — silicon-level transient damage, not a solder or design fault. See A2-01 Anomalies for full trail.
- **2026-08-27 — Root cause: 24 VAC wall-wart transients.** Transformer measured 28 VAC open-circuit (nominal for a 24 VA no-load unit); peak DC at C5(+) settles at ~32 V DC. Plug-in transients push +VRAW above LM2596's 45 V absolute max (per datasheet `docs/hardware/C5276750.pdf`, TWGMC clone). The chip's 2 kV HBM ESD rating is insufficient for line/wall-wart environment without external clamping.
- **2026-08-27 — New procedure: bench-PSU pre-check.** Before installing R_JMP2..4 and connecting 24 VAC, every board must pass the LM2596 isolation test at R_JMP2.2 per `board-A2-01-buck-diagnostic.md`. Validates the buck stage with a clean, current-limited DC source before subjecting it to transformer transients. **A2-02 passed** (5.000 V exactly at both 12 V and 34 V input, CV mode, chip cool) — proves the design is sound and A2-01's failure was a chip event.
- **2026-08-27 — Batch mitigation: install SMBJ33CA-13-F TVS across +VRAW → GND on all boards** before first AC power. Topside tack across C5+ to nearby GND. Prevents recurrence of A2-01's failure mode. Rev3 to include a proper TVS footprint. **(Softened 2026-08-29 — see next entry.)**
- **2026-08-27 — Rev3 design notes:** (1) move to LM2596HV variant (57 V abs max, +12 V transient headroom); (2) enlarge C7 to 100–220 µF SMD tantalum (currently 22 µF, undersized per datasheet Figure 2 which recommends 100–560 µF for 5V/3A); (3) add SMB TVS footprint on +VRAW. **(Recharacterized 2026-08-29 — see next entry.)**
- **2026-08-29 — Plug-in transient theory REFUTED by scope capture.** 10-sample Rigol DS1054Z sweep on A2-02 (+VRAW at R_JMP2.1, R_JMP2 out to isolate buck, 10 ms/div single-shot) returned Vmax = **37.6–38.0 V**, worst case **38.0 V**. Peak is deterministic (V_ac_peak − 2×V_diode ≈ 37.6 V), not stochastic. 0.4 V spread across 10 samples; overshoot above steady-state ~1 V (2–3 %). No fast transient; C5 charges over ~10 ms via bridge conduction bursts. **7 V of headroom to LM2596's 45 V abs max under all captured conditions.** Photos in `board-A2-02-transient-capture/A2-02-T{01..10}*.jpg`. Full field log in `board-A2-01-transient-capture.md` § "2026-08-29 session". Implications: (a) SMBJ33CA TVS is now prudent belt-and-suspenders, not mandatory (TVS barely conducts at 38 V, below its 36.7 V min breakdown); (b) rev3 LM2596HV upgrade is still worthwhile but no longer critical. A2-01's chip death remains unexplained; primary remaining hypothesis is clone silicon defect (TWGMC chip marginal from factory).
- **2026-08-29 — A2-02 buck re-verified healthy** after 10 plug-in stress cycles + one mid-session spark event (wire came off R_JMP2.1 during recording; user briefly soldered with AC applied, C5 dumped through iron tip). Bench PSU pre-check identical to 2026-08-27 baseline: 5.031 V CV at 12 V input, 5.031 V CV at 33 V input, chip cool at 21.1 °C, no measurable current draw. Design is proven robust against the transient stress that was originally suspected of killing A2-01.
- **2026-08-29 — Decisive experiment planned for 2026-09-02.** Digikey shipment (TI `LM2596S-5.0/NOPB` + Chip Quik REM4-5) arrives Wed 9/2. Rework A2-01: desolder dead U3, install fresh TI part, bench PSU pre-check, AC bring-up. If new chip survives → clone silicon defect confirmed as root cause; rev2 design fully vindicated. If new chip also dies → deeper investigation needed.

---

## Rail voltage reference

Target values from the procedure. Record actual measurements in each board section below. All voltages ±5 % unless noted.

| Rail | Target | Notes |
| :--- | :---: | :--- |
| J2 (24 VAC input) | 24.0 VAC | measured at screw terminals |
| +VRAW (after bridge) | ~30 V DC | 24 × √2 − 2 Vf, with ~2 V ripple |
| Buck output (before R_JMP3) | 5.00 V | LM2596 |
| +5V rail (after R_JMP3) | 5.00 V | |
| LDO output pin | 3.30 V | AP2112K-3.3 |
| +3V3 rail (after R_JMP4) | 3.30 V | feeds WROOM |
| MOC3062M LED anode, zone ON | ~3.0 V DC | 3V3 − LED Vf |
| MOC3062M LED anode, zone OFF | 0 V | |

---

## Board A2-01

**Date started:** ____-__-__  
**Date completed:** ____-__-__  
**Firmware version flashed:** __________  
**Photo (top / bottom):** _______________

### Inspection (§ 3)

- [ ] WROOM soldering clean
- [ ] Triac stage random spot-check zones: __, __, __, __ — all pass?
- [ ] D2 pin 1 orientation correct
- [ ] SMD electrolytics polarity correct
- [ ] Rail-to-GND continuity all ≥ 10 kΩ
- [ ] 24VAC HOT → NEUTRAL open

### Hand-install pre-power parts (§ 4)

- [ ] C5 installed, polarity confirmed
- [ ] D3 installed, cathode band aligned
- [ ] SW1, SW2 installed
- [ ] J1 installed
- [ ] Verified: R_JMP1..4 and J6 NOT installed yet

### Staged rails (§ 5)

| Stage | Rail | Target | Measured | Notes |
| :--- | :--- | :---: | :---: | :--- |
| A | J2 (24 VAC) | 24.0 V | ____ V | |
| A | F1 continuity | 0 Ω | ____ Ω | |
| B | +VRAW after R_JMP1 | ~30 V DC | ____ V | |
| C | Buck output after R_JMP2 | 5.00 V | ____ V | |
| D | +5V rail after R_JMP3 | 5.00 V | ____ V | |
| D | LDO output pin | 3.30 V | ____ V | |
| E | +3V3 rail after R_JMP4 | 3.30 V | ____ V | |
| E | Boot current @ 24 VAC | 150–250 mA | ____ mA | |
| E | Idle current @ 24 VAC | 80–150 mA | ____ mA | |

### Firmware flash + zone GPIO test (§ 6, § 7)

- [ ] USB enumerates
- [ ] Serial boot banner prints; version: __________
- [ ] `zones` lists 12 zones idle, GPIO map correct
- [ ] All 12 zones drive LED anode HIGH on `start`, LOW on `stop`

### Zone triac firing (§ 9)

| Zone | GPIO | Load fires? | Snubber cool? | Adjacent bleed? | Notes |
| :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | 38 | | | | |
| 2 | 14 | | | | |
| 3 | 13 | | | | |
| 4 | 12 | | | | |
| 5 | 11 | | | | |
| 6 | 10 | | | | |
| 7 | 9 | | | | |
| 8 | 8 | | | | |
| 9 | 18 | | | | |
| 10 | 17 | | | | |
| 11 | 7 | | | | |
| 12 | 6 | | | | |

### Sensors + LED (§ 10)

- [ ] Rain sensor short → status shows closed
- [ ] Flow pulse counted
- [ ] Status LED cycles on boot

### Radio + cloud (§ 11)

- [ ] WiFi connect, IP: __________
- [ ] MQTT connect to broker: __________
- [ ] Server API shows device online
- [ ] Mobile app zone start round-trip works

### Enclosure fit (§ 12, first board only)

- [ ] Fits WC-25F, mounting screws seat, cutouts align

### Anomalies

_Anything unusual: unexpected values, rework required, parts substituted, hesitations. Timestamp each entry._

- **2026-08-27 — Stage C AC bring-up failed:**
  - 24 VAC transformer measured 28 VAC open-circuit (Tekpower TP3003D-3 not used here; this was the wall wart)
  - Stage A: 24 VAC at J2 = OK
  - Stage B: +VRAW at C5(+) with R_JMP1 in = 32 V DC (in spec 28–34 V) ✅
  - Stage C: R_JMP2 installed, LM2596 pin 1 → GND = **1.5 V DC** (expected ~30 V) ❌
  - R_JMP3.2 → GND = 245 mV (expected 5.0 V) ❌
  - LM2596 body cold — chip not switching, stuck in UVLO
- **2026-08-27 — Diagnostic isolation with bench PSU:**
  - Test docs in `board-A2-01-buck-diagnostic.md`
  - Probe wires soldered to R_JMP2 pad 2 (drain) and D3 anode (GND)
  - R_JMP2 removed, R_JMP3 removed → isolated buck island (U3, C6, D3, L1, C7)
  - Tekpower PSU at 12 V DC, 100 mA current limit
  - Result: PSU pinned CC at 0.10 A, voltage clamped at 0.9 V → **~9 Ω effective load**, dynamic
  - Compare unpowered: pin 1 → GND = **16.66 MΩ** static
  - Silicon-level fault: 1.8-million-times resistance change powered vs. unpowered = damaged internal junction, not solder or passive component
- **2026-08-27 — Root cause (original hypothesis):** 24 VAC wall-wart plug-in transient exceeded LM2596's 45 V absolute max (TWGMC clone, `docs/hardware/C5276750.pdf`). 28 V no-load AC → 39.6 V peak → hypothesized plug-in overshoot could push above 45 V. **REFUTED 2026-08-29** — see next entry.
- **2026-08-29 — Transient theory refuted by 10-sample scope capture on A2-02.** Rigol DS1054Z + 10× probe on +VRAW (R_JMP2.1) with buck isolated (R_JMP2 out), 10 ms/div single-shot triggered at +5 V. All 10 samples returned Vmax between 37.6 V and 38.0 V — worst case **38.0 V, 7 V under abs max**. Peak is deterministic (physics, not phase timing). Overshoot above steady-state ~1 V (2–3 %). No fast transient — C5 charges over ~10 ms via bridge conduction bursts. Plug-in event alone cannot have killed A2-01's chip. Remaining hypothesis: clone silicon defect from TWGMC (primary), or unique per-board handling damage (secondary). Photos: `board-A2-02-transient-capture/A2-02-T{01..10}*.jpg`. Field log: `board-A2-01-transient-capture.md` § "2026-08-29 session".
- **2026-08-27 → 2026-08-29 — Rework plan (parts arriving Wed 9/2):**
  1. Desolder U3 with Chip Quik REM4-5 low-melt removal alloy
  2. Solder replacement `LM2596S-5.0/NOPB` (TI-original — better silicon than the TWGMC clone)
  3. Tack `SMBJ33CA-13-F` TVS across +VRAW → GND (topside near C5+) — now belt-and-suspenders rather than mandatory
  4. Retest bench PSU isolation, then normal Stage C
  5. **Decisive experiment:** if new TI chip survives normal AC bring-up → clone silicon defect confirmed as root cause; rev2 design fully vindicated. If it also dies → per-board investigation (visual inspection with magnification, or scrap A2-01).

### Sign-off

- [ ] All rails within spec
- [ ] All 12 zones verified
- [ ] Cloud round-trip verified
- [ ] Board labeled, photographed, logged
- [ ] Committed to git

---

## Board A2-02

**Date started:** 2026-08-27  
**Date completed:** ____-__-__  
**Firmware version flashed:** __________  
**Photo (top / bottom):** _______________

### Inspection (§ 3)

- [ ] WROOM soldering clean
- [ ] Triac stage random spot-check zones: __, __, __, __ — all pass?
- [ ] D2 pin 1 orientation correct
- [ ] SMD electrolytics polarity correct
- [ ] Rail-to-GND continuity all ≥ 10 kΩ
- [ ] 24VAC HOT → NEUTRAL open

### Bench PSU pre-check (§ 4.5 — before AC bring-up)

- [x] Probe wires soldered to R_JMP2.2 (drain) and D3 anode (GND)
- [x] R_JMP2 and R_JMP3 out
- [x] Tekpower PSU set to 12.0 V DC, 100 mA CC limit
- [x] **12 V input:** R_JMP3.2 = **+5.000 V** exactly, CV mode, chip cool
- [x] **34 V input (ramped):** R_JMP3.2 = **+5.000 V** exactly, still CV mode, chip cool
- [x] Verdict: LM2596 subsystem verified healthy. Cleared for TVS install + AC bring-up.

### Hand-install pre-power parts (§ 4)

- [ ] C5 installed, polarity confirmed
- [ ] D3 installed, cathode band aligned
- [ ] SW1, SW2 installed
- [ ] J1 installed
- [ ] **SMBJ33CA TVS tacked across +VRAW → GND** (batch mitigation post-A2-01 discovery)

### Staged rails (§ 5)

| Stage | Rail | Target | Measured | Notes |
| :--- | :--- | :---: | :---: | :--- |
| A | J2 (24 VAC) | 24.0 V | ____ V | |
| A | F1 continuity | 0 Ω | ____ Ω | |
| B | +VRAW after R_JMP1 | ~30 V DC | ____ V | |
| C | Buck output after R_JMP2 | 5.00 V | ____ V | |
| D | +5V rail after R_JMP3 | 5.00 V | ____ V | |
| D | LDO output pin | 3.30 V | ____ V | |
| E | +3V3 rail after R_JMP4 | 3.30 V | ____ V | |
| E | Boot current @ 24 VAC | 150–250 mA | ____ mA | |
| E | Idle current @ 24 VAC | 80–150 mA | ____ mA | |

### Firmware flash + zone GPIO test (§ 6, § 7)

- [ ] USB enumerates
- [ ] Serial boot banner prints; version: __________
- [ ] `zones` lists 12 zones idle, GPIO map correct
- [ ] All 12 zones drive LED anode HIGH on `start`, LOW on `stop`

### Zone triac firing (§ 9)

| Zone | Fires? | Snubber cool? | Bleed? | Notes |
| :---: | :---: | :---: | :---: | :--- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |

### Sensors + radio + cloud

- [ ] Sensors verified
- [ ] WiFi, IP: __________
- [ ] MQTT connected
- [ ] Cloud round-trip verified

### Anomalies

- **2026-08-29 — Loaned to transient-capture diagnostic** (originally planned on A2-01; used A2-02 for convenience because probe wires were already installed from the 2026-08-27 bench PSU pre-check). Board went through 10 plug-in stress cycles with buck isolated (R_JMP2 out, LM2596 unaffected). Mid-session: probe wire soldered to R_JMP2.1 came off while AC was applied; user re-soldered without disconnecting AC → brief spark as C5 dumped through the iron tip. Iron tip cosmetically pitted; no other observable damage. See `board-A2-01-transient-capture.md` § "2026-08-29 session" for the full field log.
- **2026-08-29 — Bench PSU pre-check RE-VERIFIED after the stress test:** 5.031 V CV at 12 V input, 5.031 V CV at 33 V input, LM2596 body 21.1 °C (ambient), no measurable current draw. Identical to the 2026-08-27 baseline. Board is fully cleared for TVS install + AC bring-up whenever that comes.

### Sign-off

- [ ] All checks pass, committed to git

---

## Board A2-03

**Date started:** ____-__-__  
**Date completed:** ____-__-__  
**Firmware version flashed:** __________

### Inspection + install (§ 3, § 4)

- [ ] Full inspection pass (see procedure § 3)
- [ ] C5, D3, SW1, SW2, J1 installed

### Staged rails (§ 5)

| Stage | Rail | Target | Measured |
| :--- | :--- | :---: | :---: |
| A | J2 | 24.0 V | ____ V |
| B | +VRAW | ~30 V DC | ____ V |
| C | Buck out | 5.00 V | ____ V |
| D | +5V | 5.00 V | ____ V |
| D | LDO out | 3.30 V | ____ V |
| E | +3V3 | 3.30 V | ____ V |
| E | Boot I | 150–250 mA | ____ mA |
| E | Idle I | 80–150 mA | ____ mA |

### Firmware + zones + cloud

- [ ] FW flashed, version: __________
- [ ] 12/12 zones pass triac firing test
- [ ] Sensors, WiFi, MQTT, cloud all pass

### Anomalies

- 

### Sign-off

- [ ] All checks pass, committed to git

---

## Board A2-04

**Date started:** ____-__-__  
**Date completed:** ____-__-__  
**Firmware version flashed:** __________

### Inspection + install (§ 3, § 4)

- [ ] Full inspection pass
- [ ] C5, D3, SW1, SW2, J1 installed

### Staged rails (§ 5)

| Stage | Rail | Target | Measured |
| :--- | :--- | :---: | :---: |
| A | J2 | 24.0 V | ____ V |
| B | +VRAW | ~30 V DC | ____ V |
| C | Buck out | 5.00 V | ____ V |
| D | +5V | 5.00 V | ____ V |
| D | LDO out | 3.30 V | ____ V |
| E | +3V3 | 3.30 V | ____ V |
| E | Boot I | 150–250 mA | ____ mA |
| E | Idle I | 80–150 mA | ____ mA |

### Firmware + zones + cloud

- [ ] FW flashed, version: __________
- [ ] 12/12 zones pass triac firing test
- [ ] Sensors, WiFi, MQTT, cloud all pass

### Anomalies

- 

### Sign-off

- [ ] All checks pass, committed to git

---

## Board A2-05

**Date started:** ____-__-__  
**Date completed:** ____-__-__  
**Firmware version flashed:** __________

### Inspection + install (§ 3, § 4)

- [ ] Full inspection pass
- [ ] C5, D3, SW1, SW2, J1 installed

### Staged rails (§ 5)

| Stage | Rail | Target | Measured |
| :--- | :--- | :---: | :---: |
| A | J2 | 24.0 V | ____ V |
| B | +VRAW | ~30 V DC | ____ V |
| C | Buck out | 5.00 V | ____ V |
| D | +5V | 5.00 V | ____ V |
| D | LDO out | 3.30 V | ____ V |
| E | +3V3 | 3.30 V | ____ V |
| E | Boot I | 150–250 mA | ____ mA |
| E | Idle I | 80–150 mA | ____ mA |

### Firmware + zones + cloud

- [ ] FW flashed, version: __________
- [ ] 12/12 zones pass triac firing test
- [ ] Sensors, WiFi, MQTT, cloud all pass

### Anomalies

- 

### Sign-off

- [ ] All checks pass, committed to git

---

## Batch retrospective

_Fill in after all 5 boards are done. What varied between boards? What should change in rev3? Any parts that arrived out-of-spec? Any procedure step that was too vague or missing?_

- 
