const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  onlineWebSocketUrl,
  resolvePublicGameFile,
  routeGameClientOnline,
  startGameFilesServer
} = require('../electron/game-files.cjs');

const socketSource = 'const activeSocket = new WebSocket(`${protocol}//${location.host}`);';

test('Railway HTTP addresses become matching WebSocket addresses', () => {
  assert.equal(onlineWebSocketUrl('https://jim.up.railway.app'), 'wss://jim.up.railway.app/');
  assert.equal(onlineWebSocketUrl('http://localhost:3000'), 'ws://localhost:3000/');
});

test('the game client is routed online in memory', () => {
  const rewritten = routeGameClientOnline(`<script>${socketSource}</script>`, 'https://jim.up.railway.app');
  assert.match(rewritten, /new WebSocket\("wss:\/\/jim\.up\.railway\.app\/"\)/);
  assert.doesNotMatch(rewritten, /location\.host/);
});

test('only public game files can be served', () => {
  const root = path.join(os.tmpdir(), 'canopy-game-root');
  assert.equal(resolvePublicGameFile(root, '/assets/map.glb'), path.join(root, 'assets/map.glb'));
  assert.equal(resolvePublicGameFile(root, '/core.js'), path.join(root, 'core.js'));
  assert.equal(resolvePublicGameFile(root, '/server.js'), null);
  assert.equal(resolvePublicGameFile(root, '/../server.js'), null);
});

test('the loopback server serves local files with Railway multiplayer routing', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-game-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), `<html><script>${socketSource}</script></html>`);
  fs.writeFileSync(path.join(root, 'assets', 'marker.txt'), 'local asset');
  const server = await startGameFilesServer({ sourcePath: root, onlineServerUrl: 'https://jim.up.railway.app', preferredPort: 0 });
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const html = await fetch(server.url).then(response => response.text());
  assert.match(html, /wss:\/\/jim\.up\.railway\.app\//);
  assert.equal(await fetch(`${server.url}/assets/marker.txt`).then(response => response.text()), 'local asset');
  assert.equal((await fetch(`${server.url}/server.js`)).status, 403);
});
