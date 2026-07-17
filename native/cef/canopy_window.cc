// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/canopy_window.h"

#include "examples/canopy/browser_client.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "include/cef_parser.h"
#include "include/cef_path_util.h"
#include "include/cef_values.h"
#include "include/views/cef_box_layout.h"
#include "include/wrapper/cef_helpers.h"

namespace canopy {

namespace {

constexpr int kSidebarViewId = 10;
constexpr int kContentViewIdBase = 1000;
constexpr int kMaximumSpaces = 12;
constexpr char kHomeUrl[] = "https://mystandrews.saac.qld.edu.au/";
constexpr char kSearchUrl[] = "https://www.google.com/";
constexpr char kJimUrl[] =
    "https://jimsmowingandlawncare.up.railway.app/";
constexpr char kActionPrefix[] = "https://canopy.internal/";

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
      const std::string encoded =
          url.substr(value_start, value_end - value_start);
      return CefURIDecode(encoded, true, UU_SPACES).ToString();
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

std::string ActionName(const std::string& url) {
  const size_t start = url.find(kActionPrefix);
  if (start != 0) {
    return std::string();
  }
  const size_t path_start = sizeof(kActionPrefix) - 1;
  const size_t query_start = url.find('?', path_start);
  return url.substr(path_start, query_start - path_start);
}

}  // namespace

CanopyWindow::CanopyWindow() {
  LoadWorkspace();
  EnsureDefaultSpaces();
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

  for (auto& space : spaces_) {
    CreateSpaceView(space, space.id == active_space_id_);
    window_->AddChildView(space.browser_view);
    layout->SetFlexForView(space.browser_view, 1);
  }

  window_->Show();
  if (Space* active = ActiveSpace()) {
    active->browser_view->RequestFocus();
  }
}

void CanopyWindow::OnWindowDestroyed(CefRefPtr<CefWindow> window) {
  CEF_REQUIRE_UI_THREAD();
  SaveWorkspace();
  sidebar_ready_ = false;
  sidebar_view_ = nullptr;
  for (auto& space : spaces_) {
    space.browser_view = nullptr;
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
    if (space.browser_view && space.browser_view->GetBrowser()) {
      can_close =
          space.browser_view->GetBrowser()->GetHost()->TryCloseBrowser() &&
          can_close;
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

void CanopyWindow::OnBrowserReady(bool is_sidebar, int space_id) {
  CEF_REQUIRE_UI_THREAD();
  if (!is_sidebar && space_id == active_space_id_) {
    PushSidebarState();
  }
}

void CanopyWindow::OnBrowserClosed(bool is_sidebar, int space_id) {
  CEF_REQUIRE_UI_THREAD();
  if (is_sidebar) {
    sidebar_view_ = nullptr;
    sidebar_ready_ = false;
    return;
  }
  if (Space* space = FindSpace(space_id)) {
    space->browser_view = nullptr;
  }
}

void CanopyWindow::OnAddressChanged(int space_id, const CefString& url) {
  CEF_REQUIRE_UI_THREAD();
  if (Space* space = FindSpace(space_id)) {
    space->url = url.ToString();
    SaveWorkspace();
    if (space_id == active_space_id_) {
      PushSidebarState();
    }
  }
}

void CanopyWindow::OnTitleChanged(int space_id, const CefString& title) {
  CEF_REQUIRE_UI_THREAD();
  if (Space* space = FindSpace(space_id)) {
    space->title = title.ToString();
    if (space_id == active_space_id_) {
      if (window_) {
        window_->SetTitle(space->title.empty() ? "Canopy"
                                              : space->title + " - Canopy");
      }
      PushSidebarState();
    }
  }
}

void CanopyWindow::OnLoadingStateChanged(int space_id,
                                         bool is_loading,
                                         bool can_go_back,
                                         bool can_go_forward) {
  CEF_REQUIRE_UI_THREAD();
  if (Space* space = FindSpace(space_id)) {
    space->loading = is_loading;
    space->can_go_back = can_go_back;
    space->can_go_forward = can_go_forward;
    if (space_id == active_space_id_) {
      PushSidebarState();
    }
  }
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
    NavigateActive(kJimUrl);
  } else if (action == "back" || action == "forward" || action == "reload" ||
             action == "stop") {
    ExecuteActiveCommand(action);
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
  } else if (action == "delete") {
    DeleteSpace(DecodeInt(DecodeQueryValue(url, "id"), active_space_id_));
  }
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
    if (kind != "space") {
      continue;
    }

    std::string id;
    std::string name;
    std::string url;
    std::getline(row, id, '\t');
    std::getline(row, name, '\t');
    std::getline(row, url);
    const int parsed_id = DecodeInt(id, 0);
    if (parsed_id <= 0 || name.empty() || url.empty() ||
        FindSpace(parsed_id) != nullptr) {
      continue;
    }
    Space space;
    space.id = parsed_id;
    space.name = SanitizeField(name);
    space.url = url;
    spaces_.push_back(space);
    next_space_id_ = std::max(next_space_id_, parsed_id + 1);
    if (spaces_.size() >= kMaximumSpaces) {
      break;
    }
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
  output << "active\t" << active_space_id_ << '\n';
  for (const auto& space : spaces_) {
    output << "space\t" << space.id << '\t' << SanitizeField(space.name)
           << '\t' << SanitizeField(space.url) << '\n';
  }
}

void CanopyWindow::EnsureDefaultSpaces() {
  if (spaces_.empty()) {
    spaces_.push_back({next_space_id_++, "School", kHomeUrl});
    spaces_.push_back({next_space_id_++, "Research", kSearchUrl});
    spaces_.push_back({next_space_id_++, "Personal", kSearchUrl});
  }
  if (!FindSpace(active_space_id_)) {
    active_space_id_ = spaces_.front().id;
  }
  SaveWorkspace();
}

void CanopyWindow::CreateSidebarView() {
  CefBrowserSettings settings;
  settings.javascript = STATE_ENABLED;
  sidebar_view_ = CefBrowserView::CreateBrowserView(
      new BrowserClient(this, BrowserClient::Role::kSidebar, 0),
      GetSidebarUrl(), settings, nullptr, nullptr, this);
  sidebar_view_->SetID(kSidebarViewId);
}

void CanopyWindow::CreateSpaceView(Space& space, bool visible) {
  CefBrowserSettings settings;
  space.browser_view = CefBrowserView::CreateBrowserView(
      new BrowserClient(this, BrowserClient::Role::kContent, space.id),
      space.url.empty() ? kHomeUrl : space.url, settings, nullptr, nullptr,
      this);
  space.browser_view->SetID(kContentViewIdBase + space.id);
  space.browser_view->SetVisible(visible);
}

void CanopyWindow::SwitchToSpace(int space_id) {
  CEF_REQUIRE_UI_THREAD();
  Space* target = FindSpace(space_id);
  if (!target || space_id == active_space_id_) {
    return;
  }

  if (Space* current = ActiveSpace()) {
    if (current->browser_view) {
      current->browser_view->SetVisible(false);
    }
  }
  active_space_id_ = space_id;
  if (target->browser_view) {
    target->browser_view->SetVisible(true);
  }
  if (window_) {
    window_->Layout();
  }
  if (target->browser_view) {
    target->browser_view->RequestFocus();
  }
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::SwitchRelative(int direction) {
  if (spaces_.size() < 2) {
    return;
  }
  const auto current = std::find_if(
      spaces_.begin(), spaces_.end(),
      [this](const Space& space) { return space.id == active_space_id_; });
  if (current == spaces_.end()) {
    SwitchToSpace(spaces_.front().id);
    return;
  }
  const int index = static_cast<int>(std::distance(spaces_.begin(), current));
  const int count = static_cast<int>(spaces_.size());
  const int next = (index + direction + count) % count;
  SwitchToSpace(spaces_[next].id);
}

void CanopyWindow::CreateSpace(const std::string& requested_name) {
  if (!window_ || spaces_.size() >= kMaximumSpaces) {
    return;
  }
  Space space;
  space.id = next_space_id_++;
  space.name = SanitizeField(requested_name);
  if (space.name.empty()) {
    space.name = "Space " + std::to_string(spaces_.size() + 1);
  }
  space.url = kSearchUrl;
  CreateSpaceView(space, false);
  window_->AddChildView(space.browser_view);
  window_->GetLayout()->AsBoxLayout()->SetFlexForView(space.browser_view, 1);
  const int id = space.id;
  spaces_.push_back(space);
  SwitchToSpace(id);
}

void CanopyWindow::RenameSpace(int space_id,
                               const std::string& requested_name) {
  Space* space = FindSpace(space_id);
  const std::string name = SanitizeField(requested_name);
  if (!space || name.empty()) {
    return;
  }
  space->name = name.substr(0, 42);
  SaveWorkspace();
  PushSidebarState();
}

void CanopyWindow::DeleteSpace(int space_id) {
  if (!window_ || spaces_.size() <= 1) {
    return;
  }
  auto found = std::find_if(spaces_.begin(), spaces_.end(),
                            [space_id](const Space& space) {
                              return space.id == space_id;
                            });
  if (found == spaces_.end()) {
    return;
  }

  const bool deleting_active = found->id == active_space_id_;
  const int replacement =
      deleting_active
          ? spaces_[(std::distance(spaces_.begin(), found) + 1) % spaces_.size()]
                .id
          : active_space_id_;
  CefRefPtr<CefBrowserView> view = found->browser_view;
  if (view) {
    window_->RemoveChildView(view);
    if (view->GetBrowser()) {
      view->GetBrowser()->GetHost()->CloseBrowser(true);
    }
  }
  spaces_.erase(found);
  if (deleting_active) {
    active_space_id_ = 0;
    SwitchToSpace(replacement);
  } else {
    SaveWorkspace();
    PushSidebarState();
  }
}

void CanopyWindow::NavigateActive(const std::string& input) {
  Space* space = ActiveSpace();
  if (!space || !space->browser_view || !space->browser_view->GetBrowser()) {
    return;
  }
  const std::string target = NormalizeAddress(input);
  if (target.empty()) {
    return;
  }
  space->browser_view->GetBrowser()->GetMainFrame()->LoadURL(target);
  space->browser_view->RequestFocus();
}

void CanopyWindow::ExecuteActiveCommand(const std::string& command) {
  Space* space = ActiveSpace();
  if (!space || !space->browser_view || !space->browser_view->GetBrowser()) {
    return;
  }
  CefRefPtr<CefBrowser> browser = space->browser_view->GetBrowser();
  if (command == "back" && browser->CanGoBack()) {
    browser->GoBack();
  } else if (command == "forward" && browser->CanGoForward()) {
    browser->GoForward();
  } else if (command == "reload") {
    browser->Reload();
  } else if (command == "stop") {
    browser->StopLoad();
  }
}

void CanopyWindow::PushSidebarState() {
  if (!sidebar_ready_ || !sidebar_view_ || !sidebar_view_->GetBrowser()) {
    return;
  }
  const std::string script = "window.canopySetState(" + BuildStateJson() + ");";
  sidebar_view_->GetBrowser()->GetMainFrame()->ExecuteJavaScript(
      script, GetSidebarUrl(), 0);
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

CanopyWindow::Space* CanopyWindow::ActiveSpace() {
  return FindSpace(active_space_id_);
}

const CanopyWindow::Space* CanopyWindow::ActiveSpace() const {
  return FindSpace(active_space_id_);
}

std::string CanopyWindow::GetSidebarUrl() const {
  CefString executable_directory;
  if (!CefGetPath(PK_DIR_EXE, executable_directory)) {
    return "about:blank";
  }
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

std::string CanopyWindow::BuildStateJson() const {
  CefRefPtr<CefDictionaryValue> root = CefDictionaryValue::Create();
  root->SetInt("activeSpaceId", active_space_id_);
  root->SetInt("maximumSpaces", kMaximumSpaces);

  CefRefPtr<CefListValue> items = CefListValue::Create();
  for (size_t index = 0; index < spaces_.size(); ++index) {
    const Space& space = spaces_[index];
    CefRefPtr<CefDictionaryValue> item = CefDictionaryValue::Create();
    item->SetInt("id", space.id);
    item->SetString("name", space.name);
    item->SetString("title", space.title.empty() ? space.name : space.title);
    item->SetString("url", space.url);
    items->SetDictionary(index, item);
  }
  root->SetList("spaces", items);

  const Space* active = ActiveSpace();
  if (active) {
    root->SetString("title", active->title.empty() ? active->name
                                                   : active->title);
    root->SetString("url", active->url);
    root->SetBool("loading", active->loading);
    root->SetBool("canGoBack", active->can_go_back);
    root->SetBool("canGoForward", active->can_go_forward);
  }

  CefRefPtr<CefValue> value = CefValue::Create();
  value->SetDictionary(root);
  return CefWriteJSON(value, JSON_WRITER_DEFAULT).ToString();
}

std::string CanopyWindow::NormalizeAddress(const std::string& input) const {
  const std::string value = Trim(input);
  if (value.empty()) {
    return std::string();
  }

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
