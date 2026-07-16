# Canopy Browser

Canopy is a macOS-first Chromium browser built with Electron. It uses a spatial sidebar, separate tab spaces, Google search, native macOS window materials, and secure sandboxed browsing views.

The Jim's Mowing game is intentionally absent from the normal browser interface. **Settings → Advanced → Internal pages** opens the existing local GitHub checkout while keeping multiplayer connected to the Railway server.

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

- Online multiplayer server: `https://jim.up.railway.app`
- Local source default: `/Users/jherbig/Documents/GitHub/fpsshooterserver`

Canopy does not modify, copy, or execute the game repository's server code. It serves only the checkout's public client files on `127.0.0.1`, rewrites the WebSocket destination in memory, and connects gameplay to Railway. No Railway hosting change is required while the server continues accepting WebSocket clients from the local Canopy origin.

The local checkout and deployed server should remain protocol-compatible. For production releases, package the checkout commit that matches the Railway deployment.
