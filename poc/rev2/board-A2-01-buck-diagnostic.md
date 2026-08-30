# A2-01 Buck Isolation Test

Bench-side reference for isolating the LM2596 on board A2-01. Board history: Stage C failed with LM2596 pin 1 at 1.5 V DC while C5(+) held 32 V with R_JMP2 out. Chip cold, 16.66 MΩ pin 1 → GND unpowered. Suspected cause: resistive joint upstream of chip, NOT a shorted LM2596. This test proves or disproves the chip in isolation.

---

## Pre-test bench state

- [ ] 24 VAC transformer **disconnected** from barrel jack
- [ ] R_JMP2 **removed** (or wire-jumper disconnected)
- [ ] R_JMP3 **removed**
- [ ] Probe wire soldered to R_JMP2 pad 2 (drain, LM2596 VIN side), strain-relieved
- [ ] GND reference: D3 anode (bottom lead) — confirmed 0 Ω to LM2596 pin 3

---

## Tekpower TP3003D-3 setup — current limit 100 mA, voltage 12 V

1. Both knobs fully counter-clockwise (V=0, I=0).
2. PSU **on**.
3. Clip + and − alligator leads **together** (short the output).
4. Slowly turn **voltage knob CW** until CC indicator lights (voltage will stay near 0).
5. Turn **current knob** to set display to **0.10 A**.
6. **Un-clip** the short.
7. Turn **voltage knob** to display **12.0 V**. Display should read `12.0 V, 0.00 A, CV lit`.
8. PSU **off**.

Do NOT exceed 30 V — LM2596 abs max Vin = 40 V.

---

## Test procedure

1. PSU red clip → R_JMP2 drain wire
2. PSU black clip → D3 anode (GND)
3. PSU **on**. **Read the display within 5 seconds.**

---

## Interpretation

| PSU display | C7(+) reads | Diagnosis | Action |
|:---|:---|:---|:---|
| **12.0 V, 5–15 mA, CV lit** | **~5.0 V DC** | Chip **HEALTHY** | Ramp to 24 V, then 30 V. Chip stays cool, C7 stays at 5 V → chip fully exonerated. Fault is upstream of R_JMP2. |
| 12.0 V, 5–15 mA, CV lit | **0 V** | Chip alive but not switching | Check L1 continuity, verify /ON tied to GND. Rare. |
| **3–8 V, 100 mA, CC lit** | 0 V | Soft short — **chip dead** | Rework: replace LM2596, add TVS across +VRAW. |
| **0–2 V, 100 mA, CC lit** | 0 V | Hard short — **chip dead** | Rework. |
| 12.0 V, 0.00 A, CV lit | 0 V | No current flowing | Check wire connections and PSU clips. |

---

## If HEALTHY

Ramp PSU voltage in steps: 12 V → 24 V → 30 V.

At each step, verify:
- Current stays 5–15 mA (CV lit)
- C7(+) → GND = ~5.0 V DC
- LM2596 body cool

If all three hold at 30 V, chip is proven at rated operating voltage.

**Then hunt the fault upstream:**
1. Reinstall R_JMP2 (or reconnect wire).
2. Feed 24 VAC to barrel jack.
3. Walk voltage from source to chip while powered:
   - C5(+) → GND
   - R_JMP2 supply pad → GND
   - R_JMP2 drain pad → GND
   - LM2596 pin 1 → GND
4. Whichever adjacent pair drops the big voltage step is the bad joint. Unplug 24 VAC, reflow that joint, retest.

---

## If FAULT confirmed

Log details in `poc/rev2/dashboard.md` under A2-01 Anomalies:
- CC-mode voltage clamp value
- CC-mode current draw
- LM2596 temp during test

Rework plan (parts on order):
- Desolder U3 with Chip Quik REM4-5 low-melt alloy
- Solder replacement LM2596S-5.0/NOPB
- Add SMBJ33CA-13-F TVS across +VRAW → GND (topside tack, near C5)
- Retest Stage C from `docs/hardware/rev2-bring-up.md` § 5

---

## Safety

- Never leave a shorted PSU powered for long (though CC mode protects it)
- If ANY part gets hot smell during test, kill PSU immediately
- Keep 24 VAC transformer unplugged during any PSU-based work
- Confirm PSU is truly OFF before touching probes to different pads

---

## Companion nets in the island (electrical map)

With R_JMP2 and R_JMP3 open, the isolated buck island contains:

- **Net-(U3-VIN):** R_JMP2.2 ── C6.1 ── U3.1
- **Net-(D3-K) (switch node):** U3.2 ── D3.1 (cathode) ── L1.1
- **Net-(U3-FB) (buck output):** U3.4 ── C7.1 ── L1.2 ── R_JMP3.2 [OPEN]
- **GND:** C6.2, D3.2 (anode), C7.2, U3.3 (thermal pad), U3.5 (/ON tied low)

Any point on the same net reads the same voltage — probe wherever's easiest to reach.
