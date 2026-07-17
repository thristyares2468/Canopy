// Copyright (c) 2026 Canopy contributors.

#ifndef CANOPY_NATIVE_CANOPY_WINDOW_H_
#define CANOPY_NATIVE_CANOPY_WINDOW_H_

#include <string>
#include <vector>

#include "include/views/cef_browser_view.h"
#include "include/views/cef_browser_view_delegate.h"
#include "include/views/cef_window.h"
#include "include/views/cef_window_delegate.h"

namespace canopy {

class CanopyWindow : public CefWindowDelegate,
                     public CefBrowserViewDelegate {
 public:
  CanopyWindow();

  void OnWindowCreated(CefRefPtr<CefWindow> window) override;
  void OnWindowDestroyed(CefRefPtr<CefWindow> window) override;
  bool CanClose(CefRefPtr<CefWindow> window) override;
  CefRect GetInitialBounds(CefRefPtr<CefWindow> window) override;
  CefSize GetPreferredSize(CefRefPtr<CefView> view) override;
  CefSize GetMinimumSize(CefRefPtr<CefView> view) override;
  cef_runtime_style_t GetWindowRuntimeStyle() override;
  cef_runtime_style_t GetBrowserRuntimeStyle() override;

  void OnBrowserReady(bool is_sidebar, int space_id);
  void OnBrowserClosed(bool is_sidebar, int space_id);
  void OnAddressChanged(int space_id, const CefString& url);
  void OnTitleChanged(int space_id, const CefString& title);
  void OnLoadingStateChanged(int space_id,
                             bool is_loading,
                             bool can_go_back,
                             bool can_go_forward);
  void HandleSidebarAction(const std::string& url);

 private:
  struct Space {
    int id = 0;
    std::string name;
    std::string url;
    std::string title;
    bool loading = false;
    bool can_go_back = false;
    bool can_go_forward = false;
    CefRefPtr<CefBrowserView> browser_view;
  };

  void LoadWorkspace();
  void SaveWorkspace() const;
  void EnsureDefaultSpaces();
  void CreateSidebarView();
  void CreateSpaceView(Space& space, bool visible);
  void SwitchToSpace(int space_id);
  void SwitchRelative(int direction);
  void CreateSpace(const std::string& requested_name);
  void RenameSpace(int space_id, const std::string& requested_name);
  void DeleteSpace(int space_id);
  void NavigateActive(const std::string& input);
  void ExecuteActiveCommand(const std::string& command);
  void PushSidebarState();

  Space* FindSpace(int space_id);
  const Space* FindSpace(int space_id) const;
  Space* ActiveSpace();
  const Space* ActiveSpace() const;
  std::string GetSidebarUrl() const;
  std::string GetWorkspacePath() const;
  std::string BuildStateJson() const;
  std::string NormalizeAddress(const std::string& input) const;

  CefRefPtr<CefWindow> window_;
  CefRefPtr<CefBrowserView> sidebar_view_;
  std::vector<Space> spaces_;
  int active_space_id_ = 0;
  int next_space_id_ = 1;
  bool sidebar_ready_ = false;

  IMPLEMENT_REFCOUNTING(CanopyWindow);
  DISALLOW_COPY_AND_ASSIGN(CanopyWindow);
};

}  // namespace canopy

#endif  // CANOPY_NATIVE_CANOPY_WINDOW_H_
