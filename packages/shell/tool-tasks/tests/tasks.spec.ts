/**
 * Behavior of the task tools' pure helpers: script discovery parsing and
 * output tailing.
 * @module @deepseek-ai/dsh-tool-tasks/tests/tasks.spec
 */

import { describe, expect, test } from 'vitest'
import { parseScripts, tail } from '../src/index.ts'

describe('task tool helpers', () => {
  test('parseScripts extracts script names in declaration order', () => {
    const parsed = parseScripts(JSON.stringify({
      name: 'demo',
      scripts: { build: 'tsc', 'test:unit': 'vitest run', start: 'node .' },
    }))
    expect(parsed).toEqual({ ok: true, scripts: ['build', 'test:unit', 'start'] })
  })

  test('parseScripts accepts a package without scripts and rejects malformed JSON', () => {
    expect(parseScripts('{"name":"x"}')).toEqual({ ok: true, scripts: [] })
    expect(parseScripts('{oops')).toEqual({ ok: false, reason: 'package.json is not valid JSON' })
    expect(parseScripts('{"scripts":[]}').ok).toBe(false)
  })

  test('tail keeps the last maxChars and marks truncation', () => {
    expect(tail('short', 100)).toBe('short')
    const cut = tail('0123456789', 4)
    expect(cut).toBe('…(truncated)\n6789')
  })
})
