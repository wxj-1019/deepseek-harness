# Agent Note: In-app notification center and the mounted schedule

Status: implemented

English | [中文](2026-08-28-notification-center.zh.md)

## Problem

Two unrelated gaps shared one round. First, the web app had no in-app notification history: desktop-notify fires transient OS toasts, but a user who missed one had nowhere to look; approvals, finished jobs, and schedule dispatches passed without any durable record. Second, `@deepseek-ai/dsh-schedule` shipped complete (durable reminders, three management tools, dispatch lifecycle) yet was mounted in no shipped composition — only an opt-in example overlay existed, so the capability was dead code for every shipped surface.

## Decision

**Notification center.** A new host package `@deepseek-ai/dsh-notification-center` owns a `notifications` storage domain (entries keyed by id: kind, title, detail, sessionId, createdAt, readAt) and a Typert Remote namespace `notifications` (`list` / `markRead` / `markAllRead` / `clearRead`). Collectors register at init on authoritative surfaces only: `agent/status` running→idle transitions become `session-completed` entries; every `approval/decided` becomes an `approval-decided` entry; a terminal job becomes a `job-finished` entry; a schedule dispatch becomes a `reminder-dispatched` entry. Every change emits the allowlisted `notifications/changed` event. The client package `@deepseek-ai/dsh-client-ui-notification-center` renders the bell in `sidebar.footer.action` (unread badge) and the panel as the first occupant of `shell.overlay` — the frame-wide floating layer designed for exactly this — with one shared controller so bell and panel agree on open state and content.

**Schedule mounting.** The shipped web bundle now composes `@deepseek-ai/dsh-time-context` and `@deepseek-ai/dsh-schedule` — the two rows of the official Schedule Web overlay — so durable reminders (`schedule_create` / `schedule_list` / `schedule_delete`) are live on web root agents. Its dispatch events feed the notification center for free through the shared `session/event` surface.

The keyless web journey `apps/web/tests/notification-center.e2e.ts` drives a replayed turn whose settle lands as an unread entry, pins the open panel, and marks it read; unit suites pin the collectors and verbs (`packages/interaction/notification-center/tests/notification-center.spec.ts`, restart durability included). Schedule's mounting is evidenced by the roster probe (schedule tools present on a fresh root agent) and its own package's suite.

## Alternatives considered

- **A session-log projection instead of a storage domain.** Lost: notifications are cross-session user state, "not any single session's fact" — the canonical storage-domain case (the workspace precedent).
- **Deriving the center from session-query at render time.** Lost: query is opt-in and content-shaped; the center needs a durable, read-state-carrying index written at the moment things happen, not a search.
- **Desktop-toast history inside desktop-notify.** Lost: that package owns the OS notification decision (focus + permission); mixing a durable inbox into it would split the seam.
- **Mounting schedule in the base bundle.** Lost: schedule installs on root agents and time-context feeds web-local zone interpretation; the shipped target is the web surface — CLI/headless can opt in through their own profiles, matching the overlay's intent.

## Consequences

- The web app finally has an in-app notification history; shell.overlay gains its first occupant and a worked example for future frame-wide surfaces.
- Schedule went from dead code to a shipped capability: durable reminders are reachable in every web session.
- The notification entry set is fixed at four kinds; a new source adds one collector, one kind, one locale label.
- Multi-settle tasks produce one entry per settle gap — acceptable for v0, documented as the known burst shape.

## Risks

- **Collector noise.** A running→idle flip per settle can spam; the badge and panel absorb it, and burst collapsing is the documented follow-up.
- **Cross-surface divergence on reload.** Without the allowlisted push, a reloaded window would show a cold empty center while entries exist; the bell loads at mount and every pushed change refetches.
- **Reminder entries are id-shaped.** The schedule dispatch record carries only the id, so the center cannot render the reminder's prompt — a schedule-package change is the honest fix, deferred.
