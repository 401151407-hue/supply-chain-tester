@echo off
echo === Testing GitHub API connectivity ===
powershell -Command "try { $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/401151407-hue/supply-chain-tester' -TimeoutSec 10; Write-Host 'Repo exists:' $r.name; Write-Host 'Private:' $r.private } catch { Write-Host 'API Error:' $_.Exception.Message }"
echo.
echo === Actions Usage (requires auth - checking public info) ===
powershell -Command "try { $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/401151407-hue/supply-chain-tester/actions/workflows' -TimeoutSec 10; $r.workflows | ForEach-Object { Write-Host $_.name '-' $_.state } } catch { Write-Host 'Workflows Error:' $_.Exception.Message }"
echo.
echo === Note ===
echo GitHub Actions free tier: 2000 min/month for private repos, unlimited for public
echo Your repo is PUBLIC, so Actions is already FREE!
echo Check usage at: https://github.com/settings/billing
echo DONE
