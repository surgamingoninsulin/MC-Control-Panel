# MC Control Panel

MC Control Panel is a modern web interface for managing Minecraft servers with multi-server support, per-server runtime control, file/config management, and role-based access.

## Highlights

- Multi-server management with case-insensitive unique names
- Initial setup flow and email-based login
- Role system: owner/admin/user
- Password reset by email with temporary password flow
- Per-server start/stop/restart with live console
- Runtime safety guard for start/stop/restart spam:
  - one action at a time per server
  - single-instance lock file in server root to prevent duplicate launches
- Live server status refresh without manual page reload
- Phase-aware controls (`starting`, `online`, `stopping`, `restarting`) with safe button lock behavior
- File manager with config editor modal
- Install/import server flows
- Import copies the selected folder content with preserved internal file tree
- Per-server icon support:
  - optional icon upload during server creation
  - imported/new servers fall back to default `server-icon.png` automatically
- Addon handling by server type:
  - Fabric/Forge/NeoForge => mods
  - Paper/Spigot/Purpur => plugins
  - Vanilla => addons disabled
- Type-aware Minecraft version lists (newest first)
- Console output cleanup removes terminal ANSI artifacts for readable logs
- Font Awesome action icons and refined UI layout

## Routes

- `/setup`
- `/login`
- `/console`
- `/files`
- `/plugins-mods`
- `/settings`
- `/users`

## Run Locally

From `./Web-interface`:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Email Reset (SMTP)

Configure `./Web-interface/server/.env`:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Author

<div style="display:flex;align-items:center;gap:14px;">
  <img src="https://avatars.githubusercontent.com/u/216420701?v=4" alt="SurGamingOnInsulin avatar" width="92" height="92" style="border-radius:50%;border:1px solid #cbd5e1;" />
  <div>
    <strong>SurGamingOnInsulin</strong><br/>
    GitHub: <a href="https://github.com/SurGamingOnInsulin">@SurGamingOnInsulin</a><br/>
    Website: <a href="https://surgamingoninsulin.github.io/surgamingoninsulin">surgamingoninsulin.github.io/surgamingoninsulin</a>
  </div>
</div>

## License

GNU GPL v3. See [LICENSE.md](./LICENSE.md).
