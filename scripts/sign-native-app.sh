#!/bin/bash
set -euo pipefail

APP_PATH="${1:?Usage: sign-native-app.sh /path/to/Canopy.app}"
IDENTITY="${CANOPY_CODESIGN_IDENTITY:--}"
SIGN_ARGUMENTS=(--force --sign "$IDENTITY")

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi
if [[ "$IDENTITY" != "-" ]]; then
  SIGN_ARGUMENTS+=(--options runtime --timestamp)
fi

# Files under Documents may acquire Finder/file-provider metadata that macOS
# refuses to seal. Work from a temporary staging directory for releases.
find "$APP_PATH" \( -type f -o -type d \) -exec xattr -c {} +

SPARKLE_FRAMEWORK="$APP_PATH/Contents/Frameworks/Sparkle.framework"
CEF_FRAMEWORK="$APP_PATH/Contents/Frameworks/Chromium Embedded Framework.framework"
/usr/bin/codesign --verify --strict "$SPARKLE_FRAMEWORK"
/usr/bin/codesign "${SIGN_ARGUMENTS[@]}" "$CEF_FRAMEWORK"

for helper in "$APP_PATH"/Contents/Frameworks/Canopy\ Helper*.app; do
  /usr/bin/codesign "${SIGN_ARGUMENTS[@]}" "$helper"
done

/usr/bin/codesign "${SIGN_ARGUMENTS[@]}" "$APP_PATH"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP_PATH"
