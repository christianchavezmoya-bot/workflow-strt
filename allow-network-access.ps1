# PowerShell script to allow Commtrac app ports through Windows Firewall
# Run this script as Administrator

$frontendPort = 5173
$backendPort = 4000
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object InterfaceMetric, SkipAsSource |
    Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $lanIp) {
    $lanIp = '<this-pc-lan-ip>'
}

Write-Host 'Configuring Windows Firewall for Commtrac app...' -ForegroundColor Cyan

# Allow Vite dev server (port 5173)
Write-Host "Adding firewall rule for Vite dev server (port $frontendPort)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName 'Commtrac Vite Dev Server' `
    -Direction Inbound `
    -LocalPort $frontendPort `
    -Protocol TCP `
    -Action Allow `
    -Profile Private,Public,Domain `
    -ErrorAction SilentlyContinue | Out-Null

# Allow .NET API server (port 4000)
Write-Host "Adding firewall rule for .NET API server (port $backendPort)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName 'Commtrac API Server' `
    -Direction Inbound `
    -LocalPort $backendPort `
    -Protocol TCP `
    -Action Allow `
    -Profile Private,Public,Domain `
    -ErrorAction SilentlyContinue | Out-Null

Write-Host ''
Write-Host 'Firewall rules added successfully.' -ForegroundColor Green
Write-Host ''
Write-Host 'Your app should now be accessible from other devices on the network at:' -ForegroundColor Cyan
Write-Host "  Frontend: http://${lanIp}:$frontendPort" -ForegroundColor White
Write-Host "  Backend:  http://${lanIp}:$backendPort" -ForegroundColor White
Write-Host ''
Write-Host 'Note: Make sure both servers are running.' -ForegroundColor Yellow