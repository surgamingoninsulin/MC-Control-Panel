# MC Control Panel

MC Control Panel is a web-based Minecraft server manager with multi-server support, live runtime controls, file/config tooling, addon handling, and role-based user access.

## Highlights

- Multi-server registry with install, import, rename, delete, and per-server selection
- Role-aware authentication with bootstrap setup, recovery keys, and optional SMTP reset flow
- Proxy-aware deployment config for local, LAN, or DuckDNS/Caddy-hosted access
- Live console streaming and status updates through WebSockets
- Safe runtime controls for start, stop, restart, EULA handling, and action-phase locking
- File browser with upload, move, rename, delete, and built-in config editor support
- Player administration with whitelist and operator management
- Platform services for backups, jobs, notifications, metrics, audit events, API tokens, nodes, and bulk actions
- Basic multi-node support with local/agent nodes, node registration/testing, and per-server node placement
- Authenticator-app 2FA with QR-code/manual setup and login code verification
- Manual backup/download/restore support with automatic pre-restore backup creation
- Interval-based scheduled jobs for backups, runtime actions, and custom commands
- Dedicated client views for backups/jobs, notifications, metrics, and audit events
- Addon handling for plugins and mods based on server type
- Server icon library with default and custom icon selection
- Type-aware Minecraft version catalog for supported server installers
- Cross-platform self-hosting assets for Windows, macOS, and Linux with DuckDNS/Caddy-ready deployment templates
- Shared workspace setup with Vite client + TypeScript server/client sources

## Project Structure

```text
.
|-- CHANGELOG.md
|-- deploy/
|-- enhancements.md
|-- new_features.md
|-- README.md
|-- Servers/
`-- Web-interface/
    |-- client/
    |   |-- public/
    |   `-- src/
    |-- data/
    `-- server/
        `-- src/
```

## Docs

- [enhancements.md](./enhancements.md) tracks implemented and planned enhancements in table form.
- [new_features.md](./new_features.md) tracks implemented and planned product features in table form.
- [deploy/README.md](./deploy/README.md) contains the new self-hosting assets for Windows, macOS, and Linux with DuckDNS/Caddy templates.
- [CHANGELOG.md](./CHANGELOG.md) contains the release history including the new `v2.0.0` platform update.

## Main Routes

- `/setup`
- `/login`
- `/console`
- `/files`
- `/plugins-mods`
- `/server-management`
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

The root workspace starts both the client and server in development mode.

## Email Reset (SMTP)

Configure `Web-interface/server/.env` using `Web-interface/server/.env.example`:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Notes

- The client source is now clean TypeScript-only in `Web-interface/client/src`; legacy duplicate `.js` files were removed.
- Production serving is handled by the Express server after the client is built.
- The current `v2.0.0` foundation adds both backend APIs and client views for backups/jobs, notifications, metrics, audit events, authenticator-app 2FA, and basic multi-node agent support.
- Multi-node support currently covers node registration, node testing, per-server placement, and node-aware runtime actions; deeper distributed file/backup orchestration can still be expanded later.

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
