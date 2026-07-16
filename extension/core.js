(function exposeCanopyCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CanopyCore = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  const DEFAULT_HOME_PAGE = 'https://mystandrews.saac.qld.edu.au/';
  const DEFAULT_GAME_URL = 'https://jimsmowingandlawncare.up.railway.app/';
  const DEFAULT_SETTINGS = Object.freeze({
    homePage: DEFAULT_HOME_PAGE,
    gameUrl: DEFAULT_GAME_URL,
    theme: 'system',
    spaceSwipeEnabled: true,
    blockGoogleLocation: true,
    reduceMotion: false,
    compactTabs: false
  });
  const SPACE_COLORS = Object.freeze(['green', 'blue', 'red', 'yellow', 'purple', 'cyan', 'orange', 'pink', 'grey']);

  function httpUrl(value, fallback) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeSettings(value = {}) {
    return {
      homePage: httpUrl(value.homePage, DEFAULT_HOME_PAGE),
      gameUrl: httpUrl(value.gameUrl, DEFAULT_GAME_URL),
      theme: ['system', 'dark', 'light'].includes(value.theme) ? value.theme : 'system',
      spaceSwipeEnabled: value.spaceSwipeEnabled !== false,
      blockGoogleLocation: value.blockGoogleLocation !== false,
      reduceMotion: value.reduceMotion === true,
      compactTabs: value.compactTabs === true
    };
  }

  function resolveAddress(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    if (/^https?:\/\//i.test(input)) return httpUrl(input, '');
    if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(input)) return `http://${input}`;
    if (/^[\w.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(input)) return `https://${input}`;
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }

  function cleanSpaceName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 28);
  }

  function nextIndex(length, currentIndex, direction) {
    if (!length) return -1;
    const offset = direction === 'previous' ? -1 : 1;
    return (Math.max(0, currentIndex) + offset + length) % length;
  }

  function displayAddress(value) {
    try {
      const url = new URL(value);
      return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return '';
    }
  }

  return {
    DEFAULT_GAME_URL,
    DEFAULT_HOME_PAGE,
    DEFAULT_SETTINGS,
    SPACE_COLORS,
    cleanSpaceName,
    displayAddress,
    nextIndex,
    normalizeSettings,
    resolveAddress
  };
}));
