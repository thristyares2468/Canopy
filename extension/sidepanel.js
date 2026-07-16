const { SPACE_COLORS, displayAddress } = CanopyCore;
const COLOR_VALUES = { grey: '#8a9690', blue: '#6c9dff', red: '#ef806f', yellow: '#e0b85b', green: '#58c783', pink: '#dc86ad', purple: '#b78bea', cyan: '#55bdc7', orange: '#e79857' };

let state = null;
let windowId = null;
let selectedColor = 'green';
let refreshTimer = null;

const elements = Object.fromEntries([
  'space-list', 'tab-list', 'active-space-name', 'tab-count', 'address-form', 'address-input',
  'space-dialog', 'space-form', 'space-name', 'space-message', 'color-options', 'settings-button',
  'settings-view', 'settings-nav', 'close-settings', 'managed-spaces', 'home-page-input',
  'compact-tabs-toggle', 'reduce-motion-toggle', 'space-swipe-toggle', 'google-location-toggle',
  'theme-control', 'downloads-button', 'content-settings-button', 'game-url-input', 'open-game-button',
  'new-tab-button', 'add-space-button', 'toast'
].map(id => [id, document.getElementById(id)]));

async function request(message) {
  return chrome.runtime.sendMessage({ ...message, windowId });
}

function escapeText(value) {
  const node = document.createElement('span');
  node.textContent = String(value || '');
  return node.innerHTML;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 1800);
}

function favicon(tab) {
  if (tab.favIconUrl) return `<img src="${escapeText(tab.favIconUrl)}" alt="">`;
  return escapeText((tab.title || 'N').trim().charAt(0).toUpperCase() || 'N');
}

function render() {
  if (!state) return;
  const activeSpace = state.spaces.find(space => space.id === state.activeGroupId) || state.spaces[0];
  document.body.className = `theme-${state.settings.theme}${state.settings.reduceMotion ? ' reduce-motion' : ''}${state.settings.compactTabs ? ' compact' : ''}`;
  elements['space-list'].innerHTML = state.spaces.map(space => `<button class="space-button${space.id === state.activeGroupId ? ' active' : ''}" data-space-id="${space.id}" style="--space-color:${COLOR_VALUES[space.color] || COLOR_VALUES.grey}"><span class="space-dot"></span><span>${escapeText(space.name)}</span></button>`).join('');
  elements['active-space-name'].textContent = activeSpace?.name || 'Space';
  elements['tab-count'].textContent = `${activeSpace?.tabs.length || 0} tab${activeSpace?.tabs.length === 1 ? '' : 's'}`;
  elements['tab-list'].innerHTML = activeSpace?.tabs.length ? activeSpace.tabs.map(tab => `<div class="tab-row${tab.active ? ' active' : ''}" data-tab-id="${tab.id}"><button class="tab-select" data-action="activate"><span class="tab-favicon">${favicon(tab)}</span><span class="tab-copy"><strong>${escapeText(tab.title)}</strong><small>${escapeText(displayAddress(tab.url))}</small></span></button><button class="tab-close" data-action="close" aria-label="Close ${escapeText(tab.title)}">×</button></div>`).join('') : '<div class="empty-state"><strong>No tabs</strong><span>Open a new tab in this space.</span></div>';
  elements['managed-spaces'].innerHTML = state.spaces.map(space => `<div class="managed-space"><span class="space-dot" style="--space-color:${COLOR_VALUES[space.color] || COLOR_VALUES.grey}"></span><span>${escapeText(space.name)}</span><button class="icon-button" data-delete-space="${space.id}" ${state.spaces.length <= 1 ? 'disabled' : ''} aria-label="Delete ${escapeText(space.name)}">×</button></div>`).join('');
  syncSettingsControls();
}

function syncSettingsControls() {
  if (!state) return;
  const value = state.settings;
  elements['home-page-input'].value = value.homePage;
  elements['game-url-input'].value = value.gameUrl;
  elements['compact-tabs-toggle'].checked = value.compactTabs;
  elements['reduce-motion-toggle'].checked = value.reduceMotion;
  elements['space-swipe-toggle'].checked = value.spaceSwipeEnabled;
  elements['google-location-toggle'].checked = value.blockGoogleLocation;
  for (const button of elements['theme-control'].querySelectorAll('button')) button.classList.toggle('active', button.dataset.value === value.theme);
}

async function refresh() {
  state = await request({ type: 'getState' });
  render();
}

function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 80);
}

function openSpaceDialog() {
  elements['space-name'].value = '';
  elements['space-message'].textContent = '';
  selectedColor = 'green';
  renderColors();
  elements['space-dialog'].showModal();
  elements['space-name'].focus();
}

function renderColors() {
  elements['color-options'].innerHTML = SPACE_COLORS.slice(0, 8).map(color => `<button type="button" class="color-option${color === selectedColor ? ' active' : ''}" data-color="${color}" style="--space-color:${COLOR_VALUES[color]}"><span></span></button>`).join('');
}

async function saveSetting(patch) {
  state.settings = await request({ type: 'saveSettings', patch });
  render();
}

elements['address-form'].addEventListener('submit', async event => {
  event.preventDefault();
  if (await request({ type: 'openUrl', value: elements['address-input'].value })) elements['address-input'].value = '';
});
elements['new-tab-button'].addEventListener('click', () => request({ type: 'openUrl', value: state.settings.homePage }));
elements['add-space-button'].addEventListener('click', openSpaceDialog);
elements['space-list'].addEventListener('click', event => {
  const button = event.target.closest('[data-space-id]');
  if (button) request({ type: 'switchSpace', groupId: Number(button.dataset.spaceId) });
});
elements['tab-list'].addEventListener('click', event => {
  const row = event.target.closest('[data-tab-id]');
  if (!row) return;
  request({ type: event.target.closest('[data-action="close"]') ? 'closeTab' : 'activateTab', tabId: Number(row.dataset.tabId) });
});
elements['color-options'].addEventListener('click', event => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  selectedColor = button.dataset.color;
  renderColors();
});
elements['space-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const result = await request({ type: 'createSpace', name: elements['space-name'].value, color: selectedColor });
  if (result?.ok) {
    elements['space-dialog'].close();
    await refresh();
  }
  else elements['space-message'].textContent = result?.message || 'Could not create space';
});
elements['settings-button'].addEventListener('click', () => { elements['settings-view'].hidden = false; });
elements['close-settings'].addEventListener('click', () => { elements['settings-view'].hidden = true; });
elements['settings-nav'].addEventListener('click', event => {
  const button = event.target.closest('[data-section]');
  if (!button) return;
  for (const item of elements['settings-nav'].querySelectorAll('button')) item.classList.toggle('active', item === button);
  for (const panel of document.querySelectorAll('[data-panel]')) panel.classList.toggle('active', panel.dataset.panel === button.dataset.section);
});
elements['managed-spaces'].addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-space]');
  if (!button) return;
  const result = await request({ type: 'deleteSpace', groupId: Number(button.dataset.deleteSpace) });
  if (!result?.ok) showToast(result?.message || 'Could not delete space');
});
elements['home-page-input'].addEventListener('change', event => saveSetting({ homePage: event.target.value }));
elements['game-url-input'].addEventListener('change', event => saveSetting({ gameUrl: event.target.value }));
elements['compact-tabs-toggle'].addEventListener('change', event => saveSetting({ compactTabs: event.target.checked }));
elements['reduce-motion-toggle'].addEventListener('change', event => saveSetting({ reduceMotion: event.target.checked }));
elements['space-swipe-toggle'].addEventListener('change', event => saveSetting({ spaceSwipeEnabled: event.target.checked }));
elements['google-location-toggle'].addEventListener('change', event => saveSetting({ blockGoogleLocation: event.target.checked }));
elements['theme-control'].addEventListener('click', event => { if (event.target.dataset.value) saveSetting({ theme: event.target.dataset.value }); });
elements['downloads-button'].addEventListener('click', () => request({ type: 'openDownloads' }));
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

chrome.runtime.onMessage.addListener(message => { if (message.type === 'stateChanged') queueRefresh(); });

(async () => {
  windowId = (await chrome.windows.getCurrent()).id;
  renderColors();
  await refresh();
})().catch(error => showToast(error.message));
