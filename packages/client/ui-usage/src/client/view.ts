/**
 * Pure aggregations over the fetched ledger rows: the summary-strip totals,
 * the per-model rollup, and the token display format. No subscription, no
 * React — every export is a plain function over plain data.
 * @module @deepseek-ai/dsh-client-ui-usage/client/view
 */

import type { UsageState } from './controller.ts'

/** The four provider buckets plus the sample count and their sum. */
export interface UsageTotals {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly requests: number
  /** The four buckets summed. */
  readonly total: number
}

/** Roll the visible rows up into one totals object. */
export function totalsOf(rows: UsageState['rows']): UsageTotals {
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, total: 0 }
  for (const row of rows) {
    totals.inputTokens += row.record.inputTokens
    totals.outputTokens += row.record.outputTokens
    totals.cacheReadTokens += row.record.cacheReadTokens
    totals.cacheWriteTokens += row.record.cacheWriteTokens
    totals.requests += row.record.requests
  }
  totals.total = totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
  return totals
}

/**
 * Cache-hit share over billable input (cache writes count as misses).
 * @param totals - the rollup the rate reads from.
 * @returns 0..1, or undefined when nothing billable was ever sent.
 */
export function cacheHitRate(totals: UsageTotals): number | undefined {
  const billed = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
  return billed === 0 ? undefined : totals.cacheReadTokens / billed
}

/** One model's rolled-up usage and its share of the grand total. */
export interface ModelUsageRow {
  readonly model: string
  readonly totals: UsageTotals
  /** Slice total over the grand total, 0..1. */
  readonly share: number
}

/** A writable twin of {@link UsageTotals} for accumulation. */
type MutableTotals = { -readonly [Key in keyof UsageTotals]: UsageTotals[Key] }

/** A zeroed accumulator. */
function emptyTotals(): MutableTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, total: 0 }
}

/**
 * Roll the per-model slices up across sessions, largest share first. Rows
 * without a models map (none since ledger v1) simply contribute nothing.
 * @param rows - the visible ledger rows.
 * @returns one row per model, descending by total.
 */
export function byModel(rows: UsageState['rows']): readonly ModelUsageRow[] {
  const grand = totalsOf(rows).total
  const slices = new Map<string, MutableTotals>()
  for (const row of rows) {
    for (const [model, buckets] of Object.entries(row.record.models ?? {})) {
      const current = slices.get(model) ?? emptyTotals()
      current.inputTokens += buckets.inputTokens
      current.outputTokens += buckets.outputTokens
      current.cacheReadTokens += buckets.cacheReadTokens
      current.cacheWriteTokens += buckets.cacheWriteTokens
      current.requests += buckets.requests
      current.total = current.inputTokens + current.outputTokens + current.cacheReadTokens + current.cacheWriteTokens
      slices.set(model, current)
    }
  }
  return [...slices.entries()]
    .map(([model, totals]) => ({ model, totals, share: grand === 0 ? 0 : totals.total / grand }))
    .sort((left, right) => right.totals.total - left.totals.total)
}

/**
 * Terminal-style token count: verbatim below a kilo, one-decimal `K`/`M`
 * above it with a trailing `.0` trimmed.
 * @param count - a token count.
 * @returns the display form, e.g. `64`, `12.3K`, `1.2M`.
 */
export function fmtTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${trim(count / 1000)}K`
  return `${trim(count / 1_000_000)}M`
}

/** One decimal with a trailing `.0` trimmed. */
function trim(value: number): string {
  const fixed = value.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}
