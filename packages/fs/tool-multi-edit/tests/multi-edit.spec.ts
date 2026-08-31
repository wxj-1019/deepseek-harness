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
    expect(applyOne('a one b c', 'one', 'ONE', false, false)).toBe('a ONE b c')
    expect(() => applyOne('a one b one c', 'one', 'ONE', false, false)).toThrow('occurs 2 times')
    expect(applyOne('a one b one c', 'one', 'ONE', true, false)).toBe('a ONE b ONE c')
    expect(() => applyOne('nothing here', 'one', 'ONE', false, false)).toThrow('not found')
  })

  test('same-file edits apply sequentially on the evolving content', () => {
    let content = 'const a = 1;\nconst b = 2;'
    content = applyOne(content, 'const a = 1;', 'const a = 10;', false, false)
    content = applyOne(content, 'const b = 2;', 'const b = 20;', false, false)
    expect(content).toBe('const a = 10;\nconst b = 20;')
    expect(occurrenceCount(content, 'const', false)).toBe(2)
  })
})

describe('multi_edit regex mode', () => {
  test('validateEdits accepts a compilable pattern and rejects a broken one', () => {
    expect(validateEdits([{ path: 'a.ts', oldString: '\d+', newString: 'N', regex: true }], 5).ok).toBe(true)
    const bad = validateEdits([{ path: 'a.ts', oldString: '(', newString: 'N', regex: true }], 5)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.rejections[0]?.reason).toContain('not a valid regular expression')
  })
  test('applyOne replaces exactly one match by default and all with replaceAll', () => {
    expect(applyOne('a1 b', '\\d+', 'X', false, true)).toBe('aX b')
    expect(applyOne('a1 b22 c333', '\\d+', 'X', true, true)).toBe('aX bX cX')
  })
  test('applyOne expands capture groups in the replacement', () => {
    expect(applyOne('hello world', '(\\w+) (\\w+)', '$2, $1', false, true)).toBe('world, hello')
  })
  test('applyOne rejects a non-matching pattern like a missing literal', () => {
    expect(() => applyOne('abc', 'z+', 'X', false, true)).toThrowError('oldString not found in file')
  })
})
