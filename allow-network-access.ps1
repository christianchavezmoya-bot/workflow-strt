# PowerShell script to allow Commtrac app ports through Windows Firewall
# Run this script as Administrator

Write-Host "Configuring Windows Firewall for Commtrac app..." -ForegroundColor Cyan

# Allow Vite dev server (port 5173)
Write-Host "Adding firewall rule for Vite dev server (port 5173)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "Commtrac Vite Dev Server" `
    -Direction Inbound `
    -LocalPort 5173 `
    -Protocol TCP `
    -Action Allow `
    -Profile Private,Domain `
    -ErrorAction SilentlyContinue

# Allow .NET API server (port 4000)
Write-Host "Adding firewall rule for .NET API server (port 4000)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "Commtrac API Server" `
    -Direction Inbound `
    -LocalPort 4000 `
    -Protocol TCP `
    -Action Allow `
    -Profile Private,Domain `
    -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Firewall rules added successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Your app should now be accessible from other devices on the network at:" -ForegroundColor Cyan
Write-Host "  Frontend: http://10.7.15.52:5173" -ForegroundColor White
Write-Host "  Backend:  http://10.7.15.52:4000" -ForegroundColor White
Write-Host ""
Write-Host "Note: Make sure both servers are running!" -ForegroundColor Yellow
