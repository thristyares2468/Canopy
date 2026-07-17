#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${1:?Usage: prepare-profile.sh <profile-directory>}"
PREFERENCES="$PROFILE_DIR/Default/Preferences"
MARKER="$PROFILE_DIR/.canopy-profile-v3"

if [[ -f "$MARKER" ]]; then
  exit 0
fi

mkdir -p "$(dirname "$PREFERENCES")"
if [[ ! -f "$PREFERENCES" ]]; then
  printf '%s\n' '{"side_panel":{"is_right_aligned":false},"vertical_tabs":{"collapsed_state":true,"enabled":false,"enabled_first_time":true,"uncollapsed_width":280}}' > "$PREFERENCES"
else
  if ! /usr/bin/plutil -replace side_panel.is_right_aligned -bool false "$PREFERENCES" 2>/dev/null; then
    /usr/bin/plutil -insert side_panel -json '{"is_right_aligned":false}' "$PREFERENCES"
  fi
  if ! /usr/bin/plutil -replace vertical_tabs.enabled -bool false "$PREFERENCES" 2>/dev/null; then
    /usr/bin/plutil -insert vertical_tabs -json '{"collapsed_state":true,"enabled":false,"enabled_first_time":true,"uncollapsed_width":280}' "$PREFERENCES"
  fi
  /usr/bin/plutil -replace vertical_tabs.enabled_first_time -bool true "$PREFERENCES" 2>/dev/null \
    || /usr/bin/plutil -insert vertical_tabs.enabled_first_time -bool true "$PREFERENCES"
  /usr/bin/plutil -replace vertical_tabs.collapsed_state -bool true "$PREFERENCES" 2>/dev/null \
    || /usr/bin/plutil -insert vertical_tabs.collapsed_state -bool true "$PREFERENCES"
fi

touch "$MARKER"
