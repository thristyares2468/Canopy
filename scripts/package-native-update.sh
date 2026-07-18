#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/native/version.txt")"
BUILD_NUMBER="$(tr -d '[:space:]' < "$ROOT_DIR/native/build-number.txt")"
APP_PATH="$ROOT_DIR/dist/Canopy Native.app"
OUTPUT_DIR="$ROOT_DIR/release/native-updates"
ARCHIVE_NAME="Canopy-Native-$VERSION.zip"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
SPARKLE_DIR="$($ROOT_DIR/scripts/download-sparkle.sh)"
REPOSITORY_URL="https://github.com/thristyares2468/Canopy"
STAGING_DIR=""

cleanup() {
  [[ -z "$STAGING_DIR" ]] || rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

if [[ ! -d "$APP_PATH" ]]; then
  echo "Build the native app first with: pnpm native:build" >&2
  exit 1
fi

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
APP_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Contents/Info.plist")"
if [[ "$APP_VERSION" != "$VERSION" || "$APP_BUILD" != "$BUILD_NUMBER" ]]; then
  echo "Built app is $APP_VERSION ($APP_BUILD), expected $VERSION ($BUILD_NUMBER)." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR" "$ROOT_DIR/updates"
STAGING_DIR="$(mktemp -d /tmp/canopy-update.XXXXXX)"
STAGING_APP="$STAGING_DIR/Canopy Native.app"
SIGNING_KEY_FILE="$STAGING_DIR/sparkle-signing-key"
ditto "$APP_PATH" "$STAGING_APP"
"$ROOT_DIR/scripts/sign-native-app.sh" "$STAGING_APP"

rm -f "$ARCHIVE_PATH"
ditto -c -k --sequesterRsrc --keepParent "$STAGING_APP" "$ARCHIVE_PATH"

cat > "$OUTPUT_DIR/Canopy-Native-$VERSION.md" <<NOTES
## Canopy $VERSION

- Restores direct mouse interaction for tab and Space context menus.
- Reverses two-finger Space navigation to match the requested direction.
- Adds signed in-app update checks powered by Sparkle.
NOTES

if [[ -f "$ROOT_DIR/updates/appcast.xml" ]]; then
  cp "$ROOT_DIR/updates/appcast.xml" "$OUTPUT_DIR/appcast.xml"
fi

"$SPARKLE_DIR/bin/generate_keys" --account Canopy \
  -x "$SIGNING_KEY_FILE" >/dev/null
"$SPARKLE_DIR/bin/generate_appcast" \
  --ed-key-file "$SIGNING_KEY_FILE" \
  --download-url-prefix "$REPOSITORY_URL/releases/download/v$VERSION/" \
  --link "$REPOSITORY_URL/releases/tag/v$VERSION" \
  --embed-release-notes \
  "$OUTPUT_DIR"
rm -P "$SIGNING_KEY_FILE" 2>/dev/null || rm -f "$SIGNING_KEY_FILE"

cp "$OUTPUT_DIR/appcast.xml" "$ROOT_DIR/updates/appcast.xml"
echo "Packaged: $ARCHIVE_PATH"
echo "Updated:  $ROOT_DIR/updates/appcast.xml"
