**Subject:** main-controller-v1 — U1 WROOM alignment: request for 2D top-down pad view

Hi Swee,

Thanks for clarifying the $82.09 First Board Confirmation service. Before I decide whether to add it, I need to resolve one thing that has been bothering me across several of your 3D preview images.

**In every 3D preview you have sent, the WROOM-1's castellations appear offset from the PCB pads by roughly half a pitch (~0.635 mm), such that each castellation would straddle two adjacent pads.** This has never been addressed in our correspondence, and I want to close the loop on it before assembly.

I have re-verified my end and the placement data is correct:

- Footprint: `PCM_Espressif:ESP32-S3-WROOM-1` (Espressif's official PCM library)
- Pad pitch: 1.27 mm on all three sides — matches Espressif datasheet Fig 5.1 exactly
- U1 CPL: `U1, 107.750, -43.540, 0, top`
- Nearest pad-to-board-edge clearance: 1.087 mm at pins 1 and 40 (well above any DFM minimum)

**Could you send me a 2D top-down screenshot of just the F.Cu layer around U1** — pads only, no 3D module overlay? A plain flat view of what your placement engine plans to target. That single image resolves the question:

- If the 2D pads sit on a clean 1.27 mm pitch centered on (107.750, 43.540) → the 3D preview is a display artifact, we're safe to proceed, and I'll decline the First Board Confirmation service.
- If the 2D pads are shifted, spaced wrong, or otherwise not on the expected grid → the problem is real and we need to correct it in the fab data before any boards are assembled.

I'd rather not run 5 boards through SMT and then discover a systemic pad shift in Photo Confirmation. A flat pad-layer screenshot is a two-minute ask that removes the ambiguity entirely.

Please continue holding the order at DFM until this is resolved.

Thanks,
Mitch
