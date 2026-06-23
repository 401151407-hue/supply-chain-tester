@echo off
cd /d d:\Ikun\supply-chain-tester
echo Checking GitHub CLI...
where gh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo gh CLI found!
    gh repo create supply-chain-tester --public --source=. --remote=origin --push --description "Supply Chain Tester"
) else (
    echo Using SSH to push...
    set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=no -p 443
    git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git
    git push -u origin master --force 2>&1
)
echo DONE
