# Copyright (c) 2026 Canopy contributors.

if(NOT OS_MAC)
  message(FATAL_ERROR "The Canopy native prototype currently targets macOS.")
endif()

if(NOT CANOPY_SPARKLE_DIR OR
   NOT EXISTS "${CANOPY_SPARKLE_DIR}/Sparkle.framework/Sparkle")
  message(FATAL_ERROR "CANOPY_SPARKLE_DIR must point to an extracted Sparkle release.")
endif()
if(NOT CANOPY_VERSION)
  set(CANOPY_VERSION "0.0.0")
endif()
if(NOT CANOPY_BUILD_NUMBER)
  set(CANOPY_BUILD_NUMBER "0")
endif()

set(CANOPY_SRCS
  app_browser_canopy.cc
  browser_client.cc
  browser_client.h
  canopy_window.cc
  canopy_window.h
  main_canopy.cc
  updater_bridge.h
  updater_bridge.mm
  )

set(CANOPY_HELPER_SRCS
  ../minimal/app_other_minimal.cc
  ../minimal/app_renderer_minimal.cc
  ../minimal/process_helper_mac_minimal.cc
  )

set(CANOPY_WEB_RESOURCES
  resources/sidebar.css
  resources/sidebar.html
  resources/sidebar.js
  )
set_source_files_properties(${CANOPY_WEB_RESOURCES} PROPERTIES
  HEADER_FILE_ONLY TRUE
  )

# The shared CEF sample nib still uses the placeholder app name "example".
# Compile a Canopy-branded copy after the shared resource phase.
set(CANOPY_MENU_XIB "${CMAKE_CURRENT_BINARY_DIR}/CanopyMainMenu.xib")
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../shared/mac/English.lproj/MainMenu.xib"
     CANOPY_MENU_CONTENTS)
string(REPLACE "example" "Canopy" CANOPY_MENU_CONTENTS
       "${CANOPY_MENU_CONTENTS}")
file(WRITE "${CANOPY_MENU_XIB}" "${CANOPY_MENU_CONTENTS}")

set(CANOPY_TARGET "Canopy")
set(CANOPY_HELPER_TARGET "Canopy_Helper")
set(CANOPY_HELPER_OUTPUT_NAME "Canopy Helper")
set(CANOPY_APP "${EXAMPLE_TARGET_OUT_DIR}/${CANOPY_TARGET}.app")

SET_EXAMPLE_SOURCE_GROUPS("${CANOPY_SRCS}")
SET_EXAMPLE_SOURCE_GROUPS("${CANOPY_HELPER_SRCS}")

set(EXECUTABLE_NAME "${CANOPY_TARGET}")
set(PRODUCT_NAME "${CANOPY_TARGET}")

add_executable(${CANOPY_TARGET} MACOSX_BUNDLE
  ${CANOPY_SRCS}
  ${CANOPY_WEB_RESOURCES}
  ${SHARED_RESOURCES_SRCS}
  )
SET_EXAMPLE_EXECUTABLE_TARGET_PROPERTIES(${CANOPY_TARGET})
add_dependencies(${CANOPY_TARGET} shared)
target_include_directories(${CANOPY_TARGET} PRIVATE
  "${CANOPY_SPARKLE_DIR}/Sparkle.framework/Headers"
  )
target_compile_definitions(${CANOPY_TARGET} PRIVATE
  CANOPY_VERSION="${CANOPY_VERSION}"
  CANOPY_BUILD_NUMBER="${CANOPY_BUILD_NUMBER}"
  )
target_link_libraries(${CANOPY_TARGET}
  shared
  "${CANOPY_SPARKLE_DIR}/Sparkle.framework"
  )
set_target_properties(${CANOPY_TARGET} PROPERTIES
  RESOURCE "${SHARED_RESOURCES_SRCS}"
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist.in"
  INSTALL_RPATH "@executable_path/../Frameworks"
  BUILD_WITH_INSTALL_RPATH TRUE
  XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "au.com.canopy.browser"
  )

COPY_MAC_FRAMEWORK("${CANOPY_TARGET}" "${CEF_BINARY_DIR}" "${CANOPY_APP}")

foreach(_suffix_list ${CEF_HELPER_APP_SUFFIXES})
  string(REPLACE ":" ";" _suffix_list ${_suffix_list})
  list(GET _suffix_list 0 _name_suffix)
  list(GET _suffix_list 1 _target_suffix)
  list(GET _suffix_list 2 _plist_suffix)

  set(_helper_target "${CANOPY_HELPER_TARGET}${_target_suffix}")
  set(_helper_output_name "${CANOPY_HELPER_OUTPUT_NAME}${_name_suffix}")
  set(_helper_info_plist
      "${CMAKE_CURRENT_BINARY_DIR}/helper-Info${_target_suffix}.plist.in")
  file(READ "${SHARED_HELPER_INFO_PLIST}" _plist_contents)
  string(REPLACE
         "org.cef.\${PRODUCT_NAME}.helper\${BUNDLE_ID_SUFFIX}"
         "au.com.canopy.browser.helper\${BUNDLE_ID_SUFFIX}"
         _plist_contents "${_plist_contents}")
  string(REPLACE "\${EXECUTABLE_NAME}" "${_helper_output_name}"
         _plist_contents "${_plist_contents}")
  string(REPLACE "\${PRODUCT_NAME}" "${_helper_output_name}"
         _plist_contents "${_plist_contents}")
  string(REPLACE "\${BUNDLE_ID_SUFFIX}" "${_plist_suffix}"
         _plist_contents "${_plist_contents}")
  file(WRITE "${_helper_info_plist}" "${_plist_contents}")

  add_executable(${_helper_target} MACOSX_BUNDLE ${CANOPY_HELPER_SRCS})
  SET_EXAMPLE_EXECUTABLE_TARGET_PROPERTIES(${_helper_target})
  add_dependencies(${_helper_target} shared_helper)
  target_link_libraries(${_helper_target} shared_helper)
  set_target_properties(${_helper_target} PROPERTIES
    MACOSX_BUNDLE_INFO_PLIST "${_helper_info_plist}"
    OUTPUT_NAME "${_helper_output_name}"
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER
      "au.com.canopy.browser.helper${_plist_suffix}"
    )

  add_dependencies(${CANOPY_TARGET} "${_helper_target}")
  add_custom_command(
    TARGET ${CANOPY_TARGET}
    POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${EXAMPLE_TARGET_OUT_DIR}/${_helper_output_name}.app"
            "${CANOPY_APP}/Contents/Frameworks/${_helper_output_name}.app"
    VERBATIM
    )
endforeach()

set(PREFIXES "../shared/mac/")
COPY_MAC_RESOURCES("${SHARED_RESOURCES_SRCS}" "${PREFIXES}"
                   "${CANOPY_TARGET}" "${CMAKE_CURRENT_SOURCE_DIR}"
                   "${CANOPY_APP}")

add_custom_command(
  TARGET ${CANOPY_TARGET}
  POST_BUILD
  COMMAND /usr/bin/ibtool --compile
          "${CANOPY_APP}/Contents/Resources/English.lproj/MainMenu.nib"
          "${CANOPY_MENU_XIB}"
  COMMAND ${CMAKE_COMMAND} -E make_directory
          "${CANOPY_APP}/Contents/Resources/canopy"
  COMMAND /usr/bin/ditto
          "${CANOPY_SPARKLE_DIR}/Sparkle.framework"
          "${CANOPY_APP}/Contents/Frameworks/Sparkle.framework"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/sidebar.html"
          "${CANOPY_APP}/Contents/Resources/canopy/sidebar.html"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/sidebar.css"
          "${CANOPY_APP}/Contents/Resources/canopy/sidebar.css"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/sidebar.js"
          "${CANOPY_APP}/Contents/Resources/canopy/sidebar.js"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/Canopy.icns"
          "${CANOPY_APP}/Contents/Resources/Canopy.icns"
  COMMAND ${CMAKE_COMMAND} -E remove_directory
          "${CANOPY_APP}/Contents/Resources/jims-game"
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/jims-game"
          "${CANOPY_APP}/Contents/Resources/jims-game"
  VERBATIM
  )
