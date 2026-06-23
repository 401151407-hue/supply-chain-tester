@echo off
cd /d d:\Ikun\supply-chain-tester

REM Generate SSH key if needed
if not exist "%USERPROFILE%\.ssh\id_ed25519" (
    echo Generating SSH key...
    ssh-keygen -t ed25519 -f "%USERPROFILE%\.ssh\id_ed25519" -N "" -C "401151407-hue@users.noreply.github.com" -q
)

echo === Public Key (add to GitHub Settings ^> SSH Keys) ===
type "%USERPROFILE%\.ssh\id_ed25519.pub"
echo ======================================================

REM Push
git remote set-url origin git@ssh.github.com:401151407-hue/supply-chain-tester.git
git push -u origin master --force
echo DONE
