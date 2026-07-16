const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');

test('uses the St Andrews portal as the default home page', () => {
  assert.equal(core.DEFAULT_HOME_PAGE, 'https://mystandrews.saac.qld.edu.au/');
  assert.equal(core.DEFAULT_SETTINGS.homePage, core.DEFAULT_HOME_PAGE);
});

test('normalizes settings without accepting unsafe URL schemes', () => {
  const settings = core.normalizeSettings({
    homePage: 'javascript:alert(1)',
    gameUrl: 'file:///tmp/game.html',
    theme: 'neon',
    spaceSwipeEnabled: false,
    compactTabs: true
  });
  assert.equal(settings.homePage, core.DEFAULT_HOME_PAGE);
  assert.equal(settings.gameUrl, core.DEFAULT_GAME_URL);
  assert.equal(settings.theme, 'system');
  assert.equal(settings.spaceSwipeEnabled, false);
  assert.equal(settings.compactTabs, true);
});

test('resolves URLs, local development hosts, and Google searches', () => {
  assert.equal(core.resolveAddress('openai.com'), 'https://openai.com');
  assert.equal(core.resolveAddress('localhost:5173/demo'), 'http://localhost:5173/demo');
  assert.equal(core.resolveAddress('canopy browser'), 'https://www.google.com/search?q=canopy%20browser');
  assert.equal(core.resolveAddress(''), '');
});

test('cleans space names and wraps space cycling', () => {
  assert.equal(core.cleanSpaceName('  Work   and   Study  '), 'Work and Study');
  assert.equal(core.nextIndex(3, 2, 'next'), 0);
  assert.equal(core.nextIndex(3, 0, 'previous'), 2);
  assert.equal(core.nextIndex(0, 0, 'next'), -1);
});
