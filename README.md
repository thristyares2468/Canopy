# Canopy Browser

Canopy is a macOS browser built on Chromium. The repository contains both the current Chromium-extension build and an experimental native CEF shell that lets Canopy own the whole window instead of layering a sidebar over Chromium's tab strip. Canopy does not use Electron.

## Workspace Features

- A dedicated left sidebar with tab-group-backed Spaces
- Up to 12 Favorites shared across Spaces
- Persistent pinned pages and folders inside each Space
- Today tabs with configurable Auto Archive and one-click restore
- `Cmd+T` Command Bar for tabs, Spaces, history, commands, URLs, and Google searches
- Sidebar-only, one-Space-per-gesture horizontal trackpad switching between Spaces
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

The native prototype downloads the pinned official `cef-project` source and CEF ARM64 binary into `~/Library/Caches/Canopy/cef-project`. Its window is composed from CEF BrowserViews, so there is no stock Chromium tab bar. The left sidebar is permanently visible and every Space owns a persistent tab collection that loads on demand. Spaces, tabs, pinned tabs, global Favorites, closed-tab recovery, and ordering persist in `~/Library/Application Support/Canopy Native/workspace.tsv`.

The native shell includes an address Command menu, back/forward/reload, multi-tab Spaces, drag reordering, a one-Space-per-gesture trackpad switcher, Space create/edit/delete, global Favorites, pinned tabs, history, downloads, find-on-page, page zoom, printing, keyboard navigation, popup-to-tab routing, persistent closed-tab recovery, and signed in-app updates. Location, camera, and microphone prompts are denied by default, while browsing data can be cleared from Canopy Settings. The Jim's Mowing compatibility workspace remains under **Settings > Advanced**; it is loaded from `Contents/Resources/jims-game` inside the app, and only multiplayer, account, and persistence traffic is sent to Railway.

The native build stages the game from the sibling `fpsshooterserver` checkout by default. Override either input when building elsewhere:

```bash
CANOPY_JIMS_SOURCE_DIR=/path/to/fpsshooterserver \
CANOPY_JIMS_SERVER_URL=wss://your-server.example/ \
CANOPY_JIMS_API_KEY=your-canopy-client-key \
pnpm native:install
```

For local builds, the client key can instead be stored in the git-ignored
`.canopy-jims-api-key` file at the repository root. Set the same value as the
Railway service variable `CANOPY_CLIENT_API_KEY`. When that server variable is
present, WebSocket connections without the matching Canopy credential are
rejected before the game login flow begins. This is an app-access gate, not a
replacement for player account authentication, and a distributed client key
must be treated as recoverable from the installed application.

### Publishing Native Updates

Canopy uses Sparkle 2 for signed update checks. The first native build downloads the pinned Sparkle release and verifies its SHA-256 checksum. The update signing key is stored in the macOS login Keychain under the `Canopy` account; its private value must never be committed.

For each release, increment both `native/version.txt` and `native/build-number.txt`, then run:

```bash
pnpm native:build
pnpm native:package-update
```

Commit the generated `updates/appcast.xml`, create a matching GitHub release tag such as `v0.4.0`, and attach `release/native-updates/Canopy-Native-0.4.0.zip`. Existing installs can then use **Canopy > Check for Updates...** or **Settings > Check for updates**. Smooth distribution to other Macs still requires Apple Developer ID signing and notarization of the app archive.

It remains a prototype while password UI, accessibility polish, and a production-grade Chromium patch/update pipeline are completed.

## Checks

```bash
pnpm check
```

## Privacy And Internal Pages

Google geolocation is blocked by default through Chromium's site-content settings, so the site cannot repeatedly prompt. It can be changed under **Canopy Settings > Privacy**.

Canopy leaves Google Sync services disabled and does not need or embed Google API secrets. Normal Google search and websites work without them.

The Jim's Mowing multiplayer client is bundled in **Canopy Settings > Advanced** and connects to `wss://jimsmowingandlawncare.up.railway.app/`. The browser does not use or store the game database URL. Set `SERVE_WEB_CLIENT=0` on the Railway service only after a bundled build has been verified; this keeps health, admin, accounts, and multiplayer online while returning `404` for public game files.
