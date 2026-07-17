const { SPACE_COLORS, SPACE_ICONS, displayAddress } = CanopyCore;

const COLOR_VALUES = {
  grey: '#8a9690', blue: '#6c9dff', red: '#ef806f', yellow: '#e0b85b', green: '#58c783',
  pink: '#dc86ad', purple: '#b78bea', cyan: '#55bdc7', orange: '#e79857'
};
const ICON_VALUES = { leaf: '♧', briefcase: '▣', book: '▤', code: '⌘', home: '⌂', star: '★', globe: '◎', game: '◇' };

let state = null;
let windowId = null;
let selectedColor = 'green';
let selectedIcon = 'leaf';
let refreshTimer = null;

const elementIds = [
  'browser-view', 'space-list', 'tab-list', 'pinned-list', 'pinned-section', 'pinned-count',
  'space-dots',
  'active-space-name', 'active-space-icon', 'tab-count', 'address-form', 'address-input',
  'space-dialog', 'space-form', 'space-name', 'space-message', 'color-options', 'icon-options',
  'folder-dialog', 'folder-form', 'folder-name', 'folder-message', 'settings-button', 'settings-view',
  'settings-nav', 'close-settings', 'managed-spaces', 'home-page-input', 'auto-archive-select',
  'peek-toggle', 'compact-tabs-toggle', 'reduce-motion-toggle', 'space-swipe-toggle',
  'google-location-toggle', 'theme-control', 'downloads-button', 'history-button', 'profiles-button',
  'passwords-button', 'extensions-button', 'import-data-button', 'performance-button', 'export-workspace-button',
  'import-workspace-button', 'import-workspace-file', 'content-settings-button', 'game-url-input', 'open-game-button', 'new-tab-button',
  'add-space-button', 'add-folder-button', 'share-space-button', 'favorite-current', 'favorite-count',
  'favorites-list', 'capture-button', 'media-dock', 'library-button', 'library-view', 'close-library',
  'library-tabs', 'archive-list', 'capture-list', 'clear-archive-button', 'route-form', 'route-pattern',
  'route-match', 'route-space', 'route-message', 'route-list', 'toast'
];
const elements = Object.fromEntries(elementIds.map(id => [id, document.getElementById(id)]));

async function request(message) {
  return chrome.runtime.sendMessage({ ...message, windowId });
}

function escapeText(value) {
  const node = document.createElement('span');
  node.textContent = String(value || '');
  return node.innerHTML;
}

function showToast(message) {
  if (!message) return;
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 2200);
}

async function report(result, successMessage = '') {
  if (result?.ok === false) showToast(result.message || 'That action could not be completed.');
  else if (successMessage) showToast(successMessage);
  return result;
}

function activeSpace() {
  return state?.spaces.find(space => space.id === state.activeGroupId) || state?.spaces[0] || null;
}

function favicon(item) {
  if (item.favIconUrl) return `<img src="${escapeText(item.favIconUrl)}" alt="">`;
  return escapeText((item.title || 'N').trim().charAt(0).toUpperCase() || 'N');
}

function formattedAge(value) {
  const delta = Math.max(0, Date.now() - Number(value || Date.now()));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderFavorites() {
  elements['favorite-count'].textContent = `${state.favorites.length} / 12`;
  const favorites = state.favorites.map(item => `
    <div class="favorite-item${item.openTabId ? ' favorite-open' : ''}" data-favorite-id="${escapeText(item.id)}">
      <button class="favorite-button" data-action="open-favorite" title="${escapeText(item.title)}" aria-label="Open ${escapeText(item.title)}">
        <span>${favicon(item)}</span>
      </button>
      <button class="favorite-remove" data-action="remove-favorite" aria-label="Remove ${escapeText(item.title)}">×</button>
    </div>`).join('');
  const add = state.favorites.length < 12
    ? '<div class="favorite-item"><button class="favorite-add" data-action="add-favorite" title="Add current page" aria-label="Add current page to Favorites">＋</button></div>'
    : '';
  elements['favorites-list'].innerHTML = favorites + add;
}

function renderSpaces() {
  elements['space-list'].innerHTML = state.spaces.map(space => `
    <button class="space-button${space.id === state.activeGroupId ? ' active' : ''}" data-space-id="${space.id}" style="--space-color:${COLOR_VALUES[space.color] || COLOR_VALUES.grey}">
      <span class="space-icon">${ICON_VALUES[space.icon] || ICON_VALUES.leaf}</span><span>${escapeText(space.name)}</span>
    </button>`).join('');
  const space = activeSpace();
  document.documentElement.style.setProperty('--active-space-color', COLOR_VALUES[space?.color] || COLOR_VALUES.green);
  elements['active-space-name'].textContent = space?.name || 'Space';
  elements['active-space-icon'].textContent = ICON_VALUES[space?.icon] || ICON_VALUES.leaf;
  elements['active-space-icon'].style.setProperty('--space-color', COLOR_VALUES[space?.color] || COLOR_VALUES.green);
  elements['space-dots'].innerHTML = state.spaces.map(item => `<button class="space-dot-button${item.id === state.activeGroupId ? ' active' : ''}" data-space-dot="${item.id}" style="--space-color:${COLOR_VALUES[item.color] || COLOR_VALUES.grey}" aria-label="Switch to ${escapeText(item.name)}" title="${escapeText(item.name)}"><span></span></button>`).join('');
}

function pinMarkup(pin, space, folders) {
  const options = ['<option value="">No folder</option>', ...folders.map(folder => `<option value="${escapeText(folder.id)}"${pin.folderId === folder.id ? ' selected' : ''}>${escapeText(folder.name)}</option>`)].join('');
  return `<div class="pin-row" data-pin-id="${escapeText(pin.id)}" data-pin-url="${escapeText(pin.url)}">
    <button class="pin-select" data-action="open-pin">
      <span class="tab-favicon">${favicon(pin)}</span>
      <span class="tab-copy"><strong>${escapeText(pin.title)}</strong><small>${escapeText(displayAddress(pin.url))}</small></span>
      ${pin.openTabId ? '<span class="status-dot" title="Open"></span>' : ''}
    </button>
    <select class="folder-select" data-action="move-pin" aria-label="Move pinned tab to folder">${options}</select>
    <div class="tab-tools">
      <button class="mini-action" data-action="reset-pin" title="Reset to pinned URL" aria-label="Reset pinned tab">↺</button>
      <button class="mini-action" data-action="peek-pin" title="Open in Peek" aria-label="Open pinned tab in Peek">◧</button>
      <button class="mini-action danger" data-action="remove-pin" title="Unpin" aria-label="Unpin">×</button>
    </div>
  </div>`;
}

function renderPinned() {
  const space = activeSpace();
  if (!space) return;
  elements['pinned-count'].textContent = String(space.pinned.length);
  elements['pinned-section'].hidden = space.pinned.length === 0 && space.folders.length === 0;
  const unfiled = space.pinned.filter(pin => !pin.folderId);
  const folders = space.folders.map(folder => {
    const pins = space.pinned.filter(pin => pin.folderId === folder.id);
    return `<details class="folder" data-folder-id="${escapeText(folder.id)}"${folder.collapsed ? '' : ' open'}>
      <summary><span>${escapeText(folder.name)}</span><small>${pins.length}</small><button class="mini-action danger" data-action="delete-folder" title="Delete folder" aria-label="Delete ${escapeText(folder.name)}">×</button></summary>
      <div class="folder-content">${pins.length ? pins.map(pin => pinMarkup(pin, space, space.folders)).join('') : '<div class="empty-state">Drop pinned pages here</div>'}</div>
    </details>`;
  }).join('');
  elements['pinned-list'].innerHTML = `${unfiled.map(pin => pinMarkup(pin, space, space.folders)).join('')}${folders}` || '<div class="empty-state">No pinned pages</div>';
  for (const details of elements['pinned-list'].querySelectorAll('details.folder')) {
    details.addEventListener('toggle', () => request({ type: 'updateFolder', spaceName: space.name, folderId: details.dataset.folderId, patch: { collapsed: !details.open } }));
  }
}

function tabMarkup(tab) {
  return `<div class="tab-row${tab.active ? ' active' : ''}" data-tab-id="${tab.id}" data-tab-url="${escapeText(tab.url)}">
    <button class="tab-select" data-action="activate">
      <span class="tab-favicon">${favicon(tab)}</span>
      <span class="tab-copy"><strong>${escapeText(tab.title)}</strong><small>${escapeText(displayAddress(tab.url))}</small></span>
      ${tab.audible ? '<span class="status-dot" title="Playing audio"></span>' : ''}
    </button>
    <div class="tab-tools">
      <button class="mini-action" data-action="pin" title="Pin tab" aria-label="Pin ${escapeText(tab.title)}">◇</button>
      <button class="mini-action" data-action="peek" title="Open in Peek" aria-label="Open ${escapeText(tab.title)} in Peek">◧</button>
      <button class="mini-action" data-action="split" title="Open side by side" aria-label="Open ${escapeText(tab.title)} side by side">▥</button>
      <button class="mini-action" data-action="archive" title="Archive tab" aria-label="Archive ${escapeText(tab.title)}">⌄</button>
      <button class="mini-action danger" data-action="close" title="Close tab" aria-label="Close ${escapeText(tab.title)}">×</button>
    </div>
  </div>`;
}

function renderToday() {
  const space = activeSpace();
  elements['tab-count'].textContent = `${space?.tabs.length || 0} tab${space?.tabs.length === 1 ? '' : 's'}`;
  elements['tab-list'].innerHTML = space?.tabs.length
    ? space.tabs.map(tabMarkup).join('')
    : '<div class="empty-state"><strong>Today is clear</strong><span>Press ⌘T to start somewhere.</span></div>';
}

function renderMedia() {
  const item = state.audibleTabs.find(tab => tab.active) || state.audibleTabs[0];
  elements['media-dock'].hidden = !item;
  if (!item) {
    elements['media-dock'].innerHTML = '';
    return;
  }
  elements['media-dock'].innerHTML = `<div class="media-row" data-tab-id="${item.id}">
    <span class="tab-favicon">${favicon(item)}</span>
    <span class="tab-copy"><strong>${escapeText(item.title)}</strong><small>${item.muted ? 'Muted' : 'Playing audio'}</small></span>
    <div class="media-actions"><button class="mini-action" data-action="activate-media" title="Show tab">↗</button><button class="mini-action" data-action="mute-media" title="${item.muted ? 'Unmute' : 'Mute'}">${item.muted ? '▷' : 'Ⅱ'}</button><button class="mini-action" data-action="pip" title="Picture in Picture">▣</button></div>
  </div>`;
}

function renderLibrary() {
  elements['archive-list'].innerHTML = state.archive.length ? state.archive.map(item => `
    <div class="library-item" data-archive-id="${escapeText(item.id)}">
      <span class="tab-favicon">${favicon(item)}</span>
      <span class="tab-copy"><strong>${escapeText(item.title)}</strong><small>${escapeText(item.spaceName)} · ${escapeText(displayAddress(item.url))}</small><time>${formattedAge(item.archivedAt)}</time></span>
      <button class="secondary-button compact-button" data-action="restore-archive">Restore</button>
    </div>`).join('') : '<div class="empty-state"><strong>Archive is empty</strong><span>Closed inactive tabs will appear here.</span></div>';
  elements['capture-list'].innerHTML = state.captures.length ? state.captures.map(item => `
    <div class="library-item"><span class="tab-favicon">▣</span><span class="tab-copy"><strong>${escapeText(item.title)}</strong><small>${escapeText(item.filename)}</small><time>${formattedAge(item.createdAt)}</time></span></div>`).join('') : '<div class="empty-state"><strong>No captures yet</strong><span>Use the capture button in the sidebar header.</span></div>';
}

function renderManagedSpaces() {
  elements['managed-spaces'].innerHTML = state.spaces.map(space => `
    <div class="managed-space" data-group-id="${space.id}">
      <select data-field="icon" aria-label="Space icon">${SPACE_ICONS.map(icon => `<option value="${icon}"${space.icon === icon ? ' selected' : ''}>${ICON_VALUES[icon]}</option>`).join('')}</select>
      <input data-field="name" maxlength="28" value="${escapeText(space.name)}" aria-label="Space name">
      <select data-field="color" aria-label="Space color">${SPACE_COLORS.map(color => `<option value="${color}"${space.color === color ? ' selected' : ''}>${color}</option>`).join('')}</select>
      <button class="icon-button danger" data-action="delete-space" ${state.spaces.length <= 1 ? 'disabled' : ''} aria-label="Delete ${escapeText(space.name)}">×</button>
      <div class="managed-space-actions"><button class="secondary-button compact-button" data-action="save-space">Save</button></div>
    </div>`).join('');
}

function renderRoutes() {
  elements['route-space'].innerHTML = state.spaces.map(space => `<option value="${escapeText(space.name)}">${escapeText(space.name)}</option>`).join('');
  elements['route-list'].innerHTML = state.routes.length ? state.routes.map(route => `
    <div class="route-item" data-route-id="${escapeText(route.id)}"><div><strong>${escapeText(route.pattern)}</strong><small>${escapeText(route.match)} → ${escapeText(route.spaceName)}</small></div><button class="mini-action danger" data-action="delete-route" aria-label="Delete route">×</button></div>`).join('') : '<div class="empty-state">No URL routes</div>';
}

function syncSettingsControls() {
  const value = state.settings;
  elements['home-page-input'].value = value.homePage;
  elements['game-url-input'].value = value.gameUrl;
  elements['auto-archive-select'].value = String(value.autoArchiveHours);
  elements['peek-toggle'].checked = value.openPeekForPinnedLinks;
  elements['compact-tabs-toggle'].checked = value.compactTabs;
  elements['reduce-motion-toggle'].checked = value.reduceMotion;
  elements['space-swipe-toggle'].checked = value.spaceSwipeEnabled;
  elements['google-location-toggle'].checked = value.blockGoogleLocation;
  for (const button of elements['theme-control'].querySelectorAll('button')) button.classList.toggle('active', button.dataset.value === value.theme);
}

function render() {
  if (!state) return;
  document.body.className = `theme-${state.settings.theme}${state.settings.reduceMotion ? ' reduce-motion' : ''}${state.settings.compactTabs ? ' compact' : ''}`;
  renderFavorites();
  renderSpaces();
  renderPinned();
  renderToday();
  renderMedia();
  renderLibrary();
  renderManagedSpaces();
  renderRoutes();
  syncSettingsControls();
}

async function refresh() {
  const next = await request({ type: 'getState' });
  if (next?.apiVersion !== 3) {
    showToast('Restart Canopy to finish updating the workspace service.');
    return;
  }
  state = next;
  render();
}

function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 90);
}

function renderDialogOptions() {
  elements['color-options'].innerHTML = SPACE_COLORS.slice(0, 8).map(color => `<button type="button" class="color-option${color === selectedColor ? ' active' : ''}" data-color="${color}" style="--space-color:${COLOR_VALUES[color]}"><span></span></button>`).join('');
  elements['icon-options'].innerHTML = SPACE_ICONS.map(icon => `<button type="button" class="icon-option${icon === selectedIcon ? ' active' : ''}" data-icon="${icon}" title="${icon}">${ICON_VALUES[icon]}</button>`).join('');
}

function openSpaceDialog() {
  elements['space-name'].value = '';
  elements['space-message'].textContent = '';
  selectedColor = 'green';
  selectedIcon = 'leaf';
  renderDialogOptions();
  elements['space-dialog'].showModal();
  elements['space-name'].focus();
}

async function saveSetting(patch) {
  state.settings = await request({ type: 'saveSettings', patch });
  render();
}

elements['address-form'].addEventListener('submit', async event => {
  event.preventDefault();
  if (await request({ type: 'openUrl', value: elements['address-input'].value })) elements['address-input'].value = '';
});
elements['new-tab-button'].addEventListener('click', () => request({ type: 'openNewTab' }));
elements['add-space-button'].addEventListener('click', openSpaceDialog);
elements['space-list'].addEventListener('click', event => {
  const button = event.target.closest('[data-space-id]');
  if (button) request({ type: 'switchSpace', groupId: Number(button.dataset.spaceId) });
});
elements['space-dots'].addEventListener('click', event => {
  const button = event.target.closest('[data-space-dot]');
  if (button) request({ type: 'switchSpace', groupId: Number(button.dataset.spaceDot) });
});

elements['favorites-list'].addEventListener('click', async event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const item = event.target.closest('[data-favorite-id]');
  if (action === 'add-favorite') return report(await request({ type: 'toggleFavorite', tabId: state.activeTabId }));
  if (!item) return;
  if (action === 'open-favorite') await request({ type: 'openFavorite', favoriteId: item.dataset.favoriteId });
  if (action === 'remove-favorite') await request({ type: 'removeFavorite', favoriteId: item.dataset.favoriteId });
});
elements['favorite-current'].addEventListener('click', async () => report(await request({ type: 'toggleFavorite', tabId: state.activeTabId })));
elements['capture-button'].addEventListener('click', async () => report(await request({ type: 'captureCurrentTab' }), 'Capture saved to Downloads.'));

elements['tab-list'].addEventListener('click', async event => {
  const row = event.target.closest('[data-tab-id]');
  if (!row) return;
  const action = event.target.closest('[data-action]')?.dataset.action || 'activate';
  const tabId = Number(row.dataset.tabId);
  if (action === 'activate') await request({ type: 'activateTab', tabId });
  if (action === 'close') await request({ type: 'closeTab', tabId });
  if (action === 'pin') await report(await request({ type: 'togglePin', tabId }));
  if (action === 'peek') await report(await request({ type: 'openPeek', value: row.dataset.tabUrl }));
  if (action === 'split') await report(await request({ type: 'openSideBySide', tabId }));
  if (action === 'archive') await report(await request({ type: 'archiveTab', tabId }));
});

elements['pinned-list'].addEventListener('click', async event => {
  const space = activeSpace();
  const pin = event.target.closest('[data-pin-id]');
  const folder = event.target.closest('[data-folder-id]');
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'delete-folder' && folder) {
    event.preventDefault();
    await request({ type: 'deleteFolder', spaceName: space.name, folderId: folder.dataset.folderId });
    return;
  }
  if (!pin) return;
  if (action === 'open-pin') await request({ type: 'openPinned', spaceName: space.name, pinId: pin.dataset.pinId });
  if (action === 'reset-pin') await request({ type: 'openPinned', spaceName: space.name, pinId: pin.dataset.pinId, reset: true });
  if (action === 'peek-pin') await request({ type: 'openPeek', value: pin.dataset.pinUrl });
  if (action === 'remove-pin') await request({ type: 'removePin', spaceName: space.name, pinId: pin.dataset.pinId });
});
elements['pinned-list'].addEventListener('change', event => {
  const select = event.target.closest('[data-action="move-pin"]');
  const pin = event.target.closest('[data-pin-id]');
  if (select && pin) request({ type: 'movePin', spaceName: activeSpace().name, pinId: pin.dataset.pinId, folderId: select.value || null });
});

elements['add-folder-button'].addEventListener('click', () => {
  elements['folder-name'].value = '';
  elements['folder-message'].textContent = '';
  elements['folder-dialog'].showModal();
  elements['folder-name'].focus();
});
elements['folder-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const result = await request({ type: 'createFolder', spaceName: activeSpace().name, name: elements['folder-name'].value });
  if (result?.ok) elements['folder-dialog'].close();
  else elements['folder-message'].textContent = result?.message || 'Could not create folder.';
});
elements['share-space-button'].addEventListener('click', async () => {
  const result = await request({ type: 'shareSpace', groupId: activeSpace().id });
  if (!result?.ok) return showToast(result?.message);
  await navigator.clipboard.writeText(result.text);
  showToast('Space links copied.');
});

elements['color-options'].addEventListener('click', event => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  selectedColor = button.dataset.color;
  renderDialogOptions();
});
elements['icon-options'].addEventListener('click', event => {
  const button = event.target.closest('[data-icon]');
  if (!button) return;
  selectedIcon = button.dataset.icon;
  renderDialogOptions();
});
elements['space-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const result = await request({ type: 'createSpace', name: elements['space-name'].value, color: selectedColor, icon: selectedIcon });
  if (result?.ok) elements['space-dialog'].close();
  else elements['space-message'].textContent = result?.message || 'Could not create Space.';
});

elements['media-dock'].addEventListener('click', async event => {
  const row = event.target.closest('[data-tab-id]');
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!row || !action) return;
  if (action === 'activate-media') await request({ type: 'activateTab', tabId: Number(row.dataset.tabId) });
  if (action === 'mute-media') await request({ type: 'toggleMute', tabId: Number(row.dataset.tabId) });
  if (action === 'pip') await report(await request({ type: 'enterPictureInPicture' }));
});

elements['library-button'].addEventListener('click', () => { elements['library-view'].hidden = false; });
elements['close-library'].addEventListener('click', () => { elements['library-view'].hidden = true; });
elements['library-tabs'].addEventListener('click', event => {
  const button = event.target.closest('[data-library]');
  if (!button) return;
  for (const item of elements['library-tabs'].querySelectorAll('button')) item.classList.toggle('active', item === button);
  for (const panel of document.querySelectorAll('[data-library-panel]')) panel.classList.toggle('active', panel.dataset.libraryPanel === button.dataset.library);
});
elements['archive-list'].addEventListener('click', async event => {
  const item = event.target.closest('[data-archive-id]');
  if (item && event.target.closest('[data-action="restore-archive"]')) await request({ type: 'restoreArchive', archiveId: item.dataset.archiveId });
});
elements['clear-archive-button'].addEventListener('click', () => request({ type: 'clearArchive' }));
elements['capture-list'].addEventListener('click', () => request({ type: 'openDownloads' }));

elements['settings-button'].addEventListener('click', () => { elements['settings-view'].hidden = false; });
elements['close-settings'].addEventListener('click', () => { elements['settings-view'].hidden = true; });
elements['settings-nav'].addEventListener('click', event => {
  const button = event.target.closest('[data-section]');
  if (!button) return;
  for (const item of elements['settings-nav'].querySelectorAll('button')) item.classList.toggle('active', item === button);
  for (const panel of document.querySelectorAll('[data-panel]')) panel.classList.toggle('active', panel.dataset.panel === button.dataset.section);
});

elements['managed-spaces'].addEventListener('click', async event => {
  const row = event.target.closest('[data-group-id]');
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!row || !action) return;
  if (action === 'delete-space') await report(await request({ type: 'deleteSpace', groupId: Number(row.dataset.groupId) }));
  if (action === 'save-space') {
    const result = await request({
      type: 'updateSpace',
      groupId: Number(row.dataset.groupId),
      name: row.querySelector('[data-field="name"]').value,
      icon: row.querySelector('[data-field="icon"]').value,
      color: row.querySelector('[data-field="color"]').value
    });
    await report(result, result?.ok ? 'Space updated.' : '');
  }
});

elements['route-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const result = await request({ type: 'addRoute', pattern: elements['route-pattern'].value, match: elements['route-match'].value, spaceName: elements['route-space'].value });
  if (result?.ok) {
    elements['route-pattern'].value = '';
    elements['route-message'].textContent = '';
  } else elements['route-message'].textContent = result?.message || 'Could not add route.';
});
elements['route-list'].addEventListener('click', event => {
  const row = event.target.closest('[data-route-id]');
  if (row && event.target.closest('[data-action="delete-route"]')) request({ type: 'deleteRoute', routeId: row.dataset.routeId });
});

elements['home-page-input'].addEventListener('change', event => saveSetting({ homePage: event.target.value }));
elements['game-url-input'].addEventListener('change', event => saveSetting({ gameUrl: event.target.value }));
elements['auto-archive-select'].addEventListener('change', event => saveSetting({ autoArchiveHours: Number(event.target.value) }));
elements['peek-toggle'].addEventListener('change', event => saveSetting({ openPeekForPinnedLinks: event.target.checked }));
elements['compact-tabs-toggle'].addEventListener('change', event => saveSetting({ compactTabs: event.target.checked }));
elements['reduce-motion-toggle'].addEventListener('change', event => saveSetting({ reduceMotion: event.target.checked }));
elements['space-swipe-toggle'].addEventListener('change', event => saveSetting({ spaceSwipeEnabled: event.target.checked }));
elements['google-location-toggle'].addEventListener('change', event => saveSetting({ blockGoogleLocation: event.target.checked }));
elements['theme-control'].addEventListener('click', event => { if (event.target.dataset.value) saveSetting({ theme: event.target.dataset.value }); });
elements['downloads-button'].addEventListener('click', () => request({ type: 'openDownloads' }));
elements['history-button'].addEventListener('click', () => request({ type: 'openHistory' }));
elements['profiles-button'].addEventListener('click', () => request({ type: 'openProfiles' }));
elements['passwords-button'].addEventListener('click', () => request({ type: 'openPasswords' }));
elements['extensions-button'].addEventListener('click', () => request({ type: 'openExtensions' }));
elements['import-data-button'].addEventListener('click', () => request({ type: 'openImportData' }));
elements['performance-button'].addEventListener('click', () => request({ type: 'openPerformance' }));
elements['export-workspace-button'].addEventListener('click', () => request({ type: 'exportWorkspace' }));
elements['import-workspace-button'].addEventListener('click', () => elements['import-workspace-file'].click());
elements['import-workspace-file'].addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const result = await request({ type: 'importWorkspace', payload: JSON.parse(await file.text()) });
    await report(result, result?.ok ? 'Workspace restored.' : '');
  } catch {
    showToast('The selected file is not valid JSON.');
  }
  event.target.value = '';
});
elements['content-settings-button'].addEventListener('click', () => request({ type: 'openContentSettings' }));
elements['open-game-button'].addEventListener('click', () => request({ type: 'openGame' }));

window.addEventListener('wheel', event => {
  if (!event.isTrusted || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15) return;
  clearTimeout(window.__canopyWheelReset);
  window.__canopyWheelDistance = (window.__canopyWheelDistance || 0) + event.deltaX;
  window.__canopyWheelReset = setTimeout(() => { window.__canopyWheelDistance = 0; }, 180);
  if (Math.abs(window.__canopyWheelDistance) >= 120) {
    request({ type: 'cycleSpace', direction: window.__canopyWheelDistance > 0 ? 'next' : 'previous' });
    window.__canopyWheelDistance = 0;
  }
}, { passive: true });

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'stateChanged') queueRefresh();
  if (message.type === 'showLibrary') elements['library-view'].hidden = false;
});

(async () => {
  windowId = (await chrome.windows.getCurrent()).id;
  renderDialogOptions();
  await refresh();
})().catch(error => showToast(error.message));
