# Deployment

This folder contains self-hosting assets for Windows, macOS, and Linux.

Recommended public setup:

- DuckDNS for dynamic DNS
- Caddy for HTTPS and reverse proxy
- MC Control Panel backend bound to `127.0.0.1:4200`

Typical flow:

1. Install Node.js 20+ and Java 21+
2. Configure `Web-interface/server/.env`
3. Build the app with `npm run build` in `Web-interface`
4. Run the backend as a service
5. Run Caddy in front of it using the provided template
6. Point your DuckDNS hostname to your public IP and forward `80/443` to the host machine
