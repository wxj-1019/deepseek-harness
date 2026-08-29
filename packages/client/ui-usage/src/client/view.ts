/**
 * Pure aggregations over the fetched ledger rows: the summary-strip totals,
 * the per-model rollup, and the token display format. No subscription, no
 * React — every export is a plain function over plain data.
 * @module @deepseek-ai/dsh-client-ui-usage/client/view
 */

import type { UsageLedgerPrice } from '@deepseek-ai/dsh-usage-ledger/types'
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
      rollBuckets(slices, model, buckets)
    }
  }
  return [...slices.entries()]
    .map(([model, totals]) => ({ model, totals, share: grand === 0 ? 0 : totals.total / grand }))
    .sort((left, right) => right.totals.total - left.totals.total)
}

/** Fold one slice into its rollup cell, creating the cell when absent. */
function rollBuckets(slices: Map<string, MutableTotals>, key: string, buckets: {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly requests: number
}): void {
  const current = slices.get(key) ?? emptyTotals()
  current.inputTokens += buckets.inputTokens
  current.outputTokens += buckets.outputTokens
  current.cacheReadTokens += buckets.cacheReadTokens
  current.cacheWriteTokens += buckets.cacheWriteTokens
  current.requests += buckets.requests
  current.total = current.inputTokens + current.outputTokens + current.cacheReadTokens + current.cacheWriteTokens
  slices.set(key, current)
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

/** One calendar day's rolled-up usage. */
export interface DayUsageRow {
  /** The host-local day key, `YYYY-MM-DD`. */
  readonly day: string
  readonly totals: UsageTotals
}

/** The client-local day key, matching the host's day-slice keys. */
export function todayKey(): string {
  return dayKeyOf(new Date())
}

/** The `YYYY-MM-DD` form of a date, in local time. */
export function dayKeyOf(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Roll the per-day slices up across sessions, most recent day first. Day
 * totals derive from the day-and-model cross slices (rolling the model axis
 * away per day); rows without them contribute nothing.
 * @param rows - the visible ledger rows.
 * @returns one row per day, descending by day key.
 */
export function byDay(rows: UsageState['rows']): readonly DayUsageRow[] {
  const slices = new Map<string, MutableTotals>()
  for (const row of rows) {
    for (const [day, models] of Object.entries(row.record.dayModels ?? {})) {
      for (const buckets of Object.values(models)) {
        rollBuckets(slices, day, buckets)
      }
    }
  }
  return [...slices.entries()]
    .map(([day, totals]) => ({ day, totals }))
    .sort((left, right) => right.day.localeCompare(left.day))
}

/** One model's token series over the trend's day window (zero-filled). */
export interface ModelTrendSeries {
  readonly model: string
  /** One total per day of the window, aligned with the window's day keys. */
  readonly values: readonly number[]
}

/**
 * Per-model daily totals for the trend chart, over the given day keys
 * (ascending, zero-filled where a model was silent).
 * @param rows - the visible ledger rows.
 * @param dayWindow - the window's day keys, ascending, `YYYY-MM-DD`.
 * @returns one series per model seen in the window.
 */
export function trendSeries(rows: UsageState['rows'], dayWindow: readonly string[]): readonly ModelTrendSeries[] {
  const perModel = new Map<string, MutableTotals[]>()
  for (const row of rows) {
    for (const [index, day] of dayWindow.entries()) {
      const slices = row.record.dayModels?.[day]
      if (slices === undefined) continue
      for (const [model, buckets] of Object.entries(slices)) {
        const series = perModel.get(model) ?? Array.from({ length: dayWindow.length }, emptyTotals)
        const slot = series[index]
        if (slot === undefined) continue
        slot.inputTokens += buckets.inputTokens
        slot.outputTokens += buckets.outputTokens
        slot.cacheReadTokens += buckets.cacheReadTokens
        slot.cacheWriteTokens += buckets.cacheWriteTokens
        slot.requests += buckets.requests
        slot.total = slot.inputTokens + slot.outputTokens + slot.cacheReadTokens + slot.cacheWriteTokens
        perModel.set(model, series)
      }
    }
  }
  return [...perModel.entries()]
    .map(([model, series]) => ({ model, values: series.map(slot => slot.total) }))
    .sort((left, right) => right.values.reduce((a, b) => a + b, 0) - left.values.reduce((a, b) => a + b, 0))
}

/** Consecutive-activity day counts over the client-local calendar. */
export interface UsageStreaks {
  /** Days ending today (or yesterday when today is silent) with usage. */
  readonly current: number
  /** The longest run of consecutive active days. */
  readonly longest: number
}

/**
 * Count streaks over day keys (any order; duplicates collapse).
 * @param dayKeys - active day keys, `YYYY-MM-DD`.
 * @returns the current and longest consecutive-day counts.
 */
export function usageStreaks(dayKeys: readonly string[]): UsageStreaks {
  const unique = [...new Set(dayKeys)].sort()
  const asTime = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getTime()
  }
  const DAY_MS = 86_400_000
  let longest = 0
  let run = 0
  let previous = Number.NaN
  for (const key of unique) {
    const time = asTime(key)
    run = time - previous === DAY_MS ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = time
  }
  // The current streak counts back from today, tolerating a silent today
  // (yesterday still continues it); anything older breaks it.
  const today = todayKey()
  let current = 0
  let cursor = unique.includes(today) ? today : previousDay(today)
  while (cursor !== undefined && unique.includes(cursor)) {
    current += 1
    cursor = previousDay(cursor)
  }
  return { current, longest }
}

/** The day key one calendar day before the given key. */
function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y ?? 0, (m ?? 1) - 1, (d ?? 1) - 1)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Cost of one bucket set under a price (USD per 1M tokens per bucket).
 * @param totals - the buckets to price.
 * @param price - the effective price for the slice's model.
 * @returns the cost in USD.
 */
export function costOf(totals: Pick<UsageTotals, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>, price: UsageLedgerPrice): number {
  return (totals.inputTokens * price.input
    + totals.outputTokens * price.output
    + totals.cacheReadTokens * price.cacheRead
    + totals.cacheWriteTokens * price.cacheWrite) / 1_000_000
}

/**
 * The effective price for a model: the exact id, else the `*` fallback.
 * @param model - the provider model id.
 * @param pricing - the deployment's price table.
 * @returns the price, or undefined when the model and fallback are unpriced.
 */
export function priceFor(model: string, pricing: Record<string, UsageLedgerPrice>): UsageLedgerPrice | undefined {
  return pricing[model] ?? pricing['*']
}

/**
 * Terminal-style cost: dollars with as many decimals as the magnitude needs.
 * @param value - a cost in USD.
 * @returns the display form, e.g. `$0.0031`, `$2.40`, `$18`.
 */
export function fmtCost(value: number): string {
  if (value >= 100) return `$${value.toFixed(0)}`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}
