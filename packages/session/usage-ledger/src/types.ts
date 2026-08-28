/**
 * Public value vocabulary for the per-session usage ledger. Types only, plus
 * the seam's Cordis event declaration, so generated Remote clients consume it
 * without importing Host runtime code.
 * @module @deepseek-ai/dsh-usage-ledger/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * The four provider buckets plus the sample count, shared by the session row
 * totals and each per-model slice. Buckets sum disjoint provider usage
 * samples; `requests` counts the samples accumulated into the slice.
 */
export interface UsageLedgerBuckets {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** Number of usage-bearing samples accumulated into this slice. */
  readonly requests: number
}

/**
 * One session's accumulated provider usage. Top-level buckets sum every
 * usage-bearing `assistant/message` sample; `models` slices the same samples
 * by the producing model's id; `days` slices them by the host-local calendar
 * day; `requests` counts the samples, `firstAt` and `lastAt` bound them on
 * the wall clock.
 */
export interface UsageLedgerRecord {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** Number of usage-bearing samples accumulated. */
  readonly requests: number
  /** Wall-clock time of the latest accumulated sample. */
  readonly lastAt: number
  /** Wall-clock time of the first accumulated sample; absent in v0 rows. */
  readonly firstAt?: number
  /**
   * Per-model slices keyed by provider model id; absent until the first
   * model-bearing sample. Totals and per-model slices sum the same samples,
   * so a slice rollup reproduces the top-level buckets.
   */
  readonly models?: Record<string, UsageLedgerBuckets>
  /**
   * Per-day slices keyed by the host-local calendar day (`YYYY-MM-DD`);
   * absent until the first sample. The same rollup property as `models`.
   */
  readonly days?: Record<string, UsageLedgerBuckets>
}

/** Per-model price in USD per 1M tokens, over the four bucket vocabulary. */
export interface UsageLedgerPrice {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/** Every session's ledger rows, most recently active first. */
export interface UsageLedgerListValue {
  /** Rows keyed by session id, ordered by `lastAt` descending. */
  readonly items: readonly { readonly sessionId: SessionId; readonly record: UsageLedgerRecord }[]
  /**
   * The deployment's effective price table (USD per 1M tokens), keyed by
   * model id with `*` as the fallback key; absent when no pricing is
   * configured. Cost derivation is a client concern — the host publishes
   * prices, never computes money.
   */
  readonly pricing?: Record<string, UsageLedgerPrice>
}

/** Result returned by the `list` operation. */
export type UsageLedgerListResult = { readonly ok: true; readonly value: UsageLedgerListValue }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The usage ledger accumulated a sample (or a session's row first
     * appeared). Emitted after the storage domain committed; arguments are
     * intentionally empty — consumers refetch instead of replaying deltas.
     * @mode emit
     */
    'usage-ledger/changed'(): void
  }
}
