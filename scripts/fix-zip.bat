@echo off
cd /d d:\Ikun\supply-chain-tester

set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=no -p 443
git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git

echo test-suites.zip >> .gitignore
git add .gitignore

echo Removing test-suites.zip from git...
git rm --cached test-suites.zip 2>nul
del test-suites.zip 2>nul

git commit -m "fix: remove accidentally committed test-suites.zip, add to gitignore"
git push

echo Done - test-suites.zip removed
