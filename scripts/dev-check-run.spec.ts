/**
 * Behavior tests for the dev-check gate wrapper (scripts/dev-check-run.ts):
 * argv validation, the disabled-gate skip path, and exit-code forwarding for
 * the enabled path (exercised with the Node binary itself, so no repo build
 * or shim resolution beyond the platform shell is involved).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatSkipNotice, main, parseInvocation } from './dev-check-run.ts'
import { cleanupDevChecksHomes, makeDevChecksHome } from './dev-checks.testkit.ts'

afterEach(cleanupDevChecksHomes)

describe('parseInvocation', () => {
  it('splits the check key from the wrapped command', () => {
    expect(parseInvocation(['e2e', '--', 'vitest', 'run', '--config', 'vitest.e2e.config.ts'])).toEqual({
      key: 'e2e',
      command: 'vitest',
      args: ['run', '--config', 'vitest.e2e.config.ts'],
    })
  })

  it('rejects a missing key', () => {
    expect(() => parseInvocation([])).toThrow(/missing check key/)
  })

  it('rejects an unknown key, listing the valid ones', () => {
    expect(() => parseInvocation(['lint', '--', 'true'])).toThrow(/unknown check key "lint".*e2e, coverage, snapshot, docSync, buildHygiene, prePushTypecheck/)
  })

  it('rejects a missing separator or an empty command', () => {
    expect(() => parseInvocation(['e2e'])).toThrow(/expected "--"/)
    expect(() => parseInvocation(['e2e', '--'])).toThrow(/expected "--"/)
    expect(() => parseInvocation(['e2e', 'vitest'])).toThrow(/expected "--"/)
  })
})

describe('formatSkipNotice', () => {
  it('names the gate, the settings document, and the skipped command', () => {
    expect(formatSkipNotice('e2e', 'vitest run', '~/.dsh/settings.yaml')).toContain('"e2e" is off in ~/.dsh/settings.yaml; skipped: vitest run')
  })

  it('falls back to the symbolic document path when none was found', () => {
    expect(formatSkipNotice('coverage', 'vitest run --coverage', undefined)).toContain('$DSH_HOME/settings.yaml')
  })
})

describe('main', () => {
  it('exits 2 with a usage error on invalid argv', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(main([], makeDevChecksHome())).toBe(2)
      expect(error).toHaveBeenCalledWith(expect.stringContaining('missing check key'))
    } finally {
      error.mockRestore()
    }
  })

  it('skips a disabled gate with a notice and exit 0 without spawning', () => {
    const env = makeDevChecksHome({ 'settings.yaml': 'dev-checks:\n  e2e: false\n' })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(main(['e2e', '--', 'definitely-not-a-real-binary', '--oops'], env)).toBe(0)
      expect(log).toHaveBeenCalledWith(expect.stringContaining('"e2e" is off'))
    } finally {
      log.mockRestore()
    }
  })

  it('runs an enabled gate and forwards its zero exit code', () => {
    expect(main(['e2e', '--', process.execPath, '-p', '1+1'], makeDevChecksHome())).toBe(0)
  })

  it('forwards a non-zero exit code from the wrapped command', () => {
    expect(main(['e2e', '--', process.execPath, '-p', 'process.exitCode=3'], makeDevChecksHome())).toBe(3)
  })
})
