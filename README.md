# Canopy Browser

Canopy is a macOS browser built on Chromium. The repository contains both the current Chromium-extension build and an experimental native CEF shell that lets Canopy own the whole window instead of layering a sidebar over Chromium's tab strip. Canopy does not use Electron.

## Workspace Features

- A dedicated left sidebar with tab-group-backed Spaces
- Up to 12 Favorites shared across Spaces
- Persistent pinned pages and folders inside each Space
- Today tabs with configurable Auto Archive and one-click restore
- `Cmd+T` Command Bar for tabs, Spaces, history, commands, URLs, and Google searches
- Sidebar-only, animated two-finger horizontal trackpad switching between Spaces
- Per-Space names, colors, and icons
- Air Traffic Control rules that route matching URLs into a chosen Space
- Peek popup windows and side-by-side window layout
- Playing-audio controls and Picture in Picture
- Visible-page captures and a Library for captures and archived tabs
- Space sharing as a clean, tracking-free link list
- Native Chromium profiles, extensions, passwords, downloads, permissions, history, and browser security

Some Arc features require a maintained Chromium fork or a hosted service rather than an extension. Canopy uses native Chromium profiles for true cookie isolation, side-by-side windows in place of a custom tab compositor, local link-list sharing instead of hosted share URLs, and does not claim cloud sync or AI features without a backend.

## Requirements

- Apple Silicon or Intel Mac
- Node.js 22+ and pnpm for checks
- Internet access for the first Chromium download
- Python 3.9-3.11, CMake 3.21+, and Xcode for the native CEF prototype

## Run

```bash
pnpm start
```

The first run downloads the pinned official Chromium snapshot into `~/Library/Caches/Canopy`. Later launches reuse it. Canopy opens `https://mystandrews.saac.qld.edu.au/` as its startup page.

Canopy places its extension panel on the left and disables Chromium's duplicate vertical-tab strip for this browser profile. Open the Canopy extension from Chromium's toolbar if the panel is closed. The sidebar contains Favorites, the current Space's pinned and Today tabs, the Space switcher, Library, creation controls, routing, and settings. New tabs open the Canopy Command Bar.

## Build The macOS App

```bash
pnpm build
open ~/Applications/Canopy.app
```

The local build is installed at `~/Applications/Canopy.app` and archived at `release/Canopy-macOS.zip`. The outer launcher preserves the untouched Chromium runtime so HTTPS and browser services keep their original behavior. Public distribution still requires Apple Developer ID signing and notarization.

## Native Chromium Shell Prototype

```bash
python3 -m pip install --user cmake
pnpm native:install
open ~/Applications/'Canopy Native.app'
```

The native prototype downloads the pinned official `cef-project` source and CEF ARM64 binary into `~/Library/Caches/Canopy/cef-project`. Its window is composed from CEF BrowserViews, so there is no stock Chromium tab bar. The left sidebar is permanently visible and each Space owns a live Chromium browser instance. Space names, order, active Space, and last URL persist in `~/Library/Application Support/Canopy Native/workspace.tsv`.

The first native milestone includes address/search navigation, back/forward/reload, a one-Space-per-gesture trackpad switcher, Space create/rename/delete, the St Andrew's home page, denied location/media prompts, and the Jim's Mowing compatibility workspace under **Settings > Advanced**. Jim's Mowing is loaded from `Contents/Resources/jims-game` inside the app; only multiplayer, account, and persistence traffic is sent to Railway.

The native build stages the game from the sibling `fpsshooterserver` checkout by default. Override either input when building elsewhere:

```bash
CANOPY_JIMS_SOURCE_DIR=/path/to/fpsshooterserver \
CANOPY_JIMS_SERVER_URL=wss://your-server.example/ \
pnpm native:install
```

It intentionally remains a prototype while full multi-tab, downloads, history, bookmarks, password UI, and browser-update plumbing are ported from Chromium.

## Checks

```bash
pnpm check
```

## Privacy And Internal Pages

Google geolocation is blocked by default through Chromium's site-content settings, so the site cannot repeatedly prompt. It can be changed under **Canopy Settings > Privacy**.

Canopy leaves Google Sync services disabled and does not need or embed Google API secrets. Normal Google search and websites work without them.

The Jim's Mowing multiplayer client is bundled in **Canopy Settings > Advanced** and connects to `wss://jimsmowingandlawncare.up.railway.app/`. The browser does not use or store the game database URL. Set `SERVE_WEB_CLIENT=0` on the Railway service only after a bundled build has been verified; this keeps health, admin, accounts, and multiplayer online while returning `404` for public game files.
