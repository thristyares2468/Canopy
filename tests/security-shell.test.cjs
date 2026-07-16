const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

test('web content runs sandboxed without Node integration', () => {
  assert.match(main, /new WebContentsView[\s\S]*?contextIsolation: true,[\s\S]*?sandbox: true,[\s\S]*?nodeIntegration: false,[\s\S]*?webSecurity: true/);
  assert.match(main, /setWindowOpenHandler[\s\S]*?createTab[\s\S]*?action: 'deny'/);
  assert.match(main, /setUserAgent\([\s\S]*?Chrome\/\$\{chromiumVersion\}[\s\S]*?Safari\/537\.36/);
  assert.doesNotMatch(preload, /require\(['"]node:/);
  assert.doesNotMatch(main, /setUserAgent\([^\n]*Electron/);
});

test('Jim\'s Mowing remains inside collapsed advanced settings', () => {
  assert.match(app, /section === 'advanced'[\s\S]*?<details className="internal-pages">[\s\S]*?<strong>Jim's Mowing<\/strong>/);
  assert.match(app, /Online multiplayer server[\s\S]*?Open Jim's Mowing/);
  assert.doesNotMatch(app, /Jim's Mowing repository|Local file port/);
  assert.doesNotMatch(app, /Open web game/);
  assert.doesNotMatch(app.split('function SettingsScreen')[0], /Jim's Mowing/);
});

test('the launcher opens the configured hosted game without running or copying local files', () => {
  assert.match(main, /settings\.gameUrl \|\| DEFAULT_GAME_URL/);
  assert.match(main, /createTab\(\{ url,[\s\S]*?internalPage: 'jims-mowing'/);
  assert.match(main, /displayUrl: trustedGame \? 'canopy:\/\/jims-mowing'/);
  assert.doesNotMatch(main, /startGameFilesServer|spawn\(|ELECTRON_RUN_AS_NODE|copyFile|cpSync|fs\.cp/);
});
