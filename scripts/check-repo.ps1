$repo = Invoke-RestMethod -Uri 'https://api.github.com/repos/401151407-hue/supply-chain-tester' -TimeoutSec 10
Write-Host "Repo:" $repo.full_name
Write-Host "Private:" $repo.private
Write-Host "Visibility:" $repo.visibility
Write-Host "Archived:" $repo.archived

# Check if old repo was private - look at existing builds
try {
    $runs = Invoke-RestMethod -Uri 'https://api.github.com/repos/401151407-hue/supply-chain-tester/actions/runs?per_page=3' -TimeoutSec 10
    Write-Host "`nRecent workflow runs:" $runs.total_count
    foreach ($run in $runs.workflow_runs) {
        Write-Host "  - $($run.name) | $($run.status) | $($run.conclusion)"
    }
} catch {
    Write-Host "Cannot fetch runs:" $_.Exception.Message
}
