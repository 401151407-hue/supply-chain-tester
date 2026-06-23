@echo off
cd /d d:\Ikun\supply-chain-tester

REM Add host key and push
ssh-keyscan -p 443 ssh.github.com >> %USERPROFILE%\.ssh\known_hosts 2>nul
ssh -T -p 443 -o StrictHostKeyChecking=accept-new git@ssh.github.com 2>&1
echo ---
git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git
git push -u origin master --force 2>&1
echo DONE
pause
