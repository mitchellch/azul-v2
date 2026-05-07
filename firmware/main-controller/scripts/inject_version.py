"""
PlatformIO pre-build script:
- Injects git SHA and dirty flag as -D compiler flags for version.h
- Renames the output binary to: azul-mc-YYYYMMDD-vX.Y.Z-<sha>[-dirty]
"""
import subprocess
import os
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

sha = get_git_sha()
dirty = is_git_dirty()
version = env.GetProjectOption("custom_fw_version", "0.0.0")
date = datetime.now().strftime("%Y%m%d")
dirty_suffix = "-dirty" if dirty else ""

env.Append(CPPDEFINES=[
    ("FW_GIT_SHA", f'\\"{sha}\\"'),
    ("FW_GIT_DIRTY", str(dirty)),
])

# Rename output binary: azul-mc-20260507-v0.1.0-abc1234[-dirty]
binary_name = f"azul-mc-{date}-v{version}-{sha}{dirty_suffix}"
env.Replace(PROGNAME=binary_name)

print(f"[version] {binary_name}")
