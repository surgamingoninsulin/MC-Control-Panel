param(
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$WebInterface = Join-Path $ProjectRoot "Web-interface"

try {
  Write-Host "Installing MC Control Panel dependencies..."
  Set-Location $WebInterface

  npm install
  npm run build

  Write-Host "Build completed." -ForegroundColor Green
  Write-Host "Set APP_BIND_HOST=127.0.0.1 and configure Caddy to reverse proxy to port 4200."
  exit 0
}
catch {
  Write-Host "Install failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Tip: confirm Node.js 20+ is installed and npm is in PATH." -ForegroundColor Yellow
  exit 1
}
finally {
  if (-not $NoPause -and [Environment]::UserInteractive) {
    [void](Read-Host "Press Enter to close")
  }
}
