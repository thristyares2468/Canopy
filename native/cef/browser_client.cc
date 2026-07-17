// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/browser_client.h"

#include "examples/canopy/canopy_window.h"
#include "examples/shared/client_util.h"

#include <filesystem>

#include "include/cef_parser.h"
#include "include/cef_path_util.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_stream_resource_handler.h"

namespace canopy {

namespace {

constexpr char kJimOrigin[] = "https://jims.canopy.internal";

bool IsJimResource(const std::string& url) {
  return url == kJimOrigin || url.rfind(std::string(kJimOrigin) + "/", 0) == 0;
}

std::filesystem::path GetJimResourceRoot() {
  CefString executable_directory;
  if (!CefGetPath(PK_DIR_EXE, executable_directory)) {
    return std::filesystem::path();
  }
  return (std::filesystem::path(executable_directory.ToString()) / ".." /
          "Resources" / "jims-game")
      .lexically_normal();
}

std::string GetJimMimeType(const std::filesystem::path& path) {
  const std::string extension = path.extension().string();
  if (extension == ".glb") return "model/gltf-binary";
  if (extension == ".gltf") return "model/gltf+json";
  if (extension == ".ktx2") return "image/ktx2";
  if (extension == ".bin") return "application/octet-stream";
  if (extension == ".m4a") return "audio/mp4";
  const std::string mime =
      CefGetMimeType(extension.empty() ? extension : extension.substr(1));
  return mime.empty() ? "application/octet-stream" : mime;
}

std::filesystem::path JimPathForUrl(const std::string& url) {
  if (!IsJimResource(url)) return std::filesystem::path();

  std::string encoded_path = url.substr(sizeof(kJimOrigin) - 1);
  const size_t suffix = encoded_path.find_first_of("?#");
  if (suffix != std::string::npos) encoded_path.resize(suffix);
  while (!encoded_path.empty() && encoded_path.front() == '/') {
    encoded_path.erase(encoded_path.begin());
  }
  if (encoded_path.empty()) encoded_path = "index.html";
  if (encoded_path == "legal" || encoded_path == "legal/") {
    encoded_path = "legal.html";
  }

  const std::string decoded =
      CefURIDecode(encoded_path, false, UU_NONE).ToString();
  const std::filesystem::path relative(decoded);
  if (relative.is_absolute()) return std::filesystem::path();
  for (const auto& component : relative) {
    if (component == "..") return std::filesystem::path();
  }

  const std::filesystem::path root = GetJimResourceRoot();
  if (root.empty()) return std::filesystem::path();
  return (root / relative).lexically_normal();
}

}  // namespace

BrowserClient::BrowserClient(CanopyWindow* owner, Role role, int space_id)
    : owner_(owner), role_(role), space_id_(space_id) {}

void BrowserClient::OnAddressChange(CefRefPtr<CefBrowser> browser,
                                    CefRefPtr<CefFrame> frame,
                                    const CefString& url) {
  CEF_REQUIRE_UI_THREAD();
  if (role_ == Role::kContent && frame->IsMain()) {
    owner_->OnAddressChanged(space_id_, url);
  }
}

void BrowserClient::OnTitleChange(CefRefPtr<CefBrowser> browser,
                                  const CefString& title) {
  CEF_REQUIRE_UI_THREAD();
  if (role_ == Role::kContent) {
    owner_->OnTitleChanged(space_id_, title);
  }
}

void BrowserClient::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  shared::OnAfterCreated(browser);
  owner_->OnBrowserReady(role_ == Role::kSidebar, space_id_);
}

bool BrowserClient::DoClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  return shared::DoClose(browser);
}

void BrowserClient::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  owner_->OnBrowserClosed(role_ == Role::kSidebar, space_id_);
  shared::OnBeforeClose(browser);
}

void BrowserClient::OnLoadingStateChange(CefRefPtr<CefBrowser> browser,
                                         bool is_loading,
                                         bool can_go_back,
                                         bool can_go_forward) {
  CEF_REQUIRE_UI_THREAD();
  if (role_ == Role::kContent) {
    owner_->OnLoadingStateChanged(space_id_, is_loading, can_go_back,
                                  can_go_forward);
  }
}

bool BrowserClient::OnShowPermissionPrompt(
    CefRefPtr<CefBrowser> browser,
    uint64_t prompt_id,
    const CefString& requesting_origin,
    uint32_t requested_permissions,
    CefRefPtr<CefPermissionPromptCallback> callback) {
  callback->Continue(CEF_PERMISSION_RESULT_DENY);
  return true;
}

bool BrowserClient::OnRequestMediaAccessPermission(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    const CefString& requesting_origin,
    uint32_t requested_permissions,
    CefRefPtr<CefMediaAccessCallback> callback) {
  callback->Cancel();
  return true;
}

bool BrowserClient::OnBeforeBrowse(CefRefPtr<CefBrowser> browser,
                                   CefRefPtr<CefFrame> frame,
                                   CefRefPtr<CefRequest> request,
                                   bool user_gesture,
                                   bool is_redirect) {
  CEF_REQUIRE_UI_THREAD();
  if (role_ != Role::kSidebar || !frame->IsMain()) {
    return false;
  }

  const std::string url = request->GetURL();
  if (url.rfind("https://canopy.internal/", 0) != 0) {
    return false;
  }

  owner_->HandleSidebarAction(url);
  return true;
}

CefRefPtr<CefResourceRequestHandler>
BrowserClient::GetResourceRequestHandler(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefRefPtr<CefRequest> request,
    bool is_navigation,
    bool is_download,
    const CefString& request_initiator,
    bool& disable_default_handling) {
  CEF_REQUIRE_IO_THREAD();
  if (!IsJimResource(request->GetURL())) return nullptr;
  disable_default_handling = true;
  return this;
}

CefRefPtr<CefResourceHandler> BrowserClient::GetResourceHandler(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefRefPtr<CefRequest> request) {
  CEF_REQUIRE_IO_THREAD();
  const std::filesystem::path path = JimPathForUrl(request->GetURL());
  if (path.empty() || !std::filesystem::is_regular_file(path)) return nullptr;

  CefRefPtr<CefStreamReader> reader =
      CefStreamReader::CreateForFile(path.string());
  if (!reader) return nullptr;
  return new CefStreamResourceHandler(GetJimMimeType(path), reader);
}

}  // namespace canopy
