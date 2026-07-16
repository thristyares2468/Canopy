const path = require('node:path');
const fs = require('node:fs');
const { test, expect, _electron: electron } = require('@playwright/test');

test('Canopy exposes spatial browsing and keeps the game internal', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..')],
    env: { ...process.env, CANOPY_E2E: '1' }
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
  await expect(window.locator('label').filter({ hasText: 'Online multiplayer server' }).locator('input')).toHaveValue('https://jimsmowingandlawncare.up.railway.app');

  await window.screenshot({ path: path.resolve(__dirname, '../test-results/canopy-settings.png'), animations: 'disabled' });
  await window.getByRole('button', { name: 'Open game files' }).click();
  await expect(window.locator('.settings-screen')).toHaveCount(0);
  await expect(window.locator('.tab-row.active')).toContainText('127.0.0.1:');

  await expect.poll(async () => app.evaluate(async ({ webContents }) => {
    const game = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'));
    if (!game) return { ready: '', title: '', socketUrl: '' };
    return game.executeJavaScript(`({
      ready: document.readyState,
      title: document.title,
      socketUrl: typeof socket !== 'undefined' && socket ? socket.url : ''
    })`);
  }), { timeout: 20_000 }).toMatchObject({
    ready: 'complete',
    title: "Jim's Mowing and Lawn Care",
    socketUrl: 'wss://jimsmowingandlawncare.up.railway.app/'
  });

  const gameCapture = await app.evaluate(async ({ webContents }) => {
    const game = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'));
    return (await game.capturePage()).toPNG().toString('base64');
  });
  fs.writeFileSync(path.resolve(__dirname, '../test-results/canopy-game.png'), Buffer.from(gameCapture, 'base64'));
  await app.close();
});
