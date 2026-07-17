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
  assert.match(source, /action\(swipeDistance > 0 \? "previous" : "next"\)/);
});

test("native Spaces use a compact bottom dock with editable appearance", () => {
  const markup = read("native/cef/resources/sidebar.html");
  const script = read("native/cef/resources/sidebar.js");
  const styles = read("native/cef/resources/sidebar.css");
  const nativeSource = read("native/cef/canopy_window.cc");

  assert.match(markup, /<footer class="sidebar-footer">[\s\S]*id="spaceDots"/);
  assert.ok(markup.indexOf('class="favorites"') < markup.indexOf('class="space-stage"'));
  assert.match(markup, /mystandrews\.saac\.qld\.edu\.au\/favicon\.ico/);
  assert.match(markup, /www\.google\.com\/favicon\.ico/);
  assert.doesNotMatch(markup, /id="spaceList"/);
  assert.match(markup, /id="spaceContextMenu"/);
  assert.match(script, /addEventListener\("contextmenu"/);
  assert.match(script, /action\("appearance"/);
  assert.match(styles, /\.space-dock-button\.active/);
  assert.match(nativeSource, /UpdateSpaceAppearance/);
  assert.match(nativeSource, /item->SetString\("color"/);
  assert.equal(
    nativeSource.includes("std::replace(encoded.begin(), encoded.end(), '+', ' ');"),
    true,
    "form-encoded Space names should preserve spaces"
  );
});

test("native active Space deletion recycles its CEF BrowserView safely", () => {
  const source = read("native/cef/canopy_window.cc");
  const header = read("native/cef/canopy_window.h");
  const deleteStart = source.indexOf("void CanopyWindow::DeleteSpace");
  const navigateStart = source.indexOf("void CanopyWindow::NavigateActive");
  const deleteSource = source.slice(deleteStart, navigateStart);

  assert.match(header, /bool retired = false/);
  assert.match(deleteSource, /SwitchToSpace\(replacement\)/);
  assert.match(deleteSource, /target->retired = true/);
  assert.match(deleteSource, /LoadURL\("about:blank"\)/);
  assert.doesNotMatch(deleteSource, /CloseBrowser\(true\)/);
  assert.doesNotMatch(deleteSource, /spaces_\.erase/);
  assert.match(source, /CreateSpace[\s\S]*space\.retired[\s\S]*target->retired = false/);
});

test("native build sources and resources are present", () => {
  const required = [
    "CMakeLists.txt",
    "app_browser_canopy.cc",
    "browser_client.cc",
    "canopy_window.cc",
    "main_canopy.cc",
    "resources/sidebar.html",
    "resources/sidebar.css",
    "resources/sidebar.js"
  ];

  for (const relativePath of required) {
    assert.equal(fs.existsSync(path.join(nativeRoot, relativePath)), true, relativePath);
  }
});

test("native sidebar resolves from the app bundle instead of CEF framework resources", () => {
  const source = read("native/cef/canopy_window.cc");
  assert.match(source, /PK_DIR_EXE/);
  assert.match(source, /"Resources" \/ "canopy" \/ "sidebar\.html"/);
  assert.doesNotMatch(source, /CefGetPath\(PK_DIR_RESOURCES/);
});
