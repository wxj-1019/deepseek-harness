# @deepseek-ai/dsh-client-ui-desktop-notify

English | [中文](README.zh.md)

Web desktop-notification feature owner: contributes the General settings row that opts a deployment into a system toast when a task completes, and the completion watcher that fires it. The signal arrives entirely through the `sessions.list` snapshot feed that [`dsh-client-runtime`](../store/README.md) drives from `host/session-status` frames, so this package issues no RPC of its own; the preference lives in the durable `ui-desktop-notify` settings namespace.

A task completion is one session's `running` bit falling true→false between two snapshots. The watcher seeds from the snapshot at start (a session first seen running is watched, never announced) and fires a Web Notification only when the preference is on, the browser permission is granted at show time, and the completed session is not the one being watched on a visible tab — any other placement (another session selected, or the tab hidden behind another window) earns the toast. The notification carries the session's display title, the localized completion line, and the session id as its tag; activating it focuses the window and selects that session. The permission flow stays honest: turning the row on with the permission still `default` asks the browser first and persists only on `granted`, a `denied` permission shows the re-enable hint instead of a toggle that lies, and browsers without the API get an unsupported hint. Copy goes through the package's own `settings.desktopNotify` locale namespace. The behavior is specified by the [Desktop completion notification Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-desktop-completion-notification.md).

## Model Experience

None, as this package renders a human preference and an OS-level notification, touching no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **The completion edge is running→idle, not a turn reason** — the `host/session-status` bit spans pre-step through turn close, so a session that ends its run blocked on approval or aborted by error still reads as "completed" to the toast; per-reason copy would need a client-visible turn-end feed for sessions this tab never opened.
- **One notification per session id per system** — the tag replaces an earlier toast for the same session, and the OS owns sound, grouping, and lifetime; the page cannot clear or recall a toast once shown.
