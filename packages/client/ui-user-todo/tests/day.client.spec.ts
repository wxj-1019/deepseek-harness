/**
 * Parameterized local-day bucketing for the daily-todo view: midnight
 * crossing, time-zone offsets, and long-lived processes that see several
 * days. Pure functions — no timers are mocked.
 * @module @deepseek-ai/dsh-client-ui-user-todo/tests/day.spec
 */

import { describe, expect, it } from 'vitest'
import { localDayKey, sameLocalDay } from '../src/client/day.ts'

const UTC = 'UTC'
const SHANGHAI = 'Asia/Shanghai'
const LOS_ANGELES = 'America/Los_Angeles'

describe('local day key', () => {
  it('buckets a fixed instant differently per zone', () => {
    // 2026-08-27T00:30:00Z: already the 27th in Shanghai, still the 26th in LA.
    const instant = Date.UTC(2026, 7, 27, 0, 30)
    expect(localDayKey(instant, SHANGHAI)).toBe('2026-08-27')
    expect(localDayKey(instant, LOS_ANGELES)).toBe('2026-08-26')
    expect(localDayKey(instant, UTC)).toBe('2026-08-27')
  })

  it('crosses midnight within one zone without flipping neighbors', () => {
    const justBefore = Date.UTC(2026, 7, 27, 23, 59, 59, 999)
    const justAfter = Date.UTC(2026, 7, 28, 0, 0, 0)
    expect(sameLocalDay(justBefore, justAfter, UTC)).toBe(false)
    expect(localDayKey(justBefore, UTC)).toBe('2026-08-27')
    expect(localDayKey(justAfter, UTC)).toBe('2026-08-28')
  })

  it('keeps the whole local day together across a zone offset boundary', () => {
    // A Shanghai day starts 8 hours before its UTC date label; instants that
    // straddle the UTC midnight line share one Shanghai day until 16:00Z.
    const lateShanghaiEve = Date.UTC(2026, 7, 26, 15, 59)
    const earlyShanghaiMorn = Date.UTC(2026, 7, 26, 16, 1)
    expect(sameLocalDay(lateShanghaiEve, earlyShanghaiMorn, SHANGHAI)).toBe(false)
    expect(sameLocalDay(earlyShanghaiMorn - 1_000, earlyShanghaiMorn, SHANGHAI)).toBe(true)
  })

  it('derives nothing from process state, so a long-lived caller stays correct', () => {
    // Same input, arbitrary later call: identical keys, no cached "today".
    const instant = Date.UTC(2026, 7, 27, 12)
    expect(localDayKey(instant, UTC)).toBe(localDayKey(instant, UTC))
    expect(sameLocalDay(instant, instant + 1, UTC)).toBe(true)
  })
})
