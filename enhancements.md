| Status | Enhancement | Notes |
| --- | --- | --- |
| [X] | Multi-server management | Register, rename, delete, and switch between Minecraft servers from one panel. |
| [X] | Role-based access control | `owner`, `admin`, and `viewer` roles are enforced across API routes and UI flows. |
| [X] | Recovery-key authentication flow | Bootstrap, recovery login, recovery-key regeneration, and forced password reset are implemented. |
| [X] | Live runtime status updates | WebSocket-driven console and server status updates are wired into the panel. |
| [X] | Safe server action handling | Start, stop, restart, EULA gate, and action-phase locking are implemented. |
| [X] | File management tools | Browse, read, write, upload, create, move, rename, and delete actions are available. |
| [X] | Config editing and validation | Config files can be edited in-app and validated through the config validation route. |
| [X] | Player administration | List, add, update, whitelist, operator, and remove player flows are implemented. |
| [X] | Server install and import flows | New server installation and folder import are both supported. |
| [X] | Server icon library | Default icons, uploadable icons, and per-server icon assignment are implemented. |
| [X] | Type-aware addons handling | Mods and plugins are automatically separated by server type. |
| [X] | Type-aware version catalog | Server types and version lists are exposed through catalog routes. |
| [X] | Audit logging service | Audit events are now persisted in structured form and exposed through an audit API. |
| [X] | Backup and restore workflow | Manual backup creation, download, and restore APIs are implemented with automatic pre-restore backup creation. |
| [X] | Scheduled tasks and automation | Interval-based scheduled jobs for backup, start, stop, restart, and command execution are implemented. |
| [X] | API and proxy deployment hardening | Proxy-aware bind/public URL and cookie settings are implemented for local, LAN, and reverse-proxy hosting. |
| [X] | Cross-platform self-hosting assets | Windows, macOS, and Linux deployment scripts/templates are included in `deploy/`. |
| [X] | Local node platform foundation | A persistent platform state with built-in `local` node support is implemented as the base for later multi-node support. |
| [X] | TypeScript-only client source cleanup | Legacy duplicated JS client files were removed so the active source matches the Vite + TS setup. |
| [X] | Performance charts and metrics dashboard | A metrics dashboard with server sample summaries and historical tables is now available in the client. |
| [X] | Two-factor authentication | Authenticator-app 2FA is implemented with QR/manual enrollment, code verification, and login challenge support. |
| [X] | In-panel audit log viewer | Audit events can now be filtered and reviewed in a dedicated in-panel audit screen. |
