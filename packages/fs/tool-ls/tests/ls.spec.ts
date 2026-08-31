/**
 * Behavior of the `ls` tool's pure helpers: argument validation, entry
 * ordering, and listing formatting.
 * @module @deepseek-ai/dsh-tool-ls/tests/ls.spec
 */

import { describe, expect, test } from 'vitest'
import { collectTree, formatListing, parseLsArgs, sortEntries } from '../src/index.ts'

describe('ls tool helpers', () => {
  test('parseLsArgs accepts an omitted path and rejects a blank one', () => {
    expect(parseLsArgs({})).toEqual({ all: false, depth: 0 })
    expect(parseLsArgs({ path: 'src', all: true })).toEqual({ path: 'src', all: true, depth: 0 })
    expect(() => parseLsArgs({ path: '   ' })).toThrow('non-empty')
  })

  test('sortEntries orders directories first then names case-insensitively', () => {
    const sorted = sortEntries([
      { name: 'README.md', type: 'file' },
      { name: 'assets', type: 'directory' },
      { name: 'apple.txt', type: 'file' },
      { name: '.config', type: 'directory' },
    ])
    expect(sorted.map(entry => entry.name)).toEqual(['.config', 'assets', 'apple.txt', 'README.md'])
  })

  test('formatListing marks directories, shows sizes, and notes dropped entries', () => {
    const text = formatListing([
      { name: 'src/', type: 'directory' },
      { name: 'a.txt', type: 'file', size: 12 },
    ], 500)
    expect(text).toContain('src/')
    expect(text).toContain('a.txt (12 bytes)')
    expect(text).not.toContain('more entries')

    const dropped = formatListing(
      Array.from({ length: 4 }, (_, index) => ({ name: `f${index}`, type: 'file' })),
      2,
    )
    expect(dropped).toContain('f0')
    expect(dropped).toContain('f1')
    expect(dropped).toContain('+2 more entries not shown')
  })

  test('formatListing renders an empty directory', () => {
    expect(formatListing([], 500)).toBe('(empty directory)')
  })
})

describe('collectTree', () => {
  test('walks depth levels as flat rows with relative paths', async () => {
    const tree: Record<string, string[]> = {
      '': ['src', 'a.txt'],
      src: ['util', 'index.ts'],
      'src/util': ['helper.ts'],
    }
    const listDir = async (dir: string): Promise<readonly { name: string; type: string; size?: number }[]> =>
      (tree[dir] ?? []).map(name => ({ name, type: name.includes('.') ? 'file' : 'directory' }))
    const flat = await collectTree('', 0, true, 500, listDir)
    expect(flat.rows.map(row => row.path)).toEqual(['src', 'a.txt'])
    const deep = await collectTree('', 1, true, 500, listDir)
    expect(deep.rows.map(row => row.path)).toEqual(['src', 'a.txt', 'src/util', 'src/index.ts'])
  })
  test('stops descending when the entry budget runs out', async () => {
    const tree: Record<string, string[]> = { '': ['a', 'b'], a: ['x', 'y'] }
    const listDir = async (dir: string): Promise<readonly { name: string; type: string; size?: number }[]> =>
      (tree[dir] ?? []).map(name => ({ name, type: 'directory' }))
    const result = await collectTree('', 2, true, 2, listDir)
    expect(result.truncated).toBe(true)
    expect(result.rows.map(row => row.path)).toEqual(['a', 'b'])
  })
})
