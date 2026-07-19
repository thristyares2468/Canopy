// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/canopy_window.h"
#include "examples/canopy/updater_bridge.h"
#include "examples/shared/app_factory.h"

#include <cstdlib>
#include <string>

#include "include/cef_command_line.h"
#include "include/views/cef_window.h"
#include "include/wrapper/cef_helpers.h"

namespace canopy {

namespace {

std::string GetUserDataDirectory() {
  const char* home = std::getenv("HOME");
  if (!home || !home[0]) {
    return std::string();
  }
  return std::string(home) +
         "/Library/Application Support/Canopy Native/Chromium";
}

class BrowserApp : public CefApp, public CefBrowserProcessHandler {
 public:
  BrowserApp() = default;

  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override {
    return this;
  }

  void OnBeforeCommandLineProcessing(
      const CefString& process_type,
      CefRefPtr<CefCommandLine> command_line) override {
    if (!process_type.empty()) {
      return;
    }

    command_line->AppendSwitch("use-mock-keychain");
    command_line->AppendSwitchWithValue("disable-features",
                                        "DialMediaRouteProvider");

    const std::string user_data_dir = GetUserDataDirectory();
    if (!user_data_dir.empty()) {
      command_line->AppendSwitchWithValue("user-data-dir", user_data_dir);
    }
  }

  void OnContextInitialized() override {
    CEF_REQUIRE_UI_THREAD();
    CefWindow::CreateTopLevelWindow(new CanopyWindow());
    StartUpdater();
  }

 private:
  IMPLEMENT_REFCOUNTING(BrowserApp);
  DISALLOW_COPY_AND_ASSIGN(BrowserApp);
};

}  // namespace

}  // namespace canopy

namespace shared {

CefRefPtr<CefApp> CreateBrowserProcessApp() {
  return new canopy::BrowserApp();
}

}  // namespace shared
