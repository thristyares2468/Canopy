const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CanopyStore, DEFAULT_GAME_SOURCE, DEFAULT_GAME_URL } = require('../electron/store.cjs');

test('browser settings persist locally with safe defaults and validation', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-store-'));
  const store = new CanopyStore(directory);
  assert.equal(store.snapshot().settings.gameUrl, DEFAULT_GAME_URL);
  assert.equal(store.snapshot().settings.gameSourcePath, DEFAULT_GAME_SOURCE);

  store.update({
    settings: { theme: 'dark', activeSpace: 'work', gamePort: 80 },
    tabs: [
      { id: 'one', url: 'https://example.com', title: 'Example', space: 'work' },
      { id: 'internal', url: 'file:///secret/newtab.html', title: 'Internal', space: 'personal' }
    ]
  }, { immediate: true });

  const reloaded = new CanopyStore(directory).snapshot();
  assert.equal(reloaded.settings.theme, 'dark');
  assert.equal(reloaded.settings.activeSpace, 'work');
  assert.equal(reloaded.settings.gamePort, 1024);
  assert.deepEqual(reloaded.tabs.map(tab => tab.id), ['one']);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('retired default game server migrates without replacing custom servers', () => {
  const retiredDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-store-retired-'));
  fs.writeFileSync(path.join(retiredDirectory, 'canopy-state.json'), JSON.stringify({
    settings: { gameUrl: 'https://jim.up.railway.app' }
  }));
  assert.equal(new CanopyStore(retiredDirectory).snapshot().settings.gameUrl, DEFAULT_GAME_URL);

  const customDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-store-custom-'));
  fs.writeFileSync(path.join(customDirectory, 'canopy-state.json'), JSON.stringify({
    settings: { gameUrl: 'https://custom.example.com' }
  }));
  assert.equal(new CanopyStore(customDirectory).snapshot().settings.gameUrl, 'https://custom.example.com');

  fs.rmSync(retiredDirectory, { recursive: true, force: true });
  fs.rmSync(customDirectory, { recursive: true, force: true });
});
