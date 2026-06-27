@echo off
cd /d D:\Ikun\supply-chain-tester
set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=accept-new
git add -A
git commit -m "feat: 同步最新代码" 
git push origin master
echo.
echo === Done ===
pause
