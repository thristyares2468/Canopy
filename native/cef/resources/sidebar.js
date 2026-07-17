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
    spaceDots: document.querySelector("#spaceDots"),
    spaceList: document.querySelector("#spaceList"),
    spaceCount: document.querySelector("#spaceCount"),
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
    jimButton: document.querySelector("#jimButton")
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

  function renderSpaces() {
    const active = activeSpace();
    elements.spaceName.textContent = active?.name || "Canopy";
    elements.spaceCount.textContent = String(state.spaces.length);
    elements.deleteSpaceButton.disabled = state.spaces.length <= 1;
    elements.newSpaceButton.disabled = state.spaces.length >= state.maximumSpaces;

    elements.spaceDots.replaceChildren(
      ...state.spaces.map((space) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = `space-dot${space.id === state.activeSpaceId ? " active" : ""}`;
        dot.title = space.name;
        dot.setAttribute("aria-label", `Open ${space.name}`);
        dot.addEventListener("click", () => action("switch", { id: space.id }));
        return dot;
      })
    );

    elements.spaceList.replaceChildren(
      ...state.spaces.map((space, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `space-list-button${space.id === state.activeSpaceId ? " active" : ""}`;

        const number = document.createElement("span");
        number.className = "space-number";
        number.textContent = String(index + 1);

        const label = document.createElement("span");
        label.textContent = space.name;

        button.append(number, label);
        button.addEventListener("click", () => action("switch", { id: space.id }));
        return button;
      })
    );
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
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
    action(swipeDistance > 0 ? "next" : "previous");
    swipeDistance = 0;
    window.setTimeout(() => {
      swipeLocked = false;
    }, 720);
  }, { passive: false });

  action("ready");
})();
