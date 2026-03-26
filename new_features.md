| Status | Feature | Notes |
| --- | --- | --- |
| [X] | Initial setup wizard | First-run bootstrap for the owner account is implemented. |
| [X] | Login and session handling | Login, logout, `me`, and auth-state endpoints are implemented. |
| [X] | Password reset by email | Email-based reset request and activation flow are implemented when SMTP is configured. |
| [X] | Recovery-key login | One-time recovery keys can be used for account access recovery. |
| [X] | Console history and command sending | Console history retrieval, clear action, and command execution are implemented. |
| [X] | Server properties editor | `server.properties` is exposed as structured editable fields. |
| [X] | EULA acceptance flow | The panel can read, update, and enforce `eula.txt` acceptance before start. |
| [X] | Plugin management | List, install, and remove plugin workflows are implemented. |
| [X] | Mod management | List, install, and remove mod workflows are implemented. |
| [X] | Drag-and-drop uploads | File/addon drag-and-drop upload handling exists in the client. |
| [X] | Icon picker modal | Install/import flows include selectable or uploaded server icons. |
| [X] | Static client serving from server | The backend serves the built frontend distribution for production usage. |
| [X] | Scheduled jobs API | Interval-based job scheduling and tracked job runs are implemented on the backend. |
| [X] | Notifications API | In-app notification records and preference APIs are implemented on the backend. |
| [X] | Audit events API | Structured audit events can now be queried through dedicated backend routes. |
| [X] | Metrics collection API | Node/server metric samples are collected and exposed through backend routes. |
| [X] | Bulk server actions | Batch start/stop/restart/update/backup actions are exposed through backend APIs. |
| [X] | API tokens | Personal bearer token creation, listing, revocation, and authentication are implemented. |
| [X] | Two-factor authentication | Authenticator-app 2FA is implemented with QR code/manual setup and login verification by 6-digit code. |
| [X] | Backup browser | Backup history, download, restore, and scheduled-job management are now available in a dedicated client view. |
| [X] | Notification center | An in-app notification inbox and preference screen are now available in the client; outbound email/webhook delivery remains pending. |
| [X] | Multi-node orchestration | Basic multi-node support is implemented with a built-in local node, remote agent node registration, connectivity testing, per-server node placement, and node-aware runtime actions. |
