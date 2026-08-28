# @deepseek-ai/dsh-notification-center

English | [中文](README.zh.md)

The in-app notification center: one durable entry per noteworthy host moment in its own [`storage-domain`](../../storage/storage-domain/README.md) domain `notifications`, rendered by the web bell and overlay panel ([`dsh-client-ui-notification-center`](../../client/ui-notification-center/README.md)) through the generated `notifications` Remote namespace. The center is user-facing only — nothing here enters a session log, a model request, or any tool schema.

Collectors run at init from authoritative cordis event surfaces: an agent's running→idle settle becomes a `session-completed` entry, every `approval/decided` becomes an `approval-decided` entry with its outcome, a terminal job becomes a `job-finished` entry with its label and status, and a schedule dispatch (`schedule/change` with `acceptedAt`, present when [`dsh-schedule`](../../schedule/schedule/README.md) is mounted) becomes a `reminder-dispatched` entry. Every append or read-state change emits the allowlisted `notifications/changed` event; loaded surfaces refetch on it and on `connection/reset`.

Verbs: `list` (newest first), `markRead` (idempotent, unknown id fails loud with `notification-not-found`), `markAllRead`, `clearRead` (drops read entries only). Entries never leave the log they came from; the center is a durable index over moments, not a copy of their content.

## Configuration

The service takes no composition config: the collector set is fixed and every source speaks in its own event.

## Model Experience

None, as the domain is user-owned application data that never reaches a request assembly; the model never sees notifications and the projection vocabulary gains no member.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Settle entries are per settle transition** — a multi-turn task produces one entry per running→idle flip; collapsing bursts into one entry per task is deferred.
- **Reminder entries carry the schedule id, not its prompt** — dispatch records own only the id, so a durable link into the schedule fold would be a schedule-package change.
- **Approval entries carry the outcome JSON, not the tool arguments** — the asked event's payload fields beyond toolName are not projected into the entry.
- **No cross-process visibility** — the domain is process-local like every storage domain today.
