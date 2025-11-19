Write-Host "🚀 Rebuilding application and creating deployment.zip..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Build the application
Write-Host "[1/3] Building React application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host ""

# Step 2: Verify build folder
if (-not (Test-Path "build")) {
    Write-Host "❌ Build folder not found!" -ForegroundColor Red
    exit 1
}
Write-Host "[2/3] Build folder verified" -ForegroundColor Yellow
Write-Host ""

# Step 3: Create deployment zip
Write-Host "[3/3] Creating deployment.zip..." -ForegroundColor Yellow
node create-deployment-zip.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create zip!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "✅ DEPLOYMENT PACKAGE READY!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
if (Test-Path "deployment.zip") {
    $file = Get-Item "deployment.zip"
    $sizeMB = [math]::Round($file.Length / 1MB, 2)
    Write-Host ""
    Write-Host "File: deployment.zip ($sizeMB MB)" -ForegroundColor White
    Write-Host "Location: $($file.FullName)" -ForegroundColor White
    Write-Host "Last Modified: $($file.LastWriteTime)" -ForegroundColor White
}





