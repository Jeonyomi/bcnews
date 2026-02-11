# Build shared package first
Write-Host "[scod] Building shared package..."
Set-Location packages/shared
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build shared package"
    exit 1
}

# Return to root
Set-Location ../..

# Start API
Write-Host "[scod] Starting API..."
Set-Location apps/api
Start-Process powershell -ArgumentList "-Command npm run dev" -NoNewWindow

# Return to root and start web
Write-Host "[scod] Starting web..."
Set-Location ..
Set-Location web
Start-Process powershell -ArgumentList "-Command npm run dev" -NoNewWindow

Write-Host "[scod] Done. Open http://127.0.0.1:5173"

# Keep script running
while ($true) { Start-Sleep 1 }