# Windows Service + Caddy Setup

This guide runs MC Control Panel backend as a Windows service and places Caddy in front for HTTPS.

## 1) Prerequisites

- Node.js 20+
- Java 21+
- Administrator PowerShell
- A DNS name (for example `yourname.duckdns.org`) pointing to this Windows machine
- Router port-forwarding for TCP `80` and `443` to this machine

## 2) Build the panel

From project root:

```powershell
.\deploy\windows\install-panel.ps1
```

## 3) Configure environment

Create server env file from the example:

```powershell
Copy-Item .\Web-interface\server\.env.example .\Web-interface\server\.env
```

Edit `Web-interface\server\.env` and set:

- `APP_BIND_HOST=127.0.0.1`
- `APP_BIND_PORT=4200`
- `APP_PUBLIC_URL=https://<your-domain>`
- `APP_TRUST_PROXY=true`
- `COOKIE_SECURE=true`

## 4) Install backend service (WinSW)

1. Download WinSW executable from the WinSW releases page.
2. Put it in `deploy\windows\` and rename it to:
   - `mc-control-panel-service.exe`
3. Keep this file next to it:
   - `mc-control-panel-service.xml`

Then install/start service as Administrator:

```powershell
Set-Location .\deploy\windows
.\mc-control-panel-service.exe install
.\mc-control-panel-service.exe start
```

Service logs are written beside the exe/xml in `deploy\windows`.

## 5) Install and configure Caddy

Install Caddy (example using winget):

```powershell
winget install CaddyServer.Caddy
```

Create local Caddy config from template:

```powershell
Copy-Item .\deploy\Caddyfile C:\Caddy\Caddyfile
```

Edit `C:\Caddy\Caddyfile` and replace `{$DOMAIN}` with your real domain.

Test config:

```powershell
caddy validate --config C:\Caddy\Caddyfile
```

Run once in foreground to verify:

```powershell
caddy run --config C:\Caddy\Caddyfile
```

Install Caddy as a Windows service:

```powershell
caddy service install --config C:\Caddy\Caddyfile
caddy service start
```

## 6) Firewall check (if needed)

```powershell
netsh advfirewall firewall add rule name="Caddy HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Caddy HTTPS" dir=in action=allow protocol=TCP localport=443
```

## 7) Verify

- Local backend: `http://127.0.0.1:4200`
- Public URL: `https://<your-domain>`

If backend config changes, restart the backend service:

```powershell
Set-Location .\deploy\windows
.\mc-control-panel-service.exe restart
```
