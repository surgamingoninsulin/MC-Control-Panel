$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$WebInterface = Join-Path $ProjectRoot "Web-interface"

Write-Host "Installing MC Control Panel dependencies..."
Set-Location $WebInterface
npm install
npm run build

Write-Host "Build completed."
Write-Host "Set APP_BIND_HOST=127.0.0.1 and configure Caddy to reverse proxy to port 4200."
