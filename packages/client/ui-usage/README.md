# @deepseek-ai/dsh-client-ui-usage

English | [中文](README.zh.md)

Web usage-dashboard feature owner: the "Usage / 用量" settings section over the [`usage-ledger`](../../session/usage-ledger/README.md) storage domain through the generated `usageLedger` Remote namespace. One controller backs the section; its snapshot feeds the table through the injected hooks seat, and business components hold only presentation state.

The table lists one row per session with the four provider buckets (input, output, cache read, cache write), a per-row total, and the last-active time; a totals row sums the visible rows. Session titles resolve through the standard sessions kit (falling back to a short id when the host has no title). The section loads at mount, and after any committed change — via the allowlisted `usage-ledger/changed` push plus `connection/reset` — a loaded table refetches once; a cold ledger stays cold until first rendered.

Styling uses tokens only; copy goes through the package's own `settings.usage` locale namespace.

## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Rows render id-only for foreign sessions** — titles resolve only for sessions in this window's list; rows for sessions from other profiles fall back to a short id.
- **No reset** — the ledger has no reset verb in v0, so the section offers no clear control.
- **No model/day slicing** — the row is one flat sum per session; slicing is a ledger-schema change.
