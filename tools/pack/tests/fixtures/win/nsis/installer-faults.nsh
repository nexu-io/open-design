!include "FileFunc.nsh"

!macro OD_INSTALLER_HOOK_VARIABLES
  Var TestFault
!macroend

!macro OD_INSTALLER_HOOK_INIT
  ${GetParameters} $0
  ${GetOptions} $0 "/ODTESTFAULT=" $TestFault
  Push "test-only installer fault selected=$TestFault"
  Call LogInstallerEvent
!macroend

!macro OD_INSTALLER_HOOK_AFTER_TREE_COMMIT
  ${If} $TestFault == "after-install-tree-commit"
    Push "test-only installer fault injected=after-install-tree-commit"
    Call LogInstallerEvent
    Call RollbackInstallTransaction
    SetErrorLevel 86
    Abort
  ${EndIf}
!macroend

!macro OD_INSTALLER_HOOK_BEFORE_INTEGRATION
  ${If} $TestFault == "before-post-commit-integration"
    Push "test-only installer fault injected=before-post-commit-integration"
    Call LogInstallerEvent
    SetErrorLevel 87
    Abort
  ${EndIf}
!macroend
