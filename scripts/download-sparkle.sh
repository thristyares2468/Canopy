#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/native/sparkle.version")"
EXPECTED_SHA="$(tr -d '[:space:]' < "$ROOT_DIR/native/sparkle.sha256")"
CACHE_DIR="${CANOPY_SPARKLE_CACHE_DIR:-$HOME/Library/Caches/Canopy}"
ARCHIVE="$CACHE_DIR/Sparkle-$VERSION.tar.xz"
SPARKLE_DIR="$CACHE_DIR/Sparkle-$VERSION"
URL="https://github.com/sparkle-project/Sparkle/releases/download/$VERSION/Sparkle-$VERSION.tar.xz"

mkdir -p "$CACHE_DIR"
if [[ ! -f "$ARCHIVE" ]]; then
  echo "Downloading Sparkle $VERSION..." >&2
  curl -fsSL "$URL" -o "$ARCHIVE.tmp"
  mv "$ARCHIVE.tmp" "$ARCHIVE"
fi

ACTUAL_SHA="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Sparkle archive checksum mismatch." >&2
  echo "Expected: $EXPECTED_SHA" >&2
  echo "Actual:   $ACTUAL_SHA" >&2
  exit 1
fi

if [[ ! -x "$SPARKLE_DIR/bin/generate_appcast" ]]; then
  rm -rf "$SPARKLE_DIR"
  mkdir -p "$SPARKLE_DIR"
  tar -xJf "$ARCHIVE" -C "$SPARKLE_DIR"
fi

printf '%s\n' "$SPARKLE_DIR"
