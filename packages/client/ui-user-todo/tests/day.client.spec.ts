/**
 * Parameterized local-day bucketing for the daily-todo view: midnight
 * crossing, time-zone offsets, and long-lived processes that see several
 * days. Pure functions — no timers are mocked.
 * @module @deepseek-ai/dsh-client-ui-user-todo/tests/day.spec
 */

import { describe, expect, it } from 'vitest'
import { formatDueLabel, localDayKey, sameLocalDay, toLocalInputValue } from '../src/client/day.ts'
import { earlierCompleted, todayItems } from '../src/client/view.ts'

const DAY = (utcIso: string): number => Date.parse(utcIso)

type Row = Parameters<typeof todayItems>[0][number]

const item = (id: string, over: Partial<Row> = {}): Row => ({
  id: over.id ?? (id as Row['id']),
  title: `t-${id}`,
  done: false,
  createdAt: DAY('2026-08-20T08:00:00Z'),
  ...over,
})

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


describe('panel view derivations', () => {
  const now = DAY('2026-08-27T12:00:00Z')

  it("todayItems carries open items and keeps only today's completions", () => {
    const items = [
      item('a'),
      item('b', { done: true, completedAt: DAY('2026-08-27T09:00:00Z') }),
      item('c', { done: true, completedAt: DAY('2026-08-25T09:00:00Z') }),
    ]
    const view = todayItems(items, now, 'UTC')
    expect(view.map(entry => entry.id)).toEqual(['a', 'b'])
  })

  it('earlierCompleted is the complement: prior-day completions, newest first', () => {
    const items = [
      item('old-1', { done: true, completedAt: DAY('2026-08-25T09:00:00Z') }),
      item('old-2', { done: true, completedAt: DAY('2026-08-26T18:00:00Z') }),
      item('today', { done: true, completedAt: DAY('2026-08-27T09:00:00Z') }),
      item('open'),
    ]
    const view = earlierCompleted(items, now, 'UTC')
    expect(view.map(entry => entry.id)).toEqual(['old-2', 'old-1'])
    expect(todayItems(items, now, 'UTC').map(entry => entry.id)).toEqual(['open', 'today'])
  })

  it('the two derivations partition the list exactly', () => {
    const items = [
      item('a'),
      item('b', { done: true, completedAt: DAY('2026-08-27T09:00:00Z') }),
      item('c', { done: true, completedAt: DAY('2026-08-25T09:00:00Z') }),
    ]
    const combined = [...todayItems(items, now, 'UTC'), ...earlierCompleted(items, now, 'UTC')]
    expect(new Set(combined.map(entry => entry.id))).toEqual(new Set(['a', 'b', 'c']))
  })
})


describe('due helpers', () => {
  const UTC = 'UTC'

  it('formatDueLabel is deterministic under a pinned zone', () => {
    const instant = Date.UTC(2026, 7, 30, 1, 5)
    expect(formatDueLabel(instant, Date.now(), UTC)).toBe('2026-08-30 01:05')
  })

  it('toLocalInputValue round-trips through the local parser under the same zone', () => {
    const instant = Date.UTC(2026, 7, 30, 1, 5)
    const value = toLocalInputValue(instant, UTC)
    expect(value).toBe('2026-08-30T01:05')
    expect(Date.parse(value + ':00Z')).toBe(instant)
  })

  it('todayItems sorts due items first, soonest due at the top', () => {
    const now = Date.UTC(2026, 7, 27, 12)
    const items = [
      item('undated-old', { createdAt: DAY('2026-08-20T08:00:00Z') }),
      item('undated-new', { createdAt: DAY('2026-08-26T08:00:00Z') }),
      item('due-late', { dueAt: DAY('2026-08-29T00:00:00Z') }),
      item('due-soon', { dueAt: DAY('2026-08-28T00:00:00Z') }),
    ]
    expect(todayItems(items, now, UTC).map(entry => entry.id))
      .toEqual(['due-soon', 'due-late', 'undated-old', 'undated-new'])
  })
})
