#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="$ROOT_DIR/dist/Canopy Native.app"

if [[ ! -d "$APP_PATH" ]]; then
  "$ROOT_DIR/scripts/build-native-cef.sh"
fi

open "$APP_PATH"
