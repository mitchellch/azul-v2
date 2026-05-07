"""
PlatformIO pre-build script: injects git SHA and dirty flag into the build
as -D compiler flags, so version.h can pick them up without being modified.
"""
import subprocess
import os

Import("env")

def get_git_sha():
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return sha if sha else "unknown"
    except Exception:
        return "unknown"

def is_git_dirty():
    try:
        result = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return 1 if result else 0
    except Exception:
        return 0

sha = get_git_sha()
dirty = is_git_dirty()

env.Append(CPPDEFINES=[
    ("FW_GIT_SHA", f'\\"{sha}\\"'),
    ("FW_GIT_DIRTY", str(dirty)),
])

print(f"[version] {env.GetProjectOption('custom_fw_version', 'unknown')}-{sha}" + ("-dirty" if dirty else ""))
