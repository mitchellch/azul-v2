# A2-01 Wall-Wart Transient Capture

Bench-side reference for capturing the plug-in transient on +VRAW using the **Rigol DS1054Z** oscilloscope. Purpose: validate the hypothesis that the 24 VAC wall wart's plug-in overshoot exceeds the LM2596's 45 V absolute max, killing the chip on first power-up.

Test board: **A2-01** (LM2596 already dead — nothing to lose from repeated plug-in events, and the failure conditions are directly reproducible).

Companion memory: `project_a2_01_lm2596_failure.md`. Companion log: `poc/rev2/dashboard.md`.

---

## Equipment

- [ ] Rigol DS1054Z scope, powered on
- [ ] 1× 10× passive probe (comes with the scope)
- [ ] Phone with camera (USB writes are blocked by CrowdStrike DLP — using photos instead of scope-saved PNGs)
- [ ] Switched outlet strip (rocker switch), for repeatable plug-in events — recommended
- [ ] 24 VAC wall wart (the one that killed A2-01)
- [ ] Board A2-01 with barrel jack accessible and R_JMP2 pad 1 reachable
- [ ] Small paper label + pen (write "T01", "T02", … to hold in-frame per sample)

---

## Board prep

- [ ] Wall wart **unplugged from wall AND from board**
- [ ] R_JMP1 installed (or wire-jumped) — completes 24 VAC → bridge → C5 path
- [ ] R_JMP2, R_JMP3, R_JMP4 all **out** — isolates the (dead) LM2596 from the transient we're characterizing
- [ ] Nothing else connected to the board (no USB pigtail, no zone loads)

---

## Probe preparation (one-time)

Compensate the probe against the scope's built-in reference square wave:

1. Confirm probe body switch is set to **10×** (not 1×)
2. Plug probe BNC into **CH1** input
3. Clip probe tip to the front-panel **Probe Comp** post (below CH1); ground clip to the adjacent **GND** post
4. Press **AUTO** (top row). Scope displays the 1 kHz square wave
5. Adjust the trimmer screw on the probe body until corners are square — no overshoot, no rounding
6. Press **CH1** button → **Probe** softkey → select **10×**
   - This tells the scope to display real-world voltages, not the 1/10 attenuation at the BNC

---

## Channel setup (CH1)

Press **CH1** to open the channel menu. Softkeys on the right of the display:

| Softkey | Set to |
|:---|:---|
| **Coupling** | **DC** |
| **BW Limit** | **OFF** |
| **Probe** | **10×** |
| **Invert** | **OFF** |
| **Vernier** | OFF |
| **Unit** | Voltage |

**Vertical scale:** turn the outer `SCALE` knob under CH1 until display reads **10.0 V/div** (see indicator at bottom-left).

**Vertical position:** turn the inner `POSITION` knob to move the zero-line to ~1 division from the bottom. Steady-state 30 V will land near center, leaving 5 divisions of headroom for spikes.

---

## Horizontal (timebase) setup

Big **SCALE** knob in the HORIZONTAL cluster (center of front panel):

- [ ] Set to **10 ms/div** for initial capture (120 ms full-screen window, ~7 AC cycles at 60 Hz)

Horizontal **POSITION** knob: shift the trigger indicator (`T` marker at top of screen) to sit ~10 % from the left edge, leaving 90 % post-trigger.

---

## Memory depth + acquisition

Press **Acquire** (top-right button cluster):

| Softkey | Set to |
|:---|:---|
| **Acquisition** | **Normal** (never Averaging — kills single-shot transients) |
| **Mem Depth** | **12 M** (deepest UltraVision setting; keeps sample rate high at slow timebase) |
| **AntiAlias** | OFF |

At 10 ms/div with 12 Mpts, sample rate stays ~100 MSa/s → resolves any µs-scale transient cleanly.

---

## Trigger setup

Press **MENU** button in the TRIGGER cluster (right of front panel, below trigger LEVEL knob):

| Softkey | Set to |
|:---|:---|
| **Type** | **Edge** |
| **Source** | **CH1** |
| **Slope** | ⬆ Rising |
| **Coupling** | **DC** |
| **Noise Reject** | **ON** |
| **HF Reject** | OFF |
| **Holdoff** | (default, 16 ns is fine) |

**Trigger level:** turn the dedicated **LEVEL** knob (small knob in trigger cluster) until the top-right of the screen reads **+5.0 V**. The dashed trigger line on the right of the plot moves as you turn.

**Trigger mode:** press **MODE** button (upper right of trigger cluster) until the `Auto / Normal / Single` LED strip lights **Normal** (middle LED).

---

## Probe placement

Target net: **+VRAW**. Any pad on that net reads the same voltage during the transient. The physically-accessible option is **R_JMP2 pad 1** — the +VRAW-side pad of R_JMP2. Since R_JMP2 stays out for this test, R_JMP2 pad 1 is a bare copper pad, easy to grip with the probe hook.

Identify pad 1 vs pad 2 (silkscreen isn't always clear):

- [ ] DMM in continuity/beep mode
- [ ] One probe on C5(+) top
- [ ] Touch each R_JMP2 pad in turn — the one that **beeps (0 Ω)** is pad 1 (=+VRAW). The other (pad 2) reads open (floats — do NOT probe there)
- [ ] Optional: mark pad 1 with a Sharpie dot on the silkscreen

Then:

- [ ] Probe tip → **R_JMP2 pad 1** (verified via continuity to C5+)
- [ ] Ground clip → any solid GND on the board:
  - Mounting hole ring (bottom-left, exposed copper), OR
  - D3 anode terminal, OR
  - C5(−) cap lead
- [ ] Alligator clip, not the sprung tip — better ground return, less noise on fast edges

With no power applied, scope should show a flat trace at 0 V (or very close). If it drifts, press **CH1** twice quickly to auto-zero.

**Do NOT install R_JMP2 for this test.** A2-01's dead LM2596 (~9 Ω effective short from VIN to GND under power) would clamp +VRAW to near-ground on plug-in, masking the transient. Keep R_JMP2 out so C5 alone loads the rail and the overshoot rings out cleanly for the scope to catch.

---

## Single-shot capture procedure

1. Board bench-mounted, wall wart's DC output plug in the barrel jack, wall wart's AC plug **not yet in outlet** (or outlet strip switch OFF)
2. Verify scope shows flat 0 V on CH1
3. Press **SINGLE** (top-right button, next to RUN/STOP)
   - Top-of-screen status changes to `WAIT` / armed
   - RUN/STOP LED goes red
4. **Plug the wall wart into the outlet** (or flip the outlet strip switch)
5. Scope triggers, captures, freezes
   - Status changes to `STOP`; the transient is now held in memory
6. If it triggered on noise instead of the real event:
   - Press **CLEAR**
   - Press **SINGLE** to rearm
   - Unplug and replug (or cycle the outlet strip switch)

---

## Read the peak

**Quick way — auto-measure:**

1. Press **Measure** button
2. Softkey **Voltage** → **Vmax**
3. Reading appears at bottom of screen

**Precise way — manual cursors:**

1. Press **Cursor** button
2. **Mode** → **Manual**
3. **Type** → **Y** (voltage cursors)
4. Turn the multi-purpose knob (top-left, labeled `Intensity` when idle) to move **CurA** to the peak of the transient
5. Softkey to switch cursor selection to **CurB**, move to 0 V baseline
6. Read **BY-AY** at the bottom — peak voltage

---

## Multi-sample procedure

The transient magnitude depends on the AC line phase at plug-in — worst case is plug-in at line peak. Capture 10–20 samples:

1. Note the peak value on paper (see log grid below)
2. Press **CLEAR**
3. Press **SINGLE** to rearm
4. Cycle the outlet strip switch OFF, then ON
5. Repeat

Best practice: save the **worst-case** capture as an image (see next section).

---

## Saving captures — phone photo

USB mass-storage writes are blocked by CrowdStrike DLP on the workstation, so we're photographing the scope screen instead of writing PNGs to a USB stick. It's ugly but it captures what we need: the trace shape, the Vmax measurement box, and a paper label for sample ID.

**Per sample:**

1. Write the sample number on a scrap of paper: `T01`, `T02`, `T03`, …
2. Hold the label just below the scope screen (visible in frame, doesn't obscure the trace)
3. Photograph **square-on**, not at an angle:
   - Stand directly in front of the scope
   - Fill the frame with the display bezel-to-bezel
   - Keep the phone parallel to the scope face — avoids keystone distortion
4. Verify in the shot:
   - Trace is visible
   - `Vmax` value at the bottom is legible
   - `10.0V/div` scale indicator at bottom-left is legible
   - Paper sample label is readable

**Lighting tips:**

- The DS1054Z's TFT screen glares under overhead LEDs. If you see hotspots in the preview, tilt the phone slightly or shade the screen with a piece of cardboard
- Avoid using flash — it washes out the display and creates a hard reflection
- Higher-contrast phone modes (some cameras have a "documents" mode) help legibility

**Batch transfer to Mac:**

1. Collect all photos in a single session (do the whole 15-sample run before transferring)
2. Select all shots in the phone's Photos app
3. AirDrop to Mac → they land in `~/Downloads/`
4. Rename in bulk, using the naming convention below

**Filename convention:**

```
A2-01_T<sample>_<Vmax>V.jpg

Examples:
  A2-01_T01_38V.jpg
  A2-01_T02_45V.jpg
  A2-01_T03_51V.jpg
```

**Landing location:**

```
poc/rev2/board-A2-01-transient-capture/
├── A2-01_T01_38V.jpg
├── A2-01_T02_45V.jpg
└── ...
```

Reference the worst-case shot in `poc/rev2/dashboard.md` under A2-01 Anomalies with the filename and Vmax.

---

## Interpretation

| Vmax | Diagnosis |
|:---|:---|
| **32–35 V** | Plug-in event alone did NOT kill the chip. Theory partially wrong — look for cumulative stress, marginal silicon, or another mechanism. |
| **36–44 V** | Marginal — right at abs max but not clearly over. Plausible but not decisive. |
| **45–60 V** | ✅ **Theory validated.** TVS installation is fully justified. SMBJ33CA-13-F (53 V max clamp) is well matched. |
| **>60 V** | Theory validated AND SMBJ33CA's clamping voltage is marginal. Reconsider unidirectional SMBJ30A or lower Vrwm part for rev3. |

Log the worst-case Vmax and the count of samples in the field-log below.

---

## Field log

Fill in on paper as you go. Copy back to `dashboard.md` under A2-01 Anomalies afterward.

```
Date:  ____-__-__       Time: __:__       Ambient: __ °F

Wall wart AC no-load: ______ VAC (DMM)

Sample #    Vmax (V)     Notes
-----------------------------------
   1        _____        _____________________
   2        _____        _____________________
   3        _____        _____________________
   4        _____        _____________________
   5        _____        _____________________
   6        _____        _____________________
   7        _____        _____________________
   8        _____        _____________________
   9        _____        _____________________
  10        _____        _____________________
  11        _____        _____________________
  12        _____        _____________________
  13        _____        _____________________
  14        _____        _____________________
  15        _____        _____________________

Worst-case Vmax: ______ V     Photo filename: ____________

Interpretation:   [ ] 32–35 V     [ ] 36–44 V
                  [ ] 45–60 V ✅  [ ] >60 V

Verdict: __________________________________________________
```

---

## Safety

- DS1054Z front-panel input rating: `1 MΩ // 13 pF, 300 V RMS CAT I`. With a 10× probe (300 V CAT II), you have >600 V effective headroom over the ~40 V under test. Zero risk of scope input damage.
- Hands off bare board pads while wall wart is plugged into the outlet. The 24 VAC secondary (~34 V peak) can shock through a scratch or wet skin.
- Never touch the scope's ground clip to any un-isolated AC-mains reference. In this test, ground is the board's GND — the secondary side of the transformer — which is floating and safe.
- If the scope's trigger LED stops flashing but the trace is off-screen, adjust vertical scale or position — don't assume no signal.

---

## Notes for future revs

If Vmax comes in above 45 V:
- Confirms rev3 needs LM2596HV (57 V abs max) OR a proper SMB TVS footprint in place — see `project_rev3_design_notes.md`
- If Vmax > 60 V, upgrade to unidirectional SMBJ30A or add an SMBJ36CA in parallel

If Vmax stays below 40 V across 20 samples:
- The A2-01 chip may have been a clone-silicon defect rather than a transient event
- Consider deeper root-cause analysis before finalizing rev3 TVS placement

Either way, keep the raw PNG captures — they're the empirical basis for the rev3 buck-input design.

---

## 2026-08-29 session — A2-02 (10-sample sweep)

Deviation from the original plan: the actual capture was run on **A2-02**, not A2-01. Rationale: A2-02 was already on the bench from the earlier bench-PSU pre-check (probe wires soldered at R_JMP2.2 and D3 anode), so a new scope-side wire was added to R_JMP2.1 and the capture ran there. Since R_JMP2 was OUT, the buck was isolated from the transient — no stress on the (healthy) LM2596. Photos: `poc/rev2/board-A2-02-transient-capture/A2-02-T{01..10}*.jpg`.

```
Date:  2026-08-29       Time: 06:14–07:00       Ambient: room temp

Wall wart AC no-load: 28 VAC (per prior measurement, not re-verified this session)

Sample #    Vmax (V)     Notes
-----------------------------------
   1        37.6         cold start, base ~0 V
   2        37.6         base 245 mV (well discharged)
   3        37.6         —
   4        37.6         —
   5        37.6         —
   6        38.0         +0.4 V shift (wart thermal drift)
   7        38.0         base 2.19 V (not fully discharged between samples)
   8        38.0         —
   9        38.0         —
  10        37.6         back to baseline (wart cooled between samples)

Worst-case Vmax: 38.0 V     Photo filename: A2-02-T06-38.0V.jpg (through T09)

Interpretation:   [ ] 32–35 V     [x] 36–44 V (low end, 7 V below LM2596 abs max)
                  [ ] 45–60 V     [ ] >60 V

Verdict: Plug-in transient theory REFUTED. Peak is deterministic at 37.6–38.0 V,
         set by V_ac_peak − 2×V_diode ≈ 39.6 − 2 ≈ 37.6 V. Tight 0.4 V spread
         across 10 samples proves peak is physics, not phase-dependent stochastics.
         The observed rise is C5 charging over ~10 ms via discrete conduction
         bursts each AC half-cycle — no fast overshoot. A2-01's LM2596 failure
         cannot be explained by wall-wart voltage transient.

         Remaining hypotheses:
           1. Clone silicon defect (TWGMC LM2596 marginal from factory) — PRIMARY
           2. Handling/ESD damage unique to A2-01 during hand-install — SECONDARY
           3. Some other mechanism not yet characterized

         Decisive next test: install fresh TI LM2596S-5.0/NOPB in A2-01 when
         Digikey parts arrive (Wed 2026-09-02). If new chip survives normal AC
         bring-up, clone silicon is confirmed and rev2 design is vindicated.

Session notes:
  - A2-02 buck re-verified healthy after all 10 plug-in cycles: 5.031 V CV at
    12 V and 33 V input, chip cool at 21.1 °C, zero measurable current draw.
    No damage from the transient stress or the mid-session spark event
    (wire came off R_JMP2.1 during recording; user soldered with AC applied
    → brief spark from C5 discharge through iron tip; no consequential damage).
```
