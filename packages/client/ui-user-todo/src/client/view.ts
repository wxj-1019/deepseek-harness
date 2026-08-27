/**
 * Pure row derivations for the daily-todo panel. No React, no CSS, no
 * clock reads — every function takes the instant that bounds "today", so
 * tests parameterize time instead of mocking it.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/view
 */

import type { UserTodoRecord } from '@deepseek-ai/dsh-user-todo/types'
import { sameLocalDay } from './day.ts'

/**
 * The today view: every open item (carried over from whichever day it was
 * created) first in creation order, then the items completed today
 * newest-first.
 * @param items - the whole durable list.
 * @param nowMs - current epoch instant bounding "today".
 * @returns open items and today's completions, concatenated display-ready.
 */
export function todayItems(
  items: readonly UserTodoRecord[],
  nowMs: number,
  timeZone?: string,
): readonly UserTodoRecord[] {
  const pending: UserTodoRecord[] = []
  let completedToday: UserTodoRecord[] = []
  for (const item of items) {
    if (!item.done) pending.push(item)
    else if (item.completedAt !== undefined && sameLocalDay(item.completedAt, nowMs, timeZone)) completedToday.push(item)
  }
  completedToday = completedToday.sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
  return [...pending, ...completedToday]
}

/**
 * Completed items from earlier days, newest first — the history section's
 * rows. Today's completions never appear here.
 * @param items - the whole durable list.
 * @param nowMs - current epoch instant bounding "today".
 * @returns earlier completions in completion order, newest first.
 */
export function earlierCompleted(
  items: readonly UserTodoRecord[],
  nowMs: number,
  timeZone?: string,
): readonly UserTodoRecord[] {
  return items
    .filter(item => item.done
      && item.completedAt !== undefined
      && !sameLocalDay(item.completedAt, nowMs, timeZone))
    .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
}
