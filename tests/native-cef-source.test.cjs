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
