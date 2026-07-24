Hi,

I have three questions about order [YOUR ORDER #] that need to be answered BEFORE you begin SMT assembly. Please pause the order at the current stage (component matching / preparation) until I confirm.

1. WROOM-1 castellation-to-pad alignment — BLOCKING QUESTION

In your Component Placements 3D preview, the ESP32-S3-WROOM-1 (U1, LCSC C2913204) shows castellations on the LEFT and RIGHT edges of the module offset by approximately 0.635mm (about half-pitch) from my PCB pads. The BOTTOM edge castellations appear aligned correctly. Attached screenshot shows the issue.

I've verified my footprint against the official Espressif KiCad library (PCM_Espressif:ESP32-S3-WROOM-1) — pads are at 1.27mm pitch, 14 per long edge, 39 total, matching the datasheet mechanical drawing. Same footprint is shipping on Adafruit Feather ESP32-S3, SparkFun Thing Plus S3, and other production boards.

Before you place U1, please:
- Confirm the CPL rotation you will apply to C2913204 in assembly
- Verify the physical module castellations will land on my pads correctly
- Send me a photo of a WROOM-1 test-placed on ONE of my bare PCBs (before solder paste and reflow) so I can visually verify castellation-to-pad alignment

Do NOT reflow any boards until I approve this photo. If the alignment is wrong, I need to submit revised gerbers before you commit to assembly. This is a first-run prototype and this is the highest-consequence part on the board — a footprint error here destroys all 5 boards.

2. Photo confirmation — must be pre-reflow

Please include the following in the photo confirmation for this order, taken AFTER pick-and-place placement but BEFORE reflow so I can approve or reject before boards are committed:
- Close-up of U1 (ESP32-S3-WROOM-1) area showing all 39 castellations sitting on pads
- Close-up of D2 (DB107S bridge rectifier) showing pin-1 orientation matches the silkscreen "+" marker
- Close-up of any one G3MB-202P relay (K1-K12) showing pin-1 orientation

I understand JLC's standard photo confirmation step; please make sure these three shots are explicitly included and that the order pauses for my approval before reflow.

3. WROOM-1 moisture baking

Please confirm in writing that the WROOM-1 module (U1, C2913204) will be baked to remove moisture before reflow, per its MSL rating. I selected the baking option at checkout and would like a support-side confirmation that it was actually performed.

Please hold the order at its current stage until I have your written confirmation on items 1, 2, and 3. I do not want any board to reach reflow until these are resolved.

Thanks,
Mitch
