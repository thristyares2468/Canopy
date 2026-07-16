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

test('enables Chromium native vertical tabs for the Canopy sidebar', () => {
  const profile = read('scripts/prepare-profile.sh');
  assert.match(profile, /vertical_tabs\.enabled/);
  assert.match(profile, /vertical_tabs\.collapsed_state/);
  assert.match(profile, /uncollapsed_width/);
});

test('loads the Canopy extension and requested startup page', () => {
  const launcher = read('scripts/run-canopy.sh');
  assert.match(launcher, /--load-extension=/);
  assert.match(launcher, /GOOGLE_API_KEY="no"/);
  assert.match(launcher, /https:\/\/mystandrews\.saac\.qld\.edu\.au\//);
  assert.match(read('scripts/build-mac-app.sh'), /https:\/\/mystandrews\.saac\.qld\.edu\.au\//);
});

test('extension provides spaces, gestures, privacy controls, and nested internal pages', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('tabGroups'));
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.ok(manifest.permissions.includes('contentSettings'));
  assert.equal(manifest.commands._execute_side_panel.description, 'Open the Canopy sidebar');
  assert.match(read('extension/gestures.js'), /event\.isTrusted/);
  assert.match(read('extension/background.js'), /https:\/\/\*\.google\.com\/\*/);
  const panel = read('extension/sidepanel.html');
  assert.match(panel, /Developer options[\s\S]*Internal pages[\s\S]*Jim's Mowing/);
});

test('internal Chromium pages use privileged background routes', () => {
  assert.match(read('extension/sidepanel.js'), /openContentSettings/);
  assert.match(read('extension/background.js'), /chrome:\/\/settings\/content\/location/);
  assert.match(read('extension/background.js'), /chrome:\/\/downloads\//);
});
