# @deepseek-ai/dsh-user-todo

English | [中文](README.zh.md)

The user's daily todo list: one flat durable set of task items in its own [`storage-domain`](../../storage/storage-domain/README.md) `user_todo`, edited from the web sidebar-foot panel ([`dsh-client-ui-user-todo`](../../client/ui-user-todo/README.md)) through the generated `userTodos` Remote namespace. The list is user-facing only — nothing here enters a session log, a model request, or any tool schema.

One item carries a required non-blank title, an optional note, `done` with its `completedAt` stamp (present exactly when `done` is true), an optional linked workspace, and an optional linked session inside that workspace. An explicit `null` on a put clears a note or link; unspecified fields keep their value. Clearing the workspace link cascades to the session link, because a session link cannot dangle without its parent project. Every material change emits the `user-todo/changed` event (allowlisted to browser clients), and consumers refetch rather than replay deltas.

Day semantics live entirely in the client: the Host stores no per-day bookkeeping, so "today" always follows the viewing browser's clock. Open items carry over from whichever day they were created, and completed items stay on their completion day. Session links are validated at write time against the [workspace registry](../../workspace/workspace/README.md) — the named session must sit in the linked workspace's accounted sessions — and a stale id is rejected loudly instead of stored.

## Configuration

The service takes no composition config: nothing about the list is deployment-varying.

## Model Experience

None, as the domain is user-owned application data that never reaches a request assembly; the model never sees these items in v0, and model visibility would require session events plus both SDK projections, deliberately deferred.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No compare-and-set** — single-user edits race only with themselves across devices; a lost multi-window race converges on the next refetch rather than surfacing a conflict.
- **Session links are not lifecycle-fenced** — deleting a linked session leaves the reference in place, mirroring how the workspace registry keeps sessions it cannot revalidate.
- **No history view** — completed items from earlier days are durable but not yet surfaced anywhere.
