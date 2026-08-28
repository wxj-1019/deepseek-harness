# @deepseek-ai/dsh-client-ui-usage

English | [中文](README.zh.md)

Web usage-dashboard feature owner: the "Usage / 用量" tab in the conversation header strip (right of Trajectory), over the [`usage-ledger`](../../session/usage-ledger/README.md) storage domain through the generated `usageLedger` Remote namespace. One controller backs the tab; its snapshot feeds the dashboard through the injected hooks seat, and business components hold only presentation state.

The dashboard renders standalone cards: a big-number row (total, today, peak day, current and longest streaks), a summary strip (requests, cache-hit rate, cost when priced, last active), a GitHub-style token-activity heatmap over the last 20 weeks, a zero-filled per-model daily trend with a 7/30-day range toggle, and a model-share donut. The per-model and per-session tables keep the exact bucket columns; per-model and per-day slices roll up across sessions client-side. Session titles resolve through the standard sessions kit (falling back to a short id when the host has no title). The ledger loads lazily when the tab first renders, and after any committed change — via the allowlisted `usage-ledger/changed` push plus `connection/reset` — a loaded table refetches once; a cold ledger stays cold until first rendered.

Styling uses tokens only; copy goes through the package's own `usage` locale namespace.

## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Rows render id-only for foreign sessions** — titles resolve only for sessions in this window's list; rows for sessions from other profiles fall back to a short id.
- **No reset** — the ledger has no reset verb in v0, so the tab offers no clear control.
- **Trend and heatmap read the day-model cross slices** — rows accumulated before a slice shape existed contribute totals only and stay invisible to the per-day views until new samples arrive.
