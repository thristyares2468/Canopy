const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_GAME_SOURCE = '/Users/jherbig/Documents/GitHub/fpsshooterserver';
const DEFAULT_GAME_URL = 'https://jim.up.railway.app';

const DEFAULT_STATE = Object.freeze({
  settings: {
    theme: 'system',
    sidebarCollapsed: false,
    activeSpace: 'personal',
    gameUrl: DEFAULT_GAME_URL,
    gameSourcePath: DEFAULT_GAME_SOURCE,
    gamePort: 3000,
    restoreTabs: true
  },
  tabs: [],
  windowBounds: null
});

function validSettings(value = {}) {
  return {
    theme: ['system', 'dark', 'light'].includes(value.theme) ? value.theme : DEFAULT_STATE.settings.theme,
    sidebarCollapsed: !!value.sidebarCollapsed,
    activeSpace: ['personal', 'work', 'research'].includes(value.activeSpace) ? value.activeSpace : 'personal',
    gameUrl: /^https?:\/\//i.test(String(value.gameUrl || '')) ? String(value.gameUrl) : DEFAULT_GAME_URL,
    gameSourcePath: String(value.gameSourcePath || DEFAULT_GAME_SOURCE),
    gamePort: Math.max(1024, Math.min(65535, Number(value.gamePort) || 3000)),
    restoreTabs: value.restoreTabs !== false
  };
}

function validTabs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map(tab => ({
    id: String(tab.id || ''),
    url: String(tab.url || ''),
    title: String(tab.title || 'New tab').slice(0, 200),
    space: ['personal', 'work', 'research'].includes(tab.space) ? tab.space : 'personal',
    pinned: !!tab.pinned
  })).filter(tab => tab.id && /^https?:\/\//i.test(tab.url));
}

class CanopyStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'canopy-state.json');
    this.state = this.read();
    this.saveTimer = null;
  }

  read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        settings: validSettings(raw.settings),
        tabs: validTabs(raw.tabs),
        windowBounds: raw.windowBounds && typeof raw.windowBounds === 'object' ? raw.windowBounds : null
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  snapshot() {
    return structuredClone(this.state);
  }

  update(patch = {}, { immediate = false } = {}) {
    if (patch.settings) this.state.settings = validSettings({ ...this.state.settings, ...patch.settings });
    if (patch.tabs) this.state.tabs = validTabs(patch.tabs);
    if (patch.windowBounds !== undefined) this.state.windowBounds = patch.windowBounds;
    if (immediate) this.flush();
    else this.queueSave();
    return this.snapshot();
  }

  queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 180);
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = {
  CanopyStore,
  DEFAULT_GAME_SOURCE,
  DEFAULT_GAME_URL,
  DEFAULT_STATE,
  validSettings,
  validTabs
};
