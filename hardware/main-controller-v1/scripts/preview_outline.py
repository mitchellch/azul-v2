#!/usr/bin/env python3
"""
Preview the Polycase WP-24BF*15 PCB outline from board_ir.json.

Renders in the IR's native units (inches) with origin (0,0) at board center.
Walks the outline once around the perimeter and asserts no gaps between segments.

Concave scoop corner geometry (per corner, walking TR clockwise):
    top edge ends at (+2.826, +2.218) — sharp convex tab corner
    vertical wall drops from Y=+2.218 to Y=+1.790 at X=+2.826 (length 0.428")
    R.300 concave quarter-arc, center (+3.126, +1.790), sweeps 180°→270°
    horizontal floor runs from X=+3.126 to X=+3.202 at Y=+1.490 (length 0.076")
    right edge begins at (+3.202, +1.490) — sharp convex tab corner

R.076 fillets (2 per corner × 4 = 8X callout) at the two sharp convex tab
corners are NOT rendered here — sharp joins only.

Usage:
    python3 preview_outline.py
    open board_preview.png
"""

import json
import math
import os

# matplotlib is imported inside render() so this module can also be imported
# from KiCad's Python console (which doesn't have matplotlib).

HERE = os.path.dirname(os.path.abspath(__file__))
IR_PATH = os.path.join(HERE, "board_ir.json")
OUT_PATH = os.path.join(HERE, "board_preview.png")


def outline_segments(ir):
    """Emit outline segments clockwise (math Y-up coords) starting at TL of top edge."""
    board = ir["board"]
    corners = ir["corners"]
    notch = ir["notches"]

    HW = board["half_width"]                    # 3.202
    HH = board["half_height"]                   # 2.218
    ex = corners["top_edge_end_x"]              # 2.826 — top/bottom edge ends here
    ey = corners["side_edge_start_y"]           # 1.490 — right/left edge Y limit
    r  = corners["arc_radius"]                  # 0.300 — concave scoop radius
    # Arc center for a concave scoop is OUTSIDE the board, inside the scoop
    # cavity. For TR: center at (+ex + r, +ey + r) = (+3.126, +1.790).
    ax = ex + r                                 # 3.126 — arc-center X (positive quadrant)
    ay = ey + r                                 # 1.790 — arc-center Y (positive quadrant)
    nw = notch["width"]
    nd = notch["depth"]

    segs = []

    def line(x1, y1, x2, y2):
        segs.append(("line", x1, y1, x2, y2))

    def arc(cx, cy, radius, s_deg, e_deg):
        segs.append(("arc", cx, cy, radius, s_deg, e_deg))

    def horiz_edge_with_notches(y, x_start, x_end, centers, direction, custom=None):
        """direction = -1 for top (notch cuts down), +1 for bottom (notch cuts up).

        custom: optional list of (center, width, depth) tuples that override the
        default (width=nw, depth=nd) for specific centers.
        """
        going_right = x_end > x_start
        overrides = {c: (w, d) for (c, w, d) in (custom or [])}
        centers = sorted(centers) if going_right else sorted(centers, reverse=True)
        cursor = x_start
        for c in centers:
            w, d = overrides.get(c, (nw, nd))
            n_s, n_e = (c - w/2, c + w/2) if going_right else (c + w/2, c - w/2)
            line(cursor, y, n_s, y)
            notch_y = y + d * direction
            line(n_s, y, n_s, notch_y)
            line(n_s, notch_y, n_e, notch_y)
            line(n_e, notch_y, n_e, y)
            cursor = n_e
        line(cursor, y, x_end, y)

    def vert_edge_with_notches(x, y_start, y_end, centers, direction):
        """direction = -1 for right (notch cuts left), +1 for left (notch cuts right)."""
        going_up = y_end > y_start
        centers = sorted(centers) if going_up else sorted(centers, reverse=True)
        cursor = y_start
        for c in centers:
            n_s, n_e = (c - nw/2, c + nw/2) if going_up else (c + nw/2, c - nw/2)
            line(x, cursor, x, n_s)
            notch_x = x + nd * direction
            line(x, n_s, notch_x, n_s)
            line(notch_x, n_s, notch_x, n_e)
            line(notch_x, n_e, x, n_e)
            cursor = n_e
        line(x, cursor, x, y_end)

    # TOP edge: (-ex, +HH) → (+ex, +HH), notches cut down (direction = -1).
    # Antenna notch (if present) replaces the leftmost case-rib notch:
    # it's centered at the antenna slot's midpoint and is wider + deeper.
    top_centers = list(notch["top_x_centers"])
    custom_top = None
    ant = ir.get("antenna_notch")
    if ant:
        a_left = ant["left_x"]
        a_w = ant["x_span"]
        a_d = ant["y_depth"]
        a_center = a_left + a_w / 2.0
        a_min, a_max = a_left, a_left + a_w
        # Drop any standard case-rib notch that would overlap the antenna notch.
        top_centers = [c for c in top_centers
                       if (c + nw/2) <= a_min or (c - nw/2) >= a_max]
        top_centers.append(a_center)
        custom_top = [(a_center, a_w, a_d)]
    horiz_edge_with_notches(+HH, -ex, +ex, top_centers, -1, custom=custom_top)

    # TR concave scoop: wall down → arc → floor right
    line(+ex, +HH, +ex, +ay)                  # (2.826, 2.218) → (2.826, 1.790)
    arc(+ax, +ay, r, 180, 270)                # center (3.126, 1.790), 180°→270°
    line(+ax, +ey, +HW, +ey)                  # (3.126, 1.490) → (3.202, 1.490)

    # RIGHT edge: (+HW, +ey) → (+HW, -ey), notches cut left (direction = -1)
    vert_edge_with_notches(+HW, +ey, -ey, notch["right_y_centers"], -1)

    # BR concave scoop: floor left → arc → wall down
    line(+HW, -ey, +ax, -ey)                  # (3.202, -1.490) → (3.126, -1.490)
    arc(+ax, -ay, r, 90, 180)                 # center (3.126, -1.790), 90°→180°
    line(+ex, -ay, +ex, -HH)                  # (2.826, -1.790) → (2.826, -2.218)

    # BOTTOM edge: (+ex, -HH) → (-ex, -HH), notches cut up (direction = +1)
    horiz_edge_with_notches(-HH, +ex, -ex, notch["bottom_x_centers"], +1)

    # BL concave scoop: wall up → arc → floor left
    line(-ex, -HH, -ex, -ay)                  # (-2.826, -2.218) → (-2.826, -1.790)
    arc(-ax, -ay, r, 0, 90)                   # center (-3.126, -1.790), 0°→90°
    line(-ax, -ey, -HW, -ey)                  # (-3.126, -1.490) → (-3.202, -1.490)

    # LEFT edge: (-HW, -ey) → (-HW, +ey), notches cut right (direction = +1)
    vert_edge_with_notches(-HW, -ey, +ey, notch["left_y_centers"], +1)

    # TL concave scoop: floor right → arc → wall up
    line(-HW, +ey, -ax, +ey)                  # (-3.202, 1.490) → (-3.126, 1.490)
    arc(-ax, +ay, r, 270, 360)                # center (-3.126, 1.790), 270°→360°
    line(-ex, +ay, -ex, +HH)                  # (-2.826, 1.790) → (-2.826, 2.218)

    return segs


def check_closure(segs):
    def start_of(seg):
        if seg[0] == "line":
            return seg[1], seg[2]
        _, cx, cy, radius, s, e = seg
        return cx + radius * math.cos(math.radians(s)), cy + radius * math.sin(math.radians(s))

    def end_of(seg):
        if seg[0] == "line":
            return seg[3], seg[4]
        _, cx, cy, radius, s, e = seg
        return cx + radius * math.cos(math.radians(e)), cy + radius * math.sin(math.radians(e))

    prev_end = None
    gaps = []
    for i, seg in enumerate(segs):
        s = start_of(seg)
        e = end_of(seg)
        if prev_end is not None:
            gap = math.hypot(s[0] - prev_end[0], s[1] - prev_end[1])
            if gap > 0.001:
                gaps.append((i, prev_end, s, gap))
        prev_end = e
    closure = math.hypot(start_of(segs[0])[0] - end_of(segs[-1])[0],
                         start_of(segs[0])[1] - end_of(segs[-1])[1])
    return gaps, closure


def render(ir, segs, out_path):
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches

    fig, ax = plt.subplots(figsize=(12, 9))
    for seg in segs:
        if seg[0] == "line":
            _, x1, y1, x2, y2 = seg
            ax.plot([x1, x2], [y1, y2], "k-", linewidth=1.0)
        else:
            _, cx, cy, radius, s_deg, e_deg = seg
            t1, t2 = min(s_deg, e_deg), max(s_deg, e_deg)
            ax.add_patch(patches.Arc((cx, cy), 2*radius, 2*radius,
                                     angle=0, theta1=t1, theta2=t2,
                                     linewidth=1.0, color="k"))
    for h in ir["mounting_holes"]["positions"]:
        d = ir["mounting_holes"]["diameter"]
        ax.add_patch(patches.Circle((h["x"], h["y"]), d/2, fill=False, color="red", linewidth=1.0))
        ax.plot(h["x"], h["y"], "r+", markersize=8)
    ax.plot(0, 0, "b+", markersize=14)
    HW, HH = ir["board"]["half_width"], ir["board"]["half_height"]
    ax.set_aspect("equal")
    margin = 0.3
    ax.set_xlim(-HW - margin, +HW + margin)
    ax.set_ylim(-HH - margin, +HH + margin)
    ax.set_title(f"WP-24BF*15 PCB outline — {2*HW:.3f} x {2*HH:.3f} inch (origin at center)")
    ax.grid(True, alpha=0.3)
    ax.set_xlabel("X (inch)")
    ax.set_ylabel("Y (inch)")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    print(f"Wrote {out_path}")


def main():
    with open(IR_PATH) as f:
        ir = json.load(f)
    segs = outline_segments(ir)
    gaps, closure = check_closure(segs)
    if gaps:
        print(f"WARN: {len(gaps)} segment gap(s):")
        for (i, pe, s, g) in gaps[:8]:
            print(f"  seg {i}: prev_end={pe} start={s} gap={g:.4f}")
    else:
        print(f"OK: {len(segs)} segments connect end-to-end")
    print(f"Closure gap (last→first): {closure:.4f}")
    render(ir, segs, OUT_PATH)


if __name__ == "__main__":
    main()
