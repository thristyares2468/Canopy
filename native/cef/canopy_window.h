// Copyright (c) 2026 Canopy contributors.

#ifndef CANOPY_NATIVE_CANOPY_WINDOW_H_
#define CANOPY_NATIVE_CANOPY_WINDOW_H_

#include <cstdint>
#include <deque>
#include <string>
#include <vector>

#include "include/cef_menu_model.h"
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

  void OnBrowserReady(bool is_sidebar, int space_id, int tab_id);
  void OnBrowserClosed(bool is_sidebar, int space_id, int tab_id);
  void OnAddressChanged(int space_id, int tab_id, const CefString& url);
  void OnTitleChanged(int space_id, int tab_id, const CefString& title);
  void OnFaviconChanged(int space_id,
                        int tab_id,
                        const std::vector<CefString>& icon_urls);
  void OnLoadingStateChanged(int space_id,
                             int tab_id,
                             bool is_loading,
                             bool can_go_back,
                             bool can_go_forward);
  void OnDownloadUpdated(uint32_t id,
                         const CefString& name,
                         const CefString& path,
                         int64_t received_bytes,
                         int64_t total_bytes,
                         int percent_complete,
                         bool is_complete,
                         bool is_canceled,
                         bool is_in_progress);
  void HandleSidebarAction(const std::string& url);
  bool PopulateTabContextMenu(int tab_id, CefRefPtr<CefMenuModel> model);
  bool PopulateSpaceContextMenu(int space_id, CefRefPtr<CefMenuModel> model);
  bool HandleTabContextMenuCommand(int tab_id, int command_id);
  bool HandleSpaceContextMenuCommand(int space_id, int command_id);
  bool HandleKeyboardShortcut(int key_code, bool shift, bool control, bool alt);
  void OpenUrlInNewTab(int source_space_id,
                       const std::string& url,
                       bool activate);

 private:
  struct Tab {
    int id = 0;
    std::string url;
    std::string title;
    std::string favicon_url;
    bool pinned = false;
    bool loading = false;
    bool can_go_back = false;
    bool can_go_forward = false;
    bool retired = false;
    CefRefPtr<CefBrowserView> browser_view;
  };

  struct Space {
    int id = 0;
    std::string name;
    std::string label;
    std::string color;
    int active_tab_id = 0;
    bool retired = false;
    std::vector<Tab> tabs;
  };

  struct ClosedTab {
    int space_id = 0;
    std::string url;
    std::string title;
    bool pinned = false;
  };

  struct Favorite {
    int id = 0;
    std::string title;
    std::string url;
    std::string favicon_url;
  };

  struct HistoryEntry {
    int64_t visited_at = 0;
    std::string url;
    std::string title;
  };

  struct DownloadEntry {
    uint32_t id = 0;
    std::string name;
    std::string path;
    int64_t received_bytes = 0;
    int64_t total_bytes = 0;
    int percent_complete = -1;
    bool is_complete = false;
    bool is_canceled = false;
    bool is_in_progress = false;
  };

  void LoadWorkspace();
  void SaveWorkspace() const;
  void LoadHistory();
  void SaveHistory() const;
  void EnsureDefaultSpaces();
  void EnsureDefaultFavorites();
  void EnsureSpaceHasTab(Space& space, const std::string& fallback_url);
  void CreateSidebarView();
  void CreateTabView(Space& space, Tab& tab, bool visible);
  int AddTab(Space& space,
             const std::string& url,
             bool activate,
             bool pinned);
  void SwitchToSpace(int space_id);
  void SwitchRelative(int direction);
  void SwitchToTab(int tab_id);
  void SwitchRelativeTab(int direction);
  void CreateTab(const std::string& url, bool pinned = false);
  void CloseTab(int tab_id);
  void ToggleTabPinned(int tab_id);
  void DuplicateTab(int tab_id);
  void ReopenClosedTab();
  void MoveTabToSpace(int tab_id, int target_space_id);
  void ReorderTab(int tab_id, int before_tab_id);
  void ToggleFavorite(int tab_id);
  void OpenFavorite(int favorite_id);
  void RemoveFavorite(int favorite_id);
  void CreateSpace(const std::string& requested_name);
  void RenameSpace(int space_id, const std::string& requested_name);
  void UpdateSpaceAppearance(int space_id,
                             const std::string& requested_label,
                             const std::string& requested_color);
  void DeleteSpace(int space_id);
  void ReorderSpace(int space_id, int before_space_id);
  void NavigateActive(const std::string& input);
  void ExecuteActiveCommand(const std::string& command);
  void FindInActiveTab(const std::string& query, bool forward, bool find_next);
  void StopFinding();
  void FocusSidebarAddress();
  void OpenSidebarPanel(const std::string& panel);
  void RecordHistory(const Tab& tab);
  void ClearHistory();
  void ClearBrowsingData();
  void ExecuteSidebarJavaScript(const std::string& script);
  void PushSidebarState();
  void UpdateWindowTitle();

  Space* FindSpace(int space_id);
  const Space* FindSpace(int space_id) const;
  Tab* FindTab(Space& space, int tab_id);
  const Tab* FindTab(const Space& space, int tab_id) const;
  Space* ActiveSpace();
  const Space* ActiveSpace() const;
  Tab* ActiveTab();
  const Tab* ActiveTab() const;
  std::string GetSidebarUrl() const;
  std::string GetWorkspacePath() const;
  std::string GetHistoryPath() const;
  std::string BuildStateJson() const;
  std::string NormalizeAddress(const std::string& input) const;

  CefRefPtr<CefWindow> window_;
  CefRefPtr<CefBrowserView> sidebar_view_;
  std::vector<Space> spaces_;
  std::deque<ClosedTab> closed_tabs_;
  std::vector<Favorite> favorites_;
  std::deque<HistoryEntry> history_;
  std::vector<DownloadEntry> downloads_;
  int active_space_id_ = 0;
  int next_space_id_ = 1;
  int next_tab_id_ = 1;
  int next_favorite_id_ = 1;
  bool favorites_initialized_ = false;
  bool sidebar_ready_ = false;

  IMPLEMENT_REFCOUNTING(CanopyWindow);
  DISALLOW_COPY_AND_ASSIGN(CanopyWindow);
};

}  // namespace canopy

#endif  // CANOPY_NATIVE_CANOPY_WINDOW_H_
