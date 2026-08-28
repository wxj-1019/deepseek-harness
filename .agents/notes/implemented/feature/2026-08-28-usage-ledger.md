# Agent Note: The usage ledger and the Usage settings section

Status: implemented

English | [中文](2026-08-28-usage-ledger.zh.md)

## Problem

Token accounting existed only per open session: the `tokenUsage` session projection (token-meter) and the composer stats line describe the current session, and every other surface was blind. A user managing many sessions had no cross-session answer to "how many tokens have I spent, on what" — and the data to answer it (provider-reported usage on `assistant/message` events) was already flowing through the session event feed, uncollected.

## Decision

A new host package `@deepseek-ai/dsh-usage-ledger` owns a `usage_ledger` storage domain: one row per session accumulating the four provider buckets (input, output, cache read, cache write), a sample count, and the wall-clock time of the latest sample. The collector subscribes to `session/event` at init and adds every usage-bearing `assistant/message` sample; same-session samples serialize through a per-session write chain, and `list()` awaits in-flight chains so a read never misses a just-landed sample. Every accumulation emits the allowlisted `usage-ledger/changed` event.

The client package `@deepseek-ai/dsh-client-ui-usage` renders the "Usage / 用量" settings section: one row per session with the four buckets, a per-row total, and last-active time; a totals row sums the visible rows; session titles resolve through the standard sessions kit. The section loads at mount; pushes and reconnects converge a loaded table.

The ledger observes usage and never produces it: nothing here is model-visible, and the projection vocabulary gains no member (the existing `tokenUsage` unit keeps serving the composer's own session).

The keyless web journey `apps/web/tests/usage-dashboard.e2e.ts` reuses the notification-center turn fixture (read-only): the replayed settle lands as a ledger row, the section shows the session's row with nonzero totals, and the totals row sums it. Unit suites pin accumulation, ordering, no-op usage-free messages, and restart durability (`packages/session/usage-ledger/tests/usage-ledger.spec.ts`). The keyless journey reuses the notification-center turn fixture read-only, so no new recording was needed.

## Alternatives considered

- **Aggregate from session-query sqlite at render time.** Lost: the sqlite index is opt-in and off by default, and its usage columns would shape a query backend for a dashboard — a storage domain written at the moment things happen is simpler and always on.
- **Extend token-meter with a cross-session fold.** Lost: token-meter is deliberately per-session (one isolated fold per session); a cross-session table is different ownership, not more folds.
- **A session-log projection instead of a storage domain.** Lost: usage totals are cross-session user state — the canonical storage-domain case.
- **Reset/retention verbs in v0.** Deferred: a reset touches nothing else, so it can land any time; shipping without it keeps the write surface read-shape.

## Consequences

- The Usage section answers "what did I spend" across every session that ran since the ledger mounted, with live updates for whatever ran since.
- Provider-reported numbers are exact per bucket; no heuristic estimate enters the ledger (unlike token-meter's surface estimates).
- Rows never die with their session — deletion cascades (the deferred primitive) will need the same sweep the feedback and pins sidecars need.
- The dashboard's table is bounded by session count; per-model or per-day slicing would be a ledger schema version bump.

## Risks

- **Replacement samples double-count in theory.** Token-meter's ordering property makes legal logs safe; the limitation is documented.
- **Section staleness across windows.** Without the allowlisted push, a second window's section would go stale; the push plus refetch is wired and covered.
- **Cold-start visibility.** The section loads at mount, so its first open costs one list read — bounded by session count.
