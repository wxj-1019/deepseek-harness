import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyTextEdits, planUriToPath } from '@deepseek-ai/dsh-tool-lsp/src/apply-rename.ts'

const range = (sl: number, sc: number, el: number, ec: number) => ({ range: { start: { line: sl, character: sc }, end: { line: el, character: ec } }, newText: 'X' })

describe('applyTextEdits', () => {
  it('folds edits end-of-document first so earlier offsets stay valid', () => {
    const content = 'aa\nbb\ncc'
    // Replace on line 2 first in plan order; the fold must not shift line 0.
    const out = applyTextEdits(content, [range(2, 0, 2, 2), range(0, 0, 0, 2)])
    expect(out).toBe('X\nbb\nX')
  })

  it('inserts when the range is empty', () => {
    expect(applyTextEdits('ab', [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } }, newText: '-' }])).toBe('a-b')
  })

  it('rejects out-of-range lines, characters, and overlaps', () => {
    expect(() => applyTextEdits('ab', [range(5, 0, 5, 1)])).toThrowError(/outside the file/)
    expect(() => applyTextEdits('ab', [range(0, 9, 0, 10)])).toThrowError(/outside line 0/)
    expect(() => applyTextEdits('abcd', [range(0, 0, 0, 3), range(0, 2, 0, 4)])).toThrowError(/overlapping edits/)
  })
})

describe('planUriToPath', () => {
  const root = process.platform === 'win32' ? 'C:\\ws' : '/ws'

  it('converts file URIs inside the workspace', () => {
    expect(planUriToPath(pathToFileURL(root + '\\sub\\a.ts').href.replace(/\\\\/g, '\\'), root)).toContain('a.ts')
  })

  it('rejects non-file schemes and paths outside the workspace', () => {
    expect(() => planUriToPath('https://example.com/a.ts', root)).toThrowError(/not a file: URI/)
    expect(() => planUriToPath(pathToFileURL(process.platform === 'win32' ? 'C:\\elsewhere\\a.ts' : '/elsewhere/a.ts').href, root)).toThrowError(/outside the session workspace/)
  })
})
