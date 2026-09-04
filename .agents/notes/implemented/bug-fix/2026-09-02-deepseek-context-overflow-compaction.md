# Agent Note: DeepSeek context overflow now routes to compaction, and the v4 catalog matches the API window

Status: implemented

English | [中文](2026-09-02-deepseek-context-overflow-compaction.zh.md)

## Problem

A long session died with `400 … request (264029 tokens) exceeds the available context size (262144 tokens), type: exceed_context_size_error`, and both safety nets missed:

1. **Pressure compaction priced against a fantasy window.** The llm-deepseek catalog declared `contextWindow: 1_000_000` for the v4 models while the API enforces `n_ctx: 262144` (the provider's own 400 body states it). The between-step pressure check (`compaction-basic` prices against `resolveModelInfo().context`) therefore saw ~26% usage at the moment the real window was already exceeded, and never compacted. The UI's context meter showed the same wrong percentage.
2. **Overflow recovery never classified the error.** `compaction-basic` recovers only when the request failure carries `CONTEXT_WINDOW_EXCEEDED`. The DeepSeek adapter's non-OK branch parsed only the wrapped `{error:{…}}` shape and then handed the flat DeepSeek 400 body (`{code:400, type:'exceed_context_size_error', message:…}` — `code` is the HTTP status) to the generic HTTP status mapping, producing a generic code the recovery ignores. The run failed instead of condensing and retrying.

## Decision

- **Catalog**: the built-in v4 model entries declare `contextWindow: 262_144` — the API-enforced value from the provider's own error — replacing the 1,000,000 default for these models. A deployment serving a larger tier overrides it per model in settings.
- **Adapter**: the non-OK branch parses the flat shape too (`type`/`message` at top level), includes those fields in the classification detail, and — when the flat `type` is `exceed_context_size_error` or the shared `isContextWindowExceededError` classifier matches the detail — throws with `CONTEXT_WINDOW_EXCEEDED_CODE` so the compaction recovery (condense → retry) fires.

## Alternatives considered

- **Raise the request above the API limit by sending `n_ctx`** — rejected: the parameter does not exist on this API; the window is account-enforced.
- **Only fix the recovery, keep the 1M window** — rejected: the pressure path is the primary safety net; recovery alone burns one failed request per overflow and lets the UI percentage lie.
- **Only fix the window, skip the classification** — rejected: any future overrun (a single oversized tool result, for example) would still kill the run instead of condensing.

## Consequences

- The context meter shows true usage; pressure compaction engages before the API limit.
- An overflow now condenses and retries automatically (up to the configured retry count) instead of failing the run.
- The flat-body parse also surfaces the provider's `message` for non-overflow 400s, so generic DeepSeek 400s show the API's own text instead of the raw JSON body.
