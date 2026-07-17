(() => {
  "use strict";

  const elements = {
    addressForm: document.querySelector("#addressForm"),
    addressInput: document.querySelector("#addressInput"),
    backButton: document.querySelector("#backButton"),
    forwardButton: document.querySelector("#forwardButton"),
    reloadButton: document.querySelector("#reloadButton"),
    settingsButton: document.querySelector("#settingsButton"),
    closeSettingsButton: document.querySelector("#closeSettingsButton"),
    settingsPanel: document.querySelector("#settingsPanel"),
    spaceName: document.querySelector("#spaceName"),
    spaceGlyph: document.querySelector("#spaceGlyph"),
    spaceDots: document.querySelector("#spaceDots"),
    pageTitle: document.querySelector("#pageTitle"),
    pageHost: document.querySelector("#pageHost"),
    pageFavicon: document.querySelector("#pageFavicon"),
    loadingIndicator: document.querySelector("#loadingIndicator"),
    renameSpaceButton: document.querySelector("#renameSpaceButton"),
    deleteSpaceButton: document.querySelector("#deleteSpaceButton"),
    newSpaceButton: document.querySelector("#newSpaceButton"),
    settingsNewSpaceButton: document.querySelector("#settingsNewSpaceButton"),
    homeButton: document.querySelector("#homeButton"),
    settingsHomeButton: document.querySelector("#settingsHomeButton"),
    searchButton: document.querySelector("#searchButton"),
    jimButton: document.querySelector("#jimButton"),
    spaceContextMenu: document.querySelector("#spaceContextMenu"),
    contextSpaceGlyph: document.querySelector("#contextSpaceGlyph"),
    contextSpaceName: document.querySelector("#contextSpaceName"),
    contextRenameButton: document.querySelector("#contextRenameButton"),
    contextLabelButton: document.querySelector("#contextLabelButton"),
    contextDeleteButton: document.querySelector("#contextDeleteButton")
  };

  const spaceColors = {
    mint: "#6ad99d",
    blue: "#73aef5",
    violet: "#b693ef",
    rose: "#ec8eaf",
    amber: "#efb76e",
    teal: "#68ceca"
  };

  let state = {
    activeSpaceId: 0,
    maximumSpaces: 12,
    spaces: [],
    title: "Canopy",
    url: "",
    loading: false,
    canGoBack: false,
    canGoForward: false
  };

  let swipeDistance = 0;
  let swipeLocked = false;
  let swipeResetTimer = 0;
  let contextSpaceId = 0;

  function action(name, parameters = {}) {
    const query = new URLSearchParams(parameters).toString();
    window.location.href = `https://canopy.internal/${name}${query ? `?${query}` : ""}`;
  }

  function activeSpace() {
    return state.spaces.find((space) => space.id === state.activeSpaceId) || state.spaces[0];
  }

  function hostFor(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "") || "Canopy";
    } catch {
      return "Canopy";
    }
  }

  function faviconLetter(title, url) {
    const source = (title || hostFor(url) || "C").trim();
    return source ? source[0].toUpperCase() : "C";
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

  function contextSpace() {
    return state.spaces.find((space) => space.id === contextSpaceId);
  }

  function setContextMenu(open, spaceId = 0) {
    if (open) {
      contextSpaceId = spaceId;
    }
    const space = contextSpace();
    const visible = Boolean(open && space);
    elements.spaceContextMenu.classList.toggle("open", visible);
    elements.spaceContextMenu.setAttribute("aria-hidden", String(!visible));
    if (visible) {
      elements.contextSpaceName.textContent = space.name;
      elements.contextSpaceGlyph.textContent = displayLabel(space);
      elements.contextDeleteButton.disabled = state.spaces.length <= 1;
      elements.spaceContextMenu.style.setProperty(
        "--context-accent",
        spaceColors[space.color] || spaceColors.mint
      );
      document.querySelectorAll(".color-swatch").forEach((swatch) => {
        swatch.classList.toggle("selected", swatch.dataset.color === space.color);
      });
    } else {
      contextSpaceId = 0;
    }
  }

  function renderSpaces() {
    const active = activeSpace();
    elements.spaceName.textContent = active?.name || "Canopy";
    elements.spaceGlyph.textContent = displayLabel(active);
    document.documentElement.style.setProperty(
      "--space-accent",
      spaceColors[active?.color] || spaceColors.mint
    );
    elements.deleteSpaceButton.disabled = state.spaces.length <= 1;
    elements.newSpaceButton.disabled = state.spaces.length >= state.maximumSpaces;

    elements.spaceDots.replaceChildren(
      ...state.spaces.map((space) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `space-dock-button${space.id === state.activeSpaceId ? " active" : ""}`;
        button.title = space.name;
        button.dataset.spaceId = String(space.id);
        button.setAttribute("aria-label", `Open ${space.name}`);
        button.style.setProperty("--dock-accent", spaceColors[space.color] || spaceColors.mint);
        if (space.id === state.activeSpaceId) {
          button.setAttribute("aria-current", "page");
          const glyph = document.createElement("span");
          glyph.className = "space-dock-glyph";
          glyph.textContent = displayLabel(space);
          button.append(glyph);
        }
        button.addEventListener("click", () => action("switch", { id: space.id }));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu(true, space.id);
        });
        return button;
      })
    );
    if (contextSpaceId) {
      setContextMenu(true, contextSpaceId);
    }
  }

  function renderPage() {
    const title = state.title || activeSpace()?.name || "Canopy";
    const url = state.url || activeSpace()?.url || "";
    elements.pageTitle.textContent = title;
    elements.pageHost.textContent = hostFor(url);
    elements.pageFavicon.textContent = faviconLetter(title, url);
    elements.loadingIndicator.classList.toggle("visible", Boolean(state.loading));
    elements.backButton.disabled = !state.canGoBack;
    elements.forwardButton.disabled = !state.canGoForward;
    elements.reloadButton.innerHTML = state.loading ? "&#215;" : "&#8635;";
    elements.reloadButton.title = state.loading ? "Stop" : "Reload";

    if (document.activeElement !== elements.addressInput) {
      elements.addressInput.value = url;
    }
  }

  function render() {
    renderSpaces();
    renderPage();
  }

  function createSpace() {
    if (state.spaces.length >= state.maximumSpaces) {
      return;
    }
    const name = window.prompt("Space name", `Space ${state.spaces.length + 1}`);
    if (name?.trim()) {
      action("create", { name: name.trim() });
    }
  }

  function setSettingsOpen(open) {
    if (open) {
      setContextMenu(false);
    }
    elements.settingsPanel.classList.toggle("open", open);
    elements.settingsPanel.setAttribute("aria-hidden", String(!open));
  }

  window.canopySetState = (nextState) => {
    if (!nextState || !Array.isArray(nextState.spaces)) {
      return;
    }
    state = { ...state, ...nextState };
    render();
  };

  elements.addressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    action("navigate", { value: elements.addressInput.value });
  });
  elements.addressInput.addEventListener("focus", () => elements.addressInput.select());
  elements.backButton.addEventListener("click", () => action("back"));
  elements.forwardButton.addEventListener("click", () => action("forward"));
  elements.reloadButton.addEventListener("click", () => action(state.loading ? "stop" : "reload"));
  elements.homeButton.addEventListener("click", () => action("home"));
  elements.settingsHomeButton.addEventListener("click", () => {
    setSettingsOpen(false);
    action("home");
  });
  elements.searchButton.addEventListener("click", () => action("navigate", { value: "https://www.google.com/" }));
  elements.jimButton.addEventListener("click", () => {
    setSettingsOpen(false);
    action("jim");
  });
  elements.newSpaceButton.addEventListener("click", createSpace);
  elements.settingsNewSpaceButton.addEventListener("click", createSpace);
  elements.renameSpaceButton.addEventListener("click", () => {
    const space = activeSpace();
    if (!space) {
      return;
    }
    const name = window.prompt("Rename Space", space.name);
    if (name?.trim() && name.trim() !== space.name) {
      action("rename", { id: space.id, name: name.trim() });
    }
  });
  elements.deleteSpaceButton.addEventListener("click", () => {
    const space = activeSpace();
    if (space && state.spaces.length > 1 && window.confirm(`Delete ${space.name}?`)) {
      action("delete", { id: space.id });
    }
  });
  elements.settingsButton.addEventListener("click", () => setSettingsOpen(true));
  elements.closeSettingsButton.addEventListener("click", () => setSettingsOpen(false));
  elements.contextRenameButton.addEventListener("click", () => {
    const space = contextSpace();
    if (!space) return;
    const name = window.prompt("Rename Space", space.name);
    if (name?.trim() && name.trim() !== space.name) {
      action("rename", { id: space.id, name: name.trim() });
    }
    setContextMenu(false);
  });
  elements.contextLabelButton.addEventListener("click", () => {
    const space = contextSpace();
    if (!space) return;
    const requested = window.prompt("Space label (up to 3 characters)", displayLabel(space));
    if (requested !== null) {
      const label = Array.from(requested.trim()).slice(0, 3).join("");
      action("appearance", { id: space.id, label, color: space.color || "mint" });
    }
    setContextMenu(false);
  });
  elements.contextDeleteButton.addEventListener("click", () => {
    const space = contextSpace();
    if (space && state.spaces.length > 1 && window.confirm(`Delete ${space.name}?`)) {
      action("delete", { id: space.id });
    }
    setContextMenu(false);
  });
  document.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const space = contextSpace();
      if (space && swatch.dataset.color) {
        action("appearance", {
          id: space.id,
          label: space.label || "",
          color: swatch.dataset.color
        });
      }
      setContextMenu(false);
    });
  });
  document.querySelectorAll(".favorite-icon img").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
    });
  });

  document.addEventListener("click", (event) => {
    if (!elements.spaceContextMenu.contains(event.target)) {
      setContextMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setContextMenu(false);
      setSettingsOpen(false);
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
    action(swipeDistance > 0 ? "previous" : "next");
    swipeDistance = 0;
    window.setTimeout(() => {
      swipeLocked = false;
    }, 720);
  }, { passive: false });

  action("ready");
})();
