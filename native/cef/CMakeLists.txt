# Copyright (c) 2026 Canopy contributors.

if(NOT OS_MAC)
  message(FATAL_ERROR "The Canopy native prototype currently targets macOS.")
endif()

set(CANOPY_SRCS
  app_browser_canopy.cc
  browser_client.cc
  browser_client.h
  canopy_window.cc
  canopy_window.h
  main_canopy.cc
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
target_link_libraries(${CANOPY_TARGET} shared)
set_target_properties(${CANOPY_TARGET} PROPERTIES
  RESOURCE "${SHARED_RESOURCES_SRCS}"
  MACOSX_BUNDLE_INFO_PLIST "${SHARED_INFO_PLIST}"
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
  COMMAND ${CMAKE_COMMAND} -E make_directory
          "${CANOPY_APP}/Contents/Resources/canopy"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/sidebar.html"
          "${CANOPY_APP}/Contents/Resources/canopy/sidebar.html"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/sidebar.css"
          "${CANOPY_APP}/Contents/Resources/canopy/sidebar.css"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/sidebar.js"
          "${CANOPY_APP}/Contents/Resources/canopy/sidebar.js"
  COMMAND ${CMAKE_COMMAND} -E remove_directory
          "${CANOPY_APP}/Contents/Resources/jims-game"
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          "${CMAKE_CURRENT_SOURCE_DIR}/resources/jims-game"
          "${CANOPY_APP}/Contents/Resources/jims-game"
  VERBATIM
  )
