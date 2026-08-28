# @deepseek-ai/dsh-usage-ledger

English | [中文](README.zh.md)

The per-session usage ledger: one durable row per session in its own [`storage-domain`](../../storage/storage-domain/README.md) domain `usage_ledger`, accumulated by a collector on the session event feed. Every usage-bearing `assistant/message` event adds its provider-reported buckets (input, output, cache read, cache write) to the session's row, bumps the sample count, stamps the wall-clock time, and folds the sample into a per-model slice and a day-and-model cross slice (host-local calendar day keyed by the event's model provenance). Rendered by the web Usage tab ([`dsh-client-ui-usage`](../../client/ui-usage/README.md)) through the generated `usageLedger` Remote namespace. The ledger is user-facing only — nothing here enters a session log, a model request, or any tool schema.

Every accumulation emits the allowlisted `usage-ledger/changed` event; loaded surfaces refetch on it and on `connection/reset`. Same-session samples serialize through a per-session write chain, and `list()` awaits in-flight chains, so a read issued right after a sample never misses it.

## Configuration

`pricing` — an optional price table in USD per 1M tokens, keyed by provider model id with `*` as the fallback key. When configured, `list()` publishes the table and cost-aware surfaces derive and show costs; without it (or with an empty table) no cost is ever displayed. Prices are deployment facts and are never guessed.

## Model Experience

None, as the domain is user-owned application data that never reaches a request assembly; the ledger observes usage, it does not produce it.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No reset or retention** — rows accumulate monotonically; a reset verb (per session or global) and a retention policy are deferred.
- **Replacement samples double-count in theory** — token-meter's ordering property (a later step's usage replaces an earlier (turn, step) sample) makes legal logs safe; a hostile hand-written log could inflate a row.
- **No per-model or per-day breakdown** — the row is one flat sum per session; slicing belongs to a follow-up with its own schema version.
