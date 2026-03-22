# MC Control Panel is Live Now!

## [1.0.0] - 2026-03-22

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
