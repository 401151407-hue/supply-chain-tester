@echo off
echo === GitHub Actions Billing ===
powershell -Command "try { $r = Invoke-RestMethod -Uri 'https://api.github.com/users/401151407-hue/settings/billing/actions' -TimeoutSec 10; Write-Host 'Total minutes used:' $r.total_minutes_used; Write-Host 'Total paid minutes:' $r.total_paid_minutes_used; Write-Host 'Included minutes:' $r.included_minutes; Write-Host 'Minutes used breakdown:'; $r.minutes_used_breakdown | Format-List } catch { Write-Host 'API Error:' $_.Exception.Message }"
echo.
echo === Checking with different endpoint ===
powershell -Command "try { $r = Invoke-RestMethod -Uri 'https://api.github.com/users/401151407-hue/settings/billing/shared-storage' -TimeoutSec 10; Write-Host 'Days left in billing cycle:' $r.days_left_in_billing_cycle; Write-Host 'Estimated storage:' $r.estimated_paid_storage_for_month } catch { Write-Host 'Storage error, probably needs auth' }"
echo.
echo === Trying gh auth ===
powershell -Command "gh auth status 2>&1"
echo DONE
