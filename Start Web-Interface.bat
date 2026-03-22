@echo off
setlocal
set "ROOT_DIR=%~dp0"
set "WEB_DIR=%ROOT_DIR%Web-interface"
set "PANEL_HOST=127.0.0.1"
set "PANEL_PORT=4200"
set "PANEL_URL=http://%PANEL_HOST%:%PANEL_PORT%"
set "NO_COLOR=1"
set "FORCE_COLOR=0"
set "npm_config_color=false"

net session >nul 2>&1
if %errorlevel%==0 (
  echo [ERROR] Do not run this panel as Administrator.
  echo Please close this window and run start.bat from a normal user terminal.
  pause
  exit /b 1
)

if not exist "%WEB_DIR%\package.json" (
  echo [ERROR] Web-interface\package.json not found.
  echo Make sure this file is placed in the project root next to Web-interface\ and Server\.
  pause
  exit /b 1
)

if not exist "%WEB_DIR%\node_modules" (
  echo [INFO] node_modules not found. Running npm install...
  pushd "%WEB_DIR%"
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

echo [INFO] Checking if port %PANEL_PORT% is already in use...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conn = Get-NetTCPConnection -State Listen -LocalPort %PANEL_PORT% -ErrorAction SilentlyContinue | Select-Object -First 1;" ^
  "if (-not $conn) { exit 0 }" ^
  "$p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue;" ^
  "if ($p -and $p.ProcessName -ieq 'node') {" ^
  "  Write-Host ('[INFO] Port %PANEL_PORT% is used by node (PID ' + $p.Id + '). Stopping it...');" ^
  "  Stop-Process -Id $p.Id -Force; Start-Sleep -Milliseconds 700; exit 0" ^
  "} else {" ^
  "  if ($p) { Write-Host ('[ERROR] Port %PANEL_PORT% is in use by ' + $p.ProcessName + ' (PID ' + $p.Id + ').') }" ^
  "  else { Write-Host '[ERROR] Port %PANEL_PORT% is in use by another process.' }" ^
  "  exit 2" ^
  "}"
if errorlevel 2 (
  echo [ERROR] Close the process using port %PANEL_PORT%, then run start.bat again.
  pause
  exit /b 1
)

echo [INFO] Building web panel (client + server)...
pushd "%WEB_DIR%"
call npm run build
if errorlevel 1 (
  echo [ERROR] npm run build failed.
  popd
  pause
  exit /b 1
)
popd

echo [INFO] Starting web panel API/UI on %PANEL_URL% ...
start "Minecraft Web Panel" cmd /k "cd /d ""%WEB_DIR%"" && npm run start"

echo [INFO] Waiting for %PANEL_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddMinutes(3);" ^
  "while((Get-Date) -lt $deadline){" ^
  "  try { $r=Invoke-WebRequest -Uri '%PANEL_URL%' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200){ Start-Process '%PANEL_URL%'; exit 0 } } catch {}" ^
  "  Start-Sleep -Milliseconds 700" ^
  "}" ^
  "Write-Host 'Panel did not become ready in time. You can open %PANEL_URL% manually.'; exit 0"

echo [INFO] Done.
endlocal
