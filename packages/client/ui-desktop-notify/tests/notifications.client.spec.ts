/**
 * Pure completion-edge math: the running-bit collection, the true→false edge
 * detection, and the interrupt predicate.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { completedSince, runningOf, shouldNotify } from '../src/client/notifications.ts'
import { listState, summary } from './support.client.ts'

describe('runningOf', () => {
  it('collects the running bit of every listed session', () => {
    const state = listState([summary('a', true), summary('b', false)])
    expect(runningOf(state)).toEqual(new Map<SessionId, boolean>([['a' as SessionId, true], ['b' as SessionId, false]]))
  })
})

describe('completedSince', () => {
  it('reports sessions whose bit fell true→false', () => {
    const prev = runningOf(listState([summary('a', true), summary('b', true), summary('c', false)]))
    const next = listState([summary('a', false), summary('b', true), summary('c', false)])
    expect(completedSince(prev, next)).toEqual(['a'])
  })

  it('drops sessions first seen idle: they never ran here', () => {
    const prev = runningOf(listState([summary('a', false)]))
    const next = listState([summary('a', false), summary('new', false)])
    expect(completedSince(prev, next)).toEqual([])
  })

  it('drops sessions missing from the next snapshot: they completed nowhere visible', () => {
    const prev = runningOf(listState([summary('a', true), summary('gone', true)]))
    const next = listState([summary('a', false)])
    expect(completedSince(prev, next)).toEqual(['a'])
  })
})

describe('shouldNotify', () => {
  const id = 'session' as SessionId

  it('stays quiet for the watched session on a visible tab', () => {
    expect(shouldNotify(id, id, false)).toBe(false)
  })

  it('interrupts for the watched session once the tab is hidden', () => {
    expect(shouldNotify(id, id, true)).toBe(true)
  })

  it('interrupts for any session that is not the current selection', () => {
    expect(shouldNotify(id, 'other' as SessionId, false)).toBe(true)
    expect(shouldNotify(id, undefined, false)).toBe(true)
  })
})
