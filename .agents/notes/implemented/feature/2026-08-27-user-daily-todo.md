# Agent Note: User daily todo list

Status: implemented

English | [中文](2026-08-27-user-daily-todo.zh.md)

## Problem

The harness had no place for the human user's own tasks. Every existing task-like surface belongs to the agent or to one session: `todo_write` is the model's working list (whole-list snapshots appended to the session log, `packages/todo/tool-todo`), goals are per-session model-visible state (`packages/goal/*`), jobs are process-local runtime records (`packages/jobs/*`), and plan mode and workflow runs are session-scoped as well. A user who wants to note "what I need to get done today" — and optionally tie a note to the project it concerns — had nowhere durable to put it.

## Decision

One host package and one client package own the feature end to end, following the message-feedback template:

| Piece | Name | Notes |
| --- | --- | --- |
| Host package | `packages/todo/user-todo` (`@deepseek-ai/dsh-user-todo`) | owns the domain, the service, the Remote namespace |
| Client package | `packages/client/ui-user-todo` (`@deepseek-ai/dsh-client-ui-user-todo`) | trigger button + panel, `platform: 'web'` |
| Storage domain | `user_todo` (`version: 0`) | zod-validated records via `ctx.storageDomain` |
| Wire namespace | `userTodos` | Typert Remote: `list` / `put` / `toggle` / `delete` |
| Push event | `user-todo/changed` | one entry in `API_REMOTE_FORWARDED_EVENTS`; loaded lists refetch on it and on `connection/reset` |
| UI seats | `shell.overlay` occupant: a right-edge always-visible tab plus a right-side drawer | no changes to ui-sidebar or ui-layout |

An item carries a required non-blank title, an optional note, `done` with `completedAt` present exactly when true, an optional workspace link, and an optional session link inside that workspace. A put with no `id` creates; a put with an `id` patches, where unspecified fields keep their value and an explicit `null` clears. Clearing the workspace link cascades the session link off. Session links validate at write time against the workspace registry — the named session must sit in the linked workspace's accounted sessions — and every rejection is an explicit business failure, never a throw. Every material change emits `user-todo/changed` with no arguments.

The list is user-facing only: the model never sees it. Nothing enters a session log, and no tool exists for it; model visibility stays a separately scoped future decision because it would trigger the model-visible ⟺ logged rule plus both SDK projections. Day semantics live entirely in the client: the Host stores a flat set with no per-day bookkeeping, the panel derives "today" as open items plus items completed today, local day bucketing is a pure function of the browser's clock, and open items carry over from their creation day while completed items stay on their completion day.

Rows link to a workspace and one of its accounted sessions: the panel offers both pickers, revalidates membership through the Host on every put, and grows an open affordance once a session is linked; a collapsible section surfaces earlier completions, dated by their local completion day. The web lane covers the surface through the assembled app:The keyless headless snapshot `apps/cli/tests/user-todo.snapshot.ts` pins the projection through a real composition: with `modelVisible: true` the first step publishes the catalog (lines, project title, due), an unchanged step publishes nothing, completing an item publishes the `catalog-update` replacement; with the flag off no catalog ever appears. The web lane covers the surface through the assembled app: `apps/web/tests/user-todo-panel.e2e.ts` adds an item, completes it, verifies both survive a full page reload, converges a second window through the pushed `user-todo/changed` event, and pins the open-panel snapshot (`snapshots/user-todo-panel/panel.expected.md`). Unit suites pin the service behavior over the real storage stack (`packages/todo/user-todo/tests/user-todo.spec.ts`, restart durability and link rejections included) and the parameterized day bucketing — midnight crossing, time-zone offsets, multi-day process lifetime (`packages/client/ui-user-todo/tests/day.client.spec.ts`).

## Alternatives considered

- **Reuse the agent todo surface (`todo_write`).** Lost: it is model-visible session-log state — wrong ownership, wrong durability semantics (whole-list replacement per session), and it would leak user notes into model context.
- **Store items in the settings document.** Lost: `ctx.settings` is the user-editable *configuration* seam (one namespace per owning plugin); task rows are data, and writing them would pollute the user's versioned config backup.
- **Append items to the session log.** Lost: the model-visible ⟺ logged rule reserves the log for what reaches model requests; a cross-session user list is "not any single session's fact" — the canonical storage-domain case (the workspace precedent).
- **Hand-written BFF domain (`todo.*` RPC map).** Lost: the shape is a plain CRUD domain; the generated Typert Remote path carries the least boilerplate and has a complete template in message-feedback.
- **`conversation.input.dock` placement.** Lost: that seat is session-scoped; a daily list is cross-session by definition.
- **`settings.section` placement.** Lost: the settings surface is for configuration, not task data.
- **Day-isolated lists without carry-over.** Lost: forces the user to rebuild the list every morning, contradicting the point of the feature.
- **Linking jobs or workflow runs.** Lost: jobs are process-local (never persisted) and workflow runs are session-bound — neither is a stable referent for a durable link.
- **Model visibility in v0.** Deferred rather than rejected: it requires session events plus TypeScript and Python SDK projection updates, a separate change of its own.

## Consequences

- Configuring nothing is the point: the panel works on first boot with zero composition, and items persist across host restarts through the domain's JSON backend.
- The host stores no day state, so midnight and time-zone correctness concentrate in one pure client function rather than in durable bookkeeping.
- A session link survives the linked session's deletion (ids only, no lifecycle fence), mirroring the workspace registry's own accounting; a future cleanup sweep would be a host-side change.
- Multi-window convergence costs one allowlist entry and a refetch convention — no delta protocol, no polling.
- The session picker and the earlier-completed history shipped in the same iteration as the panel because both read state the client already holds (the workspaces kit and the durable list); neither needed a wire or schema change.
- All three deferred surfaces shipped in the follow-up iterations: note editing (pure client), reminders (a `dueAt` field plus a mount-scoped notification watcher), and model visibility (the `modelVisible` deployment flag projecting the open items as a full-replacement pre-step catalog, with an explicit empty replacement once published — never silence).

## Risks

- **Copy-level naming collision.** Package and namespace names are fixed (`user-todo`/`userTodos`), but UI copy could still blur the two todo surfaces. Mitigation: locale copy always says “今日待办” for the user list; this note records the distinction.
- **Push consistency.** A missing allowlist entry or subscription makes multi-window state silently diverge. Mitigation: the dual-window-class convergence check rides the reload leg of the journey, and the event is emitted from one place in the service write path.
- **Gate checklist omissions.** A new client package touches many registration points; missing one turns a gate red. Mitigation: the checklist ran as its own step (tsconfig references, bundle patch rows, web-app dependencies, regenerated catalogs, verify-script entries).
- **Local verification gap.** This Windows host's web snapshot lane has a pre-existing seed-fixture backslash failure (batch runs fail broadly); the new journey verifies locally via single-file filters, with Linux CI as the real signal.
- **Date-boundary bookkeeping.** Local-time day derivation across midnight and long-lived processes is a boundary-bug habitat. Mitigation: pure function plus parameterized tests as above.
