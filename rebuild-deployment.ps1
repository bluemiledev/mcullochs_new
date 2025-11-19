# PowerShell script to rebuild and create deployment.zip
$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Rebuilding Application & Creating Zip" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clean old build
Write-Host "[1/4] Cleaning old build..." -ForegroundColor Yellow
if (Test-Path "build") {
    Remove-Item -Path "build" -Recurse -Force
    Write-Host "OK: Old build removed" -ForegroundColor Green
}
Write-Host ""

# Step 2: Build application
Write-Host "[2/4] Building React application..." -ForegroundColor Yellow
Write-Host "This may take 1-2 minutes..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Build completed!" -ForegroundColor Green
Write-Host ""

# Step 3: Verify build
Write-Host "[3/4] Verifying build..." -ForegroundColor Yellow
if (-not (Test-Path "build\index.html")) {
    Write-Host "ERROR: Build verification failed - index.html not found" -ForegroundColor Red
    exit 1
}
$buildFiles = (Get-ChildItem -Path "build" -Recurse -File).Count
Write-Host "OK: Build verified - Found $buildFiles files" -ForegroundColor Green
Write-Host ""

# Step 4: Create deployment zip
Write-Host "[4/4] Creating deployment.zip..." -ForegroundColor Yellow
node create-deployment-zip.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create zip!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT PACKAGE READY!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

if (Test-Path "deployment.zip") {
    $file = Get-Item "deployment.zip"
    $sizeMB = [math]::Round($file.Length / 1MB, 2)
    Write-Host "File: deployment.zip" -ForegroundColor White
    Write-Host "Size: $sizeMB MB" -ForegroundColor White
    Write-Host "Location: $($file.FullName)" -ForegroundColor White
    Write-Host "Modified: $($file.LastWriteTime)" -ForegroundColor White
    Write-Host ""
    Write-Host "Ready for deployment!" -ForegroundColor Green
} else {
    Write-Host "ERROR: deployment.zip not found!" -ForegroundColor Red
    exit 1
}

