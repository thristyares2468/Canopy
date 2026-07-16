const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('canopy', {
  ready: () => ipcRenderer.invoke('browser:ready'),
  getState: () => ipcRenderer.invoke('browser:get-state'),
  newTab: options => ipcRenderer.invoke('browser:new-tab', options),
  selectTab: id => ipcRenderer.invoke('browser:select-tab', id),
  closeTab: id => ipcRenderer.invoke('browser:close-tab', id),
  navigate: payload => ipcRenderer.invoke('browser:navigate', payload),
  goBack: () => ipcRenderer.invoke('browser:back'),
  goForward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  setSpace: space => ipcRenderer.invoke('browser:set-space', space),
  moveTabToSpace: payload => ipcRenderer.invoke('browser:move-tab', payload),
  updateSettings: patch => ipcRenderer.invoke('browser:update-settings', patch),
  setContentBounds: bounds => ipcRenderer.send('browser:content-bounds', bounds),
  setContentVisible: visible => ipcRenderer.send('browser:content-visible', visible),
  launchGame: () => ipcRenderer.invoke('browser:launch-game'),
  copyText: value => ipcRenderer.invoke('browser:copy-text', value),
  openDownloads: () => ipcRenderer.invoke('browser:open-downloads'),
  showInFinder: targetPath => ipcRenderer.invoke('browser:show-in-finder', targetPath),
  onState: listener => subscribe('browser:state', listener),
  onShortcut: listener => subscribe('browser:shortcut', listener),
  onDownload: listener => subscribe('browser:download', listener),
  onGameStatus: listener => subscribe('browser:game-status', listener)
});
