const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('runs and packages Chromium directly', () => {
  const pkg = JSON.parse(read('package.json'));
  const packages = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.equal(packages.electron, undefined);
  assert.equal(packages['electron-builder'], undefined);
  assert.match(pkg.scripts.start, /run-canopy\.sh/);
  assert.match(pkg.scripts.build, /build-mac-app\.sh/);
  assert.match(read('scripts/download-chromium.sh'), /chromium-browser-snapshots/);
  assert.match(read('scripts/run-canopy.sh'), /Library\/Caches\/Canopy/);
  assert.match(read('scripts/run-canopy.sh'), /Chromium\.app\/Contents\/MacOS\/Chromium/);
  assert.match(read('scripts/run-canopy.sh'), /prepare-profile\.sh/);
  assert.match(read('scripts/build-mac-app.sh'), /Resources\/Chromium\.app\/Contents\/MacOS\/Chromium/);
  assert.match(read('scripts/build-mac-app.sh'), /Applications\/Canopy\.app/);
  assert.doesNotMatch(read('scripts/download-chromium.sh'), /codesign --force --deep/);
});

test('uses the Canopy panel as the left sidebar without duplicate vertical tabs', () => {
  const profile = read('scripts/prepare-profile.sh');
  assert.match(profile, /side_panel\.is_right_aligned -bool false/);
  assert.match(profile, /vertical_tabs\.enabled -bool false/);
  assert.match(profile, /canopy-profile-v3/);
});

test('loads the Canopy extension and requested startup page', () => {
  const launcher = read('scripts/run-canopy.sh');
  assert.match(launcher, /--load-extension=/);
  assert.match(launcher, /GOOGLE_API_KEY="no"/);
  assert.match(launcher, /https:\/\/mystandrews\.saac\.qld\.edu\.au\//);
  assert.match(read('scripts/build-mac-app.sh'), /https:\/\/mystandrews\.saac\.qld\.edu\.au\//);
});

test('extension provides the Arc-style workspace layer and nested internal pages', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('tabGroups'));
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.ok(manifest.permissions.includes('contentSettings'));
  assert.ok(manifest.permissions.includes('history'));
  assert.ok(manifest.permissions.includes('alarms'));
  assert.equal(manifest.chrome_url_overrides.newtab, 'newtab.html');
  assert.equal(manifest.commands._execute_side_panel.description, 'Open the Canopy sidebar');
  assert.deepEqual(manifest.content_scripts[0].js, ['page-actions.js']);
  assert.equal(manifest.background.service_worker, 'background-v3.js');
  assert.match(read('extension/background-v3.js'), /https:\/\/\*\.google\.com\/\*/);
  assert.match(read('extension/background-v3.js'), /autoArchiveTabs/);
  assert.match(read('extension/background-v3.js'), /apiVersion: 3/);
  assert.match(read('extension/background-v3.js'), /routeTab/);
  assert.match(read('extension/background-v3.js'), /openPeek/);
  assert.match(read('extension/background-v3.js'), /firstTabIndex/);
  const panel = read('extension/sidepanel.html');
  assert.match(panel, /FAVORITES[\s\S]*PINNED[\s\S]*TODAY/);
  assert.match(panel, /id="space-dots"/);
  assert.match(panel, /id="create-menu"[\s\S]*New folder[\s\S]*New Space/);
  assert.match(panel, /Air Traffic Control/);
  assert.match(panel, /data-panel="jims"[\s\S]*id="game-frame"/);
  assert.match(read('extension/newtab.html'), /Canopy Command Bar/);
  const sidepanel = read('extension/sidepanel.js');
  assert.match(sidepanel, /event\.isTrusted/);
  assert.match(sidepanel, /deltaX/);
  assert.match(sidepanel, /switchSpaceAnimated/);
  assert.doesNotMatch(read('extension/newtab.js'), /deltaX/);
});

test('internal Chromium pages use privileged background routes', () => {
  assert.match(read('extension/sidepanel.js'), /openContentSettings/);
  assert.match(read('extension/background-v3.js'), /chrome:\/\/settings\/content\/location/);
  assert.match(read('extension/background-v3.js'), /chrome:\/\/downloads\//);
});
