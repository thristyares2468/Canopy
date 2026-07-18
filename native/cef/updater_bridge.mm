// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/updater_bridge.h"

#import <AppKit/AppKit.h>
#import <Sparkle/Sparkle.h>

namespace canopy {
namespace {

SPUStandardUpdaterController* g_updater_controller = nil;

void InstallUpdateMenuItem() {
  NSMenu* main_menu = [NSApp mainMenu];
  NSMenu* application_menu = [[main_menu itemAtIndex:0] submenu];
  if (!application_menu || [application_menu itemWithTitle:@"Check for Updates..."]) {
    return;
  }

  NSMenuItem* update_item =
      [[NSMenuItem alloc] initWithTitle:@"Check for Updates..."
                                action:@selector(checkForUpdates:)
                         keyEquivalent:@""];
  [update_item setTarget:g_updater_controller];
  [application_menu insertItem:update_item atIndex:1];
  [update_item release];
}

}  // namespace

void StartUpdater() {
  @autoreleasepool {
    if (g_updater_controller) {
      return;
    }
    g_updater_controller = [[SPUStandardUpdaterController alloc]
        initWithStartingUpdater:YES
               updaterDelegate:nil
            userDriverDelegate:nil];
    InstallUpdateMenuItem();
  }
}

void CheckForUpdates() {
  @autoreleasepool {
    StartUpdater();
    [g_updater_controller checkForUpdates:nil];
  }
}

}  // namespace canopy
