importScripts('core.js');

const { DEFAULT_SETTINGS, SPACE_COLORS, cleanSpaceName, nextIndex, normalizeSettings, resolveAddress } = CanopyCore;
const creatingSpaceWindows = new Set();

async function settings() {
  const stored = await chrome.storage.local.get('settings');
  return normalizeSettings(stored.settings);
}

async function saveSettings(patch) {
  const next = normalizeSettings({ ...(await settings()), ...patch });
  await chrome.storage.local.set({ settings: next });
  await applyLocationPolicy(next);
  notifyStateChanged();
  return next;
}

async function applyLocationPolicy(value = DEFAULT_SETTINGS) {
  await chrome.contentSettings.location.set({
    primaryPattern: 'https://*.google.com/*',
    setting: value.blockGoogleLocation ? 'block' : 'ask',
    scope: 'regular'
  });
}

async function currentWindowId() {
  return (await chrome.windows.getLastFocused()).id;
}

async function groupTabs(windowId) {
  return (await chrome.tabGroups.query({ windowId })).sort((left, right) => left.id - right.id);
}

async function activeGroupId(windowId) {
  const key = `activeSpace:${windowId}`;
  const stored = await chrome.storage.session.get(key);
  const candidate = Number(stored[key]);
  const groups = await groupTabs(windowId);
  if (groups.some(group => group.id === candidate)) return candidate;
  const activeTab = (await chrome.tabs.query({ windowId, active: true }))[0];
  return activeTab?.groupId >= 0 ? activeTab.groupId : groups[0]?.id;
}

async function rememberActiveGroup(windowId, groupId) {
  await chrome.storage.session.set({ [`activeSpace:${windowId}`]: groupId });
}

async function ensureSpaces(windowId) {
  let groups = await groupTabs(windowId);
  if (groups.length) return groups;
  let tabs = (await chrome.tabs.query({ windowId })).filter(tab => tab.id && !tab.pinned);
  if (!tabs.length) {
    const tab = await chrome.tabs.create({ windowId, url: (await settings()).homePage, active: true });
    tabs = [tab];
  }
  const groupId = await chrome.tabs.group({ tabIds: tabs.map(tab => tab.id) });
  await chrome.tabGroups.update(groupId, { title: 'Personal', color: 'green', collapsed: false });
  await rememberActiveGroup(windowId, groupId);
  return groupTabs(windowId);
}

async function switchSpace(windowId, groupId) {
  const groups = await ensureSpaces(windowId);
  if (!groups.some(group => group.id === groupId)) return false;
  await Promise.all(groups.map(group => chrome.tabGroups.update(group.id, { collapsed: group.id !== groupId })));
  const tabs = await chrome.tabs.query({ windowId, groupId });
  const target = tabs.find(tab => tab.active) || tabs.at(-1);
  if (target?.id) await chrome.tabs.update(target.id, { active: true });
  await rememberActiveGroup(windowId, groupId);
  notifyStateChanged();
  return true;
}

async function cycleSpace(windowId, direction) {
  if (!(await settings()).spaceSwipeEnabled) return false;
  const groups = await ensureSpaces(windowId);
  if (groups.length < 2) return false;
  const activeId = await activeGroupId(windowId);
  const index = groups.findIndex(group => group.id === activeId);
  return switchSpace(windowId, groups[nextIndex(groups.length, index, direction)].id);
}

async function createSpace(windowId, payload = {}) {
  const groups = await ensureSpaces(windowId);
  if (groups.length >= 10) return { ok: false, message: 'Canopy supports up to 10 spaces.' };
  const name = cleanSpaceName(payload.name);
  if (!name) return { ok: false, message: 'Enter a space name.' };
  const color = SPACE_COLORS.includes(payload.color) ? payload.color : 'green';
  creatingSpaceWindows.add(windowId);
  try {
    const tab = await chrome.tabs.create({ windowId, url: (await settings()).homePage, active: true });
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, { title: name, color, collapsed: false });
    await switchSpace(windowId, groupId);
    return { ok: true, groupId };
  } finally {
    creatingSpaceWindows.delete(windowId);
  }
}

async function deleteSpace(windowId, groupId) {
  const groups = await ensureSpaces(windowId);
  if (groups.length <= 1) return { ok: false, message: 'Keep at least one space.' };
  const removedIndex = groups.findIndex(group => group.id === groupId);
  if (removedIndex < 0) return { ok: false, message: 'Space not found.' };
  const fallback = groups[removedIndex === 0 ? 1 : removedIndex - 1];
  const tabs = await chrome.tabs.query({ windowId, groupId });
  if (tabs.length) await chrome.tabs.group({ tabIds: tabs.map(tab => tab.id), groupId: fallback.id });
  await switchSpace(windowId, fallback.id);
  return { ok: true };
}

async function openInActiveSpace(windowId, value) {
  const url = resolveAddress(value);
  if (!url) return false;
  const groupId = await activeGroupId(windowId);
  const tab = await chrome.tabs.create({ windowId, url, active: true });
  if (groupId >= 0) await chrome.tabs.group({ tabIds: [tab.id], groupId });
  notifyStateChanged();
  return true;
}

async function browserState(windowId) {
  const groups = await ensureSpaces(windowId);
  const tabs = await chrome.tabs.query({ windowId });
  const activeId = await activeGroupId(windowId);
  return {
    settings: await settings(),
    activeGroupId: activeId,
    spaces: groups.map(group => ({
      id: group.id,
      name: group.title || 'Space',
      color: group.color,
      collapsed: group.collapsed,
      tabs: tabs.filter(tab => tab.groupId === group.id).map(tab => ({
        id: tab.id,
        title: tab.title || 'New tab',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl || '',
        active: !!tab.active,
        loading: tab.status === 'loading'
      }))
    }))
  };
}

function notifyStateChanged() {
  chrome.runtime.sendMessage({ type: 'stateChanged' }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await applyLocationPolicy(await settings());
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(async () => {
  await applyLocationPolicy(await settings());
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  for (const window of windows) await ensureSpaces(window.id).catch(() => {});
});

chrome.tabs.onCreated.addListener(tab => {
  if (!tab.id || tab.windowId < 0 || tab.pinned || creatingSpaceWindows.has(tab.windowId)) return;
  setTimeout(async () => {
    const groupId = await activeGroupId(tab.windowId).catch(() => -1);
    if (groupId >= 0) await chrome.tabs.group({ tabIds: [tab.id], groupId }).catch(() => {});
    notifyStateChanged();
  }, 80);
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.groupId >= 0) await rememberActiveGroup(windowId, tab.groupId);
  notifyStateChanged();
});

for (const event of [chrome.tabs.onUpdated, chrome.tabs.onRemoved, chrome.tabs.onMoved, chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved, chrome.tabGroups.onMoved]) {
  event.addListener(() => notifyStateChanged());
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    const windowId = Number(message.windowId || sender.tab?.windowId || await currentWindowId());
    if (message.type === 'getState') return browserState(windowId);
    if (message.type === 'switchSpace') return switchSpace(windowId, Number(message.groupId));
    if (message.type === 'cycleSpace') return cycleSpace(windowId, message.direction);
    if (message.type === 'createSpace') return createSpace(windowId, message);
    if (message.type === 'deleteSpace') return deleteSpace(windowId, Number(message.groupId));
    if (message.type === 'activateTab') return chrome.tabs.update(Number(message.tabId), { active: true });
    if (message.type === 'closeTab') return chrome.tabs.remove(Number(message.tabId));
    if (message.type === 'openUrl') return openInActiveSpace(windowId, message.value);
    if (message.type === 'saveSettings') return saveSettings(message.patch || {});
    if (message.type === 'openDownloads') return chrome.tabs.create({ windowId, url: 'chrome://downloads/', active: true });
    if (message.type === 'openContentSettings') return chrome.tabs.create({ windowId, url: 'chrome://settings/content/location', active: true });
    if (message.type === 'openGame') return openInActiveSpace(windowId, (await settings()).gameUrl);
    return null;
  };
  run().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message }));
  return true;
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
