# MC Control Panel Changelog

## [2.0.0] - 2026-03-26

### Added

- Proxy-aware deployment configuration for self-hosted local, LAN, and reverse-proxy setups:
  - `APP_BIND_HOST`
  - `APP_BIND_PORT`
  - `APP_PUBLIC_URL`
  - `APP_TRUST_PROXY`
  - `COOKIE_SECURE`
  - `COOKIE_SAME_SITE`
- Startup validation for:
  - Node.js version
  - Java availability
  - writable data/server directories
  - public URL sanity checks
- Persistent platform state model for:
  - nodes
  - backup records
  - scheduled jobs
  - job runs
  - notifications
  - notification preferences
  - audit events
  - metrics samples
  - API tokens
  - bulk action groups
- Built-in `local` node foundation for future multi-node support
- Basic multi-node orchestration support with:
  - built-in local node
  - remote agent node registration
  - node connectivity testing
  - per-server node placement
  - node-aware runtime action routing
- Manual backup workflow:
  - create backup
  - download backup
  - restore backup
  - automatic pre-restore backup creation
- Scheduled job backend with tracked job runs for:
  - backup
  - start
  - stop
  - restart
  - custom command
- Metrics collection backend for node/server samples
- Notification storage and preference APIs
- Audit event query API with structured persisted audit records
- Personal API token support with:
  - hashed storage
  - bearer authentication
  - revocation
  - last-used tracking
- Authenticator-app 2FA with:
  - QR code enrollment
  - manual setup secret
  - 6-digit login challenge verification
  - enable/disable management in the client
- Bulk server action API for:
  - start
  - stop
  - restart
  - update
  - backup
- Dedicated client views for:
  - backups and restore browser
  - scheduled jobs
  - notification inbox/preferences
  - metrics dashboard
  - audit event viewer
- Cross-platform self-hosting assets in `deploy/`:
  - DuckDNS/Caddy template
  - Windows install script and service template
  - macOS install script and `launchd` plist
  - Linux install script and `systemd` unit

### Changed

- Authentication middleware now supports both session-cookie auth and bearer token auth
- Audit logging now writes both append-only log rows and structured platform audit events
- Server records now include:
  - `nodeId`
  - `runtimeMode`
- Production/self-hosting documentation now reflects DuckDNS/Caddy and cross-platform deployment support
- README, features, and enhancements docs were refreshed to reflect the new backend platform foundation
- The client navigation now includes dedicated views for backups/jobs, notifications, metrics, and audit events
- The server management view now includes node registration and server placement controls

### Fixed

- TypeScript client configuration now uses `noEmit`, preventing generated legacy `.js` files from reappearing inside `client/src`
- Cookie handling is now configurable for reverse-proxy and HTTPS deployments

### Notes

- This `v2.0.0` release establishes the backend/platform foundation for larger roadmap work.
- Docker runtime support is still pending.
- Multi-node support is now available for agent registration and runtime orchestration; broader distributed file/backup coverage can be expanded further.

## [1.1.1] - 2026-03-22

### Added

- Full multi-server management with server-aware runtime state and APIs
- Setup/login flow with owner bootstrap and role-based access control
- Password reset by email with temporary password flow and forced password change modal
- Server install and server import modals
- Monaco-based config editor modal
- Modern file manager actions (create file/folder, delete selected, navigation)
- Users table and add-user modal
- Global drag-and-drop upload overlay for files and addons
- Login support for `Enter` key submit and optional remembered credentials
- Font Awesome icon pass for core action buttons
- Per-server icon system:
  - optional icon upload in create/install flow
  - server list icon rendering
  - default `server-icon.png` fallback for new/imported servers

### Changed

- Navigation path support:
  - `/setup`
  - `/login`
  - `/console`
  - `/files`
  - `/plugins-mods`
  - `/settings`
  - `/users`
- Menu/sidebar layout and spacing refinements (wider server column, cleaner controls)
- Console controls now clear console history on start/stop/restart and reload fresh output
- Addon handling now follows selected server type strictly:
  - Fabric/Forge/NeoForge => mods only
  - Paper/Spigot/Purpur => plugins only
  - Vanilla => addons disabled
- Server folder layout normalized by type (plugins/mods folder enforcement)
- Version catalogs now type-aware and ordered newest to oldest
- Installer output jars now include selected Minecraft version in file name when missing
- Runtime status now includes server phase (`offline`, `starting`, `online`, `stopping`, `restarting`)
- Start/Stop/Restart controls now enforce phase-safe availability:
  - start disabled while starting/online/stopping/restarting
  - stop/restart enabled only when fully online
- Disabled buttons now have explicit visual styling (dimmed/no hover/pointer blocked)
- Server status now auto-refreshes in the interface without manual page reload

### Fixed

- `serverId is required` failures in legacy calls
- Import pipeline now preserves selected folder file tree reliably (all nested files/folders represented by uploaded entries)
- Email login validation and reset-flow reliability issues
- Repeated reset requests rotating temp password too quickly (guarded)
- Forge legacy `1.7.10` installer resolution (metadata-based artifact version fallback)
- Import path preservation so full directory structures are kept
- Audit log crash when target path folder did not exist
- Mod jar skip behavior on modded servers (all jars are now treated as mods there)
- Duplicate server launch race conditions during rapid start/stop/restart clicks:
  - added per-server action-in-progress guard
  - added per-server runtime lock file to prevent multiple active instances on same server root
  - improved API errors for server control routes (clear `400` messages)
- Console formatting artifacts from ANSI terminal color codes now stripped from displayed log lines

### Docs/Project

- Root-level docs consolidated: `README.md`, `CHANGELOG.md`, `LICENSE.md`
- Root `.gitignore` added for Node/build/secrets and server content excludes
