#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_PAGE="https://mystandrews.saac.qld.edu.au/"
PROFILE_DIR="${CANOPY_PROFILE_DIR:-$HOME/Library/Application Support/Canopy/Chromium}"
RUNTIME_DIR="${CANOPY_RUNTIME_DIR:-$HOME/Library/Caches/Canopy}"

"$ROOT/scripts/download-chromium.sh"
"$ROOT/scripts/prepare-profile.sh" "$PROFILE_DIR"
export GOOGLE_API_KEY="no"
export GOOGLE_DEFAULT_CLIENT_ID="no"
export GOOGLE_DEFAULT_CLIENT_SECRET="no"

exec "$RUNTIME_DIR/Chromium.app/Contents/MacOS/Chromium" \
  "--user-data-dir=$PROFILE_DIR" \
  "--load-extension=$ROOT/extension" \
  --no-first-run \
  --no-default-browser-check \
  --disable-component-update \
  "$HOME_PAGE" \
  "$@"
