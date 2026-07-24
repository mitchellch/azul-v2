**Subject:** URGENT — main-controller-v1 D2 (C5377) pinout mismatch, halt before assembly

Hi Swee,

Please do not proceed with assembly. I've found a **hard blocker** on D2 and need your help resolving it before I can Confirm Parts Placement.

**The problem**

D2 in my design is a DB107S bridge rectifier. JLC's assigned part is **C5377** (MDD/Microdiode DB107S, DBS package). I verified the MDD datasheet directly (Rev 2024A4, page 1 mechanical drawing) and it shows:

```
Top view (MDD DB107S):
  Pin 2 (−) ─────────────── Pin 1 (+)
      │                           │
  Pin 3 (~) ─────────────── Pin 4 (~)
```

**On the MDD DB107S, the two AC input pins (~) are on the same edge — pins 3 and 4 are BOTH AC**, and the DC pins (+/−) are on the opposite edge.

My PCB footprint uses the **Diotec DB107S convention**, where AC pins are on the diagonal — pin 1 and pin 3 are AC, pin 2 is DC−, and pin 4 is DC+. This is a different manufacturer convention with the same "DB107S" part number, which is a well-known industry gotcha for this package family.

I also checked LCSC C400503 (Yangjie DB107S) as a possible substitute and its datasheet shows the **same adjacent-AC pinout as MDD** — so it is NOT a drop-in swap either. It appears the adjacent-AC layout is the majority convention among Chinese manufacturers of this part.

**Consequence if assembled as-is**

The MDD part's physical pin 1 (internal DC+ node) would land on my PCB pad 1, which is wired to **24VAC_HOT**. On power-up, 24VAC line voltage would drive the bridge's DC+ node directly, and the +VRAW electrolytic (C5) would see reverse polarity every half-cycle. **The cap will fail — likely vent or short — and the downstream buck regulator will not receive rectified DC.** The board will not function and could be damaged on first power-up.

**What I need from you**

I see three paths, in order of preference:

1. **Substitute a Diotec-pinout DB107S from LCSC inventory.** I need a DB107S (or pin-compatible equivalent) where the AC inputs are on pins 1 and 3 (diagonal) and DC pins are on 2 (DC−) and 4 (DC+). Same DBS / SO-DIL-Slim SMD package, 1000 V / 1 A, zero-cross not required. If your engineering team can identify an LCSC part number matching the Diotec pin convention, I'll approve the substitution via Replace Parts. Note: neither MDD (C5377) nor Yangjie (C400503) match, so this substitute needs to come from a different manufacturer — possibly Diotec itself, ON Semi, Vishay, or similar Western vendors if any are in LCSC stock.

2. **Hand-rework D2 on all 5 boards.** If no Diotec-pinout drop-in exists in LCSC stock, please leave D2 unpopulated (DNP on all 5 boards) so I can hand-assemble a discrete bridge from 4 diodes off-board. Please advise on cost / schedule impact of adding D2 to the DNP list.

3. **Halt the order for a fab respin.** Last resort — I'd correct the D2 footprint in KiCad and resubmit gerbers. I'd like to avoid this if either option 1 or 2 is workable.

Please **do not push the order into production** until we've agreed on one of the above. This should be resolved in the same conversation as the SSR substitution (C401984 → C22462868) and the DNP-on-1-board question that's still with Zack / engineering.

Reference:
- MDD DB101S–DB107S datasheet, Rev 2024A4, page 1 (mechanical drawing, DBS package, pin numbers (1)(2)(3)(4) with "+", "−", "~", "~" labels showing AC pins adjacent)
- Yangjie DB101S–DB107S datasheet, Rev 2.1 (2014-04-28), page 3 (same adjacent-AC layout)
- LCSC part: https://www.lcsc.com/product-detail/C5377.html

Thanks for catching this in time — the DFM 2D view is what tipped me off (I could see both "~" symbols on the same edge in your viewer, which contradicted my datasheet assumption for the footprint I used in KiCad).

Mitch
