/**
 * Behavior of the `compact` tool's model-facing failure mapping.
 * @module @deepseek-ai/dsh-tool-compact/tests/compact.spec
 */

import { describe, expect, test } from 'vitest'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { expectedFailureText } from '../src/index.ts'

describe('compact tool failure mapping', () => {
  test('every structured code maps to its human text', () => {
    const err = (code: string): ManualCompactionError => new ManualCompactionError(code as never, code)
    expect(expectedFailureText(err('busy'))).toContain('active compaction')
    expect(expectedFailureText(err('cancelled'))).toContain('cancelled')
    expect(expectedFailureText(err('changed'))).toContain('conversation is unchanged')
    expect(expectedFailureText(err('summary'))).toContain('useful summary')
    expect(expectedFailureText(err('commit'))).toContain('did not finish cleanly')
    expect(expectedFailureText(err('persistence'))).toContain('could not be saved')
  })
})
