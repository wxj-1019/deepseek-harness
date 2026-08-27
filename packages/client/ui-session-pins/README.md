# @deepseek-ai/dsh-client-ui-session-pins

English | [中文](README.zh.md)

Web pinned-session feature owner: a star toggle in `conversation.session.header.actions` plus a `sidebar.pinned` section over the [`session-pins`](../../session/session-pins/README.md) storage domain through the generated `sessionPins` Remote namespace. One controller backs both surfaces; its snapshot feeds them through the injected hooks seat, and business components hold only local interaction state.

The star renders on every session header and fills while pinned; the sidebar section lists pins in pin order, hides archived rows (so it reflects what the browser shows), opens a session on click, and unpins on hover. After any committed change — its own or another window's, via the allowlisted `session-pins/changed` push plus `connection/reset` — a loaded set refetches once; a cold set stays cold until first rendered.

Escape path is the star toggle and the section's hover affordances; styling uses tokens only; copy goes through the package's own `sessionPins` locale namespace.

## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No row-level pin in the browser tree** — pinning is the header star only; a per-row hover affordance would be a ui-workspace change.
- **Pinned sessions do not reorder within their workspace group** — the pinned section is the canonical placement; group-internal reordering belongs to the tree owner.
- **No pin state in search results** — search rows neither mark nor offer pins.
