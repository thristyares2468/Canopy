importScripts('core.js');

const {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE,
  SPACE_COLORS,
  SPACE_ICONS,
  cleanLabel,
  cleanSpaceName,
  createId,
  nextIndex,
  normalizeSettings,
  normalizeWorkspace,
  removeTrackingParameters,
  resolveAddress,
  routeMatches,
  safeFilename,
  spaceKey
} = CanopyCore;

const creatingSpaceWindows = new Set();
let workspaceMutation = Promise.resolve();

async function settings() {
  const stored = await chrome.storage.local.get('settings');
  return normalizeSettings(stored.settings);
}

async function saveSettings(patch) {
  const next = normalizeSettings({ ...(await settings()), ...patch });
  await chrome.storage.local.set({ settings: next });
  await applyLocationPolicy(next);
  await scheduleArchive(next);
  notifyStateChanged();
  return next;
}

async function workspace() {
  const stored = await chrome.storage.local.get('workspace');
  return normalizeWorkspace(stored.workspace);
}

function mutateWorkspace(mutator) {
  workspaceMutation = workspaceMutation.catch(() => {}).then(async () => {
    const current = await workspace();
    const result = await mutator(current);
    const next = normalizeWorkspace(result?.workspace || current);
    await chrome.storage.local.set({ workspace: next });
    notifyStateChanged();
    return result?.value ?? next;
  });
  return workspaceMutation;
}

async function applyLocationPolicy(value = DEFAULT_SETTINGS) {
  await chrome.contentSettings.location.set({
    primaryPattern: 'https://*.google.com/*',
    setting: value.blockGoogleLocation ? 'block' : 'ask',
    scope: 'regular'
  });
}

async function scheduleArchive(value = DEFAULT_SETTINGS) {
  await chrome.alarms.clear('autoArchive');
  if (value.autoArchiveHours > 0) chrome.alarms.create('autoArchive', { periodInMinutes: 30 });
}

async function currentWindowId() {
  return (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
}

async function groupTabs(windowId) {
  const [groups, tabs] = await Promise.all([
    chrome.tabGroups.query({ windowId }),
    chrome.tabs.query({ windowId })
  ]);
  const firstTabIndex = new Map();
  for (const tab of tabs) {
    if (tab.groupId < 0 || firstTabIndex.has(tab.groupId)) continue;
    firstTabIndex.set(tab.groupId, tab.index);
  }
  const spaceOrder = new Map((await workspace()).spaces.map((space, index) => [spaceKey(space.name), index]));
  return groups.sort((left, right) =>
    (spaceOrder.get(spaceKey(left.title)) ?? Number.MAX_SAFE_INTEGER)
    - (spaceOrder.get(spaceKey(right.title)) ?? Number.MAX_SAFE_INTEGER)
    || (firstTabIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
    - (firstTabIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
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

async function ensureSpaceMetadata(groups) {
  const current = await workspace();
  const missing = groups.some(group => {
    const key = spaceKey(group.title || 'Personal');
    return !current.spaces.some(space => spaceKey(space.name) === key)
      || !current.spaceMeta[key]
      || !current.pinnedBySpace[key]
      || !current.foldersBySpace[key];
  });
  if (!missing) return;
  await mutateWorkspace(value => {
    for (const group of groups) {
      const key = spaceKey(group.title || 'Personal');
      value.spaceMeta[key] ||= { icon: 'leaf', color: group.color || 'green' };
      value.pinnedBySpace[key] ||= [];
      value.foldersBySpace[key] ||= [];
      if (!value.spaces.some(space => spaceKey(space.name) === key)) {
        value.spaces.push({
          name: group.title || 'Personal',
          icon: value.spaceMeta[key].icon,
          color: value.spaceMeta[key].color
        });
      }
    }
    return { workspace: value };
  });
}

async function ensureSpaces(windowId) {
  let groups = await groupTabs(windowId);
  let currentWorkspace = await workspace();
  if (!groups.length) {
    let tabs = (await chrome.tabs.query({ windowId })).filter(tab => tab.id && !tab.pinned);
    if (!tabs.length) {
      const tab = await chrome.tabs.create({ windowId, url: (await settings()).homePage, active: true });
      tabs = [tab];
    }
    const groupId = await chrome.tabs.group({ tabIds: tabs.map(tab => tab.id) });
    const firstSpace = currentWorkspace.spaces[0] || { name: 'Personal', color: 'green' };
    await chrome.tabGroups.update(groupId, { title: firstSpace.name, color: firstSpace.color, collapsed: false });
    await rememberActiveGroup(windowId, groupId);
    groups = await groupTabs(windowId);
  }
  await ensureSpaceMetadata(groups);
  currentWorkspace = await workspace();
  const existingKeys = new Set(groups.map(group => spaceKey(group.title)));
  const missingSpaces = currentWorkspace.spaces.filter(space => !existingKeys.has(spaceKey(space.name)));
  if (missingSpaces.length) {
    creatingSpaceWindows.add(windowId);
    try {
      for (const space of missingSpaces) {
        const tab = await chrome.tabs.create({ windowId, url: 'chrome://newtab/', active: false });
        const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
        await chrome.tabGroups.update(groupId, { title: space.name, color: space.color, collapsed: true });
      }
    } finally {
      creatingSpaceWindows.delete(windowId);
    }
    groups = await groupTabs(windowId);
  }
  return groups;
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
  if (groups.length >= 10) return { ok: false, message: 'Canopy supports up to 10 Spaces.' };
  const name = cleanSpaceName(payload.name);
  if (!name) return { ok: false, message: 'Enter a Space name.' };
  if (groups.some(group => spaceKey(group.title) === spaceKey(name))) return { ok: false, message: 'Space names must be unique.' };
  const color = SPACE_COLORS.includes(payload.color) ? payload.color : 'green';
  const icon = SPACE_ICONS.includes(payload.icon) ? payload.icon : 'leaf';
  creatingSpaceWindows.add(windowId);
  try {
    const tab = await chrome.tabs.create({ windowId, url: 'chrome://newtab/', active: true });
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, { title: name, color, collapsed: false });
    await mutateWorkspace(current => {
      const key = spaceKey(name);
      current.spaceMeta[key] = { icon, color };
      current.pinnedBySpace[key] ||= [];
      current.foldersBySpace[key] ||= [];
      current.spaces.push({ name, icon, color });
      return { workspace: current };
    });
    await switchSpace(windowId, groupId);
    return { ok: true, groupId };
  } finally {
    creatingSpaceWindows.delete(windowId);
  }
}

async function updateSpace(windowId, payload = {}) {
  const groupId = Number(payload.groupId);
  const groups = await ensureSpaces(windowId);
  const group = groups.find(candidate => candidate.id === groupId);
  if (!group) return { ok: false, message: 'Space not found.' };
  const name = cleanSpaceName(payload.name || group.title);
  if (!name) return { ok: false, message: 'Enter a Space name.' };
  if (groups.some(candidate => candidate.id !== groupId && spaceKey(candidate.title) === spaceKey(name))) {
    return { ok: false, message: 'Space names must be unique.' };
  }
  const color = SPACE_COLORS.includes(payload.color) ? payload.color : group.color;
  const icon = SPACE_ICONS.includes(payload.icon) ? payload.icon : 'leaf';
  const oldName = group.title || 'Space';
  await chrome.tabGroups.update(groupId, { title: name, color });
  await mutateWorkspace(current => {
    const oldKey = spaceKey(oldName);
    const nextKey = spaceKey(name);
    current.spaceMeta[nextKey] = { ...(current.spaceMeta[oldKey] || {}), icon, color };
    current.pinnedBySpace[nextKey] = current.pinnedBySpace[oldKey] || [];
    current.foldersBySpace[nextKey] = current.foldersBySpace[oldKey] || [];
    const definition = current.spaces.find(space => spaceKey(space.name) === oldKey);
    if (definition) Object.assign(definition, { name, icon, color });
    if (oldKey !== nextKey) {
      delete current.spaceMeta[oldKey];
      delete current.pinnedBySpace[oldKey];
      delete current.foldersBySpace[oldKey];
      for (const route of current.routes) if (spaceKey(route.spaceName) === oldKey) route.spaceName = name;
      for (const item of current.archive) if (spaceKey(item.spaceName) === oldKey) item.spaceName = name;
    }
    return { workspace: current };
  });
  return { ok: true };
}

async function deleteSpace(windowId, groupId) {
  const groups = await ensureSpaces(windowId);
  if (groups.length <= 1) return { ok: false, message: 'Keep at least one Space.' };
  const removedIndex = groups.findIndex(group => group.id === groupId);
  if (removedIndex < 0) return { ok: false, message: 'Space not found.' };
  const removed = groups[removedIndex];
  const fallback = groups[removedIndex === 0 ? 1 : removedIndex - 1];
  const tabs = await chrome.tabs.query({ windowId, groupId });
  if (tabs.length) await chrome.tabs.group({ tabIds: tabs.map(tab => tab.id), groupId: fallback.id });
  await mutateWorkspace(current => {
    const removedKey = spaceKey(removed.title);
    const fallbackKey = spaceKey(fallback.title);
    const existingUrls = new Set((current.pinnedBySpace[fallbackKey] || []).map(item => item.url));
    const movedPins = (current.pinnedBySpace[removedKey] || [])
      .filter(item => !existingUrls.has(item.url))
      .map(item => ({ ...item, folderId: null }));
    current.pinnedBySpace[fallbackKey] = [...(current.pinnedBySpace[fallbackKey] || []), ...movedPins];
    delete current.pinnedBySpace[removedKey];
    delete current.foldersBySpace[removedKey];
    delete current.spaceMeta[removedKey];
    current.spaces = current.spaces.filter(space => spaceKey(space.name) !== removedKey);
    for (const route of current.routes) if (spaceKey(route.spaceName) === removedKey) route.spaceName = fallback.title;
    return { workspace: current };
  });
  await switchSpace(windowId, fallback.id);
  return { ok: true };
}

async function openInGroup(windowId, groupId, value, reuse = false) {
  const url = resolveAddress(value);
  if (!url) return false;
  if (reuse) {
    const existing = (await chrome.tabs.query({ windowId })).find(tab => tab.url === url);
    if (existing?.id) {
      if (existing.groupId >= 0) await switchSpace(windowId, existing.groupId);
      await chrome.tabs.update(existing.id, { active: true });
      return true;
    }
  }
  const tab = await chrome.tabs.create({ windowId, url, active: true });
  if (groupId >= 0) await chrome.tabs.group({ tabIds: [tab.id], groupId });
  notifyStateChanged();
  return true;
}

async function openInActiveSpace(windowId, value, reuse = false) {
  return openInGroup(windowId, await activeGroupId(windowId), value, reuse);
}

async function groupBySpaceName(windowId, name) {
  return (await ensureSpaces(windowId)).find(group => spaceKey(group.title) === spaceKey(name));
}

async function activeTab(windowId) {
  return (await chrome.tabs.query({ windowId, active: true }))[0] || null;
}

function pageFromTab(tab, prefix) {
  if (!tab?.url || !/^https?:/i.test(tab.url)) return null;
  return {
    id: createId(prefix),
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    createdAt: Date.now()
  };
}

async function toggleFavorite(tabId) {
  const tab = await chrome.tabs.get(Number(tabId)).catch(() => null);
  const page = pageFromTab(tab, 'favorite');
  if (!page) return { ok: false, message: 'This page cannot be added to Favorites.' };
  return mutateWorkspace(current => {
    const existingIndex = current.favorites.findIndex(item => item.url === page.url);
    if (existingIndex >= 0) {
      current.favorites.splice(existingIndex, 1);
      return { workspace: current, value: { ok: true, favorite: false } };
    }
    if (current.favorites.length >= 12) return { workspace: current, value: { ok: false, message: 'Favorites are limited to 12 pages.' } };
    current.favorites.push(page);
    return { workspace: current, value: { ok: true, favorite: true } };
  });
}

async function openFavorite(windowId, id) {
  const item = (await workspace()).favorites.find(candidate => candidate.id === id);
  if (!item) return { ok: false, message: 'Favorite not found.' };
  await openInActiveSpace(windowId, item.url, true);
  return { ok: true };
}

async function removeFavorite(id) {
  return mutateWorkspace(current => {
    current.favorites = current.favorites.filter(item => item.id !== id);
    return { workspace: current, value: { ok: true } };
  });
}

async function pinTabMap(windowId) {
  const key = `pinTabs:${windowId}`;
  const stored = await chrome.storage.session.get(key);
  return stored[key] && typeof stored[key] === 'object' ? stored[key] : {};
}

async function rememberPinTab(windowId, pinId, tabId) {
  const key = `pinTabs:${windowId}`;
  const map = await pinTabMap(windowId);
  map[pinId] = tabId;
  await chrome.storage.session.set({ [key]: map });
}

async function togglePin(tabId) {
  const tab = await chrome.tabs.get(Number(tabId)).catch(() => null);
  const page = pageFromTab(tab, 'pin');
  if (!page || tab.groupId < 0) return { ok: false, message: 'This tab cannot be pinned.' };
  const group = await chrome.tabGroups.get(tab.groupId);
  const key = spaceKey(group.title);
  const mappedPins = await pinTabMap(tab.windowId);
  const result = await mutateWorkspace(current => {
    current.pinnedBySpace[key] ||= [];
    const existingIndex = current.pinnedBySpace[key].findIndex(item => item.url === page.url || Number(mappedPins[item.id]) === tab.id);
    if (existingIndex >= 0) {
      current.pinnedBySpace[key].splice(existingIndex, 1);
      return { workspace: current, value: { ok: true, pinned: false } };
    }
    current.pinnedBySpace[key].push({ ...page, folderId: null });
    return { workspace: current, value: { ok: true, pinned: true, pinId: page.id } };
  });
  if (result?.pinned && result.pinId) await rememberPinTab(tab.windowId, result.pinId, tab.id);
  const allowPeek = result?.pinned && (await settings()).openPeekForPinnedLinks;
  await chrome.tabs.sendMessage(tab.id, { type: 'setTabBehavior', peekLinks: allowPeek }).catch(() => {});
  return result;
}

async function openPinned(windowId, spaceName, pinId, reset = false) {
  const current = await workspace();
  const item = (current.pinnedBySpace[spaceKey(spaceName)] || []).find(candidate => candidate.id === pinId);
  if (!item) return { ok: false, message: 'Pinned tab not found.' };
  const group = await groupBySpaceName(windowId, spaceName) || (await ensureSpaces(windowId))[0];
  const map = await pinTabMap(windowId);
  const mapped = map[pinId] ? await chrome.tabs.get(Number(map[pinId])).catch(() => null) : null;
  const existing = mapped?.windowId === windowId ? mapped : (await chrome.tabs.query({ windowId })).find(tab => tab.url === item.url);
  if (existing?.id) {
    if (reset && existing.url !== item.url) await chrome.tabs.update(existing.id, { url: item.url });
    if (existing.groupId !== group.id) await chrome.tabs.group({ tabIds: [existing.id], groupId: group.id });
    await switchSpace(windowId, group.id);
    await chrome.tabs.update(existing.id, { active: true });
  } else {
    const tab = await chrome.tabs.create({ windowId, url: item.url, active: true });
    await chrome.tabs.group({ tabIds: [tab.id], groupId: group.id });
    await rememberPinTab(windowId, pinId, tab.id);
  }
  if (existing?.id) await rememberPinTab(windowId, pinId, existing.id);
  return { ok: true };
}

async function removePin(spaceName, pinId) {
  return mutateWorkspace(current => {
    const key = spaceKey(spaceName);
    current.pinnedBySpace[key] = (current.pinnedBySpace[key] || []).filter(item => item.id !== pinId);
    return { workspace: current, value: { ok: true } };
  });
}

async function tabIsPinned(tab) {
  if (!tab?.id || tab.groupId < 0) return false;
  const group = await chrome.tabGroups.get(tab.groupId).catch(() => null);
  if (!group) return false;
  const current = await workspace();
  const pins = current.pinnedBySpace[spaceKey(group.title)] || [];
  if (pins.some(pin => pin.url === tab.url)) return true;
  const map = await pinTabMap(tab.windowId);
  return pins.some(pin => Number(map[pin.id]) === tab.id);
}

async function tabUsesPinnedBehavior(tab) {
  return (await settings()).openPeekForPinnedLinks && tabIsPinned(tab);
}

async function createFolder(spaceName, name) {
  const folderName = cleanLabel(name, 40);
  if (!folderName) return { ok: false, message: 'Enter a folder name.' };
  return mutateWorkspace(current => {
    const key = spaceKey(spaceName);
    current.foldersBySpace[key] ||= [];
    if (current.foldersBySpace[key].some(folder => folder.name.toLocaleLowerCase('en-US') === folderName.toLocaleLowerCase('en-US'))) {
      return { workspace: current, value: { ok: false, message: 'Folder names must be unique in a Space.' } };
    }
    current.foldersBySpace[key].push({ id: createId('folder'), name: folderName, collapsed: false });
    return { workspace: current, value: { ok: true } };
  });
}

async function updateFolder(spaceName, folderId, patch = {}) {
  return mutateWorkspace(current => {
    const key = spaceKey(spaceName);
    const folder = (current.foldersBySpace[key] || []).find(candidate => candidate.id === folderId);
    if (!folder) return { workspace: current, value: { ok: false, message: 'Folder not found.' } };
    if (patch.name) folder.name = cleanLabel(patch.name, 40) || folder.name;
    if (typeof patch.collapsed === 'boolean') folder.collapsed = patch.collapsed;
    return { workspace: current, value: { ok: true } };
  });
}

async function deleteFolder(spaceName, folderId) {
  return mutateWorkspace(current => {
    const key = spaceKey(spaceName);
    current.foldersBySpace[key] = (current.foldersBySpace[key] || []).filter(folder => folder.id !== folderId);
    for (const pin of current.pinnedBySpace[key] || []) if (pin.folderId === folderId) pin.folderId = null;
    return { workspace: current, value: { ok: true } };
  });
}

async function movePin(spaceName, pinId, folderId) {
  return mutateWorkspace(current => {
    const key = spaceKey(spaceName);
    const pin = (current.pinnedBySpace[key] || []).find(candidate => candidate.id === pinId);
    const validFolder = folderId && (current.foldersBySpace[key] || []).some(folder => folder.id === folderId);
    if (!pin) return { workspace: current, value: { ok: false, message: 'Pinned tab not found.' } };
    pin.folderId = validFolder ? folderId : null;
    return { workspace: current, value: { ok: true } };
  });
}

async function ensureReplacementTab(windowId, groupId, exceptTabId) {
  const remaining = (await chrome.tabs.query({ windowId, groupId })).filter(tab => tab.id !== exceptTabId);
  if (remaining.length) return;
  creatingSpaceWindows.add(windowId);
  try {
    const replacement = await chrome.tabs.create({ windowId, url: 'chrome://newtab/', active: true });
    await chrome.tabs.group({ tabIds: [replacement.id], groupId });
  } finally {
    creatingSpaceWindows.delete(windowId);
  }
}

async function archiveTab(tabId, automatic = false) {
  const tab = await chrome.tabs.get(Number(tabId)).catch(() => null);
  const page = pageFromTab(tab, 'archive');
  if (!page || tab.groupId < 0) return { ok: false, message: 'This tab cannot be archived.' };
  const group = await chrome.tabGroups.get(tab.groupId).catch(() => null);
  if (!group) return { ok: false, message: 'Space not found.' };
  const current = await workspace();
  if (await tabIsPinned(tab)) {
    return { ok: false, message: automatic ? '' : 'Unpin this page before archiving it.' };
  }
  await ensureReplacementTab(tab.windowId, tab.groupId, tab.id);
  await mutateWorkspace(value => {
    value.archive.unshift({ ...page, archivedAt: Date.now(), spaceName: group.title || 'Personal' });
    value.archive = value.archive.slice(0, 500);
    return { workspace: value };
  });
  await chrome.tabs.remove(tab.id).catch(() => {});
  return { ok: true };
}

async function restoreArchive(windowId, archiveId) {
  const current = await workspace();
  const item = current.archive.find(candidate => candidate.id === archiveId);
  if (!item) return { ok: false, message: 'Archived tab not found.' };
  const group = await groupBySpaceName(windowId, item.spaceName) || (await ensureSpaces(windowId))[0];
  await openInGroup(windowId, group.id, item.url, false);
  await mutateWorkspace(value => {
    value.archive = value.archive.filter(candidate => candidate.id !== archiveId);
    return { workspace: value };
  });
  return { ok: true };
}

async function autoArchiveTabs() {
  const currentSettings = await settings();
  if (!currentSettings.autoArchiveHours) return;
  const cutoff = Date.now() - currentSettings.autoArchiveHours * 60 * 60 * 1000;
  const currentWorkspace = await workspace();
  const pinnedUrls = new Set(Object.values(currentWorkspace.pinnedBySpace).flat().map(item => item.url));
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  for (const window of windows) {
    const tabs = await chrome.tabs.query({ windowId: window.id });
    for (const tab of tabs) {
      if (!tab.id || tab.active || tab.audible || tab.pinned || tab.groupId < 0 || !/^https?:/i.test(tab.url || '')) continue;
      if (pinnedUrls.has(tab.url) || Number(tab.lastAccessed || Date.now()) >= cutoff) continue;
      await archiveTab(tab.id, true);
    }
  }
}

async function addRoute(payload = {}) {
  const pattern = cleanLabel(payload.pattern, 180).toLocaleLowerCase('en-US');
  const spaceName = cleanSpaceName(payload.spaceName);
  const match = ['host', 'contains', 'startsWith'].includes(payload.match) ? payload.match : 'host';
  if (!pattern || !spaceName) return { ok: false, message: 'Choose a pattern and destination Space.' };
  return mutateWorkspace(current => {
    current.routes.push({ id: createId('route'), pattern, match, spaceName });
    return { workspace: current, value: { ok: true } };
  });
}

async function deleteRoute(routeId) {
  return mutateWorkspace(current => {
    current.routes = current.routes.filter(route => route.id !== routeId);
    return { workspace: current, value: { ok: true } };
  });
}

async function routeTab(tabId, windowId, url) {
  if (!/^https?:/i.test(url || '')) return false;
  const current = await workspace();
  const rule = current.routes.find(candidate => routeMatches(url, candidate));
  if (!rule) return false;
  const target = await groupBySpaceName(windowId, rule.spaceName);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!target || !tab || tab.groupId === target.id) return false;
  await chrome.tabs.group({ tabIds: [tabId], groupId: target.id });
  if (tab.active) await switchSpace(windowId, target.id);
  return true;
}

async function openPeek(windowId, value) {
  const url = resolveAddress(value);
  if (!url) return { ok: false, message: 'No page is available for Peek.' };
  const parent = await chrome.windows.get(windowId).catch(() => null);
  const width = Math.min(760, Math.max(520, Math.round((parent?.width || 1200) * 0.62)));
  const height = Math.min(860, Math.max(580, Math.round((parent?.height || 900) * 0.82)));
  await chrome.windows.create({
    url,
    type: 'popup',
    focused: true,
    width,
    height,
    left: Math.round((parent?.left || 0) + ((parent?.width || width) - width) / 2),
    top: Math.round((parent?.top || 0) + ((parent?.height || height) - height) / 2)
  });
  return { ok: true };
}

async function openSideBySide(windowId, tabId) {
  const sourceWindow = await chrome.windows.get(windowId);
  const tab = await chrome.tabs.get(Number(tabId)).catch(() => null);
  if (!tab?.url) return { ok: false, message: 'Tab not found.' };
  const width = Math.max(520, Math.floor((sourceWindow.width || 1200) / 2));
  const height = sourceWindow.height || 800;
  const left = sourceWindow.left || 0;
  const top = sourceWindow.top || 0;
  await chrome.windows.update(windowId, { state: 'normal', left, top, width, height });
  await chrome.windows.create({ url: tab.url, type: 'normal', focused: true, left: left + width, top, width, height });
  return { ok: true };
}

async function captureCurrentTab(windowId) {
  const tab = await activeTab(windowId);
  if (!tab) return { ok: false, message: 'No active tab to capture.' };
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `Canopy Captures/${safeFilename(tab.title, 'page')}-${stamp}.png`;
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
  await mutateWorkspace(current => {
    current.captures.unshift({ id: createId('capture'), title: tab.title || 'Capture', url: tab.url || '', filename, createdAt: Date.now() });
    current.captures = current.captures.slice(0, 100);
    return { workspace: current };
  });
  return { ok: true, filename };
}

async function shareSpace(windowId, groupId) {
  const group = await chrome.tabGroups.get(Number(groupId)).catch(() => null);
  if (!group || group.windowId !== windowId) return { ok: false, message: 'Space not found.' };
  const tabs = (await chrome.tabs.query({ windowId, groupId: group.id })).filter(tab => /^https?:/i.test(tab.url || ''));
  const lines = [`${group.title || 'Canopy Space'}`, '', ...tabs.map(tab => `- ${tab.title || tab.url}: ${removeTrackingParameters(tab.url)}`)];
  return { ok: true, text: lines.join('\n') };
}

async function toggleMute(tabId) {
  const tab = await chrome.tabs.get(Number(tabId)).catch(() => null);
  if (!tab) return { ok: false, message: 'Audio tab not found.' };
  await chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted });
  return { ok: true };
}

async function enterPictureInPicture(windowId) {
  const tab = await activeTab(windowId);
  if (!tab?.id) return { ok: false, message: 'No active tab.' };
  return chrome.tabs.sendMessage(tab.id, { type: 'enterPictureInPicture' }).catch(() => ({ ok: false, message: 'Picture in Picture is unavailable on this page.' }));
}

async function browserState(windowId) {
  const groups = await ensureSpaces(windowId);
  const windowTabs = await chrome.tabs.query({ windowId });
  const allTabs = await chrome.tabs.query({});
  const activeId = await activeGroupId(windowId);
  const currentWorkspace = await workspace();
  const currentSettings = await settings();
  const mappedPins = await pinTabMap(windowId);
  const spaces = groups.map(group => {
    const key = spaceKey(group.title || 'Space');
    const pins = currentWorkspace.pinnedBySpace[key] || [];
    const pinnedUrls = new Set(pins.map(item => item.url));
    const pinnedTabIds = new Set(pins.map(item => Number(mappedPins[item.id])).filter(Number.isFinite));
    const tabs = windowTabs.filter(tab => tab.groupId === group.id);
    return {
      id: group.id,
      name: group.title || 'Space',
      color: group.color,
      icon: currentWorkspace.spaceMeta[key]?.icon || 'leaf',
      collapsed: group.collapsed,
      folders: currentWorkspace.foldersBySpace[key] || [],
      pinned: pins.map(item => {
        const mappedTab = tabs.find(tab => tab.id === Number(mappedPins[item.id]));
        return { ...item, openTabId: mappedTab?.id || tabs.find(tab => tab.url === item.url)?.id || null };
      }),
      tabs: tabs.filter(tab => !pinnedUrls.has(tab.url) && !pinnedTabIds.has(tab.id)).map(tab => ({
        id: tab.id,
        title: tab.title || 'New tab',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl || '',
        active: !!tab.active,
        audible: !!tab.audible,
        muted: !!tab.mutedInfo?.muted,
        loading: tab.status === 'loading'
      }))
    };
  });
  return {
    apiVersion: 3,
    settings: currentSettings,
    activeGroupId: activeId,
    activeTabId: windowTabs.find(tab => tab.active)?.id || null,
    spaces,
    favorites: currentWorkspace.favorites.map(item => ({ ...item, openTabId: allTabs.find(tab => tab.url === item.url)?.id || null })),
    archive: currentWorkspace.archive,
    routes: currentWorkspace.routes,
    captures: currentWorkspace.captures,
    audibleTabs: allTabs.filter(tab => tab.audible || tab.mutedInfo?.muted).map(tab => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || 'Audio tab',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl || '',
      muted: !!tab.mutedInfo?.muted,
      active: !!tab.active
    }))
  };
}

function notifyStateChanged() {
  chrome.runtime.sendMessage({ type: 'stateChanged' }).catch(() => {});
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'canopy-peek-link', title: 'Open link in Canopy Peek', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'canopy-favorite-page', title: 'Toggle Canopy Favorite', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'canopy-pin-page', title: 'Toggle pinned tab', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'canopy-archive-page', title: 'Archive tab', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'canopy-copy-clean-link', title: 'Copy link without tracking', contexts: ['page', 'link'] });
    chrome.contextMenus.create({ id: 'canopy-capture-page', title: 'Capture visible page', contexts: ['page'] });
  });
}

async function initializeExtension() {
  const stored = await chrome.storage.local.get(['settings', 'workspace']);
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  if (!stored.workspace) await chrome.storage.local.set({ workspace: DEFAULT_WORKSPACE });
  const currentSettings = await settings();
  await applyLocationPolicy(currentSettings);
  await scheduleArchive(currentSettings);
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function exportWorkspaceData() {
  const payload = {
    format: 'canopy-workspace',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: await settings(),
    workspace: await workspace()
  };
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  const stamp = new Date().toISOString().slice(0, 10);
  await chrome.downloads.download({ url: dataUrl, filename: `Canopy Workspace ${stamp}.json`, saveAs: true });
  return { ok: true };
}

async function importWorkspaceData(payload) {
  if (!payload || payload.format !== 'canopy-workspace' || !payload.workspace) return { ok: false, message: 'This is not a Canopy workspace backup.' };
  const nextWorkspace = normalizeWorkspace(payload.workspace);
  const nextSettings = normalizeSettings({ ...(await settings()), ...(payload.settings || {}) });
  await chrome.storage.local.set({ workspace: nextWorkspace, settings: nextSettings });
  await applyLocationPolicy(nextSettings);
  await scheduleArchive(nextSettings);
  notifyStateChanged();
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtension();
  createContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeExtension();
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  for (const window of windows) await ensureSpaces(window.id).catch(() => {});
});

chrome.tabs.onCreated.addListener(tab => {
  if (!tab.id || tab.windowId < 0 || tab.pinned || creatingSpaceWindows.has(tab.windowId)) return;
  setTimeout(async () => {
    const groupId = await activeGroupId(tab.windowId).catch(() => -1);
    if (groupId >= 0 && tab.groupId < 0) await chrome.tabs.group({ tabIds: [tab.id], groupId }).catch(() => {});
    notifyStateChanged();
  }, 80);
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.groupId >= 0) await rememberActiveGroup(windowId, tab.groupId);
  notifyStateChanged();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) routeTab(tabId, tab.windowId, changeInfo.url).catch(() => {});
  notifyStateChanged();
});

for (const event of [chrome.tabs.onRemoved, chrome.tabs.onMoved, chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved, chrome.tabGroups.onMoved]) {
  event.addListener(() => notifyStateChanged());
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'autoArchive') autoArchiveTabs().catch(() => {});
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'archive-current-tab') return;
  const windowId = await currentWindowId();
  const tab = await activeTab(windowId);
  if (tab?.id) await archiveTab(tab.id);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'canopy-peek-link') await openPeek(tab.windowId, info.linkUrl || tab.url);
  if (info.menuItemId === 'canopy-favorite-page') await toggleFavorite(tab.id);
  if (info.menuItemId === 'canopy-pin-page') await togglePin(tab.id);
  if (info.menuItemId === 'canopy-archive-page') await archiveTab(tab.id);
  if (info.menuItemId === 'canopy-capture-page') await captureCurrentTab(tab.windowId);
  if (info.menuItemId === 'canopy-copy-clean-link') {
    const text = removeTrackingParameters(info.linkUrl || tab.url);
    await chrome.tabs.sendMessage(tab.id, { type: 'copyText', text }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    const windowId = Number(message.windowId || sender.tab?.windowId || await currentWindowId());
    if (message.type === 'getState') return browserState(windowId);
    if (message.type === 'switchSpace') return switchSpace(windowId, Number(message.groupId));
    if (message.type === 'cycleSpace') return cycleSpace(windowId, message.direction);
    if (message.type === 'createSpace') return createSpace(windowId, message);
    if (message.type === 'updateSpace') return updateSpace(windowId, message);
    if (message.type === 'deleteSpace') return deleteSpace(windowId, Number(message.groupId));
    if (message.type === 'activateTab') {
      const tab = await chrome.tabs.get(Number(message.tabId));
      if (tab.groupId >= 0) await switchSpace(tab.windowId, tab.groupId);
      await chrome.windows.update(tab.windowId, { focused: true });
      return chrome.tabs.update(tab.id, { active: true });
    }
    if (message.type === 'closeTab') return chrome.tabs.remove(Number(message.tabId));
    if (message.type === 'openUrl') return openInActiveSpace(windowId, message.value, message.reuse === true);
    if (message.type === 'openNewTab') {
      const tab = await chrome.tabs.create({ windowId, url: 'chrome://newtab/', active: true });
      const groupId = await activeGroupId(windowId);
      if (groupId >= 0) await chrome.tabs.group({ tabIds: [tab.id], groupId });
      return true;
    }
    if (message.type === 'saveSettings') return saveSettings(message.patch || {});
    if (message.type === 'toggleFavorite') return toggleFavorite(message.tabId);
    if (message.type === 'removeFavorite') return removeFavorite(message.favoriteId);
    if (message.type === 'openFavorite') return openFavorite(windowId, message.favoriteId);
    if (message.type === 'togglePin') return togglePin(message.tabId);
    if (message.type === 'openPinned') return openPinned(windowId, message.spaceName, message.pinId, message.reset === true);
    if (message.type === 'removePin') return removePin(message.spaceName, message.pinId);
    if (message.type === 'createFolder') return createFolder(message.spaceName, message.name);
    if (message.type === 'updateFolder') return updateFolder(message.spaceName, message.folderId, message.patch);
    if (message.type === 'deleteFolder') return deleteFolder(message.spaceName, message.folderId);
    if (message.type === 'movePin') return movePin(message.spaceName, message.pinId, message.folderId);
    if (message.type === 'archiveTab') return archiveTab(message.tabId);
    if (message.type === 'restoreArchive') return restoreArchive(windowId, message.archiveId);
    if (message.type === 'clearArchive') return mutateWorkspace(current => {
      current.archive = [];
      return { workspace: current, value: { ok: true } };
    });
    if (message.type === 'addRoute') return addRoute(message);
    if (message.type === 'deleteRoute') return deleteRoute(message.routeId);
    if (message.type === 'openPeek') return openPeek(windowId, message.value || (await activeTab(windowId))?.url);
    if (message.type === 'openSideBySide') return openSideBySide(windowId, message.tabId);
    if (message.type === 'captureCurrentTab') return captureCurrentTab(windowId);
    if (message.type === 'shareSpace') return shareSpace(windowId, message.groupId);
    if (message.type === 'cleanCurrentUrl') return { ok: true, text: removeTrackingParameters((await activeTab(windowId))?.url) };
    if (message.type === 'toggleMute') return toggleMute(message.tabId);
    if (message.type === 'enterPictureInPicture') return enterPictureInPicture(windowId);
    if (message.type === 'getTabBehavior') return { peekLinks: await tabUsesPinnedBehavior(sender.tab) };
    if (message.type === 'openDownloads') return chrome.tabs.create({ windowId, url: 'chrome://downloads/', active: true });
    if (message.type === 'openHistory') return chrome.tabs.create({ windowId, url: 'chrome://history/', active: true });
    if (message.type === 'openExtensions') return chrome.tabs.create({ windowId, url: 'chrome://extensions/', active: true });
    if (message.type === 'openProfiles') return chrome.tabs.create({ windowId, url: 'chrome://settings/manageProfile', active: true });
    if (message.type === 'openPasswords') return chrome.tabs.create({ windowId, url: 'chrome://password-manager/passwords', active: true });
    if (message.type === 'openImportData') return chrome.tabs.create({ windowId, url: 'chrome://settings/importData', active: true });
    if (message.type === 'openPerformance') return chrome.tabs.create({ windowId, url: 'chrome://settings/performance', active: true });
    if (message.type === 'openTaskManager') return chrome.tabs.create({ windowId, url: 'chrome://system/', active: true });
    if (message.type === 'openContentSettings') return chrome.tabs.create({ windowId, url: 'chrome://settings/content/location', active: true });
    if (message.type === 'openGame') return openInActiveSpace(windowId, (await settings()).gameUrl);
    if (message.type === 'openSidebar') return chrome.sidePanel.open({ windowId });
    if (message.type === 'openLibraryView') {
      await chrome.sidePanel.open({ windowId });
      setTimeout(() => chrome.runtime.sendMessage({ type: 'showLibrary' }).catch(() => {}), 120);
      return { ok: true };
    }
    if (message.type === 'exportWorkspace') return exportWorkspaceData();
    if (message.type === 'importWorkspace') return importWorkspaceData(message.payload);
    return null;
  };
  run().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message }));
  return true;
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
initializeExtension().catch(() => {});
