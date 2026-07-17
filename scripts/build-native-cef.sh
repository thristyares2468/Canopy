#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CEF_COMMIT="$(tr -d '[:space:]' < "$ROOT_DIR/native/cef-project.commit")"
CEF_PROJECT_DIR="${CANOPY_CEF_PROJECT_DIR:-$HOME/Library/Caches/Canopy/cef-project}"
CEF_BUILD_DIR="$CEF_PROJECT_DIR/build-canopy"
INSTALL_APP=0

if [[ "${1:-}" == "--install" ]]; then
  INSTALL_APP=1
fi

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
    -DWITH_EXAMPLES=On
}

if ! configure_cef; then
  echo "CEF configuration failed. Clearing an incomplete binary download and retrying once."
  find "$CEF_PROJECT_DIR/third_party/cef" -maxdepth 1 \
    \( -name 'cef_binary_*_macosarm64' -o -name 'cef_binary_*_macosarm64.tar.bz2' \) \
    -exec rm -rf {} +
  rm -rf "$CEF_BUILD_DIR"
  configure_cef
fi

"$CMAKE_BIN" --build "$CEF_BUILD_DIR" \
  --config Release \
  --target Canopy

mkdir -p "$ROOT_DIR/dist"
rm -rf "$ROOT_DIR/dist/Canopy Native.app"
ditto "$CEF_BUILD_DIR/Release/Canopy.app" "$ROOT_DIR/dist/Canopy Native.app"
xattr -c "$ROOT_DIR/dist/Canopy Native.app" 2>/dev/null || true

if [[ "$INSTALL_APP" == "1" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Canopy Native.app"
  ditto "$ROOT_DIR/dist/Canopy Native.app" \
        "$HOME/Applications/Canopy Native.app"
  xattr -c "$HOME/Applications/Canopy Native.app" 2>/dev/null || true
  echo "Installed: $HOME/Applications/Canopy Native.app"
else
  echo "Built: $ROOT_DIR/dist/Canopy Native.app"
fi
