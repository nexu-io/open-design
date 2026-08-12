; Production installer extension seam. Release builds use these no-op macros.
; Saturation-only implementations live under tests/fixtures/win/nsis and are
; selected explicitly by the test build, so test fault behavior is never
; compiled into a release installer.

!macro OD_INSTALLER_HOOK_VARIABLES
!macroend

!macro OD_INSTALLER_HOOK_INIT
!macroend

!macro OD_INSTALLER_HOOK_AFTER_TREE_COMMIT
!macroend

!macro OD_INSTALLER_HOOK_BEFORE_INTEGRATION
!macroend
