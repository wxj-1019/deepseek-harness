/**
 * Behavior of the usage view's pure aggregations: rollups, cache-hit rate,
 * model shares, and the token display format.
 * @module @deepseek-ai/dsh-client-ui-usage/tests/view.spec
 */

import { describe, expect, test } from 'vitest'
import type { UsageLedgerBuckets, UsageLedgerRecord } from '@deepseek-ai/dsh-usage-ledger/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { byModel, cacheHitRate, fmtTokens, totalsOf } from '../src/client/view.ts'

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
})
