#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${CANOPY_RUNTIME_DIR:-$HOME/Library/Caches/Canopy}"
SOURCE_APP="$RUNTIME_DIR/Chromium.app"
OUTPUT_APP="${CANOPY_APP_PATH:-$HOME/Applications/Canopy.app}"
CONTENTS="$OUTPUT_APP/Contents"

"$ROOT/scripts/download-chromium.sh"
rm -rf "$OUTPUT_APP"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources" "$ROOT/release"
ditto "$SOURCE_APP" "$CONTENTS/Resources/Chromium.app"
ditto "$ROOT/extension" "$CONTENTS/Resources/canopy-extension"
cp "$ROOT/scripts/prepare-profile.sh" "$CONTENTS/Resources/prepare-profile.sh"
chmod +x "$CONTENTS/Resources/prepare-profile.sh"
cp "$CONTENTS/Resources/Chromium.app/Contents/Resources/app.icns" "$CONTENTS/Resources/Canopy.icns"

cat > "$CONTENTS/MacOS/Canopy" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

CONTENTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="$HOME/Library/Application Support/Canopy/Chromium"
HOME_PAGE="https://mystandrews.saac.qld.edu.au/"

"$CONTENTS/Resources/prepare-profile.sh" "$PROFILE_DIR"
export GOOGLE_API_KEY="no"
export GOOGLE_DEFAULT_CLIENT_ID="no"
export GOOGLE_DEFAULT_CLIENT_SECRET="no"
exec "$CONTENTS/Resources/Chromium.app/Contents/MacOS/Chromium" \
  "--user-data-dir=$PROFILE_DIR" \
  "--load-extension=$CONTENTS/Resources/canopy-extension" \
  --no-first-run \
  --no-default-browser-check \
  "$HOME_PAGE" \
  "$@"
LAUNCHER
chmod +x "$CONTENTS/MacOS/Canopy"

cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>Canopy</string>
  <key>CFBundleExecutable</key><string>Canopy</string>
  <key>CFBundleIconFile</key><string>Canopy</string>
  <key>CFBundleIdentifier</key><string>au.com.canopy.browser</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Canopy</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.2.0</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

xattr -cr "$OUTPUT_APP" 2>/dev/null || true
rm -f "$ROOT/release/Canopy-macOS.zip"
ditto -c -k --keepParent "$OUTPUT_APP" "$ROOT/release/Canopy-macOS.zip"
echo "Built $OUTPUT_APP"
echo "Packaged $ROOT/release/Canopy-macOS.zip"
