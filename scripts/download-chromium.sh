#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REVISION="${CANOPY_CHROMIUM_REVISION:-$(tr -d '[:space:]' < "$ROOT/chromium.version")}"
RUNTIME_DIR="${CANOPY_RUNTIME_DIR:-$HOME/Library/Caches/Canopy}"
APP_DIR="$RUNTIME_DIR/Chromium.app"
REVISION_FILE="$RUNTIME_DIR/.chromium-revision"

case "$(uname -m)" in
  arm64) SNAPSHOT_PLATFORM="Mac_Arm" ;;
  x86_64) SNAPSHOT_PLATFORM="Mac" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ -x "$APP_DIR/Contents/MacOS/Chromium" ]] \
  && [[ "$(cat "$REVISION_FILE" 2>/dev/null || true)" == "$REVISION" ]]; then
  echo "Chromium revision $REVISION is ready."
  exit 0
fi

mkdir -p "$RUNTIME_DIR/downloads"
ARCHIVE="$RUNTIME_DIR/downloads/chromium-$SNAPSHOT_PLATFORM-$REVISION.zip"
URL="https://commondatastorage.googleapis.com/chromium-browser-snapshots/$SNAPSHOT_PLATFORM/$REVISION/chrome-mac.zip"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Downloading official Chromium snapshot $REVISION..."
  curl --fail --location --retry 3 --progress-bar "$URL" --output "$ARCHIVE"
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/canopy-chromium.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
ditto -x -k "$ARCHIVE" "$TEMP_DIR"
SOURCE_APP="$(find "$TEMP_DIR" -type d -name Chromium.app -print -quit)"

if [[ -z "$SOURCE_APP" ]]; then
  echo "The Chromium archive did not contain Chromium.app." >&2
  exit 1
fi

rm -rf "$APP_DIR"
ditto "$SOURCE_APP" "$APP_DIR"
xattr -cr "$APP_DIR" 2>/dev/null || true
printf '%s\n' "$REVISION" > "$REVISION_FILE"
echo "Installed Chromium revision $REVISION at $APP_DIR"
