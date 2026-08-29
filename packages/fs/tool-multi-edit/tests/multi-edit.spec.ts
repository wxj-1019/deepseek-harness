/**
 * Behavior of the `multi_edit` tool's pure helpers: batch validation,
 * occurrence counting, and literal application.
 * @module @deepseek-ai/dsh-tool-multi-edit/tests/multi-edit.spec
 */

import { describe, expect, test } from 'vitest'
import { applyOne, occurrenceCount, validateEdits } from '../src/index.ts'

describe('multi_edit helpers', () => {
  test('validateEdits rejects an empty batch, over-cap batches, and degenerate edits', () => {
    expect(validateEdits([], 25).ok).toBe(false)
    const overCap = validateEdits(
      Array.from({ length: 26 }, (_, index) => ({ path: `f${index}`, oldString: 'a', newString: 'b' })),
      25,
    )
    expect(overCap.ok).toBe(false)
    const degenerate = validateEdits([{ path: 'f', oldString: 'same', newString: 'same' }], 25)
    expect(degenerate.ok).toBe(false)
    const blank = validateEdits([{ path: '  ', oldString: 'a', newString: 'b' }], 25)
    expect(blank.ok).toBe(false)
  })

  test('validateEdits accepts a well-formed batch and preserves order', () => {
    const batch = validateEdits([
      { path: 'a.ts', oldString: 'one', newString: 'uno' },
      { path: 'b.ts', oldString: 'two', newString: 'dos', replaceAll: true },
    ], 25)
    expect(batch.ok).toBe(true)
    if (batch.ok) {
      expect(batch.edits.map(edit => edit.path)).toEqual(['a.ts', 'b.ts'])
      expect(batch.edits[1]?.replaceAll).toBe(true)
    }
  })

  test('applyOne replaces exactly once by default and refuses ambiguity', () => {
    expect(applyOne('a one b c', 'one', 'ONE', false)).toBe('a ONE b c')
    expect(() => applyOne('a one b one c', 'one', 'ONE', false)).toThrow('occurs 2 times')
    expect(applyOne('a one b one c', 'one', 'ONE', true)).toBe('a ONE b ONE c')
    expect(() => applyOne('nothing here', 'one', 'ONE', false)).toThrow('not found')
  })

  test('same-file edits apply sequentially on the evolving content', () => {
    let content = 'const a = 1;\nconst b = 2;'
    content = applyOne(content, 'const a = 1;', 'const a = 10;', false)
    content = applyOne(content, 'const b = 2;', 'const b = 20;', false)
    expect(content).toBe('const a = 10;\nconst b = 20;')
    expect(occurrenceCount(content, 'const')).toBe(2)
  })
})
