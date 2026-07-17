const { displayAddress, resolveAddress } = CanopyCore;

const COLORS = { grey: '#8a9690', blue: '#6c9dff', red: '#ef806f', yellow: '#e0b85b', green: '#58c783', pink: '#dc86ad', purple: '#b78bea', cyan: '#55bdc7', orange: '#e79857' };
const ICONS = { leaf: '♧', briefcase: '▣', book: '▤', code: '⌘', home: '⌂', star: '★', globe: '◎', game: '◇' };
const COMMANDS = [
  { id: 'openSidebar', title: 'Open Canopy sidebar', subtitle: 'Workspace controls', icon: '☰' },
  { id: 'openDownloads', title: 'Open Downloads', subtitle: 'Chromium downloads', icon: '↓' },
  { id: 'openHistory', title: 'Open History', subtitle: 'Recently visited pages', icon: '↺' },
  { id: 'openProfiles', title: 'Manage Profiles', subtitle: 'Cookies, logins and history', icon: '◉' },
  { id: 'openExtensions', title: 'Manage Extensions', subtitle: 'Chrome extensions', icon: '◇' }
];

let state = null;
let windowId = null;
let results = [];
let selectedIndex = 0;
let queryGeneration = 0;

const elements = Object.fromEntries([
  'active-space', 'sidebar-button', 'time', 'command-form', 'command-input', 'command-results',
  'favorite-count', 'favorite-grid', 'space-grid', 'archive-grid', 'library-button'
].map(id => [id, document.getElementById(id)]));

function escapeText(value) {
  const node = document.createElement('span');
  node.textContent = String(value || '');
  return node.innerHTML;
}

function favicon(item) {
  if (item.favIconUrl) return `<img src="${escapeText(item.favIconUrl)}" alt="">`;
  return escapeText((item.title || 'N').trim().charAt(0).toUpperCase() || 'N');
}

function age(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - Number(value || Date.now())) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

async function request(message) {
  return chrome.runtime.sendMessage({ ...message, windowId });
}

async function navigate(value) {
  const url = resolveAddress(value);
  const current = (await chrome.tabs.query({ currentWindow: true, active: true }))[0];
  if (current?.id && url) await chrome.tabs.update(current.id, { url });
}

function activeSpace() {
  return state.spaces.find(space => space.id === state.activeGroupId) || state.spaces[0];
}

function renderDashboard() {
  const space = activeSpace();
  document.documentElement.style.setProperty('--active-space-color', COLORS[space?.color] || COLORS.green);
  document.body.className = `theme-${state.settings.theme}${state.settings.reduceMotion ? ' reduce-motion' : ''}`;
  elements['active-space'].style.setProperty('--space-color', COLORS[space?.color] || COLORS.green);
  elements['active-space'].innerHTML = `<span>${ICONS[space?.icon] || ICONS.leaf}</span><strong>${escapeText(space?.name || 'Space')}</strong>`;
  elements['favorite-count'].textContent = `${state.favorites.length} / 12`;
  elements['favorite-grid'].innerHTML = state.favorites.length ? state.favorites.map(item => `
    <button class="favorite" data-favorite-url="${escapeText(item.url)}" title="${escapeText(item.title)}">
      <span class="favicon">${favicon(item)}</span><strong>${escapeText(item.title)}</strong>
    </button>`).join('') : '<div class="empty">Add Favorites from the Canopy sidebar.</div>';
  elements['space-grid'].innerHTML = state.spaces.map(item => `
    <button class="space-card${item.id === state.activeGroupId ? ' active' : ''}" data-space-id="${item.id}" style="--space-color:${COLORS[item.color] || COLORS.grey}">
      <span class="space-icon">${ICONS[item.icon] || ICONS.leaf}</span>
      <span class="space-copy"><strong>${escapeText(item.name)}</strong><small>${item.pinned.length} pinned · ${item.tabs.length} Today</small></span>
      <small>${item.id === state.activeGroupId ? 'ACTIVE' : 'OPEN'}</small>
    </button>`).join('');
  elements['archive-grid'].innerHTML = state.archive.length ? state.archive.slice(0, 5).map(item => `
    <button class="archive-item" data-archive-id="${escapeText(item.id)}">
      <span class="favicon">${favicon(item)}</span>
      <span class="copy"><strong>${escapeText(item.title)}</strong><small>${escapeText(item.spaceName)} · ${escapeText(displayAddress(item.url))}</small></span>
      <time>${age(item.archivedAt)}</time>
    </button>`).join('') : '<div class="empty">Archive is empty.</div>';
}

function updateClock() {
  elements.time.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function resultMarkup(item, index) {
  const icon = item.favIconUrl ? `<img src="${escapeText(item.favIconUrl)}" alt="">` : escapeText(item.icon || (item.title || 'N').charAt(0));
  return `<button class="result-row${index === selectedIndex ? ' selected' : ''}" data-result-index="${index}">
    <span class="result-icon">${icon}</span>
    <span class="result-copy"><strong>${escapeText(item.title)}</strong><small>${escapeText(item.subtitle || '')}</small></span>
    <span class="result-kind">${escapeText(item.kind || '')}</span>
  </button>`;
}

function renderResults() {
  elements['command-results'].hidden = results.length === 0;
  elements['command-results'].innerHTML = results.map(resultMarkup).join('');
}

async function search(query) {
  const generation = ++queryGeneration;
  const value = query.trim().toLocaleLowerCase('en-US');
  if (!value) {
    results = [];
    selectedIndex = 0;
    return renderResults();
  }
  const words = value.split(/\s+/);
  const matches = text => words.every(word => String(text || '').toLocaleLowerCase('en-US').includes(word));
  const commandResults = COMMANDS.filter(command => matches(`${command.title} ${command.subtitle}`)).map(command => ({ ...command, type: 'command', kind: 'COMMAND' }));
  const spaceResults = state.spaces.filter(space => matches(space.name)).map(space => ({ type: 'space', groupId: space.id, title: space.name, subtitle: `${space.pinned.length} pinned · ${space.tabs.length} Today`, icon: ICONS[space.icon], kind: 'SPACE' }));
  const tabResults = state.spaces.flatMap(space => [...space.pinned, ...space.tabs].map(tab => ({ type: 'tab', tabId: tab.openTabId || tab.id, url: tab.url, title: tab.title, subtitle: `${space.name} · ${displayAddress(tab.url)}`, favIconUrl: tab.favIconUrl, kind: 'TAB' }))).filter(tab => matches(`${tab.title} ${tab.url}`));
  const history = await chrome.history.search({ text: query, maxResults: 24, startTime: 0 });
  if (generation !== queryGeneration) return;
  const seen = new Set(tabResults.map(item => item.url));
  const historyResults = history.filter(item => item.url && !seen.has(item.url)).map(item => ({ type: 'history', url: item.url, title: item.title || displayAddress(item.url), subtitle: displayAddress(item.url), kind: 'HISTORY' }));
  results = [...commandResults, ...spaceResults, ...tabResults, ...historyResults].slice(0, 18);
  selectedIndex = 0;
  renderResults();
}

async function execute(item) {
  if (!item) return navigate(elements['command-input'].value);
  if (item.type === 'command') return request({ type: item.id });
  if (item.type === 'space') return request({ type: 'switchSpace', groupId: item.groupId });
  if (item.type === 'tab' && item.tabId) return request({ type: 'activateTab', tabId: item.tabId });
  if (item.url) return navigate(item.url);
}

elements['command-input'].addEventListener('input', event => search(event.target.value));
elements['command-input'].addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' && results.length) {
    event.preventDefault();
    selectedIndex = (selectedIndex + 1) % results.length;
    renderResults();
  }
  if (event.key === 'ArrowUp' && results.length) {
    event.preventDefault();
    selectedIndex = (selectedIndex - 1 + results.length) % results.length;
    renderResults();
  }
  if (event.key === 'Escape') {
    elements['command-input'].value = '';
    results = [];
    renderResults();
  }
});
elements['command-form'].addEventListener('submit', event => {
  event.preventDefault();
  execute(results[selectedIndex]);
});
elements['command-results'].addEventListener('click', event => {
  const row = event.target.closest('[data-result-index]');
  if (row) execute(results[Number(row.dataset.resultIndex)]);
});
elements['favorite-grid'].addEventListener('click', event => {
  const item = event.target.closest('[data-favorite-url]');
  if (item) navigate(item.dataset.favoriteUrl);
});
elements['space-grid'].addEventListener('click', event => {
  const item = event.target.closest('[data-space-id]');
  if (item) request({ type: 'switchSpace', groupId: Number(item.dataset.spaceId) });
});
elements['archive-grid'].addEventListener('click', event => {
  const item = event.target.closest('[data-archive-id]');
  if (item) request({ type: 'restoreArchive', archiveId: item.dataset.archiveId });
});
elements['sidebar-button'].addEventListener('click', () => request({ type: 'openSidebar' }));
elements['library-button'].addEventListener('click', () => request({ type: 'openLibraryView' }));
document.querySelector('.quick-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-command]');
  if (button) request({ type: button.dataset.command });
});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('en-US') === 'k') {
    event.preventDefault();
    elements['command-input'].focus();
    elements['command-input'].select();
  }
});
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'stateChanged') request({ type: 'getState' }).then(next => {
    if (next?.apiVersion !== 3) return;
    state = next;
    renderDashboard();
  });
});

(async () => {
  windowId = (await chrome.windows.getCurrent()).id;
  state = await request({ type: 'getState' });
  if (state?.apiVersion !== 3) return;
  renderDashboard();
  updateClock();
  setInterval(updateClock, 15000);
  elements['command-input'].focus();
})().catch(() => {});
