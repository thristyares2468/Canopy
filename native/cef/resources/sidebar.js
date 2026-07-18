(() => {
  "use strict";

  const elements = Object.fromEntries(
    [
      "addressForm", "addressInput", "backButton", "forwardButton", "reloadButton",
      "libraryButton", "footerLibraryButton", "settingsButton", "closeSettingsButton",
      "settingsPanel", "libraryPanel", "closeLibraryButton", "spaceName", "spaceGlyph",
      "spaceTabCount", "spaceDots", "pinnedSection", "pinnedTabs", "tabList",
      "newTabButton", "renameSpaceButton", "deleteSpaceButton", "newSpaceButton",
      "settingsNewSpaceButton", "settingsReopenTabButton", "settingsHistoryButton",
      "settingsDownloadsButton", "downloadCountValue", "settingsHomeButton",
      "favoritesList", "jimButton", "settingsSpaceColors",
      "historyTabButton", "downloadsTabButton", "historyToolbar",
      "historySearchInput", "clearHistoryButton", "libraryList", "toast", "commandMenu",
      "commandResults", "findBar", "findInput", "findPreviousButton", "findNextButton",
      "closeFindButton", "zoomOutButton", "zoomResetButton", "zoomInButton", "printButton",
      "clearBrowsingDataButton", "checkUpdatesButton", "appVersionValue"
    ].map((id) => [id, document.querySelector(`#${id}`)])
  );

  const spaceThemes = {
    mint: {
      accent: "#6ad99d", surface: "#18342c", raised: "#24483d",
      active: "#e5f7ed", muted: "#a8c3b8", ink: "#163127"
    },
    blue: {
      accent: "#73aef5", surface: "#1c2f46", raised: "#284560",
      active: "#e8f1fc", muted: "#adc2da", ink: "#172c45"
    },
    violet: {
      accent: "#b693ef", surface: "#302749", raised: "#43355f",
      active: "#f0eafd", muted: "#c5b6dd", ink: "#34224f"
    },
    rose: {
      accent: "#ec8eaf", surface: "#442837", raised: "#5b3548",
      active: "#fdebf1", muted: "#d9b3c1", ink: "#4a2232"
    },
    amber: {
      accent: "#efb76e", surface: "#433321", raised: "#5b452d",
      active: "#fff1dc", muted: "#d9c1a0", ink: "#4a3419"
    },
    teal: {
      accent: "#68ceca", surface: "#1a393b", raised: "#285052",
      active: "#e3f8f7", muted: "#a8cfcd", ink: "#183b3c"
    }
  };

  const spaceColors = Object.fromEntries(
    Object.entries(spaceThemes).map(([name, theme]) => [name, theme.accent])
  );

  let state = {
    activeSpaceId: 0,
    maximumSpaces: 12,
    maximumTabs: 24,
    closedTabCount: 0,
    favorites: [],
    spaces: [],
    tabs: [],
    history: [],
    downloads: [],
    title: "Canopy",
    url: "",
    faviconUrl: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    zoomPercent: 100,
    appVersion: "0.0.0",
    appBuild: "0"
  };

  let swipeDistance = 0;
  let swipeLocked = false;
  let swipeResetTimer = 0;
  let draggedTabId = 0;
  let draggedSpaceId = 0;
  let libraryKind = "history";
  let commandItems = [];
  let commandIndex = -1;
  let toastTimer = 0;
  const completedDownloads = new Set();

  function action(name, parameters = {}) {
    const query = new URLSearchParams(parameters).toString();
    window.location.href = `https://canopy.internal/${name}${query ? `?${query}` : ""}`;
  }

  function activeSpace() {
    return state.spaces.find((space) => space.id === state.activeSpaceId) || state.spaces[0];
  }

  function activeTab() {
    return state.tabs.find((tab) => tab.active) || state.tabs[0];
  }

  function tabIsFavorite(tab) {
    return Boolean(tab && state.favorites.some((favorite) => favorite.url === tab.url));
  }

  function hostFor(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "jims.canopy.internal") return "Jim's Mowing";
      return parsed.hostname.replace(/^www\./, "") || "Canopy";
    } catch {
      return "Canopy";
    }
  }

  function displayTitle(tab) {
    if (!tab) return "New Tab";
    const title = String(tab.title || "").trim();
    if (!title || title === tab.url || /^https?:\/\//.test(title)) {
      return hostFor(tab.url) || "New Tab";
    }
    return title;
  }

  function faviconLetter(title, url) {
    const source = (title || hostFor(url) || "C").trim();
    return source ? source[0].toUpperCase() : "C";
  }

  function makeFavicon(tab, className = "tab-favicon") {
    const container = document.createElement("span");
    container.className = className;
    const fallback = document.createElement("span");
    fallback.className = "favicon-fallback";
    fallback.textContent = faviconLetter(displayTitle(tab), tab?.url);
    container.append(fallback);
    if (tab?.faviconUrl) {
      const image = document.createElement("img");
      image.src = tab.faviconUrl;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove());
      container.append(image);
    }
    return container;
  }

  function makeQuickAction(symbol, label, handler) {
    const control = document.createElement("span");
    control.className = "tab-quick-action";
    control.title = label;
    control.setAttribute("role", "button");
    control.setAttribute("aria-label", label);
    control.tabIndex = 0;
    control.draggable = false;
    control.textContent = symbol;
    const activate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    };
    control.addEventListener("click", activate);
    control.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    return control;
  }

  function spaceGlyph(name) {
    const normalized = String(name || "").trim().toLowerCase();
    if (/school|saac|study/.test(normalized)) return "\u25a4";
    if (/research|search/.test(normalized)) return "\u2315";
    if (/personal|home/.test(normalized)) return "\u25cf";
    if (/code|work|dev/.test(normalized)) return "<>";
    return normalized.slice(0, 1).toUpperCase() || "C";
  }

  function displayLabel(space) {
    return space?.label || spaceGlyph(space?.name);
  }

  function makePinnedTab(tab) {
    const button = document.createElement("a");
    button.href = `https://canopy.internal/tab-context?id=${tab.id}`;
    button.className = `pinned-tab${tab.active ? " active" : ""}`;
    button.title = displayTitle(tab);
    button.setAttribute("aria-label", `Open ${displayTitle(tab)}`);
    button.draggable = true;
    if (tab.active) button.setAttribute("aria-current", "page");
    button.append(makeFavicon(tab, "pinned-favicon"));
    const activity = document.createElement("span");
    activity.className = `tab-activity${tab.loading ? " visible" : ""}`;
    activity.setAttribute("aria-hidden", "true");
    button.append(activity);
    const actions = document.createElement("span");
    actions.className = "pinned-quick-actions";
    actions.append(
      makeQuickAction(tabIsFavorite(tab) ? "\u2605" : "\u2606", "Toggle Favorite", () => action("toggle-favorite", { id: tab.id })),
      makeQuickAction("\u25a0", "Unpin Tab", () => action("pin-tab", { id: tab.id })),
      makeQuickAction("\u29c9", "Duplicate Tab", () => action("duplicate-tab", { id: tab.id })),
      makeQuickAction("\u00d7", "Close Tab", () => action("close-tab", { id: tab.id }))
    );
    button.append(actions);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      action("switch-tab", { id: tab.id });
    });
    button.addEventListener("dragstart", (event) => {
      draggedTabId = tab.id;
      event.dataTransfer.effectAllowed = "move";
      button.classList.add("dragging");
    });
    button.addEventListener("dragend", () => {
      draggedTabId = 0;
      button.classList.remove("dragging");
    });
    button.addEventListener("dragover", (event) => {
      if (draggedTabId && draggedTabId !== tab.id) event.preventDefault();
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      if (draggedTabId && draggedTabId !== tab.id) {
        action("reorder-tab", { id: draggedTabId, before: tab.id });
      }
      draggedTabId = 0;
    });
    return button;
  }

  function makeTabRow(tab) {
    const row = document.createElement("a");
    row.href = `https://canopy.internal/tab-context?id=${tab.id}`;
    row.className = `tab-row${tab.active ? " active" : ""}`;
    row.setAttribute("role", "tab");
    row.setAttribute("aria-selected", String(Boolean(tab.active)));
    row.draggable = true;
    row.title = displayTitle(tab);
    row.append(makeFavicon(tab));

    const copy = document.createElement("span");
    copy.className = "tab-copy";
    const title = document.createElement("strong");
    title.textContent = displayTitle(tab);
    const host = document.createElement("span");
    host.textContent = hostFor(tab.url);
    copy.append(title, host);
    row.append(copy);

    const activity = document.createElement("span");
    activity.className = `tab-activity${tab.loading ? " visible" : ""}`;
    activity.setAttribute("aria-hidden", "true");
    row.append(activity);

    const close = document.createElement("span");
    close.className = "tab-close";
    close.title = "Close Tab";
    close.setAttribute("aria-label", `Close ${displayTitle(tab)}`);
    close.textContent = "\u00d7";
    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action("close-tab", { id: tab.id });
    });
    const actions = document.createElement("span");
    actions.className = "tab-quick-actions";
    actions.append(
      makeQuickAction(tabIsFavorite(tab) ? "\u2605" : "\u2606", "Toggle Favorite", () => action("toggle-favorite", { id: tab.id })),
      makeQuickAction(tab.pinned ? "\u25a0" : "\u25a1", tab.pinned ? "Unpin Tab" : "Pin Tab", () => action("pin-tab", { id: tab.id })),
      makeQuickAction("\u29c9", "Duplicate Tab", () => action("duplicate-tab", { id: tab.id }))
    );
    row.append(actions);
    row.append(close);
    row.addEventListener("click", (event) => {
      event.preventDefault();
      action("switch-tab", { id: tab.id });
    });
    row.addEventListener("dragstart", (event) => {
      draggedTabId = tab.id;
      event.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      draggedTabId = 0;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (event) => {
      if (draggedTabId && draggedTabId !== tab.id) event.preventDefault();
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      if (draggedTabId && draggedTabId !== tab.id) {
        action("reorder-tab", { id: draggedTabId, before: tab.id });
      }
      draggedTabId = 0;
    });
    return row;
  }

  function renderSpaces() {
    const active = activeSpace();
    const theme = spaceThemes[active?.color] || spaceThemes.mint;
    elements.spaceName.textContent = active?.name || "Canopy";
    elements.spaceGlyph.textContent = displayLabel(active);
    elements.spaceTabCount.textContent = `${state.tabs.length} ${state.tabs.length === 1 ? "tab" : "tabs"}`;
    document.documentElement.style.setProperty("--space-accent", theme.accent);
    document.documentElement.style.setProperty("--surface", theme.surface);
    document.documentElement.style.setProperty("--surface-raised", theme.raised);
    document.documentElement.style.setProperty("--surface-active", theme.active);
    document.documentElement.style.setProperty("--muted", theme.muted);
    document.documentElement.style.setProperty("--ink", theme.ink);
    elements.settingsSpaceColors.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.classList.toggle("selected", swatch.dataset.color === (active?.color || "mint"));
    });
    elements.deleteSpaceButton.disabled = state.spaces.length <= 1;
    elements.newSpaceButton.disabled = state.spaces.length >= state.maximumSpaces;

    elements.spaceDots.replaceChildren(
      ...state.spaces.map((space) => {
        const button = document.createElement("a");
        button.href = `https://canopy.internal/space-context?id=${space.id}`;
        button.className = `space-dock-button${space.id === state.activeSpaceId ? " active" : ""}`;
        button.title = `${space.name} (${space.tabCount || 0})`;
        button.dataset.spaceId = String(space.id);
        button.draggable = true;
        button.setAttribute("aria-label", `Open ${space.name}`);
        button.style.setProperty("--dock-accent", spaceColors[space.color] || spaceColors.mint);
        if (space.id === state.activeSpaceId) {
          button.setAttribute("aria-current", "page");
          const glyph = document.createElement("span");
          glyph.className = "space-dock-glyph";
          glyph.textContent = displayLabel(space);
          button.append(glyph);
        }
        button.addEventListener("click", (event) => {
          event.preventDefault();
          action("switch", { id: space.id });
        });
        button.addEventListener("dragstart", (event) => {
          draggedSpaceId = space.id;
          event.dataTransfer.effectAllowed = "move";
        });
        button.addEventListener("dragend", () => {
          draggedSpaceId = 0;
        });
        button.addEventListener("dragover", (event) => {
          if (draggedSpaceId && draggedSpaceId !== space.id) event.preventDefault();
        });
        button.addEventListener("drop", (event) => {
          event.preventDefault();
          if (draggedSpaceId && draggedSpaceId !== space.id) {
            action("reorder-space", { id: draggedSpaceId, before: space.id });
          }
          draggedSpaceId = 0;
        });
        return button;
      })
    );
  }

  function renderFavorites() {
    elements.favoritesList.hidden = state.favorites.length === 0;
    elements.favoritesList.replaceChildren(...state.favorites.map((favorite) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "favorite-button";
      button.title = favorite.title || hostFor(favorite.url);
      button.setAttribute("aria-label", `Open ${button.title}`);
      button.append(makeFavicon(favorite, "favorite-icon"));
      button.addEventListener("click", () => action("open-favorite", { id: favorite.id }));
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (window.confirm(`Remove ${button.title} from Favorites?`)) {
          action("remove-favorite", { id: favorite.id });
        }
      });
      return button;
    }));
  }

  function renderTabs() {
    const pinned = state.tabs.filter((tab) => tab.pinned);
    const regular = state.tabs.filter((tab) => !tab.pinned);
    elements.pinnedSection.hidden = pinned.length === 0;
    elements.pinnedTabs.replaceChildren(...pinned.map(makePinnedTab));
    elements.tabList.replaceChildren(...regular.map(makeTabRow));
    elements.newTabButton.disabled = state.tabs.length >= state.maximumTabs;
  }

  function renderPage() {
    const tab = activeTab();
    const url = state.url || tab?.url || "";
    elements.backButton.disabled = !state.canGoBack;
    elements.forwardButton.disabled = !state.canGoForward;
    elements.reloadButton.innerHTML = state.loading ? "&#215;" : "&#8635;";
    elements.reloadButton.title = state.loading ? "Stop" : "Reload";
    elements.zoomResetButton.textContent = `${state.zoomPercent || 100}%`;
    elements.appVersionValue.textContent = `${state.appVersion || "0.0.0"} (${state.appBuild || "0"})`;
    if (document.activeElement !== elements.addressInput) {
      elements.addressInput.value = url;
    }
  }

  function closeCommandMenu() {
    commandIndex = -1;
    elements.commandMenu.classList.remove("open");
    elements.commandMenu.setAttribute("aria-hidden", "true");
  }

  function performCommandItem(item) {
    if (!item) return;
    closeCommandMenu();
    if (item.kind === "tab") {
      action("switch-tab", { id: item.id });
    } else if (item.kind === "history") {
      action("open-history", { value: item.url });
    } else if (item.kind === "search") {
      action("navigate", { value: item.value });
    } else if (item.command === "new-tab") {
      createTab();
    } else if (item.command === "reopen-tab") {
      action("reopen-tab");
    } else if (item.command === "settings") {
      setSettingsOpen(true);
    } else if (item.command === "history") {
      setLibraryOpen(true, "history");
    } else if (item.command === "downloads") {
      setLibraryOpen(true, "downloads");
    } else if (item.command === "home") {
      action("home");
    } else if (item.command) {
      action(item.command);
    }
  }

  function renderCommandMenu() {
    if (document.activeElement !== elements.addressInput) {
      closeCommandMenu();
      return;
    }
    const query = elements.addressInput.value.trim().toLowerCase();
    const rawQuery = elements.addressInput.value.trim();
    const current = activeTab();
    const seenUrls = new Set(current?.url ? [current.url] : []);
    const openTabs = state.tabs
      .filter((tab) => tab.id !== current?.id)
      .filter((tab) => !query || `${displayTitle(tab)} ${tab.url}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((tab) => {
        seenUrls.add(tab.url);
        return { kind: "tab", id: tab.id, label: displayTitle(tab), detail: "Open tab", tab };
      });
    const history = state.history
      .filter((entry) => !seenUrls.has(entry.url))
      .filter((entry) => !query || `${entry.title} ${entry.url}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((entry) => ({
        kind: "history",
        url: entry.url,
        label: entry.title || hostFor(entry.url),
        detail: hostFor(entry.url),
        tab: entry
      }));
    const commands = [
      { command: "new-tab", label: "New Tab", detail: "Command T" },
      { command: "reopen-tab", label: "Reopen Closed Tab", detail: "Shift Command T", disabled: state.closedTabCount === 0 },
      { command: "history", label: "Open History", detail: "Command Y" },
      { command: "downloads", label: "Open Downloads", detail: "Library" },
      { command: "settings", label: "Open Settings", detail: "Command ," },
      { command: "home", label: "Go Home", detail: "St Andrew's" },
      { command: "print", label: "Print Page", detail: "Command P" }
    ].filter((item) => !item.disabled)
      .filter((item) => !query || item.label.toLowerCase().includes(query))
      .slice(0, query ? 3 : 7)
      .map((item) => ({ kind: "command", ...item }));

    const search = rawQuery && rawQuery !== current?.url
      ? [{
          kind: "search",
          value: rawQuery,
          label: /^(https?:\/\/|[^ ]+\.[^ ]+)$/.test(rawQuery)
            ? `Open ${rawQuery}`
            : `Search Google for "${rawQuery}"`,
          detail: "Press Return",
          tab: { title: rawQuery, url: rawQuery }
        }]
      : [];
    commandItems = [...search, ...openTabs, ...history, ...commands].slice(0, 8);
    if (commandIndex >= commandItems.length) commandIndex = commandItems.length - 1;
    elements.commandResults.replaceChildren(...commandItems.map((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `command-result${index === commandIndex ? " selected" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === commandIndex));
      const icon = item.kind === "command"
        ? Object.assign(document.createElement("span"), { className: "command-symbol", textContent: "\u2318" })
        : makeFavicon(item.tab);
      const copy = document.createElement("span");
      copy.className = "command-copy";
      const label = document.createElement("strong");
      label.textContent = item.label;
      const detail = document.createElement("span");
      detail.textContent = item.detail;
      copy.append(label, detail);
      button.append(icon, copy);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => performCommandItem(item));
      return button;
    }));
    const open = commandItems.length > 0;
    elements.commandMenu.classList.toggle("open", open);
    elements.commandMenu.setAttribute("aria-hidden", String(!open));
  }

  function setFindOpen(open) {
    elements.findBar.hidden = !open;
    if (open) {
      closeCommandMenu();
      window.setTimeout(() => {
        elements.findInput.focus();
        elements.findInput.select();
      }, 0);
    } else {
      action("stop-find");
    }
  }

  function findOnPage(forward, findNext = true) {
    const value = elements.findInput.value.trim();
    if (!value) return;
    action("find", { value, direction: forward ? "forward" : "backward", next: findNext ? 1 : 0 });
  }

  function formatTime(timestamp) {
    if (!timestamp) return "Recently";
    const date = new Date(timestamp * 1000);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function renderLibrary() {
    elements.historyTabButton.classList.toggle("active", libraryKind === "history");
    elements.downloadsTabButton.classList.toggle("active", libraryKind === "downloads");
    elements.historyToolbar.hidden = libraryKind !== "history";
    elements.downloadCountValue.textContent = String(state.downloads.length);
    if (libraryKind === "history") {
      const query = elements.historySearchInput.value.trim().toLowerCase();
      const entries = state.history.filter((entry) =>
        !query || `${entry.title} ${entry.url}`.toLowerCase().includes(query)
      );
      elements.clearHistoryButton.disabled = state.history.length === 0;
      elements.libraryList.replaceChildren(
        ...(entries.length ? entries.map((entry) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "library-row";
          const icon = makeFavicon({ title: entry.title, url: entry.url });
          const copy = document.createElement("span");
          copy.className = "library-copy";
          const title = document.createElement("strong");
          title.textContent = entry.title || hostFor(entry.url);
          const url = document.createElement("span");
          url.textContent = hostFor(entry.url);
          copy.append(title, url);
          const time = document.createElement("time");
          time.textContent = formatTime(entry.visitedAt);
          button.append(icon, copy, time);
          button.addEventListener("click", () => {
            setLibraryOpen(false);
            action("open-history", { value: entry.url });
          });
          return button;
        }) : [emptyState(query ? "No matching history" : "Pages you visit will appear here")])
      );
      return;
    }

    elements.libraryList.replaceChildren(
      ...(state.downloads.length ? state.downloads.map((download) => {
        const row = document.createElement("div");
        row.className = "library-row download-row";
        const icon = document.createElement("span");
        icon.className = "download-icon";
        icon.textContent = download.complete ? "\u2713" : "\u2193";
        const copy = document.createElement("span");
        copy.className = "library-copy";
        const title = document.createElement("strong");
        title.textContent = download.name || "Download";
        const status = document.createElement("span");
        if (download.canceled) {
          status.textContent = "Canceled";
        } else if (download.complete) {
          status.textContent = `${formatBytes(download.totalBytes)} - Downloads`;
        } else if (download.percentComplete >= 0) {
          status.textContent = `${download.percentComplete}% - ${formatBytes(download.receivedBytes)}`;
        } else {
          status.textContent = `${formatBytes(download.receivedBytes)} downloaded`;
        }
        copy.append(title, status);
        row.append(icon, copy);
        if (download.inProgress && download.percentComplete >= 0) {
          const progress = document.createElement("span");
          progress.className = "download-progress";
          const fill = document.createElement("span");
          fill.style.width = `${Math.max(0, Math.min(100, download.percentComplete))}%`;
          progress.append(fill);
          row.append(progress);
        }
        return row;
      }) : [emptyState("Downloads will appear here")])
    );
  }

  function emptyState(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function render() {
    renderFavorites();
    renderSpaces();
    renderTabs();
    renderPage();
    renderLibrary();
    elements.settingsReopenTabButton.disabled = state.closedTabCount === 0;
  }

  function createSpace() {
    if (state.spaces.length >= state.maximumSpaces) return;
    const name = window.prompt("Space name", `Space ${state.spaces.length + 1}`);
    if (name?.trim()) action("create", { name: name.trim() });
  }

  function createTab() {
    if (state.tabs.length >= state.maximumTabs) return;
    action("new-tab");
    window.setTimeout(() => window.canopyFocusAddress(), 80);
  }

  function setOverlayOpen(panel, open) {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
  }

  function setSettingsOpen(open) {
    setOverlayOpen(elements.settingsPanel, open);
    if (open) setOverlayOpen(elements.libraryPanel, false);
  }

  function setLibraryOpen(open, kind = libraryKind) {
    libraryKind = kind;
    setOverlayOpen(elements.libraryPanel, open);
    if (open) {
      setOverlayOpen(elements.settingsPanel, false);
      renderLibrary();
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
  }

  window.canopySetState = (nextState) => {
    if (!nextState || !Array.isArray(nextState.spaces)) return;
    for (const download of nextState.downloads || []) {
      if (download.complete && !completedDownloads.has(download.id)) {
        completedDownloads.add(download.id);
        if (state.downloads.some((entry) => entry.id === download.id)) {
          showToast(`${download.name || "Download"} is ready`);
        }
      }
    }
    state = { ...state, ...nextState };
    render();
  };

  window.canopyFocusAddress = () => {
    setSettingsOpen(false);
    setLibraryOpen(false);
    elements.addressInput.focus();
    elements.addressInput.select();
    renderCommandMenu();
  };
  window.canopyOpenSettings = () => setSettingsOpen(true);
  window.canopyOpenLibrary = (kind = "history") => setLibraryOpen(true, kind);
  window.canopyOpenFind = () => setFindOpen(true);
  window.canopyPromptRenameSpace = (spaceId) => {
    const space = state.spaces.find((entry) => entry.id === Number(spaceId));
    if (!space) return;
    const name = window.prompt("Rename Space", space.name);
    if (name?.trim() && name.trim() !== space.name) {
      action("rename", { id: space.id, name: name.trim() });
    }
  };
  window.canopyPromptSpaceLabel = (spaceId) => {
    const space = state.spaces.find((entry) => entry.id === Number(spaceId));
    if (!space) return;
    const requested = window.prompt("Space label (up to 3 characters)", displayLabel(space));
    if (requested !== null) {
      const label = Array.from(requested.trim()).slice(0, 3).join("");
      action("appearance", { id: space.id, label, color: space.color || "mint" });
    }
  };
  window.canopyConfirmDeleteSpace = (spaceId) => {
    const space = state.spaces.find((entry) => entry.id === Number(spaceId));
    if (space && state.spaces.length > 1 && window.confirm(`Delete ${space.name}?`)) {
      action("delete", { id: space.id });
    }
  };

  elements.addressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (commandIndex >= 0 && commandItems[commandIndex]) {
      performCommandItem(commandItems[commandIndex]);
      return;
    }
    closeCommandMenu();
    action("navigate", { value: elements.addressInput.value });
  });
  elements.addressInput.addEventListener("focus", () => {
    elements.addressInput.select();
    renderCommandMenu();
  });
  elements.addressInput.addEventListener("input", () => {
    commandIndex = -1;
    renderCommandMenu();
  });
  elements.addressInput.addEventListener("blur", () => window.setTimeout(closeCommandMenu, 120));
  elements.addressInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!commandItems.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      commandIndex = (commandIndex + direction + commandItems.length) % commandItems.length;
      renderCommandMenu();
    } else if (event.key === "Escape") {
      closeCommandMenu();
      elements.addressInput.blur();
    }
  });
  elements.backButton.addEventListener("click", () => action("back"));
  elements.forwardButton.addEventListener("click", () => action("forward"));
  elements.reloadButton.addEventListener("click", () => action(state.loading ? "stop" : "reload"));
  elements.newTabButton.addEventListener("click", createTab);
  elements.newSpaceButton.addEventListener("click", createSpace);
  elements.settingsNewSpaceButton.addEventListener("click", createSpace);
  elements.settingsReopenTabButton.addEventListener("click", () => {
    setSettingsOpen(false);
    action("reopen-tab");
  });
  elements.renameSpaceButton.addEventListener("click", () => {
    const space = activeSpace();
    if (space) window.canopyPromptRenameSpace(space.id);
  });
  elements.deleteSpaceButton.addEventListener("click", () => {
    const space = activeSpace();
    if (space) window.canopyConfirmDeleteSpace(space.id);
  });

  elements.settingsButton.addEventListener("click", () => setSettingsOpen(true));
  elements.closeSettingsButton.addEventListener("click", () => setSettingsOpen(false));
  elements.libraryButton.addEventListener("click", () => setLibraryOpen(true));
  elements.footerLibraryButton.addEventListener("click", () => setLibraryOpen(true));
  elements.closeLibraryButton.addEventListener("click", () => setLibraryOpen(false));
  elements.historyTabButton.addEventListener("click", () => setLibraryOpen(true, "history"));
  elements.downloadsTabButton.addEventListener("click", () => setLibraryOpen(true, "downloads"));
  elements.historySearchInput.addEventListener("input", renderLibrary);
  elements.clearHistoryButton.addEventListener("click", () => {
    if (state.history.length && window.confirm("Clear all browsing history?")) action("clear-history");
  });
  elements.settingsHistoryButton.addEventListener("click", () => setLibraryOpen(true, "history"));
  elements.settingsDownloadsButton.addEventListener("click", () => setLibraryOpen(true, "downloads"));
  elements.settingsHomeButton.addEventListener("click", () => {
    setSettingsOpen(false);
    action("home");
  });
  elements.jimButton.addEventListener("click", () => {
    setSettingsOpen(false);
    action("jim");
  });
  elements.settingsSpaceColors.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const space = activeSpace();
      if (space && swatch.dataset.color) {
        action("appearance", {
          id: space.id,
          label: space.label || "",
          color: swatch.dataset.color
        });
      }
    });
  });

  elements.findBar.addEventListener("submit", (event) => {
    event.preventDefault();
    findOnPage(true, false);
  });
  elements.findInput.addEventListener("input", () => findOnPage(true, false));
  elements.findPreviousButton.addEventListener("click", () => findOnPage(false));
  elements.findNextButton.addEventListener("click", () => findOnPage(true));
  elements.closeFindButton.addEventListener("click", () => setFindOpen(false));
  elements.zoomOutButton.addEventListener("click", () => action("zoom-out"));
  elements.zoomResetButton.addEventListener("click", () => action("zoom-reset"));
  elements.zoomInButton.addEventListener("click", () => action("zoom-in"));
  elements.printButton.addEventListener("click", () => {
    setSettingsOpen(false);
    action("print");
  });
  elements.clearBrowsingDataButton.addEventListener("click", () => {
    if (window.confirm("Clear browsing history, cookies, and cached website data?")) {
      action("clear-browsing-data");
      showToast("Browsing data cleared");
    }
  });
  elements.checkUpdatesButton.addEventListener("click", () => {
    action("check-updates");
    showToast("Checking for updates...");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.findBar.hidden) setFindOpen(false);
      setSettingsOpen(false);
      setLibraryOpen(false);
    }
  });

  document.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.15 || Math.abs(event.deltaX) < 4) {
      return;
    }
    event.preventDefault();
    window.clearTimeout(swipeResetTimer);
    swipeResetTimer = window.setTimeout(() => {
      swipeDistance = 0;
    }, 180);

    if (swipeLocked) {
      return;
    }
    swipeDistance += event.deltaX;
    if (Math.abs(swipeDistance) < 105) {
      return;
    }

    swipeLocked = true;
    action(swipeDistance > 0 ? "next" : "previous");
    swipeDistance = 0;
    window.setTimeout(() => {
      swipeLocked = false;
    }, 720);
  }, { passive: false });

  action("ready");
})();
