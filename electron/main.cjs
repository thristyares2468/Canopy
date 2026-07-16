const { app, BrowserWindow, WebContentsView, clipboard, ipcMain, Menu, dialog, session, shell, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { CanopyStore, DEFAULT_GAME_SOURCE, DEFAULT_GAME_URL } = require('./store.cjs');
const { startGameFilesServer } = require('./game-files.cjs');
const { displayAddress, isAllowedNavigation, originMatches, resolveAddress } = require('./navigation.cjs');

app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setName('Canopy');

const isE2E = process.env.CANOPY_E2E === '1';
if (isE2E && process.env.CANOPY_E2E_USER_DATA) {
  app.setPath('userData', process.env.CANOPY_E2E_USER_DATA);
}
const spaces = [
  { id: 'personal', name: 'Personal', color: '#58c783' },
  { id: 'work', name: 'Work', color: '#ef806f' },
  { id: 'research', name: 'Research', color: '#6c9dff' }
];

let mainWindow = null;
let store = null;
let activeTabId = null;
let activeSpace = 'personal';
let rendererReady = false;
let contentVisible = true;
let contentBounds = { x: 296, y: 62, width: 1100, height: 790 };
let gameFilesServer = null;
let gameFilesServerKey = '';
let saveTabsTimer = null;
const tabs = new Map();

function distPath(...segments) {
  return path.join(__dirname, '..', 'dist', ...segments);
}

function newTabUrl() {
  return pathToFileURL(distPath('newtab.html')).href;
}

function activeTab() {
  return activeTabId ? tabs.get(activeTabId) || null : null;
}

function navigationState(webContents) {
  const history = webContents.navigationHistory;
  return {
    canGoBack: !!history?.canGoBack?.(),
    canGoForward: !!history?.canGoForward?.()
  };
}

function publicTab(tab) {
  const nav = navigationState(tab.view.webContents);
  const trustedGame = tab.internalPage === 'jims-mowing'
    || originMatches(tab.url, store?.snapshot().settings.gameUrl || DEFAULT_GAME_URL);
  return {
    id: tab.id,
    url: tab.url,
    displayUrl: trustedGame ? 'canopy://jims-mowing' : displayAddress(tab.url, newTabUrl()),
    title: trustedGame ? "Jim's Mowing" : (tab.title || 'New tab'),
    favicon: tab.favicon || '',
    loading: !!tab.loading,
    space: tab.space,
    pinned: !!tab.pinned,
    ...nav
  };
}

function statePayload() {
  return {
    tabs: Array.from(tabs.values()).map(publicTab),
    activeTabId,
    activeSpace,
    spaces,
    settings: store?.snapshot().settings || {},
    platform: process.platform
  };
}

function sendToShell(channel, payload) {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function broadcastState() {
  sendToShell('browser:state', statePayload());
  queuePersistTabs();
}

function queuePersistTabs() {
  clearTimeout(saveTabsTimer);
  saveTabsTimer = setTimeout(() => {
    if (!store) return;
    const serialized = Array.from(tabs.values())
      .filter(tab => !tab.internalPage && /^https?:\/\//i.test(tab.url))
      .map(tab => ({ id: tab.id, url: tab.url, title: tab.title, space: tab.space, pinned: tab.pinned }));
    store.update({ tabs: serialized });
  }, 250);
}

function applyContentBounds() {
  const tab = activeTab();
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;
  const [windowWidth, windowHeight] = mainWindow.getContentSize();
  const bounds = {
    x: Math.max(0, Math.round(Number(contentBounds.x) || 0)),
    y: Math.max(0, Math.round(Number(contentBounds.y) || 0)),
    width: Math.max(200, Math.min(windowWidth, Math.round(Number(contentBounds.width) || windowWidth))),
    height: Math.max(160, Math.min(windowHeight, Math.round(Number(contentBounds.height) || windowHeight)))
  };
  tab.view.setBounds(bounds);
}

function syncViewVisibility() {
  for (const tab of tabs.values()) {
    tab.view.setVisible(contentVisible && tab.id === activeTabId);
  }
  applyContentBounds();
}

function safelyLoad(tab, url) {
  const target = resolveAddress(url, newTabUrl());
  const allowFile = target === newTabUrl();
  if (!isAllowedNavigation(target, { allowFile })) return;
  tab.url = target;
  tab.loading = true;
  tab.view.webContents.loadURL(target).catch(error => {
    tab.loading = false;
    tab.title = 'Could not load page';
    console.error('[canopy:navigation]', error.message);
    broadcastState();
  });
}

function wireTab(tab) {
  const contents = tab.view.webContents;
  const update = () => {
    if (contents.isDestroyed()) return;
    tab.url = contents.getURL() || tab.url;
    tab.title = contents.getTitle() || (tab.url === newTabUrl() ? 'New tab' : tab.title);
    broadcastState();
  };

  contents.on('did-start-loading', () => { tab.loading = true; update(); });
  contents.on('did-stop-loading', () => { tab.loading = false; update(); });
  contents.on('did-navigate', update);
  contents.on('did-navigate-in-page', update);
  contents.on('page-title-updated', (_event, title) => { tab.title = String(title || 'New tab'); broadcastState(); });
  contents.on('page-favicon-updated', (_event, favicons) => { tab.favicon = favicons?.[0] || ''; broadcastState(); });
  contents.on('render-process-gone', (_event, details) => {
    tab.loading = false;
    tab.title = details.reason === 'clean-exit' ? tab.title : 'Page stopped';
    broadcastState();
  });
  contents.setWindowOpenHandler(({ url }) => {
    createTab({ url, space: tab.space, activate: true });
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, { allowFile: url === newTabUrl() })) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });
}

function createTab({ url = '', space = activeSpace, activate = true, id = crypto.randomUUID(), internalPage = '' } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      partition: 'persist:canopy'
    }
  });
  const tab = {
    id,
    view,
    url: newTabUrl(),
    title: 'New tab',
    favicon: '',
    loading: false,
    internalPage,
    space: spaces.some(item => item.id === space) ? space : 'personal',
    pinned: false
  };
  tabs.set(tab.id, tab);
  mainWindow.contentView.addChildView(view);
  wireTab(tab);
  safelyLoad(tab, url || newTabUrl());
  if (activate) selectTab(tab.id);
  else view.setVisible(false);
  broadcastState();
  return publicTab(tab);
}

function selectTab(id) {
  const tab = tabs.get(String(id));
  if (!tab) return null;
  activeTabId = tab.id;
  activeSpace = tab.space;
  store?.update({ settings: { activeSpace } });
  syncViewVisibility();
  broadcastState();
  return publicTab(tab);
}

function closeTab(id) {
  const tab = tabs.get(String(id));
  if (!tab) return false;
  const wasActive = tab.id === activeTabId;
  mainWindow.contentView.removeChildView(tab.view);
  if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  tabs.delete(tab.id);
  if (wasActive) {
    const replacement = Array.from(tabs.values()).reverse().find(item => item.space === activeSpace)
      || Array.from(tabs.values()).at(-1);
    activeTabId = replacement?.id || null;
    if (!replacement) createTab({ space: activeSpace });
    else selectTab(replacement.id);
  }
  broadcastState();
  return true;
}

function setActiveSpace(space) {
  if (!spaces.some(item => item.id === space)) return statePayload();
  activeSpace = space;
  store?.update({ settings: { activeSpace } });
  const candidate = Array.from(tabs.values()).reverse().find(tab => tab.space === space);
  if (candidate) selectTab(candidate.id);
  else createTab({ space });
  return statePayload();
}

function restoreTabs() {
  const snapshot = store.snapshot();
  activeSpace = snapshot.settings.activeSpace;
  const saved = isE2E || !snapshot.settings.restoreTabs ? [] : snapshot.tabs;
  if (!saved.length) {
    createTab({ space: activeSpace });
    return;
  }
  for (const [index, savedTab] of saved.entries()) {
    createTab({ ...savedTab, activate: index === saved.length - 1 });
  }
}

function currentWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return store?.snapshot().windowBounds || null;
  return mainWindow.getBounds();
}

function createWindow() {
  const persisted = store.snapshot();
  const rememberedBounds = persisted.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: Math.max(1040, Number(rememberedBounds.width) || 1440),
    height: Math.max(720, Number(rememberedBounds.height) || 900),
    x: Number.isFinite(rememberedBounds.x) ? rememberedBounds.x : undefined,
    y: Number.isFinite(rememberedBounds.y) ? rememberedBounds.y : undefined,
    minWidth: 960,
    minHeight: 680,
    title: 'Canopy',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#182027',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged || isE2E
    }
  });

  mainWindow.loadFile(distPath('index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('resize', () => {
    applyContentBounds();
    store.update({ windowBounds: currentWindowBounds() });
  });
  mainWindow.on('move', () => store.update({ windowBounds: currentWindowBounds() }));
  mainWindow.on('closed', () => {
    for (const tab of tabs.values()) {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    tabs.clear();
    mainWindow = null;
  });
}

function focusCommandBar() {
  sendToShell('browser:shortcut', { action: 'focus-command' });
}

function openSettings() {
  sendToShell('browser:shortcut', { action: 'open-settings' });
}

function installMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: openSettings },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CommandOrControl+T', click: () => createTab({ space: activeSpace }) },
        { label: 'Close Tab', accelerator: 'CommandOrControl+W', click: () => activeTabId && closeTab(activeTabId) }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { label: 'Focus Address Bar', accelerator: 'CommandOrControl+L', click: focusCommandBar },
        { label: 'Back', accelerator: 'CommandOrControl+[', click: () => goBack() },
        { label: 'Forward', accelerator: 'CommandOrControl+]', click: () => goForward() },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function goBack() {
  const contents = activeTab()?.view.webContents;
  if (contents?.navigationHistory?.canGoBack()) contents.navigationHistory.goBack();
}

function goForward() {
  const contents = activeTab()?.view.webContents;
  if (contents?.navigationHistory?.canGoForward()) contents.navigationHistory.goForward();
}

function configureSession() {
  const browserSession = session.fromPartition('persist:canopy');
  const promptablePermissions = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture']);
  browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const trustedGame = originMatches(requestingOrigin, store.snapshot().settings.gameUrl)
      || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/i.test(requestingOrigin);
    return (trustedGame && ['fullscreen', 'pointerLock'].includes(permission)) || promptablePermissions.has(permission);
  });
  browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingUrl || webContents.getURL();
    const trustedGame = originMatches(origin, store.snapshot().settings.gameUrl)
      || /^http:\/\/(127\.0\.0\.1|localhost):\d+/i.test(origin);
    if (trustedGame && ['fullscreen', 'pointerLock'].includes(permission)) {
      callback(true);
      return;
    }
    if (!promptablePermissions.has(permission) || !mainWindow) {
      callback(false);
      return;
    }
    let hostname = 'This site';
    try { hostname = new URL(origin).hostname || hostname; } catch { /* retain fallback */ }
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Allow', 'Block'],
      defaultId: 1,
      cancelId: 1,
      title: 'Site permission',
      message: `${hostname} wants access to ${permission.replace('-', ' ')}.`
    }).then(({ response }) => callback(response === 0)).catch(() => callback(false));
  });
  browserSession.on('will-download', (_event, item) => {
    const payload = { id: crypto.randomUUID(), filename: item.getFilename(), state: 'started', received: 0, total: item.getTotalBytes() };
    sendToShell('browser:download', payload);
    item.on('updated', (_downloadEvent, state) => {
      sendToShell('browser:download', { ...payload, state, received: item.getReceivedBytes(), total: item.getTotalBytes() });
    });
    item.once('done', (_downloadEvent, state) => {
      sendToShell('browser:download', { ...payload, state, received: item.getReceivedBytes(), total: item.getTotalBytes(), path: item.getSavePath() });
    });
  });
}

async function launchGame() {
  try {
    const url = await ensureGameFiles();
    const tab = createTab({ url, space: activeSpace, activate: true, internalPage: 'jims-mowing' });
    sendToShell('browser:game-status', { state: 'ready', message: 'Local Jim\'s Mowing client opened with online multiplayer.' });
    return { ok: true, tab };
  } catch (error) {
    sendToShell('browser:game-status', { state: 'error', message: error.message });
    return { ok: false, message: error.message };
  }
}

async function ensureGameFiles() {
  const settings = store.snapshot().settings;
  const sourcePath = settings.gameSourcePath || DEFAULT_GAME_SOURCE;
  const onlineServerUrl = settings.gameUrl || DEFAULT_GAME_URL;
  const key = JSON.stringify([sourcePath, onlineServerUrl, settings.gamePort]);
  if (gameFilesServer && gameFilesServerKey === key) return gameFilesServer.url;
  if (gameFilesServer) await gameFilesServer.close();
  gameFilesServer = null;
  gameFilesServerKey = '';
  sendToShell('browser:game-status', { state: 'starting', message: 'Opening the Jim\'s Mowing repository…' });
  gameFilesServer = await startGameFilesServer({
    sourcePath,
    onlineServerUrl,
    preferredPort: settings.gamePort || 3000
  });
  gameFilesServerKey = key;
  return gameFilesServer.url;
}

function registerIpc() {
  ipcMain.handle('browser:ready', () => {
    rendererReady = true;
    if (!tabs.size) restoreTabs();
    broadcastState();
    return statePayload();
  });
  ipcMain.handle('browser:get-state', () => statePayload());
  ipcMain.handle('browser:new-tab', (_event, options = {}) => createTab({ ...options, space: options.space || activeSpace }));
  ipcMain.handle('browser:select-tab', (_event, id) => selectTab(id));
  ipcMain.handle('browser:close-tab', (_event, id) => closeTab(id));
  ipcMain.handle('browser:navigate', (_event, payload = {}) => {
    const tab = tabs.get(payload.tabId || activeTabId);
    if (!tab) return null;
    safelyLoad(tab, payload.input);
    return publicTab(tab);
  });
  ipcMain.handle('browser:back', () => goBack());
  ipcMain.handle('browser:forward', () => goForward());
  ipcMain.handle('browser:reload', () => activeTab()?.view.webContents.reload());
  ipcMain.handle('browser:stop', () => activeTab()?.view.webContents.stop());
  ipcMain.handle('browser:set-space', (_event, space) => setActiveSpace(space));
  ipcMain.handle('browser:move-tab', (_event, payload = {}) => {
    const tab = tabs.get(payload.id);
    if (!tab || !spaces.some(space => space.id === payload.space)) return null;
    tab.space = payload.space;
    if (tab.id === activeTabId) activeSpace = payload.space;
    broadcastState();
    return publicTab(tab);
  });
  ipcMain.handle('browser:update-settings', (_event, patch = {}) => {
    const snapshot = store.update({ settings: patch }, { immediate: true });
    activeSpace = snapshot.settings.activeSpace;
    nativeTheme.themeSource = snapshot.settings.theme;
    broadcastState();
    return snapshot.settings;
  });
  ipcMain.on('browser:content-bounds', (_event, bounds) => {
    if (!bounds || typeof bounds !== 'object') return;
    contentBounds = bounds;
    applyContentBounds();
  });
  ipcMain.on('browser:content-visible', (_event, visible) => {
    contentVisible = !!visible;
    syncViewVisibility();
  });
  ipcMain.handle('browser:launch-game', () => launchGame());
  ipcMain.handle('browser:copy-text', (_event, value) => {
    clipboard.writeText(String(value || ''));
    return true;
  });
  ipcMain.handle('browser:open-downloads', () => shell.openPath(app.getPath('downloads')));
  ipcMain.handle('browser:show-in-finder', (_event, targetPath) => {
    if (targetPath && fs.existsSync(targetPath)) shell.showItemInFolder(targetPath);
  });
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'Canopy', applicationVersion: app.getVersion(), copyright: 'Built for macOS' });
  store = new CanopyStore(app.getPath('userData'));
  nativeTheme.themeSource = store.snapshot().settings.theme;
  registerIpc();
  configureSession();
  installMenu();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  clearTimeout(saveTabsTimer);
  store?.update({ windowBounds: currentWindowBounds() }, { immediate: true });
  gameFilesServer?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
