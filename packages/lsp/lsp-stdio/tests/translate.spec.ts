import { describe, expect, it, test } from 'vitest'
import {
  negotiatePositionEncoding,
  normalizeHover,
  normalizeLocations,
  requestMethod,
  normalizeDiagnostics,
  normalizeDocumentSymbols,
  normalizeFormattingEdits,
  normalizePublishDiagnostics,
  normalizeWorkspaceEdit,
  normalizeWorkspaceSymbols,
  symbolKindName,
  supportsOperation,
  supportsTransientOpen,
} from '@deepseek-ai/dsh-lsp-stdio'
import type { WireServerCapabilities } from '@deepseek-ai/dsh-lsp-stdio/src/protocol.ts'

const RANGE = { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }

describe('requestMethod', () => {
  it('maps each operation to its textDocument request', () => {
    expect(requestMethod('goToDefinition')).toBe('textDocument/definition')
    expect(requestMethod('findReferences')).toBe('textDocument/references')
    expect(requestMethod('goToImplementation')).toBe('textDocument/implementation')
    expect(requestMethod('hover')).toBe('textDocument/hover')
  })
})

describe('supportsOperation', () => {
  it('reads the provider slot for each operation (boolean and options forms)', () => {
    const caps: WireServerCapabilities = {
      definitionProvider: true,
      referencesProvider: { workDoneProgress: true },
      implementationProvider: false,
    }
    expect(supportsOperation(caps, 'goToDefinition')).toBe(true)
    expect(supportsOperation(caps, 'findReferences')).toBe(true)
    expect(supportsOperation(caps, 'goToImplementation')).toBe(false)
    expect(supportsOperation(caps, 'hover')).toBe(false)
  })
})

describe('supportsTransientOpen', () => {
  it('accepts legacy Full and Incremental enums, rejects None and absent', () => {
    expect(supportsTransientOpen(1)).toBe(true)
    expect(supportsTransientOpen(2)).toBe(true)
    expect(supportsTransientOpen(0)).toBe(false)
    expect(supportsTransientOpen(undefined)).toBe(false)
  })

  it('accepts options with openClose:true and rejects openClose:false', () => {
    expect(supportsTransientOpen({ openClose: true })).toBe(true)
    expect(supportsTransientOpen({ openClose: false, change: 2 })).toBe(false)
  })

  it('requires an explicit openClose for the options form (no change-enum fallback)', () => {
    expect(supportsTransientOpen({ change: 1 })).toBe(false)
    expect(supportsTransientOpen({ change: 2 })).toBe(false)
    expect(supportsTransientOpen({})).toBe(false)
  })
})

describe('negotiatePositionEncoding', () => {
  it('defaults an omitted encoding to utf-16', () => {
    expect(negotiatePositionEncoding(undefined)).toBe('utf-16')
    expect(negotiatePositionEncoding('utf-16')).toBe('utf-16')
  })

  it('rejects any other encoding', () => {
    expect(() => negotiatePositionEncoding('utf-8')).toThrow(/unsupported position encoding/)
  })
})

describe('normalizeLocations', () => {
  it('returns empty only for the protocol no-result value null', () => {
    expect(normalizeLocations(null)).toEqual([])
    expect(() => normalizeLocations(undefined)).toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
  })

  it('maps a single Location', () => {
    expect(normalizeLocations({ uri: 'file:///a', range: RANGE })).toEqual([{ uri: 'file:///a', range: RANGE }])
  })

  it('maps an array of Locations', () => {
    const result = normalizeLocations([{ uri: 'file:///a', range: RANGE }, { uri: 'file:///b', range: RANGE }])
    expect(result.map(l => l.uri)).toEqual(['file:///a', 'file:///b'])
  })

  it('maps a LocationLink from targetUri + targetSelectionRange', () => {
    const link = { targetUri: 'file:///c', targetSelectionRange: RANGE, targetRange: RANGE }
    expect(normalizeLocations([link])).toEqual([{ uri: 'file:///c', range: RANGE }])
  })

  it('rejects a non-object entry', () => {
    expect(() => normalizeLocations([42])).toThrow(/non-object/)
  })

  it('rejects an entry that is neither a Location nor a LocationLink', () => {
    expect(() => normalizeLocations([{ nope: true }])).toThrow(/neither a Location nor a LocationLink/)
  })

  it('rejects a Location whose range is not an object', () => {
    expect(() => normalizeLocations([{ uri: 'file:///a', range: 'nope' }])).toThrow(/neither a Location/)
  })

  it('rejects a Location whose range positions are malformed', () => {
    expect(() => normalizeLocations([{ uri: 'file:///a', range: { start: null, end: null } }])).toThrow(/neither a Location/)
  })

  it('rejects negative and fractional position coordinates', () => {
    expect(() => normalizeLocations([{ uri: 'file:///a', range: { start: { line: -1, character: 0 }, end: RANGE.end } }]))
      .toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
    expect(() => normalizeLocations([{ uri: 'file:///a', range: { start: RANGE.start, end: { line: 1.5, character: 5 } } }]))
      .toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
  })
})

describe('normalizeHover', () => {
  it('returns null for null', () => {
    expect(normalizeHover(null)).toBeNull()
  })

  it('rejects a missing hover result', () => {
    expect(() => normalizeHover(undefined)).toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
  })

  it('reads MarkupContent value and keeps a range', () => {
    expect(normalizeHover({ contents: { kind: 'markdown', value: '# H' }, range: RANGE }))
      .toEqual({ contents: '# H', range: RANGE })
  })

  it('keeps a bare string MarkedString verbatim', () => {
    expect(normalizeHover({ contents: 'plain text' })).toEqual({ contents: 'plain text' })
  })

  it('renders a language-tagged MarkedString object as a fenced code block', () => {
    expect(normalizeHover({ contents: { language: 'ts', value: 'const x = 1' } }))
      .toEqual({ contents: '```ts\nconst x = 1\n```' })
  })

  it('joins a MarkedString array with one blank line', () => {
    expect(normalizeHover({ contents: ['a', { language: 'ts', value: 'b' }] }))
      .toEqual({ contents: 'a\n\n```ts\nb\n```' })
  })

  it('drops an empty-contents hover to null', () => {
    expect(normalizeHover({ contents: { kind: 'plaintext', value: '' } })).toBeNull()
  })

  it('rejects a MarkupContent with a non-string value', () => {
    expect(() => normalizeHover({ contents: { kind: 'markdown', value: 42 } }))
      .toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
  })

  it('rejects a non-object payload', () => {
    expect(() => normalizeHover(42)).toThrow(/was not an object/)
  })

  it('rejects malformed contents', () => {
    expect(() => normalizeHover({ contents: { weird: true } })).toThrow(/were not MarkupContent/)
    expect(() => normalizeHover({ contents: 42 })).toThrow(/were not MarkupContent/)
  })

  it('rejects a malformed MarkedString array member', () => {
    expect(() => normalizeHover({ contents: ['ok', { language: 'ts', value: 42 }] }))
      .toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
    expect(() => normalizeHover({ contents: [null] }))
      .toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
  })

  it('rejects a hover with no contents field', () => {
    expect(() => normalizeHover({ range: RANGE })).toThrow(/no contents/)
  })

  it('rejects a malformed range instead of silently dropping it', () => {
    expect(() => normalizeHover({ contents: 'x', range: { start: { line: 1 } } }))
      .toThrow(expect.objectContaining({ code: 'LSP_MALFORMED_RESPONSE' }))
  })
})

describe('extended operations', () => {
  test('requestMethod and capabilityValue map the four new operations', () => {
    expect(requestMethod('documentSymbol')).toBe('textDocument/documentSymbol')
    expect(requestMethod('workspaceSymbol')).toBe('workspace/symbol')
    expect(requestMethod('diagnostics')).toBe('textDocument/diagnostic')
    expect(requestMethod('rename')).toBe('textDocument/rename')
    const capabilities = {
      documentSymbolProvider: true,
      workspaceSymbolProvider: { workDoneProgress: true },
      diagnosticProvider: { interFileDependencies: false },
      renameProvider: { prepareProvider: false },
    } as unknown as Parameters<typeof supportsOperation>[0]
    expect(supportsOperation(capabilities, 'documentSymbol')).toBe(true)
    expect(supportsOperation(capabilities, 'workspaceSymbol')).toBe(true)
    expect(supportsOperation(capabilities, 'diagnostics')).toBe(true)
    expect(supportsOperation(capabilities, 'rename')).toBe(true)
    expect(supportsOperation({}, 'documentSymbol')).toBe(false)
  })

  test('normalizeDocumentSymbols flattens hierarchical entries with containers', () => {
    const payload = [
      {
        name: 'ClassA', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 9, character: 1 } },
        children: [
          { name: 'methodA', kind: 6, range: { start: { line: 1, character: 2 }, end: { line: 2, character: 3 } } },
        ],
      },
    ]
    const rows = normalizeDocumentSymbols(payload, 'file:///w/a.ts')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'ClassA', uri: 'file:///w/a.ts' })
    expect(rows[1]).toMatchObject({ name: 'methodA', container: 'ClassA', kind: 6 })
  })

  test('normalizeDocumentSymbols accepts flat SymbolInformation and null', () => {
    const flat = [{ name: 'fn', kind: 12, location: { uri: 'file:///w/a.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } } } }]
    expect(normalizeDocumentSymbols(flat, 'file:///w/a.ts')).toHaveLength(1)
    expect(normalizeDocumentSymbols(null, 'file:///w/a.ts')).toEqual([])
    expect(() => normalizeDocumentSymbols([{}], 'file:///w/a.ts')).toThrow(/lacked a name or kind/)
  })

  test('normalizeWorkspaceSymbols flattens SymbolInformation with containers', () => {
    const payload = [
      { name: 'helper', kind: 12, containerName: 'Utils', location: { uri: 'file:///w/u.ts', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 6 } } } },
    ]
    const rows = normalizeWorkspaceSymbols(payload)
    expect(rows).toMatchObject([{ name: 'helper', container: 'Utils', uri: 'file:///w/u.ts' }])
    expect(normalizeWorkspaceSymbols(null)).toEqual([])
    expect(() => normalizeWorkspaceSymbols([{ name: 'x' }])).toThrow(/malformed SymbolInformation/)
  })

  test('normalizeDiagnostics reads full reports and yields empty for unchanged or null', () => {
    const report = {
      kind: 'full',
      items: [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, message: 'x is not defined', severity: 1, source: 'ts' },
      ],
    }
    const rows = normalizeDiagnostics(report)
    expect(rows).toMatchObject([{ message: 'x is not defined', severity: 1 }])
    expect(normalizeDiagnostics({ kind: 'unchanged' })).toEqual([])
    expect(normalizeDiagnostics(null)).toEqual([])
    expect(() => normalizeDiagnostics({ kind: 'full', items: [{}] })).toThrow(/malformed/)
  })

  test('normalizeWorkspaceEdit flattens per-file changes and rejects documentChanges', () => {
    const payload = {
      changes: {
        'file:///w/a.ts': [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'beta' },
        ],
        'file:///w/b.ts': [
          { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } }, newText: 'gamma' },
        ],
      },
    }
    const plan = normalizeWorkspaceEdit(payload)
    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ uri: 'file:///w/a.ts', edits: [{ newText: 'beta' }] })
    expect(normalizeWorkspaceEdit(null)).toEqual([])
    expect(() => normalizeWorkspaceEdit({ documentChanges: [] })).toThrow(/documentChanges/)
  })

  test('symbolKindName resolves known kinds and falls back for unknown ones', () => {
    expect(symbolKindName(12)).toBe('Function')
    expect(symbolKindName(5)).toBe('Class')
    expect(symbolKindName(99)).toBe('99')
  })
})

describe('formatting', () => {
  it('maps formatting to its request and capability slot', () => {
    expect(requestMethod('formatting')).toBe('textDocument/formatting')
    expect(supportsOperation({ documentFormattingProvider: true }, 'formatting')).toBe(true)
    expect(supportsOperation({ documentFormattingProvider: { workDoneProgress: true } }, 'formatting')).toBe(true)
    expect(supportsOperation({}, 'formatting')).toBe(false)
  })

  it('normalizeFormattingEdits wraps the document TextEdits as a single-file plan and accepts null', () => {
    expect(normalizeFormattingEdits(null, 'file:///ws/a.ts')).toEqual([])
    expect(normalizeFormattingEdits([{ range: RANGE, newText: '  x' }], 'file:///ws/a.ts')).toEqual([
      { uri: 'file:///ws/a.ts', edits: [{ range: RANGE, newText: '  x' }] },
    ])
  })

  it('normalizeFormattingEdits rejects non-array payloads and malformed edits', () => {
    expect(() => normalizeFormattingEdits({}, 'file:///ws/a.ts')).toThrowError(/was not an array/)
    expect(() => normalizeFormattingEdits([{ range: { start: { line: 0 } }, newText: 'x' }], 'file:///ws/a.ts')).toThrowError(/malformed TextEdit/)
  })
})

describe('normalizePublishDiagnostics', () => {
  it('normalizes the pushed array per document URI and defaults absent diagnostics', () => {
    expect(normalizePublishDiagnostics({ uri: 'file:///ws/a.ts', diagnostics: [{ range: RANGE, message: 'boom', severity: 1 }] })).toEqual({
      uri: 'file:///ws/a.ts',
      diagnostics: [{ range: RANGE, message: 'boom', severity: 1 }],
    })
    expect(normalizePublishDiagnostics({ uri: 'file:///ws/a.ts' })).toEqual({ uri: 'file:///ws/a.ts', diagnostics: [] })
  })

  it('rejects missing params, URIs, and malformed entries', () => {
    expect(() => normalizePublishDiagnostics(null)).toThrowError(/were not an object/)
    expect(() => normalizePublishDiagnostics({})).toThrowError(/no document URI/)
    expect(() => normalizePublishDiagnostics({ uri: 'file:///ws/a.ts', diagnostics: [{ message: 'no range' }] })).toThrowError(/malformed entry/)
  })
})
