!macro OD_INSTALLER_HOOK_VARIABLES
  Var TestFault
!macroend

!macro OD_INSTALLER_HOOK_INIT
  ${GetParameters} $0
  StrCpy $TestFault ""
  ClearErrors
  ${GetOptions} $0 "/ODTESTFAULTAFTERTREECOMMIT" $1
  IfErrors no_after_tree_commit
  StrCpy $TestFault "after-install-tree-commit"
no_after_tree_commit:
  ClearErrors
  ${GetOptions} $0 "/ODTESTFAULTBEFOREINTEGRATION" $1
  IfErrors no_before_integration
  StrCpy $TestFault "before-post-commit-integration"
no_before_integration:
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
