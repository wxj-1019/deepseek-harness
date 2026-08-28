/**
 * Behavior of the usage view's pure aggregations: rollups, cache-hit rate,
 * model shares, the token and cost display formats, and day slices.
 * @module @deepseek-ai/dsh-client-ui-usage/tests/view.spec
 */

import { describe, expect, test } from 'vitest'
import type { UsageLedgerBuckets, UsageLedgerRecord } from '@deepseek-ai/dsh-usage-ledger/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { byDay, byModel, cacheHitRate, costOf, fmtCost, fmtTokens, priceFor, todayKey, totalsOf } from '../src/client/view.ts'

/** Per-model slice fixture shape (the four buckets plus requests). */
type Slice = Omit<UsageLedgerBuckets, never>

/** One ledger row with the given buckets and optional model slices. */
function row(inputTokens: number, outputTokens: number, models?: Record<string, Slice>):
{ sessionId: SessionId; record: UsageLedgerRecord } {
  return {
    sessionId: 's' as SessionId,
    record: {
      inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1, lastAt: 0,
      ...(models === undefined ? {} : { models }),
    },
  }
}

/** One ledger row carrying explicit per-day slices. */
function dayRow(days: Record<string, Slice>): { sessionId: SessionId; record: UsageLedgerRecord } {
  const flat = Object.values(days)
  return {
    sessionId: 'd' as SessionId,
    record: {
      inputTokens: flat.reduce((sum, s) => sum + s.inputTokens, 0),
      outputTokens: flat.reduce((sum, s) => sum + s.outputTokens, 0),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      requests: flat.reduce((sum, s) => sum + s.requests, 0),
      lastAt: 0,
      days,
    },
  }
}

describe('usage view aggregations', () => {
  test('totalsOf sums every bucket and the four-bucket total', () => {
    const rows = [
      row(100, 10, { alpha: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 } }),
      row(200, 20, {
        alpha: { inputTokens: 120, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 },
        beta: { inputTokens: 80, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 },
      }),
    ]
    expect(totalsOf(rows)).toMatchObject({ inputTokens: 300, outputTokens: 30, requests: 2, total: 330 })
  })

  test('totalsOf over empty rows is an all-zero total', () => {
    expect(totalsOf([])).toMatchObject({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, total: 0 })
  })

  test('cacheHitRate reads cache reads over billable input and is undefined with nothing sent', () => {
    const mixed = { inputTokens: 100, outputTokens: 0, cacheReadTokens: 300, cacheWriteTokens: 100, requests: 4, total: 500 }
    expect(cacheHitRate(mixed)).toBe(0.6)
    const uncached = { inputTokens: 0, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1, total: 5 }
    expect(cacheHitRate(uncached)).toBeUndefined()
  })

  test('byModel rolls slices up across sessions, largest share first', () => {
    const rows = [
      row(100, 10, { alpha: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 } }),
      row(300, 30, {
        alpha: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 },
        beta: { inputTokens: 240, outputTokens: 24, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 },
      }),
    ]
    const models = byModel(rows)
    expect(models.map(entry => entry.model)).toEqual(['beta', 'alpha'])
    expect(models[0]).toMatchObject({ share: 264 / 440 })
    expect(models[1]).toMatchObject({ totals: { inputTokens: 200, outputTokens: 20, requests: 2 } })
  })

  test('fmtTokens abbreviates with a trimmed single decimal', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(64)).toBe('64')
    expect(fmtTokens(999)).toBe('999')
    expect(fmtTokens(1000)).toBe('1K')
    expect(fmtTokens(12300)).toBe('12.3K')
    expect(fmtTokens(1_200_000)).toBe('1.2M')
  })

  test('byDay rolls day slices across sessions, most recent day first', () => {
    const rows = [
      dayRow({ '2026-08-28': { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 } }),
      dayRow({
        '2026-08-28': { inputTokens: 50, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 },
        '2026-08-29': { inputTokens: 200, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 2 },
      }),
    ]
    const days = byDay(rows)
    expect(days.map(entry => entry.day)).toEqual(['2026-08-29', '2026-08-28'])
    expect(days[0]).toMatchObject({ totals: { inputTokens: 200, outputTokens: 20, requests: 2, total: 220 } })
    expect(days[1]).toMatchObject({ totals: { inputTokens: 150, outputTokens: 15, requests: 2 } })
  })

  test('todayKey returns the client-local YYYY-MM-DD form', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('costOf prices the four buckets per million tokens', () => {
    const price = { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 }
    // 1M input + 1M output + 2M cache read: 0.27 + 1.1 + 0.14 = 1.51.
    const buckets = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 2_000_000, cacheWriteTokens: 0 }
    expect(costOf(buckets, price)).toBeCloseTo(1.51)
  })

  test('priceFor prefers the exact model id and falls back to the wildcard', () => {
    const pricing = {
      '*': { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
      'glm-5': { input: 2, output: 2, cacheRead: 2, cacheWrite: 2 },
    }
    expect(priceFor('glm-5', pricing)?.input).toBe(2)
    expect(priceFor('unknown', pricing)?.input).toBe(1)
    expect(priceFor('unknown', {})).toBeUndefined()
  })

  test('fmtCost scales decimals with the magnitude', () => {
    expect(fmtCost(0.0031)).toBe('$0.0031')
    expect(fmtCost(2.4)).toBe('$2.40')
    expect(fmtCost(18)).toBe('$18.00')
    expect(fmtCost(250)).toBe('$250')
  })
})
