; Custom NSIS script for Supply Chain Tester
; Preserves the test-suites directory during upgrade/uninstall

!macro customUnInstall
  ; Before uninstalling old version, backup test-suites to temp
  IfFileExists "$INSTDIR\test-suites\*.*" 0 +3
    CreateDirectory "$TEMP\sct-backup"
    CopyFiles /SILENT "$INSTDIR\test-suites\*.*" "$TEMP\sct-backup"
!macroend

!macro customInstall
  ; After installing new version, restore test-suites from backup
  IfFileExists "$TEMP\sct-backup\*.*" 0 +3
    CreateDirectory "$INSTDIR\test-suites"
    CopyFiles /SILENT "$TEMP\sct-backup\*.*" "$INSTDIR\test-suites"
    RMDir /r "$TEMP\sct-backup"
!macroend
