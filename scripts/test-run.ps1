param([string]$Env = "DEV")

$py = (Resolve-Path "$PSScriptRoot\..\resources\python-portable\python.exe").Path
$scriptsDir = (Resolve-Path "$PSScriptRoot\..\scripts").Path
$file = Get-ChildItem $scriptsDir -Recurse -Filter '测试专用2.py' | Where-Object { -not $_.FullName.Contains('副本') } | Select-Object -First 1 -ExpandProperty FullName

$preamble = @"
import sys
sys.path.insert(0, r'$scriptsDir')
current_env = '$Env'
exec(open(r'$file', encoding='utf-8').read())
"@

Write-Host "Env: $Env | Script: $file"
Write-Host "---"
& $py -u -c $preamble
