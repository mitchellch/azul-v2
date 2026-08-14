"""
PlatformIO pre-build script:
- Injects git SHA and dirty flag as -D compiler flags for version.h
- Reads the version out of include/version.h (single source of truth)
- Renames the output binary to: azul-mc-YYYYMMDD-vX.Y.Z-<sha>[-dirty]
"""
import subprocess
import os
import re
from datetime import datetime

Import("env")

PROJECT_DIR = env.subst("$PROJECT_DIR")

def get_git_sha():
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=PROJECT_DIR,
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return sha if sha else "unknown"
    except Exception:
        return "unknown"

def is_git_dirty():
    try:
        result = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=PROJECT_DIR,
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return 1 if result else 0
    except Exception:
        return 0

def get_version_from_header():
    header_path = os.path.join(PROJECT_DIR, "include", "version.h")
    with open(header_path) as f:
        content = f.read()
    parts = []
    for name in ("FW_VERSION_MAJOR", "FW_VERSION_MINOR", "FW_VERSION_PATCH"):
        m = re.search(rf"#define\s+{name}\s+(\d+)", content)
        if not m:
            raise RuntimeError(f"{name} not found in {header_path}")
        parts.append(m.group(1))
    return ".".join(parts)

sha = get_git_sha()
dirty = is_git_dirty()
version = get_version_from_header()
date = datetime.now().strftime("%Y%m%d")
dirty_suffix = "-dirty" if dirty else ""
debug_suffix = "-debug" if "DEBUG_BUILD" in [d[0] if isinstance(d, tuple) else d for d in env.get("CPPDEFINES", [])] else ""

env.Append(CPPDEFINES=[
    ("FW_GIT_SHA", f'\\"{sha}\\"'),
    ("FW_GIT_DIRTY", str(dirty)),
])

# Rename output binary: azul-mc-20260507-v0.1.0-abc1234[-dirty][-debug]
binary_name = f"azul-mc-{date}-v{version}-{sha}{dirty_suffix}{debug_suffix}"
env.Replace(PROGNAME=binary_name)

print(f"[version] {binary_name}")
