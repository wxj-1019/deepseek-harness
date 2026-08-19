# Agent Note: Desktop completion notification on the Web surface

Status: implemented

English | [中文](2026-08-19-desktop-completion-notification.zh.md)

Date: 2026-08-19 · Area: `packages/client/ui-desktop-notify`

## Problem

A long-running task finishing in a background tab produced no desktop-level signal: the operator had to keep checking the page to learn a run had completed, and the existing in-page reminders only helped while the tab was watched.

## Decision

A new browser plugin, `dsh-client-ui-desktop-notify`, pops a Web Notification when a task completes. The signal is the client-side running→idle edge: the watcher subscribes to `ctx.sessions.list` (the snapshot feed the `host/session-status` frames already drive for every session, reconnect-safe) and diffs each session's `running` bit itself, seeding from the snapshot at start so a session first seen running is never announced. The trigger is deliberately quiet: the preference must be on, the browser permission must be granted at show time, and the completed session must not be the one currently selected on a visible tab — watching a session work stays silent, every other placement (another session selected, or the tab hidden) toasts. Activating the toast focuses the window and selects the session through `sessions.open`.

The opt-in is one General settings row (`settings.general.item`, the Enter-behavior row pattern) over the durable `ui-desktop-notify` namespace, default off so the OS permission prompt never surprises. The row owns the permission flow: `default` asks the browser first and persists only on `granted`, `denied` shows the re-enable hint, and a missing API shows the unsupported hint. The host half of the same package registers the namespace; nothing about the feature is model-visible, so no session event, no SDK surface, and no agent-loop change exists.

## Alternatives considered

- Extend the sidebar's green `completed` reminder (the manager's `completedNotifications` edge) instead of a new package — rejected: that flag fires once per run, clears on selection, suppresses the watched session entirely, and is presentation state owned by the list projection; an OS integration needs its own edge detector and its own settings namespace, and "everything is a plugin" puts both in a feature package.
- Subscribe to durable `turn/end` events for per-reason copy — rejected for now: `session/event` frames only reach sessions instantiated in this tab, so the any-session toast cannot ride them; the limitation is recorded in the package README.
- An in-page toast stack on `shell.overlay` instead of the OS API — rejected: the requirement is desktop-level awareness while the tab is not being watched; a page toast cannot reach that.

## Consequences

- The watcher is a pure client consumer: no RPC, no session events, no host changes beyond the namespace registration. The firing logic lives in `notifications.ts` as pure functions (edge matrix unit-tested), the runtime in `desktop-notify.ts` (React-free, port-injected for specs), and the row in `NotificationRow.tsx`; the jsdom bench boots the real apply wiring and fires a toast through it.
- The web e2e scenario (`apps/web/tests/desktop-notify.e2e.ts`) owns the assembled settings surface: it stubs a granted Notification API via an init script, flips the row, and pins the durable write plus the golden — zero model calls, so replay stays keyless. The firing path's page-level coverage is the package bench; driving a real completion through the scaffold would need a recorded fixture for no additional contract.
- Every plugin-hygiene surface applies: fiber-dispose HMR safety, locale dictionaries with en/zh parity, the invariant companion, per-file 100% coverage, and the bundle/roster/dependency/tsconfig/knip/README registrations a new client package owes.
