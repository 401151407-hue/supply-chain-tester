; Custom NSIS script for Supply Chain Tester
; Preserves the test-suites directory (with subdirectories) during upgrade/uninstall
; $INSTDIR adapts to whatever directory the user chose (C:\, D:\, etc.)

!macro customUnInstall
  ; Before uninstalling old version, backup test-suites to temp
  IfFileExists "$INSTDIR\test-suites\*.*" 0 +2
    ExecWait 'xcopy "$INSTDIR\test-suites" "$TEMP\sct-backup\test-suites\" /E /I /Y /Q'
!macroend

!macro customInstall
  ; After installing new version, restore test-suites from backup
  IfFileExists "$TEMP\sct-backup\test-suites\*.*" 0 +3
    ExecWait 'xcopy "$TEMP\sct-backup\test-suites" "$INSTDIR\test-suites\" /E /I /Y /Q'
    RMDir /r "$TEMP\sct-backup"
!macroend
