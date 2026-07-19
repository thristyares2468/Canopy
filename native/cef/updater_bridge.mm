// Copyright (c) 2026 Canopy contributors.

#include "examples/canopy/updater_bridge.h"

#import <AppKit/AppKit.h>
#import <Sparkle/Sparkle.h>

namespace canopy {
namespace {

SPUStandardUpdaterController* g_updater_controller = nil;

void InstallUpdateMenuItem() {
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      InstallUpdateMenuItem();
    });
    return;
  }

  NSMenu* main_menu = [NSApp mainMenu];
  NSMenu* application_menu = [[main_menu itemAtIndex:0] submenu];
  if (!application_menu) {
    // CEF can initialize before the application menu is restored from the
    // nib. Try again after the current launch turn instead of losing the item.
    dispatch_async(dispatch_get_main_queue(), ^{
      InstallUpdateMenuItem();
    });
    return;
  }
  if ([application_menu itemWithTitle:@"Check for Updates..."]) {
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
    const bool starting_updater = g_updater_controller == nil;
    if (!g_updater_controller) {
      g_updater_controller = [[SPUStandardUpdaterController alloc]
          initWithStartingUpdater:YES
                 updaterDelegate:nil
              userDriverDelegate:nil];
    }
    InstallUpdateMenuItem();
    if (starting_updater &&
        [[g_updater_controller updater] automaticallyChecksForUpdates]) {
      [[g_updater_controller updater] checkForUpdatesInBackground];
    }
  }
}

void CheckForUpdates() {
  @autoreleasepool {
    StartUpdater();
    [g_updater_controller checkForUpdates:nil];
  }
}

}  // namespace canopy
