**Subject:** Order SMT026071261321 — cancellation and refund request

Hi John,

Thanks for your reply this morning. After looking at the full picture, I need to cancel this order and refund it rather than push through the current issues.

**Reason for cancellation**

Two independent problems have surfaced during DFM that together mean the order cannot be fulfilled as designed:

1. **SSR stock shortfall on C22462868 (Keysolu KS4/24-24Z2-M).** LCSC shows 48 pcs in stock; the order requires 60 (5 boards × 12 relays). The Replace Parts UI does not allow me to reduce quantity or configure DNP on a per-board basis, and the earlier proposal to leave K1–K12 unpopulated on one board would give me only 4 fully functional boards out of 5 — not enough margin for prototype bring-up and spares.

2. **D2 pinout mismatch on C5377 (MDD DB107S).** As detailed in my earlier message, the MDD DB107S uses the adjacent-AC pinout convention, which is incompatible with my PCB footprint (diagonal-AC). I have since confirmed that Yangjie (C400503) uses the same adjacent-AC layout, and no LCSC-stocked SMD DB107S from any manufacturer uses the diagonal-AC pinout my footprint requires. Substitution is not possible without a footprint change on my side.

Both issues require design revisions on my end. Rather than salvage this order with partial assembly and hand-rework, I'd prefer to correct the design and resubmit as a clean rev2.

**Request**

Please:

1. **Cancel order SMT026071261321** at the DFM stage, before any assembly begins.
2. **Refund the full amount** to my original payment method, minus any non-refundable setup fees that apply at this stage. Please itemize any deductions so I know what I'm agreeing to.
3. **Confirm the timeline** for the refund to appear on my card.

I want to be clear that I'm not asking for a courtesy refund — the SSR shortfall and D2 pinout issue together mean the order cannot ship as ordered, and cancellation before production is the cleanest resolution for both of us.

Once the design revisions are complete on my side (a few weeks), I'll submit a new order with the corrected gerbers and BOM. I appreciate the careful attention Swee, Zack, and you have given to this ticket — the issues we've surfaced together are exactly the kind of catch that DFM is meant to provide.

Please confirm receipt and expected timeline for the cancellation and refund.

Thanks,
Mitch
