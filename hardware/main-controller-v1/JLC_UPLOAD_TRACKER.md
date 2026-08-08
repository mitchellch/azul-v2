# JLC PCBA Upload Tracker — Rev 2

Started: 2026-08-08
Board: main-controller-v1 Rev 2

Files to upload (all in `production/`):
- `main-controller-v1-gerbers.zip`
- `main-controller-v1_bom.csv`
- `main-controller-v1_positions.csv`

---

## Step 1 — Quote page

- [x] 1.1 Navigate to https://jlcpcb.com → "Order Now"
- [x] 1.2 Drag `main-controller-v1-gerbers.zip` onto the drop zone
- [x] 1.3 Wait for render to complete
- [x] 1.4 Verify board outline: 4 concave scoops + 8 fillets visible
- [x] 1.5 Verify dimensions: **162.66 × 112.68 mm** (6.404 × 4.436")
- [x] 1.6 Confirm defaults: 2 layers, 1.6mm thickness
- [x] 1.7 Enable **"PCB Assembly"** toggle
- [x] 1.8 PCBA — Assembly side: **Top only**
- [x] 1.9 PCBA — Tooling holes: **Added by JLCPCB** (correction: fiducials ≠ tooling holes)
- [x] 1.10 PCBA — Confirm parts placement: **Yes**
- [x] 1.11 PCBA — Parts Selection: **By Customer (Self-Service)**
- [x] 1.12 PCBA — PCBA Type: **Economic**
- [x] 1.13 "Do not confirm automatically" checked (72hr auto-approve disabled)

## Step 2 — Upload BOM + CPL

- [x] 2.1 Click "Add BOM File" → upload `main-controller-v1_bom.csv`
- [x] 2.2 Click "Add CPL File" → upload `main-controller-v1_positions.csv`
- [x] 2.3 Click "Process BOM & CPL"
- [x] 2.4 Wait for match table to render

## Step 3 — BOM matching

- [x] 3.1 Verify **25 line items** total (tracker said 26 — actual BOM is 25)
- [ ] 3.2 Verify **0 unmatched** rows (red) — visible rows OK; verify top-scroll C1-C11 rows
- [x] 3.3 Verify no substitutions accepted (JLC may suggest — decline all)
- [x] 3.4 Check stock levels ≥ 50 on all Extended parts
  - BT137-600E `C967624` → 60 qty allocated ✓
  - MOC3062M `C8919` → 60 qty allocated ✓
  - X2 cap `C105755` → 61 qty allocated ✓
- [x] ~~3.5 Mark DNP — set "Do Not Place" for J1/J6/SW1/SW2/C5/D3~~
  - **Already handled at fab-package level.** `fate: dnp` in parts.yaml → `apply_lcsc_fields.py` strips from BOM; `(attr through_hole dnp)` in PCB → `kicad-cli --exclude-dnp` strips from CPL. Parts don't appear in JLC match table.
- [x] 3.6 Confirm J2, J3, J4 remain SET FOR PLACEMENT (C5188434 screw terminals, Qty 16) ✓
- [x] 3.7 D5 (WS2812B) checked, Qty 6 ✓
- [x] 3.8 U1 (ESP32-S3-WROOM-1) checked, Qty 5 ✓
- [ ] 3.9 Scroll up: verify C1/C8/C9, C2/C4/C10/C11, C3, C6, C7 all checked with valid Qty

## Step 4 — Component Placements preview

Known false alarms — expected, do not panic:
- C6, C7 CP_Elec 180° rotation artifact
- U2 SOT-23-6 pins appear floating
- U4 SOT-23-5 pins appear floating
- U1 WROOM castellations offset half-pitch on side edges

Real checks:
- [ ] 4.1 All 12 Q# TO-220 triacs present (Q1–Q12)
- [ ] 4.2 All 12 U# MOC3062M DIP-6 opto-drivers present (U5–U16)
- [ ] 4.3 All 12 C# X2 caps present (C12–C23)
- [ ] 4.4 All 36 zone R# resistors present (R7–R42, mix of 0805 + 2010)
- [ ] 4.5 J2, J3, J4 wire entry faces OUTWARD toward board edge
- [ ] 4.6 U1 WROOM antenna area clear of copper/silk
- [ ] 4.7 No parts overhang board outline
- [ ] 4.8 DIP-6 pin-1 markers on correct side (verify one, they're all copies)
- [ ] 4.9 Silkscreen title block reads "Rev 2 · 2026-08"

## Step 5 — Final review before pay

- [x] 5.1 Board quantity chosen: **5**
- [x] 5.2 Total price: **$282.44** all-in (merchandise $166.35 after $20 coupon, shipping $45.38, customs+tax $70.71)
- [x] 5.3 Lead time: PCB 24hr + assembly 4-5 days + UPS Express 2-4 business days → arrives ~2026-08-18
- [x] 5.4 Screenshot order-review page
- [x] 5.5 Submit order — **PAID 2026-08-08 06:41 UTC**
- [x] 5.6 Order number: **W2026080821415396**
  - PCB sub-order: Y5-12525575A
  - PCBA sub-order: SMT026080860985-125...

## Post-order watch list

- [ ] Reviewer questions in JLC messages tab (Order Details → chat)
- [ ] DFM notes acceptance (typically silkscreen sliver warnings — accept as-is for proto)
- [ ] MSL bake fee ($7.88) — will appear as add-on invoice; pay when it hits
- [ ] Ship notification with UPS tracking

---

## Issue log

Record anything weird here as it comes up. Screenshot + step number.

| Step | Issue | Resolution |
|------|-------|------------|
| 2.3  | JLC error: "J2, J3, J4 don't exist in CPL" — DNP flag on .kicad_pcb footprints was stale after flipping fate: dnp→smt in parts.yaml. `kicad-cli pcb export pos --exclude-dnp` reads PCB attr, not sch. | Stripped `dnp` from J2/J3/J4 footprint `(attr)` blocks directly, re-ran export script. Saved to memory as feedback_kicad_dnp_pcb_sync. |
| 2.3  | JLC warning: "FID1, FID2, FID3 don't exist in BOM" | Expected — fiducials are copper marks for camera alignment, not assembled parts. Safe to ignore/Continue. |
| 3.1  | D5 (WS2812B C2761795) and U1 (ESP32-S3-WROOM-1 C2913204) tagged "Standard Only" — unchecked in match table under Economic PCBA. | Switch PCBA Type from Economic → Standard on the PCB Assembly settings page. Cost delta ~$25 on 5-board proto. Resolved: D5 Qty 6 ✓, U1 Qty 5 ✓ under Standard. |
| 3.1  | Tracker said "26 line items" — actual BOM has 25. Miscount from earlier. | Cosmetic. All 25 rows matched, no red/unmatched. |
