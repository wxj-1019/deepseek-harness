# Agent Note: Terminal-style usage statistics

Status: implemented

English | [中文](2026-08-29-usage-terminal-statistics.zh.md)

## Problem

The Usage tab renders one flat per-session table. The user wants a usage statistics view styled after the ZCode CLI's reporting: a dense summary strip followed by a per-model cost-report-style breakdown. The ledger (v0) stores only per-session totals, so a model slice does not exist yet; the collector can read it for free because every usage-bearing `assistant/message` event carries `message.source.model` (the `ModelMessageSource` provenance).

## Style definition (the "ZCode look")

Terminal reporting idioms: a status-line summary strip (dim labels, bright values, `·` separators), a `/cost`-style breakdown table, tabular numerals, `K`/`M` token abbreviations, percentage rates, and thin proportional bars. Three stacked sections inside the existing Usage tab — no new tab, no chart library:

```
输入 4.8K · 输出 64 · 缓存读 30.1K · 缓存写 1.2K · 合计 36.1K
128 次请求 · 缓存命中 83% · 最近活跃 08-29 14:32
──────────────────────────────────────────────
模型               请求  输入   输出  缓存读  缓存写  占比
DeepSeek-V4-Flash    96  3.9K    52   24.5K    980  72% ▍
GLM-5.3-flash        32   96     12    5.6K    210  28% ▏
──────────────────────────────────────────────
（现有按会话明细表，样式对齐）
```

## Decisions

- **D1 — one tab, three sections.** The statistics render inside the existing Usage conversation view: summary strip, per-model table, per-session table. No new view entry, no routing change.
- **D2 — ledger schema v0 → v1.** `UsageLedgerRecord` gains `models?: Record<string, UsageLedgerBuckets>` (per-model four buckets plus requests; merge-extensible map keyed by the provider model id) and `firstAt?: number`. The domain version bumps and v0 rows are dropped, per the pre-release stance. Existing totals buckets stay top-level so current consumers keep their shape.
- **D3 — model identity from the event.** The collector reads `event.data.message.source.model` (assistant messages' `source.kind` is `'model'` by type). No new event fields, no request plumbing.
- **D4 — aggregation is a client pure function.** The host stays a dumb accumulator; totals, per-model rollup, cache-hit rate, and shares derive in `view.ts` over the fetched rows, memoized per snapshot.
- **D5 — display conventions.** `fmtTokens`: `< 1000` verbatim, `≥ 1000` → `12.3K`, `≥ 1e6` → `1.2M`. Cache-hit rate = cacheRead / (input + cacheRead + cacheWrite) (cache writes count as misses). Share bar = pure CSS width, 2px tall. `font-variant-numeric: tabular-nums` everywhere numbers align.
- **D6 — cost only under a configured price table.** The service takes an optional `pricing` config (USD per 1M tokens per bucket, keyed by model id with `*` as fallback), publishes it through `list()`, and clients derive costs with pure functions; an unconfigured or empty table shows no cost anywhere. A wrong price table is worse than none, so the deployment opts in explicitly.
- **D7 — day slicing.** The record carries `dayModels` cross slices (day → model → buckets, host-local `YYYY-MM-DD` day keys); rolling either axis reproduces the totals. The view renders a per-day table and a Today metric in the summary strip. The fields are optional in the schema, so older rows load cleanly and day statistics accumulate from the upgrade onward — no further domain bump.

## Work plan

1. **Host** (`packages/session/usage-ledger`): record v1 + spec version bump; collector threads the model id; unit tests cover per-model accumulation and the v1 reopen path. ~half a day.
2. **Client** (`packages/client/ui-usage`): `view.ts` pure aggregations with unit tests (empty rows, single model, rounding edges); `UsageSection` rebuilt into the three-section layout with the new module CSS; locales gain summary labels (`summary.requests`, `summary.cacheHit`, `table.model`, `table.share`) in both dictionaries. ~half a day.
3. **Snapshot**: a keyless web journey (`usage-panel.e2e.ts`) seeds rows through the real remote face and pins the open tab's golden (strip + model table + session table); fixture replay on macOS/Linux from day one.
4. **Docs**: both package READMEs move to the v1 record shape; pairing re-recorded.

## Alternatives considered

- **Aggregating in the host (a `summary` RPC)** was rejected: the row list is small, the client already holds it, and a second read path would double the invariant surface for no transfer saving.
- **Rendering costs instead of tokens** was rejected for D6's reason, and a wrong price table is worse than none.
- **A separate statistics plugin** was rejected: the ledger seam is one capability and the view already owns its only consumer.
