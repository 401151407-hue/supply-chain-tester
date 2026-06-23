@echo off
cd /d d:\Ikun\supply-chain-tester
git add .github/workflows/build.yml
git commit -m "ci: auto-clean old releases to avoid 500MB artifact quota"
set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=no -p 443
git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git
git push
echo DONE
