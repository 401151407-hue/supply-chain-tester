@echo off
cd /d d:\Ikun\supply-chain-tester

set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=no -p 443
git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git

git add .github/workflows/build.yml
git commit -m "fix: ci bash syntax on Windows runner, use for loop + shell: bash"

call npm version patch --no-git-tag-version 2>nul
git add package.json package-lock.json
git commit -m "chore: bump v0.2.1"
git tag -a "v0.2.1" -m "v0.2.1 - fix CI build"

git push
git push --tags

echo === v0.2.1 tag pushed ===
