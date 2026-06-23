@echo off
cd /d d:\Ikun\supply-chain-tester

set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=no -p 443
git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git

echo === Committing changes ===
git add -A
git commit -m "chore: pre-release v0.2.0" 2>nul

echo === Bumping to v0.2.0 ===
call npm version 0.2.0 --no-git-tag-version --allow-same-version 2>nul
git add package.json package-lock.json
git commit -m "chore: bump to v0.2.0"
git tag -a "v0.2.0" -m "v0.2.0 - 全新开源首版 | 供应链测试工具"

echo === Pushing ===
git push
git push --tags

echo.
echo === v0.2.0 tag pushed! CI Build Starting... ===
echo Check: https://github.com/401151407-hue/supply-chain-tester/actions

