# Canopy Browser

Canopy is a macOS browser distributed with a real Chromium runtime. It enables Chromium's native vertical-tab sidebar and adds Arc-style Spaces, persistent browser preferences, trackpad Space switching, and a deliberately buried internal Jim's Mowing launcher through a Manifest V3 extension.

The page renderer, networking, permissions, downloads, site isolation, and browser chrome are provided directly by Chromium. Canopy does not use Electron.

## Requirements

- Apple Silicon or Intel Mac
- Node.js 22+ and pnpm for checks
- Internet access for the first Chromium download

## Run

```bash
pnpm start
```

The first run downloads the pinned official Chromium snapshot into `~/Library/Caches/Canopy`. Later launches reuse it. Canopy opens `https://mystandrews.saac.qld.edu.au/` as its startup page.

The left sidebar is enabled automatically and Spaces are backed by native Chromium tab groups. A physical two-finger horizontal trackpad swipe switches between them. Open the Canopy extension from Chromium's extension toolbar when you want to create Spaces or access Canopy's settings.

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

Canopy deliberately leaves Google Sync services disabled and does not need or embed Google API secrets. Normal Google search and websites work without them.

The Jim's Mowing multiplayer page is under **Canopy Settings > Advanced > Developer options > Internal pages** and opens the hosted server at `https://jimsmowingandlawncare.up.railway.app/`. The browser does not use or store the game database URL.
