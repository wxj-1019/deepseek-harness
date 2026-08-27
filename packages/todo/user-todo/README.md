# @deepseek-ai/dsh-user-todo

English | [中文](README.zh.md)

The user's daily todo list: one flat durable set of task items in its own [`storage-domain`](../../storage/storage-domain/README.md) `user_todo`, edited from the web sidebar-foot panel ([`dsh-client-ui-user-todo`](../../client/ui-user-todo/README.md)) through the generated `userTodos` Remote namespace. The list is user-facing only — nothing here enters a session log, a model request, or any tool schema.

One item carries a required non-blank title, an optional note, `done` with its `completedAt` stamp (present exactly when `done` is true), an optional linked workspace, and an optional linked session inside that workspace. An explicit `null` on a put clears a note or link; unspecified fields keep their value. Clearing the workspace link cascades to the session link, because a session link cannot dangle without its parent project. Every material change emits the `user-todo/changed` event (allowlisted to browser clients), and consumers refetch rather than replay deltas.

Day semantics live entirely in the client: the Host stores no per-day bookkeeping, so "today" always follows the viewing browser's clock. Open items carry over from whichever day they were created, and completed items stay on their completion day. Session links are validated at write time against the [workspace registry](../../workspace/workspace/README.md) — the named session must sit in the linked workspace's accounted sessions — and a stale id is rejected loudly instead of stored.

## Configuration

The service takes no composition config: nothing about the list is deployment-varying.

## Model Experience

### User-todos catalog projection

#### What the model sees

A persistent `user/message` catalog on every live agent's pre-step, published full-replacement style exactly like the skill catalog (first publication frames the list; changes replace it; emptying a published list publishes an explicit empty replacement), and logged as the message itself so the projection stays reconstructable from the session log. With `modelVisible` off nothing is registered. The catalog is a `<system-reminder>` block whose `<user_todos>` body lists one line per open item in creation order — `- [ ] Title (note: ...) (due: YYYY-MM-DD HH:mm UTC, OVERDUE) (project: Workspace)` — followed by guidance to treat the list as user-owned standing context and never modify it. Closed items, completion stamps, and session ids are not projected.

#### Token effect

Roughly one line per open item plus fixed framing, paid only on turns where the list changed (digest-gated: an unchanged list contributes nothing). Long notes are the main size driver.

#### KV Cache effect

The catalog rides a persistent user message, so it extends the conversation prefix when it changes and splits cache identity at that turn; unchanged turns add nothing to the prefix.

## Known Limitations and Deferred Work

- **No compare-and-set** — single-user edits race only with themselves across devices; a lost multi-window race converges on the next refetch rather than surfacing a conflict.
- **Session links are not lifecycle-fenced** — deleting a linked session leaves the reference in place, mirroring how the workspace registry keeps sessions it cannot revalidate.
- **History is a client concern** — earlier completions are durable and surfaced by the web panel's history section; a CLI or other surface would own its own projection.
- **The projection is deployment-wide and digest-baseline** — when enabled it reaches every agent, and the comparison baseline is the last logged catalog (compaction shadowing of an older catalog is not detected; the replacement republishes). Reminders themselves are a client-side watcher: they fire only while a browser window holding the panel mount is open and the site already holds notification permission.
