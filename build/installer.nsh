; Custom NSIS script for Supply Chain Tester
; Preserves user data directories during upgrade/uninstall
; $INSTDIR adapts to whatever directory the user chose (C:\, D:\, etc.)

!macro customUnInstall
  ; Before uninstalling old version, backup user data to temp
  IfFileExists "$INSTDIR\test-suites\*.*" 0 +2
    ExecWait 'xcopy "$INSTDIR\test-suites\*" "$TEMP\sct-backup\test-suites\" /E /I /Y /Q'
  IfFileExists "$INSTDIR\resources\chrome-win64\*.*" 0 +2
    ExecWait 'xcopy "$INSTDIR\resources\chrome-win64\*" "$TEMP\sct-backup\resources\chrome-win64\" /E /I /Y /Q'
  IfFileExists "$INSTDIR\resources\python-portable\*.*" 0 +2
    ExecWait 'xcopy "$INSTDIR\resources\python-portable\*" "$TEMP\sct-backup\resources\python-portable\" /E /I /Y /Q'
!macroend

!macro customInstall
  ; After installing new version, restore user data from backup
  IfFileExists "$TEMP\sct-backup\test-suites\*.*" 0 +2
    ExecWait 'xcopy "$TEMP\sct-backup\test-suites\*" "$INSTDIR\test-suites\" /E /I /Y /Q'
  IfFileExists "$TEMP\sct-backup\resources\chrome-win64\*.*" 0 +2
    ExecWait 'xcopy "$TEMP\sct-backup\resources\chrome-win64\*" "$INSTDIR\resources\chrome-win64\" /E /I /Y /Q'
  IfFileExists "$TEMP\sct-backup\resources\python-portable\*.*" 0 +2
    ExecWait 'xcopy "$TEMP\sct-backup\resources\python-portable\*" "$INSTDIR\resources\python-portable\" /E /I /Y /Q'
  RMDir /r "$TEMP\sct-backup"
  ; Ensure empty directories exist on fresh install
  IfFileExists "$INSTDIR\test-suites\*.*" +2 0
    CreateDirectory "$INSTDIR\test-suites"
!macroend
