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
    compactTabs: true,
    autoArchiveHours: 999,
    openPeekForPinnedLinks: false
  });
  assert.equal(settings.homePage, core.DEFAULT_HOME_PAGE);
  assert.equal(settings.gameUrl, core.DEFAULT_GAME_URL);
  assert.equal(settings.theme, 'system');
  assert.equal(settings.spaceSwipeEnabled, false);
  assert.equal(settings.compactTabs, true);
  assert.equal(settings.autoArchiveHours, 72);
  assert.equal(settings.openPeekForPinnedLinks, false);
});

test('normalizes persistent workspace data and preserves folder assignments', () => {
  const workspace = core.normalizeWorkspace({
    favorites: [
      { id: 'favorite-one', url: 'https://example.com/', title: 'Example' },
      { url: 'javascript:alert(1)', title: 'Unsafe' }
    ],
    pinnedBySpace: {
      Personal: [{ id: 'pin-one', url: 'https://openai.com/', title: 'OpenAI', folderId: 'folder-one' }]
    },
    foldersBySpace: {
      Personal: [{ id: 'folder-one', name: 'Research' }]
    },
    spaceMeta: {
      Personal: { icon: 'book', color: 'blue' }
    }
  });
  assert.equal(workspace.favorites.length, 1);
  assert.equal(workspace.pinnedBySpace.personal[0].folderId, 'folder-one');
  assert.equal(workspace.foldersBySpace.personal[0].name, 'Research');
  assert.deepEqual(workspace.spaceMeta.personal, { icon: 'book', color: 'blue' });
});

test('matches Air Traffic Control routes by domain, prefix, and substring', () => {
  assert.equal(core.routeMatches('https://mail.google.com/inbox', { match: 'host', pattern: 'google.com' }), true);
  assert.equal(core.routeMatches('https://example.com/work/42', { match: 'startsWith', pattern: 'https://example.com/work' }), true);
  assert.equal(core.routeMatches('https://example.com/notes', { match: 'contains', pattern: 'notes' }), true);
  assert.equal(core.routeMatches('https://example.net/', { match: 'host', pattern: 'example.com' }), false);
});

test('removes common tracking parameters without changing useful query values', () => {
  const cleaned = new URL(core.removeTrackingParameters('https://example.com/page?q=canopy&utm_source=test&fbclid=123'));
  assert.equal(cleaned.searchParams.get('q'), 'canopy');
  assert.equal(cleaned.searchParams.has('utm_source'), false);
  assert.equal(cleaned.searchParams.has('fbclid'), false);
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
