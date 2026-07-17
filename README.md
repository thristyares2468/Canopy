# Canopy Browser

Canopy is a macOS browser distributed with a real Chromium runtime. It combines Chromium's native vertical tabs with a persistent workspace layer built around Spaces, Favorites, pinned pages, folders, Today tabs, and an Archive. Canopy does not use Electron.

## Workspace Features

- Native Chromium vertical tabs and tab-group-backed Spaces
- Up to 12 Favorites shared across Spaces
- Persistent pinned pages and folders inside each Space
- Today tabs with configurable Auto Archive and one-click restore
- `Cmd+T` Command Bar for tabs, Spaces, history, commands, URLs, and Google searches
- Two-finger horizontal trackpad switching between Spaces
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

## Run

```bash
pnpm start
```

The first run downloads the pinned official Chromium snapshot into `~/Library/Caches/Canopy`. Later launches reuse it. Canopy opens `https://mystandrews.saac.qld.edu.au/` as its startup page.

The left sidebar is enabled automatically. Open the Canopy extension from Chromium's extension toolbar for Favorites, pinned pages, folders, Archive, media controls, routing, and settings. New tabs open the Canopy Command Bar.

## Build The macOS App

```bash
pnpm build
open ~/Applications/Canopy.app
```

The local build is installed at `~/Applications/Canopy.app` and archived at `release/Canopy-macOS.zip`. The outer launcher preserves the untouched Chromium runtime so HTTPS and browser services keep their original behavior. Public distribution still requires Apple Developer ID signing and notarization.

## Checks

```bash
pnpm check
```

## Privacy And Internal Pages

Google geolocation is blocked by default through Chromium's site-content settings, so the site cannot repeatedly prompt. It can be changed under **Canopy Settings > Privacy**.

Canopy leaves Google Sync services disabled and does not need or embed Google API secrets. Normal Google search and websites work without them.

The Jim's Mowing multiplayer page is under **Canopy Settings > Advanced > Developer options > Internal pages** and opens the hosted server at `https://jimsmowingandlawncare.up.railway.app/`. The browser does not use or store the game database URL.
