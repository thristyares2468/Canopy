// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/canopy_window.h"

#include "examples/canopy/browser_client.h"
#include "examples/canopy/updater_bridge.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <sstream>
#include <utility>

#include "include/cef_parser.h"
#include "include/cef_path_util.h"
#include "include/cef_request_context.h"
#include "include/cef_values.h"
#include "include/views/cef_box_layout.h"
#include "include/wrapper/cef_helpers.h"

namespace canopy {

namespace {

constexpr int kSidebarViewId = 10;
constexpr int kContentViewIdBase = 1000;
constexpr int kMaximumSpaces = 12;
constexpr int kMaximumTabsPerSpace = 24;
constexpr size_t kMaximumClosedTabs = 20;
constexpr size_t kMaximumFavorites = 8;
constexpr size_t kMaximumHistoryEntries = 250;
constexpr size_t kMaximumDownloads = 40;
constexpr int kMenuPinTab = 27001;
constexpr int kMenuFavoriteTab = 27002;
constexpr int kMenuDuplicateTab = 27003;
constexpr int kMenuMoveTab = 27004;
constexpr int kMenuCloseTab = 27005;
constexpr int kMenuRenameSpace = 27101;
constexpr int kMenuLabelSpace = 27102;
constexpr int kMenuSpaceTheme = 27103;
constexpr int kMenuDeleteSpace = 27104;
constexpr int kMenuSpaceThemeBase = 27200;
constexpr int kMenuMoveTabToSpaceBase = 27300;
constexpr char kHomeUrl[] = "https://mystandrews.saac.qld.edu.au/";
constexpr char kSearchUrl[] = "https://www.google.com/";
constexpr char kJimUrl[] = "https://jims.canopy.internal/";
constexpr char kActionPrefix[] = "https://canopy.internal/";
constexpr const char* kSpaceColors[] = {
    "mint", "blue", "violet", "rose", "amber", "teal"};
constexpr const char* kSpaceColorLabels[] = {
    "Mint", "Blue", "Violet", "Rose", "Amber", "Teal"};

#ifndef CANOPY_VERSION
#define CANOPY_VERSION "0.0.0"
#endif

#ifndef CANOPY_BUILD_NUMBER
#define CANOPY_BUILD_NUMBER "0"
#endif

std::string Trim(std::string value) {
  const auto not_space = [](unsigned char character) {
    return !std::isspace(character);
  };
  value.erase(value.begin(),
              std::find_if(value.begin(), value.end(), not_space));
  value.erase(std::find_if(value.rbegin(), value.rend(), not_space).base(),
              value.end());
  return value;
}

std::string SanitizeField(std::string value) {
  std::replace(value.begin(), value.end(), '\t', ' ');
  std::replace(value.begin(), value.end(), '\n', ' ');
  std::replace(value.begin(), value.end(), '\r', ' ');
  return Trim(value);
}

std::string SanitizeLabel(std::string value) {
  value = SanitizeField(value);
  if (value.size() > 24) {
    value.resize(24);
  }
  return value;
}

std::string SanitizeColor(const std::string& value) {
  for (const char* color : kSpaceColors) {
    if (value == color) {
      return value;
    }
  }
  return "mint";
}

std::string DecodeQueryValue(const std::string& url, const std::string& key) {
  const std::string token = key + "=";
  const size_t query_start = url.find('?');
  if (query_start == std::string::npos) {
    return std::string();
  }

  size_t value_start = url.find(token, query_start + 1);
  while (value_start != std::string::npos) {
    if (value_start == query_start + 1 || url[value_start - 1] == '&') {
      value_start += token.size();
      const size_t value_end = url.find('&', value_start);
      std::string encoded = url.substr(value_start, value_end - value_start);
      std::replace(encoded.begin(), encoded.end(), '+', ' ');
      const auto rules = static_cast<cef_uri_unescape_rule_t>(
          UU_SPACES | UU_PATH_SEPARATORS |
          UU_URL_SPECIAL_CHARS_EXCEPT_PATH_SEPARATORS);
      return CefURIDecode(encoded, true, rules).ToString();
    }
    value_start = url.find(token, value_start + token.size());
  }
  return std::string();
}

int DecodeInt(const std::string& value, int fallback) {
  if (value.empty()) {
    return fallback;
  }
  char* end = nullptr;
  const long parsed = std::strtol(value.c_str(), &end, 10);
  if (!end || *end != '\0' || parsed < 1 || parsed > 1000000) {
    return fallback;
  }
  return static_cast<int>(parsed);
}

int64_t DecodeInt64(const std::string& value, int64_t fallback) {
  if (value.empty()) {
    return fallback;
  }
  char* end = nullptr;
  const long long parsed = std::strtoll(value.c_str(), &end, 10);
  if (!end || *end != '\0' || parsed < 0) {
    return fallback;
  }
  return static_cast<int64_t>(parsed);
}

std::string ActionName(const std::string& url) {
  if (url.rfind(kActionPrefix, 0) != 0) {
    return std::string();
  }
  const size_t path_start = sizeof(kActionPrefix) - 1;
  const size_t query_start = url.find('?', path_start);
  return url.substr(path_start, query_start - path_start);
}

template <typename SpaceType>
size_t AvailableTabCount(const SpaceType& space) {
  return std::count_if(space.tabs.begin(), space.tabs.end(),
                       [](const auto& tab) {
                         return !tab.retired;
                       });
}

bool IsHistoryUrl(const std::string& url) {
  return url.rfind("https://", 0) == 0 || url.rfind("http://", 0) == 0;
}

}  // namespace

CanopyWindow::CanopyWindow() {
  LoadWorkspace();
  LoadHistory();
  EnsureDefaultSpaces();
  EnsureDefaultFavorites();
}

void CanopyWindow::OnWindowCreated(CefRefPtr<CefWindow> window) {
  CEF_REQUIRE_UI_THREAD();
  window_ = window;
  window_->SetTitle("Canopy");

  CefBoxLayoutSettings layout_settings;
  layout_settings.horizontal = true;
  layout_settings.between_child_spacing = 1;
  CefRefPtr<CefBoxLayout> layout = window_->SetToBoxLayout(layout_settings);

  CreateSidebarView();
  window_->AddChildView(sidebar_view_);
  layout->SetFlexForView(sidebar_view_, 0);

  if (Space* active_space = ActiveSpace()) {
    EnsureSpaceHasTab(*active_space, kSearchUrl);
    if (Tab* active_tab = FindTab(*active_space,
                                  active_space->active_tab_id)) {
      EnsureTabView(*active_space, *active_tab, true);
    }
  }

  window_->Show();
  if (Tab* active = ActiveTab()) {
    if (active->browser_view) {
      active->browser_view->RequestFocus();
    }
  }
  UpdateWindowTitle();
}

void CanopyWindow::OnWindowDestroyed(CefRefPtr<CefWindow> window) {
  CEF_REQUIRE_UI_THREAD();
  SaveWorkspace();
  SaveHistory();
  sidebar_ready_ = false;
  sidebar_view_ = nullptr;
  for (auto& space : spaces_) {
    for (auto& tab : space.tabs) {
      tab.browser_view = nullptr;
    }
  }
  window_ = nullptr;
}

bool CanopyWindow::CanClose(CefRefPtr<CefWindow> window) {
  CEF_REQUIRE_UI_THREAD();
  bool can_close = true;
  if (sidebar_view_ && sidebar_view_->GetBrowser()) {
    can_close = sidebar_view_->GetBrowser()->GetHost()->TryCloseBrowser() &&
                can_close;
  }
  for (const auto& space : spaces_) {
    for (const auto& tab : space.tabs) {
      if (tab.browser_view && tab.browser_view->GetBrowser()) {
        can_close =
            tab.browser_view->GetBrowser()->GetHost()->TryCloseBrowser() &&
            can_close;
      }
    }
  }
  return can_close;
}

CefRect CanopyWindow::GetInitialBounds(CefRefPtr<CefWindow> window) {
  return CefRect(64, 64, 1440, 900);
}

CefSize CanopyWindow::GetPreferredSize(CefRefPtr<CefView> view) {
  if (view && view->GetID() == kSidebarViewId) {
    return CefSize(310, 860);
  }
  if (view && view->GetID() >= kContentViewIdBase) {
    return CefSize(1130, 860);
  }
  return CefSize(1440, 900);
}

CefSize CanopyWindow::GetMinimumSize(CefRefPtr<CefView> view) {
  if (view && view->GetID() == kSidebarViewId) {
    return CefSize(280, 520);
  }
  if (view && view->GetID() >= kContentViewIdBase) {
    return CefSize(640, 520);
  }
  return CefSize(920, 560);
}

cef_runtime_style_t CanopyWindow::GetWindowRuntimeStyle() {
  return CEF_RUNTIME_STYLE_ALLOY;
}

cef_runtime_style_t CanopyWindow::GetBrowserRuntimeStyle() {
  return CEF_RUNTIME_STYLE_ALLOY;
}

void CanopyWindow::OnBrowserReady(bool is_sidebar,
                                  int space_id,
                                  int tab_id) {
  CEF_REQUIRE_UI_THREAD();
  if (is_sidebar || (space_id == active_space_id_ &&
                     ActiveSpace() && ActiveSpace()->active_tab_id == tab_id)) {
    PushSidebarState();
  }
}

void CanopyWindow::OnBrowserClosed(bool is_sidebar,
                                   int space_id,
                                   int tab_id) {
  CEF_REQUIRE_UI_THREAD();
  if (is_sidebar) {
    sidebar_view_ = nullptr;
    sidebar_ready_ = false;
    return;
  }
  if (Space* space = FindSpace(space_id)) {
    if (Tab* tab = FindTab(*space, tab_id)) {
      tab->browser_view = nullptr;
    }
  }
}

void CanopyWindow::OnAddressChanged(int space_id,
                                    int tab_id,
                                    const CefString& url) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(space_id);
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !tab || space->retired || tab->retired) {
    return;
  }
  const std::string next_url = url.ToString();
  if (tab->url != next_url) {
    tab->url = next_url;
    tab->favicon_url.clear();
  }
  SaveWorkspace();
  if (space_id == active_space_id_ && space->active_tab_id == tab_id) {
    PushSidebarState();
  }
}

void CanopyWindow::OnTitleChanged(int space_id,
                                  int tab_id,
                                  const CefString& title) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(space_id);
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !tab || space->retired || tab->retired) {
    return;
  }
  tab->title = title.ToString();
  if (space_id == active_space_id_ && space->active_tab_id == tab_id) {
    UpdateWindowTitle();
    PushSidebarState();
  }
}

void CanopyWindow::OnFaviconChanged(
    int space_id,
    int tab_id,
    const std::vector<CefString>& icon_urls) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(space_id);
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !tab || space->retired || tab->retired) {
    return;
  }
  tab->favicon_url = icon_urls.empty() ? std::string()
                                       : icon_urls.front().ToString();
  if (space_id == active_space_id_) {
    PushSidebarState();
  }
}

void CanopyWindow::OnLoadingStateChanged(int space_id,
                                         int tab_id,
                                         bool is_loading,
                                         bool can_go_back,
                                         bool can_go_forward) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(space_id);
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !tab || space->retired || tab->retired) {
    return;
  }
  tab->loading = is_loading;
  tab->can_go_back = can_go_back;
  tab->can_go_forward = can_go_forward;
  if (!is_loading) {
    RecordHistory(*tab);
  }
  if (space_id == active_space_id_) {
    PushSidebarState();
  }
}

void CanopyWindow::OnDownloadUpdated(uint32_t id,
                                     const CefString& name,
                                     const CefString& path,
                                     int64_t received_bytes,
                                     int64_t total_bytes,
                                     int percent_complete,
                                     bool is_complete,
                                     bool is_canceled,
                                     bool is_in_progress) {
  CEF_REQUIRE_UI_THREAD();
  auto found = std::find_if(downloads_.begin(), downloads_.end(),
                            [id](const DownloadEntry& entry) {
                              return entry.id == id;
                            });
  if (found == downloads_.end()) {
    downloads_.push_back(DownloadEntry());
    found = std::prev(downloads_.end());
    found->id = id;
  }
  found->path = path.ToString();
  found->name = name.ToString();
  if (found->name.empty() && !found->path.empty()) {
    found->name = std::filesystem::path(found->path).filename().string();
  }
  found->received_bytes = received_bytes;
  found->total_bytes = total_bytes;
  found->percent_complete = percent_complete;
  found->is_complete = is_complete;
  found->is_canceled = is_canceled;
  found->is_in_progress = is_in_progress;
  if (downloads_.size() > kMaximumDownloads) {
    downloads_.erase(downloads_.begin());
  }
  PushSidebarState();
}

void CanopyWindow::HandleSidebarAction(const std::string& url) {
  CEF_REQUIRE_UI_THREAD();
  const std::string action = ActionName(url);
  if (action == "ready") {
    sidebar_ready_ = true;
    PushSidebarState();
  } else if (action == "navigate") {
    NavigateActive(DecodeQueryValue(url, "value"));
  } else if (action == "home") {
    NavigateActive(kHomeUrl);
  } else if (action == "jim") {
    CreateTab(kJimUrl);
  } else if (action == "back" || action == "forward" ||
             action == "reload" || action == "stop" ||
             action == "zoom-in" || action == "zoom-out" ||
             action == "zoom-reset" || action == "print") {
    ExecuteActiveCommand(action);
  } else if (action == "find") {
    FindInActiveTab(DecodeQueryValue(url, "value"),
                    DecodeQueryValue(url, "direction") != "backward",
                    DecodeQueryValue(url, "next") == "1");
  } else if (action == "stop-find") {
    StopFinding();
  } else if (action == "switch") {
    SwitchToSpace(DecodeInt(DecodeQueryValue(url, "id"), active_space_id_));
  } else if (action == "next") {
    SwitchRelative(1);
  } else if (action == "previous") {
    SwitchRelative(-1);
  } else if (action == "create") {
    CreateSpace(DecodeQueryValue(url, "name"));
  } else if (action == "rename") {
    RenameSpace(DecodeInt(DecodeQueryValue(url, "id"), active_space_id_),
                DecodeQueryValue(url, "name"));
  } else if (action == "appearance") {
    UpdateSpaceAppearance(
        DecodeInt(DecodeQueryValue(url, "id"), active_space_id_),
        DecodeQueryValue(url, "label"), DecodeQueryValue(url, "color"));
  } else if (action == "delete") {
    DeleteSpace(DecodeInt(DecodeQueryValue(url, "id"), active_space_id_));
  } else if (action == "new-tab") {
    CreateTab(DecodeQueryValue(url, "value"));
  } else if (action == "switch-tab") {
    SwitchToTab(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "close-tab") {
    CloseTab(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "pin-tab") {
    ToggleTabPinned(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "duplicate-tab") {
    DuplicateTab(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "reopen-tab") {
    ReopenClosedTab();
  } else if (action == "move-tab") {
    MoveTabToSpace(
        DecodeInt(DecodeQueryValue(url, "id"), 0),
        DecodeInt(DecodeQueryValue(url, "space"), active_space_id_));
  } else if (action == "reorder-tab") {
    ReorderTab(DecodeInt(DecodeQueryValue(url, "id"), 0),
               DecodeInt(DecodeQueryValue(url, "before"), 0));
  } else if (action == "reorder-space") {
    ReorderSpace(DecodeInt(DecodeQueryValue(url, "id"), 0),
                 DecodeInt(DecodeQueryValue(url, "before"), 0));
  } else if (action == "toggle-favorite") {
    ToggleFavorite(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "open-favorite") {
    OpenFavorite(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "remove-favorite") {
    RemoveFavorite(DecodeInt(DecodeQueryValue(url, "id"), 0));
  } else if (action == "open-history") {
    NavigateActive(DecodeQueryValue(url, "value"));
  } else if (action == "clear-history") {
    ClearHistory();
  } else if (action == "clear-browsing-data") {
    ClearBrowsingData();
  } else if (action == "check-updates") {
    CheckForUpdates();
  }
}

bool CanopyWindow::PopulateTabContextMenu(
    int tab_id,
    CefRefPtr<CefMenuModel> model) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = ActiveSpace();
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!model || !space || !tab || tab->retired) return false;

  const bool favorite =
      std::any_of(favorites_.begin(), favorites_.end(), [tab](const Favorite& entry) {
        return entry.url == tab->url;
      });
  model->AddItem(kMenuPinTab, tab->pinned ? "Unpin Tab" : "Pin Tab");
  model->AddItem(kMenuFavoriteTab,
                 favorite ? "Remove from Favorites" : "Add to Favorites");
  model->SetEnabled(kMenuFavoriteTab,
                    favorite || favorites_.size() < kMaximumFavorites);
  model->AddItem(kMenuDuplicateTab, "Duplicate Tab");

  CefRefPtr<CefMenuModel> move_menu =
      model->AddSubMenu(kMenuMoveTab, "Move to Space");
  bool has_move_target = false;
  int move_index = 0;
  for (const Space& target : spaces_) {
    if (target.retired || target.id == space->id) continue;
    move_menu->AddItem(kMenuMoveTabToSpaceBase + move_index, target.name);
    ++move_index;
    has_move_target = true;
  }
  model->SetEnabled(kMenuMoveTab, has_move_target);
  model->AddSeparator();
  model->AddItem(kMenuCloseTab, "Close Tab");
  return true;
}

bool CanopyWindow::PopulateSpaceContextMenu(
    int space_id,
    CefRefPtr<CefMenuModel> model) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(space_id);
  if (!model || !space || space->retired) return false;

  model->AddItem(kMenuRenameSpace, "Rename Space...");
  model->AddItem(kMenuLabelSpace, "Change Label...");
  CefRefPtr<CefMenuModel> theme_menu =
      model->AddSubMenu(kMenuSpaceTheme, "Theme");
  for (size_t index = 0; index < std::size(kSpaceColors); ++index) {
    const int command_id = kMenuSpaceThemeBase + static_cast<int>(index);
    theme_menu->AddCheckItem(command_id, kSpaceColorLabels[index]);
    theme_menu->SetChecked(command_id, space->color == kSpaceColors[index]);
  }
  model->AddSeparator();
  model->AddItem(kMenuDeleteSpace, "Delete Space");
  const size_t available_spaces =
      std::count_if(spaces_.begin(), spaces_.end(), [](const Space& entry) {
        return !entry.retired;
      });
  model->SetEnabled(kMenuDeleteSpace, available_spaces > 1);
  return true;
}

bool CanopyWindow::HandleTabContextMenuCommand(int tab_id, int command_id) {
  CEF_REQUIRE_UI_THREAD();
  if (command_id == kMenuPinTab) {
    ToggleTabPinned(tab_id);
  } else if (command_id == kMenuFavoriteTab) {
    ToggleFavorite(tab_id);
  } else if (command_id == kMenuDuplicateTab) {
    DuplicateTab(tab_id);
  } else if (command_id == kMenuCloseTab) {
    CloseTab(tab_id);
  } else if (command_id >= kMenuMoveTabToSpaceBase &&
             command_id < kMenuMoveTabToSpaceBase + kMaximumSpaces) {
    int requested_index = command_id - kMenuMoveTabToSpaceBase;
    Space* source = ActiveSpace();
    if (!source) return false;
    for (const Space& target : spaces_) {
      if (target.retired || target.id == source->id) continue;
      if (requested_index-- == 0) {
        MoveTabToSpace(tab_id, target.id);
        return true;
      }
    }
    return false;
  } else {
    return false;
  }
  return true;
}

bool CanopyWindow::HandleSpaceContextMenuCommand(int space_id,
                                                 int command_id) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(space_id);
  if (!space || space->retired) return false;
  if (command_id == kMenuRenameSpace) {
    ExecuteSidebarJavaScript("window.canopyPromptRenameSpace(" +
                             std::to_string(space_id) + ");");
  } else if (command_id == kMenuLabelSpace) {
    ExecuteSidebarJavaScript("window.canopyPromptSpaceLabel(" +
                             std::to_string(space_id) + ");");
  } else if (command_id == kMenuDeleteSpace) {
    ExecuteSidebarJavaScript("window.canopyConfirmDeleteSpace(" +
                             std::to_string(space_id) + ");");
  } else if (command_id >= kMenuSpaceThemeBase &&
             command_id < kMenuSpaceThemeBase +
                              static_cast<int>(std::size(kSpaceColors))) {
    const size_t index =
        static_cast<size_t>(command_id - kMenuSpaceThemeBase);
    UpdateSpaceAppearance(space_id, space->label, kSpaceColors[index]);
  } else {
    return false;
  }
  return true;
}

void CanopyWindow::ExecuteSidebarJavaScript(const std::string& script) {
  CEF_REQUIRE_UI_THREAD();
  if (!sidebar_view_ || !sidebar_view_->GetBrowser()) return;
  sidebar_view_->GetBrowser()->GetMainFrame()->ExecuteJavaScript(
      script, GetSidebarUrl(), 0);
}

bool CanopyWindow::HandleKeyboardShortcut(int key_code,
                                          bool shift,
                                          bool control,
                                          bool alt) {
  CEF_REQUIRE_UI_THREAD();
  if (control && key_code == 9) {
    SwitchRelativeTab(shift ? -1 : 1);
    return true;
  }

  const int key = std::toupper(static_cast<unsigned char>(key_code));
  if (alt && (key_code == 37 || key_code == 39)) {
    SwitchRelative(key_code == 37 ? -1 : 1);
  } else if (key == 'L') {
    FocusSidebarAddress();
  } else if (key == 'T') {
    if (shift) {
      ReopenClosedTab();
    } else {
      CreateTab(std::string());
      FocusSidebarAddress();
    }
  } else if (key == 'N') {
    CreateTab(std::string());
    FocusSidebarAddress();
  } else if (key == 'W') {
    CloseTab(ActiveSpace() ? ActiveSpace()->active_tab_id : 0);
  } else if (key == 'R') {
    ExecuteActiveCommand("reload");
  } else if (key == 'F') {
    OpenSidebarPanel("find");
  } else if (key == 'P') {
    ExecuteActiveCommand("print");
  } else if (key_code == 187) {
    ExecuteActiveCommand("zoom-in");
  } else if (key_code == 189) {
    ExecuteActiveCommand("zoom-out");
  } else if (key_code == 48) {
    ExecuteActiveCommand("zoom-reset");
  } else if (key_code == 219) {
    if (shift) {
      SwitchRelative(-1);
    } else {
      ExecuteActiveCommand("back");
    }
  } else if (key_code == 221) {
    if (shift) {
      SwitchRelative(1);
    } else {
      ExecuteActiveCommand("forward");
    }
  } else if (key >= '1' && key <= '9') {
    Space* space = ActiveSpace();
    if (space) {
      std::vector<int> ids;
      for (const Tab& tab : space->tabs) {
        if (!tab.retired) ids.push_back(tab.id);
      }
      const size_t index = static_cast<size_t>(key - '1');
      if (index < ids.size()) SwitchToTab(ids[index]);
    }
  } else if (key_code == 188) {
    OpenSidebarPanel("settings");
  } else if (key == 'Y') {
    OpenSidebarPanel("history");
  } else {
    return false;
  }
  return true;
}

void CanopyWindow::OpenUrlInNewTab(int source_space_id,
                                   const std::string& url,
                                   bool activate) {
  CEF_REQUIRE_UI_THREAD();
  Space* space = FindSpace(source_space_id);
  if (!space || space->retired) {
    space = ActiveSpace();
  }
  if (!space || url.empty()) {
    return;
  }
  AddTab(*space, url, activate, false);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::LoadWorkspace() {
  std::ifstream input(GetWorkspacePath());
  if (!input) {
    return;
  }

  std::string line;
  while (std::getline(input, line)) {
    std::istringstream row(line);
    std::string kind;
    std::getline(row, kind, '\t');
    if (kind == "active") {
      std::string id;
      std::getline(row, id);
      active_space_id_ = DecodeInt(id, active_space_id_);
      continue;
    }
    if (kind == "favorites") {
      favorites_initialized_ = true;
      continue;
    }
    if (kind == "favorite") {
      std::string id;
      std::string title;
      std::string favicon_url;
      std::string url;
      std::getline(row, id, '\t');
      std::getline(row, title, '\t');
      std::getline(row, favicon_url, '\t');
      std::getline(row, url);
      const int parsed_id = DecodeInt(id, 0);
      if (parsed_id <= 0 || url.empty() ||
          favorites_.size() >= kMaximumFavorites) {
        continue;
      }
      favorites_.push_back({parsed_id, SanitizeField(title),
                            SanitizeField(url), SanitizeField(favicon_url)});
      next_favorite_id_ = std::max(next_favorite_id_, parsed_id + 1);
      favorites_initialized_ = true;
      continue;
    }
    if (kind == "closed") {
      std::string space_id;
      std::string pinned;
      std::string title;
      std::string url;
      std::getline(row, space_id, '\t');
      std::getline(row, pinned, '\t');
      std::getline(row, title, '\t');
      std::getline(row, url);
      if (!url.empty() && closed_tabs_.size() < kMaximumClosedTabs) {
        closed_tabs_.push_back({DecodeInt(space_id, 0), SanitizeField(url),
                                SanitizeField(title), pinned == "1"});
      }
      continue;
    }
    if (kind == "space") {
      std::string id;
      std::string name;
      std::string label;
      std::string color;
      std::string active_or_legacy_url;
      std::getline(row, id, '\t');
      std::getline(row, name, '\t');
      std::getline(row, label, '\t');
      std::getline(row, color, '\t');
      std::getline(row, active_or_legacy_url);
      const int parsed_id = DecodeInt(id, 0);
      if (parsed_id <= 0 || name.empty() || FindSpace(parsed_id)) {
        continue;
      }
      Space space;
      space.id = parsed_id;
      space.name = SanitizeField(name);
      space.label = SanitizeLabel(label);
      space.color = SanitizeColor(color);
      space.active_tab_id = DecodeInt(active_or_legacy_url, 0);
      if (space.active_tab_id == 0 && !active_or_legacy_url.empty()) {
        Tab legacy;
        legacy.id = next_tab_id_++;
        legacy.url = SanitizeField(active_or_legacy_url);
        space.active_tab_id = legacy.id;
        space.tabs.push_back(legacy);
      }
      spaces_.push_back(space);
      next_space_id_ = std::max(next_space_id_, parsed_id + 1);
      continue;
    }
    if (kind == "tab") {
      std::string space_id;
      std::string tab_id;
      std::string pinned;
      std::string url;
      std::getline(row, space_id, '\t');
      std::getline(row, tab_id, '\t');
      std::getline(row, pinned, '\t');
      std::getline(row, url);
      Space* space = FindSpace(DecodeInt(space_id, 0));
      const int parsed_tab_id = DecodeInt(tab_id, 0);
      if (!space || parsed_tab_id <= 0 || url.empty() ||
          FindTab(*space, parsed_tab_id)) {
        continue;
      }
      Tab tab;
      tab.id = parsed_tab_id;
      tab.url = SanitizeField(url);
      tab.pinned = pinned == "1";
      space->tabs.push_back(tab);
      next_tab_id_ = std::max(next_tab_id_, parsed_tab_id + 1);
    }
  }

  if (spaces_.size() > kMaximumSpaces) {
    spaces_.resize(kMaximumSpaces);
  }
}

void CanopyWindow::SaveWorkspace() const {
  const std::string path = GetWorkspacePath();
  std::error_code error;
  std::filesystem::create_directories(
      std::filesystem::path(path).parent_path(), error);
  if (error) {
    return;
  }

  std::ofstream output(path, std::ios::trunc);
  if (!output) {
    return;
  }
  output << "version\t3\n";
  output << "active\t" << active_space_id_ << '\n';
  output << "favorites\t1\n";
  for (const Favorite& favorite : favorites_) {
    output << "favorite\t" << favorite.id << '\t'
           << SanitizeField(favorite.title) << '\t'
           << SanitizeField(favorite.favicon_url) << '\t'
           << SanitizeField(favorite.url) << '\n';
  }
  for (const ClosedTab& closed : closed_tabs_) {
    output << "closed\t" << closed.space_id << '\t'
           << (closed.pinned ? 1 : 0) << '\t'
           << SanitizeField(closed.title) << '\t'
           << SanitizeField(closed.url) << '\n';
  }
  for (const auto& space : spaces_) {
    if (space.retired) {
      continue;
    }
    output << "space\t" << space.id << '\t' << SanitizeField(space.name)
           << '\t' << SanitizeLabel(space.label) << '\t'
           << SanitizeColor(space.color) << '\t' << space.active_tab_id
           << '\n';
    for (const Tab& tab : space.tabs) {
      if (tab.retired) {
        continue;
      }
      output << "tab\t" << space.id << '\t' << tab.id << '\t'
             << (tab.pinned ? 1 : 0) << '\t' << SanitizeField(tab.url)
             << '\n';
    }
  }
}

void CanopyWindow::EnsureDefaultFavorites() {
  if (favorites_initialized_) return;
  favorites_initialized_ = true;
  favorites_.push_back({next_favorite_id_++, "St Andrew's",
                        kHomeUrl,
                        "https://mystandrews.saac.qld.edu.au/favicon.ico"});
  favorites_.push_back({next_favorite_id_++, "Google", kSearchUrl,
                        "https://www.google.com/favicon.ico"});
  SaveWorkspace();
}

void CanopyWindow::LoadHistory() {
  std::ifstream input(GetHistoryPath());
  if (!input) {
    return;
  }
  std::string line;
  while (std::getline(input, line) && history_.size() < kMaximumHistoryEntries) {
    std::istringstream row(line);
    std::string visited;
    std::string title;
    std::string url;
    std::getline(row, visited, '\t');
    std::getline(row, title, '\t');
    std::getline(row, url);
    if (url.empty()) {
      continue;
    }
    history_.push_back(
        {DecodeInt64(visited, 0), SanitizeField(url), SanitizeField(title)});
  }
}

void CanopyWindow::SaveHistory() const {
  const std::string path = GetHistoryPath();
  std::error_code error;
  std::filesystem::create_directories(
      std::filesystem::path(path).parent_path(), error);
  if (error) {
    return;
  }
  std::ofstream output(path, std::ios::trunc);
  if (!output) {
    return;
  }
  for (const HistoryEntry& entry : history_) {
    output << entry.visited_at << '\t' << SanitizeField(entry.title) << '\t'
           << SanitizeField(entry.url) << '\n';
  }
}

void CanopyWindow::EnsureDefaultSpaces() {
  if (spaces_.empty()) {
    Space school;
    school.id = next_space_id_++;
    school.name = "School";
    school.label = "\u25a4";
    school.color = "mint";
    spaces_.push_back(school);

    Space research;
    research.id = next_space_id_++;
    research.name = "Research";
    research.label = "\u2315";
    research.color = "violet";
    spaces_.push_back(research);

    Space personal;
    personal.id = next_space_id_++;
    personal.name = "Personal";
    personal.label = "\u25cf";
    personal.color = "blue";
    spaces_.push_back(personal);
  }

  for (size_t index = 0; index < spaces_.size(); ++index) {
    Space& space = spaces_[index];
    if (space.color.empty()) {
      space.color = "mint";
    }
    const std::string fallback = index == 0 ? kHomeUrl : kSearchUrl;
    EnsureSpaceHasTab(space, fallback);
  }
  if (!FindSpace(active_space_id_)) {
    active_space_id_ = spaces_.front().id;
  }
  SaveWorkspace();
}

void CanopyWindow::EnsureSpaceHasTab(Space& space,
                                     const std::string& fallback_url) {
  Tab* active = FindTab(space, space.active_tab_id);
  if (active && !active->retired) {
    return;
  }
  for (Tab& tab : space.tabs) {
    if (!tab.retired) {
      space.active_tab_id = tab.id;
      return;
    }
  }
  Tab tab;
  tab.id = next_tab_id_++;
  tab.url = fallback_url.empty() ? kSearchUrl : fallback_url;
  space.active_tab_id = tab.id;
  space.tabs.push_back(tab);
}

void CanopyWindow::CreateSidebarView() {
  CefBrowserSettings settings;
  settings.javascript = STATE_ENABLED;
  sidebar_view_ = CefBrowserView::CreateBrowserView(
      new BrowserClient(this, BrowserClient::Role::kSidebar, 0, 0),
      GetSidebarUrl(), settings, nullptr, nullptr, this);
  sidebar_view_->SetID(kSidebarViewId);
}

void CanopyWindow::CreateTabView(Space& space, Tab& tab, bool visible) {
  CefBrowserSettings settings;
  tab.browser_view = CefBrowserView::CreateBrowserView(
      new BrowserClient(this, BrowserClient::Role::kContent, space.id, tab.id),
      tab.url.empty() ? kSearchUrl : tab.url, settings, nullptr, nullptr, this);
  tab.browser_view->SetID(kContentViewIdBase + tab.id);
  tab.browser_view->SetVisible(visible);
}

void CanopyWindow::EnsureTabView(Space& space, Tab& tab, bool visible) {
  if (space.retired || tab.retired || !window_) {
    return;
  }
  if (!tab.browser_view) {
    CreateTabView(space, tab, visible);
    window_->AddChildView(tab.browser_view);
    window_->GetLayout()->AsBoxLayout()->SetFlexForView(tab.browser_view, 1);
    return;
  }
  tab.browser_view->SetVisible(visible);
}

int CanopyWindow::AddTab(Space& space,
                         const std::string& url,
                         bool activate,
                         bool pinned) {
  if (space.retired || AvailableTabCount(space) >= kMaximumTabsPerSpace) {
    return 0;
  }
  const std::string target_url = url.empty() ? kSearchUrl : url;
  auto reusable = std::find_if(space.tabs.begin(), space.tabs.end(),
                               [](const Tab& tab) { return tab.retired; });
  if (reusable == space.tabs.end()) {
    Tab tab;
    tab.id = next_tab_id_++;
    space.tabs.push_back(tab);
    reusable = std::prev(space.tabs.end());
  }
  Tab& tab = *reusable;
  tab.retired = false;
  tab.url = target_url;
  tab.title.clear();
  tab.favicon_url.clear();
  tab.pinned = pinned;
  tab.loading = false;
  tab.can_go_back = false;
  tab.can_go_forward = false;

  if (tab.browser_view && tab.browser_view->GetBrowser()) {
    tab.browser_view->GetBrowser()->GetMainFrame()->LoadURL(target_url);
  }

  if (activate) {
    if (space.id == active_space_id_) {
      if (Tab* current = FindTab(space, space.active_tab_id)) {
        if (current->id != tab.id && current->browser_view) {
          current->browser_view->SetVisible(false);
        }
      }
    }
    space.active_tab_id = tab.id;
    if (space.id == active_space_id_) {
      EnsureTabView(space, tab, true);
      if (window_) window_->Layout();
      if (tab.browser_view) tab.browser_view->RequestFocus();
    }
  }
  return tab.id;
}

void CanopyWindow::SwitchToSpace(int space_id) {
  CEF_REQUIRE_UI_THREAD();
  Space* target = FindSpace(space_id);
  if (!target || target->retired || space_id == active_space_id_) {
    return;
  }

  if (Tab* current = ActiveTab()) {
    if (current->browser_view) {
      current->browser_view->SetVisible(false);
    }
  }
  active_space_id_ = space_id;
  EnsureSpaceHasTab(*target, kSearchUrl);
  Tab* target_tab = FindTab(*target, target->active_tab_id);
  if (target_tab) EnsureTabView(*target, *target_tab, true);
  if (window_) {
    window_->Layout();
  }
  if (target_tab && target_tab->browser_view) {
    target_tab->browser_view->RequestFocus();
  }
  SaveWorkspace();
  UpdateWindowTitle();
  PushSidebarState();
}

void CanopyWindow::SwitchRelative(int direction) {
  std::vector<int> available_space_ids;
  for (const auto& space : spaces_) {
    if (!space.retired) {
      available_space_ids.push_back(space.id);
    }
  }
  if (available_space_ids.size() < 2) {
    return;
  }
  const auto current =
      std::find(available_space_ids.begin(), available_space_ids.end(),
                active_space_id_);
  if (current == available_space_ids.end()) {
    SwitchToSpace(available_space_ids.front());
    return;
  }
  const int index =
      static_cast<int>(std::distance(available_space_ids.begin(), current));
  const int count = static_cast<int>(available_space_ids.size());
  const int next = (index + direction + count) % count;
  SwitchToSpace(available_space_ids[next]);
}

void CanopyWindow::SwitchToTab(int tab_id) {
  Space* space = ActiveSpace();
  Tab* target = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !target || target->retired) {
    return;
  }
  if (space->active_tab_id == tab_id) {
    EnsureTabView(*space, *target, true);
    if (window_) window_->Layout();
    if (target->browser_view) target->browser_view->RequestFocus();
    return;
  }
  if (Tab* current = ActiveTab()) {
    if (current->browser_view) current->browser_view->SetVisible(false);
  }
  space->active_tab_id = tab_id;
  EnsureTabView(*space, *target, true);
  if (window_) window_->Layout();
  if (target->browser_view) target->browser_view->RequestFocus();
  SaveWorkspace();
  UpdateWindowTitle();
  PushSidebarState();
}

void CanopyWindow::SwitchRelativeTab(int direction) {
  Space* space = ActiveSpace();
  if (!space) return;
  std::vector<int> ids;
  for (const Tab& tab : space->tabs) {
    if (!tab.retired) ids.push_back(tab.id);
  }
  if (ids.size() < 2) return;
  const auto current = std::find(ids.begin(), ids.end(), space->active_tab_id);
  const int index = current == ids.end()
                        ? 0
                        : static_cast<int>(std::distance(ids.begin(), current));
  const int count = static_cast<int>(ids.size());
  SwitchToTab(ids[(index + direction + count) % count]);
}

void CanopyWindow::CreateTab(const std::string& url, bool pinned) {
  Space* space = ActiveSpace();
  if (!space) return;
  const std::string target = url.empty() ? kSearchUrl : NormalizeAddress(url);
  if (AddTab(*space, target, true, pinned) == 0) return;
  SaveWorkspace();
  UpdateWindowTitle();
  PushSidebarState();
}

void CanopyWindow::CloseTab(int tab_id) {
  Space* space = ActiveSpace();
  Tab* target = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !target || target->retired) return;

  if (!target->url.empty() && target->url != "about:blank") {
    closed_tabs_.push_front(
        {space->id, target->url, target->title, target->pinned});
    if (closed_tabs_.size() > kMaximumClosedTabs) closed_tabs_.pop_back();
  }

  if (AvailableTabCount(*space) <= 1) {
    target->url = kSearchUrl;
    target->title.clear();
    target->favicon_url.clear();
    target->pinned = false;
    if (target->browser_view && target->browser_view->GetBrowser()) {
      target->browser_view->GetBrowser()->GetMainFrame()->LoadURL(kSearchUrl);
    }
    FocusSidebarAddress();
    SaveWorkspace();
    PushSidebarState();
    return;
  }

  int replacement = 0;
  bool passed_target = false;
  for (const Tab& tab : space->tabs) {
    if (tab.id == target->id) {
      passed_target = true;
      continue;
    }
    if (tab.retired) continue;
    if (replacement == 0 || passed_target) {
      replacement = tab.id;
      if (passed_target) break;
    }
  }
  const bool was_active = space->active_tab_id == target->id;
  target->retired = true;
  target->loading = false;
  if (target->browser_view) {
    target->browser_view->SetVisible(false);
    if (target->browser_view->GetBrowser()) {
      target->browser_view->GetBrowser()->GetMainFrame()->LoadURL("about:blank");
    }
  }
  if (was_active) {
    space->active_tab_id = replacement;
    if (Tab* next = FindTab(*space, replacement)) {
      EnsureTabView(*space, *next, true);
      if (next->browser_view) next->browser_view->RequestFocus();
    }
    if (window_) window_->Layout();
  }
  SaveWorkspace();
  UpdateWindowTitle();
  PushSidebarState();
}

void CanopyWindow::ToggleTabPinned(int tab_id) {
  Space* space = ActiveSpace();
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!tab || tab->retired) return;
  tab->pinned = !tab->pinned;
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::DuplicateTab(int tab_id) {
  Space* space = ActiveSpace();
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!space || !tab || tab->retired) return;
  AddTab(*space, tab->url, true, false);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::ReopenClosedTab() {
  if (closed_tabs_.empty()) return;
  const ClosedTab closed = closed_tabs_.front();
  closed_tabs_.pop_front();
  Space* target = FindSpace(closed.space_id);
  if (!target || target->retired) target = ActiveSpace();
  if (!target) return;
  if (target->id != active_space_id_) SwitchToSpace(target->id);
  AddTab(*target, closed.url, true, closed.pinned);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::MoveTabToSpace(int tab_id, int target_space_id) {
  Space* source = ActiveSpace();
  Space* target_space = FindSpace(target_space_id);
  Tab* tab = source ? FindTab(*source, tab_id) : nullptr;
  if (!source || !target_space || !tab || tab->retired ||
      target_space->retired || source->id == target_space->id) {
    return;
  }
  const std::string url = tab->url;
  const bool pinned = tab->pinned;
  CloseTab(tab_id);
  if (!closed_tabs_.empty() && closed_tabs_.front().space_id == source->id &&
      closed_tabs_.front().url == url) {
    closed_tabs_.pop_front();
  }
  AddTab(*target_space, url, true, pinned);
  SwitchToSpace(target_space->id);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::ReorderTab(int tab_id, int before_tab_id) {
  Space* space = ActiveSpace();
  if (!space || tab_id == before_tab_id) return;
  const auto source = std::find_if(
      space->tabs.begin(), space->tabs.end(),
      [tab_id](const Tab& tab) { return !tab.retired && tab.id == tab_id; });
  if (source == space->tabs.end()) return;
  Tab moved = std::move(*source);
  space->tabs.erase(source);
  const auto target = before_tab_id == 0
                          ? space->tabs.end()
                          : std::find_if(
                                space->tabs.begin(), space->tabs.end(),
                                [before_tab_id](const Tab& tab) {
                                  return !tab.retired &&
                                         tab.id == before_tab_id;
                                });
  space->tabs.insert(target, std::move(moved));
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::ToggleFavorite(int tab_id) {
  Space* space = ActiveSpace();
  Tab* tab = space ? FindTab(*space, tab_id) : nullptr;
  if (!tab || tab->retired || tab->url.empty() ||
      tab->url == "about:blank") {
    return;
  }
  const auto existing =
      std::find_if(favorites_.begin(), favorites_.end(),
                   [tab](const Favorite& favorite) {
                     return favorite.url == tab->url;
                   });
  if (existing != favorites_.end()) {
    favorites_.erase(existing);
  } else if (favorites_.size() < kMaximumFavorites) {
    favorites_.push_back(
        {next_favorite_id_++,
         tab->title.empty() ? tab->url : tab->title, tab->url,
         tab->favicon_url});
  }
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::OpenFavorite(int favorite_id) {
  const auto found =
      std::find_if(favorites_.begin(), favorites_.end(),
                   [favorite_id](const Favorite& favorite) {
                     return favorite.id == favorite_id;
                   });
  Space* space = ActiveSpace();
  if (found == favorites_.end() || !space) return;
  const auto existing =
      std::find_if(space->tabs.begin(), space->tabs.end(),
                   [&found](const Tab& tab) {
                     return !tab.retired && tab.url == found->url;
                   });
  if (existing != space->tabs.end()) {
    SwitchToTab(existing->id);
  } else {
    CreateTab(found->url);
  }
}

void CanopyWindow::RemoveFavorite(int favorite_id) {
  const auto found =
      std::find_if(favorites_.begin(), favorites_.end(),
                   [favorite_id](const Favorite& favorite) {
                     return favorite.id == favorite_id;
                   });
  if (found == favorites_.end()) return;
  favorites_.erase(found);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::CreateSpace(const std::string& requested_name) {
  if (!window_) return;
  const size_t available_space_count =
      std::count_if(spaces_.begin(), spaces_.end(), [](const Space& space) {
        return !space.retired;
      });
  if (available_space_count >= kMaximumSpaces) return;

  Space* target = nullptr;
  const auto reusable = std::find_if(
      spaces_.begin(), spaces_.end(),
      [](const Space& space) { return space.retired; });
  if (reusable != spaces_.end()) {
    target = &*reusable;
    target->retired = false;
  } else {
    Space space;
    space.id = next_space_id_++;
    spaces_.push_back(space);
    target = &spaces_.back();
  }

  target->name = SanitizeField(requested_name);
  if (target->name.empty()) {
    target->name = "Space " + std::to_string(available_space_count + 1);
  }
  target->label.clear();
  target->color = "mint";
  target->active_tab_id = 0;
  AddTab(*target, kSearchUrl, true, false);
  SwitchToSpace(target->id);
}

void CanopyWindow::RenameSpace(int space_id,
                               const std::string& requested_name) {
  Space* space = FindSpace(space_id);
  const std::string name = SanitizeField(requested_name);
  if (!space || space->retired || name.empty()) return;
  space->name = name.substr(0, 42);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::UpdateSpaceAppearance(
    int space_id,
    const std::string& requested_label,
    const std::string& requested_color) {
  Space* space = FindSpace(space_id);
  if (!space || space->retired) return;
  space->label = SanitizeLabel(requested_label);
  space->color = SanitizeColor(requested_color);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::DeleteSpace(int space_id) {
  const size_t available_space_count =
      std::count_if(spaces_.begin(), spaces_.end(), [](const Space& space) {
        return !space.retired;
      });
  if (!window_ || available_space_count <= 1) return;
  auto found = std::find_if(spaces_.begin(), spaces_.end(),
                            [space_id](const Space& space) {
                              return space.id == space_id;
                            });
  if (found == spaces_.end() || found->retired) return;

  if (found->id == active_space_id_) {
    const size_t found_index =
        static_cast<size_t>(std::distance(spaces_.begin(), found));
    for (size_t offset = 1; offset < spaces_.size(); ++offset) {
      const Space& candidate = spaces_[(found_index + offset) % spaces_.size()];
      if (!candidate.retired && candidate.id != space_id) {
        SwitchToSpace(candidate.id);
        break;
      }
    }
  }

  Space* target = FindSpace(space_id);
  if (!target || target->id == active_space_id_) return;
  target->retired = true;
  target->name.clear();
  target->label.clear();
  target->color = "mint";
  target->active_tab_id = 0;
  for (Tab& tab : target->tabs) {
    tab.retired = true;
    tab.loading = false;
    if (tab.browser_view) {
      tab.browser_view->SetVisible(false);
      if (tab.browser_view->GetBrowser()) {
        tab.browser_view->GetBrowser()->GetMainFrame()->LoadURL("about:blank");
      }
    }
  }
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::ReorderSpace(int space_id, int before_space_id) {
  if (space_id == before_space_id) return;
  const auto source = std::find_if(
      spaces_.begin(), spaces_.end(), [space_id](const Space& space) {
        return !space.retired && space.id == space_id;
      });
  if (source == spaces_.end()) return;
  Space moved = std::move(*source);
  spaces_.erase(source);
  const auto target = before_space_id == 0
                          ? spaces_.end()
                          : std::find_if(
                                spaces_.begin(), spaces_.end(),
                                [before_space_id](const Space& space) {
                                  return !space.retired &&
                                         space.id == before_space_id;
                                });
  spaces_.insert(target, std::move(moved));
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::NavigateActive(const std::string& input) {
  Tab* tab = ActiveTab();
  if (!tab || !tab->browser_view || !tab->browser_view->GetBrowser()) return;
  const std::string target = NormalizeAddress(input);
  if (target.empty()) return;
  tab->browser_view->GetBrowser()->GetMainFrame()->LoadURL(target);
  tab->browser_view->RequestFocus();
}

void CanopyWindow::ExecuteActiveCommand(const std::string& command) {
  Tab* tab = ActiveTab();
  if (!tab || !tab->browser_view || !tab->browser_view->GetBrowser()) return;
  CefRefPtr<CefBrowser> browser = tab->browser_view->GetBrowser();
  if (command == "back" && browser->CanGoBack()) {
    browser->GoBack();
  } else if (command == "forward" && browser->CanGoForward()) {
    browser->GoForward();
  } else if (command == "reload") {
    browser->Reload();
  } else if (command == "stop") {
    browser->StopLoad();
  } else if (command == "zoom-in") {
    browser->GetHost()->SetZoomLevel(
        std::min(5.0, browser->GetHost()->GetZoomLevel() + 0.5));
    PushSidebarState();
  } else if (command == "zoom-out") {
    browser->GetHost()->SetZoomLevel(
        std::max(-5.0, browser->GetHost()->GetZoomLevel() - 0.5));
    PushSidebarState();
  } else if (command == "zoom-reset") {
    browser->GetHost()->SetZoomLevel(0.0);
    PushSidebarState();
  } else if (command == "print") {
    browser->GetHost()->Print();
  }
}

void CanopyWindow::FindInActiveTab(const std::string& query,
                                   bool forward,
                                   bool find_next) {
  Tab* tab = ActiveTab();
  if (!tab || !tab->browser_view || !tab->browser_view->GetBrowser()) return;
  tab->browser_view->GetBrowser()->GetHost()->Find(
      SanitizeField(query), forward, false, find_next);
}

void CanopyWindow::StopFinding() {
  Tab* tab = ActiveTab();
  if (!tab || !tab->browser_view || !tab->browser_view->GetBrowser()) return;
  tab->browser_view->GetBrowser()->GetHost()->StopFinding(true);
}

void CanopyWindow::FocusSidebarAddress() {
  if (!sidebar_ready_ || !sidebar_view_ || !sidebar_view_->GetBrowser()) return;
  sidebar_view_->GetBrowser()->GetMainFrame()->ExecuteJavaScript(
      "window.canopyFocusAddress && window.canopyFocusAddress();",
      GetSidebarUrl(), 0);
  sidebar_view_->RequestFocus();
}

void CanopyWindow::OpenSidebarPanel(const std::string& panel) {
  if (!sidebar_ready_ || !sidebar_view_ || !sidebar_view_->GetBrowser()) return;
  const std::string function =
      panel == "settings" ? "window.canopyOpenSettings"
      : panel == "find"   ? "window.canopyOpenFind"
                          : "window.canopyOpenLibrary";
  const std::string argument = panel == "history" ? "'history'" : "";
  sidebar_view_->GetBrowser()->GetMainFrame()->ExecuteJavaScript(
      function + " && " + function + "(" + argument + ");",
      GetSidebarUrl(), 0);
  sidebar_view_->RequestFocus();
}

void CanopyWindow::RecordHistory(const Tab& tab) {
  if (!IsHistoryUrl(tab.url)) return;
  const int64_t now = static_cast<int64_t>(std::time(nullptr));
  if (!history_.empty() && history_.front().url == tab.url) {
    history_.front().visited_at = now;
    if (!tab.title.empty()) history_.front().title = tab.title;
  } else {
    history_.push_front(
        {now, tab.url, tab.title.empty() ? tab.url : tab.title});
    if (history_.size() > kMaximumHistoryEntries) history_.pop_back();
  }
  SaveHistory();
}

void CanopyWindow::ClearHistory() {
  history_.clear();
  SaveHistory();
  PushSidebarState();
}

void CanopyWindow::ClearBrowsingData() {
  ClearHistory();
  Tab* tab = ActiveTab();
  if (!tab || !tab->browser_view || !tab->browser_view->GetBrowser()) return;
  CefRefPtr<CefRequestContext> context =
      tab->browser_view->GetBrowser()->GetHost()->GetRequestContext();
  if (!context) return;
  CefRefPtr<CefCookieManager> cookies = context->GetCookieManager(nullptr);
  if (cookies) cookies->DeleteCookies(CefString(), CefString(), nullptr);
  context->ClearHttpCache(nullptr);
}

void CanopyWindow::PushSidebarState() {
  if (!sidebar_ready_ || !sidebar_view_ || !sidebar_view_->GetBrowser()) return;
  const std::string script = "window.canopySetState(" + BuildStateJson() + ");";
  sidebar_view_->GetBrowser()->GetMainFrame()->ExecuteJavaScript(
      script, GetSidebarUrl(), 0);
}

void CanopyWindow::UpdateWindowTitle() {
  if (!window_) return;
  const Tab* tab = ActiveTab();
  const std::string title = tab && !tab->title.empty() ? tab->title : "Canopy";
  window_->SetTitle(title == "Canopy" ? title : title + " - Canopy");
}

CanopyWindow::Space* CanopyWindow::FindSpace(int space_id) {
  const auto found = std::find_if(spaces_.begin(), spaces_.end(),
                                  [space_id](const Space& space) {
                                    return space.id == space_id;
                                  });
  return found == spaces_.end() ? nullptr : &*found;
}

const CanopyWindow::Space* CanopyWindow::FindSpace(int space_id) const {
  const auto found = std::find_if(spaces_.begin(), spaces_.end(),
                                  [space_id](const Space& space) {
                                    return space.id == space_id;
                                  });
  return found == spaces_.end() ? nullptr : &*found;
}

CanopyWindow::Tab* CanopyWindow::FindTab(Space& space, int tab_id) {
  const auto found = std::find_if(space.tabs.begin(), space.tabs.end(),
                                  [tab_id](const Tab& tab) {
                                    return tab.id == tab_id;
                                  });
  return found == space.tabs.end() ? nullptr : &*found;
}

const CanopyWindow::Tab* CanopyWindow::FindTab(const Space& space,
                                                int tab_id) const {
  const auto found = std::find_if(space.tabs.begin(), space.tabs.end(),
                                  [tab_id](const Tab& tab) {
                                    return tab.id == tab_id;
                                  });
  return found == space.tabs.end() ? nullptr : &*found;
}

CanopyWindow::Space* CanopyWindow::ActiveSpace() {
  return FindSpace(active_space_id_);
}

const CanopyWindow::Space* CanopyWindow::ActiveSpace() const {
  return FindSpace(active_space_id_);
}

CanopyWindow::Tab* CanopyWindow::ActiveTab() {
  Space* space = ActiveSpace();
  return space ? FindTab(*space, space->active_tab_id) : nullptr;
}

const CanopyWindow::Tab* CanopyWindow::ActiveTab() const {
  const Space* space = ActiveSpace();
  return space ? FindTab(*space, space->active_tab_id) : nullptr;
}

std::string CanopyWindow::GetSidebarUrl() const {
  CefString executable_directory;
  if (!CefGetPath(PK_DIR_EXE, executable_directory)) return "about:blank";
  const std::filesystem::path sidebar_path =
      (std::filesystem::path(executable_directory.ToString()) / ".." /
       "Resources" / "canopy" / "sidebar.html")
          .lexically_normal();
  std::string url = "file://" + sidebar_path.string();
  size_t position = 0;
  while ((position = url.find(' ', position)) != std::string::npos) {
    url.replace(position, 1, "%20");
    position += 3;
  }
  return url;
}

std::string CanopyWindow::GetWorkspacePath() const {
  const char* home = std::getenv("HOME");
  const std::string base = home && home[0] ? home : "/tmp";
  return base +
         "/Library/Application Support/Canopy Native/workspace.tsv";
}

std::string CanopyWindow::GetHistoryPath() const {
  const char* home = std::getenv("HOME");
  const std::string base = home && home[0] ? home : "/tmp";
  return base + "/Library/Application Support/Canopy Native/history.tsv";
}

std::string CanopyWindow::BuildStateJson() const {
  CefRefPtr<CefDictionaryValue> root = CefDictionaryValue::Create();
  root->SetInt("activeSpaceId", active_space_id_);
  root->SetInt("maximumSpaces", kMaximumSpaces);
  root->SetInt("maximumTabs", kMaximumTabsPerSpace);
  root->SetInt("closedTabCount", static_cast<int>(closed_tabs_.size()));
  root->SetString("appVersion", CANOPY_VERSION);
  root->SetString("appBuild", CANOPY_BUILD_NUMBER);

  CefRefPtr<CefListValue> favorites = CefListValue::Create();
  size_t favorite_index = 0;
  for (const Favorite& favorite : favorites_) {
    CefRefPtr<CefDictionaryValue> item = CefDictionaryValue::Create();
    item->SetInt("id", favorite.id);
    item->SetString("title", favorite.title);
    item->SetString("url", favorite.url);
    item->SetString("faviconUrl", favorite.favicon_url);
    favorites->SetDictionary(favorite_index++, item);
  }
  root->SetList("favorites", favorites);

  CefRefPtr<CefListValue> spaces = CefListValue::Create();
  size_t space_index = 0;
  for (const Space& space : spaces_) {
    if (space.retired) continue;
    CefRefPtr<CefDictionaryValue> item = CefDictionaryValue::Create();
    item->SetInt("id", space.id);
    item->SetString("name", space.name);
    item->SetString("label", space.label);
    item->SetString("color", SanitizeColor(space.color));
    item->SetInt("activeTabId", space.active_tab_id);
    item->SetInt("tabCount", static_cast<int>(AvailableTabCount(space)));
    spaces->SetDictionary(space_index++, item);
  }
  root->SetList("spaces", spaces);

  CefRefPtr<CefListValue> tabs = CefListValue::Create();
  size_t tab_index = 0;
  const Space* active_space = ActiveSpace();
  if (active_space) {
    for (const Tab& tab : active_space->tabs) {
      if (tab.retired) continue;
      CefRefPtr<CefDictionaryValue> item = CefDictionaryValue::Create();
      item->SetInt("id", tab.id);
      item->SetString("title", tab.title.empty() ? tab.url : tab.title);
      item->SetString("url", tab.url);
      item->SetString("faviconUrl", tab.favicon_url);
      item->SetBool("pinned", tab.pinned);
      item->SetBool("active", tab.id == active_space->active_tab_id);
      item->SetBool("loading", tab.loading);
      tabs->SetDictionary(tab_index++, item);
    }
  }
  root->SetList("tabs", tabs);

  const Tab* active_tab = ActiveTab();
  if (active_tab) {
    root->SetString("title", active_tab->title.empty() ? active_tab->url
                                                       : active_tab->title);
    root->SetString("url", active_tab->url);
    root->SetString("faviconUrl", active_tab->favicon_url);
    root->SetBool("loading", active_tab->loading);
    root->SetBool("canGoBack", active_tab->can_go_back);
    root->SetBool("canGoForward", active_tab->can_go_forward);
    if (active_tab->browser_view && active_tab->browser_view->GetBrowser()) {
      const double zoom_level =
          active_tab->browser_view->GetBrowser()->GetHost()->GetZoomLevel();
      root->SetInt("zoomPercent",
                   static_cast<int>(std::round(100.0 *
                                               std::pow(1.2, zoom_level))));
    }
  }

  CefRefPtr<CefListValue> history = CefListValue::Create();
  size_t history_index = 0;
  for (const HistoryEntry& entry : history_) {
    if (history_index >= 80) break;
    CefRefPtr<CefDictionaryValue> item = CefDictionaryValue::Create();
    item->SetDouble("visitedAt", static_cast<double>(entry.visited_at));
    item->SetString("title", entry.title);
    item->SetString("url", entry.url);
    history->SetDictionary(history_index++, item);
  }
  root->SetList("history", history);

  CefRefPtr<CefListValue> downloads = CefListValue::Create();
  size_t download_index = 0;
  for (auto iterator = downloads_.rbegin(); iterator != downloads_.rend();
       ++iterator) {
    CefRefPtr<CefDictionaryValue> item = CefDictionaryValue::Create();
    item->SetInt("id", static_cast<int>(iterator->id));
    item->SetString("name", iterator->name);
    item->SetString("path", iterator->path);
    item->SetDouble("receivedBytes",
                    static_cast<double>(iterator->received_bytes));
    item->SetDouble("totalBytes",
                    static_cast<double>(iterator->total_bytes));
    item->SetInt("percentComplete", iterator->percent_complete);
    item->SetBool("complete", iterator->is_complete);
    item->SetBool("canceled", iterator->is_canceled);
    item->SetBool("inProgress", iterator->is_in_progress);
    downloads->SetDictionary(download_index++, item);
  }
  root->SetList("downloads", downloads);

  CefRefPtr<CefValue> value = CefValue::Create();
  value->SetDictionary(root);
  return CefWriteJSON(value, JSON_WRITER_DEFAULT).ToString();
}

std::string CanopyWindow::NormalizeAddress(const std::string& input) const {
  const std::string value = Trim(input);
  if (value.empty()) return std::string();
  if (value.rfind("https://", 0) == 0 || value.rfind("http://", 0) == 0 ||
      value.rfind("file://", 0) == 0 || value.rfind("about:", 0) == 0) {
    return value;
  }
  if (value.find(' ') == std::string::npos &&
      (value.find('.') != std::string::npos ||
       value.rfind("localhost", 0) == 0)) {
    return "https://" + value;
  }
  return "https://www.google.com/search?q=" +
         CefURIEncode(value, false).ToString();
}

}  // namespace canopy
