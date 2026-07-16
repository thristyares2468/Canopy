import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleUserRound,
  Command,
  Download,
  FolderOpen,
  Gamepad2,
  GitFork,
  Globe2,
  HardDrive,
  House,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share,
  ShieldCheck,
  Square,
  X
} from 'lucide-react';

const defaultSpaces = [
  { id: 'personal', name: 'Personal', color: '#58c783' },
  { id: 'work', name: 'Work', color: '#ef806f' },
  { id: 'research', name: 'Research', color: '#6c9dff' }
];

const initialState = {
  tabs: [],
  activeTabId: null,
  activeSpace: 'personal',
  spaces: defaultSpaces,
  settings: {
    theme: 'system',
    sidebarCollapsed: false,
    activeSpace: 'personal',
    gameUrl: 'https://jimsmowingandlawncare.up.railway.app',
    restoreTabs: true
  },
  platform: 'darwin'
};

const pinnedSites = [
  { name: 'Google', url: 'https://www.google.com', icon: Globe2 },
  { name: 'Gmail', url: 'https://mail.google.com', icon: Mail },
  { name: 'GitHub', url: 'https://github.com', icon: GitFork }
];

const settingsSections = [
  { id: 'general', label: 'General', icon: House },
  { id: 'appearance', label: 'Appearance', icon: Square },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'advanced', label: 'Advanced', icon: Command }
];

function browserApi() {
  return window.canopy || null;
}

function siteGlyph(tab) {
  if (tab.favicon) return <img src={tab.favicon} alt="" />;
  const value = String(tab.title || 'N').trim().charAt(0).toUpperCase() || 'N';
  return <span>{value}</span>;
}

function IconButton({ label, children, disabled = false, active = false, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" className={`switch${checked ? ' checked' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function TabRow({ tab, active, collapsed, onSelect, onClose }) {
  return (
    <div className={`tab-row${active ? ' active' : ''}`}>
      <button type="button" className="tab-select" onClick={onSelect} title={collapsed ? tab.title : undefined}>
        <span className="tab-favicon">{siteGlyph(tab)}</span>
        {!collapsed && <span className="tab-copy"><strong>{tab.title || 'New tab'}</strong><small>{tab.displayUrl || 'New tab'}</small></span>}
        {!collapsed && tab.loading && <LoaderCircle className="tab-loading" aria-label="Loading" />}
      </button>
      {!collapsed && <button type="button" className="tab-close" onClick={onClose} aria-label={`Close ${tab.title || 'tab'}`} title="Close tab"><X /></button>}
    </div>
  );
}

function SettingsScreen({ state, section, setSection, onClose, onSetting, onLaunchGame, gameStatus }) {
  const settings = state.settings;
  const [draftUrl, setDraftUrl] = useState(settings.gameUrl);

  useEffect(() => {
    setDraftUrl(settings.gameUrl);
  }, [settings.gameUrl]);

  const saveGameSettings = () => onSetting({ gameUrl: draftUrl });

  return (
    <section className="settings-screen" aria-label="Browser settings">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-heading">
          <IconButton label="Close settings" onClick={onClose}><ChevronLeft /></IconButton>
          <div><strong>Settings</strong><small>Canopy</small></div>
        </div>
        <nav aria-label="Settings sections">
          {settingsSections.map(item => {
            const Icon = item.icon;
            return <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><Icon /><span>{item.label}</span></button>;
          })}
        </nav>
      </aside>

      <div className="settings-content">
        <header><h1>{settingsSections.find(item => item.id === section)?.label || 'Settings'}</h1><p>Browser preferences are saved locally on this Mac.</p></header>

        {section === 'general' && <div className="settings-groups">
          <div className="setting-group">
            <div className="setting-copy"><strong>Search engine</strong><span>Google is used for searches entered in the command bar.</span></div>
            <div className="setting-value static"><Globe2 />Google</div>
          </div>
          <div className="setting-group">
            <div className="setting-copy"><strong>Restore tabs</strong><span>Reopen your browsing spaces after Canopy launches.</span></div>
            <Switch checked={settings.restoreTabs} label="Restore tabs" onChange={value => onSetting({ restoreTabs: value })} />
          </div>
          <div className="setting-group">
            <div className="setting-copy"><strong>Downloads</strong><span>Files use the standard macOS Downloads location.</span></div>
            <button className="secondary-button" type="button" onClick={() => browserApi()?.openDownloads()}><FolderOpen />Open Downloads</button>
          </div>
        </div>}

        {section === 'appearance' && <div className="settings-groups">
          <div className="setting-group vertical">
            <div className="setting-copy"><strong>Appearance</strong><span>Choose how Canopy follows macOS.</span></div>
            <div className="segmented-control" role="group" aria-label="Appearance">
              {['system', 'dark', 'light'].map(theme => <button type="button" key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => onSetting({ theme })}>{theme === 'system' ? 'Use system' : theme}</button>)}
            </div>
          </div>
          <div className="setting-group">
            <div className="setting-copy"><strong>Compact sidebar</strong><span>Collapse the sidebar to site icons and space controls.</span></div>
            <Switch checked={settings.sidebarCollapsed} label="Compact sidebar" onChange={value => onSetting({ sidebarCollapsed: value })} />
          </div>
        </div>}

        {section === 'privacy' && <div className="settings-groups">
          <div className="privacy-summary">
            <ShieldCheck />
            <div><strong>Sandboxed by default</strong><span>Every website runs without Node access. Camera, microphone, location, and notification requests require approval.</span></div>
          </div>
          <div className="setting-group">
            <div className="setting-copy"><strong>Pop-up handling</strong><span>New windows open as tabs in the current space.</span></div>
            <div className="setting-value static"><Check />Enabled</div>
          </div>
          <div className="setting-group">
            <div className="setting-copy"><strong>Site isolation</strong><span>Canopy uses Chromium's persistent isolated browser session.</span></div>
            <div className="setting-value static"><LockKeyhole />Active</div>
          </div>
        </div>}

        {section === 'advanced' && <div className="settings-groups">
          <div className="setting-group">
            <div className="setting-copy"><strong>Keyboard workflow</strong><span>Use ⌘T for a new tab, ⌘L for the command bar, and ⌘W to close a tab.</span></div>
            <div className="shortcut-stack"><kbd>⌘ T</kbd><kbd>⌘ L</kbd><kbd>⌘ W</kbd></div>
          </div>
          <details className="internal-pages">
            <summary><span><HardDrive />Internal pages</span><ChevronDown /></summary>
            <div className="internal-content">
              <div className="internal-heading"><div className="game-icon"><Gamepad2 /></div><div><strong>Jim's Mowing</strong><span>Hidden game launcher</span></div></div>
              <label>Online multiplayer server<input value={draftUrl} onChange={event => setDraftUrl(event.target.value)} onBlur={saveGameSettings} /></label>
              <div className="game-actions">
                <button type="button" className="primary-button" onClick={async () => { await saveGameSettings(); onLaunchGame(); }}><Gamepad2 />Open Jim's Mowing</button>
              </div>
              {gameStatus?.message && <div className={`game-status ${gameStatus.state || ''}`}>{gameStatus.state === 'starting' && <LoaderCircle />}<span>{gameStatus.message}</span></div>}
              <p className="internal-note">Canopy opens the secure public game directly while presenting it as an internal Jim's Mowing page.</p>
            </div>
          </details>
        </div>}
      </div>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('general');
  const [address, setAddress] = useState('');
  const [addressFocused, setAddressFocused] = useState(false);
  const [download, setDownload] = useState(null);
  const [gameStatus, setGameStatus] = useState(null);
  const [toast, setToast] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const viewportRef = useRef(null);
  const commandRef = useRef(null);
  const api = browserApi();

  const activeTab = useMemo(() => state.tabs.find(tab => tab.id === state.activeTabId) || null, [state.activeTabId, state.tabs]);
  const activeSpace = state.spaces.find(space => space.id === state.activeSpace) || state.spaces[0] || defaultSpaces[0];
  const visibleTabs = state.tabs.filter(tab => tab.space === state.activeSpace);
  const collapsed = !!state.settings.sidebarCollapsed;

  useEffect(() => {
    if (!api) return undefined;
    let mounted = true;
    api.ready().then(next => mounted && setState(next));
    const removeState = api.onState(next => setState(next));
    const removeShortcut = api.onShortcut(payload => {
      if (payload?.action === 'focus-command') {
        setSettingsOpen(false);
        requestAnimationFrame(() => commandRef.current?.focus());
      }
      if (payload?.action === 'open-settings') setSettingsOpen(true);
    });
    const removeDownload = api.onDownload(payload => setDownload(payload));
    const removeGameStatus = api.onGameStatus(payload => setGameStatus(payload));
    return () => { mounted = false; removeState?.(); removeShortcut?.(); removeDownload?.(); removeGameStatus?.(); };
  }, [api]);

  useEffect(() => {
    if (!addressFocused) setAddress(activeTab?.displayUrl || '');
  }, [activeTab?.displayUrl, addressFocused]);

  useEffect(() => {
    api?.setContentVisible(!settingsOpen);
  }, [api, settingsOpen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !api) return undefined;
    const publish = () => {
      const rect = viewport.getBoundingClientRect();
      api.setContentBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(publish);
    observer.observe(viewport);
    publish();
    window.addEventListener('resize', publish);
    return () => { observer.disconnect(); window.removeEventListener('resize', publish); };
  }, [api, collapsed, settingsOpen]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const navigate = event => {
    event?.preventDefault();
    if (!api) return;
    api.navigate({ tabId: state.activeTabId, input: address });
    commandRef.current?.blur();
  };

  const updateSettings = async patch => {
    if (!api) return;
    const settings = await api.updateSettings(patch);
    setState(current => ({ ...current, settings }));
  };

  const openPinned = item => {
    if (!api) return;
    api.newTab({ url: item.url, space: state.activeSpace });
  };

  const sharePage = async () => {
    if (!activeTab?.url) return;
    try {
      await api?.copyText(activeTab.url);
      setToast('Link copied');
    } catch {
      setToast('Could not copy link');
    }
  };

  const launchGame = async () => {
    if (!api) return;
    setGameStatus({ state: 'starting', message: "Opening Jim's Mowing online…" });
    const result = await api.launchGame();
    if (result?.ok) setSettingsOpen(false);
  };

  const theme = state.settings.theme || 'system';

  return (
    <div className={`app-shell theme-${theme}${collapsed ? ' sidebar-collapsed' : ''}`} style={{ '--space-accent': activeSpace.color }}>
      <aside className="browser-sidebar">
        <div className="sidebar-drag-region">
          <div className="traffic-light-space" />
          {!collapsed && <div className="canopy-wordmark"><span className="canopy-symbol"><i /><i /><i /></span><strong>Canopy</strong></div>}
          <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => updateSettings({ sidebarCollapsed: !collapsed })}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        </div>

        <form className="command-bar" onSubmit={navigate}>
          <Search />
          {!collapsed && <input ref={commandRef} value={address} onChange={event => setAddress(event.target.value)} onFocus={event => { setAddressFocused(true); event.target.select(); }} onBlur={() => setAddressFocused(false)} placeholder="Search or enter address" aria-label="Search or enter address" />}
          {!collapsed && <kbd>⌘ L</kbd>}
        </form>

        <nav className="pinned-sites" aria-label="Pinned sites">
          {pinnedSites.map(item => {
            const Icon = item.icon;
            return <button type="button" key={item.name} onClick={() => openPinned(item)} title={item.name}><span className="pin-icon"><Icon /></span>{!collapsed && <span>{item.name}</span>}</button>;
          })}
        </nav>

        <div className="sidebar-divider" />

        <div className="space-heading">
          {!collapsed && <><span className="space-dot" /><strong>{activeSpace.name}</strong><ChevronDown /></>}
          {collapsed && <span className="space-dot" title={activeSpace.name} />}
        </div>

        <div className="tab-list" aria-label={`${activeSpace.name} tabs`}>
          {visibleTabs.map(tab => <TabRow key={tab.id} tab={tab} active={tab.id === state.activeTabId} collapsed={collapsed} onSelect={() => api?.selectTab(tab.id)} onClose={event => { event.stopPropagation(); api?.closeTab(tab.id); }} />)}
          {!visibleTabs.length && !collapsed && <div className="empty-tabs"><BookOpen /><span>This space is quiet.</span></div>}
        </div>

        <button className="new-tab-button" type="button" onClick={() => api?.newTab({ space: state.activeSpace })} title="New tab">
          <Plus />{!collapsed && <><span>New tab</span><kbd>⌘ T</kbd></>}
        </button>

        <div className="sidebar-footer">
          <button type="button" className={`settings-button${settingsOpen ? ' active' : ''}`} onClick={() => setSettingsOpen(true)} title="Settings">
            <Settings />{!collapsed && <><span>Settings</span><kbd>⌘ ,</kbd></>}
          </button>
          <div className="space-switcher" aria-label="Spaces">
            {state.spaces.map(space => <button type="button" key={space.id} className={space.id === state.activeSpace ? 'active' : ''} style={{ '--switch-color': space.color }} onClick={() => api?.setSpace(space.id)} aria-label={space.name} title={space.name}><span /></button>)}
          </div>
        </div>
      </aside>

      <main className="browser-main">
        {!settingsOpen && <header className="page-toolbar">
          <div className="toolbar-nav">
            <IconButton label="Back" disabled={!activeTab?.canGoBack} onClick={() => api?.goBack()}><ArrowLeft /></IconButton>
            <IconButton label="Forward" disabled={!activeTab?.canGoForward} onClick={() => api?.goForward()}><ArrowRight /></IconButton>
            <IconButton label={activeTab?.loading ? 'Stop loading' : 'Reload'} onClick={() => activeTab?.loading ? api?.stop() : api?.reload()}>{activeTab?.loading ? <X /> : <RefreshCw />}</IconButton>
          </div>
          <button type="button" className="page-identity" onClick={() => commandRef.current?.focus()} title="Edit address">
            <span className="identity-icon">{activeTab ? siteGlyph(activeTab) : <Globe2 />}</span>
            <span><strong>{activeTab?.title || 'New tab'}</strong><small>{activeTab?.displayUrl || 'Search with Google'}</small></span>
          </button>
          <div className="toolbar-actions">
            <span className="privacy-status" title="Secure browsing"><ShieldCheck /></span>
            <IconButton label="Share" onClick={sharePage}><Share /></IconButton>
            <IconButton label="More" active={moreOpen} onClick={() => setMoreOpen(value => !value)}><MoreHorizontal /></IconButton>
          </div>
        </header>}

        {moreOpen && !settingsOpen && <div className="toolbar-menu">
          <button type="button" onClick={() => { api?.newTab({ space: state.activeSpace }); setMoreOpen(false); }}><Plus /><span>New tab</span><kbd>⌘ T</kbd></button>
          <button type="button" onClick={() => { api?.openDownloads(); setMoreOpen(false); }}><Download /><span>Downloads</span></button>
          <button type="button" onClick={() => { setSettingsOpen(true); setMoreOpen(false); }}><Settings /><span>Settings</span><kbd>⌘ ,</kbd></button>
        </div>}

        <div ref={viewportRef} className={`browser-viewport${settingsOpen ? ' hidden' : ''}`} aria-hidden="true" />

        {settingsOpen && <SettingsScreen state={state} section={settingsSection} setSection={setSettingsSection} onClose={() => setSettingsOpen(false)} onSetting={updateSettings} onLaunchGame={launchGame} gameStatus={gameStatus} />}
      </main>

      {download && <div className={`download-toast ${download.state}`}><Download /><span><strong>{download.filename}</strong><small>{download.state === 'completed' ? 'Download complete' : download.state === 'cancelled' ? 'Download cancelled' : 'Downloading…'}</small></span></div>}
      {toast && <div className="app-toast">{toast}</div>}
    </div>
  );
}
