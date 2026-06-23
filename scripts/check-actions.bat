@echo off
echo === GitHub CLI Check ===
where gh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo gh CLI is installed
    gh auth status 2>&1
    echo.
    echo === Actions Billing ===
    gh api /repos/401151407-hue/supply-chain-tester/actions/workflows 2>&1
) else (
    echo gh CLI not installed.
    echo Checking via curl...
    curl -s -H "Accept: application/vnd.github+json" https://api.github.com/repos/401151407-hue/supply-chain-tester/actions/workflows 2>&1
)
echo DONE
