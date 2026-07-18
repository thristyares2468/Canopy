#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CEF_COMMIT="$(tr -d '[:space:]' < "$ROOT_DIR/native/cef-project.commit")"
CEF_PROJECT_DIR="${CANOPY_CEF_PROJECT_DIR:-$HOME/Library/Caches/Canopy/cef-project}"
CEF_BUILD_DIR="$CEF_PROJECT_DIR/build-canopy"
CANOPY_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/native/version.txt")"
CANOPY_BUILD_NUMBER="$(tr -d '[:space:]' < "$ROOT_DIR/native/build-number.txt")"
CANOPY_SPARKLE_DIR="$($ROOT_DIR/scripts/download-sparkle.sh)"
INSTALL_APP=0
STAGING_DIR=""

if [[ "${1:-}" == "--install" ]]; then
  INSTALL_APP=1
fi

cleanup() {
  [[ -z "$STAGING_DIR" ]] || rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

if command -v cmake >/dev/null 2>&1; then
  CMAKE_BIN="$(command -v cmake)"
elif [[ -x "$HOME/Library/Python/3.9/bin/cmake" ]]; then
  CMAKE_BIN="$HOME/Library/Python/3.9/bin/cmake"
else
  echo "CMake 3.21 or newer is required."
  echo "Install it with: python3 -m pip install --user cmake"
  exit 1
fi

mkdir -p "$(dirname "$CEF_PROJECT_DIR")"
if [[ ! -d "$CEF_PROJECT_DIR/.git" ]]; then
  git clone https://github.com/chromiumembedded/cef-project.git "$CEF_PROJECT_DIR"
fi

CURRENT_COMMIT="$(git -C "$CEF_PROJECT_DIR" rev-parse HEAD)"
if [[ "$CURRENT_COMMIT" != "$CEF_COMMIT" ]]; then
  if [[ -n "$(git -C "$CEF_PROJECT_DIR" status --porcelain)" ]]; then
    echo "CEF cache has local changes and is not at the pinned commit."
    echo "Cache: $CEF_PROJECT_DIR"
    exit 1
  fi
  git -C "$CEF_PROJECT_DIR" fetch --depth 1 origin "$CEF_COMMIT"
  git -C "$CEF_PROJECT_DIR" switch --detach "$CEF_COMMIT"
fi

mkdir -p "$CEF_PROJECT_DIR/examples/canopy"
ditto "$ROOT_DIR/native/cef" "$CEF_PROJECT_DIR/examples/canopy"
CANOPY_JIMS_SOURCE_DIR="${CANOPY_JIMS_SOURCE_DIR:-$ROOT_DIR/../fpsshooterserver}" \
CANOPY_JIMS_SERVER_URL="${CANOPY_JIMS_SERVER_URL:-wss://jimsmowingandlawncare.up.railway.app/}" \
  "$ROOT_DIR/scripts/stage-jims-client.sh" \
  "$CEF_PROJECT_DIR/examples/canopy/resources/jims-game"

if ! grep -q '^add_subdirectory(canopy)$' "$CEF_PROJECT_DIR/examples/CMakeLists.txt"; then
  printf '\n# Canopy native browser shell.\nadd_subdirectory(canopy)\n' >> \
    "$CEF_PROJECT_DIR/examples/CMakeLists.txt"
fi

configure_cef() {
  env PYTHON_EXECUTABLE=/usr/bin/python3 "$CMAKE_BIN" \
    -S "$CEF_PROJECT_DIR" \
    -B "$CEF_BUILD_DIR" \
    -G Xcode \
    -DPROJECT_ARCH=arm64 \
    -DWITH_EXAMPLES=On \
    -DCANOPY_VERSION="$CANOPY_VERSION" \
    -DCANOPY_BUILD_NUMBER="$CANOPY_BUILD_NUMBER" \
    -DCANOPY_SPARKLE_DIR="$CANOPY_SPARKLE_DIR"
}

if ! configure_cef; then
  echo "CEF configuration failed. Clearing an incomplete binary download and retrying once."
  find "$CEF_PROJECT_DIR/third_party/cef" -maxdepth 1 \
    \( -name 'cef_binary_*_macosarm64' -o -name 'cef_binary_*_macosarm64.tar.bz2' \) \
    -exec rm -rf {} +
  rm -rf "$CEF_BUILD_DIR"
  configure_cef
fi

rm -rf "$CEF_BUILD_DIR/Release/Canopy.app"
"$CMAKE_BIN" --build "$CEF_BUILD_DIR" \
  --config Release \
  --target Canopy

mkdir -p "$ROOT_DIR/dist"
STAGING_DIR="$(mktemp -d /tmp/canopy-native.XXXXXX)"
STAGING_APP="$STAGING_DIR/Canopy Native.app"
ditto "$CEF_BUILD_DIR/Release/Canopy.app" "$STAGING_APP"
"$ROOT_DIR/scripts/sign-native-app.sh" "$STAGING_APP"

rm -rf "$ROOT_DIR/dist/Canopy Native.app"
ditto "$STAGING_APP" "$ROOT_DIR/dist/Canopy Native.app"

echo "Canopy $CANOPY_VERSION ($CANOPY_BUILD_NUMBER)"

if [[ "$INSTALL_APP" == "1" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Canopy Native.app"
  ditto "$STAGING_APP" \
        "$HOME/Applications/Canopy Native.app"
  /usr/bin/codesign --verify --deep --strict --verbose=2 \
    "$HOME/Applications/Canopy Native.app"
  echo "Installed: $HOME/Applications/Canopy Native.app"
else
  echo "Built: $ROOT_DIR/dist/Canopy Native.app"
fi
