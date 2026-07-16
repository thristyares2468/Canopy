const test = require('node:test');
const assert = require('node:assert/strict');
const {
  displayAddress,
  isAllowedNavigation,
  isLocalHost,
  looksLikeHost,
  originMatches,
  resolveAddress
} = require('../electron/navigation.cjs');

test('search terms resolve through Google', () => {
  assert.equal(resolveAddress('best browser for mac'), 'https://www.google.com/search?q=best%20browser%20for%20mac');
});

test('hostnames and localhost resolve as navigable URLs', () => {
  assert.equal(resolveAddress('openai.com'), 'https://openai.com/');
  assert.equal(resolveAddress('localhost:3000/game'), 'http://localhost:3000/game');
  assert.equal(resolveAddress('127.0.0.1:3000'), 'http://127.0.0.1:3000/');
  assert.equal(isLocalHost('localhost:3000'), true);
  assert.equal(looksLikeHost('jim.up.railway.app'), true);
});

test('unsafe protocols are never treated as browser navigation', () => {
  assert.equal(isAllowedNavigation('javascript:alert(1)'), false);
  assert.equal(isAllowedNavigation('data:text/html,hello'), false);
  assert.equal(isAllowedNavigation('file:///tmp/index.html'), false);
  assert.equal(isAllowedNavigation('file:///tmp/index.html', { allowFile: true }), true);
});

test('display addresses remain compact and internal pages stay private', () => {
  assert.equal(displayAddress('https://example.com/path?q=1'), 'example.com/path?q=1');
  assert.equal(displayAddress('file:///Applications/Canopy/newtab.html'), '');
  assert.equal(originMatches('https://jim.up.railway.app/login', 'https://jim.up.railway.app'), true);
});
