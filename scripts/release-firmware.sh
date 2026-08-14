#!/usr/bin/env bash
# Upload a freshly-built firmware .bin to the server as a FirmwareRelease.
#
# Usage:
#   scripts/release-firmware.sh [version] [target]
#
# If version is omitted, the newest built .bin in .pio/build/esp32-s3 is used
# and version is parsed from the filename (azul-mc-vX.Y.Z-...).
#
# Env:
#   API_URL — defaults to http://localhost:3000/api
#   ADMIN_TOKEN — required. M2M access token; get one from Auth0 dashboard
#                 or via `curl` against the /oauth/token endpoint (see
#                 scripts/postman for the exact call).

set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/api}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN env var required (M2M access token)}"

BUILD_DIR="$(git rev-parse --show-toplevel)/firmware/main-controller/.pio/build/esp32-s3"
TARGET="${2:-main-controller}"

BIN=$(ls -t "$BUILD_DIR"/azul-mc-*.bin 2>/dev/null | head -1 || true)
if [[ -z "$BIN" ]]; then
  echo "No firmware binary found in $BUILD_DIR. Run 'pio run' first." >&2
  exit 1
fi

if [[ -n "${1:-}" ]]; then
  VERSION="$1"
else
  # Extract "0.2.1" from either "azul-mc-v0.2.1-<sha>[-dirty].bin" or
  # "azul-mc-YYYYMMDD-v0.2.1-<sha>[-dirty].bin". Anything is allowed
  # between "azul-mc-" and "v<semver>".
  VERSION=$(basename "$BIN" | sed -E 's/^azul-mc-.*v([0-9]+\.[0-9]+\.[0-9]+).*\.bin$/\1/')
  if [[ "$VERSION" == "$(basename "$BIN")" ]]; then
    echo "Could not parse version from $(basename "$BIN"). Pass explicitly." >&2
    exit 1
  fi
fi

SIZE=$(stat -f %z "$BIN" 2>/dev/null || stat -c %s "$BIN")
echo "Uploading $BIN ($SIZE bytes) as $TARGET@$VERSION to $API_URL"

curl -fsS -X POST "$API_URL/admin/firmware" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@$BIN" \
  -F "version=$VERSION" \
  -F "target=$TARGET" \
  | tee /dev/stderr | grep -q '"sha256"'

echo
echo "Uploaded. Trigger an install with:"
echo "  curl -X POST -H \"Authorization: Bearer \$ADMIN_TOKEN\" -H 'Content-Type: application/json' \\"
echo "       -d '{\"version\":\"$VERSION\"}' $API_URL/devices/<mac>/ota"
