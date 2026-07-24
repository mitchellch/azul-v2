# Enclosure Side-Wall Hole Plan

Drill template for the Polycase **WP-24BF*15** enclosure side wall. Two holes: PG13.5 cable gland (Syston 8813, 13-cond, ~9mm OD) and IP68 5.5×2.1mm barrel jack (Amazon B0FST27TBY).

All exterior dimensions below are populated from the Polycase drawing (rev C, sheet 1, 8/26/2011). Interior clearance values that depend on PCB seat position are still marked `___` and must be confirmed against the physical assembly.

Datasheet units are inches; this doc uses mm derived at 25.4 mm/in. Tolerance from the datasheet chart: dims in the 3.540–4.700" range ±0.0132" tool-dependent, and 4.700–6.300" range ±0.0150" tool-dependent (so overall body dims are ~±0.35 mm).

---

## Target wall

- [x] Which wall: **long side wall, opposite the WROOM antenna** (6.724" / 170.79 mm long, 1.535" / 39.0 mm tall)
      (WROOM antenna keep-out runs along one long edge of the PCB, so the OPPOSITE long wall is the drill target. Confirm which long wall that is by orienting the physical PCB in the enclosure — the antenna is on the "top" long edge of the board per the KiCad PCB view.)
- [x] Reason for choosing this wall:
      - Antenna keep-out lives on the opposite long edge — this wall is RF-free
      - Terminal blocks J2 (24VAC input), J3/J4/J6 (zone outputs) all sit along one long edge of the PCB — this wall is where the cables want to exit
      - Long wall gives ~171 mm of horizontal room — plenty of clearance for the two holes plus lateral separation from PCB internal features

## Exterior wall dimensions (outer face — this is the template canvas)

- [x] Wall width (horizontal, along enclosure long axis): **170.79 mm** (6.724")
- [x] Wall height (vertical, top-to-bottom base only): **39.0 mm** (1.535")
- [x] Wall thickness at drill location: **3.00 mm** (0.118" TYP per Section B-B — right-side arrow across wall cross-section)
- [x] Draft angle: **0.5°–1.0°** (Section A-A: 89.00°/90.50°). Effectively flat for template purposes.
- [x] Top corner radii (outer): **R 5.0 mm** (R.197")
- [x] Bottom corner radii transitioning to flange: **R 6.0 mm** (R.236")
- [x] Flange corner radii (outermost mounting-tab corners, for reference): **R 6.55 mm** (R.258")

Note: Flanges extend from the two SHORT-axis ends of the base for the mounting slots. On the LONG-side walls (our target), the flange runs along the entire base bottom edge as a horizontal skirt but does not extend the wall laterally. The long-wall canvas is a clean 170.79 × 39.0 mm rectangle with rounded corners. Confirm by inspecting the physical part.

## Internal ribs on the long wall (CRITICAL — plan around these)

Section B-B shows **3 transverse ribs along the long (X) axis** plus **1 longitudinal rib along the short (Y) axis** (the Y rib is on the short walls, not our target). The 3 X-axis ribs span between the two long walls and show up on each long-wall interior as vertical protrusions at three X positions.

The 1.673" | 1.673" dimension chain gives the rib spacing directly. With the wall midpoint at X = 85.4 mm (half of 170.79 mm) and 1.673" = 42.5 mm:

| Feature | X position | Notes |
|---|---|---|
| **Rib 1** | 42.9 mm | Left transverse rib |
| **Rib 2** | 85.4 mm | Center transverse rib |
| **Rib 3** | 127.9 mm | Right transverse rib |

This defines **4 bays** on the long wall interior:

| Bay | X range | Width | Notes |
|---|---|---|---|
| Bay 1 | 0 – 42.9 mm | 42.9 mm | Left, near corner |
| Bay 2 | 42.9 – 85.4 mm | 42.5 mm | Left-center |
| Bay 3 | 85.4 – 127.9 mm | 42.5 mm | Right-center |
| Bay 4 | 127.9 – 170.79 mm | 42.9 mm | Right, near corner |

Also on the section:
- **12X .069 / 12X .047** — thin partition ribs at the TOP of the interior only (immediately below the lid seat). Don't interfere with hole positions at Y = 19.5 mm midline.
- **6X .177"** — appears near the floor at the flange-side; small feature, not a full-height rib.

**Action required:** verify rib X positions on the physical enclosure. Best plan is to place each hole in its own bay so the gland's back nut (13 mm radius) has 21.25 mm clearance to the nearest rib on each side — comfortable margin.

## Datums for template registration

Origin: **top-left corner of the long wall as viewed from outside**.
- Datum edge X (X = 0): **LEFT vertical edge** of the wall (the tangent line of the R.197 corner where the long wall meets the short wall)
- Datum edge Y (Y = 0): **TOP horizontal edge** of the wall (the rim where the lid seats — cleanest, most repeatable edge on the whole part)
- Y grows DOWNWARD from the top rim toward the flange.
- X grows RIGHTWARD across the wall (along the long axis).

- [x] Datum X: **LEFT edge of long wall (viewed from outside), tangent to the top-left R.197 corner**
- [x] Datum Y: **TOP rim of long wall (lid seat edge)**
- [x] Fold-tab side #1: **TOP rim** — tab wraps ~15 mm over onto the horizontal top face of the base, buttressing Y=0
- [x] Fold-tab side #2: **LEFT edge** — tab wraps ~15 mm around onto the adjacent short end wall, buttressing X=0

## Interior clearance survey (with PCB seated, lid off)

Measure the free volume between the inside face of the target wall and the nearest obstacle. Datasheet-derived values are pre-filled; PCB-adjacent values require physical measurement.

- [x] Interior wall-to-wall span (short axis, between the two long walls): **114.83 mm** (4.521" = 4.757 - 2 × 0.118")
- [x] Interior wall-to-wall span (long axis, between the two short walls): **164.80 mm** (6.488" = 6.724 - 2 × 0.118")
- [x] Clearance from inner LONG wall to PCB edge: **1.08 mm** (edge-to-wall gap). But this only matters where the PCB is directly behind the hole — see next line.
- [x] Clearance from inner LONG wall to nearest terminal block face: **~23 mm** (J6 bottom edge is 22 mm inset from the PCB drill-wall edge, plus 1.08 mm PCB-to-wall gap). J2/J3/J4 sit on the opposite long-axis side of the PCB, so they're even further away in Z.
- [x] Height of PCB top surface above interior floor (PCB seats on 6X bosses): approximately **6 mm** (0.256" boss OD suggests ~0.2" tall bosses; verify)
- [x] Height of enclosure interior lip / lid seam above floor: **~38 mm** (interior of 1.535" minus lip)
- [x] Available Y range for hole centerlines (from top rim, downward):
      - Barrel jack (radius 6 mm, nut radius 7 mm): min Y = 8 mm, max Y = 30 mm
      - Gland (radius 10 mm, nut radius 12 mm): min Y = 13 mm, max Y = 26 mm
      - Both cleanly satisfy the wall-vertical constraints at Y=19.5 (midline)

**Wall-to-PCB gap analysis (RESOLVED, not a blocker):**

The 1.08 mm PCB-to-wall gap only matters if a nut is BEHIND the PCB or a component at the same Y position. At Y_center=19.5:
- Nut envelope in Y: 7.5–31.5 mm (parallel to wall)
- PCB plane at Y ≈ 33 mm (6 mm above floor at Y=39, PCB seat height)
- **Nut is entirely above the PCB in Y — no interference.**

The nut protrudes into the enclosure by ~5–8 mm in Z. Nearest terminal block is ~23 mm from the inner wall in Z. **Nut sits in 23 mm of clear airspace between the wall and any obstruction.** No PCB rework or hardware swap needed.

## Hardware envelopes (need room to install AND spin the back nut)

### PG13.5 cable gland
- Nominal thread OD: **20.4 mm** (drill target 20.0 mm, then file up if gland won't seat)
- Back nut wrench flats: ~24 mm across
- Panel thickness range: PG13.5 typically 1–6 mm — enclosure wall 2.64 mm is well within range ✓
- Nut clearance envelope inside wall: **≥ 13 mm radius from hole center** (24/2 + 1 mm swing clearance)

### IP68 barrel jack (B0FST27TBY, DC-099 style)
- Nominal thread OD: **12.0 mm** (drill target 12.0 mm)
- Panel thickness range: covers 2.5–8 mm walls — enclosure wall 2.64 mm at the very low end but supported ✓
- Back nut wrench flats: ~14 mm across
- Nut clearance envelope inside wall: **≥ 8 mm radius from hole center**

## Hole positions (proposed — verify against physical PCB position and rib map)

Coordinates are (X, Y) from the top-left datum, to the CENTER of each hole. Wall canvas is **170.79 × 39.0 mm**.

**Vertical strategy:** Hole centers at **Y = 26 mm** — this is ~13 mm above the floor of the enclosure, placing hole edges 3 mm below the PCB seat height (~6 mm above floor) at their upper extent (26 − 10 = 16 mm from top, i.e. 23 mm from floor... wait, recompute). At Y=26 from the top rim, the hole spans Y=16 to Y=36. The PCB top surface at 6 mm above floor = 33 mm below top rim. So the hole's UPPER edge (Y=16) sits 17 mm above the PCB plane, and the LOWER edge (Y=36) sits 3 mm above the floor.

That doesn't put the holes below the PCB. **Corrected:** the PCB seats at floor + ~6 mm boss height, so PCB plane is at Y = 39 − 6 = **33 mm from top rim (near the flange)**. To keep hole entirely below the PCB, the hole's UPPER edge (Y = center − radius) must be ≥ 33 mm, i.e. Y_center ≥ 33 + 10 = **43 mm**. But wall is only 39 mm tall, so this isn't feasible.

**Revised strategy:** the holes MUST straddle the PCB plane. Place both hole centers at **Y = 19.5 mm** (wall vertical midline) — the PCB edge passes through the hole at Y=33 mm, i.e. the lower ~30% of the hole opens into "basement" space and the upper ~70% opens level with or above the PCB. **This is why the wall-to-PCB gap of 1.4 mm is a real problem for the gland**: the back nut can't seat flat if the PCB is in the way.

**Two mitigations (need physical fit check to choose):**
1. **Notch the PCB edge locally** at each hole X position — a semi-circular scoop cut ~15 mm wide × ~5 mm deep gives the back nut clearance. Would require a rev to `board_ir.json` and re-fab.
2. **Use lower-profile hardware** — a bulkhead-style gland with a shorter back-nut, or route the barrel jack pigtail through a smaller hole and add a splash-tight rubber grommet instead of a threaded jack. Preserves current PCB.

For now, positions below assume mitigation #2 (or a physical check reveals the terminal blocks don't extend fully to the PCB edge, giving more room).

**Horizontal strategy:** place each hole in its own bay between transverse ribs. With ribs at X = 42.9, 85.4, 127.9 mm, the two center bays (Bay 2 and Bay 3) each have midpoints at X = 64.15 mm and X = 106.65 mm respectively — 42.5 mm center-to-center, which is well over any wrench-swing minimum, and each hole has 21.25 mm rib clearance on each side.

**Board orientation on the target long wall (viewed from outside, board landscape):**
- J2 (24VAC input) sits LEFT of PCB center; J6 (14-pos zone outputs, ganged) sits RIGHT.
- **Hole arrangement (final, after physical template fit-check on 2026-07-13):**
  - **Gland LEFT of center** in Bay 2 (larger hole, bulkier cable exit)
  - **Barrel RIGHT of center** in Bay 3 (smaller hole, 150 mm pigtail routes across interior to J2)

### Hole A — PG13.5 cable gland (20.0 mm Ø, Syston zone cable to J6)
- [x] X: **64.15 mm** from datum X edge (midpoint of Bay 2, LEFT of center)
- [x] Y: **19.5 mm** from datum Y edge (wall vertical midline)
- [x] Why this position:
      - Bay 2 midpoint (halfway between Rib 1 at wall_X=42.9 and Rib 2 at wall_X=85.4) gives **21.25 mm to nearest transverse rib on each side** — comfortable margin for 12 mm nut radius
      - 10 mm hole radius clears wall corner curvatures with ~50 mm to spare
      - Position revised after physical template fit-check: user preferred gland (larger, bulkier cable exit) LEFT of center
      - **C5 verification note:** C5 (470µF radial electrolytic, ~20 mm tall THT) sits on the PCB near wall_X 53-63 mm. Gland nut envelope in X spans 52.15 to 76.15 mm. Physical overlap in X exists; vertical (Y) and depth (Z) fit was verified during template dry-fit.

### Hole B — Barrel jack (12.0 mm Ø, power input to J2)
- [x] X: **106.65 mm** from datum X edge (midpoint of Bay 3, RIGHT of center)
- [x] Y: **19.5 mm** from datum Y edge (same midline as Hole A)
- [x] Why this position:
      - Bay 3 midpoint (halfway between Rib 2 at wall_X=85.4 and Rib 3 at wall_X=127.9) gives **21.25 mm to nearest transverse rib on each side** — well over the 7 mm barrel nut radius
      - Position revised after physical template fit-check: barrel jack (smaller, 12 mm hole) RIGHT of center gives cleaner arrangement
      - 150 mm pigtail reaches J2 (KiCad X=113.97 mm) directly across the enclosure interior with slack
      - **Center-to-center from Hole A = 42.5 mm** — no wrench interference

## Constraint checks (verified against datasheet + hardware specs)

- [x] Center-to-center distance between holes A and B: **42.5 mm** (106.65 − 64.15) (≥ 25 mm ✓, ≥ 21 mm nut-safe ✓)
- [x] Hole A (gland, 20 mm) center ≥ 12 mm from any wall edge: X=64.15, right edge distance 106.64; Y=19.5, bottom distance 19.5 — all ≥ 12 mm ✓
- [x] Hole B (barrel, 12 mm) center ≥ 8 mm from any wall edge: X=106.65, right edge distance 64.14; Y=19.5, bottom distance 19.5 — all ≥ 8 mm ✓
- [x] Neither hole intersects R.197 top corners or R.236 bottom corners (both are ≥ 60 mm from the wall's rounded ends)
- [x] **Each hole in its own bay between transverse ribs** — Hole A (gland) in Bay 2 (X 42.9–85.4), Hole B (barrel) in Bay 3 (X 85.4–127.9). 21.25 mm rib clearance on each side ≥ 12 mm nut-radius requirement ✓
- [x] Hole A (gland) — C5 clearance verified during physical template fit-check
- [x] Hole A (gland) back nut clears PCB / terminal blocks — Y_center=19.5 puts nut envelope Y=7.5–31.5, entirely above PCB plane at Y=33. Z clearance ~23 mm. ✓
- [x] Hole B (barrel) back nut clears PCB / terminal blocks — Y_center=19.5 puts nut envelope Y=12.5–26.5, entirely above PCB plane at Y=33. Z clearance ~23 mm. ✓
- [ ] Barrel jack pigtail (150 mm) reaches J2 with slack
- [ ] Syston cable exit angle doesn't kink at the gland

## Template file

- [x] SVG source: `hardware/main-controller-v1/scripts/enclosure_drill_template.svg` (v4, 2026-07-13)
- [x] PDF for printing: `hardware/main-controller-v1/scripts/enclosure_drill_template.pdf` — regenerate with `rsvg-convert -f pdf -o enclosure_drill_template.pdf enclosure_drill_template.svg`
- [x] Canvas: **170.79 mm × 39.0 mm** wall face + **15 mm × 32.5 mm** left fold tab (shortened to clear 6.5 mm flange on short wall) + **170.79 mm × 15 mm** bottom fold tab (wraps under base flange)
- [x] Print settings: Letter or A4, LANDSCAPE, **100% actual size, no fit-to-page, no auto-scale**
- [x] 100 mm calibration reference line included
- [x] Fold tabs: **BOTTOM** (under flange) and **LEFT** (onto short wall). Top edge is a clean cut aligned to the lid-seat rim.
- [x] Full-height vertical CENTERLINE at wall_X = 85.4 mm (long-wall midpoint), 0.2 mm stroke, for pre-adhesive alignment
- [x] Print method verified: PDF via `rsvg-convert` → Preview.app → 100% scale, Paper Handling → uncheck "Scale to fit". Browser printing shrinks ~9-10% and is not reliable.

## Template design history

- **v1** (2026-07-13): initial, with top fold tab (over lid rim) and left tab
- **v2**: moved fold tab from top to bottom (wraps under flange) per user preference
- **v3**: swapped hole positions after physical fit-check — gland to Bay 2 (left), barrel to Bay 3 (right)
- **v4** (current): shortened left tab to 32.5 mm to clear 0.256"/6.5 mm flange extending outward from short wall

## Verification checklist (post-print, pre-drill)

- [ ] Measured 100 mm calibration line with calipers: reads ______ mm (must be 100 ± 0.1)
- [ ] Trimmed template to outer wall outline plus fold tabs
- [ ] Wiped enclosure faces (target long wall + bottom flange + adjacent short wall) with IPA
- [ ] Marked enclosure long-wall midpoint independently (calipers from each corner)
- [ ] Aligned template CENTERLINE to enclosure center mark before committing adhesive
- [ ] Folded BOTTOM tab under base flange; LEFT tab 90° onto short wall
- [ ] Burnished flat with plastic card
- [ ] Center-punched both hole centers through the template
- [ ] Removed template; punch marks visible on plastic
- [ ] Backed the wall with sacrificial hardwood block, clamped tight against interior
- [ ] Drilled 3 mm pilots at low RPM (~500)
- [ ] Stepped up with Irwin 11103 Unibit3M to 12 mm (barrel jack) and 18 mm (gland, max on Unibit3M) at low RPM (~400–600)
- [ ] Enlarged 18 mm → 20 mm with hand reamer (Unibit3M only goes to 18 mm; needs 2 mm ream for gland)
- [ ] Deburred both sides with hobby knife tipped 45°
- [ ] Dry-fit barrel jack: seats flush, back nut tightens by hand, back-nut wrench swings without hitting anything inside
- [ ] Dry-fit PG13.5 gland: seats flush, back nut tightens by hand, back-nut wrench swings without hitting anything inside

## Post-drill open items (verify when boards arrive)

1. **Rib X positions verified against physical enclosure interior** — datasheet math puts them at X = 42.9, 85.4, 127.9 mm.
2. **J2 pigtail reach** — 150 mm barrel jack pigtail from Hole B at wall X=106.65 to J2 at KiCad (113.9675, 96.25).
3. **Syston cable strain relief** — cable exit angle at gland doesn't kink.

Attach photos of the wall, the drilled holes, and the final dry-fit here.
