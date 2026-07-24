#!/usr/bin/env python3
"""
Apply LCSC part numbers and DNP flags to main-controller-v1.kicad_sch
from parts.yaml.

Idempotent: safe to re-run when parts.yaml changes.

For each schematic symbol instance:
  - if the ref maps to an SMT part in parts.yaml → set/update LCSC property
  - if the ref maps to a DNP part → set (dnp yes) on the instance
  - if the ref is not in parts.yaml → warn and skip (power flags etc.)

IMPORTANT: close the schematic in Eeschema before running. KiCad reads the
file once at open and writes on save — if it's open, your changes get
overwritten by the next Save.

Usage:
    python3 scripts/apply_lcsc_fields.py

Options:
    --dry-run    print what would change without writing
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(HERE)
SCH_PATH = os.path.join(PROJECT_DIR, "main-controller-v1.kicad_sch")
YAML_PATH = os.path.join(PROJECT_DIR, "parts.yaml")


def load_parts_yaml(path):
    """Minimal YAML parser for parts.yaml — avoids external deps.

    Handles only the structure we authored: top-level scalars, then
    'parts:' list of blocks with keys we care about.
    """
    with open(path) as f:
        raw = f.read()

    parts = []
    current = None
    in_parts_section = False
    for raw_line in raw.split("\n"):
        line = raw_line.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        stripped = line.strip()
        if stripped == "parts:":
            in_parts_section = True
            continue
        if not in_parts_section:
            continue
        if stripped.startswith("- refs:"):
            if current is not None:
                parts.append(current)
            current = {}
            _parse_kv(stripped[len("- "):], current)
        else:
            _parse_kv(stripped, current)
    if current is not None:
        parts.append(current)

    ref_map = {}
    for p in parts:
        for r in p.get("refs", []):
            ref_map[r] = p
    return ref_map


def _parse_kv(kv, target):
    """Parse a 'key: value' line into target dict, coercing types."""
    if ":" not in kv:
        return
    key, _, val = kv.partition(":")
    key = key.strip()
    val = val.strip()
    # strip trailing comment
    if val and val[0] not in "\"'[" and " #" in val:
        val = val[: val.index(" #")].rstrip()
    if val.startswith("[") and val.endswith("]"):
        items = [x.strip() for x in val[1:-1].split(",") if x.strip()]
        target[key] = items
    elif val.lower() == "true":
        target[key] = True
    elif val.lower() == "false":
        target[key] = False
    elif val.startswith('"') and val.endswith('"'):
        target[key] = val[1:-1]
    else:
        target[key] = val


def find_symbol_instances(text):
    """Yield (start, end, ref) for each schematic-level symbol instance.

    Symbol instances at the sheet level start at indent depth 1 (single tab).
    We identify them by the pattern '\\n\\t(symbol\\n' followed by lib_id.
    """
    for m in re.finditer(r"\n\t\(symbol\n\t\t\(lib_id ", text):
        start = m.start() + 1  # skip the leading \n
        depth = 0
        end = start
        for i in range(start, len(text)):
            c = text[i]
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        block = text[start:end]
        ref_m = re.search(r'\(property "Reference" "([^"]+)"', block)
        if ref_m:
            yield start, end, ref_m.group(1)


def patch_instance(block, part_info):
    """Return (new_block, actions[]) — LCSC field set/updated + dnp flag set."""
    actions = []
    new_block = block
    fate = part_info.get("fate", "smt")
    lcsc = part_info.get("lcsc")

    # 1. dnp flag: KiCad emits (dnp no) or (dnp yes) on each instance.
    want_dnp = "yes" if fate == "dnp" else "no"
    dnp_pattern = re.compile(r"(\(dnp )(yes|no)(\))")
    m = dnp_pattern.search(new_block)
    if m:
        current = m.group(2)
        if current != want_dnp:
            new_block = dnp_pattern.sub(rf"\g<1>{want_dnp}\g<3>", new_block, count=1)
            actions.append(f"dnp: {current} → {want_dnp}")
    else:
        actions.append(f"WARN: no (dnp ...) found — skipped dnp update")

    # 2. LCSC property: add if missing, update if present, only for SMT parts
    if fate == "smt" and lcsc:
        lcsc_pattern = re.compile(r'(\(property "LCSC" ")([^"]*)(")')
        m = lcsc_pattern.search(new_block)
        if m:
            current = m.group(2)
            if current != lcsc:
                new_block = lcsc_pattern.sub(rf"\g<1>{lcsc}\g<3>", new_block, count=1)
                actions.append(f"LCSC: {current} → {lcsc}")
        else:
            # Insert a new property block after the Datasheet property (if
            # present) or after Footprint. Match indentation of existing props.
            new_prop = (
                '\t\t(property "LCSC" "' + lcsc + '"\n'
                '\t\t\t(at 0 0 0)\n'
                '\t\t\t(hide yes)\n'
                '\t\t\t(effects\n'
                '\t\t\t\t(font\n'
                '\t\t\t\t\t(size 1.27 1.27)\n'
                '\t\t\t\t)\n'
                '\t\t\t)\n'
                '\t\t)\n'
            )
            # Find the end of the Datasheet property (preferred insertion point).
            # Datasheet block ends with its own close paren followed by newline+tab+tab.
            datasheet_re = re.compile(
                r'(\t\t\(property "Datasheet" "[^"]*".*?\n\t\t\))',
                re.DOTALL,
            )
            m2 = datasheet_re.search(new_block)
            if m2:
                insert_at = m2.end()
                new_block = new_block[:insert_at] + "\n" + new_prop.rstrip() + new_block[insert_at:]
                actions.append(f"LCSC: (new) = {lcsc}")
            else:
                # Fallback: insert after Footprint property.
                footprint_re = re.compile(
                    r'(\t\t\(property "Footprint" "[^"]*".*?\n\t\t\))',
                    re.DOTALL,
                )
                m3 = footprint_re.search(new_block)
                if m3:
                    insert_at = m3.end()
                    new_block = new_block[:insert_at] + "\n" + new_prop.rstrip() + new_block[insert_at:]
                    actions.append(f"LCSC: (new) = {lcsc}")
                else:
                    actions.append("WARN: could not find insertion point for LCSC field")

    return new_block, actions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="print planned changes without writing")
    args = ap.parse_args()

    ref_map = load_parts_yaml(YAML_PATH)
    print(f"Loaded {len(ref_map)} refs from parts.yaml")

    with open(SCH_PATH) as f:
        text = f.read()

    instances = list(find_symbol_instances(text))
    print(f"Found {len(instances)} schematic-level symbol instances")

    # Process from END to START so earlier offsets stay valid as we splice.
    changes = []
    for start, end, ref in reversed(instances):
        # Skip power flags and other synthetic refs.
        if ref.startswith("#") or not any(c.isdigit() for c in ref):
            continue
        if ref not in ref_map:
            print(f"  {ref}: not in parts.yaml — skipping")
            continue
        block = text[start:end]
        new_block, actions = patch_instance(block, ref_map[ref])
        if actions:
            changes.append((ref, actions))
        if new_block != block:
            text = text[:start] + new_block + text[end:]

    changes.reverse()
    print(f"\n=== Changes ({len(changes)} refs touched) ===")
    for ref, actions in changes:
        for a in actions:
            print(f"  {ref}: {a}")

    if args.dry_run:
        print("\n(dry-run — no file written)")
        return

    with open(SCH_PATH, "w") as f:
        f.write(text)
    print(f"\nWrote {SCH_PATH}")


if __name__ == "__main__":
    main()
