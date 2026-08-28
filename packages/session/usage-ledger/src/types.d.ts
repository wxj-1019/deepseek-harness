/**
 * Public value vocabulary for the per-session usage ledger. Types only, plus
 * the seam's Cordis event declaration, so generated Remote clients consume it
 * without importing Host runtime code.
 * @module @deepseek-ai/dsh-usage-ledger/types
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
/**
 * One session's accumulated provider usage. Buckets sum disjoint provider
 * usage samples from `assistant/message` events; `requests` counts the
 * samples, and `lastAt` is the wall-clock time of the latest sample.
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
}
/** Every session's ledger rows, most recently active first. */
export interface UsageLedgerListValue {
  /** Rows keyed by session id, ordered by `lastAt` descending. */
  readonly items: readonly {
    readonly sessionId: SessionId
    readonly record: UsageLedgerRecord
  }[]
}
/** Result returned by the `list` operation. */
export type UsageLedgerListResult = {
  readonly ok: true
  readonly value: UsageLedgerListValue
}
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
//# sourceMappingURL=types.d.ts.map
