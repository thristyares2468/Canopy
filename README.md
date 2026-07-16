# Canopy Browser

Canopy is a macOS-first Chromium browser built with Electron. It uses a spatial sidebar, separate tab spaces, Google search, native macOS window materials, and secure sandboxed browsing views.

The Jim's Mowing game is intentionally absent from the normal browser interface. **Settings → Advanced → Internal pages** opens the hosted Railway game directly and presents it as `canopy://jims-mowing`.

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

## Jim's Mowing

- Online multiplayer server: `https://jimsmowingandlawncare.up.railway.app`

Canopy loads the hosted page itself, so the game client and WebSocket use the same Railway origin as they do in a normal Chromium tab. Canopy does not read database credentials or execute the game server locally.
