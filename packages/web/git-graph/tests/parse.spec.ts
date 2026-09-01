import { describe, expect, it } from 'vitest'
import { parseBranchNames, parseGraphLogLines } from '../src/parse.ts'

describe('git-graph parsing', () => {
  it('parses graph log rows with parents and commit time', () => {
    const rows = parseGraphLogLines(
      'abc1234\x1fFirst subject\x1fAlice\x1f2024-01-01 10:00:00 +0800\x1fabc1234def5678abc1234def5678abc1234def5678\x1fHEAD -> main, origin/main\x1fdef5678abc1234def5678abc1234def5678abc1234\x1f1704093600\n'
      + 'def5678\x1fSecond subject\x1fBob\x1f2024-01-02 10:00:00 +0800\x1fdef5678abc1234def5678abc1234def5678abc1234\x1f\x1f\x1f1704180000\n'
      + 'eee9999\x1fRoot subject\x1fCara\x1f2024-01-03 10:00:00 +0800\x1feee9999000aaaabbbbccccddddeeeeffff\x1f\x1f\x1f1704266400\n',
    )
    expect(rows).toEqual([
      {
        hash: 'abc1234',
        subject: 'First subject',
        author: 'Alice',
        date: '2024-01-01 10:00:00 +0800',
        hashFull: 'abc1234def5678abc1234def5678abc1234def5678',
        refs: 'HEAD -> main, origin/main',
        parents: ['def5678abc1234def5678abc1234def5678abc1234'],
        commitTime: 1704093600,
      },
      {
        hash: 'def5678',
        subject: 'Second subject',
        author: 'Bob',
        date: '2024-01-02 10:00:00 +0800',
        hashFull: 'def5678abc1234def5678abc1234def5678abc1234',
        refs: '',
        parents: [],
        commitTime: 1704180000,
      },
      {
        hash: 'eee9999',
        subject: 'Root subject',
        author: 'Cara',
        date: '2024-01-03 10:00:00 +0800',
        hashFull: 'eee9999000aaaabbbbccccddddeeeeffff',
        refs: '',
        parents: [],
        commitTime: 1704266400,
      },
    ])
  })

  it('skips malformed lines defensively', () => {
    expect(parseGraphLogLines('only-hash\n')).toEqual([])
    expect(parseGraphLogLines('')).toEqual([])
  })

  it('parses branch names and drops the current-branch marker', () => {
    expect(parseBranchNames('main' + String.fromCharCode(10) + 'feature/x' + String.fromCharCode(10) + 'dev' + String.fromCharCode(10))).toEqual(['main', 'feature/x', 'dev'])
    expect(parseBranchNames('')).toEqual([])
  })
})
