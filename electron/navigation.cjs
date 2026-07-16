const { URL } = require('node:url');

const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const INTERNAL_PROTOCOLS = new Set(['file:']);

function isLocalHost(value) {
  return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
}

function looksLikeHost(value) {
  return isLocalHost(value)
    || /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\:\d+)?(?:\/|$)/i.test(value);
}

function resolveAddress(input, newTabUrl = '') {
  const value = String(input || '').trim();
  if (!value) return newTabUrl;

  try {
    const parsed = new URL(value);
    if (WEB_PROTOCOLS.has(parsed.protocol) || INTERNAL_PROTOCOLS.has(parsed.protocol)) return parsed.href;
  } catch {
    // Search input and bare hostnames are resolved below.
  }

  if (looksLikeHost(value)) {
    const protocol = isLocalHost(value) ? 'http://' : 'https://';
    try { return new URL(`${protocol}${value}`).href; } catch { /* fall through */ }
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function isAllowedNavigation(value, { allowFile = false } = {}) {
  try {
    const parsed = new URL(value);
    return WEB_PROTOCOLS.has(parsed.protocol) || (allowFile && INTERNAL_PROTOCOLS.has(parsed.protocol));
  } catch {
    return false;
  }
}

function displayAddress(value, newTabUrl = '') {
  if (!value || value === newTabUrl || value.startsWith('file:')) return '';
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}

function originMatches(value, expected) {
  try { return new URL(value).origin === new URL(expected).origin; } catch { return false; }
}

module.exports = {
  displayAddress,
  isAllowedNavigation,
  isLocalHost,
  looksLikeHost,
  originMatches,
  resolveAddress
};
