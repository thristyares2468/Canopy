(function exposeCanopyCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CanopyCore = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  const DEFAULT_HOME_PAGE = 'https://mystandrews.saac.qld.edu.au/';
  const DEFAULT_GAME_URL = 'https://jimsmowingandlawncare.up.railway.app/';
  const SPACE_COLORS = Object.freeze(['green', 'blue', 'red', 'yellow', 'purple', 'cyan', 'orange', 'pink', 'grey']);
  const SPACE_ICONS = Object.freeze(['leaf', 'briefcase', 'book', 'code', 'home', 'star', 'globe', 'game']);
  const AUTO_ARCHIVE_HOURS = Object.freeze([0, 12, 24, 72, 168, 720]);
  const TRACKING_PARAMETERS = Object.freeze([
    'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi'
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    homePage: DEFAULT_HOME_PAGE,
    gameUrl: DEFAULT_GAME_URL,
    theme: 'system',
    spaceSwipeEnabled: true,
    blockGoogleLocation: true,
    reduceMotion: false,
    compactTabs: false,
    autoArchiveHours: 72,
    openPeekForPinnedLinks: true
  });

  const DEFAULT_WORKSPACE = Object.freeze({
    version: 1,
    favorites: [],
    pinnedBySpace: {},
    foldersBySpace: {},
    archive: [],
    routes: [],
    spaceMeta: {},
    captures: []
  });

  function httpUrl(value, fallback = '') {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeSettings(value = {}) {
    const autoArchiveHours = Number(value.autoArchiveHours);
    return {
      homePage: httpUrl(value.homePage, DEFAULT_HOME_PAGE),
      gameUrl: httpUrl(value.gameUrl, DEFAULT_GAME_URL),
      theme: ['system', 'dark', 'light'].includes(value.theme) ? value.theme : 'system',
      spaceSwipeEnabled: value.spaceSwipeEnabled !== false,
      blockGoogleLocation: value.blockGoogleLocation !== false,
      reduceMotion: value.reduceMotion === true,
      compactTabs: value.compactTabs === true,
      autoArchiveHours: AUTO_ARCHIVE_HOURS.includes(autoArchiveHours) ? autoArchiveHours : 72,
      openPeekForPinnedLinks: value.openPeekForPinnedLinks !== false
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

  function cleanLabel(value, maxLength = 48) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function spaceKey(value) {
    return cleanSpaceName(value).toLocaleLowerCase('en-US');
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

  function createId(prefix = 'item') {
    const random = typeof crypto === 'object' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
    return `${prefix}-${random}`;
  }

  function normalizePage(value = {}, prefix = 'page') {
    const url = httpUrl(value.url, '');
    if (!url) return null;
    return {
      id: cleanLabel(value.id, 80) || createId(prefix),
      url,
      title: cleanLabel(value.title, 180) || displayAddress(url) || 'Untitled',
      favIconUrl: httpUrl(value.favIconUrl, ''),
      createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now()
    };
  }

  function normalizeWorkspace(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const normalizePageList = (list, prefix) => Array.isArray(list)
      ? list.map(item => normalizePage(item, prefix)).filter(Boolean)
      : [];
    const pinnedBySpace = {};
    for (const [key, items] of Object.entries(source.pinnedBySpace || {})) {
      const normalizedKey = spaceKey(key);
      if (!normalizedKey) continue;
      pinnedBySpace[normalizedKey] = (Array.isArray(items) ? items : []).map(sourceItem => {
        const item = normalizePage(sourceItem, 'pin');
        return item ? { ...item, folderId: cleanLabel(sourceItem?.folderId, 80) || null } : null;
      }).filter(Boolean).slice(0, 100);
    }
    const foldersBySpace = {};
    for (const [key, folders] of Object.entries(source.foldersBySpace || {})) {
      const normalizedKey = spaceKey(key);
      if (!normalizedKey || !Array.isArray(folders)) continue;
      foldersBySpace[normalizedKey] = folders.map(folder => ({
        id: cleanLabel(folder?.id, 80) || createId('folder'),
        name: cleanLabel(folder?.name, 40) || 'Folder',
        collapsed: folder?.collapsed === true
      })).slice(0, 40);
    }
    const spaceMeta = {};
    for (const [key, metadata] of Object.entries(source.spaceMeta || {})) {
      const normalizedKey = spaceKey(key);
      if (!normalizedKey) continue;
      spaceMeta[normalizedKey] = {
        icon: SPACE_ICONS.includes(metadata?.icon) ? metadata.icon : 'leaf',
        color: SPACE_COLORS.includes(metadata?.color) ? metadata.color : 'green'
      };
    }
    const routes = Array.isArray(source.routes) ? source.routes.map(route => ({
      id: cleanLabel(route?.id, 80) || createId('route'),
      pattern: cleanLabel(route?.pattern, 180),
      match: ['host', 'contains', 'startsWith'].includes(route?.match) ? route.match : 'host',
      spaceName: cleanSpaceName(route?.spaceName)
    })).filter(route => route.pattern && route.spaceName).slice(0, 80) : [];
    const archive = (Array.isArray(source.archive) ? source.archive : []).map(sourceItem => {
      const item = normalizePage(sourceItem, 'archive');
      return item ? {
        ...item,
        archivedAt: Number(sourceItem?.archivedAt) || Date.now(),
        spaceName: cleanSpaceName(sourceItem?.spaceName) || 'Personal'
      } : null;
    }).filter(Boolean).slice(0, 500);
    const captures = Array.isArray(source.captures) ? source.captures.map(capture => ({
      id: cleanLabel(capture?.id, 80) || createId('capture'),
      title: cleanLabel(capture?.title, 180) || 'Capture',
      url: httpUrl(capture?.url, ''),
      filename: cleanLabel(capture?.filename, 180),
      createdAt: Number(capture?.createdAt) || Date.now()
    })).filter(capture => capture.filename).slice(0, 100) : [];
    return {
      version: 1,
      favorites: normalizePageList(source.favorites, 'favorite').slice(0, 12),
      pinnedBySpace,
      foldersBySpace,
      archive,
      routes,
      spaceMeta,
      captures
    };
  }

  function routeMatches(value, rule = {}) {
    const url = httpUrl(value, '');
    const pattern = cleanLabel(rule.pattern, 180).toLocaleLowerCase('en-US');
    if (!url || !pattern) return false;
    const parsed = new URL(url);
    if (rule.match === 'contains') return parsed.href.toLocaleLowerCase('en-US').includes(pattern);
    if (rule.match === 'startsWith') return parsed.href.toLocaleLowerCase('en-US').startsWith(pattern);
    const host = parsed.hostname.toLocaleLowerCase('en-US');
    const normalizedPattern = pattern.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '');
    return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
  }

  function removeTrackingParameters(value) {
    const url = httpUrl(value, '');
    if (!url) return '';
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLocaleLowerCase('en-US');
      if (TRACKING_PARAMETERS.includes(lower) || lower.startsWith('utm_')) parsed.searchParams.delete(key);
    }
    return parsed.href;
  }

  function safeFilename(value, fallback = 'capture') {
    const cleaned = cleanLabel(value, 80).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
    return cleaned || fallback;
  }

  return {
    AUTO_ARCHIVE_HOURS,
    DEFAULT_GAME_URL,
    DEFAULT_HOME_PAGE,
    DEFAULT_SETTINGS,
    DEFAULT_WORKSPACE,
    SPACE_COLORS,
    SPACE_ICONS,
    cleanLabel,
    cleanSpaceName,
    createId,
    displayAddress,
    httpUrl,
    nextIndex,
    normalizeSettings,
    normalizeWorkspace,
    removeTrackingParameters,
    resolveAddress,
    routeMatches,
    safeFilename,
    spaceKey
  };
}));
