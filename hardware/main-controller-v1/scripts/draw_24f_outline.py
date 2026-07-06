"""
Draw the Polycase WP-24BF*15 PCB outline in KiCad 10 from board_ir.json.

Run from PCB Editor → Tools → Scripting Console:
    exec(open('/Users/mitch.christensen/personal/dev/azul/hardware/main-controller-v1/scripts/draw_24f_outline.py').read())

Reads board_ir.json (same source as preview_outline.py) and emits Edge.Cuts
line segments, arcs, and mounting-hole circles. Groups everything as
'Board Outline 24F' so the whole thing moves as one unit.

IR is inches with origin (0,0) at board center, Y positive UP.
KiCad is mm with Y positive DOWN. This script converts:
    x_kicad_mm = origin_x_mm + x_in * 25.4
    y_kicad_mm = origin_y_mm - y_in * 25.4        # Y flip

Board center is placed at (origin_x_mm, origin_y_mm) per the IR's
kicad_placement block. Move the group afterward if you want a different
position; segments are grouped for exactly that.

If a group named 'Board Outline 24F' already exists, this script exits
without modifying the board — delete the existing group first.
"""

import json
import math
import os
import sys

import pcbnew

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() \
    else "/Users/mitch.christensen/personal/dev/azul/hardware/main-controller-v1/scripts"
IR_PATH = os.path.join(HERE, "board_ir.json")
GROUP_NAME = "Board Outline 24F"

if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Force a fresh reload of preview_outline. Without this, editing the IR walk
# in preview_outline.py has no effect until KiCad is restarted, because
# Python caches the module on first import into KiCad's persistent
# interpreter session.
import importlib
if "preview_outline" in sys.modules:
    importlib.reload(sys.modules["preview_outline"])
from preview_outline import outline_segments, check_closure

INCH_TO_MM = 25.4


def existing_group(board, name):
    for g in board.Groups():
        if g.GetName() == name:
            return g
    return None


def render_to_kicad(ir):
    board = pcbnew.GetBoard()

    if existing_group(board, GROUP_NAME) is not None:
        print(f"ERROR: group '{GROUP_NAME}' already exists — delete it and re-run")
        return 0

    segs = outline_segments(ir)
    gaps, closure = check_closure(segs)
    if gaps:
        print(f"ERROR: {len(gaps)} segment gap(s) in IR — aborting")
        for (i, pe, s, g) in gaps[:8]:
            print(f"  seg {i}: prev_end={pe} start={s} gap={g:.4f} in")
        return 0
    if closure > 0.001:
        print(f"ERROR: outline does not close (last→first gap {closure:.4f} in) — aborting")
        return 0

    ox_mm = ir["kicad_placement"]["kicad_origin_x_mm"]
    oy_mm = ir["kicad_placement"]["kicad_origin_y_mm"]
    line_w_mm = ir["board"]["edge_cuts_line_width"] * INCH_TO_MM
    line_w = pcbnew.FromMM(line_w_mm)
    edge_layer = pcbnew.Edge_Cuts

    def to_kicad_mm(x_in, y_in):
        return (ox_mm + x_in * INCH_TO_MM, oy_mm - y_in * INCH_TO_MM)

    def mm_pt(x_in, y_in):
        xm, ym = to_kicad_mm(x_in, y_in)
        return pcbnew.VECTOR2I_MM(xm, ym)

    created = []

    def add_line(x1, y1, x2, y2):
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetLayer(edge_layer)
        s.SetStart(mm_pt(x1, y1))
        s.SetEnd(mm_pt(x2, y2))
        s.SetWidth(line_w)
        board.Add(s)
        created.append(s)

    def add_arc(cx, cy, radius, s_deg, e_deg):
        # IR walk direction is s_deg → e_deg (may be CCW or CW).
        # SetArcGeometry(start, mid, end) — mid disambiguates direction and
        # survives the Y-flip because the three points are still collinear
        # with the true arc in KiCad space.
        def pt_in(deg):
            rad = math.radians(deg)
            return (cx + radius * math.cos(rad), cy + radius * math.sin(rad))

        sx, sy = pt_in(s_deg)
        mx, my = pt_in((s_deg + e_deg) / 2.0)
        ex, ey = pt_in(e_deg)

        a = pcbnew.PCB_SHAPE(board)
        a.SetShape(pcbnew.SHAPE_T_ARC)
        a.SetLayer(edge_layer)
        a.SetArcGeometry(mm_pt(sx, sy), mm_pt(mx, my), mm_pt(ex, ey))
        a.SetWidth(line_w)
        board.Add(a)
        created.append(a)

    def add_circle(x_in, y_in, diameter_in):
        c = pcbnew.PCB_SHAPE(board)
        c.SetShape(pcbnew.SHAPE_T_CIRCLE)
        c.SetLayer(edge_layer)
        c.SetCenter(mm_pt(x_in, y_in))
        # SetEnd defines radius as distance from center; edge point at +X.
        c.SetEnd(mm_pt(x_in + diameter_in / 2.0, y_in))
        c.SetWidth(line_w)
        board.Add(c)
        created.append(c)

    for seg in segs:
        if seg[0] == "line":
            _, x1, y1, x2, y2 = seg
            add_line(x1, y1, x2, y2)
        else:
            _, cx, cy, radius, s_deg, e_deg = seg
            add_arc(cx, cy, radius, s_deg, e_deg)

    d_in = ir["mounting_holes"]["diameter"]
    for h in ir["mounting_holes"]["positions"]:
        add_circle(h["x"], h["y"], d_in)

    group = pcbnew.PCB_GROUP(board)
    group.SetName(GROUP_NAME)
    board.Add(group)
    for item in created:
        group.AddItem(item)

    pcbnew.Refresh()
    return len(created)


def main():
    with open(IR_PATH) as f:
        ir = json.load(f)
    n = render_to_kicad(ir)
    if n:
        HW = ir["board"]["half_width"] * INCH_TO_MM
        HH = ir["board"]["half_height"] * INCH_TO_MM
        print(f"Placed {n} items, grouped as '{GROUP_NAME}'")
        print(f"Board {2*HW:.3f} x {2*HH:.3f} mm, center at "
              f"({ir['kicad_placement']['kicad_origin_x_mm']}, "
              f"{ir['kicad_placement']['kicad_origin_y_mm']}) mm")


main()
