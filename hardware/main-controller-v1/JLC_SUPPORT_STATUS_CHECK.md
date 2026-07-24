**Subject:** main-controller-v1 — status check on pending items (order held at DFM)

Hi Swee,

Following up on my messages from last week. It's been a week without a reply and I want to make sure nothing is stuck on my end. Could you send a status update on the following?

**1. SSR substitution (C401984 → C22462868, or equivalent)**
- Any update on stock for **C22462868** (Keysolu KS4/24-24Z2-M)? Restock ETA, MOQ, or ability to top up the 12-piece shortfall from another channel?
- Alternatively, has JLC identified a pin-for-pin equivalent from the Extended library — SIP-4 through-hole, 7.62/10.16/2.54 mm pitch, 24 VDC coil on pins 3(+)/4(−), AC load on pins 1/2, zero-cross triac, 2 A / 250 VAC?
- If neither is possible within a reasonable window, please proceed with the **DNP arrangement on the 5th board** (K1–K12 through-holes left bare, no wave/selective solder in those positions) so we can move forward.

**2. WROOM-1 (U1, C2913204) MSL baking**
- Please confirm baking will be performed before reflow. I selected the baking option at checkout — just want it confirmed in writing on the ticket before assembly starts.

**3. D2 (DB107S bridge rectifier) — clarification on 3D preview vs. Gerber**
- Your 3D preview image shows the two AC pin markings on the left side of the package. I've verified against the DB107S datasheet and the KiCad footprint: **AC pins are diagonal — pin 1 (upper-left) and pin 3 (lower-right)**, DC pins on pin 2 (lower-left, −) and pin 4 (upper-right, +). This is standard for the DB107S / SO-DIL-Slim package. The Gerber pad-to-net mapping and the CPL rotation are the ground truth; the 3D-preview surface markings appear to be a rendering artifact.
- Please confirm assembly will follow the **pin numbers from the Gerber and CPL files**, not the surface markings on the 3D preview model. Specifically, Pin 1 lands on the pad at the upper-left of the footprint origin.

**4. U1 (ESP32-S3-WROOM-1, C2913204) — castellation-to-pad alignment**

Your 3D preview images have consistently shown the WROOM's castellations offset from the PCB pads by approximately half a pitch, appearing to short adjacent pads on the side edges. I want to resolve this definitively before assembly rather than rely on my read of the 3D preview.

**From my side, the placement data is:**
- Footprint library: `PCM_Espressif:ESP32-S3-WROOM-1` (Espressif official PCM library, not a homegrown footprint)
- Pad geometry: 40 castellated SMD pads at **1.27 mm pitch** on all three sides, per Espressif datasheet Figure 5.1
- Pad size: 1.5 × 0.9 mm rectangular
- **U1 CPL row (from `main-controller-v1_positions.csv`):**
  ```
  Designator,Mid X,Mid Y,Rotation,Layer
  U1,107.750000,-43.540000,0,top
  ```
- Three fiducials are present on the board for pick-and-place registration.

**Can you confirm the following on your side:**

a. Does JLC's system read U1's CPL centroid as **(107.750, −43.540)** and rotation **0°**? (If your parser is reading a different value, that would explain the offset.)

b. Is the offset I'm seeing in the 3D preview a **3D model rendering artifact** in your DFM viewer, or does your placement engine actually plan to place U1 at a different centroid than what the CPL specifies?

c. **Most importantly**: can you send a **flat, top-down photograph of the first assembled board** (before or immediately after reflow, U1 populated, no lid) so I can visually verify that the physical WROOM castellations sit centered on the PCB pads? A photo of the actual placement is the only thing that resolves render-artifact-vs-real-shift definitively. Please do not proceed to assembling the remaining 4 boards until I approve that photo.

**5. Pre-reflow photo confirmation (all critical parts)**
Please include close-ups of:
- **U1**: top-down view of all 39 castellations on their pads (see item 4).
- **D2**: pin-1 orientation confirmed against CPL rotation, not the 3D-preview surface art (see item 3).
- **K1–K12**: relay orientation, pad-1 marker alignment.

**6. Overall schedule**
- What's the current estimate for photo confirmation and ship date? My earlier tracking indicated DHL Express delivery **2026-07-22 to 2026-07-24** — is that still on track, or has the DFM hold pushed it out?

Please continue holding the order at DFM until items 1–5 are resolved. Happy to jump on a quick call if that's faster than email.

Thanks,
Mitch
