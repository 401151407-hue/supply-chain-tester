$ErrorActionPreference = 'Continue'

# Kill any stuck SSH processes
Get-Process ssh,ssh-keygen -ErrorAction SilentlyContinue | Stop-Process -Force

# Add ssh.github.com to known_hosts
$knownHosts = "$env:USERPROFILE\.ssh\known_hosts"
ssh-keyscan -p 443 ssh.github.com 2>$null | Out-File -Append $knownHosts

# Generate SSH key if not exists
$keyPath = "$env:USERPROFILE\.ssh\id_ed25519"
if (-not (Test-Path $keyPath)) {
    ssh-keygen -t ed25519 -f $keyPath -N '""' -q -C "401151407-hue@users.noreply.github.com"
    Write-Host "SSH key generated"
} else {
    Write-Host "SSH key already exists"
}

Write-Host "=== Public Key (add to GitHub Settings > SSH Keys)==="
Get-Content "$keyPath.pub"
Write-Host "======================================================"

# Test connection
ssh -T -o StrictHostKeyChecking=accept-new -p 443 git@ssh.github.com 2>&1
