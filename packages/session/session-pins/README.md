# @deepseek-ai/dsh-session-pins

English | [中文](README.zh.md)

The user's pinned-session set: a durable set of session ids in its own [`storage-domain`](../../storage/storage-domain/README.md) domain `session_pins`, edited from the web session-header star and the sidebar pinned section ([`dsh-client-ui-session-pins`](../../client/ui-session-pins/README.md)) through the generated `sessionPins` Remote namespace. The set is user-facing only — nothing here enters a session log, a model request, or any tool schema.

A pin is a reference only: the session id is the table key and `pinnedAt` (host-stamped) orders the list. `pin` is idempotent for an already pinned session and never re-stamps; `unpin` is idempotent for an already absent one. Every material change emits the `session-pins/changed` event (allowlisted to browser clients), and consumers refetch rather than replay deltas. Pinning a session that is neither live nor persisted fails loud with `session-not-found` instead of parking a dead id.

An archived pinned session keeps its pin (archiving is visibility, not membership); the sidebar pinned section hides archived rows so the section reflects what the browser actually shows.

## Configuration

The service takes no composition config: nothing about the set is deployment-varying.

## Model Experience

None, as the domain is user-owned application data that never reaches a request assembly; the model never sees pins and the projection vocabulary gains no member.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No compare-and-set** — pin/unpin race only with themselves across windows; a lost race converges on the next refetch.
- **Session deletion does not cascade** — a deleted session's pin stays stored and simply stops rendering; a deletion primitive that prunes sidecars is separately deferred work.
- **Pin order is append-only** — there is no manual reorder; pins list oldest first.
