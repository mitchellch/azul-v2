# JLC PCBA lookup tracker — rev2 DNP parts

Goal: determine for each currently-DNP part whether JLC can assemble it, OR whether we hand-solder from stock on hand.

## Decision — Path A (2026-08-05)

**Parts on hand from Digikey PO 100338361 (2026-07-12) → keep DNP, hand-solder.** No reason to pay JLC to source or assemble parts already in the drawer.

Physical stock:
- J1 B6B-PH-K-S — 10 pcs (need 5 for 5 boards)
- SW1, SW2 B3F-1000 tact — 10 pcs (need 10)
- D3 1N5822 — 10 pcs (need 5)
- J6 ED2609-ND 2P ganged — 100 pcs (need 35 = 7×5)
- C5 EEU-FR1H471 470µF 50V — 10 pcs (need 5)
- J2, J3, J4 screw terminals — **not on hand** (need 15 = 3×5)

## Parts status

| # | Ref(s) | Part on hand | Fate | LCSC (if JLC) | Notes |
|---|---|---|---|---|---|
| 1 | J1 | JST B6B-PH-K-S | **dnp** (hand-solder) | — | Stock: 10 pcs. Skip JLC. |
| 2 | J2, J3, J4 | NONE | **smt (JLC)** | C5188434 | Decided 2026-08-05 — let JLC assemble. $0.065 × 15 = ~$1 parts + Extended setup. |
| 3 | J6 | ED2609-ND 2P ganged 7× | **dnp** (hand-solder) | — | Stock: 100 pcs. Use ganged 7× per board. Skip JLC. |
| 4 | SW1, SW2 | Aratas B3F-1000 6mm | **dnp** (hand-solder) | — | Stock: 10 pcs. Skip JLC. |
| 5 | C5 | Panasonic EEU-FR1H471 | **dnp** (hand-solder) | — | Stock: 10 pcs. Skip JLC. |
| 6 | D3 | Diotec 1N5822 | **dnp** (hand-solder) | — | Stock: 10 pcs. Skip JLC. |

## Rev2 SMT additions — JLC assembles

| # | Ref(s) | Part | LCSC | Type | Notes |
|---|---|---|---|---|---|
| 7 | U5-U16 | MOC3062M DIP-6 | C8919 | Extended | 864 stock, THT — verify JLC accepts THT for this part |
| 8 | Q1-Q12 | BT137-600E TO-220 | C967624 | Extended | 418 stock, THT — same as above |
| 9 | C_X1-X12 | SRD MP2103K27C2R6LC X2 cap | C105755 | Extended | THT — same as above |

Note: MOC3062M, BT137, and X2 cap are all **through-hole**. JLC's Standard PCBA does support THT assembly (see J6 Phoenix Contact page: "Assembly Type: Wave Soldering, PCBA Type: Economic and Standard"). Need to verify per-part when uploading the fab package.

## Next steps

1. Update parts.yaml:
   - Rev2 SMT additions: MOC3062M (C8919), BT137-600E (C967624), X2 cap (C105755), 120Ω (C17437), 470Ω (C17710), 39Ω (C2692665) — all `fate: smt`
   - J2/J3/J4: change `fate: dnp` → `fate: smt` with `lcsc: C5188434`
   - Other DNP entries: keep as `dnp`, add on-hand Digikey P/N to `notes:` field
   - Confirm ref designators from actual schematic annotation
2. Regenerate fab package via Fabrication Toolkit
3. Upload to JLC — their DFM check is the final authoritative pass on THT assembly (MOC3062M, BT137, X2 cap, screw terminals)
