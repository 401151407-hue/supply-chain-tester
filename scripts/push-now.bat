@echo off
cd /d D:\Ikun\supply-chain-tester
set GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=accept-new
"C:\Program Files\Git\cmd\git.exe" add -A
"C:\Program Files\Git\cmd\git.exe" commit -m "feat: sync latest changes" --allow-empty
"C:\Program Files\Git\cmd\git.exe" push origin master
echo DONE
