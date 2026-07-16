const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const { test, expect, _electron: electron } = require('@playwright/test');

test('Canopy exposes spatial browsing and keeps the game internal', async () => {
  const gameServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Jim\'s Mowing Online</title><main data-testid="online-login">Online login</main>');
  });
  await new Promise(resolve => gameServer.listen(0, '127.0.0.1', resolve));
  const gameUrl = `http://127.0.0.1:${gameServer.address().port}`;
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-e2e-'));
  let app;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, CANOPY_E2E: '1', CANOPY_E2E_USER_DATA: userDataPath }
    });
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 1440, height: 900 });

    await expect(window.locator('.canopy-wordmark')).toContainText('Canopy');
    await expect(window.locator('.command-bar input')).toHaveAttribute('placeholder', 'Search or enter address');
    await expect(window.locator('.space-switcher button')).toHaveCount(3);
    await expect(window.getByText("Jim's Mowing", { exact: true })).toHaveCount(0);
    await window.screenshot({ path: path.resolve(__dirname, '../test-results/canopy-primary.png'), animations: 'disabled' });

    await window.getByRole('button', { name: 'Settings' }).click();
    await expect(window.locator('.settings-screen')).toBeVisible();
    await window.getByRole('button', { name: 'Advanced' }).click();
    const internal = window.locator('details.internal-pages');
    await expect(internal).not.toHaveAttribute('open', '');
    await internal.locator('summary').click();
    await expect(window.getByText("Jim's Mowing", { exact: true })).toBeVisible();
    const serverInput = window.locator('label').filter({ hasText: 'Online multiplayer server' }).locator('input');
    await expect(serverInput).toHaveValue('https://jimsmowingandlawncare.up.railway.app');
    await serverInput.fill(gameUrl);

    await window.screenshot({ path: path.resolve(__dirname, '../test-results/canopy-settings.png'), animations: 'disabled' });
    await window.getByRole('button', { name: "Open Jim's Mowing" }).click();
    await expect(window.locator('.settings-screen')).toHaveCount(0);
    await expect(window.locator('.tab-row.active')).toContainText("Jim's Mowing");
    await expect(window.locator('.tab-row.active')).toContainText('canopy://jims-mowing');

    await expect.poll(async () => app.evaluate(async ({ webContents }, onlineUrl) => {
      const game = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(onlineUrl));
      if (!game) return { ready: '', title: '', login: '', url: '' };
      return game.executeJavaScript(`({
        ready: document.readyState,
        title: document.title,
        login: document.querySelector('[data-testid="online-login"]')?.textContent || '',
        url: location.href
      })`);
    }, gameUrl), { timeout: 20_000 }).toMatchObject({
      ready: 'complete',
      title: "Jim's Mowing Online",
      login: 'Online login',
      url: `${gameUrl}/`
    });

    const gameCapture = await app.evaluate(async ({ webContents }, onlineUrl) => {
      const game = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(onlineUrl));
      return (await game.capturePage()).toPNG().toString('base64');
    }, gameUrl);
    fs.writeFileSync(path.resolve(__dirname, '../test-results/canopy-game.png'), Buffer.from(gameCapture, 'base64'));
  } finally {
    if (app) await app.close();
    await new Promise(resolve => gameServer.close(resolve));
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
