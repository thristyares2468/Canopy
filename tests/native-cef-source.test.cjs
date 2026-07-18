const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const nativeRoot = path.join(root, "native", "cef");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("native shell is composed from CEF BrowserViews without stock browser chrome", () => {
  const source = read("native/cef/canopy_window.cc");
  assert.match(source, /CefBrowserView::CreateBrowserView/);
  assert.match(source, /SetToBoxLayout/);
  assert.match(source, /kSidebarViewId/);
  assert.match(source, /CEF_RUNTIME_STYLE_ALLOY/);
  assert.doesNotMatch(source, /CefBrowserHost::CreateBrowser\(/);
});

test("native Spaces are persistent and limited", () => {
  const source = read("native/cef/canopy_window.cc");
  assert.match(source, /workspace\.tsv/);
  assert.match(source, /kMaximumSpaces = 12/);
  assert.match(source, /SaveWorkspace\(\)/);
  assert.match(source, /SwitchRelative\(int direction\)/);
});

test("native sidebar locks a trackpad gesture to one Space change", () => {
  const source = read("native/cef/resources/sidebar.js");
  assert.match(source, /swipeLocked/);
  assert.match(source, /Math\.abs\(swipeDistance\) < 105/);
  assert.match(source, /720/);
  assert.match(source, /action\(swipeDistance > 0 \? "next" : "previous"\)/);
});

test("native Spaces use a compact bottom dock with editable appearance", () => {
  const markup = read("native/cef/resources/sidebar.html");
  const script = read("native/cef/resources/sidebar.js");
  const styles = read("native/cef/resources/sidebar.css");
  const nativeSource = read("native/cef/canopy_window.cc");

  assert.match(markup, /<footer class="sidebar-footer">[\s\S]*id="spaceDots"/);
  assert.ok(markup.indexOf('class="favorites"') < markup.indexOf('class="space-stage"'));
  assert.match(markup, /id="favoritesList"/);
  assert.match(nativeSource, /mystandrews\.saac\.qld\.edu\.au\/favicon\.ico/);
  assert.match(nativeSource, /www\.google\.com\/favicon\.ico/);
  assert.doesNotMatch(markup, /id="spaceList"/);
  assert.match(markup, /id="settingsSpaceColors"/);
  assert.match(script, /const spaceThemes =/);
  assert.match(script, /setProperty\("--surface", theme\.surface\)/);
  assert.match(script, /action\("appearance"/);
  assert.match(styles, /\.space-dock-button\.active/);
  assert.match(nativeSource, /UpdateSpaceAppearance/);
  assert.match(nativeSource, /item->SetString\("color"/);
  assert.equal(
    nativeSource.includes("std::replace(encoded.begin(), encoded.end(), '+', ' ');"),
    true,
    "form-encoded Space names should preserve spaces"
  );
  assert.match(nativeSource, /UU_PATH_SEPARATORS/);
  assert.match(nativeSource, /UU_URL_SPECIAL_CHARS_EXCEPT_PATH_SEPARATORS/);
});

test("native Space and tab deletion recycle CEF BrowserViews safely", () => {
  const source = read("native/cef/canopy_window.cc");
  const header = read("native/cef/canopy_window.h");
  const deleteStart = source.indexOf("void CanopyWindow::DeleteSpace");
  const reorderStart = source.indexOf("void CanopyWindow::ReorderSpace");
  const deleteSource = source.slice(deleteStart, reorderStart);

  assert.match(header, /bool retired = false/);
  assert.match(deleteSource, /SwitchToSpace\(candidate\.id\)/);
  assert.match(deleteSource, /target->retired = true/);
  assert.match(deleteSource, /for \(Tab& tab : target->tabs\)/);
  assert.match(deleteSource, /LoadURL\("about:blank"\)/);
  assert.doesNotMatch(deleteSource, /CloseBrowser\(true\)/);
  assert.doesNotMatch(deleteSource, /spaces_\.erase/);
  assert.match(source, /CreateSpace[\s\S]*space\.retired[\s\S]*target->retired = false/);
  assert.match(source, /CloseTab[\s\S]*tab\.retired/);
});

test("native tabs are persistent within Spaces and support browser workflows", () => {
  const source = read("native/cef/canopy_window.cc");
  const header = read("native/cef/canopy_window.h");
  const markup = read("native/cef/resources/sidebar.html");
  const script = read("native/cef/resources/sidebar.js");

  assert.match(source, /kMaximumTabsPerSpace = 24/);
  assert.match(source, /output << "tab\\t"/);
  assert.match(source, /void CanopyWindow::SwitchToTab/);
  assert.match(source, /void CanopyWindow::ReopenClosedTab/);
  assert.match(source, /void CanopyWindow::MoveTabToSpace/);
  assert.match(source, /void CanopyWindow::ReorderTab/);
  assert.match(source, /void CanopyWindow::ReorderSpace/);
  assert.match(source, /output << "closed\\t"/);
  assert.match(source, /output << "favorite\\t"/);
  assert.match(source, /void CanopyWindow::ToggleFavorite/);
  assert.match(header, /std::vector<Tab> tabs/);
  assert.match(header, /std::deque<ClosedTab> closed_tabs_/);
  assert.match(markup, /id="pinnedTabs"/);
  assert.match(markup, /id="tabList"/);
  assert.match(script, /action\("pin-tab"/);
  assert.match(script, /action\("reorder-tab"/);
  assert.match(script, /action\("reorder-space"/);
  assert.match(script, /className = "tab-quick-actions"/);
  assert.match(script, /tab-context\?id=/);
});

test("native tab and Space context menus route commands through CEF", () => {
  const windowSource = read("native/cef/canopy_window.cc");
  const clientHeader = read("native/cef/browser_client.h");
  const clientSource = read("native/cef/browser_client.cc");

  assert.match(clientHeader, /OnContextMenuCommand/);
  assert.match(clientSource, /params->GetLinkUrl/);
  assert.match(clientSource, /PopulateTabContextMenu/);
  assert.match(clientSource, /PopulateSpaceContextMenu/);
  assert.match(windowSource, /Move to Space/);
  assert.match(windowSource, /HandleTabContextMenuCommand/);
  assert.match(windowSource, /HandleSpaceContextMenuCommand/);
  assert.match(windowSource, /window\.canopyPromptRenameSpace/);
});

test("native shell handles shortcuts, popups, history, favicons, and downloads", () => {
  const windowSource = read("native/cef/canopy_window.cc");
  const clientHeader = read("native/cef/browser_client.h");
  const clientSource = read("native/cef/browser_client.cc");
  const markup = read("native/cef/resources/sidebar.html");

  assert.match(clientHeader, /public CefDownloadHandler/);
  assert.match(clientHeader, /public CefKeyboardHandler/);
  assert.match(clientSource, /OnPreKeyEvent/);
  assert.match(clientSource, /OnBeforePopup/);
  assert.match(clientSource, /OnBeforeDownload/);
  assert.match(clientSource, /OnFaviconURLChange/);
  assert.match(windowSource, /history\.tsv/);
  assert.match(windowSource, /HandleKeyboardShortcut/);
  assert.match(markup, /id="libraryPanel"/);
  assert.match(markup, /id="downloadsTabButton"/);
  assert.match(markup, /id="commandMenu"/);
  assert.match(markup, /id="findBar"/);
  assert.match(windowSource, /GetHost\(\)->Find/);
  assert.match(windowSource, /GetHost\(\)->SetZoomLevel/);
  assert.match(windowSource, /GetHost\(\)->Print/);
  assert.match(windowSource, /ClearHttpCache/);
  assert.match(windowSource, /DeleteCookies/);
});

test("native build sources and resources are present", () => {
  const required = [
    "CMakeLists.txt",
    "app_browser_canopy.cc",
    "browser_client.cc",
    "canopy_window.cc",
    "updater_bridge.h",
    "updater_bridge.mm",
    "Info.plist.in",
    "main_canopy.cc",
    "resources/sidebar.html",
    "resources/sidebar.css",
    "resources/sidebar.js"
  ];

  for (const relativePath of required) {
    assert.equal(fs.existsSync(path.join(nativeRoot, relativePath)), true, relativePath);
  }
});

test("native shell embeds a signed Sparkle update channel", () => {
  const appSource = read("native/cef/app_browser_canopy.cc");
  const windowSource = read("native/cef/canopy_window.cc");
  const updaterSource = read("native/cef/updater_bridge.mm");
  const markup = read("native/cef/resources/sidebar.html");
  const plist = read("native/cef/Info.plist.in");
  const cmake = read("native/cef/CMakeLists.txt");
  const buildScript = read("scripts/build-native-cef.sh");

  assert.match(appSource, /StartUpdater\(\)/);
  assert.match(windowSource, /CheckForUpdates\(\)/);
  assert.match(updaterSource, /SPUStandardUpdaterController/);
  assert.match(markup, /id="checkUpdatesButton"/);
  assert.match(plist, /<key>SUFeedURL<\/key>/);
  assert.match(plist, /<key>SUPublicEDKey<\/key>/);
  assert.match(cmake, /Sparkle\.framework/);
  assert.match(buildScript, /download-sparkle\.sh/);
});

test("native sidebar resolves from the app bundle instead of CEF framework resources", () => {
  const source = read("native/cef/canopy_window.cc");
  assert.match(source, /PK_DIR_EXE/);
  assert.match(source, /"Resources" \/ "canopy" \/ "sidebar\.html"/);
  assert.doesNotMatch(source, /CefGetPath\(PK_DIR_RESOURCES/);
});

test("Jim's Mowing is served from the app bundle and connects to a configured server", () => {
  const windowSource = read("native/cef/canopy_window.cc");
  const clientHeader = read("native/cef/browser_client.h");
  const clientSource = read("native/cef/browser_client.cc");
  const buildScript = read("scripts/build-native-cef.sh");
  const stageScript = read("scripts/stage-jims-client.sh");
  const cmake = read("native/cef/CMakeLists.txt");

  assert.match(windowSource, /https:\/\/jims\.canopy\.internal\//);
  assert.doesNotMatch(windowSource, /jimsmowingandlawncare\.up\.railway\.app/);
  assert.match(clientHeader, /public CefResourceRequestHandler/);
  assert.match(clientSource, /"Resources" \/ "jims-game"/);
  assert.match(clientSource, /disable_default_handling = true/);
  assert.match(buildScript, /stage-jims-client\.sh/);
  assert.match(stageScript, /CANOPY_JIMS_SERVER_URL/);
  assert.match(stageScript, /wss:\/\/jimsmowingandlawncare\.up\.railway\.app\//);
  assert.match(stageScript, /serviceWorkerEnabled: false/);
  assert.match(cmake, /Resources\/jims-game/);
});
