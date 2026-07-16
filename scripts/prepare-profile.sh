#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${1:?Usage: prepare-profile.sh <profile-directory>}"
PREFERENCES="$PROFILE_DIR/Default/Preferences"
MARKER="$PROFILE_DIR/.canopy-profile-v2"

if [[ -f "$MARKER" ]]; then
  exit 0
fi

mkdir -p "$(dirname "$PREFERENCES")"
if [[ ! -f "$PREFERENCES" ]]; then
  printf '%s\n' '{"vertical_tabs":{"collapsed_state":false,"enabled":true,"enabled_first_time":true,"uncollapsed_width":280}}' > "$PREFERENCES"
else
  if ! /usr/bin/plutil -replace vertical_tabs.enabled -bool true "$PREFERENCES" 2>/dev/null; then
    /usr/bin/plutil -insert vertical_tabs -json '{"collapsed_state":false,"enabled":true,"enabled_first_time":true,"uncollapsed_width":280}' "$PREFERENCES"
  fi
  /usr/bin/plutil -replace vertical_tabs.enabled_first_time -bool true "$PREFERENCES" 2>/dev/null \
    || /usr/bin/plutil -insert vertical_tabs.enabled_first_time -bool true "$PREFERENCES"
  /usr/bin/plutil -replace vertical_tabs.collapsed_state -bool false "$PREFERENCES" 2>/dev/null \
    || /usr/bin/plutil -insert vertical_tabs.collapsed_state -bool false "$PREFERENCES"
  /usr/bin/plutil -replace vertical_tabs.uncollapsed_width -integer 280 "$PREFERENCES" 2>/dev/null \
    || /usr/bin/plutil -insert vertical_tabs.uncollapsed_width -integer 280 "$PREFERENCES"
fi

touch "$MARKER"
