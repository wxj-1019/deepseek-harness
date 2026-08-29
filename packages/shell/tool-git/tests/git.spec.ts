/**
 * Behavior of the `git` tool's pure helpers: ref/path validation, per-action
 * command construction with the deployment gates, and porcelain parsing.
 * @module @deepseek-ai/dsh-tool-git/tests/git.spec
 */

import { describe, expect, test } from 'vitest'
import { buildGitCommand, parseStatusPorcelain, validateRef } from '../src/index.ts'

const OPEN_CAPS = { logMaxCount: 20, allowDiscard: true, network: true }
const CLOSED_CAPS = { logMaxCount: 20, allowDiscard: false, network: false }

describe('git tool helpers', () => {
  test('validateRef bans metacharacters, dashes, and blanks', () => {
    expect(validateRef('src/main.ts')).toBe('src/main.ts')
    expect(validateRef('feature/x-1_2')).toBe('feature/x-1_2')
    expect(() => validateRef('')).toThrow('non-empty')
    expect(() => validateRef('-oProxyCommand')).toThrow('dash')
    expect(() => validateRef('a;b')).toThrow('metacharacters')
    expect(() => validateRef('$(calc)')).toThrow('metacharacters')
    expect(() => validateRef('a b')).toThrow('metacharacters')
  })

  test('buildGitCommand builds the read actions', () => {
    expect(buildGitCommand({ action: 'status', paths: [], staged: false }, CLOSED_CAPS).command)
      .toBe('git status --porcelain=v1 -b')
    expect(buildGitCommand({ action: 'diff', paths: [], staged: false }, CLOSED_CAPS).command)
      .toBe('git diff --stat')
    expect(buildGitCommand({ action: 'diff', paths: ['src/a.ts'], staged: true }, CLOSED_CAPS).command)
      .toBe('git diff --stat --cached -- src/a.ts')
    expect(buildGitCommand({ action: 'log', paths: [], staged: false }, CLOSED_CAPS).command)
      .toBe('git log --oneline -n 20')
    expect(buildGitCommand({ action: 'show', paths: [], staged: false, ref: 'HEAD~1' }, CLOSED_CAPS).command)
      .toBe('git show --stat HEAD~1')
  })

  test('buildGitCommand builds the local writes and honors the discard gate', () => {
    expect(buildGitCommand({ action: 'add', paths: ['a.ts', 'b.ts'], staged: false }, CLOSED_CAPS).command)
      .toBe('git add -- a.ts b.ts')
    const commit = buildGitCommand({ action: 'commit', paths: [], staged: false, message: 'fix: it\n\nbody' }, CLOSED_CAPS)
    expect(commit.command).toBe('git commit -F -')
    expect(commit.stdin).toBe('fix: it\n\nbody')
    expect(() => buildGitCommand({ action: 'commit', paths: [], staged: false }, CLOSED_CAPS)).toThrow('message')
    expect(() => buildGitCommand({ action: 'restore', paths: ['a.ts'], staged: false }, CLOSED_CAPS)).toThrow('allowDiscard')
    expect(buildGitCommand({ action: 'restore', paths: ['a.ts'], staged: false }, OPEN_CAPS).command)
      .toBe('git restore -- a.ts')
  })

  test('buildGitCommand gates network actions behind the deployment flag', () => {
    expect(() => buildGitCommand({ action: 'push', paths: [], staged: false }, CLOSED_CAPS)).toThrow('network action')
    expect(buildGitCommand({ action: 'push', paths: [], staged: false }, OPEN_CAPS).command).toBe('git push')
    expect(buildGitCommand({ action: 'fetch', paths: [], staged: false, ref: 'origin' }, OPEN_CAPS).command)
      .toBe('git fetch origin')
  })

  test('parseStatusPorcelain parses XY entries and drops the branch head', () => {
    const text = '## main...origin/main\n M src/a.ts\nA  new.ts\n?? notes.md\n'
    const entries = parseStatusPorcelain(text)
    expect(entries).toEqual([
      { index: ' ', worktree: 'M', path: 'src/a.ts' },
      { index: 'A', worktree: ' ', path: 'new.ts' },
      { index: '?', worktree: '?', path: 'notes.md' },
    ])
  })
})
