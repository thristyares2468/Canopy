# Canopy Browser

Canopy is a macOS-first Chromium browser built with Electron. It uses a spatial sidebar, separate tab spaces, Google search, native macOS window materials, and secure sandboxed browsing views.

The Jim's Mowing game is intentionally absent from the normal browser interface. **Settings → Advanced → Internal pages** opens the public Railway game directly while Canopy presents it as `canopy://jims-mowing`.

## Run locally

Use the bundled Node/pnpm environment or any Node 22+ installation:

```bash
pnpm install
pnpm dev
```

## Checks

```bash
pnpm check
pnpm test:e2e
```

## Build for macOS

```bash
pnpm package:mac
```

Unsigned local builds work normally. Public distribution requires an Apple Developer ID certificate and notarization credentials.

## Jim's Mowing sources

- Online multiplayer server: `https://jimsmowingandlawncare.up.railway.app`

Canopy does not modify, copy, or execute the game repository. The public game remains on its genuine HTTPS origin so authentication, cookies, assets, and WebSockets use the same Railway deployment.
