# Portable Python download & setup script
$ErrorActionPreference = "Stop"
$PythonVersion = "3.11.9"
$PythonZip = "python-$PythonVersion-embed-amd64.zip"
$DownloadUrl = "https://www.python.org/ftp/python/$PythonVersion/$PythonZip"
$TargetDir = Join-Path $PSScriptRoot "..\resources\python-portable"

if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null }
$ZipPath = Join-Path $env:TEMP $PythonZip

Write-Host "=== Portable Python Setup ===" -ForegroundColor Cyan

if (Test-Path (Join-Path $TargetDir "python.exe")) {
    Write-Host "[OK] Python already exists, skip download" -ForegroundColor Green
} else {
    Write-Host "[>>] Downloading Python $PythonVersion embeddable..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing
        Write-Host "[OK] Download complete" -ForegroundColor Green
    } catch {
        Write-Host "[ERR] Download failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "[>>] Extracting..." -ForegroundColor Yellow
    Expand-Archive -Path $ZipPath -DestinationPath $TargetDir -Force
    Remove-Item $ZipPath -Force
    Write-Host "[OK] Extraction complete" -ForegroundColor Green
}

Write-Host "[>>] Configuring pip..." -ForegroundColor Yellow
$PthFile = Get-ChildItem -Path $TargetDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    $PthContent = Get-Content $PthFile.FullName -Raw
    if ($PthContent -match "#import site") {
        $PthContent = $PthContent -replace "#import site", "import site"
        Set-Content -Path $PthFile.FullName -Value $PthContent -NoNewline
        Write-Host "[OK] site-packages enabled" -ForegroundColor Green
    }
}

$GetPipPath = Join-Path $env:TEMP "get-pip.py"
$PipInstalled = Test-Path (Join-Path $TargetDir "Scripts\pip.exe")
if (-not $PipInstalled) {
    Write-Host "[>>] Installing pip..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPipPath -UseBasicParsing
    $PythonExe = Join-Path $TargetDir "python.exe"
    & $PythonExe $GetPipPath --no-warn-script-location
    Remove-Item $GetPipPath -Force
    Write-Host "[OK] pip installed" -ForegroundColor Green
}

Write-Host "[>>] Installing Python packages (requests, openpyxl)..." -ForegroundColor Yellow
$PipExe = Join-Path $TargetDir "Scripts\pip.exe"
& $PipExe install requests openpyxl --no-warn-script-location --quiet

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Path: $TargetDir" -ForegroundColor Green
