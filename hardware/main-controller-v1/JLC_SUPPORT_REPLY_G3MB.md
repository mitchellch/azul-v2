Hi Swee Song,

Thanks for looking into the G3MB-202P question. I have a solution that resolves the issue cleanly.

Please make two changes to this order:

**1. Substitute the SSR part on 4 boards.**

Replace LCSC part **C401984** (Omron G3MB-202P) with **C22462868** (Keysolu KS4/24-24Z2-M) at all 12 relay positions (K1–K12) on **4 of the 5 boards**. I have verified that C22462868 is in JLC's Extended library, currently shows 48 pcs in stock (exactly what 4 boards require), and is pin-for-pin compatible with our current footprint:

- SIP-4 through-hole
- Pin pitch: 7.62 / 10.16 / 2.54 mm (same as G3MB-202P)
- 4 × Ø1.0 mm holes
- Pin 1-2 = LOAD, Pin 3+/4- = COIL (matches our schematic net assignment)
- 24 VDC coil input, 2 A / 48-280 VAC zero-cross triac output

**2. Leave the 5th board unpopulated at K1–K12 only.**

C22462868 currently shows only **48 pieces in stock** on LCSC, which is exactly enough for 4 boards (4 × 12 = 48) but leaves the 5th board short by 12. Rather than delay the order or switch to a different substitute, would it make sense to **DNP (Do Not Place)** all 12 SSR positions on 1 of the 5 boards:

- K1
- K2
- K3
- K4
- K5
- K6
- K7
- K8
- K9
- K10
- K11
- K12

Leave the K1–K12 through-holes on that board bare — no part inserted, no solder in the holes (skip the wave/selective solder step for those positions). All other components on that 5th board should be assembled normally. I will populate and hand-solder the 12 relays on that board myself after the order ships.

Before we commit to the DNP approach, a few questions on stock:

- What would it take to bring C22462868 stock up to at least **60 pieces** (enough for all 5 boards with a small margin)? Is there a restock ETA from the manufacturer, or a minimum reorder quantity JLC would need to place?
- Can JLC source additional units from another channel (a sister distributor, Keysolu direct, or a factory pull) to top up the shortfall of 12 pieces?
- Alternatively, is there a different Extended-library SSR that is a verified pin-for-pin equivalent to Keysolu KS4/24-24Z2-M — SIP-4 through-hole, 7.62 / 10.16 / 2.54 mm pin pitch, 24 VDC coil on pins 3(+)/4(−), AC load on pins 1/2, zero-cross triac output, 2 A / 250 VAC? If so, please send the LCSC part number and datasheet so I can verify the footprint match.

A short delay (a few days to a week) to get all 5 boards fully populated by JLC is acceptable. I'd prefer that over the DNP workaround if any of the above are feasible.

Please confirm:

1. **Stock check on C22462868** — restock ETA / MOQ, ability to source the missing 12 pieces from another channel, or a verified pin-for-pin equivalent from the Extended library. If any of these get us to 60+ pieces within about a week, I'd prefer to fully populate all 5 boards over the DNP workaround.
2. The C401984 → C22462868 substitution for the 4 boards (or all 5, pending #1).
3. **If we go the DNP route on the 5th board**, K1–K12 through-holes stay bare (no relays inserted, no wave/selective solder in those holes).
4. **WROOM-1 (U1, C2913204) MSL baking** will be performed before reflow (still outstanding from my earlier message — I selected the baking option at checkout).
5. Pre-reflow photo confirmation will include close-ups of **U1** (all 39 WROOM castellations sitting on pads) and **D2** (DB107S pin-1 vs. silkscreen "+" marker).

Please continue holding the order at DFM until items 1–5 are confirmed.

Thanks,
Mitch
