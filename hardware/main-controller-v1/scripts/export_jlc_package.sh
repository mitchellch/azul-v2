#!/usr/bin/env bash
#
# Export a JLCPCB-ready fabrication package for main-controller-v1 using
# kicad-cli (NOT the Fabrication Toolkit plugin). This is the plugin-free
# path that survives KiCad point-release upgrades.
#
# What it produces (in production/):
#   gerbers/                          — raw gerber + drill files (Protel ext)
#   main-controller-v1-gerbers.zip    — zipped gerbers, ready to upload to JLC
#   main-controller-v1_bom.csv        — Designator, Footprint, Quantity, Value, LCSC Part #
#   main-controller-v1_positions.csv  — Designator, Mid X, Mid Y, Rotation, Layer
#
# Usage:
#   scripts/export_jlc_package.sh
#
# Requirements:
#   - kicad-cli on PATH (installed with KiCad 10)
#   - main-controller-v1.kicad_pcb + main-controller-v1.kicad_sch present
#   - LCSC part numbers already applied to the schematic (see apply_lcsc_fields.py)
#
# Layers plotted are the standard 2-layer set. Update LAYERS below if you go
# to 4+ layers.
#
# Column headers in the CSVs match what the JLC PCBA form expects, so no
# manual editing is needed before upload.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$HERE")"
PCB="$PROJECT_DIR/main-controller-v1.kicad_pcb"
SCH="$PROJECT_DIR/main-controller-v1.kicad_sch"
OUT="$PROJECT_DIR/production"
GERBERS_DIR="$OUT/gerbers"
ZIP_PATH="$OUT/main-controller-v1-gerbers.zip"
BOM_PATH="$OUT/main-controller-v1_bom.csv"
POS_PATH="$OUT/main-controller-v1_positions.csv"

LAYERS="F.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts"

if ! command -v kicad-cli >/dev/null 2>&1; then
    echo "ERROR: kicad-cli not on PATH. Install KiCad 10 or add its bin dir." >&2
    exit 1
fi

for f in "$PCB" "$SCH"; do
    [ -f "$f" ] || { echo "ERROR: missing $f" >&2; exit 1; }
done

mkdir -p "$GERBERS_DIR"
rm -f "$GERBERS_DIR"/*.gbr "$GERBERS_DIR"/*.gtl "$GERBERS_DIR"/*.gbl \
      "$GERBERS_DIR"/*.gts "$GERBERS_DIR"/*.gbs "$GERBERS_DIR"/*.gto \
      "$GERBERS_DIR"/*.gbo "$GERBERS_DIR"/*.gtp "$GERBERS_DIR"/*.gbp \
      "$GERBERS_DIR"/*.gm1 "$GERBERS_DIR"/*.drl 2>/dev/null || true

echo "==> Exporting gerbers ($LAYERS)"
kicad-cli pcb export gerbers \
    --output "$GERBERS_DIR" \
    --layers "$LAYERS" \
    --no-x2 \
    "$PCB"

echo "==> Exporting drill files (Excellon, PTH+NPTH separate)"
kicad-cli pcb export drill \
    --output "$GERBERS_DIR/" \
    --format excellon \
    --excellon-separate-th \
    --excellon-units mm \
    --generate-map \
    --map-format gerberx2 \
    "$PCB"

echo "==> Zipping gerbers → $(basename "$ZIP_PATH")"
rm -f "$ZIP_PATH"
(cd "$GERBERS_DIR" && zip -qr "$ZIP_PATH" .)

echo "==> Exporting position file → $(basename "$POS_PATH")"
kicad-cli pcb export pos \
    --output "$POS_PATH" \
    --format csv \
    --units mm \
    --side both \
    --exclude-dnp \
    "$PCB"
# kicad-cli emits: Ref,Val,Package,PosX,PosY,Rot,Side
# JLC wants: Designator,Mid X,Mid Y,Rotation,Layer  (drop Val + Package, rename)
#
# CRITICAL: JLC's assembly line places parts using a rotation reference frame
# that differs from KiCad's for several polarized/asymmetric footprint families.
# Without per-family rotation corrections, CP_Elec caps get placed 180° reversed
# (cathode on "+" pad → explode on power-up) and SOT-23 pins land off-pad. The
# Fabrication Toolkit plugin applies these offsets automatically; kicad-cli
# does NOT — so we apply them here.
#
# Offset table sourced from JLCKicadTools cpl_rotations_db.csv (community
# consensus). Only entries used by this BOM are listed; extend as parts join.
python3 - "$POS_PATH" <<'PY'
import csv, re, sys
path = sys.argv[1]

# (regex, degrees_to_add) — first match wins. Regex is anchored full-match.
# Only well-established community-consensus entries listed. Anything
# ambiguous or version-dependent (TO-263, WS2812B variants) is intentionally
# left OUT so it appears in the "pass-through" audit list below — safer to
# eyeball each part than to blindly apply an offset from a stale DB.
ROTATION_OFFSETS = [
    (r"CP_Elec_.*",             180),  # aluminum electrolytic caps (C6, C7)
    (r"SOT-23-5.*",             270),  # AP2112K-3.3 (U4)
    (r"SOT-23-6.*",             270),  # USBLC6-2SC6 (U2)
    (r"SOT-23",                 270),  # 3-pin SOT-23 (DB says SOT-23 -> -90 = 270)
    (r"SOT-223.*",              180),
    (r"SOIC-.*",                270),
    (r"SSOP-.*",                270),
    (r"TSSOP-.*",               270),
    (r"LQFP-.*",                270),
    (r"TQFP-.*",                270),
    (r"QFN-.*",                 270),
]
# INTENTIONALLY OMITTED — verified against JLCKicadTools cpl_rotations_db.csv:
#   - LED_WS2812B_PLCC4_5.0x5.0mm  : NO offset (only the -2020 2.0x2.0 variant is +90 in DB)
#   - ESP32-S3-WROOM-1             : NO offset (DB "ESP32-W" pattern targets legacy ESP32-WROOM-32,
#                                    not the S3 module; recent community builds place S3 at 0° cleanly)
#   - TO-263-5_TabPin3 (LM2596)    : NO offset (DPAK typically matches JLC at 0° for stock KiCad footprint)
#   - D_SMA, D_SMB (SS14, TVS)     : NO offset (standard diode packages)
#   - Diode_Bridge_Diotec_SO-DIL-Slim (DB107S) : NO offset (custom package, verified by net probing 2026-07-11)
#   - G3MB-202P SSR                : NO offset (LCSC-specific, historically 0°)
#   - JST_PH_B6B-PH-K vertical THT : NO offset (THT, pin 1 well-defined in KiCad footprint)
COMPILED = [(re.compile(p), off) for p, off in ROTATION_OFFSETS]

def find_offset(pkg):
    for rx, off in COMPILED:
        if rx.fullmatch(pkg):
            return off, rx.pattern
    return 0, None

with open(path, newline="") as f:
    rows = list(csv.reader(f))
# Header from kicad-cli: Ref,Val,Package,PosX,PosY,Rot,Side
# JLC expects: Designator,Mid X,Mid Y,Rotation,Layer
out = [["Designator", "Mid X", "Mid Y", "Rotation", "Layer"]]
adjusted = []
unmatched = []
for r in rows[1:]:
    if len(r) < 7: continue
    ref, val, pkg, x, y, rot, side = r[:7]
    off, matched = find_offset(pkg)
    new_rot = (float(rot) + off) % 360
    # Render integer when whole (matches KiCad output style), else 1 decimal.
    new_rot_str = f"{int(new_rot)}" if new_rot == int(new_rot) else f"{new_rot:.1f}"
    out.append([ref, x, y, new_rot_str, side])
    if off:
        adjusted.append((ref, pkg, rot, new_rot_str, matched))
    else:
        unmatched.append((ref, pkg))

with open(path, "w", newline="") as f:
    csv.writer(f).writerows(out)

# Print an audit log so the operator can eyeball the offsets.
print(f"    Applied rotation offsets to {len(adjusted)} part(s):")
for ref, pkg, old, new, pat in adjusted:
    print(f"      {ref:6s}  {pkg:38s}  {old:>6s}° -> {new:>6s}°   (matched /{pat}/)")
if unmatched:
    print(f"    No offset applied to {len(unmatched)} part(s) (pass-through):")
    # Group by package for readability.
    from collections import defaultdict
    by_pkg = defaultdict(list)
    for ref, pkg in unmatched:
        by_pkg[pkg].append(ref)
    for pkg in sorted(by_pkg):
        refs = ", ".join(sorted(by_pkg[pkg]))
        print(f"      {pkg:38s}  {refs}")
    print(f"    Review the above — any polarized/asymmetric part with no offset")
    print(f"    may need an entry added to ROTATION_OFFSETS in this script.")
PY

echo "==> Exporting BOM → $(basename "$BOM_PATH")"
kicad-cli sch export bom \
    --output "$BOM_PATH" \
    --fields 'Reference,Footprint,${QUANTITY},Value,LCSC' \
    --labels 'Designator,Footprint,Quantity,Value,LCSC Part #' \
    --group-by 'Value,Footprint,LCSC' \
    --exclude-dnp \
    --ref-range-delimiter '' \
    "$SCH"

echo ""
echo "Done. Upload to JLC:"
echo "  Gerbers  : $ZIP_PATH"
echo "  BOM      : $BOM_PATH"
echo "  Positions: $POS_PATH"
