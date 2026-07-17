// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/browser_client.h"

#include "examples/canopy/canopy_window.h"
#include "examples/shared/client_util.h"

#include "include/wrapper/cef_helpers.h"

namespace canopy {

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

}  // namespace canopy
